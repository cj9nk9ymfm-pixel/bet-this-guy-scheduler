// One-off email to the list (Nov 8, Tim: the 9–0 run). Nothing sends until
// app_settings email-blast is set; then everyone on the list (accounts with pick
// emails on, plus active sign-ups, each once) gets it once, with the card image,
// the graded picks and their own unsubscribe link. The card is served at /x/<name>.
const mails=[];const assert=require('node:assert/strict'),vm=require('node:vm'),{webcrypto}=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const {read}=require('./helpers/client.cjs');
const context=vm.createContext({URL,URLSearchParams,Request,Response,Headers,AbortSignal,Date,console,setTimeout,clearTimeout,crypto:webcrypto,TextEncoder,btoa,atob,fetch:async(url,init)=>{if(String(url)==='https://api.resend.com/emails/batch'){mails.push(...JSON.parse(init.body));return Response.json({data:[]})}return new Response(null,{status:404})}});
const template=read('worker/index.template.js');
vm.runInContext(template.slice(template.indexOf('const API_BASE')).replace('__MOVEMENT_SERVER__',read('worker/movement.js')).replace('__LIVE_SERVER__',read('worker/live.js')).replace('__STATS_SHARED__',read('dist/stats.js')).replace('__RECORDS_SERVER__',read('worker/records.js')).replace('__ACCOUNTS_SERVER__',read('worker/accounts.js')).replace('export default {','this.worker={'),context);
const db=new DatabaseSync(':memory:');
for(const f of ['0000_public_record.sql','0001_record_settlement.sql','0002_historical_replays.sql','0004_user_accounts.sql','0006_push_alerts.sql','0007_email_alerts.sql','0029_email_predictions.sql','0034_email_nba.sql','0035_email_subscribers.sql'])db.exec(read('drizzle/'+f).replaceAll('--> statement-breakpoint',''));
const wrap=(sql,args=[])=>({bind(...v){return wrap(sql,v)},async first(){return db.prepare(sql).get(...args)||null},async all(){return{results:db.prepare(sql).all(...args)}},async run(){const r=db.prepare(sql).run(...args);return{success:true,meta:{changes:Number(r.changes)}}}});
const env={RESEND_API_KEY:'test',DB:{prepare:sql=>wrap(sql),async batch(l){for(const s of l)await s.run()}}};
const run=code=>vm.runInContext(code,context),J=v=>JSON.parse(JSON.stringify(v));context.env=env;
(async()=>{
  const now0=new Date().toISOString();
  db.prepare("INSERT INTO public_recommendations (id,kind,sport,player,market,side,line,odds,game_time,legs_json,posted_at,status,result,source) VALUES ('nba|2026-11-08|props|prop|v2|monk','prop','NBA','Malik Monk','3-Pointers Made','Under',1.5,120,'2026-11-09T02:10:00.000Z',?,'2026-11-08T20:00:00.000Z','final','won','market-verified-v2')").run(JSON.stringify([{player:'Malik Monk',market:'3-Pointers Made',side:'Under',line:1.5,odds:120,actualValue:0,result:'won'}]));
  // An account with pick emails on, one with them off, a sign-up, a pending sign-up, and the account's email signed up too.
  for(const [u,mail,on] of [['user-a','fan@example.com',1],['user-b','quiet@example.com',0]]){db.prepare('INSERT INTO user_profiles(auth_user_id,email,created_at,updated_at) VALUES(?,?,?,?)').run(u,mail,now0,now0);db.prepare('INSERT INTO email_alerts(auth_user_id,enabled,token,created_at,updated_at) VALUES(?,?,?,?,?)').run(u,on,'tok-'+u,now0,now0)}
  for(const [mail,status] of [['sub@example.com','active'],['later@example.com','pending'],['FAN@example.com','active']])db.prepare('INSERT INTO email_subscribers(email,token,status,created_at) VALUES(?,?,?,?)').run(mail,'tok-'+mail,status,now0);
  assert.equal(J(await run('sendBlastEmail(env)')).none,true,'nothing sends without email-blast');
  db.prepare("INSERT INTO app_settings (key,value) VALUES ('email-blast',?)").run(JSON.stringify({id:'nine-oh',subject:'9–0 the last two days',heading:'9–0 the last two days',eyebrow:'PERFECT 2 DAYS',lede:'Every sportsbook single we posted hit.',ids:['nba|2026-11-08|props|prop|v2|monk'],image:'nine-oh-2026-11-08.png'}));
  const out=J(await run('sendBlastEmail(env)'));
  assert.deepEqual([out.sent,out.total,out.picks],[2,2,1]);assert.deepEqual(mails.map(m=>m.to[0]).sort(),['fan@example.com','sub@example.com'],'pick emails on and active sign-ups, each once');
  const m=mails.find(x=>x.to[0]==='sub@example.com');
  assert.ok(m.html.includes('/x/nine-oh-2026-11-08.png')&&m.html.includes('Malik Monk')&&m.html.includes('PERFECT 2 DAYS'),'the card, the graded pick and the eyebrow');
  assert.ok(m.text.includes('tok-sub@example.com')&&m.headers['List-Unsubscribe'].includes('tok-sub@example.com'),'their own unsubscribe link');
  assert.equal(J(await run('sendBlastEmail(env)')).done,true);assert.equal(mails.length,2,'never twice');
  console.log('PASS: one-off list email: off until set, once to everyone on the list with the card, the picks and their own unsubscribe');
})().catch(e=>{console.error(e);process.exit(1)});
