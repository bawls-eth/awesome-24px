// Slice B: loot from the Realm World and the Warren dungeons pays into the Lantern stash (shared/mm-stash.js).
// World run -> menu "Stashed N items, +M shards"; dungeon run -> summary line; the stash (16) and hero pack (24) caps, waiting finds,
// thrown-away finds, the realm backpack cap (overflow sells, no find), the Survivor's Cache (shards kept, cache item stashed), event
// fame, the Lantern settling on open with a Recent finds list, older saves (pixeltown-save-v1 / -mm-v1 / -realm-v1) loading unchanged,
// and the classic arena staying out of it. Run: BASE=http://localhost:8512/game/index.html NODE_PATH=$(npm root -g) node game/tests/world-stash.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/mad-maze/index.html';
const WORLD = PAGE + '?mode=world&test=1&seed=12345';
const LANTERN = ORIGIN + '/game/games/mad-maze/lantern.html?test=1';
const MM = 'pixeltown-mm-v1'; const SAVE = 'pixeltown-save-v1'; const RKEY = 'pixeltown-realm-v1'; const ACT = 'pixeltown-mm-active-v1';
// older-save fixtures (shapes from before this slice: no finds / evT / evDone / events stats)
const OLD_TOWN = { name: 'Pip', species: 'cat', bells: 120, inventory: [{ id: 'apple', n: 2 }], realm: { level: 4, xp: 0, shards: 50, bestWave: 2, kills: 7, deaths: 1, items: [{ n: 1, id: 'sparkwand', r: 0 }], nextUid: 2, eq: { weapon: 1 } } };
const OLD_MM = { v: 1, heroes: [{ id: 'h1', name: 'Mossy', cls: 'ranger', level: 6, xp: 10, fame: 12, bonus: 0, mode: 'classic', items: [{ id: 'luckring', r: 1 }] }], stash: [{ id: 'wardring', r: 0 }, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null], fame: 40, mode: 'classic', hall: [{ name: 'Old Pip', cls: 'herald', level: 20, fame: 900, how: 'retire' }], migratedFrom: null };
const OLD_REALM = { v: 1, seed: '12345', version: 1, pos: null, stats: { kills: 3, bossKills: 1, portals: 2 }, returnTo: null };

