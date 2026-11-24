// Taming state machine: wild -> ko | calm -> taming -> tamed. Pure and seeded. UMD: browser global MMTame, or require().
// No DOM, no Phaser, no network, no unseeded randomness: the only randomness is MMRng seeded with (seed, wildId, feed number).
// Every function returns FRESH state copies and never mutates its inputs. Part of the Biome Archipelago plan (A3).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rng.js'), require('./mm-creatures.js'));
  else root.MMTame = factory(root.MMRng, root.MMCreatures);
}(typeof self !== 'undefined' ? self : this, function (MMRng, MMCreatures) {
  'use strict';

  const K = {
    MAX_ATTEMPTS: 3,        // failed/woken attempts per wild creature before it escapes for good
    KO_LETHAL_FRAC: 0.4,    // a lethal hit KOs instead of kills at >= 40% torpor
    NORMAL_TORPOR: 0.3,     // ordinary damage builds torpor at x0.3 (soothe builds it in full)
    HIT_COST: 0.1,          // eff lost per hit on a KO'd / taming creature
    EFF_MIN: 0.2, EFF_MAX: 1.5,
    AFFINITY_BONUS: 0.2,    // up to +20% starting eff from species affinity (0..1)
    CALM_RANGE: 90,         // px: stay this close and deal no damage to befriend
    LEAVE_GRACE: 4,         // s away from a calm creature before it loses interest
    SCARE_FAIL: 3,          // third scare fails a befriend
    SCARE_DECAY: 15,        // s per scare point forgotten
    FAIL_COOLDOWN: 20,      // s a scared creature stays away after a failed befriend
    HIT_TORPOR_DECAY_AFTER: 8, // s without hits before torpor drains
    TORPOR_DRAIN_SEC: 30,   // full torpor drains over this many s
    WEARY_HP: 0.25,         // bosses only take torpor at <= 25% HP
    KEEP_ON_WAKE: 0.5,      // progress kept when a sleeper wakes or a calm tame is abandoned
    EXTEND_CAP: 2,          // sleepy herb cannot push a sleep past 2x its base length
    WRONG_CAP: 12,
    LEVEL_STEP: 0.03,       // need, torpor and sleep grow 3% per wild level above 1
    MAX_LEVEL: 50,
    FEED_JITTER: 0.1,       // each feed is x(0.9..1.1), seeded
    REF_DPS: 20,            // reference soothe DPS for tameTime()
    DAILY_FULL: 3,          // tames of one species per day at full reward
    DAILY_HALF: 6,          // up to here at half reward, then none (no FOMO: resets every day)
    MAX_SPECIES_OWNED: 2,   // a third duplicate of a species gives bond seeds instead
  };
  const STATES = ['wild', 'ko', 'calm', 'taming', 'tamed', 'dead', 'escaped'];
  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  function fin(v, d, lo, hi) { const n = typeof v === 'number' && isFinite(v) ? v : d; return clamp(n, lo, hi); }
  const levelMul = (lv) => 1 + K.LEVEL_STEP * (clamp(Math.floor(fin(lv, 1, 1, K.MAX_LEVEL)), 1, K.MAX_LEVEL) - 1);
  const round2 = (v) => Math.round(v * 100) / 100;

  function creatureOf(c) {
    if (typeof c === 'string') return MMCreatures ? MMCreatures.get(c) : null;
    if (!isObj(c)) return null;
    if (typeof c.id === 'string' && MMCreatures && MMCreatures.get(c.id) === c) return c;   // registry defs are already clean
    return MMCreatures ? MMCreatures.clean(c) : null;
  }
  // food preference multiplier: first diet entry x1, other diet entries x0.5, anything else x0
  function prefMul(def, food) {
    if (!def || typeof food !== 'string') return 0;
    const i = def.diet.indexOf(food);
    return i < 0 ? 0 : i === 0 ? 1 : 0.5;
  }
  function foodQuality(food) { const f = MMCreatures && MMCreatures.food(food); return f ? f.quality : 0; }

  // ---- creation ----
  function init(creature, opts) {
    const def = creatureOf(creature);
    if (!def) return null;
    const o = isObj(opts) ? opts : {};
    const level = Math.floor(fin(o.level, 1, 1, K.MAX_LEVEL));
    const lm = levelMul(level);
    const affinity = fin(o.affinity, 0, 0, 1);
    const tame = def.tame;
    return {
      v: 1, id: def.id, st: 'wild', how: '',
      seed: String(o.seed === undefined ? '' : o.seed).slice(0, 48), wildId: String(o.wildId === undefined ? '' : o.wildId).slice(0, 48),
      level, affinity, locked: !tame,
      torpor: 0, torporMax: tame ? Math.max(1, Math.round(tame.torpor * lm)) : 0,
      prog: 0, need: tame ? Math.max(1, Math.ceil(tame.need * lm)) : 0, sleep: tame ? Math.round(tame.sleep * lm) : 0,
      fed: 0, lastFeed: -999, scare: 0, lastScare: -999, lastHit: -999,
      eff: clamp(1 + K.AFFINITY_BONUS * affinity, K.EFF_MIN, K.EFF_MAX), wakeAt: 0, away: 0, failUntil: 0,
      attempts: 0, hits: 0, wrong: 0, t: 0, bond: 0, bondPct: 0,
    };
  }

  // Validate / normalise a saved or untrusted state. Returns a fresh copy or null.
  function clean(raw) {
    if (!isObj(raw) || typeof raw.id !== 'string' || !creatureOf(raw.id)) return null;
    if (typeof raw.st !== 'string' || STATES.indexOf(raw.st) < 0) return null;
    const def = creatureOf(raw.id);
    const base = init(def, { seed: raw.seed, wildId: raw.wildId, level: raw.level, affinity: raw.affinity });
    const s = Object.assign({}, base);
    s.st = raw.st;
    s.how = raw.how === 'ko' || raw.how === 'calm' ? raw.how : '';
    ['torpor', 'prog', 'fed', 'scare', 'wrong', 'hits', 'attempts', 'bond', 'bondPct'].forEach((k) => { s[k] = fin(raw[k], 0, 0, 1e6); });
    ['lastFeed', 'lastScare', 'lastHit'].forEach((k) => { s[k] = fin(raw[k], -999, -999, 1e7); });
    ['wakeAt', 'away', 'failUntil', 't'].forEach((k) => { s[k] = fin(raw[k], 0, 0, 1e7); });
    s.eff = fin(raw.eff, 1, K.EFF_MIN, K.EFF_MAX);
    s.torpor = Math.min(s.torpor, s.torporMax * 1.25);
    s.attempts = Math.min(Math.floor(s.attempts), K.MAX_ATTEMPTS);
    if ((s.st === 'ko' || (s.st === 'taming' && s.how === 'ko')) && !def.tame) return null;
    return s;
  }

  const isAsleep = (s) => s.st === 'ko' || (s.st === 'taming' && s.how === 'ko');
  const isBefriend = (s) => s.st === 'calm' || (s.st === 'taming' && s.how === 'calm');

  // ---- the step ----
  // input = { torporHit, dmg, hits, lethal, hpFrac, playerDist, offer, scare, extend }  (all optional; junk is ignored)
  function step(creature, state, input, dt) {
    const def = creatureOf(creature);
    const s = clean(state);
    if (!def || !s || s.id !== def.id) return { state: s, events: ['invalid'] };
    const inp = isObj(input) ? input : {};
    const d = fin(dt, 0, 0, 120);
    const events = [];
    const tame = def.tame;
    if (s.st === 'tamed' || s.st === 'dead' || s.st === 'escaped') return { state: s, events };
    s.t += d;

    const torporHit = fin(inp.torporHit, 0, 0, 1e5);
    const dmg = fin(inp.dmg, 0, 0, 1e6);
    const hits = Math.floor(fin(inp.hits, dmg > 0 || torporHit > 0 ? 1 : 0, 0, 100));
    const hpFrac = fin(inp.hpFrac, 1, 0, 1);
    const dist = fin(inp.playerDist, 9999, 0, 1e6);
    const lethal = inp.lethal === true;
    const extend = fin(inp.extend, 0, 0, 120);
    const offer = typeof inp.offer === 'string' && inp.offer.length < 40 ? inp.offer : null;
    const scareIn = Math.floor(fin(inp.scare, 0, 0, 20));

    const abandon = (ev, keep) => {
      s.prog = round2(s.prog * keep); s.torpor = 0; s.scare = 0; s.how = ''; s.st = 'wild'; s.attempts += 1; s.away = 0;
      events.push(ev);
      if (s.attempts >= K.MAX_ATTEMPTS) { s.st = 'escaped'; s.prog = 0; events.push('escape'); }
    };

    // sleeper: herb extends, then the sleep may run out
    if (isAsleep(s)) {
      if (extend > 0) { s.wakeAt = Math.min(s.wakeAt + extend, s.t + s.sleep * K.EXTEND_CAP); events.push('extended'); }
      if (s.t >= s.wakeAt) { abandon('wake', K.KEEP_ON_WAKE); return { state: s, events }; }
    }

    // lethal blow
    if (lethal) {
      const koable = !s.locked && tame && tame.method === 'knockout' && !isAsleep(s) && (def.tier !== 'boss' || hpFrac <= K.WEARY_HP) &&
        s.torpor >= s.torporMax * K.KO_LETHAL_FRAC;
      if (koable) { s.torpor = s.torporMax; sleepNow(s); events.push('saved', 'ko'); }
      else { s.st = 'dead'; events.push('killed'); return { state: s, events }; }
    }

    // damage handling
    if (hits > 0) s.lastHit = s.t;
    if (isAsleep(s)) {
      if (dmg > 0 || hits > 0 && torporHit === 0) {
        const n = Math.max(1, hits);
        s.eff = clamp(round2(s.eff - K.HIT_COST * n), K.EFF_MIN, K.EFF_MAX); s.hits += n; events.push('hit');
      }
    } else if (s.st === 'wild' && !s.locked && tame && tame.method === 'knockout') {
      const weary = def.tier !== 'boss' || hpFrac <= K.WEARY_HP;
      if (weary && (torporHit > 0 || dmg > 0)) {
        s.torpor = Math.min(s.torporMax, s.torpor + torporHit + dmg * K.NORMAL_TORPOR);
        if (s.torpor >= s.torporMax) { sleepNow(s); events.push('ko'); }
      } else if (!weary && (torporHit > 0 || dmg > 0)) events.push('not_weary');
      // torpor drains when the creature is left alone
      if (s.st === 'wild' && s.torpor > 0 && torporHit === 0 && s.t - s.lastHit >= K.HIT_TORPOR_DECAY_AFTER) {
        s.torpor = Math.max(0, s.torpor - (s.torporMax / K.TORPOR_DRAIN_SEC) * d);
      }
    } else if (isBefriend(s) || (s.st === 'wild' && !s.locked && tame && tame.method !== 'knockout')) {
      // any damage scares a befriend target; dashes add scare through input.scare
      const add = (dmg > 0 || torporHit > 0 ? Math.max(1, hits) : 0) + scareIn;
      if (add > 0) {
        s.scare += add; s.lastScare = s.t; events.push('scare');
        if (s.scare >= K.SCARE_FAIL) { s.failUntil = s.t + K.FAIL_COOLDOWN; abandon('fail', 0); }
      }
    }
    if (s.st === 'dead' || s.st === 'escaped') return { state: s, events };

    // scare memory fades
    if (s.scare > 0 && s.t - s.lastScare >= K.SCARE_DECAY) { s.scare -= 1; s.lastScare = s.t; }

    // befriend (feed / calm): get close, stay peaceful
    if (!s.locked && tame && tame.method !== 'knockout' && (s.st === 'wild' || isBefriend(s))) {
      const near = dist <= K.CALM_RANGE;
      if (near) s.away = 0; else s.away += d;
      if (s.st === 'wild' && near && s.t >= s.failUntil && hits === 0 && scareIn === 0) { s.st = 'calm'; s.how = 'calm'; events.push('calm'); }
      else if (isBefriend(s) && !near && s.away > K.LEAVE_GRACE) {
        s.st = 'wild'; s.how = ''; s.prog = round2(s.prog * K.KEEP_ON_WAKE); s.away = 0; events.push('lost');
      }
    }

    // feeding
    if (offer !== null) {
      if (s.locked || !tame) events.push('untameable');
      else if (!(isAsleep(s) || ((s.st === 'calm' || (s.st === 'taming' && s.how === 'calm')) && dist <= K.CALM_RANGE))) events.push('cannot_feed');
      else if (s.t - s.lastFeed < tame.feedEvery) events.push('toofast');
      else {
        const pm = prefMul(def, offer);
        if (pm === 0) { s.wrong = Math.min(K.WRONG_CAP, s.wrong + 1); events.push('refused'); }
        else {
          const r = MMRng.create(s.seed + ':tame:' + s.wildId + ':f' + s.fed).next();
          const jitter = 1 - K.FEED_JITTER + 2 * K.FEED_JITTER * r;
          s.prog = Math.round((s.prog + foodQuality(offer) * pm * s.eff * jitter) * 1000) / 1000;
          s.fed += 1; s.lastFeed = s.t;
          if (s.st !== 'taming') { s.how = isAsleep(s) ? 'ko' : 'calm'; s.st = 'taming'; }
          events.push('fed', 'progress');
          if (s.prog >= s.need) {
            s.st = 'tamed'; s.torpor = 0;
            s.bond = 1 + Math.floor(clamp(s.eff, 0, K.EFF_MAX) * 4);
            s.bondPct = clamp(Math.round(100 - s.wrong * 5 - (1 - Math.min(1, s.eff)) * 50), 60, 100);
            events.push('tamed');
          }
        }
      }
    }
    return { state: s, events };
  }
  function sleepNow(s) { s.st = 'ko'; s.how = 'ko'; s.wakeAt = s.t + s.sleep; }

  // ---- read-only helpers ----
  function progressFrac(state) {
    const s = clean(state);
    if (!s) return 0;
    return s.need ? clamp(s.prog / s.need, 0, 1) : 0;
  }
  function torporFrac(state) {
    const s = clean(state);
    return s && s.torporMax ? clamp(s.torpor / s.torporMax, 0, 1) : 0;
  }
  function describe(state) {
    const s = clean(state);
    if (!s) return null;
    return { st: s.st, asleep: isAsleep(s), befriending: isBefriend(s), done: s.st === 'tamed', gone: s.st === 'dead' || s.st === 'escaped',
      attemptsLeft: Math.max(0, K.MAX_ATTEMPTS - s.attempts), progress: progressFrac(s), torpor: torporFrac(s), eff: s.eff };
  }
  // seconds left before a sleeper wakes (0 when not asleep)
  function sleepLeft(state) { const s = clean(state); return s && isAsleep(s) ? Math.max(0, s.wakeAt - s.t) : 0; }

  // Target seconds for a typical hero (soothe DPS REF_DPS) to tame this creature at a wild level. null if it cannot be tamed.
  function tameTime(creature, level) {
    const def = creatureOf(creature);
    if (!def || !def.tame) return null;
    const lm = levelMul(level === undefined ? 1 : level);
    return Math.round(def.tame.time * lm * 10) / 10;
  }

  // Anti-grind: how the reward for a finished tame scales with how often the same species was tamed today / is already owned.
  function rewardFactor(tamedTodayOfSpecies) {
    const n = Math.floor(fin(tamedTodayOfSpecies, 0, 0, 1e6));
    return n < K.DAILY_FULL ? 1 : n < K.DAILY_HALF ? 0.5 : 0;
  }
  function duplicateRule(ownedOfSpecies) {
    const n = Math.floor(fin(ownedOfSpecies, 0, 0, 1e6));
    return n >= K.MAX_SPECIES_OWNED ? { allow: false, seeds: 3 } : { allow: true, seeds: 0 };
  }
  // Level-up from a tame: bonus levels = floor(level * bondPct / 200)
  function bonusLevels(level, bondPct) {
    return Math.floor(fin(level, 1, 1, K.MAX_LEVEL) * fin(bondPct, 60, 0, 100) / 200);
  }

  // ---- seeded balance sim ----
  // A scripted hero: approaches slowly (feed/calm) or soothes with seeded DPS (knockout), then feeds the favourite food as soon as allowed.
  function simulate(creature, opts) {
    const def = creatureOf(creature);
    if (!def || !def.tame) return null;
    const o = isObj(opts) ? opts : {};
    const runs = Math.floor(fin(o.runs, 200, 1, 5000));
    const seed = String(o.seed === undefined ? 'sim' : o.seed).slice(0, 32);
    const dpsMin = fin(o.dpsMin, 10, 1, 1000), dpsMax = fin(o.dpsMax, 30, dpsMin, 1000);
    const level = Math.floor(fin(o.level, 1, 1, K.MAX_LEVEL));
    const dt = fin(o.dt, 0.25, 0.05, 1);
    const maxT = fin(o.maxT, 900, 10, 5000);
    const bossDmgMul = 3;      // hero's real damage vs the soothe tool while wearing a boss down
    const times = [];
    const fails = { dead: 0, escaped: 0, timeout: 0 };
    let wakes = 0;
    for (let i = 0; i < runs; i++) {
      const rng = MMRng.create(seed + ':sim:' + def.id + ':' + level + ':' + i);
      const dps = dpsMin + rng.next() * (dpsMax - dpsMin);
      let s = init(def, { seed: seed + ':' + i, wildId: 'w' + i, level, affinity: 0 });
      let dist = 200, bossHp = def.hp, done = false;
      for (let t = 0; t < maxT && !done; t += dt) {
        const inp = { playerDist: dist };
        if (def.tame.method === 'knockout') {
          if (s.st === 'wild') {
            if (def.tier === 'boss' && bossHp > def.hp * K.WEARY_HP) {
              const dd = dps * bossDmgMul * dt; bossHp -= dd; inp.hpFrac = Math.max(0, bossHp / def.hp);
              if (bossHp <= def.hp * K.WEARY_HP) inp.hpFrac = K.WEARY_HP;
            } else { inp.torporHit = dps * dt; inp.hpFrac = def.tier === 'boss' ? K.WEARY_HP : 1; }
          } else if (isAsleep(s)) inp.offer = def.diet[0];
        } else {
          dist = Math.max(0, dist - 60 * dt); inp.playerDist = dist;
          if (dist <= K.CALM_RANGE) inp.offer = def.diet[0];
        }
        const r = step(def, s, inp, dt);
        s = r.state;
        if (r.events.indexOf('wake') >= 0) wakes++;
        if (s.st === 'tamed') { times.push(round2(t + dt)); done = true; }
        else if (s.st === 'dead') { fails.dead++; done = true; }
        else if (s.st === 'escaped') { fails.escaped++; done = true; }
      }
      if (!done) fails.timeout++;
    }
    times.sort((a, b) => a - b);
    const q = (p) => (times.length ? times[Math.min(times.length - 1, Math.floor(p * times.length))] : null);
    return { id: def.id, level, runs, tamed: times.length, rate: times.length / runs, median: q(0.5), p10: q(0.1), p90: q(0.9),
      min: times[0] === undefined ? null : times[0], max: times.length ? times[times.length - 1] : null, wakes, fails };
  }

  return Object.freeze({
    K: Object.freeze(Object.assign({}, K)), STATES: Object.freeze(STATES.slice()),
    init, step, clean, describe, progressFrac, torporFrac, sleepLeft, prefMul, levelMul,
    tameTime, rewardFactor, duplicateRule, bonusLevels, simulate,
  });
}));
