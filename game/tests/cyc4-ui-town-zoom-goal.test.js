// Cycle 4 U (P2 left from cycle 3): the first-minute goal at 200% browser zoom (a 390x844 phone = 195x422 css px).
// Before: style.css hid the Realm Gate goal chip under 301 css px ("no room beside the Menu"), so at 200% zoom a new player had no
// first-minute goal on screen. After: a compact goal line under the bag bar, left of the action column (text wraps to 2 lines,
// the 44 px close button stays), and it steps aside while the bag is open (the counts drop over that spot).
// Checks at 195x422 and 260x563 (touch): the chip shows, says "Goal: ... Realm Gate", fits the screen, text is not clipped, covers no
// control (buttons / bag bar / people panel / stick), text >= 12 px, close button 44x44; and while the bag is open it is hidden.
// Firebase blocked (offlineStub), offline join as an ADMIN bot; db.attempts() === 0.
// Run: python3 -m http.server 8440 &   BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc4-ui-town-zoom-goal.test.js
const { chromium } = require('playwright');
const { check, done, offlineStub, exposeGame, joinOffline } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');

const MEASURE = () => {
  const vis = (e) => { for (let n = e; n && n.nodeType === 1; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return false; } return true; };
  const gp = document.getElementById('gate-pointer'); const gr = gp.getBoundingClientRect(); const txt = document.getElementById('gate-pointer-text');
  const cl = document.getElementById('gate-pointer-close').getBoundingClientRect();
  const hits = [...document.querySelectorAll('button, a[href], input, select, [role=button], #inventory-panel, #player-list-panel, #joystick, #action-buttons')]
    .filter((e) => !gp.contains(e) && vis(e) && e.getClientRects().length)
    .filter((e) => { const r = e.getBoundingClientRect(); return Math.min(r.right, gr.right) - Math.max(r.left, gr.left) > 1 && Math.min(r.bottom, gr.bottom) - Math.max(r.top, gr.top) > 1; })
    .map((e) => e.id || e.className);
  return {
    vis: vis(gp) && !gp.classList.contains('hidden') && gr.width > 0, text: (txt.textContent || '').replace(/\s+/g, ' ').trim(),
    box: [gr.left, gr.top, gr.right, gr.bottom].map(Math.round), vw: innerWidth, vh: innerHeight,
    clip: txt.scrollWidth > txt.clientWidth + 1 || txt.scrollHeight > txt.clientHeight + 1, fs: parseFloat(getComputedStyle(txt).fontSize),
    close: [Math.round(cl.width), Math.round(cl.height)], hits
  };
};

(async () => {
  const browser = await chromium.launch();
  for (const vp of [{ w: 195, h: 422, shot: 'cyc4-ui-town-195-goal-after.jpg' }, { w: 260, h: 563 }, { w: 300, h: 650 }]) {
    const L = `[${vp.w}x${vp.h}]`;
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, hasTouch: true, isMobile: true });
    const db = await offlineStub(ctx);
    const page = await ctx.newPage(); const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await exposeGame(page);
    await page.goto(ORIGIN + '/game/index.html');
    await joinOffline(page, 'ADMINcyc4zoom');
    await page.waitForFunction(() => { const g = document.getElementById('gate-pointer'); return g && !g.classList.contains('hidden'); }, null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(600);
    const r = await page.evaluate(MEASURE);
    check(`${L} the first-minute goal shows at 200% zoom widths`, r.vis, JSON.stringify(r));
    check(`${L} it says the goal in words ("Goal: ... Realm Gate")`, /^Goal: .*Realm Gate/.test(r.text), r.text);
    check(`${L} it fits the screen, its text is not clipped and is >= 12 px`, r.box[0] >= 0 && r.box[2] <= r.vw && r.box[3] <= r.vh && !r.clip && r.fs >= 12, JSON.stringify(r));
    check(`${L} it covers no control, the bag bar, the people panel or the stick`, r.vis && r.hits.length === 0, r.hits.join(', '));
    check(`${L} its close button is still a 44x44 target`, r.close[0] >= 44 && r.close[1] >= 44, JSON.stringify(r.close));
    if (vp.shot) await page.screenshot({ path: __dirname + '/../design/beta/img/' + vp.shot, type: 'jpeg', quality: 75 });
    // the bag drops every count over that spot: the goal line steps aside while it is open
    const bag = await page.$('#inventory-panel.bag-compact #bag-icon');
    if (bag) {
      await bag.tap();
      await page.waitForTimeout(300);
      const o = await page.evaluate(MEASURE);
      check(`${L} with the bag open the goal line steps aside (no overlap with the counts)`, !o.vis || o.hits.length === 0, JSON.stringify(o));
      await bag.tap();
    }
    check(`${L} no page errors; no database traffic`, errors.length === 0 && db.attempts() === 0, errors.join(' | '));
    await ctx.close();
  }
  await browser.close();
  done();
})();
