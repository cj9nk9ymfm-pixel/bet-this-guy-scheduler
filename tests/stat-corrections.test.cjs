const assert=require('node:assert/strict'),vm=require('node:vm'),{webcrypto}=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const {read}=require('./helpers/client.cjs');
// Stat corrections: for 48 hours after a pick settles, its box score is
// re-read every 2 hours. A changed stat is noted on the leg; the record's
// result never changes.
const context=vm.createContext({URL,URLSearchParams,Request,Response,Headers,AbortSignal,Date,console,setTimeout,clearTimeout,crypto:webcrypto,TextEncoder,btoa,atob});
const template=read('worker/index.template.js');
vm.runInContext(template.slice(template.indexOf('const API_BASE')).replace('__MOVEMENT_SERVER__',read('worker/movement.js')).replace('__LIVE_SERVER__',read('worker/live.js')).replace('__STATS_SHARED__',read('dist/stats.js')).replace('__RECORDS_SERVER__',read('worker/records.js')).replace('__ACCOUNTS_SERVER__',read('worker/accounts.js')).replace('export default {','this.worker={'),context);
const db=new DatabaseSync(':memory:');
for(const f of ['0000_public_record.sql','0001_record_settlement.sql','0002_historical_replays.sql'])db.exec(read('drizzle/'+f).replaceAll('--> statement-breakpoint',''));
const wrap=(sql,args=[])=>({bind(...values){return wrap(sql,values)},async first(){return db.prepare(sql).get(...args)||null},async all(){return{results:db.prepare(sql).all(...args)}},async run(){const r=db.prepare(sql).run(...args);return{success:true,meta:{changes:Number(r.changes)}}}});
context.env={DB:{prepare:sql=>wrap(sql),async batch(list){for(const s of list)await s.run()}},BALLDONTLIE_API_KEY:'k'};
const run=code=>vm.runInContext(code,context);
(async()=>{
  const now=Date.parse('2026-10-24T12:00:00Z'),settled='2026-10-24T02:01:03.105Z',game='2026-10-23T23:10:00.000Z';
  const leg={player:'Obi Toppin',market:'Rebounds',side:'Under',line:4.5,odds:120,sport:'NBA',gameTime:game,team:'Dallas Mavericks · @ Indiana Pacers',book:'BetMGM',result:'won',actualValue:4,boxScoreFinal:true};
  const cols=db.prepare("SELECT name FROM pragma_table_info('public_recommendations')").all().map(c=>c.name);
  const row={id:'nba|toppin',kind:'prop',sport:'NBA',player:'Obi Toppin',market:'Rebounds',side:'Under',line:4.5,odds:120,game_time:game,legs_json:JSON.stringify([leg]),posted_at:'2026-10-23T18:41:03.620Z',status:'final',result:'won',settled_at:settled,created_at:settled,source:'market-verified-v2'};
  const keys=Object.keys(row).filter(k=>cols.includes(k));
  db.prepare(`INSERT INTO public_recommendations (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`).run(...keys.map(k=>row[k]));
  const legOf=()=>JSON.parse(db.prepare('SELECT legs_json FROM public_recommendations').get().legs_json)[0];
  let reb=4,lookups=0;context.reb=()=>reb;context.count=()=>lookups++;
  run('recordPlayerStats=async()=>{count();return {reb:reb(),min:"25",scoreboardFinal:true}}');
  // Same stat: nothing noted.
  assert.equal(JSON.parse(JSON.stringify(await run(`recheckSettledRecords(env,${now})`))).corrected,0);
  assert.equal(legOf().correctedValue,undefined);assert.ok(legOf().recheckedAt);
  // A rebound added after grading: noted, and what it would have given.
  reb=5;
  assert.equal(JSON.parse(JSON.stringify(await run(`recheckSettledRecords(env,${now+3600000})`))).checked,0,'re-checked at most every 2 hours');
  assert.equal(JSON.parse(JSON.stringify(await run(`recheckSettledRecords(env,${now+2*3600000})`))).corrected,1);
  let r=db.prepare('SELECT status,result FROM public_recommendations').get();
  assert.deepEqual([r.status,r.result],['final','won'],'the result stays as first graded');
  assert.deepEqual([legOf().actualValue,legOf().correctedValue,legOf().correctedResult],[4,5,'lost']);
  // Unchanged on the next look: not counted again.
  assert.equal(JSON.parse(JSON.stringify(await run(`recheckSettledRecords(env,${now+4*3600000})`))).corrected,0);
  assert.equal(legOf().correctedValue,5);
  // Past 48 hours from settling: no more look-ups.
  const before=lookups;await run(`recheckSettledRecords(env,${Date.parse(settled)+49*3600000})`);assert.equal(lookups,before);
  console.log('PASS: settled picks re-checked for 48 hours (every 2 hours); a corrected stat is noted with the result it would give, the result itself never changes');
})().catch(e=>{console.error(e);process.exit(1)});
