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
  function metric(prop, row) {
    const label = String(prop?.market || ''), key = label.toLowerCase().trim().replace(/^alternate\s+/, '');
    if (!row) return {label, value:null};
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
    return Boolean(fields[key]||combinations[key]||['tackles + assists','anytime touchdown','touchdowns','field goals','pats','longest completion'].includes(key));
  }
  return {number,read,metric,grade,supports};
})();
