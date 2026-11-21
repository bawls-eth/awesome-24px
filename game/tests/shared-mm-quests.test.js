// Run: node game/tests/shared-mm-quests.test.js
const fs = require('fs'), path = require('path');
const Q = require('../shared/mm-quests.js');
let n = 0, bad = 0;
function check(name, ok) { n++; if (!ok) { bad++; console.log('FAIL ' + name); } }
const man = (b) => JSON.parse(fs.readFileSync(path.join(__dirname, '../assets/arcane', b, 'manifest.json'), 'utf8')).assets;
const npcs = new Set(man('b21-npcs-and-vendors').map((a) => a.enemy));
const bags = new Set(man('b15-loot-bags-and-drops').map((a) => a.id));
const D = '2026-11-21';

const qs = Q.quests(D);
check('3 quests per date', qs.length === 3 && qs.map((q) => q.id).join() === 'kill_zone,kill_boss,open_portal');
check('deterministic', JSON.stringify(Q.quests(D)) === JSON.stringify(qs) && JSON.stringify(Q.oracle(D)) === JSON.stringify(Q.oracle(D)));
check('kinds are kill zone / boss / portal', qs[0].kind === 'kill' && qs[1].kind === 'boss' && qs[2].kind === 'portal');
check('kill quest bounds', qs[0].need >= 8 && qs[0].need <= 32 && qs[0].zone >= 0 && qs[0].zone <= 3);
check('rewards are shards + a b15 bag tier', qs.every((q) => q.reward.shards > 0 && q.reward.shards < 1000 && bags.has('bag_' + q.reward.bag)));
check('quest giver and oracle npc ids exist in b21', npcs.has(Q.NPC) && npcs.has(Q.ORACLE_NPC) && qs.every((q) => npcs.has(q.npc)));
check('descriptors frozen', Object.isFrozen(qs[0]) && Object.isFrozen(qs[0].reward));
let differs = false;
for (let d = 1; d <= 28; d++) { const k = Q.quests('2026-03-' + String(d).padStart(2, '0')); if (k[0].zone !== qs[0].zone || k[0].need !== qs[0].need) differs = true; }
check('different dates give different quests', differs);
check('every date in a month stays in bounds', (() => { for (let d = 1; d <= 28; d++) for (const q of Q.quests('2026-02-' + String(d).padStart(2, '0'))) { if (q.need < 1 || q.need > 32 || q.reward.shards > 400) return false; } return true; })());
check('invalid dates -> []', Q.quests('nope').length === 0 && Q.quests(null).length === 0 && Q.quests('2026-13-40').length === 0 && Q.quests({}).length === 0 && Q.oracle('x') === null);

const s0 = Q.fresh(D);
check('fresh state shape', s0.date === D && Object.keys(s0.q).length === 3 && s0.q.kill_zone.p === 0 && !s0.q.kill_zone.done);
const frozen = JSON.parse(JSON.stringify(s0)); const snap = JSON.stringify(frozen);
const s1 = Q.progress(frozen, { type: 'kill', zone: qs[0].zone, n: 3 }, D);
check('progress never mutates input', JSON.stringify(frozen) === snap && s1 !== frozen);
check('kill in the right zone counts', s1.q.kill_zone.p === 3);
const other = (qs[0].zone + 1) % 4;
check('kill in another zone does not count', Q.progress(s0, { type: 'kill', zone: other }, D).q.kill_zone.p === 0);
check('boss kill via flag or type', Q.progress(s0, { type: 'kill', zone: 0, boss: true }, D).q.kill_boss.done && Q.progress(s0, { type: 'boss' }, D).q.kill_boss.done);
check('portal event completes portal quest', Q.progress(s0, { type: 'portal' }, D).q.open_portal.done);
check('progress capped at need', Q.progress(s0, { type: 'kill', zone: qs[0].zone, n: 100000 }, D).q.kill_zone.p === qs[0].need);
check('hostile event no-op', JSON.stringify(Q.progress(s0, null, D)) === JSON.stringify(s0) && JSON.stringify(Q.progress(s0, 'x', D)) === JSON.stringify(s0) && JSON.stringify(Q.progress(s0, { type: 'kill', zone: 'a', n: -5 }, D)) === JSON.stringify(s0));
check('negative/NaN n ignored', Q.progress(s0, { type: 'kill', zone: qs[0].zone, n: -4 }, D).q.kill_zone.p === 0 && Q.progress(s0, { type: 'kill', zone: qs[0].zone, n: NaN }, D).q.kill_zone.p === 1);

let done = Q.progress(s0, { type: 'portal' }, D);
const c1 = Q.claim(done, 'open_portal', D);
check('claim pays shards and a bag', c1.reward && c1.reward.shards === qs[2].reward.shards && c1.reward.bag === qs[2].reward.bag && c1.state.q.open_portal.claimed);
check('claim pays once (also after reload through clean)', Q.claim(c1.state, 'open_portal', D).reward === null && Q.claim(Q.clean(JSON.parse(JSON.stringify(c1.state)), D), 'open_portal', D).reward === null);
check('claim unfinished / unknown -> null', Q.claim(s0, 'kill_zone', D).reward === null && Q.claim(s0, 'nope', D).reward === null && Q.claim(s0, '__proto__', D).reward === null);
check('claim leaves input untouched', JSON.stringify(done) === JSON.stringify(Q.progress(s0, { type: 'portal' }, D)));

