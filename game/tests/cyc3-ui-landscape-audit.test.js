// Cycle 3 U (item 4): the cycle-2 additions at 844x390 (landscape phone, touch) and 1280x720 (desktop). The a11y sweep runs
// 667x375 and 1920x1080 and checks control overlap only at 200% zoom, so these two sizes were not measured for overlap:
//   - controls covering each other (the sweep's U-06 rule: visible tap targets + drag areas, clipped by overflow parents, the
//     full-screen game view excluded) on the Realm world (danger meter in the zone line), Realm dungeon, Deepdelve (path trail run),
//     Isles and the Town (offline stub);
//   - the Realm danger meter stays inside the screen and is not under a control, nor is the zone panel holding it (at 844x390 touch
//     its raid line ran 15x17 px under ability button 2 before cycle 3);
//   - tap targets >= 44 px on touch; no sideways scroll.
// Firebase blocked (blockDb / offlineStub, db.attempts() === 0). Serve the repo root first:  python3 -m http.server 8440 &
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc3-ui-landscape-audit.test.js
const { chromium } = require('playwright');
const { check, done, blockDb, offlineStub, exposeGame, joinOffline } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const G = (p) => ORIGIN + '/game/games/' + p;
const PROFILE = { v: 1, heroes: [{ id: 'h1', name: 'Fern', cls: 'druid', level: 7, xp: 10, items: [] }], stash: [], fame: 0, mode: 'classic', hall: [] };
const SEED = { 'pixeltown-mm-v1': JSON.stringify(PROFILE), 'pixeltown-mm-active-v1': JSON.stringify({ v: 1, heroId: 'h1' }) };
const PAGES = [
  { id: 'realm-world', url: G('mad-maze/index.html?mode=world&test=1&seed=12345'), danger: true },
  { id: 'realm-dungeon', url: G('mad-maze/index.html?mode=dungeon&test=1&seed=5') },
  { id: 'deepdelve', url: G('deepdelve/index.html') },
  { id: 'isles', url: G('isles/index.html?isle=reef') },
  { id: 'town', url: ORIGIN + '/game/index.html', town: true }
];
const VPS = [{ id: '844x390', w: 844, h: 390, touch: true }, { id: '1280x720', w: 1280, h: 720, touch: false }];

const AUDIT = (touch) => {
  const vw = innerWidth, vh = innerHeight;
  const sel = (e) => (e.id ? '#' + e.id : e.tagName.toLowerCase() + ((e.getAttribute('class') || '').trim() ? '.' + e.getAttribute('class').trim().split(/\s+/)[0] : ''));
  const hidden = (e) => { for (let n = e; n && n.nodeType === 1; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden' || n.hidden || n.getAttribute('aria-hidden') === 'true' || n.hasAttribute('inert') || parseFloat(cs.opacity) === 0) return true; } return false; };
  const clipRect = (e) => {
    const r = e.getBoundingClientRect();
    let x = Math.max(0, r.left), y = Math.max(0, r.top), R = Math.min(vw, r.right), B = Math.min(vh, r.bottom);
    for (let n = e.parentElement; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (/hidden|clip|auto|scroll/.test(cs.overflowX + cs.overflowY)) { const p = n.getBoundingClientRect(); x = Math.max(x, p.left); y = Math.max(y, p.top); R = Math.min(R, p.right); B = Math.min(B, p.bottom); }
      if (cs.position === 'fixed') break;
    }
    return R - x > 2 && B - y > 2 ? { x, y, R, B } : null;
  };
  const Q = 'a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=link],[role=tab],[role=checkbox],[role=switch],[role=application],[tabindex]:not([tabindex="-1"])';
  const els = [...document.querySelectorAll(Q)].filter((e) => !e.disabled && !hidden(e))
    .filter((e) => { if (e.tagName !== 'CANVAS' && e.getAttribute('role') !== 'application') return true; const r = e.getBoundingClientRect(); return r.width * r.height < 0.5 * vw * vh; })
    .map((e) => ({ e, r: clipRect(e) })).filter((o) => o.r);
  const overlaps = [];
  for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
    const a = els[i], b = els[j];
    if (a.e.contains(b.e) || b.e.contains(a.e)) continue;
    const ox = Math.min(a.r.R, b.r.R) - Math.max(a.r.x, b.r.x), oy = Math.min(a.r.B, b.r.B) - Math.max(a.r.y, b.r.y);
    if (ox > 2 && oy > 2) overlaps.push(sel(a.e) + '+' + sel(b.e) + ' ' + Math.round(ox) + 'x' + Math.round(oy));
  }
  // buttons only (text inputs and inline links follow the sweep's own rules)
  const small = touch ? els.filter((o) => o.e.getAttribute('role') !== 'application' && !/^(INPUT|TEXTAREA|SELECT|A)$/.test(o.e.tagName))
    .filter((o) => { const r = o.e.getBoundingClientRect(); return r.width < 43.5 || r.height < 43.5; }).map((o) => { const r = o.e.getBoundingClientRect(); return sel(o.e) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height); }) : [];
  // the danger meter alone, then the whole zone panel (name, danger meter, raid / swarm line) it lives in
  const meas = (dz) => {
    if (!dz || hidden(dz)) return null;
    const r = dz.getBoundingClientRect();
    const under = els.filter((o) => Math.min(o.r.R, r.right) - Math.max(o.r.x, r.left) > 2 && Math.min(o.r.B, r.bottom) - Math.max(o.r.y, r.top) > 2).map((o) => sel(o.e));
    return { L: Math.round(r.left), R: Math.round(r.right), T: Math.round(r.top), B: Math.round(r.bottom), under };
  };
  return { overlaps, small, danger: meas(document.getElementById('rw-danger')), zone: meas(document.getElementById('rw-zone')), hscroll: document.documentElement.scrollWidth > vw + 1 };
};

