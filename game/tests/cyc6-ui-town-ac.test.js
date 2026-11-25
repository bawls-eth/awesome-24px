// cyc6-ui (retest 3 P3 b08-r3-08, the smallest safe Town HUD step): on touch phones 280 px and wider, A (interact) and C (chat), the
// primary thumb buttons, are 56 x 56 (were 50 x 50). Checked at 390x844 and 360x640: A and C are >= 56 px, Emotes / Tools stay >= 44 px,
// the strip stays on screen and off the joystick; with Tools open the four rows still fit on screen. The < 280 px one-column strip is
// unchanged (A / C 48 x 44 at 160x284). OFFLINE only (helpers.offlineStub), 0 DB requests, never chats.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/cyc6-ui-town-ac.test.js
const { chromium } = require('playwright');
const path = require('path');
const { check, done, offlineStub } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';

async function open(browser, vp) {
  const ctx = await browser.newContext({ viewport: vp, hasTouch: true, isMobile: true });
  const db = await offlineStub(ctx);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(BASE);
  await page.fill('#name-input', 'ADMINcyc6u');
  await page.click('.species-tab'); await page.click('.avatar-choice');
  await page.click('button:has-text("Join Town")');
  await page.waitForSelector('#join-offline-btn:not(.hidden)', { timeout: 9000 });
  await page.click('#join-offline-btn');
  await page.waitForFunction(() => { const h = document.getElementById('hud'), a = document.getElementById('interact-btn'); return h && !h.classList.contains('hidden') && a && a.getBoundingClientRect().width > 0; }, null, { timeout: 25000 });
  await page.waitForTimeout(1500);
  return { ctx, page, db, errors };
}
const boxes = (page) => page.evaluate(() => {
  const q = (id) => { const e = document.getElementById(id); if (!e) return null; const cs = getComputedStyle(e); const r = e.getBoundingClientRect(); if (cs.display === 'none' || cs.visibility === 'hidden' || !r.width) return null; return { x: r.left, y: r.top, r: r.right, b: r.bottom, w: Math.round(r.width), h: Math.round(r.height) }; };
  return { a: q('interact-btn'), c: q('mobile-chat-btn'), emo: q('emote-toggle-btn'), tools: q('hud-more-btn'), stick: q('joystick'), b: q('build-toggle-btn'), photo: q('mobile-photo-btn'), W: innerWidth, H: innerHeight };
});
const hit = (a, b) => !!(a && b && a.x < b.r - 0.5 && b.x < a.r - 0.5 && a.y < b.b - 0.5 && b.y < a.b - 0.5);
const inside = (r, W, H) => r && r.x >= 0 && r.y >= 0 && r.r <= W && r.b <= H;

(async () => {
  const browser = await chromium.launch(); const errs = []; let attempts = 0;
  for (const [w, h] of [[390, 844], [360, 640]]) {
    const tag = w + 'x' + h + ': ';
    const P = await open(browser, { width: w, height: h }), p = P.page;
    const s = await boxes(p);
    check(tag + 'A and C are 56 x 56 or larger (primary thumb buttons; were 50 x 50)', s.a && s.c && s.a.w >= 56 && s.a.h >= 56 && s.c.w >= 56 && s.c.h >= 56, JSON.stringify({ a: s.a, c: s.c }));
    check(tag + 'Emotes and Tools keep >= 44 px targets', s.emo && s.tools && s.emo.h >= 44 && s.tools.h >= 44 && s.emo.w >= 44 && s.tools.w >= 44, JSON.stringify({ emo: s.emo, tools: s.tools }));
    check(tag + 'the strip is on screen and off the joystick', [s.a, s.c, s.emo, s.tools].every((r) => inside(r, s.W, s.H) && !hit(r, s.stick)), JSON.stringify(s));
    if (w === 390) await p.screenshot({ path: path.join(__dirname, '..', 'design', 'beta', 'img', 'cyc6-ui-town-ac-390.jpg'), type: 'jpeg', quality: 70 }).catch(() => {});
    await p.tap('#hud-more-btn'); await p.waitForTimeout(250);
    const o = await boxes(p);
    check(tag + 'Tools open: B / Photo / A / C on screen, A and C still >= 56 px, nothing on the joystick', [o.a, o.c, o.b, o.photo].every((r) => inside(r, o.W, o.H) && !hit(r, o.stick)) && o.a.h >= 56 && o.c.h >= 56, JSON.stringify(o));
    attempts += P.db.attempts(); check('no database request in this profile (offline stub)', P.db.attempts() === 0, String(P.db.attempts())); errs.push(...P.errors); await P.ctx.close();
  }
  { // under 280 px the one-column strip is unchanged
    const P = await open(browser, { width: 160, height: 284 }), p = P.page;
    const s = await boxes(p);
    check('160x284: the one-column strip keeps 48 x 44 buttons (unchanged)', s.a && s.a.w === 48 && s.a.h === 44 && s.c && s.c.w === 48 && s.c.h === 44, JSON.stringify({ a: s.a, c: s.c }));
    attempts += P.db.attempts(); check('no database request in this profile (offline stub)', P.db.attempts() === 0, String(P.db.attempts())); errs.push(...P.errors); await P.ctx.close();
  }
  check('no database request attempted (offline stub)', attempts === 0, String(attempts));
  check('no page errors', errs.length === 0, errs.join(' | '));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
