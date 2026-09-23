/* Small live snapshots run independently of startup and historical player stats. */
const liveBoard = { games: [], updatedAt: null, stale: false, error: '', timer: null, pending: null, oddsAt: new Map(), stats: new Map(), statsPending: new Map(), gameStats: new Map(), gameStatsPending: new Map(), selectedGameID: null, profile: null };

function liveTeamKey(team) {
  const value = typeof team === 'string' ? team : team?.full_name || team?.abbreviation || team?.name || '';
  const key = compactTeamName(value).toUpperCase();
  return ({JAC:'JAX',WSH:'WAS',BLT:'BAL',LA:'LAR'})[key] || key;
}
function liveGameFor(name, startsAt) {
  const teams = String(name || '').replace(' · ', ' ').split(/\s+(?:@|vs\.?)\s+/i).map(liveTeamKey).sort().join('|');
  const timestamp = gameStartTimestamp(startsAt);
  if (!Number.isFinite(timestamp)) return null;
  return liveBoard.games.find(game => [liveTeamKey(game.away), liveTeamKey(game.home)].sort().join('|') === teams && Math.abs(Date.parse(game.startsAt) - timestamp) < 12 * 3600000) || null;
}
function liveSnapshotStale() { return liveBoard.stale || !!liveBoard.error || Date.now() - Date.parse(liveBoard.updatedAt || '') > 90000; }
function liveStatusLabel(game) {
  if (!game) return '';
  if (game.state === 'final') return /OT/i.test(game.status) ? 'Final / OT' : 'Final';
  const labels = { postponed:'Postponed', canceled:'Canceled', delayed:'Delayed', suspended:'Suspended', abandoned:'Abandoned', unknown:'Status unavailable' };
  if (labels[game.state]) return labels[game.state];
  if (game.state !== 'in_progress') return formatCompactKickoff(game.startsAt);
  if (game.halftime) return 'Halftime';
  const period = game.period ? game.period > 4 ? game.period > 5 ? `${game.period - 4}OT` : 'OT' : `Q${game.period}` : '';
  const clock = /^\d{1,2}:\d{2}$/.test(game.clock || '') ? game.clock : '';
  return [period, clock].filter(Boolean).join(' · ') || 'In progress · clock unavailable';
}
function liveScoreLabel(game) { return `${liveTeamKey(game.away)} ${game.awayScore ?? '—'} – ${liveTeamKey(game.home)} ${game.homeScore ?? '—'}`; }
function liveGameText(game) {
  if (!game) return '';
  const played = ['in_progress','final','suspended'].includes(game.state);
  return [played ? liveScoreLabel(game) : '', liveStatusLabel(game)].filter(Boolean).join(' · ');
}
function liveBoardTimeLabel(game, fallback = '') {
  if (!game || game.state === 'scheduled') return fallback;
  if (game.state !== 'in_progress') return liveStatusLabel(game);
  const status = liveStatusLabel(game);
  return `LIVE · ${status}${game.clock && !game.halftime ? ' left' : ''}${liveSnapshotStale() ? ' · Update delayed' : ''}`;
}
function updateLiveLabels() {
  document.querySelectorAll('[data-board-game][data-kickoff]').forEach(button => {
    const game = liveGameFor(button.dataset.boardGame, button.dataset.kickoff), time = button.querySelector('.game-tab-time');
    if (!game || game.state === 'scheduled' || !time) return;
    time.textContent = liveGameText(game);
    button.classList.toggle('is-live', game.state === 'in_progress' && !liveSnapshotStale());
    button.setAttribute('aria-label', `${button.dataset.boardGame} · ${liveGameText(game)}`);
    button.title = `${button.dataset.boardGame} · ${liveGameText(game)}`;
  });
  document.querySelectorAll('[data-game-time]').forEach(node => {
    const game = liveGameFor(node.dataset.gameTime, node.dataset.kickoff);
    node.textContent = liveBoardTimeLabel(game, node.dataset.defaultTime || '');
    node.classList.toggle('live-game-time', game?.state === 'in_progress');
    node.classList.toggle('live-time-stale', game?.state === 'in_progress' && liveSnapshotStale());
  });
}
async function fetchLiveJSON(url) {
  const response = await fetch(url, { cache:'no-store', signal:AbortSignal.timeout(12000) }), payload = await response.json();
  if (!response.ok || payload.success === false) throw new Error(payload.error || 'The live feed is temporarily unavailable.');
  return payload;
}
async function refreshLiveGames() {
  try {
    const payload = await fetchLiveJSON('/api/live-games');
    liveBoard.games = Array.isArray(payload.games) ? payload.games : [];
    liveBoard.updatedAt = payload.updatedAt; liveBoard.stale = !!payload.stale; liveBoard.error = '';
  } catch (error) { liveBoard.error = error.message; }
  updateLiveLabels();
  renderCurrentGame();
  renderLiveCenter();
}
function liveEventCatalog() {
  const games = new Map(scheduleGames.map(game => [game.eventID, game]));
  for (const prop of props) if (!games.has(prop.eventID)) {
    const teams = gameName(prop).split(/\s+@\s+/);
    if (teams.length === 2) games.set(prop.eventID, { eventID:prop.eventID, leagueID:'NFL', teams:{away:{names:{short:teams[0]}},home:{names:{short:teams[1]}}}, status:{startsAt:prop.startsAt} });
  }
  return [...games.values()];
}
function replaceEventBoard(eventID, board) {
  // An empty in-play response means markets are closed/suspended, not "use old lines".
  baseLiveProps = baseLiveProps.filter(prop => prop.eventID !== eventID);
  futurePropBoards.set(eventID, board);
}
async function refreshLiveOdds() {
  const events = liveEventCatalog().filter(event => {
    const game = liveGameFor(scheduleGameName(event), event.status?.startsAt);
    return game && ['in_progress','final','canceled','postponed','suspended'].includes(game.state) && Date.now() - (liveBoard.oddsAt.get(event.eventID) || 0) >= 60000;
  });
  if (!events.length || liveSnapshotStale()) return;
  let changed = false, unavailable = false;
  for (let index = 0; index < events.length; index += 3) await Promise.all(events.slice(index, index + 3).map(async event => {
    if (document.hidden || navigator.onLine === false) return;
    const game = liveGameFor(scheduleGameName(event), event.status?.startsAt);
    liveBoard.oddsAt.set(event.eventID, Date.now());
    let board = [];
    if (game.state === 'in_progress') {
      try {
        const payload = await fetchLiveJSON(`/api/event?eventID=${encodeURIComponent(event.eventID)}&live=1`);
        board = normalizeLiveProps(payload);
      } catch { unavailable = true; }
    }
    const previous = futurePropBoards.get(event.eventID) || baseLiveProps.filter(p => p.eventID === event.eventID);
    if (JSON.stringify(previous.map(p => [p.player,p.market,p.line,p.over,p.under])) !== JSON.stringify(board.map(p => [p.player,p.market,p.line,p.over,p.under]))) changed = true;
    replaceEventBoard(event.eventID, board);
    // Remove persistent opening lines too, so a reload cannot revive them.
    try { localStorage.removeItem(`bet-this-guy-event-v6-${event.eventID}`); } catch {}
  }));
  if (changed) {
    rebuildPropBoard();
    // Invalidate future builds without regenerating the parlay being inspected.
    parlayFeeds.forEach(feed => { for (let i=feed.length-1;i>=0;i--) if (!feed[i].legs.every(leg => props.some(p => propIdentity(p) === propIdentity(leg)))) feed.splice(i,1); });
    refreshFilterCatalog(); render();
    try { localStorage.setItem('bet-this-guy-live-cache-v15-player-only', JSON.stringify({at:Date.now(),props,coverage:feedCoverage})); } catch {}
  }
  if (unavailable) $('#feedMessage').textContent = 'Some live prices are temporarily unavailable. They will return when the sportsbook feed resumes.';
  updateLiveLabels();
}

