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
const RT_DUEL_HP = 100;
const RT_DUEL_RATE = 6;
const RT_DUEL_HIT = 8; // damage per bolt in a duel
const RT_DUEL_WIN = 2; // rounds to win
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
  const out = { du: Array.isArray(m.du) ? m.du.slice(0, 4).map((v) => rtNum(v, 0, 99, 0) | 0) : null, nm: rtText(m.nm, 16), n: rtNum(m.n, 0, 1e9, 0), t: rtNum(m.t, 0, 1e9, 0), st: RT_STATES.includes(m.st) ? m.st : 'play', w: rtNum(m.w, 0, 9999, 0) | 0, b: rtNum(m.b, 0, 2, 0) | 0 };
  out.ns = arr(m.ns, 4).map((v) => rtText(v, 16));
  out.pl = arr(m.pl, 4).map((p) => (Array.isArray(p) ? [rtNum(p[0], 0, W, 0), rtNum(p[1], 0, H, 0), rtNum(p[2], 0, 9999, 0), rtNum(p[3], 1, 9999, 100), p[4] ? 1 : 0, rtNum(p[5], -7, 7, 0), rtNum(p[6], 0, 3, 0), rtNum(p[7], 0, 1, 0)] : null));
  out.en = arr(m.en, 24).map((e) => (Array.isArray(e) ? [rtNum(e[0], 0, 23, 0) | 0, RT_TYPES[rtNum(e[1], 0, 3, 0) | 0], rtNum(e[2], -50, W + 50, 0), rtNum(e[3], -50, H + 50, 0), rtNum(e[4], 0, 99999, 0), rtNum(e[5], 1, 99999, 1), rtNum(e[6], 0, 3, 0) | 0, e[7] ? 1 : 0] : null)).filter(Boolean);
  out.bg = arr(m.bg, 14).map((e) => (Array.isArray(e) ? [rtNum(e[0], 0, 13, 0) | 0, rtNum(e[1], 0, W, 0), rtNum(e[2], 0, H, 0), rtNum(e[3], 0, 2, 0) | 0] : null)).filter(Boolean);
  out.hz = arr(m.hz, 5).map((e) => (Array.isArray(e) ? [rtNum(e[0], 0, W, 0), rtNum(e[1], 0, H, 0), RT_HAZ[rtNum(e[2], 0, 1, 0) | 0]] : null)).filter(Boolean);
  out.dr = arr(m.dr, 12).map((e) => (Array.isArray(e) ? [rtNum(e[0], 0, 11, 0) | 0, rtNum(e[1], 0, W, 0), rtNum(e[2], 0, H, 0), RT_KINDS[rtNum(e[3], 0, 2, 0) | 0]] : null)).filter(Boolean);
  out.ev = arr(m.ev, 160).map((e) => {
    if (!e || typeof e !== 'object') return null;
    const q = rtNum(e.q, 0, 1e9, 0); const k = typeof e.k === 'string' ? e.k : ''; const d = Array.isArray(e.d) ? e.d.slice(0, 8) : [];
    return { q, k, d, o: rtNum(e.o, -1, 1, -1) | 0 };
  }).filter((e) => e && ['fe', 'fp', 'clr', 'bn', 'rew', 'loot', 'end', 'fx', 'dpos'].includes(e.k));
  return out;
}

