// cyc5-ui (retest 3 P2 b10-r3-02, b15-r3-01): 195x422 touch (a phone at 200% zoom).
// Jam: the header + three HUD rows pushed the lanes to y=261 and the pads to y=470 of 422: now, after a real tap on the quick-play
//   button, the lanes canvas and all four pads are inside the first screen with no scrolling, and the page does not scroll.
// Deepdelve: the top bar wrapped (36 px page h-scroll), the tool row took two rows and the coach line printed over the HP panel and the
//   Jump / Mine / Place column: now no page h-scroll, the tool row is one row (it scrolls inside itself), and the HUD, the coach line,
//   the stick and every thumb button are pairwise apart. blockDb: no database traffic.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/cyc5-ui-195-jam-deepdelve.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const hit = (a, b) => !!(a && b && a.x < b.r - 0.5 && b.x < a.r - 0.5 && a.y < b.b - 0.5 && b.y < a.b - 0.5);

(async () => {
  const browser = await chromium.launch(); const errs = [];
  const ctx = await browser.newContext({ viewport: { width: 195, height: 422 }, hasTouch: true, isMobile: true });
  const db = await blockDb(ctx);
  const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message));
  // ---- Jam ----
  await p.goto(ORIGIN + '/game/games/jam/index.html?test=1');
  await p.waitForSelector('#quick-play');
  const ok = p.locator('#hint-ok'); if (await ok.isVisible().catch(() => false)) await ok.tap();
  await p.tap('#quick-play');
  await p.waitForTimeout(700);
  const j = await p.evaluate(() => {
    const R = (e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, r: r.right, b: r.bottom }; };
    const cv = R(document.getElementById('game')), pads = Array.from(document.querySelectorAll('#pads .pad')).map(R);
    return { cv, pads, sy: scrollY, ih: innerHeight, playing: document.getElementById('overlay').hidden };
  });
  check('Jam 195x422: a song is running after the quick-play tap', j.playing, JSON.stringify(j));
  check('Jam 195x422: the lanes canvas is fully on the first screen', j.cv.y >= 0 && j.cv.b <= j.ih && j.cv.b - j.cv.y >= 180, JSON.stringify(j.cv));
  check('Jam 195x422: all four pads are on the first screen (no scrolling), each >= 44 px', j.pads.length === 4 && j.pads.every((r) => r.y >= 0 && r.b <= j.ih && r.r - r.x >= 44 && r.b - r.y >= 44) && j.sy === 0, JSON.stringify(j));
  await p.screenshot({ path: require('path').join(__dirname, '..', 'design', 'beta', 'img', 'cyc5-ui-jam-195x422.jpg'), type: 'jpeg', quality: 60 }).catch(() => {});
  // ---- Deepdelve ----
  await p.goto(ORIGIN + '/game/games/deepdelve/index.html');
  await p.waitForFunction(() => { const m = document.getElementById('msg'); return m && /drag|stick|dig/i.test(m.textContent); }, null, { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(300);
  const d = await p.evaluate(() => {
    const vis = (e) => e && e.offsetParent && getComputedStyle(e).visibility !== 'hidden' && e.getBoundingClientRect().width > 0;
    const R = (e) => { if (!vis(e)) return null; const r = e.getBoundingClientRect(); return { id: e.id, x: r.left, y: r.top, r: r.right, b: r.bottom }; };
    const tools = Array.from(document.querySelectorAll('.bar.tools .btn')).map(R).filter(Boolean);
    return { sw: document.documentElement.scrollWidth, iw: innerWidth, hud: R(document.getElementById('hud')), msg: R(document.getElementById('msg')), msgText: document.getElementById('msg').textContent,
      joy: R(document.getElementById('joy')), tb: Array.from(document.querySelectorAll('#tbtns .tb')).map(R).filter(Boolean), tools, toolsBar: R(document.querySelector('.bar.tools')) };
  });
  check('Deepdelve 195x422: no page h-scroll', d.sw <= d.iw, JSON.stringify([d.sw, d.iw]));
  check('Deepdelve 195x422: the tool buttons sit in ONE row (<= 60 px tall bar)', d.toolsBar && d.toolsBar.b - d.toolsBar.y <= 60 && new Set(d.tools.map((t) => Math.round(t.y))).size === 1, JSON.stringify(d.toolsBar));
  const boxes = [['hud', d.hud], ['msg', d.msg], ['joy', d.joy]].concat(d.tb.map((t) => ['tb:' + t.id, t])).filter((x) => x[1]);
  const clash = [];
  for (let i = 0; i < boxes.length; i++) for (let k = i + 1; k < boxes.length; k++) if (hit(boxes[i][1], boxes[k][1])) clash.push(boxes[i][0] + '/' + boxes[k][0]);
  check('Deepdelve 195x422: the coach line is up on the first screen', !!d.msg && d.msgText.length > 10, d.msgText);
  check('Deepdelve 195x422: HUD, coach line, stick and thumb buttons do not overlap', d.tb.length >= 3 && clash.length === 0, JSON.stringify({ clash, boxes }));
  await p.screenshot({ path: require('path').join(__dirname, '..', 'design', 'beta', 'img', 'cyc5-ui-deepdelve-195x422.jpg'), type: 'jpeg', quality: 60 }).catch(() => {});
  check('no database traffic', db.attempts() === 0, String(db.attempts()));
  check('no page errors', errs.length === 0, errs.join('|'));
  await ctx.close(); await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
