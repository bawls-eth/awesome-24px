// MMCollections (CZ1): a "Collections book" view model built ONLY from local keys other games already write. Pure, read-only, no DOM, no network.
// read(storage) -> { sets: [{ id, title, place, hint, found, total, entries: [{ id, name, found }] }], found, total, steps: [...] }
// Sources (every one is only READ through storage.getItem; nothing is ever written, removed or cleared):
//   isles_seen   `pixeltown-archipelago-v1`.log.seen (+ .log.tamed, a tame was seen too) and `pixeltown-tames-v1`.roster[].sp, species from MMCreatures
//   isles_tamed  `pixeltown-archipelago-v1`.log.tamed + `pixeltown-tames-v1`.roster[].sp, the tameable species only
//   bugs         `pixeltown-bugs-v1`.journal {type: count}
//   angler_fish  `pixeltown-angler-v1`.caught {id: {n}} (the fish log, boss fish included)
//   isles_cove   `pixeltown-angler-v1`.cove {id: {n}} (the Isles Cove spot of the Angler)
//   relics       the six z3 boss signature relics (MMGear SIG_LIST ids `arm_sig_*`) anywhere they are kept: the realm backpack
//                (`pixeltown-save-v1`.realm.items), the Lantern (`pixeltown-mm-v1` stash, heroes[].items, heroes[].keepsake) and the realm finds
//                (`pixeltown-realm-v1`.finds.pending / .recent)
//   blueprints   Deepdelve builds (`pixeltown-deepdelve-v1`.goals.buildHut / buildBridge / buildLighthouse): the blueprint item itself lives in
//                Deepdelve's IndexedDB world, which this page never opens; a build can only stand once its blueprint was found
//   trophies     the four isles boss trophies on the home pedestal (`pixeltown-archipelago-v1`.trophies {trophy_*: 1 | 2})
// Every table below is a frozen copy of its owner module's ids (tests/shared-mm-collections.test.js checks they stay in step) so the Hub does
// not have to load those games' modules. Only ids on these lists are ever looked up, with hasOwnProperty, so `__proto__` and friends do nothing.
// Hostile or corrupt values (bad JSON, wrong types, huge strings, throwing storage) simply count as nothing found.
// Free play: totals only. No dates, no timers, no streaks, nothing is ever "missed"; finding things is optional.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMCollections = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const MAX_RAW = 262144; // a key bigger than this is not read at all
  const MAX_ARR = 400;
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const pos = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;

  // MMCreatures.list() order (id, name); NOT_TAMEABLE = the species MMCreatures marks tameable:false
  const CREATURES = [['clover_hopper', 'Clover Hopper'], ['puffwool', 'Puffwool'], ['bumble_mote', 'Bumble Mote'], ['pebble_tortle', 'Pebble Tortle'], ['thistle_boar', 'Thistle Boar'],
    ['meadow_strider', 'Meadow Strider'], ['oakback', 'Oakback'], ['glimmerfrog', 'Glimmerfrog'], ['chompbill', 'Chompbill'], ['fernraptor', 'Fern Raptor'], ['vinecoil', 'Vinecoil'],
    ['canopy_glider', 'Canopy Glider'], ['tusktop', 'Tusktop'], ['stegolith', 'Stegolith'], ['fernjaw_tyrant', 'Fernjaw Tyrant'], ['pengling', 'Pengling'], ['frostfox', 'Frostfox'],
    ['icicle_bat', 'Icicle Bat'], ['rimewolf', 'Rimewolf'], ['glacier_shellback', 'Glacier Shellback'], ['shagtusk', 'Shagtusk'], ['sabrefang', 'Sabrefang'], ['frost_dragon', 'Frost Dragon'],
    ['reef_puffer', 'Reef Puffer'], ['shellcrab', 'Shellcrab'], ['glowjelly', 'Glowjelly'], ['fin_raider', 'Fin Raider'], ['tidesteed', 'Tidesteed'], ['skimray', 'Skimray'],
    ['isleback_turtle', 'Isleback Turtle'], ['tide_hydra', 'Tide Hydra'], ['regolith_roly', 'Regolith Roly'], ['bubblemoth', 'Bubblemoth'], ['rustbeetle', 'Rustbeetle'],
    ['dust_devil', 'Dust Devil'], ['scrapper_drone', 'Scrapper Drone'], ['crater_strider', 'Crater Strider'], ['void_grazer', 'Void Grazer'], ['red_titan', 'Red Titan']];
  const NOT_TAMEABLE = ['vinecoil', 'icicle_bat', 'frost_dragon', 'glowjelly', 'tide_hydra', 'dust_devil'];
  // MMBiomePacks.CANON: a pack placeholder id an older save may hold -> the species it plays as
  const CANON = { parrotlet: 'chompbill', shellback: 'canopy_glider', raptor_jr: 'fernraptor', raptor: 'fernraptor', boarhog: 'tusktop', canopy_queen: 'fernjaw_tyrant', shellback_glacier: 'glacier_shellback' };
  // MMBugs TYPES order with the Bug Safari page names
  const BUGS = [['ladybug', 'Ladybug'], ['butterfly', 'Butterfly'], ['beetle', 'Beetle'], ['cricket', 'Cricket'], ['antlion', 'Antlion'], ['goldbeetle', 'Gold Beetle'],
    ['moonwing', 'Moonwing'], ['firefly', 'Firefly'], ['glowmoth', 'Glowmoth']];
  // MMAngler.FISH and MMAngler.COVE_FISH (id, name)
  const FISH = [['minnow', 'Minnow'], ['shrimp', 'Shrimp'], ['frog', 'Pond Frog'], ['koi', 'Koi'], ['puffer', 'Pufferfish'], ['crab', 'Mud Crab'], ['turtle', 'Snapping Turtle'],
    ['squid', 'Squid'], ['jelly', 'Jellyfish'], ['octopus', 'Octopus'], ['shark', 'Baby Shark'], ['goldfish', 'Golden Fish'], ['bluegill', 'Bluegill'], ['sunfish', 'Sunfish'],
    ['perch', 'Perch'], ['carp', 'Common Carp'], ['bullhead', 'Bullhead'], ['pond_eel', 'Pond Eel'], ['pike', 'Northern Pike'], ['old_whiskers', 'Old Whiskers'], ['chub', 'Chub'],
    ['crayfish', 'Crayfish'], ['river_trout', 'River Trout'], ['grayling', 'Grayling'], ['smallmouth', 'Smallmouth Bass'], ['salmon', 'Salmon'], ['sturgeon', 'Sturgeon'],
    ['golden_trout', 'Golden River Trout'], ['sardine', 'Sardine'], ['mackerel', 'Mackerel'], ['sea_bass', 'Sea Bass'], ['flounder', 'Flounder'], ['seahorse', 'Seahorse'],
    ['stingray', 'Stingray'], ['tuna', 'Tuna'], ['pier_kraken', 'Pier Kraken'], ['ice_smelt', 'Ice Smelt'], ['ice_perch', 'Ice Perch'], ['arctic_char', 'Arctic Char'],
    ['burbot', 'Burbot'], ['glass_fish', 'Glass Fish'], ['ice_queen_pike', 'Ice Queen Pike'], ['mudskipper', 'Mudskipper'], ['archerfish', 'Archerfish'],
    ['mangrove_snapper', 'Mangrove Snapper'], ['barramundi', 'Barramundi'], ['tarpon', 'Tarpon'], ['glow_eel', 'Glow Eel']];
  const COVE = [['kelp_darter', 'Kelp Darter'], ['coral_goby', 'Coral Goby'], ['kelp_ribbon', 'Ribbon Kelpfish'], ['shell_wrasse', 'Shellcracker Wrasse'],
    ['reef_parrot', 'Reef Parrotfish'], ['pearl_ray', 'Pearl Ray']];
  // MMGear SIG_LIST (relic id, relic name, boss name)
  const RELICS = [['arm_sig_dread', 'Dread Plate', 'Dread Knight'], ['arm_sig_wyrm', 'Wyrm Core', 'Inferno Wyrm'], ['arm_sig_oracle', 'Oracle Eye', 'Void Oracle'],
    ['arm_sig_lich', 'Lich Phylactery', 'Lich King'], ['arm_sig_hydra', 'Hydra Fang', 'Shadow Hydra'], ['arm_sig_maw', 'Maw Shard', 'Void Maw']];
  // MMDDBuild.BLUEPRINTS (id, name, the Deepdelve meta goal its build sets)
  const BLUEPRINTS = [['hut', 'Hut', 'buildHut'], ['bridge', 'Bridge', 'buildBridge'], ['lighthouse', 'Lighthouse', 'buildLighthouse']];
  // MMIsles.TROPHY_IDS with the boss each one honours
  const TROPHIES = [['trophy_tyrant', 'Fernjaw Tyrant trophy'], ['trophy_hydra', 'Tide Hydra trophy'], ['trophy_dragon', 'Frost Dragon trophy'], ['trophy_titan', 'Red Titan trophy']];

  // Set order, titles, the MMNav place id each one links to, and a calm hint (no urgency, nothing that runs out)
  const SETS = [
    { id: 'isles_seen', title: 'Isles creatures seen', place: 'isles', hint: 'Creatures you have met while wandering the isles.' },
    { id: 'isles_tamed', title: 'Isles friends tamed', place: 'isles', hint: 'Creatures that joined your stable, at your own pace.' },
    { id: 'bugs', title: 'Bug Safari journal', place: 'bugs', hint: 'Bugs you have caught in the meadows and glades.' },
    { id: 'angler_fish', title: 'Angler fish log', place: 'angler', hint: 'Fish you have reeled in at the lakes, rivers and pier.' },
    { id: 'isles_cove', title: 'Isles Cove fish', place: 'angler', hint: 'Fish from the Isles Cove spot in the Angler.' },
    { id: 'relics', title: 'Realm relic book', place: 'realm', hint: 'Rare relics the six godland bosses sometimes leave behind.' },
    { id: 'blueprints', title: 'Deepdelve blueprints', place: 'deepdelve', hint: 'Blueprints found deep underground, counted once you build them.' },
    { id: 'trophies', title: 'Isles boss trophies', place: 'isles', hint: 'Trophies on the pedestal of your isle home.' },
  ];
  // First steps shown while nothing is found yet (three gentle ideas, each in its own game)
  const STEPS = [
    { set: 'isles_seen', place: 'isles', icon: '\u{1F43E}', text: 'Meet a creature' },
    { set: 'bugs', place: 'bugs', icon: '\u{1F41E}', text: 'Catch a bug' },
    { set: 'angler_fish', place: 'angler', icon: '\u{1F41F}', text: 'Catch a fish' },
  ];
  const NOTE = 'Finding things is optional. Nothing here runs out; the book just keeps what you have found so far.';

  function readJson(storage, key) {
    let raw = null;
    try { raw = storage && typeof storage.getItem === 'function' ? storage.getItem(key) : null; } catch (e) { return null; }
    if (typeof raw !== 'string' || !raw.length || raw.length > MAX_RAW) return null;
    try { const o = JSON.parse(raw); return isObj(o) ? o : null; } catch (e) { return null; }
  }
  const arr = (v) => (Array.isArray(v) ? v.slice(0, MAX_ARR) : []);
  // the keys of a {id: count} map with a positive number, mapped through CANON when asked
  function countKeys(m, out, canon) {
    if (!isObj(m)) return;
    Object.keys(m).slice(0, MAX_ARR).forEach((k) => {
      if (!pos(m[k])) return;
      out[canon && has(CANON, k) ? CANON[k] : k] = 1;
    });
  }
  function caughtKeys(m, out) { // angler {id: {n}}
    if (!isObj(m)) return;
    Object.keys(m).slice(0, MAX_ARR).forEach((k) => { if (isObj(m[k]) && pos(m[k].n)) out[k] = 1; });
  }
  function itemIds(list, out) {
    arr(list).forEach((it) => { if (isObj(it) && typeof it.id === 'string' && it.id.length <= 40) out[it.id] = 1; });
  }
  function build(def, rows, got) {
    const entries = rows.map((r) => ({ id: r[0], name: r[1], found: has(got, r[0]) && got[r[0]] === 1 }));
    return { id: def.id, title: def.title, place: def.place, hint: def.hint, found: entries.filter((e) => e.found).length, total: entries.length, entries: entries };
  }

  function read(storage) {
    const arch = readJson(storage, 'pixeltown-archipelago-v1') || {};
    const tames = readJson(storage, 'pixeltown-tames-v1') || {};
    const bugs = readJson(storage, 'pixeltown-bugs-v1') || {};
    const angler = readJson(storage, 'pixeltown-angler-v1') || {};
    const town = readJson(storage, 'pixeltown-save-v1') || {};
    const mm = readJson(storage, 'pixeltown-mm-v1') || {};
    const realm = readJson(storage, 'pixeltown-realm-v1') || {};
    const dd = readJson(storage, 'pixeltown-deepdelve-v1') || {};

    const log = isObj(arch.log) ? arch.log : {};
    const tamed = Object.create(null);
    countKeys(log.tamed, tamed, true);
    arr(tames.roster).forEach((t) => { if (isObj(t) && typeof t.sp === 'string' && t.sp.length <= 24) tamed[has(CANON, t.sp) ? CANON[t.sp] : t.sp] = 1; });
    const seen = Object.create(null);
    countKeys(log.seen, seen, true);
    Object.keys(tamed).forEach((k) => { seen[k] = 1; });

    const bugGot = Object.create(null);
    countKeys(bugs.journal, bugGot, false);
    const fishGot = Object.create(null), coveGot = Object.create(null);
    caughtKeys(angler.caught, fishGot);
    caughtKeys(angler.cove, coveGot);

    const items = Object.create(null);
    if (isObj(town.realm)) itemIds(town.realm.items, items);
    itemIds(mm.stash, items);
    arr(mm.heroes).forEach((h) => { if (!isObj(h)) return; itemIds(h.items, items); itemIds([h.keepsake], items); });
    if (isObj(realm.finds)) { itemIds(realm.finds.pending, items); itemIds(realm.finds.recent, items); }

    const goals = isObj(dd.goals) ? dd.goals : {};
    const bpGot = Object.create(null);
    BLUEPRINTS.forEach((b) => { if (has(goals, b[2]) && goals[b[2]] === true) bpGot[b[0]] = 1; });

    const trGot = Object.create(null);
    if (isObj(arch.trophies)) TROPHIES.forEach((t) => { if (has(arch.trophies, t[0]) && (arch.trophies[t[0]] === 1 || arch.trophies[t[0]] === 2)) trGot[t[0]] = 1; });

    const tameRows = CREATURES.filter((c) => NOT_TAMEABLE.indexOf(c[0]) < 0);
    const byId = {};
    SETS.forEach((d) => { byId[d.id] = d; });
    const sets = [
      build(byId.isles_seen, CREATURES, seen),
      build(byId.isles_tamed, tameRows, tamed),
      build(byId.bugs, BUGS, bugGot),
      build(byId.angler_fish, FISH, fishGot),
      build(byId.isles_cove, COVE, coveGot),
      build(byId.relics, RELICS.map((r) => [r[0], r[1] + ' (' + r[2] + ')']), items),
      build(byId.blueprints, BLUEPRINTS, bpGot),
      build(byId.trophies, TROPHIES, trGot),
    ];
    const found = sets.reduce((s, x) => s + x.found, 0), total = sets.reduce((s, x) => s + x.total, 0);
    return { sets: sets, found: found, total: total, steps: found === 0 ? STEPS.map((s) => Object.assign({}, s)) : [] };
  }
  // A short summary line for a set or the whole book: "12 of 39 found"
  function line(found, total) { return found + ' of ' + total + ' found'; }
  // Every user-facing string this module can produce (tests run the no-guilt grep over it)
  function strings() {
    const out = [NOTE];
    SETS.forEach((s) => { out.push(s.title, s.hint); });
    STEPS.forEach((s) => out.push(s.text));
    [CREATURES, BUGS, FISH, COVE, BLUEPRINTS, TROPHIES].forEach((t) => t.forEach((r) => out.push(r[1])));
    RELICS.forEach((r) => out.push(r[1] + ' (' + r[2] + ')'));
    return out;
  }
  const deepFreeze = (o) => { Object.freeze(o); Object.keys(o).forEach((k) => { if (o[k] && typeof o[k] === 'object') deepFreeze(o[k]); }); return o; };
  return Object.freeze({
    read: read, line: line, strings: strings, NOTE: NOTE,
    TABLES: deepFreeze({ CREATURES: CREATURES, NOT_TAMEABLE: NOT_TAMEABLE, CANON: CANON, BUGS: BUGS, FISH: FISH, COVE: COVE, RELICS: RELICS, BLUEPRINTS: BLUEPRINTS, TROPHIES: TROPHIES, SETS: SETS, STEPS: STEPS }),
  });
}));
