// Regression tests for REVIEW-GEAR-SAVES.md (gear save / merge / economy review). One block per finding:
//  F1 a failed save write no longer deletes the item just picked up (bookkeeping = what storage really holds; failures are observable)
//  F7 a resync without a write keeps an unsaved in-memory shard delta
//  F2 a dungeon gear drop is ONE item with its tier from the start (no T0 copy in the pack, the stash find carries t)
//  F3 the GW gate (forge + sig drops: default ON since P2, ?forge=0 off) and the downgrade hint watching `dust` / `f`
//  F4 combine gives the survivor a fresh uid; the Town arena starts from the CURRENT stored realm (no duplicate from a stale copy)
//  F5 the forge never offers an affix the item already has (the signature is passed through)
//  F6 a forged affix stays inside the weapon power cap; F8 a merge cut to 24 never drops T12s before lower items; F10 no hint after a salvage
// Offline: blockDb + every WebSocket closed (the Town page joins with "Play offline"), no chat, nothing written to Firebase.
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/gear-save-fixes.test.js
const { chromium } = require('playwright');
const { check, done, blockDb, offlineStub } = require('./helpers'); // blockDb: DB hosts aborted / closed (the Town page tries to connect, nothing reaches it)
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const ORIGIN = BASE.replace(/\/game\/index\.html.*$/, '');
const MAZE = ORIGIN + '/game/games/mad-maze/index.html?test=1&offline=1';
const WURL = (q) => ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&seed=12345' + (q || '');
const DURL = (q) => `${ORIGIN}/game/games/mad-maze/index.html?mode=dungeon&test=1&difficulty=off&lv=2&${q}`;
const SAVE = 'pixeltown-save-v1', MM = 'pixeltown-mm-v1', ACTIVE = 'pixeltown-mm-active-v1', HINT = 'pixeltown-gearhint-v1';
const hero = (id, cls, level) => ({ id, name: cls, cls, level, xp: 0, fame: 0, bonus: 0, mode: 'classic', items: [] });
const prof = (heroes) => ({ v: 1, heroes, stash: new Array(16).fill(null), fame: 0, mode: 'classic', hall: [], migratedFrom: null });
const realm = (extra) => Object.assign({ shards: 100, bestWave: 0, kills: 0, deaths: 0, kb: { spiral: 0, aimed: 0, ring: 0, drifter: 0, boss: 0 }, bossBestT: 0, level: 20, xp: 0,
  items: [{ n: 1, id: 'heartcharm', r: 0 }], nextUid: 10, eq: {} }, extra || {});
const MMGearAffix = require('../shared/mm-gear-affix.js');
const MMGearForge = require('../shared/mm-gear-forge.js');

async function ctxOf(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  const db = await blockDb(ctx);
  await ctx.route('**/game/index.html*', (r) => (/games\/mad-maze/.test(r.request().url()) ? r.continue() : r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' })));
  await ctx.route('**/hub/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>hub</title>hub' }));
  await ctx.routeWebSocket(/.*/, (ws) => ws.close()); // never reach the live DB
  return { ctx, db };
}
async function openMM(browser, url, rm, extra, wait) {
  const { ctx, db } = await ctxOf(browser);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate((a) => { localStorage.clear(); localStorage.setItem(a.k1, a.p); localStorage.setItem(a.k2, a.a); if (a.s) localStorage.setItem(a.k3, a.s); localStorage.setItem('mm-aim-assist', '0'); Object.keys(a.x).forEach((k) => localStorage.setItem(k, a.x[k])); },
    { k1: MM, p: JSON.stringify(prof([hero('h-1', 'bruiser', 20)])), k2: ACTIVE, a: JSON.stringify({ v: 1, heroId: 'h-1' }), k3: SAVE, s: rm ? JSON.stringify({ realm: rm }) : null, x: extra || {} });
  await page.goto(url);
  await page.waitForFunction(wait || (() => window.__mm && window.__mm.arena && window.__mm.arena.active), null, { timeout: 20000 });
  return { ctx, db, page, errors };
}
const calm = (page) => page.evaluate(() => { const a = window.__mm.arena; a.state = 'play'; a.eBullets.forEach((b) => { b.active = false; }); a.enemies.forEach((e) => { e.active = false; }); a.player.iframes = 1e9; a._hitPlayer = () => {}; });
const stored = (page) => page.evaluate((k) => { try { return JSON.parse(localStorage.getItem(k)).realm; } catch (e) { return null; } }, SAVE);

