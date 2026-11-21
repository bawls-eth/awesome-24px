// G16: soulbound + co-op guards. (1) T11 stash deposit refused with a message, (2) T3/T10 deposit round-trips t and a,
// (3) the team `loot` event never carries t (grep + runtime spy). Offline (blockDb), no Firebase traffic.
// Run: BASE=http://localhost:8761/game/index.html NODE_PATH=$(npm root -g) node game/tests/gear-soulbound.test.js
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const S = require('../shared/mm-stash.js'), P = require('../shared/mm-profile.js');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&offline=1&heropick=1';
const MM = 'pixeltown-mm-v1', ACTIVE = 'pixeltown-mm-active-v1';

(async () => {
  // ---- (1) + (2) pure deposit ----
  const mk = (items) => P.clean({ heroes: [{ id: 'h1', name: 'Bo', cls: 'ranger', level: 5, items }] });
  const prof = mk([{ id: 'sparkwand', r: 1, t: 11 }, { id: 'sparkwand', r: 3, t: 12, a: 99 }, { id: 'wpn_bow_triple', r: 2, t: 3 }, { id: 'sparkwand', r: 0, t: 10, a: 5 }]);
  const r11 = S.deposit(prof, 'h1', 0), r12 = S.deposit(prof, 'h1', 1);
  check('T11 deposit is refused with a friendly message', !r11.ok && /soulbound/i.test(r11.msg) && !/_|<|undefined/.test(r11.msg), r11.msg);
  check('T12 deposit is refused too, and both stay on the hero', !r12.ok && prof.heroes[0].items.length === 4 && prof.stash.every((x) => !x));
  const r3 = S.deposit(prof, 'h1', 2);
  check('T3 deposit succeeds and round-trips t', r3.ok && prof.stash[r3.slot].t === 3 && prof.stash[r3.slot].id === 'wpn_bow_triple', JSON.stringify(prof.stash[0]));
  const r10 = S.deposit(prof, 'h1', 2); // T10 now at index 2
  check('T10 deposit round-trips t and a', r10.ok && prof.stash[r10.slot].t === 10 && prof.stash[r10.slot].a === 5, JSON.stringify(prof.stash[r10.slot]));
  const back = P.clean(JSON.stringify(prof));
  check('stash survives a profile clean with t and a', back.stash.some((x) => x && x.t === 3) && back.stash.some((x) => x && x.t === 10 && x.a === 5));
  check('lantern routes its deposit through MMStash.deposit', /S\.deposit\(profile/.test(fs.readFileSync(path.join(__dirname, '../games/mad-maze/lantern.js'), 'utf8')));
  const f = S.record(null, { n: 1, id: 'wpn_bow_triple', r: 2, t: 9, a: 77 }, 'world');
  const pay = S.payout(mk([]), [{ n: 1 }], f, { heroId: 'h1' });
  check('lantern payout keeps t and a', pay.profile.stash[0] && pay.profile.stash[0].t === 9 && pay.profile.stash[0].a === 77);

  // ---- (3) loot never carries t: static ----
  const rj = fs.readFileSync(path.join(__dirname, '../realm.js'), 'utf8');
  const loot = rj.match(/ev\('loot', \[[^\]]*\]/g) || [];
  check('static: every loot event is [b.id, b.r]', loot.length >= 1 && loot.every((l) => l === "ev('loot', [b.id, b.r]"), JSON.stringify(loot));
  check('static: realm-team never builds a loot event with t', !/['"]loot['"][^;\n]{0,80}\bt\s*:/.test(fs.readFileSync(path.join(__dirname, '../realm-team.js'), 'utf8')));

  // ---- runtime spy ----
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  const db = await blockDb(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate(([k1, p, k2, a]) => { localStorage.clear(); localStorage.setItem(k1, JSON.stringify(p)); localStorage.setItem(k2, a); }, [MM, { v: 1, heroes: [{ id: 'h-ranger', name: 'Aya', cls: 'ranger', level: 3, xp: 0, fame: 0, bonus: 0, mode: 'classic', items: [] }], stash: new Array(16).fill(null), fame: 0, mode: 'classic', hall: [], migratedFrom: null }, ACTIVE, JSON.stringify({ v: 1, heroId: 'h-ranger' })]);
  await page.goto(WORLD);
  await page.waitForFunction(() => window.__mm && window.__mm.arena);
  const evs = await page.evaluate(() => {
    const a = window.__mm.arena; const seen = [];
    a.role = 'host';
    a.team = { partner: { ready: true, down: false, x: a.player.x + 400, y: a.player.y }, ev: (k, d) => seen.push({ k, d: JSON.parse(JSON.stringify(d)) }) };
    const b = a._take(a.bags);
    Object.assign(b, { active: true, x: a.player.x + 400, y: a.player.y, vx: 0, vy: 0, t: 0.3, lifetime: 99, id: 'sparkwand', r: 1, tier: 0, tt: 12, a: 5 });
    a._updateBags(0.016);
    a.team = null; a.role = null;
    return seen;
  });
  check('runtime: the partner pickup fires a loot event', evs.length === 1 && evs[0].k === 'loot', JSON.stringify(evs));
  check('runtime: the loot event is exactly [id, r], no t or a', evs.length === 1 && evs[0].d.length === 2 && typeof evs[0].d[0] === 'string' && typeof evs[0].d[1] === 'number', JSON.stringify(evs));
  check('no DB traffic and no page errors', db.count() === 0 && errors.length === 0, errors.join('|'));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
