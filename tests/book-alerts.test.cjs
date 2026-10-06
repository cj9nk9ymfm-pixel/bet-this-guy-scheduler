const assert=require('node:assert/strict'),vm=require('node:vm'),{webcrypto}=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const {read}=require('./helpers/client.cjs');
// "My book" alerts: a good-value price at someone's own sportsbook. The fair
// price uses every book (3+ pricing both sides); never an official pick; at most
// one message an hour, 3 props a day, never the same prop twice.
const pushes=[],emails=[];
const context=vm.createContext({URL,URLSearchParams,Request,Response,Headers,AbortSignal,Date,console,setTimeout,clearTimeout,crypto:webcrypto,TextEncoder,btoa,atob,
  fetch:async(url,init={})=>{
    if(String(url)==='https://api.resend.com/emails'){emails.push(JSON.parse(init.body));return Response.json({id:'x'})}
    if(String(url).startsWith('https://fcm.googleapis.com/')){pushes.push(String(url));return new Response(null,{status:201})}
    return new Response(null,{status:404});
  }});
const template=read('worker/index.template.js');
vm.runInContext(template.slice(template.indexOf('const API_BASE')).replace('__MOVEMENT_SERVER__',read('worker/movement.js')).replace('__LIVE_SERVER__',read('worker/live.js')).replace('__STATS_SHARED__',read('dist/stats.js')).replace('__RECORDS_SERVER__',read('worker/records.js')).replace('__ACCOUNTS_SERVER__',read('worker/accounts.js')).replace('export default {','this.worker={'),context);
const db=new DatabaseSync(':memory:');
for(const f of ['0000_public_record.sql','0001_record_settlement.sql','0002_historical_replays.sql','0004_user_accounts.sql','0006_push_alerts.sql','0007_email_alerts.sql','0008_book_alerts.sql'])db.exec(read('drizzle/'+f).replaceAll('--> statement-breakpoint',''));
const wrap=(sql,args=[])=>({bind(...values){return wrap(sql,values)},async first(){return db.prepare(sql).get(...args)||null},async all(){return{results:db.prepare(sql).all(...args)}},async run(){const r=db.prepare(sql).run(...args);return{success:true,meta:{changes:Number(r.changes)}}}});
const DB={prepare:sql=>wrap(sql),async batch(list){const out=[];for(const s of list)out.push(await s.run());return out}};
const env={DB,RESEND_API_KEY:'test'};context.env=env;
const run=code=>vm.runInContext(code,context);
const api=(path,body)=>context.worker.fetch(new Request(`https://betthisguy.com${path}`,body?{method:'POST',body:JSON.stringify(body)}:{}),env,{waitUntil(){}});
const keys={p256dh:'B'.repeat(87),auth:'a'.repeat(22)};
(async()=>{
  const now=Date.now(),iso=t=>new Date(t).toISOString(),kickoff=iso(now+5*3600000),fresh=iso(now-60000);
  const book=(key,title,players)=>({key,title,last_update:fresh,markets:[{key:'player_receptions',last_update:fresh,outcomes:players.flatMap(([player,over,under])=>[{name:'Over',description:player,point:4.5,price:over},{name:'Under',description:player,point:4.5,price:under}])}]});
  const field=['A Player','B Player','C Player','D Player','E Player'];
  const events=[{id:'evt1',commence_time:kickoff,home_team:'Cleveland Browns',away_team:'Pittsburgh Steelers',bookmakers:[
    book('draftkings','DraftKings',field.map(p=>[p,-110,-110])),book('betmgm','BetMGM',field.map(p=>[p,-110,-110])),book('caesars','Caesars',field.map(p=>[p,-110,-110])),
    book('fanduel','FanDuel',field.map((p,i)=>[p,115+i*5,-140]))]}];
  context.events=events;
  const candidates=run(`bookValueCandidates(events,${now})`);
  assert.ok(candidates.length>=5&&candidates.every(c=>c.book==='FanDuel'&&c.edge>=1),'only FanDuel beats the 4-book fair price');
  // Phones sign up with their sportsbooks; the books are stored with the push address.
  const fanduelPhone='https://fcm.googleapis.com/fcm/send/fanduel-only',mgmPhone='https://fcm.googleapis.com/fcm/send/betmgm-only',allPhone='https://fcm.googleapis.com/fcm/send/no-books';
  assert.equal((await api('/api/alerts/subscribe',{endpoint:fanduelPhone,keys,books:['FanDuel']})).status,200);
  await api('/api/alerts/subscribe',{endpoint:mgmPhone,keys,books:['BetMGM']});
  await api('/api/alerts/subscribe',{endpoint:allPhone,keys,books:['<script>']});
  assert.equal(db.prepare('SELECT books_json FROM push_subscriptions WHERE endpoint=?').get(allPhone).books_json,'[]','junk book names are dropped');
  // An account holder with email alerts on and FanDuel saved in Settings.
  db.prepare("INSERT INTO user_profiles(auth_user_id,email,created_at,updated_at) VALUES('u1','fan@example.com','x','x')").run();
  db.prepare("INSERT INTO user_preferences(auth_user_id,preferences_json,created_at,updated_at) VALUES('u1',?, 'x','x')").run(JSON.stringify({books:['FanDuel']}));
  db.prepare("INSERT INTO email_alerts(auth_user_id,enabled,token,created_at,updated_at) VALUES('u1',1,?,'x','x')").run('f'.repeat(64));
  // An official pick on one of these props is announced by the official alerts instead.
  db.prepare("INSERT INTO public_recommendations(id,kind,player,market,side,line,odds,game_time,legs_json,posted_at,status,source) VALUES(?,?,?,?,?,?,?,?,?,?,'pending','market-verified-v2')").run(`official|${run(`officialWeek(${now})`)}|props|prop|x`,'prop','E Player','Receptions','Over',4.5,135,kickoff,'[]',iso(now-3600000));
  let result=JSON.parse(JSON.stringify(await run(`sendBookAlerts(env,events,${now})`)));
  assert.equal(result.sent,2,'the FanDuel phone and the FanDuel email account are told');
  assert.deepEqual(pushes,[fanduelPhone],'BetMGM and no-book phones get nothing');
  const sentKeys=db.prepare("SELECT prop_key FROM book_alerts WHERE recipient=?").all(`push:${fanduelPhone}`).map(r=>r.prop_key);
  assert.equal(sentKeys.length,3,'at most 3 props a day');
  assert.ok(sentKeys.every(k=>!k.includes('E Player')),'an official pick is never repeated as a my-book alert');
  assert.ok(sentKeys.some(k=>k.includes('D Player')),'the best prices go first');
  // The phone's notification text is its own message.
  const note=await (await api(`/api/alerts/latest?endpoint=${encodeURIComponent(fanduelPhone)}`)).json();
  assert.equal(note.title,'Good value at FanDuel');assert.match(note.body,/D Player Over 4\.5 receptions \(\+130\)/);assert.match(note.body,/Not an official pick\./);
  const general=await (await api('/api/alerts/latest')).json();assert.notEqual(general.title,'Good value at FanDuel','other phones still see the official alert text');
  assert.equal(emails.length,1);assert.deepEqual(emails[0].to,['fan@example.com']);
  assert.match(emails[0].subject,/^Good value at FanDuel/);assert.match(emails[0].html,/not official Bet This Guy picks/);assert.match(emails[0].html,/YOUR SPORTSBOOK/);
  assert.ok(emails[0].headers['List-Unsubscribe'].includes('f'.repeat(64)),'one-click unsubscribe still works');
  // Within the hour nothing more; later, only props not sent before, and never past 3 a day.
  result=JSON.parse(JSON.stringify(await run(`sendBookAlerts(env,events,${now+10*60000})`)));assert.equal(result.sent,0,'at most one message an hour');
  result=JSON.parse(JSON.stringify(await run(`sendBookAlerts(env,events,${now+2*3600000})`)));assert.equal(result.sent,0,'the daily cap of 3 holds and nothing repeats');
  console.log('PASS: my-book alerts tell only people whose own sportsbook beats the all-book fair price, skip official picks, cap at 3 a day and 1 message an hour, never repeat, and push and email the right text');
})().catch(error=>{console.error(error);process.exit(1)});
