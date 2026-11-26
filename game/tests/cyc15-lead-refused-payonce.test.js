// Cycle 15 L (1): the remaining pay-once records, with browser storage refusing pixeltown-save-v1 (same class as the cycle 13 mailbox
// and cycle 14 chores-bonus / bounty bugs). All are now read through payOnceRecord() (live read).
//   [BO] Bug-Off: the count was read from storage on every catch, so at "need - 1" every catch paid the medal again.
//   [VT] daily hello: 'talked today' was read from storage, so every chat gave the daily hearts (and the wave bounty tick) again.
//   [ER] Mocha's errand: a refused step vanished, so she took the 3 wood again on every talk.
//   [FM] fish milestone, [WD] weeds / Spotless bonus, [HM] home visitor bonus: paid once per visit already (in-memory record);
//        pinned here, plus the "not saved yet" note that FM and the Spotless bonus did not have.
// Then storage returns: every record is written once and nothing pays again.
// OFFLINE: helpers.offlineStub, literal db.attempts() === 0. Save format unchanged (no new key).
// Run: BASE=http://localhost:9101/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc15-lead-refused-payonce.test.js   (SHOTS=<dir>)
const { chromium } = require('playwright');
const { check, done, offlineStub, exposeGame, joinOffline } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const SHOTS = process.env.SHOTS || '';
const WARN = /not saved yet/i;

async function openIn(ctx, name) {
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await exposeGame(page);
  await page.addInitScript(() => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) { if (window.__quota && k === 'pixeltown-save-v1') { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; } return orig.call(this, k, v); };
  });
  await page.goto(BASE);
  await joinOffline(page, name);
  await page.waitForTimeout(600);
  return { page, errors };
}
const quota = (page, on) => page.evaluate((v) => { window.__quota = v; }, on);
const raw = (page) => page.evaluate(() => { try { return JSON.parse(localStorage.getItem('pixeltown-save-v1') || '{}'); } catch (e) { return {}; } });
const T = (page, fn, arg) => page.evaluate(([f, a]) => { const s = window.__g.scene.getScene('Town'); return (0, eval)('(' + f + ')')(s, a); }, [fn.toString(), arg]);
// payouts are counted by their own award text (achievement stars that a first catch / pull also unlocks are not the claim)
const paid = (page, re) => T(page, (s, src) => s.__aw.filter((a) => new RegExp(src).test(a[1])).length, re.source);
const note = (page) => T(page, (s) => s.lastStallNote || '');
const clearNote = (page) => T(page, (s) => { s.lastStallNote = ''; });

