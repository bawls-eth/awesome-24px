// G-02 (b02-01): the backpack Combine button used to share Equip's grid cell and cover it. With 3 copies of one item the
// Equip, Combine and Sell buttons must not overlap, a click on Equip equips, a click on Combine combines; 1-copy rows unchanged.
// Offline: WebSockets closed, town/hub pages stubbed, no chat. Run at 390x844 and 1280x720.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-g02-combine.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const MAZE = ORIGIN + '/game/games/mad-maze/index.html?test=1&offline=1';
const MM = 'pixeltown-mm-v1', ACTIVE = 'pixeltown-mm-active-v1';
const hero = (id, cls, level) => ({ id, name: cls, cls, level, xp: 0, fame: 0, bonus: 0, mode: 'classic', items: [] });
const prof = (heroes) => ({ v: 1, heroes, stash: new Array(16).fill(null), fame: 0, mode: 'classic', hall: [], migratedFrom: null });

async function open(browser, opts) {
  const ctx = await browser.newContext(opts);
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' }));
  await ctx.route('**/hub/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>hub</title>hub' }));
  await ctx.route(/firebaseio\.com|firebasedatabase\.app|googleapis\.com/, (r) => r.abort());
  await ctx.routeWebSocket(/.*/, (ws) => ws.close());
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate(([k1, p, k2, a]) => { localStorage.setItem(k1, JSON.stringify(p)); localStorage.setItem(k2, a); }, [MM, prof([hero('h-r', 'ranger', 6)]), ACTIVE, JSON.stringify({ v: 1, heroId: 'h-r' })]);
  await page.goto(MAZE);
  await page.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena.active, null, { timeout: 15000 });
  return { ctx, page, errors };
}

const stock = (page) => page.evaluate(() => {
  const a = window.__mm.arena;
  a.save.items = [{ n: 201, id: 'sparkwand', r: 0 }, { n: 202, id: 'sparkwand', r: 0 }, { n: 203, id: 'sparkwand', r: 0 }, { n: 204, id: 'heartcharm', r: 0 }];
  a.save.eq = {}; a._calcStats(); a.state = 'play';
  a.setPaused(true);
  return true;
});
const boxes = (page, uid) => page.evaluate((u) => {
  const li = document.querySelector(`#realm-bp-list li[data-uid="${u}"]`);
  const b = (sel) => { const e = li && li.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
  return { eq: b('button[data-act="equip"]'), cb: b('button[data-combine]'), dc: b('button[data-act="discard"]') };
}, uid);
const stable = async (page, uid) => { let prev = null; for (let i = 0; i < 20; i++) { const b = await boxes(page, uid); if (prev && JSON.stringify(prev) === JSON.stringify(b)) return b; prev = b; await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); } return prev; };
const hit = (a, b) => a && b && a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;

(async () => {
  const browser = await chromium.launch();
  for (const [label, opts] of [['390x844', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }], ['1280x720', { viewport: { width: 1280, height: 720 } }]]) {
    const A = await open(browser, opts); await stock(A.page);
    await A.page.evaluate(() => { const li = document.querySelector('#realm-bp-list li[data-uid="201"]'); li && li.scrollIntoView({ block: 'center' }); });
    const bx = await stable(A.page, 201);
    check(`${label}: with 3 copies Equip, Combine and Sell are all rendered`, !!(bx.eq && bx.cb && bx.dc), JSON.stringify(bx));
    check(`${label}: Equip, Combine and Sell do not intersect (pairwise)`, !hit(bx.eq, bx.cb) && !hit(bx.eq, bx.dc) && !hit(bx.cb, bx.dc), JSON.stringify(bx));
    check(`${label}: every row button is at least 44x44`, [bx.eq, bx.cb, bx.dc].every((r) => r && r.w >= 44 && r.h >= 44), JSON.stringify(bx));
    const under = await A.page.evaluate((r) => { const e = document.elementFromPoint(r.x + r.w / 2, r.y + r.h / 2); return e && e.closest('button') ? e.closest('button').dataset.act || ('combine:' + e.closest('button').dataset.combine) : null; }, bx.eq);
    check(`${label}: elementFromPoint(centre of Equip) is the Equip button`, under === 'equip', under);
    await A.page.waitForFunction(() => { const b = document.querySelector('#realm-bp-list li[data-uid="201"] button[data-act="equip"]'); return b && !b.disabled; }, null, { timeout: 3000 }).catch(() => {});
    await A.page.mouse.click(bx.eq.x + bx.eq.w / 2, bx.eq.y + bx.eq.h / 2);
    const afterEq = await A.page.evaluate(() => ({ eq: window.__mm.arena.save.eq.weapon, n: window.__mm.arena.save.items.length }));
    check(`${label}: a real click on Equip equips (eq slot = 201), item count unchanged`, afterEq.eq === 201 && afterEq.n === 4, JSON.stringify(afterEq));
    // single-copy row: no empty Combine column wider than 8 px
    const single = await A.page.evaluate(() => { const li = document.querySelector('#realm-bp-list li[data-uid="204"]'); const cols = getComputedStyle(li).gridTemplateColumns.split(' ').map(parseFloat); return { cbr: li.classList.contains('cbr'), cols }; });
    check(`${label}: a 1-copy row has no Combine layout and no extra column wider than 8 px`, !single.cbr && single.cols.slice(3).every((w) => w <= 8), JSON.stringify(single));
    await A.page.evaluate(() => { const li = document.querySelector('#realm-bp-list li[data-uid="202"]'); li && li.scrollIntoView({ block: 'center' }); });
    await A.page.waitForFunction(() => { const b = document.querySelector('#realm-bp-list li[data-uid="202"] button[data-combine]'); return b && !b.disabled; }, null, { timeout: 3000 }).catch(() => {});
    let cb2 = await stable(A.page, 202);
    await A.page.mouse.move(cb2.cb.x + cb2.cb.w / 2, cb2.cb.y + cb2.cb.h / 2);
    cb2 = await stable(A.page, 202); // hovering a weapon row opens its compare line: measure again after it settles
    await A.page.mouse.click(cb2.cb.x + cb2.cb.w / 2, cb2.cb.y + cb2.cb.h / 2);
    const afterCb = await A.page.evaluate(() => { const a = window.__mm.arena; return { n: a.save.items.length, sw: a.save.items.filter((x) => x.id === 'sparkwand').map((x) => x.r), eqId: (a.save.items.find((x) => x.n === a.save.eq.weapon) || {}).id }; });
    check(`${label}: a click on Combine combines (4 -> 2 items, one uncommon wand) and equips nothing new`, afterCb.n === 2 && afterCb.sw.length === 1 && afterCb.sw[0] === 1 && afterCb.eqId === 'sparkwand', JSON.stringify(afterCb));
    check(`${label}: no page errors`, A.errors.length === 0, A.errors.join(' | '));
    await A.ctx.close();
  }
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
