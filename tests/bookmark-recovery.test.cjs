const assert=require('node:assert/strict');
const {client,read}=require('./helpers/client.cjs');
const widths=[320,375,390,430,720,721,768,1024,1200,1440];
let checks=0;
function check(value,message){assert.ok(value,message);checks++}
for(const width of widths){
  const key=JSON.stringify(['NFL--fixture','Josh Allen','Passing Yards',271.5]);
  const c=client(width,{'propedge-saved':JSON.stringify([1,2,key])});assert.ifError(c.error);
  check(!c.nodes.get('#bookmarkRecovery').hidden,`${width}: old bookmarks get a reminder`);
  check(c.eval('state.saved.size===1'),`${width}: newer saves survive migration`);
  c.eval('selectedPlayer="Someone else";state.boardMarket="Receptions"');
  c.nodes.get('#findBookmarkPicks').onclick();
  check(c.eval('state.view==="board"&&selectedPlayer===""&&state.boardMarket==="All"'),`${width}: recovery clears obstructing filters`);
  c.eval('props=[{...demoProps[0],eventID:"NFL--fixture"}];state.saved.add(savedPropKey(props[0]));localStorage.setItem("propedge-saved",JSON.stringify([...state.saved]))');
  c.nodes.get('#openSavedProps').onclick();
  check(c.eval('state.view==="saved"&&visibleProps().length===1'),`${width}: saved picks accessible`);
  const storage=c.eval('Object.fromEntries(["propedge-saved","btg-bookmark-recovery-v1"].map(k=>[k,localStorage.getItem(k)]))');
  const reload=client(width,storage);assert.ifError(reload.error);
  check(!reload.nodes.get('#bookmarkRecovery').hidden,`${width}: saving one pick does not erase reminder`);
  reload.nodes.get('#dismissBookmarkRecovery').onclick();
  check(reload.nodes.get('#bookmarkRecovery').hidden,`${width}: dismiss works`);
  storage['btg-bookmark-recovery-v1']=reload.eval('localStorage.getItem("btg-bookmark-recovery-v1")');
  check(client(width,storage).nodes.get('#bookmarkRecovery').hidden,`${width}: dismissal persists`);
}
check(client(390).nodes.get('#bookmarkRecovery').hidden,'new users see no migration reminder');
check(client(1440,{'propedge-saved':'broken'}).nodes.get('#bookmarkRecovery').hidden,'corrupt data does not fabricate legacy picks');
// Every ID used by the new controls exists in real HTML, not just the DOM stub.
for(const id of ['bookmarkRecovery','legacyBookmarkCount','openSavedProps','findBookmarkPicks','dismissBookmarkRecovery','playerSearch'])check(read('dist/index.html').includes(`id="${id}"`),`${id} exists`);
console.log(`PASS: ${checks} bookmark recovery checks across ${widths.length} viewport configurations (DOM simulation, not visual layout verification)`);
