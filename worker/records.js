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
  if(statements.length)await env.DB.batch(statements);
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
    const candidates=officialCandidates(boards,Date.now());await writeOfficialPlan(officialPlan(candidates,existing.results||[],week,Date.now()),week,env);
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
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#04091a"><title>${weeklyEscape(title)}</title><meta name="description" content="${weeklyEscape(description)}"><link rel="canonical" href="${SITE_URL}${path}"><meta property="og:type" content="website"><meta property="og:title" content="${weeklyEscape(title)}"><meta property="og:description" content="${weeklyEscape(description)}"><meta property="og:url" content="${SITE_URL}${path}"><meta property="og:image" content="${SITE_URL}/bet-this-guy-logo-v3.png"><link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@600;700&display=swap" rel="stylesheet">
<style>body{margin:0;background:#04091a;color:#e8f2ff;font:15px/1.55 "DM Sans",system-ui,sans-serif}a{color:#9fd4ff}main{max-width:860px;margin:0 auto;padding:20px 16px 48px}header.top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:18px}header.top img{width:170px}h1,h2{font-family:"Space Grotesk",sans-serif;line-height:1.15;color:#fff}h1{font-size:clamp(26px,5vw,38px);margin:6px 0 6px}h2{font-size:20px;margin:28px 0 10px}.eyebrow{margin:0;color:#5ff0b5;font:700 11px "Space Grotesk",sans-serif;letter-spacing:.16em}.lead{color:#9fb6d6;margin:0 0 16px}.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:0 0 18px}@media(max-width:480px){.stats{grid-template-columns:1fr 1fr}}.stat{padding:12px 14px;border-radius:14px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1)}.stat strong{display:block;font:700 22px "Space Grotesk",sans-serif;color:#fff}.stat.up strong{color:#5ff0b5}.stat.down strong{color:#ff9d9d}.stat span{color:#9fb6d6;font-size:12.5px}.cta{display:inline-block;margin:4px 12px 4px 0;padding:11px 20px;border-radius:999px;background:linear-gradient(135deg,#1fd88f,#16b6d9);color:#04121f;font-weight:700;text-decoration:none}.picks{list-style:none;margin:0;padding:0;display:grid;gap:8px}.pick{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 12px;padding:12px 14px;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09)}.pick strong{color:#fff}.pick .bet{grid-column:1}.pick .meta{grid-column:1/-1;color:#8fa9c8;font-size:12.5px}.pick .price{grid-row:1/3;grid-column:2;text-align:right;font:700 16px "Space Grotesk",sans-serif}.res{font-weight:700;font-size:12.5px}.won{color:#5ff0b5}.lost{color:#ff9d9d}.push,.pending{color:#ffd66e}.legs{margin:6px 0 0;padding-left:18px;color:#cfe0f5;font-size:13.5px}.weeks{list-style:none;margin:0;padding:0;display:grid;gap:8px}.weeks a{display:flex;justify-content:space-between;gap:12px;padding:14px 16px;border-radius:14px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#fff;text-decoration:none}.weeks small{color:#9fb6d6}.pager{display:flex;justify-content:space-between;gap:12px;margin-top:28px}.fine{margin-top:32px;color:#7f96b8;font-size:12px}</style></head><body><main><header class="top"><a href="/"><img src="/bet-this-guy-logo-v3.png" alt="Bet This Guy"></a><a href="/picks">All weeks</a></header>${body}<p class="fine">Research and entertainment only. Every official pick is locked before kickoff and graded from box scores; past results don’t guarantee future ones. Profit assumes $100 per pick at the posted price. 21+ where legal. If gambling stops being fun, call 1-800-GAMBLER.</p></main></body></html>`;
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

// Anonymous usage counts: daily totals per metric. No cookies, IP addresses or
// per-person identifiers are stored; unknown metric names are ignored.
const USAGE_METRICS=new Set(['view:home','view:trust','view:picks','view:week','visit:new','visit:return','card:open','slip:add','parlay:add','share','hit:open','profile:open','affiliate:click']);
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
