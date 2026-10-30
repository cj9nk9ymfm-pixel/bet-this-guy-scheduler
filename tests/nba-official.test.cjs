const {webcrypto}=require('node:crypto'),fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path'),{DatabaseSync}=require('node:sqlite');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
// Official NBA picks: the NFL price rules on games tipping within 36 hours,
// one single per game, only the core markets, ids under nba|<night>|, graded
// from the box score (a player who didn't play is a push), and kept out of
// every NFL query.
let now=Date.parse('2026-10-27T21:00:00Z');
class Clock extends Date{constructor(...a){super(...(a.length?a:[now]))}static now(){return now}}
const tip1='2026-10-27T23:30:00Z',tip2='2026-10-28T00:00:00Z',late='2026-10-28T02:30:00Z',far='2026-10-29T10:00:00Z';let final=false;const posts=[];
const out=(player,point,over,under=-110)=>[{name:'Over',description:player,point,price:over},{name:'Under',description:player,point,price:under}];
// DraftKings hangs a good Over on each listed player; the other books agree on -110.
const games={
  nba1:{tip:tip1,home:'Boston Celtics',away:'New York Knicks',markets:dk=>[{key:'player_points',outcomes:[...out('Jayson Tatum',27.5,dk?115:-110),...out('Jaylen Brown',22.5,dk?112:-110)]},{key:'player_blocks',outcomes:out('Kristaps Porzingis',1.5,dk?130:-110)}]},
  nba2:{tip:tip2,home:'San Antonio Spurs',away:'Oklahoma City Thunder',markets:dk=>[{key:'player_rebounds',outcomes:out('Victor Wembanyama',11.5,dk?114:-110)}]},
  nba3:{tip:far,home:'Los Angeles Lakers',away:'Golden State Warriors',markets:dk=>[{key:'player_points',outcomes:out('Stephen Curry',26.5,dk?118:-110)}]}
};
const book=(key,title,id)=>({key,title,last_update:new Date(now-60000).toISOString(),markets:games[id].markets(key==='draftkings').map(m=>({...m,last_update:new Date(now-60000).toISOString()}))});
const team=(id,full_name)=>({id,full_name});
const context=vm.createContext({Date:Clock,URL,URLSearchParams,Request,Response,Headers,AbortSignal,setTimeout,clearTimeout,console,crypto:webcrypto,TextEncoder,btoa,atob,
  fetch:async (url,init)=>{url=new URL(url);
    if(url.hostname==='api.the-odds-api.com'){
      if(url.pathname.endsWith('/events'))return Response.json(url.pathname.includes('basketball_nba')?Object.entries(games).map(([id,g])=>({id,commence_time:g.tip,home_team:g.home,away_team:g.away})):[]);
      const id=url.pathname.split('/events/')[1]?.split('/')[0],g=games[id];if(!g)return new Response('{}',{status:404});
      return Response.json({id,commence_time:g.tip,home_team:g.home,away_team:g.away,bookmakers:[book('draftkings','DraftKings',id),book('fanduel','FanDuel',id),book('betmgm','BetMGM',id),book('fanatics','Fanatics',id)]});
    }
    if(url.hostname.includes('espn.com'))return Response.json({injuries:[]});
    if(url.hostname==='api.twitter.com'&&url.pathname==='/2/tweets'){const body=JSON.parse(init?.body||'{}');posts.push(body);return Response.json({data:{id:String(1000+posts.length)}})}
    if(url.hostname.includes('twitter.com')||url.hostname.includes('x.com'))return new Response('{}',{status:403});
    const p=url.pathname.replace(/^\/(nba\/)?v1/,'');
    if(p==='/games')return Response.json({data:[{id:9001,date:'2026-10-27',datetime:tip1,status:final?'Final':'7:30 pm ET',period:final?4:0,home_team:team(2,'Boston Celtics'),visitor_team:team(20,'New York Knicks')},{id:9002,date:'2026-10-27',datetime:tip2,status:final?'Final':'8:00 pm ET',period:final?4:0,home_team:team(27,'San Antonio Spurs'),visitor_team:team(21,'Oklahoma City Thunder')}]});
    if(p==='/stats'){const g=url.searchParams.get('game_ids[]');
      const rows=g==='9001'?[{pts:31,reb:8,ast:4,fg3m:3,min:'36',player:{id:434,first_name:'Jayson',last_name:'Tatum'},team:team(2,'Boston Celtics'),game:{id:9001,date:'2026-10-27',status:final?'Final':'3rd Qtr'}}]
        :[{pts:18,reb:9,ast:2,fg3m:1,min:'00',player:{id:900,first_name:'Victor',last_name:'Wembanyama'},team:team(27,'San Antonio Spurs'),game:{id:9002,date:'2026-10-27',status:final?'Final':'3rd Qtr'}}];
      return Response.json({data:rows,meta:{}})}
    return new Response('{}',{status:404});
  }});
