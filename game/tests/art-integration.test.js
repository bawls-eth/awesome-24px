// Hero art integration: MMArt loader + Lantern hero cards + Mad Maze arena animations.
// Serve the repo root first:  python3 -m http.server 8461 &
// Run: BASE=http://localhost:8461/game/index.html NODE_PATH=$(npm root -g) node game/tests/art-integration.test.js
// Set SHOTS=<dir> to also write desktop/phone screenshots. No Firebase, own origin only.
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const MAZE = ORIGIN + '/game/games/mad-maze/index.html?test=1&offline=1';
const LANTERN = ORIGIN + '/game/games/mad-maze/lantern.html?test=1';
const MM = 'pixeltown-mm-v1', ACTIVE = 'pixeltown-mm-active-v1';

const hero = (id, cls, name) => ({ id, name, cls, level: 3, xp: 0, fame: 0, bonus: 0, mode: 'classic', items: [] });
const profile = (heroes) => ({ v: 1, heroes, stash: new Array(16).fill(null), fame: 0, mode: 'classic', hall: [], migratedFrom: null });

async function open(browser, url, { heroes, active, opts } = {}) {
  const ctx = await browser.newContext(opts || { viewport: { width: 1000, height: 700 } });
  const page = await ctx.newPage();
  const errors = [], bad = [], reqs = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('response', (r) => { reqs.push(r.url()); if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css'); // same-origin blank page to seed storage
  await page.evaluate(([k1, p, k2, a]) => { if (p) localStorage.setItem(k1, JSON.stringify(p)); if (a) localStorage.setItem(k2, a); }, [MM, heroes ? profile(heroes) : null, ACTIVE, active || null]);
  bad.length = 0; errors.length = 0; reqs.length = 0; // the blank css page is not part of the test
  await page.goto(url);
  return { ctx, page, errors, bad, reqs };
}

(async () => {
  const browser = await chromium.launch();
  const shot = process.env.SHOTS;

  // ---------- MMArt checks in a plain same-origin page ----------
  const u = await open(browser, ORIGIN + '/game/games/mad-maze/lantern.css');
  await u.page.addScriptTag({ url: '/game/shared/mm-art.js' });
  const r = await u.page.evaluate(async () => {
    const out = {};
    const set = await MMArt.loadAll('/game/assets/arcane/');
    out.classes = set.classes().sort().join(',');
    const w = set.anim('warrior', 'walk', 'down'), m = set.anim('mage', 'attack', 'right');
    out.w = w && { f: w.frames, fps: w.fps, loop: w.loop, fw: w.fw, ay: w.ay };
    out.m = m && { f: m.frames, fps: m.fps, loop: m.loop, muz: m.muzzle.length };
    out.left = !!set.anim('warrior', 'walk', 'left');
    out.missing = [set.anim('warrior', 'fly', 'down'), set.anim('ghost', 'idle', 'down'), set.anim('warrior', 'walk', 'sideways')].map((x) => x === null);
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256; const g = cv.getContext('2d');
    const idx = (a, ts) => ts.map((t) => set.draw(g, a, t, 128, 231, 1, false));
    out.loopFrames = idx(w, [0, 0.11, 0.55, 0.6, 1.3]);
    const d = set.anim('warrior', 'death', 'down');
    out.oneShot = idx(d, [0, 0.13, 0.4, 0.75, 5, 99]);
    const sig = (a, t) => { g.clearRect(0, 0, 256, 256); set.draw(g, a, t, 128, 231, 1, false); return g.getImageData(0, 0, 256, 256).data.reduce((s, v, i) => (s + v * (i % 251 + 1)) % 1000003, 0); };
    out.frameDiffers = sig(w, 0) !== sig(w, 0.15);
    const r1 = set.anim('warrior', 'idle', 'right');
    g.clearRect(0, 0, 256, 256); set.draw(g, r1, 0, 128, 231, 1, false); const A = g.getImageData(0, 0, 256, 256).data;
    g.clearRect(0, 0, 256, 256); set.draw(g, r1, 0, 128, 231, 1, true); const B = g.getImageData(0, 0, 256, 256).data;
    let same = 0, tot = 0;
    for (let y = 0; y < 256; y += 3) for (let x = 0; x < 256; x++) { const a = (y * 256 + x) * 4, b = (y * 256 + (255 - x)) * 4; tot++; if (A[a + 3] === B[b + 3] && A[a] === B[b] && A[a + 1] === B[b + 1]) same++; }
    out.mirror = same / tot;
    let low = -1; for (let y = 255; y >= 0 && low < 0; y--) for (let x = 0; x < 256; x++) if (A[(y * 256 + x) * 4 + 3] > 0) { low = y; break; }
    out.low = low;
    const bad = await MMArt.load('/game/assets/arcane/b00-warrior/', 'no-such-manifest.json');
    out.deadManifest = bad.classes().length === 0 && bad.anim('warrior', 'idle', 'down') === null;
    // Every batch INDEX.json lists must load: each one's manifest classes show up in the merged registry.
    const artIdx = await (await fetch('/game/assets/arcane/INDEX.json')).json(); out.batches = [];
    for (const b of artIdx.batches) { const id = b.path.split('/').pop(); const m = await (await fetch('/game/assets/arcane/' + id + '/manifest.json')).json(); const animated = m.assets.filter((a) => a.action && a.dir); const cls = [...new Set(animated.map((a) => a.class || a.enemy || a.boss))]; const gone = []; for (const a of m.assets) { const r = await fetch('/game/assets/arcane/' + id + '/' + a.path, { method: 'HEAD' }); if (!r.ok) gone.push(a.path); } out.batches.push({ id, missing: cls.filter((c) => !set.has(c)), gone }); }
    out.ids = (await MMArt.packIds('/game/assets/arcane/')).join(',');
    out.mapped = [MMArt.artClassFor('bruiser'), MMArt.artClassFor('frostcaller'), MMArt.artClassFor('herald'), MMArt.artClassFor('punk'), MMArt.artClassFor('__proto__'), MMArt.artClassFor(null)].join('|');
    return out;
  });
  check('INDEX.json: every listed batch loads (no class of any batch is missing from the registry) and packIds covers them', r.batches.length >= 2 && r.batches.every((b) => b.missing.length === 0 && b.gone.length === 0) && r.batches.every((b) => r.ids.split(',').includes(b.id)), JSON.stringify([r.batches, r.ids]));
  check('MMArt loads every INDEX.json pack (registry holds at least warrior, ranger, mage, cleric)', ['warrior', 'ranger', 'mage', 'cleric'].every((c) => r.classes.split(',').includes(c)), r.classes);
  check('anim(warrior, walk, down): 6 frames at 10 fps, looping, 256 cell, feet anchor y 231', r.w && r.w.f === 6 && r.w.fps === 10 && r.w.loop === true && r.w.fw === 256 && r.w.ay === 231, JSON.stringify(r.w));
  check('anim(mage, attack, right): 5 frames at 12 fps, one-shot, with muzzle data', r.m && r.m.f === 5 && r.m.fps === 12 && r.m.loop === false && r.m.muz === 5, JSON.stringify(r.m));
  check('missing strips (unknown action/class/dir) return null', r.missing.every(Boolean), JSON.stringify(r.missing));
  check('a failed manifest load yields an empty set, no throw', r.deadManifest === true);
  check('looping animation wraps over time', r.loopFrames.join() === '0,1,5,0,1', r.loopFrames.join());
  check('one-shot animation holds the last frame', r.oneShot.join() === '0,1,3,5,5,5', r.oneShot.join());
  check('different frames draw different pixels', r.frameDiffers === true);
  check('left (flip) is the pixel mirror of right', r.mirror > 0.999, String(r.mirror));
  check('feet land on the anchor row (no rescale)', r.low >= 226 && r.low <= 232, String(r.low));
  check('anim(left) resolves to the right strip; class map ignores unsupported/odd ids', r.left === true && r.mapped === 'warrior|mage|cleric|||', r.mapped);
  await u.ctx.close();

  // ---------- Lantern ----------
  const heroes = [hero('hero-bruiser-1', 'bruiser', 'Brute'), hero('hero-punk-1', 'punk', 'Spike'), hero('hero-herald-1', 'herald', 'Pup')];
  const L = await open(browser, LANTERN, { heroes, active: JSON.stringify({ v: 1, heroId: 'hero-bruiser-1' }) });
  await L.page.waitForSelector('#heroes li[data-hero="hero-bruiser-1"] canvas.heroart:not([hidden])', { timeout: 8000 });
  const lc = await L.page.evaluate(() => {
    const q = (id) => document.querySelector('#heroes li[data-hero="' + id + '"] canvas.heroart');
    const b = q('hero-bruiser-1'), p = q('hero-punk-1'), h = q('hero-herald-1');
    const nz = (c) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; };
    return { warrior: !!b && !b.hidden && nz(b) > 500, punkNone: !p, cleric: !!h && !h.hidden && nz(h) > 500 };
  });
  check('Lantern shows an art canvas on the warrior (Bruiser) and cleric (Herald) cards', lc.warrior && lc.cleric, JSON.stringify(lc));
  check('classes without art (Punk) keep their text card, no canvas', lc.punkNone);
  const frames = new Set();
  for (let i = 0; i < 14; i++) { frames.add(await L.page.getAttribute('#heroes li[data-hero="hero-bruiser-1"] canvas.heroart', 'data-frame')); await L.page.waitForTimeout(90); }
  check('the warrior idle animates (several distinct frames over time)', frames.size >= 3, [...frames].join());
  await L.page.selectOption('#new-class', 'ranger');
  await L.page.waitForTimeout(200);
  check('class select shows the ranger art in the preview canvas', await L.page.evaluate(() => { const c = document.getElementById('new-class-art'); if (c.hidden) return false; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n > 500; }));
  if (shot) await L.page.screenshot({ path: shot + '/lantern-desktop.png' });
  check('Lantern: no 404s and no console errors', L.bad.length === 0 && L.errors.length === 0, L.bad.concat(L.errors).join(' | '));
  await L.ctx.close();

  const R = await open(browser, LANTERN, { heroes, opts: { viewport: { width: 1000, height: 700 }, reducedMotion: 'reduce' } });
  await R.page.waitForSelector('#heroes li[data-hero="hero-bruiser-1"] canvas.heroart:not([hidden])', { timeout: 8000 });
  const rf = new Set();
  for (let i = 0; i < 8; i++) { rf.add(await R.page.getAttribute('#heroes li[data-hero="hero-bruiser-1"] canvas.heroart', 'data-frame')); await R.page.waitForTimeout(120); }
  check('reduced motion: the warrior card is one static first frame', rf.size === 1 && rf.has('0'), [...rf].join());
  await R.ctx.close();

  const P = await open(browser, LANTERN, { heroes, opts: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } });
  await P.page.waitForSelector('#heroes li[data-hero="hero-bruiser-1"] canvas.heroart:not([hidden])', { timeout: 8000 });
  if (shot) await P.page.screenshot({ path: shot + '/lantern-phone.png' });
  check('Lantern 390x844: no horizontal scroll', await P.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await P.ctx.close();

  // ---------- Arena with the warrior ----------
  const A = await open(browser, MAZE, { heroes, active: JSON.stringify({ v: 1, heroId: 'hero-bruiser-1' }) });
  await A.page.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena._heroArt, null, { timeout: 8000 });
  await A.page.waitForTimeout(500);
  const dbg = () => A.page.evaluate(() => window.__mm.arena._heroDbg);
  const d0 = await dbg();
  check('arena draws the warrior idle when standing still', d0 && d0.action === 'idle' && d0.id === 'warrior_idle_down', JSON.stringify(d0));
  const region = (hideArt) => A.page.evaluate((hide) => {
    const a = window.__mm.arena; const keep = a._heroArt; a.player.iframes = 0;
    if (hide) a._heroArt = null;
    a._draw();
    const c = a.canvas, k = c.width / a.W;
    const x0 = Math.round((a.player.x - 40) * k), y0 = Math.round((a.player.y - 60) * k), w = Math.round(80 * k), h = Math.round(90 * k);
    const d = c.getContext('2d').getImageData(x0, y0, w, h).data;
    a._heroArt = keep;
    return Array.from(d).filter((_, i) => i % 7 === 0).join(',');
  }, hideArt);
  const withArt = await region(false), without = await region(true);
  check('canvas pixels around the player differ from the fallback sprite', withArt !== without);
  await A.page.evaluate(() => window.__mm.arena.setMoveStick(1, 0)); await A.page.waitForTimeout(250);
  let dw = await dbg();
  check('moving right switches idle -> walk (right strip)', dw && dw.action === 'walk' && dw.dir === 'right' && dw.flip === false, JSON.stringify(dw));
  await A.page.evaluate(() => window.__mm.arena.setMoveStick(-1, 0)); await A.page.waitForTimeout(250);
  dw = await dbg();
  check('moving left uses the right strip mirrored', dw && dw.dir === 'right' && dw.flip === true, JSON.stringify(dw));
  await A.page.evaluate(() => window.__mm.arena.setMoveStick(0, -1)); await A.page.waitForTimeout(250);
  dw = await dbg();
  check('moving up uses the up strip', dw && dw.action === 'walk' && dw.dir === 'up', JSON.stringify(dw));
  await A.page.evaluate(() => window.__mm.arena.setMoveStick(0, 0)); await A.page.waitForTimeout(300);
  check('stopping returns to idle', (await dbg()).action === 'idle');
  await A.page.evaluate(() => { const a = window.__mm.arena; a.mouse.seen = true; a.mouse.x = a.player.x + 200; a.mouse.y = a.player.y; a.mouse.down = true; });
  const seen = new Set();
  for (let i = 0; i < 12; i++) { const x = await dbg(); if (x) seen.add(x.action + ':' + x.dir); await A.page.waitForTimeout(40); }
  check('firing plays the attack animation toward the aim', [...seen].some((s) => s === 'attack:right'), [...seen].join());
  await A.page.evaluate(() => { window.__mm.arena.mouse.down = false; });
  await A.page.waitForTimeout(700);
  await A.page.evaluate(() => { const a = window.__mm.arena; a.player.iframes = 0; a._hitPlayer(1); });
  await A.page.waitForTimeout(60);
  const hurt = await dbg();
  check('taking damage plays the hit animation', hurt && hurt.action === 'hit', JSON.stringify(hurt));
  if (shot) { await A.page.waitForTimeout(500); await A.page.screenshot({ path: shot + '/arena-desktop.png' }); }
  await A.page.evaluate(() => { const a = window.__mm.arena; a.player.hp = 1; a.player.iframes = 0; a.shield.hits = 0; a._hitPlayer(9999); });
  await A.page.waitForTimeout(500);
  const dead = await dbg();
  check('death plays the death animation', dead && dead.action === 'death', JSON.stringify(dead));
  check('arena: no 404s, only own origin', A.bad.length === 0 && A.reqs.every((x) => x.startsWith(ORIGIN + '/')), A.bad.join(' '));
  check('arena: no console errors', A.errors.length === 0, A.errors.join(' | '));
  await A.ctx.close();

  // ---------- Fallbacks ----------
  const F = await open(browser, MAZE, { heroes, active: JSON.stringify({ v: 1, heroId: 'hero-punk-1' }) });
  await F.page.waitForFunction(() => window.__mm && window.__mm.arena); await F.page.waitForTimeout(800);
  check('hero with an unsupported class (Punk) keeps the fallback sprite', await F.page.evaluate(() => window.__mm.arena._heroArt === null && window.__mm.arena._heroDbg === null));
  await F.ctx.close();
  const C = await open(browser, MAZE, { heroes, active: '{corrupt' });
  await C.page.waitForFunction(() => window.__mm && window.__mm.arena); await C.page.waitForTimeout(800);
  check('corrupt active-hero key falls back safely, no errors', await C.page.evaluate(() => window.__mm.arena._heroArt === null) && C.errors.length === 0, C.errors.join(' | '));
  await C.ctx.close();
  const gate = await (async () => {
    const ctx = await browser.newContext(); const page = await ctx.newPage(); await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
    const res = await page.evaluate(async () => ({ realm: /setHeroArt\(/.test(await fetch('/game/realm.js').then((x) => x.text())), main: /setHeroArt|MMArt/.test(await fetch('/game/main.js').then((x) => x.text())) }));
    await ctx.close(); return res;
  })();
  check('in-town Realm Gate keeps the species sprite (hook exists, main.js never attaches art)', gate.realm && !gate.main, JSON.stringify(gate));

  const M = await open(browser, MAZE, { heroes, active: JSON.stringify({ v: 1, heroId: 'hero-bruiser-1' }), opts: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } });
  await M.page.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena._heroArt, null, { timeout: 8000 });
  await M.page.waitForTimeout(400);
  if (shot) await M.page.screenshot({ path: shot + '/arena-phone.png' });
  check('arena 390x844: no horizontal scroll', await M.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  check('arena phone: no console errors', M.errors.length === 0, M.errors.join(' | '));
  await M.ctx.close();

  await browser.close();
  done();
})();
