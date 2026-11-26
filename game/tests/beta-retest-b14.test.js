// QA re-test of the b14 P0 findings, replayed from the tester's own steps (game/design/beta/b14.json):
//   b14-03 (S-01) Town Restore of a Lantern backup bundle / junk files must not wipe the town save.
//   b14-01 (S-02) Two Town tabs: the stale tab must not erase the other tab's resources / stats.
//   b14-02 (S-02) A Lantern-style restore while a Town tab is open must survive that tab's next action.
// OFFLINE ONLY: blockDb + Firebase SDK stub (helpers.offlineStub), "Play offline" join, ADMIN* names, never chats.
// Fails on the beta base f23cfbf (that is the point); passes once S-01 and S-02 are fixed.
// Run: python3 -m http.server 8440 &   BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/beta-retest-b14.test.js
const { chromium } = require('playwright');
// cycle 13 (ID-59): a wild animal near the hero writes its own additive `animalHello` key on its first hello at any moment; that write is not the restore's.
const { check, done, twoTabs, offlineStub, exposeGame, joinOffline } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const SK = 'pixeltown-save-v1';

const town = (p) => p.evaluate(() => window.__g.scene.getScene('Town'));
const gain = (p, type, n) => p.evaluate(([t, k]) => { const s = window.__g.scene.getScene('Town'); for (let i = 0; i < k; i++) s.gainResource(t, 1, s.localBody.x, s.localBody.y); }, [type, n]);
const stored = (p) => p.evaluate((k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return 'CORRUPT'; } }, SK);
const raw = (p) => p.evaluate((k) => localStorage.getItem(k), SK);

