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
const GAME_VERSION = 'v24-fishing-tourney';
const WHATS_NEW = [
  '🎣 Daily fishing tournament — biggest catch of the day wins a bonus',
  '🔍 Daily scavenger hunt — one hidden spot a day, first to find it wins',
  '🏘️ Town rating readout, 🎵 opt-in ambient music, 💾 save backup/restore',
];

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) || {} : {};
  } catch (e) {
    return {}; // private browsing / storage disabled — just play without saving
  }
}

// Captured once, as soon as the script runs — before the join screen's
// own writeSave() calls touch anything — so "is this a brand-new device"
// can still be answered correctly later, even though joining immediately
// writes name/species/frame to the same save.
const HAD_EXISTING_SAVE_ON_LOAD = Object.keys(loadSave()).length > 0;

function writeSave(partial) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ...loadSave(), ...partial }));
  } catch (e) {
    // ignore — nothing to persist to
  }
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

const SFX = {
  catch: () => playNotes([[740, 0.08, 0], [1175, 0.1, 0.06]], 'sine', 0.12),
  coin: () => playNotes([[988, 0.09, 0]], 'triangle', 0.1),
  sell: () => playNotes([[523, 0.08, 0], [784, 0.08, 0.05], [1047, 0.12, 0.1]], 'triangle', 0.11),
  achievement: () => playNotes([[523, 0.1, 0], [659, 0.1, 0.09], [784, 0.1, 0.18], [1047, 0.18, 0.27]], 'square', 0.1),
  deny: () => playNotes([[196, 0.16, 0]], 'sawtooth', 0.09),
  pop: () => playNotes([[392, 0.05, 0], [294, 0.06, 0.04]], 'square', 0.08),
  shutter: () => playNotes([[1800, 0.03, 0], [220, 0.05, 0.03]], 'square', 0.07),
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
if (IS_TOUCH) document.body.classList.add('touch-device');

const TILT_DEADZONE_DEG = 8;
const TILT_RANGE_DEG = 36;
const SHAKE_THRESHOLD = 15; // m/s^2 jump in accelerationIncludingGravity magnitude
const SHAKE_COOLDOWN_MS = 800;
const TREE_SHAKE_RADIUS = 46;
const TREE_SHAKE_COOLDOWN_MS = 20000;

// Fixed town layout. WORLD size (2400x1200) is defined in net.js — everyone's
// client draws the same map so landmarks mean the same thing to everyone.
// The original town occupies x:0-1600; x:1600-2400 is the newer "East Meadow"
// zone, reachable by walking east along the main path.
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
const POND_CATS = [
  { y: 552, frame: 0, range: [180, 330] },
  { y: 578, frame: 3, range: [150, 300] },
  { y: 648, frame: 6, range: [170, 320] },
];
const WINDMILL_POS = { x: 250, y: 200 };
// Purely cosmetic seasonal ground decor — a snowman in winter, a pumpkin
// in autumn, nothing extra in spring/summer (flowers already cover that).
const SEASON_DECOR_SPOTS = [
  { x: 550, y: 250 }, { x: 1300, y: 250 }, { x: 2100, y: 750 },
  { x: 1050, y: 1100 }, { x: 1900, y: 350 },
];
const STATUE_POS = { x: 1450, y: 600 };
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
  "Did you know the pond cats never actually get wet? Mysteries of pixel physics.",
  "I've been counting your footsteps. You're very consistent. It's admirable.",
  "The Bored Ape statue hasn't blinked once since I've been standing here.",
  "Turnip prices are basically vibes-based. Don't ask me to explain further.",
  "I dug a hole once. Found nothing but more dirt. 0/10, not recommending it.",
  "If you listen closely during K.K. Slider's set, you can hear the campfire keeping time.",
  "Fossils are just rocks with better marketing, and I stand by that.",
  "I've met every species in this town except whichever one you just picked. Rude, honestly.",
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
  "The pond cats ignore me completely. Rude, but I respect the commitment.",
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
// Professor Byte's daily trivia — one question a day, same for everyone
// (same deterministic wall-clock-hash trick as the merchant/quest), a
// small star reward for a correct first answer, no retry once answered.
const TRIVIA_QUESTIONS = [
  { q: 'How many villager species can you pick from on the join screen?', choices: ['9', '15', '21', '29'], correct: 2 },
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
const POLYROLL_POS = { x: 1250, y: 760 };
const POLYROLL_RADIUS = 50;
const MUSEUM_POS = { x: 900, y: 920, w: 100, h: 64 };
const MUSEUM_RADIUS = 70;
const FOSSIL_TYPES = ['🦴 T-Rex Bone', '🐚 Ancient Shell', '🦷 Mammoth Tooth', '🥚 Dino Egg', '🪨 Trilobite'];
const FOSSIL_SPOTS = [
  { x: 600, y: 1000 }, { x: 650, y: 1030 }, { x: 700, y: 1000 },
];
const FOSSIL_DIG_RADIUS = 40;
const FOSSIL_RESPAWN_MS = 25000;
const FOSSIL_BAG_CAP = 3;
const DIG_HOLE_POS = { x: 1200, y: 460 };
const DIG_HOLE_RADIUS = 36;
const DOOR_RADIUS = 34;
const TURNIP_STALL_POS = { x: 970, y: 650 };
const TURNIP_STALL_RADIUS = 50;
const TURNIP_BUNDLE = 10;
const TURNIP_BUY_CYCLE_MS = 4 * 60 * 60 * 1000; // buy price changes every 4h
const TURNIP_SELL_CYCLE_MS = 15 * 60 * 1000; // sell price changes every 15min

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
  { id: 'sellstreak3', icon: '🛍️', label: 'Regular', desc: "Sell at the shop 3 days in a row", reward: 5, check: (s) => (s.bestSellStreak || 0) >= 3 },
];
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
  { x: 400, y: 450 }, { x: 650, y: 420 }, { x: 1700, y: 750 },
  { x: 1850, y: 950 }, { x: 2150, y: 600 }, { x: 350, y: 880 },
];
const FLOWER_PICKUP_RADIUS = 34;
const FLOWER_REGROW_MS = 30000;
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
const MERCHANT_POS = { x: 2250, y: 1000 };
const MERCHANT_RADIUS = 56;
const MERCHANT_COST = 15;
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
const FISH_TOURNAMENT_SIGN_POS = { x: 150, y: 420 };
const FISH_TOURNAMENT_BONUS = 10;
const GUESTBOOK_RADIUS = 60;
const GUESTBOOK_NOTE_MAX = 80;
const GUESTBOOK_COOLDOWN_MS = 60 * 1000; // one signing per minute, per client
const KK_CONCERT_START_HOUR = 19; // 7pm local time
const KK_CONCERT_END_HOUR = 21; // 9pm local time
const WEATHER_CYCLE_MS = 8 * 60 * 1000; // 8-minute weather windows
const WEATHER_RAIN_CHANCE = 0.3; // ~30% of windows are rainy
const WEATHER_RAIN_COUNT = 70;
// One-way, GTA3-loading-door style portals: each is a real door object in
// the town that, on interact, leaves Pixeltown entirely for another
// browser game in this same tab. No teleport back — closing/navigating
// away from the destination is how you return.
const PORTALS = [
  { x: 1500, y: 700, label: '🚪 GTA 3', color: 0x4fa0e0, url: 'https://quenq.com/apps/gta-3/' },
  { x: 2250, y: 600, label: '🚪 GTA 3', color: 0x4fa0e0, url: 'https://quenq.com/apps/gta-3/' },
  { x: 300, y: 500, label: '🚪 NFS Underground 2', color: 0xe0454f, url: 'https://nfsu2.xyz/' },
];
const EAST_POND = { cx: 2000, cy: 280, rx: 130, ry: 80 };

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
const ROCK_MINE_RADIUS = 30;
const FISH_BITE_WAIT_MIN = 1800;
const FISH_BITE_WAIT_MAX = 4000;
const FISH_BITE_WINDOW = 1300;

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
    SPECIES.forEach((s) => {
      this.load.spritesheet(s.key, `../i/${s.key}-strip.png`, {
        frameWidth: FRAME_SIZE,
        frameHeight: FRAME_SIZE,
      });
    });
    RARE_SPECIES.forEach((s) => {
      this.load.spritesheet(s.key, `../i/${s.key}-strip.png`, {
        frameWidth: FRAME_SIZE,
        frameHeight: FRAME_SIZE,
      });
    });
    this.load.spritesheet('tulips', '../i/tulips-strip.png', { frameWidth: FRAME_SIZE, frameHeight: FRAME_SIZE });
    this.load.spritesheet('rocks', '../i/rocks-strip.png', { frameWidth: FRAME_SIZE, frameHeight: FRAME_SIZE });
    this.load.spritesheet('punkrocks', '../i/punkrocks-strip.png', { frameWidth: FRAME_SIZE, frameHeight: FRAME_SIZE });
    // mooncatrescue-strip.png is the one collection in i/ with no transparency
    // (solid white background baked in) — assets/ holds a chroma-keyed copy
    // just for the game; the original in i/ is left untouched.
    this.load.spritesheet('mooncats', 'assets/mooncats-strip.png', { frameWidth: FRAME_SIZE, frameHeight: FRAME_SIZE });
    this.load.spritesheet('boredapes', '../i/boredapes-strip.png', { frameWidth: 28, frameHeight: 28 });
  }

  create() {
    this.physics.world.setBounds(0, 0, this.world.width, this.world.height);
    this.cameras.main.setBounds(0, 0, this.world.width, this.world.height);
    // Phones (and especially standalone "Add to Home Screen" launches, which
    // have no browser chrome eating into the viewport) show a lot less of the
    // world at zoom 2 — zoom out a bit so HUD panels don't end up covering
    // most of what's visible.
    this.cameras.main.setZoom(IS_TOUCH ? 1.5 : 2);

    this.obstacles = this.physics.add.staticGroup();
    this.remotePlayers = new Map();

    this.drawGround();
    this.drawPath();
    this.drawPond();
    this.drawPondCats();
    this.drawDock();
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
    this.drawDoors();
    this.drawPolyrollBooth();
    this.drawMuseum();
    this.drawTurnipStall();
    this.drawAbleSisters();
    this.drawGuestbook();
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

    this.createLocalPlayer(this.selfData);
    this.physics.add.collider(this.localBody, this.obstacles);

    this.allPlayers.forEach((p) => {
      if (p.id !== this.selfData.id) this.addRemotePlayer(p);
    });

    this.cameras.main.startFollow(this.localBody, true, 0.15, 0.15);

    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys('W,A,S,D');
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
    this.setupPortalReopen();
    this.setupPolyroll();
    this.setupAchievements();
    this.setupLoginStreak();
    this.setupSfxToggle();
    this.setupMusicToggle();
    this.setupReduceMotionToggle();
    this.setupPhotoMode();
    this.setupSaveBackup();
    this.setupWhatsNew();
    this.setupTriviaKey();
    this.setupAchievementsUI();
    this.setupKeysHelp();
    this.setupOutfitShop();
    this.setupGuestbook();
    this.setupBugs();
    this.setupFossils();
    if (IS_TOUCH) {
      this.setupTouchControls();
      this.setupTiltShake();
      this.setupHaptics();
    }

    this.registerNetHandlers();
    this.registerChatUI();
    this.renderPlayerList();

    // Handlers are wired up — safe to start receiving live updates now.
    this.net.startListening();
  }

  update(time, delta) {
    this.updateLocalMovement(time, delta);
    this.updateRemoteInterpolation(delta);
    this.updateSparkle(time);
    this.updateDayNight(time);
    this.updateConcert(time);
    this.updateWeather(time, delta);
    this.updateTurnipPriceLabels(time);
    this.updateBuildPreview();
    this.updateFishingRod();
    this.updateDigHoleHint();
  }

  // ---------- movement ----------

  updateLocalMovement(time, delta) {
    const speed = 140;
    let vx = 0;
    let vy = 0;

    if (this.canAct()) {
      if (this.cursors.left.isDown || this.wasd.A.isDown) vx -= 1;
      if (this.cursors.right.isDown || this.wasd.D.isDown) vx += 1;
      if (this.cursors.up.isDown || this.wasd.W.isDown) vy -= 1;
      if (this.cursors.down.isDown || this.wasd.S.isDown) vy += 1;

      if (this.touchMove) {
        vx += this.touchMove.x;
        vy += this.touchMove.y;
      }
      if (this.tiltEnabled && this.tiltMove) {
        vx += this.tiltMove.x;
        vy += this.tiltMove.y;
      }
    }

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

    this.localBody.body.setVelocity(vx * speed, vy * speed);
    if (vx !== 0) this.localVisual.setFlipX(vx < 0);

    const moving = vx !== 0 || vy !== 0;
    this.applyBob(this.localBobState, this.localVisual, this.localShadow, this.localBody.x, this.localBody.y, moving, delta);
    this.localNameText.setPosition(this.localBody.x, this.localVisual.y - 22);
    if (moving) this.spawnFootstepDust(time, this.localBody.x, this.localBody.y + 10);

    if (time - this.lastSentAt > 100) {
      this.lastSentAt = time;
      this.net.move(this.localBody.x, this.localBody.y, this.localVisual.flipX ? -1 : 1);
    }
  }

  // A tiny, purely cosmetic dust puff under the player's feet while
  // walking — throttled so it's a trail of soft dots, not a solid smear.
  spawnFootstepDust(time, x, y) {
    if (this.lastDustAt && time - this.lastDustAt < 220) return;
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
    this.remotePlayers.forEach((rp) => {
      const prevX = rp.x;
      const prevY = rp.y;
      rp.x += (rp.targetX - rp.x) * 0.25;
      rp.y += (rp.targetY - rp.y) * 0.25;
      rp.visual.setFlipX(rp.facing === -1);

      const moving = Math.hypot(rp.x - prevX, rp.y - prevY) > 0.05;
      this.applyBob(rp.bob, rp.visual, rp.shadow, rp.x, rp.y, moving, delta);
      rp.nameText.setPosition(rp.x, rp.visual.y - 22);
      if (rp.bubble) rp.bubble.setPosition(rp.x, rp.visual.y - 40);
    });
  }

  // ---------- walk-cycle (squash/stretch hop, since the source sprites are single-pose) ----------

  applyBob(state, visual, shadow, anchorX, anchorY, moving, delta) {
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
      state.lift += (target - state.lift) * 0.6;
    } else {
      state.phase = 0;
      state.lift += (0 - state.lift) * 0.3;
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
    this.localScore = 0;
  }

  updateSparkle(time) {
    const index = Math.floor(time / SPARKLE_ROTATE_MS) % SPARKLE_SPOTS.length;
    if (index !== this.sparkleIndex) {
      this.sparkleIndex = index;
      this.sparkleCaught = false;
      const [x, y] = SPARKLE_SPOTS[index];
      this.sparkleStar.setPosition(x, y).setVisible(true);
      this.sparkleGlow.setPosition(x, y).setVisible(true);
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
    const mine = this.allPlayers.get(this.selfData.id);
    if (mine) mine.score = this.localScore;
    this.renderPlayerList();
    this.showFloatingText(x, y, label);
    (SFX[sound] || (amount < 0 ? SFX.deny : SFX.coin))();
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

  // ---------- day/night ambience ----------

  setupDayNight() {
    this.dayNightOverlay = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x0a1030, 0)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(300000);
    this.scale.on('resize', (size) => this.dayNightOverlay.setSize(size.width, size.height));
    this.lastDayNightCheck = 0;
  }

  // ---------- seasons ----------
  // A faint color wash tied to the real-world month on each player's own
  // device — no new art, same "derive it from wall-clock time" trick used
  // everywhere else (sparkle, weather, K.K. Slider). Sits just under the
  // day/night overlay so night still darkens it normally.

  setupSeason() {
    this.seasonOverlay = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0xffffff, 0)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(299999);
    this.scale.on('resize', (size) => this.seasonOverlay.setSize(size.width, size.height));
    this.seasonDecorSprites = SEASON_DECOR_SPOTS.map(({ x, y }) => this.add.text(x, y, '', { fontSize: '20px' }).setOrigin(0.5).setDepth(y).setVisible(false));
    this.updateSeason();
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
    this.seasonOverlay.setFillStyle(color, alpha);

    if (this.seasonDecorSprites) {
      this.seasonDecorSprites.forEach((sprite) => {
        if (decorIcon) sprite.setText(decorIcon).setVisible(true);
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
    for (let i = 0; i < WEATHER_RAIN_COUNT; i++) {
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
      if (wasKnown) this.addChatLine({ system: true, text: raining ? '🌧️ it started raining' : '☀️ the rain cleared up' });
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

    this.dayNightOverlay.setAlpha(night * 0.45);

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
      if (this.isNightBugs) {
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
      if (el) el.addEventListener('touchstart', (e) => { if (e.target.closest('button')) haptic(); }, { passive: true });
    });
  }

  setupTouchControls() {
    this.touchMove = { x: 0, y: 0 };
    const pressed = new Set();
    const recompute = () => {
      let x = 0;
      let y = 0;
      if (pressed.has('up')) y -= 1;
      if (pressed.has('down')) y += 1;
      if (pressed.has('left')) x -= 1;
      if (pressed.has('right')) x += 1;
      this.touchMove = { x, y };
    };

    document.querySelectorAll('.dpad-btn').forEach((btn) => {
      const dir = btn.dataset.dir;
      const start = (e) => { e.preventDefault(); pressed.add(dir); btn.classList.add('active'); recompute(); };
      const end = (e) => { if (e.cancelable) e.preventDefault(); pressed.delete(dir); btn.classList.remove('active'); recompute(); };
      btn.addEventListener('touchstart', start, { passive: false });
      btn.addEventListener('touchend', end);
      btn.addEventListener('touchcancel', end);
      btn.addEventListener('mousedown', start);
      btn.addEventListener('mouseup', end);
      btn.addEventListener('mouseleave', end);
    });

    const chatInput = document.getElementById('chat-input');
    document.getElementById('mobile-chat-btn').addEventListener('click', () => chatInput.focus());

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
    document.getElementById('emote-toggle-btn').addEventListener('click', () => {
      emotePopup.classList.toggle('hidden');
    });
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
    return !this.chatFocused && !this.polyrollOpen && !this.achievementsOpen && !this.outfitShopOpen && !this.guestbookOpen && !this.triviaOpen && !this.keysHelpOpen;
  }

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
    const saved = loadSave().resources || {};
    this.resources = {
      wood: Number(saved.wood) || 0,
      stone: Number(saved.stone) || 0,
      fish: Number(saved.fish) || 0,
      bugs: Number(saved.bugs) || 0,
      fruit: Number(saved.fruit) || 0,
      turnips: Number(saved.turnips) || 0,
      shells: Number(saved.shells) || 0,
      flowers: Number(saved.flowers) || 0,
    };
    this.treeCooldowns = {};
    this.rockCooldowns = {};
    this.fishing = { state: 'idle', spot: null, bobber: null, timer: null };
    this.updateInventoryHUD();

    this.input.keyboard.on('keydown-E', () => { if (this.canAct()) this.interact(); });
    const btn = document.getElementById('interact-btn');
    if (btn) btn.addEventListener('click', () => { if (this.canAct()) this.interact(); });
  }

  saveResources() {
    writeSave({ resources: this.resources });
  }

  interact() {
    if (this.inUnderground) return;
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
    if (this.isNearGuestbook()) {
      this.openGuestbook();
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
    if (this.isNearMerchant()) {
      this.buyFromMerchant();
      return;
    }
    const fossilSpot = this.findNearestFossilSpot();
    if (fossilSpot) {
      this.digFossil(fossilSpot);
      return;
    }
    const beachSpot = this.findNearestBeachItem();
    if (beachSpot) {
      this.collectBeachItem(beachSpot);
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
      this.treeCooldowns[tree.index] = Date.now();
      this.shakeTreeVisual(tree.index);
      this.swingTool('🪓');
      this.gainResource('wood', 1, tree.x, tree.y - 40);
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
      this.rockCooldowns[rock.key] = Date.now();
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

  drawPolyrollBooth() {
    const { x, y } = POLYROLL_POS;
    const g = this.add.graphics().setDepth(y - 1);
    g.fillStyle(0x6b2e3a, 1).fillRect(x - 28, y - 10, 56, 26);
    g.fillStyle(0xffffff, 1).fillRect(x - 24, y - 6, 48, 18);
    g.fillStyle(0x1c2430, 1);
    [[-14, -1], [0, 2], [14, -2]].forEach(([dx, dy]) => g.fillCircle(x + dx, y + dy, 2));
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
    if (this.inUnderground) return;
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
    const delta = win ? bet * 2 : -bet;
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
    const grandTotal = Math.round(total + dealBonus + bulkBonus + turnipRevenue);
    if (grandTotal === 0) {
      this.showFloatingText(this.localBody.x, this.localBody.y - 30, 'bag is empty');
      return;
    }
    const soldTurnips = this.resources.turnips || 0;
    this.resources = { wood: 0, stone: 0, fish: 0, bugs: 0, fruit: 0, turnips: 0, shells: 0, flowers: 0 };
    this.updateInventoryHUD();
    this.saveResources();
    const notes = [];
    if (dealBonus > 0) notes.push(`${deal.icon} deal`);
    if (bulkCount > 0) notes.push('bulk bonus');
    const dealNote = notes.length > 0 ? ` (incl. ${notes.join(' + ')})` : '';
    const label = soldTurnips > 0 ? `sold (incl. ${soldTurnips} 🥬)! +${grandTotal} ⭐${dealNote}` : `sold! +${grandTotal} ⭐${dealNote}`;
    this.awardPoint(grandTotal, label, this.localBody.x, this.localBody.y - 30, 'sell');
    if (soldTurnips > 0) this.incrementStat('turnipsSold', soldTurnips);
    this.updateSellStreak();
  }

  // A loyalty bonus for selling on consecutive days — same date-comparison
  // shape as the daily login streak, just keyed off "did you sell today"
  // instead of "did you log in today".
  updateSellStreak() {
    const saved = loadSave();
    const today = new Date().toISOString().slice(0, 10);
    if (saved.lastSellDate === today) return; // already counted today
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const streak = saved.lastSellDate === yesterday ? (Number(saved.sellStreak) || 0) + 1 : 1;
    writeSave({ sellStreak: streak, lastSellDate: today });
    this.sellStreak = streak;
    this.lifetimeStats.bestSellStreak = Math.max(this.lifetimeStats.bestSellStreak || 0, streak);
    this.saveAchievements();
    this.checkAchievements();
    if (streak >= 2) {
      const bonus = Math.min(streak, 5);
      this.awardPoint(bonus, `🛍️ ${streak}-day streak! +${bonus} ⭐`, this.localBody.x, this.localBody.y - 50, 'achievement');
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
    return this.turnipHashedPrice(TURNIP_SELL_CYCLE_MS, 7000, 20, 240);
  }

  isNearTurnipStall() {
    return Math.hypot(this.localBody.x - TURNIP_STALL_POS.x, this.localBody.y - TURNIP_STALL_POS.y) < TURNIP_STALL_RADIUS;
  }

  buyTurnips() {
    const price = this.turnipBuyPrice();
    if ((this.localScore || 0) < price) {
      this.showFloatingText(this.localBody.x, this.localBody.y - 30, `need ${price} ⭐ for ${TURNIP_BUNDLE} turnips`);
      return;
    }
    this.resources.turnips = (this.resources.turnips || 0) + TURNIP_BUNDLE;
    this.updateInventoryHUD();
    this.saveResources();
    this.awardPoint(-price, `bought ${TURNIP_BUNDLE} 🥬 for ${price} ⭐`, this.localBody.x, this.localBody.y - 30, 'pop');
  }

  // ---------- underground (3D voxel cave, local-only) ----------

  isNearDigHole() {
    return Math.hypot(this.localBody.x - DIG_HOLE_POS.x, this.localBody.y - DIG_HOLE_POS.y) < DIG_HOLE_RADIUS;
  }

  // These doors are one-way, GTA3-loading-door style: they leave Pixeltown
  // entirely for another browser game in this same tab. There's no
  // teleport back — closing/navigating away from that page is how you
  // return, same as actually walking through a loading door and leaving
  // the area behind. Always confirm first since this abandons the
  // current session.
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
    if (this.doorBusy) return;
    const portal = this.findNearestPortal();
    if (!portal) return;
    const name = portal.label.replace('🚪', '').trim();
    const ok = window.confirm(`Walk through the portal to ${name}? This leaves Pixeltown in this tab — there's no way back through it.`);
    if (!ok) return;
    this.doorBusy = true;
    window.location.href = portal.url;
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
    window.addEventListener('pageshow', () => { this.doorBusy = false; });
  }

  updateDigHoleHint() {
    const hint = document.getElementById('dig-hole-hint');
    if (!hint) return;
    hint.classList.toggle('hidden', this.inUnderground || this.buildMode || !this.isNearDigHole());
  }

  enterUnderground() {
    if (this.inUnderground) return;
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
        onResourceChange,
        onExit: () => this.exitUnderground(),
      });
      this.underground.setAvatar(`../i/${this.selfData.species}-strip.png`, this.selfData.frame || 0, FRAME_SIZE);
      this.setupUndergroundControls();
    }
    this.underground.start();
  }

  exitUnderground() {
    if (!this.inUnderground) return;
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
    document.getElementById('ug-hotbar-wall').classList.toggle('active', type === 'wall');
    document.getElementById('ug-hotbar-torch').classList.toggle('active', type === 'torch');
  }

  setupUndergroundControls() {
    const ug = this.underground;
    this.input.keyboard && window.addEventListener('keydown', (e) => {
      if (!this.inUnderground) return;
      const k = e.key.toLowerCase();
      if (k === 'e') {
        ug.mine();
      } else if (k === 'f') {
        ug.place();
      } else if (k === '1') {
        this.setUgHotbar('wall');
      } else if (k === '2') {
        this.setUgHotbar('torch');
      } else if (k === 'escape' || k === 'backspace') {
        this.exitUnderground();
      }
    });

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
    });

    const setVert = (v) => { ug.setMoveInput(this.ugFwd || 0, this.ugStrafe || 0, v); };
    const upBtn = document.getElementById('ug-up-btn');
    const downBtn = document.getElementById('ug-down-btn');
    upBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); setVert(1); });
    upBtn.addEventListener('pointerup', () => setVert(0));
    upBtn.addEventListener('pointerleave', () => setVert(0));
    downBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); setVert(-1); });
    downBtn.addEventListener('pointerup', () => setVert(0));
    downBtn.addEventListener('pointerleave', () => setVert(0));

    document.getElementById('ug-mine-btn').addEventListener('click', () => ug.mine());
    document.getElementById('ug-place-btn').addEventListener('click', () => ug.place());
    document.getElementById('ug-exit-btn').addEventListener('click', () => this.exitUnderground());
    document.getElementById('ug-hotbar-wall').addEventListener('click', () => this.setUgHotbar('wall'));
    document.getElementById('ug-hotbar-torch').addEventListener('click', () => this.setUgHotbar('torch'));

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
      const bug = { sprite, alive: true };
      this.bugs.push(bug);
      this.placeBug(bug);
    }
  }

  placeBug(bug) {
    bug.alive = true;
    bug.sprite.setVisible(true);
    bug.sprite.setPosition(
      Phaser.Math.Between(120, this.world.width - 120),
      Phaser.Math.Between(120, this.world.height - 120)
    );
    this.flutterBug(bug);
  }

  flutterBug(bug) {
    if (!bug.alive) return;
    const x = Phaser.Math.Clamp(bug.sprite.x + Phaser.Math.Between(-90, 90), 80, this.world.width - 80);
    const y = Phaser.Math.Clamp(bug.sprite.y + Phaser.Math.Between(-70, 70), 80, this.world.height - 80);
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
    this.time.delayedCall(BUG_RESPAWN_MS, () => this.placeBug(bug));
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
    this.updateFossilHUD();
  }

  saveFossils() {
    writeSave({ fossilsHeld: this.fossilsHeld, museumCollection: [...this.museumCollection] });
  }

  updateFossilHUD() {
    const bagEl = document.getElementById('fossil-count');
    if (bagEl) bagEl.textContent = this.fossilsHeld.length;
    const museumEl = document.getElementById('museum-count');
    if (museumEl) museumEl.textContent = this.museumCollection.size;
  }

  findNearestFossilSpot() {
    const now = Date.now();
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
    this.fossilCooldowns[spot.index] = Date.now();
    const mound = this.fossilMounds[spot.index];
    if (mound) {
      mound.setVisible(false);
      this.time.delayedCall(FOSSIL_RESPAWN_MS, () => mound.setVisible(true));
    }
    const typeIndex = Phaser.Math.Between(0, FOSSIL_TYPES.length - 1);
    this.fossilsHeld.push(typeIndex);
    this.saveFossils();
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
      this.showFloatingText(this.localBody.x, this.localBody.y - 30, "you don't have any fossils to donate");
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
    const now = Date.now();
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
    const now = Date.now();
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

  findNearestFishingSpot() {
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
    this.lifetimeStats = (saved.lifetimeStats && typeof saved.lifetimeStats === 'object') ? { ...saved.lifetimeStats } : {};
    this.achievementsUnlocked = new Set(Array.isArray(saved.achievementsUnlocked) ? saved.achievementsUnlocked : []);
    this.equippedTitle = (typeof saved.equippedTitle === 'string' && this.achievementsUnlocked.has(saved.equippedTitle)) ? saved.equippedTitle : null;
    const mine = this.allPlayers.get(this.selfData.id);
    if (mine) mine.title = this.equippedTitle;
    if (this.equippedTitle) this.net.updateTitle(this.equippedTitle);
    this.renderAchievementsPanel();
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
    writeSave({ lifetimeStats: this.lifetimeStats, achievementsUnlocked: [...this.achievementsUnlocked] });
  }

  incrementStat(key, amount = 1) {
    this.lifetimeStats[key] = (this.lifetimeStats[key] || 0) + amount;
    this.saveAchievements();
    this.checkAchievements();
  }

  checkAchievements() {
    ACHIEVEMENTS.forEach((a) => {
      if (this.achievementsUnlocked.has(a.id)) return;
      if (!a.check(this.lifetimeStats, this)) return;
      this.achievementsUnlocked.add(a.id);
      this.saveAchievements();
      this.addChatLine({ system: true, text: `🏆 Achievement unlocked: ${a.icon} ${a.label} — +${a.reward} ⭐` });
      this.awardPoint(a.reward, `${a.icon} ${a.label}!`, this.localBody.x, this.localBody.y - 44, 'achievement');
      this.renderAchievementsPanel();
    });
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
      document.getElementById('whats-new-text').textContent = ["🆕 What's new:", ...WHATS_NEW].join('\n');
      banner.classList.remove('hidden');
    } else if (!isReturningPlayer) {
      // Brand-new player has nothing to compare against — nothing to show,
      // but mark the current version seen so it doesn't pop up next time.
      writeSave({ lastSeenVersion: GAME_VERSION });
    }
    closeBtn.addEventListener('click', dismiss);
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

  exportSave() {
    const data = JSON.stringify(loadSave(), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pixeltown-save-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    this.showFloatingText(this.localBody.x, this.localBody.y - 30, 'save backed up!');
  }

  importSave(input) {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed || typeof parsed !== 'object') throw new Error('bad save file');
        localStorage.setItem(SAVE_KEY, JSON.stringify(parsed));
        this.addChatLine({ system: true, text: 'Save restored! Reloading…' });
        this.time.delayedCall(800, () => window.location.reload());
      } catch (e) {
        this.addChatLine({ system: true, text: "That doesn't look like a valid Pixeltown save file." });
      }
    };
    reader.readAsText(file);
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
    let streak = Number(saved.loginStreak) || 0;
    if (saved.lastLoginDate !== today) {
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      streak = saved.lastLoginDate === yesterday ? streak + 1 : 1;
      writeSave({ loginStreak: streak, lastLoginDate: today });
      const bonus = Math.min(streak, 5);
      this.awardPoint(bonus, `🔥 Day ${streak} streak! +${bonus} ⭐`, this.localBody.x, this.localBody.y - 44);
    }
    this.loginStreak = streak;
    const el = document.getElementById('streak-count');
    if (el) el.textContent = streak;
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
  }

  // ---------- fishing ----------

  startFishing(spot) {
    this.fishing.state = 'casting';
    this.fishing.spot = spot;
    this.fishing.bobber = this.add.circle(spot.x, spot.y, 4, 0xffffff).setDepth(-1);
    this.fishing.rod = this.add.graphics().setDepth(100000);
    const waitMs = FISH_BITE_WAIT_MIN + Math.random() * (FISH_BITE_WAIT_MAX - FISH_BITE_WAIT_MIN);
    this.fishing.timer = this.time.delayedCall(waitMs, () => this.fishBite());
  }

  updateFishingRod() {
    if (!this.fishing.rod) return;
    const rod = this.fishing.rod;
    rod.clear();
    const tipX = this.localVisual.flipX ? this.localBody.x - 8 : this.localBody.x + 8;
    const tipY = this.localBody.y - 14;
    rod.lineStyle(2, 0x6b4226, 1);
    rod.lineBetween(tipX, tipY, this.fishing.spot.x, this.fishing.spot.y - 2);
  }

  fishBite() {
    if (this.fishing.state !== 'casting') return;
    this.fishing.state = 'biting';
    if (this.fishing.bobber) this.fishing.bobber.setFillStyle(0xff4444);
    this.showFloatingText(this.fishing.spot.x, this.fishing.spot.y - 24, '❗');
    SFX.pop();
    this.fishing.timer = this.time.delayedCall(FISH_BITE_WINDOW, () => this.fishMiss());
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
      this.gainResource('fish', 1, spot.x, spot.y - 24);
      if (this.isFishTournamentTime()) this.catchTournamentFish(spot);
      this.endFishing();
    }
  }

  // ---------- daily fishing tournament ----------

  tournamentStartHour() {
    return Math.floor(this.questHash(30) * (24 - FISH_TOURNAMENT_HOURS));
  }

  isFishTournamentTime() {
    const hour = new Date().getHours();
    const start = this.tournamentStartHour();
    return hour >= start && hour < start + FISH_TOURNAMENT_HOURS;
  }

  setupFishTournament() {
    this.tournamentBonusBucket = Number(loadSave().tournamentBonusBucket) || -1;
    const { x, y } = FISH_TOURNAMENT_SIGN_POS;
    const g = this.add.graphics().setDepth(y - 1);
    g.fillStyle(0x6b4a30, 1).fillRect(x - 2, y - 4, 4, 30);
    g.fillStyle(0xe8d9b5, 1).fillRect(x - 60, y - 54, 120, 52);
    g.lineStyle(2, 0x8f7044, 1).strokeRect(x - 60, y - 54, 120, 52);
    this.tournamentSignText = this.add.text(x, y - 28, '', {
      fontSize: '8px',
      fontFamily: 'monospace',
      color: '#3a2a1a',
      align: 'center',
      wordWrap: { width: 106 },
    }).setOrigin(0.5).setDepth(y);
    this.refreshTournamentSign();
    this.net.watchTournament(this.questDayBucket(), (record) => {
      this.tournamentRecord = record;
      this.refreshTournamentSign();
    });
    this.time.addEvent({ delay: 60000, loop: true, callback: () => this.refreshTournamentSign() });
  }

  refreshTournamentSign() {
    if (!this.tournamentSignText) return;
    const start = this.tournamentStartHour();
    const end = start + FISH_TOURNAMENT_HOURS;
    const record = this.tournamentRecord;
    const recordLine = record ? `biggest: ${record.size}cm\nby ${record.name}` : 'no catches yet';
    const statusLine = this.isFishTournamentTime() ? `LIVE now! (${start}:00-${end}:00)` : `next: ${start}:00-${end}:00`;
    this.tournamentSignText.setText(['🎣 FISH TOURNEY', statusLine, recordLine].join('\n'));
  }

  catchTournamentFish(spot) {
    const sizeCm = Math.round(8 + Math.random() * 72); // 8-80cm
    this.showFloatingText(spot.x, spot.y - 40, `${sizeCm}cm!`);
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
    if (this.fishing.bobber) this.fishing.bobber.destroy();
    if (this.fishing.rod) this.fishing.rod.destroy();
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
    this.updateBuildBanner();
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
    this.localBody = this.physics.add.sprite(playerData.x, playerData.y, playerData.species, playerData.frame).setVisible(false);
    this.localBody.body.setCollideWorldBounds(true);
    this.localBody.body.setSize(16, 16).setOffset(4, 12);

    this.localVisual = this.add.sprite(playerData.x, playerData.y, playerData.species, playerData.frame);
    if (playerData.facing === -1) this.localVisual.setFlipX(true);

    this.localShadow = this.createShadow(playerData.x, playerData.y);
    this.localNameText = this.createNameText(playerData.x, playerData.y, playerData.name);
    this.localBobState = { phase: 0, lift: 0 };
  }

  addRemotePlayer(p) {
    const visual = this.add.sprite(p.x, p.y, p.species, p.frame).setFlipX(p.facing === -1);
    const shadow = this.createShadow(p.x, p.y);
    const nameText = this.createNameText(p.x, p.y, p.name);
    this.remotePlayers.set(p.id, {
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

    const bubble = this.add.text(anchor.x, anchor.y - 40, text, {
      fontSize: '11px',
      fontFamily: 'monospace',
      color: '#1c2430',
      backgroundColor: '#ffffff',
      padding: { x: 6, y: 4 },
      wordWrap: { width: 160 },
    }).setOrigin(0.5).setDepth(100001);

    if (!isLocal) {
      this.remotePlayers.get(playerId).bubble = bubble;
    }

    this.time.delayedCall(4000, () => bubble.destroy());
  }

  // ---------- world drawing ----------

  drawGround() {
    const g = this.add.graphics().setDepth(-2);
    g.fillStyle(0x6bbf59, 1).fillRect(0, 0, this.world.width, this.world.height);
    g.fillStyle(0x5aa84c, 1);
    for (let gx = 16; gx < this.world.width; gx += 48) {
      for (let gy = 16; gy < this.world.height; gy += 48) {
        if ((gx / 48 + gy / 48) % 3 === 0) g.fillRect(gx, gy, 4, 4);
      }
    }
  }

  drawPath() {
    const g = this.add.graphics().setDepth(-1);
    g.fillStyle(0xc9ab7a, 1);
    g.fillRect(0, 600 - 32, this.world.width, 64);
    g.fillRect(800 - 32, 0, 64, this.world.height);
    g.fillStyle(0xd9c294, 1);
    g.fillCircle(800, 600, 150);
  }

  drawPond() {
    const cx = 260;
    const cy = 600;
    const rx = 150;
    const ry = 90;
    const g = this.add.graphics().setDepth(-1);
    g.fillStyle(0x3a86c8, 1).fillEllipse(cx, cy, rx * 2, ry * 2);
    g.fillStyle(0x5ab0e8, 1).fillEllipse(cx - 20, cy - 15, rx * 1.3, ry * 0.9);
    g.fillStyle(0x8fd0f2, 1).fillEllipse(cx - 35, cy - 28, rx * 0.7, ry * 0.45);

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
    const g = this.add.graphics().setDepth(-1);
    g.fillStyle(0x8a5a3b, 1);
    g.fillRect(baseX, baseY - 14, 70, 28);
    g.lineStyle(2, 0x5a3a22, 1);
    for (let i = 0; i <= 70; i += 14) g.lineBetween(baseX + i, baseY - 14, baseX + i, baseY + 14);
    g.fillStyle(0x5a3a22, 1);
    [baseX + 6, baseX + 64].forEach((x) => g.fillRect(x - 3, baseY + 12, 6, 10));
  }

  // A few sittable-looking (purely decorative) benches scattered around
  // town — no collision, no interact handler, just scenery.
  drawBenches() {
    const spots = [
      { x: 760, y: 560 }, { x: 1620, y: 640 }, { x: 1950, y: 720 },
    ];
    spots.forEach(({ x, y }) => {
      const g = this.add.graphics().setDepth(y - 1);
      g.fillStyle(0x6b4226, 1);
      g.fillRect(x - 18, y - 4, 36, 8);
      g.fillRect(x - 18, y - 14, 36, 4);
      g.fillStyle(0x4a2e18, 1);
      g.fillRect(x - 16, y + 4, 4, 8);
      g.fillRect(x + 12, y + 4, 4, 8);
    });
  }

  // A small spooky corner tying into the zombie species — a few
  // tombstones behind a low fence, one zombie villager standing watch.
  // Purely decorative; the tombstone footprints are solid, the fence
  // gap isn't, so you can still walk in and look around.
  drawGraveyard() {
    const { x, y } = GRAVEYARD_POS;
    const g = this.add.graphics().setDepth(y - 2);
    g.fillStyle(0x3a4a38, 1).fillRect(x - 70, y - 50, 140, 90);
    g.lineStyle(3, 0x5a6a52, 1).strokeRect(x - 70, y - 50, 140, 90);

    const stones = [{ x: x - 36, y: y - 10 }, { x: x, y: y - 6 }, { x: x + 36, y: y - 14 }];
    stones.forEach((s) => {
      const sg = this.add.graphics().setDepth(s.y);
      sg.fillStyle(0x9a9a9a, 1);
      sg.fillRect(s.x - 10, s.y - 18, 20, 22);
      sg.fillEllipse(s.x, s.y - 18, 20, 14);
      this.addObstacleRect({ x: s.x - 9, y: s.y - 10, width: 18, height: 10 });
    });

    const zombie = this.add.sprite(x + 50, y + 18, 'zombies', 0).setScale(1.8).setDepth(y + 19);
    this.tweens.add({ targets: zombie, y: y + 14, duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.add.text(x, y - 68, '🪦 Old Graveyard', {
      fontSize: '11px',
      fontFamily: 'monospace',
      color: '#c9d4c0',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(y + 1);
  }

  drawPondCats() {
    POND_CATS.forEach(({ y, frame, range }) => {
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
    const g = this.add.graphics().setDepth(-1);
    g.fillStyle(0x3a86c8, 1).fillEllipse(cx, cy, rx * 2, ry * 2);
    g.fillStyle(0x5ab0e8, 1).fillEllipse(cx - 15, cy - 12, rx * 1.3, ry * 0.9);
    g.fillStyle(0x8fd0f2, 1).fillEllipse(cx - 28, cy - 22, rx * 0.7, ry * 0.45);
    this.addObstacleRect({ x: cx - rx * 0.8, y: cy - ry * 0.8, width: rx * 1.6, height: ry * 1.6 });
  }

  drawBridge() {
    const cx = 260;
    const cy = 600;
    const g = this.add.graphics().setDepth(-1);
    g.fillStyle(0xa9784a, 1).fillRect(cx - 40, cy - 34, 80, 68);
    g.fillStyle(0x8a5f39, 1);
    for (let px = cx - 40; px < cx + 40; px += 10) g.fillRect(px, cy - 34, 2, 68);
    g.fillStyle(0x6b4226, 1);
    g.fillRect(cx - 40, cy - 36, 80, 4);
    g.fillRect(cx - 40, cy + 32, 80, 4);
  }

  drawHouse() {
    const { x, y, w, h } = HOUSE_POS;
    const g = this.add.graphics();
    g.fillStyle(0x8a5a3b, 1).fillRect(x, y, w, h);
    g.fillStyle(0xd9663b, 1).fillTriangle(x - 10, y, x + w + 10, y, x + w / 2, y - 45);
    g.fillStyle(0x5a3a22, 1).fillRect(x + w / 2 - 10, y + h - 28, 20, 28);
    g.fillStyle(0xcfe8f5, 1);
    g.fillRect(x + 16, y + 14, 20, 20);
    g.fillRect(x + w - 36, y + 14, 20, 20);
    g.setDepth(y + h);

    this.add.text(x + w / 2, y - 55, '🏠 Shop', { fontSize: '16px' }).setOrigin(0.5).setDepth(y + h + 1);
    const deal = this.todaysDeal();
    this.add.text(x + w / 2, y - 38, `💰 ${deal.icon} +50% today`, { fontSize: '11px', color: '#2a6b2a' }).setOrigin(0.5).setDepth(y + h + 1);
    this.addObstacleRect({ x, y: y + 20, width: w, height: h - 20 });
  }

  // Same deterministic wall-clock-hash trick as the daily quest — a
  // different resource sells for a flat +50% each day, same for everyone.
  todaysDeal() {
    return QUEST_RESOURCES[Math.floor(this.questHash(40) * QUEST_RESOURCES.length)];
  }

  drawMuseum() {
    const { x, y, w, h } = MUSEUM_POS;
    const g = this.add.graphics();
    g.fillStyle(0xd8d0bc, 1).fillRect(x, y, w, h);
    g.fillStyle(0x8f8568, 1).fillTriangle(x - 10, y, x + w + 10, y, x + w / 2, y - 40);
    g.fillStyle(0x6b6250, 1);
    for (let i = 0; i < 4; i++) g.fillRect(x + 10 + i * 22, y + 16, 10, h - 20);
    g.setDepth(y + h);
    this.add.text(x + w / 2, y - 50, '🏛️ Museum', { fontSize: '14px' }).setOrigin(0.5).setDepth(y + h + 1);
    this.addObstacleRect({ x, y: y + 16, width: w, height: h - 16 });
  }

  drawAbleSisters() {
    const { x, y, w, h } = ABLE_SISTERS_POS;
    const g = this.add.graphics();
    g.fillStyle(0xd88fb0, 1).fillRect(x, y, w, h);
    g.fillStyle(0xe8b8d0, 1).fillTriangle(x - 8, y, x + w + 8, y, x + w / 2, y - 34);
    g.fillStyle(0xcfe8f5, 1).fillRect(x + w / 2 - 10, y + 14, 20, 18);
    g.setDepth(y + h);
    this.add.text(x + w / 2, y - 44, '👗 Able Sisters', { fontSize: '12px' }).setOrigin(0.5).setDepth(y + h + 1);
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
    const g = this.add.graphics().setDepth(y - 1);
    g.fillStyle(0x6b4a30, 1).fillRect(x - 3, y - 6, 6, 34);
    g.fillStyle(0xe8d9b5, 1);
    g.fillTriangle(x - 26, y - 6, x, y - 22, x, y - 6);
    g.fillTriangle(x + 26, y - 6, x, y - 22, x, y - 6);
    g.lineStyle(1, 0x8f7044, 1);
    g.lineBetween(x, y - 22, x, y - 6);
    this.add.text(x, y - 42, '📖 Guestbook', { fontSize: '12px' }).setOrigin(0.5).setDepth(y + 1);
  }

  isNearGuestbook() {
    return Math.hypot(this.localBody.x - GUESTBOOK_POS.x, this.localBody.y - GUESTBOOK_POS.y) < GUESTBOOK_RADIUS;
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
    const species = SPECIES[Math.floor(Math.random() * SPECIES.length)];
    this.outfitSpecies = species.key;
    this.outfitFrame = Math.floor(Math.random() * FRAME_COUNT);
    this.renderOutfitTabs();
    this.renderOutfitGrid();
    SFX.pop();
  }

  renderOutfitTabs() {
    const el = document.getElementById('outfit-species-tabs');
    el.innerHTML = '';
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
    this.localVisual.setTexture(this.outfitSpecies, this.outfitFrame);
    this.localBody.setTexture(this.outfitSpecies, this.outfitFrame);
    writeSave({ species: this.outfitSpecies, frame: this.outfitFrame });
    this.net.updateAppearance(this.outfitSpecies, this.outfitFrame);
    this.closeOutfitShop();
    this.showFloatingText(this.localBody.x, this.localBody.y - 30, 'new look!');
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

    this.net.leaveGuestbookNote(text);
    this.lastGuestbookAt = now;
    input.value = '';
  }

  drawTurnipStall() {
    const { x, y } = TURNIP_STALL_POS;
    const g = this.add.graphics().setDepth(y - 1);
    g.fillStyle(0x7a4a26, 1).fillRect(x - 26, y - 4, 52, 18);
    g.fillStyle(0xd9663b, 1).fillTriangle(x - 32, y - 4, x + 32, y - 4, x, y - 30);
    this.add.text(x, y - 46, '🥬 Turnips', { fontSize: '12px' }).setOrigin(0.5).setDepth(y + 1);
    this.turnipBuyLabel = this.add.text(x, y + 20, '', { fontSize: '11px', color: '#ffe066' }).setOrigin(0.5).setDepth(y + 1);
    this.turnipSellLabel = this.add.text(HOUSE_POS.x + HOUSE_POS.w / 2, HOUSE_POS.y - 38, '', { fontSize: '11px', color: '#6fbf73' }).setOrigin(0.5).setDepth(HOUSE_POS.y + 1);
  }

  updateTurnipPriceLabels(time) {
    if (time - (this.lastTurnipLabelAt || 0) < 1000) return;
    this.lastTurnipLabelAt = time;
    if (this.turnipBuyLabel) this.turnipBuyLabel.setText(`${this.turnipBuyPrice()} ⭐ / ${TURNIP_BUNDLE}`);
    if (this.turnipSellLabel) this.turnipSellLabel.setText(`sells ${this.turnipSellPrice()} ⭐ / ${TURNIP_BUNDLE}`);
  }

  drawFossilSpots() {
    this.fossilMounds = FOSSIL_SPOTS.map(({ x, y }) => {
      const g = this.add.graphics().setDepth(y - 1);
      g.fillStyle(0x7a5a38, 1).fillEllipse(x, y, 34, 18);
      g.fillStyle(0x8f7044, 1).fillEllipse(x, y - 3, 22, 10);
      return g;
    });
  }

  // ---------- beachcombing ----------
  // Fixed spots along the pond edges, same shape as the fishing spots:
  // walk up, interact, a short cooldown before it washes up again.
  // Local-only, like every other activity here.

  drawFlowers() {
    this.flowerCooldowns = {};
    this.flowerSprites = FLOWER_SPOTS.map(({ x, y }) => {
      const symbol = FLOWER_TYPES[Phaser.Math.Between(0, FLOWER_TYPES.length - 1)];
      return this.add.text(x, y, symbol, { fontSize: '18px' }).setOrigin(0.5).setDepth(y);
    });
  }

  findNearestFlower() {
    const now = Date.now();
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
    this.flowerCooldowns[spot.index] = Date.now();
    const sprite = this.flowerSprites[spot.index];
    if (sprite) {
      sprite.setVisible(false);
      this.time.delayedCall(FLOWER_REGROW_MS, () => {
        sprite.setText(FLOWER_TYPES[Phaser.Math.Between(0, FLOWER_TYPES.length - 1)]);
        sprite.setVisible(true);
      });
    }
    this.gainResource('flowers', 1, spot.x, spot.y - 16);
  }

  drawBeachItems() {
    this.beachCooldowns = {};
    this.beachSprites = BEACH_SPOTS.map(({ x, y }) => {
      const symbol = BEACH_ITEMS[Phaser.Math.Between(0, BEACH_ITEMS.length - 1)];
      return this.add.text(x, y, symbol, { fontSize: '16px' }).setOrigin(0.5).setDepth(y);
    });
  }

  findNearestBeachItem() {
    const now = Date.now();
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
    this.beachCooldowns[spot.index] = Date.now();
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
    const { x, y } = STATUE_POS;
    const g = this.add.graphics();
    g.fillStyle(0x9a9a9a, 1).fillRect(x - 24, y, 48, 14);
    g.fillStyle(0x7d7d7d, 1).fillRect(x - 18, y - 10, 36, 10);
    g.setDepth(y - 1);

    const ape = this.add.sprite(x, y - 28, 'boredapes', 0).setScale(2.3).setDepth(y);
    this.add.text(x, y - 68, '🐵 Mayor', {
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

    const g = this.add.graphics();
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
    const hour = new Date().getHours();
    const start = this.merchantStartHour();
    return hour >= start && hour < start + 3;
  }

  drawMerchant() {
    const { x, y } = MERCHANT_POS;
    const species = this.merchantSpecies();
    this.merchantSprite = this.add.sprite(x, y, species.key, 0).setScale(1.8).setDepth(y);
    this.merchantSign = this.add.text(x, y - 34, '', {
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
      this.merchantSign.setText(`🛒 Mystery Merchant\nselling: ${species.label}`);
    } else {
      this.merchantSprite.setVisible(false);
      const hour = new Date().getHours();
      const todayStart = this.merchantStartHour();
      // If today's window hasn't started yet, that's the next visit. If
      // it already started and ended (or we're just not in it anymore),
      // the next visit is tomorrow — with tomorrow's own hashed hour,
      // not today's stale one.
      const nextIsToday = hour < todayStart;
      const nextStart = nextIsToday ? todayStart : this.merchantStartHour(1);
      const whenLabel = nextIsToday ? 'today' : 'tomorrow';
      this.merchantSign.setText(`🛒 closed — back at ${nextStart}:00 ${whenLabel}`);
    }
  }

  isNearMerchant() {
    return this.isMerchantVisiting() && Phaser.Math.Distance.Between(this.localBody.x, this.localBody.y, MERCHANT_POS.x, MERCHANT_POS.y) < MERCHANT_RADIUS;
  }

  buyFromMerchant() {
    if ((this.localScore || 0) < MERCHANT_COST) {
      this.showFloatingText(this.localBody.x, this.localBody.y - 30, `need ${MERCHANT_COST}⭐`);
      return;
    }
    const species = this.merchantSpecies();
    const frame = Math.floor(this.merchantHash(3) * 9);
    this.selfData.species = species.key;
    this.selfData.frame = frame;
    this.localVisual.setTexture(species.key, frame);
    this.localBody.setTexture(species.key, frame);
    writeSave({ species: species.key, frame });
    this.net.updateAppearance(species.key, frame);
    this.awardPoint(-MERCHANT_COST, `🛒 bought ${species.label}!`, this.localBody.x, this.localBody.y - 30, 'sell');
    this.incrementStat('merchantBuys');
  }

  drawNPC() {
    const { x, y } = NPC_POS;
    const sprite = this.add.sprite(x, y, 'genius', 2).setScale(2).setDepth(y);
    this.tweens.add({ targets: sprite, y: y - 4, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.add.text(x, y - 36, NPC_NAME, {
      fontSize: '11px',
      fontFamily: 'monospace',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(y + 1);
    this.npcBubble = this.add.text(x, y - 56, '', {
      fontSize: '11px',
      color: '#1c2430',
      backgroundColor: '#ffe066',
      padding: { x: 8, y: 5 },
      wordWrap: { width: 180 },
      align: 'center',
    }).setOrigin(0.5, 1).setDepth(y + 2).setVisible(false);
    this.npcQuestSign = this.add.text(x, y - 46, '', {
      fontSize: '10px',
      fontFamily: 'monospace',
      color: '#6fbf73',
      stroke: '#000000',
      strokeThickness: 3,
      align: 'center',
      wordWrap: { width: 150 },
    }).setOrigin(0.5).setDepth(y + 1);
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
    const pool = (this.isRainWindow(Date.now()) && Math.random() < 0.5) ? NPC_RAIN_LINES : NPC_LINES;
    const line = pool[Math.floor(Math.random() * pool.length)];
    this.npcBubble.setText(line).setVisible(true);
    if (this.npcBubbleTimer) this.npcBubbleTimer.remove();
    this.npcBubbleTimer = this.time.delayedCall(4200, () => this.npcBubble.setVisible(false));
    this.incrementStat('npcChats');
    SFX.pop();
  }

  // ---------- Second resident NPC (dockside, no quest, flavor only) ----------

  drawNPC2() {
    const { x, y } = NPC2_POS;
    const sprite = this.add.sprite(x, y, 'doge', 4).setScale(2).setDepth(y);
    this.tweens.add({ targets: sprite, y: y - 4, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.add.text(x, y - 36, NPC2_NAME, {
      fontSize: '11px',
      fontFamily: 'monospace',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(y + 1);
    this.npc2Bubble = this.add.text(x, y - 46, '', {
      fontSize: '11px',
      color: '#1c2430',
      backgroundColor: '#ffe066',
      padding: { x: 8, y: 5 },
      wordWrap: { width: 180 },
      align: 'center',
    }).setOrigin(0.5, 1).setDepth(y + 2).setVisible(false);
    this.addObstacleRect({ x: x - 10, y: y - 6, width: 20, height: 20 });
  }

  isNearNPC2() {
    return Phaser.Math.Distance.Between(this.localBody.x, this.localBody.y, NPC2_POS.x, NPC2_POS.y) < NPC2_RADIUS;
  }

  talkToNPC2() {
    const pool = (this.isRainWindow(Date.now()) && Math.random() < 0.5) ? NPC2_RAIN_LINES : NPC2_LINES;
    const line = pool[Math.floor(Math.random() * pool.length)];
    this.npc2Bubble.setText(line).setVisible(true);
    if (this.npc2BubbleTimer) this.npc2BubbleTimer.remove();
    this.npc2BubbleTimer = this.time.delayedCall(4200, () => this.npc2Bubble.setVisible(false));
    this.incrementStat('npc2Chats');
    SFX.pop();
  }

  drawCampfire() {
    const { x, y } = CAMPFIRE_POS;
    const logs = this.add.graphics().setDepth(-1);
    logs.fillStyle(0x6b4226, 1);
    logs.fillRect(x - 16, y - 3, 32, 6);
    logs.fillRect(x - 4, y - 14, 8, 28);

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

  concertWindowKey() {
    const now = new Date();
    return `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}`;
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
    if (this.kkEnjoyedWindow === key) {
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
    const g = this.add.graphics().setDepth(-1);
    g.fillStyle(0x1a1410, 1).fillEllipse(x, y, 42, 26);
    g.fillStyle(0x100b08, 1).fillEllipse(x, y, 28, 16);
    this.add.text(x, y - 26, '⛏️ Hole', { fontSize: '12px' }).setOrigin(0.5).setDepth(y + 1);
  }

  drawDoor(x, y, label, color) {
    const g = this.add.graphics().setDepth(y - 1);
    g.fillStyle(0x3a2a1a, 1).fillRect(x - 16, y - 46, 32, 46);
    g.fillStyle(color, 0.85).fillRect(x - 12, y - 42, 24, 38);
    g.fillStyle(0xffffff, 0.9).fillCircle(x + 7, y - 22, 2);
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

  drawTree(x, y) {
    const g = this.add.graphics();
    g.fillStyle(0x5a3a22, 1).fillRect(-4, -4, 8, 16);
    g.fillStyle(0x3f8f4f, 1).fillCircle(0, -20, 17);
    g.fillStyle(0x4fa85f, 1).fillCircle(-11, -12, 13);
    g.fillStyle(0x4fa85f, 1).fillCircle(11, -12, 13);
    g.fillStyle(0x5cb86a, 1).fillCircle(0, -28, 12);
    g.setPosition(x, y);
    g.setDepth(y);
    this.addObstacleRect({ x: x - 5, y: y - 3, width: 10, height: 12 });
    this.treeGraphics.push(g);

    const index = this.treeGraphics.length - 1;
    if (index % FRUIT_TREE_EVERY === 0) {
      const fruit = this.add.graphics();
      fruit.fillStyle(0xe0453a, 1);
      fruit.fillCircle(-9, -14, 3.5).fillCircle(8, -19, 3.5).fillCircle(1, -29, 3.5);
      fruit.setPosition(x, y).setDepth(y + 0.5);
      this.treeFruit[index] = fruit;
    }
  }

  drawTulipBeds() {
    TULIP_BEDS.forEach((bed) => {
      bed.frames.forEach((frame, i) => {
        const px = bed.x + i * 20 - ((bed.frames.length - 1) * 10);
        this.add.sprite(px, bed.y, 'tulips', frame).setDepth(-1);
      });
    });
  }

  drawRocks() {
    ROCKS.forEach(([x, y, frame]) => {
      this.add.sprite(x, y, 'rocks', frame).setDepth(-1);
    });
  }

  drawPunkRocks() {
    PUNK_ROCKS.forEach(([x, y, frame]) => {
      this.add.sprite(x, y, 'punkrocks', frame).setDepth(-1);
    });
  }

  addObstacleRect({ x, y, width, height }) {
    const rect = this.add.rectangle(x + width / 2, y + height / 2, width, height, 0x000000, 0).setVisible(false);
    this.physics.add.existing(rect, true);
    this.obstacles.add(rect);
    return rect;
  }

  // ---------- networking ----------

  registerNetHandlers() {
    this.net.on('playerJoined', (p) => {
      if (this.remotePlayers.has(p.id)) return;
      this.allPlayers.set(p.id, p);
      this.addRemotePlayer(p);
      this.renderPlayerList();
    });

    this.net.on('playerLeft', (id) => {
      this.allPlayers.delete(id);
      this.removeRemotePlayer(id);
      this.renderPlayerList();
    });

    this.net.on('playerUpdated', (d) => {
      const rp = this.remotePlayers.get(d.id);
      if (!rp) return;
      rp.targetX = d.x;
      rp.targetY = d.y;
      rp.facing = d.facing;
      if (d.species && (d.species !== rp.species || d.frame !== rp.frame)) {
        rp.species = d.species;
        rp.frame = d.frame;
        rp.visual.setTexture(d.species, d.frame);
      }

      const known = this.allPlayers.get(d.id);
      if (known && (known.score !== d.score || known.title !== d.title)) {
        known.score = d.score || 0;
        known.title = d.title || null;
        this.renderPlayerList();
      }

      if (d.emote && d.emoteAt && this.lastEmoteAt.get(d.id) !== d.emoteAt) {
        this.lastEmoteAt.set(d.id, d.emoteAt);
        this.showEmoteBubble(d.id, d.emote);
      }
    });

    this.net.on('chat', (msg) => {
      this.addChatLine({ name: msg.name, text: msg.text });
      if (!msg.isOld) this.showChatBubble(msg.id, msg.text);
    });

    this.net.on('selfRemoved', () => {
      this.addChatLine({ system: true, text: 'Lost your spot in town (connection dropped). You can still look around, but refresh to fully rejoin.' });
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

  // ---------- DOM: chat + player list ----------

  registerChatUI() {
    const chatInput = document.getElementById('chat-input');

    chatInput.addEventListener('focus', () => { this.chatFocused = true; });
    chatInput.addEventListener('blur', () => { this.chatFocused = false; });

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

    document.getElementById('chat-send-btn').addEventListener('click', () => this.sendChatMessage());
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
    if (text) {
      this.net.sendChat(text);
      this.incrementStat('chatSent');
      this.lastChatText = text;
      this.lastChatTextAt = Date.now();
    }
    chatInput.value = '';
    chatInput.blur();
  }

  addChatLine({ name, text, system }) {
    const chatLog = document.getElementById('chat-log');
    const line = document.createElement('div');
    line.className = system ? 'chat-line system' : 'chat-line';

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

    chatLog.appendChild(line);
    chatLog.scrollTop = chatLog.scrollHeight;
    document.getElementById('chat-clear-btn').classList.remove('hidden');

    while (chatLog.children.length > 50) chatLog.removeChild(chatLog.firstChild);
  }

  drawNoticeBoard() {
    const x = 1350;
    const y = 520;
    const g = this.add.graphics().setDepth(y - 1);
    g.fillStyle(0x6b4a30, 1).fillRect(x - 2, y - 4, 4, 30);
    g.fillStyle(0xe8d9b5, 1).fillRect(x - 55, y - 54, 110, 52);
    g.lineStyle(2, 0x8f7044, 1).strokeRect(x - 55, y - 54, 110, 52);
    this.noticeBoardText = this.add.text(x, y - 28, '', {
      fontSize: '8px',
      fontFamily: 'monospace',
      color: '#3a2a1a',
      align: 'center',
      wordWrap: { width: 96 },
    }).setOrigin(0.5).setDepth(y);
  }

  updateNoticeBoard(sorted) {
    if (!this.noticeBoardText) return;
    const top3 = sorted.slice(0, 3);
    const lines = top3.length
      ? top3.map((p, i) => `${['🥇', '🥈', '🥉'][i]} ${censorBlockedTerms(p.name).slice(0, 8)} ${p.score || 0}`)
      : ['no scores yet'];
    this.noticeBoardText.setText(['TOP SCORES', ...lines].join('\n'));
  }

  renderPlayerList() {
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
        star.title = `Set ${p.name} as your walkie-talkie bestie`;
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
    this.bestieId = savedProfile.bestieId || null;
    this.bestieName = savedProfile.bestieName || null;
    this.voiceMemos = [];
    this.recording = false;
    this.updateBestieLabel();

    if (this.net.db && this.net.id) {
      this.walkieRef = this.net.db.ref(`walkie/${this.net.id}`);
      this.walkieRef.on('child_added', (snap) => {
        const v = snap.val();
        if (!v || !v.data) return;
        const memo = { key: snap.key, from: v.from, fromName: v.fromName || 'someone', data: v.data, mime: v.mime || 'audio/webm' };
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
      if (this.chatFocused || this.inUnderground) return;
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

// ---------------- join overlay ----------------

const nameInput = document.getElementById('name-input');
const speciesTabsEl = document.getElementById('species-tabs');
const avatarGridEl = document.getElementById('avatar-grid');
const joinBtn = document.getElementById('join-btn');
const joinError = document.getElementById('join-error');
const joinOverlay = document.getElementById('join-overlay');
const hud = document.getElementById('hud');

let savedProfile = loadSave();
let selectedSpecies = SPECIES.some((s) => s.key === savedProfile.species) ? savedProfile.species : SPECIES[0].key;
let selectedFrame = Number.isInteger(savedProfile.frame) && savedProfile.frame >= 0 && savedProfile.frame < FRAME_COUNT
  ? savedProfile.frame
  : 0;
if (savedProfile.name) nameInput.value = savedProfile.name;

function renderSpeciesTabs() {
  speciesTabsEl.innerHTML = '';
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
}

nameInput.addEventListener('input', updateJoinButtonState);
nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !joinBtn.disabled) attemptJoin();
});
joinBtn.addEventListener('click', attemptJoin);

function attemptJoin() {
  const name = nameInput.value.trim();
  if (!name) return;
  if (containsBlockedTerm(name)) {
    joinError.textContent = 'Please pick a different name.';
    return;
  }
  joinBtn.disabled = true;
  joinError.textContent = '';
  writeSave({ name, species: selectedSpecies, frame: selectedFrame });

  const net = new TownNet();
  let joined = false;

  net.on('configMissing', () => {
    joinError.textContent = 'Not connected to a Firebase project yet — see game/firebase-config.js.';
    joinBtn.disabled = false;
  });
  net.on('townFull', () => {
    joinError.textContent = 'Town is full right now (10 max) — try again shortly.';
    joinBtn.disabled = false;
  });
  net.on('error', (text) => {
    joinError.textContent = text;
    joinBtn.disabled = false;
  });
  net.on('init', (data) => {
    if (joined) return;
    joined = true;
    joinOverlay.classList.add('hidden');
    hud.classList.remove('hidden');
    startTown(net, data);
  });

  net.join({ name, species: selectedSpecies, frame: selectedFrame });
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

  const resizeToViewport = () => {
    const size = viewportSize();
    game.scale.resize(size.width, size.height);
  };
  window.addEventListener('resize', resizeToViewport);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', resizeToViewport);
  }
  // Standalone launches settle their real viewport a beat after load, so
  // double-check shortly after start rather than only on resize events.
  setTimeout(resizeToViewport, 150);
  setTimeout(resizeToViewport, 600);
}

renderSpeciesTabs();
renderAvatarGrid();
updateJoinButtonState();

// A lightweight, read-only peek at how many villagers are in town right
// now, shown on the join screen before this player has actually joined.
const joinScreenNet = new TownNet();
const onlineCountEl = document.getElementById('online-count');
joinScreenNet.watchOnlineCount((count) => {
  if (!onlineCountEl) return;
  onlineCountEl.textContent = count === null ? '' : `🟢 ${count} villager${count === 1 ? '' : 's'} in town right now`;
});
