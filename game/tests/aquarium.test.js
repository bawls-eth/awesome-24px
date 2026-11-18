const { launch, scene, check, done } = require('./helpers');
const LOG = { caught: { koi: { n: 2, best: 40 }, shark: { n: 1, best: 70 }, squid: { n: 1, best: 30 }, jelly: { n: 1, best: 22 }, minnow: { n: 3, best: 12 } }, claimed: [], lastDay: 1 };

(async () => {
  // 1. Needs a logged fish; nothing consumed; saves additively inside `home`.
  let { browser, page, errors } = await launch({ width: 1000, height: 700 }, { fishlog: LOG });
  const a = await scene(page, (s) => {
    const refusedUnknown = s.setTankSlot(0, 'ghost'); const refusedUncaught = s.setTankSlot(0, 'goldfish');
    s.localBody.setPosition(HOME_POS.x, HOME_POS.y + 60); s.openHome();
    const opts = [...document.querySelectorAll('#home-tank-0 option')].map((o) => o.value);
    const ok = s.setTankSlot(0, 'koi');
    const save = JSON.parse(localStorage.getItem('pixeltown-save-v1'));
    return { refusedUnknown, refusedUncaught, opts, ok, tank: s.home.tank, saved: save.home.tank, slots: save.home.slots, koi: s.fishlog.caught.koi.n, sprites: s.homeTankSprites.length, cozy: s.homeCozy(), ach: s.achievementsUnlocked.has('tank1'), label: s.homeLabel.text };
  });
  check('aquarium: unknown or never-caught species are refused', a.refusedUnknown === false && a.refusedUncaught === false);
  check('aquarium: dropdown offers only logged species', JSON.stringify(a.opts.sort()) === JSON.stringify(['', 'jelly', 'koi', 'minnow', 'shark', 'squid']), JSON.stringify(a.opts));
  check('aquarium: showing a fish saves into home.tank (additive), consumes nothing, draws a sprite', a.ok && a.saved[0] === 'koi' && Array.isArray(a.slots) && a.koi === 2 && a.sprites === 1, JSON.stringify(a));
  check('aquarium: koi (rarity 2) adds 4 cozy; Fish Fan achievement', a.cozy === 4 && /cozy 4/.test(a.label) && a.ach === true, JSON.stringify([a.cozy, a.label]));

  // 2. No duplicates; fill/clear; Aquarist; Cozy Corner via fish alone.
  const b = await scene(page, (s) => {
    const dup = s.setTankSlot(1, 'koi');
    const optsSlot1 = [...document.querySelectorAll('#home-tank-1 option')].map((o) => o.value);
    s.setTankSlot(1, 'shark'); s.setTankSlot(2, 'squid');
    const full = { tank: [...s.home.tank], tankFull: s.lifetimeStats.tankFull, aquarist: s.achievementsUnlocked.has('tank3'), cozy: s.homeCozy(), sprites: s.homeTankSprites.length };
    s.setTankSlot(2, 'jelly'); const swapped = s.home.tank[2];
    s.setTankSlot(0, null); const cleared = { tank: [...s.home.tank], sprites: s.homeTankSprites.length, cozy: s.homeCozy() };
    return { dup, koiOfferedInSlot1: optsSlot1.includes('koi'), full, swapped, cleared };
  });
  check('aquarium: the same species cannot fill two tank slots (refused and not offered)', b.dup === false && b.koiOfferedInSlot1 === false, JSON.stringify(b));
  check('aquarium: filling 3 slots unlocks Aquarist; cozy = (2+4+3)x2 = 18', b.full.tank.join() === 'koi,shark,squid' && b.full.tankFull === 1 && b.full.aquarist && b.full.cozy === 18 && b.full.sprites === 3, JSON.stringify(b.full));
  check('aquarium: swapping and clearing update sprites and cozy (jelly 3x2 + shark 4x2 = 14)', b.swapped === 'jelly' && b.cleared.sprites === 2 && b.cleared.cozy === 14 && b.cleared.tank[0] === null, JSON.stringify(b));

  // 3. Fish cozy counts toward the daily visitor bonus and Cozy Corner.
  const c = await scene(page, (s) => {
    s.craftedGoods.lantern = 2; s.setHomeSlot(0, 'lantern'); s.setHomeSlot(1, 'lantern'); // +18
    s.closeHome(); s.home.paidDay = 0; const s0 = s.localScore; s.openHome(); const bonus = s.localScore - s0;
    return { cozy: s.homeCozy(), bonus, corner: s.achievementsUnlocked.has('homeCozy') };
  });
  check('aquarium: fish cozy feeds the visitor bonus (cozy 32 -> +6) and Cozy Corner', c.cozy === 32 && c.bonus >= 6 && c.corner === true, JSON.stringify(c));
  check('no console errors (desktop)', errors.length === 0, errors.join('|'));
  await browser.close();

  // 4. Reload persistence + corrupt saves + old saves without tank.
  ({ browser, page, errors } = await launch({ width: 1000, height: 700 }, { fishlog: LOG, home: { slots: [null, null, null, null, null, null], tank: ['shark', 'shark', 'koi'], paidDay: 0 } }));
  const d = await scene(page, (s) => ({ tank: s.home.tank, sprites: s.homeTankSprites.length }));
  check('reload: tank restored and de-duplicated; sprites drawn', d.tank.join() === 'shark,,koi' && d.sprites === 2, JSON.stringify(d));
  await browser.close();
  for (const bad of ['x', { slots: [], tank: 'q' }, { tank: [5, null, 'nope'] }, { tank: ['__proto__', 'koi', 'koi'] }, [1], { slots: [] }]) {
    ({ browser, page, errors } = await launch({ width: 1000, height: 700 }, { fishlog: LOG, home: bad }));
    const r = await scene(page, (s) => { s.localBody.setPosition(HOME_POS.x, HOME_POS.y + 60); s.interact(); return { open: !!s.homeOpen, tank: s.home.tank, n: document.querySelectorAll('#home-tank-list li').length }; });
    const ok = r.open && r.n === 3 && r.tank.length === 3 && r.tank.every((x) => x === null || ['koi', 'shark', 'squid', 'jelly', 'minnow'].includes(x)) && new Set(r.tank.filter(Boolean)).size === r.tank.filter(Boolean).length;
    check(`corrupt home.tank ${JSON.stringify(bad)}: sane, no errors`, ok && errors.length === 0, JSON.stringify(r) + errors.join('|'));
    await browser.close();
  }

  // 5. Phone.
  ({ browser, page, errors } = await launch({ width: 390, height: 844 }, { fishlog: LOG, home: { slots: [null, null, null, null, null, null], tank: ['koi', 'shark', null], paidDay: 0 } }, true));
  await scene(page, (s) => { s.localBody.setPosition(HOME_POS.x + 40, HOME_POS.y + 60); });
  await page.waitForTimeout(300);
  await page.click('#interact-btn');
  await page.waitForTimeout(300);
  const ph = await page.evaluate(() => { const c = document.querySelector('#home-overlay .join-card').getBoundingClientRect(); const sel = document.querySelector('#home-tank-0').getBoundingClientRect(); return { open: !document.getElementById('home-overlay').classList.contains('hidden'), l: c.left, r: c.right, b: c.bottom, sh: sel.height, sw: document.documentElement.scrollWidth }; });
  check('phone: home overlay with aquarium fits 390x844; tank selects >= 44px', ph.open && ph.l >= 0 && ph.r <= 390 && ph.b <= 844 && ph.sw <= 390 && ph.sh >= 44, JSON.stringify(ph));
  if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + '/aquarium-phone.png' });
  check('no console errors (phone)', errors.length === 0, errors.join('|'));
  await browser.close();
  // The tank footprint must not sit on an obstacle, a portal door/label or another landmark.
  ({ browser, page, errors } = await launch({ width: 1000, height: 700 }));
  const fp = await scene(page, (s) => {
    const cx = HOME_POS.x + HOME_TANK_OFFSET.x; const cy = HOME_POS.y + HOME_TANK_OFFSET.y;
    const hits = s.obstacles.getChildren().filter((r) => r.x + r.width / 2 > cx - 40 && r.x - r.width / 2 < cx + 40 && r.y + r.height / 2 > cy - 34 && r.y - r.height / 2 < cy + 34).length;
    const texts = s.children.list.filter((c) => c.type === 'Text' && c.visible && /Racing|GTA|Vice|NFS|Arcade|Polyroll|Workbench|Mailbox/.test(c.text) && Math.abs(c.x - cx) < 90 && Math.abs(c.y - cy) < 40).map((c) => c.text);
    return { hits, texts, cx, cy };
  });
  check('aquarium: tank footprint overlaps no obstacle or nearby label/door', fp.hits === 0 && fp.texts.length === 0, JSON.stringify(fp));
  await browser.close();

  // 6. World screenshot of the plot + tank.
  ({ browser, page, errors } = await launch({ width: 1000, height: 700 }, { fishlog: LOG, home: { slots: ['lantern', 'pie', null, null, null, null], tank: ['koi', 'shark', 'squid'], paidDay: 0 }, crafted: {} }));
  await scene(page, (s) => { s.localBody.setPosition(HOME_POS.x + 60, HOME_POS.y + 95); document.getElementById('whats-new-banner').style.display = 'none'; });
  await page.waitForTimeout(1200);
  if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + '/aquarium-world.png' });
  await browser.close();
  done();
})();
