// Before tip-off (Nov 5, Tim): the paths people bet from. Runs the real page
// (dist/index.html, app.js, live.js) in Chromium against a recorded NBA prop
// feed with four official picks later today: the busy-day list (top pick card
// plus rows), the backing stat on the card, a price into the slip, a row into
// its pick sheet, and the prediction-app card's price into the slip.
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
      if (p.startsWith('/api/')) return route.fulfill({ json: { success: true, data: [] } });
      return route.fulfill({ status: 404, body: '' });
    });
    await page.goto('https://betthisguy.com/?league=NBA');
    const need = async (what, wait) => { try { await wait(); } catch { assert.fail(`pre-game broke: ${what}`); } };
    const picks = fx.record.recent.map(r => r.player);

    // Four picks to play: the busy-day list, the best one as a card with its backing stat, the rest as rows.
    await need('four open picks should show as the busy-day list', () => page.waitForSelector('#officialNowList .pd-wrap .pc2', { timeout: 20000 }));
    const top = await page.locator('#officialNowList .pc2').first().innerText();
    assert.ok(picks.some(n => top.includes(n)) && top.includes('13/20') && top.includes('Slip'), `top card with the stat and the price: ${top}`);
    assert.equal(await page.locator('#officialNowList .pd-wrap .pr2').count(), picks.length - 1, 'one row for each other pick (the top pick is the card, not a row too)');
    assert.equal(await page.locator('#officialNowList .lv2').count(), 0, 'nothing live before tip-off');

    // The top card's price goes into the slip.
    await page.locator('#officialNowList .pc2 [data-slip-price]').first().click();
    await need('tapping a pick card price should add it to the slip', () => page.waitForFunction(() => state.slip.length === 1, null, { timeout: 15000 }));

    // A row opens its pick sheet.
    await page.locator('#officialNowList .pd-wrap .pr2 .pr2-t').first().click();
    await need('tapping a pick row should open its sheet', () => page.waitForSelector('dialog[open]', { timeout: 10000 }));
    const sheet = await page.locator('dialog[open]').first().innerText();
    assert.ok(picks.some(n => sheet.includes(n)), `the sheet is the pick: ${sheet.slice(0, 120)}`);
    await page.keyboard.press('Escape');await page.waitForTimeout(300);

    // Prediction apps (Nov 9, Tim: the four pages look exactly the same): the open pick is the
    // same card as the sportsbook's (header, price button, stat, edge line, "I bet this"), its
    // price as a chance; the same record card on top; the price goes into the slip.
    const anatomy = sel => page.$$eval(sel, els => els.slice(0, 1).map(el => ['.pc-head', '.pc-main', '.pc-price', '.pc-edge', '.pc-foot', '[data-ibet]'].map(q => !!el.querySelector(q))));
    const bookParts = await anatomy('#officialNowList .pc2');
    await page.locator('button:visible:text-is("Prediction apps")').first().click();
    await need('the prediction-app pick should show as the same card', () => page.waitForSelector('#pmPicksList .pc2', { timeout: 15000 }));
    assert.deepEqual(await anatomy('#pmPicksList .pc2'), bookParts, 'prediction card has the same parts as the sportsbook card');
    const pm = await page.locator('#pmPicksList .pc2').first().innerText();
    assert.ok(pm.includes(fx.predictions.pmPicks[0].player) && /\d+%/.test(pm) && /I bet this/.test(pm), `prediction card with its price as a chance: ${pm}`);
    assert.ok(await page.locator('#pmRecCard .rc-top').count(), 'the same record card on the prediction page');
    await page.locator('#pmPicksList .pc2 [data-slip-price]').first().click();
    await need('tapping the prediction price should add it to the slip', () => page.waitForFunction(() => state.slip.length === 2, null, { timeout: 15000 }));

    assert.deepEqual(errors, [], 'no page errors');
    console.log('PASS: pre-game: busy-day list with the backing stat, price to slip, row to sheet; the prediction page uses the same card and record card, price to slip');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
