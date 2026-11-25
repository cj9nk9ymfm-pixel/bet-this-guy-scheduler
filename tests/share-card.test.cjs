// Share card (Nov 25, Tim): every pick as a ready-to-share image, wide and square, with when it
// locked, the kickoff, the price and book, and his last 5 against the line; graded picks show
// the result. Built from the saved pick and its matchup; nothing posts.
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),{webcrypto}=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const {read}=require('./helpers/client.cjs');
const context=vm.createContext({URL,URLSearchParams,Request,Response,Headers,FormData,AbortSignal,Date,console,setTimeout,clearTimeout,crypto:webcrypto,TextEncoder,btoa,atob,BigInt,fetch:async()=>new Response('{}',{status:404})});
const template=read('worker/index.template.js');
vm.runInContext(template.slice(template.indexOf('const API_BASE')).replace('__MOVEMENT_SERVER__',read('worker/movement.js')).replace('__LIVE_SERVER__',read('worker/live.js')).replace('__STATS_SHARED__',read('dist/stats.js')).replace('__RECORDS_SERVER__',()=>read('worker/records.js')).replace('__ACCOUNTS_SERVER__',read('worker/accounts.js')).replace('export default {','this.worker={'),context);
const db=new DatabaseSync(':memory:');
for(const f of ['0000_public_record.sql','0001_record_settlement.sql','0002_historical_replays.sql'])db.exec(read('drizzle/'+f).replaceAll('--> statement-breakpoint',''));
db.exec('CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)');
db.exec('CREATE TABLE prediction_picks (id TEXT PRIMARY KEY, exchange TEXT, event_id TEXT, player TEXT, team TEXT, market TEXT, side TEXT, line REAL, odds INTEGER, net_odds INTEGER, game_time TEXT, posted_at TEXT, result TEXT, void_reason TEXT, graded_at TEXT, actual REAL)');
const wrap=(sql,args=[])=>({bind(...v){return wrap(sql,v)},async first(){return db.prepare(sql).get(...args)||null},async all(){return{results:db.prepare(sql).all(...args)}},async run(){const r=db.prepare(sql).run(...args);return{success:true,meta:{changes:Number(r.changes)}}}});
const run=c=>vm.runInContext(c,context);
context.env={DB:{prepare:sql=>wrap(sql),async batch(l){for(const s of l)await s.run()}}};
context.playerHeadshot=async()=>null;
(async()=>{
  const id='official|2026-11-24|props|prop|v2|higbee';
  db.prepare("INSERT INTO public_recommendations(id,kind,player,market,side,line,odds,game_time,legs_json,posted_at,status,source) VALUES(?,?,?,?,?,?,?,?,?,?,'pending','market-verified-v2')").run(id,'prop','Tyler Higbee','Receptions','Under',3.5,-110,'2026-11-26T01:00:00.000Z',JSON.stringify([{player:'Tyler Higbee',market:'Receptions',side:'Under',line:3.5,odds:-110,book:'DraftKings',team:'Green Bay Packers · @ Los Angeles Rams'}]),'2026-11-25T14:50:40.743Z');
  db.prepare("INSERT INTO app_settings (key,value) VALUES (?,?)").run(`matchup:${id}`,JSON.stringify({logs:[3,1,1,2,4,5,5].map(v=>({v}))}));
  context.id=id;const d=await run('shareCardData(env,id)');
  assert.equal(d.locked,'LOCKED WED 9:50 AM ET');assert.equal(d.kick,'PACKERS @ RAMS · KICKOFF 8:00 PM ET');assert.equal(d.ahead,'10 hours before kickoff');
  assert.deepEqual([...d.vals],[4,2,1,1,3],'last 5, oldest first');assert.equal(d.hits,4);assert.equal(d.price,'-110');assert.equal(d.where,'at DraftKings');
  context.d=d;const wide=run("shareCardSvg(d,'wide')"),sq=run("shareCardSvg(d,'square')");
  for(const svg of [wide,sq]){assert.match(svg,/LOCKED WED 9:50 AM ET/);assert.match(svg,/Tyler Higbee/);assert.match(svg,/Under 3\.5 receptions/);assert.match(svg,/UNDER IN 4 OF HIS LAST 5/);assert.match(svg,/betthisguy\.com/)}
  assert.match(wide,/width="1200" height="675"/);assert.match(sq,/width="1080" height="1080"/);
  // Graded: the result instead of "Locked".
  db.prepare("UPDATE public_recommendations SET result='won',status='final',legs_json=? WHERE id=?").run(JSON.stringify([{player:'Tyler Higbee',market:'Receptions',side:'Under',line:3.5,odds:-110,book:'DraftKings',team:'Green Bay Packers · @ Los Angeles Rams',actualValue:2}]),id);
  context.d=await run('shareCardData(env,id)');assert.match(run("shareCardSvg(d,'square')"),/WON · FINAL 2/);
  // App picks: the chance on the app.
  db.prepare("INSERT INTO prediction_picks (id,exchange,event_id,player,team,market,side,line,odds,game_time,posted_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").run('pm|NBA--g1|zachedey','ProphetX','NBA--g1','Zach Edey','Los Angeles Clippers · @ Memphis Grizzlies','Rebounds','Under',7.5,105,'2026-11-26T01:10:00.000Z','2026-11-25T11:40:40.000Z');
  context.id='pm|NBA--g1|zachedey';const p=await run('shareCardData(env,id)');assert.equal(p.price,'49%');assert.equal(p.where,'on ProphetX');assert.match(p.kick,/CLIPPERS @ GRIZZLIES · TIP-OFF 8:10 PM ET/);assert.equal(p.vals.length,0,'no saved games: no chart');
  context.d=p;assert.doesNotMatch(run("shareCardSvg(d,'wide')"),/OF HIS LAST/);
  // Record card (Nov 25): the /record preview image with live records and the closing-price share.
  db.prepare("UPDATE prediction_picks SET result='won' WHERE id='pm|NBA--g1|zachedey'").run();
  const rc=await run('recordCardData(env)');assert.deepEqual({nfl:{...rc.nfl},apps:{...rc.apps}},{nfl:{w:1,l:0},apps:{w:1,l:0}});
  context.rc=rc;const rsvg=run('recordCardSvg(rc)');assert.match(rsvg,/The full record\./);assert.match(rsvg,/NFL picks/);assert.match(rsvg,/betthisguy\.com\/record/);assert.match(rsvg,/width="1200" height="630"/);
  if(process.env.SHARE_OUT){const {Resvg,initWasm}=require('@resvg/resvg-wasm');await initWasm(fs.readFileSync('node_modules/@resvg/resvg-wasm/index_bg.wasm'));const fontBuffers=["SpaceGrotesk-Bold","Inter-ExtraBold","Inter-SemiBold"].map(n=>fs.readFileSync(`worker/fonts/${n}.ttf`));
    for(const [n,svg] of [['wide',wide],['square',sq],['record',run('recordCardSvg(rc)')]])fs.writeFileSync(`${process.env.SHARE_OUT}/share-${n}.png`,new Resvg(svg,{fitTo:{mode:'original'},font:{fontBuffers,loadSystemFonts:false,defaultFontFamily:'BTG Inter SB'}}).render().asPng())}
  // /record goes to the results page, tracked.
  const red=await run("worker.fetch(new Request('https://betthisguy.com/record'),env,{waitUntil(){}})");assert.equal(red.status,301);assert.equal(red.headers.get('location'),'https://betthisguy.com/trust?utm_source=record');
  console.log('PASS: share card: lock time, kickoff, price and book, last 5 against the line, wide and square; graded picks show the result; app picks show the chance; the /record preview card and short link');
})().catch(e=>{console.error(e);process.exit(1)});
