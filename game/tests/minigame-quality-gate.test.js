// QS2 mini game quality gate: every mini game page (and any new game/games/<dir>/index.html that is not one of the big worlds)
// is held to the same floor, at 390x844 touch and 1280x720 desktop:
//  - first frame (first-contentful-paint, or load + one rAF) under 3 s; the budget scales with machine load like smoke-journey
//  - 0 console errors / page errors, 0 database requests (blockDb: HTTP + WebSocket), no horizontal scroll
//  - the MMNav Menu button is on screen and does not overlap any other visible control
//  - phone: every visible button/link is >= 44 px tall; all visible text >= 12 px (computed font-size)
//  - reduced motion (prefers-reduced-motion + pixeltown-access-v1 flashes:false) and low graphics (lowGfx:true) are honoured:
//    the game's own flag reads reduced/low where it exposes one, and canvas work per frame does not grow while idle
//  - keyboard: Tab (from a fresh page) reaches the primary Play/Start control and never stops on an invisible (<= 2 px) control
// Known exceptions live in ALLOW below. That list may only SHRINK: a new offender fails the gate; a fixed one prints a note
// asking for its entry to be removed.
// Run: python3 -m http.server 8440 &   BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/minigame-quality-gate.test.js
// PROBE=1 prints every measurement (for updating game/design/MINIGAME-GATE-OFFENDERS.md).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const GAMES_DIR = path.join(__dirname, '..', 'games');
const ACCESS = 'pixeltown-access-v1';

// page, primary control (Tab target), hook (window global with .reduced / .lowGfx where the game exposes them), seed storage
const PAGES = [
  { id: 'jam', url: 'jam/index.html', primary: '#overlay button', hook: '__jam' },
  { id: 'angler', url: 'angler/index.html', primary: '#spots button', hook: '__angler' },
  { id: 'stalk', url: 'stalk/index.html', primary: '#buy1, #pr-start, #hint-ok', hook: '__stalk' },
  { id: 'deepdelve', url: 'deepdelve/index.html', primary: '#t-mine, #craft-btn', hook: '__dd' }, // no Start: the dive runs on load; Mine is the main action,
  { id: 'bugs', url: 'festival/bugs.html', primary: '#hint-ok, button.card', hook: '__bugs' }, // first meadow card starts a hunt,
  { id: 'pop', url: 'pop/index.html', primary: '#play', hook: '__pop' },
  { id: 'dash', url: 'dash/index.html', primary: '#play', hook: '__dash' },
  { id: 'lantern', url: 'mad-maze/lantern.html', primary: '#start, #new-create', hook: '__lantern' }, // fresh save: Create hero comes first,
];
const SKIP_DIRS = ['isles', 'mad-maze', 'arcane-frontier'];
// any new mini game directory gets the gate automatically (primary = first button)
for (const d of fs.readdirSync(GAMES_DIR)) {
  if (SKIP_DIRS.includes(d) || PAGES.some((p) => p.url.split('/')[0] === d)) continue;
  if (fs.existsSync(path.join(GAMES_DIR, d, 'index.html'))) PAGES.push({ id: d, url: d + '/index.html', primary: 'button, a[href]', hook: null });
}

// Allow-list: '<page>:<check>:<element key>'. May only shrink. Element key = #id, else tag.class, else tag "text".
const ALLOW = new Set(require('./fixtures/minigame-gate-allow.json'));
const seen = new Set();
const allowed = (k) => { if (ALLOW.has(k)) { seen.add(k); return true; } return false; };

const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
const DESK = { viewport: { width: 1280, height: 720 } };
const load = os.loadavg()[0], cores = os.cpus().length || 1;
const BUDGET = 3000 * Math.max(1, load / cores);
if (BUDGET > 3000) console.log(`INFO machine load ${load.toFixed(1)} on ${cores} cores: first-frame budget scaled to ${(BUDGET / 1000).toFixed(1)} s`);

