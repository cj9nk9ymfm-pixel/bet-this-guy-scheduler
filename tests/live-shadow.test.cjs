const assert=require('node:assert/strict'),vm=require('node:vm'),{webcrypto}=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const {read}=require('./helpers/client.cjs');
// Live props (shadow): at the end of the 1st quarter and at halftime, slow
// starters are logged Over their live line and hot starters Under it, at the
// best big-5 live price; graded at the final against the live line.
const context=vm.createContext({URL,URLSearchParams,Request,Response,Headers,AbortSignal,Date,console,setTimeout,clearTimeout,crypto:webcrypto,TextEncoder,btoa,atob,fetch:async()=>new Response(null,{status:404})});
const template=read('worker/index.template.js');
vm.runInContext(template.slice(template.indexOf('const API_BASE')).replace('__MOVEMENT_SERVER__',read('worker/movement.js')).replace('__LIVE_SERVER__',read('worker/live.js')).replace('__STATS_SHARED__',read('dist/stats.js')).replace('__RECORDS_SERVER__',read('worker/records.js')).replace('__ACCOUNTS_SERVER__',read('worker/accounts.js')).replace('export default {','this.worker={'),context);
const db=new DatabaseSync(':memory:');
for(const f of ['0003_shared_movement.sql','0022_live_shadow.sql'])db.exec(read('drizzle/'+f).replaceAll('--> statement-breakpoint',''));
const wrap=(sql,args=[])=>({bind(...values){return wrap(sql,values)},async first(){return db.prepare(sql).get(...args)||null},async all(){return{results:db.prepare(sql).all(...args)}},async run(){const r=db.prepare(sql).run(...args);return{success:true,meta:{changes:Number(r.changes)}}}});
context.env={DB:{prepare:sql=>wrap(sql),async batch(list){for(const s of list)await s.run()}},BALLDONTLIE_API_KEY:'t',THE_ODDS_API_KEY:'t'};
const run=code=>vm.runInContext(code,context),J=v=>JSON.parse(JSON.stringify(v));
(async()=>{
  const kickoff=Date.parse('2026-10-11T17:00:00Z'),now=kickoff+50*60000;
  const outcome=(player,point,over,under)=>[{name:'Over',description:player,point,price:over},{name:'Under',description:player,point,price:under}];
  const book=(key,markets,at)=>({key,title:key,last_update:new Date(at).toISOString(),markets:markets.map(([k,o])=>({key:k,last_update:new Date(at).toISOString(),outcomes:o}))});
  // Pregame: Jeudy 5.5 catches / 60.5 yards, Chubb 62.5 rush yards, a backup on a tiny line.
  const pre={id:'g1',commence_time:new Date(kickoff).toISOString(),bookmakers:[book('draftkings',[['player_receptions',outcome('Jerry Jeudy',5.5,-110,-110)],['player_reception_yds',outcome('Jerry Jeudy',60.5,-110,-110)],['player_rush_yds',[...outcome('Nick Chubb',62.5,-110,-110),...outcome('Backup Guy',8.5,-110,-110)]]],kickoff-3600000)]};
  db.prepare("INSERT INTO movement_snapshots (id,event_id,captured_at,kind,payload_json) VALUES ('a','NFL--g1',?,'observed',?)").run(kickoff-3600000,JSON.stringify(pre));
  // A snapshot taken during the game is not the pregame line.
  db.prepare("INSERT INTO movement_snapshots (id,event_id,captured_at,kind,payload_json) VALUES ('b','NFL--g1',?,'observed',?)").run(kickoff+600000,JSON.stringify({...pre,bookmakers:[book('draftkings',[['player_receptions',outcome('Jerry Jeudy',1.5,-110,-110)]],kickoff)]}));
  let clock={period:2,clock:'12:30',halftime:false};
  context.liveGames=async()=>Response.json({games:[{id:77,state:'in_progress',away:{full_name:'Cleveland Browns'},home:{full_name:'Pittsburgh Steelers'},awayScore:3,homeScore:7,...clock}]});
  context.futureSchedule=async()=>Response.json({data:[{eventID:'NFL--g1',teams:{away:{names:{medium:'Cleveland Browns'}},home:{names:{medium:'Pittsburgh Steelers'}}},status:{startsAt:new Date(kickoff).toISOString()}}]});
  let oddsCalls=0;
  // Live: Jeudy (0 catches) now 3.5 at +120 on BetMGM; Chubb (40 yds, hot) 85.5; stale book ignored.
  context.fetchEventOdds=async(sport,id)=>{oddsCalls++;assert.equal(id,'g1');assert.deepEqual([...sport.markets].sort(),['player_pass_yds','player_reception_yds','player_receptions','player_rush_yds']);
    return {id:'g1',bookmakers:[book('draftkings',[['player_receptions',outcome('Jerry Jeudy',3.5,100,-130)],['player_rush_yds',outcome('Nick Chubb',85.5,-115,-105)]],now-60000),book('betmgm',[['player_receptions',outcome('Jerry Jeudy',3.5,120,-150)],['player_rush_yds',outcome('Nick Chubb',85.5,-120,-110)]],now-60000),book('fanduel',[['player_receptions',outcome('Jerry Jeudy',3.5,300,-400)]],now-600000)]}};
  context.fetchLiveBoxScore=async()=>({stats:[{player:{first_name:'Jerry',last_name:'Jeudy'},receptions:0,receiving_yards:0,receiving_targets:3},{player:{first_name:'Nick',last_name:'Chubb'},rushing_yards:40},{player:{first_name:'Backup',last_name:'Guy'},rushing_yards:0}]});
  run('liveGames=globalThis.liveGames;futureSchedule=globalThis.futureSchedule;fetchEventOdds=globalThis.fetchEventOdds;fetchLiveBoxScore=globalThis.fetchLiveBoxScore');
  let out=J(await run(`recordLiveShadow(env,{waitUntil(){}},${now})`));
  assert.deepEqual(out,{checked:1,logged:2});
  const rows=db.prepare("SELECT * FROM live_shadow WHERE result IS NULL ORDER BY player,market").all().map(r=>({...r}));
  const jeudy=rows.find(r=>r.market==='Receptions');
  assert.equal(jeudy.checkpoint,'Q1');assert.equal(jeudy.side,'Over');assert.equal(jeudy.pace,'slow');
  assert.equal(jeudy.pregame_line,5.5,'pregame line comes from before kickoff');assert.equal(jeudy.live_line,3.5);
  assert.equal(jeudy.odds,120,'best fresh big-5 price, not the stale +300');assert.equal(jeudy.book,'betmgm');assert.equal(jeudy.targets,3);
  assert.ok(Math.abs(jeudy.expected_final-5.5*(1-17.5/60))<0.01);assert.ok(jeudy.gap>0.3);
  const chubb=rows.find(r=>r.player==='Nick Chubb');assert.equal(chubb.side,'Under');assert.equal(chubb.pace,'hot');assert.equal(chubb.odds,-105);
  assert.ok(!rows.some(r=>r.player==='Backup Guy'),'tiny lines are skipped');
  assert.equal(rows.find(r=>r.market==='Receiving Yards')?.side,undefined,'no live market, nothing logged');
  // Same checkpoint again: nothing new, no odds credits spent.
  out=J(await run(`recordLiveShadow(env,{waitUntil(){}},${now+300000})`));assert.deepEqual(out,{checked:0,logged:0});assert.equal(oddsCalls,1);
  // Mid 2nd quarter is not a checkpoint.
  clock={period:2,clock:'4:10',halftime:false};out=J(await run(`recordLiveShadow(env,{waitUntil(){}},${now+900000})`));assert.deepEqual(out,{checkpoints:0});
  // A failed odds fetch is retried next run.
  clock={period:2,clock:'0:00',halftime:true};context.fetchEventOdds=async()=>null;run('fetchEventOdds=globalThis.fetchEventOdds');
  await run(`recordLiveShadow(env,{waitUntil(){}},${now+1800000})`);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM live_shadow WHERE checkpoint='HALF'").get().n,0);
  // Grading: the final against the live line.
  context.recordPlayerStats=async rec=>({scoreboardFinal:true,receptions:rec.player==='Jerry Jeudy'?5:0,rushing_yards:rec.player==='Nick Chubb'?70:0});run('recordPlayerStats=globalThis.recordPlayerStats');
  out=J(await run(`gradeLiveShadow(env,${kickoff+5*3600000})`));assert.equal(out.graded,2);
  assert.equal(db.prepare("SELECT result FROM live_shadow WHERE market='Receptions'").get().result,'won');
  assert.equal(db.prepare("SELECT result FROM live_shadow WHERE player='Nick Chubb'").get().result,'won');
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM live_shadow WHERE result='none'").get().n,1,'checkpoint markers are never graded');
  // The cron runs it on both run types during NFL windows only.
  const sunday=Date.parse('2026-10-11T18:00:00Z');
  for(const m of [0,5])assert.ok(J(run(`cronJobs(new Date(${sunday+m*60000}))`)).includes('live'));
  assert.ok(!J(run(`cronJobs(new Date(${Date.parse('2026-10-13T18:05:00Z')}))`)).includes('live'));
  console.log('PASS: live test logs slow starts Over and hot starts Under at the 1st quarter and half, uses fresh live prices and pregame lines, retries failed fetches and grades at the final');
})().catch(error=>{console.error(error);process.exit(1)});
