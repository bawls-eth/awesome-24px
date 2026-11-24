// Cycle 1 U-05 (b08-12): Realm world top HUD density on a phone. Before, the level goal "Next goal: Reach Lv 5 for Midlands (Lv 1)"
// wrapped onto a second line (the "(Lv 1)" repeats the level already on the info line right above), so the top text stack ran to
// y 163 at 390x844. Measured target: the goal is ONE line and the stack (HUD row, info, XP, zone line, goal) ends by y 150.
// blockDb: no database traffic. Run: BASE=http://localhost:8440/game/index.html node game/tests/cyc1-ui-realm-hud.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&offline=1&heropick=0&seed=12345';
const SHOTS = process.env.SHOTS || null;

(async () => {
  const browser = await chromium.launch();
  for (const [w, h, touch] of [[390, 844, true], [1280, 720, false]]) {
    const tag = `${w}x${h}`;
    const ctx = await browser.newContext(touch ? { viewport: { width: w, height: h }, hasTouch: true, isMobile: true } : { viewport: { width: w, height: h } });
    await blockDb(ctx);
    const page = await ctx.newPage(); const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(WORLD);
    await page.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena.active, null, { timeout: 20000 });
    await page.waitForFunction(() => { const g = document.getElementById('rw-goal'); return g && !g.classList.contains('hidden') && /^Next goal: \S/.test(g.textContent); }, null, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(1200);
    const r = await page.evaluate(() => {
      const R = (id) => { const e = document.getElementById(id); if (!e || e.classList.contains('hidden') || !e.getClientRects().length) return null; const b = e.getBoundingClientRect(); return { t: b.top, b: b.bottom, h: b.height }; };
      const g = document.getElementById('rw-goal'); const lh = parseFloat(getComputedStyle(g).lineHeight) || 15;
      const parts = ['realm-hud', 'realm-xp', 'rw-zone', 'rw-goal'].map(R).filter(Boolean);
      return { text: g.textContent, goal: R('rw-goal'), lh, stack: Math.round(Math.max(...parts.map((p) => p.b))), lvl: (document.getElementById('realm-level') || {}).textContent };
    });
    check(`${tag}: the goal line shows`, !!r.goal && /^Next goal: /.test(r.text), JSON.stringify(r));
    check(`${tag}: the level goal does not repeat the hero level (already on the info line)`, !/\(Lv \d+\)/.test(r.text) && /Lv \d/.test(r.lvl || ''), JSON.stringify(r));
    check(`${tag}: the goal line is one line`, r.goal && r.goal.h < r.lh * 2, JSON.stringify(r));
    if (touch) check(`${tag}: the top HUD text stack ends by y 150 (was 163)`, r.stack <= 150, JSON.stringify(r));
    check(`${tag}: no page errors`, errors.length === 0, errors.join('|'));
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/cyc1-ui-realm-${tag}.jpg`, type: 'jpeg', quality: 60, clip: { x: 0, y: 0, width: w, height: Math.min(h, 260) } });
    await ctx.close();
  }
  await browser.close();
  done();
})();
