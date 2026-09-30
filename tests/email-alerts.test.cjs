const assert=require('node:assert/strict'),vm=require('node:vm'),{webcrypto}=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const {read}=require('./helpers/client.cjs');

const user={id:'22222222-2222-2222-2222-222222222222',email:'fan@example.com',user_metadata:{full_name:'Football Fan',email_alerts:true}};
const sent=[];
const context=vm.createContext({URL,URLSearchParams,Request,Response,Headers,AbortSignal,Date,console,setTimeout,clearTimeout,crypto:webcrypto,TextEncoder,btoa,atob,
  fetch:async(url,init={})=>{
    if(String(url).endsWith('/auth/v1/user'))return init.headers?.authorization==='Bearer valid-token'?Response.json(user):Response.json({},{status:401});
    if(String(url)==='https://api.resend.com/emails/batch'){sent.push({init,body:JSON.parse(init.body)});return Response.json({data:[]})}
    return new Response(null,{status:404});
  }});
const template=read('worker/index.template.js');
vm.runInContext(template.slice(template.indexOf('const API_BASE')).replace('__MOVEMENT_SERVER__',read('worker/movement.js')).replace('__LIVE_SERVER__',read('worker/live.js')).replace('__STATS_SHARED__',read('dist/stats.js')).replace('__RECORDS_SERVER__',read('worker/records.js')).replace('__ACCOUNTS_SERVER__',read('worker/accounts.js')).replace('export default {','this.worker={'),context);
const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
for(const f of ['0000_public_record.sql','0001_record_settlement.sql','0002_historical_replays.sql','0004_user_accounts.sql','0006_push_alerts.sql','0007_email_alerts.sql'])db.exec(read('drizzle/'+f).replaceAll('--> statement-breakpoint',''));
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
  // The sign-up checkbox (stored on the Supabase user) turns alerts on at the first signed-in request.
  let me=await (await request('/api/me',authed())).json();
  assert.equal(me.emailAlerts,true,'sign-up opt-in turns email alerts on');
  const token=db.prepare('SELECT token FROM email_alerts').get().token;assert.match(token,/^[0-9a-f]{64}$/);
  // Switching off sticks, even though the sign-up flag is still on the user.
  assert.equal((await request('/api/me/email-alerts',authed('PUT',{enabled:false}))).status,200);
  me=await (await request('/api/me',authed())).json();assert.equal(me.emailAlerts,false,'turning alerts off sticks');
  assert.equal((await request('/api/me/email-alerts',authed('PUT',{enabled:'yes'}))).status,400,'only true or false is accepted');
  assert.equal((await request('/api/me/email-alerts',{method:'PUT',body:'{"enabled":true}'})).status,401,'changing alerts needs a session');
  await request('/api/me/email-alerts',authed('PUT',{enabled:true}));
  assert.equal(db.prepare('SELECT token FROM email_alerts').get().token,token,'the unsubscribe token stays the same');

  const now=Date.parse('2026-10-04T12:00:00Z'),iso=t=>new Date(t).toISOString();
  // Without the Resend key nothing is sent.
  pick('a','Jonnu Smith',iso(now+5*3600000),iso(now-20*60000));
  pick('old','Started Guy',iso(now-10*60000),iso(now-30*60000));
  assert.equal(plain(await run(`sendEmailAlerts(env,${now})`)).disabled,true);assert.equal(sent.length,0);
  env.RESEND_API_KEY='re_test';env.EMAIL_POSTAL_ADDRESS='PO Box 1, Anytown, USA';
  let result=plain(await run(`sendEmailAlerts(env,${now})`));
  assert.deepEqual([result.sent,result.picks],[1,1],'one email with the one pick whose game has not started');
  const email=sent[0].body[0];
  assert.equal(sent[0].init.headers.authorization,'Bearer re_test');
  assert.deepEqual(email.to,['fan@example.com']);assert.equal(email.from,'Bet This Guy <picks@betthisguy.com>');
  assert.equal(email.subject,'✅ New pick: Jonnu Smith Over 4.5 receptions');
  assert.equal(email.headers['List-Unsubscribe'],`<https://betthisguy.com/api/email-alerts/unsubscribe?token=${token}>`);
  assert.equal(email.headers['List-Unsubscribe-Post'],'List-Unsubscribe=One-Click');
  assert.ok(email.html.includes('Jonnu Smith')&&email.html.includes('+120')&&email.html.includes('DraftKings')&&!email.html.includes('Started Guy'));
  assert.ok(email.html.includes('PO Box 1, Anytown, USA')&&email.text.includes(`unsubscribe?token=${token}`));
  // Nothing new: nothing sent. A new pick far from kickoff waits for the hourly limit.
  assert.equal(plain(await run(`sendEmailAlerts(env,${now+5*60000})`)).sent,0);
  pick('b','Far Away',iso(now+8*3600000),iso(now+10*60000));
  assert.equal(plain(await run(`sendEmailAlerts(env,${now+15*60000})`)).throttled,true,'a second email within the hour is held');
  // A pick kicking off within 90 minutes goes out after 10 minutes, together with the held one.
  pick('c','Soon Guy',iso(now+80*60000),iso(now+14*60000),{kind:'parlay',combined:596,legs:JSON.stringify([{player:'Soon Guy',market:'Receptions',side:'Over',line:4.5,odds:120},{player:'Other Guy',market:'Rushing Yards',side:'Under',line:50.5,odds:-110}])});
  result=plain(await run(`sendEmailAlerts(env,${now+16*60000})`));
  assert.deepEqual([result.sent,result.picks],[1,2]);
  assert.equal(sent[1].body[0].subject,'✅ 2 new Bet This Guy picks');assert.ok(sent[1].body[0].html.includes('2-leg parlay')&&sent[1].body[0].html.includes('Far Away'));
  // Two instances racing: only the one that claims the send emails.
  pick('d','Race Guy',iso(now+60*60000),iso(now+30*60000));
  const race=plain(await Promise.all([run(`sendEmailAlerts(env,${now+31*60000})`),run(`sendEmailAlerts(env,${now+31*60000})`)]));
  assert.equal(race.filter(r=>r.sent===1).length,1,'the same picks are emailed once');

  // Unsubscribe: a visit shows a button and changes nothing; the POST (or a mail app's one-click) unsubscribes.
  const page=await request(`/api/email-alerts/unsubscribe?token=${token}`);
  assert.equal(page.status,200);assert.ok((await page.text()).includes('<form method="post">'));
  assert.equal(db.prepare('SELECT enabled FROM email_alerts').get().enabled,1,'visiting the link does not unsubscribe');
  assert.equal((await request('/api/email-alerts/unsubscribe?token=nope')).status,400);
  const done=await request(`/api/email-alerts/unsubscribe?token=${token}`,{method:'POST',body:'List-Unsubscribe=One-Click',headers:{'content-type':'application/x-www-form-urlencoded'}});
  assert.equal(done.status,200);assert.equal(db.prepare('SELECT enabled FROM email_alerts').get().enabled,0);
  pick('e','After Unsub',iso(now+50*60000),iso(now+45*60000));
  assert.equal(plain(await run(`sendEmailAlerts(env,${now+46*60000})`)).total,0,'unsubscribed people get nothing');
  console.log('PASS: email alerts: sign-up opt-in, sticky opt-out, one email per batch of new picks, started games skipped, hourly limit with a kickoff exception, one send per batch across instances, one-click unsubscribe (real SQLite)');
})().catch(e=>{console.error(e);process.exitCode=1});
