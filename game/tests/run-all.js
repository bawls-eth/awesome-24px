// Runs every game/tests/*.test.js against a throwaway static server.
//   NODE_PATH=$(npm root -g) node game/tests/run-all.js
// Needs Playwright (require('playwright')). Joins the live town as ADMIN* bots
// (presence only — it never chats or writes anything else to Firebase).
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..', '..');
const port = process.env.PORT || '8461';
const server = spawn('python3', ['-m', 'http.server', port], { cwd: root, stdio: 'ignore' });
const env = { ...process.env, BASE: `http://localhost:${port}/game/index.html` };
let failed = 0;
setTimeout(() => {
  for (const f of fs.readdirSync(__dirname).filter((x) => x.endsWith('.test.js')).sort()) {
    const r = spawnSync('node', [path.join(__dirname, f)], { env, encoding: 'utf8', timeout: 170000 });
    const ok = r.status === 0;
    const out = (r.stdout || '').split('\n').filter((l) => /^FAIL|PASSED|FAILED/.test(l)).join(' | ');
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${f} ${out}`);
    if (!ok) { failed++; console.log((r.stdout || '').split('\n').filter((l) => l.startsWith('FAIL')).join('\n') + (r.stderr || '').slice(0, 400)); }
  }
  server.kill();
  console.log(failed ? `${failed} suite(s) failed` : 'ALL SUITES PASSED');
  process.exit(failed ? 1 : 0);
}, 800);
