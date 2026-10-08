const assert=require('node:assert/strict'),vm=require('node:vm'),{webcrypto}=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const {read}=require('./helpers/client.cjs');
// Near-miss shadow: props that pass every official rule but the edge
// (0.5% to just under 1%) are logged with their closing price and graded,
// never posted, to test whether a lower bar would pay.
const context=vm.createContext({URL,URLSearchParams,Request,Response,Headers,AbortSignal,Date,console,setTimeout,clearTimeout,crypto:webcrypto,TextEncoder,btoa,atob,fetch:async()=>new Response(null,{status:404})});
const template=read('worker/index.template.js');
vm.runInContext(template.slice(template.indexOf('const API_BASE')).replace('__MOVEMENT_SERVER__',read('worker/movement.js')).replace('__LIVE_SERVER__',read('worker/live.js')).replace('__STATS_SHARED__',read('dist/stats.js')).replace('__RECORDS_SERVER__',read('worker/records.js')).replace('__ACCOUNTS_SERVER__',read('worker/accounts.js')).replace('export default {','this.worker={'),context);
const db=new DatabaseSync(':memory:');
for(const f of ['0000_public_record.sql','0001_record_settlement.sql','0002_historical_replays.sql','0015_near_shadow.sql'])db.exec(read('drizzle/'+f).replaceAll('--> statement-breakpoint',''));
const wrap=(sql,args=[])=>({bind(...values){return wrap(sql,values)},async first(){return db.prepare(sql).get(...args)||null},async all(){return{results:db.prepare(sql).all(...args)}},async run(){const r=db.prepare(sql).run(...args);return{success:true,meta:{changes:Number(r.changes)}}}});
context.env={DB:{prepare:sql=>wrap(sql),async batch(list){for(const s of list)await s.run()}}};
const run=code=>vm.runInContext(code,context);
(async()=>{
  const now=Date.parse('2026-10-08T12:00:00Z'),fresh=new Date(now-60000).toISOString(),kickoff=new Date(now+5*3600000).toISOString();
  const market=(key,player,over,under,point)=>({key,last_update:fresh,outcomes:[{name:'Over',description:player,point,price:over},{name:'Under',description:player,point,price:under}]});
  // Three books at -110/-110; DraftKings is a little soft on the Over.
  const props=(soft)=>[['fanduel','FanDuel'],['betmgm','BetMGM'],['williamhill_us','Caesars'],['draftkings','DraftKings']].map(([key,title])=>({key,title,last_update:fresh,markets:Object.entries(soft).map(([player,[mk,point,over,under]])=>key==='draftkings'?market(mk,player,over,under,point):market(mk,player,-110,-110,point))}));
  const board=soft=>({id:'evt1',eventID:'NFL--evt1',sport_label:'NFL',commence_time:kickoff,home_team:'Pittsburgh Steelers',away_team:'Cleveland Browns',bookmakers:props(soft)});
  // Rodgers: 0.73% (near miss). Chubb: about 1.8% (official). Njoku: about 0.3% (too thin).
  context.boards=[board({'Aaron Rodgers':['player_pass_yds',215.5,106,-120],'Nick Chubb':['player_rush_yds',62.5,110,-120],'David Njoku':['player_receptions',3.5,104,-120]})];
  const official=run(`officialCandidates(boards,${now})`);
  assert.equal(JSON.stringify(official.map(p=>p.player)),'["Nick Chubb"]','the official bar is unchanged');
  context.official=official;
  let out=await run(`recordNearShadow(env,boards,official,${now})`);
  assert.equal(out.logged,1);
  let rows=db.prepare('SELECT * FROM near_shadow').all();
  assert.equal(rows.length,1);
  const r=rows[0];
  assert.deepEqual([r.player,r.side,r.line,r.odds,r.book,r.market],['Aaron Rodgers','Over',215.5,106,'DraftKings','Passing Yards']);
  assert.ok(r.edge>=.5&&r.edge<1,String(r.edge));assert.equal(r.event_id,'NFL--evt1');assert.ok(r.team);
  // Later runs keep the first sighting, and track the latest big-5 price as the close.
  context.boards=[board({'Aaron Rodgers':['player_pass_yds',215.5,100,-125],'Nick Chubb':['player_rush_yds',62.5,110,-120]})];
  await run(`recordNearShadow(env,boards,[],${now+3600000})`);
  rows=db.prepare('SELECT * FROM near_shadow').all();
  assert.equal(rows.length,1,'logged once per player and game');
  assert.equal(rows[0].odds,106,'the logged price is kept');
  assert.equal(rows[0].close_odds,100,'closing price: best big-5 price at the same line and side');
  // A player with an official pick in that game is never logged as a near miss,
  // even after their price drifts below the bar.
  db.prepare("INSERT INTO public_recommendations(id,kind,player,market,side,line,odds,game_id,game_time,legs_json,posted_at,status,source) VALUES('official|x|props|prop|n','prop','David Njoku','Receptions','Over',3.5,110,'NFL--evt1',?,'[]',?,'pending','market-verified-v2')").run(kickoff,new Date(now).toISOString());
  context.boards=[board({'David Njoku':['player_receptions',3.5,106,-120]})];
  assert.equal(JSON.stringify(run(`officialCandidates(boards,${now},{},{min:.5,below:1})`).map(p=>p.player)),'["David Njoku"]','Njoku is in the near-miss band');
  assert.equal(JSON.parse(JSON.stringify(await run(`recordNearShadow(env,boards,[],${now})`))).logged,0);
  // Grading once the game is final.
  context.env.BALLDONTLIE_API_KEY='test';
  run('recordPlayerStats=async r=>({scoreboardFinal:true,passing_yards:240})');
  assert.equal((await run(`gradeNearShadow(env,${now+2*3600000})`)).graded,0,'not before the game ends');
  out=await run(`gradeNearShadow(env,${now+10*3600000})`);assert.equal(out.graded,1);
  rows=db.prepare('SELECT actual,result FROM near_shadow').all();
  assert.deepEqual([rows[0].actual,rows[0].result],[240,'won']);
  assert.equal((await run(`gradeNearShadow(env,${now+11*3600000})`)).checked,0,'graded picks are not re-checked');
  console.log('PASS: near-miss shadow logs props just under the official bar once (never official ones), tracks their closing price and grades them, without changing official picks');
})().catch(error=>{console.error(error);process.exit(1)});
