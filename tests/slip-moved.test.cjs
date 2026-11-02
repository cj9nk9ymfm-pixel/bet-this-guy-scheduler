const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
// Add to slip when the posted line moved (Nov 2, Dyson Daniels Under 5.5 assists
// went to 6.5): the board's current line, only when the move helps the pick.
const src=fs.readFileSync('dist/app.js','utf8'),grab=name=>{const i=src.indexOf(`function ${name}(`);let d=0,j=src.indexOf('{',i);for(;j<src.length;j++){if(src[j]==='{')d++;else if(src[j]==='}'&&!--d)break}return src.slice(i,j+1)};
const ctx=vm.createContext({});vm.runInContext(`${grab('boardPropFor')}\n${grab('boardPropNow')}\nvar props=[{player:'Dyson Daniels',market:'Assists',line:6.5},{player:'Jalen Brunson',market:'Points',line:24.5}];`,ctx);
const run=c=>JSON.parse(JSON.stringify(vm.runInContext(c,ctx)));
assert.deepEqual(run(`boardPropNow({player:'Dyson Daniels',market:'Assists',side:'Under',line:5.5}).moved`),{from:5.5,line:6.5,ourWay:true},'Under 5.5 to 6.5: in the pick\'s favor');
assert.equal(run(`boardPropNow({player:'Dyson Daniels',market:'Assists',side:'Over',line:5.5}).moved.ourWay`),false,'Over 5.5 to 6.5: against');
assert.equal(run(`boardPropNow({player:'Jalen Brunson',market:'Points',side:'Over',line:24.5}).moved`),null,'same line: the exact prop');
assert.equal(run(`boardPropNow({player:'Nobody',market:'Points',side:'Over',line:9.5})`),null,'not on the board');
console.log('PASS: Add to slip after a line move (current line when it helps the pick, never when it hurts)');
