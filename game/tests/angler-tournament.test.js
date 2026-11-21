// Lakeside Angler daily tournament. Serve the repo root: python3 -m http.server 8514 &
// Run: BASE=http://localhost:8514/game/index.html NODE_PATH=$(npm root -g) node game/tests/angler-tournament.test.js
// Standalone page, no Firebase, no external network.
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const URL = (q) => ORIGIN + '/game/games/angler/index.html?test=1' + (q || '');
const KEY = 'pixeltown-angler-v1';

async function open(browser, q, opts, init) {
  const ctx = await browser.newContext(opts || { viewport: { width: 1000, height: 700 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  if (init) await page.addInitScript(init);
  await page.goto(URL(q));
  await page.waitForFunction(() => window.__angler);
  return { ctx, page, errors };
}
// one tournament cast: tap, wait for the bite, hook, reel with a simple bot, return "outcome:fish"
const castOnce = (page) => page.evaluate(() => {
  const a = window.__angler;
  a.tap(); a.advance(a.bite.wait + 0.2); a.tap();
  for (let i = 0; i < 4000 && a.state === 'reeling'; i++) { a.setHold(a.reel.tension < a.reel.pos); a.advance(1 / 30); }
  a.setHold(false);
  const out = a.result ? a.result.outcome + ':' + a.result.fish : a.state;
  a.dismiss();
  return out;
});
async function runTournament(page) {
  const seq = [];
  for (let i = 0; i < 5; i++) seq.push(await castOnce(page));
  return seq;
}

(async () => {
  const browser = await chromium.launch();

  // day override is clamped to an integer
  const days = {};
  for (const [q, want] of [['20000', 20000], ['3.7', 3], ['-5', 0], ['1e12', 99999], ['abc', null]]) {
    const c = await open(browser, '&day=' + q); days[q] = await c.page.evaluate(() => __angler.day); await c.ctx.close();
    if (want !== null) check('?day=' + q + ' clamps to ' + want, days[q] === want, String(days[q]));
  }
  check('?day=abc falls back to the real calendar day', days.abc > 20000 && days.abc < 99999);

  let p = await open(browser, '&day=20000&seed=t');
  const info = await p.page.evaluate(() => __angler.tourney.info());
  check('tournament day has spot, target species and 5 casts', info.casts === 5 && !!info.target && !!info.spot && info.day === 20000);
  await p.page.click('#tourney-btn');
  check('tournament screen shows target, spot, rank thresholds', await p.page.evaluate((t) => {
    const x = document.getElementById('tourney-body').textContent;
    return x.includes('Target') && x.includes('bronze 120') && x.includes('gold 550') && x.includes(window.MMAngler.BY_ID[t.target].name);
  }, info));
  check('no countdown or urgency text', !/hurry|expires|ends in|countdown|last chance|\d+:\d\d:\d\d/i.test(await p.page.textContent('#tourney-body')));
  await p.page.click('#tour-start');
  check('start moves to the tournament spot and locks the others', await p.page.evaluate((t) => {
    const a = __angler, other = ['west', 'east', 'river', 'pier'].find((s) => s !== t.spot);
    return a.spot === t.spot && a.tourney.active && a.pickSpot(other) === false && a.spot === t.spot;
  }, info));
  check('tournament bite timing comes from the day seed', await p.page.evaluate(() => {
    const a = __angler; a.tap();
    const exp = window.MMAnglerDepth.tournament.castFor(a.day, 0).wait;
    return Math.abs(a.bite.wait - exp) < 1e-9 && a.tourney.run.used === 1;
  }));
  await p.page.evaluate(() => { const a = __angler; a.advance(a.bite.wait + 0.2); a.tap(); a.setHold(false); });
  const fishFirst = await p.page.evaluate(() => __angler.fish);
  check('hooked fish is the seeded one for this day', fishFirst === (await p.page.evaluate(() => window.MMAnglerDepth.tournament.castFor(__angler.day, 0).fish)));
  // finish the first cast (let it end by snapping or catching), then the other four
  await p.page.evaluate(() => { const a = window.__angler; for (let i = 0; i < 4000 && a.state === 'reeling'; i++) { a.setHold(a.reel.tension < a.reel.pos); a.advance(1 / 30); } a.setHold(false); a.firstOut = a.result.outcome + ':' + a.result.fish; a.dismiss(); });
  const seq = [await p.page.evaluate(() => __angler.firstOut), await castOnce(p.page), await castOnce(p.page), await castOnce(p.page), await castOnce(p.page)];
  const result = await p.page.evaluate(() => __angler.tourney.result);
  check('5 casts end the tournament with a rank result', !!result && result.score >= 0 && ['none', 'bronze', 'silver', 'gold'].includes(result.rank) && result.streak === 1 && !(await p.page.evaluate(() => __angler.tourney.active)));
  check('results screen opens automatically with the rank', await p.page.isVisible('#tour-result') && /Final: \d+ points/.test(await p.page.textContent('#tour-result')));
  const rank = await p.page.evaluate(() => window.MMAnglerDepth.tournament.rankOf(__angler.tourney.result.score));
  check('rank matches the score thresholds', rank === result.rank);
  const saved = JSON.parse(await p.page.evaluate((k) => localStorage.getItem(k), KEY));
  check('save is additive: tour block stored, v1 keys intact', saved.tour.last === 20000 && saved.tour.streak === 1 && saved.tour.played === 1 && !!saved.caught && !!saved.gear);
  await p.page.reload(); await p.page.waitForFunction(() => window.__angler);
  await p.page.click('#tourney-btn');
  check('after reload the day stays done: no second start, no nag', (await p.page.$('#tour-start')) === null && /complete/i.test(await p.page.textContent('#tourney-body')));
  await p.page.click('#tourney-close');
  // a new day continues the streak (same storage)
  await p.page.evaluate(() => __angler.setDay(20001));
  await p.page.click('#tourney-btn');
  check('new day offers a fresh tournament and shows the 1-day streak', (await p.page.$('#tour-start')) !== null && /Streak: 1/.test(await p.page.textContent('#tourney-body')));
  await p.page.click('#tour-start');
  const seq2 = await runTournament(p.page);
  check('next consecutive day makes the streak 2', await p.page.evaluate(() => __angler.tourney.result.streak === 2 && __angler.tourney.state.played === 2) && seq2.length === 5);
  check('no console errors', p.errors.length === 0, p.errors.join(' | '));
  await p.ctx.close();

  // determinism: a second fresh browser plays the same day and gets the same sequence
  const q1 = await open(browser, '&day=20000&seed=other');
  await q1.page.evaluate(() => __angler.tourney.start());
  const seqB = await runTournament(q1.page);
  const resB = await q1.page.evaluate(() => __angler.tourney.result);
  check('same day -> same fish sequence for another player', JSON.stringify(seqB) === JSON.stringify(seq), seq + ' vs ' + seqB);
  check('same day -> same score', resB.score === result.score, resB.score + ' vs ' + result.score);
  await q1.ctx.close();

  // reload mid-run keeps the used casts (no free retries)
  const m = await open(browser, '&day=77&seed=m');
  await m.page.evaluate(() => { __angler.tourney.start(); });
  await castOnce(m.page); await castOnce(m.page);
  await m.page.reload(); await m.page.waitForFunction(() => window.__angler);
  check('run progress persists across reload', await m.page.evaluate(() => __angler.tourney.run && __angler.tourney.run.used === 2));
  check('resume offered with the used count', await (async () => { await m.page.click('#tourney-btn'); return /Resume \(2\/5\)/.test(await m.page.textContent('#tour-start')); })());
  await m.ctx.close();

  // corrupt tournament data recovers to defaults
  for (const bad of ['{"tour":"x"}', '{"tour":{"streak":-9,"last":"zz","run":{"day":"q","used":99},"medals":5,"best":3}}', '{"tour":{"streak":1e99,"run":{"day":5,"used":99,"score":-3}}}', 'nope{']) {
    const c = await open(browser, '&day=5', undefined, `localStorage.setItem(${JSON.stringify(KEY)}, ${JSON.stringify(bad)})`);
    const ok = await c.page.evaluate(() => { const t = __angler.full.tour; return t.streak >= 0 && t.streak <= 9999 && t.played === 0 && (t.run === null || (t.run.used <= 5 && t.run.score >= 0)) && !!document.getElementById('scene'); });
    await c.page.click('#tourney-btn');
    check('corrupt tour save recovers: ' + bad.slice(0, 16), ok && c.errors.length === 0, c.errors.join(' '));
    await c.ctx.close();
  }

  // phone layout
  const ph = await open(browser, '&day=20000&seed=p', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await ph.page.click('#tourney-btn');
  check('phone: no horizontal scroll with the tournament screen', await ph.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  check('phone: tournament buttons are at least 44px', await ph.page.$$eval('#tourney-btn, #tourney-close, #tour-start', (b) => b.length === 3 && b.every((x) => x.getBoundingClientRect().height >= 44 && x.getBoundingClientRect().width >= 44)));
  check('phone: no console errors', ph.errors.length === 0, ph.errors.join(' | '));
  await ph.ctx.close();

  // reduced motion: no transitions or animation in the overlay
  const rm = await open(browser, '&day=20000', { viewport: { width: 1000, height: 700 }, reducedMotion: 'reduce' });
  await rm.page.click('#tourney-btn');
  check('reduced motion: page reports it and overlay is static', await rm.page.evaluate(() => __angler.reduced && getComputedStyle(document.getElementById('tourney')).animationName === 'none'));
  await rm.ctx.close();

  await browser.close();
  done();
})();
