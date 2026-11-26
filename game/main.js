const FRAME_SIZE = 24;
const FRAME_COUNT = 9;
const HOP_HEIGHT = 5; // px of vertical lift at the peak of a walk hop
const HOP_SPEED = 9; // radians/sec the hop phase advances while moving

// ---------- safety: block slurs in names/chat ----------
// This game's database is intentionally wide-open (see README) so it can
// stay a free, server-less static site — anyone with the link can write
// to it directly over the Firebase REST API, bypassing this client
// entirely. That means this filter can stop an honest player's own typo
// from this page, and can mask an attacker's text once it arrives so it
// doesn't render raw on screen, but it is NOT a security boundary: a
// determined bad actor can still write slurs straight into the database.
// The real fix for that is tightening the Firebase rules (README has the
// steps) and/or adding real auth. Keep the list itself short and specific
// to slurs, not everyday profanity.
const BLOCKED_TERMS = ['nigger', 'nigga', 'faggot', 'retard', 'chink', 'spic', 'kike', 'tranny'];

function normalizeForFilter(s) {
  return String(s)
    .toLowerCase()
    .replace(/4/g, 'a')
    .replace(/3/g, 'e')
    .replace(/1/g, 'i')
    .replace(/!/g, 'i')
    .replace(/0/g, 'o')
    .replace(/5/g, 's')
    .replace(/\$/g, 's')
    .replace(/7/g, 't')
    .replace(/[^a-z]/g, '');
}

function containsBlockedTerm(s) {
  // Check each whitespace-separated word on its own, not the whole string
  // normalized together — otherwise stripping spaces can glue adjacent
  // innocent words into a false hit (e.g. "this pic is great" collapsing
  // into "...thispic..." and matching "spic"). Leetspeak/punctuation
  // obfuscation *within* a single word is still caught, since that word's
  // own normalization still strips punctuation and substitutes digits.
  return String(s)
    .split(/\s+/)
    .some((word) => {
      const norm = normalizeForFilter(word);
      return norm && BLOCKED_TERMS.some((term) => norm.includes(term));
    });
}

function censorBlockedTerms(s) {
  if (!containsBlockedTerm(s)) return s;
  // Word-ish tokens get replaced outright rather than character-by-character
  // masked, since leetspeak/spacing tricks mean a partial mask would still
  // read as the slur.
  return String(s)
    .split(/(\s+)/)
    .map((tok) => (containsBlockedTerm(tok) ? '*'.repeat(Math.max(3, tok.length)) : tok))
    .join('');
}

// A pure function of (x, y, seed) — always the same output for the same
// inputs, no state, no Math.random(). Used to scatter wilderness/ocean
// decoration deterministically: every client computes the same world
// without any of it needing to be generated once and synced over the
// network, the same trick weather/the sparkle/the daily merchant already
// use with time instead of position.
function worldHash(x, y, seed) {
  const h = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453;
  return h - Math.floor(h);
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Turns CHANGELOG.md's fixed, simple shape (an h1 + intro paragraph we skip,
// then "## Section" headings each followed by a flat list of "- " bullets
// that can wrap onto indented continuation lines) into HTML for the in-game
// changelog viewer. Not a general markdown parser — it only needs to handle
// the one shape this file actually uses.
function renderChangelogMarkdown(md) {
  let html = '';
  let inList = false;
  let liOpen = false;
  const closeLi = () => { if (liOpen) { html += '</li>'; liOpen = false; } };
  const closeList = () => { closeLi(); if (inList) { html += '</ul>'; inList = false; } };
  md.split('\n').forEach((raw) => {
    const line = raw.replace(/\r$/, '');
    if (line.startsWith('## ')) {
      closeList();
      html += `<h2>${escapeHtml(line.slice(3).trim())}</h2>`;
    } else if (/^-\s/.test(line)) {
      closeLi();
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${escapeHtml(line.slice(1).trim())}`;
      liOpen = true;
    } else if (line.trim() !== '' && liOpen) {
      html += ` ${escapeHtml(line.trim())}`;
    }
  });
  closeList();
  return html;
}

// ---------------- local save (this device only — nothing here is synced) ----------------
// Declared before the SFX module below, which reads loadSave() at the
// top level on page load (sfxMuted) — it was previously declared much
// further down in this file as a `const`, which put it in the temporal
// dead zone at that point, throwing on every load; loadSave()'s own
// try/catch silently swallowed that error and returned {}, so the
// persisted mute flag was never actually honored after a reload.

const SAVE_KEY = 'pixeltown-save-v1';

// Bump this string whenever there's something worth telling returning
// players about — shown once as a dismissible banner, then remembered.
const GAME_VERSION = 'v34-aquarium';
const WHATS_NEW = [
  '🐠 Home aquarium — show fish from your journal beside your plot for extra cozy',
  "🐟 Angler's Journal — 12 fish species by pond, time and season, with set rewards (L)",
  '📋 Today board — see every daily chore at a glance (J), finish them all for a bonus',
  '🍁 Seasonal specials at the workbench — a new craft for every season',
  "🎂 Villager birthdays — bring a gift on their big day for a party bonus",
  '🏡 Home plot — display your crafted goods as cozy decor, earn a daily visitor bonus',
  '🦋 Daily Bug-Off — a 2-hour contest, catch 5/10/15 bugs for Bronze/Silver/Gold',
  '📬 Villager mailbox — friends write you daily letters with gifts attached',
  '🌿 Weeds sprout every day — pull them for ⭐ and keep the town tidy',
  '🔨 DIY Workbench — craft goods from what you gather, sell them for more',
  '🎣 Daily fishing tournament — biggest catch of the day wins a bonus',
  '🔍 Daily scavenger hunt — one hidden spot a day, first to find it wins',
  '🏘️ Town rating readout, 🎵 opt-in ambient music, 💾 save backup/restore',
];

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    // A corrupt/hand-edited save that isn't a plain object (number, string,
    // array...) would otherwise get spread into garbage keys on next write.
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (e) {
    return {}; // private browsing / storage disabled — just play without saving
  }
}

// Captured once, as soon as the script runs — before the join screen's
// own writeSave() calls touch anything — so "is this a brand-new device"
// can still be answered correctly later, even though joining immediately
// writes name/species/frame to the same save.
const HAD_EXISTING_SAVE_ON_LOAD = Object.keys(loadSave()).length > 0;

// A saved counter that is a finite, non-negative whole number — anything
// else (NaN, Infinity, negatives, strings from a hand-edited save) becomes 0.
function cleanCount(v) {
  v = Math.floor(Number(v));
  return Number.isFinite(v) && v > 0 ? Math.min(v, 1e9) : 0;
}

// One step of a day streak (login, selling). Dates are UTC day keys 'YYYY-MM-DD'. Returns the streak to show, the date to keep,
// counted (a new day was counted: pay its bonus) and write (store streak + date).
//  same day: nothing. Yesterday: +1. Older, missing or unreadable: a new streak of 1 (as always).
// cycle1 L-07: a stored date in the FUTURE means the device clock was ahead when it was written and has been put right since.
// That used to reset the streak to 1. Now the streak is never lost for it, and never paid twice:
//  1 or 2 days ahead: that day is already counted, so wait for it (nothing written, nothing paid; it continues from there);
//  more than 2 days ahead: the stored date is ignored: the streak restarts its count from today (date = today, no bonus today),
//  so a clock that was a month ahead cannot freeze the streak for a month.
// And a device date before STREAK_CLOCK_FLOOR (earlier than this rule existed, e.g. a dead clock battery showing 1970 or 2000)
// is a wrong clock for certain: an existing streak is left exactly as it is until the clock is right again.
const STREAK_FUTURE_DAYS = 2;
const STREAK_CLOCK_FLOOR = '2026-11-01';
function streakDayNumber(key) {
  if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return NaN;
  const t = Date.parse(key + 'T00:00:00Z');
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === key ? Math.round(t / 86400000) : NaN;
}
function streakStep(lastDate, streak, today) {
  streak = cleanCount(streak);
  if (lastDate === today) return { streak, date: today, counted: false, write: false };
  const was = streakDayNumber(lastDate); const now = streakDayNumber(today);
  if (streak > 0 && Number.isFinite(was) && !(now >= streakDayNumber(STREAK_CLOCK_FLOOR))) return { streak, date: lastDate, counted: false, write: false };
  if (streak > 0 && Number.isFinite(was) && Number.isFinite(now) && was > now) {
    if (was - now <= STREAK_FUTURE_DAYS) return { streak, date: lastDate, counted: false, write: false };
    return { streak, date: today, counted: false, write: true };
  }
  return { streak: was === now - 1 ? streak + 1 : 1, date: today, counted: true, write: true };
}

// ID-09 (cycle 8 S, spec IDEAS.md "ID-09 / ID-18 implementation specs"): forgiving day COUNTS, never a streak. Additive keys
// visitDays / lastVisitDate (days the player came to the village) and sellDays / lastSellDay (days with a sale at the shop), on UTC
// 'YYYY-MM-DD' keys through MMGameDay.visitStep: any gap is just +1, nothing is ever lost or lowered. The old streak keys keep being
// written by streakStep above (rollback safe) but are no longer shown or paid on. First load with no count: seeded from the old streak
// so nobody starts lower than they were (visits: max(loginStreak, 1) when the old key exists; sales: sellStreak), with the old date,
// so a day the old code already paid is not paid again. -> { days, date, counted, write }
// The UTC game day (L-08) for the Town's day counts and bounties: MMGameDay.utcKey, never a new toISOString call.
function townUtcKey() { return typeof MMGameDay !== 'undefined' ? MMGameDay.utcKey() : ''; }
function townDayStep(saved, kind, today) {
  const sell = kind === 'sell';
  let days = sell ? saved.sellDays : saved.visitDays;
  let date = sell ? saved.lastSellDay : saved.lastVisitDate;
  let seeded = false;
  if (days === undefined) {
    const old = sell ? saved.sellStreak : saved.loginStreak;
    const oldDate = sell ? saved.lastSellDate : saved.lastLoginDate;
    if (old !== undefined || oldDate !== undefined) { days = sell ? cleanCount(old) : Math.max(cleanCount(old), 1); date = oldDate; seeded = true; }
  }
  const G = typeof MMGameDay !== 'undefined' ? MMGameDay : null;
  if (!G || typeof G.visitStep !== 'function') return { days: cleanCount(days), date: date, counted: false, write: false };
  const st = G.visitStep(date, days, today);
  return { days: st.days, date: st.date, counted: st.counted, write: st.write || seeded };
}

// ID-61 (cycle 12 S, spec U cycle 11 in IDEAS.md): a returning profile gets one welcome-back line when the last saved visit day
// (UTC 'YYYY-MM-DD', the ID-09 key) is 1 or more days before today. Never on a first-ever visit (no date), never twice on one day.
function townWelcomeBackDue(last, today) {
  const ok = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
  return ok(last) && ok(today) && last < today;
}
// The line itself: the realm level only (pixeltown-save-v1.realm.level). The Town cannot read a Realm zone without loading Realm
// code, so no zone is named (spec: no guessing). No counts of missed days, no gift, no streak.
function townWelcomeBackText(save) {
  const r = save && save.realm;
  const lv = r && typeof r === 'object' && !Array.isArray(r) ? Number(r.level) : NaN;
  if (Number.isFinite(lv) && lv >= 1) return `Welcome back! Your hero is Lv ${Math.floor(Math.min(lv, 999))} in the Realm.`;
  return 'Welcome back to Pixeltown!';
}

// Beta S-01: true from the moment a Restore writes the save until the page reloads, so no other writer (a timer, the
// cross-tab listener, a late gather) can put the old in-memory state back over the restored file.
let SAVE_RESTORING = false;
const SAVE_PREV_KEY = 'pixeltown-save-v1-prev'; // additive: the raw save from just before the last Restore

// The Town page does not load the backup tool or its owner cleaners up front (they are only needed for a Restore):
// load them once, in the same order as the Lantern page, skipping any that are already here. Resolves MMBackup or null.
let backupModulesPromise = null;
function loadBackupModules() {
  if (window.MMBackup) return Promise.resolve(window.MMBackup);
  if (backupModulesPromise) return backupModulesPromise;
  const mods = [['MMRng', 'rng'], ['MMClasses', 'mm-classes'], ['MMWeapons', 'mm-weapons'], ['MMUnlocks', 'mm-unlocks'], ['MMItems', 'mm-items'],
    ['MMProfile', 'mm-profile'], ['MMStash', 'mm-stash'], ['MMMap', 'mm-map'], ['MMAngler', 'mm-angler'], ['MMBugs', 'mm-bugs'],
    ['MMHubProfile', 'profile'], ['MMDaily', 'mm-daily'], ['MMAccess', 'mm-access'], ['MMGift', 'mm-gift'], ['MMBackup', 'mm-backup']];
  const one = (name, file) => new Promise((resolve) => {
    if (window[name]) { resolve(); return; }
    const el = document.createElement('script');
    el.src = 'shared/' + file + '.js?v=20261123s01';
    el.onload = () => resolve();
    el.onerror = () => resolve();
    document.head.appendChild(el);
  });
  backupModulesPromise = mods.reduce((p, [name, file]) => p.then(() => one(name, file)), Promise.resolve())
    .then(() => window.MMBackup || null)
    .then((B) => { if (!B) backupModulesPromise = null; return B; });
  return backupModulesPromise;
}

// Cycle 10 L (Town shop reliability): a write that storage refuses (quota full, blocked) used to vanish without a word, and the
// counter writers then moved their delta base as if it had landed, so a buy or a sale made in that window was lost for good even
// after storage worked again. Now a refused partial is kept (SAVE_PENDING) and written under the next write that lands, the merged
// writers report the failure (null) so their base stays put, and SAVE_OK lets the shops tell the player it is not saved yet.
let SAVE_OK = true;
let SAVE_PENDING = null;
// Cycle 12 D: turnip bundles this tab bought that storage has not taken yet ({day, n}). A refused whole-key turnipBuys value used to be
// kept in SAVE_PENDING, so it overrode (live read) and then overwrote (flush) what ANOTHER tab stored in the meantime, and the day's cap
// could slip. Now only the count of OWN unsaved bundles is kept, and it is added on top of whatever storage holds when it is written.
let TURNIP_UNSAVED = null;
// SAVE_PENDING plus the turnip count rebuilt on the stored value (stored may be any object loadSave gave).
function pendingOn(stored) {
  if (!TURNIP_UNSAVED) return SAVE_PENDING || {};
  const r = stored && stored.turnipBuys;
  const have = r && r.day === TURNIP_UNSAVED.day ? (Number(r.bundles) || 0) : 0;
  return { ...(SAVE_PENDING || {}), turnipBuys: { day: TURNIP_UNSAVED.day, bundles: have + TURNIP_UNSAVED.n } };
}
// What storage holds plus what this tab could not write yet: for "already bought today" checks while storage refuses writes.
function loadSaveLive() { const st = loadSave(); return SAVE_PENDING || TURNIP_UNSAVED ? { ...st, ...pendingOn(st) } : st; }

function writeSave(partial) {
  if (SAVE_RESTORING) return false;
  try {
    const stored = loadSave();
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ...stored, ...pendingOn(stored), ...partial }));
    SAVE_PENDING = null; TURNIP_UNSAVED = null; SAVE_OK = true;
    return true;
  } catch (e) {
    SAVE_PENDING = { ...(SAVE_PENDING || {}), ...partial }; SAVE_OK = false; // kept for this visit; the next write that lands carries it
    return false;
  }
}

// Beta S-02 (two Town tabs, or a Town tab + a Lantern Restore): merge-on-write for the counters and sets a whole
// sub-object used to overwrite. fn(stored) returns the partial to write on top of what storage holds RIGHT NOW.
// Returns null when nothing was written (restore in progress, or storage refused): the caller keeps its base, so its change is
// still a pending delta for the next call.
function writeSaveMerged(fn) {
  if (SAVE_RESTORING) return null;
  const stored = loadSave();
  let partial = null;
  try { partial = fn(stored); } catch (e) { partial = null; }
  if (!partial || typeof partial !== 'object') return null;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ...stored, ...pendingOn(stored), ...partial }));
    SAVE_PENDING = null; TURNIP_UNSAVED = null; SAVE_OK = true;
  } catch (e) { SAVE_OK = false; return null; }
  return partial;
}

// Counters: stored + (mine - base) per key, clamped to 0..cap. Keys only storage has are kept (additive);
// a tab that missed another tab's write adds only its OWN change, never its stale total.
function townMergeCounts(stored, mine, base, cap) {
  const s = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
  const b = base && typeof base === 'object' ? base : null;
  const out = { ...s };
  const lim = cap || 1e9;
  Object.keys(mine || {}).forEach((k) => {
    const m = Number(mine[k]) || 0;
    const delta = b ? m - (Number(b[k]) || 0) : m - (cleanCount(s[k]));
    out[k] = Math.min(lim, cleanCount(cleanCount(s[k]) + delta));
  });
  return out;
}

// Sets of ids: stored order first, then this tab's new ids, no duplicates (an unlock or museum donation is never lost).
function townUnion(stored, mine) {
  const out = [];
  const seen = new Set();
  [stored, mine].forEach((a) => {
    (Array.isArray(a) ? a : []).forEach((id) => {
      const key = typeof id + ':' + String(id);
      if ((typeof id === 'string' || (typeof id === 'number' && Number.isFinite(id))) && !seen.has(key)) { seen.add(key); out.push(id); }
    });
  });
  return out;
}

// Beta S-01: what the Town Restore accepts as a town-only save file. A plain object that has a name or at least one field
// the Town writes, at most TOWN_RESTORE_MAX characters; prototype keys, non-identifier keys and a backup bundle's envelope
// are dropped. Returns the cleaned object or null ("not a Pixeltown save", nothing is written).
const TOWN_RESTORE_MAX = 2000000;
const TOWN_SAVE_FIELDS = ['name', 'species', 'frame', 'realm', 'resources', 'crafted', 'caveInv', 'cavePick', 'caveSeed',
  'lifetimeStats', 'achievementsUnlocked', 'equippedTitle', 'fossilsHeld', 'museumCollection', 'museumFauna', 'museumFlora',
  'fishlog', 'home', 'mail', 'birthdays', 'dailies', 'bugoff', 'loginStreak', 'lastLoginDate', 'sellStreak', 'lastSellDate',
  'visitDays', 'lastVisitDate', 'sellDays', 'lastSellDay', 'bounty', 'sfxMuted', 'musicEnabled', 'reduceMotion', 'lastSeenVersion', 'villagerAffinity', 'villagerTalkDay', 'bestieId', 'bestieName',
  'ffDiscovered', 'weedsPulled', 'turnipBuys', 'questClaimedBucket', 'triviaAnsweredBucket', 'tournamentBonusBucket',
  'merchantGiftBoxDay', 'kkEnjoyedWindow', 'settingsOpen', 'errand', 'stars'];
function cleanTownSave(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  if (obj.format === 'pixeltown-backup') return null; // a bundle is never a town save (S-01: it used to be written as one)
  const hasName = typeof obj.name === 'string' && obj.name.trim().length > 0;
  if (!hasName && !TOWN_SAVE_FIELDS.some((f) => Object.prototype.hasOwnProperty.call(obj, f))) return null;
  const out = {};
  Object.keys(obj).forEach((k) => {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') return;
    if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(k)) return;
    out[k] = obj[k];
  });
  let s = '';
  try { s = JSON.stringify(out); } catch (e) { return null; }
  if (typeof s !== 'string' || s.length > TOWN_RESTORE_MAX) return null;
  return out;
}

// ---------- SFX ----------
// Pixeltown had zero sound anywhere (bar walkie-talkie voice clips) —
// a real gap for an Animal Crossing game, which leans heavily on its
// chimes for feel. Rather than bundle audio files, these are short
// WebAudio-synthesized blips, generated on the fly. Muted by default
// state is remembered locally; the AudioContext itself is created lazily
// on first real use since browsers refuse to start one before a user
// gesture.
let sfxMuted = loadSave().sfxMuted === true;
let sfxCtx = null;

// Reduce-motion: turns off the player walk-cycle hop for anyone sensitive
// to it. Defaults to the OS-level prefers-reduced-motion setting, same as
// the join-screen decor already respects, but the player can flip it
// either way and that choice is remembered per device.
const SAVED_REDUCE_MOTION = loadSave().reduceMotion;
let reduceMotion = SAVED_REDUCE_MOTION === true
  || (SAVED_REDUCE_MOTION === undefined && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
function setReduceMotion(enabled) {
  reduceMotion = enabled;
  writeSave({ reduceMotion: enabled });
}

// Shared lazily-created AudioContext, independent of the sfxMuted flag —
// ambient music has its own separate opt-in toggle and shouldn't be tied
// to whether SFX blips are muted.
function getAudioCtx() {
  if (!sfxCtx) {
    try { sfxCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
  }
  if (sfxCtx.state === 'suspended') sfxCtx.resume().catch(() => {});
  return sfxCtx;
}

function getSfxCtx() {
  if (sfxMuted) return null;
  return getAudioCtx();
}

// notes: a sequence of [frequencyHz, durationSeconds, delaySeconds]
function playNotes(notes, type = 'sine', volume = 0.12) {
  const ctx = getSfxCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  notes.forEach(([freq, dur, delay]) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const t0 = now + delay;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(volume, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  });
}

// 8-bit layer: when shared/mm-chip.js + shared/sfx.js are loaded, every Town cue goes through one MMSfx instance on the same
// AudioContext (chiptune voices, see game/design/CHIP-AUDIO.md). The Town's own sfxMuted / musicEnabled stay the only switches:
// the instance gets no storage, so it never reads or writes a second mute key. Without MMChip the old blips below still play.
let townSfx = null;
function townLowGfx() {
  try { const p = (typeof MMAccess !== 'undefined' && MMAccess.prefs) ? MMAccess.prefs.load(window.localStorage) : null; return !!(p && p.lowGfx === true); } catch (e) { return false; }
}
function getTownSfx() {
  if (townSfx || typeof MMSfx === 'undefined' || typeof MMChip === 'undefined') return townSfx;
  try { townSfx = MMSfx.create({ ctxFactory: getAudioCtx, lowGfx: townLowGfx() }); } catch (e) { townSfx = null; }
  return townSfx;
}
function townCue(name, fallback) {
  return () => {
    if (sfxMuted) return;
    const s = getTownSfx();
    if (s && getAudioCtx()) { try { if (s.play(name)) return; } catch (e) { /* fall back */ } }
    fallback();
  };
}
const SFX = {
  catch: townCue('catch', () => playNotes([[740, 0.08, 0], [1175, 0.1, 0.06]], 'sine', 0.12)),
  coin: townCue('coin', () => playNotes([[988, 0.09, 0]], 'triangle', 0.1)),
  sell: townCue('sell', () => playNotes([[523, 0.08, 0], [784, 0.08, 0.05], [1047, 0.12, 0.1]], 'triangle', 0.11)),
  achievement: townCue('achievement', () => playNotes([[523, 0.1, 0], [659, 0.1, 0.09], [784, 0.1, 0.18], [1047, 0.18, 0.27]], 'square', 0.1)),
  deny: townCue('deny', () => playNotes([[196, 0.16, 0]], 'sawtooth', 0.09)),
  pop: townCue('pop', () => playNotes([[392, 0.05, 0], [294, 0.06, 0.04]], 'square', 0.08)),
  shutter: townCue('shutter', () => playNotes([[1800, 0.03, 0], [220, 0.05, 0.03]], 'square', 0.07)),
};

function setSfxMuted(muted) {
  sfxMuted = muted;
  writeSave({ sfxMuted: muted });
}

// ---------- ambient music (opt-in, off by default) ----------
// A slow, quiet chord pad — same no-audio-files WebAudio approach as the
// SFX blips, just long-held tones instead of short ones. Off by default
// since background music is a bigger ask than muted-by-default SFX; the
// player has to explicitly turn it on.
let musicEnabled = loadSave().musicEnabled === true;
let musicNodes = [];
const MUSIC_CHORDS = [
  [196.0, 246.94, 293.66], // G3 B3 D4
  [220.0, 261.63, 329.63], // A3 C4 E4
  [174.61, 220.0, 261.63], // F3 A3 C4
  [196.0, 246.94, 329.63], // G3 B3 E4
];
let musicChordIndex = 0;
let musicChordTimer = null;

function startAmbientMusic() {
  const ctx = getAudioCtx();
  if (!ctx || musicNodes.length) return;
  // 8-bit Town loop (MMChip 'town' cue) when available and not in low-graphics mode; otherwise the original chord pad.
  const chip = getTownSfx();
  if (chip) { try { chip.setMusic(true); if (chip.music('town')) return; } catch (e) { /* fall back to the pad */ } }
  musicChordIndex = 0;
  MUSIC_CHORDS[0].forEach((freq) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.value = 0;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    gain.gain.linearRampToValueAtTime(0.025, ctx.currentTime + 2);
    musicNodes.push({ osc, gain });
  });
  musicChordTimer = setInterval(() => advanceMusicChord(), 8000);
}

function advanceMusicChord() {
  const ctx = sfxCtx;
  if (!ctx || !musicNodes.length) return;
  musicChordIndex = (musicChordIndex + 1) % MUSIC_CHORDS.length;
  const chord = MUSIC_CHORDS[musicChordIndex];
  musicNodes.forEach((node, i) => {
    node.osc.frequency.linearRampToValueAtTime(chord[i], ctx.currentTime + 3);
  });
}

function stopAmbientMusic() {
  const ctx = sfxCtx;
  if (townSfx) { try { townSfx.setMusic(false); } catch (e) { /* ignore */ } }
  musicNodes.forEach(({ osc, gain }) => {
    if (ctx) gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1);
    setTimeout(() => { try { osc.stop(); } catch (e) { /* already stopped */ } }, 1100);
  });
  musicNodes = [];
  if (musicChordTimer) { clearInterval(musicChordTimer); musicChordTimer = null; }
}

function setMusicEnabled(enabled) {
  musicEnabled = enabled;
  writeSave({ musicEnabled: enabled });
  if (enabled) startAmbientMusic();
  else stopAmbientMusic();
}

const SPECIES = [
  { key: 'coolcats', label: 'Cats' },
  { key: 'punks', label: 'Punks' },
  { key: 'pudgypenguins', label: 'Penguins' },
  { key: 'doge', label: 'Dogs' },
  { key: 'apes', label: 'Apes' },
  { key: 'zombies', label: 'Zombies' },
  { key: 'mohawks', label: 'Mohawks' },
  { key: 'blondies', label: 'Blondies' },
  { key: 'aliens', label: 'Aliens' },
  // Unused 8-bit sprite strips already in this repo's i/ folder — same
  // 24x24, 9-frame shape as everything above, so they drop straight into
  // the existing species/preload/picker system with no special-casing.
  { key: 'alienclan', label: 'Alien Clan' },
  { key: 'apepunks', label: 'Ape Punks' },
  { key: 'coolcats_dragons', label: 'Dragon Cats' },
  { key: 'coolcats_frogs', label: 'Frog Cats' },
  { key: 'coolcats_ninjas', label: 'Ninja Cats' },
  { key: 'coolcats_pirates', label: 'Pirate Cats' },
  { key: 'coolcats_unicorns', label: 'Unicorn Cats' },
  { key: 'genius', label: 'Geniuses' },
  { key: 'goldenpunks', label: 'Golden Punks' },
  { key: 'halloweenpunks', label: 'Halloween Punks' },
  { key: 'phunks', label: 'Phunks' },
  { key: 'punkettes', label: 'Punkettes' },
];

const EMOTES = ['😀', '❤️', '😂', '👋', '🎉', '😢', '😮', '💤', '🎵'];
const SPARKLE_SPOTS = [
  [500, 300], [1100, 300], [500, 950], [1150, 940], [300, 780],
  [1280, 650], [700, 850], [900, 400], [650, 350], [1050, 950],
  [1750, 450], [2100, 650], [2250, 950],
];
const SPARKLE_ROTATE_MS = 8000;
const SPARKLE_CATCH_RADIUS = 26;

const IS_TOUCH = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
// cyc7-ui / cyc8-ui: one MMNav mount config for the Town (see setupWhereTo). The shared corner Menu (#mm-nav-btn) is top-left on
// every screen. On a phone (<= 600 px, or a short landscape phone) it REPLACES "Where to?" in the phone panel (body.town-phone-nav
// hides it; the HUD diet stays <= 10 pieces) and the bag bar sits right of the Menu (style.css). Wide screens keep both ways in.
const townNarrow = () => window.innerWidth <= 600 || (window.innerWidth > window.innerHeight && window.innerHeight <= 500);
const TOWN_NAV = { page: 'town', hideMenu: false };
if (townNarrow()) document.body.classList.add('town-phone-nav');
if (IS_TOUCH) document.body.classList.add('touch-device');
// Cycle 1 U-02: on phones (<= 720 px) the bag bar is ONE row: the bag + the 3 most recently changed counts (style.css
// #inventory-panel.bag-compact). Tapping the bag expands every count; tapping again folds it. Recency is watched on the
// count text itself (any code path that updates a count), this tab only, never saved. Desktop keeps the full bar.
(function setupBagBar() {
  const panel = document.getElementById('inventory-panel'); const bag = document.getElementById('bag-icon');
  if (!panel || !bag || typeof MutationObserver === 'undefined') return;
  const chips = () => Array.from(panel.children).filter((e) => e !== bag && e.querySelector('b'));
  const last = new Map(); let recent = chips().slice(0, 3);
  chips().forEach((c) => last.set(c, c.textContent));
  // At big Text size the capped one-row bar fits fewer counts: drop the oldest of the 3 until the row fits (never below 1).
  const paint = () => {
    let show = recent.slice();
    for (;;) {
      chips().forEach((c) => c.classList.toggle('bag-recent', show.includes(c)));
      show.forEach((c, i) => c.style.setProperty('--bag-order', String(i + 1)));
      if (show.length <= 1 || !panel.classList.contains('bag-compact') || panel.classList.contains('bag-open') || panel.scrollWidth <= panel.clientWidth + 1) break;
      show = show.slice(0, -1);
    }
  };
  // cyc3 U: short landscape touch screens fold too (844x390 showed all 12 counts in the top row on the first visit)
  const phone = window.matchMedia ? window.matchMedia('(max-width: 720px), (max-height: 500px) and (pointer: coarse)') : null;
  const sync = () => {
    const on = !!(phone && phone.matches);
    panel.classList.toggle('bag-compact', on);
    if (on) { bag.setAttribute('role', 'button'); bag.tabIndex = 0; bag.setAttribute('aria-controls', 'inventory-panel'); bag.setAttribute('aria-label', 'Bag: show every count'); bag.setAttribute('aria-expanded', String(panel.classList.contains('bag-open'))); }
    else { ['role', 'tabindex', 'aria-controls', 'aria-label', 'aria-expanded'].forEach((a) => bag.removeAttribute(a)); panel.classList.remove('bag-open'); }
  };
  const toggle = () => { if (!panel.classList.contains('bag-compact')) return; const open = panel.classList.toggle('bag-open'); bag.setAttribute('aria-expanded', String(open)); bag.setAttribute('aria-label', open ? 'Bag: show only recent counts' : 'Bag: show every count'); paint(); };
  bag.addEventListener('click', toggle);
  bag.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); if (!e.repeat) toggle(); } });
  new MutationObserver(() => {
    let moved = false;
    chips().forEach((c) => { const t = c.textContent; if (last.get(c) !== t) { last.set(c, t); if (!c.classList.contains('hidden')) { recent = [c].concat(recent.filter((x) => x !== c)).slice(0, 3); moved = true; } } });
    if (moved) paint();
  }).observe(panel, { subtree: true, characterData: true, childList: true });
  const resync = () => { sync(); paint(); };
  if (phone) { if (phone.addEventListener) phone.addEventListener('change', resync); else if (phone.addListener) phone.addListener(resync); }
  // the bar first gets a size when the HUD shows (join) or Text size changes: refit then (one rAF, no loop: paint is stable)
  let fitQ = 0; const refit = () => { if (fitQ) return; fitQ = requestAnimationFrame(() => { fitQ = 0; paint(); }); };
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(refit).observe(panel);
  window.addEventListener('resize', refit);
  sync(); paint();
})();
if (IS_TOUCH) { // b08-r2-09: the join card's tip uses touch words on a phone, never key names
  const jt = document.querySelector('#join-overlay .join-tip');
  if (jt) jt.textContent = 'Drag the stick to walk · tap A to interact (fish, chop, mine, catch bugs) · tap C to chat · more in the menu';
}

// Shared accessibility prefs (pixeltown-access-v1, written by the Realm settings): the town only mirrors them
// as body classes + a CSS variable. Reading never throws; missing/corrupt prefs fall back to defaults.
(function applyTownAccess() {
  try {
    const p = (typeof MMAccess !== 'undefined' && MMAccess.prefs) ? MMAccess.prefs.load(window.localStorage) : { hudScale: 1, flashes: true, lowGfx: false };
    const osReduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    // mm-reduce-motion (the shared Settings toggle, mm-settings.js) counts too; mm-settings.js mirrors it on <html>.
    let mmReduce = false;
    try { mmReduce = window.localStorage.getItem('mm-reduce-motion') === '1'; } catch (e) { mmReduce = false; }
    const reduce = osReduce || mmReduce || p.flashes === false || p.lowGfx === true;
    document.body.classList.toggle('a11y-reduce-motion', reduce);
    if (reduce) { document.documentElement.setAttribute('data-reduce-motion', '1'); document.documentElement.classList.add('reduce-motion'); }
    document.body.classList.toggle('a11y-hud-scaled', p.hudScale > 1);
    document.body.style.setProperty('--hud-scale', String(p.hudScale || 1));
  } catch (e) { /* prefs are optional */ }
})();

// TN2: the Town low-end tier through the shared MMPerf profile (shared/mm-perf.js). Only the Low graphics setting
// (pixeltown-access-v1.lowGfx) picks it; without it the tier is 'high' and nothing below changes (the desktop adaptive
// render resolution in startTown stays the automatic fallback). Low caps the rain drops and the arrival puff to
// MMPerf's spark cap (Low graphics also turns on the Town's reduce motion, so the puff is then one still piece), drops the ocean crest/foam ambient layers, the season decor and the bug glow tweens, eases the
// villagers every third frame and starts the canvas at 0.75 render scale. Read once; never writes storage.
const TOWN_PERF = (function townPerfTier() {
  const fallback = { tier: 'high', caps: { dpr: 2, sparks: 64, deathGhosts: 24, terrainAnim: true }, forced: false };
  let res = fallback;
  try {
    const p = (typeof MMAccess !== 'undefined' && MMAccess.prefs) ? MMAccess.prefs.load(window.localStorage) : null;
    if (typeof MMPerf !== 'undefined' && MMPerf.profile) res = MMPerf.profile([], { lowGfx: !!(p && p.lowGfx === true) }, null);
  } catch (e) { res = fallback; }
  const low = res.tier === 'low';
  const out = {
    tier: res.tier, low, forced: !!res.forced, caps: Object.assign({}, res.caps),
    rainDrops: low ? Math.min(70, res.caps.sparks) : 70, puffs: low ? Math.min(3, res.caps.sparks) : 6,
    npcEvery: low ? 3 : 1, ambientLayers: !low, renderScale: low ? 0.75 : 1,
  };
  if (low) document.body.classList.add('town-low-gfx');
  window.__townPerf = out;
  return out;
})();

const TILT_DEADZONE_DEG = 8;
const TILT_RANGE_DEG = 36;
// Radial dead zone for gamepad sticks and the on-screen joystick (0..1 of
// full deflection) — worn sticks rest a little off-center and would
// otherwise make the villager creep on their own.
const PAD_DEADZONE = 0.22;
const JOYSTICK_DEADZONE = 0.18;
const SHAKE_THRESHOLD = 15; // m/s^2 jump in accelerationIncludingGravity magnitude
const SHAKE_COOLDOWN_MS = 800;
const TREE_SHAKE_RADIUS = 46;
const TREE_SHAKE_COOLDOWN_MS = 20000;

// Fixed town layout. WORLD size (2400x1200) is defined in net.js — everyone's
// client draws the same map so landmarks mean the same thing to everyone.
// The original town occupies x:0-1600; x:1600-2400 is the newer "East Meadow"
// zone, reachable by walking east along the main path.
// The original village footprint — unchanged by the world expansion below.
// Bugs (and anything else that should stay a "village" activity rather
// than spread out into the much bigger wilderness) are bounded to this.
const NIGHT_WASH_VISIBLE = false; // see setupDayNight(): the night wash never rendered; keep it that way until design asks for it
const VILLAGE_BOUNDS = { x: 0, y: 0, width: 2400, height: 1200 };
// Thickness of the ocean band at the very edge of the (much bigger) world —
// everything between the village and the ocean is the wilderness ring.
const OCEAN_MARGIN = 500;
// Baked tree texture size and where the tree's base point (its old
// Graphics-local 0,0) sits inside it — see bakeTreeTextures().
const TREE_TEX = { w: 56, h: 60, ox: 28, oy: 43 };
const TREES = [
  [60, 50], [220, 40], [380, 55], [560, 45], [680, 60],
  [920, 60], [1040, 45], [1200, 55], [1360, 40], [1520, 50],
  [60, 1150], [220, 1160], [380, 1145], [560, 1155], [680, 1140],
  [920, 1140], [1040, 1155], [1200, 1145], [1360, 1160], [1520, 1150],
  [40, 180], [50, 320], [40, 880], [55, 1020],
  [1550, 180], [1560, 320], [1540, 460], [1545, 740], [1555, 880], [1540, 1020],
  // East Meadow perimeter
  [1650, 60], [1780, 45], [1900, 55], [2150, 50], [2280, 60], [2370, 45],
  [1650, 1150], [1780, 1160], [1900, 1145], [2050, 1155], [2200, 1140], [2320, 1150],
  [2370, 300], [2370, 500], [2370, 700], [2370, 900],
];
const TULIP_BEDS = [
  { x: 700, y: 520, frames: [0, 1, 2] },
  { x: 900, y: 520, frames: [3, 4, 5] },
  { x: 700, y: 680, frames: [6, 7, 8] },
  { x: 900, y: 680, frames: [0, 3, 6] },
  { x: 1150, y: 900, frames: [1, 4, 7] },
  { x: 1750, y: 850, frames: [2, 5, 8] },
  { x: 2200, y: 950, frames: [0, 4, 7] },
];
const ROCKS = [
  [500, 470, 0], [1080, 470, 3], [500, 730, 5], [1080, 730, 2],
  [760, 460, 1], [840, 460, 4], [300, 900, 6], [1300, 300, 7],
  [1300, 900, 8], [150, 1050, 0],
  [1700, 700, 2], [1950, 950, 5], [2150, 750, 0], [2300, 450, 6],
];
const PUNK_ROCKS = [
  [200, 1000, 1], [1400, 950, 4], [900, 1080, 7], [2050, 480, 2],
];

// Flora/fauna starter pack (20 species) — real vector art (assets/flora-fauna/svg/)
// plus a matching GLB for 3D engines (assets/flora-fauna/glb/), both keyed by
// the same species id as game/species-registry.json. Only the SVGs are loaded
// here since this is a 2D Phaser game; the GLBs ride along unused but ID-
// matched, ready for a 3D engine (or this game's own Three.js cave) later.
// `zone` just picks which scatter rule below places it — not a biome engine.
// `name` is the display name shown in the Wildlife Log once a specimen's
// been logged — the full metadata (scientific name, diet, etc.) lives in
// species-registry.json instead; duplicating just the short display name
// here avoids an extra fetch for something this small.
const FF_COLLECT_RADIUS = 40;
// How each fauna species moves (anything not listed walks; flora never
// moves). 'fly' = flutters with a bob, 'swim' = drifts inside its own water
// body (pond or the near-shore ocean band), 'bank' = walks along a pond's
// shore, 'still' = sessile, just bobs in place. Purely cosmetic and local:
// only the spawn (home) point is deterministic across clients.
const FF_MOVE = {
  bird: 'fly', butterfly: 'fly', dragonfly: 'fly', toucan: 'fly', hawk: 'fly', hummingbird: 'fly',
  bat: 'fly', honeybee: 'fly', firefly: 'fly', ladybug: 'fly', owl: 'fly', snowy_owl: 'fly',
  trout: 'swim', catfish: 'swim', copepod: 'swim', amoeba: 'swim', paramecium: 'swim',
  jellyfish: 'swim', shark: 'swim', sea_turtle: 'swim', clownfish: 'swim', octopus: 'swim',
  seahorse: 'swim', nudibranch: 'swim', shrimp: 'swim', lobster: 'swim',
  frog: 'bank', crab: 'bank', heron: 'bank', otter: 'bank', beaver: 'bank',
  starfish: 'still', giant_clam: 'still', barnacle: 'still', sea_urchin: 'still', sand_dollar: 'still',
};
// Travel speed in px/s for the slowpokes/sprinters; everyone else gets a
// size-based default in drawFloraFauna().
const FF_SPEED = { snail: 5, desert_tortoise: 8, slime_mold: 3, roadrunner: 95, hummingbird: 90, hawk: 70, shark: 40, jellyfish: 10, seahorse: 8, amoeba: 4, paramecium: 6, copepod: 8 };
// The art faces right except these (flipX logic is inverted for them).
const FF_FACES_LEFT = new Set(['snail', 'shrimp']);
// Pond species that live *in* the water rather than on the bank.
const FF_IN_WATER = new Set(['trout', 'catfish', 'copepod', 'amoeba', 'paramecium', 'water_lily', 'duckweed', 'diatom']);
// Small, harmless species that also get a couple of spawns inside the
// village itself (everything else stays out in the wilderness).
const FF_VILLAGE = ['bird', 'butterfly', 'honeybee', 'ladybug', 'hummingbird', 'squirrel', 'snail', 'dragonfly'];
const FF_ASSETS = [
  { id: 'fox', w: 56, h: 56, zone: 'forest', name: 'Red Fox', kind: 'fauna' },
  { id: 'deer', w: 68, h: 68, zone: 'forest', name: 'White-tailed Deer', kind: 'fauna' },
  { id: 'bird', w: 36, h: 36, zone: 'forest', name: 'European Robin', kind: 'fauna' },
  { id: 'butterfly', w: 32, h: 32, zone: 'meadow', name: 'Monarch Butterfly', kind: 'fauna' },
  { id: 'frog', w: 32, h: 32, zone: 'pond', name: 'American Bullfrog', kind: 'fauna' },
  { id: 'snake', w: 40, h: 40, zone: 'meadow', name: 'Garter Snake', kind: 'fauna' },
  { id: 'mushroom', w: 28, h: 28, zone: 'forest', name: 'Fly Agaric', kind: 'flora' },
  { id: 'oak_tree', w: 88, h: 88, zone: 'forest', name: 'Northern Red Oak', kind: 'flora' },
  { id: 'pine_tree', w: 72, h: 96, zone: 'forest', name: 'Eastern White Pine', kind: 'flora' },
  { id: 'flower', w: 28, h: 28, zone: 'meadow', name: 'Wild Tulip', kind: 'flora' },
  { id: 'fern', w: 36, h: 36, zone: 'forest', name: 'Western Sword Fern', kind: 'flora' },
  { id: 'grass', w: 28, h: 28, zone: 'meadow', name: 'Tall Fescue', kind: 'flora' },
  { id: 'shrub', w: 44, h: 44, zone: 'forest', name: 'Common Juniper', kind: 'flora' },
  { id: 'cactus', w: 44, h: 60, zone: 'desert_accent', name: 'Saguaro Cactus', kind: 'flora' },
  { id: 'trout', w: 36, h: 36, zone: 'pond', name: 'Rainbow Trout', kind: 'fauna' },
  { id: 'crab', w: 32, h: 32, zone: 'pond', name: 'Fiddler Crab', kind: 'fauna' },
  { id: 'jellyfish', w: 36, h: 36, zone: 'ocean', name: 'Moon Jellyfish', kind: 'fauna' },
  { id: 'shark', w: 68, h: 68, zone: 'ocean', name: 'Blacktip Reef Shark', kind: 'fauna' },
  { id: 'coral', w: 40, h: 40, zone: 'ocean', name: 'Staghorn Coral', kind: 'flora' },
  { id: 'kelp', w: 36, h: 68, zone: 'ocean', name: 'Giant Kelp', kind: 'flora' },
  // Batch 2 (44 species) — fills in the biomes/taxa batch 1 barely
  // touched: desert, alpine/tundra, rainforest, more wetland/marine/
  // freshwater variety, plus arachnids and mollusks. Same id/zone
  // scatter convention as above; 'desert_accent' and 'alpine_accent'
  // are both fixed hand-placed corners (there's no real desert or
  // alpine biome on this map), same trick already used for cactus.
  { id: 'scorpion', w: 40, h: 32, zone: 'desert_accent', name: 'Deathstalker Scorpion', kind: 'fauna' },
  { id: 'roadrunner', w: 48, h: 40, zone: 'desert_accent', name: 'Greater Roadrunner', kind: 'fauna' },
  { id: 'desert_tortoise', w: 44, h: 32, zone: 'desert_accent', name: 'Desert Tortoise', kind: 'fauna' },
  { id: 'joshua_tree', w: 80, h: 104, zone: 'desert_accent', name: 'Joshua Tree', kind: 'flora' },
  { id: 'sagebrush', w: 44, h: 40, zone: 'desert_accent', name: 'Big Sagebrush', kind: 'flora' },
  { id: 'snowy_owl', w: 48, h: 40, zone: 'alpine_accent', name: 'Snowy Owl', kind: 'fauna' },
  { id: 'arctic_fox', w: 52, h: 44, zone: 'alpine_accent', name: 'Arctic Fox', kind: 'fauna' },
  { id: 'caribou', w: 68, h: 60, zone: 'alpine_accent', name: 'Caribou', kind: 'fauna' },
  { id: 'mountain_goat', w: 60, h: 60, zone: 'alpine_accent', name: 'Mountain Goat', kind: 'fauna' },
  { id: 'lichen', w: 28, h: 20, zone: 'alpine_accent', name: 'Map Lichen', kind: 'flora' },
  { id: 'toucan', w: 44, h: 40, zone: 'forest', name: 'Keel-billed Toucan', kind: 'fauna' },
  { id: 'poison_dart_frog', w: 28, h: 24, zone: 'forest', name: 'Strawberry Poison Frog', kind: 'fauna' },
  { id: 'howler_monkey', w: 56, h: 52, zone: 'forest', name: 'Mantled Howler', kind: 'fauna' },
  { id: 'orchid', w: 36, h: 32, zone: 'forest', name: 'Tiger Orchid', kind: 'flora' },
  { id: 'liana_vine', w: 40, h: 60, zone: 'forest', name: 'Strangler Fig Vine', kind: 'flora' },
  { id: 'leafcutter_ant', w: 28, h: 20, zone: 'forest', name: 'Leafcutter Ant', kind: 'fauna' },
  { id: 'heron', w: 52, h: 60, zone: 'pond', name: 'Great Blue Heron', kind: 'fauna' },
  { id: 'cattail', w: 28, h: 56, zone: 'pond', name: 'Common Cattail', kind: 'flora' },
  { id: 'dragonfly', w: 32, h: 28, zone: 'pond', name: 'Common Green Darner', kind: 'fauna' },
  { id: 'otter', w: 52, h: 40, zone: 'pond', name: 'North American River Otter', kind: 'fauna' },
  { id: 'water_lily', w: 32, h: 32, zone: 'pond', name: 'White Water Lily', kind: 'flora' },
  { id: 'sea_turtle', w: 60, h: 56, zone: 'ocean', name: 'Green Sea Turtle', kind: 'fauna' },
  { id: 'clownfish', w: 28, h: 28, zone: 'ocean', name: 'Ocellaris Clownfish', kind: 'fauna' },
  { id: 'octopus', w: 44, h: 40, zone: 'ocean', name: 'Common Octopus', kind: 'fauna' },
  { id: 'starfish', w: 32, h: 32, zone: 'ocean', name: 'Common Starfish', kind: 'fauna' },
  { id: 'sea_anemone', w: 36, h: 32, zone: 'ocean', name: 'Giant Green Anemone', kind: 'flora' },
  { id: 'seahorse', w: 32, h: 36, zone: 'ocean', name: 'Lined Seahorse', kind: 'fauna' },
  { id: 'beaver', w: 56, h: 44, zone: 'pond', name: 'North American Beaver', kind: 'fauna' },
  { id: 'catfish', w: 40, h: 32, zone: 'pond', name: 'Channel Catfish', kind: 'fauna' },
  { id: 'duckweed', w: 24, h: 16, zone: 'pond', name: 'Common Duckweed', kind: 'flora' },
  { id: 'owl', w: 44, h: 44, zone: 'forest', name: 'Great Horned Owl', kind: 'fauna' },
  { id: 'squirrel', w: 36, h: 32, zone: 'forest', name: 'Eastern Gray Squirrel', kind: 'fauna' },
  { id: 'hedgehog', w: 32, h: 28, zone: 'forest', name: 'European Hedgehog', kind: 'fauna' },
  { id: 'ladybug', w: 24, h: 24, zone: 'meadow', name: 'Seven-spot Ladybird', kind: 'fauna' },
  { id: 'honeybee', w: 24, h: 24, zone: 'meadow', name: 'Western Honey Bee', kind: 'fauna' },
  { id: 'spider', w: 28, h: 28, zone: 'forest', name: 'Garden Orb Weaver', kind: 'fauna' },
  { id: 'clover', w: 24, h: 20, zone: 'meadow', name: 'White Clover', kind: 'flora' },
  { id: 'dandelion', w: 24, h: 28, zone: 'meadow', name: 'Common Dandelion', kind: 'flora' },
  { id: 'moss', w: 24, h: 16, zone: 'forest', name: 'Common Haircap Moss', kind: 'flora' },
  { id: 'maple_tree', w: 88, h: 88, zone: 'forest', name: 'Sugar Maple', kind: 'flora' },
  { id: 'blackberry_vine', w: 44, h: 40, zone: 'forest', name: 'Blackberry Bramble', kind: 'flora' },
  { id: 'hawk', w: 48, h: 44, zone: 'forest', name: 'Red-tailed Hawk', kind: 'fauna' },
  { id: 'hummingbird', w: 24, h: 24, zone: 'meadow', name: 'Ruby-throated Hummingbird', kind: 'fauna' },
  { id: 'bat', w: 32, h: 28, zone: 'forest', name: 'Little Brown Bat', kind: 'fauna' },
  // Batch 3 (34 species) — closes out the taxa the brief called for that
  // were still thin or missing: mollusks, crustaceans, cnidarians,
  // echinoderms, fungi, mosses, ferns, sea grasses, and microscopic life
  // (the last rendered as tiny specks near pond edges, not life-sized).
  { id: 'snail', w: 24, h: 20, zone: 'forest', name: 'Garden Snail', kind: 'fauna' },
  { id: 'nudibranch', w: 26, h: 20, zone: 'ocean', name: 'Spanish Shawl Nudibranch', kind: 'fauna' },
  { id: 'giant_clam', w: 38, h: 30, zone: 'ocean', name: 'Giant Clam', kind: 'fauna' },
  { id: 'lobster', w: 32, h: 22, zone: 'ocean', name: 'American Lobster', kind: 'fauna' },
  { id: 'shrimp', w: 22, h: 16, zone: 'ocean', name: 'Common Shrimp', kind: 'fauna' },
  { id: 'barnacle', w: 18, h: 16, zone: 'ocean', name: 'Acorn Barnacle', kind: 'fauna' },
  { id: 'sea_fan', w: 34, h: 30, zone: 'ocean', name: 'Purple Sea Fan', kind: 'flora' },
  { id: 'fire_coral', w: 26, h: 24, zone: 'ocean', name: 'Fire Coral', kind: 'flora' },
  { id: 'sea_urchin', w: 22, h: 18, zone: 'ocean', name: 'Purple Sea Urchin', kind: 'fauna' },
  { id: 'sand_dollar', w: 18, h: 18, zone: 'ocean', name: 'Common Sand Dollar', kind: 'fauna' },
  { id: 'puffball_mushroom', w: 26, h: 22, zone: 'forest', name: 'Giant Puffball', kind: 'flora' },
  { id: 'bracket_fungus', w: 20, h: 14, zone: 'forest', name: 'Turkey Tail', kind: 'flora' },
  { id: 'slime_mold', w: 16, h: 12, zone: 'forest', name: 'Many-headed Slime', kind: 'flora' },
  { id: 'sphagnum_moss', w: 16, h: 10, zone: 'pond', name: 'Sphagnum Moss', kind: 'flora' },
  { id: 'bracken_fern', w: 26, h: 30, zone: 'forest', name: 'Bracken Fern', kind: 'flora' },
  { id: 'maidenhair_fern', w: 22, h: 22, zone: 'forest', name: 'Maidenhair Fern', kind: 'flora' },
  { id: 'red_algae', w: 18, h: 16, zone: 'ocean', name: 'Dulse', kind: 'flora' },
  { id: 'diatom', w: 12, h: 10, zone: 'pond', name: 'Diatom', kind: 'flora' },
  { id: 'turtle_grass', w: 20, h: 16, zone: 'ocean', name: 'Turtle Grass', kind: 'flora' },
  { id: 'eelgrass', w: 18, h: 28, zone: 'ocean', name: 'Eelgrass', kind: 'flora' },
  { id: 'copepod', w: 10, h: 8, zone: 'pond', name: 'Copepod', kind: 'fauna' },
  { id: 'amoeba', w: 10, h: 8, zone: 'pond', name: 'Amoeba', kind: 'fauna' },
  { id: 'paramecium', w: 10, h: 8, zone: 'pond', name: 'Paramecium', kind: 'fauna' },
  { id: 'grasshopper', w: 20, h: 16, zone: 'meadow', name: 'Grasshopper', kind: 'fauna' },
  { id: 'firefly', w: 14, h: 12, zone: 'meadow', name: 'Firefly', kind: 'fauna' },
  { id: 'praying_mantis', w: 22, h: 18, zone: 'meadow', name: 'Praying Mantis', kind: 'fauna' },
  { id: 'tarantula', w: 26, h: 22, zone: 'desert_accent', name: 'Tarantula', kind: 'fauna' },
  { id: 'daddy_longlegs', w: 18, h: 16, zone: 'forest', name: 'Daddy Longlegs', kind: 'fauna' },
  { id: 'salamander', w: 22, h: 14, zone: 'forest', name: 'Spotted Salamander', kind: 'fauna' },
  { id: 'poison_ivy', w: 22, h: 26, zone: 'forest', name: 'Poison Ivy', kind: 'flora' },
  { id: 'wisteria', w: 26, h: 32, zone: 'forest', name: 'Wisteria', kind: 'flora' },
  { id: 'sunflower', w: 26, h: 30, zone: 'meadow', name: 'Sunflower', kind: 'flora' },
  { id: 'bluebell', w: 16, h: 20, zone: 'meadow', name: 'Common Bluebell', kind: 'flora' },
  { id: 'lavender', w: 18, h: 22, zone: 'meadow', name: 'Lavender', kind: 'flora' },
];
// ID-59 first-visit animal hello (cycle 13 S, spec U cycle 11 in design/IDEAS.md). The first time the hero walks within
// ANIMAL_HELLO_RADIUS of a Town wild animal of a species it has not greeted yet, that animal turns to the hero (strip species only)
// and shows a small heart; one line in #achievement-toast names the species when the toast is free. No reward, no timer.
// Save: additive Town-save key `animalHello`, a bitmask over the FAUNA order of FF_ASSETS (bit i = the i-th fauna entry). There are
// more fauna (57) than a JS number holds exactly as bits, so the mask is stored as an array of 30-bit integer words (word w holds fauna
// w*30 .. w*30+29). Unknown bits / extra words are kept; a write ORs with what storage holds, so the mask never goes down.
const ANIMAL_HELLO_RADIUS = 160;
const ANIMAL_HELLO_HEART_MS = 1200;
const ANIMAL_HELLO_LINE_GAP_MS = 30000;
const ANIMAL_HELLO_LINE_MS = 4000;
const ANIMAL_HELLO_WORD = 30;
const ANIMAL_HELLO_MAX_WORDS = 8;
const FF_FAUNA_INDEX = (() => { const m = {}; let n = 0; FF_ASSETS.forEach((a) => { if (a.kind === 'fauna') m[a.id] = n++; }); return m; })();
// Anything stored that is not an array of 0 .. 2^30-1 integers counts as "no hellos yet" (bad words become 0, extra words beyond 8 dropped).
function cleanAnimalHello(v) {
  if (!Array.isArray(v)) return [];
  return v.slice(0, ANIMAL_HELLO_MAX_WORDS).map((w) => (Number.isInteger(w) && w >= 0 && w < 2 ** ANIMAL_HELLO_WORD ? w : 0));
}
function animalHelloOr(a, b) {
  const x = cleanAnimalHello(a), y = cleanAnimalHello(b), out = [];
  for (let i = 0; i < Math.max(x.length, y.length); i++) out.push(((x[i] || 0) | (y[i] || 0)) >>> 0);
  return out;
}
function animalHelloHas(mask, idx) { const w = mask[Math.floor(idx / ANIMAL_HELLO_WORD)] || 0; return ((w >>> (idx % ANIMAL_HELLO_WORD)) & 1) === 1; }
function animalHelloSet(mask, idx) {
  const out = cleanAnimalHello(mask), wi = Math.floor(idx / ANIMAL_HELLO_WORD);
  while (out.length <= wi) out.push(0);
  out[wi] = (out[wi] | (1 << (idx % ANIMAL_HELLO_WORD))) >>> 0;
  return out;
}
// The heart over a greeted animal. ONE function, so G's heart emote (branch cyc13-art) can replace the placeholder here: it must
// return a Phaser display object centred on (x, y). Placeholder: a code-drawn 7 x 6 pixel heart (original art), drawn at 3x, crisp.
const ANIMAL_HELLO_HEART_ROWS = ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'];
function makeAnimalHelloHeart(scene, x, y) {
  const key = 'animal-hello-heart';
  if (!scene.textures.exists(key)) {
    const cv = document.createElement('canvas'); cv.width = 7; cv.height = 6;
    const c = cv.getContext('2d'); c.fillStyle = '#ff5c8a';
    ANIMAL_HELLO_HEART_ROWS.forEach((row, ry) => { for (let rx = 0; rx < row.length; rx++) if (row[rx] === '#') c.fillRect(rx, ry, 1, 1); });
    c.fillStyle = '#ffd0dc'; c.fillRect(1, 1, 1, 1); // one highlight pixel
    scene.textures.addCanvas(key, cv);
    try { scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST); } catch (e) { /* pixelArt game config already nearest */ }
  }
  return scene.add.image(x, y, key).setScale(3).setOrigin(0.5, 1);
}
// y/range: the legacy mooncats' walk over the water (?legacyart=1). bank: where the stone hero statues stand instead, on dry land
// along the main pond's north-west bank (outside MAIN_POND's rim, clear of the shells, the heron, the dock and the bridge).
const POND_CATS = [
  { y: 552, frame: 0, range: [180, 330], bank: { x: 112, y: 524 } },
  { y: 578, frame: 3, range: [150, 300], bank: { x: 152, y: 490 } },
  { y: 648, frame: 6, range: [170, 320], bank: { x: 374, y: 490 } },
];
const WINDMILL_POS = { x: 250, y: 200 };
// Purely cosmetic seasonal ground decor — a snowman in winter, a pumpkin
// in autumn, nothing extra in spring/summer (flowers already cover that).
const SEASON_DECOR_SPOTS = [
  { x: 550, y: 250 }, { x: 1300, y: 250 }, { x: 2100, y: 750 },
  { x: 1050, y: 1100 }, { x: 1900, y: 350 },
];
const STATUE_POS = { x: 1450, y: 600 };
// R4-D2 W-06 / b12-r2-05: ONE pixel scale for every hero-shaped sprite in the Town. Resident NPCs (Professor Byte, the dock resident,
// the travelling merchant, the graveyard zombie) used to draw at 1.8-2x the 24 px hero, with doubled pixels next to 1x players.
// Now 1x like the player and the Founder's Statue; each NPC keeps its FEET where they were (the sprite moves down by the
// shrink) and its labels follow the head. ?npcscale=classic restores the old sizes.
const TOWN_NPC_SCALE = (() => { try { return /[?&]npcscale=classic(&|$)/.test(location.search) ? 0 : 1; } catch (e) { return 1; } })();
const npcScale = (classic) => (TOWN_NPC_SCALE ? TOWN_NPC_SCALE : classic);
const npcFeetShift = (classic) => 12 * (classic - npcScale(classic)); // 24 px cell, origin centre: feet at y + 12 * scale
// W-06 wildlife scale table: Town fauna drew at their SVG sizes (fox 56, deer 68, butterfly 32 px) next to the 24 px hero, i.e. 2-3x.
// Display size is now 0.45x of that, clamped 14..32 px: insects / frogs ~14, birds / snakes 16-18, fox / otter ~25, deer / caribou /
// shark ~31 (a deer is a little taller than the hero, a fox about hero height), baked 1:1 so the pixels match the hero's density.
// Flora keeps its size. Catch reach, speed and wander range still use the old size, so gameplay is unchanged. ?npcscale=classic: old.
const FF_FAUNA_K = 0.45;
const ffDisplaySize = (a) => (TOWN_NPC_SCALE && a.kind === 'fauna' ? Math.max(14, Math.min(32, Math.round(Math.max(a.w, a.h) * FF_FAUNA_K))) : Math.max(14, a.w, a.h));
const NPC_POS = { x: 1550, y: 540 };
const NPC_RADIUS = 48;
const NPC_NAME = '🧪 Professor Byte';
const QUEST_RESOURCES = [
  { key: 'wood', icon: '🪵' }, { key: 'stone', icon: '🪨' }, { key: 'fish', icon: '🐟' },
  { key: 'bugs', icon: '🦋' }, { key: 'fruit', icon: '🍎' }, { key: 'flowers', icon: '🌸' },
  { key: 'shells', icon: '🐚' },
];
const QUEST_REWARD_BASE = 6;
const DAILY_DEAL_BONUS = 0.5; // +50% sell price on one resource, picked daily
const BULK_SELL_THRESHOLD = 10; // sell 10+ of one resource at once for a bonus
const BULK_SELL_BONUS = 0.2; // +20% on any resource that hits the threshold
const NPC_LINES = [
  "Those stone heroes by the pond have stood guard so long the frogs think they're furniture.",
  "I've been counting your footsteps. You're very consistent. It's admirable.",
  "The hero statue hasn't blinked once since I've been standing here.",
  "Turnip prices are basically vibes-based. Don't ask me to explain further.",
  "I dug a hole once. Found nothing but more dirt. 0/10, not recommending it.",
  "If you listen closely during K.K. Slider's set, you can hear the campfire keeping time.",
  "Fossils are just rocks with better marketing, and I stand by that.",
  "I've met every kind of hero in this town except whichever one you just picked. Rude, honestly.",
  "Someone should really build a fence around my research. Hint hint.",
  "The shells on the beach regrow overnight. I have theories. None of them are good.",
  "I tried the Polyroll dice once. Lost all my stars in four seconds. Science.",
  "Achievements are just chores with better rewards.",
  "I'm 73% sure the Able Sisters just recolor the same four outfits.",
  "Day or night, rain or shine — I remain exactly this unbothered.",
  "Keep chatting nearby and someone's going to assume we're friends.",
  "I'm not saying the museum is understaffed. I'm saying it's me. It's always been me.",
];
const NPC_RAIN_LINES = [
  "Ugh, it's raining again. My notes are getting soggy and so is my mood.",
  "On the bright side, the fireflies don't care about rain. Lucky them.",
  "I'd go inside, but then who'd stand here being damp and philosophical?",
  "Rain means the turnip stall smells like wet cardboard. You're welcome for that image.",
];
const NPC_NIGHT_LINES = [
  "Night shift! The stars are just pixels that stayed up late. Probably.",
  "Fireflies are out. I've named all of them Gerald. Saves time.",
  "Shouldn't you be asleep? Shouldn't I? Science never sleeps. It yawns a lot, though.",
];
// Second resident NPC — a grumpy old dockhand who hangs out by the pond's
// pier, as far from Professor Byte (over by the statue) as the map allows.
// Purely flavor-text, client-side only, same pattern as NPC_* above but no
// daily quest — kept deliberately simple.
const NPC2_POS = { x: 480, y: 660 };
const NPC2_RADIUS = 48;
const NPC2_NAME = '🎣 Salty Mo';
const NPC2_LINES = [
  "Forty years on this dock and the fish still won't tell me their names.",
  "You call that a cast? My grandmother fishes better, and she's a statue.",
  "I don't trust that Merchant fella. Shows up, sells junk, vanishes. Suspicious.",
  "Back in my day we didn't have a shop. We just argued about turnip prices for free.",
  "That dock's been 'temporary' for forty years. Nobody's fixing it. Nobody asked me either.",
  "Heard the Professor's been talking to himself again. Takes one to know one, I guess.",
  "Those stone heroes on the bank ignore me completely. Rude, but I respect the commitment.",
  "Rain or shine, I'm out here. Mostly because nobody built me a house.",
  "Don't trust anyone who's never fallen off a dock. Builds character, and bruises.",
  "I've seen things in this pond. Mostly reflections. Still counts.",
  "You'd think with all this fishing someone would've caught a decent conversation.",
  "The Able Sisters keep asking if I want new clothes. I've had this hat since launch.",
  "That statue never waves back. I've tried for years. Pure ego, that one.",
  "Firefly season's my favorite. Less bugs biting, more bugs glowing. Fair trade.",
  "Folks keep digging for fossils. I've got a whole dock full of splinters, free of charge.",
  "I'm not grumpy, I'm just allergic to small talk. And most other talk, honestly.",
];
const NPC2_RAIN_LINES = [
  "Rain on the dock. My favorite. Said no one, ever, including me.",
  "Forty years and this dock still leaks worse than my patience right now.",
  "The fish bite better in the rain. Doesn't mean I have to enjoy catching them in it.",
  "Rain's just the sky doing the washing up it never finishes.",
];
const NPC2_NIGHT_LINES = [
  "Night fishing's the real fishing. The big ones come out when the tourists go home.",
  "Can't sleep. Dock creaks louder at night. Or maybe that's my back.",
  "Moon's bright tonight. Good for spotting shadows in the water. Shh.",
];
// Professor Byte's daily trivia — one question a day, same for everyone
// (same deterministic wall-clock-hash trick as the merchant/quest), a
// small star reward for a correct first answer, no retry once answered.
const TRIVIA_QUESTIONS = [
  { q: 'How many heroes can you pick from on the join screen?', choices: ['6', '8', '10', '12'], correct: 2 },
  { q: "What does Professor Byte's daily quest reset at?", choices: ['Noon local time', 'Midnight UTC', 'Every Monday', 'It never resets'], correct: 1 },
  { q: 'What do butterflies turn into at night?', choices: ['Moths', 'Fireflies', 'Nothing, they hide', 'Bats'], correct: 1 },
  { q: 'How much does a stone fence cost to place?', choices: ['1 wood', '1 stone', '2 flowers', '3 stone'], correct: 1 },
  { q: 'Which build-mode material is purely decorative and blocks no movement at all?', choices: ['Wall', 'Fence', 'Hedge', 'Lamp'], correct: 3 },
  { q: "What's the Mystery Merchant's visiting window length?", choices: ['1 hour', '3 hours', '6 hours', 'All day'], correct: 1 },
  { q: "How many fossil species does the Museum's full collection need?", choices: ['3', '5', '7', '10'], correct: 1 },
  { q: 'What multiplier does a winning Polyroll dice bet pay?', choices: ['2x', '3x', '5x', '10x'], correct: 2 },
  { q: 'How many hours a night does K.K. Slider play the campfire?', choices: ['1 hour', '2 hours', '3 hours', 'All night'], correct: 1 },
  { q: 'How many fossils can you carry in your bag before donating?', choices: ['1', '3', '5', '10'], correct: 1 },
  { q: 'What resource does a decorative Lamp cost?', choices: ['Wood', 'Stone', 'Flowers', 'Shells'], correct: 2 },
  { q: "What's the max number of players in town at once?", choices: ['5', '10', '20', 'Unlimited'], correct: 1 },
];
const TRIVIA_REWARD = 8;
const HOUSE_POS = { x: 1020, y: 760, w: 110, h: 70 };
const SHOP_RADIUS = 70;
// All the "minigame" structures (Polyroll, the turnip stall, the fishing
// tournament sign) and both portal doors live together in one consolidated
// arcade district, southeast of the statue — previously these were
// scattered across the whole map (the tournament sign in particular sat
// all the way on the opposite, western edge, by the main pond), which
// meant a lot of walking just to find them. Having one portal instead
// of the original two redundant ones is part of the same tidy-up.
const POLYROLL_POS = { x: 1900, y: 760 };
const POLYROLL_RADIUS = 50;
const MUSEUM_POS = { x: 900, y: 920, w: 100, h: 64 };
const MUSEUM_RADIUS = 70;
const FOSSIL_TYPES = ['🦴 T-Rex Bone', '🐚 Ancient Shell', '🦷 Mammoth Tooth', '🥚 Dino Egg', '🪨 Trilobite'];
// Fauna/flora sections of the museum are discovery-based, not donated —
// catching a bug or picking a flower marks that species seen permanently,
// independent of your bag (which you'll sell for stars, not hoard).
const FAUNA_TYPES = ['🦋 Butterfly', '✨ Firefly'];
const FLORA_TYPES = ['🌸 Cherry Blossom', '🌷 Tulip', '🌻 Sunflower', '🌹 Rose'];
const FOSSIL_SPOTS = [
  { x: 600, y: 1000 }, { x: 650, y: 1030 }, { x: 700, y: 1000 },
];
const FOSSIL_DIG_RADIUS = 40;
const FOSSIL_RESPAWN_MS = 25000;
const FOSSIL_BAG_CAP = 3;
const DIG_HOLE_POS = { x: 1200, y: 460 };
const DIG_HOLE_RADIUS = 36;

// The Realm Gate: a swirling portal in the quiet north-west of the village leading to the bullet-hell Realm.
const REALM_GATE_POS = { x: 750, y: 260 };
const REALM_GATE_RADIUS = 70;
// TN1: a signpost at the north-east end of the pond dock (drawDock, x 410-480, y 585-623) that sails to the Hearthvale
// Isles page. Leaving is a plain same-tab location change, exactly like the "World map" link: no net.* call, no save key.
const ISLES_SIGN_POS = { x: 505, y: 560 };
const ISLES_SIGN_RADIUS = 46;
const ISLES_SIGN_URL = 'games/isles/index.html?from=town';
const DOCK_ARRIVAL_POS = { x: 452, y: 596 }; // on the dock planks; clear of the sign and Salty Mo's talk radius
// TN2: a read-only "Postcards" board beside the plaza notice board. It reads the games' own medal summaries
// (pixeltown-medals-<game>-v1 through MMHubMedals' whitelist) and the hub profile's milestone lists (pixeltown-profile-v1,
// parsed + sanitized here, never MMHubProfile.load, which would seed and write the key) and shows calm "Recently: ..."
// lines. No timers, no streaks, nothing that expires; nothing is written; anything unknown or corrupt shows no line.
const POSTCARD_POS = { x: 1262, y: 540 };
const POSTCARD_RADIUS = 46;
const POSTCARD_MAX = 8;
const POSTCARD_WHERE = { isles: 'on the isles', angler: 'in Angler', bugs: 'in Bug Safari', deepdelve: 'in Deepdelve', stalk: 'at the Stalk Market' };
const POSTCARD_PROFILE = {
  jam: { where: 'at Campfire Jam', names: { play: 'First song', star1: 'First star', stars12: '12 stars', fullcombo: 'Full combo', hard3: '3 stars on a Hard song' } },
  lantern: { where: 'in the Lantern', names: { hero1: 'First hero', warren: 'A Warren find brought home', level5: 'A level 5 hero', level10: 'A level 10 hero', retire: 'A hero retired at level 20' } },
};
// Storage in, strings out: newest medals first per game (each summary key is append-only, so its tail is the latest).
function postcardLines(storage) {
  const lines = [];
  const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
  if (typeof MMHubMedals !== 'undefined' && MMHubMedals.read) {
    let got = {};
    try { got = MMHubMedals.read(storage) || {}; } catch (e) { got = {}; }
    Object.keys(POSTCARD_WHERE).forEach((g) => {
      const meta = own(MMHubMedals.GAMES, g) ? MMHubMedals.GAMES[g] : null;
      const ids = own(got, g) && Array.isArray(got[g]) ? got[g] : [];
      if (!meta) return;
      ids.slice(-2).reverse().forEach((id) => {
        const m = meta.medals.filter((x) => x[0] === id)[0];
        if (m) lines.push(`Recently: ${m[1]} ${POSTCARD_WHERE[g]}`);
      });
    });
  }
  if (typeof MMHubProfile !== 'undefined' && MMHubProfile.sanitize) {
    let raw = null;
    try { raw = JSON.parse(storage.getItem(MMHubProfile.KEY)); } catch (e) { raw = null; }
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      let prof = null;
      try { prof = MMHubProfile.sanitize(raw); } catch (e) { prof = null; }
      Object.keys(POSTCARD_PROFILE).forEach((g) => {
        const gm = prof && own(prof.games, g) && prof.games[g] && typeof prof.games[g] === 'object' ? prof.games[g] : null;
        const done = gm && Array.isArray(gm.done) ? gm.done.slice(0, 64) : [];
        const names = POSTCARD_PROFILE[g].names;
        const ok = done.filter((id, i) => typeof id === 'string' && own(names, id) && done.indexOf(id) === i);
        ok.slice(-2).reverse().forEach((id) => lines.push(`Recently: ${names[id]} ${POSTCARD_PROFILE[g].where}`));
      });
    }
  }
  return lines.slice(0, POSTCARD_MAX);
}
const DOOR_RADIUS = 34;
const TURNIP_STALL_POS = { x: 1760, y: 760 };
const TURNIP_STALL_RADIUS = 50;
const TURNIP_BUNDLE = 10;
const TURNIP_BUY_CYCLE_MS = 4 * 60 * 60 * 1000; // buy price changes every 4h
const TURNIP_SELL_CYCLE_MS = 15 * 60 * 1000; // sell price changes every 15min
// The sell price used to be a flat 20-240 roll every 15 minutes against a
// 90-130 buy price: positive expected value even selling at random, and
// unlimited bundles meant waiting for a high roll printed stars. Now most
// windows are below the buy price with an occasional spike (AC-style), and
// you can only buy a couple of bundles per (UTC) day.
const TURNIP_SPIKE_CHANCE = 0.15; // ~1 in 7 sell windows is a spike
const TURNIP_DAILY_BUNDLE_CAP = 2;

// Nook Miles-style achievements: lifetime counters (never decrease even
// when the resource is later sold/spent), checked after every relevant
// action. Each unlocks once, ever, per device.
const ACHIEVEMENTS = [
  { id: 'wood10', icon: '🪓', label: 'Lumberjack', desc: 'Chop 10 wood', reward: 5, check: (s) => (s.wood || 0) >= 10 },
  { id: 'stone10', icon: '⛏️', label: 'Miner', desc: 'Mine 10 stone', reward: 5, check: (s) => (s.stone || 0) >= 10 },
  { id: 'fish10', icon: '🐟', label: 'Angler', desc: 'Catch 10 fish', reward: 5, check: (s) => (s.fish || 0) >= 10 },
  { id: 'bugs10', icon: '🦋', label: 'Bug Catcher', desc: 'Catch 10 bugs', reward: 5, check: (s) => (s.bugs || 0) >= 10 },
  { id: 'fruit10', icon: '🍎', label: 'Orchardist', desc: 'Gather 10 fruit', reward: 5, check: (s) => (s.fruit || 0) >= 10 },
  { id: 'blocks10', icon: '🧱', label: 'Builder', desc: 'Place 10 blocks', reward: 5, check: (s) => (s.blocksPlaced || 0) >= 10 },
  { id: 'sparkle10', icon: '✨', label: 'Star Chaser', desc: 'Catch 10 sparkles', reward: 5, check: (s) => (s.sparkles || 0) >= 10 },
  { id: 'polyroll10', icon: '🎲', label: 'High Roller', desc: 'Play Polyroll 10 times', reward: 5, check: (s) => (s.polyrollPlays || 0) >= 10 },
  { id: 'turnipSold', icon: '🥬', label: 'Investor', desc: 'Sell turnips at the shop', reward: 5, check: (s) => (s.turnipsSold || 0) >= 1 },
  { id: 'cave1', icon: '⛰️', label: 'Spelunker', desc: 'Visit the underground cave', reward: 3, check: (s) => (s.caveVisits || 0) >= 1 },
  { id: 'chat10', icon: '👋', label: 'Friendly', desc: 'Send 10 chat messages', reward: 3, check: (s) => (s.chatSent || 0) >= 10 },
  { id: 'museumFull', icon: '🏛️', label: 'Paleontologist', desc: 'Donate all 5 fossil species', reward: 10, check: (s, scene) => scene.museumCollection && scene.museumCollection.size >= FOSSIL_TYPES.length },
  { id: 'mail1', icon: '📬', label: 'Pen Pal', desc: 'Collect your first letter', reward: 3, check: (s) => (s.lettersRead || 0) >= 1 },
  { id: 'mail25', icon: '💌', label: 'Postmaster', desc: 'Collect 25 letters', reward: 10, check: (s) => (s.lettersRead || 0) >= 25 },
  { id: 'mailBest', icon: '💖', label: 'Dear Friend', desc: 'Get a letter from a best friend', reward: 8, check: (s) => (s.bestFriendLetters || 0) >= 1 },
  { id: 'bugoffBronze', icon: '🥉', label: 'Bug Buddy', desc: 'Earn Bronze in a Bug-Off', reward: 3, check: (s) => (s.bugOffTiers || 0) >= 1 },
  { id: 'bugoffGold', icon: '🥇', label: 'Bug Champion', desc: 'Earn Gold in a Bug-Off (catch 15)', reward: 10, check: (s) => (s.bugOffGold || 0) >= 1 },
  { id: 'bugoffRegular', icon: '🦋', label: 'Bug-Off Regular', desc: 'Earn 10 Bug-Off prizes', reward: 8, check: (s) => (s.bugOffTiers || 0) >= 10 },
  { id: 'homeFirst', icon: '🏡', label: 'Home Sweet Home', desc: 'Place a crafted good on your home plot', reward: 3, check: (s) => (s.homePlaced || 0) >= 1 },
  { id: 'homeFull', icon: '🛋️', label: 'Interior Designer', desc: 'Fill every spot on your home plot', reward: 8, check: (s) => (s.homeFullPlots || 0) >= 1 },
  { id: 'homeCozy', icon: '🕯️', label: 'Cozy Corner', desc: 'Reach a cozy score of 30', reward: 8, check: (s) => (s.homeCozyBest || 0) >= 30 },
  { id: 'bday1', icon: '🎂', label: 'Party Guest', desc: "Give a villager a birthday gift", reward: 3, check: (s) => (s.birthdayGifts || 0) >= 1 },
  { id: 'bday5', icon: '🎉', label: 'Birthday Regular', desc: 'Give 5 birthday gifts', reward: 8, check: (s) => (s.birthdayGifts || 0) >= 5 },
  { id: 'bdayAll', icon: '🥳', label: 'Party Planner', desc: "Celebrate every villager's birthday", reward: 15, check: (s, scene) => !!scene.birthdayGuests && scene.birthdayGuests.size >= VILLAGERS.length },
  { id: 'daily1', icon: '📋', label: 'Daily Routine', desc: 'Finish every daily chore in one day', reward: 5, check: (s) => (s.dailyAllDone || 0) >= 1 },
  { id: 'daily7', icon: '🗓️', label: 'Creature of Habit', desc: 'Finish all daily chores on 7 different days', reward: 15, check: (s) => (s.dailyAllDone || 0) >= 7 },
  { id: 'fishSpecies5', icon: '🎣', label: 'Angler', desc: 'Log 5 different fish species', reward: 5, check: (s, scene) => !!scene.fishlog && scene.fishSpeciesCount() >= 5 },
  { id: 'fishSpecies12', icon: '🏆', label: 'Master Angler', desc: 'Log every fish species', reward: 15, check: (s, scene) => !!scene.fishlog && scene.fishSpeciesCount() >= FISH_SPECIES.length },
  { id: 'fishLunker', icon: '📏', label: 'Lunker', desc: 'Catch a fish 70cm or longer', reward: 5, check: (s) => (s.fishLunker || 0) >= 1 },
  { id: 'tank1', icon: '🐠', label: 'Fish Fan', desc: 'Show a fish in your home aquarium', reward: 3, check: (s) => (s.tankPlaced || 0) >= 1 },
  { id: 'tank3', icon: '🫧', label: 'Aquarist', desc: 'Fill your aquarium with 3 species', reward: 8, check: (s) => (s.tankFull || 0) >= 1 },
  { id: 'craft1', icon: '🔨', label: 'DIY Beginner', desc: 'Craft something at the workbench', reward: 3, check: (s) => (s.crafted || 0) >= 1 },
  { id: 'craft10', icon: '🛠️', label: 'Crafty', desc: 'Craft 10 items', reward: 5, check: (s) => (s.crafted || 0) >= 10 },
  { id: 'craftAll', icon: '🧰', label: 'Master Crafter', desc: 'Craft every recipe at least once', reward: 10, check: (s) => RECIPES.filter((r) => !r.season).every((r) => (s['craft_' + r.id] || 0) >= 1) },
  { id: 'craftSeason', icon: '🍁', label: 'Seasonal Crafter', desc: 'Craft a seasonal special', reward: 5, check: (s) => RECIPES.filter((r) => r.season).some((r) => (s['craft_' + r.id] || 0) >= 1) },
  { id: 'craftYear', icon: '📅', label: 'Year-Round Crafter', desc: 'Craft all four seasonal specials', reward: 15, check: (s) => RECIPES.filter((r) => r.season).every((r) => (s['craft_' + r.id] || 0) >= 1) },
  { id: 'weeds10', icon: '🌿', label: 'Weed Whacker', desc: 'Pull 10 weeds', reward: 3, check: (s) => (s.weedsPulled || 0) >= 10 },
  { id: 'weeds100', icon: '🧑‍🌾', label: 'Groundskeeper', desc: 'Pull 100 weeds', reward: 10, check: (s) => (s.weedsPulled || 0) >= 100 },
  { id: 'spotless1', icon: '✨', label: 'Spotless Town', desc: 'Pull every weed in town in one day', reward: 8, check: (s) => (s.spotlessDays || 0) >= 1 },
  { id: 'flowers10', icon: '🌸', label: 'Gardener', desc: 'Pick 10 flowers', reward: 5, check: (s) => (s.flowers || 0) >= 10 },
  { id: 'fence1', icon: '🪨', label: 'Fencer', desc: 'Place a stone fence', reward: 3, check: (s) => (s.stoneBlocksPlaced || 0) >= 1 },
  { id: 'npcChat5', icon: '🧪', label: 'Chatty', desc: "Talk to Professor Byte 5 times", reward: 3, check: (s) => (s.npcChats || 0) >= 5 },
  { id: 'photo1', icon: '📸', label: 'Photographer', desc: 'Take a photo', reward: 3, check: (s) => (s.photosTaken || 0) >= 1 },
  { id: 'merchant1', icon: '🛒', label: 'Collector', desc: 'Buy a rare look from the Mystery Merchant', reward: 5, check: (s) => (s.merchantBuys || 0) >= 1 },
  { id: 'lamp1', icon: '🪔', label: 'Illuminator', desc: 'Place a lamp', reward: 3, check: (s) => (s.lampsPlaced || 0) >= 1 },
  { id: 'quest3', icon: '📋', label: 'Quester', desc: "Complete 3 of Professor Byte's daily quests", reward: 5, check: (s) => (s.questsDone || 0) >= 3 },
  { id: 'hedge1', icon: '🌳', label: 'Landscaper', desc: 'Plant a hedge', reward: 3, check: (s) => (s.hedgesPlaced || 0) >= 1 },
  { id: 'path10', icon: '🟫', label: 'Pathfinder', desc: 'Lay 10 path tiles', reward: 5, check: (s) => (s.pathsPlaced || 0) >= 10 },
  { id: 'trivia3', icon: '📝', label: 'Know-It-All', desc: "Answer 3 of Professor Byte's daily trivia questions correctly", reward: 5, check: (s) => (s.triviaCorrect || 0) >= 3 },
  { id: 'scavenger1', icon: '🔍', label: 'Treasure Hunter', desc: "Win the daily scavenger hunt", reward: 5, check: (s) => (s.scavengerHuntsWon || 0) >= 1 },
  { id: 'tournament1', icon: '🎣', label: 'Big Catch', desc: "Set a new record in the daily fishing tournament", reward: 5, check: (s) => (s.tournamentRecordsSet || 0) >= 1 },
  { id: 'sellstreak3', icon: '🛍️', label: 'Regular', desc: "Sell at the shop on 3 different days", reward: 5, check: (s, scene) => (s.bestSellStreak || 0) >= 3 || ((scene && scene.sellDays) || 0) >= 3 }, // ID-09: same id, so unlocked stays unlocked
  // Residential Lane villagers + wildlife log. These read live scene state
  // (affinity lives in the save, discoveries in scene.ffDiscovered), so
  // they're re-checked from awardPoint()/incrementStat(), which both of
  // those systems already call, rather than from inside their code.
  { id: 'gift1', icon: '🎁', label: 'Thoughtful', desc: 'Give a villager a gift', reward: 3, check: (s) => (s.giftsGiven || 0) >= 1 },
  { id: 'gift10', icon: '💝', label: 'Generous', desc: 'Give villagers 10 gifts', reward: 5, check: (s) => (s.giftsGiven || 0) >= 10 },
  { id: 'bestfriend1', icon: '🤝', label: 'Best Buds', desc: 'Become best friends with a villager', reward: 10, check: (s, scene) => villagerBestFriendCount(scene) >= 1 },
  { id: 'bestfriendAll', icon: '🏘️', label: 'Beloved Neighbor', desc: 'Become best friends with every villager on Residential Lane', reward: 25, check: (s, scene) => villagerBestFriendCount(scene) >= VILLAGERS.length },
  { id: 'wildlife10', icon: '🔎', label: 'Naturalist', desc: 'Log 10 wildlife species', reward: 5, check: (s, scene) => wildlifeLoggedCount(scene) >= 10 },
  { id: 'wildlife25', icon: '🗒️', label: 'Field Researcher', desc: 'Log 25 wildlife species', reward: 10, check: (s, scene) => wildlifeLoggedCount(scene) >= 25 },
  { id: 'wildlife50', icon: '🔭', label: 'Biologist', desc: 'Log 50 wildlife species', reward: 15, check: (s, scene) => wildlifeLoggedCount(scene) >= 50 },
  { id: 'wildlifeAll', icon: '🌍', label: 'Living Encyclopedia', desc: `Log all ${FF_ASSETS.length} wildlife species`, reward: 30, check: (s, scene) => wildlifeLoggedCount(scene) >= FF_ASSETS.length },
  { id: 'faunaAll', icon: '🦊', label: 'Zoologist', desc: 'Log every animal species', reward: 15, check: (s, scene) => wildlifeLoggedCount(scene, 'fauna') >= FF_ASSETS.filter((a) => a.kind === 'fauna').length },
  { id: 'floraAll', icon: '🌿', label: 'Botanist', desc: 'Log every plant species', reward: 15, check: (s, scene) => wildlifeLoggedCount(scene, 'flora') >= FF_ASSETS.filter((a) => a.kind === 'flora').length },
];
// Helpers for the achievement checks above (VILLAGERS is declared further
// down, but these only run once the scene exists).
function villagerBestFriendCount(scene) {
  if (!scene || typeof scene.villagerTier !== 'function') return 0;
  return VILLAGERS.filter((v) => scene.villagerTier(v.id) >= 3).length;
}
function wildlifeLoggedCount(scene, kind) {
  if (!scene || !scene.ffDiscovered) return 0;
  return FF_ASSETS.filter((a) => (!kind || a.kind === kind) && scene.ffDiscovered.has(a.id)).length;
}
const CAMPFIRE_POS = { x: 800, y: 600 };
const CAMPFIRE_RADIUS = 60;
// Beachcombing: fixed spots along the pond edges, same pattern as fishing
// spots — a cooldown instead of a respawn timer, no network sync.
const BEACH_ITEMS = ['🐚', '🌊', '⭐'];
const BEACH_SPOTS = [
  { x: 190, y: 510 }, { x: 330, y: 510 }, { x: 170, y: 690 },
  { x: 2000, y: 380 }, { x: 2100, y: 210 },
];
const BEACH_PICKUP_RADIUS = 36;
const BEACH_RESPAWN_MS = 20000;
const FLOWER_TYPES = ['🌸', '🌷', '🌻', '🌹'];
const FLOWER_SPOTS = [
  // cyc0-S: the 4th patch sat 22 px from the Kart Rally door, and flowers answer E before doors in interact(), so E at that
  // door picked the flower (door reachable over 40% of its range). It now sits in the middle of the four doors, clear of each.
  { x: 400, y: 450 }, { x: 650, y: 420 }, { x: 1700, y: 750 },
  { x: 1900, y: 915 }, { x: 2150, y: 600 }, { x: 350, y: 880 },
];
const FLOWER_PICKUP_RADIUS = 34;

// ---------- weeds & tidiness ----------
// Each (UTC) day a fresh, deterministic batch of weeds sprouts around the
// village — worldHash on the day number, never Math.random, so every client
// sees the same weeds without syncing anything. Pulling one is local-only
// (saved as `weedsPulled: {day, ids}`) and pays a star; clear them all for
// a bonus. The sprites come from ONE baked texture and are never redrawn.
const WEED_COUNT = 24;
const WEED_PULL_RADIUS = 38;
const WEED_STAR_REWARD = 1;
const WEED_SPOTLESS_BONUS = 5;
const WEED_SEED = 91;
const FLOWER_REGROW_MS = 30000;

// Scatters extra trees/rocks/flowers across the wilderness ring (between
// the village and the ocean) by pushing more entries into the exact same
// arrays the hand-placed village ones live in — the existing chop/mine/
// pick code doesn't need to know any of this, it just sees more trees.
// Deterministic (worldHash, not Math.random()) so every client generates
// the identical wilderness with zero network traffic, same trick as
// weather/the sparkle/the daily merchant already use with time instead
// of position. WORLD here is net.js's top-level `const` — plain classic
// scripts share one global lexical scope, same as main.js already
// relying on net.js's TownNet class without any import.
(function generateWilderness() {
  const land = {
    x: WORLD.originX + OCEAN_MARGIN,
    y: WORLD.originY + OCEAN_MARGIN,
    width: WORLD.width - OCEAN_MARGIN * 2,
    height: WORLD.height - OCEAN_MARGIN * 2,
  };
  const villagePad = 150; // keep generated decor off the village's own edge
  // Each tree is its own Phaser Graphics object (not a sprite), and those
  // are considerably more expensive to render than sprites/text — dense
  // generation at this scale (a ~13x-bigger land area than the village)
  // measurably hurt frame rate. Wide spacing keeps density sparse.
  const spacing = 480;
  for (let gx = land.x + spacing / 2; gx < land.x + land.width; gx += spacing) {
    for (let gy = land.y + spacing / 2; gy < land.y + land.height; gy += spacing) {
      const inVillage = gx > VILLAGE_BOUNDS.x - villagePad && gx < VILLAGE_BOUNDS.x + VILLAGE_BOUNDS.width + villagePad
        && gy > VILLAGE_BOUNDS.y - villagePad && gy < VILLAGE_BOUNDS.y + VILLAGE_BOUNDS.height + villagePad;
      if (inVillage) continue;
      const jitterX = (worldHash(gx, gy, 21) - 0.5) * spacing * 0.8;
      const jitterY = (worldHash(gx, gy, 22) - 0.5) * spacing * 0.8;
      const x = Math.round(gx + jitterX);
      const y = Math.round(gy + jitterY);
      const roll = worldHash(gx, gy, 23);
      if (roll < 0.16) {
        TREES.push([x, y]);
      } else if (roll < 0.26) {
        const frame = Math.floor(worldHash(gx, gy, 24) * 9);
        ROCKS.push([x, y, frame]);
      } else if (roll < 0.30) {
        FLOWER_SPOTS.push({ x, y });
      }
    }
  }
})();

// Rare species pulled from this repo's remaining unused 24x24 sprite
// strips — not in the regular SPECIES list, so the only way to wear one
// is to catch the Mystery Merchant during their daily 3-hour window.
const RARE_SPECIES = [
  { key: 'avalanchepunks', label: 'Avalanche Punks' },
  { key: 'coolcats_mohawks', label: 'Mohawk Cats' },
  { key: 'coolcats_tvheads', label: 'TV Head Cats' },
  { key: 'expansionpunks', label: 'Expansion Punks' },
  { key: 'frontpunks', label: 'Front Punks' },
  { key: 'intlpunks', label: "Int'l Punks" },
  { key: 'morepunks', label: 'More Punks' },
  { key: 'punks_grayscale', label: 'Grayscale Punks' },
  { key: 'punks_sepia', label: 'Sepia Punks' },
  { key: 'aliens_blue', label: 'Blue Aliens' },
  { key: 'aliens_green', label: 'Green Aliens' },
  { key: 'aliens_red', label: 'Red Aliens' },
];
// The only keys a stored/remote species may resolve to as an old sheet (?legacyart=1); everything else becomes a hero.
const LEGACY_SPECIES_KEYS = new Set(SPECIES.concat(RARE_SPECIES).map((s) => s.key));
const MERCHANT_POS = { x: 2250, y: 1000 };
const MERCHANT_RADIUS = 56;
const MERCHANT_COST = 15;
// Star sink for players already wearing today's rare look: a once-a-day
// gift box the merchant delivers to every Residential Lane villager.
const MERCHANT_GIFT_BOX_COST = 20;
const MERCHANT_GIFT_BOX_AFFINITY = 8; // same as one hand-delivered gift
const ABLE_SISTERS_POS = { x: 1150, y: 650, w: 70, h: 56 };
const ABLE_SISTERS_RADIUS = 55;
const GUESTBOOK_POS = { x: 1750, y: 520 };
// Daily scavenger hunt — one hidden spot a day, same for everyone (picked
// deterministically from the date, no network traffic needed), but
// "who found it first" genuinely needs a shared source of truth, so that
// part goes through a Firebase transaction (first write wins).
const SCAVENGER_SPOTS = [
  { x: 150, y: 950 }, { x: 2300, y: 300 }, { x: 1900, y: 1100 }, { x: 600, y: 250 },
  { x: 2000, y: 900 }, { x: 100, y: 450 }, { x: 1300, y: 1050 }, { x: 700, y: 1150 },
];
const SCAVENGER_RADIUS = 36;
const SCAVENGER_REWARD = 20;
const GRAVEYARD_POS = { x: 60, y: 700 };
// Daily fishing tournament — during a deterministic 2-hour window each
// day, every catch gets a random size, and the biggest one of the day
// (tracked via a Firebase transaction, same compare-and-swap shape as
// the scavenger hunt) wins whoever's holding it a one-time bonus.
const FISH_TOURNAMENT_HOURS = 2;
// Just the leaderboard-style "biggest catch today" sign — the actual
// tournament fishing still happens at the real FISHING_SPOTS (the ponds),
// this is only a display, so it can live with the other minigames instead
// of out by the pond on its own.
const FISH_TOURNAMENT_SIGN_POS = { x: 2040, y: 760 };
const FISH_TOURNAMENT_BONUS = 10;
const GUESTBOOK_RADIUS = 60;

const PANEL_COLLAPSE_KEY = 'pixeltown-panel-collapsed'; // own key; never part of the save
const GATE_POINTER_KEY = 'pixeltown-gate-pointer-v1'; // own key; never part of the save
const REMOTE_CAP = 60; // most remote players drawn at once (flood safety; the town's own cap is far lower)
const BLOCK_DRAW_CAP = 1500; // most build blocks drawn (a hostile /blocks flood must not freeze the town)
const FIRST_MINUTE_QUIET_MS = 60000; // new players: system chat lines wait this long (or until the gate) behind the gate chip
const GATE_POINTER_MIN_DIST = 300; // the Realm Gate pointer shows only while the gate is further than this
// Phone layout: narrow screens (portrait) OR a short touch screen (landscape phone).
const PANEL_PHONE_QUERY = '(max-width: 600px), (max-height: 500px) and (pointer: coarse)';
// ---------- daily checklist ----------
// A "Today" board (button in the player panel, or J) that lists every daily
// chore with live progress so players can see what is left: Professor Byte's
// request and trivia, the mailbox, weeds, the Bug-Off, the home plot visit
// and a villager's birthday (when there is one). Finishing every chore that
// applies today pays a one-time bonus. Local only; paid-day lives in the
// additive `dailies: {day, paid, days}` save key.
const DAILY_BONUS = 40; // cycle 4 D: was 5 (15 s of gathering at 33 stars/min); 40 is about 1.2 min, once a day, and the only chore payout above the daily quest (~11) so finishing the card is worth a detour
// ---------- villager birthdays ----------
// Every BIRTHDAY_CYCLE_DAYS (UTC) days one villager has a birthday: purely
// deterministic (day number -> villager), so it needs no network and is the
// same for everyone. On the day: their name tag gets a 🎂, a letter is
// guaranteed in the mailbox, and the first gift you give them pays a party
// bonus. Claims are saved under the additive `birthdays` key
// {claimed: ['day:id'], guests: [villager ids]}.
const BIRTHDAY_CYCLE_DAYS = 10;
const BIRTHDAY_STARS = 5;
const BIRTHDAY_EXTRA_AFFINITY = 12;
// Index into VILLAGERS of the birthday villager for a UTC day, or -1.
function birthdayIndexForDay(day) {
  const slot = ((Math.floor(day) % BIRTHDAY_CYCLE_DAYS) + BIRTHDAY_CYCLE_DAYS) % BIRTHDAY_CYCLE_DAYS;
  for (let i = 0; i < VILLAGERS.length; i++) if ((i * 2 + 1) % BIRTHDAY_CYCLE_DAYS === slot) return i;
  return -1;
}
// ---------- home plot ----------
// A small fenced plot where you display crafted goods as decor. It is YOUR
// plot: placement is local-only (other players don't see it), saved under the
// additive `home: {slots, paidDay}` key. Cozy score = sum of the goods'
// shop values; opening the plot for the first time each day pays a small
// visitor bonus. Placed goods leave your bag (so they can't be sold).
const HOME_POS = { x: 1650, y: 940 };
const HOME_RADIUS = 75;
const HOME_SLOTS = 6;
const HOME_BONUS_PER = 5; // cozy points per ⭐ of daily visitor bonus
const HOME_BONUS_CAP = 6;
// A small aquarium beside the plot: show off up to 3 species from your
// Angler's Journal (nothing is consumed). Each adds rarity x 2 cozy.
const HOME_TANK_SLOTS = 3;
const HOME_TANK_OFFSET = { x: -126, y: 0 };
const HOME_SLOT_OFFSETS = [[-52, -18], [0, -18], [52, -18], [-52, 22], [0, 22], [52, 22]];
// ---------- villager mailbox ----------
// Each (UTC) day the villagers you know write you letters with a small gift
// attached. Which villagers write, and what they send, is a pure function of
// (day, villager, friendship tier) via worldHash — no Math.random, no
// network: it is entirely local and identical for anyone with the same
// friendships. Claims are saved under the additive `mail` key.
const MAILBOX_POS = { x: 1125, y: 990 };
const MAILBOX_RADIUS = 70;
const MAIL_SALT = 131;
const MAIL_WRITE_CHANCE = [0.4, 0.6, 0.8, 1.01]; // best friends always write // by friendship tier 0..3
const LETTER_OPENERS = [
  ['Hello, neighbor! It was nice to meet you.', 'Just a quick note to say hi.', 'Hope the town is treating you well.'],
  ['Hi, friend! I was thinking about you.', 'Thanks for stopping by lately!', 'Wanted to drop you a line.'],
  ['Dear good friend, you always brighten my day.', 'I looked forward to writing this one.', 'Missing our chats, so here is a letter.'],
  ['Dearest best friend, you mean the world to me.', 'Okay, I will say it: you are my favorite person in town.', 'I wrote this twice because it matters.'],
];
const MAIL_STAR_BASE = 2;
// ---------- DIY workbench ----------
// Turns gathered resources into crafted goods (sold at the shop for ~1.4x
// the raw inputs; kept below the 1.7x deal+bulk raw rate so it can't be exploited;
// deal/bulk bonuses never apply to crafted goods). Local-only: nothing here touches the network.
const WORKBENCH_POS = { x: 1330, y: 800 };
const WORKBENCH_RADIUS = 70;
// R4: objects that answer E before a weed in interact(), with the exact centre and radius their isNear*() uses. weedSpotsForDay
// keeps r + 8 around each clear, so no weed is ever shadowed (shop, museum, scavenger spots and NPCs have their own rules there).
const WEED_SHADOW_RINGS = [
  { x: ABLE_SISTERS_POS.x + ABLE_SISTERS_POS.w / 2, y: ABLE_SISTERS_POS.y + ABLE_SISTERS_POS.h / 2, r: ABLE_SISTERS_RADIUS },
  { x: CAMPFIRE_POS.x, y: CAMPFIRE_POS.y, r: CAMPFIRE_RADIUS }, // only at concert time, kept clear every day
  { x: POLYROLL_POS.x, y: POLYROLL_POS.y, r: POLYROLL_RADIUS },
  { x: TURNIP_STALL_POS.x, y: TURNIP_STALL_POS.y, r: TURNIP_STALL_RADIUS },
  { x: WORKBENCH_POS.x, y: WORKBENCH_POS.y, r: WORKBENCH_RADIUS },
  { x: MAILBOX_POS.x, y: MAILBOX_POS.y, r: MAILBOX_RADIUS },
  { x: HOME_POS.x, y: HOME_POS.y, r: HOME_RADIUS },
  { x: GUESTBOOK_POS.x, y: GUESTBOOK_POS.y, r: GUESTBOOK_RADIUS },
  { x: ISLES_SIGN_POS.x, y: ISLES_SIGN_POS.y + 14, r: ISLES_SIGN_RADIUS },
  { x: POSTCARD_POS.x, y: POSTCARD_POS.y + 14, r: POSTCARD_RADIUS },
];
const RECIPES = [
  { id: 'plank', icon: '🪵', label: 'Plank Stack', cost: { wood: 3 }, value: 4 },
  { id: 'brick', icon: '🧱', label: 'Stone Brick', cost: { stone: 3 }, value: 4 },
  { id: 'stew', icon: '🍲', label: 'Fish Stew', cost: { fish: 2, fruit: 1 }, value: 4 },
  { id: 'bugjar', icon: '🫙', label: 'Bug Jar', cost: { bugs: 3, wood: 1 }, value: 6 },
  { id: 'pie', icon: '🥧', label: 'Fruit Pie', cost: { fruit: 4 }, value: 6 },
  { id: 'crown', icon: '🌼', label: 'Flower Crown', cost: { flowers: 4 }, value: 6 },
  { id: 'chime', icon: '🎐', label: 'Shell Chime', cost: { shells: 3, wood: 1 }, value: 6 },
  { id: 'lantern', icon: '🏮', label: 'Lantern', cost: { stone: 2, wood: 2, bugs: 2 }, value: 9 },
  // Seasonal specials: only craftable while their season is on (the goods
  // keep forever and can be sold or displayed any time).
  { id: 'wreath', icon: '💐', label: 'Tulip Wreath', cost: { flowers: 5, wood: 1 }, value: 9, season: 'spring' },
  { id: 'umbrella', icon: '⛱️', label: 'Beach Umbrella', cost: { shells: 4, wood: 2 }, value: 9, season: 'summer' },
  { id: 'jacko', icon: '🎃', label: "Jack-o'-Lantern", cost: { fruit: 4, bugs: 2 }, value: 9, season: 'autumn' },
  { id: 'snowman', icon: '⛄', label: 'Snowman', cost: { stone: 4, wood: 2 }, value: 9, season: 'winter' },
];
// Pickaxe upgrades (cave A5): crafted at the village Workbench or at a crafting table placed in the cave.
// Ores come from the cave inventory (iron / gold), the rest from the shared resource bag.
const PICK_RECIPES = [
  { tier: 1, icon: '⛏️', label: 'Stone Pickaxe', cost: { stone: 6, wood: 2 }, note: 'mines 30% faster · 150 blocks' },
  { tier: 2, icon: '⛏️', label: 'Iron Pickaxe', cost: { iron: 4, wood: 2 }, note: 'mines 2x faster · 300 blocks' },
  { tier: 3, icon: '⛏️', label: 'Gold Pickaxe', cost: { gold: 3, iron: 3 }, note: 'mines 3x faster · 120 blocks' },
];
const PICK_NAMES = ['Wooden', 'Stone', 'Iron', 'Gold'];
const PICK_DUR = [0, 150, 300, 120];
const SEASON_ICONS = { spring: '🌷', summer: '☀️', autumn: '🍂', winter: '❄️' };
const RES_ICONS = { wood: '🪵', stone: '🪨', fish: '🐟', bugs: '🦋', fruit: '🍎', shells: '🐚', flowers: '🌸', iron: '🔩', gold: '🟡', coal: '⚫' };
const GUESTBOOK_NOTE_MAX = 80;
const GUESTBOOK_COOLDOWN_MS = 60 * 1000; // one signing per minute, per client
const KK_CONCERT_START_HOUR = 19; // 7pm local time
const KK_CONCERT_END_HOUR = 21; // 9pm local time
const WEATHER_CYCLE_MS = 8 * 60 * 1000; // 8-minute weather windows
const WEATHER_RAIN_CHANCE = 0.3; // ~30% of windows are rainy
const WEATHER_RAIN_COUNT = 70;
// Arcade district doors (O-01, owner decision): original neutral names only. A door with a `url` opens that page in a NEW
// tab (rel=noopener) after a "this leaves the game" confirm, so Pixeltown stays open behind it; a door without one shows
// the "Coming soon" card. The doors used to carry third-party game names and same-tab links; those are gone.
const PORTALS = [
  { x: 1830, y: 870, label: '🚪 City Drive', color: 0x4fa0e0, url: null },
  { x: 1970, y: 870, label: '🚪 Night Racer', color: 0xe0454f, url: null },
  { x: 1830, y: 960, label: '🚪 Kart Rally', color: 0xffa726, url: 'https://olivers.tools/kart/' },
  { x: 1970, y: 960, label: '🚪 Neon Coast', color: 0xff4fa0, url: null },
];
// Cycle 1 S: the targets that answer E AFTER a weed in interact() (arcade doors, dig hole, Realm Gate, visiting merchant). A weed in
// pull range of any point of their ring would steal E, so their keep-clear is their real radius + WEED_PULL_RADIUS (the ring test in
// weedSpotsForDay adds 8, hence the - 8). Pushed here because PORTALS is declared after WEED_SHADOW_RINGS.
WEED_SHADOW_RINGS.push(
  ...PORTALS.map((p) => ({ x: p.x, y: p.y, r: DOOR_RADIUS + WEED_PULL_RADIUS - 8 })),
  { x: DIG_HOLE_POS.x, y: DIG_HOLE_POS.y, r: DIG_HOLE_RADIUS + WEED_PULL_RADIUS - 8 },
  { x: REALM_GATE_POS.x, y: REALM_GATE_POS.y + 30, r: REALM_GATE_RADIUS + WEED_PULL_RADIUS - 8 },
  { x: MERCHANT_POS.x, y: MERCHANT_POS.y, r: MERCHANT_RADIUS + WEED_PULL_RADIUS - 8 },
);
const EAST_POND = { cx: 2000, cy: 280, rx: 130, ry: 80 };
const MAIN_POND = { cx: 260, cy: 600, rx: 150, ry: 90 };

// A row of named animal-villager houses along the south edge of the
// village — a Residential Lane, in the gap below the pond/museum/shop
// cluster and well clear of the arcade district's foot traffic. Unlike
// Professor Byte/Salty Mo (flavor-only NPCs), each of these has its own
// species/personality, a liked-gift list drawn from the same resources
// the player already carries in their bag, and a 0-100 affinity tracked
// locally per villager — closer to the real Animal Crossing loop of
// "bring them something they like, they warm up to you over time."
const VILLAGER_HOUSE_W = 64;
const VILLAGER_HOUSE_H = 46;
const VILLAGER_RADIUS = 46;
const VILLAGERS = [
  {
    id: 'mocha', name: 'Mocha', species: 'coolcats', frame: 0, personality: 'Lazy',
    hx: 200, hy: 1080, roof: 0xd98f3b,
    likes: ['fruit', 'flowers'],
    lines: [
      "Ugh, mornings. Who invented those.",
      "I was *this* close to a nap. Then you showed up. Worth it, I guess.",
      "Food's the best hobby there is, and I will not be taking questions.",
    ],
    closeLines: [
      "You're basically furniture around here now. The good kind.",
      "I saved you a napping spot by the window. Don't tell the others.",
    ],
  },
  {
    id: 'frosty', name: 'Frosty', species: 'pudgypenguins', frame: 3, personality: 'Snooty',
    hx: 650, hy: 1080, roof: 0x6fa8d9,
    likes: ['shells', 'turnips'],
    lines: [
      "That outfit is... a choice. I respect the confidence, at least.",
      "I only associate with residents who have *taste*. You're on probation.",
      "Bells, dear. Everything of value costs bells.",
    ],
    closeLines: [
      "Fine. You have taste after all. Don't let it go to your head.",
      "I've decided you're my exception to 'everyone else is beneath me.'",
    ],
  },
  {
    id: 'buster', name: 'Buster', species: 'doge', frame: 1, personality: 'Jock',
    hx: 1300, hy: 1080, roof: 0x5ab06a,
    likes: ['fish', 'wood'],
    lines: [
      "Did a hundred laps of the plaza before breakfast. You should try it!",
      "Bet I can out-fish you. Bet. Name the pond, name the time.",
      "Gotta keep those gains up, even on an island. Especially on an island.",
    ],
    closeLines: [
      "You're my training buddy now, official, no takebacks.",
      "Knew you had it in you! High five! ...okay, gauntlet-bump works too.",
    ],
  },
  {
    id: 'lily', name: 'Lily', species: 'coolcats_frogs', frame: 2, personality: 'Peppy',
    hx: 1700, hy: 1080, roof: 0xe06fa0,
    likes: ['flowers', 'bugs'],
    lines: [
      "OMG hi!! I was just thinking about you, isn't that wild??",
      "Today is going to be the BEST day, I can just feel it!",
      "You have to come see the sunset from the dock later, promise me!",
    ],
    closeLines: [
      "You're seriously my favorite person on this whole island, no contest!",
      "I made you a flower crown in my head. It's beautiful. You're welcome.",
    ],
  },
  {
    id: 'spike', name: 'Spike', species: 'mohawks', frame: 4, personality: 'Cranky',
    hx: 2050, hy: 1080, roof: 0x8a5a5a,
    likes: ['stone', 'bugs'],
    lines: [
      "Back in my day we didn't have bridges. We swam. Builds character.",
      "You kids and your 'sparkles' and your 'emotes.' Bah.",
      "...fine, the weather's decent today. Don't quote me on it.",
    ],
    closeLines: [
      "You're alright, kid. Don't make me say it twice.",
      "Come by anytime. Door's open. Don't tell anyone I said that either.",
    ],
  },
];
// Villagers stroll around their front yard, picking a new spot every
// VILLAGER_WANDER_MS. The spot is a hash of (time bucket, villager id),
// so every client sees them in the same place without any syncing.
const VILLAGER_WANDER_MS = 20000;
const VILLAGER_HEARTS_RADIUS = 110; // friendship hearts show within this range
const VILLAGER_HEART_STEPS = [10, 25, 50, 75, 100]; // affinity per heart (first 3 = tiers)
const VILLAGER_DAILY_TALK_AFFINITY = 2; // first chat of the day, once per villager
const VILLAGER_TIER_NAMES = ['acquaintance', 'friend', 'good friend', 'best friend'];
const VILLAGER_GIFT_ICONS = {
  wood: '🪵', stone: '🪨', fish: '🐟', bugs: '🦋', fruit: '🍎', flowers: '🌸', shells: '🐚', turnips: '🥬',
};
const VILLAGER_SLEEP_LINES = ['Zzz...', '*mumbles something about bells* ...zzz'];
// First-chat-of-the-day greeting per personality; {name} is the player.
const VILLAGER_GREETINGS = {
  Lazy: "Oh hey, {name}. Wanna split a snack? I brought two. Well, I ate one.",
  Snooty: "Ah, {name}. You may approach. Briefly.",
  Jock: "{name}! Perfect timing, I just finished my warm-up! Feel the burn!",
  Peppy: "{name}!!! Eeee, you came to say hi! Best. Day. Ever!",
  Cranky: "Hmph. {name}. ...Good to see you, I suppose.",
};
// Personality-wide lines layered on top of each villager's own: `any` is
// mixed into normal chat, the rest kick in by time of day / weather.
const VILLAGER_PERSONALITY_LINES = {
  Lazy: {
    any: [
      "I counted the clouds today. Lost track at three. Good number, three.",
      "If you ever find a snack that's also a pillow, call me immediately.",
    ],
    morning: ["Is it still morning? Wake me when it's lunch. Or second breakfast."],
    evening: ["Evenings are great. It's like a nap, but for the whole sky."],
    night: ["Zzz... huh? Oh. Five more minutes... zzz..."],
    rain: ["Rain's the best. Nobody expects you to do anything when it rains."],
  },
  Snooty: {
    any: [
      "I've redecorated twice this week. Inspiration simply strikes the gifted.",
      "Do try to keep up with the trends, dear. It's exhausting watching you not.",
    ],
    morning: ["Good morning. My beauty routine takes ninety minutes. You're welcome."],
    evening: ["The sunset matches my roof. I arranged that, obviously."],
    night: ["*yawn* A lady needs her beauty sleep. Do come back tomorrow."],
    rain: ["This drizzle is simply ruining my cape. Hold the umbrella higher, please."],
  },
  Jock: {
    any: [
      "Protein! Carbs! Hustle! That's the whole recipe, buddy!",
      "Race you to the plaza! ...okay, I'll give you a head start. A small one.",
    ],
    morning: ["Morning jog: done! Morning stretch: done! Morning snack: in progress!"],
    evening: ["Cool-down stretches at sunset. That's how the pros do it!"],
    night: ["Zzz... one more rep... zzz..."],
    rain: ["Running in the rain builds grit! And puddles! Mostly puddles!"],
  },
  Peppy: {
    any: [
      "I'm thinking of starting a band! You can play tambourine! Or triangle!",
      "Did you see that butterfly?! It waved at me! I'm almost sure!",
    ],
    morning: ["Good morning, sunshine! Wait, YOU'RE the sunshine! Eee!"],
    evening: ["The sky's going all pink and orange! It's like a smoothie up there!"],
    night: ["Mmm... dreaming about... glitter... zzz..."],
    rain: ["Rainy days mean rainbows later! I've got my wishing face ready!"],
  },
  Cranky: {
    any: [
      "Kids these days and their fishing rods. We used our bare hands. Built character.",
      "My knees say the weather's turning. My knees are never wrong.",
    ],
    morning: ["What's so good about mornings? Name one thing. ...Coffee. Fine."],
    evening: ["Good, the sun's going down. Too bright out here all day."],
    night: ["Zzz... get off my lawn... zzz..."],
    rain: ["Rain, eh? Called it this morning. Nobody listens to the knees."],
  },
};

// Fixed, hand-picked landmarks for the town map overlay — deliberately a
// simple schematic (dots + labels on a plain backdrop), not a literal
// zoomed-out render of the actual sprites, which would be unreadable mud
// at the small size a map needs to be.
const MAP_LANDMARKS = [
  { x: 1650, y: 940, label: '🏡 Home plot' },
  { x: 2200, y: 760, label: '🦋 Bug-Off' },
  { x: 1125, y: 990, label: '📬 Mailbox' },
  { x: 1330, y: 800, label: '🔨 Workbench' },
  { x: 260, y: 600, label: 'Pond' },
  { x: EAST_POND.cx, y: EAST_POND.cy, label: 'East pond' },
  { x: HOUSE_POS.x + HOUSE_POS.w / 2, y: HOUSE_POS.y + HOUSE_POS.h / 2, label: 'Shop' },
  { x: MUSEUM_POS.x + MUSEUM_POS.w / 2, y: MUSEUM_POS.y + MUSEUM_POS.h / 2, label: 'Museum' },
  { x: ABLE_SISTERS_POS.x + ABLE_SISTERS_POS.w / 2, y: ABLE_SISTERS_POS.y + ABLE_SISTERS_POS.h / 2, label: 'Able Sisters' },
  { x: STATUE_POS.x, y: STATUE_POS.y, label: 'Statue' },
  { x: NPC_POS.x, y: NPC_POS.y, label: 'Prof. Byte' },
  { x: NPC2_POS.x, y: NPC2_POS.y, label: 'Salty Mo' },
  { x: GRAVEYARD_POS.x, y: GRAVEYARD_POS.y, label: 'Graveyard' },
  { x: WINDMILL_POS.x, y: WINDMILL_POS.y, label: 'Windmill' },
  { x: CAMPFIRE_POS.x, y: CAMPFIRE_POS.y, label: 'Campfire' },
  // Polyroll, the turnip stall, the tournament sign, and both portal
  // doors all live together here — one pin for the whole district
  // instead of 5 crowded ones this close together at map scale.
  { x: 1900, y: 800, label: '🕹️ Arcade' },
  { x: 1125, y: 1080, label: '🏡 Residential Lane' },
];

const FISHING_SPOTS = [
  { x: 115, y: 600 },
  { x: 260, y: 700 },
  { x: 2000, y: 170 },
  { x: 1865, y: 280 },
];
const FISH_INTERACT_RADIUS = 36;
const FRUIT_TREE_EVERY = 3;
const BUG_COUNT = 8;
const BUG_CATCH_RADIUS = 40;
const BUG_RESPAWN_MS = 15000;
// ---------- daily Bug-Off ----------
// A local, deterministic 2-hour window each day (hour from the day's hash,
// like the fishing tournament). During it extra bugs flutter around and
// respawn much faster; catch 5 / 10 / 15 for Bronze / Silver / Gold prizes.
// Nothing touches the network: progress lives in the additive `bugoff` save
// key {day, count, tier, best} and resets each day (best is lifetime).
const BUGOFF_HOURS = 2;
const BUGOFF_EXTRA_BUGS = 8;
const BUGOFF_RESPAWN_MS = 3500;
const BUGOFF_TIERS = [
  { name: 'Bronze', icon: '🥉', need: 5, reward: 3 },
  { name: 'Silver', icon: '🥈', need: 10, reward: 6 },
  { name: 'Gold', icon: '🥇', need: 15, reward: 10 },
];
const BUGOFF_SIGN_POS = { x: 2200, y: 760 };
const ROCK_MINE_RADIUS = 30;
const FISH_BITE_WAIT_MIN = 1800;
const FISH_BITE_WAIT_MAX = 4000;
const FISH_BITE_WINDOW = 1300;
// Visible fish shadows swimming in both ponds (client-local, cosmetic
// positions): walk up to one and the Fish button / E casts right at it.
// Each zone is a convex slice of a pond's ellipse so a straight swim
// between two points never leaves the water — the main pond is split
// into north/south halves because its middle row is the walkable bridge
// corridor (see drawPond's two obstacle rects).
const FISH_SHADOW_REACH = 72;
const FISH_SHADOW_ZONES = [
  { pond: MAIN_POND, count: 3, yMax: MAIN_POND.cy - 40 },
  { pond: MAIN_POND, count: 3, yMin: MAIN_POND.cy + 40 },
  { pond: EAST_POND, count: 4 },
];
// ---------- angler's journal ----------
// Every fish you reel in is now a species, depending on the pond, the time of
// day and the season (bigger shadows lean rarer). Catches are local, so
// Math.random is fine here. Progress lives in the additive `fishlog` key
// {caught: {id: {n, best}}, claimed: [tier ids], lastDay}. First catches and
// milestone sets (4 / 8 / 12 species) pay ⭐, saved before paying.
const FISH_SPECIES = [
  { id: 'minnow', icon: '🐟', name: 'Minnow', rarity: 1 },
  { id: 'shrimp', icon: '🦐', name: 'Shrimp', rarity: 1 },
  { id: 'frog', icon: '🐸', name: 'Pond Frog', rarity: 1, pond: 'main', seasons: ['spring', 'summer'] },
  { id: 'koi', icon: '🐠', name: 'Koi', rarity: 2, pond: 'main' },
  { id: 'puffer', icon: '🐡', name: 'Pufferfish', rarity: 2, pond: 'east' },
  { id: 'crab', icon: '🦀', name: 'Mud Crab', rarity: 2, time: 'night' },
  { id: 'turtle', icon: '🐢', name: 'Snapping Turtle', rarity: 2, pond: 'east', time: 'day' },
  { id: 'squid', icon: '🦑', name: 'Squid', rarity: 3, time: 'night' },
  { id: 'jelly', icon: '🪼', name: 'Jellyfish', rarity: 3, seasons: ['summer'] },
  { id: 'octopus', icon: '🐙', name: 'Octopus', rarity: 3, pond: 'east', time: 'night' },
  { id: 'shark', icon: '🦈', name: 'Baby Shark', rarity: 4, pond: 'east', time: 'day', seasons: ['summer', 'autumn'] },
  { id: 'goldfish', icon: '✨', name: 'Golden Fish', rarity: 4, seasons: ['winter'] },
];
const FISH_MILESTONES = [
  { id: 'set4', need: 4, reward: 5 },
  { id: 'set8', need: 8, reward: 12 },
  { id: 'set12', need: 12, reward: 30 },
];
const FISH_FIRST_CATCH_BONUS = 2;
const FISH_LUNKER_CM = 70;
const FISH_SHADOW_ALPHA = 0.42;
const FISH_SHADOW_RESPAWN_MIN = 4000;
const FISH_SHADOW_RESPAWN_MAX = 9000;

const GRID_SIZE = 32;
const BLOCK_PLACE_DISTANCE = 28;
const BLOCK_CAP = 150;
const BUILD_UNDO_WINDOW_MS = 10000;
const BLOCK_TYPES = {
  wood: { resource: 'wood', cost: 1, label: '🪵 Wall', color: 0x8a5a3b, stroke: 0x5a3a22, size: GRID_SIZE - 2, solid: true },
  stone: { resource: 'stone', cost: 1, label: '🪨 Fence', color: 0xb9bfc9, stroke: 0x7a818d, size: GRID_SIZE - 14, solid: true },
  lamp: { resource: 'flowers', cost: 2, label: '🪔 Lamp', color: 0x5a3a22, stroke: 0x3a2414, size: 6, solid: false },
  hedge: { resource: 'flowers', cost: 3, label: '🌳 Hedge', color: 0x3d7a33, stroke: 0x27511f, size: GRID_SIZE - 2, solid: true },
  path: { resource: 'stone', cost: 1, label: '🟫 Path', color: 0xcbb890, stroke: 0xa8956c, size: GRID_SIZE - 4, solid: false },
};


class TownScene extends Phaser.Scene {
  constructor() {
    super('Town');
  }

  init(data) {
    this.net = data.net;
    this.selfData = data.self;
    this.world = data.world;
    this.allPlayers = new Map(Object.entries(data.players));
  }

  preload() {
    // Town heroes (shared/mm-town-heroes.js): the hero strips replace the old species/decor sheets; ?legacyart=1 loads both.
    MMTownHeroes.preload(this);
    if (MMTownHeroes.legacyArt()) SPECIES.forEach((s) => {
      this.load.spritesheet(s.key, `../i/${s.key}-strip.png`, {
        frameWidth: FRAME_SIZE,
        frameHeight: FRAME_SIZE,
      });
    });
    if (MMTownHeroes.legacyArt()) RARE_SPECIES.forEach((s) => {
      this.load.spritesheet(s.key, `../i/${s.key}-strip.png`, {
        frameWidth: FRAME_SIZE,
        frameHeight: FRAME_SIZE,
      });
    });
    this.load.spritesheet('tulips', '../i/tulips-strip.png', { frameWidth: FRAME_SIZE, frameHeight: FRAME_SIZE });
    this.load.spritesheet('rocks', '../i/rocks-strip.png', { frameWidth: FRAME_SIZE, frameHeight: FRAME_SIZE });
    if (MMTownHeroes.legacyArt()) this.load.spritesheet('punkrocks', '../i/punkrocks-strip.png', { frameWidth: FRAME_SIZE, frameHeight: FRAME_SIZE });
    // mooncatrescue-strip.png is the one collection in i/ with no transparency
    // (solid white background baked in) — assets/ holds a chroma-keyed copy
    // just for the game; the original in i/ is left untouched.
    if (MMTownHeroes.legacyArt()) this.load.spritesheet('mooncats', 'assets/mooncats-strip.png', { frameWidth: FRAME_SIZE, frameHeight: FRAME_SIZE });
    if (MMTownHeroes.legacyArt()) this.load.spritesheet('boredapes', '../i/boredapes-strip.png', { frameWidth: 28, frameHeight: 28 });
    FF_ASSETS.forEach((a) => {
      this.load.svg(`ff_${a.id}`, `assets/flora-fauna/svg/${a.id}.svg`, { width: 64, height: 64 });
    });
    // Cycle 9 art (G): Codex T-batch PNG strips for the species that have them (shared/mm-town-fauna.js); the SVG above stays the fallback.
    if (window.MMTownFauna) MMTownFauna.preload(this);
  }

  create() {
    // Bake every hero once (24 px, crisp), alias the old species keys to mapped heroes, start the setFrame-only animator.
    MMTownHeroes.bake(this, SPECIES.concat(RARE_SPECIES).map((s) => s.key).concat(['boredapes']));
    MMTownHeroes.animate(this);
    this.pixelizeFloraFauna();
    if (window.MMTownFauna) MMTownFauna.bake(this);
    this.physics.world.setBounds(this.world.originX, this.world.originY, this.world.width, this.world.height);
    this.cameras.main.setBounds(this.world.originX, this.world.originY, this.world.width, this.world.height);
    // Phones (and especially standalone "Add to Home Screen" launches, which
    // have no browser chrome eating into the viewport) show a lot less of the
    // world at zoom 2 — zoom out a bit so HUD panels don't end up covering
    // most of what's visible. Zoomed out further still (was 2/1.5) so more
    // of the surroundings are visible at once — sprites are still a very
    // legible ~38px/29px on screen at these levels.
    this.baseZoom = IS_TOUCH ? 1.2 : 1.6;
    // the render scale may already be applied (TN2 low tier starts at 0.75): keep the visible world unchanged
    const gc0 = document.getElementById('game-container');
    this.cameras.main.setZoom(this.baseZoom * ((gc0 && Number(gc0.dataset.renderZoom)) || 1));

    this.obstacles = this.physics.add.staticGroup();
    this.remotePlayers = new Map();
    this.startFirstMinuteQuiet();

    this.drawOcean();
    this.drawWilderness();
    this.drawGround();
    this.drawPath();
    this.drawPond();
    this.drawPondCats();
    this.drawDock();
    this.drawIslesSign();
    this.drawPostcardBoard();
    this.drawBenches();
    this.drawEastPond();
    this.drawBridge();
    this.drawHouse();
    this.drawStatue();
    this.drawWindmill();
    this.drawCampfire();
    this.drawNPC();
    this.drawNPC2();
    this.drawMerchant();
    this.drawDigHole();
    this.drawRealmGate();
    this.drawArcadeSign();
    this.drawDoors();
    this.drawPolyrollBooth();
    this.drawMuseum();
    this.drawTurnipStall();
    this.drawAbleSisters();
    this.drawGuestbook();
    this.drawWorkbench();
    this.drawMailbox();
    this.drawHomePlot();
    this.drawNoticeBoard();
    this.setupScavengerHunt();
    this.drawGraveyard();
    this.setupFishTournament();
    this.drawFossilSpots();
    this.drawBeachItems();
    this.drawFlowers();
    this.drawForestRing();
    this.drawTulipBeds();
    this.drawRocks();
    this.drawPunkRocks();
    this.drawVillagers();
    this.drawFloraFauna();

    this.createLocalPlayer(this.selfData);
    this.applyArrivalSpot();
    this.physics.add.collider(this.localBody, this.obstacles);

    this.allPlayers.forEach((p) => {
      if (p.id !== this.selfData.id) this.addRemotePlayer(p);
    });

    this.cameras.main.startFollow(this.localBody, true, 0.15, 0.15);
    // A small deadzone so tiny back-and-forth steps (lining up to fish,
    // shuffling next to a villager) don't drag the whole view around; the
    // lerp itself is re-derived per frame in updateLocalMovement so the
    // camera eases the same on 60Hz and 120Hz+ displays.
    this.cameras.main.setDeadzone(24, 16);

    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys('W,A,S,D');
    this.runKey = this.input.keyboard.addKey('SHIFT', false);
    // createCursorKeys()/addKeys() capture their keys by default and call
    // preventDefault() on them globally — including SPACE, W, A, S, D —
    // which blocks typing a space or those letters into the chat input
    // (and the name input on the join screen) no matter which element has
    // focus. None of these need preventDefault for movement, so release
    // the capture entirely.
    this.input.keyboard.removeCapture('SPACE,W,A,S,D,UP,DOWN,LEFT,RIGHT');
    this.lastSentAt = 0;

    this.setupEmotes();
    this.setupSparkle();
    this.setupDayNight();
    this.setupSeason();
    this.time.addEvent({ delay: 60 * 60 * 1000, loop: true, callback: () => this.updateSeason() });
    this.kkEnjoyedWindow = loadSave().kkEnjoyedWindow || null;
    this.setupWeather();
    this.setupActivities();
    this.setupBuilding();
    this.setupWalkie();
    this.setupPortalReopen(); this.setupDoorSoon();
    this.setupPolyroll();
    this.setupAchievements();
    this.setupLoginStreak();
    this.setupSfxToggle();
    this.setupMusicToggle();
    this.setupSharedSettings();
    this.setupReduceMotionToggle();
    this.setupPhotoMode();
    this.setupEscClose();
    this.setupFishHint();
    this.setupGiftHint();
    this.setupSaveBackup();
    this.setupWhatsNew();
    this.setupWelcomeBack();
    this.setupTriviaKey();
    this.setupAchievementsUI();
    this.setupMuseumUI();
    this.setupFloraFaunaLog();
    this.setupKeysHelp();
    this.setupChangelogViewer();
    this.setupFeedbackButton();
    this.setupSettingsToggle();
    this.setupMap();
    this.setupOutfitShop();
    this.setupGuestbook();
    this.setupBugs();
    this.setupBugOff();
    this.setupBirthdays();
    this.setupFossils();
    this.setupWeeds();
    this.setupJournal();
    this.setupDailies(); // after weeds/mail/bug-off/home/birthdays exist
    this.setupPanelCollapse();
    this.setupWhereTo();
    this.setupGatePointer();
    this.setupSaveSync(); // beta S-02: follow saves made in another tab
    if (IS_TOUCH) {
      this.setupTouchControls();
      this.setupTiltShake();
      this.setupHaptics();
    }
    this.setupGamepad();
    this.pixelWorldLabels(); // cycle 2 art (G): emoji in world labels -> code-drawn pixel icons (?worldicons=0 = off)

    this.registerNetHandlers();
    this.registerChatUI();
    this.renderPlayerList();

    // Handlers are wired up — safe to start receiving live updates now.
    this.setupRealmMenu();
    this.setupRealmInvites();
    this.net.startListening();
  }

  update(time, delta) {
    this.cullOffscreen();
    this.pollGamepad();
    this.updateLocalMovement(time, delta);
    this.updateRemoteInterpolation(delta);
    this.updateSparkle(time);
    this.updateDayNight(time);
    this.updateConcert(time);
    this.updateWeather(time, delta);
    this.updateTurnipPriceLabels(time);
    this.updateBuildPreview();
    this.updateFishingRod();
    // Cheap distance check, only while the workbench is open: walking away closes it.
    if (this.workbenchOpen && !this.isNearWorkbench(WORKBENCH_RADIUS + 90)) this.closeWorkbench();
    if (this.mailboxOpen && !this.isNearMailbox(MAILBOX_RADIUS + 90)) this.closeMailbox();
    if (this.homeOpen && !this.isNearHome(HOME_RADIUS + 90)) this.closeHome();
    if (this.postcardsOpen && !this.isNearPostcards(POSTCARD_RADIUS + 90)) this.closePostcards();
    this.updateDigHoleHint();
    this.updateRealmGateHint();
    this.updateIslesSignHint();
    this.updatePostcardHint();
    this.updateGatePointer(time);
    this.updateFishHint();
    this.updateGiftHint();
    this.updateFloraFaunaHint();
    this.updateAnimalHello(time);
  }

  // ---------- movement ----------

  updateLocalMovement(time, delta) {
    const WALK_SPEED = 140;
    const RUN_SPEED = 220;
    // Clamp so a background-tab hitch doesn't turn into one huge step.
    const dt = Math.min(delta, 50);
    let vx = 0;
    let vy = 0;
    let running = false;

    if (this.canAct()) {
      if (this.cursors.left.isDown || this.wasd.A.isDown) vx -= 1;
      if (this.cursors.right.isDown || this.wasd.D.isDown) vx += 1;
      if (this.cursors.up.isDown || this.wasd.W.isDown) vy -= 1;
      if (this.cursors.down.isDown || this.wasd.S.isDown) vy += 1;
      running = !!(this.runKey && this.runKey.isDown);

      if (this.touchMove) {
        vx += this.touchMove.x;
        vy += this.touchMove.y;
      }
      if (this.tiltEnabled && this.tiltMove) {
        vx += this.tiltMove.x;
        vy += this.tiltMove.y;
      }
      if (this.padInput) { vx += this.padInput.x; vy += this.padInput.y; } // gamepad, see pollGamepad()
    }

    // Normalise so diagonals aren't ~41% faster; analog (tilt) input under
    // 1 keeps its partial magnitude.
    const mag = Math.hypot(vx, vy);
    if (mag > 1) {
      vx /= mag;
      vy /= mag;
    }

    // Walking away mid-cast used to just let the rod stay drawn to a spot
    // you'd left, with no feedback — now moving away cancels the cast
    // outright, same as leaving real Animal Crossing's fishing animation.
    if (mag > 0 && this.fishing && this.fishing.state !== 'idle') {
      this.showFloatingText(this.fishing.spot.x, this.fishing.spot.y - 24, 'left the line');
      this.endFishing();
    }

    const speed = running ? RUN_SPEED : WALK_SPEED;
    const body = this.localBody.body;
    let targetVx = vx * speed;
    let targetVy = vy * speed;

    // Corner assist: pushing straight into the very edge of an obstacle
    // used to dead-stop you on its corner. If a few px sideways would clear
    // it, slide around instead.
    if (mag > 0) {
      const slide = this.cornerSlide(body, vx, vy, speed, dt);
      if (slide) {
        targetVx = slide.x;
        targetVy = slide.y;
      }
    }

    // Quick ease in/out instead of instant start/stop: snappy enough to
    // still feel direct, but no more 0->full speed in one frame.
    // Exponential smoothing keeps it frame-rate independent.
    const tau = mag > 0 ? 45 : 30; // ms
    const k = 1 - Math.exp(-dt / tau);
    let nvx = body.velocity.x + (targetVx - body.velocity.x) * k;
    let nvy = body.velocity.y + (targetVy - body.velocity.y) * k;
    if (Math.abs(nvx) < 2 && targetVx === 0) nvx = 0;
    if (Math.abs(nvy) < 2 && targetVy === 0) nvy = 0;
    body.setVelocity(nvx, nvy);

    // Face where the player is steering, not where the body is drifting;
    // ignore tiny analog (tilt) noise so the sprite doesn't flicker.
    if (Math.abs(vx) > 0.15) this.localVisual.setFlipX(vx < 0);

    // Keep the camera ease consistent across refresh rates (0.15/frame @60fps).
    const camLerp = 1 - Math.pow(0.85, dt / (1000 / 60));
    this.cameras.main.setLerp(camLerp, camLerp);

    const moving = mag > 0.05;
    const bobDelta = running ? delta * (RUN_SPEED / WALK_SPEED) : delta;
    this.applyBob(this.localBobState, this.localVisual, this.localShadow, this.localBody.x, this.localBody.y, moving, bobDelta);
    this.localNameText.setPosition(this.localBody.x, this.localVisual.y - 22);
    if (this.realmGateSign) { // fade the local name label while it would sit on the Realm Gate sign
      const ov = Math.abs(this.localNameText.x - this.realmGateSign.x) < 60 && Math.abs(this.localNameText.y - this.realmGateSign.y) < 18;
      this.localNameText.setAlpha(ov ? 0.15 : 1);
    }
    if (moving) this.spawnFootstepDust(time, this.localBody.x, this.localBody.y + 10, running);

    // Only write when something changed — standing still used to fire a
    // full Firebase transaction every 100ms for nothing.
    if (time - this.lastSentAt > 100) {
      const x = Math.round(this.localBody.x * 10) / 10;
      const y = Math.round(this.localBody.y * 10) / 10;
      const facing = this.localVisual.flipX ? -1 : 1;
      const last = this.lastSentPos;
      if (!last || last.x !== x || last.y !== y || last.facing !== facing) {
        this.lastSentAt = time;
        this.lastSentPos = { x, y, facing };
        this.net.move(x, y, facing);
      }
    }
  }

  // Returns a replacement velocity that steers around an obstacle corner
  // when the body is blocked on the axis the player is pushing along and a
  // small perpendicular shift (up to CORNER px) would clear it, else null.
  cornerSlide(body, ix, iy, speed, dt) {
    const CORNER = 7;
    // touching (not blocked): world-bound hits only set blocked, and there is
    // no "around" to slide to at the edge of the map.
    const touching = body.touching;
    const tryAxis = (dir, horizontal) => {
      for (let d = 1; d <= CORNER; d++) {
        for (const side of [-1, 1]) {
          const px = body.x + (horizontal ? dir * 2 : side * d);
          const py = body.y + (horizontal ? side * d : dir * 2);
          if (this.physics.overlapRect(px, py, body.width, body.height, false, true).length === 0) {
            const v = Math.min(speed, (d / Math.max(dt, 1)) * 1000);
            return horizontal ? { x: 0, y: side * v } : { x: side * v, y: 0 };
          }
        }
      }
      return null;
    };
    if (iy === 0 && ix !== 0) {
      const dir = Math.sign(ix);
      if ((dir < 0 && touching.left) || (dir > 0 && touching.right)) {
        return tryAxis(dir, true);
      }
    } else if (ix === 0 && iy !== 0) {
      const dir = Math.sign(iy);
      if ((dir < 0 && touching.up) || (dir > 0 && touching.down)) {
        return tryAxis(dir, false);
      }
    }
    return null;
  }

  // A tiny, purely cosmetic dust puff under the player's feet while
  // walking — throttled so it's a trail of soft dots, not a solid smear.
  spawnFootstepDust(time, x, y, running) {
    if (this.lastDustAt && time - this.lastDustAt < (running ? 140 : 220)) return;
    this.lastDustAt = time;
    const puff = this.add.ellipse(x, y, 7, 4, 0xd8cfa8, 0.35).setDepth(y - 1);
    this.tweens.add({
      targets: puff,
      scaleX: 1.8,
      scaleY: 1.8,
      alpha: 0,
      duration: 450,
      ease: 'Sine.easeOut',
      onComplete: () => puff.destroy(),
    });
  }

  updateRemoteInterpolation(delta) {
    // Updates arrive ~10/s with network jitter. A fixed 0.25-per-frame lerp
    // was frame-rate dependent and made the hop stutter on/off between
    // packets; ease with a time constant instead, and decide "walking" from
    // the remaining distance to the target rather than this frame's step.
    const dt = Math.min(delta, 100);
    const k = 1 - Math.exp(-dt / 90);
    this.remotePlayers.forEach((rp) => {
      const dx = rp.targetX - rp.x;
      const dy = rp.targetY - rp.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 400 || dist < 0.05) {
        // Teleport (portal/rejoin) or already there: snap, don't glide across the map.
        rp.x = rp.targetX;
        rp.y = rp.targetY;
      } else {
        rp.x += dx * k;
        rp.y += dy * k;
      }
      rp.visual.setFlipX(rp.facing === -1);

      const moving = dist > 1.5 && dist <= 400;
      // Remote runners hop faster too (their updates land further apart).
      const bobDelta = moving ? delta * Math.min(1.6, Math.max(1, dist / 14)) : delta;
      this.applyBob(rp.bob, rp.visual, rp.shadow, rp.x, rp.y, moving, bobDelta);
      rp.nameText.setPosition(rp.x, rp.visual.y - 22);
      if (rp.bubble) rp.bubble.setPosition(rp.x, rp.visual.y - 40);
    });
  }

  // ---------- walk-cycle (squash/stretch hop, since the source sprites are single-pose) ----------

  applyBob(state, visual, shadow, anchorX, anchorY, moving, delta) {
    visual.htMoving = moving; visual.htAx = anchorX; visual.htAy = anchorY; // read by the hero animator (shared/mm-town-heroes.js)
    if (reduceMotion) {
      state.phase = 0;
      state.lift = 0;
      visual.x = anchorX;
      visual.y = anchorY;
      visual.setScale(1, 1);
      visual.setDepth(anchorY);
      shadow.x = anchorX;
      shadow.y = anchorY + 9;
      shadow.setScale(1, 1);
      return;
    }
    if (moving) {
      state.phase += (delta / 1000) * HOP_SPEED;
      const target = Math.abs(Math.sin(state.phase));
      state.lift += (target - state.lift) * (1 - Math.pow(0.4, Math.min(delta, 50) / 16.7));
    } else {
      state.phase = 0;
      state.lift += (0 - state.lift) * (1 - Math.pow(0.7, Math.min(delta, 50) / 16.7));
    }

    visual.x = anchorX;
    visual.y = anchorY - state.lift * HOP_HEIGHT;
    visual.setScale(1 - state.lift * 0.07, 1 + state.lift * 0.12);
    visual.setDepth(anchorY);

    shadow.x = anchorX;
    shadow.y = anchorY + 9;
    const shrink = 1 - state.lift * 0.35;
    shadow.setScale(shrink, shrink);
  }

  // ---------- emotes ----------

  setupEmotes() {
    this.lastEmoteAt = new Map(); // playerId -> last emoteAt we've already shown
    this.input.keyboard.on('keydown', (e) => {
      if (this.chatFocused) return;
      const i = Number(e.key) - 1;
      this.triggerEmote(i);
    });
  }

  triggerEmote(i) {
    if (i < 0 || i >= EMOTES.length) return;
    this.net.emote(EMOTES[i]);
    this.showEmoteBubble(this.selfData.id, EMOTES[i]);
  }

  showEmoteBubble(playerId, symbol) {
    const anchor = playerId === this.selfData.id
      ? this.localVisual
      : (this.remotePlayers.get(playerId) || {}).visual;
    if (!anchor) return;

    const bubble = this.add.text(anchor.x, anchor.y - 34, symbol, { fontSize: '20px' })
      .setOrigin(0.5)
      .setDepth(100001);
    this.tweens.add({
      targets: bubble,
      y: bubble.y - 14,
      alpha: { from: 1, to: 0 },
      duration: 1400,
      onComplete: () => bubble.destroy(),
    });
  }

  // ---------- sparkle minigame ----------
  // The active spot is derived from wall-clock time, so every client agrees
  // on where it is without any extra network traffic. Anyone nearby when it
  // rotates scores a point — casual and co-op, not first-click-wins.

  setupSparkle() {
    this.sparkleIndex = -1;
    this.sparkleCaught = false;
    this.sparkleStar = this.add.star(0, 0, 5, 6, 12, 0xfff2a8).setDepth(200001).setVisible(false);
    this.sparkleGlow = this.add.star(0, 0, 5, 9, 18, 0xffe066, 0.35).setDepth(200000).setVisible(false);
    this.tweens.add({
      targets: [this.sparkleStar, this.sparkleGlow],
      angle: 360,
      duration: 4000,
      repeat: -1,
    });
    // Cycle 11 L: offline, the star wallet is kept in the save (additive key `stars`, 0..1e9), so it no longer starts at 0 on every
    // visit. Online is unchanged on purpose (the server sets the score to 0 at join and the player list ranks stars earned this
    // visit): carrying the wallet online changes the live leaderboard and the economy, which is a design call (cycle11-lead.md).
    this.localScore = this.starsPersist() ? cleanCount(loadSave().stars) : 0;
    this._starsBase = this.localScore; // what storage held when this tab last read or wrote it; saveStars adds only (mine - base)
    if (this.localScore && this.selfData) this.selfData.score = this.localScore;
  }

  starsPersist() { return !!(this.net && this.net.offline); }

  // Stars are a counter like the bag: stored + this tab's own change, so two offline tabs never undo each other. A refused write
  // (null) keeps the base, so the change stays a pending delta for the next save that lands.
  saveStars() {
    if (!this.starsPersist()) return;
    const base = Number(this._starsBase) || 0;
    const p = writeSaveMerged((stored) => ({ stars: cleanCount(cleanCount(stored.stars) + ((Number(this.localScore) || 0) - base)) }));
    if (!p) return;
    this.localScore = p.stars;
    this._starsBase = p.stars;
  }

  updateSparkle(time) {
    const index = Math.floor(time / SPARKLE_ROTATE_MS) % SPARKLE_SPOTS.length;
    if (index !== this.sparkleIndex) {
      this.sparkleIndex = index;
      this.sparkleCaught = false;
      const [x, y] = SPARKLE_SPOTS[index];
      this.uncull(this.sparkleStar.setPosition(x, y).setVisible(true)); // moved: never keep the cull bit of its old spot
      this.uncull(this.sparkleGlow.setPosition(x, y).setVisible(true));
    }

    if (this.sparkleCaught) return;
    const [sx, sy] = SPARKLE_SPOTS[this.sparkleIndex];
    if (Math.hypot(this.localBody.x - sx, this.localBody.y - sy) < SPARKLE_CATCH_RADIUS) {
      this.sparkleCaught = true;
      this.awardPoint(1, '+1 ⭐', this.localBody.x, this.localBody.y - 30);
      this.incrementStat('sparkles');
    }
  }

  awardPoint(amount, label, x, y, sound) {
    this.localScore += amount;
    this.net.addScore(amount);
    this.saveStars();
    const mine = this.allPlayers.get(this.selfData.id);
    if (mine) mine.score = this.localScore;
    this.renderPlayerList();
    this.showFloatingText(x, y, label);
    (SFX[sound] || (amount < 0 ? SFX.deny : SFX.coin))();
    // Systems that award stars without bumping a stat (wildlife log,
    // villager tier-ups, museum) still get their achievements checked.
    if (amount > 0 && this.achievementsUnlocked) this.checkAchievements();
  }

  showFloatingText(x, y, text) {
    const t = this.add.text(x, y, text, {
      fontSize: '13px',
      fontFamily: 'monospace',
      color: '#ffe066',
      stroke: '#1c2430',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(100002);
    this.tweens.add({ targets: t, y: y - 24, alpha: { from: 1, to: 0 }, duration: 900, onComplete: () => t.destroy() });
  }

  // ---------- beta S-07 (b13-03): camera culling ----------
  // Phaser 3 batches every game object every frame, on-screen or not: in the Town ~800 of ~950 objects (decor, trees, labels, the
  // other island quadrants) are off camera at any time. Every 4th frame (or when the camera moved 48+ px) each top-level, world-space
  // object whose box lies fully outside the camera view plus a 320 px margin is excluded from the main camera through `cameraFilter`
  // (its own `visible` flag, which game code uses, is never touched). The margin covers anything that moves between two passes.
  // A pooled object that jumps to a new spot between two cull passes must not keep the cull bit of its old spot (it would be
  // undrawn for up to 3 frames). The next pass re-checks it normally.
  uncull(o) {
    const cam = this.cameras && this.cameras.main;
    if (o && cam && (o.cameraFilter & cam.id)) o.cameraFilter &= ~cam.id;
    if (o && o._cs) o._cs = 0; // cycle 4: its remembered box is stale, the next pass measures it again
    return o;
  }

  cullOffscreen() {
    const cam = this.cameras && this.cameras.main;
    if (!cam || !this.sys.displayList) return;
    if (this.cullOff) { if (this._culled) { this.sys.displayList.list.forEach((o) => { o.cameraFilter &= ~cam.id; }); this._culled = 0; this._cullAt = null; } return; } // test / debug switch
    const v = cam.worldView;
    if (!(v.width > 0)) return;
    this._cullN = ((this._cullN || 0) + 1) % 4;
    const moved = this._cullAt ? Math.abs(this._cullAt.x - v.x) + Math.abs(this._cullAt.y - v.y) : Infinity;
    if (this._cullN !== 0 && moved < 48) return;
    // cycle 4 (L hot path): reading x / y / displayWidth / displayHeight off ~900 objects of many shapes cost about 60 bytes per object
    // per pass (each read of a number field through a many-shapes lookup returns a fresh boxed number): 14.6 KB per frame, three
    // quarters of everything main.js allocated per frame. Now each object remembers its box as four whole numbers (_cl, _ct, _cr, _cb:
    // floor / ceil, so the box only grows and nothing is culled that was not before). A box that was the same on 3 passes in a row is
    // "settled": it is used as it is and measured again only every 8th pass (staggered over the list). Sprites (players, villagers,
    // animals: things that walk) are measured on every pass as before. A settled object that starts to move is seen within 8 passes
    // (32 frames) and the 320 px margin covers that; a pooled object that jumps goes through uncull() (measured on the next pass); a
    // hidden object forgets its box. A forced / first pass (_cullAt null) measures everything. An object with no size (an empty label)
    // is skipped as before and looked at again every 8th pass.
    const full = !this._cullAt;
    if (full) this._cullAt = { x: v.x, y: v.y }; else { this._cullAt.x = v.x; this._cullAt.y = v.y; }
    const pass = this._cullPass = ((this._cullPass | 0) + 1) & 0x3ffffff;
    const M = 320, x0 = v.x - M, y0 = v.y - M, x1 = v.right + M, y1 = v.bottom + M;
    const bit = cam.id;
    const list = this.sys.displayList.list;
    let culled = 0, measured = 0;
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (o.scrollFactorX !== 1 || o.scrollFactorY !== 1 || o.type === 'Container' || o.type === 'Graphics' || o.type === 'Particles' || o.type === 'ParticleEmitter') continue;
      // Hidden objects draw nothing anyway; never leave them culled. A pooled object (sparkle star, firefly) is moved and shown
      // between two cull passes: with a stale cull bit from its old spot it would stay undrawn for up to 3 frames in view.
      if (!o.visible) { if (o.cameraFilter & bit) o.cameraFilter &= ~bit; if (o._cs) o._cs = 0; continue; }
      let l, t, r2, b;
      // cycle 9 (L): an object that only sways around its home spot (shore foam, wave crests: 235 images on shared yoyo tweens) never
      // "settled", so 120 of them were measured on every pass, in view or far out at sea. It declares its reach (o._cpad, px) and its
      // box grown by that reach is pinned (_cs 4) on its first measure. While the pinned box is outside the cull line the true box
      // is too, so it is culled unmeasured; when the pinned box crosses the line it is measured exactly as before (same bits as the
      // old rule in every case). uncull(), hiding it or a forced pass drop the pin, and every 8th pass it is measured anyway, so one that
      // was moved out of its reach is seen as soon as any settled object (within 8 passes).
      if (!full && o._cs === 4 && pass - o._cv < 8) {
        if (o._cr < x0 || o._cl > x1 || o._cb < y0 || o._ct > y1) { if (!(o.cameraFilter & bit)) o.cameraFilter |= bit; culled++; continue; }
      }
      // cycle 10 (L, stamp fix): a Sprite that is plain decor and never moves (flower beds, rocks: 38 of 116 sprites) declares it
      // (o._cstill) and settles like an image: it was measured on every pass for nothing, and with the cycle 10 insects and strip
      // animals the pass went over its budget. Sprites that can walk are measured on every pass exactly as before.
      if (!full && o._cs === 3 && (o.type !== 'Sprite' || o._cstill) && pass - o._cv < 8) { if (o._cz) continue; l = o._cl; t = o._ct; r2 = o._cr; b = o._cb; } // _cz: it had no size (an empty label), skipped as before
      else if (o.type === 'Sprite' && !o._cstill) {
        // cycle 10 (L): sprites (players, villagers, animals) are measured on every pass. Reading their fields at the load sites all
        // ~980 objects of every type go through returned a fresh boxed number per read. They are measured in a helper only sprites
        // reach, and one that has not moved since its last measure keeps its box (see _cullSpriteBox). Same box, same bits as before.
        measured++;
        if (!this._cullSpriteBox(o, pass)) continue; // no size: nothing to cull (bit left as it is, as before)
        l = o._cl; t = o._ct; r2 = o._cr; b = o._cb;
      }
      else {
        const w = o.displayWidth, h = o.displayHeight;
        measured++;
        if (!(w > 0) || !(h > 0)) { if (!o._cz) { o._cz = 1; o._cv = pass - (i & 7); } else o._cv = pass; o._cs = 3; continue; } // no size: nothing to cull (bit left as it is, as before); looked at again every 8th pass
        if (o._cz) o._cz = 0;
        const r = (o.rotation ? Math.max(w, h) : 0); // rotated: use a square that contains it
        const left = o.x - w * (o.originX === undefined ? 0.5 : o.originX) - r, top = o.y - h * (o.originY === undefined ? 0.5 : o.originY) - r;
        l = Math.floor(left); t = Math.floor(top); r2 = Math.ceil(left + w + 2 * r); b = Math.ceil(top + h + 2 * r);
        if (o._cpad > 0) {
          if (full || o._cs !== 4 || l < o._cl || t < o._ct || r2 > o._cr || b > o._cb) { const pd = o._cpad; o._cl = l - pd; o._ct = t - pd; o._cr = r2 + pd; o._cb = b + pd; o._cs = 4; o._cv = pass - (i & 7); }
          else if (pass - o._cv >= 8) o._cv = pass;
        }
        else if (l === o._cl && t === o._ct && r2 === o._cr && b === o._cb) { if (o._cs < 3) { o._cs = (o._cs | 0) + 1; o._cv = o._cs === 3 ? pass - (i & 7) : pass; } else o._cv = pass; }
        else { o._cl = l; o._ct = t; o._cr = r2; o._cb = b; o._cs = 0; o._cv = pass; }
      }
      const out = r2 < x0 || l > x1 || b < y0 || t > y1;
      if (out) { if (!(o.cameraFilter & bit)) o.cameraFilter |= bit; culled++; } else if (o.cameraFilter & bit) o.cameraFilter &= ~bit;
    }
    this._cullMeasured = measured; // test hook: objects measured (not taken from the remembered box) on the last pass
    this._culled = culled;
  }

  // cycle 10 (L): the box of one Sprite for cullOffscreen, written to o._cl/_ct/_cr/_cb (whole numbers, the same floor / ceil as the
  // shared path). Only sprites come through here, so the field reads below see a handful of object shapes instead of every type in
  // the display list. Returns false for a sprite with no size.
  _cullSpriteBox(o, pass) {
    const w = o.displayWidth, h = o.displayHeight;
    if (!(w > 0) || !(h > 0)) { o._cv = pass; return false; }
    const r = (o.rotation ? Math.max(w, h) : 0); // rotated: use a square that contains it
    const left = o.x - w * o.originX - r, top = o.y - h * o.originY - r;
    const l = Math.floor(left), t = Math.floor(top), r2 = Math.ceil(left + w + 2 * r), b = Math.ceil(top + h + 2 * r);
    if (l !== o._cl || t !== o._ct || r2 !== o._cr || b !== o._cb) { o._cl = l; o._ct = t; o._cr = r2; o._cb = b; }
    o._cs = 0; o._cv = pass;
    return true;
  }

  // ---------- day/night ambience ----------

  setupDayNight() {
    // ONE full-screen ambient layer. History: the night wash was created with fill alpha 0 and
    // only had its object alpha animated, so it never showed (0 * x = 0) but still cost a full-screen
    // blended draw every frame, on top of the season wash, which is the same cost again. Now there is
    // a single layer, drawn only when it can actually be seen, so what players see is unchanged
    // (the season wash; the night wash stays invisible exactly as before, NIGHT_WASH_VISIBLE = false).
    this.ambientOverlay = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x0a1030, 0)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(300000)
      .setVisible(false);
    this.scale.on('resize', (size) => this.ambientOverlay.setSize(size.width, size.height));
    this.nightAlpha = 0;
    this.seasonWash = { color: 0xffffff, alpha: 0 };
    this.lastDayNightCheck = 0;
  }

  // Applies the season wash (and, only if NIGHT_WASH_VISIBLE, the night wash mixed exactly into the
  // same single layer: A = 1-(1-an)(1-as), C = (night*an + (1-an)*season*as) / A per channel).
  applyAmbient() {
    if (!this.ambientOverlay) return;
    const an = NIGHT_WASH_VISIBLE ? (this.nightAlpha || 0) : 0;
    const sw = this.seasonWash || { color: 0xffffff, alpha: 0 };
    const as = sw.alpha || 0;
    const A = 1 - (1 - an) * (1 - as);
    const key = `${an.toFixed(3)}|${sw.color}|${as}`;
    if (key === this.ambientKey) return; // unchanged: no state change
    this.ambientKey = key;
    if (A < 0.002) { this.ambientOverlay.setVisible(false); return; }
    const night = [0x0a, 0x10, 0x30];
    let rgb = 0;
    for (let i = 0; i < 3; i++) {
      const sc = (sw.color >> (16 - 8 * i)) & 255;
      const c = Math.round((night[i] * an + (1 - an) * sc * as) / A);
      rgb = (rgb << 8) | Math.max(0, Math.min(255, c));
    }
    this.ambientOverlay.setFillStyle(rgb, A).setVisible(true);
  }

  // ---------- seasons ----------
  // A faint color wash tied to the real-world month on each player's own
  // device — no new art, same "derive it from wall-clock time" trick used
  // everywhere else (sparkle, weather, K.K. Slider). Sits just under the
  // day/night overlay so night still darkens it normally.

  setupSeason() {
    this.seasonDecorSprites = SEASON_DECOR_SPOTS.map(({ x, y }) => this.add.text(x, y, '', { fontSize: '20px' }).setOrigin(0.5).setDepth(y).setVisible(false));
    this.updateSeason();
  }

  // 'winter' | 'spring' | 'summer' | 'autumn' from the local month.
  currentSeason() {
    const month = new Date().getMonth(); // 0=Jan
    if (month === 11 || month === 0 || month === 1) return 'winter';
    if (month >= 2 && month <= 4) return 'spring';
    if (month >= 5 && month <= 7) return 'summer';
    return 'autumn';
  }

  updateSeason() {
    const month = new Date().getMonth(); // 0=Jan
    let color;
    let alpha;
    let decorIcon = null;
    if (month === 11 || month === 0 || month === 1) { color = 0x9cd8ff; alpha = 0.08; decorIcon = '⛄'; } // winter
    else if (month >= 2 && month <= 4) { color = 0xcdf2a8; alpha = 0.06; } // spring
    else if (month >= 5 && month <= 7) { color = 0xfff2a0; alpha = 0.05; } // summer
    else { color = 0xe0a050; alpha = 0.09; decorIcon = '🎃'; } // autumn
    this.seasonWash = { color, alpha };
    this.applyAmbient();

    if (this.seasonDecorSprites) {
      this.seasonDecorSprites.forEach((sprite) => {
        if (decorIcon && TOWN_PERF.ambientLayers) sprite.setText(decorIcon).setVisible(true);
        else sprite.setVisible(false);
      });
    }
  }

  // ---------- weather ----------
  // Deterministic from wall-clock time, same trick as the sparkle: every
  // client hashes the current 8-minute window the same way, so rain
  // starts/stops in sync without any network traffic. Purely cosmetic —
  // nothing about gameplay changes while it rains.

  setupWeather() {
    this.rainDrops = [];
    const drops = Math.min(WEATHER_RAIN_COUNT, TOWN_PERF.rainDrops); // TN2: the low tier keeps MMPerf's spark cap
    for (let i = 0; i < drops; i++) {
      const d = this.add.rectangle(0, 0, 2, 16, 0xcfe9ff, 0.45)
        .setScrollFactor(0)
        .setDepth(300001)
        .setVisible(false);
      d.vy = Phaser.Math.Between(320, 460);
      this.rainDrops.push(d);
    }
    this.isRaining = null; // unknown yet, forces the first check to apply
  }

  isRainWindow(now) {
    const bucket = Math.floor(now / WEATHER_CYCLE_MS);
    const h = Math.sin(bucket * 12.9898) * 43758.5453;
    return (h - Math.floor(h)) < WEATHER_RAIN_CHANCE;
  }

  updateWeather(time, delta) {
    const raining = this.isRainWindow(Date.now());
    if (raining !== this.isRaining) {
      const wasKnown = this.isRaining !== null;
      this.isRaining = raining;
      this.rainDrops.forEach((d) => {
        d.setVisible(raining);
        if (raining) d.setPosition(Phaser.Math.Between(0, this.scale.width), Phaser.Math.Between(0, this.scale.height));
      });
      if (wasKnown) this.addChatLine({ system: true, ambient: true, text: raining ? '🌧️ it started raining' : '☀️ the rain cleared up' });
    }
    if (!raining) return;
    const w = this.scale.width;
    const h = this.scale.height;
    this.rainDrops.forEach((d) => {
      d.y += d.vy * (delta / 1000);
      d.x -= 40 * (delta / 1000);
      if (d.y > h) { d.y = -10; d.x = Phaser.Math.Between(0, w); }
      if (d.x < -10) d.x = w + 10;
    });
  }

  updateDayNight(time) {
    if (time - this.lastDayNightCheck < 1000) return;
    this.lastDayNightCheck = time;

    const now = new Date();
    const hour = now.getHours() + now.getMinutes() / 60;
    let night;
    if (hour >= 20 || hour < 5) night = 1;
    else if (hour >= 18) night = (hour - 18) / 2;
    else if (hour < 7) night = 1 - (hour - 5) / 2;
    else night = 0;

    this.nightAlpha = night * 0.45;
    this.applyAmbient();

    const isNightBugs = hour >= 19 || hour < 6;
    if (isNightBugs !== this.isNightBugs) {
      this.isNightBugs = isNightBugs;
      this.restyleBugs();
      (this.lampGlows || []).forEach((g) => g.setVisible(isNightBugs));
    }
  }

  restyleBugs() {
    if (!this.bugs) return;
    this.bugs.forEach((bug) => {
      bug.sprite.setText(this.isNightBugs ? '✨' : '🦋');
      if (bug.glowTween) { bug.glowTween.stop(); bug.glowTween = null; bug.sprite.setAlpha(1); }
      if (this.isNightBugs && TOWN_PERF.ambientLayers) {
        bug.glowTween = this.tweens.add({ targets: bug.sprite, alpha: { from: 0.4, to: 1 }, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      }
    });
  }

  // ---------- mobile: virtual D-pad + action buttons ----------

  // A short vibration pulse on any mobile button tap, where supported.
  // Honest caveat: iOS Safari has never implemented the Vibration API
  // (Apple's choice, not a bug here), so this is a no-op on iPhone —
  // it only does anything for Android friends in the group. Delegated
  // to the two button containers instead of touching every individual
  // handler.
  setupHaptics() {
    const haptic = () => { try { if (navigator.vibrate) navigator.vibrate(12); } catch (e) { /* unsupported */ } };
    ['mobile-controls', 'underground-controls'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('touchstart', (e) => { if (e.target.closest('button, #joystick')) haptic(); }, { passive: true });
    });
  }

  setupTouchControls() {
    this.touchMove = { x: 0, y: 0 };
    this.setupJoystick();

    const chatInput = document.getElementById('chat-input');
    document.getElementById('mobile-chat-btn').addEventListener('click', () => {
      document.getElementById('chat-input-row').classList.add('chat-input-visible');
      chatInput.focus();
    });

    const emotePopup = document.getElementById('emote-popup');
    EMOTES.forEach((symbol, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = symbol;
      btn.addEventListener('click', () => {
        this.triggerEmote(i);
        emotePopup.classList.add('hidden');
      });
      emotePopup.appendChild(btn);
    });
    const emoteToggleBtn = document.getElementById('emote-toggle-btn');
    emoteToggleBtn.addEventListener('click', () => {
      const willShow = emotePopup.classList.contains('hidden');
      emotePopup.classList.toggle('hidden');
      if (willShow) {
        // Positioned from the button's actual on-screen spot rather than a
        // hardcoded offset, so it keeps popping up directly above the
        // emote button if this row ever moves or gains/loses a neighbor.
        const btnRect = emoteToggleBtn.getBoundingClientRect();
        const popupRect = emotePopup.getBoundingClientRect();
        emotePopup.style.left = `${btnRect.right - popupRect.width}px`;
        emotePopup.style.right = 'auto';
        emotePopup.style.bottom = `${window.innerHeight - btnRect.top + 8}px`;
      }
    });

    const photoBtn = document.getElementById('mobile-photo-btn');
    if (photoBtn) photoBtn.addEventListener('click', () => this.takePhoto());
    // town-8bit: the touch strip shows Emotes, A, Chat and one "More" button; Build, Photo and Tilt sit behind More
    // (a class on #action-buttons, no per-frame work). Build mode keeps the tray open so B stays under the thumb.
    const moreBtn = document.getElementById('hud-more-btn');
    const strip = document.getElementById('action-buttons');
    if (moreBtn && strip) {
      const setMore = (open) => {
        strip.classList.toggle('more-open', open);
        moreBtn.setAttribute('aria-expanded', String(open));
        moreBtn.textContent = open ? '✕ Close' : '🧰 Tools'; // R4 D4 (b07-r2-10): was a second '☰ More' (the panel tab keeps that name)
      };
      this.setHudMore = setMore;
      setMore(false);
      moreBtn.addEventListener('click', () => setMore(!strip.classList.contains('more-open')));
    }
  }

  // Virtual analog stick (replaces the old 4-button D-pad). Pointer events
  // with capture, so the finger can slide off the pad and keep steering,
  // and only the first finger that lands on it is tracked — a second
  // finger tapping A/B at the same time never hijacks or freezes the
  // stick. Any way that finger's contact can end (lift, iOS cancelling the
  // touch for a system gesture, capture being lost, the tab losing focus)
  // recenters it, so the villager can't get stuck walking. Output goes
  // into this.touchMove, already read by updateLocalMovement; magnitude is
  // analog (a light push walks slower).
  setupJoystick() {
    const base = document.getElementById('joystick');
    const knob = document.getElementById('joystick-knob');
    if (!base || !knob) return;
    let activeId = null;
    const reset = () => {
      activeId = null;
      base.classList.remove('active');
      knob.style.transform = '';
      this.touchMove = { x: 0, y: 0 };
    };
    const track = (e) => {
      const r = base.getBoundingClientRect();
      const radius = r.width / 2;
      let dx = (e.clientX - (r.left + radius)) / radius;
      let dy = (e.clientY - (r.top + radius)) / radius;
      const mag = Math.hypot(dx, dy);
      if (mag > 1) { dx /= mag; dy /= mag; }
      const travel = radius - knob.offsetWidth / 2;
      knob.style.transform = `translate(${dx * travel}px, ${dy * travel}px)`;
      if (mag < JOYSTICK_DEADZONE) { this.touchMove = { x: 0, y: 0 }; return; }
      // Full speed a bit before the rim, so you don't have to pin the
      // thumb against the very edge to run.
      const strength = Math.min(1, (mag - JOYSTICK_DEADZONE) / (0.8 - JOYSTICK_DEADZONE));
      this.touchMove = { x: (dx / Math.min(1, mag)) * strength, y: (dy / Math.min(1, mag)) * strength };
    };
    base.addEventListener('pointerdown', (e) => {
      if (activeId !== null) return;
      e.preventDefault();
      activeId = e.pointerId;
      try { base.setPointerCapture(e.pointerId); } catch (err) { /* already released */ }
      base.classList.add('active');
      track(e);
    });
    base.addEventListener('pointermove', (e) => { if (e.pointerId === activeId) track(e); });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((type) => {
      base.addEventListener(type, (e) => { if (e.pointerId === activeId) reset(); });
    });
    window.addEventListener('blur', reset);
    document.addEventListener('visibilitychange', () => { if (document.hidden) reset(); });
    base.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // ---------- gamepad (Bluetooth Xbox / PlayStation / MFi controllers) ----------
  // Polled once a frame from update() via the standard Gamepad API, which
  // iOS Safari supports for paired Xbox/PS controllers (a pad only shows up
  // after its first button press — a browser privacy rule, not a bug).
  // Standard mapping: left stick or D-pad walks, A = interact (E),
  // X = gift (G), B = close the open overlay / leave chat, otherwise
  // toggle build (B), Start = map (M). Works alongside keyboard and touch;
  // movement is summed into the same vector, actions use the same canAct()
  // gate as every other input.
  setupGamepad() {
    this.padInput = { x: 0, y: 0 };
    this.padPrev = [];
    if (typeof navigator.getGamepads !== 'function') return;
    window.addEventListener('gamepadconnected', () => {
      this.addChatLine({ system: true, text: '🎮 Controller connected — stick/D-pad to walk, A interact, X gift, B build/close, Start map.' });
    });
    window.addEventListener('gamepaddisconnected', () => {
      this.padInput = { x: 0, y: 0 };
      this.padPrev = [];
    });
  }

  pollGamepad() {
    if (!this.padInput || typeof navigator.getGamepads !== 'function') return;
    let pad = null;
    try {
      pad = Array.from(navigator.getGamepads() || []).find((p) => p && p.connected);
    } catch (e) { /* blocked by permissions policy */ }
    if (!pad) {
      this.padInput.x = 0;
      this.padInput.y = 0;
      this.padPrev = [];
      return;
    }
    const held = pad.buttons.map((b) => !!b && (b.pressed || b.value > 0.5));
    const prev = this.padPrev;
    const justPressed = (i) => held[i] && !prev[i];
    // Buttons already down on the first poll (e.g. the press that woke the
    // pad up) count as "seen", so they don't fire an action on their own.
    const first = prev.length === 0;
    this.padPrev = held;

    let x = pad.axes[0] || 0;
    let y = pad.axes[1] || 0;
    const mag = Math.hypot(x, y);
    if (mag < PAD_DEADZONE) {
      x = 0;
      y = 0;
    } else {
      const s = Math.min(1, (mag - PAD_DEADZONE) / (1 - PAD_DEADZONE)) / mag;
      x *= s;
      y *= s;
    }
    if (held[14]) x -= 1;
    if (held[15]) x += 1;
    if (held[12]) y -= 1;
    if (held[13]) y += 1;
    this.padInput.x = Phaser.Math.Clamp(x, -1, 1);
    this.padInput.y = Phaser.Math.Clamp(y, -1, 1);
    if (first) return;
    if (this.navSheetOpen()) { // review N3: the sheet is modal for the pad too: no walking, no A/X/Start behind it; B closes it
      this.padInput.x = 0;
      this.padInput.y = 0;
      if (justPressed(1)) this.closeNavSheet();
      return;
    }

    if (justPressed(0) && this.canAct()) this.interact();
    if (justPressed(2) && this.canAct()) this.giveNearestVillagerGift();
    if (justPressed(1) && !this.closeTopOverlay() && this.canAct()) this.toggleBuildMode();
    if (justPressed(9)) {
      if (this.mapOpen) this.closeTopOverlay();
      else if (this.canAct()) document.getElementById('map-btn')?.click();
    }
  }

  // Closes whichever overlay is up by pressing its own ✕ button, so each
  // overlay's normal close logic (timers, flags) runs unchanged. Returns
  // false when nothing was open.
  closeTopOverlay() {
    if (this.navSheetOpen()) { this.closeNavSheet(); return true; } // the sheet sits above every Town overlay
    const overlays = [
      ['mapOpen', 'map-close-btn'], ['polyrollOpen', 'polyroll-close-btn'],
      ['achievementsOpen', 'achievements-close-btn'], ['outfitShopOpen', 'outfit-close-btn'],
      ['guestbookOpen', 'guestbook-close-btn'], ['triviaOpen', 'trivia-close-btn'],
      ['keysHelpOpen', 'keys-help-close-btn'], ['changelogOpen', 'changelog-close-btn'],
      ['museumOpen', 'museum-close-btn'], ['workbenchOpen', 'workbench-close-btn'], ['mailboxOpen', 'mailbox-close-btn'], ['homeOpen', 'home-close-btn'], ['dailiesOpen', 'dailies-close-btn'], ['journalOpen', 'journal-close-btn'], ['realmMenuOpen', 'realm-menu-close-btn'],
      ['postcardsOpen', 'postcards-close-btn'], ['doorSoonOpen', 'door-soon-close-btn'],
    ];
    const open = overlays.find(([flag]) => this[flag]);
    if (open) {
      const btn = document.getElementById(open[1]);
      if (btn) btn.click();
      return true;
    }
    if (this.chatFocused) {
      document.getElementById('chat-input').blur();
      return true;
    }
    return false;
  }

  // ---------- mobile: tilt steering + shake-to-interact ----------
  // iOS requires DeviceOrientation/DeviceMotion permission from a real tap,
  // so this only activates when the player presses the Tilt button.

  setupTiltShake() {
    this.tiltEnabled = false;
    this.tiltMove = { x: 0, y: 0 };
    this.tiltBaseline = null;
    this.lastAccelMag = null;
    this.lastShakeAt = 0;
    this.tiltPermissionGranted = false;
    this.boundOnDeviceOrientation = (e) => this.onDeviceOrientation(e);
    this.boundOnDeviceMotion = (e) => this.onDeviceMotion(e);

    const hasOrientation = typeof window.DeviceOrientationEvent !== 'undefined';
    const btn = document.getElementById('tilt-toggle-btn');
    if (!hasOrientation) {
      btn.style.display = 'none';
      return;
    }

    btn.addEventListener('click', () => this.toggleTilt(btn));
  }

  async toggleTilt(btn) {
    if (this.tiltEnabled) {
      this.tiltEnabled = false;
      this.tiltMove = { x: 0, y: 0 };
      window.removeEventListener('deviceorientation', this.boundOnDeviceOrientation);
      window.removeEventListener('devicemotion', this.boundOnDeviceMotion);
      btn.classList.remove('enabled');
      btn.textContent = '🎮 Tilt';
      return;
    }

    if (!this.tiltPermissionGranted) {
      try {
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
          const res = await DeviceOrientationEvent.requestPermission();
          if (res !== 'granted') {
            this.addChatLine({ system: true, text: 'Tilt controls need motion access — check Settings > Safari > Motion & Orientation Access.' });
            return;
          }
        }
        if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
          await DeviceMotionEvent.requestPermission();
        }
      } catch (e) {
        // Non-iOS browsers don't need permission — fall through and enable anyway.
      }
      this.tiltPermissionGranted = true;
    }

    this.tiltEnabled = true;
    this.tiltBaseline = null;
    btn.classList.add('enabled');
    btn.textContent = '🎮 Tilt ✓';

    window.addEventListener('deviceorientation', this.boundOnDeviceOrientation);
    window.addEventListener('devicemotion', this.boundOnDeviceMotion);
  }

  onDeviceOrientation(e) {
    if (!this.tiltEnabled) return;
    if (this.tiltBaseline === null) {
      this.tiltBaseline = { beta: e.beta || 0, gamma: e.gamma || 0 };
      return;
    }
    const dGamma = (e.gamma || 0) - this.tiltBaseline.gamma; // left/right lean
    const dBeta = (e.beta || 0) - this.tiltBaseline.beta; // forward/back lean
    this.tiltMove = {
      x: this.applyDeadzone(dGamma),
      y: this.applyDeadzone(dBeta),
    };
  }

  applyDeadzone(v) {
    const sign = Math.sign(v);
    const mag = Math.max(0, Math.abs(v) - TILT_DEADZONE_DEG);
    return sign * Math.min(1, mag / (TILT_RANGE_DEG - TILT_DEADZONE_DEG));
  }

  onDeviceMotion(e) {
    if (!this.tiltEnabled) return;
    const a = e.accelerationIncludingGravity || e.acceleration;
    if (!a || a.x === null) return;

    const mag = Math.sqrt((a.x || 0) ** 2 + (a.y || 0) ** 2 + (a.z || 0) ** 2);
    if (this.lastAccelMag !== null) {
      const jump = Math.abs(mag - this.lastAccelMag);
      const now = Date.now();
      if (jump > SHAKE_THRESHOLD && now - this.lastShakeAt > SHAKE_COOLDOWN_MS) {
        this.lastShakeAt = now;
        this.onShake();
      }
    }
    this.lastAccelMag = mag;
  }

  // Shared gate for any player-triggered action (interact, build toggle, etc.)
  // so chat/overlay state is respected no matter which input triggered it
  // (keyboard, on-screen button, or shake).
  canAct() {
    return !this.chatFocused && !this.polyrollOpen && !this.achievementsOpen && !this.outfitShopOpen && !this.guestbookOpen && !this.triviaOpen && !this.keysHelpOpen && !this.changelogOpen && !this.mapOpen && !this.museumOpen && !this.workbenchOpen && !this.mailboxOpen && !this.homeOpen && !this.dailiesOpen && !this.journalOpen && !this.realmMenuOpen && !this.postcardsOpen && !this.doorSoonOpen && !this.navSheetOpen() && !(this.sharedSettings && this.sharedSettings.isOpen()); // review N3: nothing acts behind the "Where to?" sheet
  }

  navSheetOpen() { try { return typeof MMNav !== 'undefined' && MMNav.isOpen(); } catch (e) { return false; } }
  // review N2: one dialog at a time. Anything that takes over the screen (Realm invite, Realm embed / arena, a Town overlay)
  // closes the sheet first, so focus is never trapped in a sheet hidden behind it and the sheet is not still open on return.
  closeNavSheet() { try { if (this.navSheetOpen()) MMNav.close(); } catch (e) { /* nav module missing: nothing to close */ } }

  // Shake is just a fun alternate trigger for the same interact() logic used
  // by the desktop 'E' key and the mobile Interact button.
  onShake() {
    if (this.canAct()) this.interact();
  }

  shakeTreeVisual(index) {
    const g = this.treeGraphics[index];
    if (!g) return;
    this.tweens.add({
      targets: g,
      angle: { from: -6, to: 6 },
      duration: 70,
      yoyo: true,
      repeat: 5,
      onComplete: () => g.setAngle(0),
    });
  }

  // ---------- activities: chop / mine / fish ----------
  // One shared action (desktop 'E', mobile Interact button, or a shake) that
  // figures out what's nearby and does the relevant thing. Wood/stone/fish
  // are a separate inventory from the sparkle leaderboard score — they only
  // feed the building system below.

  setupActivities() {
    const savedRes = loadSave().resources;
    const saved = savedRes && typeof savedRes === 'object' ? savedRes : {};
    // Finite, non-negative whole numbers only (a corrupt save can't mint
    // negative/Infinity/fractional stock).
    const n = (v) => { v = Math.floor(Number(v)); return Number.isFinite(v) && v > 0 ? v : 0; };
    this.resources = {
      wood: n(saved.wood),
      stone: n(saved.stone),
      fish: n(saved.fish),
      bugs: n(saved.bugs),
      fruit: n(saved.fruit),
      turnips: n(saved.turnips),
      shells: n(saved.shells),
      flowers: n(saved.flowers),
    };
    const sci = loadSave().caveInv;
    const si = sci && typeof sci === 'object' ? sci : {};
    // Cave materials (additive save key): dirt / coal / iron / gold collected underground.
    this.caveInv = {};
    ['dirt', 'coal', 'iron', 'gold'].forEach((k) => { this.caveInv[k] = Math.min(9999, n(si[k])); });
    // Cave pickaxe (additive key): { tier 0-3, dur }. A broken / corrupt pick falls back to the wooden one.
    const sPick = loadSave().cavePick; const pk = sPick && typeof sPick === 'object' ? sPick : {};
    let pt = Math.floor(Number(pk.tier)); pt = pt >= 1 && pt <= 3 ? pt : 0;
    let pd = Math.floor(Number(pk.dur)); pd = Number.isFinite(pd) ? Math.max(0, Math.min(PICK_DUR[pt], pd)) : 0;
    this.cavePick = pt > 0 && pd >= 1 ? { tier: pt, dur: pd } : { tier: 0, dur: 0 };
    // Cave world seed (additive key). 0 = the classic flat cave; a missing / invalid value gets a
    // fresh random seed once, which is then saved so your cave looks the same on every visit.
    const sSeed = loadSave().caveSeed;
    this.caveSeed = Number.isInteger(sSeed) && sSeed >= 0 && sSeed < 4294967296 ? sSeed : 1 + Math.floor(Math.random() * 4294967294);
    if (sSeed !== this.caveSeed) writeSave({ caveSeed: this.caveSeed }); // persist a freshly made seed right away, or a reload before the first sale would grow a different cave
    const sRealm = loadSave().realm;
    this.realmSave = sRealm && typeof sRealm === 'object' ? sRealm : {}; // sanitised again by RealmArena
    const savedCrafted = loadSave().crafted;
    const sc = savedCrafted && typeof savedCrafted === 'object' ? savedCrafted : {};
    this.craftedGoods = {};
    RECIPES.forEach((r) => { this.craftedGoods[r.id] = n(sc[r.id]); });
    this.snapshotResourceBase(); // beta S-02: delta writes start from what this tab loaded
    this.treeCooldowns = {};
    this.rockCooldowns = {};
    this.fishing = { state: 'idle', spot: null, bobber: null, timer: null };
    this.setupFishShadows();
    this.updateInventoryHUD();

    this.input.keyboard.on('keydown-E', () => { if (this.canAct()) this.interact(); });
    this.input.keyboard.on('keydown-G', () => { if (this.canAct()) this.giveNearestVillagerGift(); });
    const btn = document.getElementById('interact-btn');
    if (btn) btn.addEventListener('click', () => { if (this.canAct()) this.interact(); });
  }

  // Beta S-02: the counters this tab last loaded or wrote; saveResources adds only (mine - base) on top of storage.
  snapshotResourceBase() {
    this._saveBase = this._saveBase || {};
    this._saveBase.resources = { ...this.resources };
    this._saveBase.crafted = { ...this.craftedGoods };
    this._saveBase.caveInv = { ...this.caveInv };
  }

  saveResources() {
    if (!this._saveBase) this.snapshotResourceBase();
    const b = this._saveBase;
    const p = writeSaveMerged((stored) => ({
      resources: townMergeCounts(stored.resources, this.resources, b.resources),
      crafted: townMergeCounts(stored.crafted, this.craftedGoods, b.crafted),
      caveInv: townMergeCounts(stored.caveInv, this.caveInv, b.caveInv, 9999),
      caveSeed: this.caveSeed,
      cavePick: this.cavePick,
    }));
    if (!p) return;
    // Adopt what was written IN PLACE (the cave holds references to these objects), so another tab's gains show here too.
    let changed = false;
    [['resources', this.resources], ['crafted', this.craftedGoods], ['caveInv', this.caveInv]].forEach(([key, mine]) => {
      Object.keys(mine).forEach((k) => { const v = cleanCount(p[key][k]); if (mine[k] !== v) { mine[k] = v; changed = true; } });
    });
    this.snapshotResourceBase();
    if (changed) this.updateInventoryHUD();
  }

  interact() {
    if (this.inUnderground || this.inRealm) return;
    if (this.buildMode) {
      this.handleBuildInteract();
      return;
    }
    if (this.fishing.state !== 'idle') {
      this.handleFishingInteract();
      return;
    }
    if (this.isNearAbleSisters()) {
      this.openOutfitShop();
      return;
    }
    if (this.isNearCampfire() && this.isConcertTime()) {
      this.enjoyConcert();
      return;
    }
    if (this.isNearShop()) {
      this.sellAtShop();
      return;
    }
    if (this.isNearPolyroll()) {
      this.openPolyroll();
      return;
    }
    if (this.isNearTurnipStall()) {
      this.buyTurnips();
      return;
    }
    if (this.isNearMuseum()) {
      this.donateFossils();
      return;
    }
    if (this.isNearScavenger()) {
      this.claimScavenger();
      return;
    }
    if (this.isNearWorkbench()) {
      this.openWorkbench();
      return;
    }
    if (this.isNearMailbox()) {
      this.openMailbox();
      return;
    }
    if (this.isNearHome()) {
      this.openHome();
      return;
    }
    if (this.isNearGuestbook()) {
      this.openGuestbook();
      return;
    }
    if (this.isNearIslesSign()) {
      this.useIslesSign();
      return;
    }
    if (this.isNearPostcards()) {
      this.openPostcards();
      return;
    }
    // Weeds are one-shot and tiny, so they win over wandering villagers / fish
    // shadows / wildlife that could otherwise shadow a weed beside them.
    const weed = this.findNearestWeed();
    if (weed) {
      this.pullWeed(weed);
      return;
    }
    if (this.isNearNPC()) {
      this.talkToNPC();
      return;
    }
    if (this.isNearNPC2()) {
      this.talkToNPC2();
      return;
    }
    const villager = this.findNearestVillager();
    if (villager) {
      this.talkToVillager(villager);
      return;
    }
    // G-13 (b07-11): a visible beach item in pickup range wins over fish shadows and wildlife logging (villagers still first)
    const beachSpot = this.findNearestBeachItem();
    if (beachSpot) {
      this.collectBeachItem(beachSpot);
      return;
    }
    const fishTarget = this.findNearestFishingSpot();
    if (fishTarget && fishTarget.shadow) {
      this.startFishing(fishTarget);
      return;
    }
    const specimen = this.findNearestFloraFauna();
    if (specimen) {
      this.collectFloraFauna(specimen);
      return;
    }
    if (this.isNearMerchant()) {
      this.buyFromMerchant();
      return;
    }
    const fossilSpot = this.findNearestFossilSpot();
    if (fossilSpot) {
      this.digFossil(fossilSpot);
      return;
    }
    const flowerSpot = this.findNearestFlower();
    if (flowerSpot) {
      this.collectFlower(flowerSpot);
      return;
    }
    if (this.isNearDigHole()) {
      this.enterUnderground();
      return;
    }
    if (this.isNearRealmGate()) {
      this.openRealmGateMenu();
      return;
    }

    if (this.isNearDoor()) {
      this.useDoor();
      return;
    }

    const bug = this.findNearestBug();
    if (bug) {
      this.swingTool('🥍');
      this.catchBug(bug);
      return;
    }

    const tree = this.findNearestTree();
    if (tree) {
      this.treeCooldowns[tree.index] = this.cooldownNow();
      this.shakeTreeVisual(tree.index);
      this.swingTool('🪓');
      this.gainResource('wood', 1, tree.x, tree.y - 40);
      this.bountyEvent('town:shake'); // ID-18 (a tree on cooldown is never found, so a refusal never counts)
      const fruit = this.treeFruit[tree.index];
      if (fruit) {
        fruit.setVisible(false);
        this.gainResource('fruit', 1, tree.x, tree.y - 58);
        this.time.delayedCall(TREE_SHAKE_COOLDOWN_MS, () => fruit.setVisible(true));
      }
      return;
    }

    const rock = this.findNearestRock();
    if (rock) {
      this.rockCooldowns[rock.key] = this.cooldownNow();
      this.swingTool('⛏️');
      this.gainResource('stone', 1, rock.x, rock.y - 20);
      return;
    }

    const spot = this.findNearestFishingSpot();
    if (spot) {
      this.startFishing(spot);
      return;
    }

    this.triggerEmote(Math.floor(Math.random() * EMOTES.length));
  }

  // ---------- shop (classic AC "sell your stuff" loop) ----------

  isNearShop() {
    const cx = HOUSE_POS.x + HOUSE_POS.w / 2;
    const cy = HOUSE_POS.y + HOUSE_POS.h / 2;
    return Math.hypot(this.localBody.x - cx, this.localBody.y - cy) < SHOP_RADIUS;
  }

  // A plain wayfinding sign over the arcade district — centered between
  // the turnip stall, Polyroll, and the tournament sign, pure decoration.
  drawArcadeSign() {
    this.add.text(1900, 680, '🕹️ Arcade District', { fontSize: '16px' }).setOrigin(0.5).setDepth(679);
  }

  drawPolyrollBooth() {
    const { x, y } = POLYROLL_POS;
    const g = this.bakedGfx(y - 1);
    g.fillStyle(0x6b2e3a, 1).fillRect(x - 28, y - 10, 56, 26);
    g.fillStyle(0xffffff, 1).fillRect(x - 24, y - 6, 48, 18);
    g.fillStyle(0x1c2430, 1);
    [[-14, -1], [0, 2], [14, -2]].forEach(([dx, dy]) => g.fillCircle(x + dx, y + dy, 2));
    g.bake({ finish: 'polyroll' });
    this.add.text(x, y - 36, '🎲 Polyroll', { fontSize: '13px' }).setOrigin(0.5).setDepth(y + 1);
  }

  isNearPolyroll() {
    return Math.hypot(this.localBody.x - POLYROLL_POS.x, this.localBody.y - POLYROLL_POS.y) < POLYROLL_RADIUS;
  }

  // ---------- Polyroll: a dice/coin betting minigame, stars-only ----------
  // Inspired by a dice/coin-flip betting game — no wallet, no crypto, no
  // real money anywhere in this. The only stake is your own ⭐ score,
  // same currency the sparkle and the shop already use.

  openPolyroll() {
    if (this.inUnderground || this.inRealm) return;
    this.polyrollOpen = true;
    document.getElementById('polyroll-overlay').classList.remove('hidden');
    this.updatePolyrollScoreLabel();
  }

  closePolyroll() {
    this.polyrollOpen = false;
    document.getElementById('polyroll-overlay').classList.add('hidden');
  }

  updatePolyrollScoreLabel() {
    const el = document.getElementById('polyroll-score');
    if (el) el.textContent = this.localScore || 0;
  }

  playPolyrollDice(pick, bet) {
    const roll = Phaser.Math.Between(1, 6);
    const win = roll === pick;
    const delta = win ? bet * 5 : -bet;
    this.resolvePolyroll(`🎲 rolled ${roll}`, win, delta);
  }

  playPolyrollCoin(pick, bet) {
    const flip = Math.random() < 0.5 ? 'heads' : 'tails';
    const win = flip === pick;
    // "2x" is the total payout (stake back + winnings), so a win nets +bet.
    // Netting +2x bet on a 50/50 flip was positive expected value — an
    // unlimited star printer.
    const delta = win ? bet : -bet;
    this.resolvePolyroll(`🪙 landed on ${flip}`, win, delta);
  }

  resolvePolyroll(rollText, win, delta) {
    this.awardPoint(delta, `${win ? 'won' : 'lost'} ${Math.abs(delta)} ⭐`, this.localBody.x, this.localBody.y - 30);
    const resultEl = document.getElementById('polyroll-result');
    resultEl.textContent = `${rollText} — you ${win ? 'won' : 'lost'} ${Math.abs(delta)} ⭐!`;
    resultEl.className = win ? 'win' : 'lose';
    this.updatePolyrollScoreLabel();
    this.incrementStat('polyrollPlays');
  }

  setupPolyroll() {
    this.polyrollMode = 'dice';
    this.polyrollDicePick = 1;
    this.polyrollCoinPick = 'heads';

    document.getElementById('polyroll-close-btn').addEventListener('click', () => this.closePolyroll());

    const diceTab = document.getElementById('polyroll-tab-dice');
    const coinTab = document.getElementById('polyroll-tab-coin');
    const dicePanel = document.getElementById('polyroll-dice-panel');
    const coinPanel = document.getElementById('polyroll-coin-panel');
    diceTab.addEventListener('click', () => {
      this.polyrollMode = 'dice';
      diceTab.classList.add('active');
      coinTab.classList.remove('active');
      dicePanel.classList.remove('hidden');
      coinPanel.classList.add('hidden');
    });
    coinTab.addEventListener('click', () => {
      this.polyrollMode = 'coin';
      coinTab.classList.add('active');
      diceTab.classList.remove('active');
      coinPanel.classList.remove('hidden');
      dicePanel.classList.add('hidden');
    });

    document.querySelectorAll('#polyroll-dice-picker .polyroll-pick').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.polyrollDicePick = Number(btn.dataset.num);
        document.querySelectorAll('#polyroll-dice-picker .polyroll-pick').forEach((b) => b.classList.toggle('active', b === btn));
      });
    });
    document.querySelectorAll('#polyroll-coin-picker .polyroll-pick').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.polyrollCoinPick = btn.dataset.side;
        document.querySelectorAll('#polyroll-coin-picker .polyroll-pick').forEach((b) => b.classList.toggle('active', b === btn));
      });
    });

    document.getElementById('polyroll-play-btn').addEventListener('click', () => {
      const betInput = document.getElementById('polyroll-bet');
      const score = this.localScore || 0;
      let bet = Math.floor(Number(betInput.value));
      if (!Number.isFinite(bet) || bet < 1) bet = 1;
      if (bet > score) bet = score;
      betInput.value = bet;
      if (score <= 0 || bet < 1) {
        document.getElementById('polyroll-result').textContent = "you don't have any ⭐ to bet";
        document.getElementById('polyroll-result').className = 'lose';
        return;
      }
      if (this.polyrollMode === 'dice') this.playPolyrollDice(this.polyrollDicePick, bet);
      else this.playPolyrollCoin(this.polyrollCoinPick, bet);
    });
  }

  sellAtShop() {
    const deal = this.todaysDeal();
    let total = 0;
    let dealBonus = 0;
    let bulkBonus = 0;
    let bulkCount = 0;
    for (const { key } of QUEST_RESOURCES) {
      const count = this.resources[key] || 0;
      total += count;
      if (key === deal.key) dealBonus += count * DAILY_DEAL_BONUS;
      if (count >= BULK_SELL_THRESHOLD) {
        bulkBonus += count * BULK_SELL_BONUS;
        bulkCount += 1;
      }
    }
    const turnipRevenue = (this.resources.turnips || 0) > 0 ? this.resources.turnips * this.turnipSellPrice() / TURNIP_BUNDLE : 0;
    let craftedRevenue = 0;
    for (const r of RECIPES) craftedRevenue += (this.craftedGoods[r.id] || 0) * r.value;
    const grandTotal = Math.round(total + dealBonus + bulkBonus + turnipRevenue + craftedRevenue);
    if (grandTotal === 0) {
      this.showFloatingText(this.localBody.x, this.localBody.y - 30, 'bag is empty');
      return;
    }
    const soldTurnips = this.resources.turnips || 0;
    // Zero only what was actually paid for, so a bag item the shop doesn't
    // buy isn't silently wiped for nothing.
    for (const { key } of QUEST_RESOURCES) this.resources[key] = 0;
    this.resources.turnips = 0;
    for (const r of RECIPES) this.craftedGoods[r.id] = 0;
    this.updateInventoryHUD();
    this.saveResources();
    const notes = [];
    if (craftedRevenue > 0) notes.push('🔨 crafts');
    if (dealBonus > 0) notes.push(`${deal.icon} deal`);
    if (bulkCount > 0) notes.push('bulk bonus');
    const dealNote = notes.length > 0 ? ` (incl. ${notes.join(' + ')})` : '';
    const label = soldTurnips > 0 ? `sold (incl. ${soldTurnips} 🥬)! +${grandTotal} ⭐${dealNote}` : `sold! +${grandTotal} ⭐${dealNote}`;
    this.awardPoint(grandTotal, label, this.localBody.x, this.localBody.y - 30, 'sell');
    if (soldTurnips > 0) this.incrementStat('turnipsSold', soldTurnips);
    this.updateSellStreak();
    this.unsavedNote('Sold');
  }

  // A loyalty bonus for selling on consecutive days — same date-comparison
  // shape as the daily login streak, just keyed off "did you sell today"
  // instead of "did you log in today".
  updateSellStreak() {
    const saved = loadSave();
    const today = new Date().toISOString().slice(0, 10);
    const st = streakStep(saved.lastSellDate, saved.sellStreak, today); // still written (rollback safe), no longer shown or paid on
    if (st.write) writeSave({ sellStreak: st.streak, lastSellDate: st.date });
    // ID-09: the bonus follows the forgiving count of days with a sale (a gap never resets it). Save first, then pay.
    const sd = townDayStep(saved, 'sell', townUtcKey());
    if (sd.write) writeSave({ sellDays: sd.days, lastSellDay: sd.date });
    this.sellDays = sd.days;
    if (st.counted) {
      this.sellStreak = st.streak;
      this.lifetimeStats.bestSellStreak = Math.max(this.lifetimeStats.bestSellStreak || 0, st.streak);
    }
    if (!sd.counted && !st.counted) return; // already counted today (or the stored day is ahead of the clock: cycle1 L-07)
    this.saveAchievements();
    this.checkAchievements();
    if (sd.counted && sd.days >= 2) {
      const bonus = Math.min(sd.days, 5);
      this.awardPoint(bonus, `🛍️ sell day ${sd.days}: +${bonus} ⭐`, this.localBody.x, this.localBody.y - 50, 'achievement');
    }
  }

  // ---------- turnip / stalk market ----------
  // A simplified, single-session take on Animal Crossing's stalk market:
  // buy a bundle from the merchant stall at a price that drifts every 4
  // real-world hours, sell at the shop at a price that swings far more
  // (every 15 minutes) — sometimes a profit, sometimes a loss, same
  // deterministic wall-clock-hash trick as weather/the sparkle, so it
  // needs no network traffic and no persistent "day" concept.

  turnipHashedPrice(cycleMs, seedOffset, min, max) {
    const bucket = Math.floor(Date.now() / cycleMs) + seedOffset;
    const h = Math.sin(bucket * 12.9898) * 43758.5453;
    const frac = h - Math.floor(h);
    return Math.round(min + frac * (max - min));
  }

  turnipBuyPrice() {
    return this.turnipHashedPrice(TURNIP_BUY_CYCLE_MS, 1000, 90, 130);
  }

  turnipSellPrice() {
    const bucket = Math.floor(Date.now() / TURNIP_SELL_CYCLE_MS) + 7000;
    const h = Math.sin(bucket * 12.9898) * 43758.5453;
    const frac = h - Math.floor(h);
    const normal = 1 - TURNIP_SPIKE_CHANCE;
    if (frac < normal) return Math.round(30 + (frac / normal) * 80); // 30-110
    return Math.round(140 + ((frac - normal) / TURNIP_SPIKE_CHANCE) * 60); // spike: 140-200
  }

  turnipBundlesBoughtToday() {
    const rec = loadSaveLive().turnipBuys; // Live: the cap also counts buys storage has not taken yet
    return rec && rec.day === this.questDayBucket() ? (Number(rec.bundles) || 0) : 0;
  }

  isNearTurnipStall() {
    return Math.hypot(this.localBody.x - TURNIP_STALL_POS.x, this.localBody.y - TURNIP_STALL_POS.y) < TURNIP_STALL_RADIUS;
  }

  buyTurnips() {
    const price = this.turnipBuyPrice();
    if ((this.localScore || 0) < price) {
      this.stallNote(`Not enough stars: ${TURNIP_BUNDLE} turnips cost ${price} ⭐, you have ${Math.max(0, this.localScore || 0)} ⭐`);
      return;
    }
    const boughtToday = this.turnipBundlesBoughtToday();
    if (boughtToday >= TURNIP_DAILY_BUNDLE_CAP) {
      this.stallNote('Sold out for today. Come back tomorrow.');
      return;
    }
    const today = this.questDayBucket();
    TURNIP_UNSAVED = { day: today, n: (TURNIP_UNSAVED && TURNIP_UNSAVED.day === today ? TURNIP_UNSAVED.n : 0) + 1 };
    writeSave({}); // writes stored + my unsaved bundles; kept (TURNIP_UNSAVED) when storage refuses
    this.resources.turnips = (this.resources.turnips || 0) + TURNIP_BUNDLE;
    this.updateInventoryHUD();
    this.saveResources();
    this.awardPoint(-price, `bought ${TURNIP_BUNDLE} 🥬 for ${price} ⭐`, this.localBody.x, this.localBody.y - 30, 'pop');
    this.unsavedNote(`Bought ${TURNIP_BUNDLE} turnips`);
  }

  // Cycle 10 L: after a buy, a sale or an outfit change, say so when browser storage refused the write (it used to be silent and
  // the purchase was simply gone after a reload). Same wording as the Realm shop. Returns true when the warning was shown.
  unsavedNote(what) {
    if (SAVE_OK) return false;
    this.stallNote(`${what}, but not saved yet: browser storage is full or blocked, so it is kept for this visit until a save works.`);
    return true;
  }

  // R4 D4 (b07-r2-13): a refused buy used to flash a 0.9 s float on top of the player's name (easy to miss). Now the float
  // stays longer above the name and the same line goes to the polite live region (toast) for 3.5 s, so it is seen and read.
  stallNote(text) {
    this.lastStallNote = text;
    const t = this.add.text(this.localBody.x, this.localBody.y - 52, text, { fontSize: '12px', fontFamily: 'monospace', color: '#ffb4a8', stroke: '#1c2430', strokeThickness: 3, align: 'center', wordWrap: { width: 220 } }).setOrigin(0.5, 1).setDepth(100002);
    this.tweens.add({ targets: t, y: t.y - 16, alpha: { from: 1, to: 0 }, delay: 1600, duration: 900, onComplete: () => t.destroy() });
    const toast = document.getElementById('achievement-toast');
    if (toast) {
      toast.textContent = text;
      toast.classList.remove('toast-hello', 'hidden');
      clearTimeout(this.achievementToastTimer);
      this.achievementToastTimer = setTimeout(() => toast.classList.add('hidden'), 3500);
    }
  }

  // ---------- underground (3D voxel cave, local-only) ----------

  isNearDigHole() {
    return Math.hypot(this.localBody.x - DIG_HOLE_POS.x, this.localBody.y - DIG_HOLE_POS.y) < DIG_HOLE_RADIUS;
  }

  // O-01: arcade doors. Linked doors open in a new tab (noopener) after a confirm; the rest show the Coming soon card.
  findNearestPortal() {
    let best = null;
    let bestDist = DOOR_RADIUS;
    PORTALS.forEach((p) => {
      const d = Math.hypot(this.localBody.x - p.x, this.localBody.y - p.y);
      if (d < bestDist) { bestDist = d; best = p; }
    });
    return best;
  }

  isNearDoor() {
    return !!this.findNearestPortal();
  }

  useDoor() {
    if (this.doorBusy || this.doorSoonOpen) return;
    const portal = this.findNearestPortal();
    if (!portal) return;
    const name = portal.label.replace('🚪', '').trim();
    if (!portal.url) { this.openDoorSoon(name); return; }
    const ok = window.confirm(`${name} is another site. It opens in a new tab and leaves the game; Pixeltown stays open in this tab.`);
    if (!ok) return;
    const w = window.open(portal.url, '_blank', 'noopener,noreferrer');
    if (w) { try { w.opener = null; } catch (e) { /* already detached */ } }
  }

  openDoorSoon(name) {
    const ov = document.getElementById('door-soon-overlay');
    if (!ov) return;
    document.getElementById('door-soon-title').textContent = '🚪 ' + name;
    this.doorSoonOpen = true;
    ov.classList.remove('hidden');
    this.doorSoonReturn = document.activeElement;
    const btn = document.getElementById('door-soon-close-btn');
    if (btn) btn.focus();
  }

  closeDoorSoon() {
    this.doorSoonOpen = false;
    const ov = document.getElementById('door-soon-overlay');
    if (ov) ov.classList.add('hidden');
    const back = this.doorSoonReturn; this.doorSoonReturn = null;
    if (back && back.focus && document.contains(back)) { try { back.focus(); } catch (e) { /* gone */ } }
  }

  setupDoorSoon() {
    const ov = document.getElementById('door-soon-overlay');
    if (!ov) return;
    document.getElementById('door-soon-close-btn').addEventListener('click', () => this.closeDoorSoon());
    document.getElementById('door-soon-ok-btn').addEventListener('click', () => this.closeDoorSoon());
    ov.addEventListener('click', (e) => { if (e.target === ov) this.closeDoorSoon(); });
  }

  // If the player presses the browser's Back button after going through a
  // portal, some browsers (iOS Safari especially) restore this exact page
  // from cache instead of reloading it — doorBusy would otherwise stay
  // stuck true forever, since it was only ever set right before leaving,
  // making every door permanently dead until a hard refresh. Clear it
  // whenever the page becomes active again, covering both that restore
  // and an ordinary fresh load (where it's already false, so this is a
  // no-op).
  setupPortalReopen() {
    window.addEventListener('pageshow', () => { this.doorBusy = false; this.islesBusy = false; });
  }

  // ---------- TN1: dock signpost to the Hearthvale Isles (UI only) ----------
  drawIslesSign() {
    const { x, y } = ISLES_SIGN_POS;
    const g = this.bakedGfx(y - 1);
    g.fillStyle(0x000000, 0.2).fillEllipse(x, y + 14, 22, 6);
    g.fillStyle(0x6b4a30, 1).fillRect(x - 2, y - 14, 4, 28);
    g.fillStyle(0x8a5a3b, 1).fillRect(x - 26, y - 26, 48, 14);
    g.fillTriangle(x + 22, y - 26, x + 30, y - 19, x + 22, y - 12);
    g.lineStyle(1, 0x5a3a22, 1).strokeRect(x - 26, y - 26, 48, 14);
    g.bake();
    this.add.text(x + 2, y - 19, '⛵ Isles', { fontSize: '12px', color: '#fff8e1', stroke: '#3b2412', strokeThickness: 2 }).setOrigin(0.5).setDepth(y + 1);
    this.add.text(x, y - 40, 'Hearthvale Isles →', { fontSize: '12px', color: '#ffffff', stroke: '#000000', strokeThickness: 3 }).setOrigin(0.5).setDepth(y + 1);
    this.islesSignBtn = document.getElementById('isles-sign-hint');
    if (this.islesSignBtn) this.islesSignBtn.addEventListener('click', () => { if (this.isNearIslesSign()) this.useIslesSign(); });
  }

  isNearIslesSign() {
    return !!this.localBody && Math.hypot(this.localBody.x - ISLES_SIGN_POS.x, this.localBody.y - (ISLES_SIGN_POS.y + 14)) < ISLES_SIGN_RADIUS;
  }

  updateIslesSignHint() {
    const btn = this.islesSignBtn;
    if (!btn) return;
    const show = !this.inUnderground && !this.inRealm && !this.buildMode && this.isNearIslesSign();
    if (btn.classList.contains('hidden') === show) btn.classList.toggle('hidden', !show);
  }

  // Same path as the "World map" link: a same-tab location change to a page of this site. Nothing is written.
  useIslesSign() {
    if (this.islesBusy || this.inUnderground || this.inRealm) return;
    this.islesBusy = true;
    window.location.href = ISLES_SIGN_URL;
  }

  // Arrival spot (UI only, after the normal spawn): `?from=isles`, or a previous place of 'isles' in pixeltown-nav-v1
  // when the page was actually reached from the isles page, puts the player on the dock; `?from=realm` puts them at the
  // Realm Gate exit spot. Anything else keeps the default spawn. Read-only: never writes storage or the database.
  arrivalSpot() {
    let from = null;
    try { from = new URLSearchParams(location.search).get('from'); } catch (e) { from = null; }
    if (from === 'isles') return DOCK_ARRIVAL_POS;
    if (from === 'realm') return { x: REALM_GATE_POS.x, y: REALM_GATE_POS.y + 116 };
    try {
      const last = typeof MMNav !== 'undefined' ? MMNav.last() : null;
      if (!from && last && last.id === 'isles' && /\/games\/isles\//.test(document.referrer || '')) return DOCK_ARRIVAL_POS;
    } catch (e) { /* nav state unreadable: default spawn */ }
    return null;
  }

  applyArrivalSpot() {
    const at = this.arrivalSpot();
    if (!at) return;
    this.localBody.setPosition(at.x, at.y);
    this.localVisual.setPosition(at.x, at.y);
    this.localShadow.setPosition(at.x, at.y + 9);
    this.localNameText.setPosition(at.x, at.y - 22);
    this.playArrivalPuff(at);
  }

  // TN2: a small dust puff where the player arrives (dock / gate). One cached 16x16 texture, a few images and one
  // tween each, destroyed when it ends: nothing runs per frame afterwards. Reduce motion: one still puff that fades.
  playArrivalPuff(at) {
    if (!this.textures.exists('arrival_puff')) {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0xfff8e6, 0.85).fillCircle(8, 8, 8);
      g.fillStyle(0xe8dcc0, 1).fillCircle(9, 10, 4);
      g.generateTexture('arrival_puff', 16, 16);
      g.destroy();
    }
    const reduce = document.body.classList.contains('a11y-reduce-motion');
    const n = reduce ? 1 : TOWN_PERF.puffs;
    const y0 = at.y + 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const img = this.add.image(at.x, y0, 'arrival_puff').setDepth(at.y + 2).setAlpha(0.9).setScale(0.6);
      this.tweens.add({
        targets: img, alpha: 0, scale: reduce ? 0.6 : 1.3,
        x: reduce ? at.x : at.x + Math.cos(a) * 20, y: reduce ? y0 : y0 + Math.sin(a) * 8,
        duration: reduce ? 500 : 650, ease: 'Quad.easeOut',
        onComplete: () => img.destroy(),
      });
    }
    window.__townArrival = { x: at.x, y: at.y, puffs: n, reduce, texture: 'arrival_puff' };
  }

  // ---------- TN2: Postcards board (read-only, local keys only) ----------
  drawPostcardBoard() {
    const { x, y } = POSTCARD_POS;
    const g = this.bakedGfx(y - 1);
    g.fillStyle(0x000000, 0.18).fillEllipse(x, y + 14, 30, 6);
    g.fillStyle(0x6b4a30, 1).fillRect(x - 13, y - 6, 3, 20);
    g.fillStyle(0x6b4a30, 1).fillRect(x + 10, y - 6, 3, 20);
    g.fillStyle(0x9a6a44, 1).fillRect(x - 20, y - 30, 40, 26);
    g.lineStyle(1, 0x5a3a22, 1).strokeRect(x - 20, y - 30, 40, 26);
    g.fillStyle(0xfff3d6, 1).fillRect(x - 16, y - 27, 15, 10);
    g.fillStyle(0xdcefff, 1).fillRect(x + 1, y - 22, 15, 10);
    g.fillStyle(0xd65a4a, 1).fillRect(x - 10, y - 26, 3, 3);
    g.fillStyle(0x3b6fb6, 1).fillRect(x + 10, y - 21, 3, 3);
    g.bake();
    this.add.text(x, y - 44, '📮 Postcards', { fontSize: '12px', color: '#ffffff', stroke: '#000000', strokeThickness: 3 }).setOrigin(0.5).setDepth(y + 1);
    this.postcardsBtn = document.getElementById('postcards-hint');
    if (this.postcardsBtn) this.postcardsBtn.addEventListener('click', () => { if (this.canAct() && this.isNearPostcards()) this.openPostcards(); });
    const close = document.getElementById('postcards-close-btn');
    if (close) close.addEventListener('click', () => this.closePostcards());
    const ov = document.getElementById('postcards-overlay');
    if (ov) ov.addEventListener('click', (e) => { if (e.target === ov) this.closePostcards(); });
    // review P1x: a real modal. Esc closes it from anywhere, Tab / Shift+Tab stay inside it, and Enter / Space on its
    // controls are not taken by the Town's "Enter focuses chat" or Phaser hotkeys.
    if (ov) ov.addEventListener('keydown', (e) => { if (this.postcardsOpen && (e.key === 'Enter' || e.key === ' ')) e.stopPropagation(); });
    document.addEventListener('keydown', (e) => {
      if (!this.postcardsOpen || !ov) return;
      if (e.key === 'Escape' || e.key === 'Esc') { e.preventDefault(); e.stopPropagation(); this.closePostcards(); return; }
      if (e.key !== 'Tab') return;
      const f = Array.from(ov.querySelectorAll('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')).filter((n) => n.offsetParent !== null);
      if (!f.length) { e.preventDefault(); return; }
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && (i < 0 || i === f.length - 1)) { e.preventDefault(); f[0].focus(); }
    }, true);
  }

  isNearPostcards(radius = POSTCARD_RADIUS) {
    return !!this.localBody && Math.hypot(this.localBody.x - POSTCARD_POS.x, this.localBody.y - (POSTCARD_POS.y + 14)) < radius;
  }

  updatePostcardHint() {
    const btn = this.postcardsBtn;
    if (!btn) return;
    const show = !this.inUnderground && !this.inRealm && !this.buildMode && !this.postcardsOpen && this.isNearPostcards();
    if (btn.classList.contains('hidden') === show) btn.classList.toggle('hidden', !show);
  }

  openPostcards() {
    const ov = document.getElementById('postcards-overlay');
    if (!ov) return;
    this.closeNavSheet();
    const was = this.postcardsOpen;
    this.postcardsOpen = true;
    this.renderPostcards();
    ov.classList.remove('hidden');
    if (!was) { // review P1x: focus moves into the dialog and comes back to where it was on close
      const a = document.activeElement;
      this._postcardsReturn = a && a !== document.body && !ov.contains(a) ? a : null;
      const c = document.getElementById('postcards-close-btn');
      if (c) { try { c.focus(); } catch (e) { /* ignore */ } }
    }
  }

  closePostcards() {
    const was = this.postcardsOpen;
    this.postcardsOpen = false;
    const ov = document.getElementById('postcards-overlay');
    if (ov) ov.classList.add('hidden');
    if (!was) return;
    this.updatePostcardHint(); // shows "Read the postcards" again when the player is still next to the board
    const back = [this._postcardsReturn, this.postcardsBtn].find((n) => n && document.contains(n) && n.getClientRects().length > 0); // (fixed-position: no offsetParent)
    this._postcardsReturn = null;
    try {
      if (back) back.focus();
      else if (ov && ov.contains(document.activeElement)) document.activeElement.blur(); // back to the game (body)
    } catch (e) { /* ignore */ }
  }

  renderPostcards() {
    const list = document.getElementById('postcards-list');
    if (!list) return;
    while (list.firstChild) list.removeChild(list.firstChild);
    let lines = [];
    try { lines = postcardLines(window.localStorage); } catch (e) { lines = []; }
    if (!lines.length) {
      const li = document.createElement('li');
      li.className = 'postcards-empty';
      li.textContent = 'No postcards yet. Notes from the isles and the other games land here as you play them.';
      list.appendChild(li);
      return;
    }
    lines.forEach((text) => {
      const li = document.createElement('li');
      li.className = 'postcard-line';
      li.textContent = text;
      list.appendChild(li);
    });
  }

  // cycle1 L-09: the hint updaters run every frame, so they keep their element (looked up again only if it left the page) and
  // touch the class list only when the state changes (as updateIslesSignHint / updatePostcardHint already did).
  hintEl(id) {
    const c = this._hintEls || (this._hintEls = {});
    let el = c[id];
    if (!el || !el.isConnected) { el = document.getElementById(id); c[id] = el; }
    return el;
  }

  setHintHidden(el, hidden) {
    if (el.classList.contains('hidden') !== hidden) el.classList.toggle('hidden', hidden);
  }

  updateDigHoleHint() {
    const hint = this.hintEl('dig-hole-hint');
    if (!hint) return;
    this.setHintHidden(hint, !!(this.inUnderground || this.inRealm || this.buildMode || !this.isNearDigHole()));
  }

  // A real tappable button — not just a key hint — since "press E" isn't
  // discoverable at a glance and mobile's Interact button is tucked away
  // in the action-button cluster. Shows whenever there's a rod-related
  // action available: close enough to cast, already waiting, or a bite
  // ready to be reeled in.
  setupFishHint() {
    const btn = document.getElementById('fish-hint-btn');
    if (!btn) return;
    // Fish directly rather than via interact(): pond-side critters,
    // flowers and beach items are checked earlier in interact() and used
    // to swallow the tap, so "🎣 Fish" did something else entirely.
    btn.addEventListener('click', () => {
      if (!this.canAct() || this.inUnderground || this.inRealm || this.buildMode) return;
      if (this.fishing.state !== 'idle') { this.handleFishingInteract(); return; }
      const spot = this.findNearestFishingSpot();
      if (spot) this.startFishing(spot);
    });
  }

  updateFishHint() {
    const btn = this.hintEl('fish-hint-btn');
    if (!btn) return;
    const state = this.fishing.state;
    const target = state === 'idle' ? this.findNearestFishingSpot() : null;
    // Highlight the fish shadow a cast would go to, so "near a fish" is
    // visible in the world, not just implied by the button appearing.
    const targetShadow = target && target.shadow ? target.shadow : null;
    if (this.fishTargetShadow !== targetShadow) {
      if (this.fishTargetShadow && this.fishTargetShadow.state === 'swim') this.fishTargetShadow.sprite.setFillStyle(0x0f2236, FISH_SHADOW_ALPHA);
      if (targetShadow) targetShadow.sprite.setFillStyle(0x0f2236, 0.7);
      this.fishTargetShadow = targetShadow;
    }
    const show = !this.inUnderground && !this.inRealm && !this.buildMode && (state !== 'idle' || !!target);
    this.setHintHidden(btn, !show);
    if (btn.classList.contains('biting') !== (state === 'biting')) btn.classList.toggle('biting', state === 'biting');
    let label = '🎣 Fish';
    if (state === 'biting') label = '❗ Reel it in!';
    else if (state === 'casting') label = '🎣 Waiting for a bite…';
    // Only touch the DOM when the label actually changes — this runs
    // every frame.
    if (btn.textContent !== label) btn.textContent = label;
  }

  // ---------- the Realm (2D bullet-hell arena, local-only) ----------

  drawRealmGate() {
    const { x, y } = REALM_GATE_POS;
    if (!this.textures.exists('realmgate')) {
      // Baked once: a stone arch around a violet swirl, with a soft shadow.
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0x000000, 0.2).fillEllipse(40, 70, 72, 12);
      g.fillStyle(0x5a5a68, 1).fillRect(6, 14, 14, 56).fillRect(60, 14, 14, 56);
      g.fillStyle(0x7a7a8a, 1).fillRect(6, 10, 68, 12).fillRect(10, 6, 60, 8);
      g.fillStyle(0x45455a, 1).fillRect(6, 62, 14, 8).fillRect(60, 62, 14, 8);
      g.fillStyle(0x2a1245, 1).fillRect(20, 22, 40, 48);
      g.fillStyle(0x7b3fe4, 1).fillEllipse(40, 46, 34, 40);
      g.fillStyle(0xb36bff, 1).fillEllipse(40, 46, 24, 30);
      g.fillStyle(0xe2c6ff, 1).fillEllipse(40, 46, 12, 18);
      g.fillStyle(0xffffff, 0.9).fillRect(38, 40, 4, 4).fillRect(34, 52, 3, 3).fillRect(45, 36, 3, 3);
      g.generateTexture('realmgate', 80, 76);
      g.destroy();
    }
    const img = this.add.image(x, y, 'realmgate').setDepth(y - 1);
    this.tweens.add({ targets: img, alpha: { from: 0.9, to: 1 }, duration: 1200, yoyo: true, repeat: -1 }); // one cheap tween, no per-frame drawing
    this.addObstacleRect({ x: x - 34, y: y + 6, width: 20, height: 34 });
    this.addObstacleRect({ x: x + 34, y: y + 6, width: 20, height: 34 });
    this.realmGateSign = this.add.text(x, y - 34, '🌀 Realm Gate', { fontSize: '12px' }).setOrigin(0.5).setDepth(y + 1);
  }

  isNearRealmGate() {
    return Math.hypot(this.localBody.x - REALM_GATE_POS.x, this.localBody.y - (REALM_GATE_POS.y + 30)) < REALM_GATE_RADIUS;
  }

  updateRealmGateHint() {
    const hint = this.hintEl('realm-gate-hint');
    if (!hint) return;
    this.setHintHidden(hint, !!(this.inUnderground || this.inRealm || this.buildMode || !this.isNearRealmGate()));
  }

  // ---------- NAV slice E: "Where to?" sheet + Realm Gate pointer (UI only; no network, no save keys) ----------
  // cyc7-ui (cycle-6 proposal, U-01): on wide screens the Town now has the same top-left corner Menu button (#mm-nav-btn) as every other page, and
  // "Where to?" in the In-town panel opens that same sheet (shared/mm-nav.js); both buttons track aria-expanded. Destinations are
  // plain links, so leaving works exactly like the "World map" link. TOWN_NAV is shared with the join card's compass (whichever
  // mounts first builds the corner button; it hides while the join card is up: style.css body:has(#hud.hidden)).
  setupWhereTo() {
    const btn = document.getElementById('where-to-btn');
    if (!btn) return;
    let on = false;
    try { on = typeof MMNav !== 'undefined' && MMNav.mount(TOWN_NAV) === true; } catch (e) { on = false; }
    if (!on) { btn.classList.add('hidden'); return; }
    let fromWhere = false; // cyc7-ui: MMNav returns focus to its corner button; a sheet opened from "Where to?" hands focus back here
    btn.addEventListener('click', () => {
      if (MMNav.isOpen()) { MMNav.close(); return; }
      fromWhere = true;
      for (let i = 0; i < 4 && this.closeTopOverlay(); i++); // never stack the sheet on a town overlay
      MMNav.open();
    });
    MMNav.onOpen(() => {
      btn.setAttribute('aria-expanded', 'true');
      // review N1: a key held when the sheet opened must not stay "down" (the sheet eats keydowns; keyups pass through to release it)
      try { this.input.keyboard.resetKeys(); } catch (e) { /* no keyboard plugin */ }
      if (this.padInput) { this.padInput.x = 0; this.padInput.y = 0; }
    });
    MMNav.onClose(() => { btn.setAttribute('aria-expanded', 'false'); if (fromWhere && document.contains(btn) && btn.offsetParent) btn.focus(); fromWhere = false; });
    const corner = document.getElementById('mm-nav-btn'); // cyc7-ui: never stack the sheet on a town overlay from the corner button either
    if (corner) corner.addEventListener('click', () => { fromWhere = false; if (!MMNav.isOpen()) for (let i = 0; i < 4 && this.closeTopOverlay(); i++); }, true);
    MMNav.onSettings(() => {
      const panel = document.getElementById('player-list-panel');
      const toggle = document.getElementById('panel-toggle');
      if (panel && toggle && panel.classList.contains('collapsed')) toggle.click();
      const sec = document.getElementById('settings-section');
      if (sec && sec.classList.contains('hidden')) document.getElementById('settings-toggle-btn').click();
    });
  }

  // A chip that points at the Realm Gate for players who have not found it yet. Its state lives in its own
  // additive key (never pixeltown-save-v1): dismissed (the ✕) or reached (the gate menu was opened once).
  loadGatePointer() {
    try {
      const v = JSON.parse(localStorage.getItem(GATE_POINTER_KEY) || 'null');
      if (v && typeof v === 'object' && !Array.isArray(v)) return { v: 1, dismissed: v.dismissed === true, reached: v.reached === true };
    } catch (e) { /* storage blocked or corrupt: start fresh */ }
    return { v: 1, dismissed: false, reached: false };
  }

  saveGatePointer(patch) {
    this.gatePointer = Object.assign(this.gatePointer || this.loadGatePointer(), patch);
    try { localStorage.setItem(GATE_POINTER_KEY, JSON.stringify(this.gatePointer)); } catch (e) { /* storage blocked: this session only */ }
  }

  markGateReached() {
    if (this.gatePointer && !this.gatePointer.reached) this.saveGatePointer({ reached: true });
    this.flushQuietLines();
  }

  // First minute, one line of guidance: while the gate chip still guides a new player, ambient announcements (Bug-Off, weather)
  // wait, so the chip is the only hint on screen. They appear after FIRST_MINUTE_QUIET_MS, or as soon as the gate is reached.
  // Replies to the player's own actions (chat errors, saves, achievements) are never held.
  startFirstMinuteQuiet() {
    const st = this.loadGatePointer();
    if (st.dismissed || st.reached) return;
    this._quietLines = [];
    this.time.delayedCall(FIRST_MINUTE_QUIET_MS, () => this.flushQuietLines());
  }

  flushQuietLines() {
    const held = this._quietLines;
    this._quietLines = null;
    if (held) held.forEach((l) => this.addChatLine(l));
  }

  setupGatePointer() {
    this.gatePointer = this.loadGatePointer();
    this._gatePointerAt = 0;

    const close = document.getElementById('gate-pointer-close');
    if (close) close.addEventListener('click', () => {
      this.saveGatePointer({ dismissed: true });
      document.getElementById('gate-pointer').classList.add('hidden');
      this.flushQuietLines();
    });
  }

  updateGatePointer(time) {
    if (time - this._gatePointerAt < 200) return; // a few times a second is plenty
    const el = this.hintEl('gate-pointer');
    if (!el || !this.localBody || !this.gatePointer) return;
    this._gatePointerAt = time;
    const st = this.gatePointer;
    const dx = REALM_GATE_POS.x - this.localBody.x;
    const dy = (REALM_GATE_POS.y + 30) - this.localBody.y;
    const far = Math.hypot(dx, dy) > GATE_POINTER_MIN_DIST;
    // One line of guidance at a time: the What's-new banner (returning players, 10 s) sits where the chip goes, so the chip waits.
    // The achievement toast uses the same top-centre spot.
    const up = (id) => { const e = document.getElementById(id); return !!e && !e.classList.contains('hidden') && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden' && Number(getComputedStyle(e).opacity) > 0.05; };
    const newsUp = up('whats-new-banner') || up('achievement-toast') || up('town-welcome'); // ID-61: the welcome-back line too
    const show = !st.dismissed && !st.reached && far && !newsUp && !this.inRealm && !this.inUnderground && !this.realmEmbed && !this.buildMode;
    if (el.classList.contains('hidden') === show) el.classList.toggle('hidden', !show);
    if (!show) return;
    // Screen and world share their axes, so the world direction is the arrow direction (8 ways).
    const ARROWS = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'];
    const i = ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;
    const arrow = document.getElementById('gate-pointer-arrow');
    if (arrow && arrow.textContent !== ARROWS[i]) arrow.textContent = ARROWS[i];
  }

  // ---------- Realm gate menu, invites and team link ----------

  // The big Realm runs in a same-origin full-screen frame over the town, so the player never leaves the game page.
  openRealmEmbed(href) {
    if (this.realmEmbed) return;
    this.closeNavSheet();
    const wrap = document.createElement('div');
    wrap.id = 'realm-embed';
    const frame = document.createElement('iframe');
    frame.title = 'The Realm';
    frame.setAttribute('allow', 'fullscreen');
    frame.src = href;
    wrap.appendChild(frame);
    document.body.appendChild(wrap);
    this.realmEmbed = wrap;
    document.getElementById('realm-menu').classList.add('hidden');
    this.realmMenuOpen = false;
    try { this.game.loop.sleep(); } catch (e) { /* ignore */ }
    if (!this._realmEmbedMsg) {
      this._realmEmbedMsg = (ev) => { if (ev.origin === location.origin && ev.data && ev.data.pixeltown === 'close-realm') this.closeRealmEmbed(); };
      window.addEventListener('message', this._realmEmbedMsg);
    }
  }

  closeRealmEmbed() {
    if (!this.realmEmbed) return;
    this.realmEmbed.remove();
    this.realmEmbed = null;
    try { this.game.loop.wake(); } catch (e) { /* ignore */ }
    // what Mad Maze saved needs no copy here: enterRealm reads the stored realm, and a live arena resyncs from storage before every write
  }

  openRealmGateMenu() {
    if (this.realmMenuOpen || this.inRealm || this.inUnderground) return;
    this.realmMenuOpen = true;
    this.markGateReached();
    this.closeNavSheet(); // never two dialogs at once
    document.getElementById('realm-menu').classList.remove('hidden');
    this._friendsAuto = false; // "Play with friends" opens by itself once somebody else is in town
    const mm = document.getElementById('realm-menu-madmaze');
    if (mm && !mm.dataset.bound) {
      mm.dataset.bound = '1';
      mm.addEventListener('click', () => this.openRealmEmbed(mm.dataset.href));
    }
    this.renderRealmGateMenu();
  }

  closeRealmGateMenu() {
    if (!this.realmMenuOpen) return;
    this.realmMenuOpen = false;
    document.getElementById('realm-menu').classList.add('hidden');
    this.cancelRealmInvite();
  }

  // Who can I invite? Everybody else currently in town (not ourselves).
  renderRealmGateMenu() {
    const list = document.getElementById('realm-menu-players');
    const status = document.getElementById('realm-menu-status');
    if (!list) return;
    list.innerHTML = '';
    const inv = this.realmInviteOut;
    if (inv && inv.mode === '2v2') status.textContent = `2v2 lobby: ${Object.keys(inv.joined).length}/3 joined — ${inv.invited.length < 3 ? `invite ${3 - inv.invited.length} more` : 'waiting for answers (you can invite others to replace a no-show)'}…`;
    else if (inv) { status.textContent = inv.delivered ? `${inv.name} got your invite. Waiting for them to tap Accept…` : inv.notDelivered ? `${inv.name} has not received it yet. Ask them to refresh the page (and not be inside the Realm or cave), then invite again.` : `Invite sent to ${inv.name}…`; }
    else status.textContent = this.net && this.net.db ? 'Pick a player: they get a popup in town and tap Join. You enter together.' : 'Team play needs the online town.';
    const online = [...this.remotePlayers.values()].filter((rp) => rp.id && rp.name);
    const friends = document.getElementById('realm-menu-friends');
    if (friends && !this._friendsAuto) { friends.open = online.length > 0 || !!inv; if (friends.open) this._friendsAuto = true; }
    if (!online.length) { const li = document.createElement('li'); li.className = 'dim'; li.textContent = 'Nobody else is in town right now.'; list.appendChild(li); }
    online.forEach((rp) => {
      const li = document.createElement('li');
      const nm = document.createElement('span'); nm.textContent = `🧑 ${rp.name}`;
      const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'realm-invite-btn'; btn.dataset.pid = rp.id;
      btn.textContent = inv && inv.to === rp.id ? 'Invited…' : 'Invite';
      btn.disabled = !!inv || !(this.net && this.net.db);
      const lobby = inv && inv.mode === '2v2';
      btn.setAttribute('aria-label', `Invite ${rp.name} to fight together in the Realm`);
      btn.addEventListener('click', () => this.sendRealmInvite(rp.id, rp.name, 'coop'));
      const dbtn = document.createElement('button'); dbtn.type = 'button'; dbtn.className = 'realm-invite-btn realm-duel-btn'; dbtn.dataset.pid = rp.id;
      dbtn.textContent = '⚔️ Duel'; dbtn.disabled = btn.disabled;
      dbtn.setAttribute('aria-label', `Challenge ${rp.name} to a 1v1 duel`);
      dbtn.addEventListener('click', () => this.sendRealmInvite(rp.id, rp.name, 'duel'));
      const tbtn = document.createElement('button'); tbtn.type = 'button'; tbtn.className = 'realm-invite-btn realm-2v2-btn'; tbtn.dataset.pid = rp.id;
      tbtn.textContent = lobby && inv.invited.includes(rp.id) ? '2v2 ✓' : '2v2';
      tbtn.disabled = !(this.net && this.net.db) || (!!inv && !lobby) || (lobby && (inv.invited.includes(rp.id) || inv.invited.length >= 6));
      tbtn.setAttribute('aria-label', `Invite ${rp.name} to a 2v2 (you need three other players)`);
      tbtn.addEventListener('click', () => this.sendRealmInvite(rp.id, rp.name, '2v2'));
      const box = document.createElement('span'); box.className = 'realm-invite-btns'; box.append(btn, dbtn, tbtn);
      li.append(nm, box);
      list.appendChild(li);
    });
  }

  sendRealmInvite(targetId, name, mode = 'coop') {
    if (!this.net || !this.net.db) return false;
    const cur = this.realmInviteOut;
    if (cur && !(mode === '2v2' && cur.mode === '2v2')) return false;
    if (cur && (cur.invited.includes(targetId) || cur.invited.length >= 6)) return false; // up to six invites for three seats, so a decline can be replaced
    const party = this.net.realmInvite(targetId, mode, cur ? cur.party : undefined);
    if (!party) return false;
    if (cur) { cur.invited.push(targetId); cur.names[targetId] = name; this.renderRealmGateMenu(); return true; }
    const inv = this.realmInviteOut = { party, to: targetId, name, mode, invited: [targetId], names: { [targetId]: name }, joined: {}, stop: null, timer: null, delivered: false, notDelivered: false, deliveryTimer: null };
    const stopDelivery = this.net.realmOnDelivered ? this.net.realmOnDelivered(targetId, () => { if (this.realmInviteOut === inv) { inv.delivered = true; if (this.realmMenuOpen) this.renderRealmGateMenu(); } }) : () => {};
    inv.stopDelivery = stopDelivery;
    inv.deliveryTimer = setTimeout(() => { if (this.realmInviteOut === inv && !inv.delivered) { inv.notDelivered = true; if (this.realmMenuOpen) this.renderRealmGateMenu(); } }, 12000);
        inv.stop = this.net.realmWatchGuest(party, (guestId, seat, count) => {
      if (this.realmInviteOut !== inv) return;
      if (mode !== '2v2' ? guestId !== targetId : !inv.invited.includes(guestId)) return; // only players we invited may take a seat
      inv.joined[seat] = guestId;
      const need = mode === '2v2' ? 3 : 1;
      if (Object.keys(inv.joined).length < need) { if (this.realmMenuOpen) this.renderRealmGateMenu(); return; }
      const link = this.net.realmOpenLink(party, 'host');
      inv.stop(); clearTimeout(inv.timer); clearTimeout(inv.deliveryTimer); if (inv.stopDelivery) inv.stopDelivery(); this.realmInviteOut = null;
      this.closeRealmGateMenu();
      this.enterRealm({ role: 'host', link, mode });
    });
    inv.timer = setTimeout(() => { if (this.realmInviteOut === inv) { this.cancelRealmInvite(); if (this.realmMenuOpen) { document.getElementById('realm-menu-status').textContent = mode === '2v2' ? 'The 2v2 lobby timed out.' : `${name} did not answer.`; } } }, mode === '2v2' ? 90000 : 45000);
    this.renderRealmGateMenu();
    return true;
  }

  cancelRealmInvite() {
    const inv = this.realmInviteOut;
    if (!inv) return;
    this.realmInviteOut = null;
    if (inv.stop) inv.stop();
    clearTimeout(inv.timer); clearTimeout(inv.deliveryTimer); if (inv.stopDelivery) inv.stopDelivery();
    if (this.net) this.net.realmCancel(inv.party);
    if (this.realmMenuOpen) this.renderRealmGateMenu();
  }

  // An invitation arrives: a toast with Accept / Decline, anywhere in town (not while already fighting).
  setupRealmMenu() {
    document.getElementById('realm-menu-close-btn').addEventListener('click', () => this.closeRealmGateMenu());
    document.getElementById('realm-menu-solo').addEventListener('click', () => this.enterRealm());
  }

  setupRealmInvites() {
    if (!this.net || !this.net.realmListenInvites) return;
    this.net.realmListenInvites((inv) => { if (this.acceptNetInvite(inv)) this.showRealmInvite(inv); });
    document.getElementById('realm-invite-accept').addEventListener('click', () => this.acceptRealmInvite());
    document.getElementById('realm-invite-decline').addEventListener('click', () => this.hideRealmInvite());
    setInterval(() => { const d = this._deferredInvite; if (d && !this.inRealm && !this.inUnderground) { if (Date.now() - d.at < 60000) this.showRealmInvite(d.inv); else this._deferredInvite = null; } }, 1500);
  }

  // Invite spam (netsafety P2-1), for invites that arrive over the network: only from players in town, one per sender per 10 s,
  // never over an invite already showing.
  acceptNetInvite(inv) {
    if (!inv || typeof inv !== 'object' || typeof inv.from !== 'string' || !this.allPlayers.has(inv.from)) return false;
    if (this.realmInviteIn) return false;
    this._inviteSeen = this._inviteSeen || new Map();
    const seenAt = this._inviteSeen.get(inv.from);
    if (seenAt !== undefined && Date.now() - seenAt < 10000) return false;
    this._inviteSeen.set(inv.from, Date.now());
    return true;
  }

  showRealmInvite(inv) {
    if (this.inRealm || this.inUnderground) { this._deferredInvite = { inv, at: Date.now() }; return; } // busy: show it the moment we are back in town (for up to 60 s)
    this._deferredInvite = null;
    this.closeNavSheet(); // review N2: the invite (z 100000) must be reachable by keyboard, not hidden behind a focus-trapping sheet
    this.realmInviteIn = inv;
    const el = document.getElementById('realm-invite');
    document.getElementById('realm-invite-text').textContent = inv.mode === '2v2' ? `⚔️ ${inv.fromName} invites you to a 2v2 in the Realm!` : inv.mode === 'duel' ? `⚔️ ${inv.fromName} challenges you to a duel in the Realm!` : `🌀 ${inv.fromName} invites you to fight in the Realm together!`;
    el.classList.remove('hidden');
    clearTimeout(this._inviteHide);
    this._inviteHide = setTimeout(() => this.hideRealmInvite(), 75000);
    if (!this._titleBefore) this._titleBefore = document.title;
    document.title = '🌀 Realm invite! - ' + this._titleBefore; // a hidden tab still shows it
  }

  hideRealmInvite() {
    this.realmInviteIn = null;
    clearTimeout(this._inviteHide);
    if (this._titleBefore) { document.title = this._titleBefore; this._titleBefore = null; }
    const el = document.getElementById('realm-invite'); if (el) el.classList.add('hidden');
  }

  async acceptRealmInvite() {
    const inv = this.realmInviteIn;
    if (!inv || this.inRealm || this.inUnderground) return false;
    this.hideRealmInvite();
    const seat = await this.net.realmAccept(inv.party);
    const ok = seat > 0;
    if (!ok) { this.showFloatingText(this.localBody.x, this.localBody.y - 40, 'That invite has expired'); return false; }
    if (this.inRealm || this.inUnderground) { this.net.realmCancel(inv.party); return false; }
    for (let i = 0; i < 4 && this.closeTopOverlay(); i++);
    const link = this.net.realmOpenLink(inv.party, 'guest', seat);
    this.enterRealm({ role: 'guest', link, mode: inv.mode, slot: seat });
    return true;
  }

  // opts: { role: 'host'|'guest', link } starts a two-player run; nothing = solo.
  enterRealm(opts = {}) {
    if (this.inRealm || this.inUnderground) return;
    this.closeNavSheet();
    this.closeRealmGateMenu();
    this.inRealm = true;
    this.incrementStat('realmVisits');
    document.getElementById('realm-gate-hint').classList.add('hidden');
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('realm-overlay').classList.remove('hidden');
    this.scene.pause();
    if (!this.realm) {
      const nowRealm = loadSave().realm; // review F4: the CURRENT stored realm (Mad Maze in the embed may have changed it since this scene loaded), not the load-time copy
      this.realm = new RealmArena({
        container: document.getElementById('realm-canvas-wrap'),
        save: nowRealm && typeof nowRealm === 'object' && !Array.isArray(nowRealm) ? nowRealm : this.realmSave,
        onSave: (s) => writeSave({ realm: s }),
        onExit: (why) => this.exitRealm(why),
      });
      const av = MMTownHeroes.legacyArt() ? null : MMTownHeroes.avatarArgs(this.selfData.species, this.selfData.frame);
      this.realm.setAvatar(av ? av.url : `../i/${this.selfData.species}-strip.png`, av ? av.frame : this.selfData.frame || 0, FRAME_SIZE);
      this.setupRealmControls();
    }
    if (opts.role && opts.link) { this.realm.setTeam(opts.role, opts.link, this.selfData.name, opts.mode, opts.slot); document.getElementById('realm-overlay').classList.add('team'); } else document.getElementById('realm-overlay').classList.remove('team');
    this.realm.start();
  }

  exitRealm() {
    if (!this.inRealm) return;
    this.inRealm = false;
    this.realm.stop();
    document.getElementById('realm-overlay').classList.remove('team');
    document.getElementById('realm-overlay').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    this.scene.resume();
    this.localBody.setPosition(REALM_GATE_POS.x, REALM_GATE_POS.y + 116); // step out of the gate, clear of its enter radius (no instant re-entry from a held key)
  }

  // Two virtual sticks for touch: left moves, right aims and fires. They only feed the arena's vectors.
  setupRealmControls() {
    const r = this.realm;
    document.getElementById('realm-leave-btn').addEventListener('click', () => r.leave());
    const stick = (id, apply) => {
      const base = document.getElementById(id);
      const knob = base.querySelector('.knob');
      let pid = null;
      const MAXR = 46;
      const set = (e) => {
        const b = base.getBoundingClientRect();
        let dx = e.clientX - (b.left + b.width / 2); let dy = e.clientY - (b.top + b.height / 2);
        const len = Math.hypot(dx, dy);
        if (len > MAXR) { dx = dx / len * MAXR; dy = dy / len * MAXR; }
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
        apply(dx / MAXR, dy / MAXR, true);
      };
      const end = () => { pid = null; knob.style.transform = ''; apply(0, 0, false); };
      base.addEventListener('pointerdown', (e) => { e.preventDefault(); pid = e.pointerId; try { base.setPointerCapture(pid); } catch (err) { /* synthetic pointers can't be captured */ } set(e); });
      base.addEventListener('pointermove', (e) => { if (e.pointerId === pid) set(e); });
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => base.addEventListener(ev, (e) => { if (pid === null || e.pointerId === pid) end(); }));
    };
    // Abilities (also Q E R F on a keyboard) and the backpack.
    for (let i = 0; i < 4; i++) {
      const b = document.getElementById(`realm-ab-${i}`);
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); r.cast(i); });
    }
    document.getElementById('realm-bp-btn').addEventListener('click', () => r.setPaused(true));
    document.getElementById('realm-board-btn').addEventListener('click', () => r.setBoard(true));
    document.getElementById('realm-board-close').addEventListener('click', () => r.setBoard(false));
    document.getElementById('realm-bp-close').addEventListener('click', () => r.setPaused(false));
    document.getElementById('realm-backpack-body').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-act]');
      if (!btn) return;
      const uid = Number(btn.dataset.uid);
      if (btn.dataset.act === 'equip') r.equip(uid); else if (btn.dataset.act === 'discard') r.discard(uid);
    });
    // cyc11-S ID-54: the same shared binding as the Mad Maze page (floating move stick behind the 'Move from anywhere' device pref)
    if (window.MMMoveFloat) {
      MMMoveFloat.bindStick(document.getElementById('realm-stick-move'), (x, y) => r.setMoveStick(x, y), { float: { wrap: document.getElementById('realm-canvas-wrap') } });
      MMMoveFloat.bindStick(document.getElementById('realm-stick-aim'), (x, y, on) => r.setAimStick(x, y, on));
    } else {
      stick('realm-stick-move', (x, y) => r.setMoveStick(x, y));
      stick('realm-stick-aim', (x, y, on) => r.setAimStick(x, y, on));
    }
  }

  enterUnderground() {
    if (this.inUnderground) return;
    // beta S-08: three.js loads on the first cave visit (ugEnsureThree in underground.js); until then say so, then go in
    if (typeof THREE === 'undefined' && typeof ugEnsureThree === 'function') {
      if (this._ugLoading) return;
      this._ugLoading = true;
      this.showFloatingText(this.localBody.x, this.localBody.y - 30, 'Loading the cave...');
      ugEnsureThree().then((ok) => {
        this._ugLoading = false;
        if (ok) { this.enterUnderground(); return; }
        this.addChatLine({ system: true, text: 'Could not load the cave. Check your connection and try the hole again.' });
      });
      return;
    }
    this.inUnderground = true;
    this.incrementStat('caveVisits');
    document.getElementById('dig-hole-hint').classList.add('hidden');
    document.getElementById('hud').classList.add('hidden');
    const overlay = document.getElementById('underground-overlay');
    overlay.classList.remove('hidden');
    this.scene.pause();

    if (!this.underground) {
      const onResourceChange = () => { this.updateInventoryHUD(); this.saveResources(); };
      this.underground = new UndergroundWorld({
        canvasWrap: document.getElementById('underground-canvas-wrap'),
        resources: this.resources,
        inventory: this.caveInv,
        seed: this.caveSeed,
        pick: this.cavePick,
        onPickChange: (pick, broke) => { this.cavePick = { tier: pick.tier, dur: pick.dur }; this.saveResources(); this.updatePickBadge(broke ? '💥 Your pickaxe broke! Back to wood' : undefined); },
        onOpenTable: () => this.openCaveTable(),
        onResourceChange,
        onHotbarChange: (state) => this.renderUgHotbar(state),
        onExit: () => this.exitUnderground(),
        onHealthChange: (hp, max) => {
          const el = document.getElementById('ug-health');
          if (el) { el.textContent = `❤️ ${hp}/${max}`; el.classList.toggle('low', hp <= max / 4); }
        },
        onClockChange: (phase) => {
          const el = document.getElementById('ug-clock');
          if (el) el.textContent = { day: '☀️ Day', dawn: '🌄 Dawn', dusk: '🌅 Dusk', night: '🌙 Night' }[phase] || phase;
        },
        onFlyChange: (on) => {
          const b = document.getElementById('ug-fly-btn');
          if (b) b.classList.toggle('active', !!on);
        },
      });
      const av = MMTownHeroes.legacyArt() ? null : MMTownHeroes.avatarArgs(this.selfData.species, this.selfData.frame);
      this.underground.setAvatar(av ? av.url : `../i/${this.selfData.species}-strip.png`, av ? av.frame : this.selfData.frame || 0, FRAME_SIZE);
      this.setupUndergroundControls();
    }
    this.underground.start();
    this.updatePickBadge();
  }

  exitUnderground() {
    if (!this.inUnderground) return;
    if (this.workbenchOpen) this.closeWorkbench();
    this.inUnderground = false;
    this.underground.stop();
    document.getElementById('underground-overlay').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    this.scene.resume();
  }

  // Exit always works, from anywhere in the cave, the moment you press it —
  // no need to navigate back to the shaft. The old "only near the surface"
  // gate made getting out feel broken, since the cave is a maze you can
  // get turned around in. Mining keeps its own separate key/button so the
  // two actions are never ambiguous.
  // Keeps the on-screen hotbar buttons' highlight in sync with whichever
  // slot Place will actually use.
  setUgHotbar(type) {
    this.underground.setHotbar(type);
  }

  // Redraws the 9 slots: highlight on the selected one, a count badge on slots that hold stock.
  renderUgHotbar(state) {
    const slots = document.querySelectorAll('#ug-hotbar .ug-slot');
    (state || this.underground.getHotbarState()).forEach((s, i) => {
      const el = slots[i];
      if (!el) return;
      el.classList.toggle('active', s.selected);
      el.classList.toggle('empty', !s.id || s.count < 1);
      const cnt = el.querySelector('.cnt');
      if (cnt) cnt.textContent = s.id && s.count > 0 ? (s.count > 99 ? '99+' : s.count) : '';
    });
  }

  updateUgViewButton() {
    const btn = document.getElementById('ug-view-btn');
    if (btn && this.underground) btn.textContent = this.underground.viewMode === 'first' ? '👁️ 1st' : '🧍 3rd';
  }

  setupUndergroundControls() {
    const ug = this.underground;
    this.input.keyboard && window.addEventListener('keydown', (e) => {
      if (!this.inUnderground) return;
      const k = e.key.toLowerCase();
      if (k === 'f5' || k === 'v') {
        // F5 would reload the page: swallow it and flip first/third person instead.
        e.preventDefault();
        if (e.repeat) return; // holding the key must not flicker between views
        ug.toggleView();
        this.updateUgViewButton();
      } else if (k === 'e') {
        if (!e.repeat && !this.workbenchOpen) ug.setMining(true); // hold E to mine
      } else if (k === 'f') {
        ug.place();
      } else if (k >= '1' && k <= '9' && k.length === 1) {
        ug.selectSlot(Number(k) - 1);
      } else if (k === 'c') {
        if (!e.repeat && !this.workbenchOpen && !ug.flying) ug.useTable(); // crafting table under the crosshair (C also flies down, so not while flying)
      } else if (k === 'escape' || k === 'backspace') {
        if (this.workbenchOpen) this.closeWorkbench(); else this.exitUnderground();
      }
    });

    window.addEventListener('keyup', (e) => { if (e.key.toLowerCase() === 'e') ug.setMining(false); });
    window.addEventListener('blur', () => ug.setMining(false));

    const setDir = (dir, on) => {
      const v = on ? 1 : 0;
      if (dir === 'up') this.ugFwd = v;
      if (dir === 'down') this.ugFwd = -v;
      if (dir === 'left') this.ugStrafe = -v;
      if (dir === 'right') this.ugStrafe = v;
      ug.setMoveInput(this.ugFwd || 0, this.ugStrafe || 0);
    };
    document.querySelectorAll('#ug-dpad .dpad-btn').forEach((btn) => {
      const dir = btn.dataset.ugdir;
      btn.addEventListener('pointerdown', (e) => { e.preventDefault(); setDir(dir, true); });
      btn.addEventListener('pointerup', () => setDir(dir, false));
      btn.addEventListener('pointerleave', () => setDir(dir, false));
      btn.addEventListener('pointercancel', () => setDir(dir, false));
    });

    const setVert = (v) => { ug.setMoveInput(this.ugFwd || 0, this.ugStrafe || 0, v); };
    const upBtn = document.getElementById('ug-up-btn');
    const downBtn = document.getElementById('ug-down-btn');
    upBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); ug.tapJump(); setVert(1); });
    upBtn.addEventListener('pointerup', () => setVert(0));
    upBtn.addEventListener('pointerleave', () => setVert(0));
    upBtn.addEventListener('pointercancel', () => setVert(0));
    downBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); setVert(-1); });
    downBtn.addEventListener('pointerup', () => setVert(0));
    downBtn.addEventListener('pointerleave', () => setVert(0));
    downBtn.addEventListener('pointercancel', () => setVert(0));

    document.getElementById('ug-fly-btn').addEventListener('click', (e) => { ug.toggleFly(); e.currentTarget.blur(); }); // blur: a focused button would also fire on Space
    document.getElementById('ug-craft-btn').addEventListener('click', (e) => { e.currentTarget.blur(); if (!ug.useTable()) this.updatePickBadge('🛠️ Aim at a crafting table'); });
    document.getElementById('ug-view-btn').addEventListener('click', () => { ug.toggleView(); this.updateUgViewButton(); });
    this.updateUgViewButton();
    const mineBtn = document.getElementById('ug-mine-btn');
    mineBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); ug.setMining(true); }); // hold to mine
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => mineBtn.addEventListener(ev, () => ug.setMining(false)));
    document.querySelectorAll('#ug-hotbar .ug-slot').forEach((el) => el.addEventListener('click', () => ug.selectSlot(Number(el.dataset.slot))));
    this.renderUgHotbar();
    document.getElementById('ug-place-btn').addEventListener('click', () => ug.place());
    document.getElementById('ug-exit-btn').addEventListener('click', () => this.exitUnderground());
    
    this._ugExitHintInterval = setInterval(() => {
      if (!this.inUnderground) return;
      document.getElementById('underground-exit-hint').classList.toggle('hidden', !ug.nearExit);
    }, 150);
  }

  // Briefly shows the tool in the villager's hand and swings it.
  swingTool(symbol) {
    const dir = this.localVisual.flipX ? -1 : 1;
    const tool = this.add.text(this.localBody.x + dir * 12, this.localBody.y - 4, symbol, { fontSize: '14px' })
      .setOrigin(0.5, 0.9)
      .setDepth(this.localBody.y + 1);
    tool.setAngle(-50 * dir);
    this.tweens.add({
      targets: tool,
      angle: 40 * dir,
      duration: 140,
      yoyo: true,
      repeat: 1,
      onComplete: () => tool.destroy(),
    });
  }

  // ---------- bug catching (local-only, like fishing) ----------

  setupBugs() {
    this.bugs = [];
    for (let i = 0; i < BUG_COUNT; i++) {
      const sprite = this.add.text(0, 0, '🦋', { fontSize: '14px' }).setOrigin(0.5).setDepth(150000);
      const bug = { sprite, alive: true, extra: false, tween: null };
      this.bugs.push(bug);
      this.placeBug(bug);
    }
  }

  placeBug(bug) {
    bug.alive = true;
    bug.sprite.setVisible(true);
    bug.sprite.setPosition(
      Phaser.Math.Between(VILLAGE_BOUNDS.x + 120, VILLAGE_BOUNDS.x + VILLAGE_BOUNDS.width - 120),
      Phaser.Math.Between(VILLAGE_BOUNDS.y + 120, VILLAGE_BOUNDS.y + VILLAGE_BOUNDS.height - 120)
    );
    this.flutterBug(bug);
  }

  flutterBug(bug) {
    if (!bug.alive) return;
    const x = Phaser.Math.Clamp(bug.sprite.x + Phaser.Math.Between(-90, 90), VILLAGE_BOUNDS.x + 80, VILLAGE_BOUNDS.x + VILLAGE_BOUNDS.width - 80);
    const y = Phaser.Math.Clamp(bug.sprite.y + Phaser.Math.Between(-70, 70), VILLAGE_BOUNDS.y + 80, VILLAGE_BOUNDS.y + VILLAGE_BOUNDS.height - 80);
    bug.tween = this.tweens.add({
      targets: bug.sprite,
      x,
      y,
      duration: Phaser.Math.Between(1400, 2600),
      ease: 'Sine.easeInOut',
      onComplete: () => this.flutterBug(bug),
    });
  }

  findNearestBug() {
    let best = null;
    let bestDist = BUG_CATCH_RADIUS;
    this.bugs.forEach((bug) => {
      if (!bug.alive) return;
      const d = Math.hypot(this.localBody.x - bug.sprite.x, this.localBody.y - bug.sprite.y);
      if (d < bestDist) { bestDist = d; best = bug; }
    });
    return best;
  }

  catchBug(bug) {
    bug.alive = false;
    if (bug.tween) bug.tween.stop();
    bug.sprite.setVisible(false);
    this.gainResource('bugs', 1, bug.sprite.x, bug.sprite.y - 16);
    const faunaIdx = this.isNightBugs ? 1 : 0; // 0: butterfly, 1: firefly — see FAUNA_TYPES
    if (!this.museumFauna.has(faunaIdx)) {
      this.museumFauna.add(faunaIdx);
      this.saveFossils();
    }
    this.time.delayedCall(this.isBugOffTime() ? BUGOFF_RESPAWN_MS : BUG_RESPAWN_MS, () => {
      // Contest extras only respawn while the Bug-Off is still on.
      if (bug.extra && !this.bugOffActive) return;
      this.placeBug(bug);
    });
    this.bugOffCaught();
    this.bountyEvent('town:bug'); // ID-18
  }

  // ---------- daily Bug-Off ----------
  bugOffStartHour() {
    return Math.floor(this.questHash(31) * (24 - BUGOFF_HOURS));
  }

  // 'before' | 'live' | 'after' relative to today's window. The start hour is hashed from the UTC day (questDayBucket), so the
  // hour it is compared with is the UTC hour too (cycle0 L-01); the signs show the window on the player's own clock (windowLabel).
  bugOffPhase() {
    const hour = this.utcHour();
    const start = this.bugOffStartHour();
    if (hour < start) return 'before';
    return hour < start + BUGOFF_HOURS ? 'live' : 'after';
  }

  isBugOffTime() {
    return this.bugOffPhase() === 'live';
  }

  // Today's saved progress; anything malformed or from another day is empty.
  bugOffRecord() {
    const rec = loadSave().bugoff;
    const day = this.questDayBucket();
    const ok = rec && typeof rec === 'object' && !Array.isArray(rec);
    return {
      day,
      count: ok && rec.day === day ? cleanCount(rec.count) : 0,
      tier: ok && rec.day === day ? Math.min(BUGOFF_TIERS.length, cleanCount(rec.tier)) : 0,
      best: ok ? cleanCount(rec.best) : 0,
    };
  }

  setupBugOff() {
    // Hidden extras, created once; activated only during the window.
    for (let i = 0; i < BUGOFF_EXTRA_BUGS; i++) {
      const sprite = this.add.text(0, 0, this.isNightBugs ? '✨' : '🦋', { fontSize: '14px' }).setOrigin(0.5).setDepth(150000).setVisible(false);
      this.bugs.push({ sprite, alive: false, extra: true, tween: null }); // one field list for every bug record (cycle 9 pool-shape rule)
    }
    this.bugOffActive = false;
    const { x, y } = BUGOFF_SIGN_POS;
    if (!this.textures.exists('bugoffSign')) {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0x6b4a30, 1).fillRect(58, 56, 4, 30);
      g.fillStyle(0xe8d9b5, 1).fillRect(0, 0, 120, 58);
      g.lineStyle(2, 0x8f7044, 1).strokeRect(1, 1, 118, 56);
      g.generateTexture('bugoffSign', 120, 88);
      g.destroy();
    }
    this.add.image(x, y - 54, 'bugoffSign').setOrigin(0.5, 0).setDepth(y - 1);
    this.addObstacleRect({ x: x - 4, y: y + 14, width: 8, height: 12 });
    this.bugOffSignText = this.add.text(x, y - 27, '', {
      fontSize: '8px', fontFamily: 'monospace', color: '#3a2a1a', align: 'center', wordWrap: { width: 106 },
    }).setOrigin(0.5).setDepth(y);
    this.refreshBugOff();
    this.time.addEvent({ delay: 30000, loop: true, callback: () => this.refreshBugOff() });
  }

  refreshBugOff() {
    const live = this.isBugOffTime();
    if (live && !this.bugOffActive) {
      this.bugOffActive = true;
      this.bugs.filter((b) => b.extra).forEach((b) => this.placeBug(b));
      this.addChatLine({ system: true, ambient: true, text: '🦋 The Bug-Off is LIVE! Catch 5 / 10 / 15 bugs for Bronze / Silver / Gold.' });
    } else if (!live && this.bugOffActive) {
      this.bugOffActive = false;
      this.bugs.filter((b) => b.extra).forEach((b) => {
        b.alive = false;
        if (b.tween) b.tween.stop();
        b.sprite.setVisible(false);
      });
    }
    this.refreshBugOffSign();
  }

  refreshBugOffSign() {
    if (!this.bugOffSignText) return;
    const start = this.bugOffStartHour();
    const end = start + BUGOFF_HOURS;
    const rec = this.bugOffRecord();
    const win = this.windowLabel(start, end);
    let status = `next: ${win}`;
    if (this.isBugOffTime()) status = `LIVE now! (${win})`;
    else if (this.utcHour() >= end) status = `ended (${win})`;
    const medal = rec.tier > 0 ? BUGOFF_TIERS[rec.tier - 1].icon : '';
    this.bugOffSignText.setText(['🦋 BUG-OFF', status, `today: ${rec.count} ${medal}`, `best: ${rec.best}`].join('\n'));
  }

  // Called for every bug caught; only counts during the Bug-Off window.
  bugOffCaught() {
    if (!this.isBugOffTime()) return;
    const rec = this.bugOffRecord();
    const count = rec.count + 1;
    let tier = rec.tier;
    const best = Math.max(rec.best, count);
    const earned = [];
    while (tier < BUGOFF_TIERS.length && count >= BUGOFF_TIERS[tier].need) { earned.push(BUGOFF_TIERS[tier]); tier++; }
    // Save first, then pay, so a reload can never double-pay a prize.
    writeSave({ bugoff: { day: rec.day, count, tier, best } });
    this.showFloatingText(this.localBody.x, this.localBody.y - 54, `🦋 ${count}/${BUGOFF_TIERS[BUGOFF_TIERS.length - 1].need}`);
    earned.forEach((t) => {
      this.awardPoint(t.reward, `${t.icon} Bug-Off ${t.name}! +${t.reward} ⭐`, this.localBody.x, this.localBody.y - 70, 'achievement');
      this.addChatLine({ system: true, text: `${t.icon} Bug-Off ${t.name}! +${t.reward} ⭐` });
      this.incrementStat('bugOffTiers');
      if (t.name === 'Gold') this.incrementStat('bugOffGold');
    });
    this.refreshBugOffSign();
  }

  // ---------- fossils + museum ----------
  // Dig spots work like mining a rock: a fixed location, a cooldown, no
  // network sync (local only, same as every other activity). What's
  // different is fossils aren't sold — they're carried in a small bag
  // (capped at 3) until donated at the Museum, where they join a
  // permanent per-device collection saved alongside name/species.

  setupFossils() {
    this.fossilCooldowns = {};
    const saved = loadSave();
    this.fossilsHeld = Array.isArray(saved.fossilsHeld) ? saved.fossilsHeld.slice(0, FOSSIL_BAG_CAP) : [];
    this.museumCollection = new Set(Array.isArray(saved.museumCollection) ? saved.museumCollection : []);
    this.museumFauna = new Set(Array.isArray(saved.museumFauna) ? saved.museumFauna : []);
    this.museumFlora = new Set(Array.isArray(saved.museumFlora) ? saved.museumFlora : []);
    this.updateFossilHUD();
  }

  saveFossils() {
    // Beta S-02: museum donations are sets (union with storage); the fossil bag is this tab's (the listener keeps it fresh).
    const p = writeSaveMerged((stored) => ({
      fossilsHeld: this.fossilsHeld,
      museumCollection: townUnion(stored.museumCollection, [...this.museumCollection]),
      museumFauna: townUnion(stored.museumFauna, [...this.museumFauna]),
      museumFlora: townUnion(stored.museumFlora, [...this.museumFlora]),
    }));
    if (!p) return;
    p.museumCollection.forEach((id) => this.museumCollection.add(id));
    p.museumFauna.forEach((id) => this.museumFauna.add(id));
    p.museumFlora.forEach((id) => this.museumFlora.add(id));
  }

  updateFossilHUD() {
    const bagEl = document.getElementById('fossil-count');
    if (bagEl) bagEl.textContent = this.fossilsHeld.length;
    const museumEl = document.getElementById('museum-count');
    if (museumEl) museumEl.textContent = this.museumCollection.size;
  }

  // cycle0 L-06: the clock for in-session respawn cooldowns (trees, rocks, fossils, flowers, beach). Monotonic, so changing the
  // device clock neither skips a cooldown (clock forward) nor freezes a spot until the clock catches up (clock back).
  cooldownNow() { return performance.now(); }

  findNearestFossilSpot() {
    const now = this.cooldownNow();
    let best = null;
    let bestDist = FOSSIL_DIG_RADIUS;
    FOSSIL_SPOTS.forEach((spot, i) => {
      if (this.fossilCooldowns[i] && now - this.fossilCooldowns[i] < FOSSIL_RESPAWN_MS) return;
      const d = Math.hypot(this.localBody.x - spot.x, this.localBody.y - spot.y);
      if (d < bestDist) { bestDist = d; best = { ...spot, index: i }; }
    });
    return best;
  }

  digFossil(spot) {
    if (this.fossilsHeld.length >= FOSSIL_BAG_CAP) {
      this.showFloatingText(this.localBody.x, this.localBody.y - 30, 'fossil bag is full');
      return;
    }
    this.fossilCooldowns[spot.index] = this.cooldownNow();
    const mound = this.fossilMounds[spot.index];
    if (mound) {
      mound.setVisible(false);
      this.time.delayedCall(FOSSIL_RESPAWN_MS, () => mound.setVisible(true));
    }
    const typeIndex = Phaser.Math.Between(0, FOSSIL_TYPES.length - 1);
    this.fossilsHeld.push(typeIndex);
    this.saveFossils();
    this.bountyEvent('town:fossil'); // ID-18 (a full bag returns above and never counts)
    this.updateFossilHUD();
    this.showFloatingText(spot.x, spot.y - 20, `found ${FOSSIL_TYPES[typeIndex]}`);
    SFX.catch();
  }

  isNearMuseum() {
    const cx = MUSEUM_POS.x + MUSEUM_POS.w / 2;
    const cy = MUSEUM_POS.y + MUSEUM_POS.h / 2;
    return Math.hypot(this.localBody.x - cx, this.localBody.y - cy) < MUSEUM_RADIUS;
  }

  donateFossils() {
    if (!this.fossilsHeld.length) {
      // Nothing to hand over — walking up to the building just lets you
      // browse the collection instead.
      this.openMuseum();
      return;
    }
    let newSpecies = 0;
    this.fossilsHeld.forEach((typeIndex) => {
      if (!this.museumCollection.has(typeIndex)) { this.museumCollection.add(typeIndex); newSpecies++; }
    });
    const donated = this.fossilsHeld.length;
    this.fossilsHeld = [];
    this.saveFossils();
    this.updateFossilHUD();
    if (newSpecies > 0) {
      this.awardPoint(newSpecies, `donated ${donated} — +${newSpecies} ⭐ new species!`, this.localBody.x, this.localBody.y - 30);
    } else {
      this.showFloatingText(this.localBody.x, this.localBody.y - 30, `donated ${donated} (already had those species)`);
    }
    this.checkAchievements();
  }

  findNearestTree() {
    const now = this.cooldownNow();
    let best = null;
    let bestDist = TREE_SHAKE_RADIUS;
    TREES.forEach(([tx, ty], i) => {
      if (this.treeCooldowns[i] && now - this.treeCooldowns[i] < TREE_SHAKE_COOLDOWN_MS) return;
      const d = Math.hypot(this.localBody.x - tx, this.localBody.y - (ty - 10));
      if (d < bestDist) {
        bestDist = d;
        best = { x: tx, y: ty, index: i };
      }
    });
    return best;
  }

  findNearestRock() {
    const now = this.cooldownNow();
    let best = null;
    let bestDist = ROCK_MINE_RADIUS;
    const consider = (list, prefix) => {
      list.forEach(([x, y], i) => {
        const key = `${prefix}${i}`;
        if (this.rockCooldowns[key] && now - this.rockCooldowns[key] < TREE_SHAKE_COOLDOWN_MS) return;
        const d = Math.hypot(this.localBody.x - x, this.localBody.y - y);
        if (d < bestDist) {
          bestDist = d;
          best = { x, y, key };
        }
      });
    };
    consider(ROCKS, 'r');
    consider(PUNK_ROCKS, 'p');
    return best;
  }

  // Prefers a visible fish shadow within casting reach (returned as
  // { x, y, shadow }); falls back to the old fixed bank spots, which now
  // summon the nearest fish in that pond to the bobber.
  findNearestFishingSpot() {
    const now = performance.now();
    let bestShadow = null;
    let bestShadowDist = FISH_SHADOW_REACH;
    (this.fishShadows || []).forEach((s) => {
      if (s.state !== 'swim' || now < s.spookedUntil) return;
      const d = Math.hypot(this.localBody.x - s.x, this.localBody.y - s.y);
      if (d < bestShadowDist) {
        bestShadowDist = d;
        bestShadow = s;
      }
    });
    if (bestShadow) return { x: bestShadow.x, y: bestShadow.y, shadow: bestShadow };
    let best = null;
    let bestDist = FISH_INTERACT_RADIUS;
    FISHING_SPOTS.forEach((s) => {
      const d = Math.hypot(this.localBody.x - s.x, this.localBody.y - s.y);
      if (d < bestDist) {
        bestDist = d;
        best = s;
      }
    });
    return best;
  }

  gainResource(type, amount, x, y) {
    this.resources[type] = (this.resources[type] || 0) + amount;
    this.updateInventoryHUD();
    this.saveResources();
    const icon = { wood: '🪵', stone: '🪨', fish: '🐟', bugs: '🦋', fruit: '🍎', flowers: '🌸', shells: '🐚' }[type];
    this.showFloatingText(x, y, `+${amount} ${icon}`);
    this.incrementStat(type, amount);
    SFX.catch();
  }

  // ---------- achievements ----------

  setupAchievements() {
    const saved = loadSave();
    this.lifetimeStats = {};
    if (saved.lifetimeStats && typeof saved.lifetimeStats === 'object' && !Array.isArray(saved.lifetimeStats)) {
      for (const k of Object.keys(saved.lifetimeStats)) this.lifetimeStats[k] = cleanCount(saved.lifetimeStats[k]);
    }
    this.achievementsUnlocked = new Set(Array.isArray(saved.achievementsUnlocked) ? saved.achievementsUnlocked.filter((id) => typeof id === 'string') : []);
    this._statsBase = { ...this.lifetimeStats }; // beta S-02: delta writes for lifetime stats
    this.equippedTitle = (typeof saved.equippedTitle === 'string' && this.achievementsUnlocked.has(saved.equippedTitle)) ? saved.equippedTitle : null;
    const mine = this.allPlayers.get(this.selfData.id);
    if (mine) mine.title = this.equippedTitle;
    if (this.equippedTitle) this.net.updateTitle(this.equippedTitle);
    this.renderAchievementsPanel();
    // Existing saves may already qualify for newer achievements (villager
    // friendships, wildlife log) — check once create() has finished.
    this.time.delayedCall(0, () => this.checkAchievements());
  }

  // Equip (or unequip, passing null) an unlocked achievement as a small
  // badge shown next to your name in every client's player list.
  equipTitle(achievementId) {
    const next = this.equippedTitle === achievementId ? null : achievementId;
    this.equippedTitle = next;
    writeSave({ equippedTitle: next });
    const mine = this.allPlayers.get(this.selfData.id);
    if (mine) mine.title = next;
    this.net.updateTitle(next);
    this.renderAchievementsPanel();
    this.renderPlayerList();
  }

  saveAchievements() {
    // Beta S-02: stats are stored + this tab's own increase, unlocks are the union, so another tab's progress is kept.
    const base = this._statsBase || null;
    const p = writeSaveMerged((stored) => ({
      lifetimeStats: townMergeCounts(stored.lifetimeStats, this.lifetimeStats, base),
      achievementsUnlocked: townUnion(stored.achievementsUnlocked, [...this.achievementsUnlocked]),
    }));
    if (!p) return;
    Object.keys(p.lifetimeStats).forEach((k) => { this.lifetimeStats[k] = cleanCount(p.lifetimeStats[k]); });
    p.achievementsUnlocked.forEach((id) => this.achievementsUnlocked.add(id));
    this._statsBase = { ...this.lifetimeStats };
  }

  incrementStat(key, amount = 1) {
    this.lifetimeStats[key] = (this.lifetimeStats[key] || 0) + amount;
    this.saveAchievements();
    this.checkAchievements();
  }

  checkAchievements() {
    // awardPoint() re-checks achievements, and unlocking one awards stars,
    // so don't re-enter while a pass is already running.
    if (this.checkingAchievements) return;
    this.checkingAchievements = true;
    try { this.runAchievementChecks(); } finally { this.checkingAchievements = false; }
  }

  runAchievementChecks() {
    ACHIEVEMENTS.forEach((a) => {
      if (this.achievementsUnlocked.has(a.id)) return;
      if (!a.check(this.lifetimeStats, this)) return;
      this.achievementsUnlocked.add(a.id);
      this.saveAchievements();
      this.addChatLine({ system: true, text: `🏆 Achievement unlocked: ${a.icon} ${a.label} — +${a.reward} ⭐` });
      this.awardPoint(a.reward, `${a.icon} ${a.label}!`, this.localBody.x, this.localBody.y - 44, 'achievement');
      // The floating world-space text above fades in under a second — fine
      // for "you just earned a point" feedback, too quick to actually read
      // for a whole achievement name. This is a separate, screen-fixed
      // toast (so it doesn't drift off with camera movement) that stays
      // up long enough to read, then times out on its own.
      this.showAchievementToast(`🏆 ${a.icon} ${a.label} unlocked! +${a.reward} ⭐`);
      this.renderAchievementsPanel();
    });
  }

  showAchievementToast(text) {
    const toast = document.getElementById('achievement-toast');
    if (!toast) return;
    toast.classList.remove('toast-hello'); // ID-59: only the animal hello line uses the compact narrow layout
    toast.textContent = text;
    toast.classList.remove('hidden');
    clearTimeout(this.achievementToastTimer);
    this.achievementToastTimer = setTimeout(() => toast.classList.add('hidden'), 10000);
  }

  // ---------- daily login streak ----------
  // Local-only, like everything else that persists on this device: one
  // bump per calendar day (your own device's clock), broken by skipping
  // a day, with a small one-time star bonus the first time each day.

  setupSfxToggle() {
    const btn = document.getElementById('sfx-toggle-btn');
    const render = () => {
      btn.textContent = sfxMuted ? '🔇 Sound off' : '🔊 Sound';
      btn.classList.toggle('muted', sfxMuted);
    };
    render();
    btn.addEventListener('click', () => {
      setSfxMuted(!sfxMuted);
      render();
      if (!sfxMuted) SFX.coin();
    });
  }

  // The shared 8-bit Settings panel (shared/mm-settings.js, design/SETTINGS-WIRING.md): a "⚙️ Settings" entry in More opens it;
  // its changes reach the Town live (sound, music, reduced motion, text size). The Town's own buttons stay as they are.
  setupSharedSettings() {
    const host = document.getElementById('settings-section');
    if (!host || typeof MMSettings === 'undefined' || document.getElementById('town-settings-btn')) return;
    const btn = document.createElement('button');
    btn.type = 'button'; btn.id = 'town-settings-btn'; btn.textContent = '⚙️ Settings';
    btn.title = 'Text size, motion, contrast, sound';
    host.insertBefore(btn, host.firstChild);
    btn.addEventListener('click', () => {
      try {
        if (!this.sharedSettings) this.sharedSettings = MMSettings.mount({ page: 'town', feedback: false });
        if (this.sharedSettings) this.sharedSettings.open();
      } catch (e) { /* panel unavailable: the Town's own buttons still work */ }
    });
    window.addEventListener('mm-settings-change', (e) => {
      const d = (e && e.detail) || {};
      try {
        if (d.id === 'sound') { setSfxMuted(!d.value); const b = document.getElementById('sfx-toggle-btn'); if (b) { b.textContent = sfxMuted ? '🔇 Sound off' : '🔊 Sound'; b.classList.toggle('muted', sfxMuted); } }
        if (d.id === 'music') { setMusicEnabled(!!d.value); const b = document.getElementById('music-toggle-btn'); if (b) { b.textContent = musicEnabled ? '🎵 Music on' : '🎵 Music off'; b.classList.toggle('muted', !musicEnabled); } }
        if (['reduce-motion', 'flashes', 'low-gfx', 'text-size'].includes(d.id)) {
          const v = MMSettings.read(window.localStorage);
          document.body.classList.toggle('a11y-reduce-motion', !!(v['reduce-motion'] || !v.flashes || v['low-gfx']));
          const hs = Number(v['text-size']) || 1;
          document.body.classList.toggle('a11y-hud-scaled', hs > 1);
          document.body.style.setProperty('--hud-scale', String(hs));
        }
      } catch (err) { /* a bad value never breaks the Town */ }
    });
  }

  setupMusicToggle() {
    const btn = document.getElementById('music-toggle-btn');
    if (!btn) return;
    const render = () => {
      btn.textContent = musicEnabled ? '🎵 Music on' : '🎵 Music off';
      btn.classList.toggle('muted', !musicEnabled);
    };
    render();
    if (musicEnabled) startAmbientMusic();
    btn.addEventListener('click', () => {
      setMusicEnabled(!musicEnabled);
      render();
    });
  }

  setupReduceMotionToggle() {
    const btn = document.getElementById('reduce-motion-btn');
    if (!btn) return;
    const render = () => {
      btn.textContent = reduceMotion ? '🏃 Motion off' : '🏃 Motion on';
      btn.classList.toggle('muted', reduceMotion);
    };
    render();
    btn.addEventListener('click', () => {
      setReduceMotion(!reduceMotion);
      render();
    });
  }

  // G-12 (b07-01, b04-08): Esc (and P, the universal Menu key) closes the top Town overlay through closeTopOverlay, so every overlay's
  // own close logic runs. Window bubble phase: the nav sheet (window capture), Postcards (document) and the Museum (its own window
  // listener) keep their own Esc and are skipped here, so one press never closes two layers. Typing in a text field: untouched
  // (the chat box blurs itself). A key that closed an overlay is consumed, so P never also opens a menu / takes a photo.
  setupEscClose() {
    this._escCloseKey = (e) => {
      if (e.defaultPrevented || e.repeat) return;
      const k = e.key;
      if (k !== 'Escape' && k !== 'Esc' && k !== 'p' && k !== 'P') return;
      const t = e.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || ''))) return;
      if (this.museumOpen || this.postcardsOpen || this.navSheetOpen()) return;
      if (this.closeTopOverlay()) { e.preventDefault(); e.stopImmediatePropagation(); }
    };
    window.addEventListener('keydown', this._escCloseKey);
    this.events.once('shutdown', () => window.removeEventListener('keydown', this._escCloseKey));
  }

  setupPhotoMode() {
    this.input.keyboard.on('keydown-P', () => { if (this.canAct()) this.takePhoto(); });
    const btn = document.getElementById('photo-btn');
    if (btn) btn.addEventListener('click', () => this.takePhoto());
  }

  setupWhatsNew() {
    const banner = document.getElementById('whats-new-banner');
    const closeBtn = document.getElementById('whats-new-close-btn');
    if (!banner || !closeBtn) return;
    const save = loadSave();
    const isReturningPlayer = HAD_EXISTING_SAVE_ON_LOAD;
    const dismiss = () => {
      banner.classList.add('hidden');
      writeSave({ lastSeenVersion: GAME_VERSION });
    };
    if (isReturningPlayer && save.lastSeenVersion !== GAME_VERSION) {
      document.getElementById('whats-new-text').textContent = ["🆕 What's new:", ...WHATS_NEW.slice(0, 5)].join('\n');
      banner.classList.remove('hidden');
      setTimeout(dismiss, 10000);
    } else if (!isReturningPlayer) {
      // Brand-new player has nothing to compare against — nothing to show,
      // but mark the current version seen so it doesn't pop up next time.
      writeSave({ lastSeenVersion: GAME_VERSION });
    }
    closeBtn.addEventListener('click', dismiss);
  }

  // ID-61 (cycle 12 S): the welcome-back line #town-welcome (role=status). Waits while the What's-new banner is up, then shows
  // once for this load; hides after 10 s, or 3 s after the hero first moves, whichever is first. A 44 px close button and Esc
  // (captured on window, so the Esc menu does not open behind it) dismiss it.
  setupWelcomeBack() {
    if (!this._welcomeBackDue) return;
    this._welcomeBackDue = false;
    const el = document.getElementById('town-welcome');
    const txt = document.getElementById('town-welcome-text');
    const btn = document.getElementById('town-welcome-close');
    if (!el || !txt || !btn) return;
    const text = townWelcomeBackText(loadSave());
    const timers = { wait: 0, hide: 0, move: 0, poll: 0 };
    const up = () => !el.classList.contains('hidden') && el.getClientRects().length > 0; // #hud hidden (Realm, Underground) = not up
    const hide = () => {
      Object.keys(timers).forEach((k) => { clearTimeout(timers[k]); clearInterval(timers[k]); });
      el.classList.add('hidden');
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', place);
    };
    const onKey = (e) => {
      if (!up() || (e.key !== 'Escape' && e.key !== 'Esc')) return;
      e.preventDefault(); e.stopImmediatePropagation(); hide();
    };
    // "Centred under the top HUD row": the top edge goes 8 px below the lowest top-HUD box (Menu, bag bar, player list) that
    // shares the line's columns, measured at show time and on resize, so it never covers them at any width (195 px: under the bag bar).
    const place = () => {
      if (el.classList.contains('hidden')) return;
      el.style.top = '';
      const r = el.getBoundingClientRect();
      let top = r.top;
      ['mm-nav-btn', 'inventory-panel', 'player-list-panel'].forEach((id) => {
        const o = document.getElementById(id); if (!o || !o.getClientRects().length) return;
        const q = o.getBoundingClientRect();
        if (q.width && q.top < 240 && q.left < r.right && q.right > r.left) top = Math.max(top, q.bottom + 8);
      });
      if (top > r.top) el.style.top = Math.round(top) + 'px';
    };
    const show = () => {
      txt.textContent = text;
      el.classList.remove('hidden');
      place(); window.addEventListener('resize', place);
      this.welcomeBackShown = (this.welcomeBackShown || 0) + 1;
      window.addEventListener('keydown', onKey, true);
      timers.hide = setTimeout(hide, 10000);
      const b = this.localBody; const x0 = b ? b.x : 0, y0 = b ? b.y : 0;
      timers.poll = setInterval(() => {
        place(); // the HUD can still settle (bag bar wraps, player list fills) after the line appears
        const lb = this.localBody; if (!lb || timers.move) return;
        if (Math.hypot(lb.x - x0, lb.y - y0) > 4) timers.move = setTimeout(hide, 3000);
      }, 200);
    };
    btn.addEventListener('click', hide);
    const news = document.getElementById('whats-new-banner');
    const newsUp = () => !!news && !news.classList.contains('hidden');
    const tryShow = () => { if (newsUp()) { timers.wait = setTimeout(tryShow, 400); return; } show(); };
    tryShow();
    this.events.once('shutdown', hide);
  }

  // Beta S-02: another tab (a second Town, the Lantern Restore, the Hub gift) changed pixeltown-save-v1. Re-read it and adopt the
  // counters / sets into memory (fields only, no scene rebuild), so this tab's next write builds on it instead of undoing it.
  // A changed or missing name means the save was replaced (a Restore): say so and reload.
  setupSaveSync() {
    this._saveName = loadSave().name;
    this._onSaveStorage = (e) => {
      if (!e || (e.key !== SAVE_KEY && e.key !== null)) return;
      if (SAVE_RESTORING) return;
      const s = loadSave();
      const myName = this._saveName;
      if (typeof myName === 'string' && myName && s.name !== myName) {
        SAVE_RESTORING = true; // from now on this tab never writes its old state back
        this.addChatLine({ system: true, text: 'Your save changed in another tab. Reloading...' });
        setTimeout(() => window.location.reload(), 800);
        return;
      }
      this.adoptSave(s);
      this.flushPendingSave();
    };
    window.addEventListener('storage', this._onSaveStorage);
    this.events.once('shutdown', () => window.removeEventListener('storage', this._onSaveStorage));
  }

  adoptSave(s) {
    if (!s || typeof s !== 'object') return;
    const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
    const sr = obj(s.resources), sc = obj(s.crafted), si = obj(s.caveInv);
    // Cycle 11 L: a change this tab has not been able to save yet (storage refused it, SAVE_OK false) used to be thrown away here:
    // every counter was reset to storage and the base moved with it, so the pending delta was gone. Now a counter becomes
    // stored + (mine - base) and the base becomes what storage holds, so the next save that lands still writes this tab's change.
    // With nothing pending (mine === base, the normal case) this is exactly the old "take what storage holds".
    const sb = this._saveBase || {};
    const carry = (mine, base, stored, cap) => {
      const b = obj(base);
      Object.keys(mine).forEach((k) => {
        const sv = Math.min(cap, cleanCount(stored[k]));
        mine[k] = Math.min(cap, cleanCount(sv + ((Number(mine[k]) || 0) - (Number(b[k]) || 0))));
        b[k] = sv;
      });
      return b;
    };
    if (this.resources) sb.resources = carry(this.resources, sb.resources || { ...this.resources }, sr, 1e9);
    if (this.craftedGoods) sb.crafted = carry(this.craftedGoods, sb.crafted || { ...this.craftedGoods }, sc, 1e9);
    if (this.caveInv) sb.caveInv = carry(this.caveInv, sb.caveInv || { ...this.caveInv }, si, 9999);
    if (this.resources) this._saveBase = sb;
    if (this.lifetimeStats) {
      const st = obj(s.lifetimeStats);
      const base = obj(this._statsBase || this.lifetimeStats);
      const next = {};
      Object.keys(st).forEach((k) => { next[k] = cleanCount(st[k]); });
      Object.keys(this.lifetimeStats).forEach((k) => {
        const d = (Number(this.lifetimeStats[k]) || 0) - (Number(base[k]) || 0);
        if (d !== 0) next[k] = cleanCount(cleanCount(st[k]) + d); // this tab's own unsaved increase
        if (!(k in next)) delete this.lifetimeStats[k];
      });
      Object.keys(next).forEach((k) => { this.lifetimeStats[k] = next[k]; });
      this._statsBase = {};
      Object.keys(st).forEach((k) => { this._statsBase[k] = cleanCount(st[k]); });
    }
    if (this.starsPersist()) {
      const sv = cleanCount(s.stars);
      this.localScore = cleanCount(sv + ((Number(this.localScore) || 0) - (Number(this._starsBase) || 0)));
      this._starsBase = sv;
      const mine = this.allPlayers && this.selfData ? this.allPlayers.get(this.selfData.id) : null;
      if (mine && mine.score !== this.localScore) { mine.score = this.localScore; this.renderPlayerList(); }
    }
    let achChanged = false;
    if (this.achievementsUnlocked) {
      // Storage is the truth here (a Restore may have replaced the list); every unlock of this tab was written when it happened,
      // unless storage is refusing this tab's writes: then its own unlocks are kept too (saveAchievements writes the union later).
      const next = (Array.isArray(s.achievementsUnlocked) ? s.achievementsUnlocked : []).filter((id) => typeof id === 'string');
      if (!SAVE_OK) this.achievementsUnlocked.forEach((id) => { if (!next.includes(id)) next.push(id); });
      achChanged = next.length !== this.achievementsUnlocked.size || next.some((id) => !this.achievementsUnlocked.has(id));
      if (achChanged) { this.achievementsUnlocked.clear(); next.forEach((id) => this.achievementsUnlocked.add(id)); }
    }
    if (this.museumCollection) {
      ['museumCollection', 'museumFauna', 'museumFlora'].forEach((k) => {
        const keep = SAVE_OK ? [] : [...this[k]]; // unsaved donations of this tab survive (saveFossils writes the union)
        this[k].clear(); (Array.isArray(s[k]) ? s[k] : []).forEach((id) => this[k].add(id)); keep.forEach((id) => this[k].add(id));
      });
      if (SAVE_OK && Array.isArray(s.fossilsHeld)) this.fossilsHeld = s.fossilsHeld.slice(0, FOSSIL_BAG_CAP);
      this.updateFossilHUD();
    }
    this.updateInventoryHUD();
    if (achChanged) this.renderAchievementsPanel();
  }

  // Cycle 11 L: another tab just wrote the save, so storage takes writes again. If this tab still holds changes it could not write,
  // try once now instead of waiting for the player's next action (closing the tab first would lose them). No ping-pong: the other
  // tab's storage event finds nothing pending there and writes nothing.
  flushPendingSave() {
    if (SAVE_OK || SAVE_RESTORING) return;
    if (writeSave({}) === false) return; // still refused: everything stays pending
    if (this.resources) this.saveResources();
    if (this.lifetimeStats && this.achievementsUnlocked) this.saveAchievements();
    if (this.museumCollection) this.saveFossils();
    this.saveStars();
  }

  setupSaveBackup() {
    const exportBtn = document.getElementById('save-export-btn');
    const importBtn = document.getElementById('save-import-btn');
    const importInput = document.getElementById('save-import-input');
    if (exportBtn) exportBtn.addEventListener('click', () => this.exportSave());
    if (importBtn && importInput) {
      importBtn.addEventListener('click', () => importInput.click());
      importInput.addEventListener('change', () => this.importSave(importInput));
    }
  }

  // R4 O-04: the Town Backup is the same full bundle as the Lantern and the Hub (every save key + settings, MMBackup.bundle).
  // If the backup tool cannot load (offline, first visit), it falls back to the old town-only file and says so.
  exportSave() {
    const download = (data, name) => {
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    };
    this.addChatLine({ system: true, text: 'Making your backup…' });
    loadBackupModules().then((B) => {
      if (!B) {
        download(JSON.stringify(loadSave(), null, 2), `pixeltown-save-${Date.now()}.json`);
        this.addChatLine({ system: true, text: 'Could not load the full backup tool, so this file holds the town save only.' });
        return;
      }
      let bun;
      try { bun = B.bundle(localStorage); } catch (e) { this.addChatLine({ system: true, text: 'Could not read your saves here (site data is blocked), so there is nothing to back up.' }); return; }
      download(JSON.stringify(bun, null, 1), `pixeltown-backup-${Date.now()}.json`);
      try { window.__lastBackup = bun; } catch (e) { /* test hook only */ }
      const warn = bun.warnings && bun.warnings.length ? bun.warnings.map((w) => w.label).join(', ') : '';
      const n = Object.keys(bun.keys).length;
      this.addChatLine({ system: true, text: warn ? `Backup saved (${n} items), but this was damaged on this device and was left out: ${warn}.` : `Backup saved: ${n} saves and settings in one file. Keep it somewhere safe.` });
      if (this.localBody) this.showFloatingText(this.localBody.x, this.localBody.y - 30, 'save backed up!');
    });
  }

  // Beta S-01: Restore validates the file. A Lantern backup bundle is planned and applied with MMBackup (every key, after a
  // confirm listing what will be replaced); an old town-only file must pass cleanTownSave; anything else changes nothing.
  // Before any write the current raw save is kept under pixeltown-save-v1-prev (one safety copy, replaced per restore).
  importSave(input) {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    const refuse = (why) => this.addChatLine({ system: true, text: (why ? why + ' ' : '') + 'That is not a Pixeltown save. Nothing was changed.' });
    if (typeof file.size === 'number' && file.size > TOWN_RESTORE_MAX + 1000000) { refuse('That file is too big.'); return; }
    const reader = new FileReader();
    reader.onerror = () => refuse('Could not read that file.');
    reader.onload = () => {
      const text = String(reader.result || '');
      let parsed;
      try { parsed = JSON.parse(text); } catch (e) { refuse(); return; }
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.format === 'pixeltown-backup') {
        this.restoreBundle(text);
        return;
      }
      const clean = cleanTownSave(parsed);
      if (!clean) { refuse(); return; }
      this.commitRestore(() => { localStorage.setItem(SAVE_KEY, JSON.stringify(clean)); return true; });
    };
    reader.readAsText(file);
  }

  // Keep the safety copy, block every other writer, write, reload. write() returns true or a message.
  commitRestore(write) {
    let prev = null;
    try { prev = localStorage.getItem(SAVE_KEY); } catch (e) { prev = null; }
    try { if (typeof prev === 'string') localStorage.setItem(SAVE_PREV_KEY, prev); } catch (e) { /* quota: restore anyway */ }
    SAVE_RESTORING = true;
    let r;
    try { r = write(); } catch (e) { r = 'Restore failed (storage is full or blocked), so nothing was changed.'; }
    if (r !== true) {
      SAVE_RESTORING = false;
      this.addChatLine({ system: true, text: typeof r === 'string' ? r : 'Restore failed, nothing was changed.' });
      return false;
    }
    this.addChatLine({ system: true, text: 'Save restored! Reloading…' });
    // a plain timer, not this.time: the reload must happen even while the scene is paused (a menu, the cave, a sleeping loop)
    setTimeout(() => window.location.reload(), 800);
    return true;
  }

  restoreBundle(text) {
    // b14-r2-N02: the backup tool lazy-loads (1-2 s on a slow phone); say so at once instead of showing nothing until the confirm
    if (!window.MMBackup) this.addChatLine({ system: true, text: 'Reading the backup…' });
    loadBackupModules().then((B) => {
      if (!B) { this.addChatLine({ system: true, text: 'Could not load the restore tool. Check your connection and try again. Nothing was changed.' }); return; }
      let plan;
      try { plan = B.plan(text); } catch (e) { plan = { ok: false }; }
      if (!plan || !plan.ok) { this.addChatLine({ system: true, text: ((plan && plan.message) || 'That backup file is damaged.') + ' Nothing was changed.' }); return; }
      const lines = (plan.saves || plan.keys).map((k) => '- ' + B.labelOf(k));
      // R4 O-04 preview: settings are listed apart; build / date stamp when the file has one
      const sets = Array.isArray(plan.settings) && plan.settings.length ? '\n\nSettings (' + plan.settings.length + '): ' + plan.settings.map((k) => B.labelOf(k)).join(', ') : '';
      const made = plan.made ? '\nMade ' + String(plan.made).slice(0, 10) + (plan.build ? ' by build ' + plan.build : '') + (plan.newer ? ' (a newer version of the game)' : '') + '.' : '';
      // beta S-03: damaged / unknown entries are skipped by MMBackup.plan (the town save first); say so plainly, they stay as they are here
      const bad = Array.isArray(plan.skipped) && plan.skipped.length ? '\n\nSkipped (damaged or not known by this version), kept as they are on this device:\n' + plan.skipped.map((x) => '- ' + x.label).join('\n') : '';
      const ok = window.confirm('Restore this backup?' + made + '\nIt will replace these saves on this device:\n' + lines.join('\n') + sets + bad + '\n\nNothing changes if you cancel.');
      if (!ok) { this.addChatLine({ system: true, text: 'Restore cancelled. Nothing was changed.' }); return; }
      this.commitRestore(() => { const r = B.apply(localStorage, plan); return r && r.ok ? true : ((r && r.message) || 'Restore failed, nothing was changed.'); });
    });
  }

  setupTriviaKey() {
    this.input.keyboard.on('keydown-T', () => { if (this.canAct() && this.isNearNPC()) this.openTrivia(); });
    const closeBtn = document.getElementById('trivia-close-btn');
    if (closeBtn) closeBtn.addEventListener('click', () => this.closeTrivia());
  }

  takePhoto() {
    // Full-screen flash, independent of the canvas resolution, so it still
    // reads as a photo "snap" even if the shot itself takes a beat to render.
    const flash = this.add.rectangle(0, 0, this.scale.width * 4, this.scale.height * 4, 0xffffff, 1)
      .setScrollFactor(0)
      .setDepth(999999);
    this.tweens.add({ targets: flash, alpha: 0, duration: 350, onComplete: () => flash.destroy() });
    SFX.shutter();

    this.game.renderer.snapshot((image) => {
      const a = document.createElement('a');
      a.href = image.src;
      a.download = `pixeltown-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    });
    this.showFloatingText(this.localBody.x, this.localBody.y - 30, '📸 saved!');
    this.incrementStat('photosTaken');
  }

  setupLoginStreak() {
    const saved = loadSave();
    const today = new Date().toISOString().slice(0, 10);
    const st = streakStep(saved.lastLoginDate, saved.loginStreak, today); // still written (rollback safe), no longer shown or paid on
    if (st.write) writeSave({ loginStreak: st.streak, lastLoginDate: st.date });
    this.loginStreak = st.streak;
    // ID-61 (cycle 12 S): the welcome-back line needs the day of the LAST visit, so it is read here, BEFORE ID-09 rewrites
    // lastVisitDate to today on this load (a same-day reload then reads today and shows nothing). No new key.
    this._welcomeBackDue = townWelcomeBackDue(saved.lastVisitDate, townUtcKey());
    // ID-09: "Days in town N", a count that only goes up (a gap of any length is +1). Save first, then pay, so a reload never pays twice.
    const vd = townDayStep(saved, 'visit', townUtcKey());
    if (vd.write) writeSave({ visitDays: vd.days, lastVisitDate: vd.date });
    this.visitDays = vd.days;
    if (vd.counted) {
      const bonus = Math.min(vd.days, 5);
      this.welcomeToast = `👋 Welcome back! Day ${vd.days} in the village. +${bonus} ⭐`;
      this.awardPoint(bonus, this.welcomeToast, this.localBody.x, this.localBody.y - 44);
    }
    const el = document.getElementById('streak-count');
    if (el) el.textContent = vd.days;
  }

  renderAchievementsPanel() {
    const countEl = document.getElementById('achievement-count');
    if (countEl) countEl.textContent = this.achievementsUnlocked.size;
    const capEl = document.getElementById('achievement-cap');
    if (capEl) capEl.textContent = ACHIEVEMENTS.length;
    const listEl = document.getElementById('achievements-list');
    if (!listEl) return;
    listEl.innerHTML = '';
    ACHIEVEMENTS.forEach((a) => {
      const unlocked = this.achievementsUnlocked.has(a.id);
      const equipped = this.equippedTitle === a.id;
      const li = document.createElement('li');
      li.className = (unlocked ? 'unlocked' : '') + (equipped ? ' equipped' : '');
      li.innerHTML = `<span class="ach-icon">${unlocked ? a.icon : '🔒'}</span>`
        + `<span class="ach-text"><b>${a.label}</b><br>${a.desc}</span>`
        + (unlocked
          ? `<button type="button" class="ach-equip-btn">${equipped ? 'Equipped' : 'Equip'}</button>`
          : `<span class="ach-reward">+${a.reward} ⭐</span>`);
      if (unlocked) {
        li.querySelector('.ach-equip-btn').addEventListener('click', () => this.equipTitle(a.id));
      }
      listEl.appendChild(li);
    });
  }

  setupAchievementsUI() {
    document.getElementById('achievements-badge').addEventListener('click', () => {
      this.renderAchievementsPanel();
      document.getElementById('achievements-overlay').classList.remove('hidden');
      this.achievementsOpen = true;
    });
    document.getElementById('achievements-close-btn').addEventListener('click', () => {
      document.getElementById('achievements-overlay').classList.add('hidden');
      this.achievementsOpen = false;
    });
  }

  setupMuseumUI() {
    this.museumWing = 'fossils';
    const overlay = document.getElementById('museum-overlay');
    document.getElementById('museum-badge').addEventListener('click', () => this.openMuseum());
    document.getElementById('museum-close-btn').addEventListener('click', () => this.closeMuseum());
    // Tapping the dimmed backdrop (not the card) closes, like a native sheet.
    overlay.addEventListener('click', (e) => { if (e.target === overlay) this.closeMuseum(); });
    overlay.querySelectorAll('.museum-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        this.museumWing = tab.dataset.wing;
        this.hideMuseumDetail();
        this.showMuseumWing();
      });
    });
    // One delegated listener for every specimen card, since the grids are
    // re-rendered on each open.
    overlay.querySelector('.museum-body').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-ff-id]');
      if (btn) this.showMuseumDetail(btn.dataset.ffId);
    });
    window.addEventListener('keydown', (e) => {
      if (!this.museumOpen || e.key !== 'Escape') return;
      if (this.museumDetailOpen) this.hideMuseumDetail();
      else this.closeMuseum();
    });
  }

  openMuseum() {
    this.renderMuseumPanel();
    this.hideMuseumDetail();
    this.showMuseumWing();
    document.getElementById('museum-overlay').classList.remove('hidden');
    this.museumOpen = true;
    // Species facts live in a separate ~50KB registry that most sessions
    // never need, so it's only fetched the first time the Museum is opened.
    this.loadSpeciesRegistry();
  }

  closeMuseum() {
    document.getElementById('museum-overlay').classList.add('hidden');
    this.hideMuseumDetail();
    this.museumOpen = false;
  }

  loadSpeciesRegistry() {
    if (!this.speciesRegistryPromise) {
      this.speciesRegistryPromise = fetch('species-registry.json')
        .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
        .then((data) => {
          const byId = new Map();
          (Array.isArray(data && data.species) ? data.species : []).forEach((s) => { if (s && s.id) byId.set(s.id, s); });
          return byId;
        })
        .catch((err) => {
          // Forget the failed attempt so the next open retries.
          this.speciesRegistryPromise = null;
          throw err;
        });
    }
    return this.speciesRegistryPromise;
  }

  showMuseumWing() {
    const overlay = document.getElementById('museum-overlay');
    overlay.querySelectorAll('.museum-tab').forEach((tab) => {
      const active = tab.dataset.wing === this.museumWing;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    overlay.querySelectorAll('.museum-wing').forEach((wing) => {
      wing.classList.toggle('hidden', wing.dataset.wing !== this.museumWing);
    });
    overlay.querySelector('.museum-card').scrollTop = 0;
    // cyc12-ui: on phones the tab bar is one scrolling row; keep the active wing's tab in view (it could sit scrolled off the right end)
    const bar = overlay.querySelector('.museum-tabs');
    const on = bar && bar.querySelector('.museum-tab.active');
    if (on && bar.scrollWidth > bar.clientWidth) {
      const l = on.getBoundingClientRect().left - bar.getBoundingClientRect().left + bar.scrollLeft, r = l + on.offsetWidth;
      if (l < bar.scrollLeft || on.offsetWidth > bar.clientWidth - 16) bar.scrollLeft = l - 8; // a tab wider than the bar shows its start
      else if (r > bar.scrollLeft + bar.clientWidth) bar.scrollLeft = r - bar.clientWidth + 8;
    }
  }

  hideMuseumDetail() {
    this.museumDetailOpen = false;
    this.museumDetailId = null;
    const card = document.querySelector('#museum-overlay .museum-card');
    if (card) card.classList.remove('museum-detail-open');
    const detail = document.getElementById('museum-detail');
    if (detail) { detail.classList.add('hidden'); detail.innerHTML = ''; }
  }

  showMuseumDetail(id) {
    const asset = FF_ASSETS.find((a) => a.id === id);
    if (!asset || !this.ffDiscovered.has(id)) return;
    const card = document.querySelector('#museum-overlay .museum-card');
    const detail = document.getElementById('museum-detail');
    this.museumDetailOpen = true;
    this.museumDetailId = id;
    card.classList.add('museum-detail-open');
    detail.classList.remove('hidden');
    detail.innerHTML = '<button type="button" class="museum-detail-back">‹ Back</button>'
      + `<div class="museum-detail-art">${this.ffStrips && this.ffStrips.caughtUrl[id]
        // Cycle 9 art (G): the T-batch caught pose at an integer zoom of the native art (crisp); the SVG stays for every other species.
        ? `<img class="ff-strip-art" src="${this.ffStrips.caughtUrl[id]}" alt="" style="width:auto;height:auto;max-width:100%;max-height:100%;margin:auto;display:block;image-rendering:pixelated">`
        : `<img src="assets/flora-fauna/svg/${encodeURIComponent(id)}.svg" alt="">`}</div>`
      + `<h3 class="museum-detail-name">${escapeHtml(asset.name)}</h3>`
      + '<p class="museum-detail-sci"></p>'
      + '<dl class="museum-facts"><div class="museum-facts-loading">Loading field notes…</div></dl>';
    detail.querySelector('.museum-detail-back').addEventListener('click', () => this.hideMuseumDetail());
    card.scrollTop = 0;

    const pretty = (s) => String(s).replace(/_/g, ' ');
    const size = (cm) => {
      const n = Number(cm);
      if (!Number.isFinite(n)) return '';
      if (n >= 100) return `${+(n / 100).toFixed(1)} m`;
      if (n < 1) return `${+(n * 10).toFixed(2)} mm`;
      return `${n} cm`;
    };
    this.loadSpeciesRegistry().then((byId) => {
      if (this.museumDetailId !== id) return; // user moved on meanwhile
      const s = byId.get(id);
      const facts = detail.querySelector('.museum-facts');
      if (!s) { facts.innerHTML = '<div class="museum-facts-loading">No field notes for this species yet.</div>'; return; }
      if (s.common_name) detail.querySelector('.museum-detail-name').textContent = s.common_name;
      detail.querySelector('.museum-detail-sci').textContent = s.scientific_name || '';
      const rows = [
        ['Rarity', s.rarity && pretty(s.rarity)],
        ['Biome', s.biome && pretty(s.biome)],
        ['Habitat', s.habitat],
        ['Size', s.size_cm != null && size(s.size_cm)],
        ['Diet', s.diet],
        ['Role', s.trophic_role && pretty(s.trophic_role)],
        ['Behavior', s.behavior],
        ['Season', s.seasonality],
      ].filter(([, v]) => v);
      facts.innerHTML = rows.map(([k, v]) => `<div><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd></div>`).join('');
      if (s.rarity) detail.querySelector('.museum-detail-art').dataset.rarity = String(s.rarity);
    }).catch(() => {
      if (this.museumDetailId !== id) return;
      detail.querySelector('.museum-facts').innerHTML = '<div class="museum-facts-loading">Couldn\'t load field notes — try again later.</div>';
    });
  }

  renderMuseumPanel() {
    const overlay = document.getElementById('museum-overlay');
    const progress = {};
    const setProgress = (wing, have, total) => {
      progress[wing] = [have, total];
      const section = overlay.querySelector(`.museum-wing[data-wing="${wing}"]`);
      const tab = overlay.querySelector(`.museum-tab[data-wing="${wing}"]`);
      const pct = total ? Math.round((have / total) * 100) : 0;
      if (section) {
        section.querySelector('.museum-bar-fill').style.width = `${pct}%`;
        section.classList.toggle('complete', total > 0 && have >= total);
      }
      if (tab) {
        tab.querySelector('.museum-tab-count').textContent = `${have}/${total}`;
        tab.classList.toggle('complete', total > 0 && have >= total);
      }
    };

    const renderSection = (listId, types, collected) => {
      const listEl = document.getElementById(listId);
      if (!listEl) return 0;
      let have = 0;
      listEl.innerHTML = types.map((label, i) => {
        const unlocked = collected.has(i);
        if (unlocked) have++;
        const [icon, ...nameParts] = label.split(' ');
        return `<li class="museum-specimen ${unlocked ? 'unlocked' : 'locked'}">`
          + `<span class="museum-art museum-art-emoji" aria-hidden="true">${escapeHtml(icon)}</span>`
          + (unlocked ? '' : '<span class="museum-lock" aria-hidden="true">🔒</span>')
          + `<span class="museum-name">${unlocked ? escapeHtml(nameParts.join(' ')) : '???'}</span></li>`;
      }).join('');
      return have;
    };
    setProgress('fossils', renderSection('museum-fossils-list', FOSSIL_TYPES, this.museumCollection), FOSSIL_TYPES.length);
    setProgress('fauna', renderSection('museum-fauna-list', FAUNA_TYPES, this.museumFauna), FAUNA_TYPES.length);
    setProgress('flora', renderSection('museum-flora-list', FLORA_TYPES, this.museumFlora), FLORA_TYPES.length);

    // The flora/fauna pack (string ids rather than the small fixed-size
    // FAUNA_TYPES/FLORA_TYPES arrays above) renders the same way but keyed
    // by id, with each species' own SVG art — shown as a dark silhouette
    // until it's been discovered.
    const discovered = this.ffDiscovered || new Set();
    const renderIdSection = (listId, items) => {
      const listEl = document.getElementById(listId);
      if (!listEl) return 0;
      let have = 0;
      listEl.innerHTML = items.map((item) => {
        const unlocked = discovered.has(item.id);
        if (unlocked) have++;
        // Cycle 10 art (G): a species drawn from strips / code art shows that same caught pose in the grid (integer-zoom PNG, pixelated);
        // every other species (and ?ffstrips=0) keeps its SVG. Locked cards still turn it into a silhouette via CSS.
        const thumb = this.ffStrips && this.ffStrips.thumbUrl && this.ffStrips.thumbUrl[item.id];
        const img = thumb
          ? `<span class="museum-art"><img class="ff-strip-thumb" src="${thumb}" alt="" decoding="async"></span>`
          : `<span class="museum-art"><img src="assets/flora-fauna/svg/${encodeURIComponent(item.id)}.svg" alt="" loading="lazy" decoding="async"></span>`;
        if (!unlocked) {
          return `<li class="museum-specimen locked">${img}<span class="museum-lock" aria-hidden="true">🔒</span><span class="museum-name">???</span></li>`;
        }
        const name = escapeHtml(item.name);
        return `<li class="museum-specimen unlocked"><button type="button" class="museum-card-btn" data-ff-id="${escapeHtml(item.id).replace(/"/g, '&quot;')}" aria-label="${name.replace(/"/g, '&quot;')} — view details">`
          + `${img}<span class="museum-name">${name}</span></button></li>`;
      }).join('');
      return have;
    };
    const wildFauna = FF_ASSETS.filter((a) => a.kind === 'fauna');
    const wildFlora = FF_ASSETS.filter((a) => a.kind === 'flora');
    const faunaHave = renderIdSection('museum-wildfauna-list', wildFauna);
    const floraHave = renderIdSection('museum-wildflora-list', wildFlora);
    setProgress('wildfauna', faunaHave, wildFauna.length);
    setProgress('wildflora', floraHave, wildFlora.length);
    document.getElementById('wild-fauna-count').textContent = faunaHave;
    document.getElementById('wild-fauna-cap').textContent = wildFauna.length;
    document.getElementById('wild-flora-count').textContent = floraHave;
    document.getElementById('wild-flora-cap').textContent = wildFlora.length;

    const totals = Object.values(progress).reduce((acc, [h, t]) => [acc[0] + h, acc[1] + t], [0, 0]);
    document.getElementById('museum-total-count').textContent = `${totals[0]}/${totals[1]}`;
    document.getElementById('museum-total-bar').style.width = `${totals[1] ? Math.round((totals[0] / totals[1]) * 100) : 0}%`;
  }

  setupKeysHelp() {
    const btn = document.getElementById('keys-help-btn');
    const overlay = document.getElementById('keys-help-overlay');
    const closeBtn = document.getElementById('keys-help-close-btn');
    if (!btn || !overlay || !closeBtn) return;
    btn.addEventListener('click', () => {
      overlay.classList.remove('hidden');
      this.keysHelpOpen = true;
    });
    closeBtn.addEventListener('click', () => {
      overlay.classList.add('hidden');
      this.keysHelpOpen = false;
    });
  }

  setupChangelogViewer() {
    const btn = document.getElementById('changelog-btn');
    const overlay = document.getElementById('changelog-overlay');
    const closeBtn = document.getElementById('changelog-close-btn');
    const body = document.getElementById('changelog-body');
    if (!btn || !overlay || !closeBtn || !body) return;
    let loaded = false;
    btn.addEventListener('click', async () => {
      overlay.classList.remove('hidden');
      this.changelogOpen = true;
      if (loaded) return;
      loaded = true;
      try {
        const res = await fetch('CHANGELOG.md');
        body.innerHTML = renderChangelogMarkdown(await res.text());
      } catch (e) {
        body.textContent = "Couldn't load the changelog right now.";
      }
    });
    closeBtn.addEventListener('click', () => {
      overlay.classList.add('hidden');
      this.changelogOpen = false;
    });
  }

  setupFeedbackButton() {
    const btn = document.getElementById('feedback-btn');
    if (!btn) return;
    const title = encodeURIComponent('Pixeltown feedback');
    const body = encodeURIComponent('What happened / what you\'d like to see:\n\n');
    btn.href = `https://github.com/bawls-eth/awesome-24px/issues/new?title=${title}&body=${body}`;
  }

  // Collapses the long run of settings/utility buttons that had piled up
  // in the player list panel (Keys, Changelog, Feedback, Sound, Music,
  // Motion, Photo, Backup, Restore) behind one toggle, so the panel's
  // default footprint stays small — only the player list and the always-
  // relevant glanceable status (achievements/map/streak/rating) show by
  // default. Collapsed state is remembered per device.
  setupSettingsToggle() {
    const btn = document.getElementById('settings-toggle-btn');
    const section = document.getElementById('settings-section');
    if (!btn || !section) return;
    // 8-bit menu: one panel, three tabs (Town / Stats / More). "More" is this settings toggle (same id, same remembered
    // settingsOpen key): opening it shows the settings pane, tapping it again goes back to the Town tab.
    let open = loadSave().settingsOpen === true;
    let pane = open ? 'more' : 'town';
    const panes = { town: document.getElementById('town-pane-town'), stats: document.getElementById('town-pane-stats'), more: section };
    const tabs = Array.from(document.querySelectorAll('#town-tabs .town-tab'));
    const render = () => {
      open = pane === 'more';
      Object.keys(panes).forEach((k) => { if (panes[k]) panes[k].classList.toggle('hidden', k !== pane); });
      tabs.forEach((t) => {
        const on = t.dataset.pane === pane;
        t.classList.toggle('active', on);
        t.setAttribute('aria-selected', String(on));
      });
      btn.textContent = '☰ More';
      if (pane === 'stats') this.renderHeroLine();
    };
    this.setTownTab = (next) => { pane = panes[next] ? next : 'town'; render(); };
    render();
    tabs.forEach((t) => {
      if (t === btn) return;
      t.addEventListener('click', () => { pane = t.dataset.pane; if (open) writeSave({ settingsOpen: false }); render(); });
    });
    btn.addEventListener('click', () => {
      pane = pane === 'more' ? 'town' : 'more';
      writeSave({ settingsOpen: pane === 'more' });
      render();
    });
    // Device-only "Suggest or report a bug" box (shared/mm-feedback.js: localStorage only, no network).
    if (window.MMFeedback && !section.dataset.fb) {
      section.dataset.fb = '1';
      try { window.MMFeedback.mount(section, { page: 'town' }); } catch (e) { /* the box never breaks settings */ }
    }
  }

  // ---------- town map ----------
  // A deliberately simple schematic (MAP_LANDMARKS dots + labels on a
  // plain backdrop), not a literal zoomed-out render of the actual game —
  // at the small size a map needs to be, real sprites would just be mud.
  // Shown on demand in an overlay rather than as a permanent on-screen
  // widget, both to avoid adding to the HUD clutter this is meant to fix
  // and because the D-pad/chat-bar corners are already spoken for.

  setupMap() {
    const btn = document.getElementById('map-btn');
    const overlay = document.getElementById('map-overlay');
    const closeBtn = document.getElementById('map-close-btn');
    const canvas = document.getElementById('map-canvas');
    if (!btn || !overlay || !closeBtn || !canvas) return;
    const ctx = canvas.getContext('2d');
    let redrawTimer = null;
    const open = () => {
      overlay.classList.remove('hidden');
      this.mapOpen = true;
      this.drawMap(ctx, canvas.width, canvas.height);
      redrawTimer = setInterval(() => this.drawMap(ctx, canvas.width, canvas.height), 400);
    };
    const close = () => {
      overlay.classList.add('hidden');
      this.mapOpen = false;
      if (redrawTimer) { clearInterval(redrawTimer); redrawTimer = null; }
    };
    btn.addEventListener('click', open);
    closeBtn.addEventListener('click', close);
    this.input.keyboard.on('keydown-M', () => { if (this.canAct()) open(); });
  }

  // cyc5-ui (b07-r3-01): the island grew (world 5800 x 4600) while the village stayed ~2000 x 500 in the middle, so the whole-world map
  // squeezed every pin into a small central cluster with labels printed over each other. The map now frames the village: the landmark
  // box (plus the local player, so you are always on it) padded and fitted to the canvas aspect, clamped to the world; coast, land and
  // ponds use the same transform. Labels are placed greedily (right, left, above, below, then diagonals) so none overlaps another
  // label, a pin or the canvas edge; the placed boxes are kept on this.mapLabelRects for the test.
  mapView(w, h) {
    const W = this.world, pad = 160;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const pts = MAP_LANDMARKS.map((l) => [l.x, l.y]);
    if (this.localBody) pts.push([this.localBody.x, this.localBody.y]);
    pts.forEach(([x, y]) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); });
    x0 -= pad; y0 -= pad; x1 += pad * 1.6; y1 += pad; // labels run to the right of their pin
    let vw = x1 - x0, vh = y1 - y0; const asp = w / h;
    if (vw / vh < asp) { const nw = vh * asp; x0 -= (nw - vw) / 2; vw = nw; } else { const nh = vw / asp; y0 -= (nh - vh) / 2; vh = nh; }
    if (vw >= W.width || vh >= W.height) return { x0: W.originX, y0: W.originY, vw: W.width, vh: W.height };
    x0 = Math.max(W.originX, Math.min(x0, W.originX + W.width - vw)); y0 = Math.max(W.originY, Math.min(y0, W.originY + W.height - vh));
    return { x0, y0, vw, vh };
  }

  drawMap(ctx, w, h) {
    ctx.clearRect(0, 0, w, h);
    const V = this.mapView(w, h);
    const toScreen = (x, y) => [((x - V.x0) / V.vw) * w, ((y - V.y0) / V.vh) * h];

    // Ocean background, land rect inset by the ocean margin — same shape
    // as the real world, just schematic.
    ctx.fillStyle = '#2a5a8a';
    ctx.fillRect(0, 0, w, h);
    // The same rounded coastline the world draws (islandCoast), with a
    // thin sand rim, falling back to the plain land rect.
    if (this.islandCoast) {
      ctx.beginPath();
      this.islandCoast.forEach((p, i) => { const [sx, sy] = toScreen(p.x, p.y); if (i) ctx.lineTo(sx, sy); else ctx.moveTo(sx, sy); });
      ctx.closePath();
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#3f74a3';
      ctx.stroke();
      ctx.fillStyle = '#b9a878';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#b9a878';
      ctx.stroke();
    }
    ctx.fillStyle = '#2f4a33';
    const [landX, landY] = toScreen(this.world.originX + OCEAN_MARGIN, this.world.originY + OCEAN_MARGIN);
    const [landX2, landY2] = toScreen(this.world.originX + this.world.width - OCEAN_MARGIN, this.world.originY + this.world.height - OCEAN_MARGIN);
    const inset = this.islandCoast ? 2 : 0;
    if (ctx.roundRect && inset) {
      ctx.beginPath();
      ctx.roundRect(landX + inset, landY + inset, landX2 - landX - inset * 2, landY2 - landY - inset * 2, 8);
      ctx.fill();
    } else {
      ctx.fillRect(landX, landY, landX2 - landX, landY2 - landY);
    }

    ctx.fillStyle = '#3a86c8';
    [MAIN_POND, EAST_POND].forEach(({ cx, cy, rx, ry }) => {
      const [sx, sy] = toScreen(cx, cy);
      // Sizes scale by the map's ratio only — running them through
      // toScreen() (which also adds the world-origin offset) drew the
      // ponds as huge blobs covering most of the village.
      const swx = (rx * 2 * w) / V.vw;
      const swy = (ry * 2 * h) / V.vh;
      ctx.beginPath();
      ctx.ellipse(sx, sy, Math.max(swx / 2, 2), Math.max(swy / 2, 2), 0, 0, Math.PI * 2);
      ctx.fill();
    });

    const pins = MAP_LANDMARKS.map(({ x, y, label }) => { const [sx, sy] = toScreen(x, y); return { sx, sy, label }; });
    pins.forEach(({ sx, sy }) => {
      ctx.fillStyle = '#d8cfa8';
      ctx.beginPath();
      ctx.arc(sx, sy, 2.5, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.font = '9px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const LH = 10, placed = [];
    const hitArea = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    const dots = pins.map((p) => ({ x: p.sx - 3, y: p.sy - 3, w: 6, h: 6 }));
    pins.forEach((p, i) => {
      const tw = Math.ceil(ctx.measureText(p.label).width) + 2;
      const cands = [[4, -LH / 2], [-4 - tw, -LH / 2], [-tw / 2, -4 - LH], [-tw / 2, 4], [4, -LH - 2], [4, 2], [-4 - tw, -LH - 2], [-4 - tw, 2],
        [-tw / 2, -6 - LH * 2], [-tw / 2, 6 + LH], [8, -LH * 1.5 - 4], [8, LH / 2 + 4], [-8 - tw, -LH * 1.5 - 4], [-8 - tw, LH / 2 + 4]];
      let best = null, bestCost = Infinity;
      for (const [dx, dy] of cands) {
        const r = { x: p.sx + dx, y: p.sy + dy, w: tw, h: LH };
        if (r.x < 1 || r.y < 1 || r.x + r.w > w - 1 || r.y + r.h > h - 1) continue;
        let cost = 0;
        placed.forEach((q) => { cost += hitArea(r, q) * 10; });
        dots.forEach((d, j) => { if (j !== i) cost += hitArea(r, d) * 4; });
        if (cost < bestCost) { best = r; bestCost = cost; if (!cost) break; }
      }
      if (!best) best = { x: Math.max(1, Math.min(w - tw - 1, p.sx + 4)), y: Math.max(1, Math.min(h - LH - 1, p.sy - LH / 2)), w: tw, h: LH };
      placed.push(best);
      ctx.fillStyle = 'rgba(18,26,20,0.72)';
      ctx.fillRect(best.x - 1, best.y, best.w + 1, best.h);
      ctx.fillStyle = 'rgba(238,242,247,0.95)';
      ctx.fillText(p.label, best.x, best.y + LH - 2);
    });
    this.mapLabelRects = placed.map((r, i) => ({ label: pins[i].label, x: r.x, y: r.y, w: r.w, h: r.h, px: pins[i].sx, py: pins[i].sy }));

    this.remotePlayers.forEach((rp) => {
      const [sx, sy] = toScreen(rp.x, rp.y);
      ctx.fillStyle = '#6fbf73';
      ctx.beginPath();
      ctx.arc(sx, sy, 2.5, 0, Math.PI * 2);
      ctx.fill();
    });

    const [lx, ly] = toScreen(this.localBody.x, this.localBody.y);
    ctx.fillStyle = '#ffe066';
    ctx.strokeStyle = '#1c2430';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(lx, ly, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  updateInventoryHUD() {
    const woodEl = document.getElementById('wood-count');
    const stoneEl = document.getElementById('stone-count');
    const fishEl = document.getElementById('fish-count');
    if (woodEl) woodEl.textContent = this.resources.wood || 0;
    if (stoneEl) stoneEl.textContent = this.resources.stone || 0;
    if (fishEl) fishEl.textContent = this.resources.fish || 0;
    const bugEl = document.getElementById('bug-count');
    if (bugEl) bugEl.textContent = this.resources.bugs || 0;
    const turnipEl = document.getElementById('turnip-count');
    if (turnipEl) turnipEl.textContent = this.resources.turnips || 0;
    const shellEl = document.getElementById('shell-count');
    if (shellEl) shellEl.textContent = this.resources.shells || 0;
    const fruitEl = document.getElementById('fruit-count');
    if (fruitEl) fruitEl.textContent = this.resources.fruit || 0;
    const flowerEl = document.getElementById('flower-count');
    if (flowerEl) flowerEl.textContent = this.resources.flowers || 0;
    // Crafted goods: one chip showing the total, hidden until you own any.
    const craftedEl = document.getElementById('crafted-count');
    if (craftedEl && this.craftedGoods) {
      const total = Object.values(this.craftedGoods).reduce((a, b) => a + b, 0);
      craftedEl.textContent = total;
      craftedEl.parentElement.classList.toggle('hidden', total === 0);
    }
  }

  // ---------- fishing ----------
  // Fish shadows are client-local cosmetics (Math.random is fine — the
  // catch itself is local-only, like bugs). All fishing timing is
  // wall-clock (performance.now()) checked every frame in
  // updateFishingRod(), not long delayedCalls: Phaser's clock advances by
  // a capped per-frame delta, so at low FPS a 3s delayedCall could take
  // many real seconds and bites felt broken.

  setupFishShadows() {
    this.fishShadows = [];
    this.fishTargetShadow = null;
    this.fishShadowLastAt = performance.now();
    FISH_SHADOW_ZONES.forEach((zone) => {
      for (let i = 0; i < zone.count; i++) {
        const size = Math.random();
        const p = this.randomFishPoint(zone);
        const sprite = this.add.ellipse(p.x, p.y, 12 + size * 10, 5 + size * 4, 0x0f2236, FISH_SHADOW_ALPHA).setDepth(-1);
        const s = {
          zone, sprite, size, x: p.x, y: p.y, tx: p.x, ty: p.y,
          baseSpeed: 14 + Math.random() * 12, speed: 0,
          state: 'swim', pauseUntil: 0, spookedUntil: 0, fleeUntil: 0, respawnAt: 0,
          phase: Math.random() * Math.PI * 2, heading: 0,
        };
        this.pickFishTarget(s);
        this.fishShadows.push(s);
      }
    });
  }

  randomFishPoint(zone) {
    const { cx, cy, rx, ry } = zone.pond;
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random());
      const x = cx + Math.cos(a) * r * rx * 0.82;
      const y = cy + Math.sin(a) * r * ry * 0.82;
      if (zone.yMax !== undefined && y > zone.yMax) continue;
      if (zone.yMin !== undefined && y < zone.yMin) continue;
      return { x, y };
    }
    if (zone.yMax !== undefined) return { x: cx, y: zone.yMax - 14 };
    if (zone.yMin !== undefined) return { x: cx, y: zone.yMin + 14 };
    return { x: cx, y: cy };
  }

  pickFishTarget(s) {
    const p = this.randomFishPoint(s.zone);
    s.tx = p.x;
    s.ty = p.y;
  }

  // Keeps a point inside a pond's ellipse (scaled by k) so a bobber or a
  // hooked fish never ends up on the grass.
  clampToPond(pond, x, y, k = 0.88) {
    const nx = (x - pond.cx) / (pond.rx * k);
    const ny = (y - pond.cy) / (pond.ry * k);
    const d = Math.hypot(nx, ny);
    if (d <= 1) return { x, y };
    return { x: pond.cx + (nx / d) * pond.rx * k, y: pond.cy + (ny / d) * pond.ry * k };
  }

  nearestPond(x, y) {
    const d = (p) => Math.hypot((x - p.cx) / p.rx, (y - p.cy) / p.ry);
    return d(MAIN_POND) <= d(EAST_POND) ? MAIN_POND : EAST_POND;
  }

  spookFishShadow(s, now) {
    s.state = 'swim';
    s.fleeUntil = now + 1200;
    s.spookedUntil = now + 3000;
    s.pauseUntil = 0;
    s.sprite.setFillStyle(0x0f2236, FISH_SHADOW_ALPHA).setScale(1);
    this.pickFishTarget(s);
  }

  updateFishShadows(now) {
    if (!this.fishShadows) return;
    const dt = Math.min(now - this.fishShadowLastAt, 1000) / 1000;
    this.fishShadowLastAt = now;
    this.fishShadows.forEach((s) => {
      if (s.state === 'gone') {
        if (now < s.respawnAt) return;
        const p = this.randomFishPoint(s.zone);
        s.x = p.x;
        s.y = p.y;
        s.state = 'swim';
        this.pickFishTarget(s);
        s.sprite.setPosition(s.x, s.y).setFillStyle(0x0f2236, FISH_SHADOW_ALPHA).setScale(1).setVisible(true).setAlpha(0);
        this.tweens.add({ targets: s.sprite, alpha: 1, duration: 800 });
        return;
      }
      let moving = false;
      if (s.state === 'biting') {
        // Thrashing on the line.
        s.sprite.setRotation(s.heading + Math.sin(now / 45) * 0.35);
        return;
      }
      if (s.state === 'hooked' || now >= s.pauseUntil) {
        const dx = s.tx - s.x;
        const dy = s.ty - s.y;
        const dist = Math.hypot(dx, dy);
        const speed = s.state === 'hooked' ? s.speed : (now < s.fleeUntil ? 80 : s.baseSpeed);
        const step = Math.min(dist, speed * dt);
        if (dist > 0.5) {
          s.x += (dx / dist) * step;
          s.y += (dy / dist) * step;
          s.heading = Math.atan2(dy, dx);
          moving = true;
        } else if (s.state === 'swim') {
          this.pickFishTarget(s);
          if (Math.random() < 0.45) s.pauseUntil = now + 600 + Math.random() * 2000;
        }
      }
      const wiggle = Math.sin(now / (moving ? 120 : 400) + s.phase) * (moving ? 0.12 : 0.05);
      s.sprite.setPosition(s.x, s.y).setRotation(s.heading + wiggle);
    });
  }

  startFishing(spot) {
    const now = performance.now();
    let shadow = spot.shadow || null;
    const pond = shadow ? shadow.zone.pond : this.nearestPond(spot.x, spot.y);
    let bx = spot.x;
    let by = spot.y;
    if (shadow) {
      // Land the bobber just ahead of the fish so it visibly swims up to it.
      const ahead = this.clampToPond(pond, shadow.x + Math.cos(shadow.heading) * 12, shadow.y + Math.sin(shadow.heading) * 12);
      bx = ahead.x;
      by = ahead.y;
    } else {
      // Fixed bank spot: keep the bobber in the water (one of the old
      // spots sat just past the main pond's south edge, on the grass)
      // and call over the nearest free fish in that pond.
      const p = this.clampToPond(pond, bx, by);
      bx = p.x;
      by = p.y;
      let bestD = Infinity;
      (this.fishShadows || []).forEach((s) => {
        if (s.state !== 'swim' || s.zone.pond !== pond) return;
        const d = Math.hypot(s.x - bx, s.y - by);
        if (d < bestD) { bestD = d; shadow = s; }
      });
    }

    this.fishing.state = 'casting';
    this.fishing.spot = { x: bx, y: by, shadow };
    // Depth -1 (same as the pond/ground layer) used to mean the bobber
    // could render underneath anything with a normal y-based depth —
    // players, decor, ripples added after it — which on a zoomed-out
    // mobile camera made the bite's color change easy to miss entirely.
    // A fixed high depth keeps it on top of the world consistently.
    this.fishing.bobber = this.add.circle(bx, by, 4, 0xffffff).setStrokeStyle(1, 0x1c2430, 1).setDepth(99999);
    this.fishing.rod = this.add.graphics().setDepth(100000);
    const waitMs = FISH_BITE_WAIT_MIN + Math.random() * (FISH_BITE_WAIT_MAX - FISH_BITE_WAIT_MIN);
    this.fishing.biteAt = now + waitMs;
    // One fake-out nibble partway through on longer waits: a small
    // twitch with no sound, so reacting to *any* movement is "too early".
    this.fishing.nibbleAt = waitMs > 2400 ? now + waitMs * (0.4 + Math.random() * 0.25) : 0;
    this.fishing.biteEndAt = 0;
    this.fishing.biteFrames = 0;
    if (shadow) {
      shadow.state = 'hooked';
      const dx = bx - shadow.x;
      const dy = by - shadow.y;
      const d = Math.hypot(dx, dy) || 1;
      // Stop with its nose at the bobber, arriving around 70% of the wait.
      shadow.tx = bx - (dx / d) * 7;
      shadow.ty = by - (dy / d) * 7;
      shadow.speed = Math.max(16, d / ((waitMs * 0.7) / 1000));
      shadow.sprite.setFillStyle(0x0f2236, 0.6);
    }
    this.splashRing(bx, by, 10, 0.6);
  }

  splashRing(x, y, toR, alpha) {
    const ring = this.add.circle(x, y, 3, 0xffffff, 0).setStrokeStyle(2, 0xffffff, alpha).setDepth(99998);
    const state = { r: 3, a: alpha };
    this.tweens.add({
      targets: state,
      r: toR,
      a: 0,
      duration: 500,
      ease: 'Sine.easeOut',
      onUpdate: () => { ring.setRadius(state.r); ring.setStrokeStyle(2, 0xffffff, state.a); },
      onComplete: () => ring.destroy(),
    });
  }

  // Runs every frame from update(): moves the fish shadows, drives the
  // cast -> nibble -> bite -> miss timeline off the wall clock, and
  // draws the line.
  updateFishingRod() {
    const now = performance.now();
    this.updateFishShadows(now);
    const f = this.fishing;
    if (!f) return;
    if (f.state === 'casting') {
      if (f.nibbleAt && now >= f.nibbleAt) {
        f.nibbleAt = 0;
        if (f.bobber) this.tweens.add({ targets: f.bobber, y: f.spot.y + 2, duration: 90, yoyo: true });
      }
      if (now >= f.biteAt) this.fishBite(now);
    } else if (f.state === 'biting') {
      f.biteFrames += 1;
      // The reaction window starts when the bite is actually detected
      // (and so drawn), and needs a few rendered frames, so one long
      // frame hitch can't eat the whole window.
      if (now > f.biteEndAt && f.biteFrames >= 3) this.fishMiss();
    }
    if (!f.rod) return;
    const rod = f.rod;
    rod.clear();
    const tipX = this.localVisual.flipX ? this.localBody.x - 8 : this.localBody.x + 8;
    const tipY = this.localBody.y - 14;
    rod.lineStyle(2, 0x6b4226, 1);
    rod.lineBetween(tipX, tipY, f.bobber ? f.bobber.x : f.spot.x, (f.bobber ? f.bobber.y : f.spot.y) - 2);
  }

  fishBite(now) {
    if (this.fishing.state !== 'casting') return;
    this.fishing.state = 'biting';
    this.fishing.biteEndAt = now + FISH_BITE_WINDOW;
    this.fishing.biteFrames = 0;
    const { x, y, shadow } = this.fishing.spot;
    if (shadow && shadow.state === 'hooked') {
      shadow.state = 'biting';
      shadow.x = shadow.tx;
      shadow.y = shadow.ty;
      shadow.sprite.setPosition(shadow.x, shadow.y).setFillStyle(0x0f2236, 0.8).setScale(1.25);
    }
    if (this.fishing.bobber) {
      const bobber = this.fishing.bobber;
      this.tweens.killTweensOf(bobber);
      bobber.setFillStyle(0xff4444);
      // Pulled under a little and pulsing for the whole window — a color
      // change alone on a 4px circle is easy to miss zoomed out on mobile.
      bobber.setPosition(x, y + 3);
      bobber.setScale(1);
      this.tweens.add({
        targets: bobber,
        scale: 2.2,
        duration: 160,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
    this.splashRing(x, y, 22, 0.9);
    // A big "!" that stays up for the whole reaction window (the shared
    // floating text is small and fades out in under a second).
    this.fishing.alert = this.add.text(x, y - 26, '❗', {
      fontSize: '24px',
      fontFamily: 'monospace',
      stroke: '#1c2430',
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(100003);
    this.tweens.add({ targets: this.fishing.alert, y: y - 32, duration: 140, yoyo: true, repeat: -1 });
    SFX.pop();
    try { if (navigator.vibrate) navigator.vibrate([60, 40, 60]); } catch (e) { /* unsupported */ }
  }

  fishMiss() {
    if (this.fishing.state !== 'biting') return;
    this.showFloatingText(this.fishing.spot.x, this.fishing.spot.y - 24, 'got away…');
    this.endFishing();
  }

  handleFishingInteract() {
    if (this.fishing.state === 'casting') {
      this.showFloatingText(this.fishing.spot.x, this.fishing.spot.y - 24, 'too early!');
      this.endFishing();
    } else if (this.fishing.state === 'biting') {
      const spot = this.fishing.spot;
      if (spot.shadow) {
        // Caught: that fish leaves the pond, a new one shows up later.
        const s = spot.shadow;
        s.state = 'gone';
        s.respawnAt = performance.now() + FISH_SHADOW_RESPAWN_MIN + Math.random() * (FISH_SHADOW_RESPAWN_MAX - FISH_SHADOW_RESPAWN_MIN);
        s.sprite.setVisible(false);
      }
      this.splashRing(spot.x, spot.y, 18, 0.8);
      this.gainResource('fish', 1, spot.x, spot.y - 24);
      const logged = this.recordFishCatch(spot);
      // One size per fish: the journal's roll is also the tournament entry.
      if (this.isFishTournamentTime()) this.catchTournamentFish(spot, logged.sizeCm);
      this.endFishing();
    }
  }

  // ---------- angler's journal ----------
  setupJournal() {
    this.fishlog = this.loadFishLog();
    document.getElementById('journal-btn').addEventListener('click', () => { if (this.canAct()) this.openJournal(); });
    document.getElementById('journal-close-btn').addEventListener('click', () => this.closeJournal());
    const overlay = document.getElementById('journal-overlay');
    overlay.addEventListener('click', (e) => { if (e.target === overlay) this.closeJournal(); });
    this.input.keyboard.on('keydown-L', () => { if (this.journalOpen) this.closeJournal(); else if (this.canAct()) this.openJournal(); });
    this.refreshJournalButton();
  }

  // Sanitised: known species ids, finite non-negative integer counts/records.
  loadFishLog() {
    const rec = loadSave().fishlog;
    const ok = rec && typeof rec === 'object' && !Array.isArray(rec);
    const caught = {};
    if (ok && rec.caught && typeof rec.caught === 'object' && !Array.isArray(rec.caught)) {
      FISH_SPECIES.forEach((f) => {
        const c = rec.caught[f.id];
        if (c && typeof c === 'object' && cleanCount(c.n) > 0) caught[f.id] = { n: cleanCount(c.n), best: Math.min(cleanCount(c.best), 200) };
      });
    }
    const claimed = ok && Array.isArray(rec.claimed) ? rec.claimed.filter((id) => FISH_MILESTONES.some((m) => m.id === id)) : [];
    return { caught, claimed: [...new Set(claimed)], lastDay: ok ? cleanCount(rec.lastDay) : 0 };
  }

  saveFishLog() {
    writeSave({ fishlog: { caught: this.fishlog.caught, claimed: this.fishlog.claimed, lastDay: this.fishlog.lastDay } });
  }

  fishSpeciesCount() {
    return Object.keys(this.fishlog.caught).length;
  }

  // Which species can bite here and now. `rng` is injectable for tests.
  rollFishSpecies(pond, hour, season, size, rng = Math.random) {
    const night = hour >= 19 || hour < 6;
    const pool = FISH_SPECIES.filter((f) => (!f.pond || f.pond === pond) && (!f.time || (f.time === 'night') === night) && (!f.seasons || f.seasons.includes(season)));
    const base = [0, 10, 5, 2, 1];
    // Bigger shadows lean toward rarer fish.
    const weights = pool.map((f) => base[f.rarity] * (f.rarity >= 3 ? 0.5 + size * 1.5 : 1));
    let r = rng() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) return pool[i]; }
    return pool[pool.length - 1];
  }

  fishPondFor(spot) {
    const dm = Math.hypot(spot.x - MAIN_POND.cx, spot.y - MAIN_POND.cy);
    const de = Math.hypot(spot.x - EAST_POND.cx, spot.y - EAST_POND.cy);
    return dm <= de ? 'main' : 'east';
  }

  recordFishCatch(spot) {
    const size = spot.shadow ? spot.shadow.size : Math.random();
    const species = this.rollFishSpecies(this.fishPondFor(spot), new Date().getHours(), this.currentSeason(), size);
    const sizeCm = Math.round(8 + (0.55 * size + 0.45 * Math.random()) * 72);
    const entry = this.fishlog.caught[species.id] || { n: 0, best: 0 };
    const isNew = entry.n === 0;
    entry.n += 1;
    entry.best = Math.max(entry.best, sizeCm);
    this.fishlog.caught[species.id] = entry;
    this.fishlog.lastDay = this.questDayBucket();
    // Save first, then pay, so a reload can never double-pay the first-catch bonus.
    this.saveFishLog();
    this.bountyEvent('town:fish'); // ID-18
    this.showFloatingText(spot.x, spot.y - 44, `${species.icon} ${species.name} ${sizeCm}cm${isNew ? ' — NEW!' : ''}`);
    if (isNew) {
      this.awardPoint(FISH_FIRST_CATCH_BONUS, `📖 new fish logged! +${FISH_FIRST_CATCH_BONUS} ⭐`, spot.x, spot.y - 60, 'sell');
      this.lifetimeStats.fishSpecies = this.fishSpeciesCount();
      this.saveAchievements();
      this.checkAchievements();
    }
    if (sizeCm >= FISH_LUNKER_CM) this.incrementStat('fishLunker');
    this.refreshJournalButton();
    if (this.journalOpen) this.renderJournal();
    this.refreshDailies(); // the 'Catch a fish' chore may have completed the day
    return { species, sizeCm, isNew };
  }

  refreshJournalButton() {
    const btn = document.getElementById('journal-btn');
    const label = `🐟 Journal ${this.fishSpeciesCount()}/${FISH_SPECIES.length}`;
    if (btn && btn.textContent !== label) btn.textContent = label;
  }

  openJournal() {
    this.journalOpen = true;
    document.getElementById('journal-overlay').classList.remove('hidden');
    this.renderJournal();
  }

  closeJournal() {
    this.journalOpen = false;
    document.getElementById('journal-overlay').classList.add('hidden');
  }

  claimFishMilestone(id) {
    const m = FISH_MILESTONES.find((x) => x.id === id);
    if (!m || this.fishlog.claimed.includes(id) || this.fishSpeciesCount() < m.need) return false;
    this.fishlog.claimed.push(id);
    this.saveFishLog(); // before paying
    this.awardPoint(m.reward, `📖 ${m.need} species logged! +${m.reward} ⭐`, this.localBody.x, this.localBody.y - 40, 'achievement');
    this.renderJournal();
    return true;
  }

  fishHint(f) {
    const bits = [];
    if (f.pond) bits.push(f.pond === 'main' ? 'west pond' : 'east pond');
    if (f.time) bits.push(f.time === 'night' ? 'at night' : 'by day');
    if (f.seasons) bits.push(f.seasons.join('/'));
    return bits.length ? bits.join(', ') : 'anywhere';
  }

  renderJournal() {
    const count = this.fishSpeciesCount();
    document.getElementById('journal-progress').textContent = `${count}/${FISH_SPECIES.length} species logged`;
    const bar = document.getElementById('journal-bar-fill');
    bar.style.width = `${Math.round((count / FISH_SPECIES.length) * 100)}%`;
    const grid = document.getElementById('journal-grid');
    grid.innerHTML = '';
    FISH_SPECIES.forEach((f) => {
      const c = this.fishlog.caught[f.id];
      const card = document.createElement('li');
      card.className = c ? 'fish-card found' : 'fish-card locked';
      card.dataset.fish = f.id;
      const icon = document.createElement('div');
      icon.className = 'fish-icon';
      icon.textContent = f.icon;
      const name = document.createElement('div');
      name.className = 'fish-name';
      name.textContent = c ? f.name : '???';
      const sub = document.createElement('small');
      sub.textContent = c ? `x${c.n} · best ${c.best}cm` : this.fishHint(f);
      card.append(icon, name, sub);
      grid.appendChild(card);
    });
    const ms = document.getElementById('journal-milestones');
    ms.innerHTML = '';
    FISH_MILESTONES.forEach((m) => {
      const row = document.createElement('div');
      row.className = 'fish-milestone';
      const done = this.fishlog.claimed.includes(m.id);
      const label = document.createElement('span');
      label.textContent = `${m.need} species → ${m.reward} ⭐`;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'fish-claim-btn';
      btn.dataset.milestone = m.id;
      btn.textContent = done ? 'Claimed' : 'Claim';
      btn.disabled = done || count < m.need;
      btn.addEventListener('click', () => this.claimFishMilestone(m.id));
      row.append(label, btn);
      ms.appendChild(row);
    });
  }

  // ---------- daily fishing tournament ----------

  tournamentStartHour() {
    return Math.floor(this.questHash(30) * (24 - FISH_TOURNAMENT_HOURS));
  }

  isFishTournamentTime() {
    const hour = this.utcHour(); // same clock as the UTC day the start hour is hashed from (cycle0 L-01)
    const start = this.tournamentStartHour();
    return hour >= start && hour < start + FISH_TOURNAMENT_HOURS;
  }

  setupFishTournament() {
    this.tournamentBonusBucket = Number(loadSave().tournamentBonusBucket) || -1;
    const { x, y } = FISH_TOURNAMENT_SIGN_POS;
    const g = this.bakedGfx(y - 1);
    g.fillStyle(0x6b4a30, 1).fillRect(x - 2, y - 4, 4, 30);
    g.fillStyle(0xe8d9b5, 1).fillRect(x - 60, y - 54, 120, 52);
    g.lineStyle(2, 0x8f7044, 1).strokeRect(x - 60, y - 54, 120, 52);
    g.bake();
    this.tournamentSignText = this.add.text(x, y - 28, '', {
      fontSize: '8px',
      fontFamily: 'monospace',
      color: '#3a2a1a',
      align: 'center',
      wordWrap: { width: 106 },
    }).setOrigin(0.5).setDepth(y);
    this.refreshTournamentSign();
    this.watchTournamentDay();
    this.time.addEvent({ delay: 60000, loop: true, callback: () => { this.watchTournamentDay(); this.refreshTournamentSign(); } });
  }

  // The record lives under a per-day key; a session left open past the
  // day rollover used to keep showing (and comparing against) yesterday's
  // record while catches were submitted to today's key.
  watchTournamentDay() {
    const day = this.questDayBucket();
    if (this.tournamentDayKey === day) return;
    if (this.tournamentDayKey !== undefined && this.net.tournamentRef) {
      this.net.tournamentRef.child(String(this.tournamentDayKey)).off('value');
    }
    this.tournamentDayKey = day;
    this.tournamentRecord = null;
    this.net.watchTournament(day, (record) => {
      if (this.tournamentDayKey !== day) return;
      this.tournamentRecord = record;
      this.refreshTournamentSign();
    });
  }

  refreshTournamentSign() {
    if (!this.tournamentSignText) return;
    const start = this.tournamentStartHour();
    const end = start + FISH_TOURNAMENT_HOURS;
    const record = this.tournamentRecord;
    const recordLine = record ? `biggest: ${record.size}cm\nby ${record.name}` : 'no catches yet';
    const win = this.windowLabel(start, end);
    let statusLine = `next: ${win}`;
    if (this.isFishTournamentTime()) statusLine = `LIVE now! (${win})`;
    else if (this.utcHour() >= end) statusLine = `ended (${win})`;
    this.tournamentSignText.setText(['🎣 FISH TOURNEY', statusLine, recordLine].join('\n'));
  }

  catchTournamentFish(spot, givenSizeCm) {
    // Bigger shadows tend to be bigger fish, so picking which fish to
    // cast at matters during the tournament. Still 8-80cm overall.
    const bias = spot && spot.shadow ? spot.shadow.size : Math.random();
    const sizeCm = Number.isFinite(givenSizeCm) ? givenSizeCm : Math.round(8 + (0.55 * bias + 0.45 * Math.random()) * 72);
    // The journal's catch text already shows the length when it was passed in.
    if (!Number.isFinite(givenSizeCm)) this.showFloatingText(spot.x, spot.y - 40, `${sizeCm}cm!`);
    this.net.submitTournamentCatch(this.questDayBucket(), sizeCm).then((result) => {
      if (result.success) {
        this.tournamentRecord = result.record;
        this.refreshTournamentSign();
        if (this.questDayBucket() !== this.tournamentBonusBucket) {
          this.tournamentBonusBucket = this.questDayBucket();
          writeSave({ tournamentBonusBucket: this.tournamentBonusBucket });
          this.awardPoint(FISH_TOURNAMENT_BONUS, `new record! +${FISH_TOURNAMENT_BONUS}⭐`, this.localBody.x, this.localBody.y - 30, 'achievement');
          this.incrementStat('tournamentRecordsSet');
        }
      }
    });
  }

  endFishing() {
    if (this.fishing.timer) this.fishing.timer.remove(false);
    if (this.fishing.bobber) {
      this.tweens.killTweensOf(this.fishing.bobber);
      this.fishing.bobber.destroy();
    }
    if (this.fishing.rod) this.fishing.rod.destroy();
    if (this.fishing.alert) {
      this.tweens.killTweensOf(this.fishing.alert);
      this.fishing.alert.destroy();
      this.fishing.alert = null;
    }
    // Any fish still on the line (too early, got away, walked off)
    // darts off and is skittish for a few seconds.
    const shadow = this.fishing.spot && this.fishing.spot.shadow;
    if (shadow && (shadow.state === 'hooked' || shadow.state === 'biting')) this.spookFishShadow(shadow, performance.now());
    this.fishing.biteAt = 0;
    this.fishing.nibbleAt = 0;
    this.fishing.biteEndAt = 0;
    this.fishing.state = 'idle';
    this.fishing.spot = null;
    this.fishing.bobber = null;
    this.fishing.rod = null;
    this.fishing.timer = null;
  }

  // ---------- building ----------
  // A lightweight, Minecraft-flavored sandbox layer: spend wood to place a
  // grid-snapped block in front of you; it's a real obstacle for everyone,
  // synced through Firebase, and you can remove your own blocks for a refund.

  setupBuilding() {
    this.blocks = new Map();
    this.buildMode = false;
    this.buildType = 'wood';
    this.updateTownRating();
    this.buildPreview = this.add.rectangle(0, 0, GRID_SIZE - 2, GRID_SIZE - 2, 0xffffff, 0)
      .setStrokeStyle(2, 0xffe066)
      .setDepth(400000)
      .setVisible(false);

    this.input.keyboard.on('keydown-B', () => { if (this.canAct()) this.toggleBuildMode(); });
    this.input.keyboard.on('keydown-F', () => { if (this.buildMode && this.canAct()) this.cycleBuildType(); });
    this.input.keyboard.on('keydown-Z', () => { if (this.buildMode && this.canAct()) this.undoLastBlock(); });
    const btn = document.getElementById('build-toggle-btn');
    if (btn) btn.addEventListener('click', () => { if (this.canAct()) this.toggleBuildMode(); });
    const matBtn = document.getElementById('build-material-btn');
    if (matBtn) matBtn.addEventListener('click', () => { if (this.buildMode && this.canAct()) this.cycleBuildType(); });
    const undoBtn = document.getElementById('build-undo-btn');
    if (undoBtn) undoBtn.addEventListener('click', () => { if (this.buildMode && this.canAct()) this.undoLastBlock(); });
  }

  toggleBuildMode() {
    this.buildMode = !this.buildMode;
    const btn = document.getElementById('build-toggle-btn');
    if (btn) btn.classList.toggle('enabled', this.buildMode);
    this.buildPreview.setVisible(this.buildMode);
    document.getElementById('build-mode-banner').classList.toggle('hidden', !this.buildMode);
    document.getElementById('build-material-btn').classList.toggle('hidden', !this.buildMode);
    document.getElementById('build-undo-btn').classList.toggle('hidden', !this.buildMode);
    if (!this.buildMode) this.lastPlacedBlockKey = null;
    // R4 D4 (b07-r2-08): on a phone the expanded people panel and the build controls fought for the same strip. Entering
    // build mode folds the panel (view only, the saved preference is untouched); leaving restores the saved state.
    const panel = document.getElementById('player-list-panel');
    if (panel && window.innerWidth <= 720) {
      if (this.buildMode && !panel.classList.contains('collapsed') && this.applyPanelCollapse) { this.buildFoldedPanel = true; this.panelCollapsed = true; this.applyPanelCollapse(); }
      else if (!this.buildMode && this.buildFoldedPanel && this.applyPanelCollapse) { this.buildFoldedPanel = false; this.panelCollapsed = false; this.applyPanelCollapse(); }
    }
    this.updateBuildBanner();
    this.layoutBuildHud();
    if (!this.buildHudResize) { this.buildHudResize = () => this.layoutBuildHud(); window.addEventListener('resize', this.buildHudResize); }
  }

  // R4 D4 (b07-r2-08): stack the build banner, then Material + Undo side by side, BELOW whatever top HUD sits in the
  // centre band (inventory, Where to?, the people chip, Hold to talk, the Realm Gate chip), so nothing overprints.
  // Desktop (> 720 px) keeps the stylesheet layout. Buttons are >= 44 px tall on phones.
  layoutBuildHud() {
    const ids = ['build-mode-banner', 'build-material-btn', 'build-undo-btn'];
    const [banner, mat, undo] = ids.map((id) => document.getElementById(id));
    if (!banner || !mat || !undo) return;
    const reset = () => [banner, mat, undo].forEach((el) => { el.style.top = ''; el.style.left = ''; el.style.transform = ''; el.style.minHeight = ''; el.style.width = ''; el.style.maxWidth = ''; el.style.boxSizing = ''; });
    if (!this.buildMode || window.innerWidth > 720) { reset(); return; }
    const vw = window.innerWidth;
    const bw = Math.min(vw - 16, 360);
    const bl = (vw - bw) / 2;
    let top = 8;
    ['mm-nav-btn', 'inventory-panel', 'player-list-panel', 'where-to-btn', 'walkie-talk-btn', 'gate-pointer', 'whats-new-banner'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el || el.classList.contains('hidden')) return;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.top > window.innerHeight * 0.5 || r.bottom > window.innerHeight * 0.62) return;
      if (r.right > bl && r.left < bl + bw) top = Math.max(top, r.bottom + 6);
    });
    banner.style.maxWidth = bw + 'px'; banner.style.width = bw + 'px'; banner.style.boxSizing = 'border-box';
    banner.style.left = Math.round(bl) + 'px'; banner.style.transform = 'none';
    banner.style.top = Math.round(top) + 'px';
    const bh = banner.getBoundingClientRect().height || 40;
    const rowTop = Math.round(top + bh + 6);
    [mat, undo].forEach((el) => { el.style.minHeight = '44px'; el.style.top = rowTop + 'px'; el.style.transform = 'none'; });
    const mw = mat.getBoundingClientRect().width; const uw = undo.getBoundingClientRect().width;
    const start = Math.max(8, (vw - (mw + 8 + uw)) / 2);
    mat.style.left = Math.round(start) + 'px';
    undo.style.left = Math.round(start + mw + 8) + 'px';
  }

  cycleBuildType() {
    const keys = Object.keys(BLOCK_TYPES);
    this.buildType = keys[(keys.indexOf(this.buildType) + 1) % keys.length];
    this.updateBuildBanner();
    SFX.pop();
  }

  updateBuildBanner() {
    const def = BLOCK_TYPES[this.buildType];
    const icon = { wood: '🪵', stone: '🪨', flowers: '🌸' }[def.resource] || '';
    const banner = document.getElementById('build-mode-banner');
    if (banner) {
      banner.textContent = IS_TOUCH
        ? `🧱 BUILD MODE — ✋ to place/remove ${def.label} (${def.cost}${icon})`
        : `🧱 BUILD MODE — ✋ / E to place or remove ${def.label} (${def.cost}${icon}) · F to switch material`;
    }
    const matBtn = document.getElementById('build-material-btn');
    if (matBtn) matBtn.textContent = `${def.label} (tap to switch)`;
  }

  getBuildTargetCell() {
    const dir = this.localVisual.flipX ? -1 : 1;
    const tx = this.localBody.x + dir * BLOCK_PLACE_DISTANCE;
    const ty = this.localBody.y;
    const gx = Math.round(tx / GRID_SIZE) * GRID_SIZE;
    const gy = Math.round(ty / GRID_SIZE) * GRID_SIZE;
    return { gx, gy, key: `${gx}_${gy}` };
  }

  updateBuildPreview() {
    if (!this.buildMode) return;
    const { gx, gy } = this.getBuildTargetCell();
    this.buildPreview.setPosition(gx, gy);
  }

  handleBuildInteract() {
    const { gx, gy, key } = this.getBuildTargetCell();
    const existing = this.blocks.get(key);

    if (existing) {
      if (existing.ownerId === this.selfData.id) {
        this.net.removeBlock(key);
        const refundDef = BLOCK_TYPES[existing.type] || BLOCK_TYPES.wood;
        this.resources[refundDef.resource] = (this.resources[refundDef.resource] || 0) + refundDef.cost;
        this.updateInventoryHUD();
        this.saveResources();
      } else {
        this.showFloatingText(gx, gy - 20, "not yours");
      }
      return;
    }

    const def = BLOCK_TYPES[this.buildType];
    if ((this.resources[def.resource] || 0) < def.cost) {
      const needIcon = { wood: '🪵', stone: '🪨', flowers: '🌸' }[def.resource] || '';
      this.showFloatingText(this.localBody.x, this.localBody.y - 30, `need ${needIcon}`);
      return;
    }
    if (this.blocks.size >= BLOCK_CAP) {
      this.showFloatingText(this.localBody.x, this.localBody.y - 30, 'town is full!');
      return;
    }

    this.resources[def.resource] -= def.cost;
    this.updateInventoryHUD();
    this.saveResources();
    this.net.placeBlock(gx, gy, this.buildType);
    this.incrementStat('blocksPlaced');
    if (this.buildType === 'stone') this.incrementStat('stoneBlocksPlaced');
    if (this.buildType === 'lamp') this.incrementStat('lampsPlaced');
    if (this.buildType === 'hedge') this.incrementStat('hedgesPlaced');
    if (this.buildType === 'path') this.incrementStat('pathsPlaced');
    this.lastPlacedBlockKey = key;
    this.lastPlacedBlockAt = Date.now();
  }

  // A one-key undo for the block you JUST placed, wherever you are now —
  // saves walking back to the exact cell. Only undoes your own most
  // recent placement, and only within a short window.
  undoLastBlock() {
    if (!this.lastPlacedBlockKey || Date.now() - this.lastPlacedBlockAt > BUILD_UNDO_WINDOW_MS) {
      this.showFloatingText(this.localBody.x, this.localBody.y - 30, 'nothing to undo');
      return;
    }
    const existing = this.blocks.get(this.lastPlacedBlockKey);
    if (!existing || existing.ownerId !== this.selfData.id) {
      this.showFloatingText(this.localBody.x, this.localBody.y - 30, 'nothing to undo');
      this.lastPlacedBlockKey = null;
      return;
    }
    this.net.removeBlock(this.lastPlacedBlockKey);
    const refundDef = BLOCK_TYPES[existing.type] || BLOCK_TYPES.wood;
    this.resources[refundDef.resource] = (this.resources[refundDef.resource] || 0) + refundDef.cost;
    this.updateInventoryHUD();
    this.saveResources();
    this.showFloatingText(this.localBody.x, this.localBody.y - 30, 'undone!');
    SFX.pop();
    this.lastPlacedBlockKey = null;
  }

  addBlockVisual(b) {
    if (this.blocks.has(b.key)) return;
    if (this.blocks.size >= BLOCK_DRAW_CAP) return; // flood safety (netsafety P1-3)
    const def = BLOCK_TYPES[b.type] || BLOCK_TYPES.wood;
    // Path tiles are ground texture, not objects — draw them flat and
    // behind everything (players, props) instead of depth-sorted by y.
    const sprite = this.add.rectangle(b.x, b.y, def.size, def.size, def.color, 1)
      .setStrokeStyle(2, def.stroke)
      .setDepth(b.type === 'path' ? -1 : b.y);
    const obstacle = def.solid ? this.addObstacleRect({
      x: b.x - GRID_SIZE / 2 + 1,
      y: b.y - GRID_SIZE / 2 + 1,
      width: GRID_SIZE - 2,
      height: GRID_SIZE - 2,
    }) : null;
    let glow = null;
    if (b.type === 'lamp') {
      glow = this.add.circle(b.x, b.y - 10, 7, 0xffe066, 0.9).setDepth(b.y + 1).setVisible(!!this.isNightBugs);
      this.lampGlows = this.lampGlows || [];
      this.lampGlows.push(glow);
    }
    this.blocks.set(b.key, { sprite, obstacle, glow, ownerId: b.ownerId, type: b.type });
    this.updateTownRating();
  }

  removeBlockVisual(key) {
    const b = this.blocks.get(key);
    if (!b) return;
    b.sprite.destroy();
    if (b.obstacle) b.obstacle.destroy();
    if (b.glow) {
      this.lampGlows = (this.lampGlows || []).filter((g) => g !== b.glow);
      b.glow.destroy();
    }
    this.blocks.delete(key);
    this.updateTownRating();
  }

  // A shared, synced "how built-up is the town" readout — just a count
  // of every block currently placed (by anyone), with a few flavor tiers.
  updateTownRating() {
    const countEl = document.getElementById('town-rating-count');
    const labelEl = document.getElementById('town-rating-label');
    if (!countEl || !labelEl) return;
    const count = this.blocks.size;
    countEl.textContent = count;
    let label;
    if (count === 0) label = 'Empty';
    else if (count < 10) label = 'Sparse';
    else if (count < 30) label = 'Cozy';
    else if (count < 70) label = 'Bustling';
    else if (count < BLOCK_CAP) label = 'Metropolis';
    else label = 'Full!';
    labelEl.textContent = label;
  }

  // ---------- players ----------

  createShadow(x, y) {
    return this.add.ellipse(x, y + 9, 18, 8, 0x000000, 0.28).setDepth(-1);
  }

  createNameText(x, y, name) {
    return this.add.text(x, y - 22, censorBlockedTerms(name), {
      fontSize: '11px',
      fontFamily: 'monospace',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(100000);
  }

  createLocalPlayer(playerData) {
    const heroTex = this.safeTexture(playerData.species, playerData.frame);
    this.localBody = this.physics.add.sprite(playerData.x, playerData.y, heroTex.key, heroTex.frame).setVisible(false);
    this.localBody.body.setCollideWorldBounds(true);
    // Feet-sized hitbox: was 16x16 at offset (4,12), which stuck 4px out
    // below the 24px sprite so you stopped short of things above you and
    // snagged on corners; 14x12 ends exactly at the sprite's feet.
    this.localBody.body.setSize(14, 12).setOffset(5, 12);

    this.localVisual = this.add.sprite(playerData.x, playerData.y, heroTex.key, heroTex.frame);
    if (playerData.facing === -1) this.localVisual.setFlipX(true);

    this.localShadow = this.createShadow(playerData.x, playerData.y);
    this.localNameText = this.createNameText(playerData.x, playerData.y, playerData.name);
    this.localBobState = { phase: 0, lift: 0 };
  }

  // A remote record can name a species this client doesn't have loaded
  // (a newer client's rare outfit, or plain junk) - fall back to a known
  // sheet instead of Phaser's missing-texture box, and keep the frame in
  // range for whichever sheet is used.
  safeTexture(species, frame) {
    // Heroes: every species (hero_<class> or a legacy key) renders as a hero texture; stored values are never changed.
    // ?legacyart=1 keeps an old sheet only for a real species key, never any loaded texture (a remote player as a tileset).
    const hero = MMTownHeroes.resolve(species, frame, (k) => MMTownHeroes.legacyArt() && LEGACY_SPECIES_KEYS.has(k) && this.textures.exists(k));
    if (this.textures.exists(hero.key)) { species = hero.key; frame = hero.frame; }
    const key = typeof species === 'string' && this.textures.exists(species) ? species : SPECIES[0].key;
    const f = Number.isInteger(frame) && this.textures.get(key).has(frame) ? frame : 0;
    return { key, frame: f };
  }

  addRemotePlayer(p) {
    const tex = this.safeTexture(p.species, p.frame);
    const visual = this.add.sprite(p.x, p.y, tex.key, tex.frame).setFlipX(p.facing === -1);
    const shadow = this.createShadow(p.x, p.y);
    const nameText = this.createNameText(p.x, p.y, p.name);
    this.remotePlayers.set(p.id, {
      id: p.id,
      name: p.name,
      visual,
      shadow,
      nameText,
      bubble: null,
      x: p.x,
      y: p.y,
      targetX: p.x,
      targetY: p.y,
      facing: p.facing,
      species: p.species,
      frame: p.frame,
      bob: { phase: 0, lift: 0 },
    });
  }

  removeRemotePlayer(id) {
    const rp = this.remotePlayers.get(id);
    if (!rp) return;
    rp.visual.destroy();
    rp.shadow.destroy();
    rp.nameText.destroy();
    if (rp.bubble) rp.bubble.destroy();
    this.remotePlayers.delete(id);
    if (this.lastEmoteAt) this.lastEmoteAt.delete(id);
  }

  showChatBubble(playerId, text) {
    let anchor;
    const isLocal = playerId === this.selfData.id;

    if (isLocal) {
      anchor = this.localVisual;
    } else {
      const rp = this.remotePlayers.get(playerId);
      if (!rp) return;
      anchor = rp.visual;
      if (rp.bubble) rp.bubble.destroy();
    }

    // Remote text is masked the same way as the chat log (a client that
    // writes straight to the database skips the send-side filter), and
    // capped so a giant message can't paper over the screen.
    const bubbleText = censorBlockedTerms(String(text)).slice(0, 140);
    const bubble = this.add.text(anchor.x, anchor.y - 40, bubbleText, {
      fontSize: '11px',
      fontFamily: 'monospace',
      color: '#1c2430',
      backgroundColor: '#ffffff',
      padding: { x: 6, y: 4 },
      wordWrap: { width: 160 },
    }).setOrigin(0.5).setDepth(100001);

    if (isLocal) {
      if (this.localChatBubble) this.localChatBubble.destroy();
      this.localChatBubble = bubble;
    } else {
      this.remotePlayers.get(playerId).bubble = bubble;
    }

    this.time.delayedCall(4000, () => {
      bubble.destroy();
      if (this.localChatBubble === bubble) this.localChatBubble = null;
      const rp = this.remotePlayers.get(playerId);
      if (rp && rp.bubble === bubble) rp.bubble = null;
    });
  }

  // ---------- world drawing ----------

  // Land rect (village + wilderness ring), inset from the world's true
  // edges by OCEAN_MARGIN — everything outside this is ocean.
  landBounds() {
    return {
      x: this.world.originX + OCEAN_MARGIN,
      y: this.world.originY + OCEAN_MARGIN,
      width: this.world.width - OCEAN_MARGIN * 2,
      height: this.world.height - OCEAN_MARGIN * 2,
    };
  }

  // The island's outline: the land rect with rounded corners (radius 140),
  // pushed out along its normal by `offset` plus up to `amp` px of smooth,
  // deterministic wobble (negative amp pulls inward). Every frequency is a
  // whole number of cycles around the perimeter so the outline closes
  // seamlessly. The coast itself (offset 60+) always sits OUTSIDE
  // landBounds() — a rounded corner of radius 140 bulges in by at most
  // 140*(sqrt2-1) = 58px — so everything placed against the plain rect
  // (wilderness trees/rocks, flora/fauna, wild critters) still stands on
  // land exactly where it did; the beach just grew a natural shape.
  islandOutline(offset, amp, seed, step = 24) {
    const land = this.landBounds();
    const r = 140;
    const x0 = land.x + r;
    const y0 = land.y + r;
    const x1 = land.x + land.width - r;
    const y1 = land.y + land.height - r;
    const w = x1 - x0;
    const h = y1 - y0;
    const arc = (Math.PI / 2) * r;
    const perimeter = 2 * w + 2 * h + 4 * arc;
    const waves = [[5, 1], [11, 0.6], [19, 0.4], [37, 0.25], [61, 0.15]]
      .map(([k, wt], i) => [k, wt, worldHash(seed, i, 61) * Math.PI * 2]);
    const totalWeight = waves.reduce((sum, [, wt]) => sum + wt, 0);
    // [length, (t) => [cx, cy, nx, ny]] — edges and quarter arcs of the
    // inner (radius-0) rect, clockwise from the top edge's left end.
    const quarter = (cx, cy, a0) => (t) => { const a = a0 + t * Math.PI / 2; return [cx, cy, Math.cos(a), Math.sin(a)]; };
    const segs = [
      [w, (t) => [x0 + t * w, y0, 0, -1]],
      [arc, quarter(x1, y0, -Math.PI / 2)],
      [h, (t) => [x1, y0 + t * h, 1, 0]],
      [arc, quarter(x1, y1, 0)],
      [w, (t) => [x1 - t * w, y1, 0, 1]],
      [arc, quarter(x0, y1, Math.PI / 2)],
      [h, (t) => [x0, y1 - t * h, -1, 0]],
      [arc, quarter(x0, y0, Math.PI)],
    ];
    const points = [];
    let s = 0;
    segs.forEach(([len, at]) => {
      const n = Math.max(1, Math.round(len / step));
      for (let i = 0; i < n; i++, s += len / n) {
        const [cx, cy, nx, ny] = at(i / n);
        let noise = 0;
        waves.forEach(([k, wt, ph]) => { noise += wt * Math.sin((s / perimeter) * k * Math.PI * 2 + ph); });
        const d = r + offset + amp * (noise / totalWeight + 1) / 2;
        points.push({ x: cx + nx * d, y: cy + ny * d, nx, ny });
      }
    });
    return points;
  }

  traceOutline(ctx, points) {
    ctx.beginPath();
    points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
  }

  // Ocean, shallows, beach and grass never change, so instead of live
  // Graphics objects (each one re-tessellates all of its shapes on every
  // frame — the old ocean/ground layers were 860+ shape commands redrawn
  // per frame) they're painted ONCE with the 2D canvas API into a 2x2 grid
  // of half-resolution canvas textures and shown as 4 plain Images.
  // Half-res keeps each tile ~1450x1150 (well under any device's max
  // texture size, ~27MB total) and the 2px texels suit the pixel-art look.
  // drawOcean() paints water + beach; drawGround() paints grass onto the
  // same canvases. Only the waves/foam on top are live (cheap) objects.
  drawOcean() {
    // Trees/flowers/critters elsewhere use their own y as their Phaser
    // depth (a common 2D "y-sort" trick) — fine when y is always a small
    // positive village coordinate, but the wilderness ring extends y well
    // below 0 (up to originY). A fixed depth like the old -3 would then
    // sit *above* that content and hide it behind the ocean. Anchoring
    // this to originY instead guarantees it's always further back than
    // anything anywhere in the (much bigger) world.
    const depth = this.world.originY - 1000;
    const scale = 0.5;
    const tileW = this.world.width / 2;
    const tileH = this.world.height / 2;
    this.islandCoast = this.islandOutline(60, 55, 1);
    const layers = [
      [this.islandOutline(330, 140, 4, 48), '#3471a6'],
      [this.islandOutline(190, 90, 3), '#4b93c6'],
      [this.islandOutline(110, 60, 2), '#6cb8de'],
    ];
    this.islandTiles = [];
    for (let ty = 0; ty < 2; ty++) {
      for (let tx = 0; tx < 2; tx++) {
        const left = this.world.originX + tx * tileW;
        const top = this.world.originY + ty * tileH;
        const key = `island_${tx}_${ty}`;
        if (this.textures.exists(key)) this.textures.remove(key);
        const tex = this.textures.createCanvas(key, Math.ceil(tileW * scale), Math.ceil(tileH * scale));
        tex.context.setTransform(scale, 0, 0, scale, -left * scale, -top * scale);
        this.paintOcean(tex.context, layers);
        tex.refresh();
        this.add.image(left, top, key).setOrigin(0, 0).setScale(1 / scale).setDepth(depth);
        this.islandTiles.push(tex);
      }
    }
    this.drawOceanWaves();
  }

  paintOcean(ctx, layers) {
    const W = this.world;
    ctx.fillStyle = '#2a5a8a';
    ctx.fillRect(W.originX, W.originY, W.width, W.height);
    // Glints out in the deep water (same deterministic scatter the old
    // wave-dots used — free now that they're baked).
    ctx.fillStyle = 'rgba(96,146,196,0.6)';
    for (let i = 0; i < 260; i++) {
      const wx = Math.round(W.originX + worldHash(i, 0, 11) * W.width);
      const wy = Math.round(W.originY + worldHash(i, 1, 12) * W.height);
      ctx.fillRect(wx - 8, wy, 16, 4);
    }
    // Deep -> shelf -> shallows -> turquoise near-shore bands.
    layers.forEach(([pts, color]) => {
      this.traceOutline(ctx, pts);
      ctx.fillStyle = color;
      ctx.fill();
    });
    // Sand, a darker wet-sand lip where the water laps, then a foam line.
    this.traceOutline(ctx, this.islandCoast);
    ctx.fillStyle = '#e3d2a0';
    ctx.fill();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#d2bd88';
    ctx.lineWidth = 22;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 6;
    ctx.stroke();
    // A few pebbles and shell bits on the sand.
    this.islandCoast.forEach((p, i) => {
      if (worldHash(i, 0, 81) > 0.3) return;
      const inset = 26 + worldHash(i, 1, 82) * 40;
      ctx.fillStyle = worldHash(i, 2, 83) < 0.5 ? '#f6ecd0' : '#c4ad7c';
      ctx.fillRect(p.x - p.nx * inset, p.y - p.ny * inset, 6, 4);
    });
  }

  // Cheap animated water: baked wave-crest Images out at sea and foam
  // dashes along the shoreline, all driven by 5 shared tweens — no
  // per-frame redraw, no Graphics objects.
  drawOceanWaves() {
    if (!this.textures.exists('wave_crest')) {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.lineStyle(3, 0xd8ecfa, 1);
      g.beginPath(); g.arc(9, 12, 8, Math.PI * 1.1, Math.PI * 1.9); g.strokePath();
      g.beginPath(); g.arc(23, 12, 8, Math.PI * 1.1, Math.PI * 1.9); g.strokePath();
      g.generateTexture('wave_crest', 32, 14);
      g.clear();
      g.fillStyle(0xffffff, 1).fillEllipse(12, 4, 22, 6);
      g.generateTexture('foam_dash', 24, 8);
      g.destroy();
    }
    const depth = this.world.originY - 990;
    const land = this.landBounds();
    const pad = 260;
    if (!TOWN_PERF.ambientLayers) return; // TN2 low tier: no crest / foam ambient layers (the ocean texture itself stays)
    const crests = [[], [], []];
    for (let i = 0; i < 120; i++) {
      const x = Math.round(this.world.originX + worldHash(i, 0, 51) * this.world.width);
      const y = Math.round(this.world.originY + worldHash(i, 1, 52) * this.world.height);
      const nearLand = x > land.x - pad && x < land.x + land.width + pad && y > land.y - pad && y < land.y + land.height + pad;
      if (nearLand) continue;
      const crest = this.add.image(x, y, 'wave_crest').setDepth(depth).setAlpha(0.15);
      crest._cpad = 12; // cull: sways 10 px around this spot (see cullOffscreen)
      crests[i % 3].push(crest);
    }
    crests.forEach((group, i) => this.tweens.add({
      targets: group, x: '+=10', alpha: 0.7, duration: 2000 + i * 600, delay: i * 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    }));
    const foam = [[], []];
    this.islandCoast.forEach((p, i) => {
      if (i % 6) return;
      const dash = this.add.image(p.x + p.nx * 16, p.y + p.ny * 16, 'foam_dash')
        .setDepth(depth).setAlpha(0.1).setRotation(Math.atan2(p.ny, p.nx) + Math.PI / 2);
      dash.nx = p.nx;
      dash.ny = p.ny;
      dash._cpad = 12; // cull: sways 10 px around this spot (see cullOffscreen)
      foam[(i / 6) % 2].push(dash);
    });
    foam.forEach((group, i) => this.tweens.add({
      targets: group,
      x: (target, key, value) => value - target.nx * 10,
      y: (target, key, value) => value - target.ny * 10,
      alpha: 0.85,
      duration: 1700 + i * 500,
      delay: i * 850,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    }));
  }

  // A sparse scatter of wild villager-sprites roaming the wilderness ring,
  // reusing whatever species sheets preload() already loaded for regular
  // villagers — purely decorative, same wander-tween shape as the pond's
  // Moon Cats, no interaction. Deterministic (worldHash) so it's the same
  // for every client, no network traffic needed.
  drawWilderness() {
    const land = this.landBounds();
    const critterCount = 14;
    for (let i = 0; i < critterCount; i++) {
      const x = Math.round(land.x + worldHash(i, 0, 41) * land.width);
      const y = Math.round(land.y + worldHash(i, 0, 42) * land.height);
      const nearVillage = x > VILLAGE_BOUNDS.x - 150 && x < VILLAGE_BOUNDS.x + VILLAGE_BOUNDS.width + 150
        && y > VILLAGE_BOUNDS.y - 150 && y < VILLAGE_BOUNDS.y + VILLAGE_BOUNDS.height + 150;
      if (nearVillage) continue;
      const species = SPECIES[Math.floor(worldHash(i, 1, 43) * SPECIES.length)];
      const frame = Math.floor(worldHash(i, 2, 44) * FRAME_COUNT);
      const range = 60 + worldHash(i, 3, 45) * 80;
      const critTex = this.safeTexture(species.key, frame);
      const critter = this.add.sprite(x, y, critTex.key, critTex.frame).setDepth(y);
      critter.prevX = x;
      this.tweens.add({
        targets: critter,
        x: { from: x - range, to: x + range },
        duration: 5000 + i * 300,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
        onUpdate: () => { critter.setFlipX(critter.x < critter.prevX); critter.prevX = critter.x; },
      });
    }
  }

  // ---------- flora/fauna starter pack scatter ----------
  // A handful of each of the 20 imported species (see species-registry.json),
  // scattered deterministically with worldHash like the rest of the
  // wilderness — same reasoning: identical on every device, no network
  // traffic, no Math.random(). Low counts per species on purpose: this is
  // decor variety layered on top of the existing wilderness/pond/ocean
  // systems, not a replacement for them, and the big Graphics-draw-call
  // performance lesson from the ocean/ground rewrite still applies even
  // though these are cheap Sprites, not Graphics.
  // Small fixed clusters standing in for a "desert corner" and an "alpine
  // corner" — there's no real desert or alpine biome on this map, so
  // unlike the forest/meadow/pond/ocean zones (scattered across real
  // terrain), these just gather their species into one hand-placed spot
  // each, offset so 5 species don't render stacked on the same pixel.
  floraFaunaClusterSpots(anchorX, anchorY) {
    return [
      [0, 0], [70, -30], [-70, -20], [40, 55], [-60, 45], [110, 20],
    ].map(([dx, dy]) => [anchorX + dx, anchorY + dy]);
  }

  drawFloraFauna() {
    const land = this.landBounds();
    this.ffLand = land;
    // Every static collision rect drawn so far (buildings, trees, rocks,
    // the pond walls...), padded — mostly upward, since building art
    // stands taller than its collision rect — so nothing spawns or walks
    // on top of a house. Player-built structures come later and are not
    // included, which also keeps spawn points identical on every client.
    this.ffBlockers = this.obstacles.getChildren().map((r) => [
      r.x - r.width / 2 - 16, r.y - r.height / 2 - 48, r.x + r.width / 2 + 16, r.y + r.height / 2 + 12,
    ]);
    const desertSpots = this.floraFaunaClusterSpots(land.x + 110, land.y + land.height - 110);
    const alpineSpots = this.floraFaunaClusterSpots(land.x + land.width - 140, land.y + 110);
    const inVillage = (x, y) => x > VILLAGE_BOUNDS.x - 150 && x < VILLAGE_BOUNDS.x + VILLAGE_BOUNDS.width + 150
      && y > VILLAGE_BOUNDS.y - 150 && y < VILLAGE_BOUNDS.y + VILLAGE_BOUNDS.height + 150;
    // Deterministic per (seed, attempt): a rejected spot just moves on to
    // the next attempt, so every client still lands on the same answer.
    const H = (seed, t, k, salt) => worldHash(seed, t * 3 + k, salt);
    const pick = (gen, ok) => {
      for (let t = 0; t < 16; t++) {
        const [x, y] = gen(t);
        if (ok(x, y)) return [Math.round(x), Math.round(y)];
      }
      return null;
    };
    const polar = (p, ang, k) => [p.cx + Math.cos(ang) * p.rx * k, p.cy + Math.sin(ang) * p.ry * k];
    this.ffSpecimens = [];
    FF_ASSETS.forEach((a, idx) => {
      const seedBase = 500 + idx * 13;
      // Land animals roam the whole island instead of being confined to
      // their zone's small patch; plants stay put, and desert_accent/
      // alpine_accent stay small corner patches for the plants using them.
      const roamsLand = a.kind === 'fauna' && a.zone !== 'pond' && a.zone !== 'ocean';
      const count = roamsLand ? 5 : (a.zone === 'forest' || a.zone === 'meadow' ? 3 : 2);
      const move = a.kind === 'fauna' ? (FF_MOVE[a.id] || 'walk') : null;
      const spawns = [];
      for (let i = 0; i < count; i++) {
        const seed = seedBase + i;
        let spot;
        let pond = null;
        let ocean = false;
        if (a.zone === 'pond') {
          pond = i % 2 === 0 ? MAIN_POND : EAST_POND;
          spot = FF_IN_WATER.has(a.id)
            // In the water (was: on the bank, so lilies/fish sat on grass).
            ? pick((t) => polar(pond, H(seed, t, 0, 71) * Math.PI * 2, 0.3 + H(seed, t, 1, 76) * 0.5), () => true)
            : pick((t) => polar(pond, H(seed, t, 0, 71) * Math.PI * 2, 1.3 + H(seed, t, 1, 76) * 0.12), (x, y) => !this.ffBlocked(x, y));
        } else if (a.zone === 'ocean') {
          // A near-shore band all the way round the island (was: anywhere
          // in the world, with every on-land roll piled onto one point).
          ocean = true;
          spot = pick((t) => {
            const side = Math.floor(H(seed, t, 0, 72) * 4);
            const d = 50 + H(seed, t, 1, 73) * 180;
            const u = H(seed, t, 2, 77);
            if (side === 0) return [land.x + u * land.width, land.y - d];
            if (side === 1) return [land.x + u * land.width, land.y + land.height + d];
            if (side === 2) return [land.x - d, land.y + u * land.height];
            return [land.x + land.width + d, land.y + u * land.height];
          }, (x, y) => this.ffOceanOk(x, y));
        } else if (!roamsLand && (a.zone === 'desert_accent' || a.zone === 'alpine_accent')) {
          const [ax, ay] = (a.zone === 'desert_accent' ? desertSpots : alpineSpots)[(idx * 2 + i) % desertSpots.length];
          spot = pick((t) => [ax + (H(seed, t, 0, 78) - 0.5) * 90, ay + (H(seed, t, 1, 79) - 0.5) * 90], (x, y) => this.ffLandOk(x, y));
        } else {
          // Was a one-pass "+350" nudge that could land inside a pond, on a
          // building, or back inside the village; now retried properly.
          spot = pick((t) => [land.x + H(seed, t, 0, 74) * land.width, land.y + H(seed, t, 1, 75) * land.height],
            (x, y) => !inVillage(x, y) && this.ffLandOk(x, y));
        }
        if (spot) spawns.push({ x: spot[0], y: spot[1], pond, ocean });
      }
      // A couple of small harmless critters living in the village itself.
      if (FF_VILLAGE.includes(a.id)) {
        for (let i = 0; i < 2; i++) {
          const seed = seedBase + 9 + i;
          const spot = pick((t) => [
            VILLAGE_BOUNDS.x + 100 + H(seed, t, 0, 81) * (VILLAGE_BOUNDS.width - 200),
            VILLAGE_BOUNDS.y + 100 + H(seed, t, 1, 82) * (VILLAGE_BOUNDS.height - 200),
          ], (x, y) => this.ffLandOk(x, y));
          if (spot) spawns.push({ x: spot[0], y: spot[1], pond: null, ocean: false });
        }
      }
      spawns.forEach((s, i) => this.addFloraFaunaSpecimen(a, move, s, i));
    });

    // Nearby-specimen bookkeeping: a cheap 400ms sweep decides which
    // specimens are around the camera; only those animate, and only those
    // are looked at every frame for the hint/sparkles/E-to-log.
    this.ffNear = [];
    this.time.addEvent({ delay: 400, loop: true, callback: () => this.refreshFloraFaunaNear() });
    this.ffHint = this.add.text(0, 0, '', {
      fontSize: '11px', fontFamily: 'monospace', color: '#ffffff', stroke: '#1c2430', strokeThickness: 3,
    }).setOrigin(0.5, 0).setDepth(99995).setVisible(false);
    this.ffSparkles = [];
    for (let i = 0; i < 6; i++) {
      this.ffSparkles.push(this.add.star(0, 0, 4, 2, 6, 0xfff2a8).setDepth(99994).setVisible(false));
    }
    this.tweens.add({ targets: this.ffSparkles, alpha: { from: 1, to: 0.2 }, angle: 90, duration: 650, yoyo: true, repeat: -1 });
  }

  // 8-bit look for the wildlife (shared/mm-pixelize.js, design/PIXELIZE.md): every loaded ff_<id> SVG is baked ONCE, here, into a
  // crisp canvas texture ffpx_<id> at half its display size, then drawn at 2x (setDisplaySize is unchanged, so layout and reach stay).
  // ?pixelize=0 (or a missing module, or a failed bake) keeps the original SVG art. Never per frame.
  // Cycle 2 art (G): emoji glyphs inside the world's pixel labels render differently on every OS and clash with the 8-bit look. Once at
  // create, every world-space Text whose text starts with a mapped emoji + space loses the emoji and gets a code-drawn 16 px MMPixelIcons
  // image (original art, 1x, crisp) 1 px left of the word; the pair stays centred where the label was. Labels whose emoji a test pins
  // (Founder's Statue, Isles sign) are not in the map. A later setText on a converted label (mailbox count, home cozy) is stripped the
  // same way. ?worldicons=0 = the old emoji labels. Cost: one canvas texture per icon id, one Image per label, nothing per frame.
  pixelWorldLabels() {
    const st = this.worldIcons = { on: !/[?&]worldicons=0(&|$)/.test(location.search) && !!window.MMPixelIcons, labels: [], ms: 0 };
    if (!st.on) return st;
    const t0 = performance.now();
    const MAP = { '🏠': 'house', '🏡': 'house', '🏛️': 'museum', '🏛': 'museum', '📬': 'mail', '📮': 'mail', '🔨': 'hammer', '📖': 'book', '🥬': 'turnip', '🌀': 'realm', '🎣': 'angler',
      // cycle 3 art (G): the rest of the world labels. 🚪 portal doors stay glyphs (beta-r4-doors / replay-doors find them by /^🚪/).
      '🎲': 'dice', '🕹️': 'joystick', '🕹': 'joystick', '🪦': 'grave', '🌾': 'wheat', '👗': 'dress', '⛏️': 'pickaxe', '⛏': 'pickaxe', '🛒': 'cart', '🦋': 'bugs', '🧪': 'flask' };
    const split = (txt) => { const m = typeof txt === 'string' ? /^(\S+) (.+)$/s.exec(txt) : null; return m && MAP[m[1]] ? { id: MAP[m[1]], rest: m[2] } : null; };
    const texKey = (id) => {
      const key = 'pxico-' + id;
      if (!this.textures.exists(key)) { const cv = window.MMPixelIcons.canvas(id, 16); if (!cv) return null; this.textures.addCanvas(key, cv); }
      return key;
    };
    this.children.list.slice().forEach((o) => {
      if (!o || o.type !== 'Text' || o.scrollFactorX !== 1 || o.parentContainer) return;
      const sp = split(o.text); if (!sp) return;
      const key = texKey(sp.id); if (!key) return;
      const cx0 = o.x, icon = this.add.image(0, 0, key).setDepth(o.depth).setOrigin(0.5);
      const place = () => {
        const w = o.displayWidth, left = cx0 - (w + 17) / 2; // icon 16 + 1 px gap, the pair centred on the old label x
        o.x = left + 17 + w * o.originX;
        icon.setPosition(Math.round(left + 8), Math.round(o.y + o.displayHeight * (0.5 - o.originY)));
        icon.setVisible(o.visible); icon.setAlpha(o.alpha);
      };
      const set0 = o.setText.bind(o);
      o.setText = (v) => { const s2 = split(Array.isArray(v) ? v.join('\n') : v); set0(s2 ? s2.rest : v); if (icon.scene) place(); return o; };
      const vis0 = o.setVisible.bind(o);
      o.setVisible = (v) => { vis0(v); if (icon.scene) icon.setVisible(v); return o; };
      o.once('destroy', () => icon.destroy());
      set0(sp.rest); place();
      o.pxIcon = icon;
      st.labels.push({ id: sp.id, text: sp.rest, obj: o, icon: icon });
    });
    st.ms = performance.now() - t0;
    return st;
  }

  pixelizeFloraFauna() {
    this.ffPixelized = 0;
    if (!window.MMPixelize || !MMPixelize.enabled()) return;
    const t0 = performance.now();
    FF_ASSETS.forEach((a) => {
      const src = `ff_${a.id}`;
      if (!this.textures.exists(src) || this.textures.exists(`ffpx_${a.id}`)) return;
      try {
        const img = this.textures.get(src).getSourceImage();
        if (!img || !(img.naturalWidth || img.width)) return;
        const px = TOWN_NPC_SCALE && a.kind === 'fauna' ? ffDisplaySize(a) : Math.max(8, Math.round(Math.max(14, a.w, a.h) / 2)); // W-06: fauna 1:1 with the hero's pixels
        const ent = MMPixelize.bake(img, { size: px, key: `ff_${a.id}@${px}` });
        if (ent && ent.canvas && ent.w > 0) { this.textures.addCanvas(`ffpx_${a.id}`, ent.canvas); this.ffPixelized++; }
      } catch (e) { /* this species keeps its SVG */ }
    });
    this.ffPixelizeMs = Math.round(performance.now() - t0);
  }

  floraFaunaKey(id) {
    return this.textures.exists(`ffpx_${id}`) ? `ffpx_${id}` : `ff_${id}`;
  }

  addFloraFaunaSpecimen(a, move, s, i) {
    // The SVGs are square, so a non-square w/h used to squash the art
    // (pine 72x96, joshua tree 80x104...). Keep the bigger side, square;
    // never below 14px so the microscopic species stay findable specks.
    const size = Math.max(14, a.w, a.h); // gameplay size (reach / speed / range), unchanged
    const fly = move === 'fly';
    // Cycle 9 art (G): a species with T-batch strips is an animated Sprite (idle / move / caught, right + down, left = flipX) drawn at
    // its baked half-native cell (deer 32, fox / owl 24: the hero's pixel density); every other species is the SVG Image as before.
    const strip = !!(window.MMTownFauna && MMTownFauna.has(this, a.id));
    const shown = strip ? this.ffStrips.cells[a.id] : ffDisplaySize(a); // W-06: what is drawn
    const sprite = (strip ? this.add.sprite(s.x, s.y, `fft_${a.id}`, 'idle_down_0') : this.add.image(s.x, s.y, this.floraFaunaKey(a.id)))
      .setDisplaySize(shown, shown).setDepth(fly ? s.y + 40 : s.y);
    if (strip) { sprite.ffDir = i % 2 ? 'right' : 'down'; sprite.setFlipX(i % 3 === 1); MMTownFauna.play(sprite, a.id, 'idle', sprite.ffDir); }
    const inWater = !!s.pond && FF_IN_WATER.has(a.id);
    const spec = {
      id: a.id, name: a.name, x: s.x, y: s.y, px: s.x, py: s.y, sprite, move, pond: s.pond, ocean: s.ocean, strip,
      baseScaleY: sprite.scaleY,
      phase: i * 1.7 + a.w,
      // Big animals are reachable from their edge, not just their centre;
      // players can't wade into the ponds, so in-water species reach further.
      reach: Math.max(FF_COLLECT_RADIUS, size / 2 + 16) * (inWater ? 1.6 : 1),
      speed: FF_SPEED[a.id] || (fly ? 55 : move === 'swim' ? 22 : Phaser.Math.Clamp(size * 0.7, 12, 50)),
      range: fly ? 160 : size > 50 ? 150 : 90,
      active: false,
      moving: false,
      idle: null,
      walking: false, // cyc10 coord: declared up front (the strip animals set it on their first walk; pool-shape rule)
    };
    if (!move || move === 'still') {
      // Rooted plants sway, water-bound ones (and sessile sea life) bob.
      // Created paused; refreshFloraFaunaNear() only runs them on screen.
      spec.idle = (s.pond || s.ocean)
        ? this.tweens.add({ targets: sprite, y: s.y - 4, duration: 1200 + i * 150, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', paused: true })
        : this.tweens.add({ targets: sprite, angle: { from: -3, to: 3 }, duration: 1800 + i * 200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', paused: true });
    }
    this.ffSpecimens.push(spec);
  }

  ffBlocked(x, y) {
    const b = this.ffBlockers;
    for (let i = 0; i < b.length; i++) {
      const r = b[i];
      if (x > r[0] && x < r[2] && y > r[1] && y < r[3]) return true;
    }
    return false;
  }

  ffInPond(p, x, y, k) {
    const dx = (x - p.cx) / (p.rx * k);
    const dy = (y - p.cy) / (p.ry * k);
    return dx * dx + dy * dy < 1;
  }

  // Solid ground: inside the island (clear of the beach), out of both
  // ponds and clear of every static obstacle.
  ffLandOk(x, y) {
    const land = this.ffLand;
    const pad = 40;
    if (x < land.x + pad || x > land.x + land.width - pad || y < land.y + pad || y > land.y + land.height - pad) return false;
    if (this.ffInPond(MAIN_POND, x, y, 1.2) || this.ffInPond(EAST_POND, x, y, 1.2)) return false;
    return !this.ffBlocked(x, y);
  }

  // Open water just off the beach, still inside the world.
  ffOceanOk(x, y) {
    const land = this.ffLand;
    const w = this.world;
    if (x < w.originX + 30 || x > w.originX + w.width - 30 || y < w.originY + 30 || y > w.originY + w.height - 30) return false;
    return x < land.x - 35 || x > land.x + land.width + 35 || y < land.y - 35 || y > land.y + land.height + 35;
  }

  refreshFloraFaunaNear() {
    const v = this.cameras.main.worldView;
    const m = 160;
    const near = [];
    this.ffSpecimens.forEach((spec) => {
      const { x, y } = spec.sprite;
      const inView = x > v.x - m && x < v.right + m && y > v.y - m && y < v.bottom + m;
      if (inView) near.push(spec);
      spec.active = inView && !reduceMotion;
      if (spec.strip && spec.sprite.anims) { // strip animals only animate near the camera (and never with reduced motion)
        if (spec.active && spec.sprite.anims.isPaused) spec.sprite.anims.resume();
        else if (!spec.active && spec.sprite.anims.isPlaying) spec.sprite.anims.pause();
      }
      if (spec.idle) {
        if (spec.active && spec.idle.isPaused()) spec.idle.resume();
        else if (!spec.active && !spec.idle.isPaused()) spec.idle.pause();
      } else if (spec.active && !spec.moving) {
        spec.moving = true;
        this.time.delayedCall(Phaser.Math.Between(0, 1500), () => this.stepFloraFauna(spec));
      }
    });
    this.ffNear = near;
  }

  pickFloraFaunaTarget(spec) {
    for (let t = 0; t < 4; t++) {
      if (spec.move === 'bank') {
        // Pace along the shore of its own pond.
        const p = spec.pond;
        const ang = Math.atan2((spec.py - p.cy) / p.ry, (spec.px - p.cx) / p.rx) + (Math.random() - 0.5) * 1.0;
        const [x, y] = [p.cx + Math.cos(ang) * p.rx * (1.25 + Math.random() * 0.2), p.cy + Math.sin(ang) * p.ry * (1.25 + Math.random() * 0.2)];
        if (!this.ffBlocked(x, y)) return [x, y];
        continue;
      }
      const x = spec.x + (Math.random() * 2 - 1) * spec.range;
      const y = spec.y + (Math.random() * 2 - 1) * spec.range * 0.7;
      if (spec.move === 'swim') {
        if (spec.pond ? this.ffInPond(spec.pond, x, y, 0.85) : this.ffOceanOk(x, y)) return [x, y];
        continue;
      }
      if (spec.move === 'fly') {
        // Fliers may pass over rooftops, but stay over the island.
        const land = this.ffLand;
        if (x > land.x + 30 && x < land.x + land.width - 30 && y > land.y + 30 && y < land.y + land.height - 30) return [x, y];
        continue;
      }
      // Walkers: the destination and the way there must be solid ground.
      let ok = true;
      for (const f of [0.33, 0.66, 1]) {
        if (!this.ffLandOk(spec.px + (x - spec.px) * f, spec.py + (y - spec.py) * f)) { ok = false; break; }
      }
      if (ok) return [x, y];
    }
    return null;
  }

  // One leg of an animal's wander: tween to a nearby target, then rest and
  // go again — but only while it's near the camera (otherwise it parks
  // until refreshFloraFaunaNear() wakes it).
  stepFloraFauna(spec) {
    if (!spec.active) { spec.moving = false; return; }
    const target = this.pickFloraFaunaTarget(spec);
    if (!target) {
      this.time.delayedCall(Phaser.Math.Between(800, 2000), () => this.stepFloraFauna(spec));
      return;
    }
    const sprite = spec.sprite;
    const [tx, ty] = target;
    const dx = tx - spec.px;
    const dist = Math.hypot(dx, ty - spec.py);
    if (Math.abs(dx) > 2) sprite.setFlipX((dx < 0) !== (!spec.strip && FF_FACES_LEFT.has(spec.id))); // cycle 11: code / strip art always faces right
    if (spec.strip) {
      sprite.ffDir = MMTownFauna.pick(dx, ty - spec.py);
      spec.walking = true;
      if (sprite.ffDir === 'down') sprite.setFlipX(false);
      MMTownFauna.play(sprite, spec.id, 'move', sprite.ffDir);
    }
    const fly = spec.move === 'fly';
    const swim = spec.move === 'swim';
    const pos = { x: spec.px, y: spec.py };
    this.tweens.add({
      targets: pos,
      x: tx,
      y: ty,
      duration: Math.max(400, (dist / spec.speed) * 1000),
      ease: 'Sine.easeInOut',
      onUpdate: () => {
        const now = this.time.now;
        if (fly) {
          // Bob up and down and flap (squash) while flying.
          sprite.setPosition(pos.x, pos.y - 10 + Math.sin(now / 160 + spec.phase) * 5);
          if (!spec.strip) sprite.scaleY = spec.baseScaleY * (0.8 + 0.2 * Math.abs(Math.sin(now / 60 + spec.phase))); // strips flap in frames
          sprite.setDepth(pos.y + 40);
        } else if (swim) {
          sprite.setPosition(pos.x, pos.y + Math.sin(now / 500 + spec.phase) * 2);
          sprite.angle = Math.sin(now / 300 + spec.phase) * 4;
        } else {
          // Little side-to-side waddle while walking.
          sprite.setPosition(pos.x, pos.y);
          if (!spec.strip) sprite.angle = Math.sin(now / 90 + spec.phase) * 5; // strips walk in frames, no waddle tilt
          sprite.setDepth(pos.y);
        }
      },
      onComplete: () => {
        spec.px = tx;
        spec.py = ty;
        sprite.angle = 0;
        sprite.scaleY = spec.baseScaleY;
        if (spec.strip) { spec.walking = false; MMTownFauna.play(sprite, spec.id, 'idle', sprite.ffDir || 'right'); }
        this.time.delayedCall(fly ? Phaser.Math.Between(200, 1400) : Phaser.Math.Between(900, 4000), () => this.stepFloraFauna(spec));
      },
    });
  }

  // Per frame, but only over the specimens near the camera: sparkles over
  // species not logged yet, and an "E: log <name>" label under the one in reach
  // (under, so it never collides with the player's own nametag).
  updateFloraFaunaHint() {
    if (!this.ffNear || !this.localBody || !this.ffDiscovered) return;
    const px = this.localBody.x;
    const py = this.localBody.y;
    let best = null;
    let bestDist = Infinity;
    let n = 0;
    for (const spec of this.ffNear) {
      if (this.ffDiscovered.has(spec.id)) continue;
      const s = spec.sprite;
      const d = Math.hypot(s.x - px, s.y - py);
      if (d < 260 && n < this.ffSparkles.length) {
        this.uncull(this.ffSparkles[n++].setPosition(s.x + s.displayWidth * 0.3, s.y - s.displayHeight * 0.45).setVisible(true)); // pooled: moved this frame
      }
      if (d < spec.reach && d < bestDist) { best = spec; bestDist = d; }
    }
    for (let i = n; i < this.ffSparkles.length; i++) this.ffSparkles[i].setVisible(false);
    if (best && this.canAct() && (!this.fishing || this.fishing.state === 'idle')) { // G-13 (b07-12): no "E: log" label over "Reel it in!"
      const s = best.sprite;
      this.ffHint.setText(`${IS_TOUCH ? '✋' : 'E'}: log ${best.name}`).setPosition(s.x, s.y + s.displayHeight / 2 + 2).setVisible(true);
    } else {
      this.ffHint.setVisible(false);
    }
  }

  // ID-59: a few times a second, greet the first not-yet-greeted wild animal within ANIMAL_HELLO_RADIUS (see the constants above).
  updateAnimalHello(time) {
    if (!this.ffNear || !this.localBody || this.inRealm || this.inUnderground || this.realmEmbed) return;
    this.updateAnimalHelloHearts(time);
    if (time - (this._animalHelloAt || 0) < 200) return;
    this._animalHelloAt = time;
    if (!this.animalHello) this.animalHello = cleanAnimalHello(loadSave().animalHello);
    const px = this.localBody.x, py = this.localBody.y;
    let best = null, bestD = ANIMAL_HELLO_RADIUS;
    for (const spec of this.ffNear) {
      const idx = FF_FAUNA_INDEX[spec.id];
      if (idx === undefined || animalHelloHas(this.animalHello, idx)) continue;
      const d = Math.hypot(spec.sprite.x - px, spec.sprite.y - py);
      if (d < bestD) { best = spec; bestD = d; }
    }
    if (best) this.animalHelloGreet(best, time);
  }

  animalHelloGreet(spec, time) {
    const idx = FF_FAUNA_INDEX[spec.id];
    this.animalHello = animalHelloSet(this.animalHello, idx);
    const mine = this.animalHello;
    // Merged write: ORs with what storage holds now (another tab's hellos are kept). Refused = kept in memory, carried by the next hello.
    writeSaveMerged((stored) => ({ animalHello: animalHelloOr(stored.animalHello, mine) }));
    this.animalHelloLog = this.animalHelloLog || [];
    this.animalHelloLog.push(spec.id);
    const sprite = spec.sprite;
    // Turn toward the hero: only species with side / down frames (strips), and only while standing (a walk tween owns the frame).
    if (spec.strip && !spec.walking && window.MMTownFauna) {
      const dx = this.localBody.x - sprite.x, dy = this.localBody.y - sprite.y;
      sprite.ffDir = MMTownFauna.pick(dx, dy);
      sprite.setFlipX(sprite.ffDir !== 'down' && dx < 0);
      MMTownFauna.play(sprite, spec.id, 'idle', sprite.ffDir);
      if (reduceMotion && sprite.anims) sprite.anims.pause();
    }
    const still = reduceMotion || document.body.classList.contains('a11y-reduce-motion');
    const heart = makeAnimalHelloHeart(this, sprite.x, sprite.y - sprite.displayHeight / 2 - 4).setDepth(99996);
    const h = { heart, spec, until: time + ANIMAL_HELLO_HEART_MS, still, t0: time };
    this.animalHelloHearts = this.animalHelloHearts || [];
    this.animalHelloHearts.push(h);
    this.animalHelloLine(spec);
  }

  // Hearts follow their animal; a small bob unless motion is reduced (then it just appears and disappears, no bounce, no fade).
  updateAnimalHelloHearts(time) {
    const hs = this.animalHelloHearts;
    if (!hs || !hs.length) return;
    for (let i = hs.length - 1; i >= 0; i--) {
      const h = hs[i], s = h.spec.sprite;
      if (time >= h.until || !s.scene) { h.heart.destroy(); hs.splice(i, 1); continue; }
      const k = (time - h.t0) / ANIMAL_HELLO_HEART_MS;
      const bob = h.still ? 0 : -Math.round(Math.abs(Math.sin(k * Math.PI * 3)) * 5); // three small hops
      h.heart.setPosition(Math.round(s.x), Math.round(s.y - s.displayHeight / 2 - 4 + bob));
      if (!h.still) h.heart.setAlpha(k > 0.75 ? Math.max(0, (1 - k) * 4) : 1);
    }
  }

  // The one line: only when #achievement-toast is free (no achievement / note showing, What's-new, welcome-back and the gate chip down), at most once
  // per 30 s, and never while a panel, shop, the Museum, the map, the nav sheet or the bag is open. Otherwise skipped (the heart still shows).
  animalHelloLine(spec) {
    const now = Date.now();
    if (this._animalHelloLineAt && now - this._animalHelloLineAt < ANIMAL_HELLO_LINE_GAP_MS) return false;
    const up = (id) => { const e = document.getElementById(id); return !!e && !e.classList.contains('hidden') && getComputedStyle(e).display !== 'none'; };
    if (up('achievement-toast') || up('whats-new-banner') || up('town-welcome')) return false;
    // First-minute rule: while the Realm Gate chip guides a new player it is the one line of guidance (and it hides while the toast is up).
    if (up('gate-pointer') || this._quietLines) return false;
    const bag = document.getElementById('inventory-panel');
    if (!this.canAct() || (bag && bag.classList.contains('bag-open')) || this.buildMode) return false;
    const toast = document.getElementById('achievement-toast');
    if (!toast) return false;
    this._animalHelloLineAt = now;
    toast.textContent = `${/^[AEIOU]/i.test(spec.name) ? 'An' : 'A'} ${spec.name} noticed you 💛`;
    toast.classList.add('toast-hello'); // <= 300 px: compact, above the bag bar (style.css)
    toast.classList.remove('hidden');
    clearTimeout(this.achievementToastTimer);
    this.achievementToastTimer = setTimeout(() => toast.classList.add('hidden'), ANIMAL_HELLO_LINE_MS);
    this.animalHelloLines = (this.animalHelloLines || 0) + 1;
    return true;
  }

  // ---------- Wild fauna/flora log (folded into the Museum) ----------
  // Walking up to any scattered flora/fauna specimen and pressing E logs
  // that species permanently (per device) — same "no need to carry it
  // in" pattern as the museum's existing fauna/flora sections, and
  // rendered right alongside them as two more sections in the same
  // overlay, rather than a separate button/panel.

  setupFloraFaunaLog() {
    const saved = loadSave();
    this.ffDiscovered = new Set(Array.isArray(saved.ffDiscovered) ? saved.ffDiscovered : []);
  }

  saveFloraFaunaLog() {
    writeSave({ ffDiscovered: [...this.ffDiscovered] });
  }

  // Uses each specimen's *current* position (animals move), and prefers a
  // not-yet-logged species over an already-logged one standing closer.
  findNearestFloraFauna() {
    if (!this.ffNear) return null;
    let nearest = null;
    let nearestDist = Infinity;
    let nearestNew = false;
    this.ffNear.forEach((spec) => {
      const d = Phaser.Math.Distance.Between(this.localBody.x, this.localBody.y, spec.sprite.x, spec.sprite.y);
      if (d >= spec.reach) return;
      const isNew = !this.ffDiscovered.has(spec.id);
      if ((isNew && !nearestNew) || (isNew === nearestNew && d < nearestDist)) { nearest = spec; nearestDist = d; nearestNew = isNew; }
    });
    return nearest;
  }

  collectFloraFauna(spec) {
    const { x, y } = spec.sprite;
    if (spec.strip) this.showFloraFaunaCaught(spec);
    if (this.ffDiscovered.has(spec.id)) {
      this.showFloatingText(x, y - 30, `${spec.name} (already logged)`);
      SFX.pop();
      return;
    }
    this.ffDiscovered.add(spec.id);
    this.saveFloraFaunaLog();
    this.awardPoint(1, `🔍 ${spec.name} added to the Museum! (${this.ffDiscovered.size}/${FF_ASSETS.length})`, x, y - 30, 'achievement');
  }

  // Cycle 9 art (G): a strip animal shows its T-batch `caught` pose for a moment when it is logged, then goes back to idle.
  showFloraFaunaCaught(spec) {
    const sp = spec.sprite, dir = sp.ffDir === 'down' ? 'down' : 'right';
    sp.anims.stop();
    sp.setFrame(`caught_${dir}_0`);
    this.time.delayedCall(900, () => { if (sp.scene) MMTownFauna.play(sp, spec.id, spec.walking ? 'move' : 'idle', sp.ffDir || dir); });
  }

  drawGround() {
    const land = this.landBounds();
    // Painted straight into drawOcean()'s baked canvas tiles (one
    // layer, behind everything) rather than a separate Graphics object.
    // The grass edge wobbles 6-36px inside landBounds(), leaving a beach
    // of varying width between it and the coast.
    const grassEdge = this.islandOutline(-6, -30, 5);
    (this.islandTiles || []).forEach((tex) => {
      const ctx = tex.context;
      ctx.save();
      this.traceOutline(ctx, grassEdge);
      ctx.fillStyle = '#8fd474';
      ctx.fill();
      ctx.strokeStyle = '#a9dc86';
      ctx.lineWidth = 8;
      ctx.stroke();
      ctx.clip();
      // Soft lighter/darker meadow patches so the grass isn't one flat color.
      for (let i = 0; i < 320; i++) {
        const gx = land.x + worldHash(i, 0, 33) * land.width;
        const gy = land.y + worldHash(i, 1, 34) * land.height;
        const r = 50 + worldHash(i, 2, 35) * 130;
        const tone = worldHash(i, 3, 36) < 0.5 ? '164,224,134' : '122,194,98';
        const grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, r);
        grad.addColorStop(0, `rgba(${tone},0.55)`);
        grad.addColorStop(0.6, `rgba(${tone},0.35)`);
        grad.addColorStop(1, `rgba(${tone},0)`);
        ctx.fillStyle = grad;
        ctx.fillRect(gx - r, gy - r, r * 2, r * 2);
      }
      // Texture flecks (same scatter as before) plus little grass tufts.
      ctx.fillStyle = '#7bc464';
      for (let i = 0; i < 1400; i++) {
        const gx = Math.round(land.x + worldHash(i, 0, 31) * land.width);
        const gy = Math.round(land.y + worldHash(i, 1, 32) * land.height);
        ctx.fillRect(gx, gy, 4, 4);
      }
      ctx.strokeStyle = '#6db457';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 900; i++) {
        const gx = Math.round(land.x + worldHash(i, 0, 37) * land.width);
        const gy = Math.round(land.y + worldHash(i, 1, 38) * land.height);
        ctx.moveTo(gx - 4, gy - 6); ctx.lineTo(gx, gy); ctx.lineTo(gx + 4, gy - 6);
      }
      ctx.stroke();
      // Tiny clover/daisy dots.
      for (let i = 0; i < 220; i++) {
        const gx = Math.round(land.x + worldHash(i, 0, 39) * land.width);
        const gy = Math.round(land.y + worldHash(i, 1, 40) * land.height);
        ctx.fillStyle = worldHash(i, 2, 41) < 0.6 ? '#f7f7ea' : '#fff0a0';
        ctx.fillRect(gx, gy, 4, 4);
        ctx.fillRect(gx + 6, gy + 3, 4, 4);
        ctx.fillRect(gx + 1, gy + 7, 4, 4);
      }
      ctx.restore();
      tex.refresh();
    });
  }

  drawPath() {
    // Deliberately scoped to the village, not the whole (much bigger)
    // land rect — a dirt road cutting straight across the wilderness and
    // into the ocean made no sense.
    // Same footprint as always (64px roads, 150px plaza); a soft darker
    // rim and rounded ends instead of hard rectangle edges. Only a dozen
    // shape commands, so it stays one small Graphics object.
    const g = this.bakedGfx(-1);
    const { x, y, width, height } = VILLAGE_BOUNDS;
    g.fillStyle(0xa5cf86, 1);
    g.fillRoundedRect(x - 6, 600 - 38, width + 12, 76, 38);
    g.fillRoundedRect(800 - 38, y - 6, 76, height + 12, 38);
    g.fillCircle(800, 600, 157);
    g.fillStyle(0xe0c49a, 1);
    g.fillRoundedRect(x, 600 - 32, width, 64, 32);
    g.fillRoundedRect(800 - 32, y, 64, height, 32);
    g.fillStyle(0xd8ba8e, 1);
    g.fillCircle(800, 600, 150);
    g.fillStyle(0xedd9ad, 1);
    g.fillCircle(800, 600, 142);
    this.drawPathDetail(g, x, y, width, height);
    const img = g.bake();
    if (this.pathDetail && img) this.pathDetail.key = img.texture && img.texture.key;
  }

  // Cycle 8 art (G): the village dirt road and plaza were three flat beige fills (ART-TOWN-REPORT "Ground ... paths, plaza: D, beige path
  // bands with no edge"). Drawn into the same baked Graphics, so it is still ONE image and costs nothing per frame: two worn wheel ruts
  // (dark groove + lit lip, seeded gaps) along each road, a darker 2 px lip on the road edges with grass tufts leaning over it, seeded
  // pebbles (body + 1 px catch light), and a cobble ring with radial joints round the plaza. Original pixel art, palette = the road's own
  // ramp. ?townpath=0 = the old flat road.
  drawPathDetail(g, x, y, width, height) {
    const off = typeof location !== 'undefined' && /[?&]townpath=0(&|$)/.test(location.search);
    const st = this.pathDetail = { on: !off, ruts: 0, lips: 0, tufts: 0, pebbles: 0, joints: 0 };
    if (off) return st;
    let seed = 0x5eed8;
    const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return (seed >>> 8) / 16777216; };
    const CX = 800, CY = 600, PR = 150;
    const inPlaza = (px, py, m) => (px - CX) * (px - CX) + (py - CY) * (py - CY) < (PR + (m || 0)) * (PR + (m || 0));
    // plaza: a cobble ring (two joint circles and radial joints) inside the rim
    g.fillStyle(0xd9bd90, 1); g.fillCircle(CX, CY, 127);
    g.fillStyle(0xe6cfa2, 1); g.fillCircle(CX, CY, 125);
    g.fillStyle(0xedd9ad, 1); g.fillCircle(CX, CY, 123);
    g.fillStyle(0xdcc195, 1); g.fillCircle(CX, CY, 58);
    g.fillStyle(0xedd9ad, 1); g.fillCircle(CX, CY, 56);
    for (let a = 0; a < 48; a++) {
      const t = (a / 48) * Math.PI * 2 + (a % 2) * 0.03;
      for (let r = 129; r <= 139; r += 2) { g.fillStyle(r === 139 ? 0xd2b487 : 0xd9bd90, 1).fillRect(Math.round(CX + Math.cos(t) * r), Math.round(CY + Math.sin(t) * r), 2, 2); }
      st.joints++;
    }
    // wheel ruts: horizontal road (along x) and vertical road (along y), skipping the plaza and the rounded ends
    const rut = (horiz, lane) => {
      const len = horiz ? width : height, o = horiz ? CY + lane : CX + lane;
      let p = 44;
      while (p < len - 44) {
        // long, slightly wandering grooves with short breaks (worn wheel tracks, not painted lane dashes)
        const seg = 40 + Math.floor(rnd() * 90), gap = 3 + Math.floor(rnd() * 6);
        let wob = 0;
        for (let q = p; q < Math.min(p + seg, len - 44); q += 4) {
          if (rnd() < 0.18) wob = Math.max(-2, Math.min(2, wob + (rnd() < 0.5 ? -1 : 1)));
          const wx = horiz ? x + q : o + wob, wy = horiz ? o + wob : y + q;
          if (inPlaza(wx, wy, 14)) continue;
          const w = Math.min(4, len - 44 - q), deep = rnd() < 0.7;
          if (horiz) { g.fillStyle(0xd4b688, 1).fillRect(wx, wy - 1, w, 1); g.fillStyle(deep ? 0xc8a777 : 0xcfb081, 1).fillRect(wx, wy, w, 2); g.fillStyle(0xeed9ae, 1).fillRect(wx, wy + 2, w, 1); }
          else { g.fillStyle(0xd4b688, 1).fillRect(wx - 1, wy, 1, w); g.fillStyle(deep ? 0xc8a777 : 0xcfb081, 1).fillRect(wx, wy, 2, w); g.fillStyle(0xeed9ae, 1).fillRect(wx + 2, wy, 1, w); }
          st.ruts++;
        }
        p += seg + gap;
      }
    };
    rut(true, -14); rut(true, 11); rut(false, -14); rut(false, 11);
    // road edge lip (2 px, darker) + grass tufts leaning over it
    const edge = (horiz, side) => {
      const len = horiz ? width : height;
      for (let q = 34; q < len - 34; q += 6) {
        const wx = horiz ? x + q : (side < 0 ? CX - 32 : CX + 30), wy = horiz ? (side < 0 ? CY - 32 : CY + 30) : y + q;
        if (inPlaza(horiz ? wx : CX, horiz ? CY : wy, 12)) continue;
        g.fillStyle(0xd3b386, 1).fillRect(wx, wy, horiz ? 6 : 2, horiz ? 2 : 6); st.lips++;
        if (rnd() < 0.09) {
          // three blades (3 / 4 / 2 px) from the grass edge into the road: down from the top edge, up from the bottom, inward on the sides
          g.fillStyle(0x86ba66, 1);
          [3, 4, 2].forEach((h, b) => {
            if (horiz) g.fillRect(wx + 1 + b * 2, side < 0 ? wy : wy + 2 - h, 1, h);
            else g.fillRect(side < 0 ? wx : wx + 2 - h, wy + 1 + b * 2, h, 1);
          });
          st.tufts++;
        }
      }
    };
    edge(true, -1); edge(true, 1); edge(false, -1); edge(false, 1);
    // pebbles: body + 1 px catch light (top-left), seeded over both roads and the plaza
    const pebble = (px, py) => {
      const big = rnd() < 0.35, w = big ? 3 : 2;
      g.fillStyle(rnd() < 0.5 ? 0xb8a07a : 0xc4ab83, 1).fillRect(px, py, w, 2);
      g.fillStyle(0xf7ead0, 1).fillRect(px, py, 1, 1);
      if (big) g.fillStyle(0xa58d68, 1).fillRect(px + 1, py + 2, 2, 1);
      st.pebbles++;
    };
    for (let i = 0; i < 190; i++) { const px = x + 40 + Math.floor(rnd() * (width - 80)), py = CY - 26 + Math.floor(rnd() * 50); if (!inPlaza(px, py, 6)) pebble(px, py); }
    for (let i = 0; i < 95; i++) { const px = CX - 26 + Math.floor(rnd() * 50), py = y + 40 + Math.floor(rnd() * (height - 80)); if (!inPlaza(px, py, 6)) pebble(px, py); }
    for (let i = 0; i < 70; i++) { const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 118; pebble(Math.round(CX + Math.cos(a) * r), Math.round(CY + Math.sin(a) * r)); }
    return st;
  }

  // Static vector art drawn with ordinary Graphics calls but BAKED once into a texture and shown as
  // a plain Image: a live Graphics object is re-tessellated and flushed (pipeline switch) every
  // frame, which dominated the desktop frame time. Use like `const g = this.bakedGfx(depth)`, draw
  // in world coordinates, then call `g.bake()` (returns the Image, same depth/display-list slot).
  // Only the simple shape calls below are tracked; anything else keeps it a live Graphics.
  bakedGfx(depth) {
    const g = depth === undefined ? this.add.graphics() : this.add.graphics().setDepth(depth);
    const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity, live: false };
    const grow = (x, y) => { b.x0 = Math.min(b.x0, x); b.y0 = Math.min(b.y0, y); b.x1 = Math.max(b.x1, x); b.y1 = Math.max(b.y1, y); };
    const rect = (x, y, w, h) => { grow(x, y); grow(x + w, y + h); };
    const track = {
      fillRect: (x, y, w, h) => rect(x, y, w, h),
      strokeRect: (x, y, w, h) => rect(x, y, w, h),
      fillRoundedRect: (x, y, w, h) => rect(x, y, w, h),
      fillCircle: (x, y, r) => rect(x - r, y - r, r * 2, r * 2),
      fillEllipse: (x, y, w, h) => rect(x - w / 2, y - h / 2, w, h),
      fillTriangle: (a, c, d, e, f, h) => { grow(a, c); grow(d, e); grow(f, h); },
      lineBetween: (a, c, d, e) => { grow(a, c); grow(d, e); },
    };
    const passthrough = { fillStyle: 1, lineStyle: 1, setDepth: 1, setAlpha: 1 };
    const proxy = new Proxy(g, {
      get: (t, k) => {
        if (k === 'bake') {
          return (opt) => {
            if (b.live || !(b.x1 > b.x0)) return t; // untracked call or empty: stay a live Graphics
            const pad = 3;
            const left = Math.floor(b.x0) - pad;
            const top = Math.floor(b.y0) - pad;
            const w = Math.ceil(b.x1) - left + pad;
            const h = Math.ceil(b.y1) - top + pad;
            t.translateCanvas(-left, -top); // appended at the end; move that command to the front
            t.commandBuffer.unshift(...t.commandBuffer.splice(-3, 3));
            this.bakedGfxN = (this.bakedGfxN || 0) + 1;
            const key = `baked_${this.bakedGfxN}`;
            t.generateTexture(key, w, h);
            if (opt && opt.finish) this.finishBakedTexture(key, opt.finish);
            const img = this.add.image(left, top, key).setOrigin(0, 0).setDepth(t.depth);
            this.children.moveTo(img, this.children.getIndex(t)); // same display-list slot as the Graphics
            t.destroy();
            if (opt && opt.finish && this.bldFinish && this.bldFinish.on) this.bldContactShadow(img, key); // cycle 4 art
            return img;
          };
        }
        const v = t[k];
        if (typeof v !== 'function') return v;
        return (...a) => {
          if (track[k]) track[k](...a); else if (!passthrough[k]) b.live = true;
          const r = v.apply(t, a);
          return r === t ? proxy : r;
        };
      },
    });
    return proxy;
  }

  // Cycle 1 art (G, T-BLD "flat fills, no outline"): a pixel finish for a baked building texture, run ONCE at create (never per frame).
  // Alpha snapped to 0/255 (no soft canvas fringe), a 1 px colour-matched dark outline outside the silhouette (30% of the darkest
  // opaque neighbour, never pure black, the same rule as the cycle 0 creature / Hub icon outline), and a little depth with the light
  // from the top-left: the bottom 4 px and right 3 px of every shape are shaded, the top-left 2 px rim is lit. ?bldfinish=0 = flat.
  bldDepth() { return !/[?&]bldfinish=0(&|$)/.test(typeof location !== 'undefined' ? location.search : ''); }
  finishBakedTexture(key, name) {
    const st = this.bldFinish || (this.bldFinish = { on: this.bldDepth(), count: 0, ms: 0, keys: {}, outline: 0 });
    st.keys[name || key] = key;
    if (!st.on) return false;
    const t0 = performance.now();
    try {
      const tex = this.textures.get(key); const cv = tex && tex.getSourceImage();
      if (!cv || !cv.getContext) return false;
      const W = cv.width, H = cv.height, ctx = cv.getContext('2d');
      const im = ctx.getImageData(0, 0, W, H), d = im.data, src = new Uint8ClampedArray(d);
      const op = (x, y) => x >= 0 && y >= 0 && x < W && y < H && src[(y * W + x) * 4 + 3] >= 128;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        if (op(x, y)) {
          d[i + 3] = 255;
          let f = 1;
          if (!op(x, y + 1) || !op(x, y + 2) || !op(x, y + 3) || !op(x, y + 4)) f = 0.78; // ground-side shade
          else if (!op(x + 1, y) || !op(x + 2, y) || !op(x + 3, y)) f = 0.88; // right-side shade
          else if (!op(x - 1, y) || !op(x, y - 1) || !op(x - 1, y - 1) || !op(x, y - 2)) f = 1.14; // top-left rim light
          if (f !== 1) for (let c = 0; c < 3; c++) d[i + c] = Math.min(255, Math.round(src[i + c] * f));
          continue;
        }
        d[i + 3] = 0;
        let best = -1, br = 0, bg = 0, bb = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if ((!dx && !dy) || !op(x + dx, y + dy)) continue;
          const j = ((y + dy) * W + x + dx) * 4, l = src[j] + src[j + 1] + src[j + 2];
          if (best < 0 || l < best) { best = l; br = src[j]; bg = src[j + 1]; bb = src[j + 2]; }
        }
        if (best >= 0) { d[i] = Math.round(br * 0.3); d[i + 1] = Math.round(bg * 0.3); d[i + 2] = Math.round(bb * 0.3); d[i + 3] = 255; st.outline++; }
      }
      if (this.bldFinish2()) this.finishBakedTexture2(W, H, src, d, st);
      ctx.putImageData(im, 0, 0);
      if (tex.refresh) tex.refresh();
      st.count++;
      return true;
    } catch (e) { return false; } finally { st.ms += performance.now() - t0; }
  }

  // Cycle 4 art (G): building finish, second pass (still once at create, never per frame), so buildings stop reading as flat boxes at 1x:
  //  windows: any pale-blue glass pane gets a 2-step diagonal glint in its top-left corner, a darker inner frame on its right / bottom
  //  edge and a lit sill row under it; roofs: the rows where the silhouette still widens (a pitched roof) get shingle courses every 5 px
  //  (a darker row, staggered seams every 8 px) and a lit row under each course; plus a ground contact shadow strip under the footprint
  //  (bldContactShadow, a separate ground image). ?bldfinish2=0 = the cycle 1 finish only; ?bldfinish=0 still turns every finish off.
  bldFinish2() { return this.bldDepth() && !/[?&]bldfinish2=0(&|$)/.test(typeof location !== 'undefined' ? location.search : ''); }
  finishBakedTexture2(W, H, src, d, st) {
    st.glass = st.glass || 0; st.roof = st.roof || 0;
    const op = (x, y) => x >= 0 && y >= 0 && x < W && y < H && src[(y * W + x) * 4 + 3] >= 128;
    const glass = (x, y) => { if (!op(x, y)) return false; const i = (y * W + x) * 4; return src[i + 2] >= 200 && src[i + 1] >= 185 && src[i + 2] >= src[i] + 15; };
    const mul = (i, f) => { for (let c = 0; c < 3; c++) d[i + c] = Math.max(0, Math.min(255, Math.round(d[i + c] * f))); };
    const mix = (i, r, g, b, a) => { d[i] = Math.round(d[i] * (1 - a) + r * a); d[i + 1] = Math.round(d[i + 1] * (1 - a) + g * a); d[i + 2] = Math.round(d[i + 2] * (1 - a) + b * a); };
    // glass: runs to the pane's left / top / right / bottom edge, per pixel
    const G = new Uint8Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (glass(x, y)) G[y * W + x] = 1;
    const lx = new Uint8Array(W * H), ly = new Uint8Array(W * H), rx = new Uint8Array(W * H), ry = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const k = y * W + x; if (!G[k]) continue; lx[k] = x > 0 && G[k - 1] ? Math.min(250, lx[k - 1] + 1) : 0; ly[k] = y > 0 && G[k - W] ? Math.min(250, ly[k - W] + 1) : 0; }
    for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) { const k = y * W + x; if (!G[k]) continue; rx[k] = x < W - 1 && G[k + 1] ? Math.min(250, rx[k + 1] + 1) : 0; ry[k] = y < H - 1 && G[k + W] ? Math.min(250, ry[k + W] + 1) : 0; }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const k = y * W + x, i = k * 4;
      if (G[k]) {
        const s = lx[k] + ly[k], small = lx[k] + rx[k] < 5 || ly[k] + ry[k] < 5;
        if (small) continue; // a sliver of blue (a sign letter, a gem) is not a pane
        if (rx[k] === 0 || ry[k] === 0) mul(i, 0.8); // inner frame shadow (light from the top-left)
        else if (lx[k] >= 1 && ly[k] >= 1 && (s === 3 || s === 4 || s === 7)) mix(i, 255, 255, 255, 0.75); // diagonal glint
        st.glass++;
      } else if (op(x, y) && y > 0 && G[k - W] && ly[k - W] >= 4) mul(i, 1.25); // lit sill under a pane
    }
    // pitched roofs: the top rows where the opaque span keeps widening
    const span = (y) => { let a = -1, b = -1; for (let x = 0; x < W; x++) if (op(x, y)) { if (a < 0) a = x; b = x; } return a < 0 ? null : [a, b]; };
    let top = -1; for (let y = 0; y < H && top < 0; y++) if (span(y)) top = y;
    if (top < 0) return;
    let end = top, prev = span(top), flat = 0;
    for (let y = top + 1; y < H; y++) { const s = span(y); if (!s) break; if (s[1] - s[0] > prev[1] - prev[0]) { end = y; flat = 0; } else if (++flat > 2) break; prev = s; }
    if (end - top < 10) return; // no pitched roof (flat-topped boards / stalls)
    for (let y = top + 3; y < end - 1; y++) {
      const course = (y - top) % 5, row = Math.floor((y - top) / 5);
      for (let x = 0; x < W; x++) {
        if (!op(x, y) || !op(x - 2, y) || !op(x + 2, y) || !op(x, y - 2)) continue; // keep the outline / rim intact
        const i = (y * W + x) * 4;
        if (course === 4) { mul(i, 0.8); st.roof++; } else if (course === 0) mul(i, 1.1);
        else if ((x + row * 4) % 8 === 0) { mul(i, 0.86); st.roof++; }
      }
    }
  }
  // the contact shadow under a finished building image: two dark strips along the footprint's bottom row (ground depth, under the walls)
  bldContactShadow(img, key) {
    try {
      if (!this.bldFinish2()) return null;
      const cv = this.textures.get(key).getSourceImage(), W = cv.width, H = cv.height, d = cv.getContext('2d').getImageData(0, 0, W, H).data;
      let y = H - 1, a = -1, b = -1;
      for (; y >= 0 && a < 0; y--) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] >= 128) { if (a < 0) a = x; b = x; }
      if (a < 0 || b - a < 12) return null;
      // a baked_ canvas texture (one per building), placed as a plain Image: no live Graphics, nothing re-tessellated per frame (town-perf)
      const sw = b - a + 2, skey = 'baked_shadow_' + key;
      if (!this.textures.exists(skey)) {
        const ct = this.textures.createCanvas(skey, sw, 4), sc = ct.getContext();
        sc.fillStyle = 'rgba(16,20,12,0.22)'; sc.fillRect(0, 0, sw, 4);
        sc.fillStyle = 'rgba(16,20,12,0.18)'; sc.fillRect(2, 0, Math.max(1, sw - 4), 2);
        ct.refresh();
      }
      const g = this.add.image(img.x + a + 2, img.y + y + 2, skey).setOrigin(0, 0).setDepth(img.depth - 0.5);
      const st = this.bldFinish; if (st) { st.shadows = (st.shadows || 0) + 1; (st.shadowPairs || (st.shadowPairs = [])).push([img.depth, g.depth, b - a]); }
      return g;
    } catch (e) { return null; }
  }

  // Draws static vector art once into a texture and places it as a plain
  // Image (inserted at the same point in the display list, same depth, so
  // layering against neighbours is unchanged). `draw(g)` uses coordinates
  // local to the w x h texture; (left, top) is where its corner goes.
  addBakedImage(key, left, top, w, h, depth, draw) {
    if (!this.textures.exists(key)) {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      draw(g);
      g.generateTexture(key, w, h);
      g.destroy();
    }
    return this.add.image(left, top, key).setOrigin(0, 0).setDepth(depth);
  }

  // A pond with a grassy bank, a darker deep middle, a sky highlight and a
  // few lily pads — `pads` are [dx, dy, r] from the centre, kept clear of
  // anything that crosses the water (the main pond's bridge).
  addBakedPond(key, cx, cy, rx, ry, pads) {
    const pad = 14;
    const w = rx * 2 + pad * 2;
    const h = ry * 2 + pad * 2;
    const ox = w / 2;
    const oy = h / 2;
    this.addBakedImage(key, cx - ox, cy - oy, w, h, -1, (g) => {
      g.fillStyle(0x76bd60, 1).fillEllipse(ox + 2, oy + 4, rx * 2 + 22, ry * 2 + 20);
      g.fillStyle(0xd9c79a, 1).fillEllipse(ox, oy + 1, rx * 2 + 12, ry * 2 + 10);
      g.fillStyle(0x5ab0e8, 1).fillEllipse(ox, oy, rx * 2, ry * 2);
      g.fillStyle(0x3a86c8, 1).fillEllipse(ox + rx * 0.06, oy + ry * 0.08, rx * 1.75, ry * 1.7);
      g.fillStyle(0x2f74b4, 1).fillEllipse(ox + rx * 0.12, oy + ry * 0.16, rx * 1.1, ry * 1.0);
      g.fillStyle(0x8fd0f2, 0.8).fillEllipse(ox - rx * 0.3, oy - ry * 0.38, rx * 0.8, ry * 0.32);
      g.lineStyle(2, 0xe8f6ff, 0.9);
      g.lineBetween(ox - rx * 0.55, oy - ry * 0.45, ox - rx * 0.35, oy - ry * 0.45);
      g.lineBetween(ox - rx * 0.25, oy - ry * 0.6, ox - rx * 0.1, oy - ry * 0.6);
      pads.forEach(([dx, dy, r]) => {
        g.fillStyle(0x2f6a32, 0.35).fillEllipse(ox + dx + 2, oy + dy + 2, r * 2, r * 1.4);
        g.fillStyle(0x5cae4f, 1);
        g.slice(ox + dx, oy + dy, r, Phaser.Math.DegToRad(30), Phaser.Math.DegToRad(350), false);
        g.fillPath();
        if (r > 9) g.fillStyle(0xf6a6c8, 1).fillCircle(ox + dx - r * 0.3, oy + dy - r * 0.2, 3);
      });
    });
  }

  drawPond() {
    const cx = 260;
    const cy = 600;
    const rx = 150;
    const ry = 90;
    this.addBakedPond('pond_main', cx, cy, rx, ry, [[-100, 30, 11], [95, -35, 9], [70, 50, 7]]);

    const gapHalf = 34;
    this.addObstacleRect({ x: cx - rx * 0.8, y: cy - ry * 0.8, width: rx * 1.6, height: ry * 0.8 - gapHalf });
    this.addObstacleRect({ x: cx - rx * 0.8, y: cy + gapHalf, width: rx * 1.6, height: ry * 0.8 - gapHalf });

    // A faint ripple every couple of seconds, somewhere random inside the
    // pond — purely cosmetic, no gameplay effect, just a bit of life.
    this.time.addEvent({
      delay: 2200,
      loop: true,
      callback: () => {
        const rippleX = cx + (Math.random() * 2 - 1) * rx * 0.7;
        const rippleY = cy + (Math.random() * 2 - 1) * ry * 0.7;
        const ripple = this.add.circle(rippleX, rippleY, 3, 0xffffff, 0).setStrokeStyle(1, 0xdfefff, 0.5).setDepth(-1);
        const state = { r: 3, a: 0.5 };
        this.tweens.add({
          targets: state,
          r: 14,
          a: 0,
          duration: 1800,
          ease: 'Sine.easeOut',
          onUpdate: () => { ripple.setRadius(state.r); ripple.setStrokeStyle(1, 0xdfefff, state.a); },
          onComplete: () => ripple.destroy(),
        });
      },
    });
  }

  drawDock() {
    // A small wooden pier off the pond's east edge — purely decorative
    // (no collision), just a nicer place to stand and look at the water.
    const baseX = 410;
    const baseY = 600;
    // Baked once into a texture (see addBakedImage); local coords are
    // shifted by (1, 15) so the 2px plank lines at the ends aren't clipped.
    this.addBakedImage('dock_baked', baseX - 1, baseY - 15, 72, 38, -1, (g) => {
      g.fillStyle(0x8a5a3b, 1);
      g.fillRect(1, 1, 70, 28);
      g.lineStyle(2, 0x5a3a22, 1);
      for (let i = 0; i <= 70; i += 14) g.lineBetween(1 + i, 1, 1 + i, 29);
      g.fillStyle(0x5a3a22, 1);
      [7, 65].forEach((x) => g.fillRect(x - 3, 27, 6, 10));
    });
  }

  // A few sittable-looking (purely decorative) benches scattered around
  // town — no collision, no interact handler, just scenery.
  drawBenches() {
    const spots = [
      { x: 760, y: 560 }, { x: 1620, y: 640 }, { x: 1950, y: 720 },
    ];
    spots.forEach(({ x, y }) => {
      const g = this.bakedGfx(y - 1);
      g.fillStyle(0x6b4226, 1);
      g.fillRect(x - 18, y - 4, 36, 8);
      g.fillRect(x - 18, y - 14, 36, 4);
      g.fillStyle(0x4a2e18, 1);
      g.fillRect(x - 16, y + 4, 4, 8);
      g.fillRect(x + 12, y + 4, 4, 8);
      g.bake();
    });
  }

  // A small spooky corner tying into the zombie species — a few
  // tombstones behind a low fence, one zombie villager standing watch.
  // Purely decorative; the tombstone footprints are solid, the fence
  // gap isn't, so you can still walk in and look around.
  drawGraveyard() {
    const { x, y } = GRAVEYARD_POS;
    // The plot is ground: under the tombstones and anyone walking in (it used to sit at y - 2, over the stones at y - 6..-14).
    const g = this.bakedGfx(-1);
    g.fillStyle(0x3a4a38, 1).fillRect(x - 70, y - 50, 140, 90);
    g.lineStyle(3, 0x5a6a52, 1).strokeRect(x - 70, y - 50, 140, 90);
    g.bake();

    const stones = [{ x: x - 36, y: y - 10 }, { x: x, y: y - 6 }, { x: x + 36, y: y - 14 }];
    stones.forEach((s) => {
      const sg = this.bakedGfx(s.y);
      sg.fillStyle(0x9a9a9a, 1);
      sg.fillRect(s.x - 10, s.y - 18, 20, 22);
      sg.fillEllipse(s.x, s.y - 18, 20, 14);
      sg.bake();
      this.addObstacleRect({ x: s.x - 9, y: s.y - 10, width: 18, height: 10 });
    });

    const zdy = npcFeetShift(1.8);
    const zombie = this.add.sprite(x + 50, y + 18 + zdy, 'zombies', 0).setScale(npcScale(1.8)).setDepth(y + 19);
    this.graveZombie = zombie;
    this.tweens.add({ targets: zombie, y: y + 14 + zdy, duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.add.text(x, y - 68, '🪦 Old Graveyard', {
      fontSize: '11px',
      fontFamily: 'monospace',
      color: '#c9d4c0',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(y + 1);
  }

  drawPondCats() {
    POND_CATS.forEach(({ y, frame, range, bank }) => {
      if (!MMTownHeroes.legacyArt()) {
        // Hero statues (stone-tinted, baked once) stand still on the bank, depth-sorted by their feet like any land sprite.
        const statue = this.add.sprite(bank.x, bank.y, 'mooncats', frame).setDepth(bank.y + 12);
        statue.htStill = true;
        statue.pondStatue = true;
        statue._cstill = 1; // cull: a statue never moves (see cullOffscreen)
        return;
      }
      const startX = (range[0] + range[1]) / 2;
      const cat = this.add.sprite(startX, y, 'mooncats', frame).setDepth(-1);
      cat.prevX = startX;
      this.tweens.add({
        targets: cat,
        x: { from: range[0], to: range[1] },
        duration: 6000 + frame * 400,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
        onUpdate: () => {
          cat.setFlipX(cat.x < cat.prevX);
          cat.prevX = cat.x;
        },
      });
    });
  }

  drawEastPond() {
    const { cx, cy, rx, ry } = EAST_POND;
    this.addBakedPond('pond_east', cx, cy, rx, ry, [[-70, 30, 10], [60, -28, 8], [80, 22, 6]]);
    this.addObstacleRect({ x: cx - rx * 0.8, y: cy - ry * 0.8, width: rx * 1.6, height: ry * 1.6 });
  }

  drawBridge() {
    const cx = 260;
    const cy = 600;
    // Baked once into a texture (see addBakedImage), local coords with the
    // bridge's top-left corner at (0, 0).
    this.addBakedImage('bridge_baked', cx - 40, cy - 36, 80, 72, -1, (g) => {
      g.fillStyle(0x2f6a8a, 0.35).fillRect(3, 6, 80, 68);
      g.fillStyle(0xa9784a, 1).fillRect(0, 2, 80, 68);
      g.fillStyle(0x8a5f39, 1);
      for (let px = 0; px < 80; px += 10) g.fillRect(px, 2, 2, 68);
      g.fillStyle(0x6b4226, 1);
      g.fillRect(0, 0, 80, 4);
      g.fillRect(0, 68, 80, 4);
    });
  }

  drawHouse() {
    const { x, y, w, h } = HOUSE_POS;
    const g = this.bakedGfx();
    g.fillStyle(0x8a5a3b, 1).fillRect(x, y, w, h);
    if (this.bldDepth()) g.fillStyle(0x2a1a10, 0.3).fillRect(x, y, w, 6); // cycle 1 art: eave shadow under the roof
    g.fillStyle(0xd9663b, 1).fillTriangle(x - 10, y, x + w + 10, y, x + w / 2, y - 45);
    g.fillStyle(0x5a3a22, 1).fillRect(x + w / 2 - 10, y + h - 28, 20, 28);
    g.fillStyle(0xcfe8f5, 1);
    g.fillRect(x + 16, y + 14, 20, 20);
    g.fillRect(x + w - 36, y + 14, 20, 20);
    g.setDepth(y + h);
    g.bake({ finish: 'shop' });

    // cyc3 U: three stacked lines over the roof, each in its own row: title, today's deal, the turnip price (y - 50, just above the roof apex at y - 45).
    // The deal and the turnip price both sat at y - 38 and printed over each other.
    this.add.text(x + w / 2, y - 80, '🏠 Shop', { fontSize: '16px' }).setOrigin(0.5).setDepth(y + h + 1);
    const deal = this.todaysDeal();
    this.add.text(x + w / 2, y - 64, `💰 ${deal.icon} +50% today`, { fontSize: '11px', color: '#2a6b2a' }).setOrigin(0.5).setDepth(y + h + 1);
    this.addObstacleRect({ x, y: y + 20, width: w, height: h - 20 });
  }

  // Same deterministic wall-clock-hash trick as the daily quest — a
  // different resource sells for a flat +50% each day, same for everyone.
  todaysDeal() {
    return QUEST_RESOURCES[Math.floor(this.questHash(40) * QUEST_RESOURCES.length)];
  }

  drawMuseum() {
    const { x, y, w, h } = MUSEUM_POS;
    const g = this.bakedGfx();
    g.fillStyle(0xd8d0bc, 1).fillRect(x, y, w, h);
    if (this.bldDepth()) g.fillStyle(0x3a3428, 0.25).fillRect(x, y, w, 6); // cycle 1 art: eave shadow under the roof
    g.fillStyle(0x8f8568, 1).fillTriangle(x - 10, y, x + w + 10, y, x + w / 2, y - 40);
    g.fillStyle(0x6b6250, 1);
    for (let i = 0; i < 4; i++) g.fillRect(x + 10 + i * 22, y + 16, 10, h - 20);
    g.setDepth(y + h);
    g.bake({ finish: 'museum' });
    this.add.text(x + w / 2, y - 50, '🏛️ Museum', { fontSize: '14px' }).setOrigin(0.5).setDepth(y + h + 1);
    this.addObstacleRect({ x, y: y + 16, width: w, height: h - 16 });
  }

  drawAbleSisters() {
    const { x, y, w, h } = ABLE_SISTERS_POS;
    const g = this.bakedGfx();
    g.fillStyle(0xd88fb0, 1).fillRect(x, y, w, h);
    if (this.bldDepth()) g.fillStyle(0x4a2033, 0.28).fillRect(x, y, w, 6); // cycle 1 art: eave shadow under the roof
    g.fillStyle(0xe8b8d0, 1).fillTriangle(x - 8, y, x + w + 8, y, x + w / 2, y - 34);
    g.fillStyle(0xcfe8f5, 1).fillRect(x + w / 2 - 10, y + 14, 20, 18);
    g.setDepth(y + h);
    g.bake({ finish: 'able' });
    // Label under the shop, not above the roof: the roof line is the town spawn (1200, 600), where it sat under the player's name.
    this.add.text(x + w / 2, y + h + 10, '👗 Able Sisters', { fontSize: '12px' }).setOrigin(0.5).setDepth(y + h + 1);
    this.addObstacleRect({ x, y: y + 14, width: w, height: h - 14 });
  }

  isNearAbleSisters() {
    const cx = ABLE_SISTERS_POS.x + ABLE_SISTERS_POS.w / 2;
    const cy = ABLE_SISTERS_POS.y + ABLE_SISTERS_POS.h / 2;
    return Math.hypot(this.localBody.x - cx, this.localBody.y - cy) < ABLE_SISTERS_RADIUS;
  }

  // ---------- guestbook ----------
  // A small signpost + open book — purely decorative scenery (no
  // collision, like the notice board), just a landmark to stand near.
  drawGuestbook() {
    const { x, y } = GUESTBOOK_POS;
    const g = this.bakedGfx(y - 1);
    g.fillStyle(0x6b4a30, 1).fillRect(x - 3, y - 6, 6, 34);
    g.fillStyle(0xe8d9b5, 1);
    g.fillTriangle(x - 26, y - 6, x, y - 22, x, y - 6);
    g.fillTriangle(x + 26, y - 6, x, y - 22, x, y - 6);
    g.lineStyle(1, 0x8f7044, 1);
    g.lineBetween(x, y - 22, x, y - 6);
    g.bake({ finish: 'guestbook' });
    this.add.text(x, y - 42, '📖 Guestbook', { fontSize: '12px' }).setOrigin(0.5).setDepth(y + 1);
  }

  isNearGuestbook() {
    return Math.hypot(this.localBody.x - GUESTBOOK_POS.x, this.localBody.y - GUESTBOOK_POS.y) < GUESTBOOK_RADIUS;
  }

  // ---------- home plot ----------
  drawHomePlot() {
    const { x, y } = HOME_POS;
    if (!this.textures.exists('homePlot')) {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0x000000, 0.12).fillRoundedRect(4, 8, 156, 92, 8);
      g.fillStyle(0xb98a52, 1).fillRoundedRect(0, 0, 156, 92, 8);
      g.fillStyle(0xcfa56a, 1).fillRoundedRect(6, 6, 144, 80, 6);
      g.lineStyle(3, 0x6b4a30, 1).strokeRoundedRect(0, 0, 156, 92, 8);
      for (let i = 0; i < 9; i++) { g.fillStyle(0x8f6a3c, 1).fillRect(8 + i * 17, -4, 4, 10); g.fillRect(8 + i * 17, 86, 4, 10); }
      g.generateTexture('homePlot', 156, 96);
      g.destroy();
    }
    if (!this.textures.exists('homeTank')) {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0x000000, 0.12).fillRoundedRect(3, 6, 66, 46, 6);
      g.fillStyle(0x8fd3f2, 0.55).fillRoundedRect(0, 0, 66, 46, 6);
      g.fillStyle(0xe8d9b5, 0.9).fillRect(0, 36, 66, 10);
      g.lineStyle(3, 0x6b4a30, 1).strokeRoundedRect(0, 0, 66, 46, 6);
      g.generateTexture('homeTank', 70, 54);
      g.destroy();
    }
    this.add.image(x, y, 'homePlot').setDepth(y - 60);
    this.add.image(x + HOME_TANK_OFFSET.x, y + HOME_TANK_OFFSET.y, 'homeTank').setDepth(y - 59);
    this.homeTankSprites = [];
    this.homeSprites = [];
    this.homeLabel = this.add.text(x, y - 66, '🏡 Home', { fontSize: '12px' }).setOrigin(0.5).setDepth(y + 60);
    this.home = this.loadHome();
    this.renderHomeSprites();
    this.renderErrandDecor();
  }

  // ---------- ID-12 parcel errand (MMErrands; cycle 3 S) ----------
  // Mocha packs a parcel from 3 of your wood (Town save `errand: {id, s: 1}`), the Realm Nexus Vendor takes it and asks for a Midlands
  // trophy (Realm save, written by realm-world.js only), and Mocha takes the trophy back: `s: 2` and a Realm lantern stands by your home
  // plot for good (derived from s: 2, so it can never be sold, gifted or lost; cosmetic only, no cozy score). This page writes ONLY the
  // Town save's `errand` (forward-only merge) and reads the Realm save. ?errands=0 turns it off.
  errandsOn() { try { return !!window.MMErrands && !/[?&]errands=0(&|$)/.test(location.search); } catch (e) { return false; } }
  errandRealm() { try { const o = JSON.parse(localStorage.getItem('pixeltown-realm-v1') || 'null'); return o && typeof o === 'object' ? o.errand : null; } catch (e) { return null; } }
  saveErrand(next) {
    const E = window.MMErrands;
    writeSaveMerged((stored) => { const a = E.cleanTown(stored.errand); const b = E.cleanTown(next); return { errand: a.s > b.s ? a : b }; }); // never steps back
  }
  // Mocha's errand line for this talk (and the step it makes), or null to chat as usual
  errandTalk() {
    if (!this.errandsOn()) return null;
    const E = window.MMErrands; const town = loadSave().errand; const realm = this.errandRealm();
    const st = E.stage(town, realm);
    const say = (txt, col) => { if (this.localBody) this.showFloatingText(this.localBody.x, this.localBody.y - 46, txt, col); };
    if (st === 'offer') {
      if (!this.errandAsked) { this.errandAsked = true; return E.LINES.offer + ' Talk to me again when you are ready.'; }
      const r = E.accept(town, this.resources);
      if (!r.ok) return E.LINES.offerShort;
      this.resources.wood = Math.max(0, (this.resources.wood || 0) - r.spend.wood);
      this.updateInventoryHUD(); this.saveResources(); this.saveErrand(r.town);
      say('-' + r.spend.wood + ' wood: parcel packed 📦');
      return 'All packed! ' + E.LINES.carry;
    }
    if (st === 'return') {
      const r = E.finish(town, realm); if (!r.ok) return null;
      this.saveErrand(r.town); this.renderErrandDecor();
      say('🏮 ' + r.reward.label + ' now stands by your home');
      return 'A trophy from the Realm! As promised: a Realm lantern for your home plot.';
    }
    if (st === 'carry' || st === 'hunt') return E.LINES[st];
    return null; // done: the usual chat
  }
  errandDone() { return !!window.MMErrands && window.MMErrands.cleanTown(loadSave().errand).s === 2; }
  // The reward: an original code-drawn Realm lantern beside the home plot (a post, a dark iron frame, a teal Realm-crystal flame).
  renderErrandDecor() {
    if (this.errandDecor || !this.errandDone()) return;
    if (!this.textures.exists('realmLantern')) {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0x000000, 0.18).fillEllipse(12, 45, 18, 5);
      g.fillStyle(0x4a3524, 1).fillRect(10, 18, 4, 27); g.fillStyle(0x6b4a30, 1).fillRect(10, 18, 2, 27);
      g.fillStyle(0x2b2b38, 1).fillRect(4, 4, 16, 16); g.fillRect(6, 1, 12, 3);
      g.fillStyle(0x7ff0e0, 1).fillRect(7, 7, 10, 10); g.fillStyle(0xd8fff8, 1).fillRect(10, 9, 4, 6);
      g.fillStyle(0x2b2b38, 1).fillRect(11, 7, 2, 10);
      g.generateTexture('realmLantern', 24, 48);
      g.destroy();
    }
    const x = HOME_POS.x + 96, y = HOME_POS.y - 6;
    const glow = this.add.circle(x, y - 12, 16, 0x7ff0e0, 0.18).setDepth(y + 69);
    this.errandDecor = this.add.image(x, y, 'realmLantern').setOrigin(0.5, 0.75).setDepth(y + 70);
    this.errandDecor.glow = glow;
  }

  // Sanitised: slot ids must be real recipe ids; everything else is dropped.
  loadHome() {
    const rec = loadSave().home;
    const slots = new Array(HOME_SLOTS).fill(null);
    if (rec && typeof rec === 'object' && !Array.isArray(rec) && Array.isArray(rec.slots)) {
      for (let i = 0; i < HOME_SLOTS; i++) {
        const id = rec.slots[i];
        if (typeof id === 'string' && RECIPES.some((r) => r.id === id)) slots[i] = id;
      }
    }
    const tank = new Array(HOME_TANK_SLOTS).fill(null);
    if (rec && typeof rec === 'object' && !Array.isArray(rec) && Array.isArray(rec.tank)) {
      const used = new Set();
      for (let i = 0; i < HOME_TANK_SLOTS; i++) {
        const id = rec.tank[i];
        if (typeof id === 'string' && FISH_SPECIES.some((f) => f.id === id) && !used.has(id)) { tank[i] = id; used.add(id); }
      }
    }
    return { slots, tank, paidDay: rec && typeof rec === 'object' ? cleanCount(rec.paidDay) : 0 };
  }

  homeCozy() {
    const goods = this.home.slots.reduce((sum, id) => sum + (id ? RECIPES.find((r) => r.id === id).value : 0), 0);
    const fish = this.home.tank.reduce((sum, id) => sum + (id ? FISH_SPECIES.find((f) => f.id === id).rarity * 2 : 0), 0);
    return goods + fish;
  }

  // Rebuilt only when placement changes (never per frame).
  renderHomeSprites() {
    this.homeSprites.forEach((t) => t.destroy());
    this.homeSprites = [];
    this.home.slots.forEach((id, i) => {
      if (!id) return;
      const r = RECIPES.find((x) => x.id === id);
      const [dx, dy] = HOME_SLOT_OFFSETS[i];
      this.homeSprites.push(this.add.text(HOME_POS.x + dx, HOME_POS.y + dy, r.icon, { fontSize: '22px' }).setOrigin(0.5).setDepth(HOME_POS.y + dy + 70));
    });
    // Aquarium fish: a few emoji with a slow drift (3 tiny tweens, rebuilt only on change).
    this.homeTankSprites.forEach((t) => { this.tweens.killTweensOf(t); t.destroy(); });
    this.homeTankSprites = [];
    this.home.tank.forEach((id, i) => {
      if (!id) return;
      const f = FISH_SPECIES.find((x) => x.id === id);
      const bx = HOME_POS.x + HOME_TANK_OFFSET.x - 16 + i * 16;
      const by = HOME_POS.y + HOME_TANK_OFFSET.y - 8 + (i % 2) * 10;
      const t = this.add.text(bx, by, f.icon, { fontSize: '14px' }).setOrigin(0.5).setDepth(HOME_POS.y + 20);
      this.tweens.add({ targets: t, x: bx + 12, duration: 1800 + i * 400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.homeTankSprites.push(t);
    });
    if (this.homeLabel) this.homeLabel.setText(`🏡 Home (cozy ${this.homeCozy()})`);
  }

  isNearHome(radius = HOME_RADIUS) {
    return Math.hypot(this.localBody.x - HOME_POS.x, this.localBody.y - HOME_POS.y) < radius;
  }

  openHome() {
    this.homeOpen = true;
    document.getElementById('home-overlay').classList.remove('hidden');
    const note = document.getElementById('home-note');
    note.textContent = '';
    // First visit of the day: neighbors admire the place.
    const day = this.questDayBucket();
    const cozy = this.homeCozy();
    if (this.home.paidDay !== day) {
      const bonus = Math.min(HOME_BONUS_CAP, Math.floor(cozy / HOME_BONUS_PER));
      this.home.paidDay = day;
      this.saveHome();
      if (bonus > 0) {
        this.awardPoint(bonus, `🏡 visitors admire your home! +${bonus} ⭐`, this.localBody.x, this.localBody.y - 40, 'sell');
        note.textContent = `Visitors admired your home today: +${bonus} ⭐` + (SAVE_OK ? '' : ' Not saved yet: browser storage is full or blocked.');
      }
    }
    this.renderHome();
  }

  closeHome() {
    this.homeOpen = false;
    document.getElementById('home-overlay').classList.add('hidden');
  }

  saveHome() {
    writeSave({ home: { slots: this.home.slots, tank: this.home.tank, paidDay: this.home.paidDay } });
    this.saveResources(); // beta S-02: crafted goods go through the delta merge, not a whole-object write
  }

  renderHome() {
    const list = document.getElementById('home-list');
    list.innerHTML = '';
    this.home.slots.forEach((cur, i) => {
      const li = document.createElement('li');
      const label = document.createElement('label');
      label.textContent = `Spot ${i + 1}`;
      label.htmlFor = `home-slot-${i}`;
      const sel = document.createElement('select');
      sel.id = `home-slot-${i}`;
      sel.className = 'home-slot-select';
      const mk = (value, text) => { const o = document.createElement('option'); o.value = value; o.textContent = text; return o; };
      sel.appendChild(mk('', '— empty —'));
      RECIPES.forEach((r) => {
        const have = this.craftedGoods[r.id] || 0;
        if (r.id === cur || have > 0) sel.appendChild(mk(r.id, `${r.icon} ${r.label}${r.id === cur ? ' (placed)' : ` (x${have})`}`));
      });
      sel.value = cur || '';
      sel.addEventListener('change', () => this.setHomeSlot(i, sel.value || null));
      li.append(label, sel);
      list.appendChild(li);
    });
    const tankList = document.getElementById('home-tank-list');
    tankList.innerHTML = '';
    const caught = this.fishlog ? this.fishlog.caught : {};
    this.home.tank.forEach((cur, i) => {
      const li = document.createElement('li');
      const label = document.createElement('label');
      label.textContent = `Tank ${i + 1}`;
      label.htmlFor = `home-tank-${i}`;
      const sel = document.createElement('select');
      sel.id = `home-tank-${i}`;
      sel.className = 'home-slot-select';
      const mk = (value, text) => { const o = document.createElement('option'); o.value = value; o.textContent = text; return o; };
      sel.appendChild(mk('', FISH_SPECIES.some((f) => caught[f.id]) ? '— empty —' : '— catch fish first —'));
      FISH_SPECIES.forEach((f) => {
        const usedElsewhere = this.home.tank.some((id, j) => id === f.id && j !== i);
        if ((caught[f.id] || f.id === cur) && !usedElsewhere) sel.appendChild(mk(f.id, `${f.icon} ${f.name}`));
      });
      sel.value = cur || '';
      sel.addEventListener('change', () => this.setTankSlot(i, sel.value || null));
      li.append(label, sel);
      tankList.appendChild(li);
    });
    document.getElementById('home-cozy').textContent = `Cozy score: ${this.homeCozy()} (daily visitor bonus: +${Math.min(HOME_BONUS_CAP, Math.floor(this.homeCozy() / HOME_BONUS_PER))} ⭐)`;
  }

  // Aquarium: show a species you have logged (nothing is consumed).
  setTankSlot(i, id) {
    if (i < 0 || i >= HOME_TANK_SLOTS) return false;
    if (this.home.tank[i] === id) return false;
    if (id !== null) {
      const known = FISH_SPECIES.some((f) => f.id === id);
      const caught = this.fishlog && this.fishlog.caught[id];
      if (!known || !caught || this.home.tank.some((x, j) => x === id && j !== i)) { this.renderHome(); return false; }
    }
    this.home.tank[i] = id;
    this.saveHome();
    this.renderHomeSprites();
    this.renderHome();
    if (id) {
      this.incrementStat('tankPlaced');
      if (this.home.tank.every(Boolean)) this.incrementStat('tankFull');
    }
    this.noteCozy();
    return true;
  }

  // Track the best cozy score ever (for the Cozy Corner achievement).
  noteCozy() {
    const cozy = this.homeCozy();
    if (cozy > (this.lifetimeStats.homeCozyBest || 0)) { this.lifetimeStats.homeCozyBest = cozy; this.saveAchievements(); this.checkAchievements(); }
  }

  // Swap one slot: the old good returns to the bag, the new one leaves it.
  setHomeSlot(i, id) {
    if (i < 0 || i >= HOME_SLOTS) return false;
    const cur = this.home.slots[i];
    if (cur === id) return false;
    if (id !== null) {
      if (!RECIPES.some((r) => r.id === id) || (this.craftedGoods[id] || 0) < 1) { this.renderHome(); return false; }
    }
    if (cur) this.craftedGoods[cur] = (this.craftedGoods[cur] || 0) + 1;
    if (id) this.craftedGoods[id] -= 1;
    this.home.slots[i] = id;
    this.saveHome();
    this.updateInventoryHUD();
    this.renderHomeSprites();
    this.renderHome();
    const hn = document.getElementById('home-note');
    if (hn && !SAVE_OK) hn.textContent = 'Not saved yet: browser storage is full or blocked, so the change is kept for this visit until a save works.';
    if (id) {
      this.incrementStat('homePlaced');
      if (this.home.slots.every(Boolean)) this.incrementStat('homeFullPlots');
    }
    this.noteCozy();
    return true;
  }

  // ---------- villager mailbox ----------
  // Pure: the letters for a UTC day given each villager's friendship tier
  // ({id: tier}). Each has a stable id `${day}:${villagerId}`, sender,
  // text, tier and an attachment ({kind:'res', key, n} or {kind:'stars', n}).
  lettersForDay(day, tiers) {
    const d = day % 100000;
    const letters = [];
    VILLAGERS.forEach((v, i) => {
      const tier = Math.max(0, Math.min(3, Math.floor(Number(tiers[v.id]) || 0)));
      if (birthdayIndexForDay(day) === i || worldHash(d, i, MAIL_SALT) < MAIL_WRITE_CHANCE[tier]) letters.push(this.makeLetter(d, day, v, i, tier));
    });
    if (letters.length === 0) {
      // Everyone is busy today: the villager with the lowest roll still writes.
      let best = 0;
      VILLAGERS.forEach((v, i) => { if (worldHash(d, i, MAIL_SALT) < worldHash(d, best, MAIL_SALT)) best = i; });
      const v = VILLAGERS[best];
      letters.push(this.makeLetter(d, day, v, best, Math.max(0, Math.min(3, Math.floor(Number(tiers[v.id]) || 0)))));
    }
    return letters;
  }

  makeLetter(d, day, v, i, tier) {
    const opener = LETTER_OPENERS[tier][Math.floor(worldHash(d, i, MAIL_SALT + 1) * LETTER_OPENERS[tier].length)];
    const pool = tier >= 2 && v.closeLines && v.closeLines.length ? v.closeLines : v.lines;
    const body = pool[Math.floor(worldHash(d, i, MAIL_SALT + 2) * pool.length)];
    const wantsRes = worldHash(d, i, MAIL_SALT + 3) < 0.6;
    const attach = wantsRes
      ? { kind: 'res', key: v.likes[Math.floor(worldHash(d, i, MAIL_SALT + 4) * v.likes.length)], n: 1 + Math.floor(worldHash(d, i, MAIL_SALT + 5) * 2) + (tier >= 2 ? 1 : 0) }
      : { kind: 'stars', n: MAIL_STAR_BASE + tier + Math.floor(worldHash(d, i, MAIL_SALT + 6) * 2) };
    const bday = birthdayIndexForDay(day) === i;
    if (bday) attach.n += attach.kind === 'stars' ? 2 : 1;
    return { id: `${day}:${v.id}`, from: v.name, villagerId: v.id, tier, birthday: bday,
      text: bday ? `🎂 It's my birthday today — come by for cake! ${body}` : `${opener} ${body}`, attach };
  }

  mailTiers() {
    const t = {};
    VILLAGERS.forEach((v) => { t[v.id] = this.villagerTier(v.id); });
    return t;
  }

  // Today's claimed ids from the save; anything malformed or from another day is empty.
  claimedLetters() {
    const rec = loadSave().mail;
    const day = this.questDayBucket();
    if (!rec || typeof rec !== 'object' || rec.day !== day || !Array.isArray(rec.claimed)) return new Set();
    return new Set(rec.claimed.filter((x) => typeof x === 'string'));
  }

  unclaimedLetters() {
    const day = this.questDayBucket();
    const claimed = this.claimedLetters();
    return this.lettersForDay(day, this.mailTiers()).filter((l) => !claimed.has(l.id));
  }

  attachLabel(a) {
    return a.kind === 'stars' ? `${a.n} ⭐` : `${a.n} ${VILLAGER_GIFT_ICONS[a.key] || a.key}`;
  }

  drawMailbox() {
    const { x, y } = MAILBOX_POS;
    if (!this.textures.exists('mailbox')) {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0x000000, 0.16).fillEllipse(16, 40, 28, 8);
      g.fillStyle(0x6b4a30, 1).fillRect(14, 20, 5, 20);
      g.fillStyle(0x3b6fb6, 1).fillRoundedRect(4, 6, 26, 16, 5);
      g.fillStyle(0x2c5594, 1).fillRect(4, 14, 26, 3);
      g.fillStyle(0xe8d9b5, 1).fillRect(11, 9, 12, 3);
      g.generateTexture('mailbox', 34, 44);
      g.destroy();
    }
    this.add.image(x, y, 'mailbox').setDepth(y - 1);
    this.addObstacleRect({ x: x - 8, y: y + 8, width: 16, height: 14 });
    this.mailboxLabel = this.add.text(x, y - 40, '📬 Mailbox', { fontSize: '12px' }).setOrigin(0.5).setDepth(y + 1);
    this.refreshMailboxLabel();
    // Day rollover / friendship changes: poll cheaply (no per-frame work).
    this.time.addEvent({ delay: 30000, loop: true, callback: () => this.refreshMailboxLabel() });
  }

  refreshMailboxLabel() {
    if (!this.mailboxLabel) return;
    const n = this.unclaimedLetters().length;
    this.mailboxLabel.setText(n > 0 ? `📬 Mailbox ❗${n}` : '📬 Mailbox');
  }

  isNearMailbox(radius = MAILBOX_RADIUS) {
    return Math.hypot(this.localBody.x - MAILBOX_POS.x, this.localBody.y - MAILBOX_POS.y) < radius;
  }

  openMailbox() {
    this.mailboxOpen = true;
    document.getElementById('mailbox-overlay').classList.remove('hidden');
    document.getElementById('mailbox-note').textContent = '';
    this.renderMailbox();
  }

  closeMailbox() {
    this.mailboxOpen = false;
    document.getElementById('mailbox-overlay').classList.add('hidden');
    this.refreshMailboxLabel();
  }

  renderMailbox() {
    const list = document.getElementById('mailbox-list');
    list.innerHTML = '';
    const day = this.questDayBucket();
    const claimed = this.claimedLetters();
    const letters = this.lettersForDay(day, this.mailTiers());
    letters.forEach((l) => {
      const li = document.createElement('li');
      li.className = 'mail-letter';
      const head = document.createElement('div');
      head.className = 'mail-from';
      head.textContent = `✉️ From ${l.from} (${VILLAGER_TIER_NAMES[l.tier]})`;
      const body = document.createElement('div');
      body.className = 'mail-body';
      body.textContent = l.text;
      const foot = document.createElement('div');
      foot.className = 'mail-foot';
      const gift = document.createElement('span');
      gift.textContent = `🎁 ${this.attachLabel(l.attach)}`;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mail-collect-btn';
      btn.dataset.letter = l.id;
      btn.setAttribute('aria-label', `Collect letter from ${l.from}`);
      btn.textContent = claimed.has(l.id) ? 'Collected' : 'Collect';
      btn.disabled = claimed.has(l.id);
      btn.addEventListener('click', () => this.claimLetter(l.id));
      foot.append(gift, btn);
      li.append(head, body, foot);
      list.appendChild(li);
    });
    const left = letters.filter((l) => !claimed.has(l.id)).length;
    document.getElementById('mailbox-collect-all-btn').disabled = left === 0;
    const note = document.getElementById('mailbox-note');
    if (left === 0 && !note.textContent) note.textContent = 'All caught up — new letters arrive tomorrow.';
  }

  claimLetter(id) {
    const day = this.questDayBucket();
    const claimed = this.claimedLetters();
    if (claimed.has(id)) return false;
    const letter = this.lettersForDay(day, this.mailTiers()).find((l) => l.id === id);
    if (!letter) return false;
    claimed.add(id);
    const prev = loadSave().mail;
    const lifetime = prev && typeof prev === 'object' ? cleanCount(prev.lifetime) : 0;
    // Save the claim BEFORE paying out so a crash/reload can never double-pay.
    writeSave({ mail: { day, claimed: [...claimed], lifetime: lifetime + 1 } });
    const a = letter.attach;
    if (a.kind === 'stars') {
      this.awardPoint(a.n, `📬 +${a.n} ⭐`, this.localBody.x, this.localBody.y - 36, 'sell');
    } else {
      this.resources[a.key] = (this.resources[a.key] || 0) + a.n;
      this.updateInventoryHUD();
      this.saveResources();
      this.showFloatingText(this.localBody.x, this.localBody.y - 36, `📬 +${this.attachLabel(a)}`);
    }
    this.incrementStat('lettersRead');
    if (letter.tier >= 3) this.incrementStat('bestFriendLetters');
    const note = document.getElementById('mailbox-note');
    if (note) note.textContent = `Thanks, ${letter.from}! You got ${this.attachLabel(a)}.`;
    this.renderMailbox();
    this.refreshMailboxLabel();
    return true;
  }

  collectAllLetters() {
    this.unclaimedLetters().forEach((l) => this.claimLetter(l.id));
  }

  // ---------- DIY workbench ----------
  // Baked once into a texture (no per-frame drawing), then placed as an image.
  drawWorkbench() {
    const { x, y } = WORKBENCH_POS;
    if (!this.textures.exists('workbench')) {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0x000000, 0.18).fillEllipse(40, 46, 76, 14);
      g.fillStyle(0x6b4a30, 1).fillRect(8, 30, 6, 16).fillRect(66, 30, 6, 16);
      g.fillStyle(0xc89a5b, 1).fillRect(4, 18, 72, 14);
      g.fillStyle(0xa87c44, 1).fillRect(4, 28, 72, 4);
      g.fillStyle(0x8a8f99, 1).fillRect(16, 10, 18, 8);
      g.fillStyle(0x6b4a30, 1).fillRect(52, 6, 4, 12);
      g.fillStyle(0xb0b5bf, 1).fillRect(50, 4, 12, 5);
      g.generateTexture('workbench', 80, 50);
      g.destroy();
    }
    this.add.image(x, y, 'workbench').setDepth(y - 1);
    this.addObstacleRect({ x: x - 36, y: y - 4, width: 72, height: 24 });
    this.add.text(x, y - 36, '🔨 Workbench', { fontSize: '12px' }).setOrigin(0.5).setDepth(y + 1);
  }

  isNearWorkbench(radius = WORKBENCH_RADIUS) {
    return Math.hypot(this.localBody.x - WORKBENCH_POS.x, this.localBody.y - WORKBENCH_POS.y) < radius;
  }

  openWorkbench() {
    this.workbenchOpen = true;
    document.getElementById('workbench-overlay').classList.remove('hidden');
    document.getElementById('workbench-note').textContent = '';
    this.renderWorkbench();
  }

  closeWorkbench() {
    this.workbenchOpen = false;
    const wo = document.getElementById('workbench-overlay');
    wo.classList.add('hidden');
    wo.style.zIndex = '';
    if (this.underground && this.underground.paused) { this.underground.setPaused(false); this.underground.onHotbarChange(this.underground.getHotbarState()); } // counts may have changed at the bench
  }

  canCraft(recipe) {
    return Object.entries(recipe.cost).every(([k, v]) => (this.resources[k] || 0) >= v);
  }

  renderWorkbench() {
    const list = document.getElementById('workbench-list');
    list.innerHTML = '';
    const season = this.currentSeason();
    const seasonEl = document.getElementById('workbench-season');
    if (seasonEl) seasonEl.textContent = `${SEASON_ICONS[season]} It's ${season} — ${season} specials can be crafted now.`;
    RECIPES.forEach((r) => {
      const li = document.createElement('li');
      const cost = Object.entries(r.cost).map(([k, v]) => `${v}${RES_ICONS[k]}`).join(' + ');
      const have = this.craftedGoods[r.id] || 0;
      const outOfSeason = !!r.season && r.season !== season;
      const info = document.createElement('span');
      info.textContent = `${r.season ? SEASON_ICONS[r.season] + ' ' : ''}${r.icon} ${r.label} — ${cost} → ${r.value}⭐ (have ${have})${outOfSeason ? ` · only in ${r.season}` : ''}`;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'workbench-craft-btn';
      btn.setAttribute('aria-label', `Craft ${r.label}`);
      btn.dataset.recipe = r.id;
      btn.textContent = 'Craft';
      btn.disabled = !this.canCraft(r) || outOfSeason;
      btn.addEventListener('click', () => this.craftRecipe(r.id));
      li.append(info, btn);
      list.appendChild(li);
    });
    // Pickaxe upgrades live on the same bench (and at every crafting table placed in the cave).
    const head = document.createElement('li');
    head.className = 'workbench-section';
    head.textContent = `⛏️ Pickaxes — you hold the ${PICK_NAMES[this.cavePick.tier]} pickaxe${this.cavePick.tier ? ` (${this.cavePick.dur}/${PICK_DUR[this.cavePick.tier]})` : ''}`;
    list.appendChild(head);
    PICK_RECIPES.forEach((r) => {
      const li = document.createElement('li');
      const cost = Object.entries(r.cost).map(([k, v]) => `${v}${RES_ICONS[k]}`).join(' + ');
      const info = document.createElement('span');
      info.textContent = `${r.icon} ${r.label} — ${cost} · ${r.note}`;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'workbench-craft-btn';
      btn.setAttribute('aria-label', `Craft ${r.label}`);
      btn.dataset.pick = String(r.tier);
      btn.textContent = r.tier === this.cavePick.tier ? 'Repair' : 'Craft';
      btn.disabled = !this.canCraftPick(r);
      btn.addEventListener('click', () => this.craftPick(r.tier));
      li.append(info, btn);
      list.appendChild(li);
    });
  }

  pickHave(k) { return (k === 'iron' || k === 'gold' || k === 'coal') ? (this.caveInv[k] || 0) : (this.resources[k] || 0); }

  canCraftPick(r) {
    if (r.tier === this.cavePick.tier && this.cavePick.dur >= PICK_DUR[r.tier]) return false; // already new: nothing to repair
    return r.tier >= this.cavePick.tier && Object.entries(r.cost).every(([k, v]) => this.pickHave(k) >= v);
  }

  craftPick(tier) {
    const r = PICK_RECIPES.find((x) => x.tier === tier);
    const note = document.getElementById('workbench-note');
    if (!r) return false;
    if (tier < this.cavePick.tier) { if (note) note.textContent = `You already hold a better pickaxe.`; return false; }
    if (!this.canCraftPick(r)) {
      const need = Object.entries(r.cost).filter(([k, v]) => this.pickHave(k) < v).map(([k, v]) => `${v - this.pickHave(k)}${RES_ICONS[k]}`).join(' ');
      if (note) note.textContent = `Need ${need} more`;
      return false;
    }
    for (const [k, v] of Object.entries(r.cost)) {
      if (k === 'iron' || k === 'gold' || k === 'coal') this.caveInv[k] -= v; else this.resources[k] -= v;
    }
    this.cavePick = { tier, dur: PICK_DUR[tier] };
    if (this.underground) this.underground.setPick(tier, PICK_DUR[tier]);
    this.updateInventoryHUD();
    this.saveResources();
    this.updatePickBadge();
    this.incrementStat('pickCrafted');
    if (note) note.textContent = `Crafted the ${r.label}! It lasts ${PICK_DUR[tier]} blocks.` + (SAVE_OK ? '' : ' Not saved yet: browser storage is full or blocked, so it is kept for this visit until a save works.');
    if (this.underground) this.underground.onHotbarChange(this.underground.getHotbarState());
    this.renderWorkbench();
    return true;
  }

  // The cave's pickaxe badge (tier + remaining durability); a break message shows for a moment.
  updatePickBadge(msg) {
    const el = document.getElementById('ug-pick');
    if (!el) return;
    const p = this.cavePick;
    el.textContent = msg || `⛏️ ${PICK_NAMES[p.tier]}${p.tier ? ` ${p.dur}/${PICK_DUR[p.tier]}` : ''}`;
    el.classList.toggle('low', !msg && p.tier > 0 && p.dur <= PICK_DUR[p.tier] * 0.1);
    el.classList.toggle('broke', !!msg);
    if (msg) { clearTimeout(this._pickMsgT); this._pickMsgT = setTimeout(() => this.updatePickBadge(), 3000); }
  }

  openCaveTable() {
    if (!this.inUnderground || this.workbenchOpen) return;
    this.underground.setPaused(true);
    this.openWorkbench();
    document.getElementById('workbench-overlay').style.zIndex = '40'; // above the cave canvas (30)
  }

  craftRecipe(id) {
    const r = RECIPES.find((x) => x.id === id);
    const note = document.getElementById('workbench-note');
    if (!r) return false;
    if (r.season && r.season !== this.currentSeason()) {
      if (note) note.textContent = `${r.label} can only be crafted in ${r.season}.`;
      return false;
    }
    if (!this.canCraft(r)) {
      const need = Object.entries(r.cost).filter(([k, v]) => (this.resources[k] || 0) < v).map(([k, v]) => `${v - (this.resources[k] || 0)}${RES_ICONS[k]}`).join(' ');
      if (note) note.textContent = `Need ${need} more`;
      return false;
    }
    for (const [k, v] of Object.entries(r.cost)) this.resources[k] -= v;
    this.craftedGoods[r.id] = (this.craftedGoods[r.id] || 0) + 1;
    this.updateInventoryHUD();
    this.saveResources();
    this.incrementStat('crafted');
    this.incrementStat('craft_' + r.id);
    if (note) note.textContent = `Crafted ${r.icon} ${r.label}! Sell it at the shop.` + (SAVE_OK ? '' : ' Not saved yet: browser storage is full or blocked, so it is kept for this visit until a save works.');
    this.showFloatingText(this.localBody.x, this.localBody.y - 30, `${r.icon} crafted!`);
    this.renderWorkbench();
    return true;
  }

  // ---------- Able Sisters outfit shop ----------
  // Same species/frame picker as the join screen, but live: applying
  // updates your own sprite immediately, writes through net.js so every
  // other player's child_changed listener re-textures your remote
  // sprite too, and persists locally like name/species already did.

  openOutfitShop() {
    this.outfitSpecies = this.selfData.species;
    this.outfitFrame = this.selfData.frame;
    this.renderOutfitTabs();
    this.renderOutfitGrid();
    document.getElementById('outfit-overlay').classList.remove('hidden');
    this.outfitShopOpen = true;
  }

  closeOutfitShop() {
    document.getElementById('outfit-overlay').classList.add('hidden');
    this.outfitShopOpen = false;
  }

  randomizeOutfit() {
    this.outfitSpecies = MMTownHeroes.heroKey(MMTownHeroes.CLASSES[Math.floor(Math.random() * MMTownHeroes.CLASSES.length)]);
    this.outfitFrame = 0;
    this.renderOutfitTabs();
    this.renderOutfitGrid();
    SFX.pop();
  }

  renderOutfitTabs() {
    const el = document.getElementById('outfit-species-tabs');
    MMTownHeroes.renderPicker(el, document.getElementById('outfit-avatar-grid'), this.outfitSpecies, this.outfitFrame, (key, f) => {
      this.outfitSpecies = key; this.outfitFrame = f; this.renderOutfitTabs();
    });
    if (el) return; // the 10 heroes; the old species tabs below stay for reference only
    SPECIES.forEach((s) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'species-tab' + (s.key === this.outfitSpecies ? ' active' : '');
      btn.textContent = s.label;
      btn.addEventListener('click', () => {
        this.outfitSpecies = s.key;
        this.outfitFrame = 0;
        this.renderOutfitTabs();
        this.renderOutfitGrid();
      });
      el.appendChild(btn);
    });
  }

  renderOutfitGrid() {
    const el = document.getElementById('outfit-avatar-grid');
    if (el) return; // drawn by renderOutfitTabs (MMTownHeroes.renderPicker)
    el.innerHTML = '';
    for (let frame = 0; frame < FRAME_COUNT; frame++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'avatar-choice' + (frame === this.outfitFrame ? ' selected' : '');
      btn.style.backgroundImage = `url(../i/${this.outfitSpecies}-strip.png)`;
      btn.style.backgroundPosition = `-${frame * 48}px 0`;
      btn.addEventListener('click', () => {
        this.outfitFrame = frame;
        this.renderOutfitGrid();
      });
      el.appendChild(btn);
    }
  }

  applyOutfit() {
    this.selfData.species = this.outfitSpecies;
    this.selfData.frame = this.outfitFrame;
    const oTex = this.safeTexture(this.outfitSpecies, this.outfitFrame);
    this.localVisual.setTexture(oTex.key, oTex.frame);
    this.localBody.setTexture(oTex.key, oTex.frame);
    writeSave({ species: this.outfitSpecies, frame: this.outfitFrame });
    this.net.updateAppearance(this.outfitSpecies, this.outfitFrame);
    this.closeOutfitShop();
    this.showFloatingText(this.localBody.x, this.localBody.y - 30, 'new look!');
    this.unsavedNote('New look');
  }

  setupOutfitShop() {
    document.getElementById('outfit-close-btn').addEventListener('click', () => this.closeOutfitShop());
    document.getElementById('outfit-apply-btn').addEventListener('click', () => this.applyOutfit());
    const randomBtn = document.getElementById('outfit-random-btn');
    if (randomBtn) randomBtn.addEventListener('click', () => this.randomizeOutfit());
  }

  // ---------- guestbook UI ----------
  // Short signed notes, persisted in Firebase (`/guestbook`, last 20 kept
  // locally) so every player who visits the sign later sees what others
  // left — not just a local-save journal.

  setupGuestbook() {
    this.guestbookEntries = [];
    this.lastGuestbookAt = 0;
    document.getElementById('guestbook-close-btn').addEventListener('click', () => this.closeGuestbook());
    document.getElementById('workbench-close-btn').addEventListener('click', () => this.closeWorkbench());
    document.getElementById('home-close-btn').addEventListener('click', () => this.closeHome());
    const homeOverlay = document.getElementById('home-overlay');
    homeOverlay.addEventListener('click', (e) => { if (e.target === homeOverlay) this.closeHome(); });
    document.getElementById('mailbox-close-btn').addEventListener('click', () => this.closeMailbox());
    const mbOverlay = document.getElementById('mailbox-overlay');
    mbOverlay.addEventListener('click', (e) => { if (e.target === mbOverlay) this.closeMailbox(); });
    document.getElementById('mailbox-collect-all-btn').addEventListener('click', () => this.collectAllLetters());
    const wbOverlay = document.getElementById('workbench-overlay');
    wbOverlay.addEventListener('click', (e) => { if (e.target === wbOverlay) this.closeWorkbench(); });
    document.getElementById('guestbook-sign-btn').addEventListener('click', () => this.submitGuestbookNote());
    const input = document.getElementById('guestbook-input');
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.submitGuestbookNote();
      e.stopPropagation();
    });
  }

  openGuestbook() {
    this.guestbookOpen = true;
    document.getElementById('guestbook-overlay').classList.remove('hidden');
    document.getElementById('guestbook-error').textContent = '';
    this.renderGuestbookList();
  }

  closeGuestbook() {
    this.guestbookOpen = false;
    document.getElementById('guestbook-overlay').classList.add('hidden');
  }

  renderGuestbookList() {
    const list = document.getElementById('guestbook-list');
    list.innerHTML = '';
    if (!this.guestbookEntries.length) {
      const li = document.createElement('li');
      li.className = 'guestbook-empty';
      li.textContent = 'No notes yet — be the first to sign!';
      list.appendChild(li);
      return;
    }
    this.guestbookEntries.forEach((entry) => {
      const li = document.createElement('li');
      const who = document.createElement('span');
      who.className = 'guestbook-who';
      who.textContent = censorBlockedTerms(entry.name || '???');
      li.appendChild(who);
      li.appendChild(document.createTextNode(` ${censorBlockedTerms(entry.text)}`));
      list.appendChild(li);
    });
  }

  submitGuestbookNote() {
    const input = document.getElementById('guestbook-input');
    const errorEl = document.getElementById('guestbook-error');
    const text = input.value.trim().slice(0, GUESTBOOK_NOTE_MAX);
    errorEl.textContent = '';

    if (!text) return;

    if (containsBlockedTerm(text)) {
      errorEl.textContent = "That note wasn't signed — please keep it clean.";
      input.value = '';
      return;
    }

    // Same client-side spam deterrent idea as chat's repeat-message guard,
    // but time-based instead: a real cooldown between writes, since this
    // goes straight to the shared production database.
    const now = Date.now();
    if (now - this.lastGuestbookAt < GUESTBOOK_COOLDOWN_MS) {
      const waitSec = Math.ceil((GUESTBOOK_COOLDOWN_MS - (now - this.lastGuestbookAt)) / 1000);
      errorEl.textContent = `Slow down — you can sign again in ${waitSec}s.`;
      return;
    }

    if (!this.net.offline) this.net.leaveGuestbookNote(text);
    this.lastGuestbookAt = now;
    input.value = '';
  }

  drawTurnipStall() {
    const { x, y } = TURNIP_STALL_POS;
    const g = this.bakedGfx(y - 1);
    g.fillStyle(0x7a4a26, 1).fillRect(x - 26, y - 4, 52, 18);
    g.fillStyle(0xd9663b, 1).fillTriangle(x - 32, y - 4, x + 32, y - 4, x, y - 30);
    g.bake({ finish: 'turnip' });
    this.add.text(x, y - 46, '🥬 Turnips', { fontSize: '12px' }).setOrigin(0.5).setDepth(y + 1);
    // R4 D4 (b07-r2-13): the price sat at y+20, exactly where a shopper's name label is drawn. It now sits above the sign.
    this.turnipBuyLabel = this.add.text(x, y - 62, '', { fontSize: '11px', color: '#ffe066', stroke: '#1c2430', strokeThickness: 3 }).setOrigin(0.5).setDepth(y + 1);
    // cycle 4 art (U ask): the green sell price had no outline and sank into the Shop roof / grass; same dark stroke as the buy price
    this.turnipSellLabel = this.add.text(HOUSE_POS.x + HOUSE_POS.w / 2 - 14, HOUSE_POS.y - 50, '', { fontSize: '11px', color: '#8fe08a', stroke: '#1c2430', strokeThickness: 3 }).setOrigin(0.5).setDepth(HOUSE_POS.y + HOUSE_POS.h + 1); // cyc9 coord: 14 px left so a 3-digit price no longer touches the Able Sisters sign (cyc3-ui-town-labels failed solo at 109 and 197 shards); cyc3 U: drawn over the Shop roof like the title and deal lines
  }

  updateTurnipPriceLabels(time) {
    if (time - (this.lastTurnipLabelAt || 0) < 1000) return;
    this.lastTurnipLabelAt = time;
    if (this.turnipBuyLabel) this.turnipBuyLabel.setText(`${this.turnipBuyPrice()} ⭐ / ${TURNIP_BUNDLE}`);
    if (this.turnipSellLabel) this.turnipSellLabel.setText(`sells ${this.turnipSellPrice()} ⭐ / ${TURNIP_BUNDLE}`);
  }

  drawFossilSpots() {
    this.fossilMounds = FOSSIL_SPOTS.map(({ x, y }) => {
      const g = this.bakedGfx(y - 1);
      g.fillStyle(0x7a5a38, 1).fillEllipse(x, y, 34, 18);
      g.fillStyle(0x8f7044, 1).fillEllipse(x, y - 3, 22, 10);
      return g.bake();
    });
  }

  // ---------- beachcombing ----------
  // Fixed spots along the pond edges, same shape as the fishing spots:
  // walk up, interact, a short cooldown before it washes up again.
  // Local-only, like every other activity here.

  // ---------- weeds ----------
  // The day's weed positions: deterministic (worldHash of day + index +
  // attempt), kept inside the village on open ground — off the ponds, every
  // static obstacle (padded like the wildlife blockers), and clear of the
  // flower patches and landmarks. May return fewer than WEED_COUNT in the
  // unlikely event a slot finds no free spot in 12 tries.
  weedSpotsForDay(day) {
    const vb = VILLAGE_BOUNDS;
    const pad = 70;
    const blockers = this.weedBlockers;
    const keepClear = [
      ...FLOWER_SPOTS, CAMPFIRE_POS, STATUE_POS, MAILBOX_POS, BUGOFF_SIGN_POS, HOME_POS, GUESTBOOK_POS, WORKBENCH_POS,
      POLYROLL_POS, TURNIP_STALL_POS, ABLE_SISTERS_POS, MERCHANT_POS, DIG_HOLE_POS, FISH_TOURNAMENT_SIGN_POS, REALM_GATE_POS,
      ISLES_SIGN_POS, POSTCARD_POS,
    ];
    const spots = [];
    for (let i = 0; i < WEED_COUNT; i++) {
      for (let t = 0; t < 12; t++) {
        const x = Math.round(vb.x + pad + worldHash(day % 100000 + i * 0.37, t, WEED_SEED) * (vb.width - pad * 2));
        const y = Math.round(vb.y + pad + worldHash(day % 100000 + i * 0.37, t + 50, WEED_SEED + 1) * (vb.height - pad * 2));
        if (blockers.some((b) => x > b[0] && x < b[2] && y > b[1] && y < b[3])) continue;
        if (this.ffInPond(MAIN_POND, x, y, 1.25) || this.ffInPond(EAST_POND, x, y, 1.25)) continue;
        if (keepClear.some((k) => Math.hypot(k.x - x, k.y - y) < 60)) continue;
        // Interaction radii that win over a weed in interact(): the shop house, the museum and every possible scavenger spot (day-dependent), so a weed is never shadowed by them.
        if (Math.hypot(HOUSE_POS.x + HOUSE_POS.w / 2 - x, HOUSE_POS.y + HOUSE_POS.h / 2 - y) < SHOP_RADIUS + 12) continue;
        if (Math.hypot(MUSEUM_POS.x + MUSEUM_POS.w / 2 - x, MUSEUM_POS.y + MUSEUM_POS.h / 2 - y) < MUSEUM_RADIUS + 12) continue;
        if (SCAVENGER_SPOTS.some((k) => Math.hypot(k.x - x, k.y - y) < SCAVENGER_RADIUS + 12)) continue;
        // R4: every other object that answers E BEFORE a weed in interact() keeps its real radius + 8 clear (the flat 60 px above
        // was smaller than the mailbox / workbench / home rings, 70-75 px, so a weed 63 px from the mailbox could never be pulled).
        if (WEED_SHADOW_RINGS.some((k) => Math.hypot(k.x - x, k.y - y) < k.r + 8)) continue;
        // The home plot is a 156x96 footprint: keep weeds off it (and its fence).
        if (Math.abs(x - HOME_POS.x) < 175 && Math.abs(y - HOME_POS.y) < 80) continue;
        // Talk-radius NPCs: stay outside their interaction radius so a weed can't steal a chat.
        if (Math.hypot(NPC_POS.x - x, NPC_POS.y - y) < 100 || Math.hypot(NPC2_POS.x - x, NPC2_POS.y - y) < 100) continue;
        if (spots.some((o) => Math.hypot(o.x - x, o.y - y) < 40)) continue;
        spots.push({ x, y });
        break;
      }
    }
    return spots;
  }

  setupWeeds() {
    // Snapshot the STATIC obstacles once (player-built blocks arrive later
    // via Firebase and differ per client/timing) so every client — including
    // one that rolls over to a new day mid-session — computes identical weeds.
    this.weedBlockers = this.obstacles.getChildren().map((r) => [
      r.x - r.width / 2 - 24, r.y - r.height / 2 - 48, r.x + r.width / 2 + 24, r.y + r.height / 2 + 16,
    ]);
    if (!this.textures.exists('weed')) {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0x000000, 0.15).fillEllipse(10, 18, 16, 5);
      g.fillStyle(0x3f7a2a, 1).fillTriangle(10, 2, 6, 17, 10, 14).fillTriangle(10, 2, 14, 17, 10, 14);
      g.fillStyle(0x58a03a, 1).fillTriangle(3, 6, 8, 17, 9, 12).fillTriangle(17, 6, 12, 17, 11, 12);
      g.fillStyle(0x2f5f1f, 1).fillRect(9, 12, 2, 6);
      g.generateTexture('weed', 20, 20);
      g.destroy();
    }
    this.weedSprites = [];
    for (let i = 0; i < WEED_COUNT; i++) {
      this.weedSprites.push(this.add.image(0, 0, 'weed').setVisible(false));
    }
    this.weedDay = null;
    this.refreshWeeds();
    // Day rollover is polled (like the merchant sign) — no per-frame work.
    this.time.addEvent({ delay: 30000, loop: true, callback: () => this.refreshWeeds() });
  }

  refreshWeeds() {
    const day = this.questDayBucket();
    if (day === this.weedDay) return;
    this.weedDay = day;
    this.weedSpots = this.weedSpotsForDay(day);
    const rec = loadSave().weedsPulled;
    const ids = rec && typeof rec === 'object' && rec.day === day && Array.isArray(rec.ids) ? rec.ids : [];
    this.weedsPulledToday = new Set(ids.filter((v) => Number.isInteger(v) && v >= 0 && v < WEED_COUNT));
    this.weedSprites.forEach((sp, i) => {
      const spot = this.weedSpots[i];
      if (!spot) { sp.setVisible(false); return; }
      sp.setPosition(spot.x, spot.y).setScale(1).setAlpha(1).setDepth(spot.y);
      sp.setVisible(!this.weedsPulledToday.has(i));
    });
    this.updateTidiness();
  }

  weedsLeft() {
    let n = 0;
    this.weedSpots.forEach((_, i) => { if (!this.weedsPulledToday.has(i)) n++; });
    return n;
  }

  updateTidiness() {
    const el = document.getElementById('town-tidy');
    if (!el) return;
    const left = this.weedsLeft();
    const label = left === 0 ? 'Spotless ✨' : left <= 8 ? 'Tidy' : left <= 16 ? 'Scruffy' : 'Overgrown';
    el.textContent = `🌿 ${label} (${left} weeds)`;
  }

  findNearestWeed() {
    let best = null;
    let bestDist = WEED_PULL_RADIUS;
    this.weedSpots.forEach((spot, i) => {
      if (this.weedsPulledToday.has(i)) return;
      const d = Math.hypot(this.localBody.x - spot.x, this.localBody.y - spot.y);
      if (d < bestDist) { bestDist = d; best = { ...spot, index: i }; }
    });
    return best;
  }

  pullWeed(weed) {
    if (this.weedsPulledToday.has(weed.index)) return false;
    this.weedsPulledToday.add(weed.index);
    writeSave({ weedsPulled: { day: this.weedDay, ids: [...this.weedsPulledToday] } });
    const sp = this.weedSprites[weed.index];
    if (sp) {
      // One-shot pop-out tween (not per-frame), then hide.
      this.tweens.add({ targets: sp, scale: 1.6, alpha: 0, y: weed.y - 14, duration: 220, onComplete: () => sp.setVisible(false) });
    }
    this.awardPoint(WEED_STAR_REWARD, `🌿 +${WEED_STAR_REWARD} ⭐`, weed.x, weed.y - 20, 'sell');
    this.incrementStat('weedsPulled');
    this.updateTidiness();
    if (this.weedsLeft() === 0 && this.weedSpots.length > 0) {
      this.awardPoint(WEED_SPOTLESS_BONUS, `✨ Spotless town! +${WEED_SPOTLESS_BONUS} ⭐`, this.localBody.x, this.localBody.y - 50, 'achievement');
      this.incrementStat('spotlessDays');
    }
    return true;
  }

  drawFlowers() {
    this.flowerCooldowns = {};
    this.flowerSprites = FLOWER_SPOTS.map(({ x, y }) => {
      const symbol = FLOWER_TYPES[Phaser.Math.Between(0, FLOWER_TYPES.length - 1)];
      return this.add.text(x, y, symbol, { fontSize: '18px' }).setOrigin(0.5).setDepth(y);
    });
  }

  findNearestFlower() {
    const now = this.cooldownNow();
    let best = null;
    let bestDist = FLOWER_PICKUP_RADIUS;
    FLOWER_SPOTS.forEach((spot, i) => {
      if (this.flowerCooldowns[i] && now - this.flowerCooldowns[i] < FLOWER_REGROW_MS) return;
      const d = Math.hypot(this.localBody.x - spot.x, this.localBody.y - spot.y);
      if (d < bestDist) { bestDist = d; best = { ...spot, index: i }; }
    });
    return best;
  }

  collectFlower(spot) {
    this.flowerCooldowns[spot.index] = this.cooldownNow();
    const sprite = this.flowerSprites[spot.index];
    if (sprite) {
      const floraIdx = FLOWER_TYPES.indexOf(sprite.text);
      if (floraIdx >= 0 && !this.museumFlora.has(floraIdx)) {
        this.museumFlora.add(floraIdx);
        this.saveFossils();
      }
      sprite.setVisible(false);
      this.time.delayedCall(FLOWER_REGROW_MS, () => {
        sprite.setText(FLOWER_TYPES[Phaser.Math.Between(0, FLOWER_TYPES.length - 1)]);
        sprite.setVisible(true);
      });
    }
    this.gainResource('flowers', 1, spot.x, spot.y - 16);
    this.bountyEvent('town:flower'); // ID-18
  }

  drawBeachItems() {
    this.beachCooldowns = {};
    this.beachSprites = BEACH_SPOTS.map(({ x, y }) => {
      const symbol = BEACH_ITEMS[Phaser.Math.Between(0, BEACH_ITEMS.length - 1)];
      return this.add.text(x, y, symbol, { fontSize: '16px' }).setOrigin(0.5).setDepth(y);
    });
  }

  findNearestBeachItem() {
    const now = this.cooldownNow();
    let best = null;
    let bestDist = BEACH_PICKUP_RADIUS;
    BEACH_SPOTS.forEach((spot, i) => {
      if (this.beachCooldowns[i] && now - this.beachCooldowns[i] < BEACH_RESPAWN_MS) return;
      const d = Math.hypot(this.localBody.x - spot.x, this.localBody.y - spot.y);
      if (d < bestDist) { bestDist = d; best = { ...spot, index: i }; }
    });
    return best;
  }

  collectBeachItem(spot) {
    this.beachCooldowns[spot.index] = this.cooldownNow();
    const sprite = this.beachSprites[spot.index];
    if (sprite) {
      sprite.setVisible(false);
      this.time.delayedCall(BEACH_RESPAWN_MS, () => {
        sprite.setText(BEACH_ITEMS[Phaser.Math.Between(0, BEACH_ITEMS.length - 1)]);
        sprite.setVisible(true);
      });
    }
    this.gainResource('shells', 1, spot.x, spot.y - 16);
  }

  drawStatue() {
    // Owner decision O-10 (Round 4): the Founder's Statue. A stone hero (the stone-tinted hero alias 'mooncats', frame 0 = a hero class)
    // at the SAME pixel scale as every hero and NPC (1x, b12-r2-05: no 2.3x sprite, no mixed pixel density), raised on a sculpted
    // three-step plinth with a top-left light, a carved plaque and a soft ground shadow. Code-drawn until the Codex hero-statue sprite
    // (CODEX-REMAKE-QUEUE, T-STATUE) lands; no ape.
    const { x, y } = STATUE_POS;
    const g = this.bakedGfx();
    g.fillStyle(0x000000, 0.22).fillEllipse(x + 3, y + 15, 60, 10); // ground shadow, down-right
    const step = (w, top, h, base, lit, dark) => {
      g.fillStyle(base, 1).fillRect(x - w / 2, top, w, h);
      g.fillStyle(lit, 1).fillRect(x - w / 2, top, w, 2).fillRect(x - w / 2, top, 2, h); // top / left light
      g.fillStyle(dark, 1).fillRect(x - w / 2, top + h - 2, w, 2).fillRect(x + w / 2 - 2, top, 2, h); // bottom / right shade
      g.lineStyle(1, 0x3c3a40, 1).strokeRect(x - w / 2 - 0.5, top - 0.5, w + 1, h + 1); // dark colour-matched rim
    };
    step(48, y + 2, 10, 0x8c8a90, 0xb4b2b8, 0x5e5c64); // base step
    step(38, y - 8, 10, 0x9a98a0, 0xc2c0c6, 0x67656e); // middle step
    step(28, y - 18, 10, 0xa6a4ac, 0xd0ced4, 0x706e78); // top block
    g.fillStyle(0x6a5a3a, 1).fillRect(x - 9, y - 5, 18, 5); // bronze plaque on the middle step
    g.fillStyle(0xc9a24a, 1).fillRect(x - 8, y - 4, 16, 3);
    g.fillStyle(0x6a5a3a, 1).fillRect(x - 6, y - 3, 12, 1);
    g.setDepth(y - 1);
    g.bake();

    const tex = this.textures.exists('mooncats') && !MMTownHeroes.legacyArt() ? { key: 'mooncats', frame: 0 } : this.safeTexture(MMTownHeroes.heroKey('warrior'), 0);
    const hero = this.add.sprite(x, y - 30, tex.key, tex.frame).setDepth(y);
    hero.htStill = true; hero.founderStatue = true;
    hero._cstill = 1; // cull: a statue never moves (see cullOffscreen)
    if (tex.key !== 'mooncats') hero.setTint(0xb8b4bc); // legacy-art fallback: a grey hero, still no ape
    this.founderStatue = hero;
    this.add.text(x, y - 52, "🦸 Founder's Statue", {
      fontSize: '12px',
      fontFamily: 'monospace',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(y + 1);

    this.addObstacleRect({ x: x - 22, y: y - 8, width: 44, height: 20 });
  }

  // A decorative old windmill tucked into the quiet northwest corner of
  // town — pure scenery, same static-graphics-plus-sprite pattern as the
  // statue, but with its blades spun by a looping angle tween instead of
  // the statue's stillness.
  drawWindmill() {
    const { x, y } = WINDMILL_POS;

    const g = this.bakedGfx();
    // Tapered stone tower (base wider than top).
    g.fillStyle(0xc9b896, 1);
    g.fillTriangle(x - 20, y, x + 20, y, x + 14, y - 64);
    g.fillTriangle(x - 20, y, x + 14, y - 64, x - 14, y - 64);
    g.fillStyle(0xb09c76, 1);
    for (let row = y - 8; row > y - 64; row -= 12) g.fillRect(x - 17 + (y - row) * 0.09, row, 34 - (y - row) * 0.18, 2);
    // Conical cap.
    g.fillStyle(0x6b4226, 1).fillTriangle(x - 18, y - 60, x + 18, y - 60, x, y - 86);
    // Door.
    g.fillStyle(0x5a3a22, 1).fillRect(x - 6, y - 16, 12, 16);
    g.setDepth(y - 1);
    g.bake({ finish: 'windmill' });

    // Blade assembly: four thin arms in a plus shape, grouped in a
    // container so a single rotation tween spins them all together.
    const hubX = x;
    const hubY = y - 70;
    const armLen = 42;
    const armW = 7;
    const blade1 = this.add.rectangle(0, -armLen / 2, armW, armLen, 0xf2ead8);
    const blade2 = this.add.rectangle(0, armLen / 2, armW, armLen, 0xf2ead8);
    const blade3 = this.add.rectangle(-armLen / 2, 0, armLen, armW, 0xf2ead8);
    const blade4 = this.add.rectangle(armLen / 2, 0, armLen, armW, 0xf2ead8);
    const hub = this.add.circle(0, 0, 5, 0x6b4226);
    const blades = this.add.container(hubX, hubY, [blade1, blade2, blade3, blade4, hub]).setDepth(y);
    this.tweens.add({ targets: blades, angle: 360, duration: 4000, repeat: -1, ease: 'Linear' });

    this.add.text(x, y - 100, '🌾 Old Windmill', {
      fontSize: '12px',
      fontFamily: 'monospace',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(y + 1);

    // Small solid footprint for just the tower base — players can still
    // walk right up to and around the structure.
    this.addObstacleRect({ x: x - 16, y: y - 14, width: 32, height: 14 });
  }

  // ---------- mystery merchant ----------
  // Same deterministic wall-clock-hash trick as weather/turnips: everyone
  // computes the same "today's rare species" and "today's visiting hour"
  // from the UTC day number, with zero network traffic.

  merchantDayBucket(dayOffset = 0) {
    return Math.floor(Date.now() / 86400000) + dayOffset;
  }

  merchantHash(seed, dayOffset = 0) {
    const h = Math.sin(this.merchantDayBucket(dayOffset) * 12.9898 + seed * 78.233) * 43758.5453;
    return h - Math.floor(h);
  }

  merchantStartHour(dayOffset = 0) {
    return Math.floor(this.merchantHash(1, dayOffset) * 22); // leaves room for a 3h window inside 24h
  }

  merchantSpecies() {
    const i = Math.floor(this.merchantHash(2) * RARE_SPECIES.length);
    return RARE_SPECIES[i];
  }

  isMerchantVisiting() {
    const hour = this.utcHour(); // same clock as merchantDayBucket (cycle0 L-01)
    const start = this.merchantStartHour();
    return hour >= start && hour < start + 3;
  }

  drawMerchant() {
    const { x, y } = MERCHANT_POS;
    const species = this.merchantSpecies();
    const mdy = npcFeetShift(1.8);
    this.merchantSprite = this.add.sprite(x, y + mdy, species.key, 0).setScale(npcScale(1.8)).setDepth(y);
    this.merchantSign = this.add.text(x, y + 2 * mdy - 34, '', {
      fontSize: '11px',
      fontFamily: 'monospace',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
      align: 'center',
    }).setOrigin(0.5).setDepth(y + 1);
    this.refreshMerchantSign();
    this.time.addEvent({ delay: 15000, loop: true, callback: () => this.refreshMerchantSign() });
  }

  refreshMerchantSign() {
    if (!this.merchantSign) return;
    const species = this.merchantSpecies();
    if (this.isMerchantVisiting()) {
      this.merchantSprite.setTexture(species.key, 0).setVisible(true);
      const lookName = this.merchantLookName(species);
      this.merchantSign.setText(`🛒 Mystery Merchant\nselling: ${lookName}`);
    } else {
      this.merchantSprite.setVisible(false);
      const hour = this.utcHour();
      const todayStart = this.merchantStartHour();
      // If today's window hasn't started yet, that's the next visit. If
      // it already started and ended (or we're just not in it anymore),
      // the next visit is tomorrow — with tomorrow's own hashed hour,
      // not today's stale one.
      const nextUtc = hour < todayStart ? todayStart : 24 + this.merchantStartHour(1); // a UTC hour counted from today's UTC midnight
      const at = this.utcHourDate(nextUtc); // shown on the player's own clock, with their own "today" / "tomorrow"
      const now = new Date(); const off = Math.round((new Date(at.getFullYear(), at.getMonth(), at.getDate()) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
      const whenLabel = off <= 0 ? 'today' : off === 1 ? 'tomorrow' : 'in 2 days'; // late evening west of UTC: tomorrow's UTC visit can fall two local dates ahead
      this.merchantSign.setText(`🛒 closed — back at ${this.localHourLabel(nextUtc)} ${whenLabel}`);
    }
  }

  // What the merchant sells, by name: the hero look today's species maps to (the old collection label only with ?legacyart=1).
  merchantLookName(species) {
    if (MMTownHeroes.legacyArt()) return species.label;
    return `${MMTownHeroes.heroOf(MMTownHeroes.classFor(species.key, Math.floor(this.merchantHash(3) * 9))).name} look`;
  }

  isNearMerchant() {
    return this.isMerchantVisiting() && Phaser.Math.Distance.Between(this.localBody.x, this.localBody.y, MERCHANT_POS.x, MERCHANT_POS.y) < MERCHANT_RADIUS;
  }

  buyFromMerchant() {
    const species = this.merchantSpecies();
    const frame = Math.floor(this.merchantHash(3) * 9);
    // Already wearing today's look: paying again used to just re-apply the
    // same sprite for 15 stars. Offer the gift-box star sink instead.
    if (this.selfData.species === species.key && this.selfData.frame === frame) {
      this.buyMerchantGiftBox();
      return;
    }
    if ((this.localScore || 0) < MERCHANT_COST) {
      this.showFloatingText(this.localBody.x, this.localBody.y - 30, `need ${MERCHANT_COST}⭐`);
      return;
    }
    this.selfData.species = species.key;
    this.selfData.frame = frame;
    const mTex = this.safeTexture(species.key, frame);
    this.localVisual.setTexture(mTex.key, mTex.frame);
    this.localBody.setTexture(mTex.key, mTex.frame);
    writeSave({ species: species.key, frame });
    this.net.updateAppearance(species.key, frame);
    this.awardPoint(-MERCHANT_COST, `🛒 bought the ${this.merchantLookName(species)}!`, this.localBody.x, this.localBody.y - 30, 'sell');
    this.incrementStat('merchantBuys');
    this.unsavedNote('New look bought');
  }

  // Once-a-day star sink: the merchant delivers a gift to every villager
  // (affinity only, no tier-up star bonus, so it can't pay for itself).
  buyMerchantGiftBox() {
    const today = this.questDayBucket();
    if (Number(loadSaveLive().merchantGiftBoxDay) === today) {
      this.showFloatingText(this.localBody.x, this.localBody.y - 30, "already sent today's gift boxes");
      return;
    }
    if ((this.localScore || 0) < MERCHANT_GIFT_BOX_COST) {
      this.showFloatingText(this.localBody.x, this.localBody.y - 30, `🎁 gift boxes for every villager: need ${MERCHANT_GIFT_BOX_COST}⭐`);
      return;
    }
    writeSave({ merchantGiftBoxDay: today });
    VILLAGERS.forEach((v) => this.bumpVillagerAffinity(v.id, MERCHANT_GIFT_BOX_AFFINITY));
    this.awardPoint(-MERCHANT_GIFT_BOX_COST, `🎁 gift boxes sent to all ${VILLAGERS.length} villagers!`, this.localBody.x, this.localBody.y - 30, 'sell');
    this.incrementStat('merchantGiftBoxes');
    this.unsavedNote('Gift boxes sent');
  }

  drawNPC() {
    const { x, y } = NPC_POS;
    const dy = npcFeetShift(2); const ly = y + 2 * dy; // sprite centre / label baseline after the W-06 shrink
    const sprite = this.add.sprite(x, y + dy, 'genius', 2).setScale(npcScale(2)).setDepth(y);
    this.npcSprite = sprite;
    this.tweens.add({ targets: sprite, y: y + dy - 4, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.add.text(x, ly - 36, NPC_NAME, {
      fontSize: '11px',
      fontFamily: 'monospace',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(y + 1);
    // Bubble bottom above the quest sign (one line, bottom at ly - 46), so the line never sits on "bring 4🪵".
    this.npcBubble = this.add.text(x, ly - 64, '', {
      fontSize: '11px',
      color: '#1c2430',
      backgroundColor: '#ffe066',
      padding: { x: 8, y: 5 },
      wordWrap: { width: 180 },
      align: 'center',
    }).setOrigin(0.5, 1).setDepth(99990).setVisible(false);
    this.npcQuestSign = this.add.text(x, ly - 46, '', {
      fontSize: '10px',
      fontFamily: 'monospace',
      color: '#6fbf73',
      stroke: '#000000',
      strokeThickness: 3,
      align: 'center',
      wordWrap: { width: 150 },
    }).setOrigin(0.5, 1).setDepth(y + 1); // cyc3 U: bottom-anchored above the name (centred at ly - 46 it covered the name by 7 px)
    this.questClaimedBucket = Number(loadSave().questClaimedBucket) || -1;
    this.triviaAnsweredBucket = Number(loadSave().triviaAnsweredBucket) || -1;
    this.refreshNpcQuestSign();
    this.addObstacleRect({ x: x - 10, y: y - 6, width: 20, height: 20 });
  }

  isNearNPC() {
    return Phaser.Math.Distance.Between(this.localBody.x, this.localBody.y, NPC_POS.x, NPC_POS.y) < NPC_RADIUS;
  }

  // ---------- NPC daily quest ----------
  // Same deterministic wall-clock-hash trick as weather/merchant: every
  // client computes the same "today's resource + amount" from the UTC
  // day number. Only "did I claim it" is stored locally — nothing synced.

  questDayBucket() {
    return Math.floor(Date.now() / 86400000);
  }

  // cycle0 L-01: the daily hour windows (Bug-Off, fishing tournament, Mystery Merchant) hash their start hour from the UTC day
  // number, so they are compared with the UTC hour: one clock for the day and the hour. Before, the local hour was used, so for
  // every player outside UTC the start hour was re-rolled in the middle of their day and an announced window could be cut
  // short or never come. The window is the same moment for everyone; the labels show it on the player's own clock.
  utcHour() { return new Date().getUTCHours(); }

  // The instant of a UTC hour counted from today's UTC midnight (24+ = tomorrow).
  utcHourDate(utcHour) { const d = new Date(); d.setUTCHours(utcHour, 0, 0, 0); return d; }

  // That instant as the player's clock reads it: "17:00" (or "17:30" in a half-hour time zone).
  localHourLabel(utcHour) { const d = this.utcHourDate(utcHour); return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; }

  windowLabel(startUtc, endUtc) { return `${this.localHourLabel(startUtc)}-${this.localHourLabel(endUtc)}`; }

  questHash(seed) {
    const bucket = this.questDayBucket();
    const h = Math.sin(bucket * 37.719 + seed * 91.345) * 24634.6345;
    return h - Math.floor(h);
  }

  todaysQuest() {
    const resource = QUEST_RESOURCES[Math.floor(this.questHash(1) * QUEST_RESOURCES.length)];
    const amount = 4 + Math.floor(this.questHash(2) * 5); // 4-8
    const reward = QUEST_REWARD_BASE + amount;
    return { resource, amount, reward };
  }

  isQuestClaimedToday() {
    return this.questClaimedBucket === this.questDayBucket();
  }

  refreshNpcQuestSign() {
    if (!this.npcQuestSign) return;
    const quest = this.todaysQuest();
    this.npcQuestSign.setText(
      this.isQuestClaimedToday()
        ? '✅ today\'s quest done!'
        : `📋 bring ${quest.amount}${quest.resource.icon} (+${quest.reward}⭐)`
    );
  }

  // ---------- daily scavenger hunt ----------
  // Same deterministic wall-clock-hash trick as the quest/merchant/trivia
  // for "where is it" — but "who found it first" needs real shared state,
  // so that part goes through net.js's claimScavengerSpot() transaction.

  todaysScavengerSpot() {
    const i = Math.floor(this.questHash(20) * SCAVENGER_SPOTS.length);
    return SCAVENGER_SPOTS[i];
  }

  setupScavengerHunt() {
    const spot = this.todaysScavengerSpot();
    this.scavengerMarker = this.add.text(spot.x, spot.y, '🔍', { fontSize: '20px' }).setOrigin(0.5).setDepth(spot.y);
    this.tweens.add({ targets: this.scavengerMarker, y: spot.y - 6, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.scavengerClaim = null;
    this.net.watchScavenger(this.questDayBucket(), (claim) => {
      this.scavengerClaim = claim;
      if (this.scavengerMarker) this.scavengerMarker.setVisible(!claim);
    });
  }

  isNearScavenger() {
    if (this.scavengerClaim) return false;
    const spot = this.todaysScavengerSpot();
    return Phaser.Math.Distance.Between(this.localBody.x, this.localBody.y, spot.x, spot.y) < SCAVENGER_RADIUS;
  }

  async claimScavenger() {
    const dayKey = this.questDayBucket();
    const result = await this.net.claimScavengerSpot(dayKey);
    if (result.success) {
      this.awardPoint(SCAVENGER_REWARD, `found it! +${SCAVENGER_REWARD}⭐`, this.localBody.x, this.localBody.y - 30, 'achievement');
      this.incrementStat('scavengerHuntsWon');
    } else {
      const who = (result.claim && result.claim.name) || 'someone';
      this.showFloatingText(this.localBody.x, this.localBody.y - 30, `already found by ${who}`);
    }
  }

  // ---------- NPC daily trivia ----------

  todaysTrivia() {
    const i = Math.floor(this.questHash(10) * TRIVIA_QUESTIONS.length);
    return TRIVIA_QUESTIONS[i];
  }

  isTriviaAnsweredToday() {
    return this.triviaAnsweredBucket === this.questDayBucket();
  }

  openTrivia() {
    if (!this.isNearNPC()) return;
    const overlay = document.getElementById('trivia-overlay');
    const body = document.getElementById('trivia-body');
    overlay.classList.remove('hidden');
    this.triviaOpen = true;
    body.innerHTML = '';
    if (this.isTriviaAnsweredToday()) {
      const p = document.createElement('p');
      p.textContent = "Come back tomorrow for a new question!";
      body.appendChild(p);
      return;
    }
    const trivia = this.todaysTrivia();
    const q = document.createElement('p');
    q.textContent = trivia.q;
    body.appendChild(q);
    trivia.choices.forEach((choice, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = choice;
      btn.addEventListener('click', () => this.answerTrivia(i));
      body.appendChild(btn);
    });
  }

  closeTrivia() {
    document.getElementById('trivia-overlay').classList.add('hidden');
    this.triviaOpen = false;
  }

  answerTrivia(choiceIndex) {
    const trivia = this.todaysTrivia();
    const body = document.getElementById('trivia-body');
    this.triviaAnsweredBucket = this.questDayBucket();
    writeSave({ triviaAnsweredBucket: this.triviaAnsweredBucket });
    body.innerHTML = '';
    const p = document.createElement('p');
    if (choiceIndex === trivia.correct) {
      p.textContent = `Correct! +${TRIVIA_REWARD} ⭐`;
      this.awardPoint(TRIVIA_REWARD, `trivia correct! +${TRIVIA_REWARD}⭐`, this.localBody.x, this.localBody.y - 30, 'achievement');
      this.incrementStat('triviaCorrect');
    } else {
      p.textContent = `Not quite — the answer was "${trivia.choices[trivia.correct]}". Come back tomorrow!`;
      SFX.deny();
    }
    body.appendChild(p);
  }

  talkToNPC() {
    if (!this.isQuestClaimedToday()) {
      const quest = this.todaysQuest();
      if ((this.resources[quest.resource.key] || 0) >= quest.amount) {
        this.resources[quest.resource.key] -= quest.amount;
        this.updateInventoryHUD();
        this.saveResources();
        this.questClaimedBucket = this.questDayBucket();
        writeSave({ questClaimedBucket: this.questClaimedBucket });
        this.refreshNpcQuestSign();
        this.awardPoint(quest.reward, `quest done! +${quest.reward}⭐`, this.localBody.x, this.localBody.y - 30, 'achievement');
        this.incrementStat('questsDone');
        return;
      }
    }
    const pool = (this.isRainWindow(Date.now()) && Math.random() < 0.5) ? NPC_RAIN_LINES
      : (this.isNpcNightHour() && Math.random() < 0.4) ? NPC_NIGHT_LINES : NPC_LINES;
    const line = this.pickFreshLine(pool, 'npc');
    this.npcBubble.setText(line).setVisible(true);
    if (this.npcBubbleTimer) this.npcBubbleTimer.remove();
    this.npcBubbleTimer = this.time.delayedCall(4200, () => this.npcBubble.setVisible(false));
    this.incrementStat('npcChats');
    SFX.pop();
  }

  isNpcNightHour() {
    const hour = new Date().getHours();
    return hour >= 21 || hour < 6;
  }

  // ---------- Second resident NPC (dockside, no quest, flavor only) ----------

  drawNPC2() {
    const { x, y } = NPC2_POS;
    const dy = npcFeetShift(2); const ly = y + 2 * dy;
    const sprite = this.add.sprite(x, y + dy, 'doge', 4).setScale(npcScale(2)).setDepth(y);
    this.npc2Sprite = sprite;
    this.tweens.add({ targets: sprite, y: y + dy - 4, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.add.text(x, ly - 36, NPC2_NAME, {
      fontSize: '11px',
      fontFamily: 'monospace',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(y + 1);
    this.npc2Bubble = this.add.text(x, ly - 50, '', {
      fontSize: '11px',
      color: '#1c2430',
      backgroundColor: '#ffe066',
      padding: { x: 8, y: 5 },
      wordWrap: { width: 180 },
      align: 'center',
    }).setOrigin(0.5, 1).setDepth(99990).setVisible(false);
    this.addObstacleRect({ x: x - 10, y: y - 6, width: 20, height: 20 });
  }

  isNearNPC2() {
    return Phaser.Math.Distance.Between(this.localBody.x, this.localBody.y, NPC2_POS.x, NPC2_POS.y) < NPC2_RADIUS;
  }

  talkToNPC2() {
    const pool = (this.isRainWindow(Date.now()) && Math.random() < 0.5) ? NPC2_RAIN_LINES
      : (this.isNpcNightHour() && Math.random() < 0.4) ? NPC2_NIGHT_LINES : NPC2_LINES;
    const line = this.pickFreshLine(pool, 'npc2');
    this.npc2Bubble.setText(line).setVisible(true);
    if (this.npc2BubbleTimer) this.npc2BubbleTimer.remove();
    this.npc2BubbleTimer = this.time.delayedCall(4200, () => this.npc2Bubble.setVisible(false));
    this.incrementStat('npc2Chats');
    SFX.pop();
  }

  // ---------- Residential Lane villagers (gift-affinity, AC-style) ----------

  // Affinity is cached in memory (the save is the source of truth, read
  // once) so the per-frame heart indicator never re-parses localStorage.
  villagerAffinity(id) {
    if (!this.villagerAffinityCache) {
      const saved = loadSave().villagerAffinity;
      this.villagerAffinityCache = (saved && typeof saved === 'object') ? { ...saved } : {};
    }
    return Math.max(0, Math.min(100, Number(this.villagerAffinityCache[id]) || 0));
  }

  villagerTier(id) {
    const a = this.villagerAffinity(id);
    if (a >= 50) return 3; // best friend
    if (a >= 25) return 2; // good friend
    if (a >= 10) return 1; // friend
    return 0; // acquaintance
  }

  bumpVillagerAffinity(id, amount) {
    const before = this.villagerAffinity(id);
    const after = Math.min(100, before + amount);
    const map = { ...(loadSave().villagerAffinity || {}) };
    map[id] = after;
    this.villagerAffinityCache = { ...map };
    writeSave({ villagerAffinity: map });
    return { before, after };
  }

  // 0-5 hearts; the first three line up with the friend/good/best tiers.
  villagerHearts(id) {
    const a = this.villagerAffinity(id);
    return VILLAGER_HEART_STEPS.filter((s) => a >= s).length;
  }

  // Villagers doze at their front door late at night.
  villagerIsAsleep(now = new Date()) {
    const hour = now.getHours();
    return hour >= 23 || hour < 6;
  }

  // Where a villager should be right now. Purely a function of wall-clock
  // time + villager id, so every client puts them in the same spot with
  // no network traffic.
  villagerSpotFor(v, now) {
    const doorX = v.hx + VILLAGER_HOUSE_W / 2;
    const doorY = v.hy + VILLAGER_HOUSE_H + 12;
    if (this.villagerIsAsleep(new Date(now))) return this.villagerUnhide(v, { x: doorX, y: doorY });
    return this.villagerUnhide(v, this.villagerYardSpot(v, now, doorX, doorY));
  }

  // The lane's front yards have trees in them; a spot just behind a
  // canopy would hide the villager, so step out in front of the trunk.
  villagerUnhide(v, spot) {
    this.villagerYardTrees = this.villagerYardTrees || {};
    if (!this.villagerYardTrees[v.id]) {
      this.villagerYardTrees[v.id] = TREES.filter(([tx, ty]) => tx > v.hx - 60 && tx < v.hx + VILLAGER_HOUSE_W + 60
        && ty > v.hy && ty < v.hy + VILLAGER_HOUSE_H + 120);
    }
    let { x, y } = spot;
    this.villagerYardTrees[v.id].forEach(([tx, ty]) => {
      if (Math.abs(x - tx) < 30 && y <= ty && y > ty - 52) y = ty + 8;
    });
    return { x, y };
  }

  villagerYardSpot(v, now, doorX, doorY) {
    const bucket = Math.floor(now / VILLAGER_WANDER_MS);
    let seed = bucket;
    for (let i = 0; i < v.id.length; i++) seed = (seed * 31 + v.id.charCodeAt(i)) | 0;
    const rand = (k) => {
      const h = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453;
      return h - Math.floor(h);
    };
    // Roughly one bucket in four they just hang out by the door.
    if (rand(0) < 0.25) return { x: doorX, y: doorY + 16 };
    return {
      x: v.hx - 16 + rand(1) * (VILLAGER_HOUSE_W + 32),
      y: v.hy + VILLAGER_HOUSE_H + 14 + rand(2) * 24,
    };
  }

  drawVillagers() {
    this.villagerBubbles = {};
    this.villagerState = {};
    VILLAGERS.forEach((v) => {
      const { hx: x, hy: y } = v;
      const w = VILLAGER_HOUSE_W;
      const h = VILLAGER_HOUSE_H;
      const g = this.bakedGfx();
      g.fillStyle(0xe8d9b5, 1).fillRect(x, y, w, h);
      g.fillStyle(v.roof, 1).fillTriangle(x - 8, y, x + w + 8, y, x + w / 2, y - 30);
      g.fillStyle(0x5a3a22, 1).fillRect(x + w / 2 - 8, y + h - 20, 16, 20);
      g.setDepth(y + h);
      g.bake();
      this.addObstacleRect({ x, y, width: w, height: h });

      const spot = this.villagerSpotFor(v, Date.now());
      const vTex = this.safeTexture(v.species, v.frame);
      const sprite = this.add.sprite(spot.x, spot.y, vTex.key, vTex.frame).setDepth(spot.y);
      const nameText = this.add.text(spot.x, spot.y - 26, v.name, {
        fontSize: '11px', fontFamily: 'monospace', color: '#ffffff', stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(spot.y + 1);
      const hearts = this.add.text(spot.x, spot.y - 41, '', {
        fontSize: '10px', fontFamily: 'monospace', color: '#ff7aa8', stroke: '#1c2430', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(spot.y + 1).setVisible(false);
      // Bubble sits above the hearts row (which sits above the name tag),
      // on a high depth so players walking past never cover it.
      this.villagerBubbles[v.id] = this.add.text(spot.x, spot.y - 50, '', {
        fontSize: '11px', color: '#1c2430', backgroundColor: '#ffe066', padding: { x: 8, y: 5 },
        wordWrap: { width: 170 }, align: 'center',
      }).setOrigin(0.5, 1).setDepth(99990).setVisible(false);
      this.villagerState[v.id] = {
        sprite, nameText, hearts, x: spot.x, y: spot.y, bucket: null, tween: null,
        phase: Math.random() * Math.PI * 2, heartsShown: null,
      };
    });
  }

  // Called every frame (from updateGiftHint): eases each villager toward
  // their scheduled spot, bobs them gently, and keeps the name tag,
  // hearts and speech bubble glued above them.
  updateVillagers() {
    if (!this.villagerState) return;
    const now = Date.now();
    const asleep = this.villagerIsAsleep(new Date(now));
    const key = `${Math.floor(now / VILLAGER_WANDER_MS)}-${asleep}`;
    const t = this.time.now;
    const px = this.localBody ? this.localBody.x : -99999;
    const py = this.localBody ? this.localBody.y : -99999;
    VILLAGERS.forEach((v) => {
      const st = this.villagerState[v.id];
      if (!st) return;
      if (st.bucket !== key) {
        st.bucket = key;
        const target = this.villagerSpotFor(v, now);
        if (st.tween) st.tween.stop();
        st.tween = null;
        const dist = Phaser.Math.Distance.Between(st.x, st.y, target.x, target.y);
        if (dist > 1) {
          st.sprite.setFlipX(target.x < st.x);
          st.tween = this.tweens.add({
            targets: st, x: target.x, y: target.y,
            duration: Math.max(400, dist * 28), ease: 'Sine.easeInOut',
            onComplete: () => { st.tween = null; },
          });
        }
      }
      // Hop while walking, slow breathe while idle, still if reduced motion.
      let lift = 0;
      if (!reduceMotion && !asleep) {
        lift = st.tween
          ? Math.abs(Math.sin(t / 110 + st.phase)) * 3
          : (Math.sin(t / 500 + st.phase) + 1) * 1.5;
      }
      st.sprite.setPosition(st.x, st.y - lift).setDepth(st.y).setAlpha(asleep ? 0.75 : 1);
      st.nameText.setPosition(st.x, st.y - 26).setDepth(st.y + 1);
      st.hearts.setPosition(st.x, st.y - 41).setDepth(st.y + 1);
      this.villagerBubbles[v.id].setPosition(st.x, st.y - 50);

      const near = Phaser.Math.Distance.Between(px, py, st.x, st.y) < VILLAGER_HEARTS_RADIUS;
      st.hearts.setVisible(near);
      if (near) {
        const n = asleep ? -1 : this.villagerHearts(v.id);
        if (n !== st.heartsShown) {
          st.heartsShown = n;
          st.hearts.setText(asleep ? 'z z z' : '♥'.repeat(n) + '♡'.repeat(VILLAGER_HEART_STEPS.length - n));
          st.hearts.setColor(asleep ? '#cfd8ff' : '#ff7aa8');
        }
      }
    });
  }

  villagerPos(v) {
    const st = this.villagerState && this.villagerState[v.id];
    if (st) return { x: st.x, y: st.y };
    return { x: v.hx + VILLAGER_HOUSE_W / 2, y: v.hy + VILLAGER_HOUSE_H + 30 };
  }

  findNearestVillager() {
    if (!this.localBody) return null;
    let nearest = null;
    let nearestDist = Infinity;
    VILLAGERS.forEach((v) => {
      const p = this.villagerPos(v);
      const d = Phaser.Math.Distance.Between(this.localBody.x, this.localBody.y, p.x, p.y);
      if (d < VILLAGER_RADIUS && d < nearestDist) { nearest = v; nearestDist = d; }
    });
    return nearest;
  }

  showVillagerBubble(v, text, ms = 4200) {
    const bubble = this.villagerBubbles && this.villagerBubbles[v.id];
    if (!bubble) return;
    bubble.setText(text).setVisible(true);
    this.villagerBubbleTimers = this.villagerBubbleTimers || {};
    if (this.villagerBubbleTimers[v.id]) this.villagerBubbleTimers[v.id].remove();
    this.villagerBubbleTimers[v.id] = this.time.delayedCall(ms, () => bubble.setVisible(false));
    // Turn to face the player while talking.
    const st = this.villagerState && this.villagerState[v.id];
    if (st && this.localBody) st.sprite.setFlipX(this.localBody.x < st.x);
  }

  // Random line from a pool, never the same line twice in a row per speaker.
  pickFreshLine(pool, speaker) {
    this.lastLineBySpeaker = this.lastLineBySpeaker || {};
    let line = pool[Math.floor(Math.random() * pool.length)];
    if (pool.length > 1 && line === this.lastLineBySpeaker[speaker]) {
      line = pool[(pool.indexOf(line) + 1) % pool.length];
    }
    this.lastLineBySpeaker[speaker] = line;
    return line;
  }

  villagerLinePool(v) {
    const now = new Date();
    const hour = now.getHours();
    const extra = VILLAGER_PERSONALITY_LINES[v.personality] || {};
    if (this.villagerIsAsleep(now)) return (extra.night || []).concat(VILLAGER_SLEEP_LINES);
    // Weather/time-of-day lines are mixed in, not a replacement.
    if (extra.rain && this.isRainWindow(now.getTime()) && Math.random() < 0.5) return extra.rain;
    const slot = hour < 11 ? extra.morning : (hour >= 18 ? extra.evening : null);
    if (slot && Math.random() < 0.35) return slot;
    const base = v.lines.concat(extra.any || []);
    return this.villagerTier(v.id) >= 2 ? base.concat(v.closeLines) : base;
  }

  talkToVillager(v) {
    // First chat of the (local) day: a personal greeting and a small
    // affinity bump, capped at once per villager per day.
    const today = new Date().toISOString().slice(0, 10);
    const talkDays = { ...(loadSave().villagerTalkDay || {}) };
    let line;
    if (talkDays[v.id] !== today && !this.villagerIsAsleep()) {
      talkDays[v.id] = today;
      writeSave({ villagerTalkDay: talkDays });
      this.bountyEvent('town:wave'); // ID-18: the first hello of the day to this neighbor (talking again does not count)
      const beforeTier = this.villagerTier(v.id);
      this.bumpVillagerAffinity(v.id, VILLAGER_DAILY_TALK_AFFINITY);
      const afterTier = this.villagerTier(v.id);
      const who = (this.localNameText && this.localNameText.text) || 'neighbor';
      line = (VILLAGER_GREETINGS[v.personality] || 'Oh, hi, {name}!').replace('{name}', who);
      if (afterTier > beforeTier) {
        this.awardPoint(5, `${v.name} is now a ${VILLAGER_TIER_NAMES[afterTier]}! +5⭐`, this.localBody.x, this.localBody.y - 30, 'achievement');
      } else {
        this.showFloatingText(this.localBody.x, this.localBody.y - 30, `+♥ ${v.name}`);
      }
    } else {
      line = this.pickFreshLine(this.villagerLinePool(v), v.id);
    }
    if (this.isBirthdayFor(v) && !this.birthdayClaimed(v)) {
      line = "🎂 It's my birthday today! A little gift would make it perfect.";
    }
    if (v.id === 'mocha') { const el = this.errandTalk(); if (el) line = el; } // ID-12: the parcel errand (a step taken is always reported)
    this.showVillagerBubble(v, line);
    SFX.pop();
  }

  // ---------- phone: collapsible "In town" panel ----------
  // On phone widths the panel (player list + every button + status lines) is
  // tall and covered half the screen, so it starts collapsed to a small chip
  // (players + trophies) and expands on tap. Desktop is unchanged (the CSS only
  // applies at <= 600px). The choice is remembered under its own
  // localStorage key, separate from the save, and the expanded height is
  // capped so the panel can never run into the chat bar / controls below.
  setupPanelCollapse() {
    const panel = document.getElementById('player-list-panel');
    const toggle = document.getElementById('panel-toggle');
    if (!panel || !toggle) return;
    const mq = window.matchMedia(PANEL_PHONE_QUERY);
    let stored = null;
    try { stored = localStorage.getItem(PANEL_COLLAPSE_KEY); } catch (e) { /* storage blocked */ }
    // Default on phones: collapsed.
    this.panelCollapsed = stored === null ? true : stored === '1';
    const label = () => {
      const n = document.querySelectorAll('#player-list li').length;
      const a = (document.getElementById('achievement-count') || {}).textContent || '0';
      const cap = (document.getElementById('achievement-cap') || {}).textContent || '';
      const collapsed = panel.classList.contains('collapsed');
      const text = collapsed ? `👥 ${n} · 🏆 ${a}${cap ? '/' + cap : ''} ▾` : '✕ Close ▴';
      if (toggle.textContent !== text) toggle.textContent = text;
      toggle.setAttribute('aria-expanded', String(!collapsed));
      toggle.setAttribute('aria-label', collapsed ? 'Open the town panel' : 'Close the town panel');
    };
    // Keep the expanded panel clear of the chat bar (and so the controls) below it.
    const fit = () => {
      if (!mq.matches || panel.classList.contains('collapsed')) { panel.style.maxHeight = ''; return; }
      // Stay clear of anything below the panel that overlaps it horizontally
      // (chat bar, joystick, action buttons, hint pills).
      const pr = panel.getBoundingClientRect();
      let limit = window.innerHeight;
      ['chat-panel', 'joystick', 'action-buttons', 'fish-hint-btn', 'gift-hint-btn', 'dig-hole-hint', 'isles-sign-hint', 'postcards-hint'].forEach((id) => {
        const el = document.getElementById(id);
        if (!el || el.classList.contains('hidden') || getComputedStyle(el).display === 'none') return;
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.left < pr.right && r.right > pr.left && r.top > pr.top) limit = Math.min(limit, r.top);
      });
      const room = Math.floor(limit - pr.top - 8);
      panel.style.maxHeight = `${Math.max(72, Math.min(Math.floor(window.innerHeight * 0.6), room))}px`;
    };
    const apply = () => {
      panel.classList.toggle('collapsed', mq.matches && this.panelCollapsed);
      label();
      fit();
    };
    this.applyPanelCollapse = apply; // R4 D4: build mode folds the panel for view only (no saved-preference write)
    this.setPanelCollapsed = (collapsed) => {
      this.buildFoldedPanel = false;
      this.panelCollapsed = !!collapsed;
      try { localStorage.setItem(PANEL_COLLAPSE_KEY, this.panelCollapsed ? '1' : '0'); } catch (e) { /* ignore */ }
      apply();
    };
    toggle.addEventListener('click', () => this.setPanelCollapsed(!panel.classList.contains('collapsed')));
    if (mq.addEventListener) mq.addEventListener('change', apply); else if (mq.addListener) mq.addListener(apply);
    window.addEventListener('resize', fit);
    // The chip's text follows the player count and trophy count (cheap: DOM events only).
    const obs = new MutationObserver(label);
    obs.observe(document.getElementById('player-list'), { childList: true });
    const ac = document.getElementById('achievement-count');
    if (ac) obs.observe(ac, { childList: true, characterData: true, subtree: true });
    const cap = document.getElementById('achievement-cap');
    if (cap) obs.observe(cap, { childList: true, characterData: true, subtree: true });
    // Hint pills (fish / gift / dig hole) appear and disappear: refit so an expanded panel never sits on one.
    const hintObs = new MutationObserver(fit);
    ['fish-hint-btn', 'gift-hint-btn', 'dig-hole-hint', 'isles-sign-hint', 'postcards-hint'].forEach((id) => { const el = document.getElementById(id); if (el) hintObs.observe(el, { attributes: true, attributeFilter: ['class'] }); });
    // Expanded content grows/shrinks (e.g. settings section): refit.
    if (window.ResizeObserver && document.getElementById('chat-panel')) new ResizeObserver(fit).observe(document.getElementById('chat-panel'));
    apply();
  }

  // ---------- daily checklist ----------
  setupDailies() {
    document.getElementById('dailies-btn').addEventListener('click', () => { if (this.canAct()) this.openDailies(); });
    document.getElementById('dailies-close-btn').addEventListener('click', () => this.closeDailies());
    const overlay = document.getElementById('dailies-overlay');
    overlay.addEventListener('click', (e) => { if (e.target === overlay) this.closeDailies(); });
    this.input.keyboard.on('keydown-J', () => { if (this.dailiesOpen) this.closeDailies(); else if (this.canAct()) this.openDailies(); });
    this.refreshDailies();
    this.time.addEvent({ delay: 20000, loop: true, callback: () => this.refreshDailies() });
  }

  // Today's chores, each {id, icon, label, detail, status: 'done'|'todo'|'later'|'na', optional?}.
  // 'na' items (no birthday today, empty home plot) don't count.
  dailyItems() {
    const day = this.questDayBucket();
    const items = [];
    const quest = this.todaysQuest();
    items.push({ id: 'quest', icon: '🧪', label: "Professor Byte's request", detail: `${quest.amount} ${quest.resource.icon} → ${quest.reward}⭐`, status: this.isQuestClaimedToday() ? 'done' : 'todo' });
    items.push({ id: 'trivia', icon: '❓', label: "Professor Byte's trivia", detail: 'answer today\'s question', status: this.isTriviaAnsweredToday() ? 'done' : 'todo' });
    const mailLeft = this.unclaimedLetters().length;
    items.push({ id: 'fish', icon: '🎣', label: 'Catch a fish', detail: this.fishlog.lastDay === day ? 'logged today' : 'cast at a pond', status: this.fishlog.lastDay === day ? 'done' : 'todo' });
    items.push({ id: 'mail', icon: '📬', label: 'Collect your letters', detail: mailLeft ? `${mailLeft} waiting at the mailbox` : 'all collected', status: mailLeft ? 'todo' : 'done' });
    const weedsLeft = this.weedsLeft();
    items.push({ id: 'weeds', icon: '🌿', label: 'Pull the weeds', detail: `${weedsLeft} left`, status: weedsLeft ? 'todo' : 'done' });
    const bo = this.bugOffRecord();
    const live = this.isBugOffTime();
    // Once the window has passed without a medal it can no longer be done today:
    // 'missed' is excluded from the total so it can't lock you out of the bonus.
    const after = !live && this.bugOffPhase() === 'after';
    items.push({ id: 'bugoff', icon: '🦋', label: 'Bug-Off (catch 5)', detail: live ? `LIVE — ${bo.count}/5 caught` : `${bo.count} caught (window ${this.windowLabel(this.bugOffStartHour(), this.bugOffStartHour() + BUGOFF_HOURS)}${after ? ', over for today' : ''})`, status: bo.tier >= 1 ? 'done' : (live ? 'todo' : (after ? 'missed' : 'later')) });
    const bday = this.todaysBirthdayVillager();
    items.push({ id: 'birthday', icon: '🎂', label: bday ? `${bday.name}'s birthday` : 'Birthdays', detail: bday ? 'bring a gift' : 'none today', status: !bday ? 'na' : (this.birthdayClaimed(bday) ? 'done' : 'todo') });
    items.push({ id: 'home', icon: '🏡', label: 'Visit your home plot', detail: this.homeCozy() ? `cozy ${this.homeCozy()}` : 'place a crafted good first', status: this.homeCozy() === 0 ? 'na' : (this.home.paidDay === day ? 'done' : 'todo') });
    return items;
  }

  dailyProgress() {
    const items = this.dailyItems().filter((i) => i.status !== 'na' && i.status !== 'missed');
    return { done: items.filter((i) => i.status === 'done').length, total: items.length };
  }

  dailiesRecord() {
    const rec = loadSave().dailies;
    const ok = rec && typeof rec === 'object' && !Array.isArray(rec);
    return { day: ok ? cleanCount(rec.day) : 0, paid: !!(ok && rec.day === this.questDayBucket() && rec.paid === true), days: ok ? cleanCount(rec.days) : 0 };
  }

  // Cheap poll: updates the panel button and pays the all-done bonus once a day.
  refreshDailies() {
    const { done, total } = this.dailyProgress();
    const btn = document.getElementById('dailies-btn');
    const label = `📋 Today ${done}/${total}`;
    if (btn && btn.textContent !== label) btn.textContent = label;
    if (total > 0 && done === total) {
      const rec = this.dailiesRecord();
      if (!rec.paid) {
        // Save first, then pay, so a reload can never double-pay.
        writeSave({ dailies: { day: this.questDayBucket(), paid: true, days: rec.days + 1 } });
        this.awardPoint(DAILY_BONUS, `📋 All chores done! +${DAILY_BONUS} ⭐`, this.localBody.x, this.localBody.y - 50, 'achievement');
        this.addChatLine({ system: true, text: `📋 Every daily chore is done — +${DAILY_BONUS} ⭐ bonus!` });
        this.incrementStat('dailyAllDone');
      }
    }
    if (this.dailiesOpen) this.renderDailies();
  }

  openDailies() {
    this.dailiesOpen = true;
    document.getElementById('dailies-overlay').classList.remove('hidden');
    this.refreshDailies(); // re-renders while open
  }

  closeDailies() {
    this.dailiesOpen = false;
    document.getElementById('dailies-overlay').classList.add('hidden');
  }

  renderDailies() {
    const list = document.getElementById('dailies-list');
    list.innerHTML = '';
    const mark = { done: '✅', todo: '⬜', later: '🕒', na: '➖', missed: '➖' };
    this.dailyItems().forEach((it) => {
      const li = document.createElement('li');
      li.className = `daily-${it.status}`;
      li.dataset.daily = it.id;
      li.dataset.status = it.status;
      const t = document.createElement('span');
      t.textContent = `${mark[it.status]} ${it.icon} ${it.label}`;
      const d = document.createElement('small');
      d.textContent = it.detail;
      li.append(t, d);
      list.appendChild(li);
    });
    const { done, total } = this.dailyProgress();
    const rec = this.dailiesRecord();
    document.getElementById('dailies-summary').textContent = done === total && total > 0
      ? `All ${total} chores done today! ${rec.paid ? `(+${DAILY_BONUS} ⭐ collected)` : ''} Days completed: ${rec.days}`
      : `${done}/${total} done — finish them all for a +${DAILY_BONUS} ⭐ bonus. Days completed: ${rec.days}`;
    this.renderBounties();
  }

  // ---------- ID-18 Town daily bounties (cycle 8 S; spec IDEAS.md "ID-09 / ID-18 implementation specs") ----------
  // Three small errands a UTC day (MMGameDay.utcKey, L-08), the same for everyone, shown in the Dailies panel. Stars only (10-30 each),
  // claimed by the player with a button, never counted in the "Today n/m" chores or the all-chores bonus. No timers, nothing expires:
  // another day simply brings new rows. Save key `bounty` = { d, s: { id: [count, claimed 0|1] } }, written BEFORE any star is paid.
  townBounties() {
    const d = townUtcKey();
    if (typeof MMBounties === 'undefined' || !d) return [];
    if (!this.bountyCache || this.bountyCache.d !== d) this.bountyCache = { d, list: MMBounties.forDate(d, 'town', MMBounties.TOWN_POOL) };
    return this.bountyCache.list;
  }

  bountyRecord() {
    return MMBounties.cleanTown(loadSave().bounty, townUtcKey(), this.townBounties());
  }

  bountyEvent(type) {
    const b = this.townBounties().find((x) => x.event === type);
    if (!b) return;
    const rec = this.bountyRecord();
    const [count, claimed] = rec.s[b.id];
    if (count >= b.goal) return;
    const st = MMBounties.progress(b, { count, done: false, claimed: claimed === 1 }, { type });
    rec.s[b.id] = [st.count, claimed];
    writeSave({ bounty: rec });
    if (st.done) this.showFloatingText(this.localBody.x, this.localBody.y - 58, `📜 ${b.text}: done! Claim it in 📋 Today`);
    if (this.dailiesOpen) this.renderDailies();
  }

  claimBounty(id) {
    const b = this.townBounties().find((x) => x.id === id);
    if (!b) return false;
    const rec = this.bountyRecord();
    const [count, claimed] = rec.s[id];
    const r = MMBounties.claim(b, { count, done: count >= b.goal, claimed: claimed === 1 });
    if (!r || !(r.reward.stars > 0)) return false;
    rec.s[id] = [r.state.count, 1];
    writeSave({ bounty: rec }); // save first, then pay, so a reload can never pay twice
    this.awardPoint(r.reward.stars, `📜 ${b.text}: +${r.reward.stars} ⭐`, this.localBody.x, this.localBody.y - 50, 'achievement');
    if (this.dailiesOpen) this.renderDailies();
    return true;
  }

  renderBounties() {
    const list = document.getElementById('bounty-list');
    if (!list) return;
    list.innerHTML = '';
    const bounties = this.townBounties();
    const rec = bounties.length ? this.bountyRecord() : null;
    bounties.forEach((b) => {
      const [count, claimed] = rec.s[b.id];
      const li = document.createElement('li');
      li.dataset.bounty = b.id;
      li.dataset.status = claimed ? 'claimed' : (count >= b.goal ? 'done' : 'todo');
      const t = document.createElement('span');
      t.className = 'bounty-text';
      t.textContent = b.text;
      const n = document.createElement('span');
      n.className = 'bounty-count';
      n.textContent = `${count}/${b.goal}`;
      const r = document.createElement('span');
      r.className = 'bounty-reward';
      r.textContent = `+${b.reward.stars} ⭐`;
      li.append(t, n, r);
      if (claimed) {
        const c = document.createElement('span');
        c.className = 'bounty-claimed';
        c.textContent = 'Claimed';
        li.appendChild(c);
      } else if (count >= b.goal) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'bounty-claim';
        btn.textContent = 'Claim';
        btn.setAttribute('aria-label', `Claim ${b.reward.stars} stars for: ${b.text}`);
        btn.addEventListener('click', () => this.claimBounty(b.id));
        li.appendChild(btn);
      }
      list.appendChild(li);
    });
    const sec = document.getElementById('bounty-section');
    if (sec) sec.classList.toggle('hidden', bounties.length === 0);
  }

  // ---------- birthdays ----------
  setupBirthdays() {
    this.loadBirthdays();
    this.refreshBirthdays();
    this.time.addEvent({ delay: 30000, loop: true, callback: () => this.refreshBirthdays() });
  }

  // Sanitised: claimed ids are short strings (last 40 kept), guests real villager ids.
  loadBirthdays() {
    const rec = loadSave().birthdays;
    const ok = rec && typeof rec === 'object' && !Array.isArray(rec);
    this.birthdayClaimedIds = new Set(ok && Array.isArray(rec.claimed) ? rec.claimed.filter((x) => typeof x === 'string' && x.length < 40).slice(-40) : []);
    this.birthdayGuests = new Set(ok && Array.isArray(rec.guests) ? rec.guests.filter((id) => VILLAGERS.some((v) => v.id === id)) : []);
  }

  todaysBirthdayVillager() {
    const i = birthdayIndexForDay(this.questDayBucket());
    return i >= 0 ? VILLAGERS[i] : null;
  }

  isBirthdayFor(v) {
    const b = this.todaysBirthdayVillager();
    return !!b && b.id === v.id;
  }

  birthdayClaimed(v) {
    return this.birthdayClaimedIds.has(`${this.questDayBucket()}:${v.id}`);
  }

  // Name tags + the panel line; only touches text when it changed.
  refreshBirthdays() {
    const day = this.questDayBucket();
    const today = this.todaysBirthdayVillager();
    VILLAGERS.forEach((v) => {
      const st = this.villagerState && this.villagerState[v.id];
      if (!st) return;
      const want = today && today.id === v.id ? `🎂 ${v.name}` : v.name;
      if (st.nameText.text !== want) st.nameText.setText(want);
    });
    const el = document.getElementById('birthday-line');
    if (!el) return;
    if (today) {
      el.textContent = `🎂 ${today.name}'s birthday today!${this.birthdayClaimedIds.has(`${day}:${today.id}`) ? ' ✓' : ''}`;
    } else {
      let best = null; let bestIn = Infinity;
      VILLAGERS.forEach((v, i) => {
        const inDays = (((i * 2 + 1) % BIRTHDAY_CYCLE_DAYS) - (day % BIRTHDAY_CYCLE_DAYS) + BIRTHDAY_CYCLE_DAYS) % BIRTHDAY_CYCLE_DAYS;
        if (inDays > 0 && inDays < bestIn) { best = v; bestIn = inDays; }
      });
      el.textContent = best ? `🎂 Next: ${best.name} in ${bestIn}d` : '';
    }
  }

  // Returns true when the gift press was handled as a birthday gift.
  giveBirthdayGift(v) {
    const likedKey = v.likes.find((key) => (this.resources[key] || 0) > 0);
    let good = null;
    if (!likedKey) {
      good = RECIPES.filter((r) => (this.craftedGoods[r.id] || 0) > 0).sort((a, b) => a.value - b.value)[0] || null;
    }
    if (!likedKey && !good) {
      const wants = v.likes.map((k) => VILLAGER_GIFT_ICONS[k] || k).join(' or ');
      this.showFloatingText(this.localBody.x, this.localBody.y - 30, `It's ${v.name}'s birthday! Bring ${wants} (or a crafted good)`);
      return true;
    }
    const id = `${this.questDayBucket()}:${v.id}`;
    this.birthdayClaimedIds.add(id);
    this.birthdayGuests.add(v.id);
    // Save the claim before paying out so a reload can never double-pay.
    writeSave({ birthdays: { claimed: [...this.birthdayClaimedIds].slice(-40), guests: [...this.birthdayGuests] } });
    let icon;
    let bonus = BIRTHDAY_STARS;
    if (likedKey) {
      this.resources[likedKey] -= 1;
      icon = VILLAGER_GIFT_ICONS[likedKey] || '';
    } else {
      this.craftedGoods[good.id] -= 1;
      icon = good.icon;
      bonus += Math.floor(good.value / 2);
    }
    this.updateInventoryHUD();
    this.saveResources();
    const beforeTier = this.villagerTier(v.id);
    this.bumpVillagerAffinity(v.id, 8 + BIRTHDAY_EXTRA_AFFINITY);
    const afterTier = this.villagerTier(v.id);
    this.showVillagerBubble(v, `${icon} 🎂 Best birthday ever! Thank you!`);
    this.awardPoint(bonus, `🎂 ${v.name}'s party! +${bonus} ⭐`, this.localBody.x, this.localBody.y - 30, 'achievement');
    if (afterTier > beforeTier) this.addChatLine({ system: true, text: `💞 ${v.name} is now a ${VILLAGER_TIER_NAMES[afterTier]}!` });
    this.incrementStat('birthdayGifts');
    this.incrementStat('giftsGiven');
    this.refreshBirthdays();
    SFX.pop();
    return true;
  }

  giveNearestVillagerGift() {
    const v = this.findNearestVillager();
    if (!v) return;
    if (this.isBirthdayFor(v) && !this.birthdayClaimed(v) && this.giveBirthdayGift(v)) return;
    const likedKey = v.likes.find((key) => (this.resources[key] || 0) > 0);
    if (!likedKey) {
      const wants = v.likes.map((k) => VILLAGER_GIFT_ICONS[k] || k).join(' or ');
      this.showFloatingText(this.localBody.x, this.localBody.y - 30, `${v.name} would love ${wants}`);
      return;
    }
    this.resources[likedKey] -= 1;
    this.updateInventoryHUD();
    this.saveResources();
    const beforeTier = this.villagerTier(v.id);
    this.bumpVillagerAffinity(v.id, 8);
    const afterTier = this.villagerTier(v.id);
    const icon = VILLAGER_GIFT_ICONS[likedKey] || '';
    if (afterTier > beforeTier) {
      const tierName = VILLAGER_TIER_NAMES[afterTier];
      this.showVillagerBubble(v, `${icon} For me?! We're ${tierName}s now!`);
      this.awardPoint(5, `${v.name} is now a ${tierName}! +5⭐`, this.localBody.x, this.localBody.y - 30, 'achievement');
    } else {
      this.showVillagerBubble(v, `${icon} ${v.name} loves it!`);
      this.awardPoint(1, '+1 ⭐', this.localBody.x, this.localBody.y - 30);
    }
    this.incrementStat('giftsGiven');
    SFX.pop();
  }

  setupGiftHint() {
    const btn = document.getElementById('gift-hint-btn');
    if (!btn) return;
    btn.addEventListener('click', () => { if (this.canAct()) this.giveNearestVillagerGift(); });
  }

  updateGiftHint() {
    // TN2 low tier: the villagers ease every third frame (their tags move with them, so nothing drifts apart)
    this.npcTick = ((this.npcTick || 0) + 1) % TOWN_PERF.npcEvery;
    if (this.npcTick === 0) this.updateVillagers();
    const btn = this.hintEl('gift-hint-btn');
    if (!btn) return;
    const v = (!this.inUnderground && !this.inRealm && !this.buildMode) ? this.findNearestVillager() : null;
    this.setHintHidden(btn, !v);
    if (!v) return;
    // e.g. "🎁 Gift Mocha 🍎🌸" — dimmed when nothing they like is in the bag. The label is built once per villager (cycle1 L-09).
    if (this._giftHintFor !== v) {
      this._giftHintFor = v;
      this._giftHintLabel = `🎁 Gift ${v.name} ${v.likes.map((k) => VILLAGER_GIFT_ICONS[k] || k).join('')}`;
    }
    const label = this._giftHintLabel;
    if (btn.textContent !== label) btn.textContent = label;
    let has = false;
    for (let i = 0; i < v.likes.length && !has; i++) has = (this.resources[v.likes[i]] || 0) > 0;
    const op = has ? '' : '0.6';
    if (btn.style.opacity !== op) btn.style.opacity = op;
  }

  drawCampfire() {
    const { x, y } = CAMPFIRE_POS;
    const logs = this.bakedGfx(-1);
    logs.fillStyle(0x6b4226, 1);
    logs.fillRect(x - 16, y - 3, 32, 6);
    logs.fillRect(x - 4, y - 14, 8, 28);
    logs.bake();

    const flame = this.add.circle(x, y - 8, 9, 0xffb238).setDepth(-1);
    const flameInner = this.add.circle(x, y - 8, 5, 0xffe066).setDepth(-1);
    this.tweens.add({ targets: [flame, flameInner], scale: { from: 0.85, to: 1.15 }, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    this.kkSign = this.add.text(x, y - 42, '🎸 K.K. Slider is playing!', { fontSize: '12px' })
      .setOrigin(0.5)
      .setDepth(y + 1)
      .setVisible(false);
    this.kkNotes = ['🎵', '🎶', '🎵'].map((sym, i) => this.add.text(x - 16 + i * 16, y - 10, sym, { fontSize: '13px' }).setOrigin(0.5).setDepth(y + 1).setVisible(false));
  }

  // ---------- K.K. Slider campfire concert ----------
  // A real AC staple: a live show at a fixed time of day, local to each
  // player's own clock (same source as day/night) rather than anything
  // synced over the network. One ⭐ bonus per show, guarded by a
  // per-window flag so you can't just stand there and farm it.

  isConcertTime() {
    const hour = new Date().getHours();
    return hour >= KK_CONCERT_START_HOUR && hour < KK_CONCERT_END_HOUR;
  }

  // One key per show = per local evening (cycle0 L-02). It used to end in the hour, and the show runs two hours, so the "once per
  // show" bonus paid again at 20:00 while the message said "already enjoyed tonight's show".
  concertWindowKey() {
    const now = new Date();
    return `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  }

  isNearCampfire() {
    return Math.hypot(this.localBody.x - CAMPFIRE_POS.x, this.localBody.y - CAMPFIRE_POS.y) < CAMPFIRE_RADIUS;
  }

  updateConcert(time) {
    if (time - (this.lastConcertCheckAt || 0) < 1000) return;
    this.lastConcertCheckAt = time;
    const playing = this.isConcertTime();
    if (this.kkSign) this.kkSign.setVisible(playing);
    this.kkNotes.forEach((n, i) => {
      n.setVisible(playing);
      if (playing) n.y = CAMPFIRE_POS.y - 10 + Math.sin(time / 300 + i) * 4;
    });
  }

  enjoyConcert() {
    const key = this.concertWindowKey();
    const seen = typeof this.kkEnjoyedWindow === 'string' ? this.kkEnjoyedWindow : '';
    if (seen === key || seen.startsWith(key + '-')) { // key + '-<hour>': a save written by the older per-hour key, same evening
      this.showFloatingText(this.localBody.x, this.localBody.y - 30, 'already enjoyed tonight\'s show');
      return;
    }
    this.kkEnjoyedWindow = key;
    writeSave({ kkEnjoyedWindow: key });
    this.awardPoint(2, '🎶 +2 ⭐ enjoyed the show!', this.localBody.x, this.localBody.y - 30);
    this.triggerEmote(1);
  }

  drawDigHole() {
    const { x, y } = DIG_HOLE_POS;
    const g = this.bakedGfx(-1);
    g.fillStyle(0x1a1410, 1).fillEllipse(x, y, 42, 26);
    g.fillStyle(0x100b08, 1).fillEllipse(x, y, 28, 16);
    g.bake();
    this.add.text(x, y - 26, '⛏️ Hole', { fontSize: '12px' }).setOrigin(0.5).setDepth(y + 1);
  }

  drawDoor(x, y, label, color) {
    const gd = this.bakedGfx(y - 1);
    gd.fillStyle(0x3a2a1a, 1).fillRect(x - 16, y - 46, 32, 46);
    gd.fillStyle(color, 0.85).fillRect(x - 12, y - 42, 24, 38);
    gd.fillStyle(0xffffff, 0.9).fillCircle(x + 7, y - 22, 2);
    const g = gd.bake();
    this.add.text(x, y - 56, label, { fontSize: '12px' }).setOrigin(0.5).setDepth(y + 1);
    this.tweens.add({
      targets: g,
      alpha: { from: 0.8, to: 1 },
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  drawDoors() {
    PORTALS.forEach((p) => this.drawDoor(p.x, p.y, p.label, p.color));
  }

  drawForestRing() {
    this.treeGraphics = [];
    this.treeFruit = {};
    TREES.forEach(([x, y]) => this.drawTree(x, y));
  }

  // Each tree used to be its own Graphics object, re-tessellating 5 shapes
  // every frame (58+ of them, plus fruit overlays) — the single biggest
  // Graphics cost in the scene. The art is now baked once into a few
  // shared textures (3 deterministic canopy tints + a fruit overlay) and
  // each tree is a plain Image. The origin is the old Graphics' local
  // (0, 0), so position, y-sort depth, and the chop-shake rotation pivot
  // are all exactly what they were; treeGraphics/treeFruit keep their
  // shape (index -> object with setAngle/setVisible) for the chop code.
  bakeTreeTextures() {
    if (this.textures.exists('tree_0')) return;
    const ox = TREE_TEX.ox;
    const oy = TREE_TEX.oy;
    const tints = [
      [0x2f7a40, 0x3f8f4f, 0x4fa85f, 0x5cb86a, 0x7fd08a],
      [0x2c7446, 0x3b8a55, 0x48a064, 0x58b673, 0x7ccc8e],
      [0x3a7d3a, 0x4b9447, 0x5aaa52, 0x6bbd5f, 0x8fd682],
    ];
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    tints.forEach(([outline, back, mid, top, light], i) => {
      g.clear();
      g.fillStyle(0x2a5a2a, 0.22).fillEllipse(ox, oy + 11, 36, 10);
      g.fillStyle(0x5a3a22, 1).fillRect(ox - 4, oy - 4, 8, 16);
      g.fillStyle(0x7a5236, 1).fillRect(ox - 4, oy - 4, 3, 16);
      g.fillStyle(outline, 1).fillCircle(ox, oy - 20, 19).fillCircle(ox - 11, oy - 12, 15).fillCircle(ox + 11, oy - 12, 15).fillCircle(ox, oy - 28, 14);
      g.fillStyle(back, 1).fillCircle(ox, oy - 20, 17);
      g.fillStyle(mid, 1).fillCircle(ox - 11, oy - 12, 13).fillCircle(ox + 11, oy - 12, 13);
      g.fillStyle(top, 1).fillCircle(ox, oy - 28, 12);
      g.fillStyle(light, 0.9).fillCircle(ox - 4, oy - 32, 5).fillCircle(ox - 13, oy - 16, 4);
      g.generateTexture(`tree_${i}`, TREE_TEX.w, TREE_TEX.h);
    });
    g.clear();
    g.fillStyle(0xe0453a, 1);
    g.fillCircle(ox - 9, oy - 14, 3.5).fillCircle(ox + 8, oy - 19, 3.5).fillCircle(ox + 1, oy - 29, 3.5);
    g.fillStyle(0xffb0a0, 1);
    g.fillRect(ox - 10, oy - 16, 1.5, 1.5).fillRect(ox + 7, oy - 21, 1.5, 1.5).fillRect(ox, oy - 31, 1.5, 1.5);
    g.generateTexture('tree_fruit', TREE_TEX.w, TREE_TEX.h);
    g.destroy();
  }

  drawTree(x, y) {
    this.bakeTreeTextures();
    const ox = TREE_TEX.ox / TREE_TEX.w;
    const oy = TREE_TEX.oy / TREE_TEX.h;
    const variant = Math.floor(worldHash(x, y, 91) * 3);
    const g = this.add.image(x, y, `tree_${variant}`).setOrigin(ox, oy);
    g.setDepth(y);
    this.addObstacleRect({ x: x - 5, y: y - 3, width: 10, height: 12 });
    this.treeGraphics.push(g);

    const index = this.treeGraphics.length - 1;
    if (index % FRUIT_TREE_EVERY === 0) {
      const fruit = this.add.image(x, y, 'tree_fruit').setOrigin(ox, oy);
      fruit.setDepth(y + 0.5);
      this.treeFruit[index] = fruit;
    }
  }

  drawTulipBeds() {
    TULIP_BEDS.forEach((bed) => {
      bed.frames.forEach((frame, i) => {
        const px = bed.x + i * 20 - ((bed.frames.length - 1) * 10);
        this.add.sprite(px, bed.y, 'tulips', frame).setDepth(-1)._cstill = 1; // cull: decor that never moves (see cullOffscreen)
      });
    });
  }

  drawRocks() {
    ROCKS.forEach(([x, y, frame]) => {
      this.add.sprite(x, y, 'rocks', frame).setDepth(-1)._cstill = 1; // cull: decor that never moves (see cullOffscreen)
    });
  }

  drawPunkRocks() {
    PUNK_ROCKS.forEach(([x, y, frame]) => {
      this.add.sprite(x, y, 'punkrocks', frame).setDepth(-1)._cstill = 1; // cull: decor that never moves (see cullOffscreen)
    });
  }

  addObstacleRect({ x, y, width, height }) {
    const rect = this.add.rectangle(x + width / 2, y + height / 2, width, height, 0x000000, 0).setVisible(false);
    this.physics.add.existing(rect, true);
    this.obstacles.add(rect);
    return rect;
  }

  // ---------- networking ----------

  // Flood safety (netsafety P1-3): MAX_PLAYERS is only enforced by honest clients' join transaction, so a hostile writer can add
  // hundreds of /players records. Draw at most REMOTE_CAP of them (the rest stay in allPlayers and take a freed slot later), and
  // rebuild the player list at most once per 250 ms instead of once per record.
  addRemotePlayerCapped(p) {
    if (!p || this.remotePlayers.has(p.id) || this.remotePlayers.size >= REMOTE_CAP) return false;
    this.addRemotePlayer(p);
    return true;
  }

  fillRemoteSlot() {
    for (const [id, p] of this.allPlayers) {
      if (this.remotePlayers.size >= REMOTE_CAP) return;
      if (id !== (this.net && this.net.id) && !this.remotePlayers.has(id)) this.addRemotePlayerCapped(p);
    }
  }

  scheduleRenderPlayerList() {
    if (this._plTimer) return;
    this._plTimer = setTimeout(() => { this._plTimer = null; this.renderPlayerList(); }, 250);
  }

  registerNetHandlers() {
    this.net.on('playerJoined', (p) => {
      if (this.remotePlayers.has(p.id)) return;
      this.allPlayers.set(p.id, p);
      this.addRemotePlayerCapped(p);
      this.scheduleRenderPlayerList();
    });

    this.net.on('playerLeft', (id) => {
      this.allPlayers.delete(id);
      const hadSprite = this.remotePlayers.has(id);
      this.removeRemotePlayer(id);
      if (hadSprite) this.fillRemoteSlot();
      this.scheduleRenderPlayerList();
    });

    this.net.on('playerUpdated', (d) => {
      const rp = this.remotePlayers.get(d.id);
      if (!rp) {
        // A record that was skipped on child_added (written in two steps,
        // or broken and later repaired) becomes valid here — show it now
        // instead of never.
        this.allPlayers.set(d.id, d);
        this.addRemotePlayerCapped(d);
        this.scheduleRenderPlayerList();
        return;
      }
      rp.targetX = d.x;
      rp.targetY = d.y;
      rp.facing = d.facing;
      if (d.species && (d.species !== rp.species || d.frame !== rp.frame)) {
        rp.species = d.species;
        rp.frame = d.frame;
        const tex = this.safeTexture(d.species, d.frame);
        rp.visual.setTexture(tex.key, tex.frame);
      }

      const known = this.allPlayers.get(d.id);
      if (known && (known.score !== d.score || known.title !== d.title)) {
        known.score = d.score || 0;
        known.title = d.title || null;
        this.scheduleRenderPlayerList();
      }

      if (EMOTES.includes(d.emote) && d.emoteAt && this.lastEmoteAt.get(d.id) !== d.emoteAt) {
        this.lastEmoteAt.set(d.id, d.emoteAt);
        this.showEmoteBubble(d.id, d.emote);
      }
    });

    this.net.on('chat', (msg) => {
      this.addChatLine({ name: msg.name, text: msg.text, old: msg.isOld });
      if (!msg.isOld) this.showChatBubble(msg.id, msg.text);
    });

    // Only fires when a rejoin after a dropped connection failed for good
    // (the town filled up while we were away); short drops are healed
    // automatically by net.js and reported through 'rejoined'.
    this.net.on('selfRemoved', () => {
      this.addChatLine({ system: true, text: 'Lost your spot in town (connection dropped and the town filled up). You can still look around, but refresh to rejoin.' });
    });

    this.net.on('connection', ({ connected }) => {
      this.setNetStatus(connected ? null : 'Reconnecting…');
      if (!connected) {
        this.wasDisconnected = true;
      } else if (this.wasDisconnected) {
        this.wasDisconnected = false;
        // Force the next movement tick to send our position again, in case
        // the last one was lost with the connection.
        this.lastSentPos = null;
      }
    });

    this.net.on('rejoined', () => {
      this.lastSentPos = null;
      this.addChatLine({ system: true, text: 'Reconnected — you’re back in town.' });
    });

    this.net.on('blockAdded', (b) => this.addBlockVisual(b));
    this.net.on('blockRemoved', (b) => this.removeBlockVisual(b.key));

    this.net.on('guestbookEntry', (entry) => {
      // child_added can replay entries we already have (e.g. a brief
      // reconnect), so de-dupe by push key before unshifting.
      if (this.guestbookEntries.some((e) => e.key === entry.key)) return;
      this.guestbookEntries.unshift(entry);
      if (this.guestbookEntries.length > 20) this.guestbookEntries.length = 20;
      if (this.guestbookOpen) this.renderGuestbookList();
    });
  }

  // Small "Reconnecting…" pill, created on demand (and styled inline) so
  // it needs no markup or stylesheet changes. Pass null to hide it.
  setNetStatus(text) {
    let el = document.getElementById('net-status');
    if (!text) {
      if (el) el.remove();
      return;
    }
    if (!el) {
      el = document.createElement('div');
      el.id = 'net-status';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      el.style.cssText = 'position:fixed;top:calc(10px + env(safe-area-inset-top, 0px));left:50%;'
        + 'transform:translateX(-50%);z-index:1000;padding:6px 14px;border-radius:999px;'
        + 'background:rgba(28,36,48,0.92);color:#ffd27a;border:1px solid #3a4658;'
        + 'font:600 13px system-ui,sans-serif;pointer-events:none;';
      document.body.appendChild(el);
    }
    el.textContent = `📡 ${text}`;
  }

  // ---------- DOM: chat + player list ----------

  registerChatUI() {
    const chatInput = document.getElementById('chat-input');

    chatInput.addEventListener('focus', () => { this.chatFocused = true; });
    chatInput.addEventListener('blur', () => {
      this.chatFocused = false;
      // On mobile this input row is hidden until tapped open (see the
      // mobile-chat-btn handler in setupTouchControls) — closing the
      // keyboard/blurring is the natural "done typing" signal to hide it
      // again, so it's not permanently eating screen space. A no-op on
      // desktop, where the row has no hiding CSS to begin with.
      document.getElementById('chat-input-row').classList.remove('chat-input-visible');
    });

    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.sendChatMessage();
      } else if (e.key === 'Escape') {
        chatInput.value = '';
        chatInput.blur();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && document.activeElement !== chatInput) {
        chatInput.focus();
        e.preventDefault();
      }
    });

    // Clears this device's own view of the log only — it's a local
    // declutter button, not a moderation tool, so it doesn't touch the
    // shared Firebase chat history or anyone else's screen.
    document.getElementById('chat-clear-btn').addEventListener('click', () => {
      document.getElementById('chat-log').innerHTML = '';
      document.getElementById('chat-clear-btn').classList.add('hidden');
    });

    const sendBtn = document.getElementById('chat-send-btn');
    // On mobile, tapping this button while the input is still focused
    // blurs the input *before* the click fires (a tap is translated into
    // touchstart/touchend, then compatibility mousedown/mouseup/click —
    // it's that synthetic mousedown's default "shift focus" behavior that
    // causes the blur) — and since blur now hides #chat-input-row (see
    // above), the row (send button included) was disappearing out from
    // under the tap mid-gesture, silently swallowing the click entirely.
    // Blocking just mousedown's default stops that focus shift without
    // canceling the click itself (unlike preventDefault on touchstart,
    // which suppresses the whole synthetic mouse-event chain, click
    // included), so sendChatMessage()'s own explicit blur() at the end is
    // what finally hides the row, after the message has actually sent.
    sendBtn.addEventListener('mousedown', (e) => e.preventDefault());
    sendBtn.addEventListener('click', () => this.sendChatMessage());
    document.querySelectorAll('#quick-chat-row button').forEach((btn) => {
      btn.addEventListener('click', () => {
        chatInput.value = btn.dataset.phrase;
        this.sendChatMessage();
      });
    });
  }

  sendChatMessage() {
    const chatInput = document.getElementById('chat-input');
    const text = chatInput.value.trim();
    if (text && containsBlockedTerm(text)) {
      this.addChatLine({ system: true, text: "That message wasn't sent — please keep it clean." });
      chatInput.value = '';
      chatInput.blur();
      return;
    }
    // Simple client-side spam deterrent, not moderation: block sending the
    // exact same text twice in a row within 10s. Doesn't stop a determined
    // bad actor hitting the database directly, same caveat as the slur
    // filter — see the README's "A word on safety" section.
    if (text && text === this.lastChatText && Date.now() - (this.lastChatTextAt || 0) < 10000) {
      chatInput.value = '';
      chatInput.blur();
      return;
    }
    // Same spirit: at most CHAT_BURST messages per CHAT_WINDOW_MS. The
    // input is kept (not cleared) so the player can just retry.
    const CHAT_BURST = 5;
    const CHAT_WINDOW_MS = 10000;
    const now = Date.now();
    this.chatSentTimes = (this.chatSentTimes || []).filter((t) => now - t < CHAT_WINDOW_MS);
    if (text && this.chatSentTimes.length >= CHAT_BURST) {
      this.addChatLine({ system: true, text: 'Whoa, slow down a little — try again in a few seconds.' });
      return;
    }
    if (text && this.net.offline) {
      this.addChatLine({ system: true, text: 'Chat needs the online town. You are playing offline.' });
      chatInput.value = '';
      chatInput.blur();
      return;
    }
    if (text) {
      this.chatSentTimes.push(now);
      this.net.sendChat(text.slice(0, 140));
      this.incrementStat('chatSent');
      this.lastChatText = text;
      this.lastChatTextAt = Date.now();
    }
    chatInput.value = '';
    chatInput.blur();
  }

  addChatLine({ name, text, system, old, ambient }) {
    if (ambient && this._quietLines) { this._quietLines.push({ name, text, system }); return; }
    const chatLog = document.getElementById('chat-log');
    const line = document.createElement('div');
    line.className = system ? 'chat-line system' : 'chat-line';
    // Lines from before we joined are history, not live conversation.
    if (old) line.style.opacity = '0.6';

    if (!system) {
      const who = document.createElement('span');
      who.className = 'who';
      // Defense in depth: a malicious client can write straight to Firebase
      // and skip the checks above entirely, so anything rendered from
      // someone else's data gets masked here too, not just on our own send.
      who.textContent = `${censorBlockedTerms(name)}:`;
      line.appendChild(who);
      line.appendChild(document.createTextNode(` ${censorBlockedTerms(text)}`));
    } else {
      line.textContent = text;
    }

    // Only auto-scroll if the reader is already at (or near) the bottom, so
    // a new line doesn't yank them away from scrolling back through history.
    const nearBottom = chatLog.scrollHeight - chatLog.scrollTop - chatLog.clientHeight < 40;
    chatLog.appendChild(line);
    while (chatLog.children.length > 50) chatLog.removeChild(chatLog.firstChild);
    if (nearBottom) chatLog.scrollTop = chatLog.scrollHeight;
    document.getElementById('chat-clear-btn').classList.remove('hidden');
  }

  drawNoticeBoard() {
    const x = 1380; // W-06: 30 px east of the old spot, so the bigger board clears the Postcards sign label
    const y = 520;
    const g = this.bakedGfx(y - 1);
    g.fillStyle(0x6b4a30, 1).fillRect(x - 2, y - 4, 4, 30);
    // W-06 (b12-06): a bigger board and 12 px text rendered at 2x, so TOP SCORES reads (cap height >= 8 screen px at both zooms; was 8 px, smeared).
    g.fillStyle(0xe8d9b5, 1).fillRect(x - 72, y - 78, 144, 76);
    g.lineStyle(2, 0x8f7044, 1).strokeRect(x - 72, y - 78, 144, 76);
    g.bake({ finish: 'board' }); // cycle 1 art: same outline / depth finish as the buildings
    this.noticeBoardText = this.add.text(x, y - 40, '', {
      fontSize: '12px',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      color: '#3a2a1a',
      align: 'center',
      wordWrap: { width: 136 },
    }).setOrigin(0.5).setDepth(y).setResolution(2);
    this.noticeBoardRect = { x: x - 72, y: y - 78, w: 144, h: 76 };
  }

  updateNoticeBoard(sorted) {
    if (!this.noticeBoardText) return;
    const top3 = sorted.slice(0, 3);
    const lines = top3.length
      ? top3.map((p, i) => `${['🥇', '🥈', '🥉'][i]} ${censorBlockedTerms(p.name).slice(0, 8)} ${p.score || 0}`)
      : ['no scores yet'];
    this.noticeBoardText.setText(['TOP SCORES', ...lines].join('\n'));
  }

  // Hero line (name · stars · trophies) and the plain stat block in the Stats tab. Text only (textContent), cheap: it
  // runs when the player list re-renders (score changes), never per frame.
  renderHeroLine() {
    const nameEl = document.getElementById('hero-name');
    const statsEl = document.getElementById('hero-stats');
    const block = document.getElementById('stat-block');
    if (!nameEl || !statsEl) return;
    const name = censorBlockedTerms((this.selfData && this.selfData.name) || 'You');
    const stars = this.localScore || 0;
    const ach = this.achievementsUnlocked ? this.achievementsUnlocked.size : 0;
    const cap = typeof ACHIEVEMENTS !== 'undefined' ? ACHIEVEMENTS.length : 0;
    if (nameEl.textContent !== name) nameEl.textContent = name;
    const line = `⭐ ${stars} · 🏆 ${ach}/${cap}`;
    if (statsEl.textContent !== line) statsEl.textContent = line;
    if (!block) return;
    const txt = (id) => ((document.getElementById(id) || {}).textContent || '0');
    const rows = [
      ['⭐ Stars', String(stars)],
      ['🏆 Trophies', `${ach}/${cap}`],
      ['🏛️ Museum', `${txt('museum-count')}/${txt('museum-cap')}`],
      ['🐟 Fish', txt('fish-count')],
      ['🦋 Bugs', txt('bug-count')],
      ['🏡 Days in town', txt('streak-count')],
    ];
    const key = rows.map((r) => r.join('=')).join('|');
    if (block.dataset.key === key) return;
    block.dataset.key = key;
    block.textContent = '';
    rows.forEach(([k, v]) => {
      const dt = document.createElement('dt'); dt.textContent = k;
      const dd = document.createElement('dd'); dd.textContent = v;
      block.appendChild(dt); block.appendChild(dd);
    });
  }

  renderPlayerList() {
    this.renderHeroLine();
    const listEl = document.getElementById('player-list');
    listEl.innerHTML = '';
    const sorted = Array.from(this.allPlayers.values()).sort((a, b) => (b.score || 0) - (a.score || 0));
    this.updateNoticeBoard(sorted);
    sorted.forEach((p) => {
      const li = document.createElement('li');
      const safeName = censorBlockedTerms(p.name);
      const label = p.id === this.selfData.id ? `${safeName} (you)` : safeName;
      const title = ACHIEVEMENTS.find((a) => a.id === p.title);
      const badge = title ? `${title.icon} ` : '';
      const text = document.createElement('span');
      text.textContent = `${badge}${label} — ⭐${p.score || 0}`;
      if (title) text.title = title.label;
      li.appendChild(text);

      if (p.id !== this.selfData.id) {
        const star = document.createElement('button');
        star.type = 'button';
        star.className = 'bestie-star' + (this.bestieId === p.id ? ' active' : '');
        star.title = `Set ${safeName} as your walkie-talkie bestie`;
        star.textContent = this.bestieId === p.id ? '💛' : '🤍';
        star.addEventListener('click', () => this.setBestie(p.id, p.name));
        li.appendChild(star);
      }
      listEl.appendChild(li);
    });
  }

  // ---------- walkie-talkie (push-to-talk voice clips, bestie-only) ----------
  // Fully peer-addressed, like chat but binary: a short recorded clip is
  // base64-encoded and pushed to /walkie/{bestieId} in Firebase. If the
  // recipient's tab is visible right now it plays instantly; otherwise it's
  // queued as an unread voice memo and plays (or waits to be tapped) the
  // moment they come back — a real background-tab web app can't reliably
  // keep running or play audio while backgrounded/closed, so "while this
  // tab is open and in front of you" is the honest scope here.

  setupWalkie() {
    // Hostile/corrupt saves: only a non-empty string id and a string name count (an object name used to read "to [object Object]").
    const bid = savedProfile.bestieId, bname = savedProfile.bestieName;
    this.bestieId = typeof bid === 'string' && bid ? bid : null;
    this.bestieName = this.bestieId ? (typeof bname === 'string' && bname ? bname.slice(0, 24) : 'your bestie') : null;
    this.voiceMemos = [];
    this.recording = false;
    this.updateBestieLabel();

    if (this.net.db && this.net.id) {
      this.walkieRef = this.net.db.ref(`walkie/${this.net.id}`);
      this.walkieRef.on('child_added', (snap) => {
        const v = snap.val();
        if (!v || typeof v !== 'object') return;
        // netsafety P1-2: typed, size-capped, and only from the chosen bestie (as the UI promises), never auto-played from strangers.
        const data = typeof v.data === 'string' && v.data.length <= 400000 && /^[A-Za-z0-9+/=]+$/.test(v.data) ? v.data : null;
        if (!data || typeof v.from !== 'string' || !this.bestieId || v.from !== this.bestieId) return;
        const mime = typeof v.mime === 'string' && /^audio\/(webm|mp4|ogg|mpeg|aac)(;\s*codecs=[\w.]+)?$/i.test(v.mime) ? v.mime : 'audio/webm';
        const fromName = typeof v.fromName === 'string' && v.fromName.trim() ? v.fromName.trim().slice(0, 16) : 'someone';
        const memo = { key: snap.key, from: v.from, fromName, data, mime };
        this.voiceMemos.push(memo);
        this.updateMemoBadge();
        if (document.visibilityState === 'visible') this.playMemo(memo);
      });
    }

    const talkBtn = document.getElementById('walkie-talk-btn');
    const press = (e) => { e.preventDefault(); this.startRecording(); };
    const release = () => this.stopRecording();
    talkBtn.addEventListener('pointerdown', press);
    talkBtn.addEventListener('pointerup', release);
    talkBtn.addEventListener('pointerleave', release);

    window.addEventListener('keydown', (e) => {
      if (this.chatFocused || this.inUnderground || this.inRealm) return;
      if (e.key.toLowerCase() === 't' && !this.recording) this.startRecording();
    });
    window.addEventListener('keyup', (e) => {
      if (e.key.toLowerCase() === 't') this.stopRecording();
    });

    document.getElementById('memo-inbox-btn').addEventListener('click', () => {
      if (this.voiceMemos.length) this.playMemo(this.voiceMemos[0]);
    });
  }

  setBestie(id, name) {
    this.bestieId = id;
    this.bestieName = name;
    writeSave({ bestieId: id, bestieName: name });
    this.updateBestieLabel();
    this.renderPlayerList();
  }

  updateBestieLabel() {
    const label = document.getElementById('bestie-label');
    const talkBtn = document.getElementById('walkie-talk-btn');
    if (label) label.textContent = this.bestieId ? `to ${this.bestieName}` : 'pick a bestie →';
    if (talkBtn) talkBtn.disabled = !this.bestieId;
  }

  async startRecording() {
    if (this.recording || !this.bestieId) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.recording = true;
      document.getElementById('walkie-talk-btn').classList.add('recording');
      this.walkieStream = stream;
      this.walkieChunks = [];
      // iOS Safari records AAC/mp4, not webm — ask for whatever this
      // browser actually supports instead of assuming one.
      const candidates = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'];
      const supported = candidates.find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t));
      this.walkieRecorder = new MediaRecorder(stream, supported ? { mimeType: supported } : undefined);
      this.walkieRecorder.ondataavailable = (e) => { if (e.data.size) this.walkieChunks.push(e.data); };
      this.walkieRecordedAt = Date.now();
      this.walkieRecorder.start();
      this.walkieTimeout = setTimeout(() => this.stopRecording(), 15000); // cap a clip at 15s
    } catch (e) {
      this.showFloatingText(this.localBody.x, this.localBody.y - 30, 'mic permission needed');
    }
  }

  stopRecording() {
    if (!this.recording) return;
    this.recording = false;
    clearTimeout(this.walkieTimeout);
    document.getElementById('walkie-talk-btn').classList.remove('recording');
    const tooShort = Date.now() - this.walkieRecordedAt < 300;
    const recorder = this.walkieRecorder;
    const stream = this.walkieStream;
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      if (tooShort || !this.walkieChunks.length) return;
      const mime = recorder.mimeType || 'audio/webm';
      const blob = new Blob(this.walkieChunks, { type: mime });
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = String(reader.result).split(',')[1];
        if (base64) this.net.sendWalkie(this.bestieId, base64, mime);
      };
      reader.readAsDataURL(blob);
    };
    recorder.stop();
  }

  playMemo(memo) {
    try {
      const audio = new Audio(`data:${memo.mime};base64,${memo.data}`);
      audio.play().catch(() => {});
    } catch (e) { /* unsupported format on this device — still clear it below */ }
    this.voiceMemos = this.voiceMemos.filter((m) => m.key !== memo.key);
    this.updateMemoBadge();
    if (this.walkieRef) this.walkieRef.child(memo.key).remove().catch(() => {});
  }

  updateMemoBadge() {
    const btn = document.getElementById('memo-inbox-btn');
    const count = document.getElementById('memo-count');
    if (count) count.textContent = this.voiceMemos.length;
    if (btn) btn.classList.toggle('hidden', this.voiceMemos.length === 0);
  }
}

// ---------------- offline town ----------------
// Stand-in for TownNet when the town database can't be reached: it has the same
// surface but sends NOTHING (no presence, chat, blocks, scores, walkie...). Blocks
// echo locally so building still works for this session. `offline` lets scene code
// guard the few places that talk to the network directly.
class OfflineNet {
  constructor(profile) {
    this.offline = true;
    this.handlers = {};
    this.id = 'offline';
    this.name = profile.name;
    this.db = null;
    this.tournamentRef = null;
  }
  serverNow() { return Date.now(); }
  on(event, cb) { this.handlers[event] = cb; }
  emit(event, payload) { if (this.handlers[event]) this.handlers[event](payload); }
  startListening() {}
  move() {}
  emote() {}
  addScore() { return Promise.resolve(); }
  updateAppearance() {}
  updateTitle() {}
  sendChat() {}
  sendWalkie() {}
  leaveGuestbookNote() {}
  watchScavenger() {}
  watchTournament() {}
  claimScavengerSpot() { return Promise.resolve({ success: false, claim: null }); }
  submitTournamentCatch() { return Promise.resolve({ success: false }); }
  placeBlock(x, y, type = 'wood') {
    this.emit('blockAdded', { key: `${x}_${y}`, x, y, type, ownerId: this.id });
  }
  removeBlock(key) {
    this.emit('blockRemoved', { key });
  }
  realmCancel() {}
}

// ---------------- join overlay ----------------

const nameInput = document.getElementById('name-input');
const speciesTabsEl = document.getElementById('species-tabs');
const avatarGridEl = document.getElementById('avatar-grid');
const joinBtn = document.getElementById('join-btn');
const joinError = document.getElementById('join-error');
const joinStatus = document.getElementById('join-status');
const joinOfflineBtn = document.getElementById('join-offline-btn');
const joinOverlay = document.getElementById('join-overlay');
const hud = document.getElementById('hud');

let savedProfile = loadSave();
// Heroes: a saved hero key or legacy species is kept as-is (never rewritten); no save -> the ranger.
let selectedSpecies = MMTownHeroes.pickStart(savedProfile.species, savedProfile.frame).key;
let selectedFrame = MMTownHeroes.isHeroKey(selectedSpecies) ? 0 : Number.isInteger(savedProfile.frame) && savedProfile.frame >= 0 && savedProfile.frame < FRAME_COUNT
  ? savedProfile.frame
  : 0;
if (savedProfile.name) nameInput.value = savedProfile.name;

// ?from=hub: show a back pill; prefill name/species/frame ONLY if the form is empty (read-only, never writes storage).
try {
  if (new URLSearchParams(location.search).get('from') === 'hub') {
    const pill = document.getElementById('back-to-map-pill');
    if (pill) { pill.classList.remove('hidden'); document.body.classList.add('has-back-pill'); } // R4 D4 b15-06: card clears the pill
    if (!nameInput.value && typeof MMHubProfile !== 'undefined') {
      let raw = null;
      try { raw = JSON.parse(localStorage.getItem(MMHubProfile.KEY)); } catch (e) { raw = null; }
      const prof = raw && typeof raw === 'object' ? MMHubProfile.sanitize(raw) : MMHubProfile.seedFromTown(localStorage.getItem(MMHubProfile.TOWN_KEY), 0);
      const hasProfile = raw && typeof raw === 'object' ? true : !!localStorage.getItem(MMHubProfile.TOWN_KEY);
      if (hasProfile && prof.name && prof.name !== 'Villager') {
        nameInput.value = prof.name.slice(0, 16);
        if (MMTownHeroes.isHeroKey(prof.species) || SPECIES.some((s) => s.key === prof.species)) {
          selectedSpecies = prof.species;
          selectedFrame = prof.frame >= 0 && prof.frame < FRAME_COUNT ? prof.frame : 0;
        }
      }
    }
  }
} catch (e) { /* prefill is best-effort */ }

function renderSpeciesTabs() {
  MMTownHeroes.renderPicker(speciesTabsEl, avatarGridEl, selectedSpecies, selectedFrame, (key, f) => {
    selectedSpecies = key; selectedFrame = f; renderSpeciesTabs();
  });
  if (speciesTabsEl) return; // the 10 heroes (shared/mm-town-heroes.js)
  SPECIES.forEach((s) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'species-tab' + (s.key === selectedSpecies ? ' active' : '');
    btn.textContent = s.label;
    btn.addEventListener('click', () => {
      selectedSpecies = s.key;
      selectedFrame = 0;
      renderSpeciesTabs();
      renderAvatarGrid();
    });
    speciesTabsEl.appendChild(btn);
  });
}

function renderAvatarGrid() {
  if (avatarGridEl) return; // drawn by renderSpeciesTabs (MMTownHeroes.renderPicker)
  avatarGridEl.innerHTML = '';
  for (let frame = 0; frame < FRAME_COUNT; frame++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'avatar-choice' + (frame === selectedFrame ? ' selected' : '');
    btn.style.backgroundImage = `url(../i/${selectedSpecies}-strip.png)`;
    btn.style.backgroundPosition = `-${frame * 48}px 0`;
    btn.addEventListener('click', () => {
      selectedFrame = frame;
      renderAvatarGrid();
    });
    avatarGridEl.appendChild(btn);
  }
}

function updateJoinButtonState() {
  joinBtn.disabled = nameInput.value.trim().length === 0;
  const jh = document.getElementById('join-hint'); if (jh) jh.classList.toggle('hidden', !joinBtn.disabled); // b08-r2-11: a disabled Join says why
}
updateJoinButtonState();
// b08-r2 (round 4): the join card's compass Menu opens the shared "Where to?" sheet (mounted on first use; the Town mounts it again later, a no-op)
(function joinMenu() {
  const b = document.getElementById('join-menu-btn'); if (!b) return;
  let on = false;
  b.addEventListener('click', () => {
    try {
      if (!on) on = typeof MMNav !== 'undefined' && MMNav.mount(TOWN_NAV) === true;
      if (!on) { location.href = './hub/index.html'; return; }
      if (MMNav.isOpen()) MMNav.close(); else MMNav.open();
    } catch (e) { location.href = './hub/index.html'; }
  });
})();

nameInput.addEventListener('input', updateJoinButtonState);
nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !joinBtn.disabled) attemptJoin();
});
joinBtn.addEventListener('click', attemptJoin);

const JOIN_TIMEOUT_MS = 6000;
let joinDone = false; // true once the player is in town (online or offline)
const TOWN_SESSION_KEY = 'pixeltown-town-session-v1'; // sessionStorage only (R4 D4 b07-r2-14)
let joinTimer = null;

function showOfflineOption(message) {
  if (joinDone) return;
  joinStatus.textContent = message;
  joinOfflineBtn.classList.remove('hidden');
  // The join card scrolls on short screens: bring the new button into view instead of leaving it below the fold.
  try { joinOfflineBtn.scrollIntoView({ block: 'nearest' }); } catch (e) { /* old browsers: it is still reachable by scrolling */ }
}

function enterTown(net, data) {
  if (joinDone) return;
  joinDone = true;
  clearTimeout(joinTimer);
  joinOverlay.classList.add('hidden');
  { const bp = document.getElementById('back-to-map-pill'); if (bp) bp.classList.add('hidden'); document.body.classList.remove('has-back-pill'); } // the pill is for the join screen only (it would cover the inventory bar and leave lobbies without a confirm)
  hud.classList.remove('hidden');
  // Cycle 1 U-01 (b08-r2-07): offline, quick chat and Hold to talk only answer "Chat needs the online town", so the HUD hides them
  // (body.town-offline, see style.css). Test-only `?hud=online` keeps the online HUD pieces on the offline path, so the layout tests
  // (which can never join the live town) still measure the online layout explicitly. It changes visibility only, never the network.
  const hudOnline = /[?&]hud=online(&|$)/.test(location.search);
  document.body.classList.toggle('town-offline', net instanceof OfflineNet && !hudOnline);
  if (net instanceof OfflineNet && !hudOnline) { const ci = document.getElementById('chat-input'); if (ci) ci.placeholder = 'Offline: chat needs the online town'; }
  // R4 D4 (b07-r2-14): remember (this tab only, sessionStorage, never the save) that the player was in town and how, so
  // browser Back from the Isles / a game returns to the town instead of the join card.
  try { sessionStorage.setItem(TOWN_SESSION_KEY, net instanceof OfflineNet ? 'offline' : 'online'); } catch (e) { /* storage blocked */ }
  startTown(net, data);
}

// Offline: walk the town alone. Anything pending or listening on the database is
// paused first (goOffline queues locally and never sends while offline).
function playOffline() {
  if (joinDone) return;
  const name = nameInput.value.trim() || savedProfile.name || 'Villager';
  try { if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length) firebase.database().goOffline(); } catch (e) { /* no SDK or no app: nothing to pause */ }
  const self = { id: 'offline', name: name.slice(0, 16), species: selectedSpecies, frame: selectedFrame, x: 1200, y: 600, facing: 1, score: 0, emote: null, emoteAt: 0 };
  const net = new OfflineNet({ name: self.name });
  writeSave({ name: self.name, species: selectedSpecies, frame: selectedFrame });
  enterTown(net, { self, players: { [self.id]: self }, world: WORLD });
}
joinOfflineBtn.addEventListener('click', playOffline);

function attemptJoin() {
  const name = nameInput.value.trim();
  if (!name) return;
  if (containsBlockedTerm(name)) {
    joinError.textContent = 'Please pick a different name.';
    return;
  }
  joinBtn.disabled = true;
  joinError.textContent = '';
  joinStatus.textContent = 'Connecting to the town…';
  joinOfflineBtn.classList.add('hidden');
  writeSave({ name, species: selectedSpecies, frame: selectedFrame });

  const net = new TownNet();
  const offlineMsg = "Can't reach the town server. Check your connection, or play offline.";
  clearTimeout(joinTimer);
  joinTimer = setTimeout(() => showOfflineOption(offlineMsg), JOIN_TIMEOUT_MS);

  net.on('configMissing', () => {
    joinError.textContent = 'Not connected to a Firebase project yet — see game/firebase-config.js.';
    joinBtn.disabled = false;
    clearTimeout(joinTimer);
    showOfflineOption('');
  });
  net.on('townFull', () => {
    joinError.textContent = 'Town is full right now (10 max) — try again shortly.';
    joinBtn.disabled = false;
    clearTimeout(joinTimer);
    joinStatus.textContent = '';
  });
  net.on('error', (text) => {
    joinError.textContent = text;
    joinBtn.disabled = false;
    clearTimeout(joinTimer);
    showOfflineOption(offlineMsg);
  });
  net.on('init', (data) => {
    if (joinDone) return;
    enterTown(net, data);
  });

  Promise.resolve().then(() => net.join({ name, species: selectedSpecies, frame: selectedFrame })).catch(() => {
    net.emit('error', 'Could not reach the town database.');
  });
}

function viewportSize() {
  // Standalone "Add to Home Screen" launches on iOS report a stale/incorrect
  // window.innerWidth/innerHeight for a moment (and sometimes for good,
  // depending on iOS version) — visualViewport tracks the real on-screen
  // size, so prefer it whenever it's available to avoid a zoomed-in canvas.
  const vv = window.visualViewport;
  return {
    width: Math.round((vv && vv.width) || window.innerWidth),
    height: Math.round((vv && vv.height) || window.innerHeight),
  };
}

function startTown(net, data) {
  const initialSize = viewportSize();
  const config = {
    type: Phaser.AUTO,
    parent: 'game-container',
    width: initialSize.width,
    height: initialSize.height,
    backgroundColor: '#3a5a40',
    pixelArt: true,
    physics: { default: 'arcade', arcade: { debug: false } },
  };
  const game = new Phaser.Game(config);
  game.scene.add('Town', TownScene, true, { net, self: data.self, players: data.players, world: data.world });

  const gameContainer = document.getElementById('game-container');
  // A11y landmarks (a11y-viewports #9): the town view is the page's main region with one (visually hidden) heading, and the
  // canvas says what it is. The join card's own h1 is hidden by now, so there is exactly one h1.
  try {
    gameContainer.setAttribute('role', 'main');
    if (!document.getElementById('town-h1')) {
      const h1 = document.createElement('h1');
      h1.id = 'town-h1'; h1.className = 'sr-only'; h1.textContent = 'Hearthvale town';
      gameContainer.parentNode.insertBefore(h1, gameContainer);
    }
    const labelCanvas = () => { const c = gameContainer.querySelector('canvas'); if (c && !c.getAttribute('aria-label')) c.setAttribute('aria-label', 'Hearthvale town: walk with the stick or arrow keys, A or E to interact'); };
    labelCanvas(); setTimeout(labelCanvas, 0); game.events.once('ready', labelCanvas);
  } catch (e) { /* landmarks are best effort */ }
  // Adaptive render resolution (desktop only): the canvas keeps its CSS size but renders fewer
  // pixels when frames stay slow (software/low-end GPUs are fill-rate bound). Steps down only,
  // never back up, so it cannot oscillate; the camera zoom is scaled so the view is identical.
  let renderScale = TOWN_PERF.renderScale; // 1, or 0.75 on the TN2 low tier
  const applyRenderScale = () => {
    const size = viewportSize();
    const gw = Math.max(320, Math.round(size.width * renderScale));
    const gh = Math.max(180, Math.round(size.height * renderScale));
    game.scale.resize(gw, gh);
    game.scale.setZoom(size.width / gw); // display size stays the full viewport
    const town = game.scene.getScene('Town');
    const k = gw / size.width; // == renderScale, except where the 320 px floor kicks in (a phone on the TN2 low tier)
    if (town && town.cameras && town.cameras.main && town.baseZoom) town.cameras.main.setZoom(town.baseZoom * k);
    const gc = document.getElementById('game-container');
    if (gc) { gc.dataset.renderScale = String(renderScale); gc.dataset.renderZoom = String(k); }
  };
  const resizeToViewport = () => {
    const size = viewportSize();
    if (renderScale === 1) { game.scale.resize(size.width, size.height); game.scale.setZoom(1); } else applyRenderScale();
    // #game-container is `position: fixed; inset: 0`, sized to the full
    // layout viewport — on a keyboard that overlays rather than resizes the
    // page, that stays taller than the (now keyboard-aware) canvas inside
    // it, exposing the page's own dark background in the gap behind the
    // keyboard. Pinning its box to the same visualViewport size as the
    // canvas removes that gap instead of leaving it to show through.
    if (gameContainer) {
      gameContainer.style.width = `${size.width}px`;
      gameContainer.style.height = `${size.height}px`;
    }
  };
  window.addEventListener('resize', resizeToViewport);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', resizeToViewport);
  }

  if (!IS_TOUCH) {
    const STEPS = [1, 0.75, 0.5];
    let frames = 0;
    let winStart = performance.now();
    let slow = 0;
    const born = winStart;
    game.events.on('postrender', () => { frames++; });
    setInterval(() => {
      const now = performance.now();
      const dt = now - winStart;
      const fps = (frames * 1000) / dt;
      const seen = frames;
      frames = 0;
      winStart = now;
      if (document.hidden || now - born < 2500 || seen < 3 || dt > 2600) { slow = 0; return; } // warm-up / hidden tab / stalled timer
      slow = fps < 28 ? slow + 1 : 0;
      const next = STEPS[STEPS.indexOf(renderScale) + 1];
      if (slow >= 2 && next) { renderScale = next; slow = 0; applyRenderScale(); }
    }, 1500);
  }
  // Standalone launches settle their real viewport a beat after load, so
  // double-check shortly after start rather than only on resize events.
  setTimeout(resizeToViewport, 150);
  setTimeout(resizeToViewport, 600);

  // On a browser that honors `interactive-widget=resizes-content` (the meta
  // tag above), window.innerHeight shrinks right along with the on-screen
  // keyboard and this gap is always ~0 — harmless no-op there. On one that
  // doesn't (older Safari, some Android webviews), the keyboard instead
  // overlays the page: window.innerHeight stays full-height while
  // visualViewport shrinks (and pans) to the space still visible above the
  // keyboard, so fixed-bottom UI (the chat bar) ends up positioned behind
  // the keyboard or adrift wherever the visual viewport happens to be
  // panned to. This feeds that gap into a CSS var so fixed-bottom elements
  // can push themselves up above the keyboard instead.
  const updateKeyboardInset = () => {
    const vv = window.visualViewport;
    if (!vv) return;
    const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    document.documentElement.style.setProperty('--kb-inset', `${Math.round(inset)}px`);
  };
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', updateKeyboardInset);
    window.visualViewport.addEventListener('scroll', updateKeyboardInset);
  }
}

renderSpeciesTabs();
renderAvatarGrid();
updateJoinButtonState();

// R4 D4 (b07-r2-14): browser Back (or Forward) into the town after this tab had joined skips the join card: rejoin the same
// way as before (offline stays offline; online joins presence exactly like pressing Join Town). A fresh visit, a reload or
// a new tab still shows the card. Never writes the save beyond what Join already writes.
(function autoRejoinOnBack() {
  let mode = null;
  try { mode = sessionStorage.getItem(TOWN_SESSION_KEY); } catch (e) { mode = null; }
  if (mode !== 'offline' && mode !== 'online') return;
  let back = false;
  try { const nav = performance.getEntriesByType('navigation')[0]; back = !!nav && nav.type === 'back_forward'; } catch (e) { back = false; }
  if (!back || !nameInput.value.trim()) return;
  joinStatus.textContent = 'Welcome back! Returning to town…';
  setTimeout(() => { if (joinDone) return; if (mode === 'offline') playOffline(); else attemptJoin(); }, 0);
}());

// Join screen "Continue: <last place>" (shared/mm-nav.js, key pixeltown-nav-v1, read-only here): only when a previous
// place other than the Town is stored. A plain link, so it leaves the page without joining (no network).
(function setupJoinContinue() {
  const a = document.getElementById('join-continue');
  if (!a || typeof MMNav === 'undefined') return;
  try {
    const st = MMNav.state();
    const c = MMNav.continueTarget(st, 'town') || (st.prev ? MMNav.continueTarget({ v: 1, last: st.prev }, 'town') : null);
    const href = c && MMNav.urlFor(c.url, 'game/index.html');
    if (!href) return;
    a.href = href;
    a.textContent = '↩️ ' + c.label;
    a.dataset.place = c.id;
    a.classList.remove('hidden');
  } catch (e) { /* storage blocked: no Continue link */ }
}());

// A lightweight, read-only peek at how many villagers are in town right
// now, shown on the join screen before this player has actually joined.
const joinScreenNet = new TownNet();
const onlineCountEl = document.getElementById('online-count');
try {
  joinScreenNet.watchOnlineCount((count) => {
    if (!onlineCountEl) return;
    onlineCountEl.textContent = count === null ? '' : `🟢 ${count} villager${count === 1 ? '' : 's'} in town right now`;
  });
} catch (e) { /* database SDK unavailable: the join screen simply shows no count */ }
