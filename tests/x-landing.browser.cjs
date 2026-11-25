// Visitors from X (Nov 25, Tim: drive the Thanksgiving traffic). Runs the real page in Chromium
// against the recorded pre-game fixture, arriving from one of our X posts (utm_source=xpost): the
// welcome block sits at the top of the home page with the closing-price and season records and one
// sign-up button; a visitor from anywhere else doesn't get it.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); } catch { console.log('SKIP: pre-game browser test (playwright not installed)'); process.exit(0); }

const root = path.join(__dirname, '..'), dist = f => path.join(root, 'dist', f);
const fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/pregame.json'), 'utf8'));
const types = { js: 'application/javascript', css: 'text/css', html: 'text/html; charset=utf-8' };

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, timezoneId: 'America/Los_Angeles', userAgent: 'Mozilla/5.0 (iPhone) headless-audit' });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.clock.install({ time: new Date(fx.at) }); await page.clock.resume();
    const handler = async route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'betthisguy.com') return route.abort();
      const p = url.pathname;
      if (p === '/') return route.fulfill({ body: fs.readFileSync(dist('index.html'), 'utf8'), contentType: types.html });
      const file = p.match(/^\/([a-z-]+\.(js|css))$/);
      if (file) return fs.existsSync(dist(file[1])) ? route.fulfill({ body: fs.readFileSync(dist(file[1]), 'utf8'), contentType: types[file[2]] }) : route.fulfill({ status: 404, body: '' });
      if (p === '/api/props') return route.fulfill({ json: url.searchParams.get('sport') === 'NBA' ? fx.props : { success: true, data: [] } });
      if (p === '/api/live-games') return route.fulfill({ json: url.searchParams.get('sport') === 'NBA' ? fx.games : { success: true, games: [] } });
      if (p === '/api/record' && url.searchParams.get('view') === 'home') return route.fulfill({ json: fx.record });
      if (p === '/api/predictions') return route.fulfill({ json: fx.predictions });
      if (p.startsWith('/api/')) return route.fulfill({ json: { success: true, data: [] } });
      return route.fulfill({ status: 404, body: '' });
    };
    await page.route('**/*', handler);
    await page.goto('https://betthisguy.com/?utm_source=xpost');
    await page.waitForSelector('#xWelcome', { timeout: 15000 });
    await page.waitForFunction(() => document.querySelectorAll('#xWelcome .xw-chip').length >= 2, null, { timeout: 15000 });
    const text = await page.locator('#xWelcome').innerText();
    assert.match(text, /Locked before the game\. Graded in public\./);
    assert.match(text, /\d+% beat the closing price/, 'the closing-price record');
    assert.match(text, /(NBA|NFL) \d+–\d+/, 'the season record');
    assert.equal(await page.locator('#heroBanner > #xWelcome').count(), 1, 'at the top of the home page');
    await page.locator('[data-xw-go]').click();
    assert.deepEqual(errors, [], 'no page errors');
    // A visitor not from X doesn't see it.
    const other = await browser.newPage();await other.route('**/*', handler);await other.goto('https://betthisguy.com/?league=NBA');await other.waitForSelector('#heroBanner');await other.waitForTimeout(1500);
    assert.equal(await other.locator('#xWelcome').count(), 0, 'only for visitors from X');
    console.log('PASS: visitors from X get the welcome block (closing-price record, season record, one sign-up button); others do not');
  } finally { await browser.close(); }
})();
