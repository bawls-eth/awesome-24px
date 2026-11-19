// Realm team play (co-op, two players): the host runs the whole arena, the guest sends its position and
// fire/ability input and draws what the host snapshots back.
//
// Wire format (plain JSON through a "link": { send(msg), onMessage = fn, close() }):
//   guest -> host  { k:'in', n, x, y, aim, f, hp, mh, dm, rt, lv, nm, ab:[{q,k}] }   about 15x a second
//   host -> guest  { k:'s', n, t, st, w, b, pl, en, bg, hz, dr, ev }                  about 10x a second
//   either side    { k:'bye' }
// ev is a short sliding window of one-shot events with sequence numbers (guests ignore ones they have seen).
// Everything that comes off the wire is sanitised by the rtClean* helpers before it touches the game.
//
// The same link can be a Firebase link (see Net.realmOpenLink in net.js) or an in-memory pair in tests.

const RT_SNAP_S = 0.1; // host snapshot interval
const RT_INPUT_S = 0.066; // guest input interval
const RT_EVENT_WINDOW = 1.2; // seconds an event stays in the snapshot (so one lost write cannot lose it)
const RT_TIMEOUT_S = 8; // no word from the other side for this long: the run ends
const RT_REVIVE_RANGE = 44;
const RT_REVIVE_TIME = 2;
const RT_HP_SCALE = 1.7; // enemies are tougher with two players
const RT_TYPES = ['spiral', 'aimed', 'ring', 'boss'];
const RT_KINDS = ['wisp', 'cinder', 'puff'];
const RT_HAZ = ['lava', 'ice'];
const RT_STATES = ['idle', 'banner', 'play', 'dead'];

function rtNum(v, min, max, def) {
  v = Number(v);
  if (!Number.isFinite(v)) return def;
  return Math.max(min, Math.min(max, v));
}
function rtText(v, max) { return typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, '').slice(0, max) : ''; }

// Guest -> host input, cleaned.
function rtCleanInput(m, W, H) {
  if (!m || typeof m !== 'object') return null;
  return {
    n: rtNum(m.n, 0, 1e9, 0),
    x: rtNum(m.x, 0, W, W / 2), y: rtNum(m.y, 0, H, H / 2), aim: rtNum(m.aim, -7, 7, 0),
    f: m.f ? 1 : 0, hp: rtNum(m.hp, 0, 9999, 100), mh: rtNum(m.mh, 1, 9999, 100),
    dm: rtNum(m.dm, 0.1, 6, 1), rt: rtNum(m.rt, 1, 14, 7.5), lv: rtNum(m.lv, 1, 20, 1), nm: rtText(m.nm, 16),
    sh: rtNum(m.sh, 0, 3, 0),
    ab: (Array.isArray(m.ab) ? m.ab : []).slice(0, 6).map((a) => ({ q: rtNum(a && a.q, 0, 1e9, 0), k: ['dash', 'nova', 'shield', 'overdrive'].includes(a && a.k) ? a.k : null })).filter((a) => a.k),
  };
}

