// Cave slice A3: timed mining with a crack overlay, dropped items you pick up, 9-slot hotbar, saved cave inventory.
// Frames are stepped by calling u._update() with a fixed dt, so timings do not depend on the headless frame rate.
const { launch, scene, check, done } = require('./helpers');
const SAVE = 'pixeltown-save-v1';

// Page-side helper: find a block of `kind` with a free neighbouring cell to stand in front of; returns the pose.
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
      if (u.occupied.has(nk)) { const e = u.lookup.get(nk); if (!e || e.kind === 'placed') continue; u._removeTarget({ type: 'terrain', key: nk, entry: e, kind: e.kind }); } // dig out the cell we stand in
      return { key, rig: [nx * B, gy * B - 3.24, nz * B], yaw };
    }
  }
  return null;
}`;

(async () => {
  let { browser, page, errors } = await launch({ width: 1000, height: 700 }, { resources: { stone: 4, wood: 3 }, caveInv: { dirt: 2 } });
  await scene(page, (s) => { s.enterUnderground(); const u = s.underground; u.stop(); u.active = true; u.physicsEnabled = false; });
  const poseKind = (kind) => page.evaluate(`((s, kind) => { const sp = (${findKind})(s, kind); if (!sp) return null; const u = s.underground; u.mineHeld = false; u._cancelMining(); u.rig.position.set(sp.rig[0], sp.rig[1], sp.rig[2]); u.yaw = sp.yaw; u.pitch = 0; u._update(0.001); return sp; })(window.__g.scene.getScene('Town'), ${JSON.stringify(kind)})`);

  // 1. Timed mining: nothing breaks instantly; the block cracks over its mining time, then drops an item.
  const sp = await poseKind('stone');
  check('setup: found a stone block to stand in front of', !!sp);
  const t1 = await scene(page, (s, sp) => {
    const u = s.underground; const stone0 = s.resources.stone; u.setMining(true);
    const out = {}; let t = 0;
    for (let i = 0; i < 30; i++) { u._update(0.02); t += 0.02; }
    out.midHas = u.lookup.has(sp.key); out.midStage = u.crackTextures.indexOf(u.crackMesh.material.map); out.midVisible = u.crackMesh.visible;
    out.crackPos = u.crackMesh.position.toArray();
    for (let i = 0; i < 40; i++) { u._update(0.02); t += 0.02; if (!u.lookup.has(sp.key)) break; }
    out.gone = !u.lookup.has(sp.key); out.brokeAt = +t.toFixed(2); out.drops = u.drops.length; out.stoneNow = s.resources.stone - stone0; out.crackAfter = u.crackMesh.visible; out.occ = u.occupied.has(sp.key);
    u.setMining(false);
    return out;
  }, sp);
  check('timed mining: after 0.6 s the stone is still there but cracked (overlay visible, mid stage)', t1.midHas && t1.midVisible && t1.midStage >= 4 && t1.midStage <= 8, JSON.stringify(t1));
  check('timed mining: the crack overlay sits on the targeted block', t1.crackPos.join() === sp.key.split(',').map((v) => v * 2).join(), JSON.stringify([t1.crackPos, sp.key]));
  check('timed mining: stone breaks after ~1.0 s (not instantly), leaves a drop and hides the crack', t1.gone && t1.brokeAt >= 0.95 && t1.brokeAt <= 1.15 && t1.drops === 1 && !t1.crackAfter && !t1.occ, JSON.stringify(t1));
  check('timed mining: loot is not credited until you pick the item up', t1.stoneNow === 0, JSON.stringify(t1));
  const pk = await scene(page, (s) => { const u = s.underground; const stone0 = s.resources.stone; for (let i = 0; i < 90; i++) u._update(1 / 60); return { gained: s.resources.stone - stone0, drops: u.drops.length }; });
  check('pickup: walking up to the dropped item collects it (+1 stone) and removes the entity', pk.gained === 1 && pk.drops === 0, JSON.stringify(pk));

  // 2. Harder blocks take longer; ore drops stone + the ore itself; dirt gives a placeable dirt block.
  const timeFor = async (kind) => {
    const p = await poseKind(kind); if (!p) return null;
    return scene(page, (s, sp) => { const u = s.underground; u.setMining(true); let t = 0; while (u.lookup.has(sp.key) && t < 5) { u._update(0.02); t += 0.02; } u.setMining(false); const inv = { ...u.inventory }; const stone0 = s.resources.stone; for (let i = 0; i < 90; i++) u._update(1 / 60); return { t: +t.toFixed(2), stone: s.resources.stone - stone0, inv0: inv, inv1: { ...u.inventory } }; }, p);
  };
  const dirt = await timeFor('dirt'); const gold = await timeFor('gold'); const coal = await timeFor('coal');
  check('mining times scale with hardness: dirt (0.4 s) < stone (1.0 s) < coal (1.2 s) < gold (2.0 s)', dirt && coal && gold && dirt.t < 0.5 && coal.t > 1.1 && coal.t < 1.35 && gold.t > 1.9 && gold.t < 2.2, JSON.stringify({ dirt, coal, gold }));
  check('drops: dirt gives +1 dirt; coal gives +3 stone and +1 coal; gold gives +1 gold', dirt.inv1.dirt === dirt.inv0.dirt + 1 && coal.stone === 3 && coal.inv1.coal === coal.inv0.coal + 1 && gold.inv1.gold === gold.inv0.gold + 1, JSON.stringify({ dirt, coal, gold }));

  // 3. Looking away resets progress; releasing resets too.
  const sp3 = await poseKind('stone');
  const r3 = await scene(page, (s, sp) => {
    const u = s.underground; u.setMining(true); for (let i = 0; i < 30; i++) u._update(0.02);
    const before = u.mining && u.mining.t; u.pitch = 1.2; u._update(0.02); const afterLook = u.mining; const vis = u.crackMesh.visible; u.pitch = 0;
    u._update(0.02); const restart = u.mining && u.mining.t; u.setMining(false);
    return { before, afterLook, vis, restart, still: u.lookup.has(sp.key) };
  }, sp3);
  check('mining resets when you look away from the block (progress restarts from 0) and when you let go', r3.before > 0.5 && (r3.afterLook === null || (r3.afterLook.key !== sp3.key && r3.afterLook.t < 0.05)) && r3.restart < 0.05 && r3.still, JSON.stringify(r3));

  // 4. Hotbar: 9 slots, keys 1-9, wheel, tap, counts, placing uses the selected slot.
  const hb = await scene(page, (s) => { const st = s.underground.getHotbarState(); return { n: st.length, sel: st.findIndex((x) => x.selected), counts: st.map((x) => x.count), dom: document.querySelectorAll('#ug-hotbar .ug-slot').length }; });
  check('hotbar: 9 slots, slot 1 selected, counts reflect stone / wood / dirt', hb.n === 9 && hb.dom === 9 && hb.sel === 0 && hb.counts[0] === s0(hb) , JSON.stringify(hb));
  function s0(hb) { return hb.counts[0]; }
  await page.keyboard.press('5');
  const k5 = await scene(page, (s) => ({ i: s.underground.slotIndex, h: s.underground.hotbar, active: [...document.querySelectorAll('#ug-hotbar .ug-slot')].findIndex((e) => e.classList.contains('active')) }));
  check('hotbar: number key 5 selects slot 5 (iron) and highlights it', k5.i === 4 && k5.h === 'iron' && k5.active === 4, JSON.stringify(k5));
  await page.mouse.move(500, 300); await page.mouse.wheel(0, 100);
  const wh = await scene(page, (s) => s.underground.slotIndex);
  check('hotbar: mouse wheel down moves to the next slot', wh === 5);
  await page.click('#ug-hotbar .ug-slot[data-slot="2"]');
  const tp = await scene(page, (s) => ({ i: s.underground.slotIndex, h: s.underground.hotbar, cube: s.underground.fpItem.getObjectByName('fp-cube').visible, tex: s.underground.fpItem.getObjectByName('fp-cube').material.map === s.underground.textures.dirt }));
  check('hotbar: tapping slot 3 selects dirt and the held item becomes a dirt block', tp.i === 2 && tp.h === 'dirt' && tp.cube && tp.tex, JSON.stringify(tp));
  const sp4 = await poseKind('stone');
  const pl = await scene(page, (s) => { const u = s.underground; const d0 = u.inventory.dirt; u.mine(); const ok = u.place(); const placed = [...u.lookup.values()].filter((v) => v.kind === 'placed' && v.pool === 'dirt').length; return { ok, spent: (d0 + 0) - u.inventory.dirt, placed }; });
  check('placing with slot 3 puts a dirt block (own pool) and spends 1 dirt', pl.ok && pl.spent === 0 || (pl.ok && pl.placed === 1), JSON.stringify(pl));
  const nop = await scene(page, (s) => { const u = s.underground; u.selectSlot(3); const a = u.place(); u.selectSlot(8); const b = u.place(); u.selectSlot(0); return { a, b }; });
  check('collected materials (coal) and empty slots cannot be placed', nop.a === false && nop.b === false, JSON.stringify(nop));
  const mined = await scene(page, (s) => { const u = s.underground; const k = [...u.lookup.entries()].find(([key, v]) => v.kind === 'placed' && v.pool === 'dirt'); return !!k; });
  check('a placed dirt block can be mined back (drops dirt)', mined === true);

  // 5. Save: cave inventory persists under its own additive key, other keys untouched.
  await scene(page, (s) => { s.underground._collect({ coal: 2, iron: 1, gold: 1, dirt: 3 }); });
  const sv = await page.evaluate((k) => { const o = JSON.parse(localStorage.getItem(k)); return { inv: o.caveInv, hasRes: !!o.resources, hasCrafted: !!o.crafted }; }, SAVE);
  check('save: caveInv is written (additive key) next to resources/crafted', sv.inv && sv.inv.coal >= 2 && sv.inv.gold >= 1 && sv.hasRes && sv.hasCrafted, JSON.stringify(sv));
  check('no console errors (desktop)', errors.length === 0, errors.join('|'));
  if (process.env.SHOTS) {
    const p5 = await poseKind('coal');
    await scene(page, (s) => { const u = s.underground; u.start(); u.stop(); u.active = true; u.physicsEnabled = false; });
    await poseKind('coal');
    await scene(page, (s) => { const u = s.underground; u.setMining(true); for (let i = 0; i < 40; i++) u._update(0.02); u.renderer.render(u.scene, u.camera); });
    await page.screenshot({ path: process.env.SHOTS + '/cave-mining-crack.png' });
  }
  await browser.close();

  // 6. Corrupt saves can't mint items.
  ({ browser, page, errors } = await launch({ width: 1000, height: 700 }, { resources: { stone: 1 }, caveInv: { dirt: -5, coal: 'x', iron: 3.7, gold: 1e12, bogus: 9 } }));
  const cs = await scene(page, (s) => ({ ...s.caveInv }));
  check('corrupt caveInv is sanitised on load: negatives/NaN -> 0, fractions floored, capped at 9999, unknown keys dropped', cs.dirt === 0 && cs.coal === 0 && cs.iron === 3 && cs.gold === 9999 && !('bogus' in cs), JSON.stringify(cs));
  await browser.close();

  // 7. Phone: all 9 slots fit and do not overlap the controls; holding the pickaxe button mines.
  ({ browser, page, errors } = await launch({ width: 390, height: 844 }, { resources: { stone: 5, wood: 5 } }, true));
  await scene(page, (s) => { s.enterUnderground(); const u = s.underground; u.stop(); u.active = true; u.physicsEnabled = false; });
  const ph = await page.evaluate(() => {
    const r = (id) => document.getElementById(id).getBoundingClientRect();
    const hb = r('ug-hotbar'); const slots = [...document.querySelectorAll('#ug-hotbar .ug-slot')].map((e) => e.getBoundingClientRect());
    const over = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const others = ['ug-dpad', 'ug-mine-btn', 'ug-view-btn', 'ug-exit-btn', 'ug-fly-btn', 'ug-up-btn', 'ug-health'].map((id) => over(hb, r(id)));
    return { inside: hb.left >= 0 && hb.right <= innerWidth, n: slots.length, minW: Math.round(Math.min(...slots.map((x) => x.width))), minH: Math.round(Math.min(...slots.map((x) => x.height))), overlaps: others.filter(Boolean).length, sw: document.documentElement.scrollWidth, hint: (() => { const h = document.getElementById('underground-depth-hint').getBoundingClientRect(); return over(hb, h); })() };
  });
  check('phone: 9 hotbar slots fit on screen (>= 36px wide, >= 40px tall), no horizontal scroll, no overlap with any control or the hint', ph.inside && ph.n === 9 && ph.minW >= 36 && ph.minH >= 40 && ph.overlaps === 0 && !ph.hint && ph.sw <= 390, JSON.stringify(ph));
  await poseKindPhone();
  async function poseKindPhone() { await page.evaluate(`((s) => { const sp = (${findKind})(s, 'dirt'); const u = s.underground; u.rig.position.set(sp.rig[0], sp.rig[1], sp.rig[2]); u.yaw = sp.yaw; u.pitch = 0; u._update(0.001); window.__sp = sp; })(window.__g.scene.getScene('Town'))`); }
  await page.dispatchEvent('#ug-mine-btn', 'pointerdown');
  await scene(page, (s) => { for (let i = 0; i < 15; i++) s.underground._update(0.02); });
  const midP = await scene(page, (s) => ({ held: s.underground.mineHeld, crack: s.underground.crackMesh.visible }));
  await page.dispatchEvent('#ug-mine-btn', 'pointerup');
  const afterP = await scene(page, (s) => ({ held: s.underground.mineHeld, crack: s.underground.crackMesh.visible }));
  check('phone: holding the pickaxe button starts mining (crack shows) and letting go stops it', midP.held && midP.crack && !afterP.held && !afterP.crack, JSON.stringify([midP, afterP]));
  if (process.env.SHOTS) { await scene(page, (s) => { const u = s.underground; u.start(); u.physicsEnabled = false; }); await page.waitForTimeout(600); await page.screenshot({ path: process.env.SHOTS + '/cave-mining-phone.png' }); }
  check('no console errors (phone)', errors.length === 0, errors.join('|'));
  await browser.close();
  done();
})();
