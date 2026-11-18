const { launch, scene, check, done } = require('./helpers');

(async () => {
  // 1. Window is deterministic and sane; outside the window nothing counts.
  let { browser, page, errors } = await launch();
  const a = await scene(page, (s) => ({ start: s.bugOffStartHour(), extras: s.bugs.filter((b) => b.extra).length, live: s.isBugOffTime() }));
  const b2 = await launch();
  const b = await scene(b2.page, (s) => s.bugOffStartHour());
  await b2.browser.close();
  check('bug-off: start hour deterministic across clients and within 0..22', a.start === b && a.start >= 0 && a.start <= 22, String(a.start));
  const off = await scene(page, (s) => {
    s.isBugOffTime = () => false; s.refreshBugOff();
    const before = s.bugOffRecord().count; s.bugs[0].alive = true; s.catchBug(s.bugs[0]);
    return { before, after: s.bugOffRecord().count, extrasHidden: s.bugs.filter((x) => x.extra).every((x) => !x.sprite.visible), saved: JSON.parse(localStorage.getItem('pixeltown-save-v1')).bugoff };
  });
  check('outside window: catches do not count, extras hidden, no save key', off.after === off.before && off.extrasHidden && off.saved === undefined, JSON.stringify(off));

  // 2. Live window: extras appear, tiers pay once each, save is additive.
  const live = await scene(page, (s) => {
    s.isBugOffTime = () => true; s.refreshBugOff();
    const extrasLive = s.bugs.filter((x) => x.extra && x.alive && x.sprite.visible).length;
    const sign = s.bugOffSignText.text;
    const log = [];
    for (let i = 1; i <= 16; i++) {
      const bug = s.bugs.find((x) => x.alive) || s.bugs[0]; bug.alive = true; s.catchBug(bug);
      const r = s.bugOffRecord(); if ([5, 10, 15, 16].includes(i)) log.push([i, r.count, r.tier]);
    }
    const save = JSON.parse(localStorage.getItem('pixeltown-save-v1'));
    return { extrasLive, sign, log, save: save.bugoff, bronze: s.achievementsUnlocked.has('bugoffBronze'), gold: s.achievementsUnlocked.has('bugoffGold'), tiers: s.lifetimeStats.bugOffTiers, goldStat: s.lifetimeStats.bugOffGold, respawnFast: s.isBugOffTime() };
  });
  check('live: extra bugs appear and sign says LIVE', live.extrasLive === 8 && /LIVE/.test(live.sign), JSON.stringify([live.extrasLive, live.sign]));
  check('live: tiers reached at 5/10/15 (1,2,3) and stay 3 at 16', JSON.stringify(live.log) === JSON.stringify([[5, 5, 1], [10, 10, 2], [15, 15, 3], [16, 16, 3]]), JSON.stringify(live.log));
  check('live: prizes paid once each (3 tier stats), save key additive', live.tiers === 3 && live.goldStat === 1 && live.save && live.save.count === 16 && live.save.tier === 3 && live.save.best === 16, JSON.stringify(live.save));
  check('live: Bug Buddy + Bug Champion achievements', live.bronze && live.gold);

  // 3. Reload keeps today's progress (no re-pay); next day resets count but keeps best.
  await page.reload();
  await page.fill('#name-input', 'ADMINtest'); await page.click('.species-tab'); await page.waitForTimeout(150); await page.click('.avatar-choice'); await page.click('#join-btn');
  await page.waitForSelector('#player-list-panel'); await page.waitForTimeout(1500);
  const d = await scene(page, (s) => {
    s.isBugOffTime = () => true;
    const same = s.bugOffRecord(); const tiersBefore = s.lifetimeStats.bugOffTiers;
    s.bugs[0].alive = true; s.catchBug(s.bugs[0]);
    const after = s.bugOffRecord(); const tiersAfter = s.lifetimeStats.bugOffTiers;
    const real = s.questDayBucket(); s.questDayBucket = () => real + 1;
    const next = s.bugOffRecord();
    return { same, after, noRepay: tiersAfter === tiersBefore, next };
  });
  check('reload: progress persists and a 17th bug does not re-pay', d.same.count === 16 && d.after.count === 17 && d.noRepay, JSON.stringify(d));
  check('next day: count and tier reset, best kept', d.next.count === 0 && d.next.tier === 0 && d.next.best === 17, JSON.stringify(d.next));
  check('no console errors (desktop)', errors.length === 0, errors.join('|'));
  await browser.close();

  // 4. Corrupt save values.
  for (const bad of ['x', { day: 'q', count: -4, tier: 99, best: 'z' }, [1], null]) {
    ({ browser, page, errors } = await launch({ width: 1000, height: 700 }, { bugoff: bad }));
    const r = await scene(page, (s) => { s.isBugOffTime = () => true; s.bugs[0].alive = true; s.catchBug(s.bugs[0]); return s.bugOffRecord(); });
    check(`corrupt bugoff ${JSON.stringify(bad)}: sane record, no errors`, r.count === 1 && r.tier === 0 && errors.length === 0, JSON.stringify(r) + errors.join('|'));
    await browser.close();
  }

  // 5. Phone: sign present on the map, A button still nets a bug.
  ({ browser, page, errors } = await launch({ width: 390, height: 844 }, null, true));
  await scene(page, (s) => { s.isBugOffTime = () => true; s.refreshBugOff(); });
  // Try several bugs with the real A button: an earlier-priority target (weed,
  // villager, ...) beside one bug must not make the test flaky.
  let caught = false;
  for (let attempt = 0; attempt < 8 && !caught; attempt++) {
    await scene(page, (s, n) => { const bug = s.bugs.filter((x) => x.alive)[n]; if (bug.tween) bug.tween.stop(); s.localBody.setPosition(bug.sprite.x, bug.sprite.y); }, attempt);
    await page.waitForTimeout(150);
    await page.click('#interact-btn');
    await page.waitForTimeout(150);
    caught = await scene(page, (s) => s.bugOffRecord().count >= 1);
  }
  check('phone: A button catches a bug and it counts', caught);
  await scene(page, (s) => { s.localBody.setPosition(2200, 800); });
  await page.waitForTimeout(600);
  if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + '/bugoff-phone.png' });
  check('no console errors (phone)', errors.length === 0, errors.join('|'));
  console.log('fps', await page.evaluate(() => window.__g.loop.actualFps));
  await browser.close();
  done();
})();
