const {DatabaseSync}=require('node:sqlite'),{webcrypto}=require('node:crypto'),fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
// Headshots for X cards: when ESPN's search misses a hyphenated name, it
// retries without the hyphen; a hit with no image link uses the ESPN id.
const context=vm.createContext({Date,URL,URLSearchParams,Request,Response,Headers,AbortSignal,setTimeout,clearTimeout,console,crypto:webcrypto,TextEncoder,btoa,atob});
const template=read('worker/index.template.js');
vm.runInContext(template.slice(template.indexOf('const API_BASE')).replace('__MOVEMENT_SERVER__',read('worker/movement.js')).replace('__LIVE_SERVER__',read('worker/live.js')).replace('__STATS_SHARED__',read('dist/stats.js')).replace('__RECORDS_SERVER__',read('worker/records.js')).replace('__ACCOUNTS_SERVER__',read('worker/accounts.js')).replace('export default {','this.worker={'),context);
const run=c=>vm.runInContext(c,context),asked=[];
const jsn={type:'player',contents:[{displayName:'Jaxon Smith-Njigba',description:'NFL',uid:'s:20~l:28~a:4430878'}]};
context.fetch=async url=>{url=String(url);asked.push(url);
  if(url.includes('espncdn'))return new Response(new Uint8Array([1,2]),{headers:{'content-type':'image/png'}});
  const q=new URL(url).searchParams.get('query');
  return Response.json({results:q==='Jaxon Smith Njigba'?[jsn]:[]});
};
(async()=>{
  const shot=await run("playerHeadshot('Jaxon Smith-Njigba','NFL')");
  assert.ok(shot&&shot.type==='image/png'&&shot.bytes.length===2,'photo found on the retry');
  assert.ok(asked.includes('https://a.espncdn.com/i/headshots/nfl/players/full/4430878.png'),'headshot built from the ESPN id');
  asked.length=0;context.fetch=async()=>Response.json({results:[]});
  assert.equal(await run("playerHeadshot('Nobody Here','NFL')"),null,'no match stays null');
  const db=new DatabaseSync(':memory:');db.exec("CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT)");db.prepare("INSERT INTO app_settings VALUES ('headshot-probe','Nobody Here')").run();
  const wrap=(sql,args=[])=>({bind(...v){return wrap(sql,v)},async first(){return db.prepare(sql).get(...args)||null},async all(){return{results:db.prepare(sql).all(...args)}},async run(){db.prepare(sql).run(...args);return{success:true}}});
  context.env={DB:{prepare:sql=>wrap(sql)}};
  const probe=await run('runHeadshotProbe(env)');assert.equal(probe[0].found,false);
  const saved=JSON.parse(db.prepare("SELECT value FROM app_settings WHERE key='headshot-probe-result'").get().value);
  assert.ok(saved.out[0].steps.length>=1&&!db.prepare("SELECT 1 FROM app_settings WHERE key='headshot-probe'").get(),'probe saves its steps once');
  console.log('PASS: headshots retry punctuated names and fall back to the ESPN id');
})().catch(e=>{console.error(e);process.exit(1)});
