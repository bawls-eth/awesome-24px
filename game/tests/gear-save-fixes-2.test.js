// Regression tests for the open P2s of REVIEW-GEAR-SAVES.md (NEXT-SLICES-3 SV1 + the F12 part of SV2). One block per finding:
//  F9  a tiered bag (b.gear) is never handed to a co-op partner (no T0 copy, soulbound never crosses); an inactive bag never keeps its tier
//  F11 a full pack sells a tiered drop at its tiered value (rmSellValue), never RM_RARITIES[r].sell (arena collectItem, bag pickup, dungeon gearGrant)
//  F12 world pity is re-read from storage right before a boss roll: two world tabs at gp.b = 60 give ONE forced T12
//  F13 reforging an item with a pending Lantern find moves that find to the new uid (same t / a) and the settle pays it
//  F16 kill saves are coalesced (8 kills in one frame = at most one persist, <= 2 JSON.stringify) and flushed on visibilitychange, pagehide, menu, death, stop
//  SV1 old-tab guard: a second page that strips dust / f / sig (a pre-535faf6 cleaner) never makes the first page lose them on its next merge + write
// Offline: blockDb + every WebSocket closed, no chat, nothing written to Firebase.
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/gear-save-fixes-2.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const MMStash = require('../shared/mm-stash.js');
const MMGearForge = require('../shared/mm-gear-forge.js');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const ORIGIN = BASE.replace(/\/game\/index\.html.*$/, '');
const MAZE = ORIGIN + '/game/games/mad-maze/index.html?test=1&offline=1';
const WURL = (q) => ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&seed=12345' + (q || '');
const SAVE = 'pixeltown-save-v1', MM = 'pixeltown-mm-v1', ACTIVE = 'pixeltown-mm-active-v1', WSAVE = 'pixeltown-realm-v1';
const hero = (id, cls, level) => ({ id, name: cls, cls, level, xp: 0, fame: 0, bonus: 0, mode: 'classic', items: [] });
const prof = (heroes) => ({ v: 1, heroes, stash: new Array(16).fill(null), fame: 0, mode: 'classic', hall: [], migratedFrom: null });
const realm = (extra) => Object.assign({ shards: 100, bestWave: 0, kills: 0, deaths: 0, kb: { spiral: 0, aimed: 0, ring: 0, drifter: 0, boss: 0 }, bossBestT: 0, level: 20, xp: 0,
  items: [{ n: 1, id: 'heartcharm', r: 0 }], nextUid: 10, eq: {} }, extra || {});

async function ctxOf(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  const db = await blockDb(ctx);
  await ctx.route('**/game/index.html*', (r) => (/games\/mad-maze/.test(r.request().url()) ? r.continue() : r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' })));
  await ctx.route('**/hub/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>hub</title>hub' }));
  await ctx.routeWebSocket(/.*/, (ws) => ws.close()); // never reach the live DB
  return { ctx, db };
}
const watch = (page, errors) => {
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
};
const ARENA = () => window.__mm && window.__mm.arena && window.__mm.arena.active;
const WORLD = () => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play';
async function openMM(browser, url, rm, extra, wait) {
  const { ctx, db } = await ctxOf(browser);
  const page = await ctx.newPage(); const errors = []; watch(page, errors);
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate((a) => { localStorage.clear(); localStorage.setItem(a.k1, a.p); localStorage.setItem(a.k2, a.a); if (a.s) localStorage.setItem(a.k3, a.s); localStorage.setItem('mm-aim-assist', '0'); Object.keys(a.x).forEach((k) => localStorage.setItem(k, a.x[k])); },
    { k1: MM, p: JSON.stringify(prof([hero('h-1', 'bruiser', 20)])), k2: ACTIVE, a: JSON.stringify({ v: 1, heroId: 'h-1' }), k3: SAVE, s: rm ? JSON.stringify({ realm: rm }) : null, x: extra || {} });
  await page.goto(url);
  await page.waitForFunction(wait || ARENA, null, { timeout: 20000 });
  return { ctx, db, page, errors };
}
const calm = (page) => page.evaluate(() => { const a = window.__mm.arena; a.state = 'play'; a.eBullets.forEach((b) => { b.active = false; }); a.enemies.forEach((e) => { e.active = false; }); a.bags.forEach((b) => { b.active = false; }); a.player.iframes = 1e9; a._hitPlayer = () => {}; a.nextWaveIn = 1e9; });
const stored = (page) => page.evaluate((k) => { try { return JSON.parse(localStorage.getItem(k)).realm; } catch (e) { return null; } }, SAVE);

