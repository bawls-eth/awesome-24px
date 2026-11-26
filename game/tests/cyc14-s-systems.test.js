// Cycle 14 S: the approved ideas ID-65, ID-66, ID-62, ID-63 (specs: U cycle 13 in design/beta/cycle13-ui.md, L conditions in design/IDEAS.md).
//   [65T] Town "Not saved" chip: storage refuses pixeltown-save-v1 (quota stub, as cyc11-lead-town-stars) -> #save-warn shows under the corner
//         Menu, role=status wrapper, >= 44 px, inside the screen, covering no other control (sweep OVERLAP rule) at 1280x720, 390x844,
//         195x422 and 160x284; stays after 10 s and after a shop (workbench) closes; a tap opens the note (Esc closes it) and retries once;
//         the stub lifted + one change = the chip is gone. No new save key.
//   [65R] Realm chip: the same in Realm World (#realm-save-warn) driven by arena.saveOk, at 1280x720, 390x844, 195x422; gone after a landed write.
//   [66]  Goal card (the Realm Gate chip): after the gate step, a bot chops wood with real E presses -> "Craft a Plank Stack at the
//         workbench" (195 px: "Craft planks at the workbench", <= 2 lines, no broken word, inside the screen, off the controls) -> real
//         E at the workbench + a real click on Plank Stack -> "Place it at your home" -> real E at home + choosing the plot -> the card is gone.
//         A returning player who already placed something never sees the chain. No new save key.
//   [62]  Treat bubble: a liked animal (animalHello bit set on an earlier visit) shows one bubble near the hero, an unmet one does not; a real
//         E (desktop) / A tap (195x422) with a flower in the bag gives exactly 1 (lowest value first), shows the heart and the line, the line
//         clear of A / C / the bag bar; an empty bag loses nothing and the bubble goes; at most one per 90 s.
//   [63]  Isles callback: a seeded Isles tame shows the line once and sets islesTameSeen; a reload does not show it again; no tames = nothing
//         and the save stays byte-identical (old save without the bit loads unchanged).
// OFFLINE: helpers.offlineStub / blockDb, literal db.attempts() === 0. Never chats, never writes Firebase.
// Run: BASE=http://localhost:9105/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc14-s-systems.test.js   (SHOTS=<dir>; ONLY=65T,65R,66,62,63)
const { chromium } = require('playwright');
const { check, done, offlineStub, blockDb, exposeGame, joinOffline } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const ORIGIN = BASE.replace(/\/game\/index\.html.*$/, '');
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&offline=1&seed=12345&qdate=2030-05-01&tutorial=0';
const SHOTS = process.env.SHOTS || '';
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const want = (k) => !ONLY || ONLY.includes(k);
const VERSION = 'v34-aquarium';
const ALL = [2 ** 30 - 1, 2 ** 27 - 1]; // every fauna greeted already (57 fauna = 30 + 27 bits)
const QUOTA = () => {
  const orig = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) { if (window.__quota && k === 'pixeltown-save-v1') { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; } return orig.call(this, k, v); };
};

const seedTown = (ctx, obj, gate) => ctx.addInitScript(([o, g]) => {
  if (!localStorage.getItem('__cyc14s')) {
    const town = Object.assign({}, o); delete town.__tames;
    localStorage.setItem('pixeltown-save-v1', JSON.stringify(town)); localStorage.setItem('__cyc14s', '1');
    if (g) localStorage.setItem('pixeltown-gate-pointer-v1', JSON.stringify(g));
    if (o.__tames) localStorage.setItem('pixeltown-tames-v1', JSON.stringify(o.__tames));
  }
}, [obj, gate || null]);
async function openTown(ctx, page) {
  const errors = [];
  page = page || await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await exposeGame(page);
  await page.goto(BASE);
  await joinOffline(page, 'ADMINcs');
  await page.waitForFunction(() => { const t = document.getElementById('achievement-toast'); return !t || t.classList.contains('hidden'); }, null, { timeout: 15000 }).catch(() => null);
  return { page, errors };
}
const ctxFor = (browser, vp) => browser.newContext(vp.touch ? { viewport: { width: vp.width, height: vp.height }, hasTouch: true, isMobile: true } : { viewport: { width: vp.width, height: vp.height } });
const VPS = [{ width: 1280, height: 720, touch: false }, { width: 390, height: 844, touch: true }, { width: 195, height: 422, touch: true }, { width: 160, height: 284, touch: true }];
const tagOf = (vp) => `${vp.width}x${vp.height}`;

