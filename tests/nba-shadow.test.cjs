const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path'),{DatabaseSync}=require('node:sqlite');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
// NBA picks in shadow mode: the official rules run on NBA games, the first
// qualifying price is logged (never posted), the closing big-5 price is
// tracked until tip-off, and the pick is graded once the game is final.
let now=Date.parse('2026-10-27T18:00:00Z');
class Clock extends Date{constructor(...a){super(...(a.length?a:[now]))}static now(){return now}}
const tip='2026-10-27T23:30:00Z';let tatumOver=-110,final=false;
const book=(key,title,over)=>({key,title,last_update:new Date(now-60000).toISOString(),markets:[{key:'player_points',last_update:new Date(now-60000).toISOString(),outcomes:[{name:'Over',description:'Jayson Tatum',point:27.5,price:over},{name:'Under',description:'Jayson Tatum',point:27.5,price:-110}]}]});
const celtics={id:2,full_name:'Boston Celtics'},knicks={id:20,full_name:'New York Knicks'};
const context=vm.createContext({Date:Clock,URL,URLSearchParams,Request,Response,Headers,AbortSignal,setTimeout,clearTimeout,console,
  fetch:async url=>{url=new URL(url);
    if(url.hostname==='api.the-odds-api.com'){
      if(url.pathname.endsWith('/events'))return Response.json(url.pathname.includes('basketball_nba')?[{id:'nba1',commence_time:tip,home_team:'Boston Celtics',away_team:'New York Knicks'}]:[]);
      return Response.json({id:'nba1',commence_time:tip,home_team:'Boston Celtics',away_team:'New York Knicks',bookmakers:[book('draftkings','DraftKings',tatumOver),book('fanduel','FanDuel',-110),book('betmgm','BetMGM',-110),book('fanatics','Fanatics',-110)]});
    }
    const p=url.pathname.replace(/^\/(nba\/)?v1/,'');
    if(p==='/games')return Response.json({data:[{id:9001,date:'2026-10-27',datetime:tip,status:final?'Final':'7:30 pm ET',period:final?4:0,home_team:celtics,visitor_team:knicks,home_team_score:112,visitor_team_score:104}]});
    if(p==='/stats')return Response.json({data:[{pts:31,reb:8,ast:4,fg3m:3,min:'36',player:{id:434,first_name:'Jayson',last_name:'Tatum'},team:celtics,game:{id:9001,date:'2026-10-27',status:'Final'}}],meta:{}});
    return new Response('{}',{status:404});
  }});
const template=read('worker/index.template.js');
vm.runInContext(template.slice(template.indexOf('const API_BASE')).replace('__MOVEMENT_SERVER__',read('worker/movement.js')).replace('__LIVE_SERVER__',read('worker/live.js')).replace('__STATS_SHARED__',read('dist/stats.js')).replace('__RECORDS_SERVER__',read('worker/records.js')).replace('__ACCOUNTS_SERVER__',read('worker/accounts.js')).replace('export default {','this.worker={'),context);
const db=new DatabaseSync(':memory:');for(const f of ['0000_public_record.sql','0012_nba_shadow.sql'])db.exec(read('drizzle/'+f).replaceAll('--> statement-breakpoint',''));
const wrap=(sql,args=[])=>({bind(...v){return wrap(sql,v)},async all(){return{results:db.prepare(sql).all(...args)}},async run(){const r=db.prepare(sql).run(...args);return{success:true,meta:{changes:Number(r.changes)}}}});
const env={DB:{prepare:sql=>wrap(sql),async batch(l){for(const s of l)await s.run()}},THE_ODDS_API_KEY:'k',BALLDONTLIE_API_KEY:'k'};context.env=env;
const run=c=>vm.runInContext(c,context),req='new Request("https://betthisguy.com/api/maintenance")';
(async()=>{
  // DraftKings hangs Over 27.5 at +115 while the others are -110: a qualifying edge.
  tatumOver=115;
  const first=await run(`recordNbaShadow(${req},env,{waitUntil(){}},${now})`);
  assert.equal(first.logged,1);
  let row=db.prepare('SELECT * FROM nba_shadow').get();
  assert.deepEqual([row.player,row.market,row.side,row.line,row.odds,row.book,row.event_id],['Jayson Tatum','Points','Over',27.5,115,'DraftKings','NBA--nba1']);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM public_recommendations').get().n,0,'shadow picks are never posted');
  // Later the price moves to -105: the first lock is kept, the close is tracked.
  now+=3600000;run('runtimeFeedCache.clear()');tatumOver=-105;
  await run(`recordNbaShadow(${req},env,{waitUntil(){}},${now})`);
  row=db.prepare('SELECT * FROM nba_shadow').get();
  assert.equal(row.odds,115,'the logged price never changes');assert.equal(row.close_odds,-105,'the closing price is tracked');
  // After the game: graded from the box score.
  now=Date.parse('2026-10-28T04:00:00Z');final=true;
  const graded=await run(`gradeNbaShadow(env,${now})`);
  assert.equal(graded.graded,1);
  row=db.prepare('SELECT * FROM nba_shadow').get();
  assert.deepEqual([row.actual,row.result],[31,'won']);
  console.log('PASS: NBA shadow picks follow the official rules, are never posted, keep their first price, track the close and grade from the box score');
})().catch(e=>{console.error(e);process.exit(1)});
