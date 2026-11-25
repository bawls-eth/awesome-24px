// ID-36 (cycle 5 S) Trial of Six ramp, in the page. The Trial is entered with REAL keys only: Enter beside the Nexus portal, WASD across
// the plaza to the gate, E. Fights 1-3 are cleared with the boss-kill hook (as world-boss-rush.test.js does), "Next fight" is a real mouse
// click. Checks per fight: fights 1-3 fire no layer bolt and keep the zone's bolt cap; fight 4 fires lead shots (cap +2), fight 5 lead + slow
// arm (cap +11), fight 6 all three with the sweep telegraphed 0.8 s before it fires (cap +20; cycle 6 tuning: lead every 1.2 s, arm 0.7 s); layer bolts carry the boss's damage multiplier;
// leaving the Trial puts the cap back. ?trialramp=0 keeps fight 4 as before. The hero is made unhittable (iframes) so the clock is the only
// variable. Offline: blockDb + every WebSocket closed, town stubbed, db.attempts() === 0. No chat, no writes.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/cyc5-trial-layers-live.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&offline=1&heropick=0&tutorial=0&seed=12345&qdate=2030-05-01';
const save = JSON.stringify({ realm: { level: 20, xp: 0, shards: 50, bestWave: 2, items: [{ n: 1, id: 'sparkwand', r: 0 }], nextUid: 2, eq: { weapon: 1 }, gv: 1, gp: { b: 0, d: 0 } } });
const E = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__mm.arena, window.__mm.world, ${JSON.stringify(arg)})`);

async function open(browser, q) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const db = await blockDb(ctx); await ctx.routeWebSocket(/.*/, (ws) => ws.close());
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html>town' }));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate((v) => { localStorage.clear(); localStorage.setItem('pixeltown-save-v1', v); localStorage.setItem('mm-aim-assist', '0'); }, save);
  await page.goto(WORLD + (q || ''));
  await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 30000 });
  await E(page, (a) => { a.player.iframes = 1e9; return true; }); // unhittable: the bolts still fly and are counted
  return { ctx, page, errors, db };
}
// real keys: Enter by the Nexus portal, WASD to the Trial gate, E
async function enterByKeys(page) {
  await E(page, (a, w) => { const s = w.nexus.site; a.player.x = s.x - 20; a.player.y = s.y; return true; });
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter'); await page.waitForTimeout(400);
  const gate = await page.evaluate(() => window.MMNexus.layout().trial);
  const held = new Set(); const key = async (k, on) => { if (on && !held.has(k)) { held.add(k); await page.keyboard.down(k); } else if (!on && held.has(k)) { held.delete(k); await page.keyboard.up(k); } };
  let label = ''; const t0 = Date.now(); let last = null, stuck = 0, side = 1;
  while (Date.now() - t0 < 30000) {
    const h = await E(page, (a, w) => w.nexus.walk.hero());
    label = await page.evaluate(() => { const b = document.getElementById('rw-nx-act'); return b && !b.classList.contains('hidden') ? b.textContent : ''; });
    if (/Trial of Six/.test(label) && Math.hypot(gate.x - h.x, gate.y - h.y) < 40) break;
    const dx = gate.x - h.x, dy = gate.y - h.y;
    if (last && Math.hypot(h.x - last.x, h.y - last.y) < 1) stuck++; else stuck = Math.max(0, stuck - 1);
    last = h;
    let mx = Math.abs(dx) > 6 ? Math.sign(dx) : 0, my = Math.abs(dy) > 6 ? Math.sign(dy) : 0;
    if (stuck > 6) { if (Math.abs(dx) > Math.abs(dy)) { my = side; mx = 0; } else { mx = side; my = 0; } if (stuck > 20) { stuck = 0; side = -side; } } // walk round a prop
    await key('d', mx > 0); await key('a', mx < 0); await key('s', my > 0); await key('w', my < 0);
    await page.waitForTimeout(60);
  }
  for (const k of Array.from(held)) await key(k, false);
  await page.keyboard.press('e'); await page.waitForTimeout(300);
  return { label, st: await E(page, (a, w) => w.rush.state()) };
}
const kill = (page) => E(page, (a, w) => { const e = w.rush.entity(); if (!e) return false; e.invuln = 0; let k = 0; while (e.active && k++ < 200) a._hitEnemy(e, 1e6); return !e.active; });
const nextFight = async (page) => { await page.waitForSelector('#rw-rush-next', { state: 'visible', timeout: 5000 }); await page.click('#rw-rush-next'); await page.waitForTimeout(150); };
// watch one fight for `ms` of real time: layer counters, the cap, the lead bolts' damage multiplier, and the sweep's warning time
const watch = (page, ms) => E(page, (a, w, ms) => new Promise((res) => {
  const e = w.rush.entity(); const t0 = performance.now(); let capMax = 0, capMin = 1e9, liveMax = 0, pendSeen = 0, bossMax = 0, layMax = 0; const dms = new Set();
  const f = () => {
    const fb = a.fireBudget; if (fb) { capMax = Math.max(capMax, fb.cap); capMin = Math.min(capMin, fb.cap); }
    let live = 0, boss = 0, lay = 0; a.eBullets.forEach((b) => { if (b.active) { live++; dms.add(b.dm); if (b.rl) lay++; else boss++; } }); liveMax = Math.max(liveMax, live); bossMax = Math.max(bossMax, boss); layMax = Math.max(layMax, lay);
    const L = w.rush.ramp.layers(); if (L && L.pending) pendSeen++;
    if (performance.now() - t0 < ms) { requestAnimationFrame(f); return; }
    res({ step: e ? e.rushStep : 0, dmgMul: e ? e.dmgMul : 0, L: w.rush.ramp.layers(), capMax, capMin, liveMax, bossMax, layMax, pendSeen, dms: Array.from(dms), extra: w.rush.ramp.capExtra() });
  };
  requestAnimationFrame(f);
}), ms);

(async () => {
  const browser = await chromium.launch();
  const A = await open(browser);
  const p = A.page;
  const zoneCap = await E(p, (a) => (a.fireBudget ? a.fireBudget.cap : 0));
  const en = await enterByKeys(p);
  check('the Trial starts from the Nexus with real keys only (Enter, WASD, E): prompt "Enter the Trial of Six"', /Enter the Trial of Six/.test(en.label) && en.st.on && en.st.phase === 'fight' && en.st.i === 0, JSON.stringify(en));
  const res = []; const hpLines = [];
  for (let step = 1; step <= 6; step++) {
    if (step > 1) { await p.waitForSelector('#rw-rush-next', { state: 'visible', timeout: 5000 }); hpLines.push(await p.evaluate(() => { const el = document.getElementById('rw-rush-hp'); return { t: el ? el.textContent : null, hp: Math.ceil(window.__mm.arena.player.hp), max: Math.round(window.__mm.arena.stats.maxHp) }; })); await nextFight(p); }
    const r = await watch(p, step <= 3 ? 2500 : step === 6 ? 13500 : 5500); // fight 6: cycle 7 sweep every 9 s (was 7) after the boss shield, so the window grew 10.5 -> 13.5 s
    res.push(r);
    if (step < 6) await kill(p);
  }
  console.log('INFO', JSON.stringify(res.map((r) => ({ step: r.step, fired: r.L && r.L.fired, cap: [r.capMin, r.capMax], live: r.liveMax, boss: r.bossMax, lay: r.layMax, sweeps: r.L && r.L.sweeps }))));
  const f = (i) => (res[i].L ? res[i].L.fired : {});
  check('ID-36 carried-HP readout: every rest panel says "You carry <hp> of <max> HP into it." with the hero\'s real HP', hpLines.length === 5 && hpLines.every((h) => h.t === 'You carry ' + h.hp + ' of ' + h.max + ' HP into it.'), JSON.stringify(hpLines));
  check('fights 1-3: no layer bolt, the zone\'s own cap (' + zoneCap + ') unchanged', [0, 1, 2].every((i) => res[i].L && res[i].L.ids.length === 0 && !f(i).lead && !f(i).arm && !f(i).sweep && res[i].capMax === zoneCap), JSON.stringify(res.slice(0, 3).map((r) => [r.step, r.L, r.capMax])));
  check('fight 4: lead shots fire (every 1.2 s after the shield + 0.6 s wind-up: at least 3 in 5.5 s), no arm / sweep, cap 40 + 2 max', f(3).lead >= 3 && !f(3).arm && !f(3).sweep && res[3].capMax <= zoneCap + 2 && res[3].extra === 2, JSON.stringify([res[3].L, res[3].capMax]));
  check('fight 5: lead + slow arm (2 bolts per 0.7 s: at least 8 in 5.5 s), no sweep, cap 40 + 11 max', f(4).lead >= 2 && f(4).arm >= 8 && !f(4).sweep && res[4].capMax <= zoneCap + 11 && res[4].extra === 11, JSON.stringify([res[4].L, res[4].capMax]));
  const sw = res[5].L ? res[5].L.sweeps : [];
  check('fight 6: all three layers; one sweep of 9 bolts fired after 0.8 s of telegraph (faded bolts seen), cap 40 + 20 max', f(5).lead >= 2 && f(5).arm >= 8 && sw.length >= 1 && sw[0].n === 9 && Math.abs(sw[0].warnS - 0.8) < 0.06 && res[5].pendSeen > 0 && res[5].capMax <= zoneCap + 20 && res[5].extra === 20, JSON.stringify([res[5].L, res[5].capMax, res[5].pendSeen]));
  check('layer bolts carry the boss\'s damage multiplier (no other multiplier in flight)', [3, 4, 5].every((i) => res[i].dms.every((d) => Math.abs(d - res[i].dmgMul) < 1e-9)), JSON.stringify(res.slice(3).map((r) => [r.dmgMul, r.dms])));
  check('the bosses\' own bolts stay inside the zone cap in every fight, the layer bolts inside their budget (2 / 11 / 20)', res.every((r) => r.bossMax <= zoneCap) && res[3].layMax <= 2 && res[4].layMax <= 11 && res[5].layMax <= 20, JSON.stringify(res.map((r) => [r.bossMax, r.layMax])));
  check('no layer bolt was dropped at the cap in fights 4-6', [3, 4, 5].every((i) => res[i].L && res[i].L.dropped === 0), JSON.stringify(res.slice(3).map((r) => r.L && r.L.dropped)));
  await E(p, (a, w) => { w.rush.leave(); return true; }); await p.waitForTimeout(200);
  const after = await E(p, (a, w) => ({ cap: a.fireBudget ? a.fireBudget.cap : 0, extra: w.rush.ramp.capExtra(), L: w.rush.ramp.layers() }));
  check('leaving the Trial puts the zone cap back and clears the layers', after.cap === zoneCap && after.extra === 0 && after.L === null, JSON.stringify(after));
  check('no page errors', A.errors.length === 0, A.errors.join(' | '));
  check('0 DB requests', A.db.attempts() === 0);
  await A.ctx.close();

  const B = await open(browser, '&trialramp=0');
  const enB = await enterByKeys(B.page);
  for (let step = 1; step <= 3; step++) { await kill(B.page); await nextFight(B.page); }
  const r4 = await watch(B.page, 4500);
  check('?trialramp=0: fight 4 is as before (no layer, zone cap)', enB.st.on && r4.step === 4 && r4.L && r4.L.ids.length === 0 && r4.capMax === zoneCap, JSON.stringify([r4.step, r4.L, r4.capMax]));
  check('0 DB requests (ramp off)', B.db.attempts() === 0);
  await B.ctx.close();
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
