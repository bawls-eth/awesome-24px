// NEXT-SLICES-2 slice X5 on the Hearthvale Isles page: MMIsleEnv meters behind their flags.
// 1 tundra (?isle=ice): a calm Warmth meter drains in 90 s out in the cold, warns 10 s before, at 0 the hero walks at x0.8 and never
//   takes damage; hot springs / the camp refill it and a warm cloak doubles it;
// 2 mars: an Air meter lasts 90 s (120 s with an o2_tank), warns 10 s before, at 0 costs 1 HP every 3 s and never takes the last HP;
//   domes / the landing pad refill it; gravity moves the hero at x1.15;
// 3 ?env=0 turns every meter off (and ?oxygen=0 only that one); no meter ever changes inv or the stable; the reef swim rule (X1) holds
//   either way; phone 390x844 shows the meter without h-scroll; 0 console errors, 0 DB requests.
// Run: BASE=http://localhost:8911/game/index.html NODE_PATH=$(npm root -g) node game/tests/isles-env.test.js
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/isles/index.html';
const TOWN = '{"realm":{"level":3},"name":"Bo"}';
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 };
const DESK = { viewport: { width: 1000, height: 700 } };
const SHOTS = process.env.SHOTS || '';
const STABLE = JSON.stringify({ v: 1, n: 1, roster: [{ id: 't1', sp: 'tusktop', nm: 'Tuskie', lv: 3, xp: 0, bond: 2, aff: 0, cos: '', isle: 'jungle', d: '2026-11-01' }], party: ['t1'], mount: 't1' });
const all = [];

