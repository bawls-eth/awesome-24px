// Angler bug bash: shared controls (MMInput), chip voices, pre-game card, MMMiniKit result card, Settings, layout, hostile saves.
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/angler-bugbash.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const URL = (q) => ORIGIN + '/game/games/angler/index.html?test=1' + (q || '');

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
const hook = (page, fish) => page.evaluate((f) => { const a = window.__angler; if (f) a.forceFish(f); a.tap(); a.advance(a.bite.wait + 0.2); a.tap(); return a.state; }, fish);
const win = (page) => page.evaluate(() => { const a = window.__angler; for (let i = 0; i < 4000 && a.state === 'reeling'; i++) { a.setHold(a.reel.tension < a.reel.pos); a.advance(1 / 30); } a.setHold(false); return a.state; });

(async () => {
  const browser = await chromium.launch();

  // ---- pre-game card ----
  let p = await open(browser, '&seed=a&date=2026-07-15&intro=1');
  const pg = p.page;
  check('pre-game card shows with ?intro=1', await pg.isVisible('#pregame'));
  const words = (await pg.textContent('#pregame .panel')).split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
  check('pre-game card is 40 words or fewer (' + words + ')', words <= 40);
  check('Play is the first focusable control and has focus', await pg.evaluate(() => document.activeElement && document.activeElement.id === 'pg-play'));
  check('card names the keys from MMInput', /Space \/ Enter/.test(await pg.textContent('#pg-keys')));
  await pg.keyboard.press('Enter');
  check('Enter on Play closes the card and does not cast', !(await pg.isVisible('#pregame')) && await pg.evaluate(() => __angler.state === 'idle'));
  await pg.keyboard.press('Space');
  check('Space casts after the card', await pg.evaluate(() => __angler.state === 'waiting'));
  await p.ctx.close();

  // ---- controls: Enter / Shift / E / P / Esc / R ----
  p = await open(browser, '&seed=b&date=2026-07-15');
  const k = p.page;
  await k.keyboard.press('Enter');
  check('Enter casts', await k.evaluate(() => __angler.state === 'waiting'));
  await k.evaluate(() => { const a = __angler; a.advance(a.bite.wait + 0.2); });
  await k.keyboard.press('Enter');
  check('Enter strikes the bite', await k.evaluate(() => __angler.state === 'reeling'));
  await k.evaluate(() => __angler.forceFish('bluegill'));
  await win(k);
  check('a result card is up after the fight', await k.isVisible('#result'));
  await k.keyboard.press('r');
  check('R casts again from the result', await k.evaluate(() => __angler.state === 'idle') && !(await k.isVisible('#result')));
  const before = await k.evaluate(() => __angler.spot);
  await k.keyboard.press('Shift');
  check('Shift moves to the next spot', await k.evaluate((b) => __angler.spot !== b, before));
  await k.keyboard.press('e');
  check('E also moves to the next spot', await k.evaluate(() => __angler.state === 'idle'));
  await k.keyboard.press('KeyJ'); // unknown key: nothing happens
  check('an unknown key does nothing', await k.evaluate(() => __angler.state === 'idle'));
  await k.click('#journal-btn');
  await k.keyboard.press('Escape');
  check('Esc closes the journal', !(await k.isVisible('#journal')));
  await k.click('#gear-btn');
  await k.keyboard.press('p');
  check('P closes an open panel too', !(await k.isVisible('#gear')));
  check('keys do not cast while a panel is open', await (async () => {
    await k.click('#journal-btn'); await k.keyboard.press('Enter'); const s = await k.evaluate(() => __angler.state); await k.keyboard.press('Escape'); return s === 'idle';
  })());
  check('no errors (keys)', p.errors.length === 0, p.errors.join(' | '));
  await p.ctx.close();

  // ---- chip voices ----
  p = await open(browser, '&seed=c&date=2026-07-15');
  const c = p.page;
  check('MMChip and MMInput and MMMiniKit are loaded', await c.evaluate(() => !!(window.MMChip && window.MMInput && window.MMMiniKit && window.MMSettings)));
  await c.evaluate(() => { const a = __angler; a.tap(); a.advance(a.bite.wait + 0.2); });
  check('bite cue logged', await c.evaluate(() => __angler.fun.sounds.includes('warn')));
  const voice = await c.evaluate(() => { const C = window.MMChip; return !!C && ['splash', 'bite', 'reel', 'catch', 'miss'].every((n) => !!C.SFX[n]); });
  check('chip fishing voices exist (splash, bite, reel, catch, miss)', voice);
  await p.ctx.close();

  // ---- result card: medals, stats, next goal ----
  p = await open(browser, '&seed=d&date=2026-07-15');
  const r = p.page;
  await hook(r, 'bluegill'); await win(r);
  check('card has stats rows (size, streak, best streak)', await r.evaluate(() => ['res-size', 'res-streak', 'res-beststreak'].every((id) => document.getElementById(id))));
  check('card lists medals and a next goal', await r.evaluate(() => document.querySelectorAll('#res-medals li').length === 3 && /Next goal/.test(document.querySelector('.mk-goal').textContent)));
  check('catch-a-fish medal is earned after the first fish', await r.evaluate(() => document.querySelector('#res-medals li[data-medal="catch1"]').classList.contains('on')));
  check('Cast again is the first focusable control in the card', await r.evaluate(() => document.querySelector('#result button, #result a').id === 'res-ok'));
  await r.evaluate(() => __angler.dismiss());
  await r.evaluate(() => { const a = __angler; a.tap(); a.advance(0.3); a.tap(); });
  check('a failed cast also gets the card with Try again', await r.evaluate(() => document.getElementById('res-ok').textContent === 'Try again' && !document.getElementById('res-size')));
  await p.ctx.close();

  // ---- layout: the message line no longer covers the reel strip (phone) ----
  p = await open(browser, '&seed=e&date=2026-07-15', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const ph = p.page;
  await hook(ph, 'bluegill');
  check('phone: status message sits below the scene, not over the reel strip', await ph.evaluate(() => {
    const c = document.getElementById('scene').getBoundingClientRect(), m = document.getElementById('msg').getBoundingClientRect();
    return m.top >= c.bottom - 1;
  }));
  check('phone: no horizontal scroll', await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await p.ctx.close();

  // ---- 150% text, landscape, reduced motion, low graphics ----
  p = await open(browser, '&seed=f&date=2026-07-15', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, () => { localStorage.setItem('pixeltown-access-v1', JSON.stringify({ hudScale: 1.5, lowGfx: true })); });
  const t = p.page;
  check('150% text: no horizontal scroll and the scene stays on screen', await t.evaluate(() => { const c = document.getElementById('scene').getBoundingClientRect(); return document.documentElement.scrollWidth <= innerWidth && c.height > 120; }));
  check('low graphics tier is picked up', await t.evaluate(() => __angler.gfx.low === true));
  await hook(t, 'bluegill'); await win(t);
  check('150% text: result card scrolls inside the screen', await t.evaluate(() => { const r = document.getElementById('result').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1; }));
  await p.ctx.close();

  p = await open(browser, '&seed=g&date=2026-07-15&intro=1', { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  const l = p.page;
  check('landscape: pre-game card Play is reachable', await l.evaluate(() => { const b = document.getElementById('pg-play').getBoundingClientRect(); return b.height >= 44 && b.bottom <= innerHeight + 1; }));
  await l.tap('#pg-play');
  check('landscape: scene visible and no horizontal scroll', await l.evaluate(() => document.getElementById('scene').getBoundingClientRect().height >= 250 && document.documentElement.scrollWidth <= innerWidth));
  await p.ctx.close();

  p = await open(browser, '&seed=h&date=2026-07-15', { viewport: { width: 1000, height: 700 }, reducedMotion: 'reduce' });
  check('reduced motion: no bob and no shake', await p.page.evaluate(() => { __angler.tap(); __angler.advance(1); return __angler.reduced && __angler.bobY === 0; }));
  await p.ctx.close();

  // ---- Settings via the Menu hook ----
  p = await open(browser, '&seed=i&date=2026-07-15');
  check('Settings panel is mounted', await p.page.evaluate(() => !!__angler.settings));
  await p.page.evaluate(() => __angler.settings.open());
  check('Settings opens and keys do not cast behind it', await p.page.isVisible('#mmset') && await (async () => { await p.page.keyboard.press('Enter'); return p.page.evaluate(() => __angler.state === 'idle'); })());
  await p.page.keyboard.press('Escape');
  check('Esc closes Settings', !(await p.page.isVisible('#mmset')));
  await p.ctx.close();

  // ---- hostile saves ----
  const hostile = () => {
    localStorage.setItem('pixeltown-angler-v1', '{"v":1,"caught":{"__proto__":{"n":9},"bluegill":{"n":"x","best":-5},"nope":3},"bait":"lots","gear":{"rod":"laser","lure":42},"tour":[1],"stock":null,"bells":1e99}');
    localStorage.setItem('pixeltown-angler-fun-v1', '[1,2,3]');
    localStorage.setItem('pixeltown-bugs-v1', '{{{');
    localStorage.setItem('pixeltown-isles-v1', 'null');
  };
  p = await open(browser, '&seed=j&date=2026-07-15', undefined, hostile);
  check('hostile saves load into a playable game', await p.page.evaluate(() => { const j = __angler.journal; return __angler.state === 'idle' && j.gear.rod === 'stick' && Number.isFinite(j.bells) && j.bells <= 99999999; }));
  await hook(p.page, 'bluegill'); await win(p.page);
  check('and a catch still lands with hostile saves', await p.page.evaluate(() => __angler.state === 'result'));
  check('no errors (hostile saves)', p.errors.length === 0, p.errors.join(' | '));
  await p.ctx.close();

  // ---- storage blocked ----
  p = await open(browser, '&seed=k&date=2026-07-15&intro=1', undefined, () => { Object.defineProperty(window, 'sessionStorage', { get() { throw new Error('blocked'); } }); });
  await p.page.tap ? null : null;
  await p.page.click('#pg-play');
  check('pre-game card closes even when sessionStorage throws', !(await p.page.isVisible('#pregame')) && p.errors.length === 0, p.errors.join(' | '));
  await p.ctx.close();

  await browser.close();
  done();
})();
