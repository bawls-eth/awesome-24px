// Cycle 15 S: the approved ideas ID-69 and ID-68 (U conditions in design/IDEAS.md, "U review of ID-68..70 (cycle 14)").
//   [69] Isles tame-then-fight bridge: after the first tame of an isle visit (a real KO + feed tame of a Fern Raptor, jungle), the existing
//        hint names the nearest hostile in <= 40 characters ("Fern Raptor guards the beach. Go fight!" style, with a verb so the first-ten hint gate still counts it as an action); it goes through the ordinary hint
//        (#hint, role=status), and at 160x284 and 195x422 it is fully on screen, drawn above the HUD and on no button (the cyc13-ui
//        hint checks), tucked after 6 s; at 1280x720 it shows too. A second tame does not repeat it. It never replaces a danger hint:
//        on mars with the air running low the air hint wins while the line is armed. ?tame=0 / no tame: never shown. No save key.
//   [68] Shore first-level floor (seed 31337 = the slow first-ten profile world-shore-e): a Lv 1 hero not levelled by 15 s of world play
//        levels on the first Shore kill after 15 s, through the normal kill path (Level 2 banner, the bar lands on the level: xp 0);
//        a kill before 15 s is not touched; ?lvfloor=0 = the old numbers (still Lv 1 after the same kills); the gift is at most
//        rmXpNeeded(1) - 1 = 29 XP and given once; per-level XP needs and Lv 2+ per-kill XP are unchanged; a run that levels before 15 s
//        is byte-identical with and without (level, xp, every gain). (L cycle 15: "Lv 2+ XP totals byte-identical" cannot hold for a bot
//        run, whose path shifts once it levels earlier; these are the pinned forms.) No new save key (the realm save has the same key set).
// OFFLINE: blockDb, literal db.attempts() === 0. Never chats, never writes Firebase.
// Run: BASE=http://localhost:9105/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc15-s-systems.test.js   (SHOTS=<dir>; ONLY=69,68)
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const ISLES = ORIGIN + '/game/games/isles/index.html';
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&seed=31337';
const SHOTS = process.env.SHOTS || '';
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const want = (k) => !ONLY || ONLY.includes(k);
const J = JSON.stringify;
const PROFILE = { v: 1, heroes: [{ id: 'h1', name: 'Fern', cls: 'druid', level: 7, xp: 10, items: [] }], stash: [], fame: 0, mode: 'classic', hall: [] };
const HERO_KEYS = { 'pixeltown-mm-v1': JSON.stringify(PROFILE), 'pixeltown-mm-active-v1': JSON.stringify({ v: 1, heroId: 'h1' }) };

