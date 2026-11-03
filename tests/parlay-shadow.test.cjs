const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),{webcrypto}=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const {read}=require('./helpers/client.cjs');
// Parlay shadow test (Nov 3): one parlay per strategy per slate, about an hour
// before the first game, legs from different games; graded from the legs.
const context=vm.createContext({URL,URLSearchParams,Request,Response,Headers,AbortSignal,Date,console,setTimeout,clearTimeout,crypto:webcrypto,TextEncoder,btoa,atob,fetch:async()=>Response.json({})});
const template=read('worker/index.template.js');
vm.runInContext(template.slice(template.indexOf('const API_BASE')).replace('__MOVEMENT_SERVER__',()=>read('worker/movement.js')).replace('__LIVE_SERVER__',()=>read('worker/live.js')).replace('__STATS_SHARED__',()=>read('dist/stats.js')).replace('__RECORDS_SERVER__',()=>read('worker/records.js')).replace('__ACCOUNTS_SERVER__',()=>read('worker/accounts.js')).replace('export default {','this.worker={'),context);
const db=new DatabaseSync(':memory:');
for(const f of fs.readdirSync('drizzle').filter(f=>/^\d{4}_.*\.sql$/.test(f)).sort())try{db.exec(read('drizzle/'+f).replaceAll('--> statement-breakpoint',''))}catch{}
const wrap=(sql,args=[])=>({bind(...values){return wrap(sql,values)},async first(){return db.prepare(sql).get(...args)||null},async all(){return{results:db.prepare(sql).all(...args)}},async run(){const r=db.prepare(sql).run(...args);return{success:true,meta:{changes:Number(r.changes)}}}});
context.env={DB:{prepare:sql=>wrap(sql),async batch(l){for(const s of l)await s.run()}},BALLDONTLIE_API_KEY:'k'};
const run=code=>vm.runInContext(code,context);
(async()=>{
  const T=i=>`2026-11-04T0${i}:10:00.000Z`,ins=(id,g,i,side,odds,edge,pin,closeFair)=>db.prepare("INSERT INTO sharp_shadow (id,sport,event_id,player,market,side,line,odds,book,edge,game_time,logged_at,pin_fair,pin_edge,close_odds,close_fair) VALUES (?,'NBA',?,?,'Points',?,20.5,?,'b',?,?,'2026-11-03T20:00:00.000Z',?,?,?,?)").run(id,g,id,side,odds,edge,T(i),pin==null?null:50,pin,odds,closeFair);
  ins('a','g1',0,'Under',110,3,2,51);ins('b','g1',0,'Over',-120,2,1,57);ins('c','g2',1,'Under',105,2,1.5,50.5);ins('d','g3',1,'Over',150,4,null,44);ins('e','g4',2,'Under',-110,1.5,-1,54);ins('f','g5',2,'Over',120,1.2,3,47);
  const at=Date.parse(T(0))-50*60000;
  assert.equal((await run(`recordParlayShadow(env,${Date.parse(T(0))-2*3600000})`)).logged,0,'not two hours out');
  await run(`recordParlayShadow(env,${at})`);
  const got=Object.fromEntries(db.prepare('SELECT strategy,legs_json FROM parlay_shadow').all().map(r=>[r.strategy,JSON.parse(r.legs_json).map(l=>l.id)]));
  assert.deepEqual(got.sharp2,['f','a'],'sharp agrees, best sharp edge first, one leg a game');
  assert.deepEqual(got.unders2,['a','c'],'Unders with a sharp price');assert.deepEqual(got.nopin2,undefined,'only one unpriced leg: no parlay');
  assert.ok(got.edge2.length===2&&new Set(got.edge2).size===2,'biggest edge, different games');
  assert.equal((await run(`recordParlayShadow(env,${at+600000})`)).logged>=0,true);assert.equal(db.prepare('SELECT COUNT(*) n FROM parlay_shadow').get().n,Object.keys(got).length,'once per slate and strategy');
  // Grading: a loss loses; a void leg drops out; all legs in.
  db.prepare("UPDATE sharp_shadow SET result='won' WHERE id IN ('a','f')").run();db.prepare("UPDATE sharp_shadow SET result='void' WHERE id='c'").run();db.prepare("UPDATE sharp_shadow SET result='lost' WHERE id IN ('b','d','e')").run();
  await run(`gradeParlayShadow(env,${Date.parse(T(2))+6*3600000})`);
  const g=Object.fromEntries(db.prepare('SELECT strategy,result,payout FROM parlay_shadow').all().map(r=>[r.strategy,[r.result,r.payout]]));
  assert.deepEqual(g.sharp2,['won',+(2.1*2.2).toFixed(4)]);assert.deepEqual(g.unders2,['won',2.1],'void leg drops: a single at +110');
  console.log('PASS: parlay shadow (one parlay per strategy per slate an hour out, legs from different games; graded from the legs, void legs dropped)');
})().catch(e=>{console.error(e);process.exit(1)});
