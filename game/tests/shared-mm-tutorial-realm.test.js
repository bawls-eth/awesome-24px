// Unit tests for shared/mm-tutorial.js (old STEPS machine unchanged + realmSteps, TU1). Run: node game/tests/shared-mm-tutorial-realm.test.js
const T = require('../shared/mm-tutorial.js');
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }

// old behaviour unchanged
check('old STEPS unchanged', T.STEPS.join() === 'move,shoot,dodge,pickup,finish');
let o = T.start({}); let rw = 0;
['moved', 'shot', 'dodged', 'pickedUp', 'continue'].forEach((e) => { const r = T.advance(o, e); o = r.state; if (r.reward) rw++; });
check('old flow finishes with one Life Potion', o.done && rw === 1 && T.advance(o, 'moved').reward === null);
check('old start refuses a veteran profile', T.start({ runs: 3 }) === null && T.start(null) === null);
const so = T.skip(T.start({})); check('old skip pays once', !!so.reward && T.skip(so.state).reward === null);

// realm steps list
const S = T.realmSteps();
check('six realm steps in order', S.map((s) => s.id).join() === 'move,shoot,bag,ability,portal,nexus');
check('every step has coarse and fine text', S.every((s) => s.coarse && s.fine && typeof s.coarse === 'string'));
check('coarse text names no key', S.every((s) => !/\b(WASD|W A S D|Esc|arrow|key|keys|mouse|click|press)\b/i.test(s.coarse)), JSON.stringify(S.map((s) => s.coarse)));
check('fine text names keys for move and ability', /W A S D/.test(S[0].fine) && /Q, E, R/.test(S[3].fine) && !/1, 2, 3/.test(S[3].fine));
check('cycle 6 b08-r3: coach step 4 (touch) says WHICH ability button to tap (the first, near the right thumb)', /first ability button/i.test(S[3].coarse) && /right thumb/i.test(S[3].coarse), S[3].coarse);
check('realmText picks variant, unknown id gives empty', T.realmText('move', true) === S[0].coarse && T.realmText('move', false) === S[0].fine && T.realmText('zzz', true) === '');
S[0].id = 'x';
check('realmSteps returns copies', T.realmSteps()[0].id === 'move');

// state machine
const st = T.realmStart({});
check('start shape is additive {v,done,finished,rewarded}', st && st.v === 1 && Array.isArray(st.done) && st.done.length === 0 && st.finished === false && st.rewarded === false);
check('start refuses a veteran', T.realmStart({ tutorialDone: true }) === null && T.realmStart('x') === null);
check('first current step is move', T.realmCurrent(st) === 'move');
let r = T.realmAdvance(st, 'shot');
check('steps can complete out of order; current stays move', r.state.done.join() === 'shoot' && T.realmCurrent(r.state) === 'move' && r.reward === null);
r = T.realmAdvance(r.state, 'moved');
check('current moves on to bag', T.realmCurrent(r.state) === 'bag');
check('repeat event is a no-op', JSON.stringify(T.realmAdvance(r.state, 'moved').state) === JSON.stringify(r.state));
check('unknown events change nothing', JSON.stringify(T.realmAdvance(r.state, 'bogus').state) === JSON.stringify(r.state) && T.realmAdvance(r.state, null).reward === null);
check('progress counts', JSON.stringify(T.realmProgress(r.state)) === '{"done":2,"total":6}');
let state = r.state, rewards = 0;
['pickedUp', 'abilityUsed', 'portalEntered', 'nexusOpened'].forEach((e) => { const x = T.realmAdvance(state, e); state = x.state; if (x.reward) rewards++; });
check('last step finishes and pays the reward once', state.finished && state.rewarded && rewards === 1 && T.realmCurrent(state) === 'done');
check('finished state ignores more events with no reward', T.realmAdvance(state, 'moved').reward === null && T.realmAdvance(state, 'moved').state.finished);
const sk = T.realmSkip(T.realmStart({}));
check('skip pays the reward once and finishes', sk.reward && sk.reward.item === 'life-potion' && sk.state.finished && sk.state.rewarded);
check('skip again pays nothing', T.realmSkip(sk.state).reward === null);
check('skip after completion pays nothing', T.realmSkip(state).reward === null);
check('skip on null input does not throw and pays once', T.realmSkip(null).reward !== null);
const rr = T.realmSkip(null); rr.reward.qty = 9;
check('reward object is a copy', T.REWARD.qty === 1);

// hostile input
const bad = [undefined, null, 5, 'x', [], { done: 'move' }, { done: [1, {}, null, 'move', 'move', 'evil'] }, { done: ['__proto__'], finished: 'yes' }, { v: 99, finished: 1, rewarded: true }];
check('realmNormalize never throws and always returns a valid shape', bad.every((b) => { const n = T.realmNormalize(b); return n.v === 1 && Array.isArray(n.done) && n.done.every((d) => T.REALM_STEPS.indexOf(d) >= 0) && typeof n.finished === 'boolean' && typeof n.rewarded === 'boolean'; }));
check('hostile done list keeps only known ids once', T.realmNormalize({ done: [1, {}, null, 'move', 'move', 'evil'] }).done.join() === 'move');
check('rewarded cannot be claimed without finishing', T.realmNormalize({ rewarded: true, done: ['move'] }).rewarded === false);
check('finished must be literal true; all steps done also finishes', T.realmNormalize({ finished: 'yes' }).finished === false && T.realmNormalize({ done: T.REALM_STEPS }).finished === true);
check('corrupt stored state restarts at move', T.realmCurrent('garbage') === 'move' && T.realmProgress(7).done === 0);
check('advance on hostile state does not throw', (() => { try { return T.realmAdvance({ done: 5 }, 'moved').state.done.join() === 'move'; } catch (e) { return false; } })());
check('prototype pollution attempt is harmless', (() => { T.realmNormalize(JSON.parse('{"__proto__":{"x":1},"done":["move"]}')); return ({}).x === undefined; })());
check('realmNormalize is idempotent', (() => { const a = T.realmNormalize({ done: ['nexus', 'move'] }); return JSON.stringify(T.realmNormalize(a)) === JSON.stringify(a); })());
console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exitCode = failed ? 1 : 0;
