// R4 O-01 (b07-06, owner decision): arcade doors carry original neutral names only (City Drive, Night Racer, Neon Coast,
// Kart Rally). A linked door opens a NEW tab (noopener) after a "leaves the game" confirm and never navigates this tab;
// an unlinked door shows the "Coming soon" card (dialog, Esc closes it, focus returns). No trademark left in game/ code,
// docs fixtures or the player-visible CHANGELOG. OFFLINE only: blockDb + the Firebase SDK stubbed, 0 DB requests.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-r4-doors.test.js
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { check, done, offlineStub, exposeGame, joinOffline } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const TM = /\bGTA\b|GTA ?3|\bNFS\b|Need for Speed|Vice City|Underground 2|Grand Theft|quenq\.com|nfsu2/i;

function walk(dir, out) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) { if (!/node_modules|\.git/.test(f)) walk(p, out); } else if (/\.(js|html|css|json)$/.test(f) || /README|CHANGELOG/.test(f)) out.push(p);
  }
  return out;
}

(async () => {
  // (1) static: no trademark in any game code / page / test / json fixture, nor in README / CHANGELOG (player-visible).
  // Tester reports under design/beta keep their original wording (they are the record of the bug) and are skipped,
  // as is this file (it holds the pattern).
  const root = path.resolve(__dirname, '..');
  const files = walk(root, []).filter((f) => !/design[\\/]beta[\\/]/.test(f) && !/tests[\\/]beta[\\/]results/.test(f) && path.basename(f) !== 'beta-r4-doors.test.js');
  const hits = files.filter((f) => TM.test(fs.readFileSync(f, 'utf8'))).map((f) => path.relative(root, f));
  check('no trademarked arcade names or their sites anywhere in game/ (code, pages, tests, json, README, CHANGELOG)', hits.length === 0, JSON.stringify(hits));

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const db = await offlineStub(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await exposeGame(page);
  await page.goto(BASE);
  await joinOffline(page, 'ADMINr4door');
  await page.waitForTimeout(600);
  const doors = await page.evaluate(() => {
    const s = window.__g.scene.getScene('Town');
    return s.children.list.filter((c) => c.type === 'Text' && /^🚪/.test(c.text || '')).map((c) => ({ t: c.text, x: c.x, y: c.y + 56 }));
  });
  const names = doors.map((d) => d.t.replace('🚪', '').trim()).sort();
  check('four arcade doors named City Drive / Kart Rally / Neon Coast / Night Racer', JSON.stringify(names) === JSON.stringify(['City Drive', 'Kart Rally', 'Neon Coast', 'Night Racer']), JSON.stringify(names));

  // (2) an unlinked door: the Coming soon dialog, no navigation, Esc closes, Town can act again
  const url0 = page.url();
  const cd = doors.find((d) => /City Drive/.test(d.t));
  const soon = await page.evaluate((d) => {
    const s = window.__g.scene.getScene('Town');
    s.localBody.setPosition(d.x, d.y + 4); s.useDoor();
    const ov = document.getElementById('door-soon-overlay');
    return { open: !!ov && !ov.classList.contains('hidden'), role: ov && ov.getAttribute('role'), modal: ov && ov.getAttribute('aria-modal'), title: (document.getElementById('door-soon-title') || {}).textContent, focus: document.activeElement && document.activeElement.id, canAct: s.canAct() };
  }, cd || { x: 0, y: 0 });
  check('City Drive door shows the Coming soon dialog (role=dialog, aria-modal, focus on its close button) and blocks Town actions', soon.open && soon.role === 'dialog' && soon.modal === 'true' && /City Drive/.test(soon.title || '') && soon.focus === 'door-soon-close-btn' && soon.canAct === false, JSON.stringify(soon));
  const btn = await page.evaluate(() => { const r = document.getElementById('door-soon-close-btn').getBoundingClientRect(); const o = document.getElementById('door-soon-ok-btn').getBoundingClientRect(); return { w: r.width, h: r.height, oh: o.height }; });
  check('Coming soon buttons are >= 44 px', btn.w >= 44 && btn.h >= 44 && btn.oh >= 44, JSON.stringify(btn));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  const closed = await page.evaluate(() => ({ hidden: document.getElementById('door-soon-overlay').classList.contains('hidden'), canAct: window.__g.scene.getScene('Town').canAct() }));
  check('Esc closes the Coming soon card and the Town can act again; the page did not navigate', closed.hidden && closed.canAct && page.url() === url0, JSON.stringify([closed, page.url()]));

  // (3) the linked door (Kart Rally): confirm text says it leaves the game, then window.open(_blank, noopener); this tab stays
  const kr = doors.find((d) => /Kart Rally/.test(d.t));
  const msgs = [];
  page.on('dialog', async (dlg) => { msgs.push(dlg.message()); await dlg.accept(); });
  await page.evaluate(() => { window.__opened = []; window.open = (u, t, f) => { window.__opened.push({ u, t, f }); return null; }; });
  await page.evaluate((d) => { const s = window.__g.scene.getScene('Town'); s.localBody.setPosition(d.x, d.y + 4); s.useDoor(); }, kr || { x: 0, y: 0 });
  await page.waitForTimeout(300);
  const op = await page.evaluate(() => window.__opened);
  check('Kart Rally confirm says it opens a new tab and leaves the game', msgs.length === 1 && /new tab/i.test(msgs[0]) && /leaves the game/i.test(msgs[0]), JSON.stringify(msgs));
  check('Kart Rally opens with target _blank + noopener; this tab stays on the Town', op.length === 1 && op[0].t === '_blank' && /noopener/.test(op[0].f || '') && page.url() === url0, JSON.stringify([op, page.url()]));

  check('offline: 0 database requests', db.attempts() === 0, JSON.stringify(db.http));
  check('no page errors', errors.length === 0, errors.join('|'));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
