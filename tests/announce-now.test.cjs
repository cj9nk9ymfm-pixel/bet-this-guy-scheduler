const assert=require('node:assert/strict'),vm=require('node:vm'),{webcrypto}=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const {read}=require('./helpers/client.cjs');
// New picks are announced right away: the pick run calls this Worker through
// its SELF binding to run the X post and push-alert jobs, each in its own
// invocation with its own request allowance.
const context=vm.createContext({URL,URLSearchParams,Request,Response,Headers,AbortSignal,Date,console,setTimeout,clearTimeout,crypto:webcrypto,TextEncoder,btoa,atob,fetch:async()=>new Response(null,{status:404})});
const template=read('worker/index.template.js');
vm.runInContext(template.slice(template.indexOf('const API_BASE')).replace('__MOVEMENT_SERVER__',read('worker/movement.js')).replace('__LIVE_SERVER__',read('worker/live.js')).replace('__STATS_SHARED__',read('dist/stats.js')).replace('__RECORDS_SERVER__',read('worker/records.js')).replace('__ACCOUNTS_SERVER__',read('worker/accounts.js')).replace('export default {','this.worker={'),context);
const db=new DatabaseSync(':memory:');
const wrap=(sql,args=[])=>({bind(...values){return wrap(sql,values)},async first(){return db.prepare(sql).get(...args)||null},async all(){return{results:db.prepare(sql).all(...args)}},async run(){const r=db.prepare(sql).run(...args);return{success:true,meta:{changes:Number(r.changes)}}}});
context.env={DB:{prepare:sql=>wrap(sql),async batch(list){for(const s of list)await s.run()}},BALLDONTLIE_API_KEY:'test'};
const run=code=>vm.runInContext(code,context),J=v=>JSON.parse(JSON.stringify(v));
(async()=>{
  const calls=[];
  context.env.SELF={fetch:async req=>{calls.push({url:req.url,method:req.method,auth:req.headers.get('authorization')});return new Response('{}',{status:200})}};
  context.env.MAINTENANCE_TOKEN='t'.repeat(40);
  let out=J(await run('announceNow(env)'));
  assert.deepEqual(calls.map(c=>new URL(c.url).search),['?job=alerts'],'no X keys: alerts only');
  assert.equal(out.xpost,'off');
  Object.assign(context.env,{X_API_KEY:'a',X_API_SECRET:'b',X_ACCESS_TOKEN:'c',X_ACCESS_SECRET:'d'});
  calls.length=0;out=J(await run('announceNow(env)'));
  assert.deepEqual(calls.map(c=>new URL(c.url).search).sort(),['?job=alerts','?job=xpost']);
  assert.ok(calls.every(c=>c.method==='POST'&&c.auth==='Bearer '+'t'.repeat(40)&&new URL(c.url).pathname==='/api/maintenance'));
  assert.deepEqual(out,{alerts:200,xpost:200});
  context.env.SELF={fetch:async()=>{throw new Error('binding down')}};
  out=J(await run('announceNow(env)'));assert.equal(out.xpost,'binding down','a failure never throws (the cron run is the backup)');
  delete context.env.SELF;assert.deepEqual(J(await run('announceNow(env)')),{skipped:true});
  // Both jobs exist on the maintenance endpoint.
  const src=read('worker/index.template.js'),map=src.slice(src.indexOf('async function scheduledMaintenance'));
  assert.ok(/alerts:\(\)=>sendDueAlerts/.test(map)&&/xpost:\(\)=>runXPosts/.test(map));
  assert.ok(/"binding": "SELF", "service": "bet-this-guy"/.test(read('wrangler.jsonc')));
  console.log('PASS: new picks trigger the X post and alerts right away through the SELF binding');
})().catch(error=>{console.error(error);process.exit(1)});
