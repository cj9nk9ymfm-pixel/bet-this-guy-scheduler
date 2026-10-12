const assert=require('node:assert/strict'),vm=require('node:vm'),{webcrypto}=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const {read}=require('./helpers/client.cjs');
// Welcome sheet numbers: how many picks beat (and lost to) the kickoff price,
// and the typical posted and kickoff prices, from graded official props.
const context=vm.createContext({URL,URLSearchParams,Request,Response,Headers,AbortSignal,Date,console,setTimeout,clearTimeout,crypto:webcrypto,TextEncoder,btoa,atob});
const template=read('worker/index.template.js');
vm.runInContext(template.slice(template.indexOf('const API_BASE')).replace('__MOVEMENT_SERVER__',read('worker/movement.js')).replace('__LIVE_SERVER__',read('worker/live.js')).replace('__STATS_SHARED__',read('dist/stats.js')).replace('__RECORDS_SERVER__',read('worker/records.js')).replace('__ACCOUNTS_SERVER__',read('worker/accounts.js')).replace('export default {','this.worker={'),context);
const db=new DatabaseSync(':memory:');for(const f of ['0000_public_record.sql','0001_record_settlement.sql','0002_historical_replays.sql'])db.exec(read('drizzle/'+f).replaceAll('--> statement-breakpoint',''));
const wrap=(sql,args=[])=>({bind(...v){return wrap(sql,v)},async first(){return db.prepare(sql).get(...args)||null},async all(){return{results:db.prepare(sql).all(...args)}},async run(){db.prepare(sql).run(...args);return{success:true}}});
context.env={DB:{prepare:sql=>wrap(sql)}};
const add=(id,odds,close,result,line=1.5,closeLine=1.5)=>db.prepare("INSERT INTO public_recommendations(id,kind,player,market,side,line,odds,game_time,legs_json,posted_at,status,result,source,closing_odds,closing_line,closing_captured_at) VALUES(?,'prop','P','Receptions','Over',?,?,'2026-10-11T17:00:00Z','[]','2026-10-10T17:00:00Z','final',?,'market-verified-v2',?,?,'2026-10-11T17:00:00Z')").run(`official|2026-10-06|props|prop|${id}`,line,odds,result,close,closeLine);
add('a',125,110,'won');add('b',130,105,'lost');add('c',-110,-125,'won');add('d',150,150,'lost');add('e',120,133,'won');add('f',140,120,'won',2.5,3.5);
(async()=>{
  const s=JSON.parse(JSON.stringify(await vm.runInContext('homeSeason(env)',context)));
  assert.deepEqual([s.beat,s.tracked,s.worse],[3,5,1],'beat and worse count on the same line only');
  assert.deepEqual([s.typicalOdds,s.typicalClose],[125,110],'typical posted and kickoff prices are medians');
  const html=read('dist/index.html');
  assert.ok(html.includes('id="welcomeDialog"')&&html.includes('data-alerts-keep')&&html.includes('id="whyStrip"'),'welcome sheet, alerts button and proof strip are on the page');
  console.log('PASS: welcome sheet numbers come from graded official props (beat, worse, typical prices) and the sheet, alerts button and strip are on the page');
})().catch(e=>{console.error(e);process.exit(1)});
