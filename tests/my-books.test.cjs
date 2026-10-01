const assert=require('node:assert/strict');
const {client}=require('./helpers/client.cjs');
// The fair price always comes from every book (3+ pricing both sides); a viewer
// who picked their own sportsbooks sees each prop priced and rated at those books.
const kickoff=new Date(Date.now()+6*3600000).toISOString();
const book=(key,title,over,under)=>({key,title,markets:[{key:'player_receptions',outcomes:[{name:'Over',description:'Pat Example',point:4.5,price:over},{name:'Under',description:'Pat Example',point:4.5,price:under}]}]});
const payload={data:[{id:'evt1',sport_key:'americanfootball_nfl',sport_title:'NFL',commence_time:kickoff,home_team:'Cleveland Browns',away_team:'Pittsburgh Steelers',bookmakers:[book('draftkings','DraftKings',-110,-110),book('betmgm','BetMGM',-110,-110),book('caesars','Caesars',-110,-110),book('fanduel','FanDuel',115,-140)]}]};
const rate=books=>{const c=client();c.eval(`preferences.books=${JSON.stringify(books)}`);c.ctx.payload=payload;const p=c.eval("normalizeLiveProps(payload).find(p=>p.player==='Pat Example')");return {p,verdict:p?c.eval(`propVerdict(${JSON.stringify(p)})?.key`):null}};
const all=rate([]);
assert.equal(all.p.pairedBooks,4,'all four books set the fair price');
assert.equal(all.p.bestBook,'FanDuel');assert.equal(all.verdict,'send','FanDuel +115 beats the market');
const fanduel=rate(['FanDuel']);
assert.ok(fanduel.p,'a one-book viewer still sees the prop');
assert.equal(fanduel.p.pairedBooks,4,'the fair price still uses every book, not just theirs');
assert.equal(fanduel.p.bestBook,'FanDuel');assert.equal(fanduel.p.over,115);
assert.equal(fanduel.verdict,'send','a FanDuel-only viewer is told FanDuel +115 is good value');
const mgm=rate(['BetMGM']);
assert.equal(mgm.p.bestBook,'BetMGM');assert.equal(mgm.p.over,-110);
assert.notEqual(mgm.verdict,'send','BetMGM at -110 is not good value just because FanDuel is');
const none=rate(['bet365']);
assert.equal(none.p,undefined,'a prop their book does not offer is not shown');
console.log('PASS: ratings use every book for the fair price, then price and rate each prop at the viewer\'s own sportsbooks (one-book viewers get real verdicts)');
