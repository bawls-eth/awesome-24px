// FZ: seeded fuzz of the Realm cross-tab save merge (realm.js rmCleanSave / rmMergeSave). Node only, no browser, no storage, no network.
// Run: node game/tests/save-merge-fuzz.test.js            (FUZZ_RUNS=n to change the 5000 runs, FUZZ_SEED=s to replay one run with a trace)
//
// realm.js is a browser script (no module.exports), so its top half (everything before `class RealmArena`: constants, cleaners, the merge) is
// evaluated in a vm sandbox with MMGear / MMGearAffix as globals, the way the Realm page loads them. No DOM, no location (so no ?gear=0 etc.).
//
// Each run: 2-3 "tabs" share one fake pixeltown-save-v1. A NEW tab follows RealmArena exactly (resyncSave / _persist / _syncBase: three-way
// shards, dust and gp, `known` uids). Ops: pick, sell, salvage, combine, reforge (a fresh uid, like realm.js), gp change, a write, a FAILED write
// (storage unchanged), and storage events that reach the other tabs late (a race window). In some runs one tab is an OLD tab: the cleaner and
// merge from before GW (realm.js at the parent of 2451f5b, pasted below from git history), which strips `sig`, `f` and `dust`.
//
// Every physical item gets a ledger id (lid) that follows it through uid remaps, so the invariants are about real items, not uids:
//   I1 no duplicate uid in any merge result
//   I2 a NEW-tab merge never loses a live item that the tab or storage held (lost only by an explicit sell / salvage / combine / reforge, by an
//      OLD tab's write, or by the 24-slot cut)
//   I3 the 24-slot cut keeps equipped items, then higher tier, then higher rarity: never a soulbound / T12 dropped before a lower item
//   I4 a NEW-tab merge keeps `f` / `sig` of every item it keeps, and keeps the `dust` key when either side had it
//   I5 shards / dust / gp are never negative; merged pack <= 24
//   I6 after all tabs converge (no old tab writes), storage holds every live item and the exact shard total (and the dust total when no old tab ran)
// A real bug found by this fuzz is NOT hidden: it is listed in KNOWN below keyed by seed (with the issue), printed every run, and reported.
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');

// ---------- load realm.js (top half) in a sandbox ----------
const realmSrc = fs.readFileSync(path.join(ROOT, 'realm.js'), 'utf8');
const cut = realmSrc.indexOf('\nclass RealmArena');
if (cut < 0) throw new Error('realm.js: class RealmArena not found');
const sandbox = { MMGear: require('../shared/mm-gear.js'), MMGearAffix: require('../shared/mm-gear-affix.js'), console };
vm.createContext(sandbox);
// Both sources run inside one function scope with the builtins as locals (a vm global lookup per Math / Number call is ~10x slower).
const WRAP = '(function () { const Math = globalThis.Math, Number = globalThis.Number, Object = globalThis.Object, Array = globalThis.Array, Set = globalThis.Set, '
  + 'Map = globalThis.Map, JSON = globalThis.JSON, MMGear = globalThis.MMGear, MMGearAffix = globalThis.MMGearAffix;\n';

