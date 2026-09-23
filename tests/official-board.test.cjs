const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const home = fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8');
const trust = fs.readFileSync(path.join(root, 'dist/trust.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'dist/nfl.css'), 'utf8');
const app = fs.readFileSync(path.join(root, 'dist/app.js'), 'utf8');

assert.match(home, /href="\/trust#official"/);
assert.match(home, /Official Picks/);
assert.match(home, /<h2 id="viewTitle">Bet These Guys<\/h2>/);
assert.match(home, /id="savedHeaderCount"/);
assert.match(app, /top-play-badge/);
assert.match(app, /function verifiedCard\(p,rank=-1,featured=false\)/);
assert.match(app, /featuredLongshotMarket/);
assert.match(css, /\.proof-banners\{display:grid/);
assert.match(css, /@media\(max-width:720px\).*\.proof-banners\{grid-template-columns:1fr/s);

for (const id of ['officialPanel', 'officialStatus', 'officialCaps', 'officialWeek', 'officialGames', 'officialLatest', 'officialMissing', 'officialGroups']) {
  assert.match(trust, new RegExp(`id="${id}"`));
}
assert.match(trust, /const officialCaps=\{props:100,reasonable:15,swing:10,moonshot:5\}/);
assert.match(trust, /function renderOfficial\(rows=\[\]\)/);
assert.match(trust, /renderOfficial\(data\.recent\|\|\[\]\)/);
assert.match(trust, /Refreshes can add qualifying picks, but never replace a published selection/);

console.log('official board tests passed');
