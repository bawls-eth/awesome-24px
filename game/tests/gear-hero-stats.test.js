// G14: hero panel "Gear stats" group (Total / base / gear with arrows + aria) and the calm "Boss luck" row.
// Run: BASE=http://localhost:8704/game/index.html NODE_PATH=$(npm root -g) node game/tests/gear-hero-stats.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&offline=1&heropick=1';
const MM = 'pixeltown-mm-v1', ACTIVE = 'pixeltown-mm-active-v1';
const hero = (id, name, cls, level) => ({ id, name, cls, level, xp: 0, fame: 0, bonus: 0, mode: 'classic', items: [] });
const prof = (heroes) => ({ v: 1, heroes, stash: new Array(16).fill(null), fame: 0, mode: 'classic', hall: [], migratedFrom: null });
const SAVE = { realm: { level: 4, xp: 0, shards: 50, bestWave: 2, items: [{ n: 1, id: 'sparkwand', r: 1 }], nextUid: 2, eq: { weapon: 1 } } };

async function open(browser, viewport) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate(([k1, p, k2, a, sv]) => { localStorage.clear(); localStorage.setItem(k1, JSON.stringify(p)); localStorage.setItem(k2, a); localStorage.setItem('pixeltown-save-v1', sv); }, [MM, prof([hero('h-ranger', 'Aya', 'ranger', 3)]), ACTIVE, JSON.stringify({ v: 1, heroId: 'h-ranger' }), JSON.stringify(SAVE)]);
  await page.goto(WORLD);
  await page.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.world);
  return { ctx, page, errors };
}
async function statsTab(pg) {
  await pg.evaluate(() => { const a = window.__mm.arena; if (!a.openHeroPanel('stats')) throw new Error('hero panel did not open'); a.onHeroPanel('stats'); });
  await pg.waitForSelector('#realm-hero .hp-tab[data-tab="stats"].on');
}
const rowsOf = (pg) => pg.evaluate(() => {
  const out = []; let grp = '';
  document.querySelectorAll('#realm-hero .hp-body > *').forEach((n) => {
    if (n.tagName === 'H3') grp = n.textContent;
    else n.querySelectorAll('.realm-board-row').forEach((r) => out.push({ grp, label: r.firstChild.textContent, value: r.lastChild.textContent, aria: r.lastChild.getAttribute('aria-label') || '', dir: r.dataset.gear || '' }));
  });
  return out;
});

(async () => {
  const browser = await chromium.launch();
  const A = await open(browser, { width: 1000, height: 700 });
  let pg = A.page;
  // Expose a base (no-gear) block and a pity counter on the arena, as G8 does; the panel must also work without them.
  await pg.evaluate(() => { const a = window.__mm.arena; a.statsBase = Object.assign({}, a.stats, { dmg: a.stats.dmg - 0.5, guard: 0, maxHp: a.stats.maxHp - 10 }); a.save.gp = { b: 14, d: 3 }; });
  await statsTab(pg);
  let rows = await rowsOf(pg);
  const g = rows.filter((r) => r.grp === 'Gear stats');
  const dmg = g.find((r) => r.label === 'Damage per bolt'), luck = g.find((r) => r.label === 'Boss luck');
  check('Gear stats group is shown with several rows', g.length >= 5 && g.some((r) => r.label === 'HP'), JSON.stringify(g.map((r) => r.label)));
  check('damage row has total, base and gear text with an up arrow', !!dmg && /^▲ /.test(dmg.value) && /base/.test(dmg.value) && /gear \+0\.5/.test(dmg.value), dmg && dmg.value);
  check('each stat row carries aria text (Damage: total / base / gear plus)', !!dmg && /Damage: total .*base .*gear plus/.test(dmg.aria) && g.filter((r) => r.label !== 'Boss luck').every((r) => r.aria.length > 8), dmg && dmg.aria);
  check('Boss luck row matches gp (14 kills = +7%, 46 kills left) and is calm', !!luck && /^\+7% \(T12 guaranteed in 46 kills\)$/.test(luck.value) && !/hurry|now|last chance|limited/i.test(luck.value), luck && luck.value);
  check('no underscores or markup in the panel text', rows.every((r) => !/_/.test(r.value) && !/[<>]/.test(r.value)));

  // Graceful degrade: no statsBase and no gp on the arena -> the group falls back to totals, no Boss luck row.
  await pg.evaluate(() => { const a = window.__mm.arena; delete a.statsBase; delete a.save.gp; const orig = a._calcStats; a._calcStats = function () { return orig.apply(this, arguments); }; }); // arity 0 = an arena that does not expose the G8 noGear stats (the real arena now does, and its base correctly includes the hero-scale multiplier, so the panel would show a real gear delta)
  await statsTab(pg);
  rows = await rowsOf(pg);
  await pg.evaluate(() => { delete window.__mm.arena._calcStats; });
  const g2 = rows.filter((r) => r.grp === 'Gear stats');
  check('without arena exposure the group still renders from stats', g2.length >= 5 && !g2.some((r) => r.label === 'Boss luck') && g2.every((r) => /gear 0/.test(r.value)), JSON.stringify(g2.slice(0, 2)));
  check('desktop: no console errors', A.errors.length === 0, A.errors.join('|'));
  await A.ctx.close();

  // Phone 390x844
  const B = await open(browser, { width: 390, height: 844 });
  pg = B.page;
  await pg.evaluate(() => { const a = window.__mm.arena; a.statsBase = Object.assign({}, a.stats, { dmg: a.stats.dmg - 0.5 }); a.save.gp = { b: 59, d: 0 }; });
  await statsTab(pg);
  const m = await pg.evaluate(() => {
    const body = document.querySelector('#realm-hero .hp-body'), de = document.documentElement;
    const tiny = [...document.querySelectorAll('#realm-hero button')].filter((b) => b.offsetParent && (b.getBoundingClientRect().width < 43.5 || b.getBoundingClientRect().height < 43.5)).map((b) => b.textContent.slice(0, 12) + ':' + Math.round(b.getBoundingClientRect().width) + 'x' + Math.round(b.getBoundingClientRect().height));
    return { docOver: de.scrollWidth > de.clientWidth, bodyOver: body.scrollWidth > body.clientWidth + 1, tiny, text: body.textContent };
  });
  check('phone 390x844: no horizontal scroll in the stats panel', !m.docOver && !m.bodyOver, JSON.stringify([m.docOver, m.bodyOver]));
  check('phone: every panel button is at least 44x44', m.tiny.length === 0, m.tiny.join(','));
  check('phone: Boss luck singular wording at 59 kills', /\+10% \(T12 guaranteed in 1 kill\)/.test(m.text), m.text.slice(0, 80));
  check('phone: no console errors', B.errors.length === 0, B.errors.join('|'));
  await B.ctx.close();
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
