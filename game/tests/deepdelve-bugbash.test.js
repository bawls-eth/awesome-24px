// Deepdelve bug bash: Esc/P menu, Settings entry, key hygiene (modifiers, blur), touch wording, hostile saved position.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/deepdelve-bugbash.test.js (serve the repo root)
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const URL = (q) => ORIGIN + '/game/games/deepdelve/index.html?test=1' + (q || '');
const DESKTOP = { viewport: { width: 1000, height: 700 } };
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };

async function open(browser, q, opts, pre) {
  const ctx = await browser.newContext(opts || DESKTOP);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  if (pre) await page.addInitScript(pre);
  await page.goto(URL(q));
  await page.waitForFunction(() => window.__dd && window.__dd.ready);
  return { ctx, page, errors };
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const D = await open(browser, '&seed=11');
  const p = D.page;
  const navOpen = () => p.evaluate(() => document.body.classList.contains('mm-nav-open'));
  await p.keyboard.press('Escape');
  check('Esc with nothing open opens the Menu sheet', await navOpen());
  check('Menu sheet has a Settings entry', await p.evaluate(() => { const e = document.getElementById('mm-nav-settings'); return !!e && !e.hidden; }));
  await p.click('#mm-nav-settings');
  check('Settings panel opens from the Menu sheet', await p.evaluate(() => { const e = document.getElementById('mmset'); return !!e && !e.hidden; }));
  await p.keyboard.press('Escape');
  await p.keyboard.press('p');
  check('P opens the Menu sheet too (CONTROLS.md alias)', await navOpen());
  await p.keyboard.press('Escape');
  await p.evaluate(() => window.__dd.panel('goals', true));
  await p.keyboard.press('Escape');
  check('Esc closes an open panel first (no menu on top)', await p.evaluate(() => document.getElementById('goals-panel').hidden) && !(await navOpen()));

  await p.keyboard.press('Control+c');
  check('Ctrl+C does not open the Craft panel', await p.evaluate(() => document.getElementById('craft-panel').hidden));
  await p.evaluate(() => document.activeElement && document.activeElement.blur()); // Enter on a focused button presses that button
  await p.keyboard.down('Enter');
  check('Enter is a jump alias', await p.evaluate(() => window.__dd.input.jump === true));
  await p.keyboard.up('Enter');
  await p.keyboard.down('w');
  await p.evaluate(() => window.dispatchEvent(new Event('blur')));
  check('losing focus releases held keys', await p.evaluate(() => window.__dd.input.fwd === 0 && !window.__dd.input.jump));
  await p.keyboard.up('w');
  check('desktop keeps the key letters on the tool buttons', await p.evaluate(() => /\(C\)/.test(document.getElementById('open-craft').textContent)));
  check('MMInput is loaded for the menu alias', await p.evaluate(() => !!window.MMInput && MMInput.actionOf('p') === 'menu'));
  check('no page errors (desktop)', D.errors.length === 0, D.errors.join('|'));
  await D.ctx.close();

  // reduce motion applies live from the settings event
  const R = await open(browser, '&seed=11');
  const rm = await R.page.evaluate(() => { document.documentElement.setAttribute('data-reduce-motion', '1'); window.dispatchEvent(new CustomEvent('mm-settings-change', { detail: { id: 'reduce-motion', value: true } })); return window.__dd.reduced; });
  check('Settings reduce-motion change applies without a reload', rm === true);
  await R.ctx.close();

  const P = await open(browser, '&seed=11', PHONE);
  const t = await P.page.evaluate(() => ({ craft: document.getElementById('open-craft').textContent, goals: document.getElementById('open-goals').textContent, sw: document.documentElement.scrollWidth }));
  check('touch: tool labels carry no key letters', t.craft === 'Craft' && t.goals === 'Goals', JSON.stringify(t));
  check('touch: no horizontal scroll', t.sw <= 390);
  await P.ctx.close();

  // hostile saved position: far outside the world, then inside rock
  const pre = (pos) => `try { localStorage.setItem('x','1'); } catch (e) {} window.__pos = ${JSON.stringify(pos)};`;
  void pre;
  const H = await open(browser, '&seed=12');
  await H.page.evaluate(() => window.__dd.kv.set('player:12', JSON.stringify({ inv: { wood: 4 }, pos: [1e9, 1e9, -5e8] })));
  await H.page.reload();
  await H.page.waitForFunction(() => window.__dd.ready);
  const hp = await H.page.evaluate(() => ({ x: window.__dd.player.x, y: window.__dd.player.y, z: window.__dd.player.z }));
  check('hostile saved position is clamped into the world', hp.x >= 1 && hp.x <= 127 && hp.z >= 1 && hp.z <= 127 && hp.y <= 3 && hp.y >= -61, JSON.stringify(hp));
  await H.page.evaluate(() => window.__dd.kv.set('player:12', JSON.stringify({ pos: [64.5, -40, 64.5] })));
  await H.page.reload();
  await H.page.waitForFunction(() => window.__dd.ready);
  const hq = await H.page.evaluate(() => { const d = window.__dd; return { y: d.player.y, sy: d.spawn.y }; });
  check('a saved position inside solid rock falls back to the spawn', Math.abs(hq.y - hq.sy) < 0.01, JSON.stringify(hq));
  await H.ctx.close();
  await browser.close();
  done();
})();
