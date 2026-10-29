const assert=require('node:assert/strict'),vm=require('node:vm'),{webcrypto}=require('node:crypto');
const {read}=require('./helpers/client.cjs');
// The NFL official bar: 1% over fair, and 1.5% for receptions lines of 2.5 or
// less (Oct 26). Smaller edges stay in the near-miss test.
const context=vm.createContext({URL,URLSearchParams,Request,Response,Headers,AbortSignal,Date,console,setTimeout,clearTimeout,crypto:webcrypto,TextEncoder,btoa,atob});
const template=read('worker/index.template.js');
vm.runInContext(template.slice(template.indexOf('const API_BASE')).replace('__MOVEMENT_SERVER__',read('worker/movement.js')).replace('__LIVE_SERVER__',read('worker/live.js')).replace('__STATS_SHARED__',read('dist/stats.js')).replace('__RECORDS_SERVER__',read('worker/records.js')).replace('__ACCOUNTS_SERVER__',read('worker/accounts.js')).replace('export default {','this.worker={'),context);
const run=code=>vm.runInContext(code,context);
const now=Date.parse('2026-10-27T15:00:00Z'),fresh=new Date(now-60000).toISOString(),kickoff=new Date(now+2*86400000).toISOString();
// Three books at -110/-110 and DraftKings longer on the Over (same overall margin).
const market=(key,player,line,over,under)=>book=>({key,last_update:fresh,outcomes:[{name:'Over',description:player,point:line,price:book==='draftkings'?over:-110},{name:'Under',description:player,point:line,price:book==='draftkings'?under:-110}]});
const board=specs=>[{id:'g1',eventID:'NFL--g1',sport_label:'NFL',commence_time:kickoff,home_team:'Los Angeles Rams',away_team:'Seattle Seahawks',
  bookmakers:['fanduel','betmgm','williamhill_us','draftkings'].map(key=>({key,title:key,last_update:fresh,markets:specs.map(s=>s(key))}))}];
context.boards=board([
  market('player_receptions','Low Line',1.5,110,-133),        // ~1.2% edge, line 1.5: held back (needs 1.5%)
  market('player_receptions','Low Line Big',2.5,115,-140),    // ~2.1% edge, line 2.5: posts
  market('player_receptions','High Line',4.5,110,-133),       // ~1.2% edge, line 4.5: posts
  market('player_rush_attempts','Thin Edge',12.5,106,-128)]); // ~0.5% edge: under the 1% bar
