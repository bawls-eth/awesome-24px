// S16: class + weapon playtest loop. For four classes at 390x844: equip a weapon style, reach Lv 4 through the test hook, see the unlock toast,
// kill a group of enemies, open the hero panel. 0 console errors; the median frame stays well under a generous bound (recorded, not tuned).
// Run: BASE=http://localhost:8651/game/index.html NODE_PATH=$(npm root -g) node game/tests/class-weapon-playtest.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const MAZE = ORIGIN + '/game/games/mad-maze/index.html?test=1&offline=1&mode=world&seed=12345';
const MM = 'pixeltown-mm-v1', ACTIVE = 'pixeltown-mm-active-v1', SAVE = 'pixeltown-save-v1';
const CLASSES = [['ranger', 'bow_triple'], ['rogue', 'dagger_fan'], ['frostcaller', 'wand_chain'], ['bruiser', 'fist_flurry']];
const hero = (id, cls) => ({ id, name: cls, cls, level: 3, xp: 0, fame: 0, bonus: 0, mode: 'classic', items: [] });
const prof = (heroes) => ({ v: 1, heroes, stash: new Array(16).fill(null), fame: 0, mode: 'classic', hall: [], migratedFrom: null });

(async () => {
  const browser = await chromium.launch();
  const errs = [];
  for (const [cls, style] of CLASSES) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(cls + ' pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(cls + ' console: ' + m.text()); });
    await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
    await page.evaluate(([k1, p, k2, a, k3, s]) => { localStorage.clear(); localStorage.setItem(k1, JSON.stringify(p)); localStorage.setItem(k2, a); localStorage.setItem(k3, JSON.stringify(s)); },
      [MM, prof([hero('h-' + cls, cls)]), ACTIVE, JSON.stringify({ v: 1, heroId: 'h-' + cls }), SAVE, { realm: { v: 1, level: 3, xp: 0, items: [], nextUid: 2, eq: {} } }]);
    errors.length = 0;
    await page.goto(MAZE);
    await page.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena.active);
    await page.waitForTimeout(600);

    // equip a style
    const eq = await page.evaluate((id) => { const a = window.__mm.arena; rmInertDef(id).slot = 'weapon'; a.save.items = [{ n: 1, id, r: 0 }]; a.save.eq = { weapon: 1 }; a._afterGearChange(); return a.weapon ? (a.weapon.id || true) : false; }, 'wpn_' + style);
    check(cls + ': equipping ' + style + ' sets a styled weapon', !!eq, String(eq));
    const volley = await page.evaluate(() => { const a = window.__mm.arena; a.state = 'play'; a.run.wave = 0; a.paused = false; a.down = false; a.player.aim = 0; a.pBullets.forEach((b) => { b.active = false; }); a._firePlayerVolley(0); return a.pBullets.filter((b) => b.active).length; });
    check(cls + ': the styled weapon fires bolts', volley >= 1, String(volley));

    // reach Lv 4 -> toast
    const lv = await page.evaluate(() => { const a = window.__mm.arena; a.save.level = 4; a._levelUp(); return a.save.level; });
    await page.waitForTimeout(600);
    const toast = await page.evaluate(() => { const t = document.getElementById('mm-unlock-toast'); return t && !t.classList.contains('hidden') ? t.textContent : null; });
    check(cls + ': reaching Lv 4 shows an "Unlocked:" toast', lv === 4 && /Unlocked: /.test(String(toast)), String(toast));
    check(cls + ': the toast fits the phone screen', await page.evaluate(() => { const b = document.getElementById('mm-unlock-toast').getBoundingClientRect(); return b.left >= 0 && b.right <= innerWidth; }));

    // kill a group, measuring frame times while the weapon fires
    const res = await page.evaluate(async () => {
      const a = window.__mm.arena; const p = a.player;
      a.state = 'play'; a.paused = false; a.player.iframes = 1e9; a._hitPlayer = () => {};
      const es = [];
      for (let i = 0; i < 6; i++) { const e = a.spawnEnemy('ring', p.x + 80 + i * 30, p.y + (i % 2 ? 60 : -60)); if (e) { e.cd = 999; e.spdMul = 0; e.hp = e.maxHp = 20; es.push(e); } }
      const dts = []; let last = performance.now();
      for (let i = 0; i < 90; i++) {
        await new Promise((r) => requestAnimationFrame(r));
        const n = performance.now(); dts.push(n - last); last = n;
        if (i === 10) es.forEach((e) => { a._hitEnemy(e, 9999); });
      }
      dts.sort((x, y) => x - y);
      return { spawned: es.length, dead: es.filter((e) => !e.active || e.hp <= 0).length, median: dts[dts.length >> 1] };
    });
    check(cls + ': a group of 6 enemies spawns and dies', res.spawned === 6 && res.dead === 6, JSON.stringify(res));
    check(cls + ': median frame under 120 ms at 390x844 (' + res.median.toFixed(1) + ' ms)', res.median < 120, String(res.median));

    // hero panel
    const opened = await page.evaluate(() => window.__mm.arena.openHeroPanel('stats'));
    await page.waitForTimeout(300);
    const panel = await page.evaluate(() => { const e = document.getElementById('realm-hero'); const b = e.getBoundingClientRect(); return { shown: !e.classList.contains('hidden') && e.style.display !== 'none' && b.width > 0, fits: b.left >= -1 && b.right <= innerWidth + 1, noScroll: document.documentElement.scrollWidth <= innerWidth + 1, text: e.textContent.length }; });
    check(cls + ': the hero panel opens, fits the phone, has content, no horizontal scroll', opened === true && panel.shown && panel.fits && panel.noScroll && panel.text > 20, JSON.stringify(panel));
    errs.push(...errors);
    await ctx.close();
  }
  check('no console or page errors across all classes', errs.length === 0, errs.slice(0, 3).join(' | '));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
