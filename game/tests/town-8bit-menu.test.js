// town-8bit: the Town menu panel (hero line, Town / Stats / More tabs, button grid, stat block) and the simplified touch
// strip (Emotes, A, More, Chat; Build / Photo / Tilt behind More). OFFLINE only: every database host is blocked (blockDb)
// and the Firebase SDK is answered with an empty stub (the nav-town.test.js pattern), the player enters through
// "Play offline" as ADMIN8bit. Never chats, never writes to Firebase. Runs at 390x844 (touch) and 1280x720 (desktop).
// Run: python3 -m http.server 8440 &   BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/town-8bit-menu.test.js
const { chromium } = require('playwright');
const { check, done, offlineStub } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';

async function open(browser, viewport, touch) {
  const ctx = await browser.newContext(touch ? { viewport, hasTouch: true, isMobile: true } : { viewport });
  const db = await offlineStub(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.route('**/main.js*', async (route) => {
    const resp = await route.fetch();
    const body = (await resp.text()).replace('const game = new Phaser.Game(config);', 'const game = window.__g = new Phaser.Game(config);');
    route.fulfill({ response: resp, body });
  });
  await page.goto(BASE + '?hud=online'); // U-01: offline hides quick chat / Hold to talk; this measures the online HUD layout
  await page.fill('#name-input', 'ADMIN8bit');
  await page.click('.species-tab'); await page.waitForTimeout(100);
  await page.click('.avatar-choice');
  await page.click('button:has-text("Join Town")'); // SDK stubbed + DB blocked: the join fails at once and offers Play offline
  await page.waitForSelector('#join-offline-btn:not(.hidden)', { timeout: 15000 });
  await page.click('#join-offline-btn');
  await page.waitForFunction(() => window.__g && window.__g.scene.getScene('Town') && window.__g.scene.getScene('Town').localBody, null, { timeout: 20000 });
  await page.waitForTimeout(800);
  return { ctx, page, errors, db };
}

const box = (page, sel) => page.evaluate((s) => {
  const e = document.querySelector(s); if (!e) return null;
  const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
  return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, vis: cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0, fs: parseFloat(cs.fontSize), text: e.textContent.replace(/\s+/g, ' ').trim() };
}, sel);
const overlap = (a, b) => a && b && a.vis && b.vis && a.l < b.r - 0.5 && a.r > b.l + 0.5 && a.t < b.b - 0.5 && a.b > b.t + 0.5;

