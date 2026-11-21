// MMUnlocks: pure ability unlock tree for the Mad Maze arena (CLASS-WEAPON-BUILD-PLAN.md section d).
// No DOM, no globals, no randomness. Nodes are auto-granted by the arena level (1-20); input is never mutated.
// Every returned node/descriptor is a fresh deep copy, so callers cannot corrupt the tables.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMUnlocks = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const LEVELS = [4, 9, 14, 19];
  const KINDS = ['active', 'passive', 'sig', 'mastery'];
  const MAX_SEEN = 64;
  const ID_RE = /^[a-z][A-Za-z0-9]{1,15}_(4|9|11|14|16|19)$/;

  // Mod constructors. ab() mode: 'set' (default), 'mul' (multiply the field) or 'add'.
  const mul = (stat, v) => ({ op: 'mul', stat, v });
  const onHit = (status, chance, sec) => ({ op: 'onHit', status, chance, sec: sec || 0 });
  const sig = (field, v) => ({ op: 'sig', field, v });
  const proc = (on, give, v, icd, extra) => Object.assign({ op: 'proc', on, give, v, icd: icd || 0 }, extra || {});
  const ab = (ability, field, v, mode) => ({ op: 'ab', ability, field, v, mode: mode || 'set' });

  const N = (cls, lv, kind, name, short, text, mods) => ({ id: cls + '_' + lv, lv, kind, name, short, text, mods });

  const TABLE = {
    ranger: [
      N('ranger', 4, 'passive', 'Keen Eye', 'Keen Eye', 'Bolts fly 15% farther.', [mul('life', 1.15)]),
      N('ranger', 9, 'passive', "Hunter's Mark", 'Mark', 'Hits mark enemies 15% of the time.', [onHit('marked', 0.15, 3)]),
      N('ranger', 14, 'sig', 'Volley+', 'Volley+', 'Volley fires 16 bolts and recharges in 10 s.', [sig('count', 16), sig('cooldown', 10)]),
      N('ranger', 19, 'mastery', 'Wind Archer', 'Wind', 'Every 4th volley gains +1 pierce.', [ab('sig', 'pierceEvery', 4)]),
    ],
    frostcaller: [
      N('frostcaller', 4, 'passive', 'Chill', 'Chill', 'Hits slow enemies 20% of the time.', [onHit('slowed', 0.2, 2)]),
      N('frostcaller', 9, 'passive', 'Glacial Focus', 'Glacial', 'Invulnerability +5%, speed +10%.', [mul('iframes', 1.05), mul('speed', 1.1)]),
      N('frostcaller', 14, 'sig', 'Blizzard+', 'Blizzard+', 'Blizzard radius 180 and a stronger slow.', [sig('radius', 180), sig('slow', 0.35)]),
      N('frostcaller', 19, 'mastery', 'Shatter', 'Shatter', 'Slowed enemies take 12% more damage.', [ab('passive', 'slowedTaken', 1.12)]),
    ],
    herald: [
      N('herald', 4, 'passive', 'Good Dog', 'Good Dog', 'Healing for 3 s at wave start or zone entry.', [proc('waveStart', 'healing', 3, 0)]),
      N('herald', 9, 'passive', 'Fetch', 'Fetch', 'Damage +4%.', [mul('dmg', 1.04)]),
      N('herald', 14, 'sig', 'Aura+', 'Aura+', 'Aura heals 40 and grants armored for 3 s.', [sig('heal', 40), proc('sigCast', 'armored', 3, 0)]),
      N('herald', 19, 'mastery', 'Pack Leader', 'Pack', 'Casting the signature grants damaging for 3 s.', [proc('sigCast', 'damaging', 3, 0)]),
    ],
    punk: [
      N('punk', 4, 'passive', 'Feedback', 'Feedback', 'A block grants berserk for 2 s.', [proc('block', 'berserk', 2, 0)]),
      N('punk', 9, 'passive', 'Distortion', 'Distort', 'Hits daze enemies 15% of the time.', [onHit('dazed', 0.15, 2)]),
      N('punk', 14, 'sig', 'Mosh+', 'Mosh+', 'Mosh shield blocks 4 hits in a wider radius.', [sig('shield', 4), sig('radius', 100)]),
      N('punk', 19, 'mastery', 'Encore', 'Encore', 'Every 10 kills refund 3 s of the signature cooldown.', [proc('kill', 'cdRefund', 3, 0, { every: 10 })]),
    ],
    bruiser: [
      N('bruiser', 4, 'passive', 'Thick Hide', 'Hide', 'Max health +6%.', [mul('hp', 1.06)]),
      N('bruiser', 9, 'passive', 'Haymaker', 'Haymaker', '15% of hits knock enemies back 20 px.', [ab('passive', 'knockChance', 0.15), ab('passive', 'knockPx', 20)]),
      N('bruiser', 14, 'sig', 'Pound+', 'Pound+', 'Ground Pound radius 150 and stuns for 0.8 s.', [sig('radius', 150), ab('sig', 'stunSec', 0.8)]),
      N('bruiser', 19, 'mastery', 'Primal', 'Primal', 'Below 40% health you go berserk.', [proc('lowHp', 'berserk', 4, 0, { below: 0.4 })]),
    ],
    graveTender: [
      N('graveTender', 4, 'passive', 'Grave Chill', 'Chill', 'Hits weaken enemies 15% of the time.', [onHit('weak', 0.15, 3)]),
      N('graveTender', 9, 'passive', 'Soul Sip', 'Soul Sip', 'A kill heals 2.', [proc('kill', 'heal', 2, 0)]),
      N('graveTender', 14, 'sig', 'Siphon+', 'Siphon+', 'Siphon steals 65% and heals up to 35.', [sig('healFrac', 0.65), sig('heal', 35)]),
      N('graveTender', 19, 'mastery', 'Mortician', 'Mortician', 'Weakened enemies take 10% more damage.', [ab('passive', 'weakTaken', 1.1)]),
    ],
    trickster: [
      N('trickster', 4, 'passive', 'Slippery', 'Slippery', 'Dash cooldown 13% shorter.', [ab('dash', 'cooldown', 0.87, 'mul')]),
      N('trickster', 9, 'passive', 'Ray Bounce', 'Bounce', 'Bolts bounce one more time.', [ab('passive', 'bounce', 1, 'add')]),
      N('trickster', 14, 'sig', 'Blink+', 'Blink+', 'Blink fires 7 bolts and the decoy lasts 1.5 s.', [sig('count', 7), ab('sig', 'decoySec', 1.5)]),
      N('trickster', 19, 'mastery', 'Probe', 'Probe', 'Hits mark enemies 12% of the time.', [onHit('marked', 0.12, 3)]),
    ],
    shadowPaw: [
      N('shadowPaw', 4, 'passive', 'Light Step', 'Light', 'Speed +5%.', [mul('speed', 1.05)]),
      N('shadowPaw', 9, 'passive', 'Bleeding Stars', 'Bleed', 'Hits make enemies bleed 15% of the time.', [onHit('bleed', 0.15, 3)]),
      N('shadowPaw', 14, 'sig', 'Smoke+', 'Smoke+', 'Smoke Step fires 9 bolts and lasts longer.', [ab('sig', 'iframes', 1.1), sig('count', 9)]),
      N('shadowPaw', 19, 'mastery', 'Assassin', 'Assassin', 'Crit chance +5% against bleeding enemies.', [ab('passive', 'critVsBleed', 0.05)]),
    ],
    rogue: [
      N('rogue', 4, 'passive', 'Quick Hands', 'Quick', 'Fire rate +4%.', [mul('rate', 1.04)]),
      N('rogue', 9, 'passive', 'Venom', 'Venom', 'Hits make enemies bleed 15% of the time.', [onHit('bleed', 0.15, 3)]),
      N('rogue', 14, 'sig', 'Dash+', 'Dash+', 'Shadow Dash goes 180 px and fires 9 bolts.', [sig('dist', 180), sig('count', 9)]),
      N('rogue', 19, 'mastery', 'Shadowmeld', 'Meld', 'After a dash, the next 3 volleys crit.', [proc('sigCast', 'crit', 3, 0)]),
    ],
    warlock: [
      N('warlock', 4, 'passive', 'Hex', 'Hex', 'Hits curse enemies 15% of the time.', [onHit('curse', 0.15, 4)]),
      N('warlock', 9, 'passive', 'Dark Pact', 'Pact', 'A kill heals 1.', [proc('kill', 'heal', 1, 0)]),
      N('warlock', 14, 'sig', 'Drain+', 'Drain+', 'Drain radius 110 and heals up to 35.', [sig('radius', 110), sig('heal', 35)]),
      N('warlock', 19, 'mastery', 'Doom', 'Doom', 'A cursed non-boss below 10% health dies on hit.', [ab('passive', 'doomBelow', 0.1)]),
    ],
    paladin: [
      N('paladin', 4, 'passive', 'Steadfast', 'Steadfast', 'Invulnerability +8%.', [mul('iframes', 1.08)]),
      N('paladin', 9, 'passive', 'Smite', 'Smite', 'Hits break armor 12% of the time.', [onHit('armorBroken', 0.12, 3)]),
      N('paladin', 14, 'sig', 'Oath+', 'Oath+', 'Oath blocks 5 hits for 7 s.', [sig('shield', 5), sig('dur', 7)]),
      N('paladin', 19, 'mastery', 'Crusader', 'Crusader', 'You deal extra damage while shielded.', [proc('shielded', 'damaging', 4, 0)]),
    ],
    berserker: [
      N('berserker', 4, 'passive', 'Bloodlust', 'Bloodlust', 'A kill grants berserk for 1.5 s (every 3 s).', [proc('kill', 'berserk', 1.5, 3)]),
      N('berserker', 9, 'passive', 'Cleave', 'Cleave', 'Hits make enemies bleed 15% of the time.', [onHit('bleed', 0.15, 3)]),
      N('berserker', 14, 'sig', 'Slam+', 'Slam+', 'Rage Slam hits harder over a wider radius.', [sig('powMul', 1.35), sig('radius', 140)]),
      N('berserker', 19, 'mastery', 'Undying', 'Undying', 'A lethal hit leaves 1 hp and 1 s of invulnerability (once per 60 s).', [proc('lethal', 'heal', 1, 60, { iframes: 1 })]),
    ],
    druid: [
      N('druid', 4, 'passive', 'Bark Skin', 'Bark', 'Armored while standing in your own Bloom.', [proc('inBloom', 'armored', 1, 0)]),
      N('druid', 9, 'passive', 'Thorns', 'Thorns', 'Hits root enemies 10% of the time.', [onHit('rooted', 0.1, 1)]),
      N('druid', 14, 'sig', 'Bloom+', 'Bloom+', 'Bloom lasts 7 s and heals 22.', [sig('dur', 7), sig('heal', 22)]),
      N('druid', 19, 'mastery', 'Overgrowth', 'Overgrow', 'Each Bloom tick heals 2.', [proc('bloomTick', 'heal', 2, 0)]),
    ],
    necromancer: [
      N('necromancer', 4, 'passive', 'Bone Chill', 'Bonechill', 'Hits weaken enemies 15% of the time.', [onHit('weak', 0.15, 3)]),
      N('necromancer', 9, 'passive', 'Ossuary', 'Ossuary', 'A kill heals 2.', [proc('kill', 'heal', 2, 0)]),
      N('necromancer', 14, 'sig', 'Bones+', 'Bones+', 'Raise 4 bones that last 12 s.', [sig('count', 4), sig('dur', 12)]),
      N('necromancer', 19, 'mastery', 'Lich Pact', 'Lich Pact', 'Bone hits apply curse for 2 s.', [ab('sig', 'hitCurseSec', 2)]),
    ],
  };

  // Shared actives. Existing slots: Q Dash L1, E Nova L3, R Shield L5, F Signature L7 (see realm.js abilities).
  const SLOTS = [
    { key: 'q', id: 'dash', name: 'Dash', level: 1 },
    { key: 'e', id: 'nova', name: 'Nova', level: 3 },
    { key: 'r', id: 'shield', name: 'Shield', level: 5 },
    { key: 'f', id: 'sig', name: 'Signature', level: 7 },
  ];
  const SHARED = [
    { id: 'nova2_11', lv: 11, kind: 'active', name: 'Nova II', short: 'Nova II', text: 'Nova fires 20 bolts instead of 16.', mods: [ab('nova', 'count', 20)] },
    { id: 'dash2_16', lv: 16, kind: 'active', name: 'Dash II', short: 'Dash II', text: 'Dash cooldown drops from 3 s to 2.5 s.', mods: [ab('dash', 'cooldown', 2.5)] },
  ];

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const lvl = (v) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.max(0, Math.min(20, n)) : 0; };
  const known = (c) => typeof c === 'string' && has(TABLE, c);

  const classes = () => Object.keys(TABLE);
  // All nodes for a class (4 class nodes + Nova II + Dash II), sorted by level. Unknown class -> only the shared nodes.
  function nodes(classId) {
    const own = known(classId) ? TABLE[classId] : [];
    return clone(own.concat(SHARED)).sort((a, b) => a.lv - b.lv);
  }
  const forLevel = (classId, level) => { const l = lvl(level); return nodes(classId).filter((n) => n.lv <= l); };
  const next = (classId, level) => { const l = lvl(level); return nodes(classId).find((n) => n.lv > l) || null; };
  const nodeById = (classId, id) => nodes(classId).find((n) => n.id === id) || null;
  const isUnlocked = (classId, id, level) => { const n = nodeById(classId, id); return !!n && n.lv <= lvl(level); };
  // Nodes crossed when the level goes from `from` (exclusive) to `to` (inclusive): drives the unlock toast.
  const crossed = (classId, from, to) => { const a = lvl(from), b = lvl(to); return nodes(classId).filter((n) => n.lv > a && n.lv <= b); };
  // Ability slots available at a level; tier 2 marks Nova II / Dash II.
  function activeSlots(level) {
    const l = lvl(level);
    return SLOTS.map((s) => ({ key: s.key, id: s.id, name: s.name, level: s.level, unlocked: l >= s.level,
      tier: (s.id === 'nova' && l >= 11) || (s.id === 'dash' && l >= 16) ? 2 : 1 }));
  }
  const novaBolts = (level) => (lvl(level) >= 11 ? 20 : 16);
  const dashCooldown = (level) => (lvl(level) >= 16 ? 2.5 : 3);

  // Aggregate every unlocked mod for a class at a level.
  // -> { mul:{stat:product}, onHit:[...], procs:[...], sig:{field:value}, ab:[...] }
  function aggregate(classId, level) {
    const out = { mul: {}, onHit: [], procs: [], sig: {}, ab: [] };
    forLevel(classId, level).forEach((n) => n.mods.forEach((m) => {
      if (m.op === 'mul') out.mul[m.stat] = (out.mul[m.stat] || 1) * m.v;
      else if (m.op === 'onHit') out.onHit.push(m);
      else if (m.op === 'proc') out.procs.push(m);
      else if (m.op === 'sig') out.sig[m.field] = m.v;
      else if (m.op === 'ab') out.ab.push(m);
    }));
    return out;
  }
  // Apply the unlocked `sig` mods to a signature descriptor (MMClasses.arenaSignature). Returns a new object; non-objects give null.
  function sigFor(classId, level, desc) {
    if (!desc || typeof desc !== 'object') return null;
    const out = Object.assign({}, desc), s = aggregate(classId, level).sig;
    Object.keys(s).forEach((k) => { if (has(desc, k)) out[k] = s[k]; });
    return out;
  }
  // Every sig field a class's nodes touch (the test checks each exists in arenaSignature).
  function sigFields(classId) {
    const f = [];
    nodes(classId).forEach((n) => n.mods.forEach((m) => { if (m.op === 'sig' && f.indexOf(m.field) < 0) f.push(m.field); }));
    return f;
  }

  // Power index used by the budget test: product of dmg/rate multipliers, on-hit status value, proc value (uptime 0.3), plus a small
  // credit for other numeric mods. A class at L19 must land in [1.08, 1.16]; defensive mods are capped separately (capsOk).
  const HIT_W = { marked: 0.5, slowed: 0.4, weak: 0.45, bleed: 0.55, curse: 0.45, dazed: 0.4, armorBroken: 0.5, rooted: 0.3 };
  const PROC_W = { berserk: 0.2, damaging: 0.2, healing: 0.08, armored: 0.14, crit: 0.15, heal: 0.03, cdRefund: 0.012 };
  const UPTIME = 0.3, K = 0.62;
  function index(classId, level) {
    const a = aggregate(classId, level);
    let v = (a.mul.dmg || 1) * (a.mul.rate || 1);
    a.onHit.forEach((m) => { v *= 1 + m.chance * (HIT_W[m.status] || 0.3); });
    a.procs.forEach((m) => { v *= 1 + UPTIME * (PROC_W[m.give] || 0); });
    ['hp', 'iframes', 'speed', 'life'].forEach((s) => { if (a.mul[s]) v *= 1 + (a.mul[s] - 1) * 0.5; });
    // Scale the raw product down (K) and add a flat credit for sig/ab tweaks that have no multiplier of their own.
    return 1 + (v - 1) * K + 0.012 * a.ab.length + 0.006 * Object.keys(a.sig).length;
  }
  const capsOk = (classId, level) => { const m = aggregate(classId, level).mul; return (m.hp || 1) <= 1.08 + 1e-9 && (m.iframes || 1) <= 1.1 + 1e-9; };

  // pixeltown-arms-v1: {v:1, seen:[nodeId], hud:{icons:true}}. Corrupt input -> blank.
  const blank = () => ({ v: 1, seen: [], hud: { icons: true } });
  function cleanArms(raw) {
    const out = blank();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    const seen = Array.isArray(raw.seen) ? raw.seen : [];
    const set = new Set();
    for (let i = 0; i < seen.length && out.seen.length < MAX_SEEN; i++) {
      const id = seen[i];
      if (typeof id === 'string' && ID_RE.test(id) && !set.has(id)) { set.add(id); out.seen.push(id); }
    }
    const hud = raw.hud && typeof raw.hud === 'object' && !Array.isArray(raw.hud) ? raw.hud : null;
    if (hud && hud.icons === false) out.hud.icons = false;
    return out;
  }
  // First load: mark every node at or below the current level as seen, so there is no toast flood. Returns a new cleaned arms object.
  function markSeen(arms, classId, level) {
    const out = cleanArms(arms);
    forLevel(classId, level).forEach((n) => { if (out.seen.length < MAX_SEEN && out.seen.indexOf(n.id) < 0) out.seen.push(n.id); });
    return out;
  }
  // Nodes unlocked at `level` that the player has not seen yet (toast queue).
  const unseen = (arms, classId, level) => { const s = cleanArms(arms).seen; return forLevel(classId, level).filter((n) => s.indexOf(n.id) < 0); };

  return { LEVELS: LEVELS.slice(), KINDS: KINDS.slice(), MAX_SEEN, ID_RE, classes, nodes, forLevel, next, nodeById, isUnlocked, crossed,
    activeSlots, novaBolts, dashCooldown, aggregate, sigFor, sigFields, index, capsOk, cleanArms, markSeen, unseen };
});
