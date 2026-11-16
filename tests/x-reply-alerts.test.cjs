// Reply alerts and reply targets (Nov 16, Tim): every reply to us pings the owner's phone with a tap to it;
// at noon and 5 PM ET the three busiest fresh posts from big betting accounts, with our top pick as the angle.
// the counts, the gold sticker (last 3 nights when winning, else the season), every pick by game
// with an OVER / UNDER chip, sportsbook and prediction apps. Same card for NBA and NFL.
const assert=require('node:assert/strict'),vm=require('node:vm'),{webcrypto}=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const {read}=require('./helpers/client.cjs');
const pushes=[],mail=[];
const context=vm.createContext({URL,URLSearchParams,Request,Response,Headers,FormData,AbortSignal,Date,console,setTimeout,clearTimeout,crypto:webcrypto,TextEncoder,btoa,atob,fetch:async(url,init)=>{if(String(url).startsWith('https://ntfy.sh/'))pushes.push({title:init.headers.Title,body:init.body});if(String(url).includes('resend.com'))mail.push(JSON.parse(init.body));return new Response('{}',{status:200})}});
const template=read('worker/index.template.js');
vm.runInContext(template.slice(template.indexOf('const API_BASE')).replace('__MOVEMENT_SERVER__',read('worker/movement.js')).replace('__LIVE_SERVER__',read('worker/live.js')).replace('__STATS_SHARED__',read('dist/stats.js')).replace('__RECORDS_SERVER__',read('worker/records.js')).replace('__ACCOUNTS_SERVER__',read('worker/accounts.js')).replace('export default {','this.worker={'),context);
const db=new DatabaseSync(':memory:');
for(const f of ['0000_public_record.sql','0001_record_settlement.sql','0002_historical_replays.sql','0006_push_alerts.sql'])db.exec(read('drizzle/'+f).replaceAll('--> statement-breakpoint',''));
db.exec('CREATE TABLE prediction_picks (id TEXT PRIMARY KEY, exchange TEXT, event_id TEXT, player TEXT, team TEXT, market TEXT, side TEXT, line REAL, odds INTEGER, net_odds INTEGER, game_time TEXT, posted_at TEXT, result TEXT, void_reason TEXT, graded_at TEXT, actual REAL)');
const wrap=(sql,args=[])=>({bind(...v){return wrap(sql,v)},async first(){return db.prepare(sql).get(...args)||null},async all(){return{results:db.prepare(sql).all(...args)}},async run(){const r=db.prepare(sql).run(...args);return{success:true,meta:{changes:Number(r.changes)}}}});
const run=c=>vm.runInContext(c,context),ntfy=[],calls=[];
context.env={DB:{prepare:sql=>wrap(sql),async batch(l){for(const s of l)await s.run()}},ALERT_NTFY_TOPIC:'owner-topic',X_API_KEY:'k',X_API_SECRET:'s',X_ACCESS_TOKEN:'42-abc',X_ACCESS_SECRET:'a'};
context.fetch=async(url,init={})=>{const u=new URL(url);calls.push(u);
  if(u.hostname==='ntfy.sh'){ntfy.push({title:init.headers.Title,click:init.headers.Click,body:init.body});return new Response('ok')}
  if(u.pathname==='/2/users/42/mentions')return Response.json({data:[{id:'900',author_id:'7',text:'Fade. Brunson always gets his assists.',referenced_tweets:[{type:'replied_to',id:'800'}]},{id:'899',author_id:'42',text:'our own reply'}],includes:{users:[{id:'7',username:'hoopsfan',public_metrics:{followers_count:312}}],tweets:[{id:'800',text:'🔒 Official pick · NBA\nJalen Brunson Under 6.5 assists'}]},meta:{newest_id:'900'}});
  if(u.pathname==='/2/tweets/search/recent')return Response.json({data:[{id:'1',author_id:'a',text:'Who you got tonight?',public_metrics:{reply_count:40,like_count:100,retweet_count:5}},{id:'2',author_id:'a',text:'Quiet one',public_metrics:{reply_count:0,like_count:3,retweet_count:0}}],includes:{users:[{id:'a',username:'ActionNetworkHQ'}]}});
  return new Response('{}',{status:404})};
run('fetch=globalThis.fetch');
(async()=>{
  const now=Date.parse('2026-11-16T22:00:00Z');
  const out=await run(`xReplyAlerts(env,${now})`);
  assert.equal(out.replies,1,'our own replies are skipped');assert.equal(ntfy.length,1);
  assert.equal(ntfy[0].title,'Reply from @hoopsfan (312 followers)');assert.equal(ntfy[0].click,'https://x.com/hoopsfan/status/900');
  assert.match(ntfy[0].body,/Fade\. Brunson[\s\S]*On our post: 🔒 Official pick · NBA Jalen Brunson/);
  assert.equal((await run(`xReplyAlerts(env,${now+5*60000})`)).skipped,true,'every 10 minutes at most');
  await run(`xReplyAlerts(env,${now+11*60000})`);assert.equal(calls.filter(u=>u.pathname.endsWith('/mentions')).at(-1).searchParams.get('since_id'),'900','only newer replies next time');
  db.prepare("INSERT INTO app_settings (key,value) VALUES ('x-reply-alerts','off')").run();assert.equal((await run(`xReplyAlerts(env,${now+30*60000})`)).off,true,'can be turned off');
  // Reply targets: noon and 5 PM ET only, once each, the busiest post first.
  assert.equal((await run(`xReplyTargets(env,${Date.parse('2026-11-16T20:00:00Z')})`)).due,false,'3 PM ET: not a slot');
  const n=ntfy.length,t=await run(`xReplyTargets(env,${now})`);assert.equal(t.sent,2);
  const msg=ntfy.at(-1);assert.equal(msg.title,'Reply targets on X');assert.ok(msg.body.indexOf('Who you got')<msg.body.indexOf('Quiet one'),'busiest first');
  assert.match(msg.body,/https:\/\/x\.com\/ActionNetworkHQ\/status\/1/);assert.equal(ntfy.length,n+1);
  assert.equal((await run(`xReplyTargets(env,${now+600000})`)).done,true,'once per slot');
  const q=calls.filter(u=>u.pathname==='/2/tweets/search/recent')[0].searchParams.get('query');assert.match(q,/^\(from:ActionNetworkHQ OR from:br_betting/);assert.match(q,/-is:reply -is:retweet$/);
  console.log('PASS: reply alerts (each reply to us, with a tap to it, newest only, every 10 min, can be off) and reply targets (noon and 5 PM ET, busiest posts from big betting accounts)');
})().catch(e=>{console.error(e);process.exit(1)});
