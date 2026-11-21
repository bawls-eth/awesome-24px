// G10 gear drops in dungeons: room clears, chests and the boss roll MMGearDrops.rollGear ({src: 'dungeon' | 'dboss', biome}); gp.d pity; separate seeded streams.
// Gear is ON by default (GEAR_DEFAULT_ON = true since G7 shipped); ?gear=1 forces it on, ?gear=0 always disables.
// Serve the repo root, then:  BASE=http://localhost:8703/game/index.html NODE_PATH=$(npm root -g) node game/tests/gear-dungeon-drops.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const URL = (q) => `${ORIGIN}/game/games/mad-maze/index.html?mode=dungeon&test=1&difficulty=off&lv=2&${q}`;
const GD = require('../shared/mm-gear-drops.js');

async function open(browser, q, ctxOpts) {
  const ctx = await browser.newContext(ctxOpts || { viewport: { width: 1100, height: 700 } });
  const page = await ctx.newPage(); page.errors = [];
  page.on('pageerror', (e) => page.errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push('console: ' + m.text()); });
  await page.goto(URL(q));
  await page.waitForFunction(() => window.__mm && window.__mm.dungeon && window.__mm.dungeon.room !== null);
  await page.evaluate(() => {
    window.__mm.arena._hitPlayer = () => {};
    window.__walk = (target, locked) => {
      const d = window.__mm.dungeon; const g = d.graph;
      const nbrs = (id) => g.doors.filter((x) => (!x.cracked || d.state.secretOpen) && (x.a === id || x.b === id) && (locked || !x.locked)).map((x) => (x.a === id ? x.b : x.a));
      const prev = { [d.room]: null }; const q = [d.room];
      while (q.length) { const u = q.shift(); if (u === target) break; nbrs(u).forEach((v) => { if (!(v in prev)) { prev[v] = u; q.push(v); } }); }
      const path = []; for (let u = target; u !== null && u !== undefined; u = prev[u]) path.unshift(u);
      for (let i = 1; i < path.length; i++) {
        if (d.state.room(d.room).enemiesAlive > 0 && g.rooms[d.room].type !== 'boss') d.clearRoom();
        const r = d.enter(path[i]); if (!r.ok) return 'blocked at ' + path[i] + ': ' + r.reason;
      }
      return d.room;
    };
  });
  return { ctx, page };
}
const ev = (p, fn, arg) => p.evaluate(fn, arg);

// Walk to the boss (clearing the rooms on the way), kill it, return what dropped. `gp` presets arena.save.gp.
async function runToBoss(browser, q, gp) {
  const r = await open(browser, q); const p = r.page;
  if (gp) await ev(p, (g) => { window.__mm.arena.save.gp = g; window.__mm.dungeon.gp(); }, gp); // gp() syncs the pity mirror before room clears re-save the arena
  const walked = await ev(p, () => window.__walk(window.__mm.dungeon.graph.bossRoomId));
  await p.waitForTimeout(200);
  for (let i = 0; i < 40; i++) {
    const dead = await ev(p, () => { const d = window.__mm.dungeon; if (d.state.boss.dead) return true; const e = d.boss(); if (e) window.__mm.arena._hitEnemy(e, 200); return false; });
    if (dead) break; await p.waitForTimeout(350);
  }
  await p.waitForTimeout(300);
  const data = await ev(p, () => {
    const d = window.__mm.dungeon; const a = window.__mm.arena;
    return {
      on: d.gearOn, gear: d.gear.map((g) => ({ id: g.id, r: g.r, t: g.t, a: g.a, slot: g.slot, name: g.name })), gp: d.gp(), saveGp: a.save.gp || null, gpLive: d.gp(),
      granted: d.granted.map((g) => [g.id, g.rarity, g.name]), bags: a.bags.filter((b) => b.active).map((b) => [b.id, b.r]),
      itemsT: a.save.items.filter((x) => x.t).map((x) => [x.id, x.r, x.t, x.a || 0]), dead: d.state.boss.dead, portal: d.portalPos(), picks: d.pickStats().total,
    };
  });
  return { r, p, data, walked };
}

