// Cave slice A5: the crafting table (tied to the Workbench) and tiered, wearing pickaxes.
// Mining is stepped with u._update(dt) so timings do not depend on the headless frame rate.
const { launch, scene, check, done, expandPanel } = require('./helpers');
const SAVE = 'pixeltown-save-v1';
const seed = { caveSeed: 0, resources: { stone: 30, wood: 20 }, caveInv: { iron: 10, gold: 3, coal: 2, dirt: 0 } };

// Finds a block of `kind` with a free neighbouring cell to stand in front of (digs out the cell we stand in).
const findKind = `(s, kind) => {
  const u = s.underground; const B = 2;
  const dirs = [[1, 0, -Math.PI / 2], [-1, 0, Math.PI / 2], [0, 1, Math.PI], [0, -1, 0]];
  for (const [key, v] of u.lookup) {
    if (v.kind !== kind) continue;
    const [gx, gy, gz] = key.split(',').map(Number);
    if (gy > -2) continue;
    for (const [dx, dz, yaw] of dirs) {
      const nx = gx - dx; const nz = gz - dz;
      if (Math.abs(nx) > 6 || Math.abs(nz) > 6 || Math.abs(gx) > 6 || Math.abs(gz) > 6) continue;
      const nk = nx + ',' + gy + ',' + nz;
      if (u.occupied.has(nk)) { const e = u.lookup.get(nk); if (!e || e.kind === 'placed') continue; u._removeTarget({ type: 'terrain', key: nk, entry: e, kind: e.kind }); }
      return { key, rig: [nx * B, gy * B - 3.24, nz * B], yaw };
    }
  }
  return null;
}`;

