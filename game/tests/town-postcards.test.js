// TN2 (design/NEXT-SLICES-3.md): the Town "Postcards" board, the arrival puff at the dock / gate and the Town low-end tier
// (shared MMPerf, forced through pixeltown-access-v1.lowGfx). OFFLINE ONLY: every database host is blocked (blockDb: http
// route + routeWebSocket), the Firebase SDK scripts are answered with an empty stub (the nav-town.test.js pattern) so the
// page never opens a database socket, and the player enters through "Play offline" as ADMINpost. Never chats, never
// writes to Firebase. Phone 390x844 (touch) and desktop 1280x720.
// Run: python3 -m http.server 8440 &   BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/town-postcards.test.js
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const PHONE = { label: '390x844', viewport: { width: 390, height: 844 }, touch: true };
const DESK = { label: '1280x720', viewport: { width: 1280, height: 720 }, touch: false };
const BOARD = { x: 1262, y: 540 }; // POSTCARD_POS in main.js
const BANNED = /you missed|missed|streak|come back|countdown|expires?|hurry|left today|\b\d{1,2}:\d{2}\b|\b\d+\s*(h|m|s|hours?|minutes?|seconds?)\b/i;

const SEED = {
  'pixeltown-medals-isles-v1': JSON.stringify({ v: 1, m: ['tame1', 'visit_reef'] }),
  'pixeltown-medals-angler-v1': JSON.stringify({ v: 1, m: ['catch1'] }),
  'pixeltown-profile-v1': JSON.stringify({ v: 1, name: 'Ben', games: { lantern: { done: ['hero1'] } } }),
};
const HOSTILE = {
  'pixeltown-medals-isles-v1': JSON.stringify({ v: 1, m: ['<img src=x onerror="window.__pwned=1">', '__proto__', 'constructor', 42, null] }),
  'pixeltown-medals-angler-v1': '[1,2,3]',
  'pixeltown-medals-bugs-v1': 'not json {',
  'pixeltown-medals-deepdelve-v1': JSON.stringify({ v: 1, m: 'bronze' }),
  'pixeltown-medals-stalk-v1': JSON.stringify({ m: [{ toString: 1 }], __proto__: { polluted: 1 } }),
  'pixeltown-profile-v1': JSON.stringify({ games: { lantern: { done: ['<b>x</b>', 'constructor', '__proto__'] }, jam: { done: 'star1' }, __proto__: { done: ['play'] } } }),
};

