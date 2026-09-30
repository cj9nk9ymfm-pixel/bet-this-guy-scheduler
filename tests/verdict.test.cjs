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
assert.equal(bet({}),'Bet $100 → win $135 if Drake London has 5 or fewer receptions.','$100 is the default wager, so +135 reads as win $135');
assert.equal(bet({side:'Over',over:-120}),'Bet $100 → win $83.33 if Drake London has 6+ receptions.');
assert.equal(bet({player:'Michael Penix Jr.',market:'Passing Touchdowns',line:0.5,under:205}),'Bet $100 → win $205 if Michael Penix Jr. has no passing touchdowns.');
assert.equal(bet({line:5,side:'Over',over:100}),'Bet $100 → win $100 if Drake London has more than 5 receptions.');
assert.equal(bet({market:'Anytime Touchdown',binary:true,side:'Over',over:150}),'Bet $100 → win $150 if Drake London scores a touchdown.');
run('preferences.typicalWager=25');
assert.equal(bet({}),'Bet $25 → win $33.75 if Drake London has 5 or fewer receptions.');
// "Why this guy?" never claims value the price doesn't have.
assert.match(run(`verdictPriceSentence(${prop({rawEdge:-1})})`),/Coin Flip — no edge either way/);
assert.match(run(`verdictPriceSentence(${prop({})})`),/earned a Bet This Guy/);
// Compact cards: player, the bet + price, what $X wins and a verdict pill on
// the face; the full verdict, sources and "Why this guy?" open on tap.
const html=extra=>run(`card(${prop(extra)},0,true)`);
{const send=html({}),flip=html({rawEdge:-1}),read=html({rawEdge:-4});
 assert.ok(!send.includes('top-play-badge'),'the ✅ pill replaces the "#1 TOP PLAY" badge');
 assert.ok(send.includes('compact-card compact-send'));
 const face=send.slice(0,send.indexOf('<div class="card-more"'));
 assert.ok(face.includes('verdict-pill verdict-pill-send">✅ Bet This Guy'),'the verdict is a pill on the face');
 assert.ok(face.indexOf('<section class="mockup-pick">')<face.indexOf('class="card-money"'),'the money line follows the bet');
 assert.ok(face.includes('$25 wins $34'),'the face says what the usual wager wins, in whole dollars');
 assert.ok(!face.includes('class="verdict '),'the full verdict box is not on the face');
 const more=send.slice(send.indexOf('<div class="card-more"'));
 assert.ok(more.startsWith('<div class="card-more" hidden>'),'details start folded');
 for(const part of ['class="verdict verdict-','Bet $25 → win $33.75','data-share-prop','card-evidence','data-open-profile','featured-why'])assert.ok(more.includes(part),`details keep ${part}`);
 assert.equal((send.match(/class="verdict /g)||[]).length,1,'the verdict box appears once');
 assert.ok(!/Tap the (odds|price) to add/.test(send),'the add-to-slip tip is not repeated on every card');
 assert.ok(/player-photo" style="--avatar-hue:\d+"/.test(send),'avatars get a colour when no photo loads');
 assert.ok(flip.includes('verdict-pill-flip">🪙 Coin Flip'));
 assert.ok(read.includes('compact-read')&&read.includes('verdict-pill-read">👎 Skip')&&read.includes('The books are taking extra here'),'Left on Read folds to a skip line');
 const nested=send.match(/<div class="card-more"[\s\S]*<\/article>$/)[0],opens=(nested.match(/<div\b/g)||[]).length,closes=(nested.match(/<\/div>/g)||[]).length;
 assert.equal(opens,closes,'the lifted blocks keep their markup balanced')}
// Premade parlays never include a leg the board tells people to skip.
{const future=new Date(Date.now()+3*3600000).toISOString();
 assert.equal(run(`premadeEligible(${prop({rawEdge:-4,startsAt:future})})`),false,'a 👎 Left on Read leg never goes into a premade parlay');
 assert.equal(run(`premadeEligible(${prop({rawEdge:-1,startsAt:future})})`),true,'Coin Flips can');
 assert.equal(run(`premadeEligible(${prop({startsAt:future})})`),true,'Bet This Guy legs can')}
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
