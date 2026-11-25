// cyc7 G: the Realm's fast aimed enemy shot (Sniper bursts, boss fans) moves from pink-red (hue ~350) to orange-red (hue ~13) so the three
// enemy bullet hues (orange-red aimed / violet spiral / amber ring) separate from red ground decoration (beta r3 "red dots" follow-up,
// cycle-6 proposal). Both draw paths are checked: the code sprite (arena.sprites.eBullet[0]) and the b17 `ebolt_orb_red` art baked by
// _boltCv (its saturated pixels rotate, the dark rim stays). `?hitfx=0` keeps the old pink-red (A/B). Spiral / ring are unchanged.
// Offline: WebSockets closed, town/hub pages stubbed, no chat, no DB writes (the Realm page here never loads Firebase).
// Run: BASE=http://localhost:9703/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc7-art-realm-aimed-hue.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&seed=12345';
const MM = 'pixeltown-mm-v1', ACTIVE = 'pixeltown-mm-active-v1';
const hero = (id, cls, level) => ({ id, name: cls, cls, level, xp: 0, fame: 0, bonus: 0, mode: 'classic', items: [] });
const prof = (heroes) => ({ v: 1, heroes, stash: new Array(16).fill(null), fame: 0, mode: 'classic', hall: [], migratedFrom: null });

async function probe(browser, query) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' }));
  await ctx.route('**/hub/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>hub</title>hub' }));
  await ctx.routeWebSocket(/.*/, (ws) => ws.close()); // never reach the live DB
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate(([k1, p, k2, a]) => { localStorage.setItem(k1, JSON.stringify(p)); localStorage.setItem(k2, a); }, [MM, prof([hero('h-r', 'ranger', 6)]), ACTIVE, JSON.stringify({ v: 1, heroId: 'h-r' })]);
  errors.length = 0;
  await page.goto(WORLD + (query || ''));
  await page.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 20000 });
  await page.waitForFunction(() => { const A = window.__mm.arena._boltArt; return A && A.has('ebolt_orb_red') && A.anim('ebolt_orb_red'); }, null, { timeout: 20000 });
  const r = await page.evaluate(() => {
    const a = window.__mm.arena;
    // mean hue (degrees, circular), dominant hue (hue of the most frequent saturated colour) and count of the saturated pixels of a
    // canvas; the dark rim / white core are skipped
    const hueOf = (cv) => {
      const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let sx = 0, sy = 0, n = 0; const freq = {};
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 200) continue; const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), ch = mx - mn, l = (mx + mn) / 2;
        if (ch < 0.4 || l < 0.25 || l > 0.85) continue;
        let h = mx === r ? ((g - b) / ch) % 6 : mx === g ? (b - r) / ch + 2 : (r - g) / ch + 4; const hd = Math.round((h * 60 + 360) % 360); freq[hd] = (freq[hd] || 0) + 1;
        h = h * 60 * Math.PI / 180; sx += Math.cos(h); sy += Math.sin(h); n++;
      }
      let dom = -1, best = 0; Object.keys(freq).forEach((k) => { if (freq[k] > best) { best = freq[k]; dom = +k; } });
      return { hue: n ? Math.round(((Math.atan2(sy, sx) * 180 / Math.PI) + 360) % 360) : -1, dom, n };
    };
    const code = a.sprites.eBullet.map(hueOf);
    const art = hueOf(a._boltCv('ebolt_orb_red', 0, 0, RM_BOLT_D.enemy));
    const ring = a._boltArt.has('ebolt_ring_pulse') ? hueOf(a._boltCv('ebolt_ring_pulse', 0, 0, RM_BOLT_D.enemy)) : null;
    return { code, art, ring, sel: a._ebSelect(0) };
  });
  await ctx.close();
  return { r, errors };
}
const dist = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

(async () => {
  const browser = await chromium.launch();
  const on = await probe(browser, ''), off = await probe(browser, '&hitfx=0');
  console.log('INFO ' + JSON.stringify({ on: on.r, off: off.r }));
  const c = on.r.code;
  check('code sprite: the aimed shot is orange-red (hue 8..22), was pink-red', c[0].n > 10 && c[0].hue >= 8 && c[0].hue <= 22, JSON.stringify(c[0]));
  check('code sprite: spiral stays violet and ring stays amber (unchanged hues)', dist(c[1].hue, off.r.code[1].hue) <= 2 && dist(c[2].hue, off.r.code[2].hue) <= 2 && c[1].hue > 250 && c[1].hue < 300 && c[2].hue > 28 && c[2].hue < 45, JSON.stringify(c));
  check('the three code hues stay apart: aimed vs ring >= 15 deg, aimed vs spiral >= 60 deg, aimed >= 8 deg off pure red decor', dist(c[0].hue, c[2].hue) >= 15 && dist(c[0].hue, c[1].hue) >= 60 && dist(c[0].hue, 0) >= 8, JSON.stringify(c));
  check('art: the aimed shot still uses ebolt_orb_red and its baked frame is orange-red (hue 5..22)', on.r.sel === 'ebolt_orb_red' && on.r.art.n > 20 && on.r.art.hue >= 5 && on.r.art.hue <= 22, JSON.stringify(on.r.art));
  check('art: the aimed orb moved >= 15 deg from its pink-red source', dist(on.r.art.hue, off.r.art.hue) >= 15, JSON.stringify([on.r.art, off.r.art]));
  // the ring pulse body is the same pink-red (dominant hue ~347) the aimed orb used to be (349): after the shift the two body colours differ
  check('art: the aimed orb body colour is >= 15 deg from the ring pulse body colour (was ~2 deg apart)', !on.r.ring || (dist(on.r.art.dom, on.r.ring.dom) >= 15 && dist(off.r.art.dom, off.r.ring.dom) < 15),
    JSON.stringify([on.r.art, on.r.ring, off.r.art, off.r.ring]));
  check('?hitfx=0 keeps the old pink-red aimed shot in both paths (hue 340..360)', off.r.code[0].hue >= 340 && off.r.art.hue >= 335, JSON.stringify([off.r.code[0], off.r.art]));
  check('no page / console errors', on.errors.length === 0 && off.errors.length === 0, JSON.stringify(on.errors.concat(off.errors).slice(0, 4)));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
