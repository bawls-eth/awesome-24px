const { launch, scene, check, done } = require('./helpers');
const SEED = { resources: { wood: 20, stone: 20, fish: 5, bugs: 9, fruit: 6, shells: 4, flowers: 5 } };

(async () => {
  // 1. Craft: exact cost, no-op when short, achievements, save key, HUD chip.
  let { browser, page, errors } = await launch({ width: 1000, height: 700 }, SEED);
  let r = await scene(page, (s) => {
    s.localBody.setPosition(2500, 2500); s.interact();
    const farOpen = !!s.workbenchOpen;
    s.localBody.setPosition(1330, 830); s.interact();
    const open = !!s.workbenchOpen;
    document.querySelector('[data-recipe=plank]').click();
    const after = { wood: s.resources.wood, plank: s.craftedGoods.plank, ach: s.achievementsUnlocked.has('craft1') };
    const chip = !document.getElementById('crafted-count').parentElement.classList.contains('hidden');
    s.resources.wood = 0;
    const noop = s.craftRecipe('plank');
    const note = document.getElementById('workbench-note').textContent;
    const save = JSON.parse(localStorage.getItem('pixeltown-save-v1'));
    return { farOpen, open, after, chip, noop, note, saveCrafted: save.crafted, saveHasOld: !!save.resources };
  });
  check('far away: E does not open workbench', r.farOpen === false);
  check('near: E opens workbench', r.open === true);
  check('craft subtracts exact cost + adds good + craft1 achievement', r.after.wood === 17 && r.after.plank === 1 && r.after.ach, JSON.stringify(r.after));
  check('HUD chip shows crafted goods', r.chip === true);
  check('short on resources is a no-op with a "Need" note', r.noop === false && /Need/.test(r.note), r.note);
  check('crafted persists to additive save key; old keys intact', r.saveCrafted && r.saveCrafted.plank === 1 && r.saveHasOld);
  r = await scene(page, (s) => {
    for (const id of ['plank', 'brick', 'stew', 'bugjar', 'pie', 'crown', 'chime', 'lantern']) {
      Object.keys(s.resources).forEach((k) => { s.resources[k] += 10; }); s.craftRecipe(id); if (id === 'plank') s.craftRecipe(id);
    }
    return { all: s.achievementsUnlocked.has('craftAll'), ten: s.achievementsUnlocked.has('craft10') };
  });
  check('craftAll + craft10 achievements unlock', r.all && r.ten, JSON.stringify(r));
  // 2. Walk away closes the overlay.
  r = await scene(page, (s) => { s.localBody.setPosition(2500, 2500); return true; });
  await page.waitForTimeout(300);
  r = await scene(page, (s) => ({ open: !!s.workbenchOpen, hidden: document.getElementById('workbench-overlay').classList.contains('hidden') }));
  check('walking away closes the workbench', r.open === false && r.hidden === true, JSON.stringify(r));
  // 3. Selling crafted goods pays stars and clears them.
  r = await scene(page, (s) => {
    s.resources = Object.fromEntries(Object.keys(s.resources).map((k) => [k, 0]));
    s.craftedGoods.lantern = 2; s.localBody.setPosition(1075, 850);
    const before = s.score || 0; s.sellAtShop();
    return { lantern: s.craftedGoods.lantern, gained: (s.score || 0) - before };
  });
  check('selling clears crafted goods', r.lantern === 0, JSON.stringify(r));
  check('no console errors (desktop)', errors.length === 0, errors.join('|'));
  await browser.close();

  // 4. Legacy / corrupt saves load cleanly.
  ({ browser, page, errors } = await launch({ width: 1000, height: 700 }, { name: 'old', crafted: { plank: -3, brick: 'x', stew: 2.9 } }));
  r = await scene(page, (s) => s.craftedGoods);
  check('corrupt crafted values sanitized', r.plank === 0 && r.brick === 0 && r.stew === 2, JSON.stringify(r));
  check('no console errors (corrupt save)', errors.length === 0, errors.join('|'));
  await browser.close();

  // 5. Phone: overlay fits, A button opens it, Esc-equivalent closes.
  ({ browser, page, errors } = await launch({ width: 390, height: 844 }, SEED, true));
  await scene(page, (s) => { s.localBody.setPosition(1330, 830); });
  await page.waitForTimeout(300);
  await page.click('#interact-btn');
  await page.waitForTimeout(300);
  const box = await page.evaluate(() => { const b = document.querySelector('#workbench-overlay .join-card').getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, sw: document.documentElement.scrollWidth }; });
  check('phone: A button opens workbench', await page.evaluate(() => !document.getElementById('workbench-overlay').classList.contains('hidden')));
  check('phone: card fits the 390x844 screen', box.l >= 0 && box.r <= 390 && box.b <= 844 && box.sw <= 390, JSON.stringify(box));
  if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + '/wb-phone.png' });
  await page.click('#workbench-close-btn');
  check('phone: close button works', await scene(page, (s) => !s.workbenchOpen));
  check('no console errors (phone)', errors.length === 0, errors.join('|'));
  console.log('fps', await page.evaluate(() => window.__g.loop.actualFps));
  await browser.close();
  done();
})();
