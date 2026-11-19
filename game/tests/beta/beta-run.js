// Beta gate: plays every page for ~20 s at three viewports and writes game/design/BETA-REPORT.md + beta-status.json.
//   NODE_PATH=$(npm root -g) node game/tests/run-all.js --beta        (or: node game/tests/beta/beta-run.js)
// Env: BASE (an existing server's .../game/index.html), ONLY=slug,slug (re-run those pages and merge into the saved results),
//      VP=desk,390,360 (subset of viewports), PLAY_MS=20000, THREE_JS=<local three.min.js>.
// The town is joined as an ADMIN* bot (presence only; this script never chats and never writes anything else to Firebase).
// Lives in game/tests/beta/ so run-all's *.test.js glob does not pick it up.
'use strict';
const { chromium } = require('playwright');
const { spawn, execSync } = require('child_process');
const net = require('net');
const path = require('path');
const fs = require('fs');
const lib = require('./beta-lib');

const REPO = path.resolve(__dirname, '..', '..', '..');
const SHOT_DIR = path.join(__dirname, 'screens');
const RESULTS = path.join(__dirname, 'results.json');
const DESIGN = path.join(REPO, 'game', 'design');
const PLAY_MS = Number(process.env.PLAY_MS || 20000);
const THREE = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js';
const THREE_LOCAL = process.env.THREE_JS || '/tmp/claude-0/three.min.js';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const VIEWPORTS = [
  { key: 'desk', name: '1280x720', w: 1280, h: 720, phone: false },
  { key: '390', name: '390x844', w: 390, h: 844, phone: true },
  { key: '360', name: '360x640', w: 360, h: 640, phone: true },
];

// ---------- in-page helpers ----------
const INIT = () => {
  const S = window.__betaFps = { on: false, t: [], last: 0 };
  const f = (ts) => { if (S.on) { if (S.last) S.t.push(ts - S.last); S.last = ts; } else S.last = 0; requestAnimationFrame(f); };
  requestAnimationFrame(f);
  // synthetic touch pointers (Playwright cannot hold two touches), routed to the element under the finger
  const targets = {};
  const fire = (type, id, x, y, el) => el && el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: id, pointerType: 'touch', isPrimary: id === 1, clientX: x, clientY: y, buttons: type === 'pointerup' ? 0 : 1 }));
  window.__bt = {
    down(id, x, y) { const el = document.elementFromPoint(x, y); targets[id] = el; fire('pointerdown', id, x, y, el); },
    move(id, x, y) { fire('pointermove', id, x, y, targets[id]); },
    up(id, x, y) { fire('pointerup', id, x, y, targets[id]); delete targets[id]; },
  };
};

const MEASURE = (cfg) => {
  const lab = (el, i, n) => {
    const t = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 14);
    return el.tagName.toLowerCase() + (el.id ? '#' + el.id : (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/)[0] : '')) + (t && !el.id ? ' "' + t + '"' : '') + (n > 1 ? '[' + i + ']' : '');
  };
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return null;
    if (r.right <= 0 || r.bottom <= 0 || r.left >= innerWidth || r.top >= innerHeight) return null;
    for (let p = el; p; p = p.parentElement) { const c = getComputedStyle(p); if (c.display === 'none' || c.visibility === 'hidden' || parseFloat(c.opacity) === 0) return null; }
    return r;
  };
  const rr = (r) => ({ x: Math.round(r.left * 10) / 10, y: Math.round(r.top * 10) / 10, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 });
  const collect = (sels) => {
    const out = [];
    for (const s of sels) {
      const els = [...document.querySelectorAll(s)];
      els.forEach((el, i) => { const r = vis(el); if (r) out.push({ sel: s + (els.length > 1 ? '[' + i + ']' : ''), el, ...rr(r) }); });
    }
    return out;
  };
  const hud = collect(cfg.hud), ctrl = collect(cfg.ctrl);
  for (const a of hud) a.nest = ctrl.filter((b) => a.el.contains(b.el) || b.el.contains(a.el)).map((b) => b.sel);
  for (const b of ctrl) b.nest = hud.filter((a) => a.el.contains(b.el) || b.el.contains(a.el)).map((a) => a.sel);
  const taps = [];
  const all = [...document.querySelectorAll('button, a[href], input:not([type=hidden]), [role=button]')];
  all.forEach((el, i) => {
    const r = vis(el); if (!r) return;
    if (el.tagName === 'INPUT' && el.type === 'file') return;
    // a radio/checkbox inside a <label> is tapped through the label: measure that
    const lb = (el.type === 'radio' || el.type === 'checkbox') && el.closest('label');
    if (lb && vis(lb)) { taps.push({ sel: 'label ' + lab(el, i, 1), ...rr(lb.getBoundingClientRect()) }); return; }
    taps.push({ sel: lab(el, i, 1), ...rr(r) });
  });
  const clipped = [];
  const roots = [];
  for (const s of (cfg.clip || cfg.hud)) document.querySelectorAll(s).forEach((e) => roots.push(e));
  const seen = new Set();
  for (const root of roots) {
    for (const el of [root, ...root.querySelectorAll('*')]) {
      if (seen.has(el)) continue; seen.add(el);
      const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!hasText || !vis(el)) continue;
      const cs = getComputedStyle(el);
      const hides = (v) => v === 'hidden' || v === 'clip';
      if ((hides(cs.overflowX) || cs.textOverflow === 'ellipsis') && el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) clipped.push(lab(el, 0, 1) + ' wide ' + el.scrollWidth + '>' + el.clientWidth);
      else if (hides(cs.overflowY) && el.scrollHeight > el.clientHeight + 1 && el.clientHeight > 0 && cs.display !== 'inline') clipped.push(lab(el, 0, 1) + ' tall ' + el.scrollHeight + '>' + el.clientHeight);
      for (const n of el.childNodes) {
        if (n.nodeType !== 3 || !n.textContent.trim()) continue;
        const rg = document.createRange(); rg.selectNodeContents(n); const b = rg.getBoundingClientRect();
        if (b.width > 0 && (b.right > innerWidth + 1 || b.left < -1)) { clipped.push(lab(el, 0, 1) + ' text off-screen'); break; }
      }
    }
  }
  const strip = (l) => l.map(({ el, ...rest }) => rest);
  return {
    scroll: { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, bw: document.body ? document.body.scrollWidth : 0 },
    taps, hud: strip(hud), ctrl: strip(ctrl), clipped,
  };
};

