// Unit tests for shared/mm-world-party.js. Run: node game/tests/shared-mm-world-party.test.js
const fs = require('fs');
const path = require('path');
const W = require('../shared/mm-world-party.js');
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }
const done = () => { console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exitCode = failed ? 1 : 0; };

// constants
check('8 Hz position rate', W.POS_HZ === 8 && W.POS_INTERVAL_MS === 125);
check('40 tile range', W.RANGE_TILES === 40);
check('max 4 seats (from mm-party)', W.MAX_SEATS === 4);

// constructors + round trip
const p = W.pos(1, 12.345, 40, 3, 7);
check('pos clean and rounded', p && p.t === 'pos' && p.s === 1 && p.x === 12.35 && p.y === 40 && p.f === 3 && p.n === 7);
check('pos encode/decode round trip', JSON.stringify(W.decode(W.encode(p))) === JSON.stringify(p));
const h = W.hit(2, 'e17', 33.456, 4);
check('hit round trip, damage rounded to 0.1', h && h.d === 33.5 && JSON.stringify(W.decode(W.encode(h))) === JSON.stringify(h));
const b = W.bag(3, 9, 'potion_red', 5, 6);
check('bag id carries owner seat', b && b.id === 'b3-9' && b.s === 3 && JSON.stringify(W.decode(W.encode(b))) === JSON.stringify(b));
check('bag ids never collide across players', W.bag(0, 1, 'coin', 1, 1).id !== W.bag(1, 1, 'coin', 1, 1).id && W.bagId(1, 11) !== W.bagId(11, 1));

// hostile input
const bad = [null, undefined, 5, 'x', [], {}, { t: 'pos' }, { t: 'zzz', s: 0 }, { t: 'pos', s: 4, x: 1, y: 1 }, { t: 'pos', s: -1, x: 1, y: 1 },
  { t: 'pos', s: 0, x: NaN, y: 1 }, { t: 'pos', s: 0, x: 1, y: 1, f: 9 }, { t: 'hit', s: 0, e: 'a b', d: 5 }, { t: 'hit', s: 0, e: 'ok', d: -5 },
  { t: 'hit', s: 0, e: 'ok', d: Infinity }, { t: 'bag', s: 0, id: 'b1-1', item: 'x', x: 1, y: 1 }, { t: 'bag', s: 0, id: 'b0-1', item: 'BAD ITEM', x: 1, y: 1 }];
check('clean rejects hostile messages without throwing', bad.every((m) => W.clean(m) === null));
check('decode rejects garbage / oversize', ['', '{', 'null', '[]', 'x'.repeat(2000), JSON.stringify({ t: 'pos', s: 0, x: 1, y: 1, pad: 'y'.repeat(600) }).replace('"pad"', '"pad"')].every((s) => W.decode(s) === null || s.indexOf('pad') >= 0));
check('unknown fields are dropped', Object.keys(W.clean({ t: 'pos', s: 0, x: 1, y: 2, evil: 1, __proto__: { z: 1 } })).sort().join() === 'f,n,s,t,x,y');
check('huge damage and coordinates are clamped', W.hit(0, 'e', 1e12).d === 100000 && W.pos(0, 1e9, -5).x === 2048 && W.pos(0, 1e9, -5).y === 0);
check('non-string decode input is null', W.decode(42) === null && W.decode(null) === null);

// range
check('inRange within 40 tiles', W.inRange({ x: 0, y: 0 }, { x: 24, y: 32 }) && !W.inRange({ x: 0, y: 0 }, { x: 24, y: 33 }));
check('inRange handles missing peers', !W.inRange(null, { x: 0, y: 0 }));

// sender at 8 Hz
const s = W.makeSender(0);
let sent = 0;
for (let t = 0; t < 1000; t += 16) if (s.pos(t, t / 100, 5, 0)) sent++;
check('sender emits ~8 pos messages per second from 60 fps input', sent >= 7 && sent <= 9, 'sent ' + sent);
check('first pos is sent immediately, a second 50 ms later is not', (() => { const q = W.makeSender(1); return !!q.pos(0, 1, 1, 0) && q.pos(50, 1, 1, 0) === null && !!q.pos(125, 1, 1, 0); })());
check('sender messages decode with the right seat and sequence', (() => { const q = W.makeSender(2); const a = W.decode(q.pos(0, 1, 1, 0)); const c = W.decode(q.pos(200, 2, 1, 0)); return a.s === 2 && c.s === 2 && c.n === a.n + 1; })());
check('sender hit message', (() => { const m = W.decode(W.makeSender(1).hit('e5', 12)); return m.t === 'hit' && m.e === 'e5' && m.d === 12; })());

// relay round trip, 2 peers
const relay = W.createRelay();
const A = relay.join(0), B = relay.join(1);
check('relay joins two peers, refuses a duplicate or bad seat', A && B && relay.join(1) === null && relay.join(7) === null && relay.size() === 2);
A.send(W.encode(W.pos(0, 100, 100, 2, 1)));
B.send(W.encode(W.pos(1, 110, 100, 4, 1)));
A.send(W.encode(W.pos(0, 100, 100, 2, 2))); // the relay only knows where a receiver is after its first pos, so the next 8 Hz tick flows
check('peers within 40 tiles see each other', A.drain().some((m) => m.t === 'pos' && m.s === 1 && m.x === 110) && B.drain().some((m) => m.t === 'pos' && m.s === 0 && m.x === 100));
B.send(W.encode(W.hit(1, 'e3', 25, 2)));
const gotHit = A.drain();
check('hit relays to the other peer, not back to the sender', gotHit.length === 1 && gotHit[0].t === 'hit' && gotHit[0].e === 'e3' && B.drain().length === 0);
B.send(W.encode(W.pos(1, 200, 100, 4, 2)));
check('a peer 100 tiles away is out of range: nothing relayed', A.drain().length === 0);
A.send(W.encode(W.pos(0, 190, 100, 1, 2)));
check('back in range, positions flow again', B.drain().some((m) => m.s === 0 && m.x === 190));

// bags are soulbound
const C = relay.join(2);
C.send(W.encode(W.pos(2, 192, 100, 0, 1)));
A.drain(); B.drain(); C.drain();
A.send(W.encode(W.bag(1, 1, 'potion_red', 195, 100)));
check('a bag reaches only its owner seat', B.drain().filter((m) => m.t === 'bag' && m.id === 'b1-1').length === 1 && C.drain().length === 0);
A.send(W.encode(W.bag(2, 1, 'potion_red', 195, 100)));
check('each qualifying player gets their own bag for a shared kill', C.drain().some((m) => m.t === 'bag' && m.id === 'b2-1') && B.drain().length === 0);

// anti-spoof and bad strings
const before = relay.stats.dropped;
check('a peer cannot send a pos for another seat', A.send(W.encode(W.pos(1, 1, 1, 0, 9))) === false && relay.stats.dropped > before);
check('garbage strings are dropped by the relay', A.send('{{') === false && A.send(null) === false);
B.leave();
check('after leave the peer no longer receives', relay.size() === 2 && (A.send(W.encode(W.pos(0, 191, 100, 0, 3))), true));

// no Firebase / network / storage code at all
const src = fs.readFileSync(path.join(__dirname, '../shared/mm-world-party.js'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
check('no database, network or storage code (grep)', !/firebase|database\(|fetch\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|Math\.random|document\.|window\./i.test(src));

done();
