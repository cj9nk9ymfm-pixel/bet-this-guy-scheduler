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
assert.match(pick,/width="1200" height="1200"/);for(const t of ['Donovan','Mitchell','UNDER 5.5 assists','BetMGM price','-115','the price says 53%','Our chance it hits','55%','The price says 53%. We say 55%.','Bet $115 to win $100.','OFFICIAL PICK · NBA','Every pick graded in public'])assert.ok(pick.includes(t),t);
assert.ok(card({sport:'NBA',title:'X Y',bet:'Over 2.5 rebounds',odds:'+145',spot:{oddsNum:145,book:'BetMGM',implied:'41%',chance:'43%'}}).includes('Bet $100 to win $145.'),'plus money pays');
const res=card({sport:'NBA',title:'Donovan Mitchell',bet:'Under 5.5 assists',odds:'-115',spot:{oddsNum:-115,book:'BetMGM',res:'won',actual:'4 assists',need:'needed 5 or fewer',money:'+$87',season:'29–32 · +$208'}});
for(const t of ['>HIT<','RESULT · NBA','4 assists','needed 5 or fewer','+$87','locked at -115','Season: 29–32 · +$208'])assert.ok(res.includes(t),t);
assert.ok(card({sport:'NFL',title:'Jordan Love',bet:'Under 1.5 passing touchdowns',odds:'42%',spot:{app:true,book:'Novig',odds:'42%',chance:'44%',res:'lost',actual:'2 TD passes',need:'needed 1 or fewer',money:'-$100'}}).includes('>MISS<'),'misses get the same card');
const app=card({sport:'NFL',title:'Jordan Love',bet:'Under 1.5 passing touchdowns',odds:'42%',pill:{label:'PREDICTION PICK'},spot:{app:true,book:'Novig',odds:'42%',chance:'44%'}});
assert.ok(app.includes('Price on Novig')&&app.includes('what you pay')&&app.includes('Pay 42% for a 44% shot.')&&app.includes('Prediction app · 18+/21+'));
// Parlays and cards without price data keep the wide card; X_SPOT off restores it.
assert.match(card({parlay:true,title:'2-leg parlay',legs:[{text:'A',odds:'+100'}],odds:'+264'}),/height="675"/);
run('X_SPOT=false');assert.match(card({sport:'NBA',title:'A B',bet:'Over 1.5',odds:'-110',spot:{oddsNum:-110}}),/height="675"/);
console.log('PASS: pick spotlight graphic (price, our chance, payout; HIT/MISS result with stat and money; prediction-app wording; parlays and X_SPOT off keep the wide card)');
