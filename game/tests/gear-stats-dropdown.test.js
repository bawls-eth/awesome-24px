// G13 (GEAR-DROPS-BUILD-PLAN): the backpack "Stats" drop-down. A 44 px toggle (aria-expanded) opens its own scrolling table of every
// _calcStats number as Total / Base / Gear (with ▲ / ▼ and an aria-label "Damage up ... from gear"), plus the equipped items; it is
// remembered for the browser session only (sessionStorage, never the save), fits a 390x844 phone with no horizontal scroll, and ?gear=0
// hides the gear-only rows. Offline: blockDb + every WebSocket closed, no chat, no Firebase writes.
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/gear-stats-dropdown.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const MAZE = ORIGIN + '/game/games/mad-maze/index.html?test=1&offline=1';
const SAVE = 'pixeltown-save-v1', MM = 'pixeltown-mm-v1', ACTIVE = 'pixeltown-mm-active-v1';
const hero = (id, cls, level) => ({ id, name: cls, cls, level, xp: 0, fame: 0, bonus: 0, mode: 'classic', items: [] });
const prof = (heroes) => ({ v: 1, heroes, stash: new Array(16).fill(null), fame: 0, mode: 'classic', hall: [], migratedFrom: null });
const realm = (level, items, eq) => ({ shards: 0, bestWave: 0, kills: 0, deaths: 0, kb: { spiral: 0, aimed: 0, ring: 0, drifter: 0, boss: 0 }, bossBestT: 0, level, xp: 0, items, nextUid: 100, eq });
// A bruiser (heavy armor) with a T12 epic Spark Wand and T10 heavy armor equipped.
const ITEMS = [{ n: 1, id: 'sparkwand', r: 3, t: 12 }, { n: 3, id: 'arm_heavy_paladin', r: 0, t: 10 }, { n: 5, id: 'heartcharm', r: 0 }];

async function open(browser, query, viewport) {
  const ctx = await browser.newContext({ viewport: viewport || { width: 1000, height: 700 }, hasTouch: !!(viewport && viewport.width < 500), isMobile: !!(viewport && viewport.width < 500) });
  const db = await blockDb(ctx);
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' }));
  await ctx.route('**/hub/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>hub</title>hub' }));
  await ctx.routeWebSocket(/.*/, (ws) => ws.close()); // never reach the live DB
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate(([k1, p, k2, a, k3, s]) => { localStorage.setItem(k1, JSON.stringify(p)); localStorage.setItem(k2, a); localStorage.setItem(k3, JSON.stringify({ realm: s })); },
    [MM, prof([hero('h-1', 'bruiser', 20)]), ACTIVE, JSON.stringify({ v: 1, heroId: 'h-1' }), SAVE, realm(20, ITEMS, { weapon: 1, armor: 3 })]);
  errors.length = 0;
  await page.goto(MAZE + (query || ''));
  await page.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena.active, null, { timeout: 15000 });
  await page.evaluate(() => { const a = window.__mm.arena; a.state = 'play'; a.eBullets.forEach((b) => { b.active = false; }); a.enemies.forEach((e) => { e.active = false; }); a._calcStats(); a.setPaused(true); });
  await page.click('#realm-bp-tab-stats'); // BP8: the Stats table lives on the backpack's Stats tab
  return { ctx, page, errors, db };
}
const box = (page) => page.evaluate(() => {
  const btn = document.getElementById('realm-bp-stats-toggle'); const bx = document.getElementById('realm-bp-stats-box');
  const r = btn ? btn.getBoundingClientRect() : null;
  const rows = bx ? Array.from(bx.querySelectorAll('tr[data-stat]')).map((tr) => ({ k: tr.dataset.stat, gear: tr.dataset.gear === '1', cells: Array.from(tr.querySelectorAll('td')).map((t) => t.textContent.trim()), lab: (tr.querySelector('td.gd') || {}).getAttribute ? tr.querySelector('td.gd').getAttribute('aria-label') : '' })) : [];
  const heads = bx ? Array.from(bx.querySelectorAll('thead th')).map((t) => t.textContent.trim()) : [];
  return { has: !!btn, h: r ? r.height : 0, w: r ? r.width : 0, exp: btn && btn.getAttribute('aria-expanded'), ctl: btn && btn.getAttribute('aria-controls'), hidden: bx ? bx.hidden : null, visible: bx ? bx.getBoundingClientRect().height > 0 : false, rows, heads,
    eq: bx ? Array.from(bx.querySelectorAll('.rm-stats-eq li')).map((l) => l.dataset.eqSlot + ':' + l.textContent.trim()) : [], icons: bx ? Array.from(bx.querySelectorAll('img.rm-gear-ico')).map((i) => i.getAttribute('src')) : [],
    ses: sessionStorage.getItem('pixeltown-bp-stats-open'), saveHas: /stats-open|bpStats/.test(localStorage.getItem('pixeltown-save-v1') || '') };
});