// The pre-GW cleaner and merge, verbatim from `git show 2451f5b^:game/realm.js` (renamed *Old; the old merge calls the old cleaner and has no
// 24-slot ranking cut, the old cleaner just keeps the first 24). They run on the same helpers (rmCleanGear etc. are unchanged since).
const OLD_SRC = String.raw`
function rmCleanSaveOld(s) {
  s = s && typeof s === 'object' ? s : {};
  const out = { shards: rmCleanCount(s.shards), bestWave: rmCleanCount(s.bestWave), kills: rmCleanCount(s.kills), deaths: rmCleanCount(s.deaths) };
  const kb = s.kb && typeof s.kb === 'object' ? s.kb : {};
  out.kb = { spiral: rmCleanCount(kb.spiral), aimed: rmCleanCount(kb.aimed), ring: rmCleanCount(kb.ring), drifter: rmCleanCount(kb.drifter), boss: rmCleanCount(kb.boss) };
  out.bossBestT = Math.min(rmCleanCount(s.bossBestT), 999999);
  out.level = Math.max(1, Math.min(RM_MAX_LEVEL, rmCleanCount(s.level) || 1));
  out.xp = out.level >= RM_MAX_LEVEL ? 0 : Math.min(rmCleanCount(s.xp), rmXpNeeded(out.level) - 1);
  out.items = [];
  const seen = new Set();
  (Array.isArray(s.items) ? s.items.slice(0, 200) : []).forEach((it) => {
    if (out.items.length >= RM_BACKPACK || !it || typeof it !== 'object') return;
    const uid = rmCleanCount(it.n);
    let id = typeof it.id === 'string' ? it.id : null, aliasT;
    const al = id && typeof MMGear !== 'undefined' && MMGear && typeof MMGear.alias === 'function' ? MMGear.alias(id) : null;
    if (al && al.id) { id = al.id; aliasT = al.t; }
    const def = id ? (RM_ITEM_BY_ID[id] || (RM_WPN_ID.test(id) || RM_ARM_ID.test(id) ? rmInertDef(id) : null)) : null;
    const rar = Math.floor(Number(it.r));
    if (!uid || seen.has(uid) || !def || !(rar >= 0 && rar < RM_RARITIES.length)) return;
    seen.add(uid);
    const o = { n: uid, id, r: rar };
    const g = rmCleanGear(id, rar, it, aliasT);
    if (g.t) { o.t = g.t; if (g.a) o.a = g.a; }
    out.items.push(o);
  });
  out.nextUid = Math.max(rmCleanCount(s.nextUid), 1 + out.items.reduce((m, it) => Math.max(m, it.n), 0));
  out.eq = {};
  const eq = s.eq && typeof s.eq === 'object' ? s.eq : {};
  RM_EQ_KEYS.forEach((slot) => {
    const it = out.items.find((x) => x.n === rmCleanCount(eq[slot]));
    if (!it) return;
    const sl = RM_ITEM_BY_ID[it.id].slot;
    if (sl === slot || (slot === 'armor' && sl === 'none' && RM_ARM_ID.test(it.id))) out.eq[slot] = it.n;
  });
  if (s.gv === 1 || out.items.some((x) => x.t)) out.gv = 1;
  if (s.gp !== undefined) { const gp = s.gp && typeof s.gp === 'object' && !Array.isArray(s.gp) ? s.gp : {}; out.gp = { b: Math.min(rmCleanCount(gp.b), 9999), d: Math.min(rmCleanCount(gp.d), 9999) }; }
  return out;
}
function rmMergeSaveOld(mine, stored, opts) {
  opts = opts || {};
  const a = rmCleanSaveOld(mine); const b = rmCleanSaveOld(stored);
  const out = {};
  out.bestWave = Math.max(a.bestWave, b.bestWave); out.kills = Math.max(a.kills, b.kills); out.deaths = Math.max(a.deaths, b.deaths);
  out.kb = {}; Object.keys(a.kb).forEach((k) => { out.kb[k] = Math.max(a.kb[k], b.kb[k]); });
  out.bossBestT = a.bossBestT && b.bossBestT ? Math.min(a.bossBestT, b.bossBestT) : (a.bossBestT || b.bossBestT);
  const lead = (a.level > b.level || (a.level === b.level && a.xp >= b.xp)) ? a : b;
  out.level = lead.level; out.xp = lead.xp;
  const base = Number.isFinite(opts.base) ? opts.base : a.shards;
  out.shards = Math.max(0, b.shards + (a.shards - base));
  const known = opts.known || new Set();
  let next = Math.max(a.nextUid, b.nextUid);
  const items = []; const remap = {};
  const byUid = new Map(b.items.map((it) => [it.n, it]));
  a.items.forEach((it) => {
    const other = byUid.get(it.n);
    if (!other) { if (known.has(it.n)) return; items.push({ ...it }); return; }
    if (other.id === it.id && other.r === it.r && (other.t || 0) === (it.t || 0) && (other.a || 0) === (it.a || 0)) { items.push({ ...it }); return; }
    const fresh = next++; remap[it.n] = fresh; items.push({ ...it, n: fresh });
  });
  const have = new Set(items.map((it) => it.n));
  b.items.forEach((it) => {
    if (have.has(it.n)) return;
    const mineHas = a.items.some((x) => x.n === it.n);
    if (!mineHas && known.has(it.n)) return;
    items.push({ ...it }); have.add(it.n);
  });
  const eq = { ...a.eq }; Object.keys(eq).forEach((slot) => { if (remap[eq[slot]] !== undefined) eq[slot] = remap[eq[slot]]; });
  out.items = items; out.nextUid = next; out.eq = eq;
  if (a.gv || b.gv) out.gv = 1;
  if (a.gp || b.gp) { const ga = a.gp || { b: 0, d: 0 }, gb = b.gp || { b: 0, d: 0 }; const bs = opts.baseGp;
    out.gp = bs ? { b: Math.max(0, gb.b + (ga.b - bs.b)), d: Math.max(0, gb.d + (ga.d - bs.d)) } : { b: Math.max(ga.b, gb.b), d: Math.max(ga.d, gb.d) }; }
  return rmCleanSaveOld(out);
}
globalThis.__O = { rmCleanSaveOld, rmMergeSaveOld };`;
vm.runInContext(WRAP + realmSrc.slice(0, cut) + '\n;globalThis.__R = { rmCleanSave, rmMergeSave, RM_BACKPACK, RM_SIG_IDS, RM_AFFIX_IDS };\n' + OLD_SRC + '\n})();', sandbox, { filename: 'realm.js+old-cleaner' });
const { rmCleanSave, rmMergeSave, RM_BACKPACK, RM_SIG_IDS, RM_AFFIX_IDS } = sandbox.__R;
const { rmCleanSaveOld, rmMergeSaveOld } = sandbox.__O;

