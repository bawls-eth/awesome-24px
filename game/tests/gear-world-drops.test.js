// G9: tiered gear drops in the Realm World. Off by default (GEAR_DEFAULT_ON = false); ?gear=1 (or save.gearOn) turns them on, ?gear=0 is always off.
// Per-kill, per-player seeded rolls through MMGearDrops.rollGear; visible pity `gp` saved additively in pixeltown-realm-v1 (garbage -> defaults).
// Offline (blockDb), deterministic seed, phone 390x844, no console errors.
// Run: BASE=http://localhost:8702/game/index.html NODE_PATH=$(npm root -g) node game/tests/gear-world-drops.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const URL = (q) => ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&seed=12345' + (q || '');
const SAVE = { realm: { level: 6, xp: 0, shards: 50, bestWave: 2, items: [{ n: 1, id: 'sparkwand', r: 0 }], nextUid: 2, eq: { weapon: 1 } } };
const KEY = 'pixeltown-realm-v1';
const BOUNDS = { 0: [1, 3], 1: [3, 6], 2: [5, 9], 3: [7, 10] };

async function open(browser, url, o) {
  o = o || {};
  const ctx = await browser.newContext(o.phone ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } : { viewport: { width: 1000, height: 700 } });
  await blockDb(ctx);
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html>town' }));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate((a) => { localStorage.clear(); localStorage.setItem('pixeltown-save-v1', a.v); localStorage.setItem('mm-aim-assist', '0'); if (a.realm) localStorage.setItem(a.key, a.realm); }, { v: JSON.stringify(SAVE), realm: o.realm || null, key: KEY });
  await page.goto(url);
  await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 15000 });
  await page.evaluate(() => { const a = window.__mm.arena; a.player.iframes = 1e9; a._hitPlayer = () => {}; a.enemies.forEach((e) => { e.active = false; }); });
  return { ctx, page, errors };
}
const W = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__mm.arena, window.__mm.world, ${JSON.stringify(arg)})`);
// n kills of one kind with dropAll on; returns the flat list of recap entries
const series = (page, a) => W(page, (ar, w, q) => {
  w.setDropAll(true); const out = [];
  for (let i = 0; i < q.n; i++) { ar.bags.forEach((b) => { b.active = false; }); const got = w.testDrop(q.info, q.tag); if (got) got.items.forEach((it) => out.push(it)); }
  w.setDropAll(false); return out;
}, a);
const raw = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
const sig = (l) => JSON.stringify(l.map((i) => [i.id, i.r, i.t || 0, i.a || 0]));

(async () => {
  const browser = await chromium.launch();

  // ---- default: no flag behaves exactly as today ----
  let o = await open(browser, URL(''));
  const defCfg = await W(o.page, (a, w) => ({ on: w.gearOn, def: w.gearDefaultOn, pity: w.gearPity() }));
  const defItems = await series(o.page, { n: 25, info: { zone: 3, tier: 3, src: 'mob' }, tag: 'g1' });
  const defRaw = await raw(o.page);
  check('default: gear drops are off (GEAR_DEFAULT_ON = false)', defCfg.on === false && defCfg.def === false && defCfg.pity.on === false);
  check('default: 25 kills drop only classic items (no t, no tier name)', defItems.length > 0 && defItems.every((i) => i.t === undefined && !/^T\d+ /.test(i.name)), defItems.length + ' items');
  check('default: no gp is written to the save', !defRaw || defRaw.gp === undefined);
  check('default: no console errors', o.errors.length === 0, o.errors.join(' | '));
  await o.ctx.close();

  // ---- ?gear=0 always off, even with the save flag ----
  o = await open(browser, URL('&gear=0'), { realm: JSON.stringify({ gearOn: true }) });
  const off = await series(o.page, { n: 15, info: { zone: 3, tier: 3, src: 'mob' }, tag: 'g1' });
  const offOn = await W(o.page, (a, w) => w.gearOn);
  check('?gear=0 is always off (even with save.gearOn)', offOn === false && off.length > 0 && off.every((i) => i.t === undefined));
  await o.ctx.close();

  // ---- save flag turns it on ----
  o = await open(browser, URL(''), { realm: JSON.stringify({ gearOn: true }) });
  check('save.gearOn enables gear drops', (await W(o.page, (a, w) => w.gearOn)) === true);
  await o.ctx.close();

  // ---- ?gear=1: tiers within the table bounds per zone ----
  o = await open(browser, URL('&gear=1'));
  check('?gear=1 turns gear drops on', (await W(o.page, (a, w) => w.gearOn)) === true);
  for (let z = 0; z <= 3; z++) {
    const it = await series(o.page, { n: 40, info: { zone: z, tier: z, src: 'mob' }, tag: 'z' + z });
    const tiered = it.filter((i) => i.t !== undefined);
    const ts = tiered.map((i) => i.t);
    const [lo, hi] = BOUNDS[z];
    check(`zone ${z} kills roll tiers inside T${lo}-T${hi}`, tiered.length > 10 && ts.every((t) => t >= lo && t <= hi), 'n=' + tiered.length + ' min/max ' + Math.min(...ts) + '/' + Math.max(...ts));
    if (z === 3) check('tiered names carry the tier badge text ("T7 ...")', tiered.every((i) => new RegExp('^T' + i.t + ' ').test(i.name) && i.tierLabel === 'T' + i.t), tiered[0] && tiered[0].name);
  }
  // ---- deterministic: the same kill sequence gives the same items on a fresh load ----
  const seqA = await series(o.page, { n: 12, info: { zone: 2, tier: 2, src: 'mob' }, tag: 'det' });
  await o.ctx.close();
  o = await open(browser, URL('&gear=1'));
  for (let z = 0; z <= 3; z++) await series(o.page, { n: 40, info: { zone: z, tier: z, src: 'mob' }, tag: 'z' + z });
  const seqB = await series(o.page, { n: 12, info: { zone: 2, tier: 2, src: 'mob' }, tag: 'det' });
  check('same seed + same kills = same items across reloads', sig(seqA) === sig(seqB) && seqA.length > 0, seqA.length + ' items');

  // ---- per-player independence (same tag, same kill numbers, different seat id) ----
  const pl = async (id) => { await W(o.page, (a, w, i) => { w.setGearPlayer(i); }, id); return series(o.page, { n: 30, info: { zone: 3, tier: 3, src: 'mob' }, tag: 'pp' }); };
  const pA = await pl('seatA');
  await o.ctx.close();
  o = await open(browser, URL('&gear=1'));
  for (let z = 0; z <= 3; z++) await series(o.page, { n: 40, info: { zone: z, tier: z, src: 'mob' }, tag: 'z' + z });
  await series(o.page, { n: 12, info: { zone: 2, tier: 2, src: 'mob' }, tag: 'det' });
  const pB = await pl('seatB');
  check('two players roll independent streams (different drops for the same seed and kills)', pA.length > 0 && sig(pA) !== sig(pB));
  await o.ctx.close();

  // ---- z3 boss series reaches the pity guarantee in <= 60 kills; T11-12 are flagged soulbound ----
  o = await open(browser, URL('&gear=1'));
  const boss = { zone: 3, tier: 3, boss: true, src: 'boss', bossId: 'dread_knight' };
  const pre = await W(o.page, (a, w) => w.gearPity());
  check('Boss luck text starts at +0% / 60 kills', pre.text === 'Boss luck: +0% (T12 guaranteed in 60 kills)', pre.text);
  let got12 = 0; const ents = [];
  for (let n = 0; n < 70 && !got12; n++) { const it = await series(o.page, { n: 1, info: boss, tag: 'bs' }); it.forEach((i) => ents.push(i)); if (it.some((i) => i.t === 12)) got12 = n + 1; }
  const post = await W(o.page, (a, w) => w.gearPity());
  const sv = await raw(o.page);
  check('z3 boss series reaches T12 within 60 kills (pity)', got12 > 0 && got12 <= 60, 'kills ' + got12);
  check('pity counter resets after the T12 and the save holds a valid gp', post.b === 0 && (!sv || sv.gp === undefined || (sv.gp.b === 0 && Number.isInteger(sv.gp.d))), JSON.stringify(sv && sv.gp));
  check('T11-12 drops are flagged soulbound, lower tiers are not', ents.some((i) => i.t >= 11) && ents.filter((i) => i.t >= 11).every((i) => i.soulbound === true) && ents.filter((i) => i.t && i.t < 11).every((i) => !i.soulbound));
  await o.ctx.close();

  // ---- a forced drop at gp.b = 60 ----
  o = await open(browser, URL('&gear=1'), { realm: JSON.stringify({ gp: { b: 60, d: 0 } }) });
  const f = await series(o.page, { n: 1, info: boss, tag: 'bs' });
  const fp = await W(o.page, (a, w) => w.gearPity());
  check('gp.b = 60: the next z3 boss drop is T12 and b resets', f.some((i) => i.t === 12) && fp.b === 0, JSON.stringify(f.map((i) => i.t)));
  await o.ctx.close();

  // ---- corrupt gp recovers ----
  for (const bad of [{ gp: 'junk' }, { gp: { b: 'x', d: -5 } }, { gp: [1, 2] }, { gp: { b: 1e12, d: 'q' } }]) {
    o = await open(browser, URL('&gear=1'), { realm: JSON.stringify(bad) });
    const p = await W(o.page, (a, w) => w.gearPity());
    const ok = bad.gp && bad.gp.b === 1e12 ? p.b === 9999 && p.d === 0 : p.b === 0 && p.d === 0;
    check('corrupt gp ' + JSON.stringify(bad.gp) + ' recovers to defaults', ok, JSON.stringify([p.b, p.d]));
    await o.ctx.close();
  }
  o = await open(browser, URL('&gear=1'), { realm: '{not json' });
  check('corrupt save string recovers (gp 0/0, drops still work)', (await W(o.page, (a, w) => w.gearPity().b)) === 0 && (await series(o.page, { n: 3, info: { zone: 1, tier: 1, src: 'mob' }, tag: 'c' })).length > 0);
  await o.ctx.close();

  // ---- phone ----
  o = await open(browser, URL('&gear=1'), { phone: true });
  await series(o.page, { n: 5, info: { zone: 3, tier: 3, src: 'mob' }, tag: 'ph' });
  const dims = await o.page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  check('phone 390x844: no horizontal scroll with gear drops on', dims.sw <= dims.cw, JSON.stringify(dims));
  check('phone: no console errors', o.errors.length === 0, o.errors.join(' | '));
  await o.ctx.close();

  await browser.close();
  done();
})();
