const assert=require('node:assert/strict'),vm=require('node:vm'),{webcrypto}=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const {read}=require('./helpers/client.cjs');
// Game leans (shadow): one per game, the best-rated prop at the big-5 books
// priced -150 to +150, locked about 90 minutes before kickoff; plus a
// backtest from saved odds snapshots. Never posted or official.
const context=vm.createContext({URL,URLSearchParams,Request,Response,Headers,AbortSignal,Date,console,setTimeout,clearTimeout,crypto:webcrypto,TextEncoder,btoa,atob,fetch:async()=>new Response(null,{status:404})});
const template=read('worker/index.template.js');
vm.runInContext(template.slice(template.indexOf('const API_BASE')).replace('__MOVEMENT_SERVER__',read('worker/movement.js')).replace('__LIVE_SERVER__',read('worker/live.js')).replace('__STATS_SHARED__',read('dist/stats.js')).replace('__RECORDS_SERVER__',read('worker/records.js')).replace('__ACCOUNTS_SERVER__',read('worker/accounts.js')).replace('export default {','this.worker={'),context);
const db=new DatabaseSync(':memory:');
for(const f of ['0003_shared_movement.sql','0017_lean_shadow.sql'])db.exec(read('drizzle/'+f).replaceAll('--> statement-breakpoint',''));
const wrap=(sql,args=[])=>({bind(...values){return wrap(sql,values)},async first(){return db.prepare(sql).get(...args)||null},async all(){return{results:db.prepare(sql).all(...args)}},async run(){const r=db.prepare(sql).run(...args);return{success:true,meta:{changes:Number(r.changes)}}}});
context.env={DB:{prepare:sql=>wrap(sql),async batch(list){for(const s of list)await s.run()}}};
const run=code=>vm.runInContext(code,context),J=v=>JSON.parse(JSON.stringify(v));
(async()=>{
  const kickoff=Date.parse('2026-10-11T17:00:00Z');
  const market=(key,player,over,under,point,fresh)=>({key,last_update:fresh,outcomes:[{name:'Over',description:player,point,price:over},{name:'Under',description:player,point,price:under}]});
  // Three books at -110/-110 (or the long-shot line), DraftKings a little soft.
  const board=(id,at,soft)=>{const fresh=new Date(at-60000).toISOString();return {id,eventID:'NFL--'+id,sport_label:'NFL',commence_time:new Date(kickoff).toISOString(),home_team:'Pittsburgh Steelers',away_team:'Cleveland Browns',
    bookmakers:[['fanduel','FanDuel'],['betmgm','BetMGM'],['williamhill_us','Caesars'],['draftkings','DraftKings']].map(([key,title])=>({key,title,last_update:fresh,markets:Object.entries(soft).map(([player,[mk,point,over,under,base]])=>key==='draftkings'?market(mk,player,over,under,point,fresh):market(mk,player,base?base[0]:-110,base?base[1]:-110,point,fresh))}))}};
  // Best edge overall is a +400 long shot; the best lean in range is Chubb at +104.
  const soft={'Nick Chubb':['player_rush_yds',62.5,104,-125],'Aaron Rodgers':['player_pass_yds',215.5,-108,-112],'Jerry Jeudy':['player_receptions',5.5,420,-700,[350,-500]]};
  let at=kickoff-3*3600000;context.boards=[board('g1',at,soft)];
  assert.equal(J(await run(`recordLeans(env,boards,${at})`)).logged,0,'not before 90 minutes out');
  at=kickoff-80*60000;context.boards=[board('g1',at,soft)];
  assert.equal(J(await run(`recordLeans(env,boards,${at})`)).logged,1);
  let row=db.prepare('SELECT * FROM lean_shadow').get();
  assert.deepEqual([row.player,row.side,row.odds,row.source],['Nick Chubb','Over',104,'live'],'the best prop priced -150 to +150, not the long shot');
  at=kickoff-20*60000;context.boards=[board('g1',at,{...soft,'Nick Chubb':['player_rush_yds',62.5,-102,-118]})];
  await run(`recordLeans(env,boards,${at})`);
  row=db.prepare('SELECT * FROM lean_shadow').get();assert.equal(row.odds,104,'locked once');assert.equal(row.close_odds,-102,'closing price tracked');
  // Backtest: an hour-before snapshot picks the lean, the last one gives the close; upcoming games wait.
  const snap=(id,t,b)=>db.prepare("INSERT INTO movement_snapshots (id,event_id,captured_at,kind,payload_json) VALUES (?,?,?,?,?)").run(`NFL--${id}|observed|${t}`,'NFL--'+id,t,'observed',JSON.stringify(b));
  for(const t of [kickoff-5*3600000,kickoff-65*60000,kickoff-15*60000])snap('g2',t,board('g2',t,t===kickoff-15*60000?{...soft,'Nick Chubb':['player_rush_yds',62.5,-115,-105]}:soft));
  snap('g3',kickoff-65*60000,board('g3',kickoff-65*60000,soft));
  let out=J(await run(`backfillLeans(env,${kickoff-30*60000})`));assert.equal(out.added,0,'only games that have started');
  out=J(await run(`backfillLeans(env,${kickoff+3600000})`));assert.equal(out.added,2);
  const g2=db.prepare("SELECT * FROM lean_shadow WHERE id='NFL--g2'").get();
  assert.deepEqual([g2.player,g2.odds,g2.close_odds,g2.source,g2.logged_at],['Nick Chubb',104,-110,'backtest',new Date(kickoff-65*60000).toISOString()]);
  assert.equal(J(await run(`backfillLeans(env,${kickoff+7200000})`)).added,0,'each game once');
  // Grading, and void for a player who didn't play.
  context.env.BALLDONTLIE_API_KEY='k';
  run('recordPlayerStats=async r=>r.player==="Nick Chubb"?{scoreboardFinal:true,rushing_yards:71}:null');
  out=J(await run(`gradeLeanShadow(env,${kickoff+6*3600000})`));assert.equal(out.graded,3);
  assert.deepEqual(db.prepare("SELECT DISTINCT result FROM lean_shadow").all().map(r=>r.result),['won']);
  console.log('PASS: game leans lock once per game 90 minutes out at -150 to +150, track the close, backtest from snapshots an hour before kickoff, and grade');
})().catch(error=>{console.error(error);process.exit(1)});
