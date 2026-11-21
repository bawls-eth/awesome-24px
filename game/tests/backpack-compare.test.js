// S14: backpack weapon compare (pattern line + green/red deltas vs the equipped weapon, on hover or long-press), the equipped class
// weapon shown instead of "weapon: empty" (PLAYTEST-REVIEW-2 #15), at most 3 status pips over an enemy ("+n" for the rest), and damage
// number colours (armorBroken purple, crits gold, marked pink, plain white). Offline: WebSockets closed, town/hub pages stubbed, no chat.
// Run: BASE=http://localhost:8661/game/index.html NODE_PATH=$(npm root -g) node game/tests/backpack-compare.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const MAZE = ORIGIN + '/game/games/mad-maze/index.html?test=1&offline=1';
const MM = 'pixeltown-mm-v1', ACTIVE = 'pixeltown-mm-active-v1';
const hero = (id, cls, level) => ({ id, name: cls, cls, level, xp: 0, fame: 0, bonus: 0, mode: 'classic', items: [] });
const prof = (heroes) => ({ v: 1, heroes, stash: new Array(16).fill(null), fame: 0, mode: 'classic', hall: [], migratedFrom: null });

async function open(browser, query, opts) {
  const ctx = await browser.newContext(opts || { viewport: { width: 1000, height: 700 } });
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' }));
  await ctx.route('**/hub/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>hub</title>hub' }));
  await ctx.routeWebSocket(/.*/, (ws) => ws.close()); // never reach the live DB
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate(([k1, p, k2, a]) => { localStorage.setItem(k1, JSON.stringify(p)); localStorage.setItem(k2, a); }, [MM, prof([hero('h-r', 'ranger', 6)]), ACTIVE, JSON.stringify({ v: 1, heroId: 'h-r' })]);
  errors.length = 0;
  await page.goto(MAZE + (query || ''));
  await page.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena.active, null, { timeout: 15000 });
  return { ctx, page, errors };
}

// Backpack: Spark Wand (common), Quickfire Wand (uncommon), Triple Shot bow (rare, the ranger's family), a wand style (other family).
const stock = (page) => page.evaluate(() => {
  const a = window.__mm.arena;
  a.save.items = [{ n: 101, id: 'sparkwand', r: 0 }, { n: 102, id: 'quickwand', r: 1 }, { n: 103, id: 'wpn_bow_triple', r: 2 }, { n: 104, id: 'wpn_wand_chain', r: 0 }, { n: 105, id: 'heartcharm', r: 0 }];
  a.save.eq = {}; a._calcStats(); a.state = 'play';
  a.setPaused(true);
  return true;
});
const rowCmp = (page, uid) => page.evaluate((u) => {
  const li = document.querySelector(`#realm-bp-list li[data-uid="${u}"]`); const c = li && li.querySelector('.rm-cmp');
  if (!c) return null;
  return { shown: getComputedStyle(c).display !== 'none' && c.getBoundingClientRect().height > 0, pat: c.querySelector('.pat').textContent, up: Array.from(c.querySelectorAll('.dl.up')).map((x) => x.textContent), dn: Array.from(c.querySelectorAll('.dl.dn')).map((x) => x.textContent), eq: (c.querySelector('.dl.eqd') || {}).textContent || '', upCol: c.querySelector('.dl.up') ? getComputedStyle(c.querySelector('.dl.up')).color : '', dnCol: c.querySelector('.dl.dn') ? getComputedStyle(c.querySelector('.dl.dn')).color : '' };
}, uid);