check('clean(garbage) -> fresh', JSON.stringify(Q.clean(null, D)) === JSON.stringify(s0) && JSON.stringify(Q.clean('x', D)) === JSON.stringify(s0) && JSON.stringify(Q.clean([], D)) === JSON.stringify(s0) && JSON.stringify(Q.clean({ date: D, q: 5 }, D)) === JSON.stringify(s0));
check('stale date is reset', Q.clean(c1.state, '2026-11-22').q.open_portal.claimed === false && Q.clean(c1.state, '2026-11-22').date === '2026-11-22');
const hostile = Q.clean({ date: D, evil: 1, q: { kill_zone: { p: 1e99, claimed: true, x: 1 }, kill_boss: { p: -5, done: true, claimed: true }, open_portal: { p: 'abc' }, __proto__: { p: 1 }, extra: { p: 4 } } }, D);
check('hostile counters clamped, unknown keys dropped', hostile.q.kill_zone.p === qs[0].need && hostile.q.kill_boss.p === 0 && !hostile.q.kill_boss.claimed && hostile.q.open_portal.p === 0 && !('extra' in hostile.q) && !('evil' in hostile) && Object.keys(hostile).sort().join() === 'date,q');
check('claimed requires done', Q.clean({ date: D, q: { kill_zone: { p: 1, claimed: true } } }, D).q.kill_zone.claimed === false);
check('summary rows', Q.summary(done, D).length === 3 && Q.summary(done, D)[2].done && Q.summary(null, D)[0].p === 0 && Q.summary(null, 'bad').length === 0);
const o = Q.oracle(D);
check('oracle deterministic text uses ghost guide', o.npc === 'npc_ghost_guide' && typeof o.text === 'string' && o.text.length > 10 && o.zone === qs[0].zone && o.biome === qs[2].biome);

// QB1: rewardBag
const WI = require('../shared/mm-weapon-items.js');
const bk = (t, sd) => Q.rewardBag({ bag: t }, sd);
check('QB1 brown bag: 2 potions', bk('brown', 'a').tier === 'brown' && bk('brown', 'a').items.length === 2 && bk('brown', 'a').items.every((i) => /^potion_/.test(i.id) && i.r === 0 && i.n === 1));
check('QB1 pink bag: 1 uncommon gear', bk('pink', 'a').items.length === 1 && bk('pink', 'a').items[0].r === 1 && /^armor_(light|robe|heavy)_t[23]$/.test(bk('pink', 'a').items[0].id));
check('QB1 purple bag: 1 rare gear or wpn_', (() => { for (let i = 0; i < 60; i++) { const it = bk('purple', 's' + i).items; if (it.length !== 1 || it[0].r !== 2 || !(/^armor_(light|robe|heavy)_t[45]$/.test(it[0].id) || WI.get(it[0].id))) return false; } return true; })());
check('QB1 purple sometimes a wpn_ style and sometimes armor', (() => { let w = 0, a = 0; for (let i = 0; i < 80; i++) { if (/^wpn_/.test(bk('purple', i).items[0].id)) w++; else a++; } return w > 5 && a > 5; })());
check('QB1 stable for the same seed, varies across seeds', JSON.stringify(bk('pink', 'x')) === JSON.stringify(bk('pink', 'x')) && (() => { const s = new Set(); for (let i = 0; i < 40; i++) s.add(bk('brown', i).items.map((x) => x.id).join()); return s.size > 3; })());
check('QB1 hostile reward/tier/seed -> null or safe', Q.rewardBag(null, 1) === null && Q.rewardBag('x', 1) === null && Q.rewardBag({ bag: 'gold' }, 1) === null && Q.rewardBag({ bag: '__proto__' }, 1) === null && Q.rewardBag({ bag: ['brown'] }, 1) === null && Q.rewardBag({ bag: 'brown' }, { a: 1 }).items.length === 2 && Q.rewardBag({ bag: 'brown' }, NaN).items.length === 2);
check('QB1 does not mutate reward and ignores extra keys', (() => { const rw = Object.freeze({ bag: 'pink', shards: 5, evil: 1 }); return Q.rewardBag(rw, 1).tier === 'pink'; })());
check('QB1 item ids are real (potions in b15, gear matches save id patterns)', (() => { const pots = new Set(man('b15-loot-bags-and-drops').map((a) => a.id)); for (let i = 0; i < 30; i++) { if (!bk('brown', i).items.every((x) => pots.has(x.id))) return false; } return true; })());
check('QB1 claim keeps old shape plus bagItems', Object.keys(c1.reward).sort().join() === 'bag,bagItems,quest,shards' && c1.reward.bagItems.length === 1 && JSON.stringify(c1.reward.bagItems) === JSON.stringify(Q.rewardBag(qs[2].reward, D + ':open_portal').items));
check('QB1 old saves (no bagItems anywhere) still load and claim once', Q.clean({ date: D, q: { open_portal: { p: 1, done: true, claimed: false } } }, D).q.open_portal.done === true && Q.claim({ date: D, q: { open_portal: { p: 1 } } }, 'open_portal', D).reward.bagItems.length === 1);
console.log((bad ? 'FAILED ' + bad + ' of ' : 'ok ') + n + ' assertions'); process.exit(bad ? 1 : 0);
