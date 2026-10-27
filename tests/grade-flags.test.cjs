const assert=require('node:assert/strict'),vm=require('node:vm'),{webcrypto}=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const {read}=require('./helpers/client.cjs');
// Unusual results go on a backend flag list (app_settings flag:<id>), never shown on the site.
const context=vm.createContext({URL,URLSearchParams,Request,Response,Headers,AbortSignal,Date,console,setTimeout,clearTimeout,crypto:webcrypto,TextEncoder,btoa,atob});
const template=read('worker/index.template.js');
vm.runInContext(template.slice(template.indexOf('const API_BASE')).replace('__MOVEMENT_SERVER__',read('worker/movement.js')).replace('__LIVE_SERVER__',read('worker/live.js')).replace('__STATS_SHARED__',read('dist/stats.js')).replace('__RECORDS_SERVER__',read('worker/records.js')).replace('__ACCOUNTS_SERVER__',read('worker/accounts.js')).replace('export default {','this.worker={'),context);
const db=new DatabaseSync(':memory:');
for(const f of ['0000_public_record.sql','0001_record_settlement.sql','0002_historical_replays.sql','0006_push_alerts.sql'])db.exec(read('drizzle/'+f).replaceAll('--> statement-breakpoint',''));
db.exec("CREATE TABLE prediction_picks (id text PRIMARY KEY, player text, market text, side text, line real, game_time text, result text)");
const wrap=(sql,args=[])=>({bind(...values){return wrap(sql,values)},async first(){return db.prepare(sql).get(...args)||null},async all(){return{results:db.prepare(sql).all(...args)}},async run(){const r=db.prepare(sql).run(...args);return{success:true,meta:{changes:Number(r.changes)}}}});
context.env={DB:{prepare:sql=>wrap(sql)}};
const run=code=>vm.runInContext(code,context),J=v=>JSON.parse(JSON.stringify(v));
(async()=>{
  const f=leg=>J(run(`gradeFlags(${JSON.stringify(leg)})`));
  assert.deepEqual(f({side:'Over',line:6.5,actualValue:0,minutes:31}),['0 against a line of 6.5'],'a zero on a real line');
  assert.deepEqual(f({side:'Over',line:6.5,actualValue:2,minutes:6}),['played 6 min','2 against a line of 6.5'],'few minutes and far under');
  assert.deepEqual(f({side:'Under',line:2.5,actualValue:9}),['9 against a line of 2.5'],'far over an Under');
  assert.deepEqual(f({voided:true,side:'Over',line:4.5,actualValue:null}),['voided: did not play']);
  assert.deepEqual(f({side:'Over',line:6.5,actualValue:5,minutes:30}),[],'an ordinary loss is not flagged');
  // Flags merge: a later reason is added to the earlier ones.
  await run(`recordGradeFlags(env,'nba|x',[{player:'Dyson Daniels',market:'Rebounds',side:'Over',line:6.5,actualValue:0,minutes:31}])`);
  await run(`recordGradeFlags(env,'nba|x',[{player:'Dyson Daniels',market:'Rebounds',side:'Over',line:6.5,actualValue:0}],['stat corrected after grading: 0 → 1'])`);
  const flag=JSON.parse(db.prepare("SELECT value FROM app_settings WHERE key='flag:nba|x'").get().value);
  assert.deepEqual([flag.player,flag.actual,flag.minutes,flag.why],['Dyson Daniels',0,31,['0 against a line of 6.5','stat corrected after grading: 0 → 1']]);
  assert.equal(await run(`recordGradeFlags(env,'nba|y',[{side:'Over',line:6.5,actualValue:5}])`),0,'nothing unusual, nothing written');
  // Picks still ungraded 8 hours after their start are flagged.
  const now=Date.parse('2026-10-27T18:00:00Z');
  db.prepare("INSERT INTO public_recommendations(id,kind,player,market,side,line,odds,game_time,legs_json,posted_at,status,source) VALUES('nba|stuck','prop','Stuck Player','Points','Over',10.5,110,'2026-10-27T01:00:00Z','[]','2026-10-26T12:00:00Z','pending','market-verified-v2')").run();
  db.prepare("INSERT INTO prediction_picks VALUES('pm|stuck','App Player','Assists','Over',4.5,'2026-10-27T02:00:00Z',NULL)").run();
  db.prepare("INSERT INTO prediction_picks VALUES('pm|fresh','Fresh Player','Assists','Over',4.5,'2026-10-27T16:00:00Z',NULL)").run();
  assert.equal(J(await run(`flagStuckPicks(env,${now})`)).flagged,2);
  assert.deepEqual(JSON.parse(db.prepare("SELECT value FROM app_settings WHERE key='flag:pm|stuck'").get().value).why,['not graded 8+ hours after start']);
  assert.equal(db.prepare("SELECT count(*) n FROM app_settings WHERE key='flag:pm|fresh'").get().n,0,'a game that just ended is not flagged');
  console.log('PASS: unusual results (zeros, few minutes, far from the line, voids, stat corrections, picks stuck ungraded) go on the backend flag list, merged per pick');
})().catch(e=>{console.error(e);process.exit(1)});
