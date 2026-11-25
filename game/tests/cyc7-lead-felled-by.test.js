// cycle 7 L (2): fireEnemyBullet records the bolt's owner (type / art id / boss name) on the pooled bolt and the fall card names it:
// a 'Felled by <enemy>' row on the death card and '· felled by <enemy>' at the end of the fall banner. Additive: a fall with no
// bolt owner (lava, a slam, a scripted hit) shows no row, and a new run forgets the last one.
// Real browser 1280x720, the world page (menu mode: the death card) and the classic arena (enemies fire on their own).
// Offline: blockDb + every WebSocket closed, town stubbed. Never chats, never writes to Firebase.
// Run: BASE=http://localhost:9701/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc7-lead-felled-by.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&seed=4242&qdate=2030-05-01';
const SHOT = process.env.SHOT_DIR || '';
const VIEWS = (process.env.FELLED_VIEWS || '1280x720').split(',').map((s) => s.split('x').map(Number));

// Fall to one bolt fired by `owner` (an enemy spawned beside the hero). Returns what the card and the banner say.
const fallTo = (page, spec) => page.evaluate(async (o) => {
  const a = window.__mm.arena; const p = a.player;
  const frames = (n) => new Promise((res) => { let i = 0; const f = () => (++i >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); });
  a.hurtGuard = null; a.shield.hits = 0; a.buffTaken = 0;
  const e = a.spawnEnemy(o.type, p.x + 400, p.y); e.cd = 1e9; e.cd2 = 1e9; e.provT = 0;
  if (o.art) e.art = o.art; if (o.boss) e.bossName = o.boss;
  let b = null;
  if (o.viaCur) { a._curE = e; b = a.fireEnemyBullet(p.x - 24, p.y, 0, 240, 0); a._curE = null; } else b = a.fireEnemyBullet(p.x - 24, p.y, 0, 240, 0, e);
  const rec = b ? { ok: b.ok, oa: b.oa, on: b.on } : null;
  p.hp = 1; p.iframes = 0;
  for (let i = 0; i < 240 && a.state !== 'dead'; i++) { p.iframes = 0; await frames(1); }
  const banner = (document.getElementById('realm-banner') || {}).textContent || '';
  for (let i = 0; i < 400 && !a._deathShown; i++) await frames(1);
  const card = document.getElementById('realm-death'); const row = card && card.querySelector('.rm-felled-row');
  const r = row && row.getBoundingClientRect(); const cr = card && card.querySelector('.rm-card').getBoundingClientRect();
  return { rec, state: a.state, felledBy: a._felledBy, banner, shown: !!a._deathShown, row: row ? row.textContent : null, value: row ? row.querySelector('b').textContent : null,
    first: !!row && row === card.querySelector('.rm-recap').firstElementChild,
    fits: !!r && !!cr && r.width > 0 && r.left >= cr.left - 0.5 && r.right <= cr.right + 0.5 && cr.left >= 0 && cr.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5 };
}, spec);

