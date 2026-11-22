// Campfire Jam fun pass: one-tap Quick play, combo milestones + combo-ended notice, hit sparks (off with reduced motion),
// results with Play again at the top, personal-best gain, next-goal / near-miss line, R to restart.
// Standalone, phone 390x844 touch + desktop 1280x800. Firebase is blocked (blockDb) and 0 DB requests are expected.
//   python3 -m http.server 9351 &   NODE_PATH=$(npm root -g) BASE=http://localhost:9351/game/index.html node game/tests/jam-fun.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const URL = BASE.replace(/index\.html.*$/, '') + 'games/jam/index.html?test=1';
const KEY = 'pixeltown-jam-v1';
const FRESH = JSON.stringify({ v: 1, offsetMs: 0, plays: 0 });

async function open(browser, opts, init) {
  const ctx = await browser.newContext(opts);
  const db = await blockDb(ctx);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.addInitScript(([k, v]) => { if (!sessionStorage.seeded) { sessionStorage.seeded = '1'; localStorage.setItem(k, v); } }, [KEY, init]);
  await page.goto(URL); await page.waitForFunction(() => window.__jam);
  return { ctx, page, errors, db };
}
// plays the current chart on time, leaving out the note indices in `skip`; stops at `until` ms (default: to the end)
const drive = (p, skip, until) => p.evaluate(([sk, un]) => {
  const J = window.__jam, ev = [], miss = new Set(sk);
  J.chart.notes.forEach((n, i) => { if (miss.has(i)) return; ev.push({ t: n.t, k: 0, n }); if (n.hold) ev.push({ t: n.t + n.hold, k: 1, n }); });
  ev.sort((a, b) => a.t - b.t || a.k - b.k);
  for (const e of ev) { if (un && e.t > un) break; J.at(e.t); if (e.k === 0) J.press(e.n.lane); else J.release(e.n.lane); }
  if (un) J.at(un); else J.step(80000);
}, [skip || [], until || 0]);
const box = (p, sel) => p.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }, sel);

