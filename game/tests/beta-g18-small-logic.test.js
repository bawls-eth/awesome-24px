// G-18 small logic list (TRIAGE section 4), one block per sub-item:
//  b11-05 Stalk: a first-ever practice week that ends in a loss is never stored as the "Practice best".
//  b11-11 Stalk: a week rollover replaces the last action message (it no longer lingers into the new week).
//  b10-09 Jam: startSong() refuses a locked tier (the Hard lock is enforced in the code, not only by the disabled button).
//  b04-09 Realm Nexus: the Blacksmith's line names the stall's Forge button (and focuses it) instead of contradicting the panel.
//  b10-05 Jam: the play HUD is hidden on the song list / results.  b04-11 Realm World: M toggles the big map.
//  b01-08 Realm: a window blur clears the sticks.  b09-07 Dash: a short run on another course keeps the best ghost.  b11-07 / b15-12 Deepdelve: craft rows read like item names.
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
  const hud = await page.evaluate(() => {
    const J = window.__jam; const vis = () => getComputedStyle(document.getElementById('hud')).visibility;
    const menu = vis(); J.start(window.MMJamSongs.SONGS[0].id, 'easy'); const play = vis();
    return { menu, play, mode: J.mode };
  });
  check('b10-05: the Jam play HUD is hidden on the song list and shown during a song', hud.menu === 'hidden' && hud.play === 'visible' && hud.mode === 'play', JSON.stringify(hud));
  // round 3 (b09/b10): a fresh save cannot start Lantern Shuffle at all (locked song, so Hard is refused too); Warm Embers Easy still starts
  const ls = await page.evaluate(() => {
    const J = window.__jam; const SG = window.MMJamSongs; const st = (id, t) => !!(J.start ? J.start(id, t) : J.startSong(id, t));
    const songLocked = !SG.songUnlocked(J.save || {}, 'lantern-shuffle');
    const c0 = J.chart; const hard = st('lantern-shuffle', 'hard'), sameHard = J.chart === c0; // a refused start leaves the running chart alone
    const normal = st('lantern-shuffle', 'normal'), sameNormal = J.chart === c0;
    const warm = st('warm-embers', 'easy'), mWarm = J.mode, newWarm = J.chart !== c0;
    return { songLocked, hard, sameHard, normal, sameNormal, warm, mWarm, newWarm };
  });
  check('round 3: Lantern Shuffle Hard on a fresh save is refused (song still locked)', ls.songLocked && !ls.hard && ls.sameHard, JSON.stringify(ls));
  check('round 3: Lantern Shuffle on any tier is refused while the song is locked', !ls.normal && ls.sameNormal, JSON.stringify(ls));
  check('round 3: Warm Embers (always open) still starts', ls.warm && ls.mWarm === 'play' && ls.newWarm, JSON.stringify(ls));
  // b04-09: the Blacksmith's words match the panel: it names the stall's "Open the Forge" button and focuses it
  await ctx.routeWebSocket(/.*/, (ws) => ws.close());
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html>town' }));
  await page.goto(ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&offline=1&seed=12345&qdate=2030-05-01');
  await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 30000 });
  const bs = await page.evaluate(() => { const a = window.__mm.arena, w = window.__mm.world; a.player.iframes = 1e9; a._hitPlayer = () => {}; const s = w.nexus.site; a.player.x = s.x - 20; a.player.y = s.y; w.nexus.open(); const l = w.nexus.talk('blacksmith'); return { text: l && l.text, open: w.nexus.stall.isOpen(), focus: document.activeElement && document.activeElement.id }; });
  check('b04-09: the Blacksmith says to tap "Open the Forge" and that button has focus (no contradiction with the stall)', bs.open && /Open the Forge/.test(bs.text) && !/live in your backpack/.test(bs.text) && bs.focus === 'rw-nx-forge', JSON.stringify(bs));
  const mk = await page.evaluate(() => { const w = window.__mm.world; w.nexus.close ? w.nexus.close() : null; return true; });
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  const m0 = await page.evaluate(() => document.getElementById('rw-minimap').classList.contains('big'));
  await page.evaluate(() => { document.activeElement && document.activeElement.blur && document.activeElement.blur(); });
  await page.keyboard.press('m');
  const m1 = await page.evaluate(() => document.getElementById('rw-minimap').classList.contains('big'));
  check('b04-11: M toggles the big map in the overworld', mk && !m0 && m1, JSON.stringify({ m0, m1 }));
  const bl = await page.evaluate(() => { const a = window.__mm.arena; a.setMoveStick(-0.87, 0); a.aimVec.on = true; a.aimVec.x = 1; window.dispatchEvent(new Event('blur')); return { mx: a.moveVec.x, my: a.moveVec.y, aim: a.aimVec.on }; });
  check('b01-08: a window blur clears the move and aim sticks (a lost pointerup never leaves the hero running / firing)', bl.mx === 0 && bl.my === 0 && bl.aim === false, JSON.stringify(bl));
  // b11-07 / b15-12: Deepdelve craft rows read like item names
  await page.goto(ORIGIN + '/game/games/deepdelve/index.html?test=1&seed=7');
  await page.waitForFunction(() => window.__dd && window.__dd.ready, null, { timeout: 30000 });
  await page.evaluate(() => document.getElementById('open-craft').click());
  const rows = await page.evaluate(() => [...document.querySelectorAll('#craft-panel strong')].map((n) => n.textContent));
  check('b11-07: Deepdelve craft rows read "Plank" / "Torch x4", never "plank > plank"', rows.length >= 3 && rows.every((t) => !/ > /.test(t) && /^(\[locked\] )?[A-Z]/.test(t)) && rows.some((t) => /^Torch x\d/.test(t)), JSON.stringify(rows.slice(0, 8)));
  // b09-07: Dash keeps the ghost of your best run; a short crash on another course does not wipe it
  await page.goto(ORIGIN + '/game/games/dash/index.html?test=1');
  await page.waitForFunction(() => window.__dash, null, { timeout: 30000 });
  const gh = await page.evaluate(() => {
    const d = window.__dash; d.start('night1'); d.step(20000, { lead: 26 }); const a = { ...d.save.ghost, in: 0 };
    d.start('crashB'); d.step(20000); const b = { ...d.save.ghost, in: 0 };
    d.start('night1'); const race = !!d.ghost; return { a, b, race, longB: 0 };
  });
  check('b09-07: a long run stores its ghost', gh.a.seed === 'night1' && gh.a.dist > 0, JSON.stringify(gh));
  check('b09-07: a shorter run on another course keeps the best ghost (seed and distance unchanged)', gh.b.seed === 'night1' && gh.b.dist === gh.a.dist, JSON.stringify(gh));
  check('b09-07: Play on the best course still races its ghost', gh.race === true, JSON.stringify(gh));
  check('no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close(); await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
