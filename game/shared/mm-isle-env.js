// MMIsleEnv: island environment rules for the Hearthvale Isles (NEXT-SLICES-2 slice X5). Pure: no DOM, storage, timers, network, Date
// or Math.random. Every meter is a function of `t` (the seconds the hero has spent exposed; the page owns that one number) plus plain
// flags, so the same inputs always give the same answer. Nothing here takes or returns an inventory or a stable: no meter can ever
// destroy items or tames. Each rule has a kill-switch flag name (FLAGS) the page reads from its URL (?env=0 turns every rule off).
// UMD: browser global MMIsleEnv, or require().
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMIsleEnv = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const K = Object.freeze({
    WARMTH_SEC: 90,      // tundra: a full warmth meter drains in 90 s out in the cold
    CLOAK_MUL: 2,        // a warm cloak makes it last twice as long
    WARM_REFILL: 6,      // near a fire / hot spring the meter refills 6x faster than it drains
    COLD_SLOW: 0.8,      // at 0 warmth the hero moves at x0.8; the cold never deals damage
    O2_SEC: 90,          // mars: air outside a dome lasts 90 s (the pack's oxygen.seconds)
    O2_TANK_SEC: 120,    // with an o2_tank it lasts 120 s
    O2_REFILL: 8,        // inside a dome it refills 8x faster than it drains
    O2_HURT_EVERY: 3,    // at 0 air: 1 HP every 3 s
    WARN_SEC: 10,        // a calm warning starts 10 s before a meter is empty
    OVER_CAP: 600,       // t never needs to run more than this past empty (keeps numbers small)
    MARS_MOVE: 1.15,     // mars gravity: move x1.15
    MARS_DASH: 1.4,      // and dash +40%
  });
  // kill-switch flag names the page reads (?env=0 turns them all off; ?warmth=0 etc. one at a time)
  const FLAGS = Object.freeze({ all: 'env', swim: 'swim', warmth: 'warmth', oxygen: 'oxygen', gravity: 'gravity' });
  // which packs use which rule
  const RULES = Object.freeze({ meadow: Object.freeze([]), jungle: Object.freeze(['swim']), reef: Object.freeze(['swim']),
    tundra: Object.freeze(['swim', 'warmth']), mars: Object.freeze(['oxygen', 'gravity']) });
  // terrain names that are open (deep) water: on foot they need a swim mount. Solid lake water is handled by the world itself.
  const DEEP = Object.freeze(['deep_water', 'abyss', 'lagoon', 'coral_shallows', 'kelp_bed']);

  const fin = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const r3 = (n) => Math.round(n * 1000) / 1000;
  const has = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);

  // Can a mount swim? Accepts a creature def ({ride:{swim}}), a ride block ({swim}), an MMCompanion ride state ({m:{swim}}) or a boolean.
  function mountSwims(m) {
    if (m === true) return true;
    if (!m || typeof m !== 'object') return false;
    if (m.swim === true) return true;
    if (m.m && typeof m.m === 'object' && m.m.swim === true && !m.down) return true;
    return !!(m.ride && typeof m.ride === 'object' && m.ride.swim === true);
  }
  // swimAt(tile, mount, hazard): tile = terrain name (or {name}); hazard = the pack hazard entry for it (optional: {swim} or {breath}).
  // -> { deep, needSwim, ok }: deep water needs a swim mount; everything else is fine on foot.
  function swimAt(tile, mount, hazard) {
    const name = typeof tile === 'string' ? tile : (tile && typeof tile.name === 'string' ? tile.name : '');
    const hz = hazard && typeof hazard === 'object' ? hazard : null;
    const deep = DEEP.indexOf(name) >= 0 || !!(hz && (hz.swim === true || fin(hz.breath, 0) > 0));
    const swims = mountSwims(mount);
    return { deep: deep, needSwim: deep, ok: !deep || swims };
  }

  // a generic drain meter: t = seconds exposed; max = seconds until empty
  function meter(t, max, shelter, refill) {
    const tt = clamp(fin(t, 0), 0, max + K.OVER_CAP);
    const left = Math.max(0, max - tt);
    return { t: r3(tt), max: max, left: r3(left), val: r3(left / max), pct: Math.round(100 * left / max), empty: left <= 0,
      warn: left > 0 && left <= K.WARN_SEC, rate: shelter ? -refill : 1 };
  }
  // warmth(t, nearFire, cloak) on the tundra. rate: what t does per second now (+1 out in the cold, -WARM_REFILL by a fire).
  // At 0 the hero is slowed to x0.8; dmg is always 0.
  function warmth(t, nearFire, cloak) {
    const m = meter(t, K.WARMTH_SEC * (cloak ? K.CLOAK_MUL : 1), !!nearFire, K.WARM_REFILL);
    m.slow = m.empty ? K.COLD_SLOW : 1;
    m.dmg = 0;
    return m;
  }
  // oxygen(t, inDome, tank) on mars: lasts 90 s, 120 s with an o2_tank. At 0 it costs 1 HP every 3 s (hurt = the total HP lost since
  // the meter emptied, so the page applies the difference), with a 10 s warning before. It never slows and never touches items.
  function oxygen(t, inDome, tank) {
    const m = meter(t, tank ? K.O2_TANK_SEC : K.O2_SEC, !!inDome, K.O2_REFILL);
    m.slow = 1;
    m.dmg = m.empty ? 1 : 0;
    m.hurt = m.empty ? Math.floor((m.t - m.max) / K.O2_HURT_EVERY) : 0;
    m.nextHurt = m.empty ? r3(K.O2_HURT_EVERY - ((m.t - m.max) % K.O2_HURT_EVERY)) : 0;
    return m;
  }
  // gravity(pack) -> { move, dash } (mars x1.15 / x1.4; everywhere else x1)
  function gravity(pack) {
    return pack === 'mars' ? { move: K.MARS_MOVE, dash: K.MARS_DASH } : { move: 1, dash: 1 };
  }
  // advance an exposure clock: next t after dt seconds at `rate` (from warmth / oxygen), clamped to [0, max + OVER_CAP]
  // (refilling starts from `max` even after a long time past empty, so shelter always helps at once)
  function advance(t, rate, dt, max) {
    const mx = fin(max, K.WARMTH_SEC), r = fin(rate, 0);
    let tt = clamp(fin(t, 0), 0, mx + K.OVER_CAP);
    if (r < 0 && tt > mx) tt = mx;
    return r3(clamp(tt + r * clamp(fin(dt, 0), 0, 1), 0, mx + K.OVER_CAP));
  }
  // which rules are on for a pack, given the page's switches. get(name) -> the URL value or null (e.g. q.get.bind(q)), or a plain
  // object { env:'0', warmth:'0', ... }. A rule is off when ?env=0 or its own flag is '0'.
  function rules(pack, get) {
    const read = typeof get === 'function' ? get : (o => (k) => (has(o, k) ? String(o[k]) : null))(get && typeof get === 'object' ? get : {});
    const all = read(FLAGS.all) !== '0';
    const list = has(RULES, pack) ? RULES[pack] : [];
    const out = { swim: false, warmth: false, oxygen: false, gravity: false };
    Object.keys(out).forEach((k) => { out[k] = all && list.indexOf(k) >= 0 && read(FLAGS[k]) !== '0'; });
    return out;
  }

  return Object.freeze({ K: K, FLAGS: FLAGS, RULES: RULES, DEEP: DEEP, swimAt: swimAt, mountSwims: mountSwims, warmth: warmth, oxygen: oxygen,
    gravity: gravity, advance: advance, rules: rules, version: 1 });
}));
