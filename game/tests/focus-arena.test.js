// FO2: the focus resource in the Mad Maze arena (MMFocus via RealmArena). A blue focus bar under HP (desktop + phone 390x844),
// Nova 25 / Shield 30 / Overdrive 40 / Signature 40 / Dash 0, cooldowns kept, a short tap flashes the bar and casts nothing,
// regen, arena.restoreFocus(kind) for the pickups slice, ?focus=0 = cooldown-only play, duels and the hero-less classic arena unchanged.
// Offline: WebSockets closed, the town/hub pages stubbed, no chat, no DB writes.
// Run: BASE=http://localhost:8661/game/index.html NODE_PATH=$(npm root -g) node game/tests/focus-arena.test.js   (SHOTS=<dir> saves phone screenshots)
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const MAZE = ORIGIN + '/game/games/mad-maze/index.html?test=1&offline=1';
const MM = 'pixeltown-mm-v1', ACTIVE = 'pixeltown-mm-active-v1';
const hero = (id, cls, level) => ({ id, name: cls, cls, level, xp: 0, fame: 0, bonus: 0, mode: 'classic', items: [] });
const prof = (heroes) => ({ v: 1, heroes, stash: new Array(16).fill(null), fame: 0, mode: 'classic', hall: [], migratedFrom: null });

async function open(browser, query, opts) {
  const ctx = await browser.newContext(opts || { viewport: { width: 1000, height: 700 } });
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' }));
  await ctx.route('**/hub/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>hub</title>hub' }));
  await ctx.routeWebSocket(/.*/, (ws) => ws.close()); // never reach the live DB
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate(([k1, p, k2, a]) => { localStorage.setItem(k1, JSON.stringify(p)); localStorage.setItem(k2, a); }, [MM, prof([hero('h-r', 'ranger', 5)]), ACTIVE, JSON.stringify({ v: 1, heroId: 'h-r' })]);
  errors.length = 0;
  await page.goto(MAZE + (query || ''));
  await page.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena.active && typeof MMFocus !== 'undefined', null, { timeout: 15000 });
  return { ctx, page, errors };
}

// Quiet play state at account level 7 (all four slots open), cooldowns reset, no enemies or bolts.
const prep = (page) => page.evaluate(() => {
  const a = window.__mm.arena;
  a.save.level = 7; a._calcStats(); a.state = 'play'; a.paused = false; a.down = false;
  [a.enemies, a.eBullets, a.pBullets].forEach((pool) => pool.forEach((o) => { o.active = false; }));
  a.player.hp = a.stats.maxHp; a.abilityCd = [0, 0, 0, 0]; a.shield.hits = 0; a.overdriveT = 0; a._sigReset(); a._syncAbilities();
  return true;
});
const rect = (page, id) => page.evaluate((i) => { const el = document.getElementById(i); if (!el || el.classList.contains('hidden') || !el.getClientRects().length) return null; const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; }, id);

