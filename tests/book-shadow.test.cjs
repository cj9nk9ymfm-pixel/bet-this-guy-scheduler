const assert=require('node:assert/strict'),vm=require('node:vm'),{webcrypto}=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const {read}=require('./helpers/client.cjs');
// Props the 3-book rule skips (shadow): two-book disagreements, and defensive
// props priced against the player's last 10 games.
const context=vm.createContext({URL,URLSearchParams,Request,Response,Headers,AbortSignal,Date,console,setTimeout,clearTimeout,crypto:webcrypto,TextEncoder,btoa,atob,fetch:async()=>new Response(null,{status:404})});
const template=read('worker/index.template.js');
vm.runInContext(template.slice(template.indexOf('const API_BASE')).replace('__MOVEMENT_SERVER__',read('worker/movement.js')).replace('__LIVE_SERVER__',read('worker/live.js')).replace('__STATS_SHARED__',read('dist/stats.js')).replace('__RECORDS_SERVER__',read('worker/records.js')).replace('__ACCOUNTS_SERVER__',read('worker/accounts.js')).replace('export default {','this.worker={'),context);
const fs=require('node:fs'),db=new DatabaseSync(':memory:');
for(const f of fs.readdirSync('drizzle').filter(f=>/^000[0-2]_|player_form|0021_|0024_/.test(f)).sort())db.exec(read('drizzle/'+f).replaceAll('--> statement-breakpoint',''));
const wrap=(sql,args=[])=>({bind(...values){return wrap(sql,values)},async first(){return db.prepare(sql).get(...args)||null},async all(){return{results:db.prepare(sql).all(...args)}},async run(){const r=db.prepare(sql).run(...args);return{success:true,meta:{changes:Number(r.changes)}}}});
context.env={DB:{prepare:sql=>wrap(sql),async batch(list){for(const s of list)await s.run()}},BALLDONTLIE_API_KEY:'b'};
const run=code=>vm.runInContext(code,context),J=v=>JSON.parse(JSON.stringify(v));
(async()=>{
  const now=Date.parse('2026-10-11T12:00:00Z'),kick='2026-10-11T17:00:00.000Z',upd=new Date(now-60000).toISOString();
  const m=(key,player,point,over,under)=>({key,last_update:upd,outcomes:[{name:'Over',description:player,point,price:over},{name:'Under',description:player,point,price:under}]});
  const book=(key,markets)=>({key,title:key,last_update:upd,markets});
  context.boards=[{id:'g1',eventID:'NFL--g1',commence_time:kick,home_team:'Detroit Lions',away_team:'Arizona Cardinals',bookmakers:[
    // Two books on a receptions line, FanDuel well past their average.
    book('draftkings',[m('player_receptions','Sam LaPorta',4.5,-130,100),m('player_sacks','Aidan Hutchinson',0.5,120,-150),m('player_receptions','Amon-Ra St. Brown',7.5,-110,-110)]),
    book('fanduel',[m('player_receptions','Sam LaPorta',4.5,115,-145),m('player_receptions','Amon-Ra St. Brown',7.5,-110,-110)]),
    book('betrivers',[m('player_receptions','Amon-Ra St. Brown',7.5,-110,-110)]),
    book('betmgm',[m('player_solo_tackles','Jack Campbell',5.5,-110,-110)])]}];
  const form=(player,label,values)=>db.prepare('INSERT INTO player_form (id,sport,player,teams,markets,wanted_until,games_json) VALUES (?,?,?,?,?,?,?)').run(`NFL|${player}`,'NFL',player,'','[]',kick,JSON.stringify({d:[],o:[],m:{[label]:values}}));
  form('Aidan Hutchinson','Sacks',[0,0.5,1,2,1,2,2,1,0,0]);   // over 0.5 in 6 of 10 (one push)
  form('Jack Campbell','Solo Tackles',[6,5,7,4,6,5,6,3,5,6]);  // a coin flip around 5.5: no edge
  let out=J(await run(`recordBookShadow(env,boards,${now})`));
  assert.deepEqual([out.twoBook,out.defense],[1,1]);
  const rows=db.prepare('SELECT * FROM book_shadow ORDER BY kind').all().map(r=>({...r}));
  const d=rows.find(r=>r.kind==='defense'),t=rows.find(r=>r.kind==='two_book');
  assert.deepEqual([d.player,d.market,d.side,d.line,d.odds],['Aidan Hutchinson','Sacks','Over',0.5,120]);assert.equal(d.detail,'6 of 10 over · avg 0.9','a half sack on a 0.5 line is a push, not an over');
  assert.ok(d.edge>=4&&d.edge<15,'shrunk toward the book, not the raw 70%');
  assert.deepEqual([t.player,t.side,t.odds,t.book],['Sam LaPorta','Over',115,'fanduel']);
  assert.ok(!rows.some(r=>r.player==='Amon-Ra St. Brown'),'3-book props are the official engine\'s, not this test\'s');
  assert.ok(!rows.some(r=>r.player==='Jack Campbell'),'no edge, no row');
  // A player with an official pick in the game is left out.
  db.exec('DELETE FROM book_shadow');
  db.prepare("INSERT INTO public_recommendations (id,kind,sport,player,market,side,line,odds,game_id,game_time,legs_json,posted_at,status,source) VALUES ('official|2026-10-06|props|prop|x','prop','NFL','Aidan Hutchinson','Sacks','Over',0.5,120,'NFL--g1',?,'[]',?,'pending','market-verified-v2')").run(kick,new Date(now).toISOString());
  await run(`recordBookShadow(env,boards,${now})`);assert.ok(!db.prepare("SELECT 1 FROM book_shadow WHERE player='Aidan Hutchinson'").get());
  // Grading from the box score.
  context.recordPlayerStats=async rec=>({scoreboardFinal:true,receptions:rec.player==='Sam LaPorta'?6:0});run('recordPlayerStats=globalThis.recordPlayerStats');
  out=J(await run(`gradeBookShadow(env,${Date.parse(kick)+5*3600000})`));assert.equal(out.graded,1);
  assert.equal(db.prepare("SELECT result FROM book_shadow WHERE player='Sam LaPorta'").get().result,'won');
  console.log('PASS: two-book and defensive props are logged in shadow (never official players), tracked and graded');
})().catch(error=>{console.error(error);process.exit(1)});
