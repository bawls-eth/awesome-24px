// G-22 (b05-03, b06-04) on the Isles page: two attack-mode companions never hit the creature you are soothing (its HP only drops from your
// own soothe shots, the KO is still reachable), auto-attack and held fire cannot finish a weary first-fight boss during its grace, and a
// feast still starts the boss-tame. Offline: blockDb, no network module on the page, no chat, no Firebase writes.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-g22-tame-safe.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/isles/index.html';
const PROFILE = { v: 1, heroes: [{ id: 'h1', name: 'Fern', cls: 'druid', level: 7, xp: 10, items: [] }], stash: [], fame: 0, mode: 'classic', hall: [] };
const TAMES = { v: 1, n: 2, roster: [{ id: 't1', sp: 'fernraptor', nm: 'Rex', lv: 5, xp: 0, bond: 3, aff: 0, cos: '', isle: 'jungle', d: '2026-11-01' }, { id: 't2', sp: 'fernraptor', nm: 'Fang', lv: 5, xp: 0, bond: 3, aff: 0, cos: '', isle: 'jungle', d: '2026-11-01' }], party: ['t1', 't2'], mount: '' };
const SEED = { 'pixeltown-mm-v1': JSON.stringify(PROFILE), 'pixeltown-mm-active-v1': JSON.stringify({ v: 1, heroId: 'h1' }), 'pixeltown-tames-v1': JSON.stringify(TAMES) };
const ev = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__isles, ${JSON.stringify(arg === undefined ? null : arg)})`);

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  await blockDb(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.addInitScript((s) => { if (sessionStorage.seeded) return; sessionStorage.seeded = '1'; localStorage.clear(); Object.keys(s).forEach((k) => localStorage.setItem(k, s[k])); }, SEED);
  await page.goto(PAGE + '?test=1&seed=123');
  await page.waitForFunction(() => window.__isles && window.__isles.world, null, { timeout: 15000 });

  // 1-2: soothe a Fern Raptor for 20 s next to two attack companions
  const r = await ev(page, (I) => {
    I.pause(true); I.god(true); I.clearCreatures();
    const t = I.findTile(null, 13); I.teleport(t.x, t.y); I.step(0, 0, 0.5);
    const party0 = I.party();
    const h = I.hero(); const uid = I.spawn('fernraptor', h.tx + 3, h.ty);
    const get = () => I.creatures().find((c) => c.uid === uid) || null;
    I.soothe(true); // the hero opens with a soothe shot (no test-side anger: that would start a plain fight first)
    const out = { party: party0.map((p) => p.mode), hits0: party0.reduce((n, p) => n + p.hits, 0), shots: 0, ko: false, minHp: 1e9, hp0: get().hp, alive: true };
    let t0 = 0;
    for (let i = 0; i < 200 && t0 < 20; i++) {
      const c = get(); if (!c) { out.alive = false; break; }
      if (!c.ko) { const hh = I.hero(); I.fire(c.x - hh.x, c.y - 8 - hh.y); out.shots++; }
      I.step(0, 0, 0.1); t0 += 0.1;
      const c2 = get(); if (c2) { out.minHp = Math.min(out.minHp, c2.hp); if (c2.ko) out.ko = true; }
    }
    const p1 = I.party(); out.hits1 = p1.reduce((n, p) => n + p.hits, 0); out.party1 = p1.length;
    I.soothe(false);
    return out;
  });
  check('setup: two attack-mode companions are in the party', r.party.length === 2 && r.party.every((m) => m === 'attack'), JSON.stringify(r));
  check('1. 20 s of soothing next to two attack companions: no companion hit lands on the soothe target', r.hits1 === r.hits0 && r.alive, JSON.stringify(r));
  check('2. the KO for taming is still reachable by the player\'s own soothe shots (HP kept above 0)', r.ko && r.minHp > 0, JSON.stringify(r));

  // 1b: an ordinary angry creature is still attacked (companions are not switched off)
  const f = await ev(page, (I) => {
    I.clearCreatures(); const h = I.hero(); const uid = I.spawn('boarhog', h.tx + 2, h.ty); I.anger(uid);
    const h0 = I.party().reduce((n, p) => n + p.hits, 0);
    for (let i = 0; i < 40; i++) I.step(0, 0, 0.1);
    return { hits: I.party().reduce((n, p) => n + p.hits, 0) - h0 };
  });
  check('1b. companions still attack an angry boarhog that nobody is taming', f.hits > 0, JSON.stringify(f));

  // 3: weary first-fight boss, 6 s of held fire + auto-attack: stays weary with hp >= 1; a feast then starts the tame
  const b = await ev(page, (I) => {
    I.pause(true); I.god(true); I.clearCreatures();
    if (!I.boss().st) I.bossSpawn();
    const b0 = I.boss(); const out = { id: b0.id, tameable: b0.tameable };
    I.place(b0.site.px + 150, b0.site.py + 10);
    const dt = 1 / 30; let t = 0;
    while (t < 180 && I.boss().st === 'fight') { I.bossHit(I.boss().hpMax / 40 * dt); I.step(0, 0, dt); t += dt; }
    out.st0 = I.boss().st; out.toast = (document.getElementById('toast') || {}).textContent || '';
    let minHp = 1e9; t = 0;
    while (t < 6) { I.bossHit(I.boss().hpMax / 10 * dt); I.step(0, 0, dt); t += dt; const bb = I.boss(); if (bb.st !== 'weary') break; minHp = Math.min(minHp, bb.hp); }
    out.st6 = I.boss().st; out.minHp = minHp;
    I.give('feast', 2); const fd = I.feed(); out.fed = fd && fd.started; out.st7 = I.boss().st;
    return out;
  });
  check('3. a first-fight boss reaches weary and says to hold fire and offer a feast', b.tameable && b.st0 === 'weary' && /Hold fire and offer a feast/.test(b.toast), JSON.stringify(b));
  check('3b. 6 s of held fire at the weary boss: st stays weary and hp >= 1', b.st6 === 'weary' && b.minHp >= 1, JSON.stringify(b));
  check('3c. a feast then starts the boss-tame', b.fed === true && b.st7 === 'taming', JSON.stringify(b));
  check('no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close(); await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
