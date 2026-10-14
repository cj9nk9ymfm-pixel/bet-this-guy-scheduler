const assert=require('node:assert/strict'),vm=require('node:vm'),{webcrypto}=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const {read}=require('./helpers/client.cjs');
// Prediction markets (shadow): exchange prices vs our sportsbook fair price,
// and what a visitor's state can bet on.
const context=vm.createContext({URL,URLSearchParams,Request,Response,Headers,AbortSignal,Date,console,setTimeout,clearTimeout,crypto:webcrypto,TextEncoder,btoa,atob});
const template=read('worker/index.template.js');
vm.runInContext(template.slice(template.indexOf('const API_BASE')).replace('__MOVEMENT_SERVER__',read('worker/movement.js')).replace('__LIVE_SERVER__',read('worker/live.js')).replace('__STATS_SHARED__',read('dist/stats.js')).replace('__RECORDS_SERVER__',read('worker/records.js')).replace('__ACCOUNTS_SERVER__',read('worker/accounts.js')).replace('export default {','this.worker={'),context);
const fs=require('node:fs'),db=new DatabaseSync(':memory:');
for(const f of fs.readdirSync('drizzle').filter(f=>/^000[0-2]_|^0006_|^0008_|^0013_|0025_|0026_|0027_|0031_|0032_|0033_|0028_|0030_|0018_/.test(f)).sort())db.exec(read('drizzle/'+f).replaceAll('--> statement-breakpoint',''));
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
  assert.deepEqual(cov.coverage.novig,{lines:2,matched:2,matched2:0});assert.ok(!cov.coverage.bovada,'only prediction markets count');
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
   assert.equal(cand(5).length,1,'a 1-2 point edge locks close to the game');
   assert.equal(cand(30).length,0,'nothing locks more than 24 hours out');
   assert.equal(cand(30,'{min:0,max:5}').length,0,'no parlay legs from games more than 24 hours out');
   assert.equal(cand(5,'{min:0,max:5}').length,1);
   // Two-book fair prices: only lines no third book prices, for the two-book test.
   const two={...context.boards[0],bookmakers:context.boards[0].bookmakers.slice(0,2)};
   assert.equal(run(`sportsbookFairs([${JSON.stringify(two)}],${now})`).size,0,'two books are not enough for the official fair price');
   assert.equal(run(`sportsbookFairs([${JSON.stringify(two)}],${now},2)`).size,1,'the two-book test uses them');}
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
  {const leg=(player,game,market,netOdds,team)=>({exchange:'Novig',eventId:'NFL--'+game,player,team:'A · @ B',market,side:'Over',line:3.5,odds:netOdds,netOdds,edge:.7,gameTime:'2026-10-18T17:00:00.000Z',playerTeam:team});
   const pool=[leg('A One','g1','Receptions',100,'T1'),leg('B Two','g2','Rushing Yards',110,'T2'),leg('C Three','g3','Receiving Yards',105,'T3'),leg('D Four','g4','Receptions',120,'T4'),leg('E Five','g1','Rushing Yards',100,'T5')];
   const plan=J(run(`predictionParlayPlan(${JSON.stringify(pool)},[],'2026-10-13',${now})`));
   assert.ok(plan.length>0&&plan.every(p=>p.exchange==='Novig'&&p.legs.length>=2&&p.legs.length<=5),'parlays of 2-5 legs on one app');
   assert.ok(plan.every(p=>{const g=new Map();p.legs.forEach(l=>g.set(l.eventId,(g.get(l.eventId)||0)+1));return [...g.values()].every(n=>n<=2)}),'at most two legs a game');
   assert.ok(plan.flatMap(p=>p.legs.map(l=>l.player)).every((n,i,all)=>all.indexOf(n)===i),'each player rides in one parlay only');
   const sg=plan.find(p=>p.legs.filter(l=>l.eventId==='NFL--g1').length===2);if(sg)assert.ok(sg.legs.filter(l=>l.eventId==='NFL--g1').every(l=>l.sameGame));
   assert.equal(run(`predictionParlayPay({result:'won',odds:300,legs_json:'[]'})`),75,'graded at a quarter unit');}
  // Saved prices feed /api/predictions, filtered to the visitor's state.
  const saved=JSON.parse(db.prepare("SELECT prices_json FROM exchange_prices WHERE event_id='NFL--g1'").get().prices_json);
  assert.deepEqual(saved.map(p=>p[0]).sort(),['kalshi','kalshi','novig','novig'],'exchanges only, both sides');
  db.prepare("INSERT INTO public_recommendations(id,kind,player,market,side,line,odds,game_id,game_time,legs_json,posted_at,status,source) VALUES('official|x|prop|1','prop','Tre Tucker','Receptions','Under',3.5,105,'NFL--g1',?,?,?,'pending','market-verified-v2')").run(kick,JSON.stringify([{player:'Tre Tucker',edge:3.5}]),new Date(now).toISOString());
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
  assert.ok(run(`xPickText(${JSON.stringify(pickRow)})`).includes('\n📈 Also on Kalshi at 51%'));
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
  assert.ok(!run(`xPickText(${JSON.stringify(db.prepare('SELECT * FROM public_recommendations').get())})`).includes('Also on'),'X only names good-value prices');
  await sub({endpoint:ep,keys,priceView:'odds',state:'CT'});
  alert=J(await run(`latestAlert(env,${now+60000},${JSON.stringify(ep)})`));assert.equal(alert.body,'Tre Tucker Under 3.5 receptions (+105)');
  await sub({endpoint:ep,keys,priceView:'predictions',state:'XX'});
  assert.equal(db.prepare('SELECT state FROM push_subscriptions').get().state,null,'unknown states are not saved');
  db.prepare("DELETE FROM public_recommendations").run();
  // Prediction picks: a phone set to prediction markets is pinged for them, and X gets one post each.
  await sub({endpoint:ep,keys,priceView:'predictions',state:'TX'});
  alert=J(await run(`latestAlert(env,${now+60000},${JSON.stringify(ep)})`));
  assert.deepEqual(alert,{title:'📈 New prediction market pick',body:'Tre Tucker Over 3.5 receptions: Novig 47% (fair chance 50%)',url:'/'});
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
  assert.ok(tweets[0].startsWith('📈 Prediction market pick: Tre Tucker Over 3.5 receptions\n@novig at 47% · fair chance 50%, after fees')&&tweets[0].length<=280&&!/https?:/.test(tweets[0]),tweets[0]);
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
  console.log('PASS: exchange prices are compared with the sportsbook fair price, logged and throttled; the visitor\'s state picks sportsbooks or prediction markets');
})().catch(error=>{console.error(error);process.exit(1)});
