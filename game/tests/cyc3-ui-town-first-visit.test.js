// Cycle 3 U (item 3, new-player readiness; baseline design/beta/b08-r2.md): the Town's first visit on a fresh profile.
//   - The first-minute goal is said in words: the Realm Gate chip reads "Goal: Realm Gate" + the direction arrow (it read only
//     "Realm Gate", which b08 players took for a place label, not the thing to do first).
//   - The chip fits the screen and covers no other control at 390x844, 844x390 (landscape phone), 1280x720, 320x568 and 390x844 at
//     150% text.
//   - HUD diet guard at 390x844: at most 10 visible HUD elements covering at most 16% of the screen (cycle 3 measured 10 / 14.9%
//     before and 10 / 15.6% after the goal words; b08-r2 counted 12 counters + a mid-screen quick-emote bar + the walkie). Nothing
//     may grow back.
// Firebase blocked (offlineStub), offline join as an ADMIN bot, nothing written to any DB.
// Serve the repo root first:  python3 -m http.server 8440 &
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc3-ui-town-first-visit.test.js
const { chromium } = require('playwright');
const { check, done, offlineStub, exposeGame, joinOffline } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');

const CENSUS = () => {
  const vw = innerWidth, vh = innerHeight;
  const vis = (e) => { for (let n = e; n && n.nodeType === 1; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return false; } return true; };
  const items = [];
  document.querySelectorAll('body *').forEach((e) => {
    if (e.tagName === 'CANVAS' || !vis(e)) return;
    const r = e.getBoundingClientRect(); if (r.width < 4 || r.height < 4 || r.right <= 0 || r.bottom <= 0 || r.left >= vw || r.top >= vh) return;
    if (r.width * r.height > 0.6 * vw * vh) return;
    const cs = getComputedStyle(e);
    const leafy = e.matches('button,a[href],input,select,[role=button],[role=application],[role=status]') || ((cs.position === 'fixed' || cs.position === 'absolute') && e.children.length === 0 && (e.textContent || '').trim());
    if (!leafy || (e.parentElement && e.parentElement.closest('button,a[href],[role=button]'))) return;
    items.push({ e, id: e.id || String(e.className || e.tagName), r, btn: e.matches('button,a[href],[role=button],input,select,[role=application]') });
  });
  const cols = Math.ceil(vw / 2); const g = new Uint8Array(cols * Math.ceil(vh / 2));
  items.forEach(({ r }) => { for (let y = Math.max(0, r.top) >> 1; y < Math.min(vh, r.bottom) >> 1; y++) for (let x = Math.max(0, r.left) >> 1; x < Math.min(vw, r.right) >> 1; x++) g[y * cols + x] = 1; });
  let c = 0; g.forEach((v) => (c += v));
  const gp = document.getElementById('gate-pointer'); const gr = gp.getBoundingClientRect(); const txt = document.getElementById('gate-pointer-text');
  const hits = items.filter((o) => o.btn && !gp.contains(o.e) && Math.min(o.r.right, gr.right) - Math.max(o.r.left, gr.left) > 2 && Math.min(o.r.bottom, gr.bottom) - Math.max(o.r.top, gr.top) > 2).map((o) => o.id);
  return {
    n: items.length, pct: +(c * 4 / (vw * vh) * 100).toFixed(1), ids: items.map((o) => o.id),
    gp: { vis: vis(gp) && !gp.classList.contains('hidden'), text: (txt.textContent || '').replace(/\s+/g, ' ').trim(), L: Math.round(gr.left), R: Math.round(gr.right), vw, clip: txt.scrollWidth > txt.clientWidth + 1, hits }
  };
};

async function sample(browser, vp, extra) {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: vp.w, height: vp.h } }, vp.touch ? { hasTouch: true, isMobile: true } : {}, extra || {}));
  const db = await offlineStub(ctx);
  if (vp.seed) await ctx.addInitScript((s) => { if (!sessionStorage.c3) { sessionStorage.c3 = 1; for (const k in s) localStorage.setItem(k, s[k]); } }, vp.seed);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await exposeGame(page);
  await page.goto(ORIGIN + '/game/index.html');
  await joinOffline(page, 'ADMINcyc3first');
  await page.waitForFunction(() => { const g = document.getElementById('gate-pointer'); return g && !g.classList.contains('hidden'); }, null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(500);
  const r = await page.evaluate(CENSUS);
  if (vp.shot) await page.screenshot({ path: __dirname + '/../design/beta/img/' + vp.shot, type: 'jpeg', quality: 70 });
  await ctx.close();
  return Object.assign(r, { errors, attempts: db.attempts() });
}

(async () => {
  const browser = await chromium.launch();
  const VPS = [
    { id: '390x844', w: 390, h: 844, touch: true, shot: 'cyc3-ui-town-first-after.jpg' },
    { id: '844x390', w: 844, h: 390, touch: true },
    { id: '1280x720', w: 1280, h: 720 },
    { id: '320x568', w: 320, h: 568, touch: true },
    { id: '390x844 text 150%', w: 390, h: 844, touch: true, seed: { 'pixeltown-access-v1': JSON.stringify({ v: 1, hudScale: 1.5 }) } }
    // under 301 css px (200% zoom) the chip is hidden by design (style.css: no room beside the Menu; Where to? lists the Realm)
  ];
  for (const vp of VPS) {
    const r = await sample(browser, vp);
    const L = `[${vp.id}]`;
    check(`${L} the Realm Gate chip shows on the first visit`, r.gp.vis, JSON.stringify(r.gp));
    check(`${L} it says the first-minute goal in words ("Goal: ... Realm Gate")`, /^Goal: .*Realm Gate/.test(r.gp.text), r.gp.text);
    check(`${L} the chip fits the screen and its text is not clipped`, r.gp.L >= 0 && r.gp.R <= r.gp.vw && !r.gp.clip, JSON.stringify(r.gp));
    check(`${L} the chip covers no other control`, r.gp.hits.length === 0, r.gp.hits.join(', '));
    if (vp.id === '390x844') {
      console.log(`INFO ${L} first-visit HUD: ${r.n} elements, ${r.pct}% of the screen: ${r.ids.join(', ')}`);
      check(`${L} HUD diet guard: <= 10 visible HUD elements, <= 16% of the screen`, r.n <= 10 && r.pct <= 16, r.n + ' / ' + r.pct + '%');
    }
    check(`${L} no page errors; offline: db.attempts() === 0`, r.errors.length === 0 && r.attempts === 0, r.errors.join(' | ') + ' attempts=' + r.attempts);
  }
  await browser.close();
  done();
})();
