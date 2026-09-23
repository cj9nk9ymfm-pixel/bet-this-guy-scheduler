const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
let now = Date.parse('2026-09-18T01:00:00Z');
class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
const calls = [], tasks = [], env = { BALLDONTLIE_API_KEY:'fixture-key', THE_ODDS_API_KEY:'fixture-key' };
let provider;
const context = vm.createContext({ Date:Clock, URL, URLSearchParams, Request, Response, Headers, AbortSignal, setTimeout, clearTimeout, console,
  fetch: async (url, options) => { calls.push(new URL(url)); return provider(new URL(url), options); },
});
const template = fs.readFileSync(path.join(root,'worker/index.template.js'),'utf8');
vm.runInContext(template.slice(template.indexOf('const API_BASE')).replace('__MOVEMENT_SERVER__',fs.readFileSync(path.join(root,'worker/movement.js'),'utf8')).replace('__LIVE_SERVER__',fs.readFileSync(path.join(root,'worker/live.js'),'utf8')).replace('__STATS_SHARED__',fs.readFileSync(path.join(root,'dist/stats.js'),'utf8')).replace('__RECORDS_SERVER__',fs.readFileSync(path.join(root,'worker/records.js'),'utf8')).replace('__ACCOUNTS_SERVER__',fs.readFileSync(path.join(root,'worker/accounts.js'),'utf8')).replace('export default {','globalThis.worker = {'),context);
const request = url => context.worker.fetch(new Request('https://test.local'+url), env, {waitUntil:promise=>tasks.push(promise)});
const payload = async url => (await request(url)).json();
const clear = () => vm.runInContext('runtimeFeedCache.clear()',context);
const team = (id, full_name, abbreviation) => ({id,full_name,abbreviation});
const home = team(1,'Buffalo Bills','BUF'), away = team(2,'Detroit Lions','DET');
const game = {id:77,date:'2026-09-18T00:20:00Z',visitor_team:away,home_team:home,visitor_team_score:7,home_team_score:10,status_state:'in_progress',status:'9:42 - 2nd'};
const reply = body => Response.json(body);

