// Unit tests for shared/mm-party-bc.js with a fake BroadcastChannel. Run: node game/tests/shared-mm-party-bc.test.js
const fs = require('fs');
const path = require('path');
const BC = require('../shared/mm-party-bc.js');
const WP = require('../shared/mm-world-party.js');
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }

// A fake BroadcastChannel: instances with the same name hear each other (not themselves), delivery is synchronous.
const bus = {};
class Fake {
  constructor(name) { this.name = name; this.closed = false; this.onmessage = null; (bus[name] = bus[name] || []).push(this); }
  postMessage(d) { if (this.closed) throw new Error('closed'); bus[this.name].forEach((c) => { if (c !== this && !c.closed && c.onmessage) c.onmessage({ data: JSON.parse(JSON.stringify(d)) }); }); }
  close() { this.closed = true; }
}
const inject = (name, data) => bus[name].forEach((c) => c.onmessage && c.onmessage({ data }));

check('channel name is mm-party-<seed>', BC.channelName('12345') === 'mm-party-12345' && BC.channelName(777) === 'mm-party-777' && BC.PREFIX === 'mm-party-');
check('seed regex accepts word seeds', ['a', 'Seed_1', 'x-y', '1'.repeat(32)].every((s) => BC.seedOk(s)));
check('seed regex rejects bad seeds', ['', 'a b', 'a/b', '../x', 'x'.repeat(33), null, undefined, {}, [], NaN, Infinity, '<s>', 'a\n'].every((s) => !BC.seedOk(s)));
check('bad seed opens an inert transport', (() => { const t = BC.open('a b', { BC: Fake }); return t.ok === false && t.name === null && t.send(WP.pos(0, 1, 1)) === false; })());

const a = BC.open('s1', { BC: Fake }), b = BC.open('s1', { BC: Fake }), other = BC.open('s2', { BC: Fake });
check('open gives a live transport', a.ok && b.ok && a.name === 'mm-party-s1');
const gotB = [], gotO = [], gotA = [];
b.onMessage((m) => gotB.push(m)); other.onMessage((m) => gotO.push(m)); a.onMessage((m) => gotA.push(m));
check('send of a clean message returns true', a.send(WP.pos(1, 5.5, 6, 2, 1)) === true);
check('the peer receives the cleaned message', gotB.length === 1 && gotB[0].t === 'pos' && gotB[0].s === 1 && gotB[0].x === 5.5);
check('a different seed hears nothing', gotO.length === 0);
check('sender does not hear itself', gotA.length === 0);
check('a hit message passes through', a.send(WP.hit(1, 'e1', 12, 2)) && gotB[1].t === 'hit' && gotB[1].d === 12);
check('a bag message passes through', a.send(WP.bag(1, 3, 'coin', 4, 4)) && gotB[2].id === 'b1-3');

// outgoing validation
const before = gotB.length;
const badOut = [null, undefined, 5, 'x', [], {}, { t: 'pos' }, { t: 'pos', s: 9, x: 1, y: 1 }, { t: 'hit', s: 0, e: 'a b', d: 3 }, { t: 'zzz', s: 0 }];
check('send rejects invalid messages (false) without posting', badOut.every((m) => a.send(m) === false) && gotB.length === before);
check('send strips unknown fields', (() => { a.send({ t: 'pos', s: 0, x: 1, y: 2, evil: 'x' }); return !('evil' in gotB[gotB.length - 1]); })());

// incoming validation
const n0 = gotB.length;
['str', 5, null, [], { t: 'pos', s: 7, x: 1, y: 1 }, { t: 'bag', s: 0, id: 'b1-1', item: 'x', x: 1, y: 1 }, { t: 'hit', s: 0, e: 'x', d: -1 }, { __proto__: { t: 'pos' } }].forEach((d) => inject('mm-party-s1', d));
check('hostile incoming messages are dropped', gotB.length === n0);
check('an event without data does not throw', (() => { try { bus['mm-party-s1'].forEach((c) => c.onmessage(undefined)); bus['mm-party-s1'].forEach((c) => c.onmessage(null)); return true; } catch (e) { return false; } })());
inject('mm-party-s1', { t: 'pos', s: 2, x: 1e9, y: -4, f: 1, n: 1 });
check('incoming values are clamped by clean', gotB[gotB.length - 1].x === 2048 && gotB[gotB.length - 1].y === 0);

// handlers
let thrown = 0; const off = b.onMessage(() => { thrown++; throw new Error('bad handler'); });
const k = gotB.length; a.send(WP.pos(0, 1, 1));
check('a throwing handler does not break the others', thrown === 1 && gotB.length === k + 1);
off(); a.send(WP.pos(0, 2, 2));
check('off() unsubscribes', thrown === 1 && gotB.length === k + 2);
check('onMessage with a non-function is a safe no-op', typeof b.onMessage(5) === 'function' && b.onMessage(null)() === undefined);

// close
const c = BC.open('s1', { BC: Fake }); const gotC = [];
c.onMessage((m) => gotC.push(m)); c.close();
a.send(WP.pos(0, 3, 3));
check('closed transport hears nothing', gotC.length === 0);
check('closed transport cannot send', c.send(WP.pos(0, 1, 1)) === false);
check('close twice is safe', (() => { try { c.close(); return true; } catch (e) { return false; } })());
a.close(); const k2 = gotB.length;
check('send after close is false and posts nothing', a.send(WP.pos(0, 1, 1)) === false && gotB.length === k2);

// graceful no-op
const prev = global.BroadcastChannel;
delete global.BroadcastChannel;
const none = BC.open('s1');
check('no BroadcastChannel: inert transport, ok=false', none.ok === false && none.send(WP.pos(0, 1, 1)) === false);
check('no BroadcastChannel: onMessage/close are safe', (() => { try { none.onMessage(() => {})(); none.close(); return true; } catch (e) { return false; } })());
class Throws { constructor() { throw new Error('nope'); } }
check('a constructor that throws gives an inert transport', BC.open('s1', { BC: Throws }).ok === false);
class PostThrows extends Fake { postMessage() { throw new Error('clone'); } }
check('postMessage that throws gives false', BC.open('s3', { BC: PostThrows }).send(WP.pos(0, 1, 1)) === false);
if (prev) global.BroadcastChannel = prev;
check('uses the global BroadcastChannel when present', (() => { global.BroadcastChannel = Fake; const t = BC.open('s9'); global.BroadcastChannel = prev; return t.ok === true; })());

// no network or database code
const src = fs.readFileSync(path.join(__dirname, '../shared/mm-party-bc.js'), 'utf8');
check('source has no firebase, database( or WebSocket', !/firebase|database\s*\(|WebSocket|fetch\s*\(|XMLHttpRequest/i.test(src));
console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exitCode = failed ? 1 : 0;
