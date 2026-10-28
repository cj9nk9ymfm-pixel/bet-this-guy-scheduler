// One conservative NFL metric contract for history, live cards, and settlement.
globalThis.BTGStats = (() => {
  const number = value => value === null || value === undefined || typeof value === 'boolean' || String(value).trim() === '' ? null : Number.isFinite(Number(value)) ? Number(value) : null;
  const read = (row, keys) => {
    for (const source of [row, row?.stats, row?.statistics]) for (const key of keys) {
      const value = number(source?.[key]);
      if (value !== null) return value;
    }
    return null;
  };
  const fields = {
    'passing yards': ['passing_yards','pass_yards','pass_yds'],
    'rushing yards': ['rushing_yards','rush_yards','rush_yds'],
    'receiving yards': ['receiving_yards','reception_yards','rec_yds'],
    'passing touchdowns': ['passing_touchdowns','passing_tds','pass_td'],
    'rushing touchdowns': ['rushing_touchdowns','rush_touchdowns','rushing_tds','rush_td'],
    'receiving touchdowns': ['receiving_touchdowns','rec_touchdowns','receiving_tds','rec_td'],
    'receptions': ['receptions','receiving_receptions','rec'],
    'pass completions': ['passing_completions','completions','cmp'],
    'pass attempts': ['passing_attempts','pass_attempts','pass_att'],
    'interceptions thrown': ['passing_interceptions','pass_interceptions'],
    'rush attempts': ['rushing_attempts','rush_attempts','carries'],
    'longest pass completion': ['long_passing','longest_pass','longest_completion','passing_longest_completion','pass_long'],
    'longest rush': ['long_rushing','longest_rush','long_rush'],
    'longest reception': ['long_reception','longest_reception','receiving_longest'],
    'sacks': ['defensive_sacks','sacks'],
    'solo tackles': ['solo_tackles'],
    'assists': ['assisted_tackles','assist_tackles'],
    'defensive interceptions': ['defensive_interceptions'],
    'field goals made': ['field_goals_made','fg_made'],
    'extra points': ['extra_points_made','pat_made'],
    'kicking points': ['kicking_points','total_points'],
  };
  const combinations = {
    'passing + rushing yards': ['passing yards','rushing yards'],
    'pass + rush + receiving yards': ['passing yards','rushing yards','receiving yards'],
    'rush + receiving yards': ['rushing yards','receiving yards'],
    'rush + receiving touchdowns': ['rushing touchdowns','receiving touchdowns'],
    'pass + rush + receiving tds': ['passing touchdowns','rushing touchdowns','receiving touchdowns'],
  };
  // NBA box-score fields (BALLDONTLIE NBA stats). "Assists" means passing
  // assists here, not assisted tackles, so NBA props never use the NFL map.
  const nbaFields = {points:['pts'], rebounds:['reb'], assists:['ast'], '3-pointers made':['fg3m'], threes:['fg3m'], blocks:['blk'], steals:['stl'], turnovers:['turnover','tov']};
  const nbaCombos = {'points + rebounds + assists':['points','rebounds','assists'], 'points + rebounds':['points','rebounds'], 'points + assists':['points','assists'], 'rebounds + assists':['rebounds','assists'], 'blocks + steals':['blocks','steals']};
  const isNba = (prop, row) => String(prop?.sport || '').toUpperCase() === 'NBA' || (!prop?.sport && row && read(row,['pts']) !== null && read(row,['reb']) !== null);
  function nbaMetric(label, key, row) {
    if (nbaFields[key]) return {label, value:read(row, nbaFields[key])};
    if (nbaCombos[key]) { const values = nbaCombos[key].map(name => read(row, nbaFields[name])); return {label, value:values.every(v => v !== null) ? values.reduce((a,b) => a+b, 0) : null}; }
    if (key === 'double-double' || key === 'triple-double') {
      // Yes/No props on a 0.5 line: 1 when enough categories reach 10.
      const values = ['points','rebounds','assists','steals','blocks'].map(name => read(row, nbaFields[name]));
      if (values.slice(0,3).some(v => v === null)) return {label, value:null};
      return {label, value:values.filter(v => v !== null && v >= 10).length >= (key === 'double-double' ? 2 : 3) ? 1 : 0};
    }
    return {label, value:null};
  }
  // NBA minutes arrive as "34", "34:12", "00" or empty. A player who didn't
  // play (0 minutes) has no stat line: sportsbooks void those props.
  const nbaMinutes = row => { const m = String(row?.min ?? '').match(/^(\d+)(?::(\d+))?$/); return m ? +m[1] + (+m[2] || 0) / 60 : null; };
  const nbaPlayed = row => (nbaMinutes(row) ?? 0) > 0;
  function metric(prop, row) {
    const label = String(prop?.market || ''), key = label.toLowerCase().trim().replace(/^alternate\s+/, '');
    if (!row) return {label, value:null};
    if (isNba(prop, row)) return nbaPlayed(row) ? nbaMetric(label, key, row) : {label, value:null};
    // A game-total box score cannot establish scoring order or quarter totals.
    if (/first|last|quarter|half/.test(key)) return {label, value:null};
    const alias = {'field goals':'field goals made',pats:'extra points','longest completion':'longest pass completion'}[key] || key;
    if(alias==='assists'){
      const direct=read(row,fields.assists),total=read(row,['total_tackles']),solo=read(row,['solo_tackles']);
      return {label,value:direct??(total!==null&&solo!==null&&total>=solo?total-solo:null)};
    }
    if (fields[alias]) return {label, value:read(row, fields[alias])};
    if (combinations[alias]) {
      const values = combinations[alias].map(name => read(row, fields[name]));
      return {label, value:values.every(value => value !== null) ? values.reduce((sum,value)=>sum+value,0) : null};
    }
    if (alias === 'tackles + assists') {
      const total = read(row,['total_tackles','combined_tackles','tackles']);
      const solo = read(row,['solo_tackles']), assists = read(row,['assisted_tackles']);
      return {label, value:total ?? (solo !== null && assists !== null ? solo+assists : null)};
    }
    if (alias === 'anytime touchdown' || alias === 'touchdowns') {
      // Rushing + receiving does not include return/defensive scores. Never
      // infer a complete scorer total from incomplete component fields.
      return {label, value:read(row,['total_touchdowns','touchdowns'])};
    }
    return {label, value:null};
  }
  function grade(side, line, value) {
    const actual=number(value), target=number(line), direction=String(side).toLowerCase();
    if (actual === null || target === null || !['over','under'].includes(direction)) return null;
    if (Math.abs(actual-target)<0.0001) return 'push';
    return (direction==='under' ? actual<target : actual>target) ? 'won' : 'lost';
  }
  function supports(prop){
    const key=String(prop?.market||'').toLowerCase().trim().replace(/^alternate\s+/,'');
    if(String(prop?.sport||'').toUpperCase()==='NBA')return Boolean(nbaFields[key]||nbaCombos[key]||key==='double-double'||key==='triple-double');
    return Boolean(fields[key]||combinations[key]||['tackles + assists','anytime touchdown','touchdowns','field goals','pats','longest completion'].includes(key));
  }
  return {number,read,metric,grade,supports,nbaPlayed};
})();

