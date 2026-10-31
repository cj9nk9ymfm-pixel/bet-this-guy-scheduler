const assert=require('node:assert/strict'),vm=require('node:vm'),{webcrypto}=require('node:crypto');
const {read}=require('./helpers/client.cjs');
// The pick spotlight graphic (Oct 30): every single, sportsbook or prediction
// app, gets the 1200×1200 card with the price, our chance and what it pays; the
// result version stamps HIT/MISS with the final stat and the money.
const context=vm.createContext({URL,URLSearchParams,Request,Response,Headers,AbortSignal,Date,console,setTimeout,clearTimeout,crypto:webcrypto,TextEncoder,btoa,atob});
const template=read('worker/index.template.js');
vm.runInContext(template.slice(template.indexOf('const API_BASE')).replace('__MOVEMENT_SERVER__',()=>read('worker/movement.js')).replace('__LIVE_SERVER__',()=>read('worker/live.js')).replace('__STATS_SHARED__',()=>read('dist/stats.js')).replace('__RECORDS_SERVER__',()=>read('worker/records.js')).replace('__ACCOUNTS_SERVER__',()=>read('worker/accounts.js')).replace('export default {','this.worker={'),context);
const run=code=>vm.runInContext(code,context);
// Price math: -115 says 53%; a 1.6 edge makes our chance 55%.
assert.deepEqual(JSON.parse(JSON.stringify(run(`xSpotPrice(-115,1.61,'BetMGM')`))),{oddsNum:-115,book:'BetMGM',implied:'53%',chance:'55%'});
assert.deepEqual(JSON.parse(JSON.stringify(run(`xSpotResult({market:'Assists',side:'Under',line:5.5,actualValue:4},'won','+$87')`))),{res:'won',actual:'4 assists',need:'needed 5 or fewer',money:'+$87'});
assert.equal(run(`xSpotResult({market:'3-Pointers Made',side:'Over',line:1.5,actualValue:1},'lost','-$100')`).actual,'1 three');
const card=c=>run(`xPickSvg(${JSON.stringify(c)})`);
const pick=card({sport:'NBA',title:'Donovan Mitchell',bet:'Under 5.5 assists',when:'Cavaliers @ Hawks · Thu 7:10 PM',odds:'-115',pill:{label:'OFFICIAL PICK'},spot:{oddsNum:-115,book:'BetMGM',implied:'53%',chance:'55%'}});
assert.match(pick,/width="1200" height="1200"/);for(const t of ['Donovan','Mitchell','UNDER 5.5 assists','BetMGM price','-115','the price says 53%','What it pays','+$87','on a $100 bet','The best price we found across the big five books.','Under 5.5 assists at -115 · BetMGM','OFFICIAL PICK · NBA','Every pick graded in public'])assert.ok(pick.includes(t),t);
assert.ok(!pick.includes('Our chance'),'never "our chance": no stats means the price and what it pays');
assert.ok(card({sport:'NBA',title:'X Y',bet:'Over 2.5 rebounds',odds:'+145',spot:{oddsNum:145,book:'BetMGM',implied:'41%',chance:'43%'}}).includes('+$145'),'plus money pays');
const res=card({sport:'NBA',title:'Donovan Mitchell',bet:'Under 5.5 assists',odds:'-115',spot:{oddsNum:-115,book:'BetMGM',res:'won',actual:'4 assists',need:'needed 5 or fewer',money:'+$87',season:'29–32 · +$208'}});
for(const t of ['>HIT<','RESULT · NBA','4 assists','needed 5 or fewer','+$87','locked at -115','Season: 29–32 · +$208'])assert.ok(res.includes(t),t);
assert.ok(card({sport:'NFL',title:'Jordan Love',bet:'Under 1.5 passing touchdowns',odds:'42%',spot:{app:true,book:'Novig',odds:'42%',chance:'44%',res:'lost',actual:'2 TD passes',need:'needed 1 or fewer',money:'-$100'}}).includes('>MISS<'),'misses get the same card');
const app=card({sport:'NFL',title:'Jordan Love',bet:'Under 1.5 passing touchdowns',odds:'42%',pill:{label:'PREDICTION PICK'},spot:{app:true,book:'Novig',odds:'42%',chance:'44%'}});
assert.ok(app.includes('Price on Novig')&&app.includes('what you pay')&&app.includes('Prediction app · 18+/21+')&&!app.includes('Our chance'));
// Matchup boxes (Oct 31): opponent allowed by position with its rank, and the last meetings.
const mu=card({sport:'NBA',title:'Donovan Mitchell',bet:'Under 5.5 assists',odds:'-115',spot:{oddsNum:-115,book:'BetMGM',implied:'53%',chance:'55%',market:'Assists',matchup:{opponent:'Atlanta Hawks',pos:'guards',def:{allowed:11.4,rank:6,teams:30,games:5,league:13,span:'this season'},h2h:[4,6,3]}}});
for(const t of ['Hawks allow','11.4','to guards a game · 6th fewest','Mitchell vs Hawks','4.3','assists, last 3 meetings: 4, 6, 3','Hawks allow the 6th fewest assists to guards.','Under 5.5 assists at -115 · BetMGM'])assert.ok(mu.includes(t),t);
assert.ok(!mu.includes('Our chance it hits'),'matchup replaces our chance');
// The ladder skips a stat that doesn't back the bet and takes the next one.
const logs=[6,7,4,8,7,5,9,6,3,7].map(v=>({v,h:1,s:2026}));
const lad=card({sport:'NBA',title:'Jalen Brunson',bet:'Over 5.5 assists',odds:'-110',spot:{oddsNum:-110,book:'FanDuel',implied:'52%',market:'Assists',matchup:{opponent:'Boston Celtics',pos:'guards',def:{allowed:10.1,rank:3,teams:30,games:6,league:12.6,span:'this season'},h2h:[4,5],logs,home:1}}});
assert.ok(!lad.includes('Celtics allow')&&!lad.includes('Brunson vs Celtics'),'defense and meetings cut against the Over: skipped');
assert.ok(lad.includes('Last 10 games')&&lad.includes('7/10')&&lad.includes('Over 5.5 in 7 of his last 10.')&&lad.includes('His typical game')&&lad.includes('6.5')&&!lad.includes('Last 5 average'),'hit rate, then typical game (last-5 average is off the ladder)');
const soft=card({sport:'NBA',title:'Rui Hachimura',bet:'Over 4.5 rebounds',odds:'-105',spot:{oddsNum:-105,book:'BetMGM',implied:'51%',market:'Rebounds',matchup:{opponent:'Minnesota Timberwolves',pos:'forwards',def:{allowed:19.8,rank:27,teams:30,games:82,league:17.5,span:'last season'},h2h:[]}}});
assert.ok(soft.includes('4th most · last season')&&soft.includes('BetMGM price')&&soft.includes('the price says 51%'),'no meetings: price box');
// A 1.1x-league-average defense or better is the bar; 1.05x isn't strong enough.
assert.ok(!card({sport:'NBA',title:'R H',bet:'Over 4.5 rebounds',odds:'-105',spot:{oddsNum:-105,book:'BetMGM',implied:'51%',market:'Rebounds',matchup:{opponent:'Minnesota Timberwolves',pos:'forwards',def:{allowed:19,rank:20,teams:30,games:8,league:18.1,span:'this season'},h2h:[]}}}).includes('Timberwolves allow'),'weak defense edge skipped');
// Signals (Oct 31 audit): hit rate >=60% of last ~20, median of last 10 on our side, defense 10%+ our way.
const sig=JSON.parse(run(`JSON.stringify(pickSignals(${JSON.stringify({logs,def:{allowed:14,league:12.6}})},'Over',5.5))`));
assert.deepEqual(sig.list,['hit','median','def']);assert.equal(sig.count,3);
const none=JSON.parse(run(`JSON.stringify(pickSignals(${JSON.stringify({logs,def:{allowed:12.6,league:12.6}})},'Under',5.5))`));
assert.equal(none.count,0);assert.ok(none.known,'known stats with no signal: held');
assert.equal(JSON.parse(run(`JSON.stringify(pickSignals(null,'Over',5.5))`)).known,false,'no stats: allowed through');
assert.ok(card({sport:'NBA',title:'Jalen Brunson',bet:'Over 5.5 assists',odds:'-110',pill:{label:'OFFICIAL PICK'},spot:{oddsNum:-110,book:'FanDuel',implied:'52%',market:'Assists',signals:2,matchup:{logs}}}).includes('STRONG PICK · NBA'),'2+ signals: strong pick kicker');
assert.equal(run('xOrd(1)+xOrd(2)+xOrd(3)+xOrd(11)+xOrd(22)'),'1st2nd3rd11th22nd');
// Parlays and cards without price data keep the wide card; X_SPOT off restores it.
assert.match(card({parlay:true,title:'2-leg parlay',legs:[{text:'A',odds:'+100'}],odds:'+264'}),/height="675"/);
run('X_SPOT=false');assert.match(card({sport:'NBA',title:'A B',bet:'Over 1.5',odds:'-110',spot:{oddsNum:-110}}),/height="675"/);
console.log('PASS: pick spotlight graphic (price, our chance, payout; HIT/MISS result with stat and money; prediction-app wording; stat ladder (only stats that back the bet, then price and payout, never our chance); parlays and X_SPOT off keep the wide card)');
