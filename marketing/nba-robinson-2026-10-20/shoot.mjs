import {chromium} from '/opt/node22/lib/node_modules/playwright/index.mjs'; // Playwright install path in this environment
import fs from 'fs';
const dir=process.argv[2],b=await chromium.launch(),p=await b.newPage({viewport:{width:1080,height:1350}});
await p.goto(`file://${dir}/video.html`);await p.waitForTimeout(600);
if(process.argv[3]==='stills'){for(const t of [2.5,6,9.5,13.5,17.5,21.5]){await p.evaluate(t=>setT(t),t);await p.screenshot({path:`${dir}/still-${t}.png`})}}
else{fs.mkdirSync(dir+'/frames',{recursive:true});const fps=30,dur=22.5;for(let i=0;i<fps*dur;i++){await p.evaluate(t=>setT(t),i/fps);await p.screenshot({path:`${dir}/frames/f${String(i).padStart(4,'0')}.png`})}}
await b.close();
