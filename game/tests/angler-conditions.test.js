// Lakeside Angler spot conditions (VAR1): one seeded condition per spot per visit (Calm water / Windy / Fish-rush hour),
// one honest line in the HUD with the real rare-fish chance, real effects on bite timing and rarity weights, bests per
// condition in pixeltown-angler-fun-v1 (additive `cond`), none in the tournament or the cove, ?mods=0 off switch.
// Phone 390x844 + desktop, DB blocked, standalone. Serve the repo root first:  python3 -m http.server 9372 &
// Run: NODE_PATH=$(npm root -g) BASE=http://localhost:9372/game/index.html node game/tests/angler-conditions.test.js
const { chromium } = require('playwright');
const { blockDb } = require('./helpers');
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }
const ORIGIN = (process.env.BASE || 'http://localhost:9372/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/angler/index.html?test=1&seed=a&date=2026-07-15';
const SHOTS = process.env.SHOTS || '';
const errors = [], dbs = [];
async function open(browser, opts, q) {
  const ctx = await browser.newContext(opts);
  dbs.push(await blockDb(ctx));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(PAGE + (q === undefined ? '&mods=1' : q));
  await page.waitForFunction(() => window.__angler);
  return { ctx, page };
}
const play = (page) => page.evaluate(() => {
  const a = window.__angler;
  for (let i = 0; i < 4000 && a.state === 'reeling'; i++) { a.setHold(a.reel.tension < a.reel.pos); a.advance(1 / 30); }
  a.setHold(false);
  return a.state + ':' + (a.result && a.result.outcome);
});
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };

