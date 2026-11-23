// Old-save fixtures for the save / migration safety suite (save-compat-*.test.js). One entry per stored key, in an EARLY shape that
// a real player could still have on disk: fields that older builds wrote (from git history of game/ and the seeds in game/tests),
// with real progress in every field so a page that drops a field is caught as data loss. Values are JSON-able objects, or raw strings
// for the keys that hold a plain flag. Nothing here is written to Firebase; the browser tests seed these into a page's localStorage only.
//
// `src` says where the shape comes from (commit that introduced the key, or the test that seeded it). `volatile` lists leaf paths a
// page may legitimately rewrite on load (a clock, a "last place" pointer, a counter that goes UP); every other leaf must still be there,
// unchanged, after the page has loaded and saved (additive-only writes).
'use strict';

const F = {
  // Town save: the first shape (916cbf3, 2026-11-16, writeSave spreads loadSave()) plus fields added since, and a legacy species.
  'pixeltown-save-v1': {
    src: '916cbf3 main.js writeSave (+ later additive fields)',
    value: {
      name: 'ADMINold', species: 'goldenpunks', frame: 5, sfxMuted: true, musicEnabled: false,
      resources: { wood: 12, stone: 7, fruit: 3, fish: 2 },
      fossilsHeld: ['amber'], museumCollection: ['trilobite', 'ammonite'],
      lifetimeStats: { wood: 40, stone: 22, fish: 9, bugs: 4, chatSent: 0 },
      achievementsUnlocked: ['craft1', 'fish1'],
      loginStreak: 3, lastLoginDate: '2026-11-15', questClaimedBucket: 'q-2026-11-15', kkEnjoyedWindow: 'kk-1',
      bestieId: 'v2', bestieName: 'Maple',
      realm: { level: 3, xp: 10, shards: 25, bestWave: 4, kills: 31, deaths: 2, kb: { spiral: 3, aimed: 4, ring: 1, drifter: 2, boss: 0 }, items: [] },
      oldUnknownField: { kept: true, n: 7 }
    },
    volatile: ['loginStreak', 'lastLoginDate', 'lastSeenVersion', 'realm']
  },
  'pixeltown-realm-v1': {
    src: '30caf9c realm-world cleanSave (unknown keys kept)',
    value: { v: 1, seed: 'abc123', version: 2, pos: { x: 40, y: 52 }, stats: { kills: 12, bossKills: 1, portals: 3, events: 2, eventWins: 1 }, evT: 5000, evDone: ['ev:12:1'], futureKey: 'keep-me' },
    volatile: ['pos', 'evT', 'version', 'seed', 'stats', 'evDone']
  },
  'pixeltown-mm-v1': {
    src: '4053b74 MMProfile (heroes/stash/fame)',
    value: { v: 1, heroes: [{ id: 'h1', name: 'Ada', cls: 'ranger', level: 4, xp: 3, fame: 2, bonus: 0, mode: 'classic', items: [] }], stash: [{ id: 'potion', n: 2 }, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null], fame: 14, mode: 'classic', hall: [], migratedFrom: null },
    volatile: []
  },
  'pixeltown-mm-active-v1': { src: '4053b74 MMProfile.cleanActive', value: { v: 1, heroId: 'h1' }, volatile: [] },
  'pixeltown-profile-v1': {
    src: '4053b74 MMHubProfile (+ games / results)',
    value: { v: 1, id: 'p_local', created: 1, name: 'ADMINold', species: 'goldenpunks', frame: 5, settings: {}, map: { at: 'w0-square', world: 'w0', seenPaths: [] }, nodes: {}, keys: 1, keysUsed: [], comets: [], tokens: 2, unlocks: [], games: { lantern: { done: ['hero1'] }, jam: { done: ['play', 'star1'] } }, results: [] },
    volatile: ['map', 'nodes', 'keys', 'keysUsed', 'results', 'games', 'tokens', 'unlocks', 'comets']
  },
  'pixeltown-hub-v1': { src: '281f45c MMMap.cleanHub', value: { v: 1, at: 'w0-square', nodes: {}, seenPaths: [], keys: 0, keysUsed: [], comets: [] }, volatile: ['at', 'nodes', 'seenPaths', 'keys', 'keysUsed', 'comets'] },
  'pixeltown-archipelago-v1': {
    src: '52ecb0a MMIsles (tests seed {isles:{jungle:{seed}}})',
    value: { v: 1, at: 'home', returnTo: null, unlock: ['jungle'], isles: { jungle: { seed: '123' } }, home: { grid: [], stable: { slots: 12 } }, log: { seen: { clover_hopper: 1 }, ko: {}, tamed: {}, bugs: {}, fish: {} }, rides: 2, wild: {}, visited: ['jungle'], bosses: [] },
    volatile: ['at', 'returnTo', 'wild', 'gather', 'isles', 'home', 'inv', 'log']
  },
  'pixeltown-tames-v1': { src: '52ecb0a MMTames', value: { v: 1, n: 1, roster: [{ id: 't1', sp: 'puffwool', nm: 'Fluff' }], party: [], mount: null }, volatile: ['roster', 'party', 'mount'] },
  'pixeltown-medals-isles-v1': { src: '52ecb0a MMIsles medals', value: { v: 1, m: ['tame1', 'ride1'] }, volatile: [] },
  'pixeltown-jam-v1': { src: '4053b74 jam save (medals test seed)', value: { v: 1, best: { 'warm-embers': { easy: { score: 1200, stars: 2, rank: 'B', combo: 30 }, hard: { score: 9000, stars: 3, rank: 'S', combo: 120 } } }, plays: 5, fullCombo: true }, volatile: ['plays'] },
  'pixeltown-jam-assist-v1': { src: 'jam.js persistAssist', value: { on: true, best: { 'warm-embers': { easy: { score: 900, rank: 'B' } } }, section: { 'warm-embers:easy:100:1-8': 12 } }, volatile: [] },
  'pixeltown-deepdelve-v1': { src: 'a322a5f deepdelve meta (medals test seed)', value: { v: 1, mode: 'survival', goals: { bronze: true, silver: true, maxDepth: 9, buildHut: true } }, volatile: ['cave', 'mode'] },
  'pixeltown-deepdelve-runs-v1': { src: 'dd-run.js MMDDRun.clean', value: { v: 1, runs: 4, safe: 2, best: { score: 340, depth: 12, ores: 9, combo: 3 } }, volatile: [] },
  'pixeltown-angler-v1': { src: '4053b74 angler journal (collections test seed)', value: { caught: { minnow: { n: 2, best: 5 }, koi: { n: 1, best: 30 } }, cove: { pearl_ray: { n: 1, best: 9 } } }, volatile: ['v', 'tour', 'gear', 'coins', 'bait'] },
  'pixeltown-angler-fun-v1': { src: 'angler.js cleanFun', value: { v: 1, bestStreak: 3, bestReact: 200, streak: 0 }, volatile: ['streak', 'cond'] },
  'pixeltown-stalk-v1': { src: '4053b74 stalk save', value: { v: 1, medals: { bronze: true, silver: true, gold: false }, played: 2 }, volatile: [] },
  'pixeltown-stalk-practice-v1': { src: 'stalk.js cleanPr', value: { v: 1, n: 3, best: 5, rounds: 2, hasBest: true }, volatile: ['n', 'moodBest'] },
  'pixeltown-bugs-v1': { src: 'fb188c4 bugs journal', value: { v: 1, stars: { meadow: 3, orchard: 2 }, best: { meadow: 410 }, journal: { ladybug: 4, butterfly: 2, moonwing: 1 } }, volatile: [] },
  'pixeltown-bugs-pb-v1': { src: 'bugs.js cleanPb', value: { v: 1, combo: { meadow: 5 }, runs: 2 }, volatile: ['mod'] },
  'pixeltown-bugs-goals-v1': { src: 'MMBugs.cleanGoals', value: { v: 1, done: { meadow: ['m1', 'm2'], orchard: [], pond: [], forest: [], dunes: [], cliffs: [], marsh: [], lantern: [], glade: [] } }, volatile: [] },
  'pixeltown-dash-v1': { src: '85bcb26 dash load()', value: { v: 1, hint: true, best: 1234, bestScore: 5678, bestCombo: 9, runs: 3, medals: ['run1'] }, volatile: ['ghost'] },
  'pixeltown-pop-v1': { src: 'pop load()', value: { v: 1, hint: true, best: 777, bestTile: 6, bestChain: 4, rounds: 3, medals: ['round1'] }, volatile: [] },
  'pixeltown-stack-v1': { src: 'stack load()', value: { v: 1, hint: true, best: 21, bestCombo: 5, rounds: 4, medals: [] }, volatile: [] },
  'pixeltown-echo-v1': { src: 'echo load()', value: { v: 1, hint: true, best: 7, bestScore: 330, rounds: 2, medals: [] }, volatile: [] },
  'pixeltown-gift-v1': { src: '47ea364 MMGift', value: { v: 1, days: 4, last: '2026-11-20' }, volatile: [] },
  'pixeltown-access-v1': { src: '47ea364 MMAccess.prefs', value: { v: 1, palette: 'normal', hudScale: 1, flashes: true, bulletOutline: true, lowGfx: false }, volatile: [] },
  'pixeltown-nav-v1': { src: 'e3b3299 MMNav (nav test seed)', value: { v: 1, last: { id: 'angler', sub: '', url: 'game/games/angler/index.html', t: 1 }, prev: null }, volatile: ['last', 'prev'] },
  'pixeltown-calm-v1': { src: 'a98d9e9 hub calm', value: { v: 1 }, volatile: ['*'] },
  'pixeltown-feedback-v1': { src: '8c7fb91 MMFeedback', value: { v: 1, entries: [{ id: 'f1old', t: '2026-11-22T10:00Z', k: 'bug', page: 'hub', text: 'old note', ua: 'desktop' }] }, volatile: [] },
  'pixeltown-arms-v1': { src: 'mad-maze arms (backup test seed)', value: { v: 1, seen: ['a'] }, volatile: ['*'] },
  'pixeltown-gate-pointer-v1': { src: 'main.js loadGatePointer', value: { v: 1, dismissed: true, reached: false }, volatile: ['reached'] },
  'pixeltown-panel-collapsed': { src: 'main.js panel', raw: '1', volatile: ['*'] },
  'pixeltown-medals-pop-v1': { src: 'pop persist', value: { v: 1, m: ['round1'] }, volatile: [] },
  'pixeltown-medals-dash-v1': { src: 'dash persist', value: { v: 1, m: ['run1'] }, volatile: [] },
  'mm-sfx-muted': { src: 'shared/sfx.js', raw: '1', volatile: [] },
  'mm-music': { src: 'mm-settings', raw: '0', volatile: [] },
  'mm-high-contrast': { src: 'mm-settings', raw: '1', volatile: [] },
  'mm-reduce-motion': { src: 'shared/motion.js', raw: '0', volatile: [] },
  'mm-aim-assist': { src: 'realm.js', raw: '1', volatile: [] }
};

