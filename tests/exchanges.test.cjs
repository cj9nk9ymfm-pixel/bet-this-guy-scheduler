const assert=require('node:assert/strict'),vm=require('node:vm'),{webcrypto}=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const {read}=require('./helpers/client.cjs');
// Prediction markets (shadow): exchange prices vs our sportsbook fair price,
// and what a visitor's state can bet on.
const context=vm.createContext({URL,URLSearchParams,Request,Response,Headers,AbortSignal,Date,console,setTimeout,clearTimeout,crypto:webcrypto,TextEncoder,btoa,atob});
const template=read('worker/index.template.js');
vm.runInContext(template.slice(template.indexOf('const API_BASE')).replace('__MOVEMENT_SERVER__',read('worker/movement.js')).replace('__LIVE_SERVER__',read('worker/live.js')).replace('__STATS_SHARED__',read('dist/stats.js')).replace('__RECORDS_SERVER__',read('worker/records.js')).replace('__ACCOUNTS_SERVER__',read('worker/accounts.js')).replace('export default {','this.worker={'),context);
const fs=require('node:fs'),db=new DatabaseSync(':memory:');
for(const f of fs.readdirSync('drizzle').filter(f=>/^000[0-2]_|^0006_|^0008_|^0013_|0025_|0026_|0027_|0028_/.test(f)).sort())db.exec(read('drizzle/'+f).replaceAll('--> statement-breakpoint',''));
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
  assert.deepEqual(out,{games:1,logged:1});
  const row=db.prepare('SELECT * FROM exchange_shadow').get();
  assert.deepEqual([row.kind,row.exchange,row.player,row.side,row.line,row.odds],['prop','Novig','Tre Tucker','Over',3.5,115]);
  assert.ok(row.fair_pct>49&&row.fair_pct<51&&row.edge>2,'fair from the sportsbooks, edge at the exchange price');
  const cov=JSON.parse(db.prepare("SELECT value FROM app_settings WHERE key='exchange-coverage'").get().value);
  assert.deepEqual(cov.coverage.novig,{lines:2,matched:2});assert.ok(!cov.coverage.bovada,'only prediction markets count');
  out=J(await run(`recordExchangeProps(env,boards,${now+600000})`));assert.deepEqual(out,{skipped:true},'every 30 minutes');
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
  const pushes=[],tweets=[];const oldFetch=context.fetch;
  context.fetch=async(url,init={})=>{url=String(url);if(url.startsWith('https://fcm.googleapis.com')){pushes.push(url);return new Response(null,{status:201})}if(url==='https://api.twitter.com/2/tweets'){tweets.push(JSON.parse(init.body).text);return Response.json({data:{id:'t1'}})}return oldFetch(url,init)};
  const sent=J(await run(`sendPredictionAlerts(env,${now+60000})`));assert.equal(sent.sent,1);assert.equal(pushes.length,1);
  assert.equal(J(await run(`sendPredictionAlerts(env,${now+120000})`)).sent,0,'once per new pick');
  context.env.X_API_KEY='k';context.env.X_API_SECRET='s';context.env.X_ACCESS_TOKEN='t';context.env.X_ACCESS_SECRET='a';
  assert.equal(J(await run(`postPredictionPicksToX(env,${now+60000})`)).posted,1);
  assert.ok(tweets[0].startsWith('📈 Prediction market pick: Tre Tucker Over 3.5 receptions\nNovig at 47% · fair chance 50%, after fees')&&tweets[0].length<=280&&!/https?:/.test(tweets[0]),tweets[0]);
  assert.equal(J(await run(`postPredictionPicksToX(env,${now+120000})`)).posted,0,'once per pick');
  context.fetch=oldFetch;for(const k of ['X_API_KEY','X_API_SECRET','X_ACCESS_TOKEN','X_ACCESS_SECRET'])delete context.env[k];
  p=await pred(null,{country:'US',regionCode:'TX'});
  assert.deepEqual(p.value.map(v=>[v.exchange,v.player,v.side,v.odds]),[['Novig','Tre Tucker','Over',115]]);assert.ok(p.value[0].edge>2);
  p=await pred('CT',{country:'US',regionCode:'TX'});
  assert.equal(p.state,'CT');assert.equal(p.mode,'sportsbooks');assert.equal(p.value.length,0,'Novig is out in Connecticut');
  assert.equal((await pred(null,{country:'CA',regionCode:'ON'})).mode,'unknown');
  const board=async(state)=>J(await (await run(`predictionBoardResponse(${JSON.stringify({url:'https://x/api/predictions/board?event=NFL--g1&state='+state,cf:{}})},env,${now+60000})`)).json());
  let bp=await board('TX');assert.deepEqual(bp.prices.find(p=>p[2]==='Over'),['Tre Tucker','Receptions','Over',3.5,'Novig',115],'best price per prop');
  bp=await board('CT');assert.deepEqual(bp.prices.find(p=>p[2]==='Over'),['Tre Tucker','Receptions','Over',3.5,'Kalshi',-102],'Novig is out in Connecticut');
  assert.equal((await pred(null,{country:'US',regionCode:'TX'})).predictions.draftkings,true);assert.equal((await pred('DE',{})).predictions.draftkings,false);
  console.log('PASS: exchange prices are compared with the sportsbook fair price, logged and throttled; the visitor\'s state picks sportsbooks or prediction markets');
})().catch(error=>{console.error(error);process.exit(1)});
