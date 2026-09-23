const assert=require('node:assert/strict');
const {client}=require('./helpers/client.cjs');
let checks=0;const check=(value,message)=>{assert.ok(value,message);checks++};
for(const width of [390,1440]){
 const c=client(width);assert.ifError(c.error);
 c.eval(`props=[
   {...demoProps[0],id:1,eventID:'NFL--gameA',team:'BUF · @ MIA',bookCount:4,oneSided:false,edge:6,conf:80},
   {...demoProps[1],id:2,eventID:'NFL--gameA',team:'BUF · @ MIA',bookCount:4,oneSided:false,edge:.5,conf:55},
   {...demoProps[6],id:3,eventID:'NFL--gameA',team:'BUF · @ MIA',bookCount:4,oneSided:false,edge:4,conf:72},
   {...demoProps[12],id:4,eventID:'NFL--gameB',team:'BAL · @ CIN',bookCount:4,oneSided:false,edge:5,conf:75}
 ];state.view='board';state.boardMarket='All';state.boardGame='BUF @ MIA'`);
 check(c.eval('visibleProps().length===3&&visibleProps().every(p=>gameName(p)===state.boardGame)'),'Popular game tab fills from that game’s best available plays');
 c.eval("state.boardGame='All'");
 check(c.eval('visibleProps().length===4&&visibleProps()[0].edge>=visibleProps().at(-1).edge'),'Popular opening view fills and remains ranked by current edge');
 c.eval(`props=[
   ...Array.from({length:7},(_,i)=>({...demoProps[0],id:100+i,player:'TD Player '+i,eventID:'NFL--td'+i,team:'T'+i+' · @ O'+i,market:'Anytime Touchdown',binary:true,line:.5,over:150+i*10,under:-180,edge:10-i*.1,conf:80,bookCount:8,oneSided:false})),
   ...Array.from({length:8},(_,i)=>({...demoProps[0],id:200+i,player:'Standard Player '+i,eventID:'NFL--std'+i,team:'S'+i+' · @ X'+i,market:['Passing Yards','Receiving Yards','Rushing Yards','Receptions'][i%4],line:50+i,over:-110,under:-110,edge:6-i*.1,conf:72,bookCount:6,oneSided:false})),
   {...demoProps[0],id:300,player:'First TD Player',eventID:'NFL--exotic',team:'E · @ F',market:'First Touchdown',binary:true,line:.5,over:900,under:null,edge:15,conf:82,bookCount:8,oneSided:false}
 ]`);
 check(c.eval('bestOfBest().length===10'),'featured board fills ten balanced props');
 check(c.eval('bestOfBest().filter(p=>p.market==="Anytime Touchdown").length<=3'),'featured board caps anytime touchdowns at three');
 check(c.eval('Math.max(...Object.values(bestOfBest().reduce((counts,p)=>(counts[p.market]=(counts[p.market]||0)+1,counts),{})))<=2'),'featured board uses no more than two of one market when enough options exist');
 check(c.eval('bestOfBest().every(p=>!featuredLongshotMarket(p.market))'),'featured board excludes first, last and multiple-touchdown longshots');
 check(c.eval('card(bestOfBest()[0],0,true).includes("Why this guy?")&&card(bestOfBest()[0],0,true).includes("BEST ODDS WE FOUND")&&card(bestOfBest()[0],0,true).includes("Odds checked:")'),'featured props explain the evidence in plain language');
 check(c.eval('!card(bestOfBest()[0],0,false).includes("Why this guy?")'),'ordinary prop lists stay compact');
 check(c.eval('featuredMarketValue(bestOfBest()[0]).detail.includes("better payout if it wins")'),'featured explanation translates the price comparison for regular fans');
 check(c.eval(`normalizeBinaryOddsApi([{sport_label:'NFL',away_team:'A',home_team:'B',commence_time:new Date(Date.now()+3600000).toISOString(),eventID:'NFL--x',bookmakers:[{key:'book',markets:[{key:'player_1st_td',outcomes:[{name:'No Scorer',price:5000},{name:'Team D/ST',price:1200},{name:'Real Player',price:300}]}]}]}]).map(p=>p.player).join(',')==='Real Player'`),'non-player scorer outcomes are excluded');
 check(c.eval(`shortPlayerName('Michael Penix Jr.')==='Penix Jr.'&&shortPlayerName('Jonathan Taylor')==='Taylor'`),'parlay cards preserve name suffixes');
 c.eval(`props=Array.from({length:8},(_,i)=>({...demoProps[0],id:i+1,player:'Player '+i,eventID:'NFL--mix'+i,team:'A'+i+' · @ B'+i,side:'Over',over:-160,under:140,edge:3,conf:65,bookCount:4,oneSided:false}));Object.assign(state,{sport:'NFL',game:'All',team:'All',day:'All',timeSlot:'All',market:'All',side:'All',move:'All',minEdge:0,minConf:0,oddsType:'All',high:false,heat:null});mixerCandidateCache.clear()`);
 check(c.eval('Math.abs(buildMixerCandidates(5,1000)[0].american-1000)<100'),'generator directly targets attainable requested odds');
 c.eval(`props=[
   ...Array.from({length:12},(_,i)=>({...demoProps[0],id:400+i,player:'Touchdown '+i,eventID:'NFL--tdmix'+i,team:'T'+i+' · @ O'+i,market:'Anytime Touchdown',binary:true,line:.5,over:150,under:-180,edge:8,conf:78,bookCount:8,oneSided:false,startsAt:new Date(Date.now()+86400000).toISOString()})),
   ...Array.from({length:24},(_,i)=>({...demoProps[0],id:500+i,player:'Standard '+i,eventID:'NFL--stdmix'+i,team:'S'+i+' · @ X'+i,market:['Passing Yards','Receiving Yards','Rushing Yards','Receptions','Pass Attempts','Rush Attempts'][i%6],line:20+i,over:-110,under:-110,edge:.2,conf:53,bookCount:6,oneSided:false,startsAt:new Date(Date.now()+86400000).toISOString()}))
 ];Object.assign(state,{sport:'NFL',game:'All',team:'All',day:'All',timeSlot:'All',market:'All',side:'All',move:'All',minEdge:0,minConf:0,oddsType:'All',high:false,heat:null});mixerCandidateCache.clear();parlaySignatures.forEach(set=>set.clear())`);
 check(c.eval('balancedCandidatePool(100).some(p=>marketFamily(p.market)!=="touchdowns")'),'balanced pool widens beyond touchdown-only high edges');
 check(c.eval('buildMixerCandidates(6,2500)[0].legs.filter(p=>marketFamily(p.market)==="touchdowns").length<=2'),'generator caps touchdowns when all prop types are selected');
 check(c.eval('Math.max(...Object.values(buildMixerCandidates(6,2500)[0].legs.reduce((counts,p)=>(counts[marketFamily(p.market)]=(counts[marketFamily(p.market)]||0)+1,counts),{})))<=3'),'generator spreads an all-props build across market families');
 c.eval('mixerSelection=buildMixerCandidates(5,2500)[0];renderMixer()');
 check(c.eval('typeof $("#mixerResult").onclick==="function"&&$("#mixerResult").innerHTML.includes("data-view-mixer-detail")'),'generated parlay is clickable and exposes a details button');
 c.eval('$("#mixerResult").onclick()');
 check(c.eval('$("#parlayDetailDialog").open&&$("#parlayDetailContent").innerHTML.includes("Generated Parlay")'),'generated parlay opens the same full detail dialog as premade parlays');
 check(c.eval('$("#parlayDetailContent").innerHTML.includes("Add this parlay to slip")'),'generated parlay detail can load every leg into the slip');
 for(let size=2;size<=10;size++){c.ctx.size=size;check(c.eval('buildMixerCandidates(size,2500).some(r=>r.legs.length===size&&r.legs.some(p=>marketFamily(p.market)!=="touchdowns"))'),`${size}-leg generator remains available with non-touchdown props`)}
 for(let level=0;level<3;level++){c.ctx.level=level;check(c.eval('Boolean(makeCreativeParlay(level,new Set()))'),`premade level ${level} builds from a low-edge standard pool`)}
 c.eval('baseLiveProps=[{...demoProps[0],eventID:"NFL--fixtureA"},{...demoProps[1],eventID:"NFL--fixtureB"}];rebuildPropBoard();state.saved.add(savedPropKey(props[0]));toggleLeg(props[0],props[0].side);baseLiveProps.reverse();rebuildPropBoard()');
 check(c.eval('props.filter(p=>state.saved.has(savedPropKey(p)))[0].player==="Josh Allen"'),'bookmark survives reorder');
 c.eval('toggleLeg(props[0],props[0].side)');check(c.eval('state.slip.length===2'),'unrelated pick cannot replace original leg');
 c.eval('toggleLeg(props[1],props[1].side)');check(c.eval('state.slip.length===1&&state.slip[0].p.player==="CeeDee Lamb"'),'remove original after reorder');
 c.eval('toggleLeg(props[0],"Over")');check(c.eval('state.slip.length===1&&state.slip[0].side==="Over"'),'direction change only changes same market');
 c.eval('baseLiveProps.reverse();rebuildPropBoard();renderSlip()');check(c.eval('state.slip[0].key===slipSelectionKey(state.slip[0].p,state.slip[0].side)'),'restored slip has stable removal key');
 check(c.eval('!state.slip[0].changed&&!state.slip[0].unavailable'),'reorder does not invent price change');
 c.eval('baseLiveProps=baseLiveProps.filter(p=>p.player!=="CeeDee Lamb");rebuildPropBoard();renderSlip()');check(c.eval('state.slip[0].unavailable'),'removed market remains unavailable');
 c.eval('state.slip=[{key:slipSelectionKey(demoProps[0],"Over"),p:demoProps[0],side:"Over",odds:demoProps[0].over},{key:slipSelectionKey(demoProps[1],"Under"),p:demoProps[1],side:"Under",odds:demoProps[1].under}];renderSlip()');
 check(c.eval('$("#slipLegs").innerHTML.includes("data-remove-slip")&&!$("#slipLegs").innerHTML.includes("data-key=")'),'slip remove buttons use safe numeric indexes instead of quoted JSON keys');
 c.eval('removeSlipLeg(0)');check(c.eval('state.slip.length===1&&state.slip[0].p.player===demoProps[1].player'),'remove button action deletes exactly the selected leg');
 if(width===390){
  check((c.events.touchmove||[]).length===1&&(c.events.touchstart||[]).length===1&&(c.events.touchend||[]).length===1,'mobile swipe installs drag, release and completion handlers');
  let swipePrevented=false;c.events.touchstart[0]({touches:[{clientX:200,clientY:400}],target:null});c.events.touchmove[0]({touches:[{clientX:120,clientY:405}],preventDefault(){swipePrevented=true}});
  check(swipePrevented&&c.nodes.get('main').style.transform.includes('translate3d(-'),'mobile page visibly follows the finger with increased sensitivity during a horizontal drag');
  check(c.eval('document.body.children.some(child=>child.className==="mobile-swipe-preview"&&child.dataset.page==="parlays"&&!child.removed)'),'neighboring page is rendered beside the current page during the drag');
  c.events.touchcancel[0]({});
  c.eval('document.body.dataset.mobilePage="props"');check(c.eval('mobileSwipeDestination(-90,10,250)==="parlays"'),'left swipe advances to the next bottom tab');
  c.eval('document.body.dataset.mobilePage="generator"');check(c.eval('mobileSwipeDestination(90,10,250)==="parlays"'),'right swipe returns to the previous bottom tab');
  check(c.eval('mobileSwipeDestination(-20,5,250)===null&&mobileSwipeDestination(-90,85,250)===null&&mobileSwipeDestination(-90,5,1100)===null'),'short, diagonal and slow gestures do not switch tabs');
  check(c.eval('mobileSwipeDestination(-40,5,250)==="movement"'),'shorter intentional swipes now switch tabs');
  c.eval('document.body.dataset.mobilePage="slip"');check(c.eval('mobileSwipeDestination(-90,5,250)===null'),'swiping past the final tab does not wrap');
 }
 c.eval('baseLiveProps=[];rebuildPropBoard()');check(c.eval('state.saved.size===1'),'temporary feed failure preserves bookmark identity');
}
const saved=JSON.stringify([JSON.stringify(['NFL--fixture','Player','Receptions',4.5])]),restored=client(390,{'propedge-saved':saved});
check(restored.eval('state.saved.size===1'),'stable bookmarks restore');
const old=client(390,{'propedge-saved':'[1,2]'});check(old.eval('state.saved.size===0'),'ambiguous old row numbers never select other players');
check(restored.eval('gameResult({game:{home_team:{id:1},visitor_team:{id:2},home_team_score:null,visitor_team_score:7},team:{id:1}},{})===null'),'missing score cannot create a loss');
console.log(`PASS: ${checks} refresh and stable-selection checks`);