(async () => {
  const browser = await chromium.launch();
  const errs = [];

  // ---- desktop: bar, costs, short tap, regen, restore ----
  { const A = await open(browser); await prep(A.page);
    await A.page.waitForTimeout(700);
    const hp = await rect(A.page, 'realm-hp'), fb = await rect(A.page, 'realm-focus'), xp = await rect(A.page, 'realm-xp');
    const aria = await A.page.evaluate(() => { const el = document.getElementById('realm-focus'); return { max: el.getAttribute('aria-valuemax'), now: el.getAttribute('aria-valuenow'), role: el.getAttribute('role'), fill: getComputedStyle(document.getElementById('realm-focus-fill')).backgroundImage }; });
    check('desktop: the focus bar sits under the HP bar (same left edge, below it, above the XP bar)', hp && fb && Math.abs(fb.l - hp.l) <= 1 && fb.t >= hp.b && fb.t - hp.b <= 6 && (!xp || fb.b <= xp.t + 1), JSON.stringify({ hp, fb, xp }));
    check('the bar is a blue meter with max 120 for a level 5 hero (100 + 5/level)', aria.role === 'meter' && aria.max === '120' && aria.now === '120' && /rgb\(\s*(1[0-9]{2}|[0-9]{1,2}),\s*\d+,\s*2\d\d/.test(aria.fill), JSON.stringify(aria));
    const costs = await A.page.evaluate(() => {
      const a = window.__mm.arena; const out = {}; const cur = () => a.focusState().cur; a.focus.regen = 0; // regen frozen: exact costs
      let c0 = cur(); out.dash = a.cast(0); out.dashCost = c0 - cur();
      c0 = cur(); out.nova = a.cast(1); out.novaCost = c0 - cur();
      c0 = cur(); out.shield = a.cast(2); out.shieldCost = c0 - cur();
      out.novaCd = a.abilityCd[1] > 0; // cooldowns are kept on top of focus
      a.abilityCd = [0, 0, 0, 0]; c0 = cur(); out.again = a.cast(1); out.againCost = c0 - cur(); // 120-25-30-25 = 40 left
      a.abilityCd = [0, 0, 0, 0]; c0 = cur(); out.od = a.cast(3); out.odCost = c0 - cur(); out.left = cur();
      a.abilityCd = [0, 0, 0, 0]; const s0 = a.focusShorts; out.short = a.cast(1); out.shorts = a.focusShorts - s0; out.flash = document.getElementById('realm-focus').classList.contains('short'); out.cdAfterShort = a.abilityCd[1];
      out.dim = document.getElementById('realm-ab-1').classList.contains('nofocus') || (a._focusHud(true), document.getElementById('realm-ab-1').classList.contains('nofocus'));
      out.dash2 = a.cast(0); // the Dash is free even at 0 focus
      return out;
    });
    check('Dash costs 0, Nova 25, Shield 30 and the Nova cooldown still starts', costs.dash && costs.dashCost === 0 && costs.nova && costs.novaCost === 25 && costs.shield && costs.shieldCost === 30 && costs.novaCd, JSON.stringify(costs));
    check('Overdrive costs 40 and leaves 0 of 120', costs.again && costs.againCost === 25 && costs.od && costs.odCost === 40 && costs.left === 0, JSON.stringify(costs));
    check('a short-focus tap casts nothing, flashes the bar, starts no cooldown and dims the slot; the Dash still works', costs.short === false && costs.shorts === 1 && costs.flash && costs.cdAfterShort === 0 && costs.dim && costs.dash2, JSON.stringify(costs));
    const regen = await A.page.evaluate(async () => {
      const a = window.__mm.arena; a.focus.regen = MMFocus.regenFor(0); a.focus.cur = 0;
      for (let i = 0; i < 60; i++) a._update(1 / 60);
      const r1 = a.focusState().cur;
      const o = a.restoreFocus('focus'); const r2 = a.focusState().cur;
      a.restoreFocus('potion_focus'); const r3 = a.focusState().cur;
      a.restoreFocus('potion_focus'); a.restoreFocus('potion_focus'); const r4 = a.focusState().cur;
      return { r1, o, r2, r3, r4 };
    });
    check('focus regenerates 6/s and restoreFocus adds +15 (orb) / half the max (potion), never above the max', Math.abs(regen.r1 - 6) < 0.2 && regen.o === true && Math.abs(regen.r2 - regen.r1 - 15) < 0.01 && Math.abs(regen.r3 - regen.r2 - 60) < 0.01 && regen.r4 === 120, JSON.stringify(regen));
    const off = await A.page.evaluate(() => { const a = window.__mm.arena; const keep = a.team; a.team = { isPvp: true, ev() {}, close() {}, badge() { return null; }, duelLabel() { return ''; } }; const st = a.focusState(); a.team = keep; const st2 = a.focusState(); return { duel: st.on, back: st2.on }; });
    check('a duel has no focus (duels unchanged); it comes back after', off.duel === false && off.back === true, JSON.stringify(off));
    const noHero = await A.page.evaluate(() => { const a = window.__mm.arena; const src = a._heroSrc; a.setHeroLevelSource(null); const st = a.focusState(); a.abilityCd = [0, 0, 0, 0]; const c = a.cast(1); a.setHeroLevelSource(src); const hid = document.getElementById('realm-focus').classList.contains('hidden'); return { on: st.on, c, hid }; });
    check('without a hero (classic arena) there is no focus: abilities are cooldown-only and the bar hides', noHero.on === false && noHero.c === true && noHero.hid === true, JSON.stringify(noHero));
    errs.push(...A.errors); await A.ctx.close(); }

  // ---- ?focus=0: cooldown-only play, no bar ----
  { const B = await open(browser, '&focus=0'); await prep(B.page);
    const r = await B.page.evaluate(() => { const a = window.__mm.arena; const out = { st: a.focusState().on, casts: 0 }; for (let i = 0; i < 6; i++) { a.abilityCd = [0, 0, 0, 0]; if (a.cast(1)) out.casts++; if (a.cast(3)) out.casts++; } const el = document.getElementById('realm-focus'); out.bar = !!el && !el.classList.contains('hidden'); out.blocked = (a.abilityCd = [0, 5, 0, 0], a.cast(1)); return out; });
    check('?focus=0: focus off, 12 Nova/Overdrive casts in a row all succeed (cooldowns only), no focus bar, a cooldown still blocks', r.st === false && r.casts === 12 && r.bar === false && r.blocked === false, JSON.stringify(r));
    errs.push(...B.errors); await B.ctx.close(); }

  // ---- phone 390x844 world mode: bar under HP, in view, no horizontal scroll; 24 px status icons with a stack count ----
  { const P = await open(browser, '&mode=world&seed=12345', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await P.page.waitForFunction(() => window.__mm.arena.state === 'play');
    await P.page.waitForTimeout(800);
    const hp = await rect(P.page, 'realm-hp'), fb = await rect(P.page, 'realm-focus');
    const lay = await P.page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    check('phone: the focus bar is under the HP bar, inside the screen, no horizontal scroll', hp && fb && Math.abs(fb.l - hp.l) <= 1 && fb.t >= hp.b && fb.r <= 390 && fb.h >= 8 && lay.sw <= lay.iw, JSON.stringify({ hp, fb, lay }));
    const ic = await P.page.evaluate(async () => {
      const a = window.__mm.arena; a.paused = false; a.player.iframes = 1e9;
      a.applyStatus('player', 'curse'); a.applyStatus('player', 'curse', {}); a.applyStatus('player', 'swift', { sec: 30 });
      for (let i = 0; i < 3; i++) await new Promise((r) => requestAnimationFrame(r));
      return { icons: a.statusIcons(), curse: a.statusOf('player').find((s) => s.id === 'curse') };
    });
    const fb2 = await rect(P.page, 'realm-focus');
    check('PT2 #11: status icons are 24 px, the curse shows 2 stacks, and none covers the focus bar', ic.icons.length >= 2 && ic.icons.every((i) => i.size === 24) && ic.curse && ic.curse.stacks === 2 && ic.icons.every((i) => !(fb2 && i.x < fb2.r && i.x + i.size > fb2.l && i.y < fb2.b && i.y + i.size > fb2.t)), JSON.stringify({ ic, fb2 }));
    if (process.env.SHOTS) await P.page.screenshot({ path: require('path').join(process.env.SHOTS, 'focus-phone-390x844.png') });
    errs.push(...P.errors); await P.ctx.close(); }

  check('no console errors', errs.length === 0, errs.join(' | '));
  await browser.close();
  done();
})();