// Known issues found by this fuzz, allow-listed BY SEED: a seed listed under an issue may show that issue (and only that one); any other issue in any
// seed fails. All of them are printed on every run (count, seeds, shortest repro) so they are never silent. Regenerate a list with FUZZ_LIST=1.
const KNOWN = {
  'A-twin-uid': {
    what: "two tabs that pick the same plain item (same id / r / t / a, no affix seed) before either sees the other's write give it the same uid; rmMergeSave reads the two items as one (identity = n, id, r, t, a) and one copy is lost",
    seeds: [
      15718090, 67887965, 71031583, 76129654, 82416890, 86325796, 89469414, 91847744, 94991362, 99665556, 105952792, 137730383, 150304855, 152259308,
      167553521, 175029922, 189134970, 201709442, 235441486, 240539557, 264075459, 269597407, 277415219, 298996668, 304094739, 381413558, 387276917, 388466082,
      389655247, 392798865, 411236696, 423387291, 429674527, 462641283, 465361024, 500282233, 503425851, 509713087, 534438154, 560352386, 562306839, 566215745,
      600371666, 604280572, 627816474, 667070466, 667835754, 695704439, 715331435, 726716742, 759259621, 773788546, 774553834, 812618661, 843630964, 871499649,
      873454102, 891891933, 905231693, 909140599, 912708094, 931145925, 938963737, 949583756, 952303497, 968786875, 985270253, 995466395, 1009995320, 1032765934,
      1035909552, 1038629293, 1043727364, 1044151241, 1061399907, 1064543525, 1068452431, 1070406884, 1073974379, 1097510281, 1112804494, 1123000636, 1129287872, 1135151231,
      1146536538, 1161065463, 1183412200, 1190888601, 1197175837, 1229718716, 1260731019, 1262685472, 1270161873, 1280358015, 1284266921, 1289364992, 1292508610, 1322331748,
      1331338725, 1334482343, 1341958744, 1364305481, 1373736335, 1380023571, 1390985001, 1391408878, 1409846709, 1414944780, 1430238993, 1457683801, 1480454415, 1488696104,
      1524806478, 1531093714, 1567969376, 1595414184, 1609943109, 1630759270, 1635857341, 1639766247, 1644099030, 1719804807, 1748438780, 1757104346, 1761013252, 1770020229,
      1777496630, 1799843367, 1864587714, 1870109662, 1877927474, 1884214710, 1926612320, 1928566773, 1929332061, 1936384585, 1955246293, 1968586053, 2028997617, 2058055467,
      2073349680, 2087878605, 2101218365, 2123565102, 2126708720, 2145146551, 2147101004, 2156531858, 2158486311, 2164773547, 2222465370, 2235381253, 2235805130, 2243622942,
      2246766560, 2248721013, 2271491627, 2275824410, 2327228997, 2342523210, 2348810446, 2354673805, 2355862970, 2357817423, 2366059112, 2385686108, 2402169486, 2406078392,
      2423750935, 2431568747, 2435901530, 2466489956, 2472777192, 2498691424, 2514750925, 2515940090, 2520272873, 2526136232, 2573631913, 2583828055, 2584593343, 2605409504,
      2617560099, 2623847335, 2628180118, 2687402517, 2698022536, 2706264225, 2718414820, 2723512891, 2773728313, 2776106643, 2780015549, 2786302785, 2802362286, 2863197727,
      2867106633, 2872628581, 2879681105, 2891066412, 2907549790, 2915791479, 2924798456, 2967196066, 3007215346, 3009935087, 3037803772, 3066861622, 3072724981, 3091162812,
      3152763541, 3163383560, 3188873915, 3192782821, 3206546458, 3211220652, 3220651506, 3244187408, 3249285479, 3261859951, 3265003569, 3286585018, 3289728636, 3358381889,
      3378774173, 3392113933, 3402733952, 3403499240, 3410551764, 3437231284, 3444707685, 3465099969, 3474530823, 3476485276, 3480394182, 3526700698, 3543184076, 3638940726,
      3671907482, 3679725294, 3690345313, 3706828691, 3725266522, 3727220975, 3739371570, 3743704353, 3765285802, 3775481944, 3791965322, 3825697366, 3880245571, 3881010859,
      3881434736, 3888487260, 3910833997, 3931650158, 3937513517, 3941846300, 3943035465, 3945755206, 3956375225, 3967760532, 3970480273, 4032081002, 4036413785, 4085863919,
      4099968967, 4114497892, 4141177412, 4169046097, 4190203669, 4202778141, 4237699350, 4239653803, 4255371893, 4256137181, 4263189705, 4268711653, 4273809724, 4274575012,
    ],
  },
  'B-stale-strip': {
    what: "a new tab that adopted an OLD (pre-GW) tab's stripped write keeps its own copy of a same-uid item in rmMergeSave, so it writes the item back without f / sig even after another new tab restored them",
    seeds: [
      16907255, 271551860, 474026590, 484222732, 885604697, 950349044, 963688804, 1042962076, 1529904549, 1905796159, 2549672134, 2595978650, 2602265886, 2634043477,
      2738041816, 3356427436, 3447851303, 3726031810, 4234555732,
    ],
  },
  'C-empty-fail': {
    what: "RealmArena._persist: a write that fails while storage holds no realm yet sets the shard / dust bases to the UNSAVED totals, so that tab's delta is lost once another tab creates the save",
    seeds: [
      153448473, 887559150, 1444344041, 2534377921, 3536131552,
    ],
  },
};
const KNOWN_BY_SEED = Object.create(null);
Object.keys(KNOWN).forEach((c) => KNOWN[c].seeds.forEach((s) => { (KNOWN_BY_SEED[s] = KNOWN_BY_SEED[s] || []).push(c); }));

