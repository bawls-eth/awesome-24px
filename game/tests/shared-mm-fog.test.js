// Pure-node tests for shared/mm-fog.js (Realm minimap fog bitset). Run: node game/tests/shared-mm-fog.test.js
const F = require('../shared/mm-fog.js');
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }

check('constants: 8-tile cells, 32x32 grid, 1024 bits', F.CELL === 8 && F.SIDE === 32 && F.BITS === 1024 && F.BYTES === 128);
const b = F.make();
check('make: empty, nothing revealed', F.count(b) === 0 && !F.has(b, 0, 0));
check('set: first time true, second false', F.set(b, 3, 4) === true && F.set(b, 3, 4) === false && F.has(b, 3, 4) && F.count(b) === 1);
check('out-of-grid cells are never set or seen', F.set(b, -1, 0) === false && F.set(b, 32, 0) === false && F.set(b, 1.5, 0) === false && !F.has(b, 99, 99));
const r = F.make();
const n1 = F.reveal(r, 128, 128, 12);
check('reveal radius 12 at a cell corner reveals several cells', n1 >= 4 && n1 <= 16 && F.count(r) === n1, String(n1));
check('reveal again reports 0 new cells', F.reveal(r, 128, 128, 12) === 0);
check('the cell under the player is revealed', F.has(r, 16, 16));
check('far cells stay fogged', !F.has(r, 0, 0) && !F.has(r, 31, 31));
const e = F.make(); F.reveal(e, 0, 0, 12);
check('reveal at the world edge stays inside the grid', F.has(e, 0, 0) && F.count(e) >= 1 && F.count(e) <= 4);
check('reveal ignores NaN position', F.reveal(F.make(), NaN, 5, 12) === 0);
const s = F.encode(r);
check('encode: 172-char base64 and roundtrips exactly', s.length === 172 && /^[A-Za-z0-9+/]+=*$/.test(s) && Buffer.from(F.decode(s)).equals(Buffer.from(r)));
check('encode matches Node base64', s === Buffer.from(r).toString('base64'));
const all = F.make().fill(255);
check('all-ones roundtrips and counts 1024', F.count(F.decode(F.encode(all))) === 1024);
['', 'abc', null, undefined, 42, {}, s.slice(0, 100), s + 'AA', s.replace(/.$/, '!'), '!'.repeat(172), Buffer.alloc(127).toString('base64'), Buffer.alloc(129).toString('base64')].forEach((v, i) => check('decode: corrupt value ' + i + ' -> null', F.decode(v) === null));
check('clean: valid kept, corrupt -> empty string', F.clean(s) === s && F.clean('garbage') === '' && F.clean(null) === '');
process.exit(failed ? 1 : 0);
