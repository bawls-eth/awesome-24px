// Cycle 11 L (2): Town stars in the local save, and the cross-tab "pending change lost" case.
//   A. Stars (scene.localScore) were not in pixeltown-save-v1 at all: an offline player started every visit at 0. Offline they are
//      now the additive key `stars` (0..1e9, a merged counter like the bag). Online is unchanged on purpose (design call).
//   B. A tab whose writes storage refuses (quota) held its change as a pending delta, but when another tab wrote the save first,
//      adoptSave reset this tab's counters to storage and moved the base, so the pending change was gone. Now the counters become
//      stored + (mine - base), and the tab retries its write when it sees the other tab's write land.
// Checks: old save without the key loads (0) and keeps every old key; bad values are cleaned; the Backup bundle carries the key
// and a restore plan/apply round trip keeps it; cleanTownSave accepts it; two tabs add up; a real E at the turnip stall spends
// saved stars after a reload. OFFLINE: helpers.offlineStub, literal db.attempts() === 0. Never chats, never writes to Firebase.
// Run: BASE=http://localhost:9111/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc11-lead-town-stars.test.js   (SHOTS=<dir>)
const { chromium } = require('playwright');
const { check, done, offlineStub, exposeGame, joinOffline, twoTabs } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const SHOTS = process.env.SHOTS || '';
const KEY = 'pixeltown-save-v1';

const QUOTA_INIT = () => {
  const orig = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) { if (window.__quota && k === 'pixeltown-save-v1') { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; } return orig.call(this, k, v); };
};
const st = (page) => page.evaluate(() => {
  const s = window.__g.scene.getScene('Town'); let raw = {};
  try { raw = JSON.parse(localStorage.getItem('pixeltown-save-v1') || '{}'); } catch (e) { raw = {}; }
  const row = [...document.querySelectorAll('#player-list li')].map((li) => li.textContent).find((t) => /ADMIN/.test(t)) || '';
  return { score: s.localScore, wood: s.resources.wood || 0, turnips: s.resources.turnips || 0, sparkles: (s.lifetimeStats || {}).sparkles || 0, row,
    stored: { has: Object.prototype.hasOwnProperty.call(raw, 'stars'), stars: raw.stars, wood: (raw.resources || {}).wood || 0, sparkles: (raw.lifetimeStats || {}).sparkles || 0, keys: Object.keys(raw).sort() } };
});
const award = (page, n) => page.evaluate((v) => { const s = window.__g.scene.getScene('Town'); s.awardPoint(v, (v > 0 ? '+' : '') + v + ' ⭐', s.localBody.x, s.localBody.y - 30); }, n);
const wood = (page, n) => page.evaluate((v) => { const s = window.__g.scene.getScene('Town'); s.resources.wood = (s.resources.wood || 0) + v; s.saveResources(); }, n);
const quota = (page, on) => page.evaluate((v) => { window.__quota = v; }, on);

async function openTown(ctx, name) {
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await exposeGame(page);
  await page.goto(BASE);
  await joinOffline(page, name);
  await page.waitForTimeout(400);
  return { page, errors };
}

