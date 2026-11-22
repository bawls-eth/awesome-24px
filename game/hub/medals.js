// Hub medal strips. Each game writes its OWN summary key `pixeltown-medals-<game>-v1` = {"v":1,"m":["medalId",...]}
// (one writer per key, additive, nothing else touched). Campfire Jam has no summary key: its medals are derived here
// from its own save `pixeltown-jam-v1` (read-only, cleaned with MMJamSongs.cleanSave). This page only READS them, drops anything not on the
// whitelist below, and shows names with textContent. Corrupt or hostile values simply show no medals.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMHubMedals = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const GAMES = {
    angler: { node: 'w4-angler', name: 'Angler', medals: [['catch1', 'First catch'], ['species10', '10 species'], ['boss1', 'Boss trophy']] },
    jam: { node: 'w5-jam', name: 'Campfire Jam', medals: [['star1', 'First star'], ['stars12', '12 stars'], ['fullcombo', 'Full combo']] },
    stalk: { node: 'w5-stalk', name: 'Stalk Market', medals: [['bronze', 'Bronze'], ['silver', 'Silver'], ['gold', 'Gold']] },
    // Pixel Pop (games/pop) and Lantern Dash (games/dash): each writes its own pixeltown-medals-<game>-v1
    pop: { node: 'w5-pop', name: 'Pixel Pop', medals: [['round1', 'First round'], ['chain3', '3x chain'], ['tile7', 'Make a 7'], ['score5k', '5,000 points']] },
    dash: { node: 'w5-dash', name: 'Lantern Dash', medals: [['run1', 'First run'], ['m500', '500 m'], ['perfect10', '10x perfect'], ['m1500', '1,500 m']] },
    deepdelve: { node: 'w3-deepdelve', name: 'Deepdelve', medals: [['bronze', 'Depth 8'], ['silver', 'Iron pick'], ['secret', 'Lava Lake'], ['depth20', 'Depth 20'], ['depth40', 'Depth 40'], ['crawler', 'Crawler slain'], ['wyrm', 'Rock Wyrm'], ['torches10', '10 torches'], ['build1', 'First build'], ['build3', 'Three builds']] },
    // Hearthvale Isles (games/isles, MMIsles.MEDAL_IDS): first tames, a tame per size class, each island visited, each boss lair seen
    isles: { node: 'w7-isles', name: 'Hearthvale Isles', medals: [['tame1', 'First tame'], ['log6', '6 creatures seen'], ['ride1', 'First ride'], ['stable5', '5 tames'],
      ['tame_s', 'Small friend'], ['tame_m', 'Medium friend'], ['tame_l', 'Large friend'], ['tame_xl', 'Giant friend'], ['visit_home', 'Hearth Isle'],
      ['visit_jungle', 'Verdant Jungle'], ['visit_reef', 'Coral Reef'], ['visit_ice', 'Frostfang Tundra'], ['visit_mars', 'Red Waste'],
      ['boss_fernjaw_tyrant', 'Fernjaw Tyrant seen'], ['boss_tide_hydra', 'Tide Hydra seen'], ['boss_frost_dragon', 'Frost Dragon seen'], ['boss_red_titan', 'Red Titan seen']] },
    // Bug Safari (games/festival/bugs.html, MMBugs.MEDAL_IDS): written to its own key pixeltown-medals-bugs-v1
    bugs: { node: 'w5-safari', name: 'Bug Safari', medals: [['first_catch', 'First catch'], ['species7', 'All 7 bugs'], ['stars10', '10 stars'], ['moonwing', 'Moonwing']] },
  };
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const keyOf = (game) => 'pixeltown-medals-' + game + '-v1';
  // raw: a JSON string or a parsed value. Returns a de-duplicated array of whitelisted medal ids.
  function clean(raw, game) {
    if (!own(GAMES, game)) return [];
    let o = raw;
    if (typeof raw === 'string') { try { o = JSON.parse(raw); } catch (e) { return []; } }
    if (!o || typeof o !== 'object' || Array.isArray(o) || !Array.isArray(o.m)) return [];
    const ok = GAMES[game].medals.map((m) => m[0]), out = [];
    o.m.slice(0, 64).forEach((id) => { if (typeof id === 'string' && ok.indexOf(id) >= 0 && out.indexOf(id) < 0) out.push(id); });
    return out;
  }
  // Jam medals from its validated save. songs = MMJamSongs (cleanSave + totalStars); without it Jam shows nothing.
  function jamMedals(raw, songs) {
    if (!songs || typeof songs.cleanSave !== 'function') return [];
    let o = null;
    try { o = JSON.parse(raw); } catch (e) { return []; }
    let save, stars = 0;
    try { save = songs.cleanSave(o); stars = songs.totalStars(save); } catch (e) { return []; }
    const m = [];
    if (stars >= 1) m.push('star1');
    if (stars >= 12) m.push('stars12');
    if (save && save.fullCombo === true) m.push('fullcombo');
    return m;
  }
  function read(storage, songs) {
    const out = {};
    Object.keys(GAMES).forEach((g) => {
      let raw = null;
      try { raw = storage.getItem(g === 'jam' ? 'pixeltown-jam-v1' : keyOf(g)); } catch (e) { raw = null; }
      out[g] = g === 'jam' ? jamMedals(raw, songs) : clean(raw, g);
    });
    return out;
  }
  // Game id for a hub node id, or null.
  function gameOfNode(nodeId) { return Object.keys(GAMES).filter((g) => GAMES[g].node === nodeId)[0] || null; }
  return { GAMES, keyOf, clean, read, gameOfNode };
}));