async function openIsles(browser, vp, query) {
  const ctx = await browser.newContext(vp.touch ? { viewport: { width: vp.w, height: vp.h }, hasTouch: true, isMobile: true } : { viewport: { width: vp.w, height: vp.h } });
  const db = await blockDb(ctx);
  await ctx.addInitScript((s) => { if (sessionStorage.c15s) return; sessionStorage.c15s = '1'; localStorage.clear(); Object.keys(s).forEach((k) => localStorage.setItem(k, s[k])); }, HERO_KEYS);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(ISLES + '?test=1&seed=123' + (query || ''));
  await page.waitForFunction(() => window.__isles && window.__isles.world);
  // close the first-visit how-to with the page's own close (a click), so the hint line is what is on screen
  await page.evaluate(() => { const c = document.getElementById('howto-close'); if (c && !document.getElementById('howto').hidden) c.click(); });
  return { ctx, page, errors, db };
}
const ev = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__isles, ${JSON.stringify(arg === undefined ? null : arg)})`);
// pause the live loop, clear the spawner, stand on open land; one hostile raptor 7 tiles off (the one to name) and one to tame
const SETUP = (I) => { I.pause(true); I.god(true); I.clearCreatures(); const r = I.findTile(null, 13); I.teleport(r.x, r.y); I.step(0, 0, 0.05); return r; };
// knock a creature out with soothe shots, then feed it until tamed (as isles-taming.test.js)
const KO_AND_TAME = (I, a) => {
  const h = I.hero();
  const uid = I.spawn(a.sp, h.tx + 3, h.ty);
  const get = () => I.creatures().find((c) => c.uid === uid) || null;
  const out = { uid, tamed: false };
  I.soothe(true);
  for (let i = 0; i < 80 && get() && !get().ko; i++) { const c = get(), hh = I.hero(); I.fire(c.x - hh.x, c.y - 8 - hh.y); I.step(0, 0, 0.3); }
  if (!get() || !get().ko) return out;
  I.soothe(false); I.nextTo(uid, -30);
  for (let i = 0; i < (a.feeds || 20) && !out.tamed; i++) { if (a.air) I.envSet(0, 90); if (a.foe && !I.creatures().some((c) => c.uid === out.foe)) { const hh = I.hero(); out.foe = I.spawn(a.foe, hh.tx - 7, hh.ty); out.foeN = (out.foeN || 0) + 1; } const r = I.feed(); if (r.tamed) { out.tamed = true; break; } I.step(0, 0, 6.2); I.nextTo(uid, -30); } // a.air: mars, keep the Air meter full while feeding
  return out;
};
const HINT_M = () => {
  const R = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
  const h = document.getElementById('hint'), hc = getComputedStyle(h);
  const btns = [...document.querySelectorAll('#acts > button, #touch-btns button, #btn-pack, #btn-map')].filter((b) => !b.hidden && b.offsetParent && getComputedStyle(b).visibility !== 'hidden')
    .map((b) => Object.assign({ id: b.id }, R(b))).filter((b) => b.r - b.l > 0);
  return { text: h.textContent, hidden: h.hidden, role: h.getAttribute('role') || (h.closest('[role=status]') ? 'status(parent)' : ''), live: h.getAttribute('aria-live'), hint: h.hidden ? null : R(h), op: parseFloat(hc.opacity),
    vis: hc.visibility, z: parseInt(hc.zIndex, 10) || 0, hudZ: parseInt(getComputedStyle(document.getElementById('hud')).zIndex, 10) || 0, hud: R(document.getElementById('hud')), btns, vw: innerWidth, vh: innerHeight, tucked: document.body.classList.contains('hint-tucked') };
};
const over = (a, b) => Math.min(a.r, b.r) - Math.max(a.l, b.l) > 1.5 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 1.5;

async function id69(browser) {
  for (const vp of [{ w: 160, h: 284, touch: true }, { w: 195, h: 422, touch: true }, { w: 390, h: 844, touch: true }, { w: 1280, h: 720, touch: false }]) {
    const tag = `[69 ${vp.w}x${vp.h}]`;
    const P = await openIsles(browser, vp, '');
    const before = await P.page.evaluate(() => Object.keys(localStorage).sort());
    const r = await ev(P.page, (I, SET) => {
      eval('(' + SET + ')')(I);
      const h = I.hero(); const foe = I.spawn('fernraptor', h.tx - 7, h.ty);
      const g0 = (I.guard ? I.guard() : { text: "", left: 0 });
      return { foe, g0, hint0: I.hint() };
    }, SETUP.toString());
    check(`${tag} before any tame: no guard line armed`, !r.g0.done && !r.g0.text && r.hint0.indexOf('guards') < 0, J(r));
    const t = await ev(P.page, KO_AND_TAME, { sp: 'fernraptor' });
    // draw the HUD with the live loop for a moment (the hint DOM is written by drawHud) and let fitHint run
    const a = await ev(P.page, (I, foe) => { const g = (I.guard ? I.guard() : { text: "", left: 0 }); I.step(0, 0, 0.05); return { g, hint: I.hint(), foeAlive: I.creatures().some((c) => c.uid === foe) }; }, r.foe);
    // the tame toast is up first (the phone hint waits under it, cyc5-ui stagger); measure once it has gone
    await P.page.evaluate(() => window.__isles.pause(false));
    await P.page.waitForFunction(() => !document.body.classList.contains('toast-on'), null, { timeout: 6000 }).catch(() => null);
    await P.page.waitForTimeout(500);
    await P.page.evaluate(() => window.__isles.pause(true));
    const m = await P.page.evaluate(HINT_M);
    check(`${tag} a real KO + feed tame happened`, t.tamed, J(t));
    check(`${tag} after the first tame the hint names the nearest hostile, <= 40 characters`, a.g.text && a.g.text.length <= 40 && /Fern Raptor|Fernraptor/i.test(a.g.text) && /\bgo\b/i.test(a.g.text) && a.hint === a.g.text && a.foeAlive, J(a));
    check(`${tag} the line is in the #hint chip on screen (role=status)`, !m.hidden && m.text === a.g.text && /status/.test(m.role || '') && m.op === 1 && m.vis === 'visible', J({ text: m.text, role: m.role, op: m.op, vis: m.vis }));
    check(`${tag} the hint is fully on screen and covers no button`, m.hint && m.hint.l >= 0 && m.hint.t >= 0 && m.hint.r <= m.vw + 0.5 && m.hint.b <= m.vh + 0.5 && m.btns.every((x) => !over(m.hint, x)), J({ hint: m.hint, hit: m.btns.filter((x) => over(m.hint, x)).map((x) => x.id) }));
    if (vp.w < 300) check(`${tag} narrow phone: drawn above the HUD while new (the cyc13 show-then-tuck path)`, m.z > m.hudZ && !m.tucked, J({ z: m.z, hudZ: m.hudZ, tucked: m.tucked }));
    if (SHOTS) await P.page.screenshot({ path: `${SHOTS}/cyc15-systems-isles-guard-${vp.w}x${vp.h}.jpg`, type: 'jpeg', quality: 75 });
    if (vp.w < 300) {
      await P.page.evaluate(() => window.__isles.pause(false));
      const w0 = Date.now();
      await P.page.waitForFunction(() => document.body.classList.contains('hint-tucked'), null, { timeout: 12000 }).catch(() => null);
      const waited = Date.now() - w0;
      await P.page.evaluate(() => window.__isles.pause(true));
      const k = Object.assign(await P.page.evaluate(HINT_M), { waited });
      check(`${tag} after its 6 s the line tucks away (the existing cyc13 rule; still the guard line)`, k.tucked && k.op === 0 && k.text === a.g.text && k.waited >= 5000, J({ tucked: k.tucked, op: k.op, text: k.text, waited: k.waited }));
    }
    // the line runs out (12 s of play) and a second tame does not bring it back
    const b = await ev(P.page, (I) => { I.step(0, 0, 13); return { hint: I.hint(), g: (I.guard ? I.guard() : { text: "", left: 0 }) }; });
    check(`${tag} the line ends after its 12 s`, b.hint.indexOf(b.g.text) < 0, J(b));
    const t2 = await ev(P.page, KO_AND_TAME, { sp: 'fernraptor' });
    const c = await ev(P.page, (I) => { I.step(0, 0, 0.05); return { hint: I.hint(), g: (I.guard ? I.guard() : { text: "", left: 0 }) }; });
    check(`${tag} a second tame does not repeat it`, t2.tamed && c.hint.indexOf(c.g.text) < 0 && c.g.left === 0, J({ t2: t2.tamed, c }));
    const after = await P.page.evaluate(() => Object.keys(localStorage).sort());
    check(`${tag} no new storage key (in memory only)`, after.every((k) => before.indexOf(k) >= 0 || /^pixeltown-(tames|isles|mm-notebook|notebook)/.test(k)) && !after.some((k) => /guard/i.test(k)), J({ before, after }));
    check(`${tag} no page errors, 0 database attempts`, P.errors.length === 0 && P.db.attempts() === 0, J([P.errors, P.db.attempts()]));
    await P.ctx.close();
  }
  // ?tame=0: no tame, never a line
  {
    const P = await openIsles(browser, { w: 390, h: 844, touch: true }, '&tame=0');
    const r = await ev(P.page, (I, SET) => { eval('(' + SET + ')')(I); const h = I.hero(); I.spawn('fernraptor', h.tx - 7, h.ty); I.step(0, 0, 2); return { g: (I.guard ? I.guard() : { text: "", left: 0 }), hint: I.hint() }; }, SETUP.toString());
    check('[69 ?tame=0] never armed, never shown', !r.g.done && !r.g.text && r.hint.indexOf('guards') < 0 && r.hint.indexOf(' is near') < 0, J(r));
    check('[69 ?tame=0] no page errors, 0 database attempts', P.errors.length === 0 && P.db.attempts() === 0, J([P.errors, P.db.attempts()]));
    await P.ctx.close();
  }
}