class RealmTeam {
  // role: 'host' | 'guest'. link: { send, onMessage, close }.
  constructor({ arena, role, link, name, mode, slot }) {
    this.arena = arena;
    this.mode = mode === 'duel' ? 'duel' : mode === '2v2' ? '2v2' : 'coop';
    this.isPvp = this.mode !== 'coop';
    this.slot = slot === 2 || slot === 3 ? slot : 1; // a guest's seat: 1..3 (2v2 teams: host+1 against 2+3)
    this.others = []; // guest: everybody else in the arena, from snapshots
    this.duel = { s: [0, 0], ph: 0, rd: 1, t: 0 }; // duel: scores, phase (0 ready, 1 fight, 2 between rounds, 3 over), round, phase timer
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
    this.partner = null; // host: the first guest's entity (the only one outside 2v2)
    this.guests = [null]; // host: guest entities by seat (index 0 is the host itself)
    this.hostPl = null; // guest: the host's entity (from snapshots)
    this.snaps = 0; this.inputs = 0; this.abSeq = 0; this.abq = [];
    if (role === 'host') {
      const seats = this.mode === '2v2' ? 3 : 1;
      for (let i = 1; i <= seats; i++) this.guests.push({ idx: i, x: arena.W / 2 + 60, y: arena.H / 2, hp: 100, maxHp: 100, aim: 0, fire: 0, iframes: 1, down: false, reviveT: 0, fireCd: 0, dmg: 1, rate: 7.5, shield: 0, overdriveT: 0, name: '', lv: 1, ready: false, silent: 0, lastAb: 0, gone: false });
      this.partner = this.guests[1];
    } else this.hostPl = { x: arena.W / 2, y: arena.H / 2, hp: 100, maxHp: 100, aim: 0, down: 0, shield: 0 };
    link.onMessage = (m, seat) => this.onMessage(m, seat);
  }

  get active() { return !this.closed; }
  teamOf(i) { return this.mode === '2v2' ? i >> 1 : i; } // which side a seat fights on
  hasGuests() { return this.guests.some(Boolean); }
  get hasPartner() { return this.role === 'host' && !!this.partner && this.partner.ready; }

  // ---------- host: recording events ----------

  ev(k, d, o) {
    if (this.role !== 'host' || this.closed || !this.hasGuests()) return; // nobody to tell
    this.evq.push({ q: ++this.evSeq, k, d, o: o === undefined ? -1 : o, at: this.arena.clock });
  }

  // ---------- both: messages ----------

  onMessage(m, seat = 1) {
    if (this.closed || !m || typeof m !== 'object') return;
    const a = this.arena;
    if (this.role === 'host') {
      const ent = this.guests[seat];
      if (!ent) return;
      ent.silent = 0;
      if (m.k === 'bye') { this.partnerLeft(seat); return; }
      if (m.k === 'in') { const c = rtCleanInput(m, a.W, a.H); if (c) this._applyInput(c, ent); }
      return;
    }
    this.silent = 0;
    if (m.k === 'bye') { this.partnerLeft(); return; }
    if (m.k === 's') { const c = rtCleanSnap(m, a.W, a.H); if (c) this._applySnap(c); }
  }

