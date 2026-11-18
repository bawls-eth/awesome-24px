const { launch, scene, check, done } = require('./helpers');

(async () => {
  let { browser, page, errors } = await launch();
  // 1. Species rules: nothing impossible ever drops; every species is reachable.
  const a = await scene(page, (s) => {
    const bad = []; const seen = new Set();
    let seed = 7; const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (const pond of ['main', 'east']) for (const hour of [3, 12, 21]) for (const season of ['spring', 'summer', 'autumn', 'winter']) for (let i = 0; i < 80; i++) {
      const f = s.rollFishSpecies(pond, hour, season, rng(), rng); seen.add(f.id);
      const night = hour >= 19 || hour < 6;
      if ((f.pond && f.pond !== pond) || (f.time && (f.time === 'night') !== night) || (f.seasons && !f.seasons.includes(season))) bad.push([f.id, pond, hour, season]);
    }
    return { bad: bad.length, seen: seen.size, total: FISH_SPECIES.length };
  });
  check('journal: no species ever bites out of its pond/time/season', a.bad === 0, JSON.stringify(a));
  check('journal: every one of the 12 species can be rolled', a.seen === a.total && a.total === 12, JSON.stringify(a));

  // 2. Real catch path: 30 forced bites log species, keep the fish counter, save additively.
  const b = await scene(page, (s) => {
    const spot = { x: MAIN_POND.cx + 20, y: MAIN_POND.cy - 60, shadow: null };
    const fish0 = s.resources.fish; const score0 = s.localScore; let news = 0;
    for (let i = 0; i < 30; i++) {
      s.fishing = { state: 'biting', spot, timer: null, bobber: null };
      const before = s.fishSpeciesCount(); s.handleFishingInteract(); if (s.fishSpeciesCount() > before) news++;
    }
    const save = JSON.parse(localStorage.getItem('pixeltown-save-v1'));
    const total = Object.values(s.fishlog.caught).reduce((n, c) => n + c.n, 0);
    return { fishGain: s.resources.fish - fish0, species: s.fishSpeciesCount(), total, news, saved: Object.keys(save.fishlog.caught).length, savedLast: save.fishlog.lastDay === s.questDayBucket(), starGain: s.localScore - score0, btn: document.getElementById('journal-btn').textContent };
  });
  check('catch: the fish resource still increases by one per catch (30)', b.fishGain === 30, JSON.stringify(b));
  check('catch: each catch is logged (30 total), species counted, saved additively', b.total === 30 && b.species >= 2 && b.saved === b.species && b.savedLast, JSON.stringify(b));
  check('catch: first catches pay +2 stars each and the button shows progress', b.starGain >= b.news * 2 && new RegExp(`${b.species}/12`).test(b.btn), JSON.stringify(b));

  // 3. Journal UI: button + L key, found/locked cards, canAct, Esc.
  const c = await scene(page, (s) => {
    s.openJournal();
    const found = document.querySelectorAll('.fish-card.found').length; const locked = document.querySelectorAll('.fish-card.locked').length;
    const lockedText = document.querySelector('.fish-card.locked small') && document.querySelector('.fish-card.locked small').textContent;
    const prog = document.getElementById('journal-progress').textContent; const canAct = s.canAct(); s.closeTopOverlay();
    return { found, locked, lockedText, prog, canAct, closed: !s.journalOpen, species: s.fishSpeciesCount() };
  });
  check('journal: found + locked cards match progress; locked cards show a hint', c.found === c.species && c.found + c.locked === 12 && (c.locked === 0 || (c.lockedText && c.lockedText.length > 2)) && c.prog.startsWith(`${c.species}/12`), JSON.stringify(c));
  check('journal: input blocked while open; Esc closes', c.canAct === false && c.closed === true);
  await page.keyboard.press('l'); await page.waitForTimeout(200);
  const opened = await scene(page, (s) => !!s.journalOpen);
  await page.keyboard.press('l'); await page.waitForTimeout(200);
  check('journal: L toggles the journal', opened === true && (await scene(page, (s) => !s.journalOpen)) === true);

  // 4. Milestones: pay exactly once, saved first, only when earned; achievements; Today chore.
  const d = await scene(page, (s) => {
    s.fishlog.caught = {}; FISH_SPECIES.slice(0, 3).forEach((f) => { s.fishlog.caught[f.id] = { n: 1, best: 20 }; }); s.fishlog.claimed = [];
    const early = s.claimFishMilestone('set4');
    FISH_SPECIES.slice(0, 4).forEach((f) => { s.fishlog.caught[f.id] = { n: 1, best: 20 }; });
    const s0 = s.localScore; const ok = s.claimFishMilestone('set4'); const paid = s.localScore - s0;
    const again = s.claimFishMilestone('set4');
    const save = JSON.parse(localStorage.getItem('pixeltown-save-v1')).fishlog;
    s.openJournal(); const btn = document.querySelector('[data-milestone=set4]'); const btnState = [btn.textContent, btn.disabled]; const h = btn.getBoundingClientRect().height; s.closeJournal();
    FISH_SPECIES.forEach((f) => { s.fishlog.caught[f.id] = { n: 1, best: 75 }; }); s.lifetimeStats.fishSpecies = 12; s.incrementStat('fishLunker');
    const chore = s.dailyItems().find((i) => i.id === 'fish');
    return { early, ok, paid, again, claimed: save.claimed, btnState, h, ach: ['fishSpecies5', 'fishSpecies12', 'fishLunker'].map((id) => s.achievementsUnlocked.has(id)), chore: chore.status };
  });
  check('milestone: cannot claim early; claiming pays >= 5 stars once; saved', d.early === false && d.ok && d.paid >= 5 && d.again === false && d.claimed.includes('set4'), JSON.stringify(d));
  check('milestone: button shows Claimed/disabled and is a >= 40px target', d.btnState[0] === 'Claimed' && d.btnState[1] === true && d.h >= 40, JSON.stringify(d.btnState) + d.h);
  check('achievements: Angler, Master Angler and Lunker unlock', d.ach.every(Boolean), JSON.stringify(d.ach));
  check('Today board: "Catch a fish" chore is done after a catch today', d.chore === 'done', d.chore);
  check('no console errors (desktop)', errors.length === 0, errors.join('|'));
  await browser.close();

  // 5. Reload keeps the log; corrupt values load clean.
  for (const bad of ['x', [1], { caught: 'q', claimed: 'z', lastDay: -2 }, { caught: { minnow: { n: -3, best: 'x' }, ghost: { n: 5, best: 9 }, koi: { n: 2, best: 1e999 } }, claimed: ['set4', 'hack', 'set4'] }, null]) {
    ({ browser, page, errors } = await launch({ width: 1000, height: 700 }, { fishlog: bad }));
    const r = await scene(page, (s) => ({ caught: s.fishlog.caught, claimed: s.fishlog.claimed, n: s.fishSpeciesCount() }));
    const okIds = Object.keys(r.caught).every((id) => ['minnow', 'shrimp', 'frog', 'koi', 'puffer', 'crab', 'turtle', 'squid', 'jelly', 'octopus', 'shark', 'goldfish'].includes(id) && r.caught[id].n > 0 && Number.isFinite(r.caught[id].best) && r.caught[id].best <= 200);
    check(`corrupt fishlog ${JSON.stringify(bad)}: sane, no errors`, okIds && r.claimed.every((x) => ['set4', 'set8', 'set12'].includes(x)) && new Set(r.claimed).size === r.claimed.length && errors.length === 0, JSON.stringify(r) + errors.join('|'));
    await browser.close();
  }
  ({ browser, page, errors } = await launch({ width: 1000, height: 700 }, { fishlog: { caught: { koi: { n: 3, best: 55 } }, claimed: [], lastDay: 1 } }));
  check('reload: saved catches load', await scene(page, (s) => s.fishlog.caught.koi.n === 3 && s.fishlog.caught.koi.best === 55 && /1\/12/.test(document.getElementById('journal-btn').textContent)));
  await browser.close();

  // 6. Phone: button opens the journal, grid fits 390x844, claim buttons >= 44px.
  ({ browser, page, errors } = await launch({ width: 390, height: 844 }, { fishlog: { caught: { minnow: { n: 4, best: 30 }, koi: { n: 2, best: 44 }, shrimp: { n: 1, best: 12 }, frog: { n: 1, best: 9 } }, claimed: [], lastDay: 0 } }, true));
  await page.click('#journal-btn');
  await page.waitForTimeout(300);
  const ph = await page.evaluate(() => { const c = document.querySelector('#journal-overlay .join-card').getBoundingClientRect(); const b = document.querySelector('.fish-claim-btn').getBoundingClientRect(); return { open: !document.getElementById('journal-overlay').classList.contains('hidden'), l: c.left, r: c.right, b: c.bottom, bh: b.height, sw: document.documentElement.scrollWidth, cards: document.querySelectorAll('.fish-card').length }; });
  check('phone: Journal button opens it; card fits 390x844; 12 cards; claim >= 44px', ph.open && ph.l >= 0 && ph.r <= 390 && ph.b <= 844 && ph.sw <= 390 && ph.cards === 12 && ph.bh >= 44, JSON.stringify(ph));
  if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + '/journal-phone.png' });
  await page.click('#journal-close-btn');
  check('phone: close works', await scene(page, (s) => !s.journalOpen));
  check('no console errors (phone)', errors.length === 0, errors.join('|'));
  console.log('fps', await page.evaluate(() => window.__g.loop.actualFps));
  await browser.close();
  done();
})();
