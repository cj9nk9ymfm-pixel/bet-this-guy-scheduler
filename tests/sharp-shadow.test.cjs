const assert=require('node:assert/strict'),vm=require('node:vm'),{webcrypto}=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const {read}=require('./helpers/client.cjs');
// Sharp-book shadow: props the engine rates 0.25%+ inside 24 hours of the
// game are logged with Pinnacle's no-vig fair chance beside ours (one feed
// call per game every 2 hours), closing-priced and never posted.
const calls=[];
const context=vm.createContext({URL,URLSearchParams,Request,Response,Headers,AbortSignal,Date,console,setTimeout,clearTimeout,crypto:webcrypto,TextEncoder,btoa,atob});
const template=read('worker/index.template.js');
vm.runInContext(template.slice(template.indexOf('const API_BASE')).replace('__MOVEMENT_SERVER__',read('worker/movement.js')).replace('__LIVE_SERVER__',read('worker/live.js')).replace('__STATS_SHARED__',read('dist/stats.js')).replace('__RECORDS_SERVER__',read('worker/records.js')).replace('__ACCOUNTS_SERVER__',read('worker/accounts.js')).replace('export default {','this.worker={'),context);
const db=new DatabaseSync(':memory:');
for(const f of ['0000_public_record.sql','0001_record_settlement.sql','0002_historical_replays.sql','0006_push_alerts.sql','0038_sharp_shadow.sql','0039_sharp_spread.sql','0040_teammate_move.sql','0041_sharp_devig.sql'])db.exec(read('drizzle/'+f).replaceAll('--> statement-breakpoint',''));
const wrap=(sql,args=[])=>({bind(...values){return wrap(sql,values)},async first(){return db.prepare(sql).get(...args)||null},async all(){return{results:db.prepare(sql).all(...args)}},async run(){const r=db.prepare(sql).run(...args);return{success:true,meta:{changes:Number(r.changes)}}}});
context.env={DB:{prepare:sql=>wrap(sql),async batch(list){for(const s of list)await s.run()}},THE_ODDS_API_KEY:'k'};
const run=code=>vm.runInContext(code,context);
(async()=>{
  const now=Date.parse('2026-10-25T12:00:00Z'),fresh=new Date(now-60000).toISOString(),kickoff=new Date(now+5*3600000).toISOString();
  const market=(player,over,under)=>({key:'player_receptions',last_update:fresh,outcomes:[{name:'Over',description:player,point:4.5,price:over},{name:'Under',description:player,point:4.5,price:under}]});
  // Three books at -110/-110 and DraftKings soft on the Over (about 2%).
  const books=[['fanduel','FanDuel'],['betmgm','BetMGM'],['williamhill_us','Caesars'],['draftkings','DraftKings']].map(([key,title])=>({key,title,last_update:fresh,markets:[key==='draftkings'?market('Puka Nacua',110,-130):market('Puka Nacua',-110,-110)]}));
  context.boards=[{id:'g1',eventID:'NFL--g1',sport_label:'NFL',commence_time:kickoff,home_team:'Los Angeles Rams',away_team:'Seattle Seahawks',bookmakers:books}];
  // Pinnacle: Over -125 / Under +105 (53.25% fair on the Over).
  context.fetch=async url=>{calls.push(String(url));return Response.json({bookmakers:[{key:'pinnacle',markets:[{key:'player_receptions',outcomes:[{name:'Over',description:'Puka Nacua',point:4.5,price:-125},{name:'Under',description:'Puka Nacua',point:4.5,price:105}]},{key:'spreads',outcomes:[{name:'Los Angeles Rams',point:-11.5,price:-110},{name:'Seattle Seahawks',point:11.5,price:-110}]}]}]})};
  run('fetch=globalThis.fetch');
  const out=JSON.parse(JSON.stringify(await run(`recordSharpShadow(env,boards,${now})`)));
  assert.equal(out.pulled,1);assert.match(calls[0],/bookmakers=pinnacle/);assert.match(calls[0],/markets=player_receptions%2Cspreads/);
  const r=db.prepare('SELECT * FROM sharp_shadow').get();
  assert.deepEqual([r.sport,r.player,r.side,r.line,r.odds,r.book],['NFL','Puka Nacua','Over',4.5,110,'DraftKings']);
  assert.ok(r.edge>1,'our 5-book edge is kept');
  assert.ok(Math.abs(r.pin_fair-53.25)<.05,`Pinnacle no-vig fair ${r.pin_fair}`);
  assert.ok(Math.abs(r.pin_edge-(r.pin_fair-100/2.1))<.05,'edge against Pinnacle at our price');
  assert.equal(r.pin_spread,-11.5,'Pinnacle home spread for the blowout check');
  // Final margin from the player's team's side (home win by 12; road player lost by 12).
  const mg=g=>JSON.parse(JSON.stringify(run(`sharpMargin(${JSON.stringify(g)})`)));
  const game={home_team_id:1,visitor_team_id:2,home_team_score:120,visitor_team_score:108};
  assert.deepEqual(mg({game,team:{id:1}}),{home:1,margin:12});assert.deepEqual(mg({game,team:{id:2}}),{home:0,margin:-12});
  assert.equal(mg({game:{...game,home_team_score:0,visitor_team_score:0},team:{id:1}}),null,'no score yet');
  // Within 2 hours: no second feed call; the row isn't duplicated.
  await run(`recordSharpShadow(env,boards,${now+3600000})`);assert.equal(calls.length,1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM sharp_shadow').get().n,1);
  assert.equal(db.prepare('SELECT close_odds FROM sharp_shadow').get().close_odds,110,'closing price tracked each run');
  assert.equal(db.prepare('SELECT move_odds FROM sharp_shadow').get().move_odds,110,'market-moving test: the price about an hour after logging');
  // Shadow de-vig and CLV columns: power and Shin fair below the plain split
  // for the plus-money Over, the books' fair at tip-off, Pinnacle's first price.
  const d=db.prepare('SELECT * FROM sharp_shadow').get();
  assert.ok(d.fair_power>0&&d.fair_shin>0&&d.fair_power<=d.edge+100/2.1+.01,'power/Shin fair logged');
  assert.ok(Math.abs(d.close_fair-48.93)<.05,`close fair ${d.close_fair}`);
  assert.ok(Math.abs(d.pin_first-53.25)<.05&&d.pin_close===null,'first sharp price kept; no close yet');
  // Inside the last hour: one more pull for the sharp closing price.
  await run(`recordSharpShadow(env,boards,${now+4.5*3600000})`);assert.equal(calls.length,2,'closing pull');
  assert.ok(Math.abs(db.prepare('SELECT pin_close FROM sharp_shadow').get().pin_close-53.25)<.05,'sharp close logged');
  await run(`recordSharpShadow(env,boards,${now+4.8*3600000})`);assert.equal(calls.length,2,'only one closing pull');
  // A game more than 24 hours out isn't pulled.
  context.later=[{...context.boards[0],eventID:'NFL--g2',id:'g2',commence_time:new Date(now+30*3600000).toISOString()}];
  assert.equal(JSON.parse(JSON.stringify(await run(`recordSharpShadow(env,later,${now})`))).games,0);
  console.log('PASS: sharp-book shadow logs 0.25%+ props inside 24 hours with Pinnacle no-vig fair and edge, closing price, one feed call per game every 2 hours');
})().catch(e=>{console.error(e);process.exit(1)});
