// Nov 23 rule changes (Tim): sharp check on app picks, NFL app markets, no NFL stats rule on apps,
// max edges (apps 4 points, sportsbook 3%), NBA singles at +110, ProphetX/Polymarket over Novig.
const assert=require('node:assert/strict'),vm=require('node:vm'),{webcrypto}=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const {read}=require('./helpers/client.cjs');
const pushes=[],mail=[];
const context=vm.createContext({URL,URLSearchParams,Request,Response,Headers,FormData,AbortSignal,Date,console,setTimeout,clearTimeout,crypto:webcrypto,TextEncoder,btoa,atob,fetch:async(url,init)=>{if(String(url).startsWith('https://ntfy.sh/'))pushes.push({title:init.headers.Title,body:init.body});if(String(url).includes('resend.com'))mail.push(JSON.parse(init.body));return new Response('{}',{status:200})}});
const template=read('worker/index.template.js');
vm.runInContext(template.slice(template.indexOf('const API_BASE')).replace('__MOVEMENT_SERVER__',read('worker/movement.js')).replace('__LIVE_SERVER__',read('worker/live.js')).replace('__STATS_SHARED__',read('dist/stats.js')).replace('__RECORDS_SERVER__',read('worker/records.js')).replace('__ACCOUNTS_SERVER__',read('worker/accounts.js')).replace('export default {','this.worker={'),context);
const db=new DatabaseSync(':memory:');
for(const f of ['0000_public_record.sql','0001_record_settlement.sql','0002_historical_replays.sql','0006_push_alerts.sql'])db.exec(read('drizzle/'+f).replaceAll('--> statement-breakpoint',''));
db.exec('CREATE TABLE prediction_picks (id TEXT PRIMARY KEY, exchange TEXT, event_id TEXT, player TEXT, team TEXT, market TEXT, side TEXT, line REAL, odds INTEGER, net_odds INTEGER, game_time TEXT, posted_at TEXT, result TEXT, void_reason TEXT, graded_at TEXT, actual REAL)');
const wrap=(sql,args=[])=>({bind(...v){return wrap(sql,v)},async first(){return db.prepare(sql).get(...args)||null},async all(){return{results:db.prepare(sql).all(...args)}},async run(){const r=db.prepare(sql).run(...args);return{success:true,meta:{changes:Number(r.changes)}}}});
context.env={THE_ODDS_API_KEY:'k',DB:{prepare:sql=>wrap(sql),async batch(l){for(const s of l)await s.run()}}};
const run=c=>vm.runInContext(c,context),J=v=>JSON.parse(JSON.stringify(v));
let calls=0;context.fetch=async url=>{url=String(url);if(url.includes('bookmakers=pinnacle')){calls++;return new Response(JSON.stringify({bookmakers:[{key:'pinnacle',markets:[{key:'player_receptions',outcomes:[
  {name:'Over',description:'Alpha Guy',point:4.5,price:-130},{name:'Under',description:'Alpha Guy',point:4.5,price:110},
  {name:'Over',description:'Beta Guy',point:3.5,price:120},{name:'Under',description:'Beta Guy',point:3.5,price:-140}]}]}]}),{headers:{'x-requests-remaining':'5000'}})}return new Response('{}',{status:404})};
run('fetch=globalThis.fetch');
(async()=>{
  // 1. Sharp check: sharp no-vig chance for our side must cover the app's after-fee price.
  const list=[{eventId:'NFL--g1',player:'Alpha Guy',market:'Receptions',side:'Over',line:4.5,odds:-105,netOdds:-105},{eventId:'NFL--g1',player:'Beta Guy',market:'Receptions',side:'Over',line:3.5,odds:-105,netOdds:-105},{eventId:'NFL--g1',player:'Gamma Guy',market:'Receptions',side:'Over',line:2.5,odds:100,netOdds:100}];
  const ready=J(await run(`pmSharpGate(env,${JSON.stringify(list)},${Date.parse('2026-11-29T12:00:00Z')})`));
  assert.deepEqual(ready.map(p=>p.player),['Alpha Guy'],'sharp agrees: kept; disagrees or no price: held');assert.ok(ready[0].sharpEdge>0);
  await run(`pmSharpGate(env,${JSON.stringify(list.slice(0,1))},${Date.parse('2026-11-29T12:30:00Z')})`);assert.equal(calls,1,'one pull per game, cached 2 hours');
  // 2-3. NFL app markets and no NFL stats rule.
  assert.equal(run("[...PM_NFL_MARKETS].join(',')"),'Interceptions Thrown,Passing Touchdowns,Receptions');assert.equal(run('PM_NFL_STATS_AGREE'),false);
  // 4. Max edges.
  assert.equal(run('PREDICTION_MAX'),4);assert.equal(run('NBA_PM.max'),4);
  assert.equal(run("officialBar({edge:2.9,market:'Receptions',side:'Over',line:4.5,book:'DraftKings'})"),true);assert.equal(run("officialBar({edge:3.1,market:'Receptions',side:'Over',line:4.5,book:'DraftKings'})"),false,'3%+ sportsbook edge: out');
  // 5. NBA singles at +110 or shorter, NFL at +125.
  const kept=J(await run(`capSingles(env,[{gameId:'NBA--x',player:'N1',odds:110},{gameId:'NBA--x',player:'N2',odds:115},{gameId:'NFL--y',player:'F1',odds:120},{gameId:'NFL--y',player:'F2',odds:130}],0)`)).map(p=>p.player);
  assert.deepEqual(kept,['N1','F1']);
  // 6. ProphetX over Novig when both qualify (even with a smaller edge).
  const kick=new Date(Date.parse('2026-11-29T18:00:00Z')).toISOString(),now=Date.parse('2026-11-29T08:00:00Z');
  const ex=(key,o)=>({key,title:key,markets:[{key:'player_receptions',outcomes:[{name:'Over',description:'Alpha Guy',point:4.5,price:o},{name:'Under',description:'Alpha Guy',point:4.5,price:-200}]}]});
  context.fairs=new Map([['NFL--g1|alphaguy|Receptions|4.5',.515]]);context.board={id:'g1',eventID:'NFL--g1',commence_time:kick,home_team:'H',away_team:'A'};
  context.exb={bookmakers:[ex('novig',110),ex('prophetx',106)]};
  const c=J(await run(`predictionCandidates(board,exb,fairs,${now})`));assert.equal(c[0].exchange,'ProphetX',JSON.stringify(c));
  console.log('PASS: Nov 23 rules: sharp check on app picks (cached per game), NFL app markets, no NFL app stats rule, max edges, NBA singles +110, ProphetX over Novig');
})().catch(e=>{console.error(e);process.exit(1)});
