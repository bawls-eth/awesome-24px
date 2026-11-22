// Lakeside Angler MG3 depth: bug bait from Bug Safari (read-only), the Isles cove (6 fish), aquarium decor. Offline, phone 390x844.
// Bug Safari's save (pixeltown-bugs-v1) and the archipelago save are only READ: the test spies on Storage.setItem/removeItem and
// compares the raw strings before and after. Existing bite tables stay byte-identical (also see shared-mm-angler-golden.test.js).
// Serve the repo root: python3 -m http.server 9151 &
// Run: BASE=http://localhost:9151/game/index.html NODE_PATH=$(npm root -g) node game/tests/angler-depth2.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const URL = (q) => ORIGIN + '/game/games/angler/index.html?test=1' + (q || '');
const KEY = 'pixeltown-angler-v1', BUGS = 'pixeltown-bugs-v1', ISLES = 'pixeltown-archipelago-v1', ACCESS = 'pixeltown-access-v1';
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

// seeds: {key: object} written once per context (before the page scripts run); then a write spy for foreign keys
function initScript(seeds) {
  return `(() => {
    if (!sessionStorage.s) { sessionStorage.s = 1; const s = ${JSON.stringify(seeds)}; Object.keys(s).forEach((k) => localStorage.setItem(k, JSON.stringify(s[k]))); }
    window.__writes = [];
    const set = Storage.prototype.setItem, rm = Storage.prototype.removeItem, clr = Storage.prototype.clear;
    Storage.prototype.setItem = function (k, v) { window.__writes.push(String(k)); return set.call(this, k, v); };
    Storage.prototype.removeItem = function (k) { window.__writes.push('rm:' + k); return rm.call(this, k); };
    Storage.prototype.clear = function () { window.__writes.push('clear'); return clr.call(this); };
  })();`;
}
async function open(browser, seeds, q) {
  const ctx = await browser.newContext(PHONE);
  const db = await blockDb(ctx);
  const page = await ctx.newPage();
  const errors = [], reqs = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push('console: ' + m.text()); });
  page.on('request', (r) => reqs.push(r.url()));
  await page.addInitScript(initScript(seeds || {}));
  await page.goto(URL(q || '&seed=d2'));
  await page.waitForFunction(() => window.__angler);
  return { ctx, page, errors, reqs, db };
}
const raw = (page, k) => page.evaluate((key) => localStorage.getItem(key), k);
const foreignWrites = (page) => page.evaluate((ks) => window.__writes.filter((k) => ks.some((x) => k.indexOf(x) >= 0) || k === 'clear'), [BUGS, ISLES]);
const catchFish = (page, id) => page.evaluate((f) => {
  const a = window.__angler;
  if (f) a.forceFish(f);
  a.tap(); a.advance(a.bite.wait + 0.2); a.tap();
  for (let i = 0; i < 4000 && a.state === 'reeling'; i++) { a.setHold(a.reel.tension < a.reel.pos); a.advance(1 / 30); }
  a.setHold(false);
  const o = { outcome: a.result && a.result.outcome, fish: a.result && a.result.fish }; a.dismiss(); return o;
}, id);
const minHeight = (page, sel) => page.$$eval(sel, (b) => (b.length ? Math.min.apply(null, b.map((x) => x.getBoundingClientRect().height)) : -1));
const minFont = (page, sel) => page.$$eval(sel, (b) => (b.length ? Math.min.apply(null, b.map((x) => parseFloat(getComputedStyle(x).fontSize))) : -1));
const BUG_SAVE = { v: 1, stars: { meadow: 2 }, best: { meadow: 320 }, journal: { ladybug: 3, cricket: 1, beetle: 0, moonwing: 0 } };
const ISLE_SAVE = { v: 1, visited: ['home', 'reef'], inv: { kelp: 4, shell: 2 } };

