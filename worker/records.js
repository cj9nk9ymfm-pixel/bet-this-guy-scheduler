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
function officialPlan(candidates,existing,week){
  const saved=existing.map(r=>({...r,legs:recordLegs(r)})),counts=Object.fromEntries(Object.keys(OFFICIAL_CAPS).map(t=>[t,saved.filter(r=>r.id.startsWith(`official|${week}|${t}|`)).length]));
  const plan=[],singles=saved.filter(r=>r.kind==='prop'),games=new Map(),used=new Set(singles.flatMap(r=>r.legs.map(officialPlayer)));
  singles.forEach(r=>games.set(r.game_id,(games.get(r.game_id)||0)+1));
  for(const p of candidates){if(counts.props>=100)break;if(used.has(p.playerKey)||(games.get(p.gameId)||0)>=8)continue;plan.push({tier:'props',legs:[p]});counts.props++;used.add(p.playerKey);games.set(p.gameId,(games.get(p.gameId)||0)+1)}
  const prior=saved.filter(r=>r.kind==='parlay').map(r=>r.legs.map(officialPlayer)),exposure=new Map();prior.flat().forEach(k=>exposure.set(k,(exposure.get(k)||0)+1));
  const tiers=[['reasonable',2,4,100,999],['swing',3,6,1000,2500],['moonshot',4,7,2501,15000]];
  for(const [tier,min,max,low,high] of tiers){
    for(let attempt=0;attempt<500&&counts[tier]<OFFICIAL_CAPS[tier];attempt++){
      const size=min+attempt%(max-min+1),legs=[],gameIds=new Set(),markets=new Map();
      const pool=[...candidates].sort((a,b)=>(exposure.get(a.playerKey)||0)-(exposure.get(b.playerKey)||0)||b.edge-a.edge);
      if(!pool.length)break;
      for(let j=0;j<pool.length&&legs.length<size;j++){
        const p=pool[(j+Math.floor(attempt/(max-min+1)))%pool.length];
        if((exposure.get(p.playerKey)||0)>=3||gameIds.has(p.gameId)||(markets.get(p.market)||0)>=2)continue;
        legs.push(p);gameIds.add(p.gameId);markets.set(p.market,(markets.get(p.market)||0)+1);
      }
      if(legs.length!==size)continue;
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
    const candidates=officialCandidates(boards,Date.now());await writeOfficialPlan(officialPlan(candidates,existing.results||[],week),week,env);

  if(failedBoards)throw new Error('Some official boards were unavailable; retry required');
  return {state:"completed"};
}
