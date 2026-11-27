// Cycle 16 S (1): two Town tabs on one save. fishlog, home, weedsPulled and birthdays used to be whole-key writes, so the second (stale)
// tab wrote its older copy over a claim the first tab had just stored, and the same claim then paid again in that tab:
//   [WD] tab A pulls weed 0, stale tab B pulls weed 1: storage must hold both, and B pulling weed 0 again pays nothing.
//   [FM] A claims the 4-species journal milestone, B (stale) logs a fish: the claim stays stored, and B cannot claim it again.
//   [FC] A logs a NEW species, B (stale) catches the same species: no second first-catch bonus; the count is kept (max per entry).
//   [BD] A gives today's birthday gift, B (stale) gives too: paid once; B's later writes keep A's claim.
//   [HM] A's daily home visitor bonus, then B (stale) opens home: paid once. A places a good in spot 1, B (stale) puts a fish in the
//        tank: A's placed good is still stored (it used to vanish: gone from the bag AND from the spot).
// OFFLINE: helpers.offlineStub, literal db.attempts() === 0. Save format: additive only (no new key; the same keys are merged).
// Run: BASE=http://localhost:9105/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc16-s-claim-merge-tabs.test.js   (SHOTS=<dir>)
const { chromium } = require('playwright');
const { check, done, twoTabs, joinOffline } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const SHOTS = process.env.SHOTS || '';

const T = (page, fn, arg) => page.evaluate(([f, a]) => { const s = window.__g.scene.getScene('Town'); return (0, eval)('(' + f + ')')(s, a); }, [fn.toString(), arg]);
// Chromium syncs localStorage between tab processes asynchronously: give the other tab's write a moment to arrive before reading it.
const raw = (page) => page.waitForTimeout(300).then(() => page.evaluate(() => { try { return JSON.parse(localStorage.getItem('pixeltown-save-v1') || '{}'); } catch (e) { return {}; } }));
// B acts AFTER A's write reached its process (a second tab a moment later; a same-millisecond race between two processes is out of scope)
const settle = (page) => page.waitForTimeout(300);
const paid = (page, src) => T(page, (s, re) => s.__aw.filter((a) => new RegExp(re).test(a[1])).length, src);
const spy = (page) => T(page, (s) => { s.__aw = []; const o = s.awardPoint.bind(s); s.awardPoint = (n, txt, ...r) => { s.__aw.push([n, String(txt)]); return o(n, txt, ...r); }; });