(async () => {
  const browser = await chromium.launch();
  for (const [tag, vp, touch] of [['390x844', { width: 390, height: 844 }, true], ['1280x720', { width: 1280, height: 720 }, false]]) {
    const { ctx, page, errors, db } = await open(browser, vp, touch);
    const saveBefore = await page.evaluate(() => localStorage.getItem('pixeltown-save-v1'));
    if (touch) { await page.click('#panel-toggle'); await page.waitForTimeout(250); }

    // ---- hero line ----
    const hero = await page.evaluate(() => ({ name: document.getElementById('hero-name').textContent, stats: document.getElementById('hero-stats').textContent }));
    const heroBox = await box(page, '#hero-line');
    check(`${tag}: hero line shows the player name`, hero.name === 'ADMIN8bit', JSON.stringify(hero));
    check(`${tag}: hero line shows stars and trophies (n/cap)`, /⭐ \d+ · 🏆 \d+\/\d+/.test(hero.stats), hero.stats);
    check(`${tag}: hero line is visible with >= 12 px text`, heroBox.vis && heroBox.fs >= 12, JSON.stringify(heroBox));
    const after = await page.evaluate(() => { const s = window.__g.scene.getScene('Town'); s.awardPoint(3, '+3', s.localBody.x, s.localBody.y); return document.getElementById('hero-stats').textContent; });
    check(`${tag}: hero stars follow the score`, /^⭐ \d+/.test(after) && after !== hero.stats, after);

    // ---- tabs ----
    const tabs = await page.evaluate(() => [...document.querySelectorAll('#town-tabs [role=tab]')].map((t) => { const r = t.getBoundingClientRect(); return { id: t.id, h: r.height, w: r.width, fs: parseFloat(getComputedStyle(t).fontSize), sel: t.getAttribute('aria-selected') }; }));
    check(`${tag}: exactly 3 tabs (Town, Stats, More)`, tabs.length === 3 && tabs.map((t) => t.id).join() === 'town-tab-town,town-tab-stats,settings-toggle-btn', JSON.stringify(tabs));
    check(`${tag}: every tab is >= 44 px tall with >= 12 px text`, tabs.every((t) => t.h >= 44 && t.fs >= 12), JSON.stringify(tabs));
    check(`${tag}: Town is the selected tab by default`, tabs[0].sel === 'true' && tabs[1].sel === 'false' && tabs[2].sel === 'false', JSON.stringify(tabs));

    // ---- Town pane: tidy 2-column button grid ----
    const grid = await page.evaluate(() => [...document.querySelectorAll('#town-quick-grid > *')].map((e) => { const r = e.getBoundingClientRect(); return { id: e.id, l: r.left, t: r.top, r: r.right, b: r.bottom, h: r.height, fs: parseFloat(getComputedStyle(e).fontSize) }; }));
    const cols = new Set(grid.map((g) => Math.round(g.l)));
    let gridHit = null;
    for (let i = 0; i < grid.length; i++) for (let j = i + 1; j < grid.length; j++) { const a = grid[i]; const b = grid[j]; if (a.l < b.r - 0.5 && a.r > b.l + 0.5 && a.t < b.b - 0.5 && a.b > b.t + 0.5) gridHit = `${a.id} x ${b.id}`; }
    check(`${tag}: Town pane keeps all 6 buttons (trophies, map, world map, museum, today, journal)`, grid.map((g) => g.id).join() === 'achievements-badge,map-btn,world-map-link,museum-badge,dailies-btn,journal-btn', JSON.stringify(grid.map((g) => g.id)));
    check(`${tag}: the button grid has 2 columns and no overlaps`, cols.size === 2 && !gridHit, JSON.stringify([...cols, gridHit]));
    check(`${tag}: every grid button is >= 44 px tall with >= 12 px text`, grid.every((g) => g.h >= 44 && g.fs >= 12), JSON.stringify(grid));

    // ---- Stats pane ----
    await page.click('#town-tab-stats'); await page.waitForTimeout(150);
    const st = await page.evaluate(() => {
      const vis = (id) => { const e = document.getElementById(id); return !!e && e.getBoundingClientRect().width > 0; };
      const dts = [...document.querySelectorAll('#stat-block dt')].map((d) => d.textContent);
      const dds = [...document.querySelectorAll('#stat-block dd')].map((d) => d.textContent);
      const fs = [...document.querySelectorAll('#stat-block dt, #stat-block dd, #streak-badge, #town-rating, #town-tidy')].map((e) => parseFloat(getComputedStyle(e).fontSize));
      return { dts, dds, fs, streak: vis('streak-badge'), rating: vis('town-rating'), tidy: vis('town-tidy'), grid: vis('achievements-badge'), sel: document.getElementById('town-tab-stats').getAttribute('aria-selected') };
    });
    check(`${tag}: Stats tab shows the streak, town rating and tidiness lines`, st.streak && st.rating && st.tidy && st.sel === 'true', JSON.stringify(st));
    check(`${tag}: plain stat block lists stars, trophies, museum, fish, bugs, days in town (cycle 8 ID-09: was the streak)`, st.dts.length === 6 && /Stars/.test(st.dts[0]) && /Days in town/.test(st.dts[5]) && st.dds.every((v) => /^\d+(\/\d+)?$/.test(v)), JSON.stringify(st));
    check(`${tag}: Stats text is >= 12 px and the Town grid is hidden while Stats is open`, st.fs.every((f) => f >= 12) && !st.grid, JSON.stringify(st.fs));

    // ---- More pane (settings) ----
    await page.click('#settings-toggle-btn'); await page.waitForTimeout(150);
    const more = await page.evaluate(() => ({ open: !document.getElementById('settings-section').classList.contains('hidden'), statsHidden: document.getElementById('town-pane-stats').getBoundingClientRect().width === 0, sel: document.getElementById('settings-toggle-btn').getAttribute('aria-selected'), saved: JSON.parse(localStorage.getItem('pixeltown-save-v1') || '{}').settingsOpen }));
    check(`${tag}: More opens the settings pane and hides Stats`, more.open && more.statsHidden && more.sel === 'true', JSON.stringify(more));
    check(`${tag}: More is remembered in the existing settingsOpen key`, more.saved === true, JSON.stringify(more));
    await page.click('#settings-toggle-btn'); await page.waitForTimeout(150);
    const back = await page.evaluate(() => ({ closed: document.getElementById('settings-section').classList.contains('hidden'), town: document.getElementById('town-tab-town').getAttribute('aria-selected'), saved: JSON.parse(localStorage.getItem('pixeltown-save-v1') || '{}').settingsOpen }));
    check(`${tag}: tapping More again returns to the Town tab`, back.closed && back.town === 'true' && back.saved === false, JSON.stringify(back));

    // ---- no overlap with quick chat / menu buttons (quick chat >= 40 px) ----
    const panel = await box(page, '#player-list-panel');
    const qc = await page.evaluate(() => [...document.querySelectorAll('#quick-chat-row button')].map((b) => b.getBoundingClientRect().height));
    const hits = [];
    for (const s of ['#chat-panel', '#quick-chat-row', '#joystick', '#action-buttons', '#inventory-panel', '#walkie-panel']) if (overlap(panel, await box(page, s))) hits.push(s);
    check(`${tag}: the menu panel overlaps no chat / quick chat / controls / inventory / walkie`, hits.length === 0, JSON.stringify(hits));
    check(`${tag}: quick-chat buttons stay >= 40 px tall`, qc.length >= 4 && qc.every((h) => h >= 40), JSON.stringify(qc));
    check(`${tag}: "Where to?" stays visible and >= 44 px`, (await box(page, '#where-to-btn')).h >= 44);

    // ---- 8-bit look: hard pixel edges ----
    const look = await page.evaluate(() => {
      const cs = (sel) => getComputedStyle(document.querySelector(sel));
      return { panelR: cs('#player-list-panel').borderTopLeftRadius, panelB: cs('#player-list-panel').borderTopWidth, tabR: cs('#town-tab-town').borderTopLeftRadius, chatR: cs('#chat-panel').borderTopLeftRadius, canvas: cs('#game-container canvas').imageRendering };
    });
    check(`${tag}: panel, tabs and chat have square pixel corners`, look.panelR === '0px' && look.tabR === '0px' && look.chatR === '0px', JSON.stringify(look));
    check(`${tag}: panel has a solid >= 3 px outline`, parseFloat(look.panelB) >= 3, JSON.stringify(look));
    check(`${tag}: the world canvas scales with pixelated rendering`, look.canvas === 'pixelated', JSON.stringify(look));

    // ---- touch strip: More groups Build / Photo / Tilt ----
    if (touch) {
      const strip = async () => page.evaluate(() => {
        const v = (id) => { const e = document.getElementById(id); const r = e.getBoundingClientRect(); return getComputedStyle(e).display !== 'none' && r.width > 0 ? { t: r.top, l: r.left, h: r.height } : null; };
        return { emote: v('emote-toggle-btn'), a: v('interact-btn'), chat: v('mobile-chat-btn'), more: v('hud-more-btn'), build: v('build-toggle-btn'), photo: v('mobile-photo-btn'), expanded: document.getElementById('hud-more-btn').getAttribute('aria-expanded') };
      });
      const s0 = await strip();
      check(`${tag}: touch strip shows Emotes, A, Chat and More by default`, s0.emote && s0.a && s0.chat && s0.more && s0.more.h >= 44, JSON.stringify(s0));
      check(`${tag}: Build and Photo wait behind More`, !s0.build && !s0.photo && s0.expanded === 'false', JSON.stringify(s0));
      await page.click('#hud-more-btn'); await page.waitForTimeout(150);
      const s1 = await strip();
      check(`${tag}: More reveals Build and Photo without moving A or Chat`, s1.build && s1.photo && s1.expanded === 'true' && Math.abs(s1.a.t - s0.a.t) < 1 && Math.abs(s1.chat.t - s0.chat.t) < 1, JSON.stringify([s0, s1]));
      await page.click('#build-toggle-btn'); await page.waitForTimeout(200);
      check(`${tag}: B from the More tray still toggles build mode`, await page.evaluate(() => !!window.__g.scene.getScene('Town').buildMode), '');
      await page.click('#build-toggle-btn'); await page.waitForTimeout(150);
      await page.click('#hud-more-btn'); await page.waitForTimeout(150);
      const s2 = await strip();
      check(`${tag}: tapping Less hides the tray again`, !s2.build && s2.expanded === 'false', JSON.stringify(s2));
      const sh = await box(page, '#action-buttons');
      check(`${tag}: closed touch strip is 2 buttons wide (fewer always-visible buttons)`, sh.w <= 130, JSON.stringify(sh));
    }

    const saveAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('pixeltown-save-v1') || '{}'));
    const before = JSON.parse(saveBefore || '{}');
    check(`${tag}: the save stays additive (no key from before is lost)`, Object.keys(before).every((k) => k in saveAfter), JSON.stringify(Object.keys(before).filter((k) => !(k in saveAfter))));
    check(`${tag}: 0 database requests / sockets`, db.attempts() === 0, JSON.stringify([db.http, db.ws]));
    check(`${tag}: no console errors`, errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  await browser.close();
  done();
})();