(async () => {
  const browser = await chromium.launch();
  for (const vp of [{ w: 1280, h: 720, tag: '1280x720', touch: false }, { w: 390, h: 844, tag: '390x844', touch: true }]) {
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, hasTouch: vp.touch, isMobile: vp.touch });
    const db = await offlineStub(ctx);
    const { page, errors } = await openIn(ctx, 'ADMINcyc15pay' + (vp.touch ? 'P' : ''));
    const tag = `[${vp.tag}]`;
    await T(page, (s) => {
      s.localScore = 100; s.saveStars();
      s.__aw = []; const o = s.awardPoint.bind(s); s.awardPoint = (n, txt, ...r) => { s.__aw.push([n, String(txt)]); return o(n, txt, ...r); };
    });

    // ---- [BO] Bug-Off prize ----
    await T(page, (s) => {
      s.isBugOffTime = () => true;
      writeSave({ bugoff: { day: s.questDayBucket(), count: BUGOFF_TIERS[0].need - 1, tier: 0, best: BUGOFF_TIERS[0].need - 1 } });
    });
    await quota(page, true);
    await clearNote(page);
    for (let i = 0; i < 3; i++) await T(page, (s) => s.bugOffCaught());
    const bo = await T(page, (s) => s.bugOffRecord());
    check(`${tag} [BO] refused save: three catches pay the Bronze medal once`, (await paid(page, /Bug-Off Bronze/)) === 1, 'paid ' + (await paid(page, /Bug-Off Bronze/)));
    check(`${tag} [BO] the count keeps going up for this visit (need+2, tier 1)`, bo.count === 7 && bo.tier === 1, JSON.stringify(bo));
    check(`${tag} [BO] the player is told the prize is not saved yet`, WARN.test(await note(page)), await note(page));

    // ---- [VT] daily hello ----
    const vt0 = await T(page, (s) => {
      s.villagerIsAsleep = () => false; s.isBirthdayFor = () => false;
      const v = VILLAGERS.find((x) => x.id !== 'mocha'); s.__v = v; s.__wave = 0;
      const ob = s.bountyEvent.bind(s); s.bountyEvent = (k, ...r) => { if (k === 'town:wave') s.__wave++; return ob(k, ...r); };
      return { id: v.id, a: s.villagerAffinity(v.id), step: VILLAGER_DAILY_TALK_AFFINITY };
    });
    for (let i = 0; i < 4; i++) await T(page, (s) => { s.talkToVillager(s.__v); });
    const vt1 = await T(page, (s) => ({ a: s.villagerAffinity(s.__v.id), wave: s.__wave }));
    check(`${tag} [VT] refused save: four chats give the daily hearts once (+${vt0.step})`, vt1.a - vt0.a === vt0.step, JSON.stringify({ before: vt0.a, after: vt1.a }));
    check(`${tag} [VT] the hello counts once for the wave bounty`, vt1.wave === 1, 'wave events ' + vt1.wave);

    // ---- [ER] Mocha's errand ----
    const er0 = await T(page, (s) => { s.resources.wood = 20; s.errandAsked = true; return { on: s.errandsOn(), cost: window.MMErrands.COST.wood }; });
    check(`${tag} the errand is on`, er0.on === true);
    await clearNote(page);
    const erLines = [];
    for (let i = 0; i < 3; i++) erLines.push(await T(page, (s) => s.errandTalk()));
    const er1 = await T(page, (s) => ({ wood: s.resources.wood, stage: s.errandTown ? s.errandTown().s : -1 }));
    check(`${tag} [ER] refused save: three talks take the wood once (-${er0.cost})`, er1.wood === 20 - er0.cost && er1.stage === 1, JSON.stringify({ er1, erLines }));

    // ---- [FM] fish milestone ----
    await T(page, (s) => { FISH_SPECIES.slice(0, FISH_MILESTONES[0].need).forEach((f) => { s.fishlog.caught[f.id] = { n: 1, best: 20 }; }); });
    await clearNote(page);
    const fm = await T(page, (s) => [s.claimFishMilestone(FISH_MILESTONES[0].id), s.claimFishMilestone(FISH_MILESTONES[0].id)]);
    check(`${tag} [FM] refused save: the milestone is claimed once`, fm[0] === true && fm[1] === false && (await paid(page, /species logged/)) === 1, JSON.stringify(fm));
    check(`${tag} [FM] the player is told it is not saved yet`, WARN.test(await note(page)), await note(page));

    // ---- [WD] weeds and the Spotless bonus ----
    await clearNote(page);
    const wd = await T(page, (s) => {
      const n = s.weedSpots.length; let pulled = 0, again = 0;
      s.weedSpots.forEach((spot, i) => { if (s.pullWeed({ ...spot, index: i })) pulled++; });
      s.weedSpots.forEach((spot, i) => { if (s.pullWeed({ ...spot, index: i })) again++; });
      s.weedDay = -1; s.refreshWeeds(); // a day-roll style re-read while storage still refuses: the pulled set must come back from the live record
      return { n, pulled, again, left: s.weedsLeft() };
    });
    check(`${tag} [WD] refused save: every weed pays once and the Spotless bonus once`, wd.n > 0 && wd.pulled === wd.n && wd.again === 0 && (await paid(page, /Spotless town/)) === 1 && (await paid(page, /^🌿 \+/)) === wd.n, JSON.stringify(wd));
    check(`${tag} [WD] a re-read of today's record still has every weed pulled (live read)`, wd.left === 0, 'left ' + wd.left);
    check(`${tag} [WD] the player is told the Spotless bonus is not saved yet`, WARN.test(await note(page)), await note(page));

    // ---- [HM] home visitor bonus ----
    await T(page, (s) => { s.homeCozy = () => HOME_BONUS_PER * 2; s.openHome(); });
    const homeNote = await page.evaluate(() => document.getElementById('home-note').textContent);
    if (SHOTS) await page.screenshot({ path: SHOTS + `/cyc15-lead-payonce-unsaved-${vp.tag}.jpg`, type: 'jpeg', quality: 65 }).catch(() => null);
    await T(page, (s) => { s.closeHome(); s.home = s.loadHome(); s.homeCozy = () => HOME_BONUS_PER * 2; s.openHome(); }); // even a fresh read of the record
    check(`${tag} [HM] refused save: the visitor bonus is paid once, also after a re-read of the record`, (await paid(page, /visitors admire/)) === 1, 'paid ' + (await paid(page, /visitors admire/)));
    check(`${tag} [HM] the home note says it is not saved yet`, WARN.test(homeNote), homeNote);
    await T(page, (s) => s.closeHome());

    // ---- storage returns: every record lands once, nothing pays again ----
    const before = await T(page, (s) => s.__aw.length);
    const mid = await raw(page);
    check(`${tag} while refused nothing of this reached storage`, !(mid.bugoff && mid.bugoff.tier === 1) && !(mid.villagerTalkDay && mid.villagerTalkDay[vt0.id]) && !mid.weedsPulled && !(mid.errand && mid.errand.s), JSON.stringify({ b: mid.bugoff, v: mid.villagerTalkDay, w: mid.weedsPulled, e: mid.errand }));
    await quota(page, false);
    await T(page, (s) => { s.incrementStat('sparkles'); s.flushPendingSave(); s.errandTalk(); });
    const sv = await raw(page);
    const day = await T(page, (s) => s.questDayBucket());
    check(`${tag} storage back: Bug-Off count 7 tier 1`, !!sv.bugoff && sv.bugoff.count === 7 && sv.bugoff.tier === 1 && sv.bugoff.day === day, JSON.stringify(sv.bugoff));
    check(`${tag} storage back: the hello day and the hearts are stored`, !!sv.villagerTalkDay && !!sv.villagerTalkDay[vt0.id] && !!sv.villagerAffinity && sv.villagerAffinity[vt0.id] === vt1.a, JSON.stringify({ t: sv.villagerTalkDay, a: sv.villagerAffinity }));
    check(`${tag} storage back: the errand step is stored (s 1)`, !!sv.errand && sv.errand.s === 1, JSON.stringify(sv.errand));
    check(`${tag} storage back: the milestone, the weeds and the home day are stored`, !!sv.fishlog && sv.fishlog.claimed.includes('set4') && !!sv.weedsPulled && sv.weedsPulled.ids.length === wd.n && !!sv.home && sv.home.paidDay === day, JSON.stringify({ f: sv.fishlog && sv.fishlog.claimed, w: sv.weedsPulled && sv.weedsPulled.ids.length, h: sv.home && sv.home.paidDay }));
    check(`${tag} storage back: stored stars equal live stars`, sv.stars === (await T(page, (s) => s.localScore)), JSON.stringify({ stored: sv.stars }));
    await T(page, (s) => {
      s.bugOffCaught(); s.talkToVillager(s.__v); s.claimFishMilestone(FISH_MILESTONES[0].id); s.openHome(); s.closeHome();
      s.weedSpots.forEach((spot, i) => s.pullWeed({ ...spot, index: i }));
      s.errandTalk();
    });
    const after = await T(page, (s) => ({ n: s.__aw.length, wood: s.resources.wood, a: s.villagerAffinity(s.__v.id) }));
    check(`${tag} after storage is back nothing pays or charges again`, after.n === before && after.wood === er1.wood && after.a === vt1.a, JSON.stringify({ before, after }));

    check(`${tag} no page errors, no database traffic (literal 0)`, errors.length === 0 && db.attempts() === 0, errors.join(' | ') + ' db=' + db.attempts());
    await ctx.close();
  }
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
