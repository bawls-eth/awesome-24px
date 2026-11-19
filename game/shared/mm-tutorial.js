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
  return { STEPS, REWARD, shouldStart, start, advance, skip };
});
