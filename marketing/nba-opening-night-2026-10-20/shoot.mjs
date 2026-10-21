import {chromium} from '/opt/node22/lib/node_modules/playwright/index.mjs'; // Playwright install path in this environment
const dir=process.argv[2],b=await chromium.launch(),p=await b.newPage({viewport:{width:1200,height:675},deviceScaleFactor:2});
await p.goto(`file://${dir}/pin.html`);await p.waitForTimeout(600);await p.screenshot({path:`${dir}/nba-opening-night.png`});await b.close();
