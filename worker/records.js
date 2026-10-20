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
const OFFICIAL_CAPS={props:100,reasonable:15,swing:10,moonshot:3};
// At most two official props per game: picks in one game win or lose
// together, so a third goes to the leans list instead.
const OFFICIAL_PER_GAME=2;
// Top picks: an edge this big has no limit (any number in a game, past the
// daily X limit) and posts as ⭐ Top pick. Through Oct 18, 3 of
// 42 graded sportsbook singles had 2+ points. Prediction edges run bigger
// (thinner app prices, staler overnight): 2.5 let 5 through on one night,
// so prediction top picks need 3 (2 of 33 picks so far).
const TOP_PICK={sb:2,pm:3};
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
      if(opts.exactBooks?pairs.length!==opts.exactBooks:pairs.length<3)continue;
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
// Parlays post as soon as their legs qualify, like singles (they come from
// their own next-tier pool, so there's no reason to wait for kickoff).
// Same-game parlays: at most 2 legs from one game, and only unlinked legs:
// players on different teams (any pair), or for
// teammates, unlinked stat types (no passing with receiving, no touchdowns or
// kicking, which all move with scoring). Books price same-game parlays below the multiplied odds and
// our feed has no same-game prices, so they're graded at the multiplied
// price with the payout cut by SGP_CUT (20%).
const SGP_CUT=.2;
// Parlays never take both sides of a prop: once a player's market is used in
// one direction (Over or Under, any line), every later parlay that week must
// use the same direction. Prediction parlays: no game carries more than
// PARLAYS_PER_GAME (one-game nights otherwise fill the weekly caps).
const PARLAYS_PER_GAME=3;
// Shadow tests that ran their course (Oct 14): alt-line value 138-153, live
// in-game 113-134, defensive matchups 40-57, injury bumps and game lines never
// filled, and the NBA shadow gave way to official NBA picks. They log nothing
// new; rows already logged still grade. Tests re-enable them with .clear().
const RETIRED_SHADOWS=new Set(['line','bump','book','live','game','nba']);
// A player rides in at most PARLAYS_PER_PLAYER parlays a week (a night for
// NBA), so one miss can't sink several parlays at once.
const PARLAYS_PER_PLAYER=1;
const sideKey=(game,player,market)=>`${game}|${normalizedName(player)}|${String(market||'').toLowerCase()}`;
// One direction per player per game, across every pick we post: sportsbook
// singles and parlay legs, prediction picks and prediction parlay legs. Bo
// Melton Over 1.5 receptions (sportsbook) and Bo Melton Under receiving yards
// (prediction app) pulled against each other on Oct 18; a player who is an
// Over anywhere in a game is never an Under in it, and the other way round.
const directionKey=(game,player)=>`${game}|${normalizedName(player)}`;
async function pickDirections(env,now=Date.now()){
  const dirs=new Map(),add=(game,player,side)=>{if(game&&player&&side&&!dirs.has(directionKey(game,player)))dirs.set(directionKey(game,player),side)};
  const since=new Date(now-6*3600000).toISOString(),parse=v=>{try{return JSON.parse(v||'[]')}catch{return []}};
  const official=(await env.DB.prepare("SELECT legs_json FROM public_recommendations WHERE source='market-verified-v2' AND result IS NULL AND game_time>?").bind(since).all().catch(()=>({results:[]}))).results||[];
  official.forEach(r=>parse(r.legs_json).forEach(l=>add(l.gameId,l.player,l.side)));
  const picks=(await env.DB.prepare('SELECT event_id,player,side FROM prediction_picks WHERE result IS NULL AND game_time>?').bind(since).all().catch(()=>({results:[]}))).results||[];
  picks.forEach(r=>add(r.event_id,r.player,r.side));
  const parlays=(await env.DB.prepare('SELECT legs_json FROM prediction_parlays WHERE result IS NULL AND game_time>?').bind(since).all().catch(()=>({results:[]}))).results||[];
  parlays.forEach(r=>parse(r.legs_json).forEach(l=>add(l.eventId,l.player,l.side)));
  return dirs;
}
const sameDirection=(dirs,game,player,side)=>{const was=dirs.get(directionKey(game,player));return !was||was===side};
const statFamily=m=>/touchdown|tds\b/i.test(m)?'td':/kick|field goal|extra point/i.test(m)?'kick':/pass|interception/i.test(m)?'passing':/recep/i.test(m)?'receiving':/rush/i.test(m)?'rushing':'other';
// Players on different teams (known from saved form): any pair, touchdown
// props included, as long as each leg qualifies on its own price. Same team or
// team unknown: the strict rule above.
function sgpOk(a,b){const x=statFamily(a.market),y=statFamily(b.market);
  if(a.playerTeam&&b.playerTeam&&normalizedName(a.playerTeam)!==normalizedName(b.playerTeam))return true;
  if(x===y||[x,y].some(f=>f==='td'||f==='kick'||f==='other'))return false;return !(new Set([x,y]).has('passing')&&new Set([x,y]).has('receiving'))}
// Each player's team from saved form, for the same-game rule.
async function playerTeams(env){const rows=(await env.DB.prepare('SELECT player,team FROM player_form WHERE team IS NOT NULL').all().catch(()=>({results:[]}))).results||[];return new Map(rows.map(r=>[normalizedName(r.player),r.team]))}
const withTeams=(list,teams)=>list.map(p=>({...p,playerTeam:teams.get(normalizedName(p.player))||null}));
// Parlay price from its legs: multiplied, then the same-game cut when two legs share a game.
function parlayDecimal(legs){const d=legs.reduce((p,l)=>p*recordDecimal(l.odds),1),same=new Set(legs.map(l=>l.gameId)).size<legs.length;return same?1+(d-1)*(1-SGP_CUT):d}
// Singles are the top tier (1%+ edge). Parlays are built from the next tier
// down (pool: props 0.5% to just under 1%), one leg per game, and never use
// a player who is an official single: a bad single can't also sink a parlay.
// cfg (NBA): its own id prefix, caps and per-game limit; NFL uses the defaults.
function officialPlan(candidates,existing,week,now=Date.now(),pool=candidates,cfg={}){
  const CAPS=cfg.caps||OFFICIAL_CAPS,PER_GAME=cfg.perGame||OFFICIAL_PER_GAME,prefix=cfg.prefix||`official|${week}|`,TOP=cfg.top??TOP_PICK.sb;
  const saved=existing.map(r=>({...r,legs:recordLegs(r)})),counts=Object.fromEntries(Object.keys(CAPS).map(t=>[t,saved.filter(r=>r.id.startsWith(`${prefix}${t}|`)).length]));
  const plan=[],singles=saved.filter(r=>r.kind==='prop'),games=new Map(),used=new Set(singles.flatMap(r=>r.legs.map(officialPlayer)));
  singles.forEach(r=>games.set(r.game_id,(games.get(r.game_id)||0)+1));
  for(const p of candidates){const top=Number(p.edge)>=TOP;if(used.has(p.playerKey)||(counts.props>=CAPS.props&&!top)||((games.get(p.gameId)||0)>=PER_GAME&&!top))continue;plan.push({tier:'props',legs:[p]});counts.props++;used.add(p.playerKey);games.set(p.gameId,(games.get(p.gameId)||0)+1)}
  const prior=saved.filter(r=>r.kind==='parlay').map(r=>r.legs.map(officialPlayer)),exposure=new Map();prior.flat().forEach(k=>exposure.set(k,(exposure.get(k)||0)+1));
  const sides=new Map(),perGame=new Map();
  saved.forEach(r=>r.legs.forEach(l=>sides.set(sideKey(l.gameId,l.player,l.market),l.side)));
  saved.filter(r=>r.kind==='parlay').forEach(r=>new Set(r.legs.map(l=>l.gameId)).forEach(g=>perGame.set(g,(perGame.get(g)||0)+1)));
  // Hardest tiers first: they need the most unshared legs.
  // 2 to 5 legs: 2-3 leg and 3-4 leg tiers carry most parlays; 4-5 legs only when a long price forms.
  const tiers=[['moonshot',4,5,2501,15000],['swing',3,4,1000,2500],['reasonable',2,3,100,999]];
  const legPool=pool.filter(p=>!used.has(p.playerKey));
  if(legPool.length<2)return plan;
  for(const [tier,min,max,low,high] of tiers){
    for(let attempt=0;attempt<500&&counts[tier]<(CAPS[tier]||0);attempt++){
      const size=min+attempt%(max-min+1),legs=[],gameIds=new Map(),markets=new Map();
      const pool=[...legPool].sort((a,b)=>(exposure.get(a.playerKey)||0)-(exposure.get(b.playerKey)||0)||b.edge-a.edge);
      if(!pool.length)break;
      for(let j=0;j<pool.length&&legs.length<size;j++){
        const p=pool[(j+Math.floor(attempt/(max-min+1)))%pool.length];
        // A second leg from the same game only when the two are unlinked; never a third.
        const inGame=legs.filter(l=>l.gameId===p.gameId);
        if((exposure.get(p.playerKey)||0)>=PARLAYS_PER_PLAYER||inGame.length>=2||(inGame.length&&!sgpOk(inGame[0],p))||(markets.get(p.market)||0)>=2)continue;
        const was=sides.get(sideKey(p.gameId,p.player,p.market));if(was&&was!==p.side)continue;
        // Skip a leg that would make this parlay share two players with a posted one.
        if(prior.some(keys=>keys.includes(p.playerKey)&&legs.some(l=>keys.includes(l.playerKey))))continue;
        legs.push(p);gameIds.set(p.gameId,(gameIds.get(p.gameId)||0)+1);markets.set(p.market,(markets.get(p.market)||0)+1);
      }
      if(legs.length!==size)continue;
      const odds=recordAmerican(parlayDecimal(legs)),keys=legs.map(p=>p.playerKey);
      if(odds<low||odds>high||prior.some(p=>p.filter(k=>keys.includes(k)).length>1))continue;
      legs.forEach(l=>sides.set(sideKey(l.gameId,l.player,l.market),l.side));new Set(legs.map(l=>l.gameId)).forEach(g=>perGame.set(g,(perGame.get(g)||0)+1));
      plan.push({tier,legs:legs.map(l=>legs.some(o=>o!==l&&o.gameId===l.gameId)?{...l,sameGame:true}:l)});counts[tier]++;prior.push(keys);keys.forEach(k=>exposure.set(k,(exposure.get(k)||0)+1));
    }
  }
  return plan;
}
async function writeOfficialPlan(plan,week,env,cfg={}){
  const prefix=cfg.prefix||`official|${week}|`,statements=[],CAPS=cfg.caps||OFFICIAL_CAPS,PER_GAME=cfg.perGame||OFFICIAL_PER_GAME,sport=cfg.sport==='NBA'?'NBA':'NFL',TOP=cfg.top??TOP_PICK.sb;
  for(const pick of plan){
    const now=Date.now();if(pick.legs.some(p=>Date.parse(p.gameTime)<=now+5*60000))continue;
    const kind=pick.tier==='props'?'prop':'parlay',legs=pick.legs.map(p=>({...p,officialWeek:week,officialTier:pick.tier})),first=legs[0],top=kind==='prop'&&Number(first.edge)>=TOP,id=prefix+pick.tier+'|'+await boundedRecordId(kind,legs);
    const combined=kind==='parlay'?recordAmerican(parlayDecimal(legs)):null;
    // Every condition is evaluated inside the INSERT, so concurrent visitors
    // cannot exceed caps, repeat a player as a single, or bypass overlap limits.
    statements.push(env.DB.prepare(`INSERT OR IGNORE INTO public_recommendations
      (id,kind,sport,player,market,side,line,odds,combined_odds,game_id,game_time,legs_json,posted_at,status,source,verification_note)
      SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,'pending',?,?
      WHERE (SELECT COUNT(*) FROM public_recommendations WHERE id>=? AND id<?)< ?
      AND (?='parlay' OR ((SELECT COUNT(*) FROM public_recommendations WHERE id>=? AND id<? AND game_id=?)<?
        AND NOT EXISTS(SELECT 1 FROM public_recommendations r,json_each(r.legs_json) l WHERE r.id>=? AND r.id<? AND json_extract(l.value,'$.playerKey')=?)))
      AND (?='prop' OR (NOT EXISTS(SELECT 1 FROM public_recommendations r WHERE r.id>=? AND r.id<? AND r.kind='parlay'
        AND (SELECT COUNT(*) FROM json_each(r.legs_json) l WHERE json_extract(l.value,'$.playerKey') IN (SELECT json_extract(value,'$.playerKey') FROM json_each(?)))>1)
        AND NOT EXISTS(SELECT 1 FROM json_each(?) n WHERE (SELECT COUNT(*) FROM public_recommendations r,json_each(r.legs_json) l WHERE r.id>=? AND r.id<? AND r.kind='parlay' AND json_extract(l.value,'$.playerKey')=json_extract(n.value,'$.playerKey'))>=3)))`)
      .bind(id,kind,sport,kind==='prop'?first.player:null,kind==='prop'?first.market:null,kind==='prop'?first.side:null,kind==='prop'?first.line:null,kind==='prop'?first.odds:null,combined,first.gameId,legs.map(p=>p.gameTime).sort().at(-1),JSON.stringify(legs),new Date(now).toISOString(),VERIFIED_RECORD_SOURCE,cfg.note||'Official weekly selection. Pregame odds locked; multi-book price signal, not a player projection. Parlay payout is an estimate.',prefix+pick.tier+'|',prefix+pick.tier+'|\uffff',top?1e9:(CAPS[pick.tier]||0),kind,prefix+'props|',prefix+'props|\uffff',first.gameId,top?1e9:PER_GAME,prefix+'props|',prefix+'props|\uffff',first.playerKey,kind,prefix,prefix+'\uffff',JSON.stringify(legs),JSON.stringify(legs),prefix,prefix+'\uffff'));
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
  if(RETIRED_SHADOWS.has('line'))return {retired:true};
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
  if(RETIRED_SHADOWS.has('nba'))return {retired:true};
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
// Official NBA picks, from opening night (Oct 20, 2026). The price rules are
// the NFL's (big-5 book, 3+ books pricing both sides) with a higher bar for a
// nightly sport: 1.5-12% edge, 10 singles a night and 2 a game (a 2.5%+ top
// pick posts past both), one per player, never both sides, the parlay caps in
// NBA_CAPS, and only the core markets. A game's picks can post as soon as its props are listed (from
// NBA_WINDOW before tip-off, when 3+ books price both sides) until 5 minutes
// before: early prices are the softest. A player ruled out later is no
// action, never a loss. Ids are nba|<night>|<tier>|...,
// so every NFL query (id LIKE 'official|%') leaves them out.
const NBA_START=Date.parse('2026-10-20T14:00:00Z');
// NBA plays nearly every night, so the bar is higher than NFL: 1.5% or better,
// 10 singles a night, 2 a game; a 2.5%+ top pick posts past both limits.
const NBA_CAPS={props:10,reasonable:1,swing:1,moonshot:0},NBA_PER_GAME=2,NBA_WINDOW=36*3600000,NBA_MIN=1.5,NBA_TOP=2.5;
const NBA_OFFICIAL_MARKETS=new Set(['Points','Rebounds','Assists','3-Pointers Made','Points + Rebounds + Assists']);
// The night a game belongs to: its US Eastern date (a 10:30 PM ET tip is
// after midnight UTC, so 6 hours back keeps it on the same night).
const nbaNight=time=>new Date(Number(time)-6*3600000).toISOString().slice(0,10);
const nbaConfig=night=>({prefix:`nba|${night}|`,caps:NBA_CAPS,perGame:NBA_PER_GAME,top:NBA_TOP,sport:'NBA',note:'Official nightly NBA selection. Pregame odds locked; multi-book price signal, not a player projection. Parlay payout is an estimate.'});
async function publishNbaPicks(request,env,ctx,now=Date.now()){
  if(!env.DB||now<NBA_START-NBA_WINDOW)return {state:'not_started'};
  const schedule=await futureSchedule(new Request(new URL('/api/schedule?sport=NBA',request.url)),env,ctx);
  if(!schedule.ok)throw new Error('NBA schedule unavailable');
  const games=((await schedule.json()).data||[]).filter(e=>{const t=Date.parse(e.status?.startsAt);return t>=NBA_START&&t>now+5*60000&&t<=now+NBA_WINDOW}).sort((a,b)=>Date.parse(a.status.startsAt)-Date.parse(b.status.startsAt)).slice(0,16);
  if(!games.length)return {state:'no_games'};
  const boards=[];let failed=0;
  for(let i=0;i<games.length;i+=4){const results=await Promise.allSettled(games.slice(i,i+4).map(async e=>{const url=new URL('/api/event',request.url);url.searchParams.set('eventID',e.eventID);const r=await eventProps(new Request(url),env,ctx,{maxAge:SOON_MAX_AGE});if(!r.ok||r.headers.get('x-feed-cache')==='stale')throw new Error('NBA board unavailable');return (await r.json()).data||[]}));for(const r of results)if(r.status==='fulfilled')boards.push(...r.value);else failed++}
  await recordNbaExchangePrices(env,boards,now).catch(error=>console.warn('nba_exchange_prices_failed',error.message));
  const injuries=await injuryMap(env,'NBA').catch(()=>new Map());boards.splice(0,boards.length,...withoutInjured(boards,injuries));
  const core=list=>list.filter(p=>NBA_OFFICIAL_MARKETS.has(p.market));
  let posted=0;const leans=[],nights=[...new Set(boards.map(b=>nbaNight(Date.parse(b.commence_time))))];
  for(const night of nights){
    const cfg=nbaConfig(night),tonight=boards.filter(b=>nbaNight(Date.parse(b.commence_time))===night);
    const existing=(await env.DB.prepare('SELECT * FROM public_recommendations WHERE id>=? AND id<?').bind(cfg.prefix,cfg.prefix+'\uffff').all()).results||[];
    const dirs=await pickDirections(env),ok=p=>sameDirection(dirs,p.gameId,p.player,p.side);
    const stats={},candidates=core(officialCandidates(tonight,Date.now(),stats,{min:NBA_MIN})).filter(ok);
    const nextTier=withTeams(core(officialCandidates(tonight,Date.now(),{},{min:.5,below:NBA_MIN})).filter(ok),await playerTeams(env));
    const plan=officialPlan(candidates,existing,night,Date.now(),nextTier,cfg);
    posted+=Number(await writeOfficialPlan(plan,night,env,cfg))||0;
    const trail=officialTrailStatements(tonight,existing,env,Date.now());if(trail.length)await env.DB.batch(trail);
    // Worth a look: props from 0.5% up that aren't a pick or a parlay leg
    // tonight, two a game, ten at most. Shown only, never graded or counted.
    const taken=new Set(((await env.DB.prepare('SELECT legs_json FROM public_recommendations WHERE id>=? AND id<?').bind(cfg.prefix,cfg.prefix+'\uffff').all()).results||[]).flatMap(r=>recordLegs(r).map(officialPlayer)));
    const perGame=new Map();
    for(const p of core(officialCandidates(tonight,Date.now(),{},{min:.5}))){if(taken.has(p.playerKey)||(perGame.get(p.gameId)||0)>=2||leans.length>=10)continue;perGame.set(p.gameId,(perGame.get(p.gameId)||0)+1);leans.push({eventId:p.gameId,player:p.player,team:p.team||'',market:p.market,side:p.side,line:p.line,odds:p.odds,flagged:p.odds,book:p.book,edge:+Number(p.edge).toFixed(1),gameTime:p.gameTime})}
  }
  await setAppSetting(env,'nba-leans',JSON.stringify({at:new Date(now).toISOString(),leans})).catch(()=>{});
  if(failed)throw new Error('Some NBA boards were unavailable; retry required');
  return {state:'completed',games:games.length,boards:boards.length,posted};
}
// GET /api/record?view=home&sport=NBA: the NBA record and its recent picks
// (last 21 nights), for the NBA home, Results tab and live tab.
// wantAll: every NBA pick (the Results page), not just the last 21 nights.
let nbaHomeCache={at:0,data:null,all:null};
async function nbaHomeData(env,now=Date.now(),wantAll=false){
  if(nbaHomeCache.data&&now-nbaHomeCache.at<60000)return wantAll?{...nbaHomeCache.data,recent:nbaHomeCache.all}:nbaHomeCache.data;
  const all=(await env.DB.prepare("SELECT id,kind,player,market,side,line,odds,combined_odds,game_id,game_time,posted_at,status,result,closing_line,closing_odds,closing_captured_at,legs_json,(SELECT value FROM app_settings s WHERE s.key='xid:x-nba-card:'||substr(r.id,5,10)) AS x_id FROM public_recommendations r WHERE source='market-verified-v2' AND id LIKE 'nba|%' AND kind IN ('prop','parlay') ORDER BY game_time DESC,posted_at DESC").all()).results||[];
  const s=weeklySummary(all),since=new Date(now-21*86400000).toISOString();
  const season={wins:s.wins,losses:s.losses,pushes:s.pushes,profit:Math.round(s.profit),parlayWins:s.parlayWins,parlayLosses:s.parlayLosses,parlayProfit:Math.round(s.parlayProfit),beat:s.beat,tracked:s.tracked,picks:all.length};
  const data={season,tonight:nbaNight(now),recent:all.filter(r=>r.game_time>=since).slice(0,300)};
  nbaHomeCache={at:now,data,all};return wantAll?{...data,recent:all}:data;
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
    for(const o of market.outcomes||[])if(String(o.description||'').trim()===r.player&&exchangeOutcome(o).side===r.side.toLowerCase()&&exchangeOutcome(o).line===Number(r.line)){const odds=BTGStats.number(o.price);if(odds!==null&&(best===null||recordDecimal(odds)>recordDecimal(best)))best=odds}
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
  // NBA: the latest list saved by the NBA pick run (games tipping within 3 hours).
  if(new URL(request.url).searchParams.get('sport')==='NBA'){let saved={};try{saved=JSON.parse(await appSetting(env,'nba-leans')||'{}')}catch{}return json({success:true,leans:(saved.leans||[]).filter(l=>Date.parse(l.gameTime)>now).sort((a,b)=>a.gameTime.localeCompare(b.gameTime)||b.edge-a.edge),updatedAt:saved.at||null},200,{'cache-control':'public, max-age=120'})}
  const saved=await readFeedCache(request,'leans-v2-NFL');
  if(saved.response&&cacheAge(saved.response)<300000)return cachedForClient(saved.response,'fresh');
  const rows=(await env.DB.prepare('SELECT event_id,player,team,market,side,line,odds,book,edge,close_odds,game_time FROM near_shadow n WHERE game_time>? AND game_time<? AND NOT EXISTS(SELECT 1 FROM public_recommendations r WHERE r.id LIKE \'official|%\' AND r.kind=\'prop\' AND r.game_id=n.event_id AND r.player=n.player) AND NOT EXISTS(SELECT 1 FROM public_recommendations r,json_each(r.legs_json) l WHERE r.id LIKE \'official|%\' AND r.kind=\'parlay\' AND r.game_time>? AND json_extract(l.value,\'$.gameId\')=n.event_id AND json_extract(l.value,\'$.player\')=n.player) ORDER BY edge DESC').bind(new Date(now+5*60000).toISOString(),new Date(now+8*86400000).toISOString(),new Date(now).toISOString()).all().catch(()=>({results:[]}))).results||[];
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
  // Receivers and backs listed Out are often off the board entirely; the
  // usage-bump test still needs their recent role, so they're wanted too.
  const onBoard=new Map(boards.flatMap(b=>{const kick=Date.parse(b.commence_time);return kick>now?[b.home_team,b.away_team].map(t=>[normalizedName(t),{until:new Date(kick).toISOString(),teams:`${b.away_team} @ ${b.home_team}`}]):[]}));
  for(const r of (((await env.DB.prepare("SELECT player,team,position,status FROM injuries WHERE id LIKE 'NFL|%'").all().catch(()=>({results:[]}))).results)||[])){
    const g=onBoard.get(normalizedName(r.team));if(!g||injuryClass(r.status)!=='out'||!BUMP_MARKETS[r.position])continue;
    const id=`NFL|${normalizedName(r.player)}`;if(!want.has(id))want.set(id,{player:r.player,teams:g.teams,until:g.until,markets:new Set(FORM_ROLE)});
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
// Catches and carries are always kept (FORM_ROLE), whatever props are listed:
// the usage-bump test reads them to tell a starter from a backup, and players
// listed Out often only have a touchdown prop left on the board.
const FORM_ROLE=['Receptions','Rush Attempts'];
function formGames(payload,listed,now){
  const markets=[...new Set([...(listed||[]),...FORM_ROLE])];
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
// Dropped Oct 12 (TD 70-220, defense 36-47, live 102-130, all losing and
// rarely beating the close). Past rows stay graded; nothing new is logged.
const TD_SHADOW_ON=false,DEFENSE_SHADOW_ON=false,LIVE_SHADOW_ON=false;
// Sportsbook anytime-TD rule test (Oct 19): only TDs whose best big-5 Yes
// price is 1 point or more over our TD fair price (6+ books), logged as
// source 'rule', graded, never posted. In the Oct 4-12 backtest no TD got
// past about 1.3 points, so this finds out how often the rule would fire.
const SB_TD_TEST_ON=true,tdEdge=r=>100*(tdImplied(r.avgOdds)/TD_YES_MARGIN-tdImplied(r.odds));
const sbTdRule=r=>r.market==='Anytime Touchdown'&&r.books>=6&&tdEdge(r)>=1;
async function recordTdShadow(env,boards,now=Date.now(),only=null){
  if(!env.DB)return {logged:0};
  const stamp=new Date(now).toISOString(),statements=[];let logged=0;
  const open=(await env.DB.prepare('SELECT id,event_id,player,market FROM td_shadow WHERE game_time>?').bind(stamp).all()).results||[],games=new Set(open.map(r=>r.event_id));
  for(const board of boards){
    const gameId=board.eventID||`NFL--${board.id}`,kickoff=Date.parse(board.commence_time);
    if(!(kickoff>now)||kickoff-now>LEAN_WINDOW)continue;
    const props=tdProps(board);
    if(!games.has(gameId))for(const r of props.filter(r=>!only||only(r))){statements.push(tdRow(env,board,gameId,r,stamp,only?'rule':'live'));logged++}
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

// Live grading for prediction picks and parlays, with the same grader as
// official picks (box score, play-by-play when a player is missing, and early
// decisions): an Over that clears its line or an Under it passes is decided
// the moment it happens, mid-game; everything else when the game is final.
async function gradePredictionNow(env,now=Date.now()){
  if(!env.DB||!env.BALLDONTLIE_API_KEY||typeof gradePublicRecord!=='function')return {graded:0};
  const live=new Date(now).toISOString(),old=new Date(now-36*3600000).toISOString(),cache=new Map(),statements=[],stamp=live;let graded=0;
  const picks=(await env.DB.prepare('SELECT * FROM prediction_picks WHERE result IS NULL AND game_time<=? AND game_time>? ORDER BY game_time LIMIT 20').bind(live,old).all()).results||[];
  for(const r of picks){
    const sp=String(r.event_id||'').startsWith('NBA--')?'NBA':'NFL',rec={kind:'prop',sport:sp,player:r.player,market:r.market,side:r.side,line:r.line,odds:r.odds,game_time:r.game_time,legs_json:JSON.stringify([{player:r.player,market:r.market,side:r.side,line:r.line,team:r.team,gameTime:r.game_time,sport:sp}])};
    const final=await gradePublicRecord(rec,env,cache).catch(()=>null),leg=rec.gradedLegs?.[0]||{},early=!final&&leg.decidedEarly&&['won','lost'].includes(rec.provisionalResult);
    const result=final||(early?rec.provisionalResult:null);if(!result)continue;
    statements.push(env.DB.prepare('UPDATE prediction_picks SET actual=?,result=?,graded_at=?,early=? WHERE id=? AND result IS NULL').bind(leg.actualValue??null,result,stamp,early?1:0,r.id));graded++;
  }
  const parlays=(await env.DB.prepare('SELECT * FROM prediction_parlays WHERE result IS NULL AND game_time>? ORDER BY game_time LIMIT 15').bind(old).all().catch(()=>({results:[]}))).results||[];
  for(const r of parlays){
    let legs=[];try{legs=JSON.parse(r.legs_json)}catch{continue}
    if(!legs.some(l=>Date.parse(l.gameTime)<=now))continue;
    const rec={kind:'parlay',sport:'NFL',legs_json:JSON.stringify(legs.map(l=>({player:l.player,market:l.market,side:l.side,line:l.line,team:l.team,gameTime:l.gameTime,sport:'NFL',...(l.voided?{voided:true}:{})})))};
    const final=await gradePublicRecord(rec,env,cache).catch(()=>null),out=rec.gradedLegs||[];let changed=false;
    legs.forEach((l,i)=>{const g=out[i];if(!l.result&&g&&['won','lost','push'].includes(g.result)&&(g.boxScoreFinal||g.decidedEarly)){l.result=g.result;l.actual=g.actualValue??null;if(g.decidedEarly)l.decidedEarly=true;changed=true}});
    const result=final||(legs.some(l=>l.result==='lost')?'lost':legs.every(l=>['won','push'].includes(l.result))?(legs.every(l=>l.result==='push')?'push':'won'):null);
    if(changed||result){statements.push(env.DB.prepare('UPDATE prediction_parlays SET legs_json=?,result=?,graded_at=? WHERE id=? AND result IS NULL').bind(JSON.stringify(legs),result,result?stamp:null,r.id));if(result)graded++}
  }
  if(statements.length)await env.DB.batch(statements);
  return {graded,checked:picks.length+parlays.length};
}
// Prediction result replies and the full-card recap run in their own
// invocation (SELF binding), so their reads, uploads and posts get their own
// request allowance instead of crowding out the main X run.
// One-off post set by the owner: app_settings x-custom-post holds JSON
// {"text":"…","quoteKey":"xid:…"} (quoteKey optional). It posts once, after
// the post it quotes exists, then the request is cleared.
async function postCustomToX(env,now=Date.now()){
  if(!env.DB||!xReady(env))return {posted:0,disabled:true};
  const raw=await appSetting(env,'x-custom-post');if(!raw)return {posted:0,none:true};
  let req;try{req=JSON.parse(raw)}catch{return {posted:0,invalid:true}}
  const text=String(req.text||'').trim();if(!text||[...text].length>280)return {posted:0,invalid:true};
  const quote=req.quoteKey?await appSetting(env,String(req.quoteKey)):null;if(req.quoteKey&&!quote)return {posted:0,waiting:true};
  // at: post no earlier than this time. svgKey: an app_settings key holding a card SVG to attach.
  if(req.at&&now<Date.parse(req.at))return {posted:0,waiting:true};
  const svg=req.svgKey?await appSetting(env,String(req.svgKey)):null;if(req.svgKey&&!svg)return {posted:0,invalid:true};
  const claim=await env.DB.prepare('DELETE FROM app_settings WHERE key=? AND value=?').bind('x-custom-post',raw).run();if(!Number(claim?.meta?.changes??claim?.changes))return {posted:0,claimed:false};
  try{const mediaId=svg&&typeof renderCardPng==='function'?await xUploadImage(env,await renderCardPng(svg)):null;
    const sent=await xPost(env,text,mediaId,null,quote);await setAppSetting(env,'x-last-post',`${new Date(now).toISOString()} custom ${sent?.data?.id||''}`).catch(()=>{});return {posted:1,graphic:Boolean(mediaId)}}
  catch(error){await setAppSetting(env,'x-custom-post',raw).catch(()=>{});await setAppSetting(env,'x-last-error',`${new Date(now).toISOString()} custom: ${error.message}`).catch(()=>{});return {posted:0,error:error.message}}
}
async function runXResults(env,now=Date.now()){
  if(typeof loadEspnIds==='function')await loadEspnIds(env,now).catch(()=>null);
  const grading=await gradePredictionNow(env,now).catch(error=>({error:error.message}));
  const results=await postPredictionResultsToX(env,now,2).catch(error=>({posted:0,error:error.message}));
  const nba=await postNbaRepliesToX(env,now,2).catch(error=>({posted:0,error:error.message}));
  const recap=await postCardRecapToX(env,now).catch(error=>({posted:0,error:error.message}));
  const week=recap.posted?{posted:0,waiting:true}:await postPredictionWeekToX(env,now).catch(error=>({posted:0,error:error.message}));
  const custom=week.posted?{posted:0,waiting:true}:await postCustomToX(env,now).catch(error=>({posted:0,error:error.message}));
  return {grading,results,nba,recap,week,custom};
}
async function runXResultsNow(env){
  if(!xReady(env))return {disabled:true};
  // Due while any prediction pick or parlay is in play or waiting on a grade,
  // a result is waiting to post, or a full card is waiting on its recap.
  const t=new Date(Date.now()).toISOString(),old=new Date(Date.now()-36*3600000).toISOString(),q=sql=>env.DB.prepare(sql).bind(t,old).first().catch(()=>null);
  const due=new Date().getUTCDay()===2||await appSetting(env,`xid:x-nba-card:${nbaNight(Date.now())}`)||await appSetting(env,`xid:x-nba-card:${nbaNight(Date.now()-86400000)}`)||await appSetting(env,'x-custom-post')||await appSetting(env,'x-card-recap-request')||await q('SELECT 1 AS n FROM prediction_picks WHERE game_time<=? AND game_time>? LIMIT 1')||await q('SELECT 1 AS n FROM prediction_parlays WHERE game_time<=? AND game_time>? LIMIT 1');
  if(!due)return {waiting:0};
  if(!env.SELF?.fetch||!env.MAINTENANCE_TOKEN)return runXResults(env);
  const r=await env.SELF.fetch(new Request(`${SITE_URL}/api/maintenance?job=xresults`,{method:'POST',headers:{authorization:`Bearer ${env.MAINTENANCE_TOKEN}`},signal:AbortSignal.timeout(60000)}));
  return {status:r.status};
}
// TD grading reads box scores and play-by-play for each game, so it runs in
// its own invocation (SELF binding) with its own request allowance.
async function gradeTdShadowNow(env){
  if(!env.SELF?.fetch||!env.MAINTENANCE_TOKEN)return gradeTdShadow(env,Date.now(),10);
  const cut=new Date(Date.now()-3*3600000).toISOString();
  let waiting=0;for(const t of ['td_shadow','bump_shadow','live_shadow','game_shadow','book_shadow','exchange_shadow','prediction_picks','prediction_parlays'])waiting+=((await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE result IS NULL AND game_time<?`).bind(cut).first().catch(()=>null))?.n||0);
  if(!waiting)return {waiting:0};
  const r=await env.SELF.fetch(new Request(`${SITE_URL}/api/maintenance?job=tdGrade`,{method:'POST',headers:{authorization:`Bearer ${env.MAINTENANCE_TOKEN}`},signal:AbortSignal.timeout(60000)}));
  return {waiting,status:r.status};
}

// Injuries: ESPN's league-wide NFL injury report, one request, refreshed
// every 25 minutes (every 10 in Thursday, Sunday and Monday game windows).
const INJURY_URL='https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries';
const NBA_INJURY_URL='https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries';
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
// NFL game windows, plus every NBA evening (about 5 PM to 11 PM ET).
function injuryFast(now){const d=new Date(now),day=d.getUTCDay(),h=d.getUTCHours();return h>=21||h<3||(day===0&&h>=15)||(day===1&&(h<5||h>=22))||(day===2&&h<5)||(day===4&&h>=22)||(day===5&&h<5)}
async function refreshInjuries(env,now=Date.now()){
  if(!env.DB)return {};
  const last=Number(await appSetting(env,'injuries-at')||0);
  if(now-last<(injuryFast(now)?9:25)*60000)return {skipped:true};
  await setAppSetting(env,'injuries-at',String(now));
  const out={};
  // Each league's report replaces only its own rows (ids start NFL| or NBA|).
  for(const [sport,url] of [['NFL',INJURY_URL],['NBA',NBA_INJURY_URL]]){
    try{
      const r=await fetch(url,{headers:{accept:'application/json'},signal:AbortSignal.timeout(15000)});
      if(!r.ok)throw new Error(`injury report ${r.status}`);
      const payload=await r.json(),rows=parseInjuries(payload);
      // What the feed looked like, for checking its shape.
      if(sport==='NFL')await setAppSetting(env,'injuries-sample',JSON.stringify({teams:Array.isArray(payload?.injuries)?payload.injuries.length:0,rows:rows.length,first:payload?.injuries?.[0]?.injuries?.[0]||null}).slice(0,3000));
      if(!rows.length){out[sport]=0;continue}
      const statements=[env.DB.prepare('DELETE FROM injuries WHERE id LIKE ?').bind(`${sport}|%`)];
      for(const x of rows)statements.push(env.DB.prepare('INSERT OR REPLACE INTO injuries (id,player,team,position,status,detail,reported_at,fetched_at) VALUES (?,?,?,?,?,?,?,?)').bind(`${sport}|${normalizedName(x.player)}`,x.player,x.team||null,x.position||null,x.status,String(x.detail||'').slice(0,120)||null,x.date||null,now));
      await env.DB.batch(statements);out[sport]=rows.length;
    }catch(error){out[sport]={error:error.message}}
  }
  // One league's report failing never blocks the other's.
  return {rows:out.NFL??0,nba:out.NBA};
}
async function injuryMap(env,sport='NFL'){
  const rows=(await env.DB.prepare('SELECT player,team,position,status,detail,reported_at FROM injuries WHERE id LIKE ?').bind(`${sport}|%`).all().catch(()=>({results:[]}))).results||[];
  return new Map(rows.map(r=>[normalizedName(r.player),r]));
}
// A player ruled Out before kickoff never plays, so his bet is void (stake
// back, no win or loss), as at the books; a parlay drops that leg. Final
// inactives come out about 90 minutes before kickoff. Only a report dated
// before kickoff counts, so an injury during the game never voids a bet.
const VOID_LEAD=100*60000;
const voidReason=i=>`Ruled out${i.detail?` (${String(i.detail).replace(/\b\w/g,c=>c.toUpperCase())})`:''}`;
async function voidRuledOut(env,now=Date.now()){
  if(!env.DB)return {voided:0};
  const maps={NFL:await injuryMap(env,'NFL'),NBA:await injuryMap(env,'NBA')};
  const ruledOut=(sport,player,gameTime)=>{
    const kick=Date.parse(gameTime);if(!Number.isFinite(kick)||kick-now>VOID_LEAD||now-kick>36*3600000)return null;
    const i=maps[String(sport||'').toUpperCase()==='NBA'?'NBA':'NFL'].get(normalizedName(player));
    if(!i||injuryClass(i.status)!=='out'||!/^out$/i.test(String(i.status).trim()))return null;
    const at=Date.parse(i.reported_at||'');return Number.isFinite(at)&&at<kick?i:null;
  };
  const stamp=new Date(now).toISOString(),soon=new Date(now+VOID_LEAD).toISOString(),old=new Date(now-36*3600000).toISOString(),statements=[],voided=[];
  const markLegs=(legs,sportOf)=>{let n=0;for(const l of legs){if(l.voided||['won','lost','push'].includes(l.result))continue;const i=ruledOut(sportOf(l),l.player,l.gameTime);if(i){Object.assign(l,{voided:true,voidReason:voidReason(i),result:'push'});voided.push(l.player);n++}}return n};
  const official=(await env.DB.prepare("SELECT id,kind,sport,player,game_time,legs_json FROM public_recommendations WHERE status IN ('pending','provisional') AND game_time<=? AND game_time>?").bind(soon,old).all().catch(()=>({results:[]}))).results||[];
  for(const r of official){
    let legs;try{legs=JSON.parse(r.legs_json||'[]')}catch{continue}
    if(!legs.length)legs=[{player:r.player,sport:r.sport,gameTime:r.game_time}];
    if(!markLegs(legs,l=>l.sport||r.sport))continue;
    // A single settles now; a parlay grades on its other legs.
    if(r.kind==='parlay')statements.push(env.DB.prepare("UPDATE public_recommendations SET legs_json=? WHERE id=? AND status IN ('pending','provisional')").bind(JSON.stringify(legs),r.id));
    else statements.push(env.DB.prepare("UPDATE public_recommendations SET status='final',result='push',settled_at=?,legs_json=? WHERE id=? AND status IN ('pending','provisional')").bind(stamp,JSON.stringify(legs),r.id));
  }
  const picks=(await env.DB.prepare('SELECT id,player,game_time FROM prediction_picks WHERE result IS NULL AND game_time<=? AND game_time>?').bind(soon,old).all().catch(()=>({results:[]}))).results||[];
  for(const r of picks){const i=ruledOut('NFL',r.player,r.game_time);if(!i)continue;voided.push(r.player);statements.push(env.DB.prepare('UPDATE prediction_picks SET result=?,void_reason=?,graded_at=? WHERE id=? AND result IS NULL').bind('void',voidReason(i),stamp,r.id))}
  const parlays=(await env.DB.prepare('SELECT id,legs_json FROM prediction_parlays WHERE result IS NULL AND game_time>?').bind(old).all().catch(()=>({results:[]}))).results||[];
  for(const r of parlays){
    let legs;try{legs=JSON.parse(r.legs_json||'[]')}catch{continue}
    if(!markLegs(legs,()=>'NFL'))continue;
    const result=legs.every(l=>l.result==='push')?'push':null;
    statements.push(env.DB.prepare('UPDATE prediction_parlays SET legs_json=?,result=?,graded_at=? WHERE id=? AND result IS NULL').bind(JSON.stringify(legs),result,result?stamp:null,r.id));
  }
  if(statements.length)await env.DB.batch(statements);
  return {voided:voided.length,players:[...new Set(voided)]};
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
  const sport=new URL(request.url).searchParams.get('sport')==='NBA'?'NBA':'NFL';
  const saved=await readFeedCache(request,`injuries-v1-${sport}`);
  if(saved.response&&cacheAge(saved.response)<600000)return cachedForClient(saved.response,'fresh');
  const players={};for(const [k,r] of await injuryMap(env,sport)){const c=injuryClass(r.status);if(c)players[k]={s:r.status,c,d:r.detail||'',t:r.team||'',p:r.position||'',at:r.reported_at||''}}
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
  if(RETIRED_SHADOWS.has('bump'))return {retired:true};
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
  if(RETIRED_SHADOWS.has('live'))return {retired:true};
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
  const q=new URLSearchParams({apiKey,regions:'us,us_ex',markets:Object.keys(GAME_MARKETS).join(','),oddsFormat:'american',dateFormat:'iso'});
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
// Both sides of each game market at each book, grouped by line.
function gameGroups(e,key,now){
  const groups=new Map();
  for(const b of e.bookmakers||[]){
    const m=(b.markets||[]).find(m=>m.key===key);if(!m)continue;
    const updated=Date.parse(m.last_update||b.last_update||'');if(!Number.isFinite(updated)||now-updated>15*60000)continue;
    const pair=gamePair(e,m);if(!pair)continue;
    const a=BTGStats.number(pair.a.price),c=BTGStats.number(pair.c.price);if(a===null||c===null)continue;
    const list=groups.get(pair.key)||[];list.push({key:b.key,title:b.title||b.key,a,c});groups.set(pair.key,list);
  }
  return groups;
}
function gameLineCandidates(events,now=Date.now()){
  const best=new Map();
  for(const e of events){
    const kick=Date.parse(e.commence_time);if(!(kick>now+5*60000))continue;
    for(const [key,label] of Object.entries(GAME_MARKETS)){
      const groups=new Map([...gameGroups(e,key,now)].map(([line,list])=>[line,list.filter(p=>!EXCHANGES[p.key])]));
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
  if(RETIRED_SHADOWS.has('game'))return {retired:true};
  if(!env.DB||!env.THE_ODDS_API_KEY)return {logged:0};
  // 3 credits a call: every 10 minutes in NFL windows, every 30 otherwise.
  const last=Number(await appSetting(env,'game-lines-at')||0);
  if(now-last<(nflActiveWindow(new Date(now))?9:29)*60000)return {skipped:true};
  await setAppSetting(env,'game-lines-at',String(now));
  const events=(await fetchGameLines(env.THE_ODDS_API_KEY)).map(e=>({...e,eventID:`NFL--${e.id}`}));
  const stamp=new Date(now).toISOString(),statements=[];
  const picks=gameLineCandidates(events,now),exchangePicks=exchangeGameCandidates(events,now);
  for(const p of exchangePicks)statements.push(exchangeInsert(env,p,stamp));
  for(const p of picks)statements.push(env.DB.prepare('INSERT OR IGNORE INTO game_shadow (id,event_id,home,away,market,side,line,odds,book,edge,game_time,logged_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').bind(`${p.eventId}|${p.market}`,p.eventId,p.home,p.away,p.market,p.side,p.line,p.odds,p.book,+p.edge.toFixed(2),p.gameTime,stamp));
  const open=(await env.DB.prepare('SELECT id,event_id,market,side,line FROM game_shadow WHERE game_time>?').bind(stamp).all()).results||[];
  for(const r of open){const e=events.find(e=>e.eventID===r.event_id);const p=e?gameLinePrice(e,r):null;if(p!==null)statements.push(env.DB.prepare('UPDATE game_shadow SET close_odds=?,close_at=? WHERE id=?').bind(p,stamp,r.id))}
  if(statements.length)await env.DB.batch(statements);
  return {games:events.length,qualified:picks.length,tracked:open.length,exchange:exchangePicks.length};
}
function gameLineResult(r,hs,as){
  const diff=(v)=>v>0?'won':v<0?'lost':'push';
  if(r.market==='Total')return diff((r.side==='Over'?1:-1)*(hs+as-r.line));
  const mine=r.side===r.home?hs:as,theirs=r.side===r.home?as:hs;
  return diff(mine+(r.market==='Spread'?Number(r.line):0)-theirs);
}
// BALLDONTLIE games on the dates of these rows' kickoffs (UTC and US evening).
async function finalGames(rows,env){
  const q=new URLSearchParams({per_page:'100'}),dates=new Set();
  for(const r of rows){const t=Date.parse(r.game_time);dates.add(new Date(t-6*3600000).toISOString().slice(0,10));dates.add(new Date(t).toISOString().slice(0,10))}
  for(const d of dates)q.append('dates[]',d);
  return (await bdlRequest(`/nfl/v1/games?${q}`,env.BALLDONTLIE_API_KEY))?.data||[];
}
async function gradeGameShadow(env,now=Date.now(),limit=30){
  if(!env.DB||!env.BALLDONTLIE_API_KEY)return {graded:0};
  const rows=(await env.DB.prepare('SELECT * FROM game_shadow WHERE result IS NULL AND game_time<? AND game_time>? ORDER BY game_time LIMIT ?').bind(new Date(now-4*3600000).toISOString(),new Date(now-14*86400000).toISOString(),limit).all()).results||[];
  if(!rows.length)return {graded:0};
  const games=await finalGames(rows,env);
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

// Props the 3-book rule skips (shadow). Two-book: the same fair-price test
// with exactly two books pricing both sides. Defense: sacks and tackles,
// usually at one book, priced against the player's last 10 games blended
// with that book's no-vig price (6 games' weight), so a short sample can't
// swing it far. Only players without an official pick in the game.
const DEFENSE_MARKETS=['Sacks','Solo Tackles','Tackles + Assists','Assists'];
const DEFENSE_PRIOR=6,DEFENSE_MIN_EDGE=4;
function defenseCandidates(boards,form,now=Date.now()){
  const best=new Map();
  for(const board of boards){
    const kickoff=Date.parse(board.commence_time);if(!(kickoff>now+5*60000)||kickoff-now>48*3600000)continue;
    const gameId=board.eventID||`NFL--${board.id}`;
    for(const book of board.bookmakers||[]){if(!OFFICIAL_BOOKS.has(book.key))continue;
      for(const market of book.markets||[]){
        if(/_alternate$/.test(market.key))continue;
        const label=recordLabels[market.key];if(!DEFENSE_MARKETS.includes(label))continue;
        const updated=Date.parse(market.last_update||book.last_update||'');if(!Number.isFinite(updated)||now-updated>15*60000)continue;
        const pairs=new Map();
        for(const o of market.outcomes||[]){const side=String(o.name).toLowerCase(),player=String(o.description||'').trim(),line=BTGStats.number(o.point),odds=BTGStats.number(o.price);if(!player||line===null||odds===null||!['over','under'].includes(side))continue;const k=`${player}|${line}`,p=pairs.get(k)||{player,line};p[side]=odds;pairs.set(k,p)}
        for(const p of pairs.values()){
          if(p.over==null||p.under==null)continue;
          const f=form.get(normalizedName(p.player));let values=[];try{values=(JSON.parse(f?.games_json||'{}').m?.[label]||[]).filter(v=>v!==null&&v!==undefined)}catch{}
          if(values.length<6)continue;
          const over=values.filter(v=>v>p.line).length,under=values.filter(v=>v<p.line).length,n=over+under;if(!n)continue;
          const io=1/recordDecimal(p.over),iu=1/recordDecimal(p.under),bookOver=io/(io+iu);
          const pOver=(over+DEFENSE_PRIOR*bookOver)/(n+DEFENSE_PRIOR);
          for(const [side,prob,odds] of [['Over',pOver,p.over],['Under',1-pOver,p.under]]){
            if(odds<-200||odds>250)continue;
            const edge=100*(prob-1/recordDecimal(odds));if(edge<DEFENSE_MIN_EDGE)continue;
            const avg=values.reduce((a,b)=>a+b,0)/values.length;
            const row={kind:'defense',gameId,player:p.player,team:`${board.away_team} · @ ${board.home_team}`,market:label,side,line:p.line,odds,book:book.title||book.key,edge,gameTime:new Date(kickoff).toISOString(),detail:`${side==='Over'?over:under} of ${values.length} ${side.toLowerCase()} · avg ${+avg.toFixed(1)}`};
            const k=`${gameId}|${normalizedName(p.player)}`;if(!best.has(k)||best.get(k).edge<edge)best.set(k,row);
          }
        }
      }
    }
  }
  return [...best.values()];
}
async function recordBookShadow(env,boards,now=Date.now(),opts={}){
  if(RETIRED_SHADOWS.has('book'))return {retired:true};
  if(!env.DB)return {};
  const stamp=new Date(now).toISOString();
  const locked=new Set(((await env.DB.prepare("SELECT game_id,player FROM public_recommendations WHERE id LIKE 'official|%' AND kind='prop' AND game_time>?").bind(stamp).all()).results||[]).map(r=>`${r.game_id}|${normalizedName(r.player)}`));
  const two=officialCandidates(boards,now,{},{min:1,exactBooks:2}).map(p=>({...p,kind:'two_book',detail:'2 books'}));
  const form=new Map(((await env.DB.prepare('SELECT player,games_json FROM player_form WHERE games_json IS NOT NULL').all()).results||[]).map(r=>[normalizedName(r.player),r]));
  const defense=(opts.defense??DEFENSE_SHADOW_ON)?defenseCandidates(boards,form,now):[];
  const rows=[...two,...defense].filter(p=>!locked.has(`${p.gameId}|${normalizedName(p.player)}`));
  const statements=rows.map(p=>env.DB.prepare('INSERT OR IGNORE INTO book_shadow (id,kind,event_id,player,team,market,side,line,odds,book,edge,detail,game_time,logged_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(`${p.kind}|${p.gameId}|${normalizedName(p.player)}`,p.kind,p.gameId,p.player,p.team||null,p.market,p.side,p.line,p.odds,p.book,+p.edge.toFixed(2),p.detail||null,p.gameTime,stamp));
  const open=(await env.DB.prepare('SELECT id,event_id,player,market,side,line FROM book_shadow WHERE game_time>?').bind(stamp).all()).results||[];
  for(const r of open){const board=boards.find(e=>(e.eventID||`NFL--${e.id}`)===r.event_id);const p=board?bigFivePrice(board,r):null;if(p!==null)statements.push(env.DB.prepare('UPDATE book_shadow SET close_odds=?,close_at=? WHERE id=?').bind(p,stamp,r.id))}
  if(statements.length)await env.DB.batch(statements);
  return {twoBook:two.length,defense:defense.length,tracked:open.length};
}
async function gradeBookShadow(env,now=Date.now(),limit=30){
  if(!env.DB||!env.BALLDONTLIE_API_KEY)return {graded:0};
  const rows=(await env.DB.prepare('SELECT * FROM book_shadow WHERE result IS NULL AND game_time<? AND game_time>? ORDER BY game_time LIMIT ?').bind(new Date(now-4*3600000).toISOString(),new Date(now-14*86400000).toISOString(),limit).all()).results||[];
  const cache=new Map(),statements=[],stamp=new Date(now).toISOString();
  for(const r of rows){
    const record={sport:'NFL',player:r.player,team:r.team,gameTime:r.game_time,market:r.market,side:r.side,line:r.line};
    const stat=await recordPlayerStats(record,env,undefined,cache).catch(()=>null);
    if(shadowVoid(stat,r.game_time,now)){statements.push(env.DB.prepare('UPDATE book_shadow SET result=?,graded_at=? WHERE id=?').bind('void',stamp,r.id));continue}
    if(!stat||stat.missingPlayerStats||!(stat.scoreboardFinal||nflGameState(stat.game||{})==='final'))continue;
    const value=BTGStats.metric(record,stat).value,result=value===null?null:BTGStats.grade(r.side,r.line,value);
    if(result)statements.push(env.DB.prepare('UPDATE book_shadow SET actual=?,result=?,graded_at=? WHERE id=?').bind(value,result,stamp,r.id));
  }
  if(statements.length)await env.DB.batch(statements);
  return {graded:statements.length,checked:rows.length};
}

// Prediction markets (shadow). The Odds API's us_ex region lists exchanges as
// bookmakers; they never enter a sportsbook fair price. An exchange price at
// least 1% better than our sportsbook fair price (3+ licensed books) is
// logged once per player prop or game market and graded. Listed prices are
// before exchange fees, so the analysis should take those off.
// One outcome as side/player/line/odds. Yes/no props (anytime touchdown)
// read as Over/Under 0.5, the way the board and grading store them.
function exchangeOutcome(o){const name=String(o.name||'').toLowerCase(),yesNo=name==='yes'||name==='no';return {side:yesNo?(name==='yes'?'over':'under'):name,player:String(o.description||'').trim(),line:yesNo?.5:BTGStats.number(o.point),odds:BTGStats.number(o.price)}}
const EXCHANGES={kalshi:'Kalshi',polymarket:'Polymarket',novig:'Novig',prophetx:'ProphetX',betopenly:'BetOpenly'};
// Kickers and interceptions added Oct 19: our best sportsbook markets, and
// Novig and ProphetX both list them (exchange-market-probe). Pass
// completions dropped (paused for picks), so a call is 10 credits.
const EXCHANGE_PROP_MARKETS=['player_receptions','player_reception_yds','player_rush_yds','player_pass_yds','player_pass_tds','player_rush_attempts','player_anytime_td','player_field_goals','player_kicking_points','player_pass_interceptions'];
async function fetchExchangeOdds(eventId,apiKey){
  const q=new URLSearchParams({apiKey,regions:'us_ex',markets:EXCHANGE_PROP_MARKETS.join(','),oddsFormat:'american',dateFormat:'iso'});
  const r=await fetch(`${API_BASE}/sports/${SPORTS[0].key}/events/${eventId}/odds?${q}`,{headers:{accept:'application/json'}});
  const body=await r.text();if(!r.ok)throw new Error(providerMessage(body,'Exchange prices are unavailable.'));
  const left=r.headers.get('x-requests-remaining');if(left!==null&&Number.isFinite(Number(left)))oddsCreditsLeft=Number(left);
  const d=JSON.parse(body);return {...d,bookmakers:(d.bookmakers||[]).filter(b=>EXCHANGES[b.key])};
}
// Bet slip links test: once per value of the app_settings key
// links-check-request, one receptions call (sportsbooks + exchanges, about
// 2 credits) for the next NFL game with includeLinks and includeSids. What
// each book returns is saved to links-check for review; nothing on the site
// uses it yet.
async function checkBetLinks(env,now=Date.now()){
  if(!env.DB||!env.THE_ODDS_API_KEY)return {skipped:true};
  const req=String((await appSetting(env,'links-check-request'))||'');if(!req)return {none:true};
  if((await appSetting(env,'links-check-done'))===req)return {done:true};
  await setAppSetting(env,'links-check-done',req);
  const ev=await fetch(`${API_BASE}/sports/${SPORTS[0].key}/events?${new URLSearchParams({apiKey:env.THE_ODDS_API_KEY,dateFormat:'iso'})}`,{headers:{accept:'application/json'}});
  const events=ev.ok?await ev.json():[],next=(events||[]).filter(e=>Date.parse(e.commence_time)>now+10*60000).sort((a,b)=>Date.parse(a.commence_time)-Date.parse(b.commence_time))[0];
  if(!next){await setAppSetting(env,'links-check',JSON.stringify({at:new Date(now).toISOString(),error:'no upcoming game'}));return {error:'no upcoming game'}}
  const q=new URLSearchParams({apiKey:env.THE_ODDS_API_KEY,regions:'us,us_ex',markets:'player_receptions',oddsFormat:'american',dateFormat:'iso',includeLinks:'true',includeSids:'true'});
  const r=await fetch(`${API_BASE}/sports/${SPORTS[0].key}/events/${next.id}/odds?${q}`,{headers:{accept:'application/json'}});
  const body=await r.text();const left=r.headers.get('x-requests-remaining');if(left!==null&&Number.isFinite(Number(left)))oddsCreditsLeft=Number(left);
  if(!r.ok){await setAppSetting(env,'links-check',JSON.stringify({at:new Date(now).toISOString(),status:r.status,body:body.slice(0,400)}));return {error:r.status}}
  const d=JSON.parse(body),books={};
  for(const b of d.bookmakers||[]){
    const outs=(b.markets||[]).flatMap(m=>(m.outcomes||[]).map(o=>({...o,market:m})));
    const withLink=outs.filter(o=>o.link),one=withLink[0]||outs[0]||{};
    books[b.key]={event:b.link||null,eventSid:b.sid||null,markets:(b.markets||[]).length,marketLink:(b.markets||[]).find(m=>m.link)?.link||null,outcomes:outs.length,outcomeLinks:withLink.length,sample:one.description?`${one.description} ${one.name} ${one.point} (${one.price})`:null,sampleLink:one.link||null,sampleSid:one.sid||null,secondLink:withLink[1]?.link||null};
  }
  // Which web addresses open each app on an iPhone (apple-app-site-association).
  const apps={};
  for(const host of ['novig.com','novig.us','app.novig.us','www.prophetx.co','sportsbook.draftkings.com','sportsbook.fanduel.com']){
    try{const a=await fetch(`https://${host}/.well-known/apple-app-site-association`,{headers:{accept:'application/json'},signal:AbortSignal.timeout(8000)});apps[host]=a.ok?(await a.text()).slice(0,1500):`status ${a.status}`}catch(error){apps[host]=`error ${error.message}`}
  }
  const out={at:new Date(now).toISOString(),game:`${d.away_team} @ ${d.home_team}`,eventId:next.id,books,apps};
  await setAppSetting(env,'links-check',JSON.stringify(out).slice(0,40000));
  return {books:Object.keys(books).length,withLinks:Object.values(books).filter(b=>b.outcomeLinks).length};
}
// Sportsbook fair chance of the Over for every player line priced by 3+ books
// (minBooks 2 for the two-book test).
function sportsbookFairs(boards,now=Date.now(),minBooks=3){
  const groups=new Map();
  for(const board of boards){
    const gameId=board.eventID||`NFL--${board.id}`;
    for(const book of board.bookmakers||[]){if(EXCHANGES[book.key])continue;
      for(const m of book.markets||[]){
        const label=recordLabels[m.key],updated=Date.parse(m.last_update||book.last_update||'');
        if(!label||/_alternate$/.test(m.key)||!Number.isFinite(updated)||now-updated>15*60000)continue;
        for(const o of m.outcomes||[]){const {side,player,line,odds}=exchangeOutcome(o);if(!player||line===null||odds===null||!['over','under'].includes(side))continue;
          const k=`${gameId}|${normalizedName(player)}|${label}|${line}`,g=groups.get(k)||new Map(),pair=g.get(book.key)||{};pair[side]=odds;g.set(book.key,pair);groups.set(k,g)}
      }
    }
  }
  const fairs=new Map();
  // Books far apart (more than FAIR_SPREAD between the highest and lowest
  // no-margin chance) usually means news is moving the price: no fair price.
  for(const [k,g] of groups){const pairs=[...g.values()].filter(p=>p.over!=null&&p.under!=null);if(pairs.length<minBooks)continue;
    const ps=pairs.map(p=>{const o=1/recordDecimal(p.over),u=1/recordDecimal(p.under);return o/(o+u)});if(Math.max(...ps)-Math.min(...ps)>FAIR_SPREAD)continue;
    fairs.set(k,ps.reduce((s,x)=>s+x,0)/ps.length)}
  return fairs;
}
// Anytime touchdown: sportsbooks quote only Yes, so there's no Over/Under pair to
// remove the margin from. Estimate: the average Yes chance across 4+ books,
// less a typical 8% margin. Only for the 'td1' background test, never picks.
const TD_YES_MARGIN=1.08,FAIR_SPREAD=.1,TD_SPREAD=.12;
function tdYesFairs(boards,now=Date.now(),minBooks=4){
  const out=new Map();
  for(const board of boards){
    const gameId=board.eventID||`NFL--${board.id}`,by=new Map();
    for(const book of board.bookmakers||[]){if(EXCHANGES[book.key])continue;
      for(const m of book.markets||[]){if(m.key!=='player_anytime_td')continue;const updated=Date.parse(m.last_update||book.last_update||'');if(!Number.isFinite(updated)||now-updated>15*60000)continue;
        for(const o of m.outcomes||[]){const player=String(o.description||'').trim(),odds=BTGStats.number(o.price);if(!player||!/^yes$/i.test(String(o.name||''))||odds===null)continue;const g=by.get(player)||new Map();g.set(book.key,odds);by.set(player,g)}}}
    for(const [player,g] of by){if(g.size<minBooks)continue;const ys=[...g.values()].map(o=>1/recordDecimal(o));if(Math.max(...ys)-Math.min(...ys)>TD_SPREAD)continue;const p=[...g.values()].reduce((t,o)=>t+1/recordDecimal(o),0)/g.size/TD_YES_MARGIN;if(p>0&&p<1)out.set(`${gameId}|${normalizedName(player)}|Anytime Touchdown|0.5`,p)}
  }
  return out;
}
function exchangePropCandidates(board,exchangeBoard,fairs,now=Date.now(),kind='prop'){
  const gameId=board.eventID||`NFL--${board.id}`,kick=Date.parse(board.commence_time),best=new Map(),coverage={};
  if(!(kick>now+5*60000))return {picks:[],coverage};
  for(const ex of exchangeBoard.bookmakers||[]){
    const name=EXCHANGES[ex.key];if(!name)continue;const cov=coverage[ex.key]||={lines:0,matched:0};
    for(const m of ex.markets||[]){
      const label=recordLabels[m.key];if(!label)continue;
      for(const o of m.outcomes||[]){
        const {side,player,line,odds}=exchangeOutcome(o);
        if(!player||line===null||odds===null||!['over','under'].includes(side))continue;
        cov.lines++;const fair=fairs.get(`${gameId}|${normalizedName(player)}|${label}|${line}`);if(fair===undefined)continue;cov.matched++;
        const p=side==='over'?fair:1-fair,edge=100*(p-1/recordDecimal(odds));
        if(edge<1||edge>15||odds<-250||odds>300)continue;
        const row={kind,exchange:name,eventId:gameId,player,team:`${board.away_team} · @ ${board.home_team}`,market:label,side:side==='over'?'Over':'Under',line,odds,fair:p,edge,gameTime:new Date(kick).toISOString()};
        const k=`${gameId}|${normalizedName(player)}`;if(!best.has(k)||best.get(k).edge<edge)best.set(k,row);
      }
    }
  }
  return {picks:[...best.values()],coverage};
}
function exchangeGameCandidates(events,now=Date.now()){
  const best=new Map();
  for(const e of events){
    const kick=Date.parse(e.commence_time);if(!(kick>now+5*60000))continue;
    for(const [key,label] of Object.entries(GAME_MARKETS))for(const [line,list] of gameGroups(e,key,now)){
      const books=list.filter(p=>!EXCHANGES[p.key]);if(books.length<3)continue;
      const fair=books.reduce((s,p)=>{const x=1/recordDecimal(p.a),y=1/recordDecimal(p.c);return s+x/(x+y)},0)/books.length;
      for(const ex of list.filter(p=>EXCHANGES[p.key]))for(const side of ['a','c']){
        const odds=ex[side],prob=side==='a'?fair:1-fair,edge=100*(prob-1/recordDecimal(odds));
        if(edge<1||edge>12||odds<-250||odds>300)continue;
        const name=key==='totals'?(side==='a'?'Over':'Under'):(side==='a'?e.home_team:e.away_team);
        const row={kind:'game',exchange:EXCHANGES[ex.key],eventId:e.eventID||`NFL--${e.id}`,home:e.home_team,away:e.away_team,market:label,side:name,line:line==='ml'?null:key==='spreads'&&side==='c'?-line:line,odds,fair:prob,edge,gameTime:new Date(kick).toISOString()};
        const k=`${row.eventId}|${label}`;if(!best.has(k)||best.get(k).edge<edge)best.set(k,row);
      }
    }
  }
  return [...best.values()];
}
// Every exchange price on a game, compact: [exchangeKey, player, market, side, line, odds].
function exchangePriceList(exchangeBoard){
  const out=[];
  for(const ex of exchangeBoard.bookmakers||[]){if(!EXCHANGES[ex.key])continue;
    for(const m of ex.markets||[]){const label=recordLabels[m.key];if(!label)continue;
      for(const o of m.outcomes||[]){const {side,player,line,odds}=exchangeOutcome(o);
        if(player&&line!==null&&odds!==null&&['over','under'].includes(side))out.push([ex.key,player,label,side==='over'?'Over':'Under',line,odds])}}}
  return out;
}
const exchangeInsert=(env,p,stamp)=>env.DB.prepare('INSERT OR IGNORE INTO exchange_shadow (id,kind,exchange,event_id,home,away,player,team,market,side,line,odds,fair_pct,edge,game_time,logged_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(p.kind==='game'?`game|${p.eventId}|${p.market}`:`${p.kind}|${p.eventId}|${normalizedName(p.player)}`,p.kind,p.exchange,p.eventId,p.home||null,p.away||null,p.player||null,p.team||null,p.market,p.side,p.line,p.odds,+(100*p.fair).toFixed(2),+p.edge.toFixed(2),p.gameTime,stamp);
// Prediction-market picks (their own record). Estimated fee per exchange, in
// chance points on a price with chance p (0-1): Kalshi's taker fee is
// 0.07*p*(1-p) per contract; Polymarket is assumed the same; ProphetX 2% of
// net winnings; BetOpenly about 1 point; Novig none (pre-game). A price qualifies when its chance plus
// the fee is 1.5-12 points under the sportsbooks' fair chance.
// From each app's published fee pages (Oct 2026): Novig charges nothing on
// pre-game straight trades and 0.10 x P x (1 - P) per contract on parlays;
// ProphetX takes 2% of net winnings on straight trades and nothing on
// parlays. Kalshi and Polymarket: their standard taker schedule (about
// 7 x P x (1 - P) points). Points fees add to the price; win fees come off
// the winnings.
const PREDICTION_FEES={kalshi:p=>7*p*(1-p),polymarket:p=>7*p*(1-p),prophetx:()=>0,betopenly:()=>1,novig:()=>0};
const PREDICTION_WIN_FEES={prophetx:.02};
const PREDICTION_PARLAY_FEES={novig:p=>10*p*(1-p)};
// A parlay's after-fee price on its app, from its combined decimal price.
function predictionParlayNet(key,decimal){const p=1/decimal,fee=(PREDICTION_PARLAY_FEES[key]||(()=>0))(p)/100;return 1/Math.min(.99,p+fee)}
// Oct 18: 1 point and 2 a game made 23 prediction picks on one Sunday; now
// 1.5 points and one a game.
const PREDICTION_MIN=1.5,PREDICTION_MAX=12,PREDICTION_PER_GAME=1;
// Picks and parlay legs lock only inside 24 hours of kickoff: earlier prices
// beat the app's own closing price far less often (41% at 24-48 hours out vs
// 66% inside 6 hours in the price test).
const PREDICTION_LOCK=24*3600000;
function predictionNet(key,odds){const d=recordDecimal(odds),p=1/d,win=PREDICTION_WIN_FEES[key],cost=Math.min(.99,win?1/(1+(d-1)*(1-win)):p+(PREDICTION_FEES[key]||(()=>1))(p)/100);return {chance:100*p,netChance:100*cost,netOdds:recordAmerican(1/cost)}}
// Markets left out of prediction picks and parlays: pass completions went
// 0–6 on the apps (Oct 2026), and our sportsbook side never posts it.
const PREDICTION_PAUSED=new Set(['Pass Completions']);
// Higher bars by app and market: Novig receptions, our biggest prediction
// market, beat the kickoff price only 51% of the time (Oct 2026).
const PREDICTION_MIN_BY={'Novig|Receptions':2.5};
function predictionCandidates(board,exchangeBoard,fairs,now=Date.now(),opts={}){
  const gameId=board.eventID||`NFL--${board.id}`,kick=Date.parse(board.commence_time),best=new Map();
  if(!(kick>now+5*60000)||kick-now>PREDICTION_LOCK)return [];
  const min=opts.min??PREDICTION_MIN,max=opts.max??PREDICTION_MAX;
  for(const ex of exchangeBoard.bookmakers||[]){if(!EXCHANGES[ex.key])continue;
    for(const m of ex.markets||[]){const label=recordLabels[m.key];if(!label||PREDICTION_PAUSED.has(label))continue;
      for(const o of m.outcomes||[]){
        const {side,player,line,odds}=exchangeOutcome(o);
        if(!player||line===null||odds===null||!['over','under'].includes(side)||odds<-250||odds>300)continue;
        const fair=fairs.get(`${gameId}|${normalizedName(player)}|${label}|${line}`);if(fair===undefined)continue;
        const f=100*(side==='over'?fair:1-fair),n=predictionNet(ex.key,odds),edge=f-n.netChance;
        if(opts.min===undefined&&edge<(PREDICTION_MIN_BY[`${EXCHANGES[ex.key]}|${label}`]??min))continue;
        if(edge<min||(opts.max!==undefined?edge>=max:edge>max))continue;
        const row={exchange:EXCHANGES[ex.key],eventId:gameId,player,team:`${board.away_team} · @ ${board.home_team}`,market:label,side:side==='over'?'Over':'Under',line,odds,netOdds:n.netOdds,fair:f,edge,gameTime:new Date(kick).toISOString()};
        const k=opts.perExchange?`${ex.key}|${normalizedName(player)}`:normalizedName(player);if(!best.has(k)||best.get(k).edge<edge)best.set(k,row);
      }}}
  return [...best.values()].sort((a,b)=>b.edge-a.edge);
}
async function recordPredictionPicks(env,board,exchangeBoard,fairs,now=Date.now(),dirs=null){
  const gameId=board.eventID||`NFL--${board.id}`;
  const have=((await env.DB.prepare("SELECT player FROM prediction_picks WHERE event_id=? AND market<>'Anytime Touchdown'").bind(gameId).all()).results||[]).map(r=>normalizedName(r.player));
  dirs||=await pickDirections(env,now);
  // A full game still takes every top pick.
  const picks=[],stamp=new Date(now).toISOString();let n=have.length;
  for(const p of predictionCandidates(board,exchangeBoard,fairs,now).filter(p=>!have.includes(normalizedName(p.player))&&sameDirection(dirs,p.eventId,p.player,p.side)))if(n<PREDICTION_PER_GAME||p.edge>=TOP_PICK.pm){picks.push(p);n++}
  picks.forEach(p=>dirs.set(directionKey(p.eventId,p.player),p.side));
  return picks.map(p=>env.DB.prepare('INSERT OR IGNORE INTO prediction_picks (id,exchange,event_id,player,team,market,side,line,odds,net_odds,fair_pct,edge,game_time,posted_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(`pm|${gameId}|${normalizedName(p.player)}`,p.exchange,gameId,p.player,p.team,p.market,p.side,p.line,p.odds,p.netOdds,+p.fair.toFixed(2),+p.edge.toFixed(2),p.gameTime,stamp));
}
// Anytime TD prediction picks: "Yes" only, 3.5 points or more over our TD
// fair price after the app's fee, from 5+ sportsbooks, at most 1 a game and
// 2 a week, only in the last 100 minutes before kickoff (after inactives)
// and never on a player on the injury report (Questionable or worse). The fair price is an estimate (books quote only Yes; see
// tdYesFairs), hence the higher bar. app_settings td-picks = 'on' turns it on.
const TD_PICK={min:3.5,books:5,perWeek:2,lead:100*60000};
async function recordTdPredictionPicks(env,board,exchangeBoard,fairsTd,now=Date.now(),dirs=null){
  if(await appSetting(env,'td-picks')!=='on')return [];
  // Only once final inactives are out (about 90 minutes before kickoff).
  const kick=Date.parse(board.commence_time);if(!(kick-now<=TD_PICK.lead))return [];
  const gameId=board.eventID||`NFL--${board.id}`,injuries=await injuryMap(env).catch(()=>new Map());
  const listed=name=>Boolean(injuryClass(injuries.get(normalizedName(name))?.status));
  if(await env.DB.prepare("SELECT 1 AS n FROM prediction_picks WHERE event_id=? AND market='Anytime Touchdown'").bind(gameId).first())return [];
  const week=officialWeek(now),weekEnd=new Date(Date.parse(week+'T00:00:00Z')+7*86400000).toISOString();
  const used=Number((await env.DB.prepare("SELECT COUNT(*) AS n FROM prediction_picks WHERE market='Anytime Touchdown' AND game_time>=? AND game_time<?").bind(week,weekEnd).first())?.n||0);
  if(used>=TD_PICK.perWeek)return [];
  dirs||=await pickDirections(env,now);
  const p=predictionCandidates(board,exchangeBoard,fairsTd,now,{min:TD_PICK.min}).filter(p=>p.market==='Anytime Touchdown'&&p.side==='Over'&&!listed(p.player)&&sameDirection(dirs,p.eventId,p.player,p.side))[0];
  if(!p)return [];
  dirs.set(directionKey(p.eventId,p.player),p.side);
  return [env.DB.prepare('INSERT OR IGNORE INTO prediction_picks (id,exchange,event_id,player,team,market,side,line,odds,net_odds,fair_pct,edge,game_time,posted_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(`pm|${gameId}|${normalizedName(p.player)}|td`,p.exchange,gameId,p.player,p.team,p.market,p.side,p.line,p.odds,p.netOdds,+p.fair.toFixed(2),+p.edge.toFixed(2),p.gameTime,new Date(now).toISOString())];
}
async function gradePredictionPicks(env,now=Date.now(),limit=30){
  if(!env.DB||!env.BALLDONTLIE_API_KEY)return {graded:0};
  const rows=(await env.DB.prepare('SELECT * FROM prediction_picks WHERE result IS NULL AND game_time<? AND game_time>? ORDER BY game_time LIMIT ?').bind(new Date(now-3*3600000).toISOString(),new Date(now-14*86400000).toISOString(),limit).all()).results||[];
  const cache=new Map(),statements=[],stamp=new Date(now).toISOString();
  for(const r of rows){
    const nba=String(r.event_id||'').startsWith('NBA--'),record={sport:nba?'NBA':'NFL',player:r.player,team:r.team,gameTime:r.game_time,market:r.market,side:r.side,line:r.line};
    const stat=await recordPlayerStats(record,env,undefined,cache).catch(()=>null);
    // NBA: graded from a final box score; a player who didn't play is no action, as on the apps.
    if(nba){if(!stat||!stat.scoreboardFinal||stat.missingPlayerStats)continue;if(!BTGStats.nbaPlayed(stat)){statements.push(env.DB.prepare('UPDATE prediction_picks SET result=?,graded_at=? WHERE id=?').bind('void',stamp,r.id));continue}}
    else if(shadowVoid(stat,r.game_time,now)){statements.push(env.DB.prepare('UPDATE prediction_picks SET result=?,graded_at=? WHERE id=?').bind('void',stamp,r.id));continue}
    if(!stat||stat.missingPlayerStats||!(stat.scoreboardFinal||nflGameState(stat.game||{})==='final'))continue;
    const value=BTGStats.metric(record,stat).value,result=value===null?null:BTGStats.grade(r.side,r.line,value);
    if(result)statements.push(env.DB.prepare('UPDATE prediction_picks SET actual=?,result=?,graded_at=? WHERE id=?').bind(value,result,stamp,r.id));
  }
  if(statements.length)await env.DB.batch(statements);
  return {graded:statements.length,checked:rows.length};
}
const predictionPickText=r=>`${r.player} ${weeklyLegText(r)}: ${r.exchange} ${exchangePct(r.odds)}% (fair chance ${Math.round(r.fair_pct)}%)`;
// Alerts link to the newest pick: the site scrolls to it and highlights it.
const pickUrl=(id,extra='')=>id?`/?${extra}pick=${encodeURIComponent(id)}`:'/';
function predictionAlert(rows){return {title:rows.length===1?'📈 New prediction market pick':`📈 ${rows.length} new prediction market picks`,body:rows.map(predictionPickText).join('\n'),url:pickUrl(rows[0]?.id,'view=predictions&')}}
// Emails for prediction picks: people who ticked "Also email prediction
// market picks" get one email per batch of new ones.
async function sendPredictionEmails(env,now=Date.now()){
  if(!env.DB||!env.RESEND_API_KEY)return {sent:0,disabled:true};
  const last=await appSetting(env,'pm-email-for');
  const rows=(await env.DB.prepare('SELECT * FROM prediction_picks WHERE posted_at>? AND game_time>? ORDER BY game_time,posted_at').bind(last||new Date(now-3*3600000).toISOString(),new Date(now).toISOString()).all()).results||[];
  if(!rows.length)return {sent:0};
  const newest=rows.reduce((m,r)=>r.posted_at>m?r.posted_at:m,'');
  const claim=last==null?await env.DB.prepare('INSERT OR IGNORE INTO app_settings (key,value) VALUES (?,?)').bind('pm-email-for',newest).run():await env.DB.prepare('UPDATE app_settings SET value=? WHERE key=? AND value=?').bind(newest,'pm-email-for',last).run();
  if(!Number(claim?.meta?.changes??claim?.changes))return {sent:0,claimed:false};
  const people=await emailPeople(env,'predictions');
  if(!people.length)return {sent:0,picks:rows.length};
  const cell='padding:14px 16px;border:1px solid #dbe6f2;border-radius:12px;background:#f4f8fd;';
  const rowHtml=r=>`<tr><td style="${cell}"><div style="font-size:16px;font-weight:700;color:#10213d;">${weeklyEscape(r.player)} <span style="float:right;color:#4058c8;">${exchangePct(r.odds)}%</span></div><div style="margin-top:4px;font-size:15px;color:#10213d;">${weeklyEscape(weeklyLegText(r))} <span style="color:#5a6f8c;">on ${weeklyEscape(r.exchange)}</span></div><div style="margin-top:4px;font-size:13px;color:#5a6f8c;">Fair chance ${Math.round(r.fair_pct)}%, after fees · ${weeklyEscape(weeklyDay(r.game_time))}</div></td></tr><tr><td style="height:10px;"></td></tr>`;
  const subject=rows.length===1?`📈 New prediction pick: ${rows[0].player} ${weeklyLegText(rows[0])}`:`📈 ${rows.length} new prediction market picks`;
  const heading=rows.length===1?'A new prediction market pick just posted':`${rows.length} new prediction market picks just posted`;
  const lede='Priced as each market’s chance: our fair chance is higher, after the market’s fee. Own record, separate from our sportsbook picks. Where prediction markets are allowed changes often, and each app checks your location.';
  const from=env.EMAIL_FROM||EMAIL_ALERT_FROM,postal=String(env.EMAIL_POSTAL_ADDRESS||'').trim(),opts={subject,heading:weeklyEscape(heading),eyebrow:'PREDICTION MARKET PICK',lede,note:'Prices move. Check the price in the app before you trade.',rowsHtml:rows.map(rowHtml).join('')};
  const text=unsubscribe=>`${heading}:\n${lede}\n\n${rows.map(r=>`- ${predictionPickText(r)} · ${weeklyDay(r.game_time)}`).join('\n')}\n\nSee the picks: ${SITE_URL}/\n\nUnsubscribe: ${unsubscribe}\n18+ or 21+ depending on the app, where legal. Gambling problem? Call 1-800-GAMBLER.${postal?`\n${postal}`:''}\n`;
  let sent=0;
  for(let i=0;i<people.length;i+=100){
    const batch=people.slice(i,i+100).map(person=>{const unsubscribe=`${SITE_URL}/api/email-alerts/unsubscribe?token=${person.token}`;return {from,to:[person.email],reply_to:env.EMAIL_REPLY_TO||'support@betthisguy.com',subject,html:emailAlertHtml(rows,unsubscribe,postal,opts),text:text(unsubscribe),headers:{'List-Unsubscribe':`<${unsubscribe}>`,'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'}}});
    try{const response=await fetch('https://api.resend.com/emails/batch',{method:'POST',headers:{authorization:`Bearer ${env.RESEND_API_KEY}`,'content-type':'application/json'},body:JSON.stringify(batch),signal:AbortSignal.timeout(15000)});if(response.ok)sent+=batch.length;else console.warn('prediction_emails_failed',response.status)}
    catch(error){console.warn('prediction_emails_failed',error.message)}
  }
  return {sent,picks:rows.length};
}
// X: one post per prediction pick or parlay, with the same card graphic as
// official picks (purple pill, the market's chance in place of odds). If the
// graphic can't be made or uploaded, the text posts on its own.
// The app's X handle for our own pick posts (not result replies, so it's one
// tag per pick). app_settings x-tag:<App> overrides the handle; 'off' stops it.
const X_APP_TAGS={Novig:'@novig'};
async function xAppTag(env,name){const set=await appSetting(env,`x-tag:${name}`).catch(()=>null);if(set==='off')return name;const h=/^@\w{1,15}$/.test(String(set||''))?set:X_APP_TAGS[name];return h||name}
// Headshots for a parlay's first three legs (null where none is found).
async function xLegPhotos(legs,sport='NFL'){
  if(typeof playerHeadshot!=='function')return [];
  return Promise.all(legs.slice(0,3).map(l=>playerHeadshot(l.player,sport).then(s=>s?{type:s.type,b64:xBase64(s.bytes)}:null).catch(()=>null)));
}
async function xPredictionMedia(env,r,parlay,rec=null,result=null){
  if(typeof renderCardPng!=='function')return null;
  try{
    // NBA picks carry the NBA records (sportsbook and prediction apps), never NFL's.
    const sport=String(r.event_id||'').startsWith('NBA--')?'NBA':'NFL';
    if(!rec&&sport==='NBA')rec={sb:await nbaRecordSummary(env).catch(()=>({wins:0,losses:0})),pm:predictionRecord((await env.DB.prepare("SELECT result,odds,net_odds,close_odds FROM prediction_picks WHERE event_id LIKE 'NBA--%'").all().catch(()=>({results:[]}))).results||[]),pp:{wins:0,losses:0}};
    const records=xRecordRows(rec||await xRecords(env).catch(()=>null)),season='';
    const pill=label=>({label,fill:'#a78bfa',ink:'#1a0f3d',icon:'lock'}),shortWhen=weeklyDay(r.game_time).replace(/^(\w+), \w+ \d+, /,'$1 ').toUpperCase();
    if(parlay){let legs=[];try{legs=JSON.parse(r.legs_json)}catch{}
      return await xUploadImage(env,await renderCardPng(xCardSvg({sport:'NFL',parlay:true,legPhotos:await xLegPhotos(legs),pill:pill('PREDICTION PARLAY'),title:`${legs.length}-leg parlay`,legs:legs.map(l=>({text:`${l.player} · ${xShortLeg(weeklyLegText(l))}`,odds:`${exchangePct(l.netOdds??l.odds)}%`})),odds:`${exchangePct(r.odds)}%`,oddsColor:'#c4b5fd',oddsNote:`on ${r.exchange} · $25`,season,records,footLeft:shortWhen,cta:'Prediction picks, free'})))}
    const first={team:r.team},[team,shot]=await Promise.all([typeof playerTeamOf==='function'?playerTeamOf(env,sport,r.player,r.team).catch(()=>null):null,typeof playerHeadshot==='function'?playerHeadshot(r.player,sport).catch(()=>null):null]);
    const look=result?XRESULT[result]:null,won=result==='won'?100*(recordDecimal(r.net_odds||r.odds)-1):result==='lost'?-100:0;
    if(!shot)await setAppSetting(env,'x-photo-miss',`${new Date().toISOString()} ${r.player}`).catch(()=>{});
    return await xUploadImage(env,await renderCardPng(xCardSvg({sport,team,photo:shot?{type:shot.type,b64:xBase64(shot.bytes)}:null,pill:look||pill(sport==='NBA'?'NBA PREDICTION PICK':'PREDICTION PICK'),title:r.player,bet:weeklyLegText(r).replace(/^./,ch=>ch.toUpperCase()),when:[xMatchup(first.team),weeklyDay(r.game_time)].filter(Boolean).join(' · '),odds:`${exchangePct(r.odds)}%`,oddsColor:look?look.odds:'#c4b5fd',oddsNote:look?[r.actual!=null?`Final: ${r.actual}`:'',result==='push'||result==='void'?'stake back':weeklyMoney(won)].filter(Boolean).join(' · '):`on ${r.exchange} · fair ${Math.round(r.fair_pct)}%`,season,records,footLeft:[team?.full?xNick(team.full).toUpperCase():'',shortWhen].filter(Boolean).join(' · '),cta:look?'See every pick graded':'Prediction picks, free'})))
  }catch(error){await setAppSetting(env,'x-last-error',`${new Date().toISOString()} prediction graphic: ${error.message}`).catch(()=>{});return null}
}
async function postPredictionPicksToX(env,now=Date.now()){
  if(!env.DB||!xReady(env))return {posted:0,disabled:true};
  // Prediction parlays go on the pick cards, not posts of their own.
  const rows=(await env.DB.prepare('SELECT * FROM prediction_picks WHERE event_id NOT LIKE \'NBA--%\' AND posted_at>? AND game_time>? ORDER BY posted_at LIMIT 40').bind(new Date(now-24*3600000).toISOString(),new Date(now).toISOString()).all()).results||[];
  const today=await xHeadCount(env,'xpm:pm|',now);
  for(const r of rows){
    if(!(Number(r.edge)>=X_HEAD.pm.edge)||(today>=X_HEAD.pm.day&&!(Number(r.edge)>=TOP_PICK.pm)))continue;
    const key=`xpm:${r.id}`;if(!(await xClaimable(env,key,now)))continue;
    if(!(await xClaim(env,key,now)))continue;
    const rec=await xRecords(env).catch(()=>null);
    // A partner code (its X code if it has one) rides along on that app's picks.
    const partner=(await partnerOffers(env).catch(()=>({})))[r.exchange],promo=partner?`New to ${r.exchange}? Code ${partner.xCode||partner.code}${partner.offer?`: ${partner.offer}`:''}. Terms apply.`:'';
    const text=xPostText({head:`${Number(r.edge)>=TOP_PICK.pm?'⭐ Top pick':'🔒 Official pick'} · Prediction app`,lines:[`${r.player}${await xQuestionable(env,r.player)} ${weeklyLegText(r)}`,[`${exchangePct(r.odds)}% on ${await xAppTag(env,r.exchange)} (fair ${Math.round(r.fair_pct)}%)`,xMatchup(r.team),xShortWhen(r.game_time)].filter(Boolean).join(' · ')],extra:promo,rec,age:'18+/21+ by app'});
    const mediaId=await xPredictionMedia(env,r,false,rec);
    try{const sent=await xPost(env,text,mediaId);await xDone(env,key,now);if(sent?.data?.id)await setAppSetting(env,`xid:${r.id}`,String(sent.data.id)).catch(()=>{});await setAppSetting(env,'x-last-post',`${new Date(now).toISOString()} prediction ${mediaId?'graphic':'text'} ${r.id} ${sent?.data?.id||''}`).catch(()=>{});return {posted:1,graphic:Boolean(mediaId)}}
    catch(error){console.warn('x_prediction_failed',error.message);await env.DB.prepare('DELETE FROM app_settings WHERE key=?').bind(key).run().catch(()=>{});await setAppSetting(env,'x-last-error',`${new Date(now).toISOString()} ${error.message}`).catch(()=>{});return {posted:0,error:error.message}}
  }
  return {posted:0};
}
// Prediction parlays: legs from the next tier (0.5 to just under 1 point after
// fees), never a player who is a prediction pick, all legs on one app. Same
// sizes and same-game rules as sportsbook parlays; priced from each leg's
// after-fee price (the same-game cut when two legs share a game); graded at a
// quarter unit. Each app's own combo price may differ, so posts say the
// price to take it at.
// At most 3 a week (2 short, 1 mid; no long shots), down from 9.
const PM_PARLAY_TIERS=[['long',4,5,2501,15000,0],['mid',3,4,1000,2500,1],['short',2,3,100,999,2]];
// At most this many prediction parlays per game day (Eastern), on top of the weekly tier caps.
const PM_PARLAYS_PER_DAY=2;
// Prediction parlays go on ProphetX: no parlay fee (Novig charges one) and
// the softest prices in our log.
const PM_PARLAY_APPS=new Set(['ProphetX']);
const pmParlayDay=times=>{const t=times.map(x=>Date.parse(x)).filter(Number.isFinite);return t.length?new Date(Math.max(...t)-4*3600000).toISOString().slice(0,10):null};
function predictionParlayPlan(pool,existing,week,now=Date.now()){
  const prior=existing.map(r=>{try{return JSON.parse(r.legs_json).map(l=>`${l.eventId}|${normalizedName(l.player)}`)}catch{return []}});
  const exposure=new Map();prior.flat().forEach(k=>exposure.set(k,(exposure.get(k)||0)+1));
  const counts=Object.fromEntries(PM_PARLAY_TIERS.map(([t])=>[t,existing.filter(r=>r.tier===t).length])),plan=[];
  const key=l=>`${l.eventId}|${normalizedName(l.player)}`;
  const sides=new Map(),perGame=new Map(),perDay=new Map();
  existing.forEach(r=>{let legs=[];try{legs=JSON.parse(r.legs_json)}catch{}const d=pmParlayDay([r.game_time,...legs.map(l=>l.gameTime)]);if(d)perDay.set(d,(perDay.get(d)||0)+1);legs.forEach(l=>sides.set(sideKey(l.eventId,l.player,l.market),l.side));new Set(legs.map(l=>l.eventId)).forEach(g=>perGame.set(g,(perGame.get(g)||0)+1))});
  for(const exName of [...new Set(pool.map(p=>p.exchange))].filter(x=>PM_PARLAY_APPS.has(x))){
    const legsOn=pool.filter(p=>p.exchange===exName&&Date.parse(p.gameTime)>now+5*60000);if(legsOn.length<2)continue;
    for(const [tier,min,max,low,high,cap] of PM_PARLAY_TIERS){
      for(let attempt=0;attempt<300&&counts[tier]<cap;attempt++){
        const size=min+attempt%(max-min+1),legs=[];
        const sorted=[...legsOn].sort((a,b)=>(exposure.get(key(a))||0)-(exposure.get(key(b))||0)||b.edge-a.edge);
        for(let j=0;j<sorted.length&&legs.length<size;j++){
          const p=sorted[(j+Math.floor(attempt/(max-min+1)))%sorted.length],inGame=legs.filter(l=>l.eventId===p.eventId);
          if((exposure.get(key(p))||0)>=PARLAYS_PER_PLAYER||legs.some(l=>key(l)===key(p))||inGame.length>=2||(inGame.length&&!sgpOk(inGame[0],p)))continue;
          if(prior.some(keys=>keys.includes(key(p))&&legs.some(l=>keys.includes(key(l)))))continue;
          const was=sides.get(sideKey(p.eventId,p.player,p.market));if((was&&was!==p.side)||(perGame.get(p.eventId)||0)>=PARLAYS_PER_GAME)continue;
          legs.push(p);
        }
        if(legs.length!==size)continue;
        const exKey=Object.keys(EXCHANGES).find(k=>EXCHANGES[k]===exName),priced=legs.map(l=>({gameId:l.eventId,odds:l.netOdds})),odds=recordAmerican(predictionParlayNet(exKey,parlayDecimal(priced))),keys=legs.map(key);
        if(odds<low||odds>high||prior.some(p=>p.filter(k=>keys.includes(k)).length>1))continue;
        const day=pmParlayDay(legs.map(l=>l.gameTime));if((perDay.get(day)||0)>=PM_PARLAYS_PER_DAY)continue;
        const same=new Set(legs.map(l=>l.eventId)).size<legs.length;
        legs.forEach(l=>sides.set(sideKey(l.eventId,l.player,l.market),l.side));new Set(legs.map(l=>l.eventId)).forEach(g=>perGame.set(g,(perGame.get(g)||0)+1));
        perDay.set(day,(perDay.get(day)||0)+1);plan.push({tier,exchange:exName,odds,legs:legs.map(l=>({...l,sameGame:same&&legs.some(o=>o!==l&&o.eventId===l.eventId)}))});counts[tier]++;prior.push(keys);keys.forEach(k=>exposure.set(k,(exposure.get(k)||0)+1));
      }
    }
  }
  return plan;
}
async function recordPredictionParlays(env,pool,now=Date.now()){
  if(!env.DB||pool.length<2)return {posted:0};
  const week=officialWeek(now),existing=(await env.DB.prepare('SELECT tier,legs_json,game_time FROM prediction_parlays WHERE week=?').bind(week).all()).results||[];
  const picks=new Set((((await env.DB.prepare('SELECT event_id,player FROM prediction_picks WHERE game_time>?').bind(new Date(now).toISOString()).all()).results)||[]).map(r=>`${r.event_id}|${normalizedName(r.player)}`));
  const dirs=await pickDirections(env,now);
  const teams=await playerTeams(env),plan=predictionParlayPlan(withTeams(pool.filter(p=>!picks.has(`${p.eventId}|${normalizedName(p.player)}`)&&sameDirection(dirs,p.eventId,p.player,p.side)),teams),existing,week,now),stamp=new Date(now).toISOString();
  const statements=[];
  for(const p of plan){const legs=p.legs.map(({team,...l})=>({...l,team}));const id=`pmp|${week}|${p.tier}|${p.exchange}|${p.legs.map(l=>`${l.eventId}:${normalizedName(l.player)}:${l.market}`).sort().join(',')}`;
    statements.push(env.DB.prepare('INSERT OR IGNORE INTO prediction_parlays (id,week,tier,exchange,legs_json,odds,game_time,posted_at) VALUES (?,?,?,?,?,?,?,?)').bind(id.slice(0,480),week,p.tier,p.exchange,JSON.stringify(legs),p.odds,p.legs.map(l=>l.gameTime).sort().at(-1),stamp))}
  if(statements.length)await env.DB.batch(statements);
  return {posted:statements.length};
}
// Grade each leg from box scores; a lost leg loses the parlay once its game is final.
async function gradePredictionParlays(env,now=Date.now(),limit=15){
  if(!env.DB||!env.BALLDONTLIE_API_KEY)return {graded:0};
  const rows=(await env.DB.prepare('SELECT * FROM prediction_parlays WHERE result IS NULL AND posted_at<? ORDER BY game_time LIMIT ?').bind(new Date(now).toISOString(),limit).all()).results||[];
  const cache=new Map(),statements=[],stamp=new Date(now).toISOString();let graded=0;
  for(const r of rows){
    let legs;try{legs=JSON.parse(r.legs_json)}catch{continue}
    let changed=false;
    for(const l of legs){
      if(l.result||Date.parse(l.gameTime)>now-4*3600000)continue;
      const record={sport:'NFL',player:l.player,team:l.team,gameTime:l.gameTime,market:l.market,side:l.side,line:l.line};
      const stat=await recordPlayerStats(record,env,undefined,cache).catch(()=>null);
      if(shadowVoid(stat,l.gameTime,now)){l.result='push';changed=true;continue}
      if(!stat||stat.missingPlayerStats||!(stat.scoreboardFinal||nflGameState(stat.game||{})==='final'))continue;
      const value=BTGStats.metric(record,stat).value,res=value===null?null:BTGStats.grade(l.side,l.line,value);
      if(res){l.result=res;l.actual=value;changed=true}
    }
    const result=legs.some(l=>l.result==='lost')?'lost':legs.every(l=>l.result)?(legs.every(l=>l.result==='push')?'push':'won'):null;
    if(changed||result)statements.push(env.DB.prepare('UPDATE prediction_parlays SET legs_json=?,result=?,graded_at=? WHERE id=?').bind(JSON.stringify(legs),result,result?stamp:null,r.id));
    if(result)graded++;
  }
  if(statements.length)await env.DB.batch(statements);
  return {graded,checked:rows.length};
}
// Parlay record at a quarter unit ($25): pushed legs drop out of the price.
function predictionParlayPay(r){
  if(r.result==='lost')return -25;if(r.result!=='won')return 0;
  let legs=[];try{legs=JSON.parse(r.legs_json)}catch{}
  const exKey=Object.keys(EXCHANGES).find(k=>EXCHANGES[k]===r.exchange),live=legs.filter(l=>l.result!=='push'),d=live.length&&live.length<legs.length?predictionParlayNet(exKey,parlayDecimal(live.map(l=>({gameId:l.eventId,odds:l.netOdds??l.odds})))):recordDecimal(Number(r.odds));
  return 25*(d-1);
}
function predictionParlayRecord(rows){const g=rows.filter(r=>['won','lost','push'].includes(r.result));return {wins:g.filter(r=>r.result==='won').length,losses:g.filter(r=>r.result==='lost').length,pushes:g.filter(r=>r.result==='push').length,profit:Math.round(g.reduce((s,r)=>s+predictionParlayPay(r),0)),pending:rows.length-g.length}}
const predictionParlayText=r=>{let legs=[];try{legs=JSON.parse(r.legs_json)}catch{}return `${legs.length}-leg parlay on ${r.exchange} at ${exchangePct(r.odds)}%: ${legs.map(l=>`${l.player} ${weeklyLegText(l)}`).join(' + ')}`};
// Record for prediction picks at $100 a pick, after fees (net price).
function predictionRecord(rows){
  const graded=rows.filter(r=>['won','lost','push'].includes(r.result)),dec=o=>recordDecimal(Number(o));
  const closes=graded.filter(r=>r.close_odds!=null);
  return {wins:graded.filter(r=>r.result==='won').length,losses:graded.filter(r=>r.result==='lost').length,pushes:graded.filter(r=>r.result==='push').length,
    profit:Math.round(graded.reduce((s,r)=>s+(r.result==='won'?100*(dec(r.net_odds)-1):r.result==='lost'?-100:0),0)),
    beat:closes.filter(r=>dec(r.odds)>dec(r.close_odds)).length,tracked:closes.length,pending:rows.filter(r=>!r.result).length};
}
// Player props on exchanges: one us_ex call per game (10 credits) every 30
// minutes within 48 hours of kickoff, and every 2 hours (at most 6 games a
// run) from 48 to 96 hours out, so the prediction board fills earlier in
// the week without blowing a run's request limit.
const EXCHANGE_AHEAD=96*3600000;
// Owner check: app_settings exchange-market-probe (any value) makes the next
// run ask the apps for kicker, interception and defense props on the next
// game (one call), saving which apps list which to exchange-market-probe-result.
const EXCHANGE_PROBE_MARKETS=['player_field_goals','player_kicking_points','player_pats','player_pass_interceptions','player_sacks','player_tackles_assists','player_reception_longest','player_rush_reception_yds','player_pass_attempts'];
async function exchangeMarketProbe(env,boards,now=Date.now()){
  if(!(await appSetting(env,'exchange-market-probe').catch(()=>null)))return null;
  await env.DB.prepare("DELETE FROM app_settings WHERE key='exchange-market-probe'").run();
  const next=[...boards].filter(b=>Date.parse(b.commence_time)>now+30*60000).sort((a,b)=>Date.parse(a.commence_time)-Date.parse(b.commence_time))[0];
  if(!next)return setAppSetting(env,'exchange-market-probe-result',JSON.stringify({at:new Date(now).toISOString(),error:'no game'}));
  const q=new URLSearchParams({apiKey:env.THE_ODDS_API_KEY,regions:'us_ex',markets:EXCHANGE_PROBE_MARKETS.join(','),oddsFormat:'american',dateFormat:'iso'});
  const r=await fetch(`${API_BASE}/sports/${SPORTS[0].key}/events/${next.id}/odds?${q}`,{headers:{accept:'application/json'},signal:AbortSignal.timeout(15000)}).catch(error=>({ok:false,status:error.message}));
  const out={at:new Date(now).toISOString(),game:`${next.away_team} @ ${next.home_team}`,status:r.status,apps:{}};
  if(r.ok){const d=await r.json();for(const b of d.bookmakers||[])for(const m of b.markets||[]){const a=out.apps[b.key]||={};a[m.key]=(m.outcomes||[]).length}}
  await setAppSetting(env,'exchange-market-probe-result',JSON.stringify(out));return out;
}
async function recordExchangeProps(env,boards,now=Date.now()){
  if(!env.DB||!env.THE_ODDS_API_KEY)return {};
  await exchangeMarketProbe(env,boards,now).catch(()=>null);
  const last=Number(await appSetting(env,'exchange-props-at')||0);
  if(now-last<29*60000)return {skipped:true};
  await setAppSetting(env,'exchange-props-at',String(now));
  const fairs=sportsbookFairs(boards,now),stamp=new Date(now).toISOString(),statements=[],coverage={};let picks=0,games=0;const pmPool=[];
  // Two-book test (kind 'prop2', not shown anywhere): lines only two sportsbooks price.
  const fairs2=new Map([...sportsbookFairs(boards,now,2)].filter(([k])=>!fairs.has(k)));let picks2=0;
  const fairsTd=new Map([...tdYesFairs(boards,now)].filter(([k])=>!fairs.has(k)&&!fairs2.has(k)));
  const fairsTd5=tdYesFairs(boards,now,TD_PICK.books);
  const fetchedAt=new Map(((await env.DB.prepare('SELECT event_id,updated_at FROM exchange_prices WHERE game_time>?').bind(stamp).all().catch(()=>({results:[]}))).results||[]).map(r=>[r.event_id,Date.parse(r.updated_at)]));
  let far=0;const dirs=await pickDirections(env,now).catch(()=>new Map());
  for(const board of boards){
    const kick=Date.parse(board.commence_time);if(!(kick>now+5*60000)||kick-now>EXCHANGE_AHEAD)continue;
    if(kick-now>48*3600000){const at=fetchedAt.get(board.eventID||`NFL--${board.id}`);if(now-at<2*3600000-60000||far>=6)continue;far++}
    let ex;try{ex=await fetchExchangeOdds(board.id,env.THE_ODDS_API_KEY)}catch{continue}
    games++;const out=exchangePropCandidates(board,ex,fairs,now);
    statements.push(...await recordPredictionPicks(env,board,ex,fairs,now,dirs).catch(()=>[]));
    statements.push(...await recordTdPredictionPicks(env,board,ex,fairsTd5,now,dirs).catch(()=>[]));
    pmPool.push(...predictionCandidates(board,ex,fairs,now,{min:.5,max:1,perExchange:true}));
    statements.push(env.DB.prepare('INSERT OR REPLACE INTO exchange_prices (event_id,game_time,prices_json,updated_at) VALUES (?,?,?,?)').bind(board.eventID||`NFL--${board.id}`,new Date(kick).toISOString(),JSON.stringify(exchangePriceList(ex)),stamp));
    for(const [k,c] of Object.entries(out.coverage)){const t=coverage[k]||={lines:0,matched:0};t.lines+=c.lines;t.matched+=c.matched}
    for(const p of out.picks){statements.push(exchangeInsert(env,p,stamp));picks++}
    const two=exchangePropCandidates(board,ex,fairs2,now,'prop2');for(const p of two.picks){statements.push(exchangeInsert(env,p,stamp));picks2++}
    for(const [k,c] of Object.entries(two.coverage)){const t=coverage[k]||={lines:0,matched:0};t.matched2=(t.matched2||0)+c.matched}
    const td=exchangePropCandidates(board,ex,fairsTd,now,'td1');for(const p of td.picks){statements.push(exchangeInsert(env,p,stamp));picks2++}
    for(const [k,c] of Object.entries(td.coverage)){const t=coverage[k]||={lines:0,matched:0};t.matchedTd=(t.matchedTd||0)+c.matched}
    // Closing price at the same exchange, line and side.
    const open=(await env.DB.prepare("SELECT id,exchange,player,market,side,line FROM exchange_shadow WHERE kind IN ('prop','prop2','td1') AND event_id=? AND game_time>?").bind(board.eventID||`NFL--${board.id}`,stamp).all()).results||[];
    for(const r of open){const key=Object.keys(EXCHANGES).find(k=>EXCHANGES[k]===r.exchange);let price=null;
      for(const b of ex.bookmakers||[])if(b.key===key)for(const m of b.markets||[])if(recordLabels[m.key]===r.market)for(const o of m.outcomes||[])if(String(o.description||'').trim()===r.player&&exchangeOutcome(o).side===r.side.toLowerCase()&&exchangeOutcome(o).line===Number(r.line))price=BTGStats.number(o.price);
      if(price!==null)statements.push(env.DB.prepare('UPDATE exchange_shadow SET close_odds=?,close_at=? WHERE id=?').bind(price,stamp,r.id))}
    // Prediction picks: the same exchange's latest price, until kickoff.
    const mine=(await env.DB.prepare('SELECT id,exchange,player,market,side,line FROM prediction_picks WHERE event_id=? AND game_time>?').bind(board.eventID||`NFL--${board.id}`,stamp).all()).results||[];
    for(const r of mine){const key=Object.keys(EXCHANGES).find(k=>EXCHANGES[k]===r.exchange);let price=null;
      for(const b of ex.bookmakers||[])if(b.key===key)for(const m of b.markets||[])if(recordLabels[m.key]===r.market)for(const o of m.outcomes||[])if(normalizedName(o.description)===normalizedName(r.player)&&exchangeOutcome(o).side===r.side.toLowerCase()&&exchangeOutcome(o).line===Number(r.line))price=BTGStats.number(o.price);
      if(price!==null)statements.push(env.DB.prepare('UPDATE prediction_picks SET close_odds=?,close_at=? WHERE id=?').bind(price,stamp,r.id))}
  }
  if(statements.length)await env.DB.batch(statements);
  // Prediction parlays, after this run's prediction picks are saved (their players are left out).
  const pmParlays=await recordPredictionParlays(env,pmPool,now).catch(error=>({error:error.message}));
  await setAppSetting(env,'exchange-coverage',JSON.stringify({at:stamp,games,coverage})).catch(()=>{});
  const moves=await priceMoveAlerts(env,new Map([...fairs,...fairsTd5]),now).catch(error=>({error:error.message}));
  return {games,logged:picks,logged2:picks2,pmParlays,moves};
}
// Heads-up to the owner's phone when sportsbooks move hard against an open
// pick before kickoff (news): our fair chance down PRICE_MOVE points or more
// from when it posted. Once per pick. The pick stays on the record either
// way. ntfy topic: the Worker secret ALERT_NTFY_TOPIC (kept private).
const PRICE_MOVE=10;
async function priceMoveAlerts(env,fairs,now=Date.now()){
  if(!env.DB)return {sent:0};
  const stamp=new Date(now).toISOString(),later=new Date(now+36*3600000).toISOString(),found=[];
  const chance=(f,side)=>100*(String(side).toLowerCase()==='under'?1-f:f);
  const pm=(await env.DB.prepare('SELECT id,exchange,event_id,player,market,side,line,odds,fair_pct,game_time FROM prediction_picks WHERE result IS NULL AND game_time>? AND game_time<?').bind(stamp,later).all().catch(()=>({results:[]}))).results||[];
  for(const r of pm){const f=fairs.get(`${r.event_id}|${normalizedName(r.player)}|${r.market}|${r.line}`);if(f===undefined)continue;
    const was=Number(r.fair_pct),nowPct=chance(f,r.side);if(was-nowPct>=PRICE_MOVE)found.push({id:r.id,text:`${r.player} ${weeklyLegText(r)} (${r.exchange} ${exchangePct(r.odds)}%)`,was,nowPct,game:r.game_time})}
  const sb=(await env.DB.prepare("SELECT id,player,market,side,line,odds,game_time,legs_json FROM public_recommendations WHERE id LIKE 'official|%' AND kind='prop' AND status='pending' AND game_time>? AND game_time<?").bind(stamp,later).all().catch(()=>({results:[]}))).results||[];
  for(const r of sb){const l=recordLegs(r)[0]||{},d=recordDecimal(r.odds),edge=Number(l.edge);if(!l.gameId||!d||!Number.isFinite(edge))continue;
    const f=fairs.get(`${l.gameId}|${normalizedName(r.player)}|${r.market}|${r.line}`);if(f===undefined)continue;
    const was=100/d+edge,nowPct=chance(f,r.side);if(was-nowPct>=PRICE_MOVE)found.push({id:r.id,text:`${r.player} ${weeklyLegText(r)} (${weeklyOdds(r.odds)}${l.book?` at ${l.book}`:''})`,was,nowPct,game:r.game_time})}
  let sent=0;const log=[];
  for(const a of found){
    const claim=await env.DB.prepare('INSERT OR IGNORE INTO app_settings (key,value) VALUES (?,?)').bind(`move-alert:${a.id}`,stamp).run();if(!Number(claim?.meta?.changes??claim?.changes))continue;
    const kick=new Date(a.game).toLocaleString('en-US',{timeZone:'America/Los_Angeles',weekday:'short',hour:'numeric',minute:'2-digit'});
    const body=`${a.text}: the sportsbooks now give it ${Math.round(a.nowPct)}%, down from ${Math.round(a.was)}% when it posted. Kickoff ${kick} PT. Check the news; the pick stays on the record.`;
    log.push({at:stamp,id:a.id,body});
    if(env.ALERT_NTFY_TOPIC){const r=await fetch('https://ntfy.sh/'+encodeURIComponent(env.ALERT_NTFY_TOPIC),{method:'POST',headers:{Title:'Bet This Guy: price moved against a pick',Priority:'high',Tags:'warning'},body,signal:AbortSignal.timeout(10000)}).catch(()=>null);if(r?.ok)sent++}
  }
  if(log.length){let old=[];try{old=JSON.parse(await appSetting(env,'move-alerts')||'[]')}catch{}await setAppSetting(env,'move-alerts',JSON.stringify([...log,...old].slice(0,30)))}
  return {found:found.length,sent};
}
async function gradeExchangeShadow(env,now=Date.now(),limit=30){
  if(!env.DB||!env.BALLDONTLIE_API_KEY)return {graded:0};
  const rows=(await env.DB.prepare("SELECT * FROM exchange_shadow WHERE result IS NULL AND game_time<? AND (game_time>? OR (kind='td1' AND game_time>?)) ORDER BY game_time LIMIT ?").bind(new Date(now-4*3600000).toISOString(),new Date(now-14*86400000).toISOString(),new Date(now-45*86400000).toISOString(),limit).all()).results||[];
  if(!rows.length)return {graded:0};
  const statements=[],stamp=new Date(now).toISOString(),cache=new Map(),tdCache=new Map();
  const games=rows.some(r=>r.kind==='game')?await finalGames(rows,env):[];
  for(const r of rows){
    if(r.kind==='game'){const g=games.find(g=>normalizedName(g.home_team?.full_name)===normalizedName(r.home)&&normalizedName(g.visitor_team?.full_name)===normalizedName(r.away));
      if(!g||nflGameState(g)!=='final')continue;const hs=Number(g.home_team_score),as=Number(g.visitor_team_score);if(!Number.isFinite(hs)||!Number.isFinite(as))continue;
      statements.push(env.DB.prepare('UPDATE exchange_shadow SET home_score=?,away_score=?,result=?,graded_at=? WHERE id=?').bind(hs,as,gameLineResult(r,hs,as),stamp,r.id));continue}
    const record={sport:'NFL',player:r.player,team:r.team,gameTime:r.game_time,market:r.market,side:r.side,line:r.line};
    // Anytime TD: the box score leaves 0 TDs blank, so use the official grader (play-by-play).
    if(r.market==='Anytime Touchdown'&&typeof gradePublicRecord==='function'){const rec={kind:'prop',sport:'NFL',player:r.player,market:r.market,side:r.side,line:r.line,odds:r.odds,game_time:r.game_time,legs_json:JSON.stringify([{...record,odds:r.odds}])};
      const res=await gradePublicRecord(rec,env,tdCache).catch(()=>null);if(['won','lost','push'].includes(res))statements.push(env.DB.prepare('UPDATE exchange_shadow SET actual=?,result=?,graded_at=? WHERE id=?').bind(rec.gradedLegs?.[0]?.actualValue??null,res,stamp,r.id));continue}
    const stat=await recordPlayerStats(record,env,undefined,cache).catch(()=>null);
    if(shadowVoid(stat,r.game_time,now)){statements.push(env.DB.prepare('UPDATE exchange_shadow SET result=?,graded_at=? WHERE id=?').bind('void',stamp,r.id));continue}
    if(!stat||stat.missingPlayerStats||!(stat.scoreboardFinal||nflGameState(stat.game||{})==='final'))continue;
    const value=BTGStats.metric(record,stat).value,result=value===null?null:BTGStats.grade(r.side,r.line,value);
    if(result)statements.push(env.DB.prepare('UPDATE exchange_shadow SET actual=?,result=?,graded_at=? WHERE id=?').bind(value,result,stamp,r.id));
  }
  if(statements.length)await env.DB.batch(statements);
  return {graded:statements.length,checked:rows.length};
}
// Where a visitor can bet, from Cloudflare's request.cf (never stored), or a
// state the visitor picked. Checked Oct 12, 2026; these change often, and each
// app checks location itself, so the site always says to confirm in the app.
// Online sportsbook states. FanDuel Predicts sports contracts: the 18 states
// without online sportsbooks; DraftKings Predictions: the same minus Delaware.
const SPORTSBOOK_STATES=new Set(['AZ','AR','CO','CT','DC','DE','FL','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MO','NV','NH','NJ','NY','NC','OH','OR','PA','RI','TN','VT','VA','WV','WY']);
const PREDICTION_SPORTS_STATES=new Set(['AK','AL','CA','DE','FL','GA','HI','ID','MN','ND','NE','NM','OK','RI','SC','SD','TX','UT']);
const DK_PREDICTION_EXCLUDED=new Set(['DE']);
// Exchanges blocked for sports: Nevada court orders, Connecticut cease-and-desist
// (Novig, ProphetX), and Novig's own excluded states.
const EXCHANGE_EXCLUDED={kalshi:['NV'],polymarket:['NV'],novig:['AZ','CT','MI','NV'],prophetx:['CT','NV'],betopenly:['NV']};
const US_STATES={AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',DC:'Washington, DC',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming'};
function visitorState(request){
  let pick='';try{pick=String(new URL(request.url).searchParams.get('state')||'').toUpperCase()}catch{}
  if(US_STATES[pick])return pick;
  const state=String(request.cf?.regionCode||'').toUpperCase();
  return request.cf?.country==='US'&&US_STATES[state]?state:null;
}
function bettingOptionsFor(state){
  if(!US_STATES[state])return {state:null,mode:'unknown'};
  const sportsbooks=SPORTSBOOK_STATES.has(state),keys=Object.keys(EXCHANGES).filter(k=>!EXCHANGE_EXCLUDED[k].includes(state));
  return {state,stateName:US_STATES[state],mode:sportsbooks?'sportsbooks':'predictions',sportsbooks,
    predictions:{draftkings:PREDICTION_SPORTS_STATES.has(state)&&!DK_PREDICTION_EXCLUDED.has(state),fanduel:PREDICTION_SPORTS_STATES.has(state)},
    exchangeKeys:keys,exchanges:keys.map(k=>EXCHANGES[k])};
}
function bettingOptions(request){return bettingOptionsFor(visitorState(request))}
// The prediction-market prices on each official prop when it locked: copied
// onto its first leg (exchanges, best first, and exchangesAt, when those
// prices were checked) from the saved exchange prices. A pick that locks
// before its game has exchange prices (they're saved from 96 hours out) gets
// them the first time they're saved; exchangesAt says when. Set once, never
// updated, so the results can later show what prediction markets paid.
async function stampExchangePrices(env,now=Date.now()){
  if(!env.DB)return {stamped:0};
  const rows=((await env.DB.prepare("SELECT id,game_id,player,market,side,line,legs_json FROM public_recommendations WHERE source='market-verified-v2' AND id LIKE 'official|%' AND kind='prop' AND game_time>? AND legs_json NOT LIKE '%\"exchangesAt\"%'").bind(new Date(now).toISOString()).all()).results)||[];
  if(!rows.length)return {stamped:0};
  const games=[...new Set(rows.map(r=>r.game_id))],prices=new Map();
  for(const g of games){const r=await env.DB.prepare('SELECT prices_json,updated_at FROM exchange_prices WHERE event_id=?').bind(g).first();if(r&&now-Date.parse(r.updated_at)<45*60000){try{prices.set(g,{at:r.updated_at,list:JSON.parse(r.prices_json)})}catch{}}}
  const statements=[];
  for(const r of rows){
    const g=prices.get(r.game_id);if(!g)continue;
    let legs;try{legs=JSON.parse(r.legs_json)}catch{continue}if(!Array.isArray(legs)||!legs[0])continue;
    legs[0].exchanges=g.list.filter(p=>normalizedName(p[1])===normalizedName(r.player)&&p[2]===r.market&&p[3]===r.side&&Number(p[4])===Number(r.line)).sort((a,b)=>recordDecimal(b[5])-recordDecimal(a[5])).map(p=>({key:p[0],exchange:EXCHANGES[p[0]],odds:p[5]}));
    legs[0].exchangesAt=g.at;
    statements.push(env.DB.prepare('UPDATE public_recommendations SET legs_json=? WHERE id=?').bind(JSON.stringify(legs),r.id));
  }
  if(statements.length)await env.DB.batch(statements);
  return {stamped:statements.length};
}
// Chance (percent) from American odds, as prediction markets list prices.
const exchangePct=odds=>Math.round(100/recordDecimal(odds));
// A pick's fair chance (percent): its edge is fair chance minus the chance in
// its locked price, both in points.
const EXCHANGE_VALUE_MIN=1;
function pickFairPct(r){const edge=Number(recordLegs(r)[0]?.edge),odds=Number(r.odds);return Number.isFinite(edge)&&Number.isFinite(odds)&&odds!==0?edge+100/recordDecimal(odds):null}
const exchangeGood=(r,p)=>{const fair=pickFairPct(r);return fair!==null&&fair-100/recordDecimal(p.odds)>=EXCHANGE_VALUE_MIN};
// "Novig 48% · Kalshi 49%" from a pick's saved exchange prices, limited to
// the exchanges open in a state (all when the state isn't known).
// Only prices that are still good value (1+ point under the pick's fair
// chance) unless all is set.
function exchangeLine(r,state=null,max=3,all=false){
  const leg=recordLegs(r)[0]||{},open=state?new Set(bettingOptionsFor(state).exchangeKeys||[]):null;
  return (Array.isArray(leg.exchanges)?leg.exchanges:[]).filter(p=>(!open||open.has(p.key))&&(all||exchangeGood(r,p))).slice(0,max).map(p=>`${p.exchange} ${exchangePct(p.odds)}%`).join(' · ');
}
// Prediction-market prices for the visitor's state: every exchange price on
// each upcoming official prop (best first), and exchange props still priced
// 1%+ better than the sportsbooks' fair chance (the exchange shadow test).
// Reads saved prices only: no provider calls on page load.
// Every prediction-market price for one game, best per prop, at the exchanges
// open in the visitor's state: [player, market, side, line, exchange, odds].
// One week's prediction picks and parlays (games from the week's Tuesday
// noon UTC) with their records, for the digest, X and the weekly page.
async function predictionWeek(env,start){
  const from=`${start}T12:00:00.000Z`,to=new Date(Date.parse(from)+7*86400000).toISOString();
  const picks=(await env.DB.prepare('SELECT * FROM prediction_picks WHERE event_id NOT LIKE \'NBA--%\' AND game_time>=? AND game_time<? ORDER BY game_time,posted_at').bind(from,to).all().catch(()=>({results:[]}))).results||[];
  const parlays=(await env.DB.prepare('SELECT * FROM prediction_parlays WHERE game_time>=? AND game_time<? ORDER BY game_time,posted_at').bind(from,to).all().catch(()=>({results:[]}))).results||[];
  const rec=predictionRecord(picks),pr=predictionParlayRecord(parlays);
  return {picks,parlays,rec,pr,graded:rec.wins+rec.losses+pr.wins+pr.losses,wins:rec.wins+pr.wins,losses:rec.losses+pr.losses,profit:(rec.profit||0)+(pr.profit||0)};
}
const predictionWeekLine=w=>w.graded?`Prediction apps: ${w.wins}–${w.losses}, ${weeklyMoney(w.profit)} after fees (singles ${w.rec.wins}–${w.rec.losses}, parlays ${w.pr.wins}–${w.pr.losses}).`:'';
// Tuesday: last week's prediction-app record as its own graphic post.
async function postPredictionWeekToX(env,now=Date.now()){
  if(!env.DB||!xReady(env))return {posted:0,disabled:true};
  const day=new Date(now);if(day.getUTCDay()!==2||day.getUTCHours()<14)return {posted:0,due:false};
  const week=new Date(Date.parse(`${officialWeek(now)}T00:00:00Z`)-7*86400000).toISOString().slice(0,10),key=`x-pm-week:${week}`;
  if(!(await xClaimable(env,key,now)))return {posted:0,done:true};
  const w=await predictionWeek(env,week);if(!w.graded)return {posted:0,empty:true};
  if(!(await xClaim(env,key,now)))return {posted:0,done:true};
  const m=v=>Math.round(v)===0?'$0':weeklyMoney(v),info=nflWeekOf(week),name=info?`Week ${info.week}`:'Last week',P='#c4b5fd';
  const pay=r=>r.result==='won'?100*(recordDecimal(r.net_odds??r.odds)-1):r.result==='lost'?-100:0,legsOf=r=>{try{return JSON.parse(r.legs_json)}catch{return []}};
  const picks=[...w.picks.filter(r=>r.result&&r.result!=='void').map(r=>({res:r.result,color:r.result==='won'?P:undefined,text:`${r.player} · ${weeklyLegText(r)}`,odds:m(pay(r)),sub:`${r.exchange} · ${exchangePct(r.odds)}%`})),
    ...w.parlays.filter(r=>r.result).flatMap(r=>{const legs=legsOf(r);return [{res:r.result,color:r.result==='won'?P:undefined,text:`${legs.length}-leg parlay`,odds:m(predictionParlayPay(r)),sub:`${r.exchange} · ${exchangePct(r.odds)}% · $25`},...legs.map(l=>({leg:true,color:P,text:`${l.result==='won'?'✓':l.result==='lost'?'✗':'·'} ${l.player} · ${weeklyLegText(l)}`}))]})];
  const text=xShort(`📈 ${name} on prediction apps: ${w.wins}–${w.losses}, ${m(w.profit)} after fees.\n\nSingles ${w.rec.wins}–${w.rec.losses} (${m(w.rec.profit)} at $100) · Parlays ${w.pr.wins}–${w.pr.losses} (${m(w.pr.profit)} at $25)\n\nIts own record, every pick graded in public. Link in bio. 18+/21+ by app.`);
  let mediaId=null;
  try{if(typeof renderCardPng==='function')mediaId=await xUploadImage(env,await renderCardPng(xSlateSvg({final:true,kicker:'PREDICTION APPS',day:`${w.wins}–${w.losses}`,dayColor:w.profit>=0?'#c4b5fd':'#f87171',dateLine:`${name} · ${m(w.profit)} after fees`,note:`Singles ${w.rec.wins}–${w.rec.losses} · Parlays ${w.pr.wins}–${w.pr.losses}`,note2:'$100 singles · $25 parlays',picks,cta:'Wherever you bet'})))}
  catch(error){await setAppSetting(env,'x-last-error',`${new Date(now).toISOString()} pm week graphic: ${error.message}`).catch(()=>{})}
  try{const sent=await xPost(env,text,mediaId);await xDone(env,key,now);if(sent?.data?.id)await setAppSetting(env,`xid:${key}`,String(sent.data.id)).catch(()=>{});await setAppSetting(env,'x-last-post',`${new Date(now).toISOString()} pm-week ${week} ${sent?.data?.id||''}`).catch(()=>{});return {posted:1,graphic:Boolean(mediaId)}}
  catch(error){await env.DB.prepare('DELETE FROM app_settings WHERE key=?').bind(key).run().catch(()=>{});return {posted:0,error:error.message}}
}
// The prediction-app record for the Results page and weekly pages: every
// prediction pick and parlay (not limited to a state), singles and parlays
// apart, after each app's fee, plus a split by app.
async function predictionRecordData(env){
  const picks=(await env.DB.prepare('SELECT id,exchange,player,team,market,side,line,odds,net_odds,fair_pct,game_time,posted_at,result,actual,close_odds,early,void_reason FROM prediction_picks WHERE event_id NOT LIKE \'NBA--%\' ORDER BY game_time DESC,posted_at DESC LIMIT 500').all()).results||[];
  const parlays=(await env.DB.prepare('SELECT id,tier,exchange,legs_json,odds,game_time,posted_at,result FROM prediction_parlays ORDER BY game_time DESC,posted_at DESC LIMIT 300').all().catch(()=>({results:[]}))).results||[];
  const singles=predictionRecord(picks),combos=predictionParlayRecord(parlays),apps={};
  const pay=r=>r.result==='won'?100*(recordDecimal(r.net_odds??r.odds)-1):r.result==='lost'?-100:0;
  for(const r of picks){const a=apps[r.exchange]||={wins:0,losses:0,pushes:0,profit:0,plays:0};a.plays++;if(r.result==='won')a.wins++;else if(r.result==='lost')a.losses++;else if(r.result==='push')a.pushes++;a.profit+=pay(r)}
  for(const r of parlays){const a=apps[r.exchange]||={wins:0,losses:0,pushes:0,profit:0,plays:0};a.plays++;if(r.result==='won')a.wins++;else if(r.result==='lost')a.losses++;else if(r.result==='push')a.pushes++;a.profit+=predictionParlayPay(r)}
  for(const a of Object.values(apps))a.profit=Math.round(a.profit);
  const plays=[...picks.map(r=>({id:r.id,kind:'single',exchange:r.exchange,player:r.player,team:r.team||'',market:r.market,side:r.side,line:r.line,odds:r.odds,netOdds:r.net_odds,fair:r.fair_pct,gameTime:r.game_time,postedAt:r.posted_at,result:r.result,actual:r.actual,closeOdds:r.close_odds,early:Boolean(r.early),...(r.void_reason?{voidReason:r.void_reason}:{}),money:Math.round(pay(r))})),
    ...parlays.map(r=>{let legs=[];try{legs=JSON.parse(r.legs_json)}catch{}return {id:r.id,kind:'parlay',exchange:r.exchange,odds:r.odds,gameTime:r.game_time,postedAt:r.posted_at,result:r.result,money:Math.round(predictionParlayPay(r)),legs:legs.map(l=>({player:l.player,market:l.market,side:l.side,line:l.line,team:l.team,result:l.result||null,actual:l.actual??null}))}})]
    .sort((a,b)=>String(b.gameTime).localeCompare(String(a.gameTime))||String(b.postedAt).localeCompare(String(a.postedAt)));
  return {singles,parlays:combos,apps,plays};
}
async function predictionRecordResponse(request,env){
  const head={'content-type':'application/json; charset=utf-8','cache-control':'public, max-age=60'};
  if(!env.DB)return new Response(JSON.stringify({success:false}),{status:503,headers:head});
  return new Response(JSON.stringify({success:true,...await predictionRecordData(env),updatedAt:new Date().toISOString()}),{headers:head});
}
const EXCHANGE_LIVE_GAP=3*60000,EXCHANGE_LIVE_FOR=4.5*3600000;
async function predictionBoardResponse(request,env,now=Date.now()){
  const head={'content-type':'application/json; charset=utf-8','cache-control':'private, max-age=120'};
  const where=bettingOptions(request),id=String(new URL(request.url).searchParams.get('event')||'');
  if(!env.DB||where.mode==='unknown'||!/^(NFL|NBA)--[A-Za-z0-9_-]{2,100}$/.test(id))return new Response(JSON.stringify({success:true,prices:[]}),{headers:head});
  let row=await env.DB.prepare('SELECT game_time,prices_json,updated_at FROM exchange_prices WHERE event_id=?').bind(id).first();
  // In-game: the 30-minute pregame snapshot stops at kickoff, so a live game's
  // prices are fetched on request, at most once every EXCHANGE_LIVE_GAP per game
  // (the first request after that claims the refresh; others get the last one).
  const kick=row?Date.parse(row.game_time):NaN,live=kick<=now&&now-kick<EXCHANGE_LIVE_FOR;
  if(live&&env.THE_ODDS_API_KEY&&now-Date.parse(row.updated_at)>(id.startsWith('NBA--')?2*EXCHANGE_LIVE_GAP:EXCHANGE_LIVE_GAP)){
    const stamp=new Date(now).toISOString(),claim=await env.DB.prepare('UPDATE exchange_prices SET updated_at=? WHERE event_id=? AND updated_at=?').bind(stamp,id,row.updated_at).run().catch(()=>null);
    if(Number(claim?.meta?.changes??claim?.changes)){try{const ex=id.startsWith('NBA--')?await fetchNbaExchangeOdds(id.slice(5),env.THE_ODDS_API_KEY):await fetchExchangeOdds(id.slice(5),env.THE_ODDS_API_KEY),list=exchangePriceList(ex);await env.DB.prepare('UPDATE exchange_prices SET prices_json=?,updated_at=? WHERE event_id=?').bind(JSON.stringify(list),stamp,id).run();row={...row,prices_json:JSON.stringify(list),updated_at:stamp}}catch(error){console.warn('exchange_live_failed',error.message)}}
  }
  if(live)head['cache-control']='private, max-age=60';
  if(!row||(!live&&now-Date.parse(row.updated_at)>3*3600000))return new Response(JSON.stringify({success:true,prices:[]}),{headers:head});
  let list=[];try{list=JSON.parse(row.prices_json)}catch{}
  const allowed=new Set(where.exchangeKeys),best=new Map();
  // A side priced at 95%+ (e.g. -9900) is an empty book, not a price: never shown.
  for(const p of list){if(!allowed.has(p[0])||!(Number(p[5])>-1900))continue;const k=`${normalizedName(p[1])}|${p[2]}|${p[3]}|${p[4]}`,b=best.get(k);if(!b||recordDecimal(p[5])>recordDecimal(b[5]))best.set(k,p)}
  return new Response(JSON.stringify({success:true,updatedAt:row.updated_at,prices:[...best.values()].map(p=>[p[1],p[2],p[3],p[4],EXCHANGES[p[0]],p[5]])}),{headers:head});
}
// Bet slip links for one game and market, fetched when a visitor's slip
// asks for them (one call per game and market for every visitor, cached 5
// minutes): each licensed sportsbook's and each prediction app's price with
// the link that opens that bet in its app. Apps are only the ones open in
// the visitor's state. Rows: [book key, name, player, side, line, odds, link, sid].
async function betLinksResponse(request,env){
  const head={'content-type':'application/json; charset=utf-8','cache-control':'private, max-age=120'};
  const url=new URL(request.url),id=String(url.searchParams.get('event')||''),m=/^(NFL|NBA)--([A-Za-z0-9_-]{2,100})$/.exec(id);
  const sport=m&&SPORTS_BY_LABEL[m[1]],known=new Set(sport?[...sport.markets,...(sport.expandedMarkets||[])]:[]);
  const markets=String(url.searchParams.get('markets')||'').split(',').filter(k=>known.has(k)).slice(0,3);
  if(!sport||!markets.length||!env.THE_ODDS_API_KEY)return new Response(JSON.stringify({success:false,rows:[]}),{headers:head});
  const cacheKey=new Request(`https://cache.betthisguy.com/bet-links/${id}/${markets.sort().join(',')}`),cache=typeof caches!=='undefined'?caches.default:null;
  let rows=null;
  try{const hit=await cache?.match(cacheKey);if(hit)rows=await hit.json()}catch{}
  if(!rows){
    const q=new URLSearchParams({apiKey:env.THE_ODDS_API_KEY,regions:'us,us_ex',markets:markets.join(','),oddsFormat:'american',dateFormat:'iso',includeLinks:'true',includeSids:'true'});
    const r=await fetch(`${API_BASE}/sports/${sport.key}/events/${m[2]}/odds?${q}`,{headers:{accept:'application/json'}});
    if(!r.ok)return new Response(JSON.stringify({success:false,rows:[]}),{headers:head});
    const d=await r.json();rows=[];
    for(const b of d.bookmakers||[]){if(!LICENSED_BOOKS.has(b.key)&&!EXCHANGES[b.key])continue;
      for(const mk of b.markets||[])for(const o of mk.outcomes||[]){const price=Number(o.price);if(!o.description||!Number.isFinite(price))continue;
        const name=String(o.name||'').toLowerCase(),side=name==='over'||name==='yes'?'Over':name==='under'||name==='no'?'Under':null;if(!side)continue;
        rows.push([b.key,EXCHANGES[b.key]||b.title||b.key,String(o.description).trim(),side,Number.isFinite(Number(o.point))?Number(o.point):null,price,o.link||null,o.sid||null])}}
    try{await cache?.put(cacheKey,new Response(JSON.stringify(rows),{headers:{'content-type':'application/json','cache-control':'max-age=300'}}))}catch{}
  }
  // Prediction apps the visitor can use where they are; every licensed sportsbook.
  const allowed=new Set(bettingOptions(request).exchangeKeys||[]);
  return new Response(JSON.stringify({success:true,rows:rows.filter(x=>!EXCHANGES[x[0]]||allowed.has(x[0]))}),{headers:head});
}
async function predictionsResponse(request,env,now=Date.now()){
  const where=bettingOptions(request),head={'content-type':'application/json; charset=utf-8','cache-control':'private, no-store'};
  const {exchangeKeys,...pub}=where;
  if(!env.DB||where.mode==='unknown')return new Response(JSON.stringify({success:true,...pub,picks:{},value:[]}),{headers:head});
  const stamp=new Date(now).toISOString(),allowed=new Set(exchangeKeys);
  const boards=new Map((((await env.DB.prepare('SELECT event_id,prices_json,updated_at FROM exchange_prices WHERE game_time>?').bind(stamp).all()).results)||[]).filter(r=>now-Date.parse(r.updated_at)<3*3600000).map(r=>{let list=[];try{list=JSON.parse(r.prices_json)}catch{}return [r.event_id,list.filter(p=>allowed.has(p[0]))]}));
  const find=(eventId,player,market,side,line)=>(boards.get(eventId)||[]).filter(p=>normalizedName(p[1])===normalizedName(player)&&p[2]===market&&p[3]===side&&Number(p[4])===Number(line));
  const official=(await env.DB.prepare("SELECT id,game_id,player,market,side,line,odds,legs_json FROM public_recommendations WHERE source='market-verified-v2' AND id LIKE 'official|%' AND kind='prop' AND game_time>?").bind(stamp).all()).results||[];
  // Each price also says whether it's still good value: its chance at least
  // 1 point under the pick's fair chance (the official bar).
  const picks={},fairs={};
  for(const r of official){const fair=pickFairPct(r);if(fair!==null)fairs[r.id]=+fair.toFixed(1);const list=find(r.game_id,r.player,r.market,r.side,r.line).sort((a,b)=>recordDecimal(b[5])-recordDecimal(a[5]));if(list.length)picks[r.id]=list.map(p=>({exchange:EXCHANGES[p[0]],odds:p[5],...(fair!==null?{good:fair-100/recordDecimal(p[5])>=EXCHANGE_VALUE_MIN}:{})}))}
  // Worth a look (prediction view) leaves out official picks and players in prediction parlays.
  const taken=new Set(official.map(r=>`${r.game_id}|${normalizedName(r.player)}`)),value=[];
  for(const r of (((await env.DB.prepare('SELECT legs_json FROM prediction_parlays WHERE game_time>?').bind(stamp).all().catch(()=>({results:[]}))).results)||[])){try{for(const l of JSON.parse(r.legs_json))taken.add(`${l.eventId}|${normalizedName(l.player)}`)}catch{}}
  // ...and the official prediction picks themselves (a value play that locked as a pick leaves the list).
  for(const r of (((await env.DB.prepare('SELECT event_id,player FROM prediction_picks WHERE game_time>?').bind(stamp).all().catch(()=>({results:[]}))).results)||[]))taken.add(`${r.event_id}|${normalizedName(r.player)}`);
  const rows=(await env.DB.prepare("SELECT exchange,event_id,player,team,market,side,line,fair_pct,game_time FROM exchange_shadow WHERE kind='prop' AND game_time>?").bind(new Date(now+5*60000).toISOString()).all()).results||[];
  for(const r of rows){
    if(taken.has(`${r.event_id}|${normalizedName(r.player)}`))continue;
    const key=Object.keys(EXCHANGES).find(k=>EXCHANGES[k]===r.exchange),cur=find(r.event_id,r.player,r.market,r.side,r.line).find(p=>p[0]===key);
    // After the app's fee, like picks: a price whose after-fee chance is at least half a point under fair.
    if(!cur)continue;const net=predictionNet(key,cur[5]),edge=Number(r.fair_pct)-net.netChance;if(edge<.5)continue;
    value.push({exchange:r.exchange,fair:+Number(r.fair_pct).toFixed(1),eventId:r.event_id,player:r.player,team:r.team||'',market:r.market,side:r.side,line:r.line,odds:cur[5],netOdds:net.netOdds,edge:+edge.toFixed(1),gameTime:r.game_time});
  }
  value.sort((a,b)=>b.edge-a.edge);
  // Prices saved when each of this week's picks locked (for started and final picks).
  const recent=(await env.DB.prepare("SELECT id,odds,legs_json FROM public_recommendations WHERE source='market-verified-v2' AND id LIKE 'official|%' AND kind='prop' AND game_time>? AND game_time<=?").bind(new Date(now-8*86400000).toISOString(),stamp).all()).results||[];
  const locked={};
  for(const r of recent){const ex=recordLegs(r)[0]?.exchanges;if(Array.isArray(ex)&&ex.length){const list=ex.filter(p=>allowed.has(p.key));if(list.length)locked[r.id]=list.map(p=>({exchange:p.exchange,odds:p.odds,good:exchangeGood(r,p)}))}}
  // Prediction-market picks: this week's card and the season record.
  // ?league=NBA: the NBA prediction picks and their own record (NFL's stays separate).
  const nbaView=new URL(request.url).searchParams.get('league')==='NBA';
  const pmRows=((await env.DB.prepare('SELECT * FROM prediction_picks ORDER BY game_time,posted_at').all()).results||[]).filter(r=>String(r.event_id||'').startsWith('NBA--')===nbaView);
  const pmPicks=pmRows.filter(r=>Date.parse(r.game_time)>now-5*86400000).slice(-24).map(r=>{const key=Object.keys(EXCHANGES).find(k=>EXCHANGES[k]===r.exchange);return {id:r.id,exchange:r.exchange,open:allowed.has(key),eventId:r.event_id,player:r.player,team:r.team||'',market:r.market,side:r.side,line:r.line,odds:r.odds,netOdds:r.net_odds,fair:r.fair_pct,edge:r.edge,gameTime:r.game_time,postedAt:r.posted_at,closeOdds:r.close_odds,nowOdds:Date.parse(r.game_time)>now?(find(r.event_id,r.player,r.market,r.side,r.line).find(p=>p[0]===key)?.[5]??null):null,result:r.result,actual:r.actual}});
  const pmParlayRows=nbaView?[]:(await env.DB.prepare('SELECT * FROM prediction_parlays ORDER BY game_time,posted_at').all().catch(()=>({results:[]}))).results||[];
  const pmParlays=pmParlayRows.filter(r=>Date.parse(r.game_time)>now-5*86400000).slice(-16).map(r=>{let legs=[];try{legs=JSON.parse(r.legs_json)}catch{}const key=Object.keys(EXCHANGES).find(k=>EXCHANGES[k]===r.exchange);return {id:r.id,parlay:true,exchange:r.exchange,open:allowed.has(key),odds:r.odds,gameTime:legs.map(l=>l.gameTime).sort()[0]||r.game_time,postedAt:r.posted_at,result:r.result,legs:legs.map(l=>({player:l.player,market:l.market,side:l.side,line:l.line,odds:l.netOdds??l.odds??null,eventId:l.eventId,gameTime:l.gameTime,team:l.team,sameGame:Boolean(l.sameGame),result:l.result||null}))}});
  return new Response(JSON.stringify({success:true,...pub,picks,fairs,locked,value:nbaView?[]:value.slice(0,8),pmPicks,pmRecord:predictionRecord(pmRows),pmParlays,pmParlayRecord:predictionParlayRecord(pmParlayRows),nbaApps:await nbaExchangeStatus(env)}),{headers:head});
}
function bettingOptionsResponse(request){
  const {exchangeKeys,...where}=bettingOptions(request);
  return new Response(JSON.stringify({success:true,...where}),{headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store'}});
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
  // Prediction picks next: logged only, never used to skip a pick (so far the
  // check's 'disagree' picks have won more often than its 'agree' ones).
  const pm=official.length>=2?[]:((await env.DB.prepare("SELECT id,player,team,market,side,line,game_time FROM prediction_picks WHERE game_time>? AND id NOT IN (SELECT id FROM stats_checks) ORDER BY game_time LIMIT ?").bind(start,2-official.length).all()).results||[]).map(r=>({...r,kind:'pm'}));
  const near=official.length+pm.length>=2?[]:((await env.DB.prepare("SELECT 'near|'||id AS id,player,team,market,side,line,game_time FROM near_shadow WHERE game_time>? AND 'near|'||id NOT IN (SELECT id FROM stats_checks) ORDER BY game_time LIMIT ?").bind(start,2-official.length-pm.length).all()).results||[]).map(r=>({...r,kind:'near'}));
  const statements=[];
  for(const pick of [...official,...pm,...near]){
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
  const rows=(await env.DB.prepare("SELECT c.kind,c.verdict,COALESCE(p.result,n.result,m.result) AS result FROM stats_checks c LEFT JOIN public_recommendations p ON p.id=c.id AND p.status='final' LEFT JOIN near_shadow n ON 'near|'||n.id=c.id LEFT JOIN prediction_picks m ON m.id=c.id").all()).results||[];
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
    const dirs=await pickDirections(env),ok=p=>sameDirection(dirs,p.gameId,p.player,p.side);
    const stats={};const candidates=officialCandidates(boards,Date.now(),stats).filter(ok);
    // Parlay legs come from the next tier down (0.5% to just under 1%), not from the singles.
    const nextTier=withTeams(officialCandidates(boards,Date.now(),{},{min:.5,below:1}).filter(ok),await playerTeams(env));
    const plan=officialPlan(candidates,existing.results||[],week,Date.now(),nextTier);
    const posted=await writeOfficialPlan(plan,week,env);
    await stampExchangePrices(env,Date.now()).catch(error=>console.warn('exchange_stamp_failed',error.message));
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
    if(!opts.soonOnly)jobStep('publish','exchange props');await recordExchangeProps(env,boards,Date.now()).catch(error=>console.warn('exchange_shadow_failed',error.message));
    if(!opts.soonOnly)await stampExchangePrices(env,Date.now()).catch(error=>console.warn('exchange_stamp_failed',error.message));
    if(!opts.soonOnly)jobStep('publish','book shadow');await recordBookShadow(env,boards,Date.now()).catch(error=>console.warn('book_shadow_failed',error.message));
    if(!opts.soonOnly&&(TD_SHADOW_ON||SB_TD_TEST_ON)){jobStep('publish','td shadow');await recordTdShadow(env,boards,Date.now(),TD_SHADOW_ON?null:sbTdRule).catch(error=>console.warn('td_shadow_failed',error.message))}
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
// Parlays posted from Oct 12, 2026 (afternoon PT) on are graded at a quarter
// unit ($25 at $100 a pick); earlier ones stay at the full $100 they posted at.
const PARLAY_QUARTER_FROM='2026-10-12T18:00:00Z';
const recordShare=r=>r&&r.kind==='parlay'&&String(r.posted_at||'')>=PARLAY_QUARTER_FROM?.25:1;
// One payout rule for every record, page, email and post. Singles at $100.
// Parlays at their stake ($25 from Oct 12, 2026): a pushed leg drops out of
// the price, as at the sportsbook, and the same-game cut applies only while
// two or more remaining legs share a game. Without leg results, the posted price.
function recordParlayDecimal(r){
  const legs=recordLegs(r);
  if(!legs.length||!legs.every(l=>['won','push'].includes(l.result)))return weeklyDecimal(r.combined_odds);
  const live=legs.filter(l=>l.result==='won');if(!live.length)return 1;
  return parlayDecimal(live.map(l=>({gameId:l.gameId||l.team||l.player,odds:l.odds})));
}
function recordPay(r,stake=100){
  if(r.result==='lost')return -stake*recordShare(r);if(r.result!=='won')return 0;
  const d=r.kind==='parlay'?recordParlayDecimal(r):weeklyDecimal(r.odds);
  return d?stake*recordShare(r)*(d-1):0;
}
function weeklySummary(rows){
  const props=rows.filter(r=>r.kind==='prop'&&weeklyGraded(r)),parlays=rows.filter(r=>r.kind==='parlay'&&weeklyGraded(r));
  const pay=r=>recordPay(r);
  const count=(list,res)=>list.filter(r=>r.result===res).length;
  const closes=props.filter(r=>r.closing_captured_at&&r.closing_odds!=null&&(r.closing_line==null||Math.abs(Number(r.closing_line)-Number(r.line))<=.01)).map(r=>(weeklyDecimal(r.odds)/weeklyDecimal(r.closing_odds)-1)*100>.05);
  return {wins:count(props,'won'),losses:count(props,'lost'),pushes:count(props,'push'),profit:props.reduce((s,r)=>s+pay(r),0),parlayWins:count(parlays,'won'),parlayLosses:count(parlays,'lost'),parlayProfit:parlays.reduce((s,r)=>s+pay(r),0),beat:closes.filter(Boolean).length,tracked:closes.length,pending:rows.filter(r=>!weeklyGraded(r)).length,total:rows.length};
}
// The dollar sign is escaped: tests splice this file in with a string replace, where dollar patterns are special.
const weeklyMoney=v=>(v<0?'−':'+')+'\u0024'+Math.abs(Math.round(v)).toLocaleString('en-US');
const weeklyDay=iso=>{const d=new Date(iso);return Number.isFinite(d.getTime())?d.toLocaleString('en-US',{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:'America/New_York'})+' ET':''};
const weeklyRange=start=>{const a=new Date(Date.parse(`${start}T12:00:00Z`)),b=new Date(a.getTime()+6*86400000),f=d=>d.toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'});const end=a.getUTCMonth()===b.getUTCMonth()?String(b.getUTCDate()):f(b);return `${f(a)}–${end}, ${b.getUTCFullYear()}`};
// Phone tab bar for the weekly pages, matching the home page's four tabs.
const WEEKLY_TABBAR=`<style>.btg-tabbar{display:none}@media(max-width:720px){body{padding-bottom:calc(88px + env(safe-area-inset-bottom))}.btg-tabbar{position:fixed;left:0;right:0;bottom:0;z-index:50;display:grid;grid-template-columns:repeat(4,1fr);gap:6px;padding:8px 8px calc(8px + env(safe-area-inset-bottom));background:rgba(14,16,19,.97);border-top:1px solid #232a33;backdrop-filter:blur(12px)}.btg-tabbar a{display:flex;flex-direction:column;align-items:center;gap:3px;padding:8px 0;border-radius:14px;color:#9aa6b2;text-decoration:none;font:600 13px "DM Sans",system-ui,sans-serif}.btg-tabbar a[aria-current]{background:#1b2129;color:#fff}}</style><nav class="btg-tabbar" aria-label="Main"><a href="/" aria-current="page"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/></svg><span>Picks</span></a><a href="/trust"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/></svg><span>Results</span></a><a href="/?page=slip"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/></svg><span>Slip</span></a><a href="/?more=1"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg><span>More</span></a></nav>`;
// Sign-up on the weekly pages (the most-visited page, mostly from X): alerts
// open on home (a phone only grants them from a tap there), email works here.
const WEEKLY_SIGNUP=(top)=>`<section class="signup${top?' top':''}"><strong>${top?'Get the next pick the second it locks':'Never miss a pick'}</strong><span>Free alerts by phone or email the moment a pick locks. No account needed.</span><div class="su-row"><a class="su-btn" href="/?alerts=1">Turn on alerts</a><form class="su-form"><input type="email" required placeholder="you@email.com" aria-label="Email address" autocomplete="email"><button type="submit">Email me</button></form></div><p class="su-msg" role="status" hidden></p></section>`;
const WEEKLY_SIGNUP_JS=`<script>document.querySelectorAll('.su-form').forEach(function(f){f.addEventListener('submit',function(e){e.preventDefault();var i=f.querySelector('input'),m=f.parentNode.parentNode.querySelector('.su-msg'),b=f.querySelector('button');b.disabled=true;fetch('/api/email-subscribe',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:i.value})}).then(function(r){return r.json()}).then(function(d){m.hidden=false;m.textContent=d.success?(d.active?'You’re already on the list.':'Check your inbox to confirm, then picks come to you.'):(d.error||'That didn’t work. Try again.');b.disabled=false}).catch(function(){m.hidden=false;m.textContent='That didn’t work. Try again.';b.disabled=false})})})</script>`;
const WEEKLY_EXTRA_CSS=`.signup{display:flex;flex-direction:column;gap:6px;margin:16px 0;padding:14px 16px;border:1px solid #2b4a78;border-radius:14px;background:linear-gradient(135deg,rgba(31,111,235,.16),rgba(31,111,235,.04))}.signup strong{font-size:16px;color:#fff}.signup span{font-size:13.5px;color:#a8b3c0}.su-row{display:flex;flex-wrap:wrap;gap:8px;margin-top:4px}.su-btn{display:inline-flex;align-items:center;padding:9px 16px;border-radius:999px;background:#1f6feb;color:#fff!important;font-weight:700;text-decoration:none}.su-form{display:flex;flex:1 1 230px;gap:6px}.su-form input{flex:1;min-width:0;padding:9px 12px;border:1px solid #2b3846;border-radius:999px;background:#0e1013;color:#edf1f7;font:inherit}.su-form button{padding:9px 14px;border:1px solid #2b3846;border-radius:999px;background:transparent;color:#cfe0f5;font:inherit;font-weight:700;cursor:pointer}.su-msg{margin:4px 0 0;font-size:13px;color:#2ee6a8}html.light .signup{background:#eef4ff;border-color:#c7d7f2}html.light .signup strong{color:#0f172a}html.light .signup span{color:#475569}html.light .su-form input{background:#fff;border-color:#c9d6e3;color:#0f172a}html.light .su-form button{color:#1d4ed8;border-color:#c9d6e3}
.pick{padding:10px 13px!important;margin:0 0 6px!important}.pick strong{font-size:15px}.pick .meta{font-size:12px!important;margin-top:2px}@media(max-width:720px){header.top .site-nav{display:none}}`;
// The top sign-up goes under the page's lead line (or first, without one).
const withSignup=body=>{const at=body.search(/<p class="lead"[^>]*>/);if(at<0)return WEEKLY_SIGNUP(true)+body;const end=body.indexOf('</p>',at);return end<0?WEEKLY_SIGNUP(true)+body:body.slice(0,end+4)+WEEKLY_SIGNUP(true)+body.slice(end+4)};
// Site chrome for every page outside the app (Results, About, legal, the
// weekly and NBA pages, 404): the same header, fonts and footer as home, so
// the whole site reads as one product. Home keeps its own app header and
// shares the footer. Light theme is html.light here and body.light on home.
const SITE_FONTS='<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@600;700&display=swap" rel="stylesheet">';
const SITE_STYLE=`<style id="site-chrome">
header.sx-head,footer.sx-foot{display:block!important;max-width:none!important;margin-left:0!important;margin-right:0!important;padding:0!important;text-align:left!important;grid-template-columns:none!important}
header.sx-head{border-top:0!important}.sx-head .sx-brand img{height:30px!important;width:auto!important;max-width:none}
.sx-foot p{font-size:inherit}.sx-foot .sx-fbrand img{height:28px!important;width:auto!important}
.sx-head{position:sticky;top:0;z-index:40;height:72px;background:rgba(14,16,19,.96);border-bottom:1px solid #272c35;backdrop-filter:blur(12px);font-family:"DM Sans",system-ui,sans-serif}
.sx-head .sx-in{display:flex;align-items:center;gap:24px;height:100%;padding:0 24px}
.sx-brand img{display:block;height:30px;width:auto}
.sx-nav{display:flex;align-items:stretch;gap:28px;height:100%;margin:0 auto}
.sx-nav a{position:relative;display:flex;align-items:center;color:#f2f4f7;opacity:.72;font:600 16px/1 "DM Sans",system-ui,sans-serif;text-decoration:none}
.sx-nav a:hover{opacity:1}.sx-nav a[aria-current=page]{opacity:1}
.sx-nav a[aria-current=page]::after{content:"";position:absolute;left:-6px;right:-6px;bottom:0;height:3px;border-radius:3px 3px 0 0;background:#3b82f6}
.sx-cta{flex:none;display:inline-flex;align-items:center;gap:8px;height:40px;padding:0 16px;border-radius:12px;background:#2563eb;color:#fff!important;font:700 14px "Space Grotesk",system-ui,sans-serif;text-decoration:none}
.sx-cta:hover{background:#1d4ed8}
@media(max-width:860px){.sx-nav{display:none}.sx-head .sx-in{justify-content:space-between}}
@media(max-width:720px){.sx-head{height:56px}.sx-head .sx-in{padding:0 14px}.sx-head .sx-brand img{height:26px!important}.sx-cta{height:36px;padding:0 12px;font-size:13px}}
.sx-foot{margin-top:48px;border-top:1px solid #272c35;background:#0b0d10;color:#98a1ad;font:14px/1.55 "DM Sans",system-ui,sans-serif}
.sx-foot .sx-in{max-width:1180px;margin:0 auto;padding:40px 24px 28px}
.sx-ftop{display:grid;grid-template-columns:minmax(0,1.6fr) repeat(3,minmax(0,1fr));gap:32px}
.sx-fbrand img{display:block;height:28px;width:auto;margin-bottom:14px}
.sx-fbrand p{margin:0 0 10px;max-width:360px}
.sx-track{display:inline-flex;align-items:center;gap:8px;margin:4px 0 14px!important;padding:6px 12px;border:1px solid #233b2f;border-radius:999px;background:rgba(46,230,168,.07);color:#cfeee2;font-size:13px;font-weight:600}
.sx-track i{width:7px;height:7px;border-radius:50%;background:#2ee6a8;flex:none}
.sx-x{display:inline-flex;align-items:center;gap:8px;color:#f2f4f7!important;font-weight:600;text-decoration:none}
.sx-x svg{width:16px;height:16px}
.sx-fcol{display:flex;flex-direction:column;gap:9px}
.sx-fcol b{margin-bottom:4px;color:#f2f4f7;font:700 13px "Space Grotesk",system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase}
.sx-fcol a{color:#98a1ad;text-decoration:none}.sx-fcol a:hover{color:#f2f4f7}
.sx-rg{display:flex;align-items:flex-start;gap:14px;margin-top:32px;padding-top:22px;border-top:1px solid #1d2229;font-size:12.5px;line-height:1.6}
.sx-rg p{margin:0}.sx-rg a{color:#cfd6df}
.sx-21{flex:none;display:grid;place-items:center;width:38px;height:38px;border:2px solid #98a1ad;border-radius:50%;color:#f2f4f7;font:700 13px "Space Grotesk",system-ui,sans-serif}
.sx-copy{margin:16px 0 0;font-size:12px;color:#6b7480}
@media(max-width:860px){.sx-ftop{grid-template-columns:1fr 1fr}.sx-fbrand{grid-column:1/-1}}
@media(max-width:720px){.sx-foot .sx-in{padding:32px 16px 24px}.sx-ftop{gap:24px 16px}.sx-foot.sx-app{padding-bottom:calc(84px + env(safe-area-inset-bottom))}}
html.light .sx-head,body.light .sx-head{background:rgba(255,255,255,.94);border-color:#d4e2f0}
html.light .sx-nav a{color:#10213d}
html.light .sx-foot,body.light .sx-foot{background:#fff;border-color:#e2e8f0;color:#5b6472}
html.light .sx-fcol b,body.light .sx-fcol b,html.light .sx-x,body.light .sx-x{color:#0f172a!important}
html.light .sx-fcol a,body.light .sx-fcol a{color:#5b6472}html.light .sx-fcol a:hover,body.light .sx-fcol a:hover{color:#0f172a}
html.light .sx-rg,body.light .sx-rg{border-color:#eef2f6}html.light .sx-rg a,body.light .sx-rg a{color:#1d4ed8}
html.light .sx-21,body.light .sx-21{border-color:#5b6472;color:#0f172a}
html.light .sx-track,body.light .sx-track{background:#ecfdf5;border-color:#bbf7d0;color:#065f46}html.light .sx-track i,body.light .sx-track i{background:#059669}
html.light img[src^="/logo.png"]{content:url(/logo-dark.png)}
</style>`;
const SITE_NAV=[['/','Picks'],['/nba','NBA'],['/trust','Results'],['/picks','Picks by week'],['/about','About']];
function siteHeader(active){
  return `<header class="sx-head"><div class="sx-in"><a class="sx-brand" href="/" aria-label="Bet This Guy home"><img src="/logo.png" alt="Bet This Guy" width="162" height="30"></a><nav class="sx-nav" aria-label="Main">${SITE_NAV.map(([href,label])=>`<a href="${href}"${href===active?' aria-current="page"':''}>${label}</a>`).join('')}</nav><a class="sx-cta" href="/?alerts=1"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>Get pick alerts</a></div></header>`;
}
function siteFooter(track,app=false){
  return `<footer class="sx-foot${app?' sx-app':''}"><div class="sx-in"><div class="sx-ftop"><div class="sx-fbrand"><img src="/logo.png" alt="Bet This Guy" width="151" height="28"><p>NFL and NBA player props, posted only when a price beats the market. Every pick graded in public, losses included.</p>${track?`<p class="sx-track"><i aria-hidden="true"></i>${track}</p>`:''}<div><a class="sx-x" href="https://x.com/BetThisGuy" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.9 2H22l-6.8 7.8L23 22h-6.2l-4.8-6.3L6.4 22H3.3l7.3-8.3L1 2h6.3l4.4 5.8L18.9 2Zm-1.1 18h1.7L6.3 3.9H4.5L17.8 20Z"/></svg>@BetThisGuy</a></div></div><nav class="sx-fcol" aria-label="Picks"><b>Picks</b><a href="/">This week’s picks</a><a href="/nba">NBA tonight</a><a href="/picks">Picks by week</a><a href="/where">Where you can bet</a></nav><nav class="sx-fcol" aria-label="Results"><b>Results</b><a href="/trust">Full record</a><a href="/trust#predictions">Prediction apps</a><a href="/trust#methodology">How we grade</a></nav><nav class="sx-fcol" aria-label="Company"><b>Company</b><a href="/about">About</a><a href="mailto:support@betthisguy.com">Contact</a><a href="/legal#terms">Terms</a><a href="/legal#privacy">Privacy</a></nav></div><div class="sx-rg"><span class="sx-21" aria-label="21 and over">21+</span><p>Gambling problem? Call <a href="tel:18004262537">1-800-GAMBLER</a> or visit <a href="https://www.ncpgambling.org/help-treatment/" target="_blank" rel="noopener">ncpgambling.org</a>. Bet This Guy is research and entertainment, not a sportsbook. No outcome is guaranteed, and past results don’t promise future ones. Bet only where it’s legal.</p></div><p class="sx-copy">© 2026 Bet This Guy</p></div></footer>`;
}
// The footer's track-record line, from the graded record itself (never a
// made-up "since" date). Cached per isolate for 10 minutes.
let siteTrackCache={at:0,text:''};
async function siteTrack(env){
  if(!env?.DB)return '';
  if(Date.now()-siteTrackCache.at<600000)return siteTrackCache.text;
  let text='';
  try{
    const r=await env.DB.prepare("SELECT (SELECT MIN(posted_at) FROM public_recommendations WHERE source='market-verified-v2') first,(SELECT COUNT(*) FROM public_recommendations WHERE source='market-verified-v2' AND result IN ('won','lost','push'))+(SELECT COUNT(*) FROM prediction_picks WHERE result IN ('won','lost','push')) graded").first();
    const first=Date.parse(r?.first||''),n=Number(r?.graded)||0;
    if(Number.isFinite(first)&&n>0)text=`${n} picks graded in public since ${new Date(first).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'America/Los_Angeles'})}`;
  }catch{}
  siteTrackCache={at:Date.now(),text};return text;
}
// Fills a static page's chrome markers.
function withSiteChrome(html,active,track){
  return html.replace('<!--SITE_HEAD-->',()=>SITE_FONTS+SITE_STYLE).replace('<!--SITE_STYLE-->',()=>SITE_STYLE).replace('<!--SITE_HEADER-->',()=>siteHeader(active)).replace('<!--SITE_FOOTER-->',()=>siteFooter(track,active==='/'));
}
function weeklyShell({title,description,path,body,track=''}){
  return `<!doctype html><html lang="en"><head><script data-theme>try{var t=localStorage.getItem('btg-theme');if(t==='light'||(t==='auto'&&matchMedia('(prefers-color-scheme: light)').matches))document.documentElement.classList.add('light')}catch(e){}</script><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#0e1013"><title>${weeklyEscape(title)}</title><meta name="description" content="${weeklyEscape(description)}"><link rel="canonical" href="${SITE_URL}${path}"><meta property="og:type" content="website"><meta property="og:title" content="${weeklyEscape(title)}"><meta property="og:description" content="${weeklyEscape(description)}"><meta property="og:url" content="${SITE_URL}${path}"><meta property="og:image" content="${SITE_URL}/og-image-v4.jpg"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image"><link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@600;700&display=swap" rel="stylesheet">
<style>body{margin:0;background:#0e1013;color:#edf1f7;font:15px/1.55 "DM Sans",system-ui,sans-serif}a{color:#6aa8ff}main{max-width:860px;margin:0 auto;padding:20px 16px 48px}header.top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:18px}header.top img{width:auto;height:28px;display:block}h1,h2{font-family:"Space Grotesk",sans-serif;line-height:1.15;color:#fff}h1{font-size:clamp(26px,5vw,38px);margin:6px 0 6px}h2{font-size:20px;margin:28px 0 10px}.eyebrow{margin:0;color:#5ff0b5;font:700 12px "Space Grotesk",sans-serif;letter-spacing:.16em}.lead{color:#b5b9bf;margin:0 0 16px}.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:0 0 18px}@media(max-width:480px){.stats{grid-template-columns:1fr 1fr}}.stat{padding:12px 14px;border-radius:14px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1)}.stat strong{display:block;font:700 22px "Space Grotesk",sans-serif;color:#fff}.stat.up strong{color:#5ff0b5}.stat.down strong{color:#ff9d9d}.stat span{color:#b5b9bf;font-size:12.5px}.cta{display:inline-block;margin:4px 12px 4px 0;padding:11px 20px;border-radius:999px;background:#2563eb;color:#fff;font-weight:700;text-decoration:none}.picks{list-style:none;margin:0;padding:0;display:grid;gap:8px}.pick{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 12px;padding:12px 14px;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09)}.pick strong{color:#fff}.pick .bet{grid-column:1}.pick .meta{grid-column:1/-1;color:#a6aab0;font-size:12.5px}.pick .price{grid-row:1/3;grid-column:2;text-align:right;font:700 16px "Space Grotesk",sans-serif}.res{display:inline-block;margin-left:6px;padding:2px 8px;border-radius:999px;font-weight:700;font-size:11.5px;vertical-align:2px;background:#1e222a;color:#98a1ad}.res.won{background:rgba(34,197,94,.14);color:#22c55e}.res.lost{background:rgba(240,96,96,.14);color:#f06060}.won{color:#5ff0b5}.lost{color:#ff9d9d}.push,.pending{color:#ffd66e}.legs{margin:6px 0 0;padding-left:18px;color:#dce0e6;font-size:13.5px}.weeks{list-style:none;margin:0;padding:0;display:grid;gap:8px}.weeks a{display:flex;justify-content:space-between;gap:12px;padding:14px 16px;border-radius:14px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#fff;text-decoration:none}.weeks small{color:#b5b9bf}.pager{display:flex;justify-content:space-between;gap:12px;margin-top:28px}.pager a,header.top>a:last-child{display:inline-block;padding:10px 0}.site-nav{display:flex;align-items:center;gap:18px}.site-nav a{color:#98a1ad;font:600 14px/1 "DM Sans",sans-serif;text-decoration:none;padding:10px 0}.site-nav a[aria-current=page]{color:#f2f4f7}.site-nav a:hover{color:#f2f4f7}.fine{margin-top:32px;color:#969aa0;font-size:12px}@media (display-mode: standalone){body{padding-top:env(safe-area-inset-top)}}html.light{color-scheme:light}html.light body{background:#f4f6f9;color:#0f172a}html.light a{color:#1d4ed8}html.light h1,html.light h2,html.light .stat strong,html.light .pick strong{color:#0f172a}html.light .eyebrow{color:#047857}html.light .lead,html.light .stat span,html.light .weeks small,html.light .pick .meta,html.light .fine{color:#5b6472}html.light .stat,html.light .pick,html.light .weeks a{background:#fff;border:1px solid #e2e8f0}html.light .stat.up strong,html.light .won{color:#15803d}html.light .stat.down strong,html.light .lost{color:#c62828}html.light .push,html.light .pending{color:#a16207}html.light .res{background:#f1f4f8;color:#475569}html.light .res.won{background:#dcfce7;color:#15803d}html.light .res.lost{background:#fee2e2;color:#c62828}html.light .legs{color:#334155}html.light .cta{background:#2563eb;color:#fff}html.light .site-nav a{color:#5b6472}html.light .site-nav a[aria-current=page],html.light .site-nav a:hover{color:#0f172a}html.light img[src^="/logo.png"]{content:url(/logo-dark.png)}${WEEKLY_EXTRA_CSS}</style>${SITE_STYLE}</head><body>${siteHeader(path.startsWith('/nba')?'/nba':path.startsWith('/picks')?'/picks':'')}<main>${withSignup(body)}${WEEKLY_SIGNUP(false)}<p class="fine">Every official pick is locked before kickoff and graded from box scores. Profit assumes $100 per pick at the posted price.</p></main>${siteFooter(track)}${WEEKLY_SIGNUP_JS}${WEEKLY_TABBAR}</body></html>`;
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
// Where can I bet? Every state: sportsbooks or not, and the prediction apps
// listed there (those with NFL player props marked). From the same tables the
// board uses; availability changes often, so the page says so.
const PROP_APPS=new Set(['Novig','ProphetX']);
// Partner offers (affiliate codes). app_settings partner-novig holds JSON
// {code, xCode?, link?, offer?}; nothing shows until it's set. The code is
// 2-15 letters or numbers; a link must be https on the app's own domain.
const PARTNER_APPS={Novig:{key:'partner-novig',domain:/^https:\/\/([\w-]+\.)*novig\.(us|co|com)(\/|$)/}};
async function partnerOffers(env){
  const out={};if(!env.DB)return out;
  for(const [name,cfg] of Object.entries(PARTNER_APPS)){
    let p=null;try{p=JSON.parse(await appSetting(env,cfg.key)||'null')}catch{}
    const code=String(p?.code||'').toUpperCase();if(!/^[A-Z0-9]{2,15}$/.test(code))continue;
    const xCode=String(p?.xCode||'').toUpperCase(),link=String(p?.link||'');
    out[name]={code,...(/^[A-Z0-9]{2,15}$/.test(xCode)?{xCode}:{}),...(cfg.domain.test(link)?{link}:{}),offer:String(p?.offer||'').slice(0,120)};
  }
  return out;
}
// GET /api/partners: the live partner offers, for the pick sheet and app buttons.
async function partnersResponse(env){return json({success:true,partners:await partnerOffers(env).catch(()=>({}))},200,{'cache-control':'public, max-age=300'})}
function wherePage(){
  const rows=Object.entries(US_STATES).sort((a,b)=>a[1].localeCompare(b[1])).map(([code,name])=>{const o=bettingOptionsFor(code),apps=[...o.exchanges,...(o.predictions.fanduel?['FanDuel Predicts']:[]),...(o.predictions.draftkings?['DraftKings Predictions']:[])];
    return `<li class="pick"><div><strong>${weeklyEscape(name)}</strong> <span class="res ${o.sportsbooks?'won':'pending'}">${o.sportsbooks?'Sportsbooks':'Prediction apps only'}</span></div><div class="meta">${apps.length?apps.map(a=>PROP_APPS.has(a)?`<b>${weeklyEscape(a)}</b>`:weeklyEscape(a)).join(', '):'No prediction apps listed'}</div></li>`}).join('');
  const body=`<p class="eyebrow">WHERE YOU CAN BET</p><h1>Sportsbooks and prediction apps by state</h1><p class="lead">Where there are legal sportsbooks, we post sportsbook picks. Everywhere, we also price prediction apps, where a bet is a contract priced as a chance (60% means you pay 60¢ to win $1). Apps in <b>bold</b> list NFL player props, so our prediction picks run on them.</p><p class="lead">Availability changes often and each app checks your location; some are 18+, some 21+. Always check the app before you sign up. <a href="/trust#predictions">See the prediction record →</a></p><ul class="picks">${rows}</ul><p><a class="cta" href="/">Open the board →</a></p>`;
  return weeklyShell({title:'Where Can I Bet on NFL Props? Sportsbooks and Prediction Apps by State | Bet This Guy',description:'State by state: where legal sportsbooks operate and which prediction apps (Novig, ProphetX, Kalshi, Polymarket) are listed, for NFL player props.',path:'/where',body});
}
async function weeklyPage(request,env){
  if(!env.DB)return null;
  const url=new URL(request.url),headers={'content-type':'text/html; charset=utf-8','cache-control':'public, max-age=300'};
  if(url.pathname==='/picks'||url.pathname==='/picks/'){
    const weeks=await env.DB.prepare("SELECT substr(id,10,10) AS week, COUNT(*) AS n FROM public_recommendations WHERE source='market-verified-v2' AND id LIKE 'official|%' GROUP BY week ORDER BY week DESC").all();
    const items=[];
    for(const w of weeks.results||[]){const nfl=nflWeekOf(w.week);if(!nfl)continue;const s=weeklySummary(await weeklyRows(env,w.week));items.push(`<li><a href="/picks/${nfl.season}/week-${nfl.week}"><span><strong>Week ${nfl.week}</strong> <small>${weeklyRange(w.week)}</small></span><small>${s.wins+s.losses+s.pushes?`${s.wins}–${s.losses}${s.pushes?`–${s.pushes}`:''} · ${weeklyMoney(s.profit)}`:`${w.n} pick${w.n===1?'':'s'} posted`}${s.pending?` · ${s.pending} pending`:''}</small></a></li>`)}
    return new Response(weeklyShell({track:await siteTrack(env),title:'NFL Player Prop Picks by Week | Bet This Guy',description:'Every official NFL player prop pick from Bet This Guy, week by week: locked before kickoff, graded from box scores, with prices and results.',path:'/picks',body:`<p class="eyebrow">OFFICIAL PICKS</p><h1>NFL player prop picks by week</h1><p class="lead">Every pick is locked before kickoff and graded in public. Tap a week for every bet, its price and how it finished.</p><ul class="weeks">${items.join('')||'<li>No weeks yet.</li>'}</ul><p><a class="cta" href="/">Open this week’s board →</a></p>`}),{headers});
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
  // Prediction app picks and parlays that week (games from the week's Tuesday noon UTC), with their own record.
  const from=`${start}T12:00:00.000Z`,to=new Date(Date.parse(from)+7*86400000).toISOString();
  const pmPicks=(await env.DB.prepare('SELECT * FROM prediction_picks WHERE event_id NOT LIKE \'NBA--%\' AND game_time>=? AND game_time<? ORDER BY game_time,posted_at').bind(from,to).all().catch(()=>({results:[]}))).results||[];
  const pmParlays=(await env.DB.prepare('SELECT * FROM prediction_parlays WHERE game_time>=? AND game_time<? ORDER BY game_time,posted_at').bind(from,to).all().catch(()=>({results:[]}))).results||[];
  const pmRes=r=>['won','lost','push'].includes(r.result)?r.result:r.result==='void'?'push':'pending',pmLabel={won:'Won',lost:'Lost',push:'Push',pending:'Pending'};
  const pmItem=r=>`<li class="pick"><div><strong>${weeklyEscape(r.player)}</strong> <span class="res ${pmRes(r)}">${r.result==='void'?'Void':pmLabel[pmRes(r)]}</span></div><div class="price">${exchangePct(r.odds)}%</div><div class="bet">${weeklyEscape(weeklyLegText(r))}${r.actual!=null?` · had ${weeklyEscape(r.actual)}`:''}</div><div class="meta">${weeklyEscape([String(r.team||'').replace(' · ',' '),weeklyDay(r.game_time),`${r.exchange}, fair chance ${Math.round(r.fair_pct)}%`].filter(Boolean).join(' · '))}</div></li>`;
  const pmParlayItem=r=>{let legs=[];try{legs=JSON.parse(r.legs_json)}catch{}return `<li class="pick"><div><strong>${legs.length}-leg parlay</strong> <span class="res ${pmRes(r)}">${pmLabel[pmRes(r)]}</span></div><div class="price">${exchangePct(r.odds)}%</div><ul class="legs">${legs.map(l=>`<li>${weeklyEscape(l.player)} — ${weeklyEscape(weeklyLegText(l))}${l.actual!=null?` · had ${weeklyEscape(l.actual)}`:''}</li>`).join('')}</ul><div class="meta">${weeklyEscape(`${r.exchange} · $25 ticket`)}</div></li>`};
  const pmRec=predictionRecord(pmPicks),pmPr=predictionParlayRecord(pmParlays),pmGraded=pmRec.wins+pmRec.losses+pmPr.wins+pmPr.losses;
  const pmSection=pmPicks.length||pmParlays.length?`<h2>Prediction app picks</h2><p class="lead">Its own record, after each app’s fee${pmGraded?`: singles ${pmRec.wins}–${pmRec.losses} (${weeklyMoney(pmRec.profit)} at $100), parlays ${pmPr.wins}–${pmPr.losses} (${weeklyMoney(pmPr.profit)} at $25)`:''}. A price like 60% means you pay 60¢ to win $1. <a href="/trust#predictions">Every prediction pick →</a></p>${pmPicks.length?`<ul class="picks">${pmPicks.map(pmItem).join('')}</ul>`:''}${pmParlays.length?`<h2>Prediction app parlays</h2><ul class="picks">${pmParlays.map(pmParlayItem).join('')}</ul>`:''}`:'';
  const body=`<p class="eyebrow">OFFICIAL PICKS · ${season}</p><h1>NFL Week ${week} player prop picks</h1><p class="lead">${weeklyEscape(weeklyRange(start))} · ${singles.length} single${singles.length===1?'':'s'}, ${parlays.length} parlay${parlays.length===1?'':'s'}${s.pending?` · ${s.pending} still to play`:''}. Every pick was posted before kickoff at the best price we found.</p>${stats}<p><a class="cta" href="/">Open this week’s board →</a><a href="/trust#official" style="white-space:nowrap">All results →</a></p><h2>Singles</h2><ul class="picks">${singles.map(weeklyPickItem).join('')||'<li>No singles this week.</li>'}</ul>${parlays.length?`<h2>Parlays</h2><ul class="picks">${parlays.map(weeklyPickItem).join('')}</ul>`:''}${pmSection}<nav class="pager">${prev}${next}</nav>`;
  return new Response(weeklyShell({track:await siteTrack(env),title,description,path:`/picks/${season}/week-${week}`,body}),{headers});
}
// NBA pages for search (/nba and /nba/<night>): every official NBA pick by
// night, server-rendered like the NFL weekly pages, with the NBA record.
const nbaNightLabel=night=>new Date(`${night}T12:00:00Z`).toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric',timeZone:'UTC'});
const nbaPickItem=r=>{const html=weeklyPickItem(r);return r.result==='push'&&recordLegs(r).every(l=>l.voided)?html.replace('>Push</span>','>No action</span>'):html};
async function nbaPage(request,env){
  if(!env.DB)return null;
  const url=new URL(request.url),headers={'content-type':'text/html; charset=utf-8','cache-control':'public, max-age=300'};
  const all=(await env.DB.prepare("SELECT * FROM public_recommendations WHERE source='market-verified-v2' AND id LIKE 'nba|%' ORDER BY game_time,posted_at").all()).results||[];
  const season=weeklySummary(all),graded=season.wins+season.losses+season.pushes,record=`${season.wins}–${season.losses}${season.pushes?`–${season.pushes}`:''}`;
  const stats=s=>{const g=s.wins+s.losses+s.pushes;return g?`<div class="stats"><div class="stat"><strong>${s.wins}–${s.losses}${s.pushes?`–${s.pushes}`:''}</strong><span>singles record</span></div><div class="stat ${s.profit>=0?'up':'down'}"><strong>${weeklyMoney(s.profit)}</strong><span>betting $100 a pick</span></div>${s.tracked?`<div class="stat"><strong>${s.beat} of ${s.tracked}</strong><span>beat the closing price</span></div>`:''}${s.parlayWins+s.parlayLosses?`<div class="stat ${s.parlayProfit>=0?'up':'down'}"><strong>${s.parlayWins}–${s.parlayLosses}</strong><span>parlays · ${weeklyMoney(s.parlayProfit)}</span></div>`:''}</div>`:''};
  const nights=[...new Set(all.map(r=>String(r.id).split('|')[1]))].sort().reverse();
  if(url.pathname==='/nba'||url.pathname==='/nba/'){
    const items=nights.map(n=>{const rows=all.filter(r=>String(r.id).startsWith(`nba|${n}|`)),s=weeklySummary(rows),g=s.wins+s.losses+s.pushes;return `<li><a href="/nba/${n}"><span><strong>${weeklyEscape(nbaNightLabel(n).replace(/, \d{4}$/,''))}</strong> <small>${rows.length} pick${rows.length===1?'':'s'}</small></span><small>${g?`${s.wins}–${s.losses}${s.pushes?`–${s.pushes}`:''} · ${weeklyMoney(s.profit)}`:'To play'}</small></a></li>`}).join('');
    const body=`<p class="eyebrow">OFFICIAL NBA PICKS</p><h1>NBA player prop picks tonight</h1><p class="lead">Free NBA player prop picks, posted the moment a sportsbook price beats the fair line across the big books. Only the best prices post: 1.5% or more over the fair line, up to 10 a night, each locked before tip-off and graded from the box score, losses included.${graded?` NBA record: ${record}, ${weeklyMoney(season.profit)} at $100 a pick.`:' The first picks post for opening night, Tuesday, October 20.'}</p>${stats(season)}<p><a class="cta" href="/?league=NBA">Tonight’s NBA board →</a><a href="/trust#nba" style="white-space:nowrap">NBA results →</a></p>${items?`<h2>Every night</h2><ul class="weeks">${items}</ul>`:''}`;
    return new Response(weeklyShell({track:await siteTrack(env),title:'NBA Player Prop Picks Tonight: Free, Graded in Public | Bet This Guy',description:graded?`Free NBA player prop picks every night, locked before tip-off and graded in public: ${record} on singles, ${weeklyMoney(season.profit)} at $100 a pick.`:'Free NBA player prop picks every night from opening night, Oct 20: priced against the fair line across the big books, locked before tip-off, graded in public.',path:'/nba',body}),{headers});
  }
  const m=url.pathname.match(/^\/nba\/(\d{4}-\d{2}-\d{2})\/?$/);if(!m||!nights.includes(m[1]))return null;
  const night=m[1],rows=all.filter(r=>String(r.id).startsWith(`nba|${night}|`)),s=weeklySummary(rows),singles=rows.filter(r=>r.kind==='prop'),parlays=rows.filter(r=>r.kind==='parlay'),g=s.wins+s.losses+s.pushes;
  const i=nights.indexOf(night),newer=nights[i-1],older=nights[i+1],label=nbaNightLabel(night);
  const body=`<p class="eyebrow">OFFICIAL NBA PICKS</p><h1>NBA player prop picks: ${weeklyEscape(label.replace(/, \d{4}$/,''))}</h1><p class="lead">${singles.length} single${singles.length===1?'':'s'}, ${parlays.length} parlay${parlays.length===1?'':'s'}${s.pending?` · ${s.pending} still to play`:''}. Every pick was posted before tip-off at the best price we found. A player who doesn’t play is no action, like at the sportsbook.</p>${stats(s)}<p><a class="cta" href="/?league=NBA">Tonight’s NBA board →</a><a href="/nba" style="white-space:nowrap">Every night →</a></p><h2>Singles</h2><ul class="picks">${singles.map(nbaPickItem).join('')||'<li>No singles this night.</li>'}</ul>${parlays.length?`<h2>Parlays</h2><ul class="picks">${parlays.map(nbaPickItem).join('')}</ul>`:''}<nav class="pager">${older?`<a href="/nba/${older}">← Earlier night</a>`:'<span></span>'}${newer?`<a href="/nba/${newer}">Later night →</a>`:'<span></span>'}</nav>`;
  return new Response(weeklyShell({track:await siteTrack(env),title:`NBA Player Prop Picks ${label.replace(/^\w+, /,'')} | Bet This Guy`,description:g?`Every official NBA player prop pick for ${label}: ${s.wins}–${s.losses} on singles, ${weeklyMoney(s.profit)} at $100 a pick. Prices, books and results.`:`Official NBA player prop picks for ${label}, locked before tip-off, with prices and books. Results post as games finish.`,path:`/nba/${night}`,body}),{headers});
}
async function weeklySitemap(env){
  const paths=['/','/about','/trust','/legal','/picks','/where','/nba'];
  try{const nights=await env.DB.prepare("SELECT DISTINCT substr(id,5,10) AS night FROM public_recommendations WHERE source='market-verified-v2' AND id LIKE 'nba|%' ORDER BY night").all();for(const n of nights.results||[])if(/^\d{4}-\d{2}-\d{2}$/.test(n.night))paths.push(`/nba/${n.night}`)}catch{}
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
  // Replies: per pick, its graphic and three short captions to post as a reply
  // under a big account's game post (no link: X shows link replies less).
  out.replies={mode:'replies',ready:(kit.replies||[]).length>0,empty:'No upcoming official picks right now. Replies show up here as soon as a pick posts.',items:(kit.replies||[]).map(r=>{
    const nba=r.sport==='NBA',start=nba?'tip-off':'kickoff',b=r.kind==='parlay'?`${r.legs.length}-leg parlay (${odds(r.combined_odds)})`:`${r.player} ${bet(r,false)}`,price=odds(r.kind==='parlay'?r.combined_odds:r.odds);
    const edge=Number(r.edge),fair=Number.isFinite(edge)&&edge>0?`${edge.toFixed(1)}% better than the fair price across the books`:'better than the fair price across the books';
    const legsLine=r.kind==='parlay'?'\n'+r.legs.map(l=>`• ${l.player} ${bet(l,false)}`).join('\n'):'';
    const captions=r.kind==='parlay'?[
      `Our ${b}:${legsLine}\nEvery leg priced better than fair. Locked before ${start}, graded in public. Link in bio.`,
      `Riding this one tonight 👇${legsLine}\n${price}, $25. Win or lose, it goes on our public record.`,
      `${b} locked 🔒${legsLine}\nFull card + record in bio.`
    ]:[
      `We’re on ${b} (${price}${r.book?` at ${r.book}`:''}). Priced ${fair}. Every pick is graded in public, link in bio.`,
      `${b} is our play. Locked at ${price} before ${start}, and it goes on our public record win or lose 📈`,
      `Tailing ${b} (${price}) 🔒 Full card + record in bio.`
    ];
    const who=r.kind==='parlay'?r.legs.map(l=>l.player):[r.player];
    return {id:r.id,sport:r.sport,title:r.kind==='parlay'?`${r.legs.length}-leg parlay · ${price}`:`${r.player} · ${price}`,sub:[r.kind==='parlay'?r.legs.map(l=>`${String(l.player).split(' ').pop()} ${bet(l,true)}`).join(' + '):bet(r,false),time(r.game_time)].join(' · '),
      image:`/api/x-card.png?id=${encodeURIComponent(r.id)}`,search:`https://x.com/search?q=${encodeURIComponent(who.map(n=>`"${n}"`).join(' OR '))}&f=live`,captions:captions.map(c=>c.length>270?c.slice(0,269)+'…':c)};
  })};
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
  let mode=location.hash==='#replies'?'replies':texts.today.ready||!texts.current.ready?'today':'current',imageBlob=null;
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
  const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);
  // Replies tab: one card per pick, its graphic, three captions and a live X search for the player.
  function showReplies(t){
    const host=$('#replies');host.hidden=!t.ready;if(!t.ready)return;
    host.innerHTML=`<p class="tip">Reply under game-day posts from big betting and team accounts, or under people already talking about the player (Find posts). Vary the caption, attach the graphic, and keep it to a handful of replies per game so X doesn’t flag it.</p>`+t.items.map((r,i)=>`<section class="card"><div class="card-head"><h2>${esc(r.title)}</h2><small>${esc(r.sport)}</small></div><p class="tip" style="margin:0 0 10px">${esc(r.sub)}</p><img src="${esc(r.image)}" alt="Pick graphic" loading="lazy" style="width:100%;max-width:420px;aspect-ratio:16/9;background:#181a1d;border-radius:14px;border:1px solid rgba(255,255,255,.12);display:block;margin:0 0 10px"><div class="row" role="group" aria-label="Caption">${r.captions.map((c,j)=>`<button type="button" data-cap="${i}:${j}" aria-pressed="${j===0}">Caption ${j+1}</button>`).join('')}</div><textarea id="rep${i}" rows="4" aria-label="Reply text">${esc(r.captions[0])}</textarea><div class="row"><button type="button" class="primary" data-rcopy="${i}">Copy</button><button type="button" data-rimg="${i}">Save image</button><a class="btn" href="${esc(r.search)}" target="_blank" rel="noopener">Find posts</a></div></section>`).join('');
    host.querySelectorAll('[data-cap]').forEach(b=>b.onclick=()=>{const [i,j]=b.dataset.cap.split(':').map(Number);$(`#rep${i}`).value=t.items[i].captions[j];b.parentElement.querySelectorAll('[data-cap]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)))});
    host.querySelectorAll('[data-rcopy]').forEach(b=>b.onclick=()=>{copy($(`#rep${b.dataset.rcopy}`).value,b);count('reply:copy')});
    host.querySelectorAll('[data-rimg]').forEach(b=>b.onclick=async()=>{const r=t.items[+b.dataset.rimg];count('reply:image');try{const blob=await (await fetch(r.image)).blob(),file=new File([blob],'bet-this-guy-pick.png',{type:'image/png'});if(navigator.canShare?.({files:[file]})){try{await navigator.share({files:[file]});return}catch(e){if(e?.name==='AbortError')return}}const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=file.name;a.click()}catch{b.textContent='Try again'}});
  }
  async function show(){
    document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));
    const t=texts[mode];$('#replies').hidden=true;
    if(mode==='replies'){$('#kit').hidden=true;$('#empty').hidden=t.ready;$('#empty').textContent=t.empty;showReplies(t);return}
    $('#empty').hidden=t.ready;$('#kit').hidden=!t.ready;$('#empty').textContent=t.empty;if(!t.ready)return;
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
  const slim=r=>{const legs=recordLegs(r);return {kind:r.kind,posted_at:r.posted_at,player:r.player,market:r.market,side:r.side,line:r.line,odds:r.odds,combined_odds:r.combined_odds,game_time:r.game_time,result:weeklyGraded(r)?r.result:null,book:legs[0]?.book||null,team:legs[0]?.team||null,beat:beat(r),closing_odds:r.closing_odds??null,legs:legs.map(l=>({player:l.player,market:l.market,side:l.side,line:l.line,odds:l.odds,team:l.team||null,actualValue:l.actualValue??null}))}};
  const pack=(start,rows)=>{const nfl=nflWeekOf(start);return {week:nfl?.week||null,season:nfl?.season||null,path:nfl?`/picks/${nfl.season}/week-${nfl.week}`:'/picks',summary:weeklySummary(rows),rows:rows.map(slim)}};
  const [thisWeek,lastWeek]=await Promise.all([weeklyRows(env,week),weeklyRows(env,previous)]);
  // Replies: every official pick (NFL this week, NBA tonight and later) whose first game hasn't started.
  const firstGame=r=>Math.min(...recordLegs(r).map(l=>Date.parse(l.gameTime)).filter(Number.isFinite),Date.parse(r.game_time));
  const nba=(await env.DB.prepare("SELECT * FROM public_recommendations WHERE source='market-verified-v2' AND id>=? AND id<'nba|~' ORDER BY game_time").bind(`nba|${nbaNight(now)}|`).all().catch(()=>({results:[]}))).results||[];
  const replies=[...thisWeek,...nba].filter(r=>firstGame(r)>now).sort((a,b)=>firstGame(a)-firstGame(b)).slice(0,30).map(r=>({...slim(r),id:r.id,sport:String(r.id).startsWith('nba|')?'NBA':'NFL',edge:Number(recordLegs(r)[0]?.edge)||null}));
  return {site:SITE_URL,upcoming:thisWeek.filter(r=>Date.parse(r.game_time)>now).map(slim),current:pack(week,thisWeek),previous:pack(previous,lastWeek),replies};
}
async function postKitPage(request,env){
  if(!env.DB)return new Response('Unavailable',{status:503});
  const kit=await postKitData(env),json=JSON.stringify(kit).replace(/</g,'\\u003c');
  const button='min-height:40px;padding:0 16px;border-radius:999px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.06);color:#e8f2ff;font:700 14px "Space Grotesk",sans-serif;cursor:pointer';
  const card=(id,name,extra)=>`<section class="card"><div class="card-head"><h2>${name}</h2><small id="${id}Count"></small></div><textarea id="${id}Text" rows="${id==='reddit'?10:7}" spellcheck="true" aria-label="${name} post text"></textarea><div class="row"><button type="button" class="primary" data-copy="${id}">Copy</button>${extra}</div></section>`;
  const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#0e1013"><title>Post kit · Bet This Guy</title><link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@600;700&display=swap" rel="stylesheet"><style>body{margin:0;background:#0e1013;color:#edf1f7;font:15px/1.5 "DM Sans",system-ui,sans-serif}main{max-width:760px;margin:0 auto;padding:20px 16px 48px}a{color:#6aa8ff}header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}header img{width:auto;height:28px;display:block}h1,h2{font-family:"Space Grotesk",sans-serif;color:#fff;line-height:1.15}h1{font-size:clamp(24px,5vw,32px);margin:4px 0}h2{font-size:17px;margin:0}.eyebrow{margin:0;color:#5ff0b5;font:700 12px "Space Grotesk",sans-serif;letter-spacing:.16em}.lead{margin:0 0 16px;color:#b5b9bf}.tabs{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 16px}.tabs button{${button}}.tabs button[aria-pressed="true"]{border-color:rgba(31,216,143,.6);background:rgba(31,216,143,.14);color:#5ff0b5}#empty{padding:16px;border-radius:14px;background:rgba(255,255,255,.05);color:#dce0e6}.image{display:grid;gap:10px;margin:0 0 18px}.image img{width:100%;max-width:420px;border-radius:16px;border:1px solid rgba(255,255,255,.12);background:#26282b;aspect-ratio:4/5}.card{margin:0 0 14px;padding:14px;border-radius:16px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1)}.card-head{display:flex;justify-content:space-between;align-items:baseline;margin:0 0 8px}.card-head small{color:#a6aab0}textarea{box-sizing:border-box;width:100%;padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:#181a1d;color:#edf1f7;font:16px/1.45 "DM Sans",system-ui,sans-serif;resize:vertical}.row{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;align-items:center}.row button,.row a.btn{${button};display:inline-flex;align-items:center;text-decoration:none}.row .primary{border:0;background:#2563eb;color:#fff}.row button[aria-pressed="true"]{border-color:rgba(31,216,143,.6);background:rgba(31,216,143,.14);color:#5ff0b5}.tip{color:#a6aab0;font-size:12.5px;margin:6px 0 0}@media (display-mode: standalone){body{padding-top:env(safe-area-inset-top)}}.site-nav{display:flex;align-items:center;gap:18px}.site-nav a{color:#98a1ad;font:600 14px/1 "DM Sans",sans-serif;text-decoration:none;padding:10px 0}.site-nav a[aria-current=page]{color:#f2f4f7}.site-nav a:hover{color:#f2f4f7}</style></head><body><main><header><a href="/"><img src="/logo.png" alt="Bet This Guy"></a><nav class="site-nav" aria-label="Main"><a href="/">Picks</a><a href="/trust">Results</a><a href="/about">About</a></nav></header><p class="eyebrow">POST KIT</p><h1>Share the picks</h1><p class="lead">Pick what to post, copy the text for each app, and attach the image. You can edit any text before copying.</p><div class="tabs" role="group" aria-label="What to post"><button type="button" data-mode="today">Today’s picks</button><button type="button" data-mode="current">This week’s results</button><button type="button" data-mode="previous">Last week’s results</button><button type="button" data-mode="replies">Replies</button></div><p id="empty" hidden></p><div id="replies" hidden></div><div id="kit" hidden><div class="image"><img id="preview" alt="Share image preview"><div class="row"><button type="button" class="primary" id="shareImage">Share or save image</button></div></div>${card('x','X (Twitter)','<button type="button" id="openX">Open X</button>')}${card('threads','Threads','<button type="button" id="openThreads">Open Threads</button>')}${card('reddit','Reddit','<a class="btn" href="https://www.reddit.com/r/sportsbook/" target="_blank" rel="noopener">Open r/sportsbook</a>')}<p class="tip">Reddit: post in the daily picks thread and check each subreddit’s rules; some remove links, so delete the last line if needed.</p></div></main><script type="application/json" id="kitData">${json}</script><script>${postKitTexts.toString()}\n(${postKitClient.toString()})(JSON.parse(document.getElementById('kitData').textContent),postKitTexts(JSON.parse(document.getElementById('kitData').textContent)));</script></body></html>`;
  return new Response(html,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-robots-tag':'noindex'}});
}

// A plain-text summary of the official record for the top of /trust, cached
// for five minutes per Worker instance.
let trustSnapshotCache={at:0,html:''};
async function trustSnapshot(env,now=Date.now()){
  if(trustSnapshotCache.html&&now-trustSnapshotCache.at<300000)return trustSnapshotCache.html;
  const rows=(await env.DB.prepare("SELECT id,kind,posted_at,odds,combined_odds,status,result,closing_line,closing_odds,closing_captured_at,line,legs_json FROM public_recommendations WHERE source='market-verified-v2' AND id LIKE 'official|%'").all()).results||[];
  const s=weeklySummary(rows),weeks=new Set(rows.map(r=>String(r.id).slice(9,19))).size,graded=s.wins+s.losses+s.pushes;
  const record=`${s.wins}–${s.losses}${s.pushes?`–${s.pushes}`:''}`,parlays=s.parlayWins+s.parlayLosses?` Parlays: ${s.parlayWins}–${s.parlayLosses} <span class="nowrap">(${weeklyMoney(s.parlayProfit)})</span>.`:'';
  const html=graded?`<p class="record-snapshot"><strong>Official record: ${record} on player props, ${weeklyMoney(s.profit)} betting \u0024100 a pick.</strong>${parlays} ${rows.length} official picks across ${weeks} week${weeks===1?'':'s'}, each locked before kickoff and graded from box scores. <a href="/picks">See every pick, week by week →</a></p>`:`<p class="record-snapshot">The official record started with the Sept. 24–28 slate. Every pick is locked before kickoff and graded from box scores. <a href="/picks">See the picks week by week →</a></p>`;
  trustSnapshotCache={at:now,html};
  return html;
}

// Anonymous usage counts: daily totals per metric. No cookies, IP addresses or
// per-person identifiers are stored; unknown metric names are ignored.
const USAGE_METRICS=new Set(['card:stats','slip:copy','slip:topm','alerts:x','alerts:chooser','alerts:choose-email','alerts:choose-site','go:safari','go:novig','a2hs:shown','alerts:banner-hide','alerts:fromweek','alerts:lapsed','alerts:denied','alerts:unsupported','board:browse','board:value','empty:alerts','email:pitch','hero:picks','official:bet','prop:bet','slip:addpicks','view:nba','sheet:alerts','sheet:email','sheet:xproof','email:subscribe','email:open','reply:copy','reply:image','partner:novig:copy','app:novig','app:prophetx','app:kalshi','app:polymarket','app:betopenly','welcome:shown','welcome:alerts','welcome:account','welcome:skip','welcome:close','welcome:reopen','view:home','view:trust','view:picks','view:week','visit:new','visit:return','card:open','slip:add','parlay:add','share','hit:open','profile:open','affiliate:click','alerts:on','alerts:off','gate:shown','gate:signup','gate:login','nudge:shown','nudge:alerts','nudge:signup','alerts:email','view:post','post:copy','post:open','post:image','src:reddit','src:x','src:google','src:social','src:other','src:direct']);
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
  // What this phone is pinged for: sportsbook picks and/or prediction app picks.
  const sub=endpoint&&validPushEndpoint(endpoint)?await env.DB.prepare('SELECT price_view,state,alert_sportsbook,alert_predictions,alert_nba FROM push_subscriptions WHERE endpoint=?').bind(endpoint).first().catch(()=>null):null;
  const wantSb=!sub||sub.alert_sportsbook!==0,wantPm=Boolean(sub&&(sub.alert_predictions??(sub.price_view==='predictions'?1:0)));
  // NBA picks newer than any NFL pick (posted in the last 3 hours): that's what this phone was pinged for.
  if(!sub||sub.alert_nba!==0){
    const nfl=(await env.DB.prepare("SELECT MAX(posted_at) AS at FROM public_recommendations WHERE source='market-verified-v2' AND id LIKE 'official|%'").all()).results?.[0]?.at||'';
    const nba=(await env.DB.prepare("SELECT id,kind,player,market,side,line,odds,combined_odds,legs_json FROM public_recommendations WHERE source='market-verified-v2' AND id LIKE 'nba|%' AND posted_at>=? AND posted_at>? ORDER BY posted_at DESC LIMIT 3").bind(new Date(now-3*3600000).toISOString(),nfl).all()).results||[];
    if(nba.length)return {title:nba.length===1?'🏀 New NBA pick':`🏀 ${nba.length} new NBA picks`,body:nba.map(r=>{const legs=recordLegs(r),f=legs[0]||{};return r.kind==='parlay'?`${legs.length}-leg parlay (${weeklyOdds(r.combined_odds)}): ${legs.map(l=>l.player).join(' + ')}`:`${r.player} ${weeklyLegText(r)} (${weeklyOdds(r.odds)}${f.book?`, ${f.book}`:''})`}).join('\n'),url:pickUrl(nba[0].id,'league=NBA&')};
  }
  const picks=wantSb?((await env.DB.prepare("SELECT id,kind,player,market,side,line,odds,combined_odds,legs_json FROM public_recommendations WHERE source='market-verified-v2' AND id LIKE 'official|%' AND posted_at>=? ORDER BY posted_at DESC LIMIT 3").bind(new Date(now-3*3600000).toISOString()).all()).results||[]):[];
  // A newer prediction pick or parlay than any official pick: that's what this phone was pinged for.
  if(wantPm){
    const newest=picks.length?(await env.DB.prepare("SELECT MAX(posted_at) AS at FROM public_recommendations WHERE source='market-verified-v2' AND id LIKE 'official|%'").first())?.at||'':'';
    const fresh=(await env.DB.prepare('SELECT * FROM prediction_picks WHERE posted_at>=? AND posted_at>? ORDER BY posted_at DESC LIMIT 3').bind(new Date(now-3*3600000).toISOString(),newest).all()).results||[];
    if(fresh.length)return predictionAlert(fresh);
    const fp=(await env.DB.prepare('SELECT * FROM prediction_parlays WHERE posted_at>=? AND posted_at>? ORDER BY posted_at DESC LIMIT 2').bind(new Date(now-3*3600000).toISOString(),newest).all().catch(()=>({results:[]}))).results||[];
    if(fp.length)return {title:fp.length===1?'📈 New prediction market parlay':`📈 ${fp.length} new prediction market parlays`,body:fp.map(predictionParlayText).join('\n'),url:pickUrl(fp[0].id,'view=predictions&')};
  }
  if(!picks.length)return wantSb?{title:'New Bet This Guy picks',body:'Fresh official picks are on the board.',url:'/'}:{title:'New prediction market picks',body:'Fresh prediction app picks are on the board.',url:'/'};
  // A phone set to prediction markets gets each pick's prediction-market chances
  // (from the exchanges open in its state) in place of the sportsbook odds.
  const pm=sub?.price_view==='predictions';
  const line=r=>{if(r.kind==='parlay')return `${recordLegs(r).length}-leg parlay (${weeklyOdds(r.combined_odds)}): ${recordLegs(r).map(l=>l.player).join(' + ')}`;
    if(pm){const ex=exchangeLine(r,sub.state||null),any=exchangeLine(r,sub.state||null,1,true);return `${r.player} ${weeklyLegText(r)}: ${ex?`good value on ${ex}`:any?`${any} is worse than fair, skip on prediction markets (${weeklyOdds(r.odds)} at sportsbooks)`:`not on prediction markets yet (${weeklyOdds(r.odds)} at sportsbooks)`}`}
    return `${r.player} ${weeklyLegText(r)} (${weeklyOdds(r.odds)})`};
  return {title:picks.length===1?'✅ New Bet This Guy pick':`✅ ${picks.length} new Bet This Guy picks`,body:picks.map(line).join('\n'),url:pickUrl(picks[0].id,pm?'view=predictions&':'')};
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
  let subs=(await env.DB.prepare(only?'SELECT endpoint,failures FROM push_subscriptions LIMIT 2000':'SELECT endpoint,failures FROM push_subscriptions WHERE COALESCE(alert_sportsbook,1)=1 LIMIT 2000').all()).results||[];
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
// Prediction picks alert the phones set to prediction markets, once per batch
// of new picks, only where at least one new pick's exchange is open in the
// phone's state (or the state isn't known).
async function sendPredictionAlerts(env,now=Date.now()){
  if(!env.DB)return {sent:0};
  const done=await appSetting(env,'pm-alert-for')||'';
  const since=done||new Date(now-3*3600000).toISOString(),upcoming=new Date(now).toISOString();
  const fresh=[...((await env.DB.prepare('SELECT exchange,posted_at FROM prediction_picks WHERE posted_at>? AND game_time>?').bind(since,upcoming).all()).results||[]),...((await env.DB.prepare('SELECT exchange,posted_at FROM prediction_parlays WHERE posted_at>? AND game_time>?').bind(since,upcoming).all().catch(()=>({results:[]}))).results||[])].sort((a,b)=>a.posted_at.localeCompare(b.posted_at));
  if(!fresh.length)return {sent:0};
  await setAppSetting(env,'pm-alert-for',fresh.at(-1).posted_at);
  const keys=[...new Set(fresh.map(r=>Object.keys(EXCHANGES).find(k=>EXCHANGES[k]===r.exchange)))];
  const subs=(await env.DB.prepare('SELECT endpoint,state FROM push_subscriptions WHERE alert_predictions=1').all()).results||[];
  const only=subs.filter(r=>!r.state||keys.some(k=>!EXCHANGE_EXCLUDED[k]?.includes(r.state))).map(r=>r.endpoint);
  if(!only.length)return {sent:0,picks:fresh.length};
  return {...await sendPickAlerts(env,now,only),picks:fresh.length};
}
// Official NBA picks: one push per new batch to phones with NBA alerts on
// (the phone then reads /api/alerts/latest for the text).
async function sendNbaAlerts(env,now=Date.now()){
  if(!env.DB)return {sent:0};
  const done=await appSetting(env,'nba-alert-for')||new Date(now-3*3600000).toISOString();
  const fresh=(await env.DB.prepare("SELECT posted_at FROM public_recommendations WHERE source='market-verified-v2' AND id LIKE 'nba|%' AND posted_at>? AND game_time>? ORDER BY posted_at").bind(done,new Date(now).toISOString()).all()).results||[];
  if(!fresh.length)return {sent:0};
  await setAppSetting(env,'nba-alert-for',fresh.at(-1).posted_at);
  const only=((await env.DB.prepare('SELECT endpoint FROM push_subscriptions WHERE COALESCE(alert_nba,1)=1').all().catch(()=>({results:[]}))).results||[]).map(r=>r.endpoint);
  if(!only.length)return {sent:0,picks:fresh.length};
  return {...await sendPickAlerts(env,now,only),picks:fresh.length};
}
// One-off email (partner outreach): the app_settings key email-custom holds
// JSON {id,to,subject,text,from?,bcc?}. Sent once per id, plain text, from a
// betthisguy.com address with replies to support; bcc (a betthisguy.com
// address) gets a copy so the sender sees exactly what went out. Nothing is sent without it.
async function sendCustomEmail(env,now=Date.now()){
  if(!env.DB||!env.RESEND_API_KEY)return {none:true};
  let m=null;try{m=JSON.parse(await appSetting(env,'email-custom')||'null')}catch{}
  if(!m||!/^[\w-]{1,40}$/.test(String(m.id||''))||!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(String(m.to||''))||!m.subject||!m.text)return {none:true};
  const key=`email-custom-sent:${m.id}`;if(!(await xClaim(env,key,now)))return {done:true};
  const from=/^[^<>]{0,60}<[\w.+-]+@betthisguy\.com>$/.test(String(m.from||''))?m.from:EMAIL_ALERT_FROM;
  const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:`Bearer ${env.RESEND_API_KEY}`,'content-type':'application/json'},body:JSON.stringify({from,to:[m.to],reply_to:env.EMAIL_REPLY_TO||'support@betthisguy.com',...(/^[\w.+-]+@betthisguy\.com$/.test(String(m.bcc||''))?{bcc:[m.bcc]}:{}),subject:String(m.subject).slice(0,200),text:String(m.text).slice(0,8000)}),signal:AbortSignal.timeout(15000)}).catch(error=>({ok:false,status:0,json:async()=>({message:error.message})}));
  if(!r.ok){const why=String((await r.json().catch(()=>({})))?.message||'').slice(0,160);await env.DB.prepare('DELETE FROM app_settings WHERE key=?').bind(key).run().catch(()=>{});await setAppSetting(env,'email-custom-error',`${new Date(now).toISOString()} ${r.status} ${why}`).catch(()=>{});return {sent:0,error:r.status}}
  const id=(await r.json().catch(()=>({})))?.id||'';await xDone(env,key,now);await setAppSetting(env,'email-custom-result',`${new Date(now).toISOString()} sent ${m.id} ${id}`).catch(()=>{});
  return {sent:1};
}
// Official NBA picks by email, to accounts with email alerts and NBA on.
// NBA picks post one game at a time across the day, so they're batched: one
// email at most every 3 hours, or after 10 minutes when a new pick tips off
// within 90 minutes.
const NBA_EMAIL_GAP=3*3600000;
async function sendNbaEmails(env,now=Date.now()){
  if(!env.DB||!env.RESEND_API_KEY)return {sent:0,disabled:true};
  const last=await appSetting(env,'nba-email-for'),lastTime=Date.parse(String(last||'').split('|')[1]||'');
  const since=String(last||'').split('|')[0]||new Date(now-3*3600000).toISOString();
  const picks=(await env.DB.prepare("SELECT kind,player,market,side,line,odds,combined_odds,legs_json,game_time,posted_at FROM public_recommendations WHERE source='market-verified-v2' AND id LIKE 'nba|%' AND posted_at>? AND game_time>? ORDER BY game_time,posted_at LIMIT 12").bind(since,new Date(now).toISOString()).all()).results||[];
  if(!picks.length)return {sent:0};
  const soonest=Math.min(...picks.map(r=>Date.parse(r.game_time)||Infinity));
  if(Number.isFinite(lastTime)&&now-lastTime<(soonest-now<90*60000?10*60000:NBA_EMAIL_GAP))return {sent:0,waiting:picks.length};
  // Claim: newest posted time and send time, so two instances can't send twice.
  const newest=picks.reduce((m,r)=>r.posted_at>m?r.posted_at:m,''),value=`${newest}|${new Date(now).toISOString()}`;
  const claim=last==null?await env.DB.prepare('INSERT OR IGNORE INTO app_settings (key,value) VALUES (?,?)').bind('nba-email-for',value).run():await env.DB.prepare('UPDATE app_settings SET value=? WHERE key=? AND value=?').bind(value,'nba-email-for',last).run();
  if(!Number(claim?.meta?.changes??claim?.changes))return {sent:0,claimed:false};
  const people=await emailPeople(env,'nba');
  if(!people.length)return {sent:0,picks:picks.length};
  const subject=picks.length===1?(picks[0].kind==='parlay'?`🏀 New NBA ${recordLegs(picks[0]).length}-leg parlay (${weeklyOdds(picks[0].combined_odds)})`:`🏀 New NBA pick: ${picks[0].player} ${weeklyLegText(picks[0])}`):`🏀 ${picks.length} new NBA picks`;
  const heading=picks.length===1?'A new NBA pick just posted':`${picks.length} new NBA picks just posted`;
  const from=env.EMAIL_FROM||EMAIL_ALERT_FROM,postal=String(env.EMAIL_POSTAL_ADDRESS||'').trim(),opts={subject,heading:weeklyEscape(heading),eyebrow:'NBA PICK',lede:'Locked before tip-off and graded in public, with its own NBA record.',rowsHtml:picks.map(emailPickRow).join(''),ctaUrl:`${SITE_URL}/?league=NBA`};
  let sent=0;
  for(let i=0;i<people.length;i+=100){
    const batch=people.slice(i,i+100).map(person=>{const unsubscribe=`${SITE_URL}/api/email-alerts/unsubscribe?token=${person.token}`;return {from,to:[person.email],reply_to:env.EMAIL_REPLY_TO||'support@betthisguy.com',subject,html:emailAlertHtml(picks,unsubscribe,postal,opts),text:emailAlertText(picks,unsubscribe,postal,{heading}).replace(`See the picks: ${SITE_URL}/`,`See the picks: ${SITE_URL}/?league=NBA`),headers:{'List-Unsubscribe':`<${unsubscribe}>`,'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'}}});
    try{const response=await fetch('https://api.resend.com/emails/batch',{method:'POST',headers:{authorization:`Bearer ${env.RESEND_API_KEY}`,'content-type':'application/json'},body:JSON.stringify(batch),signal:AbortSignal.timeout(15000)});if(response.ok)sent+=batch.length;else console.warn('nba_emails_failed',response.status)}
    catch(error){console.warn('nba_emails_failed',error.message)}
  }
  return {sent,total:people.length,picks:picks.length};
}
async function sendDueAlerts(env,now=Date.now()){
  if(!env.DB)return {sent:0};
  const custom=await sendCustomEmail(env,now).catch(error=>({error:error.message}));
  const nba=await sendNbaAlerts(env,now).catch(error=>({error:error.message}));
  const nbaEmails=await sendNbaEmails(env,now).catch(error=>({error:error.message}));
  const predictions=await sendPredictionAlerts(env,now).catch(error=>({error:error.message}));
  const predictionEmails=await sendPredictionEmails(env,now).catch(error=>({error:error.message}));
  return {...await sendOfficialAlerts(env,now),nba,nbaEmails,predictions,predictionEmails,...(custom.none?{}:{custom})};
}
async function sendOfficialAlerts(env,now=Date.now()){
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
  // A returning phone asks whether we still hold its subscription (an expired one is deleted on send).
  if(url.pathname==='/api/alerts/check'){const rows=(await env.DB.prepare('SELECT 1 AS ok FROM push_subscriptions WHERE endpoint=? LIMIT 1').bind(endpoint).all()).results||[];return reply({success:true,active:rows.length>0})}
  if(url.pathname==='/api/alerts/subscribe'){
    const p256dh=String(body?.keys?.p256dh||''),auth=String(body?.keys?.auth||'');
    if(!/^[A-Za-z0-9_-]{40,200}$/.test(p256dh)||!/^[A-Za-z0-9_-]{8,60}$/.test(auth))return reply({success:false,error:'Invalid subscription.'},400);
    // Which picks to ping for; older pages send neither, so prediction pings follow the view.
    const view=body?.priceView==='predictions'?'predictions':'odds',pm=typeof body?.alertPredictions==='boolean'?Number(body.alertPredictions):Number(view==='predictions'),nba=typeof body?.alertNba==='boolean'?Number(body.alertNba):1,sb=typeof body?.alertSportsbook==='boolean'?Number(body.alertSportsbook||(!pm&&!(body?.alertNba===true))):1;
    await env.DB.prepare('INSERT INTO push_subscriptions (endpoint,p256dh,auth,created_at,failures,books_json,follows_json,price_view,state,alert_sportsbook,alert_predictions,alert_nba) VALUES (?,?,?,?,0,?,?,?,?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET p256dh=excluded.p256dh,auth=excluded.auth,failures=0,books_json=excluded.books_json,follows_json=excluded.follows_json,price_view=excluded.price_view,state=excluded.state,alert_sportsbook=excluded.alert_sportsbook,alert_predictions=excluded.alert_predictions,alert_nba=excluded.alert_nba').bind(endpoint,p256dh,auth,new Date().toISOString(),JSON.stringify(cleanBooks(body?.books)),JSON.stringify(cleanFollows(body?.follows)),view,US_STATES[String(body?.state||'').toUpperCase()]?String(body.state).toUpperCase():null,sb,pm,nba).run();
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
const emailPickText=r=>r.kind==='parlay'?`${recordLegs(r).length}-leg parlay (${weeklyOdds(r.combined_odds)}): ${recordLegs(r).map(l=>`${l.player} ${weeklyLegText(l)}`).join(' + ')}`:`${r.player} ${weeklyLegText(r)} (${weeklyOdds(r.odds)})${exchangeLine(r)?`; prediction markets: ${exchangeLine(r)}`:''}`;
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
  const book=recordLegs(r)[0]?.book,ex=exchangeLine(r);
  return `<tr><td style="${cell}"><div style="font-size:16px;font-weight:700;color:#10213d;">${weeklyEscape(r.player)} <span style="float:right;color:#08875e;">${weeklyEscape(weeklyOdds(r.odds))}</span></div><div style="margin-top:4px;font-size:15px;color:#10213d;">${weeklyEscape(weeklyLegText(r))}${book?` <span style="color:#5a6f8c;">at ${weeklyEscape(book)}</span>`:''}</div>${ex?`<div style="margin-top:4px;font-size:13px;color:#4058c8;">Prediction markets: ${weeklyEscape(ex)}</div>`:''}${when}</td></tr><tr><td style="height:10px;"></td></tr>`;
}
function emailAlertHtml(picks,unsubscribeUrl,postal,opts={}){
  const font="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const heading=opts.heading||(picks.length===1?'A new official pick just posted':`${picks.length} new official picks just posted`);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${weeklyEscape(opts.subject||emailSubject(picks))}</title></head><body style="margin:0;padding:0;background:#eef3f9;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eef3f9;"><tr><td align="center" style="padding:28px 12px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;"><tr><td align="center" style="background:#0e1013;border-radius:18px 18px 0 0;padding:24px;"><a href="${SITE_URL}" style="text-decoration:none;"><img src="${SITE_URL}/logo.png" width="220" alt="Bet This Guy" style="display:block;width:200px;max-width:70%;height:auto;border:0;color:#ffffff;font-family:Arial,sans-serif;font-size:22px;font-weight:700;"></a></td></tr><tr><td style="background:#ffffff;border-radius:0 0 18px 18px;padding:28px 24px;font-family:${font};color:#10213d;"><p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:.14em;color:#08875e;">${weeklyEscape(opts.eyebrow||'PICK ALERT')}</p><h1 style="margin:0 0 8px;font-size:24px;line-height:1.25;">${heading}</h1><p style="margin:0 0 20px;font-size:15px;line-height:1.5;color:#40597a;">${weeklyEscape(opts.lede||'Locked before kickoff and graded in public on our results page.')}</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${opts.rowsHtml??picks.map(emailPickRow).join('')}</table><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:14px 0 0;"><tr><td style="border-radius:999px;background:#1fd88f;"><a href="${weeklyEscape(opts.ctaUrl||SITE_URL+'/')}" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:700;color:#04121f;text-decoration:none;border-radius:999px;">${weeklyEscape(opts.ctaLabel||'See the picks')}</a></td></tr></table><p style="margin:18px 0 0;font-size:13px;line-height:1.5;color:#5a6f8c;">${weeklyEscape(opts.note||'Odds move. Check the price at your sportsbook before you bet.')}</p></td></tr><tr><td align="center" style="padding:20px 16px 0;font-family:${font};font-size:12px;line-height:1.6;color:#7f96b8;">You’re getting this because you turned on email alerts for your Bet This Guy account. Questions? Just reply.<br><a href="${weeklyEscape(unsubscribeUrl)}" style="color:#7f96b8;">Unsubscribe</a> · 21+ where legal. Gambling problem? Call 1-800-GAMBLER.${postal?`<br>${weeklyEscape(postal)}`:''}</td></tr></table></td></tr></table></body></html>`;
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
// Everyone who gets pick emails: accounts with email alerts on, plus
// confirmed email-only subscribers, one row per address. kind 'nba' or
// 'predictions' keeps only people who chose those picks.
async function emailPeople(env,kind=null){
  const acct=kind==='nba'?' AND COALESCE(a.nba,1)=1':kind==='predictions'?' AND a.predictions=1':'',sub=kind==='nba'?' AND nba=1':kind==='predictions'?' AND predictions=1':'';
  const accounts=(await env.DB.prepare(`SELECT a.token,p.email FROM email_alerts a JOIN user_profiles p ON p.auth_user_id=a.auth_user_id WHERE a.enabled=1${acct} ORDER BY a.created_at LIMIT 2000`).all()).results||[];
  let subs=[];try{subs=(await env.DB.prepare(`SELECT token,email FROM email_subscribers WHERE status='active'${sub} ORDER BY created_at LIMIT 2000`).all()).results||[]}catch{}
  const seen=new Set(),out=[];for(const p of [...accounts,...subs]){const k=String(p.email||'').trim().toLowerCase();if(!k||seen.has(k))continue;seen.add(k);out.push(p)}
  return out;
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
  const people=await emailPeople(env);
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
  const net=res==='won'||res==='lost'?recordPay(r):0;
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
  const all=(await env.DB.prepare("SELECT kind,posted_at,odds,combined_odds,status,result,closing_line,closing_odds,closing_captured_at,line,legs_json FROM public_recommendations WHERE source='market-verified-v2' AND id LIKE 'official|%' AND id<?").bind(`official|${week}|\uffff`).all()).results||[];
  const s=weeklySummary(rows),season=weeklySummary(all),info=nflWeekOf(week),name=info?`Week ${info.week}`:'Last week';
  const headline=s.wins+s.losses+s.pushes?`${name}: ${digestRecord(s)} on props, ${weeklyMoney(s.profit)}`:`${name} results`;
  const parlays=s.parlayWins+s.parlayLosses?` Parlays ${s.parlayWins}–${s.parlayLosses} (${weeklyMoney(s.parlayProfit)}).`:'';
  const pmLine=predictionWeekLine(await predictionWeek(env,week).catch(()=>({graded:0})));
  // NBA, from opening night: the week's nights and the NBA season, its own record.
  const nbaRows=(await env.DB.prepare("SELECT kind,posted_at,odds,combined_odds,status,result,closing_line,closing_odds,closing_captured_at,line,legs_json FROM public_recommendations WHERE source='market-verified-v2' AND id LIKE 'nba|%' AND game_time>=? AND game_time<?").bind(`${week}T12:00:00Z`,new Date(Date.parse(`${week}T12:00:00Z`)+7*86400000).toISOString()).all().catch(()=>({results:[]}))).results||[];
  const nw=weeklySummary(nbaRows),ns=nw.wins+nw.losses+nw.pushes?await nbaRecordSummary(env).catch(()=>null):null;
  const nbaLine=ns?`NBA: ${digestRecord(nw)}, ${weeklyMoney(nw.profit+nw.parlayProfit)} (season ${digestRecord(ns)}, ${weeklyMoney(ns.profit+ns.parlayProfit)}).`:'';
  const lede=`Betting \u0024100 a pick.${parlays}${pmLine?` ${pmLine}`:''}${nbaLine?` ${nbaLine}`:''} Season: ${digestRecord(season)} on props, ${weeklyMoney(season.profit)}. This week's picks post the moment a price qualifies, any day before kickoff, and we'll email you when they do.`;
  const subject=`📊 ${headline}`,page=info?`${SITE_URL}/picks/${info.season}/week-${info.week}`:`${SITE_URL}/trust`;
  const people=await emailPeople(env);
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
async function xPost(env,text,mediaId=null,replyTo=null,quote=null){
  const url='https://api.twitter.com/2/tweets',body={text};
  if(quote)body.quote_tweet_id=String(quote);
  if(mediaId)body.media={media_ids:[mediaId]};
  if(replyTo)body.reply={in_reply_to_tweet_id:String(replyTo)};
  const response=await fetch(url,{method:'POST',headers:{authorization:await xOAuthHeader(env,'POST',url),'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
  if(!response.ok){const data=await response.json().catch(()=>({}));const why=String(data?.detail||data?.title||data?.errors?.[0]?.message||'').slice(0,200);throw new Error(`X post failed (${response.status})${why?`: ${why}`:''}`)}
  return response.json().catch(()=>({}));
}
const xShort=text=>{const t=String(text||'');return t.length>280?t.slice(0,277)+'…':t};
// Every pick post, sportsbook or prediction app, single or parlay, uses one
// layout: what kind of pick, the bet and price, then the whole record
// (sportsbook and prediction-app picks, singles and parlays together; the
// graphic breaks it down). No link: link posts cost more.
async function xRecords(env){
  const sb=weeklySummary((await env.DB.prepare("SELECT kind,posted_at,line,odds,combined_odds,status,result,closing_line,closing_odds,closing_captured_at,legs_json FROM public_recommendations WHERE source='market-verified-v2' AND id LIKE 'official|%'").all()).results||[]);
  const pm=predictionRecord((await env.DB.prepare('SELECT result,odds,net_odds,close_odds FROM prediction_picks WHERE event_id NOT LIKE \'NBA--%\'').all().catch(()=>({results:[]}))).results||[]);
  const pp=predictionParlayRecord((await env.DB.prepare('SELECT result,odds,legs_json,posted_at FROM prediction_parlays').all().catch(()=>({results:[]}))).results||[]);
  return {sb,pm,pp};
}
const xMoney0=v=>Math.round(v)===0?'$0':weeklyMoney(v);
const xWL=(w,l,p)=>`${w}–${l}${p?`–${p}`:''}`;
function xRecordLine(rec,short=false){
  if(!rec)return '';const {sb,pm,pp}=rec,parts=[];
  if(sb.wins+sb.losses+sb.parlayWins+sb.parlayLosses)parts.push(`${short?'books':'sportsbooks'} ${xWL(sb.wins+sb.parlayWins,sb.losses+sb.parlayLosses,sb.pushes)} (${xMoney0(sb.profit+sb.parlayProfit)})`);
  if(pm&&pm.wins+pm.losses+pp.wins+pp.losses)parts.push(`${short?'apps':'prediction apps'} ${xWL(pm.wins+pp.wins,pm.losses+pp.losses,pm.pushes+pp.pushes)} (${xMoney0(pm.profit+pp.profit)})`);
  return parts.length?`Record: ${parts.join(' · ')}`:'';
}
// The graphic's record: one row per side, singles then parlays.
function xRecordRows(rec){
  if(!rec)return [];const {sb,pm,pp}=rec,rows=[];
  if(sb.wins+sb.losses)rows.push({label:'SPORTSBOOKS',color:'#2ee6a8',s:[sb.wins,sb.losses,sb.profit],p:sb.parlayWins+sb.parlayLosses?[sb.parlayWins,sb.parlayLosses,sb.parlayProfit]:null});
  if(pm&&pm.wins+pm.losses)rows.push({label:'PREDICTION APPS',color:'#c4b5fd',s:[pm.wins,pm.losses,pm.profit],p:pp.wins+pp.losses?[pp.wins,pp.losses,pp.profit]:null});
  return rows;
}
const XSHORT_MARKETS=[[/^over /i,'O '],[/^under /i,'U '],[/interceptions thrown/i,'INTs'],[/passing touchdowns/i,'pass TDs'],[/rush \+ receiving yards/i,'rush+rec yds'],[/receiving yards/i,'rec yds'],[/rushing yards/i,'rush yds'],[/passing yards/i,'pass yds'],[/pass completions/i,'completions'],[/pass attempts/i,'pass att'],[/receptions/i,'rec'],[/anytime touchdown/i,'anytime TD'],[/rush attempts/i,'rush att'],[/field goals made/i,'FGs'],[/kicking points/i,'kick pts'],[/extra points/i,'XPs']];
const xShortLeg=t=>XSHORT_MARKETS.reduce((v,[re,to])=>v.replace(re,to),String(t));
const xShortWhen=iso=>weeklyDay(iso).replace(/^(\w+), \w+ \d+, /,'$1 ');
const xLast=name=>{const w=String(name||'').trim().split(/\s+/);return w.length>1&&/^(jr\.?|sr\.?|ii|iii|iv)$/i.test(w.at(-1))?w.slice(-2).join(' '):w.at(-1)||''};
// head: the pick-type line; lines: bet and price (a [full, short] pair
// shortens); legs: parlay legs; extra: an optional line (a partner code).
// Long parlays shorten step by step until the post fits; the age line always stays.
function xPostText({head,lines=[],legs=null,extra='',rec,age='21+'}){
  const pick=(l,i)=>Array.isArray(l)?l[i]:l,legLines=f=>legs&&legs.map(l=>`• ${f(l)}`);
  const full=legLines(l=>`${l.player} ${weeklyLegText(l)}`),short=legLines(l=>`${l.player} ${xShortLeg(weeklyLegText(l))}`),last=legLines(l=>`${xLast(l.player)} ${xShortLeg(weeklyLegText(l))}`);
  const build=(lg,li,rs,foot,ex)=>{const record=xRecordLine(rec,rs);return [head,...lines.map(l=>pick(l,li)),...(lg||[]),ex].filter(Boolean).join('\n')+(record?`\n\n${record}`:'')+`\n\n${foot?'Full board: link':'Link'} in bio · ${age}`};
  const tries=[[full,0,0,1,extra],[short,0,0,1,extra],[short,1,0,1,extra],[short,1,0,0,extra],[short,1,1,0,extra],[last,1,1,0,extra],[last,1,1,0,'']];
  for(const t of tries){const text=build(...t);if(text.length<=280)return text}
  return xShort(build(last,1,1,0,''));
}
// " (Q)" after a player on the injury report as Questionable.
const xQuestionable=async(env,name)=>name&&injuryClass((await injuryMap(env).catch(()=>new Map())).get(normalizedName(name))?.status)==='questionable'?' (Q)':'';
function xSportsbookText(r,rec,q=''){
  const legs=recordLegs(r),first=legs[0]||{},when=xShortWhen(r.game_time||first.gameTime),matchup=xMatchup(first.team);
  if(r.kind==='parlay'){const odds=weeklyOdds(r.combined_odds),same=legs.some(l=>l.sameGame);
    return xPostText({head:`🔒 Official parlay · Sportsbook${recordShare(r)<1?' · $25':''}`,lines:[[`${odds} · ${legs.length} legs${same?` · same-game: bet it at ${odds} or better`:''}`,`${odds} · ${legs.length} legs${same?' · same-game':''}`]],legs,rec});}
  return xPostText({head:`${Number(first.edge)>=TOP_PICK.sb?'⭐ Top pick':'🔒 Official pick'} · Sportsbook`,lines:[`${r.player}${q} ${weeklyLegText(r)}`,[`${weeklyOdds(r.odds)}${first.book?` at ${first.book}`:''}`,matchup,when].filter(Boolean).join(' · ')],rec});
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
// Only the strongest picks get their own X post the moment they lock: sportsbook
// singles with a 1.5-point edge (3 a day) and prediction singles with a 2-point
// edge (2 a day). Every other pick goes out on the day's pick card, or on a
// catch-up card before its game, so every pick is still on X before kickoff.
const X_HEAD={sb:{edge:1.5,day:3},pm:{edge:2,day:2}};
async function xHeadCount(env,prefix,now){
  const midnight=Date.parse(`${etDate(now,{year:'numeric',month:'2-digit',day:'2-digit'}).replace(/(\d+)\/(\d+)\/(\d+)/,'$3-$1-$2')}T00:00:00-05:00`);
  return Number((await env.DB.prepare("SELECT count(*) n FROM app_settings WHERE key LIKE ? AND value>=? AND value NOT LIKE 'pending%'").bind(`${prefix}%`,new Date(midnight-3600000).toISOString()).first().catch(()=>null))?.n||0);
}
async function postPicksToX(env,now=Date.now()){
  if(!env.DB||!xReady(env))return {posted:0,disabled:true};
  const since=new Date(now-24*3600000).toISOString(),start=new Date(now).toISOString();
  const picks=(await env.DB.prepare("SELECT id,kind,posted_at,sport,player,market,side,line,odds,combined_odds,legs_json,game_time FROM public_recommendations WHERE source='market-verified-v2' AND id LIKE 'official|%' AND posted_at>? AND game_time>? ORDER BY posted_at LIMIT 40").bind(since,start).all()).results||[];
  if(!picks.length)return {posted:0};
  // Picks already on X are skipped below, so a busy day (more than a handful
  // of picks in 24 hours) never leaves the newest one out.
  const seasonRows=(await env.DB.prepare("SELECT kind,posted_at,line,odds,combined_odds,status,result,closing_line,closing_odds,closing_captured_at,legs_json FROM public_recommendations WHERE source='market-verified-v2' AND id LIKE 'official|%'").all()).results||[];
  const season=weeklySummary(seasonRows),rec=await xRecords(env).catch(()=>null);let posted=0,attempts=0,today=await xHeadCount(env,'xi:official|',now);
  for(const r of picks){
    // Parlays and smaller edges ride the pick cards instead.
    if(r.kind!=='prop'||!(Number(recordLegs(r)[0]?.edge)>=X_HEAD.sb.edge))continue;
    if(today>=X_HEAD.sb.day&&!(Number(recordLegs(r)[0]?.edge)>=TOP_PICK.sb))continue;
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
      const png=await renderCardPng(xCardSvg(await xCardData(env,r,season,rec)));
      mediaId=await xUploadImage(env,png);
    }catch(error){imageError=error.message}
    try{
      let sent=null;
      if(mediaId)sent=await xPost(env,xSportsbookText(r,rec,r.kind==='parlay'?'':await xQuestionable(env,r.player)),mediaId);
      else if(tries<3){throw new Error(imageError||'graphic failed')}
      else if(!(await appSetting(env,`x:${r.id}`)))sent=await xPost(env,xSportsbookText(r,rec,r.kind==='parlay'?'':await xQuestionable(env,r.player)));
      // The post id lets the closing-line and result posts reply under the pick.
      if(sent?.data?.id)await setAppSetting(env,`xid:${r.id}`,String(sent.data.id)).catch(()=>{});
      await xDone(env,`xi:${r.id}`,now);
      posted++;today++;await setAppSetting(env,'x-last-post',`${start} ${mediaId?'graphic':'text'} ${r.id}`).catch(()=>{});
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
  // Parlays: the legs' players as overlapping round photos when we have them,
  // else the big leg count.
  const faces=c.parlay?(c.legPhotos||[]).filter(Boolean).slice(0,3):[],R=faces.length===3?92:108,cxs=faces.length===3?[118,235,352]:[155,315];
  const left=c.parlay
    ?(faces.length>=2?`<defs>${faces.map((f,i)=>`<clipPath id="lp${i}"><circle cx="${cxs[i]}" cy="270" r="${R}"/></clipPath>`).join('')}</defs>${faces.map((f,i)=>`<circle cx="${cxs[i]}" cy="270" r="${R+6}" fill="#0b1530"/><circle cx="${cxs[i]}" cy="270" r="${R}" fill="#ffffff" fill-opacity=".14"/><image href="data:${f.type};base64,${f.b64}" x="${cxs[i]-R*1.4}" y="${270-R}" width="${R*2.8}" height="${R*2.04}" preserveAspectRatio="xMidYMax meet" clip-path="url(#lp${i})"/>`).join('')}<text x="235" y="452" text-anchor="middle" font-family="${F.xb}" font-size="32" letter-spacing="6" fill="#ffffff" fill-opacity=".85">${c.legs.length}-LEG PARLAY</text>`
      :`<text x="235" y="320" text-anchor="middle" font-family="${F.g}" font-size="170" fill="#ffffff" fill-opacity=".92">${c.legs.length}</text><text x="235" y="392" text-anchor="middle" font-family="${F.xb}" font-size="32" letter-spacing="6" fill="#ffffff" fill-opacity=".8">LEG PARLAY</text>`)
    :`${c.photo&&c.team?.abbreviation?`<text x="235" y="190" text-anchor="middle" font-family="${F.g}" font-size="170" fill="#ffffff" fill-opacity=".13">${xEsc(c.team.abbreviation)}</text>`:''}${c.photo?`<image href="data:${c.photo.type};base64,${c.photo.b64}" x="-70" y="200" width="610" height="446" preserveAspectRatio="xMidYMax meet"/>`:`<text x="235" y="410" text-anchor="middle" font-family="${F.g}" font-size="170" fill="#ffffff" fill-opacity=".24">${xEsc(c.team?.abbreviation||initials)}</text>`}`;
  const oddsW=[...String(c.odds)].reduce((w,ch)=>w+(ch==='%'?.86:/[0-9]/.test(ch)?.56:.5),0)*86;
  const legs=c.parlay?c.legs.slice(0,5):[],gap=legs.length>4?38:46;
  // On a result card each parlay leg shows HIT or MISS in place of its price.
  const legMark=l=>l.res==='won'?['HIT',M]:l.res==='lost'?['MISS','#f87171']:l.res==='push'?['PUSH','#cbd5e1']:[l.odds,'#9fb0cc'];
  const legsSvg=legs.map((l,i)=>`<text x="${X}" y="${226+i*gap}" font-family="${F.sb}" font-size="${Math.min(27,xFit(l.text,W-120,27,.6))}" fill="#cfe0f5">${xEsc(l.text)}</text><text x="${1200-56}" y="${226+i*gap}" text-anchor="end" font-family="${F.xb}" font-size="25" fill="${legMark(l)[1]}">${xEsc(legMark(l)[0])}</text>`).join('');
  const pill=c.pill||{label:'OFFICIAL PICK',fill:M,ink:'#06231a',icon:'lock'},pillW=pill.label==='OFFICIAL PICK'?262:Math.round(70+pill.label.length*15.6);
  const icon={lock:`<rect x="1" y="9" width="16" height="13" rx="2.5" fill="${pill.ink}"/><path d="M4.5 9V6a4.5 4.5 0 0 1 9 0v3" fill="none" stroke="${pill.ink}" stroke-width="2.6"/>`,check:`<path d="M2 14l5 5 10-11" fill="none" stroke="${pill.ink}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>`,x:`<path d="M3 7l12 12M15 7 3 19" fill="none" stroke="${pill.ink}" stroke-width="3.4" stroke-linecap="round"/>`,dash:`<path d="M3 13h12" fill="none" stroke="${pill.ink}" stroke-width="3.4" stroke-linecap="round"/>`}[pill.icon]||'';
  const oddsY=c.parlay?226+legs.length*gap+42:330,recs=c.records||[];
  const recMoney=v=>`<tspan font-family="${F.xb}" fill="${v<0?'#f87171':M}">${xEsc(xMoney0(v))}</tspan>`;
  const recRows=recs.map((r,i)=>{const y=recs.length>1?530+i*36:548;return `<text x="${X}" y="${y}" font-family="${F.xb}" font-size="14" letter-spacing="2" fill="${r.color}">${r.label}</text><text x="${X+178}" y="${y}" font-family="${F.sb}" font-size="21" fill="#9fb0cc"><tspan font-family="${F.xb}" fill="#ffffff">${xWL(r.s[0],r.s[1])}</tspan> ${recMoney(r.s[2])}${r.p?` · parlays <tspan font-family="${F.xb}" fill="#ffffff">${xWL(r.p[0],r.p[1])}</tspan> ${recMoney(r.p[2])}`:''}</text>`}).join('');
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
<text x="${Math.round(X+oddsW+30)}" y="${oddsY+18}" font-family="${F.sb}" font-size="25" fill="#9fb0cc">${xEsc(c.oddsNote||'')}</text>
${recs.length?recRows:`${c.season?`<text x="${X}" y="545" font-family="${F.sb}" font-size="23" fill="#9fb0cc">Season <tspan font-family="${F.xb}" fill="#ffffff">${xEsc(c.season)}</tspan></text>`:''}
${xLogo(1200-56-228,512,46)}<text x="${1200-56}" y="545" text-anchor="end" font-family="${F.g}" font-size="27" fill="#ffffff">Bet This Guy</text>`}
<rect x="470" y="589" width="730" height="86" fill="${M}"/>
${recs.length?`${xLogo(X,609,46)}<text x="${X+60}" y="642" font-family="${F.g}" font-size="25" fill="#06231a">${xEsc(c.resultCta||'Every pick, free')}</text>`:`<text x="${X}" y="643" font-family="${F.g}" font-size="29" fill="#06231a">${xEsc(c.cta||'Today’s full board, free')}</text>`}
<text x="${1200-56-38}" y="644" text-anchor="end" font-family="${F.g}" font-size="31" fill="#06231a">betthisguy.com</text><path d="M1118 633h24m-9-9 9 9-9 9" fill="none" stroke="#06231a" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
}
// Everything the graphic needs for one official pick.
async function xCardData(env,r,season,rec=null){
  const legs=recordLegs(r),first=legs[0]||{},sport=r.sport_label||r.sport||(String(r.id||'').startsWith('nba|')?'NBA':'NFL'),time=r.game_time||first.gameTime,when=weeklyDay(time);
  // NFL picks show the whole record (both sides); NBA picks keep their own season line.
  if(!rec&&String(r.id||'').startsWith('official|'))rec=await xRecords(env).catch(()=>null);const records=xRecordRows(rec);
  const edge=Number(first.edge),seasonText=season&&season.wins+season.losses>=5?`${season.wins}–${season.losses} · ${weeklyMoney(season.profit)}`:'';
  const shortWhen=when.replace(/^(\w+), \w+ \d+, /,'$1 ').toUpperCase();
  if(r.kind==='parlay')return {sport,parlay:true,legPhotos:await xLegPhotos(legs,sport),title:`${legs.length}-leg parlay`,legs:legs.map(l=>({text:`${l.player} · ${xShortLeg(weeklyLegText(l))}`,odds:weeklyOdds(l.odds)})),odds:weeklyOdds(r.combined_odds),oddsNote:`\u0024${100*recordShare(r)} pays \u0024${Math.round(100*recordShare(r)*(weeklyDecimal(r.combined_odds)||1)).toLocaleString('en-US')}`,season:seasonText,records,pill:{label:'SPORTSBOOK PARLAY',fill:'#2ee6a8',ink:'#06231a',icon:'lock'},footLeft:shortWhen};
  const [team,shot]=await Promise.all([typeof playerTeamOf==='function'?playerTeamOf(env,sport,r.player,first.team):null,typeof playerHeadshot==='function'?playerHeadshot(r.player,sport):null]);
  return {sport,team,photo:shot?{type:shot.type,b64:xBase64(shot.bytes)}:null,title:r.player,bet:weeklyLegText(r).replace(/^./,ch=>ch.toUpperCase()),when:[xMatchup(first.team),when].filter(Boolean).join(' · '),odds:weeklyOdds(r.odds),oddsNote:[first.book?`at ${first.book}`:'',Number.isFinite(edge)&&edge>0?`+${edge.toFixed(1)}% vs fair`:''].filter(Boolean).join(' · '),season:seasonText,records,pill:records.length?{label:'SPORTSBOOK PICK',fill:'#2ee6a8',ink:'#06231a',icon:'lock'}:undefined,footLeft:[team?.full?xNick(team.full).toUpperCase():'',shortWhen].filter(Boolean).join(' · ')};
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
  const all=(await env.DB.prepare("SELECT kind,posted_at,line,odds,combined_odds,status,result,closing_line,closing_odds,closing_captured_at,legs_json FROM public_recommendations WHERE source='market-verified-v2' AND id LIKE 'official|%' AND id<?").bind(`official|${week}|￿`).all()).results||[];
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
  if(/passing touchdowns/i.test(l.market||''))return `threw ${v} TD${v===1?'':'s'}`;
  if(/interceptions thrown/i.test(l.market||''))return `threw ${v} INT${v===1?'':'s'}`;
  if(/touchdown/i.test(l.market||'')&&Number(l.line)===0.5)return v>=1?`scored (${v})`:'no touchdown';
  const m=String(l.market||'').toLowerCase();
  return `had ${v} ${v===1?m.replace(/s$/,''):m}`;
}
const XRESULT={won:{label:'WINNER',fill:'#2ee6a8',ink:'#06231a',icon:'check',odds:'#2ee6a8',emoji:'✅',word:'Cashed'},lost:{label:'LOSS',fill:'#f87171',ink:'#2a0909',icon:'x',odds:'#f87171',emoji:'❌',word:'Lost'},push:{label:'PUSH',fill:'#cbd5e1',ink:'#0b1530',icon:'dash',odds:'#cbd5e1',emoji:'➖',word:'Push'}};
const xPayout=r=>recordPay(r);
// Text that goes with a graded pick. Losses are posted the same as wins.
function xResultText(r,season){
  const legs=recordLegs(r),look=XRESULT[r.result],record=season&&season.wins+season.losses>=5?`Season: ${season.wins}–${season.losses}, ${weeklyMoney(season.profit)} at $100 a pick.`:'';
  const head=r.kind==='parlay'
    ?`${look.emoji} ${look.word}: ${legs.length}-leg parlay (${weeklyOdds(r.combined_odds)})\n${legs.map(l=>`${l.result==='won'?'✅':l.result==='lost'?'❌':'➖'} ${l.player} ${weeklyLegText(l)}${l.voided?' (ruled out, leg voided)':''}`).join('\n')}`
    :legs[0]?.voided?`➖ Void: ${r.player} ${weeklyLegText(r)} (${weeklyOdds(r.odds)})\n${legs[0].voidReason||'Ruled out'} before kickoff, so the bet is void and the stake comes back.`
    :`${look.emoji} ${look.word}: ${r.player} ${weeklyLegText(r)} (${weeklyOdds(r.odds)})${xActual(legs[0])?(r.status==='provisional'?`\n${r.player} already ${xActual(legs[0])}, with the game still on.`:`\nFinal: ${xActual(legs[0])}.`):''}`;
  const tail=r.result==='lost'?'We post every loss too.':'Every pick graded in public.';
  return xShort(`${head}\n\n${tail}${record?` ${record}`:''}\n21+`);
}
// The pick graphic, restyled as a result.
async function xResultData(env,r,season){
  const c=await xCardData(env,r,season),look=XRESULT[r.result],legs=recordLegs(r),money=xPayout(r);
  const out={...c,pill:look,oddsColor:look.odds,cta:'See every pick graded',resultCta:'Every pick graded'};
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
  const rows=(await env.DB.prepare("SELECT id,kind,sport,player,market,side,line,odds,combined_odds,legs_json,game_time,status,result FROM public_recommendations WHERE source='market-verified-v2' AND id LIKE 'official|%' AND ((status='final' AND result IN ('won','lost','push') AND settled_at>?) OR (status='provisional' AND result IN ('won','lost') AND game_time>?)) AND NOT EXISTS(SELECT 1 FROM app_settings WHERE key='xr:'||public_recommendations.id AND value NOT LIKE 'pending %') ORDER BY COALESCE(settled_at,game_time) LIMIT 8").bind(since,since).all()).results||[];
  let posted=0,season=null;
  for(const r of rows){
    if(posted>=limit)break;
    // Only picks that went out on X get a result post.
    if(!(await appSetting(env,`xi:${r.id}`))||!(await xClaim(env,`xr:${r.id}`,now)))continue;
    // Count tries before the heavy work: after three cut-off tries the result posts as text.
    const tries=Number(await appSetting(env,`xrtry:${r.id}`)||0)+1;await setAppSetting(env,`xrtry:${r.id}`,String(tries));
    if(!season)season=weeklySummary((await env.DB.prepare("SELECT kind,posted_at,line,odds,combined_odds,status,result,closing_line,closing_odds,closing_captured_at,legs_json FROM public_recommendations WHERE source='market-verified-v2' AND id LIKE 'official|%'").all()).results||[]);
    let mediaId=null;
    // A void posts as text only.
    try{if(tries<=3&&!(r.kind!=='parlay'&&recordLegs(r)[0]?.voided)&&typeof renderCardPng==='function')mediaId=await xUploadImage(env,await renderCardPng(xCardSvg(await xResultData(env,r,season))))}
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
// Pinned alerts post: one graphic with the whole record (sportsbooks and
// prediction apps), meant to be pinned on the profile. It posts once per
// version; setting the app_settings value x-summary-request to a new value
// posts a fresh one with the latest numbers.
const XBELL='<path d="M50 6c-3.6 0-6.5 2.9-6.5 6.5v3.4C30.8 18.9 22 30.4 22 44v19L12 75v5h76v-5L78 63V44c0-13.6-8.8-25.1-21.5-28.1v-3.4C56.5 8.9 53.6 6 50 6zM38 85a12 12 0 0 0 24 0z"/>';
function xSummarySvg(d){
  const M='#2ee6a8',L='#c4b5fd',F={g:'BTG Grotesk',xb:'BTG Inter XB',sb:'BTG Inter SB'},X=526,R=1200-56;
  const row=(y,label,money,v)=>`<text x="${X}" y="${y}" font-family="${F.sb}" font-size="30" fill="#dbe4f0">${xEsc(label)}</text><text x="${R}" y="${y}" text-anchor="end" font-family="${F.xb}" font-size="30" fill="${v<0?'#f87171':M}">${xEsc(money)}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675">
<defs><linearGradient id="tm" x1="0" y1="0" x2="0.45" y2="1"><stop offset="0" stop-color="#1d4ed8"/><stop offset="1" stop-color="#0b1530"/></linearGradient></defs>
<rect width="1200" height="675" fill="#0b1530"/><rect width="470" height="675" fill="url(#tm)"/>
<text x="56" y="100" font-family="${F.xb}" font-size="20" letter-spacing="4" fill="#ffffff" fill-opacity=".85">PICK ALERTS</text>
<g transform="translate(52 128) scale(1.05)" fill="#fbbf24">${XBELL}</g>
<text x="56" y="300" font-family="${F.g}" font-size="50" fill="#ffffff">Turn on</text>
<text x="56" y="352" font-family="${F.g}" font-size="50" fill="#ffffff">notifications.</text>
${['Every pick posts here the second','it locks, so you get our price','before it moves.'].map((t,k)=>`<text x="56" y="${402+k*31}" font-family="${F.sb}" font-size="24" fill="#ffffff" fill-opacity=".8">${t}</text>`).join('')}
${xLogo(56,563,56)}<text x="128" y="601" font-family="${F.g}" font-size="30" fill="#ffffff">Bet This Guy</text>
<text x="${X}" y="96" font-family="${F.xb}" font-size="15" letter-spacing="2.5" fill="${M}">SPORTSBOOKS</text>
${row(140,`Singles ${d.sb.wins}–${d.sb.losses}`,d.m(d.sb.profit),d.sb.profit)}${row(184,`Parlays ${d.sb.parlayWins}–${d.sb.parlayLosses}`,d.m(d.sb.parlayProfit),d.sb.parlayProfit)}
<text x="${X}" y="246" font-family="${F.xb}" font-size="15" letter-spacing="2.5" fill="${L}">PREDICTION APPS</text><rect x="${X+178}" y="230" width="56" height="22" rx="11" fill="#2a3355"/><text x="${X+206}" y="246" text-anchor="middle" font-family="${F.xb}" font-size="12" letter-spacing="1" fill="${L}">NEW</text>
${row(290,`Singles ${d.pm.wins}–${d.pm.losses}`,d.m(d.pm.profit),d.pm.profit)}${row(334,`Parlays ${d.pp.wins}–${d.pp.losses}`,d.m(d.pp.profit),d.pp.profit)}
${d.sb.tracked?`<text x="${X}" y="404" font-family="${F.sb}" font-size="24" fill="#dbe4f0"><tspan font-family="${F.xb}" fill="${M}">${d.sb.beat} of ${d.sb.tracked}</tspan> sportsbook picks beat the kickoff price</text>`:''}
<text x="${X}" y="446" font-family="${F.sb}" font-size="18" fill="#dbe4f0" fill-opacity=".75">$100 singles · $25 parlays · every loss included · 21+</text>
<rect x="470" y="589" width="730" height="86" fill="${M}"/>
<text x="${X}" y="643" font-family="${F.g}" font-size="27" fill="#06231a">Follow + tap</text><g transform="translate(${X+168} 615) scale(.3)" fill="#06231a">${XBELL}</g>
<text x="${R-38}" y="644" text-anchor="end" font-family="${F.g}" font-size="31" fill="#06231a">betthisguy.com</text><path d="M1118 633h24m-9-9 9 9-9 9" fill="none" stroke="#06231a" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
}
function xSummaryData(rows,pmRows=[],ppRows=[]){
  const sb=weeklySummary(rows),pm=predictionRecord(pmRows),pp=predictionParlayRecord(ppRows);
  return {sb,pm,pp,m:v=>Math.round(v)===0?'$0':weeklyMoney(v)};
}
async function xSummaryLoad(env){
  const rows=(await env.DB.prepare("SELECT kind,posted_at,line,odds,combined_odds,status,result,closing_line,closing_odds,closing_captured_at,legs_json FROM public_recommendations WHERE source='market-verified-v2' AND id LIKE 'official|%'").all()).results||[];
  const pm=(await env.DB.prepare('SELECT result,odds,net_odds,close_odds FROM prediction_picks WHERE event_id NOT LIKE \'NBA--%\'').all().catch(()=>({results:[]}))).results||[];
  const pp=(await env.DB.prepare('SELECT result,odds,legs_json,posted_at FROM prediction_parlays').all().catch(()=>({results:[]}))).results||[];
  return xSummaryData(rows,pm,pp);
}
function xSummaryText(d,now=Date.now()){
  const {sb,pm,pp,m}=d,pw=pm.wins+pp.wins,pl=pm.losses+pp.losses;
  // NBA picks start Tue Oct 20; the line drops off once they have.
  const nba=now<Date.parse('2026-10-20T23:00:00Z')?' NBA starts Tuesday.':'';
  return xShort(`🔔 Turn on notifications to get every pick the second it locks.\n\nSportsbook singles: ${sb.wins}–${sb.losses} (${m(sb.profit)})${pw+pl?`\nPrediction-app picks (new): ${pw}–${pl} (${m(pm.profit+pp.profit)})`:''}${sb.tracked?`\n${sb.beat} of ${sb.tracked} beat the kickoff price`:''}\n\nEvery pick posted before the game, losses included.${nba}\n\nLink in bio · 21+`);
}
async function postSummaryToX(env,now=Date.now()){
  if(!env.DB||!xReady(env))return {posted:0,disabled:true};
  const version=(await appSetting(env,'x-summary-request'))||'v1',key=`x-summary:${version}`;
  if(!(await xClaim(env,key,now)))return {posted:0,done:true};
  const d=await xSummaryLoad(env);let mediaId=null;
  try{if(typeof renderCardPng==='function')mediaId=await xUploadImage(env,await renderCardPng(xSummarySvg(d)))}
  catch(error){await setAppSetting(env,'x-last-error',`${new Date(now).toISOString()} summary graphic: ${error.message}`).catch(()=>{})}
  try{const sent=await xPost(env,xSummaryText(d,now),mediaId);await xDone(env,key,now);await setAppSetting(env,'x-last-post',`${new Date(now).toISOString()} summary ${version} ${sent?.data?.id||''}`).catch(()=>{});return {posted:1,graphic:Boolean(mediaId)}}
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
// Slate post: the day's pending official picks on one graphic, once per game
// day, from 16 hours before the first of them kicks off.
// A big card (more than 8 picks): full width, two columns, one row per pick
// (parlay legs fold into the parlay's sub line), growing taller to fit up to 40.
function xSlateGridSvg(d){
  const M='#2ee6a8',F={g:'BTG Grotesk',xb:'BTG Inter XB',sb:'BTG Inter SB'},L=56,R=1200-56,CW=(R-L-40)/2;
  const short=t=>xShortLeg(String(t).replace(/^(.*?) · /,(m,who)=>`${who} · `));
  // Parlay legs (given as legLines, or as leg rows after the parlay) list one per line under it.
  const items=[];for(const p of d.picks){if(p.leg&&items.length){const last=items.at(-1);last.legLines=(last.legLines||[]).concat({text:String(p.text).replace(' · ',' '),odds:p.odds||''});continue}items.push({...p})}
  const picks=items.slice(0,40),more=items.length-picks.length,top=d.records?262:212,LH=24;
  const hOf=p=>p.legLines?.length?34+p.legLines.length*LH+10:60,hs=picks.map(hOf),total=hs.reduce((a,b)=>a+b,0);
  // Split into two columns as evenly as the order allows.
  let split=0,acc=0,best=Infinity;for(let i=0;i<=picks.length;i++){const m=Math.max(acc,total-acc);if(m<best){best=m;split=i}acc+=hs[i]||0}
  const colH=Math.max(hs.slice(0,split).reduce((a,b)=>a+b,0),hs.slice(split).reduce((a,b)=>a+b,0));
  const H=top+colH+(more>0?36:0)+24+86;
  const mark=(res,x,y,color)=>res==='won'?`<circle cx="${x}" cy="${y}" r="9" fill="${M}"/>`:res==='lost'?`<circle cx="${x}" cy="${y}" r="9" fill="#f87171"/>`:res==='push'?`<circle cx="${x}" cy="${y}" r="9" fill="#cbd5e1"/>`:`<circle cx="${x}" cy="${y}" r="5" fill="${color||M}"/>`;
  const fit=(t,w,max,min,em)=>Math.max(min,Math.min(max,Math.floor(w/(Math.max(1,String(t).length)*em))));
  let y0=[top,top];
  const rows=picks.map((p,i)=>{const col=i<split?0:1,x=L+col*(CW+40),y=y0[col]+24;y0[col]+=hs[i];const text=short(p.text);
    const head=`${mark(p.res,x+8,y-7,p.color)}<text x="${x+26}" y="${y}" font-family="${F.sb}" font-size="${fit(text,CW-110,22,15,.56)}" fill="#ffffff">${xEsc(text)}</text><text x="${x+CW}" y="${y}" text-anchor="end" font-family="${F.xb}" font-size="22" fill="${p.res==='lost'?'#f87171':p.res==='push'?'#cbd5e1':p.color||M}">${xEsc(p.odds)}</text>`;
    if(p.legLines?.length)return head+p.legLines.map((l,j)=>{const t=xShortLeg(l.text),ly=y+26+j*LH;return `<text x="${x+26}" y="${ly}" font-family="${F.sb}" font-size="${fit(t,CW-120,17,13,.55)}" fill="#cfe0f5">${xEsc(t)}</text>${l.odds?`<text x="${x+CW}" y="${ly}" text-anchor="end" font-family="${F.sb}" font-size="16" fill="#9fb0cc">${xEsc(l.odds)}</text>`:''}`}).join('');
    const sub=p.sub||'';return head+`<text x="${x+26}" y="${y+24}" font-family="${F.sb}" font-size="${fit(sub,CW-30,16,12,.55)}" fill="#9fb0cc">${xEsc(sub)}</text>`}).join('');
  const recs=d.records?d.records.map((r,i)=>{const x=L+i*(CW+40);return `<text x="${x}" y="196" font-family="${F.xb}" font-size="14" letter-spacing="2.5" fill="${r.color||'#ffffff'}">${xEsc(r.label)}</text>${r.lines.map((l,j)=>`<text x="${x+j*262}" y="224" font-family="${F.sb}" font-size="20" fill="#ffffff">${xEsc(l)}</text>`).join('')}`}).join(''):'';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${H}" viewBox="0 0 1200 ${H}">
<defs><linearGradient id="tm" x1="0" y1="0" x2="1" y2="0.4"><stop offset="0" stop-color="#1d4ed8"/><stop offset="1" stop-color="#0b1530"/></linearGradient></defs>
<rect width="1200" height="${H}" fill="#0b1530"/><rect width="1200" height="${d.records?166:150}" fill="url(#tm)"/>
<text x="${L}" y="58" font-family="${F.xb}" font-size="18" letter-spacing="4" fill="#ffffff" fill-opacity=".8">${xEsc(d.kicker||(d.final?'LOCKED SO FAR':'OFFICIAL PICKS'))}</text>
<text x="${L-4}" y="128" font-family="${F.g}" font-size="${xFit(d.day,520,70,.62)}" fill="${d.dayColor||'#ffffff'}">${xEsc(d.day)}</text>
<text x="${R}" y="96" text-anchor="end" font-family="${F.sb}" font-size="24" fill="#ffffff" fill-opacity=".8">${xEsc(d.dateLine||`${d.date} · ${d.picks.filter(p=>!p.leg).length} picks${d.final?'':' so far'}`)}</text>
<text x="${R}" y="128" text-anchor="end" font-family="${F.sb}" font-size="20" fill="#ffffff" fill-opacity=".6">${xEsc(d.note||(d.final?`More can drop until kickoff · ${d.kick}`:'More can drop up to kickoff'))}</text>
${recs}${rows}${more>0?`<text x="${L+26}" y="${top+colH+24}" font-family="${F.sb}" font-size="20" fill="#9fb0cc">+ ${more} more on the site</text>`:''}
<rect y="${H-86}" width="1200" height="86" fill="${M}"/>
${xLogo(L,H-66,46)}<text x="${L+62}" y="${H-32}" font-family="${F.g}" font-size="27" fill="#06231a">${xEsc(d.cta||'Graded in public')} · ${xEsc(d.age||'21+')}</text>
<text x="${R-38}" y="${H-31}" text-anchor="end" font-family="${F.g}" font-size="31" fill="#06231a">betthisguy.com</text><path d="M1118 ${H-42}h24m-9-9 9 9-9 9" fill="none" stroke="#06231a" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
}
function xSlateSvg(d){
  if(d.picks.filter(p=>!p.leg).length>8)return xSlateGridSvg(d);
  if(d.picks.some(p=>p.legLines))d={...d,picks:d.picks.flatMap(p=>p.legLines?[{...p,sub:p.legLines.length?'':p.sub},...p.legLines.map(l=>({leg:true,color:p.color,text:l.text,odds:l.odds}))]:[p])};
  const M='#2ee6a8',F={g:'BTG Grotesk',xb:'BTG Inter XB',sb:'BTG Inter SB'},X=526,R=1200-56,W=R-X;
  // Every pick fits: past 7 the card grows taller (X shows the whole image when opened).
  // Short market names so long props don't run into the price.
  const short=t=>String(t).replace(/interceptions thrown/i,'INT').replace(/passing touchdowns/i,'pass TDs').replace(/receiving yards/i,'rec yds').replace(/rushing yards/i,'rush yds').replace(/passing yards/i,'pass yds').replace(/receptions/i,'rec');
  const picks=d.picks.slice(0,16).map(p=>({...p,text:short(p.text)})),more=d.picks.length-picks.length,gap=picks.some(p=>p.photo)?70:picks.length>6?58:62;
  // Parlay legs sit tight under their parlay; every other row gets the full gap.
  const ys=[];picks.forEach((p,i)=>ys.push(i?ys[i-1]+(p.leg?(picks[i-1].leg?32:52):(picks[i-1].leg?gap-10:gap)):150));
  const end=picks.length?ys.at(-1)+(picks.at(-1).leg?gap-10:gap):150;
  const H=Math.max(675+(d.records?56:0),end+(more>0?40:0)+110),B=H-675;
  const mark=(res,x,y)=>res==='won'?`<circle cx="${x}" cy="${y}" r="11" fill="${M}"/><path d="M${x-5} ${y}l3.5 3.5 7-7.5" fill="none" stroke="#06231a" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`:res==='lost'?`<circle cx="${x}" cy="${y}" r="11" fill="#f87171"/><path d="M${x-4.5} ${y-4.5}l9 9M${x+4.5} ${y-4.5}l-9 9" fill="none" stroke="#2a0909" stroke-width="2.6" stroke-linecap="round"/>`:res==='push'?`<circle cx="${x}" cy="${y}" r="11" fill="#cbd5e1"/>`:`<circle cx="${x}" cy="${y}" r="6" fill="${M}"/>`;
  // Locked and closing prices side by side when the picks have a close.
  const hasClose=picks.some(p=>p.close);
  const heads=hasClose?`<text x="${R-120}" y="104" text-anchor="end" font-family="${F.xb}" font-size="15" letter-spacing="2" fill="#9fb0cc">LOCKED</text><text x="${R}" y="104" text-anchor="end" font-family="${F.xb}" font-size="15" letter-spacing="2" fill="#9fb0cc">CLOSED</text>`:'';
  // A pick row with a photo (the NBA card): a round headshot first, the status mark on its corner.
  const face=(p,i,y)=>p.photo?`<clipPath id="ph${i}"><circle cx="${X+24}" cy="${y-9}" r="24"/></clipPath><circle cx="${X+24}" cy="${y-9}" r="24" fill="#1b2a4a"/><image href="data:${p.photo.type};base64,${p.photo.b64}" x="${X-9}" y="${y-33}" width="66" height="48" preserveAspectRatio="xMidYMid slice" clip-path="url(#ph${i})"/>${p.res?mark(p.res,X+42,y+8):''}`:'';
  const rows=picks.map((p,i)=>{const y=ys[i];if(p.photo){const tx=X+60;return `${face(p,i,y)}<text x="${tx}" y="${y}" font-family="${F.sb}" font-size="${Math.max(17,Math.min(25,Math.floor((W-60-(hasClose?260:130))/(String(p.text).length*.56))))}" fill="#ffffff">${xEsc(p.text)}</text><text x="${hasClose?R-120:R}" y="${y}" text-anchor="end" font-family="${F.xb}" font-size="24" fill="${p.res==="lost"?"#f87171":p.res==="push"?"#cbd5e1":p.color||M}">${xEsc(p.odds||'')}</text>${hasClose?`<text x="${R}" y="${y}" text-anchor="end" font-family="${F.sb}" font-size="22" fill="#9fb0cc">${xEsc(p.close||"—")}</text>`:""}<text x="${tx}" y="${y+25}" font-family="${F.sb}" font-size="18" fill="#9fb0cc">${xEsc(p.sub||'')}</text>`}if(p.leg)return `<text x="${X+30}" y="${y}" font-family="${F.sb}" font-size="${Math.max(17,Math.min(22,Math.floor((W-60)/(String(p.text).length*.52))))}" fill="#dbe4f0"><tspan fill="${p.color||M}">↳ </tspan>${xEsc(p.text)}</text>`;return `${mark(p.res,X+10,y-9)}<text x="${X+30}" y="${y}" font-family="${F.sb}" font-size="${Math.max(17,Math.min(25,Math.floor((W-(hasClose?260:130))/(String(p.text).length*.56))))}" fill="#ffffff">${xEsc(p.text)}</text><text x="${hasClose?R-120:R}" y="${y}" text-anchor="end" font-family="${F.xb}" font-size="24" fill="${p.res==="lost"?"#f87171":p.res==="push"?"#cbd5e1":p.color||M}">${xEsc(p.odds)}</text>${hasClose?`<text x="${R}" y="${y}" text-anchor="end" font-family="${F.sb}" font-size="22" fill="#9fb0cc">${xEsc(p.close||"—")}</text>`:""}<text x="${X+30}" y="${y+25}" font-family="${F.sb}" font-size="18" fill="#9fb0cc">${xEsc(p.sub)}</text>`}).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${H}" viewBox="0 0 1200 ${H}">
<defs><linearGradient id="tm" x1="0" y1="0" x2="0.45" y2="1"><stop offset="0" stop-color="#1d4ed8"/><stop offset="1" stop-color="#0b1530"/></linearGradient></defs>
<rect width="1200" height="${H}" fill="#0b1530"/><rect width="470" height="${H}" fill="url(#tm)"/>
<text x="56" y="120" font-family="${F.xb}" font-size="22" letter-spacing="4" fill="#ffffff" fill-opacity=".8">${xEsc(d.kicker||(d.final?'LOCKED SO FAR':'OFFICIAL PICKS'))}</text>
<text x="50" y="260" font-family="${F.g}" font-size="${xFit(d.day,380,120,.62)}" fill="${d.dayColor||"#ffffff"}">${xEsc(d.day)}</text>
<text x="56" y="318" font-family="${F.sb}" font-size="26" fill="#ffffff" fill-opacity=".75">${xEsc(d.dateLine||`${d.date} · ${d.picks.length} pick${d.picks.length===1?'':'s'}${d.final?'':' so far'}`)}</text>
<text x="56" y="352" font-family="${F.sb}" font-size="22" fill="#ffffff" fill-opacity=".6">${xEsc(d.note||(d.final?`More can drop until kickoff · ${d.kick}`:'More can drop up to kickoff'))}</text>${d.note2?`<text x="56" y="384" font-family="${F.sb}" font-size="22" fill="#ffffff" fill-opacity=".6">${xEsc(d.note2)}</text>`:''}
${d.records?d.records.map((r,i)=>{const y=410+i*90+Math.max(0,B-56);return `<text x="56" y="${y}" font-family="${F.xb}" font-size="15" letter-spacing="2.5" fill="${r.color||'#ffffff'}" fill-opacity=".85">${xEsc(r.label)}</text>${r.lines.map((l,j)=>`<text x="56" y="${y+28+j*28}" font-family="${F.sb}" font-size="21" fill="#ffffff">${xEsc(l)}</text>`).join('')}`}).join(''):d.season?`<text x="56" y="${d.note2?446:430}" font-family="${F.sb}" font-size="24" fill="#ffffff" fill-opacity=".75">Season <tspan font-family="${F.xb}" fill="#ffffff" fill-opacity="1">${xEsc(d.season)}</tspan></text>`:''}
${xLogo(56,520+B,56)}<text x="128" y="${558+B}" font-family="${F.g}" font-size="30" fill="#ffffff">Bet This Guy</text>
<text x="56" y="${643+B}" font-family="${F.xb}" font-size="20" letter-spacing="2.5" fill="#ffffff" fill-opacity=".85">${xEsc(d.foot||"LOCKED BEFORE KICKOFF · 21+")}</text>
${heads}${rows}${more>0?`<text x="${X+30}" y="${end}" font-family="${F.sb}" font-size="22" fill="#9fb0cc">+ ${more} more</text>`:''}
<rect x="470" y="${589+B}" width="730" height="86" fill="${M}"/>
<text x="${X}" y="${643+B}" font-family="${F.g}" font-size="29" fill="#06231a">${xEsc(d.cta||"Graded in public")}</text>
<text x="${R-38}" y="${644+B}" text-anchor="end" font-family="${F.g}" font-size="31" fill="#06231a">betthisguy.com</text><path d="M1118 ${633+B}h24m-9-9 9 9-9 9" fill="none" stroke="#06231a" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
}
const etDate=(t,o)=>new Date(t).toLocaleString('en-US',{timeZone:'America/New_York',...o});
async function slatePicks(env,now){
  const rows=(await env.DB.prepare("SELECT * FROM public_recommendations WHERE source='market-verified-v2' AND id LIKE 'official|%' AND result IS NULL AND game_time>? AND game_time<? ORDER BY game_time").bind(new Date(now+5*60000).toISOString(),new Date(now+40*3600000).toISOString()).all()).results||[];
  if(!rows.length)return {rows:[]};
  // One game day: the picks on the same (Eastern) date as the next kickoff.
  const day=etDate(Date.parse(rows[0].game_time),{year:'numeric',month:'2-digit',day:'2-digit'});
  return {rows:rows.filter(r=>etDate(Date.parse(r.game_time),{year:'numeric',month:'2-digit',day:'2-digit'})===day),first:Date.parse(rows[0].game_time)};
}
// final: the same card about 75 minutes before the day's first pick kicks
// off (the run 65 to 80 minutes out, after inactives), with everything
// locked by then. morning: an update at 9 AM Eastern on game day, when
// picks have locked since the night-before post and kickoff is 90+ minutes off.
// Season records for the card graphics: sportsbook and prediction-app
// singles and parlays, W–L and profit ($100 singles; parlays at their stake).
async function xCardRecords(env){
  const sb=weeklySummary((await env.DB.prepare("SELECT kind,posted_at,line,odds,combined_odds,status,result,closing_line,closing_odds,closing_captured_at,legs_json FROM public_recommendations WHERE source='market-verified-v2' AND id LIKE 'official|%'").all()).results||[]);
  const pm=predictionRecord((await env.DB.prepare('SELECT result,odds,net_odds,close_odds FROM prediction_picks WHERE event_id NOT LIKE \'NBA--%\'').all().catch(()=>({results:[]}))).results||[]);
  const pp=predictionParlayRecord((await env.DB.prepare('SELECT result,odds,legs_json,posted_at FROM prediction_parlays').all().catch(()=>({results:[]}))).results||[]);
  const m=v=>Math.round(v)===0?'$0':weeklyMoney(v);
  return [{label:'SPORTSBOOKS',color:'#2ee6a8',lines:[`Singles ${sb.wins}–${sb.losses} · ${m(sb.profit)}`,`Parlays ${sb.parlayWins}–${sb.parlayLosses} · ${m(sb.parlayProfit)}`]},{label:'PREDICTION APPS',color:'#c4b5fd',lines:[`Singles ${pm.wins}–${pm.losses} · ${m(pm.profit)}`,`Parlays ${pp.wins}–${pp.losses} · ${m(pp.profit)}`]}];
}
// A fresh slate post on request (after deleting one, say): app_settings
// x-slate-request set to a new value (2026-10-18, 2026-10-18#2) posts the
// card now, once per value, with the picks still to play.
// A pick that's been on X (its own post, or on a card): xc:<id> marks the cards.
async function xCovered(env,ids,now){const at=new Date(now).toISOString();if(ids.length)await env.DB.batch(ids.map(id=>env.DB.prepare('INSERT OR IGNORE INTO app_settings(key,value) VALUES(?,?)').bind(`xc:${id}`,at))).catch(()=>{})}
// Catch-up card: picks inside 75 minutes of their game that haven't been on
// X yet (locked after the day's cards went out), all on one card.
async function postCatchUpToX(env,now=Date.now()){
  if(!env.DB||!xReady(env))return {posted:0,disabled:true};
  const a=new Date(now+5*60000).toISOString(),b=new Date(now+75*60000).toISOString(),q=sql=>env.DB.prepare(sql).bind(a,b).all().then(r=>r.results||[]).catch(()=>[]);
  const sb=await q("SELECT * FROM public_recommendations WHERE source='market-verified-v2' AND id LIKE 'official|%' AND result IS NULL AND game_time>? AND game_time<? ORDER BY game_time");
  const pm=await q('SELECT * FROM prediction_picks WHERE event_id NOT LIKE \'NBA--%\' AND result IS NULL AND game_time>? AND game_time<? ORDER BY game_time'),pp=await q('SELECT * FROM prediction_parlays WHERE result IS NULL AND game_time>? AND game_time<? ORDER BY game_time');
  const all=[...sb.map(r=>({r,keys:[`xi:${r.id}`,`xc:${r.id}`]})),...pm.map(r=>({r,pm:true,keys:[`xpm:${r.id}`,`xc:${r.id}`]})),...pp.map(r=>({r,pm:true,parlay:true,keys:[`xpmp:${r.id}`,`xc:${r.id}`]}))];
  if(!all.length)return {posted:0,none:true};
  const keys=all.flatMap(x=>x.keys),have=new Set();
  for(let i=0;i<keys.length;i+=90){const part=keys.slice(i,i+90);((await env.DB.prepare(`SELECT key FROM app_settings WHERE key IN (${part.map(()=>'?').join(',')})`).bind(...part).all().catch(()=>({results:[]}))).results||[]).forEach(r=>have.add(r.key))}
  const open=all.filter(x=>!x.keys.some(k=>have.has(k)));if(!open.length)return {posted:0,covered:true};
  const key=`x-catch:${open[0].r.id}`;if(!(await xClaimable(env,key,now))||!(await xClaim(env,key,now)))return {posted:0,done:true};
  const C='#c4b5fd',legsOf=r=>{try{return JSON.parse(r.legs_json)}catch{return []}};
  const rows=open.map(({r,pm,parlay})=>{
    if(parlay){const legs=legsOf(r);return {color:C,text:`${legs.length}-leg parlay`,odds:`${exchangePct(r.odds)}%`,sub:`${r.exchange} · $25`,legLines:legs.map(l=>({text:`${l.player} ${weeklyLegText(l)}`,odds:`${exchangePct(l.netOdds??l.odds)}%`}))}}
    if(pm)return {color:C,text:`${r.player} · ${weeklyLegText(r)}`,odds:`${exchangePct(r.odds)}%`,sub:[xMatchup(r.team),r.exchange,`fair ${Math.round(r.fair_pct)}%`].join(' · ')};
    const legs=recordLegs(r),f=legs[0]||{};
    return r.kind==='parlay'?{text:`${legs.length}-leg parlay`,odds:weeklyOdds(r.combined_odds),legLines:legs.map(l=>({text:`${l.player} ${weeklyLegText(l)}`,odds:weeklyOdds(l.odds)}))}:{text:`${r.player} · ${weeklyLegText(r)}`,odds:weeklyOdds(r.odds),sub:[xMatchup(f.team),f.book].filter(Boolean).join(' · ')}});
  const first=Math.min(...open.map(x=>Date.parse(x.r.game_time))),n=open.length,anyPm=open.some(x=>x.pm),rec=await xRecords(env).catch(()=>null);
  const books=open.filter(x=>!x.pm).length,apps=n-books,kick=`${etDate(first,{hour:'numeric',minute:'2-digit'})} ET`;
  const text=xPostText({head:`🔒 Just locked: ${n} more pick${n===1?'':'s'} before kickoff`,lines:[[books?`${books} sportsbook`:'',apps?`${apps} prediction app`:''].filter(Boolean).join(' + ')+`, every one on the card 👇`,`First game ${kick}.`],rec,age:anyPm?'18+/21+ by app':'21+'});
  let mediaId=null;
  try{if(typeof renderCardPng==='function')mediaId=await xUploadImage(env,await renderCardPng(xSlateSvg({final:true,kicker:'JUST LOCKED',day:etDate(first,{weekday:'long'}),dateLine:`${n} more pick${n===1?'':'s'} · first game ${kick}`,note:'Posted before kickoff',picks:rows,records:await xCardRecords(env).catch(()=>null),age:anyPm?'18+/21+':'21+'})))}
  catch(error){await setAppSetting(env,'x-last-error',`${new Date(now).toISOString()} catch-up graphic: ${error.message}`).catch(()=>{})}
  try{const sent=await xPost(env,text,mediaId);await xDone(env,key,now);await xCovered(env,open.map(x=>x.r.id),now);await setAppSetting(env,'x-last-post',`${new Date(now).toISOString()} catch-up ${n} ${sent?.data?.id||''}`).catch(()=>{});return {posted:1,picks:n,graphic:Boolean(mediaId)}}
  catch(error){await env.DB.prepare('DELETE FROM app_settings WHERE key=?').bind(key).run().catch(()=>{});await setAppSetting(env,'x-last-error',`${new Date(now).toISOString()} ${error.message}`).catch(()=>{});return {posted:0,error:error.message}}
}
// Prediction-app slate: the day's prediction picks and parlays on one card,
// 20 minutes after that day's sportsbook slate went out (or on request:
// x-pm-slate-request set to a new value posts it now, once per value).
async function postPredictionSlateToX(env,now=Date.now()){
  if(!env.DB||!xReady(env))return {posted:0,disabled:true};
  const soon=new Date(now+5*60000).toISOString(),until=new Date(now+40*3600000).toISOString();
  const picks=(await env.DB.prepare('SELECT * FROM prediction_picks WHERE event_id NOT LIKE \'NBA--%\' AND result IS NULL AND game_time>? AND game_time<? ORDER BY game_time').bind(soon,until).all().catch(()=>({results:[]}))).results||[];
  const parlays=(await env.DB.prepare('SELECT * FROM prediction_parlays WHERE result IS NULL AND game_time>? AND game_time<? ORDER BY game_time').bind(soon,until).all().catch(()=>({results:[]}))).results||[];
  const firstAll=[...picks,...parlays].map(r=>Date.parse(r.game_time)).sort((a,b)=>a-b)[0];if(!firstAll)return {posted:0,empty:true};
  const ymd=t=>etDate(t,{year:'numeric',month:'2-digit',day:'2-digit'}),day=ymd(firstAll),same=r=>ymd(Date.parse(r.game_time))===day;
  const P=picks.filter(same),PP=parlays.filter(same),date=new Date(firstAll).toISOString().slice(0,10);
  const req=String((await appSetting(env,'x-pm-slate-request'))||'');let key=`x-pm-slate:${date}`;
  if(/^\d{4}-\d{2}-\d{2}(#\w{1,8})?$/.test(req)&&!(await appSetting(env,`x-pm-slate-req:${req}`)))key=`x-pm-slate-req:${req}`;
  else{
    // Due 20 minutes after the sportsbook slate for the same day.
    const sbDone=[await appSetting(env,`x-slate:${date}`),await appSetting(env,`x-slate-req:${await appSetting(env,'x-slate-request')}`)].map(v=>Date.parse(String(v||''))).filter(Number.isFinite);
    const last=Math.max(...sbDone);if(!sbDone.length||now-last<20*60000||now-last>12*3600000)return {posted:0,due:false};
  }
  if(P.length+PP.length<2)return {posted:0,empty:true};
  if(!(await xClaimable(env,key,now))||!(await xClaim(env,key,now)))return {posted:0,done:true};
  const C='#c4b5fd',legsOf=r=>{try{return JSON.parse(r.legs_json)}catch{return []}};
  const rows=[...P.map(r=>({t:Date.parse(r.game_time),color:C,text:`${r.player} · ${weeklyLegText(r)}`,odds:`${exchangePct(r.odds)}%`,sub:[xMatchup(r.team),r.exchange,`fair ${Math.round(r.fair_pct)}%`].filter(Boolean).join(' · ')})),
    ...PP.map(r=>{const legs=legsOf(r);return {t:Date.parse(r.game_time),color:C,text:`${legs.length}-leg parlay`,odds:`${exchangePct(r.odds)}%`,sub:`${r.exchange} · $25`,legLines:legs.map(l=>({text:`${l.player} ${weeklyLegText(l)}`,odds:`${exchangePct(l.netOdds??l.odds)}%`}))}})].sort((a,b)=>a.t-b.t);
  const dayName=etDate(firstAll,{weekday:'long'}),rec=await xRecords(env).catch(()=>null),n=P.length+PP.length;
  const text=xPostText({head:`🔒 ${dayName}’s prediction-app picks: ${n} so far`,lines:[`${P.length} single${P.length===1?'':'s'}${PP.length?` + ${PP.length} parlay${PP.length===1?'':'s'}`:''}, every one on the card 👇`,'Priced after each app’s fee. More can drop up to kickoff.'],rec,age:'18+/21+ by app'});
  let mediaId=null;
  try{if(typeof renderCardPng==='function')mediaId=await xUploadImage(env,await renderCardPng(xSlateSvg({kicker:'PREDICTION APP PICKS',day:dayName,dayColor:C,date:etDate(firstAll,{month:'short',day:'numeric'}),dateLine:`${etDate(firstAll,{month:'short',day:'numeric'})} · ${n} picks so far`,note:'Chances after each app’s fee',picks:rows,records:await xCardRecords(env).catch(()=>null),cta:'Graded after fees',age:'18+/21+',foot:'PRICED AFTER FEES · 18+/21+'})))}
  catch(error){await setAppSetting(env,'x-last-error',`${new Date(now).toISOString()} pm slate graphic: ${error.message}`).catch(()=>{})}
  try{const sent=await xPost(env,text,mediaId);await xDone(env,key,now);await setAppSetting(env,'x-last-post',`${new Date(now).toISOString()} pm-slate ${key} ${sent?.data?.id||''}`).catch(()=>{});await xCovered(env,[...P,...PP].map(r=>r.id),now);return {posted:1,picks:n,graphic:Boolean(mediaId)}}
  catch(error){await env.DB.prepare('DELETE FROM app_settings WHERE key=?').bind(key).run().catch(()=>{});await setAppSetting(env,'x-last-error',`${new Date(now).toISOString()} ${error.message}`).catch(()=>{});return {posted:0,error:error.message}}
}
async function postSlateRequestToX(env,now=Date.now()){
  if(!env.DB||!xReady(env))return {posted:0,disabled:true};
  const req=String((await appSetting(env,'x-slate-request'))||'');if(!/^\d{4}-\d{2}-\d{2}(#\w{1,8})?$/.test(req))return {posted:0,none:true};
  if(await appSetting(env,`x-slate-req:${req}`)&&!(await xClaimable(env,`x-slate-req:${req}`,now)))return {posted:0,done:true};
  return postSlateToX(env,now,false,false,req);
}
async function postSlateToX(env,now=Date.now(),final=false,morning=false,request=''){
  if(!env.DB||!xReady(env))return {posted:0,disabled:true};
  const {rows,first}=await slatePicks(env,now),date=first?new Date(first).toISOString().slice(0,10):'';
  if(request){if(!rows.length)return {posted:0,empty:true}}
  else if(morning){
    const ymd=t=>etDate(t,{year:'numeric',month:'2-digit',day:'2-digit'});
    if(rows.length<2||ymd(now)!==ymd(first)||Number(etDate(now,{hour:'numeric',hourCycle:'h23'}))!==9||first-now<90*60000||await appSetting(env,`x-final:${date}`))return {posted:0,due:false};
    const night=Date.parse(String(await appSetting(env,`x-slate:${date}`)||'').replace(/^pending /,''));
    if(Number.isFinite(night)&&!rows.some(r=>Date.parse(r.posted_at)>night))return {posted:0,nothingNew:true};
  }else if(rows.length<(final?1:2)||(final?(first-now>80*60000||first-now<65*60000):first-now>16*3600000))return {posted:0,due:false};
  const key=request?`x-slate-req:${request}`:`x-${final?'final':morning?'morning':'slate'}:${date}`;
  if(!(await xClaim(env,key,now)))return {posted:0,done:true};
  const all=(await env.DB.prepare("SELECT kind,posted_at,line,odds,combined_odds,status,result,closing_line,closing_odds,closing_captured_at,legs_json FROM public_recommendations WHERE source='market-verified-v2' AND id LIKE 'official|%'").all()).results||[];
  const season=weeklySummary(all);
  const picks=rows.map(r=>{const legs=recordLegs(r),f=legs[0]||{};return r.kind==='parlay'?{text:`${legs.length}-leg parlay`,odds:weeklyOdds(r.combined_odds),sub:legs.map(l=>l.player).join(' + '),legLines:legs.map(l=>({text:`${l.player} ${weeklyLegText(l)}`,odds:weeklyOdds(l.odds)}))}:{text:`${r.player} · ${weeklyLegText(r)}`,odds:weeklyOdds(r.odds),sub:[xMatchup(f.team),f.book,exchangeLine(r,null,1)].filter(Boolean).join(' · ')}});
  const dayName=etDate(first,{weekday:'long'}),kick=`${etDate(first,{hour:'numeric',minute:'2-digit'})} ET`;
  // The caption counts the picks (the card shows every one), so it never runs long.
  const singles=rows.filter(r=>r.kind!=='parlay').length,parlays=rows.length-singles,rec=await xRecords(env).catch(()=>null);
  const counts=`${singles} single${singles===1?'':'s'}${parlays?` + ${parlays} parlay${parlays===1?'':'s'}`:''}, every one on the card 👇`;
  const head=morning?`☀️ ${dayName} morning: ${rows.length} official pick${rows.length===1?'':'s'} so far`:final?`🔒 Locked for ${dayName}: ${rows.length} official pick${rows.length===1?'':'s'} so far`:`🔒 ${dayName}’s official picks: ${rows.length} so far`;
  const text=xPostText({head,lines:[counts,final?`First kickoff ${kick}. More can drop until then: turn on alerts.`:'More can drop up to kickoff: turn on alerts.'],rec});
  let mediaId=null;
  try{if(typeof renderCardPng==='function')mediaId=await xUploadImage(env,await renderCardPng(xSlateSvg({final,kick,day:dayName,date:etDate(first,{month:'short',day:'numeric'}),picks,records:await xCardRecords(env).catch(()=>null),season:season.wins+season.losses>=5?`${season.wins}–${season.losses} · ${weeklyMoney(season.profit)}`:''})))}
  catch(error){await setAppSetting(env,'x-last-error',`${new Date(now).toISOString()} slate graphic: ${error.message}`).catch(()=>{})}
  try{await xPost(env,text,mediaId);await xDone(env,key,now);await setAppSetting(env,'x-last-post',`${new Date(now).toISOString()} slate ${key}`).catch(()=>{});await xCovered(env,rows.map(r=>r.id),now);return {posted:1,final,morning,picks:rows.length,graphic:Boolean(mediaId)}}
  catch(error){console.warn('x_slate_failed',error.message);await env.DB.prepare('DELETE FROM app_settings WHERE key=?').bind(key).run().catch(()=>{});return {posted:0,error:error.message}}
}
// Alerts post to pin: a day's locked picks as proof, and why alerts matter
// (prices move after a pick locks). Posts once per value of the app_settings
// key x-pin-request, an Eastern date like 2026-10-11 (2026-10-11#2 resends).
async function postAlertsPinToX(env,now=Date.now()){
  if(!env.DB||!xReady(env))return {posted:0,disabled:true};
  // A suffix (2026-10-11#2) sends a fresh one for the same day.
  const req=String((await appSetting(env,'x-pin-request'))||'');if(!/^\d{4}-\d{2}-\d{2}(#\w{1,8})?$/.test(req))return {posted:0,none:true};
  const day=req.slice(0,10),key=`x-pin:${req}`;if(!(await xClaimable(env,key,now)))return {posted:0,done:true};
  const all=(await env.DB.prepare("SELECT * FROM public_recommendations WHERE source='market-verified-v2' AND id LIKE 'official|%' AND game_time>? AND game_time<? ORDER BY game_time,posted_at").bind(`${day}T00:00:00Z`,new Date(Date.parse(`${day}T00:00:00Z`)+2*86400000).toISOString()).all()).results||[];
  const rows=all.filter(r=>etDate(Date.parse(r.game_time),{year:'numeric',month:'2-digit',day:'2-digit'})===`${day.slice(5,7)}/${day.slice(8,10)}/${day.slice(0,4)}`);
  if(!rows.length)return {posted:0,empty:true};
  if(!(await xClaim(env,key,now)))return {posted:0,done:true};
  const dec=o=>o>0?1+o/100:1+100/-o,singles=rows.filter(r=>r.kind==='prop');
  const moved=singles.filter(r=>{const t=(recordLegs(r)[0]?.priceTrail||[]).filter(p=>p&&p.o!=null).at(-1);return t&&dec(t.o)<dec(Number(r.odds))}).length;
  const picks=rows.map(r=>{const legs=recordLegs(r),f=legs[0]||{};return r.kind==='parlay'?{text:`${legs.length}-leg parlay`,odds:weeklyOdds(r.combined_odds),sub:legs.map(l=>l.player).join(' + ')}:{text:`${r.player} · ${weeklyLegText(r)}`,odds:weeklyOdds(r.odds),sub:[xMatchup(f.team),f.book,exchangeLine(r,null,1)].filter(Boolean).join(' · ')}});
  const first=Date.parse(rows[0].game_time),dayName=etDate(first,{weekday:'long'});
  const proof=singles.length&&moved*2>=singles.length?` ${moved} of ${singles.length} of ${dayName}’s picks paid more when we locked them than they did at kickoff.`:'';
  const text=xShort(`🔔 We bet the number, and numbers move.${proof}\n\nFree pick alerts ping you the second a pick locks, at the best price. That’s how you bet them.\n\n${dayName}’s locked card below. Turn on alerts: link in bio. 21+`);
  let mediaId=null;
  try{if(typeof renderCardPng==='function')mediaId=await xUploadImage(env,await renderCardPng(xSlateSvg({final:true,kicker:'LOCKED BEFORE KICKOFF',note:'Alerts get every pick first',day:dayName,date:etDate(first,{month:'short',day:'numeric'}),picks})))}
  catch(error){await setAppSetting(env,'x-last-error',`${new Date(now).toISOString()} pin graphic: ${error.message}`).catch(()=>{})}
  try{const sent=await xPost(env,text,mediaId);await xDone(env,key,now);await setAppSetting(env,'x-last-post',`${new Date(now).toISOString()} pin ${day} ${sent?.data?.id||''}`).catch(()=>{});return {posted:1,picks:rows.length,moved,graphic:Boolean(mediaId)}}
  catch(error){console.warn('x_pin_failed',error.message);await env.DB.prepare('DELETE FROM app_settings WHERE key=?').bind(key).run().catch(()=>{});await setAppSetting(env,'x-last-error',`${new Date(now).toISOString()} ${error.message}`).catch(()=>{});return {posted:0,error:error.message}}
}
// Whole card on one graphic: a game day's sportsbook picks and prediction
// app picks and parlays, for a post to pin. Posts once per value of the
// app_settings key x-combo-request, an Eastern date (2026-10-12, or
// 2026-10-12#2 to resend); only games that haven't kicked off are shown.
async function postComboToX(env,now=Date.now()){
  if(!env.DB||!xReady(env))return {posted:0,disabled:true};
  const req=String((await appSetting(env,'x-combo-request'))||'');if(!/^\d{4}-\d{2}-\d{2}(#\w{1,8})?$/.test(req))return {posted:0,none:true};
  const day=req.slice(0,10),key=`x-combo:${req}`;if(!(await xClaimable(env,key,now)))return {posted:0,done:true};
  const etDay=`${day.slice(5,7)}/${day.slice(8,10)}/${day.slice(0,4)}`,onDay=r=>etDate(Date.parse(r.game_time),{year:'numeric',month:'2-digit',day:'2-digit'})===etDay;
  const from=new Date(now).toISOString(),to=new Date(Date.parse(`${day}T00:00:00Z`)+2*86400000).toISOString();
  const official=((await env.DB.prepare("SELECT * FROM public_recommendations WHERE source='market-verified-v2' AND id LIKE 'official|%' AND game_time>? AND game_time<? ORDER BY game_time,posted_at").bind(from,to).all()).results||[]).filter(onDay);
  const pm=((await env.DB.prepare('SELECT * FROM prediction_picks WHERE event_id NOT LIKE \'NBA--%\' AND game_time>? AND game_time<? ORDER BY game_time,posted_at').bind(from,to).all()).results||[]).filter(onDay);
  const pmp=((await env.DB.prepare('SELECT * FROM prediction_parlays WHERE game_time>? AND game_time<? ORDER BY game_time,posted_at').bind(from,to).all().catch(()=>({results:[]}))).results||[]).filter(onDay);
  const total=official.length+pm.length+pmp.length;if(!total||!pm.length&&!pmp.length||!official.length)return {posted:0,empty:true};
  if(!(await xClaim(env,key,now)))return {posted:0,done:true};
  const P='#c4b5fd',legsOf=r=>{try{return JSON.parse(r.legs_json)}catch{return []}};
  const picks=[...official.flatMap(r=>{const legs=recordLegs(r),f=legs[0]||{};return r.kind==='parlay'?[{text:`${legs.length}-leg parlay`,odds:weeklyOdds(r.combined_odds),sub:'Sportsbook · $25'},...legs.map(l=>({leg:true,text:`${l.player} · ${weeklyLegText(l)}`}))]:[{text:`${r.player} · ${weeklyLegText(r)}`,odds:weeklyOdds(r.odds),sub:['Sportsbook',f.book].filter(Boolean).join(' · ')}]}),
    ...pm.map(r=>({text:`${r.player} · ${weeklyLegText(r)}`,odds:`${exchangePct(r.odds)}%`,color:P,sub:`Prediction app · ${r.exchange} · fair ${Math.round(r.fair_pct)}%`})),
    ...pmp.flatMap(r=>{const legs=legsOf(r);return [{text:`${legs.length}-leg parlay`,odds:`${exchangePct(r.odds)}%`,color:P,sub:`Prediction app · ${r.exchange} · $25`},...legs.map(l=>({leg:true,color:P,text:`${l.player} · ${weeklyLegText(l)}`}))]})];
  const all=(await env.DB.prepare("SELECT kind,posted_at,line,odds,combined_odds,status,result,closing_line,closing_odds,closing_captured_at,legs_json FROM public_recommendations WHERE source='market-verified-v2' AND id LIKE 'official|%'").all()).results||[];
  const season=weeklySummary(all),first=Math.min(...[...official,...pm,...pmp].map(r=>Date.parse(r.game_time))),dayName=etDate(first,{weekday:'long'});
  const games=[...new Set([...official.map(r=>xMatchup(recordLegs(r)[0]?.team)),...pm.map(r=>xMatchup(r.team))].filter(Boolean))],matchup=games.length===1?games[0]:'';
  const ownText=String((await appSetting(env,'x-combo-text'))||'').trim();
  const text=ownText&&[...ownText].length<=280?ownText:xShort(`📍 Wherever you are, Bet This Guy helps you find the best value on each and every game.\n\n🏈 Sportsbooks in your state? We find the best number.\n📈 Prediction apps only? We price those too.\n\n${matchup?`Tonight’s full card, ${matchup}`:`${dayName}’s full card`} 👇\nFree alerts + every pick graded. Link in bio. 21+`);
  let mediaId=null;
  try{if(typeof renderCardPng==='function')mediaId=await xUploadImage(env,await renderCardPng(xSlateSvg({final:true,kicker:matchup?'TONIGHT’S CARD':'THE FULL CARD',day:matchup||dayName,date:etDate(first,{month:'short',day:'numeric'}),dateLine:`${etDate(first,{month:'short',day:'numeric'})} · ${total} play${total===1?'':'s'}`,note:'Sportsbooks + prediction apps',note2:`Kickoff ${etDate(first,{hour:'numeric',minute:'2-digit'})} ET`,picks,records:await xCardRecords(env).catch(()=>null),cta:'Wherever you bet',season:season.wins+season.losses>=5?`${season.wins}–${season.losses} · ${weeklyMoney(season.profit)}`:''})))}
  catch(error){await setAppSetting(env,'x-last-error',`${new Date(now).toISOString()} combo graphic: ${error.message}`).catch(()=>{})}
  try{const sent=await xPost(env,text,mediaId);await xDone(env,key,now);if(ownText)await env.DB.prepare('DELETE FROM app_settings WHERE key=?').bind('x-combo-text').run().catch(()=>{});if(sent?.data?.id)await setAppSetting(env,`xid:x-combo:${day}`,String(sent.data.id)).catch(()=>{});await setAppSetting(env,'x-last-post',`${new Date(now).toISOString()} combo ${day} ${mediaId?'graphic':'text'} ${sent?.data?.id||''}`).catch(()=>{});return {posted:1,plays:total,graphic:Boolean(mediaId)}}
  catch(error){console.warn('x_combo_failed',error.message);await env.DB.prepare('DELETE FROM app_settings WHERE key=?').bind(key).run().catch(()=>{});await setAppSetting(env,'x-last-error',`${new Date(now).toISOString()} ${error.message}`).catch(()=>{});return {posted:0,error:error.message}}
}
// NBA on X: one card a night about 30 minutes before the first tip (every
// pick and parlay on one graphic), a reply under it for any pick that posts
// later, a reply as each pick is graded, and a recap reply once the night is
// done. app_settings x-nba = 'hold' stops all of it.
const nbaRows=async(env,night)=>(await env.DB.prepare("SELECT * FROM public_recommendations WHERE source='market-verified-v2' AND id>=? AND id<? ORDER BY game_time,posted_at").bind(`nba|${night}|`,`nba|${night}|￿`).all()).results||[];
const nbaRecordSummary=async env=>weeklySummary((await env.DB.prepare("SELECT kind,posted_at,line,odds,combined_odds,status,result,closing_line,closing_odds,closing_captured_at,legs_json FROM public_recommendations WHERE source='market-verified-v2' AND id LIKE 'nba|%'").all()).results||[]);
const nbaLine=r=>{const legs=recordLegs(r),f=legs[0]||{};return r.kind==='parlay'?`• ${legs.length}-leg parlay (${weeklyOdds(r.combined_odds)}): ${legs.map(l=>`${l.player} ${weeklyLegText(l)}`).join(' + ')}`:`• ${r.player} ${weeklyLegText(r)} (${weeklyOdds(r.odds)}${f.book?`, ${f.book}`:''})`};
const nbaSlatePicks=rows=>rows.flatMap(r=>{const legs=recordLegs(r),f=legs[0]||{},res=['won','lost','push'].includes(r.result)?r.result:null;return r.kind==='parlay'?[{text:`${legs.length}-leg parlay`,odds:weeklyOdds(r.combined_odds),sub:'$25',res},...legs.map(l=>({leg:true,text:`${l.player} · ${weeklyLegText(l)}`}))]:[{player:r.player,text:`${r.player} · ${weeklyLegText(r)}`,odds:weeklyOdds(r.odds),sub:[xMatchup(f.team),f.book].filter(Boolean).join(' · '),res}]});
const nbaDecided=r=>['won','lost','push'].includes(r.result)&&(r.status==='final'||recordLegs(r).some(l=>l.decidedEarly));
// NBA on prediction apps: every 6 hours, one exchange-region call for the
// next NBA game's main props (points, rebounds, assists, threes; about 4
// credits) records which apps list NBA player props, for the NBA prediction view.
const NBA_EXCHANGE_MARKETS=['player_points','player_rebounds','player_assists','player_threes'];
async function checkNbaExchanges(request,env,ctx,now=Date.now()){
  if(!env.DB||!env.THE_ODDS_API_KEY)return {disabled:true};
  let saved={};try{saved=JSON.parse(await appSetting(env,'nba-exchange-check')||'{}')}catch{}
  if(now-Date.parse(saved.at||0)<6*3600000)return {skipped:true};
  const schedule=await futureSchedule(new Request(new URL('/api/schedule?sport=NBA',request.url)),env,ctx);if(!schedule.ok)return {error:'schedule'};
  const next=((await schedule.json()).data||[]).filter(e=>Date.parse(e.status?.startsAt)>now+30*60000).sort((a,b)=>Date.parse(a.status.startsAt)-Date.parse(b.status.startsAt))[0];
  if(!next)return {games:0};
  const q=new URLSearchParams({apiKey:env.THE_ODDS_API_KEY,regions:'us_ex',markets:NBA_EXCHANGE_MARKETS.join(','),oddsFormat:'american',dateFormat:'iso'});
  const r=await fetch(`${API_BASE}/sports/${NBA_SPORT.key}/events/${oddsEventId(next.eventID)}/odds?${q}`,{headers:{accept:'application/json'},signal:AbortSignal.timeout(15000)});
  if(!r.ok){await setAppSetting(env,'nba-exchange-check',JSON.stringify({at:new Date(now).toISOString(),error:r.status})).catch(()=>{});return {error:r.status}}
  const d=await r.json(),apps={};
  for(const b of d.bookmakers||[])if(EXCHANGES[b.key]){const n=(b.markets||[]).reduce((t,m)=>t+(m.outcomes||[]).filter(o=>o.description).length,0);if(n)apps[EXCHANGES[b.key]]=n}
  await setAppSetting(env,'nba-exchange-check',JSON.stringify({at:new Date(now).toISOString(),game:`${d.away_team||''} @ ${d.home_team||''}`,apps}));
  return {apps};
}
// NBA prediction-app prices for the board (Novig, ProphetX, Polymarket, …),
// saved like the NFL ones so the prediction view can list NBA props. One call
// a game with the five core markets (about 5 credits): every 30 minutes within
// 6 hours of tip-off, every 3 hours out to 36 hours, at most 8 games a run,
// and none when credits run low. Board prices only: no NBA prediction picks.
const NBA_EXCHANGE_PRICE_MARKETS=[...NBA_EXCHANGE_MARKETS,'player_points_rebounds_assists'];
async function fetchNbaExchangeOdds(eventId,apiKey){
  const q=new URLSearchParams({apiKey,regions:'us_ex',markets:NBA_EXCHANGE_PRICE_MARKETS.join(','),oddsFormat:'american',dateFormat:'iso'});
  const r=await fetch(`${API_BASE}/sports/${NBA_SPORT.key}/events/${eventId}/odds?${q}`,{headers:{accept:'application/json'},signal:AbortSignal.timeout(15000)});
  const body=await r.text();if(!r.ok)throw new Error(providerMessage(body,'Exchange prices are unavailable.'));
  const left=r.headers.get('x-requests-remaining');if(left!==null&&Number.isFinite(Number(left)))oddsCreditsLeft=Number(left);
  const d=JSON.parse(body);return {...d,bookmakers:(d.bookmakers||[]).filter(b=>EXCHANGES[b.key])};
}
// NBA prediction picks (own record, separate from NFL's). Same after-fee math
// as the NFL apps (PREDICTION_FEES). Bar set Oct 20 from the NFL app record:
// Novig picks at 1.5-2 points went 8-15 and beat the closing price 54% of the
// time, at 2-3 points 63%; ProphetX beat the close 77% at 1-2 points. So
// 2.5 points on every app but ProphetX (2), a fair price from 4+ sportsbooks,
// the five core markets, no player on the injury report, one a game, three a
// night, 10 points at most (bigger gaps are usually news the apps haven't
// caught). app_settings nba-pm-picks=off stops them; nba-pm-min changes the bar.
const NBA_PM={min:2.5,minBy:{ProphetX:2},max:10,perGame:1,perNight:3,books:4,markets:new Set(['Points','Rebounds','Assists','3-Pointers Made','Points + Rebounds + Assists'])};
// What every app offers on a game vs the sportsbook fair price: lines listed,
// lines we can price, how far each price is from fair after fees, and which
// app has the best price on the props two or more apps share.
function nbaPmAudit(audit,board,ex,fairs){
  const gameId=board.eventID||`NBA--${board.id}`,shared=new Map(),bucket=e=>e<0?'<0':e<1?'0-1':e<2?'1-2':e<2.5?'2-2.5':e<3?'2.5-3':e<4?'3-4':'4+';
  audit.games.push(`${board.away_team||''} @ ${board.home_team||''}`);
  for(const b of ex.bookmakers||[]){const name=EXCHANGES[b.key];if(!name)continue;const a=audit.apps[name]||={listed:0,priced:0,sum:0,buckets:{},best:0,shared:0};
    for(const m of b.markets||[]){const label=recordLabels[m.key];if(!label)continue;
      for(const o of m.outcomes||[]){const {side,player,line,odds}=exchangeOutcome(o);if(!player||line===null||odds===null||!['over','under'].includes(side))continue;a.listed++;
        const fair=fairs.get(`${gameId}|${normalizedName(player)}|${label}|${line}`);if(fair===undefined)continue;
        const f=100*(side==='over'?fair:1-fair),n=predictionNet(b.key,odds),edge=+(f-n.netChance).toFixed(2);a.priced++;a.sum+=edge;a.buckets[bucket(edge)]=(a.buckets[bucket(edge)]||0)+1;
        const k=`${normalizedName(player)}|${label}|${line}|${side}`,s=shared.get(k)||[];s.push([name,edge]);shared.set(k,s);
        if(edge>=1.5)audit.top.push([name,player,label,side==='over'?'Over':'Under',line,odds,+f.toFixed(1),edge,board.home_team||'']);}}}
  for(const list of shared.values())if(list.length>1){const top=list.reduce((x,y)=>y[1]>x[1]?y:x);for(const [name] of list)audit.apps[name].shared++;audit.apps[top[0]].best++}
}
async function recordNbaPredictionPicks(env,board,ex,fairs,now,ctx){
  const gameId=board.eventID||`NBA--${board.id}`,night=nbaNight(Date.parse(board.commence_time));
  const min=Number(await appSetting(env,'nba-pm-min'))||NBA_PM.min;
  ctx.night[night]??=((await env.DB.prepare("SELECT game_time FROM prediction_picks WHERE event_id LIKE 'NBA--%' AND game_time>?").bind(new Date(now-86400000).toISOString()).all()).results||[]).filter(r=>nbaNight(Date.parse(r.game_time))===night).length;
  const have=((await env.DB.prepare('SELECT player FROM prediction_picks WHERE event_id=?').bind(gameId).all()).results||[]).map(r=>normalizedName(r.player));
  const listed=name=>Boolean(injuryClass(ctx.injuries.get(normalizedName(name))?.status));
  const picks=[];let n=have.length;
  for(const p of predictionCandidates(board,ex,fairs,now,{min:Math.min(min,...Object.values(NBA_PM.minBy)),max:NBA_PM.max})){
    if(n>=NBA_PM.perGame||ctx.night[night]>=NBA_PM.perNight)break;
    if(p.edge<(NBA_PM.minBy[p.exchange]??min)||!NBA_PM.markets.has(p.market)||have.includes(normalizedName(p.player))||listed(p.player)||!sameDirection(ctx.dirs,p.eventId,p.player,p.side))continue;
    picks.push(p);n++;ctx.night[night]++;ctx.dirs.set(directionKey(p.eventId,p.player),p.side);
  }
  return picks.map(p=>env.DB.prepare('INSERT OR IGNORE INTO prediction_picks (id,exchange,event_id,player,team,market,side,line,odds,net_odds,fair_pct,edge,game_time,posted_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(`pm|${gameId}|${normalizedName(p.player)}`,p.exchange,gameId,p.player,p.team,p.market,p.side,p.line,p.odds,p.netOdds,+p.fair.toFixed(2),+p.edge.toFixed(2),p.gameTime,new Date(now).toISOString()));
}
async function recordNbaExchangePrices(env,boards,now=Date.now()){
  if(!env.DB||!env.THE_ODDS_API_KEY||(oddsCreditsLeft!==null&&oddsCreditsLeft<LOW_ODDS_CREDITS))return {skipped:true};
  const stamp=new Date(now).toISOString(),fetchedAt=new Map(((await env.DB.prepare("SELECT event_id,updated_at FROM exchange_prices WHERE event_id LIKE 'NBA--%' AND game_time>?").bind(stamp).all().catch(()=>({results:[]}))).results||[]).map(r=>[r.event_id,Date.parse(r.updated_at)]));
  const due=boards.map(b=>({b,id:b.eventID||`NBA--${b.id}`,kick:Date.parse(b.commence_time)})).filter(({id,kick})=>{if(!(kick>now+60000)||kick-now>36*3600000)return false;const age=now-(fetchedAt.get(id)||0);return age>=(kick-now<=6*3600000?29*60000:3*3600000-60000)}).sort((a,b)=>a.kick-b.kick).slice(0,8);
  const statements=[],fairs=sportsbookFairs(boards,now,NBA_PM.books),fairs3=new Map([...sportsbookFairs(boards,now,3)].filter(([k])=>!fairs.has(k))),audit={at:stamp,games:[],apps:{},top:[]},on=await appSetting(env,'nba-pm-picks')!=='off';
  let ctx=null,picks=0;
  for(const {b,id,kick} of due){try{
    const ex=await fetchNbaExchangeOdds(oddsEventId(id),env.THE_ODDS_API_KEY);
    statements.push(env.DB.prepare('INSERT OR REPLACE INTO exchange_prices (event_id,game_time,prices_json,updated_at) VALUES (?,?,?,?)').bind(id,new Date(kick).toISOString(),JSON.stringify(exchangePriceList(ex)),stamp));
    if(kick-now>PREDICTION_LOCK)continue;
    nbaPmAudit(audit,b,ex,fairs);
    // Price test (not shown): app lines 1+ point over fair, priced from 4+
    // sportsbooks (nba4) and from exactly 3 (nba3), each with its closing
    // price, to see whether 3-book lines or a lower bar would hold up.
    for(const [kind,f] of [['nba4',fairs],['nba3',fairs3]])for(const p of exchangePropCandidates(b,ex,f,now,kind).picks)statements.push(exchangeInsert(env,p,stamp));
    const open=(await env.DB.prepare("SELECT id,exchange,player,market,side,line FROM exchange_shadow WHERE kind IN ('nba4','nba3') AND event_id=? AND game_time>?").bind(id,stamp).all().catch(()=>({results:[]}))).results||[];
    for(const r of open){const key=Object.keys(EXCHANGES).find(k=>EXCHANGES[k]===r.exchange);let price=null;
      for(const bk of ex.bookmakers||[])if(bk.key===key)for(const m of bk.markets||[])if(recordLabels[m.key]===r.market)for(const o of m.outcomes||[])if(String(o.description||'').trim()===r.player&&exchangeOutcome(o).side===r.side.toLowerCase()&&exchangeOutcome(o).line===Number(r.line))price=BTGStats.number(o.price);
      if(price!==null)statements.push(env.DB.prepare('UPDATE exchange_shadow SET close_odds=?,close_at=? WHERE id=?').bind(price,stamp,r.id))}
    if(!on)continue;
    ctx||={dirs:await pickDirections(env,now),injuries:await injuryMap(env,'NBA').catch(()=>new Map()),night:{}};
    const made=await recordNbaPredictionPicks(env,b,ex,fairs,now,ctx);statements.push(...made);picks+=made.length;
  }catch(error){console.warn('nba_exchange_game_failed',error.message)}}
  if(statements.length)await env.DB.batch(statements);
  if(audit.games.length){audit.top=audit.top.sort((x,y)=>y[7]-x[7]).slice(0,20);audit.fairs=fairs.size;for(const a of Object.values(audit.apps)){a.avg=a.priced?+(a.sum/a.priced).toFixed(2):null;delete a.sum}await setAppSetting(env,'nba-pm-audit',JSON.stringify(audit)).catch(()=>{})}
  return {games:due.length,picks};
}
async function nbaExchangeStatus(env){try{const s=JSON.parse(await appSetting(env,'nba-exchange-check')||'null');return s?{at:s.at,apps:s.apps||{}}:null}catch{return null}}
// NBA launch: a five-post thread at 9 AM PT on opening day (Tim's call), with
// the NFL record filled in at posting time. x-nba=hold stops it. The props
// watch below only records when the first game's props appear.
const NBA_LAUNCH_AT=Date.parse('2026-10-20T16:00:00Z');
function nbaLaunchThread(s){
  const money=v=>(v<0?'−':'+')+'\u0024'+Math.abs(Math.round(v)).toLocaleString('en-US');
  const rec=s&&s.wins+s.losses>=10?`Same rules that got our NFL singles to ${s.wins}–${s.losses}, ${money(s.profit)}: a pick posts only when a sportsbook price beats the fair line across the big books. Locked before tip-off, graded in public.`:'Same rules as our NFL picks: a pick posts only when a sportsbook price beats the fair line across the big books. Locked before tip-off, graded in public.';
  const close=s&&s.tracked>=10?`The number we judge ourselves by: ${s.beat} of ${s.tracked} NFL picks beat the closing price (${Math.round(100*s.beat/s.tracked)}%).\n\nOne game is luck. Beating the final price week after week is how you know the edge is real.`:'The number we judge ourselves by: how often our price beats the closing price.\n\nOne game is luck. Beating the final price week after week is how you know the edge is real.';
  return [`🏀 NBA player props start today on Bet This Guy.\n\n${rec}`,
    'How it works:\n• Posts only when a big-book price beats the fair line by 1.5%+, up to 10 a night\n• Points, rebounds, assists, threes and PRA\n• Posted the moment a price qualifies\n• Player sits = no action, same as at the book\n• Singles at $100, parlays at $25',
    close,
    'Every loss stays on the record. NBA gets its own public record, separate from NFL. Link in bio.',
    'Free. No paywall. Turn on alerts and get each pick the second it locks. Link in bio.\n\n21+ · Gambling problem? Call 1-800-GAMBLER'];
}
async function watchNbaLaunch(request,env,ctx,now=Date.now()){
  if(!env.DB||await appSetting(env,'nba-props-live'))return {done:true};
  if(now<NBA_START-4*86400000)return {waiting:true};
  const last=Number(await appSetting(env,'nba-launch-check')||0);if(now-last<29*60000)return {skipped:true};
  await setAppSetting(env,'nba-launch-check',String(now));
  const schedule=await futureSchedule(new Request(new URL('/api/schedule?sport=NBA',request.url)),env,ctx);if(!schedule.ok)return {error:'schedule'};
  const first=((await schedule.json()).data||[]).filter(e=>Date.parse(e.status?.startsAt)>=NBA_START).sort((a,b)=>Date.parse(a.status.startsAt)-Date.parse(b.status.startsAt))[0];
  if(!first)return {games:0};
  const u=new URL('/api/event',request.url);u.searchParams.set('eventID',first.eventID);
  const r=await eventProps(new Request(u),env,ctx);if(!r.ok)return {error:'board'};
  const board=((await r.json()).data||[])[0]||{},props=(board.bookmakers||[]).reduce((n,b)=>n+(b.markets||[]).filter(m=>recordLabels[m.key]).reduce((x,m)=>x+(m.outcomes||[]).filter(o=>o.description).length,0),0);
  if(props>0)await setAppSetting(env,'nba-props-live',new Date(now).toISOString());
  return {props};
}
async function postNbaLaunchToX(env,now=Date.now()){
  if(!env.DB||!xReady(env)||await appSetting(env,'x-nba')==='hold')return {posted:0,disabled:true};
  if(now<NBA_LAUNCH_AT)return {posted:0,due:false};
  // All five in one run, each a reply to the one before; the ids so far are
  // saved after every post, so a failure resumes from that post next run.
  const key='x-nba-launch';let ids=[];try{ids=JSON.parse(await appSetting(env,'x-nba-launch-ids')||'[]')}catch{}
  const posts=nbaLaunchThread(await homeSeason(env,now).catch(()=>null));
  if(ids.length>=posts.length)return {posted:0,done:true};
  if(!(await xClaimable(env,key,now))||!(await xClaim(env,key,now)))return {posted:0,busy:true};
  let posted=0;
  try{while(ids.length<posts.length){const sent=await xPost(env,posts[ids.length],null,ids.at(-1)||null);const id=String(sent?.data?.id||'');if(!id)throw new Error('X returned no post id');
      ids.push(id);posted++;await setAppSetting(env,'x-nba-launch-ids',JSON.stringify(ids));if(ids.length===1)await setAppSetting(env,`xid:${key}`,id).catch(()=>{})}
    await xDone(env,key,now);await setAppSetting(env,'x-last-post',`${new Date(now).toISOString()} nba launch thread ${ids[0]}`).catch(()=>{});return {posted}}
  catch(error){await env.DB.prepare('DELETE FROM app_settings WHERE key=?').bind(key).run().catch(()=>{});await setAppSetting(env,'x-last-error',`${new Date(now).toISOString()} ${error.message}`).catch(()=>{});return {posted,error:error.message}}
}
// NBA prediction picks on X: one text post each, once. Off until
// app_settings x-nba-pm = on (Tim approves the format first).
const nbaPmXText=r=>xShort(`📈 NBA prediction app pick\n${r.player} ${weeklyLegText(r)}\n${exchangePct(r.odds)}% on ${r.exchange} · our fair chance ${Math.round(r.fair_pct)}%\n\nLocked before tip-off. Own record, separate from our sportsbook picks. 21+`);
async function postNbaPredictionToX(env,now=Date.now()){
  if(!env.DB||!xReady(env)||await appSetting(env,'x-nba-pm')!=='on')return {posted:0,disabled:true};
  // New picks first, each with its graphic (player photo, team colors, price).
  const rows=(await env.DB.prepare("SELECT * FROM prediction_picks WHERE event_id LIKE 'NBA--%' AND posted_at>? AND game_time>? ORDER BY posted_at LIMIT 5").bind(new Date(now-6*3600000).toISOString(),new Date(now).toISOString()).all()).results||[];
  for(const r of rows){const key=`x-nba-pm:${r.id}`;if(!(await xClaimable(env,key,now))||!(await xClaim(env,key,now)))continue;
    try{const mediaId=await xPredictionMedia(env,r,false);const sent=await xPost(env,nbaPmXText(r),mediaId);await xDone(env,key,now);if(sent?.data?.id)await setAppSetting(env,`xid:${r.id}`,String(sent.data.id)).catch(()=>{});await setAppSetting(env,'x-last-post',`${new Date(now).toISOString()} nba prediction ${sent?.data?.id||''} ${r.id}`).catch(()=>{});return {posted:1,graphic:Boolean(mediaId)}}
    catch(error){await env.DB.prepare('DELETE FROM app_settings WHERE key=?').bind(key).run().catch(()=>{});await setAppSetting(env,'x-last-error',`${new Date(now).toISOString()} ${error.message}`).catch(()=>{});return {posted:0,error:error.message}}}
  // Then results: a reply under the pick's own post with the result graphic, once graded.
  const done=(await env.DB.prepare("SELECT * FROM prediction_picks WHERE event_id LIKE 'NBA--%' AND result IN ('won','lost','push','void') AND game_time>? ORDER BY game_time LIMIT 10").bind(new Date(now-3*86400000).toISOString()).all()).results||[];
  for(const r of done){const parent=await appSetting(env,`xid:${r.id}`);if(!parent)continue;const key=`x-nba-pm-r:${r.id}`;if(!(await xClaimable(env,key,now))||!(await xClaim(env,key,now)))continue;
    const look={won:['✅','HIT'],lost:['❌','MISS'],push:['➖','PUSH'],void:['➖','NO ACTION']}[r.result],unit=String(r.market||'').toLowerCase(),win=r.result==='won'?100*(recordDecimal(r.net_odds||r.odds)-1):r.result==='lost'?-100:0;
    const text=xShort(`${look[0]} ${look[1]}: ${r.player} ${weeklyLegText(r)} (${exchangePct(r.odds)}% on ${r.exchange})${r.result==='void'?`\n${r.player} didn’t play: no action, stake back.`:r.actual!=null?`\nFinal: ${r.actual} ${Number(r.actual)===1?unit.replace(/s$/,''):unit}.`:''}${['won','lost'].includes(r.result)?`\n${weeklyMoney(win)} on a $100 pick.`:''}`);
    try{const mediaId=await xPredictionMedia(env,r,false,null,r.result);const sent=await xPost(env,text,mediaId,parent);await xDone(env,key,now);await setAppSetting(env,'x-last-post',`${new Date(now).toISOString()} nba prediction result ${sent?.data?.id||''} ${r.id}`).catch(()=>{});return {posted:1,result:true}}
    catch(error){await env.DB.prepare('DELETE FROM app_settings WHERE key=?').bind(key).run().catch(()=>{});await setAppSetting(env,'x-last-error',`${new Date(now).toISOString()} ${error.message}`).catch(()=>{});return {posted:0,error:error.message}}}
  return {posted:0};
}
async function postNbaCardToX(env,now=Date.now()){
  if(!env.DB||!xReady(env)||await appSetting(env,'x-nba')==='hold')return {posted:0,disabled:true};
  const night=nbaNight(now),key=`x-nba-card:${night}`,rows=await nbaRows(env,night);
  if(!rows.length)return {posted:0,empty:true};
  const first=Math.min(...rows.map(r=>Date.parse(recordLegs(r).map(l=>l.gameTime).sort()[0]||r.game_time)));
  if(first-now>35*60000||first-now<0)return {posted:0,due:false};
  if(!(await xClaimable(env,key,now))||!(await xClaim(env,key,now)))return {posted:0,done:true};
  const season=await nbaRecordSummary(env),singles=rows.filter(r=>r.kind==='prop').length,parlays=rows.length-singles;
  const rec=season.wins+season.losses>=1?`\nNBA record: ${season.wins}–${season.losses}${season.pushes?`–${season.pushes}`:''}, ${weeklyMoney(season.profit)}.`:'';
  // Every pick in the text when it fits; otherwise the counts, with the full list on the graphic.
  const tail=`${rec}\nLate games can add more. Every pick graded in public, link in bio. 21+`,when=Number(new Date(first).toLocaleString('en-US',{hour:'numeric',hour12:false,timeZone:'America/Los_Angeles'}))<15?'Today’s':'Tonight’s',full=`🏀 ${when} NBA picks\n${rows.map(nbaLine).join('\n')}\n${tail}`;
  const text=full.length<=280?full:xShort(`🏀 ${when} NBA picks: ${singles} pick${singles===1?'':'s'}${parlays?` + ${parlays} parlay${parlays===1?'':'s'}`:''}, all on the card 👇\n${tail}`);
  let mediaId=null;
  // Each single carries its player's headshot (ESPN's small copy, up to 8) when the card has room for photos.
  const singlesRows=rows.filter(r=>r.kind==='prop'),faces=new Map();
  if(singlesRows.length<=8&&typeof playerHeadshot==='function')await Promise.all(singlesRows.map(async r=>{const shot=await playerHeadshot(r.player,'NBA',true).catch(()=>null);if(shot?.bytes)faces.set(r.player,{type:shot.type||'image/png',b64:xBase64(shot.bytes)})}));
  const cardPicks=nbaSlatePicks(rows).map(p=>p.player&&faces.has(p.player)?{...p,photo:faces.get(p.player)}:p);
  try{if(typeof renderCardPng==='function')mediaId=await xUploadImage(env,await renderCardPng(xSlateSvg({final:true,kicker:'NBA · OFFICIAL PICKS',day:etDate(first,{weekday:'long'}),date:etDate(first,{month:'short',day:'numeric'}),dateLine:`${etDate(first,{month:'short',day:'numeric'})} · ${singles} pick${singles===1?'':'s'}${parlays?` + ${parlays} parlay${parlays===1?'':'s'}`:''}`,note:`First tip ${etDate(first,{hour:'numeric',minute:'2-digit'})} ET`,note2:'Late games can add more',foot:'LOCKED BEFORE TIP-OFF · 21+',picks:cardPicks,season:season.wins+season.losses>=1?`${season.wins}–${season.losses} · ${weeklyMoney(season.profit)}`:''})))}
  catch(error){await setAppSetting(env,'x-last-error',`${new Date(now).toISOString()} nba card graphic: ${error.message}`).catch(()=>{})}
  try{const sent=await xPost(env,text,mediaId);await xDone(env,key,now);if(sent?.data?.id)await setAppSetting(env,`xid:${key}`,String(sent.data.id)).catch(()=>{});
    // Picks on the card count as announced, so only later ones get an "added" reply.
    await env.DB.batch(rows.map(r=>env.DB.prepare('INSERT OR IGNORE INTO app_settings (key,value) VALUES (?,?)').bind(`x-nba-pick:${r.id}`,new Date(now).toISOString())));
    await setAppSetting(env,'x-last-post',`${new Date(now).toISOString()} nba card ${night} ${sent?.data?.id||''}`).catch(()=>{});return {posted:1,picks:rows.length,graphic:Boolean(mediaId)}}
  catch(error){console.warn('x_nba_card_failed',error.message);await env.DB.prepare('DELETE FROM app_settings WHERE key=?').bind(key).run().catch(()=>{});await setAppSetting(env,'x-last-error',`${new Date(now).toISOString()} ${error.message}`).catch(()=>{});return {posted:0,error:error.message}}
}
// Replies under the night's card: picks added after it, then results as they
// land, then the recap once every pick is graded. Text only, limit per run.
async function postNbaRepliesToX(env,now=Date.now(),limit=2){
  if(!env.DB||!xReady(env)||await appSetting(env,'x-nba')==='hold')return {posted:0,disabled:true};
  let posted=0;const out={added:0,results:0,recap:0};
  for(const night of [...new Set([nbaNight(now),nbaNight(now-86400000)])]){
    const card=await appSetting(env,`xid:x-nba-card:${night}`);if(!card)continue;
    const rows=await nbaRows(env,night),look={won:['✅','HIT'],lost:['❌','MISS'],push:['➖','NO ACTION']};
    const jobs=[
      ...rows.filter(r=>Date.parse(r.game_time)>now).map(r=>({key:`x-nba-pick:${r.id}`,kind:'added',media:async()=>xUploadImage(env,await renderCardPng(xCardSvg(await xCardData(env,r,await nbaRecordSummary(env))))),text:()=>`🔒 Added for the late games:\n${nbaLine(r)}\n\nLocked before tip-off. 21+`})),
      ...rows.filter(nbaDecided).map(r=>({key:`x-nba-r:${r.id}`,kind:'results',media:async()=>xUploadImage(env,await renderCardPng(xCardSvg(await xResultData(env,r,await nbaRecordSummary(env))))),text:()=>{const legs=recordLegs(r),f=legs[0]||{},[e,w]=r.result==='push'&&legs.every(l=>l.voided)?['➖','NO ACTION']:look[r.result],stake=r.kind==='parlay'?25:100,d=recordDecimal(r.kind==='parlay'?r.combined_odds:r.odds),win=r.result==='won'?stake*(d-1):r.result==='lost'?-stake:0,unit=String(r.market||'').toLowerCase();
        if(r.kind==='parlay')return `${e} ${w}: ${legs.length}-leg parlay (${weeklyOdds(r.combined_odds)})\n${legs.map(l=>`${l.result==='won'?'✅':l.result==='lost'?'❌':'➖'} ${l.player} ${weeklyLegText(l)}`).join('\n')}\n${r.result==='push'?'Stake back.':`${weeklyMoney(win)} on a $25 ticket.`}`;
        return `${e} ${w}: ${r.player} ${weeklyLegText(r)} (${weeklyOdds(r.odds)})${f.voided?`\n${r.player} didn’t play: no action, stake back.`:f.actualValue!=null?`\n${r.status!=='final'&&f.decidedEarly?'Already':'Final:'} ${f.actualValue} ${Number(f.actualValue)===1?unit.replace(/s$/,''):unit}${r.status!=='final'&&f.decidedEarly?', with the game still on.':'.'}`:''}${r.result==='push'?'':`\n${weeklyMoney(win)} on a $100 pick.`}`}}))
    ];
    if(rows.length&&rows.every(r=>r.status==='final'))jobs.push({key:`x-nba-recap:${night}`,kind:'recap',text:async()=>{const s=weeklySummary(rows),season=await nbaRecordSummary(env),net=s.profit+s.parlayProfit;
      return `🏀 NBA ${night===nbaNight(now)?'tonight':'last night'}: ${s.wins}–${s.losses}${s.pushes?`–${s.pushes}`:''}${s.parlayWins+s.parlayLosses?`, parlays ${s.parlayWins}–${s.parlayLosses}`:''}, ${weeklyMoney(net)}.\nNBA season: ${season.wins}–${season.losses}${season.pushes?`–${season.pushes}`:''}, ${weeklyMoney(season.profit+season.parlayProfit)}.\n\nEvery pick graded in public, losses included. Link in bio. 21+`}});
    for(const j of jobs){
      if(posted>=limit)break;
      if(!(await xClaimable(env,j.key,now))||!(await xClaim(env,j.key,now)))continue;
      // Added picks and results carry their graphic (one per run: each needs a photo, a team lookup and an upload).
      try{const mediaId=j.media?await j.media().catch(()=>null):null;const sent=await xPost(env,xShort(await j.text()),mediaId,card);await xDone(env,j.key,now);posted++;out[j.kind]++;if(mediaId)limit=posted;await setAppSetting(env,'x-last-post',`${new Date(now).toISOString()} nba ${j.kind} ${sent?.data?.id||''} ${j.key}`).catch(()=>{})}
      catch(error){await env.DB.prepare('DELETE FROM app_settings WHERE key=?').bind(j.key).run().catch(()=>{});await setAppSetting(env,'x-last-error',`${new Date(now).toISOString()} ${error.message}`).catch(()=>{});return {posted,...out,error:error.message}}
    }
  }
  return {posted,...out};
}
// Our own recent posts (originals, no replies), to find a post to reply under
// when its id wasn't saved. One read, cached 10 minutes. The account id is the
// first part of the access token.
async function xOwnPosts(env,now=Date.now()){
  const cached=await appSetting(env,'x-own-recent');try{const c=JSON.parse(cached||'null');if(c&&now-c.at<10*60000)return c.posts}catch{}
  const user=String(env.X_ACCESS_TOKEN||'').split('-')[0];if(!/^\d+$/.test(user))return [];
  const base=`https://api.twitter.com/2/users/${user}/tweets`,params={max_results:'60',exclude:'replies,retweets'};
  const r=await fetch(`${base}?${new URLSearchParams(params)}`,{headers:{authorization:await xOAuthHeader(env,'GET',base,params)},signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw new Error(`X read failed (${r.status})`);
  const posts=((await r.json().catch(()=>({})))?.data||[]).map(t=>({id:String(t.id),text:String(t.text||'')}));
  await setAppSetting(env,'x-own-recent',JSON.stringify({at:now,posts})).catch(()=>{});return posts;
}
async function xFindPost(env,key,match,now){
  const saved=await appSetting(env,`xid:${key}`);if(saved)return saved;
  const hit=(await xOwnPosts(env,now).catch(()=>[])).find(p=>match(p.text));
  if(hit)await setAppSetting(env,`xid:${key}`,hit.id).catch(()=>{});return hit?.id||null;
}
const pmPickMatch=r=>t=>(t.startsWith('📈 Prediction market pick:')||/^(🔒 Official|⭐ Top) pick · Prediction app/.test(t))&&t.includes(r.player)&&t.includes(weeklyLegText(r));
const pmParlayMatch=legs=>t=>(t.startsWith('📈 Prediction market parlay')||t.startsWith('🔒 Official parlay · Prediction app'))&&legs.every(l=>t.includes(xLast(l.player)));
// Prediction picks and parlays we posted: a result reply under each post once
// it's graded (text, so a few fit in one run).
async function postPredictionResultsToX(env,now=Date.now(),limit=3){
  if(!env.DB||!xReady(env))return {posted:0,disabled:true};
  const since=new Date(now-3*86400000).toISOString();let posted=0;
  const picks=(await env.DB.prepare("SELECT * FROM prediction_picks WHERE event_id NOT LIKE 'NBA--%' AND result IN ('won','lost','push') AND game_time>? ORDER BY game_time").bind(since).all()).results||[];
  const parlays=(await env.DB.prepare("SELECT * FROM prediction_parlays WHERE result IN ('won','lost','push') AND game_time>? ORDER BY game_time").bind(since).all().catch(()=>({results:[]}))).results||[];
  const rec=predictionRecord((await env.DB.prepare('SELECT result,odds,net_odds,close_odds FROM prediction_picks WHERE event_id NOT LIKE \'NBA--%\'').all()).results||[]);
  const recLine=rec.wins+rec.losses>=3?`\nPrediction record: ${rec.wins}–${rec.losses}${rec.pushes?`–${rec.pushes}`:''}, ${weeklyMoney(rec.profit)} at $100 a pick after fees.`:'';
  const look={won:['✅','HIT'],lost:['❌','MISS'],push:['➖','PUSH']};
  const jobs=[...picks.map(r=>({id:r.id,posted:`xpm:${r.id}`,match:pmPickMatch(r),text:()=>{const [e,w]=look[r.result],win=r.result==='won'?100*(recordDecimal(r.net_odds??r.odds)-1):r.result==='lost'?-100:0,unit=String(r.market||'').toLowerCase();
      return `${e} ${w}: ${r.player} ${weeklyLegText(r)} (${exchangePct(r.odds)}% on ${r.exchange})${r.actual!=null?(r.early?`\n${r.player} already has ${r.actual} ${Number(r.actual)===1?unit.replace(/s$/,''):unit}, with the game still on.`:`\nFinal: ${r.actual} ${Number(r.actual)===1?unit.replace(/s$/,''):unit}.`):''}\n${r.result==='push'?'Stake back.':`${weeklyMoney(win)} on a $100 pick after fees.`}${recLine}\n\nEvery pick graded in public. 18+/21+ by app.`}})),
    ...parlays.map(r=>{let legs=[];try{legs=JSON.parse(r.legs_json)}catch{}return {id:r.id,posted:`xpmp:${r.id}`,match:pmParlayMatch(legs),text:()=>{const [e,w]=look[r.result];
      return `${e} ${w}: ${legs.length}-leg parlay on ${r.exchange} (${exchangePct(r.odds)}%)\n${legs.map(l=>`${l.result==='won'?'✅':l.result==='lost'?'❌':'➖'} ${l.player} ${weeklyLegText(l)}`).join('\n')}\n${r.result==='push'?'Stake back.':`${weeklyMoney(predictionParlayPay(r))} on a $25 ticket.`}\n\nEvery pick graded in public. 18+/21+ by app.`}}})];
  for(const j of jobs){
    if(posted>=limit)break;
    if(!(await appSetting(env,j.posted))||!(await xClaimable(env,`xpr:${j.id}`,now))||!(await xClaim(env,`xpr:${j.id}`,now)))continue;
    try{const to=await xFindPost(env,j.id,j.match,now),sent=await xPost(env,xShort(j.text()),null,to);await xDone(env,`xpr:${j.id}`,now);posted++;
      await setAppSetting(env,'x-last-post',`${new Date(now).toISOString()} prediction-result ${to?'reply':'post'} ${sent?.data?.id||''} ${j.id}`).catch(()=>{})}
    catch(error){await env.DB.prepare('DELETE FROM app_settings WHERE key=?').bind(`xpr:${j.id}`).run().catch(()=>{});await setAppSetting(env,'x-last-error',`${new Date(now).toISOString()} ${error.message}`).catch(()=>{});break}
  }
  return {posted};
}
// Full-card recap: once every play on a full card (x-combo-request day) is
// graded, one graphic with every result and the night's money, as a reply
// to the full-card post. Posts once per value of x-card-recap-request.
async function postCardRecapToX(env,now=Date.now()){
  if(!env.DB||!xReady(env))return {posted:0,disabled:true};
  // A requested day (x-card-recap-request), or else each full card posted in
  // the last two days that has no recap yet.
  let req=String((await appSetting(env,'x-card-recap-request'))||'');
  if(!/^\d{4}-\d{2}-\d{2}(#\w{1,8})?$/.test(req)){
    const cards=((await env.DB.prepare("SELECT key FROM app_settings WHERE key LIKE 'x-combo:%' AND value NOT LIKE 'pending %' AND value>?").bind(new Date(now-2*86400000).toISOString()).all()).results||[]).map(r=>r.key.slice(8,18));
    for(const d of [...new Set(cards)])if(!(await env.DB.prepare("SELECT 1 AS n FROM app_settings WHERE key LIKE ?").bind(`x-card-recap:${d}%`).first())){req=d;break}
    if(!req)return {posted:0,none:true};
  }
  const day=req.slice(0,10),key=`x-card-recap:${req}`;if(!(await xClaimable(env,key,now)))return {posted:0,done:true};
  const etDay=`${day.slice(5,7)}/${day.slice(8,10)}/${day.slice(0,4)}`,onDay=r=>etDate(Date.parse(r.game_time),{year:'numeric',month:'2-digit',day:'2-digit'})===etDay;
  const from=`${day}T00:00:00Z`,to=new Date(Date.parse(from)+2*86400000).toISOString();
  const official=((await env.DB.prepare("SELECT * FROM public_recommendations WHERE source='market-verified-v2' AND id LIKE 'official|%' AND game_time>? AND game_time<? ORDER BY game_time,posted_at").bind(from,to).all()).results||[]).filter(onDay);
  const pm=((await env.DB.prepare('SELECT * FROM prediction_picks WHERE event_id NOT LIKE \'NBA--%\' AND game_time>? AND game_time<? ORDER BY game_time,posted_at').bind(from,to).all()).results||[]).filter(onDay);
  const pmp=((await env.DB.prepare('SELECT * FROM prediction_parlays WHERE game_time>? AND game_time<? ORDER BY game_time,posted_at').bind(from,to).all().catch(()=>({results:[]}))).results||[]).filter(onDay);
  const done=r=>['won','lost','push','void'].includes(r.result);
  if(!official.length&&!pm.length&&!pmp.length)return {posted:0,empty:true};
  // '#now' in the request posts before every stat is in: plays still waiting
  // on official stats are listed as pending and left out of the totals.
  const partial=/#now/.test(req),pending=[...official,...pm,...pmp].filter(r=>!done(r));
  if(pending.length&&!partial)return {posted:0,waiting:true};
  if(!(await xClaim(env,key,now)))return {posted:0,done:true};
  const P='#c4b5fd',legsOf=r=>{try{return JSON.parse(r.legs_json)}catch{return []}};
  const sbMoney=official.reduce((t,r)=>t+xPayout(r),0),pmMoney=pm.reduce((t,r)=>t+(r.result==='won'?100*(recordDecimal(r.net_odds??r.odds)-1):r.result==='lost'?-100:0),0)+pmp.reduce((t,r)=>t+predictionParlayPay(r),0);
  const all=[...official,...pm,...pmp].filter(r=>r.result!=='void'),wins=all.filter(r=>r.result==='won').length,losses=all.filter(r=>r.result==='lost').length,total=sbMoney+pmMoney;
  const picks=[...official.flatMap(r=>{const legs=recordLegs(r);return r.kind==='parlay'?[{res:r.result,text:`${legs.length}-leg parlay`,odds:weeklyMoney(xPayout(r)),sub:`Sportsbook · ${weeklyOdds(r.combined_odds)} · $25`},...legs.map(l=>({leg:true,text:`${l.result==='won'?'✓':l.result==='lost'?'✗':'·'} ${l.player} · ${weeklyLegText(l)}`}))]:[{res:r.result,text:`${r.player} · ${weeklyLegText(r)}`,odds:weeklyMoney(xPayout(r)),sub:`Sportsbook · ${weeklyOdds(r.odds)}${legs[0]?.book?` · ${legs[0].book}`:''}`}]}),
    ...pm.map(r=>!done(r)?{text:`${r.player} · ${weeklyLegText(r)}`,odds:'Pending',color:'#9fb0cc',sub:`Prediction app · ${r.exchange} · ${exchangePct(r.odds)}% · waiting on official stats`}:({res:r.result,color:r.result==='won'?P:undefined,text:`${r.player} · ${weeklyLegText(r)}`,odds:weeklyMoney(r.result==='won'?100*(recordDecimal(r.net_odds??r.odds)-1):r.result==='lost'?-100:0),sub:`Prediction app · ${r.exchange} · ${exchangePct(r.odds)}%`})),
    ...pmp.flatMap(r=>{const legs=legsOf(r);return [{res:r.result,color:r.result==='won'?P:undefined,text:`${legs.length}-leg parlay`,odds:weeklyMoney(predictionParlayPay(r)),sub:`${r.exchange} · ${exchangePct(r.odds)}% · $25`},...legs.map(l=>({leg:true,color:P,text:`${l.result==='won'?'✓':l.result==='lost'?'✗':'·'} ${l.player} · ${weeklyLegText(l)}`}))]})];
  const games=[...new Set([...official.map(r=>xMatchup(recordLegs(r)[0]?.team)),...pm.map(r=>xMatchup(r.team))].filter(Boolean))],matchup=games.length===1?games[0]:etDate(Date.parse(all[0]?.game_time||from),{weekday:'long'});
  const waitNote=pending.length?`\n⏳ ${pending.map(r=>r.player||'1 parlay').join(', ')} grades when official stats post.`:'';
  const text=xShort(`🧾 Final: ${wins}–${losses} on the full card${games.length===1?`, ${matchup}`:''}. ${weeklyMoney(total)} on the night.\n\n🏈 Sportsbook: ${weeklyMoney(sbMoney)}\n📈 Prediction apps: ${weeklyMoney(pmMoney)}${waitNote}\n\n$100 singles, $25 parlays, locked before kickoff, graded in public. Link in bio. 21+`);
  let mediaId=null;
  try{if(typeof renderCardPng==='function')mediaId=await xUploadImage(env,await renderCardPng(xSlateSvg({final:true,kicker:'FULL CARD RESULTS',day:`${wins}–${losses}`,dayColor:total>=0?'#2ee6a8':'#f87171',dateLine:`${matchup} · ${weeklyMoney(total)}`,note:`Sportsbook ${weeklyMoney(sbMoney)} · Apps ${weeklyMoney(pmMoney)}`,note2:'$100 singles · $25 parlays',picks,cta:'Graded in public'})))}
  catch(error){await setAppSetting(env,'x-last-error',`${new Date(now).toISOString()} card recap graphic: ${error.message}`).catch(()=>{})}
  try{const comboReq=String((await appSetting(env,'x-combo-request'))||day);const reply=await appSetting(env,`xid:x-combo:${comboReq.slice(0,10)}`)||await xFindPost(env,`x-combo:${day}`,t=>/full card/i.test(t)&&/Wherever you are/.test(t),now);
    const sent=await xPost(env,text,mediaId,reply);await xDone(env,key,now);await setAppSetting(env,'x-last-post',`${new Date(now).toISOString()} card-recap ${reply?'reply':'post'} ${mediaId?'graphic':'text'} ${sent?.data?.id||''}`).catch(()=>{});return {posted:1,graphic:Boolean(mediaId),reply:Boolean(reply)}}
  catch(error){await env.DB.prepare('DELETE FROM app_settings WHERE key=?').bind(key).run().catch(()=>{});await setAppSetting(env,'x-last-error',`${new Date(now).toISOString()} ${error.message}`).catch(()=>{});return {posted:0,error:error.message}}
}
// Day recap: a game day's graded card (record, $100-a-pick money, closing
// lines) on one graphic. Posts once per value of app_settings x-recap-request,
// an Eastern date (2026-10-11, or 2026-10-11#2 to resend), once all are graded.
async function postDayRecapToX(env,now=Date.now()){
  if(!env.DB||!xReady(env))return {posted:0,disabled:true};
  const req=String((await appSetting(env,'x-recap-request'))||'');if(!/^\d{4}-\d{2}-\d{2}(#\w{1,8})?$/.test(req))return {posted:0,none:true};
  const day=req.slice(0,10),key=`x-recap:${req}`;if(!(await xClaimable(env,key,now)))return {posted:0,done:true};
  const all=(await env.DB.prepare("SELECT * FROM public_recommendations WHERE source='market-verified-v2' AND id LIKE 'official|%'").all()).results||[];
  const rows=all.filter(r=>etDate(Date.parse(r.game_time),{year:'numeric',month:'2-digit',day:'2-digit'})===`${day.slice(5,7)}/${day.slice(8,10)}/${day.slice(0,4)}`).sort((a,b)=>String(a.game_time).localeCompare(String(b.game_time))||String(a.posted_at).localeCompare(String(b.posted_at)));
  if(!rows.length)return {posted:0,empty:true};
  const s=weeklySummary(rows);if(s.pending)return {posted:0,waiting:s.pending};
  if(!(await xClaim(env,key,now)))return {posted:0,done:true};
  const season=weeklySummary(all),dayName=etDate(Date.parse(rows[0].game_time),{weekday:'long'});
  // Average closing-line value: how much more our price paid than the close.
  const clv=rows.filter(r=>r.kind==='prop'&&r.closing_odds!=null&&(r.closing_line==null||Math.abs(Number(r.closing_line)-Number(r.line))<=.01)).map(r=>(weeklyDecimal(r.odds)/weeklyDecimal(r.closing_odds)-1)*100);
  const avg=clv.length?clv.reduce((a,b)=>a+b,0)/clv.length:null,total=s.profit+s.parlayProfit;
  // The headline counts every play (singles and parlays); props are broken out.
  const rec=`${s.wins+s.parlayWins}–${s.losses+s.parlayLosses}${s.pushes?`–${s.pushes}`:''}`,propRec=`${s.wins}–${s.losses}${s.pushes?`–${s.pushes}`:''}`;
  const seasonRec=`${season.wins+season.parlayWins}–${season.losses+season.parlayLosses}`,seasonMoney=season.profit+season.parlayProfit;
  const picks=rows.map(r=>{const legs=recordLegs(r),f=legs[0]||{};return r.kind==='parlay'?{res:r.result,text:`${legs.length}-leg parlay`,odds:weeklyOdds(r.combined_odds),sub:legs.map(l=>l.player).join(' + ')}:{res:r.result,text:`${r.player} · ${weeklyLegText(r)}`,odds:weeklyOdds(r.odds),close:r.closing_odds!=null?(r.closing_line!=null&&Math.abs(Number(r.closing_line)-Number(r.line))>.01?`${r.side==='Over'?'o':'u'}${r.closing_line} ${weeklyOdds(r.closing_odds)}`:weeklyOdds(r.closing_odds)):null,sub:xActual(f)?xActual(f).replace(/^./,c=>c.toUpperCase()):''}});
  const np=s.parlayWins+s.parlayLosses,parlays=np?`; ${np===1?(s.parlayWins?'parlay hit':'parlay lost'):`parlays ${s.parlayWins}–${s.parlayLosses}`}`:'';
  const beatLine=s.tracked?`\n${s.beat} of ${s.tracked} props beat the closing line${avg!==null&&avg>0?`, paying ${avg.toFixed(1)}% more than the kickoff price on average`:''}.`:'';
  const seasonLine=season.wins+season.losses>=5?`\nSeason: ${seasonRec}, ${weeklyMoney(seasonMoney)}${season.tracked?` · ${season.beat} of ${season.tracked} beat the close`:''}.`:'';
  // Singles lead; parlays are their own line (a quarter unit from Oct 12, 2026).
  const props=rows.filter(r=>r.kind==='prop').length,parlayLine=np?`\nParlays ${s.parlayWins}–${s.parlayLosses}, ${weeklyMoney(s.parlayProfit)}.`:'';
  const seasonParlays=season.parlayWins+season.parlayLosses?` · parlays ${season.parlayWins}–${season.parlayLosses}, ${weeklyMoney(season.parlayProfit)}`:'';
  const seasonSingles=season.wins+season.losses>=5?`\nSeason: ${season.wins}–${season.losses}${season.pushes?`–${season.pushes}`:''}, ${weeklyMoney(season.profit)}${seasonParlays}${season.tracked?` · ${season.beat} of ${season.tracked} beat the close`:''}.`:'';
  const text=xShort(`📊 ${dayName}’s picks: ${propRec}, ${weeklyMoney(s.profit)} at $100 a pick.${parlayLine}${beatLine}${seasonSingles}\n\nEvery pick graded in public. Link in bio. 21+`);
  let mediaId=null;
  try{if(typeof renderCardPng==='function')mediaId=await xUploadImage(env,await renderCardPng(xSlateSvg({final:true,kicker:`${dayName.toUpperCase()} RESULTS`,day:propRec,dayColor:s.profit>=0?'#2ee6a8':'#f87171',dateLine:`${props} pick${props===1?'':'s'} · ${weeklyMoney(s.profit)} at $100 a pick`,note:np?`Parlays ${s.parlayWins}–${s.parlayLosses} · ${weeklyMoney(s.parlayProfit)}`:'',note2:s.tracked?`${s.beat} of ${s.tracked} beat the closing line`:'',season:season.wins+season.losses>=5?`${season.wins}–${season.losses} · ${weeklyMoney(season.profit)}`:'',picks})))}
  catch(error){await setAppSetting(env,'x-last-error',`${new Date(now).toISOString()} recap graphic: ${error.message}`).catch(()=>{})}
  try{const sent=await xPost(env,text,mediaId);await xDone(env,key,now);await setAppSetting(env,'x-last-post',`${new Date(now).toISOString()} recap ${req} ${sent?.data?.id||''}`).catch(()=>{});return {posted:1,graphic:Boolean(mediaId)}}
  catch(error){console.warn('x_recap_failed',error.message);await env.DB.prepare('DELETE FROM app_settings WHERE key=?').bind(key).run().catch(()=>{});await setAppSetting(env,'x-last-error',`${new Date(now).toISOString()} ${error.message}`).catch(()=>{});return {posted:0,error:error.message}}
}
// Alerts proof post (text only): the season's beat-the-close count and why
// alerts matter. Posts once per value of app_settings x-proof-request (any
// short id, like 2026-10-12).
async function postProofToX(env,now=Date.now()){
  if(!env.DB||!xReady(env))return {posted:0,disabled:true};
  const req=String((await appSetting(env,'x-proof-request'))||'');if(!/^[\w-]{1,24}(#\w{1,8})?$/.test(req))return {posted:0,none:true};
  const key=`x-proof:${req}`;if(!(await xClaimable(env,key,now)))return {posted:0,done:true};
  const all=(await env.DB.prepare("SELECT * FROM public_recommendations WHERE source='market-verified-v2' AND id LIKE 'official|%'").all()).results||[];
  const s=weeklySummary(all);if(s.tracked<10||s.beat*2<=s.tracked)return {posted:0,skipped:true,beat:s.beat,tracked:s.tracked};
  if(!(await xClaim(env,key,now)))return {posted:0,done:true};
  const text=xShort(`📈 ${s.beat} of ${s.tracked} of our picks this season beat the closing line: we got a better price than the one at kickoff.\n\nThat edge only pays if you bet before the line moves.\n\nFree alerts ping you the second a pick locks. Link in bio. 21+`);
  try{const sent=await xPost(env,text);await xDone(env,key,now);await setAppSetting(env,'x-last-post',`${new Date(now).toISOString()} proof ${req} ${sent?.data?.id||''}`).catch(()=>{});return {posted:1,beat:s.beat,tracked:s.tracked}}
  catch(error){console.warn('x_proof_failed',error.message);await env.DB.prepare('DELETE FROM app_settings WHERE key=?').bind(key).run().catch(()=>{});await setAppSetting(env,'x-last-error',`${new Date(now).toISOString()} ${error.message}`).catch(()=>{});return {posted:0,error:error.message}}
}
// Owner check: app_settings headshot-probe holds player names (comma-separated);
// the next run looks each up and saves what ESPN returned to headshot-probe-result.
async function runHeadshotProbe(env){
  const names=await appSetting(env,'headshot-probe').catch(()=>null);if(!names||typeof playerHeadshot!=='function')return null;
  await env.DB.prepare("DELETE FROM app_settings WHERE key='headshot-probe'").run();
  const out=[];for(const name of String(names).split(',').map(n=>n.trim()).filter(Boolean).slice(0,4)){
    // url:<address> checks that one image address can be fetched from here.
    if(name.startsWith('url:')){const r=await fetch(name.slice(4),{headers:{'user-agent':'Mozilla/5.0'},signal:AbortSignal.timeout(8000)}).catch(e=>({status:String(e.message)}));out.push({url:name.slice(4),status:r.status,type:r.headers?.get?.('content-type')||null,bytes:r.arrayBuffer?(await r.arrayBuffer().catch(()=>new ArrayBuffer(0))).byteLength:0});continue}
    // view:<espn id> saves a small copy of that ESPN headshot for an owner to check by eye.
    // roster:<league>:<team> reports the shape of one ESPN roster reply.
    if(name.startsWith('roster:')){const [,lg,tm]=name.split(':');const r=await fetch(`https://site.api.espn.com/apis/site/v2/sports/${lg==='nba'?'basketball':'football'}/${lg}/teams/${tm}/roster`,{headers:{accept:'application/json','user-agent':'Mozilla/5.0 (compatible; BetThisGuy/1.0; +https://betthisguy.com)'}}).catch(e=>({status:String(e.message)}));let d=null;try{d=await r.json()}catch{}
      const a=d?.athletes;out.push({roster:`${lg}:${tm}`,status:r.status,keys:d?Object.keys(d).slice(0,12):null,athletes:Array.isArray(a)?a.length:typeof a,first:Array.isArray(a)&&a[0]?Object.keys(a[0]).slice(0,12):null,items:Array.isArray(a)&&a[0]?.items?a[0].items.length:null,sample:Array.isArray(a)&&(a[0]?.items?.[0]||a[0])?JSON.stringify(a[0]?.items?.[0]||a[0]).slice(0,300):null});continue}
    if(name.startsWith('view:')){const id=name.slice(5).replace(/\D/g,'');const r=await fetch(`https://a.espncdn.com/combiner/i?img=/i/headshots/nfl/players/full/${id}.png&w=160&h=116`).catch(()=>null);await setAppSetting(env,`headshot-probe-image:id${id}`,r?.ok?xBase64(new Uint8Array(await r.arrayBuffer())):'none');out.push({id,status:r?.status||'failed'});continue}
    if(name.startsWith('img:')){const shot=await playerHeadshot(name.slice(4),'NFL');const id=(typeof headshotTrace!=='undefined'?headshotTrace:[]).find(t=>t.source==='espn-id')?.id||null;
      let small=null;if(id){const r=await fetch(`https://a.espncdn.com/combiner/i?img=/i/headshots/nfl/players/full/${id}.png&w=160&h=116`).catch(()=>null);if(r?.ok)small=xBase64(new Uint8Array(await r.arrayBuffer()))}
      await setAppSetting(env,`headshot-probe-image:${normalizedName(name.slice(4))}`,small||'none');out.push({name:name.slice(4),id,found:Boolean(shot),bytes:shot?.bytes?.length||0});continue}
    const shot=await playerHeadshot(name,'NFL');out.push({name,found:Boolean(shot),bytes:shot?.bytes?.length||0,steps:typeof headshotTrace!=='undefined'?headshotTrace:[]})}
  await setAppSetting(env,'headshot-probe-result',JSON.stringify({at:new Date().toISOString(),out}));return out;
}
async function runXPosts(env,now=Date.now()){
  if(typeof loadEspnIds==='function')await loadEspnIds(env,now).catch(()=>null);
  await runHeadshotProbe(env).catch(()=>null);
  const picks=await postPicksToX(env,now);
  // Prediction picks go next, while the run has requests to spare for the
  // player photo (late in a busy run the photo download was cut off).
  const predictions=picks.posted?{posted:0,waiting:true}:await postPredictionPicksToX(env,now).catch(error=>({posted:0,error:error.message}));
  const weekly=await postWeeklyToX(env,now);
  const closing=await postClosingToX(env,now);
  // A result graphic needs about as many requests as a pick, so it waits
  // for a run that didn't already post a pick or the weekly graphic.
  // The day's slate graphic waits for a run that didn't post a pick or the weekly.
  const combo=picks.posted||predictions.posted||weekly.posted?{posted:0,waiting:true}:await postComboToX(env,now).catch(error=>({posted:0,error:error.message}));
  const final=picks.posted||predictions.posted||weekly.posted||combo.posted?{posted:0,waiting:true}:await postSlateToX(env,now,true);
  const catchUp=picks.posted||predictions.posted||combo.posted||weekly.posted||final.posted?{posted:0,waiting:true}:await postCatchUpToX(env,now).catch(error=>({posted:0,error:error.message}));
  const morning=picks.posted||predictions.posted||combo.posted||weekly.posted||final.posted||catchUp.posted?{posted:0,waiting:true}:await postSlateToX(env,now,false,true);
  const slate=picks.posted||predictions.posted||combo.posted||weekly.posted||final.posted||catchUp.posted||morning.posted?{posted:0,waiting:true}:await postSlateRequestToX(env,now).then(r=>r.posted?r:postSlateToX(env,now));
  const pmSlate=picks.posted||predictions.posted||combo.posted||weekly.posted||final.posted||catchUp.posted||morning.posted||slate.posted?{posted:0,waiting:true}:await postPredictionSlateToX(env,now).catch(error=>({posted:0,error:error.message}));
  const pin=picks.posted||predictions.posted||combo.posted||weekly.posted||final.posted||slate.posted||pmSlate.posted?{posted:0,waiting:true}:await postAlertsPinToX(env,now);
  const recap=picks.posted||predictions.posted||combo.posted||weekly.posted||final.posted||slate.posted||pin.posted?{posted:0,waiting:true}:await postDayRecapToX(env,now);
  const proof=await postProofToX(env,now);
  const nbaLaunch=await postNbaLaunchToX(env,now).catch(error=>({posted:0,error:error.message}));
  const nba=picks.posted||predictions.posted||combo.posted||weekly.posted||final.posted||slate.posted?{posted:0,waiting:true}:await postNbaCardToX(env,now).catch(error=>({posted:0,error:error.message}));
  const nbaPm=picks.posted||predictions.posted||nba.posted?{posted:0,waiting:true}:await postNbaPredictionToX(env,now).catch(error=>({posted:0,error:error.message}));
  const results=picks.posted||predictions.posted||combo.posted||weekly.posted||final.posted||slate.posted||pin.posted||recap.posted?{posted:0,waiting:true}:await postResultsToX(env,now);
  // The pinned summary waits for a run with nothing else heavy.
  const summary=picks.posted||predictions.posted||combo.posted||weekly.posted||final.posted||slate.posted||pin.posted||recap.posted||results.posted?{posted:0,waiting:true}:await postSummaryToX(env,now);
  return {picks,weekly,closing,combo,final,catchUp,slate,pmSlate,pin,recap,proof,nbaLaunch,nba,nbaPm,predictions,results,summary};
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
// Email alerts without an account. POST /api/email-subscribe {email, nba?}
// stores the address as pending and emails a confirm link (at most one every
// 10 minutes per address, 60 an hour in all); GET
// /api/email-subscribe/confirm?token= turns it on. Nothing is sent to an
// address until its owner opens that link.
const SUB_EMAIL=/^[^\s@<>"]{1,64}@[^\s@<>"]{1,190}\.[a-z]{2,24}$/i;
async function emailSubscribeApi(request,env,ctx){
  const url=new URL(request.url),reply=(body,status=200)=>json(body,status,{'cache-control':'no-store'});
  if(!env.DB)return reply({success:false,error:'Unavailable'},503);
  if(url.pathname==='/api/email-subscribe/confirm')return emailConfirmPage(url,env);
  if(request.method!=='POST')return reply({success:false},405);
  let body={};try{body=JSON.parse((await request.text()).slice(0,2000))}catch{}
  const email=String(body.email||'').trim().toLowerCase();
  if(!SUB_EMAIL.test(email)||email.length>254)return reply({success:false,error:'That doesn’t look like an email address.'},400);
  const now=Date.now(),stamp=new Date(now).toISOString();
  const row=await env.DB.prepare('SELECT status,token,confirm_sent_at FROM email_subscribers WHERE email=?').bind(email).first();
  if(row?.status==='active')return reply({success:true,active:true});
  if(row&&now-Date.parse(row.confirm_sent_at||0)<10*60000)return reply({success:true,pending:true});
  const hour=`email-sub-hour:${stamp.slice(0,13)}`,sent=Number(await appSetting(env,hour)||0);
  if(sent>=60)return reply({success:false,error:'Too many sign-ups right now. Try again in an hour.'},429);
  const token=emailAlertToken(),nba=body.nba===false?0:1;
  await env.DB.prepare("INSERT INTO email_subscribers (email,token,status,nba,created_at,confirm_sent_at) VALUES (?,?,'pending',?,?,?) ON CONFLICT(email) DO UPDATE SET token=excluded.token,status='pending',nba=excluded.nba,confirm_sent_at=excluded.confirm_sent_at").bind(email,token,nba,stamp,stamp).run();
  await setAppSetting(env,hour,String(sent+1));
  if(!env.RESEND_API_KEY)return reply({success:false,error:'Email isn’t connected yet.'},503);
  const link=`${SITE_URL}/api/email-subscribe/confirm?token=${token}`,postal=String(env.EMAIL_POSTAL_ADDRESS||'').trim();
  const opts={subject:'Confirm your Bet This Guy pick emails',heading:'One tap to start your pick emails',eyebrow:'CONFIRM YOUR EMAIL',lede:'Tap below and we’ll email you each new official pick, with the price and the sportsbook. Picks that lock together come in one email. Didn’t ask for this? Ignore it and you won’t hear from us.',rowsHtml:'',ctaLabel:'Yes, email me picks',ctaUrl:link};
  const text=`One tap to start your Bet This Guy pick emails:\n${link}\n\nPicks that lock together come in one email. Didn’t ask for this? Ignore this email and you won’t hear from us.\n21+ where legal. Gambling problem? Call 1-800-GAMBLER.${postal?`\n${postal}`:''}\n`;
  const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:`Bearer ${env.RESEND_API_KEY}`,'content-type':'application/json'},body:JSON.stringify({from:env.EMAIL_FROM||EMAIL_ALERT_FROM,to:[email],reply_to:env.EMAIL_REPLY_TO||'support@betthisguy.com',subject:opts.subject,html:emailAlertHtml([],`${SITE_URL}/`,postal,opts),text}),signal:AbortSignal.timeout(15000)}).catch(()=>null);
  if(!r?.ok){await env.DB.prepare('UPDATE email_subscribers SET confirm_sent_at=NULL WHERE email=?').bind(email).run().catch(()=>{});return reply({success:false,error:'We couldn’t send the email. Try again in a minute.'},502)}
  ctx?.waitUntil?.(countUsage(env,['email:subscribe'],request).catch(()=>{}));
  return reply({success:true,pending:true});
}
async function emailConfirmPage(url,env){
  const token=url.searchParams.get('token')||'';
  const page=(title,body,status=200)=>new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex"><title>${weeklyEscape(title)} · Bet This Guy</title><style>body{margin:0;background:#0e1013;color:#f2f4f7;font:16px/1.55 system-ui,sans-serif}main{max-width:520px;margin:0 auto;padding:48px 20px}h1{font-size:26px;margin:0 0 10px}p{color:#c9d0d9}a{color:#6aa8ff}.btn{display:inline-block;margin-top:14px;padding:12px 18px;border-radius:999px;background:#2563eb;color:#fff;text-decoration:none;font-weight:700}</style></head><body><main><h1>${weeklyEscape(title)}</h1>${body}</main></body></html>`,{status,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
  if(!/^[0-9a-f]{64}$/.test(token))return page('Link not recognised','<p>This link is incomplete. Sign up again on <a href="/">betthisguy.com</a>.</p>',400);
  const r=await env.DB.prepare("UPDATE email_subscribers SET status='active',confirmed_at=COALESCE(confirmed_at,?) WHERE token=? AND status!='off'").bind(new Date().toISOString(),token).run();
  if(!Number(r?.meta?.changes??r?.changes))return page('Link expired','<p>This link is no longer active. Sign up again on <a href="/">betthisguy.com</a>.</p>',404);
  return page('You’re in','<p>We’ll email you each new official pick the moment it locks, with the price and the sportsbook. Every email has a one-click unsubscribe.</p><a class="btn" href="/">See this week’s picks</a>');
}
async function emailUnsubscribe(request,env){
  const url=new URL(request.url),token=url.searchParams.get('token')||'';
  const page=(title,body,status=200)=>new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex"><title>${weeklyEscape(title)} · Bet This Guy</title><style>body{margin:0;background:#050b1d;color:#e8f2ff;font:16px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif}main{max-width:440px;margin:12vh auto;padding:0 20px;text-align:center}h1{font-size:24px}p{color:#b8cbe4}button{min-height:46px;padding:0 26px;border:0;border-radius:999px;background:#1fd88f;color:#04121f;font-weight:700;font-size:16px;cursor:pointer}a{color:#5ff0b5}@media (display-mode: standalone){body{padding-top:env(safe-area-inset-top)}}</style></head><body><main><h1>${weeklyEscape(title)}</h1>${body}</main></body></html>`,{status,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
  if(!/^[0-9a-f]{64}$/.test(token)||!env.DB)return page('Link not recognised','<p>This unsubscribe link is incomplete. You can turn email alerts off in your account on <a href="/">betthisguy.com</a>.</p>',400);
  if(request.method==='POST'){
    await env.DB.prepare('UPDATE email_alerts SET enabled=0,updated_at=? WHERE token=?').bind(new Date().toISOString(),token).run();
    await env.DB.prepare("UPDATE email_subscribers SET status='off' WHERE token=?").bind(token).run().catch(()=>{});
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
const WEB_MANIFEST=JSON.stringify({name:'Bet This Guy',short_name:'Bet This Guy',description:'NFL and NBA player prop picks, locked before the game and graded in public.',start_url:'/?source=home-screen',scope:'/',display:'standalone',background_color:'#0e1013',theme_color:'#0e1013',icons:[{src:'/icon-192.png',sizes:'192x192',type:'image/png',purpose:'any'},{src:'/icon-512.png',sizes:'512x512',type:'image/png',purpose:'any'}]});

// Bet hand-off page. A home-screen (installed) web app on iPhone opens links
// in a browser panel, where sportsbook links load the website instead of the
// app. The app sends those taps here in Safari (x-safari-https://), and a tap
// on this page's button opens the book's app with the bet in its slip.
// Only links to known books and apps are allowed (no open redirect).
const GO_HOSTS=['draftkings.com','fanduel.com','betmgm.com','betrivers.com','caesars.com','fanatics.com','novig.com','novig.us','prophetx.co','kalshi.com','polymarket.com','espnbet.com','thescore.bet','hardrock.bet','bet365.com','betopenly.com'];
function goTarget(raw){
  let u;try{u=new URL(String(raw||''))}catch{return null}
  if(u.protocol!=='https:'||u.username||u.password||u.port)return null;
  const host=u.hostname.toLowerCase();
  return GO_HOSTS.some(d=>host===d||host.endsWith(`.${d}`))?u.toString():null;
}
function goPage(request){
  const url=new URL(request.url),target=goTarget(url.searchParams.get('u'));
  const name=String(url.searchParams.get('b')||'').replace(/[^\w .&'-]/g,'').slice(0,30)||'the app',bet=String(url.searchParams.get('t')||'').slice(0,120);
  const head={'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-robots-tag':'noindex','referrer-policy':'no-referrer'};
  const e=weeklyEscape;
  // Novig's web links open its website even with the app installed; its
  // novigapp:// link opens the app on that bet.
  const t=target?new URL(target):null,app=t&&/(^|\.)novig\.com$/.test(t.hostname)?`novigapp://${t.pathname.replace(/^\//,'')}${t.search}`:null;
  const body=target?`<p class="k">YOUR BET IS READY</p><h1>Open ${e(name)}</h1>${bet?`<p class="bet">${e(bet)}</p>`:''}<a class="go" href="${e(app||target)}" rel="noopener noreferrer">Open in ${e(name)} ›</a><p class="s">The bet loads into your ${e(name)} slip. Enter your amount and place it there.</p>${app?`<p class="s">No app? <a href="${e(target)}" rel="noopener noreferrer">Open their website</a></p>`:'<p class="s">No app? It opens their website instead.</p>'}<a class="back" href="/">Back to Bet This Guy</a>`:`<h1>Link not found</h1><p class="s">This bet link isn't valid anymore.</p><a class="back" href="/">Back to Bet This Guy</a>`;
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Open your bet | Bet This Guy</title><style>body{margin:0;min-height:100vh;background:#0b1530;color:#fff;font:16px/1.45 -apple-system,system-ui,sans-serif;display:flex;align-items:center;justify-content:center}main{max-width:420px;width:100%;padding:32px 20px;text-align:center}.k{font-size:12px;letter-spacing:2px;font-weight:800;color:#2ee6a8;margin:0 0 8px}h1{font-size:28px;margin:0 0 10px}.bet{font-size:17px;font-weight:600;color:#dbe4f0;margin:0 0 22px}.go{display:block;padding:16px;border-radius:14px;background:#2ee6a8;color:#06231a;font-weight:800;font-size:19px;text-decoration:none;margin:0 0 16px}.s{color:#9fb0cc;font-size:14px;margin:0 0 6px}.back{display:inline-block;margin-top:22px;color:#9fb0cc;font-size:14px}.s a{color:#2ee6a8}</style></head><body><main>${body}</main></body></html>`,{status:target?200:400,headers:head});
}

// One-time research (runs once per value of app_settings novig-research-request):
// Novig's web app (app.novig.us) is built from the same code as its phone app,
// so its scripts list the link routes the app understands (novigapp://...).
// Saves every route-like string near "oddsapi", "parlay" or "slip" to
// app_settings novig-research. Fetches only app.novig.us.
async function novigLinkResearch(env){
  if(!env.DB)return {skipped:true};
  const req=String((await appSetting(env,'novig-research-request'))||'');if(!req)return {none:true};
  if((await appSetting(env,'novig-research-done'))===req)return {done:true};
  await setAppSetting(env,'novig-research-done',req);
  const base='https://app.novig.us',get=async path=>{const r=await fetch(base+path,{headers:{'user-agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',accept:'*/*'},signal:AbortSignal.timeout(15000)});return {status:r.status,text:r.ok?await r.text():''}};
  const out={at:new Date().toISOString(),scripts:[],hits:{}};
  const page=await get('/');out.page=page.status;
  const srcs=[...new Set([...page.text.matchAll(/src="(\/_expo\/static\/js\/[^"]+\.js)"/g)].map(m=>m[1]))].slice(0,6);
  const words=['oddsapi','parlay','Parlay','betslip','betSlip','slip?','legs=','selections','addToSlip','add-to-slip','/events/','event-markets','novigapp'];
  for(const src of srcs){
    const js=await get(src).catch(()=>({status:0,text:''}));out.scripts.push(`${src} ${js.status} ${js.text.length}`);
    for(const w of words){let i=-1,n=0;const list=out.hits[w]||(out.hits[w]=[]);while(n<25&&(i=js.text.indexOf(w,i+1))>=0){list.push(js.text.slice(Math.max(0,i-140),i+160).replace(/\s+/g,' '));n++}}
    // expo-router's route files: "./events/[id]/oddsapi/[wager].tsx" and the like.
    out.routes=[...new Set([...(out.routes||[]),...[...js.text.matchAll(/"\.\/[A-Za-z0-9_()\[\]\/.+-]{2,120}\.(?:tsx|ts|js|jsx)"/g)].map(m=>m[0])])].slice(0,400);
  }
  // The app's link table (React Navigation linking config: prefixes, then
  // config.screens with every screen's path) sits just before 'novigapp://'.
  // Saved in pieces: the 40 KB before it and every path:'...' in the bundle.
  out.hits={};
  await setAppSetting(env,'novig-research',JSON.stringify(out).slice(0,90000));
  for(const src of srcs){const js=await get(src).catch(()=>({text:''}));const i=js.text.indexOf("prefixes:['novigapp://'");if(i<0)continue;
    await setAppSetting(env,'novig-linking',js.text.slice(Math.max(0,i-40000),i+3000));
    const paths=[...new Set([...js.text.matchAll(/path:['"]([^'"]{1,120})['"]/g)].map(m=>m[1]))];
    await setAppSetting(env,'novig-paths',JSON.stringify(paths).slice(0,90000));break}
  return {scripts:out.scripts.length,routes:(out.routes||[]).length};
}

// One-time research (once per prophetx-research-request): how ProphetX's
// website reads its ?action=addtobetslip&lineID= link, to see whether one
// link can hold several bets. Fetches only www.prophetx.co and its scripts.
async function prophetxLinkResearch(env){
  if(!env.DB)return {skipped:true};
  const req=String((await appSetting(env,'prophetx-research-request'))||'');if(!req)return {none:true};
  if((await appSetting(env,'prophetx-research-done'))===req)return {done:true};
  await setAppSetting(env,'prophetx-research-done',req);
  const base='https://www.prophetx.co',get=async path=>{const r=await fetch(new URL(path,base),{headers:{'user-agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',accept:'*/*'},signal:AbortSignal.timeout(15000)});return {status:r.status,text:r.ok?await r.text():''}};
  const page=await get('/');const out={at:new Date().toISOString(),page:page.status,scripts:[],hits:[]};
  const srcs=[...new Set([...page.text.matchAll(/<script[^>]+src="([^"]+\.js[^"]*)"/g)].map(m=>m[1]).filter(u=>!/^https?:/.test(u)||u.includes('prophetx')))].slice(0,60);
  for(const src of srcs){const js=await get(src).catch(()=>({status:0,text:''}));out.scripts.push(`${src} ${js.status} ${js.text.length}`);
    for(const w of (req.startsWith('run1')?['addtobetslip','lineID','lineId','line_id','betslip','betSlip']:(req.startsWith('run2')?['share_play_slip','sharePlaySlip','playSlipId','play_slip','slipId','get("action")',"get('action')",'searchParams.get']:['share_tradeslip','generateShareTradeslipUrl','decodeShareTradeslipPayload','generateShareTradeUrl','showStake']))){let i=-1,n=0;while(n<12&&(i=js.text.indexOf(w,i+1))>=0){out.hits.push(`${w} @${src.slice(-40)}: ${js.text.slice(Math.max(0,i-(req.startsWith('run1')?220:700)),i+(req.startsWith('run1')?260:900)).replace(/\s+/g,' ')}`);n++}}
    if(out.hits.length>150)break}
  await setAppSetting(env,'prophetx-research',JSON.stringify(out).slice(0,95000));
  return {scripts:out.scripts.length,hits:out.hits.length};
}
