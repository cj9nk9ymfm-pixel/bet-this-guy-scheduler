const assert=require('node:assert/strict'),vm=require('node:vm'),{webcrypto}=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const {read}=require('./helpers/client.cjs');
// Line value: one fair-price curve per player market, so a price at another
// line can be rated. Runs in shadow mode: would-be picks are logged with their
// closing fair price and never posted; my-book alerts use it at a higher bar.
const context=vm.createContext({URL,URLSearchParams,Request,Response,Headers,AbortSignal,Date,console,setTimeout,clearTimeout,crypto:webcrypto,TextEncoder,btoa,atob,fetch:async()=>new Response(null,{status:404})});
const template=read('worker/index.template.js');
vm.runInContext(template.slice(template.indexOf('const API_BASE')).replace('__MOVEMENT_SERVER__',read('worker/movement.js')).replace('__LIVE_SERVER__',read('worker/live.js')).replace('__STATS_SHARED__',read('dist/stats.js')).replace('__RECORDS_SERVER__',read('worker/records.js')).replace('__ACCOUNTS_SERVER__',read('worker/accounts.js')).replace('export default {','this.worker={'),context);
const db=new DatabaseSync(':memory:');
for(const f of ['0000_public_record.sql','0003_shared_movement.sql','0009_line_shadow.sql','0014_line_shadow_results.sql'])db.exec(read('drizzle/'+f).replaceAll('--> statement-breakpoint',''));
const wrap=(sql,args=[])=>({bind(...values){return wrap(sql,values)},async first(){return db.prepare(sql).get(...args)||null},async all(){return{results:db.prepare(sql).all(...args)}},async run(){const r=db.prepare(sql).run(...args);return{success:true,meta:{changes:Number(r.changes)}}}});
const env={DB:{prepare:sql=>wrap(sql),async batch(list){for(const s of list)await s.run()}}};
const run=code=>vm.runInContext(code,context);
(async()=>{
  const now=Date.parse('2026-10-04T12:00:00Z'),fresh=new Date(now-60000).toISOString(),kickoff=new Date(now+5*3600000).toISOString();
  const market=(key,player,lines)=>({key,last_update:fresh,outcomes:lines.flatMap(([point,over,under])=>[over!=null&&{name:'Over',description:player,point,price:over},under!=null&&{name:'Under',description:player,point,price:under}].filter(Boolean))});
  const book=(key,title,...markets)=>({key,title,last_update:fresh,markets});
  const yards=(key,title,lines,alt)=>book(key,title,market('player_pass_yds','Aaron Rodgers',lines),...(alt?[market('player_pass_yds_alternate','Aaron Rodgers',alt)]:[]));
  const event=books=>({id:'evt1',eventID:'NFL--evt1',commence_time:kickoff,home_team:'Pittsburgh Steelers',away_team:'Cleveland Browns',bookmakers:books});
  // Most books: Over/Under 215.5 at -110. Caesars hangs 205.5 at the same price.
  context.lineEvent=event([yards('draftkings','DraftKings',[[215.5,-110,-110]],[[199.5,-160,null],[229.5,140,null]]),yards('fanduel','FanDuel',[[215.5,-112,-108]]),yards('betmgm','BetMGM',[[215.5,-110,-110]]),yards('williamhill_us','Caesars',[[205.5,-110,-110]])]);
  run('var curve=BTGLine.rate(lineEvent,'+now+')[0]');
  assert.equal(run('curve.main'),215.5,'the consensus line is the one most books hang');
  assert.equal(run('curve.kind'),'normal','yards use a normal curve');
  assert.ok(run('curve.model.mu>205&&curve.model.mu<220&&curve.model.sigma>30&&curve.model.sigma<120'),'the curve is centred near the line with a sensible spread');
  run("var caesars=curve.offers.find(o=>o.book==='Caesars'&&o.side==='over')");
  assert.ok(run('caesars.edge>2&&caesars.edge<=BTGLine.MAX_EDGE'),'Over 205.5 at -110 is good value when the fair line is about 215');
  assert.ok(run("curve.offers.find(o=>o.book==='Caesars'&&o.side==='under').edge<-5"),'the other side of a soft line is poor value');
  assert.equal(run('BTGLine.lineGain("over",205.5,215.5)'),10);
  // Safety: far-off lines are never rated; fewer than 3 books means no curve;
  // stale prices are ignored; a curve that misses the books' own prices is dropped.
  context.far=event([yards('draftkings','DraftKings',[[215.5,-110,-110]],[[149.5,-900,null]]),yards('fanduel','FanDuel',[[215.5,-110,-110]]),yards('betmgm','BetMGM',[[215.5,-110,-110]])]);
  assert.ok(run('BTGLine.rate(far,'+now+')[0].offers.every(o=>o.line!==149.5)'),'a line far from the consensus is ignored');
  context.thin=event([yards('draftkings','DraftKings',[[215.5,-110,-110]]),yards('williamhill_us','Caesars',[[205.5,-110,-110]])]);
  assert.equal(run('BTGLine.rate(thin,'+now+').length'),0,'needs 3 books pricing both sides');
  // Books split across lines still count: the consensus is the median line.
  context.split=event([yards('draftkings','DraftKings',[[183.5,-112,-112]]),yards('fanduel','FanDuel',[[187.5,-114,-114]]),yards('betmgm','BetMGM',[[189.5,-115,-115]]),yards('betrivers','BetRivers',[[195.5,-114,-117]])]);
  assert.equal(run('BTGLine.rate(split,'+now+')[0].main'),188.5,'four books on four lines still make a curve');
  // The rule that matters: a different line only counts when the odds don't
  // pay for the difference. Fanatics' 55.5 at -135/+100 (the line moved and
  // the price moved with it) is not value; FanDuel's 9.5 at the usual price is.
  const rush=(key,title,line,over,under)=>book(key,title,market('player_rush_yds','Kyren Williams',[[line,over,under]]));
  context.priced=event([rush('betmgm','BetMGM',59.5,-115,-115),rush('betrivers','BetRivers',61.5,-114,-117),rush('draftkings','DraftKings',59.5,-109,-115),rush('fanatics','Fanatics',55.5,-135,100),rush('fanduel','FanDuel',56.5,-114,-114)]);
  assert.ok(run(`BTGLine.rate(priced,${now})[0].offers.filter(o=>o.book==='Fanatics').every(o=>o.edge<0)`),'a lower line with juiced odds is not value');
  const dak=(key,title,line,over,under)=>book(key,title,market('player_rush_yds','Dak Prescott',[[line,over,under]]));
  context.same=event([dak('betmgm','BetMGM',10.5,-115,-115),dak('draftkings','DraftKings',10.5,-119,-106),dak('fanatics','Fanatics',10.5,-110,-120),dak('fanduel','FanDuel',9.5,-114,-114)]);
  assert.ok(run(`BTGLine.rate(same,${now})[0].offers.find(o=>o.book==='FanDuel'&&o.side==='over').edge>=1.5`),'a better line at the usual odds is value');
  context.stale=JSON.parse(JSON.stringify(context.lineEvent));[1,2].forEach(i=>context.stale.bookmakers[i].markets[0].last_update=new Date(now-3600000).toISOString());
  assert.equal(run('BTGLine.rate(stale,'+now+').length'),0,'stale books do not count toward the 3');
  const rec=(key,title,over35,under35)=>book(key,title,market('player_receptions','Jaylen Waddle',[[4.5,-120,-105]]));
  context.counts=event([rec('draftkings','DraftKings'),rec('fanduel','FanDuel'),rec('betmgm','BetMGM'),book('fanatics','Fanatics',market('player_receptions','Jaylen Waddle',[[3.5,-230,175]]))]);
  assert.equal(run('BTGLine.rate(counts,'+now+')[0].kind'),'poisson','counts use a Poisson curve');
  context.clash=event([rec('draftkings','DraftKings'),rec('fanduel','FanDuel'),rec('betmgm','BetMGM'),book('fanatics','Fanatics',market('player_receptions','Jaylen Waddle',[[3.5,-180,140]]))]);
  assert.equal(run('BTGLine.rate(clash,'+now+').length'),0,'a curve that can not match a book’s two-sided price is thrown away');
  context.wild=event([yards('draftkings','DraftKings',[[215.5,-110,-110]]),yards('fanduel','FanDuel',[[215.5,-110,-110]]),yards('betmgm','BetMGM',[[215.5,-110,-110]]),yards('fanatics','Fanatics',[[215.5,150,null]])]);
  assert.ok(run('BTGLine.rate(wild,'+now+')[0].offers.every(o=>o.book!=="Fanatics")'),'edges above the cap are treated as errors and dropped');

  // Shadow mode: the would-be pick is logged, not posted.
  context.env=env;
  const first=await run(`recordLineShadow(env,[lineEvent],${now})`);
  assert.equal(first.logged,1);
  let row=db.prepare('SELECT * FROM line_shadow').get();
  assert.deepEqual([row.player,row.side,row.line,row.book,row.main_line,row.alt],['Aaron Rodgers','Over',205.5,'Caesars',215.5,0]);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM public_recommendations').get().n,0,'never an official pick');
  // Later the market moves up to 220.5 (Caesars pulls its line): the logged pick's closing fair price is
  // stored, the original log is kept.
  context.moved=event([yards('draftkings','DraftKings',[[220.5,-110,-110]]),yards('fanduel','FanDuel',[[220.5,-110,-110]]),yards('betmgm','BetMGM',[[220.5,-110,-110]])]);
  const later=new Date(now+3600000-60000).toISOString();context.moved.bookmakers.forEach(b=>{b.last_update=later;b.markets.forEach(m=>m.last_update=later)});
  await run(`recordLineShadow(env,[moved],${now+3600000})`);
  row=db.prepare('SELECT * FROM line_shadow').get();
  assert.equal(row.close_main,220.5);assert.ok(row.close_fair>row.fair,'the market moved toward the pick');assert.equal(row.odds,-110,'the logged price is kept');
  // Started games are not updated again.
  await run(`recordLineShadow(env,[moved],${now+6*3600000})`);
  assert.equal(db.prepare('SELECT close_at FROM line_shadow').get().close_at,new Date(now+3600000).toISOString());
  // Grading: the logged game is stored, and once the box score is final the pick gets its result.
  assert.equal(db.prepare('SELECT team FROM line_shadow').get().team,'Cleveland Browns · @ Pittsburgh Steelers');
  env.BALLDONTLIE_API_KEY='test';const seen=[];
  run('recordPlayerStats=async r=>{globalThis.__seen.push(r);return {scoreboardFinal:true,passing_yards:212}}');context.__seen=seen;
  let graded=await run(`gradeLineShadow(env,${now+2*3600000})`);
  assert.equal(graded.graded,0,'not graded before the game ends');
  graded=await run(`gradeLineShadow(env,${now+10*3600000})`);
  assert.equal(graded.graded,1);assert.equal(seen[0].team,'Cleveland Browns · @ Pittsburgh Steelers');
  row=db.prepare('SELECT actual,result FROM line_shadow').get();
  assert.deepEqual([row.actual,row.result],[212,'won'],'Over 205.5 with 212 yards wins');
  assert.equal((await run(`gradeLineShadow(env,${now+11*3600000})`)).checked,0,'graded picks are not re-checked');
  // Rows logged before the team was stored get it from the odds snapshots,
  // which keep the NFL-- event id prefix.
  db.prepare("INSERT INTO line_shadow (id,event_id,player,market_key,market,side,line,odds,book,alt,main_line,books,edge,fair,game_time,logged_at,model_json) VALUES ('old','NFL--evt9','Kyler Murray','player_pass_yds','Passing Yards','Over',205.5,-110,'DraftKings',0,205.5,5,2,.5,?,?,'{}')").run(new Date(now).toISOString(),new Date(now-86400000).toISOString());
  db.prepare("INSERT INTO movement_snapshots (id,event_id,captured_at,kind,payload_json) VALUES ('s1','NFL--evt9',1,'observed',?)").run(JSON.stringify({id:'evt9',home_team:'New York Giants',away_team:'Arizona Cardinals',bookmakers:[]}));
  seen.length=0;graded=await run(`gradeLineShadow(env,${now+12*3600000})`);
  assert.equal(graded.graded,1,'older rows are graded too');assert.equal(seen[0].team,'Arizona Cardinals · @ New York Giants');
  assert.equal(db.prepare("SELECT team FROM line_shadow WHERE id='old'").get().team,'Arizona Cardinals · @ New York Giants');
  // A player missing from a final box score: waits 36 hours, then void (didn't play).
  db.prepare("INSERT INTO line_shadow (id,event_id,player,market_key,market,side,line,odds,book,alt,main_line,books,edge,fair,game_time,logged_at,model_json,team) VALUES ('dnp','NFL--evt9','Hurt Guy','player_receptions','Receptions','Over',3.5,-110,'DraftKings',0,3.5,5,2,.5,?,?,'{}','Arizona Cardinals · @ New York Giants')").run(new Date(now).toISOString(),new Date(now-86400000).toISOString());
  run('recordPlayerStats=async r=>r.player==="Hurt Guy"?{missingPlayerStats:true,scoreboardFinal:true}:{scoreboardFinal:true,passing_yards:212}');
  await run(`gradeLineShadow(env,${now+20*3600000})`);
  assert.equal(db.prepare("SELECT result FROM line_shadow WHERE id='dnp'").get().result,null,'not before 36 hours');
  await run(`gradeLineShadow(env,${now+40*3600000})`);
  assert.equal(db.prepare("SELECT result FROM line_shadow WHERE id='dnp'").get().result,'void');
  // Official picks still lock only at the same line and a big-5 book.
  assert.equal(run(`officialCandidates([lineEvent],${now}).length`),0,'line value is not used for official picks yet');

  // My-book alerts: Caesars users hear about the better line, with a note.
  const alerts=run(`bookValueCandidates([lineEvent],${now})`).filter(c=>c.lineNote);
  assert.equal(alerts.length,1);assert.equal(alerts[0].book,'Caesars');assert.equal(alerts[0].lineNote,'10 yds better line than most books');
  context.alertPick=alerts[0];
  assert.match(run('bookAlertMessage([alertPick]).body'),/Over 205\.5 passing yards \(-110\) · 10 yds better line than most books/);
  console.log('PASS: line value rates every line on one fair curve (normal for yards, Poisson for counts), drops far, stale, thin and inconsistent markets, logs would-be picks in shadow with their closing fair price, and adds better-line notes to my-book alerts');
})().catch(error=>{console.error(error);process.exit(1)});
