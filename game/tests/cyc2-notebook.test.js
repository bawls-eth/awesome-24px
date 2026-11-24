// cyc2-S ID-04 Hero notebook (knowledge meta-progression) + the elite drop-source fix found while wiring it.
// Node part: MMNotebook (ids, clean, cap, first-meet-only record, merge, sections) and the MMBackup key (cleaner, label, round trip,
// hostile values) in the shared-mm-backup style. Browser part (Realm world, blockDb, db.attempts() === 0): the first kill of a creature
// writes ONE page, a second kill of the same creature writes nothing, a world-boss kill adds a boss page, the Nexus Notebook button
// opens a labelled panel with 44 px targets, Esc closes it (the Nexus stays open), desktop + phone screenshots, ?notebook=0 off,
// and the rare giant_spider_queen elite now rolls src 'elite'.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/cyc2-notebook.test.js   (NODE_ONLY=1 skips the browser part)
const NB = require('../shared/mm-notebook.js');
const B = require('../shared/mm-backup.js');
const { check, done, blockDb } = require('./helpers');
const KEY = 'pixeltown-notebook-v1';
function fake(init) {
  const m = Object.assign({}, init || {});
  return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; }, _m: m };
}

// ---- node: module ----
check('ids: kill / boss / clear / tame build valid ids', NB.ids.kill('aimed', 'sand_crab', 0) === 'kill:aimed:sand_crab@0' && NB.ids.boss('kraken', 3) === 'boss:kraken@3' && NB.ids.clear('crypt') === 'clear:crypt' && NB.ids.tame('reef_ray') === 'tame:reef_ray');
check('ids: bad input gives null (zone 4, unknown pattern, upper case, html)', [NB.ids.kill('aimed', 'x', 4), NB.ids.kill('laser', 'x', 0), NB.ids.tame('Ray'), NB.ids.tame('<b>'), NB.ids.clear('')].every((x) => x === null));
const st = fake();
check('record: a first meet writes one page', NB.record(st, 'kill:aimed:sand_crab@0', 1000) === true && JSON.parse(st._m[KEY]).e['kill:aimed:sand_crab@0'] === 1000);
let writes = 0; const st2 = fake({ [KEY]: st._m[KEY] }); const set0 = st2.setItem; st2.setItem = (k, v) => { writes++; set0(k, v); };
check('record: a known page writes NOTHING (first meet only, not per kill)', NB.record(st2, 'kill:aimed:sand_crab@0', 5000) === false && writes === 0 && JSON.parse(st2._m[KEY]).e['kill:aimed:sand_crab@0'] === 1000);
check('record: the same creature in another zone is a new page', NB.record(st, 'kill:aimed:sand_crab@1', 2000) === true && NB.count(NB.load(st)) === 2);
check('record: re-reads storage first (another tab\'s page survives)', (() => { const s = fake({ [KEY]: JSON.stringify({ v: 1, e: { 'tame:reef_ray': 7 } }) }); NB.record(s, 'clear:crypt', 9); const e = JSON.parse(s._m[KEY]).e; return e['tame:reef_ray'] === 7 && e['clear:crypt'] === 9; })());
check('record: a throwing storage returns false, never throws', (() => { const s = fake(); s.setItem = () => { throw new Error('quota'); }; s.getItem = () => { throw new Error('blocked'); }; return NB.record(s, 'clear:crypt', 1) === false; })());
const hostile = { v: 9, e: { 'kill:aimed:sand_crab@0': 5, '__proto__': 1, 'kill:aimed:x@9': 1, 'tame:ok': -1, 'tame:nan': NaN, 'tame:str': '5', 'clear:crypt': 1e99, 'boss:kraken@3': 3.7, ['tame:' + 'a'.repeat(80)]: 1 } };
const c = NB.clean(hostile);
check('clean: keeps only valid ids with valid times, floors them, v = 1', c.v === 1 && Object.keys(c.e).sort().join(',') === 'boss:kraken@3,kill:aimed:sand_crab@0' && c.e['boss:kraken@3'] === 3);
check('clean: junk roots become defaults', [null, 5, 'x', [], { e: [] }, { e: 'x' }].every((x) => JSON.stringify(NB.clean(x)) === '{"v":1,"e":{}}'));
check('clean: idempotent', JSON.stringify(NB.clean(c)) === JSON.stringify(c));
const big = { v: 1, e: {} }; for (let i = 0; i < 400; i++) big.e['tame:sp' + i] = 1000 + i;
const cb = NB.clean(big);
check('cap: clean keeps the earliest 300 pages', NB.count(cb) === NB.MAX && NB.MAX === 300 && cb.e['tame:sp0'] === 1000 && !('tame:sp350' in cb.e));
check('cap: a full notebook records nothing new', (() => { const s = fake({ [KEY]: JSON.stringify(cb) }); return NB.record(s, 'clear:crypt', 1) === false && NB.count(NB.load(s)) === 300; })());
const m = NB.merge({ v: 1, e: { 'clear:crypt': 50, 'tame:ray': 10 } }, { v: 1, e: { 'clear:crypt': 20, 'boss:kraken@3': 30 } });
check('merge: union, earliest time wins', NB.count(m) === 3 && m.e['clear:crypt'] === 20 && m.e['tame:ray'] === 10);
const secs = NB.sections({ v: 1, e: { 'kill:spiral:wisp_mote@0': 1, 'kill:aimed:sand_crab@2': 2, 'boss:kraken@3': 3, 'clear:crypt': 4, 'tame:reef_ray': 5 } });
check('sections: 4 categories in order, newest first, concrete titles and hints', secs.map((s) => s.id).join() === 'kill,boss,clear,tame' && secs[0].pages[0].title === 'Sand Crab' && secs[0].pages[0].where === 'Highlands' && /strafing/.test(secs[0].pages[0].hint) && secs[0].pages[1].title === 'Wisp Mote' && /spiral/.test(secs[0].pages[1].hint) && secs[1].pages[0].title === 'Kraken' && secs[2].pages[0].title === 'Crypt dungeon' && secs[3].pages[0].where === 'Isles');

