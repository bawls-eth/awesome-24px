// G-22 (b05-03, b06-04), pure modules: an attack-mode companion never picks the creature the hero is taming (ctx.skip), and a tameable
// first-fight boss cannot be killed during its first MMIsleBoss.K.WEARY_GRACE seconds of weary (a rematch / input.noTame still dies).
// Run: node game/tests/shared-mm-companion-tame-skip.test.js
const C = require('../shared/mm-companion.js');
const B = require('../shared/mm-isle-boss.js');
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }
const DEF = { id: 'raptor', speed: 1, companion: { dps: 6, range: 40, role: 'melee' } };
const owner = { x: 0, y: 0 };
const run = (enemies, skip, steps) => { const c = C.create({ x: 0, y: 30, mode: 'attack' }); const hits = []; for (let i = 0; i < (steps || 240); i++) { const o = C.update(c, { owner, def: DEF, enemies, skip }, 1 / 60); if (o.hit >= 0) hits.push(o.hit); } return { c, hits }; };

{ const target = { x: 60, y: 0, hp: 9, tameTgt: true }, other = { x: 140, y: 0, hp: 9 };
  const skip = (e) => e.tameTgt === true;
  const r = run([target, other], skip);
  check('1. with [target(skip), other] an attack companion picks `other` and never hits the target', r.hits.length > 0 && r.hits.every((h) => h === 1), JSON.stringify(r.hits.slice(0, 8)));
  const only = run([target], skip);
  check('1b. with only the skipped target, tgt is -1 and there are no hits', only.c.tgt === -1 && only.hits.length === 0, JSON.stringify({ tgt: only.c.tgt, hits: only.hits.length }));
  const none = run([target, other]);
  check('1c. without skip the nearer target is attacked as before (no behaviour change for other callers)', none.hits.length > 0 && none.hits[0] === 0, JSON.stringify(none.hits.slice(0, 4)));
  // a target that becomes skipped mid-attack is dropped at once
  const c = C.create({ x: 0, y: 30, mode: 'attack' }); const t2 = { x: 50, y: 0, hp: 9 }; let flag = false; let after = 0;
  for (let i = 0; i < 240; i++) { if (i === 60) flag = true; const o = C.update(c, { owner, def: DEF, enemies: [t2], skip: () => flag }, 1 / 60); if (flag && o.hit >= 0) after++; }
  check('1d. a target that starts being tamed mid-fight is dropped (no hit after the flag)', after === 0 && c.tgt === -1, JSON.stringify({ after, tgt: c.tgt }));
  const thr = run([target, other], () => { throw new Error('x'); });
  check('1e. a throwing skip predicate counts as skip (never throws, no hits)', thr.hits.length === 0);
  // determinism: same inputs, same hit sequence
  check('1f. deterministic: two runs give identical hits', JSON.stringify(run([target, other], skip).hits) === JSON.stringify(r.hits));
}

{ // boss weary grace
  const G = B.K && B.K.WEARY_GRACE;
  let s = B.step(B.init('fernjaw_tyrant', { seed: 'g' }), { dmg: 1e9 }, 0.1).state;
  check('2. a huge hit leaves the tameable boss weary', s.st === 'weary' && s.hp > 0);
  let minHp = s.hp;
  for (let i = 0; i < 60; i++) { s = B.step(s, { dmg: 1e6, hero: { x: 100, y: 0 } }, 0.1).state; minHp = Math.min(minHp, s.hp); }
  check('3. 6 s of held fire at a weary first-fight boss: st stays weary, hp >= 1', s.st === 'weary' && minHp >= 1, JSON.stringify({ st: s.st, minHp, G }));
  const f = B.step(s, { feast: true }, 0.1).state;
  check('3b. a feast during the grace starts the tame', f.st === 'taming');
  for (let i = 0; i < 40; i++) s = B.step(s, { dmg: 1e6 }, 0.1).state;
  check('3c. after the grace a weary boss can still be finished (no feature removed)', s.st === 'dead');
  let rm = B.step(B.init('fernjaw_tyrant', { seed: 'g', rematch: true }), { dmg: 1e9 }, 0.1).state;
  rm = B.step(rm, { dmg: 1e6 }, 0.1).state;
  check('4. a rematch boss at weary still dies to fire at once', rm.st === 'dead');
  let nt = B.step(B.init('fernjaw_tyrant', { seed: 'g' }), { dmg: 1e9 }, 0.1).state;
  nt = B.step(nt, { dmg: 1e6, noTame: true }, 0.1).state;
  check('4b. input.noTame (taming off on the page) keeps the old kill path', nt.st === 'dead');
  let hy = B.step(B.init('tide_hydra', { seed: 'g' }), { dmg: 1e9 }, 0.1).state;
  hy = B.step(hy, { dmg: 1e6 }, 0.1).state;
  check('4c. a boss that can never be tamed (tide_hydra) dies at weary as before', hy.st === 'dead');
  check('5. K.WEARY_GRACE is exported and at least 6 s', typeof G === 'number' && G >= 6);
}

if (failed) { console.log(failed + ' FAILED'); process.exit(1); } else console.log('ALL PASSED');
