// GW (NEXT-SLICES-2 Wave 3): MMGearSets wired into the arena. _calcStats adds the active sets (Banded: armor band = weapon band, +4% HP; Dread pair:
// dread armor + a T12 signature weapon) after the slot loop, the Stats drop-down lists each active set's text, the weapon compare line names a set
// the swap makes or breaks, `sig` survives a reload and a world bag pickup, and ?gear=0 / duels ignore sets. Offline: blockDb + every WebSocket closed.
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/gear-sets-wired.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const MAZE = ORIGIN + '/game/games/mad-maze/index.html?test=1&offline=1';
const SAVE = 'pixeltown-save-v1', MM = 'pixeltown-mm-v1', ACTIVE = 'pixeltown-mm-active-v1';
const hero = (id, cls, level) => ({ id, name: cls, cls, level, xp: 0, fame: 0, bonus: 0, mode: 'classic', items: [] });
const prof = (heroes) => ({ v: 1, heroes, stash: new Array(16).fill(null), fame: 0, mode: 'classic', hall: [], migratedFrom: null });
const realm = (level, items, eq) => ({ shards: 0, bestWave: 0, kills: 0, deaths: 0, kb: { spiral: 0, aimed: 0, ring: 0, drifter: 0, boss: 0 }, bossBestT: 0, level, xp: 0, items, nextUid: 100, eq });
// A bruiser (heavy armor): a T5 wand + T5 heavy armor (both band 3: Banded, +4% HP only), a T7 wand (band 4) to compare, a T12 signature wand + dread plate.
const ITEMS = [{ n: 1, id: 'sparkwand', r: 0, t: 5 }, { n: 3, id: 'arm_heavy_ember', r: 0, t: 5 }, { n: 5, id: 'heartcharm', r: 0 }, { n: 7, id: 'sparkwand', r: 0, t: 7, a: 77 },
  { n: 9, id: 'sparkwand', r: 0, t: 12, a: 1, sig: 'blast' }, { n: 11, id: 'arm_heavy_dread', r: 0, t: 12 }];

async function open(browser, query, eq, url) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  const db = await blockDb(ctx);
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' }));
  await ctx.route('**/hub/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>hub</title>hub' }));
  await ctx.routeWebSocket(/.*/, (ws) => ws.close()); // never reach the live DB
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate(([k1, p, k2, a, k3, s]) => { localStorage.clear(); localStorage.setItem(k1, JSON.stringify(p)); localStorage.setItem(k2, a); localStorage.setItem(k3, JSON.stringify({ realm: s })); },
    [MM, prof([hero('h-1', 'bruiser', 20)]), ACTIVE, JSON.stringify({ v: 1, heroId: 'h-1' }), SAVE, realm(20, ITEMS, eq || { weapon: 1, armor: 3 })]);
  errors.length = 0;
  await page.goto((url || MAZE) + (query || ''));
  await page.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena.active, null, { timeout: 15000 });
  await page.evaluate(() => { const a = window.__mm.arena; a.state = 'play'; a.eBullets.forEach((b) => { b.active = false; }); a.enemies.forEach((e) => { e.active = false; }); a._calcStats(); a.setPaused(true); });
  return { ctx, page, errors, db };
}
const view = (page) => page.evaluate(() => {
  const a = window.__mm.arena;
  if (document.getElementById('realm-bp-stats-toggle') && document.getElementById('realm-bp-stats-toggle').getAttribute('aria-expanded') !== 'true') a.setStatsOpen(true);
  const bx = document.getElementById('realm-bp-stats-box');
  const noW = a._calcStats({ eqOverride: { weapon: 0 } });
  return { sets: a.activeSets().map((s) => s.text), ids: a.activeSets().map((s) => s.id), hp: a.stats.maxHp, hpNoWeapon: noW.maxHp, guard: a.stats.guard, splashR: a.stats.splashR,
    drop: bx ? Array.from(bx.querySelectorAll('.rm-stats-sets [data-set]')).map((d) => d.dataset.set + '|' + d.textContent.trim()) : [], enumSets: Object.keys(a.stats).indexOf('sets') >= 0 };
});

