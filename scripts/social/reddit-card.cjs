// Reddit picks card (1080 wide, sized for phones). Picks come from a JSON file
// built from public_recommendations (price now = last priceTrail point).
// Usage: node reddit.cjs picks.json out.svg   (picks.json: {date,kick,record,profit,clv,picks:[{player,side,line,market,odds,book,team,now,nowLine}]})
const fs=require('fs');const D=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const M='#2ee6a8',F={g:'BTG Grotesk',xb:'BTG Inter XB',sb:'BTG Inter SB'},W=1080,R=W-64,L=64;
const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;');
const fmt=o=>o==null?'—':o>0?`+${o}`:`${o}`;
const dec=o=>o>0?1+o/100:1+100/-o;
const nick=t=>{const ab={'Houston Texans':'HOU','Tennessee Titans':'TEN','Las Vegas Raiders':'LV','New England Patriots':'NE','Cincinnati Bengals':'CIN','Miami Dolphins':'MIA','Cleveland Browns':'CLE','New York Jets':'NYJ'};const [a,h]=String(t).split(/\s*·\s*@\s*/);return `${ab[a]||a} @ ${ab[h]||h}`};
const short=m=>({Receptions:'rec','Receiving Yards':'rec yds','Rushing Yards':'rush yds','Passing Yards':'pass yds'}[m]||m.toLowerCase());
const picks=D.picks,top=470,rh=106,H=top+picks.length*rh+250;
const moved=picks.filter(p=>p.now!=null&&dec(p.now)<dec(p.odds)).length;
const rows=picks.map((p,i)=>{const y=top+i*rh,over=p.side==='Over',c=over?M:'#7cc4ff';
  const nowTxt=p.nowLine!=null&&p.nowLine!==p.line?`${p.side==='Over'?'o':'u'}${p.nowLine}`:fmt(p.now);
  const worse=p.now!=null&&dec(p.now)<dec(p.odds);
  return `<rect x="${L}" y="${y}" width="${R-L}" height="${rh-14}" rx="18" fill="#16203a"/><rect x="${L}" y="${y}" width="8" height="${rh-14}" rx="4" fill="${c}"/>
<text x="${L+32}" y="${y+40}" font-family="${F.g}" font-size="32" fill="#ffffff">${esc(p.player)}</text>
<text x="${L+32}" y="${y+72}" font-family="${F.sb}" font-size="22" fill="${c}">${esc(`${p.side} ${p.line} ${short(p.market)}`)}<tspan fill="#9fb0cc">&#160;· ${esc(nick(p.team))} · ${esc(p.book)}</tspan></text>
<text x="${R-170}" y="${y+56}" text-anchor="end" font-family="${F.xb}" font-size="32" fill="#ffffff">${esc(fmt(p.odds))}</text>
<text x="${R-28}" y="${y+56}" text-anchor="end" font-family="${F.xb}" font-size="28" fill="${worse?'#9fb0cc':M}">${esc(nowTxt)}</text>`}).join('');
const stat=(x,big,label,c)=>`<rect x="${x}" y="246" width="296" height="128" rx="18" fill="#16203a" stroke="#ffffff" stroke-opacity=".08"/><text x="${x+26}" y="310" font-family="${F.g}" font-size="46" fill="${c||'#ffffff'}">${esc(big)}</text><text x="${x+26}" y="348" font-family="${F.sb}" font-size="21" fill="#9fb0cc">${esc(label)}</text>`;
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d4ed8"/><stop offset="${(400/H).toFixed(2)}" stop-color="#0b1530"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="#0b1530"/><rect width="${W}" height="${H}" fill="url(#bg)"/>
<text x="${L}" y="96" font-family="${F.xb}" font-size="22" letter-spacing="4" fill="#ffffff" fill-opacity=".8">${esc(D.date)} · ${esc(D.kick)}</text>
<text x="${L-4}" y="186" font-family="${F.g}" font-size="76" fill="#ffffff">${picks.length} player props</text>
${stat(L,D.record,'singles record')}${stat(L+(R-L-296)/2,D.profit,'singles at $100',M)}${stat(R-296,D.clv,'beat the closing price')}
<text x="${L}" y="420" font-family="${F.sb}" font-size="23" fill="#ffffff">${moved} of ${picks.length} prices have moved our way since we locked them.</text>
<text x="${R-170}" y="456" text-anchor="end" font-family="${F.xb}" font-size="17" letter-spacing="2" fill="#9fb0cc">LOCKED</text>
<text x="${R-28}" y="456" text-anchor="end" font-family="${F.xb}" font-size="17" letter-spacing="2" fill="#9fb0cc">NOW*</text>
${rows}
<text x="${L}" y="${top+picks.length*rh+28}" font-family="${F.sb}" font-size="21" fill="#9fb0cc">*Best big-5 price at our line as of ${esc(D.asOf)}. A lower price is a worse payout: check yours.</text>
<text x="${L}" y="${top+picks.length*rh+60}" font-family="${F.sb}" font-size="21" fill="#9fb0cc">Picks: one book's price beats the no-vig average of every licensed book by 1%+.</text>
<text x="${L}" y="${top+picks.length*rh+90}" font-family="${F.sb}" font-size="21" fill="#9fb0cc">Locked before kickoff · graded from box scores, losses included.</text>
<rect x="0" y="${H-92}" width="${W}" height="92" fill="${M}"/>
<text x="${L}" y="${H-36}" font-family="${F.g}" font-size="32" fill="#06231a">Bet This Guy</text>
<text x="${R}" y="${H-36}" text-anchor="end" font-family="${F.xb}" font-size="22" letter-spacing="2" fill="#06231a">21+ · 1-800-GAMBLER</text>
</svg>`;
fs.writeFileSync(process.argv[3],svg);
