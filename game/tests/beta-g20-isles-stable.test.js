// G-20 / G-21 (b05-01, b05-02): the Isles Pack > Party tab is a Stable. Every tame is a row with real 44 px buttons: Join party / Rest
// (party limit respected, companions spawn / despawn, one stable write) and Ride on rideable tames (tames.mount, the next mount-up rides
// that species, its own saddle). Choices persist after a reload; an old save loads unchanged. Offline: blockDb, no chat, no Firebase writes.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-g20-isles-stable.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/isles/index.html';
const PROFILE = { v: 1, heroes: [{ id: 'h1', name: 'Fern', cls: 'druid', level: 7, xp: 10, items: [] }], stash: [], fame: 0, mode: 'classic', hall: [] };
const T = (id, sp, nm) => ({ id, sp, nm, lv: 4, xp: 0, bond: 2, aff: 0, cos: '', isle: 'jungle', d: '2026-11-01' });
const seedOf = (tames) => ({ 'pixeltown-mm-v1': JSON.stringify(PROFILE), 'pixeltown-mm-active-v1': JSON.stringify({ v: 1, heroId: 'h1' }), 'pixeltown-tames-v1': JSON.stringify(tames) });
const ev = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__isles, ${JSON.stringify(arg === undefined ? null : arg)})`);

async function open(browser, seed, query) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  await blockDb(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.addInitScript((s) => { if (sessionStorage.seeded) return; sessionStorage.seeded = '1'; localStorage.clear(); Object.keys(s).forEach((k) => localStorage.setItem(k, s[k])); }, seed);
  await page.goto(PAGE + '?test=1&seed=123' + (query || ''));
  await page.waitForFunction(() => window.__isles && window.__isles.world, null, { timeout: 15000 });
  await ev(page, (I) => { I.pause(true); I.god(true); I.clearCreatures(); const t = I.findTile(null, 13); I.teleport(t.x, t.y); I.step(0, 0, 0.2); return true; });
  return { ctx, page, errors };
}
const reload = async (page) => { await page.reload(); await page.waitForFunction(() => window.__isles && window.__isles.world, null, { timeout: 15000 }); };
const openParty = async (page) => { const open = await page.evaluate(() => !document.getElementById('panel').hidden); await page.click(open ? '#tab-party' : '#btn-pack'); if (open) await page.evaluate(() => window.__isles.closePanel()).then(() => page.click('#btn-pack')); await page.waitForSelector('#party-list li.stable-row'); };
const row = (page, id) => page.evaluate((t) => { const li = document.querySelector(`#party-list li[data-tame="${t}"]`); if (!li) return null; return { text: li.textContent, btns: [...li.querySelectorAll('button')].map((b) => { const r = b.getBoundingClientRect(); return { cls: b.className, t: b.textContent, dis: b.disabled, why: b.title, h: r.height, w: r.width }; }) }; }, id);
const clickBtn = (page, id, cls) => page.click(`#party-list li[data-tame="${id}"] button.${cls}`);

