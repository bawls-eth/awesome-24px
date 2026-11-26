// cyc13-lead: the Realm world HUD at 160x284 (a 320 px phone at 200% zoom). Cycle 12 parked 8 control overlaps there (ability pad on
// the Board / Menu buttons, gear / Daily / Leave / mini-map on each other). At <= 190 px the five secondary controls fold into the
// "More" tray (mad-maze.js moreTray + realm-ui.css). This test checks, closed and open: no two controls (or sticks) cover each other,
// every control is >= 44 px and inside the screen; the tray items still do their job; and at 195x422 / 390x844 nothing is folded.
// DB-safe: blockDb, the world page never joins. SHOTS=<dir> saves the two 160 px screenshots. Run: BASE=http://localhost:9131/game/index.html node game/tests/cyc13-lead-realm-160.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const URL_W = new URL(BASE).origin + '/game/games/mad-maze/index.html?mode=world&test=1&seed=12345';
const PROFILE = { v: 1, heroes: [{ id: 'h1', name: 'Fern', cls: 'druid', level: 7, xp: 10, items: [] }], stash: [], fame: 0, mode: 'classic', hall: [] };
const FIVE = ['#realm-bp-btn', '#realm-board-btn', '#realm-leave-btn', '#mm-gear-btn', '#mm-daily-btn'];

