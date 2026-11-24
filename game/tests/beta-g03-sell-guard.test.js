// G-03 (b02-02, b02-03, b02-12, b02-14): backpack Sell / Forge guards. A double-click on Sell sells ONE item (the row that slides under the
// pointer is inert for 300 ms after a re-render), Sell on a protected item (equipped / soulbound / signature / best tier in its slot) asks
// "Sure?" first for 3 s, a double-tap on "Confirm reforge" never opens (or confirms) a salvage, and arena.discard(uid) still sells in one call.
// The Nexus vendor stall (realm-world.js nxStallRender) has the same 300 ms arm delay and marks the equipped piece in Sell back.
// Offline: blockDb + every WebSocket closed, town/hub stubbed, no chat, no Firebase writes.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-g03-sell-guard.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const MAZE = ORIGIN + '/game/games/mad-maze/index.html?test=1&offline=1&forge=1';
const SAVE = 'pixeltown-save-v1', MM = 'pixeltown-mm-v1', ACTIVE = 'pixeltown-mm-active-v1';
const hero = (id, cls, level) => ({ id, name: cls, cls, level, xp: 0, fame: 0, bonus: 0, mode: 'classic', items: [] });
const prof = (heroes) => ({ v: 1, heroes, stash: new Array(16).fill(null), fame: 0, mode: 'classic', hall: [], migratedFrom: null });
const realm = (items, eq, extra) => Object.assign({ shards: 100, bestWave: 0, kills: 0, deaths: 0, kb: { spiral: 0, aimed: 0, ring: 0, drifter: 0, boss: 0 }, bossBestT: 0, level: 20, xp: 0, items, nextUid: 100, eq }, extra || {});

async function open(browser, rm, opts) {
  const ctx = await browser.newContext(opts || { viewport: { width: 1000, height: 700 } });
  await blockDb(ctx);
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' }));
  await ctx.route('**/hub/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>hub</title>hub' }));
  await ctx.routeWebSocket(/.*/, (ws) => ws.close());
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate(([k1, p, k2, a, k3, s]) => { localStorage.clear(); localStorage.setItem(k1, JSON.stringify(p)); localStorage.setItem(k2, a); localStorage.setItem(k3, s); },
    [MM, prof([hero('h-1', 'bruiser', 20)]), ACTIVE, JSON.stringify({ v: 1, heroId: 'h-1' }), SAVE, JSON.stringify({ realm: rm })]);
  await page.goto(MAZE);
  await page.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena.active, null, { timeout: 15000 });
  await page.evaluate(() => { const a = window.__mm.arena; a.state = 'play'; a.eBullets.forEach((b) => { b.active = false; }); a.enemies.forEach((e) => { e.active = false; }); a._calcStats(); a.setPaused(true); });
  return { ctx, page, errors };
}
const box = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, sel);
const awake = (page, sel) => page.waitForFunction((s) => { const b = document.querySelector(s); return b && !b.disabled; }, sel, { timeout: 3000 });
const items = (page) => page.evaluate(() => window.__mm.arena.save.items.map((x) => x.n));

