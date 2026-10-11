const assert=require('node:assert/strict'),vm=require('node:vm'),{webcrypto}=require('node:crypto');
const {read}=require('./helpers/client.cjs');
// A bet the live box score has already decided (a stat that only goes up has
// passed the line) settles provisionally before the final; yards never do.
const context=vm.createContext({URL,URLSearchParams,Request,Response,Headers,AbortSignal,Date,console,setTimeout,clearTimeout,crypto:webcrypto,TextEncoder,btoa,atob,fetch:async()=>new Response(null,{status:404})});
const template=read('worker/index.template.js');
vm.runInContext(template.slice(template.indexOf('const API_BASE')).replace('__MOVEMENT_SERVER__',read('worker/movement.js')).replace('__LIVE_SERVER__',read('worker/live.js')).replace('__STATS_SHARED__',read('dist/stats.js')).replace('__RECORDS_SERVER__',read('worker/records.js')).replace('__ACCOUNTS_SERVER__',read('worker/accounts.js')).replace('export default {','this.worker={'),context);
const run=code=>vm.runInContext(code,context),J=v=>JSON.parse(JSON.stringify(v));
(async()=>{
  const gt=new Date(Date.now()-90*60000).toISOString();
  context.recordPlayerStats=async leg=>({game:{id:1,status:'2nd Quarter',date:gt},receptions:1,receiving_yards:40,passing_interceptions:0});run('recordPlayerStats=globalThis.recordPlayerStats');
  const grade=async rec=>{context.rec=rec;const final=await run('gradePublicRecord(rec,{},new Map(),undefined)');return {final,prov:run('rec.provisionalResult'),legs:J(run('rec.gradedLegs'))}};
  const leg=(market,side,line)=>({player:'Calvin Ridley',market,side,line,odds:163,sport:'NFL',gameTime:gt,team:'Houston Texans · @ Tennessee Titans'});
  let g=await grade({kind:'prop',...leg('Receptions','Under',0.5),game_time:gt,legs_json:JSON.stringify([leg('Receptions','Under',0.5)])});
  assert.equal(g.final,null,'not final');assert.equal(g.prov,'lost','Under 0.5 receptions with a catch is already lost');assert.equal(g.legs[0].decidedEarly,true);assert.equal(g.legs[0].actualValue,1);
  g=await grade({kind:'prop',...leg('Receptions','Over',0.5),game_time:gt,legs_json:JSON.stringify([leg('Receptions','Over',0.5)])});
  assert.equal(g.prov,'won','Over cleared is already won');
  g=await grade({kind:'prop',...leg('Receptions','Under',2.5),game_time:gt,legs_json:JSON.stringify([leg('Receptions','Under',2.5)])});
  assert.equal(g.prov,null,'not yet decided');
  g=await grade({kind:'prop',...leg('Receiving Yards','Under',30.5),game_time:gt,legs_json:JSON.stringify([leg('Receiving Yards','Under',30.5)])});
  assert.equal(g.prov,null,'yards can go down, so they wait for the final');
  const pl=[leg('Receptions','Under',0.5),{...leg('Receptions','Under',4.5),player:'Malik Willis'}];
  g=await grade({kind:'parlay',game_time:gt,legs_json:JSON.stringify(pl)});
  assert.equal(g.prov,'lost','a parlay with a decided losing leg is lost');
  assert.equal(run("xActual({market:'Receptions',actualValue:1})"),'had 1 reception');
  console.log('PASS: decided bets settle early on stats that only go up; yards wait for the final');
})().catch(error=>{console.error(error);process.exit(1)});
