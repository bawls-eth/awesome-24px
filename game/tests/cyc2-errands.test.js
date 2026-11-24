// cyc2-S ID-12 Town-to-Realm errand chain: the pure state machine (shared/mm-errands.js, not wired yet). Node only.
// Asserts the exact chain order (no step can be skipped or repeated), that each side only changes its own save object and never
// mutates its inputs, the one-time reward, and hostile saves.
// Run: node game/tests/cyc2-errands.test.js
const E = require('../shared/mm-errands.js');
const { check, done } = require('./helpers');

const T0 = undefined, R0 = undefined;
check('a fresh player is at the offer step', E.stage(T0, R0) === 'offer');
check('accept: needs 3 of the Town\'s own wood', E.accept(T0, { wood: 2 }).ok === false && E.accept(T0, { wood: 2 }).why === 'need-wood' && E.accept(T0, null).ok === false);
const a = E.accept(T0, { wood: 7 });
check('accept: packs the parcel (Town s = 1) and asks the Town to spend exactly 3 wood', a.ok && a.town.s === 1 && a.town.id === 'parcel1' && JSON.stringify(a.spend) === '{"wood":3}');
check('accept twice: refused (busy), nothing spent', E.accept(a.town, { wood: 99 }).ok === false && E.accept(a.town, { wood: 99 }).spend === null);
check('after accept the stage is carry', E.stage(a.town, R0) === 'carry');
check('trophy before the delivery: refused', E.trophy(R0, 2).ok === false);
check('deliver without a parcel (Town s = 0): refused', E.deliver(R0, T0).ok === false);
const d = E.deliver(R0, a.town);
check('deliver: the Vendor takes the parcel (Realm p = 1, d = 0), stage hunt', d.ok && d.realm.p === 1 && d.realm.d === 0 && E.stage(a.town, d.realm) === 'hunt');
check('deliver twice: refused', E.deliver(d.realm, a.town).ok === false);
check('trophy: a Shore kill (zone 0) does not count, nor junk zones', [0, -1, 4, NaN, '2', null].every((z) => E.trophy(d.realm, z).ok === false));
const tr = E.trophy(d.realm, 1);
check('trophy: a Midlands kill gives it (d = 1), stage return', tr.ok && tr.realm.d === 1 && E.stage(a.town, tr.realm) === 'return');
check('trophy twice: refused', E.trophy(tr.realm, 3).ok === false);
check('finish before the trophy: refused, no reward', E.finish(a.town, d.realm).ok === false && E.finish(a.town, d.realm).reward === null);
const f = E.finish(a.town, tr.realm);
check('finish: Town s = 2 (done) and the one-time decor reward', f.ok && f.town.s === 2 && f.reward && f.reward.decor === 'realm_lantern' && E.stage(f.town, tr.realm) === 'done');
check('finish twice: refused (the reward is once)', E.finish(f.town, tr.realm).ok === false);
check('a done chain never restarts: accept refused', E.accept(f.town, { wood: 99 }).ok === false);
// inputs are never mutated
const tIn = { id: 'parcel1', s: 1 }, rIn = { id: 'parcel1', p: 1, d: 0 };
const tS = JSON.stringify(tIn), rS = JSON.stringify(rIn);
E.deliver(rIn, tIn); E.trophy(rIn, 2); E.finish(tIn, rIn); E.accept(tIn, { wood: 9 });
check('pure: no function mutates the saves it reads', JSON.stringify(tIn) === tS && JSON.stringify(rIn) === rS);
// hostile saves
const junk = [null, 5, 'x', [], { id: 'other', s: 2 }, { id: 'parcel1', s: 9 }, { id: 'parcel1', s: 1.5 }, { id: 'parcel1', s: '2' }];
check('cleanTown: junk becomes a fresh chain (s = 0)', junk.every((v) => JSON.stringify(E.cleanTown(v)) === '{"id":"parcel1","s":0}'));
check('cleanRealm: a trophy without a delivered parcel is dropped; junk becomes fresh', JSON.stringify(E.cleanRealm({ id: 'parcel1', p: 0, d: 1 })) === '{"id":"parcel1","p":0,"d":0}' && junk.every((v) => E.cleanRealm(v).p === 0 && E.cleanRealm(v).d === 0));
check('a forged Realm trophy cannot finish a chain the Town never started', E.finish(T0, { id: 'parcel1', p: 1, d: 1 }).ok === false);
check('every stage has a line', ['offer', 'carry', 'hunt', 'return', 'done'].every((s) => typeof E.LINES[s] === 'string' && E.LINES[s].length > 10));
done();