// Host -> guest snapshot, cleaned (arrays are length-capped, numbers clamped to the arena).
function rtCleanSnap(m, W, H) {
  if (!m || typeof m !== 'object') return null;
  const arr = (a, n) => (Array.isArray(a) ? a.slice(0, n) : []);
  const out = { nm: rtText(m.nm, 16), n: rtNum(m.n, 0, 1e9, 0), t: rtNum(m.t, 0, 1e9, 0), st: RT_STATES.includes(m.st) ? m.st : 'play', w: rtNum(m.w, 0, 9999, 0) | 0, b: rtNum(m.b, 0, 2, 0) | 0 };
  out.pl = arr(m.pl, 2).map((p) => (Array.isArray(p) ? [rtNum(p[0], 0, W, 0), rtNum(p[1], 0, H, 0), rtNum(p[2], 0, 9999, 0), rtNum(p[3], 1, 9999, 100), p[4] ? 1 : 0, rtNum(p[5], -7, 7, 0), rtNum(p[6], 0, 3, 0), rtNum(p[7], 0, 1, 0)] : null));
  out.en = arr(m.en, 24).map((e) => (Array.isArray(e) ? [rtNum(e[0], 0, 23, 0) | 0, RT_TYPES[rtNum(e[1], 0, 3, 0) | 0], rtNum(e[2], -50, W + 50, 0), rtNum(e[3], -50, H + 50, 0), rtNum(e[4], 0, 99999, 0), rtNum(e[5], 1, 99999, 1), rtNum(e[6], 0, 3, 0) | 0, e[7] ? 1 : 0] : null)).filter(Boolean);
  out.bg = arr(m.bg, 14).map((e) => (Array.isArray(e) ? [rtNum(e[0], 0, 13, 0) | 0, rtNum(e[1], 0, W, 0), rtNum(e[2], 0, H, 0), rtNum(e[3], 0, 2, 0) | 0] : null)).filter(Boolean);
  out.hz = arr(m.hz, 5).map((e) => (Array.isArray(e) ? [rtNum(e[0], 0, W, 0), rtNum(e[1], 0, H, 0), RT_HAZ[rtNum(e[2], 0, 1, 0) | 0]] : null)).filter(Boolean);
  out.dr = arr(m.dr, 12).map((e) => (Array.isArray(e) ? [rtNum(e[0], 0, 11, 0) | 0, rtNum(e[1], 0, W, 0), rtNum(e[2], 0, H, 0), RT_KINDS[rtNum(e[3], 0, 2, 0) | 0]] : null)).filter(Boolean);
  out.ev = arr(m.ev, 160).map((e) => {
    if (!e || typeof e !== 'object') return null;
    const q = rtNum(e.q, 0, 1e9, 0); const k = typeof e.k === 'string' ? e.k : ''; const d = Array.isArray(e.d) ? e.d.slice(0, 8) : [];
    return { q, k, d, o: rtNum(e.o, -1, 1, -1) | 0 };
  }).filter((e) => e && ['fe', 'fp', 'clr', 'bn', 'rew', 'loot', 'end', 'fx'].includes(e.k));
  return out;
}

class RealmTeam {
  // role: 'host' | 'guest'. link: { send, onMessage, close }.
  constructor({ arena, role, link, name }) {
    this.arena = arena;
    this.role = role;
    this.link = link;
    this.name = rtText(name, 16) || 'Friend';
    this.partnerName = '';
    this.sendT = 0;
    this.seq = 0;
    this.evSeq = 0;
    this.evq = [];
    this.lastHeard = 0; // arena clock when we last got a message
    this.silent = 0;
    this.closed = false;
    this.lastSeen = 0; // guest: highest event seq applied
    this.lastAb = 0; // host: highest ability seq applied
    this.partner = null; // host: the guest's entity
    this.hostPl = null; // guest: the host's entity (from snapshots)
    this.snaps = 0; this.inputs = 0; this.abSeq = 0; this.abq = [];
    if (role === 'host') this.partner = { x: arena.W / 2 + 60, y: arena.H / 2, hp: 100, maxHp: 100, aim: 0, fire: 0, iframes: 1, down: false, reviveT: 0, fireCd: 0, dmg: 1, rate: 7.5, shield: 0, overdriveT: 0, name: '', lv: 1, ready: false };
    else this.hostPl = { x: arena.W / 2, y: arena.H / 2, hp: 100, maxHp: 100, aim: 0, down: 0, shield: 0 };
    link.onMessage = (m) => this.onMessage(m);
  }

  get active() { return !this.closed; }
  get hasPartner() { return this.role === 'host' && !!this.partner && this.partner.ready; }

  // ---------- host: recording events ----------

  ev(k, d, o) {
    if (this.role !== 'host' || this.closed || !this.partner) return; // nobody to tell
    this.evq.push({ q: ++this.evSeq, k, d, o: o === undefined ? -1 : o, at: this.arena.clock });
  }

  // ---------- both: messages ----------

  onMessage(m) {
    if (this.closed || !m || typeof m !== 'object') return;
    this.silent = 0;
    if (m.k === 'bye') { this.partnerLeft(); return; }
    const a = this.arena;
    if (this.role === 'host' && m.k === 'in') {
      const c = rtCleanInput(m, a.W, a.H);
      if (c) this._applyInput(c);
    } else if (this.role === 'guest' && m.k === 's') {
      const c = rtCleanSnap(m, a.W, a.H);
      if (c) this._applySnap(c);
    }
  }

  partnerLeft() {
    const a = this.arena;
    if (this.role === 'host') {
      this.partner = null;
      a._showBanner('Your partner left the Realm', 2);
      a._syncHud();
    } else {
      this.close(false);
      a._teamEnd('host-left');
    }
  }

  close(notify = true) {
    if (this.closed) return;
    if (notify) { try { this.link.send({ k: 'bye' }); } catch (e) { /* already gone */ } }
    this.closed = true;
    try { this.link.close(); } catch (e) { /* ignore */ }
  }

  // ---------- host ----------

