// Cashed mid-game (Nov 25, Tim): a win decided while the game is still on gets its own short post
// quoting the result reply; finals, losses and parlays don't; 3 a day at most; x-live-cash off stops it.
const assert=require('node:assert/strict'),vm=require('node:vm'),{webcrypto}=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const {read}=require('./helpers/client.cjs');
const context=vm.createContext({URL,URLSearchParams,Request,Response,Headers,FormData,AbortSignal,Date,console,setTimeout,clearTimeout,crypto:webcrypto,TextEncoder,btoa,atob,BigInt,fetch:async()=>new Response('{}',{status:404})});
const template=read('worker/index.template.js');
vm.runInContext(template.slice(template.indexOf('const API_BASE')).replace('__MOVEMENT_SERVER__',read('worker/movement.js')).replace('__LIVE_SERVER__',read('worker/live.js')).replace('__STATS_SHARED__',read('dist/stats.js')).replace('__RECORDS_SERVER__',()=>read('worker/records.js')).replace('__ACCOUNTS_SERVER__',read('worker/accounts.js')).replace('export default {','this.worker={'),context);
const db=new DatabaseSync(':memory:');
for(const f of ['0000_public_record.sql','0001_record_settlement.sql','0045_x_following.sql'])db.exec(read('drizzle/'+f).replaceAll('--> statement-breakpoint',''));
db.exec('CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)');
const wrap=(sql,args=[])=>({bind(...v){return wrap(sql,v)},async first(){return db.prepare(sql).get(...args)||null},async all(){return{results:db.prepare(sql).all(...args)}},async run(){const r=db.prepare(sql).run(...args);return{success:true,meta:{changes:Number(r.changes)}}}});
const run=c=>vm.runInContext(c,context),posts=[];
context.env={DB:{prepare:sql=>wrap(sql),async batch(l){for(const s of l)await s.run()}},X_API_KEY:'k',X_API_SECRET:'s',X_ACCESS_TOKEN:'42-abc',X_ACCESS_SECRET:'a'};
context.fetch=async(url,init={})=>{const u=new URL(url);if(u.pathname==='/2/tweets'){const b=JSON.parse(init.body);posts.push(b);return Response.json({data:{id:String(500+posts.length)}})}return new Response('{}',{status:404})};
run('fetch=globalThis.fetch');
const set=(k,v)=>db.prepare('INSERT INTO app_settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k,v);
(async()=>{
  const now=Date.parse('2026-11-26T20:00:00Z'),kick='2026-11-26T18:00:00Z';
  const pick=(id,extra={})=>({id:`official|2026-11-24|props|prop|v2|${id}`,kind:'prop',player:'Jahmyr Gibbs',market:'Receptions',side:'Over',line:3.5,odds:105,status:'provisional',result:'won',game_time:kick,legs_json:JSON.stringify([{player:'Jahmyr Gibbs',market:'Receptions',side:'Over',line:3.5,odds:105,actualValue:5,decidedEarly:true}]),...extra});
  context.r=pick('a');const out=await run(`xLiveCash(env,r,'900',${now})`);
  assert.equal(out.posted,1);assert.equal(posts[0].quote_tweet_id,'900','quotes the result reply');
  assert.match(posts[0].text,/Cashed before the final whistle[\s\S]*Jahmyr Gibbs Over 3\.5 receptions \(\+105\) is already at 5 receptions, and the game's still going/);
  assert.equal((await run(`xLiveCash(env,r,'900',${now})`)).skipped,true,'once per pick');
  for(const [k,extra] of [['final',{status:'final'}],['lost',{result:'lost'}],['parlay',{kind:'parlay'}],['old',{game_time:'2026-11-26T10:00:00Z'}]]){context.r=pick(k,extra);assert.equal((await run(`xLiveCash(env,r,'901',${now})`)).skipped,true,k)}
  for(const k of ['b','c']){context.r=pick(k);await run(`xLiveCash(env,r,'902',${now})`)}
  context.r=pick('d');assert.equal((await run(`xLiveCash(env,r,'903',${now})`)).skipped,true,'3 a day at most');
  set('x-live-cash:2026-11-27','0');set('x-live-cash','off');context.r=pick('e',{game_time:'2026-11-27T18:00:00Z'});
  assert.equal((await run(`xLiveCash(env,r,'904',${Date.parse('2026-11-27T20:00:00Z')})`)).skipped,true,'off stops it');
  assert.equal(posts.length,3);
  console.log('PASS: cashed mid-game: early wins get a quote post of the result reply (not finals, losses or parlays), once each, 3 a day, off switch');
})().catch(e=>{console.error(e);process.exit(1)});
