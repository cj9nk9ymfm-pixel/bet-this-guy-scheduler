const assert=require('node:assert/strict'),vm=require('node:vm'),{webcrypto}=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const {read}=require('./helpers/client.cjs');

const user={id:'22222222-2222-2222-2222-222222222222',email:'fan@example.com',user_metadata:{full_name:'Football Fan',email_alerts:true}};
const sent=[];let resendFail=false;
const context=vm.createContext({URL,URLSearchParams,Request,Response,Headers,AbortSignal,Date,console,setTimeout,clearTimeout,crypto:webcrypto,TextEncoder,btoa,atob,
  fetch:async(url,init={})=>{
    if(String(url).endsWith('/auth/v1/user'))return init.headers?.authorization==='Bearer valid-token'?Response.json(user):Response.json({},{status:401});
    if(String(url)==='https://api.resend.com/emails/batch'){sent.push({init,body:JSON.parse(init.body)});return Response.json({data:[]})}
    if(String(url)==='https://api.resend.com/emails'){if(resendFail)return Response.json({name:'validation_error',message:'The betthisguy.com domain is not verified.'},{status:403});sent.push({init,body:JSON.parse(init.body),single:true});return Response.json({id:'e1'})}
    return new Response(null,{status:404});
  }});
const template=read('worker/index.template.js');
vm.runInContext(template.slice(template.indexOf('const API_BASE')).replace('__MOVEMENT_SERVER__',read('worker/movement.js')).replace('__LIVE_SERVER__',read('worker/live.js')).replace('__STATS_SHARED__',read('dist/stats.js')).replace('__RECORDS_SERVER__',read('worker/records.js')).replace('__ACCOUNTS_SERVER__',read('worker/accounts.js')).replace('export default {','this.worker={'),context);
const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
for(const f of ['0000_public_record.sql','0001_record_settlement.sql','0002_historical_replays.sql','0004_user_accounts.sql','0006_push_alerts.sql','0007_email_alerts.sql','0029_email_predictions.sql','0034_email_nba.sql','0028_prediction_picks.sql','0008_book_alerts.sql','0013_follow_alerts.sql','0027_alert_price_view.sql','0031_alert_kinds.sql','0033_alert_nba.sql','0035_email_subscribers.sql'])db.exec(read('drizzle/'+f).replaceAll('--> statement-breakpoint',''));
// Shaped like D1: run() reports changes under meta.
const wrap=(sql,args=[])=>({bind(...values){return wrap(sql,values)},async first(){return db.prepare(sql).get(...args)||null},async all(){return{results:db.prepare(sql).all(...args)}},async run(){const r=db.prepare(sql).run(...args);return{success:true,meta:{changes:Number(r.changes)}}}});
const DB={prepare:sql=>wrap(sql),async batch(list){const out=[];for(const s of list)out.push(await s.run());return out}};
const env={DB};context.env=env;
const run=code=>vm.runInContext(code,context);
const request=(path,options={})=>context.worker.fetch(new Request(`https://betthisguy.com${path}`,options),env,{waitUntil(){}});
const authed=(method='GET',body)=>({method,headers:{authorization:'Bearer valid-token',...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
const plain=value=>JSON.parse(JSON.stringify(value));
const pick=(id,player,gameTime,postedAt,extra={})=>db.prepare("INSERT INTO public_recommendations(id,kind,player,market,side,line,odds,combined_odds,game_time,legs_json,posted_at,status,source) VALUES(?,?,?,?,?,?,?,?,?,?,?,'pending','market-verified-v2')").run(`official|2026-09-29|props|prop|${id}`,extra.kind||'prop',player,'Receptions','Over',4.5,120,extra.combined??null,gameTime,extra.legs||JSON.stringify([{player,market:'Receptions',side:'Over',line:4.5,odds:120,book:'DraftKings'}]),postedAt);

(async()=>{
  // Email alerts without an account: sign up with an address, confirm by link, then get pick emails.
  env.RESEND_API_KEY='r';
  let r=await request('/api/email-subscribe',{method:'POST',body:JSON.stringify({email:'not-an-email'})});assert.equal(r.status,400);
  r=await request('/api/email-subscribe',{method:'POST',body:JSON.stringify({email:'New.Fan@Example.com'})});assert.equal(r.status,200);assert.equal((await r.json()).pending,true);
  const confirm=sent.find(m=>m.single&&m.body.to[0]==='new.fan@example.com');assert.ok(confirm,'a confirm email goes out');assert.match(confirm.body.subject,/Confirm/);
  const token=db.prepare("SELECT token,status FROM email_subscribers WHERE email='new.fan@example.com'").get();assert.equal(token.status,'pending');
  assert.ok(confirm.body.text.includes(`/api/email-subscribe/confirm?token=${token.token}`));
  // Before confirming, no pick emails.
  assert.equal((await run('emailPeople(env)')).length,0,'pending addresses get nothing');
  // A second sign-up within 10 minutes doesn't send another email.
  const before=sent.length;await request('/api/email-subscribe',{method:'POST',body:JSON.stringify({email:'new.fan@example.com'})});assert.equal(sent.length,before,'no repeat confirm emails');
  r=await request(`/api/email-subscribe/confirm?token=${token.token}`);assert.equal(r.status,200);assert.match(await r.text(),/You’re in/);
  assert.deepEqual(plain(await run('emailPeople(env)')).map(p=>p.email),['new.fan@example.com']);
  assert.equal((await run("emailPeople(env,'nba')")).length,1,'NBA on by default');assert.equal((await run("emailPeople(env,'predictions')")).length,0);
  // An account with the same address gets one email, not two.
  db.prepare("INSERT INTO user_profiles (auth_user_id,email,created_at,updated_at) VALUES ('u9','new.fan@example.com','2026-10-01','2026-10-01')").run();
  db.prepare("INSERT INTO email_alerts (auth_user_id,enabled,token,created_at,updated_at) VALUES ('u9',1,?,'2026-10-01','2026-10-01')").run('a'.repeat(64));
  assert.equal((await run('emailPeople(env)')).length,1,'one email per address');
  db.prepare("DELETE FROM email_alerts WHERE auth_user_id='u9'").run();
  // Unsubscribe link works for subscribers too.
  r=await request(`/api/email-alerts/unsubscribe?token=${token.token}`,{method:'POST'});assert.equal(r.status,200);
  assert.equal(db.prepare("SELECT status FROM email_subscribers WHERE email='new.fan@example.com'").get().status,'off');
  assert.equal((await run('emailPeople(env)')).length,0,'unsubscribed gets nothing');
  r=await request(`/api/email-subscribe/confirm?token=${token.token}`);assert.equal(r.status,404,'an old confirm link cannot turn it back on');
  console.log('PASS: email alerts without an account: confirm link first, no repeat confirm emails, one email per address, one-click unsubscribe');
})().catch(error=>{console.error(error);process.exit(1)});
