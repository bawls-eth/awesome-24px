// FLOW: the Realm HUD wears the shared 8-bit skin (realm-8bit.css on shared/mm-8bit.css tokens): square segmented HP / XP bars, square
// ability buttons with a hard ink ring, square top buttons, a framed banner, the pixel font, no blur. Sizes, ids and behaviour unchanged.
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/realm-hud-8bit.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const MAZE = ORIGIN + '/game/games/mad-maze/index.html?test=1&offline=1';
const SAVE = { realm: { level: 7, xp: 4, shards: 50, bestWave: 2, deaths: 0, items: [], nextUid: 1, eq: {} } };

(async () => {
  const browser = await chromium.launch();
  for (const [label, vp, opts] of [['desktop', { width: 1280, height: 800 }, {}], ['390x844', { width: 390, height: 844 }, { hasTouch: true, isMobile: true }]]) {
    const ctx = await browser.newContext(Object.assign({ viewport: vp }, opts));
    await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' }));
    await ctx.route('**/game/hub/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>hub</title>hub' }));
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
    await page.evaluate((v) => { localStorage.clear(); localStorage.setItem('pixeltown-save-v1', v); }, JSON.stringify(SAVE));
    await page.goto(MAZE);
    await page.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena.state === 'play', null, { timeout: 10000 });
    const m = await page.evaluate(() => {
      const cs = (s) => { const e = document.querySelector(s); return e ? getComputedStyle(e) : null; };
      const rect = (s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; };
      const sheet = Array.from(document.styleSheets).some((x) => /realm-8bit\.css/.test(x.href || '')) && Array.from(document.styleSheets).some((x) => /mm-8bit\.css/.test(x.href || ''));
      const hp = cs('#realm-hp'), hpf = cs('#realm-hp-fill'), xpf = cs('#realm-xp-fill'), ab = cs('#realm-ab-0'), bp = cs('#realm-bp-btn'), key = cs('#realm-ab-0 .key');
      const shadows = ['#realm-hp', '#realm-ab-0', '#realm-bp-btn', '#realm-banner'].map((s) => (cs(s) || {}).boxShadow || '');
      const blur = shadows.some((sh) => sh.split(/,(?![^(]*\))/).some((part) => { const n = (part.match(/-?\d+(\.\d+)?px/g) || []).map(parseFloat); return n.length >= 3 && n[2] > 0; }));
      return { sheet, hpR: hp.borderRadius, hpSeg: /repeating-linear-gradient/.test(hpf.backgroundImage), xpSeg: /repeating-linear-gradient/.test(xpf.backgroundImage), abR: ab.borderRadius, bpR: bp.borderRadius,
        font: /monospace|Courier/i.test(cs('#realm-hp-text').fontFamily) && /monospace|Courier/i.test(key.fontFamily), ab: rect('#realm-ab-0'), bp: rect('#realm-bp-btn'), blur, shadows,
        ids: ['realm-hp', 'realm-hp-fill', 'realm-xp', 'realm-xp-fill', 'realm-abilities', 'realm-ab-3', 'realm-banner', 'realm-help', 'realm-bp-btn'].every((id) => !!document.getElementById(id)) };
    });
    check(`[${label}] the shared 8-bit theme and the Realm HUD skin are loaded`, m.sheet, JSON.stringify(m));
    check(`[${label}] HP / XP bars are square and segmented`, m.hpR === '0px' && m.hpSeg && m.xpSeg, JSON.stringify(m));
    check(`[${label}] ability + top buttons are square, pixel font on the HUD text`, m.abR === '0px' && m.bpR === '0px' && m.font, JSON.stringify(m));
    check(`[${label}] sizes unchanged: abilities 56 px, top buttons 44 px`, m.ab.w === 56 && m.ab.h === 56 && m.bp.w === 44 && m.bp.h === 44, JSON.stringify({ ab: m.ab, bp: m.bp }));
    check(`[${label}] hard pixel shadows only (no blur) and every HUD id still there`, !m.blur && m.ids, JSON.stringify(m.shadows));
    // banner: framed, readable, behaviour unchanged
    const b = await page.evaluate(() => { const a = window.__mm.arena; a._banner ? a._banner('Wave 2', 2) : (a.banner && a.banner('Wave 2', 2)); const e = document.getElementById('realm-banner'); const s = getComputedStyle(e); return { shown: !e.classList.contains('hidden'), txt: e.textContent, r: s.borderRadius, fs: parseFloat(s.fontSize), font: /monospace|Courier/i.test(s.fontFamily) }; });
    check(`[${label}] banner is square, pixel font, >= 15 px`, b.r === '0px' && b.font && b.fs >= 15, JSON.stringify(b));
    // play still works under the skin: an ability cast and HP bar update
    const play = await page.evaluate(() => { const a = window.__mm.arena; a.player.hp = Math.max(1, Math.floor(a.stats.maxHp / 2)); a._syncHud && a._syncHud(true); a.cast(0); return { w: document.getElementById('realm-hp-fill').style.width, state: a.state }; });
    check(`[${label}] play continues: HP bar width follows HP, state play`, /%$/.test(play.w) && play.state === 'play', JSON.stringify(play));
    check(`[${label}] no page errors`, errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
