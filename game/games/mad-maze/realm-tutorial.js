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
      toast.textContent = text; toast.classList.remove('hidden'); clearTimeout(toastT); toastT = setTimeout(() => toast.classList.add("hidden"), 10000);
    }
    const stat = { x0: null, y0: null, uid0: Math.floor(Number((arena.save || {}).nextUid)) || 0, tick: 0, rewarded: false };
    function render() {
      const cur = MT.realmCurrent(rec.s);
      if (cur === 'done') { root.classList.add('hidden'); return; }
      const pr = MT.realmProgress(rec.s);
      txt.textContent = MT.realmText(cur, coarse); prog.textContent = (pr.done + 1) + ' / ' + pr.total; root.dataset.step = cur; root.classList.remove('hidden');
    }
    function pay() { // once, through the existing arena save path (a Hearty Charm into the backpack, or shards when it is full) + a full heal
      if (stat.rewarded) return null; stat.rewarded = true;
      let note = '';
      try {
        const sv = arena.save; const cap = typeof RM_BACKPACK === 'number' ? RM_BACKPACK : 24;
        if (sv && Array.isArray(sv.items) && sv.items.length < cap) { sv.items.push({ n: sv.nextUid++, id: 'heartcharm', r: 0 }); note = 'Tutorial done! Gift: a Hearty Charm (+12 max HP) is in your backpack, and you are fully healed.'; }
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
    const iv = setInterval(() => { poll(); if (rec.s.finished) { clearInterval(iv); } }, 120);
    window.addEventListener('pagehide', () => { try { if (portals() > rec.p0 || world.lastPortalUrl) event('portalEntered'); } catch (e) { /* ignore */ } });
    render();
    const api = { state: () => JSON.parse(JSON.stringify(rec)), current: () => MT.realmCurrent(rec.s), event, poll, KEY, root };
    window.__mmTutorial = api;
    return api;
  }
  window.RealmTutorial = { KEY, attach, clean };
})();
