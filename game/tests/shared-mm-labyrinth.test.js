// Unit tests for shared/mm-labyrinth.js (Node only).
//   NODE_PATH=$(npm root -g) node game/tests/shared-mm-labyrinth.test.js
const { check, done } = require('./helpers');
const L = require('../shared/mm-labyrinth.js');

const m = L.generate('alpha');
check('grid is 49x49', m.N === 49 && m.tiles.length === 49 * 49 && m.rows().length === 49 && m.rows()[0].length === 49);
check('border is all wall', m.rows()[0] === '#'.repeat(49) && m.rows()[48] === '#'.repeat(49));
const a = Buffer.from(L.generate('same').tiles), b = Buffer.from(L.generate('same').tiles);
check('same seed is byte-identical', a.equals(b));
check('different seeds differ', !Buffer.from(L.generate('one').tiles).equals(Buffer.from(L.generate('two').tiles)));
check('has start and boss chambers', m.start.kind === 'start' && m.boss && m.boss.kind === 'boss');

let allOk = true, allConn = true, bossFar = true, shareMin = 1, shareMax = 0, sum = 0, sizes = true;
for (let i = 0; i < 100; i++) {
  const g = L.generate('seed-' + i), v = g.validate();
  if (!v.ok) allOk = false;
  if (v.floor !== v.reach) allConn = false;
  const far = Math.max.apply(null, g.chambers.map((c) => c.distance));
  if (g.boss.distance < far) bossFar = false;
  if (g.N !== 49) sizes = false;
  shareMin = Math.min(shareMin, g.braidShare); shareMax = Math.max(shareMax, g.braidShare); sum += g.braidShare;
}
check('100 seeds all validate()', allOk);
check('all floor tiles connected over 100 seeds', allConn);
check('boss is the farthest chamber over 100 seeds', bossFar);
check('100 seeds are all 49x49', sizes);
const want = L.braidFor(3), avg = sum / 100;
check('braid share ~ design default (tier 3 = 0.40) on average', Math.abs(avg - want) < 0.03, 'avg ' + avg);
check('braid share per seed within tolerance', shareMin > want - 0.1 && shareMax < want + 0.1, shareMin + '..' + shareMax);
check('braid option overrides', L.generate('x', { braid: 0 }).braided === 0);
check('validate catches a disconnected floor tile', (() => {
  const g = L.generate('q');
  const first = g.tiles.findIndex((v, i) => v === 1 && i % 49 > 0 && i % 49 < 48 && i > 49 && i < 49 * 48);
  g.tiles[first] = 0; // a lone floor pocket inside a wall is only disconnected if fully enclosed; force it
  for (const o of [-49, 49, -1, 1]) g.tiles[first + o] = 1;
  return !L.validate(g).ok;
})());

const t = L.tide.create({ startAt: 90, speed: 0.6, picnic: false });
t.tick(89.9);
check('tide not started before 90 s', t.front() === 0 && !t.covers(0) && !t.started());
t.tick(10.1);
check('tide advances 0.6 tiles/s after 90 s', Math.abs(t.front() - 6) < 1e-9, String(t.front()));
check('tide covers distances behind the front only', t.covers(5) && !t.covers(7));
const p = L.tide.create({ startAt: 90, speed: 0.6, picnic: true });
p.tick(500);
check('picnic tide never advances', p.front() === 0 && !p.covers(0) && !p.started());
check('tide defaults are 90 s / 0.6', (() => { const d = L.tide.create(); d.tick(100); return Math.abs(d.front() - 6) < 1e-9; })());
done();
