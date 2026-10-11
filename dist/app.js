const ICON_PATHS={"check": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"m8.5 12.5 2.5 2.5 4.5-5\"/>", "fair": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M8 12h8\"/>", "over": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"m9 9 6 6M15 9l-6 6\"/>", "bell": "<path d=\"M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9\"/><path d=\"M10.3 21a1.94 1.94 0 0 0 3.4 0\"/>", "lock": "<rect x=\"4\" y=\"11\" width=\"16\" height=\"10\" rx=\"2\"/><path d=\"M8 11V7a4 4 0 0 1 8 0v4\"/>", "star": "<path d=\"m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z\"/>", "sliders": "<path d=\"M20 6h-8M8 6H4M20 12h-4M12 12H4M20 18h-6M10 18H4M10 4v4M16 10v4M12 16v4\"/>", "sun": "<circle cx=\"12\" cy=\"12\" r=\"4\"/><path d=\"M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4\"/>", "search": "<circle cx=\"11\" cy=\"11\" r=\"7\"/><path d=\"m20 20-4-4\"/>", "share": "<path d=\"M4 13v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6\"/><path d=\"m16 7-4-4-4 4M12 3v13\"/>", "layers": "<path d=\"m12 3 9 5-9 5-9-5z\"/><path d=\"m3 13 9 5 9-5\"/>"};
const icon=(name,cls='ico')=>`<svg class="${cls}" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name]||''}</svg>`;
function readStored(key,fallback){try{const value=JSON.parse(localStorage.getItem(key)||'null');return value&&typeof value==='object'&&Array.isArray(value)===Array.isArray(fallback)?value:fallback}catch{return fallback}}
const demoProps=[
 {id:1,sport:'NFL',player:'Josh Allen',team:'BUF · vs MIA',market:'Passing Yards',line:271.5,open:264.5,side:'Over',over:-112,under:-108,edge:12.4,conf:82,time:'5:20 PM',note:'Projection 287.4 · pace-up matchup',trend:[264.5,266.5,268.5,271.5]},
 {id:2,sport:'NFL',player:'CeeDee Lamb',team:'DAL · @ NYG',market:'Receiving Yards',line:82.5,open:88.5,side:'Under',over:104,under:-124,edge:11.1,conf:79,time:'Thu 5:15 PM',note:'Target share down in current model',trend:[88.5,87.5,84.5,82.5]},
 {id:3,sport:'MLB',player:'Logan Webb',team:'SF · vs ARI',market:'Strikeouts',line:5.5,open:4.5,side:'Over',over:105,under:-125,edge:10.6,conf:77,time:'6:45 PM',note:'Opponent K rate supports the over',trend:[4.5,4.5,5,5.5]},
 {id:4,sport:'NBA',player:'Stephen Curry',team:'GSW · vs LAL',market:'Points',line:28.5,open:27.5,side:'Over',over:-118,under:-102,edge:9.8,conf:74,time:'7:00 PM',note:'Projection 31.2 · usage advantage',trend:[27.5,27.5,28,28.5]},
 {id:5,sport:'NBA',player:'Domantas Sabonis',team:'SAC · vs PHX',market:'Rebounds',line:13.5,open:14.5,side:'Under',over:-105,under:-115,edge:8.9,conf:71,time:'7:00 PM',note:'Reduced rebound chances in matchup sim',trend:[14.5,14.5,14,13.5]},
 {id:6,sport:'NHL',player:'Connor McDavid',team:'EDM · @ VAN',market:'Shots',line:3.5,open:3.5,side:'Over',over:115,under:-135,edge:8.2,conf:69,time:'7:30 PM',note:'Price moved while line held',trend:[3.5,3.5,3.5,3.5]},
 {id:7,sport:'NFL',player:'Christian McCaffrey',team:'SF · @ SEA',market:'Receiving Yards',line:36.5,open:32.5,side:'Over',over:-110,under:-110,edge:7.6,conf:68,time:'Sun 1:05 PM',note:'Route share projects above baseline',trend:[32.5,34.5,35.5,36.5]},
 {id:8,sport:'NBA',player:'Jayson Tatum',team:'BOS · @ NYK',market:'Assists',line:5.5,open:6.5,side:'Under',over:-120,under:100,edge:7.2,conf:66,time:'4:30 PM',note:'Potential assists trending lower',trend:[6.5,6.5,5.5,5.5]},
 {id:9,sport:'MLB',player:'Aaron Judge',team:'NYY · @ BOS',market:'Total Bases',line:1.5,open:1.5,side:'Over',over:-130,under:110,edge:4.6,conf:57,time:'4:10 PM',note:'Strong platoon split, but the price is expensive',trend:[1.5,1.5,1.5,1.5]},
 {id:10,sport:'NHL',player:'Auston Matthews',team:'TOR · vs OTT',market:'Shots',line:4.5,open:5.5,side:'Under',over:105,under:-125,edge:2.7,conf:51,time:'6:00 PM',note:'Thin edge after the market correction',trend:[5.5,5,4.5,4.5]},
 {id:11,sport:'NBA',player:'LeBron James',team:'LAL · @ GSW',market:'Assists',line:7.5,open:6.5,side:'Over',over:-108,under:-112,edge:10.2,conf:76,time:'7:00 PM',note:'Creation load projects above baseline',trend:[6.5,7,7.5,7.5]},
 {id:12,sport:'NBA',player:'Anthony Edwards',team:'MIN · vs DEN',market:'Points',line:27.5,open:28.5,side:'Under',over:-105,under:-115,edge:6.7,conf:64,time:'5:30 PM',note:'Matchup model trims scoring efficiency',trend:[28.5,28,27.5,27.5]},
 {id:13,sport:'NFL',player:'Lamar Jackson',team:'BAL · @ CIN',market:'Rushing Yards',line:52.5,open:48.5,side:'Over',over:-110,under:-110,edge:9.3,conf:73,time:'Sun 10:00 AM',note:'Designed-run share remains elevated',trend:[48.5,49.5,51.5,52.5]},
 {id:14,sport:'NFL',player:'Justin Jefferson',team:'MIN · vs GB',market:'Receiving Yards',line:91.5,open:94.5,side:'Under',over:100,under:-120,edge:6.4,conf:63,time:'Sun 1:25 PM',note:'Coverage matchup creates a lower median',trend:[94.5,93.5,92.5,91.5]},
 {id:15,sport:'MLB',player:'Shohei Ohtani',team:'LAD · vs SD',market:'Total Bases',line:2.5,open:1.5,side:'Over',over:120,under:-140,edge:9.1,conf:72,time:'7:10 PM',note:'Power matchup drives the ceiling',trend:[1.5,2,2.5,2.5]},
 {id:16,sport:'MLB',player:'Blake Snell',team:'LAD · @ SF',market:'Strikeouts',line:6.5,open:7.5,side:'Under',over:-105,under:-115,edge:6.2,conf:62,time:'6:45 PM',note:'Pitch-count projection limits upside',trend:[7.5,7,6.5,6.5]},
 {id:17,sport:'NHL',player:'Nathan MacKinnon',team:'COL · vs DAL',market:'Points',line:1.5,open:1.5,side:'Over',over:105,under:-125,edge:8.4,conf:69,time:'6:30 PM',note:'Top-line matchup supports multi-point upside',trend:[1.5,1.5,1.5,1.5]},
 {id:18,sport:'NHL',player:'David Pastrnak',team:'BOS · @ NYR',market:'Shots',line:4.5,open:4.5,side:'Over',over:-105,under:-115,edge:6.5,conf:63,time:'4:00 PM',note:'Shot volume remains stable on the road',trend:[4.5,4.5,4.5,4.5]}
];
let props=[];
let movementRefreshTimer=null,movementRefreshPending=false,movementLastCheck=0,movementRefreshFailed=false;
let baseLiveProps=[];
let scheduleGames=[];
const futurePropBoards=new Map();
const eventBoardRequests=new Map();
let livePropsPromise=null,schedulePromise=null;
let feedMode='loading';
let feedUpdatedAt=null;
let feedCoverage=null;
const resumeSession=(()=>{try{const saved=JSON.parse(localStorage.getItem('btg-app-session')||'null');return saved&&Date.now()-saved.at<1800000?saved:null}catch{return null}})();
// The board's league. NBA is in beta until launch: ?nba=1 turns the NFL|NBA
// switch on for this browser and ?nba=0 turns it off. Switching league reloads
// the page, so NFL and NBA boards never share state.
const NBA_BETA=(()=>{try{const q=new URLSearchParams(location.search);if(q.get('nba')==='1')localStorage.setItem('btg-nba','1');if(q.get('nba')==='0'){localStorage.removeItem('btg-nba');localStorage.removeItem('btg-league')}return localStorage.getItem('btg-nba')==='1'}catch{return false}})();
const LEAGUE=(()=>{try{return NBA_BETA&&localStorage.getItem('btg-league')==='NBA'?'NBA':'NFL'}catch{return 'NFL'}})();
const leagueParam=(prefix='?')=>LEAGUE==='NBA'?`${prefix}sport=NBA`:'';
function switchLeague(league){try{localStorage.setItem('btg-league',league==='NBA'?'NBA':'NFL')}catch{}location.reload()}
let state={sport:LEAGUE,game:'All',team:'All',day:'All',timeSlot:'All',market:'All',side:'All',move:'All',minEdge:0,minConf:0,oddsType:'All',sort:'edge',search:'',high:false,heat:null,view:'board',boardSport:LEAGUE,boardMarket:'All',boardGame:'All',saved:new Set(readStored('propedge-saved',[]).filter(value=>typeof value==='string'&&value.startsWith('['))),slip:[]};
const initializedPages=new Set(['props']);
let mixerSetup=false,selectedPlayer='',propRenderLimit=24,visiblePropTotal=0;
if(resumeSession?.state){const saved=state.saved;state={...state,...resumeSession.state,saved,slip:Array.isArray(resumeSession.state.slip)?resumeSession.state.slip:[]}}
state.sport=LEAGUE;state.boardSport=LEAGUE;
const preferenceDefaults={books:[],favoriteSports:['NFL'],risk:'balanced',typicalWager:100,weeklyBudget:100,noWeeklyLimit:false,hideInactive:true,lineAlerts:true,shareTheme:'classic',minBookCoverage:3,maxParlayLegs:8,avoidSameGame:true,hideLongshots:true,browserAlerts:false};
// $100 is the site-wide default wager: American odds are quoted per $100, so
// "+175" reads as "win $175". Viewers still on the old $10 default move to
// $100 once; a wager chosen after that is kept.
const upgradeWagerDefault=p=>{if(!p.wagerDefault100&&Number(p.typicalWager)===10)p.typicalWager=100;p.wagerDefault100=true;return p};
function wagerStake(){return Math.max(1,Number(preferences?.typicalWager)||100)}
function wagerLabel(){return '$'+wagerStake().toLocaleString('en-US',{maximumFractionDigits:2})}
let preferences=upgradeWagerDefault({...preferenceDefaults,...readStored('bet-this-guy-preferences',{})});
try{localStorage.setItem('bet-this-guy-preferences',JSON.stringify(preferences))}catch{}
preferences.avoidSameGame=false;
preferences.maxParlayLegs=Math.max(2,Math.min(10,Number(preferences.maxParlayLegs)||8));
preferences.books=Array.isArray(preferences.books)?preferences.books:[];
let trackedParlays=readStored('bet-this-guy-tracked',[]);
const savePreferences=()=>{localStorage.setItem('bet-this-guy-preferences',JSON.stringify(preferences));return window.BTGAuth?.savePreferences(preferences)};
const saveTrackedParlays=()=>localStorage.setItem('bet-this-guy-tracked',JSON.stringify(trackedParlays));
function saveAppSession(){try{const{saved,...serialState}=state;localStorage.setItem('btg-app-session',JSON.stringify({at:Date.now(),state:serialState,mobilePage:document.body?.dataset.mobilePage||'props',wager:document.querySelector('#wager')?.value||preferences.typicalWager,scrollY:window.scrollY}));localStorage.setItem('btg-last-active',String(Date.now()))}catch{}}
const normalizeBookName=value=>{const key=String(value||'').toLowerCase().replace(/[^a-z0-9]/g,'');return key==='espnbet'?'thescorebet':key};
// Prices shown on the board come from the big five books, or the viewer's own
// books when they pick some. Every licensed book still feeds the fair price.
const BIG_FIVE_BOOKS=['DraftKings','FanDuel','BetMGM','Caesars','Fanatics'];
const shownBooks=()=>preferences.books.length?preferences.books:BIG_FIVE_BOOKS;
const bookAllowed=book=>shownBooks().some(selected=>normalizeBookName(selected)===normalizeBookName(book));
const sportsbookLinks={draftkings:'https://sportsbook.draftkings.com/',fanduel:'https://sportsbook.fanduel.com/',betmgm:'https://sports.betmgm.com/en/sports',caesars:'https://sportsbook.caesars.com/',betrivers:'https://www.betrivers.com/',thescorebet:'https://thescore.bet/',fanatics:'https://sportsbook.fanatics.com/',bet365:'https://www.bet365.com/',hardrockbet:'https://www.hardrock.bet/'};
const sportsbookDestination=book=>sportsbookLinks[normalizeBookName(book)]||null;
const betHandoffText=p=>`${p.player} — ${p.market}, ${p.side} ${p.line} (${formatOdds(recommendedOdds(p))})`;
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const americanToDecimal=o=>o>0?1+o/100:1+100/Math.abs(o);
const formatOdds=o=>o!==null&&o!==undefined&&Number.isFinite(Number(o))?(o>0?`+${o}`:`${o}`):'—';
const formatOddsPretty=o=>o>0?`+${Math.round(o)}`:`${Math.round(o)}`;
const formatMoney=n=>`$${n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const propIdentity=p=>`${p.eventID||'demo'}|${p.player}|${p.market}|${p.line}|${p.side}`;
function savedPropKey(p){return JSON.stringify([p?.eventID,p?.player,p?.market,p?.line])}
function slipSelectionKey(p,side){return JSON.stringify([savedPropKey(p),side])}
let firePropKeys=new Set();
function calibrateFirePool(){const limit=Math.min(4,Math.max(1,Math.ceil(props.length/150))),sportCounts=new Map(),chosen=[];for(const p of [...props].filter(p=>p.edge>=4.5&&p.bookCount>=Math.max(3,preferences.minBookCoverage)&&!p.oneSided).sort((a,b)=>b.edge-a.edge||b.conf-a.conf)){const count=sportCounts.get(p.sport)||0;if(count>=2)continue;sportCounts.set(p.sport,count+1);chosen.push(propIdentity(p));if(chosen.length>=limit)break}firePropKeys=new Set(chosen)}
const getTier=(edge,p)=>p&&firePropKeys.has(propIdentity(p))?{key:'inferno',icon:'▲',label:'Top edge',quip:'One of the strongest verified multi-book edges on the current board'}:edge>=3.5?{key:'hot',icon:'▲',label:'Strong edge',quip:'A strong price edge, just below the board’s top tier'}:edge>=2?{key:'warm',icon:'●',label:'Moderate edge',quip:'Worth a look, but shop for the best line'}:edge>=1?{key:'chilly',icon:'●',label:'Small edge',quip:'A smaller edge. Proceed carefully.'}:{key:'ice',icon:'○',label:'No edge',quip:'Pass for now. The price is not there.'};
const parlaySections=[
 {name:'Long shot',history:'moonshot',subtitle:'+2501 to +15000 · highest payout, highest risk',tag:'LONG SHOT',minLegs:4,maxLegs:7,minEdge:3,minOdds:2501,maxOdds:15000,blurb:'A bold but more selective swing using solid-rated props and a manageable number of legs.'},
 {name:'Mid-range',history:'swing',subtitle:'+1000 to +2500 · moderate risk',tag:'MID-RANGE',minLegs:3,maxLegs:6,minEdge:3,minOdds:1000,maxOdds:2500,blurb:'A middle-ground payout with a limited number of legs.'},
 {name:'Conservative',history:'reasonable',subtitle:'+100 to +999 · lower risk',tag:'CONSERVATIVE',minLegs:2,maxLegs:4,minEdge:4,minOdds:100,maxOdds:999,blurb:'A shorter, more realistic combination using stronger-rated props.'}
];
const parlayFeeds=parlaySections.map(()=>[]);
const parlaySignatures=parlaySections.map(()=>new Set());
const parlayRecentLegs=parlaySections.map(()=>new Set());
const parlayExposure=new Map();
let parlaySerial=0;
let activeParlaySection=2;
const decimalToAmerican=dec=>dec>=2?Math.round((dec-1)*100):Math.round(-100/(dec-1));
let mixerSelection=null,mixerComboKey='',mixerOptionCount=0;
const mixerSeenKeys=new Set();
let mixerLastLegs=new Set();
const mixerExposure=new Map();
const mixerCandidateCache=new Map();
const mixerPropExposure=new Map();
let mixerHistoryScope='',mixerPreviousSelection=null,mixerNotice='';
const teamParts=p=>p.team.split(/\s+·\s+(?:vs|@)\s+/);
const gameName=p=>{const [team,opponent]=teamParts(p);return `${team} ${p.team.includes('· @')?'@':'vs'} ${opponent}`};
const localDateKey=value=>{const date=new Date(value);if(Number.isNaN(date.getTime()))return null;return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`};
const fallbackWeekday=value=>{const match=String(value||'').match(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)\b/i);return match?`weekday:${titleCase(match[1])}`:null};
const propDay=p=>p.startsAt?localDateKey(p.startsAt):(p.day||fallbackWeekday(p.time));
const scheduleDay=game=>localDateKey(game.status?.startsAt);
const dayLabel=value=>{if(value.startsWith('weekday:'))return value.slice(8);const date=new Date(`${value}T12:00:00`),today=new Date(),tomorrow=new Date();tomorrow.setDate(today.getDate()+1);const prefix=value===localDateKey(today)?'Today · ':value===localDateKey(tomorrow)?'Tomorrow · ':'';return prefix+date.toLocaleDateString([],{weekday:'short',month:'short',day:'numeric'})};
const movementName=p=>p.line>p.open?'Up':p.line<p.open?'Down':'Hold';
const timeSlot=p=>{const match=p.time.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);if(!match)return'All';let hour=+match[1]%12+(match[3].toUpperCase()==='PM'?12:0);return hour<12?'Morning':hour<17?'Afternoon':hour<21?'Evening':'Late'};
const recommendedOdds=p=>p.side==='Over'?p.over:p.under;
const oddsType=p=>recommendedOdds(p)>0?'Plus':recommendedOdds(p)<=-120?'Heavy':'Standard';
const americanProbability=odds=>odds>0?100/(odds+100):Math.abs(odds)/(Math.abs(odds)+100);
const titleCase=value=>String(value||'Prop').replace(/([a-z])([A-Z])/g,'$1 $2').replace(/_/g,' ').toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());
const escapeRegExp=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const marketLabels={points:'Points',rebounds:'Rebounds',assists:'Assists',passingYards:'Passing Yards',rushingYards:'Rushing Yards',receivingYards:'Receiving Yards',receptions:'Receptions',strikeouts:'Strikeouts',totalBases:'Total Bases',hits:'Hits',homeRuns:'Home Runs',shotsOnGoal:'Shots on Goal',shots:'Shots',saves:'Saves',goals:'Goals',blocks:'Blocks',steals:'Steals',threePointersMade:'3-Pointers Made',player_pass_yds:'Passing Yards',player_pass_tds:'Passing Touchdowns',player_pass_completions:'Pass Completions',player_pass_attempts:'Pass Attempts',player_pass_interceptions:'Interceptions Thrown',player_pass_longest_completion:'Longest Pass Completion',player_pass_rush_yds:'Passing + Rushing Yards',player_pass_rush_reception_tds:'Pass + Rush + Receiving TDs',player_pass_rush_reception_yds:'Pass + Rush + Receiving Yards',player_rush_yds:'Rushing Yards',player_rush_attempts:'Rush Attempts',player_rush_longest:'Longest Rush',player_rush_tds:'Rushing Touchdowns',player_receptions:'Receptions',player_reception_yds:'Receiving Yards',player_reception_longest:'Longest Reception',player_reception_tds:'Receiving Touchdowns',player_rush_reception_yds:'Rush + Receiving Yards',player_rush_reception_tds:'Rush + Receiving Touchdowns',player_kicking_points:'Kicking Points',player_field_goals:'Field Goals',player_pats:'Extra Points',player_sacks:'Sacks',player_solo_tackles:'Solo Tackles',player_tackles_assists:'Tackles + Assists',player_defensive_interceptions:'Defensive Interceptions',player_tds:'Touchdowns',player_points:'Points',player_rebounds:'Rebounds',player_assists:'Assists',player_threes:'3-Pointers Made',player_blocks:'Blocks',player_steals:'Steals',player_blocks_steals:'Blocks + Steals',player_turnovers:'Turnovers',player_points_rebounds_assists:'Points + Rebounds + Assists',player_points_rebounds:'Points + Rebounds',player_points_assists:'Points + Assists',player_rebounds_assists:'Rebounds + Assists',player_field_goals:'Field Goals Made',player_frees_made:'Free Throws Made',player_frees_attempts:'Free Throws Attempted',batter_hits:'Hits',batter_total_bases:'Total Bases',batter_home_runs:'Home Runs',batter_rbis:'RBIs',batter_runs_scored:'Runs',batter_hits_runs_rbis:'Hits + Runs + RBIs',batter_singles:'Singles',batter_doubles:'Doubles',batter_triples:'Triples',batter_walks:'Walks',batter_strikeouts:'Batter Strikeouts',batter_stolen_bases:'Stolen Bases',pitcher_strikeouts:'Pitcher Strikeouts',pitcher_hits_allowed:'Hits Allowed',pitcher_walks:'Walks Allowed',pitcher_earned_runs:'Earned Runs',pitcher_outs:'Pitching Outs',player_power_play_points:'Power Play Points',player_blocked_shots:'Blocked Shots',player_shots_on_goal:'Shots on Goal',player_goals:'Goals',player_total_saves:'Saves'};
Object.assign(marketLabels,{player_anytime_td:'Anytime Touchdown',player_1st_td:'First Touchdown',player_last_td:'Last Touchdown',player_tds_over:'Touchdowns',player_double_double:'Double-Double',player_triple_double:'Triple-Double',player_first_basket:'First Basket',player_first_team_basket:'First Team Basket',batter_first_home_run:'First Home Run',pitcher_record_a_win:'Pitcher to Record a Win',player_goal_scorer_anytime:'Anytime Goal Scorer',player_goal_scorer_first:'First Goal Scorer',player_goal_scorer_last:'Last Goal Scorer'});
Object.assign(marketLabels,{player_pass_yds_q1:'First Quarter Passing Yards',player_assists:'Assists'});
const gameTimeFormatter=new Intl.DateTimeFormat(undefined,{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}),gameTimeLabels=new Map();
const formatGameTime=(value,live=false)=>{if(!value)return 'Date unavailable';const timestamp=new Date(value).getTime();if(!Number.isFinite(timestamp))return 'Date unavailable';const key=`${timestamp}|${live}`;if(!gameTimeLabels.has(key)){if(gameTimeLabels.size>200)gameTimeLabels.clear();gameTimeLabels.set(key,gameTimeFormatter.format(timestamp))}return gameTimeLabels.get(key)};
const refreshCachedTime=p=>{const price=recommendedOdds(p),fairChance=Number.isFinite(price)?Math.min(99,(americanProbability(price)+p.edge/100)*100):null,bookMatch=String(p.note||'').match(/(?:Best (?:at|price at)|at) ([^,]+?)(?: vs| price|$)/i);return{...p,time:p.startsAt?formatGameTime(p.startsAt,p.live):p.time,fairChance:p.fairChance||(fairChance?+fairChance.toFixed(1):null),bestBook:p.bestBook||bookMatch?.[1]||'Best available'}};
function bestBookPrice(odd,line){const entries=Object.entries(odd?.byBookmaker||{}).filter(([,book])=>book.available&&Number.isFinite(+book.odds)&&Math.abs(+book.odds)<=5000&&Number.isFinite(+book.overUnder)&&+book.overUnder===line);if(!entries.length)return null;entries.sort((a,b)=>+b[1].odds-+a[1].odds);return{odds:+entries[0][1].odds,book:titleCase(entries[0][0])}}
function playerNameFromOdd(odd,market){const id=String(odd.playerID||odd.statEntityID||'').replace(/_\d+_[A-Z0-9_]+$/,'').replace(/_/g,' ').trim();if(id)return titleCase(id);const name=odd.marketName||'';return name.replace(new RegExp(`\\s+${escapeRegExp(market)}.*$`,'i'),'').replace(/\s+Over\/Under.*$/i,'').trim()||'Player'}
function normalizeOddsApi(events){const out=[];for(const event of events){const groups=new Map();for(const bookmaker of event.bookmakers||[]){for(const market of bookmaker.markets||[]){for(const outcome of market.outcomes||[]){const side=String(outcome.name||'').toLowerCase();const line=Number(outcome.point);const player=String(outcome.description||'').trim();const price=Number(outcome.price);if(!['over','under'].includes(side)||!player||!Number.isFinite(line)||!Number.isFinite(price))continue;const key=`${player}|${market.key}|${line}`,group=groups.get(key)||{player,marketKey:market.key,line,over:[],under:[],byBook:new Map()};const offer={price,book:bookmaker.title||titleCase(bookmaker.key)};group[side].push(offer);const pair=group.byBook.get(bookmaker.key)||{};pair[side]=price;group.byBook.set(bookmaker.key,pair);groups.set(key,group)}}}for(const group of groups.values()){if(!group.over.length||!group.under.length)continue;const paired=[...group.byBook.values()].filter(pair=>Number.isFinite(pair.over)&&Number.isFinite(pair.under));if(!paired.length)continue;const fair=paired.map(pair=>{const over=americanProbability(pair.over),under=americanProbability(pair.under),total=over+under;return{over:over/total,under:under/total}}),fairOver=fair.reduce((sum,pair)=>sum+pair.over,0)/fair.length,fairUnder=fair.reduce((sum,pair)=>sum+pair.under,0)/fair.length,bestOver=group.over.sort((a,b)=>b.price-a.price)[0],bestUnder=group.under.sort((a,b)=>b.price-a.price)[0],overEdge=(fairOver-americanProbability(bestOver.price))*100,underEdge=(fairUnder-americanProbability(bestUnder.price))*100,side=overEdge>=underEdge?'Over':'Under',edge=Math.max(.2,overEdge,underEdge);if(edge>20)continue;const chosen=side==='Over'?bestOver:bestUnder,startsAt=new Date(event.commence_time),live=startsAt.getTime()<=Date.now(),market=marketLabels[group.marketKey]||titleCase(group.marketKey),confidence=Math.round(Math.min(88,52+edge*3));out.push({id:out.length+1,sport:event.sport_label||titleCase(event.sport_key),player:group.player,team:`${event.away_team||'Away'} · @ ${event.home_team||'Home'}`,market,line:group.line,open:group.line,side,over:bestOver.price,under:bestUnder.price,edge:+edge.toFixed(1),rawEdge:+Math.max(overEdge,underEdge).toFixed(2),pairedBooks:paired.length,conf:confidence,time:formatGameTime(startsAt,live),startsAt:Number.isNaN(startsAt.getTime())?null:startsAt.toISOString(),note:`Best at ${chosen.book} vs no-vig market consensus`,trend:[group.line,group.line,group.line,group.line],eventID:event.eventID||event.id,live})}}return out}
function normalizeLiveProps(payload){const events=Array.isArray(payload?.data)?payload.data:[];if(events.some(event=>Array.isArray(event?.bookmakers)))return normalizeOddsApi(events).sort((a,b)=>b.edge-a.edge).slice(0,400);const out=[];for(const event of events){const odds=event.odds||{},seen=new Set(),away=event.teams?.away?.names?.short||event.teams?.away?.names?.medium||'Away',home=event.teams?.home?.names?.short||event.teams?.home?.names?.medium||'Home';for(const odd of Object.values(odds)){if(!odd||seen.has(odd.oddID)||['all','home','away'].includes(odd.statEntityID)||odd.betTypeID!=='ou'||!['game','reg'].includes(odd.periodID)||!['over','under'].includes(odd.sideID))continue;const opposing=odds[odd.opposingOddID];if(!opposing)continue;seen.add(odd.oddID);seen.add(opposing.oddID);const over=odd.sideID==='over'?odd:opposing,under=odd.sideID==='under'?odd:opposing,line=+(over.bookOverUnder||under.bookOverUnder||over.fairOverUnder);if(!Number.isFinite(line)||+over.fairOverUnder!==line||+under.fairOverUnder!==line)continue;const overPrice=bestBookPrice(over,line),underPrice=bestBookPrice(under,line);if(!overPrice||!underPrice)continue;const overFair=Number(over.fairOdds),underFair=Number(under.fairOdds);if(!Number.isFinite(overFair)||!Number.isFinite(underFair)||Math.abs(overFair)>5000||Math.abs(underFair)>5000)continue;const overEdge=(americanProbability(overFair)-americanProbability(overPrice.odds))*100,underEdge=(americanProbability(underFair)-americanProbability(underPrice.odds))*100,side=overEdge>=underEdge?'Over':'Under',edge=Math.max(.2,overEdge,underEdge);if(edge>20)continue;const chosen=side==='Over'?overPrice:underPrice,market=marketLabels[over.statID]||titleCase(over.statID),player=playerNameFromOdd(over,market),startsAt=event.status?.startsAt?new Date(event.status.startsAt):null,time=formatGameTime(startsAt,event.status?.live),open=+(over.openBookOverUnder||under.openBookOverUnder||line),confidence=Math.round(Math.min(88,52+edge*3));out.push({id:out.length+1,sport:event.leagueID||event.sportID||'SPORT',player,team:`${away} · @ ${home}`,market,line,open:Number.isFinite(open)?open:line,side,over:overPrice.odds,under:underPrice.odds,edge:+edge.toFixed(1),conf:confidence,time,startsAt:startsAt&&!Number.isNaN(startsAt)?startsAt.toISOString():null,note:`${chosen.book} price vs fair market consensus`,trend:[Number.isFinite(open)?open:line,line,line,line],eventID:event.eventID,live:Boolean(event.status?.live)})}}const counts=new Map();return out.sort((a,b)=>b.edge-a.edge).filter(p=>{const count=counts.get(p.sport)||0;if(count>=100)return false;counts.set(p.sport,count+1);return true}).slice(0,400)}
const normalizeLivePropsBase=normalizeLiveProps;
function normalizeOneSidedHomeRuns(events){const out=[];for(const event of events){const groups=new Map();for(const bookmaker of event.bookmakers||[]){for(const market of bookmaker.markets||[]){if(market.key!=='batter_home_runs')continue;for(const outcome of market.outcomes||[]){if(String(outcome.name||'').toLowerCase()!=='over'||!outcome.description||!Number.isFinite(Number(outcome.price)))continue;const line=Number.isFinite(Number(outcome.point))?Number(outcome.point):.5,key=`${outcome.description}|${line}`,group=groups.get(key)||{player:outcome.description,line,offers:[]};group.offers.push({price:Number(outcome.price),book:bookmaker.title||titleCase(bookmaker.key)});groups.set(key,group)}}}for(const group of groups.values()){const best=[...group.offers].sort((a,b)=>b.price-a.price)[0],average=group.offers.reduce((sum,offer)=>sum+americanProbability(offer.price),0)/group.offers.length,edge=Math.max(.2,(average-americanProbability(best.price))*100),startsAt=new Date(event.commence_time),live=startsAt.getTime()<=Date.now();out.push({sport:event.sport_label||'MLB',player:group.player,team:`${event.away_team||'Away'} · @ ${event.home_team||'Home'}`,market:'Home Runs',line:group.line,open:group.line,side:'Over',over:best.price,under:null,edge:+Math.min(edge,20).toFixed(1),conf:Math.round(Math.min(82,52+edge*3)),time:formatGameTime(startsAt,live),startsAt:Number.isNaN(startsAt.getTime())?null:startsAt.toISOString(),note:`Best home run price at ${best.book}`,trend:[group.line,group.line,group.line,group.line],eventID:event.eventID||event.id,live})}}return out}
function normalizeBinaryOddsApi(events){const supported=new Set(['player_anytime_td','player_1st_td','player_last_td','player_first_basket','player_first_team_basket','player_double_double','player_triple_double','batter_first_home_run','pitcher_record_a_win','player_goal_scorer_anytime','player_goal_scorer_first','player_goal_scorer_last']),out=[];for(const event of events){const groups=new Map();for(const bookmaker of event.bookmakers||[]){for(const market of bookmaker.markets||[]){if(!supported.has(market.key))continue;for(const outcome of market.outcomes||[]){const name=String(outcome.name||'').trim(),raw=name.toLowerCase(),description=String(outcome.description||'').trim(),price=Number(outcome.price);if(!Number.isFinite(price))continue;const explicit=['yes','no'].includes(raw),player=description||(explicit?'':name);if(!player||/^(no (touchdown|goal|home run)( scorer)?|no scorer|none)$/i.test(player)||/[\s/]D\/ST$/i.test(player))continue;const side=raw==='no'?'no':'yes',key=`${player}|${market.key}`,group=groups.get(key)||{player,marketKey:market.key,yes:[],no:[]};group[side].push({price,book:bookmaker.title||titleCase(bookmaker.key)});groups.set(key,group)}}}for(const group of groups.values()){if(!group.yes.length)continue;const bestYes=[...group.yes].sort((a,b)=>b.price-a.price)[0],bestNo=group.no.length?[...group.no].sort((a,b)=>b.price-a.price)[0]:null,yesAverage=group.yes.reduce((sum,offer)=>sum+americanProbability(offer.price),0)/group.yes.length,noAverage=group.no.length?group.no.reduce((sum,offer)=>sum+americanProbability(offer.price),0)/group.no.length:0,total=yesAverage+noAverage,fairYes=total?yesAverage/total:yesAverage,fairNo=total?noAverage/total:noAverage,yesEdge=(fairYes-americanProbability(bestYes.price))*100,noEdge=bestNo?(fairNo-americanProbability(bestNo.price))*100:-1,side=noEdge>yesEdge?'Under':'Over',edge=Math.max(.2,yesEdge,noEdge),startsAt=new Date(event.commence_time),live=startsAt.getTime()<=Date.now(),scorer=/(_td|basket|home_run|goal_scorer)/.test(group.marketKey);out.push({sport:event.sport_label||titleCase(event.sport_key),player:group.player,team:`${event.away_team||'Away'} · @ ${event.home_team||'Home'}`,market:marketLabels[group.marketKey]||titleCase(group.marketKey),line:.5,open:.5,side,over:bestYes.price,under:bestNo?.price??null,overLabel:scorer?'TO SCORE':'YES',underLabel:'NO',binary:true,edge:+Math.min(edge,20).toFixed(1),conf:Math.round(Math.min(82,52+edge*3)),time:formatGameTime(startsAt,live),startsAt:Number.isNaN(startsAt.getTime())?null:startsAt.toISOString(),note:`Best price at ${(side==='Over'?bestYes:bestNo)?.book||bestYes.book}`,trend:[.5,.5,.5,.5],eventID:event.eventID||event.id,live})}}return out}
normalizeLiveProps=function(payload){const events=Array.isArray(payload?.data)?payload.data:[];if(!events.some(event=>Array.isArray(event?.bookmakers)))return normalizeLivePropsBase(payload);const standard=normalizeOddsApi(events),keys=new Set(standard.map(p=>`${p.eventID}|${p.player}|${p.market}|${p.line}`)),extras=[...normalizeOneSidedHomeRuns(events),...normalizeBinaryOddsApi(events)].filter(p=>!keys.has(`${p.eventID}|${p.player}|${p.market}|${p.line}`)),combined=[...standard,...extras].map(p=>p.binary&&p.under==null&&p.edge>8?{...p,edge:8,conf:76}:p);return combined.sort((a,b)=>b.edge-a.edge)};
const normalizeAllBooks=normalizeLiveProps;
const bookCoverageIndexes=new WeakMap();
function propBookCoverage(payload,prop){
  let index=bookCoverageIndexes.get(payload);
  if(!index){
    index=new Map();
    for(const event of payload.data||[]){
      const coverage=new Map();
      if(Array.isArray(event.bookmakers))for(const bookmaker of event.bookmakers)for(const market of bookmaker.markets||[])for(const outcome of market.outcomes||[]){
        const player=String(outcome.description||outcome.name||'').trim(),line=Number.isFinite(Number(outcome.point))?Number(outcome.point):.5,key=`${player}|${line}`,books=coverage.get(key)||new Set();
        books.add(bookmaker.key||bookmaker.title);coverage.set(key,books);
      }
      index.set(event.eventID||event.id,{event,coverage});
    }
    bookCoverageIndexes.set(payload,index);
  }
  const entry=index.get(prop.eventID);if(!entry)return 0;
  if(Array.isArray(entry.event.bookmakers))return entry.coverage.get(`${prop.player}|${prop.line}`)?.size||0;
  const books=new Set();for(const odd of Object.values(entry.event.odds||{})){if(playerNameFromOdd(odd,prop.market)!==prop.player)continue;for(const [book,offer] of Object.entries(odd.byBookmaker||{})){if(offer.available&&Number.isFinite(+offer.odds))books.add(book)}}return books.size;
}
// Ratings always use every book for the market's fair price (the 3-book bar),
// then a viewer who picked their sportsbooks sees each prop priced and rated at
// the best of their own books. A one-book viewer still gets a real verdict.
function myBookOffers(events){
  const index=new Map();
  for(const event of events){if(!Array.isArray(event?.bookmakers))continue;for(const bookmaker of event.bookmakers){const title=bookmaker.title||titleCase(bookmaker.key||'');if(!bookAllowed(title)&&!bookAllowed(bookmaker.key||''))continue;
    for(const market of bookmaker.markets||[]){const label=marketLabels[market.key]||titleCase(market.key||'');for(const outcome of market.outcomes||[]){const name=String(outcome.name||'').trim(),raw=name.toLowerCase(),price=Number(outcome.price);if(!Number.isFinite(price))continue;
      const side=['over','yes'].includes(raw)?'over':['under','no'].includes(raw)?'under':outcome.description?null:'over',player=String(outcome.description||name).trim(),line=Number.isFinite(Number(outcome.point))?Number(outcome.point):.5;if(!side||!player)continue;
      const key=`${event.eventID||event.id}|${player}|${label}|${line}|${side}`,best=index.get(key);if(!best||price>best.price)index.set(key,{price,book:title})}}}}
  return index;
}
function priceAtMyBooks(prop,index){
  const at=side=>index.get(`${prop.eventID}|${prop.player}|${prop.market}|${prop.line}|${side}`),over=at('over'),under=at('under');
  if(!over&&!under)return null;
  if(!Number.isFinite(Number(prop.rawEdge))||prop.binary){const chosen=prop.side==='Over'?over:under;if(!chosen)return null;return {...prop,over:over?.price??prop.over,under:under?.price??prop.under,note:`Best price at ${chosen.book}`,myBooks:true}}
  const fairChosen=americanProbability(recommendedOdds(prop))+Number(prop.rawEdge)/100,fair=side=>side===prop.side?fairChosen:1-fairChosen;
  const options=[['Over',over],['Under',under]].filter(([,offer])=>offer).map(([side,offer])=>({side,offer,edge:(fair(side)-americanProbability(offer.price))*100})).sort((a,b)=>b.edge-a.edge),pick=options[0];
  return {...prop,side:pick.side,over:over?.price??prop.over,under:under?.price??prop.under,rawEdge:+pick.edge.toFixed(2),edge:+Math.max(.2,pick.edge).toFixed(1),conf:Math.round(Math.min(88,52+Math.max(.2,pick.edge)*3)),note:`Best at ${pick.offer.book} vs no-vig market consensus`,myBooks:true};
}
// Line value, rated on the shared fair-price curve (BTGLine, 3+ books):
// - a line only one or two books hang (205.5 where most have 215.5) is rated
//   on the curve instead of against its own price;
// - every prop notes a better line at another book when it beats the prop's
//   own value (Over 205.5 at Caesars on the 215.5 row).
// At the viewer's own books only, when they picked some.
function bestLines(events){
  const index=new Map();if(!window.BTGLine)return index;
  for(const event of events){if(!Array.isArray(event?.bookmakers))continue;for(const g of BTGLine.rate(event))index.set(`${event.eventID||event.id}|${g.player}|${marketLabels[g.marketKey]||''}`,g)}
  return index;
}
function withBestLine(prop,index){
  const g=index.get(`${prop.eventID}|${prop.player}|${prop.market}`);if(!g||prop.binary)return prop;
  const mine=o=>!o.alt&&(bookAllowed(o.book)||bookAllowed(o.key)),out={...prop};
  if(prop.line!==g.main&&(Number(prop.pairedBooks)||0)<3){
    const here=g.offers.filter(o=>mine(o)&&o.line===prop.line).sort((a,b)=>b.edge-a.edge)[0];
    if(here)Object.assign(out,{side:here.side==='over'?'Over':'Under',rawEdge:+here.edge.toFixed(2),edge:+Math.max(.2,here.edge).toFixed(1),conf:Math.round(Math.min(88,52+Math.max(.2,here.edge)*3)),pairedBooks:g.books,note:`Best at ${here.book} vs the fair price across lines`,curve:true});
  }
  const floor=Math.max(1.5,(Number(out.rawEdge)||0)+1);
  const best=g.offers.filter(o=>mine(o)&&o.line!==prop.line&&BTGLine.lineGain(o.side,o.line,prop.line)>0&&o.edge>=floor).sort((a,b)=>b.edge-a.edge)[0];
  if(best)out.bestLine={side:best.side==='over'?'Over':'Under',line:best.line,odds:best.odds,book:best.book,edge:+best.edge.toFixed(1),gain:+BTGLine.lineGain(best.side,best.line,prop.line).toFixed(1),unit:g.kind==='normal'?' yds':''};
  return out;
}
normalizeLiveProps=function(payload){const events=Array.isArray(payload?.data)?payload.data:[],all=normalizeAllBooks(payload),index=myBookOffers(events),priced=index?all.map(prop=>priceAtMyBooks(prop,index)).filter(Boolean):all;const lines=bestLines(events);return priced.map(prop=>withBestLine(prop,lines)).map(prop=>{const price=recommendedOdds(prop),fairChance=Math.min(.99,americanProbability(price)+prop.edge/100),bookMatch=String(prop.note||'').match(/(?:Best (?:at|price at)|at) ([^,]+?)(?: vs| price|$)/i);return{...prop,bookCount:propBookCoverage(payload,prop),oneSided:Boolean(prop.binary||prop.under===null||prop.under===undefined),fairChance:+(fairChance*100).toFixed(1),bestBook:bookMatch?.[1]||'Best available'}})};
function setFeedStatus(mode,message){feedMode=mode;const button=$('#feedBtn');button.classList.toggle('live',mode==='live');button.classList.toggle('error',mode==='error');button.querySelector('span').textContent=message}
function loadLiveProps(force=false){if(livePropsPromise)return livePropsPromise;livePropsPromise=refreshLiveProps(force).finally(()=>{livePropsPromise=null});return livePropsPromise}
async function refreshLiveProps(force=false){
  setFeedStatus('loading','Loading board…');
  $('#feedMessage').textContent='Loading current player props…';
  const cacheKey='bet-this-guy-live-cache-v15-player-only';
  const cached=(()=>{try{const item=JSON.parse(localStorage.getItem(cacheKey)||'null');return Array.isArray(item?.props)&&item.props.length?item:null}catch{return null}})();
  if(!force&&cached){const live=cached.props.map(refreshCachedTime);baseLiveProps=live;feedCoverage=cached.coverage||null;feedUpdatedAt=new Date(cached.at);rebuildPropBoard();setFeedStatus('live',`${live.length} cached lines`);$('#feedDescription').textContent='Showing saved lines now while the latest prices update.';$('#feedMessage').textContent='Refreshing every posted NFL game in the background…';refreshFilterCatalog();filtersChanged();if(Date.now()-cached.at<600000&&window.BTGMovement?.hasCurrent())return}
  try{
    let live;
    {
      const response=await fetch(`/api/props${force?`?refresh=${Date.now()}${leagueParam('&')}`:leagueParam()}`,{cache:force?'reload':'default'}),payload=await response.json();
      if(!response.ok||payload.success===false)throw new Error(payload.error||'Live lines could not be loaded.');
      feedCoverage=payload.coverage||null;live=normalizeLiveProps(payload);if(cached?.props?.length){const previous=new Map(cached.props.map(prop=>[`${prop.eventID}|${prop.player}|${prop.market}`,prop.line]));live=live.map(prop=>{const open=previous.get(`${prop.eventID}|${prop.player}|${prop.market}`);return Number.isFinite(open)?{...prop,open,trend:[open,open,prop.line,prop.line]}:prop})}
      if(!live.length)throw new Error('No supported player props are posted for the current slate yet.');
      feedUpdatedAt=new Date();
      try{localStorage.setItem(cacheKey,JSON.stringify({at:feedUpdatedAt.getTime(),props:live,coverage:feedCoverage}))}catch{}
    }
    baseLiveProps=live;rebuildPropBoard();setFeedStatus('live',`${live.length} live props`);$('#feedDescription').textContent='Showing current props from every NFL game with sportsbook markets posted.';const coverageText=feedCoverage?`${feedCoverage.loadedGames} of ${feedCoverage.scheduledGames} game boards checked`:'Every available game board checked';$('#feedMessage').textContent=`${coverageText} · updated ${feedUpdatedAt.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}.`;refreshFilterCatalog();filtersChanged();
  }catch(error){
    if(cached){const live=cached.props.map(refreshCachedTime);baseLiveProps=live;feedUpdatedAt=new Date(cached.at);rebuildPropBoard();setFeedStatus('live',`${live.length} cached lines`);$('#feedDescription').textContent='The latest saved real lines are shown while the provider reconnects.';$('#feedMessage').textContent=`Last updated ${feedUpdatedAt.toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}.`;refreshFilterCatalog();filtersChanged();return}
    baseLiveProps=[];rebuildPropBoard();setFeedStatus('error','Prices updating');$('#feedDescription').textContent='The live feed could not be loaded right now. No sample picks are being mixed into the real board.';$('#feedMessage').textContent=error.message;refreshFilterCatalog();filtersChanged();
  }
}
const scheduleTeams=game=>[game.teams?.away?.names?.short||game.teams?.away?.names?.medium,game.teams?.home?.names?.short||game.teams?.home?.names?.medium].filter(Boolean);
const scheduleGameName=game=>`${scheduleTeams(game)[0]||'Away'} @ ${scheduleTeams(game)[1]||'Home'}`;
function notifyNewFire(){const current=[...firePropKeys],saved=JSON.parse(localStorage.getItem('btg-fire-keys')||'[]'),newKeys=current.filter(key=>!saved.includes(key));localStorage.setItem('btg-fire-keys',JSON.stringify(current));if(preferences.browserAlerts&&saved.length&&newKeys.length&&'Notification'in window&&Notification.permission==='granted'){const prop=props.find(item=>newKeys.includes(propIdentity(item)));new Notification('New Fire bet on Bet This Guy',{body:prop?`${prop.player} · ${prop.side} ${prop.line} ${prop.market}`:`${newKeys.length} new Fire bets are available`})}}
function rebuildPropBoard(){const combined=[...baseLiveProps.filter(p=>!futurePropBoards.has(p.eventID)),...futurePropBoards.values()].flat().filter(p=>p.sport===LEAGUE&&!p.teamMarket),seen=new Set();props=combined.filter(p=>{const key=`${p.eventID||'demo'}|${p.player}|${p.market}|${p.line}`;if(seen.has(key))return false;seen.add(key);return true}).map((p,index)=>({...p,id:index+1}));mixerCandidateCache.clear();calibrateFirePool();notifyNewFire()}
function loadFutureSchedule(force=false){if(schedulePromise)return schedulePromise;schedulePromise=refreshFutureSchedule(force).finally(()=>{schedulePromise=null});return schedulePromise}
async function refreshFutureSchedule(force=false){try{const cacheKey=`bet-this-guy-${LEAGUE==='NBA'?'nba':'nfl'}-schedule-v4`,cached=JSON.parse(localStorage.getItem(cacheKey)||'null');if(!force&&cached?.at&&Date.now()-cached.at<21600000&&Array.isArray(cached.games)){scheduleGames=cached.games}else{const response=await fetch(`/api/schedule${force?`?refresh=${Date.now()}${leagueParam('&')}`:leagueParam()}`,{cache:force?'reload':'default'}),payload=await response.json();if(!response.ok||payload.success===false)throw new Error(payload.error||'Future schedules could not be loaded.');scheduleGames=Array.isArray(payload.data)?payload.data:[];localStorage.setItem(cacheKey,JSON.stringify({at:Date.now(),games:scheduleGames}))}scheduleGames=scheduleGames.filter(game=>game.leagueID===LEAGUE&&(!game.status?.startsAt||new Date(game.status.startsAt).getTime()>Date.now()-14400000));refreshFilterCatalog();render()}catch(error){$('#feedMessage').textContent=`Live props loaded. ${error.message}`}}
async function loadSelectedFutureGame(){if(state.game==='All'&&state.team==='All')return;const candidates=scheduleGames.filter(game=>(state.sport==='All'||game.leagueID===state.sport)&&(state.day==='All'||scheduleDay(game)===state.day)&&(state.game==='All'||scheduleGameName(game)===state.game)&&(state.team==='All'||scheduleTeams(game).includes(state.team))).sort((a,b)=>new Date(a.status?.startsAt)-new Date(b.status?.startsAt)),game=candidates[0];if(game)await loadBoardGame(game)}
function matchesCoreFilters(p){return(state.sport==='All'||p.sport===state.sport)&&(state.game==='All'||gameName(p)===state.game)&&(state.team==='All'||teamParts(p).includes(state.team))&&(state.day==='All'||propDay(p)===state.day)&&(state.timeSlot==='All'||timeSlot(p)===state.timeSlot)&&(state.market==='All'||p.market===state.market)&&(state.side==='All'||p.side===state.side)&&(state.move==='All'||movementName(p)===state.move)&&p.edge>=state.minEdge&&p.conf>=state.minConf&&(state.oddsType==='All'||oddsType(p)===state.oddsType)&&(!state.high||getTier(p.edge,p).key==='inferno')&&(!state.heat||getTier(p.edge,p).key===state.heat)}
function parlayFilterKey(){return JSON.stringify([state.sport,state.game,state.team,state.day,state.timeSlot,state.market,state.side,state.move,state.minEdge,state.minConf,state.oddsType,state.high,state.heat,preferences.risk,preferences.minBookCoverage,preferences.books])}
function parlayMatchesFilters(parlay){return Boolean(parlay?.legs?.length)&&parlay.legs.every(p=>matchesCoreFilters(p)&&Number.isFinite(recommendedOdds(p))&&recommendedOdds(p)!==0)}
function parlayFilterSummary(){return `${state.game==='All'?'All games':compactGameName(state.game)} · ${state.market==='All'?'All prop types':state.market}`}
function recommendationEligible(p){return(p.bookCount||0)>=preferences.minBookCoverage&&(!preferences.hideLongshots||!p.oneSided)}
const popularMarketPriority=market=>/^(Passing|Rushing|Receiving|Receptions|Rush |Pass |Sacks|Tackles|Interceptions|Kicking|Field Goals|Extra Points)/.test(market)?0:market==='Anytime Touchdown'?1:/First|Last/.test(market)?3:/Multiple Touchdowns/.test(market)?4:2;
const featuredLongshotMarket=market=>/^(First Touchdown|Last Touchdown|Multiple Touchdowns)$/i.test(market);
const featuredScore=p=>p.edge*10+Math.min(8,p.bookCount||0)*.6-popularMarketPriority(p.market)*2-(p.market==='Anytime Touchdown'?3:0);
function bestOfBest(selectedGame='All'){const ranked=[...props].filter(p=>p.sport===LEAGUE&&(selectedGame==='All'||gameName(p)===selectedGame)&&!p.oneSided&&recommendationEligible(p)&&!featuredLongshotMarket(p.market)&&!/^No (Scorer|Touchdown)/i.test(p.player)&&!/[\s/]D\/ST$/i.test(p.player)).sort((a,b)=>featuredScore(b)-featuredScore(a)||b.edge-a.edge||b.conf-a.conf),qualified=ranked.filter(p=>['inferno','hot','warm'].includes(getTier(p.edge,p).key)),marketCounts=new Map(),gameCounts=new Map(),players=new Set(),picked=[];const add=(prop,{gameCap=3,marketCap=2}={})=>{const game=prop.eventID||gameName(prop),marketCount=marketCounts.get(prop.market)||0;if(players.has(prop.player)||marketCount>=marketCap||prop.market==='Anytime Touchdown'&&marketCount>=3||selectedGame==='All'&&(gameCounts.get(game)||0)>=gameCap)return;players.add(prop.player);marketCounts.set(prop.market,marketCount+1);gameCounts.set(game,(gameCounts.get(game)||0)+1);picked.push(prop)};for(const prop of qualified){add(prop);if(picked.length===10)break}if(picked.length<10)for(const prop of ranked){add(prop);if(picked.length===10)break}if(picked.length<10)for(const prop of ranked){if(prop.market!=='Anytime Touchdown')add(prop,{gameCap:Infinity,marketCap:3});if(picked.length===10)break}if(picked.length<10)for(const prop of ranked){if(prop.market!=='Anytime Touchdown')add(prop,{gameCap:Infinity,marketCap:Infinity});if(picked.length===10)break}return picked}
function marketCounts(list){const counts=new Map();list.forEach(p=>counts.set(p.market,(counts.get(p.market)||0)+1));return counts}
function visibleProps(){let list;const popularView=state.view==='board'&&state.boardMarket==='All';if(popularView)list=bestOfBest(state.boardGame);else{list=props.filter(p=>p.sport===LEAGUE&&(state.boardMarket==='All'||p.market===state.boardMarket)&&(state.boardGame==='All'||gameName(p)===state.boardGame)).sort((a,b)=>b.edge-a.edge||b.conf-a.conf)}if(state.view==='saved')list=list.filter(p=>state.saved.has(savedPropKey(p)));if(state.view==='movement'){const moved=p=>Math.abs(p.lineMove||0)>=.5||Math.abs(p.priceMove||0)>=10||Math.abs((p.line||0)-(p.open||0))>=1;list=list.filter(moved).sort((a,b)=>(Math.abs(b.lineMove||0)+Math.abs(b.priceMove||0)/100)-(Math.abs(a.lineMove||0)+Math.abs(a.priceMove||0)/100))}return list}
function syncParlayLimitUI(){$('#maxLegLabel').textContent=`${preferences.maxParlayLegs} legs`;$('#slipNotice').textContent=`Tap any price to add it. Up to ${preferences.maxParlayLegs} picks in a parlay.`}
function renderBoardHealth(){syncParlayLimitUI()}
function render(){if(innerWidth<=720&&document.body.dataset.mobilePage!=='props'){syncFilterUI();if(document.body.dataset.mobilePage==='parlays')renderParlays();if(document.body.dataset.mobilePage==='slip'||state.slip.length)renderSlip();$('#watchCount').textContent=state.saved.size;($('#savedHeaderCount').textContent=state.saved.size,$('#savedHeaderCount').hidden=!state.saved.size);return}const list=visibleProps(),popularView=state.view==='board'&&state.boardMarket==='All',gameSelected=state.boardGame!=='All',updated=feedUpdatedAt?feedUpdatedAt.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):'just now';document.body.dataset.boardView=state.view;document.body.dataset.boardEmpty=String(!list.length);$('#viewTitle').textContent=state.view==='movement'?'Biggest movers right now':state.view==='saved'?'Your saved props':popularView?'Top props this week':state.boardMarket;$('#resultCount').textContent=state.view==='board'?(popularView?`${list.length?`${list.length} featured prop${list.length===1?'':'s'}`:'No props posted yet'}${gameSelected?` for ${compactGameName(state.boardGame)}`:''} · Updated ${updated}`:`${list.length} ${state.boardMarket} props · strongest edges first`):`${list.length} props shown`;$('#propList').innerHTML=list.map((prop,index)=>card(prop,index,popularView)).join('');const empty=$('#emptyState');empty.hidden=!!list.length;empty.innerHTML=feedMode==='loading'?'<strong>Loading live props…</strong><span>Current lines and game dates will appear here.</span>':feedMode==='error'?'<strong>Prices are updating.</strong><span>Props will appear here once sportsbook lines refresh. Check back shortly.</span>':state.view==='saved'?'<strong>Your watchlist is empty.</strong><span>Tap the star on any prop to keep it here for quick access.</span>':state.view==='movement'?'<strong>No meaningful line movement yet.</strong><span>We’ll surface the biggest price or line changes here as the market moves.</span>':popularView?'<strong>No current props are available here yet.</strong><span>Try another game or check back as sportsbooks post markets.</span>':'<strong>No NFL props are posted here yet.</strong><span>Try another prop type or game.</span>';renderBoardHealth();syncFilterUI();bindCards();if((document.body.dataset.mobilePage==='parlays'||innerWidth>720)&&initializedPages.has('parlays'))renderParlays();if(initializedPages.has('slip')||state.slip.length)renderSlip();$('#watchCount').textContent=state.saved.size;($('#savedHeaderCount').textContent=state.saved.size,$('#savedHeaderCount').hidden=!state.saved.size)}
const renderBoardBase=render;
render=function(){const movementPage=innerWidth<=720&&document.body.dataset.mobilePage==='movement';if(movementPage){document.body.dataset.mobilePage='props';renderBoardBase();document.body.dataset.mobilePage='movement';const empty=$('#emptyState');if(empty&&!empty.hidden){const baseline=props.some(p=>Array.isArray(p.lineHistory)&&p.lineHistory.length);empty.innerHTML=baseline?'<strong>No meaningful movement yet.</strong><span>The market has a baseline, but no line or price has moved enough to surface.</span>':'<strong>Building the first movement baseline.</strong><span>Prices are loading now. Refresh again after the next odds snapshot to measure movement.</span>'}return}renderBoardBase()};
function card(p,rank=-1,featured=false){const delta=p.line-p.open,alerting=preferences.lineAlerts&&state.saved.has(savedPropKey(p))&&Math.abs(delta)>=.5,recommended=p.side==='Over'?p.over:p.under,initials=p.player.split(' ').map(x=>x[0]).join(''),selection=p.binary?(p.side==='Over'?(p.overLabel||'Yes'):(p.underLabel||'No')):`${p.side} ${p.line}`,top=featured&&rank<3;return `<article class="prop-card mockup-card ${alerting?'line-alert':''} ${top?'top-play':''}" data-id="${p.id}">${top?`<span class="top-play-badge">#${rank+1} ${rank===0?'TOP PLAY':'BEST BET'}</span>`:''}${alerting?'<span class="line-alert-label">LINE MOVED</span>':''}<button class="bookmark ${state.saved.has(savedPropKey(p))?'saved':''}" aria-label="Save ${p.player}">${icon('star')}</button><header class="player prop-player" role="button" tabindex="0" aria-label="View ${p.player} statistics and recent games"><div class="avatar player-photo"><span>${initials}</span><img loading="lazy" decoding="async" src="/api/player-photo?name=${encodeURIComponent(p.player)}${p.sport==="NBA"?"&sport=NBA":""}" alt="${p.player}" onerror="this.hidden=true" /></div><div><strong>${p.player}</strong><span>${compactGameName(p.team.replace(' · vs ',' vs ').replace(' · @ ',' @ '))}</span><small data-game-time="${htmlEscape(gameName(p))}" data-kickoff="${htmlEscape(p.startsAt||'')}" data-default-time="${htmlEscape(p.time)}">${htmlEscape(p.time)}</small></div></header><section class="mockup-pick"><div><span>${p.market.toUpperCase()}</span><strong>${selection}</strong></div><b>${formatOdds(recommended)}</b></section><div class="mockup-proof"><div class="hit-card" data-hit-profile="${p.id}"><strong>Last 10</strong><span>Loading as this card comes into view…</span><i class="hit-loading"></i><div class="mini-games"></div></div></div><div class="bet-actions"><button class="pick-btn recommended add-recommended" data-side="${p.side}"><b>＋</b> Add to Parlay</button></div></article>`}
function bindCards(){$$('.prop-card').forEach(el=>{const id=+el.dataset.id,p=props.find(x=>x.id===id);el.querySelector('.bookmark').onclick=e=>{e.stopPropagation();state.saved.has(savedPropKey(p))?state.saved.delete(savedPropKey(p)):state.saved.add(savedPropKey(p));localStorage.setItem('propedge-saved',JSON.stringify([...state.saved]));window.BTGAuth?.syncSavedProps([...state.saved],props).catch(()=>{});render()};el.querySelectorAll('.pick-btn').forEach(btn=>{const key=slipSelectionKey(p,btn.dataset.side);if(state.slip.some(x=>x.key===key))btn.classList.add('selected');btn.onclick=e=>{e.stopPropagation();toggleLeg(p,btn.dataset.side)}});el.querySelectorAll('[data-book-link]').forEach(link=>link.onclick=e=>{e.stopPropagation();navigator.clipboard?.writeText(betHandoffText(p)).catch(()=>{});link.textContent=`Opening ${p.bestBook||'sportsbook'}…`});const player=el.querySelector('.player');player.onclick=()=>openPlayerProfile(p);player.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openPlayerProfile(p)}};const market=el.querySelector('.market');if(market)market.onclick=()=>openDetail(p)})}
const bindCardsBase=bindCards;
let hitHydrationPromise=Promise.resolve();
bindCards=function(){bindCardsBase();$$('.prop-card').forEach(card=>{const prop=props.find(item=>item.id===+card.dataset.id);if(prop?.binary)card.classList.add('binary-prop');card.querySelectorAll('.pick-btn').forEach(button=>{const over=button.dataset.side==='Over',odds=over?prop?.over:prop?.under;if(odds===null||odds===undefined)button.disabled=true})});observeHitProfiles()};
function toggleLeg(p,side){const key=slipSelectionKey(p,side),idx=state.slip.findIndex(x=>slipSelectionKey(x.p,x.side)===key);if(idx>=0)state.slip.splice(idx,1);else{state.slip=state.slip.filter(x=>savedPropKey(x.p)!==savedPropKey(p));if(state.slip.length<preferences.maxParlayLegs)state.slip.push({key,p,side,odds:side==='Over'?p.over:p.under})}render()}
const marketFamily=market=>{const value=market.toLowerCase();if(value.includes('touchdown')||value.includes('scorer'))return'touchdowns';if(value.includes('passing yards')||value.includes('pass completion')||value.includes('pass attempt')||value.includes('interception thrown'))return'passing';if(value.includes('rushing')||value.includes('rush attempt'))return'rushing';if(value.includes('receiving yards')||value.includes('reception'))return'receiving';if(value.includes('field goal')||value.includes('kicking')||value.includes('pat'))return'kicking';if(value.includes('sack')||value.includes('tackle')||value.includes('defensive interception'))return'defense';return'combination'};
function makeParlay(sectionIndex){const cfg=parlaySections[sectionIndex],all=balancedCandidatePool(300),pool=all.filter(p=>p.edge>=1),valid=[],near=[],maxPerGame=sectionIndex===0?2:(preferences.avoidSameGame?1:({conservative:1,balanced:2,aggressive:3}[preferences.risk]||2));if(pool.length<cfg.minLegs)return null;for(let attempt=0;attempt<900&&valid.length<80;attempt++){const sectionMax=Math.min(cfg.maxLegs,15),count=Math.min(pool.length,cfg.minLegs+Math.floor(Math.random()*(Math.max(cfg.minLegs,sectionMax)-cfg.minLegs+1))),usedPlayers=new Set(),gameCounts=new Map(),familyCounts=new Map(),legs=[],shuffled=[...pool].sort(()=>Math.random()-.5),familyLimit=count<=5?1:Math.ceil(count/5),touchdownLimit=Math.max(1,Math.floor(count*.25));for(const prop of shuffled){const playerKey=`${prop.sport}|${prop.player}`,gameKey=prop.eventID||gameName(prop),family=marketFamily(prop.market);if(usedPlayers.has(playerKey)||(gameCounts.get(gameKey)||0)>=maxPerGame||(familyCounts.get(family)||0)>=familyLimit||(family==='touchdowns'&&(familyCounts.get(family)||0)>=touchdownLimit))continue;usedPlayers.add(playerKey);gameCounts.set(gameKey,(gameCounts.get(gameKey)||0)+1);familyCounts.set(family,(familyCounts.get(family)||0)+1);legs.push(prop);if(legs.length===count)break}if(legs.length<count){for(const prop of shuffled){const playerKey=`${prop.sport}|${prop.player}`,gameKey=prop.eventID||gameName(prop),family=marketFamily(prop.market);if(usedPlayers.has(playerKey)||(gameCounts.get(gameKey)||0)>=maxPerGame||(family==='touchdowns'&&(familyCounts.get(family)||0)>=touchdownLimit))continue;usedPlayers.add(playerKey);gameCounts.set(gameKey,(gameCounts.get(gameKey)||0)+1);familyCounts.set(family,(familyCounts.get(family)||0)+1);legs.push(prop);if(legs.length===count)break}}if(legs.length<count)continue;const signature=legs.map(p=>p.id).sort((a,b)=>a-b).join('-');if(parlaySignatures[sectionIndex].has(signature))continue;const dec=legs.reduce((total,p)=>total*americanToDecimal(recommendedOdds(p)),1),american=decimalToAmerican(dec),candidate={signature,legs,dec,american};if(american>=cfg.minOdds&&american<=cfg.maxOdds)valid.push(candidate);}const choices=valid.length?valid:near.sort((a,b)=>Math.abs(a.american-7000)-Math.abs(b.american-7000));if(!choices.length)return null;const choice=valid.length?choices[Math.floor(Math.random()*choices.length)]:choices[0];parlaySignatures[sectionIndex].add(choice.signature);return{id:++parlaySerial,sectionIndex,legs:choice.legs,dec:choice.dec,american:choice.american,payout:choice.dec*wagerStake()}}
function makeCreativeParlay(sectionIndex,excluded=new Set()){const cfg=parlaySections[sectionIndex],all=balancedCandidatePool(300).filter(p=>p.edge>=1),fresh=all.filter(p=>!excluded.has(propIdentity(p))),pool=new Set(fresh.map(p=>p.player)).size>=cfg.minLegs?fresh:all,valid=[],near=[];if(new Set(pool.map(p=>p.player)).size<cfg.minLegs)return null;for(let attempt=0;attempt<1000&&valid.length<80;attempt++){const maxLegs=Math.min(cfg.maxLegs,15,new Set(pool.map(p=>p.player)).size),count=Math.min(pool.length,cfg.minLegs+Math.floor(Math.random()*(Math.max(cfg.minLegs,maxLegs)-cfg.minLegs+1))),legs=[],players=new Set(),familyCounts=new Map(),touchdownLimit=attempt<700?Math.max(1,Math.floor(count*.25)):count,shuffled=[...pool].sort(()=>Math.random()-.5);while(legs.length<count){const options=shuffled.filter(p=>!players.has(p.player)&&(marketFamily(p.market)!=='touchdowns'||(familyCounts.get('touchdowns')||0)<touchdownLimit));if(!options.length)break;options.sort((a,b)=>(familyCounts.get(marketFamily(a.market))||0)-(familyCounts.get(marketFamily(b.market))||0)+(Math.random()-.5));const prop=options[0],family=marketFamily(prop.market);legs.push(prop);players.add(prop.player);familyCounts.set(family,(familyCounts.get(family)||0)+1);shuffled.splice(shuffled.indexOf(prop),1)}if(legs.length<count)continue;const signature=legs.map(p=>p.id).sort((a,b)=>a-b).join('-');if(parlaySignatures[sectionIndex].has(signature))continue;const dec=legs.reduce((total,p)=>total*americanToDecimal(recommendedOdds(p)),1),american=decimalToAmerican(dec),candidate={signature,legs,dec,american};if(american>=cfg.minOdds&&american<=cfg.maxOdds)valid.push(candidate);}const choices=valid.length?valid:near.sort((a,b)=>Math.abs(a.american-7000)-Math.abs(b.american-7000));if(!choices.length)return null;const choice=valid.length?choices[Math.floor(Math.random()*choices.length)]:choices[0];parlaySignatures[sectionIndex].add(choice.signature);return{id:++parlaySerial,sectionIndex,legs:choice.legs,dec:choice.dec,american:choice.american,payout:choice.dec*wagerStake()}}
const parlayGcd=(a,b)=>{while(b){const next=a%b;a=b;b=next}return a};
function fastParlayLegs(pool,count,seed,touchdownCap){
  const total=pool.length,legs=[],players=new Set(),families=new Map(),exclusiveScorers=new Set();
  if(!total||count<1)return legs;
  let stride=17+Math.abs(seed)%31;
  while(parlayGcd(stride,total)!==1)stride++;
  const start=Math.abs(seed*37+parlaySerial*11)%total;
  for(let pass=0;pass<2&&legs.length<count;pass++){
    for(let scanned=0;scanned<total&&legs.length<count;scanned++){
      const prop=pool[(start+scanned*stride)%total],family=marketFamily(prop.market),exclusive=/^(First|Last) Touchdown$/i.test(prop.market)?`${prop.eventID||gameName(prop)}|${prop.market}`:null;
      if(players.has(prop.player)||(exclusive&&exclusiveScorers.has(exclusive))||(family==='touchdowns'&&(families.get(family)||0)>=touchdownCap)||(pass===0&&families.has(family)))continue;
      legs.push(prop);players.add(prop.player);families.set(family,(families.get(family)||0)+1);if(exclusive)exclusiveScorers.add(exclusive)
    }
  }
  return legs
}
// Premade parlays never include a leg the board rates Overpriced.
function premadeEligible(p){return BTGStats.supports(p)&&Date.parse(p.startsAt)>Date.now()&&propVerdict(p)?.key!=='read'}
makeCreativeParlay=function(sectionIndex,excluded=new Set()){
  const cfg=parlaySections[sectionIndex],modelFirst=!excluded.size;
  const modelPool=balancedCandidatePool(300).filter(p=>premadeEligible(p));
  const explorePool=props.filter(p=>premadeEligible(p)&&matchesCoreFilters(p)&&Number.isFinite(recommendedOdds(p))&&recommendedOdds(p)!==0);
  const source=modelFirst&&new Set(modelPool.map(p=>p.player)).size>=cfg.minLegs?modelPool:explorePool,fresh=source.filter(p=>!excluded.has(propIdentity(p)));
  const pool=(new Set(fresh.map(p=>p.player)).size>=cfg.minLegs?fresh:source).sort((a,b)=>(parlayExposure.get(propIdentity(a))||0)-(parlayExposure.get(propIdentity(b))||0)||b.edge-a.edge),valid=[],near=[];
  const uniquePlayers=new Set(pool.map(p=>p.player)).size;
  if(uniquePlayers<cfg.minLegs)return null;
  const maxLegs=Math.min(cfg.maxLegs,10,uniquePlayers),baseSeed=Math.floor(Math.random()*Math.max(1,pool.length));
  for(let attempt=0;attempt<192&&valid.length<16;attempt++){
    const count=cfg.minLegs+((attempt+baseSeed)%(maxLegs-cfg.minLegs+1)),touchdownLimit=state.market==='All'&&!(state.game!=='All'&&attempt>=24&&!valid.length&&!near.length)?Math.max(1,Math.ceil(count*.3)):count;
    const legs=fastParlayLegs(pool,count,baseSeed+attempt*17,touchdownLimit);
    if(legs.length<count)continue;
    const signature=legs.map(p=>p.id).sort((a,b)=>a-b).join('-');if(parlaySignatures[sectionIndex].has(signature))continue;
    const dec=legs.reduce((total,p)=>total*americanToDecimal(recommendedOdds(p)),1),american=decimalToAmerican(dec),candidate={signature,legs,dec,american,novelty:legs.reduce((sum,p)=>sum+(parlayExposure.get(propIdentity(p))||0),0)};
    if(american>=cfg.minOdds&&american<=cfg.maxOdds)valid.push(candidate);
  }
  const choices=valid.length?valid:near;if(!choices.length)return null;
  choices.sort((a,b)=>modelFirst?Math.abs(a.american-(cfg.minOdds+cfg.maxOdds)/2)-Math.abs(b.american-(cfg.minOdds+cfg.maxOdds)/2):a.novelty-b.novelty||Math.random()-.5);
  const choice=choices[Math.floor(Math.random()*Math.min(modelFirst?8:4,choices.length))];parlaySignatures[sectionIndex].add(choice.signature);
  return{id:++parlaySerial,sectionIndex,legs:choice.legs,dec:choice.dec,american:choice.american,payout:choice.dec*wagerStake()}
};
function refreshParlays(sectionIndex,rerender=true){const previous=parlayFeeds[sectionIndex].filter(parlayMatchesFilters).filter(r=>r.legs.every(premadeEligible)),excluded=new Set(parlayRecentLegs[sectionIndex]);parlayFeeds[sectionIndex]=[];for(let i=0;i<6;i++){const parlay=makeCreativeParlay(sectionIndex,excluded)||makeCreativeParlay(sectionIndex,new Set());if(parlay){parlayFeeds[sectionIndex].push(parlay);parlay.legs.forEach(p=>{const key=propIdentity(p);excluded.add(key);parlayExposure.set(key,(parlayExposure.get(key)||0)+1)})}}if(!parlayFeeds[sectionIndex].length)parlayFeeds[sectionIndex]=previous;parlayRecentLegs[sectionIndex]=new Set(parlayFeeds[sectionIndex].flatMap(r=>r.legs.map(propIdentity)));if(rerender)renderParlays()}
function loadSuggestedParlay(r){state.slip=r.legs.map(p=>({key:slipSelectionKey(p,p.side),p,side:p.side,odds:p.side==='Over'?p.over:p.under}));render();if(innerWidth<=720)showMobilePage('slip',true);else $('#slip').scrollIntoView({behavior:'smooth',block:'start'})}
function parlayReason(r){const strong=r.legs.filter(p=>p.edge>=4).length,games=new Set(r.legs.map(p=>p.eventID||gameName(p))).size,markets=new Set(r.legs.map(p=>p.market)).size;return `${strong} of ${r.legs.length} legs carry a 4%+ market edge. The build spreads across ${games} ${games===1?'game':'games'} and ${markets} prop ${markets===1?'type':'types'}, so it is not relying on one exact game script.`}
async function playerFact(p){const key=`${p.sport}|${p.player}|${p.team}`,price=formatOdds(recommendedOdds(p));try{let payload=playerStatsCache.get(key);if(!payload){const params=new URLSearchParams({sport:p.sport,player:p.player,team:p.team}),response=await fetch(`/api/player-stats?${params}`),result=await response.json();if(!response.ok||result.success===false)throw new Error();payload=result;playerStatsCache.set(key,payload)}const player=payload.player||{},rows=(payload.stats||[]).map(row=>({row,date:statDate(row),metric:propMetric(p,row)})).filter(item=>item.metric.value!==null).sort((a,b)=>(b.date?.getTime()||0)-(a.date?.getTime()||0)),recent=rows.slice(0,5),latest=recent[0],hits=recent.filter(item=>hitAgainstLine(p,item.metric.value)===true).length,opponent=latest?opponentLabel(latest.row,player):'';if(!latest)return`${p.player} carries a ${p.edge}% market edge at ${price}, with ${p.bookCount||'multiple'} books compared.`;const market=p.market.toLowerCase(),lastGame=latest.date?latest.date.toLocaleDateString([],{month:'short',day:'numeric'}):'his latest game';if(market.includes('touchdown')||market.includes('scorer'))return`${p.player} scored ${latest.metric.value} ${latest.metric.value===1?'touchdown':'touchdowns'} ${opponent?`${opponent} `:''}on ${lastGame} and is priced at ${price} to do it again. He has cleared this bet in ${hits} of his last ${recent.length} tracked games.`;return`${p.player} posted ${latest.metric.value} ${latest.metric.label} ${opponent?`${opponent} `:''}on ${lastGame}. He has cleared today’s ${p.line} line in ${hits} of his last ${recent.length} tracked games and is priced at ${price}.`}catch{return`${p.player} has a ${p.edge}% market edge at ${price}, based on the best posted price versus the multi-book no-vig consensus.`}}
let returnToParlayDetail=null;
function openParlayLegPlayer(p,r){returnToParlayDetail=r;$('#parlayDetailDialog').close();openPlayerProfile(p)}
// Tapping outside a pop-up closes it (the shaded area around a sheet).
['parlayDetailDialog','detailDialog','movementDialog','feedDialog'].forEach(id=>{const dialog=$('#'+id);if(dialog?.addEventListener)dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close()})});
$('#playerDialog').addEventListener('close',()=>{if(!returnToParlayDetail)return;const parlay=returnToParlayDetail;returnToParlayDetail=null;openParlayDetail(parlay)});
async function openParlayDetail(r){if(!r)return;const generated=r.sectionIndex===undefined||r.sectionIndex===null,cfg=generated?{tag:'CUSTOM BUILD',name:'Generated Parlay'}:parlaySections[r.sectionIndex],payout=Number.isFinite(r.payout)?r.payout:r.dec*wagerStake(),content=$('#parlayDetailContent');content.innerHTML=`<p class="eyebrow">${cfg.tag}</p><h2>${cfg.name}</h2><div class="parlay-detail-total"><div><span>${r.legs.length} LEGS</span><strong>${formatOddsPretty(r.american)}</strong></div><div><span>${wagerLabel()} PAYS</span><strong>${formatMoney(payout)}</strong></div></div><section class="parlay-why"><strong>Why it could hit</strong><p>${parlayReason(r)}</p><small>Loading recent player facts…</small></section><div class="parlay-detail-legs">${r.legs.map((p,i)=>`<article class="parlay-detail-player" data-fact-index="${i}" data-parlay-player="${i}" role="button" tabindex="0" aria-label="View ${htmlEscape(p.player)} stats and recent games"><i>${i+1}</i><div><strong>${p.player}</strong><span>${p.side} ${p.line} · ${p.market}</span><small>Checking recent NFL game logs…</small></div><b>${formatOdds(recommendedOdds(p))}</b></article>`).join('')}</div><button class="primary" id="parlayDetailAdd">Add this parlay to slip</button>`;$('#parlayDetailDialog').showModal();content.querySelectorAll('[data-parlay-player]').forEach(leg=>{const open=()=>openParlayLegPlayer(r.legs[+leg.dataset.parlayPlayer],r);leg.onclick=open;leg.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();open()}}});$('#parlayDetailAdd').onclick=()=>{$('#parlayDetailDialog').close();loadSuggestedParlay(r)};for(let index=0;index<r.legs.length;index+=1){const fact=await playerFact(r.legs[index]);const target=content.querySelector(`[data-fact-index="${index}"] small`);if(target)target.textContent=fact}const status=content.querySelector('.parlay-why small');if(status)status.textContent='Tap any player for the full Last 10. Recent-game facts supplied by BALLDONTLIE.'}
function renderParlayPreview(){const host=$('#parlayPreview');if(!host)return;const cfg=parlaySections[activeParlaySection],r=parlayFeeds[activeParlaySection][0];host.innerHTML=`<header><div><span>${icon('layers')}</span><strong>Parlay Generator</strong></div><button data-open-generator>${parlayFeeds.flat().length} unique builds available ›</button></header><nav>${parlaySections.map((section,index)=>`<button class="${index===activeParlaySection?'active':''}" data-preview-level="${index}">${section.name}</button>`).join('')}</nav>${r?`<article data-preview-parlay="${r.id}"><div><span><strong>${cfg.name}</strong><small>${r.legs.length} legs&nbsp; • &nbsp;${formatOddsPretty(r.american)}</small><em>${cfg.blurb}</em></span></div><button data-preview-regenerate="${activeParlaySection}">↻ Regenerate</button></article>`:`<div class="filtered-empty"><strong>Building more options…</strong></div>`}`;host.querySelectorAll('[data-preview-level]').forEach(button=>button.onclick=()=>{activeParlaySection=+button.dataset.previewLevel;renderParlays()});host.querySelector('[data-preview-regenerate]')?.addEventListener('click',event=>{event.stopPropagation();refreshParlays(+event.currentTarget.dataset.previewRegenerate)});host.querySelector('[data-preview-parlay]')?.addEventListener('click',()=>openParlayDetail(r));host.querySelector('[data-open-generator]')?.addEventListener('click',()=>showMobilePage('generator',true))}
const shortPlayerName=name=>{const parts=String(name||'Player').trim().split(/\s+/),suffix=/^(Jr\.?|Sr\.?|II|III|IV)$/i.test(parts.at(-1));return suffix&&parts.length>1?`${parts.at(-2)} ${parts.at(-1)}`:parts.at(-1)};
function renderParlays(){$$('[data-parlay-filter-summary]').forEach(label=>label.textContent=parlayFilterSummary());parlaySections.forEach((_,i)=>{parlayFeeds[i]=parlayFeeds[i].filter(parlayMatchesFilters).filter(r=>r.legs.every(premadeEligible))});if(!parlayFeeds[activeParlaySection].length)refreshParlays(activeParlaySection,false);$$('[data-parlay-level]').forEach(button=>{const active=+button.dataset.parlayLevel===activeParlaySection;button.classList.toggle('active',active);button.setAttribute('aria-selected',active)});const sectionIndex=activeParlaySection,cfg=parlaySections[sectionIndex],cards=parlayFeeds[sectionIndex],empty=!cards.length;$('#parlayCards').innerHTML=`<section class="parlay-feed-section parlay-section-${sectionIndex+1}"><div class="parlay-feed-head"><div><h3>${cfg.name}</h3><p>${cfg.subtitle}</p><p class="explore-note">Ideas built from today’s board, not official picks. <a class="category-results-link" href="/trust#${cfg.history}" aria-label="See official results for ${htmlEscape(cfg.name)}">See official results →</a></p></div><div><b>${empty?'FILTERED':`${cards.length} OPTIONS`}</b><button data-more-parlays="${sectionIndex}" ${empty?'disabled':''}>↻ Show more options</button></div></div>${empty?`<div class="filtered-empty"><strong>No parlay matches these filters and this odds range.</strong><span>Choose another level, game, or prop type. Your selected filters stay in place.</span></div>`:`<div class="parlay-feed-grid">${cards.map((r,i)=>`<article class="parlay-card parlay-compact parlay-${sectionIndex+1}" data-view-parlay="${r.id}" tabindex="0"><header class="pc-head"><b>${r.legs.length} legs · ${formatOddsPretty(r.american)}</b><span>${wagerLabel()} pays <strong>$${Math.round(r.payout).toLocaleString('en-US')}</strong></span></header><ul class="pc-legs">${r.legs.map(p=>`<li><span class="pc-icon" aria-hidden="true">${propVerdict(p)?.svg||'•'}</span><span class="pc-leg"><strong>${htmlEscape(p.player)}</strong><small>${htmlEscape(p.binary?p.market:`${p.side} ${p.line} ${String(p.market||'').toLowerCase()}`)}</small></span><b>${htmlEscape(formatOdds(recommendedOdds(p)))}</b></li>`).join('')}</ul><div class="pc-actions"><button type="button" class="pc-add" data-add-parlay="${r.id}">＋ Add to slip</button><button type="button" data-view-parlay-button="${r.id}">Details & why ›</button></div></article>`).join('')}</div>`}</section>`;$$('[data-more-parlays]').forEach(button=>button.onclick=()=>refreshParlays(+button.dataset.moreParlays));$$('[data-view-parlay]').forEach(card=>{const open=()=>openParlayDetail(parlayFeeds.flat().find(x=>x.id===+card.dataset.viewParlay));card.onclick=open;card.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();open()}}});$$('[data-view-parlay-button]').forEach(button=>button.onclick=event=>{event.stopPropagation();openParlayDetail(parlayFeeds.flat().find(x=>x.id===+button.dataset.viewParlayButton))});$$('[data-add-parlay]').forEach(button=>button.onclick=event=>{event.stopPropagation();const r=parlayFeeds.flat().find(x=>x.id===+button.dataset.addParlay);if(r){window.btgCount?.('parlay:add');loadSuggestedParlay(r)}});renderParlayPreview()}
function targetOddsFromSlider(){const raw=200*Math.pow(5000,+$('#oddsSlider').value/100),step=raw<1000?50:raw<10000?500:raw<100000?5000:25000;return Math.round(raw/step)*step}
function balancedCandidatePool(limit=180){const families=new Map(),riskFloor={conservative:3,balanced:1,aggressive:0}[preferences.risk]??1,allMatching=props.filter(p=>matchesCoreFilters(p)&&Number.isFinite(recommendedOdds(p))&&recommendedOdds(p)!==0),preferred=allMatching.filter(p=>p.edge>=riskFloor),preferredFamilies=new Set(preferred.map(p=>marketFamily(p.market))),preferredStandardPlayers=new Set(preferred.filter(p=>marketFamily(p.market)!=='touchdowns').map(p=>p.player)),matching=preferred.length>=15&&preferredFamilies.size>=3&&preferredStandardPlayers.size>=8?preferred:allMatching,coverageFloor=Math.min(preferences.minBookCoverage,Math.max(1,...matching.map(p=>p.bookCount||0))),qualified=matching.filter(p=>(p.bookCount||0)>=coverageFloor),pool=qualified.length>=15?qualified:matching;pool.sort((a,b)=>b.edge-a.edge||b.conf-a.conf).forEach(prop=>{const family=marketFamily(prop.market),markets=families.get(family)||new Map(),group=markets.get(prop.market)||[];group.push(prop);markets.set(prop.market,group);families.set(family,markets)});const familyQueues=[...families.entries()].map(([name,markets])=>({name,markets:[...markets.values()],marketIndex:0,itemIndex:0})).sort((a,b)=>a.name==='touchdowns'?1:b.name==='touchdowns'?-1:0),out=[],used=new Set();while(out.length<limit){let added=false;for(const family of familyQueues){for(let tries=0;tries<family.markets.length;tries++){const market=family.markets[family.marketIndex%family.markets.length];family.marketIndex++;const prop=market[family.itemIndex]||market.find(item=>!used.has(item.id));if(!prop||used.has(prop.id))continue;used.add(prop.id);out.push(prop);added=true;break}if(out.length===limit)break}familyQueues.forEach(family=>family.itemIndex++);if(!added)break}return out}
const mixerPropKey=p=>`${p.eventID||gameName(p)}|${p.player}|${p.market}`;
const mixerCombinationKey=legs=>legs.map(propIdentity).sort().join('\n');
const mixerScorerKey=p=>p.side==='Over'&&/^(First|Last) Touchdown$/i.test(p.market)?`${p.eventID||gameName(p)}|${p.market}`:null;
function mixerEligiblePool(){
  const key=`eligible-v7|${parlayFilterKey()}`;
  if(!mixerCandidateCache.has(key))mixerCandidateCache.set(key,[...new Map(props.filter(p=>matchesCoreFilters(p)&&Number.isFinite(recommendedOdds(p))&&recommendedOdds(p)!==0).map(p=>[propIdentity(p),p])).values()]);
  return mixerCandidateCache.get(key);
}
function mixerLegsCompatible(legs){
  const players=new Set(),scorers=new Set(),touchdownCap=state.market==='All'?Math.max(1,Math.ceil(legs.length*.3)):legs.length;
  let touchdowns=0;
  for(const prop of legs){const scorer=mixerScorerKey(prop),family=marketFamily(prop.market);if(family==='touchdowns'&&++touchdowns>touchdownCap||players.has(prop.player)||(scorer&&scorers.has(scorer)))return false;players.add(prop.player);if(scorer)scorers.add(scorer)}
  return true;
}
function buildMixerCandidates(size,target,shuffle=false){
  size=Math.max(2,Math.min(10,size));
  const full=mixerEligiblePool(),uniqueCount=list=>new Set(list.map(p=>p.player)).size;
  if(uniqueCount(full)<size)return[];
  const previous=mixerPreviousSelection?.legs||[],lastProps=new Set(previous.map(mixerPropKey)),lastPlayers=new Set(previous.map(p=>p.player));
  const targetDec=americanToDecimal(target),legTarget=Math.log(targetDec)/size,results=[],freshResults=[],signatures=new Set(),fullKeys=new Set(full.map(propIdentity));
  const add=legs=>{
    if(legs.length!==size||!mixerLegsCompatible(legs))return;
    const key=mixerCombinationKey(legs);if(signatures.has(key)||(shuffle&&key===mixerComboKey))return;
    signatures.add(key);
    const dec=legs.reduce((sum,p)=>sum*americanToDecimal(recommendedOdds(p)),1),families=new Set(legs.map(p=>marketFamily(p.market)));
    results.push({legs,dec,american:decimalToAmerican(dec),key,
      repeatedLegs:legs.filter(p=>mixerLastLegs.has(propIdentity(p))).length,
      repeatedProps:legs.filter(p=>lastProps.has(mixerPropKey(p))).length,
      repeatedPlayers:legs.filter(p=>lastPlayers.has(p.player)).length,
      usage:legs.reduce((sum,p)=>sum+(mixerExposure.get(propIdentity(p))||0)+(mixerPropExposure.get(mixerPropKey(p))||0),0),
      score:Math.abs(Math.log(dec)-Math.log(targetDec))-families.size*.09});
    if(!mixerSeenKeys.has(key))freshResults.push(results[results.length-1]);
  };
  const rank=list=>list.sort((a,b)=>shuffle?
    a.repeatedLegs-b.repeatedLegs||a.repeatedProps-b.repeatedProps||a.repeatedPlayers-b.repeatedPlayers||a.usage-b.usage||a.score-b.score:
    a.score-b.score);
  const sample=pool=>{
    const grouped=new Map();for(const prop of pool){const group=grouped.get(prop.player)||[];group.push(prop);grouped.set(prop.player,group)}
    const groups=[...grouped.values()];if(groups.length<size)return;
    const touchdownCap=state.market==='All'?Math.max(1,Math.ceil(size*.3)):size,availableFamilies=new Set(pool.map(p=>marketFamily(p.market))).size,familyCap=state.market==='All'&&availableFamilies>=3?Math.max(2,Math.ceil(size*.4)):size,direct=[],directScorers=new Set(),directFamilies=new Map();let directTouchdowns=0;
    const closest=[...groups].sort((a,b)=>Math.min(...a.map(p=>Math.abs(Math.log(americanToDecimal(recommendedOdds(p)))-legTarget)))-Math.min(...b.map(p=>Math.abs(Math.log(americanToDecimal(recommendedOdds(p)))-legTarget))));
    for(const offers of closest){const chosen=[...offers].sort((a,b)=>Math.abs(Math.log(americanToDecimal(recommendedOdds(a)))-legTarget)-Math.abs(Math.log(americanToDecimal(recommendedOdds(b)))-legTarget)).find(prop=>{const scorer=mixerScorerKey(prop),family=marketFamily(prop.market),touchdown=family==='touchdowns';return(!scorer||!directScorers.has(scorer))&&(!touchdown||directTouchdowns<touchdownCap)&&(directFamilies.get(family)||0)<familyCap});if(!chosen)continue;direct.push(chosen);const scorer=mixerScorerKey(chosen),family=marketFamily(chosen.market);if(scorer)directScorers.add(scorer);directFamilies.set(family,(directFamilies.get(family)||0)+1);if(family==='touchdowns')directTouchdowns++;if(direct.length===size)break}add(direct);
    for(let attempt=0;attempt<32;attempt++){
      const order=groups.slice();for(let i=order.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[order[i],order[j]]=[order[j],order[i]]}
      const legs=[],scorers=new Set(),families=new Map();
      for(const offers of order){
        let chosen=null,best=Infinity;
        for(const prop of offers){
          const scorer=mixerScorerKey(prop);if(scorer&&scorers.has(scorer))continue;
          const family=marketFamily(prop.market),count=families.get(family)||0;if(family==='touchdowns'&&count>=touchdownCap||count>=familyCap)continue;
          const novelty=shuffle?(mixerLastLegs.has(propIdentity(prop))?1000:0)+(lastProps.has(mixerPropKey(prop))?100:0)+(mixerExposure.get(propIdentity(prop))||0)*3+(mixerPropExposure.get(mixerPropKey(prop))||0):0;
          const score=novelty+count*1.5+(state.market==='All'&&family==='touchdowns'&&count>=Math.ceil(size*.3)?8:0)+Math.abs(Math.log(americanToDecimal(recommendedOdds(prop)))-legTarget)*.4+Math.random()*3;
          if(score<best){best=score;chosen=prop}
        }
        if(!chosen)continue;
        legs.push(chosen);const scorer=mixerScorerKey(chosen),family=marketFamily(chosen.market);if(scorer)scorers.add(scorer);families.set(family,(families.get(family)||0)+1);
        if(legs.length===size)break;
      }
      add(legs);
    }
  };
  const pools=shuffle?
    [full.filter(p=>!lastProps.has(mixerPropKey(p))),full.filter(p=>!mixerLastLegs.has(propIdentity(p))),full]:
    [balancedCandidatePool(300).filter(p=>fullKeys.has(propIdentity(p))),full];
  for(const pool of pools){
    sample(pool);
    const fresh=shuffle?freshResults:results;
    if(fresh.length)return rank(fresh);
  }
  // Search direct replacements if random sampling missed a small, valid pool.
  if(shuffle&&previous.length===size){
    const byKey=new Map(full.map(p=>[propIdentity(p),p])),current=previous.map(p=>byKey.get(propIdentity(p)));
    let checked=0;
    if(current.every(Boolean))for(let index=0;index<size&&checked<2500;index++){
      for(const prop of full){if(checked++>=2500)break;const legs=current.slice();legs[index]=prop;add(legs);if(freshResults.length>=8)return rank(freshResults)}
    }
  }
  return rank(freshResults.length?freshResults:results);
}
function renderMixer(){delete document.body.dataset.mixerBusy;const host=$('#mixerResult');if(mixerSelection&&!parlayMatchesFilters(mixerSelection))mixerSelection=null;$$('[data-parlay-filter-summary]').forEach(label=>label.textContent=parlayFilterSummary());const target=targetOddsFromSlider(),availablePlayers=new Set(mixerEligiblePool().map(p=>p.player)).size;$('#targetOdds').textContent=formatOddsPretty(target);if(!mixerSelection){host.innerHTML=`<div class="filtered-empty"><strong>This selection cannot form a ${+$('#legsSlider').value}-leg parlay.</strong><span>${availablePlayers<+$('#legsSlider').value?`Only ${availablePlayers} players match these filters. `:''}Try fewer legs or another prop type. Your filters stay applied.</span></div>`;host.removeAttribute('role');host.removeAttribute('tabindex');host.removeAttribute('aria-label');host.onclick=null;host.onkeydown=null;$('#mixerLoad').disabled=true;return}$('#mixerLoad').disabled=false;const r=mixerSelection,diff=Math.abs(r.american-target),match=diff<=Math.max(100,target*.05)?'Nailed it':'Closest match',open=()=>openParlayDetail(r);host.innerHTML=`<div class="mixer-result-head"><div><span>${match}</span><strong>${r.legs.length}-leg parlay</strong><small>${htmlEscape(mixerNotice||'Built from your selected props')}</small></div><div><small>BUILT ODDS</small><b>${formatOddsPretty(r.american)}</b></div><div><small>${wagerLabel()} PAYS</small><b>${formatMoney(r.dec*wagerStake())}</b></div></div><div class="mixer-legs">${r.legs.map((p,i)=>{return `<div><i>${i+1}</i><span><b>${p.player}</b><small>${p.market}</small></span><strong>${p.side} ${p.line}</strong></div>`}).join('')}</div><button type="button" class="mixer-detail-button" data-view-mixer-detail>View details & why</button>`;host.setAttribute('role','button');host.setAttribute('tabindex','0');host.setAttribute('aria-label',`View details for this ${r.legs.length}-leg generated parlay`);host.onclick=open;host.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();open()}};host.querySelector('[data-view-mixer-detail]')?.addEventListener('click',event=>{event.stopPropagation();open()})}
function generateMixer(shuffle=false){
  preferences.avoidSameGame=false;
  const target=targetOddsFromSlider(),size=+$('#legsSlider').value,scope=`${parlayFilterKey()}|${size}|${target}`,scopeChanged=scope!==mixerHistoryScope;
  if(scopeChanged){
    const restored=mixerSelection?.legs?.length===size&&parlayMatchesFilters(mixerSelection)?mixerSelection:null;
    mixerHistoryScope=scope;mixerSeenKeys.clear();mixerLastLegs.clear();mixerComboKey='';mixerPreviousSelection=restored;
    if(restored){mixerComboKey=mixerCombinationKey(restored.legs);mixerSeenKeys.add(mixerComboKey);mixerLastLegs=new Set(restored.legs.map(propIdentity))}
  }
  if(!shuffle&&!scopeChanged&&mixerPreviousSelection){
    const byKey=new Map(mixerEligiblePool().map(p=>[propIdentity(p),p])),legs=mixerPreviousSelection.legs.map(p=>byKey.get(propIdentity(p)));
    if(legs.length===size&&legs.every(Boolean)&&mixerLegsCompatible(legs)){
      const dec=legs.reduce((total,p)=>total*americanToDecimal(recommendedOdds(p)),1);
      mixerSelection={...mixerPreviousSelection,legs,dec,american:decimalToAmerican(dec)};mixerPreviousSelection=mixerSelection;renderMixer();return;
    }
  }
  const previousKey=mixerComboKey,candidates=buildMixerCandidates(size,target,shuffle);
  mixerOptionCount=candidates.length;mixerNotice='Built from your selected props';
  const chosen=candidates[0];
  if(!chosen){
    const byKey=new Map(mixerEligiblePool().map(p=>[propIdentity(p),p])),legs=(mixerPreviousSelection?.legs||[]).map(p=>byKey.get(propIdentity(p)));
    if(shuffle&&legs.length===size&&legs.every(Boolean)&&mixerLegsCompatible(legs)){
      const dec=legs.reduce((total,p)=>total*americanToDecimal(recommendedOdds(p)),1);
      mixerSelection={...mixerPreviousSelection,legs,dec,american:decimalToAmerican(dec)};mixerNotice='No different build found — try fewer legs or another prop type';
    }else mixerSelection=null;
    renderMixer();return;
  }
  if(shuffle){
    const changed=size-chosen.repeatedLegs,revisited=mixerSeenKeys.has(chosen.key);
    mixerNotice=`${revisited?'Revisited combination · ':''}${changed===size?'All '+size+' legs changed':changed+' of '+size+' legs changed'}`;
  }
  mixerSelection=chosen;mixerComboKey=chosen.key;mixerPreviousSelection=chosen;mixerLastLegs=new Set(chosen.legs.map(propIdentity));
  mixerSeenKeys.add(chosen.key);
  if(mixerSeenKeys.size>2000)mixerSeenKeys.delete(mixerSeenKeys.values().next().value);
  if(chosen.key!==previousKey)chosen.legs.forEach(p=>{const key=propIdentity(p),prop=mixerPropKey(p);mixerExposure.set(key,(mixerExposure.get(key)||0)+1);mixerPropExposure.set(prop,(mixerPropExposure.get(prop)||0)+1)});
  renderMixer();
}
function queueMixer(shuffle=false){document.body.dataset.mixerBusy='true';requestAnimationFrame(()=>generateMixer(shuffle))}
function setupParlayMixer(){const odds=$('#oddsSlider'),legs=$('#legsSlider'),maxLegs=Math.max(2,Math.min(15,+preferences.maxParlayLegs||8));legs.max=maxLegs;legs.value=Math.max(2,Math.min(+legs.value||5,maxLegs));$('#maxLegLabel').textContent=`${maxLegs} legs`;const updateTracks=()=>{const span=Math.max(1,maxLegs-2);odds.style.setProperty('--slider-fill',`${odds.value}%`);legs.style.setProperty('--slider-fill',`${((+legs.value-2)/span)*100}%`);$('#legsCount').textContent=`${legs.value} legs`};odds.oninput=()=>{updateTracks();queueMixer(false)};legs.oninput=()=>{updateTracks();mixerComboKey='';queueMixer(false)};$('#mixerShuffle').onclick=()=>queueMixer(true);$('#mixerLoad').onclick=()=>{if(!mixerSelection)return;state.slip=mixerSelection.legs.map(p=>({key:slipSelectionKey(p,p.side),p,side:p.side,odds:p.side==='Over'?p.over:p.under}));render();if(innerWidth<=720)showMobilePage('slip',true);else $('#slip').scrollIntoView({behavior:'smooth',block:'start'})};updateTracks();mixerSelection&&parlayMatchesFilters(mixerSelection)?renderMixer():generateMixer(false)}
function removeSlipLeg(index){if(!Number.isInteger(index)||index<0||index>=state.slip.length)return;state.slip.splice(index,1);render()}
function renderSlip(){const legs=$('#slipLegs');legs.innerHTML=state.slip.map((x,index)=>`<div class="slip-leg"><div><span>${x.p.sport}</span><strong>${x.p.player} ${x.side} ${x.p.line}</strong><span>${x.p.market} · ${formatOdds(x.odds)}</span></div><button type="button" data-remove-slip="${index}" aria-label="Remove ${htmlEscape(x.p.player)} ${htmlEscape(x.side)} ${htmlEscape(x.p.line)} from slip">×</button></div>`).join('');legs.querySelectorAll('[data-remove-slip]').forEach(button=>button.onclick=()=>removeSlipLeg(Number(button.dataset.removeSlip)));const has=state.slip.length>0;$('#slipEmpty').hidden=has;$('#parlaySummary').hidden=!has;($('#slipCount').textContent=state.slip.length,$('#slipCount').hidden=!state.slip.length);if(has){$('#trackParlay').textContent=state.slip.length===1?'＋ Track this pick':'＋ Track this parlay';calcParlay()}}
function weeklyStaked(){const cutoff=Date.now()-7*86400000;return trackedParlays.filter(item=>item.createdAt>=cutoff).reduce((sum,item)=>sum+item.wager,0)}
function calcParlay(){const dec=state.slip.reduce((a,x)=>a*americanToDecimal(x.odds),1),american=decimalToAmerican(dec);$('#combinedOdds').textContent=formatOddsPretty(american);$('#parlayProb').textContent=`${(100/dec)>=10?Math.round(100/dec):(100/dec).toFixed(1)}%`;const wager=Math.max(0,parseFloat($('#wager').value)||0),remaining=Math.max(0,preferences.weeklyBudget-weeklyStaked());$('#payout').textContent=formatMoney(wager*dec);const warning=$('#budgetWarning');warning.hidden=preferences.noWeeklyLimit||!preferences.weeklyBudget||wager<=remaining;warning.textContent=`This exceeds your remaining seven-day entertainment budget of ${formatMoney(remaining)}.`;scheduleShareCard()}
const playerStatsCache=new Map(),playerStatsPending=new Map();
async function playerStatsFor(p){const key=`${p.sport}|${p.player}|${p.team}`;let payload=playerStatsCache.get(key);if(payload)return payload;if(playerStatsPending.has(key))return playerStatsPending.get(key);const request=(async()=>{const params=new URLSearchParams({sport:p.sport,player:p.player,team:p.team}),response=await fetch(`/api/player-stats?${params}`),result=await response.json();if(!response.ok||result.success===false)throw new Error(result.error||'Recent games unavailable');playerStatsCache.set(key,result);return result})().finally(()=>playerStatsPending.delete(key));playerStatsPending.set(key,request);return request}
async function hydrateHitProfile(host,p){try{const payload=await playerStatsFor(p),player=payload.player||{},recent=(payload.stats||[]).map(row=>({row,date:statDate(row),metric:propMetric(p,row)})).filter(item=>item.metric.value!==null).sort((a,b)=>(b.date?.getTime()||0)-(a.date?.getTime()||0)).slice(0,10),hits=recent.filter(item=>hitAgainstLine(p,item.metric.value)===true).length;if(!host.isConnected)return;if(!recent.length){host.querySelector('strong').textContent='No graded games';host.querySelector('span').textContent='This stat is not included in the connected feed.';return}host.querySelector('strong').textContent=`${hits} of last ${recent.length}`;host.querySelector('span').textContent=`hit ${p.side.toLowerCase()} ${p.line}`;host.querySelector('i').className='';host.querySelector('i').innerHTML=recent.map(item=>`<b class="${hitAgainstLine(p,item.metric.value)?'hit':'miss'}" title="${htmlEscape(item.date?item.date.toLocaleDateString():'Game')} · ${htmlEscape(opponentLabel(item.row,player))} · ${htmlEscape(item.metric.value)}"></b>`).join('');host.querySelector('.mini-games').innerHTML=recent.map(item=>{const hit=hitAgainstLine(p,item.metric.value);return`<div class="${hit?'hit':'miss'}"><span>${item.date?item.date.toLocaleDateString([],{month:'numeric',day:'numeric'}):'Game'}</span><b>${htmlEscape(opponentLabel(item.row,player))}</b><em>${htmlEscape(item.metric.value)} · ${hit?'HIT':'MISS'}</em></div>`}).join('')}catch(error){if(host.isConnected){host.querySelector('strong').textContent='Last 10 unavailable';host.querySelector('span').textContent=error.message;host.querySelector('i').className=''}}}
async function hydrateHitProfiles(){const entries=$$('[data-hit-profile]').map(host=>({host,p:props.find(item=>item.id===+host.dataset.hitProfile)})).filter(item=>item.p);for(const item of entries)await hydrateHitProfile(item.host,item.p)}
let hitObserver=null,hitActive=0;
const hitQueue=[],hitQueuedHosts=new WeakSet();
function drainHitQueue(){while(hitActive<2&&hitQueue.length){const item=hitQueue.shift();if(!item.host.isConnected)continue;hitActive++;hydrateHitProfile(item.host,item.p).finally(()=>{hitActive--;drainHitQueue()})}}
function queueHitProfile(host,p){if(hitQueuedHosts.has(host))return;hitQueuedHosts.add(host);hitQueue.push({host,p});drainHitQueue()}
function observeHitProfiles(){const entries=$$('[data-hit-profile]').map(host=>({host,p:props.find(item=>item.id===+host.dataset.hitProfile)})).filter(item=>item.p);hitObserver?.disconnect();if('IntersectionObserver'in window){hitObserver=new IntersectionObserver(items=>items.forEach(item=>{if(!item.isIntersecting)return;const entry=entries.find(candidate=>candidate.host===item.target);if(entry)queueHitProfile(entry.host,entry.p);hitObserver.unobserve(item.target)}),{rootMargin:'280px 0px'});entries.slice(3).forEach(entry=>hitObserver.observe(entry.host))}entries.slice(0,3).forEach(entry=>queueHitProfile(entry.host,entry.p))}
const htmlEscape=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const statSources=row=>[row,row?.stats,row?.statistics,row?.totals].filter(Boolean);
function statNumber(row,aliases){for(const source of statSources(row)){for(const alias of aliases){const value=source?.[alias];if(value!==null&&value!==undefined&&Number.isFinite(+value))return +value}}return null}
const statSum=(row,groups)=>{const values=groups.map(group=>statNumber(row,group));return values.some(value=>value!==null)?values.reduce((sum,value)=>sum+(value||0),0):null};
function propMetric(p,row){const market=p.market.toLowerCase();if(market.includes('hits + runs + rbis'))return{label:'H + R + RBI',value:statSum(row,[['hits','h'],['runs','r'],['runs_batted_in','rbi','rbis']])};if(market.includes('points + rebounds + assists'))return{label:'PTS + REB + AST',value:statSum(row,[['pts','points'],['reb','rebounds','total_rebounds'],['ast','assists']])};if(market.includes('points + rebounds'))return{label:'PTS + REB',value:statSum(row,[['pts','points'],['reb','rebounds','total_rebounds']])};if(market.includes('points + assists'))return{label:'PTS + AST',value:statSum(row,[['pts','points'],['ast','assists']])};if(market.includes('rebounds + assists'))return{label:'REB + AST',value:statSum(row,[['reb','rebounds','total_rebounds'],['ast','assists']])};if(market.includes('pass + rush + receiving yards'))return{label:'Total yards',value:statSum(row,[['passing_yards','pass_yds'],['rushing_yards','rush_yds'],['receiving_yards','rec_yds']])};if(market.includes('passing + rushing yards'))return{label:'Pass + rush yds',value:statSum(row,[['passing_yards','pass_yds'],['rushing_yards','rush_yds']])};if(market.includes('rush + receiving yards'))return{label:'Rush + rec yds',value:statSum(row,[['rushing_yards','rush_yds'],['receiving_yards','rec_yds']])};if(market.includes('touchdown')||market.includes('scorer'))return{label:'TDs',value:statSum(row,[['rushing_touchdowns','rushing_tds','rush_td'],['receiving_touchdowns','receiving_tds','rec_td']])};if(market.includes('home run'))return{label:'HR',value:statNumber(row,['home_runs','home_runs_hit','hr'])};if(market.includes('total bases'))return{label:'TB',value:statNumber(row,['total_bases','tb'])};if(market.includes('pitcher strikeout'))return{label:'K',value:statNumber(row,['strikeouts','pitcher_strikeouts','so'])};if(market==='hits')return{label:'Hits',value:statNumber(row,['hits','h'])};if(market.includes('rbi'))return{label:'RBI',value:statNumber(row,['runs_batted_in','rbi','rbis'])};if(market==='runs')return{label:'Runs',value:statNumber(row,['runs','r'])};if(market.includes('stolen base'))return{label:'SB',value:statNumber(row,['stolen_bases','sb'])};if(market.includes('passing yards'))return{label:'Pass yds',value:statNumber(row,['passing_yards','pass_yds'])};if(market.includes('passing touchdown'))return{label:'Pass TD',value:statNumber(row,['passing_touchdowns','passing_tds','pass_td'])};if(market.includes('pass completion'))return{label:'CMP',value:statNumber(row,['passing_completions','completions','cmp'])};if(market.includes('pass attempt'))return{label:'ATT',value:statNumber(row,['passing_attempts','attempts','pass_att'])};if(market.includes('interception'))return{label:'INT',value:statNumber(row,['passing_interceptions','interceptions','int'])};if(market.includes('rushing yards'))return{label:'Rush yds',value:statNumber(row,['rushing_yards','rush_yds'])};if(market.includes('rush attempt'))return{label:'Carries',value:statNumber(row,['rushing_attempts','rush_attempts','carries'])};if(market.includes('receiving yards'))return{label:'Rec yds',value:statNumber(row,['receiving_yards','rec_yds'])};if(market.includes('reception'))return{label:'REC',value:statNumber(row,['receptions','rec'])};if(market.includes('3-pointer'))return{label:'3PM',value:statNumber(row,['fg3m','three_pointers_made','three_point_field_goals_made'])};if(market==='points')return{label:'PTS',value:statNumber(row,['pts','points'])};if(market==='rebounds')return{label:'REB',value:statNumber(row,['reb','rebounds','total_rebounds'])};if(market==='assists')return{label:'AST',value:statNumber(row,['ast','assists'])};if(market==='blocks')return{label:'BLK',value:statNumber(row,['blk','blocks'])};if(market==='steals')return{label:'STL',value:statNumber(row,['stl','steals'])};if(market.includes('shots on goal')||market==='shots')return{label:'SOG',value:statNumber(row,['shots_on_goal','shots','sog'])};if(market==='goals')return{label:'Goals',value:statNumber(row,['goals'])};if(market==='saves')return{label:'Saves',value:statNumber(row,['saves','goalie_saves'])};return{label:p.market,value:null}}
// Passing touchdowns must be graded from the passing-touchdown field. Keep this
// correction after the broad market parser so it overrides its older ordering.
const propMetricBase=propMetric;
propMetric=(p,row)=>BTGStats.metric(p,row);
function statDate(row){const value=row?.game?.date||row?.game?.datetime||row?.date||row?.game_date||row?.game?.start_time;const date=new Date(value);return Number.isNaN(date.getTime())?null:date}
function opponentLabel(row,player){const game=row?.game||{},teamId=player?.team?.id,home=game.home_team||game.home,away=game.visitor_team||game.away_team||game.away;const name=team=>team?.full_name||team?.name||team?.abbreviation||'';if(teamId&&home?.id===teamId)return`vs ${name(away)}`;if(teamId&&away?.id===teamId)return`@ ${name(home)}`;return name(away)||name(home)||`Game ${game.id||''}`.trim()}
function hitAgainstLine(p,value){const result=BTGStats.grade(p.side,p.binary?.5:p.line,value);return result==='won'?true:result==='lost'?false:null}
function renderPlayerProfile(p,payload){const player=payload.player||{},rows=(payload.stats||[]).map(row=>({row,date:statDate(row),metric:propMetric(p,row)})).sort((a,b)=>(b.date?.getTime()||0)-(a.date?.getTime()||0)),measured=rows.filter(item=>item.metric.value!==null),recent=measured.slice(0,10),last5=recent.slice(0,5),hits=recent.filter(item=>hitAgainstLine(p,item.metric.value)===true).length,hits5=last5.filter(item=>hitAgainstLine(p,item.metric.value)===true).length,average=list=>list.length?(list.reduce((sum,item)=>sum+item.metric.value,0)/list.length).toFixed(1):'—',team=player.team?.full_name||player.team?.name||player.team?.abbreviation||p.team.split(' · ')[0],position=player.position||player.position_abbreviation||'',jersey=player.jersey_number||player.jersey||'',metricLabel=measured[0]?.metric.label||p.market;$('#playerProfile').innerHTML=`<div class="player-profile-head"><div class="avatar">${htmlEscape(p.player.split(' ').map(part=>part[0]).join(''))}</div><div><p class="eyebrow">${htmlEscape(p.sport)} · PLAYER PROFILE</p><h2>${htmlEscape(p.player)}</h2><span>${htmlEscape([team,position,jersey?`#${jersey}`:''].filter(Boolean).join(' · '))}</span></div></div><div class="profile-line"><span>Current prop</span><strong>${htmlEscape(p.market)} · ${htmlEscape(p.side)} ${htmlEscape(p.line)}</strong></div>${measured.length?`<div class="profile-summary"><div><span>Last 5 avg</span><strong>${average(last5)}</strong><small>${htmlEscape(metricLabel)}</small></div><div><span>Last 5</span><strong>${hits5}-${last5.length-hits5}</strong><small>vs this line</small></div><div><span>Last 10</span><strong>${hits}-${recent.length-hits}</strong><small>vs this line</small></div></div><div class="recent-games-head"><div><h3>Recent games</h3><span>Compared with today’s ${htmlEscape(p.line)} line</span></div><span>${htmlEscape(metricLabel)}</span></div><div class="recent-games">${recent.slice(0,5).map(item=>{const hit=hitAgainstLine(p,item.metric.value);return`<div class="recent-game"><span><b>${item.date?item.date.toLocaleDateString([],{month:'short',day:'numeric'}):'Season'}</b><small>${htmlEscape(opponentLabel(item.row,player))}</small></span><strong>${htmlEscape(item.metric.value)}</strong><em class="${hit?'hit':'miss'}">${hit?'HIT':'MISS'}</em></div>`}).join('')}</div>`:`<div class="profile-empty"><strong>Player matched. Recent ${htmlEscape(p.market.toLowerCase())} data is not included yet.</strong><span>The profile is connected, but this sport or statistic may require a higher BALLDONTLIE plan.</span></div>`}<button class="primary" id="profileAdd">Add ${htmlEscape(p.side)} ${htmlEscape(p.line)} to parlay</button><p class="profile-source">Stats supplied by BALLDONTLIE. Betting lines remain from the live odds board.</p>`;$('#profileAdd').onclick=()=>{toggleLeg(p,p.side);$('#playerDialog').close()}}
renderPlayerProfile=function(p,payload){const player=payload.player||{},rows=(payload.stats||[]).map(row=>({row,date:statDate(row),metric:propMetric(p,row)})).sort((a,b)=>(b.date?.getTime()||0)-(a.date?.getTime()||0)),measured=rows.filter(item=>item.metric.value!==null),recent=measured.slice(0,10),last5=recent.slice(0,5),hitsFor=list=>list.filter(item=>hitAgainstLine(p,item.metric.value)===true).length,average=list=>list.length?list.reduce((sum,item)=>sum+item.metric.value,0)/list.length:null,avg5=average(last5),avg10=average(recent),hits5=hitsFor(last5),hits10=hitsFor(recent),high=recent.length?Math.max(...recent.map(item=>item.metric.value)):null,low=recent.length?Math.min(...recent.map(item=>item.metric.value)):null,team=player.team?.full_name||player.team?.name||player.team?.abbreviation||p.team.split(' · ')[0],position=player.position||player.position_abbreviation||'',jersey=player.jersey_number||player.jersey||'',metricLabel=measured[0]?.metric.label||p.market,profileBits=[team,position,jersey?`#${jersey}`:'',player.experience||'',player.college||''].filter(Boolean),pct=(hits,total)=>total?`${Math.round(hits/total*100)}%`:'—';$('#playerProfile').innerHTML=`<div class="player-profile-head"><div class="avatar">${htmlEscape(p.player.split(' ').map(part=>part[0]).join(''))}</div><div><p class="eyebrow">NFL · PLAYER INTELLIGENCE</p><h2>${htmlEscape(p.player)}</h2><span>${htmlEscape(profileBits.join(' · '))}</span></div></div><div class="profile-line"><span>Current market</span><strong>${htmlEscape(p.side)} ${htmlEscape(p.line)} ${htmlEscape(p.market)} · ${formatOdds(recommendedOdds(p))}</strong><small data-game-time="${htmlEscape(gameName(p))}" data-kickoff="${htmlEscape(p.startsAt||'')}" data-default-time="${htmlEscape(p.time)}">${htmlEscape(p.time)}</small></div>${measured.length?`<div class="profile-summary profile-summary-deep"><div><span>L5 average</span><strong>${avg5?.toFixed(1)??'—'}</strong><small>${htmlEscape(metricLabel)}</small></div><div><span>L10 average</span><strong>${avg10?.toFixed(1)??'—'}</strong><small>${htmlEscape(metricLabel)}</small></div><div><span>L5 hit rate</span><strong>${pct(hits5,last5.length)}</strong><small>${hits5} of ${last5.length}</small></div><div><span>L10 hit rate</span><strong>${pct(hits10,recent.length)}</strong><small>${hits10} of ${recent.length}</small></div><div><span>L10 range</span><strong>${low}–${high}</strong><small>low to high</small></div><div><span>Market edge</span><strong>${p.edge}%</strong><small>${p.bookCount||'—'} books checked</small></div></div><div class="trend-strip"><span>LAST ${recent.length}</span>${recent.map(item=>`<i class="${hitAgainstLine(p,item.metric.value)?'hit':'miss'}" style="--bar:${Math.max(12,Math.min(100,item.metric.value/(high||1)*100))}%" title="${htmlEscape(item.metric.value)}"></i>`).join('')}</div><div class="recent-games-head"><div><h3>Game log</h3><span>Each result compared with ${htmlEscape(p.side)} ${htmlEscape(p.line)}</span></div><span>${htmlEscape(metricLabel)}</span></div><div class="recent-games deep-games">${recent.map(item=>{const hit=hitAgainstLine(p,item.metric.value),game=item.row?.game||{};return`<div class="recent-game"><span><b>${item.date?item.date.toLocaleDateString([],{month:'short',day:'numeric'}):'Season'}</b><small>${htmlEscape(opponentLabel(item.row,player))} · ${game.week?`Week ${game.week}`:LEAGUE}</small></span><strong>${htmlEscape(item.metric.value)}</strong><em class="${hit?'hit':'miss'}">${hit?'HIT':'MISS'}</em></div>`}).join('')}</div>`:`<div class="profile-empty"><strong>${htmlEscape(p.player)} was matched, but this market is not available in the current stat package.</strong><span>The live price remains valid; recent-game grading will appear when the matching NFL statistic is supplied.</span></div>`}<div class="profile-actions"><button class="primary" id="profileAdd">Add ${htmlEscape(p.side)} ${htmlEscape(p.line)} to parlay</button><button class="profile-analysis" id="profileAnalysis">View price analysis</button></div><p class="profile-source">Recent NFL game stats: BALLDONTLIE · Live prices: multi-book odds feed · Always verify before placing a bet.</p>`;$('#profileAdd').onclick=()=>{toggleLeg(p,p.side);$('#playerDialog').close()};$('#profileAnalysis').onclick=()=>{$('#playerDialog').close();openDetail(p)}}
function matchupTeamParts(value){
  const raw=String(value||'').replace(/\s+/g,' ').trim();
  const match=raw.match(/^(.*?)\s*(?:·\s*)?(@|vs\.?|at\b)\s*(.*?)$/i);
  return match?[match[1].trim(),match[3].trim()]:[];
}
function matchupTeamTokens(team){
  const raw=String(team?.full_name||team?.name||team?.abbreviation||team||'').toLowerCase().trim(),tokens=new Set();
  if(team?.id!==undefined&&team?.id!==null)tokens.add(`id:${team.id}`);
  if(team?.abbreviation)tokens.add(String(team.abbreviation).toLowerCase());
  if(raw){tokens.add(raw.replace(/[^a-z0-9]/g,''));const words=raw.split(/\s+/);tokens.add(words.at(-1).replace(/[^a-z0-9]/g,''));}
  if(typeof nflTeamAbbreviations!=='undefined')Object.entries(nflTeamAbbreviations).forEach(([name,abbr])=>{const compactName=name.replace(/[^a-z0-9]/g,'');if(raw.includes(compactName)||raw===abbr.toLowerCase())tokens.add(abbr.toLowerCase())});
  return [...tokens].filter(Boolean);
}
function matchupTeamsEqual(a,b){const left=matchupTeamTokens(a),right=matchupTeamTokens(b);return left.some(token=>right.includes(token)&&!token.startsWith('id:')||token.startsWith('id:')&&right.includes(token))}
function matchupGameTeams(row){const game=row?.game||{};return {home:game.home_team||game.home||game.homeTeam||null,away:game.visitor_team||game.away_team||game.away||game.visitorTeam||null}}
function matchupRowPlayerTeam(row,player){return row?.team||row?.team_data||row?.player_team||row?.player?.team||((row?.team_id||row?.teamId)?{id:row.team_id||row.teamId}:player?.team)||player?.team||null}
function profileOpponentName(p,player){
  const parts=matchupTeamParts(p?.team),current=player?.team||player?.team_data||player?.team_name||'';
  if(parts.length<2)return '';
  const first={name:parts[0]},second={name:parts[1]};
  // Odds feeds list away/home, not player/opponent. Use the matched player
  // team to determine which side is the opponent for every NFL team.
  if(matchupTeamsEqual(first,current))return parts[1];
  if(matchupTeamsEqual(second,current))return parts[0];
  return parts[1];
}
function matchupOpponentMatches(row,p,player){
  const target=profileOpponentName(p,player);if(!target)return false;
  const {home,away}=matchupGameTeams(row),own=matchupRowPlayerTeam(row,player);
  let opponent=null;
  if(home&&matchupTeamsEqual(own,home))opponent=away;
  else if(away&&matchupTeamsEqual(own,away))opponent=home;
  else {
    const targetTokens=matchupTeamTokens({name:target});
    if(home&&matchupTeamTokens(home).some(token=>targetTokens.includes(token)))opponent=home;
    if(away&&matchupTeamTokens(away).some(token=>targetTokens.includes(token)))opponent=away;
  }
  if(!opponent)return false;
  return matchupTeamsEqual(opponent,{name:target});
}
const renderPlayerProfileWithReliableMatchups=renderPlayerProfile;
renderPlayerProfile=function(p,payload){
  renderPlayerProfileWithReliableMatchups(p,payload);
  const panel=$('#playerProfile [data-profile-panel="matchup"]'),player=payload.player||{};
  if(!panel)return;
  const rows=(payload.stats||[]).map(row=>({row,date:statDate(row)})).sort((a,b)=>(b.date?.getTime()||0)-(a.date?.getTime()||0)),meetings=rows.filter(item=>matchupOpponentMatches(item.row,p,player)).slice(0,3),target=profileOpponentName(p,player)||'this opponent';
  const value=(row,...keys)=>BTGStats.read(row,keys);
  const statLine=row=>{const parts=[],pass=value(row,'passing_yards','pass_yards'),rush=value(row,'rushing_yards','rush_yds'),rec=value(row,'receiving_yards','rec_yds'),receptions=value(row,'receptions','rec'),td=value(row,'total_touchdowns','touchdowns','rushing_touchdowns','receiving_touchdowns');if(pass!==null)parts.push(`Pass ${pass}`);if(rush!==null)parts.push(`Rush ${rush}`);if(rec!==null)parts.push(`Rec ${rec}${receptions!==null?` (${receptions})`:''}`);if(td!==null)parts.push(`TD ${td}`);return parts.join(' · ')||'Box-score detail unavailable'};
  panel.innerHTML=`<div class="profile-panel-title"><div><p class="eyebrow">MATCHUP HISTORY</p><h3>Last 3 vs ${htmlEscape(target)}</h3></div><span>${meetings.length}/3 games found</span></div><div class="profile-game-log matchup-log">${meetings.length?meetings.map(item=>`<div class="profile-game-row matchup"><span><strong>${item.date?item.date.toLocaleDateString([],{month:'short',day:'numeric',year:'numeric'}):'Game'}</strong><small>${htmlEscape(opponentLabel(item.row,player))}${item.row?.game?.week?` · Week ${htmlEscape(item.row.game.week)}`:''}</small></span><b>${htmlEscape(statLine(item.row))}</b><em class="neutral">FULL LINE</em></div>`).join(''):'<div class="profile-empty"><strong>No verified meetings found.</strong><span>The connected feed may not include three prior regular/postseason meetings for this player and opponent.</span></div>'}</div>`;
};
let playerProfileRequest=0;
async function openPlayerProfile(p){
  const request=++playerProfileRequest,dialog=$('#playerDialog'),content=$('#playerProfile');
  dialog.showModal();dialog.setAttribute('tabindex','-1');dialog.focus({preventScroll:true});
  content.innerHTML=`<div class="profile-loading"><div class="avatar">${htmlEscape(p.player.split(' ').map(part=>part[0]).join(''))}</div><strong>Loading ${htmlEscape(p.player)}…</strong><span>Pulling regular and postseason game logs.</span><i></i><i></i><i></i></div>`;
  try{
    const payload=await playerStatsFor(p);
    if(dialog.open&&request===playerProfileRequest)renderPlayerProfile(p,payload);
  }catch(error){
    if(!dialog.open||request!==playerProfileRequest)return;
    content.innerHTML=`<div class="profile-error"><h2>${htmlEscape(p.player)}</h2><strong>${htmlEscape(error.message)}</strong><span>Try this player again shortly.</span><button class="primary" id="profileRetry">Try again</button></div>`;
    $('#profileRetry')?.addEventListener('click',()=>openPlayerProfile(p));
  }
}
function openDetail(p){const fresh=feedUpdatedAt?feedUpdatedAt.toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'Not available',bookUrl=sportsbookDestination(p.bestBook);$('#detailContent').innerHTML=`<p class="eyebrow">${p.sport} · PRICE ANALYSIS</p><h2>${p.player}</h2><p>${p.team} · ${p.time}</p><div class="detail-grid"><div class="detail-stat"><span>Recommended line</span><strong>${p.side} ${p.line}</strong></div><div class="detail-stat"><span>Market edge</span><strong>${p.edge}%</strong></div><div class="detail-stat"><span>Market fair chance</span><strong>${p.fairChance?`${p.fairChance}%`:'—'}</strong></div><div class="detail-stat"><span>Sportsbooks checked</span><strong>${p.bookCount||'Limited'}</strong></div><div class="detail-stat"><span>Best listed at</span><strong>${p.bestBook||'Best available'}</strong></div><div class="detail-stat"><span>Updated</span><strong>${fresh}</strong></div></div><p class="thesis"><strong>Why it appears:</strong> ${p.note}. The edge compares the best posted price with the no-vig consensus of available books. It is a price signal—not a guarantee or a performance projection.</p><div class="data-boundary"><strong>What is verified now</strong><span>Current price, market consensus, sportsbook coverage and line movement.</span><strong>Waiting for connected feeds</strong><span>Independent player projection, injuries, weather and confirmed lineups.</span></div>${bookUrl?`<a class="primary detail-book-link" id="detailBook" href="${bookUrl}" target="_blank" rel="noopener noreferrer">Open ${p.bestBook} ↗</a>`:''}<button class="primary" id="detailAdd">Add ${p.side} ${p.line} to parlay</button>`;$('#detailDialog').showModal();$('#detailBook')?.addEventListener('click',()=>navigator.clipboard?.writeText(betHandoffText(p)).catch(()=>{}));$('#detailAdd').onclick=()=>{toggleLeg(p,p.side);$('#detailDialog').close()}}
const unique=items=>[...new Set(items)].sort();
function setOptions(select,values,allLabel,current){select.innerHTML=`<option value="All">${allLabel}</option>`+values.map(value=>`<option value="${value}">${value}</option>`).join('');select.value=values.includes(current)?current:'All';return select.value}
function setDayOptions(values,current){const sorted=[...new Set(values.filter(Boolean))].sort((a,b)=>a.localeCompare(b));const select=$('#dayFilterAdvanced');select.innerHTML='<option value="All">Any day</option>'+sorted.map(value=>`<option value="${value}">${dayLabel(value)}</option>`).join('');select.value=sorted.includes(current)?current:'All';return select.value}
function gameStartTimestamp(value){if(value===null||value===undefined||value==='')return Infinity;const timestamp=new Date(value).getTime();return Number.isFinite(timestamp)?timestamp:Infinity}
const kickoffFormatter=new Intl.DateTimeFormat(undefined,{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',hour12:true,timeZoneName:'short'});
function formatKickoff(value){const timestamp=gameStartTimestamp(value);return Number.isFinite(timestamp)?kickoffFormatter.format(timestamp):'Kickoff TBD'}
const nflTeamAbbreviations={cardinals:'ARI',falcons:'ATL',ravens:'BAL',bills:'BUF',panthers:'CAR',bears:'CHI',bengals:'CIN',browns:'CLE',cowboys:'DAL',broncos:'DEN',lions:'DET',packers:'GB',texans:'HOU',colts:'IND',jaguars:'JAX',chiefs:'KC',raiders:'LV',chargers:'LAC',rams:'LAR',dolphins:'MIA',vikings:'MIN',patriots:'NE',saints:'NO',giants:'NYG',jets:'NYJ',eagles:'PHI',steelers:'PIT','49ers':'SF',seahawks:'SEA',buccaneers:'TB',titans:'TEN',commanders:'WAS'};
function compactTeamName(name){const full=String(name||'').trim();return nflTeamAbbreviations[full.toLowerCase().split(/\s+/).pop()]||full}
function compactGameName(name){const match=String(name).match(/^(.*?)\s+(@|vs\.?)\s+(.+)$/i);return match?`${compactTeamName(match[1])} ${match[2]} ${compactTeamName(match[3])}`:name}
const compactKickoffFormatter=new Intl.DateTimeFormat('en-US',{weekday:'short',month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit',hour12:true});
function formatCompactKickoff(value){
  const timestamp=gameStartTimestamp(value);
  if(!Number.isFinite(timestamp))return 'Kickoff TBD';
  const parts=Object.fromEntries(compactKickoffFormatter.formatToParts(timestamp).map(part=>[part.type,part.value]));
  return `${parts.weekday} ${parts.month}/${parts.day} · ${parts.hour}:${parts.minute}${parts.dayPeriod.toLowerCase()[0]}`;
}
// Merge posted and scheduled games before sorting so extra boards cannot jump the kickoff queue.
function gameCatalog(propPool,schedulePool){
  const games=new Map();
  for(const schedule of schedulePool){
    const name=scheduleGameName(schedule),timestamp=gameStartTimestamp(schedule.status?.startsAt),previous=games.get(name);
    if(!previous||timestamp<previous.timestamp)games.set(name,{name,timestamp,count:0,schedule});
  }
  for(const prop of propPool){
    const name=gameName(prop),timestamp=gameStartTimestamp(prop.startsAt),game=games.get(name)||{name,timestamp,count:0,schedule:null};
    game.count++;
    if(!Number.isFinite(gameStartTimestamp(game.schedule?.status?.startsAt)))game.timestamp=Math.min(game.timestamp,timestamp);
    games.set(name,game);
  }
  return [...games.values()].sort((a,b)=>(a.timestamp-b.timestamp)||a.name.localeCompare(b.name));
}
function setGameOptions(select,games,current){
  if(current!=='All'&&!games.some(game=>game.name===current))games=[...games,{name:current,timestamp:Infinity}];
  select.innerHTML='<option value="All">Any game</option>'+games.map(game=>`<option value="${htmlEscape(game.name)}">${htmlEscape(game.name)} · ${htmlEscape(formatKickoff(game.timestamp))}</option>`).join('');
  select.value=games.some(game=>game.name===current)?current:'All';
  return select.value;
}
function refreshDependentOptions(){const allSportProps=props.filter(p=>state.sport==='All'||p.sport===state.sport),allSchedule=scheduleGames.filter(game=>state.sport==='All'||game.leagueID===state.sport);state.day=setDayOptions([...allSportProps.map(propDay),...allSchedule.map(scheduleDay)],state.day);const sportPool=allSportProps.filter(p=>state.day==='All'||propDay(p)===state.day),schedulePool=allSchedule.filter(game=>state.day==='All'||scheduleDay(game)===state.day);state.game=setGameOptions($('#gameFilterAdvanced'),gameCatalog(sportPool,schedulePool),state.game);state.team=setOptions($('#teamFilterAdvanced'),unique([...sportPool.flatMap(teamParts),...schedulePool.flatMap(scheduleTeams)]),'Any team',state.team)}
function refreshFilterCatalog(){const sportSelect=$('#sportFilterAdvanced');sportSelect.innerHTML=`<option value="${LEAGUE}">${LEAGUE}</option>`;state.sport=LEAGUE;state.market=setOptions($('#propFilterAdvanced'),unique([...props.map(p=>p.market),...(state.market==='All'?[]:[state.market])]),'All prop types',state.market);refreshDependentOptions()}
function renderBoardSubtabs(){
  const parlayMode=['parlays','generator'].includes(document.body.dataset.mobilePage),marketKey=parlayMode?'market':'boardMarket',gameKey=parlayMode?'game':'boardGame';
  const marketBar=$('#propTypeTabs'),gameBar=$('#gameTabs'),sportProps=props.filter(p=>p.sport===state.boardSport);
  if(state.boardSport==='All'){marketBar.hidden=true;gameBar.hidden=true;state.boardMarket='All';state.boardGame='All';return}
  const counts=marketCounts(sportProps),markets=[...counts.keys()].sort((a,b)=>counts.get(b)-counts.get(a)||a.localeCompare(b));
  if(!markets.includes(state[marketKey])){if(parlayMode&&state[marketKey]!=='All')markets.push(state[marketKey]);else state[marketKey]='All'}
  marketBar.hidden=false;
  marketBar.innerHTML=`<span>PROP TYPE</span><button class="sub-tab ${state[marketKey]==='All'?'active':''}" data-board-market="All">${parlayMode?'All props':'Popular'}</button>`+markets.map(market=>`<button class="sub-tab ${state[marketKey]===market?'active':''}" data-board-market="${htmlEscape(market)}">${htmlEscape(market)}<b>${counts.get(market)||0}</b></button>`).join('');
  marketBar.querySelectorAll('[data-board-market]').forEach(button=>button.onclick=()=>{state[marketKey]=button.dataset.boardMarket;propRenderLimit=24;parlayMode?filtersChanged():render()});
  // Prop type changes the matching counts, not the game catalog or selected game.
  const marketProps=sportProps.filter(p=>state[marketKey]==='All'||p.market===state[marketKey]),gameCounts=new Map(),games=gameCatalog(sportProps,scheduleGames.filter(game=>game.leagueID===state.boardSport));
  marketProps.forEach(prop=>gameCounts.set(gameName(prop),(gameCounts.get(gameName(prop))||0)+1));
  games.forEach(game=>game.count=!parlayMode&&state[marketKey]==='All'?bestOfBest(game.name).length:gameCounts.get(game.name)||0);
  if(!games.some(game=>game.name===state[gameKey])){if(parlayMode&&state[gameKey]!=='All')games.push({name:state[gameKey],timestamp:Infinity,count:0,schedule:null});else state[gameKey]='All'}
  const scrollLeft=gameBar.scrollLeft;
  gameBar.hidden=false;
  gameBar.innerHTML=`<span>GAME</span><button type="button" role="tab" aria-selected="${state[gameKey]==='All'}" class="sub-tab ${state[gameKey]==='All'?'active':''}" data-board-game="All">All games</button>`+games.map(game=>{
    const kickoff=htmlEscape(formatCompactKickoff(game.timestamp)),fullLabel=htmlEscape(`${game.name} · ${formatKickoff(game.timestamp)} · ${game.count} matching props`),time=Number.isFinite(game.timestamp)?`<time class="game-tab-time" datetime="${new Date(game.timestamp).toISOString()}">${kickoff}</time>`:`<span class="game-tab-time">${kickoff}</span>`;
    return `<button type="button" role="tab" aria-selected="${state[gameKey]===game.name}" aria-label="${fullLabel}" title="${fullLabel}" class="sub-tab game-tab ${state[gameKey]===game.name?'active':''} ${game.count?'':'scheduled'}" data-board-game="${htmlEscape(game.name)}" data-kickoff="${Number.isFinite(game.timestamp)?new Date(game.timestamp).toISOString():''}"><span class="game-tab-name">${htmlEscape(compactGameName(game.name))}${game.count?`<b aria-hidden="true">${game.count}</b>`:''}</span>${time}</button>`;
  }).join('');
  gameBar.scrollLeft=scrollLeft;
  gameBar.querySelectorAll('[data-board-game]').forEach(button=>button.onclick=async()=>{
    state[gameKey]=button.dataset.boardGame;
    const selected=games.find(game=>game.name===state[gameKey]);
    parlayMode?filtersChanged():render();
    if(selected?.schedule)await loadBoardGame(selected.schedule);
  });window.BTGLive?.updateLabels();
}
async function loadBoardGame(game,rerender=true){
  if(!game||futurePropBoards.has(game.eventID))return;
  if(rerender)$('#feedMessage').textContent=`Loading ${scheduleGameName(game)} props…`;
  let request=eventBoardRequests.get(game.eventID);
  if(!request){
    request=(async()=>{
      const cacheKey=`bet-this-guy-event-v6-${game.eventID}`;
      let cached=null;try{cached=JSON.parse(localStorage.getItem(cacheKey)||'null')}catch{}
      let board;
      if(cached?.at&&Date.now()-cached.at<600000&&Array.isArray(cached.props)&&window.BTGMovement?.hasEvent(game.eventID))board=cached.props;
      else{
        const response=await fetch(`/api/event?eventID=${encodeURIComponent(game.eventID)}`),payload=await response.json();
        if(!response.ok||payload.success===false)throw new Error(payload.error||'Game props could not be loaded.');
        board=normalizeLiveProps(payload);
        try{localStorage.setItem(cacheKey,JSON.stringify({at:Date.now(),props:board}))}catch{}
      }
      futurePropBoards.set(game.eventID,board);return board;
    })().finally(()=>eventBoardRequests.delete(game.eventID));
    eventBoardRequests.set(game.eventID,request);
  }
  try{
    const board=await request;
    if(rerender){rebuildPropBoard();$('#feedMessage').textContent=board.length?`${board.length} props loaded for ${scheduleGameName(game)}.`:`Sportsbooks have not posted player props for ${scheduleGameName(game)} yet.`;refreshFilterCatalog();filtersChanged()}
    return board;
  }catch(error){if(rerender){$('#feedMessage').textContent=error.message;render()}return[]}
}
let parlayUniversePromise=null,parlayUniverseReady=false;
async function ensureParlayUniverse(){if(parlayUniverseReady)return;if(parlayUniversePromise)return parlayUniversePromise;parlayUniversePromise=(async()=>{if(!scheduleGames.length)await loadFutureSchedule();const loadedEvents=new Set([...baseLiveProps,...futurePropBoards.values()].flat().map(prop=>prop.eventID)),games=[...scheduleGames].filter(game=>game.leagueID===LEAGUE&&!loadedEvents.has(game.eventID)&&!futurePropBoards.has(game.eventID)).sort((a,b)=>new Date(a.status?.startsAt)-new Date(b.status?.startsAt));if(games.length){$('#feedMessage').textContent=`Checking all ${games.length} remaining NFL game boards…`;for(let index=0;index<games.length;index+=3)await Promise.all(games.slice(index,index+3).map(game=>loadBoardGame(game,false)))}rebuildPropBoard();mixerCandidateCache.clear();parlayFeeds.forEach(feed=>feed.length=0);parlaySignatures.forEach(set=>set.clear());refreshFilterCatalog();filtersChanged();parlayUniverseReady=true;const covered=new Set(props.map(prop=>prop.eventID)).size,scheduled=scheduleGames.filter(game=>game.leagueID===LEAGUE).length;$('#feedMessage').textContent=`${LEAGUE} board: ${props.length} props across ${covered} games${scheduled?` · ${scheduled-covered} scheduled games do not have player props posted yet`:''}.`})().finally(()=>{parlayUniversePromise=null});return parlayUniversePromise}
function prioritizeFeaturedTabs(){const featured={MLB:['Home Runs','Total Bases','Hits','Pitcher Strikeouts','RBIs','Runs','Hits + Runs + RBIs','Stolen Bases','First Home Run'],NFL:['Anytime Touchdown','First Touchdown','Passing Yards','Receiving Yards','Rushing Yards','Receptions','Passing Touchdowns','Rush + Receiving Yards','Touchdowns','Pass Completions','Pass Attempts','Interceptions Thrown'],NCAAF:['Anytime Touchdown','First Touchdown','Passing Yards','Receiving Yards','Rushing Yards','Receptions','Passing Touchdowns','Rush + Receiving Yards','Touchdowns'],NBA:['Points','Points + Rebounds + Assists','3-Pointers Made','Rebounds','Assists','Points + Rebounds','Points + Assists','Double-Double','First Basket','Triple-Double'],NCAAB:['Points','Points + Rebounds + Assists','3-Pointers Made','Rebounds','Assists','Points + Rebounds','Points + Assists','Double-Double','First Basket','Triple-Double'],NHL:['Shots on Goal','Anytime Goal Scorer','Points','Goals','Assists','Saves','Power Play Points','Blocked Shots','First Goal Scorer']}[state.boardSport]||[],bar=$('#propTypeTabs'),popular=bar.querySelector('[data-board-market="All"]');[...featured].reverse().forEach(label=>{const button=[...bar.querySelectorAll('[data-board-market]')].find(item=>item.dataset.boardMarket===label);if(button)bar.insertBefore(button,popular.nextSibling)})}
function renderSportTabs(){state.boardSport=LEAGUE;renderBoardSubtabs();prioritizeFeaturedTabs()}
function activeFilterTotal(){return[state.game,state.team,state.day,state.timeSlot,state.market,state.side,state.move,state.oddsType].filter(v=>v!=='All').length+[state.minEdge,state.minConf].filter(Boolean).length+(state.heat?1:0)}
function syncFilterUI(){
  renderSportTabs();
  $('#sportFilterAdvanced').value=state.sport;$('#gameFilterAdvanced').value=state.game;$('#teamFilterAdvanced').value=state.team;$('#dayFilterAdvanced').value=state.day;$('#timeFilterAdvanced').value=state.timeSlot;$('#propFilterAdvanced').value=state.market;$('#sideFilterAdvanced').value=state.side;$('#heatFilterAdvanced').value=state.heat||'All';$('#moveFilterAdvanced').value=state.move;$('#edgeFilterAdvanced').value=String(state.minEdge);$('#confidenceFilterAdvanced').value=String(state.minConf);$('#oddsFilterAdvanced').value=state.oddsType;$('#sortFilterAdvanced').value=state.sort;$('#marketFilter').value=state.market;$('#sortFilter').value=state.sort;
  $$('.sport-tab').forEach(tab=>tab.classList.toggle('active',tab.dataset.sport===state.boardSport));
  const count=props.filter(matchesCoreFilters).length,active=activeFilterTotal(),parts=[LEAGUE,state.day==='All'?'Any day':dayLabel(state.day),state.game==='All'?'All games':state.game,state.market==='All'?'All props':state.market];
  $('#filterSummary').textContent=parts.join(' · ');$('#filterMatchCount').textContent=`${count} match${count===1?'':'es'}`;$('#activeFilterCount').textContent=`${active} active`;$('#activeFilterCount').classList.toggle('has-filters',active>0);
}
function filtersChanged(){parlayFeeds.forEach(feed=>feed.length=0);parlaySignatures.forEach(set=>set.clear());parlayRecentLegs.forEach(set=>set.clear());mixerCandidateCache.clear();mixerSelection=null;if((document.body.dataset.mobilePage==='generator'||innerWidth>720)&&(mixerSetup||initializedPages.has('generator')))generateMixer(false);render()}
function setupAdvancedFilters(){
  refreshFilterCatalog();
  const bindings={sportFilterAdvanced:['sport',false],gameFilterAdvanced:['game',false],teamFilterAdvanced:['team',false],dayFilterAdvanced:['day',false],timeFilterAdvanced:['timeSlot',false],propFilterAdvanced:['market',false],sideFilterAdvanced:['side',false],heatFilterAdvanced:['heat',false],moveFilterAdvanced:['move',false],edgeFilterAdvanced:['minEdge',true],confidenceFilterAdvanced:['minConf',true],oddsFilterAdvanced:['oddsType',false],sortFilterAdvanced:['sort',false]};
  Object.entries(bindings).forEach(([id,[key,numeric]])=>{$(`#${id}`).onchange=async e=>{state[key]=numeric?+e.target.value:(key==='heat'&&e.target.value==='All'?null:e.target.value);if(key==='sport'||key==='day')refreshDependentOptions();if(key==='heat')state.high=false;filtersChanged();if(key==='game'||key==='team'||key==='day'){await loadSelectedFutureGame()}}});
  $('#resetAdvancedFilters').onclick=()=>{Object.assign(state,{sport:LEAGUE,game:'All',team:'All',day:'All',timeSlot:'All',market:'All',side:'All',move:'All',minEdge:0,minConf:0,oddsType:'All',sort:'edge',heat:null,high:false});$('#highEdgeBtn').classList.remove('active');refreshDependentOptions();filtersChanged()};
}
$$('[data-parlay-level]').forEach(button=>button.onclick=()=>{activeParlaySection=+button.dataset.parlayLevel;renderParlays();$('#parlayLab').scrollIntoView({behavior:'smooth',block:'start'})});
$$('[data-tier-filter]').forEach(b=>b.onclick=()=>{state.heat=state.heat===b.dataset.tierFilter?null:b.dataset.tierFilter;state.high=false;$('#highEdgeBtn').classList.remove('active');filtersChanged()});
$('#marketFilter').onchange=e=>{state.market=e.target.value;propRenderLimit=24;filtersChanged()};$('#sortFilter').onchange=e=>{state.sort=e.target.value;propRenderLimit=24;render()};$('#highEdgeBtn').onclick=e=>{state.high=!state.high;state.heat=null;e.currentTarget.classList.toggle('active');propRenderLimit=24;filtersChanged()};
function setView(view){state.view=view;$$('[data-view]').forEach(x=>x.classList.toggle('active',x.dataset.view===view));render()}
function canvasRoundRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath()}
const canvasImage=src=>new Promise(resolve=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>resolve(null);image.src=src});
async function createParlayShareImage(){const decimal=state.slip.reduce((total,leg)=>total*americanToDecimal(leg.odds),1),combined=decimalToAmerican(decimal),wager=Math.max(0,+$('#wager').value||0),width=1080,height=500+state.slip.length*116,canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d'),background=ctx.createLinearGradient(0,0,width,height);background.addColorStop(0,'#071a3d');background.addColorStop(.55,'#030b20');background.addColorStop(1,'#08183a');ctx.fillStyle=background;ctx.fillRect(0,0,width,height);ctx.strokeStyle='rgba(40,135,255,.13)';ctx.lineWidth=1;for(let x=0;x<width;x+=54){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,height);ctx.stroke()}for(let y=0;y<height;y+=54){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(width,y);ctx.stroke()}const glow=ctx.createRadialGradient(820,70,10,820,70,430);glow.addColorStop(0,'rgba(0,177,255,.28)');glow.addColorStop(1,'rgba(0,95,255,0)');ctx.fillStyle=glow;ctx.fillRect(0,0,width,height);const logo=await canvasImage('/logo.png');if(logo)ctx.drawImage(logo,58,52,58*logo.naturalWidth/logo.naturalHeight,58);ctx.fillStyle='#64d8ff';ctx.font='700 25px DM Sans, sans-serif';ctx.textAlign='right';ctx.fillText(`${state.slip.length}-LEG PARLAY`,1018,80);ctx.fillStyle='#829bc4';ctx.font='600 19px DM Sans, sans-serif';ctx.fillText('BETTHISGUY.COM',1018,112);ctx.textAlign='left';ctx.fillStyle='#f5f9ff';ctx.font='700 52px Space Grotesk, sans-serif';ctx.fillText('PARLAY SLIP',58,188);ctx.fillStyle='#ff9257';ctx.font='700 23px DM Sans, sans-serif';ctx.fillText('Prices at time of sharing. Odds change.',60,226);let y=270;state.slip.forEach((leg,index)=>{canvasRoundRect(ctx,58,y,964,92,18);ctx.fillStyle='rgba(12,31,68,.92)';ctx.fill();ctx.strokeStyle=index%2?'#245793':'#178dd7';ctx.lineWidth=2;ctx.stroke();ctx.fillStyle='#48d3ff';ctx.font='700 25px Space Grotesk, sans-serif';ctx.fillText(String(index+1).padStart(2,'0'),82,y+55);ctx.fillStyle='#f4f8ff';ctx.font='700 27px DM Sans, sans-serif';ctx.fillText(leg.p.player,142,y+38);ctx.fillStyle='#91a8ca';ctx.font='500 19px DM Sans, sans-serif';const detail=`${leg.p.sport} · ${leg.p.market}`;ctx.fillText(detail.length>62?detail.slice(0,59)+'…':detail,142,y+68);ctx.textAlign='right';ctx.fillStyle='#f5f9ff';ctx.font='700 25px DM Sans, sans-serif';ctx.fillText(`${leg.side} ${leg.p.line}`,990,y+38);ctx.fillStyle='#54d7ff';ctx.font='700 23px DM Sans, sans-serif';ctx.fillText(formatOdds(leg.odds),990,y+69);ctx.textAlign='left';y+=116});canvasRoundRect(ctx,58,y+14,964,146,22);const summary=ctx.createLinearGradient(58,y,1022,y);summary.addColorStop(0,'rgba(26,97,223,.5)');summary.addColorStop(1,'rgba(0,199,234,.18)');ctx.fillStyle=summary;ctx.fill();ctx.strokeStyle='#278fff';ctx.stroke();ctx.fillStyle='#87a0c8';ctx.font='700 18px DM Sans, sans-serif';ctx.fillText('COMBINED ODDS',88,y+57);ctx.fillText('WAGER',430,y+57);ctx.fillText('POTENTIAL PAYOUT',690,y+57);ctx.fillStyle='#ffffff';ctx.font='700 38px Space Grotesk, sans-serif';ctx.fillText(formatOddsPretty(combined),88,y+107);ctx.fillText(`$${wager.toFixed(2)}`,430,y+107);ctx.fillStyle='#5fe0ff';ctx.fillText(formatMoney(wager*decimal),690,y+107);ctx.fillStyle='#758db3';ctx.font='500 17px DM Sans, sans-serif';ctx.fillText('Verify every line at your licensed sportsbook · 21+ where legal · Play responsibly',58,height-40);ctx.textAlign='right';ctx.fillStyle='#4ecfff';ctx.font='700 18px DM Sans, sans-serif';ctx.fillText('BETTHISGUY',1022,height-40);return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(new File([blob],`bet-this-guy-parlay-${Date.now()}.jpg`,{type:'image/jpeg',lastModified:Date.now()})):reject(new Error('Image could not be created.')),'image/jpeg',.92))}
function shareCardTrim(value,max){const text=String(value||'');return text.length>max?`${text.slice(0,max-1)}…`:text}
createParlayShareImage=async function(){
  const decimal=state.slip.reduce((total,leg)=>total*americanToDecimal(leg.odds),1),combined=decimalToAmerican(decimal),wager=Math.max(0,+$('#wager').value||0),width=1080,rowHeight=116,height=520+state.slip.length*rowHeight,canvas=document.createElement('canvas');
  canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d'),background=ctx.createLinearGradient(0,0,width,height);
  background.addColorStop(0,'#061b43');background.addColorStop(.52,'#040d24');background.addColorStop(1,'#071b3b');ctx.fillStyle=background;ctx.fillRect(0,0,width,height);
  ctx.strokeStyle='rgba(48,143,232,.13)';ctx.lineWidth=1;for(let x=0;x<width;x+=54){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,height);ctx.stroke()}for(let y=0;y<height;y+=54){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(width,y);ctx.stroke()}
  const glow=ctx.createRadialGradient(870,35,12,870,35,470);glow.addColorStop(0,'rgba(0,206,255,.3)');glow.addColorStop(1,'rgba(0,91,255,0)');ctx.fillStyle=glow;ctx.fillRect(0,0,width,height);
  const logo=await canvasImage('/logo.png');if(logo)ctx.drawImage(logo,58,60,72*logo.naturalWidth/logo.naturalHeight,72);
  ctx.textAlign='right';ctx.fillStyle='#6be2ff';ctx.font='800 25px DM Sans, sans-serif';ctx.fillText(`${state.slip.length}-LEG PARLAY`,1022,62);ctx.fillStyle='#a1b7d7';ctx.font='700 18px DM Sans, sans-serif';ctx.fillText('BETTHISGUY.COM',1022,93);
  ctx.textAlign='left';ctx.fillStyle='#f7fbff';ctx.font='800 42px Space Grotesk, sans-serif';ctx.fillText("THIS ONE'S GOING TO BE DIFFERENT...",58,221);
  let y=270;state.slip.forEach((leg,index)=>{canvasRoundRect(ctx,58,y,964,88,18);ctx.fillStyle='rgba(9,28,63,.94)';ctx.fill();ctx.strokeStyle=index%2?'#285e9e':'#1ca6e8';ctx.lineWidth=2;ctx.stroke();ctx.beginPath();ctx.arc(99,y+44,25,0,Math.PI*2);ctx.fillStyle='#0d69b5';ctx.fill();ctx.fillStyle='#8eeaff';ctx.font='800 20px Space Grotesk, sans-serif';ctx.textAlign='center';ctx.fillText(String(index+1).padStart(2,'0'),99,y+51);ctx.textAlign='left';ctx.fillStyle='#f4f8ff';ctx.font='800 24px DM Sans, sans-serif';ctx.fillText(shareCardTrim(leg.p.player,43),145,y+37);ctx.fillStyle='#9db4d4';ctx.font='600 18px DM Sans, sans-serif';const detail=`${leg.p.sport} · ${leg.p.market}`;ctx.fillText(shareCardTrim(detail,53),145,y+66);ctx.textAlign='right';ctx.fillStyle='#f8fbff';ctx.font='800 23px DM Sans, sans-serif';ctx.fillText(`${leg.side} ${leg.p.line}`,990,y+37);ctx.fillStyle='#59dcff';ctx.font='800 22px DM Sans, sans-serif';ctx.fillText(formatOdds(leg.odds),990,y+67);ctx.textAlign='left';y+=rowHeight});
  canvasRoundRect(ctx,58,y+12,964,140,22);const summary=ctx.createLinearGradient(58,y,1022,y);summary.addColorStop(0,'rgba(24,91,207,.62)');summary.addColorStop(1,'rgba(0,196,228,.2)');ctx.fillStyle=summary;ctx.fill();ctx.strokeStyle='#2d9bff';ctx.lineWidth=2;ctx.stroke();ctx.fillStyle='#91a8cc';ctx.font='800 18px DM Sans, sans-serif';ctx.fillText('COMBINED ODDS',88,y+56);ctx.fillText('WAGER',430,y+56);ctx.fillText('POTENTIAL PAYOUT',690,y+56);ctx.fillStyle='#fff';ctx.font='800 39px Space Grotesk, sans-serif';ctx.fillText(formatOddsPretty(combined),88,y+108);ctx.fillText(`$${wager.toFixed(2)}`,430,y+108);ctx.fillStyle='#65e3ff';ctx.fillText(formatMoney(wager*decimal),690,y+108);
  ctx.fillStyle='#8098bd';ctx.font='600 17px DM Sans, sans-serif';ctx.textAlign='left';ctx.fillText('Play responsibly · 21+ where legal',58,height-36);ctx.textAlign='right';ctx.fillStyle='#56d9ff';ctx.font='800 20px DM Sans, sans-serif';ctx.fillText('BETTHISGUY.COM',1022,height-36);ctx.textAlign='left';
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(new File([blob],`bet-this-guy-parlay-${Date.now()}.jpg`,{type:'image/jpeg',lastModified:Date.now()})):reject(new Error('Image could not be created.')),'image/jpeg',.92))
}
let preparedShareFile=null,preparedShareKey='',sharePrepareTimer=0;
const shareCardKey=()=>JSON.stringify({legs:state.slip.map(leg=>[leg.key,leg.odds]),wager:$('#wager').value,theme:preferences.shareTheme});
function setShareButton(state='ready'){const button=$('#shareParlay');if(!button)return;const copy={ready:['Share this parlay','Send a screenshot and link'],preparing:['Building your screenshot…','Almost ready to send.'],error:['Sharing unavailable here','Try again from Safari.']}[state]||['Share this parlay','Send a screenshot and link'];button.dataset.shareState=state;button.disabled=state==='preparing';button.innerHTML=`<span class="share-icon" aria-hidden="true">${state==='preparing'?'◌':state==='error'?'!':icon('share')}</span><span class="share-copy"><strong>${copy[0]}</strong><small>${copy[1]}</small></span><span class="share-typing" aria-hidden="true"><i></i><i></i><i></i></span>`}
async function prepareShareCard(){if(!state.slip.length)return;const key=shareCardKey(),generated=await createParlayShareImage(),bytes=await generated.arrayBuffer(),file=new File([bytes],generated.name,{type:'image/jpeg',lastModified:Date.now()});if(key!==shareCardKey())return scheduleShareCard();preparedShareFile=file;preparedShareKey=key;setShareButton('ready')}
function scheduleShareCard(){if(preparedShareFile&&preparedShareKey===shareCardKey())return;clearTimeout(sharePrepareTimer);preparedShareFile=null;preparedShareKey='';if(!$('#shareParlay')||!state.slip.length)return;setShareButton('preparing');sharePrepareTimer=setTimeout(()=>prepareShareCard().catch(()=>setShareButton('ready')),80)}
$$('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));$('#clearSlip').onclick=()=>{state.slip=[];render()};$('#wager').oninput=calcParlay;$('#shareParlay').onclick=async()=>{if(!state.slip.length||!preparedShareFile||preparedShareKey!==shareCardKey())return scheduleShareCard();const shareData={files:[preparedShareFile],title:'Bet This Guy Parlay',text:'This one’s going to be different…\nBuild More @ BetThisGuy.com'};try{if(!navigator.share||navigator.canShare&&!navigator.canShare({files:[preparedShareFile]}))throw new Error('Sharing unavailable');await navigator.share(shareData)}catch(error){if(error?.name!=='AbortError'){setShareButton('error');setTimeout(()=>setShareButton('ready'),1800)}}};
$$('[data-view]').forEach(b=>b.onclick=()=>{setView(b.dataset.view);$$('.desktop-nav [data-view],.desktop-nav [data-nav-target]').forEach(item=>item.classList.toggle('active',item===b))});
function jumpDesktopPage(page){const target=page==='generator'?'parlayMixer':'parlayLab';$$('.desktop-nav [data-view],.desktop-nav [data-nav-target]').forEach(item=>item.classList.toggle('active',item.dataset.navTarget===page));state.view='board';render();document.getElementById(target)?.scrollIntoView({behavior:'smooth',block:'start'})}
$$('[data-nav-target]').forEach(b=>b.onclick=()=>jumpDesktopPage(b.dataset.navTarget));
$('#clearSlip').onclick=()=>{state.slip=[];preparedShareFile=null;preparedShareKey='';saveAppSession();renderSlip();render()};
const createClassicParlayShareImage=createParlayShareImage;
// Share images use one brand look (the orange and purple themes were retired).
function renderTracking(){if(window.BTGAuth?.isSignedIn()){if(!window.BTGAuth.renderTrackingPanel())window.BTGAuth.refreshBets();return}const wins=trackedParlays.filter(item=>item.result==='won').length,losses=trackedParlays.filter(item=>item.result==='lost').length,pending=trackedParlays.filter(item=>item.result==='pending').length,net=trackedParlays.reduce((sum,item)=>sum+(item.result==='won'?item.payout-item.wager:item.result==='lost'?-item.wager:0),0);$('#trackingSummary').innerHTML=`<div><small>Tracked</small><strong>${trackedParlays.length}</strong></div><div><small>Won</small><strong>${wins}</strong></div><div><small>Lost</small><strong>${losses}</strong></div><div><small>Net</small><strong>${net>=0?'+':''}${formatMoney(net)}</strong></div>`;$('#trackedList').innerHTML='<div class="auth-empty"><strong>Sign in to track your record</strong><span>Your picks will sync across devices and grade automatically.</span></div>';$('#clearTracking').hidden=true}
function syncWeeklyLimitControl(){const noLimit=$('#noWeeklyLimit').checked,budget=$('#weeklyBudget');budget.disabled=noLimit;budget.closest('label')?.classList.toggle('control-disabled',noLimit)}
// "N selected" next to My sportsbooks, kept current as books are switched.
function updateBookCount(){const n=$('#bookPreferences')?.querySelectorAll('input:checked').length||0,el=$('#bookCount');if(el)el.textContent=n?`${n} selected`:'All books'}
document.addEventListener('change',event=>{if(event.target.closest?.('#bookPreferences'))updateBookCount()});
function openSettings(){const books=['DraftKings','FanDuel','BetMGM','Caesars','Fanatics','BetRivers','theScore Bet','Hard Rock Bet'];$('#bookPreferences').innerHTML=books.map(book=>`<label><input type="checkbox" value="${book}" ${preferences.books.some(saved=>normalizeBookName(saved)===normalizeBookName(book))?'checked':''}/> ${book}</label>`).join('');$('#sportPreferences').innerHTML='<label><input type="checkbox" value="NFL" checked disabled/> NFL</label>';$('#riskPreference').value=preferences.risk;$('#typicalWager').value=preferences.typicalWager;$('#minBookCoverage').value=preferences.minBookCoverage;$('#maxParlayLegs').value=preferences.maxParlayLegs;$('#weeklyBudget').value=preferences.weeklyBudget;$('#noWeeklyLimit').checked=preferences.noWeeklyLimit;syncWeeklyLimitControl();$('#shareTheme').value=preferences.shareTheme;$('#hideInactive').checked=preferences.hideInactive;$('#lineAlerts').checked=preferences.lineAlerts;$('#avoidSameGame').checked=preferences.avoidSameGame;$('#hideLongshots').checked=preferences.hideLongshots;$('#browserAlerts').checked=preferences.browserAlerts;$('#settingsSaveStatus').textContent=window.BTGAuth?.isSignedIn()?'Saved to your account.':'Saved on this device.';updateBookCount();renderTracking();$('#settingsDialog').showModal()}
async function enableFireAlerts(enabled){if(!enabled||!('Notification'in window))return false;if(Notification.permission==='granted')return true;if(Notification.permission==='denied')return false;return(await Notification.requestPermission())==='granted'}
$('#noWeeklyLimit').onchange=syncWeeklyLimitControl;$('#settingsBtn').onclick=openSettings;$('#savePreferences').onclick=async()=>{const wantsAlerts=$('#browserAlerts').checked,alertsEnabled=await enableFireAlerts(wantsAlerts);preferences={...preferences,books:[...$('#bookPreferences').querySelectorAll('input:checked')].map(input=>input.value),favoriteSports:[...$('#sportPreferences').querySelectorAll('input:checked')].map(input=>input.value),risk:$('#riskPreference').value,typicalWager:Math.max(0,+$('#typicalWager').value||0),minBookCoverage:Math.max(1,+$('#minBookCoverage').value||3),maxParlayLegs:Math.max(2,Math.min(10,+$('#maxParlayLegs').value||8)),weeklyBudget:Math.max(0,+$('#weeklyBudget').value||0),noWeeklyLimit:$('#noWeeklyLimit').checked,shareTheme:'classic',hideInactive:$('#hideInactive').checked,lineAlerts:$('#lineAlerts').checked,avoidSameGame:$('#avoidSameGame').checked,hideLongshots:$('#hideLongshots').checked,browserAlerts:wantsAlerts&&alertsEnabled};localStorage.setItem('bet-this-guy-preferences',JSON.stringify(preferences));window.BTGSyncAlertBooks?.();// Signed out: settings stay on this device; no sign-up pop-up on save.
if(window.BTGAuth?.isSignedIn())await savePreferences();$('#wager').value=preferences.typicalWager;$('#legsSlider').max=preferences.maxParlayLegs;$('#legsSlider').value=Math.min(+$('#legsSlider').value,preferences.maxParlayLegs);$('#maxLegLabel').textContent=`${preferences.maxParlayLegs} legs`;$('#settingsDialog').close();mixerCandidateCache.clear();parlayFeeds.forEach(feed=>feed.length=0);await loadLiveProps(true);render()};$('#clearTracking').onclick=()=>{window.BTGAuth?.open(window.BTGAuth?.isSignedIn()?'record':'signup')};$('#trackParlay').onclick=async()=>{if(!state.slip.length||state.slip.some(leg=>leg.changed||leg.unavailable))return;const button=$('#trackParlay'),decimal=state.slip.reduce((total,leg)=>total*americanToDecimal(leg.odds),1),wager=Math.max(0,+$('#wager').value||0),liveLegs=state.slip.map(leg=>({player:leg.p.player,market:leg.p.market,side:leg.side,line:leg.p.line,odds:leg.odds,eventID:leg.p.eventID,gameStart:leg.p.startsAt,startsAt:leg.p.startsAt,team:leg.p.team,propID:leg.p.id}));button.disabled=true;button.textContent='Saving…';try{const result=await window.BTGAuth?.trackParlay({legs:liveLegs,wager,combinedOdds:decimalToAmerican(decimal),sportsbook:preferences.books[0]||null});if(result){window.BTGLive?.renderCenter();button.textContent='✓ Added to My Picks';window.BTGAuth?.refreshBets();setTimeout(()=>{button.textContent=state.slip.length===1?'＋ Track this pick':'＋ Track this parlay';button.disabled=false},1500)}else{button.textContent=state.slip.length===1?'＋ Track this pick':'＋ Track this parlay';button.disabled=false}}catch(error){button.textContent=error.message||'Could not save';setTimeout(()=>{button.textContent=state.slip.length===1?'＋ Track this pick':'＋ Track this parlay';button.disabled=false},2200)}calcParlay()};
function showSettingsTab(tab){$$('[data-settings-tab]').forEach(button=>{button.classList.toggle('active',button.dataset.settingsTab===tab);button.setAttribute('aria-pressed',String(button.dataset.settingsTab===tab))});$$('[data-settings-panel]').forEach(panel=>panel.hidden=panel.dataset.settingsPanel!==tab);$('.settings-body')?.scrollTo({top:0,behavior:'smooth'})}
$$('[data-settings-tab]').forEach(button=>button.onclick=()=>showSettingsTab(button.dataset.settingsTab));$('#settingsBtn').addEventListener('click',()=>showSettingsTab('personal'));
const parlayUiCacheKey='bet-this-guy-parlay-ui-v3';
function saveParlayUiCache(){try{localStorage.setItem(parlayUiCacheKey,JSON.stringify({at:Date.now(),filters:parlayFilterKey(),feeds:parlayFeeds,mixer:mixerSelection,mixerSize:+$('#legsSlider').value,mixerTarget:targetOddsFromSlider()}))}catch{}}
function restoreParlayUiCache(){try{const cached=JSON.parse(localStorage.getItem(parlayUiCacheKey)||'null');if(!cached?.at||Date.now()-cached.at>600000||cached.filters!==parlayFilterKey())return;if(Array.isArray(cached.feeds))cached.feeds.forEach((feed,index)=>{if(Array.isArray(feed)&&parlayFeeds[index])parlayFeeds[index].push(...feed.filter(parlayMatchesFilters).filter(r=>r.legs.every(premadeEligible)))});if(parlayMatchesFilters(cached.mixer)&&cached.mixerSize===+$('#legsSlider').value&&cached.mixerTarget===targetOddsFromSlider()){mixerSelection=cached.mixer;mixerComboKey=cached.mixer.key||''}}catch{}}
restoreParlayUiCache();
const refreshParlaysCacheBase=refreshParlays;
refreshParlays=function(...args){const result=refreshParlaysCacheBase(...args);saveParlayUiCache();return result};
const generateMixerCacheBase=generateMixer;
generateMixer=function(...args){const result=generateMixerCacheBase(...args);saveParlayUiCache();return result};
const scheduleUiTask=callback=>requestAnimationFrame(()=>setTimeout(callback,0));
function activatePage(page){const first=!initializedPages.has(page);initializedPages.add(page);if(page==='props'){state.view='board';if(props.length)render();return}if(page==='movement'){state.view='movement';render();return}if(page==='slip'){renderSlip();return}if(page==='generator'){if(!mixerSetup){mixerSetup=true;setupParlayMixer()}else if(!mixerSelection||!parlayMatchesFilters(mixerSelection))generateMixer(false);else renderMixer()}if(page==='parlays'&&(first||!parlayFeeds[activeParlaySection].length))renderParlays();if(first&&(page==='parlays'||page==='generator'))scheduleUiTask(()=>ensureParlayUniverse().catch(()=>{}))}
function showMobilePage(page,push=false){const valid=['props','parlays','generator','movement','slip'];if(!valid.includes(page))page='props';document.body.dataset.mobilePage=page;renderSportTabs();activatePage(page);scheduleMovementRefresh();$$('[data-page-link]').forEach(link=>link.classList.toggle('active',link.dataset.pageLink===page));window.BTGLive?.renderCenter();if(push){const url=new URL(location.href);url.searchParams.set('page',page);history.pushState({page},'',url)}window.scrollTo({top:0,behavior:'auto'})}
const mobileSwipePages=['props','parlays','generator','movement','slip'];
function mobileSwipeDestination(deltaX,deltaY,duration=0){const x=Math.abs(deltaX),y=Math.abs(deltaY),quick=duration<260&&x>=24;if(innerWidth>720||(x<38&&!quick)||x<=y*1.1||duration>1000)return null;const current=mobileSwipePages.indexOf(document.body.dataset.mobilePage),next=current+(deltaX<0?1:-1);return current>=0&&next>=0&&next<mobileSwipePages.length?mobileSwipePages[next]:null}
function mobileSwipeBlocked(target){return !!target?.closest?.('dialog,input,select,textarea,[contenteditable="true"],.game-tabs,.prop-sub-tabs,.parlay-level-tabs,.settings-tabs,.mobile-nav,.hits-row')}
function setupMobileSwipeNavigation(){let start=null,dragging=false;const surface=()=>document.querySelector('main'),clean=()=>{const main=surface();if(main){main.style.transition='';main.style.transform='';main.style.opacity=''}document.body.classList.remove('mobile-swipe-active');dragging=false},snapBack=()=>{const main=surface();if(!main)return clean();main.style.transition='transform 180ms cubic-bezier(.22,.8,.32,1),opacity 180ms ease';main.style.transform='translate3d(0,0,0)';main.style.opacity='1';setTimeout(clean,190)},finish=(page,deltaX)=>{const main=surface();if(!main||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches){clean();if(page)showMobilePage(page,true);return}if(!page)return snapBack();const direction=deltaX<0?-1:1;main.style.transition='transform 170ms cubic-bezier(.4,0,1,1),opacity 170ms ease';main.style.transform=`translate3d(${direction*100}vw,0,0)`;main.style.opacity='.66';setTimeout(()=>{showMobilePage(page,true);main.style.transition='none';main.style.transform=`translate3d(${-direction*24}vw,0,0)`;main.style.opacity='.74';requestAnimationFrame(()=>{main.style.transition='transform 230ms cubic-bezier(.16,1,.3,1),opacity 210ms ease';main.style.transform='translate3d(0,0,0)';main.style.opacity='1';setTimeout(clean,240)})},170)};document.addEventListener('touchstart',event=>{if(innerWidth>720||event.touches.length!==1||mobileSwipeBlocked(event.target))return start=null;const touch=event.touches[0];if(touch.clientX<24||touch.clientX>innerWidth-24)return start=null;start={x:touch.clientX,y:touch.clientY,at:Date.now()};dragging=false},{passive:true});document.addEventListener('touchmove',event=>{if(!start||event.touches.length!==1)return;const touch=event.touches[0],deltaX=touch.clientX-start.x,deltaY=touch.clientY-start.y;if(!dragging){if(Math.abs(deltaX)<10&&Math.abs(deltaY)<10)return;if(Math.abs(deltaX)<=Math.abs(deltaY)*1.15){start=null;return}dragging=true;document.body.classList.add('mobile-swipe-active')}event.preventDefault();const current=mobileSwipePages.indexOf(document.body.dataset.mobilePage),atEdge=(deltaX>0&&current===0)||(deltaX<0&&current===mobileSwipePages.length-1),travel=Math.max(-innerWidth*.92,Math.min(innerWidth*.92,deltaX*(atEdge ? .18 : 1))),main=surface();if(main){main.style.transition='none';main.style.transform=`translate3d(${travel}px,0,0)`;main.style.opacity=String(1-Math.min(.22,Math.abs(travel)/innerWidth*.22))}},{passive:false});document.addEventListener('touchcancel',()=>{start=null;if(dragging)snapBack()},{passive:true});document.addEventListener('touchend',event=>{if(!start||event.changedTouches.length!==1){start=null;if(dragging)snapBack();return}const touch=event.changedTouches[0],deltaX=touch.clientX-start.x,deltaY=touch.clientY-start.y,page=mobileSwipeDestination(deltaX,deltaY,Date.now()-start.at);start=null;if(dragging)finish(page,deltaX)},{passive:true})}
function setupMobileSwipeNavigationV2(){let start=null,dragging=false,preview=null,previewPage='',previewDirection=0,originPage='',originScroll=0;const surface=()=>document.querySelector('main'),removePreview=()=>{preview?.remove();preview=null;previewPage='';previewDirection=0},clean=()=>{const main=surface();if(main){main.style.transition='';main.style.transform='';main.style.opacity='';main.style.boxShadow=''}removePreview();document.body.classList.remove('mobile-swipe-active');dragging=false},neighbor=deltaX=>{const current=mobileSwipePages.indexOf(originPage||document.body.dataset.mobilePage),next=current+(deltaX<0?1:-1);return current>=0&&next>=0&&next<mobileSwipePages.length?mobileSwipePages[next]:null},buildPreview=(page,direction)=>{if(!page||previewPage===page)return;removePreview();const main=surface();if(!main?.cloneNode)return;const current=originPage,scroll=originScroll;showMobilePage(page,false);const clone=surface().cloneNode(true);showMobilePage(current,false);window.scrollTo({top:scroll,behavior:'auto'});const host=document.createElement('div');host.className='mobile-swipe-preview';host.dataset.page=page;host.setAttribute('aria-hidden','true');clone.classList.add('mobile-swipe-preview-page');clone.setAttribute('aria-hidden','true');host.append(clone);document.body.append(host);preview=host;previewPage=page;previewDirection=direction;host.style.transform=`translate3d(${-direction*innerWidth}px,0,0)`},snapBack=()=>{const main=surface();if(!main)return clean();main.style.transition='transform 190ms cubic-bezier(.22,.8,.32,1),box-shadow 190ms ease';main.style.transform='translate3d(0,0,0)';main.style.boxShadow='none';if(preview){preview.style.transition='transform 190ms cubic-bezier(.22,.8,.32,1)';preview.style.transform=`translate3d(${-previewDirection*innerWidth}px,0,0)`}setTimeout(clean,200)},finish=(page,deltaX)=>{const main=surface();if(!main||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches){clean();if(page)showMobilePage(page,true);return}if(!page)return snapBack();const direction=deltaX<0?-1:1;main.style.transition='transform 180ms cubic-bezier(.4,0,1,1),box-shadow 180ms ease';main.style.transform=`translate3d(${direction*100}vw,0,0)`;main.style.boxShadow='none';if(preview){preview.style.transition='transform 180ms cubic-bezier(.4,0,1,1)';preview.style.transform='translate3d(0,0,0)'}setTimeout(()=>{showMobilePage(page,true);main.style.transition='none';main.style.transform='translate3d(0,0,0)';main.style.boxShadow='none';clean()},185)};document.addEventListener('touchstart',event=>{if(innerWidth>720||event.touches.length!==1||mobileSwipeBlocked(event.target))return start=null;const touch=event.touches[0];if(touch.clientX<24||touch.clientX>innerWidth-24)return start=null;originPage=document.body.dataset.mobilePage;originScroll=window.scrollY;start={x:touch.clientX,y:touch.clientY,at:Date.now()};dragging=false},{passive:true});document.addEventListener('touchmove',event=>{if(!start||event.touches.length!==1)return;const touch=event.touches[0],deltaX=touch.clientX-start.x,deltaY=touch.clientY-start.y;if(!dragging){if(Math.abs(deltaX)<8&&Math.abs(deltaY)<8)return;if(Math.abs(deltaX)<=Math.abs(deltaY)*1.08){start=null;return}dragging=true;document.body.classList.add('mobile-swipe-active')}event.preventDefault();const direction=deltaX<0?-1:1,page=neighbor(deltaX);buildPreview(page,direction);const atEdge=!page,gain=atEdge ? .2 : 1.12,travel=Math.max(-innerWidth*.96,Math.min(innerWidth*.96,deltaX*gain)),main=surface();if(main){main.style.transition='none';main.style.transform=`translate3d(${travel}px,0,0)`;main.style.boxShadow=direction<0?'14px 0 28px rgba(0,0,0,.3)':'-14px 0 28px rgba(0,0,0,.3)'}if(preview)preview.style.transform=`translate3d(${travel-direction*innerWidth}px,0,0)`},{passive:false});document.addEventListener('touchcancel',()=>{start=null;if(dragging)snapBack()},{passive:true});document.addEventListener('touchend',event=>{if(!start||event.changedTouches.length!==1){start=null;if(dragging)snapBack();return}const touch=event.changedTouches[0],deltaX=touch.clientX-start.x,deltaY=touch.clientY-start.y,page=mobileSwipeDestination(deltaX,deltaY,Date.now()-start.at);start=null;if(dragging)finish(page,deltaX)},{passive:true})}
$$('[data-page-link]').forEach(link=>link.onclick=e=>{e.preventDefault();showMobilePage(link.dataset.pageLink,true)});addEventListener('popstate',()=>{if(innerWidth<=720)showMobilePage(new URLSearchParams(location.search).get('page')||'props')});showMobilePage(new URLSearchParams(location.search).get('page')||resumeSession?.mobilePage||'props');$('#themeBtn').onclick=()=>{const light=document.body.classList.toggle('light');try{localStorage.setItem('btg-theme',light?'light':'dark')}catch{}};$$('.dialog-close').forEach(b=>b.onclick=()=>b.closest('dialog').close());
setupMobileSwipeNavigationV2();
$('#feedBtn').onclick=()=>$('#feedDialog').showModal();$('#resetFeed').onclick=()=>{baseLiveProps=demoProps.filter(p=>p.sport==='NFL').map(p=>({...p,time:'Sample · no live game date',bookCount:4,oneSided:false,fairChance:+(Math.min(.99,americanProbability(recommendedOdds(p))+p.edge/100)*100).toFixed(1),bestBook:'Demo market'}));futurePropBoards.clear();rebuildPropBoard();setFeedStatus('demo','NFL demo feed');$('#feedDescription').textContent='You are viewing a sample NFL board. Refresh live lines whenever you are ready.';$('#feedMessage').textContent='NFL demo board restored.';refreshFilterCatalog();filtersChanged()};$('#saveFeed').onclick=async()=>{await Promise.all([loadLiveProps(true),loadFutureSchedule(true)])};
function isFirstTouchdownMarket(p){return /first\s+(?:team\s+)?touchdown|first\s+(?:team\s+)?td/i.test(p.market)}
const propMetricFromBoxScore=propMetric;
propMetric=function(p,row){return isFirstTouchdownMarket(p)?{label:'First TD',value:null}:propMetricFromBoxScore(p,row)};
const playerFactFromBoxScore=playerFact;
playerFact=async function(p){if(isFirstTouchdownMarket(p))return`First-touchdown history requires play-by-play scoring order, which the connected box-score feed does not verify. ${p.player} is currently priced at ${formatOdds(recommendedOdds(p))}.`;return playerFactFromBoxScore(p)};
const hydrateHitProfileFromBoxScore=hydrateHitProfile;
hydrateHitProfile=async function(host,p){if(isFirstTouchdownMarket(p)){host.querySelector('strong').textContent='First TD history';host.querySelector('span').textContent='Scoring order is not available from the connected stats feed.';host.querySelector('i').className='';return}return hydrateHitProfileFromBoxScore(host,p)};
const renderPlayerProfileFromBoxScore=renderPlayerProfile;
renderPlayerProfile=function(p,payload){if(!isFirstTouchdownMarket(p))return renderPlayerProfileFromBoxScore(p,payload);const player=payload.player||{},team=player.team?.full_name||player.team?.name||player.team?.abbreviation||p.team.split(' · ')[0];$('#playerProfile').innerHTML=`<div class="player-profile-head"><div class="avatar">${htmlEscape(p.player.split(' ').map(part=>part[0]).join(''))}</div><div><p class="eyebrow">NFL · PLAYER INTELLIGENCE</p><h2>${htmlEscape(p.player)}</h2><span>${htmlEscape(team)}</span></div></div><div class="profile-line"><span>Current market</span><strong>${htmlEscape(p.market)} · ${formatOdds(recommendedOdds(p))}</strong><small data-game-time="${htmlEscape(gameName(p))}" data-kickoff="${htmlEscape(p.startsAt||'')}" data-default-time="${htmlEscape(p.time)}">${htmlEscape(p.time)}</small></div><div class="profile-empty"><strong>First-touchdown results are not graded from box scores.</strong><span>The connected feed reports total rushing and receiving touchdowns, but not the order in which touchdowns were scored. Showing anytime-touchdown results here would be misleading.</span></div><div class="profile-actions"><button class="primary" id="profileAdd">Add this first-touchdown bet to parlay</button><button class="profile-analysis" id="profileAnalysis">View price analysis</button></div><p class="profile-source">The displayed betting price is live. A play-by-play scoring feed is required for verified First TD history.</p>`;$('#profileAdd').onclick=()=>{toggleLeg(p,p.side);$('#playerDialog').close()};$('#profileAnalysis').onclick=()=>{$('#playerDialog').close();openDetail(p)}};
const alternateMarketBases={player_assists_alternate:'player_assists',player_field_goals_alternate:'player_field_goals',player_kicking_points_alternate:'player_kicking_points',player_pass_attempts_alternate:'player_pass_attempts',player_pass_completions_alternate:'player_pass_completions',player_pass_interceptions_alternate:'player_pass_interceptions',player_pass_longest_completion_alternate:'player_pass_longest_completion',player_pass_rush_yds_alternate:'player_pass_rush_yds',player_pass_rush_reception_tds_alternate:'player_pass_rush_reception_tds',player_pass_rush_reception_yds_alternate:'player_pass_rush_reception_yds',player_pass_tds_alternate:'player_pass_tds',player_pass_yds_alternate:'player_pass_yds',player_pats_alternate:'player_pats',player_receptions_alternate:'player_receptions',player_reception_longest_alternate:'player_reception_longest',player_reception_tds_alternate:'player_reception_tds',player_reception_yds_alternate:'player_reception_yds',player_rush_attempts_alternate:'player_rush_attempts',player_rush_longest_alternate:'player_rush_longest',player_rush_reception_tds_alternate:'player_rush_reception_tds',player_rush_reception_yds_alternate:'player_rush_reception_yds',player_rush_tds_alternate:'player_rush_tds',player_rush_yds_alternate:'player_rush_yds',player_sacks_alternate:'player_sacks',player_solo_tackles_alternate:'player_solo_tackles',player_tackles_assists_alternate:'player_tackles_assists'};
const renderPlayerProfileWithMatchup=renderPlayerProfile;
renderPlayerProfile=function(p,payload){renderPlayerProfileWithMatchup(p,payload);const host=$('#playerProfile');if(!host)return;const player=payload.player||{},target=((p.team.match(/(?:vs|@)\s+(.+)$/)||[])[1]||'').trim(),rows=(payload.stats||[]).map(row=>({row,date:statDate(row)})).sort((a,b)=>(b.date?.getTime()||0)-(a.date?.getTime()||0)),meetings=rows.filter(item=>target&&opponentLabel(item.row,player).toLowerCase().includes(target.toLowerCase())).slice(0,3);if(!meetings.length)return;const value=(row,...keys)=>{for(const key of keys){const n=BTGStats.number(row?.[key]);if(n!==null)return n}return null};const statLine=row=>{const parts=[],pass=value(row,'passing_yards','pass_yards'),rush=value(row,'rushing_yards','rush_yards'),rec=value(row,'receiving_yards','reception_yards'),receptions=value(row,'receptions','receiving_receptions'),touchdowns=value(row,'total_touchdowns','touchdowns','passing_touchdowns','rushing_touchdowns','receiving_touchdowns');if(pass!==null)parts.push(`Pass ${pass}`);if(rush!==null)parts.push(`Rush ${rush}`);if(rec!==null)parts.push(`Rec ${rec}${receptions!==null?` (${receptions})`:''}`);if(touchdowns!==null)parts.push(`TD ${touchdowns}`);return parts.join(' · ')||'Box-score detail unavailable'};const section=document.createElement('section');section.className='profile-matchup';section.innerHTML=`<div class="profile-matchup-head"><div><p class="eyebrow">MATCHUP HISTORY</p><h3>Last 3 vs ${htmlEscape(target)}</h3><span>Full box-score snapshot against this opponent</span></div><b>${meetings.length}/3 games found</b></div><div class="profile-matchup-list">${meetings.map(item=>`<div class="profile-matchup-row"><span><strong>${item.date?item.date.toLocaleDateString([],{month:'short',day:'numeric',year:'numeric'}):'Game'}</strong><small>${htmlEscape(opponentLabel(item.row,player))}${item.row?.game?.week?` · Week ${htmlEscape(item.row.game.week)}`:''}</small></span><b>${htmlEscape(statLine(item.row))}</b></div>`).join('')}</div>`;const anchor=host.querySelector('.profile-actions')||host.querySelector('.profile-source');if(anchor)anchor.before(section)};
Object.entries(alternateMarketBases).forEach(([alternate,base])=>marketLabels[alternate]=`Alternate ${marketLabels[base]||titleCase(base)}`);
Object.assign(marketLabels,{totals:'Game Total',alternate_totals:'Alternate Game Total',team_totals:'Team Total',alternate_team_totals:'Alternate Team Total'});
// Bet This Guy is player-prop-only for this release. Keep the labels available for a future Game Lines expansion, but never surface team/game totals in the current board or parlay pool.
delete marketLabels.totals;delete marketLabels.alternate_totals;delete marketLabels.team_totals;delete marketLabels.alternate_team_totals;
function normalizeExpandedMilestones(events){const supported=new Set(['player_tds_over']),out=[];for(const event of events){const groups=new Map();for(const bookmaker of event.bookmakers||[])for(const market of bookmaker.markets||[]){if(!supported.has(market.key))continue;for(const outcome of market.outcomes||[]){const raw=String(outcome.name||'').trim(),description=String(outcome.description||'').trim(),player=description||(!/^over$/i.test(raw)?raw:''),price=Number(outcome.price),line=Number.isFinite(Number(outcome.point))?Number(outcome.point):1.5;if(!player||!Number.isFinite(price))continue;const key=`${player}|${market.key}|${line}`,group=groups.get(key)||{player,marketKey:market.key,line,offers:[]};group.offers.push({price,book:bookmaker.title||titleCase(bookmaker.key)});groups.set(key,group)}}for(const group of groups.values()){const best=[...group.offers].sort((a,b)=>b.price-a.price)[0],fair=group.offers.reduce((sum,offer)=>sum+americanProbability(offer.price),0)/group.offers.length,edge=Math.max(.2,(fair-americanProbability(best.price))*100),startsAt=new Date(event.commence_time),live=startsAt.getTime()<=Date.now();out.push({sport:event.sport_label||'NFL',player:group.player,team:`${event.away_team||'Away'} · @ ${event.home_team||'Home'}`,market:group.line>=1.5?'Multiple Touchdowns':'Touchdowns',line:group.line,open:group.line,side:'Over',over:best.price,under:null,edge:+Math.min(edge,12).toFixed(1),conf:Math.round(Math.min(78,52+edge*3)),time:formatGameTime(startsAt,live),startsAt:Number.isNaN(startsAt.getTime())?null:startsAt.toISOString(),note:`Best multi-touchdown price at ${best.book}`,trend:[group.line,group.line,group.line,group.line],eventID:event.eventID||event.id,live,oneSided:true,bookCount:new Set(group.offers.map(offer=>offer.book)).size,fairChance:+(fair*100).toFixed(1),bestBook:best.book})}}return out}
function normalizeExpandedTotals(events){const supported=new Set(['totals','alternate_totals','team_totals','alternate_team_totals']),out=[];for(const event of events){const groups=new Map();for(const bookmaker of event.bookmakers||[])for(const market of bookmaker.markets||[]){if(!supported.has(market.key))continue;for(const outcome of market.outcomes||[]){const side=String(outcome.name||'').toLowerCase(),line=Number(outcome.point),price=Number(outcome.price);if(!['over','under'].includes(side)||!Number.isFinite(line)||!Number.isFinite(price))continue;const description=String(outcome.description||'').trim(),player=description||`${event.away_team||'Away'} @ ${event.home_team||'Home'}`,key=`${player}|${market.key}|${line}`,group=groups.get(key)||{player,marketKey:market.key,line,over:[],under:[],byBook:new Map()};const offer={price,book:bookmaker.title||titleCase(bookmaker.key)};group[side].push(offer);const pair=group.byBook.get(bookmaker.key)||{};pair[side]=price;group.byBook.set(bookmaker.key,pair);groups.set(key,group)}}for(const group of groups.values()){const paired=[...group.byBook.values()].filter(pair=>Number.isFinite(pair.over)&&Number.isFinite(pair.under));if(!paired.length||!group.over.length||!group.under.length)continue;const fair=paired.map(pair=>{const over=americanProbability(pair.over),under=americanProbability(pair.under),total=over+under;return{over:over/total,under:under/total}}),fairOver=fair.reduce((sum,p)=>sum+p.over,0)/fair.length,fairUnder=fair.reduce((sum,p)=>sum+p.under,0)/fair.length,bestOver=[...group.over].sort((a,b)=>b.price-a.price)[0],bestUnder=[...group.under].sort((a,b)=>b.price-a.price)[0],overEdge=(fairOver-americanProbability(bestOver.price))*100,underEdge=(fairUnder-americanProbability(bestUnder.price))*100,side=overEdge>=underEdge?'Over':'Under',edge=Math.max(.2,overEdge,underEdge),chosen=side==='Over'?bestOver:bestUnder,startsAt=new Date(event.commence_time),live=startsAt.getTime()<=Date.now();if(edge>20)continue;out.push({sport:event.sport_label||'NFL',player:group.player,team:`${event.away_team||'Away'} · @ ${event.home_team||'Home'}`,market:marketLabels[group.marketKey],line:group.line,open:group.line,side,over:bestOver.price,under:bestUnder.price,edge:+edge.toFixed(1),conf:Math.round(Math.min(84,52+edge*3)),time:formatGameTime(startsAt,live),startsAt:Number.isNaN(startsAt.getTime())?null:startsAt.toISOString(),note:`Best total at ${chosen.book} vs no-vig consensus`,trend:[group.line,group.line,group.line,group.line],eventID:event.eventID||event.id,live,teamMarket:true,bookCount:paired.length,oneSided:false,fairChance:+((side==='Over'?fairOver:fairUnder)*100).toFixed(1),bestBook:chosen.book})}}return out}
normalizeExpandedTotals=()=>[];
const normalizeExpandedBase=normalizeLiveProps;
normalizeLiveProps=function(payload){const base=normalizeExpandedBase(payload),events=Array.isArray(payload?.data)?payload.data:[],expanded=[...normalizeExpandedMilestones(events),...normalizeExpandedTotals(events)],seen=new Set(base.map(p=>`${p.eventID}|${p.player}|${p.market}|${p.line}|${p.side}`));return [...base,...expanded.filter(p=>!seen.has(`${p.eventID}|${p.player}|${p.market}|${p.line}|${p.side}`))].sort((a,b)=>b.edge-a.edge)};
const hydrateExpandedBase=hydrateHitProfile;
hydrateHitProfile=async function(host,p){if(p.teamMarket){host.querySelector('strong').textContent='Game market';host.querySelector('span').textContent='Live multi-book total—player history does not apply.';host.querySelector('i').className='';return}return hydrateExpandedBase(host,p)};
const bindExpandedBase=bindCards;
bindCards=function(){bindExpandedBase();$$('.prop-card').forEach(card=>{const prop=props.find(item=>item.id===+card.dataset.id);if(!prop)return;const pick=card.querySelector('.mockup-pick'),odds=pick?.querySelector('b');if(pick){const selected=state.slip.some(leg=>savedPropKey(leg.p)===savedPropKey(prop)&&leg.side===prop.side);odds?.classList.toggle('selected-odds',selected);pick.setAttribute('role','button');pick.setAttribute('tabindex','0');pick.setAttribute('aria-label',`${selected?'Remove':'Add'} ${prop.side} ${prop.line} ${prop.market} for ${prop.player}`);pick.onclick=event=>{event.stopPropagation();toggleLeg(prop,prop.side)};pick.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();toggleLeg(prop,prop.side)}}}if(!prop.teamMarket)return;const player=card.querySelector('.player');player.onclick=()=>openDetail(prop);player.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();openDetail(prop)}}})};
const openParlayLegExpandedBase=openParlayLegPlayer;
openParlayLegPlayer=function(p,r){if(!p.teamMarket)return openParlayLegExpandedBase(p,r);$('#parlayDetailDialog').close();openDetail(p)};
let parlayWarmupScheduled=false;
function scheduleParlayWarmup(){if(parlayWarmupScheduled||parlayUniverseReady)return;parlayWarmupScheduled=true;const start=()=>ensureParlayUniverse().catch(()=>{});if('requestIdleCallback'in window)requestIdleCallback(start,{timeout:1600});else setTimeout(start,500)}
ensureParlayUniverse=async function(){if(parlayUniverseReady)return;if(parlayUniversePromise)return parlayUniversePromise;parlayUniversePromise=(async()=>{if(livePropsPromise)await livePropsPromise;if(!scheduleGames.length)await loadFutureSchedule();const now=Date.now(),horizon=now+7*86400000,loadedEvents=new Set([...baseLiveProps,...futurePropBoards.values()].flat().map(prop=>prop.eventID)),games=[...scheduleGames].filter(game=>{const starts=new Date(game.status?.startsAt).getTime();return game.leagueID===LEAGUE&&Number.isFinite(starts)&&starts>=now-14400000&&starts<=horizon&&!loadedEvents.has(game.eventID)&&!futurePropBoards.has(game.eventID)}).sort((a,b)=>new Date(a.status?.startsAt)-new Date(b.status?.startsAt));if(games.length){$('#feedMessage').textContent=`Warming ${games.length} remaining NFL game boards in the background…`;for(let index=0;index<games.length;index+=2){await Promise.all(games.slice(index,index+2).map(game=>loadBoardGame(game,false)));await new Promise(resolve=>setTimeout(resolve,0));rebuildPropBoard();$('#feedMessage').textContent=`NFL pool ${Math.min(index+2,games.length)} of ${games.length} background boards checked…`}}rebuildPropBoard();mixerCandidateCache.clear();parlayFeeds.forEach(feed=>feed.length=0);parlaySignatures.forEach(set=>set.clear());refreshFilterCatalog();parlayUniverseReady=true;const covered=new Set(props.map(prop=>prop.eventID)).size,scheduled=scheduleGames.filter(game=>{const starts=new Date(game.status?.startsAt).getTime();return game.leagueID===LEAGUE&&Number.isFinite(starts)&&starts>=now-14400000&&starts<=horizon}).length;$('#feedMessage').textContent=`${LEAGUE} board: ${props.length} props across ${covered} games${scheduled?` · ${Math.max(0,scheduled-covered)} scheduled games do not have odds posted yet`:''}.`;scheduleUiTask(()=>{filtersChanged();saveParlayUiCache()})})().finally(()=>{parlayUniversePromise=null});return parlayUniversePromise};
localStorage.removeItem('propedge-api');
$('#parlayMixer').before($('#advancedFilters'));
const compactCardBase=card;
const lineHistoryKey='btg-line-history-v1';
function propFreshnessLabel(){
  if(!feedUpdatedAt)return 'refresh pending';
  const age=Math.max(0,Date.now()-feedUpdatedAt.getTime()),minutes=Math.floor(age/60000);
  if(minutes<1)return 'just now';
  if(minutes<60)return `${minutes}m ago`;
  const hours=Math.floor(minutes/60);
  return `${hours}h ago`;
}
function propTrust(p){
  const age=feedUpdatedAt?Date.now()-feedUpdatedAt.getTime():Infinity;
  const books=Number(p.bookCount)||0;
  let key='cached',label='Cached market';
  if(feedMode==='demo'){key='demo';label='Demo data'}
  else if(feedMode==='live'&&age<15*60*1000&&books>=3){key='verified';label='Verified market'}
  else if(feedMode==='live'&&age<30*60*1000){key='limited';label='Limited market'}
  const market=String(p.market||'');
  const stats=/first touchdown|last touchdown/i.test(market)?'Order not verified':'Stats on tap';
  return {key,label,books:books?`${books} books`:'Coverage limited',freshness:propFreshnessLabel(),stats};
}
// Plain-language version of the card's market check, for visitors who don't bet.
function plainTrust(trust){
  const count=parseInt(trust.books,10),books=Number.isFinite(count)?`${count} sportsbook${count===1?'':'s'}`:'a few sportsbooks';
  const base=trust.key==='demo'?'Demo prices':trust.key==='verified'?`Checked ${books}`:trust.key==='limited'?`Only ${books} so far`:'Saved prices';
  return `${base} · ${trust.freshness}${trust.stats==='Order not verified'?' · Touchdown order isn’t verified':''}`;
}
function readLineHistory(){try{return JSON.parse(localStorage.getItem(lineHistoryKey)||'{}')||{}}catch{return{}}}
function saveLineHistory(history){try{localStorage.setItem(lineHistoryKey,JSON.stringify(history))}catch{}}
// Keep line changes and price changes together for the same player/game/market
// so the movement page can show how the market evolved over the week.
function lineSnapshotKey(p){return `${p.eventID||'demo'}|${p.player}|${p.market}|${p.side}`}
function attachLineSnapshots(list){return list.map(p=>({...p,lineMove:0,priceMove:0,lineHistory:[]}))}
const availabilityLabel=p=>{const value=String(p.availability||p.status||p.injuryStatus||'').trim();return value?value.replace(/_/g,' '):''};
card=function(p,rank=-1,featured=false){const movement=Math.abs(p.lineMove||0)>=.5?`<span class="line-move ${p.lineMove>0?'up':'down'}">${p.lineMove>0?'▲':'▼'} ${Math.abs(p.lineMove)} since last check</span>`:'',availability=availabilityLabel(p)?`<span class="availability-badge">${htmlEscape(availabilityLabel(p))}</span>`:'',trust=propTrust(p),evidence=`<div class="card-evidence"><div class="card-stats-link">Tap the odds to add to slip</div><div class="prop-trust ${trust.key}" title="${htmlEscape(trust.key==='verified'?'Fresh market supported by multiple books; this is not a guarantee.':'Market coverage or freshness is limited.')}" aria-label="${htmlEscape(trust.label)}"><span>${trust.label}</span><small>${trust.books} · ${trust.freshness}</small><small>${trust.stats}</small></div>${availability}${movement}</div>`;return compactCardBase(p,rank,featured).replace(/<div class="mockup-proof">[\s\S]*?<\/div><\/div><div class="bet-actions">[\s\S]*?<\/div><\/article>/,evidence+'</article>')};

const renderSlipBase=renderSlip;
function slipMarketKey(p){return [p.eventID,p.player,p.market].join('|')}
function selectedOdds(p,side){const value=side==='Under'?p?.under:p?.over;return BTGStats.number(value)}
renderSlip=function(){
  state.slip.forEach(leg=>{
    leg.key=slipSelectionKey(leg.p,leg.side);
    const exact=props.find(p=>p.eventID===leg.p.eventID&&p.player===leg.p.player&&p.market===leg.p.market&&p.line===leg.p.line);
    const alternatives=props.filter(p=>slipMarketKey(p)===slipMarketKey(leg.p));
    const current=exact||(alternatives.length===1?alternatives[0]:null),odds=selectedOdds(current,leg.side);
    leg.current=current;leg.unavailable=!current||odds===null||odds===0;
    leg.changed=!leg.unavailable&&(current.line!==leg.p.line||odds!==leg.odds);
  });
  renderSlipBase();
  if(!state.slip.length)for(const id of ['#shareParlay','#trackParlay']){const button=$(id);if(button)button.disabled=false}
  $$('.slip-leg').forEach(el=>{
    const index=Number(el.querySelector('[data-remove-slip]')?.dataset.removeSlip),leg=Number.isInteger(index)?state.slip[index]:null;
    if(!leg||(!leg.changed&&!leg.unavailable))return;
    const notice=document.createElement('div');notice.className='slip-price-change';
    if(leg.unavailable)notice.textContent='Market unavailable or suspended — remove this leg or wait for fresh odds.';
    else{notice.innerHTML=`<span>Price changed to ${htmlEscape(leg.side)} ${htmlEscape(leg.current.line)} · ${formatOdds(selectedOdds(leg.current,leg.side))}</span><button type="button">Accept</button>`;
      notice.querySelector('button').onclick=()=>{leg.p=leg.current;leg.odds=selectedOdds(leg.current,leg.side);leg.changed=false;render()};}
    el.append(notice);el.classList.add('has-price-change');
  });
};
const calcParlayBase=calcParlay;
calcParlay=function(){
  const blocked=state.slip.some(leg=>leg.changed||leg.unavailable);
  for(const id of ['#shareParlay','#trackParlay']){const button=$(id);if(button)button.disabled=blocked}
  if(blocked){$('#combinedOdds').textContent='—';$('#payout').textContent=state.slip.some(leg=>leg.unavailable)?'Market unavailable':'Accept price changes';return}
  return calcParlayBase();
};
const openDetailBase=openDetail;
openDetail=function(p){
  openDetailBase(p);
  const availability=availabilityLabel(p)?`<div class="detail-evidence"><strong>Availability</strong><span>${htmlEscape(availabilityLabel(p))} · supplied by the connected odds feed.</span></div>`:'';
  const host=$('#detailContent');if(host&&availability){const boundary=host.querySelector('.data-boundary');(boundary||host.querySelector('.thesis'))?.insertAdjacentHTML('afterend',availability)}
};
const refreshLivePropsWithHistory=refreshLiveProps;
refreshLiveProps=async function(force=false){
  const result=await refreshLivePropsWithHistory(force);
  if(baseLiveProps.length){baseLiveProps=attachLineSnapshots(baseLiveProps);rebuildPropBoard();render()}
  return result;
};
observeHitProfiles=function(){};
const fullVisibleProps=visibleProps;
visibleProps=function(){let list;if(selectedPlayer){list=props.filter(prop=>prop.player===selectedPlayer).sort((a,b)=>a.market.localeCompare(b.market)||a.line-b.line||b.edge-a.edge)}else list=fullVisibleProps();visiblePropTotal=list.length;const defaultBest=state.view==='board'&&state.boardMarket==='All'&&state.boardGame==='All';return selectedPlayer||defaultBest?list:list.slice(0,propRenderLimit)};
const publicRecordRequests=new Map();
function recordClientId(kind,legs){let hash=2166136261;for(const ch of JSON.stringify(legs.map(p=>[p.eventID||p.gameId,p.player,p.market,p.line,p.side]))){hash=Math.imul(hash^ch.charCodeAt(0),16777619)}return kind+'|snapshot|'+(hash>>>0).toString(16)}
function recordPostingNotice(failed){
  let notice=document.querySelector('#recordPostingNotice');
  if(!notice){notice=document.createElement('p');notice.id='recordPostingNotice';notice.className='record-posting-notice';notice.setAttribute('role','status');document.querySelector('main')?.prepend(notice)}
  notice.textContent=failed?'Some selections were not saved to the verified public record. Prices may have changed or a game may have started. Refresh to retry. Your personal tracking is separate.':'';
  notice.hidden=!failed;
}
async function postVerifiedRecords(records){
  records=records.filter(r=>(r.kind==='parlay'?r.legs:[r]).every(leg=>!(Date.parse(leg.gameTime)>=Date.parse('2026-09-22T12:00:00Z'))));
  if(!records.length)return true;
  const key=JSON.stringify(records),previous=publicRecordRequests.get(key);
  if(previous&&Date.now()-previous.at<(previous.ok?86400000:60000))return previous.ok;
  publicRecordRequests.set(key,{at:Date.now(),ok:false});
  try{
    const response=await fetch('/api/record',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({records})});
    const result=await response.json();
    if(response.status===409&&records.length>1){const outcomes=await Promise.all(records.map(record=>postVerifiedRecords([record])));const ok=outcomes.every(Boolean);publicRecordRequests.set(key,{at:Date.now(),ok});return ok}
    if(!response.ok||!result.success||result.accepted!==records.length)throw new Error('Not recorded');
    publicRecordRequests.set(key,{at:Date.now(),ok:true});return true;
  }catch{recordPostingNotice(true);return false}
}
function publicLeg(p){return{player:p.player,market:p.market,side:p.side,line:p.line,odds:recommendedOdds(p),gameId:p.eventID,gameTime:p.startsAt}}
function logPublicRecommendations(list){
  if(state.view==='movement')return Promise.resolve(true);
  const records=list.filter(p=>p.eventID&&Date.parse(p.startsAt)>Date.now()).slice(0,12).map(p=>({kind:'prop',...publicLeg(p)}));
  return postVerifiedRecords(records);
}
function logPublicParlay(parlay,source='premade'){
  if(source!=='premade'||!parlay?.legs?.length||parlay.legs.some(p=>Date.parse(p.startsAt)<=Date.now()))return Promise.resolve(false);
  return postVerifiedRecords([{id:recordClientId('parlay',parlay.legs),kind:'parlay',legs:parlay.legs.map(publicLeg)}]);
}
const originalRenderParlays=renderParlays;
renderParlays=function(){originalRenderParlays();parlaySections.forEach((_,index)=>{if(!parlayFeeds[index].length)refreshParlays(index,false)});const records=parlayFeeds.flat().filter(p=>p.legs.length&&p.legs.every(leg=>Date.parse(leg.startsAt)>Date.now())).map(p=>({id:recordClientId('parlay',p.legs),kind:'parlay',legs:p.legs.map(publicLeg)}));for(let index=0;index<records.length;index+=6)postVerifiedRecords(records.slice(index,index+6))};
const originalRenderMixer=renderMixer;
// Generator outputs are exploratory and should not inflate the public record.
// Only parlays intentionally published in the featured Parlays feed are official.
renderMixer=function(){originalRenderMixer()};
const fastRenderBase=render;
render=function(){fastRenderBase();if(innerWidth<=720&&document.body.dataset.mobilePage!=='props')return;if(selectedPlayer){$('#viewTitle').textContent=selectedPlayer;$('#resultCount').textContent=`${visiblePropTotal} available prop${visiblePropTotal===1?'':'s'} across the current NFL board`;$('#clearPlayerSearch').hidden=false;$('#playerSearch').value=selectedPlayer}else if(visiblePropTotal>propRenderLimit){$('#propList').insertAdjacentHTML('beforeend',`<button class="load-more-props" id="loadMoreProps">Show more props <span>${propRenderLimit} of ${visiblePropTotal}</span></button>`);$('#loadMoreProps').onclick=()=>{propRenderLimit+=24;render()}}if(selectedPlayer||document.body.dataset.mobilePage==='props')logPublicRecommendations(visibleProps())};
function playerChoices(query=''){const value=query.trim().toLowerCase(),counts=new Map();props.forEach(prop=>{if(!value||prop.player.toLowerCase().includes(value))counts.set(prop.player,(counts.get(prop.player)||0)+1)});return [...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,8)}
function closePlayerResults(){const results=$('#playerSearchResults');results.hidden=true;results.innerHTML='';$('#playerSearch').setAttribute('aria-expanded','false')}
function choosePlayer(name){selectedPlayer=name;closePlayerResults();state.boardMarket='All';state.boardGame='All';propRenderLimit=24;render();$('#propsSection').scrollIntoView({behavior:'smooth',block:'start'})}
function showPlayerChoices(){const input=$('#playerSearch'),results=$('#playerSearchResults'),query=input.value,choices=playerChoices(query);if(!query.trim()){closePlayerResults();return}results.innerHTML=choices.length?choices.map(([name,count])=>`<button type="button" role="option" data-player-choice="${htmlEscape(name)}" aria-selected="false"><i>${htmlEscape(name.split(' ').map(part=>part[0]).slice(0,2).join(''))}</i><span><strong>${htmlEscape(name)}</strong><small>${count} available prop${count===1?'':'s'}</small></span><b>View all</b></button>`).join(''):'<div class="player-search-empty">No player with posted props matches that name.</div>';results.hidden=false;results.querySelectorAll('[data-player-choice]').forEach(button=>button.onclick=()=>choosePlayer(button.dataset.playerChoice));input.setAttribute('aria-expanded','true')}
$('#playerSearch').addEventListener('input',event=>{if(selectedPlayer&&event.target.value!==selectedPlayer)selectedPlayer='';showPlayerChoices()});
$('#playerSearch').addEventListener('focus',()=>{if($('#playerSearch').value.trim()&&!selectedPlayer)showPlayerChoices()});
$('#playerSearch').addEventListener('keydown',event=>{const buttons=[...$('#playerSearchResults').querySelectorAll('[data-player-choice]')];if(event.key==='ArrowDown'&&buttons.length){event.preventDefault();buttons[0].focus()}else if(event.key==='Escape'){closePlayerResults();event.currentTarget.blur()}});
$('#playerSearchResults').addEventListener('keydown',event=>{const buttons=[...event.currentTarget.querySelectorAll('[data-player-choice]')],index=buttons.indexOf(document.activeElement);if(event.key==='ArrowDown'){event.preventDefault();buttons[Math.min(buttons.length-1,index+1)]?.focus()}if(event.key==='ArrowUp'){event.preventDefault();index<=0?$('#playerSearch').focus():buttons[index-1]?.focus()}if(event.key==='Escape'){closePlayerResults();$('#playerSearch').focus()}});
$('#clearPlayerSearch').onclick=()=>{selectedPlayer='';$('#playerSearch').value='';$('#clearPlayerSearch').hidden=true;closePlayerResults();render();$('#playerSearch').focus()};
document.addEventListener('pointerdown',event=>{if(!$('#playerFinder').contains(event.target))closePlayerResults()});
setupAdvancedFilters();$('#wager').value=resumeSession?.wager??preferences.typicalWager;render();if(resumeSession?.scrollY)requestAnimationFrame(()=>window.scrollTo({top:resumeSession.scrollY,behavior:'auto'}));localStorage.setItem('btg-last-active',String(Date.now()));document.addEventListener('visibilitychange',()=>{if(document.hidden)saveAppSession();else localStorage.setItem('btg-last-active',String(Date.now()))});addEventListener('pagehide',saveAppSession);
// No loading screen: the page shows straight away and live lines fill in as they arrive.
async function initializeApp(){const coreReady=loadLiveProps(false).catch(()=>{});if(!props.length)await Promise.race([coreReady,new Promise(resolve=>setTimeout(resolve,1800))]);if(!scheduleGames.length)setTimeout(()=>loadFutureSchedule(false).then(scheduleParlayWarmup).catch(()=>{}),250);else scheduleParlayWarmup()}
// Full player intelligence profile: overview, weekly log, matchup history, and every posted market.
renderPlayerProfile=function(p,payload){const host=$('#playerProfile'),player=payload.player||{},rows=(payload.stats||[]).map(row=>({row,date:statDate(row)})).sort((a,b)=>(b.date?.getTime()||0)-(a.date?.getTime()||0)),num=(row,...keys)=>{for(const key of keys){const value=Number(row?.[key]);if(Number.isFinite(value))return value}return null},team=player.team?.full_name||player.team?.name||player.team?.abbreviation||p.team.split(' · ')[0],position=player.position||player.position_abbreviation||'',jersey=player.jersey_number||player.jersey||'',target=((p.team.match(/(?:vs|@)\s+(.+)$/)||[])[1]||'').trim(),lineFor=row=>{const parts=[],pass=num(row,'passing_yards','pass_yards'),rush=num(row,'rushing_yards','rush_yards'),rec=num(row,'receiving_yards','reception_yards'),receptions=num(row,'receptions','receiving_receptions'),td=num(row,'total_touchdowns','touchdowns','passing_touchdowns','rushing_touchdowns','receiving_touchdowns');if(pass!==null)parts.push(`Pass ${pass}`);if(rush!==null)parts.push(`Rush ${rush}`);if(rec!==null)parts.push(`Rec ${rec}${receptions!==null?` (${receptions})`:''}`);if(td!==null)parts.push(`TD ${td}`);return parts.join(' · ')||'Box-score detail unavailable'},metricRows=rows.map(item=>({...item,metric:propMetric(p,item.row)})),measured=metricRows.filter(item=>item.metric.value!==null),recent=measured.slice(0,10),last5=recent.slice(0,5),average=list=>list.length?list.reduce((sum,item)=>sum+item.metric.value,0)/list.length:null,hits=list=>list.filter(item=>hitAgainstLine(p,item.metric.value)===true).length,meetings=rows.filter(item=>target&&opponentLabel(item.row,player).toLowerCase().includes(target.toLowerCase())).slice(0,3),playerProps=props.filter(q=>q.player===p.player).sort((a,b)=>a.market.localeCompare(b.market)||a.line-b.line),seasonRows=rows.slice(0,17),seasonTotal=(...keys)=>seasonRows.reduce((sum,item)=>sum+(num(item.row,...keys)||0),0),cards=[['Games',seasonRows.length],['Pass Yds',seasonTotal('passing_yards','pass_yards')],['Rush Yds',seasonTotal('rushing_yards','rush_yards')],['Rec Yds',seasonTotal('receiving_yards','reception_yards')],['Receptions',seasonTotal('receptions','receiving_receptions')],['TDs',seasonTotal('total_touchdowns','touchdowns','passing_touchdowns','rushing_touchdowns','receiving_touchdowns')]];host.innerHTML=`<div class="player-profile-head"><div class="avatar">${htmlEscape(p.player.split(' ').map(x=>x[0]).join(''))}</div><div><p class="eyebrow">NFL · PLAYER INTELLIGENCE</p><h2>${htmlEscape(p.player)}</h2><span>${htmlEscape([team,position,jersey?`#${jersey}`:''].filter(Boolean).join(' · '))}</span></div></div><div class="profile-line"><span>Current market</span><strong>${htmlEscape(p.side)} ${htmlEscape(p.line)} ${htmlEscape(p.market)} · ${formatOdds(recommendedOdds(p))}</strong><small data-game-time="${htmlEscape(gameName(p))}" data-kickoff="${htmlEscape(p.startsAt||'')}" data-default-time="${htmlEscape(p.time)}">${htmlEscape(p.time)}</small></div><nav class="profile-tabs" role="tablist" aria-label="Player profile sections"><button class="active" role="tab" aria-selected="true" data-profile-tab="overview">Overview</button><button role="tab" aria-selected="false" data-profile-tab="gamelog">Game Log</button><button role="tab" aria-selected="false" data-profile-tab="matchup">Matchup History</button><button role="tab" aria-selected="false" data-profile-tab="props">Available Props <b>${playerProps.length}</b></button></nav><section class="profile-panel active" data-profile-panel="overview"><div class="profile-panel-title"><div><p class="eyebrow">SEASON SNAPSHOT</p><h3>Traditional stats</h3></div><span>Regular and postseason only</span></div><div class="profile-season-grid">${cards.map(([label,value])=>`<div><span>${label}</span><strong>${value}</strong></div>`).join('')}</div><div class="profile-form-grid"><div><span>L5 ${htmlEscape(p.market)} avg</span><strong>${average(last5)?.toFixed(1)??'—'}</strong></div><div><span>L10 ${htmlEscape(p.market)} avg</span><strong>${average(recent)?.toFixed(1)??'—'}</strong></div><div><span>L10 hit rate</span><strong>${recent.length?Math.round(hits(recent)/recent.length*100)+'%':'—'}</strong></div></div></section><section class="profile-panel" data-profile-panel="gamelog"><div class="profile-panel-title"><div><p class="eyebrow">WEEK BY WEEK</p><h3>Game log</h3></div><span>${rows.length} games loaded</span></div><div class="profile-game-log">${rows.length?rows.slice(0,16).map(item=>{const metric=propMetric(p,item.row),graded=metric.value!==null,hit=graded&&hitAgainstLine(p,metric.value),week=item.row?.game?.week?`Week ${item.row.game.week}`:'Game';return`<div class="profile-game-row"><span><strong>${item.date?item.date.toLocaleDateString([],{month:'short',day:'numeric'}):'Game'}</strong><small>${htmlEscape(week)} · ${htmlEscape(opponentLabel(item.row,player))}</small></span><b>${htmlEscape(lineFor(item.row))}</b><em class="${graded?(hit?'hit':'miss'):'neutral'}">${graded?(hit?'HIT':'MISS'):'—'}</em></div>`}).join(''):'<div class="profile-empty"><strong>No game logs available.</strong><span>Regular and postseason stats will appear when supplied by the connected feed.</span></div>'}</div></section><section class="profile-panel" data-profile-panel="matchup"><div class="profile-panel-title"><div><p class="eyebrow">MATCHUP HISTORY</p><h3>Last 3 vs ${htmlEscape(target||'this opponent')}</h3></div><span>${meetings.length}/3 games found</span></div><div class="profile-game-log">${meetings.length?meetings.map(item=>`<div class="profile-game-row matchup"><span><strong>${item.date?item.date.toLocaleDateString([],{month:'short',day:'numeric',year:'numeric'}):'Game'}</strong><small>${htmlEscape(opponentLabel(item.row,player))}${item.row?.game?.week?` · Week ${htmlEscape(item.row.game.week)}`:''}</small></span><b>${htmlEscape(lineFor(item.row))}</b><em class="neutral">FULL LINE</em></div>`).join(''):'<div class="profile-empty"><strong>No matchup history found yet.</strong><span>This will populate when the feed includes previous meetings against this opponent.</span></div>'}</div></section><section class="profile-panel" data-profile-panel="props"><div class="profile-panel-title"><div><p class="eyebrow">MARKET EXPLORER</p><h3>All available props</h3></div><span>Tap a market to view its details</span></div><div class="profile-props-list">${playerProps.length?playerProps.map(q=>`<button class="profile-prop-row" type="button" data-profile-prop-id="${q.id}"><span><strong>${htmlEscape(q.market)}</strong><small>${htmlEscape(q.team)} · ${htmlEscape(q.time)}</small></span><b><i>O ${formatOdds(q.over)}</i><i>U ${q.under==null?'—':formatOdds(q.under)}</i></b></button>`).join(''):'<div class="profile-empty"><strong>No other posted markets for this player.</strong><span>Additional props appear here as sportsbooks post them.</span></div>'}</div></section><div class="profile-actions"><button class="primary" id="profileAdd">Add ${htmlEscape(p.side)} ${htmlEscape(p.line)} to parlay</button><button class="profile-analysis" id="profileAnalysis">View price analysis</button></div><p class="profile-source">Regular/postseason stats: BALLDONTLIE · Live prices: multi-book odds feed.</p>`;host.querySelectorAll('[data-profile-tab]').forEach(tab=>tab.onclick=()=>{host.querySelectorAll('[data-profile-tab]').forEach(button=>{const active=button===tab;button.classList.toggle('active',active);button.setAttribute('aria-selected',String(active))});host.querySelectorAll('[data-profile-panel]').forEach(panel=>panel.classList.toggle('active',panel.dataset.profilePanel===tab.dataset.profileTab))});host.querySelectorAll('[data-profile-prop-id]').forEach(row=>row.onclick=()=>{const q=props.find(item=>item.id===+row.dataset.profilePropId);if(q){$('#playerDialog').close();requestAnimationFrame(()=>openDetail(q))}});$('#profileAdd').onclick=()=>{toggleLeg(p,p.side);$('#playerDialog').close()};$('#profileAnalysis').onclick=()=>{$('#playerDialog').close();openDetail(p)};window.BTGLive?.attachProfile(p,payload)};
const finalPlayerProfile=renderPlayerProfile;
renderPlayerProfile=function(p,payload){
  finalPlayerProfile(p,payload);
  const panel=$('#playerProfile [data-profile-panel="matchup"]'),player=payload.player||{};if(!panel)return;
  const rows=(payload.stats||[]).map(row=>({row,date:statDate(row)})).sort((a,b)=>(b.date?.getTime()||0)-(a.date?.getTime()||0)),historyTeam=player?.team||player?.team_data||player?.team_name||rows.find(item=>matchupRowPlayerTeam(item.row,player))?.row?.team||'',historyPlayer=historyTeam?{...player,team:historyTeam}:player,meetings=rows.filter(item=>matchupOpponentMatches(item.row,p,historyPlayer)).slice(0,3),target=profileOpponentName(p,historyPlayer)||'this opponent';
  const value=(row,...keys)=>{for(const key of keys){const n=BTGStats.number(row?.[key]);if(n!==null)return n}return null};
  const statLine=row=>{const parts=[],pass=value(row,'passing_yards','pass_yards'),rush=value(row,'rushing_yards','rush_yds'),rec=value(row,'receiving_yards','rec_yds'),receptions=value(row,'receptions','rec'),td=value(row,'total_touchdowns','touchdowns','rushing_touchdowns','receiving_touchdowns');if(pass!==null)parts.push(`Pass ${pass}`);if(rush!==null)parts.push(`Rush ${rush}`);if(rec!==null)parts.push(`Rec ${rec}${receptions!==null?` (${receptions})`:''}`);if(td!==null)parts.push(`TD ${td}`);return parts.join(' · ')||'Box-score detail unavailable'};
  panel.innerHTML=`<div class="profile-panel-title"><div><p class="eyebrow">MATCHUP HISTORY</p><h3>Last 3 vs ${htmlEscape(target)}</h3></div><span>${meetings.length}/3 games found</span></div><div class="profile-game-log matchup-log">${meetings.length?meetings.map(item=>`<div class="profile-game-row matchup"><span><strong>${item.date?item.date.toLocaleDateString([],{month:'short',day:'numeric',year:'numeric'}):'Game'}</strong><small>${htmlEscape(opponentLabel(item.row,player))}${item.row?.game?.week?` · Week ${htmlEscape(item.row.game.week)}`:''}</small></span><b>${htmlEscape(statLine(item.row))}</b><em class="neutral">FULL LINE</em></div>`).join(''):'<div class="profile-empty"><strong>No verified meetings found.</strong><span>The connected feed may not include prior regular/postseason meetings for this player and opponent.</span></div>'}</div>`;
};
// Keep available markets inline in the player profile. Odds are direct slip controls,
// matching the board interaction instead of opening a separate detail page.
const renderPlayerProfileWithInlineMarkets=renderPlayerProfile;
renderPlayerProfile=function(p,payload){
  renderPlayerProfileWithInlineMarkets(p,payload);
  const host=$('#playerProfile'),panel=host?.querySelector('[data-profile-panel="props"]');
  if(!panel)return;
  const playerProps=props.filter(q=>q.player===p.player).sort((a,b)=>a.market.localeCompare(b.market)||a.line-b.line||a.id-b.id);
  const gameMeta=q=>[q.team, q.time].filter(Boolean).join(' · ');
  const marketText=q=>`${q.side||'Over'} ${q.line==null?'—':q.line} ${q.market}`;
  panel.innerHTML=`<div class="profile-panel-title"><div><p class="eyebrow">MARKET EXPLORER</p><h3>All available props</h3></div><span>Tap the odds to add to your slip</span></div><div class="profile-props-list">${playerProps.length?playerProps.map(q=>`<div class="profile-prop-row" data-profile-prop-id="${q.id}"><div class="profile-prop-copy"><strong>${htmlEscape(marketText(q))}</strong><small>${htmlEscape(gameMeta(q))}</small></div><div class="profile-prop-odds" role="group" aria-label="${htmlEscape(q.market)} odds"><button type="button" class="profile-prop-odd" data-profile-side="Over" aria-label="Add Over ${htmlEscape(String(q.line))} ${htmlEscape(q.market)}">O <b>${formatOdds(q.over)}</b></button><button type="button" class="profile-prop-odd" data-profile-side="Under" aria-label="Add Under ${htmlEscape(String(q.line))} ${htmlEscape(q.market)}">U <b>${q.under==null?'—':formatOdds(q.under)}</b></button></div></div>`).join(''):'<div class="profile-empty"><strong>No other posted markets for this player.</strong><span>Additional props appear here as sportsbooks post them.</span></div>'}</div>`;
  const sync=()=>panel.querySelectorAll('.profile-prop-row').forEach(row=>{const q=props.find(item=>item.id===+row.dataset.profilePropId);row.querySelectorAll('.profile-prop-odd').forEach(button=>{const side=button.dataset.profileSide;button.classList.toggle('selected-odds',!!q&&state.slip.some(leg=>savedPropKey(leg.p)===savedPropKey(q)&&leg.side===side))})});
  panel.querySelectorAll('.profile-prop-odd').forEach(button=>button.onclick=event=>{event.stopPropagation();const row=button.closest('.profile-prop-row'),q=props.find(item=>item.id===+row.dataset.profilePropId);if(!q)return;toggleLeg(q,button.dataset.profileSide);sync()});
  sync();
};
function gameResult(row,player){
  const game=row?.game||{},home=game.home_team||game.home,away=game.visitor_team||game.away_team||game.away;
  const scoreValue=(...keys)=>{for(const key of keys){const value=BTGStats.number(game?.[key]??row?.[key]);if(value!==null)return value}return null};
  const homeScore=scoreValue('home_team_score','home_score','homeScore'),awayScore=scoreValue('visitor_team_score','away_team_score','away_score','awayScore');
  if(!home||!away||homeScore===null||awayScore===null||homeScore===awayScore)return null;
  const own=row?.team||row?.player?.team||player?.team;
  const isHome=own&&(home?.id!==undefined&&own?.id!==undefined?String(home.id)===String(own.id):matchupTeamsEqual(home,own));
  const isAway=own&&(away?.id!==undefined&&own?.id!==undefined?String(away.id)===String(own.id):matchupTeamsEqual(away,own));
  if(!isHome&&!isAway)return null;
  const won=isHome?homeScore>awayScore:awayScore>homeScore;
  return {label:won?'W':'L',teamScore:isHome?homeScore:awayScore,opponentScore:isHome?awayScore:homeScore};
}
// Reformat player history into familiar box-score tables after the profile
// renderer finishes wiring tabs and actions.
function renderTraditionalPlayerStats(p,payload){
  const host=$('#playerProfile');if(!host)return;
  const player=payload.player||{},rows=(payload.stats||[]).map(row=>({row,date:statDate(row)})).sort((a,b)=>(b.date?.getTime()||0)-(a.date?.getTime()||0));
  const value=(row,...keys)=>{for(const key of keys){const n=BTGStats.number(row?.[key]);if(n!==null)return n}return null};
  const position=String(player.position_abbreviation||player.position||'').toUpperCase(),isQB=position==='QB'||position.includes('QUARTERBACK'),isRB=position==='RB'||position.includes('RUNNING BACK'),isWR=position==='WR'||position.includes('WIDE RECEIVER'),isTE=position==='TE'||position.includes('TIGHT END'),isK=position==='K'||position.includes('KICKER'),isDef=!isQB&&!isRB&&!isWR&&!isTE&&!isK&&/LB|LINEBACK|DEFENS|CORNER|CORNERBACK|SAFETY|DB|DL|EDGE/.test(position);
  const box=row=>({pass:value(row,'passing_yards','pass_yards'),completions:value(row,'passing_completions','completions','cmp'),attempts:value(row,'passing_attempts','attempts','pass_att'),passTd:value(row,'passing_touchdowns','passing_tds','pass_td'),interceptions:value(row,'passing_interceptions','interceptions','int'),longPass:value(row,'long_passing','longest_pass','longest_completion','passing_longest_completion','pass_long'),rush:value(row,'rushing_yards','rush_yds'),carries:value(row,'rushing_attempts','rush_attempts','carries'),rushTd:value(row,'rushing_touchdowns','rushing_tds','rush_td'),longRush:value(row,'long_rushing','longest_rush','long_rush'),rec:value(row,'receiving_yards','rec_yds','reception_yards'),receptions:value(row,'receptions','rec'),targets:value(row,'targets','receiving_targets','target'),longRec:value(row,'longest_reception','long_reception','receiving_longest'),recTd:value(row,'receiving_touchdowns','receiving_tds','rec_td'),td:value(row,'total_touchdowns','touchdowns'),tackles:value(row,'tackles','total_tackles','combined_tackles'),sacks:value(row,'sacks','defensive_sacks'),defInt:value(row,'defensive_interceptions','interceptions','interception'),forcedFumbles:value(row,'forced_fumbles','fumbles_forced','ff'),passesDefended:value(row,'passes_defended','pass_defended','pd'),fieldGoals:value(row,'field_goals_made','field_goals','fg_made'),extraPoints:value(row,'extra_points_made','extra_points','pat_made'),points:value(row,'kicking_points','total_points')});
  const sum=(items,key)=>{const vals=items.map(item=>box(item.row)[key]).filter(Number.isFinite);return vals.length?(key.startsWith('long')?Math.max(...vals):vals.reduce((a,b)=>a+b,0)):'—'};
  const seasonNumbers=rows.map(item=>Number(item.row?.game?.season||item.row?.season)).filter(Number.isFinite),currentSeason=seasonNumbers.length?Math.max(...seasonNumbers):null,season=currentSeason?rows.filter(item=>Number(item.row?.game?.season||item.row?.season)===currentSeason):rows,recent=rows.filter(item=>Object.values(box(item.row)).some(Number.isFinite)).slice(0,10),historyTeam=player?.team||player?.team_data||player?.team_name||rows.find(item=>matchupRowPlayerTeam(item.row,player))?.row?.team||'',historyPlayer=historyTeam?{...player,team:historyTeam}:player,meetings=rows.filter(item=>matchupOpponentMatches(item.row,p,historyPlayer)).slice(0,3),date=item=>item.date?item.date.toLocaleDateString([],{month:'short',day:'numeric',year:'numeric'}):'—',opponent=item=>opponentLabel(item.row,historyPlayer).replace(/^vs\s+/,'').replace(/^@\s+/,'');
  const statFields=isQB?[['PASS YDS','pass'],['COMP','completions'],['ATT','attempts'],['PASS TD','passTd'],['INT','interceptions'],['LONG PASS','longPass'],['RUSH YDS','rush'],['RUSH ATT','carries'],['RUSH TD','rushTd'],['LONG RUSH','longRush']]:isRB?[['RUSH YDS','rush'],['CARRIES','carries'],['RUSH TD','rushTd'],['LONG RUSH','longRush'],['REC YDS','rec'],['REC','receptions']]:isWR||isTE?[['REC YDS','rec'],['REC','receptions'],['TARGETS','targets'],['LONG REC','longRec'],['RUSH YDS','rush'],['TD','td']]:isK?[['FG','fieldGoals'],['XP','extraPoints'],['PTS','points'],['TD','td'],['FG ATT','attempts']]:isDef?[['TACKLES','tackles'],['SACKS','sacks'],['INT','defInt'],['FF','forcedFumbles'],['PD','passesDefended']]:[['PASS YDS','pass'],['RUSH YDS','rush'],['REC YDS','rec'],['REC','receptions'],['TD','td']];
  const hitRate=items=>{const results=items.map(item=>hitAgainstLine(p,propMetric(p,item.row).value)).filter(value=>value!==null);return results.length?Math.round(results.filter(Boolean).length/results.length*100)+'%':'—'};
  const summary=items=>items.length?`<div class="boxscore-cards">${statFields.map(([label,key])=>`<div><span>${label}</span><strong>${sum(items,key)}</strong></div>`).join('')}</div>`:'';
  const gameCards=items=>items.length?`<div class="boxscore-game-list">${items.map(item=>{const stat=box(item.row),metric=propMetric(p,item.row),graded=metric.value!==null,hit=graded?hitAgainstLine(p,metric.value):null;return`<article class="boxscore-game-card"><header><div><strong>${date(item)}</strong><span>vs ${htmlEscape(opponent(item))}</span></div><em class="boxscore-result ${hit===null?'neutral':hit?'hit':'miss'}">${graded?(hit===null?'PUSH':hit?'HIT':'MISS'):'—'}</em></header><div class="boxscore-game-stats">${statFields.map(([label,key])=>`<span><b>${stat[key]??'—'}</b>${label}</span>`).join('')}</div></article>`}).join('')}</div>`:'<div class="profile-empty"><strong>No verified games available.</strong><span>Regular and postseason box-score data will appear when supplied by the connected feed.</span></div>';
  const overview=host.querySelector('[data-profile-panel="overview"]');if(overview)overview.innerHTML=`<div class="profile-panel-title"><div><p class="eyebrow">SEASON SNAPSHOT</p><h3>Traditional box score</h3></div><span>${currentSeason||'Current'} season · regular + playoffs · ${season.length} games</span></div>${summary(season)}<p class="boxscore-caption">Current season totals only. Regular-season and postseason games are included; preseason and exhibition games are excluded.</p><div class="boxscore-split"><div><span>Last 5 ${htmlEscape(p.market)} hit rate</span><strong>${hitRate(recent.slice(0,5))}</strong></div><div><span>Last 10 ${htmlEscape(p.market)} hit rate</span><strong>${hitRate(recent)}</strong></div></div>`;
  const log=host.querySelector('[data-profile-panel="gamelog"]');if(log)log.innerHTML=`<div class="profile-panel-title"><div><p class="eyebrow">WEEK BY WEEK</p><h3>Game log</h3></div><span>Last ${recent.length} games</span></div>${gameCards(recent)}`;
  const matchup=host.querySelector('[data-profile-panel="matchup"]');if(matchup)matchup.innerHTML=`<div class="profile-panel-title"><div><p class="eyebrow">MATCHUP HISTORY</p><h3>Last 3 vs ${htmlEscape(profileOpponentName(p,historyPlayer)||'opponent')}</h3></div><span>${meetings.length}/3 games found</span></div>${gameCards(meetings)}`;
}
const profileBeforeTraditional=renderPlayerProfile;
renderPlayerProfile=function(p,payload){profileBeforeTraditional(p,payload);renderTraditionalPlayerStats(p,payload)};
const traditionalBeforeResults=renderTraditionalPlayerStats;
renderTraditionalPlayerStats=function(p,payload){
  traditionalBeforeResults(p,payload);
  const player=payload.player||{},rows=(payload.stats||[]).map(row=>({row,date:statDate(row)})).sort((a,b)=>(b.date?.getTime()||0)-(a.date?.getTime()||0)),recent=rows.filter(item=>Object.values(item.row||{}).some(value=>Number.isFinite(Number(value))||typeof value==='object')).slice(0,10),decorate=(selector,items)=>host=>{const cards=host.querySelectorAll(selector);cards.forEach((card,index)=>{const result=gameResult(items[index]?.row,player);if(!result)return;const meta=card.querySelector('header>div');if(!meta||meta.querySelector('.game-outcome'))return;meta.insertAdjacentHTML('beforeend',`<b class="game-outcome ${result.label==='W'?'win':'loss'}"><span>${result.label}</span>${result.teamScore}–${result.opponentScore}</b>`)});
  };
  const host=$('#playerProfile');if(!host)return;
  decorate('[data-profile-panel="gamelog"] .boxscore-game-card',recent)(host);
  decorate('[data-profile-panel="matchup"] .boxscore-game-card',rows.filter(item=>matchupOpponentMatches(item.row,p,player)).slice(0,3))(host);
};
// Final navigation and movement pass: desktop tabs are true page states, while
// mobile keeps the existing routed bottom navigation. Movement cards expose the
// opening/current price and a drill-in chart built from saved odds snapshots.
function movementValueSignal(p){return window.BTGMovement?.seriesFor(p,bookAllowed)[0]||null}
function movementDisplaySignal(p){return movementValueSignal(p)||window.BTGMovement?.trackedFor(p,bookAllowed)[0]||null}
function movementRows(p){return movementValueSignal(p)?.rows||[]}
function movementOpenLine(p){return movementRows(p)[0]?.line??p.line}
function movementOpenPrice(p){return movementRows(p)[0]?.price??null}
function movementMagnitude(p){return Boolean(movementValueSignal(p))}
function movementPhaseLabel(signal){return signal.phase==='pregame'?'Pregame':'After kickoff'}
function movementDescription(signal){
  if(signal.type==='baseline')return 'Monitoring this main prop. No qualifying change is available in the shared observations yet.';
  if(signal.type==='primary-line')return 'Main line changed. Both thresholds and prices are shown; these are different bets, not a same-line price comparison.';
  return signal.probabilityDelta>0?'Same line, shorter odds: the payout is lower than when first observed.':'Same line, longer odds: the payout is higher than when first observed.';
}
function movementCard(p){
  const signal=movementDisplaySignal(p);if(!signal)return '';
  if(signal.type==='baseline')return `<article class="prop-card movement-clean-card" data-id="${p.id}"><button class="bookmark ${state.saved.has(savedPropKey(p))?'saved':''}" aria-label="Save ${htmlEscape(p.player)}">${icon('star')}</button><header class="player" role="button" tabindex="0"><div><strong>${htmlEscape(p.player)}</strong><span>${htmlEscape(p.market)} · ${htmlEscape(p.team)}</span></div></header><p class="movement-source">${htmlEscape(signal.book)} · ${movementPhaseLabel(signal)} · Monitoring</p><p><strong>${htmlEscape(p.side)} ${signal.to.line} · ${formatOdds(signal.to.price)}</strong></p><p class="movement-explanation">${movementDescription(signal)}</p><small>Feed update ${new Date(signal.at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}</small></article>`;
  const from=signal.from,to=signal.to,mainMove=signal.type==='primary-line';
  const selection=line=>p.binary?'To score':`${p.side} ${line}`;
  return `<article class="prop-card movement-clean-card" data-id="${p.id}"><button class="bookmark ${state.saved.has(savedPropKey(p))?'saved':''}" aria-label="Save ${htmlEscape(p.player)}">${icon('star')}</button><header class="player" role="button" tabindex="0" aria-label="View ${htmlEscape(p.player)} stats"><div><strong>${htmlEscape(p.player)}</strong><span>${htmlEscape(p.market)} · ${htmlEscape(p.team)}</span></div></header><p class="movement-source">${htmlEscape(signal.book)} · ${movementPhaseLabel(signal)} · ${mainMove?'Main line change':'Same-line price change'}</p><div class="movement-comparison"><div><small>First observed</small><span>${htmlEscape(selection(from.line))}</span><s>${formatOdds(from.price)}</s></div><span aria-hidden="true">→</span><div><small>Latest quote</small><span>${htmlEscape(selection(to.line))}</span><strong>${formatOdds(to.price)}</strong></div></div><p class="movement-explanation">${htmlEscape(movementDescription(signal))}</p><small class="movement-updated">Feed update ${new Date(signal.at).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</small><button class="movement-link" type="button" data-movement-detail="${p.id}">View observed history</button></article>`;
}
// Keep the main Props page focused on the props themselves. Movement controls
// and explanations belong only to the dedicated Line Movement page.
function stripLast10(markup){return markup.replace(/<div class="mockup-proof">[\s\S]*?<\/div><\/div>/,'')}
function featuredSnapshotLabel(){
  const value=feedUpdatedAt instanceof Date&&!Number.isNaN(feedUpdatedAt.getTime())?feedUpdatedAt:new Date();
  return value.toLocaleString([],{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});
}
function featuredMovementSummary(p){
  const signal=movementDisplaySignal(p);
  if(!signal||signal.type==='baseline')return null;
  if(signal.type==='primary-line')return{headline:`The line moved from ${signal.from.line} to ${signal.to.line}`,detail:`This is the regular line at ${signal.book}, not a different alternate bet.`};
  const gotPricier=americanProbability(signal.to.price)>americanProbability(signal.from.price);
  return{headline:`Odds moved ${formatOdds(signal.from.price)} → ${formatOdds(signal.to.price)}`,detail:`The line stayed at ${p.side} ${signal.to.line}. This bet ${gotPricier?'costs more now than it did earlier':'now pays better than it did earlier'} at ${signal.book}.`};
}
function featuredMarketValue(p){
  const price=recommendedOdds(p),implied=americanProbability(price)*100,fair=Number.isFinite(+p.fairChance)?+p.fairChance:implied+(Number(p.edge)||0),gap=fair-implied;
  const usualOdds=fair>=50?-Math.round(100*fair/(100-fair)):Math.round(100*(100-fair)/fair),book=p.bestBook||'the best available sportsbook';
  return{headline:`Best odds: ${formatOdds(price)} at ${book}`,detail:`Sportsbooks as a group price this bet closer to ${formatOdds(usualOdds)}. The better price means a better payout if it wins.`,gap};
}
function featuredWhyMarkup(p,rank){
  const value=featuredMarketValue(p),movement=featuredMovementSummary(p),coverage=Number(p.bookCount)||0,availability=availabilityLabel(p),rankLabel=rank>=0?`#${rank+1} on this board`:'Featured on this board';
  return `<div class="featured-why"><button class="why-pick-toggle" type="button" data-why-pick="${p.id}" aria-expanded="false" aria-controls="why-pick-${p.id}"><span>Why this guy?</span><b aria-hidden="true">＋</b></button><section class="why-pick-panel" id="why-pick-${p.id}" data-why-panel="${p.id}" hidden><div class="why-pick-grid"><div class="why-stat-card"><small>LAST 10 GAMES</small><strong data-why-recent>Open to see his results</strong><span data-why-recent-detail>We’ll compare every game with today’s line</span></div><div class="why-stat-card"><small>HOW HE'S BEEN DOING</small><strong data-why-average>Loading his average</strong><span data-why-trend>Checking his last five games too</span></div><div class="why-stat-card why-value-card"><small>BEST ODDS WE FOUND</small><strong>${htmlEscape(value.headline)}</strong><span>${htmlEscape(value.detail)}</span></div><div class="why-stat-card"><small>${movement?'ODDS CHANGE':'BOOKS CHECKED'}</small><strong>${htmlEscape(movement?.headline||`Checked ${coverage||'the available'} sportsbook${coverage===1?'':'s'}`)}</strong><span>${htmlEscape(movement?.detail||'We compare several sportsbooks so one unusual price does not decide the pick.')}</span></div></div><div class="why-verdict"><small>OUR TAKE</small><strong data-why-verdict>Loading his recent games…</strong><span>${htmlEscape(rankLabel)} after comparing the odds and how many sportsbooks offer the same bet.</span></div>${availability?`<div class="why-warning"><strong>Player status:</strong> ${htmlEscape(availability)} · Make sure he is active before betting.</div>`:''}<div class="why-timestamp"><span>Odds checked: ${htmlEscape(featuredSnapshotLabel())}</span><span>Past results help explain the pick, but they cannot predict the next game.</span></div></section></div>`;
}
async function hydrateFeaturedWhy(panel,p){
  if(panel.dataset.statsLoaded==='true'||panel.dataset.statsLoading==='true')return;
  panel.dataset.statsLoading='true';
  const recentHost=panel.querySelector('[data-why-recent]'),recentDetail=panel.querySelector('[data-why-recent-detail]'),averageHost=panel.querySelector('[data-why-average]'),trendHost=panel.querySelector('[data-why-trend]'),verdictHost=panel.querySelector('[data-why-verdict]');
  recentHost.textContent='Loading recent games…';recentDetail.textContent='Checking the matching statistic';
  try{
    const payload=await playerStatsFor(p),recent=(payload.stats||[]).map(row=>({date:statDate(row),metric:propMetric(p,row)})).filter(item=>item.metric.value!==null).sort((a,b)=>(b.date?.getTime()||0)-(a.date?.getTime()||0)).slice(0,10);
    if(!panel.isConnected)return;
    if(!recent.length){recentHost.textContent='Recent games are not available';recentDetail.textContent='We cannot match this bet with the stats we receive';averageHost.textContent='No average available';trendHost.textContent='We will not guess or make one up';verdictHost.textContent=`${verdictPriceSentence(p)} We don’t have enough recent games to judge his form.`;return}
    const last5=recent.slice(0,5),hitsFor=list=>list.filter(item=>hitAgainstLine(p,item.metric.value)===true).length,average=list=>list.reduce((sum,item)=>sum+item.metric.value,0)/list.length,hits=hitsFor(recent),hits5=hitsFor(last5),avg=average(recent),avg5=average(last5),sideWord=p.side==='Over'?'above':'below',margin=p.side==='Over'?avg-p.line:p.line-avg,label=recent[0].metric.label||p.market,rate=Math.round(hits/recent.length*100);
    recentHost.textContent=`${hits} of ${recent.length} hit · ${rate}%`;
    recentDetail.textContent=`Last 5: ${hits5} of ${last5.length} · ${label}`;
    averageHost.textContent=`Last 10 average: ${avg.toFixed(1)} · Today’s line: ${p.line}`;
    trendHost.textContent=`Last 5 average: ${avg5.toFixed(1)} · His 10-game average is ${Math.abs(margin).toFixed(1)} ${margin>=0?sideWord:(p.side==='Over'?'below':'above')} today’s line`;
    const form=hits>=7&&margin>0?`He has hit this in ${hits} of his last ${recent.length}, and his average is on the right side of today’s line.`:hits>=6?`He has hit this in ${hits} of his last ${recent.length}. His recent games give us some support, but it is not a slam dunk.`:hits<=4?`He has only hit this in ${hits} of his last ${recent.length}, so recent form doesn’t help this one.`:`He has hit this in ${hits} of his last ${recent.length}, so his recent results are mixed.`;
    verdictHost.textContent=`${form} ${verdictPriceSentence(p)}`;
  }catch(error){
    if(panel.isConnected){recentHost.textContent='Recent games are unavailable';recentDetail.textContent=error.message||'Try again shortly';averageHost.textContent='No average available';trendHost.textContent='We will not guess or make one up';verdictHost.textContent=`${verdictPriceSentence(p)} Recent form isn’t available right now.`}
  }finally{panel.dataset.statsLoading='false';panel.dataset.statsLoaded='true'}
}
function verifiedCard(p,rank=-1,featured=false){
  const trust=propTrust(p),availability=availabilityLabel(p)?`<span class="availability-badge">${htmlEscape(availabilityLabel(p))}</span>`:'';
  const evidence=`<div class="card-evidence"><div class="card-stats-link">Tap the price to add it to your bet slip</div><div class="prop-trust ${trust.key}" title="${htmlEscape(trust.key==='verified'?'Fresh prices from several sportsbooks; this is not a guarantee.':'Fewer sportsbooks or older prices.')}"><small>${htmlEscape(plainTrust(trust))}</small><small>Double-check the price before you bet</small></div>${availability}</div>`;
  const base=stripLast10(compactCardBase(p,rank,featured));
  return base.replace(/<div class="bet-actions">[\s\S]*?<\/div><\/article>/,`${evidence}${featured?featuredWhyMarkup(p,rank):''}</article>`);
}
card=function(p,rank=-1,featured=false){if(state.view==='movement'||document.body.dataset.desktopPage==='movement')return movementCard(p);return verifiedCard(p,rank,featured).replace('</article>',`<div data-board-progress="${p.id}">${window.BTGLive?.boardProgress(p)||''}</div></article>`)};
const bindFeaturedWhyBase=bindCards;
bindCards=function(){bindFeaturedWhyBase();$$('[data-why-pick]').forEach(button=>{button.onclick=event=>{event.stopPropagation();const panel=document.getElementById(button.getAttribute('aria-controls')),opening=button.getAttribute('aria-expanded')!=='true';button.setAttribute('aria-expanded',String(opening));button.querySelector('b').textContent=opening?'−':'＋';panel.hidden=!opening;if(opening){hydrateFeaturedWhy(panel,props.find(item=>item.id===+button.dataset.whyPick));panel.scrollIntoView?.({behavior:'smooth',block:'nearest'})}}})};
function movementChart(p){
  const signal=movementValueSignal(p);
  if(!signal)return '<div class="movement-empty"><strong>No comparable movement yet.</strong><span>Two fresh observations at the same sportsbook are required. Alternate lines and legacy history are excluded.</span></div>';
  const rows=signal.rows,mainMove=signal.type==='primary-line',values=rows.map(row=>mainMove?row.line:BTGMovement.probability(row.price)*100),min=Math.min(...values),max=Math.max(...values),range=Math.max(mainMove?1:2,max-min),firstAt=rows[0].at,lastAt=rows.at(-1).at;
  const points=rows.map((row,index)=>({row,x:50+(row.at-firstAt)/Math.max(1,lastAt-firstAt)*550,y:175-(values[index]-min)/range*145}));
  const polyline=points.map(point=>`${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
  const axis=value=>mainMove?String(+value.toFixed(1)):`${value.toFixed(1)}%`;
  const history=rows.slice().reverse().map(row=>`<tr><td>${new Date(row.at).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</td><td>${p.binary?'To score':htmlEscape(p.side)+' '+row.line}</td><td>${formatOdds(row.price)}</td></tr>`).join('');
  return `<div class="movement-head"><div><p class="eyebrow">OBSERVED HISTORY · ${htmlEscape(signal.book)}</p><h2>${htmlEscape(p.player)}</h2><p>${htmlEscape(p.market)} · ${movementPhaseLabel(signal)} · ${htmlEscape(p.team)}</p></div></div><p class="movement-summary">${htmlEscape(movementDescription(signal))} Movement alone does not establish a profitable bet.</p><p class="movement-axis-label">${mainMove?'Primary threshold over time':'Price-implied probability (includes the book’s margin; not a win forecast)'}</p><div class="movement-chart"><svg viewBox="0 0 654 220" role="img" aria-label="${mainMove?'Primary line':'Price-implied probability'} history at ${htmlEscape(signal.book)}"><line class="movement-chart-grid" x1="50" y1="30" x2="600" y2="30"/><line class="movement-chart-grid" x1="50" y1="175" x2="600" y2="175"/><text class="movement-chart-label" x="0" y="34">${axis(min+range)}</text><text class="movement-chart-label" x="0" y="179">${axis(min)}</text><polyline class="movement-chart-line" points="${polyline}"/>${points.map(point=>`<circle class="movement-chart-dot" cx="${point.x}" cy="${point.y}" r="3"><title>${new Date(point.row.at).toLocaleString()}: ${point.row.line} at ${formatOdds(point.row.price)}</title></circle>`).join('')}<text class="movement-chart-label" x="50" y="207">${new Date(firstAt).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</text><text class="movement-chart-label" x="600" y="207" text-anchor="end">${new Date(lastAt).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</text></svg></div><table class="movement-observations"><thead><tr><th>Feed timestamp</th><th>Selection</th><th>Odds</th></tr></thead><tbody>${history}</tbody></table><div class="movement-baseline">Same player, game, market, side and sportsbook. Pregame and after-kickoff observations are separate. Shared history combines available provider snapshots and observations collected when the site refreshes odds, retaining up to seven days—not a complete opening-to-current market history. First observed is not the sportsbook’s opening price. Gaps between available snapshots are not inferred.</div>`;
}
function openMovementDetail(id){const p=props.find(item=>item.id===Number(id)),dialog=$('#movementDialog');if(!p||!dialog)return;$('#movementDetail').innerHTML=movementChart(p);if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','')}
function bindMovementLinks(){
  $$('[data-movement-detail]').forEach(button=>button.onclick=event=>{event.stopPropagation();openMovementDetail(button.dataset.movementDetail)});
  $('#propList').onclick=event=>{const button=event.target.closest('[data-movement-detail]');if(!button)return;event.preventDefault();event.stopPropagation();openMovementDetail(button.dataset.movementDetail)};
}
function movementPageActive(){return innerWidth<=720?document.body.dataset.mobilePage==='movement':document.body.dataset.desktopPage==='movement'}
function scheduleMovementRefresh(){
  if(!movementPageActive()||document.hidden){clearTimeout(movementRefreshTimer);movementRefreshTimer=null;return}
  if(movementRefreshTimer||movementRefreshPending)return;
  movementRefreshTimer=setTimeout(async()=>{
    movementRefreshTimer=null;if(!movementPageActive()||document.hidden)return;movementRefreshPending=true;movementLastCheck=Date.now();movementRefreshFailed=false;
    const events=[...new Set([...props.filter(p=>p.sport===LEAGUE&&p.eventID).map(p=>p.eventID),...scheduleGames.filter(g=>g.leagueID===LEAGUE&&Date.parse(g.status?.startsAt)<=Date.now()+7*86400000).map(g=>g.eventID)])].slice(0,16);
    for(let index=0;index<events.length;index+=3)await Promise.all(events.slice(index,index+3).map(async eventID=>{
      try{const response=await fetch(`/api/movement?eventID=${encodeURIComponent(eventID)}`,{cache:'no-store',signal:AbortSignal.timeout(12000)}),payload=await response.json();if(!response.ok||!payload.success)throw new Error('unavailable');BTGMovement.importShared(payload);if(!props.some(p=>p.eventID===eventID)){futurePropBoards.set(eventID,normalizeLiveProps(payload));rebuildPropBoard()}}
      catch{BTGMovement.invalidate(eventID);movementRefreshFailed=true}
    }));
    movementRefreshPending=false;
    if(movementPageActive()&&!document.hidden){render();scheduleMovementRefresh()}
  },Math.max(0,60000-(Date.now()-movementLastCheck)));
}
document.addEventListener('visibilitychange',scheduleMovementRefresh);
const renderBeforeRoutes=render;
render=function(){renderBeforeRoutes();bindMovementLinks();scheduleMovementRefresh();window.BTGLive?.updateLabels();if(state.view==='movement'){$('#viewTitle').textContent='Main prop movement';$('#resultCount').textContent=`${visibleProps().filter(p=>movementValueSignal(p)).length} verified moves · ${visibleProps().length} props shown · yards, receptions & TDs · ${movementRefreshFailed?'Some feeds unavailable':'same sportsbook · checks about every minute'}`;const empty=$('#emptyState');if(!visibleProps().length){empty.hidden=false;empty.innerHTML='<strong>No verified main-line moves yet.</strong><span>Alternate ladders are excluded. We need two fresh observations from the same sportsbook. Shared history is loading or no comparable change is available yet. Refresh to retry; old mixed-line history is not used.</span>'}}}
const visibleBeforeMovementOnly=visibleProps;
visibleProps=function(){const list=visibleBeforeMovementOnly();if(state.view!=='movement')return list;const moved=props.filter(p=>movementValueSignal(p)),pool=moved.length?moved:props,seen=new Set();return pool.filter(p=>{const signal=movementDisplaySignal(p);if(!signal||seen.has(signal.id))return false;seen.add(signal.id);return true}).sort((a,b)=>(movementValueSignal(b)?.to.at||0)-(movementValueSignal(a)?.to.at||0)).slice(0,moved.length?100:24)};
function showDesktopPage(page,push=true){
  const valid=['props','live','parlays','generator','movement','saved'];if(!valid.includes(page))page='props';
  document.body.dataset.desktopPage=page==='saved'?'props':page;
  if(['props','movement','saved'].includes(page))state.view=page==='props'?'board':page;
  initializedPages.add(page==='generator'?'generator':page);
  $$('.desktop-nav [data-view],.desktop-nav [data-nav-target]').forEach(item=>item.classList.toggle('active',(page==='props'&&item.dataset.view==='board')||(page==='movement'&&item.dataset.view==='movement')||item.dataset.navTarget===page));
  if(page==='parlays')renderParlays();
  if(page==='generator'){if(!mixerSetup){mixerSetup=true;setupParlayMixer()}else renderMixer()}
  render();window.BTGLive?.renderCenter();window.scrollTo({top:0,behavior:'auto'});
  if(push){const url=new URL(location.href);url.searchParams.set('desktop',page);history.pushState({desktop:page},'',url)}
}
$$('.desktop-nav [data-nav-target]').forEach(button=>button.onclick=()=>showDesktopPage(button.dataset.navTarget));
$$('.desktop-nav [data-view]').forEach(button=>button.onclick=()=>showDesktopPage(button.dataset.view==='board'?'props':button.dataset.view));
addEventListener('popstate',()=>{if(innerWidth>720)showDesktopPage(new URL(location.href).searchParams.get('desktop')||'props',false)});
if(innerWidth>720)showDesktopPage(new URL(location.href).searchParams.get('desktop')||'props',false);
const normalizeForMovement=normalizeLiveProps;
normalizeLiveProps=function(payload){
  window.BTGMovement?.observe(Array.isArray(payload?.data)?payload.data:[]);
  return normalizeForMovement(payload);
};
addEventListener('btg:preferences-loaded',event=>{preferences=upgradeWagerDefault({...preferenceDefaults,...preferences,...event.detail});preferences.avoidSameGame=Boolean(preferences.avoidSameGame);preferences.maxParlayLegs=Math.max(2,Math.min(10,Number(preferences.maxParlayLegs)||8));preferences.books=Array.isArray(preferences.books)?preferences.books:[];localStorage.setItem('bet-this-guy-preferences',JSON.stringify(preferences));$('#wager').value=preferences.typicalWager;render()});
addEventListener('btg:saved-loaded',event=>{const merged=new Set([...state.saved,...(Array.isArray(event.detail)?event.detail:[])]);state.saved=merged;localStorage.setItem('propedge-saved',JSON.stringify([...merged]));render()});
initializeApp();

// Row-number bookmarks cannot identify a pick after a board refresh. Retain a
// separate reminder so the first new save does not silently erase migration UI.
const bookmarkRecoveryKey='btg-bookmark-recovery-v1';
let bookmarkRecovery=readStored(bookmarkRecoveryKey,{});
const legacyBookmarkCount=readStored('propedge-saved',[]).filter(value=>typeof value==='number').length;
if(legacyBookmarkCount&&!bookmarkRecovery.count){
  bookmarkRecovery={count:legacyBookmarkCount,dismissed:false};
  try{localStorage.setItem(bookmarkRecoveryKey,JSON.stringify(bookmarkRecovery))}catch{}
}
function renderBookmarkRecovery(){
  $('#bookmarkRecovery').hidden=!(bookmarkRecovery.count&&!bookmarkRecovery.dismissed);
  $('#legacyBookmarkCount').textContent=`${bookmarkRecovery.count||0} older bookmark${bookmarkRecovery.count===1?'':'s'}`;
}
function openBookmarkBoard(saved=false){
  selectedPlayer='';state.search='';state.boardMarket='All';state.boardGame='All';
  state.game='All';state.team='All';state.day='All';state.timeSlot='All';state.market='All';state.side='All';state.move='All';state.minEdge=0;state.minConf=0;state.oddsType='All';state.high=false;state.heat=null;
  $('#playerSearch').value='';
  if(innerWidth<=720){showMobilePage('props',true);setView(saved?'saved':'board')}
  else showDesktopPage(saved?'saved':'props');
  if(!saved)$('#playerSearch').focus();
}
$('#openSavedProps').onclick=()=>openBookmarkBoard(true);
$('#findBookmarkPicks').onclick=()=>openBookmarkBoard(false);
$('#dismissBookmarkRecovery').onclick=()=>{
  bookmarkRecovery.dismissed=true;
  try{localStorage.setItem(bookmarkRecoveryKey,JSON.stringify(bookmarkRecovery))}catch{}
  renderBookmarkRecovery();
};
renderBookmarkRecovery();

// Verdicts: a plain answer to "is this a good bet?" on every player-prop card.
// Uses the real edge against the no-vig consensus (p.rawEdge, never floored)
// and the number of books pricing both sides (p.pairedBooks), with the same
// 1% / three-book bar as official picks. Nearly every line sits between about
// -1% and -3.5% (the books' normal cut), so "Overpriced" starts at -3.5%.
const VERDICTS={
  send:{key:'send',icon:'✅',svg:icon('check','ico ico-send'),label:'Good value',line:'The best price beats the market’s fair price.'},
  flip:{key:'flip',icon:'⚖️',svg:icon('fair','ico ico-flip'),label:'Fair price',line:'Priced about right. No edge either way.'},
  read:{key:'read',icon:'⛔',svg:icon('over','ico ico-read'),label:'Overpriced',line:'The sportsbooks are charging more than usual here. Pass.'}
};
function propVerdict(p){
  const edge=Number(p?.rawEdge);
  if(!p||p.teamMarket||!Number.isFinite(edge))return null;
  // Lines rated on the cross-line curve (an estimate) need a bigger edge.
  if(edge>=(p.curve?1.5:1)&&(Number(p.pairedBooks)||0)>=3)return VERDICTS.send;
  if(edge<=-3.5)return VERDICTS.read;
  return VERDICTS.flip;
}
function plainOutcome(p){
  const market=String(p.market||'').toLowerCase(),line=Number(p.line);
  if(p.binary){
    const yes=p.side==='Over';
    if(/first/.test(market))return yes?'scores the first touchdown':'does not score the first touchdown';
    if(/last/.test(market))return yes?'scores the last touchdown':'does not score the last touchdown';
    if(/touchdown|\btd\b/.test(market))return yes?'scores a touchdown':'does not score a touchdown';
    return null;
  }
  if(!market||!Number.isFinite(line))return null;
  if(p.side==='Over')return Number.isInteger(line)?`has more than ${line} ${market}`:`has ${Math.ceil(line)}+ ${market}`;
  if(Number.isInteger(line))return `has fewer than ${line} ${market}`;
  const most=Math.floor(line);
  return most<=0?`has no ${market}`:`has ${most} or fewer ${market}`;
}
function plainBet(p){
  const odds=Number(recommendedOdds(p)),stake=Math.max(1,Number(preferences.typicalWager)||100),outcome=plainOutcome(p);
  const payout=odds>=100?odds/100:odds<=-100?100/Math.abs(odds):null;
  if(!payout||!outcome)return '';
  const dollars=value=>`$${Number.isInteger(value)?value:value.toFixed(2)}`;
  return `Bet ${dollars(stake)} → win ${dollars(Math.round(stake*payout*100)/100)} if ${p.player} ${outcome}.`;
}
function verdictPriceSentence(p){
  const verdict=propVerdict(p),price=`${formatOdds(recommendedOdds(p))} at ${p.bestBook||'the best available sportsbook'}`;
  if(verdict?.key==='send')return `The best price we found (${price}) pays better than the market’s fair price, so it is rated Good value.`;
  if(verdict?.key==='read')return `Even the best price we found (${price}) is worse than usual, so we rate it Overpriced.`;
  return `The best price we found (${price}) is about what the market thinks is fair, so it is rated Fair price, with no edge either way.`;
}
function verdictMarkup(p){
  const verdict=propVerdict(p);if(!verdict)return '';
  const bet=plainBet(p);
  return `<div class="verdict verdict-${verdict.key}" data-verdict="${verdict.key}"><div class="verdict-badge"><span class="verdict-icon" aria-hidden="true">${verdict.svg}</span><strong>${verdict.label}</strong></div><p class="verdict-line">${htmlEscape(verdict.line)}</p>${bet?`<p class="verdict-bet">${htmlEscape(bet)}</p>`:''}<p class="verdict-trend" data-verdict-trend="${p.id}" hidden></p><button type="button" class="verdict-share" data-share-prop="${p.id}">Share</button></div>`;
}
// Share: a ready-to-paste message through the phone's share sheet,
// or the clipboard where sharing isn't available. Fair price and Overpriced
// ratings say so honestly.
function shareText(p){
  const verdict=propVerdict(p),bet=plainBet(p),pick=`${p.player} ${p.binary?'':`${p.side} ${p.line} `}${p.market}`.replace(/\s+/g,' ').trim();
  const price=`${formatOdds(recommendedOdds(p))}${p.bestBook&&p.bestBook!=='Best available'?` at ${p.bestBook}`:''}`;
  if(verdict?.key==='send')return `✅ Good value: ${pick} (${price}). ${bet}`.trim();
  if(verdict?.key==='read')return `⛔ Overpriced: ${pick} (${price}). The sportsbooks are charging more than usual, so we pass.`;
  return `⚖️ Fair price: ${pick} (${price}). Priced about right, no edge either way. ${bet}`.trim();
}
async function shareProp(p,button){window.btgCount?.('share');
  const text=shareText(p),url=`${location.origin}/app`,label=button.textContent;
  const flash=message=>{button.textContent=message;setTimeout(()=>{if(button.isConnected)button.textContent=label},2200)};
  try{if(navigator.share){await navigator.share({text,url});return}}catch(error){if(error?.name==='AbortError')return}
  try{await navigator.clipboard.writeText(`${text} ${url}`);flash('Copied to clipboard')}catch{flash('Couldn’t copy on this device')}
}
const cardBeforeVerdict=card;
card=function(p,rank=-1,featured=false){
  let html=cardBeforeVerdict(p,rank,featured);
  if(state.view==='movement'||document.body.dataset.desktopPage==='movement')return html;
  // Rank badges ("#1 TOP PLAY") are only earned by bets the numbers back.
  if(propVerdict(p)?.key!=='send')html=html.replace(/<span class="top-play-badge">[\s\S]*?<\/span>/,'').replace(' top-play"','"');
  return html.replace(/<section class="mockup-pick">[\s\S]*?<\/section>/,section=>section+verdictMarkup(p));
};
// Trend notes: recent form as context only. The books already price it in,
// so it never changes the verdict.
const verdictTrends=new Map();
async function hydrateVerdictTrend(host,p){
  if(host.dataset.loaded)return;host.dataset.loaded='true';
  try{
    const key=savedPropKey(p);let text=verdictTrends.get(key);
    if(text===undefined){
      const payload=await playerStatsFor(p),recent=(payload.stats||[]).map(row=>({date:statDate(row),metric:propMetric(p,row)})).filter(item=>item.metric.value!==null).sort((a,b)=>(b.date?.getTime()||0)-(a.date?.getTime()||0)).slice(0,10);
      const hits=recent.filter(item=>hitAgainstLine(p,item.metric.value)===true).length;
      text=recent.length>=3?`Recent form: hit this in ${hits} of his last ${recent.length} games. Context only — the odds already account for it.`:'';
      verdictTrends.set(key,text);
    }
    if(text&&host.isConnected){host.textContent=text;host.hidden=false}
    const tag=document.querySelector(`[data-trend-tag="${p.id}"]`),short=String(text||'').match(/^(\S+) Trend: hit this in (\d+) of his last (\d+)/);
    if(tag&&short)tag.textContent=` · ${short[1]} ${short[2]} of last ${short[3]}`;
  }catch{}
}
const bindCardsBeforeVerdict=bindCards;let verdictObserver=null;
bindCards=function(){
  bindCardsBeforeVerdict();
  $$('[data-share-prop]').forEach(button=>button.onclick=event=>{event.stopPropagation();const p=props.find(item=>item.id===+button.dataset.shareProp);if(p)shareProp(p,button)});
  verdictObserver?.disconnect();
  const hosts=$$('[data-verdict-trend]'),start=host=>{const p=props.find(item=>item.id===+host.dataset.verdictTrend);if(p)hydrateVerdictTrend(host,p)};
  if(!hosts.length)return;
  if(typeof IntersectionObserver!=='function'){hosts.slice(0,12).forEach(start);return}
  // The note starts hidden (no size), so watch its visible verdict box instead.
  const observer=verdictObserver=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){observer.unobserve(entry.target);const host=entry.target.querySelector('[data-verdict-trend]');if(host)start(host)}}),{rootMargin:'200px'});
  hosts.forEach(host=>observer.observe(host.closest('.prop-card')||host.closest('.verdict')||host));
};
// Honest headline: "Top props this week" only when at least one bet earned it.
const verdictGuideKey='btg-verdict-guide-dismissed';
const verdictGuideDismissed=()=>{try{return localStorage.getItem(verdictGuideKey)==='1'}catch{return false}};
$('#verdictGuideClose')&&($('#verdictGuideClose').onclick=()=>{try{localStorage.setItem(verdictGuideKey,'1')}catch{}$('#verdictGuide').hidden=true});
const renderBeforeVerdict=render;
render=function(){
  renderBeforeVerdict();
  const guide=$('#verdictGuide');
  if(guide&&guide.id)guide.hidden=verdictGuideDismissed()||state.view!=='board'||!$$('#propList .verdict').length;
  const title=$('#viewTitle'),count=$('#resultCount');
  if(!title||!count||title.textContent!=='Top props this week'||!$$('#propList .prop-card').length)return;
  const earned=$$('#propList .verdict-send').length,updated=count.textContent.split(' · ').pop();
  if(earned){count.textContent=`${earned} earned a Bet This Guy · ${count.textContent}`;return}
  title.textContent='No one’s earned a Bet This Guy yet';
  count.textContent=`We only stamp it when the numbers back it. Here are today’s closest calls · ${updated}`;
};

// Simpler menu: Bets · Parlays · Slip · More on phones, Bets · Live · Parlays ·
// More on desktop. The pages are unchanged; less-used ones live under More.
(function(){
  const sheet=$('#moreSheet'),mobileMore=$('#mobileMoreBtn'),desktopMore=$('#desktopMoreBtn'),panel=$('#desktopMorePanel');
  const morePages=['generator','movement'];
  const syncMoreActive=()=>{
    const mobilePage=document.body.dataset.mobilePage,desktopPage=document.body.dataset.desktopPage;
    mobileMore?.classList.toggle('active',morePages.includes(mobilePage));
    desktopMore?.classList.toggle('active',morePages.includes(desktopPage)||desktopPage==='saved'||!!panel?.querySelector('.nav-link.active'));
  };
  if(sheet&&mobileMore){
    mobileMore.onclick=event=>{event.preventDefault();if(!sheet.open)sheet.showModal()};
    $('#moreSheetClose').onclick=()=>sheet.close();
    sheet.addEventListener('click',event=>{if(event.target===sheet)sheet.close()});
    sheet.querySelectorAll('[data-page-link]').forEach(link=>link.addEventListener('click',()=>{sheet.close();syncMoreActive()}));
    sheet.querySelector('[data-more-action="saved"]').onclick=()=>{sheet.close();$('#openSavedProps')?.click()};
    sheet.querySelector('[data-more-action="settings"]').onclick=()=>{sheet.close();$('#settingsBtn')?.click()};
    // On phones the theme and feed buttons live here instead of the header.
    const themeAction=sheet.querySelector('[data-more-action="theme"]'),feedAction=sheet.querySelector('[data-more-action="feed"]');
    if(themeAction)themeAction.onclick=()=>{sheet.close();$('#themeBtn')?.click()};
    if(feedAction)feedAction.onclick=()=>{sheet.close();$('#feedBtn')?.click()};
  }
  if(desktopMore&&panel){
    const close=()=>{panel.hidden=true;desktopMore.setAttribute('aria-expanded','false')};
    desktopMore.onclick=event=>{
      event.stopPropagation();
      if(!panel.hidden)return close();
      // The nav can scroll sideways, so place the panel on the page, not inside it.
      const box=desktopMore.getBoundingClientRect();panel.style.top=`${box.bottom+8}px`;panel.style.left=`${Math.max(12,Math.min(box.left,innerWidth-292))}px`;
      panel.hidden=false;desktopMore.setAttribute('aria-expanded','true');
    };
    panel.addEventListener('click',()=>{close();setTimeout(syncMoreActive,0)});
    document.addEventListener('click',event=>{if(!panel.hidden&&!panel.contains(event.target))close()});
    addEventListener('keydown',event=>{if(event.key==='Escape')close()});
    addEventListener('resize',close);
  }
  if(typeof MutationObserver==='function')new MutationObserver(syncMoreActive).observe(document.body,{attributes:true,attributeFilter:['data-mobile-page','data-desktop-page']});
  syncMoreActive();
})();

// Anonymous usage counts: batched metric names only (no cookies or IDs). A
// "seen before" flag stays in this browser to tell new from returning visits.
// Visiting /?me=1 marks this device as the owner's: nothing from it is counted
// (/?me=0 undoes it). The cookie lets the server skip pages it counts itself.
const btgOwner=(()=>{try{const q=new URLSearchParams(location.search).get('me');
  if(q==='1'||q==='0'){const on=q==='1';if(on)localStorage.setItem('btg-owner','1');else localStorage.removeItem('btg-owner');document.cookie=`btg_owner=${on?1:0}; Path=/; Max-Age=${on?315360000:0}; SameSite=Lax; Secure`;
    history.replaceState(null,'',location.pathname+location.hash);
    setTimeout(()=>{const n=document.createElement('div');n.className='owner-toast';n.setAttribute('role','status');n.textContent=on?'This device won’t be counted in site stats.':'This device is counted in site stats again.';document.body.append(n);setTimeout(()=>n.remove(),4000)},300)}
  return localStorage.getItem('btg-owner')==='1'}catch{return false}})();
// Where a visit came from, counted once per visit.
function btgSource(){try{const utm=new URLSearchParams(location.search).get('utm_source')||'',ref=document.referrer?new URL(document.referrer).hostname:'',v=(utm||ref).toLowerCase();
  if(ref&&ref===location.hostname&&!utm)return null;if(!v)return 'src:direct';
  if(/reddit|redd\.it/.test(v))return 'src:reddit';if(/(^|\.)(x|twitter)\.com$|^t\.co$|^x$|twitter/.test(v))return 'src:x';if(/google\./.test(v)||v==='google')return 'src:google';
  if(/facebook|instagram|threads|tiktok|discord|t\.me|telegram|whatsapp|snapchat|linkedin/.test(v))return 'src:social';return 'src:other'}catch{return null}}
(function(){
  const queue=new Set();let timer=null;
  const flush=()=>{timer=null;if(!queue.size)return;const items=[...queue].slice(0,4);items.forEach(m=>queue.delete(m));if(queue.size)timer=setTimeout(flush,300);const body=JSON.stringify({m:items});try{if(navigator.sendBeacon?.('/api/hit',new Blob([body],{type:'application/json'})))return}catch{}try{fetch('/api/hit',{method:'POST',body,keepalive:true,headers:{'content-type':'application/json'}}).catch(()=>{})}catch{}};
  window.btgCount=metric=>{if(btgOwner)return;queue.add(metric);if(queue.size>=4)flush();else if(!timer)timer=setTimeout(flush,1500)};
  addEventListener('pagehide',flush);
  window.btgCountVisit=view=>{
    window.btgCount(view);
    try{if(!sessionStorage.getItem('btg-visit')){sessionStorage.setItem('btg-visit','1');window.btgCount(localStorage.getItem('btg-seen')?'visit:return':'visit:new');const src=btgSource();if(src)window.btgCount(src);localStorage.setItem('btg-seen','1')}}catch{}
  };
})();

// First impression: a banner with last week's official record, a strip of
// last week's hits, a positive headline, verdict-first cards and a desktop
// board that uses the space an empty bet slip would take.
(function(){
  const oddsDecimal=o=>{o=Number(o);return o>=100?1+o/100:o<=-100?1+100/Math.abs(o):null};
  const money=v=>`${v<0?'−':'+'}$${Math.abs(Math.round(v)).toLocaleString('en-US')}`;
  const graded=r=>r.status!=='provisional'&&['won','lost','push'].includes(r.result);
  const weekOf=r=>(String(r.id||'').match(/^official\|(\d{4}-\d{2}-\d{2})\|/)||[])[1]||null;
  // Mirrors the server: official weeks run Tuesday noon UTC to Tuesday noon UTC.
  const currentWeek=(now=Date.now())=>{const d=new Date(now-12*3600000);d.setUTCHours(0,0,0,0);d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+5)%7);return d.toISOString().slice(0,10)};
  const recordLegs=r=>{try{const legs=JSON.parse(r.legs_json||'[]');return Array.isArray(legs)?legs:[]}catch{return []}};
  // Everything is shown at the viewer's usual wager ($100 unless changed in Settings).
  let heroStake=100;
  const viewerStake=()=>Math.max(1,Number(preferences?.typicalWager)||100);
  const stakeText=()=>`$${heroStake.toLocaleString('en-US',{maximumFractionDigits:2})}`;
  const payout=r=>{const d=oddsDecimal(r.kind==='parlay'?r.combined_odds:r.odds);return r.result==='won'&&d?heroStake*(d-1):r.result==='lost'?-heroStake:0};
  // Same comparison as the results page: same line only, 0.05% tolerance.
  const beatClose=r=>{
    if(r.kind!=='prop'||!r.closing_captured_at||r.closing_odds==null)return null;
    if(r.closing_line!=null&&r.line!=null&&Math.abs(Number(r.closing_line)-Number(r.line))>0.01)return null;
    const posted=oddsDecimal(r.odds),close=oddsDecimal(r.closing_odds);
    return posted&&close?(posted/close-1)*100>0.05:null;
  };
  const pickName=r=>{
    if(r.kind==='parlay'){const legs=recordLegs(r);return {title:`${legs.length}-leg parlay`,detail:legs.map(l=>l.player).join(' + ')}}
    const binary=/touchdown/i.test(r.market||'')&&Number(r.line)===0.5;
    return {title:r.player,detail:binary?`${r.side==='Under'?'No ':''}${r.market}`:`${r.side} ${r.line} ${r.market}`};
  };
  const weekLabel=(week,current)=>{
    const last=new Date(Date.parse(current+'T00:00:00Z')-7*86400000).toISOString().slice(0,10);
    if(week===current)return 'THIS WEEK SO FAR';
    if(week===last)return 'LAST WEEK';
    return `WEEK OF ${new Date(week+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'}).toUpperCase()}`;
  };
  function summarise(rows,now=Date.now(),stake=100){
    heroStake=stake;
    const current=currentWeek(now),weeks=new Map();
    for(const r of rows){const w=weekOf(r);if(w)(weeks.get(w)||weeks.set(w,[]).get(w)).push(r)}
    const ordered=[...weeks.keys()].sort().reverse();
    // A finished earlier week first; the current week only once it has real volume.
    const week=ordered.find(w=>w<current&&weeks.get(w).some(r=>r.kind==='prop'&&graded(r)))||ordered.find(w=>weeks.get(w).filter(r=>r.kind==='prop'&&graded(r)).length>=5);
    if(!week)return null;
    const list=weeks.get(week),props=list.filter(r=>r.kind==='prop'&&graded(r)),parlays=list.filter(r=>r.kind==='parlay'&&graded(r));
    const count=(items,res)=>items.filter(r=>r.result===res).length;
    const closes=props.map(beatClose).filter(v=>v!==null);
    return {
      week,label:weekLabel(week,current),
      wins:count(props,'won'),losses:count(props,'lost'),pushes:count(props,'push'),profit:props.reduce((s,r)=>s+payout(r),0),
      parlayWins:count(parlays,'won'),parlayLosses:count(parlays,'lost'),parlayProfit:parlays.reduce((s,r)=>s+payout(r),0),
      beat:closes.filter(Boolean).length,tracked:closes.length,
      // Singles and parlays alternate, biggest payouts first in each.
      picks:list.filter(r=>(r.kind==='prop'||r.kind==='parlay')&&graded(r)).sort((a,b)=>({won:0,push:1,lost:2}[a.result]??3)-({won:0,push:1,lost:2}[b.result]??3)||payout(b)-payout(a)),
      hits:(()=>{const won=kind=>list.filter(r=>r.kind===kind&&graded(r)&&r.result==='won').sort((a,b)=>payout(b)-payout(a)),a=won('prop'),b=won('parlay'),out=[];for(let i=0;out.length<12&&(i<a.length||i<b.length);i++){if(a[i])out.push(a[i]);if(b[i]&&out.length<12)out.push(b[i])}return out})()
    };
  }
  window.BTGFirstImpression={summarise,currentWeek,hitDetails:r=>hitDetails(r),pickDetails:r=>pickDetails(r),officialNow:(rows,now)=>officialNow(rows,now)};
  // Details sheet for a finished pick: the exact bet, the result, and how the
  // price moved from posting to kickoff.
  const when=iso=>{const d=new Date(iso);return Number.isFinite(d.getTime())?d.toLocaleString([],{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):''};
  const legText=l=>{const binary=/touchdown/i.test(l.market||'')&&Number(l.line)===0.5;return binary?`${l.side==='Under'?'No ':''}${l.market}`:`${l.side} ${l.line} ${l.market}`};
  const moveOf=(line,close,side)=>{const a=Number(line),b=Number(close);if(line==null||close==null||!Number.isFinite(a)||!Number.isFinite(b)||Math.abs(a-b)<=.01)return null;return {line:b,ourWay:String(side).toLowerCase()==='under'?b<a:b>a}};
  function sparkline(points,endLabel='Final'){
    const pts=points.filter(p=>Number.isFinite(p.t)&&oddsDecimal(p.o));if(pts.length<3)return '';
    const w=280,h=64,t0=pts[0].t,t1=pts.at(-1).t||t0+1,ds=pts.map(p=>oddsDecimal(p.o)),lo=Math.min(...ds),hi=Math.max(...ds),span=hi-lo||1;
    const xy=pts.map((p,i)=>[8+(w-16)*((p.t-t0)/((t1-t0)||1)),8+(h-16)*(1-(ds[i]-lo)/span)]);
    return `<svg class="hit-spark" viewBox="0 0 ${w} ${h}" role="img" aria-label="Price from ${formatOdds(pts[0].o)} to ${formatOdds(pts.at(-1).o)}"><polyline points="${xy.map(p=>p.map(v=>v.toFixed(1)).join(',')).join(' ')}"/>${xy.map((p,i)=>`<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${i===0||i===xy.length-1?3.5:2}"/>`).join('')}</svg><div class="hit-spark-labels"><span>Posted ${htmlEscape(formatOdds(pts[0].o))}</span><span>Higher = pays more</span><span>${endLabel} ${htmlEscape(formatOdds(pts.at(-1).o))}</span></div>`;
  }
  function legMovement(leg,postedAt,closeOdds,closeLine,closeAt){
    const rows=[];
    const trail=(Array.isArray(leg.priceTrail)?leg.priceTrail:[]).filter(p=>p.o!=null).map(p=>({t:p.t,o:p.o}));
    const points=[{t:Date.parse(postedAt),o:leg.odds},...trail,...(closeOdds!=null&&!moveOf(leg.line,closeLine,leg.side)?[{t:Date.parse(closeAt)||Date.parse(leg.gameTime),o:closeOdds}]:[])];
    const chart=sparkline(points);
    const move=moveOf(leg.line,closeLine,leg.side);
    if(move)rows.push(`<p class="hit-move ${move.ourWay?'up':'down'}">Line moved to ${htmlEscape(move.line)} before kickoff (${move.ourWay?'in your favour':'against you'})</p>`);
    else if(closeOdds!=null){
      const a=oddsDecimal(leg.odds),b=oddsDecimal(closeOdds),edge=a&&b?(a/b-1)*100:0,label=edge>.05?'Better than the final price':edge<-.05?'Worse than the final price':'Same as the final price';
      rows.push(`<p class="hit-move ${edge>.05?'up':edge<-.05?'down':''}">Posted ${htmlEscape(formatOdds(leg.odds))} → final ${htmlEscape(formatOdds(closeOdds))} · ${label}${Math.abs(edge)>.05?` (${edge>0?'+':'−'}${Math.abs(edge).toFixed(1)}% payout)`:''}</p>`);
    }else rows.push('<p class="hit-move">Final price before kickoff wasn’t recorded for this one.</p>');
    return chart+rows.join('');
  }
  // One sheet for every official pick (locked, hit, lost, push), built by the
  // shared BTGSheet renderer so board props, picks and parlays all look alike.
  // "I bet this": one tap copies an official pick into the viewer's own
  // tracked bets (My Picks), graded automatically like the board picks.
  const betKey='btg-bet-official',betIds=()=>{try{return new Set(JSON.parse(localStorage.getItem(betKey)||'[]'))}catch{return new Set()}};
  function betAction(r,legs,done){
    const start=Date.parse(r.game_time||legs[0]?.gameTime||'');if(done||!(start>Date.now())||!window.BTGAuth?.trackParlay)return [];
    const tracked=()=>betIds().has(r.id),label=()=>tracked()?'✓ In My Picks':'I bet this';
    return [{label:label(),primary:true,wide:true,onClick:async b=>{
      if(tracked())return;
      const first=legs[0]||{},list=r.kind==='parlay'?legs.map(l=>({player:l.player,market:l.market,side:l.side,line:l.line,odds:l.odds,gameStart:l.gameTime,team:l.team,eventID:l.gameId})):[{player:r.player,market:r.market,side:r.side,line:r.line,odds:r.odds,gameStart:r.game_time||first.gameTime,team:first.team,eventID:first.gameId}];
      b.disabled=true;b.textContent='Saving…';
      try{const out=await window.BTGAuth.trackParlay({legs:list,wager:wagerStake(),sportsbook:first.book||null,source:'board'});
        if(out){const ids=betIds();ids.add(r.id);try{localStorage.setItem(betKey,JSON.stringify([...ids].slice(-200)))}catch{}b.textContent='✓ In My Picks';window.btgCount?.('official:bet');window.BTGAuth.refreshBets?.();window.BTGMyRecord?.()}
        else{b.textContent=label();b.disabled=false}}
      catch(error){b.textContent=error?.message||'Couldn’t save. Try again.';b.disabled=false}}}];
  }
  function recordModel(r){
    const legs=recordLegs(r),isParlay=r.kind==='parlay',odds=isParlay?r.combined_odds:r.odds,done=graded(r),d=oddsDecimal(odds),first=legs[0]||{};
    const chip=done?{won:{cls:'g',icon:'check',text:'Hit'},lost:{cls:'r',icon:'over',text:'Lost'},push:{cls:'n',icon:'fair',text:'Push'}}[r.result]:r.status==='provisional'?{cls:'n',icon:'fair',text:'Provisional'}:{cls:'n',icon:'lock',text:'Official pick · Locked'};
    const bet=isParlay?legs.map(l=>l.player).join(' + '):(t=>t.charAt(0).toUpperCase()+t.slice(1))(legText({side:r.side,line:r.line,market:String(r.market||'').toLowerCase()}));
    const team=String(first.team||'').replace(' · ',' '),game=[isParlay?`${new Set(legs.map(l=>l.gameId||l.team)).size} game${new Set(legs.map(l=>l.gameId||l.team)).size===1?'':'s'}`:team,when(r.game_time||first.gameTime),done?'Final':''].filter(Boolean).join(' · ');
    const posted=[first.book&&!isParlay?first.book:'',when(r.posted_at)].filter(Boolean).join(' · ');
    const rows=[];
    if(!isParlay){
      if(done){const v=first.actualValue!=null?`${first.minimumOnly?'At least ':''}${first.actualValue} ${String(r.market||'').toLowerCase()}`:'—';rows.push(['Result',v,r.result==='won'?'pos':r.result==='lost'?'neg':'']);rows.push(['Posted at',posted,'']);
        const move=moveOf(r.line,r.closing_line,r.side);
        if(move)rows.push(['Closing line',`${move.line} · ${move.ourWay?'moved our way':'moved against us'}`,move.ourWay?'pos':'']);
        else if(r.closing_odds!=null){const a=oddsDecimal(r.odds),c=oddsDecimal(r.closing_odds),e=a&&c?(a/c-1)*100:0;rows.push(['Closing price',`${formatOdds(r.closing_odds)} · ${e>.05?'we beat the close':e<-.05?'close was better':'same as the close'}`,e>.05?'pos':''])}
        else rows.push(['Closing price','Not recorded',''])}
      else{const lv=liveLine(r);if(lv)rows.push(['Live',lv.html.replace(/<[^>]+>/g,''),lv.cls==='hit'?'pos':lv.cls==='miss'?'neg':'']);rows.push(['Locked at',posted,'']);if(Number(first.edge)>0)rows.push(['vs fair price',`+${Number(first.edge).toFixed(1)}% better`,'pos']);
        const last=(Array.isArray(first.priceTrail)?first.priceTrail:[]).filter(p=>p&&p.o!=null).at(-1);if(last){const a=oddsDecimal(r.odds),b=oddsDecimal(last.o);rows.push(['Price now',`${formatOdds(last.o)}${a&&b&&b<a-1e-9?' · you got the better price':a&&b&&b>a+1e-9?' · better now':''}`,a&&b&&b<a-1e-9?'pos':''])}}
    }else rows.push(['Posted',when(r.posted_at),'']);
    const legRows=isParlay?legs.map(l=>({title:l.player,text:legText(l),odds:formatOdds(l.odds),result:done||l.result?l.result:null,onClick:dialog=>{dialog?.close?.();openPlayerProfile(statsProp(l))}})):null;
    const trail=isParlay?[]:(Array.isArray(first.priceTrail)?first.priceTrail:[]).filter(p=>p&&p.o!=null).map(p=>p.o);
    const close=done&&!isParlay&&r.closing_odds!=null&&!moveOf(r.line,r.closing_line,r.side)?[r.closing_odds]:[];
    const points=[odds,...trail,...close].filter(o=>o!=null);
    return {chip,title:isParlay?`${legs.length}-leg parlay`:r.player,bet,game,price:formatOdds(odds),stake:stakeText(),
      money:done?money(payout(r)):d?`wins $${Math.round(heroStake*(d-1)).toLocaleString('en-US')}`:'—',moneyCls:done?(r.result==='won'?'pos':r.result==='lost'?'neg':''):'pos',
      rows,legs:legRows,chart:points.length>=2?{label:done?'Price posted → kickoff':'Price since posted',points}:null,
      actions:[...betAction(r,legs,done),{label:done&&r.result==='won'?'Share this hit':'Share',icon:'share',primary:false,wide:true,share:`${done&&r.result==='won'?'✅ Hit':'Bet This Guy pick'}: ${isParlay?`${legs.length}-leg parlay (${formatOdds(odds)})`:`${r.player} ${bet} (${formatOdds(odds)})`} · ${location.origin}`}],
      links:[...(isParlay?[]:[{text:`${String(r.player||'').split(' ').slice(-1)[0]}’s stats & game log ›`,onClick:()=>openPlayerProfile(statsProp({...first,player:r.player,market:r.market,line:r.line,side:r.side,odds:r.odds,gameTime:r.game_time||first.gameTime}))}]),{text:'See every pick on Results ›',href:'/trust#official'}]};
  }
  const hitDetails=r=>window.BTGSheet.render(recordModel(r)),pickDetails=hitDetails;
  function openPick(r){if(!r)return;window.btgCount?.('hit:open');window.BTGSheet.open(recordModel(r))}
  const openHit=openPick;
  if($('#hitDialog')){const dialog=$('#hitDialog');$('#hitDialogClose').onclick=()=>dialog.close?.();dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close?.()})}
  function renderHero(s){
    const hero=$('#heroBanner'),strip=$('#hitsStrip');if(!hero)return;
    if(!s){hero.hidden=false;return}
    $('#heroEyebrow').textContent='OFFICIAL RECORD';
    $('#heroTitle').innerHTML=`${htmlEscape(s.label==='LAST WEEK'?'Last week':s.label==='THIS WEEK SO FAR'?'This week so far':(s.label.startsWith('WEEK OF ')?`Week of ${s.label.charAt(8)}${s.label.slice(9).toLowerCase()}`:s.label.charAt(0)+s.label.slice(1).toLowerCase()))} <b>${s.wins}–${s.losses}${s.pushes?`–${s.pushes}`:''}</b> <span class="hero-profit ${s.profit>=0?'up':'down'}">${htmlEscape(money(s.profit))}</span>`;
    // Lead with the season once it has real volume; last week opens below.
    const season=heroSeason&&heroSeason.wins+heroSeason.losses>=5?heroSeason:null,weekTitle=$('#heroTitle').innerHTML;
    if(season){const net=season.profit*heroStake/100;$('#heroTitle').innerHTML=`Season <b>${season.wins}–${season.losses}${season.pushes?`–${season.pushes}`:''}</b> <span class="hero-profit ${net>=0?'up':'down'}">${htmlEscape(money(net))}</span>`}
    const stats=[[money(s.profit),`betting ${stakeText()} a pick`,s.profit>=0?'up':'down']];
    if(s.tracked)stats.push([`${s.beat} of ${s.tracked}`,'beat the closing line','']);
    if(s.parlayWins+s.parlayLosses)stats.push([`${s.parlayWins}–${s.parlayLosses}`,`parlays · ${money(s.parlayProfit)}`,s.parlayProfit>=0?'up':'down']);
    $('#heroStats').innerHTML=stats.map(([value,label,tone])=>`<div class="hero-stat ${tone}"><strong>${htmlEscape(value)}</strong><span>${htmlEscape(label)}</span></div>`).join('');
    $('#heroNote').textContent=`Singles at ${stakeText()} a pick at the posted price. Past results don’t guarantee future ones.`;
    hero.hidden=false;document.body.classList.add('has-hero');
    // Tap the record to see every graded pick from that week, hits first.
    if(s.picks?.length){
      const label=s.label==='LAST WEEK'?'last week’s':s.label==='THIS WEEK SO FAR'?'this week’s':'that week’s';
      $('#heroTitle').innerHTML=`<button type="button" class="hero-toggle" id="heroToggle" aria-expanded="false" aria-controls="heroPicks" aria-label="${htmlEscape(`Show ${label} picks`)}">${$('#heroTitle').innerHTML}<i aria-hidden="true"><svg class="ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></i></button>`;
      let panel=$('#heroPicks');if(!panel){panel=document.createElement('div');panel.id='heroPicks';panel.className='hero-picks';hero.append(panel)}
      panel.hidden=true;
      const tag={won:['g','check','Hit'],lost:['r','over','Lost'],push:['n','fair','Push']};
      panel.innerHTML=`${season?`<p class="hp-week">${weekTitle}</p>`:''}<ul>${s.picks.map((r,i)=>{const n=pickName(r),odds=r.kind==='parlay'?r.combined_odds:r.odds,[cls,ic,txt]=tag[r.result]||tag.push,net=payout(r);return `<li><button type="button" data-hero-pick="${i}" aria-label="${htmlEscape(`${txt}: ${n.title}, ${n.detail}`)}"><span class="hp-tag ${cls}">${icon(ic)}${txt}</span><span class="hp-name"><strong>${htmlEscape(n.title)}</strong><small>${htmlEscape(n.detail)}</small></span><span class="hp-num"><b>${htmlEscape(formatOdds(odds))}</b><small class="${net>0?'up':net<0?'down':''}">${htmlEscape(money(net))}</small></span></button></li>`}).join('')}</ul><a class="hp-all" href="/trust#official">Every pick on Results →</a>`;
      panel.querySelectorAll('[data-hero-pick]').forEach(b=>b.onclick=()=>openHit(s.picks[+b.dataset.heroPick]));
      const toggle=$('#heroToggle');toggle.onclick=()=>{const open=panel.hidden;panel.hidden=!open;toggle.setAttribute('aria-expanded',String(open));hero.classList.toggle('open',open);if(open)window.btgCount?.('hero:picks')};
    }
    if(!strip||!s.hits.length)return;
    $('#hitsTitle').textContent=s.label==='LAST WEEK'?'Last week’s hits':s.label==='THIS WEEK SO FAR'?'This week’s hits':'Recent hits';
    $('#hitsRow').innerHTML=s.hits.map((r,i)=>{const n=pickName(r),odds=r.kind==='parlay'?r.combined_odds:r.odds;return `<button type="button" class="hit-card-mini" data-hit="${i}" aria-label="Details for ${htmlEscape(n.title)}"><span class="hit-tag">${icon('check')} HIT</span><strong>${htmlEscape(n.title)}</strong><small>${htmlEscape(n.detail)}</small><div class="hit-foot"><b>${htmlEscape(formatOdds(odds))}</b><span>${htmlEscape(stakeText())} → ${htmlEscape(money(payout(r)))}</span></div><em class="hit-more">Tap for details ›</em></button>`}).join('');
    $$('#hitsRow [data-hit]').forEach(button=>button.onclick=()=>openHit(s.hits[+button.dataset.hit]));
    strip.hidden=false;
    // Arrows for mouse users; phones swipe the row directly.
    const row=$('#hitsRow'),prev=$('#hitsPrev'),next=$('#hitsNext'),sync=()=>{if(!prev||!next)return;prev.disabled=row.scrollLeft<=4;next.disabled=row.scrollLeft+row.clientWidth>=row.scrollWidth-4};
    if(prev&&next){prev.onclick=()=>row.scrollBy({left:-row.clientWidth*.85,behavior:'smooth'});next.onclick=()=>row.scrollBy({left:row.clientWidth*.85,behavior:'smooth'});row.addEventListener('scroll',sync,{passive:true});sync()}
  }
  // This week's official picks, first thing on the home page: every pick in the
  // current official week, locked with its posted price, then graded.
  const officialDone=r=>['won','lost','push','void'].includes(r.result);
  function officialNow(rows,now=Date.now()){
    const current=currentWeek(now);
    // In play first, then upcoming by kickoff; graded picks go last (newest
    // first) under a "Final" label, still in the list and in the record.
    const group=r=>officialDone(r)?2:Date.parse(r.game_time||'')<=now?0:1,t=r=>String(r.game_time||'');
    return rows.filter(r=>weekOf(r)===current&&(r.kind==='prop'||r.kind==='parlay')).sort((a,b)=>group(a)-group(b)||(group(a)===2?t(b).localeCompare(t(a)):t(a).localeCompare(t(b)))||String(a.posted_at||'').localeCompare(String(b.posted_at||'')));
  }
  const kickoff=iso=>{const d=new Date(iso);return Number.isFinite(d.getTime())?d.toLocaleString([],{weekday:'short',hour:'numeric',minute:'2-digit'}):''};
  function officialRow(r,i){
    const legs=recordLegs(r),isParlay=r.kind==='parlay',odds=isParlay?r.combined_odds:r.odds;
    const graded=r.status!=='provisional'&&['won','lost','push'].includes(r.result);
    const status=graded?{won:['won','Won'],lost:['lost','Lost'],push:['push','Push']}[r.result]:['locked','Locked'];
    const title=isParlay?`${legs.length}-leg parlay`:r.player;
    const sub0=isParlay?legs.map(l=>l.player).join(' + '):legText({side:r.side,line:r.line,market:String(r.market||'').toLowerCase()}),sub=sub0.charAt(0).toUpperCase()+sub0.slice(1);
    const initials=String(r.player||'').split(' ').map(x=>x[0]||'').join('').slice(0,3);
    const avatar=isParlay?`<span class="on-avatar on-parlay">${icon('layers')}</span>`:`<span class="on-avatar"><span>${htmlEscape(initials)}</span><img loading="lazy" decoding="async" src="/api/player-photo?name=${encodeURIComponent(r.player||'')}${(r.sport||r.sport_label)==='NBA'?'&sport=NBA':''}" alt="" onerror="this.remove()"></span>`;
    const tag=status[0]==='locked'?`${icon('lock')} Locked`:status[1];
    const books=[...new Set(legs.map(l=>l.book).filter(Boolean))],edges=legs.map(l=>Number(l.edge)).filter(Number.isFinite);
    const kicker=`<span class="on-kicker">${icon('star')} Official${books.length===1?` · ${htmlEscape(books[0])}`:''}</span>`;
    const why=edges.length?(isParlay?`Every leg beats fair`:`${Math.max(...edges).toFixed(1)}% better than fair`):'';
    const game=String(legs[0]?.team||'').replace(' · @ ',' @ ').replace(' · vs ',' vs '),matchup=isParlay?'':game&&typeof compactGameName==='function'?compactGameName(game):game;
    return `<button type="button" class="on-row on-${status[0]}-row" data-on="${i}" data-on-player="${htmlEscape(isParlay?'':r.player||'')}" data-on-team="${htmlEscape(isParlay?'':legs[0]?.team||'')}" aria-label="Details for ${htmlEscape(title)}">${avatar}<span class="on-who">${kicker}<b>${htmlEscape(title)}</b><span>${htmlEscape(sub)}</span><small>${htmlEscape([matchup,kickoff(r.game_time)].filter(Boolean).join(' · '))}</small>${why?`<i class="on-why">${htmlEscape(why)}</i>`:''}<i class="on-form" data-on-form="${i}" hidden></i><em class="on-live" data-on-live="${i}" hidden></em></span><span class="on-end"><b class="on-price">${htmlEscape(formatOdds(odds))}</b><span class="on-tag on-${status[0]}">${tag}</span></span></button>`;
  }
  // Live progress for locked picks, refreshed with the live board (every 5s in games).
  let officialLiveList=[];
  const liveLeg=(r,l)=>statsProp({...l,player:l.player||r.player,market:l.market||r.market,line:l.line??r.line,side:l.side||r.side,gameTime:l.gameTime||r.game_time});
  const liveUnit=p=>/touchdown|scorer/i.test(p.market||'')?'TD':String(p.market||'').toLowerCase();
  function liveLine(r){
    if(!window.BTGLive?.legStatus||(r.status!=='provisional'&&['won','lost','push'].includes(r.result)))return null;
    const legs=recordLegs(r);if(!legs.length)return null;
    if(r.kind==='parlay'){
      const st=legs.map(l=>({l,s:window.BTGLive.legStatus(liveLeg(r,l))}));const live=st.filter(x=>x.s);if(!live.length)return null;
      const fmt=x=>`${String(x.l.player).split(' ').slice(-1)[0]} ${x.s.value??'–'}`;
      return {cls:live.some(x=>x.s.key==='miss')?'miss':live.every(x=>x.s.key==='hit')?'hit':'',html:`<b>${htmlEscape(live[0].s.clock)}</b> · ${live.map(x=>`<span class="${x.s.key}">${htmlEscape(fmt(x))}</span>`).join(' · ')}`};
    }
    const p=liveLeg(r,legs[0]),s=window.BTGLive.legStatus(p);if(!s)return null;
    const val=s.value===null?(s.loaded?'not tracked live':'loading stats…'):`${s.value} ${liveUnit(p)}`;
    return {cls:s.key,html:`<b>${htmlEscape(s.clock)}</b> · <strong>${htmlEscape(val)}</strong>${s.value!==null?` · ${htmlEscape(s.detail)}`:''}`};
  }
  function updateOfficialLive(){
    $$('#officialNowList [data-on-live]').forEach(el=>{const line=liveLine(officialLiveList[+el.dataset.onLive]||{});el.hidden=!line;if(el.previousElementSibling)el.previousElementSibling.hidden=!!line;el.className=`on-live${line?.cls?' '+line.cls:''}`;el.innerHTML=line?line.html:''});
  }
  (window.btgLiveHooks||=[]).push(updateOfficialLive);
  window.BTGOfficialLive=liveLine;
  function renderOfficialNow(rows){
    const host=$('#officialNow');if(!host||!Array.isArray(rows))return;
    const list=officialNow(rows);
    $('#officialNowCount').textContent=list.length?String(list.length):'';
    $('#officialNowList').innerHTML=list.length?list.map((r,i)=>(officialDone(r)&&i>0&&!officialDone(list[i-1])?'<p class="on-divider">Final</p>':'')+officialRow(r,i)).join(''):'<div class="on-empty"><strong>No picks yet this week.</strong><span>They post the moment a price qualifies, any day before kickoff.</span></div>';
    $$('#officialNowList button[data-on]').forEach(b=>b.onclick=()=>openPick(list[+b.dataset.on]));
    officialLiveList=list;updateOfficialLive();window.btgOfficialForm?.(list);
    $$('#officialNowList [data-on-player]').forEach(row=>{const player=row.dataset.onPlayer;if(!player||typeof playerStatsFor!=='function')return;const r=list[+row.dataset.on];playerStatsFor({sport:r?.sport||'NFL',player,team:row.dataset.onTeam}).then(payload=>window.BTGPaintTeam?.(row,payload?.player?.team,r?.sport||'NFL')).catch(()=>{})});
    host.hidden=false;
  }
  let heroRows=null,heroSeason=null;
  async function loadHero(){
    // The home page HTML usually carries the rows already (window.BTG_HOME),
    // so the banner and hits draw with the page instead of popping in later.
    if(Array.isArray(window.BTG_HOME)){heroRows=window.BTG_HOME;heroSeason=window.BTG_SEASON||null;renderHero(summarise(heroRows,Date.now(),viewerStake()));renderOfficialNow(heroRows);return}
    try{
      const response=await fetch('/api/record?view=home',{signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw new Error();
      const body=await response.json();heroRows=body.success?body.recent||[]:null;heroSeason=body.season||null;renderHero(heroRows?summarise(heroRows,Date.now(),viewerStake()):null);renderOfficialNow(heroRows);
    }catch{renderHero(null)}
  }
  $('#heroCta')&&($('#heroCta').onclick=event=>{event.preventDefault();$('#propsSection')?.scrollIntoView({behavior:'smooth',block:'start'})});
  if(typeof fetch==='function'&&$('#heroBanner'))loadHero();

  // Positive headline when nothing has earned a Bet This Guy yet.
  const kickoffIn=()=>{
    const times=props.map(p=>Date.parse(p.startsAt||'')).filter(t=>Number.isFinite(t)&&t>Date.now()).sort((a,b)=>a-b);
    if(!times.length)return '';
    const mins=Math.round((times[0]-Date.now())/60000),h=Math.floor(mins/60),m=mins%60;
    return mins<60?`Next kickoff in ${mins}m`:h<24?`Next kickoff in ${h}h ${m}m`:`Next kickoff ${new Date(times[0]).toLocaleDateString([],{weekday:'short'})} ${new Date(times[0]).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}`;
  };
  // Verdict first, one tip for the whole board, colour avatars when no photo loads.
  const hue=name=>[...String(name||'')].reduce((h,c)=>(h*31+c.charCodeAt(0))%360,7);
  const cardBeforeFirstImpression=card;
  card=function(p,rank=-1,featured=false){
    let html=cardBeforeFirstImpression(p,rank,featured);
    if(state.view==='movement'||document.body.dataset.desktopPage==='movement')return html;
    html=html.replace('<div class="card-stats-link">Tap the odds to add to slip</div>','').replace('<div class="avatar player-photo">',`<div class="avatar player-photo" style="--avatar-hue:${hue(p.player)}">`);
    const verdict=html.match(/<div class="verdict verdict-[\s\S]*?<\/button><\/div>/);
    if(verdict)html=html.replace(verdict[0],'').replace(/<header class="player prop-player"/,match=>verdict[0].replace('class="verdict ','class="verdict verdict-top ')+match);
    return html;
  };
  const renderBeforeFirstImpression=render;
  render=function(){
    renderBeforeFirstImpression();
    document.body.classList.toggle('no-slip-legs',!(state.slip||[]).length);
    document.body.classList.toggle('hero-off',state.view!=='board');
    if(heroRows&&viewerStake()!==heroStake)renderHero(summarise(heroRows,Date.now(),viewerStake()));
    const title=$('#viewTitle'),count=$('#resultCount');
    if(title&&count&&title.textContent==='No one’s earned a Bet This Guy yet'){
      const updated=count.textContent.split(' · ').pop(),next=kickoffIn();
      title.textContent='Today’s closest calls';
      count.textContent=`Nothing has cleared our bar yet. Official picks post the moment one does.${next?` ${next}.`:''} · ${updated}`;
    }
  };
  let slipCount=(state.slip||[]).length;
  if(typeof renderSlip==='function'){const renderSlipBeforeFirstImpression=renderSlip;renderSlip=function(){renderSlipBeforeFirstImpression.apply(this,arguments);const n=(state.slip||[]).length;if(n>slipCount)window.btgCount?.('slip:add');slipCount=n;document.body.classList.toggle('no-slip-legs',!n)}}
  document.body.classList.toggle('no-slip-legs',!(state.slip||[]).length);
})();

// Compact cards: the face answers "is this a good bet?" in four short rows
// (player + verdict, the bet + price, what $X wins). Everything else opens
// underneath when the card is tapped.
(function(){
  const expanded=new Set();
  // Partner links: empty unless the site has approved partners for this
  // visitor's state (the server decides; see affiliateOffers in the worker).
  let offers=[];
  if(typeof fetch==='function')fetch('/api/affiliate').then(r=>r.ok?r.json():null).then(body=>{if(Array.isArray(body?.offers)&&body.offers.length){offers=body.offers;render()}}).catch(()=>{});
  const offerMarkup=()=>offers.length?`<div class="card-affiliate">${offers.map(o=>`<a href="${htmlEscape(o.url)}" target="_blank" rel="sponsored noopener" data-affiliate="${htmlEscape(o.id)}">Play this on ${htmlEscape(o.name)} →</a>`).join('')}<small>We may earn a commission if you sign up. 21+. Gambling problem? Call 1-800-GAMBLER.</small></div>`:'';
  const shortMoney=v=>`$${v>=10?Math.round(v).toLocaleString('en-US'):v.toFixed(2)}`;
  const moneyLine=p=>{const odds=Number(recommendedOdds(p)),stake=wagerStake(),win=odds>=100?stake*odds/100:odds<=-100?stake*100/Math.abs(odds):null;return win?`${shortMoney(stake)} wins ${shortMoney(win)}`:''};
  const cardBeforeCompact=card;
  card=function(p,rank=-1,featured=false){
    let html=cardBeforeCompact(p,rank,featured);
    if(state.view==='movement'||document.body.dataset.desktopPage==='movement')return html;
    const verdict=propVerdict(p),open=expanded.has(savedPropKey(p));
    html=html.replace(/<span class="top-play-badge">[\s\S]*?<\/span>/,'');
    html=html.replace(/<div class="card-stats-link">[^<]*<\/div>/,'');
    // Lift a whole <div> block out of the card by balancing its div tags.
    const take=opening=>{const start=html.indexOf(opening);if(start<0)return '';let depth=0,i=start;const tag=/<\/?div\b[^>]*>/g;tag.lastIndex=start;for(let m;(m=tag.exec(html));){depth+=m[0][1]==='/'?-1:1;if(!depth){i=tag.lastIndex;break}}const block=html.slice(start,i);html=html.slice(0,start)+html.slice(i);return block};
    const box=take('<div class="verdict verdict-'),evidence=take('<div class="card-evidence">'),why=take('<div class="featured-why">');
    const first=String(p.player||'').split(' ')[0];
    const more=`<div class="card-more"${open?'':' hidden'}>${box}${evidence}<button type="button" class="card-stats-btn" data-open-profile="${p.id}">${htmlEscape(first)}’s stats & recent games ›</button>${offerMarkup()}${why}</div>`;
    const money=verdict?.key==='read'?'The sportsbooks are charging extra here':moneyLine(p);
    const pill=verdict?`<span class="verdict-pill verdict-pill-${verdict.key}">${verdict.svg} ${verdict.label}</span>`:'';
    // Function replacers: "$100" in the text must not be read as a $1 group.
    html=html.replace(/(<section class="mockup-pick">[\s\S]*?<\/section>)/,match=>`${match}<p class="card-money"><span>${htmlEscape(money)}<span data-trend-tag="${p.id}"></span></span>${pill}</p>`)
      .replace(/<\/article>$/,()=>`${more}</article>`)
      .replace('class="prop-card mockup-card',`class="prop-card mockup-card compact-card${verdict?` compact-${verdict.key}`:''}${open?' expanded':''}`);
    return html;
  };
  const bindBeforeCompact=bindCards;
  bindCards=function(){
    bindBeforeCompact();
    $$('.prop-card.compact-card').forEach(el=>{
      const p=props.find(item=>item.id===+el.dataset.id);if(!p)return;
      const key=savedPropKey(p),more=el.querySelector('.card-more'),header=el.querySelector('.prop-player');
      // Tapping a card opens the shared detail sheet (BTGSheet, below).
      const toggle=()=>{el.classList.remove('expanded');if(more)more.hidden=true;expanded.delete(key);window.BTGSheet?.prop(p)};
      if(header){header.onclick=event=>{event.stopPropagation();toggle()};header.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle()}};header.setAttribute('aria-expanded',String(el.classList.contains('expanded')));header.setAttribute('aria-label',`${p.player}: show or hide details`)}
      el.onclick=event=>{if(event.target.closest('button,a,input,select,.mockup-pick,.card-more,[data-board-progress]'))return;toggle()};
      el.querySelector('[data-open-profile]')?.addEventListener('click',event=>{event.stopPropagation();window.btgCount?.('profile:open');openPlayerProfile(p)});
      el.querySelectorAll('[data-affiliate]').forEach(link=>link.addEventListener('click',event=>{event.stopPropagation();window.btgCount?.('affiliate:click')}));
    });
  };
})();

if(typeof fetch==='function')window.btgCountVisit?.('view:home');

// Pick alerts: a browser push notification whenever a new official pick
// posts. iPhones need the site added to the Home Screen first (iOS 16.4+).
(function(){
  const buttons=()=>$$('[data-alerts-toggle]');
  const supported=()=>'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
  const ios=/iPhone|iPad|iPod/.test(navigator.userAgent||'');
  const standalone=()=>window.matchMedia?.('(display-mode: standalone)').matches||navigator.standalone===true;
  const note=text=>{const el=$('#alertsNote');if(!el)return;el.textContent=text;el.hidden=!text};
  const show=on=>buttons().forEach(button=>{document.documentElement.classList.toggle('alerts-on',on);const label=on?'Alerts on':'Get pick alerts';if(button.dataset.alertsBanner!==undefined){button.setAttribute('aria-pressed',String(on));return}if(button.dataset.alertsSheet!==undefined){const strong=button.querySelector('strong');if(strong)strong.textContent=on?'Pick alerts are on':'Pick alerts';const span=button.querySelector('span');if(span)span.textContent=on?'Tap to turn them off':'Get a notification when a new official pick drops'}else button.textContent=label;button.setAttribute('aria-pressed',String(on))});
  const keyBytes=key=>{const b=atob(key.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-key.length%4)%4));return Uint8Array.from(b,c=>c.charCodeAt(0))};
  async function current(){try{const reg=await navigator.serviceWorker.getRegistration('/');return reg?await reg.pushManager.getSubscription():null}catch{return null}}
  async function turnOn(){
    // iPhones only allow web notifications from the Home Screen, so offer
    // email alerts first: one step in a free account.
    if(ios&&!standalone()){window.btgCount?.('alerts:email');const auth=window.BTGAuth;auth?.open?.(auth.hasAccount?.()?'account':'signup');note('On iPhone, email alerts are the easy way: tick “Email me when new picks post” in your free account. Prefer phone notifications? Add Bet This Guy to your Home Screen (Share → Add to Home Screen) and turn on pick alerts there.');return}
    if(!supported()){note('This browser can’t show notifications. Try Chrome, Edge, Firefox or Safari.');return}
    const permission=await Notification.requestPermission();
    if(permission!=='granted'){note('Notifications are blocked for this site. Allow them in your browser settings, then tap Get pick alerts again.');return}
    const reg=await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;
    const {publicKey}=await (await fetch('/api/alerts/key')).json();
    const sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:keyBytes(publicKey)});
    const response=await fetch('/api/alerts/subscribe',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...sub.toJSON(),books:preferences.books||[],follows:(window.BTGFollow?.read().players||[]).map(f=>f.name)})});
    if(!response.ok){await sub.unsubscribe().catch(()=>{});note('Couldn’t turn alerts on right now. Try again in a minute.');return}
    show(true);note(preferences.books?.length?`Alerts are on. We’ll ping you when a new official pick drops, and when ${preferences.books.length===1?preferences.books[0]:'one of your sportsbooks'} has a good-value price.`:'Alerts are on. We’ll ping you when a new official pick drops.');window.btgCount?.('alerts:on');
  }
  // Saving Settings keeps the books stored with this phone's alerts up to date.
  window.BTGSyncAlertBooks=async()=>{try{if(!('serviceWorker' in navigator))return;const reg=await navigator.serviceWorker.getRegistration('/sw.js');const sub=await reg?.pushManager?.getSubscription();if(sub)await fetch('/api/alerts/subscribe',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...sub.toJSON(),books:preferences.books||[],follows:(window.BTGFollow?.read().players||[]).map(f=>f.name)})})}catch{}};
  async function turnOff(sub){
    await fetch('/api/alerts/unsubscribe',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({endpoint:sub.endpoint})}).catch(()=>{});
    await sub.unsubscribe().catch(()=>{});show(false);note('Alerts are off.');window.btgCount?.('alerts:off');
  }
  buttons().forEach(button=>button.addEventListener('click',async()=>{
    if(button.dataset.alertsSheet!==undefined)$('#moreSheet')?.close?.();
    try{const sub=supported()?await current():null;sub?await turnOff(sub):await turnOn()}catch{note('Couldn’t change alerts right now. Try again in a minute.')}
  }));
  if(supported())current().then(sub=>show(Boolean(sub)));
})();

// Share cards: the Share button attaches a 1080×1080 image of the pick. The
// image is drawn when a card opens, because phones only allow sharing files
// straight after a tap.
(function(){
  const logo=new Image();logo.src='/logo.png';
  const ready=new Map();
  const palette={send:{fg:'#5ff0b5',bg:'rgba(31,216,143,.16)',line:'rgba(31,216,143,.6)'},flip:{fg:'#ffd66e',bg:'rgba(255,196,64,.14)',line:'rgba(255,196,64,.5)'},read:{fg:'#ff9d9d',bg:'rgba(255,90,90,.14)',line:'rgba(255,90,90,.5)'}};
  const shareKey=p=>JSON.stringify([p.id,p.side,p.line,recommendedOdds(p),p.bestBook,propVerdict(p)?.key,wagerStake()]);
  const fit=(ctx,text,max,size,weight='700',family="'Space Grotesk', 'DM Sans', sans-serif")=>{let s=size;do{ctx.font=`${weight} ${s}px ${family}`;s-=2}while(ctx.measureText(text).width>max&&s>20);return s};
  function drawPickCard(p){
    const verdict=propVerdict(p)||VERDICTS.flip,c=palette[verdict.key],W=1080,canvas=document.createElement('canvas');canvas.width=W;canvas.height=W;const ctx=canvas.getContext('2d');
    const bg=ctx.createLinearGradient(0,0,W,W);bg.addColorStop(0,'#0b1d3f');bg.addColorStop(1,'#050b1d');ctx.fillStyle=bg;ctx.fillRect(0,0,W,W);
    const glow=ctx.createRadialGradient(W*.15,W*.1,10,W*.15,W*.1,W*.8);glow.addColorStop(0,verdict.key==='send'?'rgba(31,216,143,.28)':'rgba(28,108,255,.3)');glow.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=glow;ctx.fillRect(0,0,W,W);
    if(logo.complete&&logo.naturalWidth)ctx.drawImage(logo,72,64,360,360*logo.naturalHeight/logo.naturalWidth);
    // Verdict badge
    const label=`${verdict.icon}  ${verdict.label.toUpperCase()}`;ctx.font="700 44px 'Space Grotesk', sans-serif";const bw=ctx.measureText(label).width+72;
    ctx.fillStyle=c.bg;ctx.strokeStyle=c.line;ctx.lineWidth=4;ctx.beginPath();ctx.roundRect(72,250,bw,96,48);ctx.fill();ctx.stroke();ctx.fillStyle=c.fg;ctx.textBaseline='middle';ctx.fillText(label,108,300);
    // Player and bet
    ctx.textBaseline='alphabetic';ctx.fillStyle='#ffffff';fit(ctx,p.player,W-144,108);ctx.fillText(p.player,72,478);
    const bet=p.binary?p.market:`${p.side} ${p.line} ${String(p.market||'').toLowerCase()}`;ctx.fillStyle='#cfe0f5';fit(ctx,bet,W-144,64,'600',"'DM Sans', sans-serif");ctx.fillText(bet,72,566);
    // Price box
    ctx.fillStyle='rgba(255,255,255,.06)';ctx.strokeStyle='rgba(255,255,255,.14)';ctx.lineWidth=3;ctx.beginPath();ctx.roundRect(72,620,W-144,190,32);ctx.fill();ctx.stroke();
    ctx.fillStyle='#ffffff';ctx.font="700 96px 'Space Grotesk', sans-serif";const odds=formatOdds(recommendedOdds(p));ctx.fillText(odds,112,742);
    const price=ctx.measureText(odds).width;ctx.fillStyle='#9fb6d6';ctx.font="500 36px 'DM Sans', sans-serif";const book=p.bestBook&&p.bestBook!=='Best available'&&p.bestBook!=='Demo market'?`at ${p.bestBook}`:'best price we found';ctx.fillText(book,136+price,712);
    const odd=Number(recommendedOdds(p)),stake=wagerStake(),win=odd>=100?stake*odd/100:odd<=-100?stake*100/Math.abs(odd):0;ctx.fillStyle=c.fg;ctx.font="700 36px 'DM Sans', sans-serif";ctx.fillText(verdict.key==='read'?'The books are taking extra. Skip it.':`$${stake.toLocaleString('en-US')} wins $${Math.round(win).toLocaleString('en-US')}`,136+price,760);
    // Game and footer
    ctx.fillStyle='#9fb6d6';ctx.font="500 34px 'DM Sans', sans-serif";const game=`${String(p.team||'').replace(' · ',' ')}${p.time?` · ${p.time}`:''}`;fit(ctx,game,W-144,34,'500',"'DM Sans', sans-serif");ctx.fillText(game,72,880);
    ctx.fillStyle='#ffffff';ctx.font="700 38px 'Space Grotesk', sans-serif";ctx.fillText('betthisguy.com',72,990);
    ctx.fillStyle='#7f96b8';ctx.font="500 26px 'DM Sans', sans-serif";ctx.textAlign='right';ctx.fillText('21+ · Odds change. Check before you bet.',W-72,990);ctx.textAlign='left';
    return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(new File([blob],`bet-this-guy-${String(p.player).toLowerCase().replace(/[^a-z0-9]+/g,'-')}.jpg`,{type:'image/jpeg'})):reject(new Error('no image')),'image/jpeg',.9));
  }
  window.BTGShareCard={drawPickCard};
  const prepare=p=>{const key=shareKey(p),have=ready.get(p.id);if(have?.key===key)return;ready.set(p.id,{key,file:null});drawPickCard(p).then(file=>{const entry=ready.get(p.id);if(entry?.key===key)entry.file=file}).catch(()=>{})};
  // Draw the image as soon as a card opens (or on hover/press on desktop).
  document.addEventListener('click',event=>{const card=event.target.closest?.('.prop-card.compact-card');if(!card)return;setTimeout(()=>{if(!card.classList.contains('expanded'))return;const p=props.find(x=>x.id===+card.dataset.id);if(p)prepare(p)},0)},true);
  document.addEventListener('pointerover',event=>{const button=event.target.closest?.('[data-share-prop]');if(!button)return;const p=props.find(x=>x.id===+button.dataset.shareProp);if(p)prepare(p)});
  const shareBefore=shareProp;
  shareProp=async function(p,button){
    const entry=ready.get(p.id),file=entry?.key===shareKey(p)?entry.file:null;
    if(file&&navigator.canShare?.({files:[file]})){
      window.btgCount?.('share');
      try{await navigator.share({files:[file],text:`${shareText(p)} ${location.origin}`});return}catch(error){if(error?.name==='AbortError')return}
    }
    return shareBefore(p,button);
  };
})();

// Free-account gate. The whole board and every card breakdown are open to
// everyone; a free account unlocks the line-movement page and charts. In
// 37 showings in a week, the old board wall got no sign-up clicks, so the
// board now asks for the easier thing instead: turn on pick alerts (no
// account), with the season record as the reason.
(function(){
  const FREE_OTHERS=3,FREE_OPENS=3,FREE_MOVERS=3,OPENS_KEY='btg-free-opens';
  const hasAccount=()=>Boolean(window.BTGAuth?.hasAccount?.());
  const today=()=>new Date().toLocaleDateString('en-CA');
  const readOpens=()=>{try{const saved=JSON.parse(localStorage.getItem(OPENS_KEY)||'null');return saved?.day===today()&&Array.isArray(saved.keys)?saved.keys:[]}catch{return []}};
  // Reopening a card already opened today is free. Without storage, allow.
  const allowOpen=key=>{try{const keys=readOpens();if(keys.includes(key))return true;if(keys.length>=FREE_OPENS)return false;keys.push(key);localStorage.setItem(OPENS_KEY,JSON.stringify({day:today(),keys}));return true}catch{return true}};
  let shownCounted=false;
  const countShown=()=>{if(!shownCounted){shownCounted=true;window.btgCount?.('gate:shown')}};
  const signup=view=>{window.btgCount?.(view==='signup'?'gate:signup':'gate:login');window.BTGAuth?.open?.(view)};
  const bindGate=root=>root.querySelectorAll('[data-gate]').forEach(button=>button.onclick=event=>{event.preventDefault();event.stopPropagation();signup(button.dataset.gate)});
  const buttons=`<div class="gate-actions"><button type="button" class="gate-primary" data-gate="signup">Create a free account</button><button type="button" class="gate-secondary" data-gate="login">Sign in</button></div>`;
  const plural=(n,word)=>`${n} ${word}${n===1?'':'s'}`;
  const movementPage=()=>state.view==='movement'||document.body.dataset.desktopPage==='movement';
  // After the sixth card, one "turn on alerts" card for anyone without alerts
  // (hidden by CSS once alerts are on). It clicks the page's alerts button,
  // which does the permission and iPhone handling.
  const NUDGE_AFTER=6;let nudgeCounted=false;
  const seasonLine=()=>{const s=window.BTG_SEASON;if(!s||s.wins+s.losses<5)return 'Every official pick is locked before kickoff and graded in public, wins and losses.';const m=Math.round(Number(s.profit)||0);return `This season: ${s.wins}–${s.losses}, ${m<0?'−':'+'}$${Math.abs(m).toLocaleString('en-US')} at $100 a pick. Every pick graded in public, wins and losses.`};
  function nudgeList(list){
    list.querySelector('.board-nudge')?.remove();
    if(selectedPlayer||state.view!=='board'||document.documentElement.classList.contains('alerts-on'))return;
    const cards=[...list.querySelectorAll(':scope>.prop-card')];if(cards.length<=NUDGE_AFTER)return;
    const card=document.createElement('div');card.className='board-nudge';
    card.innerHTML=`<p class="gate-eyebrow">${icon('bell')} FREE PICK ALERTS</p><h3>Get the next pick the second it locks</h3><p>${htmlEscape(seasonLine())}</p><div class="gate-actions"><button type="button" class="gate-primary" data-nudge-alerts>Turn on alerts</button>${hasAccount()?'':'<button type="button" class="gate-link" data-gate="signup">or create a free account</button>'}</div>`;
    cards[NUDGE_AFTER-1].after(card);
    // Its own counter, so next week's numbers compare it with the old wall.
    card.querySelector('[data-gate]')?.addEventListener('click',event=>{event.preventDefault();window.btgCount?.('nudge:signup');window.BTGAuth?.open?.('signup')});
    card.querySelector('[data-nudge-alerts]').onclick=()=>{window.btgCount?.('nudge:alerts');(document.querySelector('[data-alerts-banner]')||document.querySelector('[data-alerts-toggle]'))?.click()};
    if(!nudgeCounted){nudgeCounted=true;window.btgCount?.('nudge:shown')}
  }
  function gateList(){
    const list=$('#propList');if(!list)return;
    list.querySelector('.board-gate')?.remove();
    nudgeList(list);
    if(hasAccount()||selectedPlayer)return;
    const moving=movementPage();if(!moving)return;
    const cards=[...list.querySelectorAll(':scope>.prop-card')];let others=0;
    const locked=cards.filter(el=>{if(!moving&&el.classList.contains('compact-send'))return false;others++;return others>(moving?FREE_MOVERS:FREE_OTHERS)});
    if(!locked.length)return;
    const more=list.querySelector('#loadMoreProps'),unrendered=!moving&&more?Math.max(0,(Number(visiblePropTotal)||0)-cards.length):0,hidden=locked.length+unrendered;
    more?.remove();
    // Locked cards move below everything free, so no free card sits under the panel.
    locked.forEach(el=>list.append(el));
    locked.forEach((el,index)=>{el.hidden=index>=2;el.classList.toggle('gate-blur',index<2);el.setAttribute('aria-hidden','true');el.inert=true});
    const panel=document.createElement('div');panel.className='board-gate';
    panel.innerHTML=`<p class="gate-eyebrow">${icon('lock')} FREE ACCOUNT</p><h3>${plural(hidden,moving?'more line move':'more rated prop')} on this board</h3><p>${moving?'See every line and price move with the full history chart.':'See every prop we rated, including Fair price and Overpriced ratings, with the reasons behind each.'} Free, no card needed.</p>${buttons}`;
    (locked[1]||locked[0]).after(panel);bindGate(panel);countShown();
  }
  const renderBeforeGate=render;
  render=function(){renderBeforeGate();gateList()};
  const bindBeforeGate=bindCards;
  bindCards=function(){
    bindBeforeGate();
    $$('.prop-card.compact-card').forEach(el=>{
      const p=props.find(item=>item.id===+el.dataset.id);if(!p)return;
      const key=savedPropKey(p),header=el.querySelector('.prop-player');
      const guard=handler=>handler&&function(event){
        if(event.target.closest?.('button,a,input,select,.mockup-pick,.card-more,[data-board-progress]')&&this===el)return handler.call(this,event);
        if(hasAccount()||!movementPage()||el.classList.contains('expanded')||allowOpen(key)){el.querySelector('.card-gate')?.remove();return handler.call(this,event)}
        event.stopPropagation();
        if(el.querySelector('.card-gate'))return el.querySelector('.card-gate').remove();
        const note=document.createElement('div');note.className='card-gate';
        note.innerHTML=`<p><strong>You’ve used today’s ${FREE_OPENS} free breakdowns.</strong> Create a free account to open every card, any time.</p>${buttons}`;
        el.append(note);bindGate(note);countShown();
      };
      if(header)header.onclick=guard(header.onclick);
      el.onclick=guard(el.onclick);
    });
  };
  const movementDetailBeforeGate=openMovementDetail;
  openMovementDetail=function(id){
    if(hasAccount())return movementDetailBeforeGate(id);
    const dialog=$('#movementDialog'),host=$('#movementDetail');if(!dialog||!host)return;
    host.innerHTML=`<div class="board-gate board-gate-dialog"><p class="gate-eyebrow">${icon('lock')} FREE ACCOUNT</p><h3>See the full line history</h3><p>Every price and line change we recorded for this bet, charted from open to kickoff. Free, no card needed.</p>${buttons}</div>`;
    bindGate(host);countShown();
    host.querySelectorAll('[data-gate]').forEach(button=>button.addEventListener('click',()=>dialog.close?.()));
    if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');
  };
  addEventListener('btg-auth',()=>render());
})();

// One detail sheet for everything a visitor taps: board props, this week's
// official picks, past picks and parlays. Same layout every time: status chip,
// the bet, price and payout, at most three facts, a price chart (free account)
// and one main action.
(function(){
  const hasAccount=()=>Boolean(window.BTGAuth?.hasAccount?.());
  const esc=htmlEscape;
  const oddsDecimal=o=>{o=Number(o);return o>=100?1+o/100:o<=-100?1+100/Math.abs(o):null};
  function chart(c){
    if(!c)return '';
    if(!hasAccount())return `<div class="bs-gate"><span>${icon('lock')} Price history</span><button type="button" data-bs-gate="signup">Free account</button></div>`;
    if(c.open)return `<button type="button" class="bs-history" data-bs-history>${esc(c.label)} <span>›</span></button>`;
    const ds=c.points.map(o=>oddsDecimal(o)).filter(Boolean);if(ds.length<2)return '';
    const W=300,H=46,lo=Math.min(...ds),hi=Math.max(...ds),span=(hi-lo)||1,xy=ds.map((v,i)=>[6+i*(W-12)/(ds.length-1),6+(H-12)*(1-(v-lo)/span)]);
    return `<div class="bs-chart"><div><span>${esc(c.label)}</span><span>${esc(formatOdds(c.points[0]))} → ${esc(formatOdds(c.points.at(-1)))}</span></div><svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="${esc(c.label)}"><polyline points="${xy.map(p=>p.map(v=>v.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="${xy.at(-1)[0].toFixed(1)}" cy="${xy.at(-1)[1].toFixed(1)}" r="3.5" fill="currentColor"/></svg></div>`;
  }
  function renderSheet(m){
    const legs=m.legs?`<div class="bs-legs">${m.legs.map((l,i)=>`<${l.onClick?'button type="button"':'div'} class="bs-leg" data-bs-leg="${i}"><span><b>${esc(l.title)}</b><small>${esc(l.text)}</small></span><span class="bs-leg-end">${l.result?`<em class="bs-res ${l.result==='won'?'pos':l.result==='lost'?'neg':''}">${l.result==='won'?'Hit':esc(l.result)}</em>`:''}<b>${esc(l.odds)}</b>${l.onClick?'<i>›</i>':''}</span></${l.onClick?'button':'div'}>`).join('')}</div>`:'';
    const rows=m.rows?.length?`<div class="bs-rows">${m.rows.map(([a,b,c],i)=>`<div><span>${esc(a)}</span><b class="${c||''}" data-bs-row="${i}">${esc(b)}</b></div>`).join('')}</div>`:'';
    const acts=m.actions?.length?`<div class="bs-acts">${m.actions.map((a,i)=>`<button type="button" class="bs-btn ${a.primary?'p':''} ${a.wide||a.primary?'wide':''}" data-bs-act="${i}" ${a.label?'':`aria-label="${esc(a.aria||'')}"`}>${a.icon?icon(a.icon):''}${a.label?esc(a.label):''}</button>`).join('')}</div>`:'';
    return `<div class="bsheet"><span class="bs-chip bs-${m.chip.cls}">${m.chip.icon?icon(m.chip.icon):''}${esc(m.chip.text)}</span><h2>${esc(m.title)}</h2>${m.bet?`<p class="bs-bet">${esc(m.bet)}</p>`:''}${m.game?`<p class="bs-game">${esc(m.game)}</p>`:''}
      <div class="bs-money"><div><small>Price</small><b>${esc(m.price)}</b></div><div><small>${esc(m.moneyLabel||`${m.stake} bet`)}</small><b class="${m.moneyCls||''}">${esc(m.money)}</b></div></div>${legs}${rows}${chart(m.chart)}${acts}${(m.links||(m.link?[m.link]:[])).map((l,i)=>`<a class="bs-link" ${l.href?`href="${esc(l.href)}"`:`href="#" data-bs-link="${i}"`}>${esc(l.text)}</a>`).join('')}</div>`;
  }
  function bind(host,m,dialog){
    host.querySelectorAll('[data-bs-gate]').forEach(b=>b.onclick=()=>{dialog?.close?.();window.btgCount?.('gate:signup');window.BTGAuth?.open?.('signup')});
    host.querySelector('[data-bs-history]')?.addEventListener('click',()=>{dialog?.close?.();m.chart.open()});
    host.querySelectorAll('[data-bs-act]').forEach(b=>b.onclick=async()=>{const a=m.actions[+b.dataset.bsAct];
      if(a.share){try{if(navigator.share)await navigator.share({text:a.share});else{await navigator.clipboard.writeText(a.share);b.textContent='Copied ✓'}}catch{}return}
      a.onClick?.(b,dialog)});
    host.querySelectorAll('[data-bs-leg]').forEach(b=>{const l=m.legs?.[+b.dataset.bsLeg];if(l?.onClick)b.onclick=()=>l.onClick(dialog)});
    host.querySelectorAll('[data-bs-link]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();dialog?.close?.();(m.links||[m.link])[+a.dataset.bsLink]?.onClick?.()}));
  }
  function open(m,dialogSel='#hitDialog',bodySel='#hitDialogBody'){
    const dialog=$(dialogSel),host=$(bodySel);if(!dialog||!host)return;
    host.innerHTML=renderSheet(m);bind(host,m,dialog);m.after?.(host);
    if(!dialog.open){if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','')}
    // Don't land focus on the close button (it shows a ring); keep keyboard users inside the sheet.
    try{if(!dialog.hasAttribute('tabindex'))dialog.setAttribute('tabindex','-1');dialog.focus({preventScroll:true})}catch{}
  }
  window.BTGSheet={render:renderSheet,open};

  // Board props.
  const stakeNow=()=>Math.max(1,Number(preferences.typicalWager)||100);
  const winsOn=odds=>{const d=oddsDecimal(odds);return d?`wins $${Math.round(stakeNow()*(d-1)).toLocaleString('en-US')}`:'—'};
  function propModel(p){
    const v=propVerdict(p),odds=recommendedOdds(p),edge=Number(p.rawEdge),selection=p.binary?(p.side==='Over'?(p.overLabel||'Yes'):(p.underLabel||'No')):`${p.side} ${p.line}`;
    const chip=v?{send:{cls:'g',icon:'check',text:'Good value'},flip:{cls:'n',icon:'fair',text:'Fair price'},read:{cls:'r',icon:'over',text:'Overpriced'}}[v.key]:{cls:'n',icon:'',text:p.market};
    const inSlip=()=>state.slip.some(x=>x.key===slipSelectionKey(p,p.side)),saved=()=>state.saved.has(savedPropKey(p));
    const rows=[['Best price',p.bestBook||'Best available','']];
    if(Number.isFinite(edge))rows.push(['vs fair price',`${edge>=0?'+':'−'}${Math.abs(edge).toFixed(1)}% ${edge>=0?'better':'worse'}`,edge>=1?'pos':edge<=-3.5?'neg':'']);
    rows.push(['Last 10 games','Loading…','']);
    if(p.bestLine){const b=p.bestLine;rows.push(['Best line',`${b.side} ${b.line} at ${b.book} (${formatOdds(b.odds)}) · ${b.gain}${b.unit} ${b.side==='Over'?'lower':'higher'}, +${b.edge}% vs fair`,'pos'])}
    return {chip,title:p.player,bet:`${selection} ${String(p.market||'').toLowerCase()}`.trim(),game:[String(p.team||'').replace(' · vs ',' vs ').replace(' · @ ',' @ '),p.time].filter(Boolean).join(' · '),
      price:formatOdds(odds),stake:`$${stakeNow().toLocaleString('en-US')}`,money:winsOn(odds),moneyCls:'pos',rows,
      chart:{label:'Price history',open:()=>openMovementDetail(p.id)},
      actions:[{label:inSlip()?'✓ In your slip':'＋ Add to slip',primary:true,onClick:b=>{toggleLeg(p,p.side);b.textContent=inSlip()?'✓ In your slip':'＋ Add to slip'}},
        {icon:'star',aria:'Save',onClick:b=>{saved()?state.saved.delete(savedPropKey(p)):state.saved.add(savedPropKey(p));localStorage.setItem('propedge-saved',JSON.stringify([...state.saved]));window.BTGAuth?.syncSavedProps([...state.saved],props).catch(()=>{});b.classList.toggle('on',saved());render()}},
        {icon:'share',aria:'Share',onClick:b=>shareProp(p,b)}],
      link:{text:`${shortPlayerName(p.player)}’s stats & game log ›`,onClick:()=>{window.btgCount?.('profile:open');openPlayerProfile(p)}},
      after:host=>{host.querySelector('[data-bs-act="1"]')?.classList.toggle('on',saved());lastTen(p).then(text=>{const cell=host.querySelector('[data-bs-row="2"]');if(!cell)return;if(text)cell.textContent=text;else cell.closest('div')?.remove()})}};
  }
  async function lastTen(p){
    try{const payload=await playerStatsFor(p),recent=(payload.stats||[]).map(row=>({date:statDate(row),metric:propMetric(p,row)})).filter(item=>item.metric.value!==null).sort((a,b)=>(b.date?.getTime()||0)-(a.date?.getTime()||0)).slice(0,10);
      if(recent.length<3)return '';const hits=recent.filter(item=>hitAgainstLine(p,item.metric.value)===true).length;return `${p.side==='Under'?'Under':'Over'} in ${hits} of ${recent.length}`}catch{return ''}
  }
  window.BTGSheet.prop=p=>{window.btgCount?.('card:open');open(propModel(p))};

  // Parlays use the same sheet, one row per leg.
  openParlayDetail=function(r){
    if(!r)return;
    const generated=r.sectionIndex===undefined||r.sectionIndex===null,cfg=generated?{tag:'CUSTOM BUILD',name:'Generated Parlay'}:parlaySections[r.sectionIndex],payout=Number.isFinite(r.payout)?r.payout:r.dec*wagerStake();
    const games=new Set(r.legs.map(p=>p.eventID||p.team)).size;
    open({chip:{cls:'n',icon:'layers',text:`${r.legs.length}-leg parlay`},title:cfg.name,bet:'',game:`${games} game${games===1?'':'s'} · ${r.legs.length} legs`,price:formatOddsPretty(r.american),moneyLabel:`${wagerLabel()} pays`,money:formatMoney(payout),moneyCls:'pos',
      legs:r.legs.map(p=>({title:p.player,text:`${p.side} ${p.line} ${String(p.market||'').toLowerCase()}`,odds:formatOdds(recommendedOdds(p)),onClick:()=>openParlayLegPlayer(p,r)})),
      actions:[{label:'Add this parlay to slip',primary:true,onClick:(b,dialog)=>{dialog?.close?.();loadSuggestedParlay(r)}}]},'#parlayDetailDialog','#parlayDetailContent');
  };
})();

// Player stats screen. One renderer replaces the earlier layered versions.
// Field names follow the BALLDONTLIE NFL stats model; stat groups follow the
// player's position so defenders, kickers and punters see their own numbers.
(()=>{
  const esc=htmlEscape,num=v=>BTGStats.number(v),get=(row,k)=>num(row?.[k]);
  const sumOf=(row,keys)=>{const vals=keys.map(k=>get(row,k));return vals.some(v=>v!==null)?vals.reduce((a,v)=>a+(v||0),0):null};
  const pct=(a,b)=>b?Math.round(1000*a/b)/10:null;
  // kind: sum (season total), max (season best), avg (game average), or a
  // ratio built from two season totals.
  const S={
    cmp:{label:'Comp',name:'Completions',k:'passing_completions'},att:{label:'Att',name:'Attempts',k:'passing_attempts'},
    cmpPct:{label:'Comp %',name:'Completion %',ratio:['cmp','att',100],suffix:'%'},
    passYds:{label:'Pass Yds',name:'Passing yards',k:'passing_yards'},ypa:{label:'Y/A',name:'Yards per attempt',ratio:['passYds','att']},
    passTd:{label:'Pass TD',name:'Passing TD',k:'passing_touchdowns'},int:{label:'INT',name:'Interceptions thrown',k:'passing_interceptions'},
    sacked:{label:'Sacked',name:'Times sacked',k:'sacks'},rating:{label:'Rating',name:'Passer rating',k:'qb_rating',kind:'avg'},
    car:{label:'Car',name:'Carries',k:'rushing_attempts'},rushYds:{label:'Rush Yds',name:'Rushing yards',k:'rushing_yards'},
    ypc:{label:'Y/C',name:'Yards per carry',ratio:['rushYds','car']},rushTd:{label:'Rush TD',name:'Rushing TD',k:'rushing_touchdowns'},
    rushLong:{label:'Long',name:'Longest rush',k:'long_rushing',kind:'max'},
    tgt:{label:'Tgt',name:'Targets',k:'receiving_targets'},rec:{label:'Rec',name:'Receptions',k:'receptions'},
    recYds:{label:'Rec Yds',name:'Receiving yards',k:'receiving_yards'},ypr:{label:'Y/R',name:'Yards per catch',ratio:['recYds','rec']},
    recTd:{label:'Rec TD',name:'Receiving TD',k:'receiving_touchdowns'},recLong:{label:'Long',name:'Longest catch',k:'long_reception',kind:'max'},
    catchPct:{label:'Catch %',name:'Catch rate',ratio:['rec','tgt',100],suffix:'%'},
    fum:{label:'Fum',name:'Fumbles',k:'fumbles'},fumLost:{label:'Lost',name:'Fumbles lost',k:'fumbles_lost'},
    tkl:{label:'Tkl',name:'Total tackles',k:'total_tackles'},solo:{label:'Solo',name:'Solo tackles',k:'solo_tackles'},
    ast:{label:'Ast',name:'Assisted tackles',get:row=>{const t=get(row,'total_tackles'),s=get(row,'solo_tackles');return t!==null&&s!==null&&t>=s?t-s:null}},
    tfl:{label:'TFL',name:'Tackles for loss',k:'tackles_for_loss'},sck:{label:'Sacks',name:'Sacks',k:'defensive_sacks'},
    qbHits:{label:'QB Hits',name:'QB hits',k:'qb_hits'},defInt:{label:'INT',name:'Interceptions',k:'defensive_interceptions'},
    pd:{label:'PD',name:'Passes defended',k:'passes_defended'},fumRec:{label:'FR',name:'Fumble recoveries',k:'fumbles_recovered'},
    defTd:{label:'Def TD',name:'Defensive TD',get:row=>sumOf(row,['interception_touchdowns','fumbles_touchdowns'])},
    fgm:{label:'FGM',name:'Field goals made',k:'field_goals_made'},fga:{label:'FGA',name:'Field goal attempts',k:'field_goal_attempts'},
    fgPct:{label:'FG %',name:'Field goal %',ratio:['fgm','fga',100],suffix:'%'},fgLong:{label:'Long',name:'Longest field goal',k:'long_field_goal_made',kind:'max'},
    xp:{label:'XP',name:'Extra points made',k:'extra_points_made'},kPts:{label:'Pts',name:'Kicking points',k:'total_points'},
    punts:{label:'Punts',name:'Punts',k:'punts'},puntYds:{label:'Yds',name:'Punt yards',k:'punt_yards'},
    puntAvg:{label:'Avg',name:'Yards per punt',ratio:['puntYds','punts']},in20:{label:'In 20',name:'Inside the 20',k:'punts_inside_20'},
    tb:{label:'TB',name:'Touchbacks',k:'touchbacks'},puntLong:{label:'Long',name:'Longest punt',k:'long_punt',kind:'max'},
    kr:{label:'KR',name:'Kick returns',k:'kick_returns'},krYds:{label:'KR Yds',name:'Kick return yards',k:'kick_return_yards'},
    pr:{label:'PR',name:'Punt returns',k:'punt_returns'},prYds:{label:'PR Yds',name:'Punt return yards',k:'punt_return_yards'},
    retTd:{label:'Ret TD',name:'Return TD',get:row=>sumOf(row,['kick_return_touchdowns','punt_return_touchdowns'])},
    td:{label:'TD',name:'Total TD',get:row=>sumOf(row,['rushing_touchdowns','receiving_touchdowns','kick_return_touchdowns','punt_return_touchdowns','interception_touchdowns','fumbles_touchdowns'])},
    // NBA (BALLDONTLIE NBA box score). Minutes arrive as "34" or "34:12".
    pts:{label:'PTS',name:'Points',k:'pts'},reb:{label:'REB',name:'Rebounds',k:'reb'},nAst:{label:'AST',name:'Assists',k:'ast'},
    fg3m:{label:'3PM',name:'3-pointers made',k:'fg3m'},fg3a:{label:'3PA',name:'3-point attempts',k:'fg3a'},fg3Pct:{label:'3P %',name:'3-point %',ratio:['fg3m','fg3a',100],suffix:'%'},
    nFgm:{label:'FGM',name:'Field goals made',k:'fgm'},nFga:{label:'FGA',name:'Field goal attempts',k:'fga'},nFgPct:{label:'FG %',name:'Field goal %',ratio:['nFgm','nFga',100],suffix:'%'},
    ftm:{label:'FTM',name:'Free throws made',k:'ftm'},fta:{label:'FTA',name:'Free throw attempts',k:'fta'},ftPct:{label:'FT %',name:'Free throw %',ratio:['ftm','fta',100],suffix:'%'},
    oreb:{label:'OREB',name:'Offensive rebounds',k:'oreb'},dreb:{label:'DREB',name:'Defensive rebounds',k:'dreb'},
    stl:{label:'STL',name:'Steals',k:'stl'},blk:{label:'BLK',name:'Blocks',k:'blk'},tov:{label:'TOV',name:'Turnovers',k:'turnover'},
    min:{label:'MIN',name:'Minutes',kind:'avg',get:row=>{const m=String(row?.min??'').match(/^(\d+)(?::(\d+))?$/);return m?Math.round(10*(+m[1]+(+m[2]||0)/60))/10:null}},
    pra:{label:'PRA',name:'Points + rebounds + assists',get:row=>{const v=['pts','reb','ast'].map(k=>get(row,k));return v.every(x=>x!==null)?v[0]+v[1]+v[2]:null}},
  };
  const statValue=(key,row)=>{const s=S[key];return s.get?s.get(row):get(row,s.k)};
  const GROUPS={
    passing:{title:'Passing',stats:['cmp','att','cmpPct','passYds','ypa','passTd','int','sacked','rating']},
    rushing:{title:'Rushing',stats:['car','rushYds','ypc','rushTd','rushLong']},
    receiving:{title:'Receiving',stats:['tgt','rec','recYds','ypr','recTd','recLong','catchPct']},
    defense:{title:'Defense',stats:['tkl','solo','ast','tfl','sck','qbHits','defInt','pd','fumRec','defTd']},
    kicking:{title:'Kicking',stats:['fgm','fga','fgPct','fgLong','xp','kPts']},
    punting:{title:'Punting',stats:['punts','puntYds','puntAvg','in20','tb','puntLong']},
    returns:{title:'Returns',stats:['kr','krYds','pr','prYds','retTd']},
    ballSecurity:{title:'Ball security',stats:['fum','fumLost']},
    nbaScoring:{title:'Scoring',stats:['pts','nFgm','nFga','nFgPct','fg3m','fg3a','fg3Pct','ftm','fta','ftPct']},
    nbaOther:{title:'Rebounds, assists & more',stats:['reb','oreb','dreb','nAst','stl','blk','tov','min']},
  };
  const ROLES={
    QB:{name:'Quarterback',groups:['passing','rushing','ballSecurity'],tiles:['passYds','passTd','int','cmpPct'],log:['cmpAtt','passYds','passTd','int','rating','rushYds']},
    RB:{name:'Running back',groups:['rushing','receiving','returns','ballSecurity'],tiles:['rushYds','ypc','rec','td'],log:['car','rushYds','rushTd','rec','recYds','recTd']},
    WR:{name:'Wide receiver',groups:['receiving','rushing','returns','ballSecurity'],tiles:['rec','recYds','tgt','recTd'],log:['tgt','rec','recYds','recTd','recLong']},
    TE:{name:'Tight end',groups:['receiving','rushing','ballSecurity'],tiles:['rec','recYds','tgt','recTd'],log:['tgt','rec','recYds','recTd','recLong']},
    DEF:{name:'Defense',groups:['defense','returns'],tiles:['tkl','sck','defInt','pd'],log:['tkl','solo','tfl','sck','qbHits','defInt','pd']},
    K:{name:'Kicker',groups:['kicking'],tiles:['fgPct','fgm','fgLong','kPts'],log:['fgMA','fgLong','xp','kPts']},
    P:{name:'Punter',groups:['punting'],tiles:['puntAvg','punts','in20','puntLong'],log:['punts','puntYds','in20','puntLong']},
    NBA:{name:'',groups:['nbaScoring','nbaOther'],tiles:['pts','reb','nAst','fg3m'],log:['min','pts','reb','nAst','fg3m','pra']},
  };
  // Combined columns used only in the game log.
  const LOGCOL={cmpAtt:{label:'C/Att',cell:row=>{const c=get(row,'passing_completions'),a=get(row,'passing_attempts');return c===null&&a===null?null:`${c??0}/${a??0}`}},fgMA:{label:'FG',cell:row=>{const m=get(row,'field_goals_made'),a=get(row,'field_goal_attempts');return m===null&&a===null?null:`${m??0}/${a??0}`}}};
  function roleOf(player,rows,p){
    if(String(p?.sport||'').toUpperCase()==='NBA'||rows.some(x=>get(x.row,'pts')!==null&&get(x.row,'reb')!==null))return 'NBA';
    const ab=String(player?.position_abbreviation||'').toUpperCase(),full=String(player?.position||'').toUpperCase();
    if(ab==='QB'||/QUARTERBACK/.test(full))return 'QB';
    if(['RB','HB','FB'].includes(ab)||/RUNNING BACK|FULLBACK/.test(full))return 'RB';
    if(ab==='WR'||/WIDE RECEIVER/.test(full))return 'WR';
    if(ab==='TE'||/TIGHT END/.test(full))return 'TE';
    if(['K','PK'].includes(ab)||/KICKER/.test(full)&&!/PUNT/.test(full))return 'K';
    if(ab==='P'||/PUNTER/.test(full))return 'P';
    if(['DE','DT','NT','DL','EDGE','LB','ILB','OLB','MLB','CB','S','FS','SS','DB','SAF'].includes(ab)||/LINEBACKER|CORNER|SAFETY|DEFENSIVE|NOSE TACKLE/.test(full))return 'DEF';
    // Unknown position: use whichever box score the player actually fills.
    const volume={QB:'passing_attempts',RB:'rushing_attempts',WR:'receiving_targets',DEF:'total_tackles',K:'field_goal_attempts',P:'punts'};
    const totals=Object.entries(volume).map(([r,k])=>[r,rows.reduce((a,x)=>a+(get(x.row,k)||0),0)]).sort((a,b)=>b[1]-a[1]);
    return totals[0][1]>0?totals[0][0]:'WR';
  }
  function seasonTotals(rows,key){
    const s=S[key];
    if(s.ratio){const [a,b,m]=s.ratio,ta=seasonTotals(rows,a).total,tb=seasonTotals(rows,b).total;return {total:ta!==null&&tb?Math.round(10*(m||1)*ta/tb)/10:null,ratio:true}}
    const vals=rows.map(x=>statValue(key,x.row)).filter(v=>v!==null);
    if(!vals.length)return {total:null,perGame:null};
    if(s.kind==='max')return {total:Math.max(...vals),perGame:null};
    if(s.kind==='avg'){const a=vals.reduce((x,y)=>x+y,0)/vals.length;return {total:Math.round(a*10)/10,perGame:null,avg:true}}
    const total=vals.reduce((x,y)=>x+y,0);return {total,perGame:Math.round(10*total/rows.length)/10};
  }
  const fmt=(v,suffix='')=>v===null||v===undefined?'—':`${Number.isInteger(v)?v:(+v).toFixed(1)}${suffix}`;
  function teamOf(row,player){return row?.team||player?.team||null}
  function gameInfo(row,player){
    const g=row?.game||{},own=teamOf(row,player),home=g.home_team,away=g.visitor_team;
    const isHome=own&&home&&(own.id!==undefined&&home.id!==undefined?own.id===home.id:matchupTeamsEqual(own,home));
    const opp=isHome?away:home,mine=isHome?num(g.home_team_score):num(g.visitor_team_score),theirs=isHome?num(g.visitor_team_score):num(g.home_team_score);
    const result=mine===null||theirs===null?'':mine>theirs?'W':mine<theirs?'L':'T';
    return {opp:opp?.abbreviation||compactTeamName(opp?.full_name||opp?.name||''),oppName:opp?.full_name||opp?.name||'',at:isHome?'vs':'@',result,score:result?`${mine}–${theirs}`:'',week:num(g.week),post:!!g.postseason,season:num(g.season)};
  }
  // The bet's own number for one game. Touchdown markets fall back to the
  // total-touchdown sum because the feed has no single scorer field.
  function betMetric(p,row){
    const m=propMetric(p,row);if(m.value!==null)return m.value;
    if(/touchdown|scorer/i.test(p.market||''))return statValue('td',row);
    return null;
  }
  const betName=p=>p.binary||/anytime|scorer/i.test(p.market||'')?'Scores a touchdown':`${p.side} ${p.line} ${String(p.market||'').toLowerCase()}`;
  const betLine=p=>p.binary||/anytime|scorer/i.test(p.market||'')?.5:num(p.line);
  const shortDate=d=>d?d.toLocaleDateString([],{month:'short',day:'numeric'}):'';
  function chart(p,games){
    const line=betLine(p),list=games.slice(0,10).reverse();if(!list.length||line===null)return '';
    const top=Math.max(line,...list.map(x=>x.v))*1.18||1,h=v=>Math.max(3,Math.round(100*v/top));
    return `<div class="pp-chart" role="img" aria-label="Last ${list.length} games against the line of ${line}"><i class="pp-line" style="bottom:${h(line)}%"></i>${list.map(x=>`<div class="pp-bar ${x.hit===true?'hit':x.hit===false?'miss':'push'}"><span style="height:${h(x.v)}%"><em>${fmt(x.v)}</em></span><small>${esc(x.info.opp)}</small></div>`).join('')}</div>`;
  }
  function betBlock(p,rows,player){
    const graded=rows.map(x=>({...x,v:betMetric(p,x.row),info:gameInfo(x.row,player)})).filter(x=>x.v!==null).map(x=>({...x,hit:hitAgainstLine({...p,line:betLine(p)},x.v)}));
    if(!graded.length)return `<section class="pp-card"><h3 class="pp-h">This bet</h3><p class="pp-bet">${esc(betName(p))}</p><p class="pp-note">The stats feed doesn’t report this market, so there’s no game-by-game history for it.</p></section>`;
    const l10=graded.slice(0,10),l5=graded.slice(0,5),hits=l=>l.filter(x=>x.hit===true).length,avg=l=>fmt(Math.round(10*l.reduce((a,x)=>a+x.v,0)/l.length)/10);
    const cur=graded[0].info.season,season=graded.filter(x=>x.info.season===cur),opp=profileOpponentName(p,player),vs=opp?graded.filter(x=>matchupOpponentMatches(x.row,p,player)):[];
    let odds='';try{odds=formatOdds(recommendedOdds(p))}catch{}
    return `<section class="pp-card"><div class="pp-bethead"><div><h3 class="pp-h">This bet</h3><p class="pp-bet">${esc(betName(p))}</p></div>${odds?`<b class="pp-odds">${esc(odds)}</b>`:''}</div>
      ${chart(p,l10)}<p class="pp-legend"><i></i> Line ${betLine(p)} <span class="hit"></span> Cleared <span class="miss"></span> Missed</p>
      <div class="pp-kpis"><div><span>Last 10</span><strong>${hits(l10)}/${l10.length}</strong></div><div><span>Last 5</span><strong>${hits(l5)}/${l5.length}</strong></div><div><span>L10 avg</span><strong>${avg(l10)}</strong></div><div><span>${cur&&!nbaView?cur:'Season'} avg</span><strong>${avg(season)}</strong></div></div>
      ${vs.length?`<div class="pp-vs"><p>Last ${Math.min(vs.length,5)} vs ${esc(opp)} <b>${hits(vs.slice(0,5))} of ${Math.min(vs.length,5)} cleared</b></p><div>${vs.slice(0,5).map(x=>`<span class="${x.hit===true?'hit':x.hit===false?'miss':''}"><b>${fmt(x.v)}</b>${esc(nbaView?shortDate(x.date):String(x.info.season||''))}</span>`).join('')}</div></div>`:''}
    </section>`;
  }
  function seasonBlock(role,rows,season,seasons){
    const list=rows.filter(x=>gameInfo(x.row).season===season),reg=list.filter(x=>!x.row?.game?.postseason).length,post=list.length-reg;
    const r=ROLES[role],groups=r.groups.filter((g,i)=>i===0||GROUPS[g].stats.some(k=>{const t=seasonTotals(list,k).total;return t!==null&&t!==0}));
    const tile=k=>{const t=seasonTotals(list,k),s=S[k];return `<div><strong>${fmt(t.total,s.suffix)}</strong><span>${esc(s.name)}</span>${t.perGame!==null&&t.perGame!==undefined&&!t.ratio&&!t.avg?`<small>${fmt(t.perGame)} per game</small>`:''}</div>`};
    const table=g=>`<table class="pp-table"><caption>${GROUPS[g].title}</caption><thead><tr><th scope="col">Stat</th><th scope="col">Total</th><th scope="col">Per game</th></tr></thead><tbody>${GROUPS[g].stats.map(k=>{const t=seasonTotals(list,k),s=S[k];if(t.total===null)return '';return `<tr><th scope="row">${esc(s.name)}</th><td>${fmt(t.total,s.suffix)}</td><td>${t.perGame===null||t.perGame===undefined?'—':fmt(t.perGame)}</td></tr>`}).join('')}</tbody></table>`;
    return `<section class="pp-card"><div class="pp-seasonhead"><h3 class="pp-h">Season stats</h3><div class="pp-seg" role="group" aria-label="Season">${seasons.map(y=>`<button type="button" data-pp-season="${y}" aria-pressed="${y===season}">${seasonText(y)}</button>`).join('')}</div></div>
      <p class="pp-note">${list.length} game${list.length===1?'':'s'}${post?` (${reg} regular season, ${post} playoff)`:''}</p>
      ${list.length?`<div class="pp-tiles">${r.tiles.map(tile).join('')}</div>${groups.map(table).join('')}`:'<p class="pp-note">No games this season yet.</p>'}</section>`;
  }
  function logBlock(p,role,rows,player,showAll){
    const cols=ROLES[role].log.map(k=>LOGCOL[k]||{label:S[k].label,cell:row=>{const v=statValue(k,row);return v===null?null:fmt(v)}});
    const seasons=[...new Set(rows.map(x=>gameInfo(x.row,player).season))],shown=showAll?seasons:seasons.slice(0,2);
    const line=betLine(p),betHead=p.binary||/anytime|scorer/i.test(p.market||'')?'Any TD':`${p.side==='Under'?'U':'O'} ${line}`;
    const body=shown.map(season=>`<tr class="pp-season"><th colspan="${cols.length+3}" scope="colgroup">${seasonText(season)} season</th></tr>`+rows.filter(x=>gameInfo(x.row,player).season===season).map(x=>{const i=gameInfo(x.row,player),v=betMetric(p,x.row),hit=v===null?null:hitAgainstLine({...p,line},v);
      return `<tr><th scope="row">${i.week===null&&!i.post?`<b>${esc(shortDate(x.date))}</b>`:`<b>${i.post?'Playoffs':`Wk ${i.week??'—'}`}</b><small>${esc(shortDate(x.date))}</small>`}</th><td class="pp-opp">${i.at} ${esc(i.opp)}<small class="${i.result==='W'?'w':i.result==='L'?'l':''}">${i.result} ${i.score}</small></td><td class="pp-betcol ${hit===true?'hit':hit===false?'miss':''}">${v===null?'—':fmt(v)}</td>${cols.map(c=>`<td>${c.cell(x.row)??'—'}</td>`).join('')}</tr>`}).join('')).join('');
    return `<section class="pp-card pp-logcard"><div class="pp-scroll" tabindex="0" role="region" aria-label="Game log, scrolls sideways"><table class="pp-log"><thead><tr><th scope="col">Game</th><th scope="col">Opp</th><th scope="col" class="pp-betcol">${esc(betHead)}</th>${cols.map(c=>`<th scope="col">${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>
      <p class="pp-note">Green and red show whether each game cleared this bet’s line. Regular season and playoffs; preseason excluded.</p>${seasons.length>shown.length?`<button type="button" class="pp-more" data-pp-more>Show ${seasons.slice(2).join(' and ')}</button>`:''}</section>`;
  }
  function propsBlock(p){
    const list=props.filter(q=>q.player===p.player).sort((a,b)=>a.market.localeCompare(b.market)||a.line-b.line);
    if(!list.length)return '<section class="pp-card"><p class="pp-note">No other props are posted for this player right now.</p></section>';
    return `<section class="pp-card"><h3 class="pp-h">Posted props</h3><p class="pp-note">Tap a price to add it to your slip.</p><div class="pp-props">${list.map(q=>`<div class="pp-prop" data-pp-prop="${q.id}"><div><strong>${esc(q.market)}</strong><small>Line ${q.line??'—'}</small></div><div class="pp-oddbtns">${['Over','Under'].map(side=>{const price=side==='Over'?q.over:q.under;return price==null?'':`<button type="button" data-side="${side}" aria-label="Add ${side} ${esc(String(q.line))} ${esc(q.market)}">${side==='Over'?'O':'U'} <b>${formatOdds(price)}</b></button>`}).join('')}</div></div>`).join('')}</div></section>`;
  }
  function header(p,player,role){
    const name=esc(p.player),initials=esc(String(p.player).split(' ').map(s=>s[0]).join('').slice(0,2)),team=player?.team?.full_name||'';
    const bio=[player?.height,player?.weight,player?.age?`Age ${Math.floor(player.age)}`:'',player?.experience,player?.college].filter(Boolean).map(esc).join(' · ');
    const pos=player?.position_abbreviation||ROLES[role]?.name||'';
    let when='';try{when=p.startsAt?formatCompactKickoff(p.startsAt):p.time||''}catch{when=p.time||''}
    return `<header class="pp-head"><div class="pp-photo"><img src="/api/player-photo?name=${encodeURIComponent(p.player)}${p.sport==="NBA"?"&sport=NBA":""}" alt="" onerror="this.remove()"><span>${initials}</span></div><div><h2 id="ppName">${name}</h2><p class="pp-sub">${[pos,player?.jersey_number?`#${esc(player.jersey_number)}`:'',esc(team)].filter(Boolean).join(' · ')}</p>${bio?`<p class="pp-bio">${bio}</p>`:''}</div></header>
      ${p.team?`<p class="pp-next"><span>${Date.parse(p.startsAt)<Date.now()?'Game':'Next game'}</span> ${esc(compactGameName(String(p.team).replace(' · ',' ')))}${when?` · ${esc(when)}`:''}</p>`:''}`;
  }
  // NBA seasons span two years (2025-26); NFL seasons are one.
  let nbaView=false,seasonText=y=>String(y);
  function render(p,payload){
    const host=$('#playerProfile');if(!host)return;
    const player=payload.player||{},rows=(payload.stats||[]).map(row=>({row,date:statDate(row)})).sort((a,b)=>(b.date?.getTime()||0)-(a.date?.getTime()||0));
    const role=roleOf(player,rows,p);nbaView=role==='NBA';seasonText=nbaView?y=>`${y}-${String((Number(y)+1)%100).padStart(2,'0')}`:y=>String(y);const seasons=[...new Set(rows.map(x=>gameInfo(x.row,player).season).filter(v=>v!==null))].sort((a,b)=>b-a);
    const view={tab:'overview',season:seasons[0],all:false},count=props.filter(q=>q.player===p.player).length;
    const draw=()=>{
      const panel=view.tab==='log'?logBlock(p,role,rows,player,view.all):view.tab==='props'?propsBlock(p):(rows.length?betBlock(p,rows,player)+seasonBlock(role,rows,view.season,seasons):`<section class="pp-card"><p class="pp-note">No completed NFL games are available for this player yet.</p></section>`);
      host.innerHTML=`<div class="pp" aria-labelledby="ppName">${header(p,player,role)}<div class="pp-tabs" role="tablist">${[['overview','Overview'],['log','Game log'],['props',`Props${count?` <b>${count}</b>`:''}`]].map(([k,l])=>`<button type="button" role="tab" data-pp-tab="${k}" aria-selected="${view.tab===k}">${l}</button>`).join('')}</div>${panel}<p class="pp-source">Box scores from BALLDONTLIE.</p></div>`;
      host.querySelectorAll('[data-pp-tab]').forEach(b=>b.onclick=()=>{view.tab=b.dataset.ppTab;draw()});
      host.querySelectorAll('[data-pp-season]').forEach(b=>b.onclick=()=>{view.season=+b.dataset.ppSeason;draw()});
      host.querySelector('[data-pp-more]')?.addEventListener('click',()=>{view.all=true;draw()});
      const sync=()=>host.querySelectorAll('[data-pp-prop]').forEach(rowEl=>{const q=props.find(x=>x.id===+rowEl.dataset.ppProp);rowEl.querySelectorAll('button').forEach(b=>b.classList.toggle('on',!!q&&state.slip.some(leg=>savedPropKey(leg.p)===savedPropKey(q)&&leg.side===b.dataset.side)))});
      host.querySelectorAll('[data-pp-prop] button').forEach(b=>b.onclick=()=>{const q=props.find(x=>x.id===+b.closest('[data-pp-prop]').dataset.ppProp);if(q){toggleLeg(q,b.dataset.side);sync()}});sync();
    };
    draw();
  }
  renderPlayerProfile=render;
  window.BTGPlayer={roleOf,seasonTotals,gameInfo,betMetric,render};
})();

// Player search lives behind the header search button. The panel opens under
// the header with results directly below the input; picking a player filters
// the board and shows a chip that clears the filter.
(()=>{
  const panel=$('#searchPanel'),btn=$('#searchBtn'),input=$('#playerSearch');if(!panel||!btn||!input)return;
  const chevron='<svg class="ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';
  const matchup=name=>{const q=props.find(x=>x.player===name);try{return q?compactGameName(String(q.team||'').replace(' · ',' ')):''}catch{return ''}};
  const openSearch=()=>{panel.hidden=false;btn.setAttribute('aria-expanded','true');document.body.classList.add('search-open');input.focus();showPlayerChoices()};
  const closeSearch=()=>{if(panel.hidden)return;panel.hidden=true;btn.setAttribute('aria-expanded','false');document.body.classList.remove('search-open');closePlayerResults()};
  window.BTGSearch={open:openSearch,close:closeSearch};
  btn.addEventListener('click',()=>panel.hidden?openSearch():closeSearch());
  $('#searchCancel')?.addEventListener('click',closeSearch);
  input.addEventListener('keydown',event=>{if(event.key==='Escape')closeSearch()});
  panel.addEventListener('keydown',event=>{if(event.key==='Escape')closeSearch()});
  document.addEventListener('pointerdown',event=>{if(!panel.hidden&&!panel.contains(event.target)&&!btn.contains(event.target))closeSearch()});
  showPlayerChoices=function(){
    const results=$('#playerSearchResults'),query=input.value.trim(),choices=playerChoices(query);
    $('#clearPlayerSearch').hidden=!query;
    if(!choices.length&&!query){results.innerHTML='<div class="player-search-empty">Player props appear here once sportsbooks post lines.</div>'}
    else results.innerHTML=(query?'':'<p class="search-hint">Most props posted</p>')+(choices.length?choices.map(([name,count])=>`<button type="button" role="option" data-player-choice="${htmlEscape(name)}" aria-selected="false"><i>${htmlEscape(name.split(' ').map(part=>part[0]).slice(0,2).join(''))}</i><span><strong>${htmlEscape(name)}</strong><small>${[matchup(name),`${count} prop${count===1?'':'s'}`].filter(Boolean).map(htmlEscape).join(' · ')}</small></span>${chevron}</button>`).join(''):`<div class="player-search-empty">No player with posted props matches “${htmlEscape(query)}”.</div>`);
    results.hidden=false;results.querySelectorAll('[data-player-choice]').forEach(button=>button.onclick=()=>choosePlayer(button.dataset.playerChoice));input.setAttribute('aria-expanded','true');
  };
  const chooseBase=choosePlayer;choosePlayer=name=>{closeSearch();chooseBase(name)};
  $('#clearPlayerSearch').onclick=()=>{input.value='';$('#clearPlayerSearch').hidden=true;if(selectedPlayer){selectedPlayer='';render()}showPlayerChoices();input.focus()};
  const chip=$('#playerFilterClear');
  const syncChip=()=>{if(!chip)return;chip.hidden=!selectedPlayer;chip.innerHTML=selectedPlayer?`Showing ${htmlEscape(selectedPlayer)} <span aria-hidden="true">×</span>`:'';chip.setAttribute('aria-label',selectedPlayer?`Clear the ${selectedPlayer} filter`:'')};
  chip?.addEventListener('click',()=>{selectedPlayer='';input.value='';render()});
  const renderBase=render;render=function(...args){const out=renderBase.apply(this,args);syncChip();return out};
  const bookmarkBase=openBookmarkBoard;openBookmarkBoard=saved=>{bookmarkBase(saved);if(!saved)openSearch()};
})();
(()=>{const set=()=>{const h=document.querySelector('.topbar');if(h)document.documentElement.style.setProperty('--search-top',Math.round(h.getBoundingClientRect().bottom)+'px')};set();addEventListener('resize',set);$('#searchBtn')?.addEventListener('click',set,true)})();
// A recorded pick or parlay leg in the shape the player stats screen reads.
function statsProp(l){
  const binary=/touchdown|scorer/i.test(l.market||'')&&Number(l.line)===0.5,odds=Number(l.odds);
  return {id:`stats-${l.player}`,sport:l.sport||'NFL',player:l.player,team:l.team||'',market:l.market||'',line:binary?.5:Number(l.line),side:l.side||'Over',binary,over:Number.isFinite(odds)?odds:null,under:Number.isFinite(odds)?odds:null,startsAt:l.gameTime||null,eventID:l.gameId};
}
// The Results page links here (?stats=…) to open a player's stats screen.
(()=>{const q=new URLSearchParams(location.search),player=q.get('stats');if(!player)return;
  const leg={player,market:q.get('market')||'',line:q.get('line'),side:q.get('side')||'Over',team:q.get('team')||'',gameTime:q.get('t')||null,odds:q.get('odds')};
  history.replaceState(null,'',location.pathname+location.hash);
  setTimeout(()=>openPlayerProfile(statsProp(leg)),0)})();
// Popular falls back to the best-priced props on the board when nothing
// clears its stricter bar, instead of saying there are no props.
(()=>{const base=visibleProps;
  visibleProps=function(){
    const list=base();
    if(list.length||selectedPlayer||state.view!=='board'||state.boardMarket!=='All')return list;
    const fallback=props.filter(p=>p.sport===LEAGUE&&!p.teamMarket&&!p.oneSided&&!/^No (Scorer|Touchdown)/i.test(p.player)&&!/[\s/]D\/ST$/i.test(p.player)&&(state.boardGame==='All'||gameName(p)===state.boardGame)).sort((a,b)=>(b.edge||0)-(a.edge||0)).slice(0,12);
    visiblePropTotal=fallback.length;return fallback;
  };
})();

// NBA beta: the NFL|NBA switch (only for browsers with ?nba=1) and, in NBA
// mode, NBA wording for text that is still written for the NFL.
(()=>{
  if(!NBA_BETA)return;
  const mount=()=>{
    const main=document.querySelector('main');if(!main||document.getElementById('leagueSwitch'))return;
    const el=document.createElement('div');el.id='leagueSwitch';el.className='league-switch';el.setAttribute('role','group');el.setAttribute('aria-label','League');
    el.innerHTML=['NFL','NBA'].map(l=>`<button type="button" data-league="${l}" aria-pressed="${l===LEAGUE}">${l}${l==='NBA'?'<small>Beta</small>':''}</button>`).join('');
    el.addEventListener('click',e=>{const b=e.target.closest('[data-league]');if(b&&b.dataset.league!==LEAGUE)switchLeague(b.dataset.league)});
    main.prepend(el);
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
  if(LEAGUE!=='NBA')return;
  // The record, official picks and live tracker are NFL-only for now; NBA mode
  // shows the NBA board with a note instead.
  document.documentElement.dataset.league='NBA';
  const note=()=>{const sw=document.getElementById('leagueSwitch');if(!sw||document.getElementById('nbaNote'))return;const n=document.createElement('p');n.id='nbaNote';n.className='nba-note';n.textContent='NBA preview: tonight\u2019s NBA props, each rated against the fair price across the big sportsbooks. Official NBA picks and an NBA record start with the season.';sw.after(n)};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',note);else note();
  const words=[[/\bTop props this week\b/g,'Top props today'],[/\bNFL\b/g,'NBA'],[/\bkickoff\b/g,'tip-off'],[/\bKickoff\b/g,'Tip-off']];
  const fix=node=>{
    if(node.nodeType===3){let t=node.nodeValue,n=t;for(const [a,b] of words)n=n.replace(a,b);if(n!==t)node.nodeValue=n;return}
    if(node.nodeType!==1||/^(SCRIPT|STYLE|TEXTAREA)$/.test(node.nodeName)||node.id==='leagueSwitch')return;
    for(const attr of ['aria-label','placeholder','title'])if(node.hasAttribute?.(attr)){let v=node.getAttribute(attr),n=v;for(const [a,b] of words)n=n.replace(a,b);if(n!==v)node.setAttribute(attr,n)}
    node.childNodes.forEach(fix);
  };
  const start=()=>{fix(document.body);document.title=document.title.replace(/\bNFL\b/g,'NBA');new MutationObserver(list=>list.forEach(m=>{if(m.type==='characterData')fix(m.target);else m.addedNodes.forEach(fix)})).observe(document.body,{childList:true,subtree:true,characterData:true})};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();

/* Team colors: once a card's player stats load, paint the avatar and accent in the player's team colors. */
(()=>{
  const NFL={ARI:['#97233F','#FFB612'],ATL:['#A71930','#101820'],BAL:['#241773','#9E7C0C'],BUF:['#00338D','#C60C30'],CAR:['#0085CA','#101820'],CHI:['#0B162A','#C83803'],CIN:['#FB4F14','#101820'],CLE:['#311D00','#FF3C00'],DAL:['#003594','#869397'],DEN:['#FB4F14','#002244'],DET:['#0076B6','#B0B7BC'],GB:['#203731','#FFB612'],HOU:['#03202F','#A71930'],IND:['#002C5F','#A2AAAD'],JAX:['#006778','#D7A22A'],KC:['#E31837','#FFB81C'],LV:['#101820','#A5ACAF'],LAC:['#0080C6','#FFC20E'],LAR:['#003594','#FFA300'],MIA:['#008E97','#FC4C02'],MIN:['#4F2683','#FFC62F'],NE:['#002244','#C60C30'],NO:['#101820','#D3BC8D'],NYG:['#0B2265','#A71930'],NYJ:['#125740','#101820'],PHI:['#004C54','#A5ACAF'],PIT:['#101820','#FFB612'],SF:['#AA0000','#B3995D'],SEA:['#002244','#69BE28'],TB:['#D50A0A','#34302B'],TEN:['#0C2340','#4B92DB'],WAS:['#5A1414','#FFB612']};
  Object.assign(NFL,{JAC:NFL.JAX,LA:NFL.LAR,WSH:NFL.WAS});
  const NBA={ATL:['#E03A3E','#26282A'],BOS:['#007A33','#BA9653'],BKN:['#101010','#777D84'],CHA:['#1D1160','#00788C'],CHI:['#CE1141','#101010'],CLE:['#860038','#FDBB30'],DAL:['#00538C','#002B5E'],DEN:['#0E2240','#FEC524'],DET:['#C8102E','#1D42BA'],GSW:['#1D428A','#FFC72C'],HOU:['#CE1141','#101010'],IND:['#002D62','#FDBB30'],LAC:['#C8102E','#1D428A'],LAL:['#552583','#FDB927'],MEM:['#5D76A9','#12173F'],MIA:['#98002E','#101010'],MIL:['#00471B','#EEE1C6'],MIN:['#0C2340','#236192'],NOP:['#0C2340','#C8102E'],NYK:['#006BB6','#F58426'],OKC:['#007AC1','#EF3B24'],ORL:['#0077C0','#101010'],PHI:['#006BB6','#ED174C'],PHX:['#1D1160','#E56020'],POR:['#E03A3E','#101010'],SAC:['#5A2D81','#63727A'],SAS:['#101010','#C4CED4'],TOR:['#CE1141','#101010'],UTA:['#002B5C','#F9A01B'],WAS:['#002B5C','#E31837']};
  const light=hex=>{const n=parseInt(hex.slice(1),16);return .2126*(n>>16)+.7152*(n>>8&255)+.0722*(n&255)};
  const colors=(team,sport)=>{const key=String(team?.abbreviation||'').toUpperCase();return (sport==='NBA'?NBA:NFL)[key]||null};
  window.BTGTeamColors=colors;
  const paint=(el,team,sport)=>{const pair=colors(team,sport);if(!el||!pair)return;const [a,b]=pair;el.style.setProperty('--team',a);el.style.setProperty('--team2',b);el.style.setProperty('--team-accent',light(a)>=light(b)?a:b);el.dataset.team=String(team.abbreviation).toUpperCase()};
  window.BTGPaintTeam=(el,team,sport)=>paint(el,team,sport);
  const fromStats=async(host,p)=>{try{if(p.teamMarket)return;const payload=await playerStatsFor(p);paint(host.closest('.prop-card'),payload?.player?.team,p.sport)}catch{}};
  let seen=null;
  const baseBind=bindCards;
  bindCards=function(){baseBind();seen?.disconnect();const cards=$$('.prop-card[data-id]:not([data-team])'),go=el=>{const p=props.find(item=>item.id===+el.dataset.id);if(p)fromStats(el,p)};
    if(typeof IntersectionObserver!=='function'){cards.slice(0,12).forEach(go);return}
    seen=new IntersectionObserver(items=>items.forEach(item=>{if(!item.isIntersecting)return;seen.unobserve(item.target);go(item.target)}),{rootMargin:'200px 0px'});cards.forEach(el=>seen.observe(el))};
  // One plain line on each board card saying why it got its rating.
  const bookFrom=p=>(String(p.note||'').match(/^(?:Best (?:price |total )?at )?(.+?) (?:price )?vs\b/)||[])[1]||'';
  const whyText=p=>{const v=typeof propVerdict==='function'?propVerdict(p):null,edge=Number(p.rawEdge),n=Number(p.pairedBooks)||0;if(!v||!Number.isFinite(edge))return '';const book=bookFrom(p)||(p.bestBook&&!/demo/i.test(p.bestBook)?p.bestBook:'');
    if(v.key==='send')return `${book?`${book} pays`:'Pays'} ${edge.toFixed(1)}% more than fair${n?` (${n} books)`:''}`;
    if(v.key==='read')return `${Math.abs(edge).toFixed(1)}% worse than the fair price`;
    return n?`In line with the fair price across ${n} books`:''};
  const baseCard=card;
  card=function(p,rank=-1,featured=false){const html=baseCard(p,rank,featured);if(!html.includes('<p class="card-money">'))return html;const why=whyText(p);return why?html.replace('<p class="card-money">',()=>`<p class="card-why card-why-${propVerdict(p).key}">${htmlEscape(why)}</p><p class="card-money">`):html};
  const baseProfile=renderPlayerProfile;
  renderPlayerProfile=function(p,payload){const out=baseProfile(p,payload);try{paint(document.querySelector('#playerProfile .pp-head'),payload?.player?.team,p.sport)}catch{}return out};
})();

/* Engine status: shows the pick engine is scanning, from the latest pick run. */
(()=>{
  const host=typeof document.getElementById==='function'?document.getElementById('engineStatus'):null;if(!host||typeof fetch!=='function')return;
  const ago=ms=>{const m=Math.round(ms/60000);return m<1?'just now':m<60?`${m} min ago`:`${Math.round(m/60)} hr ago`};
  const draw=body=>{const last=body?.last,age=last?Date.now()-Date.parse(last.at):Infinity;
    if(!last||!(age<45*60000)||!last.props){host.hidden=true;return}
    host.innerHTML=`<span class="on-engine-dot" aria-hidden="true"></span><span><b>Engine live</b> · checked ${Number(last.props).toLocaleString('en-US')} props ${ago(age)}${body.day?.runs>1?` · ${body.day.runs} scans today`:''}</span>`;host.hidden=false};
  let data=null;
  const load=()=>fetch('/api/engine').then(r=>r.ok?r.json():null).then(body=>{data=body?.success?body:null;draw(data)}).catch(()=>{});
  load();setInterval(load,120000);setInterval(()=>data&&draw(data),30000);
})();

/* Alerts banner and add-to-home prompt: the two ways people come back. */
(()=>{
  if(typeof document.getElementById!=='function')return;
  const store={get:k=>{try{return localStorage.getItem(k)}catch{return null}},set:(k,v)=>{try{localStorage.setItem(k,v)}catch{}}};
  const days=n=>n*86400000,recent=(k,n)=>{const t=Number(store.get(k));return Number.isFinite(t)&&Date.now()-t<days(n)};
  const hero=document.getElementById('alertsHero');
  if(hero&&!recent('btg-alerts-hero-hidden',14)){hero.hidden=false;document.getElementById('alertsHeroClose')?.addEventListener('click',()=>{hero.hidden=true;store.set('btg-alerts-hero-hidden',String(Date.now()));window.btgCount?.('alerts:banner-hide')})}
  // Add to Home Screen: iPhone needs it for phone alerts; Android can install directly.
  const standalone=window.matchMedia?.('(display-mode: standalone)').matches||navigator.standalone===true;
  if(standalone)return;
  const visits=Number(store.get('btg-visits')||0)+1;store.set('btg-visits',String(visits));
  const ios=/iPhone|iPad|iPod/.test(navigator.userAgent||'')&&!/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent||'');
  const toast=(html,onAction)=>{if(recent('btg-a2hs-hidden',30)||document.getElementById('a2hs'))return;const el=document.createElement('div');el.id='a2hs';el.className='a2hs';el.setAttribute('role','dialog');el.setAttribute('aria-label','Add Bet This Guy to your Home Screen');el.innerHTML=`<img src="/apple-touch-icon.png" alt="" width="40" height="40"><div class="a2hs-copy">${html}</div>${onAction?'<button type="button" class="a2hs-go">Install</button>':''}<button type="button" class="a2hs-close" aria-label="Not now">×</button>`;
    el.querySelector('.a2hs-close').onclick=()=>{el.remove();store.set('btg-a2hs-hidden',String(Date.now()))};
    if(onAction)el.querySelector('.a2hs-go').onclick=()=>{el.remove();onAction()};
    document.body.appendChild(el);window.btgCount?.('a2hs:shown')};
  if(ios&&visits>=2)setTimeout(()=>toast('<strong>Get the app on your iPhone</strong><span>Tap <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-label="Share"><path d="M12 3v12"/><path d="m8 7 4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg> then <b>Add to Home Screen</b>. Opens like an app, and pick alerts work.</span>'),4000);
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();if(visits<2)return;toast('<strong>Install Bet This Guy</strong><span>One tap to open picks, with alerts when they post.</span>',()=>{event.prompt();event.userChoice?.then(c=>window.btgCount?.(`a2hs:${c.outcome}`))})});
})();

/* Personal P/L: signed-in viewers see their own tracked record on home. */
(()=>{
  if(typeof document.getElementById!=='function')return;
  const host=document.getElementById('myRecord');if(!host)return;
  const dollars=c=>`${c<0?'−':'+'}$${Math.abs(Math.round(c/100)).toLocaleString('en-US')}`;
  const draw=async()=>{const m=await window.BTGAuth?.myRecord?.().catch(()=>null);if(!m||!m.count){host.hidden=true;return}
    const decided=m.wins+m.losses+m.pushes;
    host.innerHTML=`<span class="my-pl-label">Your bets</span>${decided?`<b>${m.wins}–${m.losses}${m.pushes?`–${m.pushes}`:''}</b><span class="my-pl-net ${m.net>=0?'up':'down'}">${dollars(m.net)}</span>`:''}${m.pending?`<span class="my-pl-pending">${m.pending} pending</span>`:''}<span class="my-pl-go" aria-hidden="true">›</span>`;
    host.setAttribute('aria-label',`Your tracked bets: ${m.wins} wins, ${m.losses} losses${m.pending?`, ${m.pending} pending`:''}. Open My Picks`);host.hidden=false};
  host.onclick=()=>window.BTGAuth?.open?.('record');
  window.BTGMyRecord=draw;addEventListener('btg-auth',draw);setTimeout(draw,1200);
})();

/* Follow players and teams (kept on this device): a Follow button on the
   player screen, a "Following" tag on their board cards, and a Following
   list in the desktop rail / under This week's picks on phones. */
(()=>{
  if(typeof document.getElementById!=='function')return;
  const KEY='btg-follow',read=()=>{try{const v=JSON.parse(localStorage.getItem(KEY)||'{}');return {players:Array.isArray(v.players)?v.players:[],teams:Array.isArray(v.teams)?v.teams:[]}}catch{return {players:[],teams:[]}}};
  const write=v=>{try{localStorage.setItem(KEY,JSON.stringify(v))}catch{}};
  const norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const has=(kind,name)=>read()[kind].some(x=>norm(x.name)===norm(name));
  // Follows also live in the account (preferences.follows) and with this
  // phone's alerts, so they carry across devices and trigger alerts.
  const sync=v=>{try{preferences={...preferences,follows:v};savePreferences()?.catch?.(()=>{})}catch{}window.BTGSyncAlertBooks?.()};
  const toggle=(kind,item)=>{const v=read(),list=v[kind],i=list.findIndex(x=>norm(x.name)===norm(item.name));if(i>=0)list.splice(i,1);else list.unshift({...item,at:Date.now()});v[kind]=list.slice(0,40);write(v);sync(v);window.btgCount?.(`follow:${i>=0?'off':'on'}`);refresh();return i<0};
  // Signing in merges the account's follows with this device's.
  addEventListener('btg:preferences-loaded',event=>{const remote=event.detail?.follows;if(!remote||typeof remote!=='object'){const l=read();if(l.players.length||l.teams.length)sync(l);return}const local=read(),merged={players:[],teams:[]};let extra=false;
    for(const kind of ['players','teams']){const seen=new Set();for(const x of [...(Array.isArray(remote[kind])?remote[kind]:[]),...local[kind]]){if(!x?.name||seen.has(norm(x.name)))continue;seen.add(norm(x.name));merged[kind].push(x)}merged[kind]=merged[kind].slice(0,40);if(merged[kind].length>(Array.isArray(remote[kind])?remote[kind].length:0))extra=true}
    write(merged);if(extra)sync(merged);else window.BTGSyncAlertBooks?.();refresh()});
  window.BTGFollow={read,has,toggle};
  const teamsOf=p=>String(p.team||'').toLowerCase();
  const followedProp=p=>has('players',p.player)||read().teams.some(t=>t.full&&teamsOf(p).includes(String(t.full).toLowerCase()));
  // Board cards: a small tag on followed players and teams.
  const baseCard=card;
  card=function(p,rank=-1,featured=false){const html=baseCard(p,rank,featured);if(!followedProp(p))return html;const team=has('players',p.player)?null:read().teams.find(t=>t.full&&teamsOf(p).includes(String(t.full).toLowerCase()));const tag=team?`${team.name} game`:'Following';return html.replace('<strong>'+p.player+'</strong>',()=>`<strong>${p.player}<em class="follow-tag">${htmlEscape(tag)}</em></strong>`).replace('class="prop-card','class="prop-card is-followed')};
  // Player screen: Follow buttons for the player and their team.
  const baseProfile=renderPlayerProfile;
  renderPlayerProfile=function(p,payload){const out=baseProfile(p,payload);try{
    const head=document.querySelector('#playerProfile .pp-head');if(!head||head.querySelector('.follow-row'))return out;
    const team=payload?.player?.team||{},abbr=String(team.abbreviation||'').toUpperCase(),row=document.createElement('div');row.className='follow-row';
    const btn=(kind,item,label)=>{const b=document.createElement('button');b.type='button';b.className='follow-btn';const sync=()=>{const on=has(kind,item.name);b.classList.toggle('on',on);b.setAttribute('aria-pressed',String(on));b.textContent=on?`✓ Following${kind==='teams'?' '+label:''}`:`＋ Follow ${label}`};sync();b.onclick=e=>{e.stopPropagation();const on=toggle(kind,item);sync();const hint=row.parentElement?.querySelector('.follow-hint');if(hint)hint.hidden=!(on&&kind==='players')};return b};
    row.appendChild(btn('players',{name:p.player,sport:p.sport||'NFL',team:abbr},'player'));
    if(abbr)row.appendChild(btn('teams',{name:abbr,full:team.full_name||'',sport:p.sport||'NFL'},abbr));
    const host=head.querySelector('div:not(.pp-photo)')||head;host.appendChild(row);
    const hint=document.createElement('p');hint.className='follow-hint';hint.hidden=true;hint.innerHTML=document.documentElement.classList.contains('alerts-on')?'We’ll alert you when a top sportsbook has a good-value price on this player.':'Turn on <button type="button" class="follow-hint-btn">pick alerts</button> to hear when a top sportsbook has a good-value price on this player.';
    hint.querySelector('.follow-hint-btn')?.addEventListener('click',()=>{document.getElementById('playerDialog')?.close?.();document.querySelector('[data-alerts-toggle]')?.click()});host.appendChild(hint)}catch{}return out};
  // Following list.
  const panel=document.createElement('section');panel.className='follow-panel';panel.id='followPanel';panel.setAttribute('aria-labelledby','followTitle');
  const esc=s=>htmlEscape(s);
  function drawPanel(){const v=read(),list=[...v.players.map(x=>({...x,kind:'players'})),...v.teams.map(x=>({...x,kind:'teams'}))];
    panel.classList.toggle('empty',!list.length);
    if(!list.length){panel.innerHTML=`<h2 id="followTitle">Following</h2><p class="follow-empty">Follow players and teams from their stats screen. They’ll be tagged on the board and listed here.</p>`;return}
    const rows=list.slice(0,12).map((x,i)=>{const theirs=(typeof props!=='undefined'?props:[]).filter(p=>x.kind==='players'?norm(p.player)===norm(x.name):x.full&&teamsOf(p).includes(String(x.full).toLowerCase()));
      const colors=window.BTGTeamColors?.({abbreviation:x.kind==='teams'?x.name:x.team},x.sport),style=colors?` style="background:linear-gradient(135deg,${colors[0]},${colors[1]})"`:'';
      const initials=x.kind==='teams'?x.name:String(x.name).split(' ').map(w=>w[0]).join('').slice(0,3);
      const sub=theirs.length?`${theirs.length} prop${theirs.length===1?'':'s'} on the board`:'Nothing on the board right now';
      return `<li><button type="button" class="follow-item" data-follow-i="${i}"${theirs.length?'':' disabled'}><span class="fi-badge"${style}>${esc(initials)}</span><span class="fi-text"><b>${esc(x.kind==='teams'?(x.full||x.name):x.name)}</b><small>${sub}</small></span></button><button type="button" class="fi-x" data-unfollow="${i}" aria-label="Unfollow ${esc(x.name)}">×</button></li>`}).join('');
    panel.innerHTML=`<h2 id="followTitle">Following</h2><ul class="follow-list">${rows}</ul>`;
    panel.querySelectorAll('[data-follow-i]').forEach(b=>b.onclick=()=>{const x=list[+b.dataset.followI],p=(props||[]).find(q=>x.kind==='players'?norm(q.player)===norm(x.name):teamsOf(q).includes(String(x.full).toLowerCase()));if(!p)return;if(x.kind==='players')openPlayerProfile(p);else window.BTGSheet?.prop?.(p)});
    panel.querySelectorAll('[data-unfollow]').forEach(b=>b.onclick=()=>{const x=list[+b.dataset.unfollow];toggle(x.kind,x)})}
  function refresh(){drawPanel();try{if(typeof render==='function')render()}catch{}}
  // Desktop rail: on wide screens the record, your bets, alerts and Following
  // sit in a sticky column beside the picks; on phones they stay in the flow.
  const board=document.querySelector('.workspace .board'),rail=document.createElement('aside');rail.className='desk-rail';rail.setAttribute('aria-label','Your corner');
  const parts=['heroBanner','myRecord','alertsHero'].map(id=>document.getElementById(id)).filter(Boolean),marks=parts.map(el=>{const m=document.createComment('rail');el.before(m);return m});
  const official=document.getElementById('officialNow');
  const wide=window.matchMedia?.('(min-width: 1180px)');
  function place(){if(!board)return;if(wide?.matches){board.classList.add('has-rail');board.prepend(rail);parts.forEach(el=>rail.appendChild(el));rail.appendChild(panel)}else{board.classList.remove('has-rail');parts.forEach((el,i)=>marks[i].after(el));rail.remove();(document.getElementById('alertsHero')||official?.lastElementChild)?.after?.(panel)}}
  if(official&&!document.getElementById('alertsHero'))official.appendChild(panel);
  place();wide?.addEventListener?.('change',place);drawPanel();
  addEventListener('storage',e=>{if(e.key===KEY)refresh()});
  const baseBind=bindCards;bindCards=function(){baseBind();drawPanel()};
})();

// Board form and prices: each card shows how often the bet hit in the
// player's last 10 games (from /api/form, one cached request for the whole
// board), the prop sheet lists every book's price, and a "Good value" chip
// filters the board to the props that beat the fair price.
(()=>{
  if(typeof document.getElementById!=='function'||!document.getElementById('propList'))return;
  const normName=s=>String(s||'').toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b/g,'').replace(/[^a-z0-9]/g,'');
  const marketKey=s=>String(s||'').toLowerCase().replace(/^alternate\s+/,'').replace(/^field goals$/,'field goals made');
  let form={};
  function formFor(p){
    const f=form[normName(p.player)];if(!f||!f.m)return null;
    const want=marketKey(p.market),label=Object.keys(f.m).find(k=>marketKey(k)===want);if(!label)return null;
    const games=f.m[label].map((v,i)=>({v,d:f.d[i],o:f.o?.[i]||''})).filter(g=>g.v!==null&&g.v!==undefined);
    if(games.length<3)return null;
    const line=p.binary?.5:Number(p.line),marks=games.map(g=>({...g,hit:hitAgainstLine(p,g.v)}));
    const hits=marks.filter(g=>g.hit===true).length,avg=games.reduce((s,g)=>s+g.v,0)/games.length;
    return {games:marks,hits,n:games.length,avg,line};
  }
  window.BTGForm={get:formFor};
  // Official picks: "Over in 7 of last 10" under the pick, once form loads.
  let officialList=[];
  function officialForm(list){
    if(list)officialList=list;
    document.querySelectorAll('#officialNowList [data-on-form]').forEach(el=>{const r=officialList[+el.dataset.onForm];if(!r||r.kind!=='prop')return;
      const p={player:r.player,market:r.market,side:r.side,line:Number(r.line),binary:/anytime|first|last/i.test(r.market||'')},f=formFor(p);
      el.hidden=!f;if(f)el.textContent=formText(p,f)});
  }
  window.btgOfficialForm=officialForm;
  const fmt=v=>Number.isInteger(v)?String(v):v.toFixed(1);
  function formText(p,f){
    const td=/anytime|first|last|scorer/i.test(p.market||'');
    if(p.binary||td)return p.side==='Under'?`No TD in ${f.hits} of last ${f.n}`:`Scored in ${f.hits} of last ${f.n}`;
    return `${p.side} in ${f.hits} of last ${f.n} · avg ${fmt(+f.avg.toFixed(1))}`;
  }
  // Ten small bars, oldest to newest: height is the stat, green when the bet hit.
  function bars(p,f,big=false){
    const list=[...f.games].reverse(),top=Math.max(f.line*1.6,...list.map(g=>g.v),1),H=big?64:18;
    const y=Math.max(1,Math.min(H,H*f.line/top));
    return `<span class="cf-bars${big?' cf-big':''}" style="--h:${H}px" aria-hidden="true">${p.binary?'':`<em style="bottom:${y.toFixed(1)}px"></em>`}${list.map(g=>`<i class="${g.hit===true?'hit':g.hit===false?'miss':'push'}" style="height:${Math.max(2,H*g.v/top).toFixed(1)}px" title="${htmlEscape(`${g.d||''} ${g.o} · ${fmt(g.v)}`.trim())}">${big?`<b>${htmlEscape(fmt(g.v))}</b>`:''}</i>`).join('')}</span>`;
  }
  // Book prices for each prop, kept from the odds feed (and the saved board).
  const baseNormalize=normalizeLiveProps;
  normalizeLiveProps=function(payload){
    const list=baseNormalize(payload),index=new Map();
    for(const event of Array.isArray(payload?.data)?payload.data:[])for(const book of event.bookmakers||[])for(const market of book.markets||[]){
      const label=marketLabels[String(market.key||'').replace(/_alternate$/,'')];if(!label)continue;
      for(const o of market.outcomes||[]){
        const name=String(o.name||'').toLowerCase(),side=name==='over'||name==='yes'?'Over':name==='under'||name==='no'?'Under':null,price=Number(o.price);
        if(!side||!o.description||!Number.isFinite(price))continue;
        const key=`${event.eventID||event.id}|${String(o.description).trim()}|${label}`,lines=index.get(key)||new Map();index.set(key,lines);
        const lineKey=Number.isFinite(Number(o.point))?Number(o.point):'b',at=lines.get(lineKey)||{Over:new Map(),Under:new Map()};lines.set(lineKey,at);
        const title=book.title||book.key,prev=at[side].get(title);if(prev===undefined||price>prev)at[side].set(title,price);
      }
    }
    return list.map(p=>{const lines=index.get(`${p.eventID}|${p.player}|${p.market}`);if(!lines)return p;const at=lines.get(p.binary?'b':Number(p.line))||(p.binary?lines.get(.5):null);if(!at)return p;
      const pack=m=>[...m].sort((a,b)=>b[1]-a[1]).map(([b,o])=>({b,o}));return {...p,books:{Over:pack(at.Over),Under:pack(at.Under)}}});
  };
  // Injury report: a small tag on the card (Q, D, OUT) and a line in the sheet.
  let injuries={};
  const injuryFor=p=>injuries[normName(p.player)]||null;
  const injuryTag=i=>i?`<em class="inj inj-${i.c}" title="${htmlEscape(`${i.s}${i.d?` · ${i.d}`:''}`)}">${i.c==='out'?'OUT':i.c==='doubtful'?'D':'Q'}</em>`:'';
  async function loadInjuries(){
    try{const r=await fetch('/api/injuries');const body=await r.json();if(!r.ok||!body?.players)return;injuries=body.players;if(Object.keys(injuries).length)render()}catch{}
  }
  if(typeof fetch==='function'){loadInjuries();setInterval(loadInjuries,10*60000)}
  async function loadForm(){
    try{const r=await fetch('/api/form');const body=await r.json();if(!r.ok||!body?.players)return;form=body.players;if(Object.keys(form).length){render();officialForm()}}catch{}
  }
  if(typeof fetch==='function'){loadForm();setInterval(loadForm,30*60000)}

  // Cards: the form strip replaces the "in line with the fair price" line.
  const baseCard=card;
  card=function(p,rank=-1,featured=false){
    let html=baseCard(p,rank,featured);
    if(!html.includes('<p class="card-money">'))return html;
    html=html.replace(/<p class="card-why card-why-flip">[\s\S]*?<\/p>/,'');
    const inj=injuryFor(p);if(inj)html=html.replace(/(<header class="player prop-player"[\s\S]*?<strong>[^<]*)(<\/strong>)/,(m,a,b)=>`${a}${injuryTag(inj)}${b}`);
    const f=formFor(p);if(!f)return html;
    // One plain line: "Over in 7 of last 10 · avg 78.3 yds", no colour coding.
    // The game-by-game chart is in the prop sheet.
    const td=p.binary||/anytime|first|last|scorer/i.test(p.market||''),cls='';
    const m=String(p.market||'').toLowerCase(),unit=/yards/.test(m)?' yds':/reception/.test(m)?' rec':/completion/.test(m)?' comp':/attempt/.test(m)?' att':/touchdown/.test(m)?' TD':'';
    const lead=td?(p.side==='Under'?'No TD in':'Scored in'):`${p.side} in`,count=`<b class="cf-count${cls}">${f.hits} of last ${f.n}</b>`;
    return html.replace('<p class="card-money">',()=>`<div class="card-form cf-text" title="${htmlEscape(formText(p,f))}"><span>${htmlEscape(lead)} ${count}${td?'':` · avg ${htmlEscape(fmt(+f.avg.toFixed(1)))}${unit}`}</span></div><p class="card-money">`);
  };

  // The prop sheet: last 10 games as bars, and every book's price.
  const baseProp=window.BTGSheet?.prop;
  if(baseProp)window.BTGSheet.prop=p=>{
    baseProp(p);
    const host=document.getElementById('hitDialogBody');if(!host)return;
    const inj=injuryFor(p);
    if(inj){const line=document.createElement('p');line.className=`bs-injury inj-${inj.c}`;line.textContent=`${inj.s}${inj.d?` · ${inj.d}`:''}${inj.at&&Number.isFinite(Date.parse(inj.at))?` · updated ${new Date(inj.at).toLocaleDateString([],{weekday:'short'})}`:''}`;host.querySelector('.bs-game')?.after(line)}
    const f=formFor(p),rows=host.querySelector('.bs-rows');
    if(f){const cell=host.querySelector('[data-bs-row="2"]');cell?.closest('div')?.remove();
      const block=document.createElement('div');block.className='bs-form';
      block.innerHTML=`<div class="bs-form-head"><span>Last ${f.n} games</span><b>${htmlEscape(formText(p,f))}</b></div>${bars(p,f,true)}<div class="bs-form-dates">${[...f.games].reverse().map(g=>`<span>${htmlEscape(g.o.replace(/^(vs|@) /,'')||'')}</span>`).join('')}</div>${p.binary?'':`<small>Dashed line: ${htmlEscape(String(p.line))}</small>`}`;
      (rows||host.querySelector('.bs-money'))?.after(block)}
    const offers=p.books?.[p.side]||[];
    if(offers.length>1){
      const mine=b=>typeof bookAllowed==='function'&&Array.isArray(preferences?.books)&&preferences.books.length&&bookAllowed(b);
      const table=document.createElement('div');table.className='bs-books';
      table.innerHTML=`<div class="bs-books-head"><span>${htmlEscape(p.binary?(p.side==='Over'?(p.overLabel||'Yes'):(p.underLabel||'No')):`${p.side} ${p.line}`)} at every book</span><small>${offers.length} books</small></div>${offers.map((x,i)=>`<div class="${i===0?'best':''}${mine(x.b)?' mine':''}"><span>${htmlEscape(x.b)}${mine(x.b)?' <em>your book</em>':''}</span><b>${htmlEscape(formatOdds(x.o))}${i===0?' <i>best</i>':''}</b></div>`).join('')}`;
      const after=host.querySelector('.bs-form')||rows||host.querySelector('.bs-money');after?.after(table);
      host.querySelector('[data-bs-row="0"]')?.closest('div')?.remove();
    }
    // "I bet this" (tracked and graded in My Picks) and Follow, under the main action.
    const start=Date.parse(p.startsAt||'');if(!(start>Date.now())||p.teamMarket)return;
    const key=`${savedPropKey(p)}|${p.side}|${p.line}`,BKEY='btg-bet-props',ids=()=>{try{return new Set(JSON.parse(localStorage.getItem(BKEY)||'[]'))}catch{return new Set()}};
    const odds=Number(recommendedOdds(p)),book=String(p.bestBook||p.books?.[p.side]?.[0]?.b||'').replace(/demo/i,'')||null;
    const extra=document.createElement('div');extra.className='bs-extra';
    const last=shortPlayerName(p.player),following=()=>window.BTGFollow?.has('players',p.player);
    extra.innerHTML=`<button type="button" class="bs-btn bs-bet">${ids().has(key)?'✓ In My Picks':'I bet this'}</button>${window.BTGFollow?`<button type="button" class="bs-btn bs-follow" aria-pressed="${following()}">${following()?'✓ Following':`Follow ${htmlEscape(last)}`}</button>`:''}<small>Track it and we grade it for you. Follow to get alerts when a top book has good value on ${htmlEscape(last)}.</small>`;
    (host.querySelector('.bs-acts')||host.querySelector('.bsheet'))?.after(extra);
    const betBtn=extra.querySelector('.bs-bet');
    betBtn.onclick=async()=>{
      if(ids().has(key)){document.getElementById('hitDialog')?.close?.();window.BTGAuth?.open?.('record');return}
      if(!window.BTGAuth?.trackParlay||!Number.isFinite(odds))return;
      betBtn.disabled=true;betBtn.textContent='Saving…';
      try{const out=await window.BTGAuth.trackParlay({legs:[{player:p.player,market:p.market,side:p.side,line:p.line,odds,gameStart:p.startsAt,team:p.team,eventID:p.eventID}],wager:wagerStake(),sportsbook:book,source:'board'});
        if(out){const s=ids();s.add(key);try{localStorage.setItem(BKEY,JSON.stringify([...s].slice(-300)))}catch{}betBtn.textContent='✓ In My Picks';window.btgCount?.('prop:bet');window.BTGAuth.refreshBets?.();window.BTGMyRecord?.()}
        else{betBtn.textContent='I bet this'}}
      catch(error){betBtn.textContent=error?.message||'Couldn’t save. Try again.'}
      betBtn.disabled=false;
    };
    const fol=extra.querySelector('.bs-follow');
    if(fol)fol.onclick=()=>{const on=window.BTGFollow.toggle('players',{name:p.player,sport:p.sport||'NFL'});fol.setAttribute('aria-pressed',String(on));fol.textContent=on?'✓ Following':`Follow ${last}`};
  };

  // "Good value" chip beside Popular: only the props that beat the fair price.
  let valueOnly=false;
  const isValue=p=>p.sport===LEAGUE&&propVerdict(p)?.key==='send'&&recommendationEligible(p);
  const goodValue=()=>props.filter(p=>isValue(p)&&(state.boardGame==='All'||gameName(p)===state.boardGame)).sort((a,b)=>(b.rawEdge||0)-(a.rawEdge||0));
  const baseVisible=visibleProps;
  visibleProps=function(){
    if(valueOnly&&state.view==='board'&&!['parlays','generator'].includes(document.body.dataset.mobilePage)){const list=goodValue();if(list.length){visiblePropTotal=list.length;return list}valueOnly=false}
    const list=baseVisible();
    // Popular: good value first, then fair, overpriced last (order kept within each).
    if(state.view!=='board'||state.boardMarket!=='All')return list;
    const rank=p=>({send:0,flip:1,read:2})[propVerdict(p)?.key]??1;
    return list.map((p,i)=>[p,i]).sort((a,b)=>rank(a[0])-rank(b[0])||a[1]-b[1]).map(x=>x[0]);
  };
  // After renderSportTabs, which moves the featured prop types up behind Popular.
  const baseTabs=renderSportTabs;
  renderSportTabs=function(){
    baseTabs();
    if(['parlays','generator'].includes(document.body.dataset.mobilePage))return;
    const bar=$('#propTypeTabs'),popular=bar?.querySelector('[data-board-market="All"]');if(!popular)return;
    const n=props.filter(isValue).length;
    if(!n){valueOnly=false;return}
    const chip=document.createElement('button');chip.type='button';chip.className=`sub-tab value-tab${valueOnly?' active':''}`;chip.innerHTML=`${icon('check')} Good value<b>${n}</b>`;
    if(valueOnly){bar.querySelectorAll('.sub-tab.active').forEach(b=>b!==chip&&b.classList.remove('active'))}
    popular.after(chip);
    chip.onclick=()=>{valueOnly=!valueOnly;if(valueOnly)state.boardMarket='All';propRenderLimit=24;window.btgCount?.('board:value');render()};
    bar.querySelectorAll('[data-board-market]').forEach(b=>b.addEventListener('click',()=>{valueOnly=false},{capture:true}));
  };
  const baseRender=render;
  render=function(){
    baseRender();
    const title=$('#viewTitle');if(!title)return;
    if(valueOnly&&state.view==='board')title.textContent='Good value right now';
    else if(title.textContent==='Today’s closest calls'){const soon=props.some(p=>{const t=Date.parse(p.startsAt||'');return Number.isFinite(t)&&t>Date.now()&&new Date(t).toDateString()===new Date().toDateString()});title.textContent=soon?'Today’s closest calls':'This week’s closest calls'}
  };
})();

// Leans: props close to the official bar, and qualifying ones held back by the
// two-a-game limit. Shown under the picks, never counted in the record.
(()=>{
  if(typeof document.getElementById!=='function'||!document.getElementById('leansNow')||typeof fetch!=='function')return;
  const when=iso=>{const d=new Date(iso);return Number.isFinite(d.getTime())?d.toLocaleString([],{weekday:'short',hour:'numeric',minute:'2-digit'}):''};
  let leans=[];
  function row(l,i){
    const initials=String(l.player||'').split(' ').map(x=>x[0]||'').join('').slice(0,3);
    const bet=`${l.side} ${l.line} ${String(l.market||'').toLowerCase()}`;
    const game=String(l.team||'').replace(' · @ ',' @ ').replace(' · vs ',' vs '),matchup=game&&typeof compactGameName==='function'?compactGameName(game):game;
    const p={player:l.player,market:l.market,side:l.side,line:Number(l.line)},f=window.BTGForm?.get?.(p);
    const form=f?`${l.side} in ${f.hits} of last ${f.n}`:'';
    return `<div class="on-row lean-row"><span class="on-avatar"><span>${htmlEscape(initials)}</span><img loading="lazy" decoding="async" src="/api/player-photo?name=${encodeURIComponent(l.player||'')}" alt="" onerror="this.remove()"></span><span class="on-who"><span class="on-kicker lean-kicker">Lean${l.book?` · ${htmlEscape(l.book)}`:''}</span><b>${htmlEscape(l.player)}</b><span>${htmlEscape(bet.charAt(0).toUpperCase()+bet.slice(1))}</span><small>${htmlEscape([matchup,when(l.gameTime)].filter(Boolean).join(' · '))}</small>${form?`<i class="on-form" data-lean-form="${i}">${htmlEscape(form)}</i>`:''}</span><span class="on-end"><span class="on-price">${htmlEscape(formatOdds(l.odds))}</span></span></div>`;
  }
  function render(){
    const host=document.getElementById('leansNow'),now=Date.now(),list=leans.filter(l=>Date.parse(l.gameTime)>now);
    host.hidden=!list.length;if(!list.length)return;
    document.getElementById('leansCount').textContent=String(list.length);
    document.getElementById('leansList').innerHTML=list.map(row).join('');
  }
  async function load(){try{const r=await fetch('/api/leans');const body=await r.json();if(!r.ok||!Array.isArray(body?.leans))return;leans=body.leans;render()}catch{}}
  load();setInterval(load,5*60000);
  // Form loads separately; repaint once it's in.
  let tries=0;const wait=setInterval(()=>{if(++tries>20||!leans.length){if(tries>20)clearInterval(wait);return}if(window.BTGForm?.get?.({player:leans[0].player,market:leans[0].market,side:leans[0].side,line:Number(leans[0].line)})){render();clearInterval(wait)}},1500);
})();
