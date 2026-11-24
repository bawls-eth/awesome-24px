// Cycle 4 U (P2 left from cycle 3): the Realm at 195x422 (a 390x844 phone at 200% zoom).
// Before: the 72 px mini-map (x 113..185, y 140..212) sat on the Shards half of the HUD info line (y 150..170) and the right end of
// the XP bar, and the zone line covered the "Lv" half: the info line could not be read at all.
// After (realm-ui.css, <= 260 px): the info line has its own slot in the free gap between the Board / Menu row and the XP bar
// (x 64..139, y 102..124, left of Leave), and the mini-map thumbnail is 44x44 in the right column under Leave (still a 44 px target;
// tap still opens the 192 px map).
// Check: every piece of the info line and the XP bar is the top-most element at its centre (nothing drawn over it), the mini-map
// covers no button / HUD text, is >= 44 px, inside the screen, and still enlarges on tap. Also at 260x563 (150% zoom of 390) the
// same holds. blockDb, no network.
// Run: python3 -m http.server 8440 &   BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc4-ui-realm-195.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const URL = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&seed=12345';

const MEASURE = () => {
  // HUD text is pointer-events: none (taps pass to the game): turn hit-testing on for the measurement so elementFromPoint follows paint order
  const st = document.createElement('style'); st.textContent = 'body * { pointer-events: auto !important; }'; document.head.appendChild(st);
  const top = (e) => { const b = e.getBoundingClientRect(); if (b.width < 1) return 'zero'; const x = b.left + b.width / 2, y = b.top + b.height / 2; const h = document.elementFromPoint(x, y); return h && (h === e || e.contains(h)) ? 'ok' : (h ? (h.id || h.className || h.tagName) : 'none'); };
  const info = document.getElementById('realm-info');
  const parts = [...info.children].filter((c) => c.getBoundingClientRect().width > 0 && (c.textContent || '').trim());
  const xp = document.getElementById('realm-xp');
  const mini = document.getElementById('rw-minimap');
  const mr = mini.getBoundingClientRect();
  const hit = (b) => Math.min(b.right, mr.right) - Math.max(b.left, mr.left) > 1 && Math.min(b.bottom, mr.bottom) - Math.max(b.top, mr.top) > 1;
  const under = [...document.querySelectorAll('#realm-overlay button, #realm-hud button, #realm-info, #realm-xp, #rw-zone, .mm-nav-btn, button')]
    .filter((e) => e !== mini && e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden' && hit(e.getBoundingClientRect()))
    .map((e) => e.id || e.className);
  const res = {
    parts: parts.map((p) => (p.id || p.className) + '=' + top(p)), infoText: info.innerText.replace(/\s+/g, ' ').trim(),
    xp: top(xp), mini: [Math.round(mr.left), Math.round(mr.top), Math.round(mr.width), Math.round(mr.height)], under, vw: innerWidth, vh: innerHeight
  };
  st.remove();
  return res;
};

(async () => {
  const browser = await chromium.launch();
  for (const vp of [{ w: 195, h: 422, shot: 'cyc4-ui-realm-195-after.jpg' }, { w: 260, h: 563 }]) {
    const L = `[${vp.w}x${vp.h}]`;
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, hasTouch: true, isMobile: true });
    const db = await blockDb(ctx);
    const page = await ctx.newPage(); const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(URL);
    await page.waitForFunction(() => document.getElementById('rw-minimap') && document.getElementById('realm-info'), null, { timeout: 20000 });
    await page.waitForTimeout(1500);
    const r = await page.evaluate(MEASURE);
    check(`${L} the info line (Lv + Shards) is readable: nothing drawn over any part of it`, r.parts.length >= 2 && r.parts.every((p) => /=ok$/.test(p)), JSON.stringify(r));
    check(`${L} the XP bar has nothing drawn over it`, r.xp === 'ok', r.xp);
    check(`${L} the mini-map covers no button, the info line, the XP bar or the zone line`, r.under.length === 0, r.under.join(', '));
    check(`${L} the mini-map is a >= 44 px target inside the screen`, r.mini[2] >= 44 && r.mini[3] >= 44 && r.mini[0] >= 0 && r.mini[0] + r.mini[2] <= r.vw, JSON.stringify(r.mini));
    if (vp.shot) await page.screenshot({ path: __dirname + '/../design/beta/img/' + vp.shot, type: 'jpeg', quality: 75 });
    await page.tap('#rw-minimap');
    await page.waitForTimeout(200);
    const big = await page.evaluate(() => { const m = document.getElementById('rw-minimap'); const b = m.getBoundingClientRect(); return { big: m.classList.contains('big'), w: Math.round(b.width), R: Math.round(b.right), vw: innerWidth }; });
    check(`${L} tapping the mini-map still opens the big map, inside the screen`, big.big && big.w >= 150 && big.R <= big.vw, JSON.stringify(big));
    check(`${L} no page errors, no network`, errors.length === 0 && db.attempts() === 0, errors.join(' | '));
    await ctx.close();
  }
  await browser.close();
  done();
})();
