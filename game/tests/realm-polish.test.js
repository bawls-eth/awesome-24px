// Realm polish: gesture-time audio, live reduce-motion, aim-assist toggle, pad hygiene, Start toggles the panel.
// Runs on the standalone Mad Maze page (same realm.js, no Firebase). Serve the repo root first.
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const URL = ORIGIN + '/game/games/mad-maze/index.html?test=1&offline=1';

async function open(browser, opts, init) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  if (init) await page.addInitScript(init);
  await page.goto(URL);
  await page.waitForFunction(() => window.__mm && window.__mm.arena);
  await page.waitForTimeout(300);
  await page.evaluate(() => { window.freeze = () => { const r = window.__mm.arena; cancelAnimationFrame(r._raf); r.active = true; r.state = 'play'; r.run.wave = 1; r.player.hp = 1e6; r.player.iframes = 0; r.enemies.forEach((e) => { e.active = false; }); r.pBullets.forEach((b) => { b.active = false; }); r.eBullets.forEach((b) => { b.active = false; }); navigator.getGamepads = () => []; return r; }; });
  return { ctx, page, errors };
}

// A fake AudioContext that counts constructions and resumes.
const fakeAudio = () => {
  window.__ac = { made: 0, resumed: 0 };
  window.AudioContext = class {
    constructor() { window.__ac.made++; this.state = 'suspended'; this.currentTime = 0; this.destination = {}; this.sampleRate = 44100; }
    resume() { window.__ac.resumed++; this.state = 'running'; return Promise.resolve(); }
    createGain() { return { gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {} }; }
    createOscillator() { return { frequency: { setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {}, start() {}, stop() {} }; }
    createBuffer() { return { getChannelData: () => new Float32Array(8) }; }
    createBufferSource() { return { connect() {}, start() {}, stop() {} }; }
    createBiquadFilter() { return { frequency: {}, connect() {} }; }
  };
};

(async () => {
  const browser = await chromium.launch();

  // 1. audio unlocked inside the gesture handler
  const a = await open(browser, { viewport: { width: 1000, height: 700 } }, fakeAudio);
  const A = a.page;
  check('no AudioContext before any gesture', await A.evaluate(() => window.__ac.made === 0 && window.__mm.arena._actx === null));
  await A.evaluate(() => window.freeze());
  await A.keyboard.press('x');
  const g1 = await A.evaluate(() => ({ made: window.__ac.made, resumed: window.__ac.resumed, sfx: !!window.__mm.arena.sfx }));
  check('keydown creates + resumes the AudioContext in the handler (no sound played yet)', g1.made === 1 && g1.resumed >= 1 && g1.sfx, JSON.stringify(g1));
  await A.mouse.click(300, 300);
  check('further gestures reuse the one AudioContext', await A.evaluate(() => window.__ac.made === 1));

  const b = await open(browser, { viewport: { width: 1000, height: 700 } }, fakeAudio);
  const B = b.page;
  const padG = await B.evaluate(() => {
    const r = freeze(); const before = window.__ac.made;
    navigator.getGamepads = () => [{ connected: true, axes: [0, 0, 0, 0], buttons: [] }]; r._update(1 / 60);
    const idle = window.__ac.made;
    navigator.getGamepads = () => [{ connected: true, axes: [0, 0, 0, 0], buttons: [{ pressed: true }] }]; r._update(1 / 60);
    return { before, idle, after: window.__ac.made, resumed: window.__ac.resumed };
  });
  check('idle pad does not create audio', padG.before === 0 && padG.idle === 0, JSON.stringify(padG));
  check('first pad button press creates + resumes the AudioContext', padG.after === 1 && padG.resumed >= 1, JSON.stringify(padG));
  await b.ctx.close();

  // 2. live reduce-motion + blink replacement
  const c = await open(browser, { viewport: { width: 1000, height: 700 } });
  const C = c.page;
  const drawn = (iframes) => C.evaluate((f) => { // is the player sprite drawn at this i-frame phase, and with what alpha?
    const r = freeze(); r.player.x = 300; r.player.y = 300;
    const g = r.canvas.getContext('2d'); const orig = g.drawImage; const log = [];
    g.drawImage = function (...args) { if (args[3] === 32 || args[3] === 48) log.push(g.globalAlpha); return orig.apply(this, args); };
    r._update(0); r.player.iframes = f; r._draw(); g.drawImage = orig;
    return log;
  }, iframes);
  check('motion normal: reduced flag off', await C.evaluate(() => { const r = freeze(); r._update(0.001); return r._reduced === false; }));
  const n1 = await drawn(0.30); const n2 = await drawn(0.28);
  check('normal motion: i-frame blink hides the sprite on alternate phases', n1.length !== n2.length, JSON.stringify([n1, n2]));
  await C.emulateMedia({ reducedMotion: 'reduce' });
  check('switching to reduced mid-run is picked up on the next update', await C.evaluate(() => { const r = freeze(); r._update(0.001); return r._reduced === true; }));
  const r1 = await drawn(0.30); const r2 = await drawn(0.28);
  check('reduced motion: sprite drawn on both blink phases (no blink)', r1.length === 1 && r2.length === 1, JSON.stringify([r1, r2]));
  check('reduced motion: steady tint alpha while i-frames last', r1[0] < 1 && r1[0] === r2[0], JSON.stringify([r1, r2]));
  await C.emulateMedia({ reducedMotion: 'no-preference' });
  check('switching back is live too', await C.evaluate(() => { const r = freeze(); r._update(0.001); return r._reduced === false; }));

  // 3. aim-assist toggle
  const t = await C.evaluate(() => {
    const r = freeze(); const btn = document.getElementById('realm-aim-btn');
    if (!btn) return { ok: false };
    r.setAimAssist(true); const lab1 = btn.getAttribute('aria-label'); const k0 = localStorage.getItem('mm-aim-assist');
    btn.click(); const k1 = localStorage.getItem('mm-aim-assist'); const lab2 = btn.getAttribute('aria-label'); const off = r._aimAssist;
    btn.click(); const k2 = localStorage.getItem('mm-aim-assist');
    return { ok: true, lab1, lab2, k0, k1, k2, off, saveKeys: Object.keys(r.save).filter((x) => /aim/i.test(x)) };
  });
  check('HUD aim toggle button exists with an aria-label', t.ok && /aim assist/i.test(t.lab1), JSON.stringify(t));
  check('clicking the toggle flips mm-aim-assist 1 -> 0 -> 1 and updates the label', t.k0 === '1' && t.k1 === '0' && t.k2 === '1' && t.off === false && /off/.test(t.lab2), JSON.stringify(t));
  check('toggle leaves the realm save untouched', t.saveKeys.length === 0);

  // 4. _padPrev cleared on disconnect
  const p = await C.evaluate(() => {
    const r = freeze(); r.save.level = 30; r.abilityCd = [0, 0, 0, 0];
    navigator.getGamepads = () => [{ connected: true, axes: [0, 0, 0, 0], buttons: [{ pressed: true }] }]; r._update(1 / 60);
    const held = r._padPrev[0];
    navigator.getGamepads = () => []; r._update(1 / 60);
    return { held, cleared: r._padPrev.every((v) => v === false) };
  });
  check('pad ability held is remembered while connected', p.held === true);
  check('_padPrev cleared when the pad disconnects', p.cleared);

  // 5. hash skipped with no bolts
  const h = await C.evaluate(() => {
    const r = freeze(); let built = 0; const orig = r._buildHash.bind(r); r._buildHash = () => { built++; orig(); };
    r._updateBullets(1 / 60); const none = built;
    const bl = r.pBullets[0]; bl.active = true; bl.x = 100; bl.y = 100; bl.vx = 0; bl.vy = 0; bl.life = 1;
    r._updateBullets(1 / 60);
    return { none, some: built };
  });
  check('no _buildHash on a frame with no player bolts', h.none === 0, JSON.stringify(h));
  check('_buildHash still runs when a bolt is live', h.some === 1, JSON.stringify(h));

  // 6. Start toggles the panel
  const s = await C.evaluate(() => {
    const r = freeze(); const pad = (on) => { navigator.getGamepads = () => [{ connected: true, axes: [0, 0, 0, 0], buttons: [0, 0, 0, 0, 0, 0, 0, 0, 0, { pressed: on }] }]; };
    const out = [];
    pad(false); r._update(1 / 60); out.push(r.paused);
    pad(true); r._update(1 / 60); out.push(r.paused, r.panel);
    r._update(1 / 60); out.push(r.paused); // held: no retrigger
    pad(false); r._update(1 / 60); out.push(r.paused);
    pad(true); r._update(1 / 60); out.push(r.paused, r.panel); // second press closes
    return out;
  });
  check('pad Start (button 9) opens the backpack panel', s[1] === true && s[2] === 'bp', JSON.stringify(s));
  check('holding Start does not retrigger; release keeps it open', s[3] === true && s[4] === true, JSON.stringify(s));
  check('second Start press closes the panel', s[5] === false && s[6] === null, JSON.stringify(s));

  // 7. reused pad result
  const same = await C.evaluate(() => {
    const r = freeze(); const gp = { connected: true, axes: [0.9, -0.4, 0.3, 0.8], buttons: [{ pressed: true }, 0, 0, 0, 0, { value: 1 }, 0, { value: 0.9 }, 0, { pressed: true }] };
    navigator.getGamepads = () => [gp]; r._readPad(); const x = r._pad; const want = MMPad.read(gp);
    r._readPad(); const y = r._pad;
    return { reused: x === y, eq: JSON.stringify(x) === JSON.stringify(want) };
  });
  check('pad result object is reused across frames', same.reused);
  check('reused pad result matches MMPad.read', same.eq, JSON.stringify(same));
  check('no page errors', a.errors.length + c.errors.length === 0, a.errors.concat(c.errors).join(' | '));

  await browser.close();
  done();
})();
