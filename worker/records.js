// Public callers may request a snapshot, but never supply authoritative record
// fields. Only an exact, current provider offer can become a verified snapshot.
const VERIFIED_RECORD_SOURCE = 'market-verified-v2';
// Where each running cron job has got to (jobStep(job,label)), so a job that
// times out is logged with the step it was stuck on.
const jobSteps=new Map();
const jobStep=(job,label)=>{jobSteps.set(job,label)};
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
  // NBA (player_assists above is shared: NFL assisted tackles or NBA passing
  // assists, told apart by the game's sport).
  player_points:'Points',player_rebounds:'Rebounds',player_threes:'3-Pointers Made',player_blocks:'Blocks',player_steals:'Steals',
  player_blocks_steals:'Blocks + Steals',player_turnovers:'Turnovers',player_points_rebounds_assists:'Points + Rebounds + Assists',
  player_points_rebounds:'Points + Rebounds',player_points_assists:'Points + Assists',player_rebounds_assists:'Rebounds + Assists',
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
      offers.push({player,market:label,side,line,odds,sport:event.sport_label||'NFL',gameId:event.eventID||`${event.sport_label||'NFL'}--${event.id}`,gameTime:new Date(start).toISOString(),team:`${event.away_team} · @ ${event.home_team}`});
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
// At most two official props per game: picks in one game win or lose
// together, so a third goes to the leans list instead.
const OFFICIAL_PER_GAME=2;
// Picks can lock any time before kickoff in the official week.
const OFFICIAL_HORIZON=8*86400000,LOW_ODDS_CREDITS=250000;
function officialWeek(time){const d=new Date(Number(time)-12*3600000);d.setUTCHours(0,0,0,0);d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+5)%7);return d.toISOString().slice(0,10)}
const officialPlayer=leg=>`${leg.gameId}|${normalizedName(leg.player)}`;
// stats (optional) collects what a run saw, for the pick_runs log.
// opts.min/opts.below set the edge band (official: 1% up, capped at 12%);
// the near-miss shadow uses 0.5% to just under 1%.
function officialCandidates(events,now=Date.now(),stats={},opts={}){
  const min=opts.min??1,below=opts.below??Infinity;
  const result=[];
  for(const event of events){
    const kickoff=Date.parse(event.commence_time);
    if(kickoff<OFFICIAL_START||kickoff<=now+5*60000)continue;
    const groups=new Map();
    for(const book of event.bookmakers||[])for(const market of book.markets||[]){
      const label=recordLabels[market.key],updated=Date.parse(market.last_update||book.last_update||'');
      if(!label||!BTGStats.supports({market:label,sport:event.sport_label||'NFL'})||/_alternate$/.test(market.key)||!Number.isFinite(updated)||now-updated>15*60000||updated>now+60000)continue;
      for(const outcome of market.outcomes||[]){
        const side=String(outcome.name).toLowerCase(),line=BTGStats.number(outcome.point),odds=BTGStats.number(outcome.price),player=String(outcome.description||'').trim();
        if(!['over','under'].includes(side)||!player||line===null||odds===null||Math.abs(odds)<100||Math.abs(odds)>10000)continue;
        const key=JSON.stringify([player,label,line]),group=groups.get(key)||{player,market:label,line,books:new Map()};
        const pair=group.books.get(book.key)||{};pair[side]={odds,book:book.title||book.key,key:book.key};group.books.set(book.key,pair);groups.set(key,group);
      }
    }
    for(const group of groups.values()){
      const pairs=[...group.books.values()].filter(p=>p.over&&p.under);
      // Market coverage for the run log: lines seen, and how many had the 3+
      // two-sided books a fair price needs.
      const cov=(stats.markets||={})[group.market]||={lines:0,priced:0,books:0};cov.lines++;cov.books=Math.max(cov.books,group.books.size);if(pairs.length>=3)cov.priced++;
      if(pairs.length<3)continue;
      const fair=pairs.reduce((sum,p)=>{const o=1/recordDecimal(p.over.odds),u=1/recordDecimal(p.under.odds);return sum+o/(o+u)},0)/pairs.length;
      // The fair price uses every licensed book; the pick itself must be
      // available at one of the five biggest (OFFICIAL_BOOKS).
      const options=['over','under'].map(side=>{const best=pairs.map(p=>p[side]).filter(o=>OFFICIAL_BOOKS.has(o.key)).sort((a,b)=>recordDecimal(b.odds)-recordDecimal(a.odds))[0];return best?{side:side==='over'?'Over':'Under',...best,edge:100*((side==='over'?fair:1-fair)-1/recordDecimal(best.odds))}:null}).filter(Boolean).sort((a,b)=>b.edge-a.edge);
      const best=options[0];
      stats.props=(stats.props||0)+1;
      if(best){stats.best=Math.max(stats.best??-Infinity,best.edge);if(best.edge>=0.5&&best.edge<1)stats.near=(stats.near||0)+1;if(best.edge>=1&&best.edge<=12)stats.qualified=(stats.qualified||0)+1;if(best.edge>12)stats.capped=(stats.capped||0)+1}
      if(!best||best.edge<min||best.edge>=below||best.edge>12)continue;
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
  for(const p of candidates){if(counts.props>=100)break;if(used.has(p.playerKey)||(games.get(p.gameId)||0)>=OFFICIAL_PER_GAME)continue;plan.push({tier:'props',legs:[p]});counts.props++;used.add(p.playerKey);games.set(p.gameId,(games.get(p.gameId)||0)+1)}
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
// Parlay from our own singles: when no parlay forms from fresh qualifiers
// (two props qualifying in different games at the same moment is rare), pair
// two pending official singles from different games whose current big-5
// price is still better than fair, inside two hours of the first kickoff.
// Priced and locked at today's prices; at most one a day.
function singlesParlay(boards,existing,now=Date.now()){
  const saved=existing.map(r=>({...r,legs:recordLegs(r)}));
  const day=t=>new Date(t).toISOString().slice(0,10);
  const done=new Set(saved.filter(r=>r.kind==='parlay'&&r.legs.some(l=>l.fromSingles)).map(r=>day(Date.parse(r.legs.map(l=>l.gameTime).sort()[0]))));
  const current=officialCandidates(boards,now,{},{min:.5});
  const legs=[];
  for(const r of saved){
    if(r.kind!=='prop'||r.result||Date.parse(r.game_time)<=now+5*60000)continue;
    const leg=r.legs[0]||{},key=officialPlayer({gameId:r.game_id,player:r.player});
    const c=current.find(c=>c.playerKey===key&&c.market===r.market&&c.side===r.side&&Number(c.line)===Number(r.line));
    if(c)legs.push({...c,fromSingles:true});
  }
  legs.sort((a,b)=>b.edge-a.edge);
  for(let i=0;i<legs.length;i++)for(let j=i+1;j<legs.length;j++){
    const pair=[legs[i],legs[j]];if(pair[0].gameId===pair[1].gameId)continue;
    const first=Math.min(...pair.map(l=>Date.parse(l.gameTime)));
    if(first>now+PARLAY_WINDOW||done.has(day(first)))continue;
    const odds=recordAmerican(pair.reduce((d,l)=>d*recordDecimal(l.odds),1));
    if(odds<100||odds>999)continue;
    return {tier:'reasonable',legs:pair};
  }
  return null;
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
      AND (?='parlay' OR ((SELECT COUNT(*) FROM public_recommendations WHERE id>=? AND id<? AND game_id=?)<${OFFICIAL_PER_GAME}
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

// Line value runs in shadow mode for now: would-be picks rated on the
// fair-price curve (BTGLine) are logged here, never posted. Every run also
// stores each logged pick's current fair chance until kickoff, so the last
// value is its closing fair price: did the market move toward us or away?
const LINE_SHADOW_MIN=1.5;
function lineShadowCandidates(events,now=Date.now()){
  const best=new Map();
  for(const event of events){
    const kickoff=Date.parse(event.commence_time);
    if(kickoff<OFFICIAL_START||kickoff<=now+5*60000)continue;
    const eventID=event.eventID||`NFL--${event.id}`;
    for(const g of BTGLine.rate(event,now)){
      const pick=g.offers.filter(o=>OFFICIAL_BOOKS.has(o.key)&&o.edge>=LINE_SHADOW_MIN).sort((a,b)=>b.edge-a.edge)[0];
      if(!pick)continue;
      const row={id:`${officialWeek(kickoff)}|${eventID}|${g.player}|${g.marketKey}`,event_id:eventID,player:g.player,market_key:g.marketKey,market:recordLabels[g.marketKey]||g.marketKey,side:pick.side==='over'?'Over':'Under',line:pick.line,odds:pick.odds,book:pick.book,alt:pick.alt?1:0,main_line:g.main,books:g.books,edge:+pick.edge.toFixed(2),fair:+pick.fair.toFixed(4),game_time:new Date(kickoff).toISOString(),model_json:JSON.stringify(g.model),team:`${event.away_team||''} · @ ${event.home_team||''}`};
      // One per player and game, like official picks.
      const k=`${eventID}|${normalizedName(g.player)}`,prior=best.get(k);if(!prior||row.edge>prior.edge)best.set(k,row);
    }
  }
  return [...best.values()];
}
async function recordLineShadow(env,events,now=Date.now()){
  if(!env.DB)return {logged:0};
  const stamp=new Date(now).toISOString(),rows=lineShadowCandidates(events,now);
  const statements=rows.map(r=>env.DB.prepare('INSERT OR IGNORE INTO line_shadow (id,event_id,player,market_key,market,side,line,odds,book,alt,main_line,books,edge,fair,game_time,logged_at,model_json,team) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(r.id,r.event_id,r.player,r.market_key,r.market,r.side,r.line,r.odds,r.book,r.alt,r.main_line,r.books,r.edge,r.fair,r.game_time,stamp,r.model_json,r.team));
  const open=(await env.DB.prepare('SELECT id,event_id,player,market_key,side,line FROM line_shadow WHERE game_time>? AND game_time<=?').bind(stamp,new Date(now+OFFICIAL_HORIZON).toISOString()).all()).results||[];
  if(open.length){
    const curves=new Map();for(const event of events){const eventID=event.eventID||`NFL--${event.id}`;for(const g of BTGLine.rate(event,now))curves.set(`${eventID}|${g.player}|${g.marketKey}`,g)}
    for(const r of open){const g=curves.get(`${r.event_id}|${r.player}|${r.market_key}`);if(!g)continue;const over=BTGLine.overChance(g.model,Number(r.line));statements.push(env.DB.prepare('UPDATE line_shadow SET close_fair=?,close_main=?,close_at=? WHERE id=?').bind(+(r.side==='Over'?over:1-over).toFixed(4),g.main,stamp,r.id))}
  }
  if(statements.length)await env.DB.batch(statements);
  return {logged:rows.length,tracked:open.length};
}
// NBA picks in shadow mode: the official rules (big-5 book, 1-12% edge, 3+
// books pricing both sides) run on tonight's NBA games, and the first
// qualifying price per player and game is logged, never posted. Each run
// records the best big-5 price still on offer at the same line, so the last
// one before tip-off is the closing price; grading follows once stats exist.
async function recordNbaShadow(request,env,ctx,now=Date.now()){
  if(!env.DB)return {logged:0};
  const schedule=await futureSchedule(new Request(new URL('/api/schedule?sport=NBA',request.url)),env,ctx);
  if(!schedule.ok)throw new Error('NBA schedule unavailable');
  const games=((await schedule.json()).data||[]).filter(e=>{const t=Date.parse(e.status?.startsAt);return t>now+5*60000&&t<=now+24*3600000}).slice(0,15);
  const boards=[];
  for(let i=0;i<games.length;i+=4){const results=await Promise.allSettled(games.slice(i,i+4).map(async e=>{const url=new URL('/api/event',request.url);url.searchParams.set('eventID',e.eventID);const r=await eventProps(new Request(url),env,ctx);if(!r.ok||r.headers.get('x-feed-cache')==='stale')throw new Error('NBA board unavailable');return (await r.json()).data||[]}));for(const r of results)if(r.status==='fulfilled')boards.push(...r.value)}
  const stamp=new Date(now).toISOString(),picks=officialCandidates(boards,now);
  const statements=picks.map(p=>env.DB.prepare('INSERT OR IGNORE INTO nba_shadow (id,event_id,player,team,market,side,line,odds,book,edge,game_time,logged_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').bind(`${p.gameId}|${normalizedName(p.player)}`,p.gameId,p.player,p.team||null,p.market,p.side,p.line,p.odds,p.book,+p.edge.toFixed(2),p.gameTime,stamp));
  // Closing price: the best big-5 price now at each open pick's line and side.
  const open=(await env.DB.prepare('SELECT id,event_id,player,market,side,line FROM nba_shadow WHERE game_time>?').bind(stamp).all()).results||[];
  for(const r of open){
    const event=boards.find(e=>(e.eventID||`NBA--${e.id}`)===r.event_id);if(!event)continue;
    const best=bigFivePrice(event,r);
    if(best!==null)statements.push(env.DB.prepare('UPDATE nba_shadow SET close_odds=?,close_at=? WHERE id=?').bind(best,stamp,r.id));
  }
  if(statements.length)await env.DB.batch(statements);
  return {games:games.length,boards:boards.length,logged:picks.length,tracked:open.length};
}
// NBA preseason (a plumbing test before the season): the preseason feed is
// read here only, never by the public board, at most once an hour. Rows go
// in nba_shadow with event ids starting NBAPRE-- so they stay out of the NBA
// record. Preseason minutes are erratic, so results say little about edge;
// the point is that odds, logging and grading all work end to end.
const NBA_PRESEASON_KEY='basketball_nba_preseason';
async function recordNbaPreseason(env,now=Date.now()){
  if(!env.DB||!env.THE_ODDS_API_KEY)return {logged:0};
  const last=Number(await appSetting(env,'nba-pre-at')||0);
  if(now-last<55*60000)return {skipped:true};
  await setAppSetting(env,'nba-pre-at',String(now));
  const sport={...NBA_SPORT,key:NBA_PRESEASON_KEY,expandedMarkets:[]};
  const events=(await fetchSportEvents(sport,env.THE_ODDS_API_KEY)).filter(e=>{const t=Date.parse(e.commence_time);return t>now+5*60000&&t<=now+24*3600000}).slice(0,10);
  const boards=[],errors=[];
  for(const e of events){try{const d=await fetchEventOdds(sport,e.id,env.THE_ODDS_API_KEY,false);boards.push({...d,eventID:`NBAPRE--${e.id}`,sport_label:'NBA'})}catch(error){errors.push(error.message)}}
  const priced=boards.filter(b=>(b.bookmakers||[]).some(k=>(k.markets||[]).length)).length;
  const stamp=new Date(now).toISOString(),picks=officialCandidates(boards,now);
  const statements=picks.map(p=>env.DB.prepare('INSERT OR IGNORE INTO nba_shadow (id,event_id,player,team,market,side,line,odds,book,edge,game_time,logged_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').bind(`${p.gameId}|${normalizedName(p.player)}`,p.gameId,p.player,p.team||null,p.market,p.side,p.line,p.odds,p.book,+p.edge.toFixed(2),p.gameTime,stamp));
  const open=(await env.DB.prepare("SELECT id,event_id,player,market,side,line FROM nba_shadow WHERE game_time>? AND event_id LIKE 'NBAPRE--%'").bind(stamp).all()).results||[];
  for(const r of open){const event=boards.find(e=>e.eventID===r.event_id);const best=event?bigFivePrice(event,r):null;if(best!==null)statements.push(env.DB.prepare('UPDATE nba_shadow SET close_odds=?,close_at=? WHERE id=?').bind(best,stamp,r.id))}
  if(statements.length)await env.DB.batch(statements);
  // What the feed had, for the end-of-preseason report.
  const props=boards.reduce((n,b)=>n+(b.bookmakers||[]).reduce((m,k)=>m+(k.markets||[]).reduce((x,mk)=>x+(mk.outcomes||[]).length,0),0),0);
  return {games:events.length,priced,props,logged:picks.length,tracked:open.length,...(errors.length?{error:errors[0].slice(0,80)}:{})};
}
// The best big-5 price on offer for a shadow pick's player, market, side and line.
function bigFivePrice(event,r){
  let best=null;
  for(const book of event.bookmakers||[])if(OFFICIAL_BOOKS.has(book.key))for(const market of book.markets||[]){
    if(recordLabels[market.key]!==r.market)continue;
    for(const o of market.outcomes||[])if(String(o.description||'').trim()===r.player&&String(o.name).toLowerCase()===r.side.toLowerCase()&&BTGStats.number(o.point)===Number(r.line)){const odds=BTGStats.number(o.price);if(odds!==null&&(best===null||recordDecimal(odds)>recordDecimal(best)))best=odds}
  }
  return best;
}
// Near-miss shadow: NFL props that pass every official rule but the edge
// (0.5% to just under 1%), logged the first time they're seen per player and
// game, never posted. Players who qualify officially this run are left out.
// Each run keeps the best big-5 price at the same line, so the last one before
// kickoff is the closing price.
// GET /api/leans: this week's leans (near misses and props held back by the
// per-game limit) for upcoming games, at most two a game, cached 5 minutes.
// Not official picks and not on the record; a lean that later became an
// official pick is left out.
async function leansResponse(request,env,ctx,now=Date.now()){
  if(!env.DB)return json({success:true,leans:[]});
  const saved=await readFeedCache(request,'leans-v1-NFL');
  if(saved.response&&cacheAge(saved.response)<300000)return cachedForClient(saved.response,'fresh');
  const rows=(await env.DB.prepare('SELECT event_id,player,team,market,side,line,odds,book,edge,close_odds,game_time FROM near_shadow n WHERE game_time>? AND game_time<? AND NOT EXISTS(SELECT 1 FROM public_recommendations r WHERE r.id LIKE \'official|%\' AND r.kind=\'prop\' AND r.game_id=n.event_id AND r.player=n.player) ORDER BY edge DESC').bind(new Date(now+5*60000).toISOString(),new Date(now+8*86400000).toISOString()).all().catch(()=>({results:[]}))).results||[];
  const games=new Map(),leans=[];
  for(const r of rows){const n=games.get(r.event_id)||0;if(n>=2||leans.length>=10)continue;games.set(r.event_id,n+1);leans.push({eventId:r.event_id,player:r.player,team:r.team||'',market:r.market,side:r.side,line:r.line,odds:r.close_odds??r.odds,flagged:r.odds,book:r.book,edge:+Number(r.edge).toFixed(1),gameTime:r.game_time})}
  leans.sort((a,b)=>a.gameTime.localeCompare(b.gameTime)||b.edge-a.edge);
  const stored=storedResponse(JSON.stringify({success:true,leans,updatedAt:new Date(now).toISOString()}),300);
  if(saved.cache&&saved.key)ctx?.waitUntil?.(saved.cache.put(saved.key,stored.clone()));
  return cachedForClient(stored,'miss');
}
async function recordNearShadow(env,boards,official=[],now=Date.now()){
  if(!env.DB)return {logged:0};
  const stamp=new Date(now).toISOString(),taken=new Set(official.map(p=>p.playerKey));
  // Also skip players who already have an official pick in that game: their
  // price can drift below the bar after it locks, and they'd be counted twice.
  const locked=new Set(((await env.DB.prepare("SELECT game_id,player FROM public_recommendations WHERE id LIKE 'official|%' AND kind='prop' AND game_time>?").bind(stamp).all()).results||[]).map(r=>`${r.game_id}|${normalizedName(r.player)}`));
  // 0.5% to just under the bar, plus qualifying props held back by the
  // per-game limit; both are shown as leans.
  const picks=officialCandidates(boards,now,{},{min:.5}).filter(p=>!taken.has(p.playerKey)&&!locked.has(`${p.gameId}|${normalizedName(p.player)}`));
  const statements=picks.map(p=>env.DB.prepare('INSERT OR IGNORE INTO near_shadow (id,event_id,player,team,market,side,line,odds,book,edge,game_time,logged_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').bind(`${p.gameId}|${normalizedName(p.player)}`,p.gameId,p.player,p.team||null,p.market,p.side,p.line,p.odds,p.book,+p.edge.toFixed(2),p.gameTime,stamp));
  const open=(await env.DB.prepare('SELECT id,event_id,player,market,side,line FROM near_shadow WHERE game_time>?').bind(stamp).all()).results||[];
  for(const r of open){
    const event=boards.find(e=>(e.eventID||`NFL--${e.id}`)===r.event_id);if(!event)continue;
    const best=bigFivePrice(event,r);
    if(best!==null)statements.push(env.DB.prepare('UPDATE near_shadow SET close_odds=?,close_at=? WHERE id=?').bind(best,stamp,r.id));
  }
  if(statements.length)await env.DB.batch(statements);
  return {logged:picks.length,tracked:open.length};
}
// Grade near-miss shadow picks once the game is final, like official picks.
async function gradeNearShadow(env,now=Date.now()){
  if(!env.DB||!env.BALLDONTLIE_API_KEY)return {graded:0};
  const rows=(await env.DB.prepare('SELECT * FROM near_shadow WHERE result IS NULL AND game_time<? AND game_time>? ORDER BY game_time LIMIT 20').bind(new Date(now-4*3600000).toISOString(),new Date(now-14*86400000).toISOString()).all()).results||[];
  const cache=new Map(),statements=[],stamp=new Date(now).toISOString();
  for(const r of rows){
    const record={sport:'NFL',player:r.player,team:r.team,gameTime:r.game_time,market:r.market,side:r.side,line:r.line};
    const stat=await recordPlayerStats(record,env,undefined,cache).catch(()=>null);
    if(shadowVoid(stat,r.game_time,now)){statements.push(env.DB.prepare('UPDATE near_shadow SET actual=NULL,result=?,graded_at=? WHERE id=?').bind('void',stamp,r.id));continue}
    if(!stat||stat.missingPlayerStats||!(stat.scoreboardFinal||nflGameState(stat.game||{})==='final'))continue;
    const value=BTGStats.metric(record,stat).value,result=value===null?null:BTGStats.grade(r.side,r.line,value);
    if(result)statements.push(env.DB.prepare('UPDATE near_shadow SET actual=?,result=?,graded_at=? WHERE id=?').bind(value,result,stamp,r.id));
  }
  if(statements.length)await env.DB.batch(statements);
  return {graded:statements.length,checked:rows.length};
}
// Game leans (shadow): one per game, the best-rated prop at the big-5 books
// priced -150 to +150, to test whether a pick for every game can hold up.
// Locked once, about 90 minutes before kickoff; never posted, never official.
const LEAN_WINDOW=90*60000,LEAN_MIN_ODDS=-150,LEAN_MAX_ODDS=150;
function leanFor(board,now){
  const picks=officialCandidates([board],now,{},{min:-Infinity}).filter(p=>p.odds>=LEAN_MIN_ODDS&&p.odds<=LEAN_MAX_ODDS);
  return picks.sort((a,b)=>b.edge-a.edge)[0]||null;
}
const leanRow=(env,p,gameId,stamp,source)=>env.DB.prepare('INSERT OR IGNORE INTO lean_shadow (id,event_id,player,team,market,side,line,odds,book,edge,game_time,logged_at,source) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(gameId,gameId,p.player,p.team||null,p.market,p.side,p.line,p.odds,p.book,+p.edge.toFixed(2),p.gameTime,stamp,source);
async function recordLeans(env,boards,now=Date.now()){
  if(!env.DB)return {logged:0};
  const stamp=new Date(now).toISOString(),statements=[];let logged=0;
  const open=(await env.DB.prepare('SELECT id,event_id,player,market,side,line FROM lean_shadow WHERE game_time>?').bind(stamp).all()).results||[],have=new Set(open.map(r=>r.id));
  for(const board of boards){
    const gameId=board.eventID||`NFL--${board.id}`,kickoff=Date.parse(board.commence_time);
    if(have.has(gameId)||!(kickoff-now<=LEAN_WINDOW))continue;
    const p=leanFor(board,now);if(p){statements.push(leanRow(env,p,gameId,stamp,'live'));logged++}
  }
  // Closing price: the best big-5 price still on offer at the lean's line.
  for(const r of open){const board=boards.find(e=>(e.eventID||`NFL--${e.id}`)===r.event_id);const best=board?bigFivePrice(board,r):null;if(best!==null)statements.push(env.DB.prepare('UPDATE lean_shadow SET close_odds=?,close_at=? WHERE id=?').bind(best,stamp,r.id))}
  if(statements.length)await env.DB.batch(statements);
  return {logged};
}
// Backtest from the saved odds snapshots (kept a week): for each finished
// game without a lean, the board an hour before kickoff picks the lean and
// the last board before kickoff gives its closing price. A few games a run.
async function backfillLeans(env,now=Date.now(),limit=4){
  if(!env.DB)return {added:0};
  // Games still being snapshotted (upcoming) are skipped without reading them.
  const games=(await env.DB.prepare("SELECT event_id,MAX(captured_at) last FROM movement_snapshots WHERE kind='observed' AND event_id LIKE 'NFL--%' GROUP BY event_id HAVING MAX(captured_at)<? AND MAX(json_extract(payload_json,'$.commence_time'))<?").bind(now-30*60000,new Date(now).toISOString()).all()).results||[];
  const have=new Set(((await env.DB.prepare('SELECT id FROM lean_shadow').all()).results||[]).map(r=>r.id));
  const statements=[];let added=0;
  for(const g of games){
    if(added>=limit)break;
    if(have.has(g.event_id))continue;
    const latest=await env.DB.prepare("SELECT payload_json FROM movement_snapshots WHERE event_id=? AND kind='observed' ORDER BY captured_at DESC LIMIT 1").bind(g.event_id).first();
    let board=null;try{board=JSON.parse(latest?.payload_json||'null')}catch{}
    const kickoff=Date.parse(board?.commence_time||'');
    // Only games that have started: upcoming ones get a live lean.
    if(!Number.isFinite(kickoff)||kickoff>now)continue;
    const lock=await env.DB.prepare("SELECT captured_at,payload_json FROM movement_snapshots WHERE event_id=? AND kind='observed' AND captured_at<=? ORDER BY captured_at DESC LIMIT 1").bind(g.event_id,kickoff-3600000).first()
      ||await env.DB.prepare("SELECT captured_at,payload_json FROM movement_snapshots WHERE event_id=? AND kind='observed' AND captured_at<? ORDER BY captured_at ASC LIMIT 1").bind(g.event_id,kickoff).first();
    const last=await env.DB.prepare("SELECT captured_at,payload_json FROM movement_snapshots WHERE event_id=? AND kind='observed' AND captured_at<? ORDER BY captured_at DESC LIMIT 1").bind(g.event_id,kickoff).first();
    let lockBoard=null,lastBoard=null;try{lockBoard=JSON.parse(lock?.payload_json||'null');lastBoard=JSON.parse(last?.payload_json||'null')}catch{}
    // A snapshot is the board as it stood when it was taken, so its prices
    // count as fresh at that moment (the pick rules skip markets whose
    // last_update is over 15 minutes old).
    const asOf=(b,t)=>b&&{...b,bookmakers:(b.bookmakers||[]).map(book=>({...book,last_update:new Date(t).toISOString(),markets:(book.markets||[]).map(m=>({...m,last_update:new Date(t).toISOString()}))}))};
    if(lockBoard)lockBoard=asOf(lockBoard,Number(lock.captured_at));
    const p=lockBoard?leanFor({...lockBoard,eventID:g.event_id},Number(lock.captured_at)):null;
    // No board to pick from: a placeholder row so the game isn't retried.
    if(!p){statements.push(env.DB.prepare("INSERT OR IGNORE INTO lean_shadow (id,event_id,player,market,side,line,odds,book,edge,game_time,logged_at,source,result) VALUES (?,?,'-','-','-',0,0,'-',0,?,?,'backtest','none')").bind(g.event_id,g.event_id,new Date(kickoff).toISOString(),new Date(now).toISOString()));have.add(g.event_id);continue}
    statements.push(leanRow(env,p,g.event_id,new Date(Number(lock.captured_at)).toISOString(),'backtest'));
    const close=lastBoard?bigFivePrice(lastBoard,p):null;
    if(close!==null)statements.push(env.DB.prepare('UPDATE lean_shadow SET close_odds=?,close_at=? WHERE id=?').bind(close,new Date(Number(last.captured_at)).toISOString(),g.event_id));
    have.add(g.event_id);added++;
  }
  if(statements.length)await env.DB.batch(statements);
  return {added};
}
async function gradeLeanShadow(env,now=Date.now()){
  if(!env.DB||!env.BALLDONTLIE_API_KEY)return {graded:0};
  const rows=(await env.DB.prepare("SELECT * FROM lean_shadow WHERE result IS NULL AND game_time<? AND game_time>? ORDER BY game_time LIMIT 10").bind(new Date(now-4*3600000).toISOString(),new Date(now-14*86400000).toISOString()).all()).results||[];
  const cache=new Map(),statements=[],stamp=new Date(now).toISOString();
  for(const r of rows){
    const record={sport:'NFL',player:r.player,team:r.team,gameTime:r.game_time,market:r.market,side:r.side,line:r.line};
    const stat=await recordPlayerStats(record,env,undefined,cache).catch(()=>null);
    if(shadowVoid(stat,r.game_time,now)){statements.push(env.DB.prepare('UPDATE lean_shadow SET actual=NULL,result=?,graded_at=? WHERE id=?').bind('void',stamp,r.id));continue}
    if(!stat||stat.missingPlayerStats||!(stat.scoreboardFinal||nflGameState(stat.game||{})==='final'))continue;
    const value=BTGStats.metric(record,stat).value,result=value===null?null:BTGStats.grade(r.side,r.line,value);
    if(result)statements.push(env.DB.prepare('UPDATE lean_shadow SET actual=?,result=?,graded_at=? WHERE id=?').bind(value,result,stamp,r.id));
  }
  if(statements.length)await env.DB.batch(statements);
  return {graded:statements.length,checked:rows.length};
}
// Player form: each board player's last 10 games, so prop cards show how
// often the bet would have hit (one D1 read per visitor, no stats calls).
// Publish runs list who's on the board; quiet cron runs fetch a few players
// at a time. A player is refetched once per slate: after Tuesday and Friday
// 12:00 UTC, when Sunday/Monday and Thursday games are in the stats feed.
function formStaleBefore(now){
  const d=new Date(now);
  for(let i=0;i<8;i++){const t=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()-i,12);if(t<=now&&[2,5].includes(new Date(t).getUTCDay()))return t}
  return now-7*86400000;
}
async function recordFormWanted(env,boards,now=Date.now()){
  if(!env.DB||!boards?.length)return {added:0,updated:0};
  const want=new Map();
  for(const board of boards){
    const kick=Date.parse(board.commence_time);if(!(kick>now))continue;
    const until=new Date(kick).toISOString(),teams=`${board.away_team} @ ${board.home_team}`;
    for(const book of board.bookmakers||[])for(const market of book.markets||[]){
      const label=recordLabels[String(market.key||'').replace(/_alternate$/,'')];
      if(!label||!BTGStats.supports({market:label,sport:'NFL'}))continue;
      for(const o of market.outcomes||[]){
        const name=String(o.description||'').trim();if(!name||/\b(d\/st|defense|no scorer)\b/i.test(name))continue;
        const id=`NFL|${normalizedName(name)}`,w=want.get(id)||{player:name,teams,until,markets:new Set()};
        if(until<w.until){w.until=until;w.teams=teams}
        w.markets.add(label);want.set(id,w);
      }
    }
  }
  const have=new Map((((await env.DB.prepare('SELECT id,markets,wanted_until FROM player_form WHERE wanted_until>?').bind(new Date(now-14*86400000).toISOString()).all()).results)||[]).map(r=>[r.id,r]));
  const statements=[];let added=0,updated=0;
  for(const [id,w] of want){
    const markets=JSON.stringify([...w.markets].sort()),old=have.get(id);
    if(!old){statements.push(env.DB.prepare('INSERT OR IGNORE INTO player_form (id,sport,player,teams,markets,wanted_until) VALUES (?,?,?,?,?,?)').bind(id,'NFL',w.player,w.teams,markets,w.until));added++;continue}
    let oldMarkets=[];try{oldMarkets=JSON.parse(old.markets||'[]')}catch{}
    const union=JSON.stringify([...new Set([...oldMarkets,...w.markets])].sort()),grew=union!==JSON.stringify([...oldMarkets].sort());
    // A new market needs its values worked out, so the row is fetched again
    // (the stats lookup itself is usually still cached).
    if(grew)statements.push(env.DB.prepare('UPDATE player_form SET markets=?,fetched_at=NULL WHERE id=?').bind(union,id));
    if(old.wanted_until!==w.until&&Date.parse(old.wanted_until)<=now)statements.push(env.DB.prepare('UPDATE player_form SET wanted_until=?,teams=?,failures=0 WHERE id=?').bind(w.until,w.teams,id));
    if(grew||old.wanted_until!==w.until)updated++;
  }
  if(statements.length)await env.DB.batch(statements);
  return {added,updated};
}
// Last 10 games, newest first, as columns: dates, opponents and one value
// list per market (null where the stat wasn't recorded).
function formGames(payload,markets,now){
  const teamId=payload?.player?.team?.id,ab=t=>t?.abbreviation||t?.name||'';
  const games=(payload?.stats||[]).map(row=>({row,t:Date.parse(row?.game?.date||row?.game?.datetime||'')})).filter(g=>Number.isFinite(g.t)&&g.t<now).sort((a,b)=>b.t-a.t)
    .map(g=>({...g,v:markets.map(m=>BTGStats.metric({market:m,sport:'NFL'},g.row).value)})).filter(g=>g.v.some(x=>x!==null)).slice(0,10);
  const m={};markets.forEach((label,i)=>{const values=games.map(g=>g.v[i]);if(values.some(x=>x!==null))m[label]=values});
  return {d:games.map(g=>new Date(g.t).toISOString().slice(0,10)),o:games.map(({row})=>{const game=row.game||{},home=game.home_team,away=game.visitor_team;return teamId&&home?.id===teamId?`vs ${ab(away)}`:teamId&&away?.id===teamId?`@ ${ab(home)}`:''}),m};
}
async function fillPlayerForm(env,ctx,now=Date.now(),limit=5,offset=0){
  if(!env.DB||!env.BALLDONTLIE_API_KEY)return {filled:0};
  const stale=formStaleBefore(now);
  const rows=(await env.DB.prepare("SELECT id,player,teams,markets FROM player_form WHERE sport='NFL' AND wanted_until>? AND failures<3 AND (fetched_at IS NULL OR fetched_at<?) ORDER BY wanted_until,id LIMIT ? OFFSET ?").bind(new Date(now).toISOString(),stale,limit,offset).all()).results||[];
  const statements=[env.DB.prepare('DELETE FROM player_form WHERE wanted_until<?').bind(new Date(now-14*86400000).toISOString())];let filled=0;
  for(const r of rows){
    const url=new URL('/api/player-stats',SITE_URL);url.searchParams.set('sport','NFL');url.searchParams.set('player',r.player);url.searchParams.set('team',r.teams||'');
    let payload=null,status=0;
    try{const res=await playerStats(new Request(url),env,ctx||{waitUntil(){}},{maxAge:Math.max(60000,now-stale)});status=res.status;payload=await res.json()}catch{}
    // The stats feed is busy: stop here and try again next run (not a failure).
    if(status===429)break;
    if(!payload?.success){statements.push(env.DB.prepare('UPDATE player_form SET failures=failures+1 WHERE id=?').bind(r.id));continue}
    let markets=[];try{markets=JSON.parse(r.markets||'[]')}catch{}
    statements.push(env.DB.prepare('UPDATE player_form SET games_json=?,fetched_at=?,failures=0,team=?,position=? WHERE id=?').bind(JSON.stringify(formGames(payload,markets,now)),now,payload?.player?.team?.full_name||null,statsPos(payload?.player),r.id));filled++;
  }
  await env.DB.batch(statements);
  return {filled,tried:rows.length};
}
// Several fills at once: each part runs in its own invocation of this Worker
// (the SELF binding), with its own request allowance, on its own slice of the
// players still waiting. Without the binding, one fill runs here.
const FORM_PARTS=6,FORM_SIZE=5;
async function fillFormBurst(env,ctx,now=Date.now()){
  if(!env.DB||!env.BALLDONTLIE_API_KEY)return {filled:0};
  if(!env.SELF?.fetch||!env.MAINTENANCE_TOKEN)return fillPlayerForm(env,ctx,now);
  const waiting=Number((await env.DB.prepare("SELECT COUNT(*) AS n FROM player_form WHERE sport='NFL' AND wanted_until>? AND failures<3 AND (fetched_at IS NULL OR fetched_at<?)").bind(new Date(now).toISOString(),formStaleBefore(now)).first())?.n)||0;
  const parts=Math.min(FORM_PARTS,Math.ceil(waiting/FORM_SIZE));if(!parts)return {waiting:0};
  const call=part=>env.SELF.fetch(new Request(`${SITE_URL}/api/maintenance?job=form&part=${part}&size=${FORM_SIZE}`,{method:'POST',headers:{authorization:`Bearer ${env.MAINTENANCE_TOKEN}`},signal:AbortSignal.timeout(60000)})).then(r=>r.status);
  const results=await Promise.allSettled(Array.from({length:parts},(_,i)=>call(i)));
  return {waiting,parts,ok:results.filter(r=>r.value===200).length};
}
// GET /api/form: every board player's last 10 games (cached 10 minutes).
async function playerFormResponse(request,env,ctx,now=Date.now()){
  if(!env.DB)return json({success:true,players:{}});
  const saved=await readFeedCache(request,'player-form-v1-NFL');
  if(saved.response&&cacheAge(saved.response)<600000)return cachedForClient(saved.response,'fresh');
  const rows=(await env.DB.prepare("SELECT player,games_json FROM player_form WHERE sport='NFL' AND wanted_until>? AND games_json IS NOT NULL").bind(new Date(now-4*3600000).toISOString()).all()).results||[];
  const players={};for(const r of rows){try{const g=JSON.parse(r.games_json);if(g?.d?.length)players[normalizedName(r.player)]=g}catch{}}
  const stored=storedResponse(JSON.stringify({success:true,players,updatedAt:new Date().toISOString()}),600);
  if(saved.cache&&saved.key)ctx?.waitUntil?.(saved.cache.put(saved.key,stored.clone()));
  return cachedForClient(stored,'miss');
}

// Touchdown props (shadow). Books only offer "Yes", so a prop is rated
// against the consensus of every book pricing it (4+): gap is how much less
// likely the best big-5 price says it is than the average book does. Anytime
// TDs at +100 to +400 and first TDs at +300 to +1500 are logged, whatever
// their gap, so the record shows which gaps (if any) win.
const TD_MARKETS={player_anytime_td:{label:'Anytime Touchdown',min:100,max:400},player_1st_td:{label:'First Touchdown',min:300,max:1500}};
const tdImplied=o=>o>0?100/(o+100):-o/(-o+100);
const tdAmerican=p=>p>=.5?Math.round(-100*p/(1-p)):Math.round(100*(1-p)/p);
function tdProps(board){
  const out=new Map();
  for(const book of board.bookmakers||[])for(const market of book.markets||[]){
    const cfg=TD_MARKETS[market.key];if(!cfg)continue;
    for(const o of market.outcomes||[]){
      const player=String(o.description||'').trim(),price=BTGStats.number(o.price);
      if(!player||!/^yes$/i.test(String(o.name||''))||price===null||/\b(d\/st|defense|no scorer)\b/i.test(player))continue;
      const key=`${market.key}|${player}`,p=out.get(key)||{player,market:cfg.label,cfg,prices:new Map()};
      const prev=p.prices.get(book.key);if(prev===undefined||price>prev)p.prices.set(book.key,price);out.set(key,p);
    }
  }
  const rows=[];
  for(const p of out.values()){
    if(p.prices.size<4)continue;
    const best=[...p.prices].filter(([k])=>OFFICIAL_BOOKS.has(k)).sort((a,b)=>b[1]-a[1])[0];if(!best)continue;
    const [book,odds]=best;if(odds<p.cfg.min||odds>p.cfg.max)continue;
    const avg=[...p.prices.values()].reduce((s,o)=>s+tdImplied(o),0)/p.prices.size;
    rows.push({player:p.player,market:p.market,book,odds,books:p.prices.size,avgOdds:tdAmerican(avg),gap:+((avg-tdImplied(odds))/avg*100).toFixed(2)});
  }
  return rows;
}
const tdRow=(env,board,gameId,r,stamp,source)=>env.DB.prepare('INSERT OR IGNORE INTO td_shadow (id,event_id,player,team,market,odds,book,books,avg_odds,gap,game_time,logged_at,source) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(`${gameId}|${r.market}|${normalizedName(r.player)}`,gameId,r.player,`${board.away_team} · @ ${board.home_team}`,r.market,r.odds,r.book,r.books,r.avgOdds,r.gap,new Date(Date.parse(board.commence_time)).toISOString(),stamp,source);
// Live: every TD prop in range, once per game about 90 minutes before
// kickoff; the best big-5 price is tracked until kickoff as the close.
async function recordTdShadow(env,boards,now=Date.now()){
  if(!env.DB)return {logged:0};
  const stamp=new Date(now).toISOString(),statements=[];let logged=0;
  const open=(await env.DB.prepare('SELECT id,event_id,player,market FROM td_shadow WHERE game_time>?').bind(stamp).all()).results||[],games=new Set(open.map(r=>r.event_id));
  for(const board of boards){
    const gameId=board.eventID||`NFL--${board.id}`,kickoff=Date.parse(board.commence_time);
    if(!(kickoff>now)||kickoff-now>LEAN_WINDOW)continue;
    const props=tdProps(board);
    if(!games.has(gameId))for(const r of props){statements.push(tdRow(env,board,gameId,r,stamp,'live'));logged++}
    for(const r of open.filter(o=>o.event_id===gameId)){const p=props.find(x=>x.player===r.player&&x.market===r.market);if(p)statements.push(env.DB.prepare('UPDATE td_shadow SET close_odds=?,close_at=? WHERE id=?').bind(p.odds,stamp,r.id))}
  }
  if(statements.length)await env.DB.batch(statements);
  return {logged};
}
// Backtest: finished games from the saved odds an hour before kickoff (the
// close is the last board before kickoff). Anytime TDs only: first-TD odds
// aren't in the saved snapshots.
async function backfillTdShadow(env,now=Date.now(),limit=4){
  if(!env.DB)return {added:0};
  const games=(await env.DB.prepare("SELECT event_id FROM movement_snapshots WHERE kind='observed' AND event_id LIKE 'NFL--%' GROUP BY event_id HAVING MAX(captured_at)<? AND MAX(json_extract(payload_json,'$.commence_time'))<?").bind(now-30*60000,new Date(now).toISOString()).all()).results||[];
  const have=new Set(((await env.DB.prepare('SELECT DISTINCT event_id FROM td_shadow').all()).results||[]).map(r=>r.event_id));
  const statements=[];let added=0;
  for(const g of games){
    if(added>=limit)break;if(have.has(g.event_id))continue;
    const latest=await env.DB.prepare("SELECT payload_json FROM movement_snapshots WHERE event_id=? AND kind='observed' ORDER BY captured_at DESC LIMIT 1").bind(g.event_id).first();
    let board=null;try{board=JSON.parse(latest?.payload_json||'null')}catch{}
    const kickoff=Date.parse(board?.commence_time||'');if(!Number.isFinite(kickoff)||kickoff>now)continue;
    const lock=await env.DB.prepare("SELECT captured_at,payload_json FROM movement_snapshots WHERE event_id=? AND kind='observed' AND captured_at<=? ORDER BY captured_at DESC LIMIT 1").bind(g.event_id,kickoff-3600000).first();
    const last=await env.DB.prepare("SELECT payload_json FROM movement_snapshots WHERE event_id=? AND kind='observed' AND captured_at<? ORDER BY captured_at DESC LIMIT 1").bind(g.event_id,kickoff).first();
    let lockBoard=null,lastBoard=null;try{lockBoard=JSON.parse(lock?.payload_json||'null');lastBoard=JSON.parse(last?.payload_json||'null')}catch{}
    const props=lockBoard?tdProps(lockBoard):[],closes=lastBoard?tdProps(lastBoard):[];
    // A placeholder keeps a game with nothing in range from being re-read.
    if(!props.length)statements.push(env.DB.prepare("INSERT OR IGNORE INTO td_shadow (id,event_id,player,market,odds,book,books,avg_odds,gap,game_time,logged_at,source,result) VALUES (?,?,'-','-',0,'-',0,0,0,?,?,'backtest','none')").bind(`${g.event_id}|none`,g.event_id,new Date(kickoff).toISOString(),new Date(now).toISOString()));
    for(const r of props){
      statements.push(tdRow(env,lockBoard,g.event_id,r,new Date(Number(lock.captured_at)).toISOString(),'backtest'));
      const c=closes.find(x=>x.player===r.player&&x.market===r.market);
      if(c)statements.push(env.DB.prepare('UPDATE td_shadow SET close_odds=? WHERE id=?').bind(c.odds,`${g.event_id}|${r.market}|${normalizedName(r.player)}`));
    }
    have.add(g.event_id);added++;
  }
  if(statements.length)await env.DB.batch(statements);
  return {added};
}
// Grade from the play-by-play (who scored), like official TD picks; a player
// missing from a final box score is void after 36 hours.
async function gradeTdShadow(env,now=Date.now(),limit=40){
  if(!env.DB||!env.BALLDONTLIE_API_KEY)return {graded:0};
  const rows=(await env.DB.prepare('SELECT * FROM td_shadow WHERE result IS NULL AND game_time<? AND game_time>? ORDER BY game_time,event_id LIMIT ?').bind(new Date(now-4*3600000).toISOString(),new Date(now-14*86400000).toISOString(),limit).all()).results||[];
  const cache=new Map(),statements=[],stamp=new Date(now).toISOString();
  for(const r of rows){
    const record={sport:'NFL',player:r.player,team:r.team,gameTime:r.game_time,market:r.market,side:'Over',line:.5};
    const stat=await recordPlayerStats(record,env,undefined,cache).catch(()=>null);
    if(shadowVoid(stat,r.game_time,now)){statements.push(env.DB.prepare('UPDATE td_shadow SET result=?,graded_at=? WHERE id=?').bind('void',stamp,r.id));continue}
    if(!stat||stat.missingPlayerStats||!(stat.scoreboardFinal||nflGameState(stat.game||{})==='final'))continue;
    let value=await touchdownMarketValue(record,stat,env,undefined,cache).catch(()=>null);
    if(value===null&&r.market==='Anytime Touchdown'){const parts=['rushing_touchdowns','receiving_touchdowns'].map(k=>BTGStats.number(stat[k])).filter(v=>v!==null);if(parts.length===2)value=parts[0]+parts[1]}
    if(value===null)continue;
    statements.push(env.DB.prepare('UPDATE td_shadow SET actual=?,result=?,graded_at=? WHERE id=?').bind(value,value>=1?'won':'lost',stamp,r.id));
  }
  if(statements.length)await env.DB.batch(statements);
  return {graded:statements.length,checked:rows.length};
}

// TD grading reads box scores and play-by-play for each game, so it runs in
// its own invocation (SELF binding) with its own request allowance.
async function gradeTdShadowNow(env){
  if(!env.SELF?.fetch||!env.MAINTENANCE_TOKEN)return gradeTdShadow(env,Date.now(),10);
  const cut=new Date(Date.now()-4*3600000).toISOString();
  let waiting=0;for(const t of ['td_shadow','bump_shadow','live_shadow','game_shadow'])waiting+=((await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE result IS NULL AND game_time<?`).bind(cut).first().catch(()=>null))?.n||0);
  if(!waiting)return {waiting:0};
  const r=await env.SELF.fetch(new Request(`${SITE_URL}/api/maintenance?job=tdGrade`,{method:'POST',headers:{authorization:`Bearer ${env.MAINTENANCE_TOKEN}`},signal:AbortSignal.timeout(60000)}));
  return {waiting,status:r.status};
}

// Injuries: ESPN's league-wide NFL injury report, one request, refreshed
// every 25 minutes (every 10 in Thursday, Sunday and Monday game windows).
const INJURY_URL='https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries';
const injuryClass=status=>{const s=String(status||'').toLowerCase();return /\bout\b|injured reserve|\bir\b|suspen|physically unable|\bpup\b|non-football|reserve/.test(s)?'out':/doubtful/.test(s)?'doubtful':/questionable|day-to-day|game-time/.test(s)?'questionable':null};
function parseInjuries(payload){
  const out=[];
  for(const team of Array.isArray(payload?.injuries)?payload.injuries:[]){
    const teamName=team.displayName||team.team?.displayName||'';
    for(const i of Array.isArray(team.injuries)?team.injuries:[]){
      const a=i.athlete||{},name=String(a.displayName||a.fullName||'').trim(),status=String(i.status||i.type?.description||'').trim();
      if(!name||!status)continue;
      const detail=[i.details?.side,i.details?.type,i.details?.detail].filter(x=>x&&!/not specified/i.test(x)).join(' ')||String(i.shortComment||'').slice(0,80);
      out.push({player:name,team:a.team?.displayName||teamName,position:String(a.position?.abbreviation||'').toUpperCase(),status,detail,date:i.date||''});
    }
  }
  return out;
}
function injuryFast(now){const d=new Date(now),day=d.getUTCDay(),h=d.getUTCHours();return (day===0&&h>=15)||(day===1&&(h<5||h>=22))||(day===2&&h<5)||(day===4&&h>=22)||(day===5&&h<5)}
async function refreshInjuries(env,now=Date.now()){
  if(!env.DB)return {};
  const last=Number(await appSetting(env,'injuries-at')||0);
  if(now-last<(injuryFast(now)?9:25)*60000)return {skipped:true};
  await setAppSetting(env,'injuries-at',String(now));
  const r=await fetch(INJURY_URL,{headers:{accept:'application/json'},signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw new Error(`injury report ${r.status}`);
  const payload=await r.json(),rows=parseInjuries(payload);
  // What the feed looked like, for checking its shape.
  await setAppSetting(env,'injuries-sample',JSON.stringify({teams:Array.isArray(payload?.injuries)?payload.injuries.length:0,rows:rows.length,first:payload?.injuries?.[0]?.injuries?.[0]||null}).slice(0,3000));
  if(!rows.length)return {rows:0};
  const statements=[env.DB.prepare('DELETE FROM injuries')];
  for(const x of rows)statements.push(env.DB.prepare('INSERT OR REPLACE INTO injuries (id,player,team,position,status,detail,reported_at,fetched_at) VALUES (?,?,?,?,?,?,?,?)').bind(`NFL|${normalizedName(x.player)}`,x.player,x.team||null,x.position||null,x.status,String(x.detail||'').slice(0,120)||null,x.date||null,now));
  await env.DB.batch(statements);
  return {rows:rows.length};
}
async function injuryMap(env){
  const rows=(await env.DB.prepare('SELECT player,team,position,status,detail,reported_at FROM injuries').all().catch(()=>({results:[]}))).results||[];
  return new Map(rows.map(r=>[normalizedName(r.player),r]));
}
// Boards without the props of players listed Out or Doubtful, so no pick,
// lean or test lands on someone who isn't expected to play.
function withoutInjured(boards,injuries){
  if(!injuries?.size)return boards;
  const skip=name=>['out','doubtful'].includes(injuryClass(injuries.get(normalizedName(name))?.status));
  return boards.map(b=>({...b,bookmakers:(b.bookmakers||[]).map(book=>({...book,markets:(book.markets||[]).map(m=>({...m,outcomes:(m.outcomes||[]).filter(o=>!skip(o.description))}))}))}));
}
// GET /api/injuries: status for every listed player (cached 10 minutes).
async function injuriesResponse(request,env,ctx){
  if(!env.DB)return json({success:true,players:{}});
  const saved=await readFeedCache(request,'injuries-v1-NFL');
  if(saved.response&&cacheAge(saved.response)<600000)return cachedForClient(saved.response,'fresh');
  const players={};for(const [k,r] of await injuryMap(env)){const c=injuryClass(r.status);if(c)players[k]={s:r.status,c,d:r.detail||'',t:r.team||'',p:r.position||'',at:r.reported_at||''}}
  const stored=storedResponse(JSON.stringify({success:true,players,updatedAt:new Date().toISOString()}),600);
  if(saved.cache&&saved.key)ctx?.waitUntil?.(saved.cache.put(saved.key,stored.clone()));
  return cachedForClient(stored,'miss');
}
// Usage-bump test: a receiver or back with a real role is out, so teammates
// at the same position should see more volume. Their Overs at the main line,
// best big-5 price, logged once per game about 90 minutes before kickoff.
const BUMP_MARKETS={WR:['player_receptions','player_reception_yds'],TE:['player_receptions','player_reception_yds'],RB:['player_rush_yds','player_rush_attempts']};
const BUMP_ROLE={WR:['Receptions',3],TE:['Receptions',3],RB:['Rush Attempts',8]};
function mainOver(board,player,marketKey){
  const lines=new Map();
  for(const book of board.bookmakers||[])for(const m of book.markets||[]){
    if(m.key!==marketKey)continue;
    for(const o of m.outcomes||[]){
      if(String(o.description||'').trim()!==player||String(o.name).toLowerCase()!=='over')continue;
      const pt=BTGStats.number(o.point),price=BTGStats.number(o.price);if(pt===null||price===null)continue;
      const l=lines.get(pt)||{books:0,best:null};l.books++;
      if(OFFICIAL_BOOKS.has(book.key)&&(!l.best||price>l.best.price))l.best={price,book:book.title||book.key};
      lines.set(pt,l);
    }
  }
  const top=[...lines].sort((a,b)=>b[1].books-a[1].books)[0];if(!top||!top[1].best)return null;
  return {line:top[0],odds:top[1].best.price,book:top[1].best.book};
}
async function recordBumpShadow(env,boards,injuries,now=Date.now()){
  if(!env.DB||!injuries?.size)return {logged:0};
  const stamp=new Date(now).toISOString(),statements=[];let logged=0;
  const done=new Set(((await env.DB.prepare('SELECT DISTINCT event_id FROM bump_shadow WHERE game_time>?').bind(stamp).all()).results||[]).map(r=>r.event_id));
  const form=new Map(((await env.DB.prepare('SELECT player,team,position,games_json FROM player_form WHERE team IS NOT NULL').all()).results||[]).map(r=>[normalizedName(r.player),r]));
  // A real role: 3+ catches (receivers) or 8+ carries (backs) a game lately.
  const role=(r,pos)=>{try{const [label,min]=BUMP_ROLE[pos];const v=(JSON.parse(r.games_json||'{}').m?.[label]||[]).filter(x=>x!==null).slice(0,6);return v.length>=3&&v.reduce((a,b)=>a+b,0)/v.length>=min}catch{return false}};
  for(const board of boards){
    const gameId=board.eventID||`NFL--${board.id}`,kickoff=Date.parse(board.commence_time);
    if(done.has(gameId)||!(kickoff>now)||kickoff-now>LEAN_WINDOW)continue;
    const teams=[board.home_team,board.away_team].map(normalizedName);
    const triggers=[...injuries.values()].filter(i=>injuryClass(i.status)==='out'&&teams.includes(normalizedName(i.team))&&BUMP_MARKETS[i.position]).filter(i=>{const f=form.get(normalizedName(i.player));return f&&role(f,i.position)});
    const players=new Set();for(const b of board.bookmakers||[])for(const m of b.markets||[])for(const o of m.outcomes||[])if(o.description)players.add(String(o.description).trim());
    for(const t of triggers){
      const group=t.position==='RB'?['RB']:['WR','TE'];
      for(const name of players){
        const f=form.get(normalizedName(name));if(!f||normalizedName(f.team)!==normalizedName(t.team)||!group.includes(f.position))continue;
        for(const key of BUMP_MARKETS[t.position]){
          const o=mainOver(board,name,key);if(!o||o.odds<-200||o.odds>200)continue;
          statements.push(env.DB.prepare('INSERT OR IGNORE INTO bump_shadow (id,event_id,player,team,market,side,line,odds,book,trigger_player,trigger_status,game_time,logged_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(`${gameId}|${normalizedName(name)}|${key}`,gameId,name,`${board.away_team} · @ ${board.home_team}`,recordLabels[key],'Over',o.line,o.odds,o.book,t.player,t.status,new Date(kickoff).toISOString(),stamp));logged++;
        }
      }
    }
    // A placeholder so each game is checked once.
    statements.push(env.DB.prepare("INSERT OR IGNORE INTO bump_shadow (id,event_id,player,market,side,line,odds,book,trigger_player,trigger_status,game_time,logged_at,result) VALUES (?,?,'-','-','-',0,0,'-','-','-',?,?,'none')").bind(`${gameId}|none`,gameId,new Date(kickoff).toISOString(),stamp));
  }
  if(statements.length)await env.DB.batch(statements);
  return {logged};
}
async function gradeBumpShadow(env,now=Date.now(),limit=20){
  if(!env.DB||!env.BALLDONTLIE_API_KEY)return {graded:0};
  const rows=(await env.DB.prepare('SELECT * FROM bump_shadow WHERE result IS NULL AND game_time<? AND game_time>? ORDER BY game_time LIMIT ?').bind(new Date(now-4*3600000).toISOString(),new Date(now-14*86400000).toISOString(),limit).all()).results||[];
  const cache=new Map(),statements=[],stamp=new Date(now).toISOString();
  for(const r of rows){
    const record={sport:'NFL',player:r.player,team:r.team,gameTime:r.game_time,market:r.market,side:r.side,line:r.line};
    const stat=await recordPlayerStats(record,env,undefined,cache).catch(()=>null);
    if(shadowVoid(stat,r.game_time,now)){statements.push(env.DB.prepare('UPDATE bump_shadow SET result=?,graded_at=? WHERE id=?').bind('void',stamp,r.id));continue}
    if(!stat||stat.missingPlayerStats||!(stat.scoreboardFinal||nflGameState(stat.game||{})==='final'))continue;
    const value=BTGStats.metric(record,stat).value,result=value===null?null:BTGStats.grade(r.side,r.line,value);
    if(result)statements.push(env.DB.prepare('UPDATE bump_shadow SET actual=?,result=?,graded_at=? WHERE id=?').bind(value,result,stamp,r.id));
  }
  if(statements.length)await env.DB.batch(statements);
  return {graded:statements.length,checked:rows.length};
}

// Live props (shadow). Checkpoints: early in the 2nd quarter (the 1st quarter
// is done) and halftime / early 3rd quarter. Slow starters (under 60% of the
// pregame line's pace) are logged Over the live line; hot starters (over 150%)
// Under it. Only main lines, at the best big-5 live price, -200 to +200.
const LIVE_MARKETS=['player_receptions','player_reception_yds','player_rush_yds','player_pass_yds'];
const LIVE_MIN_LINE={player_receptions:2.5,player_reception_yds:19.5,player_rush_yds:19.5,player_pass_yds:150};
function liveCheckpoint(g){
  const [m,s]=String(g.clock||'').split(':').map(Number),left=Number.isFinite(m)?m+(s||0)/60:null;
  if(g.halftime)return {cp:'HALF',f:.5};
  if(left===null||!g.period)return null;
  const f=((g.period-1)*15+(15-left))/60;
  if(g.period===2&&left>=7)return {cp:'Q1',f};
  if(g.period===3&&left>=10)return {cp:'HALF',f};
  return null;
}
async function recordLiveShadow(env,ctx,now=Date.now()){
  if(!env.DB||!env.THE_ODDS_API_KEY||!env.BALLDONTLIE_API_KEY)return {logged:0};
  const live=await (await liveGames(new Request(`${SITE_URL}/api/live`),env,ctx||{waitUntil(){}})).json().catch(()=>({}));
  const playing=(live.games||[]).filter(g=>g.state==='in_progress').map(g=>({...g,check:liveCheckpoint(g)})).filter(g=>g.check);
  if(!playing.length)return {checkpoints:0};
  const schedule=await (await futureSchedule(new Request(new URL('/api/schedule',SITE_URL)),env,ctx||{waitUntil(){}})).json().catch(()=>({}));
  const done=new Set(((await env.DB.prepare("SELECT DISTINCT event_id||'|'||checkpoint AS k FROM live_shadow WHERE game_time>?").bind(new Date(now-10*3600000).toISOString()).all()).results||[]).map(r=>r.k));
  const statements=[],stamp=new Date(now).toISOString();let logged=0,checked=0;
  for(const g of playing){
    const ev=(schedule.data||[]).find(e=>normalizedName(e.teams?.home?.names?.medium)===normalizedName(g.home?.full_name)&&normalizedName(e.teams?.away?.names?.medium)===normalizedName(g.away?.full_name));
    if(!ev||done.has(`${ev.eventID}|${g.check.cp}`))continue;
    checked++;
    const kickoff=Date.parse(ev.status?.startsAt||g.startsAt||'');
    const pre=await env.DB.prepare("SELECT payload_json FROM movement_snapshots WHERE event_id=? AND kind='observed' AND captured_at<? ORDER BY captured_at DESC LIMIT 1").bind(ev.eventID,Number.isFinite(kickoff)?kickoff:now).first();
    let preBoard=null;try{preBoard=JSON.parse(pre?.payload_json||'null')}catch{}
    const board=await fetchEventOdds({...SPORTS[0],markets:LIVE_MARKETS,expandedMarkets:[]},ev.eventID.split('--')[1],env.THE_ODDS_API_KEY,false).catch(()=>null);
    const box=await fetchLiveBoxScore(new Request(`${SITE_URL}/api/live/game`),String(g.id),env,ctx||{waitUntil(){}}).catch(()=>null);
    // A row per checkpoint marks it done even when nothing qualifies; a
    // failed fetch is retried on the next run instead.
    if(!preBoard||(board&&box?.stats?.length))statements.push(env.DB.prepare("INSERT OR IGNORE INTO live_shadow (id,event_id,player,market,checkpoint,elapsed,stat_at,pregame_line,live_line,side,odds,book,expected_final,gap,pace,game_time,logged_at,result) VALUES (?,?,'-','-',?,?,0,0,0,'-',0,'-',0,0,'-',?,?,'none')").bind(`${ev.eventID}|${g.check.cp}|none`,ev.eventID,g.check.cp,g.check.f,new Date(Number.isFinite(kickoff)?kickoff:now).toISOString(),stamp));
    if(!board||!preBoard||!box?.stats?.length)continue;
    // Live prices only while the book is still updating them.
    board.bookmakers=(board.bookmakers||[]).map(b=>({...b,markets:(b.markets||[]).filter(m=>{const t=Date.parse(m.last_update||b.last_update||'');return Number.isFinite(t)&&now-t<180000})})).filter(b=>b.markets.length);
    const rows=new Map(box.stats.map(r=>[normalizedName(playerLabel(r.player)),r]));
    const score=`${g.awayScore??'-'}-${g.homeScore??'-'}`;
    const names=new Set();for(const b of board.bookmakers)for(const m of b.markets)for(const o of m.outcomes||[])if(o.description)names.add(String(o.description).trim());
    for(const name of names){
      const row=rows.get(normalizedName(name));if(!row)continue;
      for(const key of LIVE_MARKETS){
        const label=recordLabels[key],preLine=mainOver(preBoard,name,key)?.line;
        if(!Number.isFinite(preLine)||preLine<LIVE_MIN_LINE[key])continue;
        const stat=BTGStats.metric({market:label,sport:'NFL'},row).value;if(stat===null)continue;
        const f=g.check.f,paceShare=stat/Math.max(.1,f*preLine);
        const pace=paceShare<.6?'slow':paceShare>1.5?'hot':null;if(!pace)continue;
        const side=pace==='slow'?'Over':'Under';
        const liveMain=mainOver(board,name,key);if(!liveMain)continue;
        let best=null;
        for(const b of board.bookmakers)if(OFFICIAL_BOOKS.has(b.key))for(const m of b.markets)if(m.key===key)for(const o of m.outcomes||[])if(String(o.description||'').trim()===name&&String(o.name).toLowerCase()===side.toLowerCase()&&BTGStats.number(o.point)===liveMain.line){const p=BTGStats.number(o.price);if(p!==null&&(!best||p>best.odds))best={odds:p,book:b.title||b.key}}
        if(!best||best.odds<-200||best.odds>200)continue;
        const expected=stat+(1-f)*preLine,gap=side==='Over'?expected-liveMain.line:liveMain.line-expected;
        const targets=BTGStats.read(row,['receiving_targets','targets']);
        statements.push(env.DB.prepare('INSERT OR IGNORE INTO live_shadow (id,event_id,player,market,checkpoint,elapsed,stat_at,targets,pregame_line,live_line,side,odds,book,expected_final,gap,pace,score,team,game_time,logged_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(`${ev.eventID}|${g.check.cp}|${normalizedName(name)}|${key}`,ev.eventID,name,label,g.check.cp,+f.toFixed(3),stat,targets,preLine,liveMain.line,side,best.odds,best.book,+expected.toFixed(2),+gap.toFixed(2),pace,score,`${g.away?.full_name||''} · @ ${g.home?.full_name||''}`,new Date(Number.isFinite(kickoff)?kickoff:now).toISOString(),stamp));logged++;
      }
    }
  }
  if(statements.length)await env.DB.batch(statements);
  return {checked,logged};
}
async function gradeLiveShadow(env,now=Date.now(),limit=30){
  if(!env.DB||!env.BALLDONTLIE_API_KEY)return {graded:0};
  const rows=(await env.DB.prepare('SELECT * FROM live_shadow WHERE result IS NULL AND game_time<? AND game_time>? ORDER BY game_time LIMIT ?').bind(new Date(now-4*3600000).toISOString(),new Date(now-14*86400000).toISOString(),limit).all()).results||[];
  const cache=new Map(),statements=[],stamp=new Date(now).toISOString();
  for(const r of rows){
    const record={sport:'NFL',player:r.player,team:r.team,gameTime:r.game_time,market:r.market,side:r.side,line:r.live_line};
    const stat=await recordPlayerStats(record,env,undefined,cache).catch(()=>null);
    if(!stat||stat.missingPlayerStats||!(stat.scoreboardFinal||nflGameState(stat.game||{})==='final'))continue;
    const value=BTGStats.metric(record,stat).value,result=value===null?null:BTGStats.grade(r.side,r.live_line,value);
    if(result)statements.push(env.DB.prepare('UPDATE live_shadow SET actual=?,result=?,graded_at=? WHERE id=?').bind(value,result,stamp,r.id));
  }
  if(statements.length)await env.DB.batch(statements);
  return {graded:statements.length,checked:rows.length};
}

// Game lines (shadow): moneylines, spreads and totals with the props' fair-
// price method (no-vig average of every book pricing both sides, 3+ books),
// best big-5 price, 1% to 12% better than fair, -250 to +300. One side per
// game and market, logged the first time it qualifies; graded from the final.
const GAME_MARKETS={h2h:'Moneyline',spreads:'Spread',totals:'Total'};
async function fetchGameLines(apiKey){
  const q=new URLSearchParams({apiKey,regions:'us',markets:Object.keys(GAME_MARKETS).join(','),oddsFormat:'american',dateFormat:'iso'});
  const r=await fetch(`${API_BASE}/sports/${SPORTS[0].key}/odds?${q}`,{headers:{accept:'application/json'}});
  const body=await r.text();if(!r.ok)throw new Error(providerMessage(body,'Game lines are unavailable.'));
  const data=JSON.parse(body);return Array.isArray(data)?data:[];
}
// Both sides of one market at one book: a = home (or Over), c = away (or Under).
function gamePair(event,market){
  const o=market.outcomes||[];
  if(market.key==='totals'){const a=o.find(x=>x.name==='Over'),c=o.find(x=>x.name==='Under');return a&&c&&Number(a.point)===Number(c.point)?{a,c,key:Number(a.point)}:null}
  const a=o.find(x=>x.name===event.home_team),c=o.find(x=>x.name===event.away_team);if(!a||!c)return null;
  if(market.key==='spreads')return a.point!=null&&Number(a.point)===-Number(c.point)?{a,c,key:Number(a.point)}:null;
  return {a,c,key:'ml'};
}
function gameLineCandidates(events,now=Date.now()){
  const best=new Map();
  for(const e of events){
    const kick=Date.parse(e.commence_time);if(!(kick>now+5*60000))continue;
    for(const [key,label] of Object.entries(GAME_MARKETS)){
      const groups=new Map();
      for(const b of e.bookmakers||[]){
        const m=(b.markets||[]).find(m=>m.key===key);if(!m)continue;
        const updated=Date.parse(m.last_update||b.last_update||'');if(!Number.isFinite(updated)||now-updated>15*60000)continue;
        const pair=gamePair(e,m);if(!pair)continue;
        const a=BTGStats.number(pair.a.price),c=BTGStats.number(pair.c.price);if(a===null||c===null)continue;
        const list=groups.get(pair.key)||[];list.push({key:b.key,title:b.title||b.key,a,c});groups.set(pair.key,list);
      }
      for(const [line,list] of groups){
        if(list.length<3)continue;
        const fair=list.reduce((s,p)=>{const x=1/recordDecimal(p.a),y=1/recordDecimal(p.c);return s+x/(x+y)},0)/list.length;
        for(const side of ['a','c']){
          const top=list.filter(p=>OFFICIAL_BOOKS.has(p.key)).sort((x,y)=>recordDecimal(y[side])-recordDecimal(x[side]))[0];if(!top)continue;
          const odds=top[side],edge=100*((side==='a'?fair:1-fair)-1/recordDecimal(odds));
          if(edge<1||edge>12||odds<-250||odds>300)continue;
          const name=key==='totals'?(side==='a'?'Over':'Under'):(side==='a'?e.home_team:e.away_team);
          const point=line==='ml'?null:key==='spreads'&&side==='c'?-line:line;
          const row={eventId:e.eventID||`NFL--${e.id}`,home:e.home_team,away:e.away_team,market:label,side:name,line:point,odds,book:top.title,edge,gameTime:new Date(kick).toISOString()};
          const k=`${row.eventId}|${label}`;if(!best.has(k)||best.get(k).edge<edge)best.set(k,row);
        }
      }
    }
  }
  return [...best.values()];
}
function gameLinePrice(event,r){
  const key=Object.keys(GAME_MARKETS).find(k=>GAME_MARKETS[k]===r.market);let top=null;
  for(const b of event.bookmakers||[])if(OFFICIAL_BOOKS.has(b.key))for(const m of b.markets||[]){
    if(m.key!==key)continue;
    for(const o of m.outcomes||[])if(o.name===r.side&&(r.line===null||Number(o.point)===Number(r.line))){const p=BTGStats.number(o.price);if(p!==null&&(top===null||recordDecimal(p)>recordDecimal(top)))top=p}
  }
  return top;
}
async function recordGameShadow(env,now=Date.now()){
  if(!env.DB||!env.THE_ODDS_API_KEY)return {logged:0};
  // 3 credits a call: every 10 minutes in NFL windows, every 30 otherwise.
  const last=Number(await appSetting(env,'game-lines-at')||0);
  if(now-last<(nflActiveWindow(new Date(now))?9:29)*60000)return {skipped:true};
  await setAppSetting(env,'game-lines-at',String(now));
  const events=(await fetchGameLines(env.THE_ODDS_API_KEY)).map(e=>({...e,eventID:`NFL--${e.id}`}));
  const stamp=new Date(now).toISOString(),statements=[];
  const picks=gameLineCandidates(events,now);
  for(const p of picks)statements.push(env.DB.prepare('INSERT OR IGNORE INTO game_shadow (id,event_id,home,away,market,side,line,odds,book,edge,game_time,logged_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').bind(`${p.eventId}|${p.market}`,p.eventId,p.home,p.away,p.market,p.side,p.line,p.odds,p.book,+p.edge.toFixed(2),p.gameTime,stamp));
  const open=(await env.DB.prepare('SELECT id,event_id,market,side,line FROM game_shadow WHERE game_time>?').bind(stamp).all()).results||[];
  for(const r of open){const e=events.find(e=>e.eventID===r.event_id);const p=e?gameLinePrice(e,r):null;if(p!==null)statements.push(env.DB.prepare('UPDATE game_shadow SET close_odds=?,close_at=? WHERE id=?').bind(p,stamp,r.id))}
  if(statements.length)await env.DB.batch(statements);
  return {games:events.length,qualified:picks.length,tracked:open.length};
}
function gameLineResult(r,hs,as){
  const diff=(v)=>v>0?'won':v<0?'lost':'push';
  if(r.market==='Total')return diff((r.side==='Over'?1:-1)*(hs+as-r.line));
  const mine=r.side===r.home?hs:as,theirs=r.side===r.home?as:hs;
  return diff(mine+(r.market==='Spread'?Number(r.line):0)-theirs);
}
async function gradeGameShadow(env,now=Date.now(),limit=30){
  if(!env.DB||!env.BALLDONTLIE_API_KEY)return {graded:0};
  const rows=(await env.DB.prepare('SELECT * FROM game_shadow WHERE result IS NULL AND game_time<? AND game_time>? ORDER BY game_time LIMIT ?').bind(new Date(now-4*3600000).toISOString(),new Date(now-14*86400000).toISOString(),limit).all()).results||[];
  if(!rows.length)return {graded:0};
  const q=new URLSearchParams({per_page:'100'}),dates=new Set();
  for(const r of rows){const t=Date.parse(r.game_time);dates.add(new Date(t-6*3600000).toISOString().slice(0,10));dates.add(new Date(t).toISOString().slice(0,10))}
  for(const d of dates)q.append('dates[]',d);
  const games=(await bdlRequest(`/nfl/v1/games?${q}`,env.BALLDONTLIE_API_KEY))?.data||[];
  const statements=[],stamp=new Date(now).toISOString();
  for(const r of rows){
    const g=games.find(g=>normalizedName(g.home_team?.full_name)===normalizedName(r.home)&&normalizedName(g.visitor_team?.full_name)===normalizedName(r.away));
    if(!g||nflGameState(g)!=='final')continue;
    const hs=Number(g.home_team_score),as=Number(g.visitor_team_score);if(!Number.isFinite(hs)||!Number.isFinite(as))continue;
    statements.push(env.DB.prepare('UPDATE game_shadow SET home_score=?,away_score=?,result=?,graded_at=? WHERE id=?').bind(hs,as,gameLineResult(r,hs,as),stamp,r.id));
  }
  if(statements.length)await env.DB.batch(statements);
  return {graded:statements.length,checked:rows.length};
}
// Weather: the forecast at each outdoor stadium (domes and closed roofs are
// left out), refreshed every two hours for games in the next three days.
// Sunday games before 16:00 UTC are international and skipped (the home
// team's stadium isn't where they're played).
const OUTDOOR_STADIUMS={
  'Baltimore Ravens':['M&T Bank Stadium',39.278,-76.623],'Buffalo Bills':['Highmark Stadium',42.774,-78.787],'Carolina Panthers':['Bank of America Stadium',35.226,-80.853],
  'Chicago Bears':['Soldier Field',41.862,-87.617],'Cincinnati Bengals':['Paycor Stadium',39.095,-84.516],'Cleveland Browns':['Huntington Bank Field',41.506,-81.700],
  'Denver Broncos':['Empower Field',39.744,-105.020],'Green Bay Packers':['Lambeau Field',44.501,-88.062],'Jacksonville Jaguars':['EverBank Stadium',30.324,-81.637],
  'Kansas City Chiefs':['Arrowhead Stadium',39.049,-94.484],'Miami Dolphins':['Hard Rock Stadium',25.958,-80.239],'New England Patriots':['Gillette Stadium',42.091,-71.264],
  'New York Giants':['MetLife Stadium',40.814,-74.074],'New York Jets':['MetLife Stadium',40.814,-74.074],'Philadelphia Eagles':['Lincoln Financial Field',39.901,-75.168],
  'Pittsburgh Steelers':['Acrisure Stadium',40.447,-80.016],'San Francisco 49ers':["Levi's Stadium",37.403,-121.970],'Seattle Seahawks':['Lumen Field',47.595,-122.332],
  'Tampa Bay Buccaneers':['Raymond James Stadium',27.976,-82.503],'Tennessee Titans':['Nissan Stadium',36.166,-86.771],'Washington Commanders':['Northwest Stadium',38.908,-76.864]
};
const internationalSlot=t=>{const d=new Date(t);return d.getUTCDay()===0&&d.getUTCHours()<16};
async function refreshWeather(env,games,now=Date.now()){
  if(!env.DB)return {};
  const have=new Map(((await env.DB.prepare('SELECT event_id,fetched_at FROM game_weather WHERE game_time>?').bind(new Date(now).toISOString()).all()).results||[]).map(r=>[r.event_id,r.fetched_at]));
  const statements=[];let fetched=0;
  for(const g of games){
    const kick=Date.parse(g.startsAt),stadium=OUTDOOR_STADIUMS[g.home];
    if(!stadium||!(kick>now)||kick-now>72*3600000||internationalSlot(kick)||now-(have.get(g.eventID)||0)<2*3600000||fetched>=8)continue;
    const day=new Date(kick).toISOString().slice(0,10),end=new Date(kick+4*3600000).toISOString().slice(0,10);
    const q=new URLSearchParams({latitude:String(stadium[1]),longitude:String(stadium[2]),hourly:'temperature_2m,wind_speed_10m,wind_gusts_10m,precipitation_probability',temperature_unit:'fahrenheit',wind_speed_unit:'mph',timezone:'UTC',start_date:day,end_date:end});
    let body=null;try{const r=await fetch(`https://api.open-meteo.com/v1/forecast?${q}`,{signal:AbortSignal.timeout(10000)});if(r.ok)body=await r.json()}catch{}
    fetched++;if(!body?.hourly?.time)continue;
    // The three hours of the game: average temperature, the strongest wind.
    const idx=body.hourly.time.map((t,i)=>[Date.parse(t+'Z'),i]).filter(([t])=>t>=kick-1800000&&t<=kick+3*3600000).map(([,i])=>i);
    if(!idx.length)continue;
    const vals=k=>idx.map(i=>body.hourly[k]?.[i]).filter(v=>Number.isFinite(v)),max=k=>{const v=vals(k);return v.length?Math.max(...v):null},avg=k=>{const v=vals(k);return v.length?v.reduce((a,b)=>a+b,0)/v.length:null};
    const r1=v=>v===null?null:Math.round(v);
    statements.push(env.DB.prepare('INSERT OR REPLACE INTO game_weather (event_id,stadium,game_time,temp_f,wind_mph,gust_mph,precip_pct,fetched_at) VALUES (?,?,?,?,?,?,?,?)').bind(g.eventID,stadium[0],new Date(kick).toISOString(),r1(avg('temperature_2m')),r1(max('wind_speed_10m')),r1(max('wind_gusts_10m')),r1(max('precipitation_probability')),now));
  }
  if(statements.length)await env.DB.batch(statements);
  return {fetched,saved:statements.length};
}
async function refreshWeatherFromSchedule(env,ctx,now=Date.now()){
  const schedule=await (await futureSchedule(new Request(new URL('/api/schedule',SITE_URL)),env,ctx||{waitUntil(){}})).json().catch(()=>({}));
  const games=(schedule.data||[]).filter(e=>String(e.eventID||'').startsWith('NFL--')).map(e=>({eventID:e.eventID,home:e.teams?.home?.names?.medium,startsAt:e.status?.startsAt}));
  return refreshWeather(env,games,now);
}
// GET /api/weather: forecasts for upcoming outdoor games, cached 10 minutes.
async function weatherResponse(request,env,ctx,now=Date.now()){
  if(!env.DB)return json({success:true,games:{}});
  const saved=await readFeedCache(request,'weather-v1-NFL');
  if(saved.response&&cacheAge(saved.response)<600000)return cachedForClient(saved.response,'fresh');
  const rows=(await env.DB.prepare('SELECT * FROM game_weather WHERE game_time>?').bind(new Date(now-4*3600000).toISOString()).all().catch(()=>({results:[]}))).results||[];
  const games={};for(const r of rows)games[r.event_id]={stadium:r.stadium,temp:r.temp_f,wind:r.wind_mph,gust:r.gust_mph,precip:r.precip_pct};
  const stored=storedResponse(JSON.stringify({success:true,games,updatedAt:new Date(now).toISOString()}),600);
  if(saved.cache&&saved.key)ctx?.waitUntil?.(saved.cache.put(saved.key,stored.clone()));
  return cachedForClient(stored,'miss');
}

// Stats check (shadow): does the stat line agree with a pick? For each
// official pick and near miss, project the stat from the player's recent
// games (last 5, last 10, this season) and the opponent's defense against
// that position, then record agree / neutral / disagree. Picks are never
// changed; once enough are graded, the record shows whether agreement wins.
const STATS_POS={WR:'WR',TE:'TE',RB:'RB',FB:'RB',HB:'RB',QB:'QB'};
const STATS_POS_NAMES={'WIDE RECEIVER':'WR','TIGHT END':'TE','RUNNING BACK':'RB','FULLBACK':'RB','QUARTERBACK':'QB'};
const statsPos=p=>{const v=String(p?.position_abbreviation||p?.position||'').toUpperCase().trim();return STATS_POS[v]||STATS_POS_NAMES[v]||null};
const nflSeasonOf=t=>{const d=new Date(t);return d.getUTCMonth()<2?d.getUTCFullYear()-1:d.getUTCFullYear()};
// Markets whose totals add up across a position group, so "allowed by the
// defense" means something. Longest plays, scorer props and defense stats don't.
const additiveMarket=m=>!/longest|first|last|quarter|half|anytime|touchdowns?$|tackle|sack|interception|field goal|extra point|kicking/i.test(String(m||''))||/passing touchdowns|receiving touchdowns|rushing touchdowns/i.test(String(m||''));
const statsAvg=list=>list.length?list.reduce((s,v)=>s+v,0)/list.length:null;
function statsSum(rows){
  const out={};
  for(const row of rows)for(const [key,value] of Object.entries(row||{}))if(typeof value==='number'&&Number.isFinite(value))out[key]=(out[key]||0)+value;
  return out;
}
// What each defense allowed to each position, a few finished games per run.
async function ingestDefenseGames(env,now=Date.now(),limit=4){
  if(!env.DB||!env.BALLDONTLIE_API_KEY)return {ingested:0};
  const season=nflSeasonOf(now),games=[];let cursor=null;
  for(let page=0;page<3;page++){
    const query=new URLSearchParams([['seasons[]',String(season)],['per_page','100']]);if(cursor)query.set('cursor',String(cursor));
    const payload=await bdlRequest(`/nfl/v1/games?${query}`,env.BALLDONTLIE_API_KEY);
    games.push(...(Array.isArray(payload?.data)?payload.data:[]));
    cursor=payload?.meta?.next_cursor||null;if(!cursor)break;
  }
  const done=new Set(((await env.DB.prepare('SELECT DISTINCT game_id FROM defense_games').all()).results||[]).map(r=>String(r.game_id)));
  const todo=games.filter(g=>{const d=new Date(g.date||g.datetime||'');return nflGameState(g)==='final'&&!g.postseason&&!done.has(String(g.id))&&Number.isFinite(d.getTime())&&d.getUTCMonth()!==7&&d.getTime()<now}).sort((a,b)=>Date.parse(a.date||a.datetime)-Date.parse(b.date||b.datetime)).slice(0,limit);
  const statements=[];let ingested=0;
  for(const g of todo){
    const rows=[];let next=null;
    for(let page=0;page<2;page++){
      const query=new URLSearchParams([['game_ids[]',String(g.id)],['per_page','100']]);if(next)query.set('cursor',String(next));
      const payload=await bdlRequest(`/nfl/v1/stats?${query}`,env.BALLDONTLIE_API_KEY);
      rows.push(...(Array.isArray(payload?.data)?payload.data:[]));
      next=payload?.meta?.next_cursor||null;if(!next)break;
    }
    const home=g.home_team?.full_name,away=g.visitor_team?.full_name,date=new Date(g.date||g.datetime).toISOString(),groups=new Map();
    for(const row of rows){
      const team=row.team?.full_name||row.player?.team?.full_name,pos=statsPos(row.player);
      if(!team||!pos||!home||!away)continue;
      const defense=normalizedName(team)===normalizedName(home)?away:home,key=`${normalizedName(defense)}|${pos}`;
      groups.set(key,[...(groups.get(key)||[]),row]);
    }
    // No box score yet: try again next run, unless the game is days old.
    if(!groups.size){if(now-Date.parse(date)>3*86400000)statements.push(env.DB.prepare('INSERT OR IGNORE INTO defense_games (game_id,defense,position,game_date,stats_json) VALUES (?,?,?,?,?)').bind(String(g.id),'-','-',date,'{}'));continue}
    for(const [key,list] of groups){const [defense,pos]=key.split('|');statements.push(env.DB.prepare('INSERT OR REPLACE INTO defense_games (game_id,defense,position,game_date,stats_json) VALUES (?,?,?,?,?)').bind(String(g.id),defense,pos,date,JSON.stringify(statsSum(list))))}
    ingested++;
  }
  if(statements.length)await env.DB.batch(statements);
  return {ingested,pending:Math.max(0,games.filter(g=>nflGameState(g)==='final'&&!done.has(String(g.id))).length-ingested)};
}
// The opponent's allowed per game to this position in this market, against
// the league-wide average. Needs 3+ opponent games and 20+ league games.
async function defenseFactor(env,opponent,pos,market,now=Date.now()){
  if(!opponent||!pos||!additiveMarket(market))return null;
  const since=`${nflSeasonOf(now)}-08-01`;
  const rows=(await env.DB.prepare('SELECT defense,stats_json FROM defense_games WHERE position=? AND game_date>=?').bind(pos,since).all()).results||[];
  const values=rows.map(r=>{let stats={};try{stats=JSON.parse(r.stats_json)}catch{}return {defense:r.defense,value:BTGStats.metric({market,sport:'NFL'},stats).value}}).filter(r=>r.value!==null);
  const theirs=values.filter(r=>r.defense===normalizedName(opponent)).map(r=>r.value),league=statsAvg(values.map(r=>r.value));
  if(theirs.length<3||values.length<20||!league)return null;
  return {factor:statsAvg(theirs)/league,games:theirs.length,allowed:+statsAvg(theirs).toFixed(2),league:+league.toFixed(2)};
}
// Project one pick from the player's game log and the defense.
function statsVerdict(pick,logs,def,season){
  const line=Number(pick.line),over=pick.side==='Over';
  const values=logs.map(g=>g.value),l5=values.slice(0,5),l10=values.slice(0,10),seasonVals=logs.filter(g=>g.season===season).map(g=>g.value);
  const out={games:logs.length,l5_avg:statsAvg(l5),l10_avg:statsAvg(l10),season_avg:statsAvg(seasonVals),l10_hits:l10.filter(v=>over?v>line:v<line).length,l10_n:l10.length};
  if(l10.length<4)return {...out,projection:null,lean:null,verdict:'unknown'};
  const base=.4*out.l5_avg+.35*out.l10_avg+.25*(seasonVals.length>=3?out.season_avg:out.l10_avg);
  // Halfway toward the defense's rate, within ±15%: a few games are noisy.
  const adj=def?Math.min(1.15,Math.max(.85,1+.5*(def.factor-1))):1,projection=base*adj;
  // Low lines (1.5 and under) are mostly about how often it happens; higher
  // lines compare the projection with the line.
  const lean=line<=1.5?out.l10_hits/l10.length-.5:(over?1:-1)*(projection-line)/Math.max(Math.abs(line),1);
  return {...out,projection,lean,verdict:lean>=.08?'agree':lean<=-.08?'disagree':'neutral'};
}
async function checkPickStats(env,ctx,pick,now=Date.now()){
  const url=new URL('/api/player-stats',SITE_URL);url.searchParams.set('sport','NFL');url.searchParams.set('player',pick.player);url.searchParams.set('team',pick.team||'');
  const payload=await (await playerStats(new Request(url),env,ctx||{waitUntil(){}})).json().catch(()=>({}));
  const kickoff=Date.parse(pick.game_time),season=nflSeasonOf(kickoff);
  const logs=(payload?.success?payload.stats||[]:[]).map(row=>({date:Date.parse(row?.game?.date||row?.game?.datetime||''),season:Number(row?.game?.season),value:BTGStats.metric({market:pick.market,sport:'NFL'},row).value})).filter(g=>g.value!==null&&Number.isFinite(g.date)&&g.date<kickoff-3600000).sort((a,b)=>b.date-a.date);
  const mine=payload?.player?.team?.full_name||'',[away,home]=String(pick.team||'').split(/\s*·\s*(?:@|vs)\s*/);
  const opponent=mine&&away&&home?(normalizedName(mine)===normalizedName(away)?home:normalizedName(mine)===normalizedName(home)?away:null):null;
  const pos=statsPos(payload?.player),def=await defenseFactor(env,opponent,pos,pick.market,now).catch(()=>null);
  return {...statsVerdict(pick,logs,def,season),opponent,position:pos,def,recent:logs.slice(0,10).map(g=>g.value)};
}
// One run: add defense games, then check up to two picks that haven't
// started (official picks first, then near misses).
async function runStatsChecks(env,ctx,now=Date.now()){
  if(!env.DB||!env.BALLDONTLIE_API_KEY)return {checked:0};
  const defense=await ingestDefenseGames(env,now).catch(error=>({error:error.message}));
  const start=new Date(now).toISOString();
  const official=((await env.DB.prepare("SELECT id,player,market,side,line,game_time,legs_json FROM public_recommendations WHERE source='market-verified-v2' AND id LIKE 'official|%' AND kind='prop' AND game_time>? AND id NOT IN (SELECT id FROM stats_checks) ORDER BY game_time LIMIT 2").bind(start).all()).results||[]).map(r=>({...r,kind:'official',team:recordLegs(r)[0]?.team||''}));
  const near=official.length>=2?[]:((await env.DB.prepare("SELECT 'near|'||id AS id,player,team,market,side,line,game_time FROM near_shadow WHERE game_time>? AND 'near|'||id NOT IN (SELECT id FROM stats_checks) ORDER BY game_time LIMIT ?").bind(start,2-official.length).all()).results||[]).map(r=>({...r,kind:'near'}));
  const statements=[];
  for(const pick of [...official,...near]){
    // A provider error leaves the pick unchecked, so the next run tries again.
    const c=await checkPickStats(env,ctx,pick,now).catch(()=>null);if(!c)continue;
    const r2=v=>v==null||!Number.isFinite(v)?null:+v.toFixed(3);
    statements.push(env.DB.prepare('INSERT OR REPLACE INTO stats_checks (id,kind,player,market,side,line,game_time,opponent,position,games,l5_avg,l10_avg,season_avg,l10_hits,def_factor,def_games,projection,lean,verdict,detail_json,checked_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(pick.id,pick.kind,pick.player,pick.market,pick.side,pick.line,pick.game_time,c.opponent||null,c.position||null,c.games||0,r2(c.l5_avg),r2(c.l10_avg),r2(c.season_avg),c.l10_hits??null,r2(c.def?.factor),c.def?.games??null,r2(c.projection),r2(c.lean),c.verdict,JSON.stringify({recent:c.recent||[],def:c.def||null,l10_n:c.l10_n??null}),start));
  }
  if(statements.length)await env.DB.batch(statements);
  return {defense,checked:statements.length};
}
// The test so far: picks by verdict, with results (official and near misses).
async function statsCheckSummary(env){
  const rows=(await env.DB.prepare("SELECT c.kind,c.verdict,COALESCE(p.result,n.result) AS result FROM stats_checks c LEFT JOIN public_recommendations p ON p.id=c.id AND p.status='final' LEFT JOIN near_shadow n ON 'near|'||n.id=c.id").all()).results||[];
  const out={};
  for(const r of rows){const k=`${r.kind}|${r.verdict}`,s=out[k]||(out[k]={kind:r.kind,verdict:r.verdict,picks:0,won:0,lost:0,push:0,void:0,pending:0});s.picks++;if(['won','lost','push','void'].includes(r.result))s[r.result]++;else s.pending++}
  return Object.values(out);
}
// Grade shadow picks once their game is final (needs BALLDONTLIE NBA stats).
async function gradeNbaShadow(env,now=Date.now()){
  if(!env.DB||!env.BALLDONTLIE_API_KEY)return {graded:0};
  const rows=(await env.DB.prepare('SELECT * FROM nba_shadow WHERE result IS NULL AND game_time<? ORDER BY game_time LIMIT 25').bind(new Date(now-3*3600000).toISOString()).all()).results||[];
  const cache=new Map(),statements=[];
  for(const r of rows){
    const record={sport:'NBA',player:r.player,team:r.team,gameTime:r.game_time,market:r.market,side:r.side,line:r.line};
    const stat=await recordPlayerStats(record,env,undefined,cache).catch(()=>null);
    if(!stat||!stat.scoreboardFinal||stat.missingPlayerStats)continue;
    // Didn't play: sportsbooks void the prop, so it's no action, never a loss.
    if(!BTGStats.nbaPlayed(stat)){statements.push(env.DB.prepare('UPDATE nba_shadow SET actual=NULL,result=?,graded_at=? WHERE id=?').bind('void',new Date(now).toISOString(),r.id));continue}
    const value=BTGStats.metric(record,stat).value,result=value===null?null:BTGStats.grade(r.side,r.line,value);
    if(result)statements.push(env.DB.prepare('UPDATE nba_shadow SET actual=?,result=?,graded_at=? WHERE id=?').bind(value,result,new Date(now).toISOString(),r.id));
  }
  if(statements.length)await env.DB.batch(statements);
  return {graded:statements.length,checked:rows.length};
}
// Shadow picks only: a player missing from a final box score 36+ hours after
// kickoff most likely didn't play, which sportsbooks void (no action). Marking
// it void keeps it out of the win rate instead of waiting forever.
const shadowVoid=(stat,gameTime,now)=>Boolean(stat?.missingPlayerStats&&stat.scoreboardFinal&&now-Date.parse(gameTime)>36*3600000);
// Grade line-value shadow picks once their game is final, the same way
// official picks are graded. Older rows logged before the team was stored
// look it up from the saved odds snapshots.
async function gradeLineShadow(env,now=Date.now()){
  if(!env.DB||!env.BALLDONTLIE_API_KEY)return {graded:0};
  const rows=(await env.DB.prepare('SELECT * FROM line_shadow WHERE result IS NULL AND game_time<? AND game_time>? ORDER BY game_time LIMIT 25').bind(new Date(now-4*3600000).toISOString(),new Date(now-14*86400000).toISOString()).all()).results||[];
  const cache=new Map(),teams=new Map(),statements=[],stamp=new Date(now).toISOString();let graded=0;
  for(const r of rows){
    let team=r.team;
    if(!team){
      // Snapshots keep the NFL-- prefix; older ones may not, so try both.
      const provider=String(r.event_id).replace(/^NFL--/,'');
      if(!teams.has(provider)){const snap=await env.DB.prepare("SELECT json_extract(payload_json,'$.away_team') away,json_extract(payload_json,'$.home_team') home FROM movement_snapshots WHERE event_id IN (?,?) AND kind='observed' LIMIT 1").bind(`NFL--${provider}`,provider).first().catch(()=>null);teams.set(provider,snap?.away&&snap?.home?`${snap.away} · @ ${snap.home}`:null)}
      team=teams.get(provider);
      if(!team)continue;
      statements.push(env.DB.prepare('UPDATE line_shadow SET team=? WHERE id=?').bind(team,r.id));
    }
    const record={sport:'NFL',player:r.player,team,gameTime:r.game_time,market:r.market,side:r.side,line:r.line};
    const stat=await recordPlayerStats(record,env,undefined,cache).catch(()=>null);
    if(shadowVoid(stat,r.game_time,now)){graded++;statements.push(env.DB.prepare('UPDATE line_shadow SET actual=NULL,result=?,graded_at=? WHERE id=?').bind('void',stamp,r.id));continue}
    if(!stat||stat.missingPlayerStats||!(stat.scoreboardFinal||nflGameState(stat.game||{})==='final'))continue;
    const value=BTGStats.metric(record,stat).value,result=value===null?null:BTGStats.grade(r.side,r.line,value);
    if(result){graded++;statements.push(env.DB.prepare('UPDATE line_shadow SET actual=?,result=?,graded_at=? WHERE id=?').bind(value,result,stamp,r.id))}
  }
  if(statements.length)await env.DB.batch(statements);
  return {graded,checked:rows.length};
}
// Games starting within this window get fresher prices (a 4-minute cache) and
// an extra check between the regular runs (opts.soonOnly: those games only).
const SOON_WINDOW=4*3600000,SOON_MAX_AGE=240000;
async function publishOfficialPicks(request,env,ctx,opts={}){
  if(Date.now()<OFFICIAL_START)return {state:"not_started"};
  if(!opts.soonOnly)jobStep('publish','schedule');

    const now=Date.now(),week=officialWeek(now),prefix=`official|${week}|`;
    const schedule=await futureSchedule(new Request(new URL('/api/schedule',request.url)),env,ctx);if(!schedule.ok)throw new Error('Official schedule unavailable');
    const body=await schedule.json();if(!opts.soonOnly)jobStep('publish','boards');
    // Every game left this week is eligible until 5 minutes before kickoff,
    // unless the odds plan runs low (then only the next 24 hours).
    const horizon=oddsCreditsLeft!==null&&oddsCreditsLeft<LOW_ODDS_CREDITS?24*3600000:OFFICIAL_HORIZON;
    const soon=e=>Date.parse(e.status?.startsAt)<=now+SOON_WINDOW;
    let events=(body.data||[]).filter(e=>{const t=Date.parse(e.status?.startsAt);return t>now+5*60000&&t<=now+horizon&&officialWeek(t)===week}).slice(0,16);
    if(opts.soonOnly){events=events.filter(soon).sort((a,b)=>Date.parse(a.status.startsAt)-Date.parse(b.status.startsAt)).slice(0,6);if(!events.length)return {state:'no_soon_games'}}
    const boards=[];let failedBoards=0;
    for(let i=0;i<events.length;i+=4){const results=await Promise.allSettled(events.slice(i,i+4).map(async e=>{const url=new URL('/api/event',request.url);url.searchParams.set('eventID',e.eventID);const r=await eventProps(new Request(url),env,ctx,soon(e)?{maxAge:SOON_MAX_AGE}:{});if(!r.ok||r.headers.get('x-feed-cache')==='stale')throw new Error('Official board unavailable');return (await r.json()).data||[]}));for(const r of results)if(r.status==='fulfilled')boards.push(...r.value);else failedBoards++}
    // Players listed Out or Doubtful are taken off the boards first.
    const injuries=await injuryMap(env).catch(()=>new Map());boards.splice(0,boards.length,...withoutInjured(boards,injuries));
    if(!opts.soonOnly)jobStep('publish','plan');const existing=await env.DB.prepare('SELECT * FROM public_recommendations WHERE id>=? AND id<?').bind(prefix,prefix+'\uffff').all();
    const stats={};const candidates=officialCandidates(boards,Date.now(),stats);const plan=officialPlan(candidates,existing.results||[],week,Date.now());
    // No fresh parlay this run: try one from our own pending singles.
    if(!plan.some(p=>p.tier!=='props')){const extra=singlesParlay(boards,existing.results||[],Date.now());if(extra)plan.push(extra)}
    const posted=await writeOfficialPlan(plan,week,env);
    if(!opts.soonOnly&&stats.markets)await setAppSetting(env,'market-coverage',JSON.stringify({at:new Date(now).toISOString(),markets:stats.markets})).catch(()=>{});
    // One row per full run: what the pick job saw and why it did or didn't post
    // (the quick soon-games runs aren't logged, so the engine status stays whole-board).
    if(!opts.soonOnly)await env.DB.batch([
      env.DB.prepare('INSERT INTO pick_runs (at,games,boards,failed_boards,props,best_edge,near,qualified,capped,candidates,posted,credits_left) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').bind(new Date(now).toISOString(),events.length,boards.length,failedBoards,stats.props||0,Number.isFinite(stats.best)?+stats.best.toFixed(2):null,stats.near||0,stats.qualified||0,stats.capped||0,candidates.length,Number(posted)||0,oddsCreditsLeft),
      env.DB.prepare('DELETE FROM pick_runs WHERE at<?').bind(new Date(now-30*86400000).toISOString())
    ]).catch(error=>console.warn('pick_runs_failed',error.message));
    // Push alerts for new picks go out on the in-between cron run (sendDueAlerts).
    // Emails check every run: picks held back by the hourly limit go out on a later run.
    if(!opts.soonOnly)jobStep('publish','alerts');{const emails=sendEmailAlerts(env).catch(error=>console.warn('email_alerts_failed',error.message));if(ctx?.waitUntil)ctx.waitUntil(emails);else await emails}
    {const mine=sendBookAlerts(env,boards).catch(error=>console.warn('book_alerts_failed',error.message));if(ctx?.waitUntil)ctx.waitUntil(mine);else await mine}
    // Odds snapshots older than a week are no longer read; clear them hourly so
    // the database stays small (the history endpoint's own cleanup rarely runs).
    // Awaited: a deferred delete did not run after the maintenance response.
    if(!opts.soonOnly)jobStep('publish','prune');if(Date.now()-snapshotPrunedAt>3600000){snapshotPrunedAt=Date.now();await env.DB.prepare('DELETE FROM movement_snapshots WHERE captured_at<?').bind(Math.floor(Date.now()-7*86400000)).run().catch(error=>console.warn('snapshot_prune_failed',error.message))}
    if(!opts.soonOnly)jobStep('publish','trail');const trail=officialTrailStatements(boards,existing.results||[],env,Date.now());if(trail.length)await env.DB.batch(trail);
    if(!opts.soonOnly)jobStep('publish','line shadow');await recordLineShadow(env,boards,Date.now()).catch(error=>console.warn('line_shadow_failed',error.message));
    if(!opts.soonOnly)jobStep('publish','near shadow');await recordNearShadow(env,boards,plan.filter(p=>p.tier==='props').flatMap(p=>p.legs),Date.now()).catch(error=>console.warn('near_shadow_failed',error.message));
    if(!opts.soonOnly)jobStep('publish','leans');await recordLeans(env,boards,Date.now()).catch(error=>console.warn('lean_shadow_failed',error.message));
    if(!opts.soonOnly)jobStep('publish','bump shadow');await recordBumpShadow(env,boards,injuries,Date.now()).catch(error=>console.warn('bump_shadow_failed',error.message));
    if(!opts.soonOnly)jobStep('publish','td shadow');await recordTdShadow(env,boards,Date.now()).catch(error=>console.warn('td_shadow_failed',error.message));
    if(!opts.soonOnly)jobStep('publish','form wanted');await recordFormWanted(env,boards,Date.now()).catch(error=>console.warn('player_form_failed',error.message));

    // New picks go out right away (X post and phone alerts) instead of on the
    // next in-between cron run, which stays as the backup.
    if(!opts.soonOnly)jobStep('publish','announce');if(Number(posted)>0)await announceNow(env).catch(error=>console.warn('announce_now_failed',error.message));
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
  return `<!doctype html><html lang="en"><head><script data-theme>try{if(localStorage.getItem('btg-theme')==='light')document.documentElement.classList.add('light')}catch(e){}</script><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#0e1013"><title>${weeklyEscape(title)}</title><meta name="description" content="${weeklyEscape(description)}"><link rel="canonical" href="${SITE_URL}${path}"><meta property="og:type" content="website"><meta property="og:title" content="${weeklyEscape(title)}"><meta property="og:description" content="${weeklyEscape(description)}"><meta property="og:url" content="${SITE_URL}${path}"><meta property="og:image" content="${SITE_URL}/og-image-v4.jpg"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image"><link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@600;700&display=swap" rel="stylesheet">
<style>body{margin:0;background:#0e1013;color:#edf1f7;font:15px/1.55 "DM Sans",system-ui,sans-serif}a{color:#6aa8ff}main{max-width:860px;margin:0 auto;padding:20px 16px 48px}header.top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:18px}header.top img{width:auto;height:28px;display:block}h1,h2{font-family:"Space Grotesk",sans-serif;line-height:1.15;color:#fff}h1{font-size:clamp(26px,5vw,38px);margin:6px 0 6px}h2{font-size:20px;margin:28px 0 10px}.eyebrow{margin:0;color:#5ff0b5;font:700 12px "Space Grotesk",sans-serif;letter-spacing:.16em}.lead{color:#b5b9bf;margin:0 0 16px}.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:0 0 18px}@media(max-width:480px){.stats{grid-template-columns:1fr 1fr}}.stat{padding:12px 14px;border-radius:14px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1)}.stat strong{display:block;font:700 22px "Space Grotesk",sans-serif;color:#fff}.stat.up strong{color:#5ff0b5}.stat.down strong{color:#ff9d9d}.stat span{color:#b5b9bf;font-size:12.5px}.cta{display:inline-block;margin:4px 12px 4px 0;padding:11px 20px;border-radius:999px;background:#2563eb;color:#fff;font-weight:700;text-decoration:none}.picks{list-style:none;margin:0;padding:0;display:grid;gap:8px}.pick{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 12px;padding:12px 14px;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09)}.pick strong{color:#fff}.pick .bet{grid-column:1}.pick .meta{grid-column:1/-1;color:#a6aab0;font-size:12.5px}.pick .price{grid-row:1/3;grid-column:2;text-align:right;font:700 16px "Space Grotesk",sans-serif}.res{display:inline-block;margin-left:6px;padding:2px 8px;border-radius:999px;font-weight:700;font-size:11.5px;vertical-align:2px;background:#1e222a;color:#98a1ad}.res.won{background:rgba(34,197,94,.14);color:#22c55e}.res.lost{background:rgba(240,96,96,.14);color:#f06060}.won{color:#5ff0b5}.lost{color:#ff9d9d}.push,.pending{color:#ffd66e}.legs{margin:6px 0 0;padding-left:18px;color:#dce0e6;font-size:13.5px}.weeks{list-style:none;margin:0;padding:0;display:grid;gap:8px}.weeks a{display:flex;justify-content:space-between;gap:12px;padding:14px 16px;border-radius:14px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#fff;text-decoration:none}.weeks small{color:#b5b9bf}.pager{display:flex;justify-content:space-between;gap:12px;margin-top:28px}.pager a,header.top>a:last-child{display:inline-block;padding:10px 0}.site-nav{display:flex;align-items:center;gap:18px}.site-nav a{color:#98a1ad;font:600 14px/1 "DM Sans",sans-serif;text-decoration:none;padding:10px 0}.site-nav a[aria-current=page]{color:#f2f4f7}.site-nav a:hover{color:#f2f4f7}.fine{margin-top:32px;color:#969aa0;font-size:12px}@media (display-mode: standalone){body{padding-top:env(safe-area-inset-top)}}html.light{color-scheme:light}html.light body{background:#f4f6f9;color:#0f172a}html.light a{color:#1d4ed8}html.light h1,html.light h2,html.light .stat strong,html.light .pick strong{color:#0f172a}html.light .eyebrow{color:#047857}html.light .lead,html.light .stat span,html.light .weeks small,html.light .pick .meta,html.light .fine{color:#5b6472}html.light .stat,html.light .pick,html.light .weeks a{background:#fff;border:1px solid #e2e8f0}html.light .stat.up strong,html.light .won{color:#15803d}html.light .stat.down strong,html.light .lost{color:#c62828}html.light .push,html.light .pending{color:#a16207}html.light .res{background:#f1f4f8;color:#475569}html.light .res.won{background:#dcfce7;color:#15803d}html.light .res.lost{background:#fee2e2;color:#c62828}html.light .legs{color:#334155}html.light .cta{background:#2563eb;color:#fff}html.light .site-nav a{color:#5b6472}html.light .site-nav a[aria-current=page],html.light .site-nav a:hover{color:#0f172a}html.light img[src^="/logo.png"]{content:url(/logo-dark.png)}</style></head><body><main><header class="top"><a href="/"><img src="/logo.png" alt="Bet This Guy"></a><nav class="site-nav" aria-label="Main"><a href="/">Picks</a><a href="/trust">Results</a><a href="/about">About</a></nav></header>${body}<p class="fine">Research and entertainment only. Every official pick is locked before kickoff and graded from box scores; past results don’t guarantee future ones. Profit assumes $100 per pick at the posted price. 21+ where legal. If gambling stops being fun, call 1-800-GAMBLER. Questions? <a href="mailto:support@betthisguy.com">support@betthisguy.com</a></p><p class="fine">© 2026 Bet This Guy · <a href="https://x.com/BetThisGuy" target="_blank" rel="noopener">Follow on X</a></p></main></body></html>`;
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
  out.today={mode:'today',ready:upcoming.length>0,recordLabel:recWeek.week?`Week ${recWeek.week} record`:'Last week',recordValue:rs.wins+rs.losses?`${rs.wins}–${rs.losses}${rs.pushes?`–${rs.pushes}`:''} props`:'',recordProfit:rs.wins+rs.losses?rs.profit:null,empty:'No official picks are posted for upcoming games yet. Picks post the moment a price qualifies, any day before kickoff.',eyebrow:`OFFICIAL PICKS · ${when.toUpperCase()}`,rows:upcoming,
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
const USAGE_METRICS=new Set(['view:home','view:trust','view:picks','view:week','visit:new','visit:return','card:open','slip:add','parlay:add','share','hit:open','profile:open','affiliate:click','alerts:on','alerts:off','gate:shown','gate:signup','gate:login','nudge:shown','nudge:alerts','nudge:signup','alerts:email','view:post','post:copy','post:open','post:image','src:reddit','src:x','src:google','src:social','src:other','src:direct']);
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
// only: resend to just these endpoints (a retry), without the 15-minute batching.
async function sendPickAlerts(env,now=Date.now(),only=null){
  if(!env.DB)return {sent:0};
  // One alert per 15 minutes: a batch of picks becomes one notification.
  if(!only){
    const last=Date.parse(await appSetting(env,'last-alert-at')||'');
    if(Number.isFinite(last)&&now-last<15*60000)return {sent:0,throttled:true};
    await setAppSetting(env,'last-alert-at',new Date(now).toISOString());
  }
  let subs=(await env.DB.prepare('SELECT endpoint,failures FROM push_subscriptions LIMIT 2000').all()).results||[];
  if(only)subs=subs.filter(sub=>only.includes(sub.endpoint));
  let sent=0,lastError=null;const failed=[];
  for(let i=0;i<subs.length;i+=20){
    await Promise.all(subs.slice(i,i+20).map(async sub=>{
      try{
        const response=await fetch(sub.endpoint,{method:'POST',headers:{TTL:'21600',Urgency:'normal','Content-Length':'0',Authorization:await vapidAuthorization(env,sub.endpoint,now)},signal:AbortSignal.timeout(10000)});
        if(response.status===404||response.status===410)return env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint=?').bind(sub.endpoint).run();
        if(response.ok){sent++;return sub.failures?env.DB.prepare('UPDATE push_subscriptions SET failures=0 WHERE endpoint=?').bind(sub.endpoint).run():null}
        throw new Error(`${response.status} ${(await response.text().catch(()=>'')).slice(0,80)}`.trim());
      }catch(error){
        failed.push(sub.endpoint);lastError=`${new URL(sub.endpoint).hostname} ${error.message}`;
        return sub.failures>=4?env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint=?').bind(sub.endpoint).run():env.DB.prepare('UPDATE push_subscriptions SET failures=failures+1 WHERE endpoint=?').bind(sub.endpoint).run();
      }
    }));
  }
  // Why the last push failed, for diagnosis (never the endpoint itself).
  if(lastError)await setAppSetting(env,'push-last-error',`${new Date(now).toISOString()} ${lastError}`).catch(()=>{});
  return {sent,total:subs.length,failed};
}
// Push alerts run on the in-between cron run, which has its own request
// allowance: sent from the publish run, which loads every game's board, some
// pushes failed. Each new pick is alerted once (a batch held back by the
// 15-minute limit goes on a later run), and phones whose push failed get one
// retry on the next run.
async function sendDueAlerts(env,now=Date.now()){
  if(!env.DB)return {sent:0};
  const newest=(await env.DB.prepare("SELECT MAX(posted_at) AS at FROM public_recommendations WHERE source='market-verified-v2' AND id LIKE 'official|%' AND game_time>?").bind(new Date(now).toISOString()).all()).results?.[0]?.at||null;
  const done=await appSetting(env,'push-alert-for')||await appSetting(env,'last-alert-at');
  if(newest&&(!done||newest>done)){
    const out=await sendPickAlerts(env,now);
    if(out.throttled)return out;
    await setAppSetting(env,'push-alert-for',newest);
    await setAppSetting(env,'push-retry',JSON.stringify(out.failed||[]));
    return out;
  }
  let retry=[];try{retry=JSON.parse(await appSetting(env,'push-retry')||'[]')}catch{}
  if(!retry.length)return {sent:0};
  await setAppSetting(env,'push-retry','[]');
  return {...await sendPickAlerts(env,now,retry),retry:true};
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
    await env.DB.prepare('INSERT INTO push_subscriptions (endpoint,p256dh,auth,created_at,failures,books_json,follows_json) VALUES (?,?,?,?,0,?,?) ON CONFLICT(endpoint) DO UPDATE SET p256dh=excluded.p256dh,auth=excluded.auth,failures=0,books_json=excluded.books_json,follows_json=excluded.follows_json').bind(endpoint,p256dh,auth,new Date().toISOString(),JSON.stringify(cleanBooks(body?.books)),JSON.stringify(cleanFollows(body?.follows))).run();
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
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${weeklyEscape(opts.subject||emailSubject(picks))}</title></head><body style="margin:0;padding:0;background:#eef3f9;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eef3f9;"><tr><td align="center" style="padding:28px 12px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;"><tr><td align="center" style="background:#0e1013;border-radius:18px 18px 0 0;padding:24px;"><a href="${SITE_URL}" style="text-decoration:none;"><img src="${SITE_URL}/logo.png" width="220" alt="Bet This Guy" style="display:block;width:200px;max-width:70%;height:auto;border:0;color:#ffffff;font-family:Arial,sans-serif;font-size:22px;font-weight:700;"></a></td></tr><tr><td style="background:#ffffff;border-radius:0 0 18px 18px;padding:28px 24px;font-family:${font};color:#10213d;"><p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:.14em;color:#08875e;">${weeklyEscape(opts.eyebrow||'PICK ALERT')}</p><h1 style="margin:0 0 8px;font-size:24px;line-height:1.25;">${heading}</h1><p style="margin:0 0 20px;font-size:15px;line-height:1.5;color:#40597a;">${weeklyEscape(opts.lede||'Locked before kickoff and graded in public on our results page.')}</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${opts.rowsHtml??picks.map(emailPickRow).join('')}</table><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:14px 0 0;"><tr><td style="border-radius:999px;background:#1fd88f;"><a href="${weeklyEscape(opts.ctaUrl||SITE_URL+'/')}" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:700;color:#04121f;text-decoration:none;border-radius:999px;">${weeklyEscape(opts.ctaLabel||'See the picks')}</a></td></tr></table><p style="margin:18px 0 0;font-size:13px;line-height:1.5;color:#5a6f8c;">Odds move. Check the price at your sportsbook before you bet.</p></td></tr><tr><td align="center" style="padding:20px 16px 0;font-family:${font};font-size:12px;line-height:1.6;color:#7f96b8;">You’re getting this because you turned on email alerts for your Bet This Guy account. Questions? Just reply.<br><a href="${weeklyEscape(unsubscribeUrl)}" style="color:#7f96b8;">Unsubscribe</a> · 21+ where legal. Gambling problem? Call 1-800-GAMBLER.${postal?`<br>${weeklyEscape(postal)}`:''}</td></tr></table></td></tr></table></body></html>`;
}
function emailAlertText(picks,unsubscribeUrl,postal,opts={}){
  return `${opts.heading||(picks.length===1?'A new official pick just posted':`${picks.length} new official picks just posted`)}:${opts.lede?`\n${opts.lede}`:''}\n\n${picks.map(r=>`- ${emailPickText(r)} · ${weeklyDay(r.game_time)}`).join('\n')}\n\nSee the picks: ${SITE_URL}/\n\nOdds move. Check the price at your sportsbook before you bet.\n\nUnsubscribe: ${unsubscribeUrl}\n21+ where legal. Gambling problem? Call 1-800-GAMBLER.${postal?`\n${postal}`:''}\n`;
}
// "Send me a test email" in the account panel: one email to the signed-in
// person's own address, at most once an hour, so email can be checked without
// waiting for a pick. The reply says exactly what went wrong, and the last
// result (never the address) is kept in app_settings for diagnosis.
async function sendTestEmail(env,user,profile,now=Date.now()){
  const stamp=new Date(now).toISOString(),note=text=>setAppSetting(env,'email-test-last',`${stamp} ${text}`).catch(()=>{});
  if(!env.RESEND_API_KEY){await note('no RESEND_API_KEY');return {status:503,body:{success:false,error:'Email isn’t connected yet: the site has no RESEND_API_KEY.'}}}
  const to=String(profile?.email||user?.email||'').trim();
  if(!to)return {status:400,body:{success:false,error:'Your account has no email address.'}};
  const key=`test-email:${user.id}`,last=Date.parse(await appSetting(env,key)||'');
  if(Number.isFinite(last)&&now-last<3600000)return {status:429,body:{success:false,error:`You can send another test in ${Math.ceil((3600000-(now-last))/60000)} minutes.`}};
  await setAppSetting(env,key,stamp);
  const token=(await env.DB.prepare('SELECT token FROM email_alerts WHERE auth_user_id=?').bind(user.id).all()).results?.[0]?.token;
  const unsubscribe=token?`${SITE_URL}/api/email-alerts/unsubscribe?token=${token}`:`${SITE_URL}/`,postal=String(env.EMAIL_POSTAL_ADDRESS||'').trim();
  const opts={subject:'✅ Bet This Guy email test',heading:'Your pick emails are working',eyebrow:'TEST EMAIL',lede:'This is a test. When an official pick posts, you’ll get an email like this with the pick, the price and the sportsbook.',rowsHtml:'',ctaLabel:'Open the board',ctaUrl:`${SITE_URL}/`};
  let response;
  try{response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:`Bearer ${env.RESEND_API_KEY}`,'content-type':'application/json'},body:JSON.stringify({from:env.EMAIL_FROM||EMAIL_ALERT_FROM,to:[to],reply_to:env.EMAIL_REPLY_TO||'support@betthisguy.com',subject:opts.subject,html:emailAlertHtml([],unsubscribe,postal,opts),text:emailAlertText([],unsubscribe,postal,opts),...(token?{headers:{'List-Unsubscribe':`<${unsubscribe}>`,'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'}}:{})}),signal:AbortSignal.timeout(15000)})}
  catch(error){response={ok:false,status:0,json:async()=>({message:error.message})}}
  if(!response.ok){
    const data=await response.json().catch(()=>({})),why=String(data?.message||data?.name||'no details').slice(0,160);
    // A failed send doesn't use up the hour, so it can be retried after a fix.
    await env.DB.prepare('DELETE FROM app_settings WHERE key=?').bind(key).run().catch(()=>{});
    await note(`failed ${response.status}: ${why}`);
    return {status:502,body:{success:false,error:`The email provider refused it (${response.status}): ${why}`}};
  }
  await note('sent');
  return {status:200,body:{success:true,sentTo:to}};
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
// Weekly digest: Tuesday mornings (after Monday night is graded), one email
// with last week's official picks and results plus the season record, to
// everyone with email alerts on. A week with no picks sends nothing.
function digestRow(r){
  const legs=recordLegs(r),res=weeklyGraded(r)?r.result:'pending',label={won:'Won',lost:'Lost',push:'Push',pending:'Pending'}[res],color={won:'#08875e',lost:'#c62828',push:'#5a6f8c',pending:'#5a6f8c'}[res];
  const d=weeklyDecimal(r.kind==='parlay'?r.combined_odds:r.odds),net=res==='won'&&d?100*(d-1):res==='lost'?-100:0;
  const title=r.kind==='parlay'?`${legs.length}-leg parlay (${weeklyOdds(r.combined_odds)})`:`${r.player} · ${weeklyLegText(r)} (${weeklyOdds(r.odds)})`;
  const sub=r.kind==='parlay'?legs.map(l=>`${l.player} ${weeklyLegText(l)}`).join(' + '):(legs[0]?.actualValue!=null?`Had ${legs[0].actualValue}`:'');
  return `<tr><td style="padding:10px 0;border-bottom:1px solid #e3ebf5;"><div style="font-size:15px;font-weight:700;color:#10213d;">${weeklyEscape(title)}</div>${sub?`<div style="margin-top:2px;font-size:13px;color:#5a6f8c;">${weeklyEscape(sub)}</div>`:''}</td><td align="right" style="padding:10px 0 10px 12px;border-bottom:1px solid #e3ebf5;white-space:nowrap;vertical-align:top;"><div style="font-size:14px;font-weight:700;color:${color};">${label}</div>${res==='won'||res==='lost'?`<div style="font-size:13px;color:${color};">${weeklyMoney(net)}</div>`:''}</td></tr>`;
}
function digestRecord(s){return `${s.wins}–${s.losses}${s.pushes?`–${s.pushes}`:''}`}
async function sendWeeklyDigest(env,now=Date.now()){
  if(!env.DB||!env.RESEND_API_KEY)return {sent:0,disabled:true};
  const day=new Date(now);if(day.getUTCDay()!==2||day.getUTCHours()<15)return {sent:0,due:false};
  const week=new Date(Date.parse(`${officialWeek(now)}T00:00:00Z`)-7*86400000).toISOString().slice(0,10);
  const last=await appSetting(env,'weekly-digest');if(last===week)return {sent:0,done:true};
  // Claim the week first so two Worker instances can't both send it.
  const claim=last==null?await env.DB.prepare('INSERT OR IGNORE INTO app_settings (key,value) VALUES (?,?)').bind('weekly-digest',week).run():await env.DB.prepare('UPDATE app_settings SET value=? WHERE key=? AND value=?').bind(week,'weekly-digest',last).run();
  if(!Number(claim?.meta?.changes??claim?.changes))return {sent:0,claimed:false};
  const rows=await weeklyRows(env,week);if(!rows.length)return {sent:0,empty:true};
  const all=(await env.DB.prepare("SELECT kind,odds,combined_odds,status,result,closing_line,closing_odds,closing_captured_at,line FROM public_recommendations WHERE source='market-verified-v2' AND id LIKE 'official|%' AND id<?").bind(`official|${week}|\uffff`).all()).results||[];
  const s=weeklySummary(rows),season=weeklySummary(all),info=nflWeekOf(week),name=info?`Week ${info.week}`:'Last week';
  const headline=s.wins+s.losses+s.pushes?`${name}: ${digestRecord(s)} on props, ${weeklyMoney(s.profit)}`:`${name} results`;
  const parlays=s.parlayWins+s.parlayLosses?` Parlays ${s.parlayWins}–${s.parlayLosses} (${weeklyMoney(s.parlayProfit)}).`:'';
  const lede=`Betting \u0024100 a pick.${parlays} Season: ${digestRecord(season)} on props, ${weeklyMoney(season.profit)}. This week's picks post the moment a price qualifies, any day before kickoff, and we'll email you when they do.`;
  const subject=`📊 ${headline}`,page=info?`${SITE_URL}/picks/${info.season}/week-${info.week}`:`${SITE_URL}/trust`;
  const people=(await env.DB.prepare('SELECT a.token,p.email FROM email_alerts a JOIN user_profiles p ON p.auth_user_id=a.auth_user_id WHERE a.enabled=1 ORDER BY a.created_at LIMIT 2000').all()).results||[];
  const from=env.EMAIL_FROM||EMAIL_ALERT_FROM,postal=String(env.EMAIL_POSTAL_ADDRESS||'').trim(),opts={subject,heading:weeklyEscape(headline),eyebrow:'WEEKLY RESULTS',lede,rowsHtml:rows.map(digestRow).join(''),ctaLabel:`See ${name}`,ctaUrl:page};
  const text=unsubscribe=>`${headline}\n${lede}\n\n${rows.map(r=>`- ${emailPickText(r)}: ${weeklyGraded(r)?r.result:'pending'}`).join('\n')}\n\nEvery pick: ${page}\n\nUnsubscribe: ${unsubscribe}\n21+ where legal. Gambling problem? Call 1-800-GAMBLER.${postal?`\n${postal}`:''}\n`;
  let sent=0;
  for(let i=0;i<people.length;i+=100){
    const batch=people.slice(i,i+100).map(person=>{
      const unsubscribe=`${SITE_URL}/api/email-alerts/unsubscribe?token=${person.token}`;
      return {from,to:[person.email],reply_to:env.EMAIL_REPLY_TO||'support@betthisguy.com',subject,html:emailAlertHtml(rows,unsubscribe,postal,opts),text:text(unsubscribe),headers:{'List-Unsubscribe':`<${unsubscribe}>`,'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'}};
    });
    try{
      const response=await fetch('https://api.resend.com/emails/batch',{method:'POST',headers:{authorization:`Bearer ${env.RESEND_API_KEY}`,'content-type':'application/json'},body:JSON.stringify(batch),signal:AbortSignal.timeout(15000)});
      if(response.ok)sent+=batch.length;else console.warn('weekly_digest_failed',response.status);
    }catch(error){console.warn('weekly_digest_failed',error.message)}
  }
  return {sent,total:people.length,picks:rows.length,week};
}
// X (Twitter) auto-posts: each new official pick is posted to the brand
// account the moment it locks, plus a weekly results post on Tuesdays.
// Needs the X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN and X_ACCESS_SECRET
// secrets (an X developer app with read and write access); without them
// nothing is posted. Each pick is claimed in app_settings so it posts once.
const xEnc=v=>encodeURIComponent(String(v)).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
async function xOAuthHeader(env,method,url,extra={},nonce=crypto.randomUUID().replace(/-/g,''),timestamp=Math.floor(Date.now()/1000)){
  const oauth={oauth_consumer_key:env.X_API_KEY,oauth_nonce:nonce,oauth_signature_method:'HMAC-SHA1',oauth_timestamp:String(timestamp),oauth_token:env.X_ACCESS_TOKEN,oauth_version:'1.0'};
  const all={...extra,...oauth},params=Object.keys(all).sort().map(k=>`${xEnc(k)}=${xEnc(all[k])}`).join('&');
  const base=`${method.toUpperCase()}&${xEnc(url)}&${xEnc(params)}`;
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(`${xEnc(env.X_API_SECRET)}&${xEnc(env.X_ACCESS_SECRET)}`),{name:'HMAC',hash:'SHA-1'},false,['sign']);
  const sig=btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(base)))));
  return 'OAuth '+Object.entries({...oauth,oauth_signature:sig}).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${xEnc(k)}="${xEnc(v)}"`).join(', ');
}
const xReady=env=>Boolean(env.X_API_KEY&&env.X_API_SECRET&&env.X_ACCESS_TOKEN&&env.X_ACCESS_SECRET);
async function xPost(env,text,mediaId=null,replyTo=null){
  const url='https://api.twitter.com/2/tweets',body={text};
  if(mediaId)body.media={media_ids:[mediaId]};
  if(replyTo)body.reply={in_reply_to_tweet_id:String(replyTo)};
  const response=await fetch(url,{method:'POST',headers:{authorization:await xOAuthHeader(env,'POST',url),'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
  if(!response.ok){const data=await response.json().catch(()=>({}));const why=String(data?.detail||data?.title||data?.errors?.[0]?.message||'').slice(0,200);throw new Error(`X post failed (${response.status})${why?`: ${why}`:''}`)}
  return response.json().catch(()=>({}));
}
const xShort=text=>{const t=String(text||'');return t.length>280?t.slice(0,277)+'…':t};
function xPickText(r,season){
  const legs=recordLegs(r),first=legs[0]||{},when=weeklyDay(r.game_time||first.gameTime),matchup=String(first.team||'').replace(' · ',' ');
  const edge=Number(first.edge),value=Number.isFinite(edge)&&edge>0?`\n${edge.toFixed(1)}% better than the fair price.`:'';
  const record=season&&season.wins+season.losses>=5?`\nSeason: ${season.wins}–${season.losses}, ${weeklyMoney(season.profit)} at $100 a pick.`:'';
  const head=r.kind==='parlay'?`🔒 Official ${legs.length}-leg parlay (${weeklyOdds(r.combined_odds)})\n${legs.map(l=>`• ${l.player} ${weeklyLegText(l)}`).join('\n')}`:`🔒 Official pick: ${r.player} ${weeklyLegText(r)} (${weeklyOdds(r.odds)}${first.book?`, ${first.book}`:''})\n${matchup}${matchup&&when?' · ':''}${when}`;
  // No link in the text: X charges far more for posts with a URL, so the link lives in the bio.
  return xShort(`${head}${value}${record}\n\nLocked before kickoff, graded in public. Full record: link in bio.\n21+ · Odds move.`);
}
// Short text that goes above the pick graphic (no link: link posts cost more).
function xCardText(r){
  const legs=recordLegs(r),first=legs[0]||{},when=weeklyDay(r.game_time||first.gameTime),matchup=xMatchup(first.team);
  const head=r.kind==='parlay'?`🔒 Official ${legs.length}-leg parlay (${weeklyOdds(r.combined_odds)})`:`🔒 Official pick: ${r.player} ${weeklyLegText(r)} (${weeklyOdds(r.odds)}${first.book?`, ${first.book}`:''})\n${[matchup,when].filter(Boolean).join(' · ')}`;
  return xShort(`${head}\n\nToday’s full board: link in bio · 21+`);
}
// X post claims read "pending <time>" while a post is in flight and the post
// time once it's confirmed. A run cut off mid-post (Tez Johnson's result,
// Oct 8) used to leave its claim forever, so that post never went out; now a
// pending claim older than 30 minutes is retried.
const X_STALE=30*60000;
async function xClaimable(env,key,now){const cur=await appSetting(env,key);return !cur||(String(cur).startsWith('pending ')&&!(now-Date.parse(String(cur).slice(8))<X_STALE))}
async function xClaim(env,key,now){
  const cur=await appSetting(env,key);
  if(cur){if(!(await xClaimable(env,key,now)))return false;await env.DB.prepare('DELETE FROM app_settings WHERE key=? AND value=?').bind(key,cur).run()}
  const claim=await env.DB.prepare('INSERT OR IGNORE INTO app_settings (key,value) VALUES (?,?)').bind(key,`pending ${new Date(now).toISOString()}`).run();
  return Boolean(Number(claim?.meta?.changes??claim?.changes));
}
const xDone=(env,key,now)=>setAppSetting(env,key,new Date(now).toISOString()).catch(()=>{});
// Each pick's posts form one chain: the newest post in its thread (xtail:<id>,
// else the pick itself) is what the next reply answers, so it reads pick →
// beat the close → result instead of several replies to the pick.
const xThreadTail=async(env,id)=>(await appSetting(env,`xtail:${id}`))||(await appSetting(env,`xid:${id}`));
const xSetTail=(env,id,sent)=>sent?.data?.id?setAppSetting(env,`xtail:${id}`,String(sent.data.id)).catch(()=>{}):null;
// Each new official pick is posted once with its graphic. If the graphic
// can't be made or uploaded three runs in a row, the text version posts
// instead (unless that text was already posted), so a pick is never lost.
async function postPicksToX(env,now=Date.now()){
  if(!env.DB||!xReady(env))return {posted:0,disabled:true};
  const since=new Date(now-24*3600000).toISOString(),start=new Date(now).toISOString();
  const picks=(await env.DB.prepare("SELECT id,kind,sport,player,market,side,line,odds,combined_odds,legs_json,game_time FROM public_recommendations WHERE source='market-verified-v2' AND id LIKE 'official|%' AND posted_at>? AND game_time>? ORDER BY posted_at LIMIT 6").bind(since,start).all()).results||[];
  if(!picks.length)return {posted:0};
  const seasonRows=(await env.DB.prepare("SELECT kind,line,odds,combined_odds,status,result,closing_line,closing_odds,closing_captured_at FROM public_recommendations WHERE source='market-verified-v2' AND id LIKE 'official|%'").all()).results||[];
  const season=weeklySummary(seasonRows);let posted=0,attempts=0;
  for(const r of picks){
    if(!(await xClaimable(env,`xi:${r.id}`,now)))continue;
    // At most two picks per run: each uses about a dozen requests.
    if(++attempts>2)break;
    // Count attempts before the heavy work, so a crash mid-render still counts.
    const tries=Number(await appSetting(env,`xtry:${r.id}`)||0)+1;await setAppSetting(env,`xtry:${r.id}`,String(tries));
    // Claim first so two Worker instances can't post the same pick twice.
    if(!(await xClaim(env,`xi:${r.id}`,now)))continue;
    let mediaId=null,imageError=null;
    if(tries<=3)try{
      if(typeof renderCardPng!=='function')throw new Error('graphics unavailable');
      const png=await renderCardPng(xCardSvg(await xCardData(env,r,season)));
      mediaId=await xUploadImage(env,png);
    }catch(error){imageError=error.message}
    try{
      let sent=null;
      if(mediaId)sent=await xPost(env,xCardText(r),mediaId);
      else if(tries<3){throw new Error(imageError||'graphic failed')}
      else if(!(await appSetting(env,`x:${r.id}`)))sent=await xPost(env,xPickText(r,season));
      // The post id lets the closing-line and result posts reply under the pick.
      if(sent?.data?.id)await setAppSetting(env,`xid:${r.id}`,String(sent.data.id)).catch(()=>{});
      await xDone(env,`xi:${r.id}`,now);
      posted++;await setAppSetting(env,'x-last-post',`${start} ${mediaId?'graphic':'text'} ${r.id}`).catch(()=>{});
      if(imageError)await setAppSetting(env,'x-last-error',`${start} graphic: ${imageError}`).catch(()=>{});
    }catch(error){
      console.warn('x_post_failed',error.message);
      await env.DB.prepare('DELETE FROM app_settings WHERE key=?').bind(`xi:${r.id}`).run().catch(()=>{});
      await setAppSetting(env,'x-last-error',`${start} ${error.message}`).catch(()=>{});break;
    }
  }
  return {posted,picks:picks.length};
}
// X pick graphic (design D): headshot over team colors on the left, the
// pick on the right, and a mint call-to-action bar. Pure SVG so it can be
// tested; renderCardPng (index.template.js) turns it into a PNG.
const XCARD_TEAMS={NFL:{ARI:['#97233F','#FFB612'],ATL:['#A71930','#101820'],BAL:['#241773','#9E7C0C'],BUF:['#00338D','#C60C30'],CAR:['#0085CA','#101820'],CHI:['#0B162A','#C83803'],CIN:['#FB4F14','#101820'],CLE:['#311D00','#FF3C00'],DAL:['#003594','#869397'],DEN:['#FB4F14','#002244'],DET:['#0076B6','#B0B7BC'],GB:['#203731','#FFB612'],HOU:['#03202F','#A71930'],IND:['#002C5F','#A2AAAD'],JAX:['#006778','#D7A22A'],JAC:['#006778','#D7A22A'],KC:['#E31837','#FFB81C'],LV:['#101820','#A5ACAF'],LAC:['#0080C6','#FFC20E'],LAR:['#003594','#FFA300'],LA:['#003594','#FFA300'],MIA:['#008E97','#FC4C02'],MIN:['#4F2683','#FFC62F'],NE:['#002244','#C60C30'],NO:['#101820','#D3BC8D'],NYG:['#0B2265','#A71930'],NYJ:['#125740','#101820'],PHI:['#004C54','#A5ACAF'],PIT:['#101820','#FFB612'],SF:['#AA0000','#B3995D'],SEA:['#002244','#69BE28'],TB:['#D50A0A','#34302B'],TEN:['#4B92DB','#0C2340'],WAS:['#5A1414','#FFB612'],WSH:['#5A1414','#FFB612']},
 NBA:{ATL:['#E03A3E','#26282A'],BOS:['#007A33','#BA9653'],BKN:['#101010','#777D84'],CHA:['#1D1160','#00788C'],CHI:['#CE1141','#101010'],CLE:['#860038','#FDBB30'],DAL:['#00538C','#002B5E'],DEN:['#0E2240','#FEC524'],DET:['#C8102E','#1D42BA'],GSW:['#1D428A','#FFC72C'],HOU:['#CE1141','#101010'],IND:['#002D62','#FDBB30'],LAC:['#C8102E','#1D428A'],LAL:['#552583','#FDB927'],MEM:['#5D76A9','#12173F'],MIA:['#98002E','#101010'],MIL:['#00471B','#EEE1C6'],MIN:['#0C2340','#236192'],NOP:['#0C2340','#C8102E'],NYK:['#006BB6','#F58426'],OKC:['#007AC1','#EF3B24'],ORL:['#0077C0','#101010'],PHI:['#006BB6','#ED174C'],PHX:['#1D1160','#E56020'],POR:['#E03A3E','#101010'],SAC:['#5A2D81','#63727A'],SAS:['#101010','#C4CED4'],TOR:['#CE1141','#101010'],UTA:['#002B5C','#F9A01B'],WAS:['#002B5C','#E31837']}};
const XCARD_B='M46 0V116H138V584H46V700H406Q470 700 517.5 678.5Q565 657 591.5 617.5Q618 578 618 523V513Q618 465 600.0 434.5Q582 404 557.5 387.5Q533 371 511 364V346Q533 340 559.0 323.5Q585 307 603.5 276.0Q622 245 622 195V185Q622 127 595.0 85.5Q568 44 520.5 22.0Q473 0 410 0ZM270 120H394Q437 120 463.5 141.0Q490 162 490 201V211Q490 250 464.0 271.0Q438 292 394 292H270ZM270 412H392Q433 412 459.5 433.0Q486 454 486 491V501Q486 539 460.0 559.5Q434 580 392 580H270Z';
// The card fonts have no U+2212 minus sign, so money like −$100 uses a hyphen.
const xEsc=v=>String(v??'').replace(/\u2212/g,'-').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
// Rough text widths (em per character) shrink long names to fit.
const xFit=(text,max,size,em=.6)=>Math.max(26,Math.min(size,Math.floor(max/Math.max(1,String(text).length*em))));
const xNick=team=>String(team||'').trim().split(/\s+/).at(-1)||'';
function xMatchup(team){const [away,home]=String(team||'').split(/\s*·\s*(?:@|vs)\s*/);return away&&home?`${xNick(away)} @ ${xNick(home)}`:''}
function xBase64(bytes){let out='';for(let i=0;i<bytes.length;i+=0x8000)out+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(out)}
function xLogo(x,y,size){return `<g transform="translate(${x} ${y}) scale(${size/64})"><rect width="64" height="64" rx="15" fill="#0b1530" stroke="#ffffff" stroke-opacity=".18" stroke-width="2"/><path transform="translate(13.73 48) scale(0.046 -0.046)" d="${XCARD_B}" fill="#fff"/><circle cx="47" cy="47" r="10" fill="#2ee6a8" stroke="#0b1530" stroke-width="3"/><path d="M42.5 47.2l3 3 6-6.4" stroke="#0b1530" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>`}
function xCardSvg(c){
  const M='#2ee6a8',F={g:'BTG Grotesk',xb:'BTG Inter XB',sb:'BTG Inter SB'},X=526,W=1200-X-56;
  const [c1,c2]=c.parlay?['#1d4ed8','#0b1530']:(c.team&&XCARD_TEAMS[c.sport||'NFL']?.[String(c.team.abbreviation||'').toUpperCase()])||['#1d4ed8','#0b1530'];
  const initials=String(c.title||'').split(/\s+/).map(w=>w[0]||'').join('').slice(0,3).toUpperCase();
  const left=c.parlay
    ?`<text x="235" y="320" text-anchor="middle" font-family="${F.g}" font-size="170" fill="#ffffff" fill-opacity=".92">${c.legs.length}</text><text x="235" y="392" text-anchor="middle" font-family="${F.xb}" font-size="32" letter-spacing="6" fill="#ffffff" fill-opacity=".8">LEG PARLAY</text>`
    :`${c.photo&&c.team?.abbreviation?`<text x="235" y="190" text-anchor="middle" font-family="${F.g}" font-size="170" fill="#ffffff" fill-opacity=".13">${xEsc(c.team.abbreviation)}</text>`:''}${c.photo?`<image href="data:${c.photo.type};base64,${c.photo.b64}" x="-70" y="200" width="610" height="446" preserveAspectRatio="xMidYMax meet"/>`:`<text x="235" y="410" text-anchor="middle" font-family="${F.g}" font-size="170" fill="#ffffff" fill-opacity=".24">${xEsc(c.team?.abbreviation||initials)}</text>`}`;
  const oddsW=[...String(c.odds)].reduce((w,ch)=>w+(/[0-9]/.test(ch)?.56:.5),0)*86;
  const legs=c.parlay?c.legs.slice(0,4):[];
  // On a result card each parlay leg shows HIT or MISS in place of its price.
  const legMark=l=>l.res==='won'?['HIT',M]:l.res==='lost'?['MISS','#f87171']:l.res==='push'?['PUSH','#cbd5e1']:[l.odds,'#9fb0cc'];
  const legsSvg=legs.map((l,i)=>`<text x="${X}" y="${226+i*46}" font-family="${F.sb}" font-size="${xFit(l.text,W-110,27,.55)}" fill="#cfe0f5">${xEsc(l.text)}</text><text x="${1200-56}" y="${226+i*46}" text-anchor="end" font-family="${F.xb}" font-size="25" fill="${legMark(l)[1]}">${xEsc(legMark(l)[0])}</text>`).join('');
  const pill=c.pill||{label:'OFFICIAL PICK',fill:M,ink:'#06231a',icon:'lock'},pillW=pill.label==='OFFICIAL PICK'?262:Math.round(70+pill.label.length*15.6);
  const icon={lock:`<rect x="1" y="9" width="16" height="13" rx="2.5" fill="${pill.ink}"/><path d="M4.5 9V6a4.5 4.5 0 0 1 9 0v3" fill="none" stroke="${pill.ink}" stroke-width="2.6"/>`,check:`<path d="M2 14l5 5 10-11" fill="none" stroke="${pill.ink}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>`,x:`<path d="M3 7l12 12M15 7 3 19" fill="none" stroke="${pill.ink}" stroke-width="3.4" stroke-linecap="round"/>`,dash:`<path d="M3 13h12" fill="none" stroke="${pill.ink}" stroke-width="3.4" stroke-linecap="round"/>`}[pill.icon]||'';
  const oddsY=c.parlay?226+legs.length*46+42:330;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675">
<defs><linearGradient id="tm" x1="0" y1="0" x2="0.45" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>
<linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#070d1f" stop-opacity="0"/><stop offset="1" stop-color="#070d1f" stop-opacity=".88"/></linearGradient>
<clipPath id="lp"><rect width="470" height="675"/></clipPath></defs>
<rect width="1200" height="675" fill="#0b1530"/>
<g clip-path="url(#lp)"><rect width="470" height="675" fill="url(#tm)"/>${left}<rect y="510" width="470" height="165" fill="url(#fade)"/>
<text x="28" y="643" font-family="${F.xb}" font-size="21" letter-spacing="2.5" fill="#ffffff" fill-opacity=".88">${xEsc(c.footLeft||'')}</text></g>
<rect x="${X}" y="54" width="${pillW}" height="44" rx="22" fill="${pill.fill}"/>
<g transform="translate(${X+20} 64)">${icon}</g>
<text x="${X+48}" y="84" font-family="${F.xb}" font-size="20" letter-spacing="2.6" fill="${pill.ink}">${xEsc(pill.label)}</text>
<text x="${X}" y="${c.parlay?168:168}" font-family="${F.g}" font-size="${xFit(c.title,W,c.parlay?62:72,.6)}" fill="#ffffff">${xEsc(c.title)}</text>
${c.parlay?legsSvg:`<text x="${X}" y="228" font-family="${F.g}" font-size="${xFit(c.bet,W,42,.58)}" fill="#cfe0f5">${xEsc(c.bet)}</text>
<text x="${X}" y="270" font-family="${F.sb}" font-size="24" fill="#9fb0cc">${xEsc(c.when||'')}</text>`}
<text x="${X-4}" y="${oddsY+30}" font-family="${F.g}" font-size="86" fill="${c.oddsColor||M}">${xEsc(c.odds)}</text>
<text x="${Math.round(X+oddsW+16)}" y="${oddsY+18}" font-family="${F.sb}" font-size="25" fill="#9fb0cc">${xEsc(c.oddsNote||'')}</text>
${c.season?`<text x="${X}" y="545" font-family="${F.sb}" font-size="23" fill="#9fb0cc">Season <tspan font-family="${F.xb}" fill="#ffffff">${xEsc(c.season)}</tspan></text>`:''}
${xLogo(1200-56-228,512,46)}<text x="${1200-56}" y="545" text-anchor="end" font-family="${F.g}" font-size="27" fill="#ffffff">Bet This Guy</text>
<rect x="470" y="589" width="730" height="86" fill="${M}"/>
<text x="${X}" y="643" font-family="${F.g}" font-size="29" fill="#06231a">${xEsc(c.cta||'Today’s full board, free')}</text>
<text x="${1200-56-38}" y="644" text-anchor="end" font-family="${F.g}" font-size="31" fill="#06231a">betthisguy.com</text><path d="M1118 633h24m-9-9 9 9-9 9" fill="none" stroke="#06231a" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
}
// Everything the graphic needs for one official pick.
async function xCardData(env,r,season){
  const legs=recordLegs(r),first=legs[0]||{},sport=r.sport_label||r.sport||'NFL',time=r.game_time||first.gameTime,when=weeklyDay(time);
  const edge=Number(first.edge),seasonText=season&&season.wins+season.losses>=5?`${season.wins}–${season.losses} · ${weeklyMoney(season.profit)}`:'';
  const shortWhen=when.replace(/^(\w+), \w+ \d+, /,'$1 ').toUpperCase();
  if(r.kind==='parlay')return {sport,parlay:true,title:`${legs.length}-leg parlay`,legs:legs.map(l=>({text:`${l.player} · ${weeklyLegText(l)}`,odds:weeklyOdds(l.odds)})),odds:weeklyOdds(r.combined_odds),oddsNote:`\u0024100 pays \u0024${Math.round(100*(weeklyDecimal(r.combined_odds)||1)).toLocaleString('en-US')}`,season:seasonText,footLeft:shortWhen};
  const [team,shot]=await Promise.all([typeof playerTeamOf==='function'?playerTeamOf(env,sport,r.player,first.team):null,typeof playerHeadshot==='function'?playerHeadshot(r.player,sport):null]);
  return {sport,team,photo:shot?{type:shot.type,b64:xBase64(shot.bytes)}:null,title:r.player,bet:weeklyLegText(r).replace(/^./,ch=>ch.toUpperCase()),when:[xMatchup(first.team),when].filter(Boolean).join(' · '),odds:weeklyOdds(r.odds),oddsNote:[first.book?`at ${first.book}`:'',Number.isFinite(edge)&&edge>0?`+${edge.toFixed(1)}% vs fair`:''].filter(Boolean).join(' · '),season:seasonText,footLeft:[team?.full?xNick(team.full).toUpperCase():'',shortWhen].filter(Boolean).join(' · ')};
}
// Upload a PNG to X and return its media id. Tries the v2 upload as a
// multipart form, then as JSON, then the older v1.1 upload.
async function xUploadImage(env,png){
  const tries=[];
  const attempt=async(url,body,headers={})=>{
    const response=await fetch(url,{method:'POST',headers:{authorization:await xOAuthHeader(env,'POST',url),...headers},body,signal:AbortSignal.timeout(20000)});
    const data=await response.json().catch(()=>({}));
    const id=data?.data?.id||data?.data?.media_id_string||data?.media_id_string||data?.id;
    if(response.ok&&id)return String(id);
    tries.push(`${new URL(url).pathname} ${response.status} ${String(data?.detail||data?.title||data?.errors?.[0]?.message||'').slice(0,80)}`);return null;
  };
  const form=(extra=true)=>{const f=new FormData();f.append('media',new Blob([png],{type:'image/png'}),'pick.png');if(extra){f.append('media_category','tweet_image');f.append('media_type','image/png')}return f};
  const id=await attempt('https://api.x.com/2/media/upload',form())
    ||await attempt('https://api.x.com/2/media/upload',JSON.stringify({media:xBase64(png),media_category:'tweet_image',media_type:'image/png'}),{'content-type':'application/json'})
    ||await attempt('https://upload.twitter.com/1.1/media/upload.json',form(false));
  if(!id)throw new Error(`X image upload failed: ${tries.join(' | ')}`);
  return id;
}
// What the X integration last did: keys present, last post, last error.
// Never calls X itself (X API calls cost credits).
async function xStatus(env){
  if(!xReady(env))return {configured:false};
  return {configured:true,lastPost:await appSetting(env,'x-last-post').catch(()=>null),lastError:await appSetting(env,'x-last-error').catch(()=>null)};
}
// Tuesday results post, alongside the weekly email.
async function postWeeklyToX(env,now=Date.now()){
  if(!env.DB||!xReady(env))return {posted:0,disabled:true};
  const day=new Date(now);if(day.getUTCDay()!==2||day.getUTCHours()<15)return {posted:0,due:false};
  const week=new Date(Date.parse(`${officialWeek(now)}T00:00:00Z`)-7*86400000).toISOString().slice(0,10);
  if(!(await xClaim(env,`x-week:${week}`,now)))return {posted:0,done:true};
  const rows=await weeklyRows(env,week);if(!rows.length)return {posted:0,empty:true};
  const s=weeklySummary(rows),info=nflWeekOf(week),name=info?`Week ${info.week}`:'Last week';
  const all=(await env.DB.prepare("SELECT kind,line,odds,combined_odds,status,result,closing_line,closing_odds,closing_captured_at FROM public_recommendations WHERE source='market-verified-v2' AND id LIKE 'official|%' AND id<?").bind(`official|${week}|￿`).all()).results||[];
  const season=weeklySummary(all),hits=rows.filter(r=>r.kind==='prop'&&r.result==='won').slice(0,3).map(r=>`✅ ${r.player} ${weeklyLegText(r)} (${weeklyOdds(r.odds)})`);
  const text=xShort(`📊 ${name} results: ${s.wins}–${s.losses}${s.pushes?`–${s.pushes}`:''} on props, ${weeklyMoney(s.profit)} at $100 a pick.${s.parlayWins+s.parlayLosses?` Parlays ${s.parlayWins}–${s.parlayLosses}.`:''}\n${hits.join('\n')}${hits.length?'\n':''}Season: ${season.wins}–${season.losses}, ${weeklyMoney(season.profit)}.\n\nEvery pick, wins and losses: link in bio.`);
  let mediaId=null;
  try{if(typeof renderCardPng==='function')mediaId=await xUploadImage(env,await renderCardPng(xWeekSvg(xWeekData(rows,s,season,name,weeklyRange(week)))))}
  catch(error){await setAppSetting(env,'x-last-error',`${new Date(now).toISOString()} weekly graphic: ${error.message}`).catch(()=>{})}
  try{await xPost(env,text,mediaId);await xDone(env,`x-week:${week}`,now);await setAppSetting(env,'x-last-post',`${new Date(now).toISOString()} weekly ${week}`).catch(()=>{});return {posted:1,week,graphic:Boolean(mediaId)}}
  catch(error){console.warn('x_weekly_failed',error.message);await env.DB.prepare('DELETE FROM app_settings WHERE key=?').bind(`x-week:${week}`).run().catch(()=>{});return {posted:0,error:error.message}}
}
// What the player actually did, for result posts: "had 3 receptions".
function xActual(l){
  const v=Number(l?.actualValue);if(l?.actualValue==null||!Number.isFinite(v))return '';
  if(/touchdown/i.test(l.market||'')&&Number(l.line)===0.5)return v>=1?`scored (${v})`:'no touchdown';
  return `had ${v} ${String(l.market||'').toLowerCase()}`;
}
const XRESULT={won:{label:'WINNER',fill:'#2ee6a8',ink:'#06231a',icon:'check',odds:'#2ee6a8',emoji:'✅',word:'Cashed'},lost:{label:'LOSS',fill:'#f87171',ink:'#2a0909',icon:'x',odds:'#f87171',emoji:'❌',word:'Lost'},push:{label:'PUSH',fill:'#cbd5e1',ink:'#0b1530',icon:'dash',odds:'#cbd5e1',emoji:'➖',word:'Push'}};
const xPayout=r=>{const d=weeklyDecimal(r.kind==='parlay'?r.combined_odds:r.odds);return r.result==='won'&&d?100*(d-1):r.result==='lost'?-100:0};
// Text that goes with a graded pick. Losses are posted the same as wins.
function xResultText(r,season){
  const legs=recordLegs(r),look=XRESULT[r.result],record=season&&season.wins+season.losses>=5?`Season: ${season.wins}–${season.losses}, ${weeklyMoney(season.profit)} at $100 a pick.`:'';
  const head=r.kind==='parlay'
    ?`${look.emoji} ${look.word}: ${legs.length}-leg parlay (${weeklyOdds(r.combined_odds)})\n${legs.map(l=>`${l.result==='won'?'✅':l.result==='lost'?'❌':'➖'} ${l.player} ${weeklyLegText(l)}`).join('\n')}`
    :`${look.emoji} ${look.word}: ${r.player} ${weeklyLegText(r)} (${weeklyOdds(r.odds)})${xActual(legs[0])?`\nFinal: ${xActual(legs[0])}.`:''}`;
  const tail=r.result==='lost'?'We post every loss too.':'Every pick graded in public.';
  return xShort(`${head}\n\n${tail}${record?` ${record}`:''}\n21+`);
}
// The pick graphic, restyled as a result.
async function xResultData(env,r,season){
  const c=await xCardData(env,r,season),look=XRESULT[r.result],legs=recordLegs(r),money=xPayout(r);
  const out={...c,pill:look,oddsColor:look.odds,cta:'See every pick graded'};
  if(r.kind==='parlay')out.legs=legs.map((l,i)=>({...c.legs[i],res:l.result}));
  const actual=r.kind==='parlay'?'':xActual(legs[0]).replace(/^./,ch=>ch.toUpperCase());
  out.oddsNote=[actual,r.result==='push'?'stake back':weeklyMoney(money)].filter(Boolean).join(' · ');
  return out;
}
// Result posts: once an official pick we posted is final, post the result
// with its graphic, as a reply under the original pick when we have its id.
async function postResultsToX(env,now=Date.now(),limit=1){
  if(!env.DB||!xReady(env))return {posted:0,disabled:true};
  const since=new Date(now-3*86400000).toISOString();
  const rows=(await env.DB.prepare("SELECT id,kind,sport,player,market,side,line,odds,combined_odds,legs_json,game_time,status,result FROM public_recommendations WHERE source='market-verified-v2' AND id LIKE 'official|%' AND status='final' AND result IN ('won','lost','push') AND settled_at>? ORDER BY settled_at LIMIT 8").bind(since).all()).results||[];
  let posted=0,season=null;
  for(const r of rows){
    if(posted>=limit)break;
    // Only picks that went out on X get a result post.
    if(!(await appSetting(env,`xi:${r.id}`))||!(await xClaim(env,`xr:${r.id}`,now)))continue;
    // Count tries before the heavy work: after three cut-off tries the result posts as text.
    const tries=Number(await appSetting(env,`xrtry:${r.id}`)||0)+1;await setAppSetting(env,`xrtry:${r.id}`,String(tries));
    if(!season)season=weeklySummary((await env.DB.prepare("SELECT kind,line,odds,combined_odds,status,result,closing_line,closing_odds,closing_captured_at FROM public_recommendations WHERE source='market-verified-v2' AND id LIKE 'official|%'").all()).results||[]);
    let mediaId=null;
    try{if(tries<=3&&typeof renderCardPng==='function')mediaId=await xUploadImage(env,await renderCardPng(xCardSvg(await xResultData(env,r,season))))}
    catch(error){await setAppSetting(env,'x-last-error',`${new Date(now).toISOString()} result graphic: ${error.message}`).catch(()=>{})}
    try{
      const sent=await xPost(env,xResultText(r,season),mediaId,await xThreadTail(env,r.id));
      await xDone(env,`xr:${r.id}`,now);await xSetTail(env,r.id,sent);
      posted++;await setAppSetting(env,'x-last-post',`${new Date(now).toISOString()} result ${mediaId?'graphic':'text'} ${sent?.data?.id||''} ${r.id}`).catch(()=>{});
    }catch(error){
      console.warn('x_result_failed',error.message);
      await env.DB.prepare('DELETE FROM app_settings WHERE key=?').bind(`xr:${r.id}`).run().catch(()=>{});
      await setAppSetting(env,'x-last-error',`${new Date(now).toISOString()} ${error.message}`).catch(()=>{});break;
    }
  }
  return {posted};
}
// Did the market move our way by kickoff? Same line at a worse price, or a
// line that moved past ours. Small wiggles (under 1% of payout) don't count.
function xBeatClose(r){
  if(r.kind!=='prop'||!r.closing_captured_at||r.closing_odds==null)return null;
  const line=Number(r.line),close=r.closing_line==null?line:Number(r.closing_line);
  if(Math.abs(close-line)<=.01){const ours=weeklyDecimal(r.odds),theirs=weeklyDecimal(r.closing_odds);return ours&&theirs&&ours/theirs-1>=.01?{kind:'price',close:weeklyOdds(r.closing_odds)}:null}
  const better=r.side==='Over'?close>line:r.side==='Under'?close<line:false;
  return better?{kind:'line',close:String(close)}:null;
}
function xCloseText(r,move){
  // "on Thursday", or "earlier today" when it locked on game day (Eastern).
  const et=t=>new Date(t).toLocaleDateString('en-US',{weekday:'long',month:'numeric',day:'numeric',timeZone:'America/New_York'});
  const day=new Date(r.posted_at).toLocaleDateString('en-US',{weekday:'long',timeZone:'America/New_York'});
  const when=day==='Invalid Date'?'':et(r.posted_at)===et(r.game_time)?' earlier today':` on ${day}`;
  const locked=`We locked ${r.player} ${weeklyLegText(r)} at ${weeklyOdds(r.odds)}${when}.`;
  const now=move.kind==='price'?`By kickoff the same bet was ${move.close}.`:`By kickoff the line had moved to ${move.close}.`;
  return xShort(`📈 We beat the closing line.\n${locked}\n${now}\n\nWin or lose, that's how you know the price was good. Result after the game.`);
}
// Closing-line posts go out around kickoff, under the original pick.
async function postClosingToX(env,now=Date.now(),limit=2){
  if(!env.DB||!xReady(env))return {posted:0,disabled:true};
  const rows=(await env.DB.prepare("SELECT id,kind,player,market,side,line,odds,posted_at,game_time,closing_line,closing_odds,closing_captured_at FROM public_recommendations WHERE source='market-verified-v2' AND id LIKE 'official|%' AND kind='prop' AND closing_captured_at IS NOT NULL AND game_time>? AND game_time<? ORDER BY game_time LIMIT 8").bind(new Date(now-3*3600000).toISOString(),new Date(now+3600000).toISOString()).all()).results||[];
  let posted=0;
  for(const r of rows){
    if(posted>=limit)break;
    const move=xBeatClose(r);
    if(!move||!(await appSetting(env,`xi:${r.id}`))||!(await xClaim(env,`xc:${r.id}`,now)))continue;
    try{const sent=await xPost(env,xCloseText(r,move),null,await xThreadTail(env,r.id));await xDone(env,`xc:${r.id}`,now);await xSetTail(env,r.id,sent);posted++;await setAppSetting(env,'x-last-post',`${new Date(now).toISOString()} close ${sent?.data?.id||''} ${r.id}`).catch(()=>{})}
    catch(error){console.warn('x_close_failed',error.message);await env.DB.prepare('DELETE FROM app_settings WHERE key=?').bind(`xc:${r.id}`).run().catch(()=>{});await setAppSetting(env,'x-last-error',`${new Date(now).toISOString()} ${error.message}`).catch(()=>{});break}
  }
  return {posted};
}
// Weekly results graphic: the week's record and money, each pick marked
// won or lost, and the season line.
function xWeekSvg(w){
  const M='#2ee6a8',F={g:'BTG Grotesk',xb:'BTG Inter XB',sb:'BTG Inter SB'},X=526,R=1200-56,W=R-X;
  const up=w.profit>=0,tone=up?M:'#f87171';
  const mark=(res,x,y)=>res==='won'?`<circle cx="${x}" cy="${y}" r="13" fill="${M}"/><path d="M${x-6} ${y}l4 4 8-8.5" fill="none" stroke="#06231a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`:res==='lost'?`<circle cx="${x}" cy="${y}" r="13" fill="#f87171"/><path d="M${x-5} ${y-5}l10 10M${x+5} ${y-5}l-10 10" fill="none" stroke="#2a0909" stroke-width="3" stroke-linecap="round"/>`:`<circle cx="${x}" cy="${y}" r="13" fill="#cbd5e1"/><path d="M${x-5.5} ${y}h11" stroke="#0b1530" stroke-width="3" stroke-linecap="round"/>`;
  const picks=w.picks.slice(0,5),more=w.picks.length-picks.length;
  const rows=picks.map((p,i)=>{const y=308+i*44;return `${mark(p.res,X+13,y-8)}<text x="${X+40}" y="${y}" font-family="${F.sb}" font-size="${xFit(p.text,W-150,25,.53)}" fill="#cfe0f5">${xEsc(p.text)}</text><text x="${R}" y="${y}" text-anchor="end" font-family="${F.xb}" font-size="23" fill="#9fb0cc">${xEsc(p.odds)}</text>`}).join('');
  const recordW=[...w.record].reduce((s,ch)=>s+(/[0-9]/.test(ch)?.6:.62),0)*112;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675">
<defs><linearGradient id="tm" x1="0" y1="0" x2="0.45" y2="1"><stop offset="0" stop-color="#1d4ed8"/><stop offset="1" stop-color="#0b1530"/></linearGradient></defs>
<rect width="1200" height="675" fill="#0b1530"/><rect width="470" height="675" fill="url(#tm)"/>
<text x="56" y="120" font-family="${F.xb}" font-size="22" letter-spacing="4" fill="#ffffff" fill-opacity=".8">WEEKLY RESULTS</text>
<text x="50" y="290" font-family="${F.g}" font-size="${xFit(w.name,380,150,.62)}" fill="#ffffff">${xEsc(w.name)}</text>
<text x="56" y="350" font-family="${F.sb}" font-size="26" fill="#ffffff" fill-opacity=".75">${xEsc(w.range||'')}</text>
${xLogo(56,520,56)}<text x="128" y="558" font-family="${F.g}" font-size="30" fill="#ffffff">Bet This Guy</text>
<text x="56" y="643" font-family="${F.xb}" font-size="20" letter-spacing="2.5" fill="#ffffff" fill-opacity=".85">$100 A PICK · 21+</text>
<text x="${X-4}" y="190" font-family="${F.g}" font-size="112" fill="${tone}">${xEsc(w.record)}</text>
<text x="${Math.round(X+recordW+18)}" y="150" font-family="${F.g}" font-size="40" fill="#ffffff">${xEsc(weeklyMoney(w.profit))}</text>
<text x="${Math.round(X+recordW+18)}" y="186" font-family="${F.sb}" font-size="23" fill="#9fb0cc">${xEsc(w.sub||'on props')}</text>
${rows}${more>0?`<text x="${X+40}" y="${308+picks.length*44}" font-family="${F.sb}" font-size="22" fill="#9fb0cc">+ ${more} more</text>`:''}
${w.season?`<text x="${X}" y="555" font-family="${F.sb}" font-size="24" fill="#9fb0cc">Season <tspan font-family="${F.xb}" fill="#ffffff">${xEsc(w.season)}</tspan></text>`:''}
<rect x="470" y="589" width="730" height="86" fill="${M}"/>
<text x="${X}" y="643" font-family="${F.g}" font-size="29" fill="#06231a">See every pick graded</text>
<text x="${R-38}" y="644" text-anchor="end" font-family="${F.g}" font-size="31" fill="#06231a">betthisguy.com</text><path d="M1118 633h24m-9-9 9 9-9 9" fill="none" stroke="#06231a" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
}
function xWeekData(rows,s,season,name,range){
  const graded=rows.filter(weeklyGraded);
  return {name,range,record:`${s.wins}–${s.losses}${s.pushes?`–${s.pushes}`:''}`,profit:s.profit,sub:s.parlayWins+s.parlayLosses?`props · parlays ${s.parlayWins}–${s.parlayLosses}`:'on props',
    picks:graded.map(r=>r.kind==='parlay'?{res:r.result,text:`${recordLegs(r).length}-leg parlay`,odds:weeklyOdds(r.combined_odds)}:{res:r.result,text:`${r.player} · ${weeklyLegText(r)}`,odds:weeklyOdds(r.odds)}),
    season:season&&season.wins+season.losses>=5?`${season.wins}–${season.losses} · ${weeklyMoney(season.profit)}`:''};
}
// Pinned season summary: one post with a graphic of the whole record, meant
// to be pinned on the profile. It posts once per version; setting the
// app_settings value x-summary-request to a new value posts a fresh one.
function xSummarySvg(d){
  const M='#2ee6a8',F={g:'BTG Grotesk',xb:'BTG Inter XB',sb:'BTG Inter SB'},X=526,R=1200-56;
  const tone=v=>v>=0?M:'#f87171';
  const tile=(x,y,big,label,color)=>`<rect x="${x}" y="${y}" width="290" height="150" rx="18" fill="#16203a" stroke="#ffffff" stroke-opacity=".08"/><text x="${x+24}" y="${y+72}" font-family="${F.g}" font-size="${xFit(big,250,54,.6)}" fill="${color||'#ffffff'}">${xEsc(big)}</text><text x="${x+24}" y="${y+112}" font-family="${F.sb}" font-size="21" fill="#9fb0cc">${xEsc(label)}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675">
<defs><linearGradient id="tm" x1="0" y1="0" x2="0.45" y2="1"><stop offset="0" stop-color="#1d4ed8"/><stop offset="1" stop-color="#0b1530"/></linearGradient></defs>
<rect width="1200" height="675" fill="#0b1530"/><rect width="470" height="675" fill="url(#tm)"/>
<text x="56" y="112" font-family="${F.xb}" font-size="22" letter-spacing="4" fill="#ffffff" fill-opacity=".8">${xEsc(d.title)}</text>
<text x="50" y="250" font-family="${F.g}" font-size="${xFit(d.record,380,128,.62)}" fill="#ffffff">${xEsc(d.record)}</text>
<text x="56" y="306" font-family="${F.g}" font-size="44" fill="${tone(d.profit)}">${xEsc(weeklyMoney(d.profit))}</text>
<text x="56" y="346" font-family="${F.sb}" font-size="24" fill="#ffffff" fill-opacity=".75">on props at $100 a pick</text>
${xLogo(56,520,56)}<text x="128" y="558" font-family="${F.g}" font-size="30" fill="#ffffff">Bet This Guy</text>
<text x="56" y="643" font-family="${F.xb}" font-size="20" letter-spacing="2.5" fill="#ffffff" fill-opacity=".85">${xEsc(d.since)} · 21+</text>
<text x="${X}" y="104" font-family="${F.xb}" font-size="22" letter-spacing="3" fill="#cfe0f5">EVERY PICK, GRADED IN PUBLIC</text>
${tile(X,140,d.parlays,`Parlays · ${weeklyMoney(d.parlayProfit)}`)}
${tile(X+328,140,d.clv,d.clvLabel,M)}
${tile(X,318,weeklyMoney(d.total),'Total at $100 a pick',tone(d.total))}
${tile(X+328,318,String(d.picks),'Picks, all graded')}
<text x="${X}" y="530" font-family="${F.sb}" font-size="21" fill="#9fb0cc">Locked before kickoff at the best price we found.</text>
<text x="${X}" y="558" font-family="${F.sb}" font-size="21" fill="#9fb0cc">Wins and losses, every one on the site.</text>
<rect x="470" y="589" width="730" height="86" fill="${M}"/>
<text x="${X}" y="643" font-family="${F.g}" font-size="29" fill="#06231a">Free picks as they lock</text>
<text x="${R-38}" y="644" text-anchor="end" font-family="${F.g}" font-size="31" fill="#06231a">betthisguy.com</text><path d="M1118 633h24m-9-9 9 9-9 9" fill="none" stroke="#06231a" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
}
function xSummaryData(rows,now=Date.now()){
  const s=weeklySummary(rows),graded=rows.filter(weeklyGraded),first=rows.map(r=>r.posted_at).filter(Boolean).sort()[0];
  const year=new Date(now).getUTCFullYear(),pct=s.tracked?Math.round(100*s.beat/s.tracked):null;
  return {title:`${year} SEASON RECORD`,record:`${s.wins}–${s.losses}${s.pushes?`–${s.pushes}`:''}`,profit:s.profit,parlays:`${s.parlayWins}–${s.parlayLosses}`,parlayProfit:s.parlayProfit,total:s.profit+s.parlayProfit,
    clv:pct==null?'—':`${pct}%`,clvLabel:'Beat the closing price',picks:graded.length,since:first?`SINCE ${new Date(first).toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'America/New_York'}).toUpperCase()}`:'',s,pct};
}
function xSummaryText(d){
  const s=d.s;
  return xShort(`📌 Every pick locked before kickoff and graded in public.\n\n${new Date().getUTCFullYear()}: ${s.wins}–${s.losses} on props (${weeklyMoney(s.profit)}), parlays ${s.parlayWins}–${s.parlayLosses} (${weeklyMoney(s.parlayProfit)}) at $100 a pick.${d.pct!=null?`\nOur price beat the close on ${d.pct}% of picks.`:''}\n\nTurn on 🔔 to get picks the moment they lock. Free board: link in bio. 21+`);
}
async function postSummaryToX(env,now=Date.now()){
  if(!env.DB||!xReady(env))return {posted:0,disabled:true};
  const version=(await appSetting(env,'x-summary-request'))||'v1',key=`x-summary:${version}`;
  if(!(await xClaim(env,key,now)))return {posted:0,done:true};
  const rows=(await env.DB.prepare("SELECT kind,line,odds,combined_odds,status,result,closing_line,closing_odds,closing_captured_at,posted_at FROM public_recommendations WHERE source='market-verified-v2' AND id LIKE 'official|%'").all()).results||[];
  const d=xSummaryData(rows,now);let mediaId=null;
  try{if(typeof renderCardPng==='function')mediaId=await xUploadImage(env,await renderCardPng(xSummarySvg(d)))}
  catch(error){await setAppSetting(env,'x-last-error',`${new Date(now).toISOString()} summary graphic: ${error.message}`).catch(()=>{})}
  try{const sent=await xPost(env,xSummaryText(d),mediaId);await xDone(env,key,now);await setAppSetting(env,'x-last-post',`${new Date(now).toISOString()} summary ${version} ${sent?.data?.id||''}`).catch(()=>{});return {posted:1,graphic:Boolean(mediaId)}}
  catch(error){console.warn('x_summary_failed',error.message);await env.DB.prepare('DELETE FROM app_settings WHERE key=?').bind(key).run().catch(()=>{});await setAppSetting(env,'x-last-error',`${new Date(now).toISOString()} ${error.message}`).catch(()=>{});return {posted:0,error:error.message}}
}
// Everything the X cron run posts, in order, within the run's request limit:
// new picks first, then the Tuesday recap, closing-line posts, then results.
// Runs the X post and push-alert jobs in separate invocations of this Worker
// (the SELF service binding), each with its own request allowance: the pick
// run has already used most of its own loading every game's odds.
async function announceNow(env){
  if(!env.SELF?.fetch||!env.MAINTENANCE_TOKEN)return {skipped:true};
  const call=job=>env.SELF.fetch(new Request(`${SITE_URL}/api/maintenance?job=${job}`,{method:'POST',headers:{authorization:`Bearer ${env.MAINTENANCE_TOKEN}`},signal:AbortSignal.timeout(60000)})).then(r=>r.status);
  const [alerts,xpost]=await Promise.allSettled([call('alerts'),xReady(env)?call('xpost'):Promise.resolve('off')]);
  return {alerts:alerts.value??alerts.reason?.message,xpost:xpost.value??xpost.reason?.message};
}
async function runXPosts(env,now=Date.now()){
  const picks=await postPicksToX(env,now);
  const weekly=await postWeeklyToX(env,now);
  const closing=await postClosingToX(env,now);
  // A result graphic needs about as many requests as a pick, so it waits
  // for a run that didn't already post a pick or the weekly graphic.
  const results=picks.posted||weekly.posted?{posted:0,waiting:true}:await postResultsToX(env,now);
  // The pinned summary waits for a run with nothing else heavy.
  const summary=picks.posted||weekly.posted||results.posted?{posted:0,waiting:true}:await postSummaryToX(env,now);
  return {picks,weekly,closing,results,summary};
}
// "My book" alerts: a good-value price at one of someone's own sportsbooks.
// The fair price always comes from every book (3+ pricing both sides, the same
// bar as official picks); a book qualifies when its own price beats that fair
// price by 1% or more. These are never official picks and never touch the record.
// At most one message an hour and 3 props a day per person, never the same prop twice.
const BOOK_ALERT_DAILY=3,BOOK_ALERT_GAP=60*60000;
const bookKey=value=>{const key=String(value||'').toLowerCase().replace(/[^a-z0-9]/g,'');return key==='espnbet'?'thescorebet':key==='williamhillus'?'caesars':key};
// Followed player names: from a list of names or {name} objects.
function cleanFollows(list){return Array.isArray(list)?[...new Set(list.map(f=>String((f&&typeof f==='object'?f.name:f)||'').trim().slice(0,60)).filter(n=>/^[A-Za-z][A-Za-z .'-]{1,59}$/.test(n)))].slice(0,40):[]}
const followKey=name=>String(name||'').toLowerCase().replace(/[^a-z]/g,'');
function cleanBooks(list){return Array.isArray(list)?[...new Set(list.map(b=>String(b||'').slice(0,40)).filter(b=>/^[A-Za-z0-9 .&'+-]{2,40}$/.test(b)))].slice(0,20):[]}
let LINE_ALERTS_ON=false;
const LINE_ALERT_MIN=2;
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
    // Line value: a book's standard line that beats the usual line (Over
    // 209.5 where most books have 215.5), rated on the fair-price curve.
    // Paused for alerts (LINE_ALERTS_ON): the line-value shadow test was
    // 34-52, -$1,846 at $100 by Oct 9, so it isn't sent to anyone until it
    // proves itself. The shadow test keeps logging and grading.
    if(LINE_ALERTS_ON)for(const g of BTGLine.rate(event,now)){
      const market=recordLabels[g.marketKey];if(!market)continue;
      for(const o of g.offers){
        const gain=BTGLine.lineGain(o.side,o.line,g.main);
        if(o.alt||gain<=0||o.edge<LINE_ALERT_MIN)continue;
        out.push({propKey:`${event.eventID||event.id}|${g.player}|${market}|${o.line}|${o.side}`,player:g.player,market,line:o.line,side:o.side==='over'?'Over':'Under',odds:o.odds,book:o.book,bookKey:bookKey(o.key),bookTitleKey:bookKey(o.book),edge:o.edge,game_time:new Date(kickoff).toISOString(),matchup:`${event.away_team||''} @ ${event.home_team||''}`.trim(),lineNote:`${+gain.toFixed(1)}${g.kind==="normal"?" yds":""} better line than most books`});
      }
    }
  }
  return out;
}
// The props worth telling one person about: best of their own books per prop,
// one prop per player and game, not an official pick, not sent before.
// Followed players count at any of the five big books (or the person's own).
const BIG_BOOK_KEYS=new Set([...OFFICIAL_BOOKS].map(bookKey));
function bookAlertPicks(candidates,books,sentKeys,officialKeys,limit,follows=[]){
  const wanted=new Set(books.map(bookKey)),followed=new Set(follows.map(followKey)),best=new Map();
  for(const c of candidates){
    const mine=wanted.has(c.bookKey)||wanted.has(c.bookTitleKey),fan=followed.has(followKey(c.player))&&(mine||BIG_BOOK_KEYS.has(c.bookKey)||BIG_BOOK_KEYS.has(c.bookTitleKey));
    if(!mine&&!fan)continue;
    const key=c.propKey.toLowerCase();if(sentKeys.has(c.propKey)||officialKeys.has(key))continue;
    const prior=best.get(c.propKey);if(!prior||c.edge>prior.edge)best.set(c.propKey,{...c,followed:fan});
  }
  const seenPlayer=new Set();
  return [...best.values()].sort((a,b)=>b.edge-a.edge).filter(c=>{const k=`${c.propKey.split('|')[0]}|${c.player}`;if(seenPlayer.has(k))return false;seenPlayer.add(k);return true}).slice(0,Math.max(0,limit));
}
const bookAlertRow=c=>({kind:'prop',player:c.player,market:c.market,side:c.side,line:c.line,odds:c.odds,game_time:c.game_time,legs_json:JSON.stringify([{book:c.lineNote?`${c.book} (${c.lineNote})`:c.book}])});
function bookAlertMessage(picks){
  const books=[...new Set(picks.map(c=>c.book))],where=books.length===1?books[0]:picks.some(c=>c.followed)?'top sportsbooks':'your sportsbooks';
  const fans=picks.every(c=>c.followed);
  return {title:fans?(picks.length===1?`${picks[0].player}: good value at ${where}`:'Good value on players you follow'):`Good value at ${where}`,body:picks.map(c=>`${c.player} ${weeklyLegText(c)} (${weeklyOdds(c.odds)}${books.length>1?` at ${c.book}`:''})${c.lineNote?` · ${c.lineNote}`:''}`).join('\n')+'\nNot an official pick.',url:'/',where};
}
async function sendBookAlerts(env,events,now=Date.now()){
  if(!env.DB)return {sent:0};
  const candidates=bookValueCandidates(events,now);if(!candidates.length)return {sent:0,candidates:0};
  const week=officialWeek(now),prefix=`official|${week}|`;
  const official=(await env.DB.prepare("SELECT id,player,market,line,side,game_time FROM public_recommendations WHERE id>=? AND id<? AND kind='prop'").bind(prefix,prefix+'￿').all()).results||[];
  const eventIds=new Map(candidates.map(c=>[`${c.player}|${c.market}|${c.line}|${c.side}|${c.game_time}`.toLowerCase(),c.propKey.toLowerCase()]));
  const officialKeys=new Set(official.map(r=>eventIds.get(`${r.player}|${r.market}|${r.line}|${r.side}|${new Date(r.game_time).toISOString()}`.toLowerCase())).filter(Boolean));
  const recipients=[];
  for(const row of (await env.DB.prepare("SELECT endpoint,books_json,follows_json FROM push_subscriptions WHERE (books_json IS NOT NULL AND books_json<>'[]') OR (follows_json IS NOT NULL AND follows_json<>'[]') LIMIT 2000").all()).results||[]){let books=[],follows=[];try{books=cleanBooks(JSON.parse(row.books_json||'[]'))}catch{}try{follows=cleanFollows(JSON.parse(row.follows_json||'[]'))}catch{}if(books.length||follows.length)recipients.push({id:`push:${row.endpoint}`,push:row,books,follows})}
  if(env.RESEND_API_KEY)for(const row of (await env.DB.prepare('SELECT a.auth_user_id,a.token,p.email,u.preferences_json FROM email_alerts a JOIN user_profiles p ON p.auth_user_id=a.auth_user_id JOIN user_preferences u ON u.auth_user_id=a.auth_user_id WHERE a.enabled=1 LIMIT 2000').all()).results||[]){let books=[],follows=[];try{const prefs=JSON.parse(row.preferences_json||'{}');books=cleanBooks(prefs.books);follows=cleanFollows(prefs.follows?.players)}catch{}if((books.length||follows.length)&&row.email)recipients.push({id:`email:${row.auth_user_id}`,email:row,books,follows})}
  let sent=0;const dayAgo=new Date(now-24*3600000).toISOString();
  for(const r of recipients){
    const history=(await env.DB.prepare('SELECT prop_key,sent_at FROM book_alerts WHERE recipient=? AND sent_at>? ORDER BY sent_at DESC').bind(r.id,new Date(now-7*86400000).toISOString()).all()).results||[];
    if(history[0]&&now-Date.parse(history[0].sent_at)<BOOK_ALERT_GAP)continue;
    const today=history.filter(h=>h.sent_at>dayAgo).length;
    const picks=bookAlertPicks(candidates,r.books,new Set(history.map(h=>h.prop_key)),officialKeys,BOOK_ALERT_DAILY-today,r.follows||[]);
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
        const fans=picks.every(c=>c.followed),opts={subject:fans&&picks.length===1?`${message.title}: ${weeklyLegText(picks[0])}`:`${message.title}: ${picks.length===1?`${picks[0].player} ${weeklyLegText(picks[0])}`:`${picks.length} props`}`,heading:message.title,eyebrow:fans?'PLAYERS YOU FOLLOW':'YOUR SPORTSBOOK',lede:`These prices at ${message.where} beat the market's fair price. They are not official Bet This Guy picks and are not part of our record.`};
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
