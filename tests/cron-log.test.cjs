const assert=require('node:assert/strict'),vm=require('node:vm'),{webcrypto}=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const {read}=require('./helpers/client.cjs');
// Cron run log: every run records its jobs when it starts and each job's
// outcome when it ends, so a run cut off by a platform limit shows up as
// started but never finished.
const context=vm.createContext({URL,URLSearchParams,Request,Response,Headers,AbortSignal,Date,console,setTimeout,clearTimeout,crypto:webcrypto,TextEncoder,btoa,atob,fetch:async()=>new Response(null,{status:404})});
const template=read('worker/index.template.js');
vm.runInContext(template.slice(template.indexOf('const API_BASE')).replace('__MOVEMENT_SERVER__',read('worker/movement.js')).replace('__LIVE_SERVER__',read('worker/live.js')).replace('__STATS_SHARED__',read('dist/stats.js')).replace('__RECORDS_SERVER__',read('worker/records.js')).replace('__ACCOUNTS_SERVER__',read('worker/accounts.js')).replace('export default {','this.worker={'),context);
const db=new DatabaseSync(':memory:');
const wrap=(sql,args=[])=>({bind(...values){return wrap(sql,values)},async first(){return db.prepare(sql).get(...args)||null},async all(){return{results:db.prepare(sql).all(...args)}},async run(){const r=db.prepare(sql).run(...args);return{success:true,meta:{changes:Number(r.changes)}}}});
context.env={DB:{prepare:sql=>wrap(sql),async batch(list){for(const s of list)await s.run()}},BALLDONTLIE_API_KEY:'test',THE_ODDS_API_KEY:'test'};
const run=code=>vm.runInContext(code,context),J=v=>JSON.parse(JSON.stringify(v));
db.exec(read('drizzle/0019_cron_runs.sql'));
(async()=>{
  run('publishOfficialPicks=async()=>({state:"completed"});fillFormBurst=async()=>{throw new Error("stats feed down")};recordNbaShadow=async()=>({})');
  const at=Date.parse('2026-10-06T14:00:00Z');
  await run(`runCron({scheduledTime:${at}},env,{waitUntil(){}})`);
  const row=db.prepare('SELECT * FROM cron_runs').get();
  assert.equal(row.at,new Date(at).toISOString());assert.equal(row.jobs,'publish,form,nbaShadow');
  assert.ok(row.ended_at,'finished runs record when they ended');
  const results=JSON.parse(row.results_json);
  assert.ok(!results.publish.error&&results.form.error==='stats feed down','each job outcome, errors included');
  // A run that never finishes keeps a row without ended_at.
  run('publishOfficialPicks=()=>new Promise(()=>{})');
  run(`runCron({scheduledTime:${at+600000}},env,{waitUntil(){}})`);await new Promise(r=>setTimeout(r,20));
  assert.equal(db.prepare('SELECT ended_at FROM cron_runs WHERE at=?').get(new Date(at+600000).toISOString()).ended_at,null);
  console.log('PASS: every cron run is logged at start and end with each job outcome');
  process.exit(0);
})().catch(error=>{console.error(error);process.exit(1)});