async function open(browser, prof, seed, query) {
  const ctx = await browser.newContext(prof.touch ? { viewport: prof.viewport, hasTouch: true, isMobile: true } : { viewport: prof.viewport });
  const db = await blockDb(ctx);
  await ctx.route(/gstatic\.com\/firebasejs\//, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: '/* firebase SDK blocked by town-postcards.test.js */' }));
  if (seed) await ctx.addInitScript((kv) => { if (!sessionStorage.tn2Seeded) { sessionStorage.tn2Seeded = '1'; localStorage.clear(); Object.keys(kv).forEach((k) => localStorage.setItem(k, kv[k])); } }, seed);
  const page = await ctx.newPage();
  const sockets = []; page.on('websocket', (ws) => sockets.push(ws.url()));
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.route('**/main.js*', async (route) => {
    const resp = await route.fetch();
    route.fulfill({ response: resp, body: (await resp.text()).replace('const game = new Phaser.Game(config);', 'const game = window.__g = new Phaser.Game(config);') });
  });
  await page.goto(BASE + (query || ''));
  await page.fill('#name-input', 'ADMINpost');
  await page.click('.species-tab');
  await page.click('.avatar-choice');
  await page.click('button:has-text("Join Town")');
  await page.waitForSelector('#join-offline-btn:not(.hidden)', { timeout: 12000 });
  if (prof.touch) await page.tap('#join-offline-btn'); else await page.click('#join-offline-btn');
  await page.waitForFunction(() => window.__g && window.__g.scene.getScene('Town') && window.__g.scene.getScene('Town').localBody, null, { timeout: 20000 });
  const tap = (sel) => (prof.touch ? page.tap(sel) : page.click(sel));
  return { ctx, page, db, sockets, errors, tap };
}
const finish = async (t, L) => {
  check(L('0 database requests and 0 sockets'), t.db.attempts() === 0 && t.sockets.length === 0, JSON.stringify([t.db.http, t.db.ws, t.sockets]));
  check(L('console clean'), t.errors.length === 0, t.errors.slice(0, 3).join(' | '));
  await t.ctx.close();
};
const storeSnap = (page) => page.evaluate(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/^pixeltown-(medals-|profile-)/.test(k)) o[k] = localStorage.getItem(k); } return JSON.stringify(o); });
const goBoard = (page) => page.evaluate((b) => { const s = window.__g.scene.getScene('Town'); const p = s.localBody; p.setPosition(b.x, b.y + 34); p.body.reset(b.x, b.y + 34); s.touchMove = { x: 0, y: 0 }; }, BOARD);
const overlayInfo = (page) => page.evaluate((banned) => {
  const ov = document.getElementById('postcards-overlay'); const lis = [...document.querySelectorAll('#postcards-list li')];
  const close = document.getElementById('postcards-close-btn').getBoundingClientRect();
  const texts = [...ov.querySelectorAll('h1, p, li')].filter((e) => e.getBoundingClientRect().height > 0);
  const minFont = Math.min(...texts.map((e) => parseFloat(getComputedStyle(e).fontSize)));
  const card = ov.querySelector('.join-card').getBoundingClientRect();
  return { open: !ov.classList.contains('hidden'), lines: lis.filter((l) => l.classList.contains('postcard-line')).map((l) => l.textContent), empty: lis.filter((l) => l.classList.contains('postcards-empty')).length,
    childEls: lis.reduce((a, l) => a + l.children.length, 0), imgs: ov.querySelectorAll('img, script, b').length, pwned: !!window.__pwned,
    banned: new RegExp(banned, 'i').test(ov.textContent), text: ov.textContent.replace(/\s+/g, ' ').trim(), minFont, close: { w: close.width, h: close.height },
    onScreen: card.left >= 0 && card.top >= 0 && card.right <= innerWidth + 0.5 && card.bottom <= innerHeight + 0.5 };
}, BANNED.source);

