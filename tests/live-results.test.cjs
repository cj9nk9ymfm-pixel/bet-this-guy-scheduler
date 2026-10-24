const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),{webcrypto}=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const {read}=require('./helpers/client.cjs');
// Prediction picks and parlays are decided mid-game the way official picks
// are: an Over that clears its line wins and an Under it passes loses right
// away; Unders that hold wait for the final. Results reply one or two a run.
const context=vm.createContext({URL,URLSearchParams,Request,Response,Headers,AbortSignal,Date,console,setTimeout,clearTimeout,crypto:webcrypto,TextEncoder,btoa,atob});
const t=read('worker/index.template.js');
vm.runInContext(t.slice(t.indexOf('const API_BASE')).replace('__MOVEMENT_SERVER__',read('worker/movement.js')).replace('__LIVE_SERVER__',read('worker/live.js')).replace('__STATS_SHARED__',read('dist/stats.js')).replace('__RECORDS_SERVER__',read('worker/records.js')).replace('__ACCOUNTS_SERVER__',read('worker/accounts.js')).replace('export default {','this.worker={'),context);
const db=new DatabaseSync(':memory:');for(const f of fs.readdirSync('drizzle').filter(f=>/^000[0-2]_|0006_|0028_|0030_|0032_|0036_/.test(f)).sort())db.exec(read('drizzle/'+f).replaceAll('--> statement-breakpoint',''));
const wrap=(sql,args=[])=>({bind(...v){return wrap(sql,v)},async first(){return db.prepare(sql).get(...args)||null},async all(){return{results:db.prepare(sql).all(...args)}},async run(){const r=db.prepare(sql).run(...args);return{success:true,meta:{changes:Number(r.changes)}}}});
context.env={DB:{prepare:sql=>wrap(sql),async batch(l){for(const s of l)await s.run()}},BALLDONTLIE_API_KEY:'b'};
const gt='2026-10-13T00:15:00.000Z',now=Date.parse('2026-10-13T01:00:00Z');
// Live box score: Mumpfield 1 catch (Over 0.5 cleared), Allen 1 TD (Under 1.5 still alive), Parkinson 2 catches (Under 1.5 passed).
const live={'Konata Mumpfield':1,'Josh Allen':1,'Colby Parkinson':2,'Dawson Knox':0};
context.gradePublicRecord=async rec=>{const legs=JSON.parse(rec.legs_json);rec.gradedLegs=legs.map(l=>{const v=live[l.player],early=v>l.line;return {result:early?(l.side==='Over'?'won':'lost'):'pending',actualValue:early?v:null,decidedEarly:early,boxScoreFinal:false}});rec.provisionalResult=rec.gradedLegs.some(g=>g.result==='lost')?'lost':rec.gradedLegs.every(g=>g.result==='won')?'won':rec.kind==='prop'?rec.gradedLegs[0].result==='pending'?null:rec.gradedLegs[0].result:null;return null};
const pk=(id,p,m,s,l)=>db.prepare("INSERT INTO prediction_picks(id,exchange,event_id,player,team,market,side,line,odds,net_odds,fair_pct,edge,game_time,posted_at) VALUES(?,'Novig','e',?,'BUF',?,?,?,-110,-110,55,1,?,'2026-10-12T03:00:00Z')").run(id,p,m,s,l,gt);
pk('pm|m','Konata Mumpfield','Receptions','Over',0.5);pk('pm|a','Josh Allen','Passing Touchdowns','Under',1.5);
db.prepare("INSERT INTO prediction_parlays(id,week,tier,exchange,legs_json,odds,game_time,posted_at) VALUES('pp','2026-10-06','short','Novig',?,161,?,'2026-10-12T19:00:00Z')").run(JSON.stringify([{player:'Dawson Knox',market:'Receptions',side:'Under',line:1.5,eventId:'e',gameTime:gt},{player:'Colby Parkinson',market:'Receptions',side:'Under',line:1.5,eventId:'e',gameTime:gt}]),gt);
(async()=>{
  const out=JSON.parse(JSON.stringify(await vm.runInContext(`gradePredictionNow(env,${now})`,context)));
  const row=id=>db.prepare('SELECT result,actual,early FROM prediction_picks WHERE id=?').get(id);
  assert.deepEqual({...row('pm|m')},{result:'won',actual:1,early:1},'an Over that clears its line wins mid-game');
  assert.equal(row('pm|a').result,null,'an Under still alive waits for the final');
  const pp=db.prepare('SELECT result,legs_json FROM prediction_parlays').get();
  assert.equal(pp.result,'lost','a parlay loses the moment one leg is lost');
  assert.deepEqual(JSON.parse(pp.legs_json).map(l=>l.result||null),[null,'lost']);
  assert.equal(out.graded,2);
  // Results page data: singles and parlays apart, by app, every play listed.
  const rec=JSON.parse(JSON.stringify(await vm.runInContext('predictionRecordData(env)',context)));
  assert.deepEqual([rec.singles.wins,rec.singles.losses,rec.parlays.wins,rec.parlays.losses],[1,0,0,1]);
  assert.deepEqual([rec.apps.Novig.wins,rec.apps.Novig.losses,rec.apps.Novig.plays],[1,1,3]);
  assert.equal(rec.plays.length,3);assert.equal(rec.plays.find(p=>p.kind==='parlay').money,-25);
  // Fees from the apps' own pages: Novig free pre-game, 0.10 x P x (1 - P) on parlays; ProphetX 2% of winnings.
  const net=(k,o)=>JSON.parse(JSON.stringify(vm.runInContext(`predictionNet(${JSON.stringify(k)},${o})`,context)));
  assert.equal(net('novig',100).netOdds,100,'Novig pre-game singles: no fee');
  assert.equal(net('prophetx',100).netOdds,-102,'ProphetX: 2% off the winnings (an even-money bet pays 98 cents per dollar, -102)');
  const pd=vm.runInContext('predictionParlayNet("novig",2.61)',context);assert.ok(Math.abs(1/pd-(1/2.61+0.1*(1/2.61)*(1-1/2.61)))<1e-9,'Novig parlay fee on the combined price');
  assert.equal(vm.runInContext('predictionParlayNet("prophetx",2.61)',context),2.61,'ProphetX parlays: no fee');
  // One-off owner post: waits for the post it quotes, posts once, then clears.
  context.env.X_API_KEY='k';context.env.X_API_SECRET='s';context.env.X_ACCESS_TOKEN='1-t';context.env.X_ACCESS_SECRET='a';
  const sentX=[];context.xPost=async(env,text,m,r,q)=>{sentX.push([text,q]);return {data:{id:'55'}}};
  db.prepare("INSERT INTO app_settings(key,value) VALUES('x-custom-post',?)").run(JSON.stringify({text:'Hello @novig',quoteKey:'xid:x-pm-week:w'}));
  assert.equal(JSON.parse(JSON.stringify(await vm.runInContext('postCustomToX(env)',context))).waiting,true,'waits for the quoted post');
  db.prepare("INSERT INTO app_settings(key,value) VALUES('xid:x-pm-week:w','777')").run();
  assert.equal((await vm.runInContext('postCustomToX(env)',context)).posted,1);assert.deepEqual(sentX,[['Hello @novig','777']]);
  assert.equal((await vm.runInContext('postCustomToX(env)',context)).posted,0,'posts once');
  // One-off reply: under the post its key names, once.
  const sentR=[];context.xPost=async(env,text,m,r)=>{sentR.push([text,r]);return {data:{id:'57'}}};
  db.prepare("INSERT INTO app_settings(key,value) VALUES('x-custom-reply',?)").run(JSON.stringify({text:'Stat correction',replyKey:'xid:pick1'}));
  assert.equal((await vm.runInContext('postCustomReplyToX(env)',context)).waiting,true,'waits for the post it replies to');
  db.prepare("INSERT INTO app_settings(key,value) VALUES('xid:pick1','888')").run();
  assert.equal((await vm.runInContext('postCustomReplyToX(env)',context)).posted,1);assert.deepEqual(sentR,[['Stat correction','888']]);
  assert.equal((await vm.runInContext('postCustomReplyToX(env)',context)).posted,0,'replies once');
  // A scheduled post with an attached card: waits for its time, then posts with the image.
  const uploads=[];context.renderCardPng=async svg=>{uploads.push(svg);return new Uint8Array([1])};context.xUploadImage=async()=>'m9';
  const sentM=[];context.xPost=async(env,text,m)=>{sentM.push([text,m]);return {data:{id:'56'}}};
  db.prepare("INSERT INTO app_settings(key,value) VALUES('x-card:test','<svg/>')").run();
  db.prepare("INSERT INTO app_settings(key,value) VALUES('x-custom-post',?)").run(JSON.stringify({text:'Spotlight',at:'2026-10-18T16:00:00Z',svgKey:'x-card:test'}));
  assert.equal((await vm.runInContext(`postCustomToX(env,${Date.parse('2026-10-18T15:55:00Z')})`,context)).waiting,true,'waits for its time');
  assert.equal((await vm.runInContext(`postCustomToX(env,${Date.parse('2026-10-18T16:01:00Z')})`,context)).graphic,true);assert.deepEqual(sentM,[['Spotlight','m9']]);assert.deepEqual(uploads,['<svg/>']);
  console.log('PASS: prediction picks and parlays are decided mid-game when an Over clears or an Under is passed; Unders that hold wait for the final');
})().catch(e=>{console.error(e);process.exit(1)});
