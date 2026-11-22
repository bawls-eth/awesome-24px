// CZ1: MMCollections.read(storage), the Collections book view model (pure, read-only, local keys only). Node, no browser, no server.
// Run: node game/tests/shared-mm-collections.test.js
const { check, done } = require('./helpers');
const K = require('../shared/mm-collections.js');
const Creatures = require('../shared/mm-creatures.js');
const Packs = require('../shared/mm-biome-packs.js');
const Bugs = require('../shared/mm-bugs.js');
const Angler = require('../shared/mm-angler.js');
const Gear = require('../shared/mm-gear.js');
const Build = require('../shared/mm-dd-build.js');
const Isles = require('../shared/mm-isles.js');
const fs = require('fs');
const path = require('path');

const GUILT = /streak|missed|expire|hurry|last chance|don'?t lose|come back|countdown|timer|hours? left|before it|daily/i;
// A spying Storage: every write-ish call is recorded; getItem reads the seed (strings as given, objects as JSON)
function store(seed, opts) {
  opts = opts || {};
  const calls = [], reads = [];
  const s = {
    getItem(k) { reads.push(k); if (opts.throws) throw new Error('blocked'); return Object.prototype.hasOwnProperty.call(seed, k) ? (typeof seed[k] === 'string' ? seed[k] : JSON.stringify(seed[k])) : null; },
    setItem(k) { calls.push('set:' + k); }, removeItem(k) { calls.push('rm:' + k); }, clear() { calls.push('clear'); }, key() { calls.push('key'); return null; },
    get length() { calls.push('length'); return 0; },
  };
  return { s, calls, reads };
}
const byId = (book) => { const o = {}; book.sets.forEach((x) => { o[x.id] = x; }); return o; };
const counts = (book) => book.sets.map((x) => x.id + ' ' + x.found + '/' + x.total).join(', ');
const IDS = ['isles_seen', 'isles_tamed', 'bugs', 'angler_fish', 'isles_cove', 'relics', 'blueprints', 'trophies'];

// 1. the embedded tables match their owner modules (drift guard)
const T = K.TABLES;
check('creature table = MMCreatures.list() (ids + names, same order)', JSON.stringify(T.CREATURES) === JSON.stringify(Creatures.list().map((d) => [d.id, d.name])));
check('not-tameable list = MMCreatures tameable:false', JSON.stringify(T.NOT_TAMEABLE) === JSON.stringify(Creatures.list().filter((d) => !d.tameable).map((d) => d.id)));
check('canon map = MMBiomePacks.CANON', JSON.stringify(T.CANON) === JSON.stringify(Packs.CANON));
check('bug table = MMBugs.TYPES keys', JSON.stringify(T.BUGS.map((b) => b[0])) === JSON.stringify(Object.keys(Bugs.TYPES)));
check('fish table = MMAngler.FISH (ids + names)', JSON.stringify(T.FISH) === JSON.stringify(Angler.FISH.map((f) => [f.id, f.name])));
check('cove table = MMAngler.COVE_FISH (ids + names)', JSON.stringify(T.COVE) === JSON.stringify(Angler.COVE_FISH.map((f) => [f.id, f.name])));
check('relic table = MMGear.SIG_IDS with their names', JSON.stringify(T.RELICS.map((r) => r[0])) === JSON.stringify(Array.from(Gear.SIG_IDS)) && T.RELICS.every((r) => Gear.sigInfo(r[0]) && Gear.sigInfo(r[0]).name === r[1]));
const bps = Build.BLUEPRINTS || [];
check('blueprint table = MMDDBuild.BLUEPRINTS (id, name, goal)', bps.length === 3 && JSON.stringify(T.BLUEPRINTS) === JSON.stringify(bps.map((b) => [b.id, b.name, b.goal])), JSON.stringify(bps));
check('trophy table = MMIsles.TROPHY_IDS', JSON.stringify(T.TROPHIES.map((t) => t[0])) === JSON.stringify(Isles.TROPHY_IDS));
const nav = require('../shared/mm-nav.js');
check('every set links to an MMNav place', T.SETS.every((s) => nav.place(s.place)) && T.STEPS.every((s) => nav.place(s.place)));

// 2. empty storage: 8 sets, all 0 found, the right totals, 3 first steps
let st = store({});
let b = K.read(st.s);
check('8 sets in a fixed order', JSON.stringify(b.sets.map((x) => x.id)) === JSON.stringify(IDS), counts(b));
const tot = byId(b);
check('totals: 39 seen, 33 tameable, 9 bugs, 48 fish, 6 cove, 6 relics, 3 blueprints, 4 trophies',
  tot.isles_seen.total === 39 && tot.isles_tamed.total === 33 && tot.bugs.total === 9 && tot.angler_fish.total === 48 && tot.isles_cove.total === 6 && tot.relics.total === 6 && tot.blueprints.total === 3 && tot.trophies.total === 4, counts(b));
