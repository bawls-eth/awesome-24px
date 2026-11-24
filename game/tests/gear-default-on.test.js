// GH: gear-on-by-default hardening (NEXT-SLICES-2 Wave 1, "GH acceptance" 1-4).
//  1. Defaults: with no flag, world and dungeon drops roll tiered gear; ?gear=0 gives 0 items with `t`; the Town classic arena and duels never
//     create `t` (a runtime spy on every town-save write, plus a grep of game/main.js). A picked-up world gear bag keeps its tier (regression).
//  2. Snapshot: before the first tiered item reaches a save without `gv`, an MMBackup.bundle snapshot goes to pixeltown-backup-pregear-v1, once,
//     and that key is never part of a backup bundle.
//  3. Downgrade hint: a save with gv:1, no tiered item and fewer items than remembered shows ONE calm note; nothing is restored automatically.
//  4. Seat ids: gearPlayer comes from the world-team seat, so two seats on the same seed and kill roll different streams (pure check via seedFor).
// Offline: every page blocks the database (blockDb); the town runs in "Play offline" mode. Never chats, never writes to Firebase.
// Run: BASE=http://localhost:8861/game/index.html NODE_PATH=$(npm root -g) node game/tests/gear-default-on.test.js
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { check, done, blockDb, offlineStub } = require('./helpers');
const GD = require('../shared/mm-gear-drops.js');
const MMBackup = require('../shared/mm-backup.js');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const ORIGIN = BASE.replace(/\/game\/index\.html.*$/, '');
const WURL = (q) => ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&seed=12345' + (q || '');
const DURL = (q) => `${ORIGIN}/game/games/mad-maze/index.html?mode=dungeon&test=1&difficulty=off&lv=2&biome=warren&seed=11${q || ''}`;
const PRE = 'pixeltown-backup-pregear-v1';
const HINT = 'pixeltown-gearhint-v1';
const HINT_TEXT = 'Your gear may have been reset by an old tab: restore from Lantern backup';
const CLASSIC = { realm: { level: 6, xp: 0, shards: 50, bestWave: 2, items: [{ n: 1, id: 'sparkwand', r: 0 }], nextUid: 2, eq: { weapon: 1 } } };
const ZONE3 = { zone: 3, tier: 3, src: 'mob' };

