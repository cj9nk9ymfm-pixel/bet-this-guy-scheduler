const assert=require('node:assert/strict'),vm=require('node:vm');
const {read}=require('./helpers/client.cjs');
const page=read('dist/trust.html'),start=page.indexOf('// CLV-START'),end=page.indexOf('// CLV-END');
assert.ok(start>0&&end>start,'closing-value block is marked in trust.html');
const helpers=page.match(/const parsedLegs=[^\n]*;/)[0]+'\n'+page.match(/const decimal=[^\n]*;/)[0];
const context=vm.createContext({});vm.runInContext(helpers+'\n'+page.slice(start,end)+'\nthis.closingValue=closingValue;this.closingSummary=closingSummary;this.closingVerdict=closingVerdict;this.americanFromDecimal=americanFromDecimal;',context);
const {closingValue,closingSummary,closingVerdict,americanFromDecimal}=context;
const prop=(odds,closing_odds,extra={})=>({kind:'prop',line:55.5,odds,closing_odds,closing_line:55.5,closing_captured_at:'2026-09-25T00:00:00Z',...extra});
// -110 posted, best close -125: the posted price paid more, so it beat the close.
const beat=closingValue(prop(-110,-125));assert.ok(beat.edge>0);assert.equal(closingVerdict(beat).label,'Better than the final price');
assert.ok(Math.abs(beat.edge-((1+100/110)/(1+100/125)-1)*100)<1e-9);
assert.equal(closingVerdict(closingValue(prop(+120,+140))).label,'Worse than the final price');
assert.equal(closingVerdict(closingValue(prop(-110,-110))).label,'Same as the final price');
assert.equal(closingValue(prop(-110,null)),null,'no closing price, no value');
assert.equal(closingValue(prop(-110,-125,{closing_captured_at:null})),null,'not captured yet');
assert.equal(closingValue(prop(-110,-125,{closing_line:57.5})),null,'a different closing line is not compared');
// Parlays compare combined odds and need every leg's closing price.
const legs=[{odds:-110,closingOdds:-120},{odds:+150,closingOdds:+130}];
const parlay=closingValue({kind:'parlay',legs_json:JSON.stringify(legs)});
assert.ok(Math.abs(parlay.posted-(1+100/110)*2.5)<1e-9);assert.ok(Math.abs(parlay.close-(1+100/120)*2.3)<1e-9);assert.ok(parlay.edge>0);
assert.equal(closingValue({kind:'parlay',legs_json:JSON.stringify([legs[0],{odds:+150}])}),null,'a leg without a closing price leaves the parlay untracked');
const summary=closingSummary([prop(-110,-125),prop(+120,+140),prop(-110,-110),prop(-110,null)]);
assert.equal(summary.tracked,3);assert.equal(summary.beat,1);
assert.equal(americanFromDecimal(2.5),'150');assert.equal(americanFromDecimal(1+100/110),'-110');
console.log('PASS: closing-line value compares posted and best closing prices for props and parlays, and skips picks without a comparable close');
