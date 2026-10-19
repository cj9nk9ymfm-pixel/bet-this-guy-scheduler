const assert=require('node:assert/strict'),vm=require('node:vm'),{webcrypto}=require('node:crypto');
const {read}=require('./helpers/client.cjs');
// Parlays never take both sides of a prop, and a prediction-market game carries
// at most 3 parlays (Oct 12: a one-game night filled 8, one with Kyren Williams
// Under 22.5 receiving yards after another had his Over).
const context=vm.createContext({URL,URLSearchParams,Request,Response,Headers,AbortSignal,Date,console,setTimeout,clearTimeout,crypto:webcrypto,TextEncoder,btoa,atob});
const t=read('worker/index.template.js');
vm.runInContext(t.slice(t.indexOf('const API_BASE')).replace('__MOVEMENT_SERVER__',read('worker/movement.js')).replace('__LIVE_SERVER__',read('worker/live.js')).replace('__STATS_SHARED__',read('dist/stats.js')).replace('__RECORDS_SERVER__',read('worker/records.js')).replace('__ACCOUNTS_SERVER__',read('worker/accounts.js')).replace('export default {','this.worker={'),context);
const ev='NFL--g',gt='2026-10-13T00:15:00.000Z',now=Date.parse('2026-10-12T23:00:00Z');
const leg=(player,market,side,line,odds,team)=>({exchange:'ProphetX',eventId:ev,player,market,side,line,odds,netOdds:odds,edge:.8,gameTime:gt,playerTeam:team});
const pool=[leg('Dalton Kincaid','Receptions','Under',4.5,-111,'BUF'),leg('Kyren Williams','Receiving Yards','Under',22.5,104,'LAR'),leg('James Cook','Receptions','Over',1.5,-113,'BUF'),leg('Jordan Whittington','Receiving Yards','Over',5.5,102,'LAR'),leg('Blake Corum','Receiving Yards','Over',2.5,108,'LAR'),leg('Matthew Stafford','Passing Touchdowns','Over',2.5,141,'LAR'),leg('Dawson Knox','Receptions','Under',1.5,-122,'BUF')];
const existing=[{tier:'short',legs_json:JSON.stringify([leg('Dawson Knox','Receptions','Under',1.5,-122,'BUF'),leg('Kyren Williams','Receiving Yards','Over',22.5,100,'LAR')])}];
context.pool=pool;context.existing=existing;
const plan=JSON.parse(JSON.stringify(vm.runInContext(`predictionParlayPlan(pool,existing,'2026-10-06',${now})`,context)));
assert.ok(plan.length>=1&&plan.length<=2,`one game: 3 parlays at most, counting the one already posted (got ${plan.length} new)`);
assert.ok(plan.every(p=>!p.legs.some(l=>l.player==='Kyren Williams'&&l.side==='Under')),'never the other side of a prop already in a parlay');
// Sportsbook parlays: same rule.
const sb=(player,game,side)=>({player,gameId:'NFL--'+game,gameTime:gt,market:'Receptions',side,line:3.5,odds:110,edge:.8,playerKey:'NFL--'+game+'|'+player.toLowerCase()});
context.cands=[];context.legPool=[sb('A','a','Under'),sb('B','b','Over'),sb('C','c','Over'),sb('D','d','Over')];
context.saved=[{id:'official|2026-10-06|reasonable|parlay|x',kind:'parlay',game_id:'NFL--a',legs_json:JSON.stringify([sb('A','a','Over'),sb('E','e','Over')])}];
const sbPlan=JSON.parse(JSON.stringify(vm.runInContext(`officialPlan(cands,saved,'2026-10-06',${now},legPool)`,context)));
assert.ok(sbPlan.length>0&&sbPlan.every(p=>!p.legs.some(l=>l.player==='A')),'sportsbook parlays never flip a prop either');
console.log('PASS: parlays never take both sides of a prop, and a prediction-market game gets at most 3 parlays');
