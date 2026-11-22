// FT2 (NEXT-SLICES-2 Wave 3): first-run Realm fixes from the FT1 gate (first-ten-minutes.test.js asserts the real targets; this file checks
// each fix and its switch directly). 390x844, hasTouch, coarse pointer, fresh profiles, blockDb (0 DB requests or sockets).
//  1 first-bag guarantee: a fresh profile's FIRSTBAG_KILL-th shore kill drops a bag with an item (seeded: the same kill and bag twice), that bag never
//    despawns and drifts to a hero standing still, the pickup saves `fb: 1` and a reload no longer guarantees; ?firstbag=0: pure rolls, no drift.
//  2 exploration trickle: newly revealed map cells pay XP within EXPLORE_EVERY s (never at the arrival); ?explorexp=0 pays nothing.
//  3 phone HUD text >= 12 px (XP text, zone line, Leave); the Daily link is on top, >= 44 px, off both sticks and the ability grid, hidden behind a panel.
//  4 tutorial coach marks (every step, and the closing toast) never cover a stick or the ability grid at 390x844.
//  5 ?ttk=0 and ?bands=classic still report the old behaviour (their own tests are unchanged).
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/ftue-ft2.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&seed=4242';
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };

async function open(browser, query, keep) {
  const ctx = await browser.newContext(PHONE);
  const db = await blockDb(ctx);
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' }));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  if (!keep) await page.addInitScript(() => { if (!sessionStorage.ft2Fresh) { sessionStorage.ft2Fresh = '1'; localStorage.clear(); } });
  await page.goto(PAGE + (query || ''));
  await page.waitForFunction(() => { const m = window.__mm; return !!(m && m.world && m.arena.active && m.arena.state === 'play'); }, null, { timeout: 20000 });
  await page.waitForTimeout(400);
  return { ctx, page, errors, db };
}

// kill shore (zone 0) spawner enemies one at a time, 300 px east of the hero (god mode), until a bag with an item drops or `max` kills
const KILL_SHORE = `(max) => {
  const a = window.__mm.arena, w = window.__mm.world, p = a.player; p.iframes = 1e9;
  const out = { kills: 0, bagAt: null, bagIds: [], fbBags: 0, lifetimes: [] };
  for (let n = 0; n < 400 && out.kills < max; n++) {
    a._update(1 / 30);
    const e = a.enemies.find((q) => q.active && q.zid >= 0 && q.zone === 0);
    if (!e) continue;
    e.x = p.x + 300; e.y = p.y; a._hitEnemy(e, 1e9); out.kills++;
    const bs = a.bags.filter((b) => b.active);
    if (bs.length) { out.bagAt = out.kills; out.bagIds = bs.map((b) => b.id); out.fbBags = bs.filter((b) => b.fb).length; out.lifetimes = bs.map((b) => b.lifetime === Infinity ? 'inf' : b.lifetime); break; }
  }
  return out;
}`;

