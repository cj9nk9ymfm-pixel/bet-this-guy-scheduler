const assert=require('node:assert/strict'),vm=require('node:vm'),{webcrypto}=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const {read}=require('./helpers/client.cjs');
// One record everywhere: the welcome screen, the home record bar and the X
// cards read the server's season summary; the results page works its numbers
// out in the browser. Both must agree on every count, on the real season.
const rows=JSON.parse(read('tests/fixtures/season-2026-10-16.json'));
const context=vm.createContext({URL,URLSearchParams,Request,Response,Headers,AbortSignal,Date,console,setTimeout,clearTimeout,crypto:webcrypto,TextEncoder,btoa,atob,FormData,Blob,fetch:async()=>new Response(null,{status:404})});
const template=read('worker/index.template.js');
vm.runInContext(template.slice(template.indexOf('const API_BASE')).replace('__MOVEMENT_SERVER__',read('worker/movement.js')).replace('__LIVE_SERVER__',read('worker/live.js')).replace('__STATS_SHARED__',read('dist/stats.js')).replace('__RECORDS_SERVER__',read('worker/records.js')).replace('__ACCOUNTS_SERVER__',read('worker/accounts.js')).replace('export default {','this.worker={'),context);
const db=new DatabaseSync(':memory:');
for(const f of require('node:fs').readdirSync(require('node:path').resolve(__dirname,'../drizzle')).filter(f=>f.endsWith('.sql')).sort())db.exec(read('drizzle/'+f).replaceAll('--> statement-breakpoint',''));
const put=o=>{const k=Object.keys(o);db.prepare(`INSERT INTO public_recommendations (${k.join(',')}) VALUES (${k.map(()=>'?').join(',')})`).run(...k.map(x=>o[x]))};
rows.forEach(put);
const wrap=(sql,args=[])=>({bind(...v){return wrap(sql,v)},async first(){return db.prepare(sql).get(...args)||null},async all(){return{results:db.prepare(sql).all(...args)}},async run(){db.prepare(sql).run(...args);return{success:true}}});
const env={DB:{prepare:s=>wrap(s),async batch(l){for(const s of l)await s.run();return []}}};
(async()=>{
  const season=await vm.runInContext('homeSeason',context)(env);
  // The results page's own math, taken from trust.html.
  const html=read('dist/trust.html'),from=html.indexOf('const parsedLegs='),to=html.indexOf('\n};',html.indexOf('const closingValue='))+3;
  const page=vm.createContext({localStorage:{getItem:()=>null},JSON,Math,Number,String,Array,Set,Object});
  vm.runInContext(html.slice(from,to)+';this.api={profit,closingValue};',page);
  const graded=rows.filter(r=>['won','lost','push'].includes(r.result)),props=graded.filter(r=>r.kind==='prop');
  const clv=props.map(page.api.closingValue).filter(Boolean),beat=clv.filter(v=>v.edge>0.05).length;
  assert.deepEqual([season.wins,season.losses],[props.filter(r=>r.result==='won').length,props.filter(r=>r.result==='lost').length],'singles record matches');
  assert.equal(season.profit,Math.round(props.reduce((t,r)=>t+page.api.profit(r,100),0)),'singles profit matches at $100 a pick');
  assert.equal(season.tracked,clv.length,'same picks counted for the kickoff price');
  assert.equal(season.beat,beat,'same number beat the kickoff price');
  assert.deepEqual([season.wins,season.losses,season.profit,season.beat,season.tracked],[24,18,1183,31,41],'the real season through Oct 16');
  console.log(`PASS: welcome, home, X and results agree (${season.wins}–${season.losses}, +$${season.profit}, ${season.beat} of ${season.tracked} beat the kickoff price)`);
})().catch(e=>{console.error(e);process.exit(1)});
