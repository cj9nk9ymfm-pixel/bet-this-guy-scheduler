const assert=require('node:assert/strict'),vm=require('node:vm'),{webcrypto}=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const {read}=require('./helpers/client.cjs');
const posts=[];let fail=false;
const context=vm.createContext({URL,URLSearchParams,Request,Response,Headers,AbortSignal,Date,console,setTimeout,clearTimeout,crypto:webcrypto,TextEncoder,btoa,atob,
  fetch:async(url,init={})=>{if(String(url)==='https://api.twitter.com/2/tweets'){if(fail)return new Response('{}',{status:503});posts.push({auth:init.headers.authorization,body:JSON.parse(init.body)});return Response.json({data:{id:String(posts.length)}})}return new Response(null,{status:404})}});
const template=read('worker/index.template.js');
vm.runInContext(template.slice(template.indexOf('const API_BASE')).replace('__MOVEMENT_SERVER__',read('worker/movement.js')).replace('__LIVE_SERVER__',read('worker/live.js')).replace('__STATS_SHARED__',read('dist/stats.js')).replace('__RECORDS_SERVER__',read('worker/records.js')).replace('__ACCOUNTS_SERVER__',read('worker/accounts.js')).replace('export default {','this.worker={'),context);
const db=new DatabaseSync(':memory:');
for(const f of ['0000_public_record.sql','0001_record_settlement.sql','0002_historical_replays.sql','0006_push_alerts.sql'])db.exec(read('drizzle/'+f).replaceAll('--> statement-breakpoint',''));
const wrap=(sql,args=[])=>({bind(...values){return wrap(sql,values)},async first(){return db.prepare(sql).get(...args)||null},async all(){return{results:db.prepare(sql).all(...args)}},async run(){const r=db.prepare(sql).run(...args);return{success:true,meta:{changes:Number(r.changes)}}}});
const run=code=>vm.runInContext(code,context);
const now=Date.parse('2026-10-08T14:00:00Z');
const pick=(id,player,odds,result,postedAt,gameTime,extra={})=>db.prepare("INSERT INTO public_recommendations(id,kind,player,market,side,line,odds,combined_odds,game_time,legs_json,posted_at,status,result,source) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'market-verified-v2')").run(id,extra.kind||'prop',player,'Receptions','Over',4.5,odds,extra.combined??null,gameTime,JSON.stringify(extra.legs||[{player,market:'Receptions',side:'Over',line:4.5,odds,book:'FanDuel',edge:2.4,team:'Kansas City Chiefs · @ Buffalo Bills'}]),postedAt,result?'final':'pending',result);
for(let i=0;i<6;i++)pick(`official|2026-09-29|props|prop|old${i}`,`Old Player ${i}`,120,i<4?'won':'lost','2026-10-01T12:00:00Z','2026-10-04T17:00:00Z');
pick('official|2026-10-06|props|prop|a','Travis Kelce',105,null,new Date(now-20*60000).toISOString(),'2026-10-09T00:15:00Z');
(async()=>{
  // Signing matches X's documented OAuth 1.0a example.
  context.vec={X_API_KEY:'xvz1evFS4wEEPTGEFPHBog',X_API_SECRET:'kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw',X_ACCESS_TOKEN:'370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb',X_ACCESS_SECRET:'LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE'};
  const header=await run(`xOAuthHeader(vec,'POST','https://api.twitter.com/1.1/statuses/update.json',{include_entities:'true',status:'Hello Ladies + Gentlemen, a signed OAuth request!'},'kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg',1318622958)`);
  assert.ok(header.includes('oauth_signature="hCtSmYh%2BiHYCEqBWrE7C7hYmtUk%3D"'),header);
  // Without keys nothing is posted.
  context.env={DB:{prepare:sql=>wrap(sql)}};
  assert.equal((await run(`postPicksToX(env,${now})`)).disabled,true);
  context.env={...context.env,...context.vec};
  let out=await run(`postPicksToX(env,${now})`);
  assert.equal(out.posted,1);assert.equal(posts.length,1);
  const text=posts[0].body.text;
  assert.ok(text.startsWith('🔒 Official pick: Travis Kelce Over 4.5 receptions (+105, FanDuel)'),text);
  assert.ok(text.includes('Kansas City Chiefs @ Buffalo Bills')&&text.includes('2.4% better than the fair price.'),text);
  assert.ok(text.includes('Season: 4–2, ')&&text.includes('link in bio')&&!/https?:|\.com/.test(text)&&text.includes('21+'),text);
  assert.ok(text.length<=280);assert.match(posts[0].auth,/^OAuth oauth_consumer_key="xvz1evFS4wEEPTGEFPHBog"/);
  // Once per pick, even across runs.
  out=await run(`postPicksToX(env,${now+600000})`);assert.equal(out.posted,0);assert.equal(posts.length,1);
  // A failed post is retried on the next run.
  pick('official|2026-10-06|props|prop|b','Josh Allen',-110,null,new Date(now).toISOString(),'2026-10-09T00:15:00Z');
  fail=true;out=await run(`postPicksToX(env,${now+600000})`);assert.equal(out.posted,0);
  fail=false;out=await run(`postPicksToX(env,${now+1200000})`);assert.equal(out.posted,1);assert.ok(posts[1].body.text.includes('Josh Allen'));
  // Tuesday results post, once.
  const tue=Date.parse('2026-10-06T15:10:00Z');
  out=await run(`postWeeklyToX(env,${tue})`);assert.equal(out.posted,1);
  const weekly=posts.at(-1).body.text;
  assert.ok(weekly.startsWith('📊 Week 4 results: 4–2 on props, +')&&weekly.includes('link in bio')&&!/https?:|\.com/.test(weekly),weekly);
  assert.equal((await run(`postWeeklyToX(env,${tue+600000})`)).done,true);
  assert.equal((await run(`postWeeklyToX(env,Date.parse('2026-10-05T16:00:00Z'))`)).due,false,'not on Monday');
  console.log('PASS: X posts sign correctly, post each new official pick once with its price, value and season record, retry failures, and post Tuesday results once');
})().catch(error=>{console.error(error);process.exit(1)});
