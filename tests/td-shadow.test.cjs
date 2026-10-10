const assert=require('node:assert/strict'),vm=require('node:vm'),{webcrypto}=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const {read}=require('./helpers/client.cjs');
// Touchdown props (shadow): rated against the consensus of every book (books
// only offer Yes), logged once per game 90 minutes out, backtested from saved
// odds, graded from the play-by-play.
const context=vm.createContext({URL,URLSearchParams,Request,Response,Headers,AbortSignal,Date,console,setTimeout,clearTimeout,crypto:webcrypto,TextEncoder,btoa,atob,fetch:async()=>new Response(null,{status:404})});
const template=read('worker/index.template.js');
vm.runInContext(template.slice(template.indexOf('const API_BASE')).replace('__MOVEMENT_SERVER__',read('worker/movement.js')).replace('__LIVE_SERVER__',read('worker/live.js')).replace('__STATS_SHARED__',read('dist/stats.js')).replace('__RECORDS_SERVER__',read('worker/records.js')).replace('__ACCOUNTS_SERVER__',read('worker/accounts.js')).replace('export default {','this.worker={'),context);
const db=new DatabaseSync(':memory:');
for(const f of ['0003_shared_movement.sql','0020_td_shadow.sql'])db.exec(read('drizzle/'+f).replaceAll('--> statement-breakpoint',''));
const wrap=(sql,args=[])=>({bind(...values){return wrap(sql,values)},async first(){return db.prepare(sql).get(...args)||null},async all(){return{results:db.prepare(sql).all(...args)}},async run(){const r=db.prepare(sql).run(...args);return{success:true,meta:{changes:Number(r.changes)}}}});
context.env={DB:{prepare:sql=>wrap(sql),async batch(list){for(const s of list)await s.run()}},BALLDONTLIE_API_KEY:'test'};
const run=code=>vm.runInContext(code,context),J=v=>JSON.parse(JSON.stringify(v));
(async()=>{
  const kickoff=Date.parse('2026-10-11T17:00:00Z');
  const yes=(key,list)=>({key,outcomes:list.map(([p,price])=>({name:'Yes',description:p,price}))});
  const books={draftkings:150,fanduel:155,betmgm:140,williamhill_us:145,betrivers:150,fanatics:185};
  const board=(id,extra={})=>({id,eventID:'NFL--'+id,commence_time:new Date(kickoff).toISOString(),home_team:'Pittsburgh Steelers',away_team:'Cleveland Browns',
    bookmakers:Object.entries(books).map(([key,o])=>({key,markets:[yes('player_anytime_td',[['Nick Chubb',o],['Jerry Jeudy',(extra[key]??520)],['Pat Freiermuth',key==='betrivers'?null:240]].filter(x=>x[1]!==null)),yes('player_1st_td',[['Nick Chubb',o*4]])]}))});
  // Range, 4+ books, best big-5 price and its gap to the consensus.
  const props=J(run(`tdProps(${JSON.stringify(board('g1'))})`));
  const chubb=props.find(p=>p.player==='Nick Chubb'&&p.market==='Anytime Touchdown');
  assert.equal(chubb.odds,185);assert.equal(chubb.book,'fanatics');assert.equal(chubb.books,6);
  assert.ok(chubb.gap>8&&chubb.gap<12,'Fanatics +185 against a consensus near +154');
  assert.ok(!props.some(p=>p.player==='Jerry Jeudy'),'anytime TDs past +400 are skipped');
  assert.equal(props.find(p=>p.market==='First Touchdown').odds,740);
  assert.ok(props.some(p=>p.player==='Pat Freiermuth'),'5 books is enough');
  // Live: nothing until 90 minutes out, then once; the close is tracked.
  context.boards=[board('g1')];
  assert.equal(J(await run(`recordTdShadow(env,boards,${kickoff-3*3600000})`)).logged,0);
  assert.equal(J(await run(`recordTdShadow(env,boards,${kickoff-80*60000})`)).logged,3);
  books.fanatics=170;context.boards=[board('g1')];
  assert.equal(J(await run(`recordTdShadow(env,boards,${kickoff-20*60000})`)).logged,0,'once per game');
  const row=db.prepare("SELECT * FROM td_shadow WHERE player='Nick Chubb' AND market='Anytime Touchdown'").get();
  assert.deepEqual([row.odds,row.close_odds,row.source,row.team],[185,170,'live','Cleveland Browns · @ Pittsburgh Steelers']);
  // Backtest from saved odds an hour before kickoff.
  const snap=(id,t,b)=>db.prepare("INSERT INTO movement_snapshots (id,event_id,captured_at,kind,payload_json) VALUES (?,?,?,?,?)").run(`NFL--${id}|observed|${t}`,'NFL--'+id,t,'observed',JSON.stringify(b));
  books.fanatics=185;snap('g2',kickoff-65*60000,board('g2'));books.fanatics=160;snap('g2',kickoff-10*60000,board('g2'));
  assert.equal(J(await run(`backfillTdShadow(env,${kickoff-20*60000})`)).added,0,'only games that have started');
  assert.equal(J(await run(`backfillTdShadow(env,${kickoff+3600000})`)).added,1);
  const bt=db.prepare("SELECT * FROM td_shadow WHERE id='NFL--g2|Anytime Touchdown|nickchubb'").get();
  assert.deepEqual([bt.odds,bt.close_odds,bt.source],[185,160,'backtest']);
  // Grading: who scored, from the play-by-play; void if he never played.
  context.recordPlayerStats=async r=>r.player==='Pat Freiermuth'?{missingPlayerStats:true,scoreboardFinal:true}:{player:{id:1},game:{status:'Final'},scoreboardFinal:true};
  context.touchdownMarketValue=async r=>r.player==='Nick Chubb'?(r.market==='First Touchdown'?0:2):0;
  run('recordPlayerStats=globalThis.recordPlayerStats;touchdownMarketValue=globalThis.touchdownMarketValue');
  const out=J(await run(`gradeTdShadow(env,${kickoff+2*86400000})`));
  assert.equal(out.graded,6);
  const res=Object.fromEntries(db.prepare("SELECT event_id||' '||market||' '||player k,result FROM td_shadow").all().map(r=>[r.k,r.result]));
  assert.equal(res['NFL--g1 Anytime Touchdown Nick Chubb'],'won');assert.equal(res['NFL--g1 First Touchdown Nick Chubb'],'lost');
  assert.equal(res['NFL--g1 Anytime Touchdown Pat Freiermuth'],'void');
  console.log('PASS: TD props are rated against the book consensus, logged once 90 minutes out, backtested from saved odds and graded from the play-by-play');
})().catch(error=>{console.error(error);process.exit(1)});
