const assert=require('node:assert/strict'),vm=require('node:vm'),{webcrypto}=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const {read}=require('./helpers/client.cjs');
const db=new DatabaseSync(':memory:');for(const f of ['0000_public_record.sql','0001_record_settlement.sql','0002_historical_replays.sql','0005_usage_counts.sql'])db.exec(read('drizzle/'+f));
const DB={prepare(sql){return{sql,args:[],bind(...args){return{sql,args,all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>db.prepare(sql).run(...args)}},all:async()=>({results:db.prepare(sql).all()})}},batch:async s=>s.map(x=>db.prepare(x.sql).run(...x.args))};
const context=vm.createContext({URL,URLSearchParams,Request,Response,Headers,AbortSignal,Date,console,setTimeout,clearTimeout,crypto:webcrypto,TextEncoder,btoa,atob,fetch:async()=>new Response(null,{status:404})});
const template=read('worker/index.template.js');
vm.runInContext(template.slice(template.indexOf('const API_BASE')).replace('__MOVEMENT_SERVER__',read('worker/movement.js')).replace('__LIVE_SERVER__',read('worker/live.js')).replace('__STATS_SHARED__',read('dist/stats.js')).replace('__RECORDS_SERVER__',read('worker/records.js')).replace('__ACCOUNTS_SERVER__',read('worker/accounts.js')).replace('export default {','this.worker={'),context);
const run=code=>vm.runInContext(code,context);context.env={DB};
const now=Date.now(),week=run(`officialWeek(${now})`),previous=new Date(Date.parse(week+'T00:00:00Z')-7*86400000).toISOString().slice(0,10),iso=t=>new Date(t).toISOString();
const add=(weekStart,id,row)=>db.prepare("INSERT INTO public_recommendations(id,kind,player,market,side,line,odds,combined_odds,game_time,legs_json,posted_at,status,result,source) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'market-verified-v2')").run(`official|${weekStart}|props|${id}`,row.kind||'prop',row.player??null,row.market??null,row.side??null,row.line??null,row.odds??null,row.combined??null,row.game_time,JSON.stringify(row.legs||[{player:row.player,market:row.market,side:row.side,line:row.line,odds:row.odds,actualValue:row.had??null}]),iso(now-86400000),row.result?'final':'pending',row.result||null);
// Last week: 2-1 on props and a winning parlay.
add(previous,'a',{player:'Josh Allen',market:'Passing Yards',side:'Over',line:271.5,odds:110,game_time:iso(now-6*86400000),result:'won',had:312});
add(previous,'b',{player:'CeeDee Lamb',market:'Receiving Yards',side:'Under',line:82.5,odds:-110,game_time:iso(now-6*86400000),result:'won',had:61});
add(previous,'c',{player:'Bijan Robinson',market:'Rushing Yards',side:'Over',line:74.5,odds:-115,game_time:iso(now-6*86400000),result:'lost',had:40});
add(previous,'p',{kind:'parlay',combined:264,game_time:iso(now-6*86400000),result:'won',legs:[{player:'Josh Allen',market:'Passing Yards',side:'Over',line:271.5,odds:110},{player:'CeeDee Lamb',market:'Receiving Yards',side:'Under',line:82.5,odds:-110}]});
// This week: one upcoming pick, an anytime touchdown, and one that already kicked off.
add(week,'u1',{player:'Puka Nacua',market:'Receptions',side:'Over',line:6.5,odds:120,game_time:iso(now+5*3600000)});
add(week,'u2',{player:'Saquon Barkley',market:'Anytime Touchdown',side:'Over',line:0.5,odds:-140,game_time:iso(now+6*3600000)});
add(week,'s',{player:'Started Guy',market:'Receptions',side:'Over',line:3.5,odds:-120,game_time:iso(now-3600000)});
(async()=>{
  const response=await run("routeRequest(new Request('https://betthisguy.com/post'),env,{waitUntil(){}})");
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('x-robots-tag'),'noindex');
  const html=await response.text();
  assert.ok(html.includes('<meta name="robots" content="noindex,nofollow">'),'the kit is not indexed');
  const kit=JSON.parse(html.match(/<script type="application\/json" id="kitData">([\s\S]*?)<\/script>/)[1]);
  assert.deepEqual(kit.upcoming.map(r=>r.player),['Puka Nacua','Saquon Barkley'],'only games that have not started');
  // The page's script parses: the browser gets the same functions as source.
  new Function(html.match(/<script>([\s\S]*?)<\/script><\/body>/)[1]);
  const texts=JSON.parse(JSON.stringify(run(`postKitTexts(${JSON.stringify(kit)})`)));
  assert.equal(texts.today.ready,true);
  assert.ok(texts.today.x.includes('Puka Nacua o6.5 rec (+120)')&&texts.today.x.includes('Saquon Barkley anytime TD (-140)')&&!texts.today.x.includes('Started Guy'));
  assert.ok(texts.today.x.endsWith('betthisguy.com')&&texts.today.x.length<=280,'the X post fits');
  assert.ok(texts.today.threads.includes('Puka Nacua Over 6.5 receptions (+120)'));
  assert.ok(texts.today.reddit.includes('| Puka Nacua | Over 6.5 receptions | +120 |'));
  const last=texts.previous;
  assert.equal(last.record,'2–1');assert.equal(Math.round(last.profit),Math.round(110+100/1.1-100));
  assert.ok(last.x.startsWith('📊 Week')&&last.x.includes('2–1 on player props, +$101 betting $100 a pick'),last.x.split('\n')[0]);
  assert.ok(last.x.includes('Parlays: 1–0 (+$264)'));
  assert.ok(last.x.includes('✅ Josh Allen o271.5 pass yds (+110) — had 312'),last.x);
  assert.ok(!last.x.includes('Bijan'),'the X post lists wins');assert.ok(last.reddit.includes('❌ Bijan Robinson Over 74.5 rushing yards (-115) — had 40'),'the Reddit post lists every graded pick, losses too');
  assert.ok(last.x.includes(`betthisguy.com${kit.previous.path}`));
  assert.equal(texts.current.ready,false,'this week has nothing graded yet');
  // Long boards are trimmed to fit and say how many were left out.
  const many={...kit,upcoming:Array.from({length:14},(_,i)=>({...kit.upcoming[0],player:`Player Number ${i}`}))};
  const trimmed=JSON.parse(JSON.stringify(run(`postKitTexts(${JSON.stringify(many)})`))).today.x;
  assert.ok(trimmed.length<=280&&/\+\d+ more on the site/.test(trimmed),trimmed);
  // /trust carries a server-written record summary, and robots.txt lets search engines load the record.
  const trust=await run('trustSnapshot(env)');
  assert.ok(trust.includes('<p class="record-snapshot"><strong>Official record: 2–1 on player props, +\u0024101 betting \u0024100 a pick.</strong> Parlays: 1–0 <span class="nowrap">(+\u0024264)</span>.'),trust.match(/<p class="record-snapshot">[\s\S]*?<\/p>/)?.[0]);
  const robots=await (await run("routeRequest(new Request('https://betthisguy.com/robots.txt'),env,{waitUntil(){}})")).text();
  assert.ok(robots.includes('Allow: /api/record\nDisallow: /api/'));
  // The home page knows last week's banner will have stats and hits, and reserves their space.
  const layout=JSON.parse(JSON.stringify(await run(`homeRecentRows(env).then(rows=>homeLayout(rows,${now}))`)));
  assert.deepEqual(layout,{stats:true,hits:true});
  assert.deepEqual(JSON.parse(JSON.stringify(run('homeLayout([])'))),{stats:false,hits:false});
  console.log('PASS: post kit and /trust summary, home layout: upcoming picks only, X posts that fit, short and long bet text, anytime TDs, weekly results with $100 profit, parlays and actual stats, Reddit lists losses too, trimming with a count, noindex page whose script parses');
})().catch(e=>{console.error(e);process.exitCode=1});
