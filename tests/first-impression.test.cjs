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
console.log('PASS: home banner matches the public record (Week 3: 14–7, +$1,014, beat the close 14 of 20, parlays 7–6), shows last week until the new week has volume, and ignores unconfirmed results');
