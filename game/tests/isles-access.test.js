// PI2 (design/NEXT-SLICES-4.md): Hearthvale Isles phone perf + access (games/isles/*), offline, phone 390x844 (touch, dpr 3) + desktop.
//  1 tags + default tier: the page loads mm-access.js, mm-side-access.js and mm-perf.js; with no prefs it is the high tier (canvas tagged
//    high, dpr 2), and one seeded frame is pixel-identical to the page with those three modules stubbed out (the pre-PI2 path), with the
//    same canvas draw-call count.
//  2 low tier (lowGfx in pixeltown-access-v1): dpr 1, at most 12 glint sparks a frame, no ground shadows, still terrain decor (two times,
//    one frame), the fog reveal at 10 Hz and fewer draw calls; gameplay caps unchanged.
//  3 --ui-scale 1.5 (hudScale): it reaches the HUD, the panels and the ability button; at 390x844 and on desktop every visible button is
//    on screen, >= 44 px and overlaps no other, and HUD / panel text is >= 12 px x 1.5.
//  4 one-thumb mode (the Realm's per-device switch: mm-auto-fire + mm-aim-toggle): shots go to the nearest foe with stick-only input (a
//    walk-up kill with a drop, a soothe knockout for a tame), the ability button sits by the stick on the phone (in the action column on
//    desktop), the Log panel toggle flips it and writes only those two keys; off, nothing fires by itself.
//  5 shape icons: the HP heart, the warmth flame (tundra) and the air bubble (mars) change SHAPE per state (ok / low / empty), not colour alone.
//  6 reduced motion (flashes:false): data-reduce-motion on <html>, still terrain decor, no hero blink while hurt, no CSS transitions.
// Every page: 0 DB requests or sockets (blockDb), no off-origin requests, no console errors. Nothing is written but localStorage.
// Run: python3 -m http.server 8440 &   BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/isles-access.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/isles/index.html?test=1&seed=123';
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 };
const DESK = { viewport: { width: 1280, height: 800 } };
const ACCESS = 'pixeltown-access-v1';
const PROFILE = { v: 1, heroes: [{ id: 'h1', name: 'Fern', cls: 'druid', level: 7, xp: 10, items: [] }], stash: [], fame: 0, mode: 'classic', hall: [] };
const STABLE = { v: 1, n: 1, roster: [{ id: 't1', sp: 'tusktop', nm: 'Tuskie', lv: 3, xp: 0, bond: 2, aff: 0, cos: '', isle: 'jungle', d: '2026-11-01' }], party: [], mount: 't1' };
const BASE_SEED = { 'pixeltown-mm-v1': JSON.stringify(PROFILE), 'pixeltown-mm-active-v1': JSON.stringify({ v: 1, heroId: 'h1' }) };
const OT = { 'mm-auto-fire': '1', 'mm-aim-toggle': '1' };
const all = [];

