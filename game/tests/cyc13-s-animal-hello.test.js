// Cycle 13 S: ID-59 first-visit animal hello (spec: U cycle 11 in design/IDEAS.md). Real Town page, real game loop:
//   - walking within 160 px of a wild animal of a species not greeted yet shows a heart above it (code-drawn placeholder,
//     makeAnimalHelloHeart) for 1.2 s, and ONE line in #achievement-toast: "A Red Fox noticed you 💛" (species name, never a villager);
//   - the line sits inside the screen and covers none of A / C / the bag bar / the joystick (1280x720, 390x844, 195x422);
//   - a second species within 30 s still gets its heart, but no second line;
//   - once per species per profile: additive Town-save key `animalHello` (array of 30-bit words over the FF_ASSETS fauna order),
//     unknown bits / extra words kept, every other saved field unchanged; after a reload the same species is not greeted again;
//   - reduced motion: the heart does not bob or fade (fixed offset over the animal, alpha 1) and still disappears after 1.2 s;
//   - no line while a panel (the Museum) is open, or while a new player's Realm Gate chip still guides (first-minute rule); the heart still shows.
// OFFLINE: helpers.offlineStub, literal db.attempts() === 0. Never chats, never writes Firebase.
// Run: BASE=http://localhost:9135/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc13-s-animal-hello.test.js  (SHOTS=<dir>)
const { chromium } = require('playwright');
const { check, done, offlineStub, exposeGame, joinOffline } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const SHOTS = process.env.SHOTS || '';
const VERSION = 'v34-aquarium'; // GAME_VERSION: seen, so the What's-new banner stays down
// Every fauna bit set except fox (0) and deer (1), so nothing else is greeted at spawn; word 2 is an "unknown" word that must be kept.
const W0 = (2 ** 30 - 1) - 3, W1 = 2 ** 27 - 1, W2 = 5;
const OLD = { name: 'ADMINah', species: 'cat', frame: 0, lastSeenVersion: VERSION, animalHello: [W0, W1, W2], futureKey: { keep: 1 }, resources: { wood: 3 } };

// gate: true = the Realm Gate chip was already dismissed (so the toast line is free); false = a brand-new player's chip still guides.
const seed = (ctx, obj, gate = true) => ctx.addInitScript(([o, g]) => {
  if (!localStorage.getItem('__cyc13ah')) {
    localStorage.setItem('pixeltown-save-v1', JSON.stringify(o)); localStorage.setItem('__cyc13ah', '1');
    if (g) localStorage.setItem('pixeltown-gate-pointer-v1', JSON.stringify({ v: 1, dismissed: true, reached: false }));
  }
}, [obj, gate]);
async function open(ctx, page) {
  const errors = [];
  page = page || await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await exposeGame(page);
  await page.goto(BASE);
  await joinOffline(page, 'ADMINah');
  // wait for a quiet toast (nothing else is using the shared line)
  await page.waitForFunction(() => { const t = document.getElementById('achievement-toast'); return !t || t.classList.contains('hidden'); }, null, { timeout: 15000 }).catch(() => null);
  return { page, errors };
}
// Stand the hero 60 px from the first specimen of `id` (and freeze that animal so it stays in range), then let the sweep run.
const walkTo = (page, id) => page.evaluate(async (sid) => {
  const s = window.__g.scene.getScene('Town');
  const spec = s.ffSpecimens.find((x) => x.id === sid && !x.pond && !x.ocean);
  s.tweens.killTweensOf(spec.sprite);
  s.localBody.setPosition(spec.sprite.x + 60, spec.sprite.y);
  await new Promise((r) => setTimeout(r, 300));
  s.refreshFloraFaunaNear();
  // up to 3 s (slow shared machine) for the greeting; a species already greeted never shows up, so that waits the full 3 s
  for (let t = 0; t < 30 && (s.animalHelloLog || []).indexOf(sid) < 0; t++) await new Promise((r) => setTimeout(r, 100));
  return (s.animalHelloLog || []).indexOf(sid) >= 0;
}, id);
// cycle 14 (L): the hello is held in memory until the PLAYER acts; one real, short walk step (a key on desktop, the same input path
// the joystick feeds) lets it be saved. The save checks below are the same as before, read after this step.
const step = async (page) => { await page.keyboard.down('ArrowRight'); await page.waitForTimeout(120); await page.keyboard.up('ArrowRight'); await page.waitForTimeout(80); };
const state = (page) => page.evaluate(() => {
  const s = window.__g.scene.getScene('Town');
  const t = document.getElementById('achievement-toast');
  const vis = (e) => !!e && !e.classList.contains('hidden') && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0;
  const r = t.getBoundingClientRect();
  const overlaps = [];
  if (vis(t)) ['interact-btn', 'mobile-chat-btn', 'inventory-panel', 'joystick'].forEach((id) => {
    const o = document.getElementById(id); if (!vis(o)) return;
    const q = o.getBoundingClientRect();
    if (q.left < r.right - 0.5 && q.right > r.left + 0.5 && q.top < r.bottom - 0.5 && q.bottom > r.top + 0.5) overlaps.push(id);
  });
  let raw = {}; try { raw = JSON.parse(localStorage.getItem('pixeltown-save-v1') || '{}'); } catch (e) { raw = {}; }
  // cyc14-ui: is a heart box (world rect) all canvas on screen (no DOM HUD over it)? Used for "above, unless the DOM HUD covers the spot above".
  const cam = s.cameras.main, cv = s.game.canvas, cr = cv.getBoundingClientRect(), k = cr.width / s.scale.width * cam.zoom;
  const clearAt = (x, y, w, h) => { const L = cr.left + (x - cam.worldView.x) * k, T = cr.top + (y - cam.worldView.y) * k, W = w * k, H = h * k;
    return [[L + W / 2, T + H / 2], [L + 2, T + 2], [L + W - 2, T + 2], [L + 2, T + H - 2], [L + W - 2, T + H - 2]].every(([px, py]) => document.elementFromPoint(px, py) === cv); };
  const hs = (s.animalHelloHearts || []).map((h) => { const sp = h.spec.sprite, b = h.heart.getBounds(), hw = h.heart.displayWidth, hh = h.heart.displayHeight;
    return { id: h.spec.id, key: h.heart.texture.key, dy: Math.round(h.heart.y - h.spec.sprite.y), a: h.heart.alpha, alive: !!h.heart.scene, above: h.heart.y < h.spec.sprite.y, vis: h.heart.visible, inView: s.cameras.main.worldView.contains(h.heart.x, h.heart.y), sy: Math.round((h.heart.y - s.cameras.main.worldView.y) * s.cameras.main.zoom),
      clear: clearAt(b.x, b.y, b.width, b.height), upCovered: !clearAt(sp.x - hw / 2, sp.y - sp.displayHeight / 2 - 4 - hh, hw, hh) }; });
  return { log: (s.animalHelloLog || []).slice(), lines: s.animalHelloLines || 0, hearts: hs, toast: vis(t) ? t.textContent : '', live: t.getAttribute('aria-live'),
    rect: { l: r.left, t: r.top, r: r.right, b: r.bottom }, vw: innerWidth, vh: innerHeight, sw: document.documentElement.scrollWidth, overlaps, raw };
});

