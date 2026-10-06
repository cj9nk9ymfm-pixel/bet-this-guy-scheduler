const assert=require('node:assert/strict'),vm=require('node:vm'),{webcrypto}=require('node:crypto');
const {read}=require('./helpers/client.cjs');
const context=vm.createContext({URL,URLSearchParams,Request,Response,Headers,AbortSignal,Date,console,crypto:webcrypto,TextEncoder,setTimeout,clearTimeout,fetch:async()=>{throw Error('Unexpected provider call')}});
const template=read('worker/index.template.js');vm.runInContext(template.slice(template.indexOf('const API_BASE')).replace('__MOVEMENT_SERVER__',read('worker/movement.js')).replace('__LIVE_SERVER__',read('worker/live.js')).replace('__STATS_SHARED__',read('dist/stats.js')).replace('__RECORDS_SERVER__',read('worker/records.js')).replace('__ACCOUNTS_SERVER__',read('worker/accounts.js')).replace('export default {','this.worker={'),context);const run=s=>vm.runInContext(s,context);
context.env={DB:{},THE_ODDS_API_KEY:'fixture',BALLDONTLIE_API_KEY:'fixture',MAINTENANCE_TOKEN:'fixture-token-only-01234567890123456789'};
const request=(job,token=context.env.MAINTENANCE_TOKEN,method='POST')=>new Request('https://test.invalid/api/maintenance?job='+job,{method,headers:token?{authorization:'Bearer '+token}:{}});
async function call(req){context.req=req;return run('worker.fetch(req,env,{waitUntil(){}})')}
(async()=>{
 assert.equal((await call(request('grade','', 'GET'))).status,405);
 assert.equal((await call(request('grade',''))).status,401);
 assert.equal((await call(request('grade','incorrect-token'))).status,401);
 assert.equal((await call(request('arbitrary-command'))).status,400);
 const saved=context.env.MAINTENANCE_TOKEN;delete context.env.MAINTENANCE_TOKEN;
 assert.equal((await call(request('grade',saved))).status,401,'disabled until secret is set');context.env.MAINTENANCE_TOKEN=saved;
 run('var counts={publish:0,grade:0,closing:0};publishOfficialPicks=async()=>{counts.publish++};settlePublicRecords=async()=>{counts.grade++};captureClosingLines=async()=>{counts.closing++}');
 for(const job of ['publish','grade','closing'])assert.equal((await (await call(request(job))).json()).success,true);
 assert.deepEqual(JSON.parse(JSON.stringify(run('counts'))),{publish:1,grade:1,closing:1});
 run('settlePublicRecords=async()=>{throw Error("provider failure with sensitive internal details")}');
 const failed=await call(request('grade'));assert.equal(failed.status,503);assert.ok(!(await failed.text()).includes('sensitive'));
 run('var release;settlePublicRecords=()=>{counts.grade++;return new Promise(r=>release=r)}');
 const one=call(request('grade'));await new Promise(r=>setTimeout(r,10));const two=call(request('grade'));await new Promise(r=>setTimeout(r,10));assert.equal(run('counts.grade'),2,'overlapping scheduler requests share one run');run('release()');assert.equal((await one).status,200);assert.equal((await two).status,200);
 // Cloudflare cron: picks are checked every 10 minutes all week; grading every
 // 10 minutes in NFL windows and every 6 hours otherwise. GitHub only checks uptime.
 const due=iso=>JSON.stringify(run(`cronJobs(new Date('${iso}'))`));
 assert.equal(due('2026-10-04T16:40:00Z'),'["publish","grade"]','Sunday checks every 10 minutes');
 assert.equal(due('2026-10-04T16:45:00Z'),'[]');
 assert.equal(due('2026-10-06T14:00:00Z'),'["publish"]','picks are checked on a quiet Tuesday too');
 assert.equal(due('2026-10-06T14:05:00Z'),'[]');
 assert.equal(due('2026-10-06T18:00:00Z'),'["publish","grade"]','grading still runs every 6 hours in quiet periods');
 assert.equal(typeof run('worker.scheduled'),'function','the Worker exports a scheduled handler');
 const ran=[];context.publishOfficialPicks=async()=>{ran.push('publish')};context.settlePublicRecords=async()=>{ran.push('grade')};
 run('publishOfficialPicks=globalThis.publishOfficialPicks;settlePublicRecords=globalThis.settlePublicRecords');
 await run(`worker.scheduled({scheduledTime:Date.parse('2026-10-04T17:00:00Z')},env,{waitUntil(){}})`);
 assert.deepEqual(ran,['publish','grade'],'the cron runs the jobs that are due');
 const wf=read('.github/workflows/btg-maintenance.yml');
 assert.ok(!/elif active_window/.test(wf),'GitHub no longer publishes on its own schedule');
 assert.match(read('wrangler.jsonc'),/"crons": \["\*\/5 \* \* \* \*"\]/,'the site Worker has a 5-minute cron trigger');
 console.log('PASS: scheduled maintenance requires authorization, fails closed, dispatches only allowed jobs, reports failures and deduplicates concurrent runs');
})().catch(e=>{console.error(e);process.exitCode=1});
