// The daily slate card v2 (Nov 14, Tim): "Tonight's picks" or "Today's picks" before 3 PM ET,
// the counts, the gold sticker (last 3 nights when winning, else the season), every pick by game
// with an OVER / UNDER chip, sportsbook and prediction apps. Same card for NBA and NFL.
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
context.env={DB:{prepare:sql=>wrap(sql),async batch(l){for(const s of l)await s.run()}}};
const run=c=>vm.runInContext(c,context);
context.playerHeadshot=async()=>({type:'image/png',bytes:new Uint8Array([1,2,3])});
const legs=(player,side,line,market,odds,team,book,t)=>JSON.stringify([{player,side,line,market,odds,team,book,gameTime:t}]);
const ins=db.prepare("INSERT INTO public_recommendations (id,source,kind,player,side,line,market,odds,game_time,posted_at,result,legs_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)");
// Three graded nights before tonight: 7-2, 8-0, 6-1, and a cold night before them.
let n=0;for(const [d,w,l] of [['2026-11-09',7,2],['2026-11-08',8,0],['2026-11-07',6,1],['2026-11-06',0,6]])for(let i=0;i<w+l;i++)ins.run(`nba|${d}|g${n++}`,'market-verified-v2','prop','P','Over',1.5,'Points',-110,`${d}T23:30:00Z`,`${d}T20:00:00Z`,i<w?'won':'lost','[]');
const t1='2026-11-11T00:40:00Z',t2='2026-11-11T03:10:00Z';
const sb=[['OG Anunoby','Under',5.5,'Rebounds',-108,'Milwaukee Bucks · @ New York Knicks','DraftKings',t1],['Domantas Sabonis','Under',5.5,'Assists',109,'Orlando Magic · @ Sacramento Kings','DraftKings',t2]].map(([p,s,l,m,o,team,b,t],i)=>({id:`nba|2026-11-10|${i}`,kind:'prop',player:p,side:s,line:l,market:m,odds:o,game_time:t,legs_json:legs(p,s,l,m,o,team,b,t)}));
const pm=[{id:'pm1',player:'Kyle Kuzma',side:'Over',line:4.5,market:'Rebounds',odds:-104,team:'Milwaukee Bucks · @ New York Knicks',exchange:'Novig',game_time:t1}];
(async()=>{
  context.args={sport:'NBA',first:Date.parse(t1),sbRows:sb,pmRows:pm,day:'2026-11-10'};
  const svg=await run('slate2Card(env,args)');
  assert.match(svg,/NBA · TUESDAY, NOV 10/);assert.match(svg,/Tonight&#39;s picks/);
  assert.match(svg,/3 picks/);assert.match(svg,/2 sportsbook/);assert.match(svg,/1 prediction app</);
  assert.match(svg,/LAST 3 NIGHTS[\s\S]*21–3/,'winning run: the last 3 nights');
  assert.ok(svg.indexOf('BUCKS @ KNICKS')<svg.indexOf('MAGIC @ KINGS'),'games in tip order');
  assert.match(svg,/7:40 PM ET/);assert.match(svg,/>UNDER</);assert.match(svg,/>OVER</);assert.match(svg,/-108/);assert.match(svg,/51%/);
  assert.match(svg,/Novig · app/);assert.equal((svg.match(/<image /g)||[]).length,3,'a headshot for every pick, apps included');
  assert.match(svg,/Locked before tip-off · 21\+ · apps 18\+\/21\+/);
  // A cold run: the season instead. An afternoon NFL slate: "Today's picks", kickoff wording, no apps line.
  for(let i=0;i<20;i++)ins.run(`official|2026-11-09|c${i}`,'market-verified-v2','prop','P','Over',1.5,'Points',-110,'2026-11-09T18:00:00Z','2026-11-09T12:00:00Z',i<4?'won':'lost','[]');
  for(let i=0;i<5;i++)ins.run(`official|2026-11-02|w${i}`,'market-verified-v2','prop','P','Over',1.5,'Points',-110,'2026-11-02T18:00:00Z','2026-11-02T12:00:00Z','won','[]');
  context.args={sport:'NFL',first:Date.parse('2026-11-15T18:00:00Z'),sbRows:[{...sb[0],player:'James Cook',side:'Over',line:0.5,market:'Anytime Touchdown',legs_json:legs('James Cook','Over',0.5,'Anytime Touchdown',120,'Buffalo Bills · @ Miami Dolphins','FanDuel','2026-11-15T18:00:00Z')}],pmRows:[],day:'11/15/2026'};
  const nfl=await run('slate2Card(env,args)');
  assert.match(nfl,/Today&#39;s picks/);assert.match(nfl,/NFL SEASON[\s\S]*9–16/);assert.match(nfl,/>YES</);assert.match(nfl,/Anytime Touchdown/);
  assert.match(nfl,/Locked before kickoff · 21\+</);assert.doesNotMatch(nfl,/prediction app/);
  // Long slates stop at 14 rows with a "+N more" line.
  const many=Array.from({length:17},(_,i)=>({...sb[0],id:`nba|2026-11-10|m${i}`,player:`Player ${i}`}));
  context.args={sport:'NBA',first:Date.parse(t1),sbRows:many,pmRows:[],day:'2026-11-10'};
  assert.match(await run('slate2Card(env,args)'),/\+3 more picks at betthisguy.com/);
  console.log('PASS: slate card v2: headline by start time, counts, sticker, games by tip, chips, faces, NFL wording, overflow');
})().catch(e=>{console.error(e);process.exit(1)});
