// RE3: the T12 chase + relic book UI on the Realm arena. The backpack ends with a "Relic book" section (MMEndgame.relicBook: the six
// godland relics, found or "not yet", friendly names, no countdown); the Stats drop-down starts with a calm pity line that matches
// MMEndgame.chase ("N of 60 toward a sure T12"); a picked-up item that beats the best tier held shows a gentle "New best tier" toast.
// ?chase=0 hides all three. Phone 390x844: 44 px targets, no horizontal scroll. Offline: blockDb + every WebSocket closed.
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/realm-chase-ui.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const MAZE = ORIGIN + '/game/games/mad-maze/index.html?test=1&offline=1';
const SAVE = 'pixeltown-save-v1', MM = 'pixeltown-mm-v1', ACTIVE = 'pixeltown-mm-active-v1';
const hero = (id, cls, level) => ({ id, name: cls, cls, level, xp: 0, fame: 0, bonus: 0, mode: 'classic', items: [] });
const prof = (heroes) => ({ v: 1, heroes, stash: new Array(16).fill(null), fame: 0, mode: 'classic', hall: [], migratedFrom: null });
const realm = (level, items, eq, gp) => ({ shards: 0, bestWave: 0, kills: 0, deaths: 0, kb: { spiral: 0, aimed: 0, ring: 0, drifter: 0, boss: 0 }, bossBestT: 0, level, xp: 0, items, nextUid: 100, eq, gv: 1, gp });
// two relics held (Dread Plate, Hydra Fang), a T9 wand equipped; boss pity at 12 (the World save keeps gp.b), crypt pity 3 (this save keeps gp.d)
const ITEMS = [{ n: 1, id: 'sparkwand', r: 1, t: 9 }, { n: 2, id: 'arm_sig_dread', r: 0, t: 12 }, { n: 4, id: 'arm_sig_hydra', r: 0, t: 12 }, { n: 5, id: 'heartcharm', r: 0 }];

async function open(browser, query, viewport, items, gp) {
  const ctx = await browser.newContext({ viewport: viewport || { width: 1000, height: 700 }, hasTouch: !!(viewport && viewport.width < 500), isMobile: !!(viewport && viewport.width < 500) });
  const db = await blockDb(ctx);
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' }));
  await ctx.route('**/hub/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>hub</title>hub' }));
  await ctx.routeWebSocket(/.*/, (ws) => ws.close());
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate(([k1, p, k2, a, k3, s, w]) => { localStorage.setItem(k1, JSON.stringify(p)); localStorage.setItem(k2, a); localStorage.setItem(k3, JSON.stringify({ realm: s })); localStorage.setItem('pixeltown-realm-v1', JSON.stringify(w)); },
    [MM, prof([hero('h-1', 'ranger', 20)]), ACTIVE, JSON.stringify({ v: 1, heroId: 'h-1' }), SAVE, realm(20, items || ITEMS, { weapon: 1 }, { b: 0, d: (gp || { d: 3 }).d }), { gp: { b: (gp || { b: 12 }).b, d: 0 } }]);
  errors.length = 0;
  await page.goto(MAZE + (query || ''));
  await page.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena.active, null, { timeout: 15000 });
  await page.evaluate(() => { const a = window.__mm.arena; a.state = 'play'; a.eBullets.forEach((b) => { b.active = false; }); a.enemies.forEach((e) => { e.active = false; }); a._calcStats(); a.setPaused(true); });
  return { ctx, page, errors, db };
}
const view = (page) => page.evaluate(() => {
  const q = (s) => document.querySelector(s);
  const tg = q('#realm-bp-relic-toggle'), bx = q('#realm-bp-relic-box'), ch = q('#realm-bp-chase');
  const r = tg ? tg.getBoundingClientRect() : null;
  return { has: !!tg, exp: tg && tg.getAttribute('aria-expanded'), label: tg ? tg.textContent : '', h: r ? r.height : 0, w: r ? r.width : 0, hidden: bx ? bx.hidden : null,
    rows: bx ? Array.from(bx.querySelectorAll('li[data-relic]')).map((li) => ({ id: li.dataset.relic, found: li.dataset.found === '1', text: li.textContent })) : [],
    hint: bx && bx.querySelector('.hint') ? bx.querySelector('.hint').textContent : '', chase: ch ? ch.textContent : null,
    allText: (q('#realm-backpack-body') || document.body).textContent };
});

