// GW (NEXT-SLICES-2 Wave 3, "GW acceptance"): the Forge section in the backpack. Salvage (dust, confirm step) and Reforge (T7+: every
// MMGearForge.reforgeOptions entry with its exact dust + shard cost and value shown BEFORE Confirm; Confirm charges exactly that once and replaces the
// entry keeping t / a and the new `f`). `dust` is an additive realm save field (three-way merged like shards; corrupt -> 0), `f` persists across a
// reload and a cross-tab merge, an old save stays byte-identical, ?gear=0 hides the forge (f kept, ignored), a 390x844 phone has no horizontal
// scroll and every forge target is >= 44 px. Offline: blockDb + every WebSocket closed, no chat, no Firebase writes.
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/gear-forge-ui.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
// The Forge ships behind the GW one-deploy gate (review F3: realm.js RM_FORGE_DEFAULT_ON = false), so these checks open it with ?forge=1;
// the gate-closed default (and ?forge=0) is checked at the end: no forge, nothing creates dust / f, the saved ones are kept.
const MAZE0 = ORIGIN + '/game/games/mad-maze/index.html?test=1&offline=1';
const MAZE = MAZE0 + '&forge=1';
const SAVE = 'pixeltown-save-v1', MM = 'pixeltown-mm-v1', ACTIVE = 'pixeltown-mm-active-v1';
const hero = (id, cls, level) => ({ id, name: cls, cls, level, xp: 0, fame: 0, bonus: 0, mode: 'classic', items: [] });
const prof = (heroes) => ({ v: 1, heroes, stash: new Array(16).fill(null), fame: 0, mode: 'classic', hall: [], migratedFrom: null });
const realm = (extra) => Object.assign({ shards: 100, bestWave: 0, kills: 0, deaths: 0, kb: { spiral: 0, aimed: 0, ring: 0, drifter: 0, boss: 0 }, bossBestT: 0, level: 20, xp: 0,
  items: [{ n: 1, id: 'sparkwand', r: 1, t: 8, a: 12345 }, { n: 3, id: 'sparkwand', r: 0, t: 3 }, { n: 5, id: 'sparkwand', r: 0, t: 11, a: 5 }, { n: 7, id: 'heartcharm', r: 0 }],
  nextUid: 100, eq: { weapon: 1 } }, extra || {});

async function seed(page, rm) {
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate(([k1, p, k2, a, k3, s]) => { localStorage.clear(); localStorage.setItem(k1, JSON.stringify(p)); localStorage.setItem(k2, a); localStorage.setItem(k3, s); },
    [MM, prof([hero('h-1', 'bruiser', 20)]), ACTIVE, JSON.stringify({ v: 1, heroId: 'h-1' }), SAVE, JSON.stringify({ realm: rm })]);
}
async function ctxOf(browser, viewport) {
  const ctx = await browser.newContext({ viewport: viewport || { width: 1000, height: 700 }, hasTouch: !!(viewport && viewport.width < 500), isMobile: !!(viewport && viewport.width < 500) });
  const db = await blockDb(ctx);
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' }));
  await ctx.route('**/hub/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>hub</title>hub' }));
  await ctx.routeWebSocket(/.*/, (ws) => ws.close()); // never reach the live DB
  return { ctx, db };
}
async function go(ctx, errors, query, base) {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto((base || MAZE) + (query || ''));
  await page.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena.active, null, { timeout: 15000 });
  await page.evaluate(() => { const a = window.__mm.arena; a.state = 'play'; a.eBullets.forEach((b) => { b.active = false; }); a.enemies.forEach((e) => { e.active = false; }); a._calcStats(); a.setPaused(true); });
  return page;
}
const stored = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k)).realm, SAVE);
const ui = (page) => page.evaluate(() => {
  const box = document.getElementById('realm-bp-forge');
  const bt = (b) => { const r = b.getBoundingClientRect(); return { t: b.textContent, h: r.height, w: r.width, dis: b.disabled, d: Object.assign({}, b.dataset) }; };
  return { toggles: Array.from(document.querySelectorAll('#realm-bp-list button.fg[data-forge-open]')).map((b) => b.dataset.forgeOpen + ':' + b.getBoundingClientRect().height),
    box: box ? box.textContent : '', btns: box ? Array.from(box.querySelectorAll('button.fg')).map(bt) : [], dust: (document.getElementById('realm-bp-dust') || {}).textContent || '' };
});
const click = (page, sel) => page.click(sel);

