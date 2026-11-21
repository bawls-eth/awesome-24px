// Mad Maze Warren dungeon run (?mode=dungeon&seed=N) on the standalone page. No Firebase, no external network.
// Serve the repo root, then:  BASE=http://localhost:8446/game/index.html NODE_PATH=$(npm root -g) node game/tests/mad-maze-dungeon.test.js
// Set SHOTS=<dir> to also write desktop/phone screenshots.
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/mad-maze/index.html';
const URL = (seed) => `${PAGE}?mode=dungeon&seed=${seed}&test=1`;
const SEED = 7;

async function open(browser, opts, seed) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  page.errors = []; page.reqs = [];
  page.on('pageerror', (e) => page.errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push('console: ' + m.text()); });
  page.on('request', (r) => page.reqs.push(r.url()));
  await page.goto(URL(seed === undefined ? SEED : seed));
  await page.waitForFunction(() => window.__mm && window.__mm.dungeon && window.__mm.dungeon.room !== null);
  await page.waitForTimeout(300);
  // the journey is about the dungeon rules, not about dodging bullets
  await page.evaluate(() => { window.__mm.arena._hitPlayer = () => {}; });
  // helpers living in the page: walk to a room through doors (clearing rooms on the way)
  await page.evaluate(() => {
    window.__walk = (target, allowLocked) => {
      const d = window.__mm.dungeon; const g = d.graph;
      const nbrs = (id) => g.doors.filter((x) => (!x.cracked || d.state.secretOpen) && (x.a === id || x.b === id) && (allowLocked || !x.locked)).map((x) => (x.a === id ? x.b : x.a));
      const prev = { [d.room]: null }; const q = [d.room];
      while (q.length) { const u = q.shift(); if (u === target) break; nbrs(u).forEach((v) => { if (!(v in prev)) { prev[v] = u; q.push(v); } }); }
      const path = []; for (let u = target; u !== null && u !== undefined; u = prev[u]) path.unshift(u);
      for (let i = 1; i < path.length; i++) {
        if (d.state.room(d.room).enemiesAlive > 0 && g.rooms[d.room].type !== 'boss') d.clearRoom();
        const r = d.enter(path[i]); if (!r.ok) return 'blocked at ' + path[i] + ': ' + r.reason;
      }
      if (d.state.room(d.room).enemiesAlive > 0 && g.rooms[d.room].type !== 'boss') d.clearRoom();
      return d.room;
    };
  });
  return { ctx, page };
}
const ev = (page, fn, arg) => page.evaluate(fn, arg);

