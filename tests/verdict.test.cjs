const assert=require('node:assert/strict');
const {client}=require('./helpers/client.cjs');
const app=client(390);assert.equal(app.error,undefined,'app loads');
const run=code=>app.eval(code);
const prop=extra=>JSON.stringify({id:1,sport:'NFL',player:'Drake London',team:'Atlanta Falcons · @ Green Bay Packers',market:'Receptions',side:'Under',line:5.5,open:5.5,over:-120,under:135,rawEdge:1.4,pairedBooks:7,edge:1.4,time:'Fri 8:15 PM',startsAt:'2026-09-25T00:15:00Z',eventID:'NFL--e1',...extra});
const verdict=extra=>run(`propVerdict(${prop(extra)})?.label`);
// Same bar as official picks: 1%+ real edge with 3+ books pricing both sides.
assert.equal(verdict({}),'Bet This Guy');
assert.equal(verdict({pairedBooks:2}),'Coin Flip','an edge on too few books is not stamped');
assert.equal(verdict({rawEdge:0.99}),'Coin Flip');
assert.equal(verdict({rawEdge:-2.5}),'Coin Flip','the normal house cut is a coin flip, not a skip');
assert.equal(verdict({rawEdge:-3.5}),'Left on Read');
assert.equal(verdict({rawEdge:-4.3,pairedBooks:1}),'Left on Read');
assert.equal(verdict({rawEdge:undefined}),undefined,'no real edge (older cache or other feeds), no badge');
assert.equal(verdict({teamMarket:true}),undefined,'team markets get no player verdict');
// Plain-English bet sentence, using the visitor's typical wager.
const bet=extra=>run(`plainBet(${prop(extra)})`);
assert.equal(bet({}),'Bet $10 → win $13.50 if Drake London has 5 or fewer receptions.');
assert.equal(bet({side:'Over',over:-120}),'Bet $10 → win $8.33 if Drake London has 6+ receptions.');
assert.equal(bet({player:'Michael Penix Jr.',market:'Passing Touchdowns',line:0.5,under:205}),'Bet $10 → win $20.50 if Michael Penix Jr. has no passing touchdowns.');
assert.equal(bet({line:5,side:'Over',over:100}),'Bet $10 → win $10 if Drake London has more than 5 receptions.');
assert.equal(bet({market:'Anytime Touchdown',binary:true,side:'Over',over:150}),'Bet $10 → win $15 if Drake London scores a touchdown.');
run('preferences.typicalWager=25');
assert.equal(bet({}),'Bet $25 → win $33.75 if Drake London has 5 or fewer receptions.');
// "Why this guy?" never claims value the price doesn't have.
assert.match(run(`verdictPriceSentence(${prop({rawEdge:-1})})`),/Coin Flip — no edge either way/);
assert.match(run(`verdictPriceSentence(${prop({})})`),/earned a Bet This Guy/);
// Rank badges are only kept for stamped bets, and the verdict follows the pick row.
const html=extra=>run(`card(${prop(extra)},0,true)`);
assert.ok(!html({rawEdge:-1}).includes('top-play-badge'),'no "#1 TOP PLAY" without an edge');
assert.ok(html({}).includes('verdict-send'));
assert.ok(/<\/section><div class="verdict verdict-flip"/.test(html({rawEdge:-1})),'verdict sits right after the pick');
assert.ok(html({}).includes('Bet $25 → win $33.75'),'dollar amounts are inserted literally');
// Send to the chat: honest, ready-to-paste messages.
run('preferences.typicalWager=10');
assert.equal(run(`shareText(${prop({bestBook:'FanDuel'})})`),'✅ Bet This Guy: Drake London Under 5.5 Receptions (+135 at FanDuel). Bet $10 → win $13.50 if Drake London has 5 or fewer receptions.');
assert.match(run(`shareText(${prop({rawEdge:-1})})`),/^🪙 Coin Flip: .*Priced about right, no edge either way\. Bet \$10/);
assert.match(run(`shareText(${prop({rawEdge:-4})})`),/^👎 Left on Read: .*skip it\.$/);
assert.ok(html({rawEdge:-4}).includes('Warn the chat'));assert.ok(html({}).includes('Send to the chat'));
// Card market check in plain words.
assert.equal(run(`plainTrust({key:'verified',books:'8 books',freshness:'just now',stats:'Stats on tap'})`),'Checked 8 sportsbooks · just now');
assert.equal(run(`plainTrust({key:'limited',books:'1 books',freshness:'4 min ago',stats:'Order not verified'})`),'Only 1 sportsbook so far · 4 min ago · Touchdown order isn’t verified');
console.log('PASS: verdicts use the official 1%/3-book bar, plain bet sentences read correctly, and rank badges are only earned; share messages and card wording are plain');
