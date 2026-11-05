// Live progress on every pick (Nov 4, Tim: "we lost the live follow on the
// main prop page"). Runs the real page (dist/index.html, app.js, live.js) in
// a browser against a recorded NBA night: Payton Pritchard (sportsbook, Under
// 3.5 rebounds) and Joel Embiid (prediction app, Over 3.5 assists) in games in
// progress, plus a later pick that hasn't started. Every place a started pick
// shows must show how it's doing: the pick lists (both sides), the Live tab,
// the slip and My bets, and the numbers must move with the next live update.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); } catch { console.log('SKIP: live cards browser test (playwright not installed)'); process.exit(0); }

const root = path.join(__dirname, '..'), dist = f => path.join(root, 'dist', f);
const fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/live-cards.json'), 'utf8'));
const types = { js: 'application/javascript', css: 'text/css', html: 'text/html; charset=utf-8' };

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, timezoneId: 'America/Los_Angeles', userAgent: 'Mozilla/5.0 (iPhone) headless-audit' });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    // The recorded moment, then the clock runs, so the live board's refresh comes due.
    await page.clock.install({ time: new Date(fx.at) }); await page.clock.resume();
    const stats = JSON.parse(JSON.stringify(fx.stats));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'betthisguy.com') return route.abort();
      const p = url.pathname;
      if (p === '/') return route.fulfill({ body: fs.readFileSync(dist('index.html'), 'utf8'), contentType: types.html });
      const file = p.match(/^\/([a-z-]+\.(js|css))$/);
      if (file) return fs.existsSync(dist(file[1])) ? route.fulfill({ body: fs.readFileSync(dist(file[1]), 'utf8'), contentType: types[file[2]] }) : route.fulfill({ status: 404, body: '' });
      if (p === '/api/live-games') return route.fulfill({ json: { ...fx.games, updatedAt: new Date(fx.at).toISOString() } });
      if (p === '/api/live-game-stats') return route.fulfill({ json: stats[url.searchParams.get('game_id')] || { success: true, stats: [] } });
      if (p === '/api/record' && url.searchParams.get('view') === 'home') return route.fulfill({ json: fx.record });
      if (p === '/api/predictions') return route.fulfill({ json: fx.predictions });
      if (p.startsWith('/api/')) return route.fulfill({ json: { success: true, data: [] } });
      return route.fulfill({ status: 404, body: '' });
    });
    await page.goto('https://betthisguy.com/?league=NBA');
    const text = sel => page.locator(sel).first().innerText();
    // A wait that fails with what broke, not just a timeout.
    const need = async (what, wait) => { try { await wait(); } catch { assert.fail(`live tracking broke: ${what}`); } };

    // Sportsbook list: the started pick is a live card (not the pre-game card), the later one is still bettable.
    await need('a started sportsbook pick should show as a live card on the pick list', () => page.waitForSelector('#officialNowList .lv2[data-lv-kind="on"]', { timeout: 20000 }));
    const sb = await text('#officialNowList .lv2[data-lv-kind="on"]');
    for (const bit of ['Payton Pritchard', 'Live', '1', '/ 3.5', 'so far', 'loses at 4', 'MIL', 'BOS']) assert.ok(sb.includes(bit), `sportsbook live card shows "${bit}": ${sb}`);
    assert.ok(await page.locator('#officialNowList .lv2 .lv-pips').count(), 'with its bars');
    const pre = await page.locator('#officialNowList .pc2', { hasText: 'Luka Test' }).count();
    assert.equal(pre, 1, 'a pick whose game has not started keeps the pre-game card');
    assert.equal(await page.locator('#officialNowList .pc2', { hasText: 'Payton Pritchard' }).count(), 0, 'a started pick is never shown as a pre-game card');

    // The next live update moves the number (Pritchard grabs a 2nd rebound).
    stats['21718029'].stats[0].reb = 2;
    await need('the live card should update on the next live tick (1 -> 2 rebounds)', () => page.waitForFunction(() => /2\s*\/ 3\.5/.test(document.querySelector('#officialNowList .lv2[data-lv-kind="on"]')?.innerText || ''), null, { timeout: 20000 }));

    // Live tab: every pick of ours tonight, counted on top.
    await page.evaluate(() => showMobilePage('live', true));
    await need('the Live tab should list our picks with counts', () => page.waitForSelector('#livePicksList .lp2-sum', { timeout: 10000 }));
    const lt = await text('#livePicksList');
    assert.ok(lt.includes('Payton Pritchard') && lt.includes('Joel Embiid'), `Live tab lists both sides: ${lt}`);
    assert.match(lt, /2\s*Live/, 'two picks counted live');
    await page.evaluate(() => showMobilePage('picks', true));

    // Slip: a leg in a game in progress shows its stat, not "Market unavailable".
    await page.evaluate(() => { state.slip = [{ p: { id: 999001, sport: 'NBA', player: 'Payton Pritchard', market: 'Rebounds', line: 3.5, team: 'Milwaukee Bucks · @ Boston Celtics', startsAt: '2026-11-05T00:40:00.000Z', eventID: 'x', over: -110, under: -110 }, side: 'Under', odds: -102 }]; renderSlip(); });
    const slip = await text('.slip-leg .slip-live');
    assert.ok(/2\s*\/ 3\.5/.test(slip), `slip leg shows the live count: ${slip}`);
    assert.equal(await page.locator('#payout').innerText(), 'Game started');

    // My bets: an open bet on the pick shows the live block.
    const id = fx.record.recent[0].id;
    await page.evaluate(id => { localStorage.setItem('btg-mybets', JSON.stringify([{ id: 'b1', pickId: id, player: 'Payton Pritchard', bet: 'Under 3.5 Rebounds', odds: -102, stake: 100, at: Date.now() }])); window.BTGMyBets.open(); }, id);
    const mb = await text('.mb-live');
    assert.ok(mb.includes('Live') && /2\s*\/ 3\.5/.test(mb), `My bets shows the live block: ${mb}`);
    await page.evaluate(() => document.getElementById('myBetsDialog')?.close?.());

    // Prediction apps: the started pick is the same live card.
    await page.locator('button:visible:text-is("Prediction apps")').first().click();
    await need('a started prediction-app pick should show as a live card', () => page.waitForSelector('#pmPicksList .lv2[data-lv-kind="pm"]', { timeout: 15000 }));
    const pm = await text('#pmPicksList .lv2[data-lv-kind="pm"]');
    for (const bit of ['Joel Embiid', 'Live', '2', '/ 3.5', 'needs 2 more', 'PHI', 'DET']) assert.ok(pm.includes(bit), `prediction live card shows "${bit}": ${pm}`);

    assert.deepEqual(errors, [], 'no page errors');
    console.log('PASS: live progress on every pick: pick lists (sportsbook and prediction apps), Live tab, slip and My bets, updated on the next live tick');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
