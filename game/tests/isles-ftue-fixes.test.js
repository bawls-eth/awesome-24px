// IF1 (NEXT-SLICES-4) on the Hearthvale Isles page: the first-ten-minutes fixes, from PLAYTEST-REVIEW-3 (isles).
// 1 rest + regen: a dock / campfire / hot spring / dome / home heals to full in <= 3 s with one "Rested. Full health." per visit (event
//   'rest'); away from danger 1 HP per 1.5 s after 5 s without a hit; nothing heals while a boss fight is engaged; a rest spot is a safe
//   room (a hostile next to you there does not attack); out of air on mars, creature hits are halved and the hint names the nearest dome;
// 2 a pouch per island (home clover + apple, reef kelp + fish, tundra fish + frostberry, mars oxide dust + potatoes; ?pouch=classic is the
//   old pouch) and feeding from the bag ("Used 1 iron from your bag"), never below what a locked travel / o2 recipe needs (a calm
//   "kept for a travel craft" toast); "wants clover. You have none yet: clover grows ..." names where it grows;
// 3 food glints for the old orphan diets, placed seeded; 4 the jungle vine rope: 3 labelled glints by the dock, a hint line, and the raft
//   row / sea chart say where it grows; 5 a locked island opened by URL (no ?test=1) lands at the home dock with no visit medal, and an
//   unlocked one opens normally; 6 first sightings are journal entries (event 'spot'), a forage sparkle shows after 40 s without a
//   reward within 10 tiles and is picked up by walking over it (save.spark), .rc-note text is 12 px, the archipelago key stays < 20 KB.
// Screens (SHOTS=<dir>): home feeding and a tundra tame, phone 390x844 and desktop. 0 console errors, 0 DB requests, never chats.
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/isles-ftue-fixes.test.js
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/isles/index.html';
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 };
const DESK = { viewport: { width: 1280, height: 720 } };
const SHOTS = process.env.SHOTS || '';
const KEY = 'pixeltown-archipelago-v1', MEDALS = 'pixeltown-medals-isles-v1';
const all = [];

