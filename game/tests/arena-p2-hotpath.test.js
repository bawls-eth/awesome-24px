// P2 (NEXT-SLICES-2 Wave 4): the phone hot-path fixes in realm.js, offline.
//  1. _calcStats() is cached behind markStatsDirty() + an input signature: over a seeded random sequence of equip / unequip, direct save.eq edits,
//     level, buffDmg, player statuses, item t / a / f edits, hero profile, mode, extraGuard and in-place edits of this.stats, the cached result
//     always equals a full recompute (_calcStatsNow), sets included; repeated calls with nothing changed are cache hits.
//  2. The splash path makes no per-hit objects, arrays or strings: CDP sampling heap profiler (16-byte interval, collected objects included) over
//     40000 direct _splashAt calls (spec, pick, falloff, quiet hits, ring / fx / combined number). Before P2 every event allocated the fxLive()
//     filter array, two fxPlay option objects, a lastSplash object, a status opts object, a template string and a sound voice per target
//     (~176 B per event measured). What V8 still allocates is the 12-byte box of a double passed to a non-inlined call (the damage handed to
//     _hitEnemy per target), so the gate is <= 12 B x (targets + 4) per event (old code: over it). A control proves the probe sees allocations.
//  3. Low graphics tier (pixeltown-access-v1 lowGfx): plain damage numbers are throttled (at most one per RM_LOW_DMG_GAP), crits always show,
//     and the damage dealt / rng draws are identical to the normal tier. 0 console errors, 0 DB traffic (blockDb + WebSockets closed).
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/arena-p2-hotpath.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const MAZE = ORIGIN + '/game/games/mad-maze/index.html?test=1&offline=1';
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&seed=12345';
const SAVE = 'pixeltown-save-v1', MM = 'pixeltown-mm-v1', ACTIVE = 'pixeltown-mm-active-v1';
const hero = (id, cls, level) => ({ id, name: cls, cls, level, xp: 0, fame: 0, bonus: 0, mode: 'classic', items: [] });
const prof = (heroes) => ({ v: 1, heroes, stash: new Array(16).fill(null), fame: 0, mode: 'classic', hall: [], migratedFrom: null });
const realm = (level, items, eq) => ({ shards: 0, bestWave: 0, kills: 0, deaths: 0, kb: { spiral: 0, aimed: 0, ring: 0, drifter: 0, boss: 0 }, bossBestT: 0, level, xp: 0, items, nextUid: 100, eq });
const ITEMS = [{ n: 1, id: 'sparkwand', r: 0, t: 5 }, { n: 3, id: 'arm_heavy_ember', r: 0, t: 5 }, { n: 5, id: 'heartcharm', r: 0 }, { n: 7, id: 'sparkwand', r: 1, t: 7, a: 77 },
  { n: 9, id: 'sparkwand', r: 0, t: 12, a: 1, sig: 'blast' }, { n: 11, id: 'arm_heavy_dread', r: 0, t: 12 }, { n: 13, id: 'sparkwand', r: 2, t: 9, a: 5, f: { id: 'reach', v: 0.05 } },
  { n: 15, id: 'arm_heavy_ember', r: 1, t: 8, a: 3 }];

async function open(browser, url, store, opts) {
  const ctx = await browser.newContext(opts || { viewport: { width: 1000, height: 700 } });
  const db = await blockDb(ctx);
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' }));
  await ctx.route('**/hub/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>hub</title>hub' }));
  await ctx.routeWebSocket(/.*/, (ws) => ws.close());
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate((s) => { localStorage.clear(); localStorage.setItem('mm-aim-assist', '0'); Object.keys(s).forEach((k) => localStorage.setItem(k, s[k])); }, store);
  errors.length = 0;
  await page.goto(url);
  await page.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 20000 });
  return { ctx, page, errors, db };
}
const heroStore = (cls, level, rm) => ({ [MM]: JSON.stringify(prof([hero('h-1', cls, level)])), [ACTIVE]: JSON.stringify({ v: 1, heroId: 'h-1' }), [SAVE]: JSON.stringify({ realm: rm }) });