(async () => {
  const browser = await chromium.launch();
  const shot = process.env.SHOTS;

  // ---------- determinism ----------
  const a = await open(browser, { viewport: { width: 1100, height: 700 } });
  const b = await open(browser, { viewport: { width: 1100, height: 700 } });
  const c = await open(browser, { viewport: { width: 1100, height: 700 } }, 8);
  const graph = (p) => ev(p, () => JSON.stringify(window.__mm.dungeon.graph));
  const ga = await graph(a.page);
  check('same seed gives the same room graph', ga === await graph(b.page));
  check('a different seed gives a different graph', ga !== await graph(c.page));
  await b.ctx.close(); await c.ctx.close();
  const p = a.page;

  // ---------- start room ----------
  const st = await ev(p, () => { const d = window.__mm.dungeon; const ar = window.__mm.arena; return { room: d.room, type: d.graph.rooms[d.room].type, px: ar.player.x, py: ar.player.y, rows: ar.walls && ar.walls.rows, cols: ar.walls && ar.walls.cols, W: ar.W, H: ar.H, state: ar.state, visited: d.state.room(d.room).visited }; });
  check('start room spawns the player in the middle of a 17x13 room', st.type === 'start' && st.visited && Math.abs(st.px - 340) < 2 && Math.abs(st.py - 260) < 2 && st.rows === 13 && st.cols === 17 && st.W === 680 && st.H === 520, JSON.stringify(st));
  check('the arena is in play state (no waves)', st.state === 'play');
  if (shot) await p.screenshot({ path: `${shot}/dungeon-desktop-start.png` });

  // ---------- locked-while-occupied, open after clearing ----------
  const g0 = await ev(p, () => { const d = window.__mm.dungeon; const o = d.doors().find((x) => x.status === 'open' && d.graph.rooms[x.other].type === 'combat'); return o; });
  await ev(p, (id) => window.__mm.dungeon.enter(id), g0.other);
  await p.waitForTimeout(500);
  const occ = await ev(p, () => { const d = window.__mm.dungeon; const doors = d.doors(); return { room: d.room, mobs: d.mobs(), planned: d.layout(d.room).plan, alive: d.state.room(d.room).enemiesAlive, statuses: doors.map((x) => x.status), closed: d.state.doorsClosed(), walls: window.__mm.arena.walls.cells.flat().filter((x) => x).length }; });
  check('an occupied room seals every door', occ.mobs > 0 && occ.statuses.length > 0 && occ.statuses.every((s) => s === 'sealed') && occ.closed, JSON.stringify(occ));
  check('enemies spawned from the MMEnemies plan', occ.mobs === occ.planned && occ.alive >= occ.mobs, JSON.stringify(occ));
  const blocked = await ev(p, () => { const d = window.__mm.dungeon; const o = d.doors()[0]; const r = d.enter(o.other); return { ok: r.ok, reason: r.reason, room: d.room }; });
  check('cannot leave a sealed room', !blocked.ok && blocked.reason === 'sealed' && blocked.room === g0.other, JSON.stringify(blocked));
  if (shot) await p.screenshot({ path: `${shot}/dungeon-desktop-fight.png` });
  await ev(p, () => window.__mm.dungeon.clearRoom());
  await p.waitForTimeout(300);
  const clr = await ev(p, () => { const d = window.__mm.dungeon; return { statuses: d.doors().map((x) => x.status), cleared: d.state.room(d.room).cleared, walls: window.__mm.arena.walls.cells.flat().filter((x) => x).length }; });
  check('doors open once the enemies are cleared', clr.cleared && clr.statuses.every((s) => s === 'open' || s === 'cracked' || s === 'locked') && clr.statuses.some((s) => s === 'open') && clr.walls < occ.walls, JSON.stringify(clr));
  await ev(p, (id) => window.__mm.dungeon.enter(id), 0);
  await ev(p, (id) => window.__mm.dungeon.enter(id), g0.other);
  const again = await ev(p, () => { const d = window.__mm.dungeon; return { mobs: d.mobs(), statuses: d.doors().map((x) => x.status) }; });
  check('a cleared room stays open and does not respawn', again.mobs === 0 && again.statuses.some((s) => s === 'open') && !again.statuses.includes('sealed'), JSON.stringify(again));

  // ---------- real door crossing ----------
  await ev(p, () => window.__walk(0));
  const cross = await ev(p, () => { const d = window.__mm.dungeon; const o = d.doors().find((x) => x.status === 'open'); const ar = window.__mm.arena; ar.player.x = (o.tile.x + 0.5) * 40 + (o.dir === 'E' ? -10 : o.dir === 'W' ? 10 : 0); ar.player.y = (o.tile.y + 0.5) * 40 + (o.dir === 'S' ? -10 : o.dir === 'N' ? 10 : 0); return { to: o.other }; });
  await p.waitForTimeout(300);
  const crossed = await ev(p, () => { const d = window.__mm.dungeon; const ar = window.__mm.arena; return { room: d.room, x: ar.player.x, y: ar.player.y }; });
  check('walking into an open door moves the player to the next room (arrives inside, not in the wall)', crossed.room === cross.to && crossed.x > 40 && crossed.x < 640 && crossed.y > 40 && crossed.y < 480, JSON.stringify([cross, crossed]));

  // ---------- key, then the locked door ----------
  const keyRoom = await ev(p, () => window.__mm.dungeon.graph.keyRoomId);
  const lockedDoor = await ev(p, () => { const g = window.__mm.dungeon.graph; const d = g.doors.find((x) => x.locked); return { a: d.a, b: d.b, treasure: g.rooms.find((r) => r.type === 'treasure').id }; });
  await ev(p, (id) => window.__walk(id), keyRoom);
  await ev(p, () => window.__mm.dungeon.clearRoom());
  const kp = await ev(p, () => window.__mm.dungeon.keyPos());
  check('the key room shows a key', !!kp);
  await ev(p, (k) => { const ar = window.__mm.arena; ar.player.x = k.x; ar.player.y = k.y; }, kp);
  await p.waitForTimeout(300);
  check('walking onto the key picks it up', (await ev(p, () => window.__mm.dungeon.state.keys)) === 1);
  const nb = lockedDoor.a === lockedDoor.treasure ? lockedDoor.b : lockedDoor.a;
  // first prove the door is locked without a key (spend nothing): look at its status from the neighbour room
  await ev(p, (id) => window.__walk(id), nb);
  const ld = await ev(p, (t) => window.__mm.dungeon.doors().find((x) => x.other === t), lockedDoor.treasure);
  check('the treasure door shows as locked', ld && ld.status === 'locked', JSON.stringify(ld));
  await ev(p, (o) => { const ar = window.__mm.arena; ar.player.x = (o.tile.x + 0.5) * 40 + (o.dir === 'E' ? -30 : o.dir === 'W' ? 30 : 0); ar.player.y = (o.tile.y + 0.5) * 40 + (o.dir === 'S' ? -30 : o.dir === 'N' ? 30 : 0); }, ld);
  await p.waitForTimeout(400);
  const vault = await ev(p, () => { const d = window.__mm.dungeon; return { room: d.room, keys: d.state.keys, type: d.graph.rooms[d.room].type, doors: d.doors().map((x) => x.status) }; });
  check('bumping the locked door with a key spends it and opens the treasure room', vault.type === 'treasure' && vault.keys === 0 && vault.doors.includes('open'), JSON.stringify(vault));

  // ---------- chest ----------
  const before = await ev(p, () => ({ items: window.__mm.arena.save.items.length, granted: window.__mm.dungeon.granted.length }));
  const cp = await ev(p, () => window.__mm.dungeon.chestPos());
  await ev(p, (k) => { const ar = window.__mm.arena; ar.player.x = k.x; ar.player.y = k.y; }, cp);
  await p.waitForTimeout(400);
  const after = await ev(p, () => ({ items: window.__mm.arena.save.items.length, granted: window.__mm.dungeon.granted.slice(), open: window.__mm.dungeon.state.room(window.__mm.dungeon.room).chestOpen, raw: JSON.parse(localStorage.getItem('pixeltown-save-v1')).realm.items.length }));
  check('the chest pays an item through collectItem (backpack + save grow)', after.open && after.granted.length === before.granted + 1 && after.items === before.items + 1 && after.raw === after.items, JSON.stringify([before, after]));
  if (shot) await p.screenshot({ path: `${shot}/dungeon-desktop-vault.png` });

  // ---------- secret room ----------
  const sec = await ev(p, () => { const g = window.__mm.dungeon.graph; const s = g.rooms[g.secretRoomId]; const d = g.doors[s.doors[0]]; return { id: s.id, nb: d.a === s.id ? d.b : d.a, n: s.doors.length }; });
  await ev(p, (id) => window.__walk(id, true), sec.nb);
  const blockedSecret = await ev(p, (id) => { const r = window.__mm.dungeon.enter(id); return { ok: r.ok, reason: r.reason }; }, sec.id);
  check('the secret room is closed behind a cracked wall', !blockedSecret.ok && blockedSecret.reason === 'cracked', JSON.stringify(blockedSecret));
  const ct = await ev(p, () => window.__mm.dungeon.crackTile());
  const hits = [];
  for (let i = 0; i < 3; i++) {
    await ev(p, (t) => { // shoot the cracked tile for real: from two tiles away, straight at it
      const ar = window.__mm.arena; const cx = (t.x + 0.5) * 40; const cy = (t.y + 0.5) * 40;
      const dx = t.x === 0 ? 1 : t.x === 16 ? -1 : 0; const dy = t.y === 0 ? 1 : t.y === 12 ? -1 : 0;
      ar.player.x = cx + dx * 100; ar.player.y = cy + dy * 100;
      ar.firePlayerBulletFrom(ar.player.x, ar.player.y, Math.atan2(-dy, -dx), 1, 0);
    }, ct);
    await p.waitForTimeout(450);
    hits.push(await ev(p, () => window.__mm.dungeon.state.secretHits));
  }
  const opened = await ev(p, () => window.__mm.dungeon.state.secretOpen);
  check('three real bolt hits crack the wall open (1, 2, then open)', hits[0] === 1 && hits[1] === 2 && hits[2] >= 3 && opened, JSON.stringify(hits));
  const toSecret = await ev(p, (id) => { const r = window.__mm.dungeon.enter(id); return { ok: r.ok, room: window.__mm.dungeon.room }; }, sec.id);
  check('the secret room can now be entered', toSecret.ok && toSecret.room === sec.id);
  const sc = await ev(p, () => window.__mm.dungeon.chestPos());
  check('the secret room holds a chest', !!sc);
  if (shot) await p.screenshot({ path: `${shot}/dungeon-desktop-secret.png` });

  // ---------- mini-map ----------
  await p.waitForTimeout(500); // the map redraws on the next frame after the last room change
  const mm = await ev(p, () => { const d = window.__mm.dungeon; const vis = d.state.visibleRooms(); const visited = d.graph.rooms.filter((r) => d.state.room(r.id).visited).map((r) => r.id); const unseen = d.graph.rooms.filter((r) => !vis.includes(r.id)).length; return { vis, drawn: d.mapDrawn, visited, unseen, total: d.graph.rooms.length }; });
  const adj = await ev(p, () => { const d = window.__mm.dungeon; return d.graph.doors.filter((x) => !x.cracked || d.state.secretOpen).map((x) => [x.a, x.b]); });
  const okNb = mm.vis.every((id) => mm.visited.includes(id) || adj.some(([x, y]) => (x === id && mm.visited.includes(y)) || (y === id && mm.visited.includes(x))));
  check('mini-map draws exactly the visited rooms plus their direct neighbours', JSON.stringify(mm.vis) === JSON.stringify(mm.drawn) && mm.visited.every((id) => mm.vis.includes(id)) && okNb, JSON.stringify(mm));
  const c2 = await open(browser, { viewport: { width: 1100, height: 700 } });
  const fresh = await ev(c2.page, () => { const d = window.__mm.dungeon; return { drawn: d.mapDrawn, vis: d.state.visibleRooms(), secret: d.graph.secretRoomId }; });
  check('at the start the map shows only the start room and its direct neighbours, never the secret room', fresh.drawn.length >= 2 && fresh.drawn.length <= 5 && fresh.drawn.length < 9 && !fresh.drawn.includes(fresh.secret), JSON.stringify(fresh));
  const tab = await ev(c2.page, () => 0);
  void tab;
  const v0 = await ev(c2.page, () => window.__mm.dungeon.mapVisible());
  await c2.page.keyboard.press('Tab'); const v1 = await ev(c2.page, () => window.__mm.dungeon.mapVisible());
  await c2.page.keyboard.press('Tab'); const v2 = await ev(c2.page, () => window.__mm.dungeon.mapVisible());
  check('Tab toggles the mini-map', v0 === true && v1 === false && v2 === true, JSON.stringify([v0, v1, v2]));
  await c2.ctx.close();

  // ---------- boss ----------
  await ev(p, (id) => window.__walk(id), await ev(p, () => window.__mm.dungeon.graph.bossRoomId));
  await p.waitForTimeout(500);
  const boss0 = await ev(p, () => { const d = window.__mm.dungeon; const e = d.boss(); return { room: d.graph.rooms[d.room].type, phase: d.state.boss.phase, hp: d.state.boss.hp, max: d.state.boss.maxHp, sealed: d.state.doorsClosed(), onField: !!e }; });
  check('the boss room spawns Queen Burrowmole at phase 1 with the doors sealed', boss0.room === 'boss' && boss0.onField && boss0.phase === 1 && boss0.sealed, JSON.stringify(boss0));
  await p.waitForTimeout(1300); // opening invulnerability
  const hit = (dmg) => ev(p, (n) => { const d = window.__mm.dungeon; window.__mm.arena._hitEnemy(d.boss(), n); return { hp: d.state.boss.hp, phase: d.state.boss.phase, inv: d.state.boss.invulnerable(window.__mm.arena.clock), e: d.boss() && d.boss().phase }; }, dmg);
  const h1 = await hit(100);
  check('below 66% HP the boss enters phase 2 and is invulnerable for a moment', h1.phase === 2 && h1.inv && h1.e === 2, JSON.stringify(h1));
  const h1b = await hit(50);
  check('hits are ignored during the phase change', h1b.hp === h1.hp, JSON.stringify([h1, h1b]));
  if (shot) await p.screenshot({ path: `${shot}/dungeon-desktop-boss.png` });
  await p.waitForTimeout(1700);
  const h2 = await hit(80);
  check('below 33% HP the boss enters phase 3', h2.phase === 3 && h2.e === 3, JSON.stringify(h2));
  await p.waitForTimeout(1700);
  const h3 = await hit(200);
  const bossDone = await ev(p, () => { const d = window.__mm.dungeon; return { dead: d.state.boss.dead, onField: !!d.boss(), sealed: d.state.doorsClosed(), portal: d.portalPos() }; });
  check('the boss dies, the doors open and an exit portal appears', h3.hp === 0 && bossDone.dead && !bossDone.onField && !bossDone.sealed && !!bossDone.portal, JSON.stringify(bossDone));
  await p.waitForTimeout(300);
  if (shot) await p.screenshot({ path: `${shot}/dungeon-desktop-portal.png` });

  // ---------- exit + summary ----------
  await ev(p, (q) => { const ar = window.__mm.arena; ar.player.x = q.x; ar.player.y = q.y; }, bossDone.portal);
  await p.waitForTimeout(500);
  const sum = await ev(p, () => { const d = window.__mm.dungeon; const el = document.getElementById('mm-summary'); return { shown: !el.classList.contains('hidden'), loot: Array.from(document.querySelectorAll('#mm-sum-loot li')).map((x) => x.textContent), granted: d.granted.map((x) => x.name), s: d.summary, finished: d.finished }; });
  check('stepping into the portal shows the loot summary listing every item won', sum.shown && sum.finished && sum.granted.length >= 1 && sum.granted.every((n) => sum.loot.some((l) => l.includes(n))) && sum.s.bossDefeated && sum.s.secretFound && sum.s.chestsOpened >= 1, JSON.stringify(sum));
  if (shot) await p.screenshot({ path: `${shot}/dungeon-desktop-summary.png` });
  check('desktop: no console errors', p.errors.length === 0, p.errors.join(' | '));
  check('no requests to firebase/gstatic, only own origin', p.reqs.every((u) => u.startsWith(ORIGIN + '/')) && !p.reqs.some((u) => /firebase|gstatic/.test(u)), p.reqs.filter((u) => !u.startsWith(ORIGIN + '/')).join(' '));
  await a.ctx.close();

  // ---------- default page unchanged ----------
  const def = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  const dp = await def.newPage(); const derr = [];
  dp.on('pageerror', (e) => derr.push(e.message));
  await dp.goto(PAGE + '?test=1&offline=1');
  await dp.waitForFunction(() => window.__mm && window.__mm.arena); await dp.waitForTimeout(300);
  const dflt = await dp.evaluate(() => { const a = window.__mm.arena; return { dungeon: window.__mm.dungeon, hook: a.dungeon, fixed: a.fixedWorld, walls: a.walls, W: a.W, map: !!document.getElementById('mm-map'), state: a.state }; });
  check('default page (no ?mode) is still the solo arena: no dungeon, no fixed world, no walls, no map', !dflt.dungeon && !dflt.hook && !dflt.fixed && !dflt.walls && !dflt.map && dflt.W >= 540 && derr.length === 0, JSON.stringify(dflt));
  await def.close();

  // ---------- review fixes: the seed parameter cannot inject markup; Tab is not swallowed on the summary ----------
  const xs = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  const xp = await xs.newPage(); const xerr = []; let dialogs = 0;
  xp.on('pageerror', (e) => xerr.push(e.message)); xp.on('dialog', (d) => { dialogs++; d.dismiss(); });
  await xp.goto(PAGE + '?mode=dungeon&test=1&seed=' + encodeURIComponent('<img src=x onerror=alert(1)>'));
  await xp.waitForFunction(() => window.__mm && window.__mm.dungeon); await xp.waitForTimeout(300);
  // .mm-ico = the HUD icons our own code adds from the b19 manifest (S13); any OTHER <img> would be an injection
  const xo = await xp.evaluate(() => { const d = window.__mm.dungeon; return { seed: String(d.seed), imgs: document.querySelectorAll('img:not(.mm-ico)').length }; });
  await xp.evaluate(() => window.__mm.dungeon.fail && window.__mm.dungeon.fail());
  await xp.waitForTimeout(300);
  const tabOk = await xp.evaluate(() => { const ev = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true }); window.dispatchEvent(ev); return { prevented: ev.defaultPrevented, sum: !!document.querySelector('.mm-sum-card'), html: (document.querySelector('.mm-sum-card') || { innerHTML: '' }).innerHTML.includes('<img') }; });
  check('a hostile ?seed= is ignored (no injected <img>, no alert dialog, no errors)', !/[<>]/.test(xo.seed) && xo.imgs === 0 && dialogs === 0 && xerr.length === 0 && !tabOk.html, JSON.stringify([xo, tabOk, dialogs, xerr]));
  check('once the summary is shown Tab is no longer swallowed (keyboard users can reach the buttons)', tabOk.sum === false || tabOk.prevented === false, JSON.stringify(tabOk));
  await xs.close();

  // ---------- phone ----------
  const ph = await open(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await ev(ph.page, () => window.__walk(window.__mm.dungeon.graph.rooms.find((r) => r.type === 'combat').id));
  await ph.page.waitForTimeout(600);
  const m = await ev(ph.page, () => { const cv = document.getElementById('realm-canvas').getBoundingClientRect(); return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, bw: document.body.scrollWidth, cvw: Math.round(cv.width), cvh: Math.round(cv.height), cvx: Math.round(cv.left), stick: getComputedStyle(document.getElementById('realm-stick-move')).display, mapBtn: !!document.getElementById('mm-map-btn') }; });
  check('phone 390x844: no horizontal scroll, the room is letterboxed to fit (not stretched), sticks shown', m.sw <= m.cw && m.bw <= m.cw && m.cvw <= 390 && Math.abs(m.cvw / m.cvh - 680 / 520) < 0.03 && m.stick === 'block' && m.mapBtn, JSON.stringify(m));
  if (shot) await ph.page.screenshot({ path: `${shot}/dungeon-phone-fight.png` });
  await ph.page.tap('#mm-map-btn');
  const hid = await ev(ph.page, () => window.__mm.dungeon.mapVisible());
  check('phone: the map button hides the mini-map', hid === false);
  await ph.page.tap('#mm-map-btn');
  check('phone: no console errors', ph.page.errors.length === 0, ph.page.errors.join(' | '));
  await ph.ctx.close();

  await browser.close();
  done();
})();