(async () => {
  const browser = await chromium.launch();
  const errs = [];

  // ---- Banded: T5 wand + T5 heavy armor (band 3) ----
  { const A = await open(browser); const page = A.page;
    const v = await view(page);
    check('Banded is active for a band-3 wand + band-3 armor, text "Banded set: +4% HP"', v.ids.join() === 'banded' && v.sets[0] === 'Banded set: +4% HP', JSON.stringify(v));
    check('Banded adds exactly +4% max HP (vs the same gear without the weapon)', v.hp === Math.round(v.hpNoWeapon * 1.04) && v.hp > v.hpNoWeapon, JSON.stringify({ hp: v.hp, no: v.hpNoWeapon }));
    check('the Stats drop-down lists the active set', v.drop.length === 1 && v.drop[0] === 'banded|Banded set: +4% HP', JSON.stringify(v.drop));
    check('the stats object shape is unchanged (sets is non-enumerable)', v.enumSets === false);
    const cmp = await page.evaluate(() => { const c = window.__mm.arena.weaponCompare(7); return c ? c.deltas.map((d) => d.text + (d.up ? '+' : '-')) : null; });
    check('the compare line of a band-4 wand says it breaks the set', cmp && cmp.indexOf('loses Banded set-') >= 0, JSON.stringify(cmp));
    const line = await page.evaluate(() => { const li = document.querySelector('#realm-bp-list li[data-uid="7"] .rm-cmp'); return li ? li.textContent : ''; });
    check('the rendered compare line shows it', /loses Banded set/.test(line), line);
    // unequip the armor: no set
    const off = await page.evaluate(() => { const a = window.__mm.arena; a.equip(3); a.setStatsOpen(true); return { s: a.activeSets().length, d: document.querySelectorAll('#realm-bp-stats-box .rm-stats-sets').length }; });
    check('without armor there is no set and no Sets block', off.s === 0 && off.d === 0, JSON.stringify(off));
    // duel: identical stats, no sets
    const duel = await page.evaluate(() => { const a = window.__mm.arena; a.equip(3); const t = a.team; a.team = { isPvp: true }; const r = { s: a.activeSets().length, f: a.forgeOn() }; a.team = t; a._calcStats(); return { s: r.s, st: r.f === false }; });
    check('a duel ignores sets (and has no forge)', duel.s === 0 && duel.st === true, JSON.stringify(duel));
    check('no DB traffic (blockDb)', A.db.attempts() === 0, JSON.stringify({ http: A.db.http, ws: A.db.ws }));
    errs.push(...A.errors); await A.ctx.close(); }

  // ---- Dread pair: T12 signature wand (sig blast) + dread plate; sig survives the reload (rmCleanSave) ----
  { const A = await open(browser, '', { weapon: 9, armor: 11 }); const page = A.page;
    const v = await view(page);
    const kept = await page.evaluate(() => JSON.stringify(window.__mm.arena.save.items.find((x) => x.n === 9)));
    check('the T12 wand keeps its `sig` through the save cleaner', /"sig":"blast"/.test(kept), kept);
    check('Banded (band 6: +4% HP, +1 GRD) and Dread pair are both active', v.ids.join() === 'banded,dread' && v.sets[0] === 'Banded set: +4% HP, +1 GRD' && /^Dread pair: signature blast \+25%$/.test(v.sets[1]), JSON.stringify(v.sets));
    const exp = await page.evaluate(() => { const ex = MMGearSets.extras(window.__mm.arena.activeSets()); const l = MMGearAffix.roll('sparkwand', 'weapon', 12, 0, 1, 'blast'); return { blast: MMGearAffix.sum(l).blast + ex.blast, ward: ex.ward }; });
    check('the signature blast (+25%) reaches the splash radius (24 + affix blast + set blast)', v.splashR === 24 + exp.blast, JSON.stringify({ r: v.splashR, exp }));
    check('the drop-down lists both sets', v.drop.length === 2 && v.drop[1].indexOf('dread|Dread pair') === 0, JSON.stringify(v.drop));
    const afx = await page.evaluate(() => Array.from(document.querySelectorAll('#realm-bp-list li[data-uid="9"] .rm-afx-i')).map((s) => s.dataset.affix));
    check('the backpack row lists the signature affix (roll gets `sig`)', afx.indexOf('blast') >= 0 && afx.length === 3, JSON.stringify(afx));
    errs.push(...A.errors); await A.ctx.close(); }

  // ---- ?gear=0: no sets anywhere, the items (and sig) are kept ----
  { const A = await open(browser, '&gear=0', { weapon: 9, armor: 11 }); const page = A.page;
    const v = await view(page);
    const kept = await page.evaluate(() => JSON.stringify(window.__mm.arena.save.items.find((x) => x.n === 9)));
    check('?gear=0: no active set and no Sets block', v.sets.length === 0 && v.drop.length === 0, JSON.stringify(v));
    check('?gear=0 keeps `sig` on the item', /"sig":"blast"/.test(kept), kept);
    errs.push(...A.errors); await A.ctx.close(); }

  // ---- world bag pickup copies the drop's sig onto the saved item ----
  { const A = await open(browser, '', { weapon: 1, armor: 3 }, ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&seed=12345'); const page = A.page;
    await page.waitForFunction(() => window.__mm && window.__mm.world, null, { timeout: 15000 });
    const got = await page.evaluate(() => {
      const a = window.__mm.arena; const p = a.player;
      const b = a.bags.find((x) => !x.active) || a.bags[0];
      b.active = false; b.id = 'sparkwand'; b.r = 0; b.x = p.x; b.y = p.y; b.gear = { t: 12, a: 1, sig: 'blast' };
      a.collectItem('sparkwand', 0);
      return JSON.stringify(a.save.items[a.save.items.length - 1]);
    });
    check('a world gear bag pickup keeps t, a and sig on the backpack entry', /"t":12/.test(got) && /"a":1\b/.test(got) && /"sig":"blast"/.test(got), got);
    errs.push(...A.errors); await A.ctx.close(); }

  check('no console errors', errs.length === 0, JSON.stringify(errs.slice(0, 5)));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