(async () => {
  const browser = await chromium.launch();
  const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
  let d = await open(browser, PHONE, FRESH), p = d.page;

  // ---- Quick play: one obvious button, an easy first chart ----
  const qp = await box(p, '#quick-play');
  const qd = await p.evaluate(() => { const b = document.getElementById('quick-play'); return { song: b.dataset.song, tier: b.dataset.tier, text: b.textContent }; });
  check('quick play button is shown first-time and is a big tap target (>= 44 px)', qp && qp.h >= 44 && qp.w >= 200, JSON.stringify(qp));
  check('quick play picks the gentlest chart for a new player (Warm Embers Easy)', qd.song === 'warm-embers' && qd.tier === 'easy' && /Warm Embers/.test(qd.text) && /Easy/.test(qd.text), JSON.stringify(qd));
  check('quick play sits above the song list', await p.evaluate(() => { const q = document.getElementById('quick-play'), c = document.querySelector('.songs'); return !!(q.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING); }));
  await p.tap('#quick-play');
  check('tapping quick play starts that chart', await p.evaluate(() => window.__jam.mode === 'play' && window.__jam.chart.song === 'warm-embers' && document.getElementById('hud-song').textContent.includes('Easy')));

  // ---- combo milestones, sparks and the combo-ended notice ----
  const n10 = await p.evaluate(() => window.__jam.chart.notes[9].t);
  await drive(p, [], n10 + 5);
  const m1 = await p.evaluate(() => ({ ms: window.__jam.milestones, banner: window.__jam.banner, sparks: window.__jam.sparks, combo: window.__jam.run.combo }));
  check('10 on-time hits fire the 10-combo milestone with a banner', m1.combo === 10 && m1.ms.includes(10) && m1.banner === '10 combo!', JSON.stringify(m1));
  check('perfect hits throw sparks (motion allowed)', m1.sparks > 0, JSON.stringify(m1));
  check('milestone only fires once per value', m1.ms.filter((v) => v === 10).length === 1);
  const n11 = await p.evaluate(() => window.__jam.chart.notes[10].t);
  await p.evaluate((t) => window.__jam.at(t), n11 + 200); // let note 11 slip past
  const b1 = await p.evaluate(() => ({ banner: window.__jam.banner, combo: window.__jam.run.combo, miss: window.__jam.run.counts.miss }));
  check('losing a 10+ combo shows a neutral "Combo ended at 10" notice', b1.banner === 'Combo ended at 10' && b1.combo === 0 && b1.miss >= 1, JSON.stringify(b1));
  const pads = await p.evaluate(() => [...document.querySelectorAll('#pads .pad')].map((b) => { const r = b.getBoundingClientRect(); return { h: r.height, w: r.width, bottom: r.bottom }; }));
  check('phone: touch pads are tall (>= 88 px) and fully on screen', pads.length === 4 && pads.every((b) => b.h >= 88 && b.w >= 44 && b.bottom <= 844), JSON.stringify(pads));
  // ---- pause card: one-tap Restart ----
  await p.evaluate(() => window.__jam.pause());
  const rsb = await box(p, '#restart');
  check('pause card offers Restart as a >= 44 px button', rsb && rsb.h >= 44 && rsb.w >= 44, JSON.stringify(rsb));
  await p.tap('#restart');
  const rs = await p.evaluate(() => ({ mode: window.__jam.mode, now: window.__jam.now, run: window.__jam.run, ms: window.__jam.milestones, paused: window.__jam.paused, song: window.__jam.chart.song, overlay: document.getElementById('overlay').hidden }));
  check('Restart starts the same chart from the top with a fresh run', rs.mode === 'play' && rs.now === 0 && !rs.paused && rs.overlay && rs.song === 'warm-embers' && rs.run.score === 0 && rs.run.combo === 0 && rs.ms.length === 0, JSON.stringify(rs));
  await p.evaluate(() => window.__jam.menu());

  // ---- results: Play again near the top, next goal, personal best, R restarts ----
  await p.evaluate(() => window.__jam.start('warm-embers', 'easy'));
  const N = await p.evaluate(() => window.__jam.chart.notes.length);
  const k = Math.ceil(N * 0.1) + 1; // a run just under 90%: two stars, one point or two short of the third
  await drive(p, [...Array(k).keys()].map((i) => i * 3));
  const r1 = await p.evaluate(() => ({ mode: window.__jam.mode, s: window.__jam.summary, goal: document.getElementById('res-goal').textContent }));
  check('a near-miss run ends on results with 2 stars', r1.mode === 'results' && r1.s.stars === 2, JSON.stringify(r1.s && { acc: r1.s.accuracy, stars: r1.s.stars }));
  check('next goal names the third star and says "So close!" for a near miss', /^So close! Next star at 90% accuracy: \d+% to go\.$/.test(r1.goal), r1.goal);
  const ag = await box(p, '#again');
  check('Play again is visible without scrolling and >= 44 px', ag && ag.y + ag.h <= 844 && ag.h >= 44 && ag.w >= 44, JSON.stringify(ag));
  check('Play again comes before the detailed counts', await p.evaluate(() => !!(document.getElementById('again').compareDocumentPosition(document.getElementById('res-counts')) & Node.DOCUMENT_POSITION_FOLLOWING)));
  check('first-ever run on a chart shows no "+gain" line', (await p.$('#res-pb')) === null);
  await p.tap('#again');
  await drive(p, []);
  const r2 = await p.evaluate(() => ({ s: window.__jam.summary, pb: (document.getElementById('res-pb') || {}).textContent || '', goal: document.getElementById('res-goal').textContent }));
  check('a better run shows the personal-best gain over the old best', r2.s.newBest && /^New personal best: \+\d+ over \d+$/.test(r2.pb) && Number(r2.pb.match(/\+(\d+)/)[1]) === r2.s.score - r1.s.score, r2.pb);
  check('a clean S run points at the next tier', r2.s.rank === 'S' && /Mastered! Try Normal next\./.test(r2.goal), r2.goal);
  await p.keyboard.press('KeyR');
  check('R on the results restarts the same chart', await p.evaluate(() => window.__jam.mode === 'play' && window.__jam.chart.song === 'warm-embers' && window.__jam.now === 0));
  await p.evaluate(() => window.__jam.menu());
  const rec = await p.evaluate(() => window.__jam.recommended);
  check('after 3 stars on Easy, quick play moves on to Normal', rec.id === 'warm-embers' && rec.tier === 'normal' && (await p.evaluate(() => document.getElementById('quick-play').dataset.tier)) === 'normal', JSON.stringify(rec));
  check('phone: no horizontal scroll', await p.evaluate(() => document.documentElement.scrollWidth <= 390));
  check('phone: Menu button does not overlap the quick play button', await p.evaluate(() => { const m = document.getElementById('mm-nav-btn'); const q = document.getElementById('quick-play').getBoundingClientRect(); if (!m) return false; const r = m.getBoundingClientRect(); return r.bottom <= q.top || r.top >= q.bottom || r.right <= q.left || r.left >= q.right; }));
  check('phone: console clean', d.errors.length === 0, d.errors.join(' | '));
  check('phone: 0 DB requests', d.db.count() === 0);
  await d.ctx.close();

  // ---- reduced motion: no sparks, milestones still announced; desktop ----
  d = await open(browser, { viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' }, JSON.stringify({ v: 1, hint: true, offsetMs: 0, plays: 0 })); p = d.page;
  await p.evaluate(() => window.__jam.start('warm-embers', 'easy'));
  const n25 = await p.evaluate(() => window.__jam.chart.notes[24].t);
  await drive(p, [], n25 + 5);
  const m2 = await p.evaluate(() => ({ reduced: window.__jam.reduced, ms: window.__jam.milestones, sparks: window.__jam.sparks, shake: window.__jam.shake }));
  check('reduced motion: no sparks, but 10 and 25 milestones still fire', m2.reduced === true && m2.sparks === 0 && m2.ms.join(',') === '10,25', JSON.stringify(m2));
  await drive(p, []);
  check('desktop: results reachable and Play again focused for Space/Enter', await p.evaluate(() => window.__jam.mode === 'results' && document.activeElement && document.activeElement.id === 'again'));
  check('desktop: console clean', d.errors.length === 0, d.errors.join(' | '));
  check('desktop: 0 DB requests', d.db.count() === 0);
  await d.ctx.close();

  await browser.close();
  done();
})();