// The a11y sweep's OVERLAP rule (visible interactive controls covering each other by > 2 px), limited to pairs that include `id`.
const overlapsOf = (page, id) => page.evaluate((cid) => {
  const vw = innerWidth, vh = innerHeight;
  const sel = (e) => (e.id ? '#' + e.id : e.tagName.toLowerCase() + ((e.getAttribute('class') || '').trim() ? '.' + e.getAttribute('class').trim().split(/\s+/)[0] : ''));
  const hidden = (e) => { for (let n = e; n && n.nodeType === 1; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden' || n.hidden || n.getAttribute('aria-hidden') === 'true' || n.hasAttribute('inert') || parseFloat(cs.opacity) === 0) return true; } return false; };
  const Q = 'a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=link],[role=tab],[role=checkbox],[role=switch],[role=application],[tabindex]:not([tabindex="-1"])';
  const me = document.getElementById(cid); const r = me.getBoundingClientRect();
  const out = [];
  [...document.querySelectorAll(Q)].filter((e) => e !== me && !e.disabled && !hidden(e) && !e.contains(me) && !me.contains(e)).forEach((e) => {
    const q = e.getBoundingClientRect();
    if ((e.tagName === 'CANVAS' || e.getAttribute('role') === 'application') && q.width * q.height >= 0.5 * vw * vh) return;
    const ox = Math.min(r.right, q.right, vw) - Math.max(r.left, q.left, 0), oy = Math.min(r.bottom, q.bottom, vh) - Math.max(r.top, q.top, 0);
    if (ox > 2 && oy > 2) out.push(sel(e) + ' ' + Math.round(ox) + 'x' + Math.round(oy));
  });
  return out;
}, id);
const chipState = (page, id) => page.evaluate((cid) => {
  const c = document.getElementById(cid);
  if (!c) return { exists: false, shown: false };
  const r = c.getBoundingClientRect();
  const shown = !c.hidden && getComputedStyle(c).display !== 'none' && r.width > 0;
  return { exists: true, shown, w: Math.round(r.width), h: Math.round(r.height), l: r.left, t: r.top, r: r.right, b: r.bottom, vw: innerWidth, vh: innerHeight,
    text: c.textContent, role: c.parentElement && c.parentElement.getAttribute('role'), label: c.getAttribute('aria-label'), fs: parseFloat(getComputedStyle(c).fontSize) };
}, id);

(async () => {
  const browser = await chromium.launch();

  // ---------------- [65T] Town chip ----------------
  if (want('65T')) for (const vp of VPS) {
    const tag = tagOf(vp);
    const ctx = await ctxFor(browser, vp);
    const db = await offlineStub(ctx);
    await seedTown(ctx, { name: 'ADMINcs', species: 'cat', frame: 0, lastSeenVersion: VERSION, animalHello: ALL, resources: { wood: 4 } }, { v: 1, dismissed: true, reached: true });
    await ctx.addInitScript(QUOTA);
    const { page, errors } = await openTown(ctx);
    let c = await chipState(page, 'save-warn');
    check(`[65T ${tag}] storage fine: no chip`, c.exists && !c.shown, JSON.stringify(c));
    const keysBefore = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('pixeltown-save-v1') || '{}')).sort().join());
    await page.evaluate(() => { window.__quota = true; window.__g.scene.getScene('Town').incrementStat('ADMINcsTest'); });
    await page.waitForTimeout(600);
    c = await chipState(page, 'save-warn');
    check(`[65T ${tag}] a refused write: the chip shows "⚠ Not saved" in a role=status wrapper, with its label`, c.shown && c.text === '⚠ Not saved' && c.role === 'status' && /not being saved/.test(c.label || ''), JSON.stringify(c));
    check(`[65T ${tag}] chip >= 44 x 44, text >= 12 px, inside the screen`, c.w >= 44 && c.h >= 44 && c.fs >= 12 && c.l >= 0 && c.t >= 0 && c.r <= c.vw && c.b <= c.vh, JSON.stringify(c));
    const nav = await page.evaluate(() => { const n = document.getElementById('mm-nav-btn'); const r = n && n.getBoundingClientRect(); return r && r.width ? { l: r.left, b: r.bottom } : null; });
    check(`[65T ${tag}] the chip sits in the left column under the corner Menu`, !!nav && Math.abs(c.l - nav.l) <= 1 && c.t >= nav.b + 3, JSON.stringify([nav, c]));
    const ov = await overlapsOf(page, 'save-warn');
    check(`[65T ${tag}] the chip covers no other control (sweep OVERLAP rule)`, ov.length === 0, ov.join(', '));
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/cyc14-systems-savewarn-town-${tag}.jpg`, type: 'jpeg', quality: 75 });
    if (vp.width === 1280) {
      await page.waitForTimeout(10000);
      c = await chipState(page, 'save-warn');
      check(`[65T ${tag}] still there after 10 s (no timer)`, c.shown, JSON.stringify(c));
      await page.evaluate(() => { const s = window.__g.scene.getScene('Town'); s.openWorkbench(); s.closeWorkbench(); });
      await page.waitForTimeout(400);
      check(`[65T ${tag}] still there after a shop (workbench) closes`, (await chipState(page, 'save-warn')).shown);
      const r0 = await page.evaluate(() => window.__g.scene.getScene('Town').saveWarnRetries || 0);
      await page.click('#save-warn');
      await page.waitForTimeout(300);
      const n1 = await page.evaluate(() => { const n = document.getElementById('save-warn-note'); const s = window.__g.scene.getScene('Town'); return { open: !n.classList.contains('hidden'), text: n.textContent, focus: document.activeElement && document.activeElement.id, retries: s.saveWarnRetries || 0 }; });
      check(`[65T ${tag}] a tap opens the note (focus on its ✕) and retries the save once`, n1.open && /refused to save/.test(n1.text) && n1.focus === 'save-warn-note-close' && n1.retries === r0 + 1, JSON.stringify(n1));
      const xs = await page.evaluate(() => { const r = document.getElementById('save-warn-note-close').getBoundingClientRect(); return [r.width, r.height]; });
      check(`[65T ${tag}] the note's ✕ is 44 x 44`, xs[0] >= 44 && xs[1] >= 44, JSON.stringify(xs));
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/cyc14-systems-savewarn-note-${tag}.jpg`, type: 'jpeg', quality: 75 });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
      const n2 = await page.evaluate(() => ({ open: !document.getElementById('save-warn-note').classList.contains('hidden'), chip: !document.getElementById('save-warn').hidden }));
      check(`[65T ${tag}] Esc closes the note; the chip stays (storage still refuses)`, !n2.open && n2.chip, JSON.stringify(n2));
    }
    {
      // U review: the note is never covered (corner Menu / compass included): 5 points of its box hit the note itself
      await page.evaluate(() => document.getElementById('save-warn').click());
      await page.waitForTimeout(250);
      const nc = await page.evaluate(() => {
        const n = document.getElementById('save-warn-note'); const r = n.getBoundingClientRect();
        const pts = [[0.05, 0.1], [0.95, 0.1], [0.05, 0.9], [0.95, 0.9], [0.5, 0.5]].map(([fx, fy]) => { const e = document.elementFromPoint(r.left + fx * r.width, r.top + fy * r.height); return !!e && n.contains(e); });
        return { open: !n.classList.contains('hidden'), pts, inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, r: [r.left, r.top, r.right, r.bottom] };
      });
      check(`[65T ${tag}] the open note is inside the screen and nothing covers it (5 points hit the note)`, nc.open && nc.inside && nc.pts.every(Boolean), JSON.stringify(nc));
      if (SHOTS && vp.width < 1280) await page.screenshot({ path: `${SHOTS}/cyc14-systems-savewarn-note-${tag}.jpg`, type: 'jpeg', quality: 75 });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(150);
    }
    await page.evaluate(() => { window.__quota = false; window.__g.scene.getScene('Town').incrementStat('ADMINcsTest'); });
    await page.waitForTimeout(600);
    c = await chipState(page, 'save-warn');
    const keysAfter = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('pixeltown-save-v1') || '{}')).filter((k) => k !== 'lifetimeStats' && k !== 'achievementsUnlocked').sort().join());
    check(`[65T ${tag}] storage works again + one change: the chip is gone`, !c.shown, JSON.stringify(c));
    check(`[65T ${tag}] no new save key from the chip`, keysAfter.split(',').every((k) => keysBefore.split(',').includes(k)), JSON.stringify([keysBefore, keysAfter]));
    check(`[65T ${tag}] no page errors, 0 database attempts`, errors.length === 0 && db.attempts() === 0, JSON.stringify([errors, db.attempts()]));
    await ctx.close();
  }

  // ---------------- [65R] Realm chip ----------------
  if (want('65R')) for (const vp of VPS.slice(0, 3)) {
    const tag = tagOf(vp);
    const ctx = await ctxFor(browser, vp);
    const db = await blockDb(ctx); await ctx.routeWebSocket(/.*/, (ws) => ws.close());
    await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' }));
    const page = await ctx.newPage(); const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem('pixeltown-save-v1', JSON.stringify({ realm: { level: 1, xp: 0, shards: 100, bestWave: 0, items: [], nextUid: 20, eq: {} } })); localStorage.setItem('mm-aim-assist', '0'); });
    await page.addInitScript(QUOTA);
    await page.goto(WORLD);
    await page.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 60000 });
    await page.evaluate(() => { const a = window.__mm.arena; a.player.iframes = 1e9; a._hitPlayer = () => {}; });
    let c = await chipState(page, 'realm-save-warn');
    check(`[65R ${tag}] storage fine: no chip`, !c.shown, JSON.stringify(c));
    await page.evaluate(() => { window.__quota = true; const a = window.__mm.arena; a.save.shards += 1; a.onSave(a.save); });
    await page.waitForTimeout(500);
    c = await chipState(page, 'realm-save-warn');
    const ok = await page.evaluate(() => window.__mm.arena.saveOk);
    check(`[65R ${tag}] a refused Realm write (saveOk false): the chip shows, role=status wrapper`, ok === false && c.shown && c.text === '⚠ Not saved' && c.role === 'status', JSON.stringify([ok, c]));
    check(`[65R ${tag}] chip >= 44 x 44, inside the screen`, c.w >= 44 && c.h >= 44 && c.l >= 0 && c.t >= 0 && c.r <= c.vw && c.b <= c.vh, JSON.stringify(c));
    const ov = await overlapsOf(page, 'realm-save-warn');
    check(`[65R ${tag}] the chip covers no other control`, ov.length === 0, ov.join(', '));
    if (vp.width > 300) {
      const lr = await page.evaluate(() => { const i = document.getElementById('realm-info').getBoundingClientRect(), w = document.getElementById('realm-save-warn').getBoundingClientRect(); return { sameRow: Math.abs((i.top + i.bottom) / 2 - (w.top + w.bottom) / 2) < 30, left: w.right <= i.left + 1, it: i.top, wt: w.top }; });
      check(`[65R ${tag}] > 300 px: in the HUD, left of #realm-info (or on the button row above a wrapped info line)`, lr.left || !lr.sameRow, JSON.stringify(lr));
    } else {
      const ul = await page.evaluate(() => { const l = document.getElementById('realm-leave-btn').getBoundingClientRect(), w = document.getElementById('realm-save-warn').getBoundingClientRect(); return { below: w.top >= l.bottom + 3, lt: l.bottom, wt: w.top }; });
      check(`[65R ${tag}] <= 300 px: under the Leave button`, ul.below, JSON.stringify(ul));
    }
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/cyc14-systems-savewarn-realm-${tag}.jpg`, type: 'jpeg', quality: 75 });
    const r0 = await page.evaluate(() => window.__mm.arena.saveWarnRetries || 0);
    await page.evaluate(() => document.getElementById('realm-save-warn').click());
    await page.waitForTimeout(200);
    const n1 = await page.evaluate(() => ({ open: !document.getElementById('realm-save-warn-note').classList.contains('hidden'), retries: window.__mm.arena.saveWarnRetries || 0 }));
    check(`[65R ${tag}] a tap opens the note and retries once`, n1.open && n1.retries === r0 + 1, JSON.stringify(n1));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    const n2 = await page.evaluate(() => ({ open: !document.getElementById('realm-save-warn-note').classList.contains('hidden'), panel: window.__mm.arena.panel || null }));
    check(`[65R ${tag}] Esc closes the note and nothing behind it`, !n2.open && !n2.panel, JSON.stringify(n2));
    await page.evaluate(() => { window.__quota = false; const a = window.__mm.arena; a.save.shards += 1; a.onSave(a.save); });
    await page.waitForTimeout(400);
    c = await chipState(page, 'realm-save-warn');
    check(`[65R ${tag}] the first write that lands removes the chip`, !c.shown, JSON.stringify(c));
    check(`[65R ${tag}] no page errors, 0 database attempts`, errors.length === 0 && db.attempts() === 0, JSON.stringify([errors, db.attempts()]));
    await ctx.close();
  }

  // ---------------- [66] goal card chain ----------------
  const card = (page) => page.evaluate(() => {
    const e = document.getElementById('gate-pointer'), lab = document.getElementById('gate-pointer-label'), txt = document.getElementById('gate-pointer-text');
    const r = e.getBoundingClientRect();
    const shown = !e.classList.contains('hidden') && getComputedStyle(e).display !== 'none' && r.width > 0;
    const rg = document.createRange(); rg.selectNodeContents(txt);
    // lines = clusters of rect centres more than 8 px apart (the 18 px arrow glyph sits a few px off the 12 px text on the same line)
    const cs = [...rg.getClientRects()].filter((q) => q.width > 0.5).map((q) => (q.top + q.bottom) / 2).sort((a, b) => a - b);
    const tops = { size: cs.reduce((n, c, i) => n + (i === 0 || c - cs[i - 1] > 8 ? 1 : 0), 0) };
    // a broken word: any word wider than the text box, or the box scrolls sideways
    const broken = txt.scrollWidth > txt.clientWidth + 1;
    const ctrls = ['interact-btn', 'mobile-chat-btn', 'joystick', 'inventory-panel', 'mm-nav-btn'].filter((id) => { const o = document.getElementById(id); if (!o || getComputedStyle(o).display === 'none' || o.classList.contains('hidden')) return false; const q = o.getBoundingClientRect(); return q.width > 0 && q.left < r.right - 1 && q.right > r.left + 1 && q.top < r.bottom - 1 && q.bottom > r.top + 1; });
    return { shown, label: lab ? lab.textContent : '', step: window.__g.scene.getScene('Town')._goalStep, lines: tops.size, fs: parseFloat(getComputedStyle(txt).fontSize), broken, ctrls,
      inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, close: document.getElementById('gate-pointer-close').getAttribute('aria-label') };
  });
  const pressE = async (page, vp) => { if (vp.touch) await page.tap('#interact-btn'); else await page.keyboard.press('e'); await page.waitForTimeout(250); };
  const stand = (page, x, y) => page.evaluate(([px, py]) => { const s = window.__g.scene.getScene('Town'); s.localBody.setPosition(px, py); if (s.localBody.body) s.localBody.body.setVelocity(0, 0); }, [x, y]);
  if (want('66')) for (const vp of [VPS[0], VPS[2]]) {
    const tag = tagOf(vp);
    const ctx = await ctxFor(browser, vp);
    const db = await offlineStub(ctx);
    await seedTown(ctx, { name: 'ADMINcs', species: 'cat', frame: 0, lastSeenVersion: VERSION, animalHello: ALL }, { v: 1, dismissed: false, reached: true });
    const { page, errors } = await openTown(ctx);
    let k = await card(page);
    check(`[66 ${tag}] fresh profile past the gate, no wood yet: no goal card`, !k.shown && k.step === null, JSON.stringify(k));
    // chop with real presses until 3 wood (each tree once; anything else in reach of a tree is skipped)
    const trees = await page.evaluate(() => TREES.map(([x, y]) => [x, y]));
    let wood = 0, firstSeen = null;
    for (const [tx, ty] of trees) {
      if (wood >= 3) break;
      await stand(page, tx, ty + 20);
      await page.waitForTimeout(150);
      const near = await page.evaluate(() => { const s = window.__g.scene.getScene('Town'); const t = s.findNearestTree(); return !!t && !s.findNearestBug() && !s.findNearestFlower() && !s.findNearestFloraFauna() && !s.findNearestWeed() && !s.findNearestVillager(); });
      if (!near) continue;
      await pressE(page, vp);
      wood = await page.evaluate(() => window.__g.scene.getScene('Town').resources.wood || 0);
      if (wood >= 1 && !firstSeen) {
        await stand(page, 900, 1300); await page.waitForFunction(() => { const t = document.getElementById('achievement-toast'); return t.classList.contains('hidden'); }, null, { timeout: 12000 }).catch(() => null); await page.waitForTimeout(500);
        firstSeen = await card(page);
      }
    }
    check(`[66 ${tag}] the bot chopped 3 wood with real presses`, wood >= 3, String(wood));
    const want1 = vp.width <= 300 ? 'Use the workbench' : 'Craft a Plank Stack at the workbench';
    const want2 = vp.width <= 300 ? 'Place it at home' : 'Place it at your home';
    check(`[66 ${tag}] after chopping: the card reads "${want1}"`, !!firstSeen && firstSeen.shown && firstSeen.label === want1 && firstSeen.step === 'craft', JSON.stringify(firstSeen));
    check(`[66 ${tag}] the line fits: <= 2 lines at >= 12 px, no broken word, inside the screen, off the controls`, !!firstSeen && firstSeen.lines <= 2 && firstSeen.fs >= 12 && !firstSeen.broken && firstSeen.inside && firstSeen.ctrls.length === 0, JSON.stringify(firstSeen));
    if (SHOTS) { await stand(page, 900, 1300); await page.waitForTimeout(400); await page.screenshot({ path: `${SHOTS}/cyc14-systems-goal-craft-${tag}.jpg`, type: 'jpeg', quality: 75 }); }
    // workbench: real E, real click on Plank Stack
    const wb = await page.evaluate(() => WORKBENCH_POS);
    await stand(page, wb.x, wb.y + 30);
    await page.waitForTimeout(200);
    await pressE(page, vp);
    const open1 = await page.evaluate(() => window.__g.scene.getScene('Town').workbenchOpen);
    check(`[66 ${tag}] real E / A at the workbench opens it`, open1 === true);
    const btn = page.locator('[data-recipe="plank"]').first();
    await btn.scrollIntoViewIfNeeded();
    if (vp.touch) await btn.tap(); else await btn.click();
    await page.waitForTimeout(200);
    const crafted = await page.evaluate(() => window.__g.scene.getScene('Town').craftedGoods.plank || 0);
    check(`[66 ${tag}] a real click crafts one Plank Stack`, crafted === 1, String(crafted));
    await page.evaluate(() => window.__g.scene.getScene('Town').closeWorkbench());
    await stand(page, 900, 1300); await page.waitForFunction(() => { const t = document.getElementById('achievement-toast'); return t.classList.contains('hidden'); }, null, { timeout: 12000 }).catch(() => null); await page.waitForTimeout(500);
    k = await card(page);
    check(`[66 ${tag}] with the plank in the bag: "${want2}" (<= 2 lines, no broken word, inside, off the controls)`, k.shown && k.label === want2 && k.step === 'place' && k.lines <= 2 && !k.broken && k.inside && k.ctrls.length === 0, JSON.stringify(k));
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/cyc14-systems-goal-place-${tag}.jpg`, type: 'jpeg', quality: 75 });
    const hp = await page.evaluate(() => HOME_POS);
    await stand(page, hp.x, hp.y + 30);
    await page.waitForTimeout(200);
    await pressE(page, vp);
    const open2 = await page.evaluate(() => window.__g.scene.getScene('Town').homeOpen);
    check(`[66 ${tag}] real E / A at home opens the plots`, open2 === true);
    await page.selectOption('#home-slot-0', 'plank');
    await page.waitForTimeout(200);
    await page.evaluate(() => window.__g.scene.getScene('Town').closeHome());
    await stand(page, 900, 1300); await page.waitForTimeout(500);
    k = await card(page);
    const raw = await page.evaluate(() => JSON.parse(localStorage.getItem('pixeltown-save-v1')));
    check(`[66 ${tag}] placed: the chain is done, the card is gone`, !k.shown && k.step === null && raw.home && raw.home.slots[0] === 'plank', JSON.stringify([k, raw.home]));
    check(`[66 ${tag}] no new save key for the chain`, !Object.keys(raw).some((x) => /goal|chain|workbenchStep/i.test(x)), Object.keys(raw).join());
    // a reload keeps it done (derived from the save)
    await page.close();
    const again = await openTown(ctx);
    await stand(again.page, 900, 1300); await again.page.waitForTimeout(500);
    k = await card(again.page);
    check(`[66 ${tag}] after a reload: still no card (derived from the save)`, !k.shown && k.step === null, JSON.stringify(k));
    check(`[66 ${tag}] no page errors, 0 database attempts`, errors.length === 0 && again.errors.length === 0 && db.attempts() === 0, JSON.stringify([errors, again.errors, db.attempts()]));
    await ctx.close();
  }
  if (want('66')) {
    // the Realm Gate step still comes first, and a returning player who already placed something never sees the chain
    const ctx = await ctxFor(browser, VPS[0]);
    const db = await offlineStub(ctx);
    await seedTown(ctx, { name: 'ADMINcs', species: 'cat', frame: 0, lastSeenVersion: VERSION, animalHello: ALL, resources: { wood: 5 } });
    const { page, errors } = await openTown(ctx);
    await stand(page, 900, 1300); await page.waitForTimeout(500);
    let k = await card(page);
    check('[66 gate] a new player with wood: the Realm Gate step is shown first (today\'s goal is never blocked)', k.shown && k.step === 'gate' && k.label === '🌀 Realm Gate' && k.close === 'Hide the Realm Gate pointer', JSON.stringify(k));
    await ctx.close();
    const ctx2 = await ctxFor(browser, VPS[0]);
    const db2 = await offlineStub(ctx2);
    await seedTown(ctx2, { name: 'ADMINcs', species: 'cat', frame: 0, lastSeenVersion: VERSION, animalHello: ALL, resources: { wood: 5 }, crafted: { plank: 2 }, home: { slots: ['chime', null, null, null] } }, { v: 1, dismissed: false, reached: true });
    const t2 = await openTown(ctx2);
    await stand(t2.page, 900, 1300); await t2.page.waitForTimeout(500);
    k = await card(t2.page);
    check('[66 returning] a player who already placed something at home: no chain step', !k.shown && k.step === null, JSON.stringify(k));
    check('[66] no page errors, 0 database attempts', errors.length === 0 && t2.errors.length === 0 && db.attempts() === 0 && db2.attempts() === 0, JSON.stringify([errors, t2.errors]));
    await ctx2.close();
  }

  // ---------------- [62] treat bubble ----------------
  const nearFox = (page) => page.evaluate(async () => {
    const s = window.__g.scene.getScene('Town');
    const spec = s.ffSpecimens.find((x) => x.id === 'fox' && !x.pond && !x.ocean);
    s.tweens.killTweensOf(spec.sprite);
    // only the fox in reach: every other wild animal within 300 px is moved 2000 px away (test-only, so the fox is the one in reach)
    s.ffSpecimens.forEach((o) => { if (o !== spec && Math.hypot(o.sprite.x - spec.sprite.x, o.sprite.y - spec.sprite.y) < 300) { s.tweens.killTweensOf(o.sprite); o.sprite.setPosition(o.sprite.x + 2000, o.sprite.y); } });
    s.localBody.setPosition(spec.sprite.x + 50, spec.sprite.y);
    await new Promise((r) => setTimeout(r, 300));
    s.refreshFloraFaunaNear();
    for (let t = 0; t < 25 && !s.treatBubble; t++) await new Promise((r) => setTimeout(r, 100));
    return !!s.treatBubble;
  });
  const treat = (page) => page.evaluate(() => {
    const s = window.__g.scene.getScene('Town'); const b = s.treatBubble; const t = document.getElementById('achievement-toast');
    const vis = (e) => !!e && !e.classList.contains('hidden') && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0;
    const r = t.getBoundingClientRect(); const ov = [];
    if (vis(t)) ['interact-btn', 'mobile-chat-btn', 'inventory-panel', 'joystick'].forEach((id) => { const o = document.getElementById(id); if (!vis(o)) return; const q = o.getBoundingClientRect(); if (q.left < r.right - 0.5 && q.right > r.left + 0.5 && q.top < r.bottom - 0.5 && q.bottom > r.top + 0.5) ov.push(id); });
    let deal = null; try { deal = s.todaysDeal().key; } catch (e) { deal = null; }
    return { bubble: b ? { id: b.spec.id, key: b.img.texture.key, above: b.img.y < b.spec.sprite.y, side: b.side || 0, vis: b.img.visible, inView: s.cameras.main.worldView.contains(b.img.x, b.img.y - 10) } : null, count: s.treatBubbles || 0,
      flowers: s.resources.flowers || 0, fruit: s.resources.fruit || 0, hearts: (s.animalHelloHearts || []).map((h) => h.spec.id), given: (s.treatGiven || []).slice(), toast: vis(t) ? t.textContent : '', ov, deal,
      inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight };
  });
  if (want('62')) for (const vp of [VPS[0], VPS[2]]) {
    const tag = tagOf(vp);
    const ctx = await ctxFor(browser, vp);
    const db = await offlineStub(ctx);
    await seedTown(ctx, { name: 'ADMINcs', species: 'cat', frame: 0, lastSeenVersion: VERSION, animalHello: ALL, resources: { flowers: 2, fruit: 2 } }, { v: 1, dismissed: true, reached: true });
    const { page, errors } = await openTown(ctx);
    const got = await nearFox(page);
    let t = await treat(page);
    check(`[62 ${tag}] a liked fox near the hero shows ONE treat bubble next to it (above, or the first clear side when the HUD covers above)`, got && t.bubble && t.bubble.id === 'fox' && (t.bubble.above || t.bubble.side > 0) && t.bubble.vis && t.bubble.inView && t.count === 1 && /^treat-bubble-/.test(t.bubble.key), JSON.stringify(t));
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/cyc14-systems-treat-bubble-${tag}.jpg`, type: 'jpeg', quality: 75 });
    // U review: the bubble never sits under a HUD element (the 195 px bag bar): its 5 screen points hit the game canvas
    const clr = await page.evaluate(() => {
      const s = window.__g.scene.getScene('Town'); const b = s.treatBubble; if (!b) return null;
      const cam = s.cameras.main, cv = s.game.canvas, cr = cv.getBoundingClientRect(), zx = cr.width / cam.width, zy = cr.height / cam.height;
      const k = b.img.getBounds();
      return [[0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9], [0.5, 0.5]].map(([fx, fy]) => { const px = cr.left + (k.x + fx * k.width - cam.worldView.x) * cam.zoom * zx, py = cr.top + (k.y + fy * k.height - cam.worldView.y) * cam.zoom * zy; const e = document.elementFromPoint(px, py); return { ok: !!e && e.tagName === 'CANVAS', id: e && (e.id || e.tagName) }; }).concat([{ side: b.side }]);
    });
    check(`[62 ${tag}] the bubble is clear of every HUD element (5 points on the canvas)`, !!clr && clr.slice(0, 5).every((p) => p.ok), JSON.stringify(clr));
    const expect = t.deal === 'flowers' ? 'fruit' : 'flowers';
    await pressE(page, vp);
    await page.waitForTimeout(150);
    t = await treat(page);
    const left = expect === 'flowers' ? [t.flowers, t.fruit] : [t.fruit, t.flowers];
    check(`[62 ${tag}] a real ${vp.touch ? 'A tap' : 'E'} gives exactly 1 ${expect} (lowest value first; today's deal ${t.deal} last)`, left[0] === 1 && left[1] === 2 && t.given.join() === expect, JSON.stringify(t));
    check(`[62 ${tag}] the heart shows over the fox and the bubble is gone`, t.hearts.includes('fox') && !t.bubble, JSON.stringify(t));
    check(`[62 ${tag}] one line: "The Red Fox loved the ${expect === 'flowers' ? 'flower' : 'fruit'} 💛", inside the screen, clear of A / C / the bag bar`, t.toast === `The Red Fox loved the ${expect === 'flowers' ? 'flower' : 'fruit'} 💛` && t.inside && t.ov.length === 0, JSON.stringify(t));
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/cyc14-systems-treat-given-${tag}.jpg`, type: 'jpeg', quality: 75 });
    const raw = await page.evaluate(() => JSON.parse(localStorage.getItem('pixeltown-save-v1')));
    check(`[62 ${tag}] the bag change is saved; no new save key for the bubble`, (raw.resources[expect] || 0) === 1 && !Object.keys(raw).some((k) => /treat|bubble/i.test(k)), JSON.stringify(raw.resources));
    // at most one per 90 s: walking away and back does not bring a second bubble
    await page.evaluate(() => { const s = window.__g.scene.getScene('Town'); s.localBody.setPosition(s.localBody.x + 600, s.localBody.y); });
    await page.waitForTimeout(500);
    await nearFox(page);
    t = await treat(page);
    check(`[62 ${tag}] within 90 s: no second bubble`, !t.bubble && t.count === 1, JSON.stringify(t));
    // empty bag: the gap passed (90 s gap moved back in memory), nothing to give -> nothing lost, the bubble goes, the interact goes on
    await page.evaluate(() => { const s = window.__g.scene.getScene('Town'); s._treatAt = s.time.now - 91000; s.resources.flowers = 0; s.resources.fruit = 0; s.saveResources(); });
    await nearFox(page);
    t = await treat(page);
    check(`[62 ${tag}] 90 s later: a bubble again`, !!t.bubble && t.count === 2, JSON.stringify(t));
    const before = await page.evaluate(() => JSON.stringify(window.__g.scene.getScene('Town').resources));
    await pressE(page, vp);
    await page.waitForTimeout(400);
    t = await treat(page);
    const after = await page.evaluate(() => JSON.stringify(window.__g.scene.getScene('Town').resources));
    check(`[62 ${tag}] empty bag: nothing is lost, the bubble goes`, before === after && !t.bubble && t.given.length === 1, JSON.stringify([before, after, t]));
    check(`[62 ${tag}] no page errors, 0 database attempts`, errors.length === 0 && db.attempts() === 0, JSON.stringify([errors, db.attempts()]));
    await ctx.close();
  }
  if (want('62')) {
    // an unmet fox (bit clear): greeted now (heart), but no bubble on this visit
    const ctx = await ctxFor(browser, VPS[0]);
    const db = await offlineStub(ctx);
    await seedTown(ctx, { name: 'ADMINcs', species: 'cat', frame: 0, lastSeenVersion: VERSION, animalHello: [2 ** 30 - 2, 2 ** 27 - 1], resources: { flowers: 2 } }, { v: 1, dismissed: true, reached: true });
    const { page, errors } = await openTown(ctx);
    const got = await nearFox(page);
    await page.waitForTimeout(1500);
    const t = await treat(page);
    check('[62 unmet] a fox not met before gets no bubble (only its hello heart)', !got && !t.bubble && t.count === 0, JSON.stringify(t));
    // a panel open: no bubble
    await page.evaluate(() => { const s = window.__g.scene.getScene('Town'); s.animalHelloLog = []; s.openMuseum(); });
    await page.waitForTimeout(800);
    check('[62 panel] the Museum open: no bubble', !(await treat(page)).bubble);
    check('[62] no page errors, 0 database attempts', errors.length === 0 && db.attempts() === 0, JSON.stringify([errors, db.attempts()]));
    await ctx.close();
  }

  // ---------------- [63] Isles tame callback ----------------
  const LINE = 'The Town animals heard about your new friend from the Isles 💛';
  if (want('63')) {
    const ctx = await ctxFor(browser, VPS[0]);
    const db = await offlineStub(ctx);
    const base = { name: 'ADMINcs', species: 'cat', frame: 0, lastSeenVersion: VERSION, animalHello: ALL, futureKey: { keep: 1 } };
    await seedTown(ctx, Object.assign({ __tames: { v: 1, roster: [{ id: 't1', sp: 'mossling', n: 'Moss' }] } }, base), { v: 1, dismissed: true, reached: true });
    let { page, errors } = await openTown(ctx);
    await page.waitForFunction(() => (window.__g.scene.getScene('Town').islesTameLines || 0) > 0, null, { timeout: 8000 }).catch(() => null);
    const s1 = await page.evaluate(() => { const t = document.getElementById('achievement-toast'); return { lines: window.__g.scene.getScene('Town').islesTameLines || 0, toast: t.textContent, raw: JSON.parse(localStorage.getItem('pixeltown-save-v1')), tames: localStorage.getItem('pixeltown-tames-v1') }; });
    check('[63] a seeded Isles tame: the line shows once', s1.lines === 1 && s1.toast === LINE, JSON.stringify([s1.lines, s1.toast]));
    check('[63] the additive bit islesTameSeen is set; other fields kept; the Isles key is untouched', s1.raw.islesTameSeen === 1 && JSON.stringify(s1.raw.futureKey) === '{"keep":1}' && s1.tames === JSON.stringify({ v: 1, roster: [{ id: 't1', sp: 'mossling', n: 'Moss' }] }), JSON.stringify(s1.raw).slice(0, 300));
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/cyc14-systems-isles-line-1280x720.jpg`, type: 'jpeg', quality: 75 });
    await page.close();
    ({ page, errors: errors } = await openTown(ctx));
    await page.waitForTimeout(2500);
    const s2 = await page.evaluate(() => window.__g.scene.getScene('Town').islesTameLines || 0);
    check('[63] after a reload: not shown again', s2 === 0, String(s2));
    check('[63] no page errors, 0 database attempts', errors.length === 0 && db.attempts() === 0, JSON.stringify([errors, db.attempts()]));
    await ctx.close();
    // no tames: nothing shown, the old save (no islesTameSeen) stays byte-identical except the animal hello's own key (none due here)
    const ctx2 = await ctxFor(browser, VPS[2]);
    const db2 = await offlineStub(ctx2);
    await seedTown(ctx2, base, { v: 1, dismissed: true, reached: true });
    const t2 = await openTown(ctx2);
    const before = await t2.page.evaluate(() => localStorage.getItem('pixeltown-save-v1'));
    await t2.page.waitForTimeout(2500);
    const s3 = await t2.page.evaluate(() => ({ lines: window.__g.scene.getScene('Town').islesTameLines || 0, raw: localStorage.getItem('pixeltown-save-v1') }));
    check('[63 195x422] no tames: no line, and no islesTameSeen written', s3.lines === 0 && !/islesTameSeen/.test(s3.raw), JSON.stringify(s3).slice(0, 200));
    check('[63 195x422] the save is unchanged by the callback (byte-identical over 2.5 s idle)', before === s3.raw, '');
    check('[63 195x422] no page errors, 0 database attempts', t2.errors.length === 0 && db2.attempts() === 0, JSON.stringify([t2.errors, db2.attempts()]));
    await ctx2.close();
  }
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
