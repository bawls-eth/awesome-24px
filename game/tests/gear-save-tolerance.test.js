// G7 (GEAR-DROPS-BUILD-PLAN): save tolerance for tiered gear and the armor slot. Old saves load byte-identically; the additive item fields `t` / `a`,
// `arm_` armor ids, `eq.armor`, `gv` and `gp` survive load / save / cross-tab merge on every page (with MMGear, without it, and under ?gear=0, the kill
// switch that makes them inert); armor equips by class family; the co-op `loot` event never carries a tier. Drops are NOT turned on by G7.
// Offline: WebSockets closed, town/hub pages stubbed, no chat, nothing written to Firebase.
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/gear-save-tolerance.test.js
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const MAZE = ORIGIN + '/game/games/mad-maze/index.html?test=1&offline=1';
const SAVE = 'pixeltown-save-v1', MM = 'pixeltown-mm-v1', ACTIVE = 'pixeltown-mm-active-v1';
const hero = (id, cls, level) => ({ id, name: cls, cls, level, xp: 0, fame: 0, bonus: 0, mode: 'classic', items: [] });
const prof = (heroes) => ({ v: 1, heroes, stash: new Array(16).fill(null), fame: 0, mode: 'classic', hall: [], migratedFrom: null });

// A realm save exactly as a pre-G7 build writes it (rmCleanSave key order): it must come back byte for byte.
const OLD = { shards: 120, bestWave: 3, kills: 40, deaths: 1, kb: { spiral: 5, aimed: 10, ring: 3, drifter: 2, boss: 0 }, bossBestT: 0, level: 4, xp: 12,
  items: [{ n: 1, id: 'sparkwand', r: 2 }, { n: 2, id: 'heartcharm', r: 0 }, { n: 3, id: 'wpn_bow_triple', r: 1 }, { n: 4, id: 'wpn_some_future', r: 0 }], nextUid: 5, eq: { weapon: 1, charm: 2 } };
// A G7+ save: tiered weapon with an affix seed, armor (equipped), the gv / gp markers.
const NEW = { shards: 50, bestWave: 0, kills: 0, deaths: 0, kb: { spiral: 0, aimed: 0, ring: 0, drifter: 0, boss: 0 }, bossBestT: 0, level: 12, xp: 0, // level 12: the T7 gate (MMGear.gate(7))
  items: [{ n: 1, id: 'sparkwand', r: 1, t: 7, a: 123456 }, { n: 2, id: 'arm_heavy_iron', r: 0, t: 1 }, { n: 3, id: 'arm_robe_moon', r: 2, t: 6 }], nextUid: 4, eq: { weapon: 1, armor: 2 }, gv: 1, gp: { b: 7, d: 2 } };

async function open(browser, opts) {
  const o = opts || {};
  const ctx = await browser.newContext(o.ctx || { viewport: { width: 1000, height: 700 } });
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' }));
  await ctx.route('**/hub/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>hub</title>hub' }));
  if (o.noGear) await ctx.route('**/shared/mm-gear*.js*', (r) => r.fulfill({ contentType: 'text/javascript', body: '/* a page without the gear modules (an old deploy) */' }));
  await ctx.routeWebSocket(/.*/, (ws) => ws.close()); // never reach the live DB
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate(([k1, p, k2, a, k3, s]) => { localStorage.setItem(k1, JSON.stringify(p)); localStorage.setItem(k2, a); if (s) localStorage.setItem(k3, JSON.stringify({ realm: s })); },
    [MM, prof([hero('h-1', o.cls || 'bruiser', o.level || 1)]), ACTIVE, JSON.stringify({ v: 1, heroId: 'h-1' }), SAVE, o.save || null]);
  errors.length = 0;
  await page.goto(MAZE + (o.query || ''));
  await page.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena.active, null, { timeout: 15000 });
  return { ctx, page, errors };
}
const stored = (page) => page.evaluate((k) => { try { return JSON.parse(localStorage.getItem(k)).realm; } catch (e) { return null; } }, SAVE);
const persist = (page) => page.evaluate(() => { const a = window.__mm.arena; a.onSave(a.save); return true; });

