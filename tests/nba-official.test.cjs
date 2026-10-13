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
const db=new DatabaseSync(':memory:');for(const f of ['0000_public_record.sql','0001_record_settlement.sql','0002_historical_replays.sql','0012_nba_shadow.sql','0018_player_form.sql','0021_injuries.sql','0006_push_alerts.sql','0008_book_alerts.sql','0013_follow_alerts.sql','0027_alert_price_view.sql','0031_alert_kinds.sql','0033_alert_nba.sql'])db.exec(read('drizzle/'+f).replaceAll('--> statement-breakpoint',''));db.exec('CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT)');
const wrap=(sql,args=[])=>({bind(...v){return wrap(sql,v)},async first(){return db.prepare(sql).get(...args)||null},async all(){return{results:db.prepare(sql).all(...args)}},async run(){const r=db.prepare(sql).run(...args);return{success:true,meta:{changes:Number(r.changes)}}}});
const env={DB:{prepare:sql=>wrap(sql),async batch(l){const out=[];for(const s of l)out.push(await s.run());return out}},THE_ODDS_API_KEY:'k',BALLDONTLIE_API_KEY:'k',X_API_KEY:'a',X_API_SECRET:'b',X_ACCESS_TOKEN:'1-c',X_ACCESS_SECRET:'d'};context.env=env;
const run=c=>vm.runInContext(c,context),req='new Request("https://betthisguy.com/api/maintenance")';
(async()=>{
  // Before opening night nothing posts.
  assert.equal((await run(`publishNbaPicks(${req},env,{waitUntil(){}},${Date.parse('2026-10-18T21:00:00Z')})`)).state,'not_started');
  const first=await run(`publishNbaPicks(${req},env,{waitUntil(){}},${now})`);
  assert.equal(first.state,'completed');assert.equal(first.games,2,'only games tipping within 36 hours');
  const rows=db.prepare('SELECT * FROM public_recommendations ORDER BY id').all()
  const singles=rows.filter(r=>r.kind==='prop').sort((a,b)=>a.player.localeCompare(b.player));
  assert.deepEqual(singles.map(r=>[r.player,r.market,r.side,r.line,r.odds]),[['Jayson Tatum','Points','Over',27.5,115],['Victor Wembanyama','Rebounds','Over',11.5,114]],'one single per game, best edge, no blocks');
  assert.ok(rows.every(r=>r.id.startsWith('nba|2026-10-27|')&&r.sport==='NBA'),'nightly NBA ids and sport');
  assert.ok(!singles.some(r=>r.player==='Kristaps Porzingis'),'blocks are not an official NBA market');
  // A second run adds nothing (one per game is already used).
  run('runtimeFeedCache.clear()');await run(`publishNbaPicks(${req},env,{waitUntil(){}},${now+600000})`);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM public_recommendations WHERE kind='prop'").get().n,2);
  // NFL readers never see NBA picks.
  assert.equal((await run('homeRecentRows(env)')).length,0,'the NFL home leaves NBA picks out');
  // Worth a look: the near misses are saved for /api/leans?sport=NBA (none here beyond the picks).
  assert.ok(JSON.parse(db.prepare("SELECT value FROM app_settings WHERE key='nba-leans'").get().value).leans.every(l=>!['Jayson Tatum','Victor Wembanyama'].includes(l.player)),'picks never repeat in Worth a look');
  // Alerts: the phone's text names the NBA pick; a phone with NBA alerts off is skipped.
  db.prepare("INSERT INTO push_subscriptions (endpoint,p256dh,auth,created_at) VALUES ('https://fcm.googleapis.com/fcm/send/a','x','y','2026-10-01')").run();
  db.prepare("INSERT INTO push_subscriptions (endpoint,p256dh,auth,created_at,alert_nba) VALUES ('https://fcm.googleapis.com/fcm/send/b','x','y','2026-10-01',0)").run();
  const alert=await run(`latestAlert(env,${now},'https://fcm.googleapis.com/fcm/send/a')`);
  assert.equal(alert.title,'🏀 2 new NBA picks');assert.match(alert.body,/Jayson Tatum Over 27.5 points \(\+115, DraftKings\)/);assert.equal(alert.url,'/?league=NBA');
  assert.notEqual((await run(`latestAlert(env,${now},'https://fcm.googleapis.com/fcm/send/b')`)).title,'🏀 2 new NBA picks','NBA alerts off');
  // X: no card until 35 minutes before the first tip; then one card with every pick.
  assert.equal((await run(`postNbaCardToX(env,${now})`)).due,false);
  const cardAt=Date.parse(tip1)-30*60000;
  assert.equal((await run(`postNbaCardToX(env,${cardAt})`)).posted,1);
  assert.equal((await run(`postNbaCardToX(env,${cardAt+600000})`)).posted,0,'once a night');
  assert.match(posts[0].text,/^🏀 Tonight’s NBA picks/);assert.match(posts[0].text,/Victor Wembanyama Over 11.5 rebounds \(\+114, DraftKings\)/);
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
  let replies=await run(`postNbaRepliesToX(env,${now},5)`);
  assert.deepEqual([replies.results,replies.recap],[2,1]);
  const texts=posts.slice(1).map(p=>p.text);
  assert.ok(posts.slice(1).every(p=>p.reply?.in_reply_to_tweet_id==='1001'),'replies go under the card');
  assert.ok(texts.some(t=>/^✅ HIT: Jayson Tatum Over 27.5 points \(\+115\)\nFinal: 31 points\.\n\+\$115 on a \$100 pick\./.test(t)),texts.join('|'));
  assert.ok(texts.some(t=>/^➖ NO ACTION: Victor Wembanyama.*didn’t play/s.test(t)));
  assert.ok(texts.some(t=>/^🏀 NBA (tonight|last night): 1–0–1, \+\$115\./.test(t)));
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
  assert.equal(body.recent.length,rows.length);assert.equal(body.tonight,'2026-10-27');
  // Nights: a 10:30 PM ET tip is after midnight UTC but stays on its night.
  assert.equal(run(`nbaNight(Date.parse('${late}'))`),'2026-10-27');
  // Cron: NBA nights grade every publish run.
  assert.deepEqual(run(`cronJobs(new Date('2026-10-28T01:00:00Z'))`).includes('grade'),true);
  console.log('PASS: official NBA picks post one per game on the core markets as soon as props are listed (up to 36 hours before tip-off), stay out of NFL queries, grade from the box score with no-plays as pushes, and serve their own record');
})().catch(e=>{console.error(e);process.exit(1)});
