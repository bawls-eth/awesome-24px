// Pure node test for the dungeon biome tables (mm-biomes.js) + the per-biome room pools and enemy mix. No browser.
// Run: node game/tests/shared-mm-biomes.test.js
const fs = require('fs');
const path = require('path');
const { check, done } = require('./helpers');
const MMBiomes = require('../shared/mm-biomes.js');
const MMRooms = require('../shared/mm-rooms.js');
const MMEnemies = require('../shared/mm-enemies.js');
const MMWarren = require('../shared/mm-warren.js');

// ---- every creature / boss id exists in the art manifests ----
const root = path.join(__dirname, '..', 'assets', 'arcane');
const idx = JSON.parse(fs.readFileSync(path.join(root, 'INDEX.json'), 'utf8'));
const enemyActions = {}; const bossIds = new Set();
idx.batches.forEach((b) => {
  const m = JSON.parse(fs.readFileSync(path.join(root, '..', '..', b.manifest), 'utf8'));
  (m.assets || []).forEach((a) => {
    if (a.category === 'enemy' && a.enemy) { (enemyActions[a.enemy] = enemyActions[a.enemy] || new Set()).add(a.action); }
    if (a.category === 'boss' && a.boss) bossIds.add(a.boss);
    if (a.category === 'boss' && a.character) bossIds.add(a.character);
  });
});

check('four biomes: warren bramble meadow crypt', MMBiomes.IDS.join() === 'warren,bramble,meadow,crypt' && Object.keys(MMBiomes.BIOMES).join() === MMBiomes.IDS.join());
check('clean(): valid ids pass, everything else is warren', MMBiomes.IDS.every((b) => MMBiomes.clean(b) === b) && [undefined, null, '', 'lava', 'CRYPT', 'constructor', '__proto__', 'toString', 5, {}, ['crypt'], 'crypt '].every((v) => MMBiomes.clean(v) === 'warren'));

