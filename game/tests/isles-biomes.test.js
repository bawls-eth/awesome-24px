// NEXT-SLICES-2 slice X1 on the Hearthvale Isles page (game/games/isles/): species canon + per-island playable checks.
// 3 every ?isle=jungle|home|ice|reef|mars loads with 0 console errors at 390x844 and 1000x700, every live creature's kind has an
//   MMCreatures def of that island's biome, and glacier_shellback on ice is tameable (st not null);
// 4 reef: abyss and sea_rock are solid on foot, lagoon / kelp_bed block on foot, a swim mount (Tidesteed, Skimray) crosses them, and
//   dismounting in the water puts the hero on the nearest walkable tile;
// 5 the pack `rare` entries come in through the seeded spawner: isleback_turtle in reef zone 2, oakback in home zone 3, at most 1 per island;
// plus the b34 taming icons (trust / torpor / bond, tranq on/off, follow / stay / attack, saddle, ride) by id with the text fallback,
// and ?art=0 loads none of them. blockDb sees 0 requests and 0 sockets; nothing leaves the origin.
// Run: BASE=http://localhost:8851/game/index.html NODE_PATH=$(npm root -g) node game/tests/isles-biomes.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const TAMES = require('../shared/mm-tames.js');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/isles/index.html';
const TOWN = '{"realm":{"level":3},"name":"Bo"}';
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
const DESK = { viewport: { width: 1000, height: 700 } };
const ISLES = { jungle: 'jungle', home: 'meadow', ice: 'tundra', reef: 'reef', mars: 'mars' };
const all = [];

