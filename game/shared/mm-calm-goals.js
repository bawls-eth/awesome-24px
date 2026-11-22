// MMCalmGoals: "Things you could do" (NEXT-SLICES-3 RT1). Three gentle suggestions picked from the medals a player has not earned yet,
// across every game the Hub knows (MMHubMedals.GAMES ids). Free play: no timers, no streaks, no "missed", nothing that runs out.
// UMD: browser global MMCalmGoals, or require() in node. Pure: no DOM, no storage, no clock, no Math.random; hostile input -> safe output.
//
// suggest(medals, nav, seed) -> frozen array of (at most, and normally exactly) 3 frozen suggestions:
//   { key: 'angler:catch1', game: 'angler', medal: 'catch1', place: 'angler', url: 'game/games/angler/index.html', icon, title, text }
//   medals  { angler: ['catch1', ...], jam: [...], ... } as MMHubMedals.read() returns it (unknown games / ids are ignored)
//   nav     { dismissed: ['game:medal', ...] } ideas the player put away (never suggested again); anything else is ignored
//   seed    any string / number. The same (medals, dismissed, seed) always gives the same three. The Hub passes a seed that has no date in
//           it, so the ideas only change when the player earns or puts one away, never because a day went by.
// With no medals at all the three are the first steps: first tame (Isles), first catch (Angler), first star (Campfire Jam).
// `url` is repo-relative and is one of the MMNav registry paths; a page turns it into an href through MMNav.urlFor (the URL allow-list).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMCalmGoals = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
  const COUNT = 3;
  const MAX_DISMISSED = 64;
  // game -> MMNav place, icon, name, page (repo-relative, the MMNav.PLACES path)
  const GAMES = Object.freeze({
    isles: Object.freeze({ place: 'isles', icon: '🏝️', name: 'Isles', url: 'game/games/isles/index.html' }),
    angler: Object.freeze({ place: 'angler', icon: '🎣', name: 'Angler', url: 'game/games/angler/index.html' }),
    jam: Object.freeze({ place: 'jam', icon: '🎸', name: 'Campfire Jam', url: 'game/games/jam/index.html' }),
    bugs: Object.freeze({ place: 'bugs', icon: '🦋', name: 'Bug Safari', url: 'game/games/festival/bugs.html' }),
    deepdelve: Object.freeze({ place: 'deepdelve', icon: '⛏️', name: 'Deepdelve', url: 'game/games/deepdelve/index.html' }),
    stalk: Object.freeze({ place: 'stalk', icon: '🥬', name: 'Stalk Market', url: 'game/games/stalk/index.html' }),
    pop: Object.freeze({ place: 'pop', icon: '🧩', name: 'Pixel Pop', url: 'game/games/pop/index.html' }),
    dash: Object.freeze({ place: 'dash', icon: '🕯️', name: 'Lantern Dash', url: 'game/games/dash/index.html' }),
  });
  // Every medal the Hub shows, in each game's own order (first steps first), with a plain, friendly line on what to try.
  const MEDALS = Object.freeze({
    isles: [
      ['tame1', 'Make a first friend', 'Sail to the Isles and tame any creature you like.'],
      ['log6', 'Meet six creatures', 'Wander the Isles and say hello to six kinds of creature.'],
      ['ride1', 'Go for a ride', 'Hop on a creature you tamed and ride it around.'],
      ['stable5', 'Fill the stable', 'Tame five creatures to keep you company.'],
      ['tame_s', 'A small friend', 'Tame one of the small creatures on the Isles.'],
      ['tame_m', 'A medium friend', 'Tame a medium-sized creature on the Isles.'],
      ['tame_l', 'A large friend', 'Tame one of the large creatures on the Isles.'],
      ['tame_xl', 'A giant friend', 'Tame one of the giant creatures on the Isles.'],
      ['visit_home', 'Visit Hearth Isle', 'Take a stroll around Hearth Isle.'],
      ['visit_jungle', 'Visit the jungle', 'Sail over to the Verdant Jungle and look around.'],
      ['visit_reef', 'Visit the reef', 'Sail to the Coral Reef and explore.'],
      ['visit_ice', 'Visit the tundra', 'Sail to Frostfang Tundra and see the snow.'],
      ['visit_mars', 'Visit the Red Waste', 'Sail out to the Red Waste and take a look.'],
      ['boss_fernjaw_tyrant', 'Spot the Fernjaw Tyrant', 'Find where the Fernjaw Tyrant lives in the jungle.'],
      ['boss_tide_hydra', 'Spot the Tide Hydra', 'Find the Tide Hydra out by the reef.'],
      ['boss_frost_dragon', 'Spot the Frost Dragon', 'Find the Frost Dragon up in the tundra.'],
      ['boss_red_titan', 'Spot the Red Titan', 'Find the Red Titan in the Red Waste.'],
    ],
    angler: [
      ['catch1', 'Catch a first fish', 'Cast a line in the Angler pond and reel in any fish.'],
      ['species10', 'Ten kinds of fish', 'Try different ponds and catch ten kinds of fish.'],
      ['boss1', 'A trophy fish', 'Try to land one of the big trophy fish.'],
    ],
    jam: [
      ['star1', 'Earn a first star', 'Play any song at Campfire Jam and earn a star.'],
      ['stars12', 'Twelve stars', 'Play the songs you enjoy until you have twelve stars.'],
      ['fullcombo', 'A full combo', 'Play a song you like all the way through without a slip.'],
    ],
    bugs: [
      ['first_catch', 'Catch a first bug', 'Head into Bug Safari and catch any bug with your net.'],
      ['species7', 'All seven bugs', 'Catch each of the seven kinds of bug.'],
      ['stars10', 'Ten safari stars', 'Play Bug Safari at your own pace and collect ten stars.'],
      ['moonwing', 'Find the Moonwing', 'Look for the Moonwing, a rare and gentle bug.'],
    ],
    deepdelve: [
      ['bronze', 'Dig to depth 8', 'Dig down in Deepdelve until you reach depth 8.'],
      ['silver', 'An iron pick', 'Mine some ore and make an iron pick.'],
      ['secret', 'Find the Lava Lake', 'Dig around and find the hidden Lava Lake.'],
      ['depth20', 'Dig to depth 20', 'Keep digging in Deepdelve until you reach depth 20.'],
      ['depth40', 'Dig to depth 40', 'Dig very deep in Deepdelve, all the way to depth 40.'],
      ['crawler', 'Face a crawler', 'Meet a cave crawler in Deepdelve and win.'],
      ['wyrm', 'The Rock Wyrm', 'Find the Rock Wyrm deep underground and win.'],
      ['torches10', 'Light ten torches', 'Place ten torches to light up your tunnels.'],
      ['build1', 'Build something', 'Build your first thing underground in Deepdelve.'],
      ['build3', 'Three builds', 'Build three things in Deepdelve.'],
    ],
    stalk: [
      ['bronze', 'A little profit', 'Buy turnips at the Stalk Market and sell them for a bit more.'],
      ['silver', 'A nice profit', 'Watch the turnip prices and sell when they look good.'],
      ['gold', 'A big profit', 'Buy low and sell high at the Stalk Market for a big profit.'],
    ],
    pop: [
      ['round1', 'A first round', 'Play one 90-second round of Pixel Pop.'],
      ['chain3', 'A 3x chain', 'In Pixel Pop, merge so the new tile lands by its twin: chain it three times.'],
      ['tile7', 'A level 7 tile', 'Keep merging in Pixel Pop until a tile reaches level 7.'],
      ['score5k', '5,000 points', 'Score 5,000 points in one Pixel Pop round. Chains help a lot.'],
    ],
    dash: [
      ['run1', 'A first run', 'Go for a run in Lantern Dash.'],
      ['m500', '500 metres', 'Run 500 m in Lantern Dash. Hold the button to jump further over gaps.'],
      ['perfect10', 'Ten perfects', 'In Lantern Dash, jump late, just before a rock, ten times in a row.'],
      ['m1500', '1,500 metres', 'Run 1,500 m in Lantern Dash. Race your ghost on the same course.'],
    ],
  });
  const ORDER = Object.freeze(Object.keys(GAMES)); // isles, angler, jam first: the three first steps
  const STARTERS = Object.freeze(['isles:tame1', 'angler:catch1', 'jam:star1']);
  const BY_KEY = Object.create(null);
  ORDER.forEach((g) => MEDALS[g].forEach((m) => { BY_KEY[g + ':' + m[0]] = { game: g, medal: m[0], title: m[1], text: m[2] }; }));

  // FNV-1a over the seed's string form, then mulberry32 (seeded, no Math.random)
  function hash(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h >>> 0;
  }
  function rng(seed) {
    let t = seed >>> 0;
    return () => { t = (t + 0x6D2B79F5) >>> 0; let r = Math.imul(t ^ (t >>> 15), 1 | t); r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r; return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
  }
  function seedStr(seed) {
    if (typeof seed === 'number' && Number.isFinite(seed)) return String(seed);
    if (typeof seed === 'string') return seed.slice(0, 200);
    return 'calm';
  }
  // medals -> { game: Set(earned ids) } with only whitelisted ids
  function earnedOf(medals) {
    const out = Object.create(null);
    const o = medals && typeof medals === 'object' && !Array.isArray(medals) ? medals : {};
    ORDER.forEach((g) => {
      const ok = MEDALS[g].map((m) => m[0]);
      const list = own(o, g) && Array.isArray(o[g]) ? o[g].slice(0, 64) : [];
      out[g] = new Set(list.filter((id) => typeof id === 'string' && ok.indexOf(id) >= 0));
    });
    return out;
  }
  // Clean dismissed list: known keys only, de-duplicated, at most MAX_DISMISSED.
  function cleanDismissed(v) {
    const out = [];
    (Array.isArray(v) ? v.slice(0, 256) : []).forEach((k) => { if (typeof k === 'string' && BY_KEY[k] && out.indexOf(k) < 0 && out.length < MAX_DISMISSED) out.push(k); });
    return out;
  }
  function make(key) {
    const b = BY_KEY[key], g = GAMES[b.game];
    return Object.freeze({ key, game: b.game, medal: b.medal, place: g.place, url: g.url, icon: g.icon, gameName: g.name, title: b.title, text: b.text });
  }

  function suggest(medals, nav, seed) {
    const earned = earnedOf(medals);
    const dismissed = new Set(cleanDismissed(nav && typeof nav === 'object' ? nav.dismissed : null));
    const open = (key) => { const b = BY_KEY[key]; return !earned[b.game].has(b.medal) && !dismissed.has(key); };
    const total = ORDER.reduce((n, g) => n + earned[g].size, 0);
    const picked = [];
    if (total === 0) STARTERS.forEach((k) => { if (open(k)) picked.push(k); });
    // Rounds: each round offers every game's next open medal (in that game's own order); games are shuffled by the seed, so three different games
    // come up before any game repeats. Earning or putting away an idea moves that game on to its next medal.
    const R = rng(hash(seedStr(seed)));
    const games = ORDER.slice();
    for (let i = games.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); const t = games[i]; games[i] = games[j]; games[j] = t; }
    const queues = Object.create(null);
    games.forEach((g) => { queues[g] = MEDALS[g].map((m) => g + ':' + m[0]).filter((k) => open(k) && picked.indexOf(k) < 0); });
    const used = new Set(picked.map((k) => BY_KEY[k].game));
    for (let round = 0; picked.length < COUNT && round < 20; round++) {
      let any = false;
      games.forEach((g) => {
        if (picked.length >= COUNT || !queues[g].length) return;
        if (round === 0 && used.has(g)) return; // first round: one idea per game
        picked.push(queues[g].shift()); any = true;
      });
      if (!any && round > 0) break;
    }
    return Object.freeze(picked.slice(0, COUNT).map(make));
  }

  // Every string this module can show (for the "no guilt" grep in the tests).
  function allText() {
    const out = [];
    ORDER.forEach((g) => { out.push(GAMES[g].name); MEDALS[g].forEach((m) => { out.push(m[1], m[2]); }); });
    return out;
  }
  return Object.freeze({ COUNT, MAX_DISMISSED, GAMES, STARTERS, suggest, cleanDismissed, allText, keys: () => Object.keys(BY_KEY) });
}));
