// G8 (GEAR-DROPS-BUILD-PLAN): the stats pipeline for tiered gear. _calcStats adds the tier weapon bonus (MMGear.weaponBonus), armor HP / guard / speed /
// resists (MMGear.armorStats), T7+ affixes (MMGearAffix, power cap), the pure `noGear` / `eqOverride` variants for the compare UI and the new keys
// (crit, splash, status, resist, leech, regen); _calcGuard adds armor guard; applyStatus shortens hostile statuses on the player by its resist;
// leech and regen tick. Duels keep RT_DUEL_* stats with gear on; ?gear=0 turns all of it off. Offline: WebSockets closed, no chat, no Firebase writes.
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/gear-stats-pipeline.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const MAZE = ORIGIN + '/game/games/mad-maze/index.html?test=1&offline=1';
const SAVE = 'pixeltown-save-v1', MM = 'pixeltown-mm-v1', ACTIVE = 'pixeltown-mm-active-v1';
const hero = (id, cls, level) => ({ id, name: cls, cls, level, xp: 0, fame: 0, bonus: 0, mode: 'classic', items: [] });
const prof = (heroes) => ({ v: 1, heroes, stash: new Array(16).fill(null), fame: 0, mode: 'classic', hall: [], migratedFrom: null });
const realm = (level, items) => ({ shards: 0, bestWave: 0, kills: 0, deaths: 0, kb: { spiral: 0, aimed: 0, ring: 0, drifter: 0, boss: 0 }, bossBestT: 0, level, xp: 0, items, nextUid: 100, eq: {} });

async function open(browser, o) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' }));
  await ctx.route('**/hub/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>hub</title>hub' }));
  await ctx.routeWebSocket(/.*/, (ws) => ws.close()); // never reach the live DB
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate(([k1, p, k2, a, k3, s]) => { localStorage.setItem(k1, JSON.stringify(p)); localStorage.setItem(k2, a); localStorage.setItem(k3, JSON.stringify({ realm: s })); },
    [MM, prof([hero('h-1', o.cls, o.heroLevel || 1)]), ACTIVE, JSON.stringify({ v: 1, heroId: 'h-1' }), SAVE, realm(o.level || 20, o.items || [])]);
  errors.length = 0;
  await page.goto(MAZE + (o.query || ''));
  await page.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena.active, null, { timeout: 15000 });
  await page.evaluate(() => { const a = window.__mm.arena; a.state = 'play'; a.setPaused(false); a.eBullets.forEach((b) => { b.active = false; }); a.enemies.forEach((e) => { e.active = false; }); });
  return { ctx, page, errors };
}