(async () => {
  const browser = await chromium.launch();

  // 1 + 2 + 5: junk double-click, protected Sell, direct discard
  { const junk = [{ n: 11, id: 'heartcharm', r: 0 }, { n: 12, id: 'heartcharm', r: 1 }, { n: 13, id: 'sparkwand', r: 0 }, { n: 14, id: 'quickwand', r: 0 }, { n: 15, id: 'heartcharm', r: 0 }];
    const A = await open(browser, realm(junk, { weapon: 13 }));
    const p = A.page;
    const s1 = '#realm-bp-list li[data-uid="11"] button[data-act="discard"]';
    await awake(p, s1);
    const c = await box(p, s1);
    await p.mouse.dblclick(c.x, c.y);
    await p.waitForTimeout(400);
    const after = await items(p);
    check('1. a real dblclick on Sell of row 1 (junk) sells exactly one item; the row below is still there', after.length === 4 && after.indexOf(11) < 0 && after.indexOf(12) >= 0, JSON.stringify(after));
    check('1b. right after a re-render the backpack action buttons are inert (disabled), and wake by themselves', await p.evaluate(() => { const a = window.__mm.arena; a.renderBackpack(); const b = document.querySelector('#realm-bp-list button[data-act]'); return !!b && b.disabled; }) && (await awake(p, '#realm-bp-list button[data-act]').then(() => true, () => false)));

    const sEq = '#realm-bp-list li[data-uid="13"] button.dc';
    await awake(p, sEq);
    const sh0 = await p.evaluate(() => window.__mm.arena.save.shards);
    const e1 = await box(p, sEq);
    await p.mouse.click(e1.x, e1.y);
    await p.waitForFunction((s) => /Sure/.test(document.querySelector(s).textContent), sEq, { timeout: 2000 }).catch(() => {});
    const ask = await p.evaluate((s) => ({ t: document.querySelector(s).textContent, items: window.__mm.arena.save.items.length, eq: window.__mm.arena.save.eq.weapon }), sEq);
    check('2. Sell on the equipped weapon: nothing sold, still equipped, the button says "Sure?"', /Sure/.test(ask.t) && ask.items === 4 && ask.eq === 13, JSON.stringify(ask));
    await awake(p, sEq);
    await p.mouse.click(e1.x, e1.y);
    await p.waitForTimeout(150);
    const sold = await p.evaluate(() => ({ items: window.__mm.arena.save.items.map((x) => x.n), eq: window.__mm.arena.save.eq.weapon, sh: window.__mm.arena.save.shards }));
    check('2b. a second click within 3 s sells it and unequips it', sold.items.indexOf(13) < 0 && sold.eq === undefined && sold.sh > sh0, JSON.stringify(sold));

    await p.evaluate(() => { const a = window.__mm.arena; a.save.eq.weapon = 14; a._afterGearChange(); });
    const s14 = '#realm-bp-list li[data-uid="14"] button.dc';
    await awake(p, s14);
    const e2 = await box(p, s14);
    await p.mouse.click(e2.x, e2.y);
    await p.waitForFunction((s) => /Sure/.test(document.querySelector(s).textContent), s14, { timeout: 2000 }).catch(() => {});
    await p.waitForFunction((s) => /^Sell /.test(document.querySelector(s).textContent) && document.querySelector(s).dataset.act === 'sell-ask', s14, { timeout: 5000 }).catch(() => {});
    const back = await p.evaluate((s) => ({ t: document.querySelector(s).textContent, act: document.querySelector(s).dataset.act, has: window.__mm.arena.save.items.some((x) => x.n === 14) }), s14);
    check('2c. no second click for 3 s: the button goes back to "Sell" and the item is kept', /^Sell /.test(back.t) && back.act === 'sell-ask' && back.has, JSON.stringify(back));

    const direct = await p.evaluate(() => { const a = window.__mm.arena; const n0 = a.save.items.length; const ok = a.discard(14); return { ok, d: n0 - a.save.items.length, eq: a.save.eq.weapon }; });
    check('5. arena.discard(uid) called directly still sells (even the equipped one) in one call', direct.ok === true && direct.d === 1 && direct.eq === undefined, JSON.stringify(direct));
    check('no page errors (sell)', A.errors.length === 0, A.errors.join(' | '));
    await A.ctx.close();
  }

  // 3: double-tap "Confirm reforge" -> the item still exists, no salvage confirm open, charged once
  { const A = await open(browser, realm([{ n: 1, id: 'sparkwand', r: 1, t: 8, a: 12345 }, { n: 7, id: 'heartcharm', r: 0 }], { weapon: 1 }, { dust: 200 }), { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const p = A.page;
    for (const sel of ['button.fg[data-forge-open="1"]', 'button.fg[data-forge-pick="blast"]']) { await awake(p, sel); const b = await box(p, sel); await p.touchscreen.tap(b.x, b.y); }
    const yes = 'button.fg[data-forge-yes="reforge"]';
    await awake(p, yes);
    const y = await box(p, yes);
    const before = await p.evaluate(() => ({ dust: window.__mm.arena.save.dust, shards: window.__mm.arena.save.shards }));
    await p.touchscreen.tap(y.x, y.y); await p.waitForTimeout(90); await p.touchscreen.tap(y.x, y.y);
    await p.waitForTimeout(400);
    const r = await p.evaluate(() => { const a = window.__mm.arena; const it = a.save.items.find((x) => x.id === 'sparkwand' && x.t === 8); return { it: !!it, f: it && it.f && it.f.id, dust: a.save.dust, shards: a.save.shards, salvageQ: !!document.querySelector('button.fg[data-forge-yes="salvage"]'), ask: a._forgeAsk }; });
    check('3. double-tap "Confirm reforge": the item still exists (reforged once) and no salvage confirm is open', r.it && r.f === 'blast' && !r.salvageQ && !r.ask, JSON.stringify(r));
    check('3b. the reforge was charged exactly once', before.dust - r.dust === 50 && before.shards - r.shards === 50 /* cycle 3 D: 25 x (t - 6) for T8, was 2 */, JSON.stringify([before, r]));
    check('no page errors (forge)', A.errors.length === 0, A.errors.join(' | '));
    await A.ctx.close();
  }

  // 3c (round 3, b02-12): a slow double-tap (~340 ms apart, past the 300 ms arm) on "Confirm reforge" still never reaches Salvage: the forge's
  // destructive buttons (Salvage / Confirm) wake only after 400 ms, while the plain ones wake at 300 ms.
  { const A = await open(browser, realm([{ n: 1, id: 'sparkwand', r: 1, t: 8, a: 12345 }, { n: 7, id: 'heartcharm', r: 0 }], { weapon: 1 }, { dust: 200 }), { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const p = A.page;
    for (const sel of ['button.fg[data-forge-open="1"]', 'button.fg[data-forge-pick="blast"]']) { await awake(p, sel); const b = await box(p, sel); await p.touchscreen.tap(b.x, b.y); }
    const yes = 'button.fg[data-forge-yes="reforge"]';
    await awake(p, yes);
    const y = await box(p, yes);
    const before = await p.evaluate(() => ({ dust: window.__mm.arena.save.dust, shards: window.__mm.arena.save.shards }));
    await p.touchscreen.tap(y.x, y.y);
    await p.waitForTimeout(340);
    const mid = await p.evaluate(() => { const s = document.querySelector('button.fg[data-forge-salvage]'); return { sal: !!s, salOff: !!(s && s.disabled) }; });
    await p.touchscreen.tap(y.x, y.y);
    await p.waitForTimeout(600);
    const r = await p.evaluate(() => { const a = window.__mm.arena; const it = a.save.items.find((x) => x.id === 'sparkwand' && x.t === 8); const s = document.querySelector('button.fg[data-forge-salvage]'); return { it: !!it, f: it && it.f && it.f.id, dust: a.save.dust, shards: a.save.shards, salvageQ: !!document.querySelector('button.fg[data-forge-yes="salvage"]'), salOn: !!(s && !s.disabled) }; });
    check('3c. 340 ms after a reforge the Salvage button is still asleep (past the 300 ms plain arm)', mid.sal && mid.salOff, JSON.stringify(mid));
    check('3d. two taps 340 ms apart on "Confirm reforge": the wand still exists (reforged once), no salvage confirm open', r.it && r.f === 'blast' && !r.salvageQ, JSON.stringify(r));
    check('3e. charged exactly once, and Salvage wakes afterwards (not stuck)', before.dust - r.dust === 50 && before.shards - r.shards === 50 && r.salOn, JSON.stringify([before, r]));
    check('no page errors (forge slow double-tap)', A.errors.length === 0, A.errors.join(' | '));
    await A.ctx.close();
  }

  // 3f (cycle 5, b02-r3-01): THREE real taps ~450 ms apart on "Confirm reforge" (the rhythm that destroyed the wand in round 3: tap 2 opened
  // the Salvage ask, tap 3 confirmed it). Taps less than 600 ms apart after "Confirm reforge" form one
  // chain and a Salvage tap inside it is ignored, and "Confirm salvage" sleeps 0.9 s after its ask opens.
  { const A = await open(browser, realm([{ n: 1, id: 'sparkwand', r: 1, t: 8, a: 12345 }, { n: 7, id: 'heartcharm', r: 0 }], { weapon: 1 }, { dust: 200 }), { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const p = A.page;
    for (const sel of ['button.fg[data-forge-open="1"]', 'button.fg[data-forge-pick="blast"]']) { await awake(p, sel); const b = await box(p, sel); await p.touchscreen.tap(b.x, b.y); }
    const yes = 'button.fg[data-forge-yes="reforge"]';
    await awake(p, yes);
    const y = await box(p, yes);
    const before = await p.evaluate(() => ({ dust: window.__mm.arena.save.dust, shards: window.__mm.arena.save.shards }));
    const seen = [];
    for (let k = 0; k < 3; k++) {
      if (k) await p.waitForTimeout(450);
      const under = await p.evaluate((pt) => { const e = document.elementFromPoint(pt.x, pt.y); const b = e && e.closest && e.closest('button'); return b ? (b.dataset.forgeYes ? 'yes:' + b.dataset.forgeYes : b.dataset.forgeSalvage ? 'salvage' : b.dataset.forgePick ? 'pick' : b.dataset.forgeOpen ? 'open' : b.dataset.forgeNo ? 'cancel' : 'other') + (b.disabled ? ':off' : ':on') : 'none'; }, y);
      seen.push(under);
      await p.touchscreen.tap(y.x, y.y);
    }
    await p.waitForTimeout(500);
    const r = await p.evaluate(() => { const a = window.__mm.arena; const it = a.save.items.find((x) => x.id === 'sparkwand' && x.t === 8); return { it: !!it, f: it && it.f && it.f.id, dust: a.save.dust, shards: a.save.shards, salvageQ: !!document.querySelector('button.fg[data-forge-yes="salvage"]'), ask: a._forgeAsk }; });
    check('3f. three taps ~450 ms apart on "Confirm reforge": the wand still exists (reforged once), no salvage ask open', r.it && r.f === 'blast' && !r.salvageQ && !r.ask, JSON.stringify({ r, under: seen }));
    check('3g. charged exactly once over the three taps', before.dust - r.dust === 50 && before.shards - r.shards === 50, JSON.stringify([before, r]));
    // not stuck: a deliberate Salvage after a pause (outside the 600 ms tap chain) opens the ask, Confirm salvage wakes after 0.9 s and salvages
    const sal = 'button.fg[data-forge-salvage]';
    await p.waitForTimeout(700); await awake(p, sal); const sb = await box(p, sal); await p.touchscreen.tap(sb.x, sb.y);
    const cy = 'button.fg[data-forge-yes="salvage"]';
    await p.waitForSelector(cy, { timeout: 2000 });
    const t0 = Date.now(); await awake(p, cy); const wokeMs = Date.now() - t0;
    const cb = await box(p, cy); await p.touchscreen.tap(cb.x, cb.y); await p.waitForTimeout(300);
    const gone = await p.evaluate(() => !window.__mm.arena.save.items.some((x) => x.id === 'sparkwand' && x.t === 8));
    check('3h. later, a deliberate Salvage + Confirm salvage still salvages (the confirm wakes after ~0.9 s, not never)', gone && wokeMs >= 600, JSON.stringify({ gone, wokeMs }));
    check('no page errors (forge triple tap)', A.errors.length === 0, A.errors.join(' | '));
    await A.ctx.close();
  }

  // 4 + (c): the Nexus vendor stall (realm-world.js): a double-tap on Buy buys once; Sell back marks the equipped piece
  { const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&offline=1&seed=12345&qdate=2030-05-01';
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await blockDb(ctx);
    await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' }));
    await ctx.route('**/hub/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>hub</title>hub' }));
    await ctx.routeWebSocket(/.*/, (ws) => ws.close());
    const p = await ctx.newPage(); const errors = [];
    p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    await p.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
    await p.evaluate((v) => { localStorage.clear(); localStorage.setItem('pixeltown-save-v1', v); localStorage.setItem('mm-aim-assist', '0'); },
      JSON.stringify({ realm: { level: 6, xp: 0, shards: 50, bestWave: 2, dust: 100, items: [{ n: 1, id: 'sparkwand', r: 0, t: 2 }, { n: 3, id: 'sparkwand', r: 1, t: 3 }], nextUid: 20, eq: { weapon: 1 } } }));
    await p.goto(WORLD);
    await p.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 30000 });
    const W = (fn) => p.evaluate(`(${fn.toString()})(window.__mm.arena, window.__mm.world)`);
    await W((a, w) => { a.player.iframes = 1e9; a._hitPlayer = () => {}; a.enemies.forEach((e) => { e.active = false; }); const s = w.nexus.site; a.player.x = s.x - 20; a.player.y = s.y; w.nexus.open(); w.nexus.talk('vendor'); return true; });
    const sel = '#rw-nx-stall button[data-vbuy="sparkwand:2"]';
    await p.waitForFunction((q) => { const b = document.querySelector(q); return b && !b.disabled; }, sel, { timeout: 3000 });
    const before = await W((a) => ({ dust: a.save.dust, n: a.save.items.length }));
    const bb = await p.evaluate((q) => { const b = document.querySelector(q); b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); const x = r.x + r.width / 2, y = r.y + r.height / 2; const top = document.elementFromPoint(x, y); return { x, y, top: top ? top.outerHTML.slice(0, 80) : null }; }, sel);
    await p.touchscreen.tap(bb.x, bb.y); await p.waitForTimeout(90); await p.touchscreen.tap(bb.x, bb.y);
    await p.waitForTimeout(400);
    const after = await W((a) => ({ dust: a.save.dust, n: a.save.items.length }));
    const price = await p.evaluate((q) => Number(document.querySelector(q).dataset.price), sel);
    check('4. double-tap vendor Buy: one purchase, dust reduced once', after.n === before.n + 1 && before.dust - after.dust === price, JSON.stringify({ before, after, price }));
    const sb = await p.evaluate(() => [...document.querySelectorAll('#rw-nx-stall button[data-vsell]')].map((b) => ({ n: b.dataset.vsell, t: b.textContent })));
    check('c. the Sell-back list marks the equipped weapon "(equipped)" and only that one', sb.some((x) => x.n === '1' && /\(equipped\)/.test(x.t)) && sb.filter((x) => /equipped/.test(x.t)).length === 1, JSON.stringify(sb));
    check('no page errors (vendor)', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
