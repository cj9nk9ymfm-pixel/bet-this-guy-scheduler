// Public callers may request a snapshot, but never supply authoritative record
// fields. Only an exact, current provider offer can become a verified snapshot.
const VERIFIED_RECORD_SOURCE = 'market-verified-v2';
const recordLabels = {
  player_pass_yds:'Passing Yards', player_pass_yds_q1:'First Quarter Passing Yards',
  player_pass_tds:'Passing Touchdowns', player_pass_completions:'Pass Completions',
  player_pass_attempts:'Pass Attempts', player_pass_interceptions:'Interceptions Thrown',
  player_pass_longest_completion:'Longest Pass Completion', player_pass_rush_yds:'Passing + Rushing Yards',
  player_pass_rush_reception_tds:'Pass + Rush + Receiving TDs', player_pass_rush_reception_yds:'Pass + Rush + Receiving Yards',
  player_rush_yds:'Rushing Yards',player_rush_attempts:'Rush Attempts',player_rush_longest:'Longest Rush',
  player_rush_tds:'Rushing Touchdowns',player_receptions:'Receptions',player_reception_yds:'Receiving Yards',
  player_reception_longest:'Longest Reception',player_reception_tds:'Receiving Touchdowns',
  player_rush_reception_yds:'Rush + Receiving Yards',player_rush_reception_tds:'Rush + Receiving Touchdowns',
  player_kicking_points:'Kicking Points',player_field_goals:'Field Goals Made',player_pats:'Extra Points',
  player_sacks:'Sacks',player_solo_tackles:'Solo Tackles',player_tackles_assists:'Tackles + Assists',
  player_defensive_interceptions:'Defensive Interceptions',player_tds:'Touchdowns',player_tds_over:'Touchdowns',
  player_anytime_td:'Anytime Touchdown',player_1st_td:'First Touchdown',player_last_td:'Last Touchdown',player_assists:'Assists',
};
const recordDecimal = odds => odds > 0 ? 1+odds/100 : 1+100/Math.abs(odds);
const recordAmerican = decimal => decimal>=2 ? Math.round((decimal-1)*100) : Math.round(-100/(decimal-1));
async function boundedRecordId(kind, legs) {
  const canonical=legs.map(leg=>[leg.gameId,leg.player,leg.market,leg.side,leg.line]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(canonical)));
  return `${kind}|v2|${Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('')}`;
}
function verifiedRecordLeg(input,event,now=Date.now()) {
  const start=Date.parse(event?.commence_time||'');
  if(!Number.isFinite(start)||start<=now||start>now+8*86400000)return null;
  if(!input||!['Over','Under'].includes(input.side)||BTGStats.number(input.line)===null)return null;
  const offers=[];
  for(const book of event.bookmakers||[])for(const market of book.markets||[]) {
    const raw=String(market.key||'').replace(/_alternate$/,''), label=recordLabels[raw];
    if(label!==input.market)continue;
    const updated=Date.parse(market.last_update||book.last_update||'');
    if(!Number.isFinite(updated)||now-updated>15*60000||updated>now+60000)continue;
    const binary=['player_anytime_td','player_1st_td','player_last_td'].includes(raw);
    for(const outcome of market.outcomes||[]) {
      const name=String(outcome.name||''), direction=name.toLowerCase();
      const player=String(outcome.description||(binary&&!['yes','no'].includes(direction)?name:'')).trim();
      const side=binary?(direction==='no'?'Under':'Over') : direction==='over'?'Over':direction==='under'?'Under':null;
      const line=binary?.5:BTGStats.number(outcome.point),odds=BTGStats.number(outcome.price);
      if(player!==input.player||side!==input.side||line!==Number(input.line)||odds===null||Math.abs(odds)<100||Math.abs(odds)>100000)continue;
      offers.push({player,market:label,side,line,odds,sport:'NFL',gameId:event.eventID||`NFL--${event.id}`,gameTime:new Date(start).toISOString(),team:`${event.away_team} · @ ${event.home_team}`});
    }
  }
  // Respect selected-book preferences: the requested price must exist in the
  // current feed, but need not be the best price across every sportsbook.
  return offers.find(offer=>offer.odds===BTGStats.number(input.odds))||null;
}
async function verifiedRecordStatements(records,request,env,ctx) {
  const boards=new Map(),now=Date.now();
  const requested=records.flatMap(record=>record.kind==='parlay'?record.legs||[]:[record]);
  const ids=[...new Set(requested.map(leg=>leg?.gameId))];
  if(ids.length>16||ids.some(id=>!/^NFL--[A-Za-z0-9_-]{4,100}$/.test(String(id))))throw new Error('Invalid game');
  for(const id of ids){
    const url=new URL('/api/event',request.url);url.searchParams.set('eventID',id);
    const response=await eventProps(new Request(url),env,ctx);
    if(!response.ok||response.headers.get('x-feed-cache')==='stale')throw new Error('Feed unavailable');
    const body=await response.json(),event=body.data?.[0];
    if(!event||event.eventID!==id)throw new Error('Invalid feed identity');
    boards.set(id,event);
  }
  const statements=[],idsOut=[];
  for(const record of records){
    if(!['prop','parlay'].includes(record.kind))throw new Error('Invalid kind');
    const inputs=record.kind==='parlay'?record.legs:[record];
    if(!Array.isArray(inputs)||!inputs.length||inputs.length>10||(record.kind==='parlay'&&inputs.length<2))throw new Error('Invalid legs');
    const legs=inputs.map(input=>verifiedRecordLeg(input,boards.get(input.gameId),now));
    if(legs.some(leg=>!leg))throw new Error('Offer changed or not verified');
    if(legs.some(leg=>Date.parse(leg.gameTime)>=OFFICIAL_START))throw new Error('Next-week official selections are published by the server only');
    if(new Set(legs.map(leg=>normalizedName(leg.player))).size!==legs.length)throw new Error('Duplicate player');
    const scorerKeys=legs.filter(leg=>/^(First|Last) Touchdown$/.test(leg.market)&&leg.side==='Over').map(leg=>`${leg.gameId}|${leg.market}`);
    if(new Set(scorerKeys).size!==scorerKeys.length)throw new Error('Conflicting scorers');
    const id=await boundedRecordId(record.kind,legs),first=legs[0],postedAt=new Date(now).toISOString();
    const combined=record.kind==='parlay'?recordAmerican(legs.reduce((product,leg)=>product*recordDecimal(leg.odds),1)):null;
    const gameTime=legs.map(leg=>leg.gameTime).sort().at(-1);
    statements.push(env.DB.prepare("INSERT OR IGNORE INTO public_recommendations (id, kind, sport, player, market, side, line, odds, combined_odds, game_id, game_time, legs_json, posted_at, status, source, verification_note) VALUES (?, ?, 'NFL', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)")
      .bind(id,record.kind,record.kind==='prop'?first.player:null,record.kind==='prop'?first.market:null,record.kind==='prop'?first.side:null,record.kind==='prop'?first.line:null,record.kind==='prop'?first.odds:null,combined,first.gameId,gameTime,JSON.stringify(legs),postedAt,VERIFIED_RECORD_SOURCE,'Generated selection; every leg verified against a pregame provider offer. Combined odds are an estimate, not a sportsbook SGP quote.'));
    idsOut.push(id);
  }
  return {statements,ids:idsOut};
}