  _applyInput(c) {
    const p = this.partner;
    if (!p) return;
    const first = !p.ready;
    p.ready = true; this.inputs += 1;
    p.x = c.x; p.y = c.y; p.aim = c.aim; p.fire = c.f; p.dmg = c.dm; p.rate = c.rt; p.maxHp = c.mh; p.lv = c.lv; p.name = c.nm || this.partnerName || 'Friend';
    if (first) { p.hp = c.mh; p.iframes = 1.5; this.arena._showBanner(`${p.name} joined the fight!`, 2); this.arena._syncHud(); }
    c.ab.forEach((ab) => {
      if (ab.q <= this.lastAb) return;
      this.lastAb = ab.q;
      if (p.down) return;
      const cd = { dash: 2.4, nova: 6.4, shield: 11, overdrive: 16 }[ab.k]; // the host enforces cooldowns (a hostile guest cannot spam bolts)
      p.abAt = p.abAt || {};
      if (this.arena.clock - (p.abAt[ab.k] === undefined ? -99 : p.abAt[ab.k]) < cd) return;
      p.abAt[ab.k] = this.arena.clock;
      if (ab.k === 'nova') for (let k = 0; k < 16; k++) this.arena.firePlayerBulletFrom(p.x, p.y, (k / 16) * Math.PI * 2, p.dmg, 1);
      else if (ab.k === 'shield') p.shield = 3;
      else if (ab.k === 'overdrive') p.overdriveT = 4;
      else if (ab.k === 'dash') p.iframes = Math.max(p.iframes, 0.4);
    });
  }

  hitPartner(dmg) {
    const p = this.partner; const a = this.arena;
    if (!p || !p.ready || p.down || p.iframes > 0) return false;
    if (p.shield > 0) { p.shield -= 1; p.iframes = 0.25; a._burst(p.x, p.y, '#8fe9ff', 6, 140); return true; }
    p.hp = Math.max(0, p.hp - dmg); p.iframes = 0.5;
    a._burst(p.x, p.y, '#ff6f91', 8, 160); a._floatText(p.x, p.y - 22, `-${dmg}`, '#ff6f91');
    if (p.hp <= 0) { p.down = true; p.reviveT = 0; a._showBanner(`${p.name || 'Your partner'} is down — stand next to them to revive!`, 2); }
    return true;
  }

  // Called by the arena every frame (host).
  hostTick(dt) {
    const a = this.arena; const p = this.partner;
    this.silent += dt;
    if (p && p.ready) {
      p.iframes = Math.max(0, p.iframes - dt);
      p.overdriveT = Math.max(0, p.overdriveT - dt);
      p.fireCd -= dt;
      if (p.fire && !p.down && p.fireCd <= 0 && a.state !== 'dead') { p.fireCd = 1 / (p.rate * (p.overdriveT > 0 ? 2 : 1)); a.firePlayerBulletFrom(p.x, p.y, p.aim, p.dmg, 1); }
      // Reviving: stand beside a downed partner for two seconds (and the other way round).
      const hp = a.player;
      if (p.down && !a.down && Math.hypot(hp.x - p.x, hp.y - p.y) < RT_REVIVE_RANGE) { p.reviveT += dt; if (p.reviveT >= RT_REVIVE_TIME) { p.down = false; p.hp = Math.ceil(p.maxHp * 0.5); p.iframes = 1.5; p.reviveT = 0; a._floatText(p.x, p.y - 28, 'revived!', '#7ee787'); } } else if (p.down) p.reviveT = Math.max(0, p.reviveT - dt);
      if (a.down && !p.down && Math.hypot(hp.x - p.x, hp.y - p.y) < RT_REVIVE_RANGE) { a.reviveT += dt; if (a.reviveT >= RT_REVIVE_TIME) a._revive(0.5); } else if (a.down) a.reviveT = Math.max(0, a.reviveT - dt);
      if (a.down && p.down) a._teamWipe();
    }
    this.sendT -= dt;
    if (this.sendT <= 0 && this.partner) { this.sendT = RT_SNAP_S; this._sendSnap(); }
    if (this.silent > RT_TIMEOUT_S && this.partner) { this.partnerLeft(); } // the guest stopped answering
  }

