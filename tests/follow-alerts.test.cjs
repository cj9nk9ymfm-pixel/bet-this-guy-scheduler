// Followed bets (Nov 5, Tim): "I bet this" on a phone with notifications on
// follows the pick; once it's graded that phone gets one push with the result
// (its own message from /api/alerts/latest), then the follow is cleared.
// Nothing sends until app_settings follow-alerts = 'on'.
const mails=[];const assert=require('node:assert/strict'),vm=require('node:vm'),{webcrypto}=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const {read}=require('./helpers/client.cjs');
const context=vm.createContext({URL,URLSearchParams,Request,Response,Headers,AbortSignal,Date,console,setTimeout,clearTimeout,crypto:webcrypto,TextEncoder,btoa,atob,fetch:async(url,init)=>{if(String(url)==='https://api.resend.com/emails'){mails.push(JSON.parse(init.body));return Response.json({id:'m1'})}return new Response(null,{status:404})}});
const template=read('worker/index.template.js');
vm.runInContext(template.slice(template.indexOf('const API_BASE')).replace('__MOVEMENT_SERVER__',read('worker/movement.js')).replace('__LIVE_SERVER__',read('worker/live.js')).replace('__STATS_SHARED__',read('dist/stats.js')).replace('__RECORDS_SERVER__',read('worker/records.js')).replace('__ACCOUNTS_SERVER__',read('worker/accounts.js')).replace('export default {','this.worker={'),context);
const db=new DatabaseSync(':memory:');
for(const f of ['0004_user_accounts.sql','0007_email_alerts.sql','0000_public_record.sql','0001_record_settlement.sql','0002_historical_replays.sql','0006_push_alerts.sql','0008_book_alerts.sql','0013_follow_alerts.sql','0027_alert_price_view.sql','0031_alert_kinds.sql','0033_alert_nba.sql'])db.exec(read('drizzle/'+f).replaceAll('--> statement-breakpoint',''));
const wrap=(sql,args=[])=>({bind(...v){return wrap(sql,v)},async first(){return db.prepare(sql).get(...args)||null},async all(){return{results:db.prepare(sql).all(...args)}},async run(){const r=db.prepare(sql).run(...args);return{success:true,meta:{changes:Number(r.changes)}}}});
const env={RESEND_API_KEY:'test',DB:{prepare:sql=>wrap(sql),async batch(l){for(const s of l)await s.run()}}};context.env=env;
const run=code=>vm.runInContext(code,context),J=v=>JSON.parse(JSON.stringify(v));
const pushed=[];context.sendPickAlerts=async(env,now,only)=>{pushed.push(...only);return {sent:only.length}};
const A='https://fcm.googleapis.com/fcm/send/phone-a',B='https://fcm.googleapis.com/fcm/send/phone-b',ID='nba|2026-11-04|props|prop|v2|pp';
const api=async body=>J(await (await run(`alertsApi(new Request('https://betthisguy.com/api/alerts/follow',{method:'POST',body:${JSON.stringify(JSON.stringify(body))}}),env)`)).json());
(async()=>{
  for(const e of [A,B])db.prepare("INSERT INTO push_subscriptions (endpoint,p256dh,auth,created_at) VALUES (?,'k','a',?)").run(e,new Date().toISOString());
  db.prepare("INSERT INTO public_recommendations (id,kind,player,market,side,line,odds,game_time,legs_json,posted_at,status,result,source) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'market-verified-v2')")
    .run(ID,'prop','Payton Pritchard','Rebounds','Under',3.5,-102,'2026-11-05T00:40:00.000Z',JSON.stringify([{player:'Payton Pritchard',market:'Rebounds',side:'Under',line:3.5,odds:-102}]),'2026-11-04T18:00:00.000Z','pending',null);
  // Two phones follow; one changes its mind; junk ids and endpoints are refused.
  assert.equal((await api({endpoint:A,pickId:ID})).success,true);assert.equal((await api({endpoint:B,pickId:ID})).success,true);
  assert.equal((await api({endpoint:B,pickId:ID,on:false})).following,false);
  assert.equal((await api({endpoint:A,pickId:'x|nope'})).success,false,'only our picks');
  // A signed-in bettor with pick emails on, and one with them off.
  const now0=new Date().toISOString();
  for(const [u,mail,on] of [['user-aaaaaaaa','fan@example.com',1],['user-bbbbbbbb','quiet@example.com',0]]){db.prepare('INSERT INTO user_profiles(auth_user_id,email,created_at,updated_at) VALUES(?,?,?,?)').run(u,mail,now0,now0);db.prepare('INSERT INTO email_alerts(auth_user_id,enabled,token,created_at,updated_at) VALUES(?,?,?,?,?)').run(u,on,'tok-'+u,now0,now0);J(await run(`followPick(env,'email:${u}',${JSON.stringify(ID)},true)`))}
  assert.deepEqual(JSON.parse(db.prepare("SELECT value FROM app_settings WHERE key=?").get('follow:'+ID).value),[A,'email:user-aaaaaaaa','email:user-bbbbbbbb']);
  // Off until Tim says so.
  const now=Date.parse('2026-11-05T05:00:00Z');
  assert.equal(J(await run(`sendFollowAlerts(env,${now})`)).off,true);
  db.prepare("INSERT INTO app_settings (key,value) VALUES ('follow-alerts','on')").run();
  // Not graded yet: nothing.
  assert.equal(J(await run(`sendFollowAlerts(env,${now})`)).sent,0);assert.equal(pushed.length,0);
  // Graded: one push to the follower, its own message, then the follow is gone.
  db.prepare("UPDATE public_recommendations SET status='final',result='won',legs_json=? WHERE id=?").run(JSON.stringify([{player:'Payton Pritchard',market:'Rebounds',side:'Under',line:3.5,odds:-102,actualValue:2,result:'won'}]),ID);
  const out=J(await run(`sendFollowAlerts(env,${now})`));assert.deepEqual([out.sent,out.settled],[2,1]);assert.deepEqual(pushed,[A]);
  assert.equal(mails.length,1,'one email: only the bettor with pick emails on');assert.deepEqual(mails[0].to,['fan@example.com']);assert.equal(mails[0].subject,'✅ Your bet hit');
  assert.ok(mails[0].html.includes('YOUR BET')&&mails[0].html.includes('Payton Pritchard')&&mails[0].text.includes('tok-user-aaaaaaaa'),'the result, the pick and an unsubscribe link');
  const note=J(await run(`latestAlert(env,${now+60000},${JSON.stringify(A)})`));
  assert.equal(note.title,'✅ Your bet hit');assert.match(note.body,/Payton Pritchard Under 3\.5 rebounds: finished with 2\. Cashed at -102\./);assert.match(note.url,/pick=/);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM app_settings WHERE key LIKE 'follow:%'").get().n,0,'follow cleared');
  assert.equal(J(await run(`sendFollowAlerts(env,${now})`)).sent,0);assert.equal(pushed.length,1,'never twice');
  // A follow on a pick that never grades is dropped after 4 days.
  db.prepare("INSERT INTO public_recommendations (id,kind,player,market,side,line,odds,game_time,legs_json,posted_at,status,result,source) VALUES ('nba|old|x','prop','Old Guy','Points','Over',10.5,100,'2026-10-20T00:00:00.000Z','[]','2026-10-19T00:00:00.000Z','pending',NULL,'market-verified-v2')").run();
  await api({endpoint:A,pickId:'nba|old|x'});await run(`sendFollowAlerts(env,${now})`);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM app_settings WHERE key LIKE 'follow:%'").get().n,0,'stale follow dropped');
  // Wording for a miss and a void.
  assert.equal(run(`followMessage({id:'nba|1',kind:'prop',player:'A B',market:'Points',side:'Over',line:20.5,odds:110,result:'lost',legs_json:JSON.stringify([{actualValue:14}])})`).title,'❌ Your bet missed');
  assert.match(run(`followMessage({id:'nba|1',kind:'prop',player:'A B',market:'Points',side:'Over',line:20.5,odds:110,result:'push',legs_json:JSON.stringify([{voided:true}])})`).body,/voided \(didn’t play\): stake back/);
  console.log('PASS: followed bets: a phone follows a pick from "I bet this", gets one push with the result once graded (only while follow-alerts is on), then the follow is cleared');
})().catch(e=>{console.error(e);process.exit(1)});