function stable(list) { // a tames save with these species; the first one is the mount, the rest the party
  const s = TAMES.defaults();
  const ents = list.map((sp) => TAMES.add(s, { sp, nm: sp, isle: 'reef', d: '2026-11-21', bond: 2 }));
  TAMES.setMount(s, ents[0].id);
  TAMES.setParty(s, ents.slice(1).map((e) => e.id));
  return JSON.stringify(s);
}
async function open(browser, opts, query, seed) {
  const ctx = await browser.newContext(opts);
  const db = await blockDb(ctx);
  const page = await ctx.newPage();
  const errors = [], offsite = [], icons = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('request', (r) => { const u = r.url(); if (!u.startsWith(ORIGIN + '/') && !u.startsWith('data:')) offsite.push(u); if (/b34-taming-ui-items/.test(u)) icons.push(u); });
  await page.addInitScript((s) => {
    if (sessionStorage.seeded) return;
    sessionStorage.seeded = '1';
    localStorage.clear();
    Object.keys(s || {}).forEach((k) => localStorage.setItem(k, s[k]));
  }, Object.assign({ 'pixeltown-save-v1': TOWN }, seed || {}));
  await page.goto(PAGE + '?test=1' + (query || ''));
  await page.waitForFunction(() => window.__isles && window.__isles.world, null, { timeout: 20000 });
  const o = { ctx, page, errors, offsite, icons, db }; all.push(o); return o;
}
const ev = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__isles, ${JSON.stringify(arg === undefined ? null : arg)})`);
const frames = (page, n) => page.evaluate((k) => new Promise((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

(async () => {
  const browser = await chromium.launch();

  // ---- 3. every island at both sizes ----
  for (const isle of Object.keys(ISLES)) {
    for (const [label, opts] of [['1000x700', DESK], ['390x844', PHONE]]) {
      const o = await open(browser, opts, '&isle=' + isle + '&seed=7');
      await frames(o.page, 20);
      // walk the island: visit a tile of each zone so the spawner brings in groups of every band, then check every live creature
      const r = await ev(o.page, (I, pack) => {
        I.pause(true); I.god(true);
        const W = I.world.w, H = I.world.h, seen = {}, bad = [];
        for (let z = 0; z < 4; z++) {
          let t = null;
          for (let y = 4; y < H - 4 && !t; y += 3) for (let x = 4; x < W - 4 && !t; x += 3) if (I.world.zone[y * W + x] === z && I.walkable(x, y) && !I.heroSolid(x, y)) t = { x, y };
          if (!t) continue;
          I.teleport(t.x, t.y); I.spawnTick(); I.step(0, 0, 0.3);
          I.creatures().forEach((c) => { seen[c.sp + '>' + c.kind] = 1; const d = c.kind && I.kindDef(c.kind); if (!d || d.biome !== pack) bad.push(c.sp + '>' + c.kind); });
        }
        // every pack species placed by hand plays as a def of this biome too
        I.clearCreatures();
        const h = I.hero();
        I.packSpecies.forEach((sp) => { const u = I.spawn(sp, h.tx, h.ty + 3); const c = u && I.creatures().find((x) => x.uid === u); if (!c || !c.kind || !I.kindDef(c.kind) || I.kindDef(c.kind).biome !== pack) bad.push('spawn:' + sp + '>' + (c && c.kind)); I.clearCreatures(); });
        return { pack: I.world.pack, ok: I.verify().ok, seen: Object.keys(seen), bad, n: Object.keys(seen).length };
      }, ISLES[isle]);
      const sw = await o.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
      check('3: ?isle=' + isle + ' at ' + label + ': loads ' + ISLES[isle] + ', 0 console errors, no h-scroll', r.pack === ISLES[isle] && r.ok && sw && o.errors.length === 0, JSON.stringify(r).slice(0, 200) + o.errors.join(' | '));
      check('3: ?isle=' + isle + ' at ' + label + ': every live creature kind has a ' + ISLES[isle] + ' def (' + r.n + ' kinds seen)', r.bad.length === 0 && r.n > 0, r.bad.join(', ') + ' seen=' + r.seen.join(','));
      if (isle === 'ice' && label === '1000x700') {
        const gs = await ev(o.page, (I) => { const h = I.hero(); const u = I.spawn('glacier_shellback', h.tx + 3, h.ty); const c = I.creatures().find((x) => x.uid === u); return c ? { kind: c.kind, st: c.st, need: c.need } : null; });
        check('3: glacier_shellback on ice is tameable (st not null)', gs && gs.kind === 'glacier_shellback' && gs.st !== null && gs.need > 0, JSON.stringify(gs));
      }
      check('3: ?isle=' + isle + ' at ' + label + ': no DB traffic, nothing off-origin', o.db.count() === 0 && o.offsite.length === 0, o.offsite.slice(0, 3).join(', '));
      await o.ctx.close();
    }
  }

  // ---- 4. reef water rules ----
  const R = await open(browser, DESK, '&isle=reef&seed=7');
  const solid = await ev(R.page, (I) => {
    I.pause(true); I.god(true); I.clearCreatures();
    const W = I.world.w, H = I.world.h, T = (n) => { const id = I.world.terrain; const want = { abyss: 1, sea_rock: 1 }[n] ? n : n; for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (I.terrainName(x, y) === want) return { x, y }; return null; };
    const ab = T('abyss'), sr = T('sea_rock');
    return { ab: ab && I.heroSolid(ab.x, ab.y) && I.isSolid(ab.x, ab.y), sr: sr ? I.heroSolid(sr.x, sr.y) && I.isSolid(sr.x, sr.y) : null, hasSr: !!sr };
  });
  check('4: reef abyss is solid on foot', solid.ab === true, JSON.stringify(solid));
  check('4: reef sea_rock is solid on foot', solid.hasSr && solid.sr === true, JSON.stringify(solid));
  const foot = await ev(R.page, (I) => {
    const out = {};
    ['lagoon', 'kelp_bed'].forEach((n) => {
      const s = I.findShore(n); if (!s) { out[n] = null; return; }
      I.teleport(s.lx, s.ly); I.face(1, 0); I.step(1, 0, 1.2);
      const h = I.hero(); out[n] = { blocked: I.heroSolid(s.x, s.y), into: h.tx >= s.x, terrain: h.terrain, hint: I.hint() };
    });
    return out;
  });
  check('4: on foot, lagoon and kelp_bed block the hero (open water)', foot.lagoon && foot.kelp_bed && foot.lagoon.blocked && !foot.lagoon.into && foot.kelp_bed.blocked && !foot.kelp_bed.into, JSON.stringify(foot));
  check('4: the hint says to ride a swim mount', /Tidesteed or Skimray/.test(foot.lagoon.hint), foot.lagoon.hint);
  await R.ctx.close();
  for (const mount of ['tidesteed', 'skimray']) {
    const M = await open(browser, DESK, '&isle=reef&seed=7', { 'pixeltown-tames-v1': stable([mount]) });
    const sw = await ev(M.page, (I) => {
      I.pause(true); I.god(true); I.clearCreatures();
      const out = {};
      for (const n of ['lagoon', 'kelp_bed']) {
        const s = I.findShore(n); if (!s) { out[n] = null; continue; }
        if (I.riding()) I.ride();
        I.teleport(s.lx, s.ly); I.face(1, 0);
        const rode = I.ride();
        let inWater = false, maxX = 0;
        for (let k = 0; k < 30; k++) { I.step(1, 0, 0.05); const h = I.hero(); if (I.swimAt(h.tx, h.ty)) inWater = true; maxX = Math.max(maxX, h.tx); if (inWater && I.swimAt(h.tx, h.ty)) break; }
        const wet = I.hero();
        const wasWet = I.swimAt(wet.tx, wet.ty);
        I.ride(); // dismount
        const land = I.hero();
        out[n] = { rode, inWater, wasWet, landOk: I.walkable(land.tx, land.ty) && !I.heroSolid(land.tx, land.ty), dist: Math.hypot(land.tx - wet.tx, land.ty - wet.ty), riding: !!I.riding() };
      }
      return out;
    });
    check('4: riding a ' + mount + ' crosses lagoon and kelp_bed', sw.lagoon && sw.kelp_bed && sw.lagoon.rode && sw.lagoon.inWater && sw.kelp_bed.inWater, JSON.stringify(sw));
    check('4: dismounting a ' + mount + ' in the water puts the hero on the nearest walkable tile', sw.lagoon.wasWet && sw.lagoon.landOk && sw.lagoon.dist <= 3 && !sw.lagoon.riding && sw.kelp_bed.landOk, JSON.stringify(sw));
    check('4: ' + mount + ' page: 0 console errors, no DB traffic', M.errors.length === 0 && M.db.count() === 0, M.errors.join(' | '));
    await M.ctx.close();
  }

  // ---- 5. rare spawns ----
  for (const [isle, want, zone] of [['reef', 'isleback_turtle', 2], ['home', 'oakback', 3]]) {
    for (const seed of ['7', '42']) {
      const P = await open(browser, DESK, '&isle=' + isle + '&seed=' + seed);
      const r = await ev(P.page, (I) => {
        I.pause(true); I.god(true); I.clearCreatures();
        const r0 = I.rare(); if (!r0.spot) return { r0 };
        const sp = r0.spot; let t = null;
        for (let d = 9; d < 18 && !t; d++) for (let a = 0; a < 16 && !t; a++) { const x = Math.round(sp.x + Math.cos(a / 16 * 6.283) * d), y = Math.round(sp.y + Math.sin(a / 16 * 6.283) * d); if (I.walkable(x, y) && !I.heroSolid(x, y)) t = { x, y }; }
        if (!t) return { r0, noNear: true };
        I.teleport(t.x, t.y);
        I.spawnTick(); const a1 = I.rare().alive;
        I.spawnTick(); I.spawnTick(); I.step(0, 0, 1.5); I.spawnTick();
        const list = I.creatures().filter((c) => c.sp === sp.creature);
        const c = list[0];
        return { r0, zone: I.world.zone[sp.y * I.world.w + sp.x], a1, after: I.rare().alive, count: list.length, kind: c && c.kind, st: c ? c.st : null, n: I.rare().n };
      });
      check('5: ' + isle + ' seed ' + seed + ': the rare spot is ' + want + ' in zone ' + zone, r.r0 && r.r0.spot && r.r0.spot.creature === want && r.zone === zone, JSON.stringify(r));
      check('5: ' + isle + ' seed ' + seed + ': it spawns through the spawn tick, at most 1 alive', r.a1 === 1 && r.after <= 1 && r.count === 1 && r.n === 1 && r.kind === want, JSON.stringify(r));
      if (seed === '7') {
        const again = await ev(P.page, (I) => { const a = JSON.stringify(I.rare().spot); return a; });
        const P2 = await open(browser, PHONE, '&isle=' + isle + '&seed=' + seed);
        const b = await ev(P2.page, (I) => JSON.stringify(I.rare().spot));
        check('5: ' + isle + ': the rare spot is seed-stable across page loads', again === b, again + ' vs ' + b);
        check('5: ' + isle + ' pages: 0 console errors', P.errors.length === 0 && P2.errors.length === 0, P.errors.concat(P2.errors).join(' | '));
        await P2.ctx.close();
      }
      await P.ctx.close();
    }
  }
  const J = await open(browser, DESK, '&isle=jungle&seed=7');
  check('5: an island without a rare entry spawns no rare', (await ev(J.page, (I) => I.rare().spot)) === null);
  await J.ctx.close();

  // ---- b34 taming icons on the HUD ----
  const A = await open(browser, DESK, '&isle=jungle&seed=7', { 'pixeltown-tames-v1': stable(['tusktop', 'fernraptor']) });
  await A.page.waitForFunction(() => window.__isles.icons().loaded.length === 10, null, { timeout: 10000 }).catch(() => {});
  const ic = await ev(A.page, (I) => {
    I.pause(true); I.god(true); I.clearCreatures();
    const r = I.findTile(null, 6); I.teleport(r.x, r.y);
    const m0 = I.meters();
    I.ride(); const m1 = I.meters();
    const cmd0 = document.querySelector('#btn-cmd .ico').dataset.ico;
    const c1 = I.command(), cmd1 = document.querySelector('#btn-cmd .ico').dataset.ico;
    const c2 = I.command(), c3 = I.command();
    I.soothe(true);
    const tranq = document.querySelector('#btn-soothe .ico').dataset.ico;
    // a knockout species: soothe shots build torpor, the torpor meter shows it
    I.ride();
    const h = I.hero(); const u = I.spawn('raptor_jr', h.tx + 3, h.ty);
    for (let i = 0; i < 3; i++) { I.fire(1, 0); I.step(0, 0, 0.25); }
    const c = I.creatures().find((x) => x.uid === u);
    const m2 = I.meters();
    const imgs = Array.prototype.map.call(document.querySelectorAll('.ico.on img'), (e) => ({ w: e.naturalWidth, h: e.naturalHeight }));
    return { icons: I.icons(), m0, m1, m2, cmd0, c1, cmd1, c2, c3, tranq, torpor: c ? c.torpor : -1, imgs, cmdHidden: document.getElementById('btn-cmd').hidden,
      label: document.querySelector('#tm-bond .lbl').textContent };
  });
  check('icons: all 10 b34 ui icons load by id', ic.icons.loaded.length === 10 && ic.imgs.length > 0 && ic.imgs.every((d) => d.w === 24 && d.h === 24), JSON.stringify(ic.icons) + JSON.stringify(ic.imgs));
  check('icons: bond meter shows for the party, saddle meter while riding', ic.m0.bond === '2' && ic.m0.saddle === null && ic.m1.saddle !== null, JSON.stringify([ic.m0, ic.m1]));
  check('icons: the party command button cycles follow -> stay -> attack -> follow with its icon', !ic.cmdHidden && ic.cmd0 === 'ui_cmd_attack' && ic.c1 === 'follow' && ic.cmd1 === 'ui_cmd_follow' && ic.c2 === 'stay' && ic.c3 === 'attack', JSON.stringify(ic));
  check('icons: soothe shows the tranq icon (on)', ic.tranq === 'ui_tranq_on', ic.tranq);
  check('icons: soothe shots on a knockout species show the torpor meter', ic.torpor > 0 && ic.m2.torpor !== null, JSON.stringify({ t: ic.torpor, m: ic.m2 }));
  check('icons: the text label is kept for screen readers', ic.label === 'Bond');
  check('icons page: 0 console errors, no DB traffic', A.errors.length === 0 && A.db.count() === 0, A.errors.join(' | '));
  await A.ctx.close();
  const N = await open(browser, PHONE, '&isle=jungle&seed=7&art=0', { 'pixeltown-tames-v1': stable(['tusktop', 'fernraptor']) });
  await frames(N.page, 20);
  const n0 = await ev(N.page, (I) => ({ icons: I.icons(), m: I.meters(), lbl: getComputedStyle(document.querySelector('#tm-bond .lbl')).width, txt: document.querySelector('#btn-cmd .txt').textContent }));
  check('?art=0: no b34 icon is requested or shown; the text labels show', N.icons.length === 0 && n0.icons.loaded.length === 0 && n0.icons.shown.length === 0 && n0.m.bond === '2' && n0.txt.length > 0, JSON.stringify(n0) + N.icons.join(','));
  check('?art=0 page: 0 console errors, no DB traffic', N.errors.length === 0 && N.db.count() === 0, N.errors.join(' | '));
  await N.ctx.close();

  check('no DB requests or sockets in any context', all.every((o) => o.db.count() === 0));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exitCode = 1; });
