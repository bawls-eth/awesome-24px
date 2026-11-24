// First-run Realm tutorial (TU2), phone first. Drives MMTutorial.realmSteps(): one non-blocking coach mark at a time (move, shoot,
// bag, ability, portal, Nexus), each learned by doing and detected from arena / world state. A Skip button (44 px) is always visible.
// State lives in its own additive key `pixeltown-realm-tutorial-v1` ({v:1, s:{done,finished,rewarded}, p0}); invalid -> a fresh state.
// pixeltown-save-v1 is only touched through the existing arena save path when the welcome gift is paid (once, only on real completion).
// Query: ?tutorial=0 disables it, ?tutorial=1 forces it for tests (a ?test=1 page never shows it otherwise).
(function () {
  'use strict';
  const KEY = 'pixeltown-realm-tutorial-v1';
  const MT = window.MMTutorial;
  function clean(raw) {
    const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null;
    if (!r || !MT) return null;
    const p0 = Math.max(0, Math.min(99999, Math.floor(Number(r.p0)) || 0));
    return { v: 1, s: MT.realmNormalize(r.s), p0 };
  }
  function load() { try { const s = localStorage.getItem(KEY); return typeof s === 'string' && s.length < 2000 ? clean(JSON.parse(s)) : null; } catch (e) { return null; } }
  function save(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { /* storage blocked: the tutorial lasts for this visit */ } }
  function el(tag, cls, txt) { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; }

  function attach(c) {
    if (!MT || !c || !c.arena || !c.world || window.__mmTutorial) return null;
    const arena = c.arena, world = c.world, params = c.params, ov = c.overlay || document.getElementById('realm-overlay');
    const q = params.get('tutorial');
    if (q === '0') return null;
    if (c.test && q !== '1') return null;
    let rec = load();
    const portals = () => { try { return Math.max(0, Math.floor(Number(world.save().stats.portals)) || 0); } catch (e) { return 0; } };
    if (!rec) { // no valid saved state: only a fresh profile starts it (an old profile with runs never sees it)
      let fresh = true;
      try {
        const sv = arena.save || {}; const prof = c.profile ? c.profile() : null;
        if ((Number(sv.level) || 1) > 1 || (Number(sv.bestWave) || 0) > 0 || (Number(sv.shards) || 0) > 0 || (sv.items && sv.items.length) || (prof && prof.heroes && prof.heroes.length)) fresh = false;
        if (portals() > 0) fresh = false;
      } catch (e) { fresh = false; }
      if (!fresh && q !== '1') return null;
      rec = { v: 1, s: MT.realmNormalize(null), p0: portals() };
      save(rec);
    }
    if (rec.s.finished) return null;

    const coarse = document.body.classList.contains('touch-device') || (window.matchMedia && matchMedia('(pointer: coarse)').matches);
    const root = el('div'); root.id = 'mm-coach'; root.setAttribute('role', 'status'); root.setAttribute('aria-live', 'polite');
    const txt = el('span', 'mm-coach-text'); const prog = el('span', 'mm-coach-prog');
    const skip = el('button', 'mm-coach-skip', 'Skip'); skip.type = 'button'; skip.id = 'mm-coach-skip'; skip.setAttribute('aria-label', 'Skip the tutorial');
    root.append(txt, prog, skip); ov.appendChild(root);
    let toast = null, toastT = 0;
    function say(text) {
      if (!toast) { toast = el('div'); toast.id = 'mm-coach-toast'; toast.setAttribute('role', 'status'); ov.appendChild(toast); }
      toast.textContent = text; toast.classList.remove('hidden'); keepClear(toast); clearTimeout(toastT); toastT = setTimeout(() => toast.classList.add("hidden"), 10000);
    }
    const stat = { x0: null, y0: null, uid0: Math.floor(Number((arena.save || {}).nextUid)) || 0, tick: 0, rewarded: false };
    // FT2: a coach mark never covers a stick or the ability grid. The CSS puts it under the HUD; on a short screen (or a long text) that could still
    // reach the controls, so a mark or toast that overlaps one moves up to end 8 px above it (never above the top edge).
    const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    function keepClear(e) {
      if (!e || e.classList.contains('hidden')) return;
      e.style.top = ''; let r = e.getBoundingClientRect(); if (!(r.height > 0)) return;
      const ctl = Array.prototype.slice.call(document.querySelectorAll('.realm-stick, #realm-abilities')).map((c) => c.getBoundingClientRect()).filter((c) => c.width > 0 && c.height > 0);
      for (let k = 0; k < 3; k++) {
        const o = ctl.filter((c) => hit(r, c)); if (!o.length) return;
        const ovr = ov.getBoundingClientRect(); const top = Math.max(4, Math.min.apply(null, o.map((c) => c.top)) - 8 - r.height - ovr.top);
        e.style.top = Math.round(top) + 'px'; r = e.getBoundingClientRect();
      }
    }
    // G-15 (b08-04): the 'bag' step guarantees a bag within 6 tiles of the hero (one tutorial bag, dropped two tiles ahead) and says where it is
    function bagNear() {
      const p = arena.player; if (!p || !Array.isArray(arena.bags)) return null;
      let best = null, bd = 6 * 32;
      arena.bags.forEach((b) => { if (b && b.active) { const d = Math.hypot(b.x - p.x, b.y - p.y); if (d <= bd) { bd = d; best = b; } } });
      return best;
    }
    function ensureBag() {
      if (bagNear() || !arena.player || typeof arena.dropBag !== 'function' || arena.state !== 'play') return;
      const p = arena.player; const b = arena.dropBag(p.x + 140, p.y, 0, 'heartcharm'); // 4.4 tiles: inside 6, outside the 110 px pickup drift, so the hero walks to it
      if (b) { b.id = 'heartcharm'; b.vx = 0; b.vy = 0; b.tutorial = true; }
    }
    function bagWhere() {
      const b = bagNear(), p = arena.player; if (!b || !p) return '';
      const dx = b.x - p.x, dy = b.y - p.y;
      const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'below you' : 'above you');
      return ' A bag is close by, ' + (dir === 'right' || dir === 'left' ? 'to your ' + dir : dir) + '.';
    }
    function render() {
      const cur = MT.realmCurrent(rec.s);
      if (cur === 'done') { root.classList.add('hidden'); keepClear(toast); return; }
      const pr = MT.realmProgress(rec.s);
      if (cur === 'bag') ensureBag();
      txt.textContent = MT.realmText(cur, coarse) + (cur === 'bag' ? bagWhere() : ''); prog.textContent = (pr.done + 1) + ' / ' + pr.total; root.dataset.step = cur;
      root.classList.toggle('hidden', arena.state === 'dead'); // G-15: the fall panel (Try again) is never under the coach card
      keepClear(root);
    }
    window.addEventListener('resize', () => { keepClear(root); keepClear(toast); });
    function pay() { // once, through the existing arena save path (a Hearty Charm into the backpack, or shards when it is full) + a full heal
      if (stat.rewarded) return null; stat.rewarded = true;
      let note = '';
      try {
        const sv = arena.save; const cap = typeof RM_BACKPACK === 'number' ? RM_BACKPACK : 24;
        if (sv && Array.isArray(sv.items) && sv.items.length < cap) { sv.items.push(typeof rmTagged === 'function' ? rmTagged({ n: sv.nextUid++, id: 'heartcharm', r: 0 }) : { n: sv.nextUid++, id: 'heartcharm', r: 0 }); note = 'Tutorial done! Gift: a Hearty Charm (+12 max HP) is in your backpack, and you are fully healed.'; }
        else if (sv) { sv.shards = (Number(sv.shards) || 0) + 30; note = 'Tutorial done! Gift: +30 shards, and you are fully healed.'; }
        arena.onSave(sv);
        if (arena.player && arena.stats) arena.player.hp = arena.stats.maxHp;
        if (arena._syncHud) arena._syncHud();
        arena._snd('claim');
      } catch (e) { note = 'Tutorial done!'; }
      say(note);
      return note;
    }
    function event(name) {
      if (rec.s.finished) return;
      const r = MT.realmAdvance(rec.s, name);
      if (r.state === rec.s || JSON.stringify(r.state) === JSON.stringify(rec.s)) return;
      rec = { v: 1, s: r.state, p0: rec.p0 };
      if (r.reward) rec.s.rewarded = true; // persisted BEFORE paying: a crash can never pay twice
      save(rec); render();
      if (r.reward) pay();
    }
    skip.addEventListener('click', () => { const r = MT.realmSkip(rec.s); rec = { v: 1, s: r.state, p0: rec.p0 }; save(rec); render(); }); // skipping never pays
    // abilities: count a cast that actually went off
    const oc = arena.cast; arena.cast = function (i) { const r = oc.apply(this, arguments); if (r === true) event('abilityUsed'); return r; };

    function poll() {
      try {
        const p = arena.player;
        if (rec.s.finished) return;
        const dead = arena.state === 'dead'; if (dead !== stat.dead) { stat.dead = dead; render(); } // G-15: hide the coach while the fall panel is up
        if (!dead && MT.realmCurrent(rec.s) === 'bag' && ((stat.tick = (stat.tick + 1) % 8) === 0)) { ensureBag(); txt.textContent = MT.realmText('bag', coarse) + bagWhere(); }
        if (arena.active && p && stat.x0 === null) { stat.x0 = p.x; stat.y0 = p.y; }
        if (arena.active && !arena.paused && arena.state === 'play' && p && stat.x0 !== null) {
          if (Math.hypot(p.x - stat.x0, p.y - stat.y0) > 48) event('moved');
          if (arena.pBullets && arena.pBullets.some((b) => b.active)) event('shot');
          const uid = Math.floor(Number((arena.save || {}).nextUid)) || 0;
          if (uid > stat.uid0) { event('pickedUp'); stat.uid0 = uid; }
        }
        if (portals() > rec.p0 || world.lastPortalUrl) event('portalEntered');
        if (world.nexus && world.nexus.isOpen && world.nexus.isOpen()) event('nexusOpened');
      } catch (e) { /* never break the page for a coach mark */ }
    }
    // b08-r2-04: early-game survival. While the coach teaches, the first minute of play is gentle: hits do 40% (rising to full by 2 min),
    // the hero cannot fall in the first minute (HP stops at 1), and after 3 s with no hit the hero heals 5% max HP a second. A one-time
    // toast says how to heal / escape the first time HP drops under half. Skipping or finishing the coach ends it (normal rules).
    // R4 D1b (D5 replay: a zero-input hero still fell at ~60 s on 2 of 3 seeds): until the player has ACTED (the coach is still on its
    // first step, 'move'), the hero is shielded: hits do 25% and never take HP below half. The 40%-to-full schedule and the 1 HP floor
    // of the first minute count from the moment the player first acts, not from page load.
    const G = { full: 60, end: 120, mult: 0.4, idleMult: 0.25, idleFloor: 0.5, regenWait: 3, regen: 0.05 };
    const guard = { playT: 0, lastHit: -1e9, acc: 0, warned: false, last: 0, actedAt: null };
    function acted() { if (guard.actedAt === null && MT.realmCurrent(rec.s) !== 'move') guard.actedAt = guard.playT; return guard.actedAt !== null; }
    function sinceAct() { return acted() ? guard.playT - guard.actedAt : 0; }
    function guardOn() { return !rec.s.finished && MT.realmCurrent(rec.s) !== 'done' && sinceAct() < G.end; }
    function guardMult() { if (!acted()) return G.idleMult; const t = sinceAct(); return t <= G.full ? G.mult : G.mult + (1 - G.mult) * Math.min(1, (t - G.full) / (G.end - G.full)); }
    arena.hurtGuard = function () {
      if (!guardOn()) return null;
      guard.lastHit = guard.playT;
      const mx = arena.stats && arena.stats.maxHp > 0 ? arena.stats.maxHp : 0;
      if (!acted()) return { mult: G.idleMult, floor: Math.max(1, Math.ceil(mx * G.idleFloor)) };
      return { mult: guardMult(), floor: sinceAct() < G.full ? 1 : 0 };
    };
    function guardTick() {
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
      const dt = guard.last ? Math.min(0.5, Math.max(0, now - guard.last)) : 0; guard.last = now;
      const p = arena.player;
      if (!arena.active || arena.paused || arena.state !== 'play' || !p) return;
      guard.playT += dt;
      if (!guardOn()) return;
      const mx = arena.stats && arena.stats.maxHp > 0 ? arena.stats.maxHp : 0; if (!mx) return;
      if (!guard.warned && p.hp > 0 && p.hp <= mx * 0.5) {
        guard.warned = true;
        say(coarse ? 'Low HP! Walk away from enemies with the left stick. Nothing hits you for 3 s = you heal.' : 'Low HP! Walk away from enemies. Nothing hits you for 3 s = you heal.');
      }
      if (guard.playT - guard.lastHit >= G.regenWait && p.hp < mx) {
        guard.acc += mx * G.regen * dt;
        if (guard.acc >= 1) { const n = Math.floor(guard.acc); guard.acc -= n; p.hp = Math.min(mx, p.hp + n); if (arena._syncHud) arena._syncHud(); }
      } else guard.acc = 0;
    }
    const iv = setInterval(() => { poll(); try { guardTick(); } catch (e) { /* never break the page */ } if (rec.s.finished) { clearInterval(iv); } }, 120);
    window.addEventListener('pagehide', () => { try { if (portals() > rec.p0 || world.lastPortalUrl) event('portalEntered'); } catch (e) { /* ignore */ } });
    render();
    const api = { state: () => JSON.parse(JSON.stringify(rec)), current: () => MT.realmCurrent(rec.s), event, poll, KEY, root, guard: () => ({ on: guardOn(), mult: guardMult(), playT: Math.round(guard.playT * 10) / 10, acted: acted(), sinceAct: Math.round(sinceAct() * 10) / 10, warned: guard.warned }), guardAdvance: (s) => { guard.playT += Math.max(0, Number(s) || 0); } };
    window.__mmTutorial = api;
    return api;
  }
  window.RealmTutorial = { KEY, attach, clean };
})();