(async () => {
  const browser = await chromium.launch();
  const errs = [];

  // ---- bruiser (heavy), level 20: tier bonus, armor guard, eqOverride / noGear purity, duel stats ----
  { const A = await open(browser, { cls: 'bruiser', items: [{ n: 1, id: 'sparkwand', r: 3, t: 12 }, { n: 2, id: 'sparkwand', r: 0 }, { n: 3, id: 'arm_heavy_paladin', r: 0, t: 10 }, { n: 4, id: 'arm_light_shade', r: 0, t: 10 }] });
    const r = await A.page.evaluate(() => {
      const a = window.__mm.arena;
      const base = a._calcStats({ noGear: true }), t12 = a._calcStats({ eqOverride: { weapon: 1 } }), t0 = a._calcStats({ eqOverride: { weapon: 2 } });
      const mult = base.dmg / RM_PLAYER.dmg; // class / unlock / world multipliers the page applies to every point of damage
      return { d12: t12.dmg - base.dmg, d0: t0.dmg - base.dmg, mult, wb: MMGear.weaponBonus(0.5, 12, 3) };
    });
    check('tier bonus: a T12 Epic Spark Wand raises dmg by 3.57 x the class/world multipliers (T0 Spark Wand: 0.5 x them)', Math.abs(r.wb - 3.57) < 1e-9 && Math.abs(r.d12 - 3.57 * r.mult) < 0.01 && Math.abs(r.d0 - 0.5 * r.mult) < 0.01, JSON.stringify(r));
    const g = await A.page.evaluate(() => {
      const a = window.__mm.arena; const g0 = a._guarded(23);
      const ok = a.equip(3); const gh = a.stats.guard, dh = a._guarded(23);
      a.player.hp = a.stats.maxHp; a.player.iframes = 0; a.shield.hits = 0; const hp0 = a.player.hp; a._hitPlayer(a._guarded(23)); const took = hp0 - a.player.hp;
      const light = a.equip(4); // a light armor on a bruiser: refused
      a.applyStatus('player', 'armorBroken', { sec: 5 }); const broken = a._guarded(23); a.player.status = null; a.player._stm = null; a._calcStats();
      return { g0, ok, gh, dh, took, light, broken, maxHp: a.stats.maxHp, base: a._calcStats({ noGear: true }).maxHp };
    });
    check('armor guard: heavy T10 (Paladin Breastplate) gives guard 5, so a 23 bolt does 18 (and really takes 18 HP); none equipped: 23', g.g0 === 23 && g.ok && g.gh === 5 && g.dh === 18 && g.took === 18, JSON.stringify(g));
    check('armor: +HP from the piece (T10 heavy Common = 60 x class HP mult), light armor refused on a bruiser, armorBroken still zeroes guard', g.maxHp > g.base && g.light === false && g.broken === 23, JSON.stringify(g));
    const pure = await A.page.evaluate(() => {
      const a = window.__mm.arena; const before = JSON.stringify(a.save); const stBefore = a.stats;
      const o = a._calcStats({ eqOverride: { armor: 0, weapon: 1 } }); const n = a._calcStats({ noGear: true });
      return { same: JSON.stringify(a.save) === before, statsSame: a.stats === stBefore, oGuard: o.guard, nGuard: n.guard, curGuard: a.stats.guard, oDmg: o.dmg > n.dmg };
    });
    check('eqOverride / noGear are pure: arena.save stays byte-identical and this.stats is untouched; the override takes the armor off and puts the T12 wand on', pure.same && pure.statsSame && pure.oGuard === 0 && pure.nGuard === 0 && pure.curGuard === 5 && pure.oDmg, JSON.stringify(pure));
    await A.page.addScriptTag({ url: ORIGIN + '/game/realm-team.js' }); // duels live on the town page (realm-team.js: RT_DUEL_*); definitions only, nothing connects
    const duel = await A.page.evaluate(() => {
      const a = window.__mm.arena; a.equip(1); const t = a.team; a.team = { isPvp: true };
      const s = a._calcStats(); const out = { maxHp: s.maxHp, dmg: s.dmg, rate: s.rate, guard: s.guard || 0, res: a._resistFor('slowed'), want: [RT_DUEL_HP, 1, RT_DUEL_RATE] };
      a.team = t; a._calcStats(); return out;
    });
    check('duel: with T12 wand + heavy armor equipped the stats are exactly RT_DUEL_* (no tier, no guard, no resist)', duel.maxHp === duel.want[0] && duel.dmg === duel.want[1] && duel.rate === duel.want[2] && duel.guard === 0 && duel.res === 0, JSON.stringify(duel));
    errs.push(...A.errors); await A.ctx.close(); }

  // ---- ranger (light) level 20: resist, light T10 guard ----
  { const A = await open(browser, { cls: 'ranger', items: [{ n: 1, id: 'arm_light_warden', r: 0, t: 6 }, { n: 2, id: 'arm_light_shade', r: 0, t: 10 }] });
    const r = await A.page.evaluate(() => {
      const a = window.__mm.arena; const left = (id) => (a.statusOf('player').find((x) => x.id === id) || {}).left;
      a.applyStatus('player', 'slowed', { sec: 2 }); const s0 = left('slowed'); a.player.status = null; a.player._stm = null;
      a.equip(1); a.applyStatus('player', 'slowed', { sec: 2 }); const s1 = left('slowed');
      a.applyStatus('player', 'bleed', { sec: 2 }); const b1 = left('bleed'); a.player.status = null; a.player._stm = null; a._calcStats();
      a.equip(2); return { s0, s1, b1, g: a._guarded(23), speed: a.stats.speed > a._calcStats({ noGear: true }).speed };
    });
    check('resist: light T6 armor turns a 2 s slow into 1.8 s (10%); no armor 2 s; bleed (not a light resist) stays 2 s', Math.abs(r.s0 - 2) < 0.02 && Math.abs(r.s1 - 1.8) < 0.02 && Math.abs(r.b1 - 2) < 0.02, JSON.stringify(r));
    check('light T10 (guard 4): a 23 bolt does 19; light armor adds speed', r.g === 19 && r.speed, JSON.stringify(r));
    errs.push(...A.errors); await A.ctx.close(); }

  // ---- affixes: power cap, leech (<= 3 HP/s), regen after 3 s, level gate ----
  { const A = await open(browser, { cls: 'bruiser', level: 20 });
    const r = await A.page.evaluate(() => {
      const a = window.__mm.arena; const find = (id, slot, t, want) => { for (let s = 1; s < 5000; s++) { const l = MMGearAffix.roll(id, slot, t, 3, s); if (l.some((x) => x.id === want)) return { a: s, l }; } return null; };
      let capOk = true; for (let s = 1; s <= 400; s++) for (const t of [7, 9, 11]) if (MMGearAffix.value(MMGearAffix.roll('sparkwand', 'weapon', t, 3, s)) > MMGearAffix.cap(t) + 1e-9) capOk = false;
      const keen = find('sparkwand', 'weapon', 8, 'keen'), leech = find('sparkwand', 'weapon', 10, 'leech'), mend = find('arm_heavy_frost', 'armor', 8, 'mend');
      a.save.items = [{ n: 1, id: 'sparkwand', r: 3, t: 8, a: keen.a }, { n: 2, id: 'sparkwand', r: 3, t: 10, a: leech.a }, { n: 3, id: 'arm_heavy_frost', r: 3, t: 8, a: mend.a }]; a.save.eq = {};
      a.equip(1); const crit = a.stats.crit, keenV = keen.l.find((x) => x.id === 'keen').v, capped = MMGearAffix.value(keen.l) <= 1.06 + 1e-9;
      // leech: a big hit banks at most 3 HP, paid out at <= 3 HP/s
      a.equip(2); const lv = a.stats.leech; a.player.hp = 10; a._leechCap = 0;
      a._leechAdd(500); a._gearTick(0.5); const h1 = a.player.hp; a._leechAdd(500); a._gearTick(0.5); const h2 = a.player.hp; a._leechAdd(500); for (let i = 0; i < 10; i++) a._gearTick(0.1); const h3 = a.player.hp;
      // the real bolt path banks leech from your own bolt
      a._leechAcc = 0; const e = a.spawnEnemy('spiral', a.player.x + 40, a.player.y); e.hp = e.maxHp = 1000; e.cd = 999;
      const b = a.firePlayerBulletFrom(a.player.x, a.player.y, 0, 50, 0); let banked = 0; for (let i = 0; i < 20 && b.active; i++) { a._updateBullets(0.016); banked = Math.max(banked, a._leechAcc || 0); }
      // regen (mend) on armor: nothing in the first 3 s after a hit, then regen HP/s
      a.equip(2); a.equip(3); a._leechAcc = 0; const rg = a.stats.regen; a.player.hp = 10; a._gHurtT = a._stT; a._regenAcc = 0; // the leech wand off: only regen heals now
      for (let i = 0; i < 29; i++) { a._stT += 0.1; a._gearTick(0.1); } const r1 = a.player.hp;
      for (let i = 0; i < 40; i++) { a._stT += 0.1; a._gearTick(0.1); } const r2 = a.player.hp;
      return { capOk, crit, keenV, capped, lv, h1, h2, h3, banked, bankWant: 50 * lv, rg, r1, r2 };
    });
    check('affix power cap holds for T7 / T9 / T11 weapon rolls (400 seeds each, r3)', r.capOk);
    check('a T8 `keen` affix (capped roll) becomes stats.crit', r.capped && r.crit > 0 && Math.abs(r.crit - r.keenV) < 1e-9, JSON.stringify(r));
    check('leech: a T10 `leech` wand sets stats.leech; 500-damage hits heal at most 3 HP per second (first 0.5 s: 1, first 1 s: 3, the next 1 s: 3)', r.lv >= 0.015 && r.h1 === 11 && r.h2 === 13 && r.h3 === 16, JSON.stringify(r));
    check('leech: your own bolt hitting an enemy banks damage x leech', Math.abs(r.banked - r.bankWant) < 1e-6, JSON.stringify(r));
    check('regen: a `mend` armor heals nothing for 3 s after a hit, then about regen HP/s', r.rg > 0 && r.r1 === 10 && r.r2 - r.r1 >= Math.floor(r.rg * 3.5) && r.r2 - r.r1 <= Math.ceil(r.rg * 4.1), JSON.stringify(r));
    errs.push(...A.errors); await A.ctx.close(); }

  // ---- level gate: hero level 6 on a level-1 account (T4 ok, T5 "Lv 8"); account level counts when higher (owner decision) ----
  { const A = await open(browser, { cls: 'bruiser', heroLevel: 6, level: 1, items: [{ n: 1, id: 'sparkwand', r: 0, t: 4 }, { n: 2, id: 'sparkwand', r: 0, t: 5 }, { n: 3, id: 'arm_heavy_warden', r: 0, t: 4 }] });
    const r = await A.page.evaluate(() => {
      const a = window.__mm.arena; const gl = a.heroGateLevel();
      const t4 = a.equip(1); const t5 = a.equip(2); const arm = a.equip(3);
      a.setPaused(true); const lock = document.querySelector('#realm-bp-list li[data-uid="2"] button[data-gear-lock="level"]');
      const lockT = lock ? lock.textContent : ''; a.setPaused(false);
      a.save.level = 15; const gl2 = a.heroGateLevel(); a.save.level = 1;
      return { gl, t4, t5, arm, lockT, gl2, eqw: a.save.eq.weapon };
    });
    check('level gate: heroGateLevel() = hero level 6; T4 (gate 6) and T4 heavy armor equip, T5 (gate 8) is refused with "🔒 Lv 8"', r.gl === 6 && r.t4 && r.arm && r.t5 === false && r.eqw === 1 && /Lv 8/.test(r.lockT), JSON.stringify(r));
    check('level gate falls back to the account level when it is higher (heroes do not level up yet): 15', r.gl2 === 15, JSON.stringify(r));
    errs.push(...A.errors); await A.ctx.close(); }

  // ---- ?gear=0: the T12 wand is a classic Epic Spark Wand, armor inert ----
  { const A = await open(browser, { cls: 'bruiser', query: '&gear=0', items: [{ n: 1, id: 'sparkwand', r: 3, t: 12 }, { n: 2, id: 'arm_heavy_paladin', r: 0, t: 10 }] });
    const r = await A.page.evaluate(() => {
      const a = window.__mm.arena; const base = a._calcStats({ noGear: true });
      a.equip(1); const arm = a.equip(2);
      return { d: a.stats.dmg - base.dmg, mult: base.dmg / RM_PLAYER.dmg, arm, guard: a.stats.guard, crit: a.stats.crit, leech: a.stats.leech, res: a._resistFor('slowed') };
    });
    check('?gear=0: a T12 Epic wand adds the classic 0.5 x 3.6 = 1.8 (x mults), armor cannot be equipped, no guard / crit / leech / resist', Math.abs(r.d - 1.8 * r.mult) < 0.01 && r.arm === false && r.guard === 0 && r.crit === 0 && r.leech === 0 && r.res === 0, JSON.stringify(r));
    errs.push(...A.errors); await A.ctx.close(); }

  check('no console errors', errs.length === 0, errs.join(' | '));
  await browser.close();
  done();
})();
