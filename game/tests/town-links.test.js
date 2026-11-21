// Town links: Mad Maze gate button, World map link, ?from=hub back pill + empty-only prefill.
const { chromium } = require('playwright');
const { launch, scene, check, done, expandPanel } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const rect = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, vis: getComputedStyle(e).display !== 'none' }; }, sel);
const overlap = (a, b) => a && b && a.vis && b.vis && a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;

(async () => {
  // Phone, in town.
  const { browser, page, errors } = await launch({ width: 390, height: 844 }, null, true);
  const saveBefore = await page.evaluate(() => localStorage.getItem('pixeltown-save-v1'));
  await expandPanel(page);
  const link = await page.evaluate(() => { const a = document.getElementById('world-map-link'); return a && { href: a.getAttribute('href'), tag: a.tagName, text: a.textContent }; });
  check('World map link exists with href ./hub/index.html', link && link.tag === 'A' && link.href === './hub/index.html', JSON.stringify(link));
  const wm = await rect(page, '#world-map-link');
  const hits = [];
  for (const s of ['#joystick', '#action-buttons', '#interact-btn', '#chat-panel']) if (overlap(wm, await rect(page, s))) hits.push(s);
  check('World map link is visible when the panel is open at 390x844', wm && wm.vis && wm.w > 0);
  check('World map link overlaps no joystick / A button / chat at 390x844', hits.length === 0, JSON.stringify([hits, wm]));
  const pillHidden = await page.evaluate(() => document.getElementById('back-to-map-pill').classList.contains('hidden'));
  check('no Back pill without ?from=hub', pillHidden);

  // Gate menu.
  await page.evaluate(() => { window.__confirms = []; window.confirm = (m) => { window.__confirms.push(m); return false; }; });
  await scene(page, (s) => { s.realmMenuOpen = false; s.inRealm = false; s.inUnderground = false; s.openRealmGateMenu(); });
  const gate = await page.evaluate(() => ({ open: !document.getElementById('realm-menu').classList.contains('hidden'), mm: document.getElementById('realm-menu-madmaze').dataset.href, text: document.getElementById('realm-menu-madmaze').textContent, solo: !!document.getElementById('realm-menu-solo'), players: !!document.getElementById('realm-menu-players') }));
  check('gate menu opens the unified Realm overworld', gate.open && gate.mm === './games/mad-maze/index.html?mode=world' && /Enter the Realm/.test(gate.text), JSON.stringify(gate));
  await page.click('#realm-menu-madmaze');
  const cf = await page.evaluate(() => ({ c: window.__confirms, url: location.href }));
  check('clicking asks a confirm mentioning shared progress and the town closing', cf.c.length === 1 && /progress is shared/.test(cf.c[0]) && /town will close/.test(cf.c[0]), JSON.stringify(cf));
  check('declining the confirm stays in town', /\/game\/index\.html/.test(cf.url));
  check('Go in alone and co-op/duel/2v2 list still present', gate.solo && gate.players);
  await page.click('#realm-menu-solo');
  await page.waitForTimeout(1500);
  const inRealm = await scene(page, (s) => !!s.inRealm);
  check('Go in alone still enters the Realm', inRealm === true);
  const saveAfter = await page.evaluate(() => localStorage.getItem('pixeltown-save-v1'));
  check('pixeltown-save-v1 only has normal join data (name unchanged)', saveBefore === saveAfter || JSON.parse(saveAfter).name === 'ADMINtest');
  check('no console errors (town + gate)', errors.length === 0, errors.join(' | '));
  await browser.close();

  // ?from=hub with profile + empty fields.
  const b2 = await chromium.launch();
  const mk = async (init, url) => {
    const ctx = await b2.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', (e) => errs.push(e.message));
    await p.addInitScript(init);
    await p.goto(url);
    return { p, errs };
  };
  const prof = JSON.stringify({ v: 1, id: 'p_x', name: 'Hubby', species: 'coolcats', frame: 2, map: { at: 'w0-square', world: 'w0', seenPaths: [] } });
  const A = await mk(`localStorage.setItem('pixeltown-profile-v1', ${JSON.stringify(prof)})`, BASE + '?from=hub');
  const a = await A.p.evaluate(() => ({ pill: !document.getElementById('back-to-map-pill').classList.contains('hidden'), href: document.getElementById('back-to-map-pill').getAttribute('href'), name: document.getElementById('name-input').value, dis: document.getElementById('join-btn').disabled, save: localStorage.getItem('pixeltown-save-v1') }));
  check('?from=hub shows the Back to the map pill linking ./hub/index.html', a.pill && a.href === './hub/index.html', JSON.stringify(a));
  check('?from=hub prefills an empty name from the profile', a.name === 'Hubby', JSON.stringify(a));
  check('prefill does not create pixeltown-save-v1', a.save === null);
  const b = await mk(`localStorage.setItem('pixeltown-profile-v1', ${JSON.stringify(prof)}); localStorage.setItem('pixeltown-save-v1', JSON.stringify({name:'Mine',species:'coolcats',frame:1}))`, BASE + '?from=hub');
  check('a filled (saved) name is not overwritten', (await b.p.evaluate(() => document.getElementById('name-input').value)) === 'Mine');
  const c = await mk('1', BASE);
  const cc = await c.p.evaluate(() => ({ pill: document.getElementById('back-to-map-pill').classList.contains('hidden'), name: document.getElementById('name-input').value }));
  check('without ?from=hub: no pill, no prefill', cc.pill && cc.name === '');
  const d = await mk('1', BASE + '?from=hub');
  check('?from=hub with no profile leaves the form empty', (await d.p.evaluate(() => document.getElementById('name-input').value)) === '');
  check('join heading says Hearthvale', (await d.p.textContent('.join-card h1')).includes('Hearthvale'));
  check('no page errors on the join screen', [A, b, c, d].every((x) => x.errs.length === 0));
  // Opus review: the Back pill is for the join screen only (it must not cover the inventory bar once you are in town)
  await d.p.fill('#name-input', 'ADMINpill'); await d.p.click('.species-tab'); await d.p.waitForTimeout(150); await d.p.click('.avatar-choice'); await d.p.click('#join-btn');
  await d.p.waitForSelector('#player-list-panel', { timeout: 20000 }); await d.p.waitForTimeout(500);
  check('after joining the Back to the map pill is hidden', await d.p.evaluate(() => document.getElementById('back-to-map-pill').classList.contains('hidden')));
  await b2.close();
  done();
})();
