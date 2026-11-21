// Pure-node tests for shared/mm-stash.js (Realm World / Warren loot paying the Lantern stash). Run: node game/tests/shared-mm-stash.test.js
const fs = require('fs');
const path = require('path');
const S = require('../shared/mm-stash.js');
const P = require('../shared/mm-profile.js');
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }
const mem = (init, failKey) => { const m = Object.assign({}, init || {}); return { m, getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { if (k === failKey) throw new Error('quota'); m[k] = String(v); }, removeItem: (k) => { delete m[k]; } }; };
const hero = (o) => Object.assign({ id: 'h1', name: 'Bo', cls: 'ranger', level: 3, xp: 0, fame: 0, bonus: 0, mode: 'classic', items: [] }, o);

// ---- cleanFinds ----
const valid = (f) => Array.isArray(f.pending) && Array.isArray(f.recent) && Number.isInteger(f.fame) && Number.isInteger(f.total) && (f.last === null || typeof f.last === 'object');
[null, 'x', 42, [], { pending: 'no', recent: { a: 1 }, fame: 'NaN', total: -4, last: 7 }, { pending: [{ n: 'a' }, null, { n: 3, id: 'Bad Id' }], recent: [1, { id: '__proto__x' }] }].forEach((c, i) => check('cleanFinds: corrupt input ' + i + ' -> valid shape', valid(S.cleanFinds(c))));
const dup = S.cleanFinds({ pending: [{ n: 5, id: 'luckring', r: 1 }, { n: 5, id: 'luckring', r: 1 }, { n: 6, id: 'sparkwand', r: 99, src: 'evil' }] });
check('cleanFinds: duplicate uids dropped, rarity clamped, unknown source -> world', dup.pending.length === 2 && dup.pending[1].r === 9 && dup.pending[1].src === 'world');
check('cleanFinds: pending capped', S.cleanFinds({ pending: Array.from({ length: 300 }, (_, i) => ({ n: i + 1, id: 'luckring', r: 0 })) }).pending.length === S.MAX_PENDING);

// ---- record ----
let f = S.cleanFinds(null);
for (let i = 1; i <= 15; i++) f = S.record(f, { n: i, id: 'heartcharm', r: i % 3 }, i === 15 ? 'cache' : 'world');
f = S.record(f, { n: 3, id: 'heartcharm', r: 0 }, 'world'); // same uid twice
check('record: one pending entry per backpack uid', f.pending.length === 15);
check('record: recent finds newest first, capped at 12', f.recent.length === S.MAX_RECENT && f.recent[1].src === 'cache');
check('record: bad items ignored', S.record(f, { n: 0, id: 'x' }, 'world').pending.length === 15 && S.record(f, null).pending.length === 15);
const before = JSON.stringify(f); S.record(f, { n: 99, id: 'luckring', r: 0 }, 'world');
check('record does not mutate its input', JSON.stringify(f) === before);

// ---- payout ----
const prof = P.clean({ heroes: [hero({ items: Array.from({ length: 22 }, () => ({ id: 'luckring', r: 0 })) })], stash: Array.from({ length: 16 }, (_, i) => (i < 12 ? { id: 'wardring', r: 1 } : null)) });
const pend = S.cleanFinds({ pending: [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({ n, id: 'sparkwand', r: n % 3, src: n === 9 ? 'cache' : 'world' })), fame: 40 });
const back = [1, 2, 3, 4, 5, 6, 7, 9].map((n) => ({ n, id: 'sparkwand', r: 0 })); // 8 was thrown away
const pj = JSON.stringify(prof), fj = JSON.stringify(pend);
const r = S.payout(prof, back, pend, { heroId: 'h1', shards: 77, src: 'world' });
check('payout: free stash slots fill first (4)', r.stash === 4 && r.profile.stash.filter(Boolean).length === 16);
check('payout: then the active hero\'s pack up to 24 (2)', r.hero === 2 && r.profile.heroes[0].items.length === 24);
check('payout: the rest waits (pending, still in the realm backpack): never lost', r.waiting === 2 && r.finds.pending.length === 2 && r.finds.pending[0].n === 7 && r.finds.pending[1].n === 9 && r.finds.pending[1].src === 'cache');
check('payout: a find no longer in the backpack is not paid', r.dropped === 1 && !r.paid.some((x) => x.n === 8));
check('payout: event fame goes to the active hero, pending fame cleared', r.fame === 40 && r.profile.heroes[0].fame === 40 && r.finds.fame === 0 && r.profile.fame === 0);
check('payout: summary numbers (items, shards, total, last)', r.items === 6 && r.shards === 77 && r.finds.total === 6 && r.finds.last.items === 6 && r.finds.last.waiting === 2 && r.finds.last.src === 'world');
check('payout does not mutate its inputs', JSON.stringify(prof) === pj && JSON.stringify(pend) === fj);
check('payout: result is still a valid Lantern profile', JSON.stringify(P.clean(r.profile)) === JSON.stringify(r.profile));
const r2 = S.payout(P.clean({}), null, S.cleanFinds({ pending: [{ n: 1, id: 'luckring', r: 2 }], fame: 5 }), {});
check('payout: no hero -> stash, fame to the account; unknown backpack = all kept', r2.stash === 1 && r2.profile.stash[0].id === 'luckring' && r2.profile.stash[0].r === 2 && r2.profile.fame === 5);
check('text: "Stashed N items, +M shards"', S.text({ items: 3, shards: 12 }) === 'Stashed 3 items, +12 shards' && S.text({ items: 1, shards: 0 }) === 'Stashed 1 item, +0 shards' && /waiting/.test(S.text({ items: 0, shards: 1, waiting: 2 })) && S.text(null) === '');

