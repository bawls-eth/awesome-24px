// G-05 (b11-01, owner default O-05): Rekindle starts only from a fallen hero's Keepsake, once. Pure module.
// Run: node game/tests/shared-mm-profile-rekindle.test.js
const P = require('../shared/mm-profile.js');
const B = require('../shared/mm-backup.js');
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }
const hero = (o) => Object.assign({ id: 'h1', name: 'Tester', cls: 'herald', level: 1, xp: 0, fame: 0, bonus: 0, mode: 'classic', items: [] }, o);

// 1: a living hero cannot be rekindled
const live = P.clean({ v: 1, heroes: [hero({ id: 'a', name: 'Alda', level: 20 })] });
const r1 = P.rekindle(live, 'a');
check('1. rekindle(p, livingId) -> ok:false, reason not-fallen, heroes unchanged', r1.ok === false && r1.reason === 'not-fallen' && r1.profile.heroes.length === 1, JSON.stringify(r1));
check('1b. an unknown id -> no-hero; a non-keepsake stash slot -> no-keepsake', P.rekindle(live, 'zz').reason === 'no-hero' && P.rekindle(P.clean({ v: 1, heroes: [], stash: [{ id: 'luckring', r: 1 }] }), 0).reason === 'no-keepsake');

// 2: fall a level-20 hero -> Keepsake -> one level-10 hero; second use refused; Keepsake kept with rk:true
const two = P.clean({ v: 1, heroes: [hero({ id: 'a', name: 'Alda', level: 20 }), hero({ id: 'b', name: 'Bram', cls: 'ranger', level: 6 })] });
const f = P.fall(two, 'a');
const slot = f.profile.stash.findIndex((x) => x && x.keepsake);
check('2. Fall leaves a Keepsake carrying class, level and mode', f.ok && slot >= 0 && f.profile.stash[slot].cls === 'herald' && f.profile.stash[slot].level === 20 && f.profile.stash[slot].md === 'classic', JSON.stringify(f.profile.stash[slot]));
const r2 = P.rekindle(f.profile, slot);
const nh = r2.hero;
check('2b. rekindle from the Keepsake -> one new level-10 herald named after the fallen hero', r2.ok && nh.level === 10 && nh.cls === 'herald' && nh.name === 'Alda' && r2.profile.heroes.length === 2 && nh.id !== 'a', JSON.stringify(r2.hero));
check('2c. the Keepsake stays in the stash with rk:true', r2.profile.stash[slot] && r2.profile.stash[slot].keepsake === true && r2.profile.stash[slot].rk === true);
const r3 = P.rekindle(r2.profile, slot);
check('2d. a second rekindle from the same Keepsake fails (used), no hero added', r3.ok === false && r3.reason === 'used' && r3.profile.heroes.length === 2, JSON.stringify(r3.reason));
// a living hero already has that name: the new one gets a suffix
const dup = P.clean({ v: 1, heroes: [hero({ id: 'x', name: 'Alda', level: 3 })], stash: [{ id: 'keepsake', r: 0, keepsake: true, from: 'Alda', cls: 'herald', level: 9 }] });
const rd = P.rekindle(dup, 0);
check('2e. a living hero with the same name: the rekindled one is "Alda II" at level 4', rd.ok && rd.hero.name === 'Alda II' && rd.hero.level === 4, JSON.stringify(rd.hero));
check('2f. roster full -> roster-full', (() => { const hs = []; for (let i = 0; i < 12; i++) hs.push(hero({ id: 'h' + i, name: 'N' + i })); return P.rekindle(P.clean({ v: 1, heroes: hs, stash: [{ id: 'keepsake', r: 0, keepsake: true, from: 'Z', cls: 'herald', level: 9 }] }), 0).reason === 'roster-full'; })());
check('2g. rekindleCheck reports the same reasons without changing anything', P.rekindleCheck(r2.profile, slot) === 'used' && P.rekindleCheck(dup, 0) === '' && P.rekindleCheck(live, 'a') === 'not-fallen');

// 4: an old profile (no rk) loads, cleans and round-trips byte-stable through clean() twice
const old = { v: 1, heroes: [hero({ id: 'q', name: 'Quill', level: 7 })], stash: [{ id: 'keepsake', r: 0, keepsake: true, from: 'Old', cls: 'ranger', level: 12 }, { id: 'luckring', r: 2 }], fame: 40, mode: 'classic', hall: [], migratedFrom: null };
const c1 = JSON.stringify(P.clean(old)), c2 = JSON.stringify(P.clean(JSON.parse(c1)));
check('4. a pre-change profile (no rk) cleans byte-stable twice and its Keepsake is still usable', c1 === c2 && !('rk' in P.clean(old).stash[0]) && P.rekindleCheck(P.clean(old), 0) === '', c1);
const withRk = JSON.stringify(P.clean(JSON.parse(JSON.stringify(r2.profile))));
check('4b. a profile with rk round-trips byte-stable through clean()', withRk === JSON.stringify(P.clean(JSON.parse(withRk))) && JSON.parse(withRk).stash[slot].rk === true);

// 5: backup plan() accepts a profile containing rk and keeps it
const pl = B.plan({ format: 'pixeltown-backup', v: 2, keys: { 'pixeltown-mm-v1': JSON.stringify(r2.profile) } });
check('5. MMBackup.plan accepts the profile with rk and keeps the flag', pl.ok && JSON.parse(pl.entries['pixeltown-mm-v1']).stash[slot].rk === true, JSON.stringify(pl).slice(0, 200));

if (failed) { console.log(failed + ' FAILED'); process.exit(1); } else console.log('ALL PASSED');
