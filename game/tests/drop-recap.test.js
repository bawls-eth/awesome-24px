// Drop recap shows what actually dropped (styled wpn_ weapons), and dungeon chests can hold wpn_ weapons on their own seeded stream.
// Run: BASE=http://localhost:8601/game/index.html NODE_PATH=$(npm root -g) node game/tests/drop-recap.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/mad-maze/index.html';
const MM = 'pixeltown-mm-v1', ACTIVE = 'pixeltown-mm-active-v1';
const hero = (id, cls) => ({ id, name: cls, cls, level: 5, xp: 0, fame: 0, bonus: 0, mode: 'classic', items: [] });
const prof = (heroes) => ({ v: 1, heroes, stash: new Array(16).fill(null), fame: 0, mode: 'classic', hall: [], migratedFrom: null });

async function open(browser, url, cls, ready) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html>town' }));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate(([k1, p, k2, a]) => { localStorage.clear(); localStorage.setItem(k1, JSON.stringify(p)); localStorage.setItem(k2, a); }, [MM, prof(cls ? [hero('h-' + cls, cls)] : []), ACTIVE, JSON.stringify({ v: 1, heroId: cls ? 'h-' + cls : null })]);
  await page.goto(url);
  await page.waitForFunction(ready, null, { timeout: 15000 });
  return { ctx, page, errors };
}
const SLOTS = ['armor', 'ring', 'trinket', 'armor', 'ring', 'trinket', 'ring'];
const grants = (page, slots) => page.evaluate((slots) => { const d = window.__mm.dungeon; d.arena.save.items = []; return slots.map((s) => { const g = d.grantItem(s, 1); return g.id; }); }, slots);

