// Run: node game/tests/shared-mm-minikit.test.js   (MK1: shared mini-game result card, pure parts + a DOM stub)
const K = require('../shared/mm-minikit.js');
let n = 0, bad = 0;
function check(name, ok, info) { n++; if (!ok) { bad++; console.log('FAIL ' + name + (info ? ' ' + info : '')); } }

// formatting
check('fmt groups thousands', K.fmt(1234567) === '1,234,567' && K.fmt(0) === '0' && K.fmt(-1500) === '-1,500' && K.fmt(999) === '999');
check('fmt is safe on junk', K.fmt(NaN) === '0' && K.fmt('x') === '0' && K.fmt(Infinity) === '0' && K.fmt(12.6) === '13');
check('fmtTime', K.fmtTime(12345) === '12.3s' && K.fmtTime(75500) === '1:15.5s' && K.fmtTime(-5) === '0.0s');
// PB delta
const a = K.pbDelta(120, 100), b = K.pbDelta(100, 100), c = K.pbDelta(80, 100), f = K.pbDelta(50, null);
check('pbDelta +N new best', a.kind === 'new' && a.delta === 20 && a.text === 'New best! +20', JSON.stringify(a));
check('pbDelta equal', b.kind === 'equal' && b.delta === 0, JSON.stringify(b));
check('pbDelta below shows the best', c.kind === 'below' && c.text === 'Best: 100', JSON.stringify(c));
check('pbDelta first run is a new best', f.kind === 'new');
check('pbDelta lower-is-better (times)', K.pbDelta(9000, 10000, true).kind === 'new' && K.pbDelta(11000, 10000, true).kind === 'below' && K.pbDelta(5000, 0, true).kind === 'new');
// near miss: 3%
check('nearMiss within 3% and missed', K.nearMiss(98, 100) === true && K.nearMiss(97, 100) === true);
check('nearMiss false outside 3%', K.nearMiss(96, 100) === false && K.nearMiss(50, 100) === false);
check('nearMiss false when the goal was reached', K.nearMiss(100, 100) === false && K.nearMiss(150, 100) === false);
check('nearMiss lower-is-better', K.nearMiss(10200, 10000, true) === true && K.nearMiss(9000, 10000, true) === false && K.nearMiss(11000, 10000, true) === false);
check('nearMiss junk goal', K.nearMiss(5, 0) === false && K.nearMiss(5, NaN) === false);
// next goal + goal line
const meds = [{ id: 'a', label: 'A', earned: true }, { id: 'b', label: 'Score 500', target: 500, earned: false }, { id: 'c', label: 'C', earned: false }];
check('nextGoal returns the first unearned medal', K.nextGoal(meds).id === 'b' && K.nextGoal([{ id: 'x', earned: true }]) === null && K.nextGoal(null) === null);
check('goalLine: calm by default', K.goalLine(300, meds[1]) === 'Next goal: Score 500');
check('goalLine: So close! only within 3%', K.goalLine(490, meds[1]) === 'So close! Next goal: Score 500' && K.goalLine(480, meds[1]) === 'Next goal: Score 500');
check('goalLine: no target never says So close', !/So close/.test(K.goalLine(499, { label: 'x' })));
check('goalLine: all done', /All medals/.test(K.goalLine(1, null)));
// seed codes
['demo1', 'abc123', 'lx9k2m0a', 'z'].forEach((s) => check('seed code round-trips ' + s, K.parseSeedCode(K.seedCode(s)) === s && /^[A-Z0-9]{1,24}$/.test(K.seedCode(s))));
check('seedCode is short and clean', K.seedCode('a-b_c!') === 'ABC' && K.seedCode('x'.repeat(40)).length === 24 && K.seedCode(null) === '');
check('parseSeedCode is case-insensitive and trims', K.parseSeedCode(' Demo1 ') === 'demo1');
check('parseSeedCode rejects > 24 chars', K.parseSeedCode('A'.repeat(25)) === null && K.parseSeedCode('A'.repeat(24)) === 'a'.repeat(24));
check('parseSeedCode rejects outside A-Z0-9', ['', 'AB-C', 'A B', '<b>', 'ÄB', 'a_b', '__proto__', '%41'].every((x) => K.parseSeedCode(x) === null));
check('parseSeedCode rejects non-strings', [null, undefined, 5, {}, []].every((x) => K.parseSeedCode(x) === null));
// view model
const vm = K.result({ headline: ['Time! ', { text: '42', id: 'r-score' }], stats: [1, 2, 3, 4, 5].map((i) => ({ label: 'S' + i, value: i, best: i === 2 })), seed: 'demo1', value: 490, medals: meds, menuHref: '../../index.html' });
check('result: max 4 stat rows, best flag kept', vm.stats.length === 4 && vm.stats[1].best === true && vm.stats[0].best === false);
check('result: share code + replay from the seed', vm.code === 'DEMO1' && vm.replay === true && vm.seed === 'demo1');
check('result: goal line from medals with So close', vm.goal === 'So close! Next goal: Score 500', vm.goal);
check('result: no seed -> no replay, no code', (() => { const v = K.result({ headline: 'x' }); return v.replay === false && v.code === '' && v.menuHref === ''; })());
check('result never mutates input', (() => { const i = { stats: [{ label: 'a', value: 1 }], seed: 's' }; const s = JSON.stringify(i); K.result(i); return JSON.stringify(i) === s; })());