(async () => {
  const browser = await chromium.launch();
  const errs = [];

  // ---- desktop: slot label, hover compare, deltas, damage colours, pips ----
  { const A = await open(browser); await stock(A.page);
    const slot = await A.page.evaluate(() => document.querySelector('.realm-bp-slot[data-slot="weapon"]').textContent.trim());
    check('PT2 #15: an empty weapon slot shows the class weapon ("Ranger Bolt"), not "weapon: empty"', /Ranger Bolt/.test(slot) && !/empty/.test(slot), slot);
    const hidden = await rowCmp(A.page, 103);
    await A.page.hover('#realm-bp-list li[data-uid="103"] .nm');
    const bow = await rowCmp(A.page, 103);
    check('hovering a backpack weapon shows its pattern line (3 arrows in a fan) — hidden before the hover', hidden && !hidden.shown && bow.shown && /3 arrows/.test(bow.pat) && /fan \d+ deg/.test(bow.pat) && /range \d+ px/.test(bow.pat), JSON.stringify({ hidden, bow }));
    check('the bow vs the class weapon: +2 shots in green', bow.up.some((t) => /^\+2 shots$/.test(t)) && /rgb\(126, 231, 135\)/.test(bow.upCol), JSON.stringify(bow));
    const spark = await rowCmp(A.page, 101);
    check('Spark Wand vs the bare class weapon: +50% damage/s (green); the other-family wand says so instead of deltas', await A.page.evaluate(() => { const c = window.__mm.arena.weaponCompare(101); return c.deltas.length === 1 && c.deltas[0].text === '+50% damage/s' && c.deltas[0].up === true; }) && /another class family/.test((await rowCmp(A.page, 104)).eq), JSON.stringify(spark));
    await A.page.evaluate(() => { window.__mm.arena.equip(101); });
    await A.page.hover('#realm-bp-list li[data-uid="102"] .nm');
    const quick = await rowCmp(A.page, 102), sparkEq = await rowCmp(A.page, 101);
    check('with the Spark Wand equipped: the Quickfire Wand shows a red damage/s delta and the Spark Wand row says "equipped"', quick.shown && quick.dn.some((t) => /^-\d+% damage\/s$/.test(t)) && /rgb\(255, 123, 114\)/.test(quick.dnCol) && sparkEq.eq === 'equipped', JSON.stringify({ quick, sparkEq }));
    const charm = await A.page.evaluate(() => !!document.querySelector('#realm-bp-list li[data-uid="105"] .rm-cmp'));
    check('non-weapon items get no compare line', charm === false);

    const col = await A.page.evaluate(() => {
      const a = window.__mm.arena; a.setPaused(false); a.state = 'play';
      const e = a.spawnEnemy('ring', a.player.x + 200, a.player.y); e.cd = 999; e.hp = e.maxHp = 1e6;
      const last = () => { const t = a.texts.filter((q) => q.active).pop(); return t ? { text: t.text, color: t.color } : null; };
      a.texts.forEach((t) => { t.active = false; });
      a._hitEnemy(e, 2); const plain = last();
      a.applyStatus(e, 'armorBroken', { sec: 30 }); a._hitEnemy(e, 2); const ab = last();
      a._hitEnemy(e, 4, true); const crit = last();
      a.applyStatus(e, 'marked', { sec: 30 }); a._hitEnemy(e, 2); const marked = last();
      for (const id of ['slowed', 'weak', 'curse', 'bleed']) a.applyStatus(e, id, { sec: 30 });
      const pips = a.enemyPips(e); const all = a.statusOf(e).length;
      const e2 = a.spawnEnemy('ring', a.player.x - 200, a.player.y); e2.cd = 999; a.applyStatus(e2, 'slowed', { sec: 30 }); const one = a.enemyPips(e2);
      return { plain, ab, crit, marked, pips, all, one };
    });
    check('damage numbers: plain white, armorBroken purple, a crit gold with "!", marked keeps its pink over armorBroken', col.plain.color === '#fff' && col.ab.color === '#b77bff' && col.crit.color === '#ffd24a' && /!$/.test(col.crit.text) && col.marked.color === '#ff8fa8', JSON.stringify(col));
    check('an enemy with 6 statuses shows 3 pips and "+3"; one status shows 1 pip and no "+n"', col.all === 6 && col.pips.ids.length === 3 && col.pips.more === 3 && col.one.ids.length === 1 && col.one.more === 0, JSON.stringify(col));
    // the pips really draw: frames run with the "+n" enemy on screen (no errors, the pip cache fills)
    const drawn = await A.page.evaluate(async () => { const a = window.__mm.arena; for (let i = 0; i < 4; i++) await new Promise((r) => requestAnimationFrame(r)); return a._pipCache ? a._pipCache.size() : 0; });
    check('the pips are drawn from a small cache (one canvas per status id)', drawn >= 3 && drawn <= 8, String(drawn));
    errs.push(...A.errors); await A.ctx.close(); }

  // ---- phone 390x844: long-press shows the compare line, no horizontal scroll, buttons >= 44 px ----
  { const P = await open(browser, '', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }); await stock(P.page);
    const before = await rowCmp(P.page, 103);
    await P.page.dispatchEvent('#realm-bp-list li[data-uid="103"] .nm', 'pointerdown');
    await P.page.waitForTimeout(600);
    await P.page.dispatchEvent('#realm-bp-list li[data-uid="103"] .nm', 'pointerup');
    const after = await rowCmp(P.page, 103);
    const lay = await P.page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, small: Array.from(document.querySelectorAll('#realm-bp-list button')).filter((b) => b.getClientRects().length && b.getBoundingClientRect().height < 44).length, on: !!document.querySelector('#realm-bp-list li[data-uid="103"].cmp-on') }));
    check('phone: a long-press on a weapon row shows its compare line (pattern + deltas)', !before.shown && after.shown && lay.on && /3 arrows/.test(after.pat) && after.up.length >= 1, JSON.stringify({ before, after }));
    const quick = await P.page.evaluate(async () => { const s = document.querySelector('#realm-bp-list li[data-uid="102"] .nm'); s.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); await new Promise((r) => setTimeout(r, 100)); s.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); await new Promise((r) => setTimeout(r, 450)); return !!document.querySelector('#realm-bp-list li[data-uid="102"].cmp-on'); });
    check('phone: a short tap does not open it', quick === false);
    check('phone: no horizontal scroll with the backpack open, every backpack button >= 44 px tall', lay.sw <= lay.iw && lay.small === 0, JSON.stringify(lay));
    if (process.env.SHOTS) await P.page.screenshot({ path: require('path').join(process.env.SHOTS, 'backpack-compare-390x844.png') });
    errs.push(...P.errors); await P.ctx.close(); }

  check('no console errors', errs.length === 0, errs.join(' | '));
  await browser.close();
  done();
})();
