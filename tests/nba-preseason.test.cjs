const assert=require('node:assert/strict'),vm=require('node:vm'),{webcrypto}=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const {read}=require('./helpers/client.cjs');
// NBA preseason plumbing test: its own feed (never the public board), hourly,
// rows tagged NBAPRE-- so they stay out of the NBA record.
const context=vm.createContext({URL,URLSearchParams,Request,Response,Headers,AbortSignal,Date,console,setTimeout,clearTimeout,crypto:webcrypto,TextEncoder,btoa,atob});
const template=read('worker/index.template.js');
vm.runInContext(template.slice(template.indexOf('const API_BASE')).replace('__MOVEMENT_SERVER__',read('worker/movement.js')).replace('__LIVE_SERVER__',read('worker/live.js')).replace('__STATS_SHARED__',read('dist/stats.js')).replace('__RECORDS_SERVER__',read('worker/records.js')).replace('__ACCOUNTS_SERVER__',read('worker/accounts.js')).replace('export default {','this.worker={'),context);
const fs=require('node:fs'),db=new DatabaseSync(':memory:');
for(const f of fs.readdirSync('drizzle').filter(f=>/^0006_|nba/.test(f)).sort())db.exec(read('drizzle/'+f).replaceAll('--> statement-breakpoint',''));
const wrap=(sql,args=[])=>({bind(...values){return wrap(sql,values)},async first(){return db.prepare(sql).get(...args)||null},async all(){return{results:db.prepare(sql).all(...args)}},async run(){const r=db.prepare(sql).run(...args);return{success:true,meta:{changes:Number(r.changes)}}}});
context.env={DB:{prepare:sql=>wrap(sql),async batch(list){for(const s of list)await s.run()}},THE_ODDS_API_KEY:'k'};
const run=code=>vm.runInContext(code,context),J=v=>JSON.parse(JSON.stringify(v));
(async()=>{
  const now=Date.parse('2026-10-11T18:00:00Z'),tip='2026-10-12T00:00:00Z',upd=new Date(now-60000).toISOString();
  const mk=(over,under)=>({key:'player_points',last_update:upd,outcomes:[{name:'Over',description:'Jalen Brunson',point:18.5,price:over},{name:'Under',description:'Jalen Brunson',point:18.5,price:under}]});
  const board={id:'p1',commence_time:tip,home_team:'New York Knicks',away_team:'Boston Celtics',bookmakers:[['draftkings',-110,-110],['fanduel',-112,-108],['betrivers',-110,-110],['betmgm',115,-145]].map(([key,o,u])=>({key,title:key,last_update:upd,markets:[mk(o,u)]}))};
  const urls=[];
  context.fetch=async url=>{url=String(url);urls.push(url);
    if(url.includes('/events?'))return new Response(JSON.stringify([{id:'p1',commence_time:tip,home_team:'New York Knicks',away_team:'Boston Celtics'}]));
    if(url.includes('/events/p1/odds'))return new Response(JSON.stringify(board));
    return new Response(null,{status:404})};
  let out=J(await run(`recordNbaPreseason(env,${now})`));
  assert.equal(out.games,1);assert.equal(out.priced,1);assert.equal(out.logged,1);
  assert.ok(urls.every(u=>u.includes('basketball_nba_preseason')),'reads only the preseason feed');
  const row=db.prepare('SELECT * FROM nba_shadow').get();
  assert.ok(row.event_id.startsWith('NBAPRE--'),'tagged so it stays out of the NBA record');assert.equal(row.side,'Over');assert.equal(row.book,'betmgm');
  out=J(await run(`recordNbaPreseason(env,${now+10*60000})`));assert.deepEqual(out,{skipped:true},'at most once an hour');
  console.log('PASS: NBA preseason test reads its own feed hourly and tags its rows');
})().catch(error=>{console.error(error);process.exit(1)});