const posted=JSON.parse(JSON.stringify(run(`officialCandidates(boards,${now},{},{min:OFFICIAL_MIN}).filter(officialBar).map(p=>p.player).sort()`)));
assert.equal(run('OFFICIAL_MIN'),1,'NFL bar is 1%');
assert.deepEqual(posted,['High Line','Low Line Big'],'1%+ posts; receptions at 2.5 or less need 1.5%');
const all=JSON.parse(JSON.stringify(run(`officialCandidates(boards,${now},{},{min:.25}).map(p=>p.player).sort()`)));
assert.ok(all.includes('Low Line')&&all.includes('Thin Edge'),'held-back picks are still candidates for the near-miss test');
// NBA three-point Overs need 2.5%; FanDuel needs 0.5 more in either sport.
const bar=(p,sport)=>run(`officialBarFor(${JSON.stringify(p)},'${sport}')`);
assert.equal(bar({market:'Rebounds',side:'Over',line:5.5,book:'DraftKings'},'NBA'),1,'NBA bar 1% (Oct 28)');
assert.equal(bar({market:'3-Pointers Made',side:'Over',line:2.5,book:'BetMGM'},'NBA'),2.5,'NBA three-point Overs need 2.5%');
assert.equal(bar({market:'3-Pointers Made',side:'Under',line:1.5,book:'BetMGM'},'NBA'),1,'three-point Unders use the NBA bar (1%)');
assert.equal(bar({market:'3-Pointers Made',side:'Over',line:2.5,book:'FanDuel'},'NBA'),3,'FanDuel adds 0.5');
// Paused pick types (deep audit, Oct 29) never clear the bar.
assert.equal(bar({market:'3-Pointers Made',side:'Over',line:1.5,book:'BetMGM'},'NBA'),Infinity,'NBA three-point Overs at 1.5 paused');
assert.equal(bar({market:'Points',side:'Under',line:11.5,book:'BetMGM'},'NBA'),Infinity,'NBA points lines under 12 paused');
assert.equal(bar({market:'Points',side:'Over',line:12.5,book:'BetMGM'},'NBA'),1,'NBA points at 12+ use the NBA bar');
assert.equal(bar({market:'Rushing Yards',side:'Over',line:55.5,book:'BetMGM'},'NFL'),Infinity,'NFL rushing-yards Overs paused');
assert.equal(bar({market:'Rushing Yards',side:'Under',line:55.5,book:'BetMGM'},'NFL'),1,'NFL rushing-yards Unders still post');
assert.equal(bar({market:'Kicking Points',side:'Over',line:7.5,book:'BetMGM'},'NFL'),Infinity,'NFL kicking-points Overs paused');
assert.equal(bar({market:'Field Goals Made',side:'Under',line:1.5,book:'BetMGM'},'NFL'),Infinity,'NFL field-goal Unders paused');
// Longshots (+150 up) need a recent sharp price on the same side and line.
const gt='2026-10-28T23:00:00.000Z',pick=(odds,line=4.5)=>({player:'Ace Guard',market:'Assists',side:'Over',line,odds,gameTime:gt});
context.priced=new Set([run(`longshotKey(${JSON.stringify(pick(160))})`)]);
assert.equal(run(`longshotOk(priced)(${JSON.stringify(pick(160))})`),true,'priced longshot posts');
assert.equal(run(`longshotOk(priced)(${JSON.stringify(pick(160,5.5))})`),false,'longshot with no sharp price at that line is held');
assert.equal(run(`longshotOk(new Set())(${JSON.stringify(pick(149))})`),true,'under +150 needs no sharp price');
// Power and Shin de-vig: same as the plain split at even prices, and they shade the longshot down.
assert.ok(Math.abs(run('devigPower(-110,-110)')-.5)<1e-9&&Math.abs(run('devigShin(-110,-110)')-.5)<1e-9,'even prices split 50/50');
const plain=(1/2.6)/((1/2.6)+(1/(1+100/190)));
assert.ok(run('devigPower(160,-190)')<plain&&run('devigShin(160,-190)')<plain,'power and Shin give the +160 side less than the plain split');
assert.equal(bar({market:'Receptions',side:'Under',line:1.5,book:'FanDuel'},'NFL'),2,'NFL low receptions at FanDuel: 1.5 + 0.5');
assert.equal(bar({market:'Passing Touchdowns',side:'Over',line:1.5,book:'fanduel'},'NFL'),1.5,'NFL at FanDuel: 1 + 0.5');
// A FanDuel price 1.25% over fair no longer posts in the NFL.
context.fdBoards=board([market('player_receptions','FanDuel Edge',4.5,110,-133)]).map(e=>({...e,bookmakers:e.bookmakers.map(b=>b.key==='draftkings'?{...b,key:'fanduel',title:'FanDuel'}:b.key==='fanduel'?{...b,key:'draftkings',title:'DraftKings'}:b)}));
const fd=JSON.parse(JSON.stringify(run(`officialCandidates(fdBoards,${now},{},{min:OFFICIAL_MIN})`)));
assert.equal(fd.length,1);assert.equal(fd[0].book,'FanDuel');
assert.equal(JSON.parse(JSON.stringify(run(`officialCandidates(fdBoards,${now},{},{min:OFFICIAL_MIN}).filter(officialBar).length`))),0,'FanDuel at 1.25% is held back');
console.log('PASS: NFL official bar 1% (receptions at 2.5 or less 1.5%), NBA 1% with three-point Overs 2.5%, paused pick types, the longshot sharp-price rule, power/Shin de-vig, FanDuel +0.5 in either sport; held-back picks stay near-miss candidates');
