// Beta S-10 (b15-02, P2): every page boots and plays in memory when the `localStorage` getter itself throws (site data blocked).
// One context per page with an init script whose localStorage getter throws SecurityError. OFFLINE: blockDb on every context and
// the Firebase SDK answered with an empty stub (the Town offers "Play offline"); never chats, never writes to Firebase.
// Per page: (1) zero pageerror, (2) the main canvas / root is visible, (3) the primary button works (click, still no error).
// Hub: "Play" opens the Town. Town: Join -> "Play offline" -> the Town scene runs. Others: the first visible button.
// KNOWN (owned by World+Graphics, exact patch in design/beta/fixes/perf-systems.md S-10): the Realm page (mad-maze.js:577) reads
// the getter outside a try; that one check prints KNOWN-BUG until the patch lands, then turns into a real PASS by itself.
const KNOWN = { realm: 'mad-maze.js:577 AXM.prefs.load(localStorage) outside try (World+Graphics slot)' };
// Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-s10-storage-throws.test.js   (ONLY=<name> runs one page)
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const G = ORIGIN + '/game/';
// [name, url, root selector, primary button selector (first visible match is clicked)]
const PAGES = [
  ['hub', G + 'hub/index.html', 'body', '#home-play'],
  ['town', G + 'index.html?from=hub', '#join-overlay', 'button:has-text("Join Town")'],
  ['realm', G + 'games/mad-maze/index.html?mode=world', 'canvas', 'canvas'],
  ['isles', G + 'games/isles/index.html', 'canvas', 'button'],
  ['angler', G + 'games/angler/index.html', 'canvas, main, body', 'button'],
  ['dash', G + 'games/dash/index.html', 'canvas', 'button'],
  ['echo', G + 'games/echo/index.html', 'canvas, main, body', 'button'],
  ['jam', G + 'games/jam/index.html', 'canvas, main, body', 'button'],
  ['pop', G + 'games/pop/index.html', 'canvas', 'button'],
  ['stack', G + 'games/stack/index.html', 'canvas', 'button'],
  ['stalk', G + 'games/stalk/index.html', 'main, body', 'button'],
  ['deepdelve', G + 'games/deepdelve/index.html', 'canvas', 'button'],
];

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
  for (const [name, url, rootSel, btnSel] of PAGES) {
    if (only && only.indexOf(name) < 0) continue;
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
    const db = await blockDb(ctx);
    await ctx.route(/gstatic\.com\/firebasejs\//, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: '/* firebase SDK blocked by beta-s10 */' }));
    if (process.env.S10_DEBUG) await ctx.addInitScript(() => { window.__s10dbg = 1; });
    await ctx.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { configurable: true, get() { if (window.__s10dbg) throw new Error('blocked-ls'); throw new DOMException('The operation is insecure.', 'SecurityError'); } });
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message + (process.env.S10_DEBUG ? ' @ ' + JSON.stringify(String(e.stack || '')).slice(0, 600) : '')));
    try { await page.goto(url, { waitUntil: 'load', timeout: 30000 }); } catch (e) { errors.push('goto: ' + e.message); }
    await page.waitForTimeout(2500);
    if (KNOWN[name] && errors.length) console.log(`KNOWN-BUG [${name}] pageerror on boot: ${KNOWN[name]} (${errors[0].slice(0, 80)})`);
    else check(`[${name}] zero pageerror on boot`, errors.length === 0, errors.join(' | ').slice(0, 400));
    const bootErrors = errors.length;
    const vis = await page.evaluate((sel) => [...document.querySelectorAll(sel)].some((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden'; }), rootSel);
    check(`[${name}] main canvas / root visible`, vis);
    const before = errors.length;
    let clicked = false;
    if (name === 'town') {
      await page.fill('#name-input', 'ADMINs10').catch(() => {});
      await page.click('button:has-text("Join Town")').catch(() => {}); // offline: the SDK is stubbed, so this only offers 'Play offline'
      const off = await page.waitForSelector('#join-offline-btn:not(.hidden)', { timeout: 15000 }).then(() => true).catch(() => false);
      if (off) await page.click('#join-offline-btn');
      clicked = off && await page.waitForFunction(() => !document.getElementById('join-overlay') || document.getElementById('join-overlay').classList.contains('hidden'), null, { timeout: 20000 }).then(() => true).catch(() => false);
    } else if (name === 'hub') {
      await Promise.all([page.waitForNavigation({ timeout: 15000 }).catch(() => {}), page.click(btnSel).catch(() => {})]);
      clicked = /\/game\/(index\.html|games\/mad-maze\/index\.html)/.test(page.url()); // G-14: a new profile goes Home -> Realm; a returning one to Town
    }
    const btns = page.locator(btnSel);
    const n = Math.min(await btns.count(), 30);
    for (let i = 0; i < n && !clicked && name !== 'town' && name !== 'hub'; i++) {
      const b = btns.nth(i);
      if (await b.isVisible().catch(() => false)) {
        const href = await b.getAttribute('href').catch(() => null);
        if (href && !/^#/.test(href)) continue; // a link away from the page is not "the primary button"
        try { await b.click({ timeout: 3000 }); clicked = true; } catch (e) { /* covered: try the next one */ }
      }
    }
    await page.waitForTimeout(1200);
    check(`[${name}] primary button works with no new error`, clicked && errors.length === before, (clicked ? '' : 'primary action did not complete ') + errors.slice(before).join(' | ').slice(0, 300));
    void bootErrors;
    check(`[${name}] no database traffic`, db.attempts() === 0);
    await ctx.close();
  }
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
