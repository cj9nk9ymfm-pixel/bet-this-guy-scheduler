// Market moved against a pick (Nov 25, Tim: the Edey Under went +105 to +120 after we posted). An open
// pick whose chance dropped 3+ points since it locked: the site's card and sheet say we'd pass at
// today's price (no phone ping: Tim doesn't want one). The pick stays on the record either way.
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
const run=c=>vm.runInContext(c,context),ntfy=[];
context.env={DB:{prepare:sql=>wrap(sql),async batch(l){for(const s of l)await s.run()}},ALERT_NTFY_TOPIC:'owner-topic'};
context.fetch=async(url,init={})=>{if(String(url).startsWith('https://ntfy.sh/'))ntfy.push({title:init.headers.Title,click:init.headers.Click,body:init.body});return new Response('ok')};
run('fetch=globalThis.fetch');
(async()=>{
  const now=Date.parse('2026-11-25T16:00:00Z'),tip='2026-11-26T01:10:00Z';
  db.exec("ALTER TABLE prediction_picks ADD COLUMN close_odds INTEGER");
  const pm=(id,odds,close)=>db.prepare("INSERT INTO prediction_picks (id,exchange,event_id,player,market,side,line,odds,game_time,posted_at,close_odds) VALUES (?,?,?,?,?,?,?,?,?,?,?)").run(id,'ProphetX','NBA--g1',id,'Rebounds','Under',7.5,odds,tip,'2026-11-25T11:40:00Z',close);
  pm('pm|NBA--g1|zachedey',105,120);pm('pm|NBA--g1|steady',105,108);pm('pm|NBA--g1|ourway',105,-110);
  const legs=trail=>JSON.stringify([{player:'Sb Guy',market:'Assists',side:'Over',line:5.5,odds:-110,book:'DraftKings',priceTrail:trail}]);
  db.prepare("INSERT INTO public_recommendations(id,kind,player,market,side,line,odds,game_time,legs_json,posted_at,status,source) VALUES(?,?,?,?,?,?,?,?,?,?,'pending','market-verified-v2')").run('nba|2026-11-25|props|prop|v2|sb1','prop','Sb Guy','Assists','Over',5.5,-110,tip,legs([{t:1,o:-110,l:5.5},{t:2,o:105,l:5.5}]),'2026-11-25T12:00:00Z');
  db.prepare("INSERT INTO public_recommendations(id,kind,player,market,side,line,odds,game_time,legs_json,posted_at,status,source) VALUES(?,?,?,?,?,?,?,?,?,?,'pending','market-verified-v2')").run('nba|2026-11-25|props|prop|v2|sb2','prop','Line Mover','Assists','Over',5.5,-110,tip,legs([{t:1,o:120,l:6.5}]),'2026-11-25T12:00:00Z');
  // The site's flag (same rule): extracted from dist/app.js and run on its own.
  const app=read('dist/app.js'),fn=app.slice(app.indexOf('function btgMovedAgainst'),app.indexOf('// First impression: a banner'));
  const c2=vm.createContext({Date:{now:()=>now,parse:Date.parse},JSON,Number,Math,Array});vm.runInContext(fn,c2);
  const mv=r=>vm.runInContext(`btgMovedAgainst(${JSON.stringify(r)})`,c2);
  assert.deepEqual({...mv({pm:{pct:48.8,now:45.5},game_time:tip})},{from:49,to:46},'app pick moved against');
  assert.equal(mv({pm:{pct:48.8,now:47},game_time:tip}),null,'under 3 points: no flag');
  assert.equal(mv({pm:{pct:48.8,now:45},game_time:tip,result:'won'}),null,'graded: no flag');
  assert.ok(mv({odds:-110,line:5.5,game_time:tip,legs_json:legs([{o:105,l:5.5}])}),'sportsbook price moved against');
  assert.equal(mv({odds:-110,line:5.5,game_time:tip,legs_json:legs([{o:-125,l:5.5}])}),null,'moved our way: no flag');
  console.log('PASS: market moved against a pick: the site flag on the card and sheet (3+ points, open picks only, not when it moved our way); the pick stays on the record');
})().catch(e=>{console.error(e);process.exit(1)});
