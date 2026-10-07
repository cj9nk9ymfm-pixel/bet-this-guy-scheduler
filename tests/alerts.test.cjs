const assert=require('node:assert/strict'),vm=require('node:vm'),{webcrypto}=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const {read}=require('./helpers/client.cjs');
const db=new DatabaseSync(':memory:');for(const f of ['0000_public_record.sql','0001_record_settlement.sql','0002_historical_replays.sql','0005_usage_counts.sql','0006_push_alerts.sql','0008_book_alerts.sql','0013_follow_alerts.sql'])db.exec(read('drizzle/'+f).replaceAll('--> statement-breakpoint',''));
const DB={prepare(sql){return{sql,args:[],bind(...args){return{sql,args,all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>db.prepare(sql).run(...args)}},all:async()=>({results:db.prepare(sql).all()})}},batch:async s=>s.map(x=>db.prepare(x.sql).run(...x.args))};
const pushes=[];
const context=vm.createContext({URL,URLSearchParams,Request,Response,Headers,AbortSignal,Date,console,setTimeout,clearTimeout,crypto:webcrypto,TextEncoder,btoa,atob,fetch:async(url,init={})=>{pushes.push({url,init});return new Response(null,{status:String(url).includes('gone')?410:String(url).includes('broken')?500:201})}});
const template=read('worker/index.template.js');
vm.runInContext(template.slice(template.indexOf('const API_BASE')).replace('__MOVEMENT_SERVER__',read('worker/movement.js')).replace('__LIVE_SERVER__',read('worker/live.js')).replace('__STATS_SHARED__',read('dist/stats.js')).replace('__RECORDS_SERVER__',read('worker/records.js')).replace('__ACCOUNTS_SERVER__',read('worker/accounts.js')).replace('export default {','this.worker={'),context);
const run=code=>vm.runInContext(code,context);context.env={DB};
const call=async(path,body,method=body?'POST':'GET')=>{const r=await run(`alertsApi(new Request('https://betthisguy.com${path}',${JSON.stringify(body?{method,body:JSON.stringify(body)}:{method})}),env)`);return {status:r.status,body:await r.json()}};
const fromB64=s=>Uint8Array.from(Buffer.from(s.replace(/-/g,'+').replace(/_/g,'/'),'base64'));
(async()=>{
  // The site creates its own signing key once and keeps it.
  const key=await call('/api/alerts/key');
  assert.equal(key.status,200);assert.equal(fromB64(key.body.publicKey).length,65,'public key is an uncompressed P-256 point');
  assert.equal((await call('/api/alerts/key')).body.publicKey,key.body.publicKey,'the key is created once');
  // Each push carries a signed VAPID token for that push service.
  const auth=await run("vapidAuthorization(env,'https://fcm.googleapis.com/fcm/send/abc',Date.parse('2026-10-04T15:00:00Z'))");
  const [,token,k]=auth.match(/^vapid t=([^,]+), k=(.+)$/);assert.equal(k,key.body.publicKey);
  const [h,c,sig]=token.split('.'),claims=JSON.parse(Buffer.from(c,'base64url'));
  assert.equal(claims.aud,'https://fcm.googleapis.com');assert.equal(claims.sub,'https://betthisguy.com');assert.equal(claims.exp,Date.parse('2026-10-04T15:00:00Z')/1000+12*3600);
  const pub=await webcrypto.subtle.importKey('raw',fromB64(key.body.publicKey),{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
  assert.ok(await webcrypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},pub,Buffer.from(sig,'base64url'),new TextEncoder().encode(`${h}.${c}`)),'the token signature verifies with the public key');
  // Subscriptions: known push services only, well-formed keys only.
  const keys={p256dh:'B'+'a'.repeat(86),auth:'abcdefghijklmnop'};
  assert.equal((await call('/api/alerts/subscribe',{endpoint:'https://evil.example/hook',keys})).status,400,'unknown push hosts are refused');
  assert.equal((await call('/api/alerts/subscribe',{endpoint:'https://fcm.googleapis.com/fcm/send/a',keys:{p256dh:'x',auth:'y'}})).status,400,'malformed keys are refused');
  for(const id of ['ok','gone','broken'])assert.equal((await call('/api/alerts/subscribe',{endpoint:`https://fcm.googleapis.com/fcm/send/${id}`,keys})).status,200);
  await call('/api/alerts/subscribe',{endpoint:'https://web.push.apple.com/QAB-ok2',keys});
  assert.equal(db.prepare('SELECT COUNT(*) n FROM push_subscriptions').get().n,4);
  await call('/api/alerts/subscribe',{endpoint:'https://fcm.googleapis.com/fcm/send/ok',keys});
  assert.equal(db.prepare('SELECT COUNT(*) n FROM push_subscriptions').get().n,4,'subscribing twice keeps one row');
  // The notification text comes from the newest official picks.
  assert.equal((await call('/api/alerts/latest')).body.title,'New Bet This Guy picks','no recent picks: a generic note');
  db.prepare("INSERT INTO public_recommendations(id,kind,player,market,side,line,odds,game_time,legs_json,posted_at,status,source) VALUES('official|2026-09-29|props|prop|a','prop','Jonnu Smith','Receptions','Over',1.5,175,'2026-10-04T17:00:00Z','[]',?,'pending','market-verified-v2')").run(new Date().toISOString());
  const latest=(await call('/api/alerts/latest')).body;
  assert.equal(latest.title,'✅ New Bet This Guy pick');assert.equal(latest.body,'Jonnu Smith Over 1.5 receptions (+175)');
  // Sending: gone subscriptions are removed, failures counted, one batch per 15 minutes.
  const now=Date.parse('2026-10-04T15:00:00Z'),first=JSON.parse(JSON.stringify(await run(`sendPickAlerts(env,${now})`)));
  assert.equal(first.sent,2,'the two working subscriptions got a push');assert.equal(pushes.length,4);
  assert.ok(pushes.every(p=>p.init.method==='POST'&&/^vapid t=/.test(p.init.headers.Authorization)&&p.init.headers.TTL==='21600'&&p.init.headers['Content-Length']==='0'),'pushes are empty, signed and expire after 6 hours');
  assert.equal(db.prepare("SELECT COUNT(*) n FROM push_subscriptions WHERE endpoint LIKE '%gone'").get().n,0,'a 410 removes the subscription');
  assert.equal(db.prepare("SELECT failures FROM push_subscriptions WHERE endpoint LIKE '%broken'").get().failures,1,'other failures are counted');
  assert.equal(JSON.parse(JSON.stringify(await run(`sendPickAlerts(env,${now+10*60000})`))).throttled,true,'a second batch within 15 minutes is held back');
  assert.equal(pushes.length,4);
  await run(`sendPickAlerts(env,${now+16*60000})`);assert.equal(pushes.length,7,'after 15 minutes alerts go out again');
  for(let i=0;i<4;i++)await run(`sendPickAlerts(env,${now+(17+i)*16*60000})`);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM push_subscriptions WHERE endpoint LIKE '%broken'").get().n,0,'a subscription failing five times is removed');
  assert.equal((await call('/api/alerts/unsubscribe',{endpoint:'https://fcm.googleapis.com/fcm/send/ok'})).status,200);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM push_subscriptions WHERE endpoint LIKE '%/ok'").get().n,0,'turning alerts off deletes the subscription');
  // The service worker and manifest the browser needs.
  const sw=await run("routeRequest(new Request('https://betthisguy.com/sw.js'),env,{waitUntil(){}})");
  assert.ok(sw.headers.get('content-type').startsWith('text/javascript'));const swText=await sw.text();
  assert.ok(swText.includes("addEventListener('push'")&&swText.includes('/api/alerts/latest')&&swText.includes('notificationclick'));
  new Function(swText);
  const manifest=JSON.parse(await (await run("routeRequest(new Request('https://betthisguy.com/manifest.webmanifest'),env,{waitUntil(){}})")).text());
  assert.equal(manifest.display,'standalone');assert.equal(manifest.icons.length,2);
  console.log('PASS: pick alerts: site-made VAPID key, signed tokens that verify, known push services only, latest-pick text, empty signed pushes, 410 cleanup, failure limit, 15-minute batching, unsubscribe, service worker and manifest (real SQLite)');
})().catch(e=>{console.error(e);process.exitCode=1});
