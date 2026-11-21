// Seeded fight simulation for shared/mm-isle-boss.js. Run: node game/tests/isle-boss-sim.test.js
// 1000 fights at each hero DPS (10/20/30), spread over the 4 bosses. A scripted hero dodges telegraphs (lossT s of lost damage
// per attack, a few mistakes) and either kills solo or feeds a feast at weary and soothes through MMTame's knockout path.
const B = require('../shared/mm-isle-boss.js');
const C = require('../shared/mm-creatures.js');
const MMRng = require('../shared/rng.js');
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }

const DT = 0.1, FIGHTS = 1000, LOSS_T = 0.9, MISS_P = 0.12, MISS_T = 1.5, DPS_EXP = 0.3, SOOTHE_MUL = 2, CAP_T = 900;
const BOSSES = B.ids();

// the hero stands on a point that no live zone covers (nearest of a coarse grid), or stays put when it "misses" the dodge
function safeSpot(zones, from) {
  let best = null, bd = 1e9;
  for (let x = -400; x <= 400; x += 50) for (let y = -400; y <= 400; y += 50) {
    if (Math.hypot(x, y) > B.K.ARENA_R) continue;
    if (zones.some((z) => B.hitTest(z, x, y, 0))) continue;
    const dd = Math.hypot(x - from.x, y - from.y);
    if (dd < bd) { bd = dd; best = { x, y }; }
  }
  return best;
}

function fight(id, dps, idx, mode) {
  const rng = MMRng.create('sim:' + id + ':' + dps + ':' + idx + ':' + mode);
  let s = B.init(id, { seed: 'f' + idx });
  const eff = B.script(id).simMul * Math.pow(dps, DPS_EXP);
  const live = {}; let hero = { x: 200, y: 0 }, lostUntil = 0, t = 0;
  const out = { t: 0, st: '', hits: 0, maxHit: 0, unsafe: 0, minSafe: 1, maxLive: 0, minWindup: 99, phases: [], weary: 0, wearyT: 0, attacks: 0 };
  let fedAt = -1;
  while (t < CAP_T && ['fight', 'weary', 'taming'].indexOf(s.st) >= 0) {
    const inp = { hero };
    if (s.st === 'fight') { if (t >= lostUntil) inp.dmg = eff * DT; }
    else if (s.st === 'weary') { if (mode === 'tame') inp.feast = true; else inp.dmg = eff * DT; }
    else if (s.st === 'taming') {
      const asleep = s.tame.st !== 'wild';
      if (!asleep) inp.torporHit = dps * SOOTHE_MUL * DT; else inp.offer = 'feast';
      if (fedAt < 0) fedAt = t;
    }
    const r = B.step(s, inp, DT); s = r.state; t = Math.round((t + DT) * 1000) / 1000;
    out.maxLive = Math.max(out.maxLive, s.hazards.length);
    r.events.forEach((e) => {
      if (e.type === 'telegraph') {
        out.attacks++; live[e.id] = e.zone; out.minWindup = Math.min(out.minWindup, e.windup);
        const zones = Object.keys(live).map((k) => live[k]);
        const sf = B.safeFraction(zones, 0); out.minSafe = Math.min(out.minSafe, sf); if (sf <= 0) out.unsafe++;
        if (rng.next() < MISS_P) lostUntil = Math.max(lostUntil, t + MISS_T); else { lostUntil = Math.max(lostUntil, t + LOSS_T); hero = safeSpot(zones, hero) || hero; }
      } else if (e.type === 'hit') {
        if (B.hitTest(e.zone, hero.x, hero.y, 0)) { out.hits++; out.maxHit = Math.max(out.maxHit, e.dmgMul); }
      } else if (e.type === 'end' || e.type === 'cancel') delete live[e.id];
      else if (e.type === 'phase') out.phases.push(r2(s.hp / s.hpMax));
      else if (e.type === 'weary') { out.weary++; out.wearyT = t; }
    });
  }
  out.t = t; out.st = s.st;
  return out;
}
const r2 = (n) => Math.round(n * 1000) / 1000;
const median = (a) => { const b = a.slice().sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };

const t0 = Date.now();
const res = {};
[10, 20, 30].forEach((dps) => {
  const solo = [], tame = [], all = [];
  for (let i = 0; i < FIGHTS; i++) {
    const id = BOSSES[i % BOSSES.length];
    const a = fight(id, dps, i, 'solo'); solo.push(a); all.push(a);
    if (C.get(id).tame) { const b = fight(id, dps, i, 'tame'); tame.push(b); all.push(b); }
  }
  res[dps] = { solo, tame, all };
  const per = {}; BOSSES.forEach((id) => { per[id] = median(solo.filter((_, i) => BOSSES[i % BOSSES.length] === id).map((x) => x.t)); });
  console.log('dps ' + dps + ' solo median ' + median(solo.map((x) => x.t)) + ' s, per boss ' + JSON.stringify(per) + ', tame median ' + median(tame.map((x) => x.t)) + ' s (' + tame.length + ' fights)');
});
console.log('sim ' + (Date.now() - t0) + ' ms');

[10, 20, 30].forEach((dps) => {
  const R = res[dps];
  const sm = median(R.solo.map((x) => x.t));
  check('dps ' + dps + ': 1000 solo fights, all end in a kill', R.solo.length === FIGHTS && R.solo.every((x) => x.st === 'dead'));
  check('dps ' + dps + ': median solo kill 60-180 s (' + sm + ')', sm >= 60 && sm <= 180);
  const per = BOSSES.map((id) => median(R.solo.filter((_, i) => BOSSES[i % BOSSES.length] === id).map((x) => x.t)));
  check('dps ' + dps + ': every boss median 60-180 s (' + per.map((v) => Math.round(v)) + ')', per.every((v) => v >= 60 && v <= 180));
  const tm = median(R.tame.map((x) => x.t));
  check('dps ' + dps + ': boss-tame median 150-240 s incl. weary (' + tm + ')', tm >= 150 && tm <= 240);
  check('dps ' + dps + ': every boss-tame ends tamed', R.tame.length > 0 && R.tame.every((x) => x.st === 'tamed'));
  check('dps ' + dps + ': weary happens exactly once per fight', R.all.every((x) => x.weary === 1));
  check('dps ' + dps + ': phases change at 70% and 35% HP', R.all.every((x) => x.phases.length === 2 && x.phases[0] <= 0.7 && x.phases[0] > 0.55 && x.phases[1] <= 0.35 && x.phases[1] > 0.2));
  check('dps ' + dps + ': never more than 2 live hazards', R.all.every((x) => x.maxLive <= 2));
  check('dps ' + dps + ': every windup >= 0.6 s', R.all.every((x) => x.minWindup >= 0.6));
  check('dps ' + dps + ': every attack leaves a safe zone (min safe area > 15%)', R.all.every((x) => x.minSafe > 0.15 && x.unsafe === 0), 'min ' + Math.min(...R.all.map((x) => x.minSafe)));
  check('dps ' + dps + ': no instant-kill hit (dmgMul <= 1.2, one hit per hazard)', R.all.every((x) => x.maxHit <= 1.2));
  check('dps ' + dps + ': a dodging hero is hit by < 20% of attacks', R.all.reduce((n, x) => n + x.hits, 0) / R.all.reduce((n, x) => n + x.attacks, 0) < 0.2);
});

// no enrage: a hero that deals no damage for 20 minutes sees the same attack mix and damage as in the first minute
{
  let s = B.init('red_titan', { seed: 'idle' }); const early = [], late = [];
  for (let t = 0; t < 1200; t += DT) {
    const r = B.step(s, { hero: { x: 200, y: 0 } }, DT); s = r.state;
    r.events.filter((e) => e.type === 'hit').forEach((e) => (t < 120 ? early : late).push(e));
  }
  const maxE = Math.max(...early.map((e) => e.dmgMul)), maxL = Math.max(...late.map((e) => e.dmgMul));
  const rate = (a, secs) => a.length / secs;
  check('no enrage: late damage and attack rate match the first 2 minutes', s.st === 'fight' && s.phase === 0 && maxL === maxE && rate(late, 1080) <= rate(early, 120) * 1.1, maxE + ' ' + maxL);
}
console.log(failed ? failed + ' FAILED' : 'ALL PASSED');
process.exitCode = failed ? 1 : 0;