(async () => {
  const browser = await chromium.launch();
  let dbAll = 0;

  // ===== 1. first-bag guarantee =====
  const runs = [];
  for (let r = 0; r < 2; r++) {
    const P = await open(browser, '');
    const fb0 = await P.page.evaluate(() => { const f = window.__mm.world.firstBag; return { on: f.on, kill: f.kill, fresh: f.fresh(), spent: f.spent() }; });
    if (r === 0) check('1: the first-bag guarantee is on for a fresh profile (not spent)', fb0.on && fb0.fresh && !fb0.spent && fb0.kill >= 2 && fb0.kill <= 6, JSON.stringify(fb0));
    const k = await P.page.evaluate(`(${KILL_SHORE})(${fb0.kill})`);
    runs.push(k);
    if (r === 0) {
      check(`1: a bag with an item drops by the ${fb0.kill}th shore kill at the latest`, k.bagAt !== null && k.bagAt <= fb0.kill && k.bagIds.length > 0, JSON.stringify(k));
      check('1: that first bag is marked, and never despawns while it waits', k.fbBags > 0 && k.lifetimes.every((x) => x === 'inf'), JSON.stringify(k));
      // a hero standing still: the bag drifts over and is picked up (simulated time, the page loop keeps running too)
      const got = await P.page.evaluate(() => { const a = window.__mm.arena; const p = a.player; p.iframes = 1e9; a.moveVec.x = 0; a.moveVec.y = 0; let t = 0; while (t < 6 && !a.save.items.length) { a._update(1 / 30); t += 1 / 30; } return { t: Math.round(t * 10) / 10, items: a.save.items.length }; });
      check('1: the first bag drifts to a hero standing still and lands in the backpack within 6 s', got.items > 0, JSON.stringify(got));
      await P.page.evaluate(() => { const a = window.__mm.arena; for (let i = 0; i < 10; i++) a._update(1 / 30); });
      await P.page.waitForTimeout(300);
      const saved = await P.page.evaluate(() => { try { return JSON.parse(localStorage.getItem('pixeltown-realm-v1')).fb; } catch (e) { return 'err'; } });
      check('1: the pickup saves fb: 1 in pixeltown-realm-v1 (additive key)', saved === 1, String(saved));
      const P2 = await (async () => { const page = await P.ctx.newPage(); await page.goto(PAGE); await page.waitForFunction(() => { const m = window.__mm; return !!(m && m.world && m.arena.active); }, null, { timeout: 20000 }); return page; })();
      const after = await P2.evaluate(() => { const f = window.__mm.world.firstBag; return { fresh: f.fresh(), spent: f.spent() }; });
      check('1: after a reload the guarantee is spent (never again on this save)', !after.fresh && after.spent, JSON.stringify(after));
      await P2.close();
    }
    dbAll += P.db.count(); check(`1: 0 console errors (run ${r + 1})`, P.errors.length === 0, P.errors.slice(0, 3).join(' | '));
    await P.ctx.close();
  }
  check('1: seeded: the same profile drops the same first bag on the same kill', runs[0].bagAt === runs[1].bagAt && runs[0].bagIds.join() === runs[1].bagIds.join(), JSON.stringify(runs));
  {
    const P = await open(browser, '&firstbag=0');
    const fb = await P.page.evaluate(() => { const f = window.__mm.world.firstBag; return { on: f.on, fresh: f.fresh() }; });
    const k = await P.page.evaluate(`(${KILL_SHORE})(12)`);
    check('1: ?firstbag=0 turns the guarantee off', !fb.on && !fb.fresh, JSON.stringify(fb));
    check('1: ?firstbag=0: no bag is marked, bags keep their tier lifetime (pure rolls)', k.fbBags === 0 && k.lifetimes.every((x) => x !== 'inf'), JSON.stringify(k));
    dbAll += P.db.count(); check('1: ?firstbag=0: 0 console errors', P.errors.length === 0, P.errors.slice(0, 3).join(' | '));
    await P.ctx.close();
  }

  // ===== 2. exploration trickle =====
  const walk = `() => {
    const a = window.__mm.arena, w = window.__mm.world, p = a.player, T = w.TILE; p.iframes = 1e9;
    const xp0 = w.explore.xp(); const lv0 = a.save.level, x0 = a.save.xp;
    const d = w.nearestFree ? w.nearestFree(Math.floor(p.x / T) + 40, Math.floor(p.y / T), 12) : null;
    const tx = d ? d.x : Math.floor(p.x / T) + 40, ty = d ? d.y : Math.floor(p.y / T);
    p.x = (tx + 0.5) * T; p.y = (ty + 0.5) * T;
    let t = 0; while (t < 8) { a._update(1 / 30); t += 1 / 30; }
    return { on: w.explore.on, every: w.explore.every, paid: w.explore.xp() - xp0, xpMoved: a.save.level > lv0 || a.save.xp > x0 };
  }`;
  {
    const P = await open(browser, '&difficulty=off');
    const idle = await P.page.evaluate(() => window.__mm.world.explore.xp());
    check('2: no exploration XP for the cells around the arrival point', idle === 0, String(idle));
    const r = await P.page.evaluate(`(${walk})()`);
    check('2: newly revealed cells pay exploration XP (on by default) within its interval', r.on && r.paid > 0 && r.xpMoved, JSON.stringify(r));
    dbAll += P.db.count(); await P.ctx.close();
    const Q = await open(browser, '&explorexp=0');
    const r0 = await Q.page.evaluate(`(${walk})()`);
    check('2: ?explorexp=0 pays nothing', !r0.on && r0.paid === 0, JSON.stringify(r0));
    dbAll += Q.db.count(); check('2: 0 console errors', P.errors.length === 0 && Q.errors.length === 0, P.errors.concat(Q.errors).slice(0, 3).join(' | '));
    await Q.ctx.close();
  }

  // ===== 3. phone HUD text + Daily link =====
  {
    const P = await open(browser, '');
    await P.page.screenshot({ path: require('path').join(process.env.SHOTS || require('os').tmpdir(), 'ft2-phone-world.png') });
    const L = await P.page.evaluate(() => {
      const fs = (s) => { const e = document.querySelector(s); return e ? parseFloat(getComputedStyle(e).fontSize) : null; };
      const R = (e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
      const d = document.getElementById('mm-daily-btn'); const dr = d ? R(d) : null;
      const top = d ? document.elementFromPoint((dr.x + dr.r) / 2, (dr.y + dr.b) / 2) : null;
      const ctl = [...document.querySelectorAll('.realm-stick, #realm-abilities, #mm-gear-btn')].map((e) => Object.assign(R(e), { id: e.id }));
      const hit = (a, b) => a.x < b.r && b.x < a.r && a.y < b.b && b.y < a.b;
      const xpT = R(document.getElementById('realm-xp-text')), xpB = R(document.getElementById('realm-xp'));
      return { xp: fs('#realm-xp-text'), zname: fs('#rw-zone .rw-zname'), arrow: fs('#rw-zone .rw-arrow'), event: fs('#rw-zone .rw-event'), leave: fs('#realm-leave-btn'),
        xpFits: xpT.h <= xpB.h, zoneBelowXp: R(document.getElementById('rw-zone')).y >= xpB.b,
        daily: dr, dailyTop: !!top && (d === top || d.contains(top)), dailyOver: ctl.filter((c) => dr && hit(dr, c)).map((c) => c.id), vw: innerWidth, vh: innerHeight };
    });
    check('3: phone HUD text >= 12 px (XP text, zone name, arrow, event line, Leave)', [L.xp, L.zname, L.arrow, L.event, L.leave].every((v) => v >= 12), JSON.stringify(L));
    check('3: the 12 px XP text fits its bar, and the zone line stays below the XP bar', L.xpFits && L.zoneBelowXp, JSON.stringify(L));
    check('3: the Daily link is on top of the game (visible and tappable)', !!L.daily && L.dailyTop, JSON.stringify(L.daily));
    check('3: the Daily link is >= 44 x 44 px and on screen', L.daily && L.daily.w >= 44 && L.daily.h >= 44 && L.daily.x >= 0 && L.daily.r <= L.vw && L.daily.y >= 0 && L.daily.b <= L.vh, JSON.stringify(L.daily));
    check('3: the Daily link covers no stick, the ability grid or the gear', L.dailyOver.length === 0, L.dailyOver.join(', '));
    const hid = await P.page.evaluate(async () => { const a = window.__mm.arena; a._panel('bp'); await new Promise((r) => setTimeout(r, 50)); const v = getComputedStyle(document.getElementById('mm-daily-btn')).visibility; a._panel(null); await new Promise((r) => setTimeout(r, 50)); return { open: v, closed: getComputedStyle(document.getElementById('mm-daily-btn')).visibility }; });
    check('3: the Daily link hides while the backpack panel is open, and comes back', hid.open === 'hidden' && hid.closed === 'visible', JSON.stringify(hid));
    dbAll += P.db.count(); check('3: 0 console errors', P.errors.length === 0, P.errors.slice(0, 3).join(' | '));
    await P.ctx.close();
  }

  // ===== 4. coach marks never cover a stick or the ability grid at 390x844 =====
  {
    const P = await open(browser, '&tutorial=1');
    const steps = ['moved', 'shot', 'pickedUp', 'abilityUsed', 'portalEntered', 'nexusOpened'];
    const seen = [];
    for (let i = 0; i <= steps.length; i++) {
      const m = await P.page.evaluate(() => {
        const R = (e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
        const hit = (a, b) => a.x < b.r - 0.5 && b.x < a.r - 0.5 && a.y < b.b - 0.5 && b.y < a.b - 0.5;
        const ctl = [...document.querySelectorAll('.realm-stick, #realm-abilities')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => Object.assign(R(e), { id: e.id }));
        const marks = ['mm-coach', 'mm-coach-toast'].map((id) => document.getElementById(id)).filter((e) => e && !e.classList.contains('hidden') && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0);
        const over = []; marks.forEach((e) => ctl.forEach((c) => { if (hit(R(e), c)) over.push(e.id + '/' + c.id); }));
        const c = document.getElementById('mm-coach');
        return { step: c && !c.classList.contains('hidden') ? c.dataset.step : 'done', marks: marks.map((e) => e.id + ' ' + Math.round(R(e).y) + '-' + Math.round(R(e).b)), ctl: ctl.length, over };
      });
      seen.push(m);
      if (i < steps.length) await P.page.evaluate((s) => window.__mmTutorial.event(s), steps[i]);
      await P.page.waitForTimeout(80);
    }
    const marks = seen.filter((m) => m.marks.length).length;
    check('4: the coach marks show (every step, then the closing toast), with both sticks and the ability grid visible', marks >= 6 && seen.every((m) => m.ctl === 3), JSON.stringify(seen.map((m) => m.step + ':' + m.marks.join('|'))));
    check('4: no coach mark or toast covers a stick or the ability grid at 390x844', seen.every((m) => m.over.length === 0), JSON.stringify(seen.filter((m) => m.over.length)));
    dbAll += P.db.count(); check('4: 0 console errors', P.errors.length === 0, P.errors.slice(0, 3).join(' | '));
    await P.ctx.close();
  }

  // ===== 5. old-behaviour switches still report the old behaviour =====
  {
    const P = await open(browser, '&ttk=0&bands=classic');
    const o = await P.page.evaluate(() => { const w = window.__mm.world; return { ttk: w.ttk.on, bands: w.zoneGrad.bands, classic: w.bandsClassic, magnet: w.pickups.magnet }; });
    check('5: ?ttk=0 turns the shore TTK off and ?bands=classic keeps the classic bands', o.ttk === false && o.bands === 'classic' && o.classic === true, JSON.stringify(o));
    dbAll += P.db.count(); check('5: 0 console errors', P.errors.length === 0, P.errors.slice(0, 3).join(' | '));
    await P.ctx.close();
  }

  check('0 database requests or sockets', dbAll === 0, String(dbAll));
  await browser.close();
  done();
})();
