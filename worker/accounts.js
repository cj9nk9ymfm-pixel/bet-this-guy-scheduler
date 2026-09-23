const ACCOUNT_SUPABASE_URL='https://dtypbfxmponfrwtprnca.supabase.co';
const ACCOUNT_SUPABASE_KEY='sb_publishable_SRVkae5U7sfu1sgRHB2UFQ_AroKYMPj';

function accountJson(data,status=200){return json(data,status)}
function accountText(value,max=240){const text=String(value??'').trim();return text.slice(0,max)}
function accountNumber(value){const number=Number(value);return Number.isFinite(number)?number:null}
function accountIso(value){const time=Date.parse(value||'');return Number.isFinite(time)?new Date(time).toISOString():null}
function accountSide(value){const side=accountText(value,16).toLowerCase();if(side==='under')return'Under';if(side==='no')return'No';if(side==='yes')return'Yes';return'Over'}
function accountDecimal(odds){return odds>0?1+odds/100:1+100/Math.abs(odds)}
function accountAmerican(decimal){return decimal>=2?Math.round((decimal-1)*100):Math.round(-100/(decimal-1))}
function accountMoneyCents(value){const number=Number(value);return Number.isFinite(number)?Math.max(0,Math.min(100000000,Math.round(number*100))):0}
function accountOriginAllowed(request){const origin=request.headers.get('origin');return !origin||origin===new URL(request.url).origin}

async function accountUser(request){
  const authorization=request.headers.get('authorization')||'';
  if(!/^Bearer\s+[A-Za-z0-9._~-]+$/.test(authorization)||authorization.length>5000)return null;
  try{
    const response=await fetch(`${ACCOUNT_SUPABASE_URL}/auth/v1/user`,{headers:{apikey:ACCOUNT_SUPABASE_KEY,authorization,accept:'application/json'},signal:AbortSignal.timeout(8000)});
    if(!response.ok)return null;
    const user=await response.json();
    if(!/^[0-9a-f-]{36}$/i.test(String(user?.id||''))||!user?.email)return null;
    return{id:user.id,email:accountText(user.email,320),name:accountText(user.user_metadata?.full_name||user.user_metadata?.name||'',80)};
  }catch{return null}
}

async function ensureAccountProfile(user,env){
  const now=new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO user_profiles (auth_user_id,email,display_name,plan,subscription_status,created_at,updated_at) VALUES (?, ?, ?, 'free', 'inactive', ?, ?)").bind(user.id,user.email,user.name||null,now,now),
    env.DB.prepare("UPDATE user_profiles SET email=?, display_name=COALESCE(display_name,?), updated_at=? WHERE auth_user_id=?").bind(user.email,user.name||null,now,user.id),
  ]);
  return env.DB.prepare('SELECT auth_user_id,email,display_name,plan,subscription_status,entitlement_expires_at,created_at FROM user_profiles WHERE auth_user_id=?').bind(user.id).first();
}

async function accountBody(request,max=100000){
  const raw=await request.text();
  if(raw.length>max)throw new Error('Request too large');
  const value=raw?JSON.parse(raw):{};
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid request');
  return value;
}

async function settleUserRecords(env,authUserId){
  if(!env.DB||!env.BALLDONTLIE_API_KEY)return;
  const cutoff=new Date(Date.now()-30*60000).toISOString();
  const rows=await env.DB.prepare("SELECT * FROM user_bets WHERE auth_user_id=? AND status IN ('pending','provisional') AND game_start IS NOT NULL AND game_start<=? ORDER BY updated_at ASC LIMIT 24").bind(authUserId,cutoff).all();
  if(!rows.results?.length)return;
  const statsCache=new Map(),signal=AbortSignal.timeout(20000);
  for(const bet of rows.results){
    const legRows=await env.DB.prepare('SELECT * FROM user_bet_legs WHERE bet_id=? AND auth_user_id=? ORDER BY ordinal').bind(bet.id,authUserId).all();
    const legs=(legRows.results||[]).map(leg=>({player:leg.player,market:leg.market,side:leg.side,line:accountNumber(leg.line),odds:leg.american_odds,sport:'NFL',gameId:leg.event_id,gameTime:leg.game_start,team:leg.team,result:leg.result,actualValue:accountNumber(leg.actual_value)}));
    if(!legs.length)continue;
    const record={kind:bet.bet_type==='parlay'?'parlay':'prop',status:bet.status,result:bet.result,game_time:bet.game_start,legs};
    const finalResult=await gradePublicRecord(record,env,statsCache,signal);
    const observed=finalResult||record.provisionalResult;
    if(!observed)continue;
    const stable=bet.status==='provisional'&&bet.result===observed&&Date.now()-Date.parse(bet.updated_at||0)>=5*60000;
    const status=finalResult&&stable?'final':'provisional';
    const profit=observed==='won'?bet.potential_payout_cents-bet.stake_cents:observed==='lost'?-bet.stake_cents:0;
    const now=new Date().toISOString(),statements=[];
    statements.push(env.DB.prepare('UPDATE user_bets SET status=?,result=?,profit_loss_cents=?,graded_at=?,updated_at=? WHERE id=? AND auth_user_id=?').bind(status,observed,profit,status==='final'?now:null,now,bet.id,authUserId));
    for(let index=0;index<record.gradedLegs.length;index++){
      const leg=record.gradedLegs[index];
      statements.push(env.DB.prepare('UPDATE user_bet_legs SET result=?,actual_value=?,grading_note=? WHERE bet_id=? AND auth_user_id=? AND ordinal=?').bind(leg.result||'pending',leg.actualValue==null?null:String(leg.actualValue),leg.pendingReason||null,bet.id,authUserId,index+1));
    }
    await env.DB.batch(statements);
  }
}

