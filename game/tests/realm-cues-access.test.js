// NEXT-SLICES SF1 / TG3 / AC1 leftovers in realm.js: the arena plays the existing MMSfx cues `bag_rare` (a Rare+ bag appears), `warn`
// (a telegraph wind-up starts) and `boss_awaken` (boss spawn and phase change) through its one audio helper (_snd), and never while the
// Sound setting is muted; the `bulletOutline` access pref (pixeltown-access-v1) changes how enemy bullets are drawn on the normal palette too
// (no dark rim when off), baked once per pref change with no per-frame canvas churn. A spy replaces arena.sfx. Offline: blockDb, no chat.
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/realm-cues-access.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&offline=1&seed=12345';
const ACC = 'pixeltown-access-v1';

async function open(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  const db = await blockDb(ctx);
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' }));
  await ctx.route('**/hub/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>hub</title>hub' }));
  await ctx.routeWebSocket(/.*/, (ws) => ws.close()); // never reach the live DB
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('mm-aim-assist', '0'); });
  await page.goto(WORLD);
  await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 15000 });
  await page.evaluate(() => { // the audio spy: every cue the arena asks for, plus a mute switch like MMSfx's
    const a = window.__mm.arena; window.__cues = []; window.__muted = false;
    a.sfx = { play(n) { window.__cues.push(n); return true; }, isMuted: () => window.__muted, setMusic() {}, musicOn: false, ambience() { return false; }, stopAmbience() {}, ambienceOn: () => false };
  });
  return { ctx, page, errors, db };
}

