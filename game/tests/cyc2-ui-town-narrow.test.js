// Cycle 2 U (UI/UX), U-09: the Town touch controls on very narrow phones, OFFLINE only (helpers.offlineStub: database hosts
// blocked, Firebase SDK answered empty). At 160x284 (a 320x568 phone at 200% zoom) and 195x422 (390x844 at 200% + 150% Text
// size) the stick and the Emotes / Tools / A / C strip covered each other. Checked here: no visible action button overlaps a
// visible stick (closed strip, Tools tray open, emote picker open), every button is a >= 44 px tap target inside the viewport,
// the bag bar / people panel are not covered, and 390x844 keeps the full 128 px stick. Never chats, 0 DB requests.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/cyc2-ui-town-narrow.test.js
const { chromium } = require('playwright');
const { check, done, offlineStub } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const SHOTS = process.env.SHOTS || null;

async function open(browser, ctxOpts, prefs) {
  const ctx = await browser.newContext(ctxOpts);
  const db = await offlineStub(ctx);
  if (prefs) await ctx.addInitScript((v) => { try { if (!sessionStorage.seededPrefs) { sessionStorage.seededPrefs = '1'; localStorage.setItem('pixeltown-access-v1', v); } } catch (e) { /* storage blocked */ } }, prefs);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.route('**/main.js*', async (route) => { const resp = await route.fetch(); const body = (await resp.text()).replace('const game = new Phaser.Game(config);', 'const game = window.__g = new Phaser.Game(config);'); route.fulfill({ response: resp, body }); });
  await page.goto(BASE);
  await page.fill('#name-input', 'ADMINcyc2u');
  await page.click('.species-tab'); await page.click('.avatar-choice');
  await page.click('button:has-text("Join Town")');
  await page.waitForSelector('#join-offline-btn:not(.hidden)', { timeout: 9000 });
  await page.click('#join-offline-btn');
  await page.waitForFunction(() => window.__g && window.__g.scene.getScene('Town') && window.__g.scene.getScene('Town').localBody, null, { timeout: 25000 });
  await page.waitForTimeout(1200);
  return { ctx, page, db, errors };
}
// every visible control in the touch strip / emote picker, the stick, and the top HUD boxes
const layout = (page) => page.evaluate(() => {
  const vis = (e) => { if (!e) return false; for (let n = e; n && n.nodeType === 1; n = n.parentElement) { const c = getComputedStyle(n); if (c.display === 'none' || c.visibility === 'hidden') return false; } const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const bx = (e) => { const r = e.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { id: e.id || e.textContent.trim().slice(0, 4), x: r.left, y: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, onTop: !!t && (t === e || e.contains(t)) }; };
  const btns = [...document.querySelectorAll('#action-buttons button, #emote-popup button')].filter(vis).map(bx);
  const stick = document.getElementById('joystick');
  const top = ['#inventory-panel', '#player-list-panel', '#where-to-btn'].map((s) => document.querySelector(s)).filter(vis).map(bx);
  return { btns, stick: vis(stick) ? bx(stick) : null, top, vw: innerWidth, vh: innerHeight };
});
const hit = (a, b) => !!(a && b && a.x < b.r - 0.5 && b.x < a.r - 0.5 && a.y < b.b - 0.5 && b.y < a.b - 0.5);
function audit(L, s) {
  const onStick = s.btns.filter((b) => hit(b, s.stick)).map((b) => b.id);
  check(L + ': no visible action button overlaps the stick', onStick.length === 0, JSON.stringify({ onStick, stick: s.stick }));
  const small = s.btns.filter((b) => b.w < 43.5 || b.h < 43.5).map((b) => b.id + ' ' + Math.round(b.w) + 'x' + Math.round(b.h));
  check(L + ': every button is a >= 44 px tap target', small.length === 0, small.join(', '));
  const out = s.btns.concat(s.stick ? [s.stick] : []).filter((b) => b.x < -0.5 || b.y < -0.5 || b.r > s.vw + 0.5 || b.b > s.vh + 0.5).map((b) => b.id);
  check(L + ': every button and the stick are inside the viewport', out.length === 0, out.join(', '));
  const overTop = [];
  s.top.forEach((t) => s.btns.concat(s.stick ? [s.stick] : []).forEach((b) => { if (hit(t, b)) overTop.push(b.id + ' on ' + t.id); }));
  // the closed strip never covers the top HUD; an open tray (Tools / emote picker) is a short-lived popup that may sit over it,
  // but then every one of its buttons must be the thing a tap at its centre hits
  if (/closed/.test(L)) check(L + ': the strip and stick leave the bag bar / people panel / Where to? uncovered', overTop.length === 0, overTop.join(', '));
  const buried = s.btns.filter((b) => !b.onTop).map((b) => b.id);
  check(L + ': every visible button is on top (a tap at its centre reaches it)', buried.length === 0, buried.join(', '));
}

(async () => {
  const browser = await chromium.launch();
  const NARROW = [
    { id: '160x284', opts: { viewport: { width: 160, height: 284 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true } },
    { id: '195x422 text 150%', opts: { viewport: { width: 195, height: 422 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }, prefs: JSON.stringify({ v: 1, hudScale: 1.5 }) }
  ];
  for (const v of NARROW) {
    const T = await open(browser, v.opts, v.prefs); const p = T.page;
    let s = await layout(p);
    check('U-09 ' + v.id + ': the stick is shown with the strip closed', !!s.stick, JSON.stringify(s.stick));
    check('U-09 ' + v.id + ': the closed strip shows Emotes, Tools, A and C', s.btns.length === 4, s.btns.map((b) => b.id).join(','));
    audit('U-09 ' + v.id + ' closed', s);
    if (SHOTS) await p.screenshot({ path: SHOTS + '/cyc2-ui-town-' + v.id.split(' ')[0] + '-closed.jpg', type: 'jpeg', quality: 60 });
    await p.tap('#hud-more-btn'); await p.waitForTimeout(150);
    s = await layout(p);
    check('U-09 ' + v.id + ': Tools open shows B, Tilt and Photo too', s.btns.length >= 6, s.btns.map((b) => b.id).join(','));
    audit('U-09 ' + v.id + ' Tools open', s);
    await p.tap('#hud-more-btn'); await p.waitForTimeout(150);
    s = await layout(p);
    check('U-09 ' + v.id + ': closing Tools brings the stick back', !!s.stick && s.btns.length === 4);
    await p.tap('#emote-toggle-btn'); await p.waitForTimeout(150);
    s = await layout(p);
    check('U-09 ' + v.id + ': the emote picker opens', s.btns.length > 4, String(s.btns.length));
    audit('U-09 ' + v.id + ' emote picker open', s);
    if (SHOTS) await p.screenshot({ path: SHOTS + '/cyc2-ui-town-' + v.id.split(' ')[0] + '-emotes.jpg', type: 'jpeg', quality: 60 });
    check('U-09 ' + v.id + ': 0 database requests', T.db.attempts() === 0, JSON.stringify(T.db.http));
    check('U-09 ' + v.id + ': no page errors', T.errors.length === 0, T.errors.join('|'));
    await T.ctx.close();
  }
  {
    const T = await open(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }); const p = T.page;
    const s = await layout(p);
    check('390x844 unchanged: the full 128 px stick', s.stick && Math.round(s.stick.w) === 128, JSON.stringify(s.stick));
    audit('390x844 closed', s);
    check('390x844: 0 database requests', T.db.attempts() === 0);
    await T.ctx.close();
  }
  await browser.close();
  done();
})();
