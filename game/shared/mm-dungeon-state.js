// Mad Maze dungeon runtime state machine over a MMWarren dungeon. Pure, no DOM, no Math.random.
// UMD: browser global MMDungeonState, or require(). The rng is injected (needs next/int/pick).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMDungeonState = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  const SECRET_HITS = 3;
  const BOSS_HP = 2400;
  const BOSS_INVULN = 1.5; // seconds
  const PHASE_AT = [0.66, 0.33];

  function lootRoll(rng, kind) {
    const tierBase = kind === 'secret' ? 2 : 1;
    if (rng.next() < 0.5) return { kind: 'gold', amount: rng.int(20, 60) * tierBase };
    return { kind: 'item', slot: rng.pick(['weapon', 'armor', 'ring', 'trinket']), tier: rng.int(tierBase, tierBase + 1) };
  }

  // Queen Burrowmole: phase 1 above 66% HP, phase 2 above 33%, phase 3 below. 1.5 s invulnerable on change.
  function bossCreate(maxHp) {
    maxHp = maxHp || BOSS_HP;
    const b = {
      maxHp, hp: maxHp, phase: 1, invulnerableUntil: -Infinity, dead: false,
      invulnerable(t) { return t < b.invulnerableUntil; },
      hit(dmg, t) {
        if (b.dead) return { accepted: false, reason: 'dead', hp: b.hp, phase: b.phase };
        if (t < b.invulnerableUntil) return { accepted: false, reason: 'invulnerable', hp: b.hp, phase: b.phase };
        b.hp = Math.max(0, b.hp - dmg);
        let phase = 1;
        if (b.hp <= maxHp * PHASE_AT[0]) phase = 2;
        if (b.hp <= maxHp * PHASE_AT[1]) phase = 3;
        const changed = phase > b.phase && b.hp > 0;
        if (changed) { b.phase = phase; b.invulnerableUntil = t + BOSS_INVULN; }
        if (b.hp === 0) b.dead = true;
        return { accepted: true, hp: b.hp, phase: b.phase, phaseChanged: changed, dead: b.dead };
      }
    };
    return b;
  }

  function create(dungeon, rng, opts) {
    opts = opts || {};
    const rooms = {}; dungeon.rooms.forEach((r) => { rooms[r.id] = r; });
    const unlocked = {};
    const rs = {};
    dungeon.rooms.forEach((r) => {
      const n = opts.enemies && opts.enemies[r.id] !== undefined ? opts.enemies[r.id]
        : r.type === 'combat' ? rng.int(2, 4) : 0;
      rs[r.id] = { enemiesAlive: n, cleared: n === 0, visited: false, chestOpen: false };
    });
    const hasChest = (r) => r.type === 'treasure' || r.type === 'secret';
    let current = null, keys = 0, secretHits = 0, secretOpen = false, exited = false;
    const loot = []; let keysFound = 0;

    const doorBetween = (a, b) => dungeon.doors.find((d) => (d.a === a && d.b === b) || (d.a === b && d.b === a));
    // Doors stay shut only while the current room still has living enemies; once cleared they never re-close.
    const sealed = () => current !== null && rs[current].enemiesAlive > 0;

    const st = {
      dungeon, boss: null,
      get current() { return current; },
      get keys() { return keys; },
      get secretOpen() { return secretOpen; },
      get secretHits() { return secretHits; },
      room(id) { return rs[id]; },
      doorsClosed() { return sealed(); },
      enter(roomId) {
        if (exited) return { ok: false, reason: 'exited' };
        if (!rooms[roomId]) return { ok: false, reason: 'unknown' };
        if (current !== null && current !== roomId) {
          if (sealed()) return { ok: false, reason: 'sealed' };
          const d = doorBetween(current, roomId);
          if (!d) return { ok: false, reason: 'no door' };
          if (d.cracked && !secretOpen) return { ok: false, reason: 'cracked' };
          if (d.locked && !unlocked[d.id]) {
            if (keys < 1) return { ok: false, reason: 'locked' };
            keys--; unlocked[d.id] = true;
          }
        }
        current = roomId;
        rs[roomId].visited = true;
        return { ok: true, doorsClosed: sealed() };
      },
      // One enemy in the current room died; at zero the room is cleared for good.
      killEnemy() {
        if (current === null || rs[current].enemiesAlive <= 0) return 0;
        const r = rs[current];
        r.enemiesAlive--;
        if (r.enemiesAlive === 0) r.cleared = true;
        return r.enemiesAlive;
      },
      pickKey() { keys++; keysFound++; return keys; },
      openChest() {
        const r = rooms[current];
        if (!r || !hasChest(r) || rs[current].chestOpen || sealed()) return null;
        rs[current].chestOpen = true;
        const l = lootRoll(rng, r.type);
        loot.push(l);
        return l;
      },
      // A hit on a cracked wall. The secret room opens after exactly 3 hits.
      hitCrackedWall() {
        if (secretOpen) return { hits: secretHits, open: true };
        if (dungeon.secretRoomId === undefined || dungeon.secretRoomId === null) return { hits: 0, open: false };
        secretHits++;
        if (secretHits >= SECRET_HITS) secretOpen = true;
        return { hits: secretHits, open: secretOpen };
      },
      // Mini-map: visited rooms plus direct neighbours; the secret room stays hidden until opened.
      visibleRooms() {
        const vis = new Set();
        dungeon.rooms.forEach((r) => { if (rs[r.id].visited) vis.add(r.id); });
        dungeon.doors.forEach((d) => {
          if (d.cracked && !secretOpen) return;
          if (rs[d.a].visited) vis.add(d.b);
          if (rs[d.b].visited) vis.add(d.a);
        });
        return Array.from(vis).sort((a, b) => a - b);
      },
      exit() {
        exited = true;
        let gold = 0; const items = [];
        loot.forEach((l) => { if (l.kind === 'gold') gold += l.amount; else items.push(l); });
        const visited = dungeon.rooms.filter((r) => rs[r.id].visited);
        return {
          gold, items, loot: loot.slice(),
          keysFound, keysUnused: keys,
          roomsVisited: visited.length, roomsCleared: visited.filter((r) => rs[r.id].cleared).length,
          chestsOpened: dungeon.rooms.filter((r) => rs[r.id].chestOpen).length,
          secretFound: secretOpen, bossDefeated: !!(st.boss && st.boss.dead)
        };
      }
    };
    st.boss = bossCreate(opts.bossHp);
    return st;
  }

  return { create, boss: { create: bossCreate, INVULN: BOSS_INVULN, PHASE_AT, HP: BOSS_HP }, SECRET_HITS };
}));
