const assert=require('node:assert/strict'),vm=require('node:vm'),{webcrypto}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {read}=require('./helpers/client.cjs');

const user={id:'11111111-1111-1111-1111-111111111111',email:'fan@example.com',user_metadata:{full_name:'Football Fan'}};
const sandbox=vm.createContext({URL,URLSearchParams,Request,Response,Headers,AbortSignal,Date,console,setTimeout,clearTimeout,crypto:webcrypto,TextEncoder,
  fetch:async(url,options={})=>String(url).endsWith('/auth/v1/user')&&options.headers?.authorization==='Bearer valid-token'?Response.json(user):Response.json({message:'invalid token'},{status:401})});
let source=read('worker/index.template.js').slice(read('worker/index.template.js').indexOf('const API_BASE'));
source=source.replace('__MOVEMENT_SERVER__',read('worker/movement.js')).replace('__LIVE_SERVER__',read('worker/live.js')).replace('__STATS_SHARED__',read('dist/stats.js')).replace('__RECORDS_SERVER__',read('worker/records.js')).replace('__ACCOUNTS_SERVER__',read('worker/accounts.js')).replace('export default {','this.worker={');
vm.runInContext(source,sandbox);

const database=new DatabaseSync(':memory:');
database.exec('PRAGMA foreign_keys=ON');
database.exec(read('drizzle/0004_user_accounts.sql').replaceAll('--> statement-breakpoint',''));
const wrap=(prepared,args=[])=>({bind(...values){return wrap(prepared,values)},async first(){return prepared.get(...args)||null},async all(){return{results:prepared.all(...args)}},async run(){prepared.run(...args);return{success:true}}});
const DB={prepare(sql){return wrap(database.prepare(sql))},async batch(statements){for(const statement of statements)await statement.run();return statements.map(()=>({success:true}))}};
const env={DB},ctx={waitUntil(){}};
const request=(path,options={})=>sandbox.worker.fetch(new Request(`https://betthisguy.com${path}`,options),env,ctx);
const authed=(method='GET',body)=>({method,headers:{authorization:'Bearer valid-token',...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});

(async()=>{
  assert.equal((await request('/api/me')).status,401,'account routes require a session');
  let response=await request('/api/me',authed());
  assert.equal(response.status,200);let data=await response.json();assert.equal(data.profile.email,user.email);assert.equal(data.profile.plan,'free');

  response=await request('/api/me/preferences',authed('PUT',{preferences:{typicalWager:25,sportsbook:'DraftKings'}}));
  assert.equal(response.status,200);
  data=await (await request('/api/me/preferences',authed())).json();assert.deepEqual(data.preferences,{typicalWager:25,sportsbook:'DraftKings'});

  const future=new Date(Date.now()+86400000).toISOString();
  response=await request('/api/me/bets',authed('POST',{wager:10,sportsbook:'DraftKings',legs:[{eventID:'NFL--fixture',player:'Josh Allen',team:'Buffalo Bills',market:'Passing Yards',side:'Over',line:250.5,odds:-110,gameStart:future}]}));
  assert.equal(response.status,201,await response.text());
  data=await (await request('/api/me/bets',authed())).json();assert.equal(data.bets.length,1);assert.equal(data.bets[0].legs.length,1);assert.equal(data.bets[0].stake_cents,1000);assert.equal(data.bets[0].result,'pending');
  const betId=data.bets[0].id;

  response=await request(`/api/me/bets?id=${betId}`,authed('DELETE'));assert.equal(response.status,200);
  data=await (await request('/api/me/bets',authed())).json();assert.equal(data.bets.length,0);
  response=await request('/api/me/preferences',{...authed('PUT',{preferences:{typicalWager:50}}),headers:{...authed('PUT').headers,origin:'https://evil.invalid','content-type':'application/json'}});assert.equal(response.status,403);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM user_profiles').get().count,1);
  database.close();console.log('PASS: account authentication, preferences, bet tracking, ownership, and deletion');
})().catch(error=>{console.error(error);process.exitCode=1});