// the danger hint wins: mars, the air running low while the line is armed
async function id69Air(browser) {
  const P = await openIsles(browser, { w: 390, h: 844, touch: true }, '&isle=mars&seed=7');
  const sp = await P.page.evaluate(() => { const I = window.__isles; const ks = I.packSpecies.concat([]); return ks; });
  // a knockout-tameable mars species and a hostile one, from the page's own species data
  const pick = await P.page.evaluate((list) => { const out = { ko: null, foe: null }; window.MMCreatures.byBiome('mars').map((d) => d.id).concat(list).forEach((k) => { const d = window.MMCreatures.get(k); if (!d) return; if (!out.ko && d.tame && d.tame.method === 'knockout') out.ko = k; }); const I = window.__isles; I.pause(true); const h = I.hero(); [...new Set(window.MMCreatures.byBiome('mars').map((d) => d.id).concat(list))].forEach((k) => { if (out.foe) return; const u = I.spawn(k, h.tx + 4, h.ty); const c = u && I.creatures().find((q) => q.uid === u); if (c && c.mood === 'hostile') out.foe = k; }); I.clearCreatures(); return out; }, sp);
  if (!pick.ko || !pick.foe) { check('[69 air] mars has a knockout tame and a hostile to test with', false, J({ pick, sp })); await P.ctx.close(); return; }
  await ev(P.page, (I, a) => { eval('(' + a.SET + ')')(I); const h = I.hero(); I.spawn(a.foe, h.tx - 7, h.ty); I.envSet(0, 90); return true; }, { SET: SETUP.toString(), foe: pick.foe });
  await P.page.evaluate((k) => { const I = window.__isles, f = I.foodFor(k); if (f) I.give(f.id, 200); }, pick.ko);
  const t = await ev(P.page, KO_AND_TAME, { sp: pick.ko, air: true, feeds: 60, foe: pick.foe });
  const r = await ev(P.page, (I) => { const g = (I.guard ? I.guard() : { text: "", left: 0 }); I.envSet(0, 5); I.step(0, 0, 0.05); return { g, hint: I.hint(), o2: I.env().o2, foes: I.creatures().filter((c) => c.mood === 'hostile').length }; });
  check('[69 air] mars: the guard line is armed after a real tame', t.tamed && !!r.g.text && r.g.left > 0, J({ t, g: r.g }));
  check('[69 air] ...but with the air low the air hint wins (never replaced)', /air/i.test(r.hint) && r.hint !== r.g.text, J(r));
  const r2 = await ev(P.page, (I) => ({ g: (I.guard ? I.guard() : { text: "", left: 0 }), shown: document.getElementById('hint').textContent }));
  check('[69 air] the air hint is what the #hint chip shows; the guard line only waits under it (armed, not shown)', /air/i.test(r2.shown) && r2.g.left > 0 && !r2.g.shown, J(r2));
  check('[69 air] no page errors, 0 database attempts', P.errors.length === 0 && P.db.attempts() === 0, J([P.errors, P.db.attempts()]));
  await P.ctx.close();
}

