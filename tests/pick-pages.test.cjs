// Pick pages (Nov 26, Tim: pages Google can find): every pick has its own page with the lock time,
// price, game, fair price, last 5 and result; player pages link to them; all are in the sitemap; the
// share and record images are allowed in robots.txt so link previews show them.
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
const ctx={waitUntil(){}};
(async()=>{
  const id='official|2026-11-24|props|prop|v2|43a097192859f92cb2b157effc62796fc97086483ac58342c223cd8ba3297518';
  db.prepare("INSERT INTO public_recommendations(id,kind,player,market,side,line,odds,game_time,legs_json,posted_at,status,result,source) VALUES(?,?,?,?,?,?,?,?,?,?,'final','won','market-verified-v2')").run(id,'prop','Tyler Higbee','Receptions','Under',3.5,-110,'2026-11-26T01:00:00.000Z',JSON.stringify([{player:'Tyler Higbee',market:'Receptions',side:'Under',line:3.5,odds:-110,book:'DraftKings',team:'Green Bay Packers · @ Los Angeles Rams',fairPower:53.6,actualValue:2}]),'2026-11-25T14:50:40.743Z');
  db.prepare("INSERT INTO app_settings (key,value) VALUES (?,?)").run(`matchup:${id}`,JSON.stringify({logs:[3,1,1,2,4].map(v=>({v}))}));
  db.prepare("INSERT INTO prediction_picks (id,exchange,event_id,player,team,market,side,line,odds,game_time,posted_at,result,actual) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").run('pm|NBA--698d6d78acf30f4ff4e4aaf6670249ee|zachedey','ProphetX','NBA--698d6d78acf30f4ff4e4aaf6670249ee','Zach Edey','Los Angeles Clippers · @ Memphis Grizzlies','Rebounds','Under',7.5,105,'2026-11-26T01:10:00.000Z','2026-11-25T11:40:40.000Z','lost',9);
  context.id=id;const path=run("pickPath({id,player:'Tyler Higbee',side:'Under',line:3.5,market:'Receptions',game_time:'2026-11-26T01:00:00.000Z'})");
  assert.equal(path,'/pick/tyler-higbee-under-3-5-receptions-2026-11-25-43a097192859');
  const page=await run(`worker.fetch(new Request('https://betthisguy.com${path}'),env,{waitUntil(){}})`);assert.equal(page.status,200);const html=await page.text();
  assert.match(html,/<title>Tyler Higbee Under 3\.5 Receptions Pick \(-110\) · Green Bay Packers @ Los Angeles Rams \| Bet This Guy<\/title>/);
  assert.match(html,/Locked on betthisguy\.com Wed, Nov 25, 9:50 AM ET, 10 hours before kickoff/);assert.match(html,/Won<\/span> · final 2 receptions/);
  assert.match(html,/3, 1, 1, 2, 4 receptions \(most recent first\): under 3\.5 in 4 of 5/);assert.match(html,/a 54% chance; DraftKings priced it at 52%/);
  assert.match(html,/og:image" content="https:\/\/betthisguy\.com\/api\/share-card\.png\?id=official%7C/);assert.match(html,/rel="canonical" href="https:\/\/betthisguy\.com\/pick\/tyler-higbee/);
  // App pick page.
  const pmPath=run("pickPath({event_id:'NBA--698d6d78acf30f4ff4e4aaf6670249ee',player:'Zach Edey',side:'Under',line:7.5,market:'Rebounds',game_time:'2026-11-26T01:10:00.000Z'},true)");
  assert.equal(pmPath,'/pick/zach-edey-under-7-5-rebounds-2026-11-25-x698d6d78ac');
  const pmHtml=await (await run(`worker.fetch(new Request('https://betthisguy.com${pmPath}'),env,{waitUntil(){}})`)).text();assert.match(pmHtml,/PREDICTION APP/);assert.match(pmHtml,/49% on ProphetX/);assert.match(pmHtml,/Lost<\/span> · final 9 rebounds/);
  // A made-up key is a 404, not a page.
  assert.equal(await run(`pickPage(new Request('https://betthisguy.com/pick/tyler-higbee-under-3-5-receptions-2026-11-25-000000000000'),env)`),null);
  // Player page links to it; the sitemap lists both; robots allows the images.
  const ph=await (await run(`worker.fetch(new Request('https://betthisguy.com/player/tyler-higbee'),env,{waitUntil(){}})`)).text();assert.ok(ph.includes(`href="${path}"`),'player page links the pick page');
  const sm=await run('weeklySitemap(env)');assert.ok(sm.includes(`https://betthisguy.com${path}`)&&sm.includes(`https://betthisguy.com${pmPath}`),'pick pages in the sitemap');assert.ok(!sm.includes('/player/tyler-higbee<'),'player pages still need 3 graded picks (thin ones stay noindex)');
  const robots=await (await run(`worker.fetch(new Request('https://betthisguy.com/robots.txt'),env,{waitUntil(){}})`)).text();assert.match(robots,/Allow: \/api\/share-card\.png[\s\S]*Allow: \/api\/record-card\.png[\s\S]*Disallow: \/api\//);
  console.log('PASS: pick pages: every pick (sportsbook and app) has its own page with lock time, price, fair price, last 5 and result; player pages link them; sitemap lists them (player pages still from 3 graded picks); robots allows the preview images');
})().catch(e=>{console.error(e);process.exit(1)});
