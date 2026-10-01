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
let officialPublishing=null,officialCheckedAt=0;
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
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#04091a"><title>${weeklyEscape(title)}</title><meta name="description" content="${weeklyEscape(description)}"><link rel="canonical" href="${SITE_URL}${path}"><meta property="og:type" content="website"><meta property="og:title" content="${weeklyEscape(title)}"><meta property="og:description" content="${weeklyEscape(description)}"><meta property="og:url" content="${SITE_URL}${path}"><meta property="og:image" content="${SITE_URL}/og-image.jpg"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image"><link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@600;700&display=swap" rel="stylesheet">
<style>body{margin:0;background:#04091a;color:#e8f2ff;font:15px/1.55 "DM Sans",system-ui,sans-serif}a{color:#9fd4ff}main{max-width:860px;margin:0 auto;padding:20px 16px 48px}header.top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:18px}header.top img{width:170px}h1,h2{font-family:"Space Grotesk",sans-serif;line-height:1.15;color:#fff}h1{font-size:clamp(26px,5vw,38px);margin:6px 0 6px}h2{font-size:20px;margin:28px 0 10px}.eyebrow{margin:0;color:#5ff0b5;font:700 12px "Space Grotesk",sans-serif;letter-spacing:.16em}.lead{color:#9fb6d6;margin:0 0 16px}.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:0 0 18px}@media(max-width:480px){.stats{grid-template-columns:1fr 1fr}}.stat{padding:12px 14px;border-radius:14px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1)}.stat strong{display:block;font:700 22px "Space Grotesk",sans-serif;color:#fff}.stat.up strong{color:#5ff0b5}.stat.down strong{color:#ff9d9d}.stat span{color:#9fb6d6;font-size:12.5px}.cta{display:inline-block;margin:4px 12px 4px 0;padding:11px 20px;border-radius:999px;background:linear-gradient(135deg,#1fd88f,#16b6d9);color:#04121f;font-weight:700;text-decoration:none}.picks{list-style:none;margin:0;padding:0;display:grid;gap:8px}.pick{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 12px;padding:12px 14px;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09)}.pick strong{color:#fff}.pick .bet{grid-column:1}.pick .meta{grid-column:1/-1;color:#8fa9c8;font-size:12.5px}.pick .price{grid-row:1/3;grid-column:2;text-align:right;font:700 16px "Space Grotesk",sans-serif}.res{font-weight:700;font-size:12.5px}.won{color:#5ff0b5}.lost{color:#ff9d9d}.push,.pending{color:#ffd66e}.legs{margin:6px 0 0;padding-left:18px;color:#cfe0f5;font-size:13.5px}.weeks{list-style:none;margin:0;padding:0;display:grid;gap:8px}.weeks a{display:flex;justify-content:space-between;gap:12px;padding:14px 16px;border-radius:14px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#fff;text-decoration:none}.weeks small{color:#9fb6d6}.pager{display:flex;justify-content:space-between;gap:12px;margin-top:28px}.fine{margin-top:32px;color:#7f96b8;font-size:12px}@media (display-mode: standalone){body{padding-top:env(safe-area-inset-top)}}</style></head><body><main><header class="top"><a href="/"><img src="/bet-this-guy-logo-v3.png" alt="Bet This Guy"></a><a href="/picks">All weeks</a></header>${body}<p class="fine">Research and entertainment only. Every official pick is locked before kickoff and graded from box scores; past results don’t guarantee future ones. Profit assumes $100 per pick at the posted price. 21+ where legal. If gambling stops being fun, call 1-800-GAMBLER. Questions? <a href="mailto:support@betthisguy.com">support@betthisguy.com</a></p></main></body></html>`;
}
async function weeklyRows(env,weekStart){
  const prefix=`official|${weekStart}|`;
  const rows=await env.DB.prepare("SELECT id,kind,player,market,side,line,odds,combined_odds,game_time,posted_at,status,result,closing_line,closing_odds,closing_captured_at,legs_json FROM public_recommendations WHERE source='market-verified-v2' AND id>=? AND id<? ORDER BY game_time,posted_at").bind(prefix,prefix+'￿').all();
  return rows.results||[];
}
function weeklyPickItem(r){
  const legs=recordLegs(r),res=weeklyGraded(r)?r.result:'pending',label={won:'✅ Won',lost:'❌ Lost',push:'↔ Push',pending:'⏳ Pending'}[res];
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
  const prev=week>1?`<a href="/picks/${season}/week-${week-1}">← Week ${week-1}</a>`:'<span></span>',next=`<a href="/picks/${season}/week-${week+1}">Week ${week+1} →</a>`;
  const body=`<p class="eyebrow">OFFICIAL PICKS · ${season}</p><h1>NFL Week ${week} player prop picks</h1><p class="lead">${weeklyEscape(weeklyRange(start))} · ${singles.length} single${singles.length===1?'':'s'}, ${parlays.length} parlay${parlays.length===1?'':'s'}${s.pending?` · ${s.pending} still to play`:''}. Every pick was posted before kickoff at the best price we found.</p>${stats}<p><a class="cta" href="/">Open this week’s board →</a><a href="/trust#official">Full track record →</a></p><h2>Singles</h2><ul class="picks">${singles.map(weeklyPickItem).join('')||'<li>No singles this week.</li>'}</ul>${parlays.length?`<h2>Parlays</h2><ul class="picks">${parlays.map(weeklyPickItem).join('')}</ul>`:''}<nav class="pager">${prev}${next}</nav>`;
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
  out.today={mode:'today',ready:upcoming.length>0,empty:'No official picks are posted for upcoming games yet. Picks post up to 24 hours before kickoff; check back then.',eyebrow:`OFFICIAL PICKS · ${when.toUpperCase()}`,rows:upcoming,
    x:fit(`✅ Bet This Guy picks · ${when}`,upcoming.map(r=>line(r,true)),`Every pick locked before kickoff, graded in public 👇\n${site}`,275),
    threads:fit(`✅ Today’s Bet This Guy picks (${when})`,upcoming.map(r=>line(r,false)),`Every pick is locked before kickoff and graded in public, wins and losses. Free picks and alerts:\n${site}`,495),
    reddit:[`**Bet This Guy official picks: ${when}**`,'',...(upcoming.some(r=>r.kind==='prop')?['| Player | Bet | Odds | Kickoff |','|---|---|---|---|',...upcoming.filter(r=>r.kind==='prop').map(r=>`| ${r.player} | ${bet(r,false)} | ${odds(r.odds)} | ${time(r.game_time)} |`),'']:[]),...upcoming.filter(r=>r.kind==='parlay').map(r=>`**${r.legs.length}-leg parlay (${odds(r.combined_odds)}):** ${r.legs.map(l=>`${l.player} ${bet(l,false)}`).join(' + ')}`),...(upcoming.some(r=>r.kind==='parlay')?['']:[]),`Every pick is locked before kickoff and graded from box scores, wins and losses: ${kit.site}${kit.current.path}`].join('\n')};
  for(const key of ['current','previous']){
    const w=kit[key],s=w.summary,graded=w.rows.filter(r=>r.result),label=w.week?`Week ${w.week}`:'This week';
    const hits=graded.filter(r=>r.result==='won').sort((a,b)=>Number(b.kind==='parlay'?b.combined_odds:b.odds)-Number(a.kind==='parlay'?a.combined_odds:a.odds));
    const record=`${s.wins}–${s.losses}${s.pushes?`–${s.pushes}`:''}`,parlays=s.parlayWins+s.parlayLosses?`Parlays: ${s.parlayWins}–${s.parlayLosses} (${money(s.parlayProfit)})`:'';
    const head=`📊 ${label} results: ${record} on player props, ${money(s.profit)} betting ${D}100 a pick`+(key==='current'&&s.pending?' (so far)':'');
    const url=`${kit.site}${w.path}`,short=url.replace(/^https?:\/\//,'');
    out[key]={mode:key,ready:graded.length>0,empty:`No graded picks for ${label.toLowerCase()} yet.`,eyebrow:`${label.toUpperCase()} RESULTS`,record,profit:s.profit,parlays,rows:hits.length?hits:graded,
      x:fit([head,parlays].filter(Boolean).join('\n'),hits.filter(r=>r.kind==='prop').map(r=>line(r,true,true)),`Posted before kickoff. Receipts 👇\n${short}`,275),
      threads:fit([head,parlays].filter(Boolean).join('\n'),hits.map(r=>line(r,false,true)),`Every pick was posted before kickoff and graded in public, the losses too. Full receipts:\n${short}`,495),
      reddit:[`**Bet This Guy ${label} results: ${record} on player props (${money(s.profit)} at ${D}100 a pick)**`,...(parlays?['',parlays]:[]),'',...graded.map(r=>`- ${line(r,false,true)}`),'',`Every pick was locked before kickoff and graded from box scores: ${url}`].join('\n')};
  }
  return out;
}
function postKitClient(kit,texts){
  const $=s=>document.querySelector(s),D='\u0024';
  const count=m=>{try{navigator.sendBeacon?.('/api/hit',new Blob([JSON.stringify({m:[m]})],{type:'application/json'}))}catch{}};
  const odds=o=>{o=Number(o);return Number.isFinite(o)?(o>0?'+'+o:String(o)):''};
  const logo=new Image();logo.src='/bet-this-guy-logo-v3.png';
  let mode=texts.today.ready||!texts.current.ready?'today':'current',imageBlob=null;
  const copy=async(text,button)=>{try{await navigator.clipboard.writeText(text)}catch{const t=document.createElement('textarea');t.value=text;document.body.append(t);t.select();document.execCommand('copy');t.remove()}button.textContent='Copied ✓';setTimeout(()=>button.textContent='Copy',1600);count('post:copy')};
  const fitText=(ctx,text,max)=>{if(ctx.measureText(text).width<=max)return text;while(text.length>1&&ctx.measureText(text+'…').width>max)text=text.slice(0,-1);return text+'…'};
  const round=(ctx,x,y,w,h,r)=>{ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath()};
  async function draw(t){
    const c=document.createElement('canvas');c.width=1080;c.height=1350;const ctx=c.getContext('2d');
    try{await document.fonts.load('700 60px "Space Grotesk"');await document.fonts.load('500 30px "DM Sans"')}catch{}
    if(!logo.complete)await new Promise(r=>{logo.onload=logo.onerror=r});
    const g=ctx.createLinearGradient(0,0,1080,1350);g.addColorStop(0,'#0b1d44');g.addColorStop(1,'#030814');ctx.fillStyle=g;ctx.fillRect(0,0,1080,1350);
    if(logo.naturalWidth){const w=560,h=w*logo.naturalHeight/logo.naturalWidth;ctx.drawImage(logo,(1080-w)/2,70,w,h)}
    ctx.textAlign='center';ctx.fillStyle='#5ff0b5';ctx.font='700 34px "Space Grotesk",sans-serif';ctx.fillText(t.eyebrow,540,300);
    const rows=t.rows.slice(0,t.mode==='today'?7:5),rowH=112,mark={won:'✅',lost:'❌',push:'↔️'};
    // Center the record and rows in the space between the title and the footer.
    const headH=t.mode==='today'?0:t.parlays?290:250,blockH=headH+rows.length*rowH+(t.rows.length>rows.length?50:0);
    let y=340+Math.max(0,(1180-340-blockH)/3);
    if(t.mode!=='today'){
      ctx.fillStyle='#ffffff';ctx.font='700 150px "Space Grotesk",sans-serif';ctx.fillText(t.record,540,y+130);
      ctx.fillStyle=t.profit>=0?'#5ff0b5':'#ff9d9d';ctx.font='700 46px "Space Grotesk",sans-serif';ctx.fillText(`${t.profit<0?'−':'+'}${D}${Math.abs(Math.round(t.profit)).toLocaleString('en-US')} betting ${D}100 a pick`,540,y+200);
      if(t.parlays){ctx.fillStyle='#b8cbe4';ctx.font='500 32px "DM Sans",sans-serif';ctx.fillText(t.parlays,540,y+252)}
      y+=t.parlays?290:250;
    }
    ctx.textAlign='left';
    for(const r of rows){
      round(ctx,70,y,940,rowH-14,22);ctx.fillStyle='rgba(255,255,255,.06)';ctx.fill();ctx.strokeStyle='rgba(255,255,255,.12)';ctx.lineWidth=2;ctx.stroke();
      const price=r.kind==='parlay'?odds(r.combined_odds):odds(r.odds);
      ctx.textAlign='right';ctx.fillStyle='#5ff0b5';ctx.font='700 40px "Space Grotesk",sans-serif';ctx.fillText(price,975,y+60);const pw=ctx.measureText(price).width;
      ctx.textAlign='left';const icon=t.mode!=='today'&&mark[r.result]?mark[r.result]+' ':'';
      const name=r.kind==='parlay'?`${icon}${r.legs.length}-leg parlay`:`${icon}${r.player}`;
      const detail=r.kind==='parlay'?r.legs.map(l=>String(l.player).split(' ').slice(-1)[0]).join(' + '):(()=>{const m=String(r.market||'').toLowerCase();return /touchdown/.test(m)&&Number(r.line)===0.5?(r.side==='Under'?'No ':'')+r.market:`${r.side} ${r.line} ${m}`})()+(t.mode!=='today'&&r.legs?.[0]?.actualValue!=null?` · had ${r.legs[0].actualValue}`:'')+(t.mode==='today'&&r.game_time?` · ${new Date(r.game_time).toLocaleString('en-US',{weekday:'short',hour:'numeric',minute:'2-digit',timeZone:'America/New_York'})} ET`:'');
      ctx.fillStyle='#ffffff';ctx.font='700 38px "Space Grotesk",sans-serif';ctx.fillText(fitText(ctx,name,880-pw),100,y+46);
      ctx.fillStyle='#b8cbe4';ctx.font='500 30px "DM Sans",sans-serif';ctx.fillText(fitText(ctx,detail,880-pw),100,y+84);
      y+=rowH;
    }
    ctx.textAlign='center';
    if(t.rows.length>rows.length){ctx.fillStyle='#9fb6d6';ctx.font='500 30px "DM Sans",sans-serif';ctx.fillText(`+${t.rows.length-rows.length} more at betthisguy.com`,540,y+30)}
    ctx.fillStyle='#9fb6d6';ctx.font='500 30px "DM Sans",sans-serif';ctx.fillText('Locked before kickoff · graded in public',540,1235);
    ctx.fillStyle='#ffffff';ctx.font='700 44px "Space Grotesk",sans-serif';ctx.fillText('betthisguy.com',540,1295);
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
  const slim=r=>({kind:r.kind,player:r.player,market:r.market,side:r.side,line:r.line,odds:r.odds,combined_odds:r.combined_odds,game_time:r.game_time,result:weeklyGraded(r)?r.result:null,legs:recordLegs(r).map(l=>({player:l.player,market:l.market,side:l.side,line:l.line,odds:l.odds,actualValue:l.actualValue??null}))});
  const pack=(start,rows)=>{const nfl=nflWeekOf(start);return {week:nfl?.week||null,season:nfl?.season||null,path:nfl?`/picks/${nfl.season}/week-${nfl.week}`:'/picks',summary:weeklySummary(rows),rows:rows.map(slim)}};
  const [thisWeek,lastWeek]=await Promise.all([weeklyRows(env,week),weeklyRows(env,previous)]);
  return {site:SITE_URL,upcoming:thisWeek.filter(r=>Date.parse(r.game_time)>now).map(slim),current:pack(week,thisWeek),previous:pack(previous,lastWeek)};
}
async function postKitPage(request,env){
  if(!env.DB)return new Response('Unavailable',{status:503});
  const kit=await postKitData(env),json=JSON.stringify(kit).replace(/</g,'\\u003c');
  const button='min-height:40px;padding:0 16px;border-radius:999px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.06);color:#e8f2ff;font:700 14px "Space Grotesk",sans-serif;cursor:pointer';
  const card=(id,name,extra)=>`<section class="card"><div class="card-head"><h2>${name}</h2><small id="${id}Count"></small></div><textarea id="${id}Text" rows="${id==='reddit'?10:7}" spellcheck="true" aria-label="${name} post text"></textarea><div class="row"><button type="button" class="primary" data-copy="${id}">Copy</button>${extra}</div></section>`;
  const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#04091a"><title>Post kit · Bet This Guy</title><link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@600;700&display=swap" rel="stylesheet"><style>body{margin:0;background:#04091a;color:#e8f2ff;font:15px/1.5 "DM Sans",system-ui,sans-serif}main{max-width:760px;margin:0 auto;padding:20px 16px 48px}a{color:#9fd4ff}header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}header img{width:160px}h1,h2{font-family:"Space Grotesk",sans-serif;color:#fff;line-height:1.15}h1{font-size:clamp(24px,5vw,32px);margin:4px 0}h2{font-size:17px;margin:0}.eyebrow{margin:0;color:#5ff0b5;font:700 12px "Space Grotesk",sans-serif;letter-spacing:.16em}.lead{margin:0 0 16px;color:#9fb6d6}.tabs{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 16px}.tabs button{${button}}.tabs button[aria-pressed="true"]{border-color:rgba(31,216,143,.6);background:rgba(31,216,143,.14);color:#5ff0b5}#empty{padding:16px;border-radius:14px;background:rgba(255,255,255,.05);color:#cfe0f5}.image{display:grid;gap:10px;margin:0 0 18px}.image img{width:100%;max-width:420px;border-radius:16px;border:1px solid rgba(255,255,255,.12);background:#0b1d44;aspect-ratio:4/5}.card{margin:0 0 14px;padding:14px;border-radius:16px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1)}.card-head{display:flex;justify-content:space-between;align-items:baseline;margin:0 0 8px}.card-head small{color:#8fa9c8}textarea{box-sizing:border-box;width:100%;padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:#07122b;color:#e8f2ff;font:16px/1.45 "DM Sans",system-ui,sans-serif;resize:vertical}.row{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;align-items:center}.row button,.row a.btn{${button};display:inline-flex;align-items:center;text-decoration:none}.row .primary{border:0;background:linear-gradient(135deg,#1fd88f,#16b6d9);color:#04121f}.tip{color:#8fa9c8;font-size:12.5px;margin:6px 0 0}@media (display-mode: standalone){body{padding-top:env(safe-area-inset-top)}}</style></head><body><main><header><a href="/"><img src="/bet-this-guy-logo-v3.png" alt="Bet This Guy"></a><a href="/picks">Weekly picks</a></header><p class="eyebrow">POST KIT</p><h1>Share the picks</h1><p class="lead">Pick what to post, copy the text for each app, and attach the image. You can edit any text before copying.</p><div class="tabs" role="group" aria-label="What to post"><button type="button" data-mode="today">Today’s picks</button><button type="button" data-mode="current">This week’s results</button><button type="button" data-mode="previous">Last week’s results</button></div><p id="empty" hidden></p><div id="kit" hidden><div class="image"><img id="preview" alt="Share image preview"><div class="row"><button type="button" class="primary" id="shareImage">Share or save image</button></div></div>${card('x','X (Twitter)','<button type="button" id="openX">Open X</button>')}${card('threads','Threads','<button type="button" id="openThreads">Open Threads</button>')}${card('reddit','Reddit','<a class="btn" href="https://www.reddit.com/r/sportsbook/" target="_blank" rel="noopener">Open r/sportsbook</a>')}<p class="tip">Reddit: post in the daily picks thread and check each subreddit’s rules; some remove links, so delete the last line if needed.</p></div></main><script type="application/json" id="kitData">${json}</script><script>${postKitTexts.toString()}\n(${postKitClient.toString()})(JSON.parse(document.getElementById('kitData').textContent),postKitTexts(JSON.parse(document.getElementById('kitData').textContent)));</script></body></html>`;
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
const USAGE_METRICS=new Set(['view:home','view:trust','view:picks','view:week','visit:new','visit:return','card:open','slip:add','parlay:add','share','hit:open','profile:open','affiliate:click','alerts:on','alerts:off','gate:shown','gate:signup','gate:login','alerts:email','view:post','post:copy','post:open','post:image']);
const USAGE_BOTS=/bot|crawl|spider|slurp|preview|facebookexternalhit|curl|wget|python|headless|lighthouse/i;
async function countUsage(env,metrics,request){
  if(!env.DB||USAGE_BOTS.test(request.headers.get('user-agent')||''))return;
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
async function latestAlert(env,now=Date.now()){
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
  if(url.pathname==='/api/alerts/latest'&&request.method==='GET')return reply(await latestAlert(env));
  if(request.method!=='POST')return reply({success:false},405);
  let body={};try{body=JSON.parse((await request.text()).slice(0,2000))}catch{}
  const endpoint=String(body?.endpoint||'');
  if(!validPushEndpoint(endpoint))return reply({success:false,error:'Unsupported push service.'},400);
  if(url.pathname==='/api/alerts/unsubscribe'){await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint=?').bind(endpoint).run();return reply({success:true})}
  if(url.pathname==='/api/alerts/subscribe'){
    const p256dh=String(body?.keys?.p256dh||''),auth=String(body?.keys?.auth||'');
    if(!/^[A-Za-z0-9_-]{40,200}$/.test(p256dh)||!/^[A-Za-z0-9_-]{8,60}$/.test(auth))return reply({success:false,error:'Invalid subscription.'},400);
    await env.DB.prepare('INSERT INTO push_subscriptions (endpoint,p256dh,auth,created_at,failures) VALUES (?,?,?,?,0) ON CONFLICT(endpoint) DO UPDATE SET p256dh=excluded.p256dh,auth=excluded.auth,failures=0').bind(endpoint,p256dh,auth,new Date().toISOString()).run();
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
function emailAlertHtml(picks,unsubscribeUrl,postal){
  const font="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const heading=picks.length===1?'A new official pick just posted':`${picks.length} new official picks just posted`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${weeklyEscape(emailSubject(picks))}</title></head><body style="margin:0;padding:0;background:#eef3f9;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eef3f9;"><tr><td align="center" style="padding:28px 12px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;"><tr><td align="center" style="background:#050b1d;border-radius:18px 18px 0 0;padding:24px;"><a href="${SITE_URL}" style="text-decoration:none;"><img src="${SITE_URL}/bet-this-guy-logo-v3.png" width="200" alt="Bet This Guy" style="display:block;width:200px;max-width:70%;height:auto;border:0;color:#ffffff;font-family:Arial,sans-serif;font-size:22px;font-weight:700;"></a></td></tr><tr><td style="background:#ffffff;border-radius:0 0 18px 18px;padding:28px 24px;font-family:${font};color:#10213d;"><p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:.14em;color:#08875e;">PICK ALERT</p><h1 style="margin:0 0 8px;font-size:24px;line-height:1.25;">${heading}</h1><p style="margin:0 0 20px;font-size:15px;line-height:1.5;color:#40597a;">Locked before kickoff and graded in public on our track record.</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${picks.map(emailPickRow).join('')}</table><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:14px 0 0;"><tr><td style="border-radius:999px;background:#1fd88f;"><a href="${SITE_URL}/" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:700;color:#04121f;text-decoration:none;border-radius:999px;">See the picks</a></td></tr></table><p style="margin:18px 0 0;font-size:13px;line-height:1.5;color:#5a6f8c;">Odds move. Check the price at your sportsbook before you bet.</p></td></tr><tr><td align="center" style="padding:20px 16px 0;font-family:${font};font-size:12px;line-height:1.6;color:#7f96b8;">You’re getting this because you turned on email alerts for your Bet This Guy account. Questions? Just reply.<br><a href="${weeklyEscape(unsubscribeUrl)}" style="color:#7f96b8;">Unsubscribe</a> · 21+ where legal. Gambling problem? Call 1-800-GAMBLER.${postal?`<br>${weeklyEscape(postal)}`:''}</td></tr></table></td></tr></table></body></html>`;
}
function emailAlertText(picks,unsubscribeUrl,postal){
  return `${picks.length===1?'A new official pick just posted':`${picks.length} new official picks just posted`}:\n\n${picks.map(r=>`- ${emailPickText(r)} · ${weeklyDay(r.game_time)}`).join('\n')}\n\nSee the picks: ${SITE_URL}/\n\nOdds move. Check the price at your sportsbook before you bet.\n\nUnsubscribe: ${unsubscribeUrl}\n21+ where legal. Gambling problem? Call 1-800-GAMBLER.${postal?`\n${postal}`:''}\n`;
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
  try{const response=await fetch('/api/alerts/latest',{cache:'no-store'});if(response.ok)note=Object.assign(note,await response.json())}catch(error){}
  return self.registration.showNotification(note.title,{body:note.body,icon:'/icon-192.png',badge:'/icon-192.png',tag:'btg-pick',renotify:true,data:{url:note.url||'/'}});
})()));
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil((async()=>{
  const target=new URL((event.notification.data&&event.notification.data.url)||'/',self.location.origin).href;
  const open=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  for(const client of open){if(client.url.indexOf(self.location.origin)===0){await client.focus();if(client.navigate)return client.navigate(target);return}}
  return self.clients.openWindow(target);
})())});
`;
const WEB_MANIFEST=JSON.stringify({name:'Bet This Guy',short_name:'Bet This Guy',description:'NFL player prop picks, locked before kickoff and graded in public.',start_url:'/?source=home-screen',scope:'/',display:'standalone',background_color:'#04091a',theme_color:'#04091a',icons:[{src:'/icon-192.png',sizes:'192x192',type:'image/png',purpose:'any'},{src:'/icon-512.png',sizes:'512x512',type:'image/png',purpose:'any'}]});
