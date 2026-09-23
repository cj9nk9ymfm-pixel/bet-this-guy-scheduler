// Read-only product audit against a captured real provider slate. No wagers or record posts.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {client}=require('./helpers/client.cjs');
const slate=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const checks=[],failures=[],record=(name,fn)=>{try{fn();checks.push(name)}catch(e){failures.push({name,error:e.message})}};
let summary;
for(const width of [390,1440]){
 const c=client(width);assert.ifError(c.error);c.ctx.slate=slate;
 c.eval('baseLiveProps=normalizeLiveProps(slate);rebuildPropBoard();state.sport="NFL"');
 const test=(name,code)=>record(`${width}: ${name}`,()=>assert.ok(c.eval(code)));
 test('every supplied game has normalized props','new Set(props.map(p=>p.eventID)).size===slate.data.length');
 test('no malformed prices or lines','props.every(p=>Number.isFinite(p.line)&&Number.isFinite(recommendedOdds(p))&&Math.abs(recommendedOdds(p))>=100)');
 test('unique board identities','new Set(props.map(propIdentity)).size===props.length');
 for(const page of (width===390?['props','parlays','generator','movement','slip']:['props','parlays','generator','movement'])){c.ctx.page=page;test(`route ${page}`,width===390?'showMobilePage(page);document.body.dataset.mobilePage===page':'showDesktopPage(page);document.body.dataset.desktopPage===page');}
 c.eval('state.view="board";document.body.dataset.mobilePage="props";document.body.dataset.desktopPage="props"');
 for(const game of c.eval('[...new Set(props.map(gameName))]')){c.ctx.game=game;test(`game filter ${game}`,'state.game=game;state.market="All";mixerCandidateCache.clear();mixerEligiblePool().length>0&&mixerEligiblePool().every(p=>gameName(p)===game)');}
 c.eval('state.game="All"');
 for(const market of c.eval('[...new Set(props.map(p=>p.market))]')){c.ctx.market=market;test(`market filter ${market}`,'state.market=market;mixerCandidateCache.clear();mixerEligiblePool().length>0&&mixerEligiblePool().every(p=>p.market===market)');}
 c.eval('state.market="All";mixerCandidateCache.clear()');
 for(let level=0;level<3;level++)for(let batch=0;batch<4;batch++){
  c.ctx.level=level;c.eval('refreshParlays(level,false)');
  test(`level ${level} batch ${batch} supplies six builds`,'parlayFeeds[level].length===6');
  test(`level ${level} batch ${batch} odds and unique players`,'parlayFeeds[level].every(r=>r.american>=parlaySections[level].minOdds&&r.american<=parlaySections[level].maxOdds&&mixerLegsCompatible(r.legs))');
  test(`level ${level} batch ${batch} supports final grading`,'parlayFeeds[level].every(r=>r.legs.every(p=>BTGStats.supports(p)&&Date.parse(p.startsAt)>Date.now()))');
 }
 for(let size=2;size<=10;size++){
  c.ctx.size=size;test(`${size}-leg generator`,'buildMixerCandidates(size,2500).some(r=>r.legs.length===size&&mixerLegsCompatible(r.legs)&&Number.isFinite(r.american))');
 }
 test('combined game and market filter','state.game=gameName(props.find(p=>p.market==="Receptions"));state.market="Receptions";mixerCandidateCache.clear();mixerEligiblePool().length>0&&mixerEligiblePool().every(p=>p.market===state.market&&gameName(p)===state.game)');
 c.eval('state.game="All";state.market="All";mixerCandidateCache.clear();selectedPlayer="";state.slip=[]');
 test('add over','toggleLeg(props.find(p=>p.under!=null),"Over");state.slip.length===1&&state.slip[0].side==="Over"');
 test('switch same prop to under','toggleLeg(state.slip[0].p,"Under");state.slip.length===1&&state.slip[0].side==="Under"&&state.slip[0].odds===state.slip[0].p.under');
 test('remove selected side','toggleLeg(state.slip[0].p,"Under");state.slip.length===0');
 test('load premade to slip','loadSuggestedParlay(parlayFeeds[2][0]);state.slip.length===parlayFeeds[2][0].legs.length');
 test('clear slip resets share state','$("#clearSlip").onclick();state.slip.length===0&&preparedShareFile===null');
 test('player search only matching player','choosePlayer(props[0].player);visibleProps().every(p=>p.player===selectedPlayer)');
 test('clear player search','$("#clearPlayerSearch").onclick();selectedPlayer===""');
 test('settings opens','openSettings();$("#settingsDialog").open');
 test('empty board renders without throw','const savedProps=props;props=[];render();props=savedProps;true');
 if(width===390)summary=c.eval('({games:slate.data.length,props:props.length,picks:bestOfBest().map(p=>({player:p.player,market:p.market,side:p.side,line:p.line,odds:recommendedOdds(p),books:p.bookCount})),parlays:parlaySections.map((s,i)=>({name:s.name,count:parlayFeeds[i].length,odds:parlayFeeds[i].map(p=>p.american)}))})');
}
console.log(JSON.stringify({passed:checks.length,failed:failures.length,failures,summary},null,2));
if(failures.length)process.exitCode=1;