// ---------- touch / pad helpers ----------
async function center(page, sel) { return page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: Math.min(r.width, r.height) / 2 }; }, sel); }
// Hold one or more virtual sticks: pads = [{sel, vx, vy}] with vx/vy in [-1,1].
async function holdSticks(page, pads, ms) {
  const cs = [];
  for (let i = 0; i < pads.length; i++) {
    const c = await center(page, pads[i].sel); if (!c) continue;
    const id = i + 1;
    await page.evaluate(([id, x, y]) => window.__bt.down(id, x, y), [id, c.x, c.y]);
    await page.evaluate(([id, x, y]) => window.__bt.move(id, x, y), [id, c.x + pads[i].vx * c.r * 0.8, c.y + pads[i].vy * c.r * 0.8]);
    cs.push({ id, c, p: pads[i] });
  }
  await wait(ms / 2);
  for (const k of cs) await page.evaluate(([id, x, y]) => window.__bt.move(id, x, y), [k.id, k.c.x - k.p.vx * k.c.r * 0.5, k.c.y + k.p.vy * k.c.r * 0.6]);
  await wait(ms / 2);
  for (const k of cs) await page.evaluate(([id, x, y]) => window.__bt.up(id, x, y), [k.id, k.c.x, k.c.y]);
}
async function holdTouchAt(page, x, y, ms, id = 9) {
  await page.evaluate(([id, x, y]) => window.__bt.down(id, x, y), [id, x, y]);
  await wait(ms);
  await page.evaluate(([id, x, y]) => window.__bt.up(id, x, y), [id, x, y]);
}
async function tapSel(page, sel, phone) {
  const c = await center(page, sel); if (!c) return false;
  if (phone) await page.touchscreen.tap(c.x, c.y); else await page.mouse.click(c.x, c.y);
  return true;
}
async function hold(page, key, ms) { await page.keyboard.down(key); await wait(ms); await page.keyboard.up(key); }