let pass = 0, fail = 0;
function check(name, cond, info) { if (cond) pass++; else { fail++; console.log('FAIL: ' + name + (info ? ' ' + info : '')); } }

// ---------- sanity: the sandbox really is realm.js ----------
check('sandbox: rmCleanSave and rmMergeSave loaded from realm.js', typeof rmCleanSave === 'function' && typeof rmMergeSave === 'function' && RM_BACKPACK === 24);
const t12 = rmCleanSave({ items: [{ n: 1, id: 'sparkwand', r: 2, t: 12, a: 77, sig: 'ward', f: { id: 'keen', v: 3 } }], dust: 5 });
check('sandbox: the new cleaner keeps t / a / sig / f / dust', t12.items[0].t === 12 && t12.items[0].a === 77 && t12.items[0].sig === 'ward' && t12.items[0].f.id === 'keen' && t12.dust === 5, JSON.stringify(t12));
const oldC = rmCleanSaveOld({ items: [{ n: 1, id: 'sparkwand', r: 2, t: 12, a: 77, sig: 'ward', f: { id: 'keen', v: 3 } }], dust: 5 });
check('sandbox: the old cleaner keeps t / a but strips sig / f / dust (as it did)', oldC.items[0].t === 12 && oldC.items[0].a === 77 && oldC.items[0].sig === undefined && oldC.items[0].f === undefined && oldC.dust === undefined, JSON.stringify(oldC));

