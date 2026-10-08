const assert=require('node:assert/strict'),vm=require('node:vm'),{webcrypto}=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const {read}=require('./helpers/client.cjs');
// Stats check (shadow): projects each official pick and near miss from the
// player's recent games and the opponent's defense, and records whether the
// stats agree with our side. Never changes a pick.
const context=vm.createContext({URL,URLSearchParams,Request,Response,Headers,AbortSignal,Date,console,setTimeout,clearTimeout,crypto:webcrypto,TextEncoder,btoa,atob,fetch:async()=>new Response(null,{status:404})});
const template=read('worker/index.template.js');
vm.runInContext(template.slice(template.indexOf('const API_BASE')).replace('__MOVEMENT_SERVER__',read('worker/movement.js')).replace('__LIVE_SERVER__',read('worker/live.js')).replace('__STATS_SHARED__',read('dist/stats.js')).replace('__RECORDS_SERVER__',read('worker/records.js')).replace('__ACCOUNTS_SERVER__',read('worker/accounts.js')).replace('export default {','this.worker={'),context);
const db=new DatabaseSync(':memory:');
for(const f of ['0000_public_record.sql','0001_record_settlement.sql','0002_historical_replays.sql','0015_near_shadow.sql','0016_stats_check.sql'])db.exec(read('drizzle/'+f).replaceAll('--> statement-breakpoint',''));
const wrap=(sql,args=[])=>({bind(...values){return wrap(sql,values)},async first(){return db.prepare(sql).get(...args)||null},async all(){return{results:db.prepare(sql).all(...args)}},async run(){const r=db.prepare(sql).run(...args);return{success:true,meta:{changes:Number(r.changes)}}}});
context.env={DB:{prepare:sql=>wrap(sql),async batch(list){for(const s of list)await s.run()}},BALLDONTLIE_API_KEY:'test'};
const run=code=>vm.runInContext(code,context);
const J=v=>JSON.parse(JSON.stringify(v));
(async()=>{
  const now=Date.parse('2026-10-08T18:00:00Z');
  // 12 teams, 30 finished games. WRs facing the Titans catch 30 a game; elsewhere 20.
  const teams=['Houston Texans','Tennessee Titans','Miami Dolphins','Buffalo Bills','New York Jets','New England Patriots','Kansas City Chiefs','Denver Broncos','Dallas Cowboys','Detroit Lions','Chicago Bears','Green Bay Packers'];
  const games=[];for(let i=0;i<30;i++){const h=teams[i%12],a=teams[(i*5+1)%12===i%12?(i+1)%12:(i*5+1)%12];games.push({id:1000+i,date:new Date(Date.parse('2026-09-10T17:00:00Z')+Math.floor(i/6)*7*86400000).toISOString(),status:'Final',postseason:false,home_team:{full_name:h},visitor_team:{full_name:a}})}
  games.push({id:2000,date:'2026-10-11T17:00:00Z',status:'Scheduled',home_team:{full_name:'Tennessee Titans'},visitor_team:{full_name:'Houston Texans'}});
  const calls=[];
  context.bdlRequest=async path=>{calls.push(path);if(path.startsWith('/nfl/v1/games?'))return {data:games,meta:{}};
    const id=Number(new URLSearchParams(path.split('?')[1]).get('game_ids[]')),g=games.find(x=>x.id===id),rows=[];
    for(const [team,opp] of [[g.home_team.full_name,g.visitor_team.full_name],[g.visitor_team.full_name,g.home_team.full_name]]){
      const wr=opp==='Tennessee Titans'?15:10;
      rows.push({team:{full_name:team},player:{position_abbreviation:'WR'},receptions:wr,receiving_yards:wr*12},{team:{full_name:team},player:{position_abbreviation:'WR'},receptions:wr,receiving_yards:wr*12},{team:{full_name:team},player:{position_abbreviation:'QB'},passing_yards:240});
    }
    return {data:rows,meta:{}}};
  run('bdlRequest=globalThis.bdlRequest');
  // Defense data comes in a few games per run, once each.
  let out=J(await run(`ingestDefenseGames(env,${now})`));assert.equal(out.ingested,4);
  for(let i=0;i<8;i++)await run(`ingestDefenseGames(env,${now})`);
  assert.equal(db.prepare("SELECT COUNT(DISTINCT game_id) n FROM defense_games").get().n,30,'every finished game, never the scheduled one');
  const before=calls.length;await run(`ingestDefenseGames(env,${now})`);assert.equal(calls.length,before+1,'nothing re-fetched once done');
  const def=J(await run(`defenseFactor(env,'Tennessee Titans','WR','Receptions',${now})`));
  assert.ok(def.factor>1.3&&def.games>=3,JSON.stringify(def));
  assert.equal(await run(`defenseFactor(env,'Tennessee Titans','WR','Longest Reception',${now})`),null,'non-additive markets get no defense factor');
  // The projection and verdict.
  const logs=v=>v.map((value,i)=>({value,season:2026,date:now-(i+1)*7*86400000}));
  let v=J(run(`statsVerdict({side:'Under',line:4.5},${JSON.stringify(logs([2,3,1,4,3,2,5,3,2,3]))},null,2026)`));
  assert.equal(v.verdict,'agree');assert.equal(v.l10_hits,9);assert.ok(v.projection<3.5);
  v=J(run(`statsVerdict({side:'Over',line:4.5},${JSON.stringify(logs([2,3,1,4,3,2,5,3,2,3]))},null,2026)`));assert.equal(v.verdict,'disagree');
  v=J(run(`statsVerdict({side:'Over',line:60.5},${JSON.stringify(logs([62,58,61,60,59,63]))},null,2026)`));assert.equal(v.verdict,'neutral');
  v=J(run(`statsVerdict({side:'Over',line:60.5},${JSON.stringify(logs([62,58,61,60,59,63]))},{factor:1.4},2026)`));assert.equal(v.verdict,'agree','a soft defense pushes the projection up (capped at +15%)');
  assert.equal(J(run(`statsVerdict({side:'Over',line:4.5},${JSON.stringify(logs([5,6,7]))},null,2026)`)).verdict,'unknown','too few games');
  v=J(run(`statsVerdict({side:'Over',line:0.5},${JSON.stringify(logs([1,0,1,1,0,1,1,1,0,1]))},null,2026)`));assert.equal(v.verdict,'agree','low lines use how often it happened');
  // End to end: an official pick and a near miss, checked before kickoff, once.
  const kick='2026-10-11T17:00:00Z',team='Houston Texans · @ Tennessee Titans';
  db.prepare("INSERT INTO public_recommendations(id,kind,player,market,side,line,odds,game_time,legs_json,posted_at,status,source) VALUES('official|2026-10-06|props|prop|t','prop','Carnell Tate','Receptions','Under',4.5,128,?,?,?,'pending','market-verified-v2')").run(kick,JSON.stringify([{player:'Carnell Tate',team}]),new Date(now-86400000).toISOString());
  db.prepare("INSERT INTO near_shadow(id,event_id,player,team,market,side,line,odds,book,edge,game_time,logged_at) VALUES('NFL--e|nico','NFL--e','Nico Collins',?,'Receiving Yards','Over',70.5,-110,'FanDuel',.7,?,?)").run(team,kick,new Date(now).toISOString());
  const asked=[];
  context.playerStats=async req=>{const u=new URL(req.url);asked.push(u.searchParams.get('player'));
    const vals=u.searchParams.get('player')==='Carnell Tate'?[2,3,1,4,3,2,5,3,2,3]:[80,95,60,72,88,70,90,66];
    const stats=vals.map((x,i)=>({game:{date:new Date(now-(i+1)*7*86400000).toISOString(),season:2026},receptions:x,receiving_yards:x}));
    stats.unshift({game:{date:'2026-10-11T17:00:00Z',season:2026},receptions:99,receiving_yards:999});
    return Response.json({success:true,player:{position_abbreviation:'WR',team:{full_name:'Houston Texans'}},stats})};
  run('playerStats=globalThis.playerStats');
  out=J(await run(`runStatsChecks(env,{waitUntil(){}},${now})`));assert.equal(out.checked,2);
  const rows=db.prepare('SELECT * FROM stats_checks ORDER BY kind').all();
  assert.deepEqual(rows.map(r=>[r.kind,r.player,r.opponent,r.position]),[['near','Nico Collins','Tennessee Titans','WR'],['official','Carnell Tate','Tennessee Titans','WR']]);
  const tate=rows.find(r=>r.kind==='official');assert.equal(tate.verdict,'agree');assert.equal(tate.l10_hits,9);assert.ok(tate.def_factor>1.3,'the Titans allow more to WRs');
  assert.ok(!JSON.parse(tate.detail_json).recent.includes(99),'the game being bet is never in its own history');
  assert.equal(rows.find(r=>r.kind==='near').verdict,'agree');
  out=J(await run(`runStatsChecks(env,{waitUntil(){}},${now+600000})`));assert.equal(out.checked,0,'each pick once');
  // A provider error is retried later instead of saved.
  db.prepare("INSERT INTO near_shadow(id,event_id,player,team,market,side,line,odds,book,edge,game_time,logged_at) VALUES('NFL--e|x','NFL--e','Flaky Guy',?,'Receptions','Over',3.5,-110,'FanDuel',.7,?,?)").run(team,kick,new Date(now).toISOString());
  const keep=context.playerStats;context.playerStats=async()=>{throw new Error('provider down')};run('playerStats=globalThis.playerStats');
  assert.equal(J(await run(`runStatsChecks(env,{waitUntil(){}},${now+700000})`)).checked,0);
  context.playerStats=keep;run('playerStats=globalThis.playerStats');
  assert.equal(J(await run(`runStatsChecks(env,{waitUntil(){}},${now+800000})`)).checked,1,'checked once the provider is back');
  assert.equal(run("statsPos({position:'Wide Receiver'})"),'WR');
  assert.equal(J(await run(`runStatsChecks(env,{waitUntil(){}},Date.parse('${kick}')+60000)`)).checked,0,'never after kickoff');
  // The summary joins results once picks are graded.
  db.prepare("UPDATE public_recommendations SET status='final',result='won'").run();
  const sum=J(await run('statsCheckSummary(env)'));
  assert.deepEqual(sum.find(s=>s.kind==='official'),{kind:'official',verdict:'agree',picks:1,won:1,lost:0,push:0,pending:0});
  // Player lookup: a common surname that crowds the player out falls back to the first name.
  const searches=[];context.bdlRequest=async path=>{const term=new URLSearchParams(path.split('?')[1]).get('search');searches.push(term);
    return {data:term==='Johnson'?Array.from({length:100},(_,i)=>({id:i,first_name:'Other'+i,last_name:'Johnson',team:{full_name:'Dallas Cowboys'}})):term==='Tez'?[{id:7,first_name:'Tez',last_name:'Johnson',team:{full_name:'Tampa Bay Buccaneers'}}]:[]}};
  run('bdlRequest=globalThis.bdlRequest');
  const found=J(await run("findStatsPlayer('NFL','Tez Johnson','Tampa Bay Buccaneers · @ Atlanta Falcons','k')"));
  assert.equal(found.id,7);assert.deepEqual(searches,['Johnson','Tez']);
  searches.length=0;await run("findStatsPlayer('NFL','Kelce','','k')");assert.deepEqual(searches,['Kelce'],'one-word names search once');
  console.log('PASS: stats check builds defense-vs-position from box scores, projects each pick from L5/L10/season and the defense, records agree/neutral/disagree before kickoff, once, and summarizes results');
})().catch(error=>{console.error(error);process.exit(1)});