// ---------- per-page config ----------
const GAME = (p) => new URL(BASE).origin + '/game/' + p;
let BASE = process.env.BASE;
const TOWN_EXT = [/^https:\/\/cdn\.jsdelivr\.net\/npm\/(phaser|three)@/, /^https:\/\/www\.gstatic\.com\/firebasejs\//, /firebaseio\.com/];
const DIRS = [['w', 0, -1], ['d', 1, 0], ['s', 0, 1], ['a', -1, 0], ['ArrowUp', 0, -1], ['ArrowRight', 1, 0], ['ArrowDown', 0, 1], ['ArrowLeft', -1, 0]];

const arenaPlay = async (page, phone, i) => {
  if (phone) {
    const d = DIRS[i % DIRS.length];
    await holdSticks(page, [{ sel: '#realm-stick-move', vx: d[1], vy: d[2] }, { sel: '#realm-stick-aim', vx: Math.cos(i), vy: Math.sin(i) }], 1400);
    if (i % 2) await tapSel(page, '#realm-ab-' + (i % 4), true);
  } else {
    const box = await page.evaluate(() => { const c = document.querySelector('#realm-canvas-wrap canvas'); const r = c.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    const d = DIRS[i % 4];
    await page.keyboard.down(d[0]);
    await page.mouse.move(box.x + box.w * (0.2 + 0.6 * ((i * 37) % 10) / 10), box.y + box.h * (0.25 + 0.5 * ((i * 53) % 10) / 10));
    await page.mouse.down(); await wait(1300);
    if (i % 3 === 2) await tapSel(page, '#realm-ab-' + (i % 4), false);
    await page.mouse.up(); await page.keyboard.up(d[0]);
  }
};
const arenaCfg = (name, slug, q) => ({
  name, slug, url: () => GAME('games/mad-maze/index.html' + q),
  hud: ['#realm-hp', '#realm-info', '#realm-xp', '#realm-abilities', '#realm-partner', '#realm-boss', '#realm-banner', '#realm-help', '#mm-map'],
  ctrl: ['#realm-stick-move', '#realm-stick-aim', '#realm-bp-btn', '#realm-board-btn', '#realm-leave-btn', '#realm-aim-btn', '#mm-map-btn', '#realm-xp'], // #realm-xp sits in ctrl so the HP bar is tested against it
  ready: (page) => page.waitForSelector('#realm-canvas-wrap canvas', { timeout: 15000 }),
  play: arenaPlay,
  save: { type: 'storeProbe', key: 'pixeltown-save-v1' },
  back: { sel: '#realm-leave-btn', expect: /\/game\/index\.html$/ },
});

const PAGES = [
  {
    name: 'Town (Pixeltown)', slug: 'town', url: () => GAME('index.html'), join: true, ext: TOWN_EXT,
    hud: ['#hud', '#player-list-panel', '#chat-panel'], ctrl: ['#joystick', '#action-buttons'],
    ready: async () => {},
    play: async (page, phone, i) => {
      if (phone) { const d = DIRS[i % 8]; await holdSticks(page, [{ sel: '#joystick', vx: d[1], vy: d[2] }], 1500); if (i % 3 === 2) await page.touchscreen.tap(195, 420); }
      else { const d = DIRS[i % 8]; await hold(page, d[0], 1100); if (i % 4 === 3) await page.mouse.click(640, 360); }
    },
    save: { type: 'probe', key: 'pixeltown-save-v1', nojoin: true },
    back: null,
  },
  {
    name: 'Hub map', slug: 'hub', url: () => GAME('hub/index.html'),
    hud: ['#hud'], ctrl: ['#bar', '#open-btn', '#card'],
    ready: (page) => page.waitForFunction(() => window.__hub, null, { timeout: 15000 }),
    play: async (page, phone, i) => {
      const ids = ['w0-hearthvale', 'w1-hearthvale', 'w4-angler', 'w3-deepdelve'];
      if (phone) {
        const id = ids[i % ids.length];
        const p = await page.evaluate((n) => { try { return window.__hub.nodeClient(n); } catch (e) { return null; } }, id);
        if (p) await page.touchscreen.tap(p.x, p.y);
        await wait(900);
        if (await page.isVisible('#card')) { await wait(500); await tapSel(page, '#card-close', true); }
      } else {
        for (const k of [DIRS[i % 8][0], 'Enter']) { await page.keyboard.press(k); await wait(500); }
        await wait(500);
        if (await page.isVisible('#card')) await tapSel(page, '#card-close', false);
      }
    },
    save: { type: 'probe', key: 'pixeltown-hub-v1' },
    backFn: async (page, phone) => hubRoundTrip(page, phone),
  },
  arenaCfg('Mad Maze (solo arena)', 'mad-maze-solo', '?offline=1'),
  arenaCfg('Mad Maze (dungeon, seed 1)', 'mad-maze-dungeon', '?mode=dungeon&seed=1'),
  {
    name: 'The Lantern', slug: 'lantern', url: () => GAME('games/mad-maze/lantern.html'),
    hud: ['header', '#heroes-card', '#fountain-card'], ctrl: ['#back-hub', '#back-town', '#start'],
    ready: (page) => page.waitForSelector('#heroes', { state: 'attached' }),
    play: async (page, phone, i) => {
      if (i === 0) { await page.fill('#new-name', 'BetaHero'); await tapSel(page, '#new-create', phone); await wait(500); }
      await page.evaluate((y) => window.scrollTo(0, y), [0, 400, 900, 1500, 600][i % 5]);
      await wait(700);
      if (i % 2) await tapSel(page, '#rest', phone);
      await wait(700);
    },
    save: { type: 'lantern' },
    back: { sel: '#back-hub', expect: /\/game\/hub\/index\.html$/ },
  },
  {
    name: 'Deepdelve', slug: 'deepdelve', url: () => GAME('games/deepdelve/index.html?seed=5'), ext: [/^https:\/\/cdn\.jsdelivr\.net\/npm\/three@0\.160\.0\//],
    hud: ['#hud', '#hotbar', '#hud-pick', '#hud-goal', '#hpbar'], ctrl: ['#joy', '#tbtns', '#open-craft', '#open-goals', '#mode-btn', '#t-jump', '#t-mine', '#t-place'],
    ready: (page) => page.waitForSelector('#gl', { timeout: 40000 }).then(() => wait(2500)),
    play: async (page, phone, i) => {
      if (phone) {
        const d = DIRS[i % 4];
        await holdSticks(page, [{ sel: '#joy', vx: d[1], vy: d[2] }], 900);
        await tapSel(page, '#t-jump', true);
        const c = await center(page, '#gl');
        await page.evaluate(([x, y]) => { window.__bt.down(5, x, y); window.__bt.move(5, x + 60, y + 15); window.__bt.up(5, x + 60, y + 15); }, [c.x, c.y]);
        const m = await center(page, '#t-mine');
        if (m) await holdTouchAt(page, m.x, m.y, 800, 6);
      } else {
        const d = DIRS[i % 4];
        // pointer lock turns mouse deltas into look. Headless reports the lock click as a huge delta (pitch pinned to the sky),
        // so recentre once with a synthetic movement event, then look around with small synthetic deltas.
        const look = (dx, dy) => page.evaluate(([dx, dy]) => document.dispatchEvent(new MouseEvent('mousemove', { movementX: dx, movementY: dy })), [dx, dy]);
        if (i === 0) { await page.mouse.move(640, 360); await page.mouse.click(640, 360); await wait(300); await look(0, 640); }
        await look(((i % 3) - 1) * 40, ((i % 2) - 0.5) * 20);
        await page.keyboard.down(d[0]); await page.keyboard.press('Space'); await page.evaluate(() => document.getElementById('gl').dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }))); await wait(900); await page.evaluate(() => window.dispatchEvent(new MouseEvent('mouseup', { button: 0 }))); await page.keyboard.up(d[0]); // synthetic: Playwright's real mouse.down/up injects look deltas under pointer lock
        await page.keyboard.press(String(1 + (i % 5)));
        await wait(200);
      }
    },
    save: { type: 'deepdelve' },
    back: { sel: '#back-hub', expect: /\/game\/hub\/index\.html$/ },
  },
  {
    name: 'Lakeside Angler', slug: 'angler', url: () => GAME('games/angler/index.html'),
    hud: ['#status', '#bossinfo'], ctrl: ['#spots', '#journal-btn', '#gear-btn', '#back-hub', '#back-town'],
    ready: (page) => page.waitForSelector('#scene'),
    play: async (page, phone, i) => {
      const c = await center(page, '#scene'); const x = c.x, y = c.y;
      if (phone) { await page.touchscreen.tap(x, y); await wait(1300); await holdTouchAt(page, x, y, 1400); await wait(300); }
      else { await page.keyboard.press('Space'); await wait(1300); await page.keyboard.down('Space'); await wait(1400); await page.keyboard.up('Space'); await wait(300); }
      if (await page.isVisible('#result')) await tapSel(page, '#res-ok', phone);
      if (i === 2) { await tapSel(page, '#gear-btn', phone); await wait(500); await tapSel(page, '#gear-close', phone); }
    },
    save: { type: 'probe', key: 'pixeltown-angler-v1' },
    back: { sel: '#back-hub', expect: /\/game\/hub\/index\.html$/ },
  },
  {
    name: 'Bug Safari', slug: 'bugs', url: () => GAME('games/festival/bugs.html'),
    hud: ['#hud', '#combo', '#top'], ctrl: ['#touch', '#joy', '#btn-sneak', '#btn-swing', '#btn-mute'],
    ready: async (page, phone) => {
      await page.waitForSelector('#overlay:not([hidden]) .card', { timeout: 10000 }).catch(() => {});
      if (await page.isVisible('#hint-ok')) await tapSel(page, '#hint-ok', phone);
    },
    afterStart: async (page, phone) => {
      if (await page.isVisible('#hint-ok')) await tapSel(page, '#hint-ok', phone);
      const ok = await tapSel(page, '#overlay .card:not([disabled])', phone);
      await wait(600);
      if (await page.isVisible('#hint-ok')) await tapSel(page, '#hint-ok', phone);
      return ok;
    },
    play: async (page, phone, i) => {
      if (phone) { const d = DIRS[i % 4]; await holdSticks(page, [{ sel: '#joy', vx: d[1], vy: d[2] }], 1000); await tapSel(page, '#btn-swing', true); await wait(150); await tapSel(page, '#btn-swing', true); }
      else { const d = DIRS[i % 8]; await hold(page, d[0], 800); await page.keyboard.press('Space'); await wait(200); await page.keyboard.press('Space'); }
    },
    save: { type: 'bugs' },
    back: { sel: ['#menu-back', 'a.back'], expect: /\/game\/hub\/index\.html$/ },
  },
];

// Campfire Jam / Stalk Market pages (and any other new game page) are picked up when they exist.
function discoverExtra() {
  const root = path.join(REPO, 'game', 'games');
  const known = new Set(['mad-maze/index.html', 'mad-maze/lantern.html', 'deepdelve/index.html', 'angler/index.html', 'festival/bugs.html']);
  const out = [];
  for (const dir of fs.readdirSync(root)) {
    if (dir === 'arcane-frontier') continue; // placeholder art source, not a playable page
    const full = path.join(root, dir);
    if (!fs.statSync(full).isDirectory()) continue;
    for (const f of fs.readdirSync(full).filter((x) => x.endsWith('.html'))) {
      const rel = dir + '/' + f;
      if (known.has(rel)) continue;
      const slug = (dir + '-' + f.replace(/\.html$/, '')).replace(/[^a-z0-9]+/gi, '-').toLowerCase();
      out.push({
        name: rel, slug, url: () => GAME('games/' + rel), hud: ['header', '#hud'], ctrl: ['#touch', '#joy'],
        ready: async () => {},
        play: async (page, phone, i) => {
          const c = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
          const d = DIRS[i % 8];
          if (phone) await page.touchscreen.tap(c.w / 2, c.h / 2); else { await hold(page, d[0], 700); await page.keyboard.press('Space'); await page.mouse.click(c.w / 2, c.h / 2); }
          await wait(500);
        },
        save: { type: 'probe', key: 'pixeltown-beta-probe-' + slug },
        back: null,
      });
    }
  }
  return out;
}

// ---------- special checks ----------
async function hubRoundTrip(page, phone) {
  try {
    const node = await page.evaluate(() => (window.__hub.isReachable('w0-hearthvale') ? 'w0-hearthvale' : 'w1-hearthvale'));
    const p = await page.evaluate((n) => window.__hub.nodeClient(n), node);
    const tap = async (x, y) => { if (phone) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y); };
    await tap(p.x, p.y);
    await page.waitForFunction(() => !window.__hub.walking, null, { timeout: 9000 });
    if (!(await page.isVisible('#card'))) { await tap(p.x, p.y); await wait(500); }
    const docs = [];
    page.on('response', (r) => { if (r.request().resourceType() === 'document') docs.push([r.status(), r.url()]); });
    await Promise.all([page.waitForURL(/\/game\/index\.html\?from=hub/, { timeout: 9000 }), tapSel(page, '#card-play', phone)]);
    await page.waitForSelector('#back-to-map-pill:not(.hidden)', { timeout: 9000 });
    await Promise.all([page.waitForURL(/\/game\/hub\/index\.html/, { timeout: 9000 }), tapSel(page, '#back-to-map-pill', phone)]);
    await page.waitForFunction(() => window.__hub, null, { timeout: 9000 });
    const bad = docs.filter((d) => d[0] !== 200);
    return bad.length ? { ok: false, why: 'non-200 ' + bad.map((d) => d.join(' ')).join(', ') } : { ok: true, why: 'hub -> Hearthvale -> Back pill -> hub' };
  } catch (e) { return { ok: false, why: 'hub round trip: ' + String(e.message).split('\n')[0] }; }
}

