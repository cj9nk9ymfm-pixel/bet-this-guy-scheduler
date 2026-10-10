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
 assert.equal(due('2026-10-04T16:45:00Z'),'["xpost","lineGrade","form","leans"]','the in-between run posts to X and grades line value');
 assert.equal(due('2026-10-06T14:00:00Z'),'["publish","form"]','picks are checked on a quiet Tuesday too');
 assert.equal(due('2026-10-06T14:05:00Z'),'["xpost","form","leans"]','in-between runs fill player form');
 assert.equal(due('2026-10-06T18:00:00Z'),'["publish","grade","form"]','grading still runs every 6 hours in quiet periods');
 assert.equal(typeof run('worker.scheduled'),'function','the Worker exports a scheduled handler');
 const ran=[];context.publishOfficialPicks=async(req,env,ctx,opts={})=>{ran.push(opts.soonOnly?'publishSoon':'publish');return opts.soonOnly?context.soonResult:undefined};context.settlePublicRecords=async()=>{ran.push('grade')};
 run('publishOfficialPicks=globalThis.publishOfficialPicks;settlePublicRecords=globalThis.settlePublicRecords');
 await run(`worker.scheduled({scheduledTime:Date.parse('2026-10-04T17:00:00Z')},env,{waitUntil(){}})`);
 assert.deepEqual(ran,['publish','grade'],'the cron runs the jobs that are due');
 // Every job the cron schedules exists (a missing one used to be skipped silently).
 for(const name of ['postPicksToX','postWeeklyToX','postClosingToX','postResultsToX','gradeLineShadow','gradeNearShadow','sendWeeklyDigest','sendDueAlerts','runStatsChecks'])context[name]=async()=>{ran.push(name);return {posted:0}};
 run('postPicksToX=globalThis.postPicksToX;postWeeklyToX=globalThis.postWeeklyToX;postClosingToX=globalThis.postClosingToX;postResultsToX=globalThis.postResultsToX;gradeLineShadow=globalThis.gradeLineShadow;gradeNearShadow=globalThis.gradeNearShadow;sendWeeklyDigest=globalThis.sendWeeklyDigest;sendDueAlerts=globalThis.sendDueAlerts;runStatsChecks=globalThis.runStatsChecks');
 ran.length=0;await run(`worker.scheduled({scheduledTime:Date.parse('2026-10-04T16:45:00Z')},env,{waitUntil(){}})`);
 assert.equal(ran[0],'sendDueAlerts','pick alerts go first on the in-between run');
 assert.deepEqual(ran.sort(),['gradeLineShadow','postClosingToX','postPicksToX','postResultsToX','postWeeklyToX','publishSoon','sendDueAlerts','sendWeeklyDigest'],'the in-between run posts to X, sends the digest when due and grades line value');
 // Line-value and near-miss grading take turns on those runs.
 ran.length=0;await run(`worker.scheduled({scheduledTime:Date.parse('2026-10-04T16:55:00Z')},env,{waitUntil(){}})`);
 assert.ok(ran.includes('gradeNearShadow')&&!ran.includes('gradeLineShadow'),'minute 55 grades near-miss picks');
 // Games kicking off soon: those slots check their prices instead of grading.
 context.soonResult={state:'completed'};
 for(const at of ['2026-10-04T16:45:00Z','2026-10-04T16:55:00Z']){ran.length=0;await run(`worker.scheduled({scheduledTime:Date.parse('${at}')},env,{waitUntil(){}})`);assert.ok(ran.includes('publishSoon')&&!ran.includes('gradeLineShadow')&&!ran.includes('gradeNearShadow'),at)}
 context.soonResult={state:'no_soon_games'};
 ran.length=0;await run(`worker.scheduled({scheduledTime:Date.parse('2026-10-04T17:05:00Z')},env,{waitUntil(){}})`);
 assert.ok(ran.includes('runStatsChecks')&&!ran.includes('gradeLineShadow')&&!ran.includes('gradeNearShadow'),'minute 5 runs the stats check');
 const wf=read('.github/workflows/btg-maintenance.yml');
 assert.ok(!/elif active_window/.test(wf),'GitHub no longer publishes on its own schedule');
 assert.match(read('wrangler.jsonc'),/"crons": \["\*\/5 \* \* \* \*"\]/,'the site Worker has a 5-minute cron trigger');
 console.log('PASS: scheduled maintenance requires authorization, fails closed, dispatches only allowed jobs, reports failures and deduplicates concurrent runs');
})().catch(e=>{console.error(e);process.exitCode=1});
