// Realm audio hookup (SA2). Optional: mad-maze.js calls RealmAudio.attach({arena, zone}) only when this file loaded.
// - Ambient drone: default OFF. The player turns it on in Settings ("Ambient music"); it is stored under the NEW additive key
//   `pixeltown-realm-audio-v1` ({v:1, ambience:bool}, anything invalid = off). It plays only after a user gesture (the arena creates
//   its AudioContext on the first gesture), only with the existing Sound setting unmuted, and follows the zone index at 1 Hz.
// - ui_tap: a short blip on Realm buttons (the portal button plays `portal`). Ability buttons and sticks keep their own sounds.
(function () {
  'use strict';
  const KEY = 'pixeltown-realm-audio-v1';
  function clean(raw) { return { v: 1, ambience: !!raw && typeof raw === 'object' && !Array.isArray(raw) && raw.ambience === true }; }
  function load() { try { const s = localStorage.getItem(KEY); return typeof s === 'string' && s.length < 200 ? clean(JSON.parse(s)) : clean(null); } catch (e) { return clean(null); } }
  function save(st) { try { localStorage.setItem(KEY, JSON.stringify(clean(st))); } catch (e) { /* storage blocked: the choice lasts for this visit */ } }

  let st = load(), ctl = null, last = { zone: 0, playing: false };
  function sfxOf() { return ctl && ctl.arena && ctl.arena._gesture && ctl.arena.sfx ? ctl.arena.sfx : null; }
  function tick() {
    const f = sfxOf(); if (!f) { last.playing = false; return; }
    let z = 0; try { z = Math.floor(Number(ctl.zone())) || 0; } catch (e) { z = 0; }
    last.zone = z;
    try {
      const want = st.ambience && !document.hidden && !f.isMuted();
      if (want) { if (!f.musicOn) f.setMusic(true); last.playing = !!f.ambience(z); }
      else { if (f.musicOn && !st.ambience) f.setMusic(false); else if (f.ambienceOn && f.ambienceOn()) f.stopAmbience(); last.playing = false; }
    } catch (e) { last.playing = false; }
  }
  function attach(c) {
    if (ctl || !c || !c.arena) return;
    ctl = { arena: c.arena, zone: typeof c.zone === 'function' ? c.zone : () => 0 };
    setInterval(tick, 1000);
    const ov = document.getElementById('realm-overlay');
    if (ov) ov.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('button'); if (!b || b.classList.contains('realm-ab') || b.disabled) return;
      try { ctl.arena._snd(b.id === 'rw-portal' ? 'portal' : 'ui_tap'); } catch (err) { /* sound never breaks the page */ }
    }, true);
    document.addEventListener('visibilitychange', tick);
  }
  window.RealmAudio = {
    KEY, clean, attach,
    isOn: () => st.ambience,
    setOn(on) { st = clean({ ambience: !!on }); save(st); tick(); return st.ambience; },
    state: () => ({ on: st.ambience, zone: last.zone, playing: last.playing }),
    tick,
  };
})();