(async () => {
  const browser = await chromium.launch();
  // ---------- A. heart + line at three viewports; second species: heart, no line; reload: no repeat ----------
  for (const vp of [{ width: 1280, height: 720, touch: false }, { width: 390, height: 844, touch: true }, { width: 195, height: 422, touch: true }]) {
    const tag = `${vp.width}x${vp.height}`;
    const ctx = await browser.newContext(vp.touch ? { viewport: vp, hasTouch: true, isMobile: true, reducedMotion: 'no-preference' } : { viewport: vp, reducedMotion: 'no-preference' });
    const db = await offlineStub(ctx);
    await seed(ctx, OLD);
    let { page, errors } = await open(ctx);
    let s = await state(page);
    check(`[${tag}] no hello at spawn (every other species already greeted in the seed)`, s.log.length === 0, JSON.stringify(s.log));
    await walkTo(page, 'fox');
    s = await state(page);
    // cyc14-ui: above it, unless the DOM HUD (the 195 px bag bar) covers the spot above: then on a side nothing covers (it used to be drawn under the bag bar)
    check(`[${tag}] near the fox: greeted once, a heart above it, or beside it where the HUD covers the spot above, and uncovered (G's baked heart; the code-drawn placeholder only if it is missing)`, s.log.join() === 'fox' && s.hearts.length === 1 && (s.hearts[0].key === 'fft_heart' || s.hearts[0].key === 'animal-hello-heart') && (s.hearts[0].above || s.hearts[0].upCovered) && s.hearts[0].clear && s.hearts[0].vis && s.hearts[0].inView, JSON.stringify([s.log, s.hearts]));
    check(`[${tag}] one line in the polite toast, species name`, s.toast === 'A Red Fox noticed you 💛' && s.live === 'polite' && s.lines === 1, JSON.stringify([s.toast, s.lines]));
    check(`[${tag}] the line is inside the screen, no sideways scroll`, s.rect.l >= 0 && s.rect.t >= 0 && s.rect.r <= s.vw && s.rect.b <= s.vh && s.sw <= s.vw, JSON.stringify([s.rect, s.vw, s.vh, s.sw]));
    check(`[${tag}] the line covers none of A, C, the bag bar, the joystick`, s.overlaps.length === 0, s.overlaps.join(','));
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/cyc13-systems-hello-${tag}.jpg`, type: 'jpeg', quality: 75 });
    await step(page);
    s = await state(page);
    const a = s.raw.animalHello;
    check(`[${tag}] save: animalHello gained the fox bit, other bits and the unknown word kept`, Array.isArray(a) && a[0] === W0 + 1 && a[1] === W1 && a[2] === W2, JSON.stringify(a));
    check(`[${tag}] save: every other seeded field unchanged (additive)`, JSON.stringify(s.raw.futureKey) === '{"keep":1}' && JSON.stringify(s.raw.resources) === '{"wood":3}' && s.raw.name === 'ADMINah' && s.raw.lastSeenVersion === VERSION, JSON.stringify(s.raw).slice(0, 300));
    await page.waitForTimeout(1300);
    s = await state(page);
    check(`[${tag}] the heart is gone after 1.2 s`, s.hearts.length === 0, JSON.stringify(s.hearts));
    await walkTo(page, 'deer');
    s = await state(page);
    check(`[${tag}] the deer within 30 s: heart, but no second line`, s.log.join() === 'fox,deer' && s.hearts.length === 1 && s.hearts[0].id === 'deer' && s.lines === 1 && !/Deer/.test(s.toast), JSON.stringify([s.log, s.lines, s.toast]));
    const other = await page.evaluate(() => { const s2 = window.__g.scene.getScene('Town'); const t = document.getElementById('achievement-toast'); const had = t.classList.contains('toast-hello'); s2.showAchievementToast('ADMIN test toast'); const a1 = t.classList.contains('toast-hello'); t.classList.add('toast-hello'); s2.stallNote('ADMIN test note'); return { had, a1, a2: t.classList.contains('toast-hello') }; });
    check(`[${tag}] the compact hello layout belongs to the hello line only (achievement toast and shop note drop it)`, other.had && !other.a1 && !other.a2, JSON.stringify(other));
    await step(page); // the player walks on: the deer's hello is saved too
    // reload: the same profile never greets the fox or the deer again
    await page.close();
    ({ page, errors: errors } = await open(ctx, null));
    await walkTo(page, 'fox');
    await walkTo(page, 'deer');
    s = await state(page);
    check(`[${tag}] after a reload: fox and deer are not greeted again (no heart, no line)`, s.log.length === 0 && s.hearts.length === 0 && s.lines === 0, JSON.stringify([s.log, s.hearts, s.lines]));
    check(`[${tag}] no page errors, 0 database attempts`, errors.length === 0 && db.attempts() === 0, JSON.stringify([errors, db.attempts()]));
    await ctx.close();
  }

  // ---------- B. reduced motion: the heart is static; and no line while the Museum is open ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: 'reduce' });
    const db = await offlineStub(ctx);
    await seed(ctx, OLD);
    const { page, errors } = await open(ctx);
    await page.evaluate(() => window.__g.scene.getScene('Town').openMuseum());
    await walkTo(page, 'fox');
    const samples = [];
    for (let i = 0; i < 6; i++) { const h = (await state(page)).hearts[0]; if (h) samples.push(h); await page.waitForTimeout(80); }
    const s = await state(page);
    check('[reduce] Museum open: the fox gets its heart but no line', s.log.join() === 'fox' && s.lines === 0 && s.toast === '', JSON.stringify([s.log, s.lines, s.toast]));
    check('[reduce] the heart does not bob or fade (same offset over the animal, alpha 1, in every sample)', samples.length >= 3 && samples.every((h) => h.dy === samples[0].dy && h.a === 1), JSON.stringify(samples));
    await page.waitForTimeout(1300);
    check('[reduce] it still disappears after 1.2 s', (await state(page)).hearts.length === 0);
    check('[reduce] no page errors, 0 database attempts', errors.length === 0 && db.attempts() === 0, JSON.stringify([errors, db.attempts()]));
    await ctx.close();
  }
  // ---------- C. normal motion: the heart does bob (so B measures something) ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: 'no-preference' });
    const db = await offlineStub(ctx);
    await seed(ctx, OLD, false);
    const { page, errors } = await open(ctx);
    await walkTo(page, 'fox');
    const dys = [];
    for (let i = 0; i < 5; i++) { const h = (await state(page)).hearts[0]; if (h) dys.push(h.dy); await page.waitForTimeout(60); }
    check('[motion] the heart bobs when motion is allowed (its offset changes)', new Set(dys).size > 1, JSON.stringify(dys));
    const g = await page.evaluate(() => { const e = document.getElementById('gate-pointer'); const s2 = window.__g.scene.getScene('Town'); return { chip: !!e && !e.classList.contains('hidden') && getComputedStyle(e).display !== 'none', lines: s2.animalHelloLines || 0, log: (s2.animalHelloLog || []).slice() }; });
    check('[motion] a new player whose Realm Gate chip still shows: heart yes, no toast line, the chip stays up', g.log.indexOf('fox') >= 0 && g.lines === 0 && g.chip, JSON.stringify(g));
    check('[motion] no page errors, 0 database attempts', errors.length === 0 && db.attempts() === 0, JSON.stringify([errors, db.attempts()]));
    await ctx.close();
  }
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
