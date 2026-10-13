const {webcrypto}=require('node:crypto'),fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path'),{DatabaseSync}=require('node:sqlite');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
// Partner offers: nothing until app_settings partner-novig holds a valid code;
// bad codes and off-domain links are dropped; /api/partners serves the rest.
const context=vm.createContext({Date,URL,URLSearchParams,Request,Response,Headers,AbortSignal,setTimeout,clearTimeout,console,crypto:webcrypto,TextEncoder,btoa,atob,fetch:async()=>new Response('{}',{status:404})});
const template=read('worker/index.template.js');
vm.runInContext(template.slice(template.indexOf('const API_BASE')).replace('__MOVEMENT_SERVER__',read('worker/movement.js')).replace('__LIVE_SERVER__',read('worker/live.js')).replace('__STATS_SHARED__',read('dist/stats.js')).replace('__RECORDS_SERVER__',read('worker/records.js')).replace('__ACCOUNTS_SERVER__',read('worker/accounts.js')).replace('export default {','this.worker={'),context);
const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT)');
const wrap=(sql,args=[])=>({bind(...v){return wrap(sql,v)},async first(){return db.prepare(sql).get(...args)||null},async all(){return{results:db.prepare(sql).all(...args)}},async run(){const r=db.prepare(sql).run(...args);return{success:true,meta:{changes:Number(r.changes)}}}});
context.env={DB:{prepare:sql=>wrap(sql),async batch(l){for(const s of l)await s.run()}}};
const run=c=>vm.runInContext(c,context),J=v=>JSON.parse(JSON.stringify(v));
const set=v=>db.prepare("INSERT INTO app_settings (key,value) VALUES ('partner-novig',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(v));
(async()=>{
  assert.deepEqual(J(await run('partnerOffers(env)')),{},'off until set');
  set({code:'bad code!'});assert.deepEqual(J(await run('partnerOffers(env)')),{},'invalid code ignored');
  set({code:'betthisguy',xCode:'btgx',link:'https://evil.example/novig',offer:'Deposit $10, get $50 in trade credits'});
  assert.deepEqual(J(await run('partnerOffers(env)')),{Novig:{code:'BETTHISGUY',xCode:'BTGX',offer:'Deposit $10, get $50 in trade credits'}},'off-domain link dropped');
  set({code:'BETTHISGUY',link:'https://novig.us/r/betthisguy'});
  assert.equal(J(await run('partnerOffers(env)')).Novig.link,'https://novig.us/r/betthisguy');
  const body=await (await run(`worker.fetch(new Request('https://betthisguy.com/api/partners'),env,{waitUntil(){}})`)).json();
  assert.equal(body.partners.Novig.code,'BETTHISGUY');
  console.log('PASS: partner offers stay off until a valid code is set, drop bad codes and off-domain links, and are served at /api/partners');
})().catch(e=>{console.error(e);process.exit(1)});