// The pre-gear backup snapshot (mm-backup snapshotPregear): a bundle of raw strings, written once before the gear update.
F['pixeltown-backup-pregear-v1'] = {
  src: '78bc17a MMBackup.snapshotPregear',
  value: { format: 'pixeltown-backup', v: 2, at: 1763700000000, keys: { 'pixeltown-save-v1': JSON.stringify({ name: 'ADMINold', realm: { level: 2 } }) } },
  volatile: []
};

function rawOf(k) { const f = F[k]; return f.raw !== undefined ? f.raw : JSON.stringify(f.value); }

// Every leaf path of a JSON value, e.g. 'realm.kb.spiral' or 'heroes.0.name'.
function leaves(v, pre, out) {
  out = out || [];
  if (v && typeof v === 'object') {
    const ks = Object.keys(v);
    if (!ks.length) out.push([pre, v]);
    ks.forEach((k) => leaves(v[k], pre ? pre + '.' + k : k, out));
  } else out.push([pre, v]);
  return out;
}
function at(v, p) { if (!p) return v; return p.split('.').reduce((o, k) => (o && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined), v); }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// Leaves of the fixture that are gone or changed in `after` (a parsed value), skipping the fixture's volatile paths.
function lost(key, afterRaw) {
  const f = F[key];
  if (!f) return [];
  if ((f.volatile || []).indexOf('*') >= 0) return [];
  if (f.raw !== undefined) return afterRaw === f.raw ? [] : ['(raw) ' + JSON.stringify(f.raw) + ' -> ' + JSON.stringify(afterRaw)];
  let after; try { after = JSON.parse(afterRaw); } catch (e) { return ['(unparseable after load) ' + String(afterRaw).slice(0, 60)]; }
  const vol = f.volatile || [];
  return leaves(f.value, '').filter(([p]) => !vol.some((x) => p === x || p.indexOf(x + '.') === 0))
    .filter(([p, v]) => { const a = at(after, p); return !(same(a, v) || (v && typeof v === 'object' && !Object.keys(v).length && a && typeof a === 'object')); })
    .map(([p, v]) => p + ': ' + JSON.stringify(v) + ' -> ' + JSON.stringify(at(after, p)));
}

module.exports = { FIXTURES: F, KEYS: Object.keys(F), rawOf, leaves, at, lost };
