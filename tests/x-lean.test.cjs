const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),{webcrypto}=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const {read}=require('./helpers/client.cjs');
// Lean X posting (Oct 29 audit): no post per pick; one card per slate with the
// prediction-app picks on it, late picks in one reply under the card, the
// daily Tail-or-fade poll (only when x-poll is on), every post logged, and a
// once-a-day metrics read.
const posts=[],reads=[];
const context=vm.createContext({URL,URLSearchParams,Request,Response,Headers,AbortSignal,Date,console,setTimeout,clearTimeout,crypto:webcrypto,TextEncoder,btoa,atob,FormData,Blob,
  fetch:async(url,init={})=>{url=String(url);if(/media\/upload/.test(url))return Response.json({data:{id:'m1'}});
    if(url==='https://api.twitter.com/2/tweets'){posts.push(JSON.parse(init.body));return Response.json({data:{id:String(1900000000000000000n+BigInt(posts.length))}})}
    if(url.startsWith('https://api.twitter.com/2/tweets?')){const ids=new URL(url).searchParams.get('ids').split(',');reads.push(ids);return Response.json({data:ids.slice(1).map((id,i)=>({id,text:'x',public_metrics:{impression_count:100+i,like_count:3,reply_count:1,retweet_count:0,quote_count:0,bookmark_count:2}})),errors:[{value:ids[0]}]})}
    return new Response(null,{status:404})}});