async function open(browser, opts, query, seed) {
  const ctx = await browser.newContext(opts);
  const db = await blockDb(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.addInitScript((s) => {
    if (sessionStorage.seeded) return;
    sessionStorage.seeded = '1';
    localStorage.clear();
    Object.keys(s || {}).forEach((k) => localStorage.setItem(k, s[k]));
  }, Object.assign({ 'pixeltown-save-v1': TOWN, 'pixeltown-tames-v1': STABLE }, seed || {}));
  await page.goto(PAGE + '?test=1' + (query || ''));
  await page.waitForFunction(() => window.__isles && window.__isles.world, null, { timeout: 15000 });
  const o = { ctx, page, errors, db }; all.push(o); return o;
}
const ev = (page, fn, arg) => page.evaluate(`window.__isles.wait = window.__isles.wait || ((s) => { let l = s; while (l > 1e-9) { const d = Math.min(30, l); window.__isles.step(0, 0, d); l -= d; } return window.__isles.hero(); }); (${fn.toString()})(window.__isles, ${JSON.stringify(arg === undefined ? null : arg)})`);
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png') }); };
const frames = (page, n) => page.evaluate((k) => new Promise((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

(async () => {
  const browser = await chromium.launch();
  const html = fs.readFileSync(path.join(__dirname, '..', 'games', 'isles', 'index.html'), 'utf8');
  check('0: the page loads mm-isle-env.js (pure) and no network module', /mm-isle-env\.js/.test(html) && !/firebase|net\.js/i.test(html));

  // ---- 1. tundra warmth ----
  const T = await open(browser, DESK, '&isle=ice&seed=7');
  const tw = await ev(T.page, (I) => {
    I.pause(true); I.clearCreatures(); I.god(false);
    const out = { start: I.env(), tames0: localStorage.getItem('pixeltown-tames-v1'), inv0: JSON.stringify(I.inv()) };
    const ex = I.findEnvTile(false), sh = I.findEnvTile(true);
    out.ex = ex; out.sh = sh;
    I.teleport(ex.x, ex.y); I.wait(45); out.half = I.env();
    I.wait(36); out.warn = I.env();
    I.step(0, 0, 10); out.empty = I.env();
    const hp0 = I.hero().hp;
    const a = I.teleport(ex.x, ex.y); I.step(0, 0, 0.2); const b = I.step(1, 0, 0.4);
    out.walk = { scale: b.scale, base: I.moveScaleAt(a.tx, a.ty), terrain: a.terrain };
    I.teleport(ex.x, ex.y); I.wait(60); out.after = I.env(); out.hp = [hp0, I.hero().hp, I.hero().maxHp, I.heroLost()];
    I.teleport(sh.x, sh.y); I.step(0, 0, 20); out.warmed = I.env();
    I.give('warm_cloak', 1); I.teleport(ex.x, ex.y); I.envSet(90, 0); I.step(0, 0, 0.2); out.cloak = I.env();
    out.tames1 = localStorage.getItem('pixeltown-tames-v1'); out.inv1 = I.inv();
    return out;
  });
  check('1: tundra: the Warmth meter is on (full at the start, calm HUD meter, no Air meter)', tw.start.rules.warmth && !tw.start.rules.oxygen && tw.start.hud.box && tw.start.hud.warm === '100%' && tw.start.hud.o2 === null, JSON.stringify(tw.start));
  check('1: tundra: out in the cold it drains in 90 s (half at 45 s, a 10 s warning, empty at 90 s)', !!tw.ex && Math.abs(tw.half.warm.val - 0.5) < 0.02 && tw.half.hud.warm === tw.half.warm.pct + '%' &&
    tw.warn.warm.warn && tw.warn.hud.warmWarn && !tw.warn.warm.empty && tw.empty.warm.empty && /cold/.test(tw.empty.hud.warm), JSON.stringify([tw.half.warm, tw.warn.warm, tw.empty.hud]));
  check('1: tundra: at 0 the hero walks at x0.8 and never takes damage (60 s more out there)', Math.abs(tw.walk.scale / tw.walk.base - 0.8) < 1e-9 && tw.hp[0] === tw.hp[2] && tw.hp[1] === tw.hp[2] && tw.hp[3] === 0 && tw.after.warm.dmg === 0, JSON.stringify({ w: tw.walk, hp: tw.hp }));
  check('1: tundra: a hot spring / the camp refills it, a warm cloak doubles it', !!tw.sh && tw.warmed.sheltered && tw.warmed.warm.val === 1 && !tw.cloak.warm.empty && Math.abs(tw.cloak.warm.val - 0.5) < 0.01 && tw.cloak.warm.max === 180, JSON.stringify([tw.warmed.warm, tw.cloak.warm]));
  check('1: tundra: the cold never touches items or tames', tw.tames1 === tw.tames0 && JSON.stringify(Object.assign({}, tw.inv1, { warm_cloak: undefined })) === JSON.stringify(Object.assign({}, JSON.parse(tw.inv0), { warm_cloak: undefined })), JSON.stringify([tw.inv0, tw.inv1]));

  // ---- 2. mars oxygen + gravity ----
  const M = await open(browser, DESK, '&isle=mars&seed=7');
  const mo = await ev(M.page, (I) => {
    I.pause(true); I.clearCreatures(); I.god(false);
    const out = { start: I.env(), tames0: localStorage.getItem('pixeltown-tames-v1') };
    const ex = I.findEnvTile(false), sh = I.findEnvTile(true);
    out.ex = ex;
    I.teleport(ex.x, ex.y); I.step(0, 0, 0.3);
    const a = I.hero(), b = I.step(1, 0, 0.4); out.walk = { scale: b.scale, base: I.moveScaleAt(a.tx, a.ty) };
    I.teleport(ex.x, ex.y); I.envSet(0, 0); I.wait(79.5); out.before = I.env();
    I.step(0, 0, 2); out.warn = I.env();
    const hp0 = I.hero().hp, lost0 = I.heroLost();
    I.step(0, 0, 8.6); out.empty = I.env(); out.hp9 = I.hero().hp; out.hp0 = hp0;
    I.step(0, 0, 9); out.hp18 = I.hero().hp;
    I.wait(300); out.hpEnd = I.hero().hp; out.dead = I.hero().dead; out.lostHurt = I.heroLost() - lost0; out.envLost = I.env().lost;
    I.teleport(sh.x, sh.y); I.step(0, 0, 30); out.dome = I.env();
    I.give('o2_tank', 1); I.teleport(ex.x, ex.y); I.envSet(0, 100); I.step(0, 0, 0.2); out.tank = I.env();
    out.tames1 = localStorage.getItem('pixeltown-tames-v1'); out.inv = I.inv();
    return out;
  });
  check('2: mars: the Air meter is on (90 s, calm HUD meter) with gravity', mo.start.rules.oxygen && mo.start.rules.gravity && !mo.start.rules.warmth && mo.start.hud.box && /^\d+ s$/.test(mo.start.hud.o2) && mo.start.o2 === null || (mo.start.o2 && mo.start.o2.max === 90), JSON.stringify(mo.start));
  check('2: mars gravity: the hero moves at x1.15', Math.abs(mo.walk.scale / mo.walk.base - 1.15) < 1e-9 && mo.start.grav.move === 1.15 && mo.start.grav.dash === 1.4, JSON.stringify(mo.walk));
  check('2: mars: a 10 s warning before the air runs out', !mo.before.o2.warn && mo.warn.o2.warn && mo.warn.hud.o2Warn && !mo.warn.o2.empty, JSON.stringify([mo.before.o2, mo.warn.o2]));
  check('2: mars: at 0 it costs 1 HP every 3 s (none at the moment it empties, 3 HP over the next 9 s)', mo.empty.o2.empty && mo.hp0 === mo.hp9 && mo.hp9 - mo.hp18 === 3 && mo.empty.hud.o2 === 'empty', JSON.stringify({ h0: mo.hp0, h9: mo.hp9, h18: mo.hp18, o2: mo.empty.o2 }));
  check('2: mars: it never takes the last HP (no knockout), all of it counted as air loss', mo.hpEnd === 1 && !mo.dead && mo.lostHurt === 0 && mo.envLost === mo.hp0 - 1, JSON.stringify({ end: mo.hpEnd, dead: mo.dead, l: mo.lostHurt, e: mo.envLost }));
  check('2: mars: a dome refills the air, an o2_tank makes it last 120 s', mo.dome.sheltered && mo.dome.o2.val === 1 && mo.tank.o2.max === 120 && !mo.tank.o2.empty && mo.tank.o2.left > 19, JSON.stringify([mo.dome.o2, mo.tank.o2]));
  check('2: mars: the air never touches items or tames', mo.tames1 === mo.tames0 && mo.inv.o2_tank === 1, JSON.stringify(mo.inv));

  // ---- 3. kill switches ----
  const Z = await open(browser, DESK, '&isle=mars&seed=7&env=0');
  const z = await ev(Z.page, (I) => {
    I.pause(true); I.clearCreatures(); I.god(false);
    const ex = I.findEnvTile(false); I.teleport(ex.x, ex.y); I.step(0, 0, 0.3);
    const a = I.hero(), b = I.step(1, 0, 0.4);
    I.teleport(ex.x, ex.y); const hp0 = I.hero().hp; I.wait(200);
    return { env: I.env(), scale: b.scale, base: I.moveScaleAt(a.tx, a.ty), hp0, hp1: I.hero().hp, ex };
  });
  check('3: ?env=0 on mars: no meters, no HUD, normal speed, no air loss over 200 s', Object.values(z.env.rules).every((v) => v === false) && !z.env.on && !z.env.hud.box && z.scale === z.base && z.hp1 === z.hp0, JSON.stringify(z));
  const Z2 = await open(browser, DESK, '&isle=ice&seed=7&env=0');
  const z2 = await ev(Z2.page, (I) => { I.pause(true); I.clearCreatures(); I.wait(120); return I.env(); });
  check('3: ?env=0 on the tundra: no Warmth meter', !z2.rules.warmth && !z2.hud.box && z2.warm === null, JSON.stringify(z2));
  const O2 = await open(browser, DESK, '&isle=mars&seed=7&oxygen=0');
  const o2 = await ev(O2.page, (I) => I.env());
  check('3: ?oxygen=0 turns off only the Air meter (gravity stays)', !o2.rules.oxygen && o2.rules.gravity && !o2.hud.box, JSON.stringify(o2));
  const RF = await open(browser, DESK, '&isle=reef&seed=7&env=0');
  const RF2 = await open(browser, DESK, '&isle=reef&seed=7');
  const swim = async (o) => ev(o.page, (I) => { const s = I.findShore('lagoon'); return { rules: I.env().rules, blocked: I.heroSolid(s.x, s.y), deep: I.swimAt(s.x, s.y), box: I.env().hud.box }; });
  const s0 = await swim(RF), s1 = await swim(RF2);
  check('3: the reef swim rule holds with and without ?env=0 (open water needs a swim mount); no meters on the reef', s1.rules.swim && !s0.rules.swim && s0.blocked && s1.blocked && s0.deep && s1.deep && !s0.box && !s1.box, JSON.stringify([s0, s1]));
  const J = await open(browser, DESK, '&isle=jungle&seed=7');
  const j = await ev(J.page, (I) => I.env());
  check('3: the jungle has no environment meter', !j.on && !j.hud.box && !j.rules.warmth && !j.rules.oxygen, JSON.stringify(j));

  // ---- phone ----
  const P = await open(browser, PHONE, '&isle=mars&seed=7');
  await ev(P.page, (I) => { I.pause(true); I.clearCreatures(); I.god(true); const ex = I.findEnvTile(false); I.teleport(ex.x, ex.y); I.envSet(0, 82); I.step(0, 0, 0.3); I.pause(false); I.pause(true); return true; });
  await frames(P.page, 20);
  const lay = await P.page.evaluate(() => { const e = document.getElementById('env-o2'), q = e.getBoundingClientRect(); return { vis: !e.hidden && q.width > 0, r: q.right, warn: e.classList.contains('warn'), hs: document.documentElement.scrollWidth > innerWidth, txt: e.textContent.replace(/\s+/g, ' ').trim() }; });
  check('phone: the Air meter shows inside the HUD at 390x844 (warning colour), no h-scroll', lay.vis && lay.r <= 390 && lay.warn && !lay.hs && /^Air \d+ s$/.test(lay.txt), JSON.stringify(lay));
  await shot(P.page, 'isles-env-phone');

  check('all: 0 console errors and 0 DB requests', all.every((o) => o.errors.length === 0 && o.db.count() === 0), all.map((o) => o.errors.join(' | ')).filter(Boolean).join(' / '));
  for (const o of all) await o.ctx.close().catch(() => {});
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