// ---- settle on a storage ----
{
  const oldRealm = { v: 1, seed: '777', version: 1, pos: { x: 5, y: 6 }, stats: { kills: 3, bossKills: 0, portals: 1 }, returnTo: null, future: { keep: 1 } };
  const oldMM = { v: 1, heroes: [hero({ fame: 9 })], stash: [{ id: 'luckring', r: 0 }], fame: 3, mode: 'classic', hall: [], migratedFrom: null };
  const town = { name: 'Pip', realm: { shards: 10, items: [{ n: 1, id: 'sparkwand', r: 0 }, { n: 4, id: 'heartcharm', r: 1 }], nextUid: 5 } };
  const st = mem({ 'pixeltown-realm-v1': JSON.stringify(oldRealm), 'pixeltown-mm-v1': JSON.stringify(oldMM), 'pixeltown-save-v1': JSON.stringify(town), 'pixeltown-mm-active-v1': JSON.stringify({ v: 1, heroId: 'h1' }) });
  const townRaw = st.m['pixeltown-save-v1'];
  S.recordTo(st, { n: 4, id: 'heartcharm', r: 1 }, 'world'); S.addFameTo(st, 25);
  const rr = JSON.parse(st.m['pixeltown-realm-v1']);
  check('recordTo: only the additive finds key is added to pixeltown-realm-v1 (old keys untouched)', JSON.stringify(Object.assign({}, rr, { finds: undefined })) === JSON.stringify(Object.assign({}, oldRealm, { finds: undefined })) && rr.finds.pending.length === 1 && rr.finds.fame === 25);
  const res = S.settle(st, { Profile: P, src: 'lantern' }); // realm items read from pixeltown-save-v1
  const mm = JSON.parse(st.m['pixeltown-mm-v1']);
  check('settle: pays into the stash and the hero fame, writes a clean profile', res.ok && res.items === 1 && mm.stash[1] && mm.stash[1].id === 'heartcharm' && mm.heroes[0].fame === 34 && JSON.stringify(P.clean(mm)) === JSON.stringify(mm));
  check('settle: old profile fields kept as they were', mm.stash[0].id === 'luckring' && mm.fame === 3 && mm.heroes[0].name === 'Bo' && mm.heroes[0].level === 3);
  check('settle: never writes pixeltown-save-v1', st.m['pixeltown-save-v1'] === townRaw);
  const f2 = S.readFinds(st);
  check('settle: pending cleared, recent kept for the Lantern list', f2.pending.length === 0 && f2.recent.length === 1 && f2.recent[0].id === 'heartcharm' && f2.total === 1);
  check('settle twice pays nothing twice', S.settle(st, { Profile: P }).items === 0 && JSON.parse(st.m['pixeltown-mm-v1']).stash.filter(Boolean).length === 2);
  // a failing Lantern write pays nothing and keeps the pending finds
  const bad = mem({ 'pixeltown-realm-v1': JSON.stringify({ finds: { pending: [{ n: 1, id: 'luckring', r: 0 }] } }) }, 'pixeltown-mm-v1');
  const br = S.settle(bad, { Profile: P, realmItems: [{ n: 1 }] });
  check('settle: a failed Lantern write keeps every pending find', br.ok === false && S.readFinds(bad).pending.length === 1);
  const none = mem({});
  S.settle(none, { Profile: P, realmItems: [] });
  check('settle with nothing to pay writes nothing', Object.keys(none.m).length === 0);
  check('settle without MMProfile is a no-op', S.settle(mem({}), {}) === null);
}

// ---- source hygiene ----
{
  const src = fs.readFileSync(path.join(__dirname, '../shared/mm-stash.js'), 'utf8');
  check('no Math.random / Date / DOM in source', !/Math\.random|\bDate\b|\b(document|window)\b/.test(src));
  check('never touches the town save key for writing', !/setItem\(\s*SAVE_KEY/.test(src));
}

console.log(failed ? '\n' + failed + ' FAILED' : '\nALL PASSED');
process.exit(failed ? 1 : 0);