async function open(browser, pg, ctxOpts, prefs) {
  const ctx = await browser.newContext(ctxOpts);
  const db = await blockDb(ctx);
  await ctx.addInitScript(([key, p]) => {
    try { if (p) localStorage.setItem(key, JSON.stringify(p)); } catch (e) { /* ignore */ }
    const P = CanvasRenderingContext2D.prototype, n = { calls: 0 };
    window.__gateDraw = n;
    ['fillRect', 'strokeRect', 'fill', 'stroke', 'fillText', 'drawImage', 'arc', 'ellipse', 'clearRect'].forEach((k) => {
      const o = P[k]; P[k] = function () { n.calls++; return o.apply(this, arguments); };
    });
  }, [ACCESS, prefs || null]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  const t0 = Date.now();
  await page.goto(ORIGIN + '/game/games/' + pg.url, { waitUntil: 'load' });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const wall = Date.now() - t0;
  const fcp = await page.evaluate(() => { const e = performance.getEntriesByName('first-contentful-paint')[0]; return e ? e.startTime : null; });
  await page.waitForTimeout(400);
  return { ctx, page, errors, db, first: fcp != null ? Math.min(fcp, wall) : wall };
}

// visible controls + small text, all measured in the page
const audit = () => {
  const key = (e) => e.id ? '#' + e.id : e.tagName.toLowerCase() + (e.classList[0] ? '.' + e.classList[0] : '') + ' "' + (e.textContent || '').trim().slice(0, 24) + '"';
  const vis = (e) => {
    // MMNav's legacy Hub/Town links are deliberately clipped to 1 px (kept in the DOM for ?nav=0); they are not on-screen controls
    if (e.closest('.mm-nav-legacy')) return false;
    const r = e.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false;
    for (let n = e; n && n.nodeType === 1; n = n.parentElement) { const s = getComputedStyle(n); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0 || n.hidden) return false; }
    return true;
  };
  const ctrls = [...document.querySelectorAll('button, a[href], [role="button"], input:not([type="hidden"]), select, summary')].filter(vis);
  const nav = document.getElementById('mm-nav-btn');
  const rect = (e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
  const small = [];
  for (const e of ctrls) { const r = e.getBoundingClientRect(); if (r.height < 44 && e.type !== 'checkbox' && e.type !== 'radio') small.push([key(e), Math.round(r.height)]); }
  const tiny = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const done = new Set();
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    if (!t.textContent.trim()) continue; const e = t.parentElement; if (!e || done.has(e)) continue; done.add(e);
    if (/^(SCRIPT|STYLE|NOSCRIPT|TITLE)$/.test(e.tagName) || !vis(e)) continue;
    const fs = parseFloat(getComputedStyle(e).fontSize); if (fs < 12) tiny.push([key(e), fs]);
  }
  let overlap = [];
  const navVis = !!nav && vis(nav);
  if (navVis) {
    const a = nav.getBoundingClientRect();
    overlap = ctrls.filter((e) => e !== nav && !nav.contains(e) && !e.closest('#mm-nav-sheet')).filter((e) => {
      const b = e.getBoundingClientRect(); return a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
    }).map(key);
  }
  const nr = nav ? rect(nav) : null;
  return {
    small, tiny, overlap, navVis,
    navOn: !!nr && nr.x >= 0 && nr.y >= 0 && nr.x + nr.w <= innerWidth && nr.y + nr.h <= innerHeight,
    scroll: document.documentElement.scrollWidth, vw: innerWidth,
  };
};

async function tabTo(page, sel) {
  await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); window.scrollTo(0, 0); });
  const ghosts = [];
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    const st = await page.evaluate((s) => {
      const a = document.activeElement; if (!a || a === document.body) return { hit: false };
      const r = a.getBoundingClientRect();
      return { hit: a.matches(s), ghost: r.width <= 2 || r.height <= 2, key: a.id ? '#' + a.id : a.tagName.toLowerCase() + (a.classList[0] ? '.' + a.classList[0] : '') + ' "' + (a.textContent || '').trim().slice(0, 24) + '"' };
    }, sel);
    if (st.ghost && !ghosts.includes(st.key)) ghosts.push(st.key);
    if (st.hit) return { n: i + 1, ghosts };
  }
  return { n: 0, ghosts };
}

// canvas calls per frame over ~90 frames; growth = later frames costing clearly more than early ones while idle
const drawTrend = () => new Promise((res) => {
  const n = window.__gateDraw, per = []; let last = n.calls, k = 0;
  const tick = () => { per.push(n.calls - last); last = n.calls; if (++k < 90) requestAnimationFrame(tick); else res(per); };
  requestAnimationFrame(tick);
});
const avg = (a) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);