async function restoreFile(page, obj) {
  const text = typeof obj === 'string' ? obj : JSON.stringify(obj);
  page.once('dialog', (d) => d.accept().catch(() => {}));
  await page.setInputFiles('#save-import-input', { name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  // The fix asks with window.confirm (accepted by the dialog handler above) after lazy-loading the backup modules.
  await page.waitForTimeout(2500); // the restore reloads after ~800 ms; storage is what we assert
}

(async () => {
  const browser = await chromium.launch();
  try {
    // ---------- b14-03 / S-01: Town Restore validation ----------
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
      const db = await offlineStub(ctx);
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await exposeGame(page);
      await page.goto(BASE);
      await joinOffline(page, 'ADMINqaS01');
      await gain(page, 'wood', 3);
      const before = await raw(page);
      // each case starts from the same good save in a freshly joined Town (a successful restore reloads the page)
      const fresh = async () => {
        await page.evaluate(([k, v]) => localStorage.setItem(k, v), [SK, before]);
        await page.reload();
        await joinOffline(page, 'ADMINqaS01');
      };
      const cases = [['{"hello":1}', { hello: 1 }], ['an array', [1, 2, 3]], ['invalid JSON', 'not json{'], ['null', 'null']];
      for (const [label, file] of cases) {
        await fresh();
        await restoreFile(page, file);
        check('b14-03: restoring ' + label + ' leaves pixeltown-save-v1 byte-identical', (await raw(page)) === before, String(await raw(page)).slice(0, 120));
      }
      // Lantern bundle (tester's exact file shape): the town save inside it must become the town save
      const innerTown = { name: 'ADMINqaBundle', species: 'coolcats', frame: 1, resources: { wood: 12, stone: 7 }, achievementsUnlocked: ['craft1', 'fish1'], lifetimeStats: { wood: 40 } };
      const bundle = { format: 'pixeltown-backup', v: 2, keys: { [SK]: JSON.stringify(innerTown), 'pixeltown-gift-v1': JSON.stringify({ v: 1, days: 3, last: '2026-11-20' }) } };
      await fresh();
      await restoreFile(page, bundle);
      // the bundle path lazy-loads the backup modules and reloads: wait for the condition (bounded), not a longer sleep
      await page.waitForFunction((k) => { try { const s = JSON.parse(localStorage.getItem(k)); return !!s && (s.name === 'ADMINqaBundle' || 'format' in s); } catch (e) { return false; } }, SK, { timeout: 15000 }).catch(() => {});
      const after = await stored(page);
      check('b14-03: after restoring a Lantern bundle the town save is NOT the bundle object (no format / keys)', after && after !== 'CORRUPT' && !('format' in after) && !('keys' in after), JSON.stringify(after).slice(0, 160));
      check('b14-03: the bundle\'s town save fields are restored (name, wood 12, stone 7)', after && after.name === 'ADMINqaBundle' && after.resources && after.resources.wood === 12 && after.resources.stone === 7, JSON.stringify(after).slice(0, 160));
      check('b14-03: no database traffic', db.attempts() === 0, String(db.count()));
      check('b14-03: no pageerror', errors.length === 0, errors.join(' | '));
      await ctx.close();
    }

    // ---------- b14-01 / S-02: two Town tabs ----------
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
      const t = await twoTabs(ctx);
      await joinOffline(t.a, 'ADMINqaTwo');
      await t.b.reload(); // B opens after A joined, like the tester (same save, wood 0)
      await joinOffline(t.b, 'ADMINqaTwo');
      await t.b.waitForTimeout(800);
      await gain(t.a, 'wood', 5);
      const mid = await stored(t.a);
      check('b14-01: tab A chopped 5 wood -> stored wood 5', mid && mid.resources && mid.resources.wood === 5, JSON.stringify(mid && mid.resources));
      await t.b.waitForTimeout(1000);
      await gain(t.b, 'fruit', 2);
      await t.b.waitForTimeout(300);
      const s1 = await stored(t.b);
      check('b14-01: after tab B picks 2 fruit, stored wood is still 5', s1 && s1.resources && s1.resources.wood === 5, JSON.stringify(s1 && s1.resources));
      check('b14-01: stored fruit is 2', s1 && s1.resources && s1.resources.fruit === 2, JSON.stringify(s1 && s1.resources));
      check('b14-01: lifetimeStats.wood from tab A survives tab B\'s write', s1 && s1.lifetimeStats && s1.lifetimeStats.wood >= 5, JSON.stringify(s1 && s1.lifetimeStats));
      // ---------- b14-02 / S-02: an external restore while the Town tab is open ----------
      const restoredTown = Object.assign({}, s1, { resources: { wood: 12, stone: 7 }, achievementsUnlocked: ['craft1', 'fish1'], lifetimeStats: { wood: 40 } });
      const third = await ctx.newPage();
      await third.goto(BASE.replace(/index\.html.*$/, 'hub/index.html?test=1'));
      await third.evaluate(([k, v]) => localStorage.setItem(k, v), [SK, JSON.stringify(restoredTown)]);
      await third.close();
      await t.a.waitForTimeout(1500);
      // tab A may reload itself (a valid fix): re-join if the join card came back
      await t.a.waitForFunction(() => window.__g && window.__g.scene.getScene('Town'), null, { timeout: 20000 }).catch(() => {});
      const aHasBody = await t.a.evaluate(() => { const s = window.__g && window.__g.scene.getScene('Town'); return !!(s && s.localBody); }).catch(() => false);
      if (!aHasBody) await joinOffline(t.a, restoredTown.name || 'ADMINqaTwo').catch(() => {});
      await gain(t.a, 'fish', 1);
      await t.a.waitForTimeout(300);
      const s2 = await stored(t.a);
      check('b14-02: after the Town tab catches a fish the restored wood 12 / stone 7 survive', s2 && s2.resources && s2.resources.wood === 12 && s2.resources.stone === 7, JSON.stringify(s2 && s2.resources));
      check('b14-02: restored achievements survive', s2 && Array.isArray(s2.achievementsUnlocked) && s2.achievementsUnlocked.includes('craft1') && s2.achievementsUnlocked.includes('fish1'), JSON.stringify(s2 && s2.achievementsUnlocked));
      check('b14-02: restored lifetimeStats.wood 40 survives', s2 && s2.lifetimeStats && s2.lifetimeStats.wood >= 40, JSON.stringify(s2 && s2.lifetimeStats));
      check('two-tab run: no database traffic', t.db.attempts() === 0, String(t.db.count()));
      check('two-tab run: no pageerror in either tab', !t.errors.a.concat(t.errors.b).some((e) => e.startsWith('pageerror')), t.errors.a.concat(t.errors.b).join(' | '));
      await ctx.close();
    }
  } catch (e) {
    check('test ran to the end', false, e && e.stack);
  } finally {
    await browser.close();
    done();
  }
})();