// ---------------- [68] Shore first-level floor ----------------
async function openWorld(browser, query) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const db = await blockDb(ctx);
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' }));
  await ctx.addInitScript(() => { if (!sessionStorage.c15w) { sessionStorage.c15w = '1'; localStorage.clear(); } });
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(WORLD + (query || ''));
  await page.waitForFunction(() => { const m = window.__mm; return !!(m && m.world && m.arena.active && m.arena.state === 'play'); }, null, { timeout: 20000 });
  await page.waitForTimeout(300);
  return { ctx, page, errors, db };
}
// Runs inside the page: the hero is untouchable and stands still (no exploration); one shore spawner kill at clock ~1 s, the clock runs
// on (real _update steps) to 15 s, then one more shore kill; then 6 fixed kills (aimed, zone 0) are measured at Lv 2+.
const FLOOR_RUN = `(() => {
  const a = window.__mm.arena, p = a.player; p.iframes = 1e9;
  const tot = () => { let s = a.save.xp; for (let L = 1; L < a.save.level; L++) s += 30 + 20 * (L - 1); return s; };
  const shoreKill = () => { for (let n = 0; n < 900; n++) { const e = a.enemies.find((q) => q.active && q.zid >= 0 && q.zone === 0); if (e) { e.x = p.x + 300; e.y = p.y; const t0 = tot(); a._hitEnemy(e, 1e9); return { t: Math.round(a.clock * 10) / 10, gain: tot() - t0, type: e.type }; } a._update(1 / 30); } return null; };
  const out = { start: { lv: a.save.level, xp: a.save.xp, c0: Math.round(a.clock * 10) / 10 } };
  while (a.clock < 1) a._update(1 / 30);
  out.k1 = shoreKill(); out.after1 = { lv: a.save.level, xp: a.save.xp };
  // clear the field so nothing else is killed while the clock runs to 15 s
  a.enemies.forEach((q) => { if (q.active && q.zid >= 0) { q.x = p.x + 2000; q.y = p.y + 2000; } });
  while (a.clock < 15.2) a._update(1 / 30);
  out.at15 = { lv: a.save.level, xp: a.save.xp, clock: Math.round(a.clock * 10) / 10 };
  const ban = document.getElementById('realm-banner');
  out.k2 = shoreKill(); out.after2 = { lv: a.save.level, xp: a.save.xp, banner: ban ? ban.textContent : '', used: a.lvFloorUsed };
  // reach Lv 2 the ordinary way when the floor is off (more shore kills), then the same fixed kills
  for (let i = 0; i < 20 && a.save.level < 2; i++) shoreKill();
  out.lv2 = { lv: a.save.level };
  out.late = [];
  for (let i = 0; i < 6; i++) { const e = a.spawnEnemy('aimed', p.x + 300, p.y); e.zone = 0; const t0 = tot(); a._hitEnemy(e, 1e9); out.late.push(tot() - t0); }
  out.used = a.lvFloorUsed; out.keys = Object.keys(a.save).sort();
  out.needs = typeof rmXpNeeded === 'function' ? [1, 2, 3, 4, 5, 6].map((L) => rmXpNeeded(L)) : null; // the game's own per-level need
  return out;
})()`;

