const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),{webcrypto}=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const {read}=require('./helpers/client.cjs');
// NBA matchups: what each defense allows by position group, filled one game
// day at a time from BALLDONTLIE box scores, then ranked for the pick graphic.
const calls=[];
const context=vm.createContext({URL,URLSearchParams,Request,Response,Headers,AbortSignal,Date,console,setTimeout,clearTimeout,crypto:webcrypto,TextEncoder,btoa,atob,
  fetch:async url=>{url=String(url);calls.push(url);const u=new URL(url);
    if(u.pathname.endsWith('/stats')&&u.searchParams.get('dates[]')){const d=u.searchParams.get('dates[]');if(d!=='2026-10-21')return Response.json({data:[],meta:{}});
      const g={id:9,date:d,home_team_id:1,visitor_team_id:2},row=(team,name,pos,ast,min='30')=>({game:g,team:{id:team,full_name:name},player:{position:pos},min,pts:10,reb:4,ast,fg3m:1});
      return Response.json({data:[row(1,'Atlanta Hawks','G',8),row(1,'Atlanta Hawks','F',3),row(2,'Cleveland Cavaliers','G',5),row(2,'Cleveland Cavaliers','G-F',4),row(2,'Cleveland Cavaliers','C',2,'0')],meta:{}})}
    return Response.json({data:[],meta:{}})}});
const template=read('worker/index.template.js');
vm.runInContext(template.slice(template.indexOf('const API_BASE')).replace('__MOVEMENT_SERVER__',()=>read('worker/movement.js')).replace('__LIVE_SERVER__',()=>read('worker/live.js')).replace('__STATS_SHARED__',()=>read('dist/stats.js')).replace('__RECORDS_SERVER__',()=>read('worker/records.js')).replace('__ACCOUNTS_SERVER__',()=>read('worker/accounts.js')).replace('export default {','this.worker={'),context);
const db=new DatabaseSync(':memory:');
for(const f of fs.readdirSync('drizzle').filter(f=>/^\d{4}_.*\.sql$/.test(f)).sort())try{db.exec(read('drizzle/'+f).replaceAll('--> statement-breakpoint',''))}catch{}
const wrap=(sql,args=[])=>({bind(...values){return wrap(sql,values)},async first(){return db.prepare(sql).get(...args)||null},async all(){return{results:db.prepare(sql).all(...args)}},async run(){const r=db.prepare(sql).run(...args);return{success:true,meta:{changes:Number(r.changes)}}}});
context.env={DB:{prepare:sql=>wrap(sql),async batch(l){for(const s of l)await s.run()}},BALLDONTLIE_API_KEY:'k'};
const run=code=>vm.runInContext(code,context);run('fetch=globalThis.fetch');
(async()=>{
  // Day by day from the season start; this season first, then last season.
  const out=JSON.parse(JSON.stringify(await run(`ingestNbaDefense(env,${Date.parse('2026-10-24T12:00:00Z')},3)`)));
  assert.equal(out.days,3);assert.equal(out.current,'2026-10-23','three days done, next is the 23rd');
  const rows=db.prepare("SELECT defense,position,stats_json FROM defense_games ORDER BY defense,position").all();
  // Cavs guards (G and G-F) had 9 assists against the Hawks; a 0-minute player doesn't count.
  assert.deepEqual(rows.map(r=>[r.defense,r.position,JSON.parse(r.stats_json).ast]),[['atlantahawks','NBA-G',9],['clevelandcavaliers','NBA-F',3],['clevelandcavaliers','NBA-G',8]]);
  // Rank: 30 teams, 5 games each; team i allows 10+i assists to guards.
  db.exec('DELETE FROM defense_games');
  const ins=db.prepare('INSERT INTO defense_games (game_id,defense,position,game_date,stats_json) VALUES (?,?,?,?,?)');
  for(let t=0;t<30;t++)for(let g=0;g<5;g++)ins.run(`NBA-${t}-${g}`,t===5?'atlantahawks':`team${t}`,'NBA-G','2026-10-25',JSON.stringify({ast:10+t,pts:0,reb:0,fg3m:0,min:'48'}));
  const r=JSON.parse(JSON.stringify(await run(`nbaDefenseRank(env,'Atlanta Hawks','G','Assists',${Date.parse('2026-11-05T00:00:00Z')})`)));
  assert.deepEqual([r.allowed,r.rank,r.teams,r.span],[15,6,30,'this season']);
  // Fewer than 25 teams with 5 games this season: falls back to last season (none here).
  db.exec("DELETE FROM defense_games WHERE defense LIKE 'team2%'");
  assert.equal(await run(`nbaDefenseRank(env,'Atlanta Hawks','G','Assists',${Date.parse('2026-11-05T00:00:00Z')})`),null);
  // A new pick's post waits up to 12 minutes for its matchup, then goes anyway.
  const now=Date.parse('2026-11-05T00:00:00Z'),pick={id:'nba|x|1',posted_at:new Date(now-60000).toISOString()};context.pick=pick;
  assert.equal(await run(`xMatchupReady(env,pick,${now})`),false,'waits');
  assert.equal(await run(`xMatchupReady(env,pick,${now+12*60000})`),true,'goes after 12 minutes');
  db.prepare("INSERT INTO app_settings(key,value) VALUES('matchup:nba|x|1','{}')").run();assert.equal(await run(`xMatchupReady(env,pick,${now})`),true,'goes once the matchup is saved');
  console.log('PASS: NBA matchup data (defense allowed by position from box scores, day by day; ranked among 25+ teams with 5+ games, else last season; a new pick waits up to 12 minutes for its matchup)');
})().catch(e=>{console.error(e);process.exit(1)});