(async () => {
  const browser = await chromium.launch();
  const ph = await open(browser, PHONE);
  const p = ph.page;
  const info = await p.evaluate(() => {
    const a = window.__angler, X = a.cond, spots = {};
    ['west', 'east', 'river', 'pier'].forEach((s) => { spots[s] = X.condFor(s); });
    const again = X.condFor('west');
    return { on: X.on, ids: X.ids, lines: X.ids.map((id) => X.info[id].name + ': ' + X.info[id].line), spots, again, cove: X.condFor('cove'), active: X.active, spot: a.spot };
  });
  check('conditions are on with ?mods=1 and seeded per spot for the visit', info.on && info.again === info.spots.west && info.ids.indexOf(info.spots.west) >= 0, JSON.stringify(info));
  check('each condition explains itself in one short line', info.lines.length === 3 && info.lines.every((l) => l.length < 100 && /\d/.test(l)), JSON.stringify(info.lines));
  check('the Isles Cove has no condition', info.cove === null);
  const hud = await p.evaluate(() => { const t = document.getElementById('cond'), l = document.getElementById('cond-line'); return { t: t.textContent, th: t.hidden, l: l.textContent, lh: l.hidden, px: parseFloat(getComputedStyle(l).fontSize), right: l.getBoundingClientRect().right, h: l.getBoundingClientRect().height }; });
  check('HUD tag names the condition', !hud.th && hud.t === (await p.evaluate(() => window.__angler.cond.info[window.__angler.cond.active].name)), JSON.stringify(hud));
  check('HUD line gives the effect and honest rare-fish odds', !hud.lh && /(Rare-or-better chance here: \d+% \(usually \d+%\)|No rare fish at this spot right now)\.$/.test(hud.l), hud.l);
  check('HUD line is readable and fits the phone', hud.px >= 12 && hud.right <= 390 && hud.h < 90, JSON.stringify(hud));
  if (SHOTS) await p.screenshot({ path: SHOTS + '/angler-cond-phone.png' });

  // honest rarity weights: windy raises the rare share, rush lowers it, calm leaves it alone
  const sh = await p.evaluate(() => { const a = window.__angler, X = a.cond, from = a.spot; for (const s of ['east', 'river', 'pier', 'west']) { a.pickSpot(s); if (X.rareShare(null) > 0) break; } const o = { spot: a.spot, base: X.rareShare(null), calm: X.rareShare('calm'), windy: X.rareShare('windy'), rush: X.rareShare('rush') }; a.pickSpot(from); return o; });
  check('a spot with rare fish exists for the odds check', sh.base > 0, JSON.stringify(sh));
  check('Windy: rare fish more likely; Rush: less; Calm: unchanged', sh.windy > sh.base && sh.rush < sh.base && Math.abs(sh.calm - sh.base) < 1e-12, JSON.stringify(sh));

  // honest bite timing: same seed with and without the condition
  const w1 = await p.evaluate(() => { const a = window.__angler; a.tap(); return { wait: a.bite.wait, window: a.bite.window, id: a.cond.active }; });
  const off = await open(browser, PHONE, '&mods=0');
  const w0 = await off.page.evaluate(() => { const a = window.__angler; a.tap(); return { wait: a.bite.wait, window: a.bite.window, on: a.cond.on, tag: document.getElementById('cond').hidden, line: document.getElementById('cond-line').hidden }; });
  const C = await p.evaluate(() => window.__angler.cond.info);
  check('bite wait is the plain wait times the condition factor', Math.abs(w1.wait - w0.wait * C[w1.id].wait) < 1e-9, JSON.stringify([w1, w0]));
  check('bite window is the plain window plus the condition bonus', Math.abs(w1.window - (w0.window + C[w1.id].window)) < 1e-9, JSON.stringify([w1, w0]));
  check('?mods=0: no condition, nothing in the HUD', w0.on === false && w0.tag && w0.line, JSON.stringify(w0));
  await off.ctx.close();

  // per-condition bests in the fun key (additive)
  await p.evaluate(() => { const a = window.__angler; a.advance(a.bite.wait + 0.1); a.tap(); });
  const res = await play(p);
  const fs = await p.evaluate(() => ({ st: JSON.parse(localStorage.getItem('pixeltown-angler-fun-v1')), line: document.getElementById('res-fun').textContent, id: window.__angler.cond.active, size: window.__angler.result.size }));
  check('a catch lands', res === 'result:caught', res);
  check('the condition best is saved additively in the fun key', fs.st.v === 1 && fs.st.streak === 1 && fs.st.cond[fs.id].size === fs.size && fs.st.cond[fs.id].n === 1, JSON.stringify(fs));
  check('the result line names the condition best', fs.line.indexOf(C[fs.id].name + ' best ' + fs.size + ' cm') >= 0, fs.line);
  const ok = await p.evaluate(() => { const r = document.getElementById('res-ok').getBoundingClientRect(); return r.height >= 44 && r.width >= 44; });
  check('Cast again stays 44 px+', ok);
  if (SHOTS) await p.screenshot({ path: SHOTS + '/angler-cond-result.png' });
  await p.evaluate(() => localStorage.setItem('pixeltown-angler-fun-v1', '{"v":1,"bestStreak":3,"bestReact":200,"streak":0,"cond":{"windy":{"size":"40","react":-5,"n":2},"nope":{"size":9},"rush":7}}'));
  await p.reload(); await p.waitForFunction(() => window.__angler);
  const cl = await p.evaluate(() => window.__angler.fun.state);
  check('a bad cond field is cleaned (known ids, clamped numbers)', JSON.stringify(cl.cond) === '{"windy":{"size":40,"react":0,"n":2}}' && cl.bestStreak === 3, JSON.stringify(cl));
  // tournament: same bites for everyone, so no condition
  const tr = await p.evaluate(() => { const a = window.__angler; a.tourney.start(); a.renderStatus(); return { active: a.tourney.active, cond: a.cond.active, hidden: document.getElementById('cond').hidden }; });
  check('the tournament has no spot condition', tr.active === true && tr.cond === null && tr.hidden, JSON.stringify(tr));
  await ph.ctx.close();

  // desktop + reduced motion
  const dk = await open(browser, { viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  const dd = await dk.page.evaluate(() => ({ vis: getComputedStyle(document.getElementById('cond-line')).display !== 'none', reduced: window.__angler.reduced }));
  check('desktop: condition line visible (reduced motion: no extra animation)', dd.vis && dd.reduced, JSON.stringify(dd));
  if (SHOTS) await dk.page.screenshot({ path: SHOTS + '/angler-cond-desk.png' });
  await dk.ctx.close();

  check('console clean', errors.length === 0, JSON.stringify(errors));
  check('zero DB requests', dbs.every((x) => x.attempts() === 0), JSON.stringify(dbs.map((x) => x.attempts())));
  await browser.close();
  console.log(failed ? failed + ' FAILED' : 'ALL PASSED');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