const currentStatGroups = [
  ['Passing', /QB|Quarterback/i, [['Passing yards','passing_yards'],['Completions','passing_completions'],['Attempts','passing_attempts'],['Passing TDs','passing_touchdowns'],['Interceptions','passing_interceptions'],['Passer rating','qb_rating']]],
  ['Rushing', /QB|RB|FB|Quarterback|Running Back|Fullback/i, [['Rushing yards','rushing_yards'],['Carries','rushing_attempts'],['Rushing TDs','rushing_touchdowns'],['Longest rush','long_rushing']]],
  ['Receiving', /RB|FB|WR|TE|Running Back|Receiver|Tight End|Fullback/i, [['Receiving yards','receiving_yards'],['Receptions','receptions'],['Targets','receiving_targets'],['Receiving TDs','receiving_touchdowns'],['Longest catch','long_reception']]],
  ['Defense', /LB|CB|DB|DE|DT|Safety|Linebacker|Cornerback|Defensive|^S$/i, [['Tackles','total_tackles'],['Solo tackles','solo_tackles'],['Sacks','defensive_sacks'],['Interceptions','defensive_interceptions'],['Passes defended','passes_defended']]],
  ['Kicking', /Kicker|^K$/i, [['Field goals','field_goals_made'],['FG attempts','field_goal_attempts'],['Extra points','extra_points_made'],['Points','total_points']]],
  ['Returns', /Return/i, [['Kick return yards','kick_return_yards'],['Kick return TDs','kick_return_touchdowns'],['Punt return yards','punt_return_yards'],['Punt return TDs','punt_return_touchdowns']]],
];
function liveStatValue(row, key) { const value=row?.[key]; return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null; }
function currentStatMarkup(row, player) {
  const position = player.position_abbreviation || player.position || row?.player?.position || '';
  const groups = currentStatGroups.filter(([, pattern, fields]) => pattern.test(position) || fields.some(([,key]) => (liveStatValue(row,key) ?? 0) !== 0));
  return groups.map(([title,,fields]) => `<div class="current-stat-group"><h4>${title}</h4><dl>${fields.map(([label,key]) => `<div><dt>${label}</dt><dd>${liveStatValue(row,key) ?? '—'}</dd></div>`).join('')}</dl></div>`).join('') || '<p class="live-note">No box-score categories have been reported for this player yet.</p>';
}
function attachLiveProfile(prop, payload) {
  liveBoard.profile = { prop, player:payload.player || {} };
  if (!$('#playerProfile')?.querySelector('[data-profile-panel="gamelog"]')) return;
  renderCurrentGame(); refreshCurrentStats(); updateLiveLabels();
}
function renderCurrentGame() {
  const context=liveBoard.profile, panel=$('#playerProfile')?.querySelector('[data-profile-panel="gamelog"]');
  if (!context || !panel || !$('#playerDialog')?.open) return;
  const {prop,player}=context, game=liveGameFor(gameName(prop),prop.startsAt);
  const snapshot=game?liveBoard.stats.get(`${game.id}|${player.id}`):null;
  const current=game?.state==='in_progress', row=snapshot?.stat;
  const status=game?liveStatusLabel(game):formatCompactKickoff(prop.startsAt);
  panel.querySelector('.live-game-entry')?.remove();
  if (!game || !['in_progress','final','suspended'].includes(game.state)) return;
  const stamp=snapshot?.updatedAt?new Date(snapshot.updatedAt).toLocaleTimeString([],{hour:'numeric',minute:'2-digit',second:'2-digit'}):null;
  const score=liveScoreLabel(game),notice=snapshot?.error||(!snapshot?'Loading live stats…':!row?'No stats reported yet. This does not confirm whether the player has played.':'');
  const entry=document.createElement('div');entry.className='profile-game-row matchup live-game-entry';entry.innerHTML=`<span><strong>${current?'LIVE NOW':'FINAL'}</strong><small>${htmlEscape(compactGameName(gameName(prop)))} · ${htmlEscape(score)} · ${htmlEscape(status)}</small></span><b>${row?htmlEscape(liveGameStatLine(row,player)):'Updating stats…'}</b><em class="${current?'live':'neutral'}">${current?'LIVE':'FINAL'}</em>${notice?`<small class="live-entry-note">${htmlEscape(notice)}</small>`:''}${stamp?`<small class="live-entry-stamp">Updated ${htmlEscape(stamp)}</small>`:''}`;
  (panel.querySelector('.boxscore-game-list')||panel.querySelector('.profile-game-log')||panel).prepend(entry);
}
function liveGameStatLine(row,player){const values=[];const push=(label,key)=>{const value=liveStatValue(row,key);if(value!==null)values.push(`${label} ${value}`)};push('Pass','passing_yards');push('Rush','rushing_yards');push('Rec','receiving_yards');push('REC','receptions');push('TD','passing_touchdowns');push('TD','rushing_touchdowns');push('TD','receiving_touchdowns');push('INT','passing_interceptions');return values.join(' · ')||'No box-score categories reported';}
async function refreshCurrentStats() {
  const context=liveBoard.profile, panel=$('#playerProfile')?.querySelector('[data-profile-panel="gamelog"]');
  if (document.hidden || navigator.onLine===false || !context || !$('#playerDialog')?.open || !panel) return;
  const game=liveGameFor(gameName(context.prop),context.prop.startsAt), playerID=context.player.id;
  if (!game || !['in_progress','final','suspended'].includes(game.state) || !playerID) { renderCurrentGame(); return; }
  const key=`${game.id}|${playerID}`, cached=liveBoard.stats.get(key);
  if (cached?.checkedAt && Date.now()-cached.checkedAt<25000) return;
  if (liveBoard.statsPending.has(key)) return liveBoard.statsPending.get(key);
  const request=(async()=>{
    try { const payload=await fetchLiveJSON(`/api/live-player?game_id=${game.id}&player_id=${playerID}`);liveBoard.stats.set(key,{...payload,checkedAt:Date.now()}); }
    catch(error){liveBoard.stats.set(key,{...cached,error:error.message,checkedAt:Date.now(),stale:true});}
    renderCurrentGame();
  })().finally(()=>liveBoard.statsPending.delete(key));
  liveBoard.statsPending.set(key,request); return request;
}

