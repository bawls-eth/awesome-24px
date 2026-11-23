// Load-scaled timing budgets (additive helper; no test is weakened: on an idle machine the factor is exactly 1).
//   const LS = require('./lib/load-scale');
//   const f = LS.factor();                 // 1 when idle, up to CAP (6) when the box is busy
//   check(`under ${LS.budget(3000)} ms`, ms < LS.budget(3000));
// How: a fixed integer + array workload is timed 5 times and the MINIMUM is kept (the least-disturbed run).
// factor = clamp(max(min / REF_MS, runnable-per-core), 1, CAP). REF_MS is the minimum measured on an idle dev box.
// Cached per process; pin with LOAD_SCALE=<number >= 1> (LOAD_SCALE=1 forces the strict budget). fresh() re-measures.
// CAP is the hard upper bound: a genuine 6x regression still fails even on a loaded box.
const os = require('os');
const REF_MS = 6;
const CAP = 6;
function work() {
  let h = 2166136261 >>> 0; const a = new Array(4096);
  for (let r = 0; r < 24; r++) { for (let i = 0; i < a.length; i++) { h = Math.imul(h ^ (i + r), 16777619) >>> 0; a[i] = h & 1023; } a.sort((x, y) => x - y); }
  return h ^ a[17];
}
let cached = null;
function measure() {
  let best = Infinity;
  for (let k = 0; k < 5; k++) { const t = process.hrtime.bigint(); work(); best = Math.min(best, Number(process.hrtime.bigint() - t) / 1e6); }
  return best;
}
function factor() {
  if (process.env.LOAD_SCALE) { const v = Number(process.env.LOAD_SCALE); if (isFinite(v) && v >= 1) return Math.min(v, CAP); }
  if (cached !== null) return cached;
  const ms = measure();
  const cores = Math.max(1, os.cpus().length);
  const queue = Math.max(1, os.loadavg()[0] / cores); // runnable processes per core: slows page work the calibration loop can miss
  cached = Math.round(Math.min(CAP, Math.max(1, ms / REF_MS, queue)) * 100) / 100;
  if (cached > 1.05) console.log(`INFO load factor ${cached} (calibration ${ms.toFixed(1)} ms vs ${REF_MS} ms idle, load/core ${queue.toFixed(2)}): timing budgets scaled`);
  return cached;
}
const budget = (base) => Math.round(base * factor());
function fresh() { cached = null; return factor(); }
module.exports = { factor, fresh, budget, REF_MS, CAP };