// ---- DOM stub (no jsdom): records every write path ----
let htmlWrites = 0;
function el(tag, doc) {
  const e = { tagName: tag.toUpperCase(), children: [], parent: null, hidden: false, id: '', className: '', type: '', href: '', attrs: {}, ownerDocument: doc, listeners: {}, _text: '',
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); } },
    appendChild(c) { c.parent = this; this.children.push(c); return c; },
    removeChild(c) { this.children.splice(this.children.indexOf(c), 1); c.parent = null; return c; },
    get firstChild() { return this.children[0] || null; },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); },
    click() { (this.listeners.click || []).forEach((f) => f({})); },
    focus() { doc.activeElement = this; },
    contains(x) { for (let p = x; p; p = p.parent) if (p === this) return true; return false; },
    set textContent(v) { this._text = String(v); this.children = []; }, get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); },
    set innerHTML(v) { htmlWrites++; }, get innerHTML() { return ''; },
  };
  return e;
}
const doc = { listeners: {}, activeElement: null, defaultView: { matchMedia: () => ({ matches: true }), navigator: {} },
  createElement(t) { return el(t, doc); }, createTextNode(t) { return { tagName: '#text', textContent: String(t), children: [] }; },
  addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); } };
const root = el('section', doc);
let again = 0, replay = null;
const evil = '<img src=x onerror=alert(1)>';
const pv = K.panel(root, K.result({ headline: [evil], stats: [{ label: evil, value: evil, best: true }], seed: 'demo1', menuHref: '../../index.html', ids: { again: 'again', replay: 'replay' } }), { again: () => again++, replay: (s) => { replay = s; } });
function walk(n, out) { out.push(n); (n.children || []).forEach((c) => walk(c, out)); return out; }
const all = walk(root, []);
const focusables = all.filter((x) => x.tagName === 'BUTTON' || x.tagName === 'A');
check('panel: uses textContent only (no innerHTML writes)', htmlWrites === 0 && all.some((x) => x._text === evil));
check('panel: Play again is the first focusable element', focusables[0] && focusables[0].id === 'again' && focusables[0].textContent === 'Play again', focusables.map((x) => x.id).join());
check('panel: Replay seed, Menu and Copy present', focusables.some((x) => x.id === 'replay') && focusables.some((x) => x.tagName === 'A' && x.href === '../../index.html' && x.textContent === 'Menu') && focusables.some((x) => x.textContent === 'Copy'));
check('panel: share code shown as text', all.some((x) => x._text === 'DEMO1'));
check('panel: New best! highlight on a best row', all.some((x) => x._text === 'New best!'));
check('panel: reduced motion flagged', root.classList.contains('mk-still') && root.classList.contains('mk-card'));
pv.again.click(); pv.replay.click();
check('panel: buttons call back', again === 1 && replay === 'demo1');
const key = (k) => { let prevented = false; doc.listeners.keydown.forEach((f) => f({ key: k, preventDefault() { prevented = true; } })); return prevented; };
doc.activeElement = null;
key('r'); key('Enter');
check('panel: R and Enter play again', again === 3, String(again));
key('Escape');
check('panel: Escape does nothing destructive', again === 3 && !root.hidden);
root.hidden = true; key('r');
check('panel: keys ignored while hidden', again === 3);
root.hidden = false;
K.panel(root, K.result({ headline: 'again' }), {});
check('panel: re-render does not stack key listeners', doc.listeners.keydown.length === 1);
pv.focus && pv.focus();
// copy with no clipboard: honest failure text, no throw
const p2 = K.panel(el('section', doc), K.result({ headline: 'x', seed: 'abc' }), {});
p2.copy.click();
check('copy without a clipboard says so', p2.copy.textContent === 'Copy failed');
// no storage in the kit
const src = require('fs').readFileSync(require('path').join(__dirname, '../shared/mm-minikit.js'), 'utf8');
check('no storage writes, no network, no innerHTML in the kit', !/localStorage|sessionStorage|indexedDB|fetch\(|XMLHttpRequest|innerHTML|firebase/i.test(src));

console.log((bad ? 'FAILED ' : 'ok ') + (n - bad) + '/' + n + ' shared-mm-minikit');
process.exit(bad ? 1 : 0);
