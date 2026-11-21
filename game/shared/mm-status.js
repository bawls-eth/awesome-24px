// MMStatus: pure buff/debuff catalogue + stacking rules (CLASS-WEAPON-BUILD-PLAN.md section c).
// No DOM, no Math.random, input never mutated; unknown ids and hostile input are no-ops.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMStatus = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  // sign +1/-1; on: P player, E enemy; sec default duration; max stacks; glyph + color for the HUD.
  const d = (id, sign, on, sec, maxStacks, glyph, color, extra) =>
    Object.freeze(Object.assign({ id, sign, on, sec, maxStacks, glyph, color }, extra || {}));
  const DEFS = Object.freeze({
    damaging: d('damaging', 1, 'P', 4, 1, 'blade-up', '#ffb347'),
    berserk: d('berserk', 1, 'P', 4, 1, 'chevrons', '#ff6a4a'),
    swift: d('swift', 1, 'P', 4, 1, 'arrow-tail', '#7ee7ff'),
    armored: d('armored', 1, 'P', 4, 1, 'shield', '#6ab8ff'),
    healing: d('healing', 1, 'P', 5, 1, 'plus', '#7ee787'),
    shielded: d('shielded', 1, 'P', 6, 99, 'ring', '#8fe9ff'),
    inspired: d('inspired', 1, 'P', 4, 1, 'star', '#ffe27a'),
    weak: d('weak', -1, 'PE', 3, 1, 'blade-bent', '#b9b0cc'),
    dazed: d('dazed', -1, 'PE', 2, 1, 'spiral', '#d2a8ff', { bossImmune: true }),
    slowed: d('slowed', -1, 'PE', 2, 1, 'chevron-down', '#8fb8ff', { bossPot: 0.85 }),
    rooted: d('rooted', -1, 'E', 1, 1, 'knot', '#5fbf6a', { bossImmune: true }),
    stunned: d('stunned', -1, 'E', 0.8, 1, 'stars', '#fff3c4', { bossImmune: true, reImmune: 6 }),
    armorBroken: d('armorBroken', -1, 'PE', 3, 1, 'shield-cracked', '#c39bff'),
    curse: d('curse', -1, 'PE', 4, 3, 'skull', '#a050ff'),
    bleed: d('bleed', -1, 'PE', 3, 3, 'droplet', '#ff5f6b'),
    sick: d('sick', -1, 'P', 3, 1, 'plus-struck', '#9acd32'),
    marked: d('marked', -1, 'E', 3, 1, 'crosshair', '#ff8fa8'),
  });
  const IDS = Object.freeze(Object.keys(DEFS));
  // Negative wins over its positive twin.
  const OPPOSITE = Object.freeze({ damaging: 'weak', berserk: 'dazed', swift: 'slowed', armored: 'armorBroken', healing: 'sick' });
  const CAPS = Object.freeze({ dmg: [0.5, 1.6], taken: [0.5, 1.5], speed: [0.4, 1.3] });
  const TENACITY_WINDOW_MS = 6000, TENACITY_FLOOR = 0.25, BOLT_GAP_MS = 500;

  const kindOf = (k) => (k === 'enemy' || k === 'boss' ? k : 'player');
  const side = (kind) => (kind === 'player' ? 'P' : 'E');

  // State: plain JSON {v, fx:{id:{until,stacks,pot,src}}, ten:{id:{end,f}}, imm:{id:untilMs}, boltAt}.
  function blank() { return { v: 1, fx: {}, ten: {}, imm: {}, boltAt: -1e9 }; }
  // Copy only well-formed known entries so hostile state cannot smuggle keys.
  function clone(st) {
    const out = blank();
    if (!st || typeof st !== 'object') return out;
    out.boltAt = num(st.boltAt, -1e9);
    const fx = st.fx && typeof st.fx === 'object' ? st.fx : {};
    const ten = st.ten && typeof st.ten === 'object' ? st.ten : {};
    const imm = st.imm && typeof st.imm === 'object' ? st.imm : {};
    for (const id of IDS) {
      const f = hasOwn(fx, id) ? fx[id] : null;
      if (f && typeof f === 'object' && Number.isFinite(f.until)) {
        out.fx[id] = { until: f.until, stacks: clamp(Math.floor(num(f.stacks, 1)), 1, DEFS[id].maxStacks),
          pot: num(f.pot, 0), src: typeof f.src === 'string' ? f.src.slice(0, 24) : '' };
      }
      const t = hasOwn(ten, id) ? ten[id] : null;
      if (t && typeof t === 'object' && Number.isFinite(t.end)) out.ten[id] = { end: t.end, f: clamp(num(t.f, 1), TENACITY_FLOOR, 1) };
      if (hasOwn(imm, id) && Number.isFinite(imm[id])) out.imm[id] = imm[id];
    }
    return out;
  }

  function immune(id, targetKind, state, nowMs) {
    if (typeof id !== 'string' || !hasOwn(DEFS, id)) return true;
    const def = DEFS[id], kind = kindOf(targetKind);
    if (def.on.indexOf(side(kind)) < 0) return true;
    if (kind === 'boss' && def.bossImmune) return true;
    if (state && state.imm && hasOwn(state.imm, id) && num(nowMs, 0) < num(state.imm[id], 0)) return true;
    return false;
  }

  // apply(state, id, {sec, stacks, pot, src, kind, fromBolt, picnic, safe}, nowMs) -> new state (input untouched).
  function apply(state, id, opts, nowMs) {
    const out = clone(state);
    if (typeof id !== 'string' || !hasOwn(DEFS, id)) return out;
    const o = opts && typeof opts === 'object' ? opts : {};
    const now = num(nowMs, 0), def = DEFS[id], kind = kindOf(o.kind);
    if (immune(id, kind, out, now)) return out;
    if (def.sign < 0 && o.safe) return out; // Shore / zone 0: no hostile statuses
    if (o.fromBolt) {
      if (now - out.boltAt < BOLT_GAP_MS) return out;
      out.boltAt = now;
    }
    let sec = clamp(num(o.sec, def.sec), 0, 60) * 1000; // opts.sec in seconds, state in ms
    if (def.sign < 0 && o.picnic) sec *= 0.5;
    if (sec <= 0) return out;
    const cur = out.fx[id], isActive = !!cur && cur.until > now;
    // Boss tenacity: a re-apply soon after expiry is shortened (halving, floor 25%).
    if (kind === 'boss' && def.sign < 0) {
      const t = out.ten[id];
      let f = 1;
      if (isActive) f = t ? t.f : 1;
      else if (t && now >= t.end && now - t.end <= TENACITY_WINDOW_MS) f = Math.max(TENACITY_FLOOR, t.f * 0.5);
      sec *= f;
      out.ten[id] = { end: Math.max(now + sec, isActive ? cur.until : 0), f };
    }
    let pot = num(o.pot, 0);
    if (id === 'slowed' && kind === 'boss') pot = pot ? Math.max(pot, def.bossPot) : def.bossPot;
    const add = clamp(Math.floor(num(o.stacks, 1)), 1, 99);
    if (isActive) {
      const stacks = id === 'shielded' ? Math.max(cur.stacks, add)
        : def.maxStacks > 1 ? Math.min(def.maxStacks, cur.stacks + add) : 1;
      // Take-max potency (a slow factor: smaller = stronger), refresh duration.
      let keep;
      if (id === 'slowed') keep = cur.pot && pot ? Math.min(cur.pot, pot) : (cur.pot || pot);
      else keep = Math.max(cur.pot, pot);
      out.fx[id] = { until: Math.max(cur.until, now + sec), stacks, pot: keep, src: String(o.src || cur.src || '').slice(0, 24) };
    } else {
      out.fx[id] = { until: now + sec, stacks: id === 'shielded' ? add : Math.min(def.maxStacks, add), pot, src: String(o.src || '').slice(0, 24) };
    }
    if (def.reImmune) out.imm[id] = out.fx[id].until + def.reImmune * 1000;
    return out;
  }

  // applyStatus(target, id, opts): target = {kind:'player'|'enemy'|'boss', status}; returns a shallow-copied target.
  function applyStatus(target, id, opts) {
    const t = target && typeof target === 'object' ? target : {};
    const o = opts && typeof opts === 'object' ? opts : {};
    return Object.assign({}, t, { status: apply(t.status, id, Object.assign({}, o, { kind: o.kind || t.kind }), o.now) });
  }

  function tick(state, nowMs) {
    const now = num(nowMs, 0), s = clone(state);
    for (const id of IDS) {
      if (s.fx[id] && s.fx[id].until <= now) delete s.fx[id];
      if (s.ten[id] && !s.fx[id] && now - s.ten[id].end > TENACITY_WINDOW_MS) delete s.ten[id];
      if (s.imm[id] !== undefined && s.imm[id] <= now) delete s.imm[id];
    }
    return s;
  }

  function activeMap(state, nowMs) {
    const s = clone(state), now = nowMs === undefined ? -Infinity : num(nowMs, 0), on = {};
    for (const id of IDS) if (s.fx[id] && s.fx[id].until > now) on[id] = s.fx[id];
    return on;
  }

  // mods(state, nowMs, kind): multipliers for the stat code. kind 'player' (default) | 'enemy' | 'boss'.
  function mods(state, nowMs, kind) {
    const on = activeMap(state, nowMs), isP = kindOf(kind) === 'player';
    const use = (id) => on[id] && !(hasOwn(OPPOSITE, id) && on[OPPOSITE[id]]);
    const m = { dmg: 1, rate: 1, speed: 1, taken: 1, regen: 0, dot: 0, noHeal: false, cdRate: 1, enemyFire: 1, enemyDmg: 1,
      stun: false, guard0: false, shieldHits: 0 };
    if (use('damaging')) m.dmg *= 1.25;
    if (on.weak) { if (isP) m.dmg *= 0.75; else m.enemyDmg *= 0.75; }
    if (use('berserk')) m.rate *= 1.25;
    if (on.dazed) { if (isP) m.rate *= 0.6; else m.enemyFire *= 1.5; }
    if (use('swift')) m.speed *= 1.2;
    if (on.slowed) m.speed *= on.slowed.pot > 0 ? on.slowed.pot : 0.65;
    if (on.rooted) m.speed *= 0.1;
    if (on.stunned) { m.speed = 0; m.stun = true; }
    if (use('armored')) m.taken *= 0.75;
    if (on.armorBroken) { m.taken *= 1.25; m.guard0 = true; }
    if (on.curse) m.taken *= 1 + 0.1 * on.curse.stacks;
    if (on.marked) m.taken *= 1.1;
    if (use('healing')) m.regen = 4;
    if (on.sick) { m.noHeal = true; m.regen = 0; }
    if (on.bleed) m.dot = (isP ? 2 : 0.5) * on.bleed.stacks; // player hp/s; enemy x hero dmg per second
    if (use('inspired')) m.cdRate = 1.4;
    if (on.shielded) m.shieldHits = on.shielded.stacks;
    m.dmg = clamp(m.dmg, CAPS.dmg[0], CAPS.dmg[1]);
    m.taken = clamp(m.taken, CAPS.taken[0], CAPS.taken[1]);
    m.speed = isP ? clamp(m.speed, CAPS.speed[0], CAPS.speed[1]) : Math.min(m.speed, CAPS.speed[1]);
    return m;
  }

  // HUD list: negatives first, at most 6, with seconds left and a 0..1 fraction for the clock pie.
  function iconList(state, nowMs, max) {
    const on = activeMap(state, nowMs), now = nowMs === undefined ? 0 : num(nowMs, 0), out = [];
    for (const id of IDS) {
      if (!on[id]) continue;
      const def = DEFS[id], left = Math.max(0, (on[id].until - now) / 1000);
      out.push({ id, neg: def.sign < 0, glyph: def.glyph, color: def.color, stacks: on[id].stacks, left,
        frac: def.sec > 0 ? clamp(left / def.sec, 0, 1) : 0, blink: left <= 1 });
    }
    out.sort((a, b) => (a.neg === b.neg ? 0 : a.neg ? -1 : 1));
    return out.slice(0, clamp(Math.floor(num(max, 6)), 0, 6));
  }

  return { DEFS, IDS, OPPOSITE, CAPS, TENACITY_WINDOW_MS, TENACITY_FLOOR, BOLT_GAP_MS,
    blank, apply, applyStatus, tick, mods, iconList, immune };
});
