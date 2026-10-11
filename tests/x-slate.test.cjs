const assert=require('node:assert/strict'),vm=require('node:vm'),{webcrypto}=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const {read}=require('./helpers/client.cjs');
// Slate post: the day's pending official picks on one graphic, once per game day.
const posts=[];
const context=vm.createContext({URL,URLSearchParams,Request,Response,Headers,AbortSignal,Date,console,setTimeout,clearTimeout,crypto:webcrypto,TextEncoder,btoa,atob,FormData,Blob,
  fetch:async(url,init={})=>{url=String(url);if(/media\/upload/.test(url))return Response.json({data:{id:'m1'}});if(url==='https://api.twitter.com/2/tweets'){posts.push(JSON.parse(init.body));return Response.json({data:{id:'t'+posts.length}})}return new Response(null,{status:404})}});
const template=read('worker/index.template.js');
vm.runInContext(template.slice(template.indexOf('const API_BASE')).replace('__MOVEMENT_SERVER__',read('worker/movement.js')).replace('__LIVE_SERVER__',read('worker/live.js')).replace('__STATS_SHARED__',read('dist/stats.js')).replace('__RECORDS_SERVER__',read('worker/records.js')).replace('__ACCOUNTS_SERVER__',read('worker/accounts.js')).replace('export default {','this.worker={'),context);
const db=new DatabaseSync(':memory:');
for(const f of ['0000_public_record.sql','0001_record_settlement.sql','0002_historical_replays.sql','0006_push_alerts.sql'])db.exec(read('drizzle/'+f).replaceAll('--> statement-breakpoint',''));
const wrap=(sql,args=[])=>({bind(...values){return wrap(sql,values)},async first(){return db.prepare(sql).get(...args)||null},async all(){return{results:db.prepare(sql).all(...args)}},async run(){const r=db.prepare(sql).run(...args);return{success:true,meta:{changes:Number(r.changes)}}}});
const run=code=>vm.runInContext(code,context);
const pick=(id,player,odds,gameTime,result=null)=>db.prepare("INSERT INTO public_recommendations(id,kind,player,market,side,line,odds,game_time,legs_json,posted_at,status,result,source) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,'market-verified-v2')").run(`official|2026-10-06|props|prop|${id}`,'prop',player,'Receptions','Under',4.5,odds,gameTime,JSON.stringify([{player,team:'Houston Texans · @ Tennessee Titans',book:'FanDuel'}]),'2026-10-08T12:00:00Z',result?'final':'pending',result);
pick('a','Carnell Tate',128,'2026-10-11T17:00:00.000Z');pick('b','Brock Bowers',110,'2026-10-11T17:00:00.000Z');pick('c','Mark Andrews',120,'2026-10-12T00:20:00.000Z');
pick('d','Brock Purdy',110,'2026-10-13T00:15:00.000Z');pick('e','Old Pick',150,'2026-10-04T17:00:00.000Z','won');
(async()=>{
  context.env={DB:{prepare:sql=>wrap(sql),async batch(l){for(const s of l)await s.run()}},X_API_KEY:'k',X_API_SECRET:'s',X_ACCESS_TOKEN:'t',X_ACCESS_SECRET:'a'};
  run('renderCardPng=async svg=>{globalThis.__svg=svg;return new Uint8Array([137,80,78,71])}');
  assert.equal((await run(`postSlateToX(env,${Date.parse('2026-10-10T20:00:00Z')})`)).due,false,'not until 16 hours before the first kickoff');
  const out=await run(`postSlateToX(env,${Date.parse('2026-10-11T02:00:00Z')})`);
  assert.equal(out.posted,1);assert.equal(out.picks,3,'Sunday (Eastern) picks, incl. the night game; not Monday\'s');
  const text=posts[0].text;
  assert.ok(text.startsWith('🔒 Sunday’s official picks'),text);assert.ok(text.includes('• Carnell Tate Under 4.5 receptions (+128)')&&!text.includes('Purdy')&&!text.includes('Old Pick'));
  assert.deepEqual(posts[0].media,{media_ids:['m1']});assert.ok(!/https?:\/\//.test(text),'no link in the text');
  const svg=run('globalThis.__svg');assert.ok(svg.includes('Sunday')&&svg.includes('Carnell Tate')&&svg.includes('Texans @ Titans · FanDuel'));
  assert.equal((await run(`postSlateToX(env,${Date.parse('2026-10-11T02:05:00Z')})`)).done,true,'once per game day');assert.equal(posts.length,1);
  console.log('PASS: slate post sends the day\'s pending picks on one graphic, once, from 16 hours before kickoff');
})().catch(error=>{console.error(error);process.exit(1)});