  _sendSnap() {
    const a = this.arena; const p = this.partner; const h = a.player;
    while (this.evq.length && a.clock - this.evq[0].at > RT_EVENT_WINDOW) this.evq.shift();
    const r1 = (v) => Math.round(v * 10) / 10;
    const snap = {
      k: 's', n: ++this.seq, nm: this.name, t: r1(a.clock), st: a.state, w: a.run.wave, b: a.biome,
      pl: [
        [r1(h.x), r1(h.y), Math.ceil(h.hp), a.stats.maxHp, a.down ? 1 : 0, r1(h.aim), a.shield.hits, a.down ? Math.min(1, a.reviveT / RT_REVIVE_TIME) : 0],
        p && p.ready ? [r1(p.x), r1(p.y), Math.ceil(p.hp), p.maxHp, p.down ? 1 : 0, r1(p.aim), p.shield, p.down ? Math.min(1, p.reviveT / RT_REVIVE_TIME) : 0] : null,
      ],
      en: [], bg: [], hz: [], dr: [],
      ev: this.evq.map((e) => ({ q: e.q, k: e.k, d: e.d, o: e.o })),
    };
    a.enemies.forEach((e, i) => { if (e.active) snap.en.push([i, RT_TYPES.indexOf(e.type), Math.round(e.x), Math.round(e.y), r1(e.hp), Math.ceil(e.maxHp), e.phase || 0, e.invuln > 0 ? 1 : 0]); });
    a.bags.forEach((b, i) => { if (b.active) snap.bg.push([i, Math.round(b.x), Math.round(b.y), b.r]); });
    a.hazards.forEach((z) => { if (z.active) snap.hz.push([Math.round(z.x), Math.round(z.y), RT_HAZ.indexOf(z.kind)]); });
    a.drifters.forEach((d, i) => { if (d.active) snap.dr.push([i, Math.round(d.x), Math.round(d.y), RT_KINDS.indexOf(d.kind)]); });
    try { this.link.send(snap); } catch (e) { /* link down: the timeout ends the run */ }
  }

  // ---------- guest ----------

  _applySnap(s) {
    const a = this.arena; const me = a.player;
    if (s.n <= (this._lastN || 0) - 5 && s.n > 0) { /* stale / reordered: ignore very old */ }
    this._lastN = Math.max(this._lastN || 0, s.n); this.snaps += 1;
    a.state = s.st; a.run.wave = s.w; a.biome = s.b; a.clock = s.t;
    const hpl = s.pl[0]; const gpl = s.pl[1];
    if (hpl) { Object.assign(this.hostPl, { x: hpl[0], y: hpl[1], hp: hpl[2], maxHp: hpl[3], down: hpl[4], aim: hpl[5], shield: hpl[6], revive: hpl[7] }); { const pn = s.nm || this.partnerName || 'Host'; if (pn !== this.partnerName) { this.partnerName = pn; a._syncHud(); } } }
    if (gpl) {
      if (gpl[2] < me.hp - 0.5) { a.flash = 1; a.shake = Math.max(a.shake, 8); a._floatText(me.x, me.y - 22, `-${Math.round(me.hp - gpl[2])}`, '#ff6f91'); a._burst(me.x, me.y, '#ff6f91', 8, 160); }
      me.hp = gpl[2]; this.myMax = gpl[3]; a.down = !!gpl[4]; a.reviveT = (gpl[7] || 0) * RT_REVIVE_TIME; a.shield.hits = gpl[6];
    }
    // Enemies: slot index = pool index on the host, positions are eased toward the snapshot every frame.
    const seen = new Set();
    s.en.forEach(([id, type, x, y, hp, maxHp, phase, inv]) => {
      const e = a.enemies[id]; seen.add(id);
      if (!e.active) { e.active = true; e.x = x; e.y = y; e.t = 0; e.flash = 0; }
      e.type = type; e.tx = x; e.ty = y; e.maxHp = maxHp; if (hp < e.hp - 0.01) e.flash = 1; e.hp = hp; e.phase = phase; e.invuln = inv ? 1 : 0;
    });
    a.enemies.forEach((e, i) => { if (e.active && !seen.has(i)) { e.active = false; a._burst(e.x, e.y, RM_ENEMIES[e.type] ? RM_ENEMIES[e.type].color : '#fff', 12, 220); } });
    const seenB = new Set();
    s.bg.forEach(([id, x, y, r]) => { const b = a.bags[id]; seenB.add(id); if (!b.active) { b.active = true; b.t = 0; } b.x = x; b.y = y; b.r = r; });
    a.bags.forEach((b, i) => { if (b.active && !seenB.has(i)) b.active = false; });
    a.hazards.forEach((z) => { z.active = false; });
    s.hz.forEach(([x, y, kind], i) => { const z = a.hazards[i]; if (z) { z.active = true; z.x = x; z.y = y; z.kind = kind; } });
    const seenD = new Set();
    s.dr.forEach(([id, x, y, kind]) => { const d = a.drifters[id]; seenD.add(id); if (!d.active) { d.active = true; d.t = 0; d.x = x; d.y = y; } d.tx = x; d.ty = y; d.kind = kind; });
    a.drifters.forEach((d, i) => { if (d.active && !seenD.has(i)) d.active = false; });
    // One-shot events.
    s.ev.forEach((e) => {
      if (e.q <= this.lastSeen) return;
      this.lastSeen = e.q;
      const d = e.d;
      if (e.k === 'fe') a.fireEnemyBullet(rtNum(d[0], 0, a.W, 0), rtNum(d[1], 0, a.H, 0), rtNum(d[2], -7, 7, 0), rtNum(d[3], 0, 400, 150), rtNum(d[4], 0, 2, 0) | 0);
      else if (e.k === 'fp') { if (e.o !== 1) a.firePlayerBulletFrom(rtNum(d[0], 0, a.W, 0), rtNum(d[1], 0, a.H, 0), rtNum(d[2], -7, 7, 0), rtNum(d[3], 0, 6, 1), e.o); } // our own bolts are drawn instantly from our input
      else if (e.k === 'clr') a.eBullets.forEach((b) => { if (b.active) { b.active = false; a._burst(b.x, b.y, '#8fe9ff', 1, 40); } });
      else if (e.k === 'bn') a._showBanner(rtText(String(d[0] || ''), 80), rtNum(d[1], 0, 6, 1.5));
      else if (e.k === 'rew') a._teamReward({ sh: rtNum(d[0], 0, 999, 0), xp: rtNum(d[1], 0, 9999, 0), t: rtText(String(d[2] || ''), 8), boss: d[3] ? 1 : 0, tenths: rtNum(d[4], 0, 999999, 0) });
      else if (e.k === 'loot') { if (e.o === 1) { const id = rtText(String(d[0] || ''), 20); if (RM_ITEM_BY_ID[id]) a.collectItem(id, rtNum(d[1], 0, 2, 0) | 0); } }
      else if (e.k === 'end') a._teamEnd(rtText(String(d[0] || 'end'), 12));
      else if (e.k === 'fx') a.shake = Math.max(a.shake, rtNum(d[0], 0, 16, 4));
    });
  }

