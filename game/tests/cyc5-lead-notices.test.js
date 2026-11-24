// Cycle 5 L (b01-r3-01): the sentence notices above the hero never print over each other. One Shore kill at Lv 6 of a creature
// that is new to the notebook raises BOTH "The Midlands has better prey" and "New notebook page: ..."; before the fix they were
// two float texts 4 px apart in the same frame. Now they go through one queue (arena._notice): one at a time, both shown.
// Also: three notices raised in one frame show one after another in order, a duplicate waiting line is not queued twice, and
// damage / XP numbers are still plain float texts (shown at once). Realm world, blockDb, db.attempts() === 0.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/cyc5-lead-notices.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&offline=1&heropick=0&tutorial=0&seed=12345&qdate=2030-05-01';
const SAVE = { realm: { level: 6, xp: 0, shards: 50, bestWave: 2, items: [{ n: 1, id: 'sparkwand', r: 0 }], nextUid: 2, eq: { weapon: 1 } } };
const SHOTS = process.env.SHOTS || null;
const NOTE = '/better prey|New notebook page|Trophy for Mocha|Storage full|Not saved \\(|Test notice/';

async function run(browser, tag, ctxOpts) {
  const ctx = await browser.newContext(ctxOpts);
  const db = await blockDb(ctx);
  await ctx.route('**/game/index.html*', (rt) => rt.fulfill({ contentType: 'text/html', body: '<!doctype html>town' }));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate((a) => { localStorage.clear(); localStorage.setItem('pixeltown-save-v1', a); }, JSON.stringify(SAVE));
  await page.goto(WORLD);
  await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 30000 });
  // a per-frame recorder: which sentence notices are on screen (active float texts) in each frame
  await page.evaluate((src) => {
    const re = new RegExp(src.slice(1, -1));
    const a = window.__mm.arena; a.player.iframes = 1e9; a._hitPlayer = () => {};
    window.__rec = { frames: [], seen: [], maxAtOnce: 0, on: true };
    const f = () => {
      if (!window.__rec.on) return;
      const up = a.texts.filter((t) => t.active && re.test(String(t.text))).map((t) => ({ text: String(t.text), y: Math.round(t.y) }));
      if (up.length) window.__rec.frames.push(up);
      up.forEach((u) => { if (!window.__rec.seen.includes(u.text)) window.__rec.seen.push(u.text); });
      window.__rec.maxAtOnce = Math.max(window.__rec.maxAtOnce, up.length);
      requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  }, NOTE);
  const T = (s) => `${tag}: ${s}`;

  // 1. the real path: one Shore kill at Lv 6 of a creature the notebook has not met
  let killed = null;
  for (let i = 0; i < 80 && !killed; i++) {
    killed = await page.evaluate(() => {
      const a = window.__mm.arena, w = window.__mm.world;
      const q = w.liveEnemies().find((x) => x.zone === 0); if (!q) return null;
      const e = w.enemyById(q.id); if (!e) return null;
      a.save.level = 6; a.save.xp = 0;
      a._hitEnemy(e, 1e9);
      return { type: e.type };
    });
    if (!killed) await page.waitForTimeout(150);
  }
  check(T('a Shore creature was killed at Lv 6'), !!killed, JSON.stringify(killed));
  await page.waitForTimeout(250);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/cyc5-lead-notice-${tag}-1.jpg`, type: 'jpeg', quality: 70 });
  await page.waitForFunction(() => window.__rec.seen.length >= 2, null, { timeout: 6000 }).catch(() => null);
  await page.waitForTimeout(200);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/cyc5-lead-notice-${tag}-2.jpg`, type: 'jpeg', quality: 70 });
  await page.waitForTimeout(900);
  const r1 = await page.evaluate(() => ({ seen: window.__rec.seen.slice(), max: window.__rec.maxAtOnce, frames: window.__rec.frames.length }));
  check(T('the kill raised both notices (better prey + New notebook page)'), r1.seen.some((t) => /better prey/.test(t)) && r1.seen.some((t) => /New notebook page/.test(t)), JSON.stringify(r1));
  check(T('never two sentence notices on screen in the same frame'), r1.max === 1 && r1.frames > 4, JSON.stringify(r1));

  // 2. three raised in one frame (plus a duplicate): shown one at a time, in order, each exactly once
  await page.evaluate(() => { window.__rec.frames = []; window.__rec.seen = []; window.__rec.maxAtOnce = 0; const a = window.__mm.arena; a._notice('Test notice one', '#fff'); a._notice('Test notice two', '#fff'); a._notice('Test notice two', '#fff'); a._notice('Test notice three', '#fff'); });
  await page.waitForFunction(() => window.__rec.seen.length >= 3, null, { timeout: 8000 }).catch(() => null);
  await page.waitForTimeout(1200);
  const r2 = await page.evaluate(() => { const runs = []; window.__rec.frames.forEach((f) => { const t = f[0].text; if (runs[runs.length - 1] !== t) runs.push(t); }); return { runs, max: window.__rec.maxAtOnce }; });
  check(T('three notices in one frame show in order, one at a time, a waiting duplicate only once'), JSON.stringify(r2.runs) === '["Test notice one","Test notice two","Test notice three"]' && r2.max === 1, JSON.stringify(r2));

  // 3. numbers are not queued: a float text is up in the same call, even while a notice is showing
  const r3 = await page.evaluate(() => { const a = window.__mm.arena; a._notice('Test notice four', '#fff'); const t = a._floatText(a.player.x, a.player.y - 22, '+5 xp', '#c9a7ff'); return { now: !!t && t.active && t.text === '+5 xp' && t.notice === false, note: a.texts.filter((x) => x.active && x.notice).length }; });
  check(T('plain float numbers still show at once beside a notice'), r3.now === true && r3.note === 1, JSON.stringify(r3));

  await page.evaluate(() => { window.__rec.on = false; });
  check(T('no page errors'), errors.length === 0, errors.join(' | '));
  check(T('0 database attempts'), db.attempts() === 0, String(db.attempts()));
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch();
  await run(browser, 'desktop', { viewport: { width: 1280, height: 720 } });
  await run(browser, 'phone', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await browser.close();
  done();
})();