async function context(browser, seed, opts) {
  const ctx = await browser.newContext(opts || { viewport: { width: 1000, height: 700 } });
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' }));
  await ctx.route('**/hub/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>hub</title>hub' }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate((s) => { localStorage.clear(); Object.keys(s).forEach((k) => localStorage.setItem(k, typeof s[k] === 'string' ? s[k] : JSON.stringify(s[k]))); localStorage.setItem('mm-aim-assist', '0'); }, seed);
  errors.length = 0;
  return { ctx, page, errors };
}
const fixtures = () => ({ [SAVE]: OLD_TOWN, [MM]: OLD_MM, [RKEY]: OLD_REALM, [ACT]: { v: 1, heroId: 'h1' } });
const waitPlay = (page) => page.waitForFunction(() => window.__mm && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 15000 });
const A = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__mm.arena, window.__mm.world, ${JSON.stringify(arg)})`);
const LS = (page, k) => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), k);
const godMode = (page) => A(page, (a) => { a.player.iframes = 1e9; a._hitPlayer = () => {}; });
const menuNote = async (page) => { await page.click('#realm-menu-btn'); const t = await page.evaluate(() => { const e = document.querySelector('#realm-pause .rm-stash'); return e && !e.classList.contains('hidden') ? e.textContent : ''; }); await page.click('#realm-menu-close'); return t; };

(async () => {
  const browser = await chromium.launch();
  const errs = [];

  // ================= older saves load unchanged =================
  const W = await context(browser, fixtures()); const page = W.page;
  await page.goto(WORLD); await waitPlay(page); await godMode(page);
  const r0 = await LS(page, RKEY); const t0 = await LS(page, SAVE); const m0 = await page.evaluate((k) => localStorage.getItem(k), MM);
  check('older pixeltown-realm-v1 loads: seed and stats kept, only additive keys appear', r0.seed === '12345' && r0.stats.kills === 3 && r0.stats.bossKills === 1 && r0.stats.portals === 2 && r0.v === 1 && r0.finds === undefined, JSON.stringify(r0));
  check('older pixeltown-save-v1 loads: town fields untouched, realm fields kept', t0.name === 'Pip' && t0.bells === 120 && JSON.stringify(t0.inventory) === JSON.stringify(OLD_TOWN.inventory) && t0.realm.level === 4 && t0.realm.items[0].id === 'sparkwand', JSON.stringify(t0));
  check('older pixeltown-mm-v1 is not rewritten until there is something to pay', m0 === JSON.stringify(OLD_MM));

  // ================= world run: finds -> menu payout =================
  const sh0 = await A(page, (a) => a.save.shards);
  await A(page, (a) => { a.collectItem('heartcharm', 1); a.collectItem('quickwand', 2); a.collectItem('swiftcharm', 0); });
  const f1 = await A(page, (a, w) => w.finds());
  check('picked-up items are recorded as pending finds (source world)', f1.pending.length === 3 && f1.pending.every((x) => x.src === 'world') && f1.recent[0].id === 'swiftcharm', JSON.stringify(f1));
  const uid = await A(page, (a) => a.save.items.find((x) => x.id === 'swiftcharm').n);
  await A(page, (a, w, u) => a.discard(u), uid); // thrown away before the settle: not paid
  await A(page, (a) => { a.save.shards += 9; a.run.shards += 9; });
  const note1 = await menuNote(page);
  const mm1 = await LS(page, MM);
  check('world menu shows "Stashed 2 items, +M shards"', /^Stashed 2 items, \+\d+ shards/.test(note1) && Number(/\+(\d+) shards/.exec(note1)[1]) >= 9, note1);
  check('the kept finds are in the Lantern stash (free slots after the old item); the thrown-away one is not', mm1.stash[0].id === 'wardring' && mm1.stash[1].id === 'heartcharm' && mm1.stash[1].r === 1 && mm1.stash[2].id === 'quickwand' && mm1.stash[2].r === 2 && !mm1.stash.some((x) => x && x.id === 'swiftcharm'), JSON.stringify(mm1.stash));
  check('the realm backpack still holds the items (copied, never moved: nothing lost)', await A(page, (a) => a.save.items.some((x) => x.id === 'heartcharm') && a.save.items.some((x) => x.id === 'quickwand')));
  check('old Lantern fields survive the payout (heroes, hall, account fame)', mm1.heroes[0].name === 'Mossy' && mm1.heroes[0].items.length === 1 && mm1.hall[0].name === 'Old Pip' && mm1.fame === 40);
  const f2 = await A(page, (a, w) => w.finds());
  check('pending cleared after the payout; recent finds kept', f2.pending.length === 0 && f2.recent.length === 3 && f2.total === 2, JSON.stringify(f2));
  check('a second menu open pays nothing twice', (await menuNote(page)).startsWith('Stashed 2 items') && (await LS(page, MM)).stash.filter(Boolean).length === 3);

  // ================= caps: stash 16, hero pack 24, waiting; realm backpack 24 =================
  await page.evaluate((k) => { const p = JSON.parse(localStorage.getItem(k)); p.stash = p.stash.map((x) => x || { id: 'luckring', r: 0 }); p.heroes[0].items = Array.from({ length: 23 }, () => ({ id: 'luckring', r: 0 })); localStorage.setItem(k, JSON.stringify(p)); }, MM);
  await A(page, (a) => { a.collectItem('wardring', 2); a.collectItem('scholarring', 1); });
  const note2 = await menuNote(page); const mm2 = await LS(page, MM); const f3 = await A(page, (a, w) => w.finds());
  check('stash full: the next find goes to the active hero\'s pack (cap 24)', mm2.heroes[0].items.length === 24 && mm2.heroes[0].items[23].id === 'wardring', JSON.stringify(mm2.heroes[0].items.slice(-2)));
  check('stash and pack full: the find waits (pending), the menu says so', f3.pending.length === 1 && f3.pending[0].id === 'scholarring' && /waiting/.test(note2), note2 + ' ' + JSON.stringify(f3.pending));
  await page.evaluate((k) => { const p = JSON.parse(localStorage.getItem(k)); p.stash[5] = null; localStorage.setItem(k, JSON.stringify(p)); }, MM);
  await menuNote(page);
  check('a freed stash slot takes the waiting find on the next settle', (await LS(page, MM)).stash[5].id === 'scholarring' && (await A(page, (a, w) => w.finds().pending.length)) === 0);
  const bp = await A(page, (a, w) => { while (a.save.items.length < 24) a.save.items.push({ n: a.save.nextUid++, id: 'luckring', r: 0 }); const s = a.save.shards; const n = w.finds().pending.length; a.collectItem('heartcharm', 2); return { sold: a.save.shards > s, pend: w.finds().pending.length - n, len: a.save.items.length }; });
  check('realm backpack cap (24): an overflow pick-up sells for shards and is not a find', bp.sold && bp.pend === 0 && bp.len === 24, JSON.stringify(bp));
  await A(page, (a) => { a.save.items.splice(1, 12); });

  // ================= event fame =================
  await A(page, (a, w) => { w.onEventFame(30); w.settle('test'); });
  check('event fame is paid to the active hero on the settle', (await LS(page, MM)).heroes[0].fame === 42);

  // ================= Survivor's Cache: death keeps shards, the cache item is stashed =================
  await page.evaluate((k) => { const p = JSON.parse(localStorage.getItem(k)); p.stash[7] = null; localStorage.setItem(k, JSON.stringify(p)); }, MM);
  const d0 = await A(page, (a) => ({ shards: a.save.shards, items: a.save.items.length }));
  await A(page, (a) => { a._hitPlayer = RealmArena.prototype._hitPlayer; a.player.iframes = 0; a._die(); });
  await page.waitForSelector('#realm-death:not(.hidden)', { timeout: 8000 });
  const d1 = await A(page, (a, w) => ({ shards: a.save.shards, items: a.save.items.length, last: w.lastSettle(), recent: w.finds().recent[0], recap: document.querySelector('#realm-death .rm-recap').textContent }));
  const mm3 = await LS(page, MM);
  check('dying keeps every shard and adds the Survivor\'s Cache item', d1.shards >= d0.shards && d1.items === d0.items + 1, JSON.stringify({ d0, d1 }));
  check('the cache item is paid into the stash at once (source: cache)', d1.last && d1.last.src === 'death' && d1.last.items === 1 && d1.recent.src === 'cache' && mm3.stash[7] && mm3.stash[7].id === d1.recent.id, JSON.stringify(d1));
  check('the death recap shows the stash line', /Stashed \d+ items?, \+\d+ shards/.test(d1.recap), d1.recap);
  const r1 = await LS(page, RKEY);
  check('pixeltown-realm-v1 keeps its old fields next to the additive finds', r1.seed === '12345' && r1.stats.kills >= 3 && r1.stats.portals === 2 && r1.finds && Array.isArray(r1.finds.recent));
  errs.push(...W.errors); await W.ctx.close();

  // ================= dungeon run: summary line, items in the stash =================
  const D = await context(browser, fixtures()); const dp = D.page;
  await dp.goto(PAGE + '?mode=dungeon&seed=5&lv=2&test=1'); await waitPlay(dp);
  await A(dp, (a) => { a.collectItem('luckring', 2); a.collectItem('sparkwand', 1); a.save.shards += 60; });
  await A(dp, () => window.__mm.dungeon.finish());
  await dp.waitForSelector('#mm-summary:not(.hidden)');
  const ds = await dp.evaluate(() => ({ line: (document.getElementById('mm-sum-stash') || {}).textContent || '', stash: window.__mm.dungeon.stash }));
  const dm = await LS(dp, MM);
  check('dungeon summary shows "Stashed 2 items, +60 shards"', /Stashed 2 items, \+60 shards/.test(ds.line) && ds.stash.items === 2, JSON.stringify(ds));
  check('dungeon finds are in the Lantern stash', dm.stash[1].id === 'luckring' && dm.stash[1].r === 2 && dm.stash[2].id === 'sparkwand', JSON.stringify(dm.stash.slice(0, 4)));
  check('dungeon finds carry the Warren source', (await LS(dp, RKEY)).finds.recent.slice(0, 2).every((x) => x.src === 'dungeon'));
  errs.push(...D.errors); await D.ctx.close();
  // a dungeon fall: the cache item is stashed too
  const D2 = await context(browser, fixtures()); const dp2 = D2.page;
  await dp2.goto(PAGE + '?mode=dungeon&seed=6&lv=2&test=1'); await waitPlay(dp2);
  const sh2 = await A(dp2, (a) => a.save.shards);
  await A(dp2, (a) => { a.run.wave = 4; a._die(); });
  await dp2.waitForSelector('#mm-summary:not(.hidden)', { timeout: 8000 });
  const dl = await dp2.evaluate(() => ({ line: (document.getElementById('mm-sum-stash') || {}).textContent || '', head: document.querySelector('#mm-summary h2').textContent, shards: window.__mm.arena.save.shards }));
  check('dungeon fall: summary stashes the Survivor\'s Cache item, no shards lost', /fell/.test(dl.head) && /Stashed 1 item, \+0 shards/.test(dl.line) && dl.shards >= sh2 && (await LS(dp2, MM)).stash[1] !== null, JSON.stringify(dl));
  errs.push(...D2.errors); await D2.ctx.close();

  // ================= the Lantern settles on open and lists recent finds =================
  const town = JSON.parse(JSON.stringify(OLD_TOWN)); town.realm.items.push({ n: 7, id: 'quickwand', r: 1 });
  const L = await context(browser, Object.assign(fixtures(), { [SAVE]: town, [RKEY]: Object.assign({}, OLD_REALM, { finds: { pending: [{ n: 7, id: 'quickwand', r: 1, src: 'world' }], recent: [{ id: 'quickwand', r: 1, src: 'world' }, { id: 'heartcharm', r: 0, src: 'cache' }, { id: 'luckring', r: 2, src: 'dungeon' }], fame: 5 } }) }));
  const lp = L.page; const townRaw = JSON.stringify(town);
  await lp.goto(LANTERN); await lp.waitForSelector('#stash .slot');
  const lv = await lp.evaluate(() => ({ status: document.getElementById('status').textContent, finds: Array.from(document.querySelectorAll('#finds li')).map((x) => x.textContent), emptyShown: !document.getElementById('finds-empty').hidden, slot1: (document.querySelector('#stash .slot[data-slot="1"]') || {}).textContent, settled: window.__lantern.settled() }));
  const lm = await LS(lp, MM);
  check('opening the Lantern pays waiting finds into the stash (+ pending fame to the hero)', lm.stash[1] && lm.stash[1].id === 'quickwand' && lm.heroes[0].fame === 17 && lv.settled.items === 1, JSON.stringify(lv));
  check('the Lantern says what was stashed', /Stashed 1 item.*from your travels/.test(lv.status), lv.status);
  check('the Lantern shows a Recent finds list with sources', lv.finds.length === 3 && !lv.emptyShown && /World/.test(lv.finds[0]) && /Survivor's Cache/.test(lv.finds[1]) && /Warren/.test(lv.finds[2]), JSON.stringify(lv.finds));
  check('the Lantern never writes pixeltown-save-v1', (await lp.evaluate((k) => localStorage.getItem(k), SAVE)) === townRaw);
  errs.push(...L.errors); await L.ctx.close();
  // older Lantern save with no finds at all: loads unchanged, empty Recent finds
  const L2 = await context(browser, { [SAVE]: OLD_TOWN, [MM]: OLD_MM, [ACT]: { v: 1, heroId: 'h1' } });
  await L2.page.goto(LANTERN); await L2.page.waitForSelector('#stash .slot');
  const l2 = await L2.page.evaluate((k) => ({ mm: localStorage.getItem(k), realm: localStorage.getItem('pixeltown-realm-v1'), empty: !document.getElementById('finds-empty').hidden, heroes: document.querySelectorAll('#heroes > li').length }), MM);
  check('older pixeltown-mm-v1 with no world save: the Lantern loads it unchanged, writes no realm save, Recent finds empty', l2.mm === JSON.stringify(OLD_MM) && l2.realm === null && l2.empty && l2.heroes === 1, JSON.stringify(l2));
  errs.push(...L2.errors); await L2.ctx.close();

  // ================= classic arena: off =================
  const C = await context(browser, fixtures()); const cp = C.page;
  await cp.goto(PAGE + '?test=1'); await cp.waitForFunction(() => window.__mm && window.__mm.arena.active, null, { timeout: 15000 });
  await A(cp, (a) => { a.collectItem('heartcharm', 1); });
  const cnote = await menuNote(cp);
  const c1 = await cp.evaluate(() => ({ realm: localStorage.getItem('pixeltown-realm-v1'), mm: localStorage.getItem('pixeltown-mm-v1'), hooks: [window.__mm.arena.onItem, window.__mm.arena.onDeathCache, window.__mm.arena.onMenuOpen, window.__mm.arena.menuNote].every((x) => x === null) }));
  check('classic arena: no finds recorded, no stash payout, no stash line in the menu', c1.realm === JSON.stringify(OLD_REALM) && c1.mm === JSON.stringify(OLD_MM) && c1.hooks && cnote === '', JSON.stringify({ c1, cnote }));
  errs.push(...C.errors); await C.ctx.close();

  check('no console errors', errs.length === 0, errs.join(' | '));
  await browser.close();
  done();
})();
