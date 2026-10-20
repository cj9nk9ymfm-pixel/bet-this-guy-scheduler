import {chromium} from '/opt/node22/lib/node_modules/playwright/index.mjs'; // Playwright install path in this environment
import fs from 'fs';
const dir=process.argv[2],b=await chromium.launch();
for(const [m,w,h] of [['16',1200,675],['45',1080,1350]]){const p=await b.newPage({viewport:{width:w,height:h},deviceScaleFactor:2});await p.goto(`file://${dir}/ad.html?m=${m}`);await p.waitForTimeout(500);await p.screenshot({path:`${dir}/ad-${m}.png`});await p.close()}
if(process.argv[3]==='video'){fs.mkdirSync(dir+'/frames',{recursive:true});const p=await b.newPage({viewport:{width:1080,height:1350}});await p.goto(`file://${dir}/ad.html?m=v`);await p.waitForTimeout(500);
 const fps=30,dur=13.5;for(let i=0;i<fps*dur;i++){await p.evaluate(t=>setT(t),i/fps);await p.screenshot({path:`${dir}/frames/f${String(i).padStart(4,'0')}.png`})}}
await b.close();
