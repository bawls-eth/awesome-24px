// BI1 biome boss identity: each dungeon biome boss fires its own b17 ebolt_ art and has one signature attack with a 0.6 s wind-up; ?bosses=classic restores the plain boss.
// Serve the repo root, then:  BASE=http://localhost:8664/game/index.html NODE_PATH=$(npm root -g) node game/tests/dungeon-biome-bosses.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const URL = (q) => `${ORIGIN}/game/games/mad-maze/index.html?mode=dungeon&test=1&${q}`;
const B = require('../shared/mm-biomes.js');
const WANT = { warren: ['ebolt_orb_red', 'burrow'], bramble: ['ebolt_shard', 'thorns'], meadow: ['ebolt_poison', 'bloom'], crypt: ['ebolt_skull', 'bonerain'] };

async function open(browser, q, ctxOpts) {
  const ctx = await browser.newContext(ctxOpts || { viewport: { width: 1100, height: 700 } });
  const page = await ctx.newPage(); page.errors = [];
  page.on('pageerror', (e) => page.errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push('console: ' + m.text()); });
  await page.goto(URL(q));
  await page.waitForFunction(() => window.__mm && window.__mm.dungeon && window.__mm.dungeon.room !== null);
  await page.waitForFunction(() => window.__mm.arena._boltArt, null, { timeout: 8000 }).catch(() => {});
  await page.evaluate(() => { window.__mm.arena._hitPlayer = () => {}; });
  return { ctx, page };
}
// Walk into the boss room (clearing rooms on the way), then sample the boss's shots for `ms`.
async function fight(page, ms) {
  await page.evaluate(() => {
    const d = window.__mm.dungeon; const g = d.graph; d.state.pickKey();
    const nb = (id) => g.doors.filter((x) => (!x.cracked) && (x.a === id || x.b === id)).map((x) => (x.a === id ? x.b : x.a));
    const prev = { [d.room]: null }; const q = [d.room];
    while (q.length) { const u = q.shift(); nb(u).forEach((v) => { if (!(v in prev)) { prev[v] = u; q.push(v); } }); }
    const path = []; for (let u = g.bossRoomId; u !== null && u !== undefined; u = prev[u]) path.unshift(u);
    for (let i = 1; i < path.length; i++) { if (d.state.room(d.room).enemiesAlive > 0) d.clearRoom(); d.enter(path[i]); }
    window.__seen = { ea: {}, wind: null, windKind: null }; const a = window.__mm.arena;
    window.__iv = setInterval(() => { a.eBullets.forEach((b) => { if (b.active && b.ea) window.__seen.ea[b.ea] = (window.__seen.ea[b.ea] || 0) + 1; }); const w = d.sigWind; if (w && !window.__seen.wind) { window.__seen.wind = w.duration; window.__seen.windKind = w.kind; } }, 30);
  });
  await page.waitForTimeout(ms);
  return page.evaluate(() => { clearInterval(window.__iv); const d = window.__mm.dungeon; return { seen: window.__seen, sigs: d.sigCount(), bolt: d.bossBolt, sig: d.bossSig, boss: !!d.boss() }; });
}

(async () => {
  const browser = await chromium.launch();
  const errs = [];
  const ids = B.IDS.map((b) => B.bossFor(b, 2).bossBolt); const sigs = B.IDS.map((b) => B.bossFor(b, 2).sig);
  const lich = B.bossFor('crypt', 3);
  check('MMBiomes: 4 biomes give 4 different ebolt_ ids and 4 different signature attacks', new Set(ids).size === 4 && new Set(sigs).size === 4 && ids.every((i) => /^ebolt_[a-z_]+$/.test(i)) && JSON.stringify(B.IDS.map((b) => [B.bossFor(b, 2).bossBolt, B.bossFor(b, 2).sig])) === JSON.stringify(Object.values(WANT)), JSON.stringify([ids, sigs]));
  check('Crypt odd seed (Lich King) has its own bolt and signature, not the Bone Colossus ones; deterministic', lich.boss_art === 'lich_king' && lich.bossBolt !== B.bossFor('crypt', 2).bossBolt && lich.sig !== B.bossFor('crypt', 2).sig && JSON.stringify(lich) === JSON.stringify(B.bossFor('crypt', '3')));
  for (const biome of B.IDS) {
    const r = await open(browser, `biome=${biome}&seed=2&lv=2`);
    const res = await fight(r.page, 9000); errs.push(...r.page.errors);
    check(`${biome}: boss fires ${WANT[biome][0]} only and its signature "${WANT[biome][1]}" went off after a 0.6 s wind-up`,
      res.bolt === WANT[biome][0] && res.sig === WANT[biome][1] && res.sigs >= 1 && Object.keys(res.seen.ea).length === 1 && res.seen.ea[WANT[biome][0]] > 0 && Math.abs(res.seen.wind - 0.6) < 1e-9 && res.seen.windKind === WANT[biome][1], JSON.stringify(res));
    await r.ctx.close();
  }
  { const r = await open(browser, 'biome=crypt&seed=3&lv=2'); const res = await fight(r.page, 9000); errs.push(...r.page.errors);
    check('Lich King fights with ebolt_frost and the souls signature', res.bolt === 'ebolt_frost' && res.sig === 'souls' && res.sigs >= 1 && res.seen.ea.ebolt_frost > 0 && !res.seen.ea.ebolt_skull, JSON.stringify(res)); await r.ctx.close(); }
  { const r = await open(browser, 'biome=meadow&seed=2&lv=2&bosses=classic'); const res = await fight(r.page, 9000); errs.push(...r.page.errors);
    check('?bosses=classic restores the plain boss: no own bolt, no signature, default art ids', res.bolt === null && res.sig === null && res.sigs === 0 && res.seen.wind === null && !res.seen.ea.ebolt_poison && res.seen.ea.ebolt_orb_purple > 0, JSON.stringify(res)); await r.ctx.close(); }
  { const r = await open(browser, 'biome=meadow&seed=2&lv=2', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const hs = await r.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1); errs.push(...r.page.errors);
    check('phone 390x844: no horizontal scroll in a boss-identity dungeon', hs); await r.ctx.close(); }
  check('no console / page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  await browser.close();
  done();
})();
