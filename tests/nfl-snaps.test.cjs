// NFL snap counts (Nov 23, Tim): a player missing from the box score is graded by his snaps:
// snaps but no stat counts (0); no snaps is no action; not in the snap file yet waits.
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
for(const f of ['0028_prediction_picks.sql','0032_prediction_early.sql','0036_void_reason.sql'])try{db.exec(read('drizzle/'+f).replaceAll('--> statement-breakpoint',''))}catch(e){}
context.env={BALLDONTLIE_API_KEY:'k',DB:{prepare:sql=>wrap(sql),async batch(l){for(const s of l)await s.run()}}};
const run=c=>vm.runInContext(c,context);
const CSV=['game_id,pfr_game_id,season,game_type,week,player,pfr_player_id,position,team,opponent,offense_snaps,offense_pct,defense_snaps,defense_pct,st_snaps,st_pct',
 '2026_10_JAX_TEN,202611150oti,2026,REG,10,Nate Boerkircher,BoerNa00,TE,JAX,TEN,36,0.49,0,0,6,0.2',
 '2026_11_JAX_NYG,202611220nyg,2026,REG,11,Nate Boerkircher,BoerNa00,TE,JAX,NYG,22,0.31,0,0,0,0',
 '2026_10_JAX_TEN,202611150oti,2026,REG,10,Benchy McBench,BencBe00,WR,JAX,TEN,5,0.07,0,0,10,0.3',
 '2026_11_JAX_NYG,202611220nyg,2026,REG,11,Trevor Lawrence,LawrTr00,QB,JAX,NYG,70,1,0,0,0,0'].join('\n');
let fetches=0;context.fetch=async url=>{if(String(url).includes('snap_counts_2026.csv')){fetches++;return new Response(CSV)}return new Response('{}',{status:404})};run('fetch=globalThis.fetch');
(async()=>{
  const g='2026-11-22T21:25:00.000Z';
  assert.deepEqual(JSON.parse(JSON.stringify(await run(`nflSnaps('Nate Boerkircher','${g}')`))),{known:true,snaps:22,team:'JAX'},'played: his snaps');
  assert.deepEqual(JSON.parse(JSON.stringify(await run(`nflSnaps('Benchy McBench','${g}')`))),{known:true,snaps:0,team:'JAX'},'his team played, he is not listed: 0 snaps');
  assert.equal((await run(`nflSnaps('Nate Boerkircher','2026-11-29T18:00:00.000Z')`)).known,false,'game not in the file yet');
  assert.equal(fetches,1,'the file is fetched once and cached');
  // Prediction-app grading: no box-score row, so the snaps decide.
  const ins=db.prepare("INSERT INTO prediction_picks (id,exchange,event_id,player,team,market,side,line,odds,net_odds,game_time,posted_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)");
  ins.run('pm|a','Novig','NFL--x','Nate Boerkircher','Jacksonville Jaguars · @ New York Giants','Receiving Yards','Over',11.5,108,108,g,g);
  ins.run('pm|b','Novig','NFL--x','Benchy McBench','Jacksonville Jaguars · @ New York Giants','Receptions','Over',1.5,108,108,g,g);
  ins.run('pm|c','Novig','NFL--y','Nate Boerkircher','Jacksonville Jaguars · @ Houston Texans','Receptions','Over',1.5,108,108,'2026-11-29T18:00:00.000Z','2026-11-29T12:00:00.000Z');
  context.recordPlayerStats=async()=>({game:{},scoreboardFinal:true,scoreboardState:'final',missingPlayerStats:true,boxMatches:0,boxRowCount:40});
  await run(`gradePredictionPicks(env,${Date.parse(g)+10*3600000})`);
  const row=id=>db.prepare('SELECT result,actual,void_reason FROM prediction_picks WHERE id=?').get(id);
  assert.equal(row('pm|a').result,'lost','22 snaps, no catch: the bet counts');assert.equal(row('pm|a').actual,0);
  assert.equal(row('pm|b').result,'void','not on the field: no action');assert.equal(row('pm|b').void_reason,'Did not play');
  await run(`gradePredictionPicks(env,${Date.parse('2026-11-29T18:00:00.000Z')+10*3600000})`);
  assert.equal(row('pm|c').result,null,'waits for the snap file');
  console.log('PASS: NFL snap counts: played without a stat counts (0), not on the field is no action, waits until the game is in the snap file');
})().catch(e=>{console.error(e);process.exit(1)});
