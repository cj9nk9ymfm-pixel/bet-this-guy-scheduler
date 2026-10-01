const assert=require('node:assert/strict'),vm=require('node:vm');
const {read,client}=require('./helpers/client.cjs');
// The home banner must report exactly what the public record says.
const c=client();
const rows=JSON.parse(read('tests/fixtures/week3-record.json'));
const {summarise,currentWeek}=c.eval('window.BTGFirstImpression');
assert.equal(currentWeek(Date.parse('2026-09-30T04:00:00Z')),'2026-09-29','Wednesday is in the new official week');
assert.equal(currentWeek(Date.parse('2026-09-29T03:00:00Z')),'2026-09-22','Monday night stays in the old week');
const s=summarise(rows,Date.parse('2026-09-30T04:00:00Z'));
assert.equal(s.label,'LAST WEEK');
assert.deepEqual([s.wins,s.losses,s.pushes],[14,7,0],'Week 3 singles went 14–7');
assert.equal(Math.round(s.profit),1014,'+$1,014 betting $100 a pick');
assert.deepEqual([s.parlayWins,s.parlayLosses,Math.round(s.parlayProfit)],[7,6,1783]);
assert.equal(s.tracked,20,'the pick without a captured close is not counted');
assert.equal(s.beat,14,'14 picks beat the closing line');
assert.equal(s.hits.length,12);assert.ok(s.hits.every(r=>r.result==='won'));
assert.equal(JSON.stringify(s.hits.slice(0,4).map(r=>r.kind==='parlay'?r.combined_odds:r.odds)),'[175,418,175,362]','singles and parlays alternate, biggest payouts first');
// Mid-week of a new slate, last week is still the headline until the new one has volume.
const early=summarise([...rows,{id:'official|2026-09-29|props|prop|x',kind:'prop',odds:110,status:'final',result:'won'}],Date.parse('2026-10-02T04:00:00Z'));
assert.equal(early.week,'2026-09-22');
assert.equal(summarise([],Date.now()),null,'no record, no numbers');
const provisional=summarise(rows.map(r=>({...r,status:'provisional'})),Date.parse('2026-09-30T04:00:00Z'));
assert.equal(provisional,null,'unconfirmed results never reach the banner');
assert.equal(c.eval("mobileSwipeBlocked({closest:selector=>selector.split(',').includes('.hits-row')?{}:null})"),true,'swiping the hits strip scrolls it instead of changing page');
assert.equal(c.eval("mobileSwipeBlocked({closest:()=>null})"),false,'swiping elsewhere still changes page');
// Tapping a hit shows exactly what the bet was and how its price moved.
const goffNabers={id:'official|2026-09-22|reasonable|parlay|x',kind:'parlay',combined_odds:418,status:'final',result:'won',posted_at:'2026-09-27T15:03:15.164Z',legs_json:JSON.stringify([
  {player:'Jared Goff',market:'Rushing Yards',side:'Over',line:0.5,odds:130,team:'New York Jets · @ Detroit Lions',gameTime:'2026-09-27T17:00:00.000Z',book:'BetRivers',closingLine:0.5,closingOdds:125,closingCapturedAt:'2026-09-27T16:41:28.262Z',result:'won',actualValue:6},
  {player:'Malik Nabers',market:'Receptions',side:'Over',line:4.5,odds:125,team:'Tennessee Titans · @ New York Giants',gameTime:'2026-09-27T17:00:00.000Z',book:'BetMGM',closingLine:4.5,closingOdds:110,closingCapturedAt:'2026-09-27T16:41:28.262Z',result:'won',actualValue:5}])};
