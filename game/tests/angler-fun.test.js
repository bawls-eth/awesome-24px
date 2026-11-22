// Lakeside Angler FUN1: catch streaks, strike reaction time, personal bests, near-miss feedback, sound cues,
// screen shake (off with reduced motion / low graphics). Standalone: serve the repo root first,
//   python3 -m http.server 9352 &   then   BASE=http://localhost:9352/game/index.html node game/tests/angler-fun.test.js
// Firebase hosts are blocked (blockDb) and must see 0 attempts.
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const ORIGIN = new URL(BASE).origin;
const PAGE = ORIGIN + '/game/games/angler/index.html?test=1&seed=a&date=2026-07-15';
const FUN = 'pixeltown-angler-fun-v1';

const play = (page) => page.evaluate(() => {
  const a = window.__angler;
  for (let i = 0; i < 4000 && a.state === 'reeling'; i++) { a.setHold(a.reel.tension < a.reel.pos); a.advance(1 / 30); }
  a.setHold(false);
  return a.state + ':' + (a.result && a.result.outcome);
});
const toReel = (page, fish, react) => page.evaluate(([f, r]) => {
  const a = window.__angler;
  if (f) a.forceFish(f);
  a.tap(); a.advance(a.bite.wait + r); a.tap();
  return a.state;
}, [fish, react]);

async function open(browser, opts) {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, opts || {}));
  const db = await blockDb(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(PAGE);
  await page.waitForFunction(() => window.__angler);
  return { ctx, page, db, errors };
}

(async () => {
  const browser = await chromium.launch();
  const o = await open(browser);
  const p = o.page;
  const journalBefore = await p.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('pixeltown-angler-v1') || '{}')).sort().join());

  check('cast plays a tap cue', await p.evaluate(() => { __angler.tap(); return __angler.fun.sounds.slice(-1)[0] === 'ui_tap'; }));
  await p.evaluate(() => __angler.advance(__angler.bite.wait + 0.05));
  check('bite plays a warning cue', await p.evaluate(() => __angler.state === 'biting' && __angler.fun.sounds.includes('warn')));
  await p.evaluate(() => __angler.tap());
  check('hook reports reaction time in ms and plays a cue', await p.evaluate(() => __angler.state === 'reeling' && __angler.fun.react >= 30 && __angler.fun.react <= 80 && /ms\)/.test(document.getElementById('msg').textContent) && __angler.fun.sounds.slice(-1)[0] === 'pickup'));
  check('hook shakes the scene (motion allowed)', await p.evaluate(() => __angler.fun.shakes === 1 && document.getElementById('scene').classList.contains('shake')));
  check('first catch lands', (await play(p)) === 'result:caught');
  check('catch detail shows streak 1 and strike time', /Streak 1/.test(await p.textContent('#res-detail')) && /strike \d+ ms/.test(await p.textContent('#res-detail')));
  check('catch plays a fanfare cue', await p.evaluate(() => ['levelup', 'bag_rare'].includes(__angler.fun.sounds.slice(-1)[0])));
  await p.evaluate(() => __angler.dismiss());
  await toReel(p, 'bluegill', 0.4); await play(p);
  check('second catch: streak 2 and new best', /Streak 2 - new best!/.test(await p.textContent('#res-detail')));
  const st = await p.evaluate(() => __angler.fun.state);
  check('fun key saved additively with best streak and fastest strike', st.v === 1 && st.streak === 2 && st.bestStreak === 2 && st.bestReact > 0 && st.bestReact <= 80);
  await p.evaluate(() => __angler.dismiss());

  // near-miss: early press tells you how early, and the streak ends gently
  await p.evaluate(() => { const a = __angler; a.tap(); a.advance(0.3); a.tap(); });
  const sp = await p.textContent('#res-detail');
  check('spook says how early and that the streak of 2 ended', /Too early by \d\.\d s/.test(sp) && /streak of 2 ends here \(best 2\)/.test(sp), sp);
  check('streak reset to 0, best kept', await p.evaluate(() => __angler.fun.state.streak === 0 && __angler.fun.state.bestStreak === 2));
  check('Try again button is a big tap target', await p.evaluate(() => { const r = document.getElementById('res-ok').getBoundingClientRect(); return r.height >= 44 && r.width >= 44 && document.getElementById('res-ok').textContent === 'Try again'; }));
  await p.tap('#res-ok');
  check('one tap on Try again returns to idle', await p.evaluate(() => __angler.state === 'idle'));
  await p.evaluate(() => { const a = __angler; a.tap(); a.advance(a.bite.wait + 1.3); });
  check('missed bite explains the 1.0 s window', /lasts 1\.0 s/.test(await p.textContent('#res-detail')));
  await p.evaluate(() => __angler.dismiss());
  // snapped line near-miss shows the catch meter
  await toReel(p, 'bluegill', 0.2);
  await p.evaluate(() => { const a = __angler; for (let i = 0; i < 60; i++) { a.setHold(a.reel.tension < a.reel.pos); a.advance(1 / 30); } a.setHold(true); a.advance(3.5); a.setHold(false); });
  check('snap result reports the catch meter reached', await p.evaluate(() => __angler.result.outcome === 'snapped') && /[Cc]atch meter (reached|was at) \d+%/.test(await p.textContent('#res-detail')));
  check('journal keys unchanged in shape (no new journal keys)', (await p.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('pixeltown-angler-v1'))).every((k) => !/fun|streak|react/i.test(k)))) && journalBefore !== null);
  check('Menu button does not overlap the result panel', await p.evaluate(() => { const m = document.getElementById('mm-nav-btn'); if (!m) return false; const a = m.getBoundingClientRect(), b = document.getElementById('result').getBoundingClientRect(); return a.bottom <= b.top || a.top >= b.bottom || a.right <= b.left || a.left >= b.right; }));
  check('no console errors', o.errors.length === 0, o.errors.join('|'));
  check('zero Firebase/DB requests', o.db.attempts() === 0);
  await o.ctx.close();

  // reduced motion: no shake
  const r = await open(browser, { reducedMotion: 'reduce' });
  await toReel(r.page, 'bluegill', 0.2);
  check('reduced motion: hook never shakes', await r.page.evaluate(() => __angler.fun.shakes === 0 && !document.getElementById('scene').classList.contains('shake')));
  await r.page.evaluate((k) => { localStorage.setItem(k, '{"bestStreak":-4,"bestReact":"x","streak":1e99}'); }, FUN);
  await r.page.reload(); await r.page.waitForFunction(() => window.__angler);
  check('hostile fun save loads clamped', await r.page.evaluate(() => { const s = __angler.fun.state; return s.bestStreak === 0 && s.bestReact === 0 && s.streak === 99999; }));
  check('no console errors (reduced motion)', r.errors.length === 0, r.errors.join('|'));
  await r.ctx.close();

  // low graphics pref: no shake either
  const l = await open(browser);
  await l.page.evaluate(() => { const k = 'pixeltown-access-v1'; const v = JSON.parse(localStorage.getItem(k) || '{}'); v.lowGfx = true; localStorage.setItem(k, JSON.stringify(v)); });
  await l.page.reload(); await l.page.waitForFunction(() => window.__angler);
  const low = await l.page.evaluate(() => __angler.gfx.low);
  await toReel(l.page, 'bluegill', 0.2);
  check('low graphics tier: hook never shakes', low === true && await l.page.evaluate(() => __angler.fun.shakes === 0), 'low=' + low);
  await l.ctx.close();

  await browser.close();
  done();
})();