// ---------- fuzz model ----------
function prng(seed) { // mulberry32, the same shape as realm.js rmRng
  let t = seed >>> 0;
  return () => { t = (t + 0x6D2B79F5) >>> 0; let r = Math.imul(t ^ (t >>> 15), 1 | t); r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r; return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
}
const IDS = ['sparkwand', 'sparkwand', 'quickwand', 'heartcharm', 'luckring', 'wpn_bow_triple', 'arm_light_scout'];
const TIERABLE = (id) => id === 'sparkwand' || id.slice(0, 4) === 'wpn_' || id.slice(0, 4) === 'arm_';
const same = (x, y) => x.id === y.id && x.r === y.r && (x.t || 0) === (y.t || 0) && (x.a || 0) === (y.a || 0); // rmMergeSave identity (minus n)
const gpOf = (g) => ({ b: g && g.b > 0 ? g.b : 0, d: g && g.d > 0 ? g.d : 0 });

function runOne(seed, trace) {
  const R = prng(seed);
  const ri = (n) => Math.floor(R() * n);
  const issues = [];
  const bad = (code, info) => { issues.push(code + (info ? ' ' + info : '')); };
  let nextLid = 1;
  const live = new Set(), consumed = new Set(), allowedGone = new Set();
  const meta = new Map(); // lid -> { dupe }
  let shardLedger = 0, dustLedger = 0, oldWrote = false, emptyFail = false;
  const store = { realm: null, lids: new Map() }; // storage + the ledger side map uid -> lid for what it holds
  const nTabs = 2 + ri(2);
  const hasOld = R() < 0.35;
  const tabs = [];
  for (let i = 0; i < nTabs; i++) tabs.push({ i, old: hasOld && i === nTabs - 1, save: rmCleanSave({}), lids: new Map(), baseShards: 0, baseDust: 0, baseGp: { b: 0, d: 0 }, known: new Set(), pending: false, dirty: false });
  const T = (s) => { if (trace) console.log('  ' + s); };

  // map result items back to lids (mine wins on a same-uid same-item tie, exactly like rmMergeSave keeps `a`'s copy; a remapped uid is mine's)
  function lidsFor(res, mine, mineLids, stored, storedLids) {
    const out = new Map(), used = new Set();
    const mi = new Map(mine.items.map((x) => [x.n, x])), si = new Map(stored.items.map((x) => [x.n, x]));
    const pend = [];
    res.items.forEach((it) => {
      const m = mi.get(it.n), s = si.get(it.n);
      let lid = null;
      if (m && same(m, it) && mineLids.has(m.n) && !used.has(mineLids.get(m.n))) lid = mineLids.get(m.n);
      else if (s && same(s, it) && storedLids.has(s.n) && !used.has(storedLids.get(s.n))) lid = storedLids.get(s.n);
      if (lid === null) { pend.push(it); return; }
      used.add(lid); out.set(it.n, lid);
    });
    pend.forEach((it) => { // a fresh uid from a collision: one of mine whose uid storage holds as a different item
      const m = mine.items.find((x) => same(x, it) && mineLids.has(x.n) && !used.has(mineLids.get(x.n)) && si.has(x.n) && !same(si.get(x.n), x));
      if (m) { const lid = mineLids.get(m.n); used.add(lid); out.set(it.n, lid); } else out.set(it.n, -1);
    });
    return out;
  }
  const verOf = (sv, lids) => { const m = new Map(); sv.items.forEach((it) => { if (lids.has(it.n)) m.set(lids.get(it.n), it); }); return m; };
  const rankOf = (it, eqd) => [eqd.has(it.n) ? 1 : 0, it.t || 0, it.r];
  const cmp = (x, y) => (x[0] - y[0]) || (x[1] - y[1]) || (x[2] - y[2]);

  // Run one merge the way a tab does and check I1-I5 (new tabs only).
  function merge(tab, label) {
    const mineRaw = tab.save, storedRaw = store.realm;
    const opts = { base: tab.baseShards, baseDust: tab.baseDust, known: tab.known, baseGp: tab.baseGp };
    const res = tab.old ? rmMergeSaveOld(mineRaw, storedRaw, opts) : rmMergeSave(mineRaw, storedRaw, opts);
    const mine = tab.old ? rmCleanSaveOld(mineRaw) : rmCleanSave(mineRaw), stored = tab.old ? rmCleanSaveOld(storedRaw) : rmCleanSave(storedRaw);
    const lids = lidsFor(res, mine, tab.lids, stored, store.lids);
    const mv = verOf(mine, tab.lids), sv = verOf(stored, store.lids), rv = verOf(res, lids);
    const inputs = new Set([...mv.keys(), ...sv.keys()].filter((l) => live.has(l) && !allowedGone.has(l)));
    const missing = [...inputs].filter((l) => !rv.has(l));
    if (tab.old) { // an old tab's losses are not the new cleaner's (a twin it merged leaves the survivor ambiguous as well)
      missing.forEach((l) => { allowedGone.add(l); const it = mv.get(l) || sv.get(l); if (tab.lids.has(it.n)) allowedGone.add(tab.lids.get(it.n)); if (store.lids.has(it.n)) allowedGone.add(store.lids.get(it.n)); });
      if (missing.length) T('old tab dropped lids ' + missing.join(','));
      return { res, lids };
    }
    // I1 / I5
    const uids = res.items.map((x) => x.n);
    if (new Set(uids).size !== uids.length) bad('I1-dup-uid', label);
    if (res.items.length > RM_BACKPACK) bad('I5-pack>24', label);
    if (!(res.shards >= 0) || (res.dust !== undefined && !(res.dust >= 0)) || (res.gp && !(res.gp.b >= 0 && res.gp.d >= 0))) bad('I5-negative', label);
    // I2 / I3. Issue A ("twin"): this tab and storage hold two DIFFERENT physical items under the same uid with the same (id, r, t, a) (two tabs
    // picked the same plain item before either saw the other's write); rmMergeSave reads them as one item and keeps only this tab's.
    if (missing.length) {
      const eqd = new Set(Object.values(res.eq || {}));
      const keptRanks = res.items.filter((x) => !eqd.has(x.n)).map((x) => rankOf(x, eqd));
      const mi = new Map(mine.items.map((x) => [x.n, x])), si = new Map(stored.items.map((x) => [x.n, x]));
      missing.forEach((l) => {
        const it = mv.get(l) || sv.get(l);
        const m = mi.get(it.n), s = si.get(it.n);
        const twin = m && s && same(m, s) && tab.lids.get(it.n) !== store.lids.get(it.n);
        if (twin) { bad('A-twin-uid', label + ' lid ' + l + ' ' + JSON.stringify(it)); allowedGone.add(tab.lids.get(it.n)); allowedGone.add(store.lids.get(it.n)); } // the survivor is now ambiguous too
        else if (res.items.length < RM_BACKPACK) bad('I2-lost-item', label + ' lid ' + l + ' ' + JSON.stringify(it));
        else if (keptRanks.some((k) => cmp(k, [0, it.t || 0, it.r]) < 0)) bad('I3-cut-order', label + ' cut ' + JSON.stringify(it));
        allowedGone.add(l); // reported once (or a legal 24-slot cut): never counted again
      });
    }
    // I4. Issue B: this tab's copy lost f / sig earlier (it adopted an OLD tab's stripped write) and storage holds the intact copy again
    // (another new tab rewrote it); the merge keeps this tab's copy of a same-uid item, so the stripped copy wins.
    rv.forEach((it, l) => {
      if (!live.has(l)) return;
      const a = mv.get(l), b = sv.get(l);
      ['f', 'sig'].forEach((k) => {
        if (!((a && a[k]) || (b && b[k])) || it[k]) return;
        if (a && !a[k] && b && b[k] && oldWrote) bad('B-stale-strip', k + ' ' + label + ' lid ' + l + ' ' + JSON.stringify([a, b]));
        else bad('I4-lost-' + k, label + ' lid ' + l + ' ' + JSON.stringify([a, b, it]));
      });
    });
    if ((mine.dust !== undefined || stored.dust !== undefined) && res.dust === undefined) bad('I4-lost-dust-key', label);
    return { res, lids };
  }
  function syncBase(tab) {
    const st = tab.old ? rmCleanSaveOld(store.realm) : rmCleanSave(store.realm);
    tab.known = new Set(st.items.map((x) => x.n)); tab.baseShards = st.shards; tab.baseDust = st.dust || 0; tab.baseGp = gpOf(st.gp);
  }
  function resync(tab, label) {
    if (!store.realm) return;
    const m = merge(tab, label);
    tab.save = m.res; tab.lids = m.lids; syncBase(tab);
  }
  function persist(tab, failWrite) {
    resync(tab, 'tab' + tab.i + (tab.old ? '(old)' : '') + ' persist');
    if (failWrite && !store.realm && (tab.save.shards > 0 || tab.save.dust > 0)) emptyFail = true; // issue C: realm.js then takes the unsaved values as its bases
    if (!failWrite) {
      tab.dirty = false;
      store.realm = JSON.parse(JSON.stringify(tab.save)); store.lids = new Map(tab.lids);
      if (tab.old) oldWrote = true;
      tabs.forEach((o) => { if (o !== tab) o.pending = true; }); // a storage event for every other tab
    }
    if (store.realm) syncBase(tab); else { tab.known = new Set(); tab.baseShards = tab.save.shards; tab.baseDust = tab.save.dust || 0; tab.baseGp = gpOf(tab.save.gp); }
    T('tab' + tab.i + (failWrite ? ' FAILED write' : ' wrote') + ' items=' + tab.save.items.map((x) => x.n + ':' + tab.lids.get(x.n)).join(' ') + ' shards=' + tab.save.shards + ' dust=' + tab.save.dust);
  }
  function newLid(dupe) { const l = nextLid++; live.add(l); meta.set(l, { dupe }); return l; }
  function consume(l) { const was = consumed.has(l) || !live.has(l); live.delete(l); consumed.add(l); return was; }
  function removeAt(tab, idx) {
    const it = tab.save.items[idx]; tab.save.items.splice(idx, 1);
    Object.keys(tab.save.eq).forEach((k) => { if (tab.save.eq[k] === it.n) delete tab.save.eq[k]; });
    const l = tab.lids.get(it.n); tab.lids.delete(it.n);
    return { it, l, dupe: l === undefined ? true : consume(l) };
  }

  const ops = 20 + ri(60);
  let opCount = 0;
  for (let step = 0; step < ops; step++) {
    // saveSoon: a tab with an unsaved change usually writes it before anything else happens (realm.js persists 250 ms after a pickup / kill)
    tabs.forEach((t) => { if (t.dirty && R() < 0.7) { t.dirty = false; persist(t, R() < 0.08); } });
    const tab = tabs[ri(nTabs)];
    if (tab.pending && R() < 0.8) { tab.pending = false; resync(tab, 'tab' + tab.i + ' storage-event'); } // most events arrive before the next action
    const sv = tab.save;
    const p = R();
    opCount++;
    const before = JSON.stringify(sv);
    try {
    if (p < 0.3) { // pick
      if (sv.items.length >= RM_BACKPACK) { sv.shards += 3; shardLedger += 3; T('tab' + tab.i + ' pack full, sold pick +3'); continue; }
      const id = IDS[ri(IDS.length)], r = ri(3);
      const raw = { n: sv.nextUid, id, r };
      if (TIERABLE(id) && R() < 0.6) { raw.t = 1 + ri(12); if (raw.t >= 7) raw.a = 1 + ri(R() < 0.5 ? 3 : 4294967294); if (raw.t === 12 && id !== 'arm_light_scout' && R() < 0.6) raw.sig = RM_SIG_IDS[ri(RM_SIG_IDS.length)]; }
      const it = (tab.old ? rmCleanSaveOld : rmCleanSave)({ items: [raw] }).items[0];
      if (!it) continue;
      sv.nextUid++;
      sv.items.push(it); if (it.t) sv.gv = 1;
      const l = newLid(false); tab.lids.set(it.n, l);
      T('tab' + tab.i + ' pick ' + JSON.stringify(it) + ' lid ' + l);
    } else if (p < 0.42) { // sell
      if (!sv.items.length) continue;
      const x = removeAt(tab, ri(sv.items.length)); sv.shards += 3 + x.it.r; shardLedger += 3 + x.it.r;
      T('tab' + tab.i + ' sell lid ' + x.l);
    } else if (p < 0.5) { // salvage (new tabs only: the old build has no Forge)
      if (tab.old) continue;
      const idx = sv.items.findIndex((x) => x.t); if (idx < 0) continue;
      const x = removeAt(tab, idx); const d = 2 * x.it.t + x.it.r; sv.dust = (sv.dust || 0) + d; dustLedger += d;
      T('tab' + tab.i + ' salvage lid ' + x.l + ' +' + d + ' dust');
    } else if (p < 0.56) { // combine
      const cand = sv.items.find((it) => it.r < 3 && it.id !== 'wpn_bow_triple' && sv.items.filter((x) => x.id === it.id && x.r === it.r && (x.t || 0) === (it.t || 0)).length >= 3);
      if (!cand) continue;
      const grp = sv.items.filter((x) => x !== cand && x.id === cand.id && x.r === cand.r && (x.t || 0) === (cand.t || 0)).slice(0, 2);
      let dupe = false;
      grp.forEach((g) => { dupe = removeAt(tab, sv.items.indexOf(g)).dupe || dupe; });
      const ki = sv.items.indexOf(cand); const k = removeAt(tab, ki); dupe = dupe || k.dupe;
      const n = Math.max(sv.nextUid || 1, 1 + sv.items.reduce((m, x) => Math.max(m, x.n), 0)); sv.nextUid = n + 1;
      const ne = Object.assign({}, cand, { n, r: cand.r + 1 }); sv.items.splice(ki, 0, ne);
      tab.lids.set(n, newLid(dupe));
      T('tab' + tab.i + ' combine -> ' + JSON.stringify(ne));
    } else if (p < 0.64) { // reforge (new tabs only: the old build has no Forge)
      if (tab.old) continue;
      const idx = sv.items.findIndex((x) => x.t >= 7); if (idx < 0) continue;
      const it = sv.items[idx], cost = 20 * (it.t - 6) + 10 * it.r, sh = it.t - 6;
      if ((sv.dust || 0) < cost || sv.shards < sh) continue;
      const fid = RM_AFFIX_IDS.filter((x) => x !== it.sig)[ri(RM_AFFIX_IDS.length - 1)];
      const n = sv.nextUid++; const ne = { n, id: it.id, r: it.r, t: it.t }; if (it.a) ne.a = it.a; if (it.sig) ne.sig = it.sig; ne.f = { id: fid, v: 1 + ri(20) };
      const old = removeAt(tab, idx); sv.items.splice(idx, 0, ne);
      tab.lids.set(n, newLid(old.dupe));
      sv.dust -= cost; sv.shards -= sh; dustLedger -= cost; shardLedger -= sh;
      T('tab' + tab.i + ' reforge lid ' + old.l + ' -> ' + JSON.stringify(ne));
    } else if (p < 0.69) { // pity counters
      const g = gpOf(sv.gp); if (R() < 0.3) g.b = 0; else g.b += 1; if (R() < 0.5) g.d += 1; sv.gp = g;
    } else if (p < 0.72) { // equip
      const it = sv.items[ri(Math.max(1, sv.items.length))]; if (it && ['sparkwand', 'quickwand'].indexOf(it.id) >= 0) sv.eq.weapon = it.n;
    } else if (p < 0.92) persist(tab, false);
    else persist(tab, true);
    } finally { if (p < 0.72 && JSON.stringify(tab.save) !== before) tab.dirty = true; }
  }
  // converge: an old tab writes once more (then closes), then every NEW tab syncs and writes twice, round robin
  tabs.forEach((t) => { if (t.old) persist(t, false); });
  for (let k = 0; k < 2; k++) tabs.forEach((t) => { if (!t.old) persist(t, false); });
  const fin = rmCleanSave(store.realm);
  const fv = verOf(fin, store.lids);
  const want = [...live].filter((l) => !allowedGone.has(l) && !meta.get(l).dupe);
  const lost = want.filter((l) => !fv.has(l));
  if (lost.length && fin.items.length < RM_BACKPACK) bad('I6-lost-after-converge', 'lids ' + lost.join(','));
  // Issue C: a write that fails while storage holds no realm yet makes realm.js take the UNSAVED totals as its bases, so that tab's
  // shard / dust delta is lost once another tab creates the save.
  const cc = emptyFail ? 'C-empty-fail' : 'I6-';
  if (fin.shards !== shardLedger) bad(cc + (emptyFail ? '' : 'shards'), 'shards ' + fin.shards + ' != ' + shardLedger);
  if (!oldWrote && dustLedger > 0 && fin.dust !== dustLedger) bad(cc + (emptyFail ? '' : 'dust'), 'dust ' + fin.dust + ' != ' + dustLedger);
  return { issues, ops: opCount };
}

// ---------- the three known issues, as minimal hand-written repros on the real rmMergeSave (printed, never hidden) ----------
// They do not fail the test (the game code is not changed in this slice); each line says whether the issue still reproduces.
function knownRepro(name, present) { console.log('known issue ' + name + ': ' + (present ? 'still reproduces' : 'NO LONGER reproduces (fixed? drop it from KNOWN)')); }
{ // A: tab 1 wrote {n:1 sparkwand r0}; tab 2 (not synced yet, nothing known) picked its own sparkwand r0 as n:1 too
  const m = rmMergeSave({ items: [{ n: 1, id: 'sparkwand', r: 0 }], nextUid: 2 }, { items: [{ n: 1, id: 'sparkwand', r: 0 }], nextUid: 2 }, { base: 0, known: new Set() });
  knownRepro('A-twin-uid (two picked Spark Wands merge into ' + m.items.length + ')', m.items.length === 1);
}
{ // B: this tab adopted an old tab's write of the T12 (no sig); storage now holds the intact copy again
  const m = rmMergeSave({ items: [{ n: 1, id: 'sparkwand', r: 2, t: 12, a: 5 }] }, { items: [{ n: 1, id: 'sparkwand', r: 2, t: 12, a: 5, sig: 'ward' }] }, { base: 0, known: new Set([1]) });
  knownRepro('B-stale-strip (merged sig: ' + (m.items[0].sig || 'none') + ')', !m.items[0].sig);
}
{ // C: the failed write on empty storage left base = 5 (the unsaved total); another tab then created the save with 0 shards
  const m = rmMergeSave({ shards: 5 }, { shards: 0 }, { base: 5, known: new Set() });
  knownRepro('C-empty-fail (5 unsaved shards merge to ' + m.shards + ')', m.shards === 0);
}

// ---------- run ----------
const RUNS = Number(process.env.FUZZ_RUNS) || 5000;
const ONE = process.env.FUZZ_SEED;
if (ONE !== undefined) {
  const r1 = runOne(Number(ONE) >>> 0, true);
  console.log('seed ' + ONE + ' (' + r1.ops + ' ops): ' + (r1.issues.length ? r1.issues.join(' | ') : 'clean'));
  process.exit(0);
}
const codeOf = (x) => x.split(' ')[0];
const unexpected = Object.create(null), seen = Object.create(null), minRepro = Object.create(null), stale = [];
let issueRuns = 0;
for (let s = 1; s <= RUNS; s++) {
  const seed = (Math.imul(s, 2654435761) >>> 0);
  const r1 = runOne(seed, false);
  const codes = [...new Set(r1.issues.map(codeOf))];
  const allowed = KNOWN_BY_SEED[seed] || [];
  if (allowed.length && !codes.length) stale.push(seed);
  if (!codes.length) continue;
  issueRuns++;
  codes.forEach((c) => {
    if (allowed.indexOf(c) < 0) { (unexpected[seed] = unexpected[seed] || []).push(r1.issues.find((x) => codeOf(x) === c)); return; }
    seen[c] = (seen[c] || 0) + 1;
    if (!minRepro[c] || r1.ops < minRepro[c].ops) minRepro[c] = { seed, ops: r1.ops, first: r1.issues.find((x) => codeOf(x) === c) };
  });
}
// Print every known issue (never silent): how many seeds hit it, the allow-listed seeds, and the shortest repro seed.
Object.keys(KNOWN).forEach((c) => {
  console.log('KNOWN ISSUE ' + c + ': ' + KNOWN[c].what);
  console.log('  hit in ' + (seen[c] || 0) + ' of ' + RUNS + ' runs; allow-listed seeds (' + KNOWN[c].seeds.length + '): ' + KNOWN[c].seeds.join(','));
  if (minRepro[c]) console.log('  shortest repro: FUZZ_SEED=' + minRepro[c].seed + ' node game/tests/save-merge-fuzz.test.js (' + minRepro[c].ops + ' ops): ' + minRepro[c].first.slice(0, 220));
});
const bad = Object.keys(unexpected);
bad.slice(0, 12).forEach((s) => console.log('UNEXPECTED seed ' + s + ': ' + unexpected[s].join(' | ').slice(0, 400)));
if (process.env.FUZZ_LIST) { const by = {}; bad.forEach((s) => unexpected[s].forEach((x) => { (by[codeOf(x)] = by[codeOf(x)] || []).push(+s); })); Object.keys(by).forEach((c) => console.log('LIST ' + c + ' ' + JSON.stringify(by[c]))); }
check(RUNS + ' seeded runs keep every invariant (outside the printed known-issue seeds)', bad.length === 0, bad.length + ' seeds with an unexpected issue, e.g. ' + bad.slice(0, 5).join(','));
if (stale.length) console.log('note: ' + stale.length + ' allow-listed seeds no longer hit their issue (fixed?): ' + stale.slice(0, 10).join(','));
check('the fuzz is deterministic per seed', JSON.stringify(runOne(12345, false)) === JSON.stringify(runOne(12345, false)));
console.log(`save-merge-fuzz: ${RUNS} runs, ${issueRuns} with issues; ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
