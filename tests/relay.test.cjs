// Telegram and Discord (Nov 25, Tim): new picks and results go to our channels with the pick's share
// card, each once, only when the channel secrets exist; relay = 'off' stops it.
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
const sent=[];
context.fetch=async(url,init={})=>{const u=String(url);if(u.includes('api.telegram.org')||u.includes('discord.com'))sent.push({u,body:JSON.parse(init.body)});return new Response('{}',{status:200})};
run('fetch=globalThis.fetch');
(async()=>{
  const now=Date.parse('2026-11-25T16:00:00Z');
  assert.equal((await run(`relayChannels(env,${now})`)).off,true,'off without the channel secrets');
  Object.assign(context.env,{TELEGRAM_BOT_TOKEN:'123:abc',TELEGRAM_CHAT_ID:'@betthisguy',DISCORD_WEBHOOK_URL:'https://discord.com/api/webhooks/1/x'});
  const legs=extra=>JSON.stringify([{player:'Tyler Higbee',market:'Receptions',side:'Under',line:3.5,odds:-110,book:'DraftKings',team:'Green Bay Packers · @ Los Angeles Rams',...extra}]);
  const ins=(id,posted,extra)=>db.prepare("INSERT INTO public_recommendations(id,kind,player,market,side,line,odds,game_time,legs_json,posted_at,status,result,settled_at,source) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'market-verified-v2')").run(id,'prop','Tyler Higbee','Receptions','Under',3.5,-110,extra.game||'2026-11-26T01:00:00.000Z',legs(extra.leg||{}),posted,extra.status||'pending',extra.result||null,extra.settled||null);
  ins('official|w|props|prop|v2|new','2026-11-25T14:50:00.000Z',{});
  ins('official|w|props|prop|v2|old','2026-11-24T14:50:00.000Z',{});
  ins('official|w|props|prop|v2|won','2026-11-23T14:50:00.000Z',{game:'2026-11-24T01:00:00.000Z',status:'final',result:'won',settled:'2026-11-25T09:00:00.000Z',leg:{actualValue:2}});

  db.prepare("INSERT INTO prediction_picks (id,exchange,event_id,player,team,market,side,line,odds,game_time,posted_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").run('pm|NBA--g1|zachedey','ProphetX','NBA--g1','Zach Edey','Los Angeles Clippers · @ Memphis Grizzlies','Rebounds','Under',7.5,105,'2026-11-26T01:10:00.000Z','2026-11-25T11:40:00.000Z');
  const out=await run(`relayChannels(env,${now})`);assert.equal(out.sent,3,'the new pick, the app pick and the result; not the old pick');
  const tg=sent.filter(x=>x.u.includes('telegram')),dc=sent.filter(x=>x.u.includes('discord'));assert.equal(tg.length,3);assert.equal(dc.length,3);
  const np=tg.find(x=>/New NFL pick/.test(x.body.caption));assert.match(np.body.caption,/🔒 New NFL pick\nTyler Higbee Under 3\.5 receptions\n-110 at DraftKings · PACKERS @ RAMS[\s\S]*utm_source=telegram/);assert.equal(np.body.chat_id,'@betthisguy');
  assert.match(np.body.photo,/\/api\/share-card\.png\?id=official%7Cw%7Cprops%7Cprop%7Cv2%7Cnew&size=wide$/);
  assert.ok(tg.some(x=>/✅ Won: Tyler Higbee Under 3\.5 receptions \(-110\) · final 2/.test(x.body.caption)),'the result');
  assert.ok(tg.some(x=>/New NBA app pick\nZach Edey Under 7\.5 rebounds\n49% on ProphetX · CLIPPERS @ GRIZZLIES/.test(x.body.caption)),'the app pick');
  assert.match(dc[0].body.content,/utm_source=discord/);assert.match(dc[0].body.embeds[0].image.url,/share-card\.png/);
  assert.equal((await run(`relayChannels(env,${now+600000})`)).sent,0,'each once');
  db.prepare("INSERT INTO app_settings (key,value) VALUES ('relay','off')").run();assert.equal((await run(`relayChannels(env,${now})`)).off,true,'off switch');
  console.log('PASS: Telegram and Discord: new picks and results with the share card, each once, only with the channel secrets, off switch');
})().catch(e=>{console.error(e);process.exit(1)});