async function checkBack(page, cfg, phone) {
  if (cfg.backFn) return cfg.backFn(page, phone);
  if (!cfg.back) return null;
  const start = page.url();
  const docs = [];
  const h = (r) => { if (r.request().resourceType() === 'document') docs.push([r.status(), r.url()]); };
  page.on('response', h);
  try {
    await page.evaluate(() => window.scrollTo(0, 0)); // a reload restores the scroll position; the header links live at the top
    const sels = [].concat(cfg.back.sel);
    // first candidate that is visible AND not covered by another element (a full-screen sheet can hide the header links)
    const sel = await page.evaluate((list) => list.find((q) => { const e = document.querySelector(q); if (!e) return false; const r = e.getBoundingClientRect(); if (r.width <= 0 || r.height <= 0) return false; const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!t && (t === e || e.contains(t)); }), sels);
    if (!sel) return { ok: false, why: sels.join(' / ') + ' not visible or covered by another element' };
    if (phone) await page.tap(sel, { timeout: 8000 }); else await page.click(sel, { timeout: 8000 });
    await page.waitForURL((u) => u.toString() !== start, { timeout: 9000 });
    await page.waitForLoadState('domcontentloaded');
    const u = new URL(page.url());
    const hit = docs.find((d) => d[1].split('#')[0] === page.url().split('#')[0]);
    if (!cfg.back.expect.test(u.pathname)) return { ok: false, why: 'landed on ' + u.pathname };
    if (!hit || hit[0] !== 200) return { ok: false, why: 'status ' + (hit ? hit[0] : 'none') + ' for ' + u.pathname };
    return { ok: true, why: 'to ' + u.pathname };
  } catch (e) { return { ok: false, why: String(e.message).split('\n')[0] }; } finally { page.off('response', h); }
}