(async () => {
  const browser = await chromium.launch();
  const errs = [];

  // ---- world recap ----
  const W = await open(browser, PAGE + '?mode=world&test=1&seed=12345', 'ranger', () => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play'); errs.push(...W.errors);
  await W.page.waitForFunction(() => window.__mm.world.liveCount() > 2, null, { timeout: 10000 });
  const rec = await W.page.evaluate(() => {
    const a = window.__mm.arena, w = window.__mm.world;
    a.player.iframes = 1e9; a._hitPlayer = () => {}; a._wpnRng = () => 0; // always converts: the real _wpnDrop path with a fixed roll
    const orig = a.dropBag.bind(a); a.dropBag = (x, y, r, id, wl) => orig(x, y, r, 'sparkwand', wl); // every rolled item is the classic wand
    w.setDropAll(true); a.bags.forEach((b) => { b.active = false; });
    let last = null;
    for (const le of w.liveEnemies()) {
      const e = w.enemyById(le.id); if (!e || !e.active) continue;
      e.x = a.player.x + 400; e.y = a.player.y; a._hitEnemy(e, 99999);
      const d = w.lastDrops(); const l = d[d.length - 1]; if (l && l.items.length) { last = l; break; }
    }
    w.setDropAll(false);
    const bag = a.bags.find((b) => b.active);
    let toast = null;
    if (bag) { a.texts.forEach((t) => { t.active = false; }); a.collectItem(bag.id, bag.r); const t = a.texts.find((q) => q.active && q.plain); toast = t ? t.plain : null; }
    const def = last ? (MMWeaponItems.get(last.items[0].id) || null) : null;
    return { last, bagId: bag ? bag.id : null, toast, defName: def ? def.name : null };
  });
  const it0 = rec.last && rec.last.items[0];
  check('recap item is the converted wpn_ weapon, not the rolled wand', !!it0 && /^wpn_/.test(it0.id) && it0.rolled && it0.rolled !== it0.id, JSON.stringify(rec.last));
  check('recap shows the styled item name', !!it0 && !!rec.defName && it0.name.replace(/^T\d+ /, '') === rec.defName && // gear is on by default: a tiered drop is named 'T2 Triple Shot'
     it0.name !== 'Spark Wand', JSON.stringify(it0));
  check('recap id matches the bag on the floor and its pickup toast', !!it0 && rec.bagId === it0.id && rec.toast === rec.defName, JSON.stringify({ bag: rec.bagId, toast: rec.toast }));
  await W.ctx.close();

  // ---- dungeon chests ----
  const DUN = (seed) => PAGE + '?mode=dungeon&seed=' + seed + '&test=1';
  const ready = () => window.__mm && window.__mm.dungeon && window.__mm.dungeon.grantItem;
  const D1 = await open(browser, DUN(7), 'ranger', ready); errs.push(...D1.errors);
  const ws = await D1.page.evaluate(() => { const d = window.__mm.dungeon; d.arena.save.items = []; const out = []; for (let i = 0; i < 40; i++) { const g = d.grantItem('weapon', 1); out.push({ id: g.id, name: g.name }); } return { out, names: out.map((o) => (MMWeaponItems.get(o.id) || {}).name) }; });
  const wpn = ws.out.filter((o) => /^wpn_/.test(o.id));
  check('a hero\'s weapon chest can yield wpn_ items (some, not all, of 40)', wpn.length >= 5 && wpn.length < 40, wpn.length + '/40');
  check('the chest recap lists the styled item name', wpn.length > 0 && ws.out.every((o, i) => !/^wpn_/.test(o.id) || o.name === ws.names[i]), JSON.stringify(wpn.slice(0, 2)));
  const fam = await D1.page.evaluate((ids) => { const fam = MMWeapons.familyOf('ranger'); return ids.map((id) => (MMWeaponItems.get(id) || {}).family === fam); }, wpn.map((o) => o.id));
  check('wpn_ chest items favour the hero family (about 70%)', fam.filter(Boolean).length / Math.max(1, fam.length) >= 0.5, fam.filter(Boolean).length + '/' + fam.length);
  const seq1 = ws.out.map((o) => o.id).join();
  await D1.ctx.close();
  const D2 = await open(browser, DUN(7), 'ranger', ready); errs.push(...D2.errors);
  const seq2 = await D2.page.evaluate(() => { const d = window.__mm.dungeon; d.arena.save.items = []; const out = []; for (let i = 0; i < 40; i++) out.push(d.grantItem('weapon', 1).id); return out.join(); });
  check('same seed, same hero: identical chest contents (deterministic)', seq1 === seq2);
  // Old-seed identity: non-weapon slots are exactly the loot stream picks, with or without a hero.
  const exp = await D2.page.evaluate((slots) => { const L = MMRng.create('loot:7'); const SI = { armor: ['heartcharm', 'swiftcharm'], trinket: ['heartcharm', 'swiftcharm'], ring: ['luckring', 'scholarring', 'wardring'] }; return slots.map((s) => L.pick(SI[s])); }, SLOTS);
  const D3 = await open(browser, DUN(7), 'ranger', ready); errs.push(...D3.errors);
  const got = await grants(D3.page, SLOTS);
  check('old seed: non-weapon chest contents unchanged (match the loot stream)', got.join() === exp.join(), got.join() + ' vs ' + exp.join());
  const mixed = await D3.page.evaluate(() => { const d = window.__mm.dungeon; d.arena.save.items = []; const L = MMRng.create('loot:7'); for (let i = 0; i < 7; i++) L.pick([1, 2]); const slots = ['weapon', 'ring', 'weapon', 'armor']; const SI = { weapon: ['sparkwand', 'quickwand'], armor: ['heartcharm', 'swiftcharm'], ring: ['luckring', 'scholarring', 'wardring'] }; const exp = slots.map((s) => L.pick(SI[s])); const got = slots.map((s) => d.grantItem(s, 1).id); return { ok: got.every((id, i) => /^wpn_/.test(id) ? exp[i] === 'sparkwand' || exp[i] === 'quickwand' : id === exp[i]), got, exp }; });
  check('a weapon chest in between does not disturb the later non-weapon picks', mixed.ok && mixed.got[1] === mixed.exp[1] && mixed.got[3] === mixed.exp[3], JSON.stringify(mixed));
  await D3.ctx.close();
  const D4 = await open(browser, DUN(7), null, ready); errs.push(...D4.errors);
  const noHero = await D4.page.evaluate(() => { const d = window.__mm.dungeon; d.arena.save.items = []; const out = []; for (let i = 0; i < 30; i++) out.push(d.grantItem('weapon', 1).id); return out; });
  check('no hero (classic): weapon chests stay classic wands', noHero.every((id) => id === 'sparkwand' || id === 'quickwand'), noHero.join());
  await D4.ctx.close();

  check('no console errors', errs.length === 0, errs.join(' | '));
  await browser.close();
  done();
})();
