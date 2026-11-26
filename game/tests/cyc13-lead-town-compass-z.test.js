// cyc13-lead: the Town compass (shared corner Menu, #mm-nav-btn) and the Town dialogs.
// style.css set `:root { --mm-nav-z: 19 }` (cycle 7: "just under the Town overlays, z 20+"), but shared/mm-nav.css loads after style.css
// and sets `:root { --mm-nav-z: 9000 }`, so the Town value never applied: the compass (z 9000) lay ON every Town dialog (cycle 12 hid it
// for the Museum only). And the HUD behind the open Museum stayed focusable (Tab walked out of the modal dialog).
// Checks at 1280x720, 390x844 and 195x422, offline Town:
//   - no dialog open: the compass is shown and is the top element at its own centre (the HUD does not cover it), z-index 19;
//   - every aria-modal Town dialog, shown: the compass is not the top element at its centre and no corner of it is on top either
//     (the dialog or its backdrop covers it, like the rest of the HUD);
//   - the Museum opened by the scene's own openMuseum(): everything outside the dialog is inert (no focusable control outside it can
//     take focus, Tab stays inside), and closeMuseum() removes exactly the inert it set (the HUD works again, the compass is back on top).
// OFFLINE: helpers.offlineStub, literal db.attempts() === 0. Run: BASE=http://localhost:9131/game/index.html node game/tests/cyc13-lead-town-compass-z.test.js
const { chromium } = require('playwright');
const { check, done, offlineStub, exposeGame, joinOffline } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const SHOTS = process.env.SHOTS || '';

const compass = () => {
  const b = document.getElementById('mm-nav-btn'); if (!b) return { there: false };
  const cs = getComputedStyle(b); const r = b.getBoundingClientRect();
  const shown = cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0;
  const pts = [[r.left + r.width / 2, r.top + r.height / 2], [r.left + 3, r.top + 3], [r.right - 3, r.top + 3], [r.left + 3, r.bottom - 3], [r.right - 3, r.bottom - 3]];
  const onTop = shown ? pts.map(([x, y]) => { const t = document.elementFromPoint(x, y); return !!t && (t === b || b.contains(t)); }) : [];
  return { there: true, shown, z: cs.zIndex, centreOnTop: !!onTop[0], anyOnTop: onTop.some(Boolean) };
};

