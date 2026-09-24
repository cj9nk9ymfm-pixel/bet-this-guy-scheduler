const assert=require('node:assert/strict'),vm=require('node:vm');
const {read}=require('./helpers/client.cjs');
const calls=[];
const context=vm.createContext({URL,URLSearchParams,Request,Response,Headers,AbortSignal,Date,console,setTimeout,clearTimeout,
  fetch:async url=>{url=new URL(url);calls.push(url.pathname);
    if(url.pathname.endsWith('/events'))return Response.json(url.pathname.includes('americanfootball_nfl')?[{id:'known1',sport_key:'americanfootball_nfl',home_team:'Home',away_team:'Away',commence_time:new Date(Date.now()+3600000).toISOString()}]:[]);
    if(url.pathname.includes('/odds'))return Response.json({id:url.pathname.split('/')[5],bookmakers:[]});
    return Response.json({data:[],meta:{}});}});
const template=read('worker/index.template.js');
vm.runInContext(template.slice(template.indexOf('const API_BASE')).replace('__MOVEMENT_SERVER__',read('worker/movement.js')).replace('__LIVE_SERVER__',read('worker/live.js')).replace('__STATS_SHARED__',read('dist/stats.js')).replace('__RECORDS_SERVER__',read('worker/records.js')).replace('__ACCOUNTS_SERVER__',read('worker/accounts.js')).replace('export default {','this.worker={'),context);
const run=code=>vm.runInContext(code,context);
const limiter=limit=>{const used=new Map();return {keys:used,limit:async({key})=>{used.set(key,(used.get(key)||0)+1);return {success:used.get(key)<=limit}}}};
const ctx={waitUntil(){}};
const visit=(path,ip='203.0.113.7')=>new Request('https://test.invalid'+path,{headers:ip?{'cf-connecting-ip':ip}:{}});
async function call(env,req){context.env=env;context.req=req;return run('worker.fetch(req,env,{waitUntil(){}})')}
(async()=>{
  const events=limiter(2),stats=limiter(3);
  const env={THE_ODDS_API_KEY:'fixture',BALLDONTLIE_API_KEY:'fixture',UNKNOWN_EVENT_LIMITER:events,PLAYER_STATS_LIMITER:stats};

  // Scheduled games are never limited, however often they miss the cache.
  for(let i=0;i<4;i++){run('runtimeFeedCache.clear()');assert.equal((await call(env,visit('/api/event?eventID=NFL--known1'))).status,200,'scheduled game loads')}
  assert.equal(events.keys.size,0,'scheduled games never touch the limiter');

  // Unknown event IDs get a strict per-visitor budget, then 429 with no paid call.
  assert.equal((await call(env,visit('/api/event?eventID=NFL--random01'))).status,200);
  assert.equal((await call(env,visit('/api/event?eventID=NFL--random02'))).status,200);
  const oddsBefore=calls.filter(p=>p.includes('/odds')).length;
  const blocked=await call(env,visit('/api/event?eventID=NFL--random03'));
  assert.equal(blocked.status,429);assert.equal(blocked.headers.get('retry-after'),'60');
  assert.equal(calls.filter(p=>p.includes('/odds')).length,oddsBefore,'blocked lookups make no paid call');
  assert.equal((await call(env,visit('/api/event?eventID=NFL--random04','198.51.100.9'))).status,200,'budget is per visitor');

  // Internal requests (scheduler, shared movement on its own behalf) are not limited.
  assert.equal((await call(env,visit('/api/event?eventID=NFL--random05',''))).status,200,'internal calls bypass the limiter');

  // Shared movement forwards the visitor, so it cannot be used to skip the guard.
  const env2={...env,DB:{prepare:()=>({bind:()=>({run:async()=>({meta:{changes:0}}),all:async()=>({results:[]}),first:async()=>null}),all:async()=>({results:[]})})}};
  const oddsBeforeMovement=calls.filter(p=>p.includes('/odds')).length;
  await call(env2,visit('/api/movement?eventID=NFL--random06'));
  assert.equal(calls.filter(p=>p.includes('/odds')).length,oddsBeforeMovement,'movement for an unknown game makes no paid call once the visitor budget is spent');

  // Player stats: odd input is rejected up front; uncached lookups have a generous per-visitor cap.
  assert.equal((await call(env,visit('/api/player-stats?sport=NFL&player=%3Cscript%3E'))).status,400);
  assert.equal((await call(env,visit('/api/player-stats?sport=NFL&player=Amon-Ra%20St.%20Brown&team=Detroit%20Lions'))).status!==400,true,'real names with punctuation are accepted');
  assert.equal((await call(env,visit('/api/player-stats?sport=NFL&player=Jos%C3%A9%20Ram%C3%ADrez'))).status!==400,true,'accented names are accepted');
  for(const name of ['Player One','Player Two'])await call(env,visit('/api/player-stats?sport=NFL&player='+encodeURIComponent(name)));
  assert.equal((await call(env,visit('/api/player-stats?sport=NFL&player=Player%20Five'))).status,429,'stats lookups beyond the cap are limited');

  // Without the limiter binding (tests, local dev) nothing is limited.
  const open={THE_ODDS_API_KEY:'fixture',BALLDONTLIE_API_KEY:'fixture'};
  for(let i=0;i<8;i++)assert.equal((await call(open,visit('/api/event?eventID=NFL--free'+i))).status,200);
  console.log('PASS: paid lookups for unknown games and uncached player stats are rate limited per visitor; scheduled games, internal calls and real names are never blocked');
})().catch(e=>{console.error(e);process.exitCode=1});
