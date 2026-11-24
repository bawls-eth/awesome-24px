// Cycle 4 U (P2 left from cycle 3): keyboard focus when the quest board or the stall opens while the Hero notebook is open.
// Before: opening the board / stall emptied and hid the notebook while focus sat on its Close button, so focus fell to <body>
// (a keyboard / screen reader user lost their place). After: focus moves to the panel that opened (its first button, Close for
// the board). When focus was elsewhere (not in the notebook) nothing is stolen.
// Desktop 1280x720 and phone 844x390 (touch). blockDb, offline Realm, no network.
// Run: python3 -m http.server 8440 &   BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc4-ui-notebook-focus.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&offline=1&heropick=0&tutorial=0&seed=12345&qdate=2030-05-01';
const SAVE = { realm: { level: 4, xp: 0, shards: 50, bestWave: 2, items: [{ n: 1, id: 'sparkwand', r: 0 }], nextUid: 2, eq: { weapon: 1 } } };
const PAGES = JSON.stringify({ v: 1, e: { 'kill:aimed:sand_crab@0': 1, 'boss:kraken@3': 3 } });
const E = (page, fn) => page.evaluate(`(${fn.toString()})(window.__mm.arena, window.__mm.world)`);
const frames = (page, n) => page.evaluate((k) => new Promise((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const FOCUS = () => { const a = document.activeElement; const nb = document.getElementById('rw-nx-notebook'); const board = document.getElementById('rw-nx-board'); const stall = document.getElementById('rw-nx-stall');
  return { id: a && (a.id || a.tagName), body: a === document.body || !a, inBoard: !!(board && board.contains(a)), inStall: !!(stall && stall.contains(a)), boardOpen: !!(board && !board.classList.contains('hidden')), stallOpen: !!(stall && !stall.classList.contains('hidden') && stall.isConnected), nbOpen: !!(nb && !nb.classList.contains('hidden')),
    ring: a && a !== document.body ? getComputedStyle(a).outlineStyle + ' ' + getComputedStyle(a).outlineWidth : '' }; };

(async () => {
  const browser = await chromium.launch();
  for (const vp of [{ id: '1280x720', o: { viewport: { width: 1280, height: 720 } } }, { id: '844x390', o: { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true }, touch: true }]) {
    const L = `[${vp.id}]`;
    const ctx = await browser.newContext(vp.o);
    const db = await blockDb(ctx);
    await ctx.route('**/game/index.html*', (rt) => rt.fulfill({ contentType: 'text/html', body: '<!doctype html>town' }));
    const page = await ctx.newPage(); const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
    await page.evaluate((a) => { localStorage.clear(); localStorage.setItem('pixeltown-save-v1', a[0]); localStorage.setItem('pixeltown-notebook-v1', a[1]); }, [JSON.stringify(SAVE), PAGES]);
    await page.goto(WORLD);
    await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 30000 });
    await E(page, (a, w) => { a.player.iframes = 1e9; a._hitPlayer = () => {}; const s = w.nexus.site; a.player.x = s.x - 20; a.player.y = s.y; });
    await frames(page, 15);
    const openNb = async () => { await page.focus('#rw-nx-notebook-btn'); await page.keyboard.press('Enter'); await frames(page, 4); };
    if (vp.touch) await page.tap('#rw-nexus-go'); else await page.click('#rw-nexus-go');
    await frames(page, 6);
    await openNb();
    let f = await page.evaluate(FOCUS);
    check(`${L} setup: notebook open, focus on its Close`, f.nbOpen && f.id === 'rw-nx-nb-close', JSON.stringify(f));
    // the quest board opens (talking to the board keeper) while focus is in the notebook
    const qid = await page.evaluate(() => { const n = window.MMNexus.layout().npcs.find((x) => x.role === 'quests'); return n && n.id; });
    await page.evaluate((id) => window.__mm.world.nexus.talk(id), qid);
    await frames(page, 3);
    f = await page.evaluate(FOCUS);
    check(`${L} board opens over the notebook: focus moves into the board, not <body>`, qid && f.boardOpen && !f.nbOpen && f.inBoard && !f.body, JSON.stringify(f));
    if (!vp.touch) check(`${L} the focused board control shows a visible ring (keyboard)`, /solid|auto|dashed|dotted/.test(f.ring) && !/ 0px$/.test(f.ring), f.ring);
    // the stall opens while focus is in the notebook
    const stallOn = await page.evaluate(() => window.__mm.world.nexus.stall.on());
    if (stallOn) {
      await openNb();
      await page.evaluate(() => window.__mm.world.nexus.stall.open());
      await frames(page, 3);
      f = await page.evaluate(FOCUS);
      check(`${L} stall opens over the notebook: focus moves into the stall, not <body>`, f.stallOpen && !f.nbOpen && f.inStall && !f.body, JSON.stringify(f));
    } else check(`${L} stall available in this build`, false, 'stall off');
    // focus elsewhere (the notebook closed, focus on its button): opening the board does not steal focus
    await page.evaluate(() => { const s = document.getElementById('rw-nx-board'); if (s) s.classList.add('hidden'); });
    await page.focus('#rw-nx-notebook-btn');
    await page.evaluate((id) => window.__mm.world.nexus.talk(id), qid);
    await frames(page, 3);
    f = await page.evaluate(FOCUS);
    check(`${L} focus outside the notebook is left where it was`, f.id === 'rw-nx-notebook-btn', JSON.stringify(f));
    check(`${L} no page errors, no network`, errors.length === 0 && db.attempts() === 0, errors.join(' | '));
    await ctx.close();
  }
  await browser.close();
  done();
})();