async function open(browser, opts, query, seed, noTest) {
  const ctx = await browser.newContext(opts);
  const db = await blockDb(ctx);
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' }));
  await ctx.route('**/hub/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>hub</title>hub' }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.addInitScript((s) => {
    if (sessionStorage.seeded) return;
    sessionStorage.seeded = '1';
    localStorage.clear();
    Object.keys(s || {}).forEach((k) => localStorage.setItem(k, s[k]));
  }, seed || {});
  await page.goto(PAGE + (noTest ? '?' : '?test=1') + (query || ''));
  if (noTest) await page.waitForFunction(() => !!localStorage.getItem('pixeltown-medals-isles-v1'), null, { timeout: 15000 });
  else await page.waitForFunction(() => window.__isles && window.__isles.world, null, { timeout: 15000 });
  const o = { ctx, page, errors, db }; all.push(o); return o;
}
const ev = (page, fn, arg) => page.evaluate(`window.__isles.wait = window.__isles.wait || ((s) => { let l = s; while (l > 1e-9) { const d = Math.min(0.5, l); window.__isles.step(0, 0, d); l -= d; } return window.__isles.hero(); }); (${fn.toString()})(window.__isles, ${JSON.stringify(arg === undefined ? null : arg)})`);
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png') }); };
const frames = (page, n) => page.evaluate((k) => new Promise((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
// befriend a fresh creature of `sp` right next to the hero (feed / calm tames turn calm when you stand close and do not attack)
const BEFRIEND = `(I, sp) => { I.pause(true); I.clearCreatures(); const h = I.hero(); const uid = I.spawn(sp, h.tx + 1, h.ty); for (let k = 0; k < 40; k++) { I.step(0, 0, 0.25); const c = I.creatures().find((q) => q.uid === uid); if (c && c.calm) break; I.nextTo(uid, 30); } return I.creatures().find((q) => q.uid === uid) || null; }`;

(async () => {
  const browser = await chromium.launch();
  const html = fs.readFileSync(path.join(__dirname, '..', 'games', 'isles', 'index.html'), 'utf8');
  check('0: the page loads mm-isle-pouch.js and mm-isle-rest.js (pure) and no network module', /mm-isle-pouch\.js/.test(html) && /mm-isle-rest\.js/.test(html) && !/firebase|net\.js/i.test(html));

  // ---- 1. rest + regen on the jungle ----
  const J = await open(browser, DESK, '&isle=jungle&seed=123');
  const r1 = await ev(J.page, (I) => {
    I.pause(true); I.clearCreatures(); I.god(false);
    const out = {};
    const d = I.dock(); I.teleport(d.x, d.y + 3); I.wait(0.5);
    I.hurt(12); out.hurt = I.hp().hp;
    I.teleport(d.x, d.y); const t0 = I.simT(); let full = null;
    for (let k = 0; k < 40 && full === null; k++) { I.step(0, 0, 0.1); if (I.hp().hp >= I.hp().maxHp) full = I.simT() - t0; }
    out.full = full; out.toast = document.getElementById('toast').textContent;
    I.wait(4); out.rests = I.events().filter((e) => e.kind === 'rest').length; out.restInfo = I.rest();
    // away from every rest spot: slow regen after 5 s without a hit
    const far = I.restSpot(false); out.far = far; I.teleport(far.x, far.y); I.wait(0.4);
    I.hurt(10); const h0 = I.hp().hp; I.wait(4.5); out.reg4 = I.hp().hp - h0; I.wait(6); out.reg10 = I.hp().hp - h0; out.mode = I.rest().mode;
    // a hostile next to you on the dock does not attack (a safe room)
    I.heal(); I.teleport(d.x, d.y); I.wait(0.4); const hp1 = I.hp().hp; const uid = I.spawn('fernraptor', d.x + 1, d.y); for (let k = 0; k < 20; k++) { I.step(0, 0, 0.25); I.nextTo(uid, 26); I.teleport(d.x, d.y); }
    out.safe = { hp: I.hp().hp, hp1, hurt: I.hurtLog().filter((x) => x.uid === uid).length };
    return out;
  });
  check('1: a dock heals to full within 3 s and says "Rested. Full health." once per visit', r1.full !== null && r1.full <= 3 && /Rested\. Full health\./.test(r1.toast) && r1.rests === 1, JSON.stringify(r1));
  check('1: away from danger: no regen for the first 5 s after a hit, then 1 HP per 1.5 s', r1.reg4 === 0 && r1.reg10 >= 3 && r1.reg10 <= 5 && r1.mode === 'regen', JSON.stringify({ reg4: r1.reg4, reg10: r1.reg10, mode: r1.mode, far: r1.far }));
  check('1: a rest spot is a safe room: a fernraptor next to you on the dock never lands a hit', r1.safe.hurt === 0 && r1.safe.hp === r1.safe.hp1, JSON.stringify(r1.safe));
  // boss: nothing heals while the fight is engaged
  const rb = await ev(J.page, (I) => {
    I.pause(true); I.clearCreatures(); I.heal(); I.god(false);
    if (!I.bossSpawn()) return { none: true };
    const b = I.boss(); I.place(b.site.px + 60, b.site.py + 60); I.wait(1.5);
    I.hurt(8); let hp = I.hp().hp, up = 0, eng = I.boss().engaged;
    for (let k = 0; k < 24 && !I.hero().dead; k++) { I.step(0, 0, 0.5); const n = I.hp().hp; if (n > hp && !I.hero().dead) up++; hp = n; eng = eng && I.boss().engaged; }
    return { up, eng, mode: I.rest().mode };
  });
  check('1: no rest and no regen while a boss fight is engaged', !rb.none && rb.eng && rb.up === 0, JSON.stringify(rb));

  const J0 = await open(browser, DESK, '&isle=jungle&seed=123&rest=0');
  const r0 = await ev(J0.page, (I) => { I.pause(true); I.clearCreatures(); const d = I.dock(); I.teleport(d.x, d.y); I.wait(0.5); I.hurt(6); const a = I.hp().hp; I.wait(12); return { a, b: I.hp().hp }; });
  check('1: ?rest=0 turns rest and regen off (HP only heals on a respawn, as before)', r0.a === r0.b && r0.a < 22, JSON.stringify(r0));
  await J0.ctx.close();

  // ---- 4. the jungle vine rope ----
  const J2 = await open(browser, PHONE, '&isle=jungle&seed=123');
  const vj = await ev(J2.page, (I) => { I.pause(true); I.clearCreatures(); const d = I.dock(); const v = I.foodGlints().filter((g) => g.kind === 'vine_rope'); const s = I.world.spawnPoint; I.teleport(s.x, s.y); I.step(0, 0, 0.1);
    return { v, d, hint: I.hint(), nodes: I.nodes().filter((n) => n.kind === 'vine_rope' && v.some((g) => g.x === n.x && g.y === n.y)).length }; });
  check('4: three labelled vine rope glints within 15 tiles of the jungle dock (walk-over nodes)', vj.v.length === 3 && vj.nodes === 3 && vj.v.every((g) => g.label === 'vine rope' && Math.abs(g.x - vj.d.x) <= 15 && Math.abs(g.y - vj.d.y) <= 15), JSON.stringify(vj));
  check('4: the hint names where vine rope grows (with a direction)', /Vine rope .*ferns by the dock.*(north|south|east|west)/.test(vj.hint), vj.hint);
  const vp = await ev(J2.page, (I) => { const v = I.foodGlints().find((g) => g.kind === 'vine_rope'); I.teleport(v.x, v.y); I.step(0, 0, 0.05); return I.inv().vine_rope | 0; });
  check('4: walking over a vine rope glint picks one up', vp === 1, String(vp));
  await J2.page.tap('#btn-pack'); await J2.page.tap('#btn-craft'); await J2.page.waitForFunction(() => !document.getElementById('panel').hidden);
  const cp = await J2.page.evaluate(() => { const row = document.querySelector('#panel-body .recipe[data-recipe="raft"]'); const w = row && row.querySelector('.rc-where'); const notes = Array.from(document.querySelectorAll('#panel-body .rc-note')).filter((e) => e.getBoundingClientRect().width > 0);
    return { where: w ? w.textContent : '', fs: notes.map((e) => parseFloat(getComputedStyle(e).fontSize)), n: notes.length }; });
  check('4: the Craft panel raft row says where the vine rope grows', /vine rope grows on the Verdant Jungle ferns by the dock/.test(cp.where), cp.where);
  check('6: every visible .rc-note is 12 px', cp.n > 0 && cp.fs.every((f) => f >= 12), JSON.stringify(cp.fs));
  await J2.page.tap('#panel-close');
  const sc = await ev(J2.page, (I) => { I.openPanel('sail'); const w = document.querySelector('#panel-body .dest-where[data-isle="reef"]'); const t = w ? w.textContent : ''; I.closePanel(); return t; });
  check('4: the sea chart reef row says where the raft inputs are found', /vine rope grows/.test(sc), sc);

  // ---- 2. a pouch per island, and feeding from the bag ----
  const pz = {};
  for (const isle of ['home', 'reef', 'ice', 'mars']) { const o = await open(browser, DESK, '&isle=' + isle + '&seed=123'); pz[isle] = await ev(o.page, (I) => I.pouch()); await o.ctx.close(); }
  const pc = await open(browser, DESK, '&isle=home&seed=123&pouch=classic'); pz.classic = await ev(pc.page, (I) => I.pouch());
  check('2: home pouch has clover + apple, reef kelp + fish, tundra fish + frostberry, mars oxide dust + greenhouse potato (plus the jungle pouch)',
    pz.home.clover > 0 && pz.home.apple > 0 && pz.reef.kelp > 0 && pz.reef.fish > 0 && pz.ice.fish > 0 && pz.ice.frostberry > 0 && pz.mars.oxide_dust > 0 && pz.mars.greenhouse_potato > 0 &&
    ['home', 'reef', 'ice', 'mars'].every((k) => pz[k].jungle_berry === 12 && pz[k].raw_meat === 12 && pz[k].bug === 8), JSON.stringify(pz));
  check('2: ?pouch=classic is the old jungle pouch', JSON.stringify(pz.classic) === JSON.stringify({ jungle_berry: 12, raw_meat: 12, bug: 8 }), JSON.stringify(pz.classic));
  const nf = await ev(pc.page, (I, B) => { const c = (0, eval)(B)(I, 'puffwool'); const r = I.feed(); return { calm: !!(c && c.calm), r, toast: document.getElementById('toast').textContent }; }, BEFRIEND);
  check('2: with nothing to feed, the toast names where the food grows', nf.calm && nf.r.why === 'nofood' && /Puffwool wants clover\. You have none yet: clover grows as glints/.test(nf.toast), JSON.stringify(nf));
  // mars: the rustbeetle eats iron, which is only in the bag; the o2 tank (none yet) keeps 3 iron back
  const M = await open(browser, DESK, '&isle=mars&seed=123');
  const mf = await ev(M.page, (I, B) => {
    I.god(true); I.give('iron', 4); const out = { reserve: I.reserve() };
    const c = (0, eval)(B)(I, 'rustbeetle'); out.calm = !!(c && c.calm); out.pick = I.foodFor('rustbeetle');
    out.r1 = I.feed(); out.t1 = document.getElementById('toast').textContent; out.inv1 = I.inv().iron | 0;
    I.wait(9); const c2 = I.creatures()[0]; if (c2) I.nextTo(c2.uid, 30);
    out.r2 = I.feed(); out.t2 = document.getElementById('toast').textContent; out.inv2 = I.inv().iron | 0;
    return out;
  }, BEFRIEND);
  check('2: feeding draws from the bag when the pouch has none ("Used 1 iron from your bag")', mf.calm && mf.pick.from === 'inv' && mf.r1.ok && mf.inv1 === 3 && /Used 1 iron from your bag \(3 left\)/.test(mf.t1), JSON.stringify(mf));
  check('2: never below what a recipe still needs: the last 3 iron (o2 tank) are kept, with a calm toast', mf.reserve.iron === 3 && !mf.r2.ok && mf.r2.kept === 'iron' && mf.inv2 === 3 && /kept for a travel craft/.test(mf.t2) && !/!/.test(mf.t2), JSON.stringify({ r2: mf.r2, t2: mf.t2, inv2: mf.inv2 }));
  // mars air at 0: creature hits are halved and the hint names the nearest dome with an arrow
  const ma = await ev(M.page, (I) => {
    I.pause(true); I.clearCreatures(); I.god(false); I.heal();
    const ex = I.findEnvTile(false); I.teleport(ex.x, ex.y); I.envSet(0, 0); I.step(0, 0, 0.2);
    const a0 = I.hp().hp; I.hurt(4); const full = a0 - I.hp().hp;
    I.heal(); I.envSet(0, 200); I.step(0, 0, 0.2); const e = I.env(); const b0 = I.hp().hp; I.hurt(4); const empty = b0 - I.hp().hp;
    return { full, empty, o2: e.o2, hint: I.hint() };
  });
  check('1: out of air, creature hits are halved (4 -> 2) and the hint names the nearest dome with an arrow', ma.full === 4 && ma.empty === 2 && ma.o2.empty && /Out of air .*head [←-↙] [a-z-]+ to the nearest dome, \d+ tiles\./.test(ma.hint), JSON.stringify(ma));

  // ---- 2b. home feeding (phone + desktop screens) ----
  for (const [label, opts] of [['phone', PHONE], ['desk', DESK]]) {
    const H = await open(browser, opts, '&isle=home&seed=123');
    const hf = await ev(H.page, (I, B) => { I.god(true); const c = (0, eval)(B)(I, 'thistle_boar'); const p0 = I.pouch().apple; const r = I.feed(); return { calm: !!(c && c.calm), ok: r.ok, apple: [p0, I.pouch().apple], hint: I.hint() }; }, BEFRIEND);
    check(`2 (${label}): on Hearth Isle a calm Thistle Boar eats an apple from the home pouch`, hf.calm && hf.ok && hf.apple[1] === hf.apple[0] - 1 && /feed it apple x3/.test(hf.hint), JSON.stringify(hf));
    await ev(H.page, (I) => { I.pause(false); return true; }); await frames(H.page, 12); await ev(H.page, (I) => { I.pause(true); return true; });
    const lay = await H.page.evaluate(() => ({ hs: document.documentElement.scrollWidth > innerWidth, hint: (document.getElementById('hint') || {}).textContent || '' }));
    check(`2 (${label}): the feeding screen has no horizontal scroll`, !lay.hs, JSON.stringify(lay));
    await shot(H.page, 'isles-if1-home-feed-' + label);
    await H.ctx.close();
  }

  // ---- 6. a tundra tame (pengling, fed fish from the tundra pouch) + journal + sparkle ----
  for (const [label, opts] of [['phone', PHONE], ['desk', DESK]]) {
    const T = await open(browser, opts, '&isle=ice&seed=123');
    const tt = await ev(T.page, (I, B) => {
      I.god(true); const ev0 = I.events().length; const c = (0, eval)(B)(I, 'pengling'); const out = { calm: !!(c && c.calm), spot: I.events().slice(ev0).some((e) => e.kind === 'spot'), toastSeen: '' };
      let tamed = false, n = 0;
      for (let k = 0; k < 20 && !tamed; k++) { const r = I.feed(); if (r.ok) n++; if (r.tamed) tamed = true; else { I.wait(6.2); const q = I.creatures()[0]; if (q) I.nextTo(q.uid, 30); } }
      out.tamed = tamed; out.feeds = n; out.fish = I.pouch().fish; out.roster = I.tamesLive().roster.map((r) => r.sp);
      return out;
    }, BEFRIEND);
    check(`6 (${label}): the first tundra tame: a pengling fed fish from the tundra pouch`, tt.calm && tt.tamed && tt.roster.indexOf('pengling') >= 0 && tt.fish >= 0 && tt.fish < 10, JSON.stringify(tt));
    if (label === 'phone') check('6: the first sighting of a species is a journal entry (event spot)', tt.spot, JSON.stringify(tt));
    await ev(T.page, (I) => { I.pause(false); return true; }); await frames(T.page, 12); await ev(T.page, (I) => { I.pause(true); return true; });
    await shot(T.page, 'isles-if1-tundra-tame-' + label);
    if (label === 'phone') {
      const sp = await ev(T.page, (I) => {
        I.pause(true); I.clearCreatures(); I.god(true); const s = I.world.spawnPoint; I.teleport(s.x, s.y);
        const out = { before: I.sparkle() }; I.wait(30); out.at30 = I.sparkle(); I.wait(11); out.at41 = I.sparkle(); const h = I.hero(); out.d = out.at41 ? Math.hypot(out.at41.x - h.tx, out.at41.y - h.ty) : null;
        const inv0 = JSON.stringify(I.inv()); if (out.at41) { I.teleport(out.at41.x, out.at41.y); I.step(0, 0, 0.05); }
        out.after = I.sparkle(); out.inv = [inv0, JSON.stringify(I.inv())]; out.count = I.sparkles(); out.save = I.save(); out.bytes = JSON.stringify(out.save).length; out.raw = (localStorage.getItem('pixeltown-archipelago-v1') || '').length;
        return out;
      });
      check('6: no forage sparkle before 40 s without a reward; one appears within 10 tiles after it', !sp.before && !sp.at30 && !!sp.at41 && sp.at41.ready && sp.d <= 10, JSON.stringify([sp.at30, sp.at41, sp.d]));
      check('6: walking over the sparkle picks it up into the pack and counts it for today (save.spark)', sp.after && !sp.after.ready && sp.inv[0] !== sp.inv[1] && sp.count === 1 && sp.save.spark && sp.save.spark.n.ice === 1, JSON.stringify({ after: sp.after, inv: sp.inv, spark: sp.save.spark }));
      check('6: the archipelago save stays well under the 20 KB cap', sp.raw > 0 && sp.raw < 20000 && sp.bytes < 20000, String(sp.raw));
    }
    await T.ctx.close();
  }

  // ---- 5. a locked island by URL ----
  const U = await open(browser, PHONE, '&isle=reef', {}, true);
  await U.page.waitForTimeout(400);
  const ul = await U.page.evaluate((k) => ({ medals: JSON.parse(localStorage.getItem(k[1]) || '{}'), save: JSON.parse(localStorage.getItem(k[0]) || 'null'), url: location.search, toast: document.getElementById('toast').textContent, test: !!window.__isles }), [KEY, MEDALS]);
  const medals = (ul.medals && ul.medals.m) || [];
  check('5: ?isle=reef without a raft lands at the home dock, with a calm toast, and no Coral Reef medal', !ul.test && medals.indexOf('visit_reef') < 0 && medals.indexOf('visit_home') >= 0 && /isle=meadow/.test(ul.url) && /at=dock/.test(ul.url) && /Coral Reef opens with a raft/.test(ul.toast) &&
    !(ul.save && (ul.save.visited || []).indexOf('reef') >= 0), JSON.stringify({ medals, url: ul.url, toast: ul.toast, visited: ul.save && ul.save.visited }));
  const U2 = await open(browser, PHONE, '&isle=mars', { [KEY]: JSON.stringify({ v: 1, at: 'home', unlock: ['jungle', 'mars'], isles: {}, visited: ['home'] }) }, true);
  await U2.page.waitForTimeout(400);
  const u2 = await U2.page.evaluate((k) => ({ medals: (JSON.parse(localStorage.getItem(k[1]) || '{}').m) || [], url: location.search }), [KEY, MEDALS]);
  check('5: an unlocked island (mars in unlock) still opens by URL and earns its visit medal', u2.medals.indexOf('visit_mars') >= 0 && /isle=mars/.test(u2.url), JSON.stringify(u2));

  check('all: 0 console errors and 0 DB requests', all.every((o) => o.errors.length === 0 && o.db.count() === 0), all.map((o) => o.errors.join(' | ')).filter(Boolean).join(' / '));
  for (const o of all) await o.ctx.close().catch(() => {});
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