// ---- node: Backup key (shared-mm-backup style) ----
const key = (k, v) => ({ format: 'pixeltown-backup', v: 2, keys: { [k]: v } });
check('backup: KNOWN includes the notebook key, with a label', B.KNOWN.indexOf(KEY) >= 0 && B.labelOf(KEY) === 'hero notebook' && !B.isSetting(KEY));
check('backup: KNOWN stays under MAX_KEYS', B.KNOWN.length <= B.MAX_KEYS);
const src = fake({ [KEY]: JSON.stringify({ v: 1, e: { 'tame:reef_ray': 3, 'clear:crypt': 4 } }), 'pixeltown-save-v1': '{"name":"Bo"}' });
const bun = B.bundle(src);
check('backup: bundle exports the notebook', typeof bun.keys[KEY] === 'string');
const dst = fake(); const r = B.restore(dst, JSON.parse(JSON.stringify(bun)));
check('backup: round trip restores every page', r.ok && NB.count(NB.load(dst)) === 2 && NB.load(dst).e['clear:crypt'] === 4);
const dirty = B.plan(key(KEY, JSON.stringify({ v: 1, e: { 'tame:ok': 1, '<img src=x>': 2, 'tame:bad': 'x' }, evil: 1 })));
check('backup: the owner cleaner drops junk pages and unknown fields', dirty.ok && JSON.stringify(JSON.parse(dirty.entries[KEY])) === '{"v":1,"e":{"tame:ok":1}}');
check('backup: a non-object notebook value is refused', !B.plan(key(KEY, '[1,2]')).ok && !B.plan(key(KEY, '5')).ok);
check('backup: a bundle without the notebook still restores', B.restore(fake(), key('pixeltown-jam-v1', '{}')).ok);

if (process.env.NODE_ONLY) { done(); return; }

