// Bug Safari page. Serve the repo root first:  python3 -m http.server 8451 &
// Run: NODE_PATH=$(npm root -g) BASE=http://localhost:8451/game/index.html node game/tests/bugs-page.test.js
// Set SHOTS=<dir> to also write desktop/phone screenshots. No network beyond the local server.
const { chromium } = require('playwright');
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const URL = process.env.BUGS_URL || ORIGIN + '/game/games/festival/bugs.html?test=1';
const KEY = 'pixeltown-bugs-v1';

async function open(browser, opts, init) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const errors = [], reqs = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('request', (r) => reqs.push(r.url()));
  if (init !== undefined) await page.addInitScript(([k, v]) => { if (!sessionStorage.seeded) { sessionStorage.seeded = '1'; localStorage.setItem(k, v); } }, [KEY, init]);
  await page.goto(URL);
  await page.waitForFunction(() => window.__bugs);
  return { ctx, page, errors, reqs };
}

(async () => {
  const browser = await chromium.launch();
  const shot = process.env.SHOTS;
  const d = await open(browser, { viewport: { width: 1000, height: 700 } });
  const p = d.page;

  // 90 s of game time
  await p.evaluate(() => { window.__bugs.start('meadow', { seed: 'a', empty: true }); window.__bugs.step(89.9); });
  check('run not done at 89.9 s', await p.evaluate(() => !window.__bugs.run.done && window.__bugs.mode === 'play'));
  await p.evaluate(() => window.__bugs.step(0.2));
  check('run ends at 90 s', await p.evaluate(() => window.__bugs.run.done && window.__bugs.run.time === 90 && window.__bugs.mode === 'summary'));

  // swing scores
  await p.evaluate(() => { window.__bugs.start('meadow', { seed: 'b', empty: true }); window.__bugs.spawn('ladybug', 10, 7); window.__bugs.setPlayer(10, 7.5, true); });
  const r1 = await p.evaluate(() => window.__bugs.swing().caught.length);
  check('swing in range catches and scores 10', r1 === 1 && await p.evaluate(() => window.__bugs.run.score === 10));
  // cooldown
  await p.evaluate(() => window.__bugs.spawn('ladybug', 10, 7));
  check('cooldown blocks swing inside 0.35 s', await p.evaluate(() => { window.__bugs.step(0.2); return window.__bugs.swing().swung === false; }));
  check('swing allowed after cooldown', await p.evaluate(() => { window.__bugs.step(0.2); return window.__bugs.swing().swung === true; }));
  // combo x1.2: 10 + 10*1.2 = 22 (second catch 0.4 s after the first)
  check('combo within 2 s multiplies x1.2', await p.evaluate(() => Math.abs(window.__bugs.run.score - 22) < 0.01), await p.evaluate(() => window.__bugs.run.score));

  // sneak vs run
  await p.evaluate(() => { window.__bugs.start('meadow', { seed: 'c', empty: true }); window.__bugs.spawn('cricket', 8, 7); window.__bugs.setPlayer(10, 7, true); window.__bugs.step(0.5); });
  check('sneaking within 3 tiles does not scare', await p.evaluate(() => window.__bugs.run.bugs[0].state !== 'flee'));
  await p.evaluate(() => { window.__bugs.setPlayer(10, 7, false); window.__bugs.step(0.3); });
  check('running within 3 tiles scares', await p.evaluate(() => window.__bugs.run.bugs[0].state === 'flee'));

  // rare at 30 s, Moonwing night only
  await p.evaluate(() => { window.__bugs.start('meadow', { seed: 'd', empty: true }); window.__bugs.step(29.9); });
  check('no rare bug before 30 s', await p.evaluate(() => !window.__bugs.run.bugs.some((b) => b.type === 'goldbeetle')));
  await p.evaluate(() => window.__bugs.step(0.2));
  check('rare bug appears at 30 s', await p.evaluate(() => window.__bugs.run.bugs.some((b) => b.type === 'goldbeetle')));
  check('Moonwing absent in a day arena', await p.evaluate(() => { window.__bugs.step(60); return true; }) && await p.evaluate(() => !window.__bugs.run.bugs.some((b) => b.type === 'moonwing')));
  await p.evaluate(() => { window.__bugs.start('lantern', { seed: 'e', empty: true }); window.__bugs.step(30.1); });
  check('Moonwing appears in the night arena', await p.evaluate(() => window.__bugs.run.bugs.some((b) => b.type === 'moonwing') && !window.__bugs.run.bugs.some((b) => b.type === 'goldbeetle')));

  // stars + persistence + journal
  await p.evaluate(() => {
    window.__bugs.start('meadow', { seed: 'f', empty: true });
    for (let i = 0; i < 6; i++) window.__bugs.spawn('ladybug', 10, 7);
    window.__bugs.setPlayer(10, 7, true); window.__bugs.swing(); window.__bugs.step(90);
  });
  const sum = await p.evaluate(() => window.__bugs.summary);
  check('stars follow arena thresholds (score >= 60 -> 1 star)', sum.score >= 60 && sum.score < 120 && sum.stars === 1, JSON.stringify(sum));
  check('summary DOM shows stars via textContent', await p.evaluate(() => document.getElementById('sum-stars').textContent === '★☆☆'));
  await p.reload(); await p.waitForFunction(() => window.__bugs);
  check('stars persisted across reload', await p.evaluate(() => window.__bugs.save.stars.meadow === 1 && window.__bugs.save.journal.ladybug === 6));
  check('journal shows caught count', await p.evaluate(() => { document.getElementById('open-journal').click(); return document.querySelector('[data-species=ladybug]').textContent.includes('Caught: 6'); }));
  check('night arena locked at start, unlocks by stars', await p.evaluate(() => { window.__bugs.menu(); const b = document.querySelector('[data-arena=lantern]'); return b.disabled && !document.querySelector('[data-arena=meadow]').disabled; }));
  const stored = await p.evaluate((k) => Object.keys(JSON.parse(localStorage.getItem(k))).sort().join(','), KEY);
  check('stored save has only known keys', stored === 'best,journal,stars,v', stored);
  check('no console errors (desktop)', d.errors.length === 0, d.errors.join('|'));
  check('zero off-origin requests', d.reqs.every((u) => u.startsWith(ORIGIN + '/') || u.startsWith('data:')), d.reqs.filter((u) => !u.startsWith(ORIGIN + '/')).join(' '));
  if (shot) {
    await p.evaluate(() => { window.__bugs.start('orchard', { seed: 'shot' }); window.__bugs.step(12); });
    await p.waitForTimeout(100);
    await p.screenshot({ path: shot + '/bugs-desktop.png' });
  }
  await d.ctx.close();

  // corrupt / hostile saves
  const c1 = await open(browser, { viewport: { width: 1000, height: 700 } }, '{not json');
  check('corrupt save loads clean', await c1.page.evaluate(() => window.__bugs.save.stars.meadow === 0 && window.__bugs.unlockedCount() === 1));
  await c1.ctx.close();
  const c2 = await open(browser, { viewport: { width: 1000, height: 700 } }, JSON.stringify({ stars: { meadow: 99, evil: 3, orchard: '<img src=x onerror=alert(1)>' }, junk: 1, journal: { ladybug: -5, bogus: 4 } }));
  check('hostile save sanitised, unknown keys dropped', await c2.page.evaluate((k) => {
    const s = window.__bugs.save, raw = JSON.parse(localStorage.getItem(k));
    return s.stars.meadow === 3 && s.stars.orchard === 0 && s.journal.ladybug === 0 && !('evil' in raw.stars) && !('junk' in raw) && !('bogus' in raw.journal);
  }, KEY));
  await c2.ctx.close();

  // reduced motion
  const rm = await open(browser, { viewport: { width: 1000, height: 700 }, reducedMotion: 'reduce' });
  await rm.page.evaluate(() => { window.__bugs.start('meadow', { seed: 'g', empty: true }); for (let i = 0; i < 3; i++) window.__bugs.spawn('ladybug', 10, 7); window.__bugs.setPlayer(10, 7, true); window.__bugs.swing(); window.__bugs.step(0.05); });
  check('reduced motion: no shake, no particles', await rm.page.evaluate(() => window.__bugs.reduced === true && window.__bugs.shake === 0 && window.__bugs.particles === 0));
  await rm.ctx.close();

  // phone
  const ph = await open(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await ph.page.evaluate(() => { window.__bugs.start('meadow', { seed: 'h' }); window.__bugs.step(5); });
  check('phone: no horizontal scroll', await ph.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  check('phone: touch controls visible with 48 px targets', await ph.page.evaluate(() => ['btn-swing', 'btn-sneak', 'joy'].every((id) => { const r = document.getElementById(id).getBoundingClientRect(); return r.width >= 48 && r.height >= 48; })));
  check('phone: back links present', await ph.page.evaluate(() => [...document.querySelectorAll('a.back')].map((a) => a.getAttribute('href')).join() === '../../hub/index.html,../../index.html'));
  check('no console errors (phone)', ph.errors.length === 0, ph.errors.join('|'));
  if (shot) await ph.page.screenshot({ path: shot + '/bugs-phone.png' });
  await ph.ctx.close();

  await browser.close();
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
  process.exitCode = failed ? 1 : 0;
})();
