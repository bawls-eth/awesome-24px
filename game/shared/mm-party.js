// Co-op party core (pure, no DOM, no network). UMD: browser global MMParty, or require().
// Party codes, seats, HP scaling, host migration, damage clamp, soulbound loot, bandwidth guards.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMParty = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  const ALPHABET = 'ABCDEFGHJKMNPQRTUVWXYZ'; // no I, L, O, S (look like 1, 0, 5)
  const CODE_LEN = 5;
  const MAX_PLAYERS = 4;
  const HP_PER_EXTRA = 0.6;
  const CLAMP_FACTOR = 1.3;
  const REPORT_INTERVAL_MS = 250;
  const SOULBOUND_SHARE = 0.08;
  const LIMITS = { snapshotBytes: 8192, writesPerSec: 10, bytesPerSec: 2048 };
  const LERP_MS = 120;

  function makeCode(rng) {
    const r = typeof rng === 'function' ? rng : Math.random;
    let s = '';
    for (let i = 0; i < CODE_LEN; i++) s += ALPHABET[Math.min(ALPHABET.length - 1, Math.floor(r() * ALPHABET.length))];
    return s;
  }
  function validCode(c) {
    if (typeof c !== 'string' || c.length !== CODE_LEN) return false;
    for (let i = 0; i < c.length; i++) if (ALPHABET.indexOf(c[i]) < 0) return false;
    return true;
  }

  // ---- party ----
  function create(code, hostId) {
    if (!validCode(code)) return null;
    return { code, host: hostId, members: [{ id: hostId, seat: 0 }], seen: {} };
  }
  function size(p) { return p.members.length; }
  function join(p, id) {
    if (p.members.some((m) => m.id === id)) return { ok: true, seat: p.members.find((m) => m.id === id).seat };
    if (p.members.length >= MAX_PLAYERS) return { ok: false, reason: 'full' };
    const used = new Set(p.members.map((m) => m.seat));
    let seat = 0; while (used.has(seat)) seat++;
    p.members.push({ id, seat });
    return { ok: true, seat };
  }
  // Frees the seat and forgets what that player had seen, so a rejoin starts clean.
  function leave(p, idOrSeat) {
    const i = p.members.findIndex((m) => m.id === idOrSeat || m.seat === idOrSeat);
    if (i < 0) return { ok: false };
    const m = p.members.splice(i, 1)[0];
    delete p.seen[m.id];
    const wasHost = p.host === m.id;
    let migration = null;
    if (wasHost && p.members.length) migration = migrate(p);
    return { ok: true, seat: m.seat, wasHost, migration };
  }
  // Promote the next member (lowest seat) to host. If the old host is still listed it is
  // moved out of the way. Boss resets to current phase start; duplicate entities cleared.
  function migrate(p) {
    const order = p.members.slice().sort((a, b) => a.seat - b.seat);
    const cand = order.find((m) => m.id !== p.host) || order[0];
    if (!cand) return null;
    p.host = cand.id;
    return { newHost: cand.id, bossReset: 'phaseStart', clearDuplicates: true };
  }
  function hpScale(n) { return 1 + HP_PER_EXTRA * (Math.max(1, Math.min(MAX_PLAYERS, n)) - 1); }
  function scaledHp(baseHp, n) { return Math.round(baseHp * hpScale(n)); }
  function markSeen(p, id, key) { (p.seen[id] = p.seen[id] || {})[key] = true; }
  function hasSeen(p, id, key) { return !!(p.seen[id] && p.seen[id][key]); }

  // ---- damage reports ----
  function clampDamage(reportedDps, maxDps) {
    const r = Number(reportedDps), m = Number(maxDps);
    if (!(r > 0) || !(m > 0)) return 0;
    return Math.min(r, m * CLAMP_FACTOR);
  }
  // Clamp a batched report (total damage over dtMs) against max DPS.
  function clampReport(totalDamage, dtMs, maxDps) {
    const dt = Math.max(1, Math.min(dtMs || REPORT_INTERVAL_MS, 2000)) / 1000;
    return clampDamage(totalDamage / dt, maxDps) * dt;
  }
  function makeBatcher(intervalMs) {
    const iv = intervalMs || REPORT_INTERVAL_MS;
    let last = null; const acc = {};
    return {
      add(enemyId, dmg) { acc[enemyId] = (acc[enemyId] || 0) + (dmg > 0 ? dmg : 0); },
      flush(nowMs, force) {
        if (last === null) last = nowMs - iv;
        if (!force && nowMs - last < iv) return null;
        const out = Object.keys(acc).map((e) => ({ e, d: acc[e] }));
        for (const k of Object.keys(acc)) delete acc[k];
        last = nowMs;
        return out.length ? out : null;
      },
    };
  }

  // ---- loot ----
  function qualifies(damageShare) { return Number(damageShare) >= SOULBOUND_SHARE; }
  // bag: {owner: id|null, ...}; owner null = public bag (created by host)
  function visibleBags(bags, playerId) { return bags.filter((b) => !b.owner || b.owner === playerId); }
  function makeBag(owner, item, p, hostId) {
    if (owner) return { owner, item };
    if (p && hostId !== p.host) return null; // only host makes public bags
    return { owner: null, item };
  }

  // ---- bandwidth ----
  function snapshotBytes(obj) {
    const s = JSON.stringify(obj);
    if (typeof Buffer !== 'undefined') return Buffer.byteLength(s);
    let n = 0; for (let i = 0; i < s.length; i++) n += s.charCodeAt(i) < 128 ? 1 : 3;
    return n;
  }
  function snapshotOk(obj) { return snapshotBytes(obj) < LIMITS.snapshotBytes; }
  function budget(limits) {
    const L = Object.assign({}, LIMITS, limits || {});
    const log = []; // {t, b}
    function prune(now) { while (log.length && now - log[0].t >= 1000) log.shift(); }
    return {
      canWrite(now, bytes) {
        prune(now);
        if (bytes >= L.snapshotBytes) return false;
        if (log.length >= L.writesPerSec) return false;
        return true;
      },
      record(now, bytes) { prune(now); log.push({ t: now, b: bytes || 0 }); },
      tryWrite(now, bytes) { if (!this.canWrite(now, bytes)) return false; this.record(now, bytes); return true; },
      kbPerSec(now) { prune(now); return log.reduce((s, e) => s + e.b, 0) / 1024; },
      overBandwidth(now) { return this.kbPerSec(now) * 1024 > L.bytesPerSec; },
    };
  }
  function changed(prev, next, eps) {
    if (!prev) return true;
    const e = eps || {};
    for (const k of Object.keys(next)) {
      const a = prev[k], b = next[k];
      if (typeof b === 'number' && typeof a === 'number') {
        const t = e[k] !== undefined ? e[k] : (e.default || 0);
        if (Math.abs(a - b) > t) return true;
      } else if (a !== b) return true;
    }
    return Object.keys(prev).some((k) => !(k in next));
  }
  function lerpState(a, b, t, keys) {
    const u = Math.max(0, Math.min(1, t));
    const out = Object.assign({}, b);
    for (const k of keys || Object.keys(b)) {
      if (typeof a[k] === 'number' && typeof b[k] === 'number') out[k] = a[k] + (b[k] - a[k]) * u;
    }
    return out;
  }
  // t fraction for a sample received at recvMs, rendered at nowMs with 120 ms delay
  function lerpFraction(prevMs, nextMs, nowMs) {
    const rt = nowMs - LERP_MS;
    if (nextMs <= prevMs) return 1;
    return Math.max(0, Math.min(1, (rt - prevMs) / (nextMs - prevMs)));
  }

  return {
    ALPHABET, CODE_LEN, MAX_PLAYERS, HP_PER_EXTRA, CLAMP_FACTOR, REPORT_INTERVAL_MS, SOULBOUND_SHARE, LIMITS, LERP_MS,
    makeCode, validCode, create, size, join, leave, migrate, hpScale, scaledHp, markSeen, hasSeen,
    clampDamage, clampReport, makeBatcher, qualifies, visibleBags, makeBag,
    snapshotBytes, snapshotOk, budget, changed, lerpState, lerpFraction,
  };
}));