(async () => {
  const browser = await chromium.launch();
  const errs = [];

  // ================= F13 (Node, real mm-stash.js): renumberFind moves a pending find to the reforged uid and payout pays it =================
  { const it = { n: 5, id: 'sparkwand', r: 1, t: 9, a: 11 };
    const f0 = MMStash.record(MMStash.cleanFinds(null), it, 'world');
    const ne = { n: 12, id: 'sparkwand', r: 1, t: 9, a: 11, f: { id: 'reach', v: 0.05 } }; // the reforged entry: a fresh uid, same id / r / t / a
    const before = MMStash.payout(prof([hero('h-1', 'bruiser', 20)]), [ne], f0, { heroId: 'h-1' });
    const f1 = MMStash.renumberFind(f0, 5, 12, ne);
    const after = MMStash.payout(prof([hero('h-1', 'bruiser', 20)]), [ne], f1, { heroId: 'h-1' });
    const p = f1.pending[0] || {};
    check('F13 (Node): without the renumber the reforged item is counted as thrown away (the review repro)', before.dropped === 1 && before.items === 0, JSON.stringify(before.res || { d: before.dropped, i: before.items }));
    check('F13 (Node): renumberFind moves the find to the new uid keeping id / r / t / a, and payout pays it to the stash', f1.pending.length === 1 && p.n === 12 && p.id === 'sparkwand' && p.r === 1 && p.t === 9 && p.a === 11 && after.stash === 1 && after.dropped === 0 && after.profile.stash[0].t === 9 && after.profile.stash[0].a === 11, JSON.stringify({ p, after: { s: after.stash, d: after.dropped, st: after.profile.stash[0] } }));
    const same = MMStash.renumberFind(f0, 7, 12, ne); const clash = MMStash.renumberFind(MMStash.record(f0, { n: 12, id: 'heartcharm', r: 0 }, 'world'), 5, 12, ne);
    check('F13 (Node): an unknown old uid or a new uid that is already pending leaves the finds unchanged', JSON.stringify(same) === JSON.stringify(MMStash.cleanFinds(f0)) && clash.pending.some((x) => x.n === 5) && clash.pending.filter((x) => x.n === 12).length === 1);
    const sb = MMStash.payout(prof([hero('h-1', 'bruiser', 20)]), [{ n: 13, id: 'sparkwand', r: 0, t: 12, a: 7 }], MMStash.renumberFind(MMStash.record(null, { n: 4, id: 'sparkwand', r: 0, t: 12, a: 7 }, 'world'), 4, 13), { heroId: 'h-1' });
    check('F13 (Node): a renumbered soulbound (T12) find is still refused by the payout', sb.soulbound === 1 && sb.items === 0, JSON.stringify({ sb: sb.soulbound, i: sb.items }));
  }

  // ================= Mad Maze arena page: F9, F11, F13, F16 =================
  { const A = await openMM(browser, MAZE + '&forge=1', realm({ shards: 900, dust: 900, items: [{ n: 1, id: 'heartcharm', r: 0 }, { n: 5, id: 'sparkwand', r: 1, t: 9, a: 11 }], nextUid: 10 }));
    await calm(A.page);
    // F9: a tiered bag next to the partner is not handed over; a classic one is (wire format [id, r] unchanged)
    const f9 = await A.page.evaluate(() => {
      const a = window.__mm.arena; const sent = [];
      const p = a.player; p.x = 100; p.y = 100;
      const team = { partner: { x: 600, y: 300, ready: true, down: false }, ev: (k, d, o) => { sent.push({ k, d, o }); }, isPvp: false, close() {} };
      const saveTeam = a.team, saveRole = a.role; a.team = team; a.role = 'host';
      const tb = a.dropBag(600, 300, 1, 'sparkwand', null, { t: 12, a: 7, sig: 'leech' }); tb.vx = 0; tb.vy = 0; tb.t = 0.3;
      const t9 = a.dropBag(600, 300, 0, 'sparkwand', null, { t: 5 }); t9.vx = 0; t9.vy = 0; t9.t = 0.3;
      const cb = a.dropBag(600, 300, 2, 'heartcharm'); cb.vx = 0; cb.vy = 0; cb.t = 0.3;
      const cbGear = cb.gear;
      a._updateBags(0.016);
      const r = { sent: JSON.stringify(sent), tierActive: tb.active && t9.active, tierGear: !!(tb.gear && t9.gear), classicGone: !cb.active, cbGear };
      a.team = saveTeam; a.role = saveRole;
      // the tiered bags expire: an inactive bag never keeps its tier, and a reused pooled bag starts classic
      tb.lifetime = 0.1; t9.lifetime = 0.1; tb.t = 1; t9.t = 1; a._updateBags(0.016);
      r.expiredGear = [tb.gear, t9.gear]; r.expiredActive = tb.active || t9.active;
      const n0 = a.save.items.length;
      const re = a.dropBag(p.x, p.y, 1, 'sparkwand'); re.vx = 0; re.vy = 0; re.t = 0.3; r.reusedGear = re.gear;
      a._updateBags(0.016);
      const got = a.save.items.slice(n0); r.got = JSON.stringify(got); r.reGear = re.gear;
      // a tiered bag under the hero: ONE entry with its tier from the pickup itself; the bag is cleared
      const n1 = a.save.items.length; const tg = a.dropBag(p.x, p.y, 1, 'sparkwand', null, { t: 9, a: 21 }); tg.vx = 0; tg.vy = 0; tg.t = 0.3; a._updateBags(0.016);
      r.tiered = JSON.stringify(a.save.items.slice(n1)); r.tgGear = tg.gear;
      return r;
    });
    const sent9 = JSON.parse(f9.sent); const got9 = JSON.parse(f9.got); const tier9 = JSON.parse(f9.tiered);
    check('F9: a tiered bag (T12 signature, T5) next to the partner is NOT handed over; the classic bag is, as [id, r] (the partner never gets a T0 copy)', sent9.length === 1 && sent9[0].k === 'loot' && sent9[0].d.length === 2 && sent9[0].d[0] === 'heartcharm' && sent9[0].d[1] === 2 && f9.tierActive && f9.tierGear && f9.classicGone && f9.cbGear === null, f9.sent + ' ' + JSON.stringify(f9));
    check('F9: an expired bag drops its gear, a reused pooled bag starts classic, and the next same id / r pickup gives exactly 1 classic item', !f9.expiredActive && f9.expiredGear[0] === null && f9.expiredGear[1] === null && f9.reusedGear === null && got9.length === 1 && !got9[0].t && f9.reGear === null, JSON.stringify(f9));
    check('F9: a tiered bag picked up by the host gives ONE item carrying t / a, and the bag keeps no gear', tier9.length === 1 && tier9[0].t === 9 && tier9[0].a === 21 && f9.tgGear === null, f9.tiered);

    // F11: a full pack sells at the tiered value (direct pickup, bag pickup), never the classic price
    const f11 = await A.page.evaluate(() => {
      const a = window.__mm.arena; const sv = a.save; const keep = sv.items.slice(); const nu = sv.nextUid;
      while (sv.items.length < RM_BACKPACK) sv.items.push({ n: sv.nextUid++, id: 'heartcharm', r: 0 });
      const s0 = sv.shards; a.collectItem('sparkwand', 1, { t: 12, a: 7 }); const d1 = sv.shards - s0;
      const p = a.player; const b = a.dropBag(p.x, p.y, 2, 'sparkwand', null, { t: 9, a: 3 }); b.vx = 0; b.vy = 0; b.t = 0.3;
      const s1 = sv.shards; a._updateBags(0.016); const d2 = sv.shards - s1;
      const s2 = sv.shards; a.collectItem('heartcharm', 1); const d3 = sv.shards - s2;
      const r = { d1, d2, d3, want1: rmSellValue({ r: 1, t: 12 }), want2: rmSellValue({ r: 2, t: 9 }), classic1: RM_RARITIES[1].sell, classic2: RM_RARITIES[2].sell, n: sv.items.length, last: a.lastFullSale, bGear: b.gear, gearOn: RM_GEAR_ON };
      sv.items.length = 0; keep.forEach((x) => sv.items.push(x)); sv.nextUid = nu + 40; a.onSave(sv);
      return r;
    });
    check('F11: a full pack sells a T12 pickup for rmSellValue({r, t}) (not RM_RARITIES[r].sell) and adds no item', f11.gearOn && f11.d1 === f11.want1 && f11.d1 !== f11.classic1 && f11.n === 24, JSON.stringify(f11));
    check('F11: a tiered BAG picked up on a full pack sells at its tiered value too (the tier rides into the pickup); a classic pickup keeps the classic price', f11.d2 === f11.want2 && f11.d2 !== f11.classic2 && f11.last && f11.last.t === 0 && f11.d3 === f11.classic1 && f11.bGear === null, JSON.stringify(f11));

    // F13 in realm.js: a reforge moves the pending find; settle pays the new uid
    const f13 = await A.page.evaluate(() => {
      const a = window.__mm.arena; const it = a.save.items.find((x) => x.n === 5);
      MMStash.recordTo(localStorage, it, 'world');
      const opts = a.reforgeOptions(5) || []; const o = opts.find((x) => !x.current && x.afford);
      const n = o ? a.reforge(5, o.id) : 0;
      const pend = MMStash.readFinds(localStorage).pending;
      const r = MMStash.settle(localStorage, { Profile: MMProfile, realmItems: a.save.items, src: 'world' });
      const pr = JSON.parse(localStorage.getItem('pixeltown-mm-v1'));
      return { n, opt: o && o.id, pend: JSON.stringify(pend), paid: r && r.items, dropped: r && r.dropped, slot0: JSON.stringify(pr.stash[0]), ne: JSON.stringify(a.save.items.find((x) => x.n === n)) };
    });
    const pend13 = JSON.parse(f13.pend); const ne13 = JSON.parse(f13.ne || 'null');
    check('F13: the reforge (new uid, forged f) moves the pending find to the new uid with the same t / a', f13.n > 0 && ne13 && ne13.f && pend13.length === 1 && pend13[0].n === f13.n && pend13[0].t === 9 && pend13[0].a === 11, JSON.stringify(f13));
    check('F13: the next settle pays it into the Lantern stash (it used to be counted as thrown away)', f13.paid === 1 && f13.dropped === 0 && JSON.parse(f13.slot0).t === 9, JSON.stringify(f13));

    // F16: 8 kills in one frame: no persist inside the frame, ONE persist after the coalesce window; <= 2 JSON.stringify in the frame
    await calm(A.page);
    const f16 = await A.page.evaluate((K) => new Promise((res) => {
      const a = window.__mm.arena;
      const spawn = (i) => { const e = a.enemies.find((x) => !x.active); Object.assign(e, { active: true, type: 'aimed', x: 300 + i * 20, y: 200, hp: 1, maxHp: 1, flash: 0, phase: 0, invuln: 0, shardMul: 1, xpMul: 1 }); e._stm = null; return e; };
      const es = []; for (let i = 0; i < 8; i++) es.push(spawn(i));
      const st0 = JSON.parse(localStorage.getItem(K)).realm.shards;
      const w0 = a.saveWrites; const js = JSON.stringify; let nJs = 0; JSON.stringify = function () { nJs++; return js.apply(this, arguments); };
      const so = Storage.prototype.setItem; let nSet = 0; Storage.prototype.setItem = function (k, v) { if (k === K) nSet++; return so.call(this, k, v); };
      try { es.forEach((e) => a._hitEnemy(e, 5, false, true)); } finally { JSON.stringify = js; }
      const inFrame = { writes: a.saveWrites - w0, sets: nSet, js: nJs, kills: es.filter((e) => !e.active).length, mem: a.save.shards, st: JSON.parse(localStorage.getItem(K)).realm.shards };
      setTimeout(() => { Storage.prototype.setItem = so; res({ st0, inFrame, after: { writes: a.saveWrites - w0, sets: nSet, st: JSON.parse(localStorage.getItem(K)).realm.shards, mem: a.save.shards } }); }, 450);
    }), SAVE);
    check('F16: 8 kills in one frame: all die, nothing is persisted inside the frame and <= 2 JSON.stringify calls run', f16.inFrame.kills === 8 && f16.inFrame.writes === 0 && f16.inFrame.sets === 0 && f16.inFrame.js <= 2 && f16.inFrame.st === f16.st0, JSON.stringify(f16));
    check('F16: one coalesced persist follows (exactly one storage write) and storage then holds every kill\'s shards', f16.after.writes === 1 && f16.after.sets === 1 && f16.after.st === f16.after.mem && f16.after.st > f16.st0, JSON.stringify(f16));
    // flush points: visibilitychange hidden, pagehide, menu open, death, stop
    const flush = await A.page.evaluate((K) => {
      const a = window.__mm.arena; const out = {};
      const kill = () => { const e = a.enemies.find((x) => !x.active); Object.assign(e, { active: true, type: 'aimed', x: 300, y: 200, hp: 1, maxHp: 1, shardMul: 1, xpMul: 1 }); e._stm = null; a._hitEnemy(e, 5, false, true); };
      const st = () => JSON.parse(localStorage.getItem(K)).realm.shards;
      const probe = (name, fire) => { a.state = 'play'; kill(); const pend = st() !== a.save.shards; fire(); out[name] = { pend, ok: st() === a.save.shards }; };
      probe('hidden', () => { const d = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState'); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); delete document.visibilityState; out.visRestored = document.visibilityState === (d ? d.get.call(document) : 'visible'); });
      probe('pagehide', () => window.dispatchEvent(new Event('pagehide')));
      probe('menu', () => { a.setMenu(true); a.setMenu(false); });
      probe('death', () => { a._die(); });
      probe('stop', () => { a.stop(); });
      out.menuMode = a._menuMode;
      return out;
    }, SAVE);
    check('F16: a pending kill save is flushed on visibilitychange:hidden and on pagehide', flush.hidden.pend && flush.hidden.ok && flush.pagehide.pend && flush.pagehide.ok, JSON.stringify(flush));
    check('F16: ... and on menu open, death and stop (exit / leave)', flush.menuMode && flush.menu.pend && flush.menu.ok && flush.death.pend && flush.death.ok && flush.stop.pend && flush.stop.ok, JSON.stringify(flush));
    errs.push(...A.errors);
    check('arena page: no DB traffic (blockDb)', A.db.attempts() === 0);
    await A.ctx.close(); }

  // ================= SV1 old-tab guard: a second page strips dust / f / sig (pre-535faf6 cleaner); the first page's data survives its next merge =================
  { const T12 = 7; const f = (MMGearForge.reforgeOptions({ n: 5, id: 'sparkwand', r: 1, t: 9, a: 11 }) || [])[0];
    const forged = { id: f.id, v: f.v };
    const A = await openMM(browser, MAZE + '&forge=1', realm({ dust: 40, items: [{ n: 1, id: 'heartcharm', r: 0 }, { n: 5, id: 'sparkwand', r: 1, t: 9, a: 11, f: forged }, { n: 6, id: 'sparkwand', r: 0, t: 12, a: T12, sig: 'leech' }], nextUid: 10 }));
    await calm(A.page);
    const mem0 = await A.page.evaluate(() => { const s = window.__mm.arena.save; return { dust: s.dust, f: (s.items.find((x) => x.n === 5) || {}).f, sig: (s.items.find((x) => x.n === 6) || {}).sig }; });
    const B = await A.ctx.newPage(); const berr = []; watch(B, berr);
    await B.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
    await B.evaluate((K) => { // the old tab: its cleaner keeps t / a but drops dust, f and sig, and it adds 5 shards
      const s = JSON.parse(localStorage.getItem(K)); delete s.realm.dust; s.realm.items.forEach((it) => { delete it.f; delete it.sig; }); s.realm.shards += 5; localStorage.setItem(K, JSON.stringify(s));
    }, SAVE);
    await A.page.waitForTimeout(300); // the storage event resyncs page A
    const old = await stored(A.page);
    const r = await A.page.evaluate(() => { const a = window.__mm.arena; const s0 = a.save.shards; a.save.shards += 1; const ok = a.onSave(a.save); return { ok, s0, mem: { dust: a.save.dust, f: (a.save.items.find((x) => x.n === 5) || {}).f, sig: (a.save.items.find((x) => x.n === 6) || {}).sig } }; });
    const st = await stored(A.page);
    const stF = (st.items.find((x) => x.n === 5) || {}).f, stSig = (st.items.find((x) => x.n === 6) || {}).sig;
    check('SV1 old tab: page A really held dust / f / sig and page B\'s write really stripped them', mem0.dust === 40 && mem0.f && mem0.sig === 'leech' && old.dust === undefined && !old.items.some((x) => x.f || x.sig), JSON.stringify({ mem0, old }));
    check('SV1 old tab: after the storage resync page A still holds dust 40, the forged f and the T12 signature in memory', r.mem.dust === 40 && r.mem.f && r.mem.f.id === forged.id && r.mem.sig === 'leech', JSON.stringify(r));
    check('SV1 old tab: page A\'s next write puts dust / f / sig back into storage and keeps the old tab\'s +5 shards', r.ok && st.dust === 40 && stF && stF.id === forged.id && stSig === 'leech' && st.shards === r.s0 + 1 && st.items.filter((x) => x.t).length === 2, JSON.stringify(st));
    errs.push(...A.errors, ...berr);
    check('old-tab pages: no DB traffic (blockDb)', A.db.attempts() === 0);
    await A.ctx.close(); }

  // ================= F12: two world pages, one storage, both loaded at gp.b = 60: ONE forced T12 in total =================
  { const A = await openMM(browser, WURL(''), realm({ items: [{ n: 1, id: 'heartcharm', r: 0 }] }), { [WSAVE]: JSON.stringify({ v: 1, seed: '12345', gp: { b: 60, d: 0 } }) }, WORLD);
    const B = await A.ctx.newPage(); const berr = []; watch(B, berr);
    await B.goto(WURL(''), { waitUntil: 'domcontentloaded' });
    await B.waitForFunction(WORLD, null, { timeout: 20000 });
    await calm(A.page); await calm(B);
    const pre = await Promise.all([A.page.evaluate(() => window.__mm.world.gearSave().gp), B.evaluate(() => window.__mm.world.gearSave().gp)]);
    const boss = (tag) => () => { const a = window.__mm.arena; const w = window.__mm.world; w.setDropAll(true); a.bags.forEach((b) => { b.active = false; }); const got = w.testDrop({ zone: 3, tier: 3, boss: true, src: 'boss', bossId: 'void_maw' }, 'f12'); w.setDropAll(false); return { t: (got ? got.items : []).map((x) => x.t || 0), gp: w.gearSave().gp }; };
    const ra = await A.page.evaluate(boss());
    const rb = await B.evaluate(boss());
    const wst = await B.evaluate((k) => JSON.parse(localStorage.getItem(k)).gp || null, WSAVE);
    const t12 = ra.t.filter((t) => t === 12).length + rb.t.filter((t) => t === 12).length;
    check('F12: both world pages loaded the same pity (gp.b = 60)', pre[0] && pre[0].b === 60 && pre[1] && pre[1].b === 60, JSON.stringify(pre));
    check('F12: the first page\'s z3 boss kill is the forced T12 and spends the pity', ra.t[0] === 12 && !(ra.gp && ra.gp.b), JSON.stringify(ra));
    check('F12: the second page reads the stored pity before its roll: no second forced T12 (one in total), its counter goes 0 -> 1', t12 === 1 && rb.gp && rb.gp.b === 1 && wst && wst.b === 1, JSON.stringify({ ra, rb, wst }));
    errs.push(...A.errors, ...berr);
    check('world pages: no DB traffic (blockDb)', A.db.attempts() === 0);
    await A.ctx.close(); }

  check('no page errors', errs.length === 0, JSON.stringify(errs.slice(0, 6)));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
