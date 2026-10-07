const assert=require('node:assert/strict'),vm=require('node:vm'),{webcrypto}=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const {read}=require('./helpers/client.cjs');

const sent=[];
const context=vm.createContext({URL,URLSearchParams,Request,Response,Headers,AbortSignal,Date,console,setTimeout,clearTimeout,crypto:webcrypto,TextEncoder,btoa,atob,
  fetch:async(url,init={})=>{if(String(url)==='https://api.resend.com/emails/batch'){sent.push(JSON.parse(init.body));return Response.json({data:[]})}return new Response(null,{status:404})}});
const template=read('worker/index.template.js');
vm.runInContext(template.slice(template.indexOf('const API_BASE')).replace('__MOVEMENT_SERVER__',read('worker/movement.js')).replace('__LIVE_SERVER__',read('worker/live.js')).replace('__STATS_SHARED__',read('dist/stats.js')).replace('__RECORDS_SERVER__',read('worker/records.js')).replace('__ACCOUNTS_SERVER__',read('worker/accounts.js')).replace('export default {','this.worker={'),context);
const db=new DatabaseSync(':memory:');
for(const f of ['0000_public_record.sql','0001_record_settlement.sql','0002_historical_replays.sql','0004_user_accounts.sql','0006_push_alerts.sql','0007_email_alerts.sql'])db.exec(read('drizzle/'+f).replaceAll('--> statement-breakpoint',''));
const wrap=(sql,args=[])=>({bind(...values){return wrap(sql,values)},async first(){return db.prepare(sql).get(...args)||null},async all(){return{results:db.prepare(sql).all(...args)}},async run(){const r=db.prepare(sql).run(...args);return{success:true,meta:{changes:Number(r.changes)}}}});
const env={DB:{prepare:sql=>wrap(sql)},RESEND_API_KEY:'test'};context.env=env;
const run=code=>vm.runInContext(code,context);
const now=new Date().toISOString();
db.prepare("INSERT INTO user_profiles(auth_user_id,email,created_at,updated_at) VALUES('u1','fan@example.com',?,?)").run(now,now);
db.prepare("INSERT INTO email_alerts(auth_user_id,enabled,token,created_at,updated_at) VALUES('u1',1,'tok123',?,?)").run(now,now);
db.prepare("INSERT INTO user_profiles(auth_user_id,email,created_at,updated_at) VALUES('u2','off@example.com',?,?)").run(now,now);
db.prepare("INSERT INTO email_alerts(auth_user_id,enabled,token,created_at,updated_at) VALUES('u2',0,'tok456',?,?)").run(now,now);
const pick=(id,player,odds,result,extra={})=>db.prepare("INSERT INTO public_recommendations(id,kind,player,market,side,line,odds,combined_odds,game_time,legs_json,posted_at,status,result,source) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'market-verified-v2')").run(id,extra.kind||'prop',player,'Receptions','Over',4.5,odds,extra.combined??null,'2026-10-04T17:00:00.000Z',JSON.stringify(extra.legs||[{player,market:'Receptions',side:'Over',line:4.5,odds,actualValue:6}]),'2026-10-01T12:00:00.000Z','final',result);
pick('official|2026-09-29|props|prop|a','Drake London',120,'won');
pick('official|2026-09-29|props|prop|b','Bijan <b>Robinson</b>',-110,'lost');
pick('official|2026-09-22|props|prop|c','Jonnu Smith',175,'won');
pick('official|2026-10-06|props|prop|d','Next Week Guy',100,null);
(async()=>{
  // Not Tuesday morning yet: nothing.
  assert.equal((await run("sendWeeklyDigest(env,Date.parse('2026-10-06T14:00:00Z'))")).due,false);
  assert.equal((await run("sendWeeklyDigest(env,Date.parse('2026-10-05T16:00:00Z'))")).due,false,'Monday is not digest day');
  const out=await run("sendWeeklyDigest(env,Date.parse('2026-10-06T15:05:00Z'))");
  assert.equal(out.week,'2026-09-29');assert.equal(out.sent,1,'only people with alerts on');assert.equal(out.picks,2);
  const mail=sent[0][0];
  assert.deepEqual(mail.to,['fan@example.com']);
  assert.equal(mail.subject,'📊 Week 4: 1–1 on props, +$20');
  assert.ok(mail.html.includes('WEEKLY RESULTS')&&mail.html.includes('Drake London')&&mail.html.includes('+$120'),'lists last week with profit');
  assert.ok(mail.html.includes('Season: 2–1 on props, +$195'),'season record through last week only');
  assert.ok(!mail.html.includes('Next Week Guy'),'this week is not in the digest');
  assert.ok(mail.html.includes('Bijan &lt;b&gt;Robinson&lt;/b&gt;')&&!mail.html.includes('<b>Robinson'),'stored text is escaped');
  assert.ok(mail.html.includes('https://betthisguy.com/picks/2026/week-4')&&mail.text.includes('tok123'));
  assert.equal(mail.headers['List-Unsubscribe'],'<https://betthisguy.com/api/email-alerts/unsubscribe?token=tok123>');
  // Once per week, even across runs.
  assert.equal((await run("sendWeeklyDigest(env,Date.parse('2026-10-06T15:15:00Z'))")).done,true);assert.equal(sent.length,1);
  // A week with no picks sends nothing.
  const empty=await run("sendWeeklyDigest(env,Date.parse('2026-10-20T15:05:00Z'))");assert.equal(empty.empty,true);assert.equal(sent.length,1);
  console.log('PASS: weekly digest goes out Tuesday morning once, to email subscribers, with last week and the season record');
})().catch(error=>{console.error(error);process.exit(1)});
