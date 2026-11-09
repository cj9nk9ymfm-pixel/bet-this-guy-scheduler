// Pick tests (Nov 9, Tim): each open official single logs its book, how far ahead it
// posted and the sharp book's view (DraftKings test), and, posted 3+ hours early, whether
// the price still qualifies about 2 hours before the game (late-confirm test). Logged only.
// The top pick ranks on what wins (close to the game, not DraftKings, winning stat types).
const assert=require('node:assert/strict'),vm=require('node:vm'),{webcrypto}=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const {read}=require('./helpers/client.cjs');
const context=vm.createContext({URL,URLSearchParams,Request,Response,Headers,AbortSignal,Date,console,setTimeout,clearTimeout,crypto:webcrypto,TextEncoder,btoa,atob,fetch:async()=>new Response(null,{status:404})});
const template=read('worker/index.template.js');
vm.runInContext(template.slice(template.indexOf('const API_BASE')).replace('__MOVEMENT_SERVER__',read('worker/movement.js')).replace('__LIVE_SERVER__',read('worker/live.js')).replace('__STATS_SHARED__',read('dist/stats.js')).replace('__RECORDS_SERVER__',read('worker/records.js')).replace('__ACCOUNTS_SERVER__',read('worker/accounts.js')).replace('export default {','this.worker={'),context);
const db=new DatabaseSync(':memory:');
for(const f of ['0000_public_record.sql','0001_record_settlement.sql','0002_historical_replays.sql','0006_push_alerts.sql','0038_sharp_shadow.sql','0039_sharp_spread.sql','0040_teammate_move.sql','0041_sharp_devig.sql'])db.exec(read('drizzle/'+f).replaceAll('--> statement-breakpoint',''));
const wrap=(sql,args=[])=>({bind(...values){return wrap(sql,values)},async first(){return db.prepare(sql).get(...args)||null},async all(){return{results:db.prepare(sql).all(...args)}},async run(){const r=db.prepare(sql).run(...args);return{success:true,meta:{changes:Number(r.changes)}}}});
context.env={DB:{prepare:sql=>wrap(sql),async batch(list){for(const s of list)await s.run()}}};
const run=code=>vm.runInContext(code,context);
(async()=>{
  const now=Date.parse('2026-10-08T12:00:00Z'),fresh=new Date(now-60000).toISOString(),kickoff=new Date(now+2*3600000).toISOString();
  const market=(key,player,over,under,point)=>({key,last_update:fresh,outcomes:[{name:'Over',description:player,point,price:over},{name:'Under',description:player,point,price:under}]});
  const props=(soft)=>[['fanduel','FanDuel'],['betmgm','BetMGM'],['williamhill_us','Caesars'],['draftkings','DraftKings']].map(([key,title])=>({key,title,last_update:fresh,markets:Object.entries(soft).map(([player,[mk,point,over,under]])=>key==='draftkings'?market(mk,player,over,under,point):market(mk,player,-110,-110,point))}));
  context.boards=[{id:'evt1',eventID:'NFL--evt1',sport_label:'NFL',commence_time:kickoff,home_team:'Pittsburgh Steelers',away_team:'Cleveland Browns',bookmakers:props({'Nick Chubb':['player_rush_yds',62.5,110,-120]})}];
  const leg=JSON.stringify([{player:'Nick Chubb',market:'Rushing Yards',side:'Over',line:62.5,odds:110,book:'DraftKings',edge:1.8,gameId:'NFL--evt1'}]);
  for(const [id,posted] of [['official|2026-10-06|props|prop|v2|early',new Date(now-10*3600000).toISOString()],['official|2026-10-06|props|prop|v2|late',new Date(now-30*60000).toISOString()]])
    db.prepare("INSERT INTO public_recommendations (id,kind,player,market,side,line,odds,game_id,game_time,legs_json,posted_at,status,result,source) VALUES (?,?,?,?,?,?,?,?,?,?,?,'pending',NULL,'market-verified-v2')").run(id,'prop','Nick Chubb','Rushing Yards','Over',62.5,110,'NFL--evt1',kickoff,leg,posted);
  db.prepare("INSERT INTO sharp_shadow (id,sport,event_id,player,market,side,line,odds,edge,pin_fair,pin_edge,game_time,logged_at) VALUES ('s1','NFL','NFL--evt1','Nick Chubb','Rushing Yards','Over',62.5,110,1.8,47.0,-0.6,?,?)").run(kickoff,new Date(now-11*3600000).toISOString());
  context.existing=db.prepare('SELECT * FROM public_recommendations').all();
  const out=await run(`recordPickTests(env,boards,existing,${now})`);assert.equal(out.logged,2);
  const t=id=>JSON.parse(db.prepare('SELECT value FROM app_settings WHERE key=?').get('pick-test:'+id).value);
  const early=t('official|2026-10-06|props|prop|v2|early'),late=t('official|2026-10-06|props|prop|v2|late');
  assert.deepEqual([early.book,early.sharp,early.lead],['DraftKings','disagree',12],'book, sharp view and how early it posted');
  assert.equal(early.late.still,true,'posted 12 hours early, still 1%+ two hours out');assert.ok(early.late.edge>=1);
  assert.equal(late.late,undefined,'posted inside 3 hours: no late check');
  // Logged once.
  assert.equal((await run(`recordPickTests(env,boards,existing,${now+60000})`)).logged,0,'nothing new to log');
  // Top pick ranking: BetMGM assists posted close to tip beats a bigger DraftKings edge posted early.
  const pick=(id,book,market,edge,lead)=>({id,market,game_time:new Date(now+3600000).toISOString(),posted_at:new Date(now+3600000-lead*3600000).toISOString(),legs_json:JSON.stringify([{book,market,edge}])});
  context.a=pick('nba|x|1','BetMGM','Assists',1.1,2);context.b=pick('nba|x|2','DraftKings','Points',2.9,20);
  assert.ok(run('pickRank(a)>pickRank(b)'),'what wins ranks first, not the biggest edge');
  console.log('PASS: pick tests: book, lead and sharp view logged per pick, the 2-hours-out re-check for early picks, and the top pick ranked on what wins');
})().catch(e=>{console.error(e);process.exit(1)});
