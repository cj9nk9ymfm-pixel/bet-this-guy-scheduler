const assert=require('node:assert/strict'),vm=require('node:vm'),{webcrypto}=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const {read}=require('./helpers/client.cjs');
// Game lines (shadow) and stadium weather.
const context=vm.createContext({URL,URLSearchParams,Request,Response,Headers,AbortSignal,Date,console,setTimeout,clearTimeout,crypto:webcrypto,TextEncoder,btoa,atob});
const template=read('worker/index.template.js');
vm.runInContext(template.slice(template.indexOf('const API_BASE')).replace('__MOVEMENT_SERVER__',read('worker/movement.js')).replace('__LIVE_SERVER__',read('worker/live.js')).replace('__STATS_SHARED__',read('dist/stats.js')).replace('__RECORDS_SERVER__',read('worker/records.js')).replace('__ACCOUNTS_SERVER__',read('worker/accounts.js')).replace('export default {','this.worker={'),context);
const db=new DatabaseSync(':memory:');
for(const f of ['0006_app_settings.sql','0023_game_lines.sql'].map(f=>require('node:fs').readdirSync('drizzle').find(x=>x.startsWith(f.slice(0,4)))))db.exec(read('drizzle/'+f).replaceAll('--> statement-breakpoint',''));
const wrap=(sql,args=[])=>({bind(...values){return wrap(sql,values)},async first(){return db.prepare(sql).get(...args)||null},async all(){return{results:db.prepare(sql).all(...args)}},async run(){const r=db.prepare(sql).run(...args);return{success:true,meta:{changes:Number(r.changes)}}}});
context.env={DB:{prepare:sql=>wrap(sql),async batch(list){for(const s of list)await s.run()}},THE_ODDS_API_KEY:'k',BALLDONTLIE_API_KEY:'b'};
const run=code=>vm.runInContext(code,context),J=v=>JSON.parse(JSON.stringify(v));
(async()=>{
  const now=Date.parse('2026-10-11T12:00:00Z'),kick='2026-10-11T17:00:00Z',upd=new Date(now-60000).toISOString();
  const book=(key,ml,spread,total)=>({key,title:key,last_update:upd,markets:[
    {key:'h2h',last_update:upd,outcomes:[{name:'New England Patriots',price:ml[0]},{name:'Las Vegas Raiders',price:ml[1]}]},
    {key:'spreads',last_update:upd,outcomes:[{name:'New England Patriots',price:spread[0],point:-3.5},{name:'Las Vegas Raiders',price:spread[1],point:3.5}]},
    {key:'totals',last_update:upd,outcomes:[{name:'Over',price:total[0],point:44.5},{name:'Under',price:total[1],point:44.5}]}]});
  // BetMGM hangs a better Raiders moneyline (+175 vs ~+150 fair); spreads and totals are fair everywhere.
  const event={id:'g1',commence_time:kick,home_team:'New England Patriots',away_team:'Las Vegas Raiders',bookmakers:[book('draftkings',[-180,150],[-110,-110],[-110,-110]),book('fanduel',[-178,148],[-110,-110],[-110,-110]),book('betrivers',[-182,152],[-110,-110],[-110,-110]),book('betmgm',[-200,175],[-110,-110],[-110,-110])]};
  context.events=[event];
  let picks=J(run(`gameLineCandidates(events,${now})`));
  assert.equal(picks.length,1,'only the mispriced side qualifies');
  assert.deepEqual([picks[0].market,picks[0].side,picks[0].line,picks[0].odds,picks[0].book],['Moneyline','Las Vegas Raiders',null,175,'betmgm']);
  // Results from final scores.
  const R=(m,side,line,hs,as)=>run(`gameLineResult(${JSON.stringify({market:m,side,line,home:'H',away:'A'})},${hs},${as})`);
  assert.equal(R('Moneyline','A',null,20,24),'won');assert.equal(R('Spread','H',-3.5,24,20),'won');assert.equal(R('Spread','H',-3.5,23,20),'lost');
  assert.equal(R('Spread','A',3,23,20),'push');assert.equal(R('Total','Over',44.5,24,21),'won');assert.equal(R('Total','Under',44.5,24,21),'lost');
  // Logging: fetch stubbed; throttled to one call per window.
  let oddsCalls=0;
  context.fetch=async url=>{url=String(url);
    if(url.includes('the-odds-api.com')){oddsCalls++;assert.ok(url.includes('markets=h2h%2Cspreads%2Ctotals'));return new Response(JSON.stringify(context.events))}
    if(url.includes('balldontlie'))return new Response(JSON.stringify({data:[{home_team:{full_name:'New England Patriots'},visitor_team:{full_name:'Las Vegas Raiders'},home_team_score:17,visitor_team_score:24,status:'Final'}]}));
    if(url.includes('open-meteo')){const times=[...Array(24)].map((_,h)=>`2026-10-11T${String(h).padStart(2,'0')}:00`);return new Response(JSON.stringify({hourly:{time:times,temperature_2m:times.map(()=>48),wind_speed_10m:times.map((_,h)=>h===18?22:9),wind_gusts_10m:times.map(()=>30),precipitation_probability:times.map(()=>20)}}))}
    return new Response(null,{status:404})};
  let out=J(await run(`recordGameShadow(env,${now})`));assert.deepEqual(out,{games:1,qualified:1,tracked:0},'tracking starts on the next run');
  out=J(await run(`recordGameShadow(env,${now+120000})`));assert.deepEqual(out,{skipped:true});assert.equal(oddsCalls,1);
  // The price moves before kickoff: the close is tracked.
  event.bookmakers[3].markets[0].outcomes[1].price=160;
  await run(`recordGameShadow(env,${now+40*60000})`);
  assert.equal(db.prepare('SELECT close_odds FROM game_shadow').get().close_odds,160);
  out=J(await run(`gradeGameShadow(env,${Date.parse(kick)+5*3600000})`));assert.equal(out.graded,1);
  assert.deepEqual(J(db.prepare('SELECT result,home_score,away_score FROM game_shadow').get()),{result:'won',home_score:17,away_score:24});
  // Weather: outdoor stadiums only, the game's three hours, not international slots.
  context.games=[{eventID:'NFL--g1',home:'New England Patriots',startsAt:kick},{eventID:'NFL--g2',home:'Detroit Lions',startsAt:kick},{eventID:'NFL--g3',home:'Jacksonville Jaguars',startsAt:'2026-10-11T13:30:00Z'}];
  out=J(await run(`refreshWeather(env,games,${now})`));assert.deepEqual(out,{fetched:1,saved:1},'domes and London games are skipped');
  assert.deepEqual(J(db.prepare('SELECT stadium,temp_f,wind_mph,gust_mph,precip_pct FROM game_weather').get()),{stadium:'Gillette Stadium',temp_f:48,wind_mph:22,gust_mph:30,precip_pct:20});
  out=J(await run(`refreshWeather(env,games,${now+600000})`));assert.equal(out.fetched,0,'refreshed every two hours, not every run');
  const body=await (await run(`weatherResponse(new Request('https://betthisguy.com/api/weather'),env,{waitUntil(){}},${now})`)).json();
  assert.equal(body.games['NFL--g1'].wind,22);
  console.log('PASS: game lines log mispriced sides, track the close and grade from final scores; weather covers outdoor games only');
})().catch(error=>{console.error(error);process.exit(1)});