async function reload(page, cfg, phone) {
  await page.reload();
  await cfg.ready(page, phone).catch(() => {});
  await wait(500);
}
async function checkSave(page, cfg, phone) {
  const s = cfg.save; if (!s) return null;
  try {
    if (s.type === 'probe' || s.type === 'storeProbe') {
      const val = 'beta-' + Date.now();
      if (s.type === 'storeProbe') {
        // additive key inside the live save blob: must survive the page's own load/save cycle
        await page.evaluate(([k, v]) => { let o = {}; try { o = JSON.parse(localStorage.getItem(k) || '{}') || {}; } catch (e) { /* fresh */ } o.betaProbe = v; localStorage.setItem(k, JSON.stringify(o)); }, [s.key, val]);
        await reload(page, cfg, phone); await wait(1500);
        const got = await page.evaluate((k) => { try { return JSON.parse(localStorage.getItem(k)).betaProbe; } catch (e) { return null; } }, s.key);
        return got === val ? { ok: true, why: 'probe key in ' + s.key + ' survived reload + page save' } : { ok: false, why: 'probe lost (' + got + ')' };
      }
      await page.evaluate(([k, v]) => localStorage.setItem(k, v), ['pixeltown-beta-probe', val]);
      await reload(page, cfg, phone);
      const got = await page.evaluate(() => localStorage.getItem('pixeltown-beta-probe'));
      await page.evaluate(() => localStorage.removeItem('pixeltown-beta-probe'));
      return got === val ? { ok: true, why: 'localStorage probe' } : { ok: false, why: 'probe lost' };
    }
    if (s.type === 'lantern') {
      const before = await page.evaluate(() => window.__lantern ? 1 : 0);
      if (!(await page.locator('#heroes > li', { hasText: 'BetaHero' }).count())) { await page.fill('#new-name', 'BetaHero'); await tapSel(page, '#new-create', phone); await wait(600); }
      await reload(page, cfg, phone);
      const n = await page.locator('#heroes > li', { hasText: 'BetaHero' }).count();
      return n >= 1 ? { ok: true, why: 'hero created via the form survived reload' + (before ? '' : '') } : { ok: false, why: 'hero missing after reload' };
    }
    if (s.type === 'deepdelve') {
      // the ?test=1 hooks freeze physics, so the round trip uses a second load of the same seed (same IndexedDB)
      await page.goto(GAME('games/deepdelve/index.html?test=1&seed=5'));
      await page.waitForFunction(() => window.__dd && window.__dd.ready, null, { timeout: 40000 });
      const pos = await page.evaluate(async () => { const dd = window.__dd, sy = dd.surfaceY(40, 40); const y = sy + 5; const was = dd.getBlock(40, y, 40); dd.mineAt(40, y, 40); if (typeof dd.flush === 'function') await dd.flush(); return { y, was, now: dd.getBlock(40, y, 40) }; });
      await page.reload();
      await page.waitForFunction(() => window.__dd && window.__dd.ready, null, { timeout: 40000 });
      await page.evaluate(() => window.__dd.settle && window.__dd.settle());
      const now = await page.evaluate((y) => window.__dd.getBlock(40, y, 40), pos.y);
      return now === 0 ? { ok: true, why: 'mined block stayed mined after reload (IndexedDB)' } : { ok: false, why: `block ${pos.was}->${pos.now} before reload, ${now} after` };
    }
    if (s.type === 'bugs') {
      const before = await page.getAttribute('#btn-mute', 'aria-pressed');
      if (await page.isVisible('#btn-mute')) await tapSel(page, '#btn-mute', phone);
      const mid = await page.getAttribute('#btn-mute', 'aria-pressed');
      await reload(page, cfg, phone);
      const after = await page.getAttribute('#btn-mute', 'aria-pressed');
      await page.evaluate(() => localStorage.removeItem('mm-sfx-muted'));
      return mid !== before && after === mid ? { ok: true, why: 'mute choice survived reload' } : { ok: false, why: `${before}->${mid}->${after}` };
    }
  } catch (e) { return { ok: false, why: String(e.message).split('\n')[0] }; }
  return null;
}