// visible controls + sticks + mini-map, with their rects
const RECTS = () => {
  const vis = (e) => { for (let n = e; n && n.nodeType === 1; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden' || n.hidden) return false; } const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.right > 0 && r.left < innerWidth; };
  return [...document.querySelectorAll('#realm-overlay button, #mm-nav-btn, a#mm-daily-btn, #mm-gear-btn, #rw-minimap, .realm-stick')].filter(vis)
    .map((e) => { const r = e.getBoundingClientRect(); return { id: e.id || e.className, x: r.left, y: r.top, R: r.right, B: r.bottom, w: r.width, h: r.height }; });
};
const overlaps = (rs) => { const out = []; for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) { const a = rs[i], b = rs[j]; const ox = Math.min(a.R, b.R) - Math.max(a.x, b.x), oy = Math.min(a.B, b.B) - Math.max(a.y, b.y); if (ox > 2 && oy > 2) out.push(`${a.id}+${b.id} ${Math.round(ox)}x${Math.round(oy)}`); } return out; };

async function open(browser, w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
  const db = await blockDb(ctx);
  await ctx.addInitScript((p) => { if (!sessionStorage.s) { sessionStorage.s = '1'; localStorage.setItem('pixeltown-mm-v1', JSON.stringify(p)); localStorage.setItem('pixeltown-mm-active-v1', JSON.stringify({ v: 1, heroId: 'h1' })); } }, PROFILE);
  const p = await ctx.newPage();
  const errors = []; p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(URL_W, { waitUntil: 'load' });
  await p.waitForSelector('#rw-more-btn', { state: 'attached', timeout: 10000 });
  await p.waitForTimeout(1200);
  return { ctx, p, db, errors };
}
const shown = (p, sel) => p.evaluate((s) => { const e = document.querySelector(s); if (!e) return false; for (let n = e; n && n.nodeType === 1; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden') return false; } return e.getBoundingClientRect().width > 0; }, sel);

(async () => {
  const browser = await chromium.launch();
  for (const [w, h] of [[160, 284], [190, 400]]) {
    const L = `[${w}x${h}]`;
    const { ctx, p, db, errors } = await open(browser, w, h);
    // ---- closed ----
    let rs = await p.evaluate(RECTS);
    let ov = overlaps(rs);
    check(`${L} closed: no control or stick covers another`, ov.length === 0, ov.join(' | '));
    const need = ['mm-nav-btn', 'realm-menu-btn', 'rw-more-btn', 'realm-aim-btn', 'rw-minimap', 'realm-ab-0', 'realm-ab-1', 'realm-ab-2', 'realm-ab-3', 'realm-stick-move', 'realm-stick-aim'];
    const ids = rs.map((r) => r.id);
    check(`${L} closed: compass, Menu, More, aim, mini-map, 4 abilities and both sticks are shown`, need.every((n) => ids.includes(n)), need.filter((n) => !ids.includes(n)).join(','));
    let small = rs.filter((r) => r.w < 44 || r.h < 44 || r.x < 0 || r.y < 0 || r.R > w + 0.5 || r.B > h + 0.5);
    check(`${L} closed: every control is >= 44 px and inside the screen`, small.length === 0, small.map((r) => `${r.id} ${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.w)}x${Math.round(r.h)}`).join(' | '));
    for (const s of FIVE) check(`${L} closed: ${s} is folded into the tray`, !(await shown(p, s)));
    check(`${L} More says it is collapsed`, (await p.getAttribute('#rw-more-btn', 'aria-expanded')) === 'false' && /backpack/i.test(await p.getAttribute('#rw-more-btn', 'aria-label')));
    // text HUD items do not sit on a control (HP, XP, Lv line, zone line)
    const textHit = await p.evaluate(() => {
      const ctl = [...document.querySelectorAll('#realm-overlay button, #mm-nav-btn, #rw-minimap, .realm-stick')].filter((e) => { const cs = getComputedStyle(e); const r = e.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && getComputedStyle(e.parentElement).visibility !== 'hidden' && r.width > 0 && r.left >= 0; });
      const out = [];
      ['#realm-hp', '#realm-xp', '#realm-info', '#rw-zone', '#rw-goal'].forEach((s) => { const e = document.querySelector(s); if (!e || getComputedStyle(e).display === 'none' || !e.getClientRects().length) return; const a = e.getBoundingClientRect();
        ctl.forEach((c) => { const b = c.getBoundingClientRect(); const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left), oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top); if (ox > 2 && oy > 2) out.push(s + ' on #' + c.id + ' ' + Math.round(ox) + 'x' + Math.round(oy)); }); });
      return out;
    });
    check(`${L} closed: the HP / XP / level / zone text is not under a control`, textHit.length === 0, textHit.join(' | '));
    // ---- open ----
    await p.tap('#rw-more-btn');
    await p.waitForTimeout(200);
    check(`${L} More opens the tray (aria-expanded true)`, (await p.getAttribute('#rw-more-btn', 'aria-expanded')) === 'true');
    for (const s of FIVE) check(`${L} open: ${s} is shown`, await shown(p, s));
    rs = await p.evaluate(RECTS); ov = overlaps(rs);
    check(`${L} open: no control covers another`, ov.length === 0, ov.join(' | '));
    small = rs.filter((r) => r.w < 44 || r.h < 44 || r.x < 0 || r.y < 0 || r.R > w + 0.5 || r.B > h + 0.5);
    check(`${L} open: every control is >= 44 px and inside the screen`, small.length === 0, small.map((r) => `${r.id} ${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.w)}x${Math.round(r.h)}`).join(' | '));
    check(`${L} open: the Next-goal text is shown and inside the screen`, await p.evaluate(() => { const g = document.getElementById('rw-goal'); if (!g || !g.textContent.trim()) return true; const r = g.getBoundingClientRect(); return getComputedStyle(g).display !== 'none' && r.left >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5; }));
    // each control under the finger is really the one on top (elementFromPoint at its centre)
    const top = await p.evaluate((five) => five.filter((s) => { const e = document.querySelector(s); const r = e.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !(t && (t === e || e.contains(t))); }), FIVE);
    check(`${L} open: every tray item is the top element at its centre`, top.length === 0, top.join(','));
    // a tray item does its job and closes the tray
    await p.tap('#realm-bp-btn');
    await p.waitForTimeout(400);
    check(`${L} Backpack from the tray opens the backpack`, await p.evaluate(() => { const b = document.getElementById('realm-backpack'); return !!b && !b.classList.contains('hidden'); }));
    check(`${L} the tray closed after the tap`, await p.evaluate(() => !document.body.classList.contains('rw-more-open')) && (await p.getAttribute('#rw-more-btn', 'aria-expanded')) === 'false');
    await p.keyboard.press('Escape');
    await p.waitForTimeout(300);
    await p.evaluate(() => { const b = document.getElementById('realm-backpack'); if (b && !b.classList.contains('hidden')) { const c = b.querySelector('button.close, [data-close], .x'); if (c) c.click(); } });
    // Escape closes an open tray
    if (await p.evaluate(() => { const b = document.getElementById('realm-backpack'); return !b || b.classList.contains('hidden'); })) {
      await p.tap('#rw-more-btn'); await p.waitForTimeout(150);
      const wasOpen = await p.evaluate(() => document.body.classList.contains('rw-more-open'));
      await p.keyboard.press('Escape'); await p.waitForTimeout(150);
      check(`${L} Escape closes the open tray`, wasOpen && await p.evaluate(() => !document.body.classList.contains('rw-more-open')));
    } else check(`${L} the backpack closes with Escape (needed for the tray Escape check)`, false);
    check(`${L} no page error`, errors.length === 0, errors.join(' | ').slice(0, 200));
    check(`${L} no database request attempted`, db.attempts() === 0, String(db.attempts()));
    if (w === 160 && process.env.SHOTS) { await p.screenshot({ path: process.env.SHOTS + '/cyc13-lead-realm-160-closed.jpg', type: 'jpeg', quality: 85 }); await p.tap('#rw-more-btn'); await p.waitForTimeout(200); await p.screenshot({ path: process.env.SHOTS + '/cyc13-lead-realm-160-open.jpg', type: 'jpeg', quality: 85 }); }
    await ctx.close();
  }
  // wider screens: nothing folded, no More button
  for (const [w, h] of [[195, 422], [390, 844]]) {
    const L = `[${w}x${h}]`;
    const { ctx, p, db } = await open(browser, w, h);
    check(`${L} the More button is not shown`, !(await shown(p, '#rw-more-btn')));
    for (const s of FIVE) check(`${L} ${s} is shown without a tray`, await shown(p, s));
    check(`${L} no database request attempted`, db.attempts() === 0);
    await ctx.close();
  }
  await browser.close();
  done();
})();
