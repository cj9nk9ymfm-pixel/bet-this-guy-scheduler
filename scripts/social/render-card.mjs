// Render an SVG card to PNG with the same fonts as the X graphics.
// Usage: node scripts/social/render-card.mjs in.svg out.png
import {Resvg,initWasm} from '@resvg/resvg-wasm';
import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
await initWasm(await readFile(require.resolve('@resvg/resvg-wasm/index_bg.wasm')));
const fontBuffers=await Promise.all(['SpaceGrotesk-Bold','Inter-ExtraBold','Inter-SemiBold'].map(n=>readFile(new URL(`../../worker/fonts/${n}.ttf`,import.meta.url))));
const svg=await readFile(process.argv[2],'utf8');
await writeFile(process.argv[3],new Resvg(svg,{fitTo:{mode:'original'},font:{fontBuffers,loadSystemFonts:false,defaultFontFamily:'BTG Inter SB'}}).render().asPng());
