const { launch, scene, check, done } = require('./helpers');
const GOODS = { crafted: { plank: 2, lantern: 1, pie: 1, brick: 1, crown: 1, chime: 1, stew: 1, bugjar: 1 } };

(async () => {
  // 1. Open near, not far; slot swap moves goods between bag and plot; save is additive.
  let { browser, page, errors } = await launch({ width: 1000, height: 700 }, GOODS);
  const a = await scene(page, (s) => {
    s.localBody.setPosition(2500, 2500); s.interact(); const far = !!s.homeOpen;
    s.localBody.setPosition(1650, 1000); s.interact();
    const open = !!s.homeOpen; const canAct = s.canAct();
    const optionsBefore = document.querySelectorAll('#home-slot-0 option').length;
    const sel = document.getElementById('home-slot-0'); sel.value = 'lantern'; sel.dispatchEvent(new Event('change'));
    const save = JSON.parse(localStorage.getItem('pixeltown-save-v1'));
    const placed = { slot: s.home.slots[0], bag: s.craftedGoods.lantern, savedSlots: save.home.slots, savedCrafted: save.crafted.lantern, sprites: s.homeSprites.length, cozy: s.homeCozy(), ach: s.achievementsUnlocked.has('homeFirst') };
    // Replace with another good: old returns to the bag.
    s.setHomeSlot(0, 'plank');
    const swapped = { lantern: s.craftedGoods.lantern, plank: s.craftedGoods.plank, slot: s.home.slots[0] };
    s.setHomeSlot(0, null);
    const removed = { plank: s.craftedGoods.plank, slot: s.home.slots[0], sprites: s.homeSprites.length };
    return { far, open, canAct, optionsBefore, placed, swapped, removed, vis: !document.getElementById('home-overlay').classList.contains('hidden') };
  });
  check('home: far away does not open; near opens; input blocked', a.far === false && a.open === true && a.vis === true && a.canAct === false);
  check('home: placing a good moves it from the bag to the slot, saved additively, sprite drawn', a.placed.slot === 'lantern' && a.placed.bag === 0 && a.placed.savedSlots[0] === 'lantern' && a.placed.savedCrafted === 0 && a.placed.sprites === 1, JSON.stringify(a.placed));
  check('home: cozy score = good value (lantern 9) + Home Sweet Home achievement', a.placed.cozy === 9 && a.placed.ach === true);
  check('home: swapping returns the old good; removing returns it to the bag', a.swapped.lantern === 1 && a.swapped.plank === 1 && a.removed.plank === 2 && a.removed.slot === null && a.removed.sprites === 0, JSON.stringify([a.swapped, a.removed]));

  const clear = await scene(page, (s) => {
    // The plot's footprint must not overlap any static obstacle or sit on another landmark.
    const x0 = 1650 - 80, x1 = 1650 + 80, y0 = 940 - 50, y1 = 940 + 50;
    return s.obstacles.getChildren().filter((r) => r.x + r.width / 2 > x0 && r.x - r.width / 2 < x1 && r.y + r.height / 2 > y0 && r.y - r.height / 2 < y1).length;
  });
  check('home: plot footprint overlaps no obstacle (trees, houses...)', clear === 0, String(clear));

  // 2. Cannot place goods you do not have; full plot + cozy achievements; daily bonus pays once.
  const b = await scene(page, (s) => {
    const refused = s.setHomeSlot(1, 'pie') && s.setHomeSlot(2, 'pie'); // only 1 pie
    s.home.slots = new Array(6).fill(null); ['plank', 'brick', 'lantern', 'pie', 'crown', 'chime'].forEach((id, i) => { s.craftedGoods = { ...s.craftedGoods, [id]: Math.max(1, s.craftedGoods[id] || 0) }; s.setHomeSlot(i, id); });
    return { refused, full: s.home.slots.every(Boolean), cozy: s.homeCozy(), fullAch: s.achievementsUnlocked.has('homeFull'), cozyAch: s.achievementsUnlocked.has('homeCozy') };
  });
  check('home: cannot place a good you do not own', b.refused === false);
  check('home: full plot + cozy>=30 unlock Interior Designer and Cozy Corner', b.full && b.cozy >= 30 && b.fullAch && b.cozyAch, JSON.stringify(b));
  const c = await scene(page, (s) => {
    s.closeHome(); s.home.paidDay = 0; const s0 = s.localScore; s.openHome(); const first = s.localScore - s0;
    s.closeHome(); const s1 = s.localScore; s.openHome(); const second = s.localScore - s1;
    const real = s.questDayBucket(); s.closeHome(); s.questDayBucket = () => real + 1; const s2 = s.localScore; s.openHome(); const next = s.localScore - s2;
    return { first, second, next, cozy: s.homeCozy() };
  });
  check('home: daily visitor bonus pays once per day (cozy/5, cap 6)', c.first >= Math.min(6, Math.floor(c.cozy / 5)) && c.second === 0 && c.next >= 1, JSON.stringify(c));

  // 3. Persistence across reload and walk-away close.
  await scene(page, (s) => { s.localBody.setPosition(2500, 2500); });
  await page.waitForTimeout(300);
  check('home: walking away closes the plot', await scene(page, (s) => !s.homeOpen));
  await page.reload();
  await page.fill('#name-input', 'ADMINtest'); await page.click('.species-tab'); await page.waitForTimeout(150); await page.click('.avatar-choice'); await page.click('#join-btn');
  await page.waitForSelector('#player-list-panel'); await page.waitForTimeout(1500);
  const d = await scene(page, (s) => ({ slots: s.home.slots, sprites: s.homeSprites.length }));
  check('reload: placed goods persist and are drawn', d.slots.every(Boolean) && d.sprites === 6, JSON.stringify(d));
  check('no console errors (desktop)', errors.length === 0, errors.join('|'));
  await browser.close();

  // 4. Corrupt save values.
  for (const bad of ['x', { slots: 'q', paidDay: -3 }, { slots: ['__proto__', 5, 'plank', null, 'nope', 'lantern'] }, [1], null]) {
    ({ browser, page, errors } = await launch({ width: 1000, height: 700 }, { ...GOODS, home: bad }));
    const r = await scene(page, (s) => { s.localBody.setPosition(1650, 1000); s.interact(); return { open: !!s.homeOpen, slots: s.home.slots }; });
    const ok = r.open && r.slots.length === 6 && r.slots.every((x) => x === null || ['plank', 'lantern'].includes(x)) && errors.length === 0;
    check(`corrupt home ${JSON.stringify(bad)}: sane slots, no errors`, ok, JSON.stringify(r) + errors.join('|'));
    await browser.close();
  }

  // 5. Phone.
  ({ browser, page, errors } = await launch({ width: 390, height: 844 }, GOODS, true));
  await scene(page, (s) => { s.localBody.setPosition(1650, 1000); });
  await page.waitForTimeout(300);
  await page.click('#interact-btn');
  await page.waitForTimeout(300);
  const ph = await page.evaluate(() => {
    const card = document.querySelector('#home-overlay .join-card').getBoundingClientRect();
    const sel = document.querySelector('.home-slot-select').getBoundingClientRect();
    return { open: !document.getElementById('home-overlay').classList.contains('hidden'), l: card.left, r: card.right, b: card.bottom, sh: sel.height, sw: document.documentElement.scrollWidth };
  });
  check('phone: A button opens home plot', ph.open);
  check('phone: card fits 390x844, selects >= 44px tall', ph.l >= 0 && ph.r <= 390 && ph.b <= 844 && ph.sw <= 390 && ph.sh >= 44, JSON.stringify(ph));
  await scene(page, (s) => { s.setHomeSlot(0, 'lantern'); s.setHomeSlot(1, 'pie'); s.setHomeSlot(4, 'plank'); });
  if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + '/home-phone.png' });
  check('no console errors (phone)', errors.length === 0, errors.join('|'));
  console.log('fps', await page.evaluate(() => window.__g.loop.actualFps));
  await browser.close();
  done();
})();
