const assert=require('node:assert/strict'),vm=require('node:vm'),{webcrypto}=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const {read}=require('./helpers/client.cjs');
// Injuries: the ESPN report is parsed and stored, Out/Doubtful players are
// taken off pick boards, and teammates of an out receiver or back are logged
// for the usage-bump test.
const context=vm.createContext({URL,URLSearchParams,Request,Response,Headers,AbortSignal,Date,console,setTimeout,clearTimeout,crypto:webcrypto,TextEncoder,btoa,atob,fetch:async()=>new Response(null,{status:404})});
const template=read('worker/index.template.js');
vm.runInContext(template.slice(template.indexOf('const API_BASE')).replace('__MOVEMENT_SERVER__',read('worker/movement.js')).replace('__LIVE_SERVER__',read('worker/live.js')).replace('__STATS_SHARED__',read('dist/stats.js')).replace('__RECORDS_SERVER__',read('worker/records.js')).replace('__ACCOUNTS_SERVER__',read('worker/accounts.js')).replace('export default {','this.worker={'),context);
const db=new DatabaseSync(':memory:');
for(const f of ['0006_push_alerts.sql','0018_player_form.sql','0021_injuries.sql'])db.exec(read('drizzle/'+f).replaceAll('--> statement-breakpoint',''));
const wrap=(sql,args=[])=>({bind(...values){return wrap(sql,values)},async first(){return db.prepare(sql).get(...args)||null},async all(){return{results:db.prepare(sql).all(...args)}},async run(){const r=db.prepare(sql).run(...args);return{success:true,meta:{changes:Number(r.changes)}}}});
context.env={DB:{prepare:sql=>wrap(sql),async batch(list){for(const s of list)await s.run()}},BALLDONTLIE_API_KEY:'test'};
const run=code=>vm.runInContext(code,context),J=v=>JSON.parse(JSON.stringify(v));
(async()=>{
  const now=Date.parse('2026-10-11T15:40:00Z'),kickoff=Date.parse('2026-10-11T17:00:00Z');
  const feed={injuries:[{displayName:'Pittsburgh Steelers',injuries:[
    {status:'Out',date:'2026-10-10T20:00Z',athlete:{displayName:'DK Metcalf',position:{abbreviation:'WR'},team:{displayName:'Pittsburgh Steelers'}},details:{type:'Hamstring',side:'Not Specified'}},
    {status:'Questionable',athlete:{displayName:'Jaylen Warren',position:{abbreviation:'RB'}},details:{type:'Ankle'}},
    {status:'Doubtful',athlete:{displayName:'Pat Freiermuth',position:{abbreviation:'TE'}}}]}]};
  let calls=0;context.fetch=async url=>{calls++;assert.ok(String(url).includes('espn.com'));return Response.json(feed)};run('fetch=globalThis.fetch');
  assert.deepEqual(J(await run(`refreshInjuries(env,${now})`)),{rows:3});
  assert.deepEqual(J(await run(`refreshInjuries(env,${now+5*60000})`)),{skipped:true},'not again within the refresh gap');
  assert.equal(calls,1);
  const metcalf=db.prepare("SELECT * FROM injuries WHERE id='NFL|dkmetcalf'").get();
  assert.deepEqual([metcalf.status,metcalf.team,metcalf.position,metcalf.detail],['Out','Pittsburgh Steelers','WR','Hamstring']);
  assert.deepEqual(['Out','Injured Reserve','Doubtful','Questionable','Active'].map(x=>run(`injuryClass(${JSON.stringify(x)})`)),['out','out','doubtful','questionable',null]);
  // Out and Doubtful players come off the boards; Questionable stays.
  const o=(p,pt,price)=>({name:'Over',description:p,point:pt,price});
  const board={id:'g1',eventID:'NFL--g1',commence_time:new Date(kickoff).toISOString(),home_team:'Pittsburgh Steelers',away_team:'Cleveland Browns',
    bookmakers:['draftkings','fanduel','betmgm'].map((key,i)=>({key,title:key,markets:[{key:'player_receptions',outcomes:[o('DK Metcalf',4.5,-110),o('Pat Freiermuth',3.5,-110),o('Jaylen Warren',2.5,-110),o('Calvin Austin III',3.5,-115+i*10),o('Roman Wilson',2.5,105)]},{key:'player_reception_yds',outcomes:[o('Calvin Austin III',38.5,-112)]}]}))};
  context.boards=[board];
  const map=await run('injuryMap(env)');context.inj=map;
  const left=J(run('withoutInjured(boards,inj)'))[0].bookmakers[0].markets[0].outcomes.map(x=>x.description);
  assert.deepEqual(left,['Jaylen Warren','Calvin Austin III','Roman Wilson']);
  // Usage bump: Metcalf (a real role) is out, so his WR/TE teammates' Overs are logged.
  const games=m=>JSON.stringify({d:[1,2,3,4,5,6].map(i=>`2026-09-0${i}`),o:[],m});
  const form=(name,team,pos,m)=>db.prepare("INSERT INTO player_form (id,sport,player,teams,markets,wanted_until,games_json,fetched_at,team,position) VALUES (?,?,?,?,?,?,?,?,?,?)").run(`NFL|${name.toLowerCase().replace(/[^a-z]/g,'')}`,'NFL',name,'','[]','2026-10-11T17:00:00.000Z',games(m),now,team,pos);
  form('DK Metcalf','Pittsburgh Steelers','WR',{Receptions:[5,6,4,7,5,6]});
  form('Calvin Austin III','Pittsburgh Steelers','WR',{Receptions:[3,2,4,3,2,3]});
  form('Roman Wilson','Pittsburgh Steelers','WR',{Receptions:[1,2,1,0,2,1]});
  form('Jaylen Warren','Pittsburgh Steelers','RB',{'Rush Attempts':[10,12,9,11,10,8]});
  form('Jerry Jeudy','Cleveland Browns','WR',{Receptions:[5,4,6,5,4,5]});
  assert.equal(J(await run(`recordBumpShadow(env,withoutInjured(boards,inj),inj,${kickoff-3*3600000})`)).logged,0,'not before 90 minutes out');
  const out=J(await run(`recordBumpShadow(env,withoutInjured(boards,inj),inj,${now})`));
  assert.equal(out.logged,3,'Austin receptions + receiving yards, Wilson receptions');
  const austin=db.prepare("SELECT * FROM bump_shadow WHERE id='NFL--g1|calvinausteniii|player_receptions' OR (player='Calvin Austin III' AND market='Receptions')").get();
  assert.deepEqual([austin.line,austin.odds,austin.book,austin.trigger_player,austin.side],[3.5,-95,'betmgm','DK Metcalf','Over']);
  assert.equal(J(await run(`recordBumpShadow(env,withoutInjured(boards,inj),inj,${now+600000})`)).logged,0,'each game once');
  // Graded from the box score.
  context.recordPlayerStats=async r=>({game:{status:'Final'},scoreboardFinal:true,receptions:r.player==='Roman Wilson'?1:5,receiving_yards:61});
  run('recordPlayerStats=globalThis.recordPlayerStats');
  assert.equal(J(await run(`gradeBumpShadow(env,${kickoff+8*3600000})`)).graded,3);
  assert.deepEqual(db.prepare("SELECT player||' '||market k,result FROM bump_shadow WHERE result IN ('won','lost') ORDER BY k").all().map(r=>r.k+' '+r.result),['Calvin Austin III Receiving Yards won','Calvin Austin III Receptions won','Roman Wilson Receptions lost']);
  console.log('PASS: injuries are parsed and stored, Out/Doubtful players leave the pick boards, and teammates of an out receiver are logged and graded');
})().catch(error=>{console.error(error);process.exit(1)});
