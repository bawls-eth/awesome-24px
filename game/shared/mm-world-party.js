// World party protocol (pure, no DOM, no network, no database code). UMD: browser global MMWorldParty, or require().
// Co-op on the big Realm map is RELAY ONLY: this module defines the three message kinds peers exchange (pos, hit, bag),
// how they are encoded, cleaned and rate limited, and an in-memory relay used by tests. A transport is plugged in later.
// Shapes follow mm-party.js: seats 0-3, soulbound bags {owner, item} (owner = seat id), 250 ms damage batches.
// Positions are in TILES (the world uses 32 px tiles); peers only hear each other within RANGE_TILES.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./mm-party.js'));
  else root.MMWorldParty = factory(root.MMParty);
}(typeof self !== 'undefined' ? self : this, function (Party) {
  const POS_HZ = 8;
  const POS_INTERVAL_MS = 1000 / POS_HZ; // 125 ms
  const RANGE_TILES = 40;
  const MAX_SEATS = (Party && Party.MAX_PLAYERS) || 4;
  const MAX_WORLD_TILES = 2048;
  const MAX_DAMAGE = 100000;
  const MAX_BYTES = 512; // one encoded message
  const ID_RE = /^[A-Za-z0-9_-]{1,24}$/;
  const ITEM_RE = /^[a-z0-9_]{1,32}$/;
  const KINDS = ['pos', 'hit', 'bag'];

  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const seatOk = (s) => Number.isInteger(s) && s >= 0 && s < MAX_SEATS;
  const tile = (v) => { const n = Number(v); return isFinite(n) ? Math.round(Math.max(0, Math.min(MAX_WORLD_TILES, n)) * 100) / 100 : null; };
  const count = (v) => { const n = Number(v); return Number.isInteger(n) && n >= 0 && n < 1e9 ? n : null; };

  // ---- constructors (they return clean messages, or null for bad input) ----
  function pos(seat, x, y, facing, n) { return clean({ t: 'pos', s: seat, x: x, y: y, f: facing || 0, n: n || 0 }); }
  // A hit report: `seat` dealt `dmg` to world enemy `enemy` (the host/owner of the enemy applies it, after Party.clampDamage).
  function hit(seat, enemy, dmg, n) { return clean({ t: 'hit', s: seat, e: enemy, d: dmg, n: n || 0 }); }
  // A soulbound bag drop for `owner` (seat). Id is built from the owner seat so two players' ids never collide.
  function bag(owner, counter, item, x, y) { return clean({ t: 'bag', s: owner, id: bagId(owner, counter), item: item, x: x, y: y }); }
  function bagId(owner, counter) { return 'b' + owner + '-' + counter; }

  // ---- clean / encode / decode ----
  // clean never throws; unknown fields are dropped; returns a fresh object or null.
  function clean(m) {
    try {
      if (!isObj(m) || KINDS.indexOf(m.t) < 0 || !seatOk(m.s)) return null;
      if (m.t === 'pos') {
        const x = tile(m.x), y = tile(m.y), n = count(m.n === undefined ? 0 : m.n);
        const f = Number(m.f === undefined ? 0 : m.f);
        if (x === null || y === null || n === null || !Number.isInteger(f) || f < 0 || f > 7) return null;
        return { t: 'pos', s: m.s, x: x, y: y, f: f, n: n };
      }
      if (m.t === 'hit') {
        const d = Number(m.d), n = count(m.n === undefined ? 0 : m.n);
        if (typeof m.e !== 'string' || !ID_RE.test(m.e) || !(d > 0) || !isFinite(d) || n === null) return null;
        return { t: 'hit', s: m.s, e: m.e, d: Math.min(MAX_DAMAGE, Math.round(d * 10) / 10), n: n };
      }
      const x = tile(m.x), y = tile(m.y);
      if (typeof m.id !== 'string' || !ID_RE.test(m.id) || typeof m.item !== 'string' || !ITEM_RE.test(m.item) || x === null || y === null) return null;
      if (m.id.indexOf('b' + m.s + '-') !== 0) return null; // the id must carry its owner seat
      return { t: 'bag', s: m.s, id: m.id, item: m.item, x: x, y: y };
    } catch (e) { return null; }
  }
  function encode(m) {
    const c = clean(m);
    if (!c) return null;
    const s = JSON.stringify(c);
    return s.length <= MAX_BYTES ? s : null;
  }
  function decode(str) {
    if (typeof str !== 'string' || str.length > MAX_BYTES) return null;
    let o; try { o = JSON.parse(str); } catch (e) { return null; }
    return clean(o);
  }

  // ---- range ----
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function inRange(a, b, range) { return !!a && !!b && dist(a, b) <= (range === undefined ? RANGE_TILES : range); }

  // ---- sender: turns a stream of local positions into at most POS_HZ messages per second ----
  function makeSender(seat) {
    let last = -Infinity, n = 0;
    return {
      // returns a pos message string when one is due, else null
      pos(nowMs, x, y, facing) {
        if (nowMs - last < POS_INTERVAL_MS - 1e-6) return null;
        const m = pos(seat, x, y, facing, n + 1);
        if (!m) return null;
        last = nowMs; n++;
        return encode(m);
      },
      hit(enemy, dmg) { return encode(hit(seat, enemy, dmg, ++n)); }
    };
  }

  // ---- in-memory relay (tests, and a stand-in until a real transport exists) ----
  // Peers are numbered by seat. The relay remembers each peer's last position and forwards a message only to the OTHER peers within
  // range of the sender (a peer with no known position gets nothing but its own pos/hit/bag are still accepted).
  function createRelay(range) {
    const peers = {}; // seat -> {inbox:[], pos:{x,y}|null}
    const stats = { in: 0, out: 0, dropped: 0 };
    function join(seat) {
      if (!seatOk(seat) || peers[seat]) return null;
      const p = peers[seat] = { inbox: [], pos: null };
      return {
        seat: seat,
        send(str) { return relay(seat, str); },
        drain() { const o = p.inbox; p.inbox = []; return o.map((s) => decode(s)).filter(Boolean); },
        leave() { delete peers[seat]; }
      };
    }
    function relay(from, str) {
      stats.in++;
      const m = decode(str);
      // a peer cannot speak for another seat (pos/hit); a bag is sent by whoever made the kill but names its OWNER seat
      if (!m || !peers[from] || (m.t !== 'bag' && m.s !== from)) { stats.dropped++; return false; }
      if (m.t === 'pos') peers[from].pos = { x: m.x, y: m.y };
      const origin = m.t === 'bag' ? { x: m.x, y: m.y } : peers[from].pos;
      Object.keys(peers).forEach((k) => {
        const to = Number(k);
        if (to === from) return;
        if (!origin || !peers[to].pos || !inRange(origin, peers[to].pos, range)) { stats.dropped++; return; }
        if (m.t === 'bag' && m.s !== to) { stats.dropped++; return; } // soulbound: only its owner ever hears of a bag
        peers[to].inbox.push(str); stats.out++;
      });
      return true;
    }
    return { join: join, stats: stats, size: () => Object.keys(peers).length };
  }

  return { POS_HZ, POS_INTERVAL_MS, RANGE_TILES, MAX_BYTES, MAX_SEATS, KINDS, pos, hit, bag, bagId, clean, encode, decode, dist, inRange, makeSender, createRelay };
}));