(async () => {
  const browser = await chromium.launch();
  const errs = []; let dbHits = 0;

  // ---------- 1. cached _calcStats == recompute over a random sequence ----------
  { const A = await open(browser, MAZE, heroStore('bruiser', 20, realm(20, ITEMS, { weapon: 1, armor: 3 })));
    const r = await A.page.evaluate(() => {
      const a = window.__mm.arena; a.setPaused(true);
      let s = 987654321; const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; }; const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
      const uids = a.save.items.map((x) => x.n), sts = Object.keys(MMStatus.DEFS);
      const fresh = () => { const keep = a.stats; const v = a._calcStatsNow(null); a.stats = keep; return v; };
      const J = (st) => JSON.stringify(st) + '|' + JSON.stringify(st.sets || null);
      const out = { ops: 0, bad: [], hits0: a.statsHits || 0, runs0: a.statsRuns || 0, kinds: {} };
      for (let i = 0; i < 400; i++) {
        const k = Math.floor(rnd() * 11); out.kinds[k] = (out.kinds[k] || 0) + 1;
        if (k === 0) a.equip(pick(uids));
        else if (k === 1) { const sl = pick(['weapon', 'armor', 'charm']); if (rnd() < 0.3) delete a.save.eq[sl]; else { const it = pick(a.save.items); if (RM_ITEM_BY_ID[it.id].slot === sl) a.save.eq[sl] = it.n; } }
        else if (k === 2) a.save.level = 1 + Math.floor(rnd() * 20);
        else if (k === 3) a.buffDmg = pick([1, 1.25, 1.5, 1.3, 2]);
        else if (k === 4) a.applyStatus('player', pick(sts), { sec: 1 + Math.floor(rnd() * 5) });
        else if (k === 5) { const it = pick(a.save.items); if (it.t) { const w = rnd(); if (w < 0.4) it.t = 3 + Math.floor(rnd() * 10); else if (w < 0.7) it.a = 1 + Math.floor(rnd() * 999); else if (it.t >= 7) it.f = rnd() < 0.5 ? { id: pick(['blast', 'keen', 'reach', 'swift']), v: pick([0.02, 0.05, 4, 5]) } : undefined; } }
        else if (k === 6) a.setHeroProfile(rnd() < 0.3 ? null : { name: 'x', hp: 0.8 + rnd() * 0.5, dmg: 0.8 + rnd() * 0.5, rate: 0.9 + rnd() * 0.3, speed: 1, iframes: 1 });
        else if (k === 7) { a.stats.dmg = 999; a.stats.maxHp = -1; }
        else if (k === 8) a.setMode(pick(['world', 'waves']));
        else if (k === 9) a.extraGuard = pick([0, 1, 2.5]);
        else { a._stT += 3 + rnd() * 4; a.player._stNext = 0; a._stTick(0); }
        const c = a._calcStats(); const f = fresh();
        if (J(c) !== J(f) || a.stats !== c) { if (out.bad.length < 3) out.bad.push({ i, k, c: J(c), f: J(f), same: a.stats === c }); }
        const h0 = a.statsHits || 0; const c2 = a._calcStats(); // nothing changed: a hit, and the same numbers
        if ((a.statsHits || 0) !== h0 + 1 || J(c2) !== J(f)) { if (out.bad.length < 3) out.bad.push({ i, k, again: true, c2: J(c2), f: J(f) }); }
        out.ops++;
      }
      out.hits = (a.statsHits || 0) - out.hits0; out.runs = (a.statsRuns || 0) - out.runs0;
      a.markStatsDirty(); const r0 = a.statsRuns; a._calcStats(); out.dirtyRuns = a.statsRuns - r0;
      return out;
    });
    check('cache: 400 random equip / level / buff / status / item / profile / mode ops: cached _calcStats() == a full recompute every time (sets too)', r.ops === 400 && r.bad.length === 0, JSON.stringify(r.bad).slice(0, 1500));
    check('cache: a repeat call with nothing changed is a cache hit; changes recompute', r.hits >= 400 && r.runs > 50 && r.runs < 800, JSON.stringify({ hits: r.hits, runs: r.runs, kinds: r.kinds }));
    check('cache: markStatsDirty() forces one recompute', r.dirtyRuns === 1, String(r.dirtyRuns));
    errs.push(...A.errors); dbHits += A.db.attempts(); await A.ctx.close(); }

  // ---------- 2. the splash path allocates nothing (CDP sampling heap profiler) ----------
  { const store = heroStore('warlock', 10, { level: 4, xp: 0, shards: 50, bestWave: 2, items: [{ n: 1, id: 'sparkwand', r: 0 }], nextUid: 2, eq: { weapon: 1 } });
    const A = await open(browser, WORLD, store, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const setup = await A.page.evaluate(() => {
      const a = window.__mm.arena, p = a.player;
      a.player.iframes = 1e9; a._hitPlayer = () => {};
      const on = a.setHeroWeapon(MMWeapons.resolve('warlock', 'staff_comet', 0));
      a.eBullets.forEach((b) => { b.active = false; }); a.enemies.forEach((e) => { e.active = false; });
      while (a.enemies.length < 30) a.enemies.push(Object.assign({}, a.enemies[0], { active: false }));
      let n = 0; for (let i = 0; n < 30 && i < 200; i++) { const e = a.spawnEnemy(['spiral', 'aimed', 'ring'][i % 3], p.x + 150 + (i % 5) * 26, p.y - 70 + Math.floor(i / 5) * 26); if (e) { e.hp = e.maxHp = 1e9; e.spdMul = 0; e.cd = 1e9; e.cd2 = 1e9; n++; } }
      const b = { ws: a.weapon, st: 0, own: 0, lb: 0 }; const e0 = a.enemies.find((e) => e.active); const skip = a.enemies.indexOf(e0);
      window.__P2 = (N) => { for (let i = 0; i < N; i++) { a._spFrame = 0; a._spTxtT = -1e9; const sp = a._splashSpec(b); a._splashAt(b, e0.x + (i % 7), e0.y, skip, 10 + (i % 13) * 0.7, sp); } };
      window.__P2c = (N) => { for (let i = 0; i < N; i++) a._calcStats({ noGear: true }); };
      const n0 = a.splashN || 0; window.__P2(4000); // warm-up (JIT, caches)
      return { on: !!on, n, splashes: (a.splashN || 0) - n0, hit: a.lastSplash ? a.lastSplash.n : 0 };
    });
    check('splash probe: staff_comet splash into 30 enemies, each call splashes several', setup.on && setup.n === 30 && setup.splashes === 4000 && setup.hit >= 3, JSON.stringify(setup));
    const cdp = await A.ctx.newCDPSession(A.page);
    await cdp.send('HeapProfiler.enable');
    const sample = async (fn, N) => {
      await cdp.send('HeapProfiler.collectGarbage');
      await cdp.send('HeapProfiler.startSampling', { samplingInterval: 16, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
      await A.page.evaluate(([f, k]) => window[f](k), [fn, N]);
      const { profile } = await cdp.send('HeapProfiler.stopSampling');
      const hits = {}; let n = 0;
      const walk = (nd, inPath) => { const nm = nd.callFrame.functionName; const ip = inPath || /^(_splashAt|_splashSpec|_splashFx|_calcStats)$/.test(nm); if (ip && nd.selfSize > 0) { n += nd.selfSize; hits[nm] = (hits[nm] || 0) + nd.selfSize; } nd.children.forEach((c) => walk(c, ip)); };
      walk(profile.head, false);
      return { bytes: n, hits };
    };
    const ctl = await sample('__P2c', 400);
    await sample('__P2', 20000); // more warm-up (optimized tiers)
    const SPN = 40000; const sp = await sample('__P2', SPN); const per = sp.bytes / SPN, budget = 12 * (setup.hit + 4);
    console.log(`p2 heap sampling: splash path ${sp.bytes} B over ${SPN} events = ${per.toFixed(1)} B/event (budget ${budget}, ${setup.hit} targets) ${JSON.stringify(sp.hits)} | control (pure _calcStats) ${ctl.bytes} B`);
    check('splash alloc: the probe sees allocations (control: pure _calcStats calls allocate)', ctl.bytes > 0, JSON.stringify(ctl));
    check('splash alloc: no per-event objects / arrays / strings: <= 12 B x (targets + 4) per splash event (number boxes only)', per <= budget, `${per.toFixed(1)} B/event > ${budget}: ${JSON.stringify(sp.hits)}`);
    errs.push(...A.errors); dbHits += A.db.attempts(); await A.ctx.close(); }

  // ---------- 3. low graphics tier: plain damage numbers throttled, crits always, identical damage / rng ----------
  const lowRun = async (low) => {
    const store = heroStore('warlock', 10, { level: 4, xp: 0, shards: 50, bestWave: 2, items: [{ n: 1, id: 'sparkwand', r: 0 }], nextUid: 2, eq: { weapon: 1 } });
    if (low) store['pixeltown-access-v1'] = JSON.stringify({ v: 1, lowGfx: true });
    const A = await open(browser, WORLD, store, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await A.page.waitForTimeout(300);
    const r = await A.page.evaluate(() => {
      const a = window.__mm.arena, p = a.player;
      a.player.iframes = 1e9; a._hitPlayer = () => {}; a.enemies.forEach((e) => { e.active = false; }); a.texts.forEach((t) => { t.active = false; });
      const e = a.spawnEnemy('aimed', p.x + 120, p.y); e.hp = e.maxHp = 1e6; e.spdMul = 0; e.cd = 1e9; e.cd2 = 1e9;
      let draws = 0; const rg = a.rng; a.rng = () => { draws++; return rg(); };
      const sk0 = a.dmgTxtSkipped || 0; const live = () => a.texts.filter((t) => t.active && t.color !== '#ffd166').length;
      for (let i = 0; i < 20; i++) a._hitEnemy(e, 1.5, false); // one frame's worth of plain hits
      const plain = live();
      for (let i = 0; i < 3; i++) a._hitEnemy(e, 2, true);
      const crits = a.texts.filter((t) => t.active && /!$/.test(t.text)).length;
      a.rng = rg;
      return { perf: window.__mmPerf ? window.__mmPerf.lowGfx : null, lowF: a._lowGfx(), plain, crits, skipped: (a.dmgTxtSkipped || 0) - sk0, hp: e.hp, draws };
    });
    errs.push(...A.errors); dbHits += A.db.attempts(); await A.ctx.close(); return r;
  };
  const hi = await lowRun(false), lo = await lowRun(true);
  check('low tier: the Low graphics setting puts the arena on the low tier (window.__mmPerf.lowGfx)', lo.perf === true && lo.lowF === true && hi.lowF === false, JSON.stringify({ hi, lo }));
  check('low tier: 20 plain hits in one frame show 1 damage number (19 skipped); the normal tier shows every one', lo.plain === 1 && lo.skipped === 19 && hi.skipped === 0 && hi.plain >= 20, JSON.stringify({ hi, lo }));
  check('low tier: crits always show their number', lo.crits === 3 && hi.crits === 3, JSON.stringify({ hi: hi.crits, lo: lo.crits }));
  check('low tier: identical damage and rng draws (no gameplay change)', lo.hp === hi.hp && lo.draws === hi.draws, JSON.stringify({ hi, lo }));

  check('0 console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  check('0 database requests or sockets', dbHits === 0, String(dbHits));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
