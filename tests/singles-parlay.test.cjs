const assert=require('node:assert/strict'),vm=require('node:vm'),{webcrypto}=require('node:crypto');
const {read}=require('./helpers/client.cjs');
// Parlay from our own singles: two pending official singles from different
// games, still better than fair at today's price, inside two hours of kickoff.
const context=vm.createContext({URL,URLSearchParams,Request,Response,Headers,AbortSignal,Date,console,setTimeout,clearTimeout,crypto:webcrypto,TextEncoder,btoa,atob,fetch:async()=>new Response(null,{status:404})});
const template=read('worker/index.template.js');
vm.runInContext(template.slice(template.indexOf('const API_BASE')).replace('__MOVEMENT_SERVER__',read('worker/movement.js')).replace('__LIVE_SERVER__',read('worker/live.js')).replace('__STATS_SHARED__',read('dist/stats.js')).replace('__RECORDS_SERVER__',read('worker/records.js')).replace('__ACCOUNTS_SERVER__',read('worker/accounts.js')).replace('export default {','this.worker={'),context);
const run=code=>vm.runInContext(code,context),J=v=>JSON.parse(JSON.stringify(v));
const now=Date.parse('2026-10-11T15:30:00Z'),kick='2026-10-11T17:00:00.000Z';
const single=(player,game,odds,t=kick,extra={})=>({id:`official|2026-10-06|props|prop|${player}`,kind:'prop',player,market:'Receptions',side:'Over',line:3.5,odds,game_id:game,game_time:t,result:null,legs_json:JSON.stringify([{player,market:'Receptions',side:'Over',line:3.5,odds,gameId:game,gameTime:t}]),...extra});
const cand=(player,game,odds,edge,t=kick)=>({player,market:'Receptions',side:'Over',line:3.5,odds,edge,book:'BetMGM',gameId:game,gameTime:t,playerKey:`${game}|${player.toLowerCase().replace(/[^a-z]/g,'')}`});
context.cands=[];context.officialCandidates=()=>context.cands;run('officialCandidates=globalThis.officialCandidates');
const plan=(rows,t=now)=>{context.rows=rows;return J(run(`singlesParlay([],rows,${t})`))};
context.cands=[cand('Tre Tucker','NFL--a',120,1.1),cand('Carnell Tate','NFL--b',115,0.8),cand('Brock Bowers','NFL--a',105,0.9)];
let p=plan([single('Tre Tucker','NFL--a',129),single('Carnell Tate','NFL--b',128),single('Brock Bowers','NFL--a',110)]);
assert.equal(p.tier,'reasonable');assert.deepEqual(p.legs.map(l=>l.player),['Tre Tucker','Carnell Tate'],'best edges, different games');
assert.deepEqual(p.legs.map(l=>l.odds),[120,115],'priced at today\'s odds, not the locked ones');assert.ok(p.legs.every(l=>l.fromSingles));
assert.equal(plan([single('Tre Tucker','NFL--a',129),single('Brock Bowers','NFL--a',110)]),null,'never two legs from one game');
assert.equal(plan([single('Tre Tucker','NFL--a',129),single('Carnell Tate','NFL--b',128)],Date.parse('2026-10-11T12:00:00Z')),null,'waits until two hours before the first kickoff');
context.cands=[cand('Tre Tucker','NFL--a',120,1.1)];
assert.equal(plan([single('Tre Tucker','NFL--a',129),single('Carnell Tate','NFL--b',128)]),null,'a single no longer better than fair is left out');
context.cands=[cand('Tre Tucker','NFL--a',120,1.1),cand('Carnell Tate','NFL--b',115,0.8)];
const done={id:'official|2026-10-06|reasonable|parlay|x',kind:'parlay',game_id:'NFL--c',game_time:kick,result:null,legs_json:JSON.stringify([{player:'X',gameId:'NFL--c',gameTime:kick,fromSingles:true},{player:'Y',gameId:'NFL--d',gameTime:kick,fromSingles:true}])};
assert.equal(plan([single('Tre Tucker','NFL--a',129),single('Carnell Tate','NFL--b',128),done]),null,'one a day');
assert.equal(plan([single('Tre Tucker','NFL--a',129),single('Carnell Tate','NFL--b',128,kick,{result:'won'})]),null,'graded singles are left out');
context.cands=[cand('Tre Tucker','NFL--a',600,1.1),cand('Carnell Tate','NFL--b',300,0.8)];
assert.equal(plan([single('Tre Tucker','NFL--a',600),single('Carnell Tate','NFL--b',300)]),null,'stays in the +100 to +999 range');
console.log('PASS: singles parlay pairs two still-good official singles from different games near kickoff, at today\'s prices, once a day');