async function ctxFor(browser, phone) {
  const ctx = await browser.newContext(phone ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } : { viewport: { width: 1000, height: 700 } });
  const db = await blockDb(ctx);
  await ctx.route('**/game/index.html*', (r) => (/games\/mad-maze/.test(r.request().url()) ? r.continue() : r.fulfill({ contentType: 'text/html', body: '<!doctype html>town' })));
  return { ctx, db };
}
async function openMM(browser, url, o) {
  o = o || {};
  const { ctx, db } = await ctxFor(browser, o.phone);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate((a) => { localStorage.clear(); localStorage.setItem('pixeltown-save-v1', a.v); localStorage.setItem('mm-aim-assist', '0'); Object.keys(a.extra).forEach((k) => localStorage.setItem(k, a.extra[k])); },
    { v: JSON.stringify(o.save || CLASSIC), extra: o.extra || {} });
  await page.goto(url);
  return { ctx, db, page, errors };
}
async function openWorld(browser, q, o) {
  const r = await openMM(browser, WURL(q), o);
  await r.page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 15000 });
  await r.page.evaluate(() => { const a = window.__mm.arena; a.player.iframes = 1e9; a._hitPlayer = () => {}; a.enemies.forEach((e) => { e.active = false; }); });
  return r;
}
const W = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__mm.arena, window.__mm.world, ${JSON.stringify(arg)})`);
const series = (page, a) => W(page, (ar, w, q) => {
  w.setDropAll(true); const out = [];
  for (let i = 0; i < q.n; i++) { ar.bags.forEach((b) => { b.active = false; }); const got = w.testDrop(q.info, q.tag); if (got) got.items.forEach((it) => out.push(it)); }
  w.setDropAll(false); return out;
}, a);
const sig = (l) => JSON.stringify(l.map((i) => [i.id, i.r, i.t || 0, i.a || 0]));
const ls = (page, k) => page.evaluate((key) => localStorage.getItem(key), k);
const townRealm = async (page) => { const s = JSON.parse(await ls(page, 'pixeltown-save-v1')); return s && s.realm; };

(async () => {
  const browser = await chromium.launch();
  let o;

  // ================= 1. defaults =================
  o = await openWorld(browser, '');
  const wDef = await series(o.page, { n: 20, info: ZONE3, tag: 'gh' });
  check('1 world: no flag -> gear on, zone-3 drops carry t', (await W(o.page, (a, w) => w.gearOn)) === true && wDef.filter((i) => i.t).length > 5, wDef.length + ' items');
  await o.ctx.close();
  o = await openWorld(browser, '&gear=0');
  const wOff = await series(o.page, { n: 20, info: ZONE3, tag: 'gh' });
  check('1 world: ?gear=0 -> 0 items with t', (await W(o.page, (a, w) => w.gearOn)) === false && wOff.length > 0 && wOff.every((i) => i.t === undefined));
  check('1 world: ?gear=0 never writes the pre-gear snapshot', (await ls(o.page, PRE)) === null);
  await o.ctx.close();

  const dungeonBoss = async (q, save) => {
    const r = await openMM(browser, DURL(q), { save });
    await r.page.waitForFunction(() => window.__mm && window.__mm.dungeon && window.__mm.dungeon.room !== null, null, { timeout: 15000 });
    await r.page.evaluate(() => {
      window.__mm.arena._hitPlayer = () => {};
      const d = window.__mm.dungeon; const g = d.graph; const target = g.bossRoomId;
      const nbrs = (id) => g.doors.filter((x) => (!x.cracked || d.state.secretOpen) && (x.a === id || x.b === id) && !x.locked).map((x) => (x.a === id ? x.b : x.a));
      const prev = { [d.room]: null }; const qq = [d.room];
      while (qq.length) { const u = qq.shift(); if (u === target) break; nbrs(u).forEach((v) => { if (!(v in prev)) { prev[v] = u; qq.push(v); } }); }
      const p = []; for (let u = target; u !== null && u !== undefined; u = prev[u]) p.unshift(u);
      for (let i = 1; i < p.length; i++) { if (d.state.room(d.room).enemiesAlive > 0 && g.rooms[d.room].type !== 'boss') d.clearRoom(); d.enter(p[i]); }
    });
    await r.page.waitForTimeout(200);
    for (let i = 0; i < 40; i++) {
      const dead = await r.page.evaluate(() => { const d = window.__mm.dungeon; if (d.state.boss.dead) return true; const e = d.boss(); if (e) window.__mm.arena._hitEnemy(e, 200); return false; });
      if (dead) break; await r.page.waitForTimeout(350);
    }
    await r.page.waitForTimeout(300);
    r.data = await r.page.evaluate(() => ({ on: window.__mm.dungeon.gearOn, dead: window.__mm.dungeon.state.boss.dead, itemsT: window.__mm.arena.save.items.filter((x) => x.t).length }));
    return r;
  };
  const dDef = await dungeonBoss('');
  check('1 dungeon: no flag -> gear on, the boss puts a tiered item in the pack', dDef.data.dead && dDef.data.on === true && dDef.data.itemsT >= 1, JSON.stringify(dDef.data));
  // 2 (dungeon side): the first tiered grant into a gear-less save took a snapshot first
  const dSnap = JSON.parse((await ls(dDef.page, PRE)) || 'null');
  const dSnapRealm = dSnap && dSnap.keys && dSnap.keys['pixeltown-save-v1'] ? JSON.parse(dSnap.keys['pixeltown-save-v1']).realm : null;
  check('2 dungeon: the first tiered grant wrote one MMBackup bundle to pixeltown-backup-pregear-v1, holding the save from before any t',
    dSnap && dSnap.format === 'pixeltown-backup' && dSnapRealm && !dSnapRealm.gv && dSnapRealm.items.every((x) => !x.t), JSON.stringify(dSnap).slice(0, 200));
  check('1/2 dungeon: no console errors', dDef.errors.length === 0, dDef.errors.join(' | '));
  await dDef.ctx.close();
  const dOff = await dungeonBoss('&gear=0');
  check('1 dungeon: ?gear=0 -> 0 items with t and no snapshot', dOff.data.dead && dOff.data.on === false && dOff.data.itemsT === 0 && (await ls(dOff.page, PRE)) === null, JSON.stringify(dOff.data));
  await dOff.ctx.close();

  // Town: game/main.js never references the gear modules or writes a tier; the town page never loads them.
  const mainSrc = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  const townHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  check('1 town grep: main.js has no MMGear / MMGearDrops / rollGear / gearOn / gv, and never sets an item .t',
    !/MMGear|rollGear|gearOn|\bgv\b|\.t\s*=[^=]|\bt:\s*g\./.test(mainSrc));
  check('1 town grep: game/index.html loads no mm-gear*.js', !/mm-gear/.test(townHtml));
  {
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
    const db = await offlineStub(ctx);
    await ctx.addInitScript(() => {
      window.__ghSpy = { tWrites: 0, writes: 0, gearSeen: false };
      const orig = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) {
        if (k === 'pixeltown-save-v1') { window.__ghSpy.writes++; try { const r = JSON.parse(v).realm; if (r && (r.gv || (r.items || []).some((x) => x && x.t))) window.__ghSpy.tWrites++; } catch (e) { /* not json */ } }
        if (k === 'pixeltown-backup-pregear-v1') window.__ghSpy.tWrites++;
        return orig.call(this, k, v);
      };
      let gd; Object.defineProperty(window, 'MMGearDrops', { configurable: true, get() { return gd; }, set(v) { window.__ghSpy.gearSeen = true; gd = v; } });
    });
    const page = await ctx.newPage(); const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    await page.route('**/main.js*', async (route) => {
      const resp = await route.fetch();
      route.fulfill({ response: resp, body: (await resp.text()).replace('const game = new Phaser.Game(config);', 'const game = window.__g = new Phaser.Game(config);') });
    });
    await page.goto(BASE);
    await page.fill('#name-input', 'ADMINgearspy');
    await page.click('.species-tab'); await page.click('.avatar-choice');
    await page.click('button:has-text("Join Town")');
    await page.waitForSelector('#join-offline-btn:visible', { timeout: 10000 });
    await page.click('#join-offline-btn');
    await page.waitForFunction(() => window.__g && window.__g.scene.getScene('Town') && window.__g.scene.getScene('Town').localBody, null, { timeout: 20000 });
    const S = (fn) => page.evaluate(`(${fn.toString()})(window.__g.scene.getScene('Town'))`);
    // classic arena: drops + pickups through the real dropBag/collectItem path, kills through _hitEnemy, a boss kill
    await S((s) => { s.enterRealm(); });
    await page.waitForTimeout(800);
    const classic = await S((s) => {
      const r = s.realm; r.player.iframes = 1e9; r._hitPlayer = () => {};
      for (let i = 0; i < 30; i++) { const b = r.dropBag(r.player.x, r.player.y, i % 4); if (b) { b.active = false; r.collectItem(b.id, b.r); } }
      r.enemies.filter((e) => e.active).forEach((e) => r._hitEnemy(e, 9999));
      try { r._bossDefeated({ x: r.player.x, y: r.player.y, bossTier: 1 }); } catch (e) { /* the boss path may need a live boss */ }
      r.bags.filter((b) => b.active).forEach((b) => { b.active = false; r.collectItem(b.id, b.r); });
      r.onSave(r.save);
      return { n: r.save.items.length, t: r.save.items.filter((x) => x.t).length, gv: !!r.save.gv };
    });
    await S((s) => { s.exitRealm(); });
    // duel (relay link that goes nowhere): the same drop path must stay classic too
    await S((s) => { const link = { onMessage: null, send() {}, close() {} }; s.enterRealm({ role: 'host', link, mode: 'duel' }); });
    await page.waitForTimeout(600);
    const duel = await S((s) => {
      const r = s.realm; for (let i = 0; i < 10; i++) { const b = r.dropBag(r.player.x, r.player.y, 3); if (b) { b.active = false; r.collectItem(b.id, b.r); } }
      r.onSave(r.save); return { mode: r.team && r.team.mode, t: r.save.items.filter((x) => x.t).length };
    });
    const spy = await page.evaluate(() => window.__ghSpy);
    check('1 town runtime: classic arena drops/pickups/kills create no t and no gv', classic.n > 1 && classic.t === 0 && !classic.gv, JSON.stringify(classic));
    check('1 town runtime: a duel creates no t', duel.mode === 'duel' && duel.t === 0, JSON.stringify(duel));
    check('1 town runtime spy: no town-save write ever carried t/gv, no snapshot, MMGearDrops never loaded', spy.writes > 0 && spy.tWrites === 0 && spy.gearSeen === false, JSON.stringify(spy));
    check('1 town runtime: no page errors', errors.length === 0, errors.join(' | '));
    check('1 town runtime: nothing reached for the database (offline stub)', db.attempts() === 0, String(db.attempts()));
    await ctx.close();
  }

  // ================= 1 regression + 2: world pickup keeps the tier; the pre-gear snapshot =================
  o = await openWorld(browser, '');
  check('2 world: no snapshot before any tiered item', (await ls(o.page, PRE)) === null);
  const before = await ls(o.page, 'pixeltown-save-v1');
  await W(o.page, (a, w) => { w.setDropAll(true); a.bags.forEach((b) => { b.active = false; }); w.testDrop({ zone: 3, tier: 3, src: 'mob' }, 'pick'); w.setDropAll(false); });
  await o.page.waitForFunction(() => window.__mm.arena.bags.every((b) => !b.active || !b.gear), null, { timeout: 8000 }).catch(() => {});
  await o.page.waitForTimeout(400);
  const picked = await W(o.page, (a) => a.save.items.filter((x) => x.t).map((x) => ({ id: x.id, t: x.t })));
  const stored = await townRealm(o.page);
  check('1 regression: walking over a world gear bag keeps its tier on the backpack entry and in the save', picked.length >= 1 && stored.items.some((x) => x.t), JSON.stringify(picked));
  const snap1 = await ls(o.page, PRE);
  const s1 = JSON.parse(snap1 || 'null');
  check('2 world: the snapshot is an MMBackup bundle of the save from BEFORE the first tiered item', s1 && s1.format === 'pixeltown-backup' && (() => { const r = JSON.parse(s1.keys['pixeltown-save-v1']).realm; return !r.gv && r.items.every((x) => !x.t) && JSON.stringify(r.items) === JSON.stringify(JSON.parse(before).realm.items); })(), snap1 && snap1.slice(0, 160));
  await W(o.page, (a, w) => { w.setDropAll(true); for (let i = 0; i < 3; i++) { a.bags.forEach((b) => { b.active = false; }); w.testDrop({ zone: 3, tier: 3, src: 'mob' }, 'pick2'); } w.setDropAll(false); });
  await o.page.waitForTimeout(1200);
  check('2 world: written once (later tiered pickups leave it alone)', (await ls(o.page, PRE)) === snap1);
  const bundleKeys = await o.page.evaluate(() => (window.MMBackup ? Object.keys(window.MMBackup.bundle(localStorage).keys) : null));
  check('2: the snapshot key is not part of a backup bundle (page MMBackup)', Array.isArray(bundleKeys) && bundleKeys.indexOf(PRE) < 0 && bundleKeys.indexOf('pixeltown-save-v1') >= 0, JSON.stringify(bundleKeys));
  check('2/3: the snapshot key is not a known backup key (a backup never holds a backup)', MMBackup.KNOWN.indexOf(PRE) < 0 && MMBackup.PREGEAR_KEY === PRE);
  // R4 O-04 (owner decision): ONE Backup carries every save key and all settings, the "seen" hints included, so the gear hint
  // IS covered now (it used to be left out); it travels in the bundle like the other hint flags.
  check('2/3: the gear hint key is covered by the one Backup (R4 O-04)', MMBackup.KNOWN.indexOf(HINT) >= 0);
  check('1/2 world: no console errors', o.errors.length === 0, o.errors.join(' | '));
  await o.ctx.close();
  // a save that already has gv (or a tiered item) never gets a snapshot; quota errors are swallowed
  o = await openWorld(browser, '', { save: { realm: Object.assign({}, CLASSIC.realm, { gv: 1 }) } });
  await series(o.page, { n: 3, info: ZONE3, tag: 'gv' });
  await W(o.page, (a, w) => { w.setDropAll(true); a.bags.forEach((b) => { b.active = false; }); w.testDrop({ zone: 3, tier: 3, src: 'mob' }, 'gvp'); w.setDropAll(false); });
  await o.page.waitForTimeout(1500);
  check('2: a save that already has gv never gets a pre-gear snapshot', (await ls(o.page, PRE)) === null);
  await o.ctx.close();
  {
    const mem = (init, quota) => { const m = Object.assign({}, init); return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { if (quota) throw new Error('QuotaExceededError'); m[k] = String(v); }, removeItem: (k) => { delete m[k]; }, m }; };
    const st = mem({ 'pixeltown-save-v1': JSON.stringify(CLASSIC) });
    const a = MMBackup.snapshotPregear(st); const v1 = st.m[PRE]; const b = MMBackup.snapshotPregear(st);
    check('2 pure: written once, then "exists"', a === 'written' && b === 'exists' && st.m[PRE] === v1 && JSON.parse(v1).keys['pixeltown-save-v1'] === JSON.stringify(CLASSIC));
    check('2 pure: a save with gv or a t item -> "has-gear", nothing written', MMBackup.snapshotPregear(mem({ 'pixeltown-save-v1': JSON.stringify({ realm: { gv: 1, items: [] } }) })) === 'has-gear' &&
      MMBackup.snapshotPregear(mem({ 'pixeltown-save-v1': JSON.stringify({ realm: { items: [{ n: 1, id: 'x', r: 0, t: 3 }] } }) })) === 'has-gear');
    check('2 pure: a full storage is quota-safe (no throw, "skipped")', MMBackup.snapshotPregear(mem({ 'pixeltown-save-v1': '{}' }, true)) === 'skipped');
    check('2 pure: the bundle never includes the snapshot itself', Object.keys(MMBackup.bundle(st).keys).indexOf(PRE) < 0);
  }

  // ================= 3. downgrade hint =================
  const stripped = { realm: { level: 6, xp: 0, shards: 50, bestWave: 2, gv: 1, items: [{ n: 1, id: 'sparkwand', r: 0 }], nextUid: 9, eq: { weapon: 1 } } };
  o = await openWorld(browser, '', { save: stripped, extra: { [HINT]: JSON.stringify({ n: 5, shown: 0 }) } });
  await o.page.waitForTimeout(300);
  const h1 = await o.page.evaluate(() => { const el = document.getElementById('rw-site-note'); return { text: el && el.textContent, vis: !!el && !el.classList.contains('hidden'), st: window.__mm.world.gearHint(), items: window.__mm.arena.save.items.length }; });
  check('3: gv:1 + no t + fewer items than remembered -> the calm hint line shows', h1.vis && h1.text === HINT_TEXT && h1.st.now === true, JSON.stringify(h1));
  check('3: no auto-restore (the backpack is untouched, the town save is unchanged)', h1.items === 1 && JSON.stringify((await townRealm(o.page)).items) === JSON.stringify(stripped.realm.items));
  check('3: the hint is remembered as shown', JSON.parse(await ls(o.page, HINT)).shown === 1);
  check('3: no console errors', o.errors.length === 0, o.errors.join(' | '));
  const hintAfter = await ls(o.page, HINT);
  await o.ctx.close();
  o = await openWorld(browser, '', { save: stripped, extra: { [HINT]: hintAfter } });
  await o.page.waitForTimeout(300);
  check('3: one-time (a second visit shows nothing)', (await W(o.page, (a, w) => w.gearHint().now)) === false);
  await o.ctx.close();
  // negatives: gear still present (count is remembered), or no gv, or not fewer
  const withGear = { realm: Object.assign({}, stripped.realm, { items: [{ n: 1, id: 'sparkwand', r: 0 }, { n: 2, id: 'sparkwand', r: 1, t: 5 }, { n: 3, id: 'sparkwand', r: 0 }] }) };
  o = await openWorld(browser, '', { save: withGear });
  await o.page.waitForTimeout(300);
  const g1 = await W(o.page, (a, w) => w.gearHint());
  check('3: a save that holds tiered gear shows no hint and remembers its item count', g1.now === false && JSON.parse(await ls(o.page, HINT)).n === 3, JSON.stringify(g1) + ' ' + (await ls(o.page, HINT)));
  await o.ctx.close();
  o = await openWorld(browser, '', { save: CLASSIC, extra: { [HINT]: JSON.stringify({ n: 5, shown: 0 }) } });
  check('3: a save without gv shows no hint', (await W(o.page, (a, w) => w.gearHint().now)) === false);
  await o.ctx.close();
  o = await openWorld(browser, '', { save: stripped, extra: { [HINT]: JSON.stringify({ n: 1, shown: 0 }) } });
  check('3: not fewer items than remembered -> no hint', (await W(o.page, (a, w) => w.gearHint().now)) === false);
  await o.ctx.close();
  o = await openWorld(browser, '', { save: stripped, extra: { [HINT]: '{garbage' } });
  check('3: a corrupt hint key is ignored (no hint, no error)', (await W(o.page, (a, w) => w.gearHint().now)) === false && o.errors.length === 0, o.errors.join(' | '));
  await o.ctx.close();

  // ================= 4. seat ids =================
  check('4 pure: seedFor differs per seat id for the same seed/tag/kill', GD.seedFor('12345', 't', 7, 'p0') !== GD.seedFor('12345', 't', 7, 'p1'));
  {
    const ctx = { src: 'mob', zone: 3, k: 0, r: 1, bagTier: 3, always: true, level: 20 };
    const run = (pid) => JSON.stringify(Array.from({ length: 40 }, (_, k) => GD.rollGear(ctx, GD.seedFor('12345', 'kill', k, pid))).map((g) => g && [g.id, g.t, g.a || 0]));
    check('4 pure: two seats on the same seed and kills roll different gear streams', run('p0') !== run('p1') && run('p1') !== run('p2') && run('p0') === run('p0'));
  }
  o = await openWorld(browser, '');
  const ids = await W(o.page, (a, w) => {
    const out = [w.gearPlayerId()];
    a.worldTeam = { ok: true, seat: 1 }; out.push(w.gearPlayerId());
    w.setTeam({ ok: true, seat: 2 }); out.push(w.gearPlayerId());
    w.setTeam({ ok: false, seat: -1 }); out.push(w.gearPlayerId()); // an inert (unseated) team passed explicitly wins over arena.worldTeam: solo stream
    w.setTeam(null); a.worldTeam = null; out.push(w.gearPlayerId());
    return out;
  });
  check('4 runtime: gearPlayer is p0 solo, p<seat> with a world-team seat, p0 for an inert team', JSON.stringify(ids) === JSON.stringify(['p0', 'p1', 'p2', 'p0', 'p0']), JSON.stringify(ids));
  const seat0 = await series(o.page, { n: 15, info: ZONE3, tag: 'seat' });
  await o.ctx.close();
  o = await openWorld(browser, '');
  await W(o.page, (a, w) => { w.setTeam({ ok: true, seat: 1 }); });
  const seat1 = await series(o.page, { n: 15, info: ZONE3, tag: 'seat' });
  await o.ctx.close();
  o = await openWorld(browser, '');
  await W(o.page, (a, w) => { w.setTeam({ ok: true, seat: 0 }); });
  const seat0b = await series(o.page, { n: 15, info: ZONE3, tag: 'seat' });
  check('4 runtime: seat 1 rolls a different stream than seat 0 on the same seed and kills; seat 0 = the solo stream', seat0.length > 0 && sig(seat0) !== sig(seat1) && sig(seat0) === sig(seat0b));
  await o.ctx.close();

  await browser.close();
  done();
})();
