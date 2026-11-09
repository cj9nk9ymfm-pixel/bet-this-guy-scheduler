// X auto-drafts (Nov 9, Tim): receipts, bad beats, live sweats and injury heads-ups are
// drafted from our data and pushed to Tim's phone with a Post / Skip link. Nothing posts
// without that tap; approved posts wait in the X queue. Off unless x-drafts='on'.
const assert=require('node:assert/strict'),vm=require('node:vm'),{webcrypto}=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const {read}=require('./helpers/client.cjs');
const pushes=[];
const context=vm.createContext({URL,URLSearchParams,Request,Response,Headers,FormData,AbortSignal,Date,console,setTimeout,clearTimeout,crypto:webcrypto,TextEncoder,btoa,atob,fetch:async(url,init)=>{if(String(url).startsWith('https://ntfy.sh/'))pushes.push({title:init.headers.Title,click:init.headers.Click,body:init.body});return new Response(null,{status:200})}});
const template=read('worker/index.template.js');
vm.runInContext(template.slice(template.indexOf('const API_BASE')).replace('__MOVEMENT_SERVER__',read('worker/movement.js')).replace('__LIVE_SERVER__',read('worker/live.js')).replace('__STATS_SHARED__',read('dist/stats.js')).replace('__RECORDS_SERVER__',read('worker/records.js')).replace('__ACCOUNTS_SERVER__',read('worker/accounts.js')).replace('export default {','this.worker={'),context);
const db=new DatabaseSync(':memory:');
for(const f of ['0000_public_record.sql','0001_record_settlement.sql','0002_historical_replays.sql','0006_push_alerts.sql'])db.exec(read('drizzle/'+f).replaceAll('--> statement-breakpoint',''));
const wrap=(sql,args=[])=>({bind(...v){return wrap(sql,v)},async first(){return db.prepare(sql).get(...args)||null},async all(){return{results:db.prepare(sql).all(...args)}},async run(){const r=db.prepare(sql).run(...args);return{success:true,meta:{changes:Number(r.changes)}}}});
context.env={ALERT_NTFY_TOPIC:'private-topic',DB:{prepare:sql=>wrap(sql),async batch(l){for(const s of l)await s.run()}}};
const run=c=>vm.runInContext(c,context),J=v=>JSON.parse(JSON.stringify(v)),setting=k=>db.prepare('SELECT value FROM app_settings WHERE key=?').get(k)?.value;
(async()=>{
  const now=Date.parse('2026-11-09T06:00:00Z'),add=(id,o)=>db.prepare("INSERT INTO public_recommendations (id,kind,sport,player,market,side,line,odds,closing_odds,game_time,legs_json,posted_at,status,result,settled_at,source) VALUES (?,'prop','NBA',?,?,?,?,?,?,?,?,?,?,?,?,'market-verified-v2')").run(id,o.player,o.market,o.side,o.line,o.odds,o.close??null,o.gt,JSON.stringify([o.leg||{}]),'2026-11-08T20:00:00Z',o.status,o.result??null,o.settled??null);
  add('nba|x|monk',{player:'Malik Monk',market:'3-Pointers Made',side:'Under',line:1.5,odds:120,close:-129,gt:'2026-11-09T02:10:00Z',status:'final',result:'won',settled:'2026-11-09T05:00:00Z',leg:{actualValue:0}});
  add('nba|x|acuff',{player:'Darius Acuff Jr.',market:'Rebounds',side:'Over',line:3.5,odds:120,close:116,gt:'2026-11-09T03:00:00Z',status:'final',result:'lost',settled:'2026-11-09T05:30:00Z',leg:{actualValue:3}});
  add('nba|x|booker',{player:'Devin Booker',market:'Assists',side:'Over',line:4.5,odds:-115,gt:'2026-11-09T04:10:00Z',status:'pending',leg:{liveValue:4,livePeriod:4}});
  add('nba|x|reaves',{player:'Austin Reaves',market:'Rebounds',side:'Under',line:3.5,odds:119,gt:'2026-11-09T08:00:00Z',status:'pending',leg:{team:'Los Angeles Lakers · @ Atlanta Hawks'}});
  assert.equal(J(await run(`draftXPosts(env,${now})`)).off,true,'off until x-drafts is on');assert.equal(pushes.length,0);
  db.prepare("INSERT INTO app_settings (key,value) VALUES ('x-drafts','on')").run();
  const out=J(await run(`draftXPosts(env,${now})`));
  assert.deepEqual([out.receipt,out.badbeat,out.sweat],[1,1,1],'a receipt, a bad beat and a live sweat');
  assert.ok(pushes.find(p=>p.title==='X draft: receipt').body.includes('We locked Malik Monk Under 1.5 3-pointers made at +120. It closed at -129.'));
  assert.ok(pushes.find(p=>p.title==='X draft: bad beat').body.includes('Lost by one. Darius Acuff Jr. Over 3.5 rebounds: finished with 3.'));
  assert.ok(/Devin Booker has 4 assists in the 4th\. One more and Over 4\.5 cashes/.test(pushes.find(p=>p.title==='X draft: live sweat').body));
  assert.equal(J(await run(`draftXPosts(env,${now})`)).receipt,0,'each one drafted once');
  // Injury: a newly Out player in a game where we have a pick.
  context.before=new Map([['traeyoung','Questionable']]);context.rows=[{player:'Trae Young',team:'Atlanta Hawks',status:'Out'}];
  assert.equal(await run(`draftInjuryPosts(env,'NBA',before,rows,${now})`),1);
  assert.ok(/Trae Young is OUT tonight\.\n\nWe're on Austin Reaves Under 3\.5 rebounds \(\+119\)/.test(pushes.at(-1).body));
  // The link opens the draft; a wrong token doesn't; Post queues it, it never posts directly.
  const link=new URL(pushes[0].click);assert.equal(link.pathname,'/xdraft');
  const page=async(u,init)=>{context.__u=u;context.__i=init||null;return run('this.worker.fetch(new Request(__u,__i||undefined),env,{waitUntil(){}})')};
  let r=await page(link.toString());assert.equal(r.status,200);assert.match(await r.text(),/It closed at -129/);
  r=await page(`https://betthisguy.com/xdraft?k=${encodeURIComponent(link.searchParams.get('k'))}&t=nope`);assert.equal(r.status,404,'needs the token');
  const fd=new FormData();fd.set('a','post');r=await page(link.toString(),{method:'POST',body:fd});assert.match(await r.text(),/Queued/);
  const q=JSON.parse(setting('x-queue'));assert.equal(q.length,1);assert.ok(q[0].text.includes('Malik Monk'));
  assert.equal(JSON.parse(setting('x-draft:'+link.searchParams.get('k'))).state,'queued');
  // The queue fills the custom slot when it's free, one at a time.
  const raw=await run(`xQueuePromote(env,${now})`);assert.ok(JSON.parse(raw).text.includes('Malik Monk'));assert.equal(JSON.parse(setting('x-queue')).length,0);
  assert.ok(setting('x-custom-post'),'moved into the post slot');
  console.log('PASS: X drafts: receipt, bad beat, live sweat and injury drafts pushed with a Post / Skip link (token needed); Post queues it; the queue fills the post slot');
})().catch(e=>{console.error(e);process.exit(1)});
