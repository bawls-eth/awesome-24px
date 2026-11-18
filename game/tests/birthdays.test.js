const { launch, scene, check, done, expandPanel } = require('./helpers');
// Find a UTC day number whose birthday villager index is `idx` (or -1), near today.

(async () => {
  let { browser, page, errors } = await launch({ width: 1000, height: 700 }, { resources: { fruit: 3, flowers: 3 }, crafted: { plank: 1, lantern: 1 } });
  await page.evaluate(() => { window.dayFor = (s, idx) => { const d0 = Math.floor(Date.now() / 86400000); for (let d = d0; d < d0 + 20; d++) if (birthdayIndexForDay(d) === idx) return d; return null; }; });
  // 1. Pure schedule: each villager once per 10-day cycle, 5 of 10 days empty.
  const a = await page.evaluate(() => {
    const seen = {}; let none = 0;
    for (let d = 20000; d < 20010; d++) { const i = birthdayIndexForDay(d); if (i < 0) none++; else seen[i] = (seen[i] || 0) + 1; }
    return { seen, none, wraps: birthdayIndexForDay(20003) === birthdayIndexForDay(20013) };
  });
  check('schedule: every villager has exactly one birthday per 10-day cycle', Object.keys(a.seen).length === 5 && Object.values(a.seen).every((n) => n === 1) && a.none === 5 && a.wraps, JSON.stringify(a));

  // 2. Name tag, panel line, letter on the birthday (villager index 0 = Mocha).
  const b = await scene(page, (s) => {
    const day = window.dayFor(s, 0);
    s.questDayBucket = () => day; s.loadBirthdays(); s.refreshBirthdays();
    const tags = Object.fromEntries(VILLAGERS.map((v) => [v.id, s.villagerState[v.id].nameText.text]));
    const line = document.getElementById('birthday-line').textContent;
    const letters = s.lettersForDay(day, s.mailTiers());
    const mocha = letters.filter((l) => l.villagerId === 'mocha');
    const nonDay = window.dayFor(s, -1);
    const lettersOther = s.lettersForDay(nonDay, s.mailTiers());
    s.questDayBucket = () => nonDay; s.refreshBirthdays();
    return { day, tags, line, mochaLetters: mocha.length, mochaText: mocha[0] && mocha[0].text, ids: letters.map((l) => l.id), otherBday: lettersOther.some((l) => l.birthday), next: document.getElementById('birthday-line').textContent };
  });
  check('birthday: only the birthday villager gets a 🎂 name tag', b.tags.mocha === '🎂 Mocha' && Object.entries(b.tags).filter(([id, t]) => id !== 'mocha').every(([, t]) => !t.includes('🎂')), JSON.stringify(b.tags));
  check('birthday: panel line announces it', /Mocha/.test(b.line) && /birthday today/.test(b.line), b.line);
  check('birthday: mailbox letter is guaranteed, unique, and birthday-themed', b.mochaLetters === 1 && /birthday/.test(b.mochaText) && new Set(b.ids).size === b.ids.length && b.ids.length <= 5, JSON.stringify(b.ids));
  check('non-birthday day: no birthday letters, panel shows "Next: ... in Nd"', b.otherBday === false && /Next: .* in \d+d/.test(b.next), b.next);

  // 3. Gift with a liked resource: pays once, +affinity, saved first, second gift falls through.
  const c = await scene(page, (s) => {
    const day = window.dayFor(s, 0);
    s.questDayBucket = () => day; s.loadBirthdays(); s.refreshBirthdays();
    const v = VILLAGERS[0]; const st = s.villagerState[v.id];
    s.localBody.setPosition(st.x, st.y + 10);
    const aff0 = s.villagerAffinity(v.id); const score0 = s.localScore; const fruit0 = s.resources.fruit;
    s.giveNearestVillagerGift();
    const paid = s.localScore - score0; const aff1 = s.villagerAffinity(v.id);
    const save = JSON.parse(localStorage.getItem('pixeltown-save-v1'));
    const score1 = s.localScore; s.giveNearestVillagerGift();
    return { paid, affGain: aff1 - aff0, used: fruit0 - s.resources.fruit, claimed: save.birthdays.claimed, guests: save.birthdays.guests, second: s.localScore - score1, ach: s.achievementsUnlocked.has('bday1'), stat: s.lifetimeStats.birthdayGifts, secondUsed: fruit0 - s.resources.fruit, claimedFlag: s.birthdayClaimedIds.size };
  });
  check('gift: birthday party pays >= 5 stars and +20 friendship', c.paid >= 5 && c.affGain >= 20, JSON.stringify(c));
  check('gift: saved under additive birthdays key (claimed + guests) and achievement', c.claimed.length === 1 && c.guests[0] === 'mocha' && c.ach && c.stat === 1);
  check('gift: a second gift that day is a normal gift (no second party)', c.stat === 1 && c.secondUsed === 2 && c.claimedFlag === 1, JSON.stringify(c));

  // 4. Crafted-good fallback when no liked resource in the bag; empty bag claims nothing.
  const d = await scene(page, (s) => {
    const day = window.dayFor(s, 1);
    s.questDayBucket = () => day; s.loadBirthdays(); s.refreshBirthdays();
    const v = VILLAGERS[1]; const st = s.villagerState[v.id];
    s.localBody.setPosition(st.x, st.y + 10);
    v.likes.forEach((k) => { s.resources[k] = 0; });
    const before = { plank: s.craftedGoods.plank, lantern: s.craftedGoods.lantern, score: s.localScore };
    s.giveNearestVillagerGift();
    const after = { plank: s.craftedGoods.plank, lantern: s.craftedGoods.lantern, gained: s.localScore - before.score };
    // Empty bag on another villager's birthday: nothing claimed.
    const day2 = window.dayFor(s, 2);
    s.questDayBucket = () => day2; s.loadBirthdays(); s.refreshBirthdays();
    s.craftedGoods = Object.fromEntries(Object.keys(s.craftedGoods).map((k) => [k, 0]));
    const v2 = VILLAGERS[2]; v2.likes.forEach((k) => { s.resources[k] = 0; }); const st2 = s.villagerState[v2.id]; s.localBody.setPosition(st2.x, st2.y + 10);
    const claimsBefore = s.birthdayClaimedIds.size; s.giveNearestVillagerGift();
    return { before, after, claimsBefore, claimsAfter: s.birthdayClaimedIds.size };
  });
  check('gift: cheapest crafted good is used when no liked resource (plank before lantern), bonus > 5', d.after.plank === d.before.plank - 1 && d.after.lantern === d.before.lantern && d.after.gained >= 7, JSON.stringify(d));
  check('gift: empty bag on a birthday claims nothing', d.claimsAfter === d.claimsBefore, JSON.stringify(d));

  // 5. Party Planner needs all five villagers; reload persists claims.
  const e = await scene(page, (s) => { s.birthdayGuests = new Set(VILLAGERS.slice(0, 4).map((v) => v.id)); s.checkAchievements(); const before = s.achievementsUnlocked.has('bdayAll'); s.birthdayGuests.add(VILLAGERS[4].id); s.checkAchievements(); return { before, after: s.achievementsUnlocked.has('bdayAll') }; });
  check('achievement: Party Planner only after all 5 villagers', e.before === false && e.after === true);
  check('no console errors (desktop)', errors.length === 0, errors.join('|'));
  await browser.close();

  // 6. Corrupt saves; and claims persist after reload.
  for (const bad of ['x', { claimed: 5, guests: 'q' }, { claimed: [1, null, 'ok'], guests: ['nobody', 'mocha'] }, [1], null]) {
    ({ browser, page, errors } = await launch({ width: 1000, height: 700 }, { birthdays: bad }));
    const r = await scene(page, (s) => ({ claimed: [...s.birthdayClaimedIds], guests: [...s.birthdayGuests] }));
    check(`corrupt birthdays ${JSON.stringify(bad)}: sane sets, no errors`, r.claimed.every((x) => typeof x === 'string') && r.guests.every((g) => ['mocha', 'frosty', 'buster', 'lily', 'spike'].includes(g)) && errors.length === 0, JSON.stringify(r) + errors.join('|'));
    await browser.close();
  }
  ({ browser, page, errors } = await launch({ width: 390, height: 844 }, { birthdays: { claimed: [], guests: [] } }, true));
  await page.evaluate(() => { window.dayFor = (s, idx) => { const d0 = Math.floor(Date.now() / 86400000); for (let d = d0; d < d0 + 20; d++) if (birthdayIndexForDay(d) === idx) return d; return null; }; });
  const day0 = await scene(page, (s) => { const d = window.dayFor(s, 3); s.questDayBucket = () => d; s.refreshBirthdays(); return d; });
  await expandPanel(page);
  const ph = await page.evaluate(() => { const r = document.getElementById('birthday-line').getBoundingClientRect(); return { w: r.width, l: r.left, r: r.right, sw: document.documentElement.scrollWidth, text: document.getElementById('birthday-line').textContent }; });
  check('phone: birthday line visible, inside the panel, no overflow', ph.w > 0 && ph.l >= 0 && ph.r <= 390 && ph.sw <= 390 && /birthday/.test(ph.text), JSON.stringify(ph));
  if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + '/bday-phone.png' });
  check('no console errors (phone)', errors.length === 0, errors.join('|'));
  console.log('fps', await page.evaluate(() => window.__g.loop.actualFps));
  await browser.close();
  done();
})();
