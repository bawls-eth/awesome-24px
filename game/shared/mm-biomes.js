// Dungeon biome tables (Warren / Bramble / Meadow / Crypt). Pure data + tiny helpers, no randomness, no DOM.
// UMD: browser global MMBiomes, or require(). The dungeon run (games/mad-maze/dungeon.js) reads it; tests read it in node.
// A biome picks: the floor/wall palette for normal and boss rooms, an ambient tint + particles, which MMEnemies ids may spawn
// (`ids`) and which art creature each one wears (`skin`), the boss art id (one of MMArt.BOSS_MAP) and the names shown in the HUD.
// 'warren' is the original look: no skin and no boss override, so it draws exactly what it always did.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMBiomes = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  const IDS = ['warren', 'bramble', 'meadow', 'crypt'];
  const BIOMES = {
    warren: {
      id: 'warren', name: 'Warren', clear: 'Warren cleared!', fell: 'You fell in the Warren', room: 'Bramble Hall',
      normal: { f: ['#261a46', '#2c2052'], w: '#35275c', hi: '#a98bff' },
      start: { f: ['#2a1f4d', '#30245a'], w: '#3a2c66', hi: '#a98bff' },
      boss: { f: ['#4a1a1a', '#541f1f'], w: '#4f1e1e', hi: '#ff6a4a' },
      tint: null, particles: null,
      ids: ['puffcap', 'beetle', 'archer', 'moth', 'sprout'], skin: {},
      // b24: `extra` = rare wave-2 skins for some mobs (see skinFor). Art only: hp/behaviour stay the mob's own. Warren: an elite is sometimes a giant spider queen.
      extra: [{ art: 'giant_spider_queen', elite: true, p: 0.5 }],
      boss_art: null, bossBolt: 'ebolt_orb_red', sig: 'burrow', boss_name: 'Queen Burrowmole', boss_room: 'Queen\'s Den', mapCol: '#6b5aa8',
    },
    bramble: {
      id: 'bramble', name: 'Bramble', clear: 'Bramble cleared!', fell: 'You fell in the Bramble', room: 'Thorn Hall',
      normal: { f: ['#1c3a22', '#21442a'], w: '#2c4a26', hi: '#8fe06a' },
      start: { f: ['#204028', '#264b30'], w: '#335430', hi: '#8fe06a' },
      boss: { f: ['#2e3a14', '#374518'], w: '#3c4a1a', hi: '#d6e24a' },
      tint: 'rgba(40,120,50,0.10)', particles: { kind: 'leaf', color: '#9be36f', n: 16, dir: 1 },
      ids: ['sprout', 'archer', 'beetle', 'puffcap'], skin: { sprout: 'sprout', archer: 'archer', beetle: 'forest_wolf', puffcap: 'goblin_shaman' },
      extra: [{ art: 'thorn_vine', ids: ['sprout', 'puffcap'], p: 0.35 }, { art: 'ogre', ids: ['beetle'], p: 0.35 }],
      boss_art: 'forest_warden', bossBolt: 'ebolt_shard', sig: 'thorns', boss_name: 'The Forest Warden', boss_room: 'Warden\'s Grove', mapCol: '#4fa84a',
    },
    meadow: {
      id: 'meadow', name: 'Meadow', clear: 'Meadow cleared!', fell: 'You fell in the Meadow', room: 'Flower Hall',
      normal: { f: ['#4a6a2c', '#527634'], w: '#6a5a34', hi: '#ffe27a' },
      start: { f: ['#4e7230', '#587e38'], w: '#74633a', hi: '#ffe27a' },
      boss: { f: ['#2c4a4a', '#325656'], w: '#2f5a50', hi: '#7be0c4' },
      tint: 'rgba(255,230,120,0.07)', particles: { kind: 'petal', color: '#ffd1e8', n: 18, dir: -1 },
      ids: ['puffcap', 'moth', 'archer', 'sprout'], skin: { puffcap: 'puffcap', moth: 'moth', archer: 'mothling', sprout: 'slime_green' },
      extra: [{ art: 'wind_sprite', ids: ['archer'], p: 0.35 }, { art: 'harpy', ids: ['puffcap', 'sprout'], p: 0.35 }],
      boss_art: 'mire_queen', bossBolt: 'ebolt_poison', sig: 'bloom', boss_name: 'The Mire Queen', boss_room: 'Mire Pool', mapCol: '#c9b43a',
    },
    crypt: {
      id: 'crypt', name: 'Crypt', clear: 'Crypt cleared!', fell: 'You fell in the Crypt', room: 'Bone Hall',
      normal: { f: ['#2a2e3a', '#303544'], w: '#3c4254', hi: '#9fb4d8' },
      start: { f: ['#2e3342', '#353a4a'], w: '#444b5e', hi: '#9fb4d8' },
      boss: { f: ['#3a2a3a', '#443244'], w: '#4a3350', hi: '#d68cff' },
      tint: 'rgba(100,140,220,0.09)', particles: { kind: 'mote', color: '#bcd4ff', n: 14, dir: -1 },
      ids: ['puffcap', 'beetle', 'archer', 'moth'], skin: { puffcap: 'skeleton', beetle: 'bone_knight', archer: 'shadow_cultist', moth: 'ice_wraith' },
      extra: [{ art: 'ghoul', ids: ['puffcap'], p: 0.35 }, { art: 'wraith_knight', ids: ['beetle', 'archer'], p: 0.3 }],
      boss_art: 'bone_colossus', bossBolt: 'ebolt_skull', sig: 'bonerain', boss_name: 'The Bone Colossus', boss_room: 'Ossuary', mapCol: '#7a8ab0',
      // b23: odd seeds (see bossFor) face the Lich King instead of the Bone Colossus; even seeds keep the original boss.
      alt: { boss_art: 'lich_king', boss_name: 'The Lich King', bossBolt: 'ebolt_frost', sig: 'souls' },
    },
  };

  // Unknown, missing or odd input -> 'warren' (exact match only, so 'constructor' / '__proto__' can never match).
  function clean(v) { return typeof v === 'string' && /^(warren|bramble|meadow|crypt)$/.test(v) ? v : 'warren'; }
  function get(v) { return BIOMES[clean(v)]; }
  // Art creature ids the biome's enemies wear (for the page to preload).
  function creatures(v) { const b = get(v); return b.ids.map((i) => b.skin[i]).filter(Boolean).concat((b.extra || []).map((x) => x.art)); }
  // Seeded wave-2 skin for one mob: the biome's `extra` art id, or null (keep the normal skin). `key` should be unique per mob (e.g. room id + index).
  // A fixed string hash (no stream consumed, no Math.random): same seed + key -> same answer. `classic` (page ?roster=classic) always returns null.
  function skinFor(v, mobId, elite, seed, key, classic) {
    if (classic) return null;
    const ex = get(v).extra || [];
    for (let i = 0; i < ex.length; i++) {
      const x = ex[i];
      if (x.elite ? !elite : !(x.ids && x.ids.indexOf(mobId) >= 0)) continue;
      let h = 2166136261; const s = 'roster:' + seed + ':' + key + ':' + x.art;
      for (let k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 16777619); }
      if (((h >>> 0) % 10000) / 10000 < x.p) return x.art;
    }
    return null;
  }

  // Seed parity: a numeric seed uses its own parity, any other string the parity of its char-code sum. Deterministic, no RNG.
  function seedParity(seed) {
    const n = Number(seed);
    if (typeof seed !== 'object' && seed !== '' && isFinite(n)) return Math.abs(Math.floor(n)) % 2;
    const s = String(seed); let h = 0; for (let i = 0; i < s.length; i++) h += s.charCodeAt(i);
    return h % 2;
  }
  // { boss_art, boss_name, alt, bossBolt (b17 ebolt_ art id the boss fires), sig (its signature attack kind, see dungeon.js) } for the biome + seed: the biome's `alt` boss on odd seeds, otherwise the primary. `classic` (or no alt) = primary.
  function bossFor(v, seed, classic) {
    const b = get(v);
    if (!classic && b.alt && seedParity(seed) === 1) return { boss_art: b.alt.boss_art, boss_name: b.alt.boss_name, alt: true, bossBolt: b.alt.bossBolt, sig: b.alt.sig };
    return { boss_art: b.boss_art, boss_name: b.boss_name, alt: false, bossBolt: b.bossBolt, sig: b.sig };
  }

  // DV1 (additive): the seeded dungeon mutators for a biome + dungeon seed (MMEndgame.mutatorsFor, z2+ biomes only). No MMEndgame = none.
  // opts: { off, count } as MMEndgame takes them. Returns { list, ids, fx, label, text }.
  const NO_MUT = Object.freeze({ list: Object.freeze([]), ids: Object.freeze([]), fx: null, label: '', text: '' });
  function mutatorsFor(v, seed, opts) {
    let EG = null;
    try { EG = typeof MMEndgame !== 'undefined' ? MMEndgame : (typeof module === 'object' && module.exports && typeof require === 'function' ? require('./mm-endgame.js') : null); } catch (e) { EG = null; }
    if (!EG || typeof EG.mutatorsFor !== 'function') return NO_MUT;
    return EG.mutatorsFor(clean(v), undefined, seed, opts);
  }

  return { IDS, BIOMES, clean, get, creatures, skinFor, bossFor, seedParity, mutatorsFor };
}));
