// Ruled out (Nov 10, Tim): a pick whose player was ruled out before the game gets its
// X follow-up, then comes off the record as if it was never a play. Queued posts,
// emails and follow alerts still treat it as void. The email blast can wait for picks.
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
context.env={ALERT_NTFY_TOPIC:'private-topic',DB:{prepare:sql=>wrap(sql),async batch(l){for(const s of l)await s.run()}}};
const run=c=>vm.runInContext(c,context),J=v=>JSON.parse(JSON.stringify(v)),setting=k=>db.prepare('SELECT value FROM app_settings WHERE key=?').get(k)?.value,set=(k,v)=>db.prepare('INSERT OR REPLACE INTO app_settings (key,value) VALUES (?,?)').run(k,v);
const add=(id,o)=>db.prepare("INSERT INTO public_recommendations (id,kind,sport,player,market,side,line,odds,game_time,legs_json,posted_at,status,result,settled_at,source) VALUES (?,'prop','NBA',?,?,?,?,?,?,?,?,?,?,?,'market-verified-v2')").run(id,o.player,o.market,o.side,o.line,o.odds,o.gt,JSON.stringify([o.leg||{}]),'2026-11-09T16:00:00Z',o.status,o.result??null,o.settled??null);
(async()=>{
  const now=Date.parse('2026-11-10T01:00:00Z');
  const reaves={player:'Austin Reaves',market:'Rebounds',side:'Under',line:3.5,odds:119,gt:'2026-11-10T00:10:00Z',status:'final',result:'push',settled:'2026-11-09T22:45:00Z',leg:{player:'Austin Reaves',market:'Rebounds',side:'Under',line:3.5,team:'Los Angeles Lakers · @ Atlanta Hawks',book:'DraftKings',voided:true,voidReason:'Ruled out (Illness)',result:'push'}};
  add('nba|t|reaves',reaves);
  add('nba|t|push',{player:'Real Push',market:'Points',side:'Over',line:20,odds:-110,gt:'2026-11-10T00:10:00Z',status:'final',result:'push',settled:'2026-11-10T03:00:00Z',leg:{actualValue:20,result:'push'}});
  add('nba|t|booker',{player:'Devin Booker',market:'Assists',side:'Over',line:4.5,odds:-115,gt:'2026-11-10T02:10:00Z',status:'pending'});
  db.prepare("INSERT INTO prediction_picks (id,exchange,event_id,player,market,side,line,odds,game_time,result,void_reason) VALUES ('pm|NBA--g|x','Novig','NBA--g','Out Guy','Points','Over',10.5,100,'2026-11-10T00:10:00Z','void','Ruled out (Knee)')").run();
  // The follow-up reply first: a posted pick waits for it (up to 3 hours).
  set('xid:nba|t|reaves','123');
  assert.equal(run(`xScratched(${JSON.stringify({kind:'prop',result:'push',legs_json:JSON.stringify([reaves.leg])})})`),true);
  let out=J(await run(`scratchRuledOut(env,${Date.parse('2026-11-09T23:00:00Z')})`));
  assert.deepEqual(out.players,['Out Guy'],'the posted pick waits for its reply; the app pick goes');
  set('x-nba-r:nba|t|reaves','2026-11-09T23:36:00Z');
  out=J(await run(`scratchRuledOut(env,${now})`));
  assert.deepEqual(out.players,['Austin Reaves'],'once the reply is up, the pick comes off the record');
  assert.equal(db.prepare("SELECT COUNT(*) n FROM public_recommendations WHERE id='nba|t|reaves'").get().n,0,'deleted');
  assert.equal(db.prepare("SELECT COUNT(*) n FROM public_recommendations WHERE id='nba|t|push'").get().n,1,'a real push (the stat landed on the line) stays');
  assert.equal(JSON.parse(setting('scratched:nba|t|reaves')).row.player,'Austin Reaves','kept aside in app_settings');
  // Anything still pointing at it treats it as void.
  assert.equal(J(await run(`pickResult(env,'nba|t|reaves')`)).result,'push');
  assert.equal(J(await run(`followRecord(env,'nba|t|reaves')`)).result,'push','followers hear "no action"');
  assert.equal(J(await run(`followRecord(env,'pm|NBA--g|x')`)).result,'push');
  // Email blast waits for its picks, then sends once.
  set('email-blast',JSON.stringify({id:'perfect-test',subject:'Perfect night',lede:'7–0',ids:['nba|t|booker','pm|NBA--g|x'],waitFor:{picks:['nba|t|booker'],result:'won'}}));
  run('emailPeople=async()=>[{email:"a@b.co",token:"t"}]');context.env.RESEND_API_KEY='k';
  assert.equal(J(await run(`sendBlastEmail(env,${now})`)).waiting,true,'waits while Booker is open');assert.equal(mail.length,0);
  db.prepare("UPDATE public_recommendations SET result='won',status='final' WHERE id='nba|t|booker'").run();
  assert.equal(J(await run(`sendBlastEmail(env,${now})`)).sent,1,'sends when he wins');
  assert.equal(J(await run(`sendBlastEmail(env,${now})`)).done,true,'once');
  // A miss drops it, with a push.
  set('email-blast',JSON.stringify({id:'drop-test',subject:'Nope',lede:'x',ids:[],waitFor:{pickId:'nba|t|reaves'}}));
  assert.equal(J(await run(`sendBlastEmail(env,${now})`)).dropped,'Austin Reaves');assert.ok(pushes.some(p=>p.title==='Email dropped'));
  console.log('PASS: ruled-out picks get their follow-up, then come off the record; the email waits for its picks');
})().catch(e=>{console.error(e);process.exit(1)});
