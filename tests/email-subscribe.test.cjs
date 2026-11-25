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
for(const f of ['0000_public_record.sql','0001_record_settlement.sql','0002_historical_replays.sql','0004_user_accounts.sql','0006_push_alerts.sql','0007_email_alerts.sql','0029_email_predictions.sql','0034_email_nba.sql','0028_prediction_picks.sql','0008_book_alerts.sql','0013_follow_alerts.sql','0027_alert_price_view.sql','0031_alert_kinds.sql','0033_alert_nba.sql','0035_email_subscribers.sql','0046_email_books.sql'])db.exec(read('drizzle/'+f).replaceAll('--> statement-breakpoint',''));
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
  // Email alerts without an account: sign up with an address and it's on, with a welcome email.
  env.RESEND_API_KEY='r';
  for(const [id,player,market,side,line,odds,result,v,t] of [['w1','Proof Player','Assists','Over',4.5,105,'won',7,'2026-09-28T23:00:00Z'],['w2','Miss Player','Rebounds','Under',2.5,-110,'lost',4,'2026-09-28T22:00:00Z']])
    db.prepare("INSERT INTO public_recommendations(id,kind,player,market,side,line,odds,game_time,legs_json,posted_at,status,result,source) VALUES(?,?,?,?,?,?,?,?,?,?,'final',?,'market-verified-v2')").run(`nba|2026-09-28|props|prop|${id}`,'prop',player,market,side,line,odds,t,JSON.stringify([{player,market,side,line,odds,actualValue:v}]),'2026-09-28T12:00:00Z',result);
  let r=await request('/api/email-subscribe',{method:'POST',body:JSON.stringify({email:'not-an-email'})});assert.equal(r.status,400);
  r=await request('/api/email-subscribe',{method:'POST',body:JSON.stringify({email:'New.Fan@Example.com'})});assert.equal(r.status,200);{const b=await r.json();assert.equal(b.active,true);assert.equal(b.welcome,true)}
  const welcome=sent.find(m=>m.single&&m.body.to[0]==='new.fan@example.com');assert.ok(welcome,'a welcome email goes out');assert.match(welcome.body.subject,/You’re in/);
  // Nov 24: the welcome email shows our latest graded picks, losses included.
  assert.match(welcome.body.html,/OUR LATEST RESULTS · LOSSES INCLUDED/);assert.match(welcome.body.html,/✅ Won<\/b> · Proof Player Over 4\.5 assists \(\+105\) · final 7/);assert.match(welcome.body.text,/Lost: Miss Player Under 2\.5 rebounds/);
  const token=db.prepare("SELECT token,status FROM email_subscribers WHERE email='new.fan@example.com'").get();assert.equal(token.status,'active');
  // Nov 25: my books. Sign-up hands back a one-hour key (not the unsubscribe token); the books step saves them.
  {const r1=await request('/api/email-subscribe',{method:'POST',body:JSON.stringify({email:'books.fan@example.com'})}),d1=await r1.json();
    assert.match(d1.prefsKey,/^[a-f0-9]{32}$/);assert.deepEqual(d1.books,['DraftKings','FanDuel','BetMGM','Caesars','Fanatics']);
    const tok=db.prepare("SELECT token FROM email_subscribers WHERE email='books.fan@example.com'").get().token;assert.ok(!tok.startsWith(d1.prefsKey),'not the unsubscribe token');
    let r2=await request('/api/email-subscribe/books',{method:'POST',body:JSON.stringify({key:'0'.repeat(32),books:['FanDuel']})});assert.equal(r2.status,410,'unknown key');
    r2=await request('/api/email-subscribe/books',{method:'POST',body:JSON.stringify({key:d1.prefsKey,books:['FanDuel','Bovada','FanDuel']})});assert.equal(r2.status,200);
    assert.equal(db.prepare("SELECT books FROM email_subscribers WHERE email='books.fan@example.com'").get().books,'["FanDuel"]','only known books, once');
    const people=plain(await run('emailPeople(env)'));const fan=people.find(p=>p.email==='books.fan@example.com');assert.equal(fan.books,'["FanDuel"]');
    context.fan=fan;context.picks2=[{id:'a',legs_json:JSON.stringify([{book:'DraftKings'}])},{id:'b',legs_json:JSON.stringify([{book:'FanDuel'}])}];
    assert.deepEqual(plain(await run('picksForBooks(picks2,fan).map(p=>p.id)')),['b','a'],'their book first');
    assert.deepEqual(plain(await run('picksForBooks(picks2,{}).map(p=>p.id)')),['a','b'],'no books: unchanged');
    db.prepare("DELETE FROM email_subscribers WHERE email='books.fan@example.com'").run()}
  assert.ok(welcome.body.text.includes(`/api/email-alerts/unsubscribe?token=${token.token}`),'the welcome email has the unsubscribe link');
  assert.ok(welcome.body.headers?.['List-Unsubscribe'],'one-click unsubscribe header');
  // A second sign-up within 10 minutes doesn't send another email.
  const before=sent.length;r=await request('/api/email-subscribe',{method:'POST',body:JSON.stringify({email:'new.fan@example.com'})});assert.equal(sent.length,before,'no repeat emails');assert.equal((await r.json()).active,true);
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
  // Signed up back when a confirm link was required and never tapped it: one reminder a day later, then never again; still nothing until they confirm.
  const old=new Date(Date.now()-3*86400000).toISOString(),tk='b'.repeat(64);
  db.prepare("INSERT INTO email_subscribers (email,token,status,nba,created_at,confirm_sent_at) VALUES ('old.fan@example.com',?,'pending',1,?,?)").run(tk,old,old);
  const n=sent.length;assert.equal((await run('remindPendingSubscribers(env)')).sent,1);assert.equal((await run('remindPendingSubscribers(env)')).sent,0,'only once');
  const nudge=sent.slice(n).find(m=>m.body?.to?.[0]==='old.fan@example.com');assert.ok(nudge&&/Confirm/.test(nudge.body.subject)&&nudge.body.text.includes(`confirm?token=${tk}`),'the reminder is the confirm link');
  assert.equal((await run('emailPeople(env)')).length,0,'pending still gets no picks');
  r=await request(`/api/email-subscribe/confirm?token=${tk}`);assert.equal(r.status,200);assert.equal((await run('emailPeople(env)')).length,1,'confirmed, then picks');
  console.log('PASS: email alerts without an account: on at sign-up with a welcome email, no repeat emails, one email per address, one-click unsubscribe, one confirm reminder for old pending sign-ups');
})().catch(error=>{console.error(error);process.exit(1)});
