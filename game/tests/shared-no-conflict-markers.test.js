// Guard: no git merge-conflict markers may be committed in source, data or design files.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const EXT = new Set(['.js', '.html', '.css', '.json', '.md', '.txt']);
const SKIP = new Set(['node_modules', '.git', 'assets']);
const bad = [];
(function walk(dir) {
  for (const n of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(n.name)) continue;
    const p = path.join(dir, n.name);
    if (n.isDirectory()) { walk(p); continue; }
    if (!EXT.has(path.extname(n.name))) continue;
    if (fs.statSync(p).size > 5e6) continue;
    const lines = fs.readFileSync(p, 'utf8').split('\n');
    lines.forEach((l, i) => { if (/^(<<<<<<< |>>>>>>> )/.test(l) || (/^=======$/.test(l) && lines.some((x) => /^<<<<<<< /.test(x)))) bad.push(path.relative(ROOT, p) + ':' + (i + 1)); });
  }
})(ROOT);
if (bad.length) { console.log('FAIL conflict markers found: ' + bad.slice(0, 10).join(', ')); process.exit(1); }
console.log('ALL PASSED (no merge-conflict markers in game/)');
