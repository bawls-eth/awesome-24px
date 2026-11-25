// Cycle 10 S, ID-55 (approved by L and U in cycle 9, design/IDEAS.md): the first-session ending card. Before this change the Realm had no
// end-of-session beat at all (#rw-firstend did not exist, realm.firstEndSeen was dropped by rmCleanSave), so every check below failed.
// Checked:
//  - save: rmCleanSave keeps realm.firstEndSeen === 1 only (anything else = absent), rmMergeSave unions it, and a Backup round trip carries it;
//  - 1280x720: a first-ever session (fresh save, Lv 1) that reaches ?fesec= game seconds gets ONE card at a quiet moment: Level / Tames /
//    Shards are the save's own numbers, one goal line, "Go: the Isles" (no tame yet) and "Not now", focus on Not now; it writes
//    realm.firstEndSeen = 1; a real Esc closes it, the Menu does not open, focus returns to the game; a reload never shows it again;
//  - quiet gate: with a live enemy kept within 420 px the card waits (why = 'enemy') and shows once the enemy is gone;
//  - game clock: while the backpack is open (arena paused) the session clock does not move;
//  - the first dungeon clear of the session (pixeltown-deep-v1 gains a cleared biome) is due at once, whatever the clock;
//  - a failed save (storage throws) still shows it only once in the visit;
//  - 390x844 and 195x422 (touch): it fits, no sideways scroll inside it, buttons >= 44 px, no word broken across lines, Back closes it.
// OFFLINE: blockDb + every WebSocket closed + the town page stubbed; literal 0 database attempts.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/cyc10-s-first-end.test.js   (SHOTS=<dir> also saves screenshots)
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const LS = require('./lib/load-scale');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const URL0 = ORIGIN + '/game/games/mad-maze/index.html?mode=world&from=hub&test=1&seed=12345&heropick=0&tutorial=0&qdate=2030-05-01';
const W = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__mm.arena, window.__mm.world, ${JSON.stringify(arg === undefined ? null : arg)})`);
const BROKEN_WORDS = `(root) => {
  const out = []; const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    const el = n.parentElement; if (!el || !el.getClientRects().length) continue;
    const re = /\\S+/g; let m;
    while ((m = re.exec(n.data))) {
      if (m[0].length < 2) continue;
      const rg = document.createRange(); rg.setStart(n, m.index); rg.setEnd(n, m.index + m[0].length);
      const tops = new Set([...rg.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top)));
      if (tops.size > 1) out.push(m[0]);
    }
  }
  return out;
}`;
const card = (page) => page.evaluate(`(() => {
  const el = document.getElementById('rw-firstend'); const w = window.__mm.world; const st = w.firstEnd ? w.firstEnd.state() : null;
  if (!el) return { exists: false, st };
  const r = el.getBoundingClientRect(); const shown = !el.hidden && r.width > 0 && r.height > 0;
  const btns = [...el.querySelectorAll('button')].map((b) => { const q = b.getBoundingClientRect(); return { id: b.id, text: b.textContent, w: q.width, h: q.height }; });
  const ae = document.activeElement; const txt = (id) => { const e = document.getElementById(id); return e ? e.textContent : null; };
  let realm = null; try { realm = JSON.parse(localStorage.getItem('pixeltown-save-v1') || '{}').realm || null; } catch (e) { realm = null; }
  return { exists: true, shown, st, btns, focus: ae ? ae.id : '', head: txt('rw-fe-head'), lv: txt('rw-fe-lv'), tames: txt('rw-fe-tames'), shards: txt('rw-fe-shards'), goal: txt('rw-fe-goal'),
    save: { level: window.__mm.arena.save.level, shards: window.__mm.arena.save.shards }, seen: realm ? realm.firstEndSeen : undefined, panel: window.__mm.arena.panel || null,
    inView: r.left >= -0.5 && r.top >= -0.5 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5, innerX: el.scrollWidth > el.clientWidth + 1, hscroll: document.documentElement.scrollWidth > innerWidth + 1,
    broken: shown ? (${BROKEN_WORDS})(el) : [] };
})()`);

async function open(browser, v, url, init) {
  const ctx = await browser.newContext({ viewport: { width: v.view[0], height: v.view[1] }, hasTouch: v.touch, isMobile: v.touch });
  const db = await blockDb(ctx); await ctx.routeWebSocket(/.*/, (ws) => ws.close());
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html>town' }));
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: LS.budget(40000) });
  await W(page, (a) => { a.player.iframes = 1e9; return true; });
  return { ctx, page, db, errors };
}
const waitOpen = (page, ms) => page.waitForFunction(() => window.__mm.world.firstEnd.state().open, null, { timeout: LS.budget(ms) }).then(() => true).catch(() => false);

(async () => {
  const browser = await chromium.launch();
  // ---- 1) save + Backup (in the Realm page: realm.js globals + shared/mm-backup.js) and the desktop card ----
  {
    const v = { view: [1280, 720], touch: false, name: '1280x720' };
    const s = await open(browser, v, URL0 + '&fesec=12'); const { page } = s; // 12 s: page setup under load can take a few game seconds
    const sv = await page.evaluate(() => {
      const a = rmCleanSave({ level: 3, firstEndSeen: 1 }); const b = rmCleanSave({ level: 3, firstEndSeen: 'yes' }); const c = rmCleanSave({ level: 3 });
      const m1 = rmMergeSave({ firstEndSeen: 1 }, {}); const m2 = rmMergeSave({}, { firstEndSeen: 1 }); const m3 = rmMergeSave({}, {});
      return { a: a.firstEndSeen, b: 'firstEndSeen' in b, c: 'firstEndSeen' in c, m1: m1.firstEndSeen, m2: m2.firstEndSeen, m3: 'firstEndSeen' in m3 };
    });
    check('rmCleanSave keeps firstEndSeen === 1 only; a save without it stays without it; rmMergeSave unions it', sv.a === 1 && !sv.b && !sv.c && sv.m1 === 1 && sv.m2 === 1 && !sv.m3, JSON.stringify(sv));
    const c0 = await card(page);
    check(v.name + ': the card exists, hidden at the start of a fresh Lv 1 session (first-ever session: ok = 1)', c0.exists && !c0.shown && c0.st && c0.st.ok === 1 && !c0.st.done, JSON.stringify(c0));
    // game clock: the backpack pauses the arena; the session clock must not move while it is open
    await page.keyboard.press('b'); await page.waitForTimeout(150);
    const p0 = await W(page, (a, w) => ({ paused: !!a.paused, t: w.firstEnd.state().t }));
    await page.waitForTimeout(2500);
    const p1 = await W(page, (a, w) => ({ paused: !!a.paused, t: w.firstEnd.state().t }));
    check(v.name + ': with the arena paused (backpack open) the session clock does not move (game time, not wall time)', p0.paused && p1.paused && Math.abs(p1.t - p0.t) < 0.01, JSON.stringify({ p0, p1 }));
    await page.keyboard.press('b'); await page.waitForTimeout(150);
    // quiet gate: keep one live enemy 150 px from the hero (frozen) past the due time: the card waits
    const held = await W(page, (a) => {
      const e = a.enemies.find((x) => !x.active) || a.enemies[0]; if (!e) return false;
      window.__feHold = e; e.active = true; e.hp = e.maxHp = 1e9; e.speed = 0; e.spd = 0;
      window.__feT = setInterval(() => { if (window.__feHold) { window.__feHold.active = true; window.__feHold.x = a.player.x + 150; window.__feHold.y = a.player.y; window.__feHold.fireT = 99; } }, 16);
      return true;
    });
    await page.waitForFunction(() => window.__mm.world.firstEnd.state().t >= 14, null, { timeout: LS.budget(20000) }).catch(() => null);
    await page.waitForTimeout(1200);
    const cq = await card(page);
    check(v.name + ': due (clock past ?fesec) but a live enemy within 420 px: the card waits (why = enemy)', held && !cq.shown && cq.st.why === 'enemy' && !cq.st.done, JSON.stringify(cq.st));
    await W(page, (a) => { clearInterval(window.__feT); if (window.__feHold) { window.__feHold.active = false; window.__feHold = null; } a.enemies.forEach((e) => { e.active = false; }); return true; });
    const opened = await waitOpen(page, 8000);
    const c1 = await card(page);
    check(v.name + ': once quiet the card opens, focus on "Not now", Go names the Isles (no tame yet)', opened && c1.shown && c1.focus === 'rw-fe-later' && c1.btns.some((b) => b.id === 'rw-fe-go' && b.text === 'Go: the Isles') && c1.btns.some((b) => b.id === 'rw-fe-later' && b.text === 'Not now'), JSON.stringify(c1));
    check(v.name + ': Level / Tames / Shards are the save\'s own numbers, one goal line', c1.lv === String(c1.save.level) && c1.tames === '0' && c1.shards === String(c1.save.shards) && /^Next goal: /.test(c1.goal || ''), JSON.stringify(c1));
    check(v.name + ': it wrote realm.firstEndSeen = 1 to pixeltown-save-v1', c1.seen === 1, JSON.stringify(c1.seen));
    const bk = await page.evaluate(async (o) => {
      await new Promise((res) => { const sc = document.createElement('script'); sc.src = o + '/game/shared/mm-backup.js'; sc.onload = res; sc.onerror = res; document.head.appendChild(sc); });
      if (!window.MMBackup) return { ok: false };
      const bun = MMBackup.bundle(localStorage); const inB = JSON.parse(bun.keys['pixeltown-save-v1']).realm.firstEndSeen;
      const raw = localStorage.getItem('pixeltown-save-v1'); localStorage.removeItem('pixeltown-save-v1');
      const r = MMBackup.restore(localStorage, bun); const back = JSON.parse(localStorage.getItem('pixeltown-save-v1') || '{}');
      if (!back.realm) localStorage.setItem('pixeltown-save-v1', raw);
      return { ok: r.ok, inB, after: back.realm ? back.realm.firstEndSeen : null, cleaned: back.realm ? rmCleanSave(back.realm).firstEndSeen : null };
    }, ORIGIN);
    check('Backup round trip carries realm.firstEndSeen and the Realm cleaner reads it back', bk.ok && bk.inB === 1 && bk.after === 1 && bk.cleaned === 1, JSON.stringify(bk));
    if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + '/cyc10-systems-first-end-1280x720.jpg', type: 'jpeg', quality: 60 }).catch(() => null);
    await page.waitForTimeout(700); // past the kit's click / key hold
    await page.keyboard.press('Escape'); await page.waitForTimeout(250);
    const c2 = await card(page);
    check(v.name + ': a real Esc closes it, the Menu does not open, focus returns to the game', !c2.shown && c2.st.why === 'esc' && !c2.panel && c2.focus === 'realm-canvas-wrap', JSON.stringify(c2));
    await page.reload();
    await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: LS.budget(40000) });
    await W(page, (a) => { a.player.iframes = 1e9; a.enemies.forEach((e) => { e.active = false; }); return true; });
    const again = await waitOpen(page, 9000);
    const c3 = await card(page);
    check(v.name + ': a reload never shows it again (ok = 0 for the rest of the session, firstEndSeen in the save)', !again && !c3.shown && c3.st.ok === 0, JSON.stringify(c3.st));
    check(v.name + ': no page errors, no database traffic (literal 0)', s.errors.length === 0 && s.db.attempts() === 0, s.errors.join(' | ') + ' db=' + s.db.attempts());
    await s.ctx.close();
  }
  // ---- 2) the first dungeon clear of the session is due at once; a failed save shows it only once ----
  {
    const v = { view: [1280, 720], touch: false, name: '1280x720 dungeon+fail' };
    const init = `(() => { const si = Storage.prototype.setItem; Storage.prototype.setItem = function (k, val) { if (window.__failSave && k === 'pixeltown-save-v1') throw new Error('QuotaExceededError'); return si.call(this, k, val); }; })()`;
    const s = await open(browser, v, URL0 + '&fesec=9999', init); const { page } = s;
    await W(page, (a) => { a.enemies.forEach((e) => { e.active = false; }); return true; });
    await page.waitForTimeout(2500);
    const d0 = await card(page);
    check(v.name + ': not due yet (clock far below 9999 s, no dungeon clear)', !d0.shown && !d0.st.done, JSON.stringify(d0.st));
    await page.evaluate(() => { window.__failSave = true; localStorage.removeItem('pixeltown-deep-v1'); Storage.prototype.setItem.call(localStorage, 'x', '1'); });
    await page.evaluate(() => { const si = Object.getPrototypeOf(localStorage).setItem; si.call(localStorage, 'pixeltown-deep-v1', JSON.stringify({ v: 1, f: { warren: 1 } })); });
    await W(page, (a) => { a.enemies.forEach((e) => { e.active = false; }); return true; });
    const op = await waitOpen(page, 8000);
    const d1 = await card(page);
    check(v.name + ': a first dungeon clear this session makes it due at once; with the save failing it still opens', op && d1.shown && d1.st.done, JSON.stringify(d1.st));
    await page.waitForTimeout(700);
    await page.click('#rw-fe-later'); await page.waitForTimeout(250);
    await page.waitForTimeout(3500);
    const d2 = await card(page);
    check(v.name + ': "Not now" closes it and it never reopens in this visit even though the save failed', !d2.shown && d2.st.done && d2.st.why === 'later', JSON.stringify(d2.st));
    check(v.name + ': no page errors, no database traffic (literal 0)', s.errors.length === 0 && s.db.attempts() === 0, s.errors.join(' | ') + ' db=' + s.db.attempts());
    await s.ctx.close();
  }
  // ---- 3) phones: fits, no inner sideways scroll, >= 44 px buttons, no broken words, Back closes it ----
  for (const v of [{ view: [390, 844], touch: true, name: '390x844' }, { view: [195, 422], touch: true, name: '195x422' }]) {
    const s = await open(browser, v, URL0 + '&fesec=3'); const { page } = s;
    await W(page, (a) => { a.enemies.forEach((e) => { e.active = false; }); return true; });
    const op = await waitOpen(page, 15000);
    const c = await card(page);
    check(v.name + ': the card opens and fits the screen, no sideways scroll inside it or on the page', op && c.shown && c.inView && !c.innerX && !c.hscroll, JSON.stringify(c));
    check(v.name + ': both buttons at least 44 x 44 px, no word broken across lines', c.btns.length === 2 && c.btns.every((b) => b.w >= 44 && b.h >= 44) && c.broken.length === 0, JSON.stringify({ btns: c.btns, broken: c.broken }));
    if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + '/cyc10-systems-first-end-' + v.name + '.jpg', type: 'jpeg', quality: 60 }).catch(() => null);
    await page.goBack().catch(() => null); await page.waitForTimeout(400);
    const c2 = await card(page);
    check(v.name + ': the browser Back closes it and stays on the page', !c2.shown && c2.st.why === 'back' && /mad-maze/.test(page.url()), JSON.stringify({ st: c2.st, url: page.url() }));
    check(v.name + ': no page errors, no database traffic (literal 0)', s.errors.length === 0 && s.db.attempts() === 0, s.errors.join(' | ') + ' db=' + s.db.attempts());
    await s.ctx.close();
  }
  await browser.close();
  done();
})();
