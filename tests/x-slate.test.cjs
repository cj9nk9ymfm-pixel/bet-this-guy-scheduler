const assert=require('node:assert/strict'),vm=require('node:vm'),{webcrypto}=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const {read}=require('./helpers/client.cjs');
// Slate post: the day's pending official picks on one graphic, once per game day.
const posts=[];
const context=vm.createContext({URL,URLSearchParams,Request,Response,Headers,AbortSignal,Date,console,setTimeout,clearTimeout,crypto:webcrypto,TextEncoder,btoa,atob,FormData,Blob,
  fetch:async(url,init={})=>{url=String(url);if(/media\/upload/.test(url))return Response.json({data:{id:'m1'}});if(url==='https://api.twitter.com/2/tweets'){posts.push(JSON.parse(init.body));return Response.json({data:{id:'t'+posts.length}})}return new Response(null,{status:404})}});
const template=read('worker/index.template.js');
vm.runInContext(template.slice(template.indexOf('const API_BASE')).replace('__MOVEMENT_SERVER__',read('worker/movement.js')).replace('__LIVE_SERVER__',read('worker/live.js')).replace('__STATS_SHARED__',read('dist/stats.js')).replace('__RECORDS_SERVER__',read('worker/records.js')).replace('__ACCOUNTS_SERVER__',read('worker/accounts.js')).replace('export default {','this.worker={'),context);
// These tests cover a post per pick (x-lean off); tests/x-lean.test.cjs covers lean posting.
vm.runInContext('X_PICK_POSTS_DEFAULT=false;MATCHUP_WAIT=0;X_LEAN_DEFAULT=false',context);
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
  assert.ok(text.startsWith('🔒 Sunday’s official picks: 3 so far\n3 singles, every one on the card 👇')&&text.includes('More can drop up to kickoff')&&text.includes('Record: sportsbooks'),text);assert.ok(text.length<=280&&!text.includes('Carnell Tate'),'counts, not a list');
  assert.deepEqual(posts[0].media,{media_ids:['m1']});assert.ok(!/https?:\/\//.test(text),'no link in the text');
  const svg=run('globalThis.__svg');assert.ok(svg.includes('Sunday')&&svg.includes('Carnell Tate')&&svg.includes('Texans @ Titans · FanDuel'));
  // A big day: every pick on the card, tighter rows, nothing cut.
  const big=run(`xSlateSvg({day:'Sunday',date:'Oct 18',picks:Array.from({length:30},(_,i)=>({text:'Player '+i+' · Over 1.5 receptions',odds:'+110',sub:'Bills @ Jets · FanDuel'}))})`);
  const legs=run(`xSlateSvg({day:'Sunday',date:'Oct 18',picks:[...Array.from({length:9},(_,i)=>({text:'Player '+i+' · Over 1.5 receptions',odds:'+110',sub:'Bills @ Jets'})),{text:'2-leg parlay',odds:'+433',legLines:[{text:'Ryan Fitzgerald Under 1.5 extra points',odds:'+160'},{text:'Daniel Carlson Over 7.5 kicking points',odds:'+105'}]}]})`);
  assert.ok(legs.includes('Ryan Fitzgerald Under 1.5 XPs')&&legs.includes('Daniel Carlson Over 7.5 kick pts')&&legs.includes('+433'),'parlay legs spelled out');
  assert.ok(big.includes('>Player 0<')&&big.includes('>Player 29<')&&!big.includes('more on the site')&&/height="(\d+)"/.exec(big)[1]>675,'all 30 picks fit');
  assert.equal((await run(`postSlateToX(env,${Date.parse('2026-10-11T02:05:00Z')})`)).done,true,'once per game day');assert.equal(posts.length,1);
  // Morning update: 9 AM Eastern on game day, only when picks locked after the night post.
  assert.equal((await run(`postSlateToX(env,${Date.parse('2026-10-11T12:05:00Z')},false,true)`)).due,false,'not at 8 AM ET');
  assert.equal((await run(`postSlateToX(env,${Date.parse('2026-10-11T13:05:00Z')},false,true)`)).nothingNew,true,'nothing new since the night post');
  pick('f','Morning Pick',115,'2026-10-11T17:00:00.000Z');db.prepare("UPDATE public_recommendations SET posted_at='2026-10-11T12:00:00Z' WHERE player='Morning Pick'").run();
  const am=await run(`postSlateToX(env,${Date.parse('2026-10-11T13:10:00Z')},false,true)`);
  assert.equal(am.posted,1);assert.equal(am.morning,true);assert.equal(am.picks,4);
  assert.ok(posts.at(-1).text.startsWith('☀️ Sunday morning: 4 official picks so far')&&posts.at(-1).text.length<=280,posts.at(-1).text);
  assert.equal((await run(`postSlateToX(env,${Date.parse('2026-10-11T13:15:00Z')},false,true)`)).done,true,'morning update once a day');
  db.prepare("DELETE FROM public_recommendations WHERE player='Morning Pick'").run();
  // Final card: the run 65 to 80 minutes before the first pick kicks off.
  assert.equal((await run(`postSlateToX(env,${Date.parse('2026-10-11T15:00:00Z')},true)`)).due,false,'not two hours out');
  assert.equal((await run(`postSlateToX(env,${Date.parse('2026-10-11T16:30:00Z')},true)`)).due,false,'not 30 minutes out');
  const fin=await run(`postSlateToX(env,${Date.parse('2026-10-11T15:45:00Z')},true)`);
  assert.equal(fin.posted,1);assert.equal(fin.final,true);
  assert.ok(posts.at(-1).text.startsWith('🔒 Locked for Sunday: 3 official picks so far')&&posts.at(-1).text.includes('First kickoff 1:00 PM ET'),posts.at(-1).text);
  assert.ok(run('globalThis.__svg').includes('LOCKED SO FAR')&&run('globalThis.__svg').includes('More can drop until kickoff')&&run('globalThis.__svg').includes('SPORTSBOOKS')&&run('globalThis.__svg').includes('PREDICTION APPS'));
  assert.equal((await run(`postSlateToX(env,${Date.parse('2026-10-11T15:50:00Z')},true)`)).done,true,'final card once a day');
  // Alerts pin post: once per x-pin-request date, with the day's locked picks (even after kickoff).
  assert.equal((await run(`postAlertsPinToX(env,${Date.parse('2026-10-11T17:40:00Z')})`)).none,true,'nothing until requested');
  db.prepare("UPDATE public_recommendations SET legs_json=json_set(legs_json,'$[0].priceTrail',json('[{\"o\":-120}]')) WHERE player IN ('Carnell Tate','Brock Bowers')").run();
  db.prepare("INSERT INTO app_settings (key,value) VALUES ('x-pin-request','2026-10-11')").run();
  const pin=await run(`postAlertsPinToX(env,${Date.parse('2026-10-11T17:40:00Z')})`);
  assert.equal(pin.posted,1);assert.equal(pin.picks,3,'Sunday ET picks, incl. games already started');assert.equal(pin.moved,2);
  const pt=posts.at(-1).text;assert.ok(pt.startsWith('🔔 We bet the number')&&pt.includes('2 of 3 of Sunday’s picks paid more')&&pt.includes('Turn on alerts')&&pt.length<=280,pt);
  assert.ok(run('globalThis.__svg').includes('Locked before kickoff'));
  assert.equal((await run(`postAlertsPinToX(env,${Date.parse('2026-10-11T17:50:00Z')})`)).done,true,'once per request');
  assert.ok(run('globalThis.__svg').includes('2-leg')===false&&/under 4\.5 rec/i.test(run('globalThis.__svg')),'short market names');
  db.prepare("UPDATE app_settings SET value='2026-10-11#2' WHERE key='x-pin-request'").run();
  assert.equal((await run(`postAlertsPinToX(env,${Date.parse('2026-10-11T17:55:00Z')})`)).posted,1,'a suffix resends');
  // Proof post: the season's beat-the-close count, text only, once per x-proof-request.
  assert.equal((await run(`postProofToX(env,${Date.parse('2026-10-12T02:00:00Z')})`)).none,true,'nothing until requested');
  db.prepare("INSERT INTO app_settings (key,value) VALUES ('x-proof-request','2026-10-12')").run();
  assert.equal((await run(`postProofToX(env,${Date.parse('2026-10-12T02:00:00Z')})`)).skipped,true,'needs 10+ tracked closes');
  for(let i=0;i<12;i++){pick('p'+i,'Proof '+i,120,'2026-10-04T17:00:00.000Z',i%2?'won':'lost');db.prepare("UPDATE public_recommendations SET closing_odds=?,closing_line=4.5,closing_captured_at='2026-10-04T17:00:00Z' WHERE player=?").run(i<9?-110:150,'Proof '+i)}
  const before=posts.length,proof=await run(`postProofToX(env,${Date.parse('2026-10-12T02:05:00Z')})`);
  assert.equal(proof.posted,1);assert.equal(proof.beat,9);assert.equal(proof.tracked,12);assert.equal(posts.length,before+1);
  const xt=posts.at(-1);assert.ok(xt.text.startsWith('📈 9 of 12 of our picks this season beat the closing line')&&xt.text.includes('Free alerts')&&xt.text.length<=280&&!xt.media,xt.text);
  assert.equal((await run(`postProofToX(env,${Date.parse('2026-10-12T02:10:00Z')})`)).done,true,'once per request');
  // Only strong picks get their own post; the rest are on cards, and a catch-up card covers any pick not on X yet.
  const late=Date.parse('2026-10-12T23:30:00Z');
  assert.equal((await run(`postPicksToX(env,${late})`)).posted,0,'a pick under the 1.5-point bar gets no post of its own');
  const n0=posts.length,cu=await run(`postCatchUpToX(env,${late})`);
  assert.equal(cu.posted,1);assert.equal(cu.picks,1,'Brock Purdy was never on X: caught up before his game');
  assert.ok(posts.at(-1).text.startsWith('🔒 Just locked: 1 more pick before kickoff')&&posts.at(-1).text.length<=280&&posts.length===n0+1,posts.at(-1).text);
  assert.ok(run('globalThis.__svg').includes('Brock Purdy')&&run('globalThis.__svg').includes('JUST LOCKED'));
  assert.equal((await run(`postCatchUpToX(env,${late+600000})`)).covered,true,'never twice');
  assert.equal((await run(`postCatchUpToX(env,${Date.parse('2026-10-11T16:30:00Z')})`)).covered,true,'picks already on the slate card are covered');
  // A long date line (Oct 26 NBA card ran under the pick list in the old layout).
  const wrapSvg=run(`xSlateSvg(${JSON.stringify({final:true,day:'Monday',dateLine:'Oct 26 · 2 picks + 1 parlay + 3 prediction-app picks',note:'First tip 7:10 PM ET',note2:'Late games can add more',season:'26–23 · +$808',picks:[{color:'#2ee6a8',text:'Miles Bridges · Under 5.5 rebounds',odds:'+115'}]})})`);
  // Oct 31 layout: full width, so the whole date line fits on one line, the notes under it.
  assert.ok(wrapSvg.includes('>Oct 26 · 2 picks + 1 parlay + 3 prediction-app picks</text>'),'date line on one line');
  assert.ok(wrapSvg.includes('>First tip 7:10 PM ET · Late games can add more</text>')&&wrapSvg.includes('26–23 · +$808'),'notes and season');
  console.log('PASS: slate post sends the day\'s pending picks on one graphic, once, from 16 hours before kickoff, a 9 AM ET morning update when new picks locked, and a final card 75 minutes out');
})().catch(error=>{console.error(error);process.exit(1)});