const parlay=c.eval('window.BTGFirstImpression').hitDetails(goffNabers);
for(const text of ['2-LEG PARLAY','Jared Goff','Over 0.5 Rushing Yards','6 rushing yards','+130 at BetRivers','Posted +130 → final +125 · Better than the final price','Malik Nabers','5 receptions','+$418'])assert.ok(parlay.includes(text),`parlay details show "${text}"`);
const jonnu={id:'official|2026-09-22|props|prop|x',kind:'prop',player:'Jonnu Smith',market:'Receptions',side:'Over',line:1.5,odds:175,status:'final',result:'won',posted_at:'2026-09-24T05:01:17.073Z',closing_line:1.5,closing_odds:154,closing_captured_at:'2026-09-24T23:55:25.398Z',legs_json:JSON.stringify([{player:'Jonnu Smith',market:'Receptions',side:'Over',line:1.5,odds:175,team:'Atlanta Falcons · @ Green Bay Packers',gameTime:'2026-09-25T00:15:00.000Z',book:'BetMGM',result:'won',actualValue:2}])};
const single=c.eval('window.BTGFirstImpression').hitDetails(jonnu);
for(const text of ['SINGLE','Jonnu Smith','2 receptions','+175 at BetMGM','Posted +175 → final +154 · Better than the final price','+$175'])assert.ok(single.includes(text),`single details show "${text}"`);
assert.ok(!single.includes('hit-spark"'),'no chart without a price trail');
const trailed={...jonnu,legs_json:JSON.stringify([{...JSON.parse(jonnu.legs_json)[0],priceTrail:[{t:Date.parse('2026-09-24T12:00:00Z'),o:165,l:1.5,m:165},{t:Date.parse('2026-09-24T18:00:00Z'),o:160,l:1.5,m:160}]}])};
assert.ok(c.eval('window.BTGFirstImpression').hitDetails(trailed).includes('class="hit-spark"'),'a recorded price trail draws the movement chart');
const moved=c.eval('window.BTGFirstImpression').hitDetails({...jonnu,side:'Under',line:34.5,market:'Rushing Yards',closing_line:37.5,closing_odds:-111});
assert.ok(moved.includes('Line moved to 37.5 before kickoff (against you)'));
assert.ok(c.eval('window.BTGFirstImpression').hitDetails({...jonnu,closing_odds:null,closing_captured_at:null}).includes('wasn’t recorded'),'a missing close says so plainly');
// Every pick in this week's list opens: a locked pick shows its price, book, why it qualified and where the price is now.
{const fi=c.eval('window.BTGFirstImpression'),locked={id:'official|2026-09-29|props|prop|y',kind:'prop',player:'Saquon Barkley',market:'Anytime Touchdown',side:'Over',line:.5,odds:-140,status:'pending',result:null,posted_at:'2026-10-01T15:00:00Z',game_time:'2026-10-04T17:00:00Z',legs_json:JSON.stringify([{player:'Saquon Barkley',market:'Anytime Touchdown',side:'Over',line:.5,odds:-140,book:'FanDuel',edge:2.3,team:'Philadelphia Eagles · @ Dallas Cowboys',gameTime:'2026-10-04T17:00:00Z',priceTrail:[{t:Date.parse('2026-10-01T16:00:00Z'),o:-150},{t:Date.parse('2026-10-01T17:00:00Z'),o:-155}]}])};
 const html=fi.pickDetails(locked);
 for(const text of ['LOCKED · SINGLE','Saquon Barkley','Anytime Touchdown','-140 at FanDuel','Beat the market’s fair price by 2.3%','-155','you locked a better price','wins $71','class="hit-spark"'])assert.ok(html.includes(text),`locked pick details show "${text}"`);
 assert.ok(!html.includes('HIT ·'),'a locked pick is not labelled a hit');
 assert.ok(fi.pickDetails({...locked,status:'final',result:'lost'}).includes('LOST · SINGLE'),'a lost pick says so');
 assert.ok(fi.pickDetails({...locked,status:'final',result:'won'}).includes('HIT · SINGLE'),'a won pick keeps the hit sheet');}
// $100 is the default wager everywhere; viewers on the old $10 default move once,
// and a wager chosen afterwards is kept.
assert.equal(client().eval('preferences.typicalWager'),100,'new visitors start at $100');
assert.equal(client(390,{'bet-this-guy-preferences':JSON.stringify({typicalWager:10})}).eval('preferences.typicalWager'),100,'the old $10 default moves to $100');
assert.equal(client(390,{'bet-this-guy-preferences':JSON.stringify({typicalWager:10,wagerDefault100:true})}).eval('preferences.typicalWager'),10,'a $10 wager chosen after the switch is kept');
assert.equal(client(390,{'bet-this-guy-preferences':JSON.stringify({typicalWager:25})}).eval('preferences.typicalWager'),25,'custom wagers are kept');
const twenty=summarise(rows,Date.parse('2026-09-30T04:00:00Z'),20);
assert.equal(Math.round(twenty.profit),203,'the banner follows the viewer wager: +$203 at $20 a pick');
assert.equal(Math.round(summarise(rows,Date.parse('2026-09-30T04:00:00Z')).profit),1014,'and stays +$1,014 at the $100 default');
console.log('PASS: home banner matches the public record (Week 3: 14–7, +$1,014, beat the close 14 of 20, parlays 7–6), shows last week until the new week has volume, ignores unconfirmed results, the hits strip swipes on its own, and each hit opens its exact bet, result and price movement, all at the viewer wager ($100 by default)');