// Tuesday noon UTC keeps Monday-night NFL games in the preceding slate.
const OFFICIAL_START=Date.parse('2026-09-22T12:00:00Z');
const OFFICIAL_CAPS={props:100,reasonable:15,swing:10,moonshot:5};
function officialWeek(time){const d=new Date(Number(time)-12*3600000);d.setUTCHours(0,0,0,0);d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+5)%7);return d.toISOString().slice(0,10)}
const officialPlayer=leg=>`${leg.gameId}|${normalizedName(leg.player)}`;
function officialCandidates(events,now=Date.now()){
  const result=[];
  for(const event of events){
    const kickoff=Date.parse(event.commence_time);
    if(kickoff<OFFICIAL_START||kickoff<=now+5*60000||kickoff>now+24*3600000)continue;
    const groups=new Map();
    for(const book of event.bookmakers||[])for(const market of book.markets||[]){
      const label=recordLabels[market.key],updated=Date.parse(market.last_update||book.last_update||'');
      if(!label||!BTGStats.supports({market:label})||/_alternate$/.test(market.key)||!Number.isFinite(updated)||now-updated>15*60000||updated>now+60000)continue;
      for(const outcome of market.outcomes||[]){
        const side=String(outcome.name).toLowerCase(),line=BTGStats.number(outcome.point),odds=BTGStats.number(outcome.price),player=String(outcome.description||'').trim();
        if(!['over','under'].includes(side)||!player||line===null||odds===null||Math.abs(odds)<100||Math.abs(odds)>10000)continue;
        const key=JSON.stringify([player,label,line]),group=groups.get(key)||{player,market:label,line,books:new Map()};
        const pair=group.books.get(book.key)||{};pair[side]={odds,book:book.title||book.key};group.books.set(book.key,pair);groups.set(key,group);
      }
    }
    for(const group of groups.values()){
      const pairs=[...group.books.values()].filter(p=>p.over&&p.under);
      if(pairs.length<3)continue;
      const fair=pairs.reduce((sum,p)=>{const o=1/recordDecimal(p.over.odds),u=1/recordDecimal(p.under.odds);return sum+o/(o+u)},0)/pairs.length;
      const options=['over','under'].map(side=>{const best=pairs.map(p=>p[side]).sort((a,b)=>recordDecimal(b.odds)-recordDecimal(a.odds))[0];return{side:side==='over'?'Over':'Under',...best,edge:100*((side==='over'?fair:1-fair)-1/recordDecimal(best.odds))}}).sort((a,b)=>b.edge-a.edge);
      const best=options[0];
      if(best.edge<1||best.edge>12)continue;
      const leg=verifiedRecordLeg({...group,...best},event,now);
      if(leg)result.push({...leg,edge:best.edge,book:best.book,playerKey:officialPlayer(leg)});
    }
  }
  // One market per player/game prevents alternate lines or opposite sides
  // from multiplying the official sample. Highest qualifying edge wins.
  const seen=new Set();return result.sort((a,b)=>b.edge-a.edge||a.playerKey.localeCompare(b.playerKey)).filter(p=>{if(seen.has(p.playerKey))return false;seen.add(p.playerKey);return true});
}
// Parlays wait until the first leg is this close to kickoff, when the most
// picks qualify. Built earlier, the 2-leg tier used every pair as soon as two
// picks existed, and the one-shared-leg rule then blocked every bigger parlay.
const PARLAY_WINDOW=2*3600000;
function officialPlan(candidates,existing,week,now=Date.now()){
  const saved=existing.map(r=>({...r,legs:recordLegs(r)})),counts=Object.fromEntries(Object.keys(OFFICIAL_CAPS).map(t=>[t,saved.filter(r=>r.id.startsWith(`official|${week}|${t}|`)).length]));
  const plan=[],singles=saved.filter(r=>r.kind==='prop'),games=new Map(),used=new Set(singles.flatMap(r=>r.legs.map(officialPlayer)));
  singles.forEach(r=>games.set(r.game_id,(games.get(r.game_id)||0)+1));
  for(const p of candidates){if(counts.props>=100)break;if(used.has(p.playerKey)||(games.get(p.gameId)||0)>=8)continue;plan.push({tier:'props',legs:[p]});counts.props++;used.add(p.playerKey);games.set(p.gameId,(games.get(p.gameId)||0)+1)}
  const prior=saved.filter(r=>r.kind==='parlay').map(r=>r.legs.map(officialPlayer)),exposure=new Map();prior.flat().forEach(k=>exposure.set(k,(exposure.get(k)||0)+1));
  // Hardest tiers first: they need the most unshared legs.
  const tiers=[['moonshot',4,7,2501,15000],['swing',3,6,1000,2500],['reasonable',2,4,100,999]];
  const soon=p=>Date.parse(p.gameTime)<=now+PARLAY_WINDOW;
  if(!candidates.some(soon))return plan;
  for(const [tier,min,max,low,high] of tiers){
    for(let attempt=0;attempt<500&&counts[tier]<OFFICIAL_CAPS[tier];attempt++){
      const size=min+attempt%(max-min+1),legs=[],gameIds=new Set(),markets=new Map();
      const pool=[...candidates].sort((a,b)=>(exposure.get(a.playerKey)||0)-(exposure.get(b.playerKey)||0)||b.edge-a.edge);
      if(!pool.length)break;
      for(let j=0;j<pool.length&&legs.length<size;j++){
        const p=pool[(j+Math.floor(attempt/(max-min+1)))%pool.length];
        if((exposure.get(p.playerKey)||0)>=3||gameIds.has(p.gameId)||(markets.get(p.market)||0)>=2)continue;
        // Skip a leg that would make this parlay share two players with a posted one.
        if(prior.some(keys=>keys.includes(p.playerKey)&&legs.some(l=>keys.includes(l.playerKey))))continue;
        legs.push(p);gameIds.add(p.gameId);markets.set(p.market,(markets.get(p.market)||0)+1);
      }
      if(legs.length!==size||!legs.some(soon))continue;
      const odds=recordAmerican(legs.reduce((d,p)=>d*recordDecimal(p.odds),1)),keys=legs.map(p=>p.playerKey);
      if(odds<low||odds>high||prior.some(p=>p.filter(k=>keys.includes(k)).length>1))continue;
      plan.push({tier,legs});counts[tier]++;prior.push(keys);keys.forEach(k=>exposure.set(k,(exposure.get(k)||0)+1));
    }
  }
  return plan;
}
async function writeOfficialPlan(plan,week,env){
  const prefix=`official|${week}|`,statements=[];
  for(const pick of plan){
    const now=Date.now();if(pick.legs.some(p=>Date.parse(p.gameTime)<=now+5*60000))continue;
    const kind=pick.tier==='props'?'prop':'parlay',legs=pick.legs.map(p=>({...p,officialWeek:week,officialTier:pick.tier})),first=legs[0],id=prefix+pick.tier+'|'+await boundedRecordId(kind,legs);
    const combined=kind==='parlay'?recordAmerican(legs.reduce((d,p)=>d*recordDecimal(p.odds),1)):null;
    // Every condition is evaluated inside the INSERT, so concurrent visitors
    // cannot exceed caps, repeat a player as a single, or bypass overlap limits.
    statements.push(env.DB.prepare(`INSERT OR IGNORE INTO public_recommendations
      (id,kind,sport,player,market,side,line,odds,combined_odds,game_id,game_time,legs_json,posted_at,status,source,verification_note)
      SELECT ?,?,'NFL',?,?,?,?,?,?,?,?,?,?,'pending',?,?
      WHERE (SELECT COUNT(*) FROM public_recommendations WHERE id>=? AND id<?)< ?
      AND (?='parlay' OR ((SELECT COUNT(*) FROM public_recommendations WHERE id>=? AND id<? AND game_id=?)<8
        AND NOT EXISTS(SELECT 1 FROM public_recommendations r,json_each(r.legs_json) l WHERE r.id>=? AND r.id<? AND json_extract(l.value,'$.playerKey')=?)))
      AND (?='prop' OR (NOT EXISTS(SELECT 1 FROM public_recommendations r WHERE r.id>=? AND r.id<? AND r.kind='parlay'
        AND (SELECT COUNT(*) FROM json_each(r.legs_json) l WHERE json_extract(l.value,'$.playerKey') IN (SELECT json_extract(value,'$.playerKey') FROM json_each(?)))>1)
        AND NOT EXISTS(SELECT 1 FROM json_each(?) n WHERE (SELECT COUNT(*) FROM public_recommendations r,json_each(r.legs_json) l WHERE r.id>=? AND r.id<? AND r.kind='parlay' AND json_extract(l.value,'$.playerKey')=json_extract(n.value,'$.playerKey'))>=3)))`)
      .bind(id,kind,kind==='prop'?first.player:null,kind==='prop'?first.market:null,kind==='prop'?first.side:null,kind==='prop'?first.line:null,kind==='prop'?first.odds:null,combined,first.gameId,legs.map(p=>p.gameTime).sort().at(-1),JSON.stringify(legs),new Date(now).toISOString(),VERIFIED_RECORD_SOURCE,'Official weekly selection. Pregame odds locked; multi-book price signal, not a player projection. Parlay payout is an estimate.',prefix+pick.tier+'|',prefix+pick.tier+'|\uffff',OFFICIAL_CAPS[pick.tier],kind,prefix+'props|',prefix+'props|\uffff',first.gameId,prefix+'props|',prefix+'props|\uffff',first.playerKey,kind,prefix,prefix+'\uffff',JSON.stringify(legs),JSON.stringify(legs),prefix,prefix+'\uffff'));
  }
  if(!statements.length)return 0;
  // Returns how many picks were actually inserted (the rest were duplicates or over a cap).
  const results=await env.DB.batch(statements);
  return (results||[]).reduce((n,r)=>n+(Number(r?.meta?.changes??r?.changes)||0),0);
}
// Price trail: every publish run records each pending pick's current price,
// so a pick's line movement can be shown after the game. Each point is
// {t: time, o: best price at our line or null, l: main line, m: best price
// at the main line}. Stops 25 minutes before kickoff so it never races the
// closing-line capture, and writes one field so it never overwrites it.
function officialTrailPoint(event,leg,now){
  const offers=[];
  for(const book of event.bookmakers||[])for(const market of book.markets||[]){
    const raw=String(market.key||'').replace(/_alternate$/,''),label=recordLabels[raw];
    if(label!==leg.market)continue;
    const updated=Date.parse(market.last_update||book.last_update||'');
    if(!Number.isFinite(updated)||now-updated>15*60000||updated>now+60000)continue;
    const binary=['player_anytime_td','player_1st_td','player_last_td'].includes(raw);
    for(const outcome of market.outcomes||[]){
      const name=String(outcome.name||''),direction=name.toLowerCase();
      const player=String(outcome.description||(binary&&!['yes','no'].includes(direction)?name:'')).trim();
      const side=binary?(direction==='no'?'Under':'Over'):direction==='over'?'Over':direction==='under'?'Under':null;
      const line=binary?.5:BTGStats.number(outcome.point),odds=BTGStats.number(outcome.price);
      if(player!==leg.player||side!==leg.side||line===null||odds===null||Math.abs(odds)<100)continue;
      offers.push({line,odds,book:book.key,alternate:market.key.endsWith('_alternate')});
    }
  }
  const best=list=>list.length?list.reduce((a,b)=>recordDecimal(b.odds)>recordDecimal(a.odds)?b:a).odds:null;
  const ours=best(offers.filter(o=>o.line===Number(leg.line)));
  const books=new Map();for(const o of offers.filter(o=>!o.alternate))books.set(o.line,new Set([...(books.get(o.line)||[]),o.book]));
  const main=[...books.keys()].sort((a,b)=>books.get(b).size-books.get(a).size||Math.abs(a-leg.line)-Math.abs(b-leg.line))[0];
  if(ours===null&&main===undefined)return null;
  const line=main===undefined?Number(leg.line):main;
  return {t:now,o:ours,l:line,m:best(offers.filter(o=>!o.alternate&&o.line===line))};
}
function officialTrailStatements(boards,existing,env,now=Date.now()){
  const events=new Map(boards.map(e=>[e.eventID||`NFL--${e.id}`,e])),statements=[];
  for(const row of existing){
    if(row.status!=='pending')continue;
    recordLegs(row).forEach((leg,i)=>{
      const event=events.get(leg.gameId);
      if(!event||!(Date.parse(leg.gameTime)>now+25*60000))return;
      const point=officialTrailPoint(event,leg,now);if(!point)return;
      const trail=Array.isArray(leg.priceTrail)?leg.priceTrail:[],last=trail.at(-1);
      // Unchanged prices are only re-recorded every three hours.
      if(last&&last.o===point.o&&last.l===point.l&&last.m===point.m&&now-last.t<3*3600000)return;
      statements.push(env.DB.prepare(`UPDATE public_recommendations SET legs_json=json_set(legs_json,'$[${i}].priceTrail',json(?)) WHERE id=? AND status='pending' AND json_valid(legs_json)`).bind(JSON.stringify([...trail,point].slice(-48)),row.id));
    });
  }
  return statements;
}
let officialPublishing=null,officialCheckedAt=0,snapshotPrunedAt=0;
function queueOfficialPicks(request,env,ctx){
  if(!env.DB||!env.THE_ODDS_API_KEY||!ctx?.waitUntil||Date.now()<OFFICIAL_START)return;
  if(officialPublishing){ctx.waitUntil(officialPublishing);return}if(Date.now()-officialCheckedAt<10*60000)return;officialCheckedAt=Date.now();
  officialPublishing=publishOfficialPicks(request,env,ctx).catch(e=>console.error('official_publication_failed',e.message)).finally(()=>{officialPublishing=null});ctx.waitUntil(officialPublishing);
}

async function publishOfficialPicks(request,env,ctx){
  if(Date.now()<OFFICIAL_START)return {state:"not_started"};

    const now=Date.now(),week=officialWeek(now),prefix=`official|${week}|`;
    const schedule=await futureSchedule(new Request(new URL('/api/schedule',request.url)),env,ctx);if(!schedule.ok)throw new Error('Official schedule unavailable');
    const body=await schedule.json();
    const events=(body.data||[]).filter(e=>{const t=Date.parse(e.status?.startsAt);return t>now+5*60000&&t<=now+24*3600000&&officialWeek(t)===week}).slice(0,16);
    const boards=[];let failedBoards=0;
    for(let i=0;i<events.length;i+=4){const results=await Promise.allSettled(events.slice(i,i+4).map(async e=>{const url=new URL('/api/event',request.url);url.searchParams.set('eventID',e.eventID);const r=await eventProps(new Request(url),env,ctx);if(!r.ok||r.headers.get('x-feed-cache')==='stale')throw new Error('Official board unavailable');return (await r.json()).data||[]}));for(const r of results)if(r.status==='fulfilled')boards.push(...r.value);else failedBoards++}
    const existing=await env.DB.prepare('SELECT * FROM public_recommendations WHERE id>=? AND id<?').bind(prefix,prefix+'\uffff').all();
    const candidates=officialCandidates(boards,Date.now());const posted=await writeOfficialPlan(officialPlan(candidates,existing.results||[],week,Date.now()),week,env);
    if(posted){const alerts=sendPickAlerts(env).catch(error=>console.warn('pick_alerts_failed',error.message));if(ctx?.waitUntil)ctx.waitUntil(alerts);else await alerts}
    // Emails check every run: picks held back by the hourly limit go out on a later run.
    {const emails=sendEmailAlerts(env).catch(error=>console.warn('email_alerts_failed',error.message));if(ctx?.waitUntil)ctx.waitUntil(emails);else await emails}
    {const mine=sendBookAlerts(env,boards).catch(error=>console.warn('book_alerts_failed',error.message));if(ctx?.waitUntil)ctx.waitUntil(mine);else await mine}
    // Odds snapshots older than a week are no longer read; clear them hourly so
    // the database stays small (the history endpoint's own cleanup rarely runs).
    if(Date.now()-snapshotPrunedAt>3600000){snapshotPrunedAt=Date.now();const prune=env.DB.prepare('DELETE FROM movement_snapshots WHERE captured_at<?').bind(Date.now()-7*86400000).run().catch(error=>console.warn('snapshot_prune_failed',error.message));if(ctx?.waitUntil)ctx.waitUntil(prune);else await prune}
    const trail=officialTrailStatements(boards,existing.results||[],env,Date.now());if(trail.length)await env.DB.batch(trail);

  if(failedBoards)throw new Error('Some official boards were unavailable; retry required');
  return {state:"completed"};
}

