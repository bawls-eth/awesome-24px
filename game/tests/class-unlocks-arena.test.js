// S12 passives and items (CLASS-WEAPON-BUILD-PLAN 'Wave 2c'): unlock-tree mods at the ACTIVE hero's level, Nova II / Dash II,
// the 26 wpn_ items as real equippable weapons, styled weapon drops (70% family) and the family shop stock at sell x 8.
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/class-unlocks-arena.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const MAZE = ORIGIN + '/game/games/mad-maze/index.html?test=1&offline=1';
const MM = 'pixeltown-mm-v1', ACTIVE = 'pixeltown-mm-active-v1', SAVE = 'pixeltown-save-v1';
const hero = (id, cls, level) => ({ id, name: cls, cls, level, xp: 0, fame: 0, bonus: 0, mode: 'classic', items: [] });
const prof = (heroes) => ({ v: 1, heroes, stash: new Array(16).fill(null), fame: 0, mode: 'classic', hall: [], migratedFrom: null });

async function open(browser, heroes, activeId, realm, query, opts) {
  const ctx = await browser.newContext(opts || { viewport: { width: 1000, height: 700 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate(([k1, p, k2, a, k3, s]) => { localStorage.clear(); localStorage.setItem(k1, JSON.stringify(p)); localStorage.setItem(k2, a); if (s) localStorage.setItem(k3, s); },
    [MM, prof(heroes), ACTIVE, JSON.stringify({ v: 1, heroId: activeId }), SAVE, realm ? JSON.stringify({ realm }) : null]);
  errors.length = 0;
  await page.goto(MAZE + (query || ''));
  await page.waitForFunction(() => window.__mm && window.__mm.arena);
  return { ctx, page, errors };
}
// Set the active hero's level in the profile and let the arena re-read it (what a hero switch does).
const setHeroLevel = (page, id, lv) => page.evaluate(([k, hid, l]) => {
  const p = JSON.parse(localStorage.getItem(k)); p.heroes.find((h) => h.id === hid).level = l; localStorage.setItem(k, JSON.stringify(p));
  const a = window.__mm.arena; a.refreshHeroLevel(); return { lv: a.heroLevel(), rate: a.stats.rate, dmg: a.stats.dmg, hp: a.stats.maxHp };
}, [MM, id, lv]);
const quiet = (page) => page.evaluate(() => {
  const a = window.__mm.arena; a.state = 'play'; a.run.wave = 0; a.paused = false; a.down = false;
  [a.enemies, a.eBullets, a.pBullets, a.bags].forEach((pool) => pool.forEach((o) => { o.active = false; }));
  a.player.x = 400; a.player.y = 350; a.player.aim = 0; a.abilityCd = [0, 0, 0, 0]; return true;
});
const nova = (page) => page.evaluate(() => { const a = window.__mm.arena; a.pBullets.forEach((b) => { b.active = false; }); a.abilityCd[1] = 0; const ok = a.cast(1); return { ok, n: a.pBullets.filter((b) => b.active).length }; });
const dash = (page) => page.evaluate(() => { const a = window.__mm.arena; a.abilityCd[0] = 0; const ok = a.cast(0); return { ok, cd: a.abilityCd[0] }; });

(async () => {
  const browser = await chromium.launch();
  const errs = [];
  const ACC = { v: 1, level: 15, xp: 0, shards: 5000, bestWave: 6, items: [], nextUid: 1, eq: {} }; // account level 15: every ability slot open

  // ---- (1)(2) passives follow the HERO's level, not the account level ----
  const A = await open(browser, [hero('h-rogue', 'rogue', 3), hero('h-ranger', 'ranger', 3)], 'h-rogue', ACC);
  const a3 = await A.page.evaluate(() => { const a = window.__mm.arena; return { lv: a.heroLevel(), acc: a.save.level, cls: a.heroClass(), has4: MMUnlocks.isUnlocked('rogue', 'rogue_4', a.heroLevel()), rate: a.stats.rate, mul: a._unl() ? a._unl().mul : null }; });
  check('a L3 rogue hero on a L15 account reads hero level 3', a3.lv === 3 && a3.acc === 15 && a3.cls === 'rogue', JSON.stringify(a3));
  check('a L3 rogue lacks rogue_4 (no rate mod)', a3.has4 === false && a3.mul && a3.mul.rate === undefined, JSON.stringify(a3));
  const a4 = await setHeroLevel(A.page, 'h-rogue', 4);
  check('at L4 Quick Hands makes the rate x1.04', a4.lv === 4 && Math.abs(a4.rate / a3.rate - 1.04) < 1e-9, JSON.stringify([a3.rate, a4.rate]));
  check('the L4 node leaves damage and hp alone', await A.page.evaluate(() => { const a = window.__mm.arena; return a._unl().mul.dmg === undefined && a._unl().mul.hp === undefined; }));

  // ---- (3) Nova II at L11, Dash II at L16 ----
  await quiet(A.page);
  await setHeroLevel(A.page, 'h-rogue', 10);
  const n10 = await nova(A.page);
  await setHeroLevel(A.page, 'h-rogue', 11);
  const n11 = await nova(A.page);
  check('a L10 Nova fires 16 bolts', n10.ok && n10.n === 16, JSON.stringify(n10));
  check('a L11 Nova (Nova II) fires 20 bolts', n11.ok && n11.n === 20, JSON.stringify(n11));
  await setHeroLevel(A.page, 'h-rogue', 15); await quiet(A.page);
  const d15 = await dash(A.page);
  await setHeroLevel(A.page, 'h-rogue', 16);
  const d16 = await dash(A.page);
  check('Dash cooldown is 3 s before L16 and 2.5 s with Dash II', d15.ok && d15.cd === 3 && d16.ok && d16.cd === 2.5, JSON.stringify([d15, d16]));

  // ---- (4) the shop lists the family styles at sell x 8 (never Epic) ----
  const shop = await A.page.evaluate(() => {
    const a = window.__mm.arena; const st = a.shopStock(); const w = st.filter((o) => /^wpn_/.test(o.id));
    return { w, fam: w.every((o) => RM_ITEM_BY_ID[o.id].family === 'dagger'), ids: [...new Set(w.map((o) => o.id))].sort(), base: st.filter((o) => !/^wpn_/.test(o.id)).length,
      price: w.every((o) => o.price === RM_RARITIES[o.r].sell * 8 && o.price === MMWeaponItems.shopPrice(o.r)), epic: st.some((o) => o.r === 3) };
  });
  check('the rogue shop lists both dagger styles', JSON.stringify(shop.ids) === JSON.stringify(['wpn_dagger_fan', 'wpn_dagger_venom']) && shop.fam, JSON.stringify(shop.ids));
  check('styled weapons cost sell x 8 at every unlocked rarity, never Epic', shop.price && shop.w.length === 6 && !shop.epic, JSON.stringify(shop.w));
  check('the classic stock is still all 7 items x 3 rarities', shop.base === 21, String(shop.base));
  const bought = await A.page.evaluate(() => { const a = window.__mm.arena; const s0 = a.save.shards; const ok = a.buy('wpn_dagger_fan', 1); return { ok, paid: s0 - a.save.shards, it: a.save.items[a.save.items.length - 1] }; });
  check('buying an Uncommon Dagger Fan costs 56 shards and lands in the backpack', bought.ok && bought.paid === 56 && bought.it.id === 'wpn_dagger_fan' && bought.it.r === 1, JSON.stringify(bought));

  // ---- (5) a wpn_ item equips and fires its style ----
  await quiet(A.page);
  const fire = await A.page.evaluate(() => {
    const a = window.__mm.arena; const it = a.save.items.find((x) => x.id === 'wpn_dagger_fan');
    const d0 = a.stats.dmg; const ok = a.equip(it.n);
    a.pBullets.forEach((b) => { b.active = false; }); a._firePlayerVolley(0);
    const live = a.pBullets.filter((b) => b.active);
    return { ok, w: a.weapon ? a.weapon.id : null, r: a.weapon ? a.weapon.rarity : -1, n: live.length, styled: live.every((b) => !!b.ws), dd: Math.round((a.stats.dmg - d0) * 1000) / 1000 };
  });
  check('equipping the Dagger Fan sets its style at its rarity', fire.ok && fire.w === 'dagger_fan' && fire.r === 1, JSON.stringify(fire));
  check('the equipped Dagger Fan fires its 3-blade styled fan', fire.n === 3 && fire.styled, JSON.stringify(fire));
  check('the styled weapon also adds its dmg stat (0.45 x Uncommon)', fire.dd > 0.6 && fire.dd < 0.8, JSON.stringify(fire));
  const sw = await A.page.evaluate(([k]) => { // switch to the ranger: the dagger comes off and cannot be equipped
    localStorage.setItem(k, JSON.stringify({ v: 1, heroId: 'h-ranger' })); const a = window.__mm.arena; a.refreshHeroLevel(); a._afterGearChange();
    const it = a.save.items.find((x) => x.id === 'wpn_dagger_fan');
    return { eq: a.save.eq.weapon || 0, can: a.equip(it.n), w: a.weapon, cls: a.heroClass(), shopFam: a.shopStock().filter((o) => /^wpn_/.test(o.id)).every((o) => RM_ITEM_BY_ID[o.id].family === 'bow') };
  }, [ACTIVE]);
  check('a ranger cannot hold the dagger item (taken off, equip refused, base fire)', sw.cls === 'ranger' && sw.eq === 0 && sw.can === false && sw.w === null, JSON.stringify(sw));
  check('the ranger shop lists bow styles only', sw.shopFam);

  // ---- (6) drops: world/dungeon weapon rolls become styled weapons, 70% the active family; classic waves never ----
  const drops = await A.page.evaluate(() => {
    const a = window.__mm.arena; const ids = []; let classic = 0;
    for (let i = 0; i < 600; i++) { const b = a.dropBag(100, 100, 1, 'sparkwand', { tierIndex: 2 }); if (b) { ids.push(b.id); b.active = false; } }
    for (let i = 0; i < 100; i++) { const b = a.dropBag(100, 100, 1, 'sparkwand'); if (b) { if (b.id !== 'sparkwand') classic++; b.active = false; } }
    const rings = []; for (let i = 0; i < 50; i++) { const b = a.dropBag(100, 100, 1, 'luckring', { tierIndex: 2 }); if (b) { rings.push(b.id); b.active = false; } }
    const w = ids.filter((id) => /^wpn_/.test(id)); const fam = w.filter((id) => RM_ITEM_BY_ID[id].family === 'bow').length;
    return { n: ids.length, w: w.length, fam: fam / Math.max(1, w.length), classic, rings: rings.every((id) => id === 'luckring') };
  });
  check('tier-2 world weapon rolls turn into styled weapons about 65% of the time', drops.n === 600 && drops.w > 330 && drops.w < 450, JSON.stringify(drops));
  check('about 70% of styled drops are the hero family (70% + share of the 30% any)', drops.fam > 0.64 && drops.fam < 0.8, JSON.stringify(drops));
  check('classic wave bags and non-weapon rolls are never converted', drops.classic === 0 && drops.rings, JSON.stringify(drops));
  errs.push(...A.errors);
  await A.ctx.close();

  // Seeded: two arenas with the same seed roll the same styled drops, and the main rng stream is untouched by them.
  const S = await open(browser, [hero('h-rogue', 'rogue', 5)], 'h-rogue', ACC);
  const seeded = await S.page.evaluate(() => {
    const src = window.__mm.arena;
    const run = (rollWpn) => {
      const host = document.createElement('div'); document.body.appendChild(host);
      const a = new RealmArena({ container: host, save: { level: 5 }, onSave: () => {}, seed: 4242 });
      a.setHeroLevelSource(() => ({ cls: 'rogue', level: 5 }));
      const ids = []; for (let i = 0; i < 40; i++) { const b = a.dropBag(10, 10, 0, rollWpn ? 'sparkwand' : 'luckring', { tierIndex: 3 }); ids.push(b.id); b.active = false; }
      const r = a.rng(); host.remove(); return { ids, r };
    };
    const x = run(true), y = run(true), z = run(false);
    return { same: JSON.stringify(x) === JSON.stringify(y), mainRng: x.r === z.r, some: x.ids.some((id) => /^wpn_/.test(id)), src: !!src };
  });
  check('styled drops are seeded (same seed, same items) and leave the main rng stream as it was', seeded.same && seeded.mainRng && seeded.some, JSON.stringify(seeded));
  errs.push(...S.errors);
  await S.ctx.close();

  // ---- (7) ?unlocks=0 and ?weapons=0 restore today's behaviour ----
  const U = await open(browser, [hero('h-rogue', 'rogue', 16)], 'h-rogue', ACC, '&unlocks=0');
  await quiet(U.page);
  const un = await nova(U.page); const ud = await dash(U.page);
  const ur = await U.page.evaluate(() => ({ unl: window.__mm.arena._unl(), lv: window.__mm.arena.heroLevel() }));
  check('?unlocks=0: a L16 hero Nova fires 16 and Dash recharges in 3 s, no mods', un.n === 16 && ud.cd === 3 && ur.unl === null, JSON.stringify([un, ud, ur]));
  errs.push(...U.errors);
  await U.ctx.close();
  const W = await open(browser, [hero('h-rogue', 'rogue', 5)], 'h-rogue', { ...ACC, items: [{ n: 1, id: 'wpn_dagger_fan', r: 0 }], nextUid: 2, eq: { weapon: 1 } }, '&weapons=0');
  const wo = await W.page.evaluate(() => { const a = window.__mm.arena; return { inert: !!RM_ITEM_BY_ID.wpn_dagger_fan.inert, eq: a.save.eq.weapon || 0, can: a.equip(1), shop: a.shopStock().some((o) => /^wpn_/.test(o.id)), kept: a.save.items.length, wpnItems: RM_WPN_ITEMS.length }; });
  check('?weapons=0: wpn_ items stay inert, unequipped, unsold and kept', wo.inert && wo.eq === 0 && wo.can === false && !wo.shop && wo.kept === 1 && wo.wpnItems === 0, JSON.stringify(wo));
  errs.push(...W.errors);
  await W.ctx.close();

  // ---- (8) an old save (no hero, classic items) loads and writes back unchanged ----
  const OLD = { shards: 321, bestWave: 4, kills: 77, deaths: 3, kb: { spiral: 5, aimed: 4, ring: 3, drifter: 2, boss: 1 }, bossBestT: 812, level: 9, xp: 12,
    items: [{ n: 1, id: 'sparkwand', r: 1 }, { n: 2, id: 'heartcharm', r: 0 }, { n: 3, id: 'luckring', r: 2 }], nextUid: 4, eq: { weapon: 1, charm: 2, ring: 3 } };
  const O = await open(browser, [], 'none', OLD, '', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const old = await O.page.evaluate(([k]) => {
    const a = window.__mm.arena; const mem = JSON.stringify(a.save); a.onSave(a.save);
    const st = a.shopStock();
    a._cacheAliveT = 60; const cache = a._deathBonus(); // classic death cache still cycles the 7 classic items (G-09: after a minute alive)
    return { mem, stored: JSON.stringify(JSON.parse(localStorage.getItem(k)).realm), cls: a.heroClass(), lv: a.heroLevel(), unl: a._unl(), wpnShop: st.some((o) => /^wpn_/.test(o.id)), n: st.length, cache: cache.id, nova: (a.abilityCd = [0, 0, 0, 0], a.state = 'play', a.paused = false, a.pBullets.forEach((b) => { b.active = false; }), a.cast(1), a.pBullets.filter((b) => b.active).length) };
  }, [SAVE]);
  check('an old classic save loads unchanged (memory and storage)', old.mem === JSON.stringify(OLD) && old.stored === JSON.stringify(OLD), old.mem + ' | ' + old.stored);
  check('no hero: account level, no unlock nodes, classic shop (best wave 4: 7 items x 2 rarities, no styled weapons)', old.cls === null && old.lv === 9 && old.unl === null && !old.wpnShop && old.n === 14, JSON.stringify(old));
  check('no hero: the death cache is a classic item and Nova fires 16', /^(sparkwand|quickwand|heartcharm|swiftcharm|luckring|scholarring|wardring)$/.test(old.cache) && old.nova === 16, JSON.stringify(old));
  errs.push(...O.errors);
  await O.ctx.close();

  // ---- (9) phone backpack: a family-locked styled weapon shows a greyed lock, no horizontal scroll ----
  const P = await open(browser, [hero('h-ranger', 'ranger', 4)], 'h-ranger', { ...ACC, items: [{ n: 1, id: 'wpn_dagger_venom', r: 0 }, { n: 2, id: 'wpn_bow_triple', r: 2 }], nextUid: 3, eq: {} }, '', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const ph = await P.page.evaluate(() => {
    const a = window.__mm.arena; a.setPaused(true);
    const lock = document.querySelector('#realm-bp-list [data-wpn-lock]'); const eqBtn = document.querySelector('#realm-bp-list li[data-uid="2"] button[data-act="equip"]');
    const rl = lock ? lock.getBoundingClientRect() : null, re = eqBtn ? eqBtn.getBoundingClientRect() : null;
    return { lock: !!lock, disabled: lock ? lock.disabled : false, label: lock ? lock.getAttribute('aria-label') : '', lh: rl ? rl.height : 0, eh: re ? re.height : 0, eq: !!eqBtn, scroll: document.documentElement.scrollWidth <= window.innerWidth };
  });
  check('a dagger item shows a disabled "Dagger: Rogue only" lock for a ranger', ph.lock && ph.disabled && /Dagger: Rogue/.test(ph.label), JSON.stringify(ph));
  check('the ranger can equip the Rare Triple Shot (button as tall as the classic Equip buttons)', ph.eq && ph.lh >= ph.eh - 0.5 && ph.eh >= 40, JSON.stringify(ph));
  check('390x844 phone: no horizontal scroll with styled weapons in the backpack', ph.scroll);
  errs.push(...P.errors);
  await P.ctx.close();

  check('no console errors', errs.length === 0, errs.join(' | '));
  await browser.close();
  done();
})();
