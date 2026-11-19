// Wilds roaming-group spawner + quest arrow. UMD: browser global MMWilds, or require().
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rng.js'), require('./mm-island.js'));
  else root.MMWilds = factory(root.MMRng, root.MMIsland);
}(typeof self !== 'undefined' ? self : this, function (MMRng, MMIsland) {
  const MAX_LIVE = 60, ELITE_RATE = 0.08, MIN_OFF = 8, MAX_OFF = 20;
  // enemy archetypes available per band
  const SETS = [
    ['wanderer', 'chaser'],
    ['wanderer', 'chaser', 'orbiter'],
    ['chaser', 'orbiter', 'turret'],
    ['orbiter', 'turret', 'spawner', 'chaser'],
    ['turret', 'spawner', 'orbiter', 'chaser'],
  ];
  let planCount = 0;

  // tiles between a point and the camera rectangle {x,y,w,h} (0 when inside)
  function offCamera(cam, x, y) {
    const dx = Math.max(cam.x - x, 0, x - (cam.x + cam.w));
    const dy = Math.max(cam.y - y, 0, y - (cam.y + cam.h));
    return Math.max(dx, dy);
  }

  // plan(seed, island, camera, live): decide one new roaming group (or none).
  // `live` is the array of live enemies. Returns { group|null, spawns:[...] }.
  function plan(seed, island, camera, live) {
    const rng = MMRng.create('wilds:' + seed);
    const room = MAX_LIVE - (live ? live.length : 0);
    if (room < 3) return { group: null, spawns: [] };
    for (let attempt = 0; attempt < 40; attempt++) {
      // leader 11-17 tiles off camera so offsets of up to 3 stay inside 8-20
      const d = 11 + rng.next() * 6;
      const a = rng.next() * Math.PI * 2;
      const cx = camera.x + camera.w / 2, cy = camera.y + camera.h / 2;
      // march outward from the centre along the angle until the rect distance is d
      let r = 0;
      const ux = Math.cos(a), uy = Math.sin(a);
      while (offCamera(camera, cx + ux * r, cy + uy * r) < d && r < 400) r += 0.25;
      const tx = Math.round(cx + ux * r), ty = Math.round(cy + uy * r);
      if (!MMIsland.isLand(island, tx, ty)) continue;
      const band = MMIsland.bandAtIsland(island, tx, ty);
      if (band < 0) continue;
      const B = MMIsland.BANDS[band], set = SETS[band];
      const size = Math.min(1 + rng.int(2, 5), room);
      const elite = rng.next() < ELITE_RATE;
      const tier = rng.int(B.tiers[0], B.tiers[1]);
      const spawns = [];
      spawns.push({ x: tx, y: ty, kind: rng.pick(set), tier, band, leader: true, elite });
      for (let i = 1; i < size; i++) {
        let mx = tx, my = ty;
        for (let k = 0; k < 6; k++) {
          const ox = rng.int(1, 3) * (rng.next() < 0.5 ? -1 : 1), oy = rng.int(-3, 3);
          if (MMIsland.isLand(island, tx + ox, ty + oy)) { mx = tx + ox; my = ty + oy; break; }
        }
        spawns.push({ x: mx, y: my, kind: rng.pick(set), tier, band, leader: false, elite: false });
      }
      return { group: { id: ++planCount, band, tier, elite, size }, spawns };
    }
    return { group: null, spawns: [] };
  }

  const HUB_ZONES = { lantern: 1, hub: 1 };
  // Highest-HP living elite/boss whose tier <= level/4 + 1.
  function pickTarget(enemies, level) {
    const maxTier = (level || 1) / 4 + 1;
    let best = null;
    for (const e of enemies || []) {
      if (!e || e.dead || !(e.hp > 0) || !(e.elite || e.boss) || (e.tier || 1) > maxTier) continue;
      if (!best || e.hp > best.hp) best = e;
    }
    return best;
  }

  // Arrow from player to target: angle in radians (0 = east, y down), dist in tiles.
  function questArrow(player, target) {
    if (!player || !target || target.dead || !(target.hp === undefined || target.hp > 0)) return { hidden: true, angle: 0, dist: 0 };
    if (HUB_ZONES[player.zone] || player.inLantern || player.inHub) return { hidden: true, angle: 0, dist: 0 };
    const dx = target.x - player.x, dy = target.y - player.y;
    return { hidden: false, angle: Math.atan2(dy, dx), dist: Math.hypot(dx, dy) };
  }

  return { MAX_LIVE, ELITE_RATE, MIN_OFF, MAX_OFF, SETS, plan, offCamera, pickTarget, questArrow };
}));