  partnerLeft(seat = 1) {
    const a = this.arena;
    if (this.role === 'host') {
      const ent = this.guests[seat];
      if (!ent) return;
      if (this.mode === '2v2') { // the seat is forfeited: that fighter is out; if everybody left the host wins
        ent.ready = false; ent.down = true; ent.gone = true;
        a._showBanner(`${ent.name || 'A player'} left the Realm`, 2);
        const sideGone = !this.guests.some((e) => e && !e.gone) || (this.guests[2] && this.guests[3] && this.guests[2].gone && this.guests[3].gone); // everybody, or the whole opposing side, left
        if (sideGone) { if (this.duel.ph < 3) { this.duel.s = [RT_DUEL_WIN, 0]; this.duel.ph = 3; this.duel.t = 2.5; } } else this.duelCheck();
        a._syncHud();
        return;
      }
      if (this.mode === 'duel' && this.duel.ph < 3) { this.duel.s = [RT_DUEL_WIN, this.duel.s[1]]; this.duel.ph = 3; this.duel.t = 2.5; } // leaving a duel forfeits it
      this.guests[seat] = null; if (seat === 1) this.partner = null;
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

  _applyInput(c, p) {
    if (!p || p.gone) return;
    const first = !p.ready;
    p.ready = true; this.inputs += 1;
    let nx = c.x; let ny = c.y;
    if (this.isPvp && !first) { // PvP: in every phase the guest cannot teleport or outrun the speed limit (plus one Dash when it is ready)
      const dtIn = Math.max(0, Math.min(0.5, this.arena.clock - (p.lastIn === undefined ? this.arena.clock : p.lastIn)));
      p.budget = Math.min(40, (p.budget === undefined ? 10 : p.budget) + RM_PLAYER.speed * 1.3 * dtIn); // a movement budget that refills with arena time, so many messages in one frame cannot outrun it
      let reach = p.budget;
      if (c.ab.some((x) => x.k === 'dash') && this.arena.clock - (p.dashAt === undefined ? -99 : p.dashAt) >= 2.4) { reach += 160; p.dashAt = this.arena.clock; }
      const dx = nx - p.x; const dy = ny - p.y; const d = Math.hypot(dx, dy);
      if (d > reach) { nx = p.x + dx / d * reach; ny = p.y + dy / d * reach; p.budget = 0; } else p.budget = Math.max(0, reach - d - (reach > p.budget ? 160 : 0));
    }
    p.lastIn = this.arena.clock;
    p.x = nx; p.y = ny; p.aim = c.aim; p.fire = c.f; p.dmg = c.dm; p.rate = c.rt; p.maxHp = c.mh; p.lv = c.lv;
    if (this.isPvp) { p.dmg = 1; p.rate = RT_DUEL_RATE; p.maxHp = RT_DUEL_HP; p.fire = this.duel.ph === 1 ? c.f : 0; c.ab = c.ab.filter((x) => x.k === 'dash'); }
    p.name = c.nm || 'Friend';
    if (first && this.isPvp && p.cx !== undefined) { p.x = p.cx; p.y = p.cy; this.ev('dpos', [Math.round(p.cx), Math.round(p.cy), p.idx]); } // a late joiner missed the round-start event: send it again
    if (first) { p.hp = this.isPvp ? RT_DUEL_HP : c.mh; p.iframes = 1.5; this.arena._showBanner(`${p.name} joined the fight!`, 2); this.arena._syncHud(); }
    c.ab.forEach((ab) => {
      if (ab.q <= p.lastAb) return;
      p.lastAb = ab.q;
      if (p.down) return;
      const cd = { dash: 2.4, nova: 6.4, shield: 11, overdrive: 16 }[ab.k]; // the host enforces cooldowns (a hostile guest cannot spam bolts)
      p.abAt = p.abAt || {};
      if (this.arena.clock - (p.abAt[ab.k] === undefined ? -99 : p.abAt[ab.k]) < cd) return;
      p.abAt[ab.k] = this.arena.clock;
      if (ab.k === 'nova') for (let k = 0; k < 16; k++) this.arena.firePlayerBulletFrom(p.x, p.y, (k / 16) * Math.PI * 2, p.dmg, p.idx);
      else if (ab.k === 'shield') p.shield = 3;
      else if (ab.k === 'overdrive') p.overdriveT = 4;
      else if (ab.k === 'dash') p.iframes = Math.max(p.iframes, 0.4);
    });
  }

  hitPartner(dmg) { return this.hitEnt(this.partner, dmg); }

  hitEnt(p, dmg) {
    const a = this.arena;
    if (!p || !p.ready || p.down || p.iframes > 0) return false;
    if (p.shield > 0) { p.shield -= 1; p.iframes = 0.25; a._burst(p.x, p.y, '#8fe9ff', 6, 140); return true; }
    p.hp = Math.max(0, p.hp - dmg); p.iframes = this.isPvp ? 0.12 : 0.5;
    a._burst(p.x, p.y, '#ff6f91', 8, 160); a._floatText(p.x, p.y - 22, `-${dmg}`, '#ff6f91');
    if (this.isPvp) { if (p.hp <= 0) { p.down = true; this.duelCheck(); } return true; }
    if (p.hp <= 0) { p.down = true; p.reviveT = 0; a._showBanner(`${p.name || 'Your partner'} is down — stand next to them to revive!`, 2); }
    return true;
  }

  // Called by the arena every frame (host).
  hostTick(dt) {
    const a = this.arena;
    for (let i = 1; i < this.guests.length; i++) {
      const p = this.guests[i];
      if (!p || p.gone) continue;
      p.silent += dt;
      if (p.silent > RT_TIMEOUT_S) { this.partnerLeft(i); continue; } // this guest stopped answering
      if (!p.ready) continue;
      p.iframes = Math.max(0, p.iframes - dt);
      p.overdriveT = Math.max(0, p.overdriveT - dt);
      p.fireCd -= dt;
      if (p.fire && !p.down && p.fireCd <= 0 && a.state !== 'dead') { p.fireCd = 1 / (p.rate * (p.overdriveT > 0 ? 2 : 1)); a.firePlayerBulletFrom(p.x, p.y, p.aim, p.dmg, p.idx); }
      if (this.isPvp) continue;
      // Reviving: stand beside a downed partner for two seconds (and the other way round).
      const hp = a.player;
      if (p.down && !a.down && Math.hypot(hp.x - p.x, hp.y - p.y) < RT_REVIVE_RANGE) { p.reviveT += dt; if (p.reviveT >= RT_REVIVE_TIME) { p.down = false; p.hp = Math.ceil(p.maxHp * 0.5); p.iframes = 1.5; p.reviveT = 0; a._floatText(p.x, p.y - 28, 'revived!', '#7ee787'); } } else if (p.down) p.reviveT = Math.max(0, p.reviveT - dt);
      if (a.down && !p.down && Math.hypot(hp.x - p.x, hp.y - p.y) < RT_REVIVE_RANGE) { a.reviveT += dt; if (a.reviveT >= RT_REVIVE_TIME) a._revive(0.5); } else if (a.down) a.reviveT = Math.max(0, a.reviveT - dt);
      if (a.down && p.down) a._teamWipe();
    }
    this.sendT -= dt;
    if (this.sendT <= 0 && this.hasGuests()) { this.sendT = RT_SNAP_S; this._sendSnap(); }
  }

  _sendSnap() {
    const a = this.arena; const h = a.player;
    while (this.evq.length && a.clock - this.evq[0].at > RT_EVENT_WINDOW) this.evq.shift();
    const r1 = (v) => Math.round(v * 10) / 10;
    const snap = {
      k: 's', n: ++this.seq, nm: this.name, t: r1(a.clock), st: a.state, w: a.run.wave, b: a.biome,
      pl: [[r1(h.x), r1(h.y), Math.ceil(h.hp), a.stats.maxHp, a.down ? 1 : 0, r1(h.aim), a.shield.hits, a.down ? Math.min(1, a.reviveT / RT_REVIVE_TIME) : 0]].concat(this.guests.slice(1).map((p) => (p && p.ready ? [r1(p.x), r1(p.y), Math.ceil(p.hp), p.maxHp, p.down ? 1 : 0, r1(p.aim), p.shield, p.down ? Math.min(1, p.reviveT / RT_REVIVE_TIME) : 0] : null))),
      en: [], bg: [], hz: [], dr: [],
      ev: this.evq.map((e) => ({ q: e.q, k: e.k, d: e.d, o: e.o })),
    };
    if (this.mode === '2v2') snap.ns = [this.name].concat(this.guests.slice(1).map((p) => (p && p.ready ? p.name : ''))); // names of all four fighters
    if (this.isPvp) snap.du = [this.duel.s[0], this.duel.s[1], this.duel.ph, this.duel.rd]; // never an undefined key: Firebase rejects the whole write
    a.enemies.forEach((e, i) => { if (e.active) snap.en.push([i, RT_TYPES.indexOf(e.type), Math.round(e.x), Math.round(e.y), r1(e.hp), Math.ceil(e.maxHp), e.phase || 0, e.invuln > 0 ? 1 : 0]); });
    a.bags.forEach((b, i) => { if (b.active) snap.bg.push([i, Math.round(b.x), Math.round(b.y), b.r]); });
    a.hazards.forEach((z) => { if (z.active) snap.hz.push([Math.round(z.x), Math.round(z.y), RT_HAZ.indexOf(z.kind)]); });
    a.drifters.forEach((d, i) => { if (d.active) snap.dr.push([i, Math.round(d.x), Math.round(d.y), RT_KINDS.indexOf(d.kind)]); });
    try { this.link.send(snap); } catch (e) { /* link down: the timeout ends the run */ }
  }

  // ---------- duel and 2v2 (host decides everything) ----------

  duelLabel() {
    const mt = this.teamOf(this.role === 'host' ? 0 : this.slot); const d = this.duel;
    return `⚔️ ${d.s[mt]}–${d.s[1 - mt]} · R${d.rd}`;
  }

  _alive(i) {
    if (i === 0) return !this.arena.down;
    const e = this.guests[i];
    return !!(e && e.ready && !e.down);
  }

  // Round start: everyone to their corner at full HP with a short protected countdown.
  duelReset() {
    if (this.role !== 'host') return;
    const a = this.arena; const d = this.duel;
    d.ph = 0; d.t = 2.4;
    a.pBullets.forEach((b) => { b.active = false; }); a.eBullets.forEach((b) => { b.active = false; });
    const pos = this.mode === '2v2' ? [[0.2, 0.35], [0.2, 0.65], [0.8, 0.35], [0.8, 0.65]] : [[0.2, 0.5], [0.8, 0.5]];
    a.player.x = a.W * pos[0][0]; a.player.y = a.H * pos[0][1]; a.player.hp = RT_DUEL_HP; a.player.iframes = 2.4; a.down = false;
    for (let i = 1; i < this.guests.length; i++) {
      const p = this.guests[i]; if (!p) continue;
      p.cx = a.W * pos[i][0]; p.cy = a.H * pos[i][1];
      if (p.gone) continue;
      p.x = p.cx; p.y = p.cy; p.hp = RT_DUEL_HP; p.maxHp = RT_DUEL_HP; p.down = false; p.iframes = 2.4;
      this.ev('dpos', [Math.round(p.x), Math.round(p.y), i]);
    }
    a._showBanner(`Round ${d.rd} — get ready!`, 2.2, true);
    a._syncHud();
  }

  duelTick(dt) {
    const a = this.arena; const d = this.duel;
    if (d.ph === 3) { d.t -= dt; if (d.t <= 0) a._teamEnd('duel'); return; }
    const seats = this.guests.slice(1);
    if (!seats.length || !seats.every((e) => e && (e.ready || e.gone)) || !seats.some((e) => e && e.ready)) { if (d.ph !== 0) d.ph = 0; return; } // wait for everybody to arrive
    if (this.mode === '2v2' && !this._intro) { this._intro = true; a._showBanner(`Team A: ${this.name} + ${seats[0].name}   vs   Team B: ${seats[1].name} + ${seats[2].name}`, 3.2, true); }
    d.t -= dt;
    if (d.ph === 0) {
      a.player.iframes = Math.max(a.player.iframes, 0.3); seats.forEach((p) => { if (p && p.ready) p.iframes = Math.max(p.iframes, 0.3); });
      if (d.t <= 0) { d.ph = 1; a.pBullets.forEach((b) => { b.active = false; }); a.player.iframes = 0; seats.forEach((p) => { if (p) p.iframes = 0; }); a._showBanner('FIGHT!', 1, true); }
    } else if (d.ph === 2 && d.t <= 0) { d.rd += 1; this.duelReset(); }
  }

  // A bolt in flight during a fight: true when it hit somebody on the other side (host side).
  duelBoltHit(b) {
    const a = this.arena; const d = this.duel; const r = 18;
    if (d.ph !== 1) return false;
    const ot = this.teamOf(b.own | 0);
    if (this.teamOf(0) !== ot && this._alive(0) && (b.x - a.player.x) ** 2 + (b.y - a.player.y) ** 2 < r * r) { if (a.player.iframes > 0) return false; a._hitPlayer(RT_DUEL_HIT); return true; }
    for (let i = 1; i < this.guests.length; i++) {
      const p = this.guests[i];
      if (!p || !p.ready || p.down || this.teamOf(i) === ot) continue;
      if ((b.x - p.x) ** 2 + (b.y - p.y) ** 2 < r * r) return this.hitEnt(p, RT_DUEL_HIT) || true;
    }
    return false;
  }

  // Somebody fell: when a whole side is down the other side takes the round.
  duelCheck() {
    const d = this.duel;
    if (d.ph !== 1) return;
    const alive = [0, 0];
    for (let i = 0; i < this.guests.length; i++) if (this._alive(i)) alive[this.teamOf(i)] += 1;
    if (alive[0] && alive[1]) return;
    this.duelKO(!alive[0] && !alive[1] ? -1 : alive[0] ? 0 : 1);
  }

  // duelKO(winner): 0 = the host's side won the round, 1 = the other side; -1 = nobody (a double KO replays the round)
  duelKO(winner) {
    const a = this.arena; const d = this.duel;
    if (d.ph !== 1) return;
    a.pBullets.forEach((b) => { b.active = false; });
    a.player.iframes = 5; this.guests.forEach((e) => { if (e) e.iframes = 5; });
    if (winner < 0) { d.ph = 2; d.t = 2.6; a._showBanner('Double KO — the round is replayed', 2.4, true); a._syncHud(); return; }
    d.s[winner] += 1;
    const wname = this.mode === '2v2' ? `Team ${winner ? 'B' : 'A'}` : winner === 0 ? (this.name || 'Host') : ((this.partner && this.partner.name) || 'Guest');
    if (d.s[winner] >= RT_DUEL_WIN) { d.ph = 3; d.t = 3.5; a._showBanner(`${wname} wins the ${this.mode === '2v2' ? '2v2' : 'duel'}! ${d.s[0]}–${d.s[1]}`, 3.2, true); this.ev('fx', [10]); }
    else { d.ph = 2; d.t = 2.6; a._showBanner(`${wname} takes round ${d.rd}  (${d.s[0]}–${d.s[1]})`, 2.4, true); }
    a._syncHud();
  }

  // Everybody else in the arena as drawable records (x, y, down, name, idx, foe).
  drawList() {
    const out = [];
    const mine = this.role === 'host' ? 0 : this.slot; const mt = this.teamOf(mine);
    if (this.role === 'host') this.guests.forEach((p, i) => { if (p && p.ready) out.push({ x: p.x, y: p.y, down: p.down, name: p.name || 'Friend', idx: i, foe: this.isPvp && this.teamOf(i) !== mt, revive: p.down ? Math.min(1, p.reviveT / RT_REVIVE_TIME) : 0 }); });
    else this.others.forEach((p) => { out.push({ x: p.x, y: p.y, down: !!p.down, name: p.name, idx: p.idx, foe: this.isPvp && this.teamOf(p.idx) !== mt, revive: p.revive || 0 }); });
    return out;
  }

  // The one fighter the corner badge follows: the partner (co-op), the opponent (duel) or your teammate (2v2).
  badge() {
    const l = this.drawList();
    if (this.mode === '2v2') { const mine = this.role === 'host' ? 0 : this.slot; return l.find((x) => !x.foe && x.idx !== mine) || null; }
    return l[0] || null;
  }

  // ---------- guest ----------

  _applySnap(s) {
    const a = this.arena; const me = a.player;
    if (s.n <= (this._lastN || 0) - 5 && s.n > 0) { /* stale / reordered: ignore very old */ }
    this._lastN = Math.max(this._lastN || 0, s.n); this.snaps += 1;
    a.state = s.st; a.run.wave = s.w; a.biome = s.b; a.clock = s.t;
    if (s.du && s.du.length === 4) { this.duel.s = [s.du[0], s.du[1]]; this.duel.ph = s.du[2]; this.duel.rd = s.du[3]; a._syncHud(); }
    const hpl = s.pl[0]; const gpl = s.pl[this.slot];
    this.others = [];
    s.pl.forEach((q, i) => { if (q && i !== this.slot) this.others.push({ idx: i, x: q[0], y: q[1], hp: q[2], maxHp: q[3], down: q[4], revive: q[7], name: i === 0 ? (s.nm || this.partnerName || 'Host') : ((s.ns && s.ns[i]) || 'Player') }); });
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
      else if (e.k === 'fp') { if (e.o !== this.slot) { const b = a.firePlayerBulletFrom(rtNum(d[0], 0, a.W, 0), rtNum(d[1], 0, a.H, 0), rtNum(d[2], -7, 7, 0), rtNum(d[3], 0, 6, 1), e.o); if (b && d.length > 4 && a._wpnRemote) a._wpnRemote(b, d[4], rtNum(d[2], -7, 7, 0)); } } // our own bolts are drawn instantly from our input; d[4] (optional) = weapon-style wire code
      else if (e.k === 'clr') a.eBullets.forEach((b) => { if (b.active) { b.active = false; a._burst(b.x, b.y, '#8fe9ff', 1, 40); } });
      else if (e.k === 'bn') a._showBanner(rtText(String(d[0] || ''), 80), rtNum(d[1], 0, 6, 1.5));
      else if (e.k === 'rew') a._teamReward({ sh: rtNum(d[0], 0, 999, 0), xp: rtNum(d[1], 0, 9999, 0), t: rtText(String(d[2] || ''), 8), boss: d[3] ? 1 : 0, tenths: rtNum(d[4], 0, 999999, 0) });
      else if (e.k === 'loot') { if (e.o === this.slot) { const id = rtText(String(d[0] || ''), 20); if (RM_ITEM_BY_ID[id]) a.collectItem(id, rtNum(d[1], 0, 2, 0) | 0); } }
      else if (e.k === 'end') a._teamEnd(rtText(String(d[0] || 'end'), 12));
      else if (e.k === 'dpos') { if (rtNum(d[2], 0, 3, 1) === this.slot) { me.x = rtNum(d[0], 0, a.W, me.x); me.y = rtNum(d[1], 0, a.H, me.y); } }
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
    for (let i = 0; i < a.pBullets.length; i++) { const b = a.pBullets[i]; if (!b.active) continue; if (b.ws && a._stepWpn) { a._stepWpn(b, dt, a.W, a.H); continue; } b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; if (b.life <= 0 || b.x < -10 || b.y < -10 || b.x > a.W + 10 || b.y > a.H + 10) b.active = false; }
    for (let i = 0; i < a.eBullets.length; i++) { const b = a.eBullets[i]; if (!b.active) continue; b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; if (b.life <= 0 || b.x < -20 || b.y < -20 || b.x > a.W + 20 || b.y > a.H + 20) b.active = false; }
    this.sendT -= dt;
    if (this.sendT <= 0) {
      this.sendT = RT_INPUT_S;
      const ab = this.abq || []; this.abq = [];
      const msg = { k: 'in', n: ++this.seq, x: Math.round(me.x), y: Math.round(me.y), aim: Math.round(me.aim * 100) / 100, f: a._firing ? 1 : 0, hp: me.hp, mh: a.stats.maxHp, dm: a.stats.dmg, rt: a.stats.rate, lv: a.save.level, nm: this.name, sh: a.shield.hits, ab };
      try { this.link.send(msg); } catch (e) { /* ignore */ }
    }
    if (this.silent > (this.snaps ? RT_TIMEOUT_S : 100)) { this.close(false); a._teamEnd('lost'); } // before the host's first snapshot (a 2v2 lobby may still be filling) we wait much longer
  }

  // Guest: an ability was cast locally; tell the host (the effect is drawn locally right away).
  sendAbility(kind) {
    if (this.role !== 'guest') return;
    this.abq = this.abq.concat([{ q: ++this.abSeq, k: kind }]).slice(-6);
    this.sendT = 0; // flush on the next tick
  }
}
