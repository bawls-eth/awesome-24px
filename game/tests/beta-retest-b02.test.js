// QA re-test of the b02 P1 findings, replayed from the tester's own steps (game/design/beta/b02.json), Realm world, desktop 1280x720:
//   b02-01 (G-02) 4x Scholar Ring: Equip must be reachable (not covered by Combine) and a real click equips.
//   b02-02 (G-03) a real double-click on Sell of row 1 (junk Quickfire Wand) sells ONE item, never the equipped Iron Cuirass below it.
//   b02-04 (G-04) full 24/24 pack + a T12 bag walked into: the T12 is NOT auto-sold, shards unchanged, "Backpack full" feedback.
// blockDb on the context, ?test=1, no chat, no Firebase writes. Fails on the beta base; passes once G-02 / G-03 / G-04 land.
// Run: python3 -m http.server 8440 &   BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/beta-retest-b02.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const URL = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&seed=12345';

async function open(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const db = await blockDb(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena.active, null, { timeout: 30000 });
  return { ctx, db, page, errors };
}
const openPack = (page, items, eq, shards) => page.evaluate(([its, e, sh]) => {
  const a = window.__mm.arena; a.save.items = its; a.save.eq = e || {}; a.save.shards = sh; a.save.nextUid = 500; a._calcStats(); a.state = 'play'; a.setPaused(true); return true;
}, [items, eq, shards]);
const sv = (page) => page.evaluate(() => { const s = window.__mm.arena.save; return { n: s.items.length, uids: s.items.map((x) => x.n), eq: Object.assign({}, s.eq), shards: s.shards }; });
// wait for a button to be clickable (a fix may arm buttons after a short delay; we wait for the condition, never a fixed sleep)
const armed = (page, sel) => page.waitForFunction((s) => { const b = document.querySelector(s); return b && !b.disabled; }, sel, { timeout: 3000 }).catch(() => {});

(async () => {
  const browser = await chromium.launch();
  try {
    // ---- b02-01 ----
    {
      const s = await open(browser);
      await openPack(s.page, [{ n: 1, id: 'scholarring', r: 0 }, { n: 2, id: 'scholarring', r: 0 }, { n: 3, id: 'scholarring', r: 0 }, { n: 4, id: 'scholarring', r: 0 }], {}, 100);
      const sel = '#realm-bp-list li[data-uid="1"] button[data-act="equip"]';
      await armed(s.page, sel);
      const hit = await s.page.evaluate((q) => { const b = document.querySelector(q); if (!b) return 'no equip button'; const r = b.getBoundingClientRect(); const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return el === b || b.contains(el) ? 'equip' : (el && (el.getAttribute('data-combine') ? 'combine' : el.tagName + '.' + el.className)); }, sel);
      check('b02-01: elementFromPoint at the Equip centre is Equip (not Combine)', hit === 'equip', hit);
      if (hit === 'equip') await s.page.click(sel, { timeout: 3000 }).catch((e) => check('b02-01: Equip is clickable', false, e.message));
      const st = await sv(s.page);
      check('b02-01: a real click on Equip equips the ring and keeps 4 rings', st.eq.ring === 1 && st.n === 4, JSON.stringify(st));
      check('b02-01: no pageerror', s.errors.length === 0, s.errors.join(' | '));
      await s.ctx.close();
    }
    // ---- b02-02 ----
    {
      const s = await open(browser);
      await openPack(s.page, [{ n: 3, id: 'quickwand', r: 2 }, { n: 4, id: 'arm_heavy_iron', r: 0, t: 2 }], { armor: 4 }, 500);
      const before = await sv(s.page);
      const sel = '#realm-bp-list li[data-uid="3"] button[data-act="discard"]';
      await armed(s.page, sel);
      await s.page.dblclick(sel);
      await s.page.waitForTimeout(500);
      const after = await sv(s.page);
      check('b02-02: double-click on Sell of the wand sells exactly one item', after.n === before.n - 1, JSON.stringify({ before, after }));
      check('b02-02: the equipped Iron Cuirass (uid 4) is still in the pack and still equipped', after.uids.includes(4) && after.eq.armor === 4, JSON.stringify(after));
      // a single click on the equipped armor must not sell it straight away (two-step confirm)
      const sel4 = '#realm-bp-list li[data-uid="4"] button.dc'; // the Sell button (data-act may be "discard" or a confirm step)
      await armed(s.page, sel4);
      await s.page.click(sel4).catch(() => {});
      await s.page.waitForTimeout(200);
      const one = await sv(s.page);
      const txt = await s.page.evaluate((q) => { const b = document.querySelector(q); return b ? b.textContent : ''; }, sel4);
      check('b02-02/03: one click on Sell of the EQUIPPED armor does not sell it and asks "Sure?"', one.uids.includes(4) && /sure/i.test(txt), JSON.stringify({ one, txt }));
      await s.ctx.close();
    }
    // ---- b02-04 ----
    {
      const s = await open(browser);
      const full = []; for (let i = 0; i < 24; i++) full.push({ n: 10 + i, id: 'luckring', r: 0 });
      await openPack(s.page, full, {}, 200);
      await s.page.evaluate(() => window.__mm.arena.setPaused(false));
      const r = await s.page.evaluate(() => {
        const a = window.__mm.arena; a.lastFullSale = null;
        const b = a.dropBag(a.player.x, a.player.y, 2, 'sparkwand', { tierIndex: 4 }, { t: 12, a: 555 });
        if (b) { b.vx = 0; b.vy = 0; }
        return !!b;
      });
      check('b02-04: a T12 bag was dropped at the hero', r);
      await s.page.waitForFunction(() => { const a = window.__mm.arena; return a.bags.every((b) => !b.active || b.t > 1.2); }, null, { timeout: 8000 }).catch(() => {});
      const st = await s.page.evaluate(() => { const a = window.__mm.arena; return { n: a.save.items.length, shards: a.save.shards, sale: a.lastFullSale, bag: a.bags.some((b) => b.active && b.gear && b.gear.t === 12), hud: document.body.innerText }; });
      check('b02-04: full pack walking into a T12: not auto-sold (shards unchanged, no lastFullSale)', st.shards === 200 && !st.sale, JSON.stringify({ shards: st.shards, sale: st.sale }));
      check('b02-04: the T12 bag is still in the world', st.bag);
      check('b02-04: the player is told "Backpack full"', /backpack full/i.test(st.hud));
      check('b02-04: no pageerror', s.errors.length === 0, s.errors.join(' | '));
      check('no database traffic', s.db.count() === 0);
      await s.ctx.close();
    }
  } catch (e) {
    check('test ran to the end', false, e && e.stack);
  } finally {
    await browser.close();
    done();
  }
})();
