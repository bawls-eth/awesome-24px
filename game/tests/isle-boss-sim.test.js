// Seeded fight simulation for shared/mm-isle-boss.js. Run: node game/tests/isle-boss-sim.test.js
// 1000 fights at each hero DPS (10/20/30), spread over the 4 bosses. A scripted hero dodges telegraphs (lossT s of lost damage
// per attack, a few mistakes) and either kills solo or feeds a feast at weary and soothes through MMTame's knockout path.
const B = require('../shared/mm-isle-boss.js');
const C = require('../shared/mm-creatures.js');
const MMRng = require('../shared/rng.js');
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }

const DT = 0.2, FIGHTS = 1000, LOSS_T = 0.9, MISS_P = 0.12, MISS_T = 1.5, DPS_EXP = 0.3, SOOTHE_MUL = 2, CAP_T = 900;
const BOSSES = B.ids();

// the hero stands on a point that no live zone covers (nearest of a coarse grid), or stays put when it "misses" the dodge
function safeSpot(zones, from) {
  let best = null, bd = 1e9;
  for (let x = -400; x <= 400; x += 100) for (let y = -400; y <= 400; y += 100) {
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
        const sf = B.safeFraction(zones, 0, 14); out.minSafe = Math.min(out.minSafe, sf); if (sf <= 0) out.unsafe++;
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
// ---- XB (NEXT-SLICES-3): signature mechanics. The cases above are unchanged; these add per-boss checks. ----
// one seeded solo fight with a dodging hero (same rules as fight()), collecting every event; heroAt(t, s) may pin the hero instead
function runEv(id, seed, opts) {
  const o = opts || {};
  let s = B.init(id, { seed: seed, rematch: !!o.rematch }); let t = 0, hero = { x: 200, y: 0 };
  const ev = [], live = {}; let maxLive = 0, maxIce = 0;
  while (t < CAP_T && ['fight', 'weary', 'taming'].indexOf(s.st) >= 0) {
    const inp = { hero: o.heroAt ? o.heroAt(t, s) : hero };
    if (s.st === 'fight') inp.dmg = (o.dps || 20) * 1.4 * DT; else if (s.st === 'weary') { if (o.feast && !o.fed) { inp.feast = true; o.fed = true; } else inp.dmg = 30; }
    if (o.head) inp.head = o.head(s);
    const r = B.step(s, inp, DT); s = r.state; t = r2(t + DT);
    maxLive = Math.max(maxLive, s.hazards.length); maxIce = Math.max(maxIce, s.ice.length);
    r.events.forEach((e) => {
      ev.push(Object.assign({ at: t, hx: inp.hero.x, hy: inp.hero.y }, e));
      if (e.type === 'telegraph') { live[e.id] = e.zone; if (!o.heroAt) hero = safeSpot(Object.values(live), hero) || hero; }
      else if (e.type === 'end' || e.type === 'cancel') delete live[e.id];
    });
    if (o.stopWeary && s.st === 'weary') break;
  }
  return { s, ev, maxLive, maxIce, t };
}
check('XB: every boss carries its signature mechanic in its phase scripts', JSON.stringify(BOSSES.map((id) => B.signatures(id))) === JSON.stringify([['roar'], ['submerge'], ['ice'], ['burrow', 'vents']]) && B.script('tide_hydra').heads === 3 && !!B.script('frost_dragon').springs);
check('XB: every signature attack obeys the fair-fight audit (windup, slam windup, dmgMul, safe area)', B.audit().length === 0 && BOSSES.every((id) => B.script(id).phases.every((p) => p.attacks.every((a) => !a.sig || (a.windup >= B.minWindup(a) && a.windup >= 0.6 && a.dmgMul <= 1.2)))));
{ // tide_hydra: 3 heads, cut in any order; submerged dives with bubble telegraphs
  const order = [2, 0, 1];
  const a = runEv('tide_hydra', 'xb-h1', { head: (s) => order.find((i) => s.heads[i] > 0) });
  const cuts = a.ev.filter((e) => e.type === 'head_cut');
  check('XB hydra: 3 heads, each cut once, in the order you choose (2, 0, 1)', cuts.length === 3 && cuts.map((e) => e.head).join() === '2,0,1' && cuts[2].left === 0, JSON.stringify(cuts.map((e) => e.head)));
  const b = runEv('tide_hydra', 'xb-h1');
  check('XB hydra: with no head chosen they fall in order 0, 1, 2 (spill-over), and the third falls at weary', b.ev.filter((e) => e.type === 'head_cut').map((e) => e.head).join() === '0,1,2' && b.ev.findIndex((e) => e.type === 'head_cut' && e.left === 0) <= b.ev.findIndex((e) => e.type === 'weary'));
  const sub = b.ev.filter((e) => e.type === 'submerge'), sur = b.ev.filter((e) => e.type === 'surface'), bub = b.ev.filter((e) => e.type === 'telegraph' && e.atk === 'bubble_rise');
  check('XB hydra: it dives (submerge -> surface pairs) and every rise is a bubble telegraph >= 0.8 s', sub.length >= 1 && sub.length === sur.length && bub.length >= sub.length && bub.every((e) => e.windup >= 0.8 && e.zone.shape === 'burst' && e.zone.pts.length === 3));
  check('XB hydra: bubbles start where you stand but leave > 80% of the arena safe', bub.every((e) => B.hitTest(e.zone, e.hx, e.hy, 0) && B.safeFraction([e.zone], 0, 28) > 0.8));
  check('XB hydra: never more than 2 live hazards, fight ends in a kill', b.maxLive <= 2 && b.s.st === 'dead');
}
{ // frost_dragon: cone breath leaves ice_thin; the hot springs are always safe
  const a = runEv('frost_dragon', 'xb-d1');
  const ice = a.ev.filter((e) => e.type === 'ice'), springs = a.s.springs;
  check('XB dragon: its cone breath leaves ice_thin patches (at most 2 at once, all thawed by the end)', ice.length >= 2 && ice.every((e) => e.tile === 'ice_thin' && e.zone.shape === 'cone') && a.maxIce <= 2 && a.ev.filter((e) => e.type === 'thaw').length === ice.length);
  check('XB dragon: 2 hot springs inside the arena', Array.isArray(springs) && springs.length === 2 && springs.every((p) => Math.hypot(p.x, p.y) + p.r <= B.K.ARENA_R));
  const hits = a.ev.filter((e) => e.type === 'hit');
  check('XB dragon: no frost attack ever covers a hot spring centre', hits.length > 20 && hits.every((e) => springs.every((p) => !B.hitTest(e.zone, p.x, p.y, 0) && !B.hitTest(e.zone, p.x, p.y, 1.2))));
  const sp = springs[0], c = runEv('frost_dragon', 'xb-d1', { heroAt: () => ({ x: sp.x, y: sp.y }) });
  check('XB dragon: a hero who stands in a spring the whole fight is never hit', c.ev.filter((e) => e.type === 'hit').every((e) => !B.hitTest(e.zone, sp.x, sp.y, 0)) && c.s.st === 'dead');
}
{ // red_titan: burrow line telegraph and lava vents
  const a = runEv('red_titan', 'xb-t1');
  const dig = a.ev.filter((e) => e.type === 'dig'), rise = a.ev.filter((e) => e.type === 'rise');
  const bt = a.ev.filter((e) => e.type === 'telegraph' && e.atk === 'titan_burrow'), vt = a.ev.filter((e) => e.type === 'telegraph' && e.atk === 'lava_vents');
  check('XB titan: it burrows along a telegraphed line (dig -> rise pairs, windup >= 0.8 s)', dig.length >= 1 && dig.length === rise.length && bt.length === dig.length && bt.every((e) => e.zone.shape === 'line' && e.windup >= 0.8));
  check('XB titan: lava vents are 3 discs inside the arena, telegraphed >= 0.8 s', vt.length >= 1 && vt.every((e) => e.windup >= 0.8 && e.zone.pts.length === 3 && e.zone.pts.every((p) => Math.hypot(p.dx, p.dy) + e.zone.r <= B.K.ARENA_R + 1)));
  check('XB titan: vents only from phase 2 on and each leaves > 80% safe', vt.every((e) => B.safeFraction([e.zone], 0, 28) > 0.8) && vt[0].at > a.ev.find((e) => e.type === 'phase').at);
}
{ // fernjaw_tyrant: a roar ring, then always a charge line
  const a = runEv('fernjaw_tyrant', 'xb-f1');
  const tel = a.ev.filter((e) => e.type === 'telegraph');
  const roars = tel.map((e, i) => [e, tel[i + 1]]).filter((p) => p[0].atk === 'tyrant_roar' && p[1]);
  check('XB tyrant: it roars (a ring, windup >= 0.8 s) in phases 2 and 3 (never in the first)', roars.length >= 2 && roars.every((p) => p[0].zone.shape === 'ring' && p[0].windup >= 0.8) && JSON.stringify([...new Set(a.ev.filter((e) => e.type === 'telegraph' && e.atk === 'tyrant_roar').map((e) => { let ph = 0; a.ev.forEach((x) => { if (x.type === 'phase' && x.at <= e.at) ph = x.phase; }); return ph; }))].sort()) === '[1,2]');
  check('XB tyrant: every roar is answered by a charge line aimed at the hero', roars.every((p) => p[1].atk === 'tyrant_charge' && p[1].zone.shape === 'line' && Math.abs(Math.atan2(p[1].hy - p[1].zone.y, p[1].hx - p[1].zone.x) - p[1].zone.angle) < 0.01));
}
{ // rematch: the same fight, never a tame
  const r = runEv('fernjaw_tyrant', 'xb-r1', { rematch: true, feast: true, stopWeary: false });
  const w = r.ev.find((e) => e.type === 'weary');
  check('XB rematch: weary reports canTame false and a feast never starts a tame', w && w.canTame === false && r.ev.some((e) => e.type === 'no_tame') && !r.ev.some((e) => e.type === 'tame_start') && r.s.st !== 'tamed');
  const n = runEv('red_titan', 'xb-r2', { rematch: true });
  check('XB rematch: the fight still ends in a normal kill with the same phases', n.s.st === 'dead' && n.ev.filter((e) => e.type === 'phase').length === 2);
}
{ // no enrage for any boss: 20 idle minutes look like the first two
  BOSSES.forEach((id) => {
    let s = B.init(id, { seed: 'idle-xb' }); const early = [], late = [];
    for (let t = 0; t < 1200; t += DT) { const r = B.step(s, { hero: { x: 200, y: 0 } }, DT); s = r.state; r.events.filter((e) => e.type === 'hit').forEach((e) => (t < 120 ? early : late).push(e)); }
    const maxE = Math.max(...early.map((e) => e.dmgMul)), maxL = Math.max(...late.map((e) => e.dmgMul));
    check('XB no enrage (' + id + '): late damage and attack rate match the first 2 minutes', s.st === 'fight' && maxL <= maxE && late.length / 1080 <= early.length / 120 * 1.15, maxE + ' ' + maxL);
  });
}
{ // trophies map
  check('XB trophies: each boss maps to its trophy_* recipe and back', BOSSES.every((id) => /^trophy_[a-z]+$/.test(B.trophyFor(id)) && B.bossForTrophy(B.trophyFor(id)) === id) && B.trophyFor('__proto__') === '' && B.bossForTrophy('x') === '');
}
console.log(failed ? failed + ' FAILED' : 'ALL PASSED');
process.exitCode = failed ? 1 : 0;
