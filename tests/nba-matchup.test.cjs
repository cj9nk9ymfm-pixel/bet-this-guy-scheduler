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
  // Top pick: strong recent form (7+ of 10 on our side) beats a bigger edge.
  const gt=new Date(now+3*3600000).toISOString(),mk=(id,edge,line)=>({id,kind:'prop',player:'P '+id,side:'Under',line,game_time:gt,legs_json:JSON.stringify([{edge,side:'Under',line}])});
  context.rows=[mk('a',3.0,5.5),mk('b',1.2,5.5)];
  db.prepare("INSERT INTO app_settings(key,value) VALUES('matchup:b',?)").run(JSON.stringify({logs:[3,4,5,2,4,6,3,4,5,4].map(v=>({v,s:2026}))}));
  db.prepare("INSERT INTO app_settings(key,value) VALUES('matchup:a',?)").run(JSON.stringify({logs:[7,8,4,6,7,3,8,6,7,5].map(v=>({v,s:2026}))}));
  const strong=await run(`xStrongForm(env,rows)`);assert.deepEqual([...strong],['b'],'b went under in 9 of 10, a in 3');
  assert.equal(run(`xPollPick(rows,${now},new Set(['b']))`).id,'b','strong form first');assert.equal(run(`xPollPick(rows,${now})`).id,'a','else the biggest edge');
  // NBA stats check: logged from the saved matchup.
  db.prepare("INSERT INTO public_recommendations(id,kind,player,market,side,line,odds,game_time,legs_json,posted_at,status,source) VALUES('nba|n|1','prop','Ace Guard','Assists','Under',5.5,-110,?,?,?,'pending','market-verified-v2')").run(gt,JSON.stringify([{team:'A · @ B',edge:1.2}]),new Date(now).toISOString());
  db.prepare("INSERT INTO app_settings(key,value) VALUES('matchup:nba|n|1',?)").run(JSON.stringify({opponent:'B',pos:'guards',def:{allowed:11,league:12.6,games:6,rank:5,teams:30},h2h:[],logs:[3,4,5,2,4,6,3,4,5,4].map(v=>({v,s:2026}))}));
  assert.equal((await run(`runNbaStatsChecks(env,{},${now})`)).checked,1);
  const chk=db.prepare("SELECT kind,l10_hits,verdict FROM stats_checks WHERE id='nba|n|1'").get();assert.deepEqual([chk.kind,chk.l10_hits,chk.verdict],['nba',9,'agree']);
  // Backfill: graded NBA picks get the check as of their tip-off.
  db.prepare("INSERT INTO public_recommendations(id,kind,player,market,side,line,odds,game_time,legs_json,posted_at,status,result,source) VALUES('nba|old|1','prop','Old Guard','Rebounds','Over',4.5,-110,'2026-10-25T23:00:00.000Z',?,'2026-10-25T12:00:00Z','final','won','market-verified-v2')").run(JSON.stringify([{team:'A · @ B',edge:1.1}]));
  db.prepare("INSERT INTO app_settings(key,value) VALUES('matchup:nba|old|1',?)").run(JSON.stringify({opponent:'B',pos:'forwards',def:null,h2h:[],logs:[5,6,3,7,6,5,2,6,5,4].map(v=>({v,s:2026}))}));
  assert.equal((await run(`runNbaStatsBackfill(env,{})`)).checked,1);
  assert.equal(db.prepare("SELECT l10_hits FROM stats_checks WHERE id='nba|old|1'").get().l10_hits,7);
  // A game on the pick's own day is never "before" it (Nov 1: a bare date read as midnight, so backfills saw the graded game).
  const tip=Date.parse('2026-10-30T23:00:00Z');
  assert.equal(run(`gameBefore({date:'2026-10-30'},${tip})`),false,'same day, bare date: not before');
  assert.equal(run(`gameBefore({date:'2026-10-29'},${tip})`),true,'the day before: before');
  assert.equal(run(`gameBefore({date:'2026-10-30',datetime:'2026-10-30T23:00:00.000Z'},${tip})`),false,'the game itself (timestamp): not before');
  assert.equal(run(`gameBefore({datetime:'2026-10-30T17:00:00.000Z'},${tip})`),true,'an earlier game that day (timestamp): before');
  // No sharp price, no NBA pick (Nov 2): priced posts, unpriced after a pull is held, not pulled yet waits.
  {const T='2026-11-03T00:00:00.000Z',ins=(pl,pin,at)=>db.prepare("INSERT INTO sharp_shadow (id,sport,event_id,player,market,side,line,odds,book,edge,game_time,logged_at,pin_fair) VALUES (?,'NBA','NBA--sg',?,'Points','Over',20.5,-110,'b',2,?,?,?)").run('NBA--sg|'+pl.toLowerCase().replace(/[^a-z]/g,'')+'|Points',pl,T,at,pin);
   ins('Priced Guy',55,'2026-11-02T10:00:00.000Z');ins('Unpriced Guy',null,'2026-11-02T10:00:00.000Z');ins('Fresh Guy',null,'2026-11-02T13:00:00.000Z');ins('Same Run Guy',null,'2026-11-02T12:00:00.000Z');
   // Nov 5: the sharp book must agree, for the pick's own side and line.
   ins('Disagree Guy',50,'2026-11-02T10:00:00.000Z');ins('Flip Good',40,'2026-11-02T10:00:00.000Z');ins('Flip Bad',55,'2026-11-02T10:00:00.000Z');ins('Moved Line',58,'2026-11-02T10:00:00.000Z');
   db.prepare("UPDATE sharp_shadow SET side='Under' WHERE player IN ('Flip Good','Flip Bad')").run();db.prepare("UPDATE sharp_shadow SET line=19.5 WHERE player='Moved Line'").run();
   db.prepare("UPDATE sharp_shadow SET pin_at='2026-11-02T12:00:00.000Z' WHERE id='NBA--sg|pricedguy|Points'").run();
   const c=n=>({gameId:'NBA--sg',player:n,market:'Points',side:'Over',line:20.5,odds:-110,edge:2,gameTime:T});
   const g=JSON.parse(JSON.stringify(await run(`sharpGate(env,${JSON.stringify(['Priced Guy','Unpriced Guy','Same Run Guy','Fresh Guy','New Guy','Disagree Guy','Flip Good','Flip Bad','Moved Line'].map(c))},${Date.parse('2026-11-02T14:00:00Z')})`)));
   assert.deepEqual(g.ready.map(p=>p.player),['Priced Guy','Flip Good'],'sharp agrees: 55% vs 52.4% implied; the Under logged at 40% is 60% for the Over');assert.deepEqual(g.held.map(p=>p.player),['Unpriced Guy','Same Run Guy','Disagree Guy','Flip Bad','Moved Line'],'logged in the same run as the pull counts as checked');assert.deepEqual(g.deferred.map(p=>p.player),['Fresh Guy','New Guy']);
   const why=Object.fromEntries(g.held.map(p=>[p.player,p.heldWhy]));assert.equal(why['Disagree Guy'],'sharp book disagrees');assert.equal(why['Flip Bad'],'sharp book disagrees','the other side at 55% leaves the Over 45%');assert.equal(why['Moved Line'],'no sharp price at this line');
   const log=JSON.parse(db.prepare("SELECT value FROM app_settings WHERE key='signal-held:2026-11-02'").get().value);assert.ok(log.some(x=>x.player==='Unpriced Guy'&&x.why==='no sharp price'),'held and logged with the reason')}
  // Nov 5 (Tim, pick to win): singles at +125 or shorter; NBA picks whose own numbers disagree are held.
  {const J=v=>JSON.parse(JSON.stringify(v)),at=Date.parse('2026-11-05T20:00:00Z');
   const ok=J(await run(`capSingles(env,[{player:'At 125',odds:125},{player:'At 126',odds:126},{player:'Fav',odds:-110}],${at})`));
   assert.deepEqual(ok.map(p=>p.player),['At 125','Fav'],'+126 and longer are not singles');
   const log=JSON.parse(db.prepare("SELECT value FROM app_settings WHERE key='signal-held:2026-11-05'").get().value);assert.ok(log.some(x=>x.player==='At 126'&&x.why==='price over +125'),'held and logged with the reason');
   // Recent games first: five 2s then five 8s against Over 4.5 -> his typical game backs it (a signal) but the projection leans under: held.
   const mk=vals=>({logs:vals.map(v=>({v,s:2026})),def:null});
   for(const [n,vals] of [['slumpingguy',[2,2,2,2,2,8,8,8,8,8]],['hotguy',Array(10).fill(8)],['slumpingapp',[2,2,2,2,2,8,8,8,8,8]]])db.prepare('INSERT OR REPLACE INTO app_settings (key,value) VALUES (?,?)').run(`matchup:cand|NBA--sg2|${n}|Rebounds`,JSON.stringify(mk(vals)));
   const c=(n,extra={})=>({gameId:'NBA--sg2',player:n,market:'Rebounds',side:'Over',line:4.5,odds:-110,edge:2,gameTime:'2026-11-06T00:00:00.000Z',...extra});
   const g=J(await run(`signalGate(env,null,${JSON.stringify([c('Slumping Guy'),c('Hot Guy'),c('Slumping App',{exchange:'Novig'})])},${at})`));
   assert.deepEqual(g.ready.map(p=>p.player),['Hot Guy','Slumping App'],'stats back it: posts; prediction-app picks are not held for it');
   assert.deepEqual(g.held.map(p=>[p.player,p.heldWhy]),[['Slumping Guy','his stats disagree']]);
   // "We passed on N tonight": the held sportsbook picks for this NBA night, by reason (prediction-app ones left out).
   const ps=J(await run(`passedSummary(env,'NBA',${at})`));assert.equal(ps.count,1);assert.deepEqual(ps.reasons,{price:0,stats:1,sharp:0,other:0});}
  // NFL blank stat = 0 (Nov 3, J.K. Dobbins: carries and a TD, receiving left blank).
  assert.equal(run(`nflZeroStat('Receiving Yards',{rushing_attempts:9,receptions:null,receiving_yards:null})`),true,'no catches, ran the ball: 0 receiving yards');
  assert.equal(run(`nflZeroStat('Receiving Yards',{rushing_attempts:9,receptions:2})`),false,'had catches: never assumed 0');
  assert.equal(run(`nflZeroStat('Rushing Yards',{receptions:4,rushing_attempts:null})`),true,'no carries, caught the ball: 0 rushing yards');
  assert.equal(run(`nflZeroStat('Receiving Yards',{})`),true,'a whole blank row, as before');
  assert.equal(run(`nflZeroStat('Field Goals Made',{})`),false,'never kickers');assert.equal(run(`nflZeroStat('Receiving Yards',{missingPlayerStats:true})`),false,'no row: only from a full box score');
  console.log('PASS: NBA matchup data (defense allowed by position from box scores, day by day; ranked among 25+ teams with 5+ games, else last season; a new pick waits up to 12 minutes for its matchup; top pick prefers strong form; NBA stats check and its backfill)');
})().catch(e=>{console.error(e);process.exit(1)});
