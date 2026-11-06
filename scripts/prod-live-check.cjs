// Live tracking on the real site (Nov 5, Tim): during game windows, if one of
// our picks is in a game in progress, the home page must show it as a live
// card and the Live tab must list it. Exit 1 (the workflow then pings) if not.
// Read-only; visits carry the owner cookie and a headless UA so analytics skip them.
const { chromium } = require('playwright');
const SITE = process.env.BTG_SITE_URL || 'https://betthisguy.com';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile headless-audit';
const get = async path => { const r = await fetch(SITE + path, { headers: { 'user-agent': UA, accept: 'application/json' } }); if (!r.ok) throw new Error(`${path} ${r.status}`); return r.json(); };

(async () => {
  const now = Date.now(), problems = [], checked = [];
  for (const league of ['NBA', 'NFL']) {
    const games = ((await get(`/api/live-games${league === 'NBA' ? '?sport=NBA' : ''}`)).games || []).filter(g => g.state === 'in_progress');
    if (!games.length) continue;
    const rec = await get(`/api/record?view=home${league === 'NBA' ? '&sport=NBA' : ''}`);
    const inPlay = t => Date.parse(t) < now - 10 * 60000 && Date.parse(t) > now - 4 * 3600000;
    const started = (rec.recent || []).filter(r => !r.result && r.kind === 'prop' && inPlay(r.game_time));
    // Prediction-app picks show on the Live tab too.
    const pm = ((await get(`/api/predictions?league=${league}`).catch(() => ({}))).pmPicks || []).filter(r => !r.result && !r.voidReason && inPlay(r.gameTime));
    if (!started.length && !pm.length) continue;
    checked.push(`${league}: ${[...started.map(r => r.player), ...pm.map(r => `${r.player} (app)`)].join(', ')}`);
    const browser = await chromium.launch();
    try {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: UA, timezoneId: 'America/Los_Angeles' });
      await ctx.addCookies([{ name: 'btg_owner', value: '1', domain: new URL(SITE).hostname, path: '/' }]);
      const page = await ctx.newPage();
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.goto(`${SITE}/?league=${league}`, { waitUntil: 'domcontentloaded' });
      const live = !started.length || await page.waitForSelector('#officialNowList .lv2', { timeout: 60000 }).then(() => true).catch(() => false);
      if (!live) problems.push(`${league}: ${started.length} pick(s) in progress (${started.map(r => r.player).join(', ')}) but no live card on the picks page`);
      await page.evaluate(() => typeof showMobilePage === 'function' && showMobilePage('live', true));
      const tab = await page.waitForSelector('#livePicksList .lp2', { timeout: 30000 }).then(() => true).catch(() => false);
      if (!tab) problems.push(`${league}: the Live tab lists none of our picks`);
      else { const names = await page.$$eval('#livePicksList .lp2 .lp2-who b', e => e.map(x => x.textContent)); const missing = [...started, ...pm].map(r => r.player).filter(n => !names.includes(n)); if (missing.length) problems.push(`${league}: the Live tab is missing ${missing.join(', ')}`); }
      if (errors.length) problems.push(`${league}: page errors: ${errors.slice(0, 2).join(' | ').slice(0, 200)}`);
    } finally { await browser.close(); }
  }
  console.log(checked.length ? `Checked ${checked.join('; ')}` : 'No pick of ours in a game in progress: nothing to check.');
  if (problems.length) { console.log('PROBLEMS:\n- ' + problems.join('\n- ')); process.exit(1); }
  console.log('Live tracking OK.');
})().catch(e => { console.log('check error: ' + e.message); process.exit(2); });
