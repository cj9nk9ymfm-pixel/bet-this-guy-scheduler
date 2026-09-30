const assert=require('node:assert/strict'),vm=require('node:vm'),{DatabaseSync}=require('node:sqlite');
const {read}=require('./helpers/client.cjs');
const db=new DatabaseSync(':memory:');for(const f of ['0000_public_record.sql','0001_record_settlement.sql','0002_historical_replays.sql','0005_usage_counts.sql'])db.exec(read('drizzle/'+f));
const DB={prepare(sql){return{sql,args:[],bind(...args){return{sql,args,all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>db.prepare(sql).run(...args)}},all:async()=>({results:db.prepare(sql).all()})}},batch:async statements=>statements.map(s=>db.prepare(s.sql).run(...s.args))};
const context=vm.createContext({URL,URLSearchParams,Request,Response,Headers,AbortSignal,Date,console,setTimeout,clearTimeout,fetch:async()=>Response.json({data:[]})});
const template=read('worker/index.template.js');
vm.runInContext(template.slice(template.indexOf('const API_BASE')).replace('__MOVEMENT_SERVER__',read('worker/movement.js')).replace('__LIVE_SERVER__',read('worker/live.js')).replace('__STATS_SHARED__',read('dist/stats.js')).replace('__RECORDS_SERVER__',read('worker/records.js')).replace('__ACCOUNTS_SERVER__',read('worker/accounts.js')).replace('export default {','this.worker={'),context);
const run=code=>vm.runInContext(code,context);
const insert=db.prepare("INSERT INTO public_recommendations(id,kind,player,market,side,line,odds,combined_odds,game_time,legs_json,posted_at,status,result,source,closing_line,closing_odds,closing_captured_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'market-verified-v2',?,?,?)");
const leg=(player,market,side,line,odds,extra={})=>({player,market,side,line,odds,team:'Atlanta Falcons · @ Green Bay Packers',gameTime:'2026-09-25T00:15:00.000Z',book:'BetMGM',...extra});
insert.run('official|2026-09-22|props|prop|a','prop','Jonnu Smith','Receptions','Over',1.5,175,null,'2026-09-25T00:15:00.000Z',JSON.stringify([leg('Jonnu Smith','Receptions','Over',1.5,175,{actualValue:2})]),'2026-09-24T05:01:17.073Z','final','won',1.5,154,'2026-09-24T23:55:25Z');
insert.run('official|2026-09-22|props|prop|b','prop','<script>x</script>','Kicking Points','Over',7.5,100,null,'2026-09-25T00:15:00.000Z',JSON.stringify([leg('<script>x</script>','Kicking Points','Over',7.5,100,{actualValue:2})]),'2026-09-24T11:03:30.323Z','final','lost',7.5,-115,'2026-09-24T23:55:25Z');
insert.run('official|2026-09-22|reasonable|parlay|c','parlay',null,null,null,null,null,418,'2026-09-27T17:00:00.000Z',JSON.stringify([leg('Jared Goff','Rushing Yards','Over',0.5,130,{actualValue:6}),leg('Malik Nabers','Receptions','Over',4.5,125,{actualValue:5})]),'2026-09-27T15:03:15.164Z','final','won',null,null,null);
insert.run('official|2026-09-29|props|prop|d','prop','Drake London','Receptions','Over',5.5,120,null,'2026-10-04T17:00:00.000Z',JSON.stringify([leg('Drake London','Receptions','Over',5.5,120)]),'2026-10-03T12:00:00Z','pending',null,null,null,null);
context.env={DB};
(async()=>{
  // Week 1 starts the Tuesday after Labor Day: Sep 8, 2026 and Sep 7, 2027.
  assert.equal(JSON.stringify(run("nflWeekOf('2026-09-22')")).includes('"week":3'),true,'Sep 22, 2026 is Week 3');
  assert.equal(run("nflWeekOf('2026-09-29').week"),4);assert.equal(run("weekStartFor(2026,3)"),'2026-09-22');assert.equal(run("weekStartFor(2027,1)"),'2027-09-07');
  assert.equal(run("nflWeekOf('2027-01-05').season"),2026,'January belongs to the previous season');
  const page=async path=>{const r=await run(`weeklyPage(new Request('https://betthisguy.com${path}'),env)`);return r?{status:r.status,type:r.headers.get('content-type'),html:await r.text()}:null};
  const week3=await page('/picks/2026/week-3');
  assert.equal(week3.status,200);assert.ok(week3.type.startsWith('text/html'));
  for(const text of ['<title>NFL Week 3 Player Prop Picks &amp; Results (Sep 22–28, 2026) | Bet This Guy</title>','rel="canonical" href="https://betthisguy.com/picks/2026/week-3"','1–1','+$75','2 of 2','beat the closing price','Jonnu Smith','Over 1.5 receptions','had 2','final price +154','2-leg parlay','Jared Goff — Over 0.5 rushing yards (+130) · had 6','← Week 2','Week 4 →','1-800-GAMBLER'])assert.ok(week3.html.includes(text),`week page shows "${text}"`);
  assert.ok(!week3.html.includes('<script>x</script>')&&week3.html.includes('&lt;script&gt;x&lt;/script&gt;'),'stored text is escaped');
  const index=await page('/picks');
  assert.ok(index.html.includes('href="/picks/2026/week-4"')&&index.html.includes('href="/picks/2026/week-3"'),'the index lists every week');
  assert.ok(index.html.indexOf('week-4')<index.html.indexOf('week-3'),'newest week first');
  assert.ok(index.html.includes('1 pick posted')&&index.html.includes('1 pending'),'an unplayed week shows it is pending');
  assert.equal(await page('/picks/2026/week-9'),null,'a week with no picks is a 404');
  assert.equal(await page('/picks/2026/week-99'),null);assert.equal(await page('/picks/abc'),null);
  const sitemap=await run('weeklySitemap(env)');
  for(const path of ['/picks</loc>','/picks/2026/week-3</loc>','/picks/2026/week-4</loc>','/trust</loc>'])assert.ok(sitemap.includes(path),`sitemap has ${path}`);
  // Anonymous usage counts: known metric names only, no bots, daily totals only.
  context.jobs=[];context.ctx={waitUntil:p=>context.jobs.push(p)};
  const hit=async(body,ua='Mozilla/5.0 (iPhone)')=>{const r=await run(`usageHit(new Request('https://betthisguy.com/api/hit',{method:'POST',headers:{'user-agent':${JSON.stringify(ua)}},body:${JSON.stringify(JSON.stringify(body))}}),env,ctx)`);await Promise.all(context.jobs.splice(0));return r.status};
  assert.equal(await hit({m:['view:home','visit:new']}),204);
  await hit({m:['view:home','slip:add','slip:add']});await hit({m:['drop table','<script>']});await hit({m:['view:home']},'Googlebot/2.1');await hit('not json');
  const counts=Object.fromEntries(db.prepare('SELECT metric,count FROM usage_counts ORDER BY metric').all().map(r=>[r.metric,r.count]));
  assert.equal(JSON.stringify(counts),JSON.stringify({'slip:add':1,'view:home':2,'visit:new':1}),'known metrics counted once per send, unknown names and bots ignored');
  assert.equal(JSON.stringify(db.prepare('PRAGMA table_info(usage_counts)').all().map(c=>c.name)),'["day","metric","count"]','only a day, a metric name and a total are stored');
  assert.equal((await run("usageHit(new Request('https://betthisguy.com/api/hit'),env,ctx)")).status,405,'reads are refused');
  const routed=await run("routeRequest(new Request('https://betthisguy.com/picks/2026/week-3',{headers:{'user-agent':'Mozilla/5.0'}}),env,ctx)");await Promise.all(context.jobs.splice(0));
  assert.equal(routed.status,200);assert.equal(db.prepare("SELECT count FROM usage_counts WHERE metric='view:week'").get().count,1,'weekly pages count their own views');
  // Partner links: off with no setting, shown only in listed US states, and
  // bad entries dropped.
  const offers=(cf,config)=>JSON.parse(JSON.stringify(run(`affiliateOffers(${JSON.stringify({cf})},${JSON.stringify({AFFILIATES:config})})`)));
  const partners=JSON.stringify([{id:'underdog',name:'Underdog',url:'https://play.underdogfantasy.com/p-btg',states:['TX','ga']},{id:'bad',name:'Bad',url:'http://insecure.example',states:['TX']},{id:'x',name:'Script',url:'https://a.example/"><script>',states:['TX']},{id:'nostates',name:'None',url:'https://b.example',states:[]}]);
  assert.deepEqual(offers({country:'US',regionCode:'TX'},undefined),[],'no setting, no partner links');
  assert.deepEqual(offers({country:'US',regionCode:'TX'},partners),[{id:'underdog',name:'Underdog',url:'https://play.underdogfantasy.com/p-btg'}],'a listed state gets the approved partner only');
  assert.equal(offers({country:'US',regionCode:'GA'},partners).length,1,'state codes are case-insensitive');
  assert.deepEqual(offers({country:'US',regionCode:'CA'},partners),[],'an unlisted state gets nothing');
  assert.deepEqual(offers({country:'CA',regionCode:'ON'},partners),[],'outside the US gets nothing');
  assert.deepEqual(offers({},partners),[],'unknown location gets nothing');
  assert.deepEqual(offers({country:'US',regionCode:'TX'},'not json'),[]);
  const api=await run(`affiliateApi(${JSON.stringify({cf:{country:'US',regionCode:'TX'}})},{})`);
  assert.equal(api.headers.get('cache-control'),'private, no-store','offers are never cached for other visitors');
  console.log('PASS: weekly pick pages: NFL week numbering from Labor Day, record and every pick with price, result and closing price, index newest first, 404 for empty weeks, escaped text and sitemap entries, plus anonymous usage totals that ignore bots and unknown metrics, and partner links that stay off unless approved for the visitor state (real SQLite)');
})().catch(e=>{console.error(e);process.exitCode=1});
