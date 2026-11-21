// Boss signature relics: six T12 body-slot pieces, one per godlands (z3) boss, drawn with the b29 `sig_*` item art (MMGear.SIG_IDS).
// (1) item defs are valid (ids, names, art, T12, soulbound, any class, signature affix); (2) the z3 boss table rolls them with seeded RNG, rarely,
// only on the first item of a T12 (never guaranteed); (3) the ids resolve to b29 art through the arena's item-art path; (4) an old save and a save
// that already holds a relic load unchanged (the relic stays, inert, until realm.js registers relics; with the registration it equips).
// Offline (blockDb), deterministic seed, no Firebase writes.
// Run: BASE=http://localhost:8821/game/index.html NODE_PATH=$(npm root -g) node game/tests/gear-signature-drops.test.js
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const G = require('../shared/mm-gear.js');
const GD = require('../shared/mm-gear-drops.js');
const GA = require('../shared/mm-gear-affix.js');
const S = require('../shared/mm-stash.js');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const URL = (q) => ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&seed=12345' + (q || '');
const KEY = 'pixeltown-realm-v1';
const B29 = path.join(__dirname, '../assets/arcane/b29-gear-tiers');
const Z3 = ['dread_knight', 'inferno_wyrm', 'void_oracle', 'lich_king', 'shadow_hydra', 'void_maw'];
const ART = { dread_knight: 'sig_dread_plate', inferno_wyrm: 'sig_wyrm_core', void_oracle: 'sig_oracle_eye', lich_king: 'sig_lich_phylactery', shadow_hydra: 'sig_hydra_fang', void_maw: 'sig_maw_shard' };
// What the proposed realm.js line registers (rmRegisterArmor also walking MMGear.SIG_BY_FAMILY): the same def shape as the 18 tier pieces.
const REGISTER = () => {
  MMGear.FAMILY_KEYS.forEach((fam) => (MMGear.SIG_BY_FAMILY[fam] || []).forEach((id) => {
    if (RM_ITEM_BY_ID[id] && !RM_ITEM_BY_ID[id].inert) return;
    RM_ITEM_BY_ID[id] = { id, slot: 'armor', name: String(MMGear.ARMOR_NAMES[id] || id).slice(0, 24), icon: '🛡️', art: MMGear.ARMOR_ART[id] || null, stat: 'armor', amount: 0, text: 'armor', family: fam, arm: true };
  }));
};

async function open(browser, url, realm, saveV1) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  await blockDb(ctx);
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html>town' }));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate((a) => { localStorage.clear(); localStorage.setItem('pixeltown-save-v1', a.v); localStorage.setItem('mm-aim-assist', '0'); if (a.realm) localStorage.setItem(a.key, a.realm); }, { v: JSON.stringify(saveV1), realm: realm || null, key: KEY });
  await page.goto(url);
  await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 20000 });
  await page.evaluate(() => { const a = window.__mm.arena; a.player.iframes = 1e9; a._hitPlayer = () => {}; a.enemies.forEach((e) => { e.active = false; }); });
  return { ctx, page, errors };
}

