// Following cleanup (Nov 24, Tim): reads who we follow and who follows us, judges each account
// (bots/spam, inactive 60+ days and off-topic non-followers go; sports accounts and follow-backs
// stay), and only unfollows once switched on: 2 a run, 300 a day, never a hand-kept account.
const assert=require('node:assert/strict'),vm=require('node:vm'),{webcrypto}=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const {read}=require('./helpers/client.cjs');
const context=vm.createContext({URL,URLSearchParams,Request,Response,Headers,FormData,AbortSignal,Date,console,setTimeout,clearTimeout,crypto:webcrypto,TextEncoder,btoa,atob,BigInt,fetch:async()=>new Response('{}',{status:404})});
const template=read('worker/index.template.js');
vm.runInContext(template.slice(template.indexOf('const API_BASE')).replace('__MOVEMENT_SERVER__',read('worker/movement.js')).replace('__LIVE_SERVER__',read('worker/live.js')).replace('__STATS_SHARED__',read('dist/stats.js')).replace('__RECORDS_SERVER__',()=>read('worker/records.js')).replace('__ACCOUNTS_SERVER__',read('worker/accounts.js')).replace('export default {','this.worker={'),context);
const db=new DatabaseSync(':memory:');
for(const f of ['0000_public_record.sql','0001_record_settlement.sql','0045_x_following.sql'])db.exec(read('drizzle/'+f).replaceAll('--> statement-breakpoint',''));
db.exec('CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)');
const wrap=(sql,args=[])=>({bind(...v){return wrap(sql,v)},async first(){return db.prepare(sql).get(...args)||null},async all(){return{results:db.prepare(sql).all(...args)}},async run(){const r=db.prepare(sql).run(...args);return{success:true,meta:{changes:Number(r.changes)}}}});
const run=c=>vm.runInContext(c,context),calls=[];
context.env={DB:{prepare:sql=>wrap(sql),async batch(l){for(const s of l)await s.run()}},X_API_KEY:'k',X_API_SECRET:'s',X_ACCESS_TOKEN:'42-abc',X_ACCESS_SECRET:'a'};
const now=Date.parse('2026-11-24T20:00:00Z'),tid=ms=>String((BigInt(ms-1288834974657)<<22n));
const recent=tid(now-3*86400000),old=tid(now-200*86400000),pm=(f,t)=>({followers_count:f,tweet_count:t});
const following=[
  {id:'1',username:'hoopsguy',name:'Hoops Guy',description:'NBA props and picks',public_metrics:pm(900,4000),most_recent_tweet_id:recent,profile_image_url:'x.jpg'},
  {id:'2',username:'randomcook',name:'Cook',description:'I bake bread',public_metrics:pm(300,800),most_recent_tweet_id:recent,profile_image_url:'x.jpg'},
  {id:'3',username:'friend',name:'Friend',description:'just vibes',public_metrics:pm(120,300),most_recent_tweet_id:recent,profile_image_url:'x.jpg'},
  {id:'4',username:'gone',name:'Gone',description:'NFL fan',public_metrics:pm(80,50),most_recent_tweet_id:old,profile_image_url:'x.jpg'},
  {id:'5',username:'egg12345',name:'egg',description:'',public_metrics:pm(2,3),profile_image_url:'https://pbs.twimg.com/sticky/default_profile_images/default_profile_normal.png'},
  {id:'6',username:'promo',name:'Promo',description:'Follow back 100% #IFB',public_metrics:pm(5000,9000),most_recent_tweet_id:recent,profile_image_url:'x.jpg'},
  {id:'7',username:'LeBron',name:'LeBron James',description:'Lakers',public_metrics:pm(5e7,9000),most_recent_tweet_id:old,profile_image_url:'x.jpg'},
  {id:'8',username:'ActionNetworkHQ',name:'Action',description:'',public_metrics:pm(4e5,9000),most_recent_tweet_id:recent,profile_image_url:'x.jpg'},
  {id:'9',username:'bakery2',name:'Bakery',description:'cakes',public_metrics:pm(10,40),most_recent_tweet_id:recent,profile_image_url:'x.jpg'},
];
context.fetch=async(url,init={})=>{const u=new URL(url);calls.push({u,method:init.method||'GET'});
  if(u.pathname==='/2/users/42/followers')return Response.json(u.searchParams.get('pagination_token')?{data:[{id:'3'}],meta:{}}:{data:[{id:'1'}],meta:{next_token:'p2'}});
  if(u.pathname==='/2/users/42/following')return Response.json(u.searchParams.get('pagination_token')?{data:following.slice(5),meta:{}}:{data:following.slice(0,5),meta:{next_token:'q2'}});
  if(init.method==='DELETE')return Response.json({data:{following:false}});
  return new Response('{}',{status:404})};
