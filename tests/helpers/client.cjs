const fs=require('node:fs'),vm=require('node:vm');
const ROOT=require('node:path').resolve(__dirname,'../..');
const read=f=>fs.readFileSync(`${ROOT}/${f}`,'utf8');
function node(id=''){
  const classes=new Set();
  return {id,value:'',innerHTML:'',textContent:'',hidden:false,disabled:false,open:false,checked:false,dataset:{},style:{setProperty(){}},children:[],
    classList:{add(...xs){xs.forEach(x=>classes.add(x))},remove(...xs){xs.forEach(x=>classes.delete(x))},contains:x=>classes.has(x),toggle(x,on){if(on===undefined)on=!classes.has(x);on?classes.add(x):classes.delete(x);return on}},
    get parentElement(){return node('parent')},querySelector:s=>node(s),querySelectorAll:()=>[],addEventListener(){},setAttribute(){},removeAttribute(){},append(...items){this.children.push(...items)},prepend(){},before(){},remove(){this.removed=true},cloneNode(){const copy=node(id+'-clone');copy.innerHTML=this.innerHTML;copy.textContent=this.textContent;return copy},insertAdjacentHTML(where,s){this.innerHTML+=s},closest:s=>node(s),contains:()=>false,scrollIntoView(){},scrollTo(){},focus(){},blur(){},showModal(){this.open=true},close(){this.open=false},getBoundingClientRect:()=>({top:0,bottom:1}),getContext:()=>new Proxy({},{get:()=>()=>{}})};
}
function client(width=390,storage={}){
  const nodes=new Map(),requests=[],events={}; const get=s=>{if(!nodes.has(s))nodes.set(s,node(s));return nodes.get(s)};
  const store=new Map(Object.entries(storage));
  const doc={hidden:false,body:node('body'),documentElement:node('html'),querySelector:get,querySelectorAll:()=>[],createElement:tag=>node(tag),addEventListener:(name,fn)=>(events[name]??=[]).push(fn)};
  for(const [key,v] of Object.entries({wager:'10',oddsSlider:'19',legsSlider:'5'}))get('#'+key).value=v;
  const sandbox={document:doc,innerWidth:width,innerHeight:844,scrollY:0,location:new URL('https://test.invalid/'),history:{pushState(){}},navigator:{onLine:true},
    localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)},
    setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},requestAnimationFrame:()=>1,addEventListener:(name,fn)=>(events[name]??=[]).push(fn),scrollTo(){},
    console,URL,URLSearchParams,Request,Response,Headers,AbortSignal,Blob,Date,Intl,Image:class{},IntersectionObserver:class{observe(){} disconnect(){}},
    fetch:async(url,opts={})=>{requests.push({url:String(url),...opts});return Response.json({success:true,data:[],games:[],stats:[],summary:[],recent:[],analytics:[]})}};
  sandbox.window=sandbox;const ctx=vm.createContext(sandbox);let error;
  try{vm.runInContext(read('dist/stats.js'),ctx);vm.runInContext(read('dist/movement.js'),ctx);vm.runInContext(read('dist/app.js'),ctx,{filename:'app.js'});vm.runInContext(read('dist/live.js'),ctx,{filename:'live.js'});}catch(e){error=e.stack}
  return {ctx,nodes,requests,events,error,eval:s=>vm.runInContext(s,ctx)};
}

module.exports={client,read};