(async () => {
  const browser = await chromium.launch();
  const errs = [];
  const bossT = (biome) => GD.table({ src: 'dboss', biome }).map((e) => e.t);
  const roomT = (biome) => GD.table({ src: 'dungeon', biome }).map((e) => e.t);

  // ---- default on (same drops as ?gear=1), ?gear=0 off ----
  const def = await runToBoss(browser, 'biome=warren&seed=11'); errs.push(...def.p.errors);
  const off = await runToBoss(browser, 'biome=warren&seed=11&gear=0'); errs.push(...off.p.errors);
  const forced = await runToBoss(browser, 'biome=warren&seed=11&gear=1'); errs.push(...forced.p.errors);
  check('gear is on by default (GEAR_DEFAULT_ON = true): the warren boss yields its T4 item and the pack carries t', def.data.dead && def.data.on === true && def.data.gear.some((g) => g.t === 4) && def.data.itemsT.length >= 1 && def.data.itemsT.every((x) => x[2] >= 2 && x[2] <= 4), JSON.stringify(def.data.gear));
  check('the default run drops exactly what ?gear=1 drops (same seed, same stream)', JSON.stringify(def.data.gear) === JSON.stringify(forced.data.gear) && JSON.stringify(def.data.itemsT) === JSON.stringify(forced.data.itemsT), JSON.stringify(forced.data.gear));
  check('?gear=0 is the kill switch: no gear, no t on any item, never writes a gp key', off.data.dead && off.data.on === false && off.data.gear.length === 0 && off.data.itemsT.length === 0 && off.data.saveGp === null, JSON.stringify(off.data));
  check('old seed (warren 11): the classic boss bags and granted loot match between the default and ?gear=0', JSON.stringify([def.data.granted, def.data.bags.length, def.data.picks]) === JSON.stringify([off.data.granted, off.data.bags.length, off.data.picks]), JSON.stringify({ def: [def.data.granted, def.data.bags, def.data.picks], off: [off.data.granted, off.data.bags, off.data.picks] }));
  await def.r.ctx.close(); await off.r.ctx.close(); await forced.r.ctx.close();

  // ---- warren boss: a tiered item within the table (T4), rooms within T2-3 ----
  const w1 = await runToBoss(browser, 'biome=warren&seed=11&gear=1'); errs.push(...w1.p.errors);
  const hasBossT4 = w1.data.gear.some((g) => g.t === 4);
  check('warren run with ?gear=1: the boss yields a tiered item at T4 (the warren boss table)', w1.data.dead && w1.data.on === true && hasBossT4 && bossT('warren').join() === '4', JSON.stringify(w1.data.gear));
  check('every warren gear drop is within its table (boss T4, room clears T2-3) and carries quality 0-3', w1.data.gear.length >= 1 && w1.data.gear.every((g) => (g.t === 4 || roomT('warren').includes(g.t)) && g.r >= 0 && g.r <= 3 && Number.isInteger(g.a === 0 ? 1 : g.a)), JSON.stringify(w1.data.gear));
  check('the item is in the pack with t on the save entry and a tier name ("T4 ...")', w1.data.itemsT.every((x) => x[2] >= 2 && x[2] <= 4) && w1.data.gear.every((g) => /^T\d+ \S/.test(g.name)), JSON.stringify({ it: w1.data.itemsT, g: w1.data.gear.map((g) => g.name) }));
  // ---- summary text ----
  await ev(w1.p, (q) => { const ar = window.__mm.arena; ar.player.x = q.x; ar.player.y = q.y; }, w1.data.portal);
  await w1.p.waitForTimeout(600);
  const sum = await ev(w1.p, () => { const lis = Array.from(document.querySelectorAll('#mm-sum-loot li')); return { shown: !document.getElementById('mm-summary').classList.contains('hidden'), gear: lis.filter((l) => l.classList.contains('mm-sum-gear')).map((l) => l.textContent), kids: lis.filter((l) => l.classList.contains('mm-sum-gear')).every((l) => l.children.length === 1 && l.firstElementChild.tagName === 'SMALL'), n: lis.length }; });
  check('the summary lists the tiered items as "T4 Name" text (textContent, only a <small> child)', sum.shown && sum.gear.length === w1.data.gear.length && sum.gear.every((t) => /^T\d+ .+/.test(t)) && sum.gear.some((t) => /^T4 /.test(t)) && sum.kids, JSON.stringify(sum));
  check('a warren boss never forces crypt pity: gp reads back as {b:0, d:0}', !!w1.data.gpLive && w1.data.gpLive.d === 0 && w1.data.gpLive.b === 0, JSON.stringify(w1.data.gpLive));
  await w1.r.ctx.close();

  // ---- determinism ----
  const w2 = await runToBoss(browser, 'biome=warren&seed=11&gear=1'); errs.push(...w2.p.errors);
  check('same seed, same gear drops (ids, quality, tier, affix seed)', JSON.stringify(w1.data.gear) === JSON.stringify(w2.data.gear) && w1.data.gear.length > 0, JSON.stringify(w2.data.gear));
  await w2.r.ctx.close();
  const w3 = await runToBoss(browser, 'biome=warren&seed=12&gear=1'); errs.push(...w3.p.errors);
  check('a different seed gives different gear', JSON.stringify(w3.data.gear) !== JSON.stringify(w1.data.gear), JSON.stringify(w3.data.gear));
  await w3.r.ctx.close();

  // ---- old seeds' non-gear loot unchanged (chest contents, boss bags, pickups) ----
  async function chestRun(q) {
    const r = await open(browser, q); const p = r.page;
    const info = await ev(p, () => {
      const d = window.__mm.dungeon; const g = d.graph; const a = window.__mm.arena;
      const tid = g.rooms.find((x) => x.type === 'treasure'); if (!tid) return { none: true };
      d.state.pickKey(); d.state.pickKey(); const w = window.__walk(tid.id, true); const cp = d.chestPos(); a.player.x = cp.x; a.player.y = cp.y; return { w, tid: tid.id };
    });
    await p.waitForTimeout(500);
    const bossWalk = await ev(p, () => window.__walk(window.__mm.dungeon.graph.bossRoomId, true));
    for (let i = 0; i < 40; i++) { const dead = await ev(p, () => { const d = window.__mm.dungeon; if (d.state.boss.dead) return true; const e = d.boss(); if (e) window.__mm.arena._hitEnemy(e, 200); return false; }); if (dead) break; await p.waitForTimeout(350); }
    await p.waitForTimeout(300);
    const out = await ev(p, () => { const d = window.__mm.dungeon; const a = window.__mm.arena; return { info: null, granted: d.granted.map((x) => [x.id, x.rarity, x.name]), bags: a.bags.filter((b) => b.active).map((b) => [b.id, b.r]), picks: d.pickStats().total, got: d.pickStats().got, gear: d.gear.length, chests: d.state.room(d.graph.rooms.find((x) => x.type === 'treasure').id).chestOpen }; });
    out.info = info; out.errors = p.errors; await r.ctx.close(); return out;
  }
  const cOff = await chestRun('biome=meadow&seed=4&gear=0');
  const cOn = await chestRun('biome=meadow&seed=4&gear=1');
  errs.push(...cOff.errors, ...cOn.errors);
  check('old seed (meadow 4): chest contents and pickups are identical (and the same number of boss bags) with gear on and off', cOff.granted.length >= 1 && JSON.stringify([cOff.granted, cOff.picks, cOff.got]) === JSON.stringify([cOn.granted, cOn.picks, cOn.got]) && cOff.bags.length === cOn.bags.length && cOn.gear >= 1 && cOff.gear === 0, JSON.stringify({ off: cOff, on: cOn }));

  // ---- crypt pity ----
  const c0 = await runToBoss(browser, 'biome=crypt&seed=3&gear=1'); errs.push(...c0.p.errors);
  const first0 = c0.data.gear.find((g) => bossT('crypt').includes(g.t));
  check('crypt boss without pity yields a tiered item inside the crypt boss table (T9-11) and gp.d counts the kill', c0.data.gear.some((g) => bossT('crypt').includes(g.t)) && !!first0 && (c0.data.gpLive.d === (first0.t >= 10 ? 0 : 1)), JSON.stringify(c0.data));
  await c0.r.ctx.close();
  const c15 = await runToBoss(browser, 'biome=crypt&seed=3&gear=1', { b: 0, d: 15 }); errs.push(...c15.p.errors);
  const pityItem = c15.data.gear.filter((g) => g.t >= 10);
  check('crypt boss at gp.d = 15 guarantees a T10+ item and resets gp.d to 0 (gp.b untouched)', pityItem.length >= 1 && c15.data.gpLive.d === 0 && c15.data.gpLive.b === 0, JSON.stringify({ g: c15.data.gear, gp: c15.data.gpLive }));
  await c15.r.ctx.close();
  const c14 = await runToBoss(browser, 'biome=crypt&seed=3&gear=1', { b: 7, d: 14 }); errs.push(...c14.p.errors);
  const f14 = c14.data.gear.find((g) => bossT('crypt').includes(g.t));
  check('crypt boss at gp.d = 14 is not forced: gp.d goes to 15 unless the roll was already T10+; gp.b is kept', !!f14 && c14.data.gpLive.b === 7 && c14.data.gpLive.d === (f14.t >= 10 ? 0 : 15), JSON.stringify({ g: c14.data.gear, gp: c14.data.gpLive }));
  await c14.r.ctx.close();
  const junk = await runToBoss(browser, 'biome=warren&seed=11&gear=1', { b: 'x', d: -5, z: 1 });
  check('a corrupt gp on the save is read as defaults and comes back clean', junk.data.gpLive && Object.keys(junk.data.gpLive).sort().join() === 'b,d' && junk.data.gpLive.b === 0 && junk.data.gpLive.d === 0, JSON.stringify(junk.data.gpLive));
  errs.push(...junk.p.errors); await junk.r.ctx.close();

  // ---- phone: summary fits, buttons >= 44 px ----
  const pr = await open(browser, 'biome=warren&seed=11&gear=1', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await ev(pr.page, () => window.__walk(window.__mm.dungeon.graph.bossRoomId));
  for (let i = 0; i < 40; i++) { const dead = await ev(pr.page, () => { const d = window.__mm.dungeon; if (d.state.boss.dead) return true; const e = d.boss(); if (e) window.__mm.arena._hitEnemy(e, 200); return false; }); if (dead) break; await pr.page.waitForTimeout(350); }
  await pr.page.waitForTimeout(300);
  await ev(pr.page, () => { const d = window.__mm.dungeon; const q = d.portalPos(); const ar = window.__mm.arena; ar.player.x = q.x; ar.player.y = q.y; });
  await pr.page.waitForTimeout(600);
  const phone = await ev(pr.page, () => { const el = document.getElementById('mm-summary'); const card = el.querySelector('.mm-sum-card'); const r = card.getBoundingClientRect(); const btns = Array.from(el.querySelectorAll('.mm-btn')).map((b) => Math.round(b.getBoundingClientRect().height)); return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, right: Math.round(r.right), btns, gear: el.querySelectorAll('.mm-sum-gear').length }; });
  check('phone 390x844: the summary with tiered items fits (no horizontal scroll, card inside the viewport) and its buttons are >= 44 px', phone.sw <= phone.cw && phone.right <= 390 && phone.gear >= 1 && phone.btns.length >= 1 && phone.btns.every((h) => h >= 44), JSON.stringify(phone));
  errs.push(...pr.page.errors); await pr.ctx.close();

  check('no console or page errors anywhere', errs.length === 0, errs.slice(0, 3).join(' | '));
  await browser.close();
  done();
})();
