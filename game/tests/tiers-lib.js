// Selection helpers for run-all.js: tier / class filters and deterministic shards.
const fs = require('fs');
const path = require('path');

const CLASSES = ['node', 'browser', 'live'];
const TIERS = ['smoke', 'full'];
// Static cost guess (seconds) used when no measured timing is requested: keeps shards balanced and identical on every machine.
const DEFAULT_COST = { node: 1, browser: 20, live: 45 };

function allTests(dir) {
  return fs.readdirSync(dir).filter((x) => x.endsWith('.test.js')).sort();
}
function loadTable(dir) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, 'test-tiers.json'), 'utf8')); } catch (e) { return {}; }
}
// Unclassified files are treated as live + full: the safest reading (serial, never in smoke).
function info(table, f) { return table[f] || { class: 'live', tier: 'full' }; }

function select(files, table, { tier = 'full', only = null } = {}) {
  return files.filter((f) => {
    const t = info(table, f);
    if (tier === 'smoke' && t.tier !== 'smoke') return false;
    if (only && t.class !== only) return false;
    return true;
  });
}

// Greedy longest-cost-first bin packing; ties broken by name, so the result depends only on (files, n, costs).
function shard(files, table, i, n, timings = null) {
  const cost = (f) => (timings && timings[f] > 0 ? timings[f] : DEFAULT_COST[info(table, f).class]);
  const order = files.slice().sort((a, b) => cost(b) - cost(a) || (a < b ? -1 : 1));
  const bins = Array.from({ length: n }, () => ({ total: 0, files: [] }));
  for (const f of order) {
    let best = bins[0];
    for (const b of bins) if (b.total < best.total) best = b;
    best.files.push(f); best.total += cost(f);
  }
  return bins[i - 1].files.sort();
}

function parseShard(v) {
  const m = /^(\d+)\/(\d+)$/.exec(v || '');
  if (!m) return null;
  const i = +m[1], n = +m[2];
  return i >= 1 && n >= 1 && i <= n ? { i, n } : null;
}

module.exports = { CLASSES, TIERS, DEFAULT_COST, allTests, loadTable, info, select, shard, parseShard };
