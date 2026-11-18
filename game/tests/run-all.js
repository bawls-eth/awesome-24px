// Runs every game/tests/*.test.js against a throwaway static server.
//   NODE_PATH=$(npm root -g) node game/tests/run-all.js
// Needs Playwright (require('playwright')) and network access to the live
// town (bots join as ADMIN* — presence only; they never chat or write anything
// else to Firebase).
const { spawn, spawnSync } = require('child_process');
const http = require('http');
const net = require('net');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..', '..');

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); });
    s.on('error', reject);
  });
}
function waitUp(url, tries = 40) {
  return new Promise((resolve, reject) => {
    const attempt = (n) => http.get(url, (r) => { r.resume(); resolve(); }).on('error', () => (n <= 0 ? reject(new Error('server did not start')) : setTimeout(() => attempt(n - 1), 150)));
    attempt(tries);
  });
}

(async () => {
  const port = String(process.env.PORT || await freePort());
  const server = spawn('python3', ['-m', 'http.server', port], { cwd: root, stdio: 'ignore' });
  const stop = () => { try { server.kill(); } catch (e) { /* already gone */ } };
  process.on('exit', stop);
  process.on('SIGINT', () => { stop(); process.exit(130); });
  const base = `http://localhost:${port}/game/index.html`;
  await waitUp(base);
  const env = { ...process.env, BASE: base };
  let failed = 0;
  for (const f of fs.readdirSync(__dirname).filter((x) => x.endsWith('.test.js')).sort()) {
    const r = spawnSync('node', [path.join(__dirname, f)], { env, encoding: 'utf8', timeout: 170000 });
    const ok = r.status === 0;
    const out = (r.stdout || '').split('\n').filter((l) => /PASSED|FAILED/.test(l)).join(' | ');
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${f} ${out}`);
    if (!ok) { failed++; console.log((r.stdout || '').split('\n').filter((l) => l.startsWith('FAIL')).join('\n') + (r.stderr || '').slice(0, 400)); }
  }
  stop();
  console.log(failed ? `${failed} suite(s) failed` : 'ALL SUITES PASSED');
  process.exit(failed ? 1 : 0);
})();
