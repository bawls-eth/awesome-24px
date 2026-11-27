// Cycle 16 U (b05/b06 retest 3, cycle 14/15 queue): at 195x422 the Isles how-to card plus a 4-line journal toast ("New in your journal: Scarlet Macaw
// (rare)!") covered the hero (the screen centre) and reached Soothe. The toast is now in a smaller type and, when it still cannot clear the hero beside
// the card, the card's column steps aside for the toast's 2.2 s (body.toast-wide) and the toast takes the full width, under the hero.
// At 195x422 (card up, Soothe shown), 390x844 and 1280x720, through the game's own toast path (window.__isles.toast):
//   - the toast is off the hero box (screen centre +-20 px), the HUD, every action button and the Attack button, and inside the screen, text not clipped;
//   - once it has ended (2.4 s later) the how-to card is visible again and body.toast-wide is gone;
//   - a short toast ("Medal: Verdant Jungle") does not hide the card at 195x422.
// Firebase blocked (blockDb), 0 database attempts. Run: BASE=http://localhost:9102/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc16-ui-isles-toast.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const SHOTS = process.env.SHOTS || '';
const LONG = 'New in your journal: Scarlet Macaw (rare)!';
const hit = (a, b) => !!a && !!b && a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5;

(async () => {
  const browser = await chromium.launch();
  for (const [w, h] of [[195, 422], [390, 844], [1280, 720]]) {
    const L = `[Isles ${w}x${h}]`;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 500, isMobile: w < 500 });
    const db = await blockDb(ctx);
    const page = await ctx.newPage(); const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => { if (sessionStorage.s) return; sessionStorage.s = 1; localStorage.clear(); });
    await page.goto(ORIGIN + '/game/games/isles/index.html?test=1&seed=5&isle=jungle');
    await page.waitForFunction(() => window.__isles && window.__isles.world);
    await page.waitForTimeout(500);
    const card = () => page.evaluate(() => { const e = document.getElementById('howto'); if (!e || e.hidden) return false; const cs = getComputedStyle(e); return cs.display !== 'none' && cs.visibility !== 'hidden'; });
    if (w === 195) check(`${L} the game's start toast (short) leaves the how-to card visible`, await card(), '');
    await page.waitForTimeout(2400);
    check(`${L} the how-to card is up before the long toast`, await card(), '');
    const m = await page.evaluate((txt) => {
      document.getElementById('btn-soothe').hidden = false;
      const e = document.getElementById('toast'); e.style.transition = 'none';
      window.__isles.toast(txt);
      const R = (s) => { const x = document.querySelector(s); if (!x) return null; const cs = getComputedStyle(x); if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return null; const r = x.getBoundingClientRect(); return r.width > 1 ? { l: r.left, t: r.top, r: r.right, b: r.bottom } : null; };
      const t = R('#toast'); const tt = e.getBoundingClientRect();
      const acts = [...document.querySelectorAll('#acts button, #touch-btns button')].map((b) => { const q = R('#' + b.id); return q; }).filter(Boolean);
      return { t, hud: R('#hud'), how: R('#howto'), acts, wide: document.body.classList.contains('toast-wide'), clip: e.scrollHeight > e.clientHeight + 1, lines: Math.round(tt.height),
        hero: { l: innerWidth / 2 - 20, r: innerWidth / 2 + 20, t: innerHeight / 2 - 20, b: innerHeight / 2 + 20 } };
    }, LONG);
    check(`${L} the toast is inside the screen, text not clipped`, m.t && m.t.l >= 0 && m.t.t >= 0 && m.t.r <= w + 0.5 && m.t.b <= h + 0.5 && !m.clip, JSON.stringify(m));
    check(`${L} the toast is off the hero`, m.t && !hit(m.t, m.hero), JSON.stringify(m));
    check(`${L} the toast is off the HUD and the visible how-to card`, !hit(m.t, m.hud) && !hit(m.t, m.how), JSON.stringify(m));
    check(`${L} the toast is off every action button (Soothe shown)`, m.acts.every((b) => !hit(m.t, b)), JSON.stringify(m));
    if (w === 195) check(`${L} the card's column steps aside (toast-wide) and the toast is at most 2 lines`, m.wide && m.lines <= 40, JSON.stringify(m));
    if (SHOTS) await page.screenshot({ path: `${SHOTS}-${w}.jpg`, type: 'jpeg', quality: 70 });
    const back = await page.waitForFunction(() => { const e = document.getElementById('howto'); const cs = e && getComputedStyle(e); return !!e && !e.hidden && cs.visibility !== 'hidden' && !document.body.classList.contains('toast-on') && !document.body.classList.contains('toast-wide'); }, null, { timeout: 6000, polling: 50 }).then(() => true, () => false); // the toast lasts 2.2 s (a game toast can follow it: wait until none is on)
    check(`${L} after the toast the how-to card is back and toast-wide is gone`, back, await page.evaluate(() => document.body.className));
    if (w === 195) { // the card is see-through (not hidden) while the wide toast is up: a real tap on Close still closes the how-to
      await page.evaluate((txt) => window.__isles.toast(txt), LONG);
      const st = await page.evaluate(() => document.body.classList.contains('toast-wide'));
      const bb = await page.evaluate(() => { const r = document.querySelector('#howto .howto-x').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
      await page.touchscreen.tap(bb.x, bb.y); await page.waitForTimeout(300);
      const after = await page.evaluate(() => ({ open: document.body.classList.contains('howto-open'), wide: document.body.classList.contains('toast-wide'), hid: document.getElementById('howto').hidden }));
      check(`${L} during toast-wide a tap on Close closes the how-to and drops the toast`, st && !after.open && !after.wide, JSON.stringify({ st, after }));
    }
    check(`${L} no page errors, 0 database attempts`, errors.length === 0 && db.count() === 0, JSON.stringify([errors.slice(0, 3), db.count()]));
    await ctx.close();
  }
  await browser.close();
  done();
})();
