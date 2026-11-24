// ID-06 assist (cycle 4 S), browser part on the Realm world page (blockDb, db.attempts() === 0).
// Checks concrete state: at the default (no mm-assist key) a hit of 8 takes 8, the run is not tagged and no tag field lands in the save;
// at dmg 50 a hit of 8 takes 4 and a hit of 1 takes 1, the run is tagged, a new best wave is recorded WITH bestWaveA = 1 and the death
// card shows "Assisted"; aim help 3 widens the touch cone to 32 degrees; an unassisted run that ties the best clears the tag; a duel never scales.
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&offline=1&heropick=0&tutorial=0&seed=12345&qdate=2030-05-01';
const SAVE = { realm: { level: 4, xp: 0, shards: 50, bestWave: 2, items: [{ n: 1, id: 'sparkwand', r: 0 }], nextUid: 2, eq: { weapon: 1 } } };

async function open(browser, assist) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const db = await blockDb(ctx);
  await ctx.route('**/game/index.html*', (rt) => rt.fulfill({ contentType: 'text/html', body: '<!doctype html>town' }));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate((a) => { localStorage.clear(); localStorage.setItem('pixeltown-save-v1', a[0]); if (a[1]) localStorage.setItem('mm-assist', a[1]); }, [JSON.stringify(SAVE), assist || '']);
  await page.goto(WORLD);
  await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 30000 });
  await page.evaluate(() => { const r = window.__mm.arena; window.requestAnimationFrame = () => 0; cancelAnimationFrame(r._raf); r._raf = 0; });
  return { ctx, page, errors, db };
}
// one scripted hit of `d` with full HP, no shield, no coach guard, no iframes; returns HP lost
const hit = (page, d) => page.evaluate((d) => {
  const r = window.__mm.arena; const p = r.player; p.hp = r.stats.maxHp; p.iframes = 0; r.shield.hits = 0; r.hurtGuard = null; r.buffTaken = 0; p._stm = null;
  const h0 = p.hp; r._hitPlayer(d); return h0 - p.hp;
}, d);

(async () => {
  const browser = await chromium.launch();
  // 1) default: no key at all
  const a = await open(browser, null);
  check('default: MMAssist loaded, pref = {dmg 100, aim 0}, cone 14', (await a.page.evaluate(() => JSON.stringify(window.__mm.arena.assistInfo()))) === JSON.stringify({ dmg: 100, aim: 0, cone: 14, runAssisted: false, bestWaveA: false, bossBestTA: false }));
  check('default: a hit of 8 takes exactly 8 (unchanged)', (await hit(a.page, 8)) === 8);
  const dflt = await a.page.evaluate(() => { const r = window.__mm.arena; r._setBestWave(5); return { tagged: r.run.assisted, best: r.save.bestWave, has: 'bestWaveA' in r.save }; });
  check('default: run untagged, new best 5 recorded with no tag field in the save', dflt.tagged === false && dflt.best === 5 && dflt.has === false, JSON.stringify(dflt));
  check('0 DB requests (default)', a.db.attempts() === 0);
  check('no page errors (default)', a.errors.length === 0, a.errors.join(' | '));
  await a.ctx.close();

  // 2) damage taken 50 percent, aim help Strong
  const b = await open(browser, '{"dmg":50,"aim":3}');
  check('assist 50: run tagged from the start, cone 32 degrees', (await b.page.evaluate(() => { const i = window.__mm.arena.assistInfo(); return i.runAssisted && i.cone === 32 && i.dmg === 50; })));
  check('assist 50: a hit of 8 takes 4', (await hit(b.page, 8)) === 4);
  check('assist 50: a hit of 1 takes 1 (never 0)', (await hit(b.page, 1)) === 1);
  const best = await b.page.evaluate(() => { const r = window.__mm.arena; r.run.wave = 6; r._die(); const raw = JSON.parse(localStorage.getItem('pixeltown-save-v1') || '{}'); return { best: r.save.bestWave, tag: r.save.bestWaveA, banner: String(r.bannerText || ''), stored: raw.realm ? raw.realm.bestWaveA : 'none', storedBest: raw.realm ? raw.realm.bestWave : -1 }; });
  check('assisted fall: the best wave (5) is still recorded, tagged bestWaveA = 1, and persisted in the save', best.best === 5 && best.tag === 1 && best.stored === 1 && best.storedBest === 5, JSON.stringify(best));
  const card = await b.page.evaluate(() => { const r = window.__mm.arena; r._menuMode = true; r._showDeath(); const d = document.getElementById('realm-death'); return d ? d.textContent : ''; });
  check('death card shows the "Assisted" tag (never "easy")', /Assisted/.test(card) && !/easy/i.test(card), card.slice(0, 200));
  // an unassisted run that ties the best clears the tag; the cleaner keeps the tag on reload
  const tie = await b.page.evaluate(() => { const r = window.__mm.arena; r.run.assisted = false; r._setBestWave(5); return 'bestWaveA' in r.save; });
  check('an unassisted run that ties the best clears the tag', tie === false);
  const mg = await b.page.evaluate(() => {
    const m = (x, y) => { const o = rmMergeSave(x, y); return [o.bestWave, o.bestWaveA || 0, o.bossBestT, o.bossBestTA || 0].join(); };
    return [m({ bestWave: 7, bestWaveA: 1 }, { bestWave: 5 }), m({ bestWave: 5, bestWaveA: 1 }, { bestWave: 7 }), m({ bestWave: 7, bestWaveA: 1 }, { bestWave: 7 }), m({ bestWave: 7, bestWaveA: 1, bossBestT: 90, bossBestTA: 1 }, { bestWave: 7, bestWaveA: 1, bossBestT: 120 }),
      String(rmCleanSave({ bestWave: 0, bestWaveA: 1 }).bestWaveA), String(rmCleanSave({ bestWave: 3, bestWaveA: 'x' }).bestWaveA)].join(' | ');
  });
  check('two-tab merge: the tag follows its best; a tie goes to the unassisted side; the cleaner drops a stray tag', mg === '7,1,0,0 | 7,0,0,0 | 7,0,0,0 | 7,1,90,1 | undefined | undefined', mg);
  check('0 DB requests (assist)', b.db.attempts() === 0);
  check('no page errors (assist)', b.errors.length === 0, b.errors.join(' | '));
  await b.ctx.close();

  // 3) a duel never scales damage
  const c = await open(browser, '{"dmg":50,"aim":0}');
  const duel = await c.page.evaluate(() => { const r = window.__mm.arena; const t0 = r.team; r.team = { isPvp: true, partner: null, duelLabel: () => '' }; r._syncHud = () => {}; const p = r.player; p.hp = r.stats.maxHp; p.iframes = 0; r.shield.hits = 0; r.hurtGuard = null; const h0 = p.hp; r._hitPlayer(8); const lost = h0 - p.hp; r.team = t0; return lost; });
  check('in a duel the assist does not apply (8 takes 8)', duel === 8, String(duel));
  check('0 DB requests (duel)', c.db.attempts() === 0);
  await c.ctx.close();
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
