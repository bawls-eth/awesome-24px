// G-18 small logic list (TRIAGE section 4), one block per sub-item:
//  b11-05 Stalk: a first-ever practice week that ends in a loss is never stored as the "Practice best".
//  b11-11 Stalk: a week rollover replaces the last action message (it no longer lingers into the new week).
//  b10-09 Jam: startSong() refuses a locked tier (the Hard lock is enforced in the code, not only by the disabled button).
//  b04-09 Realm Nexus: the Blacksmith's line names the stall's Forge button (and focuses it) instead of contradicting the panel.
// Local pages only (blockDb), no chat, no Firebase writes.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-g18-small-logic.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 900, height: 800 } });
  await blockDb(ctx);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  // b11-05 + b11-11: Stalk
  await page.goto(ORIGIN + '/game/games/stalk/index.html?test=1&week=300&slot=0');
  await page.waitForFunction(() => window.__stalk);
  const pr = await page.evaluate(() => {
    const s = window.__stalk; s.practice.start(); s.practice.buy();
    for (let i = 0; i < 14 && !s.practice.state.done; i++) s.practice.next(); // hold to the end: the stalks spoil, a loss
    const st = s.practice.state; const saved = s.practice.saved;
    const card = document.getElementById('pr-card') ? document.getElementById('pr-card').textContent : '';
    return { done: st.done, profit: st.bells - 1000, hasBest: saved.hasBest, best: saved.best, card };
  });
  check('b11-05: a first practice week that ends in a loss is not stored as the practice best', pr.done && pr.profit < 0 && pr.hasBest === false && !/Practice best\s*-\d/.test(pr.card), JSON.stringify(pr));
  const msg = await page.evaluate(() => {
    const s = window.__stalk; s.buy(1); const m0 = document.getElementById('msg').textContent;
    s.setTime(300, 3); s.sell(1); const m1 = document.getElementById('msg').textContent;
    s.setTime(301, 0); const m2 = document.getElementById('msg').textContent;
    return { m0, m1, m2 };
  });
  check('b11-11: after a week rollover the old "Sold ..." message is replaced by a new-week line', /[Ss]old/.test(msg.m1) && msg.m2 !== msg.m1 && /fresh week/i.test(msg.m2), JSON.stringify(msg));

  // b10-09: Jam startSong refuses a locked tier
  await page.goto(ORIGIN + '/game/games/jam/index.html?test=1');
  await page.waitForFunction(() => window.__jam);
  const jam = await page.evaluate(() => {
    const J = window.__jam; const SG = window.MMJamSongs; const id = SG.SONGS ? SG.SONGS[0].id : SG.list()[0].id;
    const locked = !SG.tierUnlocked(J.save || {}, id, 'hard');
    const r = J.start ? J.start(id, 'hard') : J.startSong(id, 'hard');
    return { locked, started: !!r, mode: J.mode, tier: J.tier || null };
  });
  check('b10-09: starting a locked Hard tier from code is refused (no run starts)', jam.locked && !jam.started && jam.mode !== 'play', JSON.stringify(jam));
  // b04-09: the Blacksmith's words match the panel: it names the stall's "Open the Forge" button and focuses it
  await ctx.routeWebSocket(/.*/, (ws) => ws.close());
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html>town' }));
  await page.goto(ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&offline=1&seed=12345&qdate=2030-05-01');
  await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 30000 });
  const bs = await page.evaluate(() => { const a = window.__mm.arena, w = window.__mm.world; a.player.iframes = 1e9; a._hitPlayer = () => {}; const s = w.nexus.site; a.player.x = s.x - 20; a.player.y = s.y; w.nexus.open(); const l = w.nexus.talk('blacksmith'); return { text: l && l.text, open: w.nexus.stall.isOpen(), focus: document.activeElement && document.activeElement.id }; });
  check('b04-09: the Blacksmith says to tap "Open the Forge" and that button has focus (no contradiction with the stall)', bs.open && /Open the Forge/.test(bs.text) && !/live in your backpack/.test(bs.text) && bs.focus === 'rw-nx-forge', JSON.stringify(bs));
  check('no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close(); await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
