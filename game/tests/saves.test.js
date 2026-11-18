const { launch, scene, check, done } = require('./helpers');
(async () => {
  const bad = { loginStreak: -5, sellStreak: 'x', lastSellDate: '1999-01-01', achievementsUnlocked: ['craft1', 5, null],
    lifetimeStats: { wood: -3, stone: 'abc', fish: 1e999, bugs: 4.8, chatSent: 7 } };
  const { browser, page, errors } = await launch({ width: 1000, height: 700 }, bad);
  const r = await scene(page, (s) => ({ stats: s.lifetimeStats, ach: [...s.achievementsUnlocked], streak: s.loginStreak }));
  check('lifetimeStats sanitized to finite non-negative integers', r.stats.wood === 0 && r.stats.stone === 0 && r.stats.fish === 0 && r.stats.bugs === 4 && r.stats.chatSent === 7, JSON.stringify(r.stats));
  check('achievementsUnlocked keeps only string ids', r.ach.length === 1 && r.ach[0] === 'craft1', JSON.stringify(r.ach));
  check('negative loginStreak becomes a sane streak', Number.isInteger(r.streak) && r.streak >= 1, String(r.streak));
  check('no console errors', errors.length === 0, errors.join('|'));
  await browser.close();
  done();
})();