(async () => {
  const browser = await chromium.launch();

  // ---------- A. stars persist offline (1280x720, then a phone) ----------
  // ONLY=tabs runs just part B (used to show part B failing on the old main.js, where part A stops at a missing method)
  for (const vp of process.env.ONLY === 'tabs' ? [] : [{ width: 1280, height: 720, touch: false }, { width: 390, height: 844, touch: true }]) {
    const tag = `${vp.width}x${vp.height}`;
    const ctx = await browser.newContext(vp.touch ? { viewport: vp, hasTouch: true, isMobile: true } : { viewport: vp });
    const db = await offlineStub(ctx);
    // an OLD save: no `stars` key, some other fields that must survive untouched
    const OLD = { name: 'ADMINstars', species: 'cat', frame: 0, resources: { wood: 4, stone: 2 }, lifetimeStats: { sparkles: 3 }, achievementsUnlocked: [], sellStreak: 2, lastSeenVersion: 'old', futureKey: { keep: true } };
    await ctx.addInitScript((o) => { if (!localStorage.getItem('pixeltown-save-v1') && !sessionStorage.getItem('__seeded')) { localStorage.setItem('pixeltown-save-v1', JSON.stringify(o)); } sessionStorage.setItem('__seeded', '1'); }, OLD);
    let { page, errors } = await openTown(ctx, 'ADMINstars');
    let s = await st(page);
    // the Town itself may pay a small join award (the day's first visit paid 1 star when this was written), so the wallet is
    // measured, not assumed: it must be small, and whatever it is must already be in the save
    const w0 = s.score;
    check(`[${tag}] an old save without the stars key loads: wallet starts from 0 (only the Town's own join award, ${w0}), bag kept`, w0 >= 0 && w0 <= 60 && s.wood === 4 && (w0 === 0 ? !s.stored.has : s.stored.stars === w0), JSON.stringify(s));
    const before = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
    await award(page, 250);
    s = await st(page);
    check(`[${tag}] earning 250 stars writes the additive key (stars: join award + 250)`, s.score === w0 + 250 && s.stored.stars === w0 + 250, JSON.stringify(s));
    const after = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
    const lost = Object.keys(before).filter((k) => !(k in after));
    check(`[${tag}] additive: every key the old save had is still there, unknown keys untouched`, lost.length === 0 && JSON.stringify(after.futureKey) === JSON.stringify(OLD.futureKey) && after.sellStreak === 2 && after.resources.stone === 2, 'lost=' + lost.join(','));

    // reload = a new visit
    await page.close();
    ({ page, errors } = await openTown(ctx, 'ADMINstars'));
    s = await st(page);
    const W = w0 + 250;
    check(`[${tag}] after a reload the wallet is still ${W} (was 0 every visit)`, s.score === W && s.stored.stars === W, JSON.stringify(s));
    check(`[${tag}] the player list shows the saved stars at the start of the visit`, s.row.includes('⭐' + W), s.row);

    // real input: E (or the phone's action button) at the turnip stall spends saved stars
    const price = await page.evaluate(() => {
      const sc = window.__g.scene.getScene('Town');
      sc.localBody.setPosition(TURNIP_STALL_POS.x, TURNIP_STALL_POS.y + 20); if (sc.localBody.body) sc.localBody.body.reset(TURNIP_STALL_POS.x, TURNIP_STALL_POS.y + 20);
      return { near: sc.isNearTurnipStall(), act: sc.canAct() };
    });
    check(`[${tag}] the hero stands at the turnip stall and can act`, price.near && price.act, JSON.stringify(price));
    if (vp.touch) await page.locator('#interact-btn').tap(); else await page.keyboard.press('e');
    await page.waitForTimeout(300);
    const s2 = await st(page);
    const bought = s2.turnips > 0;
    check(`[${tag}] a real buy at the stall with saved stars: the wallet and the saved stars drop together`, bought ? (s2.score < W && s2.score >= 0 && s2.stored.stars === s2.score) : (s2.score === W && s2.stored.stars === W), JSON.stringify(s2));
    console.log(`  [${tag}] stall: turnips ${s2.turnips}, wallet ${s2.score}, saved ${s2.stored.stars}` + (bought ? '' : ' (price above the wallet today: no buy, wallet unchanged)'));
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/cyc11-lead-stars-${tag}.jpg`, type: 'jpeg', quality: 80 });

    if (!vp.touch) {
      // bad stored values are cleaned at load (never NaN, never negative, capped)
      for (const [bad, want] of [[-5, 0], ['abc', 0], [1e12, 1e9], [3.7, 3], [null, 0], [{ a: 1 }, 0]]) {
        const got = await page.evaluate((v) => {
          const raw = JSON.parse(localStorage.getItem('pixeltown-save-v1')); raw.stars = v; localStorage.setItem('pixeltown-save-v1', JSON.stringify(raw));
          const sc = window.__g.scene.getScene('Town');
          return sc.starsPersist() ? cleanCount(loadSave().stars) : -1;
        }, bad);
        check(`[${tag}] stored stars ${JSON.stringify(bad)} reads as ${want}`, got === want, 'got ' + got);
      }
      await page.evaluate((v) => { const raw = JSON.parse(localStorage.getItem('pixeltown-save-v1')); raw.stars = v; localStorage.setItem('pixeltown-save-v1', JSON.stringify(raw)); }, s2.score);

      // Backup carries the key; plan + apply puts it back; a town-only file with just stars is accepted
      const bk = await page.evaluate(async (wallet) => {
        const B = await loadBackupModules(); if (!B) return { ok: false };
        const bun = B.bundle(localStorage);
        const inBundle = JSON.parse(bun.keys['pixeltown-save-v1']).stars;
        const text = JSON.stringify(bun);
        const mem = { d: {}, getItem(k) { return k in this.d ? this.d[k] : null; }, setItem(k, v) { this.d[k] = String(v); }, removeItem(k) { delete this.d[k]; }, key(i) { return Object.keys(this.d)[i] || null; }, get length() { return Object.keys(this.d).length; } };
        const p = B.plan(text); const r = p.ok ? B.apply(mem, p) : { ok: false };
        let restored = null; try { restored = JSON.parse(mem.getItem('pixeltown-save-v1')).stars; } catch (e) { restored = 'err'; }
        const town = cleanTownSave({ stars: 12 });
        return { ok: true, inBundle, planOk: p.ok, applyOk: r.ok, restored, town: town && town.stars, wallet };
      }, s2.score);
      check(`[${tag}] the Backup bundle carries stars, and plan + apply restores the same number`, bk.ok && bk.inBundle === s2.score && bk.planOk && bk.applyOk && bk.restored === s2.score, JSON.stringify(bk));
      check(`[${tag}] the Town Restore accepts a town-only file that has stars`, bk.town === 12, JSON.stringify(bk));

      // online is unchanged: with a net that is not offline nothing reads or writes the key
      const on = await page.evaluate(() => {
        const sc = window.__g.scene.getScene('Town'); const was = sc.net.offline; const before = JSON.parse(localStorage.getItem('pixeltown-save-v1')).stars;
        sc.net.offline = false; const persist = sc.starsPersist(); const score = sc.localScore;
        sc.awardPoint(9, '+9', sc.localBody.x, sc.localBody.y - 30);
        const after = JSON.parse(localStorage.getItem('pixeltown-save-v1')).stars;
        sc.localScore = score; sc.net.offline = was;
        return { persist, before, after };
      });
      check(`[${tag}] online path unchanged: stars are not written to the save there`, on.persist === false && on.before === on.after, JSON.stringify(on));
    }
    check(`[${tag}] no page errors, no database traffic (literal 0)`, errors.length === 0 && db.attempts() === 0, errors.join(' | ') + ' db=' + db.attempts());
    await ctx.close();
  }

  // ---------- B. two tabs: stars add up; a pending change survives another tab's write ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await ctx.addInitScript(QUOTA_INIT);
    const { db, a, b, errors } = await twoTabs(ctx);
    await joinOffline(a, 'ADMINtabs');
    await joinOffline(b, 'ADMINtabs');
    await a.waitForTimeout(400);

    let sa = await st(a), sb = await st(b);
    const j = sb.stored.stars || 0; // the Town's own join award(s), already in the save
    check('[tabs] both tabs start from the same saved wallet', sa.score === j && sb.score === j && j <= 120, JSON.stringify({ a: sa.score, b: sb.score, stored: j }));
    await award(a, 5);
    await b.waitForTimeout(300);
    await award(b, 3);
    await a.waitForTimeout(300);
    sa = await st(a); sb = await st(b);
    check('[tabs] stars earned in two tabs add up (+5 and +3 = +8) in the save and in both wallets', sb.stored.stars === j + 8 && sa.score === j + 8 && sb.score === j + 8, JSON.stringify({ a: sa.score, b: sb.score, stored: sb.stored.stars, j }));

    // tab A: storage refuses. It gathers 3 wood, earns 2 stars and catches a sparkle (a lifetime stat).
    const w0 = sa.wood, sp0 = sa.sparkles;
    await quota(a, true);
    await wood(a, 3);
    await award(a, 2);
    await a.evaluate(() => window.__g.scene.getScene('Town').incrementStat('sparkles'));
    sa = await st(a);
    check('[tabs] tab A with storage refused: the change is held for this visit, not in the save', sa.wood === w0 + 3 && sa.score === j + 10 && sa.sparkles === sp0 + 1 && sa.stored.wood === w0 && sa.stored.stars === j + 8 && sa.stored.sparkles === sp0, JSON.stringify(sa));

    // tab B writes first (5 wood). A sees the write; its own pending 3 wood / 2 stars / 1 sparkle must NOT be thrown away.
    await wood(b, 5);
    await a.waitForTimeout(400);
    sa = await st(a);
    check('[tabs] another tab wrote first: tab A now shows storage + its own pending change (wood +5 +3, stars +8 +2, sparkle +1)', sa.wood === w0 + 8 && sa.score === j + 10 && sa.sparkles === sp0 + 1, JSON.stringify({ wood: sa.wood, w0, score: sa.score, sparkles: sa.sparkles, sp0 }));
    check('[tabs] ... and the save still holds only what landed (tab A is still refused)', sa.stored.wood === w0 + 5 && sa.stored.stars === j + 8 && sa.stored.sparkles === sp0, JSON.stringify(sa.stored));

    // storage works again for A; the next write by B makes A flush on its own (no action in A)
    await quota(a, false);
    await wood(b, 1);
    await a.waitForTimeout(500);
    sa = await st(a);
    await b.waitForTimeout(300);
    sb = await st(b);
    check('[tabs] storage works again: tab A writes its pending change when it sees the next write (save: wood +9, stars +10, sparkle +1)', sa.stored.wood === w0 + 9 && sa.stored.stars === j + 10 && sa.stored.sparkles === sp0 + 1, JSON.stringify(sa.stored));
    check('[tabs] both tabs agree with the save afterwards', sa.wood === w0 + 9 && sb.wood === w0 + 9 && sa.score === j + 10 && sb.score === j + 10, JSON.stringify({ a: [sa.wood, sa.score], b: [sb.wood, sb.score] }));

    // nothing pending: a plain adopt is still exactly "take what storage holds" (no doubled counts)
    await wood(b, 2);
    await a.waitForTimeout(400);
    sa = await st(a);
    check('[tabs] with nothing pending, tab A simply follows storage (wood +11, not doubled)', sa.wood === w0 + 11 && sa.stored.wood === w0 + 11, JSON.stringify({ wood: sa.wood, stored: sa.stored.wood }));
    check('[tabs] no page errors in either tab, no database traffic (literal 0)', errors.a.filter((e) => !/Quota/i.test(e)).length === 0 && errors.b.length === 0 && db.attempts() === 0, JSON.stringify(errors) + ' db=' + db.attempts());
    await ctx.close();
  }

  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