check('empty: nothing found anywhere', b.found === 0 && b.sets.every((x) => x.found === 0 && x.entries.every((e) => e.found === false)) && b.total === 148, b.found + '/' + b.total);
check('empty: 3 first steps (isles, bugs, angler)', b.steps.length === 3 && JSON.stringify(b.steps.map((s) => s.place)) === JSON.stringify(['isles', 'bugs', 'angler']));
check('every entry has an id, a friendly name and a found flag', b.sets.every((x) => x.entries.length === x.total && x.entries.every((e) => typeof e.id === 'string' && typeof e.name === 'string' && e.name.length > 1 && !/_/.test(e.name) && typeof e.found === 'boolean')));
check('no write calls on empty storage', st.calls.length === 0, st.calls.join(','));

// 3. seeded storage: counts per set
const seed = {
  'pixeltown-archipelago-v1': { v: 1, log: { seen: { clover_hopper: 3, puffwool: 1, parrotlet: 2, frostfox: 0, nope_species: 9 }, tamed: { puffwool: 1 }, ko: {}, bugs: {}, fish: {} },
    trophies: { trophy_tyrant: 1, trophy_titan: 2, trophy_hydra: 3, trophy_bogus: 1 } },
  'pixeltown-tames-v1': { v: 1, n: 2, roster: [{ id: 't1', sp: 'puffwool' }, { id: 't2', sp: 'rimewolf' }, { id: 't3', sp: 'frost_dragon' }], party: [], mount: null },
  'pixeltown-bugs-v1': { v: 1, stars: {}, best: {}, journal: { ladybug: 4, moonwing: 1, firefly: 0, wasp: 3 } },
  'pixeltown-angler-v1': { caught: { minnow: { n: 2, best: 5 }, old_whiskers: { n: 1, best: 80 }, koi: { n: 0 }, fake: { n: 3 } }, cove: { pearl_ray: { n: 1, best: 9 } } },
  'pixeltown-save-v1': { realm: { items: [{ n: 1, id: 'arm_sig_dread', r: 0, t: 12 }, { n: 2, id: 'sparkwand', r: 2 }] } },
  'pixeltown-mm-v1': { v: 1, stash: [null, { id: 'arm_sig_maw', r: 0, t: 12 }], heroes: [{ id: 'h1', items: [{ id: 'arm_sig_lich', r: 0, t: 12 }], keepsake: { id: 'arm_sig_oracle', r: 0 } }] },
  'pixeltown-realm-v1': { finds: { pending: [{ n: 9, id: 'arm_sig_wyrm', r: 0, t: 12 }], recent: [{ id: 'arm_sig_dread', r: 0 }] } },
  'pixeltown-deepdelve-v1': { v: 1, goals: { buildHut: true, buildBridge: 'yes', buildLighthouse: true } },
};
st = store(seed);
b = K.read(st.s);
const s3 = byId(b);
check('isles seen: clover_hopper, puffwool, chompbill (parrotlet canon), rimewolf + frost_dragon (from tames) = 5', s3.isles_seen.found === 5 && s3.isles_seen.entries.filter((e) => e.found).map((e) => e.id).sort().join() === 'chompbill,clover_hopper,frost_dragon,puffwool,rimewolf', counts(b));
check('isles tamed: puffwool + rimewolf (frost_dragon is not tameable, so not on the list) = 2', s3.isles_tamed.found === 2 && s3.isles_tamed.entries.every((e) => e.id !== 'frost_dragon'), counts(b));
check('bugs: ladybug + moonwing = 2', s3.bugs.found === 2, counts(b));
check('angler fish: minnow + Old Whiskers = 2 (n 0 and unknown ids ignored)', s3.angler_fish.found === 2, counts(b));
check('isles cove: pearl ray = 1', s3.isles_cove.found === 1, counts(b));
check('relics: dread (backpack), maw (stash), lich (hero), oracle (keepsake), wyrm (finds) = 5; hydra not', s3.relics.found === 5 && !s3.relics.entries.find((e) => e.id === 'arm_sig_hydra').found, counts(b));
check('relic names say the boss', s3.relics.entries[0].name === 'Dread Plate (Dread Knight)');
check('blueprints: hut + lighthouse (only true counts) = 2', s3.blueprints.found === 2, counts(b));
check('trophies: tyrant (1) + titan (2) = 2 (tier 3 and unknown ids ignored)', s3.trophies.found === 2, counts(b));
check('book totals add up and no first steps once something is found', b.found === 5 + 2 + 2 + 2 + 1 + 5 + 2 + 2 && b.steps.length === 0);
check('seeded: no write calls (only getItem)', st.calls.length === 0, st.calls.join(','));
check('reads only the eight known local keys', st.reads.every((k) => Object.prototype.hasOwnProperty.call(seed, k)) && new Set(st.reads).size === 8, JSON.stringify(st.reads));
check('deterministic: the same storage gives the same book', JSON.stringify(K.read(store(seed).s)) === JSON.stringify(b));