// ---------- screenshots ----------
async function shot(page, slug, vp, kind) {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const file = path.join(SHOT_DIR, `${slug}-${vp.name}-${kind}.jpg`);
  let buf;
  for (const q of [60, 45, 32, 22, 14]) { buf = await page.screenshot({ type: 'jpeg', quality: q }); if (buf.length <= 80 * 1024) break; }
  fs.writeFileSync(file, buf);
  return `../tests/beta/screens/${slug}-${vp.name}-${kind}.jpg`;
}

// ---------- one page x viewport ----------
async function runOne(browser, cfg, vp) {
  const res = { page: cfg.name, slug: cfg.slug, url: cfg.url().replace(new URL(BASE).origin, ''), viewport: vp.name, phone: vp.phone, errors: [], failedReqs: [], screens: {}, tapOffenders: [], overlaps: [], clipped: [] };
  const opts = vp.phone ? { viewport: { width: vp.w, height: vp.h }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 } : { viewport: { width: vp.w, height: vp.h } };
  const ctx = await browser.newContext(opts);
  try {
    const page = await ctx.newPage();
    let live = true;
    page.on('pageerror', (e) => { if (live) res.errors.push('pageerror: ' + e.message); });
    page.on('console', (m) => { if (live && m.type() === 'error') res.errors.push('console: ' + m.text().slice(0, 300)); });
    page.on('response', (r) => { if (live && r.status() >= 400) res.failedReqs.push(r.status() + ' ' + r.url()); });
    page.on('requestfailed', (r) => {
      const t = (r.failure() && r.failure().errorText) || '';
      if (!live || /ERR_ABORTED/.test(t)) return;
      if (/cdn\.jsdelivr\.net\/npm\/three@/.test(r.url())) return; // three.js CDN may be blocked in the sandbox
      res.failedReqs.push('failed ' + r.url() + ' ' + t);
    });
    await page.addInitScript(INIT);
    if (fs.existsSync(THREE_LOCAL)) await page.route(THREE, (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(THREE_LOCAL) }));
    await page.goto(cfg.url(), { waitUntil: 'load', timeout: 40000 });
    if (cfg.join) {
      await page.fill('#name-input', 'ADMINbeta');
      await page.click('.species-tab'); await wait(150);
      await page.click('.avatar-choice');
      await page.click('#join-btn');
      await page.waitForSelector('#player-list-panel', { timeout: 25000 });
      await wait(1500);
    }
    await cfg.ready(page, vp.phone);
    if (cfg.afterStart) await cfg.afterStart(page, vp.phone);
    await wait(1200);
    res.screens.start = await shot(page, cfg.slug, vp, 'start');

    const mcfg = { hud: cfg.hud || [], ctrl: cfg.ctrl || [], clip: cfg.clip };
    const merged = { taps: new Map(), hud: [], ctrl: [], clipped: new Set(), scroll: null };
    const measure = async () => {
      const m = await page.evaluate(MEASURE, mcfg);
      for (const t of m.taps) if (!merged.taps.has(t.sel)) merged.taps.set(t.sel, t);
      for (const c of m.clipped) merged.clipped.add(c);
      for (const o of lib.findOverlaps(m.hud.map((h) => ({ ...h })), m.ctrl, 2).filter(Boolean)) res.overlaps.push(o);
      if (!merged.scroll || !lib.scrollOk(m.scroll)) merged.scroll = m.scroll;
    };
    await measure();

    const samples = [];
    const pull = async () => { try { const a = await page.evaluate(() => { const S = window.__betaFps; const t = S.t; S.t = []; return t; }); for (const x of a) samples.push(x); } catch (e) { /* page is navigating */ } };
    await page.evaluate(() => { const S = window.__betaFps; S.t = []; S.last = 0; S.on = true; });
    const t0 = Date.now(); let mid = false, i = 0; const startUrl = page.url();
    res.notes = [];
    while (Date.now() - t0 < PLAY_MS) {
      try { await cfg.play(page, vp.phone, i++); } catch (e) { if (page.url() === startUrl) { res.errors.push('harness: play step failed: ' + String(e.message).split('\n')[0]); } await wait(300); }
      if (page.url() !== startUrl) {
        // the page sent the player away (e.g. the solo arena exits to the town on death): note it and come back
        live = false; res.notes.push('player left the page at ' + Math.round((Date.now() - t0) / 1000) + 's (died / auto-exit); re-entered');
        await page.goto(cfg.url(), { waitUntil: 'load', timeout: 40000 });
        await cfg.ready(page, vp.phone); if (cfg.afterStart) await cfg.afterStart(page, vp.phone); await wait(800);
        live = true;
        await page.evaluate(() => { const S = window.__betaFps; S.t = []; S.last = 0; S.on = true; });
        continue;
      }
      await pull();
      if (!mid && Date.now() - t0 >= PLAY_MS / 2) {
        mid = true;
        await page.evaluate(() => { window.__betaFps.on = false; });
        res.screens.mid = await shot(page, cfg.slug, vp, 'mid'); await measure();
        await page.evaluate(() => { const S = window.__betaFps; S.t = []; S.last = 0; S.on = true; });
      }
    }
    await pull();
    await page.evaluate(() => { window.__betaFps.on = false; });
    const f = samples;
    if (f.length) {
      const sum = f.reduce((a, b) => a + b, 0);
      res.avgFps = Math.round(f.length / (sum / 1000) * 10) / 10;
      res.worstFrameMs = Math.round(Math.max(...f));
      res.longFrames = f.filter((x) => x > 50).length;
    }
    res.screens.end = await shot(page, cfg.slug, vp, 'end');
    await measure();
    res.scroll = merged.scroll;
    res.tapOffenders = lib.tapOffenders([...merged.taps.values()], 40);
    res.clipped = [...merged.clipped];
    // dedupe overlaps
    const seen = new Set(); res.overlaps = res.overlaps.filter((o) => { const k = o.hud + '|' + o.ctrl; if (seen.has(k)) return false; seen.add(k); return true; });

    res.save = await checkSave(page, cfg, vp.phone);
    // errors/requests during back navigation belong to the next page, not this one
    live = false;
    res.back = await checkBack(page, cfg, vp.phone);
  } catch (e) {
    res.loadError = String(e.message).split('\n')[0];
  } finally { await ctx.close().catch(() => {}); }
  return res;
}

