// World team (slice CO2): same-device co-op on the big Realm map, RELAY ONLY, behind a flag (opts.party === 'local').
// MMWorldTeam.create(arena, world, opts) publishes the local hero position (8 Hz, MMWorldParty sender) and hits through the
// MMPartyBC transport (BroadcastChannel 'mm-party-<seed>', same browser + same origin only) and draws the other party members
// (max party 4 = 3 ghosts) as code-drawn, cached ghost heroes on an overlay canvas with a DOM name tag (textContent only).
// Bags follow MMWorldParty's soulbound rule: a bag is delivered only when its owner seat is this page's seat.
// No host authority: positions and hits are cosmetic; a shared kill gives every partner in range their own bag id (bagId(owner, n)).
// No server code of any kind lives here: no database, no sockets, no fetch. Without BroadcastChannel (or a bad seed / no flag) it
// returns an inert controller and changes nothing.
(function (root) {
  'use strict';
  const WP = root.MMWorldParty, BC = root.MMPartyBC;
  const STALE_MS = 2500; // a ghost that sent no pos for this long is removed (page closed, tab gone)
  const CLAIM_MS = 400; // auto seat: listen this long before taking the lowest free seat
  const SNAP_TILES = 8; // a jump larger than this snaps instead of gliding (portals, respawn)
  const TINTS = ['#7ee787', '#79c0ff', '#ffa657', '#d2a8ff'];
  const TAG_CSS = 'position:absolute;left:0;top:0;pointer-events:none;font:bold 11px system-ui,sans-serif;color:#fff;' +
    'text-shadow:0 1px 2px #000;white-space:nowrap;will-change:transform;max-width:120px;overflow:hidden;text-overflow:ellipsis';

  function inert(reason) {
    return { ok: false, reason: reason, seat: -1, ghosts: () => [], bags: () => [], rolls: () => [], stats: () => ({ sent: 0, recv: 0, rejected: 0 }),
      shareKill: () => null, shareDrop: () => null, sendHit: () => false, tick: () => {}, destroy: () => {} };
  }

  // CO3: a tiered or relic piece never crosses the channel. safeItem(got) -> a plain base item id (or 'bag') that is safe to name in
  // a bag message: soulbound entries (t >= 11, a soulbound flag, a relic or a T12 signature) are skipped, never sent.
  const ITEM_OK = /^[a-z0-9_]{1,32}$/;
  function isSoulbound(it) {
    if (!it || typeof it !== 'object') return true;
    const t = Number(it.t) || 0; const G = root.MMGear;
    if (t >= 11 || it.soulbound || it.relic || it.sig) return true;
    try { if (G && G.isSig && (G.isSig(it.id) || G.isSig(it.rolled))) return true; } catch (e) { return true; }
    return false;
  }
  function safeItem(got) {
    const items = got && Array.isArray(got.items) ? got.items : [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i]; if (isSoulbound(it)) continue;
      const id = String(it.rolled || it.id || '');
      if (ITEM_OK.test(id)) return id;
    }
    return 'bag';
  }

  // One cached canvas per seat colour: a small hooded hero, drawn once with fills (no per-frame path work).
  const spriteCache = {};
  function ghostSprite(doc, seat) {
    if (spriteCache[seat]) return spriteCache[seat];
    const c = doc.createElement('canvas'); c.width = 28; c.height = 32;
    const g = c.getContext('2d'); if (!g) return null;
    const tint = TINTS[seat % TINTS.length];
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(6, 28, 16, 3); // shadow
    g.fillStyle = tint; g.fillRect(8, 12, 12, 14); // cloak
    g.fillRect(6, 16, 3, 8); g.fillRect(19, 16, 3, 8); // arms
    g.fillStyle = '#2b2140'; g.fillRect(9, 26, 4, 3); g.fillRect(15, 26, 4, 3); // boots
    g.fillStyle = tint; g.fillRect(8, 2, 12, 11); // hood
    g.fillStyle = '#f2d3b3'; g.fillRect(10, 5, 9, 7); // face (looks right)
    g.fillStyle = '#1b1430'; g.fillRect(16, 7, 2, 2); // eye
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(9, 3, 3, 2); // hood shine
    spriteCache[seat] = c;
    return c;
  }

  // seat-collision tie break only (not seeded game content): both pages flip a coin until one of them moves
  function coin() {
    try { const a = new Uint8Array(1); root.crypto.getRandomValues(a); return a[0] < 128; } catch (e) { return true; }
  }
  function facingOf(aim) { const a = Number(aim) || 0; return ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8; }

  // create(arena, world, opts): opts.party must be 'local'; opts.seed (string|number, regex-checked by MMPartyBC.seedOk; default world.seed);
  // opts.seat (0-3, else auto-claimed); opts.name(seat) -> tag text; opts.onBag(bag) when a bag owned by this seat arrives;
  // opts.BC (tests), opts.now() (ms clock), opts.interval (false = drive tick() yourself).
  // CO3 opts.loot === true (the Realm page): a local kill that dropped a bag is shared (shareDrop, soulbound pieces stay home), and a
  // partner's bag for this seat is rolled HERE through world.testDrop, so the tier comes from this seat's own seedFor stream
  // (realm-world's gearPlayerId = 'p' + seat). opts.minimap === false skips the partner dot overlay, opts.hud === false the chip.
  function create(arena, world, opts) {
    opts = opts || {};
    if (opts.party !== 'local') return inert('flag off');
    if (!WP || !BC) return inert('modules missing');
    if (!arena || !arena.player || !arena.world) return inert('no world arena');
    const seed = opts.seed !== undefined ? opts.seed : world && world.seed;
    if (!BC.seedOk(seed)) return inert('bad seed');
    const T = BC.open(seed, opts.BC ? { BC: opts.BC } : undefined);
    if (!T.ok) { T.close(); return inert('no BroadcastChannel'); }

    const TILE = (world && world.TILE) || (arena.world && arena.world.tile) || 32;
    const now = typeof opts.now === 'function' ? opts.now : () => Date.now();
    const doc = (arena.canvas && arena.canvas.ownerDocument) || root.document;
    const nameOf = typeof opts.name === 'function' ? opts.name : (s) => 'Hero ' + (s + 1);
    const ghosts = new Map(); // seat -> {seat, x, y, tx, ty (px), f, n, last, hitAt, tag}
    const delivered = []; // bags owned by this seat
    const rolls = []; // CO3: this seat's own rolls for partner bags {id, gp, items}
    const stats = { sent: 0, recv: 0, rejected: 0, bagsRejected: 0, hits: 0, draws: 0, shared: 0, keptHome: 0, partnerRolls: 0, miniDraws: 0 };
    let seat = WP.clean({ t: 'pos', s: opts.seat, x: 0, y: 0 }) ? opts.seat : -1;
    const claimUntil = seat < 0 ? now() + CLAIM_MS : 0;
    let sender = seat >= 0 ? WP.makeSender(seat) : null;
    let bagN = 0, destroyed = false;

    // name tags live in one absolutely positioned layer over the canvas (DOM, textContent only)
    const host = arena.canvas && arena.canvas.parentNode;
    let layer = null;
    if (host && doc) {
      layer = doc.createElement('div'); layer.className = 'mm-team-tags';
      layer.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none';
      if (doc.defaultView && doc.defaultView.getComputedStyle(host).position === 'static') host.style.position = 'relative';
      host.appendChild(layer);
    }

    function myTile() { const p = arena.player; return { x: p.x / TILE, y: p.y / TILE }; }
    function freeSeat() {
      for (let s = 0; s < WP.MAX_SEATS; s++) if (!ghosts.has(s) && s !== seat) return s;
      return -1;
    }
    function dropGhost(s) { const q = ghosts.get(s); if (!q) return; if (q.tag && q.tag.parentNode) q.tag.parentNode.removeChild(q.tag); ghosts.delete(s); }

    function onPos(m, t) {
      if (m.s === seat) { // someone else is using our seat: the later claimer moves (auto seats only)
        if (opts.seat === undefined && t >= claimUntil && coin()) { const s = freeSeat(); if (s >= 0 && s !== seat) { seat = s; sender = WP.makeSender(seat); } }
        stats.rejected++; return;
      }
      let q = ghosts.get(m.s);
      if (q && m.n <= q.n && t - q.last < STALE_MS) { stats.rejected++; return; } // replayed / out of order
      if (!q) {
        if (ghosts.size >= WP.MAX_SEATS - 1) { stats.rejected++; return; } // max party 4
        q = { seat: m.s, x: m.x * TILE, y: m.y * TILE, tx: 0, ty: 0, f: 0, n: 0, last: 0, hitAt: -1e9, tag: null };
        if (layer) { q.tag = doc.createElement('span'); q.tag.className = 'mm-team-tag'; q.tag.style.cssText = TAG_CSS; q.tag.dataset.seat = String(m.s); q.tag.textContent = String(nameOf(m.s)).slice(0, 24); layer.appendChild(q.tag); }
        ghosts.set(m.s, q);
      }
      q.tx = m.x * TILE; q.ty = m.y * TILE; q.f = m.f; q.n = m.n; q.last = t;
      if (Math.hypot(q.tx - q.x, q.ty - q.y) > SNAP_TILES * TILE) { q.x = q.tx; q.y = q.ty; }
    }
    function onMessage(m) {
      if (destroyed) return;
      const t = now();
      stats.recv++;
      // MMPartyBC already ran MMWorldParty.clean; clean again here so this module never trusts a transport it did not build
      m = WP.clean(m);
      if (!m) { stats.rejected++; return; }
      if (m.t === 'pos') return onPos(m, t);
      if (m.t === 'hit') {
        const q = ghosts.get(m.s);
        if (!q || m.s === seat) { stats.rejected++; return; }
        q.hitAt = t; stats.hits++; return;
      }
      // bag: soulbound, only its owner seat ever takes it, and only once
      if (seat < 0 || m.s !== seat || delivered.some((b) => b.id === m.id) || !WP.inRange(m, myTile())) { stats.bagsRejected++; stats.rejected++; return; }
      const b = { id: m.id, item: m.item, x: m.x, y: m.y, owner: m.s };
      if (delivered.length >= 200) delivered.shift();
      delivered.push(b);
      if (opts.loot === true) partnerRoll(b);
      if (typeof opts.onBag === 'function') { try { opts.onBag(Object.assign({}, b)); } catch (e) { /* the page's handler never breaks the party */ } }
    }
    // a partner's kill near us: this seat rolls its own bag (own drop + own gear tier) at its own feet; only the bag id came over
    function partnerRoll(b) {
      if (!world || typeof world.testDrop !== 'function') return;
      let zi = null; try { zi = world.zone ? world.zone() : null; } catch (e) { zi = null; }
      const z = zi && zi.zone >= 0 && zi.zone <= 3 ? zi.zone : 0;
      let got = null;
      try {
        if (world.setDropAll) world.setDropAll(true);
        got = world.testDrop({ zone: z, tier: z, src: 'mob' }, 'co' + b.id);
      } catch (e) { got = null; } finally { try { if (world.setDropAll) world.setDropAll(false); } catch (e) { /* ignore */ } }
      let gp = ''; try { gp = world.gearPlayerId ? String(world.gearPlayerId()) : ''; } catch (e) { gp = ''; }
      stats.partnerRolls++;
      if (rolls.length >= 50) rolls.shift();
      rolls.push({ id: b.id, gp: gp, zone: z, items: got && got.items ? got.items.map((it) => ({ id: it.id, t: it.t || 0, soulbound: !!it.soulbound })) : [] });
    }
    const off = T.onMessage(onMessage);

    function tick() {
      if (destroyed) return;
      const t = now();
      if (seat < 0 && t >= claimUntil) { seat = freeSeat(); if (seat >= 0) sender = WP.makeSender(seat); }
      ghosts.forEach((q, s) => { if (t - q.last > STALE_MS) dropGhost(s); });
      if (!sender || arena.state === 'dead') return;
      const me = myTile();
      const msg = sender.pos(t, me.x, me.y, facingOf(arena.player.aim));
      if (msg && T.send(WP.decode(msg))) stats.sent++;
    }

    // publish local hits (the world's own onEnemyHit keeps running first)
    const prevHit = arena.onEnemyHit;
    const hitHook = function (e, dmg) {
      if (prevHit) prevHit.apply(this, arguments);
      try { if (sender && e && e.zid >= 0) { const m = WP.decode(sender.hit('z' + e.zid, dmg)); if (m && T.send(m)) stats.sent++; } } catch (err) { /* cosmetic only */ }
    };
    arena.onEnemyHit = hitHook;

    // CO3: a local kill that dropped a bag is shared with partners in range (the world's own kill handler runs first)
    const prevKilled = arena.onEnemyKilled;
    let killHook = null;
    if (opts.loot === true && world && typeof world.lastDrops === 'function') {
      killHook = function (e) {
        const before = lastDropRef();
        if (prevKilled) prevKilled.apply(this, arguments);
        try {
          const after = lastDropRef();
          if (after && after !== before && e) shareDrop('z' + (e.type || 'e'), after, e.x / TILE, e.y / TILE);
        } catch (err) { /* co-op never breaks a kill */ }
      };
      arena.onEnemyKilled = killHook;
    }
    function lastDropRef() { try { const L = world.lastDrops(); return L.length ? L[L.length - 1] : null; } catch (e) { return null; } }

    // Ghosts are drawn on our own transparent canvas laid exactly over the arena canvas (the arena's world object is frozen, and the
    // other slices own realm.js): same backing size, same scale + camera transform, cached sprites only, cleared once when empty.
    const W = doc && doc.defaultView;
    let cv = null, cg = null, raf = 0, painted = false;
    if (layer) {
      cv = doc.createElement('canvas'); cv.className = 'mm-team-canvas';
      cv.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;image-rendering:pixelated';
      layer.appendChild(cv); cg = cv.getContext('2d');
    }
    // partner dot on its own small canvas laid over the world minimap (#rw-minimap); the minimap itself is never touched
    const miniSrc = opts.minimap === false || !doc ? null : doc.getElementById('rw-minimap');
    let mcv = null, mcg = null, miniKey = '';
    const hudHost = !doc ? null : (miniSrc && miniSrc.parentNode) || doc.getElementById('realm-overlay') || doc.body; // inside the HUD's stacking context
    if (miniSrc && hudHost) {
      mcv = doc.createElement('canvas'); mcv.className = 'mm-team-mini'; mcv.setAttribute('aria-hidden', 'true');
      mcv.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;display:none;pointer-events:none;z-index:6;image-rendering:pixelated';
      hudHost.appendChild(mcv); mcg = mcv.getContext('2d');
    }
    const WT = (world && world.world && world.world.w) || (arena.world && arena.world.w / TILE) || 1;
    const HT = (world && world.world && world.world.h) || (arena.world && arena.world.h / TILE) || 1;
    function drawMiniDots() {
      if (!mcg) return;
      const r = miniSrc.getBoundingClientRect();
      const vis = ghosts.size > 0 && r.width > 0 && miniSrc.offsetParent !== null;
      const key = vis ? [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)].concat(Array.from(ghosts.values()).map((q) => q.seat + ':' + Math.round(q.tx / TILE) + ',' + Math.round(q.ty / TILE))).join('|') : '';
      if (key === miniKey) return;
      miniKey = key;
      mcv.style.display = vis ? '' : 'none';
      if (!vis) return;
      // the minimap has a border: the dots sit on its content box, in its own backing pixels
      const bl = miniSrc.clientLeft || 0, bt = miniSrc.clientTop || 0; const cw = miniSrc.clientWidth || r.width, ch = miniSrc.clientHeight || r.height;
      mcv.style.left = (r.left + bl) + 'px'; mcv.style.top = (r.top + bt) + 'px'; mcv.style.width = cw + 'px'; mcv.style.height = ch + 'px';
      const bw = miniSrc.width || 96, bh = miniSrc.height || 96;
      if (mcv.width !== bw || mcv.height !== bh) { mcv.width = bw; mcv.height = bh; }
      mcg.clearRect(0, 0, bw, bh);
      const sx = bw / WT, sy = bh / HT;
      ghosts.forEach((q) => {
        const x = Math.round(q.tx / TILE * sx), y = Math.round(q.ty / TILE * sy);
        mcg.fillStyle = '#000'; mcg.fillRect(x - 3, y - 3, 6, 6);
        mcg.fillStyle = TINTS[q.seat % TINTS.length]; mcg.fillRect(x - 2, y - 2, 4, 4);
      });
      stats.miniDraws++;
    }
    // HUD partner chip: one small DOM line just left of the minimap (top of the screen, away from both sticks and the ability grid)
    let chip = null, chipKey = '';
    if (opts.hud !== false && hudHost) {
      chip = doc.createElement('div'); chip.className = 'mm-team-hud'; chip.setAttribute('aria-live', 'polite');
      chip.style.cssText = 'position:fixed;left:auto;right:8px;top:8px;display:none;pointer-events:none;z-index:6;padding:2px 6px;border-radius:6px;' +
        'background:rgba(11,7,22,0.72);border:1px solid rgba(255,255,255,0.3);color:#fff;font:bold 11px system-ui,sans-serif;white-space:nowrap;max-width:40vw;overflow:hidden;text-overflow:ellipsis';
      hudHost.appendChild(chip);
    }
    function drawChip() {
      if (!chip) return;
      const me = arena.player; let txt = '';
      ghosts.forEach((q) => { const d = Math.round(Math.hypot(q.tx - me.x, q.ty - me.y) / TILE); txt += (txt ? '  ' : '') + '\u{1F91D} ' + (q.tag ? q.tag.textContent : 'Hero ' + (q.seat + 1)) + ' \u00B7 ' + d + 't'; });
      const r = miniSrc ? miniSrc.getBoundingClientRect() : null;
      if (miniSrc && miniSrc.offsetParent === null) txt = ''; // a panel is open: the chip steps aside with the minimap
      const key = txt + '|' + (r ? Math.round(r.left) + ',' + Math.round(r.top) : '');
      if (key === chipKey) return;
      chipKey = key;
      if (!txt) { chip.style.display = 'none'; return; }
      chip.textContent = txt; chip.style.display = '';
      const vw = (W && W.innerWidth) || 390;
      if (r && r.width > 0) { chip.style.right = Math.max(4, Math.round(vw - r.left + 6)) + 'px'; chip.style.top = Math.round(r.top) + 'px'; }
    }
    function frame() {
      raf = 0;
      if (destroyed) return;
      if (W) raf = W.requestAnimationFrame(frame);
      drawMiniDots(); drawChip();
      if (!cg || !arena.canvas) return;
      const src = arena.canvas;
      if (cv.width !== src.width || cv.height !== src.height) { cv.width = src.width; cv.height = src.height; painted = true; }
      const rect = src.getBoundingClientRect(); const hostRect = host.getBoundingClientRect();
      const ox = rect.left - hostRect.left, oy = rect.top - hostRect.top;
      cv.style.transform = 'translate(' + ox + 'px,' + oy + 'px)'; cv.style.width = rect.width + 'px'; cv.style.height = rect.height + 'px';
      if (!ghosts.size && !painted) return;
      const g = cg; const s = arena.W ? cv.width / arena.W : 1; const cam = arena.camera || { x: 0, y: 0 };
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height); painted = false;
      if (!ghosts.size) return;
      g.setTransform(s, 0, 0, s, -cam.x * s, -cam.y * s); g.imageSmoothingEnabled = false;
      const me = arena.player; const rangePx = WP.RANGE_TILES * TILE; const k = arena.W ? rect.width / arena.W : 1; const t = now();
      ghosts.forEach((q) => {
        q.x += (q.tx - q.x) * 0.35; q.y += (q.ty - q.y) * 0.35;
        const near = Math.hypot(q.x - me.x, q.y - me.y) <= rangePx;
        if (q.tag) q.tag.style.display = near ? '' : 'none';
        if (!near) return;
        const spr = ghostSprite(doc, q.seat);
        if (spr) {
          g.save(); g.globalAlpha = 0.72; g.translate(Math.round(q.x), Math.round(q.y));
          if (q.f >= 3 && q.f <= 5) g.scale(-1, 1);
          g.drawImage(spr, -14, -20); g.restore(); stats.draws++; painted = true;
        }
        if (t - q.hitAt < 200) { g.globalAlpha = 0.6; g.strokeStyle = TINTS[q.seat % TINTS.length]; g.lineWidth = 2; g.strokeRect(q.x - 16, q.y - 22, 32, 36); g.globalAlpha = 1; }
        if (q.tag) q.tag.style.transform = 'translate(' + Math.round(ox + (q.x - cam.x) * k) + 'px,' + Math.round(oy + (q.y - cam.y - 24) * k) + 'px) translate(-50%,-100%)';
      });
    }
    if (W && (cg || mcg || chip)) raf = W.requestAnimationFrame(frame);

    const iv = opts.interval === false || !W ? 0 : W.setInterval(tick, Math.floor(WP.POS_INTERVAL_MS / 2));
    const onHide = () => destroy();
    if (W) W.addEventListener('pagehide', onHide);

    // shareKill(enemyId, item, x, y): this page made a kill; every partner within range gets a bag with ITS OWN owner-seat id,
    // and this page gets its own. Returns this seat's bag (or null). Coordinates are tiles.
    function shareKill(enemyId, item, x, y) {
      if (destroyed || seat < 0) return null;
      if (typeof item !== 'string' || !ITEM_OK.test(item)) item = 'bag';
      const n = ++bagN; let mine = null;
      const at = { x: Number(x), y: Number(y) };
      ghosts.forEach((q) => {
        if (!WP.inRange(at, { x: q.x / TILE, y: q.y / TILE })) return;
        const m = WP.bag(q.seat, seat * 100000 + n, item, at.x, at.y);
        if (m && T.send(m)) stats.sent++;
      });
      const own = WP.bag(seat, seat * 100000 + n, item, at.x, at.y);
      if (own) { mine = { id: own.id, item: own.item, x: own.x, y: own.y, owner: seat }; delivered.push(mine); if (typeof opts.onBag === 'function') { try { opts.onBag(Object.assign({}, mine)); } catch (e) { /* ignore */ } } }
      return mine;
    }

    // shareDrop(enemyId, got, x, y): share a local world drop (realm-world's lastDrops entry). Only a safe base item id is named;
    // soulbound / relic pieces are counted in stats().keptHome and never posted. Partners roll their own bag and tier.
    function shareDrop(enemyId, got, x, y) {
      if (destroyed || seat < 0 || !got) return null;
      const items = Array.isArray(got.items) ? got.items : [];
      items.forEach((it) => { if (isSoulbound(it)) stats.keptHome++; });
      const b = shareKill(enemyId, safeItem(got), x, y);
      if (b) stats.shared++;
      return b;
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      if (iv && W) W.clearInterval(iv);
      if (W) W.removeEventListener('pagehide', onHide);
      off(); T.close();
      if (arena.onEnemyHit === hitHook) arena.onEnemyHit = prevHit;
      if (killHook && arena.onEnemyKilled === killHook) arena.onEnemyKilled = prevKilled;
      if (mcv && mcv.parentNode) mcv.parentNode.removeChild(mcv);
      if (chip && chip.parentNode) chip.parentNode.removeChild(chip);
      if (raf && W) W.cancelAnimationFrame(raf);
      Array.from(ghosts.keys()).forEach(dropGhost);
      if (layer && layer.parentNode) layer.parentNode.removeChild(layer);
    }

    return {
      ok: true, channel: T.name,
      get seat() { return seat; },
      ghosts: () => Array.from(ghosts.values()).map((q) => ({ seat: q.seat, x: q.tx / TILE, y: q.ty / TILE, f: q.f, n: q.n, name: q.tag ? q.tag.textContent : '' })),
      bags: () => delivered.map((b) => Object.assign({}, b)),
      rolls: () => rolls.map((r) => Object.assign({}, r, { items: r.items.map((i) => Object.assign({}, i)) })),
      stats: () => Object.assign({}, stats),
      sendHit: (enemyId, dmg) => { const m = sender && WP.decode(sender.hit(enemyId, dmg)); return !!(m && T.send(m) && ++stats.sent); },
      shareKill, shareDrop, tick, destroy
    };
  }

  root.MMWorldTeam = { create, STALE_MS, CLAIM_MS, TINTS, facingOf, safeItem, isSoulbound };
}(typeof self !== 'undefined' ? self : this));
