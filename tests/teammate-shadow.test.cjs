const assert=require('node:assert/strict'),vm=require('node:vm'),{webcrypto}=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const {read}=require('./helpers/client.cjs');
// Teammate-out test: a player newly ruled Out logs each teammate's Over on
// points, rebounds and assists (main line, best big-5 price, fair chance) once,
// then tracks the closing price. Never posted.
const context=vm.createContext({URL,URLSearchParams,Request,Response,Headers,AbortSignal,Date,console,setTimeout,clearTimeout,crypto:webcrypto,TextEncoder,btoa,atob,fetch:async()=>new Response(null,{status:404})});
const t=read('worker/index.template.js');
vm.runInContext(t.slice(t.indexOf('const API_BASE')).replace('__MOVEMENT_SERVER__',read('worker/movement.js')).replace('__LIVE_SERVER__',read('worker/live.js')).replace('__STATS_SHARED__',read('dist/stats.js')).replace('__RECORDS_SERVER__',read('worker/records.js')).replace('__ACCOUNTS_SERVER__',read('worker/accounts.js')).replace('export default {','this.worker={'),context);
const db=new DatabaseSync(':memory:');
for(const f of ['0006_push_alerts.sql','0040_teammate_move.sql'].filter(f=>f!=='0040_teammate_move.sql'))db.exec(read('drizzle/'+f).replaceAll('--> statement-breakpoint',''));
db.exec("CREATE TABLE sharp_shadow (id text)");db.exec(read('drizzle/0040_teammate_move.sql').replaceAll('--> statement-breakpoint',''));
const wrap=(sql,args=[])=>({bind(...v){return wrap(sql,v)},async first(){return db.prepare(sql).get(...args)||null},async all(){return{results:db.prepare(sql).all(...args)}},async run(){const r=db.prepare(sql).run(...args);return{success:true,meta:{changes:Number(r.changes)}}}});
context.env={DB:{prepare:sql=>wrap(sql),async batch(l){for(const s of l)await s.run()}}};
const run=code=>vm.runInContext(code,context),J=v=>JSON.parse(JSON.stringify(v));
(async()=>{
  const now=Date.parse('2026-10-29T20:00:00Z'),tip=new Date(now+3*3600000).toISOString(),fresh=new Date(now-60000).toISOString();
  const mk=(key,player,line,over,under)=>({key,last_update:fresh,outcomes:[{name:'Over',description:player,point:line,price:over},{name:'Under',description:player,point:line,price:under}]});
  const books=['draftkings','fanduel','betmgm','williamhill_us'].map(key=>({key,title:key,last_update:fresh,markets:[mk('player_points','Bench Guy',12.5,key==='betmgm'?105:-110,-110),mk('player_rebounds','Bench Guy',5.5,-110,-110),mk('player_points','Rival Star',25.5,-110,-110),mk('player_points','Hurt Star',28.5,-110,-110)]}));
  context.boards=[{id:'g1',eventID:'NBA--g1',sport_label:'NBA',commence_time:tip,home_team:'Cleveland Cavaliers',away_team:'Washington Wizards',bookmakers:books}];
  context.playerTeamOf=async(env,sport,name)=>({full:name==='Rival Star'?'Washington Wizards':'Cleveland Cavaliers'});
  context.injuries=new Map([['hurtstar',{player:'Hurt Star',team:'Cleveland Cavaliers',status:'Out',reported_at:new Date(now-3600000).toISOString()}],['oldout',{player:'Old Out',team:'Cleveland Cavaliers',status:'Out',reported_at:new Date(now-5*86400000).toISOString()}]]);
  const out=J(await run(`recordTeammateShadow(env,boards,injuries,${now})`));
  assert.deepEqual([out.triggers,out.logged],[1,2],'one fresh Out; the long-term Out is not news');
  const rows=db.prepare('SELECT * FROM teammate_shadow ORDER BY market').all();
  assert.deepEqual(rows.map(r=>[r.player,r.market,r.side,r.line]),[['Bench Guy','Points','Over',12.5],['Bench Guy','Rebounds','Over',5.5]],'teammates only, Overs at the main line');
  assert.equal(rows[0].odds,105);assert.equal(rows[0].book,'betmgm');assert.ok(rows[0].fair>49&&rows[0].fair<50&&rows[0].edge>.5,'fair chance and edge at the best price');
  const again=J(await run(`recordTeammateShadow(env,boards,injuries,${now+600000})`));
  assert.equal(again.triggers,0,'each Out triggers once');assert.equal(db.prepare('SELECT close_odds FROM teammate_shadow WHERE market=?').get('Points').close_odds,105,'closing price tracked');
  console.log('PASS: teammate-out test logs teammates\' Overs once per fresh Out (main line, best big-5 price, fair), tracks the close, skips old injuries and opponents');
})().catch(e=>{console.error(e);process.exit(1)});