// Weekly pick pages (/picks and /picks/2026/week-3): every official pick of an
// NFL week, server-rendered for search engines and for sharing.
const weeklyEscape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
// Week 1 starts the Tuesday after Labor Day (first Monday of September).
function nflWeek1Tuesday(season){const d=new Date(Date.UTC(season,8,1));while(d.getUTCDay()!==1)d.setUTCDate(d.getUTCDate()+1);d.setUTCDate(d.getUTCDate()+1);return d.getTime()}
function nflWeekOf(weekStart){
  const start=Date.parse(`${weekStart}T00:00:00Z`);if(!Number.isFinite(start))return null;
  const month=new Date(start).getUTCMonth(),season=new Date(start).getUTCFullYear()-(month<2?1:0);
  const week=Math.floor((start-nflWeek1Tuesday(season))/(7*86400000))+1;
  return week>=1&&week<=22?{season,week,start}:null;
}
function weekStartFor(season,week){const t=nflWeek1Tuesday(season)+(week-1)*7*86400000;return new Date(t).toISOString().slice(0,10)}
const weeklyDecimal=o=>{o=Number(o);return o>=100?1+o/100:o<=-100?1+100/Math.abs(o):null};
const weeklyOdds=o=>{o=Number(o);return Number.isFinite(o)?(o>0?`+${o}`:`${o}`):'—'};
const weeklyGraded=r=>r.status!=='provisional'&&['won','lost','push'].includes(r.result);
const weeklyLegText=l=>/touchdown/i.test(l.market||'')&&Number(l.line)===0.5?`${l.side==='Under'?'No ':''}${l.market}`:`${l.side} ${l.line} ${String(l.market||'').toLowerCase()}`;
function weeklySummary(rows){
  const props=rows.filter(r=>r.kind==='prop'&&weeklyGraded(r)),parlays=rows.filter(r=>r.kind==='parlay'&&weeklyGraded(r));
  const pay=r=>{const d=weeklyDecimal(r.kind==='parlay'?r.combined_odds:r.odds);return r.result==='won'&&d?100*(d-1):r.result==='lost'?-100:0};
  const count=(list,res)=>list.filter(r=>r.result===res).length;
  const closes=props.filter(r=>r.closing_captured_at&&r.closing_odds!=null&&(r.closing_line==null||Math.abs(Number(r.closing_line)-Number(r.line))<=.01)).map(r=>(weeklyDecimal(r.odds)/weeklyDecimal(r.closing_odds)-1)*100>.05);
  return {wins:count(props,'won'),losses:count(props,'lost'),pushes:count(props,'push'),profit:props.reduce((s,r)=>s+pay(r),0),parlayWins:count(parlays,'won'),parlayLosses:count(parlays,'lost'),parlayProfit:parlays.reduce((s,r)=>s+pay(r),0),beat:closes.filter(Boolean).length,tracked:closes.length,pending:rows.filter(r=>!weeklyGraded(r)).length,total:rows.length};
}
// The dollar sign is escaped: tests splice this file in with a string replace, where dollar patterns are special.
const weeklyMoney=v=>(v<0?'−':'+')+'\u0024'+Math.abs(Math.round(v)).toLocaleString('en-US');
const weeklyDay=iso=>{const d=new Date(iso);return Number.isFinite(d.getTime())?d.toLocaleString('en-US',{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:'America/New_York'})+' ET':''};
const weeklyRange=start=>{const a=new Date(Date.parse(`${start}T12:00:00Z`)),b=new Date(a.getTime()+6*86400000),f=d=>d.toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'});const end=a.getUTCMonth()===b.getUTCMonth()?String(b.getUTCDate()):f(b);return `${f(a)}–${end}, ${b.getUTCFullYear()}`};
function weeklyShell({title,description,path,body}){
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#0e1013"><title>${weeklyEscape(title)}</title><meta name="description" content="${weeklyEscape(description)}"><link rel="canonical" href="${SITE_URL}${path}"><meta property="og:type" content="website"><meta property="og:title" content="${weeklyEscape(title)}"><meta property="og:description" content="${weeklyEscape(description)}"><meta property="og:url" content="${SITE_URL}${path}"><meta property="og:image" content="${SITE_URL}/og-image-v2.jpg"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image"><link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@600;700&display=swap" rel="stylesheet">
<style>body{margin:0;background:#0e1013;color:#edf1f7;font:15px/1.55 "DM Sans",system-ui,sans-serif}a{color:#6aa8ff}main{max-width:860px;margin:0 auto;padding:20px 16px 48px}header.top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:18px}header.top img{width:auto;height:28px;display:block}h1,h2{font-family:"Space Grotesk",sans-serif;line-height:1.15;color:#fff}h1{font-size:clamp(26px,5vw,38px);margin:6px 0 6px}h2{font-size:20px;margin:28px 0 10px}.eyebrow{margin:0;color:#5ff0b5;font:700 12px "Space Grotesk",sans-serif;letter-spacing:.16em}.lead{color:#b5b9bf;margin:0 0 16px}.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:0 0 18px}@media(max-width:480px){.stats{grid-template-columns:1fr 1fr}}.stat{padding:12px 14px;border-radius:14px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1)}.stat strong{display:block;font:700 22px "Space Grotesk",sans-serif;color:#fff}.stat.up strong{color:#5ff0b5}.stat.down strong{color:#ff9d9d}.stat span{color:#b5b9bf;font-size:12.5px}.cta{display:inline-block;margin:4px 12px 4px 0;padding:11px 20px;border-radius:999px;background:#2563eb;color:#fff;font-weight:700;text-decoration:none}.picks{list-style:none;margin:0;padding:0;display:grid;gap:8px}.pick{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 12px;padding:12px 14px;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09)}.pick strong{color:#fff}.pick .bet{grid-column:1}.pick .meta{grid-column:1/-1;color:#a6aab0;font-size:12.5px}.pick .price{grid-row:1/3;grid-column:2;text-align:right;font:700 16px "Space Grotesk",sans-serif}.res{display:inline-block;margin-left:6px;padding:2px 8px;border-radius:999px;font-weight:700;font-size:11.5px;vertical-align:2px;background:#1e222a;color:#98a1ad}.res.won{background:rgba(34,197,94,.14);color:#22c55e}.res.lost{background:rgba(240,96,96,.14);color:#f06060}.won{color:#5ff0b5}.lost{color:#ff9d9d}.push,.pending{color:#ffd66e}.legs{margin:6px 0 0;padding-left:18px;color:#dce0e6;font-size:13.5px}.weeks{list-style:none;margin:0;padding:0;display:grid;gap:8px}.weeks a{display:flex;justify-content:space-between;gap:12px;padding:14px 16px;border-radius:14px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#fff;text-decoration:none}.weeks small{color:#b5b9bf}.pager{display:flex;justify-content:space-between;gap:12px;margin-top:28px}.pager a,header.top>a:last-child{display:inline-block;padding:10px 0}.site-nav{display:flex;align-items:center;gap:18px}.site-nav a{color:#98a1ad;font:600 14px/1 "DM Sans",sans-serif;text-decoration:none;padding:10px 0}.site-nav a[aria-current=page]{color:#f2f4f7}.site-nav a:hover{color:#f2f4f7}.fine{margin-top:32px;color:#969aa0;font-size:12px}@media (display-mode: standalone){body{padding-top:env(safe-area-inset-top)}}</style></head><body><main><header class="top"><a href="/"><img src="/logo.png" alt="Bet This Guy"></a><nav class="site-nav" aria-label="Main"><a href="/">Picks</a><a href="/trust">Results</a><a href="/about">About</a></nav></header>${body}<p class="fine">Research and entertainment only. Every official pick is locked before kickoff and graded from box scores; past results don’t guarantee future ones. Profit assumes $100 per pick at the posted price. 21+ where legal. If gambling stops being fun, call 1-800-GAMBLER. Questions? <a href="mailto:support@betthisguy.com">support@betthisguy.com</a></p><p class="fine">© 2026 Bet This Guy</p></main></body></html>`;
}
async function weeklyRows(env,weekStart){
  const prefix=`official|${weekStart}|`;
  const rows=await env.DB.prepare("SELECT id,kind,player,market,side,line,odds,combined_odds,game_time,posted_at,status,result,closing_line,closing_odds,closing_captured_at,legs_json FROM public_recommendations WHERE source='market-verified-v2' AND id>=? AND id<? ORDER BY game_time,posted_at").bind(prefix,prefix+'￿').all();
  return rows.results||[];
}
function weeklyPickItem(r){
  const legs=recordLegs(r),res=weeklyGraded(r)?r.result:'pending',label={won:'Won',lost:'Lost',push:'Push',pending:'Pending'}[res];
  if(r.kind==='parlay')return `<li class="pick"><div><strong>${legs.length}-leg parlay</strong> <span class="res ${res}">${label}</span></div><div class="price">${weeklyOdds(r.combined_odds)}</div><ul class="legs">${legs.map(l=>`<li>${weeklyEscape(l.player)} — ${weeklyEscape(weeklyLegText(l))} (${weeklyOdds(l.odds)})${l.actualValue!=null?` · had ${weeklyEscape(l.actualValue)}`:''}</li>`).join('')}</ul><div class="meta">Posted ${weeklyEscape(weeklyDay(r.posted_at))}</div></li>`;
  const leg=legs[0]||{},close=r.closing_odds!=null&&(r.closing_line==null||Math.abs(Number(r.closing_line)-Number(r.line))<=.01)?` · final price ${weeklyOdds(r.closing_odds)}`:'';
  return `<li class="pick"><div><strong>${weeklyEscape(r.player)}</strong> <span class="res ${res}">${label}</span></div><div class="price">${weeklyOdds(r.odds)}</div><div class="bet">${weeklyEscape(weeklyLegText({...leg,side:r.side,line:r.line,market:r.market}))}${leg.actualValue!=null?` · had ${weeklyEscape(leg.actualValue)}`:''}</div><div class="meta">${weeklyEscape(String(leg.team||'').replace(' · ',' '))} · ${weeklyEscape(weeklyDay(r.game_time))}${leg.book?` · ${weeklyEscape(leg.book)}`:''}${close}</div></li>`;
}
async function weeklyPage(request,env){
  if(!env.DB)return null;
  const url=new URL(request.url),headers={'content-type':'text/html; charset=utf-8','cache-control':'public, max-age=300'};
  if(url.pathname==='/picks'||url.pathname==='/picks/'){
    const weeks=await env.DB.prepare("SELECT substr(id,10,10) AS week, COUNT(*) AS n FROM public_recommendations WHERE source='market-verified-v2' AND id LIKE 'official|%' GROUP BY week ORDER BY week DESC").all();
    const items=[];
    for(const w of weeks.results||[]){const nfl=nflWeekOf(w.week);if(!nfl)continue;const s=weeklySummary(await weeklyRows(env,w.week));items.push(`<li><a href="/picks/${nfl.season}/week-${nfl.week}"><span><strong>Week ${nfl.week}</strong> <small>${weeklyRange(w.week)}</small></span><small>${s.wins+s.losses+s.pushes?`${s.wins}–${s.losses}${s.pushes?`–${s.pushes}`:''} · ${weeklyMoney(s.profit)}`:`${w.n} pick${w.n===1?'':'s'} posted`}${s.pending?` · ${s.pending} pending`:''}</small></a></li>`)}
    return new Response(weeklyShell({title:'NFL Player Prop Picks by Week | Bet This Guy',description:'Every official NFL player prop pick from Bet This Guy, week by week: locked before kickoff, graded from box scores, with prices and results.',path:'/picks',body:`<p class="eyebrow">OFFICIAL PICKS</p><h1>NFL player prop picks by week</h1><p class="lead">Every pick is locked before kickoff and graded in public. Tap a week for every bet, its price and how it finished.</p><ul class="weeks">${items.join('')||'<li>No weeks yet.</li>'}</ul><p><a class="cta" href="/">Open this week’s board →</a></p>`}),{headers});
  }
  const match=url.pathname.match(/^\/picks\/(\d{4})\/week-(\d{1,2})\/?$/);if(!match)return null;
  const season=+match[1],week=+match[2];if(week<1||week>22||season<2026||season>2100)return null;
  const start=weekStartFor(season,week),rows=await weeklyRows(env,start);
  if(!rows.length)return null;
  const s=weeklySummary(rows),singles=rows.filter(r=>r.kind==='prop'),parlays=rows.filter(r=>r.kind==='parlay'),graded=s.wins+s.losses+s.pushes;
  const record=graded?`${s.wins}–${s.losses}${s.pushes?`–${s.pushes}`:''}`:'';
  const title=`NFL Week ${week} Player Prop Picks & Results (${weeklyRange(start)}) | Bet This Guy`;
  const description=graded?`Every official NFL Week ${week} player prop pick, locked before kickoff: ${record} on singles, ${weeklyMoney(s.profit)} at $100 a pick${s.tracked?`, ${s.beat} of ${s.tracked} beat the closing price`:''}. Prices, books and results.`:`Official NFL Week ${week} player prop picks, locked before kickoff, with prices and books. Results post as games finish.`;
  const stats=graded?`<div class="stats"><div class="stat"><strong>${record}</strong><span>singles record</span></div><div class="stat ${s.profit>=0?'up':'down'}"><strong>${weeklyMoney(s.profit)}</strong><span>betting $100 a pick</span></div>${s.tracked?`<div class="stat"><strong>${s.beat} of ${s.tracked}</strong><span>beat the closing price</span></div>`:''}${s.parlayWins+s.parlayLosses?`<div class="stat ${s.parlayProfit>=0?'up':'down'}"><strong>${s.parlayWins}–${s.parlayLosses}</strong><span>parlays · ${weeklyMoney(s.parlayProfit)}</span></div>`:''}</div>`:'';
  // Only link to neighbouring weeks that have official picks (no dead links).
  const hasPicks=async w=>{if(w<1||w>22)return false;const prefix=`official|${weekStartFor(season,w)}|`;return Boolean((await env.DB.prepare("SELECT 1 AS hit FROM public_recommendations WHERE source='market-verified-v2' AND id>=? AND id<? LIMIT 1").bind(prefix,prefix+'\uffff').all()).results?.length)};
  const [hasPrev,hasNext]=await Promise.all([hasPicks(week-1),hasPicks(week+1)]);
  const prev=hasPrev?`<a href="/picks/${season}/week-${week-1}">← Week ${week-1}</a>`:'<span></span>',next=hasNext?`<a href="/picks/${season}/week-${week+1}">Week ${week+1} →</a>`:'<span></span>';
  const body=`<p class="eyebrow">OFFICIAL PICKS · ${season}</p><h1>NFL Week ${week} player prop picks</h1><p class="lead">${weeklyEscape(weeklyRange(start))} · ${singles.length} single${singles.length===1?'':'s'}, ${parlays.length} parlay${parlays.length===1?'':'s'}${s.pending?` · ${s.pending} still to play`:''}. Every pick was posted before kickoff at the best price we found.</p>${stats}<p><a class="cta" href="/">Open this week’s board →</a><a href="/trust#official" style="white-space:nowrap">All results →</a></p><h2>Singles</h2><ul class="picks">${singles.map(weeklyPickItem).join('')||'<li>No singles this week.</li>'}</ul>${parlays.length?`<h2>Parlays</h2><ul class="picks">${parlays.map(weeklyPickItem).join('')}</ul>`:''}<nav class="pager">${prev}${next}</nav>`;
  return new Response(weeklyShell({title,description,path:`/picks/${season}/week-${week}`,body}),{headers});
}
async function weeklySitemap(env){
  const paths=['/','/about','/trust','/legal','/picks'];
  try{const weeks=await env.DB.prepare("SELECT DISTINCT substr(id,10,10) AS week FROM public_recommendations WHERE source='market-verified-v2' AND id LIKE 'official|%' ORDER BY week").all();for(const w of weeks.results||[]){const nfl=nflWeekOf(w.week);if(nfl)paths.push(`/picks/${nfl.season}/week-${nfl.week}`)}}catch{}
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths.map(path=>`  <url><loc>${SITE_URL}${path}</loc></url>`).join('\n')}\n</urlset>\n`;
}

// Post kit (/post): ready-to-paste posts for X, Threads and Reddit plus a
// share image, for today's official picks and for a week's results. Not
// linked or indexed; the numbers are the same ones the weekly pages show.
// postKitTexts and postKitClient run in the browser too (sent as source), so
// they only use their arguments and browser built-ins.
function postKitTexts(kit){
  const D='\u0024',money=v=>(v<0?'−':'+')+D+Math.abs(Math.round(v)).toLocaleString('en-US');
  const odds=o=>{o=Number(o);return Number.isFinite(o)?(o>0?'+'+o:String(o)):''};
  const SHORT={'passing yards':'pass yds','rushing yards':'rush yds','receiving yards':'rec yds','receptions':'rec','passing touchdowns':'pass TDs','pass completions':'completions','passing completions':'completions','pass attempts':'pass att','passing attempts':'pass att','rushing attempts':'rush att','interceptions':'INTs','rush + rec yards':'rush+rec yds','rushing + receiving yards':'rush+rec yds'};
  const bet=(l,short)=>{const m=String(l.market||'').toLowerCase();if(/touchdown/.test(m)&&Number(l.line)===0.5)return (l.side==='Under'?'No ':'')+(short?'anytime TD':l.market);return short?`${l.side==='Under'?'u':'o'}${l.line} ${SHORT[m]||m}`:`${l.side} ${l.line} ${m}`};
  const day=iso=>new Date(iso).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',timeZone:'America/New_York'});
  const time=iso=>new Date(iso).toLocaleString('en-US',{weekday:'short',hour:'numeric',minute:'2-digit',timeZone:'America/New_York'})+' ET';
  const mark={won:'✅',lost:'❌',push:'↔️'};
  const line=(r,short,withResult)=>{
    const pre=withResult&&mark[r.result]?mark[r.result]+' ':'';
    if(r.kind==='parlay')return `${pre}${r.legs.length}-leg parlay (${odds(r.combined_odds)}): ${r.legs.map(l=>short?`${String(l.player).split(' ').slice(-1)[0]} ${bet(l,true)}`:`${l.player} ${bet(l,false)}`).join(' + ')}`;
    const had=withResult&&r.result&&r.legs[0]?.actualValue!=null?` — had ${r.legs[0].actualValue}`:'';
    return `${pre}${r.player} ${bet(r,short)} (${odds(r.odds)})${had}`;
  };
  // Add lines while the post fits; say how many were left out.
  const fit=(head,lines,foot,limit)=>{const kept=[];for(const l of lines){const more=lines.length-kept.length-1;const trial=[head,...kept,l,...(more?[`+${more} more on the site`]:[]),'',foot].join('\n');if(trial.length>limit)break;kept.push(l)}const left=lines.length-kept.length;return [head,...kept,...(left?[`+${left} more on the site`]:[]),'',foot].join('\n')};
  const site=kit.site.replace(/^https?:\/\//,'');
  const out={};
  const upcoming=kit.upcoming||[];
  const days=[...new Set(upcoming.map(r=>day(r.game_time)))];
  const when=days.length===1?days[0]:kit.current.week?`Week ${kit.current.week}`:'this week';
  const recWeek=kit.previous?.summary&&(kit.previous.summary.wins+kit.previous.summary.losses)?kit.previous:kit.current,rs=recWeek.summary;
  out.today={mode:'today',ready:upcoming.length>0,recordLabel:recWeek.week?`Week ${recWeek.week} record`:'Last week',recordValue:rs.wins+rs.losses?`${rs.wins}–${rs.losses}${rs.pushes?`–${rs.pushes}`:''} props`:'',recordProfit:rs.wins+rs.losses?rs.profit:null,empty:'No official picks are posted for upcoming games yet. Picks post up to 24 hours before kickoff; check back then.',eyebrow:`OFFICIAL PICKS · ${when.toUpperCase()}`,rows:upcoming,
    x:fit(`✅ Bet This Guy picks · ${when}`,upcoming.map(r=>line(r,true)),`Every pick locked before kickoff, graded in public 👇\n${site}`,275),
    threads:fit(`✅ Today’s Bet This Guy picks (${when})`,upcoming.map(r=>line(r,false)),`Every pick is locked before kickoff and graded in public, wins and losses. Free picks and alerts:\n${site}`,495),
    reddit:[`**Bet This Guy official picks: ${when}**`,'',...(upcoming.some(r=>r.kind==='prop')?['| Player | Bet | Odds | Book | Kickoff |','|---|---|---|---|---|',...upcoming.filter(r=>r.kind==='prop').map(r=>`| ${r.player} | ${bet(r,false)} | ${odds(r.odds)} | ${r.book||'—'} | ${time(r.game_time)} |`),'']:[]),...upcoming.filter(r=>r.kind==='parlay').map(r=>`**${r.legs.length}-leg parlay (${odds(r.combined_odds)}):** ${r.legs.map(l=>`${l.player} ${bet(l,false)}`).join(' + ')}`),...(upcoming.some(r=>r.kind==='parlay')?['']:[]),'How we pick: a prop only makes the list when the best sportsbook price beats the fair price from 3+ books. No projections or hype, just price.','',...(rs.wins+rs.losses?[`${recWeek.week?`Week ${recWeek.week}`:'Last week'}: ${rs.wins}–${rs.losses}${rs.pushes?`–${rs.pushes}`:''} on props, ${money(rs.profit)} at ${D}100 a pick${rs.tracked?`, ${rs.beat} of ${rs.tracked} beat the closing price`:''}.`,'']:[]),`Every pick is locked before kickoff and graded from box scores, wins and losses: ${kit.site}${kit.current.path}`].join('\n')};
  for(const key of ['current','previous']){
    const w=kit[key],s=w.summary,graded=w.rows.filter(r=>r.result),label=w.week?`Week ${w.week}`:'This week';
    const hits=graded.filter(r=>r.result==='won').sort((a,b)=>Number(b.kind==='parlay'?b.combined_odds:b.odds)-Number(a.kind==='parlay'?a.combined_odds:a.odds));
    const record=`${s.wins}–${s.losses}${s.pushes?`–${s.pushes}`:''}`,parlays=s.parlayWins+s.parlayLosses?`Parlays: ${s.parlayWins}–${s.parlayLosses} (${money(s.parlayProfit)})`:'';
    const head=`📊 ${label} results: ${record} on player props, ${money(s.profit)} betting ${D}100 a pick`+(key==='current'&&s.pending?' (so far)':'');
    const url=`${kit.site}${w.path}`,short=url.replace(/^https?:\/\//,'');
    out[key]={mode:key,ready:graded.length>0,empty:`No graded picks for ${label.toLowerCase()} yet.`,eyebrow:`${label.toUpperCase()} RESULTS`,label,record,profit:s.profit,parlays,beat:s.beat,tracked:s.tracked,rows:graded.slice().sort((a,b)=>({won:0,push:1,lost:2}[a.result]??3)-({won:0,push:1,lost:2}[b.result]??3)),
      x:fit([head,parlays].filter(Boolean).join('\n'),hits.filter(r=>r.kind==='prop').map(r=>line(r,true,true)),`Posted before kickoff. Full results 👇\n${short}`,275),
      threads:fit([head,parlays].filter(Boolean).join('\n'),hits.map(r=>line(r,false,true)),`Every pick was posted before kickoff and graded in public, the losses too. Full results:\n${short}`,495),
      reddit:[`**Bet This Guy ${label} results: ${record} on player props (${money(s.profit)} at ${D}100 a pick)**`,...(parlays?['',parlays]:[]),'',...graded.map(r=>`- ${line(r,false,true)}`),'',`Every pick was locked before kickoff and graded from box scores: ${url}`].join('\n')};
  }
  return out;
}
function postKitClient(kit,texts){
  const $=s=>document.querySelector(s),D='\u0024';
  const count=m=>{try{navigator.sendBeacon?.('/api/hit',new Blob([JSON.stringify({m:[m]})],{type:'application/json'}))}catch{}};
  const odds=o=>{o=Number(o);return Number.isFinite(o)?(o>0?'+'+o:String(o)):''};
  const logo=new Image();logo.src='/logo.png';
  let mode=texts.today.ready||!texts.current.ready?'today':'current',imageBlob=null;
  const copy=async(text,button)=>{try{await navigator.clipboard.writeText(text)}catch{const t=document.createElement('textarea');t.value=text;document.body.append(t);t.select();document.execCommand('copy');t.remove()}button.textContent='Copied ✓';setTimeout(()=>button.textContent='Copy',1600);count('post:copy')};
  const fitText=(ctx,text,max)=>{if(ctx.measureText(text).width<=max)return text;while(text.length>1&&ctx.measureText(text+'…').width>max)text=text.slice(0,-1);return text+'…'};
  const round=(ctx,x,y,w,h,r)=>{ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath()};
  async function draw(t){
    const W=1080,H=1350,c=document.createElement('canvas');c.width=W;c.height=H;const ctx=c.getContext('2d');
    try{await Promise.all([document.fonts.load('700 60px "Space Grotesk"'),document.fonts.load('600 30px "DM Sans"'),document.fonts.load('500 30px "DM Sans"')])}catch{}
    if(!logo.complete)await new Promise(r=>{logo.onload=logo.onerror=r});
    const C={bg:'#0e1013',panel:'#16191e',panel2:'#1e222a',line:'#272c35',text:'#f2f4f7',sub:'#c9d0d9',muted:'#98a1ad',dim:'#7d8692',link:'#6aa8ff',pos:'#22c55e',neg:'#f06060'};
    const font=(w,size,fam)=>`${w} ${size}px "${fam==='g'?'Space Grotesk':'DM Sans'}",sans-serif`;
    const text=(s,x,y,f,color,align='left')=>{ctx.font=f;ctx.fillStyle=color;ctx.textAlign=align;ctx.fillText(s,x,y);return ctx.measureText(s).width};
    const box=(x,y,w,h,r,fill,stroke)=>{round(ctx,x,y,w,h,r);ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=2;ctx.stroke()}};
    const nick=s=>String(s||'').trim().split(/\s+/).pop();
    const teams=r=>String(r.team||r.legs?.[0]?.team||'').split(/\s*·\s*@\s*|\s+@\s+/);
    const matchup=r=>{const [a,h]=teams(r);return a&&h?`${nick(a)} @ ${nick(h)}`:''};
    const et=(iso,o)=>new Date(iso).toLocaleString('en-US',{timeZone:'America/New_York',...o});
    const betText=r=>{const m=String(r.market||'').toLowerCase();return /touchdown/.test(m)&&Number(r.line)===0.5?(r.side==='Under'?'No anytime touchdown':'Anytime touchdown'):`${r.side} ${r.line} ${m}`};
    ctx.fillStyle=C.bg;ctx.fillRect(0,0,W,H);
    // Header: logo and a tag.
    if(logo.naturalWidth){const h=56,w=h*logo.naturalWidth/logo.naturalHeight;ctx.drawImage(logo,72,72,w,h)}
    const tag=t.mode==='today'?'Official picks':'Results';ctx.font=font(600,24,'d');const tw=ctx.measureText(tag).width+40;box(W-72-tw,74,tw,52,26,C.panel,C.line);text(tag,W-72-tw/2,108,font(600,24,'d'),C.muted,'center');
    let y=0;
    if(t.mode==='today'){
      const rows=t.rows,games=[...new Set(rows.map(r=>matchup(r)).filter(Boolean))],first=rows[0]?.game_time;
      const day=first?et(first,{weekday:'long'}):'',hour=first?Number(et(first,{hour:'numeric',hour12:false})):0;
      const prime=games.length===1&&first&&hour>=19?({Thursday:'Thursday Night Football',Sunday:'Sunday Night Football',Monday:'Monday Night Football'})[day]:'';
      const days=[...new Set(rows.map(r=>et(r.game_time,{weekday:'long'})))];
      const title=games.length===1?games[0]:days.length===1?`${days[0]}’s picks`:'This week’s picks';
      const sub=games.length===1?[prime||et(first,{weekday:'short',month:'short',day:'numeric'}),et(first,{hour:'numeric',minute:'2-digit'})+' ET'].join(' · '):`${days.length===1?et(first,{weekday:'short',month:'short',day:'numeric'})+' · ':''}${rows.length} picks across ${games.length} games`;
      ctx.font=font(700,76,'g');let size=76;while(ctx.measureText(title).width>W-144&&size>48){size-=4;ctx.font=font(700,size,'g')}
      text(title,72,262,font(700,size,'g'),C.text);text(sub,72,316,font(500,30,'d'),C.muted);
      // Pick cards: big for small slates, compact for big ones.
      const top=360,bottom=1050,n=rows.length,big=n<=4,gap=big?18:12,h=big?146:Math.max(84,Math.min(110,Math.floor((bottom-top-28)/Math.min(n,7))-gap));
      const shown=rows.slice(0,big?4:Math.floor((bottom-top-28+gap)/(h+gap)));
      // Small slates sit in the middle of the space instead of leaving a gap.
      y=top+Math.max(0,Math.floor((bottom-top-50-(shown.length*(h+gap)-gap))/2));
      for(const r of shown){
        box(72,y,W-144,h,24,C.panel,C.line);
        const isP=r.kind==='parlay',price=isP?odds(r.combined_odds):odds(r.odds),book=isP?`${r.legs.length}-leg parlay`:(r.book||'');
        const avR=big?42:30,ax=72+34+avR,ay=y+h/2;ctx.beginPath();ctx.arc(ax,ay,avR,0,Math.PI*2);ctx.fillStyle=C.panel2;ctx.fill();
        const ini=isP?String(r.legs.length)+'L':String(r.player||'').split(' ').map(x=>x[0]||'').join('').slice(0,2);text(ini,ax,ay+(big?11:9),font(700,big?30:22,'g'),C.muted,'center');
        const px=W-72-34;ctx.font=font(700,big?46:36,'g');const pw=Math.max(ctx.measureText(price).width,(ctx.font=font(500,big?22:19,'d'),ctx.measureText(book).width));
        text(price,px,y+(big?h/2+6:h/2+4),font(700,big?46:36,'g'),C.text,'right');if(book)text(book,px,y+(big?h/2+38:h/2+30),font(500,big?22:19,'d'),C.muted,'right');
        const nx=ax+avR+26,room=px-pw-30-nx;
        const name=isP?r.legs.map(l=>String(l.player).split(' ').slice(-1)[0]).join(' + '):r.player,detail=isP?r.legs.map(l=>betText(l)).join(' · '):betText(r)+(games.length>1&&matchup(r)?` · ${matchup(r)}`:'');
        ctx.font=font(700,big?38:31,'d');text(fitText(ctx,name,room),nx,y+(big?h/2-6:h/2-4),font(700,big?38:31,'d'),C.text);
        ctx.font=font(500,big?30:24,'d');text(fitText(ctx,detail,room),nx,y+(big?h/2+34:h/2+26),font(500,big?30:24,'d'),C.sub);
        y+=h+gap;
      }
      if(rows.length>shown.length)text(`+${rows.length-shown.length} more picks at betthisguy.com`,72,y+14,font(600,26,'d'),C.muted);
      else text('🔒 Prices locked before kickoff · graded in public, win or lose',72,y+14,font(500,24,'d'),C.muted);
      // Record card.
      box(72,1080,W-144,142,24,C.panel,C.line);
      if(t.recordValue){text(String(t.recordLabel).toUpperCase(),106,1132,font(700,22,'d'),C.muted);const rw=text(t.recordValue,106,1188,font(700,44,'g'),C.text);if(t.recordProfit!=null)text(` · ${t.recordProfit<0?'−':'+'}${D}${Math.abs(Math.round(t.recordProfit)).toLocaleString('en-US')}`,106+rw,1188,font(700,44,'g'),t.recordProfit<0?C.neg:C.pos)}
      else text('Every pick locked before kickoff',106,1162,font(700,32,'g'),C.text);
      text('betthisguy.com',W-106,1166,font(700,34,'g'),C.link,'right');
    }else{
      text(t.label?`${t.label} results`:'Results',72,262,font(700,64,'g'),C.text);
      const rw=text(t.record,72,392,font(700,120,'g'),C.text);text('player props',72+rw+24,392,font(500,32,'d'),C.muted);
      const pf=`${t.profit<0?'−':'+'}${D}${Math.abs(Math.round(t.profit)).toLocaleString('en-US')} betting ${D}100 a pick`;text(pf,72,452,font(700,36,'g'),t.profit<0?C.neg:C.pos);
      let ly=500;if(t.tracked){text(`${t.beat} of ${t.tracked} beat the closing price`,72,ly,font(600,28,'d'),C.sub);ly+=42}
      if(t.parlays){text(t.parlays,72,ly,font(500,28,'d'),C.muted);ly+=42}
      const rows=t.rows,top=ly+18,bottom=1170,h=Math.max(74,Math.min(104,Math.floor((bottom-top)/Math.max(1,Math.min(rows.length,8)))-10)),shown=rows.slice(0,Math.floor((bottom-top+10)/(h+10)));y=top;
      for(const r of shown){
        box(72,y,W-144,h,20,C.panel,C.line);const won=r.result==='won',lost=r.result==='lost',col=won?C.pos:lost?C.neg:C.muted;
        text(won?'HIT':lost?'MISS':'PUSH',106,y+h/2+9,font(700,24,'d'),col);
        const isP=r.kind==='parlay',price=isP?odds(r.combined_odds):odds(r.odds);ctx.font=font(700,32,'g');const pw=ctx.measureText(price).width;text(price,W-106,y+h/2+11,font(700,32,'g'),C.text,'right');
        const nx=206,room=W-106-pw-30-nx,name=isP?`${r.legs.length}-leg parlay`:r.player;
        const had=!isP&&r.legs?.[0]?.actualValue!=null?` · had ${r.legs[0].actualValue}`:'',detail=isP?r.legs.map(l=>String(l.player).split(' ').slice(-1)[0]).join(' + '):betText(r)+had+(r.beat===true?' · beat close':'');
        ctx.font=font(700,28,'d');text(fitText(ctx,name,room),nx,y+h/2-4,font(700,28,'d'),C.text);ctx.font=font(500,22,'d');text(fitText(ctx,detail,room),nx,y+h/2+26,font(500,22,'d'),C.muted);
        y+=h+10;
      }
      if(rows.length>shown.length)text(`+${rows.length-shown.length} more at betthisguy.com`,72,y+20,font(600,24,'d'),C.muted);
      text('Every pick locked before kickoff, graded from box scores',72,1232,font(500,24,'d'),C.muted);text('betthisguy.com',W-72,1232,font(700,30,'g'),C.link,'right');
    }
    text(`${D}100 a pick at the posted price. Not a guarantee. 21+ · Gambling problem? 1-800-GAMBLER`,W/2,1300,font(500,20,'d'),C.dim,'center');
    return new Promise(r=>c.toBlob(r,'image/png'));
  }
  async function show(){
    document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));
    const t=texts[mode];$('#empty').hidden=t.ready;$('#kit').hidden=!t.ready;$('#empty').textContent=t.empty;if(!t.ready)return;
    for(const k of ['x','threads','reddit']){$(`#${k}Text`).value=t[k];$(`#${k}Count`).textContent=`${t[k].length} characters`}
    imageBlob=null;$('#preview').removeAttribute('src');imageBlob=await draw(t);$('#preview').src=URL.createObjectURL(imageBlob);
  }
  document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;show()});
  document.querySelectorAll('[data-copy]').forEach(b=>b.onclick=()=>copy($(`#${b.dataset.copy}Text`).value,b));
  document.querySelectorAll('textarea').forEach(t=>t.oninput=()=>{$(`#${t.id.replace('Text','Count')}`).textContent=`${t.value.length} characters`});
  $('#openX').onclick=()=>{count('post:open');open('https://x.com/intent/post?text='+encodeURIComponent($('#xText').value),'_blank','noopener')};
  $('#openThreads').onclick=()=>{count('post:open');open('https://www.threads.net/intent/post?text='+encodeURIComponent($('#threadsText').value),'_blank','noopener')};
  $('#shareImage').onclick=async()=>{if(!imageBlob)return;const file=new File([imageBlob],`bet-this-guy-${mode}.png`,{type:'image/png'});count('post:image');if(navigator.canShare?.({files:[file]})){try{await navigator.share({files:[file]});return}catch(e){if(e?.name==='AbortError')return}}const a=document.createElement('a');a.href=URL.createObjectURL(imageBlob);a.download=file.name;a.click()};
  show();
}
async function postKitData(env,now=Date.now()){
  const week=officialWeek(now),previous=new Date(Date.parse(`${week}T00:00:00Z`)-7*86400000).toISOString().slice(0,10);
  const beat=r=>r.kind==='prop'&&r.closing_captured_at&&r.closing_odds!=null&&(r.closing_line==null||Math.abs(Number(r.closing_line)-Number(r.line))<=.01)?(weeklyDecimal(r.odds)/weeklyDecimal(r.closing_odds)-1)*100>.05:null;
  const slim=r=>{const legs=recordLegs(r);return {kind:r.kind,player:r.player,market:r.market,side:r.side,line:r.line,odds:r.odds,combined_odds:r.combined_odds,game_time:r.game_time,result:weeklyGraded(r)?r.result:null,book:legs[0]?.book||null,team:legs[0]?.team||null,beat:beat(r),closing_odds:r.closing_odds??null,legs:legs.map(l=>({player:l.player,market:l.market,side:l.side,line:l.line,odds:l.odds,team:l.team||null,actualValue:l.actualValue??null}))}};
  const pack=(start,rows)=>{const nfl=nflWeekOf(start);return {week:nfl?.week||null,season:nfl?.season||null,path:nfl?`/picks/${nfl.season}/week-${nfl.week}`:'/picks',summary:weeklySummary(rows),rows:rows.map(slim)}};
  const [thisWeek,lastWeek]=await Promise.all([weeklyRows(env,week),weeklyRows(env,previous)]);
  return {site:SITE_URL,upcoming:thisWeek.filter(r=>Date.parse(r.game_time)>now).map(slim),current:pack(week,thisWeek),previous:pack(previous,lastWeek)};
}
async function postKitPage(request,env){
  if(!env.DB)return new Response('Unavailable',{status:503});
  const kit=await postKitData(env),json=JSON.stringify(kit).replace(/</g,'\\u003c');
  const button='min-height:40px;padding:0 16px;border-radius:999px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.06);color:#e8f2ff;font:700 14px "Space Grotesk",sans-serif;cursor:pointer';
  const card=(id,name,extra)=>`<section class="card"><div class="card-head"><h2>${name}</h2><small id="${id}Count"></small></div><textarea id="${id}Text" rows="${id==='reddit'?10:7}" spellcheck="true" aria-label="${name} post text"></textarea><div class="row"><button type="button" class="primary" data-copy="${id}">Copy</button>${extra}</div></section>`;
  const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#0e1013"><title>Post kit · Bet This Guy</title><link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@600;700&display=swap" rel="stylesheet"><style>body{margin:0;background:#0e1013;color:#edf1f7;font:15px/1.5 "DM Sans",system-ui,sans-serif}main{max-width:760px;margin:0 auto;padding:20px 16px 48px}a{color:#6aa8ff}header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}header img{width:auto;height:28px;display:block}h1,h2{font-family:"Space Grotesk",sans-serif;color:#fff;line-height:1.15}h1{font-size:clamp(24px,5vw,32px);margin:4px 0}h2{font-size:17px;margin:0}.eyebrow{margin:0;color:#5ff0b5;font:700 12px "Space Grotesk",sans-serif;letter-spacing:.16em}.lead{margin:0 0 16px;color:#b5b9bf}.tabs{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 16px}.tabs button{${button}}.tabs button[aria-pressed="true"]{border-color:rgba(31,216,143,.6);background:rgba(31,216,143,.14);color:#5ff0b5}#empty{padding:16px;border-radius:14px;background:rgba(255,255,255,.05);color:#dce0e6}.image{display:grid;gap:10px;margin:0 0 18px}.image img{width:100%;max-width:420px;border-radius:16px;border:1px solid rgba(255,255,255,.12);background:#26282b;aspect-ratio:4/5}.card{margin:0 0 14px;padding:14px;border-radius:16px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1)}.card-head{display:flex;justify-content:space-between;align-items:baseline;margin:0 0 8px}.card-head small{color:#a6aab0}textarea{box-sizing:border-box;width:100%;padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:#181a1d;color:#edf1f7;font:16px/1.45 "DM Sans",system-ui,sans-serif;resize:vertical}.row{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;align-items:center}.row button,.row a.btn{${button};display:inline-flex;align-items:center;text-decoration:none}.row .primary{border:0;background:#2563eb;color:#fff}.tip{color:#a6aab0;font-size:12.5px;margin:6px 0 0}@media (display-mode: standalone){body{padding-top:env(safe-area-inset-top)}}.site-nav{display:flex;align-items:center;gap:18px}.site-nav a{color:#98a1ad;font:600 14px/1 "DM Sans",sans-serif;text-decoration:none;padding:10px 0}.site-nav a[aria-current=page]{color:#f2f4f7}.site-nav a:hover{color:#f2f4f7}</style></head><body><main><header><a href="/"><img src="/logo.png" alt="Bet This Guy"></a><nav class="site-nav" aria-label="Main"><a href="/">Picks</a><a href="/trust">Results</a><a href="/about">About</a></nav></header><p class="eyebrow">POST KIT</p><h1>Share the picks</h1><p class="lead">Pick what to post, copy the text for each app, and attach the image. You can edit any text before copying.</p><div class="tabs" role="group" aria-label="What to post"><button type="button" data-mode="today">Today’s picks</button><button type="button" data-mode="current">This week’s results</button><button type="button" data-mode="previous">Last week’s results</button></div><p id="empty" hidden></p><div id="kit" hidden><div class="image"><img id="preview" alt="Share image preview"><div class="row"><button type="button" class="primary" id="shareImage">Share or save image</button></div></div>${card('x','X (Twitter)','<button type="button" id="openX">Open X</button>')}${card('threads','Threads','<button type="button" id="openThreads">Open Threads</button>')}${card('reddit','Reddit','<a class="btn" href="https://www.reddit.com/r/sportsbook/" target="_blank" rel="noopener">Open r/sportsbook</a>')}<p class="tip">Reddit: post in the daily picks thread and check each subreddit’s rules; some remove links, so delete the last line if needed.</p></div></main><script type="application/json" id="kitData">${json}</script><script>${postKitTexts.toString()}\n(${postKitClient.toString()})(JSON.parse(document.getElementById('kitData').textContent),postKitTexts(JSON.parse(document.getElementById('kitData').textContent)));</script></body></html>`;
  return new Response(html,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-robots-tag':'noindex'}});
}

// A plain-text summary of the official record for the top of /trust, cached
// for five minutes per Worker instance.
let trustSnapshotCache={at:0,html:''};
async function trustSnapshot(env,now=Date.now()){
  if(trustSnapshotCache.html&&now-trustSnapshotCache.at<300000)return trustSnapshotCache.html;
  const rows=(await env.DB.prepare("SELECT id,kind,odds,combined_odds,status,result,closing_line,closing_odds,closing_captured_at,line FROM public_recommendations WHERE source='market-verified-v2' AND id LIKE 'official|%'").all()).results||[];
  const s=weeklySummary(rows),weeks=new Set(rows.map(r=>String(r.id).slice(9,19))).size,graded=s.wins+s.losses+s.pushes;
  const record=`${s.wins}–${s.losses}${s.pushes?`–${s.pushes}`:''}`,parlays=s.parlayWins+s.parlayLosses?` Parlays: ${s.parlayWins}–${s.parlayLosses} <span class="nowrap">(${weeklyMoney(s.parlayProfit)})</span>.`:'';
  const html=graded?`<p class="record-snapshot"><strong>Official record: ${record} on player props, ${weeklyMoney(s.profit)} betting \u0024100 a pick.</strong>${parlays} ${rows.length} official picks across ${weeks} week${weeks===1?'':'s'}, each locked before kickoff and graded from box scores. <a href="/picks">See every pick, week by week →</a></p>`:`<p class="record-snapshot">The official record started with the Sept. 24–28 slate. Every pick is locked before kickoff and graded from box scores. <a href="/picks">See the picks week by week →</a></p>`;
  trustSnapshotCache={at:now,html};
  return html;
}

// Anonymous usage counts: daily totals per metric. No cookies, IP addresses or
// per-person identifiers are stored; unknown metric names are ignored.
const USAGE_METRICS=new Set(['view:home','view:trust','view:picks','view:week','visit:new','visit:return','card:open','slip:add','parlay:add','share','hit:open','profile:open','affiliate:click','alerts:on','alerts:off','gate:shown','gate:signup','gate:login','alerts:email','view:post','post:copy','post:open','post:image','src:reddit','src:x','src:google','src:social','src:other','src:direct']);
const USAGE_BOTS=/bot|crawl|spider|slurp|preview|facebookexternalhit|curl|wget|python|headless|lighthouse/i;
async function countUsage(env,metrics,request){
  // The owner's own devices (opted out with /?me=1) are never counted.
  if(!env.DB||USAGE_BOTS.test(request.headers.get('user-agent')||'')||/(?:^|;\s*)btg_owner=1(?:;|$)/.test(request.headers.get('cookie')||''))return;
  const day=new Date().toISOString().slice(0,10),list=[...new Set(metrics)].filter(m=>USAGE_METRICS.has(m)).slice(0,4);
  if(!list.length)return;
  await env.DB.batch(list.map(metric=>env.DB.prepare('INSERT INTO usage_counts (day,metric,count) VALUES (?,?,1) ON CONFLICT(day,metric) DO UPDATE SET count=count+1').bind(day,metric)));
}
async function usageHit(request,env,ctx){
  if(request.method!=='POST')return new Response(null,{status:405});
  const text=(await request.text()).slice(0,300);
  let metrics=[];try{const body=JSON.parse(text);metrics=Array.isArray(body?.m)?body.m.map(String):[]}catch{}
  ctx.waitUntil(countUsage(env,metrics,request).catch(()=>{}));
  return new Response(null,{status:204,headers:{'cache-control':'no-store'}});
}

// Affiliate offers: off until the AFFILIATES setting (a secret on the Worker)
// holds approved partners, e.g.
//   [{"id":"underdog","name":"Underdog","url":"https://…","states":["TX","GA"]}]
// Links show only in listed US states, read per request from Cloudflare's
// request.cf.regionCode; the location is never stored.
function affiliatePartners(env){
  let list=[];try{list=JSON.parse(env.AFFILIATES||'[]')}catch{return []}
  return (Array.isArray(list)?list:[]).filter(p=>p&&/^[a-z0-9-]{2,30}$/.test(p.id||'')&&typeof p.name==='string'&&p.name.length<=40&&/^https:\/\/[^\s"'<>]+$/.test(p.url||'')&&Array.isArray(p.states)&&p.states.length).map(p=>({id:p.id,name:p.name,url:p.url,states:p.states.map(s=>String(s).toUpperCase()).filter(s=>/^[A-Z]{2}$/.test(s))}));
}
function affiliateOffers(request,env){
  const country=request.cf?.country,state=String(request.cf?.regionCode||'').toUpperCase();
  if(country!=='US'||!/^[A-Z]{2}$/.test(state))return [];
  return affiliatePartners(env).filter(p=>p.states.includes(state)).map(({id,name,url})=>({id,name,url}));
}
function affiliateApi(request,env){
  return new Response(JSON.stringify({success:true,offers:affiliateOffers(request,env)}),{headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store'}});
}

// Pick alerts: standard Web Push with no payload. The push only wakes the
// service worker, which fetches /api/alerts/latest for the text, so nothing
// needs encrypting. The Worker creates its own VAPID signing key on first use.
const PUSH_HOSTS=/(^|\.)(fcm\.googleapis\.com|push\.services\.mozilla\.com|push\.apple\.com|notify\.windows\.com)$/;
const b64url=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
async function appSetting(env,key){const row=await env.DB.prepare('SELECT value FROM app_settings WHERE key=?').bind(key).all();return row.results?.[0]?.value??null}
async function setAppSetting(env,key,value){await env.DB.prepare('INSERT INTO app_settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(key,value).run()}
async function vapidKeys(env){
  let saved=await appSetting(env,'vapid-v1');
  if(!saved){
    const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
    const value=JSON.stringify({publicKey:b64url(await crypto.subtle.exportKey('raw',pair.publicKey)),jwk:await crypto.subtle.exportKey('jwk',pair.privateKey)});
    // INSERT OR IGNORE: concurrent first requests keep whichever key landed first.
    await env.DB.prepare('INSERT OR IGNORE INTO app_settings (key,value) VALUES (?,?)').bind('vapid-v1',value).run();
    saved=await appSetting(env,'vapid-v1');
  }
  return JSON.parse(saved);
}
async function vapidAuthorization(env,endpoint,now=Date.now()){
  const keys=await vapidKeys(env),enc=new TextEncoder();
  const header=b64url(enc.encode(JSON.stringify({typ:'JWT',alg:'ES256'}))),claims=b64url(enc.encode(JSON.stringify({aud:new URL(endpoint).origin,exp:Math.floor(now/1000)+12*3600,sub:SITE_URL})));
  const key=await crypto.subtle.importKey('jwk',keys.jwk,{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
  const signature=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,enc.encode(`${header}.${claims}`));
  return `vapid t=${header}.${claims}.${b64url(signature)}, k=${keys.publicKey}`;
}
function validPushEndpoint(value){try{const url=new URL(value);return url.protocol==='https:'&&PUSH_HOSTS.test(url.hostname)&&value.length<=800}catch{return false}}
async function latestAlert(env,now=Date.now(),endpoint=null){
  if(endpoint&&validPushEndpoint(endpoint)){
    const mine=(await env.DB.prepare('SELECT sent_at,message_json FROM book_alerts WHERE recipient=? AND sent_at>? ORDER BY sent_at DESC LIMIT 1').bind(`push:${endpoint}`,new Date(now-15*60000).toISOString()).all()).results?.[0];
    const official=(await env.DB.prepare("SELECT posted_at FROM public_recommendations WHERE source='market-verified-v2' AND id LIKE 'official|%' ORDER BY posted_at DESC LIMIT 1").all()).results?.[0];
    if(mine&&(!official||mine.sent_at>official.posted_at)){try{const m=JSON.parse(mine.message_json);return {title:m.title,body:m.body,url:m.url||'/'}}catch{}}
  }
  const rows=await env.DB.prepare("SELECT kind,player,market,side,line,odds,combined_odds,legs_json FROM public_recommendations WHERE source='market-verified-v2' AND id LIKE 'official|%' AND posted_at>=? ORDER BY posted_at DESC LIMIT 3").bind(new Date(now-3*3600000).toISOString()).all();
  const picks=rows.results||[];
  if(!picks.length)return {title:'New Bet This Guy picks',body:'Fresh official picks are on the board.',url:'/'};
  const line=r=>r.kind==='parlay'?`${recordLegs(r).length}-leg parlay (${weeklyOdds(r.combined_odds)}): ${recordLegs(r).map(l=>l.player).join(' + ')}`:`${r.player} ${weeklyLegText(r)} (${weeklyOdds(r.odds)})`;
  return {title:picks.length===1?'✅ New Bet This Guy pick':`✅ ${picks.length} new Bet This Guy picks`,body:picks.map(line).join('\n'),url:'/'};
}
async function sendPickAlerts(env,now=Date.now()){
  if(!env.DB)return {sent:0};
  // One alert per 15 minutes: a batch of picks becomes one notification.
  const last=Date.parse(await appSetting(env,'last-alert-at')||'');
  if(Number.isFinite(last)&&now-last<15*60000)return {sent:0,throttled:true};
  await setAppSetting(env,'last-alert-at',new Date(now).toISOString());
  const subs=(await env.DB.prepare('SELECT endpoint,failures FROM push_subscriptions LIMIT 2000').all()).results||[];
  let sent=0;
  for(let i=0;i<subs.length;i+=20){
    await Promise.all(subs.slice(i,i+20).map(async sub=>{
      try{
        const response=await fetch(sub.endpoint,{method:'POST',headers:{TTL:'21600',Urgency:'normal','Content-Length':'0',Authorization:await vapidAuthorization(env,sub.endpoint,now)},signal:AbortSignal.timeout(10000)});
        if(response.status===404||response.status===410)return env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint=?').bind(sub.endpoint).run();
        if(response.ok){sent++;return sub.failures?env.DB.prepare('UPDATE push_subscriptions SET failures=0 WHERE endpoint=?').bind(sub.endpoint).run():null}
        throw new Error('push failed');
      }catch{
        return sub.failures>=4?env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint=?').bind(sub.endpoint).run():env.DB.prepare('UPDATE push_subscriptions SET failures=failures+1 WHERE endpoint=?').bind(sub.endpoint).run();
      }
    }));
  }
  return {sent,total:subs.length};
}
async function alertsApi(request,env){
  const url=new URL(request.url),headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store'},reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
  if(!env.DB)return reply({success:false},503);
  if(url.pathname==='/api/alerts/key'&&request.method==='GET')return reply({success:true,publicKey:(await vapidKeys(env)).publicKey});
  if(url.pathname==='/api/alerts/latest'&&request.method==='GET')return reply(await latestAlert(env,Date.now(),url.searchParams.get('endpoint')));
  if(request.method!=='POST')return reply({success:false},405);
  let body={};try{body=JSON.parse((await request.text()).slice(0,4000))}catch{}
  const endpoint=String(body?.endpoint||'');
  if(!validPushEndpoint(endpoint))return reply({success:false,error:'Unsupported push service.'},400);
  if(url.pathname==='/api/alerts/unsubscribe'){await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint=?').bind(endpoint).run();return reply({success:true})}
  if(url.pathname==='/api/alerts/subscribe'){
    const p256dh=String(body?.keys?.p256dh||''),auth=String(body?.keys?.auth||'');
    if(!/^[A-Za-z0-9_-]{40,200}$/.test(p256dh)||!/^[A-Za-z0-9_-]{8,60}$/.test(auth))return reply({success:false,error:'Invalid subscription.'},400);
    await env.DB.prepare('INSERT INTO push_subscriptions (endpoint,p256dh,auth,created_at,failures,books_json) VALUES (?,?,?,?,0,?) ON CONFLICT(endpoint) DO UPDATE SET p256dh=excluded.p256dh,auth=excluded.auth,failures=0,books_json=excluded.books_json').bind(endpoint,p256dh,auth,new Date().toISOString(),JSON.stringify(cleanBooks(body?.books))).run();
    return reply({success:true});
  }
  return reply({success:false},404);
}
// Email alerts: account holders who ticked "Email me when new picks post" get
// one email listing the official picks posted since the last email. Emails go
// out at most once an hour, or every 10 minutes when a pick kicks off within
// 90 minutes, and never for a game that has already started. Needs the
// RESEND_API_KEY secret; without it nothing is sent.
const EMAIL_ALERT_GAP=60*60000,EMAIL_ALERT_FROM='Bet This Guy <picks@betthisguy.com>';
const emailPickText=r=>r.kind==='parlay'?`${recordLegs(r).length}-leg parlay (${weeklyOdds(r.combined_odds)}): ${recordLegs(r).map(l=>`${l.player} ${weeklyLegText(l)}`).join(' + ')}`:`${r.player} ${weeklyLegText(r)} (${weeklyOdds(r.odds)})`;
function emailSubject(picks){
  if(picks.length>1)return `✅ ${picks.length} new Bet This Guy picks`;
  const r=picks[0];
  return r.kind==='parlay'?`✅ New ${recordLegs(r).length}-leg parlay (${weeklyOdds(r.combined_odds)})`:`✅ New pick: ${r.player} ${weeklyLegText(r)}`;
}
function emailPickRow(r){
  const cell='padding:14px 16px;border:1px solid #dbe6f2;border-radius:12px;background:#f4f8fd;';
  const when=`<div style="margin-top:4px;font-size:13px;color:#5a6f8c;">${weeklyEscape(weeklyDay(r.game_time))}</div>`;
  if(r.kind==='parlay'){
    const legs=recordLegs(r).map(l=>`<li style="margin:4px 0;">${weeklyEscape(l.player)} · ${weeklyEscape(weeklyLegText(l))}${l.odds!=null?` <span style="color:#5a6f8c;">(${weeklyEscape(weeklyOdds(l.odds))})</span>`:''}</li>`).join('');
    return `<tr><td style="${cell}"><div style="font-size:16px;font-weight:700;color:#10213d;">${recordLegs(r).length}-leg parlay <span style="float:right;color:#08875e;">${weeklyEscape(weeklyOdds(r.combined_odds))}</span></div><ul style="margin:8px 0 0;padding-left:18px;font-size:14px;color:#10213d;">${legs}</ul>${when}</td></tr><tr><td style="height:10px;"></td></tr>`;
  }
  const book=recordLegs(r)[0]?.book;
  return `<tr><td style="${cell}"><div style="font-size:16px;font-weight:700;color:#10213d;">${weeklyEscape(r.player)} <span style="float:right;color:#08875e;">${weeklyEscape(weeklyOdds(r.odds))}</span></div><div style="margin-top:4px;font-size:15px;color:#10213d;">${weeklyEscape(weeklyLegText(r))}${book?` <span style="color:#5a6f8c;">at ${weeklyEscape(book)}</span>`:''}</div>${when}</td></tr><tr><td style="height:10px;"></td></tr>`;
}
function emailAlertHtml(picks,unsubscribeUrl,postal,opts={}){
  const font="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const heading=opts.heading||(picks.length===1?'A new official pick just posted':`${picks.length} new official picks just posted`);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${weeklyEscape(opts.subject||emailSubject(picks))}</title></head><body style="margin:0;padding:0;background:#eef3f9;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eef3f9;"><tr><td align="center" style="padding:28px 12px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;"><tr><td align="center" style="background:#0e1013;border-radius:18px 18px 0 0;padding:24px;"><a href="${SITE_URL}" style="text-decoration:none;"><img src="${SITE_URL}/logo.png" width="220" alt="Bet This Guy" style="display:block;width:200px;max-width:70%;height:auto;border:0;color:#ffffff;font-family:Arial,sans-serif;font-size:22px;font-weight:700;"></a></td></tr><tr><td style="background:#ffffff;border-radius:0 0 18px 18px;padding:28px 24px;font-family:${font};color:#10213d;"><p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:.14em;color:#08875e;">${weeklyEscape(opts.eyebrow||'PICK ALERT')}</p><h1 style="margin:0 0 8px;font-size:24px;line-height:1.25;">${heading}</h1><p style="margin:0 0 20px;font-size:15px;line-height:1.5;color:#40597a;">${weeklyEscape(opts.lede||'Locked before kickoff and graded in public on our results page.')}</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${picks.map(emailPickRow).join('')}</table><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:14px 0 0;"><tr><td style="border-radius:999px;background:#1fd88f;"><a href="${SITE_URL}/" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:700;color:#04121f;text-decoration:none;border-radius:999px;">See the picks</a></td></tr></table><p style="margin:18px 0 0;font-size:13px;line-height:1.5;color:#5a6f8c;">Odds move. Check the price at your sportsbook before you bet.</p></td></tr><tr><td align="center" style="padding:20px 16px 0;font-family:${font};font-size:12px;line-height:1.6;color:#7f96b8;">You’re getting this because you turned on email alerts for your Bet This Guy account. Questions? Just reply.<br><a href="${weeklyEscape(unsubscribeUrl)}" style="color:#7f96b8;">Unsubscribe</a> · 21+ where legal. Gambling problem? Call 1-800-GAMBLER.${postal?`<br>${weeklyEscape(postal)}`:''}</td></tr></table></td></tr></table></body></html>`;
}
function emailAlertText(picks,unsubscribeUrl,postal,opts={}){
  return `${opts.heading||(picks.length===1?'A new official pick just posted':`${picks.length} new official picks just posted`)}:${opts.lede?`\n${opts.lede}`:''}\n\n${picks.map(r=>`- ${emailPickText(r)} · ${weeklyDay(r.game_time)}`).join('\n')}\n\nSee the picks: ${SITE_URL}/\n\nOdds move. Check the price at your sportsbook before you bet.\n\nUnsubscribe: ${unsubscribeUrl}\n21+ where legal. Gambling problem? Call 1-800-GAMBLER.${postal?`\n${postal}`:''}\n`;
}
async function sendEmailAlerts(env,now=Date.now()){
  if(!env.DB||!env.RESEND_API_KEY)return {sent:0,disabled:true};
  const last=await appSetting(env,'email-alert-at'),lastTime=Date.parse(last||'');
  const since=new Date(Number.isFinite(lastTime)?Math.max(lastTime,now-12*3600000):now-3*3600000).toISOString();
  const picks=(await env.DB.prepare("SELECT kind,player,market,side,line,odds,combined_odds,legs_json,game_time FROM public_recommendations WHERE source='market-verified-v2' AND id LIKE 'official|%' AND posted_at>? AND game_time>? ORDER BY game_time,posted_at LIMIT 12").bind(since,new Date(now).toISOString()).all()).results||[];
  if(!picks.length)return {sent:0};
  const soonest=Math.min(...picks.map(r=>Date.parse(r.game_time)||Infinity));
  if(Number.isFinite(lastTime)&&now-lastTime<(soonest-now<90*60000?10*60000:EMAIL_ALERT_GAP))return {sent:0,throttled:true};
  // Claim this send so two Worker instances can't email the same picks twice.
  const stamp=new Date(now).toISOString();
  const claim=last==null?await env.DB.prepare('INSERT OR IGNORE INTO app_settings (key,value) VALUES (?,?)').bind('email-alert-at',stamp).run():await env.DB.prepare('UPDATE app_settings SET value=? WHERE key=? AND value=?').bind(stamp,'email-alert-at',last).run();
  if(!Number(claim?.meta?.changes??claim?.changes))return {sent:0,claimed:false};
  const people=(await env.DB.prepare('SELECT a.token,p.email FROM email_alerts a JOIN user_profiles p ON p.auth_user_id=a.auth_user_id WHERE a.enabled=1 ORDER BY a.created_at LIMIT 2000').all()).results||[];
  const subject=emailSubject(picks),from=env.EMAIL_FROM||EMAIL_ALERT_FROM,postal=String(env.EMAIL_POSTAL_ADDRESS||'').trim();
  let sent=0;
  for(let i=0;i<people.length;i+=100){
    const batch=people.slice(i,i+100).map(person=>{
      const unsubscribe=`${SITE_URL}/api/email-alerts/unsubscribe?token=${person.token}`;
      return {from,to:[person.email],reply_to:env.EMAIL_REPLY_TO||'support@betthisguy.com',subject,html:emailAlertHtml(picks,unsubscribe,postal),text:emailAlertText(picks,unsubscribe,postal),headers:{'List-Unsubscribe':`<${unsubscribe}>`,'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'}};
    });
    try{
      const response=await fetch('https://api.resend.com/emails/batch',{method:'POST',headers:{authorization:`Bearer ${env.RESEND_API_KEY}`,'content-type':'application/json'},body:JSON.stringify(batch),signal:AbortSignal.timeout(15000)});
      if(response.ok)sent+=batch.length;else console.warn('email_alerts_failed',response.status);
    }catch(error){console.warn('email_alerts_failed',error.message)}
  }
  return {sent,total:people.length,picks:picks.length};
}
// "My book" alerts: a good-value price at one of someone's own sportsbooks.
// The fair price always comes from every book (3+ pricing both sides, the same
// bar as official picks); a book qualifies when its own price beats that fair
// price by 1% or more. These are never official picks and never touch the record.
// At most one message an hour and 3 props a day per person, never the same prop twice.
const BOOK_ALERT_DAILY=3,BOOK_ALERT_GAP=60*60000;
const bookKey=value=>{const key=String(value||'').toLowerCase().replace(/[^a-z0-9]/g,'');return key==='espnbet'?'thescorebet':key==='williamhillus'?'caesars':key};
function cleanBooks(list){return Array.isArray(list)?[...new Set(list.map(b=>String(b||'').slice(0,40)).filter(b=>/^[A-Za-z0-9 .&'+-]{2,40}$/.test(b)))].slice(0,20):[]}
function bookValueCandidates(events,now=Date.now()){
  const out=[];
  for(const event of events){
    const kickoff=Date.parse(event.commence_time);
    if(kickoff<OFFICIAL_START||kickoff<=now+5*60000||kickoff>now+24*3600000)continue;
    const groups=new Map();
    for(const book of event.bookmakers||[])for(const market of book.markets||[]){
      const label=recordLabels[market.key],updated=Date.parse(market.last_update||book.last_update||'');
      if(!label||/_alternate$/.test(market.key)||!Number.isFinite(updated)||now-updated>15*60000||updated>now+60000)continue;
      for(const outcome of market.outcomes||[]){
        const side=String(outcome.name).toLowerCase(),line=BTGStats.number(outcome.point),odds=BTGStats.number(outcome.price),player=String(outcome.description||'').trim();
        if(!['over','under'].includes(side)||!player||line===null||odds===null||Math.abs(odds)<100||Math.abs(odds)>10000)continue;
        const key=JSON.stringify([player,label,line]),group=groups.get(key)||{player,market:label,line,books:new Map()};
        const pair=group.books.get(book.key)||{title:book.title||book.key,key:book.key};pair[side]=odds;group.books.set(book.key,pair);groups.set(key,group);
      }
    }
    for(const group of groups.values()){
      const pairs=[...group.books.values()].filter(p=>p.over!=null&&p.under!=null);
      if(pairs.length<3)continue;
      const fair=pairs.reduce((sum,p)=>{const o=1/recordDecimal(p.over),u=1/recordDecimal(p.under);return sum+o/(o+u)},0)/pairs.length;
      for(const p of group.books.values())for(const side of ['over','under']){
        if(p[side]==null)continue;
        const edge=100*((side==='over'?fair:1-fair)-1/recordDecimal(p[side]));
        if(edge<1||edge>12)continue;
        out.push({propKey:`${event.eventID||event.id}|${group.player}|${group.market}|${group.line}|${side}`,player:group.player,market:group.market,line:group.line,side:side==='over'?'Over':'Under',odds:p[side],book:p.title,bookKey:bookKey(p.key),bookTitleKey:bookKey(p.title),edge,game_time:new Date(kickoff).toISOString(),matchup:`${event.away_team||''} @ ${event.home_team||''}`.trim()});
      }
    }
  }
  return out;
}
// The props worth telling one person about: best of their own books per prop,
// one prop per player and game, not an official pick, not sent before.
function bookAlertPicks(candidates,books,sentKeys,officialKeys,limit){
  const wanted=new Set(books.map(bookKey)),best=new Map();
  for(const c of candidates){
    if(!wanted.has(c.bookKey)&&!wanted.has(c.bookTitleKey))continue;
    const key=c.propKey.toLowerCase();if(sentKeys.has(c.propKey)||officialKeys.has(key))continue;
    const prior=best.get(c.propKey);if(!prior||c.edge>prior.edge)best.set(c.propKey,c);
  }
  const seenPlayer=new Set();
  return [...best.values()].sort((a,b)=>b.edge-a.edge).filter(c=>{const k=`${c.propKey.split('|')[0]}|${c.player}`;if(seenPlayer.has(k))return false;seenPlayer.add(k);return true}).slice(0,Math.max(0,limit));
}
const bookAlertRow=c=>({kind:'prop',player:c.player,market:c.market,side:c.side,line:c.line,odds:c.odds,game_time:c.game_time,legs_json:JSON.stringify([{book:c.book}])});
function bookAlertMessage(picks){
  const books=[...new Set(picks.map(c=>c.book))],where=books.length===1?books[0]:'your sportsbooks';
  return {title:`Good value at ${where}`,body:picks.map(c=>`${c.player} ${weeklyLegText(c)} (${weeklyOdds(c.odds)}${books.length>1?` at ${c.book}`:''})`).join('\n')+'\nNot an official pick.',url:'/',where};
}
async function sendBookAlerts(env,events,now=Date.now()){
  if(!env.DB)return {sent:0};
  const candidates=bookValueCandidates(events,now);if(!candidates.length)return {sent:0,candidates:0};
  const week=officialWeek(now),prefix=`official|${week}|`;
  const official=(await env.DB.prepare("SELECT id,player,market,line,side,game_time FROM public_recommendations WHERE id>=? AND id<? AND kind='prop'").bind(prefix,prefix+'￿').all()).results||[];
  const eventIds=new Map(candidates.map(c=>[`${c.player}|${c.market}|${c.line}|${c.side}|${c.game_time}`.toLowerCase(),c.propKey.toLowerCase()]));
  const officialKeys=new Set(official.map(r=>eventIds.get(`${r.player}|${r.market}|${r.line}|${r.side}|${new Date(r.game_time).toISOString()}`.toLowerCase())).filter(Boolean));
  const recipients=[];
  for(const row of (await env.DB.prepare("SELECT endpoint,books_json FROM push_subscriptions WHERE books_json IS NOT NULL AND books_json<>'[]' LIMIT 2000").all()).results||[]){let books=[];try{books=cleanBooks(JSON.parse(row.books_json))}catch{}if(books.length)recipients.push({id:`push:${row.endpoint}`,push:row,books})}
  if(env.RESEND_API_KEY)for(const row of (await env.DB.prepare('SELECT a.auth_user_id,a.token,p.email,u.preferences_json FROM email_alerts a JOIN user_profiles p ON p.auth_user_id=a.auth_user_id JOIN user_preferences u ON u.auth_user_id=a.auth_user_id WHERE a.enabled=1 LIMIT 2000').all()).results||[]){let books=[];try{books=cleanBooks(JSON.parse(row.preferences_json||'{}').books)}catch{}if(books.length&&row.email)recipients.push({id:`email:${row.auth_user_id}`,email:row,books})}
  let sent=0;const dayAgo=new Date(now-24*3600000).toISOString();
  for(const r of recipients){
    const history=(await env.DB.prepare('SELECT prop_key,sent_at FROM book_alerts WHERE recipient=? AND sent_at>? ORDER BY sent_at DESC').bind(r.id,new Date(now-7*86400000).toISOString()).all()).results||[];
    if(history[0]&&now-Date.parse(history[0].sent_at)<BOOK_ALERT_GAP)continue;
    const today=history.filter(h=>h.sent_at>dayAgo).length;
    const picks=bookAlertPicks(candidates,r.books,new Set(history.map(h=>h.prop_key)),officialKeys,BOOK_ALERT_DAILY-today);
    if(!picks.length)continue;
    const message=bookAlertMessage(picks),stamp=new Date(now).toISOString();
    // Claim first so two Worker instances can't send the same prop twice.
    const claims=await env.DB.batch(picks.map(c=>env.DB.prepare('INSERT OR IGNORE INTO book_alerts (recipient,prop_key,sent_at,message_json) VALUES (?,?,?,?)').bind(r.id,c.propKey,stamp,JSON.stringify(message))));
    if(!claims.some(c=>Number(c?.meta?.changes??c?.changes)))continue;
    try{
      if(r.push){
        const response=await fetch(r.push.endpoint,{method:'POST',headers:{TTL:'21600',Urgency:'normal','Content-Length':'0',Authorization:await vapidAuthorization(env,r.push.endpoint,now)},signal:AbortSignal.timeout(10000)});
        if(response.status===404||response.status===410){await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint=?').bind(r.push.endpoint).run();continue}
        if(response.ok)sent++;
      }else{
        const unsubscribe=`${SITE_URL}/api/email-alerts/unsubscribe?token=${r.email.token}`,postal=String(env.EMAIL_POSTAL_ADDRESS||'').trim(),rows=picks.map(bookAlertRow);
        const opts={subject:`${message.title}: ${picks.length===1?`${picks[0].player} ${weeklyLegText(picks[0])}`:`${picks.length} props`}`,heading:message.title,eyebrow:'YOUR SPORTSBOOK',lede:`These prices at ${message.where} beat the market's fair price. They are not official Bet This Guy picks and are not part of our record.`};
        const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:`Bearer ${env.RESEND_API_KEY}`,'content-type':'application/json'},body:JSON.stringify({from:env.EMAIL_FROM||EMAIL_ALERT_FROM,to:[r.email.email],reply_to:env.EMAIL_REPLY_TO||'support@betthisguy.com',subject:opts.subject,html:emailAlertHtml(rows,unsubscribe,postal,opts),text:emailAlertText(rows,unsubscribe,postal,opts),headers:{'List-Unsubscribe':`<${unsubscribe}>`,'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'}}),signal:AbortSignal.timeout(15000)});
        if(response.ok)sent++;else console.warn('book_alert_email_failed',response.status);
      }
    }catch(error){console.warn('book_alert_failed',error.message)}
  }
  return {sent,recipients:recipients.length,candidates:candidates.length};
}
// One-click unsubscribe. A plain visit shows a button (so link scanners can't
// unsubscribe anyone); mail apps' one-click POST unsubscribes straight away.
async function emailUnsubscribe(request,env){
  const url=new URL(request.url),token=url.searchParams.get('token')||'';
  const page=(title,body,status=200)=>new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex"><title>${weeklyEscape(title)} · Bet This Guy</title><style>body{margin:0;background:#050b1d;color:#e8f2ff;font:16px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif}main{max-width:440px;margin:12vh auto;padding:0 20px;text-align:center}h1{font-size:24px}p{color:#b8cbe4}button{min-height:46px;padding:0 26px;border:0;border-radius:999px;background:#1fd88f;color:#04121f;font-weight:700;font-size:16px;cursor:pointer}a{color:#5ff0b5}@media (display-mode: standalone){body{padding-top:env(safe-area-inset-top)}}</style></head><body><main><h1>${weeklyEscape(title)}</h1>${body}</main></body></html>`,{status,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
  if(!/^[0-9a-f]{64}$/.test(token)||!env.DB)return page('Link not recognised','<p>This unsubscribe link is incomplete. You can turn email alerts off in your account on <a href="/">betthisguy.com</a>.</p>',400);
  if(request.method==='POST'){
    await env.DB.prepare('UPDATE email_alerts SET enabled=0,updated_at=? WHERE token=?').bind(new Date().toISOString(),token).run();
    return page('You’re unsubscribed','<p>We won’t email you about new picks. You can turn alerts back on any time in your account on <a href="/">betthisguy.com</a>.</p>');
  }
  if(request.method!=='GET')return page('Not allowed','<p>Use the link in your email.</p>',405);
  return page('Stop pick emails?',`<p>You’ll stop getting an email when new Bet This Guy picks post.</p><form method="post"><button type="submit">Unsubscribe</button></form>`);
}
const SERVICE_WORKER_JS=`self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('push',event=>event.waitUntil((async()=>{
  let note={title:'New Bet This Guy pick',body:'A new official pick is on the board.',url:'/'};
  try{const sub=await self.registration.pushManager.getSubscription().catch(()=>null);const response=await fetch('/api/alerts/latest'+(sub?'?endpoint='+encodeURIComponent(sub.endpoint):''),{cache:'no-store'});if(response.ok)note=Object.assign(note,await response.json())}catch(error){}
  return self.registration.showNotification(note.title,{body:note.body,icon:'/icon-192.png',badge:'/icon-192.png',tag:'btg-pick',renotify:true,data:{url:note.url||'/'}});
})()));
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil((async()=>{
  const target=new URL((event.notification.data&&event.notification.data.url)||'/',self.location.origin).href;
  const open=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  for(const client of open){if(client.url.indexOf(self.location.origin)===0){await client.focus();if(client.navigate)return client.navigate(target);return}}
  return self.clients.openWindow(target);
})())});
`;
const WEB_MANIFEST=JSON.stringify({name:'Bet This Guy',short_name:'Bet This Guy',description:'NFL player prop picks, locked before kickoff and graded in public.',start_url:'/?source=home-screen',scope:'/',display:'standalone',background_color:'#0e1013',theme_color:'#0e1013',icons:[{src:'/icon-192.png',sizes:'192x192',type:'image/png',purpose:'any'},{src:'/icon-512.png',sizes:'512x512',type:'image/png',purpose:'any'}]});
