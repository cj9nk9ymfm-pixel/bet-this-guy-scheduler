const movementMarketKeys=['player_pass_yds','player_rush_yds','player_reception_yds','player_receptions','player_pass_tds','player_anytime_td'];
const movementRequests=new Map();
function compactMovementEvent(event){return {...event,bookmakers:(event.bookmakers||[]).map(book=>({key:book.key,title:book.title,markets:(book.markets||[]).filter(m=>movementMarketKeys.includes(m.key))})).filter(book=>book.markets.length)}}
async function saveMovementSnapshot(event,env,at=Date.now(),kind='observed'){
  if(!env.DB||!event?.id)return;
  const interval=at<Date.parse(event.commence_time)?15*60000:60000;
  const eventID=event.eventID||`NFL--${event.id}`,bucket=Math.floor(at/interval)*interval;
  await env.DB.prepare('INSERT OR IGNORE INTO movement_snapshots (id,event_id,captured_at,kind,payload_json) VALUES (?,?,?,?,?)').bind(`${eventID}|${kind}|${bucket}`,eventID,at,kind,JSON.stringify(compactMovementEvent(event))).run();
}
async function sharedMovement(request,env,ctx){
  const eventID=new URL(request.url).searchParams.get('eventID')||'';
  if(!/^NFL--[A-Za-z0-9_-]{4,100}$/.test(eventID))return json({success:false,error:'Choose a valid NFL game.'},400);
  if(!env.DB||!env.THE_ODDS_API_KEY)return json({success:false,error:'Shared movement history is unavailable.'},503);
  const restore=value=>new Response(value.body,{status:value.status,headers:value.headers});
  if(movementRequests.has(eventID))return restore(await movementRequests.get(eventID));
  const pending=loadSharedMovement(request,env,ctx,eventID).then(async response=>({body:await response.text(),status:response.status,headers:[...response.headers]}));
  movementRequests.set(eventID,pending);
  try{return restore(await pending)}finally{movementRequests.delete(eventID)}
}
async function loadSharedMovement(request,env,ctx,eventID){
  try{
    const saved=await readFeedCache(request,`shared-movement-v2-${eventID}`);
    if(saved.response&&cacheAge(saved.response)<60000)return cachedForClient(saved.response,'fresh');
    const url=new URL('/api/event',request.url);url.searchParams.set('eventID',eventID);url.searchParams.set('movement','1');
    const response=await eventProps(new Request(url),env,ctx),payload=await response.json();
    if(!response.ok||!payload.success)throw new Error('Current odds unavailable');
    const event=compactMovementEvent(payload.data[0]),now=Date.now();
    await saveMovementSnapshot(event,env,now);
    // One bounded historical lookup per event, shared across all visitors.
    // Claim first so simultaneous requests cannot consume repeated paid calls.
    const historyID=`${eventID}|history-status-v2`;
    const claim=await env.DB.prepare("INSERT OR IGNORE INTO movement_snapshots (id,event_id,captured_at,kind,payload_json) VALUES (?,?,?,'history-status','{}')").bind(historyID,eventID,now).run();
    if(claim.meta?.changes){
      let status='unavailable',providerStatus=null,providerErrorCode=null;
      try{
        for(const hours of [24,6,1]){
          const query=new URLSearchParams({apiKey:env.THE_ODDS_API_KEY,regions:'us',markets:movementMarketKeys.join(','),oddsFormat:'american',dateFormat:'iso',date:new Date(now-hours*3600000).toISOString().replace(/\.\d{3}Z$/,'Z')});
          const historical=await fetch(`${API_BASE}/historical/sports/americanfootball_nfl/events/${event.id}/odds?${query}`,{signal:AbortSignal.timeout(10000)});
          providerStatus=historical.status;
          if(!historical.ok){const error=await historical.json().catch(()=>({}));providerErrorCode=/^[A-Z_]+$/.test(error.error_code||'')?error.error_code:null}
          if(historical.ok){const body=await historical.json(),at=Date.parse(body.timestamp);if(body.data?.id===event.id&&body.data.bookmakers?.length&&Number.isFinite(at)&&at<now&&at>now-7*86400000){await saveMovementSnapshot({...body.data,eventID},env,at,'provider-history');status='available';break}}
          if([401,403,429].includes(historical.status))break;
        }
      }catch{}
      await env.DB.prepare('UPDATE movement_snapshots SET payload_json=? WHERE id=?').bind(JSON.stringify({status,providerStatus,providerErrorCode}),historyID).run();
    }
    const rows=await env.DB.prepare("SELECT captured_at,kind,payload_json FROM movement_snapshots WHERE event_id=? AND captured_at>=? AND kind!='history-status' ORDER BY CASE WHEN kind='provider-history' THEN 0 ELSE 1 END,captured_at DESC LIMIT 96").bind(eventID,now-7*86400000).all();
    const snapshots=(rows.results||[]).sort((a,b)=>a.captured_at-b.captured_at).map(row=>({at:row.captured_at,source:row.kind,event:JSON.parse(row.payload_json)}));
    const statusRow=await env.DB.prepare('SELECT payload_json FROM movement_snapshots WHERE id=?').bind(historyID).all();
    const historyStatus=JSON.parse(statusRow.results?.[0]?.payload_json||'{}');
    const body=JSON.stringify({success:true,data:[event],snapshots,historyStatus,updatedAt:new Date(now).toISOString(),historyScope:'Shared sampled history; not the sportsbook opening price.'});
    const stored=storedResponse(body,120);await saved.cache.put(saved.key,stored.clone());
    ctx.waitUntil(env.DB.prepare('DELETE FROM movement_snapshots WHERE captured_at<?').bind(now-7*86400000).run().catch(()=>{}));
    return cachedForClient(stored,'miss');
  }catch{return json({success:false,error:'Movement history could not load. Please retry.'},503)}
}
