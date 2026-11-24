// MMErrands (ID-12 Town-to-Realm errand chain, cycle 2 S): the pure state machine, NOT wired yet (see design/beta/cycle2-systems.md).
// One chain, three steps, no timer, no network:
//   1. Town: Mocha packs a parcel from 3 of YOUR wood            -> Town save    errand = { id, s: 1 }       (main.js writes)
//   2. Realm Nexus: the Vendor takes the parcel, asks for a trophy -> Realm save  errand = { id, p: 1 }       (realm-world.js writes)
//      any Midlands-or-deeper kill (zone >= 1) gives the trophy    -> Realm save  errand = { id, p: 1, d: 1 }
//   3. Town: Mocha takes the trophy, gives the one-time decor      -> Town save    errand = { id, s: 2 } (done)
// Each page writes ONLY its own save and reads the other one through cleanTown / cleanRealm (L, cycle 1: other saves read-only).
// Both fields are additive sub-objects of existing keys (pixeltown-save-v1 / pixeltown-realm-v1). Every function returns new objects
// and never throws. UMD: browser global MMErrands, or require().
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMErrands = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  const ID = 'parcel1';
  const COST = { wood: 3 };
  const REWARD = { decor: 'realm_lantern', label: 'Realm lantern (decor)' };
  const TROPHY_ZONE = 1; // Midlands or deeper
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const int = (v, lo, hi) => (typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : lo);

  // Town side { id, s: 0 none | 1 carrying the parcel | 2 done }; anything else is a fresh chain
  function cleanTown(v) { return isObj(v) && v.id === ID ? { id: ID, s: int(v.s, 0, 2) } : { id: ID, s: 0 }; }
  // Realm side { id, p: parcel delivered 0|1, d: trophy got 0|1 }; a trophy without a delivered parcel is dropped
  function cleanRealm(v) {
    if (!isObj(v) || v.id !== ID) return { id: ID, p: 0, d: 0 };
    const p = v.p === 1 ? 1 : 0; return { id: ID, p: p, d: p && v.d === 1 ? 1 : 0 };
  }
  // Where the player is, from both saves (read-only): offer | carry | hunt | return | done
  function stage(town, realm) {
    const t = cleanTown(town); const r = cleanRealm(realm);
    if (t.s === 2) return 'done';
    if (t.s === 0) return 'offer';
    if (!r.p) return 'carry';
    return r.d ? 'return' : 'hunt';
  }
  const LINES = {
    offer: 'Could you take a parcel to the Vendor in the Realm Nexus? I need 3 wood to pack it.',
    offerShort: 'Bring me 3 wood and I will pack a parcel for the Vendor in the Realm Nexus.',
    carry: 'The parcel is for the Vendor in the Realm Nexus. Walk through the Realm Gate, then into the Nexus.',
    hunt: 'The Vendor wants a trophy from the Midlands or further in. Any creature there will do.',
    return: 'A trophy! Mocha in town will be glad to see it.',
    done: 'Thank you again for the parcel run. The lantern suits your home.'
  };
  // Town step 1: pack the parcel. resources = the Town's own counts; returns { ok, town, spend } (spend = what the Town takes)
  function accept(town, resources) {
    const t = cleanTown(town);
    if (t.s !== 0) return { ok: false, why: 'busy', town: t, spend: null };
    const wood = isObj(resources) && typeof resources.wood === 'number' && isFinite(resources.wood) ? resources.wood : 0;
    if (wood < COST.wood) return { ok: false, why: 'need-wood', town: t, spend: null };
    return { ok: true, town: { id: ID, s: 1 }, spend: { wood: COST.wood } };
  }
  // Realm step 2a: the Nexus Vendor takes the parcel (only when the Town save says it is being carried)
  function deliver(realm, town) {
    const r = cleanRealm(realm);
    if (cleanTown(town).s !== 1 || r.p) return { ok: false, realm: r };
    return { ok: true, realm: { id: ID, p: 1, d: 0 } };
  }
  // Realm step 2b: a kill in zone >= 1 after the delivery gives the trophy (once)
  function trophy(realm, zone) {
    const r = cleanRealm(realm);
    if (!r.p || r.d || !(typeof zone === 'number' && zone >= TROPHY_ZONE && zone <= 3)) return { ok: false, realm: r };
    return { ok: true, realm: { id: ID, p: 1, d: 1 } };
  }
  // Town step 3: hand in the trophy (read from the Realm save) -> done + the one-time reward
  function finish(town, realm) {
    const t = cleanTown(town);
    if (stage(t, realm) !== 'return') return { ok: false, town: t, reward: null };
    return { ok: true, town: { id: ID, s: 2 }, reward: Object.assign({}, REWARD) };
  }
  return { ID, COST, REWARD, TROPHY_ZONE, LINES, cleanTown, cleanRealm, stage, accept, deliver, trophy, finish };
}));