// a run that levels before 15 s: Shore kills (zone 0) at about 1 s until Lv 2, then 6 more after 15 s; every gain and the final level / xp
const FAST_RUN = `(() => {
  const a = window.__mm.arena, p = a.player; p.iframes = 1e9; const out = { gains: [], c0: Math.round(a.clock * 10) / 10 };
  const tot = () => { let s = a.save.xp; for (let L = 1; L < a.save.level; L++) s += 30 + 20 * (L - 1); return s; };
  while (a.clock < 1) a._update(1 / 30);
  const kill = () => { const e = a.spawnEnemy('spiral', p.x + 300, p.y); e.zone = 0; const t0 = tot(); a._hitEnemy(e, 1e9); out.gains.push(tot() - t0); if (a.save.level === 2 && out.lv2At === undefined) out.lv2At = Math.round(a.clock * 10) / 10; };
  while (a.save.level < 2) { kill(); a._update(1 / 30); } // Shore (zone 0) kills at about 1 s: Lv 2 long before 15 s
  while (a.clock < 16) a._update(1 / 30);
  for (let i = 0; i < 6; i++) kill(); // and more Shore kills after 15 s, at Lv 2
  out.lv = a.save.level; out.xp = a.save.xp; out.used = a.lvFloorUsed; return out;
})()`;