(async () => {
  const browser = await chromium.launch();
  const errs = [];

  // ================= F5 (pure): forge options never intersect the item's real roll (signature included) =================
  { let bad = 0, total = 0, sample = '';
    const SIGS = ['blast', 'venom', 'leech', 'pierce'];
    for (let a = 1; a <= 3000; a++) for (const sig of SIGS) {
      const item = { n: 1, id: 'sparkwand', r: 2, t: 12, a, sig };
      const rolled = MMGearAffix.roll('sparkwand', 'weapon', 12, 2, a, sig).map((e) => e.id);
      const opts = MMGearForge.reforgeOptions(item) || [];
      total++;
      if (opts.some((o) => rolled.indexOf(o.id) >= 0)) { bad++; if (!sample) sample = JSON.stringify({ a, sig, rolled, opts: opts.map((o) => o.id) }); }
    }
    check(`F5: T12 signature weapons (3000 seeds x 4 signatures): the forge never offers an affix the item already rolled (${bad} / ${total})`, bad === 0 && total === 12000, sample);
    const a1 = MMGearAffix.roll('sparkwand', 'weapon', 12, 0, 1, 'leech').map((e) => e.id);
    const o1 = (MMGearForge.reforgeOptions({ n: 1, id: 'sparkwand', r: 0, t: 12, a: 1, sig: 'leech' }) || []).map((o) => o.id);
    check('F5: the review case (a=1, sig leech) rolls venom and the forge no longer offers venom or leech', a1.indexOf('venom') >= 0 && o1.indexOf('venom') < 0 && o1.indexOf('leech') < 0 && o1.length > 0, JSON.stringify({ a1, o1 }));
    const rf = MMGearForge.reforge({ n: 4, id: 'sparkwand', r: 0, t: 12, a: 1, sig: 'leech' }, o1[0]);
    check('F5: MMGearForge.reforge keeps the signature on the new item', rf && rf.sig === 'leech' && rf.f.id === o1[0], JSON.stringify(rf));
  }

  // ================= Mad Maze arena page: F1, F7, F4 combine, F8, F5 / F6 in realm.js =================
  { const T9 = (n, a) => ({ n, id: 'sparkwand', r: 1, t: 9, a });
    const A = await openMM(browser, MAZE + '&forge=1', realm({ items: [{ n: 1, id: 'heartcharm', r: 0 }, T9(5, 11), T9(6, 12), T9(7, 13)], nextUid: 10, eq: { weapon: 5 } }));
    await calm(A.page);
    // F1: one failed write (quota) while picking an item up, then a normal write
    const f1 = await A.page.evaluate((K) => {
      const a = window.__mm.arena; const orig = Storage.prototype.setItem; let fail = 1;
      Storage.prototype.setItem = function (k, v) { if (fail && k === K) { fail = 0; throw new DOMException('quota', 'QuotaExceededError'); } return orig.call(this, k, v); };
      const before = a.saveFails;
      try { a.collectItem('sparkwand', 3); } finally { Storage.prototype.setItem = orig; }
      const it = a.save.items[a.save.items.length - 1];
      const r = { uid: it.n, afterPick: a.save.items.filter((x) => x.id === 'sparkwand' && x.r === 3).length, ok1: a.saveOk, fails: a.saveFails - before, knownHasNew: a._known.has(it.n),
        storedHas: JSON.parse(localStorage.getItem(K)).realm.items.some((x) => x.n === it.n) };
      a.save.shards += 1; r.ok2 = a.onSave(a.save); r.saveOk2 = a.saveOk;
      r.mem = a.save.items.filter((x) => x.id === 'sparkwand' && x.r === 3).length;
      r.stored = JSON.parse(localStorage.getItem(K)).realm.items.filter((x) => x.id === 'sparkwand' && x.r === 3).length;
      a.save.shards += 1; a.onSave(a.save); r.stored2 = JSON.parse(localStorage.getItem(K)).realm.items.filter((x) => x.id === 'sparkwand' && x.r === 3).length;
      return r;
    }, SAVE);
    check('F1: a failed write is observable (saveOk false, saveFails +1) and the new uid is NOT marked as known to storage', f1.afterPick === 1 && f1.ok1 === false && f1.fails === 1 && f1.knownHasNew === false && f1.storedHas === false, JSON.stringify(f1));
    check('F1: the next successful write keeps the item in memory AND writes it to storage (review repro: it used to be deleted from both)', f1.ok2 === true && f1.saveOk2 === true && f1.mem === 1 && f1.stored === 1 && f1.stored2 === 1, JSON.stringify(f1));
    // F7: an unsaved +40 shards in memory survives another tab's write (+5) and a resync before this tab persists
    const f7 = await A.page.evaluate((K) => {
      const a = window.__mm.arena; const s0 = JSON.parse(localStorage.getItem(K)).realm.shards;
      a.save.shards += 40; // not saved yet
      const full = JSON.parse(localStorage.getItem(K)); full.realm.shards = s0 + 5; localStorage.setItem(K, JSON.stringify(full)); // another tab
      a.resyncSave(); a.onSave(a.save);
      return { s0, mem: a.save.shards, st: JSON.parse(localStorage.getItem(K)).realm.shards };
    }, SAVE);
    check('F7: unsaved +40 here and +5 from another tab both survive a resync + persist (s0 + 45)', f7.st === f7.s0 + 45 && f7.mem === f7.s0 + 45, JSON.stringify(f7));
    // F4: combine gives the survivor a FRESH uid; a stale copy merged against storage then holds exactly one item
    const f4 = await A.page.evaluate((K) => {
      const a = window.__mm.arena; const stale = JSON.parse(JSON.stringify(a.save)); const staleKnown = new Set(stale.items.map((x) => x.n));
      const ok = a.combine(5); const w = a.save.items.filter((x) => x.id === 'sparkwand' && x.t === 9);
      const st = JSON.parse(localStorage.getItem(K)).realm;
      const m = rmMergeSave(stale, st, { known: staleKnown, base: stale.shards });
      return { ok, w: JSON.stringify(w), eq: a.save.eq.weapon, merged: JSON.stringify(m.items.filter((x) => x.id === 'sparkwand' && x.t === 9)) };
    }, SAVE);
    const w4 = JSON.parse(f4.w), m4 = JSON.parse(f4.merged);
    check('F4: combine replaces the survivor with a fresh uid one rarity up, keeping t / a and the equipped slot', f4.ok && w4.length === 1 && w4[0].r === 2 && w4[0].t === 9 && w4[0].a === 11 && [5, 6, 7].indexOf(w4[0].n) < 0 && f4.eq === w4[0].n, f4.w + ' eq ' + f4.eq);
    check('F4: a stale pre-combine copy merged against storage gives ONE r2 item (no r1 duplicate)', m4.length === 1 && m4[0].r === 2, f4.merged);
    // F8: a merge over 24 items drops the classic ones, never the T12s
    const f8 = await A.page.evaluate(() => {
      const base = []; for (let i = 1; i <= 22; i++) base.push({ n: i, id: 'heartcharm', r: 0 });
      const mine = { items: base.concat([{ n: 30, id: 'sparkwand', r: 0 }, { n: 31, id: 'sparkwand', r: 0 }]), nextUid: 40, eq: {} };
      const st = { items: base.concat([{ n: 50, id: 'sparkwand', r: 1, t: 12, a: 7 }, { n: 51, id: 'sparkwand', r: 0, t: 12, a: 8 }]), nextUid: 52, eq: {} };
      const m = rmMergeSave(mine, st, { known: new Set(base.map((x) => x.n)) });
      return { n: m.items.length, t12: m.items.filter((x) => x.t === 12).length, classicWands: m.items.filter((x) => x.id === 'sparkwand' && !x.t).length, order: m.items.slice(0, 3).map((x) => x.n).join() };
    });
    check('F8: merge cut to 24 keeps both T12s and drops the two classic wands (kept items stay in order)', f8.n === 24 && f8.t12 === 2 && f8.classicWands === 0 && f8.order === '1,2,3', JSON.stringify(f8));
    // F5 / F6 inside realm.js: a stacked forged affix is ignored; a forged affix is trimmed into the weapon power cap
    const f56 = await A.page.evaluate(() => {
      const a = window.__mm.arena; a._forC = null;
      const stacked = a._forgedOf({ n: 90, id: 'sparkwand', r: 0, t: 12, a: 1, sig: 'leech', f: { id: 'venom', v: 0.1 } });
      a.save.items.push({ n: 91, id: 'sparkwand', r: 0, t: 12, a: 1, sig: 'leech' });
      const opts = (a.reforgeOptions(91) || []).map((o) => o.id); const rolled = MMGearAffix.roll('sparkwand', 'weapon', 12, 0, 1, 'leech').map((e) => e.id);
      a.save.items.pop();
      const nominal = MMGearForge.reforgeOptions({ n: 1, id: 'sparkwand', r: 3, t: 12, a: 42 }).find((o) => o.id === 'keen').v;
      const roll = MMGearAffix.roll('sparkwand', 'weapon', 12, 3, 42);
      const fg = a._forgedOf({ n: 92, id: 'sparkwand', r: 3, t: 12, a: 42, f: { id: 'keen', v: nominal } });
      return { stacked, opts, rolled, nominal, fg, pNominal: MMGearAffix.value(roll.concat([{ id: 'keen', v: nominal }])), pNow: fg ? MMGearAffix.value(roll.concat([fg])) : MMGearAffix.value(roll), cap: MMGearAffix.cap(12) };
    });
    check('F5: realm ignores a forged affix the signature item already rolled (venom on a=1 / leech) and never offers one', f56.stacked === null && f56.opts.length > 0 && !f56.opts.some((o) => f56.rolled.indexOf(o) >= 0), JSON.stringify(f56));
    check('F6: a forged keen on T12 r3 a=42 is trimmed so the affix power product stays inside the cap (it was above it untrimmed)', f56.pNominal > f56.cap && f56.pNow <= f56.cap + 1e-9 && (!f56.fg || f56.fg.v < f56.nominal), JSON.stringify(f56));
    errs.push(...A.errors);
    check('arena page: no DB traffic (blockDb)', A.db.attempts() === 0);
    await A.ctx.close(); }

  // ================= F3: the GW gate. P2 flipped RM_FORGE_DEFAULT_ON to true (the keep-dust/f/sig deploy is on master): the default and ?forge=1
  // open it (forge on, T12 boss drops carry their signature); ?forge=0 is the kill switch (forge off, no new `sig` on any drop) =================
  for (const [q, open] of [['', true], ['&forge=1', true], ['&forge=0', false], ['&forge=1&forge=0', false]]) {
    const A = await openMM(browser, WURL(q), realm({ items: [{ n: 1, id: 'sparkwand', r: 0, t: 3 }] }), {}, () => window.__mm && window.__mm.world && window.__mm.arena.active);
    await calm(A.page);
    const g = await A.page.evaluate(() => {
      const a = window.__mm.arena; const w = window.__mm.world; const out = { def: RM_FORGE_DEFAULT_ON, gate: RM_FORGE_ON, forge: a.forgeOn(), sigs: 0, t12: 0 };
      // a forced T12 z3 boss bag: rollGear may give it a signature; the bag must not carry it while the gate is closed
      w.setDropAll(true);
      for (let i = 0; i < 40; i++) { a.bags.forEach((b) => { b.active = false; }); const got = w.testDrop({ zone: 3, tier: 3, boss: true, src: 'boss', bossId: 'void_maw' }, 'f3' + i); (got ? got.items : []).forEach((it) => { if (it.t === 12) out.t12++; if (it.sig) out.sigs++; }); a.bags.forEach((b) => { if (b.gear && b.gear.sig) out.sigs++; }); }
      w.setDropAll(false); return out;
    });
    if (open) check(`F3 (${q || 'default, no ?forge'}): the gate is open (default on), the forge is on and T12 boss drops carry their signature`, g.def === true && g.gate === true && g.forge === true && g.t12 > 0 && g.sigs > 0, JSON.stringify(g));
    else check(`F3 (${q}): ?forge=0 closes the gate: the forge is off and no world drop carries a \`sig\``, g.def === true && g.gate === false && g.forge === false && g.t12 > 0 && g.sigs === 0, JSON.stringify(g));
    errs.push(...A.errors); await A.ctx.close();
  }

  // ================= F3 + F10: the downgrade hint watches dust / f, and a normal salvage never trips it =================
  const hintNow = async (rm, hint) => {
    const A = await openMM(browser, WURL(''), rm, hint ? { [HINT]: JSON.stringify(hint) } : {}, () => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play');
    await A.page.waitForTimeout(300);
    const r = await A.page.evaluate(() => window.__mm.world.gearHint());
    errs.push(...A.errors); await A.ctx.close(); return r;
  };
  { const T5 = { n: 2, id: 'sparkwand', r: 0, t: 5 };
    const noDust = await hintNow(realm({ gv: 1, items: [T5] }), { n: 1, shown: 0, d: 1, f: 0 });
    check('F3 hint: a save that lost its `dust` key (remembered d:1) shows the old-tab note once', noDust.now === true, JSON.stringify(noDust));
    const noF = await hintNow(realm({ gv: 1, dust: 4, items: [{ n: 2, id: 'sparkwand', r: 0, t: 8, a: 5 }] }), { n: 1, shown: 0, d: 1, f: 1 });
    check('F3 hint: a save whose forged `f` vanished (remembered f:1) shows the note', noF.now === true, JSON.stringify(noF));
    const fine = await hintNow(realm({ gv: 1, dust: 0, items: [{ n: 2, id: 'sparkwand', r: 0, t: 8, a: 5, f: { id: 'reach', v: 0.05 } }] }), { n: 1, shown: 0, d: 1, f: 1 });
    check('F3 hint: dust spent to 0 (key kept) with the forged item present -> no note', fine.now === false && fine.d === 1 && fine.f === 1, JSON.stringify(fine));
  }
  { // F10: salvage the last tiered item in the world, reload: no "reset by an old tab" note
    const A = await openMM(browser, WURL('&forge=1'), realm({ gv: 1, items: [{ n: 1, id: 'heartcharm', r: 0 }, { n: 2, id: 'sparkwand', r: 0, t: 5 }] }), {}, () => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play');
    await A.page.waitForTimeout(300);
    const h0 = await A.page.evaluate((k) => JSON.parse(localStorage.getItem(k)), HINT);
    const sal = await A.page.evaluate(() => window.__mm.arena.salvage(2));
    const h1 = await A.page.evaluate((k) => JSON.parse(localStorage.getItem(k)), HINT);
    await A.page.reload();
    await A.page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 20000 });
    await A.page.waitForTimeout(300);
    const st = await A.page.evaluate(() => ({ hint: window.__mm.world.gearHint(), n: window.__mm.arena.save.items.length, gv: window.__mm.arena.save.gv, t: window.__mm.arena.save.items.some((x) => x.t) }));
    check('F10: the hint remembered 2 items, the salvage (+dust) lowered it to 1 itself', h0 && h0.n === 2 && sal > 0 && h1 && h1.n === 1, JSON.stringify({ h0, sal, h1 }));
    check('F10: after salvaging the last tiered item, the next visit (gv:1, no t, fewer items) shows no old-tab note', st.hint.now === false && st.n === 1 && st.gv === 1 && !st.t, JSON.stringify(st));
    errs.push(...A.errors); await A.ctx.close(); }

  // ================= F2: a dungeon boss run: one pack item per drop, each with its tier from the first write =================
  { const A = await openMM(browser, DURL('biome=crypt&seed=3&gear=1'), null, {}, () => window.__mm && window.__mm.dungeon && window.__mm.dungeon.room !== null);
    await A.page.evaluate(() => {
      window.__mm.arena._hitPlayer = () => {};
      const a = window.__mm.arena; const orig = a.collectItem.bind(a); window.__adds = 0; window.__t0 = [];
      a.collectItem = (id, r, g) => { const n0 = a.save.items.length; orig(id, r, g); if (a.save.items.length > n0) { window.__adds++; const it = a.save.items[a.save.items.length - 1]; if (g && !it.t) window.__t0.push(it.n); } };
      const so = a.onSave; window.__writes = []; a.onSave = (sv) => { const r = so(sv); const st = JSON.parse(localStorage.getItem('pixeltown-save-v1')).realm; window.__writes.push(st.items.filter((x) => x.id === 'sparkwand' || /^arm_/.test(x.id)).map((x) => x.n + ':' + (x.t || 0)).join(',')); return r; };
      window.__n0 = a.save.items.length;
      window.__walk = (target) => {
        const d = window.__mm.dungeon; const g = d.graph;
        const nbrs = (id) => g.doors.filter((x) => (!x.cracked || d.state.secretOpen) && (x.a === id || x.b === id) && !x.locked).map((x) => (x.a === id ? x.b : x.a));
        const prev = { [d.room]: null }; const q = [d.room];
        while (q.length) { const u = q.shift(); if (u === target) break; nbrs(u).forEach((v) => { if (!(v in prev)) { prev[v] = u; q.push(v); } }); }
        const path = []; for (let u = target; u !== null && u !== undefined; u = prev[u]) path.unshift(u);
        for (let i = 1; i < path.length; i++) { if (d.state.room(d.room).enemiesAlive > 0 && g.rooms[d.room].type !== 'boss') d.clearRoom(); const r = d.enter(path[i]); if (!r.ok) return 'blocked'; }
        return d.room;
      };
    });
    await A.page.evaluate(() => window.__walk(window.__mm.dungeon.graph.bossRoomId));
    await A.page.waitForTimeout(200);
    for (let i = 0; i < 40; i++) {
      const dead = await A.page.evaluate(() => { const d = window.__mm.dungeon; if (d.state.boss.dead) return true; const e = d.boss(); if (e) window.__mm.arena._hitEnemy(e, 200); return false; });
      if (dead) break; await A.page.waitForTimeout(350);
    }
    await A.page.waitForTimeout(300);
    const r = await A.page.evaluate(() => {
      const d = window.__mm.dungeon; const a = window.__mm.arena; const st = JSON.parse(localStorage.getItem('pixeltown-save-v1')).realm;
      const finds = window.MMStash ? MMStash.readFinds(localStorage).pending : [];
      const gearKept = d.gear.filter((g) => !g.sold);
      const packT = a.save.items.filter((x) => x.t);
      return { dead: d.state.boss.dead, gear: gearKept.map((g) => g.id + ':' + g.t), adds: window.__adds, n0: window.__n0, n: a.save.items.length, stored: st.items.length, t0: window.__t0,
        packT: packT.map((x) => x.n + ':' + x.id + ':' + x.t), findsT: packT.map((x) => { const f = finds.find((p) => p.n === x.n); return f ? f.t || 0 : -1; }),
        everT0: window.__writes.some((w) => w.split(',').some((e) => /:0$/.test(e) && packT.some((x) => e.indexOf(x.n + ':') === 0))) };
    });
    check('F2: the crypt boss run drops tiered gear', r.dead && r.gear.length >= 1 && r.packT.length >= r.gear.length, JSON.stringify(r));
    check('F2: the pack grows by exactly one entry per pickup (no T0 duplicate of a gear drop), in memory and in storage', r.n - r.n0 === r.adds && r.stored === r.n && r.t0.length === 0, JSON.stringify(r));
    check('F2: no write ever stored a tiered drop as T0, and every stash find of a tiered item carries its tier (soulbound check sees it)', !r.everT0 && r.findsT.every((t, i) => t === Number(r.packT[i].split(':')[2])), JSON.stringify(r));
    errs.push(...A.errors); await A.ctx.close(); }

  // ================= F4 (Town): the classic Realm gate starts from the CURRENT stored realm, not the scene's load-time copy =================
  { const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
    const db = await offlineStub(ctx);
    const page = await ctx.newPage(); const terr = [];
    page.on('pageerror', (e) => terr.push('pageerror: ' + e.message));
    await page.route('**/main.js*', async (route) => { const resp = await route.fetch(); const body = (await resp.text()).replace('const game = new Phaser.Game(config);', 'const game = window.__g = new Phaser.Game(config);'); route.fulfill({ response: resp, body }); });
    const T9 = (n, a, r) => ({ n, id: 'sparkwand', r: r === undefined ? 1 : r, t: 9, a });
    await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
    await page.evaluate((s) => { localStorage.clear(); localStorage.setItem('pixeltown-save-v1', JSON.stringify(s)); }, { realm: realm({ items: [T9(5, 11), T9(6, 12), T9(7, 13)], nextUid: 8, eq: { weapon: 5 } }) });
    await page.goto(BASE);
    await page.fill('#name-input', 'ADMINgearfix');
    await page.click('.species-tab'); await page.click('.avatar-choice');
    await page.click('button:has-text("Join Town")');
    await page.waitForSelector('#join-offline-btn:visible', { timeout: 12000 });
    await page.click('#join-offline-btn');
    await page.waitForFunction(() => window.__g && window.__g.scene.getScene('Town') && window.__g.scene.getScene('Town').localBody, null, { timeout: 20000 });
    // the Mad Maze embed (an in-place combine, as the pre-fix build wrote it) changes storage after the Town scene captured its copy
    await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('pixeltown-save-v1')); s.realm.items = [{ n: 5, id: 'sparkwand', r: 2, t: 9, a: 11 }]; localStorage.setItem('pixeltown-save-v1', JSON.stringify(s)); });
    const t = await page.evaluate(() => {
      const s = window.__g.scene.getScene('Town'); s.enterRealm(); const r = s.realm; r.stop();
      const mem0 = r.save.items.map((x) => x.n + ':r' + x.r).join(',');
      r.onSave(r.save); const st = JSON.parse(localStorage.getItem('pixeltown-save-v1')).realm;
      s.exitRealm();
      return { mem0, stored: st.items.filter((x) => x.id === 'sparkwand').map((x) => x.n + ':r' + x.r).join(','), offline: s.net && s.net.offline === true };
    });
    check('F4 Town: the gate arena starts from the current stored realm and its first write keeps ONE r2 item (no r1 duplicate)', t.mem0 === '5:r2' && t.stored === '5:r2', JSON.stringify(t));
    check('F4 Town: played offline, no database request was even attempted (offline stub)', t.offline && db.attempts() === 0, JSON.stringify({ http: db.http.length, ws: db.ws.length }));
    errs.push(...terr); await ctx.close(); }

  check('no page errors', errs.length === 0, JSON.stringify(errs.slice(0, 6)));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
