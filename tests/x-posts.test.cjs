const assert=require('node:assert/strict'),vm=require('node:vm'),{webcrypto}=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const {read}=require('./helpers/client.cjs');
const posts=[],uploads=[];let fail=false,uploadFail=false;
const context=vm.createContext({URL,URLSearchParams,Request,Response,Headers,AbortSignal,Date,console,setTimeout,clearTimeout,crypto:webcrypto,TextEncoder,btoa,atob,FormData,Blob,
  fetch:async(url,init={})=>{if(/media\/upload/.test(String(url))){uploads.push(String(url));return uploadFail?Response.json({title:'Forbidden'},{status:403}):Response.json({data:{id:'m'+uploads.length}})}if(String(url)==='https://api.twitter.com/2/tweets'){if(fail)return new Response('{}',{status:503});posts.push({auth:init.headers.authorization,body:JSON.parse(init.body)});return Response.json({data:{id:String(posts.length)}})}return new Response(null,{status:404})}});
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
  // The graphic: an SVG with the pick, rendered and uploaded, then posted with the image.
  run('renderCardPng=async svg=>{globalThis.__svg=svg;return new Uint8Array([137,80,78,71])}');
  let out=await run(`postPicksToX(env,${now})`);
  assert.equal(out.posted,1);assert.equal(posts.length,1);
  const text=posts[0].body.text;
  assert.deepEqual(posts[0].body.media,{media_ids:['m1']},'posted with the uploaded graphic');
  assert.ok(text.startsWith('🔒 Official pick: Travis Kelce Over 4.5 receptions (+105, FanDuel)\nChiefs @ Bills · '),text);
  assert.ok(text.includes('link in bio')&&!/https?:|\.com/.test(text)&&text.includes('21+'),text);
  const svg=run('__svg');
  for(const bit of ['Travis Kelce','Under 4.5 receptions'.replace('Under','Over'),'+105','at FanDuel · +2.4% vs fair','4–2 · +','Today’s full board, free','betthisguy.com','OFFICIAL PICK'])assert.ok(svg.includes(bit),bit);
  assert.ok(text.length<=280);assert.match(posts[0].auth,/^OAuth oauth_consumer_key="xvz1evFS4wEEPTGEFPHBog"/);
  // Once per pick, even across runs.
  out=await run(`postPicksToX(env,${now+600000})`);assert.equal(out.posted,0);assert.equal(posts.length,1);
  // A failed post is retried on the next run.
  pick('official|2026-10-06|props|prop|b','Josh Allen',-110,null,new Date(now).toISOString(),'2026-10-09T00:15:00Z');
  fail=true;out=await run(`postPicksToX(env,${now+600000})`);assert.equal(out.posted,0);
  fail=false;out=await run(`postPicksToX(env,${now+1200000})`);assert.equal(out.posted,1);assert.ok(posts[1].body.text.includes('Josh Allen'));
  // Upload keeps failing: after three runs the text version posts instead, once.
  pick('official|2026-10-06|props|prop|c','Cole Kmet',110,null,new Date(now).toISOString(),'2026-10-09T00:15:00Z');
  uploadFail=true;for(let i=0;i<2;i++)assert.equal((await run(`postPicksToX(env,${now+(3+i)*600000})`)).posted,0);
  out=await run(`postPicksToX(env,${now+5*600000})`);assert.equal(out.posted,1);
  assert.ok(!posts.at(-1).body.media&&posts.at(-1).body.text.includes('Cole Kmet')&&posts.at(-1).body.text.includes('Season: 4–2'),'text fallback');
  // A pick already posted as text earlier is not posted as text again.
  pick('official|2026-10-06|props|prop|d','Old Text',110,null,new Date(now).toISOString(),'2026-10-09T00:15:00Z');db.prepare("INSERT INTO app_settings(key,value) VALUES('x:official|2026-10-06|props|prop|d','x')").run();
  const before=posts.length;for(let i=0;i<3;i++)await run(`postPicksToX(env,${now+(6+i)*600000})`);assert.equal(posts.length,before);uploadFail=false;
  // Tuesday results post, once.
  const tue=Date.parse('2026-10-06T15:10:00Z');
  out=await run(`postWeeklyToX(env,${tue})`);assert.equal(out.posted,1);
  const weekly=posts.at(-1).body.text;
  assert.ok(weekly.startsWith('📊 Week 4 results: 4–2 on props, +')&&weekly.includes('link in bio')&&!/https?:|\.com/.test(weekly),weekly);
  assert.equal((await run(`postWeeklyToX(env,${tue+600000})`)).done,true);
  assert.equal((await run(`postWeeklyToX(env,Date.parse('2026-10-05T16:00:00Z'))`)).due,false,'not on Monday');
  assert.ok(posts.at(-1).body.media,'weekly post carries the results graphic');
  const week=run('__svg');for(const bit of ['Week 4','4–2','WEEKLY RESULTS','Old Player 0','See every pick graded'])assert.ok(week.includes(bit),bit);
  // The pick post's id is saved so later posts can reply under it.
  const kelce='official|2026-10-06|props|prop|a';
  assert.equal(db.prepare("SELECT value FROM app_settings WHERE key=?").get(`xid:${kelce}`).value,'1');
  // Closing line: posted under the pick when we beat the close, once; not when we didn't.
  const kick=Date.parse('2026-10-09T00:15:00Z');
  db.prepare("UPDATE public_recommendations SET closing_line=4.5,closing_odds=-120,closing_captured_at=? WHERE id=?").run(new Date(kick-15*60000).toISOString(),kelce);
  db.prepare("UPDATE public_recommendations SET closing_line=4.5,closing_odds=-105,closing_captured_at=? WHERE id=?").run(new Date(kick-15*60000).toISOString(),'official|2026-10-06|props|prop|b');
  let n=posts.length;out=await run(`postClosingToX(env,${kick-10*60000})`);assert.equal(out.posted,1);assert.equal(posts.length,n+1);
  const close=posts.at(-1).body;
  assert.deepEqual(close.reply,{in_reply_to_tweet_id:'1'});
  assert.ok(close.text.includes('We locked Travis Kelce Over 4.5 receptions at +105 earlier today.')&&close.text.includes('the same bet was -120'),close.text);
  assert.equal((await run(`postClosingToX(env,${kick})`)).posted,0,'once');
  assert.ok(run(`xCloseText({player:'A B',side:'Over',line:4.5,market:'Receptions',odds:110,posted_at:'2026-10-11T14:00:00Z',game_time:'2026-10-11T17:00:00Z'},{kind:'price',close:'-110'})`).includes('at +110 earlier today.'),'same-day lock');
  // A line that moved past ours counts too; a line that moved against us doesn't.
  assert.equal(run(`xBeatClose({kind:'prop',side:'Over',line:4.5,closing_line:5.5,odds:110,closing_odds:-110,closing_captured_at:'x'})`).kind,'line');
  assert.equal(run(`xBeatClose({kind:'prop',side:'Under',line:4.5,closing_line:5.5,odds:110,closing_odds:-110,closing_captured_at:'x'})`),null);
  assert.equal(run(`xBeatClose({kind:'prop',side:'Over',line:4.5,closing_line:4.5,odds:110,closing_odds:108,closing_captured_at:'x'})`),null,'tiny moves do not count');
  // Results: a graded pick we posted gets one result post with its graphic, as a reply.
  const settle=(id,result,actual)=>db.prepare("UPDATE public_recommendations SET status='final',result=?,settled_at=?,legs_json=json_set(legs_json,'$[0].actualValue',?) WHERE id=?").run(result,new Date(kick+4*3600000).toISOString(),actual,id);
  settle(kelce,'won',7);settle('official|2026-10-06|props|prop|b','lost',3);
  n=posts.length;out=await run(`runXPosts(env,${kick+5*3600000})`);assert.equal(out.results.posted,1);
  const won=posts.at(-1).body;
  assert.ok(won.text.startsWith('✅ Cashed: Travis Kelce Over 4.5 receptions (+105)\nFinal: had 7 receptions.')&&won.text.includes('Season: 5–3'),won.text);
  assert.deepEqual(won.reply,{in_reply_to_tweet_id:'1'});assert.ok(won.media);
  for(const bit of ['WINNER','Had 7 receptions · +\u0024105','See every pick graded'])assert.ok(run('__svg').includes(bit),bit);
  // Losses post the same way, on the next run.
  out=await run(`runXPosts(env,${kick+5*3600000+600000})`);assert.equal(out.results.posted,1);
  const lost=posts.at(-1).body.text;assert.ok(lost.startsWith('❌ Lost: Josh Allen')&&lost.includes('We post every loss too.'),lost);
  assert.ok(run('__svg').includes('LOSS'));
  out=await run(`runXPosts(env,${kick+5*3600000+1200000})`);assert.equal(out.results.posted,0,'each result once');
  // Picks that never went out on X get no result post.
  pick('official|2026-10-06|props|prop|e','Never Posted',110,'won','2026-10-01T12:00:00Z','2026-10-04T17:00:00Z');
  db.prepare("UPDATE public_recommendations SET settled_at=? WHERE id='official|2026-10-06|props|prop|e'").run(new Date(kick+4*3600000).toISOString());
  assert.equal((await run(`postResultsToX(env,${kick+6*3600000})`)).posted,0);
  for(const t of posts)assert.ok(t.body.text.length<=280&&!/https?:|\.com/.test(t.body.text),t.body.text);
  console.log('PASS: X posts sign correctly, post each new official pick once with its graphic (text fallback after three failed uploads, never a duplicate), retry failures, post Tuesday results once with a graphic, reply with beat-the-close posts and with every result, wins and losses');
})().catch(error=>{console.error(error);process.exit(1)});
