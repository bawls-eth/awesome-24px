// Bug Safari depth (MG1): hub medals, journal goals, the Night Glade variant, shared access prefs.
// Serve the repo root:  python3 -m http.server 9121 &
// Run: BASE=http://localhost:9121/game/index.html NODE_PATH=$(npm root -g) node game/tests/bugs-depth.test.js
// Offline (blockDb), seeded, phone 390x844. No Firebase, no external network.
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const B = require('../shared/mm-bugs.js');
const HM = require('../hub/medals.js');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const URL = ORIGIN + '/game/games/festival/bugs.html?test=1';
const HUB = ORIGIN + '/game/hub/index.html?map=1'; // HS1: map view (the default view is the home screen)
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
const MK = 'pixeltown-medals-bugs-v1', GK = 'pixeltown-bugs-goals-v1';
const all = [];

async function open(browser, seed, opts, url) {
  const ctx = await browser.newContext(opts || PHONE);
  const db = await blockDb(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.addInitScript((s) => { if (sessionStorage.seeded) return; sessionStorage.seeded = '1'; localStorage.setItem('pixeltown-bugs-hint-v1', '1'); Object.keys(s).forEach((k) => localStorage.setItem(k, s[k])); }, seed || {});
  await page.goto(url || URL);
  if (!url) await page.waitForFunction(() => window.__bugs);
  else await page.waitForFunction(() => window.__hub);
  const o = { ctx, db, page, errors }; all.push(o); return o;
}

(async () => {
  // ---------- pure ----------
  const full = { v: 1, stars: { meadow: 3, orchard: 3, pond: 3, forest: 1 }, journal: { ladybug: 1, butterfly: 1, beetle: 1, cricket: 1, antlion: 1, goldbeetle: 1, moonwing: 1 } };
  check('pure: medal ids are the four MG1 medals', JSON.stringify(B.MEDAL_IDS) === '["first_catch","species7","stars10","moonwing"]');
  check('pure: a full save earns all four medals', JSON.stringify(B.medalsFor(full, null)) === JSON.stringify(B.MEDAL_IDS), JSON.stringify(B.medalsFor(full, null)));
  check('pure: an empty or hostile save earns none', B.medalsFor(null, null).length === 0 && B.medalsFor('{{', '<x>').length === 0);
  check('pure: species7 needs all 7 base species', !B.medalsFor({ journal: Object.assign({}, full.journal, { antlion: 0 }) }, null).includes('species7'));
  check('pure: goal stars count toward stars10', B.medalsFor({ stars: { meadow: 3, orchard: 3 } }, { done: { meadow: ['m1', 'm2', 'm3'], orchard: ['o1'] } }).includes('stars10') && !B.medalsFor({ stars: { meadow: 3, orchard: 3 } }, null).includes('stars10'));
  check('hub: GAMES.bugs is the w5-safari strip with the same 4 ids', HM.GAMES.bugs && HM.GAMES.bugs.node === 'w5-safari' && JSON.stringify(HM.GAMES.bugs.medals.map((m) => m[0])) === JSON.stringify(B.MEDAL_IDS) && HM.gameOfNode('w5-safari') === 'bugs');
  check('hub: clean() keeps only bugs ids', JSON.stringify(HM.clean('{"v":1,"m":["moonwing","<img>","catch1","moonwing"]}', 'bugs')) === '["moonwing"]');

  // goals
  check('goals: 3 per arena for all 9 arenas (8 + Night Glade)', B.ALL_ARENAS.length === 9 && B.ALL_ARENAS.every((a) => B.goalsFor(a.id).length === 3) && B.GOAL_COUNT === 27);
  check('goals: plain text, no timers or deadlines in any goal', Object.keys(B.GOALS).every((a) => B.GOALS[a].every((g) => typeof g.text === 'string' && !/second|minute|hour|day|today|before|hurry|left|expire|streak/i.test(g.text))));
  check('goals: cleanGoals drops unknown ids and arenas', JSON.stringify(B.cleanGoals({ done: { meadow: ['m1', 'zz', 'm1'], evil: ['x'] } }).done.meadow) === '["m1"]' && !('evil' in B.cleanGoals({ done: { evil: ['x'] } }).done) && B.goalStars('nope') === 0);
  {
    const g = B.createRun({ seed: 'gm', empty: true, arena: 'meadow' });
    for (let i = 0; i < 3; i++) { g.spawn('cricket', 10, 7); g.setPlayer(10, 7, true); g.update(0.4); g.swing(); }
    const sneakMet = B.goalsMet('meadow', g.state);
    const g2 = B.createRun({ seed: 'gm', empty: true, arena: 'meadow' });
    for (let i = 0; i < 3; i++) { g2.spawn('cricket', 10, 7); g2.setPlayer(10, 7, false); g2.swing(); g2.update(0.4); }
    check('goals: "Catch 3 crickets sneaking" needs sneaking', sneakMet.includes('m2') && !B.goalsMet('meadow', g2.state).includes('m2'), JSON.stringify(sneakMet));
  }

  // glade (pure)
  check('glade: a variant of lantern, never in the 8 base arenas', B.VARIANTS[0].id === 'glade' && B.VARIANTS[0].variant === 'lantern' && B.ARENAS.length === 8 && B.arena('glade').night);
  check('glade: its bugs only spawn in the glade', !B.canSpawn('firefly', true) && B.canSpawn('firefly', true, true) && !B.createRun({ seed: 1, empty: true, night: true }).spawn('glowmoth'));
  {
    const a = B.createRun({ seed: 'gl', arena: 'glade', night: true, glade: true }).state.bugs.map((b) => b.type + b.x.toFixed(3));
    const b = B.createRun({ seed: 'gl', arena: 'glade', night: true, glade: true }).state.bugs.map((b) => b.type + b.x.toFixed(3));
    const fl = a.filter((t) => /^firefly/.test(t)).length, gm = a.filter((t) => /^glowmoth/.test(t)).length;
    check('glade: seeded spawns (same seed, same field) with 4 fireflies + 2 glowmoths', JSON.stringify(a) === JSON.stringify(b) && fl === 4 && gm === 2, a.join());
    const day = B.createRun({ seed: 'gl', arena: 'meadow' }).state.bugs.map((x) => x.type);
    check('glade: other arenas keep their own bugs', day.every((t) => B.GLADE_SPECIES.indexOf(t) < 0) && day.length === 12);
  }
  {
    const g = B.createRun({ seed: 'ff', empty: true, night: true, glade: true });
    const f = g.spawn('firefly', 10, 7);
    g.setPlayer(7, 7, false); g.update(0.05); g.setPlayer(8, 7, false); g.update(0.05); // a fast walk-up
    const fast = f.state;
    check('fireflies: a fast approach makes them dim and uncatchable', fast === 'hidden' && f.hideKind === 'dim' && g.swing().caught.length === 0, fast);
    g.update(2);
    const g2 = B.createRun({ seed: 'ff', empty: true, night: true, glade: true });
    const f2 = g2.spawn('firefly', 10, 7);
    for (let x = 7; x <= 10; x += 0.1) { g2.setPlayer(x, 7, true); g2.update(0.05); }
    check('fireflies: a slow (sneaking) approach keeps them catchable', f2.state !== 'hidden' && g2.swing().caught.includes(f2.id), f2.state);
    check('fireflies: they light up again after the dim spell', f.state === 'idle' && f.dimmed === 1, f.state);
  }

  const browser = await chromium.launch();

  // ---------- medals key written on load, read by the hub ----------
  const seedFull = { 'pixeltown-bugs-v1': JSON.stringify(full) };
  const M = await open(browser, seedFull);
  const mk = await M.page.evaluate((k) => localStorage.getItem(k), MK);
  check('medals: page writes pixeltown-medals-bugs-v1 = {v:1,m:[...]} on load', mk === JSON.stringify({ v: 1, m: B.MEDAL_IDS }), mk);
  const fresh = await open(browser, {});
  check('medals: a fresh save writes an empty medal list', (await fresh.page.evaluate((k) => localStorage.getItem(k), MK)) === '{"v":1,"m":[]}');
  const H = await open(browser, { [MK]: mk, 'pixeltown-hub-v1': JSON.stringify({ v: 1, at: 'w5-safari' }) }, PHONE, HUB);
  const ach = await H.page.evaluate(() => window.__hub.achievements().bugs);
  check('medals: the hub reads all 4 Bug Safari medals through GAMES.bugs', JSON.stringify(ach) === JSON.stringify(B.MEDAL_IDS), JSON.stringify(ach));
  const strip = await H.page.evaluate(async () => {
    const p = window.__hub.nodeClient('w5-safari');
    const t = document.elementFromPoint(p.x, p.y); void t;
    return p;
  });
  await H.page.mouse.click(strip.x, strip.y);
  await H.page.waitForFunction(() => !document.getElementById('card').hidden, null, { timeout: 8000 }).catch(() => {});
  const chips = await H.page.evaluate(() => [...document.querySelectorAll('#card-ach li.on')].map((l) => l.dataset.medal));
  check('medals: the Bug Safari card lights its medal chips', JSON.stringify(chips) === JSON.stringify(B.MEDAL_IDS), JSON.stringify(chips));

  // ---------- journal goals on the page ----------
  const P = await open(browser, {});
  const gp = await P.page.evaluate(() => {
    const b = window.__bugs; b.start('meadow', { seed: 'goal', empty: true });
    for (let i = 0; i < 3; i++) { b.spawn('cricket', 10, 7); b.setPlayer(10, 7, true); b.step(0.4); b.swing(); }
    const before = b.totalStars;
    b.step(91);
    return { before, after: b.totalStars, goals: b.goals.done.meadow, sum: (document.getElementById('sum-goals') || {}).textContent || '', mode: b.mode };
  });
  check('goals: finishing a goal in a run marks it done and adds a star', gp.mode === 'summary' && gp.goals.includes('m2') && gp.after >= gp.before + 1, JSON.stringify(gp));
  check('goals: the summary names the goal done', /Catch 3 crickets sneaking/.test(gp.sum), gp.sum);
  await P.page.reload(); await P.page.waitForFunction(() => window.__bugs);
  const gj = await P.page.evaluate(() => {
    window.__bugs.showJournal();
    const li = document.querySelector('#goals-list [data-arena=meadow] [data-goal=m2]');
    return { stored: JSON.parse(localStorage.getItem('pixeltown-bugs-goals-v1')).done.meadow, done: li && li.dataset.done, text: li && li.textContent, sections: document.querySelectorAll('#goals-list .goal-arena').length, items: document.querySelectorAll('#goals-list li').length, all: document.getElementById('overlay').textContent };
  });
  check('goals: persisted in their own key and shown as done after reload', gj.stored.includes('m2') && gj.done === '1' && /^\[x\] /.test(gj.text), JSON.stringify(gj).slice(0, 200));
  check('goals: "Things to find" lists 3 goals for each of the 9 arenas', gj.sections === 9 && gj.items === 27 && /Things to find/.test(gj.all));
  check('goals: calm copy, no timers, streaks or expiry on the journal', !/streak|expire|hurry|left today|missed|\d+\s*s\b/i.test(gj.all.replace(/\d+ of \d+/g, '')), gj.all.slice(0, 300));
  check('goals: the run save keeps only its known keys', (await P.page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('pixeltown-bugs-v1'))).sort().join())) === 'best,journal,stars,v');

  // ---------- Night Glade on the page ----------
  const lockedTxt = await fresh.page.evaluate(() => { window.__bugs.menu(); const b = document.querySelector('[data-arena=glade]'); return { dis: b.disabled, t: b.textContent, rule: document.getElementById('unlock-rule').textContent }; });
  check('glade: shown on the arena screen, locked with "Needs 16 stars"', lockedTxt.dis && /Night Glade/.test(lockedTxt.t) && /Needs 16 stars/.test(lockedTxt.t), JSON.stringify(lockedTxt));
  check('glade: the rule says it opens by stars and nothing is locked by time', /Night Glade 16/.test(lockedTxt.rule) && /Nothing is ever locked by time/.test(lockedTxt.rule) && /2 x \(its number - 1\)/.test(lockedTxt.rule));
  const starsSeed = { 'pixeltown-bugs-v1': JSON.stringify({ v: 1, stars: { meadow: 3, orchard: 3, pond: 3, forest: 3, dunes: 3, cliffs: 1 } }) };
  const G = await open(browser, starsSeed);
  const gl = await G.page.evaluate(() => {
    const b = window.__bugs; b.menu();
    const card = document.querySelector('[data-arena=glade]');
    const open = !card.disabled; card.click();
    const r = b.run;
    return { open, mode: b.mode, arena: document.getElementById('hud-arena').textContent, fire: r.bugs.filter((x) => x.type === 'firefly').length, moth: r.bugs.filter((x) => x.type === 'glowmoth').length };
  });
  check('glade: opens at 16 stars and plays with fireflies + glowmoths', gl.open && gl.mode === 'play' && gl.arena === 'Night Glade' && gl.fire === 4 && gl.moth === 2, JSON.stringify(gl));
  const glow = await G.page.evaluate(() => [window.__bugs.glowAlpha(0), window.__bugs.glowAlpha(0.5)]);
  check('glade: the glow pulses with motion on', glow[0] !== glow[1], JSON.stringify(glow));
  const jr = await G.page.evaluate(() => { window.__bugs.showJournal(); return { base: document.querySelectorAll('#journal-list [data-species]').length, glade: [...document.querySelectorAll('#glade-list [data-glade-species]')].map((d) => d.dataset.gladeSpecies).join() }; });
  check('glade: its bugs have their own journal list; the 7 base entries are unchanged', jr.base === 7 && jr.glade === 'firefly,glowmoth', JSON.stringify(jr));

  // ---------- access ----------
  const accSeed = Object.assign({ 'pixeltown-access-v1': JSON.stringify({ v: 1, hudScale: 1.5, flashes: false }) }, starsSeed);
  const A = await open(browser, accSeed);
  const ac = await A.page.evaluate(() => ({
    scale: getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim(), rm: document.documentElement.getAttribute('data-reduce-motion'),
    reduced: window.__bugs.reduced, glow: [window.__bugs.glowAlpha(0), window.__bugs.glowAlpha(0.5), window.__bugs.glowAlpha(1.3)], h1: parseFloat(getComputedStyle(document.querySelector('#top h1')).fontSize),
  }));
  check('access: MMSideAccess applies --ui-scale and data-reduce-motion from pixeltown-access-v1', ac.scale === '1.5' && ac.rm === '1', JSON.stringify(ac));
  check('access: the text-size pref scales page text', ac.h1 >= 22, String(ac.h1));
  check('access: reduce-motion pref -> page reduced and glade glow static', ac.reduced === true && ac.glow[0] === ac.glow[1] && ac.glow[1] === ac.glow[2], JSON.stringify(ac.glow));
  const shk = await A.page.evaluate(() => { const b = window.__bugs; b.start('meadow', { seed: 'r', empty: true }); b.spawn('ladybug', 10, 7); b.setPlayer(10, 7, true); b.swing(); b.step(0.05); return { s: b.shake, p: b.particles }; });
  check('access: reduce-motion pref -> no shake, no particles', shk.s === 0 && shk.p === 0, JSON.stringify(shk));
  check('access: the scaled page has no horizontal scroll at 390 px', await A.page.evaluate(() => { window.__bugs.menu(); return document.documentElement.scrollWidth <= innerWidth; }));

  // text >= 12 px and targets >= 44 px at 390x844 on menu, journal and summary
  const sizes = async (page) => page.evaluate(() => {
    const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 2 && r.height > 2 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
    const small = [], tiny = [];
    document.querySelectorAll('#overlay *, #top *, #hud *, #touch *').forEach((e) => {
      if (!vis(e)) return;
      const own = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (own && parseFloat(getComputedStyle(e).fontSize) < 12) small.push(e.tagName + ':' + e.textContent.slice(0, 20));
      if ((e.tagName === 'BUTTON' || e.tagName === 'A') && !e.classList.contains('mm-nav-legacy')) { const r = e.getBoundingClientRect(); if (r.width < 44 || r.height < 44) tiny.push(e.id || e.textContent.slice(0, 20)); }
    });
    return { small, tiny };
  });
  const D = await open(browser, starsSeed);
  const sm = await sizes(D.page);
  await D.page.evaluate(() => window.__bugs.showJournal());
  const sj = await sizes(D.page);
  await D.page.evaluate(() => { window.__bugs.start('glade', { seed: 'sz' }); window.__bugs.step(91); });
  const ss = await sizes(D.page);
  check('access: all text >= 12 px (menu, journal, summary)', [sm, sj, ss].every((x) => x.small.length === 0), JSON.stringify([sm.small, sj.small, ss.small]));
  check('access: all buttons and links >= 44 px (menu, journal, summary)', [sm, sj, ss].every((x) => x.tiny.length === 0), JSON.stringify([sm.tiny, sj.tiny, ss.tiny]));
  const legacy = await D.page.evaluate(() => {
    window.__bugs.menu();
    const ls = [...document.querySelectorAll('#top a.back'), document.getElementById('menu-back')];
    return { n: ls.filter(Boolean).length, tagged: ls.every((a) => a && a.classList.contains('mm-nav-legacy')), tiny: ls.every((a) => a.getBoundingClientRect().width <= 1), nav: !!document.querySelector('.mm-nav-btn, [class*=mm-nav]') };
  });
  check('access: the three back links are hidden behind mm-nav and stay in the DOM', legacy.n === 3 && legacy.tagged && legacy.tiny && legacy.nav, JSON.stringify(legacy));
  const touch = await D.page.evaluate(() => { window.__bugs.start('meadow', { seed: 't', empty: true }); return ['btn-swing', 'btn-sneak', 'joy'].every((id) => { const r = document.getElementById(id).getBoundingClientRect(); return r.width >= 44 && r.height >= 44; }); });
  check('access: touch controls >= 44 px at 390x844', touch);

  check('DB: 0 requests to the live database', all.every((o) => o.db.count() === 0), all.map((o) => o.db.count()).join());
  check('no console errors', all.every((o) => o.errors.length === 0), all.map((o) => o.errors.join(' | ')).filter(Boolean).join(' || '));
  await browser.close();
  done();
})();
