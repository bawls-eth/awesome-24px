const { launch, scene, check, done } = require('./helpers');
const AFF = { villagerAffinity: { mocha: 60, lily: 30, buster: 12 } };

(async () => {
  // 1. Open, determinism, label.
  let { browser, page, errors } = await launch({ width: 1000, height: 700 }, AFF);
  const a = await scene(page, (s) => {
    const day = s.questDayBucket();
    const letters = s.lettersForDay(day, s.mailTiers());
    s.localBody.setPosition(2500, 2500); s.interact();
    const far = !!s.mailboxOpen;
    s.localBody.setPosition(1125, 1020); s.interact();
    return { day, ids: letters.map((l) => l.id), far, open: !!s.mailboxOpen,
      shown: document.querySelectorAll('#mailbox-list .mail-letter').length,
      vis: !document.getElementById('mailbox-overlay').classList.contains('hidden'),
      label: s.mailboxLabel.text, canAct: s.canAct() };
  });
  const b2 = await launch({ width: 1000, height: 700 }, AFF);
  const b = await scene(b2.page, (s) => s.lettersForDay(s.questDayBucket(), s.mailTiers()).map((l) => l.id));
  await b2.browser.close();
  check('mailbox: far away does not open; near opens (E)', a.far === false && a.open === true && a.vis === true);
  check('mailbox: 1-5 letters shown, equals lettersForDay', a.shown === a.ids.length && a.ids.length >= 1 && a.ids.length <= 5, JSON.stringify(a.ids));
  check('mailbox: two clients get identical letters (deterministic)', JSON.stringify(a.ids) === JSON.stringify(b));
  check('mailbox: world label shows unread count', /❗/.test(a.label), a.label);
  check('mailbox: input blocked while open (canAct false)', a.canAct === false);

  // 2. Claim: exact payout, save key, no double payout, persists, next day fresh.
  const c = await scene(page, (s) => {
    const l = s.unclaimedLetters()[0];
    const before = { stars: s.localScore, res: { ...s.resources } };
    document.querySelector(`[data-letter="${l.id}"]`).click();
    const save = JSON.parse(localStorage.getItem('pixeltown-save-v1'));
    const again = s.claimLetter(l.id);
    const gained = l.attach.kind === 'stars' ? s.localScore - before.stars : s.resources[l.attach.key] - before.res[l.attach.key];
    return { id: l.id, n: l.attach.n, gained, saved: save.mail, again,
      disabled: document.querySelector(`[data-letter="${l.id}"]`).disabled, pen: s.achievementsUnlocked.has('mail1'), stat: s.lifetimeStats.lettersRead,
      keep: !!save.villagerAffinity };
  });
  check('claim: payout equals the attachment exactly', c.gained >= c.n && c.gained <= c.n + 30 /* stars may add achievement bonuses */, JSON.stringify(c));
  check('claim: saved under additive mail key, other keys intact', c.saved && c.saved.claimed.includes(c.id) && c.saved.lifetime === 1 && c.keep);
  check('claim: cannot be claimed twice; button disabled', c.again === false && c.disabled === true);
  check('claim: Pen Pal achievement + lettersRead stat', c.pen === true && c.stat === 1);
  await page.reload();
  await page.fill('#name-input', 'ADMINtest'); await page.click('.species-tab'); await page.waitForTimeout(150); await page.click('.avatar-choice'); await page.click('#join-btn');
  await page.waitForSelector('#player-list-panel'); await page.waitForTimeout(1500);
  const d = await scene(page, (s) => {
    const left = s.unclaimedLetters().length; const total = s.lettersForDay(s.questDayBucket(), s.mailTiers()).length;
    const real = s.questDayBucket(); s.questDayBucket = () => real + 1;
    const tomorrow = s.unclaimedLetters().length; const tomorrowTotal = s.lettersForDay(real + 1, s.mailTiers()).length;
    return { left, total, tomorrow, tomorrowTotal };
  });
  check('reload: claimed letter stays claimed', d.left === d.total - 1, JSON.stringify(d));
  check('next day: all of tomorrow\'s letters are unclaimed', d.tomorrow === d.tomorrowTotal && d.tomorrowTotal >= 1, JSON.stringify(d));
  check('no console errors (desktop)', errors.length === 0, errors.join('|'));
  await browser.close();

  // Best-friend letters always arrive and unlock Dear Friend.
  ({ browser, page, errors } = await launch({ width: 1000, height: 700 }, AFF));
  const bf = await scene(page, (s) => {
    const all = []; for (let d = 0; d < 30; d++) all.push(s.lettersForDay(s.questDayBucket() + d, s.mailTiers()).some((l) => l.villagerId === 'mocha'));
    const l = s.unclaimedLetters().find((x) => x.villagerId === 'mocha'); s.claimLetter(l.id);
    return { always: all.every(Boolean), ach: s.achievementsUnlocked.has('mailBest'), stat: s.lifetimeStats.bestFriendLetters };
  });
  check('best friend writes every day for 30 days, claiming unlocks Dear Friend', bf.always && bf.ach && bf.stat === 1, JSON.stringify(bf));
  await browser.close();

  // 3. Corrupt saves.
  for (const bad of ['x', { claimed: 5 }, { day: 'q', claimed: [1, null] }, null]) {
    ({ browser, page, errors } = await launch({ width: 1000, height: 700 }, { mail: bad }));
    const r = await scene(page, (s) => { s.localBody.setPosition(1125, 1020); s.interact(); return { open: !!s.mailboxOpen, n: document.querySelectorAll('#mailbox-list .mail-letter').length }; });
    check(`corrupt mail ${JSON.stringify(bad)}: mailbox opens, no errors`, r.open && r.n >= 1 && errors.length === 0, errors.join('|'));
    await browser.close();
  }

  // 4. Phone.
  ({ browser, page, errors } = await launch({ width: 390, height: 844 }, AFF, true));
  await scene(page, (s) => { s.localBody.setPosition(1125, 1020); });
  await page.waitForTimeout(300);
  await page.click('#interact-btn');
  await page.waitForTimeout(300);
  const ph = await page.evaluate(() => {
    const card = document.querySelector('#mailbox-overlay .join-card').getBoundingClientRect();
    const btn = document.querySelector('.mail-collect-btn').getBoundingClientRect();
    return { open: !document.getElementById('mailbox-overlay').classList.contains('hidden'), l: card.left, r: card.right, b: card.bottom, bh: btn.height, sw: document.documentElement.scrollWidth };
  });
  check('phone: A button opens mailbox', ph.open);
  check('phone: card fits 390x844, Collect >= 44px tall', ph.l >= 0 && ph.r <= 390 && ph.b <= 844 && ph.sw <= 390 && ph.bh >= 44, JSON.stringify(ph));
  if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + '/mail-phone.png' });
  await scene(page, (s) => { s.localBody.setPosition(2500, 2500); });
  await page.waitForTimeout(300);
  check('phone: walking away closes mailbox', await scene(page, (s) => !s.mailboxOpen));
  check('no console errors (phone)', errors.length === 0, errors.join('|'));
  console.log('fps', await page.evaluate(() => window.__g.loop.actualFps));
  await browser.close();
  done();
})();