  // Called by the arena every frame (guest) after the local player update.
  guestTick(dt) {
    const a = this.arena; const me = a.player;
    this.silent += dt;
    // Ease the host's entities toward the latest snapshot and fly the bolts we were told about.
    const k = Math.min(1, dt * 14);
    a.enemies.forEach((e) => { if (e.active && e.tx !== undefined) { e.x += (e.tx - e.x) * k; e.y += (e.ty - e.y) * k; e.t += dt; e.flash = Math.max(0, e.flash - dt * 6); } });
    a.drifters.forEach((d) => { if (d.active && d.tx !== undefined) { d.x += (d.tx - d.x) * k; d.y += (d.ty - d.y) * k; d.t += dt; } });
    a.bags.forEach((b) => { if (b.active) b.t += dt; });
    for (let i = 0; i < a.pBullets.length; i++) { const b = a.pBullets[i]; if (!b.active) continue; b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; if (b.life <= 0 || b.x < -10 || b.y < -10 || b.x > a.W + 10 || b.y > a.H + 10) b.active = false; }
    for (let i = 0; i < a.eBullets.length; i++) { const b = a.eBullets[i]; if (!b.active) continue; b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; if (b.life <= 0 || b.x < -20 || b.y < -20 || b.x > a.W + 20 || b.y > a.H + 20) b.active = false; }
    this.sendT -= dt;
    if (this.sendT <= 0) {
      this.sendT = RT_INPUT_S;
      const ab = this.abq || []; this.abq = [];
      const msg = { k: 'in', n: ++this.seq, x: Math.round(me.x), y: Math.round(me.y), aim: Math.round(me.aim * 100) / 100, f: a._firing ? 1 : 0, hp: me.hp, mh: a.stats.maxHp, dm: a.stats.dmg, rt: a.stats.rate, lv: a.save.level, nm: this.name, sh: a.shield.hits, ab };
      try { this.link.send(msg); } catch (e) { /* ignore */ }
    }
    if (this.silent > RT_TIMEOUT_S) { this.close(false); a._teamEnd('lost'); }
  }

  // Guest: an ability was cast locally; tell the host (the effect is drawn locally right away).
  sendAbility(kind) {
    if (this.role !== 'guest') return;
    this.abq = this.abq.concat([{ q: ++this.abSeq, k: kind }]).slice(-6);
    this.sendT = 0; // flush on the next tick
  }
}
