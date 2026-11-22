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
vm.runInContext(WRAP + realmSrc.slice(0, cut) + '\n;globalThis.__R = { rmCleanSave, rmMergeSave, RM_BACKPACK, RM_SIG_IDS, RM_AFFIX_IDS, rmReadStoredRealm, rmGpOf };\n' + OLD_SRC + '\n})();', sandbox, { filename: 'realm.js+old-cleaner' });
const { rmCleanSave, rmMergeSave, RM_BACKPACK, RM_SIG_IDS, RM_AFFIX_IDS } = sandbox.__R;
const { rmCleanSaveOld, rmMergeSaveOld } = sandbox.__O;

// Known issues found by this fuzz, allow-listed BY SEED: a seed listed under an issue may show that issue (and only that one); any other issue in any
// seed fails. All of them are printed on every run (count, seeds, shortest repro) so they are never silent. Regenerate a list with FUZZ_LIST=1.
// A, B and C below are FIXED in realm.js (save-fuzzfix): B and C have empty seed lists, so every seed asserts them for real; the codes stay so a
// regression is reported under its name. A keeps ONE seed, a different sub-case the twin fix cannot see (see `rest` below).
const KNOWN = {
  'A-twin-uid': {
    what: "FIXED: two tabs that pick the same plain item (same id / r / t / a) under the same uid before either syncs used to merge as one item; rmMergeSave now gives this tab's copy a fresh uid when it never saw that uid in storage",
    rest: "still open in 1334482343 only: uid REUSE. Tab A picks uid 13, writes, sells it (storage drops 13, nextUid stays 14); tab B still holds A's item under 13 (known, not yet synced); tab C, last synced before 13 existed, picks its own identical item as 13 and writes. B then reads C's 13 as the item it knew, keeps its stale copy, and C's item is lost. Renumbering unknown picks below storage's nextUid fixes the fuzz but changes uids in flows realm-core / realm-progress / realm-shop-death rely on, so it is not shipped; a real fix needs uids that are unique across tabs",
    seeds: [1334482343],
  },
  'B-stale-strip': {
    what: "FIXED: a new tab that adopted an OLD (pre-GW) tab's stripped write used to keep its own copy of a same-uid item, writing it back without f / sig; rmMergeSave now never drops f / sig that storage holds for the same item",
    seeds: [],
  },
  'C-empty-fail': {
    what: "FIXED: RealmArena._persist used to set the shard / dust bases to the UNSAVED totals after a write that failed while storage held no realm yet; a failed write now leaves the bases as they were",
    seeds: [],
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

  // map result items back to lids (mine wins on a same-uid same-item tie, exactly like rmMergeSave keeps `a`'s copy; a remapped uid is mine's).
  // `known` (new tabs only): a same-uid same-item pair whose uid this tab never saw in storage is two items (issue A fix): the uid stays storage's.
  function lidsFor(res, mine, mineLids, stored, storedLids, known) {
    const twinUid = (n) => known && !known.has(n) && mi.has(n) && si.has(n) && same(mi.get(n), si.get(n));
    const out = new Map(), used = new Set();
    const mi = new Map(mine.items.map((x) => [x.n, x])), si = new Map(stored.items.map((x) => [x.n, x]));
    const pend = [];
    res.items.forEach((it) => {
      const m = mi.get(it.n), s = si.get(it.n);
      let lid = null;
      if (m && same(m, it) && !twinUid(it.n) && mineLids.has(m.n) && !used.has(mineLids.get(m.n))) lid = mineLids.get(m.n);
      else if (s && same(s, it) && storedLids.has(s.n) && !used.has(storedLids.get(s.n))) lid = storedLids.get(s.n);
      if (lid === null) { pend.push(it); return; }
      used.add(lid); out.set(it.n, lid);
    });
    pend.forEach((it) => { // a fresh uid from a collision: one of mine whose uid storage holds as a different item (or, new tabs, a twin: issue A fix)
      const m = mine.items.find((x) => same(x, it) && mineLids.has(x.n) && !used.has(mineLids.get(x.n)) && ((si.has(x.n) && (!same(si.get(x.n), x) || twinUid(x.n)))));
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
    const lids = lidsFor(res, mine, tab.lids, stored, store.lids, tab.old ? null : tab.known);
    const mv = verOf(mine, tab.lids), sv = verOf(stored, store.lids), rv = verOf(res, lids);
    const inputs = new Set([...mv.keys(), ...sv.keys()].filter((l) => live.has(l) && !allowedGone.has(l)));
    const missing = [...inputs].filter((l) => !rv.has(l));
    if (tab.old) { // an old tab's losses are not the new cleaner's (a twin it merged leaves the survivor ambiguous as well)
      missing.forEach((l) => { allowedGone.add(l); const it = mv.get(l) || sv.get(l); if (tab.lids.has(it.n)) allowedGone.add(tab.lids.get(it.n)); if (store.lids.has(it.n)) allowedGone.add(store.lids.get(it.n)); });
      if (missing.length) T('old tab dropped lids ' + missing.join(','));
      // The old merge also reads twins (two items under one uid with the same id / r / t / a, picked in two tabs) as one and writes ITS copy under
      // that uid; a new tab that already knew the uid then cannot tell the two apart, so the survivor is ambiguous even when storage's twin was
      // already consumed (and so not "missing" here). Same rule as above: an old tab's write, not the new cleaner's loss.
      mine.items.forEach((x) => { const s = stored.items.find((y) => y.n === x.n); if (s && same(s, x) && tab.lids.has(x.n) && store.lids.has(x.n) && tab.lids.get(x.n) !== store.lids.get(x.n)) { allowedGone.add(tab.lids.get(x.n)); allowedGone.add(store.lids.get(x.n)); T('old tab merged twin uid ' + x.n); } });
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
    if (failWrite && !store.realm && (tab.save.shards > 0 || tab.save.dust > 0)) emptyFail = true; // issue C (fixed): realm.js used to take the unsaved values as its bases
    if (!failWrite) {
      tab.dirty = false;
      store.realm = JSON.parse(JSON.stringify(tab.save)); store.lids = new Map(tab.lids);
      if (tab.old) oldWrote = true;
      tabs.forEach((o) => { if (o !== tab) o.pending = true; }); // a storage event for every other tab
    }
    if (store.realm) syncBase(tab); else { tab.known = new Set(); if (!failWrite) { tab.baseShards = tab.save.shards; tab.baseDust = tab.save.dust || 0; tab.baseGp = gpOf(tab.save.gp); } } // a failed write keeps the bases (realm.js _persist, issue C fix)
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

// ---------- the three fixed issues, as minimal hand-written regression checks on the real realm.js code ----------
{ // A: tab 1 wrote {n:1 sparkwand r0}; tab 2 (not synced yet, nothing known) picked its own sparkwand r0 as n:1 too: both kept, distinct uids
  const m = rmMergeSave({ items: [{ n: 1, id: 'sparkwand', r: 0 }], nextUid: 2, eq: { weapon: 1 } }, { items: [{ n: 1, id: 'sparkwand', r: 0 }], nextUid: 2 }, { base: 0, known: new Set() });
  check('A fixed: two picked Spark Wands under one uid stay two items (this tab\'s renumbered, its equip follows)', m.items.length === 2 && new Set(m.items.map((x) => x.n)).size === 2 && m.eq.weapon === m.items[0].n && m.eq.weapon !== 1, JSON.stringify(m.items) + ' eq ' + m.eq.weapon);
  // the same item seen at the last sync (known) is still ONE item, and a re-merge of the split result never multiplies it
  const k = rmMergeSave({ items: [{ n: 1, id: 'sparkwand', r: 0 }], nextUid: 2 }, { items: [{ n: 1, id: 'sparkwand', r: 0 }], nextUid: 2 }, { base: 0, known: new Set([1]) });
  const k2 = rmMergeSave(m, m, { base: 0, known: new Set(m.items.map((x) => x.n)) });
  check('A fixed: a known same-uid item stays one item; re-merging the split result never multiplies it', k.items.length === 1 && k2.items.length === 2, JSON.stringify([k.items, k2.items]));
  // without `known` (a caller that does not track it) the old identity rule is unchanged
  const nk = rmMergeSave({ items: [{ n: 1, id: 'sparkwand', r: 0 }], nextUid: 2 }, { items: [{ n: 1, id: 'sparkwand', r: 0 }], nextUid: 2 }, { base: 0 });
  check('A fixed: callers without opts.known keep the old identity rule', nk.items.length === 1 && nk.items[0].n === 1, JSON.stringify(nk.items));
}
{ // B: this tab adopted an old tab's write of the T12 (no sig, no f); storage now holds the intact copy again
  const m = rmMergeSave({ items: [{ n: 1, id: 'sparkwand', r: 2, t: 12, a: 5 }] }, { items: [{ n: 1, id: 'sparkwand', r: 2, t: 12, a: 5, sig: 'ward', f: { id: 'keen', v: 3 } }] }, { base: 0, known: new Set([1]) });
  check('B fixed: the merge keeps storage\'s sig and f for the same item', m.items.length === 1 && m.items[0].sig === 'ward' && m.items[0].f && m.items[0].f.id === 'keen' && m.items[0].f.v === 3, JSON.stringify(m.items));
  const mi = rmMergeSave({ items: [{ n: 1, id: 'sparkwand', r: 2, t: 12, a: 5, sig: 'blast', f: { id: 'swift', v: 2 } }] }, { items: [{ n: 1, id: 'sparkwand', r: 2, t: 12, a: 5, sig: 'ward', f: { id: 'keen', v: 3 } }] }, { base: 0, known: new Set([1]) });
  check('B fixed: when both copies carry sig / f, this tab\'s win (as before)', mi.items[0].sig === 'blast' && mi.items[0].f.id === 'swift', JSON.stringify(mi.items));
}
{ // C: RealmArena.prototype._persist (the real method source) on a fake arena with no readable storage: a failed write keeps the bases
  const head = '\n  _persist(sv) {';
  const mStart = realmSrc.indexOf(head), mEnd = realmSrc.indexOf('\n  }\n', mStart);
  check('C: _persist found in realm.js', mStart > 0 && mEnd > mStart);
  const body = realmSrc.slice(mStart + head.length, mEnd);
  const persistFn = vm.runInContext("(function (rmReadStoredRealm, rmGpOf) { return function (sv) {" + body + "\n}; })", sandbox, { filename: 'realm.js#_persist' })(sandbox.__R.rmReadStoredRealm, sandbox.__R.rmGpOf);
  const fake = (ret) => ({ save: rmCleanSave({ shards: 5, dust: 7, gp: { b: 2, d: 1 } }), _baseShards: 0, _baseDust: 0, _baseGp: { b: 0, d: 0 }, _known: new Set([9]), active: false,
    resyncSave() { return false; }, _onSave() { return ret; }, _syncBase() { throw new Error('no storage here'); } });
  const f = fake(false); const okF = persistFn.call(f, f.save);
  check('C fixed: a failed write with no stored realm keeps the shard / dust / pity bases (the unsaved delta survives)', okF === false && f._baseShards === 0 && f._baseDust === 0 && f._baseGp.b === 0 && f._baseGp.d === 0 && f._known.size === 0 && f.saveFails === 1, JSON.stringify([okF, f._baseShards, f._baseDust, f._baseGp]));
  const g = fake(true); const okG = persistFn.call(g, g.save);
  check('C: a write that succeeded (page saves elsewhere) still takes the saved totals as its bases', okG === true && g._baseShards === 5 && g._baseDust === 7 && g._baseGp.b === 2, JSON.stringify([okG, g._baseShards, g._baseDust, g._baseGp]));
  // and the merge then applies the kept delta once another tab creates the save
  const m = rmMergeSave(f.save, { shards: 0 }, { base: f._baseShards, known: f._known });
  check('C fixed: the 5 unsaved shards survive the merge with the save another tab created', m.shards === 5, String(m.shards));
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
  console.log('KNOWN ISSUE ' + c + ': ' + KNOWN[c].what + (KNOWN[c].rest ? ' | ' + KNOWN[c].rest : ''));
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
