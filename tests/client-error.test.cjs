// Browser errors (Nov 5): a daily count per error and, once, what it is; owner and bots skipped.
const mails=[];const assert=require('node:assert/strict'),vm=require('node:vm'),{webcrypto}=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const {read}=require('./helpers/client.cjs');
const context=vm.createContext({URL,URLSearchParams,Request,Response,Headers,AbortSignal,Date,console,setTimeout,clearTimeout,crypto:webcrypto,TextEncoder,btoa,atob,fetch:async(url,init)=>{if(String(url)==='https://api.resend.com/emails'){mails.push(JSON.parse(init.body));return Response.json({id:'m1'})}return new Response(null,{status:404})}});
const template=read('worker/index.template.js');
vm.runInContext(template.slice(template.indexOf('const API_BASE')).replace('__MOVEMENT_SERVER__',read('worker/movement.js')).replace('__LIVE_SERVER__',read('worker/live.js')).replace('__STATS_SHARED__',read('dist/stats.js')).replace('__RECORDS_SERVER__',read('worker/records.js')).replace('__ACCOUNTS_SERVER__',read('worker/accounts.js')).replace('export default {','this.worker={'),context);
const db=new DatabaseSync(':memory:');
for(const f of ['0004_user_accounts.sql','0007_email_alerts.sql','0000_public_record.sql','0001_record_settlement.sql','0002_historical_replays.sql','0006_push_alerts.sql','0008_book_alerts.sql','0013_follow_alerts.sql','0027_alert_price_view.sql','0031_alert_kinds.sql','0033_alert_nba.sql'])db.exec(read('drizzle/'+f).replaceAll('--> statement-breakpoint',''));
const wrap=(sql,args=[])=>({bind(...v){return wrap(sql,v)},async first(){return db.prepare(sql).get(...args)||null},async all(){return{results:db.prepare(sql).all(...args)}},async run(){const r=db.prepare(sql).run(...args);return{success:true,meta:{changes:Number(r.changes)}}}});
const env={RESEND_API_KEY:'test',DB:{prepare:sql=>wrap(sql),async batch(l){for(const s of l)await s.run()}}};context.env=env;
const run=code=>vm.runInContext(code,context);
const send=(body,headers={})=>run(`clientError(new Request('https://betthisguy.com/api/client-error',{method:'POST',headers:${JSON.stringify({'user-agent':'Mozilla/5.0 (iPhone)',...headers})},body:${JSON.stringify(JSON.stringify(body))}}),env)`);
(async()=>{
  db.exec(read('drizzle/0005_usage_counts.sql').replaceAll('--> statement-breakpoint',''));
  const e={msg:"Cannot read properties of null (reading 'x')",file:'/app.js',line:1234,col:5};
  for(let i=0;i<2;i++)assert.equal((await send(e)).status,204);
  await send(e,{cookie:'btg_owner=1'});await send(e,{'user-agent':'Googlebot/2.1'});await send({msg:''});
  const rows=db.prepare("SELECT metric,count FROM usage_counts WHERE metric LIKE 'err:%'").all();
  assert.equal(rows.length,1);assert.equal(rows[0].count,2,'counted twice; the owner, a bot and an empty one skipped');
  const info=JSON.parse(db.prepare('SELECT value FROM app_settings WHERE key=?').get('errinfo:'+rows[0].metric.slice(4)).value);
  assert.deepEqual([info.msg,info.file,info.line],[e.msg,'/app.js',1234]);
  console.log('PASS: browser errors: counted per error per day with what it is (message, file:line), owner and bots skipped');
})().catch(e=>{console.error(e);process.exit(1)});