async function id68(browser) {
  const on = await openWorld(browser, '');
  const A = await on.page.evaluate(FLOOR_RUN);
  if (SHOTS) await on.page.screenshot({ path: `${SHOTS}/cyc15-systems-lvfloor-1280x720.jpg`, type: 'jpeg', quality: 75 });
  const off = await openWorld(browser, '&lvfloor=0');
  const B = await off.page.evaluate(FLOOR_RUN);
  check('[68] fresh hero (Lv 1, 0 XP) on both pages', A.start.lv === 1 && A.start.xp === 0 && B.start.lv === 1 && B.start.xp === 0, J([A.start, B.start]));
  check('[68] a Shore kill before 15 s is not touched (same XP with and without, no floor used)', A.k1 && B.k1 && A.k1.t < 15 && A.k1.gain === B.k1.gain && A.k1.gain < 30 && A.after1.lv === 1, J([A.k1, B.k1, A.after1]));
  check('[68] still Lv 1 at 15 s (the slow case the floor is for)', A.at15.lv === 1 && B.at15.lv === 1, J([A.at15, B.at15]));
  check('[68] the first Shore kill after 15 s levels the hero (Level 2 banner, the bar lands on the level: xp 0, floor used once)', A.k2 && A.k2.t >= 15 && A.after2.lv === 2 && A.after2.xp === 0 && /Level 2!/.test(A.after2.banner) && A.after2.used === 1, J([A.k2, A.after2]));
  check('[68] ?lvfloor=0: the same kill gives the old XP and the hero stays Lv 1', B.k2 && B.after2.lv === 1 && B.k2.gain === A.k1.gain && B.after2.used === 0, J([B.k2, B.after2]));
  check('[68] the gift is at most rmXpNeeded(1) - 1 = 29 XP (the floor XP minus the kill\'s own XP)', A.k2.gain - B.k2.gain >= 1 && A.k2.gain - B.k2.gain <= 29, J([A.k2.gain, B.k2.gain]));
  check('[68] per-level XP needs unchanged (Lv 1-6 need 30, 50, 70, 90, 110, 130)', J(A.needs) === '[30,50,70,90,110,130]' && J(A.needs) === J(B.needs), J([A.needs, B.needs]));
  check('[68] Lv 2+ per-kill XP is identical with and without the floor', A.lv2.lv >= 2 && B.lv2.lv >= 2 && J(A.late) === J(B.late) && A.late.every((x) => x > 0), J([A.late, B.late]));
  check('[68] the floor is used once only (later Lv 1 rules never fire again)', A.used === 1 && B.used === 0, J([A.used, B.used]));
  check('[68] no new save key (the realm save has the same key set)', J(A.keys) === J(B.keys), J([A.keys, B.keys]));
  check('[68] no page errors, 0 database attempts', on.errors.length === 0 && off.errors.length === 0 && on.db.attempts() === 0 && off.db.attempts() === 0, J([on.errors, off.errors, on.db.attempts(), off.db.attempts()]));
  await on.ctx.close(); await off.ctx.close();
  const f1 = await openWorld(browser, ''); const FA = await f1.page.evaluate(FAST_RUN); // each run right after its page opens (the live loop runs the clock)
  const f0 = await openWorld(browser, '&lvfloor=0'); const FB = await f0.page.evaluate(FAST_RUN);
  check('[68] a run that levels before 15 s is byte-identical with and without the floor (every gain, level, xp; floor never used)', FA.lv2At < 15 && FA.used === 0 && J(FA.gains) === J(FB.gains) && FA.lv === FB.lv && FA.xp === FB.xp, J([FA, FB]));
  check('[68 fast] no page errors, 0 database attempts', f1.errors.length === 0 && f0.errors.length === 0 && f1.db.attempts() === 0 && f0.db.attempts() === 0, J([f1.errors, f0.errors]));
  await f1.ctx.close(); await f0.ctx.close();
}

(async () => {
  const browser = await chromium.launch();
  try {
    if (want('69')) { await id69(browser); await id69Air(browser); }
    if (want('68')) await id68(browser);
  } catch (e) { check('test ran without throwing', false, e.stack || e.message); }
  await browser.close();
  done();
})();
