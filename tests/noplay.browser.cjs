// No play yet (Nov 9, Tim): with nothing left to play, the picks sit collapsed under
// Final and the "we passed on N props so far" line goes above them.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); } catch { console.log('SKIP: no-play browser test (playwright not installed)'); process.exit(0); }

const root = path.join(__dirname, '..'), dist = f => path.join(root, 'dist', f);
const fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/pregame.json'), 'utf8'));
// Every pick tonight already graded: nothing left to play.
fx.record.recent = fx.record.recent.map(r => ({ ...r, status: 'final', result: 'won', game_time: new Date(Date.parse(fx.at) - 5 * 3600000).toISOString() }));
const types = { js: 'application/javascript', css: 'text/css', html: 'text/html; charset=utf-8' };

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, timezoneId: 'America/Los_Angeles', userAgent: 'Mozilla/5.0 (iPhone) headless-audit' });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.clock.install({ time: new Date(fx.at) }); await page.clock.resume();
    await page.route('**/*', async route => {
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
      if (p === '/api/passed') return route.fulfill({ json: { success: true, count: 4, reasons: { price: 1, stats: 3, sharp: 0, other: 0 } } });
      if (p.startsWith('/api/')) return route.fulfill({ json: { success: true, data: [] } });
      return route.fulfill({ status: 404, body: '' });
    });
    await page.goto('https://betthisguy.com/?league=NBA');
    const need = async (what, wait) => { try { await wait(); } catch { assert.fail(`no-play view broke: ${what}`); } };
    await need('the graded picks should list under Final', () => page.waitForSelector('#officialNowList .on-final-toggle', { timeout: 20000 }));
    assert.equal(await page.locator('#officialNowList .on-final').isHidden(), true, 'Final starts collapsed when nothing is left to play');
    await need('the passed line should show', () => page.waitForSelector('#onPassed:not([hidden])', { timeout: 15000 }));
    const above = await page.evaluate(() => { const p = document.getElementById('onPassed'), l = document.getElementById('officialNowList'); return !!(p.compareDocumentPosition(l) & Node.DOCUMENT_POSITION_FOLLOWING); });
    assert.ok(above, 'the passed line sits above the picks');
    const txt = await page.locator('#onPassed').innerText();
    assert.match(txt, /No play yet tonight\. We passed on 4 props so far: 1 priced too long, 3 where his numbers disagreed/);
    assert.deepEqual(errors, [], 'no page errors');
    console.log('PASS: no play yet: the week\'s picks collapsed under Final, the passed-so-far line above them');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