// Line value: one fair-price curve per player market, so a price at a
// different line (Over 209.5 at one book, 215.5 at the others) can be rated.
// The curve is fitted to every two-sided line from licensed books plus
// one-sided alt-ladder prices (margin removed); yards use a normal curve,
// counts a Poisson. Offers far from the consensus line, stale prices and
// suspiciously big edges are ignored, and a curve that can't reproduce the
// books' own two-sided prices is thrown away.
globalThis.BTGLine = (() => {
  const YARDS = {player_pass_yds:.28, player_rush_yds:.55, player_reception_yds:.65, player_rush_reception_yds:.5};
  const COUNTS = new Set(['player_receptions','player_pass_completions','player_pass_attempts','player_rush_attempts','player_pass_tds']);
  const MAX_EDGE = 8, MIN_BOOKS = 3, FIT_TOLERANCE = .06, STALE = 15*60000;
  const implied = odds => odds > 0 ? 100/(odds+100) : -odds/(-odds+100);
  const erf = x => {const s=Math.sign(x),t=1/(1+.3275911*Math.abs(x));return s*(1-((((1.061405429*t-1.453152027)*t+1.421413741)*t-.284496736)*t+.254829592)*t*Math.exp(-x*x))};
  const phi = z => .5*(1+erf(z/Math.SQRT2));
  const probit = p => {let lo=-8,hi=8;for(let i=0;i<60;i++){const mid=(lo+hi)/2;if(phi(mid)<p)lo=mid;else hi=mid}return (lo+hi)/2};
  const pmf = (k,l) => {let p=Math.exp(-l);for(let i=1;i<=k;i++)p*=l/i;return p};
  const poissonAbove = (line,l) => {let below=0;for(let k=0;k<line;k++)below+=pmf(k,l);const at=Number.isInteger(line)?pmf(line,l):0;return {over:Math.max(0,1-below-at),under:below}};
  // Fair chance of Over at a line; whole-number lines exclude the push.
  function overChance(model,line){
    if(model.kind==='normal'){const p=1-phi((line-model.mu)/model.sigma);return p}
    const {over,under}=poissonAbove(line,model.lambda);return over/(over+under);
  }
  function solveLambda(line,p){let lo=.01,hi=120;for(let i=0;i<60;i++){const mid=(lo+hi)/2;if(overChance({kind:'poisson',lambda:mid},line)<p)lo=mid;else hi=mid}return (lo+hi)/2}
  const near = (kind,line,main) => Math.abs(line-main) <= (kind==='normal' ? Math.max(3,main*.1) : 1) + 1e-9;
  function fit(kind,ratio,anchors,main){
    if(kind==='poisson'){const w=anchors.reduce((s,a)=>s+a.w,0);return {kind,lambda:anchors.reduce((s,a)=>s+a.w*solveLambda(a.line,a.p),0)/w}}
    const pts=anchors.map(a=>({x:probit(1-Math.min(.97,Math.max(.03,a.p))),y:a.line,w:a.w})),W=pts.reduce((s,p)=>s+p.w,0);
    const mx=pts.reduce((s,p)=>s+p.w*p.x,0)/W,my=pts.reduce((s,p)=>s+p.w*p.y,0)/W,sxx=pts.reduce((s,p)=>s+p.w*(p.x-mx)**2,0);
    let sigma=sxx>.02&&new Set(pts.map(p=>p.y)).size>1?pts.reduce((s,p)=>s+p.w*(p.x-mx)*(p.y-my),0)/sxx:NaN;
    if(!(sigma>=main*.12&&sigma<=main*.9))sigma=Math.max(1,main*ratio);
    return {kind,mu:my-sigma*mx,sigma};
  }
  // event: one Odds API event (bookmakers already limited to licensed books).
  // Returns one entry per player market with the curve and every rated offer.
  function rate(event,now=Date.now()){
    const groups=new Map();
    for(const book of event?.bookmakers||[])for(const market of book.markets||[]){
      const base=String(market.key||'').replace(/_alternate$/,''),alt=base!==market.key,kind=YARDS[base]?'normal':COUNTS.has(base)?'poisson':null;
      if(!kind)continue;
      const updated=Date.parse(market.last_update||book.last_update||'');
      if(Number.isFinite(updated)&&(now-updated>STALE||updated>now+60000))continue;
      for(const o of market.outcomes||[]){
        const side=String(o.name||'').toLowerCase(),player=String(o.description||'').trim(),line=Number(o.point),odds=Number(o.price);
        if(!['over','under'].includes(side)||!player||!Number.isFinite(line)||!Number.isFinite(odds)||Math.abs(odds)<100||Math.abs(odds)>10000)continue;
        const id=player+'|'+base,g=groups.get(id)||{player,marketKey:base,kind,offers:[]};
        g.offers.push({book:book.title||book.key,key:book.key,line,side,odds,alt});groups.set(id,g);
      }
    }
    const out=[];
    for(const g of groups.values()){
      const pairs=new Map();
      for(const o of g.offers){const k=o.key+'|'+o.line+'|'+o.alt,p=pairs.get(k)||{key:o.key,line:o.line,alt:o.alt};p[o.side]=o.odds;pairs.set(k,p)}
      const two=[...pairs.values()].filter(p=>p.over!=null&&p.under!=null).map(p=>{const io=implied(p.over),iu=implied(p.under);return {...p,p:io/(io+iu),margin:io+iu}});
      // The consensus line: the median of each book's standard line (the one
      // it prices closest to 50/50), so books split across lines still count.
      const own=new Map();for(const p of two)if(!p.alt){const prior=own.get(p.key);if(!prior||Math.abs(p.p-.5)<Math.abs(prior.p-.5))own.set(p.key,p)}
      if(own.size<MIN_BOOKS)continue;
      const sorted=[...own.values()].map(p=>p.line).sort((a,b)=>a-b),main=sorted.length%2?sorted[(sorted.length-1)/2]:(sorted[sorted.length/2-1]+sorted[sorted.length/2])/2;
      const count=new Map([[main,own.size]]);
      const margins=new Map(two.filter(p=>!p.alt).map(p=>[p.key,p.margin])),usual=[...margins.values()].sort((a,b)=>a-b)[Math.floor(margins.size/2)];
      const anchors=two.filter(p=>near(g.kind,p.line,main)).map(p=>({line:p.line,p:p.p,w:p.alt?1.5:2,two:true}));
      const pairedAlt=new Set(two.filter(p=>p.alt).map(p=>p.key+'|'+p.line));
      for(const o of g.offers)if(o.alt&&!pairedAlt.has(o.key+'|'+o.line)&&Math.abs(o.odds)<=400&&near(g.kind,o.line,main)){
        const fairSide=implied(o.odds)/(margins.get(o.key)||usual);if(fairSide>=.98)continue;
        anchors.push({line:o.line,p:o.side==='over'?fairSide:1-fairSide,w:1,two:false});
      }
      const model=fit(g.kind,YARDS[g.marketKey]||0,anchors,main);
      if(anchors.some(a=>a.two&&Math.abs(overChance(model,a.line)-a.p)>FIT_TOLERANCE))continue;
      const offers=g.offers.filter(o=>near(g.kind,o.line,main)).map(o=>{const over=overChance(model,o.line),fair=o.side==='over'?over:1-over;return {...o,fair,edge:100*(fair-implied(o.odds))}}).filter(o=>o.edge<=MAX_EDGE);
      out.push({player:g.player,marketKey:g.marketKey,kind:g.kind,main,books:count.get(main),model,offers});
    }
    return out;
  }
  // How much better a line is for the bettor: Over wants lower, Under higher.
  const lineGain = (side,line,main) => String(side).toLowerCase()==='over' ? main-line : line-main;
  return {rate,overChance,lineGain,implied,MAX_EDGE};
})();