const template=read('worker/index.template.js');
vm.runInContext(template.slice(template.indexOf('const API_BASE')).replace('__MOVEMENT_SERVER__',read('worker/movement.js')).replace('__LIVE_SERVER__',read('worker/live.js')).replace('__STATS_SHARED__',read('dist/stats.js')).replace('__RECORDS_SERVER__',read('worker/records.js')).replace('__ACCOUNTS_SERVER__',read('worker/accounts.js')).replace('export default {','this.worker={'),context);
// These tests cover a post per pick (x-lean off); tests/x-lean.test.cjs covers lean posting.
vm.runInContext('X_PICK_POSTS_DEFAULT=false;X_LEAN_DEFAULT=false',context);
const db=new DatabaseSync(':memory:');for(const f of ['0000_public_record.sql','0001_record_settlement.sql','0002_historical_replays.sql','0012_nba_shadow.sql','0018_player_form.sql','0021_injuries.sql','0006_push_alerts.sql','0008_book_alerts.sql','0013_follow_alerts.sql','0027_alert_price_view.sql','0031_alert_kinds.sql','0033_alert_nba.sql','0004_user_accounts.sql','0007_email_alerts.sql','0029_email_predictions.sql','0034_email_nba.sql','0028_prediction_picks.sql','0032_prediction_early.sql','0036_void_reason.sql'])db.exec(read('drizzle/'+f).replaceAll('--> statement-breakpoint',''));db.exec('CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT)');
const wrap=(sql,args=[])=>({bind(...v){return wrap(sql,v)},async first(){return db.prepare(sql).get(...args)||null},async all(){return{results:db.prepare(sql).all(...args)}},async run(){const r=db.prepare(sql).run(...args);return{success:true,meta:{changes:Number(r.changes)}}}});
const env={DB:{prepare:sql=>wrap(sql),async batch(l){const out=[];for(const s of l)out.push(await s.run());return out}},THE_ODDS_API_KEY:'k',BALLDONTLIE_API_KEY:'k',X_API_KEY:'a',X_API_SECRET:'b',X_ACCESS_TOKEN:'1-c',X_ACCESS_SECRET:'d'};context.env=env;
const run=c=>vm.runInContext(c,context),req='new Request("https://betthisguy.com/api/maintenance")';
(async()=>{
  // The stats feed's "LA Clippers" is the odds feed's "Los Angeles Clippers" (grading and live matching).
  assert.equal(run("normalizedName('LA Clippers')"),run("normalizedName('Los Angeles Clippers')"));
  // Before opening night nothing posts.
  assert.equal((await run(`publishNbaPicks(${req},env,{waitUntil(){}},${Date.parse('2026-10-18T21:00:00Z')})`)).state,'not_started');
  // New picks set off the alerts and X jobs at once, not on the next scheduled run.
  const announced=[];env.MAINTENANCE_TOKEN='m';env.SELF={fetch:async q=>{announced.push(new URL(q.url).searchParams.get('job'));return new Response('{}')}};
  const first=await run(`publishNbaPicks(${req},env,{waitUntil(){}},${now})`);
  assert.deepEqual(announced.sort(),['alerts','xpost'],'a lock announces at once');delete env.SELF;delete env.MAINTENANCE_TOKEN;
  assert.equal(first.state,'completed');assert.equal(first.games,2,'only games tipping within 36 hours');
  const rows=db.prepare('SELECT * FROM public_recommendations ORDER BY id').all()
  const singles=rows.filter(r=>r.kind==='prop').sort((a,b)=>a.player.localeCompare(b.player));
  assert.ok(singles.some(r=>r.player==='Jayson Tatum'&&r.market==='Points'&&r.odds===115)&&singles.some(r=>r.player==='Victor Wembanyama'&&r.market==='Rebounds'&&r.odds===114),'the best edges post');
  assert.ok(singles.some(r=>r.player==='Jaylen Brown'),'more than one pick from a game when each clears the bar');
  assert.equal(new Set(singles.map(r=>r.player)).size,singles.length,'one pick per player');
  assert.ok(rows.every(r=>r.id.startsWith('nba|2026-10-27|')&&r.sport==='NBA'),'nightly NBA ids and sport');
  assert.ok(!singles.some(r=>r.player==='Kristaps Porzingis'),'blocks are not an official NBA market');
  // A second run adds nothing new (the same props, already posted).
  run('runtimeFeedCache.clear()');await run(`publishNbaPicks(${req},env,{waitUntil(){}},${now+600000})`);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM public_recommendations WHERE kind='prop'").get().n,singles.length);
  // The rest follows the two best picks (Tatum, Wembanyama).
  db.prepare("DELETE FROM public_recommendations WHERE kind='prop' AND player NOT IN ('Jayson Tatum','Victor Wembanyama')").run();
  // NFL readers never see NBA picks.
  assert.equal((await run('homeRecentRows(env)')).length,0,'the NFL home leaves NBA picks out');
  // Worth a look: the near misses are saved for /api/leans?sport=NBA (none here beyond the picks).
  assert.ok(JSON.parse(db.prepare("SELECT value FROM app_settings WHERE key='nba-leans'").get().value).leans.every(l=>!['Jayson Tatum','Victor Wembanyama'].includes(l.player)),'picks never repeat in Worth a look');
  // Alerts: the phone's text names the NBA pick; a phone with NBA alerts off is skipped.
  db.prepare("INSERT INTO push_subscriptions (endpoint,p256dh,auth,created_at) VALUES ('https://fcm.googleapis.com/fcm/send/a','x','y','2026-10-01')").run();
  db.prepare("INSERT INTO push_subscriptions (endpoint,p256dh,auth,created_at,alert_nba) VALUES ('https://fcm.googleapis.com/fcm/send/b','x','y','2026-10-01',0)").run();
  const alert=await run(`latestAlert(env,${now},'https://fcm.googleapis.com/fcm/send/a')`);
  assert.equal(alert.title,'🏀 2 new NBA picks');assert.match(alert.body,/Jayson Tatum Over 27.5 points \(\+115, DraftKings\)/);assert.match(alert.url,/^\/\?league=NBA&pick=nba%7C/,'the alert opens on the newest NBA pick');
  assert.notEqual((await run(`latestAlert(env,${now},'https://fcm.googleapis.com/fcm/send/b')`)).title,'🏀 2 new NBA picks','NBA alerts off');
  // Email: one batched NBA email to accounts with email alerts and NBA on.
  for(const [id,nba] of [['u1',1],['u2',0]]){db.prepare("INSERT INTO user_profiles (auth_user_id,email,created_at,updated_at) VALUES (?,?,'2026-10-01','2026-10-01')").run(id,id+'@example.com');db.prepare("INSERT INTO email_alerts (auth_user_id,enabled,token,created_at,updated_at,nba) VALUES (?,1,?,'2026-10-01','2026-10-01',?)").run(id,'t'+id,nba)}
  {const sentMail=[];const before=context.fetch;context.fetch=async(url,init)=>{if(String(url).includes('api.resend.com')){sentMail.push(...JSON.parse(init.body));return Response.json({data:[]})}return before(url,init)};run('fetch=globalThis.fetch');env.RESEND_API_KEY='r';
   const out=await run(`sendNbaEmails(env,${now})`);assert.deepEqual([out.sent,out.picks],[1,2]);
   assert.deepEqual(sentMail.map(m=>m.to[0]),['u1@example.com'],'NBA off: no email');assert.equal(sentMail[0].subject,'🏀 2 new NBA picks');assert.match(sentMail[0].text,/league=NBA/);
   assert.equal((await run(`sendNbaEmails(env,${now+600000})`)).sent,0,'the same picks never email twice');
   context.fetch=before;run('fetch=globalThis.fetch');delete env.RESEND_API_KEY}
  // X: no card until 35 minutes before the first tip; then one card with every pick.
  assert.equal((await run(`postNbaCardToX(env,${now})`)).due,false);
  const cardAt=Date.parse(tip1)-30*60000;
  // The night's prediction-app pick goes on the card too.
  db.prepare("INSERT INTO prediction_picks(id,exchange,event_id,player,team,market,side,line,odds,net_odds,fair_pct,edge,game_time,posted_at) VALUES('pm|NBA--x|jaysontatum','Novig','NBA--x','Jaylen Brown','x','Points','Over',24.5,110,110,51,3,?,'2026-10-01')").run(tip1);
  assert.equal((await run(`postNbaCardToX(env,${cardAt})`)).posted,1);
  assert.match(posts.at(-1).text,/Prediction apps:\n• Jaylen Brown Over 24.5 points \(48% on Novig\)/);
  assert.equal((await run(`postNbaCardToX(env,${cardAt+600000})`)).posted,0,'once a night');
  assert.match(posts[0].text,/^🏀 (Tonight|Today)’s NBA picks/);
  // Singles also get their own post as they lock (two a run, 3 a day), never twice.
  assert.equal((await run(`postNbaPicksToX(env,${cardAt+30000})`)).posted,0,'a single already on the card gets no post of its own');
  db.prepare("DELETE FROM app_settings WHERE key LIKE 'x-nba-pick:%'").run();
  // A parlay locked after the singles gets its own post too.
  db.prepare("INSERT INTO public_recommendations (id,kind,sport,combined_odds,game_id,game_time,legs_json,posted_at,status,source,created_at) VALUES ('nba|test|swing|parlay|v2|p1','parlay','NBA',264,'NBA--x',?,?,?,'pending','market-verified-v2','2026-10-01')").run(tip1,JSON.stringify([{player:'Jayson Tatum',market:'Points',side:'Over',line:27.5,odds:115,sport:'NBA',gameTime:tip1,team:'x'},{player:'Victor Wembanyama',market:'Rebounds',side:'Over',line:11.5,odds:114,sport:'NBA',gameTime:tip1,team:'x'}]),new Date(cardAt).toISOString());
  {const before=posts.length,r1=await run(`postNbaPicksToX(env,${cardAt+60000})`);assert.equal(r1.posted,2,'picks that lock together post together');
   assert.match(posts[before].text,/^(⭐ Top pick|🔒 Official pick) · NBA\n/);assert.ok(!/https?:|\.com\b/.test(posts[before].text),'no links');
   for(let i=0;i<6;i++)await run(`postNbaPicksToX(env,${cardAt+120000+i*60000})`);const own=posts.slice(before).filter(p=>/ · NBA\n/.test(p.text));
   assert.ok(own.length===new Set(own.map(p=>p.text)).size,'no pick posted twice');
   assert.ok(own.some(p=>/^🔒 Official parlay · NBA\n2-leg parlay \+264\n• Jayson Tatum Over 27.5 points/.test(p.text)),'the parlay posts on its own');
   db.prepare("DELETE FROM public_recommendations WHERE id='nba|test|swing|parlay|v2|p1'").run();posts.splice(before)}assert.match(posts[0].text,/Victor Wembanyama Over 11.5 rebounds \(\+114, DraftKings\)/);
  // A one-off post (x-custom-post) with an image shipped in dist/x/: once, image attached.
  {context.FormData??=FormData;context.Blob??=Blob;const before=context.fetch;context.fetch=async(u,i)=>String(u).includes('/2/media/upload')?Response.json({data:{id:'m1'}}):before(u,i);run('fetch=globalThis.fetch');
   run("globalThis.X_POST_IMAGES={'night.png':btoa('png bytes')}");const n=posts.length;
   db.prepare("INSERT INTO app_settings (key,value) VALUES ('x-custom-post',?)").run(JSON.stringify({id:'night1',text:'NBA opening night: 8–3 🏀',image:'night.png'}));
   {const r=await run(`postCustomToX(env,${cardAt})`);assert.equal(r.posted,1,JSON.stringify(r));assert.equal(r.graphic,true)}
   assert.equal(posts.at(-1).text,'NBA opening night: 8–3 🏀');assert.deepEqual(posts.at(-1).media,{media_ids:['m1']});
   assert.equal(db.prepare("SELECT value FROM app_settings WHERE key='xid:x-custom:night1'").get()?.value,String(1000+posts.length),'its post id is saved');
   assert.equal((await run(`postCustomToX(env,${cardAt+300000})`)).none,true,'once');assert.equal(posts.length,n+1);
   db.prepare("INSERT INTO app_settings (key,value) VALUES ('x-custom-post',?)").run(JSON.stringify({text:'x',image:'missing.png'}));
   assert.equal((await run(`postCustomToX(env,${cardAt+600000})`)).invalid,true,'an image not in the build never posts');assert.equal(posts.length,n+1);
   db.prepare("DELETE FROM app_settings WHERE key LIKE 'x-custom%' OR key LIKE 'xid:x-custom%'").run();context.fetch=before;run('fetch=globalThis.fetch');posts.splice(n)}
  // A hold stops NBA posts.
  db.prepare("INSERT INTO app_settings (key,value) VALUES ('x-nba','hold')").run();
  assert.equal((await run(`postNbaRepliesToX(env,${cardAt})`)).disabled,true);
  db.prepare("DELETE FROM app_settings WHERE key='x-nba'").run();
  assert.equal((await run(`postNbaRepliesToX(env,${cardAt})`)).posted,0,'nothing to add or grade yet');
  // Grading: Tatum's 31 wins; Wembanyama played 0 minutes, so his pick is a push (no action).
  now=Date.parse('2026-10-28T04:00:00Z');final=true;
  await run('settlePublicRecords(env)');now+=6*60000;run('runtimeFeedCache.clear()');await run('settlePublicRecords(env)');
  const graded=Object.fromEntries(db.prepare("SELECT player,result,status,legs_json FROM public_recommendations WHERE kind='prop'").all().map(r=>[r.player,r]));
  assert.deepEqual([graded['Jayson Tatum'].result,graded['Jayson Tatum'].status],['won','final']);
  assert.equal(graded['Victor Wembanyama'].result,'push','a player who did not play is no action');
  assert.equal(JSON.parse(graded['Victor Wembanyama'].legs_json)[0].voided,true,'marked as voided for the display');
  // Results reply under the card, then the recap once the night is graded.
  // A run that hits its limit with results still waiting says so (the next run starts at once).
  const capped=await run(`postNbaRepliesToX(env,${now},1)`);assert.equal(capped.posted,1);assert.equal(capped.more,true,'more results are waiting');
  let replies=await run(`postNbaRepliesToX(env,${now},5)`);assert.ok(!replies.more,'nothing left');
  assert.deepEqual([capped.results+replies.results,replies.recap],[2,0],'the recap waits for the night’s prediction-app pick to grade');
  db.prepare("UPDATE prediction_picks SET result='won',actual=27 WHERE id='pm|NBA--x|jaysontatum'").run();
  replies=await run(`postNbaRepliesToX(env,${now+60000},5)`);assert.equal(replies.recap,1,'then posts');
  const texts=posts.slice(1).map(p=>p.text);
  // Each result answers the pick's own post when it has one; the recap goes under the card.
  {const own=Object.fromEntries(db.prepare("SELECT p.player,a.value FROM public_recommendations p JOIN app_settings a ON a.key='xid:'||p.id WHERE p.kind='prop'").all().map(r=>[r.player,r.value]));
   assert.ok(Object.keys(own).length>=1,'the singles had their own posts');
   for(const p of posts.slice(1)){const who=Object.keys(own).find(n=>p.text.includes(n));assert.equal(p.reply?.in_reply_to_tweet_id,who&&!/^🏀/.test(p.text)?own[who]:'1001',p.text.split('\n')[0])}}
  assert.ok(texts.some(t=>/^✅ HIT: Jayson Tatum Over 27.5 points \(\+115\)\nFinal: 31 points\.\n\+\$115 on a \$100 pick\./.test(t)),texts.join('|'));
  assert.ok(texts.some(t=>/^➖ NO ACTION: Victor Wembanyama.*didn’t play/s.test(t)));
  assert.ok(texts.some(t=>/^🏀 NBA (tonight|last night): 1–0–1, \+\$115\.\nPrediction apps: 1–0, \+\$110\./.test(t)),'the recap counts the prediction-app picks: '+texts.join('|'));
  assert.equal((await run(`postNbaRepliesToX(env,${now+600000},5)`)).posted,0,'each reply once');
  // One-off email: sent once per id, from a betthisguy.com address, nothing without the setting.
  const mails=[];const realFetch=context.fetch;context.fetch=async(url,init)=>{if(String(url).includes('api.resend.com')){mails.push(JSON.parse(init.body));return Response.json({id:'e1'})}return realFetch(url,init)};run('fetch=globalThis.fetch');env.RESEND_API_KEY='r';
  assert.equal((await run('sendCustomEmail(env)')).none,true);
  db.prepare("INSERT INTO app_settings (key,value) VALUES ('email-custom',?)").run(JSON.stringify({id:'novig-1',to:'affiliates@novig.co',from:'Bet This Guy <partners@betthisguy.com>',bcc:'support@betthisguy.com',subject:'Hi',text:'Hello'}));
  assert.equal((await run('sendCustomEmail(env)')).sent,1);assert.equal((await run('sendCustomEmail(env)')).done,true,'once');
  assert.deepEqual([mails.length,mails[0].from,mails[0].to[0],mails[0].reply_to,mails[0].bcc[0]],[1,'Bet This Guy <partners@betthisguy.com>','affiliates@novig.co','support@betthisguy.com','support@betthisguy.com']);
  context.fetch=realFetch;run('fetch=globalThis.fetch');
  // The NBA record endpoint.
  const res=await run(`worker.fetch(new Request('https://betthisguy.com/api/record?view=home&sport=NBA'),env,{waitUntil(){}})`);
  const body=await res.json();
  assert.equal(body.sport,'NBA');assert.deepEqual([body.season.wins,body.season.losses,body.season.pushes],[1,0,1]);
  assert.equal(body.recent.length,db.prepare("SELECT COUNT(*) n FROM public_recommendations WHERE id LIKE 'nba|%'").get().n);assert.equal(body.tonight,'2026-10-27');
  // NBA pages: the index with the record, each night's page, the sitemap.
  {const page=await run(`nbaPage(new Request('https://betthisguy.com/nba'),env)`);assert.equal(page.status,200);const html=await page.text();
   assert.match(html,/NBA player prop picks tonight/);assert.match(html,/href="\/nba\/2026-10-27"/);assert.match(html,/1–0–1/);
   const night=await (await run(`nbaPage(new Request('https://betthisguy.com/nba/2026-10-27'),env)`)).text();
   assert.match(night,/Jayson Tatum/);assert.match(night,/>No action</,'a player who sat shows as no action');
   assert.equal(await run(`nbaPage(new Request('https://betthisguy.com/nba/2026-10-01'),env)`),null,'a night with no picks is not a page');
   assert.match(await run('weeklySitemap(env)'),/\/nba\/2026-10-27/)}
  // Launch post: once the first regular-season game has props, one post (a hold stops it).
  run('runtimeFeedCache.clear()');
  assert.equal((await run(`watchNbaLaunch(${req},env,{waitUntil(){}},${Date.parse('2026-10-14T12:00:00Z')})`)).waiting,true,'not before 4 days out');
  assert.ok((await run(`watchNbaLaunch(${req},env,{waitUntil(){}},${now})`)).props>0);
  // Launch thread: five posts at 9 AM PT on opening day, each a reply to the one before, once.
  const launchAt=Date.parse('2026-10-20T16:00:00Z'),before=posts.length;
  assert.equal((await run(`postNbaLaunchToX(env,${launchAt-60000})`)).due,false,'not before 9 AM PT Tuesday');
  assert.equal((await run(`postNbaLaunchToX(env,${launchAt})`)).posted,5);
  assert.equal((await run(`postNbaLaunchToX(env,${launchAt+600000})`)).done,true,'once');
  const thread=posts.slice(before);
  assert.match(thread[0].text,/^🏀 NBA player props start today on Bet This Guy\./);assert.ok(!thread[0].reply,'the first post starts the thread');
  assert.ok(thread.slice(1).every((p,i)=>p.reply),'the rest are replies');assert.match(thread[1].text,/1.5%\+, up to 10 a night/);assert.match(thread[4].text,/1-800-GAMBLER/);assert.ok(thread.every(p=>!/https?:|\.com\b/.test(p.text)),'no links in the launch thread');assert.match(thread[0].text,/start today/);
  // X counts most symbols and emoji (like • and 🏀) as 2 characters.
  const xLen=t=>[...t].reduce((n,ch)=>{const c=ch.codePointAt(0);return n+(c<=4351||(c>=8192&&c<=8205)||(c>=8208&&c<=8223)||(c>=8242&&c<=8247)?1:2)},0);
  assert.ok(thread.every(p=>xLen(p.text)<=280),'every post fits X\'s limit');
  // Nights: a 10:30 PM ET tip is after midnight UTC but stays on its night.
  assert.equal(run(`nbaNight(Date.parse('${late}'))`),'2026-10-27');
  // Cron: NBA nights grade every publish run.
  assert.deepEqual(run(`cronJobs(new Date('2026-10-28T01:00:00Z'))`).includes('grade'),true);
  // Friday NBA nights sit outside the NFL windows: closing prices are captured by this cron (Oct 20/23 went unrecorded).
  assert.ok(run(`cronJobs(new Date('2026-10-23T23:00:00Z'))`).includes('closing'),'NBA nights capture closing prices');
  // Per-night limits (caps from cfg), 2 a game; a 2.5%+ top pick posts past both.
  {const c=(i,g,edge)=>({playerKey:'g'+g+'|p'+i,player:'P'+i,gameId:'g'+g,edge,market:'Points',side:'Over',line:20.5,odds:110,gameTime:'2026-10-21T00:00:00Z'});
   const pool=[...Array(14)].map((_,i)=>c(i,Math.floor(i/3),2-i*.01)),cfg=JSON.stringify({caps:{props:10,reasonable:0,swing:0,moonshot:0},perGame:2,top:2.5,prefix:'nba|2026-10-20|'});
   let plan=JSON.parse(JSON.stringify(run(`officialPlan(${JSON.stringify(pool)},[],'2026-10-20',Date.now(),[],${cfg})`))).filter(p=>p.tier==='props');
   assert.equal(plan.length,10,'10 singles a night');
   assert.ok([...new Set(plan.map(p=>p.legs[0].gameId))].every(g=>plan.filter(p=>p.legs[0].gameId===g).length<=2),'2 a game');
   plan=JSON.parse(JSON.stringify(run(`officialPlan(${JSON.stringify([...pool,c(99,0,3.1)])},[],'2026-10-20',Date.now(),[],${cfg})`))).filter(p=>p.tier==='props');
   assert.ok(plan.some(p=>p.legs[0].player==='P99')&&plan.length===11,'a 2.5%+ top pick posts past the nightly and per-game limits');
   assert.equal(run('NBA_MIN'),1,'NBA bar is 1%');}
  // Live NBA card: 5 singles a night (highest edge first); the rest of the
  // qualifiers make up to 3 two-leg parlays, legs from different games, -130 to +150.
  {const c=(i,g,edge,odds=110)=>({playerKey:'g'+g+'|p'+i,player:'P'+i,gameId:'g'+g,edge,market:['Points','Rebounds','Assists'][i%3],side:'Over',line:20.5,odds,gameTime:'2026-10-21T00:00:00Z'});
   const pool=[...Array(14)].map((_,i)=>c(i,i,2-i*.05,i===12?-200:110));
   const plan=JSON.parse(JSON.stringify(run(`officialPlan(${JSON.stringify(pool)},[],'2026-10-20',Date.now(),${JSON.stringify(pool)},nbaConfig('2026-10-20'))`)));
   const singles=plan.filter(p=>p.tier==='props'),parlays=plan.filter(p=>p.tier!=='props');
   assert.deepEqual(singles.map(p=>p.legs[0].player),['P0','P1','P2','P3','P4'],'the 5 best are singles');
   assert.equal(parlays.length,3,'up to 3 parlays a night');
   assert.ok(parlays.every(p=>p.legs.length===2&&p.legs[0].gameId!==p.legs[1].gameId),'2 legs, different games');
   assert.ok(parlays.every(p=>p.legs.every(l=>!singles.some(s=>s.legs[0].player===l.player)&&l.odds>=-130&&l.odds<=150)),'legs are not singles and priced -130 to +150');}
  // A pick for a later night leads its X post with the day; tonight's don't.
  {const now=Date.parse('2026-10-22T22:00:00Z');
   assert.equal(run(`nbaAhead('2026-10-23T01:40:00Z',${now})`),'','tonight (late tip, after midnight UTC)');
   assert.equal(run(`nbaAhead('2026-10-24T01:40:00Z',${now})`),'🗓️ For TOMORROW (Fri)\n');
   assert.equal(run(`nbaAhead('2026-10-24T23:00:00Z',${now})`),'🗓️ For Sat, Oct 24\n');}
  console.log('PASS: official NBA picks post every qualifying core-market prop (one per player) as soon as props are listed (up to 36 hours before tip-off), stay out of NFL queries, grade from the box score with no-plays as pushes, and serve their own record');
})().catch(e=>{console.error(e);process.exit(1)});
