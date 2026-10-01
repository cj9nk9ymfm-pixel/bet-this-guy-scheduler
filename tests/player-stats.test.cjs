const assert=require('node:assert/strict');
const {client}=require('./helpers/client.cjs');
// The player screen shows the numbers that match the player's position,
// read from the BALLDONTLIE field names.
const c=client(),P=c.eval('window.BTGPlayer');
const role=(abbr,position='',rows=[])=>P.roleOf({position_abbreviation:abbr,position},rows);
for(const abbr of ['CB','S','FS','SS','DE','DT','NT','LB','OLB','ILB','MLB','DB'])assert.equal(role(abbr),'DEF',`${abbr} is a defender`);
assert.equal(role('','Cornerback'),'DEF');assert.equal(role('','Safety'),'DEF');
assert.equal(role('PK','Place Kicker'),'K');assert.equal(role('P','Punter'),'P');
assert.equal(role('QB'),'QB');assert.equal(role('FB'),'RB');assert.equal(role('TE'),'TE');
assert.equal(role('OT','Offensive Tackle',[{row:{total_tackles:3}}]),'DEF','an unknown position follows the box score it fills');

const KC={id:13,abbreviation:'KC',full_name:'Kansas City Chiefs'},LV={id:14,abbreviation:'LV',full_name:'Las Vegas Raiders'},DEN={id:10,abbreviation:'DEN',full_name:'Denver Broncos'};
const player={first_name:'Trent',last_name:'McDuffie',position:'Cornerback',position_abbreviation:'CB',jersey_number:'22',team:KC};
const game=(id,week,home,away,hs,as,date,season=2026)=>({id,week,season,postseason:false,date,status:'Final',home_team:home,visitor_team:away,home_team_score:hs,visitor_team_score:as});
// `sacks` is sacks a quarterback took; a defender's sacks are `defensive_sacks`.
const rows=[
  {player,team:KC,game:game(1,1,LV,KC,17,24,'2026-09-07T17:00:00Z'),total_tackles:6,solo_tackles:4,defensive_sacks:1,sacks:0,passes_defended:2,defensive_interceptions:0,qb_hits:1,interception_touchdowns:0,fumbles_touchdowns:0},
  {player,team:KC,game:game(2,2,KC,DEN,20,27,'2026-09-14T17:00:00Z'),total_tackles:3,solo_tackles:3,defensive_sacks:0,sacks:0,passes_defended:1,defensive_interceptions:1,interception_touchdowns:1,fumbles_touchdowns:0},
].map(row=>({row,date:new Date(row.game.date)}));
assert.equal(P.seasonTotals(rows,'tkl').total,9);assert.equal(P.seasonTotals(rows,'tkl').perGame,4.5);
assert.equal(P.seasonTotals(rows,'sck').total,1,'defender sacks come from defensive_sacks');
assert.equal(P.seasonTotals(rows,'ast').total,2,'assists are total minus solo');
assert.equal(P.seasonTotals(rows,'defTd').total,1);
const first=P.gameInfo(rows[0].row,player),second=P.gameInfo(rows[1].row,player);
assert.deepEqual([first.at,first.opp,first.result,first.score],['@','LV','W','24–17']);
assert.deepEqual([second.at,second.opp,second.result,second.score],['vs','DEN','L','20–27']);
// Touchdown bets use every touchdown the feed reports.
assert.equal(P.betMetric({market:'Anytime Touchdown',side:'Over',line:.5,binary:true},{rushing_touchdowns:1,receiving_touchdowns:1}),2);

const q={id:1,sport:'NFL',player:'Trent McDuffie',team:'Kansas City Chiefs · @ Las Vegas Raiders',market:'Tackles + Assists',line:4.5,side:'Over',over:-115,under:-105};
P.render(q,{player,stats:rows.map(x=>x.row)});
const html=c.eval("document.querySelector('#playerProfile').innerHTML");
for(const text of ['Trent McDuffie','CB · #22 · Kansas City Chiefs','Over 4.5 tackles + assists','Total tackles','Sacks','Passes defended','Interceptions','Defense','1/2'])assert.ok(html.includes(text),`the cornerback screen shows "${text}"`);
for(const text of ['Passing yards','Rushing yards','Receiving yards','PASS YDS'])assert.ok(!html.includes(text),`the cornerback screen hides "${text}"`);
console.log('PASS: player stats follow the player’s position and the feed’s field names');
