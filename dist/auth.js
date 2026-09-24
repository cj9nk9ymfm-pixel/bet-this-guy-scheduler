(function(){
const SUPABASE_URL='https://dtypbfxmponfrwtprnca.supabase.co';
const SUPABASE_KEY='sb_publishable_SRVkae5U7sfu1sgRHB2UFQ_AroKYMPj';
const SESSION_KEY='btg-secure-session';
// Google and Apple sign-in are hidden until their Supabase providers are set up.
// Set to true to show the "Continue with Google/Apple" buttons again.
const SOCIAL_SIGN_IN=false;
// The 218 KB Supabase library loads only when needed: right away for visitors
// with a saved session or returning from an email/OAuth link, otherwise when
// the account dialog opens. index.html keeps its fingerprinted URL in an inert
// <template> so it is not downloaded up front.
let client=null,clientLoading=null;
const authLinkInUrl=()=>{const query=new URLSearchParams(location.search);return query.has('code')||query.has('auth')||query.has('error_description')||/access_token=|error_description=|type=recovery/.test(location.hash)};
const hasSavedSession=()=>{try{for(let i=0;i<localStorage.length;i++)if(String(localStorage.key(i)).startsWith(SESSION_KEY))return true}catch{}return false};
function loadClient(){
  if(client)return Promise.resolve(client);
  if(clientLoading)return clientLoading;
  clientLoading=new Promise((resolve,reject)=>{
    const create=()=>{client=window.supabase?.createClient?.(SUPABASE_URL,SUPABASE_KEY,{auth:{flowType:'pkce',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:SESSION_KEY}});if(!client)return reject(new Error('Sign-in is unavailable right now.'));watchSession(client);resolve(client)};
    if(window.supabase)return create();
    const script=document.createElement('script');
    script.src=document.querySelector('#supabaseScript')?.content?.querySelector('script')?.getAttribute('src')||'/supabase.js';
    script.onload=create;script.onerror=()=>reject(new Error('Sign-in could not load. Check your connection and try again.'));
    document.head.append(script);
  }).catch(error=>{clientLoading=null;throw error});
  return clientLoading;
}
const auth=async()=>(await loadClient()).auth;
function watchSession(next){
  next.auth.onAuthStateChange((event,value)=>{if(event==='PASSWORD_RECOVERY')setTimeout(()=>{session=value;open('reset')},0);else setTimeout(()=>handleSession(value),0)});
  next.auth.getSession().then(({data})=>handleSession(data.session));
}
let session=null,profile=null,bets=[],accountMessage='';
const $=selector=>document.querySelector(selector);
const money=cents=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format((Number(cents)||0)/100);
const odds=value=>Number(value)>0?`+${Math.round(value)}`:`${Math.round(value)}`;
const escape=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const signedIn=()=>Boolean(session?.access_token);
const dialog=()=>$('#accountDialog');

function setStatus(message,type=''){
  const host=$('#authStatus');if(!host)return;host.textContent=message||'';host.className=`auth-status ${type}`.trim();host.hidden=!message;
}
function setBusy(form,busy){const button=form?.querySelector('button[type="submit"]');if(button){button.disabled=busy;button.dataset.label||=button.textContent;button.textContent=busy?'Please wait…':button.dataset.label}}
function friendly(error){
  const message=String(error?.message||error||'Something went wrong.');
  if(/invalid login credentials/i.test(message))return'That email and password do not match.';
  if(/email not confirmed/i.test(message))return'Check your email and confirm your account before signing in.';
  if(/already registered|already been registered/i.test(message))return'An account already exists for that email. Try signing in or reset your password.';
  if(/provider is not enabled/i.test(message))return'This sign-in option is still being connected. Use email for now.';
  if(/rate limit/i.test(message))return'Too many attempts. Wait a few minutes and try again.';
  return message;
}
function show(view){
  document.querySelectorAll('[data-auth-view]').forEach(section=>section.hidden=section.dataset.authView!==view);
  setStatus(accountMessage);accountMessage='';
  if(view==='account')renderAccount();
  if(view==='record')refreshBets();
}
async function open(view){
  if(!client){try{await loadClient()}catch(error){show('login');setStatus(error.message,'error');if(!dialog().open)dialog().showModal();return}}
  const target=view||(signedIn()?'account':'login');
  show(target);if(!dialog().open)dialog().showModal();
}
async function api(path,options={}){
  if(!signedIn())throw new Error('Please sign in to continue.');
  const headers={...(options.body?{'content-type':'application/json'}:{}),authorization:`Bearer ${session.access_token}`,...options.headers};
  const response=await fetch(path,{...options,headers});
  const body=await response.json().catch(()=>({}));
  if(response.status===401){await (await auth()).signOut();throw new Error('Your session expired. Please sign in again.');}
  if(!response.ok)throw new Error(body.error||'The request could not be completed.');
  return body;
}
async function loadAccount(){
  if(!signedIn())return;
  const [account,settings,saved]=await Promise.all([api('/api/me'),api('/api/me/preferences'),api('/api/me/saved')]);
  profile=account.profile;
  if(settings.preferences&&Object.keys(settings.preferences).length)window.dispatchEvent(new CustomEvent('btg:preferences-loaded',{detail:settings.preferences}));
  else{
    try{const local=JSON.parse(localStorage.getItem('bet-this-guy-preferences')||'{}');if(Object.keys(local).length)await savePreferences(local)}catch{}
  }
  const fingerprints=(saved.items||[]).filter(item=>item.item_type==='prop').map(item=>item.fingerprint);
  if(fingerprints.length)window.dispatchEvent(new CustomEvent('btg:saved-loaded',{detail:fingerprints}));
  updateButton();renderAccount();
}
function updateButton(){
  const button=$('#accountBtn');if(!button)return;
  button.classList.toggle('signed-in',signedIn());
  button.querySelector('span').textContent=signedIn()?(profile?.display_name?.split(/\s+/)[0]||'Account'):'Sign in';
  button.setAttribute('aria-label',signedIn()?'Open your account':'Sign in or create an account');
}
function renderAccount(){
  if(!signedIn()||!$('#accountEmail'))return;
  $('#accountName').textContent=profile?.display_name||session.user?.user_metadata?.full_name||'Your account';
  $('#accountEmail').textContent=session.user?.email||profile?.email||'';
  $('#accountPlan').textContent=(profile?.plan||'free').toUpperCase();
  const legacy=legacyRecords();$('#importLegacyBets').hidden=!legacy.length;$('#importLegacyBets').textContent=legacy.length?`Import ${legacy.length} pick${legacy.length===1?'':'s'} saved on this device`:'';
}
function legacyRecords(){try{const items=JSON.parse(localStorage.getItem('bet-this-guy-tracked')||'[]');return Array.isArray(items)?items:[]}catch{return[]}}
async function savePreferences(preferences){if(!signedIn())return false;await api('/api/me/preferences',{method:'PUT',body:JSON.stringify({preferences})});return true}
async function syncSavedProps(keys,props){
  if(!signedIn())return false;
  const byKey=new Map((props||[]).map(prop=>[JSON.stringify([prop?.eventID,prop?.player,prop?.market,prop?.line]),prop]));
  const items=(keys||[]).slice(0,500).map(fingerprint=>{const prop=byKey.get(fingerprint);return{itemType:'prop',fingerprint,snapshot:prop?{eventID:prop.eventID,player:prop.player,market:prop.market,line:prop.line,side:prop.side,startsAt:prop.startsAt,team:prop.team}:{}}});
  await api('/api/me/saved',{method:'PUT',body:JSON.stringify({items})});return true;
}
async function trackParlay(input){
  if(!signedIn()){accountMessage='Create a free account to save this pick and track the result automatically.';open('signup');return null}
  return api('/api/me/bets',{method:'POST',body:JSON.stringify(input)});
}
async function refreshBets(){
  if(!signedIn())return;
  const host=$('#recordList');if(host)host.innerHTML='<div class="auth-record-loading">Checking your results…</div>';
  try{const result=await api('/api/me/bets');bets=result.bets||[];renderRecord();renderTrackingPanel()}catch(error){setStatus(friendly(error),'error')}
}
function recordMetrics(){
  const final=bets.filter(item=>item.status==='final'),wins=final.filter(item=>item.result==='won'||item.result==='win').length,losses=final.filter(item=>item.result==='lost'||item.result==='loss').length,pushes=final.filter(item=>item.result==='push').length,pending=bets.length-final.length,net=final.reduce((sum,item)=>sum+(Number(item.profit_loss_cents)||0),0),risked=final.reduce((sum,item)=>sum+(Number(item.stake_cents)||0),0);
  return{wins,losses,pushes,pending,net,roi:risked?net/risked*100:0};
}
function resultLabel(bet){if(bet.status==='pending')return'Pending';if(bet.status==='provisional')return`${bet.result==='won'?'Win':bet.result==='lost'?'Loss':bet.result} · provisional`;return bet.result==='won'?'Win':bet.result==='lost'?'Loss':bet.result[0]?.toUpperCase()+bet.result.slice(1)}
function renderRecord(){
  const metrics=recordMetrics(),summary=$('#recordSummary'),list=$('#recordList');if(!summary||!list)return;
  summary.innerHTML=`<div><small>Final record</small><strong>${metrics.wins}–${metrics.losses}–${metrics.pushes}</strong></div><div><small>Net</small><strong class="${metrics.net>0?'positive':metrics.net<0?'negative':''}">${metrics.net>0?'+':''}${money(metrics.net)}</strong></div><div><small>ROI</small><strong class="${metrics.roi>0?'positive':metrics.roi<0?'negative':''}">${metrics.roi>0?'+':''}${metrics.roi.toFixed(1)}%</strong></div><div><small>Pending</small><strong>${metrics.pending}</strong></div>`;
  if(!bets.length){list.innerHTML='<div class="auth-empty"><strong>No tracked picks yet</strong><span>Add a prop or parlay from the bet slip and it will appear here.</span></div>';return}
  list.innerHTML=bets.map(bet=>{const result=resultLabel(bet),resultClass=/^Win/i.test(result)?'win':/^Loss/i.test(result)?'loss':'pending',kickoff=bet.game_start?new Date(bet.game_start):null,canDelete=kickoff&&kickoff>Date.now()&&bet.status==='pending';return`<article class="auth-record-row"><div><span class="auth-result ${resultClass}">${escape(result)}</span><strong>${escape(bet.title||`${bet.bet_type} bet`)}</strong><small>${escape(new Date(bet.created_at).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}))} · ${money(bet.stake_cents)} at ${odds(bet.american_odds)}</small></div><div><b>${bet.profit_loss_cents==null?'—':`${Number(bet.profit_loss_cents)>0?'+':''}${money(bet.profit_loss_cents)}`}</b>${canDelete?`<button data-delete-bet="${escape(bet.id)}">Remove</button>`:''}</div></article>`}).join('');
  list.querySelectorAll('[data-delete-bet]').forEach(button=>button.onclick=async()=>{button.disabled=true;try{await api(`/api/me/bets?id=${encodeURIComponent(button.dataset.deleteBet)}`,{method:'DELETE'});await refreshBets()}catch(error){setStatus(friendly(error),'error');button.disabled=false}});
}
function renderTrackingPanel(){
  const summary=$('#trackingSummary'),list=$('#trackedList');if(!summary||!list||!signedIn())return false;
  const metrics=recordMetrics();summary.innerHTML=`<div><small>Final record</small><strong>${metrics.wins}–${metrics.losses}–${metrics.pushes}</strong></div><div><small>Pending</small><strong>${metrics.pending}</strong></div><div><small>Net</small><strong class="${metrics.net>0?'positive':metrics.net<0?'negative':''}">${metrics.net>0?'+':''}${money(metrics.net)}</strong></div><div><small>ROI</small><strong>${metrics.roi.toFixed(1)}%</strong></div>`;
  list.innerHTML=bets.slice(0,8).map(bet=>`<div class="tracked-item"><div><strong>${escape(bet.title||'Tracked pick')}</strong><span>${escape(resultLabel(bet))} · ${money(bet.stake_cents)} · ${odds(bet.american_odds)}</span></div></div>`).join('')||'<div class="auth-empty"><strong>No tracked picks yet</strong><span>Track a pick from your bet slip to start your record.</span></div>';
  $('#clearTracking').hidden=true;return true;
}
async function importLegacy(){
  const items=legacyRecords();if(!items.length)return;
  const button=$('#importLegacyBets');button.disabled=true;let imported=0;
  for(const item of items){try{const legs=(item.liveLegs||[]).map(leg=>({...leg,gameStart:leg.startsAt,odds:leg.odds}));if(!legs.length)continue;await trackParlay({legs,wager:item.wager||10,source:'imported'});imported++}catch{}}
  if(imported){localStorage.removeItem('bet-this-guy-tracked');accountMessage=`Imported ${imported} saved pick${imported===1?'':'s'}.`;await refreshBets();renderAccount();setStatus(accountMessage,'success');accountMessage=''}else setStatus('Those older picks could not be imported.','error');button.disabled=false;
}
async function handleSession(next){session=next;profile=null;updateButton();if(session){await loadAccount().catch(error=>setStatus(friendly(error),'error'))}else{bets=[];if(dialog()?.open)show('login')}}

async function submitLogin(event){event.preventDefault();const form=event.currentTarget;setBusy(form,true);setStatus('');const data=new FormData(form);try{const{error}=await (await auth()).signInWithPassword({email:String(data.get('email')).trim(),password:String(data.get('password'))});if(error)throw error;accountMessage='Welcome back.';show('account')}catch(error){setStatus(friendly(error),'error')}finally{setBusy(form,false)}}
async function submitSignup(event){event.preventDefault();const form=event.currentTarget;setBusy(form,true);setStatus('');const data=new FormData(form),email=String(data.get('email')).trim(),password=String(data.get('password')),confirm=String(data.get('confirm')),name=String(data.get('name')).trim();try{if(name.length<2)throw new Error('Enter your name.');if(password.length<12||!/[a-z]/.test(password)||!/[A-Z]/.test(password)||!/[0-9]/.test(password))throw new Error('Use at least 12 characters with uppercase, lowercase, and a number.');if(password!==confirm)throw new Error('The passwords do not match.');if(!data.get('terms'))throw new Error('Agree to the Terms and Privacy Policy to create an account.');const{data:result,error}=await (await auth()).signUp({email,password,options:{data:{full_name:name},emailRedirectTo:`${location.origin}/?auth=confirmed`}});if(error)throw error;if(result.session){accountMessage='Your account is ready.';show('account')}else{show('check-email');$('#checkEmailAddress').textContent=email}}catch(error){setStatus(friendly(error),'error')}finally{setBusy(form,false)}}
async function submitForgot(event){event.preventDefault();const form=event.currentTarget;setBusy(form,true);setStatus('');const email=String(new FormData(form).get('email')).trim();try{const{error}=await (await auth()).resetPasswordForEmail(email,{redirectTo:`${location.origin}/?auth=reset`});if(error)throw error;show('check-email');$('#checkEmailAddress').textContent=email;$('#checkEmailCopy').textContent='Use the secure link in your email to choose a new password.'}catch(error){setStatus(friendly(error),'error')}finally{setBusy(form,false)}}
async function submitReset(event){event.preventDefault();const form=event.currentTarget;setBusy(form,true);setStatus('');const data=new FormData(form),password=String(data.get('password')),confirm=String(data.get('confirm'));try{if(password.length<12||!/[a-z]/.test(password)||!/[A-Z]/.test(password)||!/[0-9]/.test(password))throw new Error('Use at least 12 characters with uppercase, lowercase, and a number.');if(password!==confirm)throw new Error('The passwords do not match.');const{error}=await (await auth()).updateUser({password});if(error)throw error;accountMessage='Your password has been updated.';show('account')}catch(error){setStatus(friendly(error),'error')}finally{setBusy(form,false)}}
async function social(provider){setStatus('');const{error}=await (await auth()).signInWithOAuth({provider,options:{redirectTo:location.origin}});if(error)setStatus(friendly(error),'error')}
function init(){
  if(!SOCIAL_SIGN_IN)document.querySelectorAll('.auth-socials,.auth-divider').forEach(element=>element.style.display='none');
  $('#accountBtn').onclick=()=>open();$('#accountClose').onclick=()=>dialog().close();
  document.querySelectorAll('[data-auth-target]').forEach(button=>button.onclick=()=>show(button.dataset.authTarget));
  document.querySelectorAll('[data-auth-provider]').forEach(button=>button.onclick=()=>social(button.dataset.authProvider));
  $('#authLoginForm').onsubmit=submitLogin;$('#authSignupForm').onsubmit=submitSignup;$('#authForgotForm').onsubmit=submitForgot;$('#authResetForm').onsubmit=submitReset;
  $('#accountSignOut').onclick=async()=>{await (await auth()).signOut();dialog().close()};
  $('#openMyRecord').onclick=()=>show('record');$('#recordBack').onclick=()=>show('account');$('#importLegacyBets').onclick=importLegacy;
  if(hasSavedSession()||authLinkInUrl())loadClient().catch(error=>console.warn('auth_unavailable',error.message));
  else handleSession(null);
}
window.BTGAuth={open,isSignedIn:signedIn,savePreferences,syncSavedProps,trackParlay,refreshBets,renderTrackingPanel};
addEventListener('load',init,{once:true});
})();