run('fetch=globalThis.fetch');
const set=(k,v)=>db.prepare('INSERT INTO app_settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k,v);
(async()=>{
  assert.equal((await run(`xFollowCleanup(env,${now})`)).off,true,'off unless switched on');
  set('x-follow-cleanup','scan');
  for(let i=0;i<4;i++)await run(`xFollowCleanup(env,${now+i*600000})`);
  assert.equal((await run(`xFollowCleanup(env,${now+5*600000})`)).review,true,'scan done, waiting for the OK');
  assert.equal(calls.filter(c=>c.method==='DELETE').length,0,'nothing unfollowed during the scan');
  const v=Object.fromEntries(db.prepare('SELECT username,verdict,reason FROM x_following').all().map(r=>[r.username,`${r.verdict}: ${r.reason}`]));
  assert.deepEqual(v,{hoopsguy:'keep: follows us back',randomcook:"cut: off-topic, doesn't follow back",friend:'keep: follows us back',gone:'cut: no posts in 60+ days',egg12345:'cut: bot or spam',promo:'cut: bot or spam',LeBron:'keep: big sports account',ActionNetworkHQ:'keep: big sports account',bakery2:"cut: off-topic, doesn't follow back"});
  // Hand-kept: never unfollowed.
  db.prepare("UPDATE x_following SET status='keep' WHERE username='bakery2'").run();
  set('x-follow-cleanup','on');
  const a=await run(`xFollowCleanup(env,${now+6*600000})`);assert.equal(a.unfollowed,2,'two a run');
  await run(`xFollowCleanup(env,${now+7*600000})`);
  const gone=db.prepare("SELECT username FROM x_following WHERE status='unfollowed' ORDER BY username").all().map(r=>r.username);
  assert.deepEqual(gone,['egg12345','gone','promo','randomcook']);
  assert.ok(calls.filter(c=>c.method==='DELETE').every(c=>/^\/2\/users\/42\/following\/[2456]$/.test(c.u.pathname)),'only the cuts');
  assert.equal((await run(`xFollowCleanup(env,${now+8*600000})`)).phase,'done');
  // The day cap.
  db.prepare("UPDATE x_following SET status=NULL WHERE username='randomcook'").run();set('x-unfollow-day:2026-11-24','300');
  assert.equal((await run(`xFollowCleanup(env,${now+9*600000})`)).dayCap,true,'300 a day at most');
  // A faster pace from app_settings: 5 a run, 600 a day.
  db.prepare("UPDATE x_following SET status=NULL,verdict='cut' WHERE username IN ('randomcook','hoopsguy','friend','LeBron','ActionNetworkHQ')").run();set('x-unfollow-day:2026-11-24','0');set('x-unfollow-pace','5/600');
  assert.equal((await run(`xFollowCleanup(env,${now+10*600000})`)).unfollowed,5,'five a run at the faster pace');
  set('x-unfollow-pace','5/600');set('x-unfollow-day:2026-11-24','600');
  assert.equal((await run(`xFollowCleanup(env,${now+11*600000})`)).dayCap,true,'and its day cap');
  console.log('PASS: following cleanup: scan and verdicts (spam, inactive, off-topic cut; follow-backs and sports kept), unfollows only when on, 2 a run, day cap, hand-kept safe');
})().catch(e=>{console.error(e);process.exit(1)});