(async () => {
  const browser = await chromium.launch();
  const errs = [];

  // ---- desktop: relic book, pity line, toast ----
  { const A = await open(browser); const page = A.page;
    const v0 = await view(page);
    check('the backpack has a Relic book toggle (44 px, collapsed by default) labelled "2 of 6 relics found"', v0.has && v0.exp === 'false' && v0.hidden === true && v0.h >= 44 && v0.w >= 44 && /Relic book · 2 of 6 relics found/.test(v0.label), JSON.stringify(v0));
    await page.click('#realm-bp-relic-toggle');
    const v1 = await view(page);
    const exp = await page.evaluate(() => MMEndgame.relicBook({ items: window.__mm.arena.save.items }));
    check('opening it lists 6 entries in MMEndgame.relicBook order, found ones by name, missing ones as "Not yet"', v1.exp === 'true' && v1.hidden === false && v1.rows.length === 6
      && v1.rows.map((r) => r.id).join() === exp.entries.map((e) => e.id).join() && v1.rows.filter((r) => r.found).map((r) => r.id).sort().join() === 'arm_sig_dread,arm_sig_hydra'
      && v1.rows.find((r) => r.id === 'arm_sig_dread').text.indexOf('Dread Plate (Dread Knight)') >= 0 && v1.rows.find((r) => r.id === 'arm_sig_oracle').text.indexOf('Not yet: Void Oracle relic') >= 0, JSON.stringify(v1.rows));
    check('the relic book text is calm: no countdown, timer or urgency words', !/(\d+\s*(s|sec|min|hours?|days?)\b|left|hurry|expires|last chance|streak|missed)/i.test(v1.rows.map((r) => r.text).join(' ') + ' ' + v1.hint + ' ' + v1.label), JSON.stringify(v1));
    await page.click('#realm-bp-stats-toggle');
    const v2 = await view(page);
    const c = await page.evaluate(() => MMEndgame.chase({ gp: { b: 12, d: 3 }, items: window.__mm.arena.save.items }));
    check('the Stats drop-down starts with the pity line from MMEndgame.chase ("12 of 60 toward a sure T12": boss pity from the World save, crypt pity from this save)', !!v2.chase && v2.chase.indexOf(c.text) >= 0 && c.text === '12 of 60 toward a sure T12' && v2.chase.indexOf(c.luckText) >= 0 && JSON.stringify(await page.evaluate(() => window.__mm.arena.chaseGp())) === '{"b":12,"d":3}', JSON.stringify({ chase: v2.chase, c: c.text }));
    check('the pity line is the first thing in the Stats box', await page.evaluate(() => document.getElementById('realm-bp-stats-box').firstElementChild.id === 'realm-bp-chase'));
    errs.push(...A.errors); await A.ctx.close(); // toast below: a T10 pick-up beats the T9 best (relics are T12, so a save without them)
  }
  { const T = await open(browser, '', null, [{ n: 1, id: 'sparkwand', r: 1, t: 9 }]); const page = T.page;
    const t1 = await page.evaluate(() => { const a = window.__mm.arena; a.collectItem('sparkwand', 0, { t: 7 }); const el = document.getElementById('realm-chase-toast'); return { last: a.lastChaseToast || '', shown: !!(el && !el.hidden) }; });
    check('a lower-tier pick-up (T7 under a T9 best) shows no toast', t1.last === '' && !t1.shown, JSON.stringify(t1));
    const t2 = await page.evaluate(() => { const a = window.__mm.arena; a.collectItem('sparkwand', 0, { t: 10 }); const el = document.getElementById('realm-chase-toast'); const x = el && el.querySelector('button'); const r = x ? x.getBoundingClientRect() : null;
      return { last: a.lastChaseToast || '', shown: !!(el && !el.hidden), text: el ? el.textContent : '', role: el && el.getAttribute('role'), xw: r ? r.width : 0, xh: r ? r.height : 0 }; });
    check('a T10 pick-up shows a gentle "New best tier: T10" toast (role=status, 44 px dismiss)', /^New best tier: T10/.test(t2.last) && t2.shown && t2.role === 'status' && t2.xw >= 44 && t2.xh >= 44 && !/hurry|now!|left/i.test(t2.text), JSON.stringify(t2));
    await page.click('#realm-chase-toast button');
    check('the toast dismisses on its button', await page.evaluate(() => document.getElementById('realm-chase-toast').hidden === true));
    const sv = await page.evaluate(() => JSON.parse(localStorage.getItem('pixeltown-save-v1')).realm);
    check('the chase UI adds no save keys (read-only)', Object.keys(sv).every((k) => !/chase|relic|besttier/i.test(k)) && sv.items.length === 3, JSON.stringify(Object.keys(sv)));
    check('no DB traffic (blockDb)', T.db.attempts() === 0, JSON.stringify({ http: T.db.http, ws: T.db.ws }));
    errs.push(...T.errors); await T.ctx.close(); }

  // ---- hostile World save: the pity line falls back to 0, no error ----
  { const H = await open(browser); const page = H.page;
    await page.evaluate(() => { localStorage.setItem('pixeltown-realm-v1', '{"gp":{"b":"__proto__"}}x'); });
    await page.click('#realm-bp-stats-toggle');
    const v = await view(page);
    check('a broken World save reads as 0 of 60 (no throw)', !!v.chase && v.chase.indexOf('0 of 60 toward a sure T12') >= 0, JSON.stringify(v.chase));
    errs.push(...H.errors); await H.ctx.close(); }

  // ---- phone 390x844 ----
  { const P = await open(browser, '', { width: 390, height: 844 }); const page = P.page;
    await page.click('#realm-bp-relic-toggle');
    const m = await page.evaluate(() => { const tg = document.getElementById('realm-bp-relic-toggle'); const card = tg.closest('.realm-bp-card') || document.body; const r = tg.getBoundingClientRect();
      const li = document.querySelector('#realm-bp-relic-box li'); return { docW: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth, cardSW: card.scrollWidth, cardCW: card.clientWidth, h: r.height, fs: parseFloat(getComputedStyle(li).fontSize) }; });
    check('phone: relic toggle >= 44 px, text >= 12 px, no horizontal scroll', m.h >= 44 && m.fs >= 12 && m.docW <= m.vw && m.cardSW <= m.cardCW, JSON.stringify(m));
    errs.push(...P.errors); await P.ctx.close(); }

  // ---- ?chase=0 hides both + no toast ----
  { const O = await open(browser, '&chase=0', null, [{ n: 1, id: 'sparkwand', r: 1, t: 9 }, { n: 2, id: 'arm_sig_dread', r: 0, t: 12 }]); const page = O.page;
    await page.click('#realm-bp-stats-toggle');
    const v = await view(page);
    const t = await page.evaluate(() => { const a = window.__mm.arena; a.collectItem('sparkwand', 0, { t: 12 }); return { last: a.lastChaseToast || '', el: !!document.getElementById('realm-chase-toast') }; });
    check('?chase=0 hides the relic book, the pity line and the toast (the Stats box itself stays)', !v.has && v.chase === null && !t.el && t.last === '' && await page.evaluate(() => !!document.querySelector('#realm-bp-stats-box tr[data-stat]')), JSON.stringify({ v: v.has, chase: v.chase, t }));
    errs.push(...O.errors); await O.ctx.close(); }

  check('no page or console errors', errs.length === 0, errs.join(' | '));
  await browser.close();
  done();
})();
