const assert=require('node:assert/strict'),vm=require('node:vm'),{webcrypto}=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const {read,client}=require('./helpers/client.cjs');
const now=Date.parse('2026-09-27T10:00:00Z');class Clock extends Date{static now(){return now}}
const db=new DatabaseSync(':memory:');for(const f of ['0000_public_record.sql','0001_record_settlement.sql','0002_historical_replays.sql'])db.exec(read('drizzle/'+f));
const DB={prepare(sql){return{bind(...args){return{all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>db.prepare(sql).run(...args),sql,args}},all:async()=>({results:db.prepare(sql).all()})}},batch:async statements=>{db.exec('BEGIN');try{const out=statements.map(s=>db.prepare(s.sql).run(...s.args));db.exec('COMMIT');return out}catch(e){db.exec('ROLLBACK');throw e}}};
const context=vm.createContext({URL,URLSearchParams,Request,Response,Headers,AbortSignal,Date:Clock,console,setTimeout,clearTimeout,crypto:webcrypto,TextEncoder,fetch:async()=>Response.json({data:[]}),env:{DB,THE_ODDS_API_KEY:'fixture'}});
const template=read('worker/index.template.js');vm.runInContext(template.slice(template.indexOf('const API_BASE')).replace('__MOVEMENT_SERVER__',read('worker/movement.js')).replace('__LIVE_SERVER__',read('worker/live.js')).replace('__STATS_SHARED__',read('dist/stats.js')).replace('__RECORDS_SERVER__',read('worker/records.js')).replace('__ACCOUNTS_SERVER__',read('worker/accounts.js')).replace('export default {','this.worker={'),context);const run=s=>vm.runInContext(s,context);
const events=Array.from({length:16},(_,g)=>({id:'game'+g,eventID:'NFL--game'+g,commence_time:'2026-09-27T17:00:00Z',away_team:'Away '+g,home_team:'Home '+g,bookmakers:Array.from({length:3},(_,b)=>({key:['draftkings','fanduel','betmgm'][b],title:['DraftKings','FanDuel','BetMGM'][b],last_update:new Date(now).toISOString(),markets:[{key:'player_reception_yds',outcomes:Array.from({length:10},(_,p)=>[{name:'Over',description:`Player ${g} ${p}`,point:50.5,price:b===0?110:-110},{name:'Under',description:`Player ${g} ${p}`,point:50.5,price:-110}]).flat()}]}))}));for(const e of events)for(const b of e.bookmakers){const outcomes=b.markets[0].outcomes;b.markets=['player_reception_yds','player_rush_yds','player_pass_yds'].map((key,i)=>({key,outcomes:outcomes.filter(o=>Number(o.description.split(' ').at(-1))%3===i)}))}context.events=events;
(async()=>{
 assert.equal(run("officialWeek(Date.parse('2026-09-29T03:00:00Z'))"),'2026-09-22','Monday late game remains previous week');
 assert.equal(run("officialWeek(Date.parse('2026-09-29T12:00:00Z'))"),'2026-09-29');
 assert.equal(run('officialCandidates(events).length'),160);
 context.stale=JSON.parse(JSON.stringify(events));context.stale.forEach(e=>e.bookmakers.forEach(b=>b.last_update='2026-09-26T00:00:00Z'));
 assert.equal(run('officialCandidates(stale).length'),0);
 context.weak=JSON.parse(JSON.stringify(events));context.weak.forEach(e=>e.bookmakers.forEach(b=>b.markets.forEach(m=>m.outcomes.forEach(o=>o.price=-110))));
 assert.equal(run('officialCandidates(weak).length'),0,'no forced quota without edge');
 // Each run's stats feed the pick_runs log: props checked, best edge, near misses, qualified.
 run('var st={};officialCandidates(events,undefined,st);var ws={};officialCandidates(weak,undefined,ws)');
 assert.deepEqual(JSON.parse(run('JSON.stringify([st.props,st.qualified,st.near||0,st.best>1])')),[160,160,0,true]);
 assert.deepEqual(JSON.parse(run('JSON.stringify([ws.props,ws.qualified||0,ws.best<1])')),[160,0,true],'a run with no edge still records what it checked');
 // Big-5 only: when the best price sits at BetRivers (licensed, prices the
 // market) it can't become a pick; the same price at DraftKings can.
 context.rivers=JSON.parse(JSON.stringify(events));context.rivers.forEach(e=>{e.bookmakers[0].key='betrivers';e.bookmakers[0].title='BetRivers';e.bookmakers.push({...JSON.parse(JSON.stringify(e.bookmakers[1])),key:'fanatics',title:'Fanatics'})});
 assert.equal(run('officialCandidates(rivers).length'),0,'BetRivers price never becomes a pick');
 assert.ok(run('officialCandidates(events).every(c=>c.book==="DraftKings")'),'picks lock at a big-5 book');
 // Games days away are eligible too: a qualifying price locks whenever it appears.
 context.later=events.map(e=>({...e,commence_time:'2026-09-30T00:15:00Z'}));
 assert.equal(run('officialCandidates(later).length'),160,'a game three days out can lock a pick');
 context.thin=events.map(e=>({...e,bookmakers:e.bookmakers.slice(0,2)}));assert.equal(run('officialCandidates(thin).length'),0);
 run("var candidates=officialCandidates(events),early=officialPlan(candidates,[],'2026-09-22')");
 assert.equal(run('early.filter(p=>p.tier!=="props").length'),0,'no parlays until the first leg is two hours from kickoff');
 run("var plan=officialPlan(candidates,[],'2026-09-22',Date.parse('2026-09-27T15:30:00Z'))");
 assert.equal(run('plan.filter(p=>p.tier==="props").length'),32,'two props a game across 16 games');
 for(const [tier,cap] of [['reasonable',15],['swing',10],['moonshot',5]])assert.equal(run(`plan.filter(p=>p.tier==='${tier}').length`),cap);
 // Last Saturday: four picks in four games. Pairs posted as each pick arrived
 // used every combination, so no 3- or 4-leg parlay could ever form.
 context.saturday=[['Borregales','a',110],['Shough','b',120],['Jones','c',200],['JWilliams','d',104],['Slye','e',115],['Lawrence','f',105]].map(([player,game,odds],i)=>({player,gameId:'NFL--'+game,gameTime:'2026-09-27T17:00:00Z',market:['Field Goals Made','Interceptions Thrown','Passing Touchdowns','Longest Reception','Field Goals Made','Passing Touchdowns'][i],side:'Over',line:1.5,odds,edge:2-i/10,playerKey:'NFL--'+game+'|'+player.toLowerCase()}));
 run("var sat=officialPlan(saturday,[],'2026-09-22',Date.parse('2026-09-27T15:30:00Z')),satTiers=sat.map(p=>p.tier)");
 assert.ok(run('satTiers.includes("swing")&&satTiers.includes("moonshot")'),'a full slate now reaches both bigger tiers');
 assert.ok(run('satTiers.includes("reasonable")'),'2-leg parlays still post alongside them');
 assert.ok(run('sat.filter(p=>p.tier!=="props").every((a,i,all)=>all.every((b,j)=>i===j||a.legs.filter(x=>b.legs.some(y=>y.playerKey===x.playerKey)).length<=1))'),'no two parlays share more than one leg');
 assert.equal(await run("writeOfficialPlan(plan,'2026-09-22',env)"),62,'the writer reports how many picks it posted (this is what triggers pick alerts)');
 assert.equal(db.prepare('SELECT COUNT(*) n FROM public_recommendations').get().n,62);
 const before=db.prepare('SELECT id,odds,combined_odds,posted_at,legs_json FROM public_recommendations ORDER BY id').all();
 assert.equal(await run("writeOfficialPlan(plan,'2026-09-22',env)"),0,'a repeat run posts nothing, so no alert');assert.deepEqual(db.prepare('SELECT id,odds,combined_odds,posted_at,legs_json FROM public_recommendations ORDER BY id').all(),before,'repeat/concurrent-plan publication cannot replace or multiply picks');
 assert.ok(db.prepare("SELECT COUNT(*) n FROM public_recommendations WHERE kind='prop' GROUP BY game_id").all().every(r=>r.n<=2),'at most two official props a game');
 const parlays=db.prepare("SELECT legs_json FROM public_recommendations WHERE kind='parlay'").all().map(r=>JSON.parse(r.legs_json));
 const exposure=new Map();for(const legs of parlays){assert.equal(new Set(legs.map(p=>p.gameId)).size,legs.length);for(const leg of legs)exposure.set(leg.playerKey,(exposure.get(leg.playerKey)||0)+1)}assert.ok([...exposure.values()].every(n=>n<=3));
 for(let i=0;i<parlays.length;i++)for(let j=i+1;j<parlays.length;j++)assert.ok(parlays[i].filter(a=>parlays[j].some(b=>a.playerKey===b.playerKey)).length<=1);
 // Price trail: publish runs record each pending pick's price without touching other fields.
 {const pick=db.prepare("SELECT id,legs_json FROM public_recommendations WHERE kind='prop' ORDER BY id LIMIT 1").get(),leg=JSON.parse(pick.legs_json)[0];
  db.prepare("UPDATE public_recommendations SET legs_json=json_set(legs_json,'$[0].closingNote','keep me') WHERE id=?").run(pick.id);
  context.trailRows=db.prepare('SELECT * FROM public_recommendations WHERE id=?').all(pick.id);
  await run('env.DB.batch(officialTrailStatements(events,trailRows,env,Date.now()))');
  let saved=JSON.parse(db.prepare('SELECT legs_json FROM public_recommendations WHERE id=?').get(pick.id).legs_json)[0];
  assert.equal(saved.priceTrail.length,1,'a publish run records the current price');
  assert.equal(saved.priceTrail[0].l,leg.line);assert.equal(saved.priceTrail[0].o,leg.odds,'best price at our line');
  assert.equal(saved.closingNote,'keep me','the trail write never overwrites other fields');
  context.trailRows=db.prepare('SELECT * FROM public_recommendations WHERE id=?').all(pick.id);
  assert.equal(run('officialTrailStatements(events,trailRows,env,Date.now()).length'),0,'an unchanged price is not recorded twice');
  assert.equal(run("officialTrailStatements(events,trailRows,env,Date.parse('2026-09-27T16:40:00Z')).length"),0,'no trail writes inside 25 minutes of kickoff');}
 run('eventProps=async request=>Response.json({data:events.filter(e=>e.eventID===new URL(request.url).searchParams.get("eventID"))})');
 await assert.rejects(run('verifiedRecordStatements([{kind:"prop",...candidates[0]}],new Request("https://test.invalid/api/record"),env,{waitUntil(){}})'),/server only/,'clients cannot nominate official picks');
 context.existing=db.prepare('SELECT * FROM public_recommendations').all();assert.equal(run("officialPlan(candidates,existing,'2026-09-22').length"),0);
 run('futureSchedule=async()=>Response.json({data:events.map(e=>({eventID:e.eventID,status:{startsAt:e.commence_time}}))});var jobs=[];queueOfficialPicks(new Request("https://test.invalid/api/props"),env,{waitUntil:p=>jobs.push(p)})');await Promise.all(run('jobs'));
 assert.equal(db.prepare('SELECT COUNT(*) n FROM public_recommendations').get().n,62,'production trigger uses schedule and persisted state');
 // Games starting within 4 hours get fresher prices, and a quick run that checks only them.
 run('var asked=[];eventProps=async(request,env,ctx,opts)=>{asked.push([new URL(request.url).searchParams.get("eventID"),(opts&&opts.maxAge)||0]);return Response.json({data:[]})}');
 run('futureSchedule=async()=>Response.json({data:events.map((e,i)=>({eventID:e.eventID,status:{startsAt:i<3?"2026-09-27T12:00:00Z":e.commence_time}}))})');
 let quick=JSON.parse(JSON.stringify(await run('publishOfficialPicks(new Request("https://test.invalid/api/props"),env,{waitUntil(){}},{soonOnly:true})')));
 assert.equal(quick.state,'completed');
 assert.equal(JSON.stringify(run('asked')),JSON.stringify([['NFL--game0',240000],['NFL--game1',240000],['NFL--game2',240000]]),'the quick run checks only soon games, with a 4-minute cache');
 run('asked.length=0');await run('publishOfficialPicks(new Request("https://test.invalid/api/props"),env,{waitUntil(){}})');
 assert.equal(run('asked.length'),16);assert.equal(run('asked.filter(a=>a[1]===240000).length'),3,'full runs also ask fresher prices for soon games only');
 run('futureSchedule=async()=>Response.json({data:events.map(e=>({eventID:e.eventID,status:{startsAt:e.commence_time}}))})');
 assert.equal(JSON.parse(JSON.stringify(await run('publishOfficialPicks(new Request("https://test.invalid/api/props"),env,{waitUntil(){}},{soonOnly:true})'))).state,'no_soon_games');
 const c=client();vm.runInContext(read('dist/trust.html').match(/<script>([\s\S]*?)<\/script>/)[1],c.ctx);c.ctx.rows=[...context.existing,{id:'legacy',source:'market-verified-v2',kind:'prop',status:'final',result:'lost'}];c.nodes.get('#recordScope').value='2026-09-22';c.eval('paint(rows)');assert.equal(c.eval('resultRows.length'),62);c.nodes.get('#recordScope').value='legacy';c.eval('paint(rows)');assert.equal(c.eval('resultRows.length'),1);
 console.log('PASS: official weekly caps, quality gates, overlap limits, immutable odds, repeat publication, client rejection, weekly rollover and history filters (real SQLite; no production writes)');
})().catch(e=>{console.error(e);process.exitCode=1});
