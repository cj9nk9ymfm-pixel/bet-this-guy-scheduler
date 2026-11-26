// Auto replies (Nov 25, Tim): people who reply to us or tag us with a question we can answer
// (the record, where to get picks) get one answer; nobody else, once a person a day, never twice
// in a thread, 10 a day, off switch. We never reply to other accounts' posts.
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),{webcrypto}=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const {read}=require('./helpers/client.cjs');
const context=vm.createContext({URL,URLSearchParams,Request,Response,Headers,FormData,AbortSignal,Date,console,setTimeout,clearTimeout,crypto:webcrypto,TextEncoder,btoa,atob,BigInt,fetch:async()=>new Response('{}',{status:404})});
const template=read('worker/index.template.js');
vm.runInContext(template.slice(template.indexOf('const API_BASE')).replace('__MOVEMENT_SERVER__',read('worker/movement.js')).replace('__LIVE_SERVER__',read('worker/live.js')).replace('__STATS_SHARED__',read('dist/stats.js')).replace('__RECORDS_SERVER__',()=>read('worker/records.js')).replace('__ACCOUNTS_SERVER__',read('worker/accounts.js')).replace('export default {','this.worker={'),context);
const db=new DatabaseSync(':memory:');
for(const f of ['0000_public_record.sql','0001_record_settlement.sql','0002_historical_replays.sql'])db.exec(read('drizzle/'+f).replaceAll('--> statement-breakpoint',''));
db.exec('CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)');
db.exec('CREATE TABLE prediction_picks (id TEXT PRIMARY KEY, exchange TEXT, event_id TEXT, player TEXT, team TEXT, market TEXT, side TEXT, line REAL, odds INTEGER, net_odds INTEGER, game_time TEXT, posted_at TEXT, result TEXT, void_reason TEXT, graded_at TEXT, actual REAL)');
const wrap=(sql,args=[])=>({bind(...v){return wrap(sql,v)},async first(){return db.prepare(sql).get(...args)||null},async all(){return{results:db.prepare(sql).all(...args)}},async run(){const r=db.prepare(sql).run(...args);return{success:true,meta:{changes:Number(r.changes)}}}});
const run=c=>vm.runInContext(c,context);
context.env={DB:{prepare:sql=>wrap(sql),async batch(l){for(const s of l)await s.run()}}};
const posts=[];let mentions=[];
context.env={...context.env,X_API_KEY:'k',X_API_SECRET:'s',X_ACCESS_TOKEN:'42-abc',X_ACCESS_SECRET:'a'};
context.fetch=async(url,init={})=>{const u=new URL(url);if(u.pathname==='/2/users/42/mentions')return Response.json({data:mentions,meta:{newest_id:mentions[0]?.id}});if(u.pathname==='/2/tweets'){const b=JSON.parse(init.body);posts.push(b);return Response.json({data:{id:String(900+posts.length)}})}return new Response('{}',{status:404})};
run('fetch=globalThis.fetch');
(async()=>{
  const now=Date.parse('2026-11-25T23:00:00Z');
  db.prepare("INSERT INTO public_recommendations(id,kind,player,market,side,line,odds,game_time,legs_json,posted_at,status,result,source) VALUES(?,?,?,?,?,?,?,?,?,?,'final','won','market-verified-v2')").run('official|w|props|prop|v2|a','prop','A','Receptions','Over',3.5,-110,'2026-11-20T18:00:00Z','[]','2026-11-20T12:00:00Z');
  mentions=[{id:'5',author_id:'42',text:'our own',conversation_id:'1'},{id:'4',author_id:'9',text:'@BetThisGuy nice pick',conversation_id:'1'},{id:'3',author_id:'8',text:'@BetThisGuy where do I get alerts?',conversation_id:'2'},{id:'2',author_id:'7',text:"@BetThisGuy what's your record lol",conversation_id:'1'}];
  const out=await run(`xAutoReplies(env,${now})`);assert.equal(out.sent,2,'the record question and the where question; not "nice pick" or our own');
  const rec=posts.find(p=>p.reply.in_reply_to_tweet_id==='2'),where=posts.find(p=>p.reply.in_reply_to_tweet_id==='3');
  assert.match(rec.text,/Every pick we've posted, graded win or lose: NFL 1–0, NBA 0–0[\s\S]*betthisguy\.com\/record/);assert.match(where.text,/Free alerts: betthisguy\.com\/\?utm_source=xreply/);
  assert.equal((await run(`xAutoReplies(env,${now+5*60000})`)).skipped,true,'every 10 minutes');
  mentions=[{id:'7',author_id:'7',text:'@BetThisGuy link?',conversation_id:'9'},{id:'6',author_id:'6',text:'@BetThisGuy whats the record',conversation_id:'1'}];
  await run(`xAutoReplies(env,${now+11*60000})`);assert.equal(posts.length,2,'same person the same day, and the same thread, get nothing more');
  assert.equal(run("xAutoReplyText('fire pick',null)"),null,'only questions we can answer');
  db.prepare("INSERT INTO app_settings (key,value) VALUES ('x-auto-replies','off')").run();assert.equal((await run(`xAutoReplies(env,${now+30*60000})`)).off,true);
  console.log('PASS: auto replies: answers record and where-to-get-picks questions from people who tagged or replied to us, once a person a day, never twice in a thread, every 10 minutes, off switch');
})().catch(e=>{console.error(e);process.exit(1)});