(async () => {
  const browser = await chromium.launch();
  for (const [w, h] of VIEWS) {
    const tag = `${w}x${h}`; const phone = w < 700;
    const ctx = await browser.newContext(phone ? { viewport: { width: w, height: h }, hasTouch: true, isMobile: true } : { viewport: { width: w, height: h } });
    const db = await blockDb(ctx); await ctx.routeWebSocket(/.*/, (ws) => ws.close());
    await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html>town' }));
    const page = await ctx.newPage(); const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem('mm-aim-assist', '0'); });
    await page.goto(WORLD);
    const ready = () => page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 30000 });
    await ready();

    // 1. a base enemy, owner passed through this._curE (the path every enemy pattern uses)
    const s = await fallTo(page, { type: 'aimed', viaCur: true });
    check(`${tag} 1. the bolt carries its owner's type (owner read from the enemy being updated)`, !!s.rec && s.rec.ok === 'aimed' && !s.rec.oa && !s.rec.on, JSON.stringify(s.rec));
    check(`${tag} 2. the hero fell to it and the arena names the enemy`, s.state === 'dead' && s.felledBy === 'Sniper', JSON.stringify({ state: s.state, felledBy: s.felledBy }));
    check(`${tag} 3. the fall banner ends with 'felled by Sniper'`, /You fell/.test(s.banner) && /·\s+felled by Sniper$/.test(s.banner), s.banner);
    check(`${tag} 4. the fall card shows a 'Felled by' row first, with the enemy name`, s.shown && s.first && s.value === 'Sniper' && /Felled by/.test(s.row || ''), JSON.stringify({ shown: s.shown, row: s.row, first: s.first }));
    check(`${tag} 5. the row fits inside the card and the screen`, s.fits, JSON.stringify(s));
    if (SHOT) await page.screenshot({ path: `${SHOT}/cyc7-lead-felled-${w}.jpg`, type: 'jpeg', quality: 70 });

    // 2. Try again: the new run forgets it; a fall with no bolt owner (a scripted hit, like lava or a slam) shows no row
    const again = await page.evaluate(async () => {
      const a = window.__mm.arena; const frames = (n) => new Promise((res) => { let i = 0; const f = () => (++i >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); });
      document.querySelector('#realm-death button[data-d="again"]').click(); await frames(10);
      const fresh = { state: a.state, felledBy: a._felledBy };
      a.hurtGuard = null; a.shield.hits = 0; a.player.iframes = 0; a._hitPlayer(99999);
      for (let i = 0; i < 400 && !a._deathShown; i++) await frames(1);
      return { fresh, state: a.state, felledBy: a._felledBy, row: !!document.querySelector('#realm-death .rm-felled-row'), banner: (document.getElementById('realm-banner') || {}).textContent || '', shown: !!a._deathShown };
    });
    check(`${tag} 6. Try again starts a run with no remembered owner`, again.fresh.state === 'play' && again.fresh.felledBy === '', JSON.stringify(again.fresh));
    check(`${tag} 7. a fall with no bolt owner shows no 'Felled by' row and no banner suffix`, again.state === 'dead' && again.shown && !again.row && again.felledBy === '' && !/felled by/.test(again.banner), JSON.stringify(again));

    // 3. a world creature (art id) and a named boss, owner passed as the 6th argument (the Trial layers' path)
    await page.evaluate(() => document.querySelector('#realm-death button[data-d="again"]').click()); await ready();
    const c = await fallTo(page, { type: 'ring', art: 'frost_wolf' });
    check(`${tag} 8. a creature's art id becomes a readable name ('frost_wolf' -> 'Frost Wolf')`, !!c.rec && c.rec.ok === 'ring' && c.rec.oa === 'frost_wolf' && c.felledBy === 'Frost Wolf' && c.value === 'Frost Wolf', JSON.stringify(c));
    await page.evaluate(() => document.querySelector('#realm-death button[data-d="again"]').click()); await ready();
    const bz = await fallTo(page, { type: 'boss', art: 'ember_tyrant', boss: 'Old <b>Cinder</b>' });
    check(`${tag} 9. a named boss shows its own name, as text (never markup)`, bz.felledBy === 'Old <b>Cinder</b>' && bz.value === 'Old <b>Cinder</b>', JSON.stringify(bz));

    // 4. a pooled bolt never keeps the last owner: reused with no owner, its fields are cleared
    await page.evaluate(() => document.querySelector('#realm-death button[data-d="again"]').click()); await ready();
    const pool = await page.evaluate(() => {
      const a = window.__mm.arena; const p = a.player; a.eBullets.forEach((b) => { b.active = false; });
      const e = a.spawnEnemy('spiral', p.x + 500, p.y); e.cd = 1e9;
      const b1 = a.fireEnemyBullet(p.x + 900, p.y, 0, 10, 0, e); const first = { ok: b1.ok }; b1.active = false;
      const b2 = a.fireEnemyBullet(p.x + 900, p.y, 0, 10, 0); const same = b1 === b2; const out = { first, same, ok: b2.ok, oa: b2.oa, on: b2.on, name: a._boltOwnerName(b2) }; b2.active = false; e.active = false;
      return out;
    });
    check(`${tag} 10. a reused pool bolt with no owner carries none`, pool.first.ok === 'spiral' && pool.same && pool.ok === null && pool.oa === null && pool.on === null && pool.name === '', JSON.stringify(pool));

    check(`${tag} no page errors`, errors.length === 0, errors.join(' | '));
    check(`${tag} offline: no database traffic`, db.attempts() === 0, String(db.attempts()));
    await ctx.close();
  }

  // 5. the classic arena: enemies that fire on their own stamp their bolts (no test hand on fireEnemyBullet)
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const db = await blockDb(ctx); await ctx.routeWebSocket(/.*/, (ws) => ws.close());
    await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html>town' }));
    const page = await ctx.newPage(); const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    await page.goto(ORIGIN + '/game/games/mad-maze/index.html?mode=dungeon&seed=5&test=1&offline=1');
    await page.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 30000 });
    const nat = await page.evaluate(async () => {
      const a = window.__mm.arena; const p = a.player; const frames = (n) => new Promise((res) => { let i = 0; const f = () => (++i >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); });
      a._hitPlayer = () => {}; // the hero only watches
      const e = a.spawnEnemy('ring', p.x + 90, p.y); e.cd = 0.05; e.provT = 99;
      let got = null;
      for (let i = 0; i < 600 && !got; i++) { await frames(1); const b = a.eBullets.find((x) => x.active && x.ok); if (b) got = { ok: b.ok, name: a._boltOwnerName(b) }; }
      return { got, live: a.eBullets.filter((x) => x.active).length, type: e.type, active: e.active };
    });
    check('classic. a bolt fired by the enemy update loop carries that enemy as owner', !!nat.got && typeof nat.got.ok === 'string' && nat.got.name.length > 0, JSON.stringify(nat));
    check('classic. no page errors', errors.length === 0, errors.join(' | '));
    check('classic. offline: no database traffic', db.attempts() === 0, String(db.attempts()));
    await ctx.close();
  }
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