(async () => {
  const browser = await chromium.launch();
  for (const vp of [{ w: 1280, h: 720, tag: '1280x720', touch: false }, { w: 390, h: 844, tag: '390x844', touch: true }]) {
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, hasTouch: vp.touch, isMobile: vp.touch });
    const { db, a, b, errors } = await twoTabs(ctx, BASE);
    const tag = `[${vp.tag}]`;
    const NAME = 'ADMINcyc16s' + (vp.touch ? 'P' : '');
    await joinOffline(a, NAME);
    // seed: 4 species logged (milestone set4 claimable), goods and gifts in the bag, today's birthday villager known
    await T(a, (s) => {
      const caught = {}; FISH_SPECIES.slice(0, 4).forEach((f) => { caught[f.id] = { n: 1, best: 20 }; });
      const res = { ...s.resources }; VILLAGERS.forEach((v) => v.likes.forEach((k) => { res[k] = 5; }));
      const crafted = { ...s.craftedGoods }; RECIPES.forEach((r) => { crafted[r.id] = 3; });
      writeSave({ fishlog: { caught, claimed: [], lastDay: 0 }, resources: res, crafted, home: { slots: [null, null, ...RECIPES.slice(-(HOME_SLOTS - 2)).map((r) => r.id)], tank: [null, null, null], paidDay: 0 } }); // both tabs have cozy > 0
    });
    await a.reload(); await joinOffline(a, NAME);
    await joinOffline(b, NAME); // B loads the same save, then goes stale
    await a.waitForTimeout(500);
    await spy(a); await spy(b);
    const bday = await T(a, (s) => VILLAGERS[0].id);
    const forceDay = (s, vid) => { const v = VILLAGERS.find((x) => x.id === vid); s.todaysBirthdayVillager = () => v; s.findNearestVillager = () => v; s.weedDay = s.questDayBucket(); };
    await T(a, forceDay, bday); await T(b, forceDay, bday);

    // ---- [WD] weeds ----
    const pullA = await T(a, (s) => s.pullWeed({ ...s.weedSpots[0], index: 0 }));
    await settle(b);
    const pullB = await T(b, (s) => s.pullWeed({ ...s.weedSpots[1], index: 1 }));
    let st = await raw(a);
    const ids = st.weedsPulled && st.weedsPulled.ids || [];
    check(`${tag} [WD] both tabs pulled a weed`, pullA === true && pullB === true, JSON.stringify([pullA, pullB]));
    check(`${tag} [WD] storage holds both pulls (A's weed 0 and B's weed 1)`, ids.includes(0) && ids.includes(1), JSON.stringify(st.weedsPulled));
    await settle(b);
    const again = await T(b, (s) => s.pullWeed({ ...s.weedSpots[0], index: 0 }));
    check(`${tag} [WD] stale tab B pulling A's weed 0 again is refused and pays nothing`, again === false && (await paid(b, '^🌿 \\+')) === 1, JSON.stringify({ again, paidB: await paid(b, '^🌿 \\+') }));
    check(`${tag} [WD] and B hides that weed now`, await T(b, (s) => !s.weedSprites[0].visible && s.weedsPulledToday.has(0)));

    // ---- [FM] fish milestone ----
    const claimA = await T(a, (s) => s.claimFishMilestone('set4'));
    check(`${tag} [FM] A claims the 4-species milestone`, claimA === true);
    await settle(b);
    await T(b, (s) => s.recordFishCatch({ x: s.localBody.x, y: s.localBody.y, shadow: { size: 0.1 } }));
    st = await raw(a);
    check(`${tag} [FM] B's fish write keeps A's claim stored`, st.fishlog && Array.isArray(st.fishlog.claimed) && st.fishlog.claimed.includes('set4'), JSON.stringify(st.fishlog && st.fishlog.claimed));
    await settle(b);
    const claimB = await T(b, (s) => s.claimFishMilestone('set4'));
    check(`${tag} [FM] stale tab B cannot claim it again (paid once in total)`, claimB === false && (await paid(a, 'species logged')) + (await paid(b, 'species logged')) === 1, JSON.stringify({ claimB }));

    // ---- [FC] first-catch bonus for the same new species ----
    const fresh = await T(a, (s) => FISH_SPECIES.find((f) => !s.fishlog.caught[f.id] && !s.loadFishLog().caught[f.id]).id);
    const forceSp = (s, id) => { s.rollFishSpecies = () => FISH_SPECIES.find((f) => f.id === id); };
    await T(a, forceSp, fresh); await T(b, forceSp, fresh);
    const before = (await paid(a, 'new fish logged')) + (await paid(b, 'new fish logged'));
    const ca = await T(a, (s) => s.recordFishCatch({ x: s.localBody.x, y: s.localBody.y, shadow: { size: 0.5 } }));
    await settle(b);
    const cb = await T(b, (s) => s.recordFishCatch({ x: s.localBody.x, y: s.localBody.y, shadow: { size: 0.5 } }));
    const after = (await paid(a, 'new fish logged')) + (await paid(b, 'new fish logged'));
    st = await raw(a);
    check(`${tag} [FC] the same new species pays the first-catch bonus once across both tabs`, ca.isNew === true && cb.isNew === false && after - before === 1, JSON.stringify({ a: ca.isNew, b: cb.isNew, paid: after - before }));
    check(`${tag} [FC] storage counts it (n >= 2) and keeps every species either tab logged`, st.fishlog.caught[fresh] && st.fishlog.caught[fresh].n >= 2 && Object.keys(st.fishlog.caught).length >= 5, JSON.stringify(st.fishlog.caught[fresh]));

    // ---- [BD] birthday gift ----
    await T(a, (s) => s.giveNearestVillagerGift());
    await settle(b);
    await T(b, (s) => s.giveNearestVillagerGift());
    const bdPaid = (await paid(a, "'s party!")) + (await paid(b, "'s party!"));
    check(`${tag} [BD] today's birthday gift pays once across both tabs`, bdPaid === 1, 'paid ' + bdPaid);
    await settle(b);
    await T(b, (s) => s.pullWeed({ ...s.weedSpots[2], index: 2 })); // an unrelated later write from B
    await settle(b);
    await T(b, (s) => { s.birthdayClaimedIds = new Set(); s.birthdayGuests = new Set(); writeSave({ birthdays: { claimed: [], guests: [] } }); }); // a stale whole copy
    st = await raw(a);
    const want = await T(a, (s, vid) => `${s.questDayBucket()}:${vid}`, bday);
    check(`${tag} [BD] the claim survives a stale tab writing its empty copy`, st.birthdays && st.birthdays.claimed.includes(want) && st.birthdays.guests.includes(bday), JSON.stringify(st.birthdays));

    // ---- [HM] home visitor bonus and placement ----
    const cozyB = await T(b, (s) => Math.floor(s.homeCozy() / HOME_BONUS_PER));
    check(`${tag} [HM] stale tab B has a visitor bonus of its own to (wrongly) pay`, cozyB > 0, 'bonus ' + cozyB);
    await T(a, (s) => { s.setHomeSlot(0, RECIPES[RECIPES.length - 1].id); s.closeHome && s.closeHome(); });
    await T(a, (s) => { s.openHome(); s.closeHome(); });
    await settle(b);
    await T(b, (s) => { s.openHome(); s.closeHome(); });
    const hmPaid = (await paid(a, 'visitors admire')) + (await paid(b, 'visitors admire'));
    check(`${tag} [HM] the daily home visitor bonus pays once across both tabs`, hmPaid === 1, 'paid ' + hmPaid);
    const good = await T(a, (s) => RECIPES[1].id);
    await T(a, (s, id) => s.setHomeSlot(1, id), good);
    await settle(b);
    const fishId = await T(b, (s) => Object.keys(s.loadFishLog().caught)[0]);
    await settle(b);
    await T(b, (s, id) => { s.fishlog = s.loadFishLog(); return s.setTankSlot(0, id); }, fishId);
    st = await raw(a);
    check(`${tag} [HM] A's good in spot 2 is still stored after stale B changed the tank`, st.home && st.home.slots[1] === good && st.home.tank[0] === fishId, JSON.stringify(st.home));
    check(`${tag} [HM] and A's earlier spot 1 too`, st.home && st.home.slots[0] === (await T(a, (s) => RECIPES[RECIPES.length - 1].id)), JSON.stringify(st.home && st.home.slots));
    if (SHOTS) {
      await T(a, (s) => s.openHome());
      await a.screenshot({ path: `${SHOTS}/cyc16-systems-home-${vp.tag}.jpg`, type: 'jpeg', quality: 70 });
      await T(a, (s) => s.closeHome());
    }

    check(`${tag} 0 page errors in both tabs`, errors.a.filter((e) => /pageerror/.test(e)).length === 0 && errors.b.filter((e) => /pageerror/.test(e)).length === 0, [...errors.a, ...errors.b].slice(0, 3).join(' | '));
    check(`${tag} 0 database attempts`, db.attempts() === 0, 'attempts ' + db.attempts());
    await ctx.close();
  }
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