function livePlayerName(row) {
  const player=row?.player||{};
  return player.full_name||[player.first_name,player.last_name].filter(Boolean).join(' ')||player.name||'';
}
function liveNameKey(value){return String(value||'').toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b/g,'').replace(/[^a-z0-9]/g,'')}
function livePlayerRow(gameID, player) {
  const snapshot=liveBoard.gameStats.get(String(gameID)), wanted=liveNameKey(player);
  return snapshot?.stats?.find(row=>{const name=liveNameKey(livePlayerName(row));return Boolean(name&&wanted&&name===wanted)})||null;
}
function liveMetric(prop,row){return BTGStats.metric(prop,row)}
function liveLegState(prop,game,row){
  const metric=liveMetric(prop,row),line=BTGStats.number(prop.line),side=String(prop.side||'Over'),value=metric.value,final=game?.state==='final',crossed=Number.isFinite(value)&&Number.isFinite(line)&&(side==='Over'?value>line:value>line),hit=Number.isFinite(value)&&Number.isFinite(line)&&(side==='Over'?value>line:value<line),irreversible=side==='Over'&&hit;
  let key='pending',title='LIVE',detail='Waiting for a reported stat';
  if(Number.isFinite(value)&&Number.isFinite(line)){
    if(final){const result=BTGStats.grade(side,line,value);key=result==='push'?'pending':hit?'hit':'miss';title=result==='push'?'PROVISIONAL PUSH':hit?'PROVISIONAL HIT':'PROVISIONAL MISS';detail='Awaiting final-stat confirmation';}
    else if(irreversible){key='hit';title='HIT LIVE';detail='Unofficial until game statistics are finalized';}
    else if(side==='Under'&&crossed){key='miss';title='OVER THE LINE';detail='Currently above your Under line; live statistics can still change';}
    else{const needed=side==='Over'?Math.max(0,Math.floor(line+1-value)):Math.max(0,Math.floor(line+1-value));detail=side==='Over'?`${needed} more to hit`:`${Math.max(0,line-value).toFixed(line%1?1:0)} below the line`;}
  }
  return{...metric,key,title,detail,progress:Number.isFinite(value)&&Number.isFinite(line)&&line>0?Math.max(0,Math.min(100,value/line*100)):0};
}
async function refreshLiveGameStats(){
  const games=liveBoard.games.filter(game=>['in_progress','final','suspended'].includes(game.state));
  for(const game of games){
    const key=String(game.id),cached=liveBoard.gameStats.get(key);
    if(cached?.checkedAt&&Date.now()-cached.checkedAt<6500)continue;
    if(liveBoard.gameStatsPending.has(key))continue;
    const task=(async()=>{try{const payload=await fetchLiveJSON(`/api/live-game-stats?game_id=${encodeURIComponent(game.id)}`);liveBoard.gameStats.set(key,{...payload,checkedAt:Date.now()})}catch(error){liveBoard.gameStats.set(key,{...cached,error:error.message,stale:true,checkedAt:Date.now()})}renderLiveCenter()})().finally(()=>liveBoard.gameStatsPending.delete(key));
    liveBoard.gameStatsPending.set(key,task);
  }
  await Promise.allSettled([...liveBoard.gameStatsPending.values()]);
}
function boardProgress(prop){
  const game=liveGameFor(gameName(prop),prop.startsAt);
  if(!game||!['in_progress','suspended','final'].includes(game.state))return '';
  const status=liveLegState(prop,game,livePlayerRow(game.id,prop.player)),snapshot=liveBoard.gameStats.get(String(game.id));
  return `<div class="board-live-progress"><span>${htmlEscape(status.title)} · <strong>${status.value===null?'Awaiting stats':htmlEscape(String(status.value))}</strong></span><small>${htmlEscape(snapshot?.stale?'Stats update delayed':status.detail)}</small><div class="live-progress"><i style="width:${status.progress.toFixed(1)}%"></i></div></div>`;
}
function updateBoardProgress(){
  document.querySelectorAll('[data-board-progress]').forEach(host=>{const prop=props.find(p=>p.id===Number(host.dataset.boardProgress));host.innerHTML=prop?boardProgress(prop):''});
}
function livePropCard(prop,game){
  const row=livePlayerRow(game.id,prop.player),status=liveLegState(prop,game,row),value=status.value;
  return `<article class="live-prop-card ${status.key}" data-live-prop="${prop.id}"><header><div><span>${htmlEscape(prop.market)}</span><strong>${htmlEscape(prop.player)}</strong><small>${htmlEscape(gameName(prop))}</small></div><b class="live-leg-status">${htmlEscape(status.title)}</b></header><div class="live-prop-main"><strong>${value===null?'—':htmlEscape(String(value))}</strong><span>${htmlEscape(status.label)}<small>Target: ${htmlEscape(prop.side)} ${htmlEscape(String(prop.line))}</small></span><button type="button" data-live-odds="${prop.id}" aria-label="${state.slip.some(leg=>savedPropKey(leg.p)===savedPropKey(prop)&&leg.side===prop.side)?'Remove from':'Add to'} bet slip">${formatOdds(recommendedOdds(prop))}</button></div><div class="live-progress"><i style="width:${status.progress.toFixed(1)}%"></i></div><footer><span>${htmlEscape(status.detail)}</span><b>${htmlEscape(liveStatusLabel(game))}</b></footer></article>`;
}
function renderLiveParlay(game){
  const panel=$('#liveParlayPanel');if(!panel)return;
  const tracked=[...(typeof trackedParlays==='undefined'?[]:trackedParlays)].reverse().find(record=>record.result==='pending'&&Array.isArray(record.liveLegs)&&record.liveLegs.some(leg=>liveGameFor(leg.team,leg.startsAt)?.id===game.id));
  const trackedLegs=(tracked?.liveLegs||[]).map(saved=>{const p={...saved,id:saved.propID,sport:'NFL'};return{p,side:saved.side,odds:saved.odds}});
  const legs=(trackedLegs.length?trackedLegs:state.slip).filter(leg=>liveGameFor(gameName(leg.p),leg.p.startsAt)?.id===game.id);
  panel.hidden=!legs.length;if(!legs.length)return;
  const rows=legs.map(leg=>{const status=liveLegState({...leg.p,side:leg.side},game,livePlayerRow(game.id,leg.p.player));return`<div class="live-parlay-leg ${status.key}"><i></i><span><strong>${htmlEscape(leg.p.player)} · ${htmlEscape(leg.side)} ${htmlEscape(String(leg.p.line))}</strong><small>${status.value===null?'Waiting for stats':`${status.value} ${htmlEscape(status.label)}`} · ${htmlEscape(status.detail)}</small></span><b>${htmlEscape(status.title)}</b></div>`}).join(''),hit=legs.filter(leg=>liveLegState({...leg.p,side:leg.side},game,livePlayerRow(game.id,leg.p.player)).key==='hit').length;
  panel.innerHTML=`<header><div><p class="eyebrow">${trackedLegs.length?'TRACKED PARLAY':'YOUR LIVE SLIP'}</p><h2>${legs.length}-leg game tracker</h2></div><strong>${hit}/${legs.length} hit</strong></header><div>${rows}</div>`;
}
function renderLiveCenter(){
  updateBoardProgress();
  const center=$('#liveCenter');if(!center)return;
  const active=document.body.dataset.mobilePage==='live'||(innerWidth>720&&document.body.dataset.desktopPage==='live');center.hidden=!active;if(!active)return;
  const games=liveBoard.games.filter(game=>['in_progress','delayed','suspended'].includes(game.state)||game.state==='final'&&Date.now()-Date.parse(game.startsAt)<8*3600000);
  if(!games.some(game=>String(game.id)===String(liveBoard.selectedGameID)))liveBoard.selectedGameID=games[0]?.id||null;
  const switcher=$('#liveGameSwitcher');switcher.innerHTML=games.map(game=>`<button type="button" role="tab" aria-selected="${String(game.id)===String(liveBoard.selectedGameID)}" class="${String(game.id)===String(liveBoard.selectedGameID)?'active':''}" data-live-game="${game.id}"><strong>${htmlEscape(liveTeamKey(game.away))} @ ${htmlEscape(liveTeamKey(game.home))}</strong><span>${htmlEscape(liveScoreLabel(game))}</span><small>${htmlEscape(liveStatusLabel(game))}</small></button>`).join('');
  switcher.querySelectorAll('[data-live-game]').forEach(button=>button.onclick=()=>{liveBoard.selectedGameID=button.dataset.liveGame;renderLiveCenter()});
  const game=games.find(item=>String(item.id)===String(liveBoard.selectedGameID)),empty=$('#liveCenterEmpty'),grid=$('#livePropGrid'),summary=$('#liveCenterSummary'),stamp=$('#liveUpdatedAt');
  const snapshot=game?liveBoard.gameStats.get(String(game.id)):null;stamp.textContent=liveBoard.error?'Feed reconnecting…':liveSnapshotStale()?'Update delayed':liveBoard.updatedAt?`Updated ${Math.max(0,Math.floor((Date.now()-Date.parse(liveBoard.updatedAt))/1000))} sec ago`:'Connecting…';stamp.parentElement.classList.toggle('stale',liveSnapshotStale());
  if(!game){empty.hidden=false;grid.innerHTML='';summary.textContent='Waiting for an NFL game to go live.';$('#liveParlayPanel').hidden=true;return}
  const gameProps=props.filter(prop=>liveGameFor(gameName(prop),prop.startsAt)?.id===game.id&&!prop.teamMarket),cards=gameProps.map(prop=>livePropCard(prop,game));empty.hidden=!!cards.length;empty.innerHTML=cards.length?'':'<strong>Live game found. Player markets are loading.</strong><span>Stats and prop progress will appear as soon as the connected feed reports them.</span>';grid.innerHTML=cards.join('');summary.textContent=`${liveScoreLabel(game)} · ${liveStatusLabel(game)} · ${gameProps.length} live player props${snapshot?.stale?' · stats delayed':''}`;renderLiveParlay(game);
  grid.querySelectorAll('[data-live-odds]').forEach(button=>button.onclick=()=>{const prop=props.find(item=>item.id===Number(button.dataset.liveOdds));if(prop){toggleLeg(prop,prop.side);renderLiveCenter()}});
}
function livePollDelay() {
  return liveBoard.games.some(game=>game.state==='in_progress'||game.state==='delayed'||(game.state==='scheduled'&&Math.abs(Date.parse(game.startsAt)-Date.now())<900000))?5000:30000;
}
async function tickLiveBoard() {
  clearTimeout(liveBoard.timer);
  if(document.hidden || navigator.onLine===false) return;
  if(liveBoard.pending) return liveBoard.pending;
  liveBoard.pending=(async()=>{
    await refreshLiveGames();
    await Promise.allSettled([refreshCurrentStats(),refreshLiveGameStats(),refreshLiveOdds()]);
  })().finally(()=>{liveBoard.pending=null;if(!document.hidden&&navigator.onLine!==false)liveBoard.timer=setTimeout(tickLiveBoard,livePollDelay())});
  return liveBoard.pending;
}
const pullRefresh={startY:0,active:false,ready:false,running:false,indicator:null};
function setupPullRefresh(){
  if(!('ontouchstart' in window))return;
  const indicator=document.createElement('div'); indicator.className='pull-refresh-indicator'; indicator.setAttribute('aria-label','Refreshing live data');
  document.body.append(indicator); pullRefresh.indicator=indicator;
  document.addEventListener('touchstart',event=>{
    if(window.scrollY>4||event.touches.length!==1||pullRefresh.running)return;
    pullRefresh.startY=event.touches[0].clientY; pullRefresh.active=true; pullRefresh.ready=false;
  },{passive:true});
  document.addEventListener('touchmove',event=>{
    if(!pullRefresh.active||window.scrollY>4||event.touches.length!==1)return;
    const distance=event.touches[0].clientY-pullRefresh.startY;
    if(distance<=0)return;
    pullRefresh.ready=distance>=72; indicator.style.setProperty('--pull-distance',`${Math.min(72,distance)}px`); indicator.classList.add('visible');
    indicator.classList.toggle('ready',pullRefresh.ready);
  },{passive:true});
  const finishGesture=async()=>{
    if(!pullRefresh.active)return; pullRefresh.active=false;
    if(!pullRefresh.ready){indicator.classList.remove('visible','ready');return;}
    pullRefresh.running=true; indicator.classList.add('refreshing','visible');
    try{
      await Promise.allSettled([loadLiveProps(true),loadFutureSchedule(true),refreshLiveGames(),refreshLiveOdds()]);
    }finally{
      pullRefresh.running=false; indicator.classList.remove('refreshing','ready');
      setTimeout(()=>indicator.classList.remove('visible'),900);
    }
  };
  document.addEventListener('touchend',finishGesture,{passive:true});
  document.addEventListener('touchcancel',()=>{pullRefresh.active=false;pullRefresh.ready=false;indicator.classList.remove('visible','ready')},{passive:true});
}
window.BTGLive={attachProfile:attachLiveProfile,updateLabels:()=>{updateLiveLabels();updateBoardProgress()},renderCenter:renderLiveCenter,boardProgress};
document.addEventListener('visibilitychange',()=>{if(document.hidden)clearTimeout(liveBoard.timer);else tickLiveBoard()});
window.addEventListener('online',tickLiveBoard);
window.addEventListener('offline',()=>{clearTimeout(liveBoard.timer);liveBoard.error='Offline';updateLiveLabels();renderCurrentGame()});
window.addEventListener('pageshow',event=>{if(event.persisted)tickLiveBoard()});
setupPullRefresh();
liveBoard.timer=setTimeout(tickLiveBoard,800);