(async () => {
  provider = async url => { assert.equal(url.pathname,'/nfl/v1/games');return reply({data:[game]}); };
  const scores = await payload('/api/live-games');
  assert.equal(scores.games[0].period,2);assert.equal(scores.games[0].clock,'9:42');assert.equal(scores.games[0].homeScore,10);
  assert.deepEqual(calls[0].searchParams.getAll('dates[]'),['2026-09-17','2026-09-18','2026-09-19']);
  assert.deepEqual(calls[0].searchParams.getAll('season_types[]'),['2','3']);
  await payload('/api/live-games');assert.equal(calls.length,1,'scoreboard shared cache');
  assert.equal(vm.runInContext('nflGameState({status:"Final/OT"})',context),'final');
  assert.equal(vm.runInContext('reportedGameClock({status:"Halftime"}).halftime',context),true);
  assert.equal(vm.runInContext('reportedGameClock({status:"4:11 - OT"}).period',context),5);
  assert.equal(vm.runInContext('reportedGameClock({status:"In Progress"}).period',context),null);
  console.log('PASS: game lifecycle, reported quarter/clock, midnight and regular/postseason filters, shared score cache');

  clear(); now+=30000;
  let releasePlay;
  provider = async url => {
    if(url.pathname.endsWith('/games'))return reply({data:[{...game,status:'In Progress'}]});
    assert.equal(url.pathname,'/nfl/v1/plays');
    await new Promise(resolve=>releasePlay=resolve);
    return reply({data:[{game:{id:77},period:2,clock_display:'8:02',wallclock:new Date(now).toISOString()}],meta:{next_cursor:null}});
  };
  const pendingScore=await payload('/api/live-games');assert.equal(pendingScore.games[0].clock,null,'scores do not wait for play history');
  await new Promise(resolve=>setImmediate(resolve));releasePlay();await Promise.all(tasks.splice(0));
  now+=9000; const playScore=await payload('/api/live-games');assert.equal(playScore.games[0].clock,'8:02');assert.equal(playScore.games[0].clockSource,'last_play');
  await new Promise(resolve=>setImmediate(resolve));releasePlay();await Promise.all(tasks.splice(0));
  console.log('PASS: optional play clock does not block scores and is labeled as the last reported play');

  clear();calls.length=0;
  provider = async url => {
    assert.equal(url.pathname,'/nfl/v1/stats');assert.equal(url.searchParams.get('game_ids[]'),'77');
    assert.deepEqual(url.searchParams.getAll('season_types[]'),['2','3']);
    await new Promise(resolve=>setTimeout(resolve,5));
    return reply(url.searchParams.has('cursor')?{data:[{player:{id:12},game:{id:77},passing_yards:165}],meta:{next_cursor:null}}:{data:[{player:{id:11},game:{id:77},rushing_yards:34,receptions:0,receiving_yards:null},{player:{id:999},game:{id:99},rushing_yards:200}],meta:{next_cursor:100}});
  };
  const [first,second]=await Promise.all([payload('/api/live-player?game_id=77&player_id=11'),payload('/api/live-player?game_id=77&player_id=12')]);
  assert.equal(first.stat.rushing_yards,34);assert.equal(first.stat.receptions,0);assert.equal(first.stat.receiving_yards,null);assert.equal(second.stat.passing_yards,165);assert.equal(calls.length,4,'concurrent visitors remain request-safe while the edge cache fills');
  const fullBox=await payload('/api/live-game-stats?game_id=77');assert.equal(fullBox.stats.length,2);assert.equal(calls.length,4,'whole-game live board reuses the shared box score');
  assert.equal((await payload('/api/live-player?game_id=77&player_id=999')).stat,null,'never return a row from another game');
  assert.equal((await request('/api/live-player?game_id=bad&player_id=11')).status,400);
  now+=60000;provider=async()=>{throw new Error('offline')};const stale=await payload('/api/live-player?game_id=77&player_id=11');assert.equal(stale.stale,true);assert.equal(stale.updatedAt,first.updatedAt);
  console.log('PASS: on-demand box scores, pagination, concurrent-request deduplication, null vs zero, invalid IDs, stale timestamp preservation');

  clear();
  provider=async url=>url.pathname.endsWith('/players')?reply({data:[{id:11,first_name:'Jahmyr',last_name:'Gibbs',team:away}]}):reply({data:[
    {player:{id:11},game:{id:77,date:new Date(now).toISOString(),status_state:'in_progress'},rushing_yards:34},
    {player:{id:11},game:{id:76,date:'2026-09-13T17:00:00Z',status_state:'final'},rushing_yards:80},
    {player:{id:11},game:{id:75,date:'2026-08-20T17:00:00Z',status_state:'final',season_type:'preseason'},rushing_yards:30},
  ]});
  const history=await payload('/api/player-stats?sport=NFL&player=Jahmyr%20Gibbs&team=Detroit%20Lions');
  assert.equal(history.stats.length,1);assert.equal(history.stats[0].game.id,76);
  console.log('PASS: ongoing and preseason games excluded from historical profile stats');

  clear();calls.length=0;
  provider=async()=>reply({...game,id:'event77',bookmakers:[{last_update:new Date(now-600000).toISOString(),markets:[{key:'player_rush_yds'}]},{last_update:new Date(now).toISOString(),markets:[{key:'player_reception_yds'}]}]});
  const odds=await payload('/api/event?eventID=NFL--event77&live=1');assert.equal(odds.data[0].bookmakers.length,1);
  now+=61000;provider=async()=>{throw new Error('offline')};assert.equal((await payload('/api/event?eventID=NFL--event77&live=1')).success,false,'never serve stale in-play odds after failure');
  console.log('PASS: stale sportsbook markets removed; failed live-odds refresh never revives cached opening lines');

  clear();calls.length=0;
  provider=async url=>{assert.deepEqual(url.searchParams.get('markets').split(','),['player_pass_yds','player_rush_yds','player_reception_yds','player_receptions','player_pass_tds','player_anytime_td']);return reply({id:'event77',bookmakers:[]})};
  assert.equal((await payload('/api/event?eventID=NFL--event77&movement=1')).success,true);
  await payload('/api/event?eventID=NFL--event77&movement=1');assert.equal(calls.length,1,'movement requests share one-minute cache');
  now+=61000;provider=async()=>{throw new Error('offline')};
  assert.equal((await payload('/api/event?eventID=NFL--event77&movement=1')).success,false,'movement errors do not resurrect stale cache');
  console.log('PASS: focused movement feed excludes alternate keys, shares cache, and fails without stale fallback');

  const nodes=new Map(), node=key=>nodes.get(key)||null;
  const client=vm.createContext({Date:Clock,URLSearchParams,AbortSignal,console,setTimeout:()=>1,clearTimeout(){},navigator:{onLine:true},window:{addEventListener(){}},document:{hidden:false,querySelectorAll:()=>[],addEventListener(){}},
    $:node,compactTeamName:name=>({'Detroit Lions':'DET','Buffalo Bills':'BUF'})[name]||name,gameStartTimestamp:v=>Date.parse(v),formatCompactKickoff:()=> 'Thu 8:20p',htmlEscape:s=>String(s),gameName:p=>p.team,
  });
  vm.runInContext(fs.readFileSync(path.join(root,'dist/stats.js'),'utf8'),client);
  vm.runInContext(fs.readFileSync(path.join(root,'dist/live.js'),'utf8'),client);
  client.fixture=scores.games[0];
  vm.runInContext('liveBoard.games=[fixture];liveBoard.updatedAt=new Date().toISOString()',client);
  assert.equal(vm.runInContext('liveGameFor("Detroit Lions @ Buffalo Bills","2026-09-18T00:20:00Z").id',client),77);
  assert.equal(vm.runInContext('liveGameFor("Detroit Lions @ Buffalo Bills","2026-09-25T00:20:00Z")',client),null);
  assert.equal(vm.runInContext('liveStatusLabel({state:"in_progress",period:4,clock:"0:00"})',client),'Q4 · 0:00');
  assert.equal(vm.runInContext('liveBoardTimeLabel({state:"in_progress",period:3,clock:"8:42"},"Sun Sep 20")',client),'LIVE · Q3 · 8:42 left');
  assert.equal(vm.runInContext('liveBoardTimeLabel({state:"in_progress",halftime:true},"Sun Sep 20")',client),'LIVE · Halftime');
  assert.equal(vm.runInContext('liveBoardTimeLabel({state:"scheduled"},"Sun Sep 20")',client),'Sun Sep 20');
  assert.equal(vm.runInContext('liveBoardTimeLabel({state:"final"},"Sun Sep 20")',client),'Final');
  vm.runInContext('liveBoard.stale=true',client);
  assert.equal(vm.runInContext('liveBoardTimeLabel({state:"in_progress",period:3,clock:"8:42"})',client),'LIVE · Q3 · 8:42 left · Update delayed');
  vm.runInContext('liveBoard.stale=false',client);
  const html=fs.readFileSync(path.join(root,'dist/index.html'),'utf8');
  assert.equal((html.match(/data-page-link=/g)||[]).length,5);
  assert.ok(!html.includes('data-page-link="live"'));
  assert.equal(vm.runInContext('liveStatValue({rushing_yards:null},"rushing_yards")',client),null);
  assert.equal(vm.runInContext('liveStatValue({rushing_yards:0},"rushing_yards")',client),0);
  assert.equal(vm.runInContext('liveMetric({market:"Rush + Receiving Yards"},{rushing_yards:34,receiving_yards:22}).value',client),56);
  assert.equal(vm.runInContext('liveLegState({market:"Rushing Yards",side:"Over",line:32.5},{state:"in_progress"},{rushing_yards:34}).title',client),'HIT LIVE');
  assert.equal(vm.runInContext('liveLegState({market:"Rushing Yards",side:"Under",line:32.5},{state:"in_progress"},{rushing_yards:12}).title',client),'LIVE');
  let clientCalls=0;client.fetch=async()=>{clientCalls++;return reply({games:[],success:true})};client.document.hidden=true;
  await client.tickLiveBoard();await client.refreshCurrentStats();assert.equal(clientCalls,0,'hidden page does not poll');
  client.document.hidden=false;await client.refreshCurrentStats();assert.equal(clientCalls,0,'closed player profile does not request stats');
  console.log('PASS: exact matchup + kickoff matching, true zero values, hidden-page polling pause, no startup player-stat requests');
})().catch(error=>{console.error(error);process.exitCode=1});
