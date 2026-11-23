// G-26 (b05-04, b05-06, b05-07): Isles economy persistence. Picked nodes / glints stay picked across a reload until they grow back, the
// pouch survives a reload, a double-tap on Craft makes one item, and a gather with a full pack keeps the spot (toast "Pack full"). An old
// save (no pixeltown-isle-nodes-v1) loads with everything ready. Offline: blockDb, local only, no chat, no Firebase writes.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-g26-isles-economy.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/isles/index.html?test=1&seed=123';
const PROFILE = { v: 1, heroes: [{ id: 'h1', name: 'Fern', cls: 'druid', level: 7, xp: 10, items: [] }], stash: [], fame: 0, mode: 'classic', hall: [] };
const ev = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__isles, ${JSON.stringify(arg === undefined ? null : arg)})`);
const ready = (page) => page.waitForFunction(() => window.__isles && window.__isles.world, null, { timeout: 15000 });

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  await blockDb(ctx);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.addInitScript((s) => { if (sessionStorage.seeded) return; sessionStorage.seeded = '1'; localStorage.clear(); Object.keys(s).forEach((k) => localStorage.setItem(k, s[k])); },
    { 'pixeltown-mm-v1': JSON.stringify(PROFILE), 'pixeltown-mm-active-v1': JSON.stringify({ v: 1, heroId: 'h1' }) });
  await page.goto(PAGE); await ready(page);

  // 5: an old save: every node is ready, no nodes key yet
  const n0 = await ev(page, (I) => ({ ready: I.nodes().every((n) => n.ready), count: I.nodes().length, key: localStorage.getItem('pixeltown-isle-nodes-v1') }));
  check('5. an old save (no pixeltown-isle-nodes-v1) loads with every node ready and the starter pouch', n0.count >= 5 && n0.ready && (n0.key === null || JSON.parse(n0.key).isles.jungle.n.length === 0), JSON.stringify(n0));

  // 1: pick 5 nodes, reload: those 5 are still spent
  const picked = await ev(page, (I) => {
    I.pause(true); I.god(true); I.clearCreatures();
    const got = [];
    for (const n of I.nodes()) {
      if (got.length >= 5) break;
      const t = I.findTile(null, 1); I.teleport(t.x, t.y); I.step(0, 0, 0.05); // step off any node first
      I.teleport(n.x, n.y); I.step(0, 0, 0.05);
      const after = I.nodes().find((q) => q.i === n.i); if (after && !after.ready) got.push(n.i);
    }
    return got;
  });
  await page.reload(); await ready(page);
  const still = await ev(page, (I, ids) => ids.map((i) => { const q = I.nodes().find((n) => n.i === i); return q ? q.ready : null; }), picked);
  check('1. pick 5 nodes, reload: those 5 are still spent until they grow back', picked.length === 5 && still.every((r) => r === false), JSON.stringify({ picked, still }));

  // 2: the pouch survives a reload (feeding a knocked-out Fern Raptor uses pouch food)
  const fed = await ev(page, (I) => {
    I.pause(true); I.god(true); I.clearCreatures();
    const t = I.findTile(null, 13); I.teleport(t.x, t.y); I.step(0, 0, 0.05);
    const p0 = I.pouch(); const h = I.hero(); const uid = I.spawn('fernraptor', h.tx + 3, h.ty);
    const get = () => I.creatures().find((c) => c.uid === uid) || null;
    I.soothe(true);
    for (let i = 0; i < 80 && get() && !get().ko; i++) { const c = get(), hh = I.hero(); I.fire(c.x - hh.x, c.y - 8 - hh.y); I.step(0, 0, 0.3); }
    I.soothe(false);
    let feeds = 0; for (let i = 0; i < 2 && get() && get().ko; i++) { I.nextTo(uid, -30); const r = I.feed(); if (r && r.ok) feeds++; I.step(0, 0, 0.5); }
    I.closePanel && I.closePanel();
    return { p0, p1: I.pouch(), feeds };
  });
  await page.reload(); await ready(page);
  const p2 = await ev(page, (I) => I.pouch());
  const changed = Object.keys(fed.p1).filter((k) => fed.p1[k] !== fed.p0[k]);
  check('2. the pouch count survives a reload', fed.feeds > 0 && changed.length > 0 && changed.every((k) => p2[k] === fed.p1[k]), JSON.stringify({ fed, p2 }));

  // 3: double-tap Craft makes one item
  await ev(page, (I) => { I.give('raw_meat', 6); I.give('jungle_berry', 4); I.openPanel('craft'); return true; });
  const sel = '#panel button.rc-btn[data-recipe="feast"]';
  await page.waitForSelector(sel);
  const before = await ev(page, (I) => I.inv().feast | 0);
  await page.evaluate((q) => document.querySelector(q).scrollIntoView({ block: 'center' }), sel);
  const b = await page.evaluate((q) => { const r = document.querySelector(q).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, sel);
  await page.mouse.dblclick(b.x, b.y);
  await page.waitForTimeout(400);
  const after = await ev(page, (I) => I.inv().feast | 0);
  check('3. a double-tap on Craft makes exactly one item', after - before === 1, JSON.stringify({ before, after }));

  // 4: full pack + gather: the spot stays ready, toast "Pack full"
  const g = await ev(page, (I) => {
    I.closePanel && I.closePanel();
    const sp = I.spots().find((s) => !s.taken); if (!sp) return { none: true };
    I.give(sp.kind, 999);
    I.teleport(sp.x, sp.y); I.step(0, 0, 0.05);
    const r = I.gather();
    const toast = (document.getElementById('toast') || {}).textContent || '';
    return { why: r && r.why, taken: I.spots().find((s) => s.idx === sp.idx).taken, toast };
  });
  check('4. a gather with a full pack keeps the spot ready and says "Pack full"', !g.none && g.why === 'full' && g.taken === false && /Pack full/.test(g.toast), JSON.stringify(g));
  check('no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close(); await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