// ---------- server ----------
function freePort() { return new Promise((resolve, reject) => { const s = net.createServer(); s.listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); }); s.on('error', reject); }); }
let server = null;
async function startServer() {
  if (BASE) return;
  const port = await freePort();
  server = spawn('python3', ['-m', 'http.server', String(port)], { cwd: REPO, stdio: 'ignore' });
  BASE = `http://localhost:${port}/game/index.html`;
  for (let i = 0; i < 60; i++) { try { const r = await fetch(BASE); if (r.ok) return; } catch (e) { /* not up yet */ } await wait(150); }
  throw new Error('static server did not start');
}

(async () => {
  await startServer();
  const all = PAGES.concat(discoverExtra());
  const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
  const vps = process.env.VP ? VIEWPORTS.filter((v) => process.env.VP.split(',').includes(v.key)) : VIEWPORTS;
  let prev = [];
  if (only || process.env.VP) { try { prev = JSON.parse(fs.readFileSync(RESULTS, 'utf8')); } catch (e) { prev = []; } }
  const todo = all.filter((p) => !only || only.includes(p.slug));
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const fresh = [];
  const t0 = Date.now();
  for (const cfg of todo) for (const vp of vps) {
    const r = await runOne(browser, cfg, vp);
    fresh.push(r);
    const v = lib.judge(r);
    console.log(`${v.pass ? 'PASS' : 'FAIL'} ${cfg.slug} ${vp.name} fps=${r.avgFps} worst=${r.worstFrameMs}ms long=${r.longFrames} errs=${r.errors.length} reqs=${r.failedReqs.length}${v.fails.length ? ' :: ' + v.fails.join('; ') : ''}${v.warns.length ? ' (warn: ' + v.warns.join('; ') + ')' : ''}  [${Math.round((Date.now() - t0) / 1000)}s]`);
  }
  await browser.close();
  if (server) server.kill();
  // merge with previous results (partial runs), keep page order from `all`
  const key = (r) => r.slug + '|' + r.viewport;
  const map = new Map(prev.map((r) => [key(r), r]));
  for (const r of fresh) map.set(key(r), r);
  const order = all.map((p) => p.slug), vorder = VIEWPORTS.map((v) => v.name);
  const results = [...map.values()].filter((r) => order.includes(r.slug)).sort((a, b) => order.indexOf(a.slug) - order.indexOf(b.slug) || vorder.indexOf(a.viewport) - vorder.indexOf(b.viewport));
  fs.writeFileSync(RESULTS, JSON.stringify(results));
  let commit = 'unknown';
  try { commit = execSync('git rev-parse --short HEAD', { cwd: REPO }).toString().trim(); } catch (e) { /* not a git checkout */ }
  const json = lib.writeReport(results, { commit }, DESIGN);
  console.log(json.green ? 'BETA GREEN' : 'BETA RED');
  process.exit(json.green ? 0 : 1);
})().catch((e) => { console.error(e); if (server) server.kill(); process.exit(1); });
