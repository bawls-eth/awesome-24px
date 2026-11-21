// MMQuests: pure daily quests + oracle hint (NEXT-SLICES N2). 3 quests per UTC date, seeded from MMDaily/MMRng, identical for everyone.
// State shape (stored later under an additive `quests` key of pixeltown-realm-v1): { date:'YYYY-MM-DD', q:{ <questId>:{ p:int, done:bool, claimed:bool } } }
// No DOM, no clock, no Math.random. Every function returns new objects; inputs are never mutated; hostile input is cleaned.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rng.js'), require('./mm-daily.js'));
  else root.MMQuests = factory(root.MMRng, root.MMDaily);
})(typeof self !== 'undefined' ? self : this, function (MMRng, MMDaily) {
  const ZONES = ['Shore', 'Meadows', 'Deeps', 'Godlands']; // zone 0..3 (REALM-UNIFIED-DESIGN)
  const BIOMES = ['warren', 'bramble', 'meadow', 'crypt'];
  const BAGS = ['brown', 'pink', 'purple']; // bag tier by quest kind; matches the b15 bag art ids bag_<colour>
  const NPC = 'npc_quest_giver', ORACLE_NPC = 'npc_ghost_guide'; // b21 ids (no oracle art exists, the ghost guide stands in)
  const MAX_PROGRESS = 9999;
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const isInt = (v) => typeof v === 'number' && Number.isFinite(v);

  function pad(date) { return MMDaily.cleanDate(date); }

  // quests(dateUtc) -> 3 frozen quest descriptors, or [] for an invalid date.
  function quests(dateUtc) {
    const d = pad(dateUtc);
    if (!d) return [];
    const r = MMRng.create(MMRng.hash('mm-quests:' + d));
    const zone = r.int(0, 3);
    const need = 8 + r.int(0, 6) * 2 + zone * 4; // 8..32, grows with zone
    const biome = BIOMES[r.int(0, 3)];
    return [
      { id: 'kill_zone', kind: 'kill', zone: zone, need: need, text: 'Defeat ' + need + ' creatures in the ' + ZONES[zone], reward: { shards: 30 + zone * 10 + need, bag: BAGS[0] }, npc: NPC },
      { id: 'kill_boss', kind: 'boss', zone: null, need: 1, text: 'Defeat a boss', reward: { shards: 120 + r.int(0, 4) * 10, bag: BAGS[2] }, npc: NPC },
      { id: 'open_portal', kind: 'portal', biome: biome, need: 1, text: 'Open a portal', reward: { shards: 60 + r.int(0, 3) * 10, bag: BAGS[1] }, npc: NPC },
    ].map((q) => Object.freeze(Object.assign(q, { reward: Object.freeze(q.reward) })));
  }

  // fresh(dateUtc) -> a clean state for that date (date null if invalid).
  function fresh(dateUtc) {
    const d = pad(dateUtc), q = {};
    quests(d).forEach((x) => { q[x.id] = { p: 0, done: false, claimed: false }; });
    return { date: d, q: q };
  }

  // clean(raw, dateUtc): save-shape cleaner. A state from another date or any bad shape -> fresh(date). Counters clamped, flags coerced, unknown keys dropped.
  function clean(raw, dateUtc) {
    const d = pad(dateUtc), base = fresh(d);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.date !== d || !raw.q || typeof raw.q !== 'object' || Array.isArray(raw.q)) return base;
    quests(d).forEach((x) => {
      const s = has(raw.q, x.id) ? raw.q[x.id] : null;
      if (!s || typeof s !== 'object') return;
      const p = isInt(s.p) ? Math.max(0, Math.min(MAX_PROGRESS, Math.floor(s.p))) : 0;
      const done = p >= x.need;
      base.q[x.id] = { p: Math.min(p, x.need), done: done, claimed: done && s.claimed === true };
    });
    return base;
  }

  // progress(state, event, dateUtc): event {type:'kill', zone, boss, n} | {type:'boss'} | {type:'portal'}. Returns a NEW cleaned state.
  function progress(state, event, dateUtc) {
    const d = pad(dateUtc || (state && state.date));
    const s = clean(state, d);
    if (!d || !event || typeof event !== 'object') return s;
    const n = isInt(event.n) ? Math.max(0, Math.min(1000, Math.floor(event.n))) : 1;
    quests(d).forEach((x) => {
      const cur = s.q[x.id];
      if (cur.done) return;
      let add = 0;
      if (event.type === 'kill' && x.kind === 'kill' && Math.floor(Number(event.zone)) === x.zone) add = n;
      else if ((event.type === 'boss' || (event.type === 'kill' && event.boss === true)) && x.kind === 'boss') add = 1;
      else if (event.type === 'portal' && x.kind === 'portal') add = 1;
      if (!add) return;
      const p = Math.min(x.need, cur.p + add);
      s.q[x.id] = { p: p, done: p >= x.need, claimed: false };
    });
    return s;
  }

  // claim(state, questId, dateUtc) -> { state, reward }. Pays once; reward is null when unfinished, already claimed or unknown.
  function claim(state, questId, dateUtc) {
    const d = pad(dateUtc || (state && state.date));
    const s = clean(state, d);
    const q = quests(d).find((x) => x.id === questId);
    if (!q || !has(s.q, q.id) || !s.q[q.id].done || s.q[q.id].claimed) return { state: s, reward: null };
    s.q[q.id] = { p: s.q[q.id].p, done: true, claimed: true };
    return { state: s, reward: { shards: q.reward.shards, bag: q.reward.bag, quest: q.id } };
  }

  // oracle(dateUtc): one deterministic hint per date from the ghost guide. Points at today's kill zone and portal biome.
  function oracle(dateUtc) {
    const d = pad(dateUtc);
    if (!d) return null;
    const qs = quests(d), z = qs[0].zone, b = qs[2].biome;
    const r = MMRng.create(MMRng.hash('mm-oracle:' + d));
    const lines = [
      'The ' + ZONES[z] + ' stirs today. Creatures gather there.',
      'A door to the ' + b + ' wants opening before dusk.',
      'Something big walks the Realm. Bring friends, or patience.',
    ];
    return { npc: ORACLE_NPC, zone: z, biome: b, text: lines[r.int(0, lines.length - 1)] };
  }

  // summary(state, dateUtc): rows for a board UI (descriptors + progress + status).
  function summary(state, dateUtc) {
    const d = pad(dateUtc), s = clean(state, d);
    return quests(d).map((x) => ({ id: x.id, text: x.text, need: x.need, p: s.q[x.id].p, done: s.q[x.id].done, claimed: s.q[x.id].claimed, reward: x.reward }));
  }
  return { ZONES, BIOMES, BAGS, NPC, ORACLE_NPC, quests, fresh, clean, progress, claim, oracle, summary };
});