const template=read('worker/index.template.js');
vm.runInContext(template.slice(template.indexOf('const API_BASE')).replace('__MOVEMENT_SERVER__',read('worker/movement.js')).replace('__LIVE_SERVER__',read('worker/live.js')).replace('__STATS_SHARED__',read('dist/stats.js')).replace('__RECORDS_SERVER__',read('worker/records.js')).replace('__ACCOUNTS_SERVER__',read('worker/accounts.js')).replace('export default {','this.worker={'),context);
const db=new DatabaseSync(':memory:');
for(const f of fs.readdirSync('drizzle').filter(f=>/^\d{4}_.*\.sql$/.test(f)).sort())try{db.exec(read('drizzle/'+f).replaceAll('--> statement-breakpoint',''))}catch{}
const wrap=(sql,args=[])=>({bind(...values){return wrap(sql,values)},async first(){return db.prepare(sql).get(...args)||null},async all(){return{results:db.prepare(sql).all(...args)}},async run(){const r=db.prepare(sql).run(...args);return{success:true,meta:{changes:Number(r.changes)}}}});
const run=code=>vm.runInContext(code,context);
const setting=k=>db.prepare('SELECT value FROM app_settings WHERE key=?').get(k)?.value;
const team='Houston Texans · @ Tennessee Titans';
const official=(id,player,odds,gameTime,kind='prop',edge=1.2)=>db.prepare("INSERT INTO public_recommendations(id,kind,player,market,side,line,odds,combined_odds,game_time,legs_json,posted_at,status,source) VALUES(?,?,?,?,?,?,?,?,?,?,?,'pending','market-verified-v2')").run(id,kind,player,'Receptions','Under',4.5,odds,kind==='parlay'?264:null,gameTime,JSON.stringify([{player,team,market:'Receptions',side:'Under',line:4.5,odds,edge,book:'FanDuel',gameTime}]),'2026-11-01T01:00:00Z');
const pm=(id,player,eventId,gameTime,edge=3)=>db.prepare("INSERT INTO prediction_picks(id,exchange,event_id,player,team,market,side,line,odds,net_odds,fair_pct,edge,game_time,posted_at) VALUES(?,'Novig',?,?,?,'Receptions','Over',4.5,110,110,51,?,?,'2026-11-01T01:00:00Z')").run(id,eventId,player,team,edge,gameTime);
(async()=>{
  context.env={DB:{prepare:sql=>wrap(sql),async batch(l){for(const s of l)await s.run()}},X_API_KEY:'k',X_API_SECRET:'s',X_ACCESS_TOKEN:'1-t',X_ACCESS_SECRET:'a'};
  run('renderCardPng=async svg=>{globalThis.__svg=svg;return new Uint8Array([137,80,78,71])}');
  // NFL Sunday: kickoff 17:00 UTC; the final card goes 65–80 minutes before.
  const kick='2026-11-01T17:00:00.000Z',cardAt=Date.parse(kick)-70*60000;
  official('official|2026-10-27|props|prop|a','Carnell Tate',128,kick,'prop',2.4);official('official|2026-10-27|props|prop|b','Brock Bowers',-105,kick);pm('pm|NFL--g1|nico','Nico Collins','NFL--g1',kick);
  assert.equal((await run(`postPicksToX(env,${cardAt})`)).lean,true,'no post per sportsbook pick');
  assert.equal((await run(`postPredictionPicksToX(env,${cardAt})`)).lean,true,'no post per prediction-app pick');
  assert.equal((await run(`postSlateToX(env,${cardAt-12*3600000})`)).lean,true,'no night-before card');
  assert.equal((await run(`postSlateToX(env,${cardAt},false,true)`)).lean,true,'no morning card');
  const card=await run(`postSlateToX(env,${cardAt},true)`);
  assert.equal(card.posted,1);assert.equal(card.picks,3,'two sportsbook picks plus the prediction-app pick');
  assert.match(posts[0].text,/2 singles \+ 1 prediction-app, every one on the card/);assert.match(posts[0].text,/18\+\/21\+ by app/);
  assert.ok(run('globalThis.__svg').includes('Nico Collins'),'prediction-app pick on the card');
  const cardId=String(1900000000000000001n);
  assert.equal(setting('xcard:official|2026-10-27|props|prop|a'),cardId);assert.equal(setting('xcard:pm|NFL--g1|nico'),cardId);
  assert.equal(setting('xid:x-card-day:2026-11-01'),cardId,'the day\'s card, for the recap reply');
  assert.equal(posts.length,1,'poll is off by default');
  assert.equal((await run(`postPredictionSlateToX(env,${cardAt+30*60000})`)).lean,true,'no separate prediction-app card');
  // Results: the top pick and parlays reply under the card; other singles wait for the recap.
  db.prepare("UPDATE public_recommendations SET status='final',result='won',settled_at=? WHERE player IN ('Carnell Tate','Brock Bowers')").run(new Date(Date.parse(kick)+4*3600000).toISOString());
  const res=await run(`postResultsToX(env,${Date.parse(kick)+5*3600000},5)`);
  assert.equal(res.posted,1,'only the top pick');assert.equal(posts.at(-1).reply.in_reply_to_tweet_id,cardId);
  // Poll: once a slate when x-poll is on, on the top single, open until its game.
  db.prepare("INSERT INTO app_settings(key,value) VALUES('x-poll','on')").run();
  const night='2026-11-02',tip='2026-11-03T00:00:00.000Z',later='2026-11-03T03:00:00.000Z',nbaAt=Date.parse(tip)-30*60000;
  assert.equal(run(`nbaNight(${Date.parse(tip)})`),night);
  const nba=(id,player,odds,gameTime,edge)=>db.prepare("INSERT INTO public_recommendations(id,kind,sport,player,market,side,line,odds,game_time,legs_json,posted_at,status,source) VALUES(?,'prop','NBA',?,'Rebounds','Over',6.5,?,?,?,?,'pending','market-verified-v2')").run(id,player,odds,gameTime,JSON.stringify([{player,team:'Boston Celtics · @ New York Knicks',market:'Rebounds',side:'Over',line:6.5,odds,edge,book:'DraftKings',gameTime}]),'2026-11-02T20:00:00Z');
  nba(`nba|${night}|props|prop|1`,'Josh Hart',105,tip,1.4);nba(`nba|${night}|props|prop|2`,'Jalen Brunson',-110,tip,2.1);
  assert.equal((await run(`postNbaPicksToX(env,${nbaAt-3600000})`)).lean,true,'NBA picks wait for the card');
  const before=posts.length;assert.equal((await run(`postNbaCardToX(env,${nbaAt})`)).posted,1);
  const nbaCard=posts[before],poll=posts[before+1];
  assert.match(nbaCard.text,/NBA picks/);assert.ok(poll&&poll.poll,'poll right after the card');
  assert.deepEqual(poll.poll.options,['Tail ✅','Fade ❌']);assert.equal(poll.poll.duration_minutes,30,'open until tip-off');
  assert.match(poll.text,/^🗳️ Tail or fade\?/);assert.match(poll.text,/Jalen Brunson Over 6.5 rebounds \(-110 at DraftKings\)/,'the highest edge');assert.ok(!poll.media&&!/https?:\/\//.test(poll.text));
  assert.equal(posts.length,before+2);
  // Late picks: one reply under the card for everything new, then nothing again.
  nba(`nba|${night}|props|prop|3`,'Jayson Tatum',115,later,1.1);nba(`nba|${night}|props|prop|4`,'Jaylen Brown',120,later,1.3);
  const added=await run(`postNbaRepliesToX(env,${Date.parse(tip)+3600000},2)`);
  assert.equal(added.added,1,'one reply');const reply=posts.at(-1);
  assert.match(reply.text,/^🔒 Added for the late games:\n• Jayson Tatum .*\n• Jaylen Brown /);assert.equal(reply.reply.in_reply_to_tweet_id,String(1900000000000000000n+BigInt(before+1)));
  assert.equal((await run(`postNbaRepliesToX(env,${Date.parse(tip)+3700000},2)`)).added,0,'never twice');
  assert.ok(setting(`xcard:nba|${night}|props|prop|3`),'late picks thread their results under the reply');
  // Every post is logged; the metrics read takes posts 20 hours to 7 days old, once a day.
  assert.equal(db.prepare('SELECT COUNT(*) n FROM x_posts').get().n,posts.length);
  assert.equal(db.prepare('SELECT poll FROM x_posts WHERE text LIKE ?').get('🗳️%').poll,1);
  db.prepare('UPDATE x_posts SET posted_at=?').run(tip);
  const m=await run(`xMetricsDaily(env,${Date.parse(tip)+3*86400000})`);
  assert.equal(reads.length,1,'one read');assert.equal(m.read,posts.length);
  const got=db.prepare('SELECT * FROM x_posts WHERE impressions IS NOT NULL').all();assert.equal(got.length,posts.length-1);assert.equal(got[0].likes,3);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM x_posts WHERE metrics_at IS NULL').get().n,0,'deleted posts are marked too');
  assert.equal((await run(`xMetricsDaily(env,${Date.parse(tip)+3*86400000+3600000})`)).skipped,true,'once a day');
  const t=Date.parse('2026-10-20T12:00:00Z'),id=((BigInt(t)-1288834974657n)<<22n).toString();assert.equal(run(`xIdTime('${id}')`),t,'post time from its id');
  // x-lean off brings back a post per pick.
  db.prepare("INSERT INTO app_settings(key,value) VALUES('x-lean','off')").run();assert.notEqual((await run(`postPicksToX(env,${cardAt})`)).lean,true);
  console.log('PASS: lean X posting (one card per slate with prediction-app picks, late picks in one reply, top-pick/parlay results under the card), Tail-or-fade poll behind x-poll, every post logged, daily metrics read');
})().catch(e=>{console.error(e);process.exit(1)});