(async () => {
  const browser = await chromium.launch();
  const errs = [];
  const src = fs.readFileSync(path.join(__dirname, '..', 'realm.js'), 'utf8');

  // ---- static: the co-op loot event carries [id, r] only; the guest refuses armor ----
  const loot = src.match(/ev\('loot', \[[^\]]*\]/g) || [];
  check('co-op: every `loot` event in realm.js is [b.id, b.r] (never a tier or affix seed)', loot.length === 1 && loot[0] === "ev('loot', [b.id, b.r]", JSON.stringify(loot));
  const team = fs.readFileSync(path.join(__dirname, '..', 'realm-team.js'), 'utf8');
  check('co-op: the guest drops `arm_` ids from a loot event and still clamps r to 0..2', /e\.k === 'loot'.*\/\^arm_\/\.test\(id\)/.test(team) && /rtNum\(d\[1\], 0, 2, 0\)/.test(team));

  // ---- 1. an old save loads byte-identically ----
  { const A = await open(browser, { save: OLD, cls: 'ranger', level: 4 });
    const r = await A.page.evaluate((old) => {
      const a = window.__mm.arena;
      return { clean: JSON.stringify(rmCleanSave(old)) === JSON.stringify(old), live: JSON.stringify({ items: a.save.items, eq: a.save.eq }), keys: Object.keys(rmCleanSave(old)).join(','), globals: [typeof MMGear, typeof MMGearAffix, typeof MMGearDrops, typeof MMSplash].join(','),
        name: MMGear.describe({ id: 'wpn_bow_triple', r: 2, t: 7 }).name, alt: MMWeapons.altIds().length, slots: RM_SLOTS.join(',') };
    }, OLD);
    check('old save: rmCleanSave(old) is byte-identical (no t / a / gv / gp / eq.armor appear)', r.clean && !/gv|gp/.test(r.keys), r.keys);
    check('old save: the live arena holds exactly the old items + equipment', r.live === JSON.stringify({ items: OLD.items, eq: OLD.eq }), r.live);
    await persist(A.page);
    const st = await stored(A.page);
    check('old save: written back to storage unchanged (items, eq, no new keys)', JSON.stringify(st.items) === JSON.stringify(OLD.items) && JSON.stringify(st.eq) === JSON.stringify(OLD.eq) && !('gv' in st) && !('gp' in st), JSON.stringify(st));
    check('wave 1 modules on the Mad Maze page: MMGear, MMGearAffix, MMGearDrops, MMSplash; "T7 Triple Shot"; 30 alt styles; 4 slots', r.globals === 'object,object,object,object' && r.name === 'T7 Triple Shot' && r.alt === 30 && r.slots === 'weapon,charm,ring,armor', JSON.stringify(r));
    errs.push(...A.errors); await A.ctx.close(); }

  // ---- 2. new fields survive reload; armor equips on a bruiser; hostile input is cleaned; alias; merge ----
  { const A = await open(browser, { save: NEW, cls: 'bruiser', level: 1 });
    const r = await A.page.evaluate(() => { const a = window.__mm.arena; return { items: JSON.stringify(a.save.items), eq: JSON.stringify(a.save.eq), gv: a.save.gv, gp: JSON.stringify(a.save.gp) }; });
    check('new fields load: t / a kept on the T7 Spark Wand, both armor pieces kept, eq.armor = 2, gv 1, gp {b:7,d:2}', r.items === JSON.stringify(NEW.items) && r.eq === JSON.stringify(NEW.eq) && r.gv === 1 && r.gp === '{"b":7,"d":2}', JSON.stringify(r));
    await persist(A.page); await A.page.reload();
    await A.page.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena.active, null, { timeout: 15000 });
    const r2 = await A.page.evaluate(() => { const a = window.__mm.arena; return { items: JSON.stringify(a.save.items), armor: a.save.eq.armor }; });
    check('after a write + reload the tiered items and eq.armor are still there', r2.items === JSON.stringify(NEW.items) && r2.armor === 2, JSON.stringify(r2));
    const eqr = await A.page.evaluate(() => {
      const a = window.__mm.arena; a.state = 'play';
      a.save.items.push({ n: 9, id: 'arm_heavy_iron', r: 0, t: 1 }); delete a.save.eq.armor;
      const ok = a.equip(9); const robe = a.equip(3); // a robe on a bruiser: refused
      a.setPaused(true);
      const slot = document.querySelector('.realm-bp-slot[data-slot="armor"]'); const lock = document.querySelector('#realm-bp-list li[data-uid="3"] button[data-gear-lock]');
      return { ok, robe, armor: a.save.eq.armor, slot: slot ? slot.textContent : '', art: !slot ? '' : slot.querySelector('img.realm-ico') ? 'img:' + slot.querySelector('img.realm-ico').getAttribute('src') : /🛡️/.test(slot.textContent) ? 'emoji' : '', lock: lock ? lock.textContent + '|' + lock.getAttribute('aria-label') : '', guard: a.stats.guard };
    });
    check('armor equips by family: arm_heavy_iron T1 on a bruiser (eq.armor === 9, guard 1); the slot shows its art (armor_cuirass_iron) or 🛡️; a robe is refused with "🔒 Robe" (+ its classes)', eqr.ok === true && eqr.armor === 9 && eqr.guard === 1 && eqr.robe === false && /Iron Cuirass/.test(eqr.slot) && /^(emoji|img:.*armor_cuirass_iron)/.test(eqr.art) && /🔒 Robe/.test(eqr.lock) && /Frostcaller/.test(eqr.lock), JSON.stringify(eqr));
    const hostile = await A.page.evaluate(() => {
      const c = rmCleanSave({ items: [{ n: 1, id: 'sparkwand', r: 0, t: 99 }, { n: 2, id: 'sparkwand', r: 0, t: 3, a: 77 }, { n: 3, id: '__proto__', r: 0, t: 2 }, { n: 4, id: 'sparkwand', r: 0, t: '1e3' }, { n: 5, id: 'quickwand', r: 0, t: 5 },
        { n: 6, id: 'heartcharm', r: 0, t: 4 }, { n: 7, id: 'armor_robe_t4', r: 1 }, { n: 8, id: 'armor_heavy_t0', r: 0 }, { n: 9, id: 'arm_heavy_iron', r: 0, t: 12 }], eq: { armor: 9, weapon: 6 }, gp: 'junk', gv: 'x' });
      return JSON.stringify(c.items) + '|' + JSON.stringify(c.eq) + '|' + JSON.stringify(c.gp) + '|' + c.gv;
    });
    const want = '[{"n":1,"id":"sparkwand","r":0},{"n":2,"id":"sparkwand","r":0,"t":3},{"n":4,"id":"sparkwand","r":0},{"n":5,"id":"quickwand","r":0},{"n":6,"id":"heartcharm","r":0},{"n":7,"id":"arm_robe_mage","r":1,"t":4},{"n":8,"id":"arm_heavy_iron","r":0,"t":1},{"n":9,"id":"arm_heavy_iron","r":0,"t":2}]|{"armor":9}|{"b":0,"d":0}|1';
    check('hostile input: t 99 / "1e3" dropped, a below T7 dropped, __proto__ gone, no t on quickwand / charms, armor t clamped into its band, eq.weapon on a charm dropped, gp junk -> defaults', hostile === want, hostile);
    check('alias: armor_robe_t4 -> arm_robe_mage t4 and armor_heavy_t0 -> arm_heavy_iron t1 (MMQuests.rewardBag ids)', /"n":7,"id":"arm_robe_mage","r":1,"t":4/.test(hostile) && /"n":8,"id":"arm_heavy_iron","r":0,"t":1/.test(hostile));
    const merge = await A.page.evaluate(() => {
      const mine = { items: [{ n: 5, id: 'sparkwand', r: 0, t: 7, a: 111 }], nextUid: 6, eq: { weapon: 5 } };
      const st = { items: [{ n: 5, id: 'sparkwand', r: 0, t: 7, a: 222 }, { n: 6, id: 'arm_light_scout', r: 0, t: 2 }], nextUid: 7, gp: { b: 3, d: 9 } };
      const m = rmMergeSave(mine, st, { known: new Set() });
      return { items: m.items.map((x) => `${x.id}:${x.t}:${x.a || 0}`).sort().join(','), n: m.items.length, eq: m.eq.weapon, mineUid: (m.items.find((x) => x.a === 111) || {}).n, gp: JSON.stringify(m.gp), gv: m.gv };
    });
    check('two-tab merge: both T7 copies kept (different `a` = different items, this tab\'s gets a fresh uid and keeps its equip), armor kept, gp merged', merge.n === 3 && merge.items === 'arm_light_scout:2:0,sparkwand:7:111,sparkwand:7:222' && merge.eq === merge.mineUid && merge.mineUid !== 5 && merge.gp === '{"b":3,"d":9}' && merge.gv === 1, JSON.stringify(merge));
    errs.push(...A.errors); await A.ctx.close(); }

  // ---- 3. ?gear=0: 3 slots, armor inert, the fields are KEPT through a write ----
  { const A = await open(browser, { save: NEW, cls: 'bruiser', query: '&gear=0' });
    await persist(A.page);
    const r = await A.page.evaluate(() => { const a = window.__mm.arena; a.state = 'play'; a.setPaused(true); const eq = a.equip(2);
      const dmg = a.stats.dmg; const keep = a.save.items[0]; a.save.items[0] = { n: 1, id: 'sparkwand', r: 1 }; const t0 = a._calcStats({ eqOverride: {} }).dmg; a.save.items[0] = keep; // the same wand as a plain T0 item
      return { slots: document.querySelectorAll('.realm-bp-slot').length, dmg, t0, guard: a.stats.guard, equip: eq, inert: !!(RM_ITEM_BY_ID.arm_heavy_iron && RM_ITEM_BY_ID.arm_heavy_iron.inert) }; });
    const st = await stored(A.page);
    check('?gear=0: 3 slots, armor inert (no guard, not equippable), the T7 wand counts as a classic Uncommon Spark Wand', r.slots === 3 && r.guard === 0 && r.equip === false && r.inert && Math.abs(r.dmg - r.t0) < 1e-9, JSON.stringify(r));
    check('?gear=0: t / a / arm_ items / eq.armor / gv / gp are still written back (the cleaner keeps them)', JSON.stringify(st.items) === JSON.stringify(NEW.items) && st.eq.armor === 2 && st.gv === 1 && st.gp && st.gp.b === 7, JSON.stringify(st));
    errs.push(...A.errors); await A.ctx.close(); }

  // ---- 4. a page without the gear modules (an old deploy of the page): no crash, nothing erased ----
  { const A = await open(browser, { save: NEW, cls: 'bruiser', noGear: true });
    await persist(A.page);
    const r = await A.page.evaluate(() => ({ g: typeof MMGear, slots: RM_SLOTS.length }));
    const st = await stored(A.page);
    check('without mm-gear.js: the arena runs (3 slots) and keeps every tiered item, its t / a and eq.armor', r.g === 'undefined' && r.slots === 3 && JSON.stringify(st.items) === JSON.stringify(NEW.items) && st.eq.armor === 2, JSON.stringify({ r, st }));
    errs.push(...A.errors); await A.ctx.close(); }

  // ---- 5. phone 390x844: the backpack shows the armor slot, no horizontal scroll, buttons >= 44 px ----
  { const P = await open(browser, { save: NEW, cls: 'ranger', ctx: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } });
    const lay = await P.page.evaluate(() => { const a = window.__mm.arena; a.state = 'play'; a.setPaused(true);
      const sl = Array.from(document.querySelectorAll('.realm-bp-slot')).map((x) => x.dataset.slot);
      const ar = document.querySelector('.realm-bp-slot[data-slot="armor"]'); const rc = ar ? ar.getBoundingClientRect() : null;
      return { sl: sl.join(','), vis: !!rc && rc.width > 40 && rc.right <= window.innerWidth, txt: ar ? ar.textContent.trim() : '', sw: document.documentElement.scrollWidth, iw: window.innerWidth,
        small: Array.from(document.querySelectorAll('#realm-bp-list button')).filter((b) => b.getClientRects().length && b.getBoundingClientRect().height < 44).length, armor: a.save.eq.armor };
    });
    check('phone: the backpack shows weapon, charm, ring and an armor slot on screen', lay.sl === 'weapon,charm,ring,armor' && lay.vis, JSON.stringify(lay));
    check('phone: a ranger loaded with heavy armor equipped has it taken off (light family) and the slot reads "armor: empty"', lay.armor === undefined && /armor: empty/.test(lay.txt), JSON.stringify(lay));
    check('phone: no horizontal scroll, every backpack button >= 44 px tall', lay.sw <= lay.iw && lay.small === 0, JSON.stringify(lay));
    if (process.env.SHOTS) await P.page.screenshot({ path: path.join(process.env.SHOTS, 'gear-save-390x844.png') });
    errs.push(...P.errors); await P.ctx.close(); }

  check('no console errors', errs.length === 0, errs.join(' | '));
  await browser.close();
  done();
})();

