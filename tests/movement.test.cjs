const assert=require('node:assert/strict'),vm=require('node:vm'),{client,read}=require('./helpers/client.cjs');
let checks=0;const equal=(actual,expected,label)=>{assert.deepEqual(JSON.parse(JSON.stringify(actual)),expected,label);checks++};
const now=Date.now(),kickoff=now+86400000;
function engine(saved={}){const storage=new Map(Object.entries(saved)),ctx=vm.createContext({Date,Map,Set,localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)}});vm.runInContext(read('dist/movement.js'),ctx);return{api:ctx.BTGMovement,storage}}
function book(key='draftkings',price=-110,line=49.5,at=now,marketKey='player_rush_yds'){
  return{key,title:key==='draftkings'?'DraftKings':'FanDuel',markets:[{key:marketKey,last_update:new Date(at).toISOString(),outcomes:[{name:'Over',description:'Josh Allen',point:line,price},{name:'Under',description:'Josh Allen',point:line,price:-110}]}]};
}
function event(books,starts=kickoff){return{id:'event123',eventID:'NFL--event123',commence_time:new Date(starts).toISOString(),sport_label:'NFL',away_team:'Buffalo Bills',home_team:'Miami Dolphins',bookmakers:books}}
const prop={id:1,sport:'NFL',player:'Josh Allen',market:'Rushing Yards',side:'Over',line:49.5,eventID:'NFL--event123',team:'Buffalo Bills · @ Miami Dolphins',startsAt:new Date(kickoff).toISOString(),over:-110,under:-110};
let e=engine();e.api.observe([event([book()])],now);equal(e.api.seriesFor(prop,()=>true,now).length,0,'single observation never fabricates opening');
e.api.observe([event([book('draftkings',-110,49.5,now),book('fanduel',150,69.5,now)])],now);equal(e.api.seriesFor(prop,()=>true,now).length,0,'different books/thresholds are not a time series');
e.api.observe([event([book('draftkings',-110,49.5,now+60000),book('fanduel',150,69.5,now+60000),book('draftkings',400,99.5,now+60000,'player_rush_yds_alternate')])],now+60000);equal(e.api.seriesFor(prop,()=>true,now+60000).length,0,'alternate ladder changes never create movement');
e.api.observe([event([book('draftkings',-140,49.5,now+120000)])],now+120000);
let signal=e.api.seriesFor(prop,()=>true,now+120000)[0];equal(signal.type,'same-line-price','real same-book price move');equal(signal.from.price,-110);equal(signal.to.price,-140);equal(signal.book,'DraftKings');equal(signal.probabilityDelta>0,true,'shorter odds identified by probability');
equal(e.api.seriesFor({...prop,market:'Alternate Rushing Yards'},()=>true,now+120000).length,0,'alternates excluded even with history');
equal(e.api.seriesFor({...prop,side:'Under'},()=>true,now+120000).length,0,'side histories isolated');
equal(e.api.seriesFor(prop,book=>book==='FanDuel',now+120000).length,0,'book preferences respected');
e.api.observe([event([book('draftkings',-110,54.5,now+180000)])],now+180000);signal=e.api.seriesFor(prop,()=>true,now+180000)[0];equal(signal.type,'primary-line');equal(signal.from.line,49.5);equal(signal.to.line,54.5);
equal(e.api.seriesFor(prop,()=>true,now+180000+16*60000).length,0,'stale quotes hidden');
e.api.observe([event([])],now+240000);equal(e.api.seriesFor(prop,()=>true,now+240000).length,0,'removed market hidden');
e=engine();e.api.observe([event([book()])],now);
const ambiguous=book('draftkings',200,59.5,now+60000);ambiguous.markets[0].outcomes.push(...book('draftkings',-110,49.5,now+60000).markets[0].outcomes);
e.api.observe([event([ambiguous])],now+60000);equal(e.api.seriesFor(prop,()=>true,now+60000).length,0,'ambiguous standard-key ladders excluded');
e=engine();e.api.observe([event([book('draftkings',-101)])],now);e.api.observe([event([book('draftkings',100,49.5,now+60000)])],now+60000);equal(e.api.seriesFor(prop,()=>true,now+60000).length,0,'-101 to +100 is tiny change, not 201-point swing');
e=engine();e.api.observe([event([book('draftkings',140)])],now);e.api.observe([event([book('draftkings',110,49.5,now+60000)])],now+60000);equal(e.api.seriesFor(prop,()=>true,now+60000)[0].type,'same-line-price','legitimate plus-money main prop retained');
e=engine();e.api.observe([event([book()])],now);e.api.observe([event([book('draftkings',-140,49.5,now+60000)])],now+60000);e.api.observe([event([book('draftkings',-110,49.5,now+120000)])],now+120000);equal(e.api.seriesFor(prop,()=>true,now+120000).length,0,'returned-to-baseline quote not ranked by obsolete largest swing');
e=engine();e.api.observe([event([book()],now+30000)],now);e.api.observe([event([book('draftkings',120,49.5,now+60000)],now+30000)],now+60000);equal(e.api.seriesFor(prop,()=>true,now+60000).length,0,'pregame never joined to in-play');
e.api.observe([event([book('draftkings',160,49.5,now+120000)],now+30000)],now+120000);equal(e.api.seriesFor(prop,()=>true,now+120000)[0].phase,'after-kickoff');
e.api.invalidate(prop.eventID);equal(e.api.seriesFor(prop,()=>true,now+120000).length,0,'failed refresh hides old quotes');
e=engine({'btg-line-history-v1':JSON.stringify({fake:[{at:now-60000,line:99.5,price:900}]})});e.api.observe([event([book()])],now);equal(e.api.seriesFor(prop,()=>true,now).length,0,'legacy contaminated history never imported');
e=engine();e.api.observe([event([book()])],now);e.api.observe([event([book('draftkings',-160,49.5,now)])],now+60000);equal(e.api.seriesFor(prop,()=>true,now+60000).length,0,'same timestamp contradictory quotes not a move');
e=engine();e.api.observe([event([book('draftkings',-110,1.5,now,'player_pass_tds')])],now);e.api.observe([event([book('draftkings',150,2.5,now+60000,'player_pass_tds')])],now+60000);equal(e.api.seriesFor({...prop,market:'Passing Touchdowns',line:2.5},()=>true,now+60000).length,0,'TD threshold switch never highlighted');
const c=client();assert.ifError(c.error);c.ctx.fixture=event([book('draftkings',-110,49.5,now-60000)]);c.eval('normalizeLiveProps({data:[fixture]})');c.ctx.fixture=event([book('draftkings',-140,49.5,now)]);c.eval('props=normalizeLiveProps({data:[fixture]}).map((p,i)=>({...p,id:i+1}));props.forEach(p=>p.side="Over");state.view="movement"');
equal(c.eval('movementValueSignal(props[0]).book'),'DraftKings','raw observation hook survives normalizer');
const card=c.eval('movementCard(props[0])'),chart=c.eval('movementChart(props[0])');equal(card.includes('First observed'),true);equal(card.includes('Opened at'),false);equal(card.includes('Potential price value'),false);equal(card.includes('DraftKings'),true);equal(chart.includes('Price-implied probability'),true);equal(chart.includes('not the sportsbook’s opening price'),true);equal(chart.includes('<svg'),true);
equal(c.eval('movementChart({...props[0],market:"Alternate Rushing Yards"}).includes("<svg")'),false,'unknown history never gets synthetic graph');
const html=read('dist/index.html');equal(html.indexOf('/movement.js')<html.indexOf('/app.js'),true,'engine loads before app');
console.log(`PASS: ${checks} prop-movement regression assertions (provider fixtures; no production traffic)`);