(async () => {
  const browser = await chromium.launch();
  for (const vp of [{ width: 1280, height: 720 }, { width: 390, height: 844, touch: true }, { width: 195, height: 422, touch: true }]) {
    const L = `[${vp.width}x${vp.height}]`;
    const ctx = await browser.newContext(vp.touch ? { viewport: { width: vp.width, height: vp.height }, hasTouch: true, isMobile: true } : { viewport: vp });
    const db = await offlineStub(ctx);
    const page = await ctx.newPage(); const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await exposeGame(page);
    await page.goto(BASE);
    await joinOffline(page, 'ADMINnavz');
    await page.waitForTimeout(600);
    // the What's-new banner / first-visit cards may sit near the corner: close anything that announces itself as a dialog first
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);

    let c = await page.evaluate(compass);
    check(`${L} no dialog: the compass is shown, z-index 19 (the Town value applies)`, c.there && c.shown && c.z === '19', JSON.stringify(c));
    check(`${L} no dialog: the compass is the top element at its centre (the HUD does not cover it)`, c.centreOnTop, JSON.stringify(c));

    const ids = await page.evaluate(() => [...document.querySelectorAll('[role=dialog][aria-modal="true"].hidden')].map((d) => d.id).filter((id) => /-overlay$/.test(id)));
    check(`${L} the Town has its modal dialogs (>= 14)`, ids.length >= 14, ids.join(','));
    for (const id of ids) {
      const r = await page.evaluate(({ id, fn }) => {
        const d = document.getElementById(id); d.classList.remove('hidden');
        const dr = d.getBoundingClientRect();
        // eslint-disable-next-line no-new-func
        const out = (new Function('return (' + fn + ')()'))();
        out.full = dr.width >= innerWidth - 1 && dr.height >= innerHeight - 1;
        d.classList.add('hidden');
        return out;
      }, { id, fn: compass.toString() });
      check(`${L} #${id} shown: the compass is not on top of it`, r.full && (!r.shown || !r.anyOnTop), JSON.stringify(r));
    }

    // ---- the Museum, opened the real way: the HUD behind it is inert ----
    await page.evaluate(() => window.__g.scene.getScene('Town').openMuseum());
    await page.waitForSelector('#museum-overlay:not(.hidden)');
    await page.waitForTimeout(300);
    const m = await page.evaluate(() => {
      const d = document.getElementById('museum-overlay');
      const Q = 'a[href],button,input:not([type=hidden]),select,textarea,summary,[tabindex]:not([tabindex="-1"])';
      const vis = (e) => { for (let n = e; n && n.nodeType === 1; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden') return false; } return e.getBoundingClientRect().width > 0; };
      const outside = [...document.querySelectorAll(Q)].filter((e) => !d.contains(e) && !e.disabled && vis(e));
      const live = outside.filter((e) => !e.closest('[inert]'));
      const focusable = outside.filter((e) => { e.focus(); return document.activeElement === e; });
      const inside = [...d.querySelectorAll(Q)].filter((e) => !e.disabled && vis(e));
      const first = inside[0]; if (first) first.focus();
      return { outside: outside.length, notInert: live.slice(0, 6).map((e) => e.id || e.className || e.tagName), focusable: focusable.slice(0, 6).map((e) => e.id || e.className || e.tagName), insideOk: !!first && document.activeElement === first, dialogInert: !!d.closest('[inert]'), inertCount: document.querySelectorAll('[inert]').length };
    });
    check(`${L} Museum open: every visible control outside the dialog is inert (${m.outside} controls behind it)`, m.outside > 0 && m.notInert.length === 0, JSON.stringify(m.notInert));
    check(`${L} Museum open: no control outside the dialog can take focus`, m.focusable.length === 0, JSON.stringify(m.focusable));
    check(`${L} Museum open: the dialog itself is not inert and its controls take focus`, !m.dialogInert && m.insideOk, JSON.stringify(m));
    // Tab 25 times: focus never leaves the dialog
    let left = 0;
    for (let i = 0; i < 25; i++) { await page.keyboard.press('Tab'); if (!(await page.evaluate(() => { const a = document.activeElement; return !a || a === document.body || document.getElementById('museum-overlay').contains(a); }))) left++; }
    check(`${L} Museum open: 25 Tab presses never land outside the dialog`, left === 0, String(left));
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/cyc13-lead-museum-inert-${vp.width}x${vp.height}.jpg`, type: 'jpeg', quality: 80 });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => ({ closed: document.getElementById('museum-overlay').classList.contains('hidden'), inert: [...document.querySelectorAll('[inert]')].map((e) => e.id || e.className || e.tagName) }));
    check(`${L} Escape closes the Museum`, after.closed);
    check(`${L} Museum closed: no inert is left behind`, after.inert.length === 0, after.inert.join(','));
    c = await page.evaluate(compass);
    check(`${L} Museum closed: the compass is back on top at its centre`, c.shown && c.centreOnTop, JSON.stringify(c));
    // an element that was inert before the Museum opened stays inert after it closes (only our own inert is removed)
    const kept = await page.evaluate(() => { const s = window.__g.scene.getScene('Town'); const h = document.getElementById('game-container'); h.setAttribute('inert', ''); s.openMuseum(); s.closeMuseum(); const k = h.hasAttribute('inert'); h.removeAttribute('inert'); return k; });
    check(`${L} an element that was already inert keeps its inert after the Museum closes`, kept);
    // the compass still opens its sheet
    await page.evaluate(() => document.getElementById('mm-nav-btn').click());
    await page.waitForTimeout(300);
    check(`${L} the compass still opens the "Where to?" sheet, above the HUD`, await page.evaluate(() => { const sh = document.querySelector('.mm-nav-sheet, #mm-nav-sheet, [class*="mm-nav-sheet"]'); if (!sh) return false; const r = sh.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 40)); return r.width > 0 && !!t && (sh.contains(t) || t === sh); }));
    check(`${L} no page error`, errors.length === 0, errors.join(' | ').slice(0, 200));
    check(`${L} no database request attempted`, db.attempts() === 0, String(db.attempts()));
    await ctx.close();
  }
  await browser.close();
  done();
})();