async function open(browser, opts, seed, o) {
  o = o || {};
  const ctx = await browser.newContext(opts);
  const db = await blockDb(ctx);
  if (o.old) await ctx.route(/\/shared\/mm-(perf|side-access|access)\.js/, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: '/* removed by isles-access.test.js */' }));
  await ctx.addInitScript((s) => {
    if (!sessionStorage.seeded) { sessionStorage.seeded = '1'; localStorage.clear(); Object.keys(s).forEach((k) => localStorage.setItem(k, s[k])); }
    let r = 0x1234abcd; Math.random = () => { r = (r + 0x6d2b79f5) | 0; let t = Math.imul(r ^ (r >>> 15), 1 | r); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const P = CanvasRenderingContext2D.prototype, n = { calls: 0 };
    window.__draw = n;
    ['fillRect', 'strokeRect', 'fill', 'stroke', 'fillText', 'drawImage', 'arc', 'ellipse'].forEach((k) => {
      const f = P[k];
      P[k] = function () { if (this.canvas && this.canvas.id === 'view') n.calls++; return f.apply(this, arguments); };
    });
  }, Object.assign({}, BASE_SEED, seed || {}));
  const page = await ctx.newPage();
  const rec = { errors: [], off: [], sockets: [] };
  page.on('pageerror', (e) => rec.errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') rec.errors.push('console: ' + m.text()); });
  page.on('request', (r) => { if (!r.url().startsWith(ORIGIN) && !/^(data|blob):/.test(r.url())) rec.off.push(r.url()); });
  page.on('websocket', (ws) => rec.sockets.push(ws.url()));
  await page.goto(PAGE + (o.q || ''));
  await page.waitForFunction(() => window.__isles && window.__isles.world, null, { timeout: 20000 });
  await page.waitForLoadState('networkidle');
  const t = { ctx, page, db, rec, label: o.label || '?' }; all.push(t); return t;
}
const ev = (t, fn, arg) => t.page.evaluate(fn, arg);
const prefs = (p) => ({ [ACCESS]: JSON.stringify(Object.assign({ v: 1 }, p)) });

// a seeded scene by a cluster of glints: no creatures, the hero two tiles from the best node, the loop paused
const SCENE = () => {
  const I = window.__isles; I.pause(true); I.god(true); I.clearCreatures();
  const ns = I.nodes().filter((n) => n.ready);
  let best = null, bn = -1;
  ns.forEach((n) => { const k = ns.filter((m) => Math.abs(m.x - n.x) <= 5 && Math.abs(m.y - n.y) <= 11).length; if (k > bn) { bn = k; best = n; } });
  if (best) I.teleport(best.x + 2, best.y); else { const r = I.findTile(null, 6); I.teleport(r.x + 3, r.y); }
  I.step(0, 0, 1 / 60);
  return { inView: bn, at: best };
};
// two frames 1/3 s apart at one sim time on every page (the hero's walk frame has the same parity), with the draw-call count
const FRAMES = () => {
  const I = window.__isles, cv = document.getElementById('view');
  I.setTime(10); for (let i = 0; i < 60; i++) I.render(); // the chunk bakes finish (two a frame)
  const c0 = window.__draw.calls; I.render(); const calls = window.__draw.calls - c0; const a = cv.toDataURL(); const g1 = I.gfx ? I.gfx() : null;
  I.step(0, 0, 1 / 3); I.render(); I.render(); const b = cv.toDataURL();
  return { a, b, same: a === b, calls, gfx: g1, w: cv.width, iw: window.innerWidth, tier: cv.getAttribute('data-mm-tier') };
};
// every visible button: on screen, >= 44 px, no overlaps (pairwise); text sizes of the visible HUD / action / touch / panel text
const LAYOUT = () => {
  const vis = (e) => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 2 && r.height > 2 && s.visibility !== 'hidden' && s.display !== 'none'; }; // (> 2 px: the nav's visually hidden legacy link is skipped)
  const panelOpen = !document.getElementById('panel').hidden;
  const bs = Array.from(document.querySelectorAll('button, a.btn, a.mm-nav-btn')).filter(vis).filter((b) => !panelOpen || !b.closest('#panel') || b.id === 'panel-close');
  const W = innerWidth, H = innerHeight;
  const rs = bs.map((b) => { const r = b.getBoundingClientRect(); return { id: b.id || b.className || b.textContent.slice(0, 12), l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, inPanel: !!b.closest('#panel') }; });
  const off = rs.filter((r) => r.l < 0 || r.t < 0 || r.r > W + 0.5 || r.b > H + 0.5);
  const small = rs.filter((r) => r.w < 44 - 0.5 || r.h < 44 - 0.5);
  const over = [];
  for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
    const a = rs[i], b = rs[j];
    if (panelOpen && a.inPanel !== b.inPanel) continue; // the modal panel sits over the paused HUD
    if (Math.min(a.r, b.r) - Math.max(a.l, b.l) > 0.5 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 0.5) over.push(a.id + ' x ' + b.id);
  }
  const txt = Array.from(document.querySelectorAll('#hud *, #acts *, #touch *, #hint, #panel *')).filter((e) => !e.closest('#log-feedback')).filter(vis) // the shared feedback widget keeps its own sizes.filter((e) => Array.from(e.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim()))
    .map((e) => ({ id: e.id || e.className || e.tagName, px: parseFloat(getComputedStyle(e).fontSize) }));
  const minTxt = txt.reduce((m, x) => Math.min(m, x.px), 99);
  return { n: rs.length, off, small, over, minTxt, tiny: txt.filter((x) => x.px < 18 - 0.01).slice(0, 6), hscroll: document.documentElement.scrollWidth > document.documentElement.clientWidth };
};
const fsz = (sel) => parseFloat(getComputedStyle(document.querySelector(sel)).fontSize);

