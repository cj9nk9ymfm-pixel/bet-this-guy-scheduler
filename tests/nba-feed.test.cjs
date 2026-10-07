const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..');
// NBA runs on its own feed (?sport=NBA) so the NFL board, caches and pick job
// are unchanged by it.
let now=Date.parse('2026-10-27T15:00:00Z');
class Clock extends Date{constructor(...a){super(...(a.length?a:[now]))}static now(){return now}}
const calls=[],env={THE_ODDS_API_KEY:'fixture-key'};
const event=(sport,id,hours)=>({id,sport_key:sport,commence_time:new Date(now+hours*3600000).toISOString(),home_team:'Home',away_team:'Away'});
const context=vm.createContext({Date:Clock,URL,URLSearchParams,Request,Response,Headers,AbortSignal,setTimeout,clearTimeout,console,
  fetch:async url=>{url=new URL(url);calls.push(url);
    const m=url.pathname.match(/\/sports\/([^/]+)\/events(?:\/([^/]+)\/odds)?$/);assert.ok(m,'only odds API calls');
    if(!m[2])return Response.json(m[1]==='basketball_nba'?[event('basketball_nba','nba1',4)]:[event('americanfootball_nfl','nfl1',30)]);
    return Response.json({id:m[2],commence_time:new Date(now+4*3600000).toISOString(),home_team:'Home',away_team:'Away',bookmakers:[{key:'draftkings',title:'DraftKings',markets:[]},{key:'bovada',title:'Bovada',markets:[]}]});
  }});
const read=f=>fs.readFileSync(path.join(root,f),'utf8'),template=read('worker/index.template.js');
vm.runInContext(template.slice(template.indexOf('const API_BASE')).replace('__MOVEMENT_SERVER__',read('worker/movement.js')).replace('__LIVE_SERVER__',read('worker/live.js')).replace('__STATS_SHARED__',read('dist/stats.js')).replace('__RECORDS_SERVER__',read('worker/records.js')).replace('__ACCOUNTS_SERVER__',read('worker/accounts.js')).replace('export default {','this.worker={'),context);
const payload=async url=>(await context.worker.fetch(new Request('https://test.local'+url),env,{waitUntil(){}})).json();
(async()=>{
  const nba=await payload('/api/schedule?sport=NBA');
  assert.deepEqual(nba.data.map(e=>e.eventID),['NBA--nba1'],'the NBA schedule lists NBA games');
  assert.ok(calls.every(u=>u.pathname.includes('basketball_nba')),'the NBA schedule never calls the NFL feed');
  calls.length=0;
  const nfl=await payload('/api/schedule');
  assert.deepEqual(nfl.data.map(e=>e.eventID),['NFL--nfl1'],'the NFL schedule is unchanged and separately cached');
  assert.ok(calls.every(u=>u.pathname.includes('americanfootball_nfl')));
  calls.length=0;
  const board=await payload('/api/props?sport=NBA');
  assert.equal(board.data[0].eventID,'NBA--nba1');
  assert.ok(board.data[0].bookmakers.every(b=>b.key!=='bovada'),'offshore books are dropped for NBA too');
  const oddsCall=calls.find(u=>u.pathname.endsWith('/odds'));
  assert.ok(oddsCall.searchParams.get('markets').split(',').includes('player_points'),'NBA boards ask for NBA player markets');
  calls.length=0;
  await payload('/api/event?eventID=NBA--nba1&movement=1');
  assert.deepEqual(calls.at(-1).searchParams.get('markets').split(','),['player_points','player_rebounds','player_assists','player_threes','player_points_rebounds_assists'],'NBA price history tracks NBA markets');
  console.log('PASS: NBA has its own schedule, board and price-history feed (licensed books only); the NFL feed is unchanged');
})().catch(e=>{console.error(e);process.exit(1)});
