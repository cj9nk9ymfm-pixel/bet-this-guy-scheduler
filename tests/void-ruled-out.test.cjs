const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),{webcrypto}=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const {read}=require('./helpers/client.cjs');
// A player ruled Out before kickoff never plays: his single is void (stake
// back), a parlay drops his leg, and the reason rides on the pick. An injury
// reported after kickoff never voids a bet.
const context=vm.createContext({URL,URLSearchParams,Request,Response,Headers,AbortSignal,Date,console,setTimeout,clearTimeout,crypto:webcrypto,TextEncoder,btoa,atob});
const t=read('worker/index.template.js');
vm.runInContext(t.slice(t.indexOf('const API_BASE')).replace('__MOVEMENT_SERVER__',read('worker/movement.js')).replace('__LIVE_SERVER__',read('worker/live.js')).replace('__STATS_SHARED__',read('dist/stats.js')).replace('__RECORDS_SERVER__',read('worker/records.js')).replace('__ACCOUNTS_SERVER__',read('worker/accounts.js')).replace('export default {','this.worker={'),context);
const db=new DatabaseSync(':memory:');for(const f of fs.readdirSync('drizzle').filter(f=>/^000[0-2]_|0006_|0018_|0021_|0028_|0030_|0032_|0036_/.test(f)).sort())db.exec(read('drizzle/'+f).replaceAll('--> statement-breakpoint',''));
const wrap=(sql,args=[])=>({bind(...v){return wrap(sql,v)},async first(){return db.prepare(sql).get(...args)||null},async all(){return{results:db.prepare(sql).all(...args)}},async run(){const r=db.prepare(sql).run(...args);return{success:true,meta:{changes:Number(r.changes)}}}});
context.env={DB:{prepare:sql=>wrap(sql),async batch(l){for(const s of l)await s.run()}}};
const gt='2026-10-18T17:00:00.000Z',now=Date.parse('2026-10-18T15:45:00Z');
const hurt=(p,status,detail,at)=>db.prepare("INSERT INTO injuries(id,player,team,position,status,detail,reported_at,fetched_at) VALUES(?,?,?,?,?,?,?,1)").run(`NFL|${p.toLowerCase().replace(/[^a-z]/g,'')}`,p,'IND','TE',status,detail,at);
hurt('Tyler Warren','Out','Groin','2026-10-18T15:38:00Z');hurt('Quinshon Judkins','Out','Right Ankle','2026-10-18T15:41:00Z');
hurt('Jonathan Taylor','Questionable','Knee','2026-10-18T15:00:00Z');hurt('Alec Pierce','Out','Hamstring','2026-10-18T18:30:00Z');
const leg=(player,market,side,line)=>({player,market,side,line,odds:-120,sport:'NFL',gameTime:gt,team:'IND · @ LAC',book:'FanDuel'});
const rec=(id,kind,legs,extra={})=>db.prepare("INSERT INTO public_recommendations(id,kind,sport,player,market,side,line,odds,combined_odds,game_time,legs_json,posted_at) VALUES(?,?,'NFL',?,?,?,?,?,?,?,?,'2026-10-18T03:00:00Z')").run(id,kind,kind==='prop'?legs[0].player:null,kind==='prop'?legs[0].market:null,kind==='prop'?legs[0].side:null,kind==='prop'?legs[0].line:null,kind==='prop'?-120:null,kind==='parlay'?264:null,gt,JSON.stringify(legs));
rec('official|w','prop',[leg('Tyler Warren','Receptions','Over',4.5)]);
rec('official|t','prop',[leg('Jonathan Taylor','Rushing Yards','Over',80.5)]);
rec('official|p','parlay',[leg('Tyler Warren','Receptions','Over',4.5),leg('Jonathan Taylor','Rushing Yards','Over',80.5)]);
const pk=(id,p)=>db.prepare("INSERT INTO prediction_picks(id,exchange,event_id,player,team,market,side,line,odds,net_odds,fair_pct,edge,game_time,posted_at) VALUES(?,'Novig','e',?,'CLE · @ PIT','Rushing Yards','Over',55.5,-110,-110,55,2,?,'2026-10-18T03:00:00Z')").run(id,p,gt);
pk('pm|j','Quinshon Judkins');pk('pm|t','Jonathan Taylor');
db.prepare("INSERT INTO prediction_parlays(id,week,tier,exchange,legs_json,odds,game_time,posted_at) VALUES('pp','2026-10-13','short','Novig',?,161,?,'2026-10-18T03:00:00Z')").run(JSON.stringify([{player:'Quinshon Judkins',market:'Rushing Yards',side:'Over',line:55.5,eventId:'e',gameTime:gt},{player:'Jonathan Taylor',market:'Rushing Yards',side:'Over',line:80.5,eventId:'e',gameTime:gt}]),gt);
(async()=>{
  // Too early: final inactives aren't out yet, nothing changes.
  assert.equal(JSON.parse(JSON.stringify(await vm.runInContext(`voidRuledOut(env,${Date.parse(gt)-3*3600000})`,context))).voided,0);
  const out=JSON.parse(JSON.stringify(await vm.runInContext(`voidRuledOut(env,${now})`,context)));
  assert.deepEqual(out.players.sort(),['Quinshon Judkins','Tyler Warren']);
  const w=db.prepare("SELECT status,result,settled_at,legs_json FROM public_recommendations WHERE id='official|w'").get();
  assert.deepEqual([w.status,w.result,Boolean(w.settled_at)],['final','push',true],'a single on a ruled-out player settles as a void');
  assert.deepEqual(JSON.parse(w.legs_json)[0].voidReason,'Ruled out (Groin)');
  assert.equal(db.prepare("SELECT status FROM public_recommendations WHERE id='official|t'").get().status,'pending','Questionable is not Out');
  const p=db.prepare("SELECT status,result,legs_json FROM public_recommendations WHERE id='official|p'").get(),pl=JSON.parse(p.legs_json);
  assert.deepEqual([p.status,pl[0].voided,pl[0].result,pl[1].voided],['pending',true,'push',undefined],'a parlay drops the leg and grades on the rest');
  const j=db.prepare("SELECT result,void_reason FROM prediction_picks WHERE id='pm|j'").get();
  assert.deepEqual({...j},{result:'void',void_reason:'Ruled out (Right Ankle)'});
  assert.equal(db.prepare("SELECT result FROM prediction_picks WHERE id='pm|t'").get().result,null);
  const pp=JSON.parse(db.prepare("SELECT legs_json FROM prediction_parlays").get().legs_json);
  assert.deepEqual([pp[0].voided,pp[0].result,pp[1].result],[true,'push',undefined]);
  // Running again changes nothing.
  assert.equal(JSON.parse(JSON.stringify(await vm.runInContext(`voidRuledOut(env,${now+600000})`,context))).voided,0);
  // Out reported after kickoff (hurt in the game) never voids.
  rec('official|a','prop',[leg('Alec Pierce','Receiving Yards','Over',40.5)]);
  await vm.runInContext(`voidRuledOut(env,${Date.parse('2026-10-18T19:00:00Z')})`,context);
  assert.equal(db.prepare("SELECT status FROM public_recommendations WHERE id='official|a'").get().status,'pending','an in-game injury is graded, not voided');
  // The grader treats a voided leg as no action: the parlay wins on its other leg.
  const graded={kind:'parlay',legs_json:JSON.stringify(pl)};
  context.recordPlayerStats=async()=>({player:{first_name:'Jonathan',last_name:'Taylor'},rushing_yards:95,scoreboardFinal:true,game:{status:'Final'}});
  const res=await vm.runInContext('gradePublicRecord',context)(graded,context.env,new Map());
  assert.equal(res,'won');assert.equal(graded.gradedLegs[0].voided,true);
  // Played but recorded nothing (not ruled out, no row in a full final box score): 0, so an Under wins.
  context.recordPlayerStats=async()=>({missingPlayerStats:true,boxMatches:0,boxRowCount:66,scoreboardFinal:true,game:{status:'Final'}});
  const sk={kind:'prop',player:'Cam Skattebo',market:'Rush Attempts',side:'Under',line:14.5,odds:-110,sport:'NFL',game_time:'2026-10-11T17:00:00.000Z',legs_json:JSON.stringify([leg('Cam Skattebo','Rush Attempts','Under',14.5)].map(l=>({...l,gameTime:'2026-10-11T17:00:00.000Z'})))};
  assert.equal(await vm.runInContext('gradePublicRecord',context)(sk,context.env,new Map()),'won');
  assert.deepEqual([sk.gradedLegs[0].actualValue,sk.gradedLegs[0].noStats],[0,true]);
  // In the box score with the stat left blank (no catches, so no receiving yards): 0 too.
  context.recordPlayerStats=async()=>({player:{first_name:'Bo',last_name:'Melton'},receptions:null,receiving_yards:null,scoreboardFinal:true,game:{status:'Final'}});
  const bm={kind:'prop',player:'Bo Melton',market:'Receiving Yards',side:'Under',line:7.5,odds:108,sport:'NFL',game_time:'2026-10-11T17:00:00.000Z',legs_json:JSON.stringify([{...leg('Bo Melton','Receiving Yards','Under',7.5),gameTime:'2026-10-11T17:00:00.000Z'}])};
  assert.equal(await vm.runInContext('gradePublicRecord',context)(bm,context.env,new Map()),'won');
  // The X reply says why.
  const text=vm.runInContext('xResultText',context)({kind:'prop',player:'Tyler Warren',market:'Receptions',side:'Over',line:4.5,odds:-120,result:'push',status:'final',legs_json:w.legs_json},null);
  assert.match(text,/^➖ Void: Tyler Warren .*\nRuled out \(Groin\) before kickoff/);
  console.log('PASS: players ruled out before kickoff void their bets (singles, parlay legs, prediction picks) with the reason, and in-game injuries never void; a player with no stats who played has 0');
})().catch(error=>{console.error(error);process.exit(1)});
