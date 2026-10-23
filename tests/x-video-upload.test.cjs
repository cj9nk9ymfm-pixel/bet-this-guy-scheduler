const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),{webcrypto}=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const {read}=require('./helpers/client.cjs');
// Videos for X go up with the chunked media upload: initialize, append in
// pieces, finalize, wait for processing. Owner video posts retry at most 3 times.
(async()=>{
  const calls=[];let step=0;
  const reply=(status,body)=>({ok:status<300,status,json:async()=>body});
  const context=vm.createContext({URL,URLSearchParams,Request,Response,Headers,FormData,Blob,AbortSignal,Date,console,setTimeout,clearTimeout,crypto:webcrypto,TextEncoder,btoa,atob});
  const t=read('worker/index.template.js');
  vm.runInContext(t.slice(t.indexOf('const API_BASE')).replace('__MOVEMENT_SERVER__',read('worker/movement.js')).replace('__LIVE_SERVER__',read('worker/live.js')).replace('__STATS_SHARED__',read('dist/stats.js')).replace('__RECORDS_SERVER__',read('worker/records.js')).replace('__ACCOUNTS_SERVER__',read('worker/accounts.js')).replace('export default {','this.worker={'),context);
  context.fetch=async(url,init)=>{const u=new URL(url);calls.push([init.method,u.pathname,u.searchParams.get('command')||(init.body instanceof FormData?init.body.get('command')||`seg${init.body.get('segment_index')}`:'')]);
      if(u.pathname.endsWith('/initialize'))return reply(200,{data:{id:'v9'}});
      if(u.pathname.endsWith('/append'))return reply(204,{});
      if(u.pathname.endsWith('/finalize'))return reply(200,{data:{id:'v9',processing_info:{state:'pending',check_after_secs:1}}});
      if(init.method==='GET')return reply(200,{data:{processing_info:{state:++step<2?'in_progress':'succeeded',check_after_secs:1}}});
      return reply(500,{})};
  const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE app_settings(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT)');
  const wrap=(sql,args=[])=>({bind(...v){return wrap(sql,v)},async first(){return db.prepare(sql).get(...args)||null},async all(){return{results:db.prepare(sql).all(...args)}},async run(){const r=db.prepare(sql).run(...args);return{success:true,meta:{changes:Number(r.changes)}}}});
  context.env={DB:{prepare:sql=>wrap(sql)},X_API_KEY:'k',X_API_SECRET:'s',X_ACCESS_TOKEN:'1-t',X_ACCESS_SECRET:'a'};
  context.mp4=new Uint8Array(2.5*1024*1024);
  const id=await vm.runInContext('xUploadVideo(env,mp4,async()=>{})',context);
  assert.equal(id,'v9');
  assert.deepEqual(calls.map(c=>c.slice(1).join(' ')),['/2/media/upload/initialize ','/2/media/upload/v9/append seg0','/2/media/upload/v9/append seg1','/2/media/upload/v9/append seg2','/2/media/upload/v9/finalize ','/2/media/upload STATUS','/2/media/upload STATUS']);
  // v2 refused: falls back to the v1.1 chunked commands.
  calls.length=0;context.fetch=async(url,init)=>{const u=new URL(url),cmd=init.body instanceof FormData?init.body.get('command'):u.searchParams.get('command');calls.push(cmd||u.pathname);
    if(u.hostname==='api.x.com')return reply(403,{title:'Forbidden'});
    if(cmd==='INIT')return reply(202,{media_id_string:'v1'});if(cmd==='APPEND')return reply(204,{});
    if(cmd==='FINALIZE')return reply(200,{media_id_string:'v1',processing_info:{state:'succeeded'}});return reply(500,{})};
  assert.equal(await vm.runInContext('xUploadVideo(env,new Uint8Array(10),async()=>{})',context),'v1');
  assert.deepEqual(calls,['/2/media/upload/initialize','INIT','APPEND','FINALIZE']);
  // Processing failure is an error, not a post without the video.
  context.fetch=async(url,init)=>{const u=new URL(url);if(u.pathname.endsWith('/initialize'))return reply(200,{data:{id:'v3'}});if(u.pathname.endsWith('/append'))return reply(204,{});return reply(200,{data:{processing_info:{state:'failed',error:{message:'bad codec'}}}})};
  await assert.rejects(vm.runInContext('xUploadVideo(env,new Uint8Array(10),async()=>{})',context),/bad codec/);
  // Owner post with a video: uploads the MP4 shipped in dist/x, then posts with it.
  context.X_POST_IMAGES={'ad.mp4':Buffer.from([1,2,3]).toString('base64')};
  const sent=[];context.xPost=async(env,text,m)=>{sent.push([text,m]);return {data:{id:'77'}}};
  const got=[];context.xUploadVideo=async(env,bytes)=>{got.push([...bytes]);return 'vid1'};
  db.prepare("INSERT INTO app_settings(key,value) VALUES('x-custom-post',?)").run(JSON.stringify({text:'Ad',video:'ad.mp4'}));
  assert.equal((await vm.runInContext('postCustomToX(env)',context)).graphic,true);assert.deepEqual(sent,[['Ad','vid1']]);assert.deepEqual(got,[[1,2,3]]);
  // A slate card is drawn and attached.
  const drawn=[];context.xSlateSvgFaces=async o=>{drawn.push(o.kicker);return '<svg/>'};context.renderCardPng=async()=>new Uint8Array([9]);context.xUploadImage=async()=>'img1';sent.length=0;
  db.prepare("INSERT INTO app_settings(key,value) VALUES('x-custom-post',?)").run(JSON.stringify({text:'Card',slate:{kicker:'NFL · PREDICTION PICKS',picks:[{text:'A · Over 1.5',odds:'54%'}]}}));
  assert.equal((await vm.runInContext('postCustomToX(env)',context)).graphic,true);assert.deepEqual(sent,[['Card','img1']]);assert.deepEqual(drawn,['NFL · PREDICTION PICKS']);
  // A failing upload is put back for two more runs, then dropped.
  context.xUploadVideo=async()=>{throw new Error('X video upload failed')};
  db.prepare("INSERT INTO app_settings(key,value) VALUES('x-custom-post',?)").run(JSON.stringify({text:'Ad',video:'ad.mp4'}));
  for(let i=0;i<3;i++)assert.equal((await vm.runInContext('postCustomToX(env)',context)).posted,0);
  assert.equal(db.prepare("SELECT value FROM app_settings WHERE key='x-custom-post'").get(),undefined,'gives up after 3 tries');
  console.log('PASS: X video upload: chunked v2 upload with processing wait, v1.1 fallback, processing failures stop the post');
})().catch(e=>{console.error(e);process.exit(1)});
