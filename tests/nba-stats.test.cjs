const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
// NBA stats: stat definitions, grading a finished pick, the live tracker feed,
// and BALLDONTLIE's NBA path (/v1, with /nba/v1 as a fallback).
let now=Date.parse('2026-10-28T02:30:00Z');
class Clock extends Date{constructor(...a){super(...(a.length?a:[now]))}static now(){return now}}
const calls=[];let v1Missing=false;
const knicks={id:20,full_name:'New York Knicks',abbreviation:'NYK'},celtics={id:2,full_name:'Boston Celtics',abbreviation:'BOS'};
const tatum={id:434,first_name:'Jayson',last_name:'Tatum'},brunson={id:73,first_name:'Jalen',last_name:'Brunson'};
// A 7:30pm ET tip-off is dated Oct 27 by the feed and 23:30 UTC by the odds.
const game={id:9001,date:'2026-10-27',datetime:'2026-10-27T23:30:00Z',status:'Final',period:4,time:'Final',home_team:celtics,visitor_team:knicks,home_team_score:112,visitor_team_score:104};
const line=(player,team,pts,reb,ast,fg3m)=>({player,team,game,pts,reb,ast,fg3m,stl:1,blk:0,turnover:2,min:'36'});
const context=vm.createContext({Date:Clock,URL,URLSearchParams,Request,Response,Headers,AbortSignal,setTimeout,clearTimeout,console,
  fetch:async url=>{url=new URL(url);calls.push(url.pathname+url.search);
    if(v1Missing&&url.pathname.startsWith('/v1/'))return new Response('{}',{status:404});
    const p=url.pathname.replace(/^\/(nba\/)?v1/,'');
    if(p==='/games')return Response.json({data:[liveGame??game]});
    if(p==='/players')return Response.json({data:[tatum,brunson].filter(x=>x.last_name===url.searchParams.get('search'))});
    if(p==='/stats'){const ids=url.searchParams.getAll('player_ids[]');return Response.json({data:[line(tatum,celtics,31,9,4,5),line(brunson,knicks,24,3,11,2)].filter(r=>!ids.length||ids.includes(String(r.player.id))),meta:{}})}
    if(p==='/box_scores/live')return Response.json({data:[{...liveGame,home_team:{...celtics,players:[{...line(tatum,celtics,22,6,3,3),game:undefined,team:undefined}]},visitor_team:{...knicks,players:[]}}]});
    return new Response('{}',{status:404});
  }});
let liveGame=null;
const template=read('worker/index.template.js');
vm.runInContext(template.slice(template.indexOf('const API_BASE')).replace('__MOVEMENT_SERVER__',read('worker/movement.js')).replace('__LIVE_SERVER__',read('worker/live.js')).replace('__STATS_SHARED__',read('dist/stats.js')).replace('__RECORDS_SERVER__',read('worker/records.js')).replace('__ACCOUNTS_SERVER__',read('worker/accounts.js')).replace('export default {','this.worker={'),context);
const run=c=>vm.runInContext(c,context),env={BALLDONTLIE_API_KEY:'fixture'};context.env=env;
const payload=async url=>(await context.worker.fetch(new Request('https://test.local'+url),env,{waitUntil(){}})).json();
(async()=>{
  // Stat definitions: NBA "Assists" are passing assists, never NFL tackles.
  const row=line(tatum,celtics,31,9,11,5);context.row=row;
  const m=(market,sport='NBA')=>run(`BTGStats.metric(${JSON.stringify({market,sport})},row).value`);
  assert.deepEqual([m('Points'),m('Rebounds'),m('Assists'),m('3-Pointers Made'),m('Points + Rebounds + Assists'),m('Rebounds + Assists'),m('Double-Double'),m('Triple-Double')],[31,9,11,5,51,20,1,0]);
  assert.equal(run("BTGStats.metric({market:'Assists',sport:'NFL'},{assisted_tackles:3}).value"),3,'NFL assists are unchanged');
  assert.ok(run("BTGStats.supports({market:'Points + Rebounds + Assists',sport:'NBA'})")&&!run("BTGStats.supports({market:'First Basket',sport:'NBA'})"));
  // Grading: a finished NBA pick finds its game (a late tip-off dated the day before in UTC) and the player's line.
  context.record={sport:'NBA',player:'Jayson Tatum',team:'New York Knicks · @ Boston Celtics',gameTime:'2026-10-27T23:30:00Z',market:'Points',side:'Over',line:28.5};
  const graded=JSON.parse(JSON.stringify(await run('recordPlayerStats(record,env)')));
  assert.equal(graded.pts,31);assert.equal(graded.scoreboardFinal,true);
  assert.equal(run(`BTGStats.grade('Over',28.5,BTGStats.metric(record,${JSON.stringify(graded)}).value)`),'won');
  assert.ok(calls.some(c=>c.startsWith('/v1/games')&&c.includes('dates%5B%5D=2026-10-26')&&c.includes('dates%5B%5D=2026-10-27')),'asks for both days around a late tip-off');
  // Player stats screen: completed games, newest first.
  const stats=await payload('/api/player-stats?sport=NBA&player=Jalen%20Brunson&team=New%20York%20Knicks');
  assert.equal(stats.success,true);assert.equal(stats.stats[0].ast,11);
  // Live tracker: score, quarter and clock, and live box-score lines.
  liveGame={...game,status:'3rd Qtr',period:3,time:'Q3 5:21',home_team_score:78,visitor_team_score:74};
  const live=await payload('/api/live-games?sport=NBA');
  assert.deepEqual([live.games[0].state,live.games[0].period,live.games[0].clock,live.games[0].homeScore],['in_progress',3,'5:21',78]);
  const box=await payload('/api/live-game-stats?sport=NBA&game_id=9001');
  assert.equal(box.stats[0].pts,22,'in-game points come from the live box score');
  assert.equal(String(box.stats[0].game.id),'9001');
  // Path fallback: if /v1 is not the NBA path, /nba/v1 is used.
  run('nbaPrefix=null;runtimeFeedCache.clear()');v1Missing=true;calls.length=0;
  assert.equal((await run("nbaRequest('/games',env.BALLDONTLIE_API_KEY)")).data.length,1);
  assert.deepEqual(calls.map(c=>c.split('?')[0]),['/v1/games','/nba/v1/games']);
  console.log('PASS: NBA stats: definitions (assists are passing assists), grading a finished pick, player game logs, live scores and box scores, and the /v1 → /nba/v1 path fallback');
})().catch(e=>{console.error(e);process.exit(1)});
