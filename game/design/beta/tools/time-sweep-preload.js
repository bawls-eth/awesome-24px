// Preload for time-sweep.js (node --require). Shifts "now" by a fixed offset in the test process AND in every page the test
// opens, so a test runs as if it were started at TIME_SWEEP_AT (ISO instant). The clock keeps running (only shifted), so
// timers, timeouts and performance.now() are untouched. A test that installs its own clock (page.clock, ?today=) still wins.
// TIME_SWEEP_TZ (IANA zone) is applied to contexts that set no timezoneId of their own (the node side gets it through TZ).
// Reads no storage, opens no network connection; the database rules of the test itself are unchanged.
const Module = require('module');
const at = Date.parse(process.env.TIME_SWEEP_AT || '');
const OFF = isFinite(at) ? at - Date.now() : 0;
const TZ = process.env.TIME_SWEEP_TZ || '';

function shiftDate(off) { // runs in node and (stringified) in the page
  const g = typeof globalThis !== 'undefined' ? globalThis : window;
  if (g.__timeSweepOff !== undefined || !off) return;
  const Real = g.Date;
  function Fake(...a) {
    if (!new.target) return new Real(Real.now() + off).toString();
    return a.length ? Reflect.construct(Real, a, new.target) : Reflect.construct(Real, [Real.now() + off], new.target);
  }
  Fake.prototype = Real.prototype;
  Object.setPrototypeOf(Fake, Real);
  Fake.now = () => Real.now() + off;
  Fake.parse = Real.parse; Fake.UTC = Real.UTC;
  Real.prototype.constructor = Fake;
  g.Date = Fake;
  g.__timeSweepOff = off;
}
shiftDate(OFF);

const SRC = `(${shiftDate.toString()})(${OFF});`;
function wrapContext(ctx) { if (ctx && !ctx.__ts) { ctx.__ts = true; return ctx.addInitScript(SRC).then(() => ctx); } return Promise.resolve(ctx); }
const withTz = (o) => (TZ && !(o && o.timezoneId) ? Object.assign({}, o, { timezoneId: TZ }) : o);
function wrapBrowser(b) {
  if (!b || b.__ts) return b; b.__ts = true;
  const nc = b.newContext.bind(b);
  b.newContext = async (o) => wrapContext(await nc(withTz(o)));
  b.newPage = async (o) => (await b.newContext(o)).newPage();
  return b;
}
function wrapType(t) {
  if (!t || t.__ts) return; t.__ts = true;
  const launch = t.launch.bind(t); t.launch = async (o) => wrapBrowser(await launch(o));
  if (t.launchPersistentContext) { const lp = t.launchPersistentContext.bind(t); t.launchPersistentContext = async (d, o) => wrapContext(await lp(d, withTz(o))); }
}
if (OFF || TZ) {
  const load = Module._load;
  Module._load = function (request) {
    const m = load.apply(this, arguments);
    if (request === 'playwright' || request === 'playwright-core') { try { wrapType(m.chromium); wrapType(m.firefox); wrapType(m.webkit); } catch (e) { /* leave playwright alone */ } }
    return m;
  };
}