(async () => {
  const browser = await chromium.launch();
  const errs = [];

  // ---- desktop: closed by default, opens, every stat, total / base / gear, arrows, session memory ----
  { const A = await open(browser); const page = A.page;
    const c0 = await box(page);
    check('the backpack has a Stats toggle, collapsed by default (aria-expanded=false, region hidden, aria-controls set)', c0.has && c0.exp === 'false' && c0.hidden === true && !c0.visible && c0.ctl === 'realm-bp-stats-box', JSON.stringify(c0));
    check('the toggle is at least 44 px tall and wide', c0.h >= 44 && c0.w >= 44, JSON.stringify({ h: c0.h, w: c0.w }));
    await page.click('#realm-bp-stats-toggle');
    const c1 = await box(page);
    const keys = c1.rows.map((r) => r.k);
    const need = ['dmg', 'crit', 'status', 'splashR', 'splashFrac', 'resist', 'guard', 'maxHp', 'speed', 'leech', 'regen', 'reach', 'pierce', 'rate'];
    check('a click opens it (aria-expanded=true, region shown)', c1.exp === 'true' && c1.hidden === false && c1.visible, JSON.stringify({ exp: c1.exp, hidden: c1.hidden }));
    check('Total / Base / Gear headers and a row for every _calcStats stat (damage, crit, status, splash radius + share, resist, guard, HP, speed, leech, regen, reach, pierce)', c1.heads.join('|') === 'Stat|Total|Base|Gear' && need.every((k) => keys.indexOf(k) >= 0), JSON.stringify({ heads: c1.heads, keys }));
    const ex = await page.evaluate(() => { const a = window.__mm.arena; const t = a._calcStats({ eqOverride: {} }), b = a._calcStats({ noGear: true }); return { tDmg: Math.round(t.dmg * 10) / 10, bDmg: Math.round(b.dmg * 10) / 10, tHp: t.maxHp, bHp: b.maxHp, tG: t.guard, bG: b.guard }; });
    const row = (k) => c1.rows.find((r) => r.k === k) || { cells: [], lab: '' };
    check('Damage row: total and base match _calcStats (with / without gear) and the gear cell shows ▲ with "Damage up ... from gear"', row('dmg').cells[0] === String(ex.tDmg) && row('dmg').cells[1] === String(ex.bDmg) && ex.tDmg > ex.bDmg && /^▲ \+/.test(row('dmg').cells[2]) && /^Damage up [\d.]+ from gear$/.test(row('dmg').lab), JSON.stringify({ r: row('dmg'), ex }));
    check('Guard and Max HP rows show the armor gain (total > base, ▲)', Number(row('guard').cells[0]) === Math.round(ex.tG * 10) / 10 && ex.tG > ex.bG && /^▲/.test(row('guard').cells[2]) && Number(row('maxHp').cells[0]) === ex.tHp && ex.tHp > ex.bHp && /^▲ \+\d+$/.test(row('maxHp').cells[2]), JSON.stringify({ g: row('guard'), hp: row('maxHp'), ex }));
    check('a stat gear does not touch shows "– 0" and "no change from gear"', /^– 0$/.test(row('leech').cells[2]) && /no change from gear$/.test(row('leech').lab), JSON.stringify(row('leech')));
    check('the equipped items summary lists the T12 wand and the T10 armor (by slot)', c1.eq.some((t) => /^weapon:.*T12.*Spark Wand/.test(t)) && c1.eq.some((t) => /^armor:.*T10/.test(t)) && c1.eq.some((t) => /^charm:.*empty/.test(t)), JSON.stringify(c1.eq));
    check('rows carry the b29 stat icons (crit, splash, resist, leech, regen, range)', ['crit', 'splash', 'resist', 'leech', 'regen', 'range'].every((k) => c1.icons.some((s) => s.indexOf('b29-gear-tiers/ui/ui_stat_' + k + '.png') >= 0)), JSON.stringify(c1.icons));
    check('open state is remembered in sessionStorage only (not in the save)', c1.ses === '1' && c1.saveHas === false, JSON.stringify({ ses: c1.ses, saveHas: c1.saveHas }));
    await page.evaluate(() => { const a = window.__mm.arena; a.setPaused(false); a.setPaused(true); a.renderBackpack(); });
    const c2 = await box(page);
    check('re-opening the backpack keeps it open this session', c2.exp === 'true' && c2.visible, JSON.stringify({ exp: c2.exp }));
    await page.keyboard.press('Tab'); // keyboard: the toggle is a real button
    await page.focus('#realm-bp-stats-toggle'); await page.keyboard.press('Enter');
    const c3 = await box(page);
    check('Enter on the focused toggle collapses it again (aria-expanded=false, sessionStorage "0")', c3.exp === 'false' && c3.hidden === true && c3.ses === '0', JSON.stringify({ exp: c3.exp, ses: c3.ses }));
    check('no DB traffic (blockDb)', A.db.attempts() === 0, JSON.stringify({ http: A.db.http, ws: A.db.ws }));
    errs.push(...A.errors); await A.ctx.close(); }

  // ---- phone 390x844: readable, own scroll, no horizontal page scroll, no overlap ----
  { const P = await open(browser, '', { width: 390, height: 844 }); const page = P.page;
    await page.click('#realm-bp-stats-toggle');
    const m = await page.evaluate(() => {
      const bx = document.getElementById('realm-bp-stats-box'); const btn = document.getElementById('realm-bp-stats-toggle'); const card = bx.closest('.realm-bp-card') || document.body;
      const tb = btn.getBoundingClientRect(), br = bx.getBoundingClientRect(), cr = card.getBoundingClientRect();
      const tbl = bx.querySelector('table').getBoundingClientRect();
      const fs = parseFloat(getComputedStyle(bx.querySelector('td')).fontSize);
      const oy = getComputedStyle(bx).overflowY;
      return { docW: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth, boxSW: bx.scrollWidth, boxCW: bx.clientWidth, cardSW: card.scrollWidth, cardCW: card.clientWidth, btnBottom: tb.bottom, boxTop: br.top, boxH: br.height, vh: innerHeight, tblR: tbl.right, cardR: cr.right, fs, oy, btnH: tb.height };
    });
    check('phone: no horizontal scroll (page, backpack card, stats box)', m.docW <= m.vw && m.boxSW <= m.boxCW && m.cardSW <= m.cardCW, JSON.stringify(m));
    check('phone: the stats box has its own vertical scroll and stays under half the screen', (m.oy === 'auto' || m.oy === 'scroll') && m.boxH > 40 && m.boxH <= m.vh * 0.46, JSON.stringify(m));
    check('phone: the toggle (>= 44 px) sits above the box with no overlap; the table fits the card; text >= 12 px', m.btnH >= 44 && m.boxTop >= m.btnBottom - 0.5 && m.tblR <= m.cardR + 0.5 && m.fs >= 12, JSON.stringify(m));
    errs.push(...P.errors); await P.ctx.close(); }

  // ---- ?gear=0: the gear-only rows are gone, the classic ones stay ----
  { const G = await open(browser, '&gear=0'); const page = G.page;
    await page.click('#realm-bp-stats-toggle');
    const g = await box(page); const keys = g.rows.map((r) => r.k);
    check('?gear=0 hides every gear row (crit, status, splash, resist, guard, leech, regen, reach, pierce) and keeps HP / damage / rate / speed', ['crit', 'status', 'splashR', 'splashFrac', 'resist', 'guard', 'leech', 'regen', 'reach', 'pierce'].every((k) => keys.indexOf(k) < 0) && ['maxHp', 'dmg', 'rate', 'speed'].every((k) => keys.indexOf(k) >= 0) && g.rows.every((r) => !r.gear), JSON.stringify(keys));
    errs.push(...G.errors); await G.ctx.close(); }

  check('no page or console errors', errs.length === 0, errs.join(' | '));
  await browser.close();
  done();
})();
