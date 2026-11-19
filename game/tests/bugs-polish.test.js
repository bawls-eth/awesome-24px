// Bug Safari polish tests. Serve the repo root:  python3 -m http.server 8456 &
// Run: BASE=http://localhost:8456/game/index.html NODE_PATH=$(npm root -g) node game/tests/bugs-polish.test.js
// Set SHOTS=<dir> for desktop/phone screenshots. No network beyond the local server.
const { chromium } = require('playwright');
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const URL = ORIGIN + '/game/games/festival/bugs.html?test=1';

async function open(browser, opts) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const errors = [], reqs = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('request', (r) => reqs.push(r.url()));
  await page.goto(URL);
  await page.waitForFunction(() => window.__bugs);
  return { ctx, page, errors, reqs };
}

(async () => {
  const browser = await chromium.launch();
  const shot = process.env.SHOTS;
  const d = await open(browser, { viewport: { width: 1000, height: 700 } });
  const p = d.page;

  check('MMSfx not created before a gesture', await p.evaluate(() => window.__bugs.sfx === null));
  check('hint card shows on the first run', await p.evaluate(() => { window.__bugs.start('meadow', { seed: 'h1', empty: true }); return window.__bugs.hintVisible; }));
  await p.click('#hint-ok');
  check('hint dismissed and remembered', await p.evaluate(() => !window.__bugs.hintVisible && localStorage.getItem('pixeltown-bugs-hint-v1') === '1'));
  check('hint does not show on the next run', await p.evaluate(() => { window.__bugs.start('meadow', { seed: 'h2', empty: true }); return !window.__bugs.hintVisible; }));
  check('MMSfx created after a gesture', await p.evaluate(() => window.__bugs.sfx !== null));

  // swarm
  const sw = await p.evaluate(() => {
    const B = window.__bugs; B.start('meadow', { seed: 's', empty: true });
    B.setPlayer(2, 12, true);
    const bugs = B.spawnSwarm('ladybug', 10, 7, 3);
    B.step(3);
    const spread = () => { const r = B.run.bugs; let m = 0; for (const a of r) for (const b of r) m = Math.max(m, Math.hypot(a.x - b.x, a.y - b.y)); return m; };
    const together = spread();
    const c = B.run.bugs[0];
    B.setPlayer(c.x, c.y + 2, false); // one scare near the swarm
    B.step(0.2);
    return { together, states: B.run.bugs.map((b) => b.state), n: bugs.length };
  });
  check('swarm moves as a group', sw.n === 3 && sw.together < 2, JSON.stringify(sw));
  check('swarm scatters together on a scare', sw.states.every((s) => s === 'flee'), JSON.stringify(sw.states));

  // hide in flowers
  const hf = await p.evaluate(() => {
    const B = window.__bugs; B.start('meadow', { seed: 'f', empty: true });
    const b = B.hideInFlower('butterfly', 10, 7);
    B.setPlayer(10, 9.5, true); B.step(0.1);
    const far = b.state;
    B.setPlayer(10, 8.2, true); B.step(0.05);
    return { far, adj: b.state };
  });
  check('hidden bug stays hidden when you are not adjacent', hf.far === 'hidden', hf.far);
  check('hidden bug is flushed out by adjacency', hf.adj === 'flee', hf.adj);
  const nc = await p.evaluate(() => {
    const B = window.__bugs; B.start('meadow', { seed: 'f2', empty: true });
    B.hideInFlower('butterfly', 10, 7);
    B.setPlayer(10, 8.7, true); // 1.7 away: inside net range once flushed, outside flush radius
    return B.swing().caught.length;
  });
  check('hidden bug is not catchable while hidden', nc === 0, String(nc));

  // burrower
  const bu = await p.evaluate(() => {
    const B = window.__bugs; B.start('meadow', { seed: 'b', empty: true });
    const b = B.spawn('antlion', 10, 7, { mound: true });
    const out = { start: b.state };
    B.setPlayer(8, 7, true); B.step(0.1); B.step(0.2); out.early = b.state;
    B.step(1); out.still = b.state;
    B.setPlayer(7, 7, false); B.step(0.1); out.moved = b.state;
    return out;
  });
  check('burrower starts underground', bu.start === 'hidden', JSON.stringify(bu));
  check('burrower does not appear before standing still long enough', bu.early === 'hidden', JSON.stringify(bu));
  check('burrower appears when you stand still near its mound', bu.still === 'idle', JSON.stringify(bu));
  check('burrower dives again when you run', bu.moved === 'hidden', JSON.stringify(bu));
  const bm = await p.evaluate(() => {
    const B = window.__bugs; B.start('meadow', { seed: 'b2', empty: true });
    const b = B.spawn('antlion', 10, 7, { mound: true });
    for (let i = 0; i < 20; i++) { B.setPlayer(8 + (i % 2) * 0.5, 7, true); B.step(0.1); }
    return b.state;
  });
  check('burrower never appears if you keep moving', bm === 'hidden', bm);

  // summary
  await p.evaluate(() => {
    const B = window.__bugs; B.start('meadow', { seed: 'sum', empty: true });
    B.spawn('ladybug', 10, 7); B.spawn('ladybug', 10, 7); B.spawn('cricket', 10, 7);
    B.setPlayer(10, 7, true); B.swing(); B.step(90);
  });
  const sm = await p.evaluate(() => ({
    ladybug: (document.querySelector('#sum-counts [data-species=ladybug]') || {}).textContent,
    cricket: (document.querySelector('#sum-counts [data-species=cricket]') || {}).textContent,
    combo: document.getElementById('sum-combo').textContent,
    gained: document.getElementById('sum-gained').textContent,
    hint: document.getElementById('sum-hint').textContent, best: window.__bugs.summary.bestCombo
  }));
  check('summary lists per-species counts', sm.ladybug === 'Ladybug x2' && sm.cricket === 'Cricket x1', JSON.stringify(sm));
  check('summary shows best combo', sm.best === 3 && sm.combo.includes('Best combo: 3'), JSON.stringify(sm));
  check('summary shows stars gained and next unlock hint', /Stars gained: \d/.test(sm.gained) && /unlocks at \d+ stars/.test(sm.hint), JSON.stringify(sm));

  // journal
  const jr = await p.evaluate(() => {
    document.getElementById('to-menu').click(); document.getElementById('open-journal').click();
    const el = (s) => document.querySelector('#journal-list [data-species=' + s + ']');
    return { all: document.querySelectorAll('#journal-list [data-species]').length, sil: el('moonwing').querySelector('canvas').dataset.silhouette, name: el('moonwing').textContent, caught: el('ladybug').querySelector('canvas').dataset.silhouette };
  });
  check('journal lists all species, silhouette until caught', jr.all === 7 && jr.sil === '1' && jr.name.includes('???') && jr.caught === '0', JSON.stringify(jr));
  await p.reload(); await p.waitForFunction(() => window.__bugs);
  check('journal counts persist across reload', await p.evaluate(() => { document.getElementById('open-journal').click(); const t = document.querySelector('[data-species=ladybug]').textContent; return t.includes('Caught: 2') && document.querySelector('[data-species=cricket]').textContent.includes('Caught: 1'); }));

  // unlock rule + muted default
  check('arena unlock rule text visible on select screen', await p.evaluate(() => { window.__bugs.menu(); const r = document.getElementById('unlock-rule'); return !!r && r.offsetHeight > 0 && /2 x \(its number - 1\)/.test(r.textContent); }));
  await p.evaluate(() => localStorage.setItem('mm-sfx-muted', '1'));
  await p.reload(); await p.waitForFunction(() => window.__bugs);
  check('stored mute flag respected after a gesture', await p.evaluate(() => { window.dispatchEvent(new Event('pointerdown')); return !!window.__bugs.sfx && window.__bugs.sfx.isMuted() && document.getElementById('btn-mute').textContent === 'Sound off'; }));
  if (shot) {
    await p.evaluate(() => { localStorage.removeItem('pixeltown-bugs-hint-v1'); window.__bugs.start('meadow', { seed: 'shot' }); window.__bugs.step(6); });
    await p.screenshot({ path: shot + '/polish-desktop.png' });
    await p.evaluate(() => window.__bugs.menu()); await p.screenshot({ path: shot + '/polish-menu.png' });
  }
  check('no console errors (desktop)', d.errors.length === 0, d.errors.join('|'));
  check('zero off-origin requests', d.reqs.every((u) => u.startsWith(ORIGIN + '/') || u.startsWith('data:')), d.reqs.filter((u) => !u.startsWith(ORIGIN + '/')).join(' '));
  await d.ctx.close();

  const ph = await open(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await ph.page.evaluate(() => { window.__bugs.start('meadow', { seed: 'ph' }); window.__bugs.step(4); });
  check('phone 390x844: no horizontal scroll (play, hint open)', await ph.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  if (shot) await ph.page.screenshot({ path: shot + '/polish-phone.png' });
  await ph.page.evaluate(() => window.__bugs.menu());
  check('phone 390x844: no horizontal scroll (menu)', await ph.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  check('no console errors (phone)', ph.errors.length === 0, ph.errors.join('|'));
  await ph.ctx.close();

  await browser.close();
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
  process.exitCode = failed ? 1 : 0;
})();
