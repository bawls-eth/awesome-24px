// Round 4 QA replay (D5) of O-01 / b07-r2-06 (arcade doors), by actual play: the hero WALKS to each door and presses E.
// Expected (owner decision): four doors named City Drive, Night Racer, Neon Coast, Kart Rally; no trademarked name on screen; a door
// without a link shows a "Coming soon" card that Esc closes; a linked door asks first ("leaves the game", "new tab"), then opens a NEW
// tab without an opener while this tab stays in the Town. Declining the question opens nothing.
// Every third-party host is answered by a local stub page (nothing leaves the machine). OFFLINE: blockDb + Firebase SDK stubbed.
// Proof run by D5: red on the round-3 tip (third-party game names on the doors, same-tab navigation), green on the D4 tree. See design/beta/fixes/r4-d5.md.
// Needs the D4 door change (000f85c): parked in tests/r4-open/ (outside the tiers) until r4-d4 is merged; D5 then moves it to
// game/tests/ and registers it (browser, full, timeoutSec 420).
// Run: BASE=http://localhost:8440/game/index.html node game/tests/r4-open/beta-r4-replay-doors.test.js
const { chromium } = require('playwright');
const HERE = require('fs').existsSync(require('path').join(__dirname, 'helpers.js')) ? '.' : '..'; // lives in tests/r4-open/ until r4-d4 is merged, then moves to tests/
const { check, done, blockDb } = require(HERE + '/helpers');
const LS = require(HERE + '/lib/load-scale');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const HOST = new URL(BASE).host;
// built from fragments so this file itself holds none of the names (beta-r4-doors scans every file under game/ for them)
const TM = new RegExp(['\\bG' + 'TA\\b', '\\bN' + 'FS\\b', 'Need for ' + 'Speed', 'Vice ' + 'City', 'Underground ' + '2', 'Grand ' + 'Theft'].join('|'), 'i');
const WANT = ['City Drive', 'Kart Rally', 'Neon Coast', 'Night Racer'];

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  const db = await blockDb(ctx);
  const outside = [];
  await ctx.route((u) => u.host !== HOST && !/firebaseio|firebasedatabase|identitytoolkit|securetoken/.test(u.host), (r) => {
    const u = r.request().url();
    if (/gstatic\.com\/firebasejs\//.test(u)) return r.fulfill({ status: 200, contentType: 'application/javascript', body: '/* firebase SDK blocked */' });
    if (r.request().isNavigationRequest()) { outside.push(u); return r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>outside</title>outside stub' }); }
    return r.continue();
  });
  await ctx.route('**/main.js*', async (route) => {
    try { const resp = await route.fetch(); const body = (await resp.text()).replace('const game = new Phaser.Game(config);', 'const game = window.__g = new Phaser.Game(config);'); await route.fulfill({ response: resp, body }); } catch (e) { /* closed */ }
  });
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE);
  await page.fill('#name-input', 'ADMINr4door');
  await page.click('button:has-text("Join Town")');
  await page.waitForSelector('#join-offline-btn:not(.hidden)', { timeout: LS.budget(20000) });
  await page.click('#join-offline-btn');
  await page.waitForFunction(() => window.__g && window.__g.scene.getScene('Town') && window.__g.scene.getScene('Town').localBody, null, { timeout: LS.budget(30000) });
  await page.waitForTimeout(1500);
  await page.mouse.click(500, 350);
  const townUrl = page.url();

  const doors = await page.evaluate(() => window.__g.scene.getScene('Town').children.list.filter((c) => c.type === 'Text' && /^🚪/.test(c.text || '')).map((c) => ({ name: c.text.replace('🚪', '').trim(), x: c.x, y: c.y + 56 })));
  const names = doors.map((d) => d.name).sort();
  check('1. the four arcade doors are City Drive, Kart Rally, Neon Coast, Night Racer', JSON.stringify(names) === JSON.stringify(WANT), JSON.stringify(names));
  const worldText = await page.evaluate(() => window.__g.scene.getScene('Town').children.list.filter((c) => c.type === 'Text').map((c) => c.text).join(' | ') + ' | ' + document.body.innerText);
  check('2. no trademarked name anywhere in the Town labels or the page text', !TM.test(worldText), (worldText.match(TM) || []).join(','));

  // walk onto a door from a few steps to its left, then E
  const dialogs = []; let answer = true;
  page.on('dialog', async (d) => { dialogs.push(d.message()); if (answer) await d.accept(); else await d.dismiss(); });
  const walkTo = async (d) => {
    await page.evaluate((q) => { window.__g.scene.getScene('Town').localBody.setPosition(q.x - 60, q.y + 6); }, d); // setup: next to the door
    await page.waitForTimeout(250);
    await page.keyboard.down('ArrowRight');
    const ok = await page.waitForFunction((q) => { const b = window.__g.scene.getScene('Town').localBody; return Math.abs(b.x - q.x) < 14; }, d, { timeout: LS.budget(6000), polling: 30 }).then(() => true).catch(() => false);
    await page.keyboard.up('ArrowRight');
    await page.waitForTimeout(150);
    return ok;
  };
  const soonOpen = () => page.evaluate(() => { const els = Array.from(document.querySelectorAll('[role=dialog], .overlay, [id*=soon]')).filter((e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden' && !e.classList.contains('hidden') && /coming soon/i.test(e.innerText)); return els.length ? els[0].innerText.replace(/\s+/g, ' ').slice(0, 200) : ''; });

  let n = 0;
  for (const d of doors) {
    n++;
    const pagesBefore = ctx.pages().length; const out0 = outside.length; const dlg0 = dialogs.length;
    const at = await walkTo(d);
    check('3.' + n + ' walked to the ' + d.name + ' door with the arrow keys', at, JSON.stringify(await page.evaluate(() => { const b = window.__g.scene.getScene('Town').localBody; return [Math.round(b.x), Math.round(b.y)]; })));
    answer = true;
    // E goes to the nearest thing first: a flower or a fossil spot beside the door takes one press before the door answers (measured on
    // the Kart Rally door). A player just presses E again, so the replay allows up to 3 presses and reports how many it took.
    const popup = ctx.waitForEvent('page', { timeout: LS.budget(9000) }).catch(() => null);
    let tries = 0; let soon = '';
    while (tries < 3 && !soon && dialogs.length === dlg0) {
      tries++; await page.keyboard.press('e');
      const t1 = Date.now();
      while (Date.now() - t1 < LS.budget(900) && !soon && dialogs.length === dlg0) { await page.waitForTimeout(100); soon = await soonOpen(); }
    }
    if (tries > 1) console.log('INFO ' + d.name + ': the door answered on E press ' + tries + ' (an item beside the door took the earlier press)');
    const p = dialogs.length > dlg0 ? await popup : null;
    await page.waitForTimeout(300);
    if (soon) {
      check('4.' + n + ' ' + d.name + ': E shows a "Coming soon" card that names the door; nothing opens, this tab stays in the Town', soon.toLowerCase().includes(d.name.toLowerCase()) && !p && page.url() === townUrl && outside.length === out0 && ctx.pages().length === pagesBefore, soon);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(250);
      check('5.' + n + ' ' + d.name + ': Esc closes the card', (await soonOpen()) === '');
      const x0 = await page.evaluate(() => window.__g.scene.getScene('Town').localBody.x);
      await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(500); await page.keyboard.up('ArrowLeft');
      check('6.' + n + ' ' + d.name + ': the hero can walk again after the card', (await page.evaluate(() => window.__g.scene.getScene('Town').localBody.x)) < x0 - 10);
    } else {
      const asked = dialogs.slice(dlg0);
      const diag = asked.length ? '' : JSON.stringify(await page.evaluate((q) => { const t = window.__g.scene.getScene('Town'); const b = t.localBody; return { hero: [Math.round(b.x), Math.round(b.y)], dist: Math.round(Math.hypot(b.x - q.x, b.y - q.y)), canAct: t.canAct ? t.canAct() : null, focus: document.activeElement && (document.activeElement.id || document.activeElement.tagName), chat: Array.from(document.querySelectorAll('#chat-log .chat-line')).slice(-2).map((l) => l.textContent.slice(0, 70)) }; }, d));
      check('4.' + n + ' ' + d.name + ' (linked door): E asks first, and the question says it leaves the game and opens a new tab', asked.length === 1 && /leaves the game/i.test(asked[0]) && /new tab/i.test(asked[0]), JSON.stringify(asked) + ' ' + diag);
      const opener = p ? await p.evaluate(() => window.opener === null).catch(() => null) : null;
      check('5.' + n + ' ' + d.name + ': after Yes a NEW tab opens (no opener) and this tab stays in the Town', !!p && opener === true && page.url() === townUrl, JSON.stringify({ popup: p ? p.url() : null, opener, here: page.url() }));
      if (p) await p.close();
      // again, answer No: nothing opens
      answer = false; const out1 = outside.length; const pages1 = ctx.pages().length;
      await page.bringToFront(); await page.mouse.click(500, 350);
      await page.evaluate((q) => { window.__g.scene.getScene('Town').localBody.setPosition(q.x, q.y + 6); }, d);
      await page.waitForTimeout(200);
      await page.keyboard.press('e');
      await page.waitForTimeout(Math.round(700 * LS.factor()));
      check('6.' + n + ' ' + d.name + ': answering No opens nothing and stays in the Town', dialogs.length === dlg0 + 2 && outside.length === out1 && ctx.pages().length === pages1 && page.url() === townUrl, JSON.stringify({ dialogs: dialogs.length - dlg0, outside: outside.slice(out1), pages: ctx.pages().length }));
    }
  }
  check('7. this tab never navigated away during the whole visit', page.url() === townUrl, page.url());
  check('no page errors', errors.length === 0, errors.join(' | '));
  check('no database traffic', db.attempts() === 0, String(db.attempts()));
  await ctx.close(); await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
