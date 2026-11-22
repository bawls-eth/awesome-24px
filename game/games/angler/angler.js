// Lakeside Angler page. Canvas + DOM, no network. Logic lives in shared/mm-angler.js.
(function () {
  'use strict';
  const A = window.MMAngler, D = window.MMAnglerDepth, B = window.MMAnglerBoss, I = window.MMAnglerIsles, Store = window.MMStore, Rng = window.MMRng;
  // MG3: other games' saves are READ ONLY here (getItem only; Bug Safari and the isles are never written or consumed).
  const peek = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const bugsRaw = () => peek(I.BUGS_KEY);
  const coveOpen = () => I.cove.open(peek(I.ISLES_KEY));
  const COVE = 'cove';
  const spotName = (id) => (id === COVE ? 'Isles Cove' : A.SPOT_NAMES[id]);
  const KEY = 'pixeltown-angler-v1';
  const W = 320, H = 480, WATER = 170;
  const params = new URLSearchParams(location.search);
  const TEST = params.get('test') === '1';
  const RARITY = ['', 'Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];
  const MANGROVE_NEEDS = 10; // species caught before the secret Mangrove opens

  const $ = (id) => document.getElementById(id);
  const cv = $('scene'), ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const todayStr = () => (dateOverride && B.validDate(dateOverride.str) ? dateOverride.str : B.dateStr(new Date()));
  const mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const reduced = () => !!(mq && mq.matches) || !!(window.MMSideAccess && window.MMSideAccess.reduced());
  // AC1 graphics tier: the shared "Low graphics" pref (pixeltown-access-v1 lowGfx, read with MMAccess) forces MMPerf's low tier:
  // no water shimmer, fewer rain/snow drops, one splash ring and fanfare sparks capped at MMPerf's low cap.
  // Without the pref (or without MMPerf) the tier is 'high' and every frame draws exactly as before.
  const gfx = (() => {
    let prefs = null, tier = 'high';
    try { prefs = window.MMAccess ? window.MMAccess.prefs.load(window.localStorage) : null; } catch (e) { prefs = null; }
    try { if (window.MMPerf) tier = window.MMPerf.profile([], prefs).tier; } catch (e) { tier = 'high'; }
    const low = tier === 'low';
    let dpr = 1;
    try { if (window.MMPerf && window.MMPerf.applyCanvas) dpr = window.MMPerf.applyCanvas(cv, tier).dpr; } catch (e) { dpr = 1; }
    return { tier, low, dpr, cap: low && window.MMPerf ? window.MMPerf.CAPS.low.sparks : Infinity, drops: low ? 16 : 40, rings: low ? 1 : 3 };
  })();

  // ---- rng / clock / date (seeded and fake in test mode) ----
  let rng = Math.random;
  if (TEST) { const seed = /^[\w-]{1,32}$/.test(params.get('seed') || '') ? params.get('seed') : 'angler'; const r = Rng.create(seed); rng = r.next; }
  let ready = false;
  let dateOverride = null; // {month, hour}
  function setDate(str) {
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}))?$/.exec(String(str || ''));
    if (!m) { dateOverride = null; return false; }
    const month = +m[2];
    if (month < 1 || month > 12) return false;
    dateOverride = { month, hour: m[4] === undefined ? 12 : Math.min(23, +m[4]), str: m[1] + '-' + m[2] + '-' + m[3] };
    if (ready) renderSpots();
    return true;
  }
  if (TEST) setDate(params.get('date'));
  // ---- weather: injected in test mode, otherwise a calm pseudo-forecast from the real date (no network) ----
  const WEATHERS = ['clear', 'cloudy', 'rain', 'snow'];
  const WX_ICON = { clear: '\u2600\uFE0F', night: '\uD83C\uDF19', cloudy: '\u2601\uFE0F', rain: '\uD83C\uDF27\uFE0F', snow: '\u2744\uFE0F' };
  let weatherOverride = null;
  function setWeather(w) {
    weatherOverride = WEATHERS.indexOf(w) >= 0 ? w : null;
    if (ready) { renderStatus(); draw(); }
    return weatherOverride !== null;
  }
  if (TEST) setWeather(params.get('weather'));
  function forecast(d) {
    const month = d.getMonth() + 1;
    let h = (d.getFullYear() * 372 + month * 31 + d.getDate()) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0; h = (h ^ (h >>> 13)) % 10;
    if (h < 5) return 'clear';
    if (h < 8) return 'cloudy';
    return month === 12 || month <= 2 ? 'snow' : 'rain';
  }
  function nowCtx() {
    if (dateOverride) return { month: dateOverride.month, hour: dateOverride.hour, weather: weatherOverride || 'clear' };
    const d = new Date();
    return { month: d.getMonth() + 1, hour: d.getHours(), weather: weatherOverride || (TEST ? 'clear' : forecast(d)) };
  }

  // ---- tournament day: real calendar day; ?day=N (test mode only) is clamped to an integer ----
  const realDay = () => { const d = new Date(); return D.dayNumber(d.getFullYear(), d.getMonth() + 1, d.getDate()); };
  let dayOverride = TEST ? D.clampDay(params.get('day'), null) : null;
  const today = () => (dayOverride === null ? realDay() : dayOverride);

  // ---- journal ----
  let journal = A.journal.cleanFull(Store.get(KEY, null));
  // gear that is not unlocked (hand-edited storage) falls back to the starter kit
  function fixGear() {
    if (!A.journal.gearUnlocked(journal, 'rod', journal.gear.rod)) journal.gear.rod = 'stick';
    if (!A.journal.gearUnlocked(journal, 'lure', journal.gear.lure)) journal.gear.lure = 'none';
    if (journal.bugBait && I.bug.unlocked(bugsRaw()).indexOf(journal.bugBait) < 0) journal.bugBait = '';
  }
  fixGear();
  // ?bait=N: digits only, clamped 0-99. Anything else is ignored. Never a purchase.
  (function () {
    const raw = params.get('bait');
    if (raw !== null && /^\d{1,6}$/.test(raw)) { journal.bait = Math.max(0, Math.min(99, Number(raw))); Store.set(KEY, A.journal.clean(journal)); }
  })();
  // Hub medal summary: its own additive key, read by the hub page only.
  function hubMedals() { try { const n = A.journal.speciesCount(journal), t = A.journal.trophyCount(journal), m = []; if (n >= 1) m.push('catch1'); if (n >= 10) m.push('species10'); if (t >= 1) m.push('boss1'); localStorage.setItem('pixeltown-medals-angler-v1', JSON.stringify({ v: 1, m })); } catch (e) { /* storage blocked */ } try { const sp = (s) => Object.keys(journal.caught).some((id) => A.BY_ID[id] && !A.BY_ID[id].boss && A.BY_ID[id].spots.indexOf(s) >= 0) && s; window.MMHubProfile.sync(localStorage, 'angler', [A.journal.speciesCount(journal) >= 1 && 'catch1', A.journal.speciesCount(journal) >= 10 && 'species10', sp('west'), sp('east'), sp('river'), sp('pier'), !!journal.trophies.old_whiskers && 'whiskers', !!journal.caught.golden_trout && 'trout']); } catch (e) { /* hub map progress is optional */ } }
  function saveJournal() { journal = A.journal.cleanFull(journal); Store.set(KEY, journal); hubMedals(); }
  hubMedals();

  // ---- state ----
  const g = {
    state: 'idle', spot: 'west', bite: null, reel: null, fish: null, size: 0, forced: null,
    result: null, t: 0, hooked: 0, tour: false, tourResult: null, cf: null, baitUsed: null, calm: false, fx: [], bobY: 0, baited: false, bossChance: 0.25, boss: false, bossGate: true, surge: null, strain: 0, splash: null, bossLog: [],
  };
  const held = { ptr: false, key: false, pad: false, test: false, btn: false };
  const anyHeld = () => held.ptr || held.key || held.pad || held.test || held.btn;

  function spotLocked(id) {
    const c = nowCtx();
    if (id === 'ice') return !A.iceOpen(c.month);
    if (id === 'mangrove') return A.journal.speciesCount(journal) < MANGROVE_NEEDS;
    if (id === COVE) return !coveOpen();
    return false;
  }
  function lockReason(id) {
    if (id === COVE) return 'Visit the Coral Reef isle';
    if (id === 'ice') return 'Open Dec-Feb';
    if (id === 'mangrove') return 'Catch ' + MANGROVE_NEEDS + ' species';
    return '';
  }
  function setMsg(t) { $('msg').textContent = t; }

  function pickSpot(id) {
    if ((A.SPOTS.indexOf(id) < 0 && id !== COVE) || spotLocked(id)) return false;
    if (g.state !== 'idle') return false;
    if (g.tour && id !== D.tournament.forDay(today()).spot) return false;
    g.spot = id; renderSpots(); setMsg(idleMsg()); $('spot-title').textContent = spotName(id);
    return true;
  }
  const idleMsg = () => 'Press, click or tap to cast at ' + spotName(g.spot) + '.';

  // ---- flow ----
  function cast() {
    if (g.state !== 'idle') return;
    if (spotLocked(g.spot)) { setMsg('This spot is closed right now.'); return; }
    g.cf = null; g.baitUsed = null;
    if (g.tour) {
      const tk = D.tournament.takeCast(journal, today());
      if (tk.n < 0) { setMsg('No casts left in the tournament.'); return; }
      journal = tk.journal; saveJournal();
      g.cf = D.tournament.castFor(today(), tk.n);
      g.bite = A.bite(rng); g.bite.wait = g.cf.wait; // same bite for everyone; no bait in the tournament
    } else if (g.spot === COVE) {
      g.bite = A.bite(rng); // cove bait (kelp / shell / pearl) is never used up; Market bait stays in the bag here
    } else {
      g.bite = A.bite(rng);
      const u = D.economy.useBait(journal);
      if (u.type) { journal = u.journal; g.baitUsed = u.type; g.bite.wait *= A.BAITS[u.type].waitMult; saveJournal(); }
    }
    g.state = 'waiting'; g.t = 0;
    g.baited = !!g.baitUsed;
    setMsg(g.tour ? 'Tournament cast ' + journal.tour.run.used + '/' + D.CASTS + '. Waiting for a bite...' : g.baited ? 'Bait on the hook! Waiting for a bite...' : 'Waiting for a bite... (do not press yet)');
    renderSpots();
  }
  function finish(outcome, title, detail) {
    g.state = 'result'; g.result = { outcome, fish: g.fish && g.fish.id, size: g.size };
    $('res-title').textContent = title; $('res-detail').textContent = detail;
    $('res-ok').textContent = outcome === 'caught' ? 'Cast again' : 'Try again';
    $('result').hidden = false; g.resultAt = g.t;
    $('res-title').className = outcome === 'caught' && g.fish ? 'r' + g.fish.rarity : '';
    setMsg(title); renderSpots();
    if (g.tour) afterTourCast();
    if (!TEST) setTimeout(() => { try { $('res-ok').focus({ preventScroll: true }); } catch (e) { /* ignore */ } }, 0);
  }
  function dismiss() {
    if (g.state !== 'result') return;
    $('result').hidden = true; g.fan = null; g.boss = false; g.surge = null; g.strain = 0; g.splash = null; bossUi(); g.state = 'idle'; g.reel = null; g.bite = null; g.fish = null; g.cf = null;
    setMsg(g.tour ? 'Tournament: cast ' + (journal.tour.run ? journal.tour.run.used + 1 : '?') + '/' + D.CASTS + ' at ' + spotName(g.spot) + '.' : idleMsg()); renderSpots();
    if (g.tourResult) openTourney();
  }
  const OVERLAYS = ['journal', 'gear', 'tourney', 'market', 'aquarium'];
  const overlayOpen = () => OVERLAYS.some((id) => !$(id).hidden);
  function onDown() {
    if (overlayOpen()) return;
    if (g.state === 'idle') cast();
    else if (g.state === 'waiting' || g.state === 'biting') {
      const r = g.bite.press();
      if (r === 'spooked') { finish('spooked', 'Spooked!', 'You pulled too early. The fish swam away.'); }
      else if (r === 'hooked') hook();
    }
  }
  function hook() {
    const c = nowCtx();
    const lair = A.journal.bossFor(journal, g.spot);
    let f;
    if (g.cf) f = A.BY_ID[g.cf.fish];
    else if (g.forced) f = A.BY_ID[g.forced] || A.COVE_BY_ID[g.forced];
    else if (g.spot === COVE) f = I.cove.roll(rng, journal.coveBait);
    else if (lair && lair.ready && (!g.bossGate || B.gateOpen(journal, lair.boss)) && rng() < g.bossChance) f = A.BY_ID[lair.boss];
    else f = I.bug.rollFish(rng, g.spot, c, { lure: journal.gear.lure, bait: g.baitUsed === 'plain', baitType: g.baitUsed }, journal.bugBait);
    g.forced = null;
    if (!f) { finish('none', 'Nothing here', 'This spot is closed.'); return; }
    g.fish = f; g.size = g.cf ? g.cf.size : A.rollSize(rng, f, { big: g.baitUsed === 'big' }); g.boss = !!f.boss;
    g.reelSeed = g.cf ? g.cf.seed : Math.floor(rng() * 1e9);
    g.reel = A.reel.create(f, journal.gear.rod, { seed: g.reelSeed, calm: g.calm, fillMult: g.boss && g.bossGate ? B.CFG.fillMult : 1 });
    g.state = 'reeling'; g.t = 0; g.lastPhase = 0; g.phaseAt = 0;
    g.surge = null; g.strain = 0; g.splash = null;
    if (g.boss) {
      if (g.bossGate) {
        g.surge = B.schedule(f.id, g.cf ? g.cf.seed : g.reelSeed);
        g.splash = { t: 0 };
        journal = B.resetLair(journal, B.spotOf(f.id)); saveJournal();
      }
      setMsg('BOSS! ' + (B.INTRO[f.id] || f.name + ' takes the line.') + (g.surge ? ' Ease off during surges.' : ' The line snaps after 1.5 s at max tension.'));
    } else setMsg('Hooked! Hold to reel. Keep the zone on the fish.');
    bossUi();
    renderSpots();
  }
  function land() {
    if (g.fish.cove) { landCove(); return; }
    const f = g.fish, isNew = !journal.caught[f.id];
    const firstTrophy = f.boss && !journal.trophies[f.id];
    journal = A.journal.record(journal, f.id, g.size);
    if (f.boss) { journal = A.journal.addTrophy(journal, f.id); journal = B.addHall(journal, f.id, g.size, todayStr()); }
    else if (!g.cf) journal = B.noteCatch(journal, f.id, g.spot);
    journal = D.economy.addStock(journal, f.id);
    const drop = D.economy.baitDrop(f.id, g.size, totalCaught() + 1);
    g.dropMsg = '';
    if (drop) { const r = D.economy.addBait(journal, drop); if (r.ok) { journal = r.journal; g.dropMsg = ' +1 ' + BAIT_NAMES[drop] + ' bait'; } }
    g.tourPts = 0;
    if (g.tour && g.cf) { g.tourPts = D.tournament.scoreCatch(f.id, g.size, today()); journal = D.tournament.addScore(journal, g.tourPts); }
    saveJournal(); renderJournalCount(); renderStatus();
    g.fan = { t: 0, big: f.rarity >= 4 };
    finish('caught', (f.boss ? (firstTrophy ? 'TROPHY! ' : 'Boss beaten! ') : isNew ? 'New! ' : '') + f.name,
      RARITY[f.rarity] + ' (' + f.rarity + '/5) - ' + sizeWord(f, g.size) + ', ' + g.size + ' cm' + (f.boss ? ' - trophy in the Hall of Records' : '') + g.dropMsg + (g.tourPts ? ' - +' + g.tourPts + ' points' : ''));
  }

  // Cove fish go to their own journal key: no stock, no bells, no bait drops (no currency here), just the collection.
  function landCove() {
    const f = g.fish, isNew = !journal.cove[f.id];
    journal = I.cove.record(journal, f.id, g.size);
    saveJournal(); renderStatus();
    g.fan = { t: 0, big: f.rarity >= 4 };
    finish('caught', (isNew ? 'New! ' : '') + f.name, RARITY[f.rarity] + ' (' + f.rarity + '/5) - ' + sizeWord(f, g.size) + ', ' + g.size + ' cm - cove fish ' + I.cove.count(journal) + '/' + A.COVE_FISH.length);
  }
  function sizeWord(f, cm) {
    const s = f.size || [10, 30], q = (cm - s[0]) / Math.max(1, s[1] - s[0]);
    return q < 0.25 ? 'a tiny one' : q < 0.6 ? 'a nice one' : q < 0.9 ? 'a big one' : 'a whopper';
  }
  function step(dt) {
    g.t += dt;
    if (g.fan) g.fan.t += dt;
    if (g.splash) g.splash.t += dt;
    if (g.state === 'waiting' || g.state === 'biting') {
      const s = g.bite.tick(dt);
      if (s === 'biting' && g.state === 'waiting') { g.state = 'biting'; setMsg('A bite! Press now!'); }
      else if (s === 'missed') finish('missed', 'Too slow', 'The fish got away.');
    } else if (g.state === 'reeling') {
      const r = g.reel.tick(dt, anyHeld());
      if (g.boss && r.phase !== g.lastPhase) { g.lastPhase = r.phase; g.phaseAt = g.t; }
      if (r.status === 'reeling' && g.surge) {
        const sp = B.phaseAt(g.surge, g.t), ts = B.tensionStep(g.strain, dt, anyHeld(), sp === 'surge');
        g.strain = ts.strain;
        if (ts.snapped) { finish('snapped', 'Line snapped!', 'The boss surged and you kept reeling. Ease off during a surge, then reel again.'); bossUi(); return; }
      }
      bossUi();
      if (r.status === 'snapped') finish('snapped', 'Line snapped!', g.boss ? 'The boss won this round. At max tension the line lasts only 1.5 s.' : 'Tension stayed at max too long. Release more often.');
      else if (r.status === 'caught') land();
    }
    if (g.state === 'biting' || g.state === 'hooked') g.bobY = 6;
    else g.bobY = reduced() || g.state !== 'waiting' ? 0 : Math.sin(g.t * 3) * 1.5;
  }

  // ---- input ----
  function setInput(src, v) {
    const before = anyHeld(); held[src] = v; const after = anyHeld();
    if (!before && after) onDown();
  }
  const ignoreEl = (t) => t && t.closest && t.closest('button, a, select, input, label, .overlay, #result, #status');
  document.addEventListener('pointerdown', (e) => { if (ignoreEl(e.target)) return; setInput('ptr', true); });
  const up = () => setInput('ptr', false);
  document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
  window.addEventListener('blur', () => { held.ptr = held.key = held.pad = held.btn = false; });
  document.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' || e.repeat) return;
    if (overlayOpen()) return;
    e.preventDefault();
    if (g.state === 'result') { if (g.t - g.resultAt > 0.25 || TEST) dismiss(); return; }
    setInput('key', true);
  });
  document.addEventListener('keyup', (e) => { if (e.code === 'Space') setInput('key', false); });
  function pollPad() {
    try {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      let a = false;
      for (const p of pads) if (p && p.buttons[0] && p.buttons[0].pressed) a = true;
      if (a && g.state === 'result' && g.t - g.resultAt > 0.4) { dismiss(); held.pad = true; return; }
      if (g.state !== 'result') setInput('pad', a); else held.pad = a;
    } catch (e) { /* ignore */ }
  }
  $('res-ok').addEventListener('click', dismiss);
  // on-screen reel button (shown during a boss fight): hold to reel, release to ease off
  const reelBtn = $('reel-btn');
  reelBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); setInput('btn', true); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => reelBtn.addEventListener(ev, () => setInput('btn', false)));
  reelBtn.addEventListener('contextmenu', (e) => e.preventDefault());
  let uiCache = '';
  function bossUi() {
    const on = g.state === 'reeling' && g.boss && !!g.surge;
    const ph = on ? B.phaseAt(g.surge, g.t) : 'calm';
    const label = !on ? '' : ph === 'surge' ? 'EASE OFF! Let go of the line' : ph === 'warn' ? 'Surge coming - get ready to ease off' : 'Steady - reel in the zone';
    const pct = on ? Math.round(g.strain * 100) : 0;
    const key = on + '|' + ph + '|' + pct;
    if (key === uiCache) return;
    uiCache = key;
    $('boss-ui').hidden = !on;
    const bar = $('boss-bar');
    bar.dataset.phase = ph; bar.setAttribute('aria-valuenow', String(pct));
    $('boss-fill').style.width = pct + '%';
    if ($('boss-label').textContent !== label) $('boss-label').textContent = label;
  }

  // ---- DOM: spots / journal ----
  function renderSpots() {
    const box = $('spots'); box.textContent = '';
    if (g.spot === COVE && !coveOpen()) g.spot = 'west';
    A.SPOTS.concat(coveOpen() ? [COVE] : []).forEach((id) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn' + (id === g.spot ? ' sel' : '');
      b.dataset.spot = id;
      const locked = spotLocked(id);
      b.textContent = spotName(id) + (locked ? ' (' + lockReason(id) + ')' : '');
      if (locked) { b.classList.add('locked'); b.setAttribute('aria-disabled', 'true'); }
      if (g.state !== 'idle') b.disabled = true;
      b.addEventListener('click', () => { if (locked) setMsg(spotName(id) + ': ' + lockReason(id) + '.'); else pickSpot(id); });
      box.appendChild(b);
    });
    if (ready) renderStatus();
  }
  const GEAR_NAMES = { stick: 'Stick', bamboo: 'Bamboo', steel: 'Steel', golden: 'Golden', none: 'No lure', worm: 'Worm', spinner: 'Spinner', glow: 'Glow', deep: 'Deep', shiny: 'Shiny', rainbow: 'Rainbow' };
  const LURE_HINT = { none: 'plain hook', worm: 'common fish', spinner: 'darting fish', glow: 'night fish', deep: 'bottom feeders', shiny: 'rare fish', rainbow: 'rain fish' };
  const BOSS_NAMES = { old_whiskers: 'Old Whiskers', pier_kraken: 'Pier Kraken', ice_queen_pike: 'Ice Queen Pike' };
  const PHASE_NAMES = { old_whiskers: ['Calm', 'Darting', 'Frenzy'], pier_kraken: ['Tentacle sweep', 'Ink rush'], ice_queen_pike: ['Ice dash', 'Frost swap'] };
  function weatherLabel() {
    const c = nowCtx(), night = c.hour >= 19 || c.hour < 6;
    return { icon: c.weather === 'clear' && night ? WX_ICON.night : WX_ICON[c.weather], name: c.weather === 'clear' && night ? 'clear night' : c.weather };
  }
  function renderStatus() {
    const w = weatherLabel();
    $('weather-icon').textContent = w.icon; $('weather-name').textContent = w.name;
    $('bait-val').textContent = String(journal.bait);
    $('bells-val').textContent = String(journal.bells);
    $('bait-type').textContent = BAIT_NAMES[journal.baitType] + ' x' + D.economy.baitCount(journal, journal.baitType);
    $('gear-sum').textContent = GEAR_NAMES[journal.gear.rod] + ' / ' + GEAR_NAMES[journal.gear.lure];
    const bs = $('bug-sum'), bt = journal.bugBait ? 'Bug bait: ' + I.BUG_BAITS[journal.bugBait].name : '';
    if (bs.textContent !== bt) bs.textContent = bt;
    bs.hidden = !bt;
    $('gear-btn').disabled = g.state !== 'idle';
  }
  function needText(r) {
    const p = [];
    if (r.species) p.push(r.species + ' species');
    if (r.trophies) p.push(r.trophies + ' boss trophy');
    return p.length ? 'Unlock: ' + p.join(' + ') : 'Starter';
  }
  function renderGear() {
    $('gear-rule').textContent = 'Gear unlocks as your journal grows: rods and lures need a number of species caught (golden rod needs a boss trophy). Rods widen the catch zone; lures shift what bites.';
    [['rod', 'rods', A.RODS], ['lure', 'lures', A.LURES]].forEach((k) => {
      const box = $(k[1]); box.textContent = '';
      Object.keys(k[2]).forEach((id) => {
        const ok = A.journal.gearUnlocked(journal, k[0], id), sel = journal.gear[k[0]] === id;
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'btn' + (sel ? ' sel' : '') + (ok ? '' : ' locked'); b.dataset[k[0]] = id;
        if (!ok) b.setAttribute('aria-disabled', 'true');
        const t = document.createElement('span'); t.textContent = GEAR_NAMES[id];
        const sm = document.createElement('small');
        sm.textContent = ok ? (k[0] === 'rod' ? 'zone ' + Math.round(k[2][id].zone * 100) + '%' : LURE_HINT[id]) : needText(A.GEAR_RULES[k[0]][id]);
        b.appendChild(t); b.appendChild(sm);
        b.addEventListener('click', () => setGear(k[0], id));
        box.appendChild(b);
      });
    });
    renderBugBaits();
  }
  // MG3 bait rows. Bug bait: one per Bug Safari species you have caught there (read-only), never used up, at most +10% bias.
  function gearBtn(label, hint, sel, fn, data) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn' + (sel ? ' sel' : '');
    Object.keys(data).forEach((k) => { b.dataset[k] = data[k]; });
    b.setAttribute('aria-pressed', sel ? 'true' : 'false');
    const t = document.createElement('span'); t.textContent = label;
    const sm = document.createElement('small'); sm.textContent = hint;
    b.appendChild(t); b.appendChild(sm); b.addEventListener('click', fn); return b;
  }
  function renderBugBaits() {
    const box = $('bugbaits'); box.textContent = '';
    const have = I.bug.unlocked(bugsRaw());
    box.appendChild(gearBtn('No bug bait', 'plain hook', !journal.bugBait, () => setBugBait(''), { bug: '' }));
    have.forEach((id) => box.appendChild(gearBtn(I.BUG_BAITS[id].name, I.BUG_BAITS[id].hint, journal.bugBait === id, () => setBugBait(id), { bug: id })));
    $('bug-rule').textContent = have.length
      ? have.length + ' bug bait(s) from your Bug Safari journal. They are never used up, and Bug Safari keeps every bug. Each nudges its fish by at most 10%.'
      : 'Catch bugs in Bug Safari and each species becomes a bug bait here. Bug Safari keeps every bug.';
    const open = coveOpen();
    $('cove-gear').hidden = !open;
    const cb = $('covebaits'); cb.textContent = '';
    if (!open) return;
    cb.appendChild(gearBtn('No cove bait', 'open-water fish', !journal.coveBait, () => setCoveBait(''), { coveBait: '' }));
    A.COVE_BAITS.forEach((id) => {
      const wants = A.COVE_FISH.filter((f) => f.bait === id).length;
      cb.appendChild(gearBtn(I.COVE_BAIT_NAMES[id], wants + ' cove fish want it', journal.coveBait === id, () => setCoveBait(id), { coveBait: id }));
    });
  }
  function setBugBait(id) {
    if (g.state !== 'idle') return false;
    const r = I.bug.set(journal, id, bugsRaw());
    if (r.ok) { journal = r.journal; saveJournal(); renderBugBaits(); renderStatus(); }
    return r.ok;
  }
  function setCoveBait(id) {
    if (g.state !== 'idle') return false;
    const r = I.cove.setBait(journal, id);
    if (r.ok) { journal = r.journal; saveJournal(); renderBugBaits(); }
    return r.ok;
  }
  function setGear(kind, id) {
    if (g.state !== 'idle' || (kind !== 'rod' && kind !== 'lure') || !A.journal.gearUnlocked(journal, kind, id)) return false;
    journal.gear[kind] = id; saveJournal(); renderGear(); renderStatus(); return true;
  }
  function renderBossInfo() {
    const box = $('bossinfo'); box.textContent = '';
    A.SPOTS.forEach((sp) => {
      const b = A.journal.bossFor(journal, sp); if (!b) return;
      const p = document.createElement('p'); p.style.margin = '2px 0';
      const won = journal.trophies[b.boss];
      p.textContent = (won ? '\uD83C\uDFC6 ' : '') + BOSS_NAMES[b.boss] + ' (' + A.SPOT_NAMES[sp] + '): ' + (b.ready ? 'lurking now' : 'catch ' + b.need + ' species here to lure it out') + ' - ' + Math.min(b.have, b.need) + '/' + b.need + (won ? ' - TROPHY - CAUGHT' : '');
      if (won) p.className = 'trophy';
      box.appendChild(p);
    });
  }
  function renderJournalCount() {
    const n = A.journal.speciesCount(journal);
    $('journal-count').textContent = n + '/' + A.FISH.length;
    $('jsum').textContent = n + ' of ' + A.FISH.length + ' species';
  }
  function initFilters() {
    const fs = $('f-spot'), fr = $('f-rarity');
    const opt = (sel, v, t) => { const o = document.createElement('option'); o.value = v; o.textContent = t; sel.appendChild(o); };
    opt(fs, 'all', 'All spots'); A.SPOTS.forEach((s) => opt(fs, s, A.SPOT_NAMES[s]));
    opt(fr, 'all', 'All rarities'); for (let i = 1; i <= 5; i++) opt(fr, String(i), RARITY[i]);
    fs.addEventListener('change', renderJournal); fr.addEventListener('change', renderJournal);
    $('calm').addEventListener('change', (e) => { g.calm = e.target.checked; });
  }
  function renderJournal() {
    const grid = $('jgrid'); grid.textContent = '';
    const sp = $('f-spot').value, ra = $('f-rarity').value;
    A.FISH.forEach((f) => {
      if (sp !== 'all' && f.spots.indexOf(sp) < 0) return;
      if (ra !== 'all' && String(f.rarity) !== ra) return;
      const e = journal.caught[f.id];
      const card = document.createElement('div'); card.className = 'card' + (e ? '' : ' unk'); card.dataset.id = f.id;
      const c = document.createElement('canvas'); c.width = 48; c.height = 28;
      const cx = c.getContext('2d'); cx.imageSmoothingEnabled = false;
      drawFish(cx, 24, 14, 16, f, !e);
      const nm = document.createElement('div'); nm.className = 'nm' + (e ? ' r' + f.rarity : ''); nm.textContent = e ? f.name + (f.boss ? ' (CAUGHT)' : '') : '???';
      if (e && f.boss) card.classList.add('boss-caught');
      const sub = document.createElement('div'); sub.className = 'sub';
      sub.textContent = e ? 'x' + e.n + ' best ' + e.best + ' cm - ' + RARITY[f.rarity] : RARITY[f.rarity];
      card.appendChild(c); card.appendChild(nm); card.appendChild(sub); grid.appendChild(card);
    });
  }
  function openJournal() { renderBossInfo(); renderJournal(); $('journal').hidden = false; $('journal-close').focus(); }
  function closeJournal() { $('journal').hidden = true; $('journal-btn').focus(); }
  $('journal-btn').addEventListener('click', openJournal);
  $('journal-close').addEventListener('click', closeJournal);
  function openGear() { if (g.state !== 'idle') return; renderGear(); $('gear').hidden = false; $('gear-close').focus(); }
  function closeGear() { $('gear').hidden = true; $('gear-btn').focus(); }
  $('gear-btn').addEventListener('click', openGear);
  $('gear-close').addEventListener('click', closeGear);
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('journal').hidden) closeJournal(); else if (!$('gear').hidden) closeGear();
    else ['tourney', 'market', 'aquarium'].forEach((id) => { if (!$(id).hidden) closeOverlay(id); });
  });

  // ---- depth: tournament / market / aquarium ----
  const BAIT_NAMES = { plain: 'Plain', quick: 'Quick-bite', rare: 'Rare-lure', big: 'Big-fish' };
  function totalCaught() { let n = 0; Object.keys(journal.caught).forEach((id) => { n += journal.caught[id].n; }); return n; }
  function afterTourCast() {
    const run = journal.tour.run;
    if (run && run.used >= D.CASTS) {
      const r = D.tournament.finish(journal, today());
      if (r.result) { journal = r.journal; saveJournal(); g.tourResult = r.result; g.tour = false; renderStatus(); }
    }
  }
  function mk(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
  function btn(text, fn, disabled) {
    const b = mk('button', 'btn', text); b.type = 'button'; b.disabled = !!disabled;
    b.addEventListener('click', fn); return b;
  }
  const fishName = (id) => A.BY_ID[id].icon + ' ' + A.BY_ID[id].name;
  function startTournament() {
    if (g.state !== 'idle') return false;
    const day = today(), r = D.tournament.start(journal, day);
    if (!r.ok) return false;
    journal = r.journal; saveJournal();
    g.tour = true; g.tourResult = null;
    g.spot = D.tournament.forDay(day).spot; $('spot-title').textContent = spotName(g.spot);
    closeOverlay('tourney'); renderSpots(); renderStatus();
    setMsg('Tournament: cast ' + (journal.tour.run.used + 1) + '/' + D.CASTS + ' at ' + spotName(g.spot) + '.');
    return true;
  }
  function renderTourney() {
    const box = $('tourney-body'); box.textContent = '';
    const day = today(), t = D.tournament.forDay(day), tr = journal.tour, done = tr.last === day;
    box.appendChild(mk('p', 'rule', 'Day ' + day + ' - same fish and bites for every angler. ' + D.CASTS + ' casts, score = size x rarity (target species counts double).'));
    box.appendChild(mk('p', '', 'Spot: ' + A.SPOT_NAMES[t.spot] + ' - Target: ' + fishName(t.target)));
    box.appendChild(mk('p', 'rule', 'Ranks: bronze ' + D.RANKS.bronze + ', silver ' + D.RANKS.silver + ', gold ' + D.RANKS.gold + ' points.'));
    box.appendChild(mk('p', '', 'Streak: ' + D.tournament.liveStreak(journal, day) + ' day(s) - Played: ' + tr.played + ' - Best: ' + tr.best.score));
    box.appendChild(mk('p', 'rule', 'Medals: ' + tr.medals.bronze + ' bronze, ' + tr.medals.silver + ' silver, ' + tr.medals.gold + ' gold.'));
    const bd = Object.keys(journal.badges).map((k) => D.BADGE_TITLES[k] || (k.indexOf('set_') === 0 ? A.SPOT_NAMES[k.slice(4)] + ' set' : k));
    box.appendChild(mk('p', 'rule', 'Badges: ' + (bd.length ? bd.join(', ') : 'none yet') + '. Cosmetic only.'));
    if (g.tourResult) {
      const r = g.tourResult, rp = mk('p', 'rank rank-' + r.rank);
      rp.id = 'tour-result';
      rp.textContent = 'Final: ' + r.score + ' points - ' + (r.rank === 'none' ? 'no medal this time' : r.rank.toUpperCase() + ' medal') + ' - streak ' + r.streak
        + (r.badges.length ? ' - new badge: ' + r.badges.map((k) => D.BADGE_TITLES[k]).join(', ') : '');
      box.appendChild(rp);
    } else if (g.tour && tr.run) {
      box.appendChild(mk('p', '', 'In progress: ' + tr.run.used + '/' + D.CASTS + ' casts, ' + tr.run.score + ' points.'));
    } else if (done) {
      box.appendChild(mk('p', 'rule', 'Today\'s tournament is complete. A new one starts with the next calendar day.'));
    } else {
      const b = btn(tr.run && tr.run.day === day ? 'Resume (' + tr.run.used + '/' + D.CASTS + ')' : 'Start tournament', startTournament, g.state !== 'idle');
      b.id = 'tour-start'; b.classList.add('primary'); box.appendChild(b);
    }
  }
  function openOverlay(id, render) { if (g.state !== 'idle' && g.state !== 'result') return false; render(); $(id).hidden = false; const c = $(id + '-close'); if (c) c.focus(); return true; }
  function closeOverlay(id) { $(id).hidden = true; const o = $(id + '-btn'); if (o && !TEST) o.focus(); }
  function openTourney() { return openOverlay('tourney', renderTourney); }
  function renderMarket() {
    $('market-bells').textContent = String(journal.bells);
    const sb = $('market-sell'); sb.textContent = '';
    const ids = Object.keys(journal.stock);
    if (!ids.length) sb.appendChild(mk('p', 'rule', 'No fish to sell. Catch some first.'));
    ids.forEach((id) => {
      const row = mk('div', 'row'); row.dataset.id = id;
      row.appendChild(mk('span', 'grow', fishName(id) + ' x' + journal.stock[id] + ' (' + D.economy.sellPrice(id) + ' bells each)'));
      const b1 = btn('Sell 1', () => marketSell(id, 1)); b1.dataset.act = 'sell1';
      const b2 = btn('Sell all', () => marketSell(id, 99)); b2.dataset.act = 'sellall';
      row.appendChild(b1); row.appendChild(b2); sb.appendChild(row);
    });
    const bb = $('market-buy'); bb.textContent = '';
    Object.keys(D.BAIT_PRICE).forEach((type) => {
      const row = mk('div', 'row'); row.dataset.bait = type;
      row.appendChild(mk('span', 'grow', BAIT_NAMES[type] + ' bait x' + D.economy.baitCount(journal, type) + ' - ' + D.BAIT_INFO[type] + ' - ' + D.BAIT_PRICE[type] + ' bells'));
      const bu = btn('Buy 1', () => marketBuy(type, 1)); bu.dataset.act = 'buy';
      const eq = btn(journal.baitType === type ? 'Equipped' : 'Equip', () => marketEquip(type)); eq.dataset.act = 'equip';
      if (journal.baitType === type) eq.classList.add('sel');
      row.appendChild(bu); row.appendChild(eq); bb.appendChild(row);
    });
    bb.appendChild(mk('p', 'rule', 'Caps: ' + D.CAPS.bait + ' of each bait, ' + D.CAPS.bells + ' bells. Bells are play money earned only by selling fish.'));
  }
  function marketSell(id, n) { const r = D.economy.sell(journal, id, n); journal = r.journal; saveJournal(); renderMarket(); renderStatus(); return r.ok; }
  function marketBuy(type, n) { const r = D.economy.buy(journal, type, n); journal = r.journal; saveJournal(); renderMarket(); renderStatus(); return r.ok; }
  function marketEquip(type) { journal = D.economy.setBaitType(journal, type); saveJournal(); renderMarket(); renderStatus(); return true; }
  function openMarket() { return openOverlay('market', renderMarket); }
  function renderAquarium() {
    const box = $('aq-body'); box.textContent = '';
    A.SPOTS.forEach((sp) => {
      const st = D.aquarium.spotSet(journal, sp), sec = mk('section', 'aqspot'); sec.dataset.spot = sp;
      sec.appendChild(mk('h3', '', A.SPOT_NAMES[sp] + ' ' + st.have + '/' + st.total + (st.claimed ? ' - complete set' : '')));
      const grid = mk('div', 'aqgrid');
      A.FISH.filter((f) => f.spots.indexOf(sp) >= 0 && !f.boss && !f.secret).forEach((f) => {
        const e = journal.caught[f.id], c = mk('span', 'chip' + (e ? ' r' + f.rarity : ' unk'), e ? f.icon + ' ' + f.name + ' ' + e.best + ' cm' : '???');
        c.dataset.id = f.id; grid.appendChild(c);
      });
      sec.appendChild(grid);
      if (st.complete && !st.claimed) { const b = btn('Complete set! Claim +' + st.bonus + ' bells', () => claimSet(sp)); b.dataset.act = 'claim'; b.classList.add('primary'); sec.appendChild(b); }
      else if (!st.complete) sec.appendChild(mk('p', 'rule', 'Catch every regular species here for a set bonus of ' + st.bonus + ' bells and a badge.'));
      box.appendChild(sec);
    });
    const hall = mk('section', 'aqspot'); hall.id = 'hall'; hall.appendChild(mk('h3', '', 'Hall of Records (boss fish, kept on this device only)'));
    D.aquarium.hallOfRecords(journal).forEach((b) => {
      const he = B.hallEntry(journal, b.id);
      const r = mk('p', 'rule' + (b.trophy ? ' trophy' : ''), (b.trophy ? '🏆 ' : '') + b.name + ' (' + A.SPOT_NAMES[b.spot] + '): ' + (b.caught ? 'caught x' + b.n + ', record ' + b.best + ' cm' + (he ? ' - trophy: ' + he.size + ' cm on ' + he.date : '') : 'not yet caught'));
      r.dataset.id = b.id; hall.appendChild(r);
    });
    box.appendChild(hall);
    // MG3: Isles cove collection (only once the cove is open) and the decor tank
    if (coveOpen() || I.cove.count(journal) > 0) {
      const cs = mk('section', 'aqextra'); cs.id = 'aq-cove';
      cs.appendChild(mk('h3', '', 'Isles Cove ' + I.cove.count(journal) + '/' + A.COVE_FISH.length));
      const grid = mk('div', 'aqgrid');
      A.COVE_FISH.forEach((f) => {
        const e = journal.cove[f.id];
        const c = mk('span', 'chip' + (e ? ' r' + f.rarity : ' unk'), e ? f.icon + ' ' + f.name + ' ' + e.best + ' cm' : '???' + (f.bait ? ' (' + I.COVE_BAIT_NAMES[f.bait] + ' bait)' : ''));
        c.dataset.cove = f.id; grid.appendChild(c);
      });
      cs.appendChild(grid);
      cs.appendChild(mk('p', 'rule', 'Cove fish are for the collection only: they are not sold and use no Market bait.'));
      box.appendChild(cs);
    }
    renderDecor(box);
  }
  function renderDecor(box) {
    const ds = mk('section', 'aqextra'); ds.id = 'aq-decor';
    ds.appendChild(mk('h3', '', 'Tank decor'));
    const cv2 = document.createElement('canvas'); cv2.id = 'aq-tank'; cv2.width = 160; cv2.height = 80;
    cv2.setAttribute('role', 'img');
    const list = I.decor.list(journal, bugsRaw()), shown = list.filter((d) => d.shown);
    cv2.setAttribute('aria-label', 'Your tank' + (shown.length ? ' with ' + shown.map((d) => d.name).join(', ') : ', no decor on show'));
    ds.appendChild(cv2);
    drawTank(cv2.getContext('2d'), shown.map((d) => d.id));
    const row = mk('div', 'gearrow');
    list.forEach((d) => {
      const b = gearBtn(d.name, d.unlocked ? (d.shown ? 'on show - tap to put away' : 'tap to show') : d.need, d.shown, () => toggleDecor(d.id), { decor: d.id });
      if (!d.unlocked) { b.classList.add('locked'); b.setAttribute('aria-disabled', 'true'); }
      row.appendChild(b);
    });
    ds.appendChild(row);
    ds.appendChild(mk('p', 'rule', 'Decor unlocks from your journal and stays yours. Nothing to buy, nothing to lose.'));
    box.appendChild(ds);
  }
  function toggleDecor(id) {
    const r = I.decor.toggle(journal, id, bugsRaw());
    if (r.ok) { journal = r.journal; saveJournal(); renderAquarium(); }
    return r.ok;
  }
  // Static code art, drawn once per render (no animation loop).
  function drawTank(c, ids) {
    c.imageSmoothingEnabled = false;
    c.fillStyle = '#1e6f99'; c.fillRect(0, 0, 160, 80);
    c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(0, 0, 160, 6);
    c.fillStyle = '#d8c48a'; c.fillRect(0, 70, 160, 10);
    c.fillStyle = '#c4ae72'; for (let x = 4; x < 160; x += 11) c.fillRect(x, 72 + (x % 3), 3, 2);
    const has = (id) => ids.indexOf(id) >= 0;
    if (has('kelp_forest')) { c.fillStyle = '#2f8f4e'; [8, 14, 20].forEach((x, i) => { for (let y = 70; y > 30 + i * 6; y -= 4) c.fillRect(x + ((y >> 2) % 2), y - 4, 3, 4); }); }
    if (has('coral_arch')) { c.fillStyle = '#ff7f6e'; c.fillRect(34, 50, 5, 20); c.fillRect(54, 50, 5, 20); c.fillRect(34, 46, 25, 5); c.fillStyle = '#ffb3a6'; c.fillRect(36, 47, 4, 2); }
    if (has('river_stones')) { c.fillStyle = '#7d8a91'; c.fillRect(66, 64, 10, 6); c.fillStyle = '#9aa7ad'; c.fillRect(77, 66, 7, 4); c.fillRect(70, 61, 5, 3); }
    if (has('tiny_castle')) { c.fillStyle = '#b9a58c'; c.fillRect(90, 44, 22, 26); c.fillRect(88, 40, 5, 6); c.fillRect(98, 40, 5, 6); c.fillRect(108, 40, 5, 6); c.fillStyle = '#3b2f2a'; c.fillRect(98, 58, 6, 12); }
    if (has('sunken_chest')) { c.fillStyle = '#8a5a34'; c.fillRect(118, 60, 16, 10); c.fillStyle = '#e2b84a'; c.fillRect(118, 63, 16, 2); c.fillRect(125, 62, 2, 5); }
    if (has('pearl_clam')) { c.fillStyle = '#b48fc9'; c.fillRect(138, 64, 14, 6); c.fillRect(140, 58, 10, 5); c.fillStyle = '#f4f1ea'; c.fillRect(144, 61, 3, 3); }
    if (has('lily_pad')) { c.fillStyle = '#4caf50'; c.fillRect(60, 3, 18, 4); c.fillStyle = '#ffc0d0'; c.fillRect(66, 1, 4, 3); }
    if (has('bug_lantern')) { c.fillStyle = '#5a3a1a'; c.fillRect(150, 0, 2, 14); c.fillStyle = '#ffe08a'; c.fillRect(146, 14, 10, 8); c.fillStyle = '#fff6c8'; c.fillRect(149, 16, 3, 3); }
    // a few caught fish, fixed positions
    const caught = A.FISH.filter((f) => journal.caught[f.id] && !f.boss).concat(A.COVE_FISH.filter((f) => journal.cove[f.id])).slice(0, 5);
    caught.forEach((f, i) => drawFish(c, 30 + i * 26, 18 + (i % 2) * 16, 6, f, false));
  }
  function claimSet(sp) { const r = D.aquarium.claimSet(journal, sp); journal = r.journal; saveJournal(); renderAquarium(); renderStatus(); return r.ok; }
  function openAquarium() { return openOverlay('aquarium', renderAquarium); }
  ['tourney', 'market', 'aquarium'].forEach((id) => {
    $(id + '-btn').addEventListener('click', () => { if (id === 'tourney') openTourney(); else if (id === 'market') openMarket(); else openAquarium(); });
    $(id + '-close').addEventListener('click', () => closeOverlay(id));
  });

  // ---- drawing ----
  function hashOf(s) { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
  function drawFish(c, x, y, s, f, silhouette) {
    const h = hashOf(f.id), hue = h % 360, flat = f.behaviour === 'sinker', long = (h >> 3) % 3;
    const body = silhouette ? '#10202c' : 'hsl(' + hue + ',60%,' + (45 + f.rarity * 3) + '%)';
    const fin = silhouette ? '#10202c' : 'hsl(' + hue + ',65%,30%)';
    const bw = s * (1 + long * 0.18), bh = s * (flat ? 0.4 : 0.6);
    c.fillStyle = fin;
    c.beginPath(); c.moveTo(x - bw * 0.7, y); c.lineTo(x - bw * 1.2, y - bh * 0.7); c.lineTo(x - bw * 1.2, y + bh * 0.7); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(x - bw * 0.1, y - bh * 0.4); c.lineTo(x + bw * 0.2, y - bh * 0.9); c.lineTo(x + bw * 0.4, y - bh * 0.4); c.closePath(); c.fill();
    c.fillStyle = body;
    c.beginPath(); c.ellipse(x, y, bw * 0.8, bh * 0.5, 0, 0, Math.PI * 2); c.fill();
    if (!silhouette) {
      c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(x - bw * 0.4, y + bh * 0.1, bw * 0.7, Math.max(1, bh * 0.12));
      c.fillStyle = '#fff'; c.fillRect(x + bw * 0.4, y - bh * 0.2, Math.max(1.5, s * 0.1), Math.max(1.5, s * 0.1));
      c.fillStyle = '#111'; c.fillRect(x + bw * 0.5, y - bh * 0.12, Math.max(1, s * 0.05), Math.max(1, s * 0.05));
    }
  }
  const BX = 200, BY = 255;
  function draw() {
    const c = ctx, t = g.t;
    const night = nowCtx().hour >= 19 || nowCtx().hour < 6;
    c.fillStyle = night ? '#16213f' : '#7cc7ee'; c.fillRect(0, 0, W, WATER);
    c.fillStyle = night ? '#2a3a66' : '#a9dcf5'; c.fillRect(0, 100, W, 70);
    c.fillStyle = night ? '#1d2d4a' : '#5aa56a'; c.beginPath(); c.moveTo(0, WATER); c.lineTo(0, 130); c.lineTo(80, 100); c.lineTo(170, 135); c.lineTo(260, 95); c.lineTo(W, 125); c.lineTo(W, WATER); c.fill();
    if (night) { c.fillStyle = '#fff'; for (let i = 0; i < 14; i++) c.fillRect((i * 53) % W, (i * 29) % 80, 2, 2); }
    else { c.fillStyle = '#fff'; c.fillRect(40, 62, 40, 10); c.fillRect(50, 56, 24, 8); c.fillRect(150, 74, 44, 10); }
    // water
    const spotHue = { west: '#2f86c7', east: '#2a78a8', river: '#3a9bb5', pier: '#1f5f9e', ice: '#9fd6ea', mangrove: '#2c7f6a', cove: '#1d9aa6' }[g.spot];
    c.fillStyle = spotHue; c.fillRect(0, WATER, W, H - WATER);
    if (g.spot === COVE) { c.fillStyle = '#ff8f7a'; [24, 120, 236, 300].forEach((x, i) => { c.fillRect(x, H - 30 - i * 3, 6, 30 + i * 3); c.fillRect(x - 5, H - 22 - i * 3, 5, 4); c.fillRect(x + 6, H - 16 - i * 3, 5, 4); }); }
    c.fillStyle = 'rgba(0,0,0,.12)';
    for (let y = WATER + 16; y < H; y += 24) c.fillRect(0, y, W, 8);
    if (!reduced() && !gfx.low) { // water shimmer: off with reduced motion and on the low tier
      c.fillStyle = 'rgba(255,255,255,.22)';
      for (let i = 0; i < 18; i++) {
        const yy = WATER + 10 + ((i * 37) % (H - WATER - 20)), xx = ((i * 71 + t * 14 * (1 + (i % 3) * 0.3)) % (W + 30)) - 15;
        c.fillRect(xx, yy, 14, 2);
      }
    }
    if (g.spot === 'ice') { c.fillStyle = 'rgba(255,255,255,.4)'; c.fillRect(0, WATER, W, 6); }
    const wx = nowCtx().weather;
    if (wx === 'cloudy' || wx === 'rain') { c.fillStyle = 'rgba(70,80,95,.45)'; c.fillRect(0, 0, W, 90); }
    if (wx === 'rain' || wx === 'snow') {
      c.fillStyle = wx === 'rain' ? 'rgba(200,225,255,.7)' : 'rgba(255,255,255,.85)';
      const drift = reduced() ? 0 : t * (wx === 'rain' ? 160 : 30);
      for (let i = 0; i < gfx.drops; i++) {
        const xx = (i * 47) % W, yy = ((i * 83 + drift) % (WATER + 60));
        if (wx === 'rain') c.fillRect(xx, yy, 1, 7); else c.fillRect(xx, yy, 2, 2);
      }
    }
    // dock + angler
    c.fillStyle = '#8a5a34'; c.fillRect(0, 150, 96, 14); c.fillStyle = '#6b4226'; c.fillRect(0, 164, 96, 4);
    c.fillStyle = '#d9534f'; c.fillRect(40, 118, 14, 18); c.fillStyle = '#f1c9a5'; c.fillRect(42, 106, 10, 10); c.fillStyle = '#e2b84a'; c.fillRect(40, 102, 14, 5);
    c.fillStyle = '#334'; c.fillRect(42, 136, 4, 14); c.fillRect(48, 136, 4, 14);
    const tipX = 88, tipY = g.state === 'reeling' ? 86 : 96;
    c.strokeStyle = '#5a3a1a'; c.lineWidth = 2; c.beginPath(); c.moveTo(52, 124); c.lineTo(tipX, tipY); c.stroke();
    const active = g.state === 'waiting' || g.state === 'biting' || g.state === 'reeling';
    const bx = g.state === 'reeling' ? BX - 20 : BX, by = (g.state === 'reeling' ? 215 : BY) + g.bobY;
    if (active) {
      c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 1; c.beginPath(); c.moveTo(tipX, tipY); c.quadraticCurveTo((tipX + bx) / 2, tipY - 10, bx, by - 3); c.stroke();
      c.fillStyle = '#fff'; c.fillRect(bx - 4, by - 3, 8, 6); c.fillStyle = '#e63946'; c.fillRect(bx - 4, by - 8, 8, 5);
      c.fillStyle = 'rgba(255,255,255,.5)'; c.fillRect(bx - 10, by + 4, 20, 2);
      if (g.state === 'biting') { c.fillStyle = '#ffd166'; c.font = 'bold 30px sans-serif'; c.textAlign = 'center'; c.fillText('!', bx, by - 20); }
    } else if (g.state === 'idle') {
      c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 1; c.beginPath(); c.moveTo(tipX, tipY); c.lineTo(tipX + 4, 150); c.stroke();
    }
    if (g.state === 'reeling' && g.reel) drawReel(c);
    if (g.splash && g.state === 'reeling') drawSplash(c);
    if (g.fan && g.state === 'result') drawFanfare(c);
    if (g.state === 'result' && g.result && g.result.outcome === 'caught') drawFish(c, W / 2, 290, 46, g.fish, false);
    if (g.state === 'idle' || g.state === 'result') {
      c.fillStyle = 'rgba(0,0,0,.35)'; c.font = '12px sans-serif'; c.textAlign = 'left'; c.fillText(spotName(g.spot), 8, 18);
    }
  }
  // boss splash: expanding ripple rings; with reduce-motion one static ring and a label
  function drawSplash(c) {
    const t = g.splash.t, cx = BX - 20, cy = 215 + 24;
    c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 2;
    if (reduced()) {
      c.beginPath(); c.ellipse(cx, cy, 34, 12, 0, 0, Math.PI * 2); c.stroke();
      c.fillStyle = '#fff'; c.font = 'bold 12px sans-serif'; c.textAlign = 'center'; c.fillText('SPLASH!', cx, cy - 18);
      return;
    }
    if (t > 2) return;
    for (let i = 0; i < gfx.rings; i++) {
      const k = t - i * 0.25; if (k < 0) continue;
      c.globalAlpha = Math.max(0, 1 - k / 1.4);
      c.beginPath(); c.ellipse(cx, cy, 8 + k * 50, 3 + k * 18, 0, 0, Math.PI * 2); c.stroke();
    }
    c.globalAlpha = 1;
  }
  function drawFanfare(c) {
    const f = g.fan, rare = ['', '#cfd8dc', '#8fe08f', '#6db8ff', '#c88bff', '#ffc24a'][g.fish.rarity];
    c.fillStyle = rare; c.textAlign = 'center';
    if (reduced()) { c.font = 'bold 22px sans-serif'; c.fillText('\u2605 CAUGHT \u2605', W / 2, 226); return; } // no motion
    if (f.t > 1.4) return;
    const n = Math.min(f.big ? 28 : 14, gfx.cap);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, rr = f.t * (70 + (i % 4) * 25);
      c.globalAlpha = Math.max(0, 1 - f.t / 1.4);
      c.fillRect(W / 2 + Math.cos(a) * rr - 2, 290 + Math.sin(a) * rr * 0.8 - 2, 4, 4);
    }
    c.globalAlpha = 1;
  }
  function drawReel(c) {
    const r = g.reel, bx = 268, bw = 34, top = 60, bot = 440, hgt = bot - top;
    const yOf = (v) => bot - v * hgt;
    c.fillStyle = 'rgba(8,20,30,.78)'; c.fillRect(bx - 6, top - 8, bw + 12, hgt + 16);
    c.fillStyle = '#12384f'; c.fillRect(bx, top, bw, hgt);
    const zTop = yOf(Math.min(1, r.tension + r.zone / 2)), zBot = yOf(Math.max(0, r.tension - r.zone / 2));
    const ok = r.inZone();
    c.fillStyle = ok ? 'rgba(111,227,160,.65)' : 'rgba(255,209,102,.5)'; c.fillRect(bx, zTop, bw, zBot - zTop);
    c.strokeStyle = ok ? '#6fe3a0' : '#ffd166'; c.lineWidth = 2; c.strokeRect(bx, zTop, bw, zBot - zTop);
    // snap danger at top
    const danger = Math.min(1, r.atMax / r.snapLimit);
    c.fillStyle = 'rgba(255,60,60,' + (0.25 + 0.6 * danger) + ')'; c.fillRect(bx, top, bw, 10);
    if (danger > 0) { c.fillStyle = '#ff6b6b'; c.fillRect(bx - 4, top - 6, (bw + 8) * danger, 4); }
    drawFish(c, bx + bw / 2 + r.side * 24, yOf(r.pos), 12, g.fish, false);
    if (r.side) { c.fillStyle = '#ff9f1c'; c.font = 'bold 14px sans-serif'; c.textAlign = 'center'; c.fillText(r.side > 0 ? '>>' : '<<', bx + bw / 2 + r.side * 24, yOf(r.pos) - 12); }
    // catch meter, horizontal
    c.fillStyle = 'rgba(8,20,30,.78)'; c.fillRect(20, 14, 200, 18);
    c.fillStyle = '#12384f'; c.fillRect(24, 18, 192, 10);
    c.fillStyle = '#6fe3a0'; c.fillRect(24, 18, 192 * r.meter, 10);
    c.fillStyle = '#fff'; c.font = '10px sans-serif'; c.textAlign = 'left'; c.fillText('CATCH', 24, 44);
    if (r.boss) {
      const names = PHASE_NAMES[g.fish.id] || [], nph = names.length || 1;
      c.fillStyle = 'rgba(8,20,30,.78)'; c.fillRect(20, 52, 200, 34);
      c.fillStyle = '#4a1d1d'; c.fillRect(24, 68, 192, 8);
      c.fillStyle = '#e63946'; c.fillRect(24, 68, 192 * (1 - r.meter), 8);
      c.fillStyle = '#ffd166'; c.font = 'bold 11px sans-serif'; c.textAlign = 'left';
      c.fillText((BOSS_NAMES[g.fish.id] || g.fish.name).toUpperCase() + ' HP', 24, 64);
      const flash = !reduced() && g.t - g.phaseAt < 1.2;
      c.fillStyle = flash ? 'rgba(255,209,102,.95)' : 'rgba(8,20,30,.78)'; c.fillRect(60, 92, 120, 20);
      c.fillStyle = flash ? '#0b1b27' : '#ffd166'; c.textAlign = 'center';
      c.fillText('Phase ' + (r.phase + 1) + '/' + nph + ': ' + (names[r.phase] || ''), 120, 106);
    }
  }

  // ---- loop ----
  let last = 0;
  function frame(ts) {
    if (!last) last = ts;
    const dt = Math.min(0.05, (ts - last) / 1000); last = ts;
    pollPad(); step(dt); draw(); requestAnimationFrame(frame);
  }

  // ---- init ----
  ready = true; initFilters(); renderSpots(); renderJournalCount(); renderStatus();
  $('spot-title').textContent = spotName(g.spot); setMsg(idleMsg());
  draw();
  if (TEST) {
    window.__angler = {
      get state() { return g.state; }, get result() { return g.result; }, get reel() { return g.reel; },
      get bite() { return g.bite; }, get journal() { return A.journal.clean(journal); }, get full() { return journal; }, get spot() { return g.spot; },
      get reduced() { return reduced(); }, get bobY() { return g.bobY; },
      get gfx() { return { tier: gfx.tier, low: gfx.low, dpr: gfx.dpr, cap: gfx.cap === Infinity ? null : gfx.cap, drops: gfx.drops, rings: gfx.rings }; },
      setHold(v) { setInput('test', !!v); },
      tap() { setInput('test', true); setInput('test', false); },
      advance(sec) { let n = Math.round(sec * 60); while (n-- > 0) step(1 / 60); draw(); },
      setDate, pickSpot, spotLocked, renderSpots, forceFish(id) { g.forced = id; },
      dismiss, redraw: draw, rng, setWeather, setGear, renderStatus,
      get gear() { return journal.gear; }, get bait() { return journal.bait; }, get weather() { return nowCtx().weather; },
      get boss() { return g.boss; }, get phase() { return g.reel ? g.reel.phase : -1; }, get fish() { return g.fish && g.fish.id; },
      get fanfare() { return { reduced: reduced(), active: !!g.fan, t: g.fan ? g.fan.t : 0 }; },
      get day() { return today(); }, setDay(n) { dayOverride = D.clampDay(n, null); if (ready) { renderStatus(); } return today(); },
      tourney: { start: startTournament, open: openTourney, info: () => D.tournament.forDay(today()), get active() { return g.tour; }, get run() { return journal.tour.run; }, get result() { return g.tourResult; }, get state() { return journal.tour; } },
      market: { open: openMarket, sell: marketSell, buy: marketBuy, equip: marketEquip, get bells() { return journal.bells; }, get stock() { return journal.stock; }, get baits() { return journal.baits; }, get baitType() { return journal.baitType; } },
      aquarium: { open: openAquarium, claim: claimSet },
      isles: { setBugBait, setCoveBait, toggleDecor, openGear, coveOpen, bugBaits: () => I.bug.unlocked(bugsRaw()), decor: () => I.decor.list(journal, bugsRaw()), get bugBait() { return journal.bugBait; }, get coveBait() { return journal.coveBait; }, get cove() { return journal.cove; } },
      setBossChance(p) { g.bossChance = p; if (p >= 1) g.bossGate = false; }, setBossGate(v) { g.bossGate = !!v; },
      boss2: { get gate() { return g.bossGate; }, get surge() { return g.surge; }, get strain() { return g.strain; }, get splash() { return g.splash; }, get lair() { return journal.lair; }, get hall() { return journal.hall; }, phase() { return g.surge ? B.phaseAt(g.surge, g.t) : 'calm'; }, get time() { return g.t; }, openJournal, todayStr }, bossFor(sp) { return A.journal.bossFor(journal, sp || g.spot); },
      poolInfo() {
        const c = nowCtx(), p = A.pool(g.spot, c, {}), gear = { lure: journal.gear.lure, bait: false };
        return { ids: p.map((f) => f.id), weights: p.map((f) => A.weightOf(f, c, gear)) };
      },
      setJournal(j) { journal = A.journal.cleanFull(j); fixGear(); saveJournal(); renderStatus(); renderJournalCount(); renderSpots(); },
    };
  } else {
    requestAnimationFrame(frame);
  }
})();
