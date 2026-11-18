const { launch, scene, check, done } = require('./helpers');

(async () => {
  // 1. Determinism + placement sanity.
  let { browser, page, errors } = await launch();
  const a = await scene(page, (s) => ({ day: s.weedDay, spots: s.weedSpots, next: s.weedSpotsForDay(s.weedDay + 1) }));
  const b2 = await launch();
  const b = await scene(b2.page, (s) => ({ day: s.weedDay, spots: s.weedSpots }));
  await b2.browser.close();
  check('weeds: two clients get identical spots today', JSON.stringify(a.spots) === JSON.stringify(b.spots));
  check('weeds: tomorrow differs', JSON.stringify(a.spots) !== JSON.stringify(a.next));
  check('weeds: >= 20 placed, all inside the village', a.spots.length >= 20 && a.spots.every((p) => p.x >= 0 && p.x <= 2400 && p.y >= 0 && p.y <= 1200), String(a.spots.length));
  const clash = await scene(page, (s) => s.weedSpots.filter((p) => s.obstacles.getChildren().some((r) => Math.abs(p.x - r.x) < r.width / 2 && Math.abs(p.y - r.y) < r.height / 2)).length);
  check('weeds: none inside an obstacle', clash === 0, String(clash));

  check('weeds: none on the home plot footprint', a.spots.every((p) => !(Math.abs(p.x - 1650) < 175 && Math.abs(p.y - 940) < 80)));

  // Player-built blocks (extra static bodies) must not change the day's weeds.
  const sameWithBlock = await scene(page, (s) => {
    const day = s.weedDay + 1; const base = JSON.stringify(s.weedSpotsForDay(day));
    const w = s.weedSpots[3]; s.addObstacleRect({ x: w.x - 20, y: w.y - 20, width: 40, height: 40 });
    return base === JSON.stringify(s.weedSpotsForDay(day));
  });
  check('weeds: late-synced player blocks do not change the weed layout', sameWithBlock === true);

  // 2. Pull: hides the weed, +1 star, saves additively, tidiness drops.
  const before = await scene(page, (s) => ({ score: s.localScore, left: s.weedsLeft(), keys: Object.keys(JSON.parse(localStorage.getItem('pixeltown-save-v1') || '{}')) }));
  const g0 = await scene(page, (s) => s.children.list.filter((c) => c.type === 'Graphics').length);
  const r = await scene(page, (s) => {
    const w = s.weedSpots[0]; s.localBody.setPosition(w.x, w.y); s.interact();
    const save = JSON.parse(localStorage.getItem('pixeltown-save-v1'));
    return { score: s.localScore, left: s.weedsLeft(), tidy: document.getElementById('town-tidy').textContent, saved: save.weedsPulled, stat: s.lifetimeStats.weedsPulled, ach: s.achievementsUnlocked.has('weeds10') };
  });
  await page.waitForTimeout(400);
  const vis = await scene(page, (s) => s.weedSprites[0].visible);
  check('pull: weed hides', vis === false);
  check('pull: +1 star', r.score === before.score + 1, JSON.stringify([before.score, r.score]));
  check('pull: tidiness decrements and HUD text updates', r.left === before.left - 1 && r.tidy.includes(`(${r.left} weeds)`), r.tidy);
  check('pull: additive save key, other keys kept', r.saved && r.saved.ids.length === 1 && !!JSON.parse(JSON.stringify(r.saved)).day, JSON.stringify(r.saved));
  check('pull: lifetime stat counts', r.stat === 1);
  const g1 = await scene(page, (s) => s.children.list.filter((c) => c.type === 'Graphics').length);
  check('perf: pulling creates no Graphics objects', g1 <= g0, `${g0}->${g1}`);

  // 3. Persists across reload; returns on a new day; achievements.
  const r3 = await scene(page, (s) => {
    s.lifetimeStats.weedsPulled = 9; s.saveAchievements();
    const w = s.weedSpots[1]; s.localBody.setPosition(w.x, w.y); s.interact();
    const ten = s.achievementsUnlocked.has('weeds10');
    const realDay = s.weedDay;
    s.questDayBucket = () => realDay + 1; s.refreshWeeds();
    const nextDayLeft = s.weedsLeft(); const nextDayVisible = s.weedSprites.filter((x) => x.visible).length;
    s.questDayBucket = () => realDay; s.refreshWeeds();
    const back = s.weedSprites[0].visible === false && s.weedSprites[1].visible === false;
    return { ten, nextDayLeft, nextDayVisible, n: s.weedSpots.length, back };
  });
  check('achievement: Weed Whacker at 10 pulls', r3.ten === true);
  check('new day: all weeds are back; same day: pulled ones stay gone', r3.nextDayLeft === r3.n && r3.nextDayVisible === r3.n && r3.back === true, JSON.stringify(r3));
  const r4 = await scene(page, (s) => {
    s.lifetimeStats.weedsPulled = 99; s.saveAchievements();
    s.weedSpots.forEach((w, i) => { if (!s.weedsPulledToday.has(i)) { s.localBody.setPosition(w.x, w.y); s.interact(); } });
    return { left: s.weedsLeft(), spotless: s.achievementsUnlocked.has('spotless1'), g: s.achievementsUnlocked.has('weeds100'), tidy: document.getElementById('town-tidy').textContent };
  });
  check('clearing every weed: Spotless + Groundskeeper achievements, HUD says Spotless', r4.left === 0 && r4.spotless && r4.g && /Spotless/.test(r4.tidy), JSON.stringify(r4));
  await page.reload();
  await page.fill('#name-input', 'ADMINtest'); await page.click('.species-tab'); await page.waitForTimeout(150); await page.click('.avatar-choice'); await page.click('#join-btn');
  await page.waitForSelector('#player-list-panel'); await page.waitForTimeout(1500);
  const r5 = await scene(page, (s) => ({ left: s.weedsLeft(), vis: s.weedSprites.filter((x) => x.visible).length }));
  check('reload: pulled weeds stay pulled the same day', r5.left === 0 && r5.vis === 0, JSON.stringify(r5));
  check('no console errors (desktop)', errors.length === 0, errors.join('|'));
  await browser.close();

  // 4. Corrupt save value is ignored.
  ({ browser, page, errors } = await launch({ width: 1000, height: 700 }, { weedsPulled: 'junk' }));
  check('corrupt weedsPulled ignored', (await scene(page, (s) => s.weedsLeft())) === (await scene(page, (s) => s.weedSpots.length)));
  check('no console errors (corrupt save)', errors.length === 0, errors.join('|'));
  await browser.close();

  // 5. Phone: A button pulls a weed; HUD readout visible.
  ({ browser, page, errors } = await launch({ width: 390, height: 844 }, null, true));
  await scene(page, (s) => { const w = s.weedSpots[2]; s.localBody.setPosition(w.x, w.y); });
  await page.waitForTimeout(300);
  await page.click('#interact-btn');
  await page.waitForTimeout(500);
  check('phone: A button pulls a weed', await scene(page, (s) => s.weedsPulledToday.has(2)));
  const tidyBox = await page.evaluate(() => { const r = document.getElementById('town-tidy').getBoundingClientRect(); return { l: r.left, r: r.right, w: r.width }; });
  check('phone: tidiness readout on screen', tidyBox.w > 0 && tidyBox.l >= 0 && tidyBox.r <= 390, JSON.stringify(tidyBox));
  if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + '/weeds-phone.png' });
  check('no console errors (phone)', errors.length === 0, errors.join('|'));
  console.log('fps', await page.evaluate(() => window.__g.loop.actualFps));
  await browser.close();
  done();
})();
