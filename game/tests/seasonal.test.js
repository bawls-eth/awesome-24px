const { launch, scene, check, done } = require('./helpers');
const SEED = { resources: { wood: 20, stone: 20, fish: 5, bugs: 9, fruit: 9, shells: 9, flowers: 9 } };

(async () => {
  let { browser, page, errors } = await launch({ width: 1000, height: 700 }, SEED);
  // 1. Season helper + workbench list: only the current season's special is craftable.
  const a = await scene(page, (s) => {
    const out = {};
    for (const season of ['spring', 'summer', 'autumn', 'winter']) {
      s.currentSeason = () => season;
      s.localBody.setPosition(WORKBENCH_POS.x, WORKBENCH_POS.y + 30); s.openWorkbench();
      const enabled = [...document.querySelectorAll('.workbench-craft-btn')].filter((b) => !b.disabled).map((b) => b.dataset.recipe);
      const seasonal = RECIPES.filter((r) => r.season).map((r) => r.id);
      out[season] = { seasonalEnabled: enabled.filter((id) => seasonal.includes(id)), header: document.getElementById('workbench-season').textContent, rows: document.querySelectorAll('#workbench-list button[data-recipe]').length };
      s.closeWorkbench();
    }
    return out;
  });
  check('seasonal: exactly one special is craftable in each season', a.spring.seasonalEnabled.join() === 'wreath' && a.summer.seasonalEnabled.join() === 'umbrella' && a.autumn.seasonalEnabled.join() === 'jacko' && a.winter.seasonalEnabled.join() === 'snowman', JSON.stringify(a));
  check('seasonal: header names the season; 12 recipes listed', /winter/.test(a.winter.header) && a.winter.rows === 12, JSON.stringify([a.winter.header, a.winter.rows]));

  // 2. Crafting: in season works with exact cost; out of season refuses and keeps resources.
  const b = await scene(page, (s) => {
    s.currentSeason = () => 'winter';
    const before = { stone: s.resources.stone, wood: s.resources.wood };
    const ok = s.craftRecipe('snowman');
    const after = { stone: s.resources.stone, wood: s.resources.wood, goods: s.craftedGoods.snowman };
    const refused = s.craftRecipe('jacko'); const noteOut = document.getElementById('workbench-note') && document.getElementById('workbench-note').textContent;
    const fruitUntouched = s.resources.fruit === 9 && s.craftedGoods.jacko === 0;
    const save = JSON.parse(localStorage.getItem('pixeltown-save-v1'));
    return { ok, spent: [before.stone - after.stone, before.wood - after.wood], goods: after.goods, refused, noteOut, fruitUntouched, savedSnowman: save.crafted.snowman, ach: s.achievementsUnlocked.has('craftSeason'), master: s.achievementsUnlocked.has('craftAll') };
  });
  check('seasonal: in-season craft spends exact cost (4 stone + 2 wood) and saves', b.ok && b.spent[0] === 4 && b.spent[1] === 2 && b.goods === 1 && b.savedSnowman === 1, JSON.stringify(b));
  check('seasonal: out-of-season craft is refused and spends nothing', b.refused === false && b.fruitUntouched && /only be crafted in autumn/.test(b.noteOut), JSON.stringify(b));
  check('seasonal: Seasonal Crafter unlocks; Master Crafter does NOT need seasonal goods', b.ach === true && b.master === false);

  // 3. Master Crafter still needs only the 8 year-round recipes; Year-Round needs all four seasons.
  const c = await scene(page, (s) => {
    for (const id of ['plank', 'brick', 'stew', 'bugjar', 'pie', 'crown', 'chime', 'lantern']) { Object.keys(s.resources).forEach((k) => { s.resources[k] += 10; }); s.craftRecipe(id); }
    const master = s.achievementsUnlocked.has('craftAll');
    const yearBefore = s.achievementsUnlocked.has('craftYear');
    for (const [season, id] of [['spring', 'wreath'], ['summer', 'umbrella'], ['autumn', 'jacko']]) { s.currentSeason = () => season; Object.keys(s.resources).forEach((k) => { s.resources[k] += 10; }); s.craftRecipe(id); }
    return { master, yearBefore, year: s.achievementsUnlocked.has('craftYear') };
  });
  check('seasonal: Master Crafter unlocks from year-round recipes alone; Year-Round after all 4 seasons', c.master && !c.yearBefore && c.year, JSON.stringify(c));

  // 4. Seasonal goods sell and can be displayed any time of year.
  const d = await scene(page, (s) => {
    s.currentSeason = () => 'summer';
    s.localBody.setPosition(HOME_POS.x, HOME_POS.y + 60); s.openHome();
    const placed = s.setHomeSlot(0, 'snowman'); const cozy = s.homeCozy(); s.closeHome();
    s.setHomeSlot(0, null);
    s.localBody.setPosition(1075, 850); const s0 = s.localScore; s.craftedGoods.wreath = 2; s.sellAtShop();
    return { placed, cozy, sold: s.localScore - s0, left: s.craftedGoods.wreath };
  });
  check('seasonal: out-of-season goods can be placed at home (cozy 9)', d.placed && d.cozy === 9, JSON.stringify(d));
  check('seasonal: seasonal goods sell at the shop (2 wreaths >= 18 stars)', d.sold >= 18 && d.left === 0, JSON.stringify(d));

  // 5. Old saves/corrupt crafted values with new ids load cleanly.
  check('no console errors (desktop)', errors.length === 0, errors.join('|'));
  await browser.close();
  ({ browser, page, errors } = await launch({ width: 1000, height: 700 }, { crafted: { snowman: -3, wreath: 'x', jacko: 2.8, plank: 1 }, home: { slots: ['snowman', 'nope', null, null, null, null] } }));
  const e = await scene(page, (s) => ({ goods: s.craftedGoods, slot0: s.home.slots[0] }));
  check('legacy/corrupt saves: new recipe ids sanitised (negative/str -> 0, 2.8 -> 2), home keeps valid seasonal id', e.goods.snowman === 0 && e.goods.wreath === 0 && e.goods.jacko === 2 && e.goods.plank === 1 && e.slot0 === 'snowman', JSON.stringify(e));
  await browser.close();

  // 6. Phone: workbench with 12 rows fits and the seasonal row is visible and 44px tall.
  ({ browser, page, errors } = await launch({ width: 390, height: 844 }, SEED, true));
  await scene(page, (s) => { s.currentSeason = () => 'winter'; s.localBody.setPosition(WORKBENCH_POS.x, WORKBENCH_POS.y + 30); });
  await page.waitForTimeout(300);
  await page.click('#interact-btn');
  await page.waitForTimeout(300);
  const ph = await page.evaluate(() => {
    const card = document.querySelector('#workbench-overlay .join-card').getBoundingClientRect();
    const btn = document.querySelector('[data-recipe=snowman]'); btn.scrollIntoView(); const bb = btn.getBoundingClientRect();
    return { open: !document.getElementById('workbench-overlay').classList.contains('hidden'), l: card.left, r: card.right, b: card.bottom, bh: bb.height, dis: btn.disabled, sw: document.documentElement.scrollWidth };
  });
  check('phone: workbench opens via A, fits 390x844, snowman craftable with >= 40px button', ph.open && ph.l >= 0 && ph.r <= 390 && ph.b <= 844 && ph.sw <= 390 && ph.bh >= 40 && ph.dis === false, JSON.stringify(ph));
  if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + '/season-phone.png' });
  check('no console errors (phone)', errors.length === 0, errors.join('|'));
  console.log('fps', await page.evaluate(() => window.__g.loop.actualFps));
  await browser.close();
  done();
})();
