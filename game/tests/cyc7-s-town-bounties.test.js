// Cycle 8 S, ID-18 Town daily bounties (spec: IDEAS.md "ID-09 / ID-18 implementation specs (D, cycle 7)", owner decision: free currency only).
// Node part (pure MMBounties): forDate with TOWN_POOL is deterministic per date + salt, 3 distinct ids, star rewards in {10..30 step 5}, another
// date gives another set within 10 dates, progress never passes the goal, claim pays once, cleanTown drops junk, no urgency words; the default
// pool (no third argument) is unchanged.
// Browser part (the real Town, OFFLINE stub, literal db.attempts() === 0): the Dailies panel shows three bounty rows (not counted in "Today n/m");
// a real tree shake through interact() moves 0/5 to 1/5 and a cooldown refusal does not count; Claim pays exactly the row's stars once (save
// written before the pay) and survives a reload; the next UTC day (faked through MMGameDay.utcKey) replaces the rows; a stale save with unknown
// ids loads without errors; a Backup round trip keeps `bounty`; 390x844 and 195x422: no horizontal scroll, Claim >= 44 px, one line per row at 390.
// The UTC day is faked with sessionStorage 'fakeday' read by a wrapped MMGameDay.utcKey (an init script); nothing else of the game is changed.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/cyc7-s-town-bounties.test.js   (SHOTS=<dir> also saves screenshots)
const path = require('path');
const { check, done, offlineStub, exposeGame, joinOffline, townReady } = require('./helpers');
const B = require(path.join(__dirname, '..', 'shared', 'mm-bounties.js'));
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';

// ---------- node ----------
const T = B.TOWN_POOL;
check('TOWN_POOL is exported (6 errands) next to POOL', Array.isArray(T) && T.length === 6 && Array.isArray(B.POOL));
const a = B.forDate('2026-11-27', 'town', T), a2 = B.forDate('2026-11-27', 'town', T);
check('forDate(TOWN_POOL) is deterministic per date + salt and gives 3 distinct ids from the Town pool', JSON.stringify(a) === JSON.stringify(a2) && a.length === 3 && new Set(a.map((x) => x.id)).size === 3 && a.every((x) => T.some((p) => p.id === x.id)));
const days = []; for (let i = 0; i < 400; i++) days.push(B.forDate(new Date(Date.UTC(2026, 10, 1) + i * 86400000).toISOString().slice(0, 10), 'town', T));
const rewards = [].concat(...days.map((d) => d.map((x) => x.reward)));
check('Town rewards are stars only, 10-30 in steps of 5 (400 days)', rewards.every((r) => Object.keys(r).join() === 'stars' && r.stars >= 10 && r.stars <= 30 && r.stars % 5 === 0), JSON.stringify(rewards.find((r) => !(r.stars >= 10 && r.stars <= 30 && r.stars % 5 === 0))));
const mean = rewards.reduce((s, r) => s + r.stars, 0) / rewards.length;
check('Town reward mean is about 20 stars (3 bounties ~ 60 a day)', mean > 18 && mean < 22, mean.toFixed(2));
let differs = true; for (let i = 0; i < 390; i++) { let any = false; for (let k = 1; k <= 10; k++) if (JSON.stringify(days[i].map((x) => x.id)) !== JSON.stringify(days[i + k].map((x) => x.id))) any = true; if (!any) differs = false; }
check('another date gives another set within 10 dates (every start day of 390)', differs);
const sh = T.find((p) => p.id === 'shake-tree'); const bo = a.find((x) => x.id === 'shake-tree');
let st = null; for (let i = 0; i < 9; i++) st = B.progress(bo, st, { type: 'town:shake' });
check('progress never passes the goal (9 shakes on a goal of 5 = 5/5)', sh.goal === 5 && st.count === 5 && st.done);
check('progress ignores other events', B.progress(bo, null, { type: 'town:bug' }).count === 0);
const c1 = B.claim(bo, st);
check('claim pays the row stars once, then null', c1 && c1.reward.stars === bo.reward.stars && Object.keys(c1.reward).join() === 'stars' && B.claim(bo, c1.state) === null);
check('claim of an unfinished bounty is null', B.claim(bo, { count: 4, done: false, claimed: false }) === null);
const cl = B.cleanTown({ d: '2026-11-27', s: { 'shake-tree': [99, 1], junk: [3, 1], 'pick-flower': ['x', 1], wave: [1, 1] } }, '2026-11-27', a);
check('cleanTown: unknown ids dropped, counts clamped to the goal, a claim flag only on a finished row, junk -> 0', JSON.stringify(cl) === JSON.stringify({ d: '2026-11-27', s: { wave: [1, 0], 'pick-flower': [0, 0], 'shake-tree': [5, 1] } }), JSON.stringify(cl));
const fresh = B.cleanTown({ d: '2026-11-26', s: { 'shake-tree': [5, 1] } }, '2026-11-27', a);
check('cleanTown: a record from another day is a fresh day (all 0, nothing deducted elsewhere)', Object.values(fresh.s).every((v) => v[0] === 0 && v[1] === 0) && fresh.d === '2026-11-27');
check('cleanTown on garbage (null, array, string) gives a clean fresh record', [null, [], 'x', 5].every((g) => Object.values(B.cleanTown(g, '2026-11-27', a).s).every((v) => v[0] === 0)));
check('no Town pool text says streak / expire / hurry / last chance / only today', !/streak|expire|hurry|last chance|only today|countdown|deadline/i.test(JSON.stringify(T)));
const old = B.forDate('2026-11-19', 'x');
check('default pool unchanged: fame 10-40 + 1 pet treat, POOL ids', old.every((x) => x.reward.fame >= 10 && x.reward.fame <= 40 && x.reward.petTreat === 1 && B.POOL.some((p) => p.id === x.id)));

