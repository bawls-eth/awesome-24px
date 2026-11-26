// Cycle 15 L (1): static guard for the shared pay-once reader. Every save key that answers "already paid / claimed / counted today?"
// is listed in PAY_ONCE_KEYS (main.js) and must be read through payOnceRecord(key), which reads live (storage + this tab's refused
// writes). A storage-only read (loadSave().<key>) of such a key is the cycle 13/14/15 repeat-pay bug, so this test fails on one.
// Limit (honest): it sees the direct forms loadSave().<key> and loadSaveLive().<key> only, not a read through a local variable.
// Run: node game/tests/cyc15-lead-pay-once-guard.test.js
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
let fails = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${!ok && detail ? ' :: ' + detail : ''}`); if (!ok) fails++; };

const m = src.match(/const PAY_ONCE_KEYS = \[([^\]]*)\]/);
check('main.js declares PAY_ONCE_KEYS', !!m);
const keys = m ? m[1].split(',').map((s) => s.trim().replace(/['"]/g, '')).filter(Boolean) : [];
check('main.js has the one reader: payOnceRecord(key) reads loadSaveLive()', /function payOnceRecord\(key\) \{ return loadSaveLive\(\)\[key\]; \}/.test(src));
['fishlog', 'weedsPulled', 'bugoff', 'home', 'mail', 'dailies', 'bounty', 'villagerTalkDay', 'errand'].forEach((k) => check(`'${k}' is a declared pay-once key`, keys.includes(k)));
const code = src.split('\n').map((l, i) => ({ l, n: i + 1 })).filter((x) => !/^\s*\/\//.test(x.l));
keys.forEach((k) => {
  const bad = code.filter((x) => new RegExp('loadSave(Live)?\\(\\)\\.' + k + '\\b').test(x.l)).map((x) => x.n);
  check(`'${k}' is never read from storage directly (loadSave().${k})`, bad.length === 0, 'main.js lines ' + bad.join(', '));
  check(`'${k}' has a payOnceRecord('${k}') reader`, src.includes(`payOnceRecord('${k}')`));
});
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