async function accountApi(request,env,ctx){
  if(!env.DB)return accountJson({success:false,error:'Account storage is temporarily unavailable.'},503);
  if(!accountOriginAllowed(request))return accountJson({success:false,error:'Cross-site account requests are not allowed.'},403);
  const user=await accountUser(request);
  if(!user)return accountJson({success:false,error:'Please sign in to continue.'},401);
  const profile=await ensureAccountProfile(user,env),url=new URL(request.url),method=request.method;

  if(url.pathname==='/api/me'){
    if(method==='GET')return accountJson({success:true,profile});
    if(method==='PATCH'){
      try{
        const body=await accountBody(request,4000),displayName=accountText(body.displayName,80);
        if(displayName.length<2)return accountJson({success:false,error:'Enter a name with at least 2 characters.'},400);
        await env.DB.prepare('UPDATE user_profiles SET display_name=?,updated_at=? WHERE auth_user_id=?').bind(displayName,new Date().toISOString(),user.id).run();
        return accountJson({success:true,profile:{...profile,display_name:displayName}});
      }catch{return accountJson({success:false,error:'Your profile could not be saved.'},400)}
    }
    return accountJson({success:false,error:'Method not allowed.'},405,{allow:'GET, PATCH'});
  }

  if(url.pathname==='/api/me/preferences'){
    if(method==='GET'){
      const row=await env.DB.prepare('SELECT preferences_json,updated_at FROM user_preferences WHERE auth_user_id=?').bind(user.id).first();
      let preferences={};try{preferences=JSON.parse(row?.preferences_json||'{}')}catch{}
      return accountJson({success:true,preferences,updatedAt:row?.updated_at||null});
    }
    if(method==='PUT'){
      try{
        const body=await accountBody(request,30000),preferences=body.preferences;
        if(!preferences||typeof preferences!=='object'||Array.isArray(preferences))throw new Error('Invalid preferences');
        const encoded=JSON.stringify(preferences);if(encoded.length>20000)throw new Error('Preferences too large');
        const now=new Date().toISOString();
        await env.DB.prepare('INSERT INTO user_preferences (auth_user_id,preferences_json,created_at,updated_at) VALUES (?,?,?,?) ON CONFLICT(auth_user_id) DO UPDATE SET preferences_json=excluded.preferences_json,updated_at=excluded.updated_at').bind(user.id,encoded,now,now).run();
        return accountJson({success:true,updatedAt:now});
      }catch{return accountJson({success:false,error:'Your settings could not be saved.'},400)}
    }
    return accountJson({success:false,error:'Method not allowed.'},405);
  }

  if(url.pathname==='/api/me/saved'){
    if(method==='GET'){
      const rows=await env.DB.prepare('SELECT id,item_type,fingerprint,snapshot_json,created_at FROM user_saved_items WHERE auth_user_id=? ORDER BY created_at DESC LIMIT 500').bind(user.id).all();
      return accountJson({success:true,items:(rows.results||[]).map(row=>{let snapshot={};try{snapshot=JSON.parse(row.snapshot_json)}catch{}return{...row,snapshot}})});
    }
    if(method==='PUT'){
      try{
        const body=await accountBody(request,250000),items=body.items;
        if(!Array.isArray(items)||items.length>500)throw new Error('Invalid saved items');
        const now=new Date().toISOString(),statements=[env.DB.prepare('DELETE FROM user_saved_items WHERE auth_user_id=?').bind(user.id)];
        for(const item of items){
          const fingerprint=accountText(item.fingerprint,240),snapshot=JSON.stringify(item.snapshot||{});
          if(fingerprint.length<8||snapshot.length>8000)continue;
          statements.push(env.DB.prepare("INSERT OR IGNORE INTO user_saved_items (id,auth_user_id,item_type,fingerprint,snapshot_json,created_at) VALUES (?,?,?,?,?,?)").bind(crypto.randomUUID(),user.id,item.itemType==='parlay'?'parlay':'prop',fingerprint,snapshot,now));
        }
        await env.DB.batch(statements);return accountJson({success:true,count:statements.length-1});
      }catch{return accountJson({success:false,error:'Saved picks could not be synced.'},400)}
    }
    return accountJson({success:false,error:'Method not allowed.'},405);
  }

  if(url.pathname==='/api/me/bets'){
    if(method==='GET'){
      await settleUserRecords(env,user.id).catch(error=>console.warn('user_settlement_failed',error.message));
      const [bets,legs]=await Promise.all([
        env.DB.prepare('SELECT * FROM user_bets WHERE auth_user_id=? ORDER BY created_at DESC LIMIT 250').bind(user.id).all(),
        env.DB.prepare('SELECT * FROM user_bet_legs WHERE auth_user_id=? ORDER BY created_at DESC,ordinal ASC LIMIT 2500').bind(user.id).all(),
      ]);
      const byBet=new Map();for(const leg of legs.results||[]){if(!byBet.has(leg.bet_id))byBet.set(leg.bet_id,[]);byBet.get(leg.bet_id).push(leg)}
      return accountJson({success:true,bets:(bets.results||[]).map(bet=>({...bet,legs:byBet.get(bet.id)||[]}))});
    }
    if(method==='POST'){
      try{
        const body=await accountBody(request,120000),rawLegs=body.legs;
        if(!Array.isArray(rawLegs)||!rawLegs.length||rawLegs.length>10)throw new Error('Choose 1–10 picks.');
        const legs=rawLegs.map((leg,index)=>{
          const odds=Math.round(accountNumber(leg.odds)||0),line=accountNumber(leg.line),gameStart=accountIso(leg.gameStart||leg.startsAt);
          if(!accountText(leg.player,100)||!accountText(leg.market,100)||Math.abs(odds)<100||Math.abs(odds)>100000)throw new Error('A selected line is invalid.');
          return{ordinal:index+1,eventId:accountText(leg.eventId||leg.eventID,160),player:accountText(leg.player,100),team:accountText(leg.team,160),opponent:accountText(leg.opponent,100),market:accountText(leg.market,100),side:accountSide(leg.side),line,odds,gameStart,snapshot:leg};
        });
        const wagerCents=accountMoneyCents(body.wager),decimal=legs.reduce((product,leg)=>product*accountDecimal(leg.odds),1),americanOdds=accountAmerican(decimal),payoutCents=Math.round(wagerCents*decimal),starts=legs.map(leg=>leg.gameStart).filter(Boolean).sort(),gameStart=starts[0]||null;
        if(wagerCents<=0)throw new Error('Enter a wager greater than $0.');
        const id=crypto.randomUUID(),now=new Date().toISOString(),source=body.source==='imported'?'imported':'board',verification=source==='imported'?'imported':'timestamped',title=legs.length===1?`${legs[0].player} · ${legs[0].market}`:`${legs.length}-leg parlay`;
        const statements=[env.DB.prepare("INSERT INTO user_bets (id,auth_user_id,bet_type,source,title,sportsbook,stake_cents,american_odds,potential_payout_cents,game_start,status,result,verification_status,snapshot_json,locked_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?, 'pending','pending',?,?,?,?,?)").bind(id,user.id,legs.length===1?'single':'parlay',source,title,accountText(body.sportsbook,80)||null,wagerCents,americanOdds,payoutCents,gameStart,verification,JSON.stringify({clientCombinedOdds:body.combinedOdds||null}),gameStart&&Date.parse(gameStart)<=Date.now()?now:null,now,now)];
        for(const leg of legs)statements.push(env.DB.prepare("INSERT INTO user_bet_legs (id,bet_id,auth_user_id,ordinal,event_id,player,team,opponent,market,side,line,american_odds,game_start,result,snapshot_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'pending',?,?)").bind(crypto.randomUUID(),id,user.id,leg.ordinal,leg.eventId||null,leg.player,leg.team||null,leg.opponent||null,leg.market,leg.side,leg.line==null?null:String(leg.line),leg.odds,leg.gameStart,JSON.stringify(leg.snapshot).slice(0,8000),now));
        await env.DB.batch(statements);
        return accountJson({success:true,bet:{id,title,betType:legs.length===1?'single':'parlay',americanOdds,potentialPayout:payoutCents/100,createdAt:now}},201);
      }catch(error){return accountJson({success:false,error:error?.message||'This bet could not be tracked.'},400)}
    }
    if(method==='DELETE'){
      const id=accountText(url.searchParams.get('id'),80);
      const bet=await env.DB.prepare('SELECT id,game_start FROM user_bets WHERE id=? AND auth_user_id=?').bind(id,user.id).first();
      if(!bet)return accountJson({success:false,error:'Tracked bet not found.'},404);
      if(bet.game_start&&Date.parse(bet.game_start)<=Date.now())return accountJson({success:false,error:'A tracked bet is locked once its first game begins.'},409);
      await env.DB.prepare('DELETE FROM user_bets WHERE id=? AND auth_user_id=?').bind(id,user.id).run();
      return accountJson({success:true});
    }
    return accountJson({success:false,error:'Method not allowed.'},405);
  }

  return accountJson({success:false,error:'Not found.'},404);
}
