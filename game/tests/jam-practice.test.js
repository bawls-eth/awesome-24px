// Campfire Jam: Practice mode (50/75% speed, A-B bar loop, no scoring) plus colour-blind shapes and left-handed lane order.
// Playwright, phone 390x844. Run: NODE_PATH=$(npm root -g) BASE=http://localhost:8440/game/index.html node game/tests/jam-practice.test.js
const { chromium } = require('playwright');
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const URL = ORIGIN + '/game/games/jam/index.html?test=1';
const KEY = 'pixeltown-jam-v1';
const SEED = JSON.stringify({ v: 1, hint: true, offsetMs: 0, plays: 0 });
const KCHART = { version: 1, difficulty: 'easy', bpm: 100, count: 2, lengthMs: 5000, notes: [{ t: 1000, lane: 'K' }, { t: 2000, lane: 'D' }] };

async function open(browser, init, vp) {
  const ctx = await browser.newContext({ viewport: vp || { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  if (init !== undefined) await page.addInitScript(([k, v]) => { if (!sessionStorage.seeded) { sessionStorage.seeded = '1'; localStorage.setItem(k, v); } }, [KEY, init]);
  await page.goto(URL); await page.waitForFunction(() => window.__jam);
  return { ctx, page, errors };
}

(async () => {
  const browser = await chromium.launch();
  let d = await open(browser, SEED), p = d.page;

  // ---- setup screen via the UI ----
  check('every open song card has a Practice button; locked ones are disabled', await p.evaluate(() => document.querySelectorAll('.card[data-song] .practice-btn').length === 12 && !document.querySelector('.practice-btn[data-practice=warm-embers]').disabled && document.querySelector('.practice-btn[data-practice=lantern-shuffle]').disabled));
  await p.click('.practice-btn[data-practice=warm-embers]');
  check('setup: 3 speeds, loop toggle, steppers; all targets >= 44 px', await p.evaluate(() => document.querySelectorAll('#practice-speeds button').length === 3 && !!document.getElementById('practice-loop') && [...document.querySelectorAll('#overlay button')].every((b) => b.getBoundingClientRect().height >= 44 && b.getBoundingClientRect().width >= 44)));
  check('setup: hard is locked in practice too', await p.evaluate(() => document.querySelector('#practice-tiers [data-tier=hard]').disabled));
  await p.click('#practice-speeds [data-speed="0.5"]');
  await p.click('#practice-loop');
  await p.click('#loop-a-plus');
  check('summary shows speed and loop bars (A 2, B 4)', await p.evaluate(() => /Speed 50%/.test(document.getElementById('practice-summary').textContent) && /bars 2 to 4/.test(document.getElementById('practice-summary').textContent)));
  await p.click('#loop-a-plus'); await p.click('#loop-a-plus'); await p.click('#loop-a-plus');
  check('A cannot pass B (B follows)', await p.evaluate(() => /bars 5 to 5/.test(document.getElementById('practice-summary').textContent)));
  await p.click('#loop-a-minus'); await p.click('#loop-a-minus'); await p.click('#loop-a-minus');
  await p.click('#practice-start');
  check('practice starts at 50% with the loop, speed shown in the HUD', await p.evaluate(() => { const pr = window.__jam.practice; return window.__jam.mode === 'play' && pr.speed === 0.5 && pr.loop.aBar === 2 && pr.loop.bBar === 5 && document.getElementById('hud-speed').textContent === 'Speed 50%' && /Practice/.test(document.getElementById('hud-song').textContent); }));
  check('score and accuracy are hidden in practice', await p.evaluate(() => getComputedStyle(document.getElementById('hud-score')).display === 'none' && getComputedStyle(document.getElementById('hud-acc')).display === 'none'));

  // ---- speed: 1000 real ms = 500 song ms at 50% ----
  const t1 = await p.evaluate(() => { const a = window.__jam.now; window.__jam.step(1000); return [a, window.__jam.now]; });
  check('50% speed advances the song at half rate', Math.abs((t1[1] - t1[0]) - 500) < 1, JSON.stringify(t1));
  const lp = await p.evaluate(() => window.__jam.practice.loop);
  check('song clock starts 2 beats before bar A', await p.evaluate(([a]) => true, [lp.a]) && t1[0] === Math.max(0, lp.a - Math.round(2 * 60000 / 92)), JSON.stringify([t1, lp]));

  // ---- loop wraps back ----
  const wr = await p.evaluate(() => { const J = window.__jam; let n = 0; while (J.practice.loops < 1 && n < 400) { J.step(200); n++; } const first = J.now; return { loops: J.practice.loops, now: J.now, mode: J.mode, first }; });
  check('reaching bar B jumps back to the loop start', wr.loops === 1 && wr.mode === 'play' && wr.now < lp.b - 1000, JSON.stringify(wr));
  await p.evaluate(() => window.__jam.start('warm-embers', 'easy', { practice: { speed: 0.75, loop: [2, 5] } }));
  const inLoop = await p.evaluate((l) => { const J = window.__jam; return J.chart.notes.filter((n) => n.t >= l.a - 1 && n.t < l.b).length; }, lp);
  const outs = await p.evaluate(() => { const J = window.__jam; const l = J.practice.loop; const ev = []; J.chart.notes.filter((n) => n.t >= l.a - 1 && n.t < l.b).forEach((n) => { ev.push({ t: n.t, k: 0, n }); if (n.hold) ev.push({ t: n.t + n.hold, k: 1, n }); }); ev.sort((a, b) => a.t - b.t || a.k - b.k); for (const e of ev) { J.at(e.t); if (e.k === 0) J.press(e.n.lane); else J.release(e.n.lane); } return J.run; });
  check('judging covers only the looped notes; perfect play there combos them all', outs.counts.miss === 0 && outs.maxCombo >= inLoop - 1 && outs.maxCombo > 0, JSON.stringify([outs, inLoop]));
  check('the loop keeps going (a second wrap), never ends the song', await p.evaluate(() => { const J = window.__jam; for (let i = 0; i < 400 && J.practice.loops < 2; i++) J.step(200); return J.practice.loops >= 2 && J.mode === 'play'; }));

  // ---- pause shows practice; quit saves nothing ----
  await p.evaluate(() => window.__jam.pause());
  check('pause card mentions practice and no scoring', await p.evaluate(() => /Practice at 75%/.test(document.getElementById('overlay').textContent)));
  await p.click('#quit');
  const after = await p.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
  check('practice wrote no scores, plays, history or ghost', after.plays === 0 && Object.keys(after.best).length === 0 && !after.hist && !after.ghost && (await p.evaluate(() => window.__jam.summary === null && window.__jam.practice === null)));

  // ---- whole-song practice at 75% finishes without scoring ----
  await p.evaluate(() => window.__jam.start('warm-embers', 'easy', { practice: { speed: 0.75 } }));
  const fin = await p.evaluate(() => { const J = window.__jam; const ev = []; J.chart.notes.forEach((n) => { ev.push({ t: n.t, k: 0, n }); if (n.hold) ev.push({ t: n.t + n.hold, k: 1, n }); }); ev.sort((a, b) => a.t - b.t || a.k - b.k); for (const e of ev) { J.at(e.t); if (e.k === 0) J.press(e.n.lane); else J.release(e.n.lane); } J.step(200000); return { mode: J.mode, r: J.practiceResult, hasSummary: J.summary !== null }; });
  check('practice ends on a no-score card and records nothing', fin.mode === 'results' && !fin.hasSummary && fin.r.speed === 0.75 && fin.r.counts.miss === 0 && /nothing saved/i.test(await p.evaluate(() => document.getElementById('practice-note').textContent)));
  const after2 = await p.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
  check('save still unchanged after a finished practice', after2.plays === 0 && Object.keys(after2.best).length === 0);
  check('practice is deterministic: same chart as a normal run', await p.evaluate(() => { const c = window.__jam.chart; window.__jam.menu(); window.__jam.start('warm-embers', 'easy'); return JSON.stringify(c.notes) === JSON.stringify(window.__jam.chart.notes); }));
  check('no console errors (practice)', d.errors.length === 0, d.errors.join('|'));
  await d.ctx.close();

  // ---- colour-blind lanes toggle ----
  d = await open(browser, SEED); p = d.page;
  check('prefs row has two toggles (>= 44 px) and defaults off', await p.evaluate(() => { const a = document.getElementById('pref-shapes'), b = document.getElementById('pref-lefty'); return a.getAttribute('aria-pressed') === 'false' && b.getAttribute('aria-pressed') === 'false' && a.getBoundingClientRect().height >= 44 && b.getBoundingClientRect().height >= 44; }));
  const baseCols = await p.evaluate(() => window.__jam.laneColors);
  await p.click('#pref-shapes');
  const cbCols = await p.evaluate(() => window.__jam.laneColors);
  check('colour-blind toggle swaps in a safe palette and shape glyphs on the pads', cbCols.join() !== baseCols.join() && new Set(cbCols).size === 4 && await p.evaluate(() => document.getElementById('pad-D').textContent.includes('●') && document.getElementById('pad-K').textContent.includes('▲') && document.getElementById('pref-shapes').getAttribute('aria-pressed') === 'true'));
  check('the toggle is stored in the jam key (additive prefs)', await p.evaluate((k) => JSON.parse(localStorage.getItem(k)).prefs.shapes === true, KEY));

  // ---- left-handed order ----
  check('columns are in normal order by default', await p.evaluate(() => window.__jam.columns.join() === '0,1,2,3'));
  await p.click('#pref-lefty');
  check('left-handed mirrors the columns', await p.evaluate(() => window.__jam.columns.join() === '3,2,1,0' && window.__jam.prefs.lefty === true));
  await p.evaluate((c) => window.__jam.start('warm-embers', 'easy', { chart: c }), KCHART);
  await p.evaluate(() => window.__jam.at(1000));
  await p.keyboard.down('KeyD'); await p.keyboard.up('KeyD');
  check('left-handed: the key in the first column (D) hits the K lane', await p.evaluate(() => window.__jam.lastJudge === 'perfect' && window.__jam.run.counts.perfect === 1));
  await p.evaluate(() => window.__jam.at(2000));
  const pad = await p.locator('#pad-K').boundingBox();
  await p.touchscreen.tap(pad.x + pad.width / 2, pad.y + pad.height / 2);
  check('left-handed: touch pad K (rightmost) hits the D lane', await p.evaluate(() => window.__jam.run.counts.perfect === 2 && window.__jam.run.counts.miss === 0));
  await p.evaluate(() => window.__jam.menu());
  check('no console errors (prefs)', d.errors.length === 0, d.errors.join('|'));

  // persisted across a reload
  await p.reload(); await p.waitForFunction(() => window.__jam);
  check('both prefs persist after reload and are re-applied', await p.evaluate(() => window.__jam.prefs.shapes && window.__jam.prefs.lefty && window.__jam.columns.join() === '3,2,1,0' && document.getElementById('pref-lefty').getAttribute('aria-pressed') === 'true' && document.getElementById('pad-D').textContent.includes('◆') === false));
  await p.click('#pref-lefty'); await p.click('#pref-shapes');
  check('turning both off removes the prefs key again', await p.evaluate((k) => !('prefs' in JSON.parse(localStorage.getItem(k))) && window.__jam.columns.join() === '0,1,2,3', KEY));
  check('phone width has no horizontal scroll', await p.evaluate(() => document.documentElement.scrollWidth <= 390));
  await d.ctx.close();

  // ---- corrupt save recovery ----
  for (const bad of ['{nope', JSON.stringify({ v: 1, prefs: { shapes: 'yes', lefty: 1, evil: true }, hist: 4, ghost: { 'warm-embers': 'x' } }), JSON.stringify({ v: 1, prefs: [true] })]) {
    d = await open(browser, bad); p = d.page;
    check('corrupt save gives clean prefs and a working practice screen: ' + bad.slice(0, 20), await p.evaluate(() => { const s = window.__jam.save; return !s.prefs && !s.hist && !s.ghost && window.__jam.columns.join() === '0,1,2,3'; }));
    await p.click('.practice-btn[data-practice=warm-embers]');
    check('practice setup still opens', await p.evaluate(() => !!document.getElementById('practice-start')));
    check('no console errors (corrupt save)', d.errors.length === 0, d.errors.join('|'));
    await d.ctx.close();
  }
  await browser.close();
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
  process.exitCode = failed ? 1 : 0;
})();