(async () => {
  const browser = await chromium.launch();

  // ===== 1 tags + default tier (pixel-identical to the pre-PI2 path) =====
  const def = await open(browser, PHONE, null, { label: 'phone default' });
  const old = await open(browser, PHONE, null, { label: 'phone no-PI2-modules', old: true });
  const tags = await ev(def, () => ['mm-access.js', 'mm-side-access.js', 'mm-perf.js'].map((f) => !!document.querySelector('script[src$="/shared/' + f + '"]')).concat([!!window.MMSideAccess, !!window.MMPerf]));
  check('1 tags: the isles page loads mm-access.js, mm-side-access.js and mm-perf.js (globals present)', tags.every(Boolean), JSON.stringify(tags));
  const sDef = await ev(def, SCENE), sOld = await ev(old, SCENE);
  const fDef = await ev(def, FRAMES), fOld = await ev(old, FRAMES);
  check('1 default: no prefs is the high tier (canvas tagged high, dpr 2 on a dpr-3 phone, shadows on, uncapped sparks, 15 Hz / 10 Hz off)',
    fDef.gfx.tier === 'high' && fDef.tier === 'high' && fDef.gfx.dpr === 2 && fDef.w === 780 && fDef.gfx.shadows && fDef.gfx.sparks === null && fDef.gfx.aiHz === 0 && fDef.gfx.fogHz === 0 && fDef.gfx.terrainAnim, JSON.stringify(Object.assign({}, fDef, { a: 0, b: 0 })));
  check('1 default: one seeded frame is pixel-identical to the page without the PI2 modules, with the same draw-call count', fDef.a === fOld.a && fDef.calls === fOld.calls && fOld.gfx.tier === 'high' && fOld.w === 780, JSON.stringify([fDef.calls, fOld.calls, sDef, sOld]));
  check('1 default: the glints twinkle (two times give different frames)', !fDef.same && sDef.inView > 0, JSON.stringify(sDef));
  check('1 default: html carries --ui-scale 1 and no reduce-motion flag', await ev(def, () => document.documentElement.style.getPropertyValue('--ui-scale') === '1' && !document.documentElement.hasAttribute('data-reduce-motion')));

  // ===== 2 low tier =====
  const low = await open(browser, PHONE, prefs({ lowGfx: true }), { label: 'phone lowGfx' });
  const sLow = await ev(low, SCENE);
  const fLow = await ev(low, FRAMES);
  check('2 low: lowGfx forces the low tier (canvas tagged low, dpr 1: a 390 px backing store on a dpr-3 phone)', fLow.gfx.tier === 'low' && fLow.tier === 'low' && fLow.gfx.dpr === 1 && fLow.w === 390, JSON.stringify(fLow.gfx));
  check(`2 low: at most 12 glint sparks a frame (${fLow.gfx.sparksDrawn} drawn with ${sLow.inView} glints near the hero)`, fLow.gfx.sparks === 12 && fLow.gfx.sparksDrawn >= 1 && fLow.gfx.sparksDrawn <= 12 && (sLow.inView <= 12 || fLow.gfx.sparksDrawn === 12), JSON.stringify([fLow.gfx, sLow]));
  check('2 low: terrain decor is still (two times give one identical frame)', fLow.same && fLow.gfx.terrainAnim === false && fLow.gfx.still === true);
  check(`2 low: fewer canvas draw calls than the default tier (${fLow.calls} vs ${fDef.calls}; no ground shadows)`, fLow.calls < fDef.calls && fLow.gfx.shadows === false, JSON.stringify([fLow.calls, fDef.calls]));
  const fog = await ev(low, () => { const I = window.__isles, a = I.gfx().fogCalls; for (let i = 0; i < 60; i++) I.step(0.5, 0, 1 / 60); return { n: I.gfx().fogCalls - a, hz: I.gfx().fogHz, ai: I.gfx().aiHz, cap: I.gfx().cap }; });
  const fogD = await ev(def, () => { const I = window.__isles, a = I.gfx().fogCalls; for (let i = 0; i < 60; i++) I.step(0.5, 0, 1 / 60); return I.gfx().fogCalls - a; });
  check(`2 low: the fog reveal runs at 10 Hz (${fog.n} calls in 1 s; default ${fogD}), companion AI at 15 Hz, the creature cap unchanged (24)`, fog.n >= 9 && fog.n <= 11 && fogD === 60 && fog.ai === 15 && fog.hz === 10 && fog.cap === 24, JSON.stringify([fog, fogD]));

  // ===== 3 --ui-scale 1.5 (phone + desktop, riding so the ability button shows; one-thumb on) =====
  const SEED_BIG = Object.assign({ 'pixeltown-tames-v1': JSON.stringify(STABLE) }, prefs({ hudScale: 1.5 }), OT);
  const big = await open(browser, PHONE, SEED_BIG, { label: 'phone scale 1.5' });
  const desk = await open(browser, DESK, SEED_BIG, { label: 'desktop scale 1.5' });
  const one = await open(browser, PHONE, Object.assign({ 'pixeltown-tames-v1': JSON.stringify(STABLE) }), { label: 'phone scale 1' });
  const mountUp = () => { const I = window.__isles; I.pause(true); I.god(true); I.clearCreatures(); const r = I.findTile(null, 10); I.teleport(r.x + 4, r.y); I.ride(); I.step(0, 0, 0.05); I.env(); return { riding: !!I.riding(), ab: I.ability().id }; };
  for (const t of [big, desk, one]) { const m = await ev(t, mountUp); check(`3 ${t.label}: riding the Tusktop shows the ability button`, m.riding && !!m.ab && await ev(t, () => !document.getElementById('btn-ability').hidden), JSON.stringify(m)); }
  const sz = await ev(big, () => ({ v: document.documentElement.style.getPropertyValue('--ui-scale'), info: parseFloat(getComputedStyle(document.getElementById('hud-info')).fontSize), hp: parseFloat(getComputedStyle(document.getElementById('hp-text')).fontSize),
    log: parseFloat(getComputedStyle(document.getElementById('btn-log')).fontSize), ring: document.querySelector('#btn-ability .ring').getBoundingClientRect().width, abil: parseFloat(getComputedStyle(document.querySelector('#btn-ability .txt')).fontSize) }));
  const sz1 = await ev(one, () => ({ info: parseFloat(getComputedStyle(document.getElementById('hud-info')).fontSize), log: parseFloat(getComputedStyle(document.getElementById('btn-log')).fontSize), ring: document.querySelector('#btn-ability .ring').getBoundingClientRect().width }));
  check('3 scale: --ui-scale 1.5 reaches the HUD (info 18 px, HP 18 px, Log 19.5 px); scale 1 keeps 12 / 13 px', sz.v === '1.5' && sz.info === 18 && sz.hp === 18 && sz.log === 19.5 && sz1.info === 12 && sz1.log === 13, JSON.stringify([sz, sz1]));
  check('3 scale: the ability button scales (ring 33 px vs 22 px, label 21 px)', Math.abs(sz.ring - 33) < 0.6 && Math.abs(sz1.ring - 22) < 0.6 && sz.abil === 21, JSON.stringify([sz, sz1]));
  for (const t of [big, desk]) {
    const L = await ev(t, LAYOUT);
    // 8B: Log / Craft / Home dock moved into the Pack panel (one HUD button), so the HUD shows fewer buttons; the Pack must be one of them
    check(`3 ${t.label}: the Pack button is shown and scales (>= 44 px)`, await ev(t, () => { const r = document.getElementById('btn-pack').getBoundingClientRect(); return r.width >= 44 && r.height >= 44 && parseFloat(getComputedStyle(document.getElementById('btn-pack')).fontSize) >= 18; }));
    check(`3 ${t.label}: every visible button (${L.n}) is on screen, >= 44 px, and overlaps no other`, L.n >= 4 && !L.off.length && !L.small.length && !L.over.length && !L.hscroll, JSON.stringify(L));
    check(`3 ${t.label}: HUD / action text is >= 12 px x 1.5 (smallest ${L.minTxt} px)`, L.minTxt >= 18 - 0.01, JSON.stringify(L.tiny));
    await ev(t, () => { window.__isles.openPanel('log'); return true; });
    const P = await ev(t, LAYOUT);
    const ph = await ev(t, () => ({ h2: parseFloat(getComputedStyle(document.getElementById('panel-title')).fontSize), h3: parseFloat(getComputedStyle(document.querySelector('#panel h3')).fontSize), r: document.getElementById('panel').getBoundingClientRect().toJSON() }));
    check(`3 ${t.label}: the Log panel scales (title 24 px, headings 19.5 px), sits on screen, text >= 18 px, Close on screen`, ph.h2 === 24 && ph.h3 === 19.5 && ph.r.left >= 0 && ph.r.right <= (t === desk ? 1280 : 390) && ph.r.top >= 0 && !P.off.length && !P.over.length && P.minTxt >= 18 - 0.01, JSON.stringify([ph, P]));
    await ev(t, () => { window.__isles.closePanel(); window.__isles.pause(true); return true; });
  }

  // ===== 4 one-thumb mode =====
  const lay = await ev(big, () => { const a = document.getElementById('btn-ability').getBoundingClientRect(), s = document.getElementById('stick').getBoundingClientRect(), f = document.getElementById('btn-fire').getBoundingClientRect(); return { parent: window.__isles.access().abilityBy, a: a.toJSON(), s: s.toJSON(), f: f.toJSON(), on: window.__isles.access().oneThumb }; });
  check('4 phone: one-thumb mode is on from the per-device switch, and the ability button sits right above the move stick (same thumb), clear of Fire',
    lay.on && lay.parent === 'touch' && lay.a.bottom <= lay.s.top + 0.5 && lay.s.top - lay.a.bottom <= 24 && lay.a.left < lay.s.right && lay.a.right > lay.s.left && lay.a.right < lay.f.left, JSON.stringify(lay));
  const dl = await ev(desk, () => window.__isles.access());
  check('4 desktop: one-thumb mode is on and the ability button stays in the action column', dl.oneThumb && dl.abilityBy === 'acts', JSON.stringify(dl));
  // auto-attack with stick-only input: walk toward a hostile creature 6 tiles away; never I.fire
  const HUNT = () => {
    const I = window.__isles; I.pause(true); I.god(true); I.clearCreatures(); if (I.riding()) I.ride();
    const r = I.findTile(null, 12); I.teleport(r.x, r.y); I.step(0, 0, 0.05);
    const h = I.hero(); let id = null, sp = '';
    for (const s of I.packSpecies) { const u = I.spawn(s, h.tx + 6, h.ty); if (!u) continue; const c = I.creatures().find((x) => x.uid === u); if (c && c.hostile && c.size !== 'XL') { id = u; sp = s; break; } I.clearCreatures(); }
    const k0 = I.stats().kills, d0 = I.drops ? I.drops().length : 0, s0 = I.access().autoN;
    let t = 0; for (; t < 30 && I.creatures().some((c) => c.uid === id); t += 0.05) { const c = I.creatures().find((x) => x.uid === id), hh = I.hero(); const dx = c.x - hh.x; I.step(Math.abs(dx) > 96 ? Math.sign(dx) : 0, 0, 0.05); }
    return { sp, id, shots: I.access().autoN - s0, kills: I.stats().kills - k0, drops: (I.drops ? I.drops().length : 0) - d0, t: Math.round(t * 10) / 10, loot: I.stats().loot };
  };
  const hunt = await ev(big, HUNT);
  check(`4 one-thumb: stick-only input kills a hostile ${hunt.sp} by auto-attack (${hunt.shots} auto shots, ${hunt.t} s)`, !!hunt.id && hunt.shots > 0 && hunt.kills === 1, JSON.stringify(hunt));
  check('4 one-thumb: the auto-attack kill gives the normal drop', hunt.drops > 0 || Object.keys(hunt.loot).length > 0, JSON.stringify(hunt));
  const huntOff = await ev(def, HUNT);
  check('4 off: without one-thumb mode nothing fires by itself (0 auto shots, no kill)', !!huntOff.id && huntOff.shots === 0 && huntOff.kills === 0, JSON.stringify(huntOff));
  const sooth = await ev(big, () => {
    const I = window.__isles; I.pause(true); I.god(true); I.clearCreatures();
    const h = I.hero(); let id = null;
    for (const s of I.packSpecies) { const u = I.spawn(s, h.tx + 4, h.ty); if (!u) continue; const c = I.creatures().find((x) => x.uid === u); if (c && !c.hostile && c.st && c.torporMax > 1) { id = u; break; } I.clearCreatures(); }
    I.soothe(true); const s0 = I.access().autoN;
    for (let i = 0; i < 40; i++) I.step(0, 0, 0.05);
    const c = I.creatures().find((x) => x.uid === id); I.soothe(false);
    return { id, shots: I.access().autoN - s0, torpor: c ? c.torpor : -1, ko: c ? c.ko : null, sp: c ? c.kind : '' };
  });
  check(`4 one-thumb + soothe: auto shots build torpor on a calm, knock-out tameable ${sooth.sp} (for a tame)`, !!sooth.id && sooth.shots > 0 && (sooth.torpor > 0 || sooth.ko), JSON.stringify(sooth));
  await ev(big, () => { window.__isles.openPanel('log'); return true; });
  await big.page.click('#log-onethumb');
  const offSt = await ev(big, () => ({ p: document.getElementById('log-onethumb').getAttribute('aria-pressed'), t: document.getElementById('log-onethumb').textContent, k: [localStorage.getItem('mm-auto-fire'), localStorage.getItem('mm-aim-toggle')], a: window.__isles.access() }));
  await big.page.click('#log-onethumb');
  const onSt = await ev(big, () => ({ p: document.getElementById('log-onethumb').getAttribute('aria-pressed'), k: [localStorage.getItem('mm-auto-fire'), localStorage.getItem('mm-aim-toggle')], a: window.__isles.access(), b: document.getElementById('log-onethumb').getBoundingClientRect().height }));
  check('4 toggle: the Log panel switch turns one-thumb off (aria-pressed, both per-device keys 0, the ability button back in the column) and on again',
    offSt.p === 'false' && /off/.test(offSt.t) && offSt.k.join() === '0,0' && !offSt.a.oneThumb && offSt.a.abilityBy === 'acts' && onSt.p === 'true' && onSt.k.join() === '1,1' && onSt.a.oneThumb && onSt.a.abilityBy === 'touch' && onSt.b >= 44, JSON.stringify([offSt, onSt]));
  await ev(big, () => { window.__isles.closePanel(); return true; });

  // ===== 5 shape icons =====
  const hpShape = await ev(def, () => {
    const I = window.__isles, el = document.querySelector('#hp-bar .shp-hp'), bar = document.getElementById('hp-bar');
    const read = () => { I.env(); const s = getComputedStyle(el); return { st: bar.dataset.state, cp: s.clipPath, bd: s.borderTopWidth, bg: s.backgroundColor, txt: document.getElementById('hp-text').textContent }; };
    I.god(false); I.heal(); const ok = read();
    const max = I.hero().maxHp; I.hurt(Math.ceil(max * 0.75)); const lowS = read();
    I.hurt(max * 2); const empty = read(); I.heal(); I.god(true); I.env();
    return { ok, low: lowS, empty, visible: el.getBoundingClientRect().width > 0, hidden: el.getAttribute('aria-hidden') };
  });
  check('5 HP: a heart shape sits in the HP bar (aria-hidden; the numbers stay as text)', hpShape.visible && hpShape.hidden === 'true' && /\d+ \/ \d+/.test(hpShape.ok.txt), JSON.stringify(hpShape));
  check('5 HP: ok / low / empty are three different shapes (not colour alone)', hpShape.ok.st === 'ok' && hpShape.low.st === 'low' && hpShape.empty.st === 'empty' &&
    hpShape.ok.cp !== hpShape.low.cp && (hpShape.empty.cp !== hpShape.ok.cp || hpShape.empty.bd !== hpShape.ok.bd) && hpShape.empty.bd !== hpShape.low.bd, JSON.stringify(hpShape));
  const tun = await open(browser, PHONE, null, { label: 'phone tundra', q: '&isle=tundra' });
  const mars = await open(browser, PHONE, null, { label: 'phone mars', q: '&isle=mars&launch=0' });
  const ENVSH = (kind) => {
    const I = window.__isles; I.pause(true); I.god(true); I.clearCreatures();
    const ex = I.findEnvTile(false); I.teleport(ex.x, ex.y);
    const el = document.querySelector(kind === 'warm' ? '#env-warm' : '#env-o2'), sh = el.querySelector('.shp');
    const at = (t) => { if (kind === 'warm') I.envSet(t, 0); else I.envSet(0, t); I.step(0, 0, 0.3); I.env(); const s = getComputedStyle(sh); return { cls: el.className, cp: s.clipPath, bg: s.backgroundImage + '|' + s.backgroundColor, bd: s.borderTopWidth + s.borderTopStyle, val: el.querySelector('.val').textContent, w: sh.getBoundingClientRect().width }; };
    return { ok: at(0), warn: at(84), empty: at(95) };
  };
  const wsh = await ev(tun, ENVSH, 'warm');
  check('5 warmth: a flame triangle on the tundra; warn = a low flame, empty = a snowflake cross (three shapes) with the text value kept',
    wsh.ok.w > 0 && /warn/.test(wsh.warn.cls) && /empty/.test(wsh.empty.cls) && new Set([wsh.ok.cp, wsh.warn.cp, wsh.empty.cp]).size === 3 && wsh.ok.val && wsh.empty.val, JSON.stringify(wsh));
  const osh = await ev(mars, ENVSH, 'o2');
  check('5 air: a ring on mars; warn fills it, empty hollows it with a bar (three looks by shape) with the text value kept',
    osh.ok.w > 0 && /warn/.test(osh.warn.cls) && /empty/.test(osh.empty.cls) && new Set([osh.ok.bg, osh.warn.bg, osh.empty.bg]).size === 3 && osh.ok.val && osh.empty.val, JSON.stringify(osh));
  check('5 breath: the dive breath meter carries the bubble shape too', await ev(mars, () => !!document.querySelector('#abil-breath .shp.shp-o2')));

  // ===== 6 reduced motion =====
  const rm = await open(browser, PHONE, prefs({ flashes: false }), { label: 'phone reduced motion' });
  await ev(rm, SCENE);
  const fRm = await ev(rm, FRAMES);
  const rmA = await ev(rm, () => ({ attr: document.documentElement.getAttribute('data-reduce-motion'), reduced: window.__isles.access().reduced, toast: getComputedStyle(document.getElementById('toast')).transitionDuration, tier: window.__isles.gfx().tier }));
  const toastD = await ev(def, () => getComputedStyle(document.getElementById('toast')).transitionDuration);
  check('6 reduced: flashes:false sets data-reduce-motion on <html> and the page reads it (graphics tier stays high)', rmA.attr === '1' && rmA.reduced === true && rmA.tier === 'high', JSON.stringify(rmA));
  check('6 reduced: terrain decor is still (two times give one identical frame)', fRm.same, '');
  check('6 reduced: no CSS transitions (the toast fade is 0 s; 0.2 s by default)', rmA.toast === '0s' && toastD === '0.2s', JSON.stringify([rmA.toast, toastD]));
  const BLINK = () => {
    const I = window.__isles; I.god(false); I.heal(); I.hurt(1); const n = new Set();
    for (let i = 0; i < 12; i++) { const c0 = window.__draw.calls; I.render(); n.add(window.__draw.calls - c0); I.step(0, 0, 1 / 60); }
    I.heal(); I.god(true); return Array.from(n);
  };
  const bRm = await ev(rm, BLINK), bDef = await ev(def, BLINK);
  check('6 reduced: no hero blink while hurt (the hero is drawn on every frame; the default blinks)', bRm.length === 1 && bDef.length >= 2, JSON.stringify([bRm, bDef]));

  // ===== clean =====
  for (const t of all) {
    check(`${t.label}: 0 database requests, 0 sockets, no off-origin requests`, t.db.attempts() === 0 && t.rec.sockets.length === 0 && t.rec.off.length === 0, JSON.stringify([t.db.http, t.db.ws, t.rec.sockets, t.rec.off]));
    check(`${t.label}: no console errors`, t.rec.errors.length === 0, t.rec.errors.slice(0, 3).join(' | '));
  }
  await browser.close();
  done();
})();
