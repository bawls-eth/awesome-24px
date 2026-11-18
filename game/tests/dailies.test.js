const { launch, scene, check, done } = require('./helpers');

(async () => {
  let { browser, page, errors } = await launch({ width: 1000, height: 700 });
  // 1. Button + board render the chores with live status.
  const a = await scene(page, (s) => {
    const btn = document.getElementById('dailies-btn').textContent;
    s.openDailies();
    const rows = [...document.querySelectorAll('#dailies-list li')].map((li) => [li.dataset.daily, li.dataset.status]);
    const vis = !document.getElementById('dailies-overlay').classList.contains('hidden');
    const canAct = s.canAct(); s.closeTopOverlay();
    return { btn, rows, vis, canAct, closed: !s.dailiesOpen, ids: s.dailyItems().map((i) => i.id) };
  });
  check('dailies: button shows progress and board lists 7 chores', /Today \d+\/\d+/.test(a.btn) && a.rows.length === 7 && a.vis, JSON.stringify([a.btn, a.rows]));
  check('dailies: input blocked while open, Esc closes', a.canAct === false && a.closed === true);
  check('dailies: fresh day — quest/trivia/mail/weeds are todo', ['quest', 'trivia', 'mail', 'weeds'].every((id) => a.rows.find((r) => r[0] === id)[1] === 'todo') && a.rows.find((r) => r[0] === 'home')[1] === 'na', JSON.stringify(a.rows));

  // 2. Status follows real state: weeds, mail, home, bug-off, birthday.
  const b = await scene(page, (s) => {
    const st = (id) => s.dailyItems().find((i) => i.id === id).status;
    const out = { weedsBefore: st('weeds') };
    s.weedSpots.forEach((w, i) => s.weedsPulledToday.add(i)); out.weedsAfter = st('weeds');
    out.mailBefore = st('mail'); s.collectAllLetters(); out.mailAfter = st('mail');
    s.isBugOffTime = () => false; s.bugOffPhase = () => 'before'; out.bugLater = st('bugoff');
    s.isBugOffTime = () => true; s.bugOffPhase = () => 'live'; out.bugTodo = st('bugoff');
    for (let i = 0; i < 5; i++) { s.bugs[i].alive = true; s.catchBug(s.bugs[i]); } out.bugDone = st('bugoff');
    s.craftedGoods.lantern = 1; s.setHomeSlot(0, 'lantern'); out.homeTodo = st('home');
    s.localBody.setPosition(HOME_POS.x, HOME_POS.y + 60); s.openHome(); s.closeHome(); out.homeDone = st('home');
    const d0 = window.__dayFor = (idx) => { const d = s.questDayBucket(); for (let k = d; k < d + 20; k++) if (birthdayIndexForDay(k) === idx) return k; };
    const real = s.questDayBucket(); return out;
  });
  check('dailies: weeds/mail/bug-off/home statuses follow real game state', b.weedsBefore === 'todo' && b.weedsAfter === 'done' && b.mailBefore === 'todo' && b.mailAfter === 'done' && b.bugLater === 'later' && b.bugTodo === 'todo' && b.bugDone === 'done' && b.homeTodo === 'todo' && b.homeDone === 'done', JSON.stringify(b));

  // Missed Bug-Off window must not lock the bonus: 'missed' is excluded from the total.
  const m = await scene(page, (s) => {
    writeSave({ bugoff: { day: s.questDayBucket(), count: 0, tier: 0, best: 5 } });
    s.isBugOffTime = () => false; s.bugOffPhase = () => 'before';
    const before = { st: s.dailyItems().find((i) => i.id === 'bugoff').status, total: s.dailyProgress().total };
    s.bugOffPhase = () => 'after';
    const after = { st: s.dailyItems().find((i) => i.id === 'bugoff').status, total: s.dailyProgress().total, detail: s.dailyItems().find((i) => i.id === 'bugoff').detail };
    s.openDailies(); const row = document.querySelector('#dailies-list li[data-daily=bugoff]').dataset.status; s.closeDailies();
    return { before, after, row };
  });
  check('dailies: a missed Bug-Off window is excluded from the total (no lockout)', m.before.st === 'later' && m.after.st === 'missed' && m.after.total === m.before.total - 1 && m.row === 'missed' && /over for today/.test(m.after.detail), JSON.stringify(m));

  // 3. Birthday item appears only on a birthday and completes with the gift.
  const c = await scene(page, (s) => {
    const real = s.questDayBucket(); let bd = null; for (let k = real; k < real + 20; k++) if (birthdayIndexForDay(k) === 0) { bd = k; break; }
    s.questDayBucket = () => bd; s.loadBirthdays(); s.refreshBirthdays();
    const item = s.dailyItems().find((i) => i.id === 'birthday'); const before = item.status;
    s.resources.fruit = 2; s.resources.flowers = 2; s.giveBirthdayGift(VILLAGERS[0]);
    return { before, after: s.dailyItems().find((i) => i.id === 'birthday').status, label: item.label };
  });
  check('dailies: birthday chore appears on the day and completes after the gift', c.before === 'todo' && c.after === 'done' && /Mocha/.test(c.label), JSON.stringify(c));

  // 4. Finishing everything pays the bonus exactly once and records the day; reload keeps it.
  const d = await scene(page, (s) => {
    s.questDayBucket = (() => { const r = Math.floor(Date.now() / 86400000); return () => r; })();
    s.loadBirthdays(); s.refreshBirthdays(); s.refreshWeeds && 0;
    s.questClaimedBucket = s.questDayBucket(); s.triviaAnsweredBucket = s.questDayBucket();
    s.weedSpots.forEach((w, i) => s.weedsPulledToday.add(i));
    s.collectAllLetters(); s.isBugOffTime = () => false; s.bugOffPhase = () => 'after'; // window missed: must still be completable
    // If today happens to be a villager's birthday, that chore counts too: do it.
    const bv = s.todaysBirthdayVillager();
    if (bv && !s.birthdayClaimed(bv)) { Object.keys(s.resources).forEach((k) => { s.resources[k] = 3; }); s.giveBirthdayGift(bv); }
    const p = s.dailyProgress(); const s0 = s.localScore;
    s.refreshDailies(); const first = s.localScore - s0; const mid = s.localScore;
    s.refreshDailies(); s.refreshDailies();
    const rec = JSON.parse(localStorage.getItem('pixeltown-save-v1')).dailies;
    return { p, first, second: s.localScore - mid, rec, ach: s.achievementsUnlocked.has('daily1'), stat: s.lifetimeStats.dailyAllDone, summary: document.getElementById('dailies-btn').textContent };
  });
  check('dailies: all chores done pays the bonus (>= 5 stars) exactly once', d.p.done === d.p.total && d.first >= 5 && d.second === 0, JSON.stringify(d));
  check('dailies: saved under additive dailies key + Daily Routine achievement', d.rec && d.rec.paid === true && d.rec.days === 1 && d.ach && d.stat === 1, JSON.stringify(d.rec));
  check('no console errors (desktop)', errors.length === 0, errors.join('|'));
  await browser.close();

  // 5. Corrupt save values do not break the board or double-pay.
  for (const bad of ['x', { day: 'q', paid: 'yes', days: -4 }, [1], null]) {
    ({ browser, page, errors } = await launch({ width: 1000, height: 700 }, { dailies: bad }));
    const r = await scene(page, (s) => { s.openDailies(); return { n: document.querySelectorAll('#dailies-list li').length, rec: s.dailiesRecord() }; });
    check(`corrupt dailies ${JSON.stringify(bad)}: board opens, sane record, no errors`, r.n === 7 && r.rec.days >= 0 && r.rec.paid === false && errors.length === 0, JSON.stringify(r) + errors.join('|'));
    await browser.close();
  }

  // 6. Phone: panel button tappable, board fits, J key toggles on desktop.
  ({ browser, page, errors } = await launch({ width: 390, height: 844 }, null, true));
  await page.click('#dailies-btn');
  await page.waitForTimeout(300);
  const ph = await page.evaluate(() => { const c = document.querySelector('#dailies-overlay .join-card').getBoundingClientRect(); return { open: !document.getElementById('dailies-overlay').classList.contains('hidden'), l: c.left, r: c.right, b: c.bottom, sw: document.documentElement.scrollWidth }; });
  check('phone: Today button opens the board and it fits 390x844', ph.open && ph.l >= 0 && ph.r <= 390 && ph.b <= 844 && ph.sw <= 390, JSON.stringify(ph));
  if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + '/dailies-phone.png' });
  await page.click('#dailies-close-btn');
  check('phone: close button works', await scene(page, (s) => !s.dailiesOpen));
  check('no console errors (phone)', errors.length === 0, errors.join('|'));
  await browser.close();
  ({ browser, page, errors } = await launch({ width: 1000, height: 700 }));
  await page.keyboard.press('j'); await page.waitForTimeout(200);
  const opened = await scene(page, (s) => !!s.dailiesOpen);
  await page.keyboard.press('j'); await page.waitForTimeout(200);
  check('desktop: J toggles the board', opened === true && (await scene(page, (s) => !s.dailiesOpen)) === true);
  console.log('fps', await page.evaluate(() => window.__g.loop.actualFps));
  await browser.close();
  done();
})();
