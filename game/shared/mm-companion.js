// MMCompanion: pure companion AI (follow / attack / stay / fetch) and mount rules for the Biome Archipelago (BIOME-ARCH-PLAN 2.3).
// No DOM, no random source: every function is deterministic for the same inputs. The caller owns damage (hits go through
// arena.damageEnemy); this module only returns what a companion wants to do. Decisions are made at THINK_HZ (8 Hz, staggered by slot),
// movement and the hit cooldown update every call. Hostile input (NaN, huge arrays, junk objects) is clamped, never thrown on.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMCompanion = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const MODES = ['follow', 'attack', 'stay', 'fetch'];
  const MAX_ACTIVE = 2;          // 1 on the MMPerf low tier (pass lowTier to activate / canActivate)
  const THINK_HZ = 8;
  const THINK_DT = 1 / THINK_HZ;
  const MAX_TAMES = 60;
  const MAX_SCAN = 128;          // enemies looked at per think (cost bound)
  const MAX_PICK_SCAN = 48;      // pickups looked at per think
  const SEEK_R = 260;            // attack: nearest awake hostile within this of the OWNER
  const LEASH = 340;             // a companion never walks farther than this from its owner while attacking
  const FETCH_R = 200;           // fetch: nearest pickup within this of the owner
  const ORBIT_MIN = 48, ORBIT_MAX = 96, ORBIT_R = 64;
  const TELEPORT_R = 720;        // far behind (portal, fast mount): snap beside the owner
  const DOWN_SEC = 60;           // a downed companion is ready again after this (no permadeath)
  const BASE_SPEED = 150;        // px/s
  const DPS_CAP = 0.35;          // companion damage <= 35% of hero DPS
  const MOUNT_FIRE_LOCK = 0.2, RIDER_HURT_K = 0.8, THROW_IFRAMES = 0.5;
  const DASH_MUL = { leap: 1.4, charge: 1.3, glide: 1.25, dash: 1.3 };

  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const num = (v, d) => { v = typeof v === 'number' ? v : Number(v); return Number.isFinite(v) ? v : d; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const pos = (o) => (isObj(o) ? { x: clamp(num(o.x, 0), -1e7, 1e7), y: clamp(num(o.y, 0), -1e7, 1e7) } : { x: 0, y: 0 });
  const ident = (v) => (typeof v === 'string' && /^[A-Za-z0-9_:-]{1,24}$/.test(v) ? v : '');

  function create(spec) {
    const s = isObj(spec) ? spec : {};
    const p = pos(s);
    const maxHp = clamp(num(s.maxHp, 30), 1, 100000);
    const slot = clamp(Math.floor(num(s.slot, 0)), 0, 1);
    return {
      id: ident(s.id), sp: ident(s.sp), x: p.x, y: p.y, mode: MODES.indexOf(s.mode) >= 0 ? s.mode : 'follow',
      tgt: -1, cd: 0, hp: clamp(num(s.hp, maxHp), 0, maxHp), maxHp: maxHp, down: Math.max(0, num(s.down, 0)),
      think: slot * (THINK_DT / MAX_ACTIVE), slot: slot, ax: p.x, ay: p.y, phase: 'out', carry: -1, scanned: 0, face: 1
    };
  }

  // Active-party rule: at most MAX_ACTIVE (1 on a low tier). Returns true when c is (now) in list.
  function activate(list, c, lowTier) {
    if (!Array.isArray(list) || !isObj(c)) return false;
    if (list.indexOf(c) >= 0) return true;
    if (list.length >= (lowTier ? 1 : MAX_ACTIVE)) return false;
    c.slot = list.length; list.push(c);
    return true;
  }
  const canActivate = (list, lowTier) => Array.isArray(list) && list.length < (lowTier ? 1 : MAX_ACTIVE);

  function setMode(c, mode) {
    if (!isObj(c) || MODES.indexOf(mode) < 0) return false;
    c.mode = mode; c.tgt = -1; c.phase = 'out'; c.carry = -1;
    if (mode === 'stay') { c.ax = num(c.x, 0); c.ay = num(c.y, 0); }
    return true;
  }

  // Companion damage per hit: def.companion.dps scaled by bond, capped at 35% of the hero's DPS.
  function damage(def, bond, heroDps) {
    const cp = isObj(def) && isObj(def.companion) ? def.companion : null;
    const dps = cp ? clamp(num(cp.dps, 0), 0, 1e4) : 0;
    const k = 1 + 0.1 * (clamp(Math.floor(num(bond, 1)), 1, 30) - 1);
    return Math.min(dps * k, DPS_CAP * clamp(num(heroDps, 0), 0, 1e6));
  }

  // The companion takes damage; returns true when it just went down.
  function damaged(c, n) {
    if (!isObj(c) || c.down > 0) return false;
    c.hp = Math.max(0, num(c.hp, 0) - clamp(num(n, 0), 0, 1e6));
    if (c.hp <= 0) { c.down = DOWN_SEC; c.tgt = -1; c.carry = -1; return true; }
    return false;
  }

  const alive = (e) => isObj(e) && e.dead !== true && num(e.hp, 1) > 0 && e.awake !== false && e.hostile !== false
    && Number.isFinite(e.x) && Number.isFinite(e.y);
  const d2 = (ax, ay, bx, by) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);

  function nearestEnemy(c, owner, enemies, r) {
    let best = -1, bd = r * r;
    const n = Math.min(enemies.length, MAX_SCAN);
    c.scanned = n;
    for (let i = 0; i < n; i++) {
      const e = enemies[i];
      if (!alive(e)) continue;
      const dd = d2(e.x, e.y, owner.x, owner.y);
      if (dd <= bd) { bd = dd; best = i; }
    }
    return best;
  }
  function nearestPickup(owner, pickups, r) {
    let best = -1, bd = r * r;
    const n = Math.min(pickups.length, MAX_PICK_SCAN);
    for (let i = 0; i < n; i++) {
      const p = pickups[i];
      if (!isObj(p) || p.taken === true || p.dead === true || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      const dd = d2(p.x, p.y, owner.x, owner.y);
      if (dd <= bd) { bd = dd; best = i; }
    }
    return best;
  }

  // Step toward (tx,ty) by up to sp*dt, sliding along walls. Returns the applied {mx,my}.
  function stepTo(c, tx, ty, sp, dt, blocked) {
    const dx = tx - c.x, dy = ty - c.y, d = Math.sqrt(dx * dx + dy * dy);
    if (d < 1e-6) return { mx: 0, my: 0 };
    const k = Math.min(1, (sp * dt) / d);
    let mx = dx * k, my = dy * k;
    const free = (x, y) => { try { return typeof blocked !== 'function' || !blocked(x, y); } catch (e) { return true; } };
    if (!free(c.x + mx, c.y + my)) {
      if (free(c.x + mx, c.y)) my = 0;
      else if (free(c.x, c.y + my)) mx = 0;
      else { mx = 0; my = 0; }
    }
    c.x += mx; c.y += my;
    if (Math.abs(mx) > 1e-6) c.face = mx > 0 ? 1 : -1;
    return { mx: mx, my: my };
  }

  const orbit = (slot) => { const a = (slot ? 0.25 : 1.25) * Math.PI; return { x: Math.cos(a) * ORBIT_R, y: Math.sin(a) * ORBIT_R }; };

  // follow: settle on a per-slot orbit point 48-96 px from the owner; catch up faster when far.
  function followStep(c, owner, speed, dt, blocked) {
    const dd = Math.sqrt(d2(c.x, c.y, owner.x, owner.y));
    if (dd >= ORBIT_MIN && dd <= ORBIT_MAX) return { mx: 0, my: 0 };
    const o = orbit(c.slot);
    return stepTo(c, owner.x + o.x, owner.y + o.y, speed * (dd > 160 ? 1.6 : 1), dt, blocked);
  }

  // update(c, ctx, dt) -> {mx, my, face, hit: enemyIdx|-1, pick: pickupIdx|-1}; moves c itself.
  // ctx = {owner:{x,y}, enemies:[{x,y,hp,awake,hostile}], pickups:[{x,y}], blocked(x,y)->bool, def, speed}
  function update(c, ctx, dt) {
    const out = { mx: 0, my: 0, face: 1, hit: -1, pick: -1 };
    if (!isObj(c)) return out;
    if (!Number.isFinite(c.x)) c.x = 0;
    if (!Number.isFinite(c.y)) c.y = 0;
    if (!Number.isFinite(c.think)) c.think = 0;
    if (!Number.isFinite(c.cd)) c.cd = 0;
    out.face = c.face === -1 ? -1 : 1;
    dt = clamp(num(dt, 0), 0, 0.25);
    const cx = isObj(ctx) ? ctx : {};
    if (c.cd > 0) c.cd = Math.max(0, c.cd - dt);
    if (c.down > 0) {
      c.down = Math.max(0, c.down - dt);
      if (c.down === 0) c.hp = c.maxHp;
      return out;
    }
    if (dt === 0) return out;
    const owner = pos(cx.owner);
    const enemies = Array.isArray(cx.enemies) ? cx.enemies : [];
    const pickups = Array.isArray(cx.pickups) ? cx.pickups : [];
    const def = isObj(cx.def) ? cx.def : {};
    const cp = isObj(def.companion) ? def.companion : {};
    const speed = clamp(num(cx.speed, BASE_SPEED) * clamp(num(def.speed, 1), 0.2, 3), 20, 600);
    const range = clamp(num(cp.range, 40), 8, 300);
    const blocked = cx.blocked;

    if (d2(c.x, c.y, owner.x, owner.y) > TELEPORT_R * TELEPORT_R) {
      const o = orbit(c.slot); c.x = owner.x + o.x; c.y = owner.y + o.y; c.tgt = -1; c.carry = -1; c.phase = 'out';
    }

    // think at 8 Hz (accumulated, so any frame rate gives the same cadence)
    c.think += dt;
    c.scanned = 0;
    if (c.think >= THINK_DT) {
      c.think -= THINK_DT * Math.floor(c.think / THINK_DT);
      if (c.mode === 'attack') c.tgt = nearestEnemy(c, owner, enemies, SEEK_R);
      else if (c.mode === 'fetch' && c.phase === 'out' && c.carry < 0) c.carry = nearestPickup(owner, pickups, FETCH_R);
    }

    let mv;
    if (c.mode === 'stay') {
      mv = { mx: 0, my: 0 };
    } else if (c.mode === 'attack') {
      const e = c.tgt >= 0 ? enemies[c.tgt] : null;
      if (e && alive(e) && d2(e.x, e.y, owner.x, owner.y) <= SEEK_R * SEEK_R) {
        const dd = Math.sqrt(d2(e.x, e.y, c.x, c.y));
        if (dd > range) {
          const k = (dd - range * 0.8) / dd;
          let tx = c.x + (e.x - c.x) * k, ty = c.y + (e.y - c.y) * k;
          const od = Math.sqrt(d2(tx, ty, owner.x, owner.y));
          if (od > LEASH) { tx = owner.x + (tx - owner.x) * (LEASH / od); ty = owner.y + (ty - owner.y) * (LEASH / od); }
          mv = stepTo(c, tx, ty, speed * 1.15, dt, blocked);
        } else {
          mv = { mx: 0, my: 0 };
          if (e.x !== c.x) c.face = e.x > c.x ? 1 : -1;
          if (c.cd <= 0) { out.hit = c.tgt; c.cd = clamp(num(cp.cd, 1), 0.2, 10); }
        }
      } else {
        c.tgt = -1;
        mv = followStep(c, owner, speed, dt, blocked);
      }
    } else if (c.mode === 'fetch') {
      if (c.phase === 'out') {
        const p = c.carry >= 0 ? pickups[c.carry] : null;
        if (isObj(p) && p.taken !== true && Number.isFinite(p.x) && Number.isFinite(p.y)) {
          if (d2(p.x, p.y, c.x, c.y) <= 14 * 14) { out.pick = c.carry; c.phase = 'back'; mv = { mx: 0, my: 0 }; }
          else mv = stepTo(c, p.x, p.y, speed * 1.1, dt, blocked);
        } else { c.carry = -1; mv = followStep(c, owner, speed, dt, blocked); }
      } else if (d2(c.x, c.y, owner.x, owner.y) <= 40 * 40) {
        c.phase = 'out'; c.carry = -1; mv = { mx: 0, my: 0 };
      } else {
        mv = stepTo(c, owner.x, owner.y, speed * 1.1, dt, blocked);
      }
    } else {
      mv = followStep(c, owner, speed, dt, blocked);
    }
    out.mx = mv.mx; out.my = mv.my; out.face = c.face;
    return out;
  }

  // ---- mounts ----
  // mount(def) -> {speed, dash, dashMul, swim, lift} from def.ride, or null for a non-rideable.
  function mount(def) {
    const r = isObj(def) && isObj(def.ride) ? def.ride : null;
    if (!r) return null;
    const dash = typeof r.dash === 'string' && /^[a-z_]{1,16}$/.test(r.dash) ? r.dash : 'dash';
    return {
      speed: clamp(num(r.speed, 1), 0.5, 3), dash: dash, dashMul: has(DASH_MUL, dash) ? DASH_MUL[dash] : 1.3,
      swim: r.swim === true, lift: clamp(num(r.lift, 0), 0, 64)
    };
  }
  // Riding state; null for a non-rideable def. The rider cannot fire for MOUNT_FIRE_LOCK seconds.
  function ride(def, mountId) {
    const m = mount(def);
    if (!m) return null;
    return { id: ident(mountId), m: m, lock: MOUNT_FIRE_LOCK, down: false, iframes: 0, t: 0 };
  }
  function rideStep(ms, dt) {
    if (!isObj(ms)) return ms;
    dt = clamp(num(dt, 0), 0, 0.25);
    ms.lock = Math.max(0, num(ms.lock, 0) - dt);
    ms.iframes = Math.max(0, num(ms.iframes, 0) - dt);
    ms.t = num(ms.t, 0) + dt;
    return ms;
  }
  const riding = (ms) => isObj(ms) && isObj(ms.m) && !ms.down;
  const canFire = (ms) => !riding(ms) || ms.lock <= 0;
  function riderDamage(ms, dmg) {
    dmg = clamp(num(dmg, 0), 0, 1e6);
    if (isObj(ms) && ms.iframes > 0) return 0;
    return riding(ms) ? dmg * RIDER_HURT_K : dmg;
  }
  const moveScale = (ms, terrainK) => clamp(num(terrainK, 1), 0, 10) * (riding(ms) ? ms.m.speed : 1);
  const dashScale = (ms) => (riding(ms) ? ms.m.dashMul : 1);
  const canSwim = (ms) => riding(ms) && ms.m.swim === true;
  // Rider overlay offset relative to the mount's feet: lifted by `lift`, a 1-2 px bob while moving.
  function overlay(ms, moving) {
    if (!riding(ms)) return { dx: 0, dy: 0 };
    return { dx: 0, dy: -ms.m.lift + (moving ? Math.round(Math.sin(num(ms.t, 0) * 12) * 1.5) : 0) };
  }
  // A downed mount throws the rider: 0.5 s of iframes; the mount is not rideable until revive.
  function throwRider(ms) {
    if (!isObj(ms)) return null;
    ms.down = true; ms.iframes = THROW_IFRAMES;
    return { iframes: THROW_IFRAMES };
  }
  function revive(ms) { if (isObj(ms)) { ms.down = false; ms.lock = MOUNT_FIRE_LOCK; } return ms; }
  // The same key dismounts: toggle(null, def) mounts, toggle(ms) dismounts (returns null).
  const toggle = (ms, def, mountId) => (isObj(ms) ? null : ride(def, mountId));

  return {
    MODES: MODES, MAX_ACTIVE: MAX_ACTIVE, THINK_HZ: THINK_HZ, MAX_TAMES: MAX_TAMES, MAX_SCAN: MAX_SCAN, SEEK_R: SEEK_R, LEASH: LEASH,
    FETCH_R: FETCH_R, DOWN_SEC: DOWN_SEC, ORBIT_MIN: ORBIT_MIN, ORBIT_MAX: ORBIT_MAX, DPS_CAP: DPS_CAP,
    MOUNT_FIRE_LOCK: MOUNT_FIRE_LOCK, RIDER_HURT_K: RIDER_HURT_K, THROW_IFRAMES: THROW_IFRAMES,
    create: create, activate: activate, canActivate: canActivate, setMode: setMode, update: update, damage: damage, damaged: damaged,
    mount: mount, ride: ride, rideStep: rideStep, riding: riding, canFire: canFire, riderDamage: riderDamage, moveScale: moveScale,
    dashScale: dashScale, canSwim: canSwim, overlay: overlay, throwRider: throwRider, revive: revive, toggle: toggle
  };
});
