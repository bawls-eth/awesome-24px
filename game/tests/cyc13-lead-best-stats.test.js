// cyc13-lead: "best" stats across two tabs. lifetimeStats holds counters (sparkles, fish caught...) and three "best so far" values
// (bestSellStreak, homeCozyBest, fishSpecies). adoptSave (and the save merge) treated all of them as counters: stored + (mine - base).
// For a best value that is wrong: a tab with an unsaved best 5 (base 3) that sees another tab store 6 showed 6 + 2 = 8, which also
// unlocks achievements nobody earned (homeCozy needs 30). A best value must merge as max(stored, mine).
// Checks (two real tabs, one context, real storage events; tab A's writes refused by a quota stub, then allowed):
//   - each of the three best stats: A ends at max, not the sum, after B's write; the save holds the max after A's write lands;
//   - a plain counter in the same adopt still adds up (stored + this tab's pending change): the cycle 11 behaviour is kept;
//   - the save merge (townMergeCounts with the best list) gives max for best keys and the sum for counters;
//   - with nothing pending a lower stored best is taken as is (storage is the truth, e.g. a Restore).
// OFFLINE: helpers.offlineStub through twoTabs, literal db.attempts() === 0. Never chats, never writes to Firebase.
// Run: BASE=http://localhost:9131/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc13-lead-best-stats.test.js
const { chromium } = require('playwright');
const { check, done, joinOffline, twoTabs } = require('./helpers');
const KEY = 'pixeltown-save-v1';
const QUOTA_INIT = () => {
  const orig = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) { if (window.__quota && k === 'pixeltown-save-v1') { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; } return orig.call(this, k, v); };
};
const stats = (page) => page.evaluate((k) => {
  const s = window.__g.scene.getScene('Town'); let raw = {};
  try { raw = JSON.parse(localStorage.getItem(k) || '{}'); } catch (e) { raw = {}; }
  const pick = (o) => ({ bestSellStreak: o.bestSellStreak || 0, homeCozyBest: o.homeCozyBest || 0, fishSpecies: o.fishSpecies || 0, sparkles: o.sparkles || 0 });
  return { mine: pick(s.lifetimeStats || {}), stored: pick(raw.lifetimeStats || {}) };
}, KEY);
const setStats = (page, o) => page.evaluate((v) => { const s = window.__g.scene.getScene('Town'); Object.keys(v).forEach((k) => { s.lifetimeStats[k] = v[k]; }); s.saveAchievements(); }, o);

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(QUOTA_INIT);
  const SEED = { name: 'ADMINbest', species: 'cat', frame: 0, resources: { wood: 1 }, lifetimeStats: { bestSellStreak: 2, homeCozyBest: 3, fishSpecies: 1, sparkles: 10 }, achievementsUnlocked: [] };
  await ctx.addInitScript((o) => { if (!sessionStorage.getItem('__seeded') && !localStorage.getItem('pixeltown-save-v1')) localStorage.setItem('pixeltown-save-v1', JSON.stringify(o)); sessionStorage.setItem('__seeded', '1'); }, SEED);
  const { db, a, b, errors } = await twoTabs(ctx);
  await joinOffline(a, 'ADMINbest');
  await joinOffline(b, 'ADMINbest');
  await a.waitForTimeout(300);
  let sa = await stats(a); let sb = await stats(b);
  // sparkles may tick while the Town runs; the best stats do not move on their own
  check('both tabs start from the seeded best stats (2 / 3 / 1)', [sa, sb].every((s) => s.mine.bestSellStreak === 2 && s.mine.homeCozyBest === 3 && s.mine.fishSpecies === 1), JSON.stringify([sa.mine, sb.mine]));

  // tab A: storage refuses its writes; it reaches new bests and collects 2 sparkles (all pending)
  await a.evaluate(() => { window.__quota = true; });
  const a0 = (await stats(a)).mine.sparkles;
  await setStats(a, { bestSellStreak: 4, homeCozyBest: 5, fishSpecies: 3, sparkles: a0 + 2 });
  sa = await stats(a);
  check('tab A holds its unsaved bests (4 / 5 / 3); the save still has the old ones', sa.mine.bestSellStreak === 4 && sa.mine.homeCozyBest === 5 && sa.mine.fishSpecies === 3 && sa.stored.homeCozyBest === 3, JSON.stringify(sa));

  // tab B: other bests (one higher than A's, two lower) and 5 sparkles, saved for real -> a storage event reaches A
  const b0 = (await stats(b)).mine.sparkles;
  await setStats(b, { bestSellStreak: 3, homeCozyBest: 6, fishSpecies: 2, sparkles: b0 + 5 });
  sb = await stats(b);
  check('tab B saved its bests (3 / 6 / 2)', sb.stored.bestSellStreak === 3 && sb.stored.homeCozyBest === 6 && sb.stored.fishSpecies === 2, JSON.stringify(sb));
  await a.waitForTimeout(600);
  sa = await stats(a);
  check('adoptSave: homeCozyBest is the max of both tabs (6), not stored + pending (8)', sa.mine.homeCozyBest === 6, 'got ' + sa.mine.homeCozyBest);
  check('adoptSave: bestSellStreak is the max of both tabs (4), not the sum (5)', sa.mine.bestSellStreak === 4, 'got ' + sa.mine.bestSellStreak);
  check('adoptSave: fishSpecies is the max of both tabs (3), not the sum (4)', sa.mine.fishSpecies === 3, 'got ' + sa.mine.fishSpecies);
  check('adoptSave: a plain counter still adds up (stored + this tab\'s pending 2)', sa.mine.sparkles >= sb.stored.sparkles + 2 && sa.mine.sparkles <= sb.stored.sparkles + 2 + 6, `mine ${sa.mine.sparkles} stored ${sb.stored.sparkles}`);

  // storage accepts A's writes again: the save ends with the max of every best
  await a.evaluate(() => { window.__quota = false; window.__g.scene.getScene('Town').saveAchievements(); });
  await a.waitForTimeout(500);
  sa = await stats(a); sb = await stats(b);
  check('after A\'s write lands the save holds the max of each best (4 / 6 / 3)', sa.stored.bestSellStreak === 4 && sa.stored.homeCozyBest === 6 && sa.stored.fishSpecies === 3, JSON.stringify(sa.stored));
  check('tab B adopts them (4 / 6 / 3)', sb.mine.bestSellStreak === 4 && sb.mine.homeCozyBest === 6 && sb.mine.fishSpecies === 3, JSON.stringify(sb.mine));
  check('tab A did not unlock Cozy Corner (needs 30)', await a.evaluate(() => !window.__g.scene.getScene('Town').achievementsUnlocked.has('homeCozy')));

  // the save merge itself (a write that lands before the storage event was handled)
  const merged = await a.evaluate(() => townMergeCounts({ homeCozyBest: 6, bestSellStreak: 3, fishSpecies: 2, sparkles: 15 }, { homeCozyBest: 5, bestSellStreak: 4, fishSpecies: 3, sparkles: 12 }, { homeCozyBest: 3, bestSellStreak: 2, fishSpecies: 1, sparkles: 10 }, 0, typeof TOWN_BEST_STATS !== 'undefined' ? TOWN_BEST_STATS : undefined));
  check('save merge: best keys are max (6 / 4 / 3), the counter is stored + delta (17)', merged.homeCozyBest === 6 && merged.bestSellStreak === 4 && merged.fishSpecies === 3 && merged.sparkles === 17, JSON.stringify(merged));
  const plain = await a.evaluate(() => townMergeCounts({ wood: 6 }, { wood: 5 }, { wood: 3 }));
  check('save merge without the best list is unchanged (the bag: 6 + 2 = 8)', plain.wood === 8, JSON.stringify(plain));

  // nothing pending: a lower stored best is taken (storage is the truth)
  await b.evaluate((k) => { const raw = JSON.parse(localStorage.getItem(k)); raw.lifetimeStats.homeCozyBest = 1; localStorage.setItem(k, JSON.stringify(raw)); }, KEY);
  await a.waitForTimeout(500);
  sa = await stats(a);
  check('with nothing pending, a lower stored best is adopted as is (1)', sa.mine.homeCozyBest === 1, 'got ' + sa.mine.homeCozyBest);

  check('no page errors in either tab', errors.a.filter((e) => /pageerror/.test(e)).length === 0 && errors.b.filter((e) => /pageerror/.test(e)).length === 0, JSON.stringify(errors).slice(0, 300));
  check('no database request attempted', db.attempts() === 0, String(db.attempts()));
  await browser.close();
  done();
})();