// ---- browser ----
const { chromium } = require('playwright');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&offline=1&heropick=0&tutorial=0&seed=12345&qdate=2030-05-01';
const SAVE = { realm: { level: 4, xp: 0, shards: 50, bestWave: 2, items: [{ n: 1, id: 'sparkwand', r: 0 }], nextUid: 2, eq: { weapon: 1 } } };
const SHOTS = process.env.SHOTS || (__dirname + '/../design/beta/img');
const E = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__mm.arena, window.__mm.world, ${JSON.stringify(arg === undefined ? null : arg)})`);
const frames = (page, n) => page.evaluate((k) => new Promise((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

async function open(browser, phone, extra, store) {
  const ctx = await browser.newContext(phone ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } : { viewport: { width: 1280, height: 720 } });
  const db = await blockDb(ctx);
  await ctx.route('**/game/index.html*', (rt) => rt.fulfill({ contentType: 'text/html', body: '<!doctype html>town' }));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate((a) => { localStorage.clear(); localStorage.setItem('pixeltown-save-v1', a[0]); if (a[1]) localStorage.setItem('pixeltown-notebook-v1', a[1]); }, [JSON.stringify(SAVE), store || null]);
  await page.goto((extra && extra.indexOf('seed=') >= 0 ? WORLD.replace(/seed=\d+/, '') : WORLD) + (extra || ''));
  await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 30000 });
  await E(page, (a) => { a.player.iframes = 1e9; a._hitPlayer = () => {}; });
  return { ctx, page, errors, db };
}
// kill the nearest live zone enemy (waits for the spawner); returns its creature / type / zone
async function killOne(page, creature) {
  for (let i = 0; i < 60; i++) {
    const got = await E(page, (a, w, cr) => {
      const L = w.liveEnemies().filter((q) => !cr || q.art === cr); if (!L.length) return null;
      const q = L[0]; const e = w.enemyById(q.id); if (!e) return null; a._hitEnemy(e, 1e9); return { art: q.art, type: q.type, zone: q.zone };
    }, creature || null);
    if (got) { await frames(page, 2); return got; }
    await frames(page, 10);
  }
  return null;
}

(async () => {
  const browser = await chromium.launch(); const errs = [];
  // ---- desktop: kills write pages ----
  const D = await open(browser, false); const dp = D.page;
  check('notebook is on by default and starts empty', await E(dp, (a, w) => w.notebook.on && Object.keys(w.notebook.save().e || {}).length === 0));
  const k1 = await killOne(dp);
  const id1 = k1 ? 'kill:' + k1.type + ':' + k1.art + '@' + k1.zone : '';
  const after1 = await dp.evaluate(() => JSON.parse(localStorage.getItem('pixeltown-notebook-v1') || 'null'));
  check('first kill of a creature writes exactly one page to pixeltown-notebook-v1', !!k1 && after1 && Object.keys(after1.e).length === 1 && typeof after1.e[id1] === 'number', JSON.stringify({ k1, after1 }));
  // count writes to the notebook key from now on
  await dp.evaluate(() => { window.__nbW = 0; const s0 = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === 'pixeltown-notebook-v1') window.__nbW++; return s0.call(this, k, v); }; });
  const k2 = await killOne(dp, k1 && k1.art);
  const w2 = await dp.evaluate(() => window.__nbW);
  check('a second kill of the same creature in the same zone writes nothing', !!k2 && k2.zone === k1.zone && w2 === 0 && (await E(dp, (a, w) => w.notebook.newThisVisit())) === 1, JSON.stringify({ k2, w2 }));
  // world boss: wake the first altar boss and beat it
  const boss = await E(dp, (a, w) => {
    const s = w.bossSites()[0]; a.player.x = (s.x + 0.5) * w.TILE; a.player.y = (s.y + 2.5) * w.TILE; return s;
  });
  let bossPage = false;
  for (let i = 0; i < 40 && !bossPage; i++) {
    await E(dp, (a, w) => { w.bossTick(); const e = w.bossEntity(0); if (e && e.active) { e.invuln = 0; a._hitEnemy(e, 1e9); } });
    await frames(dp, 5);
    bossPage = await dp.evaluate((id) => { const o = JSON.parse(localStorage.getItem('pixeltown-notebook-v1') || 'null'); return !!(o && o.e[id]); }, 'boss:' + boss.boss + '@' + boss.zone);
  }
  check('a world-boss kill adds its boss page', bossPage, JSON.stringify(boss));
  // the Nexus panel
  await E(dp, (a, w) => { const s = w.nexus.site; a.player.x = s.x - 20; a.player.y = s.y; a.player.iframes = 1e9; });
  await frames(dp, 15); await dp.click('#rw-nexus-go'); await frames(dp, 6);
  const btn = await dp.evaluate(() => { const b = document.getElementById('rw-nx-notebook-btn'); const r = b.getBoundingClientRect(); return { t: b.textContent, l: b.getAttribute('aria-label'), w: r.width, h: r.height, exp: b.getAttribute('aria-expanded') }; });
  check('Nexus header has a Notebook button with its page count, label and 44 px size', btn.t === 'Notebook (2)' && /^Hero notebook: 2 pages, 2 new this visit$/.test(btn.l) && btn.w >= 44 && btn.h >= 44 && btn.exp === 'false', JSON.stringify(btn));
  await dp.click('#rw-nx-notebook-btn'); await frames(dp, 3);
  const pan = await dp.evaluate(() => {
    const el = document.getElementById('rw-nx-notebook'); const cl = document.getElementById('rw-nx-nb-close'); const r = cl.getBoundingClientRect(); const pr = el.getBoundingClientRect();
    return { open: !el.classList.contains('hidden'), role: el.getAttribute('role'), lab: el.getAttribute('aria-labelledby'), title: document.getElementById(el.getAttribute('aria-labelledby')).textContent,
      pages: Array.from(el.querySelectorAll('li[data-page]')).map((li) => li.dataset.page), text: el.textContent, focus: document.activeElement === cl, cw: r.width, ch: r.height,
      inView: pr.left >= 0 && pr.right <= innerWidth + 1, exp: document.getElementById('rw-nx-notebook-btn').getAttribute('aria-expanded') };
  });
  check('the panel opens as a labelled region listing exactly the 2 pages (creature + boss), focus on Close (44 px)', pan.open && pan.role === 'region' && pan.title === 'Hero notebook' && pan.pages.length === 2 && pan.pages.indexOf(id1) >= 0 && pan.pages.some((p) => /^boss:/.test(p)) && pan.focus && pan.cw >= 44 && pan.ch >= 44 && pan.exp === 'true', JSON.stringify(pan));
  check('the panel says pages never change stats and shows empty-state help for dungeons / tames', /never change your stats/.test(pan.text) && /Beat a dungeon boss/.test(pan.text) && /Tame a creature on the Isles/.test(pan.text));
  await dp.screenshot({ path: SHOTS + '/cyc2-notebook-desktop.jpg', quality: 70 });
  await dp.keyboard.press('Escape'); await frames(dp, 2);
  const esc1 = await dp.evaluate(() => ({ nb: document.getElementById('rw-nx-notebook').classList.contains('hidden'), nx: !document.getElementById('rw-nexus').classList.contains('hidden'), focus: document.activeElement && document.activeElement.id }));
  check('Esc closes the notebook first (the Nexus stays open, focus back on the button)', esc1.nb && esc1.nx && esc1.focus === 'rw-nx-notebook-btn', JSON.stringify(esc1));
  await dp.keyboard.press('Escape'); await frames(dp, 2);
  check('the next Esc closes the Nexus', await dp.evaluate(() => document.getElementById('rw-nexus').classList.contains('hidden')));
  check('desktop: no page errors, 0 DB requests', !D.errors.length && D.db.attempts() === 0, JSON.stringify(D.errors.slice(0, 3)));
  errs.push(...D.errors); await D.ctx.close();

  // ---- phone: seeded pages, panel fits, touch targets ----
  const seeded = JSON.stringify({ v: 1, e: { 'kill:aimed:sand_crab@0': 1, 'kill:spiral:wisp_mote@1': 2, 'boss:kraken@3': 3, 'clear:crypt': 4, 'tame:reef_ray': 5 } });
  const P = await open(browser, true, '', seeded); const pp = P.page;
  await E(pp, (a, w) => { const s = w.nexus.site; a.player.x = s.x - 20; a.player.y = s.y; });
  await frames(pp, 15); await pp.tap('#rw-nexus-go'); await frames(pp, 6);
  await pp.tap('#rw-nx-notebook-btn'); await frames(pp, 4);
  const ph = await pp.evaluate(() => {
    const el = document.getElementById('rw-nx-notebook'); const r = el.getBoundingClientRect();
    const btns = Array.from(el.querySelectorAll('button')).concat([document.getElementById('rw-nx-notebook-btn')]).map((b) => b.getBoundingClientRect()).map((q) => [q.width, q.height]);
    const fs = Array.from(el.querySelectorAll('li')).map((li) => parseFloat(getComputedStyle(li).fontSize));
    return { open: !el.classList.contains('hidden'), n: el.querySelectorAll('li[data-page]').length, left: r.left, right: r.right, iw: innerWidth, sw: document.documentElement.scrollWidth, btns, minFs: Math.min.apply(null, fs) };
  });
  check('phone 390x844: the panel lists all 5 seeded pages inside the screen width (no sideways scroll)', ph.open && ph.n === 5 && ph.left >= 0 && ph.right <= ph.iw + 1 && ph.sw <= ph.iw + 1, JSON.stringify(ph));
  check('phone: every notebook button is at least 44x44 and page text >= 13 px', ph.btns.every((b) => b[0] >= 44 && b[1] >= 44) && ph.minFs >= 13, JSON.stringify(ph));
  await pp.evaluate(() => document.getElementById('rw-nx-notebook').scrollIntoView({ block: 'start' }));
  await pp.screenshot({ path: SHOTS + '/cyc2-notebook-phone.jpg', quality: 70 });
  await pp.tap('#rw-nx-nb-close'); await frames(pp, 2);
  check('phone: Close hides the panel', await pp.evaluate(() => document.getElementById('rw-nx-notebook').classList.contains('hidden')));
  check('phone: no page errors, 0 DB requests', !P.errors.length && P.db.attempts() === 0, JSON.stringify(P.errors.slice(0, 3)));
  errs.push(...P.errors); await P.ctx.close();

  // ---- ?notebook=0: no button, no writes ----
  const O = await open(browser, false, '&notebook=0'); const op = O.page;
  await killOne(op);
  const off = await op.evaluate(() => ({ key: localStorage.getItem('pixeltown-notebook-v1') }));
  await E(op, (a, w) => { const s = w.nexus.site; a.player.x = s.x - 20; a.player.y = s.y; }); await frames(op, 15); await op.click('#rw-nexus-go'); await frames(op, 4);
  check('?notebook=0: a kill writes no page and the Nexus has no Notebook button', off.key === null && (await op.evaluate(() => !document.getElementById('rw-nx-notebook-btn'))));
  errs.push(...O.errors); await O.ctx.close();

  // ---- elite fix: the giant_spider_queen rolls src 'elite' (it read e.type = 'aimed' before) ----
  const L = await open(browser, false, '&seed=100000'); const lp = L.page; // seed 100000: one elite group (zone 3)
  const el = await E(lp, (a, w) => {
    const g = (w.world.spawnGroups || []).find((q) => q.elite && q.creature === 'giant_spider_queen'); if (!g) return null;
    a.player.x = (g.x + 0.5) * w.TILE; a.player.y = (g.y + 0.5) * w.TILE; w.setDropAll(true); return { x: g.x, y: g.y };
  });
  let elite = null;
  if (el) { for (let i = 0; i < 40 && !elite; i++) { await frames(lp, 10); elite = await killOne(lp, 'giant_spider_queen'); } }
  const drop = elite ? await E(lp, (a, w) => { const d = w.lastDrops(); return d.length ? d[d.length - 1] : null; }) : null;
  check('the rare elite (giant_spider_queen) rolls its own drop source, src = elite', !!el && !!elite && !!drop && drop.src === 'elite' && drop.zone === 3, JSON.stringify({ el, elite, drop: drop && { src: drop.src, zone: drop.zone } }));
  check('elite page: notebook names the elite under the Godlands', !!elite && (await lp.evaluate(() => { const o = JSON.parse(localStorage.getItem('pixeltown-notebook-v1') || '{"e":{}}'); return Object.keys(o.e).some((k) => /^kill:aimed:giant_spider_queen@3$/.test(k)); })));
  check('elite run: no page errors, 0 DB requests', !L.errors.length && L.db.attempts() === 0, JSON.stringify(L.errors.slice(0, 3)));
  await L.ctx.close();
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
