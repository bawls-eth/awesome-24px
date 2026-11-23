// Bug Safari run variety (VAR1): one seeded modifier per run, named on the arena card and HUD, honest odds in the menu,
// Replay seed, modifier bests kept apart from plain bests (additive field `mod` in pixeltown-bugs-pb-v1), ?mods=0 off switch.
// Phone 390x844 + desktop, DB blocked, standalone. Serve the repo root first:  python3 -m http.server 9372 &
// Run: NODE_PATH=$(npm root -g) BASE=http://localhost:9372/game/index.html node game/tests/bugs-variety.test.js
const { chromium } = require('playwright');
const { blockDb } = require('./helpers');
const B0 = require('../shared/mm-bugs.js');
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }
const ORIGIN = (process.env.BASE || 'http://localhost:9372/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/festival/bugs.html?test=1';
const SHOTS = process.env.SHOTS || '';
const errors = [], dbs = [];
async function open(browser, opts, q) {
  const ctx = await browser.newContext(opts);
  dbs.push(await blockDb(ctx));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.addInitScript(() => { try { localStorage.setItem('pixeltown-bugs-hint-v1', '1'); } catch (e) { /* ignore */ } });
  await page.goto(PAGE + (q || '&mods=1'));
  await page.waitForFunction(() => window.__bugs);
  return { ctx, page };
}

(async () => {
  // ---- pure module ----
  check('pickMod is seeded (same seed, same modifier)', B0.pickMod('abc') === B0.pickMod('abc') && B0.MOD_IDS.indexOf(B0.pickMod('abc')) >= 0);
  const seen = {}; for (let i = 0; i < 200; i++) seen[B0.pickMod('s' + i)] = 1;
  check('every modifier can come up', B0.MOD_IDS.every((m) => seen[m]), JSON.stringify(seen));
  check('each modifier has a name and a one-line effect', B0.MOD_IDS.every((m) => B0.MODS[m].name && B0.MODS[m].line && B0.MODS[m].line.length < 70));
  const plainRun = B0.createRun({ seed: 'same', arena: 'meadow' }), ffRun = B0.createRun({ seed: 'same', arena: 'meadow', mod: 'fireflies' });
  check('a modifier never moves where bugs start', JSON.stringify(plainRun.state.bugs.map((b) => [b.type, b.x, b.y])) === JSON.stringify(ffRun.state.bugs.map((b) => [b.type, b.x, b.y])));
  check('Fireflies Night marks exactly 3 glow bugs, plain marks none', ffRun.state.bugs.filter((b) => b.glow).length === 3 && plainRun.state.bugs.filter((b) => b.glow).length === 0);
  function pts(mod, glow) { const r = B0.createRun({ seed: 'p', arena: 'meadow', empty: true, mod }); r.setPlayer(5, 5, true); const b = r.spawn('beetle', 5.2, 5); if (glow) b.glow = true; r.swing(); return r.state.score; }
  check('honest points: plain 20, Calm x0.8 = 16, Sneaky x1.25 = 25, glow bug x2 = 40', pts() === 20 && pts('calm') === 16 && pts('sneaky') === 25 && pts('fireflies', true) === 40, [pts(), pts('calm'), pts('sneaky'), pts('fireflies', true)].join());
  function fleeDist(mod) { const r = B0.createRun({ seed: 'f', arena: 'meadow', empty: true, mod }); r.setPlayer(5, 5, false); const b = r.spawn('beetle', 8.5, 5); r.update(0.5); return b.x - 8.5; }
  check('Sneaky Season: a bug 3.5 tiles away flees (plain: it does not)', fleeDist('sneaky') > 0 && fleeDist() === 0, fleeDist('sneaky') + ' ' + fleeDist());
  function runAway(mod) { const r = B0.createRun({ seed: 'f', arena: 'meadow', empty: true, mod }); r.setPlayer(5, 5, false); const b = r.spawn('beetle', 7, 5); r.update(0.5); return b.x - 7; }
  check('Calm Day: bugs run at 70% speed', Math.abs(runAway('calm') - runAway() * 0.7) < 1e-9, runAway('calm') + ' ' + runAway());
  const gr = B0.createRun({ seed: 'g', arena: 'meadow', empty: true, mod: 'gusty' }); gr.setPlayer(1, 1, true); const gb = gr.spawn('ladybug', 10, 7); gr.update(1);
  check('Gusty: the breeze moves a calm bug', gr.state.wind && Math.hypot(gb.x - 10, gb.y - 7) > 0.2, JSON.stringify(gr.state.wind));

  const browser = await chromium.launch();
  // ---- phone ----
  const ph = await open(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const p = ph.page;
  const card = await p.evaluate(() => {
    const c = document.querySelector('#overlay .card[data-arena="meadow"] .cardmod'), nx = window.__bugs.nextFor('meadow');
    const li = [...document.querySelectorAll('#mod-list li')].map((x) => x.textContent), odds = document.querySelector('#mod-list p').textContent;
    return { text: c && c.textContent, mod: c && c.dataset.mod, nx, li, odds, px: c ? parseFloat(getComputedStyle(c).fontSize) : 0 };
  });
  check('arena card names the next run modifier', card.text === 'Next run: ' + B0.MODS[card.nx.mod].name && card.mod === card.nx.mod, JSON.stringify(card));
  check('menu lists every modifier with its effect', card.li.length === 4 && card.li.every((t) => /: .+\./.test(t)), JSON.stringify(card.li));
  check('menu shows the honest odds and the off switch', /1 in 4 chance/.test(card.odds) && /\?mods=0/.test(card.odds), card.odds);
  check('card modifier text is 12 px+', card.px >= 12, card.px);
  if (SHOTS) await p.screenshot({ path: SHOTS + '/bugs-menu-phone.png', fullPage: true });
  await p.tap('#overlay .card[data-arena="meadow"]');
  const hud = await p.evaluate(() => { const h = document.getElementById('hud-mod'); return { mode: window.__bugs.mode, mod: window.__bugs.mod, text: h.textContent, hidden: h.hidden, title: h.title, seed: window.__bugs.seed }; });
  check('the run uses the modifier the card showed', hud.mode === 'play' && hud.mod === card.nx.mod && hud.seed === card.nx.seed, JSON.stringify(hud));
  check('HUD shows the modifier name with its effect as a tooltip', !hud.hidden && hud.text === B0.MODS[hud.mod].name && hud.title === B0.MODS[hud.mod].line, JSON.stringify(hud));
  if (SHOTS) { await p.evaluate(() => { window.__bugs.step(5); window.__bugs.render(); }); await p.screenshot({ path: SHOTS + '/bugs-play-phone.png' }); }
  const first = await p.evaluate(() => { const B = window.__bugs; B.start('meadow', { seed: B.seed, mod: B.mod }); const bugs0 = B.run.bugs.map((b) => [b.type, +b.x.toFixed(4), +b.y.toFixed(4)]); B.setPlayer(10, 7, true); B.spawn('beetle', 10.2, 7); B.swing(); B.step(91); return { bugs0, s: B.summary, plainBest: B.save.best.meadow, pb: B.pb }; });
  check('a modifier run keeps its own best and never writes the plain best', first.plainBest === 0 && first.pb.mod.meadow[first.s.mod] === first.s.score && first.s.score > 0, JSON.stringify(first.pb));
  check('stars keep their rule (score thresholds)', first.s.stars === B0.starsFor('meadow', first.s.score));
  const sm = await p.evaluate(() => { const r = document.getElementById('replay').getBoundingClientRect(), m = document.getElementById('sum-mod'); return { w: r.width, h: r.height, inView: r.bottom <= innerHeight, mod: m && m.textContent }; });
  check('summary names the modifier and its effect', sm.mod === B0.MODS[first.s.mod].name + ': ' + B0.MODS[first.s.mod].line, JSON.stringify(sm));
  check('Replay seed is a 44 px+ target on screen', sm.w >= 44 && sm.h >= 44 && sm.inView, JSON.stringify(sm));
  if (SHOTS) await p.screenshot({ path: SHOTS + '/bugs-summary-phone.png' });
  await p.tap('#replay');
  const rep = await p.evaluate(() => ({ seed: window.__bugs.seed, mod: window.__bugs.mod, bugs: window.__bugs.run.bugs.map((b) => [b.type, +b.x.toFixed(4), +b.y.toFixed(4)]), best: document.getElementById('hud-best').textContent }));
  check('Replay seed restarts the same seed, modifier and bug layout', rep.seed === first.s.seed && rep.mod === first.s.mod && JSON.stringify(rep.bugs) === JSON.stringify(first.bugs0), JSON.stringify(rep).slice(0, 200));
  check('HUD best is the modifier best', rep.best === 'Best ' + first.s.score, rep.best);
  const st = await p.evaluate(() => JSON.parse(localStorage.getItem('pixeltown-bugs-pb-v1')));
  check('pb key stays v1 with combo/runs and the additive mod field', st.v === 1 && typeof st.runs === 'number' && st.combo && st.mod && st.mod.meadow, JSON.stringify(st));
  await p.evaluate(() => localStorage.setItem('pixeltown-bugs-pb-v1', '{"v":1,"combo":{},"runs":2,"mod":{"meadow":{"calm":"x","gusty":40,"nope":9},"zzz":{"calm":5}}}'));
  await p.reload(); await p.waitForFunction(() => window.__bugs);
  const cl = await p.evaluate(() => window.__bugs.pb);
  check('a bad mod field is cleaned (only known arenas, modifiers and numbers)', JSON.stringify(cl.mod) === '{"meadow":{"gusty":40}}' && cl.runs === 2, JSON.stringify(cl));
  await ph.ctx.close();

  // ---- off switch + reduced motion ----
  const off = await open(browser, { viewport: { width: 390, height: 844 } }, '&mods=0');
  const o = await off.page.evaluate(() => { const cm = document.querySelectorAll('#overlay .cardmod').length; document.querySelector('#overlay .card[data-arena="meadow"]').click(); return { on: window.__bugs.modsOn, cm, mod: window.__bugs.mod, hud: document.getElementById('hud-mod').hidden, list: !!document.getElementById('mod-list') }; });
  check('?mods=0 turns modifiers off: plain run, no card tag, no HUD tag, no list', o.on === false && o.cm === 0 && o.mod === null && o.hud === true && o.list === false, JSON.stringify(o));
  await off.ctx.close();
  const rm = await open(browser, { viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const r = await rm.page.evaluate(() => { const B = window.__bugs; B.start('meadow', { seed: 'rm', mod: 'fireflies', empty: true }); B.setPlayer(10, 7, true); for (let i = 0; i < 3; i++) { B.spawn('ladybug', 10.3, 7).glow = true; B.swing(); B.step(0.4); } B.render(); return { reduced: B.reduced, shake: B.shake, mod: B.mod, parts: B.particles, score: B.run.score }; });
  check('reduced motion: glow catches add no shake or sparks', r.reduced && r.shake === 0 && r.parts === 0 && r.mod === 'fireflies' && r.score > 60, JSON.stringify(r));
  await rm.ctx.close();

  // ---- desktop ----
  const dk = await open(browser, { viewport: { width: 1280, height: 800 } });
  const d = dk.page;
  await d.click('#overlay .card[data-arena="meadow"]');
  const dm = await d.evaluate(() => ({ mod: window.__bugs.mod, vis: getComputedStyle(document.getElementById('hud-mod')).display !== 'none' }));
  check('desktop: HUD modifier visible', !!dm.mod && dm.vis, JSON.stringify(dm));
  if (SHOTS) { await d.evaluate(() => { window.__bugs.step(3); window.__bugs.render(); }); await d.screenshot({ path: SHOTS + '/bugs-play-desk.png' }); }
  const seed1 = await d.evaluate(() => { window.__bugs.step(91); return window.__bugs.seed; });
  await d.keyboard.press('KeyR');
  const dr = await d.evaluate(() => ({ mode: window.__bugs.mode, seed: window.__bugs.seed }));
  check('R still plays again, with a fresh seed', dr.mode === 'play' && !!dr.seed && dr.seed !== seed1, JSON.stringify(dr));
  await dk.ctx.close();

  check('console clean', errors.length === 0, JSON.stringify(errors));
  check('zero DB requests', dbs.every((x) => x.attempts() === 0), JSON.stringify(dbs.map((x) => x.attempts())));
  await browser.close();
  console.log(failed ? failed + ' FAILED' : 'ALL PASSED');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
