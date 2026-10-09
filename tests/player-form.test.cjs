const assert=require('node:assert/strict'),vm=require('node:vm'),{webcrypto}=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const {read}=require('./helpers/client.cjs');
// Player form: publish runs list who's on the board and their markets; quiet
// cron runs fetch each player's last 10 games a few at a time; /api/form
// serves them all in one cached response for the board cards.
const context=vm.createContext({URL,URLSearchParams,Request,Response,Headers,AbortSignal,Date,console,setTimeout,clearTimeout,crypto:webcrypto,TextEncoder,btoa,atob,fetch:async()=>new Response(null,{status:404})});
const template=read('worker/index.template.js');
vm.runInContext(template.slice(template.indexOf('const API_BASE')).replace('__MOVEMENT_SERVER__',read('worker/movement.js')).replace('__LIVE_SERVER__',read('worker/live.js')).replace('__STATS_SHARED__',read('dist/stats.js')).replace('__RECORDS_SERVER__',read('worker/records.js')).replace('__ACCOUNTS_SERVER__',read('worker/accounts.js')).replace('export default {','this.worker={'),context);
const db=new DatabaseSync(':memory:');
db.exec(read('drizzle/0018_player_form.sql').replaceAll('--> statement-breakpoint',''));
const wrap=(sql,args=[])=>({bind(...values){return wrap(sql,values)},async first(){return db.prepare(sql).get(...args)||null},async all(){return{results:db.prepare(sql).all(...args)}},async run(){const r=db.prepare(sql).run(...args);return{success:true,meta:{changes:Number(r.changes)}}}});
context.env={DB:{prepare:sql=>wrap(sql),async batch(list){for(const s of list)await s.run()}},BALLDONTLIE_API_KEY:'test'};
const run=code=>vm.runInContext(code,context),J=v=>JSON.parse(JSON.stringify(v));
(async()=>{
  // Wednesday Oct 7, after the Tuesday refresh line; the game is Sunday.
  const now=Date.parse('2026-10-07T15:00:00Z'),kickoff='2026-10-11T17:00:00.000Z';
  const market=(key,player,point)=>({key,outcomes:[{name:'Over',description:player,point,price:-110},{name:'Under',description:player,point,price:-110}]});
  const board=(markets,t=kickoff)=>({id:'g1',commence_time:t,home_team:'Pittsburgh Steelers',away_team:'Cleveland Browns',bookmakers:[{key:'draftkings',markets}]});
  context.boards=[board([market('player_rush_yds','Nick Chubb',62.5),market('player_receptions','Jerry Jeudy',5.5),market('player_reception_yds','Jerry Jeudy',60.5),market('player_1st_td','Jerry Jeudy',0.5)])];
  let out=J(await run(`recordFormWanted(env,boards,${now})`));
  assert.deepEqual(out,{added:2,updated:0});
  const jeudy=db.prepare("SELECT * FROM player_form WHERE id='NFL|jerryjeudy'").get();
  assert.deepEqual(JSON.parse(jeudy.markets),['Receiving Yards','Receptions'],'only markets a box score can grade');
  assert.equal(jeudy.teams,'Cleveland Browns @ Pittsburgh Steelers');assert.equal(jeudy.wanted_until,kickoff);
  out=J(await run(`recordFormWanted(env,boards,${now+600000})`));assert.deepEqual(out,{added:0,updated:0},'no writes when nothing changed');

  const asked=[],ages=[];
  context.playerStats=async(req,env,ctx,opts)=>{const u=new URL(req.url),name=u.searchParams.get('player');asked.push(name);ages.push(opts?.maxAge);
    if(name==='Nick Chubb')return Response.json({success:false,error:'busy'},{status:429});
    const stats=[3,9,6,4,7,5,8,2,6,5,4,7].map((x,i)=>({game:{date:new Date(now-(i+1)*7*86400000).toISOString(),home_team:{id:5,abbreviation:'PIT'},visitor_team:{id:i%2?9:7,abbreviation:i%2?'BAL':'CIN'}},receptions:x,receiving_yards:x*12}));
    stats.unshift({game:{date:'2026-10-11T17:00:00Z'},receptions:99,receiving_yards:999});
    return Response.json({success:true,player:{team:{id:5,full_name:'Pittsburgh Steelers'}},stats})};
  run('playerStats=globalThis.playerStats');
  out=J(await run(`fillPlayerForm(env,{waitUntil(){}},${now})`));
  assert.deepEqual(out,{filled:1,tried:2});
  assert.ok(ages.every(a=>a>0&&a<=now-Date.parse('2026-10-06T12:00:00Z')),'never reuses stats cached before the Tuesday refresh');
  const form=JSON.parse(db.prepare("SELECT games_json FROM player_form WHERE id='NFL|jerryjeudy'").get().games_json);
  assert.equal(form.d.length,10,'last 10 games, none after now');
  assert.deepEqual(form.m.Receptions,[3,9,6,4,7,5,8,2,6,5]);assert.equal(form.m['Receiving Yards'][0],36);
  assert.deepEqual(form.o.slice(0,2),['vs CIN','vs BAL']);
  assert.equal(db.prepare("SELECT failures FROM player_form WHERE id='NFL|nickchubb'").get().failures,1,'a failed lookup is retried later');
  asked.length=0;out=J(await run(`fillPlayerForm(env,{waitUntil(){}},${now+300000})`));
  assert.deepEqual(asked,['Nick Chubb'],'filled players wait for the next slate');
  // Friday after 12:00 UTC: the Thursday games are in, so everyone refreshes.
  asked.length=0;await run(`fillPlayerForm(env,{waitUntil(){}},${Date.parse('2026-10-09T13:00:00Z')})`);
  assert.ok(asked.includes('Jerry Jeudy'));
  // Three failures and the player is skipped until their next game.
  await run(`fillPlayerForm(env,{waitUntil(){}},${now+600000})`);
  asked.length=0;await run(`fillPlayerForm(env,{waitUntil(){}},${now+900000})`);assert.ok(!asked.includes('Nick Chubb'));
  // A new market on the board means the player is worked out again.
  context.boards=[board([market('player_rush_yds','Nick Chubb',62.5),market('player_receptions','Jerry Jeudy',5.5),market('player_reception_yds','Jerry Jeudy',60.5),market('player_reception_tds','Jerry Jeudy',0.5)])];
  out=J(await run(`recordFormWanted(env,boards,${now+1200000})`));assert.equal(out.updated,1);
  assert.equal(db.prepare("SELECT fetched_at FROM player_form WHERE id='NFL|jerryjeudy'").get().fetched_at,null);
  // Next week: a later game resets the failure count.
  context.boards=[board([market('player_rush_yds','Nick Chubb',60.5)],'2026-10-18T17:00:00.000Z')];
  await run(`recordFormWanted(env,boards,${Date.parse('2026-10-13T15:00:00Z')})`);
  assert.deepEqual(J(db.prepare("SELECT wanted_until,failures FROM player_form WHERE id='NFL|nickchubb'").get()),{wanted_until:'2026-10-18T17:00:00.000Z',failures:0});

  // /api/form: every board player with games, keyed by normalized name.
  await run(`fillPlayerForm(env,{waitUntil(){}},${Date.parse('2026-10-09T13:00:00Z')})`);
  const res=await run(`playerFormResponse(new Request('https://betthisguy.com/api/form'),env,{waitUntil(){}},${Date.parse('2026-10-09T13:00:00Z')})`);
  const body=await res.json();
  assert.equal(body.success,true);assert.ok(body.players.jerryjeudy.m.Receptions.length===10);
  assert.ok(!('nickchubb' in body.players),'players without games are left out');
  console.log('PASS: player form lists board players, fills a few per run, refreshes once per slate and serves one cached board-wide response');
})().catch(error=>{console.error(error);process.exit(1)});
