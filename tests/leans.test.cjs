const assert=require('node:assert/strict'),vm=require('node:vm'),{webcrypto}=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const {read}=require('./helpers/client.cjs');
// Leans: near misses and props held back by the two-a-game limit, served for
// upcoming games only, at most two a game, at the latest big-5 price.
const context=vm.createContext({URL,URLSearchParams,Request,Response,Headers,AbortSignal,Date,console,setTimeout,clearTimeout,crypto:webcrypto,TextEncoder,btoa,atob,fetch:async()=>new Response(null,{status:404})});
const template=read('worker/index.template.js');
vm.runInContext(template.slice(template.indexOf('const API_BASE')).replace('__MOVEMENT_SERVER__',read('worker/movement.js')).replace('__LIVE_SERVER__',read('worker/live.js')).replace('__STATS_SHARED__',read('dist/stats.js')).replace('__RECORDS_SERVER__',read('worker/records.js')).replace('__ACCOUNTS_SERVER__',read('worker/accounts.js')).replace('export default {','this.worker={'),context);
const db=new DatabaseSync(':memory:');
for(const f of require('node:fs').readdirSync('drizzle').filter(f=>/near_shadow/.test(f)))db.exec(read('drizzle/'+f).replaceAll('--> statement-breakpoint',''));
const wrap=(sql,args=[])=>({bind(...values){return wrap(sql,values)},async first(){return db.prepare(sql).get(...args)||null},async all(){return{results:db.prepare(sql).all(...args)}},async run(){const r=db.prepare(sql).run(...args);return{success:true,meta:{changes:Number(r.changes)}}}});
context.env={DB:{prepare:sql=>wrap(sql),async batch(list){for(const s of list)await s.run()}}};
(async()=>{
  const now=Date.parse('2026-10-11T12:00:00Z'),iso=h=>new Date(now+h*3600000).toISOString();
  const ins=db.prepare('INSERT INTO near_shadow (id,event_id,player,team,market,side,line,odds,book,edge,game_time,logged_at,close_odds) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');
  [['a1','A','P1',0.9,5,null],['a2','A','P2',0.7,5,115],['a3','A','P3',1.3,5,null],['b1','B','P4',0.6,8,null],['c1','C','P5',0.8,-1,null]]
    .forEach(([id,g,p,e,h,close])=>ins.run(id,g,p,'X · @ Y','Receptions','Over',3.5,110,'BetMGM',e,iso(h),iso(-2),close));
  const res=await vm.runInContext(`leansResponse(new Request('https://betthisguy.com/api/leans'),env,{waitUntil(){}},${now})`,context);
  const body=await res.json();
  assert.deepEqual(body.leans.map(l=>l.player),['P3','P1','P4'],'two a game (best edges first), started games left out, sorted by kickoff');
  assert.ok(!body.leans.some(l=>l.player==='P2'),'third in a game is dropped');
  db.prepare("UPDATE near_shadow SET close_odds=-105 WHERE id='a1'").run();
  const again=await (await vm.runInContext(`leansResponse(new Request('https://betthisguy.com/api/leans'),env,{waitUntil(){}},${now})`,context)).json();
  const p1=again.leans.find(l=>l.player==='P1');assert.equal(p1.odds,-105,'latest price shown');assert.equal(p1.flagged,110);
  console.log('PASS: leans serve upcoming near misses, two a game, at the latest price');
})().catch(error=>{console.error(error);process.exit(1)});