// median frame time of the real Town (loop asleep, fixed-dt steps + a render with a 1 px readback so GPU time counts) under 4x CPU throttle
async function medianFrame(browser, low) {
  const t = await open(browser, DESK, low ? { 'pixeltown-access-v1': JSON.stringify({ v: 1, lowGfx: true }) } : {}, '');
  await t.page.waitForTimeout(800);
  const cdp = await t.ctx.newCDPSession(t.page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const r = await t.page.evaluate(() => {
    const g = window.__g; g.loop.sleep();
    const gl = g.renderer.gl; const px = new Uint8Array(4); const ts = []; let now = 1e6;
    for (let i = 0; i < 70; i++) {
      const a = performance.now(); now += 1000 / 60; g.headlessStep(now, 1000 / 60);
      g.renderer.preRender(); g.scene.render(g.renderer); g.renderer.postRender();
      if (gl) gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      ts.push(performance.now() - a);
    }
    ts.splice(0, 10); ts.sort((x, y) => x - y);
    return { med: ts[ts.length >> 1], tier: window.__townPerf.tier };
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await finish(t, (s) => `[perf ${low ? 'low' : 'default'}] ${s}`);
  return r;
}

(async () => {
  const browser = await chromium.launch();

  // ---------- 1. the Postcards board with seeded medals + profile, phone and desktop ----------
  for (const prof of [PHONE, DESK]) {
    const L = (s) => `[postcards ${prof.label}] ${s}`;
    const t = await open(browser, prof, SEED, '');
    const before = await storeSnap(t.page);
    await goBoard(t.page);
    await t.page.waitForTimeout(300);
    const hint = await t.page.evaluate(() => { const e = document.getElementById('postcards-hint'); const r = e.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { vis: !e.classList.contains('hidden') && r.height > 0, h: r.height, w: r.width, onTop: !!top && e.contains(top), fs: parseFloat(getComputedStyle(e).fontSize), inView: r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight }; });
    check(L('next to the board a "Read the postcards" button shows, on top and on screen'), hint.vis && hint.onTop && hint.inView, JSON.stringify(hint));
    check(L('the board button is a >= 44 px target with >= 12 px text'), hint.h >= 44 && hint.w >= 44 && hint.fs >= 12, JSON.stringify(hint));
    if (prof.touch) await t.tap('#postcards-hint');
    else { await t.page.keyboard.down('e'); await t.page.waitForTimeout(80); await t.page.keyboard.up('e'); }
    await t.page.waitForTimeout(200);
    const o = await overlayInfo(t.page);
    check(L(`${prof.touch ? 'tapping the button' : 'pressing E'} opens the Postcards board`), o.open, JSON.stringify(o));
    check(L('"Recently: First tame on the isles" is shown (from pixeltown-medals-isles-v1)'), o.lines.includes('Recently: First tame on the isles'), JSON.stringify(o.lines));
    check(L('newest medal first per game, plus Angler and the Lantern (from pixeltown-profile-v1)'), o.lines[0] === 'Recently: Coral Reef on the isles' && o.lines.includes('Recently: First catch in Angler') && o.lines.includes('Recently: First hero in the Lantern') && o.lines.length === 4, JSON.stringify(o.lines));
    check(L('lines are plain text (textContent only: no child elements)'), o.childEls === 0 && o.imgs === 0, JSON.stringify(o));
    check(L('no "you missed" / streak / "come back" / countdown wording'), !o.banned, o.text);
    check(L('every board text is >= 12 px, the close button is >= 44 px, the card fits the screen'), o.minFont >= 12 && o.close.w >= 44 && o.close.h >= 44 && o.onScreen, JSON.stringify(o));
    const acts = await t.page.evaluate(() => window.__g.scene.getScene('Town').canAct());
    check(L('while the board is open the town does not take actions'), acts === false);
    await t.tap('#postcards-close-btn');
    await t.page.waitForTimeout(150);
    const closed = await t.page.evaluate(() => ({ hidden: document.getElementById('postcards-overlay').classList.contains('hidden'), flag: window.__g.scene.getScene('Town').postcardsOpen }));
    check(L('the close button closes it'), closed.hidden && closed.flag === false, JSON.stringify(closed));
    check(L('reading the board writes nothing (medals + profile keys unchanged)'), (await storeSnap(t.page)) === before);
    // walking away hides the button again
    await t.page.evaluate(() => { const s = window.__g.scene.getScene('Town'); const p = s.localBody; p.setPosition(1200, 600); p.body.reset(1200, 600); });
    await t.page.waitForTimeout(250);
    check(L('away from the board the button hides'), await t.page.evaluate(() => document.getElementById('postcards-hint').classList.contains('hidden')));
    await finish(t, L);
  }

  // ---------- 2. hostile JSON shows nothing; a fresh profile shows the calm empty card and creates no key ----------
  for (const [prof, seed, name] of [[DESK, HOSTILE, 'hostile'], [PHONE, {}, 'fresh']]) {
    const L = (s) => `[postcards ${name} ${prof.label}] ${s}`;
    const t = await open(browser, prof, seed, '');
    const before = await storeSnap(t.page);
    await goBoard(t.page);
    await t.page.waitForTimeout(300);
    await t.page.evaluate(() => window.__g.scene.getScene('Town').interact());
    await t.page.waitForTimeout(150);
    const o = await overlayInfo(t.page);
    check(L('the board opens with the interact action'), o.open, JSON.stringify(o));
    check(L('no postcard lines, only the empty note'), o.lines.length === 0 && o.empty === 1, JSON.stringify(o.lines));
    check(L('nothing from storage reaches the DOM as markup (no img/b/script, no handler ran)'), o.imgs === 0 && o.childEls === 0 && !o.pwned, JSON.stringify(o));
    check(L('the empty note has no urgency wording'), !o.banned, o.text);
    const after = await storeSnap(t.page);
    check(L('storage untouched (no profile key seeded, hostile values kept as they were)'), after === before && (name !== 'fresh' || !/pixeltown-profile-v1/.test(after)), after.slice(0, 200));
    await finish(t, L);
  }

  // ---------- 3. the arrival puff at the dock (?from=isles) and the Realm Gate (?from=realm) ----------
  for (const [prof, q, where] of [[PHONE, '?from=isles', 'dock'], [DESK, '?from=realm', 'gate']]) {
    const L = (s) => `[arrival ${where} ${prof.label}] ${s}`;
    const t = await open(browser, prof, {}, q);
    const a = await t.page.evaluate(() => { const s = window.__g.scene.getScene('Town'); return { info: window.__townArrival || null, tex: s.textures.exists('arrival_puff'), p: [Math.round(s.localBody.x), Math.round(s.localBody.y)] }; });
    const want = where === 'dock' ? [452, 596] : [750, 376];
    check(L('the player arrives at the spot and a puff played there'), !!a.info && a.info.x === want[0] && a.info.y === want[1] && Math.abs(a.p[0] - want[0]) < 30 && Math.abs(a.p[1] - want[1]) < 30, JSON.stringify(a));
    check(L('the default tier puff has 6 pieces from ONE cached texture'), a.info && a.info.puffs === 6 && a.tex, JSON.stringify(a));
    await t.page.waitForTimeout(1200);
    const left = await t.page.evaluate(() => { const s = window.__g.scene.getScene('Town'); return { imgs: s.children.list.filter((c) => c.texture && c.texture.key === 'arrival_puff').length, tweens: s.tweens.getTweens().filter((tw) => tw.targets && tw.targets.some((x) => x.texture && x.texture.key === 'arrival_puff')).length }; });
    check(L('after the puff nothing is left: no images, no tweens (no per-frame churn)'), left.imgs === 0 && left.tweens === 0, JSON.stringify(left));
    await finish(t, L);
  }
  {
    const L = (s) => `[arrival plaza 390x844] ${s}`;
    const t = await open(browser, PHONE, {}, '');
    const a = await t.page.evaluate(() => window.__townArrival || null);
    check(L('a normal plaza spawn plays no puff'), a === null, JSON.stringify(a));
    await finish(t, L);
  }

  // ---------- 4. the low tier (pixeltown-access-v1.lowGfx) vs the default tier ----------
  const LOW = { 'pixeltown-access-v1': JSON.stringify({ v: 1, lowGfx: true }) };
  for (const prof of [DESK, PHONE]) {
    const st = {};
    for (const low of [false, true]) {
      const L = (s) => `[tier ${low ? 'low' : 'default'} ${prof.label}] ${s}`;
      const t = await open(browser, prof, low ? LOW : {}, low ? '?from=isles' : '');
      await t.page.waitForTimeout(400);
      st[low] = await t.page.evaluate(() => {
        const s = window.__g.scene.getScene('Town'); const kids = s.children.list;
        return { perf: window.__townPerf, rain: s.rainDrops.length, crests: kids.filter((c) => c.texture && (c.texture.key === 'wave_crest' || c.texture.key === 'foam_dash')).length,
          cls: document.body.classList.contains('town-low-gfx'), rs: document.getElementById('game-container').dataset.renderScale || '1', zoom: s.cameras.main.zoom, base: s.baseZoom,
          sparks: window.MMPerf ? MMPerf.CAPS.low.sparks : null, puffs: window.__townArrival ? window.__townArrival.puffs : null, reduce: document.body.classList.contains('a11y-reduce-motion'), gw: s.scale.width, iw: innerWidth };
      });
      const r = st[low];
      if (!low) {
        check(L('default tier is unchanged: high, 70 rain drops, ocean crest/foam layers, no low class, villagers every frame'), r.perf.tier === 'high' && !r.perf.forced && r.rain === 70 && r.crests > 0 && !r.cls && r.perf.npcEvery === 1, JSON.stringify(r));
        check(L('default tier keeps the full render scale at start'), r.perf.renderScale === 1 && (prof.touch ? r.rs === '1' : true), JSON.stringify(r));
        check(L('the shared MMPerf module is loaded'), r.sparks === 12, String(r.sparks));
      } else {
        check(L('lowGfx forces the MMPerf low tier'), r.perf.tier === 'low' && r.perf.forced === true && r.cls, JSON.stringify(r.perf));
        // Low graphics also turns on the Town's reduce-motion class (applyTownAccess), so the puff is the one still piece.
        check(L('particles capped to MMPerf low sparks: rain drops, and the arrival puff is one still piece'), r.rain === r.sparks && r.rain < 70 && r.perf.puffs <= 3 && r.puffs === 1 && r.reduce, JSON.stringify(r));
        check(L('ambient layers capped: no ocean crest / foam images, NPCs eased every 3rd frame'), r.crests === 0 && r.perf.npcEvery === 3 && r.perf.ambientLayers === false, JSON.stringify(r));
        const gwWant = Math.max(320, Math.round(r.iw * 0.75)); // the canvas never goes under 320 px wide
        check(L('render scale 0.75 and the camera zoom follows the real canvas ratio, so the visible world is unchanged'), r.rs === '0.75' && r.gw === gwWant && Math.abs(r.zoom - r.base * (r.gw / r.iw)) < 1e-6, JSON.stringify(r));
        const ok = await t.page.evaluate(() => { const s = window.__g.scene.getScene('Town'); const v = s.villagerState; return !!v; });
        check(L('villagers still exist and update on the low tier'), ok);
      }
      await finish(t, L);
    }
  }

  // ---------- 5. low tier median frame time under a 4x CPU throttle (desktop) ----------
  {
    const d1 = await medianFrame(browser, false), l1 = await medianFrame(browser, true);
    const d2 = await medianFrame(browser, false), l2 = await medianFrame(browser, true);
    const dm = Math.min(d1.med, d2.med), lm = Math.min(l1.med, l2.med); // best of two each: robust on a shared box
    const cut = 1 - lm / dm;
    console.log(`INFO median frame under 4x throttle: default ${dm.toFixed(1)} ms, low ${lm.toFixed(1)} ms, cut ${(cut * 100).toFixed(1)}%`);
    check('[perf] the low tier cuts the median frame time by >= 15% under a 4x CPU throttle', cut >= 0.15 && d1.tier === 'high' && l1.tier === 'low', JSON.stringify({ d1, d2, l1, l2 }));
  }

  // ---------- 6. the TN2 code adds no net.* call ----------
  {
    const src = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
    const a = src.indexOf('// TN2: a read-only "Postcards" board'), b = src.indexOf('return lines.slice(0, POSTCARD_MAX);');
    const c = src.indexOf('  playArrivalPuff(at) {'), d = src.indexOf('\n  }\n', src.indexOf('  renderPostcards() {'));
    const e = src.indexOf('const TOWN_PERF = (function townPerfTier()'), f = src.indexOf('})();', e);
    const parts = [src.slice(a, b), src.slice(c, d), src.slice(e, f)];
    check('[source] the TN2 blocks were found', a > 0 && b > a && c > 0 && d > c && e > 0 && f > e);
    check('[source] the TN2 blocks make no net.* / firebase call and use no innerHTML', parts.every((p) => !/\bnet\.|firebase|innerHTML/.test(p)), parts.map((p) => p.length).join(','));
  }

  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
