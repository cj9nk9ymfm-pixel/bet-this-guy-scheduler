// Extra-books test (Nov 25, Tim): books the odds provider has that we don't use. venue rows: their
// price beats our licensed-book fair price; fair rows: adding that book to the fair price adds or
// drops an official-book pick. DFS apps are tagged. Logged once per game, never posted.
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),{webcrypto}=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const {read}=require('./helpers/client.cjs');
const context=vm.createContext({URL,URLSearchParams,Request,Response,Headers,FormData,AbortSignal,Date,console,setTimeout,clearTimeout,crypto:webcrypto,TextEncoder,btoa,atob,BigInt,fetch:async()=>new Response('{}',{status:404})});
const template=read('worker/index.template.js');
vm.runInContext(template.slice(template.indexOf('const API_BASE')).replace('__MOVEMENT_SERVER__',read('worker/movement.js')).replace('__LIVE_SERVER__',read('worker/live.js')).replace('__STATS_SHARED__',read('dist/stats.js')).replace('__RECORDS_SERVER__',()=>read('worker/records.js')).replace('__ACCOUNTS_SERVER__',read('worker/accounts.js')).replace('export default {','this.worker={'),context);
const db=new DatabaseSync(':memory:');
for(const f of ['0000_public_record.sql','0001_record_settlement.sql','0002_historical_replays.sql','0047_extra_book_shadow.sql'])db.exec(read('drizzle/'+f).replaceAll('--> statement-breakpoint',''));
db.exec('CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)');
db.exec('CREATE TABLE prediction_picks (id TEXT PRIMARY KEY, exchange TEXT, event_id TEXT, player TEXT, team TEXT, market TEXT, side TEXT, line REAL, odds INTEGER, net_odds INTEGER, game_time TEXT, posted_at TEXT, result TEXT, void_reason TEXT, graded_at TEXT, actual REAL)');
const wrap=(sql,args=[])=>({bind(...v){return wrap(sql,v)},async first(){return db.prepare(sql).get(...args)||null},async all(){return{results:db.prepare(sql).all(...args)}},async run(){const r=db.prepare(sql).run(...args);return{success:true,meta:{changes:Number(r.changes)}}}});
const run=c=>vm.runInContext(c,context);
context.env={DB:{prepare:sql=>wrap(sql),async batch(l){for(const s of l)await s.run()}}};
const calls=[];
(async()=>{
  const now=Date.parse('2026-11-25T22:00:00Z'),kick=new Date(now+150*60000).toISOString();
  const two=(o,u,line=4.5)=>({key:'player_receptions',outcomes:[{name:'Over',description:'Tyler Higbee',point:line,price:o},{name:'Under',description:'Tyler Higbee',point:line,price:u}]});
  const bk=(key,title,o,u)=>({key,title,markets:[two(o,u)]});
  const event={id:'e1',away_team:'Green Bay Packers',home_team:'Los Angeles Rams',commence_time:kick,bookmakers:[bk('draftkings','DraftKings',110,-130),bk('fanduel','FanDuel',-110,-110),bk('betmgm','BetMGM',-110,-110),bk('williamhill_us','Caesars',-110,-110),bk('bovada','Bovada',110,-150),{key:'prizepicks',title:'PrizePicks',markets:[{key:'player_receptions',outcomes:[{name:'Over',description:'Tyler Higbee',point:4.5,price:-105}]}]}]};
  context.ev=event;const rows=JSON.parse(JSON.stringify(run(`extraBookRows(ev,'NFL',${now})`)));
  const venue=rows.filter(r=>r.kind==='venue'),fair=rows.filter(r=>r.kind==='fair');
  assert.deepEqual(venue.map(r=>[r.book,r.side,r.odds]),[['bovada','Over',110]],'Bovada Over +110 beats fair; PrizePicks -105 does not');
  assert.ok(venue[0].edge>1&&venue[0].edge<3,`edge ${venue[0].edge}`);assert.equal(venue[0].matchup,'Green Bay Packers · @ Los Angeles Rams');
  assert.equal(fair.length,1);assert.equal(fair[0].change,'dropped','with Bovada in the fair price, the DraftKings Over +110 no longer qualifies');assert.equal(fair[0].venue,'DraftKings');
  // DFS apps are tagged.
  event.bookmakers[5]={key:'prizepicks',title:'PrizePicks',markets:[{key:'player_receptions',outcomes:[{name:'Over',description:'Tyler Higbee',point:4.5,price:115}]}]};
  context.ev=event;const dfs=JSON.parse(JSON.stringify(run(`extraBookRows(ev,'NFL',${now})`))).find(r=>r.book==='prizepicks');assert.equal(dfs.change,'dfs');
  // Our own books and the apps we already track are never logged as extra.
  assert.ok(!rows.some(r=>['draftkings','fanduel','novig','prophetx'].includes(r.book)));
  // The run: one pull per game 2-3 hours out, rows saved once.
  context.env.THE_ODDS_API_KEY='k';
  context.fetch=async url=>{const u=new URL(url);calls.push(u);if(u.pathname.endsWith('/events'))return Response.json(u.pathname.includes('nfl')?[event,{...event,id:'far',commence_time:new Date(now+9*3600000).toISOString()}]:[]);if(u.pathname.includes('/events/e1/odds'))return Response.json(event,{headers:{'x-requests-remaining':'2900000'}});return new Response('[]',{status:404})};
  run('fetch=globalThis.fetch');
  const out=await run(`recordExtraBooks(env,${now})`);assert.equal(out.games,1,'only the game 2-3 hours out');assert.ok(out.logged>=2);
  const odds=calls.find(u=>u.pathname.includes('/odds'));assert.equal(odds.searchParams.get('regions'),'us,us2,us_dfs,us_ex');
  assert.equal((await run(`recordExtraBooks(env,${now+600000})`)).games,0,'once per game');
  assert.ok(db.prepare('SELECT COUNT(*) n FROM extra_book_shadow').get().n>=2);
  db.prepare("INSERT INTO app_settings (key,value) VALUES ('extra-books','off')").run();assert.equal((await run(`recordExtraBooks(env,${now})`)).off,true);
  console.log('PASS: extra books: prices beating our fair (venue) and fair-price changes (added/dropped) logged once per game 2-3 hours out across every US region; DFS tagged; our own books and tracked apps skipped');
})().catch(e=>{console.error(e);process.exit(1)});