(async () => {
  const browser = await chromium.launch();
  const errs = [];

  // ---- one tab: salvage, reforge, reload ----
  { const { ctx, db } = await ctxOf(browser); const p0 = await ctx.newPage(); await seed(p0, realm({ dust: 60 })); await p0.close();
    const page = await go(ctx, errs);
    let u = await ui(page);
    check('every tiered item has a 44 px Forge toggle (the classic charm has none)', u.toggles.length === 3 && u.toggles.every((t) => Number(t.split(':')[1]) >= 44) && !u.toggles.some((t) => t.indexOf('7:') === 0), JSON.stringify(u.toggles));
    check('the backpack header shows the dust calmly', u.dust === '✨ 60 dust', u.dust);
    // salvage T3 (dust 1 + 3 = 4): the first click only asks
    await click(page, 'button.fg[data-forge-open="3"]');
    u = await ui(page);
    const sb = u.btns.find((b) => b.d.forgeSalvage === '3');
    check('the Forge section offers "Salvage for 4 dust"', sb && sb.t === 'Salvage for 4 dust' && sb.h >= 44, JSON.stringify(u.btns));
    await click(page, 'button.fg[data-forge-salvage="3"]');
    u = await ui(page);
    let sv = await page.evaluate(() => ({ dust: window.__mm.arena.save.dust, has: window.__mm.arena.save.items.some((x) => x.n === 3) }));
    check('salvage asks first: a confirm step, nothing changed yet', /Salvage this item for 4 dust\?/.test(u.box) && u.btns.some((b) => b.d.forgeYes === 'salvage') && sv.dust === 60 && sv.has, JSON.stringify({ box: u.box, sv }));
    await click(page, 'button.fg[data-forge-yes="salvage"]');
    sv = await page.evaluate(() => ({ dust: window.__mm.arena.save.dust, has: window.__mm.arena.save.items.some((x) => x.n === 3) }));
    let st = await stored(page);
    check('Confirm salvage removes the item and adds exactly 4 dust (saved)', sv.dust === 64 && !sv.has && st.dust === 64 && !st.items.some((x) => x.n === 3), JSON.stringify({ sv, d: st.dust }));
    // a soulbound T11 can be salvaged (dust 1 + 11 = 12)
    await click(page, 'button.fg[data-forge-open="5"]'); await click(page, 'button.fg[data-forge-salvage="5"]');
    u = await ui(page);
    check('a soulbound item can be salvaged (says so)', /Soulbound items can be salvaged/.test(u.box), u.box);
    await click(page, 'button.fg[data-forge-yes="salvage"]');
    sv = await page.evaluate(() => window.__mm.arena.save.dust);
    check('soulbound salvage adds 12 dust', sv === 76, String(sv));
    // reforge the equipped T8 r1 wand: every option with its exact value + cost before paying
    const rnd = await page.evaluate(() => { window.__rnd = 0; const o = Math.random; Math.random = function () { window.__rnd++; return o.call(Math); }; return true; });
    await click(page, 'button.fg[data-forge-open="1"]');
    u = await ui(page);
    const want = await page.evaluate(() => MMGearForge.reforgeOptions({ n: 1, id: 'sparkwand', r: 1, t: 8, a: 12345 }).map((o) => `${o.text} · ${o.cost.dust} dust + ${o.cost.shards} 💎`));
    const picks = u.btns.filter((b) => b.d.forgePick);
    check('Reforge lists every MMGearForge option with its exact value and dust + shard cost', want.length >= 2 && picks.map((b) => b.t).join('|') === want.join('|') && picks.every((b) => b.h >= 44 && !b.dis), JSON.stringify({ want, got: picks.map((b) => b.t) }));
    await click(page, 'button.fg[data-forge-pick="blast"]');
    u = await ui(page);
    sv = await page.evaluate(() => { const a = window.__mm.arena; return { dust: a.save.dust, shards: a.save.shards, f: !!a.save.items.find((x) => x.n === 1).f }; });
    check('picking an option shows the cost and result first, nothing charged', /Forge Blast \+5 px splash onto this item for 50 dust \+ 2 💎\?/.test(u.box) && sv.dust === 76 && sv.shards === 100 && !sv.f, JSON.stringify({ box: u.box, sv }));
    const pre = await page.evaluate(() => window.__mm.arena.stats.splashR);
    await click(page, 'button.fg[data-forge-yes="reforge"]');
    const after = await page.evaluate(() => { const a = window.__mm.arena; const it = a.save.items.find((x) => x.id === 'sparkwand' && x.t === 8); return { it, eq: a.save.eq.weapon, dust: a.save.dust, shards: a.save.shards, splash: a.stats.splashR, rnd: window.__rnd }; });
    st = await stored(page);
    const sIt = st.items.find((x) => x.id === 'sparkwand' && x.t === 8);
    check('Confirm charges exactly 50 dust + 2 shards once (saved)', after.dust === 26 && after.shards === 98 && st.dust === 26 && st.shards === 98, JSON.stringify(after));
    check('the entry is replaced keeping t, r, a, the new f, and it stays equipped', after.it && after.it.t === 8 && after.it.r === 1 && after.it.a === 12345 && after.it.f && after.it.f.id === 'blast' && after.it.f.v === 5 && after.eq === after.it.n && sIt && sIt.f && sIt.f.id === 'blast', JSON.stringify({ after, sIt }));
    check('the forged affix is applied by _affixInto (splash radius 0 -> 29)', pre === 0 && after.splash === 29, JSON.stringify({ pre, s: after.splash }));
    check('no randomness was used by the forge', after.rnd === 0, String(after.rnd));
    u = await ui(page);
    const cur = u.btns.find((b) => b.d.forgePick === 'blast');
    check('the forged option now reads "forged now" (disabled); unaffordable ones read "not enough"', cur && cur.dis && / · forged now$/.test(cur.t) && u.btns.filter((b) => b.d.forgePick && b.d.forgePick !== 'blast').every((b) => b.dis && / · not enough$/.test(b.t)), JSON.stringify(u.btns.map((b) => b.t)));
    const row = await page.evaluate((n) => { const s = document.querySelector(`#realm-bp-list li[data-uid="${n}"] .rm-afx-i[data-forged="1"]`); return s ? s.textContent : ''; }, after.it.n);
    check('the backpack row shows the forged affix', /⚒ Blast \+5 px splash \(forged\)/.test(row), row);
    await page.reload();
    await page.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena.active, null, { timeout: 15000 });
    const rl = await page.evaluate(() => { const a = window.__mm.arena; a._calcStats(); const it = a.save.items.find((x) => x.id === 'sparkwand' && x.t === 8); return { f: it && it.f, dust: a.save.dust, splash: a.stats.splashR }; });
    check('a reload keeps f (and dust) and still applies it', rl.f && rl.f.id === 'blast' && rl.f.v === 5 && rl.dust === 26 && rl.splash === 29, JSON.stringify(rl));
    check('no DB traffic (blockDb)', db.attempts() === 0, JSON.stringify({ http: db.http, ws: db.ws }));
    await ctx.close(); }

  // ---- two tabs: a reforge in A and a salvage in a stale B merge (f kept, dust three-way) ----
  { const { ctx, db } = await ctxOf(browser); const p0 = await ctx.newPage(); await seed(p0, realm({ dust: 60 })); await p0.close();
    const A = await go(ctx, errs); const B = await go(ctx, errs);
    const nA = await A.evaluate(() => window.__mm.arena.reforge(1, 'swift'));
    const gotB = await B.evaluate(() => { const a = window.__mm.arena; return a.salvage(3); });
    const st = await stored(B);
    const it = st.items.find((x) => x.id === 'sparkwand' && x.t === 8);
    check('cross-tab: A reforges, B salvages: storage keeps the forged item once (with f) and drops the old entry', nA > 0 && gotB === 4 && it && it.f && it.f.id === 'swift' && st.items.filter((x) => x.id === 'sparkwand' && x.t === 8).length === 1 && !st.items.some((x) => x.n === 3), JSON.stringify(st.items));
    check('cross-tab: dust merges three-way (60 - 50 + 4 = 14) and shards (100 - 2 = 98)', st.dust === 14 && st.shards === 98, JSON.stringify({ d: st.dust, s: st.shards }));
    const bView = await B.evaluate(() => { const a = window.__mm.arena; return { f: (a.save.items.find((x) => x.id === 'sparkwand' && x.t === 8) || {}).f, dust: a.save.dust }; });
    check('tab B now holds the forged item too', bView.f && bView.f.id === 'swift' && bView.dust === 14, JSON.stringify(bView));
    check('no DB traffic (blockDb)', db.attempts() === 0);
    await ctx.close(); }

  // ---- an old save (no dust, no f) stays byte-identical; corrupt dust / f are cleaned ----
  { const { ctx } = await ctxOf(browser); const old = realm({ gv: 1 }); const p0 = await ctx.newPage(); await seed(p0, old); await p0.close();
    const page = await go(ctx, errs);
    const r = await page.evaluate((o) => { const a = window.__mm.arena; a.onSave(a.save); const s = JSON.parse(localStorage.getItem('pixeltown-save-v1')).realm;
      return { same: JSON.stringify(rmCleanSave(o)) === JSON.stringify(o), stored: JSON.stringify(s) === JSON.stringify(o), keys: 'dust' in s,
        bad: rmCleanSave(Object.assign({}, o, { dust: 'abc', items: [{ n: 1, id: 'sparkwand', r: 0, t: 8, a: 9, f: { id: 'evil', v: 1 } }, { n: 2, id: 'sparkwand', r: 0, t: 5, f: { id: 'keen', v: 0.04 } }, { n: 3, id: 'sparkwand', r: 0, t: 9, a: 3, f: { id: 'keen', v: 'x' } }, { n: 4, id: 'sparkwand', r: 0, t: 9, a: 3, f: { id: 'keen', v: 0.05 } }] })),
        neg: rmCleanSave(Object.assign({}, o, { dust: -5 })).dust }; }, old);
    check('an old save cleans to itself and is written back byte-identical (no dust key added)', r.same && r.stored && !r.keys, JSON.stringify({ same: r.same, stored: r.stored, keys: r.keys }));
    check('corrupt dust -> 0', r.bad.dust === 0 && r.neg === 0, JSON.stringify({ d: r.bad.dust, n: r.neg }));
    check('f is kept only on t >= 7 with a known affix id and a number', !('f' in r.bad.items[0]) && !('f' in r.bad.items[1]) && !('f' in r.bad.items[2]) && r.bad.items[3].f && r.bad.items[3].f.id === 'keen' && r.bad.items[3].f.v === 0.05, JSON.stringify(r.bad.items));
    await ctx.close(); }

  // ---- ?gear=0: no forge, f kept but ignored ----
  { const { ctx } = await ctxOf(browser); const p0 = await ctx.newPage();
    await seed(p0, realm({ dust: 9, items: [{ n: 1, id: 'sparkwand', r: 1, t: 8, a: 12345, f: { id: 'blast', v: 5 } }], nextUid: 10 })); await p0.close();
    const page = await go(ctx, errs, '&gear=0');
    const u = await ui(page);
    const r = await page.evaluate(() => { const a = window.__mm.arena; a.onSave(a.save); const s = JSON.parse(localStorage.getItem('pixeltown-save-v1')).realm; return { on: a.forgeOn(), splash: a.stats.splashR, f: s.items[0].f, dust: s.dust, hud: !!document.getElementById('realm-dust') }; });
    check('?gear=0 hides the forge (no toggle, no dust line, no HUD dust)', u.toggles.length === 0 && u.dust === '' && !r.on && !r.hud, JSON.stringify({ u, r }));
    check('?gear=0 ignores f (no splash) but keeps f and dust in the save', r.splash === 0 && r.f && r.f.id === 'blast' && r.dust === 9, JSON.stringify(r));
    await ctx.close(); }

  // ---- GW gate closed (the default, and ?forge=0 even with ?forge=1): no forge UI, salvage / reforge refused, dust + f kept and f still counts ----
  for (const q of ['', '&forge=0', '&forge=1&forge=0']) {
    const { ctx } = await ctxOf(browser); const p0 = await ctx.newPage();
    await seed(p0, realm({ dust: 9, items: [{ n: 1, id: 'sparkwand', r: 1, t: 8, a: 12345, f: { id: 'blast', v: 5 } }, { n: 3, id: 'sparkwand', r: 0, t: 3 }], nextUid: 10 })); await p0.close();
    const page = await go(ctx, errs, q, MAZE0);
    const u = await ui(page);
    const r = await page.evaluate(() => { const a = window.__mm.arena; const sal = a.salvage(3); const rf = a.reforge(1, 'keen'); a.onSave(a.save); const s = JSON.parse(localStorage.getItem('pixeltown-save-v1')).realm;
      return { on: a.forgeOn(), gate: RM_FORGE_ON, def: RM_FORGE_DEFAULT_ON, sal, rf, opts: a.reforgeOptions(1), info: a.salvageInfo(3), splash: a.stats.splashR, f: s.items[0].f, dust: s.dust, n: s.items.length, hud: !!document.getElementById('realm-dust') }; });
    check(`gate closed (${q || 'default'}): RM_FORGE_DEFAULT_ON is false, no forge toggle, no dust line, no HUD dust`, r.def === false && !r.gate && !r.on && u.toggles.length === 0 && u.dust === '' && !r.hud, JSON.stringify({ u, r }));
    check(`gate closed (${q || 'default'}): salvage and reforge create nothing (no dust, no f), the items stay`, r.sal === 0 && r.rf === 0 && r.opts === null && r.info === null && r.dust === 9 && r.n === 2 && r.f && r.f.id === 'blast' && r.f.v === 5, JSON.stringify(r));
    check(`gate closed (${q || 'default'}): an already forged f still counts (splash from forged blast)`, r.splash > 0, JSON.stringify(r));
    await ctx.close();
  }

  // ---- phone 390x844: no horizontal scroll, every forge target >= 44 px ----
  { const { ctx } = await ctxOf(browser, { width: 390, height: 844 }); const p0 = await ctx.newPage(); await seed(p0, realm({ dust: 400 })); await p0.close();
    const page = await go(ctx, errs);
    await page.evaluate(() => { const b = document.querySelector('button.fg[data-forge-open="1"]'); b.scrollIntoView(); });
    await page.tap('button.fg[data-forge-open="1"]');
    let u = await ui(page);
    const sw = () => page.evaluate(() => ({ doc: document.documentElement.scrollWidth, w: window.innerWidth, card: (() => { const c = document.querySelector('#realm-backpack .realm-bp-card'); return c ? c.scrollWidth - c.clientWidth : 0; })() }));
    let w = await sw();
    check('phone: the open forge fits (no horizontal page or card scroll)', w.doc <= w.w && w.card <= 1, JSON.stringify(w));
    check('phone: every forge button is at least 44 x 44 px', u.btns.length >= 3 && u.btns.every((b) => b.h >= 44 && b.w >= 44), JSON.stringify(u.btns.map((b) => [b.t, b.h, b.w])));
    await page.tap('button.fg[data-forge-pick="reach"]');
    u = await ui(page); w = await sw();
    check('phone: the reforge confirm step fits and its buttons are >= 44 px', w.doc <= w.w && w.card <= 1 && u.btns.length === 2 && u.btns.every((b) => b.h >= 44 && b.w >= 44), JSON.stringify({ w, b: u.btns.map((b) => [b.t, b.h, b.w]) }));
    const hud = await page.evaluate(() => { const a = window.__mm.arena; a._syncHud(); const d = document.getElementById('realm-dust'); return d ? d.textContent : ''; });
    check('the HUD shows the dust next to the shards', hud === '✨ 400', hud);
    await ctx.close(); }

  check('no console errors', errs.length === 0, JSON.stringify(errs.slice(0, 5)));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
