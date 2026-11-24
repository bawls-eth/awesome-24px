// NEXT-SLICES-5 DD5 (cyc0-S): Deepdelve bank line + per-seed depth ghost. The HUD says what the dive is worth if you climb
// out now (x SAFE_BONUS once armed) versus a fall, and how far you are from the deepest dive on this world seed; the seed best
// is an additive field `seedBest` inside pixeltown-deepdelve-runs-v1 (old records load, merges keep the max per seed).
// The path-replay half of DD5 (MMGhost trail drawn in 3D) is NOT built here.
// Serve the repo root; Run: BASE=http://localhost:8440/game/index.html node game/tests/deepdelve-ghost.test.js
// SHOTS=<dir> writes desktop + phone screenshots. Firebase/DB blocked (blockDb); nothing leaves the page.
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440').replace(/\/game\/.*$/, '').replace(/\/$/, '');
const URL = (q) => ORIGIN + '/game/games/deepdelve/index.html?test=1' + (q || '');
const RUNS = 'pixeltown-deepdelve-runs-v1';

class Mem { constructor(o) { this.m = Object.assign({}, o); } getItem(k) { return k in this.m ? this.m[k] : null; } setItem(k, v) { this.m[k] = String(v); } }

(async () => {
  // ---- pure module ----
  const R = require('../games/deepdelve/dd-run.js');
  const M = require('../shared/mm-save-merge.js');
  const old = R.clean('{"v":1,"runs":4,"safe":1,"best":{"score":90,"depth":9,"ores":2,"combo":3}}');
  check('module: an old record (no seedBest) loads with an empty seed map and keeps its bests', JSON.stringify(old.seedBest) === '{}' && old.best.depth === 9 && old.runs === 4);
  const junk = R.clean({ seedBest: { 7: 12, x: 5, '-3': 4, 9: -2, 11: 'deep', 12: 5000 } });
  check('module: seedBest is cleaned (integer keys, 1..999, junk dropped)', JSON.stringify(junk.seedBest) === JSON.stringify({ 12: 999, 7: 12, '-3': 4 }), JSON.stringify(junk.seedBest));
  const many = {}; for (let i = 0; i < 50; i++) many[i] = i + 1;
  check('module: at most SEED_CAP seeds kept, the deepest ones', Object.keys(R.clean({ seedBest: many }).seedBest).length === R.SEED_CAP && R.clean({ seedBest: many }).seedBest['49'] === 50 && !('0' in R.clean({ seedBest: many }).seedBest));

  const rec = R.clean(null);
  const run = R.start(3, 'plain', 7);
  let b = R.bank(run, rec);
  check('bank: a fresh dive is not armed and needs SAFE_DEPTH blocks', b.armed === false && b.toArm === R.SAFE_DEPTH && b.surface === b.fall && b.ghost === 0, JSON.stringify(b));
  R.depth(run, 3 + 4); R.mined(run, 'gold_ore', 1);
  b = R.bank(run, rec);
  check('bank: 4 deep shows 2 blocks to arm and the fall score so far (4*10 + 1 block + 3*8 ore)', b.toArm === R.SAFE_DEPTH - 4 && b.fall === 40 + 1 + 24 + 3 && b.armed === false, JSON.stringify(b));
  R.depth(run, 3 + 10);
  b = R.bank(run, rec);
  check('bank: once armed, climbing out is worth floor(fall x SAFE_BONUS)', b.armed === true && b.toArm === 0 && b.surface === Math.floor(b.fall * R.SAFE_BONUS) && b.surface === R.score(run, true), JSON.stringify(b));
  const sum = R.finish(rec, run, true);
  check('finish: the first dive on seed 7 sets seedBest[7] = its depth', sum.pb.seed === true && sum.prev.seedDepth === 0 && rec.seedBest['7'] === 10, JSON.stringify(rec.seedBest));
  const run2 = R.start(0, 'plain', 7); R.depth(run2, 6);
  b = R.bank(run2, rec);
  check('ghost: the next dive on seed 7 sees the ghost at 10 deep, 4 to go', b.ghost === 10 && b.ahead === -4, JSON.stringify(b));
  R.depth(run2, 13);
  check('ghost: 13 deep is 3 past the ghost', R.bank(run2, rec).ahead === 3);
  const sum2 = R.finish(rec, run2, false);
  check('finish: a deeper fall still raises the seed ghost (13) and reports the old one (10)', sum2.pb.seed === true && sum2.prev.seedDepth === 10 && rec.seedBest['7'] === 13);
  const run3 = R.start(0, 'plain', 8); R.depth(run3, 2);
  check('ghost: another seed has its own (empty) ghost', R.bank(run3, rec).ghost === 0);
  const run4 = R.start(0, 'plain', 7); R.depth(run4, 5); const sum4 = R.finish(rec, run4, false);
  check('finish: a shallower dive never lowers the seed ghost', sum4.pb.seed === false && rec.seedBest['7'] === 13);
  const st = new Mem({ [RUNS]: JSON.stringify({ v: 1, runs: 9, safe: 2, best: { score: 1, depth: 1, ores: 0, combo: 0 }, seedBest: { 7: 20, 5: 4 }, future: 'kept' }) });
  R.save(st, rec);
  const back = JSON.parse(st.getItem(RUNS));
  check('save: merge keeps the max per seed against storage (7: 20 from the other tab, 8 absent, 5 kept) and unknown fields', back.seedBest['7'] === 20 && back.seedBest['5'] === 4 && back.future === 'kept' && back.runs === 9, JSON.stringify(back));
  const policy = M && M.SPECS ? M.SPECS[RUNS] : null;
  if (policy) check('save-merge policy maxes seedBest', (policy.maxMap || []).indexOf('seedBest') >= 0, JSON.stringify(policy));

  // ---- page ----
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const shots = process.env.SHOTS;
  const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
  for (const [name, opts, scale] of [['desktop', { viewport: { width: 1280, height: 720 } }, 1], ['phone', PHONE, 1], ['phone-text150', PHONE, 1.5]]) {
    const isPhone = opts === PHONE;
    const ctx = await browser.newContext(opts);
    const db = await blockDb(ctx);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    await page.addInitScript(([k, sc]) => { try { if (sc !== 1) localStorage.setItem('pixeltown-access-v1', JSON.stringify({ v: 1, hudScale: sc })); localStorage.setItem(k, JSON.stringify({ v: 1, runs: 3, safe: 1, best: { score: 50, depth: 30, ores: 0, combo: 1 }, seedBest: { 4242: 9 } })); } catch (e) { /* blocked */ } }, [RUNS, scale]);
    await page.goto(URL('&seed=4242'));
    await page.waitForFunction(() => window.__dd && window.__dd.ready, null, { timeout: 60000 });
    const r0 = await page.evaluate(() => {
      const api = window.__dd.run; const d0 = api.depth0();
      const shown = (id) => { const e = document.getElementById(id); return !!e && e.offsetHeight > 0; };
      const hud = document.getElementById('hud');
      const a = { start: api.bankEl(), seed: api.state.seed, surfaceH: hud.offsetHeight, surfGoal: shown('hud-goal'), surfBank: shown('hud-bank') };
      api.tick(d0 + 3); api.mined('stone', 100); a.shallow = api.bankEl(); a.shallowPts = window.__dd.run.MMDDRun.score(api.state, false);
      a.diveH = hud.offsetHeight; a.diveGoal = shown('hud-goal'); a.diveBank = shown('hud-bank');
      a.fonts = ['hud-dive', 'hud-bank', 'hud-pick'].map((id) => parseFloat(getComputedStyle(document.getElementById(id)).fontSize));
      return a;
    });
    // the page's own loop keeps ticking at the surface: an unarmed dive stays as it is, so the HUD can be photographed here
    await page.waitForTimeout(300);
    if (shots && scale === 1) await page.screenshot({ path: `${shots}/cyc0-deepdelve-bank-${name}.jpg`, type: 'jpeg', quality: 70 });
    const r = await page.evaluate((a) => {
      const api = window.__dd.run; const d0 = api.depth0();
      a.still = api.bankEl();
      api.tick(d0 + 8); a.armed = api.bankEl(); a.armedPts = [window.__dd.run.MMDDRun.score(api.state, true), window.__dd.run.MMDDRun.score(api.state, false)]; a.armedFlag = document.getElementById('hud-bank').dataset.armed;
      api.tick(d0 + 11); a.past = api.bankEl();
      a.pops = Array.from(document.querySelectorAll('#pops .pop')).map((p) => p.textContent);
      a.expected = window.__dd.run.MMDDRun.score(api.state, true);
      const box = document.getElementById('hud-bank').getBoundingClientRect(); a.box = { l: box.left, r: box.right, t: box.top, b: box.bottom, w: innerWidth };
      return a;
    }, r0);
    console.log('  ' + name + ': ' + JSON.stringify({ start: r.start, shallow: r.shallow, armed: r.armed, past: r.past }));
    check(name + ': the dive carries the page seed (4242)', r.seed === '4242', String(r.seed));
    check(name + ': before arming the HUD says how many blocks until the bonus, and shows the seed ghost', r.start === 'Dig 6 more: x1.5 (0 pts) | Ghost 9 (9 to go)', r.start);
    check(name + ': 3 deep + one block: 3 more to arm, the fall score so far, 6 to the ghost', r.shallowPts > 30 && r.shallow === 'Dig 3 more: x1.5 (' + r.shallowPts + ' pts) | Ghost 9 (6 to go)', r.shallow + ' / ' + r.shallowPts);
    check(name + ': armed (8 deep): the climb-out value (x1.5) and the fall value are shown and the line is highlighted', r.armedPts[0] === Math.floor(r.armedPts[1] * 1.5) && r.armed === 'Climb out: ' + r.armedPts[0] + ' pts (fall ' + r.armedPts[1] + ') | Ghost 9 (1 to go)' && r.armedFlag === '1', r.armed + ' ' + r.armedFlag + ' ' + r.armedPts);
    check(name + ': 11 deep is past the ghost, with a "Past your seed ghost!" pop', /\| Ghost \+2$/.test(r.past) && r.past.indexOf('Climb out: ' + r.expected + ' pts') === 0 && r.pops.some((t) => /seed ghost/.test(t)), r.past + ' ' + JSON.stringify(r.pops));
    check(name + ': HUD text (dive, bank, pick) is >= 12 px and scales with Text size', r.fonts.every((f) => f >= 12) && (scale === 1 || r.fonts[1] >= 13 * scale - 0.5), JSON.stringify(r.fonts));
    if (isPhone) {
      check(name + ': phone at the surface shows the goal line and folds the bank line away', r.surfGoal === true && r.surfBank === false, JSON.stringify(r));
      check(name + ': phone mid-dive folds the goal line away and shows the bank line', r.diveGoal === false && r.diveBank === true, JSON.stringify(r));
      check(name + ': phone HUD is no taller mid-dive than at the surface (the bank line takes the goal line\'s place)', r.diveH <= r.surfaceH + 1, r.surfaceH + ' -> ' + r.diveH);
    } else check(name + ': desktop keeps both the goal and the bank line mid-dive', r.diveGoal === true && r.diveBank === true);
    check(name + ': the bank line fits on screen', r.box.l >= 0 && r.box.r <= r.box.w + 1 && r.box.b > r.box.t, JSON.stringify(r.box));
    check(name + ': the unarmed line survives the live game loop unchanged', r.still === r.shallow, r.still);
    const fin = await page.evaluate((k) => { window.__dd.run.end(true, 'test'); return { tip: document.getElementById('run-tip').textContent, saved: JSON.parse(localStorage.getItem(k)).seedBest }; }, RUNS);
    check(name + ': climbing out saves the new seed ghost (11) and the summary says it was passed', fin.saved['4242'] === 11 && /passed your seed ghost: 11 deep \(it was 9\)/.test(fin.tip), JSON.stringify(fin));
    const off = await ctx.newPage();
    await off.goto(URL('&seed=4242&ghost=0'));
    await off.waitForFunction(() => window.__dd && window.__dd.ready, null, { timeout: 60000 });
    const offTxt = await off.evaluate(() => window.__dd.run.bankEl());
    check(name + ': ?ghost=0 keeps the bank line and drops the ghost part', /^Dig 6 more: x1\.5/.test(offTxt) && !/ghost/i.test(offTxt), offTxt);
    check(name + ': no page errors', errors.length === 0, errors.join(' | '));
    check(name + ': no DB traffic', db.attempts() === 0, String(db.attempts()));
    await ctx.close();
  }
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