(async () => {
  const browser = await chromium.launch();
  const errs = [];
  const A = await open(browser); const page = A.page;

  // ---- audio cues through the helper ----
  const cu = await page.evaluate(() => {
    const a = window.__mm.arena; const take = () => { const c = window.__cues.slice(); window.__cues.length = 0; return c; };
    a.enemies.forEach((e) => { e.active = false; }); take();
    const p = a.player;
    a.dropBag(p.x + 40, p.y, 0); a.dropBag(p.x - 40, p.y, 1); const low = take();
    a.dropBag(p.x + 60, p.y, 2); const rare = take();
    a.dropBag(p.x + 80, p.y, 3); const epic = take();
    const e = a.spawnEnemy('aimed', p.x + 300, p.y); const tg = a.tgFor(e, 'ring', 1); const warn = take();
    a.clock += 1; e._tg = 0; a.tgFor(e, 'line', 1); const warn2 = take();
    const b = a.spawnEnemy('boss', p.x, p.y - 260); const spawn = take();
    b.invuln = 0; a._bossPhase(b, 2); const phase = take();
    window.__muted = true; a.dropBag(p.x, p.y + 60, 2); a._bossPhase(b, 3); a.clock += 1; e._tg = 0; a.tgFor(e, 'ring', 1); const muted = take(); window.__muted = false;
    a.enemies.forEach((q) => { q.active = false; }); a.bags.forEach((q) => { q.active = false; });
    return { low, rare, epic, tg, warn, warn2, spawn, phase, muted };
  });
  check('bag_rare plays when a Rare or Epic bag appears, never for Common / Uncommon bags', cu.low.indexOf('bag_rare') < 0 && cu.rare.indexOf('bag_rare') >= 0 && cu.epic.indexOf('bag_rare') >= 0, JSON.stringify(cu));
  check('warn plays when a telegraph wind-up starts (and again for the next one)', cu.tg === true && cu.warn.indexOf('warn') >= 0 && cu.warn2.indexOf('warn') >= 0, JSON.stringify(cu));
  check('boss_awaken plays on a boss spawn and on its phase change', cu.spawn.indexOf('boss_awaken') >= 0 && cu.phase.indexOf('boss_awaken') >= 0, JSON.stringify(cu));
  check('with the Sound setting muted none of the cues reach the audio helper', cu.muted.length === 0, JSON.stringify(cu.muted));

  // ---- the real MMSfx honours mute too (pixeltown-sfx mute key), and the arena keeps the realm-audio-v1 ambience off by default ----
  const real = await page.evaluate(() => {
    if (typeof MMSfx === 'undefined') return { skip: true };
    let made = 0; const P = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, setTargetAtTime() {} });
    const ctx = { destination: {}, sampleRate: 8000, state: 'running', currentTime: 1, resume() {}, createGain: () => ({ gain: P(), connect() {} }), createOscillator: () => ({ frequency: P(), connect() {}, start() { made++; }, stop() {} }), createBuffer: (c, n) => ({ getChannelData: () => new Float32Array(n) }), createBufferSource: () => ({ connect() {}, start() {}, stop() {} }), createBiquadFilter: () => ({ frequency: P(), connect() {} }) };
    const mem = {}; const f = MMSfx.create({ storage: { getItem: (k) => mem[k] || null, setItem: (k, v) => { mem[k] = v; } }, ctxFactory: () => ctx });
    const a = window.__mm.arena; const keep = a.sfx; a.sfx = f;
    a._snd('boss_awaken'); const on = made; f.setMuted(true); a._snd('bag_rare'); a._snd('warn'); const off = made - on;
    a.sfx = keep;
    return { on, off, amb: window.RealmAudio ? window.RealmAudio.isOn() : false };
  });
  check('through the real MMSfx: boss_awaken makes sound, nothing plays once muted; ambience stays off by default', real.skip || (real.on > 0 && real.off === 0 && real.amb === false), JSON.stringify(real));

  // ---- bulletOutline on the normal palette: the draw style changes, baked once ----
  const ol = await page.evaluate((k) => {
    const a = window.__mm.arena;
    a.enemies.forEach((q) => { q.active = false; }); a.eBullets.forEach((b) => { b.active = false; }); a.shake = 0; a.flash = 0;
    const c = a.camera; const b = a.eBullets[0]; b.active = true; b.kind = 0; b.ea = null; b.x = Math.round(c.x + a.W / 2 + 150); b.y = Math.round(c.y + a.H / 2 - 120); b.vx = 0; b.vy = 0; b.life = 9;
    const rim = () => { a._draw(); const g = a.canvas.getContext('2d'); const s = a.scale; return Array.from(g.getImageData(Math.round((b.x - c.x + 5.4) * s), Math.round((b.y - c.y) * s), 1, 1).data); };
    localStorage.removeItem(k); a.refreshAccess(); const def = { cb: a._ebCB, px: rim() };
    localStorage.setItem(k, JSON.stringify({ v: 1, palette: 'normal', hudScale: 1, flashes: true, bulletOutline: false, lowGfx: false })); a.refreshAccess();
    const off = { n: a._ebCB ? a._ebCB.length : 0, px: rim() }; const keep = a._ebCB;
    const ce = document.createElement.bind(document); let made = 0; document.createElement = (t, o) => { if (String(t).toLowerCase() === 'canvas') made++; return ce(t, o); };
    for (let i = 0; i < 20; i++) { a.refreshAccess(); a._draw(); }
    document.createElement = ce;
    const same = a._ebCB === keep;
    localStorage.setItem(k, JSON.stringify({ v: 1, palette: 'normal', hudScale: 1, flashes: true, bulletOutline: true, lowGfx: false })); a.refreshAccess();
    const back = { cb: a._ebCB, px: rim() };
    b.active = false; localStorage.removeItem(k); a.refreshAccess();
    return { def, off, made, same, back };
  }, ACC);
  const dark = (px) => px[0] + px[1] + px[2] < 150, red = (px) => px[0] > 180 && px[1] < 140;
  check('default prefs (outline on, normal palette): today\'s sprites with their dark rim', ol.def.cb === null && dark(ol.def.px), JSON.stringify(ol.def));
  check('bulletOutline off on the normal palette: the bullet is drawn rimless (its red body reaches the edge)', ol.off.n === 3 && red(ol.off.px) && !dark(ol.off.px), JSON.stringify(ol.off));
  check('no per-frame churn: 20 frames + pref re-reads make no canvases and keep the same baked sprites', ol.made === 0 && ol.same === true, JSON.stringify({ made: ol.made, same: ol.same }));
  check('turning the outline back on restores the outlined bullets', ol.back.cb === null && dark(ol.back.px), JSON.stringify(ol.back));

  check('no DB traffic (blockDb)', A.db.attempts() === 0, JSON.stringify({ http: A.db.http, ws: A.db.ws }));
  errs.push(...A.errors); await A.ctx.close();
  check('no page or console errors', errs.length === 0, errs.join(' | '));
  await browser.close();
  done();
})();
