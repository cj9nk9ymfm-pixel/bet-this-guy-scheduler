// Comparable observations only. Legacy mixed-line history is never imported.
globalThis.BTGMovement=(()=>{
  const storageKey='btg-book-movement-v2',week=7*86400000;
  const markets={player_pass_yds:'Passing Yards',player_rush_yds:'Rushing Yards',player_reception_yds:'Receiving Yards',player_receptions:'Receptions',player_pass_tds:'Passing Touchdowns',player_anytime_td:'Anytime Touchdown'};
  const number=value=>value===null||value===undefined||value===''?null:Number.isFinite(Number(value))?Number(value):null;
  const probability=price=>price>0?100/(price+100):Math.abs(price)/(Math.abs(price)+100);
  let sharedImport=false,history={};try{const saved=JSON.parse(localStorage.getItem(storageKey)||'{}');if(saved&&typeof saved==='object'&&!Array.isArray(saved))history=saved}catch{}
  const current=new Map(),currentIndex=new Map();
  const selectionKey=offer=>JSON.stringify([offer.eventID,offer.player,offer.market,offer.side]);
  function reindex(){currentIndex.clear();for(const [id,offer] of current){const identity=selectionKey(offer),list=currentIndex.get(identity)||[];list.push([id,offer]);currentIndex.set(identity,list)}}
  function invalidate(eventID){for(const [id,offer] of current)if(offer.eventID===eventID)current.delete(id);reindex()}
  const key=offer=>JSON.stringify([offer.eventID,offer.player,offer.marketKey,offer.bookKey,offer.side,offer.phase]);
  const validRow=row=>row&&Number.isFinite(row.at)&&Number.isFinite(row.seenAt)&&Number.isFinite(row.line)&&Number.isFinite(row.price)&&Math.abs(row.price)>=100;
  function observe(events,now=Date.now()){
    for(const event of events||[]){
      const eventID=event.eventID||`NFL--${event.id}`,kickoff=Date.parse(event.commence_time||'');
      if(!event.id||!Number.isFinite(kickoff))continue;
      for(const [id,offer] of current)if(offer.eventID===eventID)current.delete(id);
      const phase=now<kickoff?'pregame':'after-kickoff';
      for(const book of event.bookmakers||[])for(const market of book.markets||[]){
        if(!markets[market.key]||!book.key)continue; // No alternates, periods, milestones, or obscure categories.
        const at=Date.parse(market.last_update||'');
        if(!Number.isFinite(at)||at>now+60000||now-at>(phase==='pregame'?15*60000:3*60000))continue;
        // A cached pregame quote must not become the first in-play observation.
        if(phase==='after-kickoff'&&at<kickoff)continue;
        const binary=market.key==='player_anytime_td',groups=new Map();
        for(const outcome of market.outcomes||[]){
          const name=String(outcome.name||''),raw=name.toLowerCase(),player=String(outcome.description||(binary&&!['yes','no'].includes(raw)?name:'')).trim();
          const side=binary?(raw==='no'?'Under':'Over'):raw==='over'?'Over':raw==='under'?'Under':null;
          const line=binary?.5:number(outcome.point),price=number(outcome.price);
          if(!player||!side||line===null||price===null||Math.abs(price)<100||Math.abs(price)>100000)continue;
          const list=groups.get(player)||[];list.push({side,line,price});groups.set(player,list);
        }
        for(const [player,offers] of groups){
          // If a book supplies multiple thresholds under a standard key, we
          // cannot know the main line. Skip it instead of guessing from odds.
          if(new Set(offers.map(offer=>offer.line)).size!==1)continue;
          if(!binary&&(!offers.some(offer=>offer.side==='Over')||!offers.some(offer=>offer.side==='Under')))continue;
          for(const offer of offers){
            if(offers.filter(other=>other.side===offer.side).length!==1)continue;
            const meta={eventID,player,marketKey:market.key,market:markets[market.key],bookKey:book.key,book:book.title||book.key,side:offer.side,phase,kickoff};
            const id=key(meta),saved=history[id],rows=Array.isArray(saved?.rows)?saved.rows.filter(row=>validRow(row)&&row.at>=now-week):[],previous=rows.at(-1);
            if(previous&&at<previous.at)continue;
            const row={...offer,at,seenAt:now};
            if(previous&&at===previous.at&&(offer.line!==previous.line||offer.price!==previous.price)){
              // Contradictory duplicate timestamps are not movement evidence.
              delete history[id];continue;
            }
            if(!previous||previous.price!==offer.price||previous.line!==offer.line)rows.push(row);
            else rows[rows.length-1]={...previous,lastSeenAt:now};
            history[id]={...meta,rows:rows.length>96?[rows[0],...rows.slice(-95)]:rows};
            current.set(id,{...meta,...row});
          }
        }
      }
    }
    const entries=Object.entries(history).filter(([,value])=>Array.isArray(value?.rows)&&value.rows.some(row=>validRow(row)&&row.at>=now-week)).sort((a,b)=>(b[1].rows.at(-1)?.lastSeenAt||b[1].rows.at(-1)?.seenAt||0)-(a[1].rows.at(-1)?.lastSeenAt||a[1].rows.at(-1)?.seenAt||0)).slice(0,50000);
    if(!sharedImport)history=Object.fromEntries(entries);
    reindex();
    if(!sharedImport)try{localStorage.setItem(storageKey,JSON.stringify(Object.fromEntries(entries.slice(0,2000))))}catch{}
  }
  function seriesFor(prop,allowedBook=()=>true,now=Date.now(),includeBaseline=false){
    if(prop.sport!=='NFL'||prop.teamMarket||/^Alternate /i.test(prop.market||''))return [];
    const candidates=[];
    for(const [id,offer] of currentIndex.get(selectionKey(prop))||[]){
      if(offer.eventID!==prop.eventID||offer.player!==prop.player||offer.market!==prop.market||offer.side!==prop.side||!allowedBook(offer.book))continue;
      if(now-offer.at>(offer.phase==='pregame'?15*60000:3*60000))continue;
      const rows=history[id]?.rows?.filter(row=>validRow(row)&&row.at>=now-week)||[];
      if(!rows.length)continue;
      if(includeBaseline){const row=rows.at(-1);candidates.push({id,...offer,rows,from:rows[0],to:row,type:'baseline',probabilityDelta:0,score:0});continue}
      if(rows.length<2)continue;
      const first=rows[0],last=rows.at(-1),changedLine=rows.some(row=>row.line!==first.line);
      // Touchdown threshold ladders never become a value/movement alert.
      if(/touchdown/i.test(offer.market)&&changedLine)continue;
      if(first.line===last.line&&first.price===last.price)continue;
      const probabilityDelta=(probability(last.price)-probability(first.price))*100;
      if(!changedLine&&Math.abs(probabilityDelta)<1)continue;
      candidates.push({id,...offer,rows,from:first,to:last,type:changedLine?'primary-line':'same-line-price',probabilityDelta,score:changedLine?1:Math.abs(probabilityDelta)});
    }
    return candidates.sort((a,b)=>b.to.at-a.to.at||a.bookKey.localeCompare(b.bookKey));
  }
  function importShared(payload){
    sharedImport=true;
    const events=payload.data||[],ids=new Set(events.map(e=>e.eventID||`NFL--${e.id}`));
    for(const id of Object.keys(history))if(ids.has(history[id].eventID))delete history[id];
    for(const id of ids)invalidate(id);
    for(const snapshot of [...(payload.snapshots||[])].sort((a,b)=>a.at-b.at))if(ids.has(snapshot.event?.eventID||`NFL--${snapshot.event?.id}`))observe([snapshot.event],snapshot.at);
    observe(events);
    sharedImport=false;
  }
  return {observe,importShared,seriesFor,trackedFor:(p,allowed)=>seriesFor(p,allowed,Date.now(),true),probability,markets,invalidate,hasCurrent:()=>current.size>0,hasEvent:id=>[...current.values()].some(offer=>offer.eventID===id)};
})();