MMBiomes.IDS.forEach((id) => {
  const B = MMBiomes.BIOMES[id];
  check(`${id}: every enemy id is a real MMEnemies enemy and the mix is not empty`, B.ids.length >= 4 && B.ids.every((e) => MMEnemies.IDS.indexOf(e) >= 0) && new Set(B.ids).size === B.ids.length);
  const creatures = MMBiomes.creatures(id);
  check(`${id}: every skin maps a mix id to a creature with idle/move/attack art`, id === 'warren' ? creatures.length === 0 : creatures.length === B.ids.length && Object.keys(B.skin).every((k) => B.ids.indexOf(k) >= 0) && creatures.every((c) => enemyActions[c] && ['idle', 'move', 'attack'].every((a) => enemyActions[c].has(a))), JSON.stringify(creatures.filter((c) => !enemyActions[c])));
  check(`${id}: boss art id is in MMArt BOSS_MAP and the manifests`, id === 'warren' ? B.boss_art === null : bossIds.has(B.boss_art) && fs.readFileSync(path.join(__dirname, '..', 'shared', 'mm-art.js'), 'utf8').indexOf("'" + B.boss_art + "'") > 0, String(B.boss_art));
  check(`${id}: names, palettes and colours are well formed`, !!B.name && !!B.boss_name && !!B.room && !!B.boss_room && ['normal', 'start', 'boss'].every((k) => B[k].f.length === 2 && /^#[0-9a-f]{6}$/.test(B[k].w) && /^#[0-9a-f]{6}$/.test(B[k].hi) && B[k].f.every((c) => /^#[0-9a-f]{6}$/.test(c))));
});
check('the biome boss ids are distinct (warren keeps the default boss)', new Set(MMBiomes.IDS.map((b) => MMBiomes.BIOMES[b].boss_art)).size === 4);
check('palettes differ between biomes (normal floor, wall and highlight)', (() => { const s = new Set(MMBiomes.IDS.map((b) => JSON.stringify(MMBiomes.BIOMES[b].normal))); return s.size === 4; })());
check('the named creature mixes match the brief', (() => {
  const c = (b) => MMBiomes.creatures(b).sort().join();
  return c('crypt') === ['skeleton', 'bone_knight', 'shadow_cultist', 'ice_wraith'].sort().join()
    && c('bramble') === ['sprout', 'archer', 'forest_wolf', 'goblin_shaman'].sort().join()
    && c('meadow') === ['puffcap', 'moth', 'mothling', 'slime_green'].sort().join();
})());

// ---- room pools per biome ----
const KINDS = ['normal', 'key', 'treasure', 'boss', 'start'];
MMBiomes.IDS.forEach((b) => {
  check(`${b}: every room kind has a non-empty weighted pool`, KINDS.every((k) => { const p = MMRooms.biomePool(b, k); return p.length > 0 && p.every((t) => t.weight > 0); }));
});
const totalW = (b, tag) => MMRooms.biomePool(b, 'normal').reduce((n, t) => n + (t.tags.indexOf(tag) >= 0 ? t.weight : 0), 0) / MMRooms.biomePool(b, 'normal').reduce((n, t) => n + t.weight, 0);
check('biome weights lean as designed (bramble tight, meadow open, crypt ring/split) vs warren', totalW('bramble', 'tight') > totalW('warren', 'tight') && totalW('meadow', 'open') > totalW('warren', 'open') && totalW('crypt', 'ring') > totalW('warren', 'ring') && totalW('crypt', 'split') > totalW('warren', 'split'));
check('warren weights are neutral (all 1)', MMRooms.biomePool('warren', 'normal').every((t) => t.weight === 1));

// ---- determinism + selection per biome ----
let nondet = 0, bad = 0; const sigs = {};
MMBiomes.IDS.forEach((b) => {
  const out = [];
  for (let i = 0; i < 60; i++) {
    const seed = String(300 + i * 13); const g = MMWarren.generate(seed, { layout: 2 });
    const a = MMRooms.select(g, seed, 2, b); const c = MMRooms.select(MMWarren.generate(seed, { layout: 2 }), seed, 2, b);
    if (JSON.stringify(a.ids) !== JSON.stringify(c.ids)) nondet++;
    try { g.rooms.forEach((r) => MMRooms.parse(a.defs[r.id])); } catch (e) { bad++; }
    out.push(JSON.stringify(a.ids));
  }
  sigs[b] = out.join('|');
});
check('layout-2 selection is deterministic per biome and every def parses', nondet === 0 && bad === 0, nondet + '/' + bad);
check('biomes pick different rooms for the same seeds', new Set(Object.values(sigs)).size === 4);
check('an unknown biome selects like warren', (() => { const g = MMWarren.generate('77', { layout: 2 }); return JSON.stringify(MMRooms.select(g, '77', 2, 'nope').ids) === JSON.stringify(MMRooms.select(g, '77', 2, 'warren').ids); })());
check('layout 1 ignores the biome (old seeds replay identically)', (() => { const g = MMWarren.generate('9'); return JSON.stringify(MMRooms.select(g, '9', 1, 'crypt')) === JSON.stringify(MMRooms.select(g, '9', 1, 'warren')); })());

// ---- enemy plan with a restricted mix ----
const pts = []; for (let y = 2; y < 11; y += 2) for (let x = 2; x < 15; x += 3) pts.push({ x, y });
check('plan() without a mix is unchanged (all five enemies can appear)', (() => { const seen = new Set(); for (let i = 0; i < 80; i++) MMEnemies.plan('s' + i, 3, pts, null).enemies.forEach((e) => seen.add(e.id)); return seen.size === 5; })());
MMBiomes.IDS.forEach((b) => {
  const B = MMBiomes.BIOMES[b]; const seen = new Set(); let det = true;
  for (let i = 0; i < 80; i++) {
    const p = MMEnemies.plan('s' + i, 1 + (i % 4), pts, null, b === 'warren' ? undefined : B.ids); const q = MMEnemies.plan('s' + i, 1 + (i % 4), pts, null, b === 'warren' ? undefined : B.ids);
    if (JSON.stringify(p) !== JSON.stringify(q)) det = false;
    p.enemies.forEach((e) => seen.add(e.id));
  }
  check(`${b}: planned enemies stay inside the biome mix, use all of it, deterministically`, det && [...seen].every((e) => B.ids.indexOf(e) >= 0) && B.ids.every((e) => seen.has(e)), [...seen].join());
});

done();
