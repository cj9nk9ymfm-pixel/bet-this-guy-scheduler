const assert=require('node:assert/strict'),vm=require('node:vm'),{webcrypto}=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const {read}=require('./helpers/client.cjs');
// Prediction markets (shadow): exchange prices vs our sportsbook fair price,
// and what a visitor's state can bet on.
const context=vm.createContext({URL,URLSearchParams,Request,Response,Headers,AbortSignal,Date,console,setTimeout,clearTimeout,crypto:webcrypto,TextEncoder,btoa,atob});
const template=read('worker/index.template.js');
vm.runInContext(template.slice(template.indexOf('const API_BASE')).replace('__MOVEMENT_SERVER__',read('worker/movement.js')).replace('__LIVE_SERVER__',read('worker/live.js')).replace('__STATS_SHARED__',read('dist/stats.js')).replace('__RECORDS_SERVER__',read('worker/records.js')).replace('__ACCOUNTS_SERVER__',read('worker/accounts.js')).replace('export default {','this.worker={'),context);
const fs=require('node:fs'),db=new DatabaseSync(':memory:');
for(const f of fs.readdirSync('drizzle').filter(f=>/^000[0-2]_|^0006_|^0008_|^0013_|0025_|0026_|0027_|0031_|0032_|0036_|0037_|0033_|0028_|0030_|0018_/.test(f)).sort())db.exec(read('drizzle/'+f).replaceAll('--> statement-breakpoint',''));
const wrap=(sql,args=[])=>({bind(...values){return wrap(sql,values)},async first(){return db.prepare(sql).get(...args)||null},async all(){return{results:db.prepare(sql).all(...args)}},async run(){const r=db.prepare(sql).run(...args);return{success:true,meta:{changes:Number(r.changes)}}}});
context.env={DB:{prepare:sql=>wrap(sql),async batch(list){for(const s of list)await s.run()}},THE_ODDS_API_KEY:'k',BALLDONTLIE_API_KEY:'b'};
const run=code=>vm.runInContext(code,context),J=v=>JSON.parse(JSON.stringify(v));
(async()=>{
  const now=Date.parse('2026-10-11T12:00:00Z'),kick='2026-10-11T17:00:00.000Z',upd=new Date(now-60000).toISOString();
  const m=(over,under)=>({key:'player_receptions',last_update:upd,outcomes:[{name:'Over',description:'Tre Tucker',point:3.5,price:over},{name:'Under',description:'Tre Tucker',point:3.5,price:under}]});
  const book=(key,o,u)=>({key,title:key,last_update:upd,markets:[m(o,u)]});
  context.boards=[{id:'g1',eventID:'NFL--g1',commence_time:kick,home_team:'New England Patriots',away_team:'Las Vegas Raiders',bookmakers:[book('draftkings',-110,-110),book('fanduel',-112,-108),book('betmgm',-108,-112)]}];
  // Novig hangs +115 on the Over (fair is about 50%); Kalshi is at fair.
  const exchange={id:'g1',bookmakers:[book('novig',115,-125),book('kalshi',-102,-104),book('bovada',200,-300)]};
  const urls=[];
  context.fetch=async url=>{url=String(url);urls.push(url);if(url.includes('/events/g1/odds')&&url.includes('regions=us_ex'))return new Response(JSON.stringify(exchange));return new Response(null,{status:404})};
  let out=J(await run(`recordExchangeProps(env,boards,${now})`));
  assert.deepEqual([out.games,out.logged],[1,1]);
  const row=db.prepare('SELECT * FROM exchange_shadow').get();
  assert.deepEqual([row.kind,row.exchange,row.player,row.side,row.line,row.odds],['prop','Novig','Tre Tucker','Over',3.5,115]);
  assert.ok(row.fair_pct>49&&row.fair_pct<51&&row.edge>2,'fair from the sportsbooks, edge at the exchange price');
  const cov=JSON.parse(db.prepare("SELECT value FROM app_settings WHERE key='exchange-coverage'").get().value);
  assert.deepEqual(cov.coverage.novig,{lines:2,matched:2,matched2:0,matchedTd:0});assert.ok(!cov.coverage.bovada,'only prediction markets count');
  out=J(await run(`recordExchangeProps(env,boards,${now+600000})`));assert.deepEqual(out,{skipped:true},'every 30 minutes');
  // Games 48-96 hours out: fetched too, but every 2 hours rather than every 30 minutes.
  {const keep=db.prepare("SELECT value FROM app_settings WHERE key='exchange-props-at'").get().value,saveBoards=context.boards,saveFetch=context.fetch;
   context.boards=[{...saveBoards[0],id:'g9',eventID:'NFL--g9',commence_time:new Date(now+72*3600000).toISOString()}];
   context.fetch=async url=>{url=String(url);urls.push(url);if(url.includes('/events/g9/odds'))return new Response(JSON.stringify({...exchange,id:'g9'}));return new Response(null,{status:404})};
   const far=()=>urls.filter(u=>u.includes('/events/g9/odds')).length;
   await run(`recordExchangeProps(env,boards,${now+31*60000})`);assert.equal(far(),1,'a game three days out gets prediction prices');
   await run(`recordExchangeProps(env,boards,${now+62*60000})`);assert.equal(far(),1,'not again within two hours');
   await run(`recordExchangeProps(env,boards,${now+155*60000})`);assert.equal(far(),2,'refreshed after two hours');
   for(const t of ['exchange_prices','exchange_shadow','prediction_picks'])db.prepare(`DELETE FROM ${t} WHERE event_id='NFL--g9'`).run();
   db.prepare("UPDATE app_settings SET value=? WHERE key='exchange-props-at'").run(keep);context.boards=saveBoards;context.fetch=saveFetch}
  // Picks and parlay legs lock only inside 24 hours of kickoff.
  {const fairs=run(`sportsbookFairs(boards,${now})`),ex={bookmakers:[book('novig',105,-125)]},b=(h)=>({...context.boards[0],commence_time:new Date(now+h*3600000).toISOString()});
   context.fairs=fairs;const cand=(h,o='{}')=>J(run(`predictionCandidates(${JSON.stringify(b(h))},${JSON.stringify(ex)},fairs,${now},${o})`));
   assert.equal(cand(5).length,0,'a 1.2-point edge is under the 1.5-point bar');assert.equal(cand(5,'{min:1}').length,1,'a 1-2 point edge locks close to the game at a lower bar');
   assert.equal(cand(30).length,0,'nothing locks more than 24 hours out');
   assert.equal(cand(30,'{min:0,max:5}').length,0,'no parlay legs from games more than 24 hours out');
   assert.equal(cand(5,'{min:0,max:5}').length,1);
   // Two-book fair prices: only lines no third book prices, for the two-book test.
   const two={...context.boards[0],bookmakers:context.boards[0].bookmakers.slice(0,2)};
   assert.equal(run(`sportsbookFairs([${JSON.stringify(two)}],${now})`).size,0,'two books are not enough for the official fair price');
   assert.equal(run(`sportsbookFairs([${JSON.stringify(two)}],${now},2)`).size,1,'the two-book test uses them');}
  // Anytime TD: Yes-only sportsbook prices (4+ books) give an estimated fair chance for the td1 test.
  {const yes=(key,price)=>({key,title:key,last_update:upd,markets:[{key:'player_anytime_td',last_update:upd,outcomes:[{name:'Yes',description:'Bijan Robinson',price}]}]});
   const bd=[{id:'g1',eventID:'NFL--g1',commence_time:kick,bookmakers:[yes('draftkings',-120),yes('fanduel',-115),yes('betmgm',-125),yes('caesars',-120)]}];
   const f=J([...run(`tdYesFairs(${JSON.stringify(bd)},${now})`)]);
   assert.equal(f.length,1);assert.equal(f[0][0],'NFL--g1|bijanrobinson|Anytime Touchdown|0.5');assert.ok(f[0][1]>.5&&f[0][1]<.53,'about 54.5% implied, less the 8% margin');
   assert.equal(run(`tdYesFairs(${JSON.stringify([{...bd[0],bookmakers:bd[0].bookmakers.slice(0,3)}])},${now})`).size,0,'needs 4 books');}
  // Anytime TD: yes/no reads as Over/Under 0.5, and is requested from the exchanges.
  assert.deepEqual(J(run(`exchangePriceList(${JSON.stringify({bookmakers:[{key:'kalshi',markets:[{key:'player_anytime_td',outcomes:[{name:'Yes',description:'Tre Tucker',price:150},{name:'No',description:'Tre Tucker',price:-180}]}]}]})})`)),[['kalshi','Tre Tucker','Anytime Touchdown','Over',0.5,150],['kalshi','Tre Tucker','Anytime Touchdown','Under',0.5,-180]]);
  assert.ok(urls.some(u=>u.includes('player_anytime_td')),'anytime TD is in the exchange request');
  // Prediction-market pick: Novig's +115 (no fee) clears the bar after fees; Kalshi at fair plus its fee does not.
  const pm=db.prepare('SELECT * FROM prediction_picks').all();
  assert.deepEqual(pm.map(r=>[r.exchange,r.player,r.side,r.odds,r.net_odds]),[['Novig','Tre Tucker','Over',115,115]]);assert.ok(pm[0].edge>2&&pm[0].fair_pct>49);
  assert.ok(run('predictionNet("kalshi",-102)').netChance>51.9,'Kalshi fee about 1.75 points at 50%');
  db.prepare("UPDATE prediction_picks SET result='won',close_odds=105").run();
  assert.deepEqual(J(run(`predictionRecord(${JSON.stringify(db.prepare('SELECT * FROM prediction_picks').all())})`)),{wins:1,losses:0,pushes:0,profit:115,beat:1,tracked:1,pending:0});
  db.prepare("UPDATE prediction_picks SET result=NULL,close_odds=NULL").run();

  // Where you can bet.
  const where=cf=>J(run(`bettingOptions(${JSON.stringify({cf})})`));
  let w=where({country:'US',regionCode:'CA'});assert.equal(w.mode,'predictions');assert.equal(w.predictions.draftkings,true);assert.ok(w.exchanges.includes('Kalshi'));
  w=where({country:'US',regionCode:'NY'});assert.equal(w.mode,'sportsbooks');assert.equal(w.predictions.fanduel,false);
  w=where({country:'US',regionCode:'NV'});assert.ok(!w.exchanges.includes('Kalshi')&&!w.exchanges.includes('Novig'));
  assert.equal(where({country:'CA',regionCode:'ON'}).mode,'unknown');
  // Prediction parlays: one app, 2-5 legs, never a prediction-pick player, same-game legs unlinked and cut 20%.
  {const leg=(player,game,market,netOdds,team)=>({exchange:'ProphetX',eventId:'NFL--'+game,player,team:'A · @ B',market,side:'Over',line:3.5,odds:netOdds,netOdds,edge:.7,gameTime:'2026-10-18T17:00:00.000Z',playerTeam:team});
   const pool=[leg('A One','g1','Receptions',100,'T1'),leg('B Two','g2','Rushing Yards',110,'T2'),leg('C Three','g3','Receiving Yards',105,'T3'),leg('D Four','g4','Receptions',120,'T4'),leg('E Five','g1','Rushing Yards',100,'T5')];
   const plan=J(run(`predictionParlayPlan(${JSON.stringify(pool)},[],'2026-10-13',${now})`));
   assert.equal(J(run(`predictionParlayPlan(${JSON.stringify(pool.map(l=>({...l,exchange:'Novig'})))},[],'2026-10-13',${now})`)).length,0,'no parlays on Novig (parlay fee)');
   assert.ok(plan.length>0&&plan.every(p=>p.exchange==='ProphetX'&&p.legs.length>=2&&p.legs.length<=5),'parlays of 2-5 legs on one app');
   assert.ok(plan.every(p=>{const g=new Map();p.legs.forEach(l=>g.set(l.eventId,(g.get(l.eventId)||0)+1));return [...g.values()].every(n=>n<=2)}),'at most two legs a game');
   assert.ok(plan.flatMap(p=>p.legs.map(l=>l.player)).every((n,i,all)=>all.indexOf(n)===i),'each player rides in one parlay only');
   const sg=plan.find(p=>p.legs.filter(l=>l.eventId==='NFL--g1').length===2);if(sg)assert.ok(sg.legs.filter(l=>l.eventId==='NFL--g1').every(l=>l.sameGame));
   assert.ok(plan.length<=2,'at most 2 prediction parlays a day');
   const full=[0,1].map(i=>({tier:'short',game_time:'2026-10-18T17:00:00.000Z',legs_json:JSON.stringify([{eventId:'NFL--x'+i,player:'Z'+i,market:'Receptions',side:'Over',gameTime:'2026-10-18T17:00:00.000Z'}])}));
   assert.equal(J(run(`predictionParlayPlan(${JSON.stringify(pool)},${JSON.stringify(full)},'2026-10-13',${now})`)).length,0,'a day with 2 parlays gets no more');
   assert.equal(run("PREDICTION_PAUSED.has('Pass Completions')"),true,'pass completions are paused on prediction picks');
   assert.equal(run("PREDICTION_MIN_BY['Novig|Receptions']"),2.5,'Novig receptions need 2.5 points');
   assert.deepEqual(J(run('TD_PICK')),{min:3.5,books:5,perWeek:2,lead:6000000},'TD picks: 3.5 points, 5 books, 2 a week, last 100 minutes');
   {const nowT=Date.now(),bk=(key,over,under)=>({key,markets:[{key:'player_receptions',last_update:new Date(nowT).toISOString(),outcomes:[{name:'Over',description:'P One',point:4.5,price:over},{name:'Under',description:'P One',point:4.5,price:under}]}]});
    const board=b=>[{eventID:'NFL--z',bookmakers:b}];
    assert.equal(J(run(`[...sportsbookFairs(${JSON.stringify(board([bk('a',-110,-110),bk('b',-112,-108),bk('c',-108,-112)]))},${nowT})]`)).length,1,'books that agree make a fair price');
    assert.equal(J(run(`[...sportsbookFairs(${JSON.stringify(board([bk('a',-110,-110),bk('b',-112,-108),bk('c',-200,160)]))},${nowT})]`)).length,0,'books far apart (news) make none');}
   assert.equal(run("sbTdRule({market:'Anytime Touchdown',books:6,odds:300,avgOdds:200})"),true,'sportsbook TD test logs a Yes well over fair');
   assert.equal(run("sbTdRule({market:'Anytime Touchdown',books:6,odds:210,avgOdds:200})"),false,'and skips one near the market');
   assert.equal(run(`predictionParlayPay({result:'won',odds:300,legs_json:'[]'})`),75,'graded at a quarter unit');}
  // Saved prices feed /api/predictions, filtered to the visitor's state.
  const saved=JSON.parse(db.prepare("SELECT prices_json FROM exchange_prices WHERE event_id='NFL--g1'").get().prices_json);
  assert.deepEqual(saved.map(p=>p[0]).sort(),['kalshi','kalshi','novig','novig'],'exchanges only, both sides');
  db.prepare("INSERT INTO public_recommendations(id,kind,player,market,side,line,odds,game_id,game_time,legs_json,posted_at,status,source) VALUES('official|x|prop|1','prop','Tre Tucker','Receptions','Under',3.5,105,'NFL--g1',?,?,?,'pending','market-verified-v2')").run(kick,JSON.stringify([{player:'Tre Tucker',edge:3.5}]),new Date(now).toISOString());
  assert.equal(J(await run(`recordTdPredictionPicks(env,{eventID:'NFL--g1'},{bookmakers:[]},new Map())`)).length,0,'TD picks stay off until td-picks is on');
  {const t0=Date.now(),gt=new Date(t0+3*3600000).toISOString();db.prepare("INSERT INTO prediction_picks(id,exchange,event_id,player,team,market,side,line,odds,net_odds,fair_pct,edge,game_time,posted_at) VALUES('pm|mv','Novig','NFL--mv','Move Guy','A · @ B','Receptions','Over',4.5,100,100,55,5,?,?)").run(gt,new Date(t0).toISOString());
   const m=J(await run(`priceMoveAlerts(env,new Map([['NFL--mv|moveguy|Receptions|4.5',.4]]),${t0})`));
   assert.equal(m.found,1,'a 15-point drop in our fair chance flags the pick');
   assert.match(db.prepare("SELECT value FROM app_settings WHERE key='move-alerts'").get().value,/Move Guy.*40%, down from 55%/);
   assert.equal(J(await run(`priceMoveAlerts(env,new Map([['NFL--mv|moveguy|Receptions|4.5',.4]]),${t0})`)).found,1,'found again');
   assert.equal(db.prepare("SELECT COUNT(*) AS n FROM app_settings WHERE key='move-alert:pm|mv'").get().n,1,'but alerted once');
   db.prepare("DELETE FROM prediction_picks WHERE id='pm|mv'").run();}
  const pred=async(state,cf)=>J(await (await run(`predictionsResponse(${JSON.stringify({url:'https://x/api/predictions'+(state?'?state='+state:''),cf})},env,${now+60000})`)).json());
  let p=await pred(null,{country:'US',regionCode:'TX'});
  assert.equal(p.mode,'predictions');assert.equal(p.stateName,'Texas');
  assert.equal(p.pmPicks.length,1);assert.equal(p.pmPicks[0].open,true);assert.equal(p.pmRecord.pending,1);assert.ok(!('exchangeKeys' in p));
  assert.deepEqual(p.picks['official|x|prop|1'],[{exchange:'Kalshi',odds:-104,good:true},{exchange:'Novig',odds:-125,good:false}],'every exchange price on the pick, best first, marked good when 1+ point under the fair chance');
  assert.equal(p.fairs['official|x|prop|1'],52.3);
  assert.equal(p.value.length,0,'no value row for a player with an official pick');
  // The pick gets the prediction-market prices saved when it locks (once).
  assert.deepEqual(J(await run(`stampExchangePrices(env,${now+60000})`)),{stamped:1});
  const leg=JSON.parse(db.prepare('SELECT legs_json FROM public_recommendations').get().legs_json)[0];
  assert.deepEqual(leg.exchanges.map(p=>[p.exchange,p.odds]),[['Kalshi',-104],['Novig',-125]]);assert.ok(leg.exchangesAt);
  assert.deepEqual(J(await run(`stampExchangePrices(env,${now+120000})`)),{stamped:0},'never re-stamped');
  db.prepare("UPDATE public_recommendations SET legs_json=json_set(legs_json,'$[0].exchanges[1].odds',-140)").run();
  const pickRow=db.prepare('SELECT * FROM public_recommendations').get();
  assert.equal(run(`exchangeLine(${JSON.stringify(pickRow)})`),'Kalshi 51%','only good-value prices');assert.equal(run(`exchangeLine(${JSON.stringify(pickRow)},null,3,true)`),'Kalshi 51% · Novig 58%','chances, best first');
  assert.ok(run(`emailPickText(${JSON.stringify(pickRow)})`).endsWith('; prediction markets: Kalshi 51%'));
  // Push alerts: a phone set to prediction markets gets chances for its state.
  const ep='https://fcm.googleapis.com/fcm/send/abc';
  const sub=async body=>(await run(`alertsApi(new Request('https://x/api/alerts/subscribe',{method:'POST',body:${JSON.stringify(JSON.stringify(body))}}),env)`)).status;
  const keys={p256dh:'B'.repeat(60),auth:'a'.repeat(16)};
  assert.equal(await sub({endpoint:ep,keys,priceView:'predictions',state:'CT'}),200);
  assert.deepEqual({...db.prepare('SELECT price_view,state FROM push_subscriptions').get()},{price_view:'predictions',state:'CT'});
  db.prepare("UPDATE public_recommendations SET posted_at=?").run(new Date(now).toISOString());
  let alert=J(await run(`latestAlert(env,${now+60000},${JSON.stringify(ep)})`));
  assert.equal(alert.body,'Tre Tucker Under 3.5 receptions: good value on Kalshi 51%','Novig is out in Connecticut');
  db.prepare("UPDATE public_recommendations SET legs_json=json_set(legs_json,'$[0].edge',1.5)").run();
  alert=J(await run(`latestAlert(env,${now+60000},${JSON.stringify(ep)})`));assert.equal(alert.body,'Tre Tucker Under 3.5 receptions: Kalshi 51% is worse than fair, skip on prediction markets (+105 at sportsbooks)');
  await sub({endpoint:ep,keys,priceView:'odds',state:'CT'});
  alert=J(await run(`latestAlert(env,${now+60000},${JSON.stringify(ep)})`));assert.equal(alert.body,'Tre Tucker Under 3.5 receptions (+105)');
  await sub({endpoint:ep,keys,priceView:'predictions',state:'XX'});
  assert.equal(db.prepare('SELECT state FROM push_subscriptions').get().state,null,'unknown states are not saved');
  db.prepare("DELETE FROM public_recommendations").run();
  // Prediction picks: a phone set to prediction markets is pinged for them, and X gets one post each.
  await sub({endpoint:ep,keys,priceView:'predictions',state:'TX'});
  alert=J(await run(`latestAlert(env,${now+60000},${JSON.stringify(ep)})`));
  assert.deepEqual(alert,{title:'📈 New prediction market pick',body:'Tre Tucker Over 3.5 receptions: Novig 47% (fair chance 50%)',url:'/?view=predictions&pick=pm%7CNFL--g1%7Ctretucker'},'the alert opens on that pick');
  // The two alert checkboxes: prediction pings on the sportsbook view, or off on the prediction view.
  await sub({endpoint:ep,keys,priceView:'odds',state:'TX',alertSportsbook:true,alertPredictions:true});
  assert.deepEqual({...db.prepare('SELECT alert_sportsbook,alert_predictions FROM push_subscriptions').get()},{alert_sportsbook:1,alert_predictions:1});
  assert.equal(J(await run(`latestAlert(env,${now+60000},${JSON.stringify(ep)})`)).title,'📈 New prediction market pick','sportsbook view still gets prediction pings when ticked');
  await sub({endpoint:ep,keys,priceView:'predictions',state:'TX',alertSportsbook:true,alertPredictions:false});
  assert.equal(J(await run(`latestAlert(env,${now+60000},${JSON.stringify(ep)})`)).title,'New Bet This Guy picks','unticked: no prediction pick in the alert');
  assert.equal(J(await run(`sendPredictionAlerts(env,${now+60000})`)).sent,0,'unticked phones are not pinged');db.prepare("DELETE FROM app_settings WHERE key='pm-alert-for'").run();
  await sub({endpoint:ep,keys,priceView:'odds',state:'TX',alertSportsbook:false,alertPredictions:false});
  assert.deepEqual({...db.prepare('SELECT alert_sportsbook,alert_predictions FROM push_subscriptions').get()},{alert_sportsbook:1,alert_predictions:0},'never both off');
  await sub({endpoint:ep,keys,priceView:'predictions',state:'TX'});
  assert.deepEqual({...db.prepare('SELECT alert_sportsbook,alert_predictions FROM push_subscriptions').get()},{alert_sportsbook:1,alert_predictions:1},'older pages: prediction pings follow the view');
  const pushes=[],tweets=[];const oldFetch=context.fetch;
  context.fetch=async(url,init={})=>{url=String(url);if(url.startsWith('https://fcm.googleapis.com')){pushes.push(url);return new Response(null,{status:201})}if(url==='https://api.twitter.com/2/tweets'){tweets.push(JSON.parse(init.body).text);return Response.json({data:{id:'t1'}})}return oldFetch(url,init)};
  const sent=J(await run(`sendPredictionAlerts(env,${now+60000})`));assert.equal(sent.sent,1);assert.equal(pushes.length,1);
  assert.equal(J(await run(`sendPredictionAlerts(env,${now+120000})`)).sent,0,'once per new pick');
  context.env.X_API_KEY='k';context.env.X_API_SECRET='s';context.env.X_ACCESS_TOKEN='t';context.env.X_ACCESS_SECRET='a';
  run(`renderCardPng=async svg=>{globalThis.lastCard=svg;return new Uint8Array([1])};xUploadImage=async()=>'m1'`);
  const xp=J(await run(`postPredictionPicksToX(env,${now+60000})`));assert.deepEqual([xp.posted,xp.graphic],[1,true],'posts with the card graphic');
  const card=run('lastCard');assert.ok(card.includes('PREDICTION PICK')&&card.includes('47%')&&card.includes('Tre Tucker'),'prediction card shows the pill, chance and player');
  assert.ok(tweets[0].startsWith('⭐ Top pick · Prediction app\nTre Tucker Over 3.5 receptions\n47% on @novig (fair 50%)')&&tweets[0].length<=280&&!/https?:/.test(tweets[0]),tweets[0]);
  assert.equal(J(await run(`postPredictionPicksToX(env,${now+120000})`)).posted,0,'once per pick');
  db.prepare("INSERT INTO app_settings (key,value) VALUES ('x-tag:Novig','off')").run();assert.equal(await run("xAppTag(env,'Novig')"),'Novig','tag can be switched off');db.prepare("UPDATE app_settings SET value='@NovigApp' WHERE key='x-tag:Novig'").run();assert.equal(await run("xAppTag(env,'Novig')"),'@NovigApp','handle can be overridden');
  context.fetch=oldFetch;for(const k of ['X_API_KEY','X_API_SECRET','X_ACCESS_TOKEN','X_ACCESS_SECRET'])delete context.env[k];
  p=await pred(null,{country:'US',regionCode:'TX'});
  // Tre Tucker is an official prediction pick now, so he leaves Worth a look...
  assert.deepEqual(p.value,[],'an official prediction pick never doubles as Worth a look');
  // ...and with that pick gone, the same price is a value play again.
  const held=db.prepare('SELECT * FROM prediction_picks').all();db.prepare('DELETE FROM prediction_picks').run();
  p=await pred(null,{country:'US',regionCode:'TX'});
  assert.deepEqual(p.value.map(v=>[v.exchange,v.player,v.side,v.odds]),[['Novig','Tre Tucker','Over',115]]);assert.ok(p.value[0].edge>2);
  for(const r of held){const k=Object.keys(r);db.prepare(`INSERT INTO prediction_picks (${k.join(',')}) VALUES (${k.map(()=>'?').join(',')})`).run(...k.map(x=>r[x]))}
  p=await pred('CT',{country:'US',regionCode:'TX'});
  assert.equal(p.state,'CT');assert.equal(p.mode,'sportsbooks');assert.equal(p.value.length,0,'Novig is out in Connecticut');
  assert.equal((await pred(null,{country:'CA',regionCode:'ON'})).mode,'unknown');
  const board=async(state)=>J(await (await run(`predictionBoardResponse(${JSON.stringify({url:'https://x/api/predictions/board?event=NFL--g1&state='+state,cf:{}})},env,${now+60000})`)).json());
  let bp=await board('TX');assert.deepEqual(bp.prices.find(p=>p[2]==='Over'),['Tre Tucker','Receptions','Over',3.5,'Novig',115],'best price per prop');
  bp=await board('CT');assert.deepEqual(bp.prices.find(p=>p[2]==='Over'),['Tre Tucker','Receptions','Over',3.5,'Kalshi',-102],'Novig is out in Connecticut');
  // In-game: the board fetches live prices (at most every 3 minutes), not the pregame snapshot.
  exchange.bookmakers[0]=book('novig',130,-150);const live=Date.parse(kick)+20*60000,liveBoard=async t=>J(await (await run(`predictionBoardResponse(${JSON.stringify({url:'https://x/api/predictions/board?event=NFL--g1&state=TX',cf:{}})},env,${t})`)).json());
  const before=urls.length;bp=await liveBoard(live);
  assert.deepEqual(bp.prices.find(p=>p[2]==='Over'),['Tre Tucker','Receptions','Over',3.5,'Novig',130],'live price after kickoff');
  bp=await liveBoard(live+60000);assert.equal(urls.length-before,1,'one live fetch per 3 minutes');
  assert.equal((await pred(null,{country:'US',regionCode:'TX'})).predictions.draftkings,true);assert.equal((await pred('DE',{})).predictions.draftkings,false);
  // NBA: app prices saved for the board (no picks), every 30 minutes within 6 hours of tip-off, every 3 hours further out.
  {const saveFetch=context.fetch,nbaKick=new Date(now+3*3600000).toISOString(),nbaUrls=[];
   const pts={key:'player_points',last_update:upd,outcomes:[{name:'Over',description:'Cade Cunningham',point:25.5,price:-105},{name:'Under',description:'Cade Cunningham',point:25.5,price:-115}]};
   context.fetch=async url=>{url=String(url);nbaUrls.push(url);if(url.includes('/basketball_nba/events/n1/odds'))return new Response(JSON.stringify({id:'n1',bookmakers:[{key:'novig',title:'Novig',markets:[pts]},{key:'draftkings',title:'DK',markets:[pts]}]}));return new Response(null,{status:404})};
   context.nbaBoards=[{id:'n1',eventID:'NBA--n1',commence_time:nbaKick},{id:'n2',eventID:'NBA--n2',commence_time:new Date(now+60*3600000).toISOString()}];
   assert.deepEqual(J(await run(`recordNbaExchangePrices(env,nbaBoards,${now})`)),{games:1,picks:0,parlays:0},'only games within 36 hours');
   assert.ok(nbaUrls[0].includes('markets=player_points%2Cplayer_rebounds%2Cplayer_assists%2Cplayer_threes%2Cplayer_points_rebounds_assists')&&nbaUrls[0].includes('regions=us_ex'),'the five core NBA markets on the apps');
   await run(`recordNbaExchangePrices(env,nbaBoards,${now+10*60000})`);assert.equal(nbaUrls.length,1,'not again within 30 minutes');
   const nb=J(await (await run(`predictionBoardResponse(${JSON.stringify({url:'https://x/api/predictions/board?event=NBA--n1&state=TX',cf:{}})},env,${now+11*60000})`)).json());
   assert.deepEqual(nb.prices.find(p=>p[2]==='Over'),['Cade Cunningham','Points','Over',25.5,'Novig',-105],'the board serves NBA app prices');
   // Picks: an app price 2.5+ points under the fair price from 4+ sportsbooks, after the fee, inside 24 hours.
   db.prepare("DELETE FROM exchange_prices WHERE event_id LIKE 'NBA--%'").run();
   const sb=(key,o,u)=>({key,title:key,last_update:upd,markets:[{key:'player_points',last_update:upd,outcomes:[{name:'Over',description:'Cade Cunningham',point:25.5,price:o},{name:'Under',description:'Cade Cunningham',point:25.5,price:u}]},{key:'player_rebounds',last_update:upd,outcomes:[{name:'Over',description:'Jalen Duren',point:10.5,price:-110},{name:'Under',description:'Jalen Duren',point:10.5,price:-110}]}]});
   context.nbaBoards=[{id:'n1',eventID:'NBA--n1',commence_time:nbaKick,home_team:'Detroit Pistons',away_team:'Boston Celtics',bookmakers:[sb('draftkings',-110,-110),sb('fanduel',-112,-108),sb('betmgm',-108,-112),sb('caesars',-110,-110)]}];
   const app=(o,u,dr)=>({key:'novig',title:'Novig',markets:[{key:'player_points',outcomes:[{name:'Over',description:'Cade Cunningham',point:25.5,price:o},{name:'Under',description:'Cade Cunningham',point:25.5,price:u}]},{key:'player_rebounds',outcomes:[{name:'Over',description:'Jalen Duren',point:10.5,price:dr},{name:'Under',description:'Jalen Duren',point:10.5,price:-140}]}]});
   context.fetch=async url=>{url=String(url);if(url.includes('/basketball_nba/events/n1/odds'))return new Response(JSON.stringify({id:'n1',bookmakers:[app(120,-150,104)]}));return new Response(null,{status:404})};
   const res=J(await run(`recordNbaExchangePrices(env,nbaBoards,${now})`));assert.equal(res.picks,1,'one pick a game');
   const pick=db.prepare("SELECT * FROM prediction_picks WHERE event_id='NBA--n1'").get();
   assert.deepEqual([pick.exchange,pick.player,pick.market,pick.side,pick.line,pick.odds],['Novig','Cade Cunningham','Points','Over',25.5,120],'the biggest edge past the bar (4.5 points; Duren at +104 is only 1 point)');
   assert.ok(db.prepare("SELECT 1 FROM exchange_shadow WHERE kind='nba4' AND player='Cade Cunningham' AND exchange='Novig'").get(),'NBA app lines over fair are logged for the price test');
   const audit=JSON.parse(db.prepare("SELECT value FROM app_settings WHERE key='nba-pm-audit'").get().value);
   assert.equal(audit.apps.Novig.priced,4);assert.ok(audit.top.some(t=>t[1]==='Cade Cunningham'&&t[7]>4),'the audit lists every app line against fair');
   // NBA picks are their own record: the NFL prediction view never shows them.
   const view=async q=>J(await (await run(`predictionsResponse(${JSON.stringify({url:'https://x/api/predictions?state=TX'+q,cf:{}})},env,${now})`)).json());
   assert.ok((await view('&league=NBA')).pmPicks.some(r=>r.player==='Cade Cunningham'),'the NBA view lists NBA prediction picks');
   // The Results page: NFL and NBA prediction records apart (?sport=NBA), NBA singles only.
   {const nbaRec=J(await run("predictionRecordData(env,'NBA')")),nflRec=J(await run('predictionRecordData(env)'));
    assert.ok(nbaRec.plays.some(p=>p.player==='Cade Cunningham')&&nbaRec.plays.every(p=>p.kind==='single'),'the NBA record has the NBA picks, singles only');
    assert.ok(!nflRec.plays.some(p=>p.player==='Cade Cunningham'),'the NFL record leaves NBA picks out');assert.equal(nbaRec.sport,'NBA')}
   assert.ok(!(await view('')).pmPicks.some(r=>r.player==='Cade Cunningham'),'the NFL view does not');
   db.prepare("UPDATE app_settings SET value='off' WHERE key='nba-pm-picks'").run();db.prepare("INSERT OR IGNORE INTO app_settings (key,value) VALUES ('nba-pm-picks','off')").run();
   db.prepare("DELETE FROM prediction_picks WHERE event_id='NBA--n1'").run();db.prepare("DELETE FROM exchange_prices WHERE event_id LIKE 'NBA--%'").run();
   assert.equal(J(await run(`recordNbaExchangePrices(env,nbaBoards,${now})`)).picks,0,'nba-pm-picks=off stops them');
   db.prepare("DELETE FROM app_settings WHERE key IN ('nba-pm-picks','nba-pm-audit')").run();db.prepare("DELETE FROM exchange_prices WHERE event_id LIKE 'NBA--%'").run();context.fetch=saveFetch}
  // NBA parlays: tracked privately (own table, never in the prediction view), graded from box scores.
  {const tip=new Date(now+3*3600000).toISOString(),leg=(g,player,line,netOdds,edge)=>({exchange:'ProphetX',eventId:`NBA--${g}`,player,team:g,market:'Points',side:'Over',line,odds:netOdds,netOdds,edge,gameTime:tip,fairPct:55});
   const pool=[leg('p1','Cade Cunningham',24.5,120,3),leg('p2','Jalen Brunson',25.5,115,2.5),leg('p3','Jayson Tatum',26.5,110,2),leg('p4','Luka Doncic',30.5,105,2.2)];context.__pool=pool;
   const out=J(await run(`recordNbaPmParlays(env,__pool,${now})`));assert.ok(out.posted>=1&&out.posted<=2,'up to 2 a day: '+JSON.stringify(out));
   const rows=db.prepare('SELECT * FROM nba_pm_parlays').all();assert.ok(rows.every(r=>r.exchange==='ProphetX'&&r.id.startsWith('nbap|')));
   assert.equal(J(await run(`recordNbaPmParlays(env,__pool,${now+60000})`)).posted,0,'no repeats');
   assert.ok(!/nba_pm_parlays/.test(run('predictionsResponse.toString()')),'never in the prediction view');
   const keep=context.recordPlayerStats;context.recordPlayerStats=async r=>({scoreboardFinal:true,min:'34',pts:r.player==='Jalen Brunson'?20:35});run('recordPlayerStats=globalThis.recordPlayerStats');
   const g=J(await run(`gradeNbaPmParlays(env,${Date.parse(tip)+4*3600000})`));assert.equal(g.graded,rows.length);
   const graded=db.prepare('SELECT legs_json,result FROM nba_pm_parlays').all();
   for(const r of graded)assert.equal(r.result,JSON.parse(r.legs_json).some(l=>l.player==='Jalen Brunson')?'lost':'won');
   if(keep){context.recordPlayerStats=keep;run('recordPlayerStats=globalThis.recordPlayerStats')}db.prepare('DELETE FROM nba_pm_parlays').run()}
  // One direction per player per game across sportsbook and prediction picks (Bo Melton, Oct 18).
  const gt=new Date(Date.now()+86400000).toISOString();
  db.prepare("INSERT INTO public_recommendations(id,kind,player,market,side,line,odds,game_time,legs_json,posted_at,status,source) VALUES(?,?,?,?,?,?,?,?,?,?,?,'market-verified-v2')").run('official|x|props|prop|bo','prop','Bo Melton','Receptions','Over',1.5,112,gt,JSON.stringify([{player:'Bo Melton',market:'Receptions',side:'Over',line:1.5,odds:112,gameId:'NFL--g9'}]),new Date().toISOString(),'pending');
  const dirs=await run('pickDirections(env)');context.__d=dirs;
  assert.equal(run("sameDirection(__d,'NFL--g9','Bo Melton','Under')"),false,'an Under on a sportsbook Over player is blocked');
  assert.equal(run("sameDirection(__d,'NFL--g9','Bo Melton','Over')"),true,'the same direction is fine');
  assert.equal(run("sameDirection(__d,'NFL--g1','Bo Melton','Under')"),true,'other games are not affected');
  console.log('PASS: exchange prices are compared with the sportsbook fair price, logged and throttled; the visitor\'s state picks sportsbooks or prediction markets');
})().catch(error=>{console.error(error);process.exit(1)});
