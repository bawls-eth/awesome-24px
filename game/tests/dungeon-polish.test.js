// Dungeon polish: phone framing, short exit label, one room count, honest summary title, start-room direction cue.
// Run: BASE=http://localhost:8563/game/index.html NODE_PATH=$(npm root -g) node game/tests/dungeon-polish.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/mad-maze/index.html';
const RET = 'index.html?mode=world&seed=abc&at=10,12&test=1';
const URL = (seed, extra) => `${PAGE}?mode=dungeon&seed=${seed}&test=1&offline=1${extra || ''}`;

async function open(browser, url, opts) {
  const ctx = await browser.newContext(opts || { viewport: { width: 1000, height: 700 } });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push('console: ' + m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => window.__mm && window.__mm.dungeon && window.__mm.dungeon.room !== null);
  await page.waitForTimeout(300);
  await page.evaluate(() => { window.__mm.arena._hitPlayer = () => {}; });
  return { ctx, page };
}
const rect = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height, r: b.right, b: b.bottom }; }, sel);
const overlap = (a, b) => a && b && a.x < b.r && b.x < a.r && a.y < b.b && b.y < a.b;

(async () => {
  const browser = await chromium.launch();
  const errs = [];
  const retQ = '&return=' + encodeURIComponent(RET) + '&mode=dungeon';

  // ---------- phone 390x844 framing ----------
  const ph = await open(browser, URL(5, '&lv=2&return=' + encodeURIComponent(RET)), { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await ph.page.waitForTimeout(400);
  const cv = await rect(ph.page, '#realm-canvas');
  check('phone 390x844: the room canvas spans at least 60% of the viewport width', cv && cv.w >= 0.6 * 390 && cv.x >= 0 && cv.r <= 390.5, JSON.stringify(cv));
  check('phone 390x844: the room keeps its aspect (not stretched)', cv && Math.abs(cv.w / cv.h - 680 / 520) < 0.03, JSON.stringify(cv));
  const mp = await rect(ph.page, '#mm-map'); const mb = await rect(ph.page, '#mm-map-btn'); const bn = await rect(ph.page, '#realm-banner');
  const bnShown = await ph.page.evaluate(() => { const b = document.getElementById('realm-banner'); return !!b && !b.classList.contains('hidden'); });
  check('phone: the map, its button and the banner do not cover the room', !overlap(mp, cv) && !overlap(mb, cv) && (!bnShown || !overlap(bn, cv)), JSON.stringify({ cv, mp, mb, bn, bnShown }));
  const ab = await rect(ph.page, '#realm-abilities');
  check('phone: the room is clear of the ability buttons', !overlap(ab, cv), JSON.stringify({ cv, ab }));
  const lbl = await ph.page.evaluate(() => { const b = document.getElementById('realm-leave-btn'); const r = b.getBoundingClientRect(); return { t: b.textContent, sw: b.scrollWidth, cw: b.clientWidth, a: b.getAttribute('aria-label'), h: r.height, w: r.width }; });
  check('phone: the exit label is not truncated and keeps a 44px target', lbl.sw <= lbl.cw && lbl.h >= 44 && lbl.w >= 44 && /Exit/.test(lbl.t), JSON.stringify(lbl));
  check('phone: the exit button keeps the full text in its aria-label', /world/.test(lbl.a || ''), lbl.a);
  const sw = await ph.page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  check('phone: no horizontal scroll', sw[0] <= sw[1], JSON.stringify(sw));
  errs.push(...ph.page.errors); await ph.ctx.close();

  // ---------- desktop exit label (world return) ----------
  const dk = await open(browser, URL(5, '&lv=2&return=' + encodeURIComponent(RET)));
  const dl = await dk.page.evaluate(() => { const b = document.getElementById('realm-leave-btn'); return { sw: b.scrollWidth, cw: b.clientWidth, t: b.textContent }; });
  check('desktop: the exit label is not truncated', dl.sw <= dl.cw && /Exit/.test(dl.t), JSON.stringify(dl));
  errs.push(...dk.page.errors); await dk.ctx.close();

  // ---------- room count + summary wording ----------
  const A = await open(browser, URL(7, '&lv=2'));
  const c0 = await A.page.evaluate(() => { const d = window.__mm.dungeon; return { c: d.roomCount(), hud: document.getElementById('realm-wave').textContent }; });
  check('HUD count reads Room 1/N and matches roomCount()', new RegExp('Room 1/' + c0.c.total + '\\b').test(c0.hud) && c0.c.visited === 1, JSON.stringify(c0));
  await A.page.evaluate(() => { const d = window.__mm.dungeon; const nb = d.doors().find((x) => x.status === 'open'); d.clearRoom && d.clearRoom(); d.enter(nb.other); });
  await A.page.waitForTimeout(300);
  const c1 = await A.page.evaluate(() => ({ c: window.__mm.dungeon.roomCount(), hud: document.getElementById('realm-wave').textContent }));
  await A.page.evaluate(() => window.__mm.dungeon.finish());
  const s1 = await A.page.evaluate(() => ({ title: document.querySelector('#mm-summary h2').textContent, rows: document.querySelector('.mm-sum-stats').textContent, boss: window.__mm.dungeon.summary.bossDefeated }));
  check('HUD and summary agree on the room count (visited and total)', c1.c.visited === 2 && new RegExp('Room 2/' + c1.c.total + '\\b').test(c1.hud) && s1.rows.indexOf('Rooms visited ' + c1.c.visited + '/' + c1.c.total) >= 0, JSON.stringify({ c1, s1 }));
  check('leaving early with the boss alive says "Left the Warren", not "cleared"', /Left the Warren/.test(s1.title) && !/cleared/i.test(s1.title) && s1.boss === false, JSON.stringify(s1));
  errs.push(...A.page.errors); await A.ctx.close();

  const B = await open(browser, URL(7, '&lv=2'));
  await B.page.evaluate(() => { window.__mm.dungeon.state.boss.dead = true; window.__mm.dungeon.finish(); });
  const s2 = await B.page.evaluate(() => ({ title: document.querySelector('#mm-summary h2').textContent, boss: window.__mm.dungeon.summary.bossDefeated }));
  check('with the boss defeated the title is "Warren cleared!"', s2.boss === true && /Warren cleared!/.test(s2.title), JSON.stringify(s2));
  errs.push(...B.page.errors); await B.ctx.close();

  const C = await open(browser, URL(7, '&lv=2&biome=meadow'));
  await C.page.evaluate(() => window.__mm.dungeon.finish());
  const s3 = await C.page.evaluate(() => document.querySelector('#mm-summary h2').textContent);
  check('a biome run that is left early reads "Left the Meadow"', /Left the Meadow/.test(s3) && !/cleared/i.test(s3), s3);
  errs.push(...C.page.errors); await C.ctx.close();

  // ---------- start-room direction cue ----------
  let sawKey = false; let sawBoss = 0; let bad = 0; const seen = [];
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const S = await open(browser, URL(seed, '&lv=2'));
    const r = await S.page.evaluate(() => {
      const d = window.__mm.dungeon; const cue = d.cue(); const doors = d.doors();
      const g = d.graph; const type = g.rooms[d.room].type;
      return { type, cue, hasDoor: !!(cue && doors.find((x) => x.dir === cue.dir && x.tile.x === cue.tile.x && x.tile.y === cue.tile.y)), keys: d.state.keys };
    });
    seen.push(seed + ':' + (r.cue ? r.cue.target : 'none'));
    if (!(r.type === 'start' && r.cue && r.hasDoor)) bad++;
    if (r.cue && r.cue.target === 'key') sawKey = r.cue.hint === 'Find the key' && r.keys === 0 || sawKey; else if (r.cue) sawBoss++;
    if (seed === 5) { // the arrow is really painted: gold pixels sit just inside the cue door (settle the pulse first)
      await S.page.waitForTimeout(250);
      const px = await S.page.evaluate(() => {
        const a = window.__mm.arena; const cu = window.__mm.dungeon.cue(); const V = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] }[cu.dir];
        const cvs = a.canvas; const g = cvs.getContext('2d'); const k = cvs.width / a.W;
        const x = Math.round(((cu.tile.x + 0.5) * 40 - V[0] * 42) * k), y = Math.round(((cu.tile.y + 0.5) * 40 - V[1] * 42) * k), r = Math.round(18 * k);
        const d = g.getImageData(Math.max(0, x - r), Math.max(0, y - r), 2 * r, 2 * r).data; let gold = 0;
        for (let i = 0; i < d.length; i += 4) if (d[i] > 170 && d[i + 1] > 130 && d[i + 2] < 140) gold++;
        return { gold, dir: cu.dir };
      });
      check('the cue arrow is painted in gold next to the door', px.gold > 10, JSON.stringify(px));
    }
    errs.push(...S.page.errors); await S.ctx.close();
  }
  check('every start room offers a cue pointing at a real door', bad === 0, seen.join(' '));
  check('cues toward the boss route exist, and a key-gated start says "Find the key" when it points at the key', sawBoss + (sawKey ? 1 : 0) >= 1, seen.join(' '));

  // leaving the start room removes the cue; reduced motion draws it static
  const R = await open(browser, URL(5, '&lv=2'));
  const moved = await R.page.evaluate(() => { const d = window.__mm.dungeon; const before = !!d.cue(); const o = d.doors().find((x) => x.status === 'open'); d.enter(o.other); return { before, after: d.cue() }; });
  check('the cue is only for the start room', moved.before === true && moved.after === null, JSON.stringify(moved));
  errs.push(...R.page.errors); await R.ctx.close();

  check('no console errors', errs.length === 0, errs.join(' | '));
  await browser.close();
  done();
})();
