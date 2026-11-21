const D = require('../shared/mm-daily.js');
let fails = 0, n = 0;
function check(name, cond) { n++; if (!cond) { fails++; console.log('FAIL ' + name); } else console.log('ok   ' + name); }
const a = D.dailySeed('2026-11-21', 'world');
check('same date+kind same seed', a === D.dailySeed('2026-11-21', 'world'));
check('small positive integer', Number.isInteger(a) && a >= 1 && a <= 99999);
check('next day differs', a !== D.dailySeed('2026-11-22', 'world'));
check('world vs dungeon differ', a !== D.dailySeed('2026-11-21', 'dungeon'));
let ok = true;
for (let i = 1; i <= 200; i++) for (const k of ['world', 'dungeon']) { const s = D.dailySeed('2027-01-' + String(i).padStart(3, '0'), k); if (!(Number.isInteger(s) && s >= 1 && s <= 99999)) ok = false; }
check('always within 1..99999', ok);
check('unknown kind treated as world', D.dailySeed('2026-11-21', 'x') === a);
check('cleanDate strict', D.cleanDate('2026-11-21') === '2026-11-21' && D.cleanDate('2026-13-01') === null && D.cleanDate('2026-2-3') === null && D.cleanDate('2026-02-30') === null && D.cleanDate('x') === null && D.cleanDate(null) === null);
check('existing seedFor still stable', D.seedFor('2026-11-19') === D.seedFor('2026-11-19') && D.seedFor('a') !== D.seedFor('b'));
console.log(n + ' checks, ' + fails + ' failed'); process.exit(fails ? 1 : 0);