(async () => {
  let { browser, page, errors } = await launch({ width: 1000, height: 700 }, seed);
  await scene(page, (s) => { s.enterUnderground(); const u = s.underground; u.stop(); u.active = true; u.physicsEnabled = false; window.__st = (n, dt = 1 / 60) => { for (let i = 0; i < n; i++) u._update(dt); }; });
  const pose = (kind) => page.evaluate(`((s, kind) => { const sp = (${findKind})(s, kind); if (!sp) return null; const u = s.underground; u.mineHeld = false; u._cancelMining(); u.rig.position.set(sp.rig[0], sp.rig[1], sp.rig[2]); u.yaw = sp.yaw; u.pitch = 0; u._update(0.001); return sp; })(window.__g.scene.getScene('Town'), ${JSON.stringify(kind)})`);
  const mineTime = (sp) => scene(page, (s, sp) => { const u = s.underground; u.setMining(true); let t = 0; while (u.lookup.has(sp.key) && t < 6) { u._update(0.01); t += 0.01; } u.setMining(false); u.drops.forEach((d) => { d.age = 0; }); return +t.toFixed(2); }, sp);

  // 1. The crafting table: a placeable block, 4 wood, its own texture, mined back for 3 wood.
  const t1 = await scene(page, (s) => {
    const u = s.underground; const o = {};
    const st = u.getHotbarState(); o.slot = st[6]; o.texKinds = Object.keys(u.textures).length; o.tableTex = !!u.textures.table;
    u.selectSlot(6); o.held = u.hotbar; o.heldTex = u.fpItem.getObjectByName('fp-cube').material.map === u.textures.table && u.fpItem.getObjectByName('fp-cube').visible;
    const wood0 = s.resources.wood; u.rig.position.set(6, -1, 6); u.yaw = -Math.PI / 2; u.pitch = -0.6; u._update(0.001);
    o.placed = u.place(); o.spent = wood0 - s.resources.wood;
    o.inPool = [...u.lookup.values()].filter((v) => v.kind === 'placed' && v.pool === 'table').length;
    o.dom = document.querySelector('#ug-hotbar .ug-slot[data-slot="6"] .cnt').textContent;
    return o;
  });
  check('table: hotbar slot 7 is the crafting table (🛠️), count = wood / 4 (20 wood = 5), a distinct 13th texture, the held block wears it', t1.slot.id === 'table' && t1.slot.count === 5 && t1.texKinds === 13 && t1.tableTex && t1.held === 'table' && t1.heldTex, JSON.stringify(t1));
  check('table: placing costs 4 wood and creates a block in its own pool', t1.placed && t1.spent === 4 && t1.inPool === 1, JSON.stringify(t1));
  const t2 = await scene(page, (s) => {
    const u = s.underground; const o = {}; u.selectSlot(0); u.physicsEnabled = false;
    const key = [...u.lookup.entries()].find(([k, v]) => v.kind === 'placed' && v.pool === 'table')[0]; const [gx, gy, gz] = key.split(',').map(Number);
    // stand 3 cells away looking at it
    u.rig.position.set(gx * 2 - 6, gy * 2 - 3.24, gz * 2); u.yaw = -Math.PI / 2; u.pitch = 0; u._update(0.001);
    const hit = u._raycastTargets()[0]; const tg = hit && u._targetFromHit(hit); o.aimed = !!tg && tg.key === key && tg.kind === 'placed_table';
    o.far = (() => { u.rig.position.set(gx * 2 - 6, gy * 2 - 3.24, gz * 2 + 20); u.pitch = 0; u._update(0.001); return u.useTable(); })();
    u.rig.position.set(gx * 2 - 6, gy * 2 - 3.24, gz * 2); u._update(0.001);
    o.key = key;
    return o;
  });
  check('table: the crosshair finds the table block; looking at plain walls or empty space is not a table', t2.aimed && t2.far === false, JSON.stringify(t2));

  // 2. Using the table opens the Workbench above the cave and freezes the cave.
  await page.keyboard.press('c'); await page.waitForTimeout(300);
  const u1 = await scene(page, (s) => {
    const u = s.underground; const wo = document.getElementById('workbench-overlay'); const o = { open: s.workbenchOpen, hidden: wo.classList.contains('hidden'), z: +wo.style.zIndex, caveZ: +getComputedStyle(document.getElementById('underground-overlay')).zIndex, paused: u.paused, inCave: s.inUnderground };
    o.rows = [...document.querySelectorAll('#workbench-list li')].map((l) => l.textContent.trim().slice(0, 40));
    const y0 = u.rig.position.x; u.keys = { w: true }; window.__st(30); u.keys = {}; o.frozen = u.rig.position.x === y0;
    o.pickRows = document.querySelectorAll('#workbench-list button[data-pick]').length; o.recipeRows = document.querySelectorAll('#workbench-list button[data-recipe]').length;
    o.visible = (() => { const b = document.querySelector('#workbench-list button[data-pick="1"]'); b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === b; })();
    return o;
  });
  check('table: pressing C at a table opens the Workbench above the cave canvas (z 40 > 30) and freezes the cave', u1.open && !u1.hidden && u1.z > u1.caveZ && u1.paused && u1.inCave && u1.frozen, JSON.stringify(u1));
  check('table: it shows all 12 workbench recipes plus the three pickaxe upgrades, and the buttons are clickable (not hidden behind the cave)', u1.recipeRows === 12 && u1.pickRows === 3 && u1.visible, JSON.stringify(u1));
  const wb = await scene(page, (s) => { const w0 = s.resources.wood; document.querySelector('#workbench-list button[data-recipe="plank"]').click(); return { wood: w0 - s.resources.wood, goods: s.craftedGoods.plank, note: document.getElementById('workbench-note').textContent }; });
  check('table: village recipes are craftable in the cave from the shared bag (Plank Stack: -3 wood, +1 crafted good)', wb.wood === 3 && wb.goods === 1 && /Crafted/.test(wb.note), JSON.stringify(wb));
  await page.keyboard.press('Escape'); await page.waitForTimeout(250);
  const esc = await scene(page, (s) => ({ open: s.workbenchOpen, inCave: s.inUnderground, paused: s.underground.paused, z: document.getElementById('workbench-overlay').style.zIndex }));
  check('table: Esc closes the Workbench but you stay in the cave, which resumes', !esc.open && esc.inCave && !esc.paused && esc.z === '', JSON.stringify(esc));

  // 3. Pickaxes: craft, mine faster, wear out.
  const wood0 = await mineTime(await pose('stone'));
  const c1 = await scene(page, (s) => { const u = s.underground; s.openCaveTable(); const o = { before: { ...s.resources }, tier0: s.cavePick.tier, badge0: document.getElementById('ug-pick').textContent };
    document.querySelector('#workbench-list button[data-pick="1"]').click();
    o.after = { stone: s.resources.stone, wood: s.resources.wood }; o.pick = { ...s.cavePick }; o.cavePick = { ...u.pick }; o.badge = document.getElementById('ug-pick').textContent; o.saved = JSON.parse(localStorage.getItem('pixeltown-save-v1')).cavePick;
    o.headColor = u._fpHead.material.color.getHex(); o.note = document.getElementById('workbench-note').textContent;
    o.lower = (() => { const r = PICK_RECIPES[0]; return s.canCraftPick(r); })();
    s.closeWorkbench(); return o; });
  check('pickaxe: a Stone Pickaxe costs 6 stone + 2 wood, equips (150 blocks), changes the held head colour, updates the badge and is saved', c1.after.stone === c1.before.stone - 6 && c1.after.wood === c1.before.wood - 2 && c1.pick.tier === 1 && c1.pick.dur === 150 && c1.cavePick.tier === 1 && /Stone 150\/150/.test(c1.badge) && c1.saved.tier === 1 && c1.saved.dur === 150 && c1.headColor === 0x9aa0a8 && /Crafted/.test(c1.note), JSON.stringify(c1));
  const spS = await pose('stone'); const durBefore = await scene(page, (s) => s.cavePick.dur);
  const stone1 = await mineTime(spS); const durAfter = await scene(page, (s) => s.cavePick.dur);
  check('pickaxe: stone mines in 0.7 s with the Stone Pickaxe (1.0 s wooden) and uses exactly one durability per block broken', Math.abs(wood0 - 1.0) < 0.03 && Math.abs(stone1 - 0.7) < 0.03 && durBefore - durAfter === 1, JSON.stringify([wood0, stone1, durBefore, durAfter]));
  const c2 = await scene(page, (s) => {
    const o = {}; const iron0 = s.caveInv.iron; const wood0 = s.resources.wood; s.openCaveTable();
    o.bad = (() => { const b = document.querySelector('#workbench-list button[data-pick="3"]'); return { disabled: b.disabled }; })();
    document.querySelector('#workbench-list button[data-pick="2"]').click();
    o.ironSpent = iron0 - s.caveInv.iron; o.woodSpent = wood0 - s.resources.wood; o.tier = s.cavePick.tier; o.badge = document.getElementById('ug-pick').textContent;
    o.stoneBtn = (() => { const b = document.querySelector('#workbench-list button[data-pick="1"]'); return b.disabled; })(); // can't go back down
    o.stoneBlocked = s.craftPick(1);
    s.closeWorkbench(); return o;
  });
  check('pickaxe: an Iron Pickaxe takes 4 iron ore (from the cave bag) + 2 wood, replaces the stone one (300 blocks); a worse pickaxe cannot be crafted over it', c2.ironSpent === 4 && c2.woodSpent === 2 && c2.tier === 2 && /Iron 300\/300/.test(c2.badge) && c2.stoneBtn === true && c2.stoneBlocked === false, JSON.stringify(c2));
  const iron1 = await mineTime(await pose('stone'));
  const gold1 = await mineTime(await pose('coal'));
  check('pickaxe: Iron halves mining time (stone 0.5 s, coal 0.6 s)', Math.abs(iron1 - 0.5) < 0.03 && Math.abs(gold1 - 0.6) < 0.03, JSON.stringify([iron1, gold1]));
  const sp3 = await pose('dirt');
  const wear = await scene(page, (s, sp) => {
    const u = s.underground; u.setPick(2, 2); const o = { pre: u.pick.dur };
    u.setMining(true); let t = 0; while (u.lookup.has(sp.key) && t < 3) { u._update(0.01); t += 0.01; } u.setMining(false); o.after1 = { tier: u.pick.tier, dur: u.pick.dur };
    return o;
  }, sp3);
  const sp4 = await pose('dirt');
  const wear2 = await scene(page, (s, sp) => {
    const u = s.underground; const o = {}; u.setPick(2, 1); // one block of durability left
    u.setMining(true); let t = 0; while (u.lookup.has(sp.key) && t < 3) { u._update(0.01); t += 0.01; } u.setMining(false);
    o.tier = u.pick.tier; o.dur = u.pick.dur; o.saved = JSON.parse(localStorage.getItem('pixeltown-save-v1')).cavePick; o.badge = document.getElementById('ug-pick').textContent; o.head = u._fpHead.material.color.getHex(); o.broke = document.getElementById('ug-pick').classList.contains('broke');
    return o;
  }, sp4);
  check('wear: at one durability left a block is the last — the pickaxe breaks, you are back to the wooden one, the badge says so and the save is updated', wear.after1.tier === 2 && wear.after1.dur === 1 && wear2.tier === 0 && wear2.dur === 0 && wear2.saved.tier === 0 && /broke/.test(wear2.badge) && wear2.broke && wear2.head === 0xb8c2cc, JSON.stringify([wear, wear2]));

  const rp = await scene(page, (s) => {
    s.cavePick = { tier: 3, dur: 120 }; s.underground.setPick(3, 120); s.caveInv.gold = 9; s.caveInv.iron = 9; s.openCaveTable();
    const full = document.querySelector('#workbench-list button[data-pick="3"]').disabled; const spent = s.craftPick(3);
    s.underground.setPick(3, 60); s.renderWorkbench(); const part = !document.querySelector('#workbench-list button[data-pick="3"]').disabled;
    const o = { full, spent, part, placeBlocked: (() => { s.underground.selectSlot(0); return s.underground.place(); })() };
    s.closeWorkbench(); return o;
  });
  check('bench: Repair is only offered when the pickaxe is worn (a full-durability pick cannot be re-crafted for nothing); blocks cannot be placed behind the open bench', rp.full === true && rp.spent === false && rp.part === true && rp.placeBlocked === false, JSON.stringify(rp));

  // 4. Persistence and corrupt saves.
  await scene(page, (s) => { s.openCaveTable(); s.caveInv.gold = 3; s.caveInv.iron = 6; s.renderWorkbench(); document.querySelector('#workbench-list button[data-pick="3"]').click(); s.closeWorkbench(); });
  const saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)).cavePick, SAVE);
  check('save: crafting the Gold Pickaxe (3 gold + 3 iron) stores {tier 3, dur 120} under the additive cavePick key', saved.tier === 3 && saved.dur === 120, JSON.stringify(saved));
  check('no console errors (desktop)', errors.length === 0, errors.join('|'));
  if (process.env.SHOTS) {
    await scene(page, (s) => { const u = s.underground; u.setPick(2, 250); u.physicsEnabled = false; u.selectSlot(0); const key = [...u.lookup.entries()].find(([k, v]) => v.kind === 'placed' && v.pool === 'table')[0]; const [gx, gy, gz] = key.split(',').map(Number); u.rig.position.set(gx * 2 - 5, gy * 2 - 3.24, gz * 2); u.yaw = -Math.PI / 2; u.pitch = 0; u.setView('first'); window.__st(2); u.renderer.render(u.scene, u.camera); });
    await page.waitForTimeout(500); await page.screenshot({ path: process.env.SHOTS + '/cave-table.png' });
    await scene(page, (s) => { s.openCaveTable(); }); await page.waitForTimeout(300); await page.screenshot({ path: process.env.SHOTS + '/cave-table-open.png' });
  }
  await browser.close();

  // 5. Reload keeps the pickaxe; corrupt saves fall back to wooden.
  ({ browser, page, errors } = await launch({ width: 1000, height: 700 }, { ...seed, cavePick: saved }));
  const re = await scene(page, (s) => { s.enterUnderground(); const u = s.underground; return { tier: u.pick.tier, dur: u.pick.dur, badge: document.getElementById('ug-pick').textContent, head: u._fpHead.material.color.getHex() }; });
  check('save: after a reload the Gold Pickaxe (120/120) is still in your hand in the cave', re.tier === 3 && re.dur === 120 && /Gold 120\/120/.test(re.badge) && re.head === 0xf4d03e, JSON.stringify(re));
  await browser.close();
  for (const bad of [{ tier: 9, dur: 50 }, { tier: 2, dur: 0 }, { tier: 'x', dur: 'y' }, { tier: 1, dur: 99999 }, null, 'oops']) {
    const x = await launch({ width: 600, height: 500 }, { ...seed, cavePick: bad });
    const p = await scene(x.page, (s) => ({ ...s.cavePick }));
    const okp = bad && bad.tier === 1 ? (p.tier === 1 && p.dur === 150) : (p.tier === 0 && p.dur === 0);
    check('save: corrupt cavePick ' + JSON.stringify(bad) + ' is cleaned (broken or impossible picks become the wooden one; durability is capped)', okp, JSON.stringify(p));
    await x.browser.close();
  }

  // 6. Village tie + phone: the village Workbench also sells pickaxes; the cave button and badge fit on a phone.
  ({ browser, page, errors } = await launch({ width: 390, height: 844 }, seed, true));
  const vil = await scene(page, (s) => {
    s.localBody.setPosition(WORKBENCH_POS.x, WORKBENCH_POS.y + 30); s.interact(); const o = { open: s.workbenchOpen, rows: document.querySelectorAll('#workbench-list button[data-pick]').length, header: document.querySelector('#workbench-list .workbench-section').textContent };
    document.querySelector('#workbench-list button[data-pick="1"]').click(); o.tier = s.cavePick.tier; o.note = document.getElementById('workbench-note').textContent; s.closeTopOverlay(); return o;
  });
  check('village tie: the village Workbench lists the pickaxe upgrades too — craft one there and it is in your hand next time you dig', vil.open && vil.rows === 3 && /Wooden/.test(vil.header) && vil.tier === 1 && /Crafted/.test(vil.note), JSON.stringify(vil));
  await scene(page, (s) => { s.enterUnderground(); const u = s.underground; u.stop(); u.active = true; u.physicsEnabled = false; });
  const inh = await scene(page, (s) => s.underground.pick.tier);
  check('village tie: entering the cave afterwards, the Stone Pickaxe crafted in the village is the one in your hand', inh === 1);
  const ph = await page.evaluate(() => {
    const r = (id) => document.getElementById(id).getBoundingClientRect(); const over = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const ids = ['ug-craft-btn', 'ug-fly-btn', 'ug-mine-btn', 'ug-place-btn', 'ug-up-btn', 'ug-down-btn', 'ug-view-btn', 'ug-exit-btn']; const bs = ids.map(r);
    let overlaps = 0; for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) if (over(bs[i], bs[j])) overlaps++;
    const pick = r('ug-pick'); const others = ['ug-health', 'ug-clock', 'ug-hotbar', 'underground-depth-hint'].map(r);
    return { inside: bs.every((b) => b.left >= 0 && b.right <= innerWidth && b.top >= 0 && b.bottom <= innerHeight), overlaps, pickIn: pick.right <= innerWidth && pick.left >= 0, pickOver: others.filter((o) => over(pick, o)).length, craftSize: Math.round(Math.min(bs[0].width, bs[0].height)), sw: document.documentElement.scrollWidth, badge: document.getElementById('ug-pick').textContent };
  });
  check('phone: the 🛠️ button joins the action grid (50px, no overlaps, on screen) and the pickaxe badge fits under the health badge', ph.inside && ph.overlaps === 0 && ph.craftSize >= 44 && ph.pickIn && ph.pickOver === 0 && ph.sw <= 390, JSON.stringify(ph));
  const pt = await scene(page, (s) => { const u = s.underground; u.selectSlot(6); u.physicsEnabled = false; u.rig.position.set(6, -1, 6); u.yaw = -Math.PI / 2; u.pitch = -0.6; u._update(0.001); const placed = u.place(); const key = [...u.lookup.entries()].find(([k, v]) => v.pool === 'table')[0]; const [gx, gy, gz] = key.split(',').map(Number); u.selectSlot(0); u.rig.position.set(gx * 2 - 6, gy * 2 - 3.24, gz * 2); u.yaw = -Math.PI / 2; u.pitch = 0; u._update(0.001); return { placed, key }; });
  await page.tap('#ug-craft-btn'); await page.waitForTimeout(300);
  const tap = await page.evaluate(() => { const s = window.__g.scene.getScene('Town'); const card = document.querySelector('#workbench-overlay .join-card').getBoundingClientRect(); const btn = document.querySelector('#workbench-list button[data-pick="2"]').getBoundingClientRect(); const x = document.getElementById('workbench-close-btn').getBoundingClientRect(); return { open: s.workbenchOpen, fits: card.left >= 0 && card.right <= innerWidth && card.top >= 0 && card.bottom <= innerHeight + 1, close: Math.round(x.height), z: +document.getElementById('workbench-overlay').style.zIndex }; });
  check('phone: tapping 🛠️ while aiming at a table opens the Workbench over the cave; it fits the screen and has a 40px close button', pt.placed && tap.open && tap.fits && tap.close >= 40 && tap.z === 40, JSON.stringify([pt, tap]));
  if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + '/cave-table-phone.png' });
  await page.tap('#workbench-close-btn'); await page.waitForTimeout(200);
  await page.tap('#ug-craft-btn'); await page.waitForTimeout(100);
  const miss = await scene(page, (s) => ({ txt: document.getElementById('ug-pick').textContent, open: s.workbenchOpen }));
  check('phone: tapping 🛠️ while aiming at the table works again after closing, and elsewhere it just hints "Aim at a crafting table"', miss.open === true || /Aim/.test(miss.txt), JSON.stringify(miss));
  check('no console errors (phone)', errors.length === 0, errors.join('|'));
  await browser.close();
  done();
})();