(async () => {
  const browser = await chromium.launch();
  for (const vp of VPS) {
    for (const pg of PAGES) {
      const L = `[${pg.id} ${vp.id}]`;
      const ctx = await browser.newContext(vp.touch ? { viewport: { width: vp.w, height: vp.h }, hasTouch: true, isMobile: true } : { viewport: { width: vp.w, height: vp.h } });
      const db = pg.town ? await offlineStub(ctx) : await blockDb(ctx);
      await ctx.addInitScript((s) => { if (!sessionStorage.c3l) { sessionStorage.c3l = 1; for (const k in s) { try { localStorage.setItem(k, s[k]); } catch (e) { /* blocked */ } } } }, SEED);
      const p = await ctx.newPage(); const errors = [];
      p.on('pageerror', (e) => errors.push(e.message));
      try {
        if (pg.town) { await exposeGame(p); await p.goto(pg.url); await joinOffline(p, 'ADMINcyc3land'); await p.waitForTimeout(1500); }
        else { await p.goto(pg.url, { waitUntil: 'load', timeout: 30000 }); await p.waitForTimeout(pg.danger ? 3000 : 2000); }
        const r = await p.evaluate(AUDIT, vp.touch);
        check(`${L} no two controls cover each other`, r.overlaps.length === 0, r.overlaps.join(' | '));
        if (vp.touch) check(`${L} tap targets >= 44 px`, r.small.length === 0, r.small.join(' | '));
        check(`${L} no sideways scroll`, !r.hscroll);
        if (pg.danger) check(`${L} danger meter shown, inside the screen and not under a control`, !!r.danger && r.danger.L >= 0 && r.danger.R <= vp.w && r.danger.B <= vp.h && r.danger.under.length === 0, JSON.stringify(r.danger));
        if (pg.danger) check(`${L} the zone panel (name, danger, raid line) is not under a control`, !!r.zone && r.zone.under.length === 0, JSON.stringify(r.zone));
        if (process.env.SHOTS === '1') await p.screenshot({ path: __dirname + `/../design/beta/img/cyc3-ui-${pg.id}-${vp.id}.jpg`, type: 'jpeg', quality: 65 });
      } catch (e) { check(`${L} page audited`, false, String(e.message).slice(0, 160)); }
      check(`${L} no page errors; db.attempts() === 0`, errors.length === 0 && db.attempts() === 0, errors.slice(0, 2).join(' | ') + ' attempts=' + db.attempts());
      await ctx.close();
    }
  }
  await browser.close();
  done();
})();
