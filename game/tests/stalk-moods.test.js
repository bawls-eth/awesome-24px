// Stalk Market practice week market moods (VAR1): a seeded mood per practice week with its full pattern odds shown,
// honest effect on the pattern distribution, mood bests in pixeltown-stalk-practice-v1 (additive), real save untouched,
// ?mods=0 off switch. Phone 390x844 + desktop, DB blocked, standalone. Serve the repo root first:  python3 -m http.server 9372 &
// Run: NODE_PATH=$(npm root -g) BASE=http://localhost:9372/game/index.html node game/tests/stalk-moods.test.js
const { chromium } = require('playwright');
const { blockDb } = require('./helpers');
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }
const ORIGIN = (process.env.BASE || 'http://localhost:9372/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/stalk/index.html?test=1&week=100&slot=0';
const SHOTS = process.env.SHOTS || '';
const errors = [], dbs = [];
async function open(browser, opts, q) {
  const ctx = await browser.newContext(opts);
  dbs.push(await blockDb(ctx));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(PAGE + (q || '&mods=1'));
  await page.waitForFunction(() => window.__stalk);
  return { ctx, page };
}

(async () => {
  const browser = await chromium.launch();
  const ph = await open(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const p = ph.page;

  // pure-ish checks through the test hook: seeded, honest distribution
  const dist = await p.evaluate(() => {
    const X = window.__stalk.moods, out = {}, seen = {};
    for (let n = 1; n <= 400; n++) seen[X.moodFor(n)] = 1;
    X.list.forEach((m) => { const c = { decreasing: 0, random: 0, largeSpike: 0, smallSpike: 0 }; for (let n = 1; n <= 400; n++) c[X.practiceWeek(n, m).pattern]++; out[m] = c; });
    const same = JSON.stringify(X.practiceWeek(7, 'festival')) === JSON.stringify(X.practiceWeek(7, 'festival'));
    const sums = X.list.map((m) => Object.values(X.info[m].w).reduce((a, b) => a + b, 0));
    const pr = X.probs({ decreasing: 0.25, random: 0.30, largeSpike: 0.25, smallSpike: 0.20 }, 'quiet');
    return { on: X.on, seen, out, same, sums, pr, w: X.info.quiet.w };
  });
  check('moods are seeded: the same round and mood give the same week', dist.same);
  check('every mood comes up across rounds', ['usual', 'festival', 'quiet', 'jumpy'].every((m) => dist.seen[m]), JSON.stringify(dist.seen));
  check('mood odds each add up to 100%', dist.sums.every((s) => Math.abs(s - 1) < 1e-9), JSON.stringify(dist.sums));
  const spikes = (m) => (dist.out[m].largeSpike + dist.out[m].smallSpike) / 400;
  check('Festival Week really has more spikes than Quiet Week (simulated 400 weeks)', spikes('festival') > 0.55 && spikes('quiet') < 0.3, JSON.stringify(dist.out));
  check('Quiet Week really declines more often (about its shown 45%)', Math.abs(dist.out.quiet.decreasing / 400 - 0.45) < 0.08, JSON.stringify(dist.out.quiet));
  check('Jumpy Week really wanders more often (about its shown 55%)', Math.abs(dist.out.jumpy.random / 400 - 0.55) < 0.08, JSON.stringify(dist.out.jumpy));
  check('before any prices, the advisor odds equal the mood odds (honest Bayes re-weight)', Object.keys(dist.w).every((k) => Math.abs(dist.pr[k] - dist.w[k]) < 1e-9), JSON.stringify(dist.pr));

  const realBefore = await p.evaluate(() => localStorage.getItem('pixeltown-stalk-v1'));
  await p.tap('#pr-start');
  const ui = await p.evaluate(() => {
    const m = document.getElementById('pr-mood'), s = window.__stalk.practice.state, r = document.getElementById('pr-buy').getBoundingClientRect();
    return { hidden: m.hidden, text: m.textContent, mood: s.mood, dm: m.dataset.mood, px: parseFloat(getComputedStyle(m).fontSize), buyH: r.height, buyW: r.width, wkSeed: s.wk.seed, n: s.n, right: m.getBoundingClientRect().right };
  });
  check('practice week shows its market mood by name', !ui.hidden && ui.dm === ui.mood && ui.text.indexOf('Market mood: ') === 0, JSON.stringify(ui));
  check('the mood line shows the full pattern odds and says practice only', /Pattern odds this week: Steady decline \d+%, Wandering prices \d+%, Big spike \d+%, Small spike \d+%\. Practice only\.$/.test(ui.text), ui.text);
  check('mood text is readable (12 px+) and fits the phone width', ui.px >= 12 && ui.right <= 390, JSON.stringify(ui));
  check('practice buttons stay 44 px+', ui.buyH >= 44 && ui.buyW >= 44, JSON.stringify(ui));
  check('the mood week comes from its own seed', ui.wkSeed.indexOf('practice|' + ui.n + '|') === 0, ui.wkSeed);
  if (SHOTS) { await p.locator('#practice').scrollIntoViewIfNeeded(); await p.screenshot({ path: SHOTS + '/stalk-mood-phone.png' }); }
  await p.tap('#pr-buy');
  for (let i = 0; i < 2; i++) await p.tap('#pr-next');
  const odds = await p.evaluate(() => document.getElementById('pr-odds').textContent);
  check('advisor odds mention the mood', /and the .+ Week mood: /.test(odds), odds);
  for (let i = 0; i < 12; i++) { const done = await p.evaluate(() => window.__stalk.practice.state.done); if (done) break; await p.tap('#pr-next'); }
  const end = await p.evaluate(() => ({ list: [...document.querySelectorAll('#pr-end-list li')].map((l) => l.textContent), saved: JSON.parse(localStorage.getItem('pixeltown-stalk-practice-v1')), mood: window.__stalk.practice.state.mood }));
  check('week end names the mood, its odds and the mood best', end.list.some((t) => t.indexOf('Market mood was ') === 0 && / best: ([+-]?\d|none yet \(a loss is not a best\))/.test(t)), JSON.stringify(end.list));
  // G-18 (b11-05) changed this: a loss is never stored as a best (practice best or mood best). The scripted week here spoils its turnips (a loss),
  // so the save keeps no best for it; a profit (>= 0) is stored as both.
  const lost = end.saved.rounds === 1 && end.saved.hasBest === false;
  check('practice key stays v1 with an additive moodBest field (a loss is not stored as a best)', end.saved.v === 1 && end.saved.rounds === 1 && end.saved.moodBest && typeof end.saved.moodBest === 'object' &&
    (lost ? !Object.prototype.hasOwnProperty.call(end.saved.moodBest, end.mood) : (typeof end.saved.moodBest[end.mood] === 'number' && end.saved.moodBest[end.mood] >= 0)), JSON.stringify(end.saved));
  if (SHOTS) await p.screenshot({ path: SHOTS + '/stalk-end-phone.png' });
  const realAfter = await p.evaluate(() => localStorage.getItem('pixeltown-stalk-v1'));
  check('the real save is never touched by a mood practice week', realAfter === realBefore, realBefore + ' / ' + realAfter);
  await p.evaluate(() => localStorage.setItem('pixeltown-stalk-practice-v1', '{"v":1,"n":3,"best":5,"rounds":2,"hasBest":true,"moodBest":{"festival":"12","nope":4,"quiet":"x"}}'));
  await p.reload(); await p.waitForFunction(() => window.__stalk);
  const cl = await p.evaluate(() => window.__stalk.practice.saved);
  check('a bad moodBest is cleaned (known moods, numbers only)', JSON.stringify(cl.moodBest) === '{"festival":12}' && cl.n === 3 && cl.best === 5, JSON.stringify(cl));
  await ph.ctx.close();

  // off switch: plain practice week as before
  const off = await open(browser, { viewport: { width: 390, height: 844 } }, '&mods=0');
  await off.page.click('#pr-start');
  const o = await off.page.evaluate(() => ({ on: window.__stalk.moods.on, hidden: document.getElementById('pr-mood').hidden, mood: window.__stalk.practice.state.mood, seed: window.__stalk.practice.state.wk.seed }));
  check('?mods=0: no mood, the plain seeded practice week', o.on === false && o.hidden && o.mood === null && o.seed === 'practice|1', JSON.stringify(o));
  await off.ctx.close();

  // desktop
  const dk = await open(browser, { viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  await dk.page.click('#pr-start');
  const dd = await dk.page.evaluate(() => { const m = document.getElementById('pr-mood'); return { vis: getComputedStyle(m).display !== 'none', w: m.getBoundingClientRect().width }; });
  check('desktop: mood line visible', dd.vis && dd.w > 100, JSON.stringify(dd));
  if (SHOTS) { await dk.page.locator('#practice').scrollIntoViewIfNeeded(); await dk.page.screenshot({ path: SHOTS + '/stalk-mood-desk.png' }); }
  await dk.ctx.close();

  check('console clean', errors.length === 0, JSON.stringify(errors));
  check('zero DB requests', dbs.every((x) => x.attempts() === 0), JSON.stringify(dbs.map((x) => x.attempts())));
  await browser.close();
  console.log(failed ? failed + ' FAILED' : 'ALL PASSED');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
