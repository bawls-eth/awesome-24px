// MMTutorial: pure step machine. Starts only for a new profile; Life Potion reward granted once.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMTutorial = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const STEPS = ['move', 'shoot', 'dodge', 'pickup', 'finish'];
  const REWARD = { item: 'life-potion', qty: 1 };
  // events: 'moved','shot','dodged','pickedUp','continue'
  const NEEDS = { move: 'moved', shoot: 'shot', dodge: 'dodged', pickup: 'pickedUp', finish: 'continue' };
  function shouldStart(profile) {
    return !!profile && typeof profile === 'object' && !profile.tutorialDone && !profile.runs && !profile.heroes;
  }
  function start(profile) {
    if (!shouldStart(profile)) return null;
    return { step: 0, name: STEPS[0], done: false, skipped: false, rewarded: false };
  }
  function complete(st, skipped) {
    const reward = st.rewarded ? null : Object.assign({}, REWARD);
    return { state: Object.assign({}, st, { done: true, skipped, rewarded: true, name: 'done' }), reward };
  }
  function advance(st, event) {
    if (!st || st.done || event !== NEEDS[st.name]) return { state: st, reward: null };
    const i = st.step + 1;
    if (i >= STEPS.length) return complete(st, false);
    return { state: Object.assign({}, st, { step: i, name: STEPS[i] }), reward: null };
  }
  function skip(st) { if (!st || st.done) return { state: st, reward: null }; return complete(st, true); }

  // ---- Realm steps (TU1): teach the sticks first. Pure; hostile input safe; the save shape is additive: {v:1, done:[stepId], finished, rewarded}.
  // Steps may be done in any order; the current step is always the first one not done yet. Text has a coarse (touch) and a fine (keyboard/mouse)
  // variant; coarse text never names a key.
  const REALM_STEPS = [
    { id: 'move', need: 'moved', coarse: 'Drag the left stick to walk around.', fine: 'Use W A S D or the arrow keys to walk around.' },
    { id: 'shoot', need: 'shot', coarse: 'Drag the right stick to aim and shoot.', fine: 'Move the mouse to aim, hold the left button to shoot.' },
    { id: 'bag', need: 'pickedUp', coarse: 'Walk over a loot bag to pick it up.', fine: 'Walk over a loot bag to pick it up.' },
    { id: 'ability', need: 'abilityUsed', coarse: 'Tap the first ability button, next to your right thumb, to use it.', fine: 'Press 1, 2, 3 or 4 to use an ability.' },
    { id: 'portal', need: 'portalEntered', coarse: 'Walk into a glowing portal to enter a dungeon.', fine: 'Walk into a glowing portal to enter a dungeon.' },
    { id: 'nexus', need: 'nexusOpened', coarse: 'Tap the Menu button, then Nexus, to open the Nexus.', fine: 'Press Esc, then choose Nexus, to open the Nexus.' }
  ];
  const REALM_IDS = REALM_STEPS.map((s) => s.id);
  function realmSteps() { return REALM_STEPS.map((s) => Object.assign({}, s)); }
  function realmText(id, coarse) {
    const s = REALM_STEPS.find((x) => x.id === id);
    return s ? (coarse ? s.coarse : s.fine) : '';
  }
  // Clean any stored value into a valid state; garbage becomes a fresh state. Unknown / duplicate ids are dropped, order follows REALM_STEPS.
  function realmNormalize(raw) {
    const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const have = Array.isArray(r.done) ? r.done : [];
    const done = REALM_IDS.filter((id) => have.indexOf(id) >= 0);
    const finished = r.finished === true || done.length === REALM_IDS.length;
    return { v: 1, done: finished ? REALM_IDS.slice() : done, finished: finished, rewarded: r.rewarded === true && finished };
  }
  function realmCurrent(raw) {
    const st = realmNormalize(raw);
    const n = REALM_IDS.find((id) => st.done.indexOf(id) < 0);
    return st.finished || !n ? 'done' : n;
  }
  function realmStart(profile) { return shouldStart(profile) ? realmNormalize(null) : null; }
  function realmProgress(raw) { const st = realmNormalize(raw); return { done: st.done.length, total: REALM_IDS.length }; }
  function realmFinish(st) {
    return { state: { v: 1, done: REALM_IDS.slice(), finished: true, rewarded: true }, reward: st.rewarded ? null : Object.assign({}, REWARD) };
  }
  // event: 'moved' | 'shot' | 'pickedUp' | 'abilityUsed' | 'portalEntered' | 'nexusOpened'; unknown events change nothing.
  function realmAdvance(raw, event) {
    const st = realmNormalize(raw);
    if (st.finished) return { state: st, reward: null };
    const step = REALM_STEPS.find((s) => s.need === event);
    if (!step || st.done.indexOf(step.id) >= 0) return { state: st, reward: null };
    const done = REALM_IDS.filter((id) => id === step.id || st.done.indexOf(id) >= 0);
    if (done.length === REALM_IDS.length) return realmFinish(st);
    return { state: { v: 1, done: done, finished: false, rewarded: false }, reward: null };
  }
  function realmSkip(raw) {
    const st = realmNormalize(raw);
    return st.finished ? { state: st, reward: null } : realmFinish(st);
  }
  return { STEPS, REWARD, shouldStart, start, advance, skip, REALM_STEPS: REALM_IDS, realmSteps, realmText, realmNormalize, realmStart, realmCurrent, realmProgress, realmAdvance, realmSkip };
});
