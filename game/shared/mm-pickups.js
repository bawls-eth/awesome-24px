// MMPickups: pure pickup table (NEXT-SLICES N4): coins, XP orbs, hearts, focus orbs and the 6 potions, per enemy tier 1..5.
// Rolls are seeded by (seed, group, kill) through MMRng (never Math.random), so every peer computes the same drops.
// Magnet radius 64 px; lifetime per tier; heals are capped at max HP. No DOM, inputs are never mutated, hostile input is cleaned.
// Art ids: b15 coin_f1..4, xp_orb_f1..4, heart_pickup, focus_pickup, potion_life/focus/power/swift/guard/wit.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rng.js'));
  else root.MMPickups = factory(root.MMRng);
})(typeof self !== 'undefined' ? self : this, function (MMRng) {
  const MAGNET_RADIUS = 64, COLLECT_RADIUS = 16, MAGNET_SPEED = 360; // px, px, px/s
  const LIFETIME_MS = [0, 20000, 24000, 28000, 34000, 40000]; // index = tier (1..5)
  const COIN_FRAMES = ['coin_f1', 'coin_f2', 'coin_f3', 'coin_f4'];
  const XP_FRAMES = ['xp_orb_f1', 'xp_orb_f2', 'xp_orb_f3', 'xp_orb_f4'];
  // Potions: life heals a fraction of max HP, focus refills focus, the rest are timed stat buffs (value = additive amount).
  const POTIONS = {
    potion_life: { kind: 'heal', frac: 0.4 },
    potion_focus: { kind: 'focus', frac: 0.5 },
    potion_power: { kind: 'buff', stat: 'pow', amount: 4, sec: 30 },
    potion_swift: { kind: 'buff', stat: 'swf', amount: 4, sec: 30 },
    potion_guard: { kind: 'buff', stat: 'grd', amount: 4, sec: 30 },
    potion_wit: { kind: 'buff', stat: 'wit', amount: 4, sec: 30 },
  };
  const POTION_IDS = Object.keys(POTIONS);
  const TYPES = ['coin', 'xp', 'heart', 'focus', 'potion'];
  // Per-tier tables: coins [min,max] per kill, xp value, chance of potion / heart / focus.
  const TABLE = {
    1: { coins: [1, 2], xp: 4, potion: 0.01, heart: 0.04, focus: 0.03 },
    2: { coins: [1, 3], xp: 8, potion: 0.02, heart: 0.05, focus: 0.04 },
    3: { coins: [2, 4], xp: 14, potion: 0.03, heart: 0.06, focus: 0.05 },
    4: { coins: [2, 5], xp: 22, potion: 0.045, heart: 0.07, focus: 0.06 },
    5: { coins: [3, 6], xp: 32, potion: 0.06, heart: 0.08, focus: 0.07 },
  };
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const tierOf = (t) => { const v = Math.floor(Number(t)); return Number.isFinite(v) ? Math.max(1, Math.min(5, v)) : 1; };
  const str = (v) => (typeof v === 'string' || isNum(v) ? String(v).slice(0, 64) : '');
  const KILL_COINS_CAP = 6;

  // roll(seed, group, kill, tier) -> array of pickup descriptors { type, art, value, tier, lifeMs, frames? }. Same args -> same result.
  function roll(seed, group, kill, tier) {
    const t = tierOf(tier), row = TABLE[t];
    const r = MMRng.create('mm-pickups:' + str(seed) + ':' + str(group) + ':' + str(kill));
    const out = [];
    const coins = Math.min(KILL_COINS_CAP, r.int(row.coins[0], row.coins[1]));
    out.push({ type: 'coin', art: COIN_FRAMES[0], frames: COIN_FRAMES, value: coins, tier: t, lifeMs: LIFETIME_MS[t] });
    out.push({ type: 'xp', art: XP_FRAMES[0], frames: XP_FRAMES, value: row.xp, tier: t, lifeMs: LIFETIME_MS[t] });
    if (r.next() < row.potion) { const id = POTION_IDS[r.int(0, POTION_IDS.length - 1)]; out.push({ type: 'potion', art: id, value: 1, tier: t, lifeMs: LIFETIME_MS[t] }); }
    if (r.next() < row.heart) out.push({ type: 'heart', art: 'heart_pickup', value: 20 + 6 * t, tier: t, lifeMs: LIFETIME_MS[t] });
    if (r.next() < row.focus) out.push({ type: 'focus', art: 'focus_pickup', value: 15 + 5 * t, tier: t, lifeMs: LIFETIME_MS[t] });
    return out;
  }

  // heal(hp, maxHp, amount) -> new hp, never above maxHp, never below the current hp (negative/NaN amounts heal 0). Bad hp -> 0.
  function heal(hp, maxHp, amount) {
    const m = isNum(maxHp) && maxHp > 0 ? maxHp : 0;
    const h = isNum(hp) ? Math.max(0, Math.min(hp, m)) : 0;
    const a = isNum(amount) && amount > 0 ? amount : 0;
    return Math.min(m, h + a);
  }
  // use(pickup or potion id, {hp, maxHp, focus, maxFocus}) -> { hp, focus, buff } as new values (no mutation).
  function use(pick, st) {
    const s = st && typeof st === 'object' ? st : {};
    const maxHp = isNum(s.maxHp) && s.maxHp > 0 ? s.maxHp : 0, maxFocus = isNum(s.maxFocus) && s.maxFocus > 0 ? s.maxFocus : 0;
    const out = { hp: heal(s.hp, maxHp, 0), focus: isNum(s.focus) ? Math.max(0, Math.min(s.focus, maxFocus)) : 0, buff: null };
    const type = pick && typeof pick === 'object' ? pick.type : null;
    const value = pick && isNum(pick.value) ? Math.max(0, Math.min(1000, pick.value)) : 0;
    if (type === 'heart') out.hp = heal(s.hp, maxHp, value);
    else if (type === 'focus') out.focus = Math.min(maxFocus, out.focus + value);
    else if (type === 'potion' && has(POTIONS, pick.art)) {
      const p = POTIONS[pick.art];
      if (p.kind === 'heal') out.hp = heal(s.hp, maxHp, Math.ceil(maxHp * p.frac));
      else if (p.kind === 'focus') out.focus = Math.min(maxFocus, out.focus + Math.ceil(maxFocus * p.frac));
      else out.buff = { stat: p.stat, amount: p.amount, sec: p.sec };
    }
    return out;
  }

  // magnetStep(pickup{x,y}, player{x,y}, dtSec) -> { x, y, collected, magnet }: inside 64 px it homes at 360 px/s; inside 16 px it is collected.
  function magnetStep(pick, player, dtSec) {
    if (!pick || !player || !isNum(pick.x) || !isNum(pick.y) || !isNum(player.x) || !isNum(player.y)) return { x: isNum(pick && pick.x) ? pick.x : 0, y: isNum(pick && pick.y) ? pick.y : 0, collected: false, magnet: false };
    const dx = player.x - pick.x, dy = player.y - pick.y, d = Math.hypot(dx, dy);
    if (d <= COLLECT_RADIUS) return { x: player.x, y: player.y, collected: true, magnet: true };
    if (d > MAGNET_RADIUS) return { x: pick.x, y: pick.y, collected: false, magnet: false };
    const dt = isNum(dtSec) ? Math.max(0, Math.min(0.25, dtSec)) : 0;
    const step = Math.min(d, MAGNET_SPEED * dt);
    const nx = pick.x + (dx / d) * step, ny = pick.y + (dy / d) * step;
    const left = Math.hypot(player.x - nx, player.y - ny);
    return left <= COLLECT_RADIUS ? { x: player.x, y: player.y, collected: true, magnet: true } : { x: nx, y: ny, collected: false, magnet: true };
  }
  // expired(pickup{bornMs, lifeMs}, nowMs): true when the lifetime ran out. Hostile input -> true (drop it).
  function expired(pick, nowMs) {
    if (!pick || !isNum(pick.bornMs) || !isNum(pick.lifeMs) || !isNum(nowMs)) return true;
    return nowMs - pick.bornMs >= Math.min(pick.lifeMs, LIFETIME_MS[5]);
  }
  // clean(raw): save/network cleaner for one pickup. Unknown type or art -> null.
  function clean(raw) {
    if (!raw || typeof raw !== 'object' || TYPES.indexOf(raw.type) < 0) return null;
    const okArt = raw.type === 'coin' ? COIN_FRAMES[0] : raw.type === 'xp' ? XP_FRAMES[0] : raw.type === 'heart' ? 'heart_pickup' : raw.type === 'focus' ? 'focus_pickup' : (has(POTIONS, raw.art) ? raw.art : null);
    if (!okArt || !isNum(raw.x) || !isNum(raw.y)) return null;
    const t = tierOf(raw.tier);
    return { type: raw.type, art: okArt, value: isNum(raw.value) ? Math.max(0, Math.min(1000, raw.value)) : 0, tier: t, lifeMs: LIFETIME_MS[t], x: Math.max(-1e6, Math.min(1e6, raw.x)), y: Math.max(-1e6, Math.min(1e6, raw.y)), bornMs: isNum(raw.bornMs) ? Math.max(0, raw.bornMs) : 0 };
  }
  return { MAGNET_RADIUS, COLLECT_RADIUS, MAGNET_SPEED, LIFETIME_MS, COIN_FRAMES, XP_FRAMES, POTIONS, POTION_IDS, TYPES, TABLE, tierOf, roll, heal, use, magnetStep, expired, clean };
});