(async () => {
  const browser = await chromium.launch();
  const rows = [];
  for (const pg of PAGES) {
    const row = { page: pg.id, issues: [] };
    for (const [form, opts] of [['phone', PHONE], ['desktop', DESK]]) {
      const t = await open(browser, pg, opts, null);
      const a = await t.page.evaluate(audit);
      const L = `${pg.id} ${form}`;
      if (process.env.PROBE) console.log('PROBE', L, JSON.stringify(Object.assign({ first: t.first }, a)));
      check(`${L}: first frame in ${t.first} ms (< ${BUDGET.toFixed(0)})`, t.first < BUDGET);
      check(`${L}: no horizontal scroll (${a.scroll} <= ${a.vw})`, a.scroll <= a.vw);
      check(`${L}: Menu button visible and fully on screen`, a.navVis && a.navOn, JSON.stringify(a));
      const ov = a.overlap.filter((k) => !allowed(`${pg.id}:overlap:${k}`));
      check(`${L}: Menu button overlaps no control`, ov.length === 0, JSON.stringify(ov));
      if (ov.length) row.issues.push(`${form}: Menu overlaps ${ov.join(', ')}`);
      if (form === 'phone') {
        const sm = a.small.filter(([k]) => !allowed(`${pg.id}:target:${k}`));
        check(`${L}: every visible button/link is >= 44 px tall`, sm.length === 0, JSON.stringify(sm));
        if (sm.length) row.issues.push('targets < 44 px: ' + sm.map((x) => `${x[0]} ${x[1]}px`).join(', '));
        const tx = a.tiny.filter(([k]) => !allowed(`${pg.id}:text:${k}`));
        check(`${L}: all visible text >= 12 px`, tx.length === 0, JSON.stringify(tx));
        if (tx.length) row.issues.push('text < 12 px: ' + tx.map((x) => `${x[0]} ${x[1]}px`).join(', '));
        const { n, ghosts } = await tabTo(t.page, pg.primary);
        const gh = ghosts.filter((k) => !allowed(`${pg.id}:focus:${k}`));
        check(`${L}: Tab never lands on an invisible (<= 2 px) control`, gh.length === 0, JSON.stringify(gh));
        if (gh.length) row.issues.push('invisible Tab stops: ' + gh.join(', '));
        check(`${L}: keyboard Tab reaches the primary control (${pg.primary}) in ${n} presses`, n > 0);
        if (!n) row.issues.push('Tab never reaches ' + pg.primary);
        row.first = t.first;
      }
      check(`${L}: no console errors`, t.errors.length === 0, t.errors.join(' | '));
      check(`${L}: 0 database requests`, t.db.attempts() === 0, JSON.stringify([t.db.http, t.db.ws]));
      if (t.errors.length) row.issues.push(`${form}: console errors`);
      await t.ctx.close();
    }
    // reduced motion + low graphics
    const r = await open(browser, pg, Object.assign({ reducedMotion: 'reduce' }, PHONE), { v: 1, lowGfx: true, flashes: false });
    const flags = await r.page.evaluate((h) => { const o = h && window[h]; return o ? { reduced: o.reduced, lowGfx: o.lowGfx } : {}; }, pg.hook);
    if (flags.reduced !== undefined) check(`${pg.id}: the game reads reduced motion (prefers-reduced-motion + flashes:false)`, flags.reduced === true, JSON.stringify(flags));
    if (flags.lowGfx !== undefined && typeof flags.lowGfx !== 'function') check(`${pg.id}: the game reads low graphics`, flags.lowGfx === true, JSON.stringify(flags));
    const per = await r.page.evaluate(drawTrend);
    const a0 = avg(per.slice(5, 35)), a1 = avg(per.slice(60));
    if (process.env.PROBE) console.log('PROBE', pg.id, 'reduced/low draws per frame', a0.toFixed(1), a1.toFixed(1));
    check(`${pg.id}: reduced + low graphics: canvas work per frame does not grow while idle (${a0.toFixed(1)} -> ${a1.toFixed(1)})`, a1 <= a0 * 1.25 + 4);
    check(`${pg.id} reduced/low: no console errors, 0 DB requests`, r.errors.length === 0 && r.db.attempts() === 0, r.errors.join(' | '));
    await r.ctx.close();
    rows.push(row);
  }
  console.log('\n| page | first frame (phone) | open issues |\n|---|---|---|');
  for (const r of rows) console.log(`| ${r.page} | ${r.first} ms | ${r.issues.join('; ') || 'none'} |`);
  const stale = [...ALLOW].filter((k) => !seen.has(k));
  if (stale.length) console.log('NOTE allow-list entries no longer needed (remove them, the list may only shrink): ' + stale.join(', '));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