(async () => {
  // ---- (1) item defs ----
  const manifest = JSON.parse(fs.readFileSync(path.join(B29, 'manifest.json'), 'utf8'));
  const artIds = new Map(manifest.assets.map((a) => [a.id, a]));
  check('six relic ids, one per z3 boss, valid arm_ ids that the realm save cleaner keeps (RM_ARM_ID)', G.SIG_IDS.length === 6 && new Set(G.SIG_IDS).size === 6 && Z3.every((b) => G.SIG_IDS.indexOf(G.SIG_BY_BOSS[b]) >= 0) && G.SIG_IDS.every((id) => G.GEAR_ID_RE.test(id) && /^arm_[a-z]{3,8}_[a-z]{3,10}$/.test(id)));
  check('each relic draws its own b29 sig_ art (manifest entry, category items, 32x32, the PNG ships)', Z3.every((b) => { const id = G.SIG_BY_BOSS[b], a = artIds.get(G.ARMOR_ART[id]); return G.ARMOR_ART[id] === ART[b] && a && a.category === 'items' && a.frame_w === 32 && fs.existsSync(path.join(B29, a.path)); }));
  check('relics stay out of the 18 tier pieces (ARMOR_IDS unchanged) and of the band lookup', [].concat(G.ARMOR_IDS.light, G.ARMOR_IDS.robe, G.ARMOR_IDS.heavy).length === 18 && G.SIG_IDS.every((id) => G.FAMILY_KEYS.every((f) => G.ARMOR_IDS[f].indexOf(id) < 0)) && G.FAMILY_KEYS.every((f) => [11, 12].every((t) => !G.isSig(G.armorId(f, t)))));
  check('names and tier: "T12 Dread Plate" etc., always T12 (clean forces t 12), soulbound, level gate 20', G.SIG_IDS.every((id) => { const d = G.describe({ id, r: 1, t: 12 }), c = G.clean({ n: 3, id, r: 1, t: 4, a: 9 }), c0 = G.clean({ n: 3, id, r: 0 }); return d && d.name === 'T12 ' + G.ARMOR_NAMES[id] && d.soulbound && d.gate === 20 && c.t === 12 && c.a === 9 && c0.t === 12; }) && G.describe({ id: 'arm_sig_lich', t: 12 }).name === 'T12 Lich Phylactery');
  check('any class may wear a relic (level gate still applies); the tier pieces keep their family lock', G.SIG_IDS.every((id) => ['ranger', 'frostcaller', 'bruiser', 'necromancer'].every((c) => G.canEquip(id, 12, c, 20).ok) && G.canEquip(id, 12, 'ranger', 19).reason === 'level') && G.canEquip('arm_heavy_dread', 12, 'ranger', 20).reason === 'class');
  check('relic stats are the T12 piece of its family profile (heavy Dread Plate = Dread Cuirass T12 numbers)', (() => { const a = G.armorStats('arm_sig_dread', 12, 2), b = G.armorStats('arm_heavy_dread', 12, 2), l = G.armorStats('arm_sig_hydra', 3, 0); return a && b && a.hp === b.hp && a.guard === b.guard && a.t === 12 && l.t === 12 && l.family === 'light'; })());
  check('each relic carries its boss signature affix (the plan identity) on top of the T12 pair, capped, deterministic', Z3.every((b) => {
    const id = G.SIG_BY_BOSS[b], l = GA.roll(id, 'armor', 12, 3, 12345), l2 = GA.roll(id, 'armor', 12, 3, 12345);
    return l.length === 3 && l.some((e) => e.id === GD.SIGNATURE[b]) && JSON.stringify(l) === JSON.stringify(l2) && GA.value(l) <= GA.cap(12) + 1e-9;
  }) && GA.roll('arm_heavy_dread', 'armor', 12, 3, 12345).length === 2);
  const prof = { heroes: [{ id: 'h1', name: 'Bo', cls: 'ranger', level: 20, items: [{ id: 'arm_sig_maw', r: 2, t: 12, a: 5 }] }] };
  const dep = S.deposit(prof, 'h1', 0);
  check('soulbound rules intact: a relic (T12) is refused by the stash with the friendly message', !dep.ok && /soulbound/i.test(dep.msg) && prof.heroes[0].items.length === 1);

  // ---- (2) the boss table rolls them, seeded, rarely ----
  const roll = (boss, i, gp) => GD.rollGear({ src: 'boss', boss, zone: 3, bagTier: 5, gp: gp || { b: 0, d: 0 } }, GD.seedFor('sigtest', boss, i, 'me'));
  const hits = {}; Z3.forEach((b) => { hits[b] = 0; for (let i = 0; i < 20000; i++) { const r = roll(b, i); if (r && r.relic) { hits[b]++; if (r.id !== G.SIG_BY_BOSS[b] || r.t !== 12) hits[b] = -1e9; } } });
  check('every z3 boss rolls its own relic (seeded), at a low rate (0.3%-3% of kills at gp 0)', Z3.every((b) => hits[b] / 20000 > 0.003 && hits[b] / 20000 < 0.03), JSON.stringify(hits));
  check('same seed -> same relic roll; another player id -> another stream', JSON.stringify(roll('void_maw', 77)) === JSON.stringify(roll('void_maw', 77)) && (() => { let d = 0; for (let i = 0; i < 400; i++) if (JSON.stringify(GD.rollGear({ src: 'boss', boss: 'void_maw', zone: 3, always: true }, GD.seedFor('w', 't', i, 'a'))) !== JSON.stringify(GD.rollGear({ src: 'boss', boss: 'void_maw', zone: 3, always: true }, GD.seedFor('w', 't', i, 'b')))) d++; return d > 300; })());
  check('never guaranteed: even the pity-forced T12 (gp.b 60) is a relic only about a quarter of the time', (() => { let n = 0; for (let i = 0; i < 4000; i++) if (roll('inferno_wyrm', i, { b: 60, d: 0 }).relic) n++; return n / 4000 > 0.2 && n / 4000 < 0.3; })());
  check('no relic from z2 bosses, the elite, events, mobs, dungeon bosses', [{ src: 'boss', boss: 'hydra' }, { src: 'elite', boss: 'giant_spider_queen' }, { src: 'event', zone: 3, eventTier: 2 }, { src: 'mob', zone: 3 }, { src: 'dboss', biome: 'crypt', gp: { b: 0, d: 15 } }].every((c) => { for (let i = 0; i < 3000; i++) { const r = GD.rollGear(Object.assign({ always: true }, c), 'x' + i); if (r && (r.relic || G.isSig(r.id))) return false; } return true; }));

  const browser = await chromium.launch();
  // ---- (3) + live boss table in the world page; (4) old save + relic save ----
  const v1 = { realm: { level: 20, xp: 0, shards: 50, bestWave: 2, items: [{ n: 1, id: 'sparkwand', r: 0 }, { n: 2, id: 'heartcharm', r: 1 }, { n: 3, id: 'arm_sig_dread', r: 2, t: 12, a: 4242 }], nextUid: 4, eq: { weapon: 1, charm: 2 } } };
  let o = await open(browser, URL(''), null, v1);
  await o.page.waitForFunction(() => window.__mm.arena._itemArt, null, { timeout: 10000 }).catch(() => {});
  const before = await o.page.evaluate(() => { const a = window.__mm.arena; return { items: JSON.stringify(a.save.items), eq: JSON.stringify(a.save.eq), inert: !!(RM_ITEM_BY_ID.arm_sig_dread && RM_ITEM_BY_ID.arm_sig_dread.inert), can: a.equip(3) }; });
  check('old classic save + a saved relic load unchanged: classic items stay {n,id,r}, equips stay, the relic keeps t 12 and a', before.items === JSON.stringify([{ n: 1, id: 'sparkwand', r: 0 }, { n: 2, id: 'heartcharm', r: 1 }, { n: 3, id: 'arm_sig_dread', r: 2, t: 12, a: 4242 }]) && before.eq === JSON.stringify({ weapon: 1, charm: 2 }), before.items + ' ' + before.eq);
  check('without the realm.js registration the relic is inert (kept, never equipped, never dropped as itself)', before.inert === true && before.can === false);
  const live = await o.page.evaluate((reg) => {
    const a = window.__mm.arena, w = window.__mm.world;
    const fallback = []; // relic rolls before registration fall back to the family's T12 piece
    for (let i = 0; i < 500; i++) { a.bags.forEach((b) => { b.active = false; }); const got = w.testDrop({ zone: 3, tier: 3, boss: true, src: 'boss', bossId: 'dread_knight' }, 'pre'); if (got) got.items.forEach((it) => { if (it.t === 12) fallback.push(it.id); }); }
    (0, eval)('(' + reg + ')')();
    const g0 = a.stats.guard;
    const eq = a.equip(3); const g1 = a.stats.guard;
    const found = []; const bagIds = [];
    for (let i = 0; i < 900 && !found.length; i++) {
      a.bags.forEach((b) => { b.active = false; });
      const got = w.testDrop({ zone: 3, tier: 3, boss: true, src: 'boss', bossId: 'void_maw' }, 'sig');
      if (got) got.items.forEach((it) => { if (it.relic) { found.push(it); a.bags.forEach((b) => { if (b.active && b.id === it.id) bagIds.push([b.id, b.gear && b.gear.t]); }); } });
    }
    const def = RM_ITEM_BY_ID.arm_sig_maw; const url = a._itemArt ? a._itemArt.iconUrl(def.art) : null;
    return { fallback, eq, g0, g1, found, bagIds, url, icon: a._icon(def), dreadUrl: a._itemArt ? a._itemArt.iconUrl(RM_ITEM_BY_ID.arm_sig_dread.art) : null, pity: w.gearPity(), kills: w.kills() };
  }, REGISTER.toString());
  check('before registration, z3 boss T12 rolls stay valid items the arena knows (never an unknown relic id)', live.fallback.length > 0 && live.fallback.every((id) => !/^arm_sig_/.test(id)), JSON.stringify(live.fallback.slice(0, 6)));
  check('with the registration the saved relic equips for a classless level 20 save and adds guard', live.eq === true && live.g1 > live.g0, JSON.stringify([live.g0, live.g1]));
  check('the live void_maw boss table drops its relic: "T12 Maw Shard", soulbound, as a bag carrying t 12', live.found.length === 1 && live.found[0].id === 'arm_sig_maw' && live.found[0].name === 'T12 Maw Shard' && live.found[0].t === 12 && live.found[0].soulbound === true && live.bagIds.some((x) => x[0] === 'arm_sig_maw' && x[1] === 12), JSON.stringify({ f: live.found, b: live.bagIds, k: live.kills }));
  check('the relic ids resolve to the b29 sig_ PNGs through the arena item-art path (backpack <img>)', /b29-gear-tiers\/items\/sig_maw_shard\.png$/.test(live.url || '') && /b29-gear-tiers\/items\/sig_dread_plate\.png$/.test(live.dreadUrl || '') && /<img class="realm-ico" src="[^"]*sig_maw_shard\.png"/.test(live.icon), JSON.stringify([live.url, live.icon]));
  await o.page.evaluate(() => { const a = window.__mm.arena; a.bags.forEach((b) => { if (b.active && b.id !== 'arm_sig_maw') b.active = false; }); const b = a.bags.find((x) => x.active && x.id === 'arm_sig_maw'); if (b) { a.player.x = b.x; a.player.y = b.y; } });
  await o.page.waitForTimeout(1500);
  const picked = await o.page.evaluate((a0) => { const a = window.__mm.arena; const it = a.save.items.find((x) => x.id === 'arm_sig_maw'); return { it, a0, saved: JSON.stringify(a.save.items).indexOf('arm_sig_maw') >= 0 }; }, live.found[0] && live.found[0].a);
  check('picking the relic bag up puts it in the backpack with t 12 and its affix seed (the bag gear rides onto the entry)', !!picked.it && picked.it.t === 12 && picked.it.a === picked.a0 && Number.isInteger(picked.it.a), JSON.stringify(picked));
  const png = await o.page.evaluate(async (u) => { const r = await fetch(u); return r.status; }, live.url);
  check('the relic PNG is served (200)', png === 200, png);
  check('boss pity is shown calmly: plain counts, no hype words', /^Boss luck: \+\d+(\.\d)?% \(T12 guaranteed in \d+ kills?\)$/.test(live.pity.text) && !/(buy|hurry|limited|expire|last chance|so close|almost|streak|don't miss|!)/i.test(live.pity.text + live.pity.cryptText), live.pity.text);
  // ---- shop: T1-T3 only (in practice classic T0 stock): no relic, no arm_, never a tier above 3, never soulbound ----
  const shop = await o.page.evaluate(() => { const a = window.__mm.arena; a.save.shards = 99999; const st = a.shopStock(); const pick = st[0]; const n0 = a.save.items.length; const ok = pick ? a.buy(pick.id, pick.r) : false; const it = a.save.items[a.save.items.length - 1]; return { ids: st.map((x) => x.id), ok, grew: a.save.items.length === n0 + 1, t: it && it.t }; });
  check('shop sells no relic, no armor piece, nothing above T3 or soulbound (a bought item has no tier or t <= 3)', shop.ids.length > 0 && shop.ids.every((id) => !/^arm_/.test(id)) && shop.ok && shop.grew && (shop.t === undefined || shop.t <= 3), JSON.stringify(shop));
  check('no console errors', o.errors.length === 0, o.errors.join(' | '));
  await o.ctx.close();

  // ---- ?gear=0 kill switch keeps the relic in the save untouched ----
  o = await open(browser, URL('&gear=0'), null, v1);
  const off = await o.page.evaluate(() => JSON.stringify(window.__mm.arena.save.items.find((x) => x.n === 3)));
  check('?gear=0 keeps the saved relic entry byte-identical', off === JSON.stringify({ n: 3, id: 'arm_sig_dread', r: 2, t: 12, a: 4242 }), off);
  await o.ctx.close();

  await browser.close();
  done();
})();
