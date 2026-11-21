// Lantern 'Abilities and unlocks' viewer. Serve the repo root first:  python3 -m http.server 8555 &
// Run: BASE=http://localhost:8555/game/index.html NODE_PATH=$(npm root -g) node game/tests/lantern-unlocks.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const MM = 'pixeltown-mm-v1';
const hero = (o) => Object.assign({ id: 'h1', name: 'Tester', cls: 'ranger', level: 1, xp: 0, fame: 0, bonus: 0, mode: 'classic', items: [] }, o);

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate(([K, v]) => localStorage.setItem(K, v), [MM, JSON.stringify({ v: 1, heroes: [hero({ id: 'h-rog', name: 'Rowan', cls: 'rogue', level: 10 }), hero({ id: 'h-ran', name: '<b>Ria</b>', cls: 'ranger', level: 2 })] })]);
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.html?test=1');
  await page.waitForSelector('#heroes li');

  const btn = page.locator('#heroes li[data-hero="h-rog"] .abil');
  const bb = await btn.boundingBox();
  check('Abilities button exists on each hero card and is at least 44 px', (await page.locator('#heroes .abil').count()) === 2 && bb.height >= 44 && bb.width >= 44, JSON.stringify(bb));
  check('panel is hidden until opened', await page.isHidden('#abil-panel'));

  await btn.click();
  await page.waitForSelector('#abil-panel:not([hidden])');
  const st = async () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#abil-nodes li')].map((li) => [li.getAttribute('data-node'), li.getAttribute('data-state') + '|' + li.querySelector('.tag').textContent])));
  let nodes = await st();
  check('rogue L10: L4 and L9 reached, L14/L19 locked, Nova II (L11) and Dash II (L16) locked',
    /^reached/.test(nodes.rogue_4) && /^reached/.test(nodes.rogue_9) && nodes.rogue_14 === 'locked|Unlocks at level 14' && nodes.rogue_19 === 'locked|Unlocks at level 19' && nodes.nova2_11 === 'locked|Unlocks at level 11' && nodes.dash2_16 === 'locked|Unlocks at level 16', JSON.stringify(nodes));
  check('all six nodes listed', Object.keys(nodes).length === 6);
  const slots = await page.locator('#abil-slots li').allTextContents();
  check('slots Q/E/R/F with gates and cooldowns', slots.length === 4 && /^Q: Dash.*level 1.*cooldown 3 s/.test(slots[0]) && /^E: Nova.*cooldown 8 s/.test(slots[1]) && /^R: Shield.*cooldown 14 s/.test(slots[2]) && /^F:.*level 7.*cooldown 10 s/.test(slots[3]), slots.join(' | '));
  const states = await page.evaluate(() => [...document.querySelectorAll('#abil-slots li')].map((li) => li.classList.contains('reached')));
  check('rogue L10 has all four slots ready', states.every(Boolean), JSON.stringify(states));
  const nxt = await page.textContent('#abil-next');
  check('next-unlock text: Nova II at level 11 (1 more level)', /Next: Nova II at level 11 \(1 more level\)/.test(nxt), nxt);
  check('progress bar is within 0-100 and above 0', await page.evaluate(() => { const b = document.querySelector('#abil-next [role=progressbar]'); const v = +b.getAttribute('aria-valuenow'); return v > 0 && v <= 100; }));
  const fire = await page.textContent('#abil-fire').catch(() => '');
  check('fire pattern summary from MMWeapons.describe is shown', /\d+ \w+/.test(fire) && /range \d+ px/.test(fire), fire);
  const lay = await page.evaluate(() => { const s = document.querySelector('#abil-panel .sheet').getBoundingClientRect(), b = document.getElementById('abil-body'); return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, within: s.bottom <= innerHeight + 1 && s.right <= innerWidth + 1 && s.left >= -1, bodyOverflowX: b.scrollWidth > b.clientWidth, close: document.getElementById('abil-close').getBoundingClientRect().height }; });
  check('390x844: no horizontal scroll, panel inside the viewport, Close >= 44 px', lay.sw <= lay.cw && lay.within && !lay.bodyOverflowX && lay.close >= 44, JSON.stringify(lay));
  check('focus moved to Close', await page.evaluate(() => document.activeElement.id === 'abil-close'));
  await page.keyboard.press('Escape');
  check('Esc closes the panel and returns focus to the Abilities button', (await page.isHidden('#abil-panel')) && (await page.evaluate(() => document.activeElement.classList.contains('abil'))));

  await page.locator('#heroes li[data-hero="h-ran"] .abil').click();
  await page.waitForSelector('#abil-panel:not([hidden])');
  nodes = await st();
  check('ranger L2: every node locked', Object.values(nodes).every((v) => /^locked\|Unlocks at level \d+$/.test(v)) && nodes.ranger_4 === 'locked|Unlocks at level 4', JSON.stringify(nodes));
  const slots2 = await page.evaluate(() => [...document.querySelectorAll('#abil-slots li')].map((li) => li.classList.contains('reached')));
  check('ranger L2: Q ready, E/R/F locked', JSON.stringify(slots2) === '[true,false,false,false]', JSON.stringify(slots2));
  const nxt2 = await page.textContent('#abil-next');
  check('ranger L2 next unlock is Keen Eye at level 4 (2 more levels)', /Next: Keen Eye at level 4 \(2 more levels\)/.test(nxt2), nxt2);
  const title = await page.textContent('#abil-title');
  check('hostile hero name is text only (no injected elements)', title.includes('<b>Ria</b>') && (await page.locator('#abil-title b').count()) === 0, title);
  await page.click('#abil-close');
  check('Close button closes the panel', await page.isHidden('#abil-panel'));
  const rm = await page.evaluate(() => [...document.styleSheets].some((s) => [...s.cssRules].some((r) => r.media && /reduce/.test(r.media.mediaText))));
  check('reduce-motion rule present', rm);
  check('no console errors', errors.length === 0, errors.join());
  await browser.close();
  done();
})();