(async () => {
  const browser = await chromium.launch();

  // ---------- 1. bug bait ----------
  let p = await open(browser, {});
  await p.page.click('#gear-btn');
  check('bug bait: no Bug Safari save -> only "No bug bait", and the rule points to Bug Safari',
    (await p.page.$$eval('#bugbaits [data-bug]', (b) => b.map((x) => x.dataset.bug))).join() === '' && /Bug Safari/.test(await p.page.textContent('#bug-rule')));
  check('bug bait: a bug you never caught cannot be equipped', await p.page.evaluate(() => __angler.isles.setBugBait('ladybug') === false && __angler.isles.bugBait === ''));
  check('bug bait: nothing in the Bug Safari key was created by the Angler', (await raw(p.page, BUGS)) === null && (await foreignWrites(p.page)).length === 0);
  await p.ctx.close();

  p = await open(browser, { [BUGS]: BUG_SAVE });
  const bugsBefore = await raw(p.page, BUGS);
  await p.page.click('#gear-btn');
  check('bug bait: each species caught in Bug Safari (count >= 1) is one bait (ladybug, cricket; not beetle 0)',
    (await p.page.$$eval('#bugbaits [data-bug]', (b) => b.map((x) => x.dataset.bug))).join() === ',ladybug,cricket', await p.page.$$eval('#bugbaits [data-bug]', (b) => b.map((x) => x.dataset.bug).join()));
  check('bug bait: buttons are at least 44 px tall and their hint text is >= 12 px', (await minHeight(p.page, '#bugbaits .btn')) >= 44 && (await minFont(p.page, '#bugbaits .btn small, #bugbaits .btn span, #bug-rule')) >= 12);
  await p.page.click('#bugbaits [data-bug=ladybug]');
  check('bug bait: equipping is saved additively (bugBait) and shown in the status bar', await p.page.evaluate(() => JSON.parse(localStorage.getItem('pixeltown-angler-v1')).bugBait === 'ladybug' && !document.getElementById('bug-sum').hidden && /Ladybug/.test(document.getElementById('bug-sum').textContent)));
  check('bug bait: the equipped button is marked (aria-pressed)', (await p.page.getAttribute('#bugbaits [data-bug=ladybug]', 'aria-pressed')) === 'true');
  await p.page.click('#gear-close');
  // casts with the bug bait: real seeded rolls (no forced fish)
  const runs = [];
  for (let i = 0; i < 3; i++) runs.push(await catchFish(p.page, null));
  check('bug bait: seeded casts with a bug bait land real fish', runs.every((r) => r.outcome && r.fish), JSON.stringify(runs));
  check('bug bait: never used up (still equipped after 3 casts)', await p.page.evaluate(() => __angler.isles.bugBait === 'ladybug'));
  check('bug bait: Bug Safari save is byte-identical and never written / removed by the Angler', (await raw(p.page, BUGS)) === bugsBefore && (await foreignWrites(p.page)).length === 0, JSON.stringify(await foreignWrites(p.page)));
  const bias = await p.page.evaluate(() => {
    const A = window.MMAngler, I = window.MMAnglerIsles, ctxs = [];
    [1, 4, 7, 10].forEach((month) => [3, 12].forEach((hour) => ['clear', 'rain'].forEach((weather) => ctxs.push({ month, hour, weather }))));
    let worst = 0, lifted = 0, under = 0;
    Object.keys(I.BUG_BAITS).forEach((bug) => A.SPOTS.forEach((sp) => ctxs.forEach((c) => [{}, { lure: 'shiny' }, { baitType: 'rare' }].forEach((gear) => {
      const base = I.bug.rarityShares(sp, c, gear, ''), withBug = I.bug.rarityShares(sp, c, gear, bug);
      Object.keys(base).forEach((r) => { const k = withBug[r] / base[r]; worst = Math.max(worst, k); if (k > 1 + 1e-9) lifted++; if (k < 0.85) under++; });
    }))));
    const multOk = A.FISH.every((f) => Object.keys(I.BUG_BAITS).every((b) => I.bug.mult(b, f) >= 1 && I.bug.mult(b, f) <= 1.1));
    return { worst, lifted, under, multOk };
  });
  check('bug bait: every bait biases any rarity share by at most +10% (and does lift something)', bias.worst <= 1.1 + 1e-9 && bias.lifted > 0 && bias.multOk, JSON.stringify(bias));
  const same = await p.page.evaluate(() => {
    const A = window.MMAngler, I = window.MMAnglerIsles;
    return A.SPOTS.every((sp) => { const r1 = A.seedRng(7), r2 = A.seedRng(7); for (let i = 0; i < 40; i++) { const a = A.rollFish(r1, sp, { month: 1, hour: 12 }, { lure: 'worm' }), b = I.bug.rollFish(r2, sp, { month: 1, hour: 12 }, { lure: 'worm' }, ''); if ((a && a.id) !== (b && b.id)) return false; } return true; });
  });
  check('bug bait: with no bug bait the bite table is exactly the old one', same);
  // Bug Safari forgets a bug (save cleared by its owner): the Angler drops the bait on load, without touching the bugs key
  await p.page.evaluate((k) => { Storage.prototype.setItem.call(localStorage, k, JSON.stringify({ v: 1, journal: {} })); }, BUGS);
  await p.page.reload(); await p.page.waitForFunction(() => window.__angler);
  check('bug bait: a bait whose bug is gone falls back to none on load', await p.page.evaluate(() => __angler.isles.bugBait === '' && __angler.isles.bugBaits().length === 0));
  check('bug bait: page clean (no console errors, DB 0, no offsite requests)', p.errors.length === 0 && p.db.attempts() === 0 && p.reqs.every((u) => u.startsWith(ORIGIN + '/') || u.startsWith('data:')), p.errors.concat(p.reqs.filter((u) => !u.startsWith(ORIGIN))).join(' | '));
  await p.ctx.close();

  // ---------- 2. Isles cove ----------
  p = await open(browser, { [KEY]: { caught: { koi: { n: 1, best: 40 } }, bait: 5, bells: 30 } });
  check('cove: no archipelago save -> no Isles Cove spot, and pickSpot refuses it', (await p.page.$('#spots [data-spot=cove]')) === null && await p.page.evaluate(() => __angler.pickSpot('cove') === false && __angler.isles.coveOpen() === false));
  await p.ctx.close();

  p = await open(browser, { [KEY]: { caught: { koi: { n: 1, best: 40 } }, bait: 5, bells: 30 }, [ISLES]: { v: 1, visited: ['home', 'jungle'] } });
  check('cove: visiting other isles (not the reef) keeps the cove closed', (await p.page.$('#spots [data-spot=cove]')) === null);
  await p.ctx.close();

  p = await open(browser, { [KEY]: { caught: { koi: { n: 1, best: 40 } }, bait: 5, bells: 30 }, [ISLES]: ISLE_SAVE });
  const islesBefore = await raw(p.page, ISLES);
  check('cove: after visiting the reef the Isles Cove spot appears (>= 44 px) and opens', (await p.page.$('#spots [data-spot=cove]')) !== null && (await minHeight(p.page, '#spots .btn')) >= 44);
  await p.page.click('#spots [data-spot=cove]');
  check('cove: picking it sets the spot and the title', await p.page.evaluate(() => __angler.spot === 'cove') && (await p.page.textContent('#spot-title')) === 'Isles Cove');
  const pools = await p.page.evaluate(() => {
    const A = window.MMAngler, I = window.MMAnglerIsles, ids = (b) => I.cove.pool(b).map((f) => f.id).join();
    const seq = (b) => { const r = A.seedRng(31), out = []; for (let i = 0; i < 30; i++) out.push(I.cove.roll(r, b).id); return out.join(); };
    return { n: A.COVE_FISH.length, none: ids(''), kelp: ids('kelp'), shell: ids('shell'), pearl: ids('pearl'), det: seq('pearl') === seq('pearl'), pearlSeen: seq('pearl').indexOf('pearl_ray') >= 0, noPearl: seq('kelp').indexOf('pearl_ray') < 0,
      fish48: A.FISH.length, unique: new Set(A.COVE_FISH.map((f) => f.id).concat(A.FISH.map((f) => f.id))).size === 54 };
  });
  check('cove: 6 new species, ids unique next to the 48 lake fish (lake journal still 48)', pools.n === 6 && pools.fish48 === 48 && pools.unique, JSON.stringify(pools));
  check('cove: isles-themed bait gates species (no bait: open fish only; pearl -> Pearl Ray; kelp -> Ribbon Kelpfish + Parrotfish)',
    pools.none === 'kelp_darter,coral_goby' && pools.pearl === 'kelp_darter,coral_goby,pearl_ray' && pools.kelp === 'kelp_darter,coral_goby,kelp_ribbon,reef_parrot' && pools.shell === 'kelp_darter,coral_goby,shell_wrasse', JSON.stringify(pools));
  check('cove: seeded cove rolls are deterministic and respect the bait', pools.det && pools.pearlSeen && pools.noPearl);
  await p.page.click('#gear-btn');
  check('cove: cove bait row shows in Gear (kelp, shell, pearl; >= 44 px)', (await p.page.$$eval('#covebaits [data-cove-bait]', (b) => b.map((x) => x.dataset.coveBait).join())) === ',kelp,shell,pearl' && (await minHeight(p.page, '#covebaits .btn')) >= 44);
  await p.page.click('#covebaits [data-cove-bait=pearl]');
  await p.page.click('#gear-close');
  const before = await p.page.evaluate(() => ({ bait: __angler.bait, bells: __angler.market.bells, stock: JSON.stringify(__angler.market.stock), caught: JSON.stringify(__angler.journal.caught) }));
  const got = await catchFish(p.page, 'pearl_ray');
  const after = await p.page.evaluate(() => ({ bait: __angler.bait, bells: __angler.market.bells, stock: JSON.stringify(__angler.market.stock), caught: JSON.stringify(__angler.journal.caught), cove: __angler.isles.cove }));
  check('cove: a cove catch lands in journal.cove (additive key)', got.outcome === 'caught' && after.cove.pearl_ray && after.cove.pearl_ray.n === 1 && after.cove.pearl_ray.best > 0, JSON.stringify([got, after]));
  check('cove: no new currency (bells, stock, Market bait and the lake journal unchanged)', after.bait === before.bait && after.bells === before.bells && after.stock === before.stock && after.caught === before.caught, JSON.stringify([before, after]));
  const r2 = await catchFish(p.page, null);
  check('cove: an unforced cove cast rolls a cove fish', r2.outcome !== 'caught' || /^(kelp_darter|coral_goby|pearl_ray)$/.test(r2.fish), JSON.stringify(r2));
  await p.page.reload(); await p.page.waitForFunction(() => window.__angler);
  await p.page.click('#aquarium-btn');
  check('cove: catch survives a reload and shows in the aquarium (Isles Cove section)', /Pearl Ray \d+ cm/.test(await p.page.textContent('#aq-cove [data-cove=pearl_ray]')) && /Isles Cove [12]\/6/.test(await p.page.textContent('#aq-cove h3')));
  check('cove: the six lake spot sections are unchanged (still 6 data-spot sections)', await p.page.$$eval('.aqspot[data-spot]', (s) => s.length === 6));
  check('cove: archipelago save byte-identical and never written', (await raw(p.page, ISLES)) === islesBefore && (await foreignWrites(p.page)).length === 0);
  check('cove: page clean (no console errors, DB 0)', p.errors.length === 0 && p.db.attempts() === 0, p.errors.join(' | '));
  await p.ctx.close();

  // ---------- 3. aquarium decor ----------
  p = await open(browser, {});
  await p.page.click('#aquarium-btn');
  check('decor: fresh journal -> 8 decor pieces, all locked, each shows how it unlocks', await p.page.$$eval('#aq-decor [data-decor]', (b) => b.length === 8 && b.every((x) => x.classList.contains('locked') && x.querySelector('small').textContent.length > 3)));
  check('decor: a locked piece cannot be shown', await p.page.evaluate(() => __angler.isles.toggleDecor('lily_pad') === false && __angler.full.decor.length === 0));
  await p.ctx.close();

  p = await open(browser, { [KEY]: { caught: { koi: { n: 1, best: 40 } }, trophies: { old_whiskers: true }, bosses: { old_whiskers: true }, bells: 12 }, [BUGS]: BUG_SAVE, [ACCESS]: { v: 1, hudScale: 1.25 } });
  await p.page.click('#aquarium-btn');
  const unl = await p.page.evaluate(() => __angler.isles.decor().filter((d) => d.unlocked).map((d) => d.id).join());
  check('decor: unlocks come from progress (1 species, 1 trophy, 1 bug bait)', unl === 'lily_pad,sunken_chest,bug_lantern', unl);
  await p.page.click('#aq-decor [data-decor=lily_pad]');
  await p.page.click('#aq-decor [data-decor=bug_lantern]');
  check('decor: shown pieces are saved additively in order and marked on screen', await p.page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('pixeltown-angler-v1')).decor) === '["lily_pad","bug_lantern"]')
    && (await p.page.getAttribute('#aq-decor [data-decor=lily_pad]', 'aria-pressed')) === 'true');
  check('decor: the tank canvas names what is on show', /Lily pad.*Bug lantern/.test(await p.page.getAttribute('#aq-tank', 'aria-label')));
  check('decor: no currency pressure (bells unchanged, no prices or timers in the decor section)', await p.page.evaluate(() => __angler.market.bells === 12) && !/\bbells?\b|\bprice|\bcost|\btimer|\bexpire|\bhours?\b|\bdays?\b/i.test(await p.page.textContent('#aq-decor')));
  check('decor: honours shared text size (ui-scale 1.25 -> >= 15 px button text) and >= 44 px targets',
    (await p.page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim())) === '1.25' && (await minFont(p.page, '#aq-decor .btn small, #aq-decor .rule')) >= 15 && (await minHeight(p.page, '#aq-decor .btn')) >= 44);
  await p.page.reload(); await p.page.waitForFunction(() => window.__angler);
  check('decor: survives a reload; tapping again puts it away', await p.page.evaluate(() => __angler.full.decor.join() === 'lily_pad,bug_lantern' && __angler.isles.toggleDecor('lily_pad') === true && __angler.full.decor.join() === 'bug_lantern'));
  check('decor: Bug Safari save still never written', (await foreignWrites(p.page)).length === 0);
  check('decor: text in the new sections is >= 12 px', (await minFont(p.page, '#aq-decor *')) >= 12);
  check('decor: page clean (no console errors, DB 0, no horizontal scroll)', p.errors.length === 0 && p.db.attempts() === 0 && await p.page.evaluate(() => document.documentElement.scrollWidth <= 390), p.errors.join(' | '));
  await p.ctx.close();

  // ---------- 4. old saves stay byte-compatible ----------
  p = await open(browser, { [KEY]: { caught: { koi: { n: 2, best: 50 } }, bait: 3 } });
  const saved = await p.page.evaluate(() => { __angler.setJournal(__angler.full); return window.MMAngler.serialize(localStorage.getItem('pixeltown-angler-v1')); });
  check('save: a journal without MG3 data serializes with no MG3 keys (old format bytes)', !/cove|bugBait|coveBait|decor/.test(saved), saved);
  check('save: MMSideAccess is loaded on the Angler', await p.page.evaluate(() => !!window.MMSideAccess && !!window.MMAnglerIsles));
  check('save: page clean (DB 0)', p.errors.length === 0 && p.db.attempts() === 0);
  await p.ctx.close();

  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
