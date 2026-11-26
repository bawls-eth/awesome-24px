// cyc11-S ID-54 drag-anywhere move (floating move stick). Global MMMoveFloat. Device pref 'mm-move-float' = '1' (localStorage only, never
// in pixeltown-save-v1; the ONE Backup carries it like mm-aim-assist). Default off: with the pref off, bindStick() behaves exactly like the
// old inline stick() helpers in mad-maze.js and main.js (same MAXR, same listeners, same apply(x, y, on) calls).
// With the pref on (touch device, innerWidth > 300 px), a touch on bare ground in the free lower-left area (left of the screen centre,
// below the lowest top-HUD item, and elementFromPoint === the game canvas, so no HUD control loses its tap) moves the move stick to the
// thumb with a CSS translate (no re-layout) and drives it from there; on release the stick returns home. U conditions: IDEAS.md
// "U review of ID-53..55 (cycle 9)" and "U cycle 10: ID-54 final review". Never touches the network or the save.
(function (root) {
  'use strict';
  const KEY = 'mm-move-float';
  const MIN_W = 300; // at <= 300 px (200% zoom) the option is ignored: the fixed stick is clearer there
  const MAXR = 46;
  // Top HUD band: the zone / goal lines, the HP / info bar, the xp, boss and partner bars, the ID-53 hint and the mini-map.
  const TOP_SEL = ['#realm-hud', '#realm-xp', '#realm-boss', '#realm-partner', '#rw-zone', '#rw-goal', '#rw-jhint', '#rw-minimap']; // cyc13-lead: was '#rw-jit', an id nothing has

  function pref(storage) {
    try { const s = storage || root.localStorage; return !!s && s.getItem(KEY) === '1'; } catch (e) { return false; }
  }
  function isTouch(doc) {
    try { return !!(doc && doc.body && doc.body.classList.contains('touch-device')); } catch (e) { return false; }
  }
  function active(win, doc, storage) {
    win = win || root; doc = doc || win.document;
    return pref(storage) && isTouch(doc) && (win.innerWidth || 0) > MIN_W;
  }
  const shown = (el) => {
    if (!el || (el.classList && el.classList.contains('hidden')) || el.hidden) return null;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 ? r : null;
  };
  // The y below which a float may start: the bottom of the lowest visible top-HUD item in the left half of the upper screen.
  function topBound(win, doc) {
    win = win || root; doc = doc || win.document;
    const W = win.innerWidth || 0; const H = win.innerHeight || 0;
    let y = 0;
    TOP_SEL.forEach((sel) => {
      const r = shown(doc.querySelector(sel));
      if (r && r.left < W / 2 && r.top < H / 2 && r.bottom > y) y = r.bottom;
    });
    return y;
  }
  // canStart(x, y): may a touch at (x, y) start the floating stick? (the pref is checked separately by active())
  function canStart(x, y, win, doc, wrap) {
    win = win || root; doc = doc || win.document;
    if (!(x < (win.innerWidth || 0) / 2) || !(y > topBound(win, doc))) return false;
    let hit = null;
    try { hit = doc.elementFromPoint(x, y); } catch (e) { return false; }
    return !!hit && hit.tagName === 'CANVAS' && (!wrap || wrap.contains(hit));
  }
  // The look (faint ring, opaque cap) follows html[data-move-float] so the fixed stick keeps today's art when the option is off.
  function refresh(win, doc, storage) {
    win = win || root; doc = doc || win.document;
    const on = active(win, doc, storage);
    try { if (on) doc.documentElement.setAttribute('data-move-float', '1'); else doc.documentElement.removeAttribute('data-move-float'); } catch (e) { /* ignore */ }
    return on;
  }

  // bindStick(base, apply, opts): the on-screen stick. opts.float = { wrap } turns on the floating start for this stick.
  function bindStick(base, apply, opts) {
    opts = opts || {};
    const win = opts.win || root; const doc = opts.doc || win.document;
    const knob = base.querySelector('.knob');
    let pid = null; let floating = false;
    const set = (e) => {
      const b = base.getBoundingClientRect();
      let dx = e.clientX - (b.left + b.width / 2); let dy = e.clientY - (b.top + b.height / 2);
      const len = Math.hypot(dx, dy);
      if (len > MAXR) { dx = dx / len * MAXR; dy = dy / len * MAXR; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      apply(dx / MAXR, dy / MAXR, true);
    };
    const home = () => { if (floating) { floating = false; base.style.transform = ''; base.classList.remove('mm-floating'); } };
    const end = () => { pid = null; knob.style.transform = ''; home(); apply(0, 0, false); };
    base.addEventListener('pointerdown', (e) => { e.preventDefault(); home(); pid = e.pointerId; try { base.setPointerCapture(pid); } catch (err) { /* synthetic */ } set(e); });
    base.addEventListener('pointermove', (e) => { if (e.pointerId === pid) set(e); });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => base.addEventListener(ev, (e) => { if (pid === null || e.pointerId === pid) end(); }));
    const ctl = { floating: () => floating, pointer: () => pid };
    const wrap = opts.float && opts.float.wrap;
    if (!wrap) return ctl;
    refresh(win, doc);
    ['resize', 'storage', 'mm-settings-change'].forEach((ev) => win.addEventListener(ev, () => refresh(win, doc)));
    wrap.addEventListener('pointerdown', (e) => {
      if (pid !== null || e.pointerType === 'mouse' || !refresh(win, doc)) return;
      if (!canStart(e.clientX, e.clientY, win, doc, wrap)) return;
      e.preventDefault();
      // move the stick's centre to the thumb (translate from its home spot; nothing else re-lays out)
      base.style.transform = '';
      const b = base.getBoundingClientRect();
      base.style.transform = `translate(${e.clientX - (b.left + b.width / 2)}px, ${e.clientY - (b.top + b.height / 2)}px)`;
      base.classList.add('mm-floating');
      floating = true; pid = e.pointerId;
      try { base.setPointerCapture(pid); } catch (err) { /* synthetic pointers can't be captured: the window listeners below cover it */ }
      set(e);
    });
    // a pointer that could not be captured still moves / ends the floating stick (idempotent with the base listeners)
    win.addEventListener('pointermove', (e) => { if (floating && e.pointerId === pid) set(e); });
    ['pointerup', 'pointercancel'].forEach((ev) => win.addEventListener(ev, (e) => { if (floating && e.pointerId === pid) end(); }));
    return ctl;
  }

  root.MMMoveFloat = { KEY: KEY, MIN_W: MIN_W, MAXR: MAXR, TOP_SEL: TOP_SEL.slice(), pref: pref, active: active, topBound: topBound, canStart: canStart, refresh: refresh, bindStick: bindStick };
})(typeof window !== 'undefined' ? window : globalThis);