(async () => {
  const browser = await chromium.launch();

  // 1 + 4 + 5: three rideable tames; Ride on the third; a saddle for mount #2 shows on mount #2
  const old = { v: 1, n: 3, roster: [T('t1', 'tusktop', 'Tuskie'), T('t2', 'stegolith', 'Stego'), T('t3', 'shagtusk', 'Shaggy')], party: [], mount: 't1' };
  let s = await open(browser, seedOf(old));
  const loaded = await ev(s.page, (I) => I.tames());
  check('5. an old stable (party / mount set by the old code) loads unchanged', JSON.stringify(loaded.roster.map((x) => x.id)) === '["t1","t2","t3"]' && loaded.mount === 't1' && loaded.party.length === 0, JSON.stringify(loaded));
  await openParty(s.page);
  const r3 = await row(s.page, 't3');
  check('stable: every tame is a row (name, species, level, what it does) with a Ride button >= 44 px', (await s.page.locator('#party-list li.stable-row').count()) === 3 && /Shaggy/.test(r3.text) && /Lv 4/.test(r3.text) && /resting/.test(r3.text) && r3.btns.some((b) => /st-ride/.test(b.cls) && !b.dis && b.h >= 44 && b.w >= 44), JSON.stringify(r3));
  await clickBtn(s.page, 't3', 'st-ride');
  const m = await ev(s.page, (I) => { I.give('saddle_shagtusk', 1); I.closePanel && I.closePanel(); const before = I.tames().mount; const ok = I.ride(); I.render(); const rd = I.riding(); return { before, ok, rd }; });
  check('1. Ride on the third tame: tames.mount = t3 and the next mount-up rides and draws it (rideDrawn)', m.before === 't3' && m.rd && m.rd.id === 't3' && /shagtusk/.test(m.rd.drawn), JSON.stringify(m));
  await reload(s.page);
  check('1b. the chosen mount persists after a reload', (await ev(s.page, (I) => I.tames().mount)) === 't3');
  const g4 = await ev(s.page, (I) => { I.pause(true); return true; });
  await openParty(s.page);
  await clickBtn(s.page, 't2', 'st-ride');
  const sad = await ev(s.page, (I) => { const noSaddle = I.ride(); const a = I.riding(); I.give('saddle_stegolith', 1); const ok = I.ride(); const rd = I.riding(); return { noSaddle: !!a, ok: !!ok, rd, inv: I.inv().saddle_stegolith }; });
  check('4. mount #2 (Stego) needs its own saddle; with the crafted saddle it is ridden', g4 && !sad.noSaddle && sad.rd && sad.rd.id === 't2', JSON.stringify(sad));
  await openParty(s.page);
  const busy = await row(s.page, 't1');
  check('swaps wait while riding: Ride on another tame is disabled with a reason', busy.btns.some((b) => /st-ride/.test(b.cls) && b.dis && /Get off/.test(b.why)), JSON.stringify(busy));
  check('no page errors (mounts)', s.errors.length === 0, s.errors.join(' | '));
  await s.ctx.close();

  // 2 + 3: four companions, party of 2: Rest A, Join C
  const four = { v: 1, n: 4, roster: [T('t1', 'fernraptor', 'Ava'), T('t2', 'fernraptor', 'Bix'), T('t3', 'fernraptor', 'Cog'), T('t4', 'fernraptor', 'Dot')], party: ['t1', 't2'], mount: null };
  s = await open(browser, seedOf(four));
  await openParty(s.page);
  const full = await row(s.page, 't3');
  check('3. with a full party (2) Join is disabled with a reason', full.btns.some((b) => /st-join/.test(b.cls) && b.dis && /full/.test(b.why)), JSON.stringify(full));
  await clickBtn(s.page, 't1', 'st-rest');
  await clickBtn(s.page, 't3', 'st-join');
  const p2 = await ev(s.page, (I) => ({ party: I.tames().party, live: I.party().map((p) => p.id) }));
  check('2. Rest A then Join C: tames.party = [B, C], exactly 2 companions, A\'s entity is gone', JSON.stringify(p2.party) === '["t2","t3"]' && p2.live.length === 2 && p2.live.indexOf('t1') < 0 && p2.live.indexOf('t3') >= 0, JSON.stringify(p2));
  await reload(s.page);
  const p3 = await ev(s.page, (I) => ({ party: I.tames().party, live: I.party().map((p) => p.id) }));
  check('2b. the party persists after a reload', JSON.stringify(p3.party) === '["t2","t3"]' && p3.live.join() === 't2,t3', JSON.stringify(p3));
  check('2c. stable buttons are keyboard reachable (real <button>s)', await s.page.evaluate(() => [...document.querySelectorAll('#party-list button')].every((b) => b.tagName === 'BUTTON' && b.tabIndex >= 0)));
  await s.ctx.close();

  // 3b: low tier: party of 1
  s = await open(browser, seedOf({ v: 1, n: 2, roster: [T('t1', 'fernraptor', 'Ava'), T('t2', 'fernraptor', 'Bix')], party: ['t1'], mount: null }), '&perf=low');
  await openParty(s.page);
  const low = await row(s.page, 't2');
  check('3b. low tier: a party of 1 is full (Join disabled with a reason)', low.btns.some((b) => /st-join/.test(b.cls) && b.dis && /\(1\)/.test(b.why)), JSON.stringify(low));
  check('no page errors (party)', s.errors.length === 0, s.errors.join(' | '));
  await s.ctx.close();

  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