// ---------- browser ----------
(async () => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const FAKE = `(() => { let G; Object.defineProperty(window, 'MMGameDay', { configurable: true, get: () => G, set: (v) => { G = v; if (!v || v.__wrapped) return; const o = v.utcKey; v.utcKey = (n) => { let f = null; try { f = sessionStorage.getItem('fakeday'); } catch (e) { f = null; } return f && n === undefined ? f : o(n); }; v.__wrapped = true; } }); })();`;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const db = await offlineStub(ctx);
  await ctx.addInitScript(FAKE);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await exposeGame(page);
  await page.goto(BASE);
  const D1 = '2026-11-27', D2 = '2026-11-28'; // D1 has shake-tree; D2 does not (node: forDate)
  await page.evaluate((d) => sessionStorage.setItem('fakeday', d), D1);
  await joinOffline(page, 'ADMINbounty');
  const S = (fn, arg) => page.evaluate(`(${fn.toString()})(window.__g.scene.getScene('Town'), ${JSON.stringify(arg === undefined ? null : arg)})`);
  const rows = () => page.evaluate(() => [...document.querySelectorAll('#bounty-list li')].map((li) => { const b = li.querySelector('button'); const r = b && b.getBoundingClientRect(); return { id: li.dataset.bounty, st: li.dataset.status, text: li.textContent, n: (li.querySelector('.bounty-count') || {}).textContent, h: li.getBoundingClientRect().height, btnH: r ? r.height : 0 }; }));
  const want = B.forDate(D1, 'town', T);
  const chores0 = await page.evaluate(() => document.getElementById('dailies-btn').textContent);
  await page.keyboard.press('j');
  await page.waitForSelector('#dailies-overlay:not(.hidden)');
  let r = await rows();
  check('panel: "Today\'s bounties" shows the three rows of the (faked) UTC day, all 0/goal, no Claim yet', r.length === 3 && r.map((x) => x.id).join() === want.map((x) => x.id).join() && r.every((x) => x.st === 'todo' && /^0\/\d$/.test(x.n) && x.btnH === 0), JSON.stringify(r));
  check('panel: each row shows "+N ⭐" (the row reward) and no timer / expiry words', r.every((x, i) => x.text.indexOf('+' + want[i].reward.stars + ' ⭐') >= 0) && !/expire|left today|hurry|streak/i.test(await page.evaluate(() => document.getElementById('bounty-section').textContent)));
  const chores1 = await page.evaluate(() => document.getElementById('dailies-btn').textContent);
  check('the chores button count is unchanged by the bounties (not part of Today n/m)', chores0 === chores1 && /^📋 Today \d+\/\d+$/.test(chores1), chores0 + ' / ' + chores1);
  await page.keyboard.press('j');

  // a real tree shake through interact(): find a tree the press really shakes (something nearer can win the press, so try trees in turn)
  const shake = await S((s) => {
    const trees = TREES.map(([x, y], i) => ({ x, y, i }));
    const isolated = trees.filter((t) => !trees.some((u) => u !== t && Math.hypot(u.x - t.x, u.y - t.y) < 2 * TREE_SHAKE_RADIUS + 20));
    const count = () => (loadSave().bounty && loadSave().bounty.s && loadSave().bounty.s['shake-tree'] ? loadSave().bounty.s['shake-tree'][0] : 0);
    for (const t of isolated.concat(trees)) {
      s.treeCooldowns = {}; s.localBody.setPosition(t.x, t.y - 10 + 18);
      const c0 = count(); s.interact();
      if (s.treeCooldowns[t.i]) {
        const c1 = count();
        const cds = Object.keys(s.treeCooldowns).length; s.interact(); // the same tree again at once: on cooldown
        const c2 = count(); const shookMore = Object.keys(s.treeCooldowns).length - cds;
        return { tree: t.i, isolated: isolated.indexOf(t) >= 0, c0, c1, c2, shookMore };
      }
    }
    return null;
  });
  check('a real tree shake (interact()) moves the shake bounty from 0/5 to 1/5', !!shake && shake.c0 === 0 && shake.c1 === 1, JSON.stringify(shake));
  check('pressing again on the same tree (on cooldown) does not count (count goes up only by trees really shaken)', !!shake && shake.c2 - shake.c1 === shake.shookMore && (!shake.isolated || shake.c2 === 1), JSON.stringify(shake));
  // finish it with four more real shakes (cooldowns cleared between presses: the cooldown is not what is tested here)
  const fin = await S((s, t) => { for (let k = 0; k < 6; k++) { s.treeCooldowns = {}; const [x, y] = TREES[t]; s.localBody.setPosition(x, y - 10 + 18); s.interact(); } return loadSave().bounty.s['shake-tree']; }, shake ? shake.tree : 0);
  check('more shakes stop at the goal: 5/5 (never above)', fin[0] === 5 && fin[1] === 0, JSON.stringify(fin));
  await page.keyboard.press('j');
  await page.waitForSelector('#bounty-list li[data-bounty="shake-tree"] button.bounty-claim');
  const sb = want.find((x) => x.id === 'shake-tree').reward.stars;
  const pay = await S((s) => {
    const order = []; const w = window.writeSave; const ap = s.awardPoint.bind(s);
    window.__ordW = (p) => { if (p && p.bounty) order.push('save'); };
    s.awardPoint = (n, l, x, y, snd) => { order.push('pay'); return ap(n, l, x, y, snd); };
    const sc0 = s.localScore; const keep = window.writeSave;
    window.writeSave = (p) => { window.__ordW(p); return keep(p); };
    document.querySelector('#bounty-list li[data-bounty="shake-tree"] button.bounty-claim').click();
    const sc1 = s.localScore; const again = s.claimBounty('shake-tree'); const sc2 = s.localScore;
    window.writeSave = keep; s.awardPoint = ap;
    return { paid: sc1 - sc0, again, paidAgain: sc2 - sc1, order, rec: loadSave().bounty.s['shake-tree'], row: document.querySelector('#bounty-list li[data-bounty="shake-tree"]').textContent };
  });
  check('Claim pays exactly the row stars once (button), a second claim pays nothing', pay.paid === sb && pay.again === false && pay.paidAgain === 0, JSON.stringify(pay));
  check('the save is written BEFORE the stars are paid, and the row then says Claimed', pay.order[0] === 'save' && pay.order.indexOf('pay') > 0 && JSON.stringify(pay.rec) === '[5,1]' && /Claimed/.test(pay.row), JSON.stringify(pay));
  if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + '/cyc8-systems-bounties-1280x720.jpg', type: 'jpeg', quality: 60 }).catch(() => null);

  // reload on the same day: still claimed, nothing paid again
  await page.reload(); await joinOffline(page, 'ADMINbounty');
  const rl = await S((s) => { const sc0 = s.localScore; const again = s.claimBounty('shake-tree'); return { again, paid: s.localScore - sc0, rec: loadSave().bounty }; });
  check('after a reload the claim is kept and cannot be paid again', rl.again === false && rl.paid === 0 && JSON.stringify(rl.rec.s['shake-tree']) === '[5,1]' && rl.rec.d === D1, JSON.stringify(rl));

  // Backup round trip keeps `bounty`
  const bk = await page.evaluate(async () => {
    const M = await loadBackupModules(); if (!M) return { ok: false };
    const before = loadSave().bounty; const b = M.bundle(localStorage);
    const inBundle = JSON.parse(b.keys['pixeltown-save-v1']).bounty;
    localStorage.removeItem('pixeltown-save-v1');
    const res = M.restore(localStorage, b);
    return { ok: res.ok, same: JSON.stringify(loadSave().bounty) === JSON.stringify(before), inBundle: JSON.stringify(inBundle) === JSON.stringify(before) };
  });
  check('Backup round trip (bundle -> remove the save -> restore) keeps the bounty record', bk.ok && bk.same && bk.inBundle, JSON.stringify(bk));
  const tf = await page.evaluate(() => TOWN_SAVE_FIELDS.indexOf('bounty') >= 0);
  const bsrc = require('fs').readFileSync(path.join(__dirname, '..', 'shared', 'mm-backup.js'), 'utf8');
  check('`bounty` is in TOWN_SAVE_FIELDS (main.js) and MMBackup TOWN_FIELDS', tf && /TOWN_FIELDS = \[[^\]]*'bounty'/.test(bsrc));

  // next UTC day (faked): new rows, old progress replaced, nothing deducted
  await page.evaluate((d) => sessionStorage.setItem('fakeday', d), D2);
  await page.reload(); await joinOffline(page, 'ADMINbounty');
  const sc = await S((s) => s.localScore);
  await page.keyboard.press('j'); await page.waitForSelector('#dailies-overlay:not(.hidden)');
  r = await rows();
  const want2 = B.forDate(D2, 'town', T);
  check('the next UTC day shows that day\'s three rows, all at 0, none claimed', r.map((x) => x.id).join() === want2.map((x) => x.id).join() && r.every((x) => x.st === 'todo'), JSON.stringify(r));
  await page.keyboard.press('j');
  const ev = await S((s) => { s.bountyEvent('town:fish'); s.bountyEvent('town:shake'); return loadSave().bounty; });
  check('the first event of the new day writes a fresh record for that day (yesterday\'s rows gone), no stars taken', ev.d === D2 && !('shake-tree' in ev.s) && (await S((s) => s.localScore)) >= sc, JSON.stringify(ev));

  // a stale save with unknown ids and junk loads without errors
  await page.evaluate((d) => { writeSave({ bounty: { d, s: { ghost: [9, 1], fish: ['lots', 7], 'catch-bug': [-4, 1], toString: [1, 1] } } }); }, D2);
  await page.reload(); await joinOffline(page, 'ADMINbounty');
  await page.keyboard.press('j'); await page.waitForSelector('#dailies-overlay:not(.hidden)');
  r = await rows();
  check('a stale save with unknown ids and junk counts loads: three clean rows, no Claim on junk', r.length === 3 && r.every((x) => x.st === 'todo' && x.btnH === 0), JSON.stringify(r));
  await page.keyboard.press('j');

  // phone sizes: no horizontal scroll, Claim >= 44 px, one line per row at 390
  for (const [w, h] of [[390, 844], [195, 422]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.evaluate((d) => { writeSave({ bounty: { d, s: {} } }); }, D2);
    const id = want2[0].id; const g = T.find((p) => p.id === id).goal;
    await S((s, a) => { const rec = loadSave().bounty; rec.s[a.id] = [a.g, 0]; writeSave({ bounty: rec }); s.openDailies(); return true; }, { id, g });
    await page.waitForTimeout(300);
    const m = await page.evaluate(() => {
      const sec = document.getElementById('bounty-section'); sec.scrollIntoView({ block: 'center' });
      const rs = [...document.querySelectorAll('#bounty-list li')].map((li) => { const t = li.querySelector('.bounty-text'); const lh = parseFloat(getComputedStyle(t).lineHeight) || 18; return { h: li.getBoundingClientRect().height, lines: Math.round(t.getBoundingClientRect().height / lh), right: li.getBoundingClientRect().right }; });
      const b = document.querySelector('#bounty-list button.bounty-claim'); const br = b ? b.getBoundingClientRect() : null;
      return { hs: document.documentElement.scrollWidth > innerWidth + 1, rows: rs, btn: br ? { h: br.height, w: br.width, right: br.right } : null, vw: innerWidth };
    });
    check(w + 'x' + h + ': no horizontal scroll, the Claim button is >= 44 px tall and on screen', !m.hs && m.btn && m.btn.h >= 44 && m.btn.right <= m.vw + 0.5, JSON.stringify(m));
    if (w === 390) check('390x844: each bounty text is one line', m.rows.every((x) => x.lines <= 1), JSON.stringify(m.rows));
    if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + '/cyc8-systems-bounties-' + w + 'x' + h + '.jpg', type: 'jpeg', quality: 60 }).catch(() => null);
    await S((s) => { s.closeDailies(); return true; });
  }
  check('no page errors', errors.length === 0, errors.join(' | '));
  check('offline: no database request was attempted (literal 0)', db.attempts() === 0, JSON.stringify(db.http.concat(db.ws).slice(0, 3)));
  await browser.close();
  done();
})();