// 4. hostile input -> empty sets, never throws, never pollutes
const hostile = [
  {}, { 'pixeltown-archipelago-v1': 'not json{' }, { 'pixeltown-archipelago-v1': 'null' }, { 'pixeltown-archipelago-v1': '[1,2,3]' }, { 'pixeltown-archipelago-v1': '"str"' },
  { 'pixeltown-archipelago-v1': '{"log":{"seen":{"__proto__":{"clover_hopper":1},"constructor":5,"toString":1}},"trophies":{"__proto__":{"trophy_tyrant":1}}}' },
  { 'pixeltown-archipelago-v1': '{"__proto__":{"log":{"seen":{"puffwool":1}}},"log":[1]}' },
  { 'pixeltown-tames-v1': '{"roster":{"0":{"sp":"puffwool"}}}' }, { 'pixeltown-tames-v1': '{"roster":[null,1,"puffwool",{"sp":5},{"sp":"__proto__"},{"sp":"x".repeat(5000)}]}' },
  { 'pixeltown-bugs-v1': '{"journal":{"ladybug":"4","butterfly":true,"beetle":-1,"cricket":NaN}}' }, { 'pixeltown-bugs-v1': '{"journal":{"ladybug":1e999}}' },
  { 'pixeltown-angler-v1': '{"caught":{"minnow":1,"koi":{"n":"2"},"__proto__":{"n":1}},"cove":["pearl_ray"]}' },
  { 'pixeltown-save-v1': '{"realm":{"items":"arm_sig_dread"}}' }, { 'pixeltown-save-v1': '{"realm":{"items":[{"id":["arm_sig_dread"]},{"id":{"toString":"arm_sig_dread"}}]}}' },
  { 'pixeltown-mm-v1': '{"stash":"arm_sig_maw","heroes":{"items":[{"id":"arm_sig_maw"}]}}' }, { 'pixeltown-realm-v1': '{"finds":[{"id":"arm_sig_wyrm"}]}' },
  { 'pixeltown-deepdelve-v1': '{"goals":{"buildHut":1,"buildBridge":"true","__proto__":{"buildLighthouse":true}}}' },
  { 'pixeltown-archipelago-v1': '{"log":{"seen":{"clover_hopper":1}}}'.padEnd(300000, ' ') },
];
let allEmpty = true, threw = null;
hostile.forEach((h, i) => {
  try { const r = K.read(store(h).s); if (r.found !== 0 || r.steps.length !== 3 || r.sets.length !== 8) { allEmpty = false; console.log('  not empty: case ' + i + ' ' + counts(r)); } } catch (e) { threw = i + ': ' + e.message; }
});
check('hostile / corrupt values (incl __proto__, wrong types, NaN, Infinity, huge key) -> empty sets', allEmpty && threw === null, String(threw));
check('no prototype pollution', ({}).clover_hopper === undefined && ({}).log === undefined && ({}).n === undefined && ({}).buildLighthouse === undefined);
const thr = store(seed, { throws: true });
let tb = null; try { tb = K.read(thr.s); } catch (e) { tb = null; }
check('a throwing storage -> empty sets, no throw', tb && tb.found === 0 && tb.sets.length === 8);
const odd = [null, undefined, 5, 'x', {}, { getItem: 5 }, { getItem: () => 42 }, { getItem: () => ({ log: { seen: { puffwool: 1 } } }) }];
check('a missing or odd storage -> empty sets', odd.every((s) => { try { const r = K.read(s); return r.found === 0 && r.sets.length === 8; } catch (e) { return false; } }));
// a spying Proxy storage: any property other than getItem touched is recorded
const touched = [];
const proxy = new Proxy({ getItem: (k) => (seed[k] ? JSON.stringify(seed[k]) : null) }, { get(t, p) { if (p !== 'getItem') touched.push(String(p)); return t[p]; } });
K.read(proxy);
check('the storage is only ever asked for getItem (Proxy spy)', touched.length === 0, touched.join(','));

// 5. wording: no urgency / guilt words anywhere, totals only
const words = K.strings().concat(K.read(store(seed).s).sets.map((x) => K.line(x.found, x.total)));
const bad = words.filter((w) => GUILT.test(w));
check('wording has no urgency words (streak, missed, expires, hurry, last chance, don\'t lose, come back, timer...)', bad.length === 0, bad.join(' | '));
check('the calm note says finding things is optional', /optional/i.test(K.NOTE));
check('line() reads "N of M found"', K.line(3, 9) === '3 of 9 found');
const src = fs.readFileSync(path.join(__dirname, '../shared/mm-collections.js'), 'utf8');
check('module source: no setItem / removeItem / clear / Date / timers / network', !/\.setItem\(|\.removeItem\(|\.clear\(|Date\.now|new Date|setTimeout|setInterval|fetch\(|XMLHttpRequest|WebSocket|firebase/i.test(src));
check('the result is plain data: entries are fresh objects each call', K.read(store({}).s).sets[0].entries !== K.read(store({}).s).sets[0].entries);

done();
