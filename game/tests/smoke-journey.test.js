// QS1 (design/NEXT-SLICES-4.md): the smoke journey bot. A bot named ADMINsmoke starts at the Town (OFFLINE), opens the
// Town HUD "Where to?" sheet and visits every MMNav place through that sheet, then comes back to the Town through the
// page's own sheet (Back to Town, or the Town entry) and goes on to the next place. Phone 390x844 (touch) and desktop
// 1280x720 run side by side.
// On each page: first frame within 5 s, 0 console errors, 0 failed requests (bar allow-listed 404s), only allow-listed
// off-origin scripts, 0 database requests and 0 sockets (Town included), MMNav mounted with the Menu button (Town: its
// "Where to?" button). Controls under 44 px, text under 12 px and controls over a joystick are recorded and compared
// with the frozen fixture tests/fixtures/smoke-journey.json: a NEW offender fails; a listed one that is gone is printed
// so the list can shrink. The list may only shrink (FROZEN_MAX below caps it).
// Safety: blockDb (HTTP route + routeWebSocket) + an empty Firebase SDK stub, so the page never opens a database socket.
// The bot never chats and never writes to Firebase; the Town is entered through "Play offline".
// Run: python3 -m http.server 8440 &   BASE=http://localhost:8440/game/index.html THREE_JS=/path/three.min.js NODE_PATH=$(npm root -g) node game/tests/smoke-journey.test.js
// Set UPDATE_FIXTURE=1 to print the current offender lists (it never writes the fixture; copy only entries that shrink).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const ORIGIN = new URL(BASE).origin;
const FIX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'smoke-journey.json'), 'utf8'));
const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js';
const NAME = 'ADMINsmoke';
const IDS = ['town', 'map', 'realm', 'lantern', 'isles', 'jam', 'bugs', 'angler', 'deepdelve', 'stalk', 'pop', 'dash', 'stack', 'echo'];
const AUDITS = ['small', 'tinyText', 'overStick'];
// The allow-lists may only shrink: these are the sizes frozen with the first fixture. Lower them when entries are removed.
const FROZEN_MAX = { allow404: 0, offOrigin: 2, small: 9, tinyText: 2, overStick: 2 };
const T0 = Date.now();

async function open(browser, viewport, touch) {
  const ctx = await browser.newContext(touch ? { viewport, hasTouch: true, isMobile: true } : { viewport });
  const db = await blockDb(ctx);
  await ctx.route(/gstatic\.com\/firebasejs\//, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: '/* firebase SDK blocked by smoke-journey.test.js */' }));
  if (process.env.THREE_JS) await ctx.route(THREE_URL, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(process.env.THREE_JS) }));
  // First frame: the time of the first animation frame after navigation starts.
  await ctx.addInitScript(() => { try { requestAnimationFrame(() => { window.__smokeFirstFrame = performance.now(); }); } catch (e) { /* ignore */ } });
  const page = await ctx.newPage();
  const rec = { sockets: [], errors: [], failed: [], off: [] };
  page.on('websocket', (ws) => rec.sockets.push(ws.url()));
  page.on('pageerror', (e) => rec.errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') rec.errors.push('console: ' + m.text()); });
  page.on('requestfailed', (r) => { if (!db.hosts.test(r.url())) rec.failed.push({ url: r.url(), status: 0, why: (r.failure() && r.failure().errorText) || '' }); });
  page.on('response', (r) => { if (r.status() >= 400) rec.failed.push({ url: r.url(), status: r.status() }); });
  page.on('request', (r) => { const u = r.url(); if (!u.startsWith(ORIGIN) && !/^(data|blob):/.test(u) && !/gstatic\.com\/firebasejs\//.test(u) && !db.hosts.test(u)) rec.off.push(u); });
  const reset = () => { rec.errors.length = 0; rec.failed.length = 0; rec.off.length = 0; };
  return { ctx, page, db, rec, reset };
}

// In-page audit: visible, reachable controls under 44 px; visible text under 12 px; controls over the on-screen stick.
function audit() {
  const W = innerWidth, H = innerHeight;
  const box = (e) => {
    if (e.closest('[hidden]')) return null;
    const r = e.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0 || r.bottom <= 0 || r.right <= 0 || r.top >= H || r.left >= W) return null;
    for (let n = e; n && n.nodeType === 1; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return null; }
    return r;
  };
  const onTop = (e, r) => { const x = Math.min(W - 1, Math.max(0, r.left + r.width / 2)), y = Math.min(H - 1, Math.max(0, r.top + r.height / 2)); const t = document.elementFromPoint(x, y); return !!t && (t === e || e.contains(t) || t.contains(e)); };
  const desc = (e) => {
    let s = e.tagName.toLowerCase();
    if (e.id) return s + '#' + e.id;
    const c = [...e.classList].filter((x) => !/^(on|off|active|selected|hidden|open|collapsed|disabled|locked|done|cur|current|mm-nav-legacy|mm-nav-avoid)$/.test(x)).slice(0, 2);
    if (c.length) s += '.' + c.join('.');
    const t = (e.getAttribute('aria-label') || e.textContent || '').trim().replace(/\d+/g, '#').replace(/\s+/g, ' ').slice(0, 18);
    if (t) s += '"' + t + '"';
    let p = e.parentElement; while (p && !p.id) p = p.parentElement;
    return (p ? '#' + p.id + ' ' : '') + s;
  };
  const CTRL = 'button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab]';
  const small = new Set(), tiny = new Set(), over = new Set();
  const sticks = [...document.querySelectorAll('[id*=joy i], [id*=stick i], [class*=joystick i]')].map((e) => ({ e, r: box(e) })).filter((x) => x.r && !x.e.parentElement.closest('[id*=joy i], [id*=stick i], [class*=joystick i]'));
  for (const e of document.querySelectorAll(CTRL)) {
    const r = box(e); if (!r || !onTop(e, r)) continue;
    if (Math.min(r.width, r.height) < 44) small.add(desc(e));
    for (const s of sticks) {
      if (s.e === e || s.e.contains(e) || e.contains(s.e)) continue;
      if (r.left < s.r.right && s.r.left < r.right && r.top < s.r.bottom && s.r.top < r.bottom) over.add(desc(e) + ' over ' + desc(s.e));
    }
  }
  for (const e of document.querySelectorAll('body *')) {
    if (/^(SCRIPT|STYLE|NOSCRIPT|CANVAS|SVG|svg|OPTION)$/.test(e.tagName)) continue;
    if (![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    const r = box(e); if (!r) continue;
    if (parseFloat(getComputedStyle(e).fontSize) < 12) tiny.add(desc(e));
  }
  return { small: [...small].sort(), tinyText: [...tiny].sort(), overStick: [...over].sort() };
}

async function joinOffline(page, tap) {
  await page.waitForSelector('#name-input', { timeout: 15000 });
  const form = await page.evaluate(() => document.getElementById('name-input').value);
  if (!form) await page.fill('#name-input', NAME);
  await page.click('button:has-text("Join Town")');
  await page.waitForSelector('#join-offline-btn:not(.hidden)', { timeout: 9000 });
  await tap('#join-offline-btn');
  await page.waitForFunction(() => document.getElementById('join-overlay').classList.contains('hidden') && window.MMNav && window.MMNav.mounted(), null, { timeout: 20000 });
  await page.waitForTimeout(600);
  return form;
}

async function journey(browser, label, viewport, touch, out) {
  const L = (s) => `[${label}] ${s}`;
  const t = await open(browser, viewport, touch);
  const { page, rec, db } = t;
  const tap = (sel) => (touch ? page.tap(sel) : page.click(sel));
  const seen = Object.fromEntries(AUDITS.map((k) => [k, {}]));
  const known = [];

  async function pageChecks(id, isTown) {
    const ff = await page.evaluate(() => window.__smokeFirstFrame === undefined ? null : window.__smokeFirstFrame);
    check(L(`${id}: first frame within 5 s (${ff === null ? 'none' : Math.round(ff) + ' ms'})`), ff !== null && ff <= 5000, String(ff));
    const nav = await page.evaluate(() => {
      const vis = (e) => { if (!e) return false; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden'; };
      return { mounted: !!(window.MMNav && window.MMNav.mounted()), menu: vis(document.getElementById('mm-nav-btn')), where: vis(document.getElementById('where-to-btn')), path: location.pathname };
    });
    check(L(`${id}: MMNav is mounted and the ${isTown ? 'Town "Where to?"' : 'shared Menu'} button shows`), nav.mounted && (isTown ? nav.where : nav.menu), JSON.stringify(nav));
    const a = await page.evaluate(audit);
    for (const k of AUDITS) seen[k][id] = a[k];
  }
  function netChecks(id) {
    const allow = FIX.allow404 || [];
    const bad = rec.failed.filter((f) => !(f.status === 404 && allow.some((s) => f.url.endsWith(s))));
    check(L(`${id}: 0 failed requests (bar allow-listed 404s)`), bad.length === 0, JSON.stringify(bad));
    const off = rec.off.filter((u) => (FIX.offOrigin || []).indexOf(u) < 0);
    check(L(`${id}: only allow-listed off-origin requests`), off.length === 0, JSON.stringify(off));
    check(L(`${id}: 0 database requests and 0 sockets so far`), db.attempts() === 0 && rec.sockets.length === 0, JSON.stringify([db.http, db.ws, rec.sockets]));
    check(L(`${id}: 0 console errors`), rec.errors.length === 0, rec.errors.join(' | '));
    t.reset();
  }
  async function openWhereTo() {
    await tap('#where-to-btn');
    await sheetOpen();
  }
  const sheetOpen = () => page.waitForFunction(() => window.MMNav && window.MMNav.isOpen() && !document.getElementById('mm-nav-sheet').hidden, null, { timeout: 15000 });

  await page.goto(BASE);
  await joinOffline(page, tap);
  check(L('town: joined offline as ' + NAME), await page.evaluate(() => document.getElementById('join-overlay').classList.contains('hidden')));
  await pageChecks('town', true);
  netChecks('town');

  for (const id of IDS) {
    await openWhereTo();
    const dests = await page.evaluate(() => [...document.querySelectorAll('#mm-nav-sheet .mm-nav-dest')].map((a) => a.dataset.place));
    check(L(`town sheet lists all 14 places before ${id}`), dests.join(',') === IDS.join(','), dests.join(','));
    const sel = `#mm-nav-sheet .mm-nav-dest[data-place="${id}"]`;
    await page.locator(sel).scrollIntoViewIfNeeded();
    await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }), tap(sel)]);
    if (id !== 'town') {
      await page.waitForFunction(() => window.MMNav && window.MMNav.mounted(), null, { timeout: 15000 }).catch(() => {});
      await page.waitForLoadState('load', { timeout: 15000 }).catch(() => known.push(`${id}: the load event took over 15 s`));
      await page.waitForTimeout(600);
    }
    if (id === 'town') {
      // The Town entry reloads the Town: the name is kept, so the join form is never empty.
      const form = await joinOffline(page, tap);
      check(L('town (via sheet): the join form keeps the name'), form === NAME, JSON.stringify(form));
      await pageChecks('town', true);
      netChecks('town (via sheet)');
      continue;
    }
    // First-visit dialogs that cover the Menu button (fixture "dismiss"): the bot closes them the way a player would.
    for (const ds of (FIX.dismiss && FIX.dismiss[id]) || []) {
      const shown = await page.evaluate((q) => { const e = document.querySelector(q); return !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden'; }, ds);
      // A dialog that leaves the Menu button visible and on top is not an issue (the Realm hero picker since PLAYTEST-REVIEW-3); the bot still closes it to audit the page.
      const menuFree = shown && await page.evaluate(() => { const b = document.getElementById('mm-nav-btn'); if (!b || getComputedStyle(b).display === 'none') return false; const r = b.getBoundingClientRect(); if (!r.width || !r.height) return false; const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!t && (t === b || b.contains(t)); });
      if (shown) { if (!menuFree) known.push(`${id}: a first-visit dialog covers the Menu button until the player closes it (${ds})`); await tap(ds); await page.waitForTimeout(400); }
    }
    await pageChecks(id, false);
    // Back to the Town through this page's own sheet: "Back to Town" when it is offered, else the Town entry.
    let backSel = '#mm-nav-sheet .mm-nav-dest[data-place="town"]', how = 'Town entry';
    const menuOk = await page.evaluate(() => { const b = document.getElementById('mm-nav-btn'); return !!b && b.getBoundingClientRect().height > 0; });
    if (menuOk) await tap('#mm-nav-btn'); else { known.push(`${id}: the Menu button was covered; the sheet was opened with MMNav.open()`); await page.evaluate(() => window.MMNav.open()); }
    await sheetOpen();
    const back = await page.evaluate(() => { const b = document.getElementById('mm-nav-back'); return b ? b.textContent : ''; });
    if (/Back to Town/.test(back)) { backSel = '#mm-nav-back'; how = '"Back to Town"'; }
    else known.push(`${id}: the sheet Back row reads "${back.replace(/^\W+/, '')}", so the bot used the Town entry`);
    netChecks(id);
    await page.locator(backSel).scrollIntoViewIfNeeded();
    await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }), tap(backSel)]);
    const form = await joinOffline(page, tap);
    check(L(`${id} -> Town via ${how}: the same name is restored (no empty join form)`), form === NAME, JSON.stringify(form));
    netChecks(`town (back from ${id})`);
  }

  const sw = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  check(L('Town: no horizontal scroll at the end'), sw.sw <= sw.iw, JSON.stringify(sw));
  check(L('the bot never typed into the chat'), await page.evaluate(() => { const c = document.getElementById('chat-input'); return !c || !c.value; }));
  out[label] = { seen, known };
  await t.ctx.close();
}

(async () => {
  for (const k of Object.keys(FROZEN_MAX)) {
    const v = FIX[k], n = Array.isArray(v) ? v.length : Object.values(v || {}).reduce((s, x) => s + Object.values(x).reduce((a, b) => a + b.length, 0), 0);
    check(`fixture ${k} has ${n} entries, at most the frozen ${FROZEN_MAX[k]} (it may only shrink)`, n <= FROZEN_MAX[k], String(n));
  }
  const browser = await chromium.launch();
  const out = {};
  await Promise.all([
    journey(browser, '390x844', { width: 390, height: 844 }, true, out).catch((e) => check('[390x844] the journey finished', false, e.message.split('\n')[0])),
    journey(browser, '1280x720', { width: 1280, height: 720 }, false, out).catch((e) => check('[1280x720] the journey finished', false, e.message.split('\n')[0])),
  ]);
  await browser.close();

  const fresh = {};
  for (const label of Object.keys(out)) {
    for (const k of AUDITS) {
      const allow = ((FIX[k] || {})[label]) || {};
      fresh[k] = fresh[k] || {}; fresh[k][label] = {};
      for (const id of IDS) {
        const cur = out[label].seen[k][id] || [], list = allow[id] || [];
        const added = cur.filter((x) => list.indexOf(x) < 0), gone = list.filter((x) => cur.indexOf(x) < 0);
        if (cur.length) fresh[k][label][id] = cur;
        check(`[${label}] ${id}: no new ${k} offenders beyond the frozen allow-list (${cur.length} recorded)`, added.length === 0, JSON.stringify(added));
        if (gone.length) console.log(`INFO [${label}] ${id}: ${gone.length} ${k} entr${gone.length > 1 ? 'ies are' : 'y is'} fixed; remove from the fixture: ${JSON.stringify(gone)}`);
      }
    }
  }
  // Honest known issues: the frozen list from the fixture plus what this run saw.
  console.log('KNOWN ISSUES (not failures):');
  (FIX.knownIssues || []).forEach((s) => console.log('  - ' + s));
  for (const label of Object.keys(out)) {
    [...new Set(out[label].known)].forEach((s) => console.log(`  - [${label}] ${s}`));
    for (const k of AUDITS) { const n = Object.values(fresh[k][label]).reduce((a, b) => a + b.length, 0); console.log(`  - [${label}] ${n} allow-listed ${k} offenders across the 14 places`); }
  }
  if (process.env.UPDATE_FIXTURE) console.log('CURRENT ' + JSON.stringify(fresh));
  // 120 s on an idle machine. On a shared, overloaded box (1-minute load above the core count) the budget scales with the
  // load, and the run says so: the number is still checked, never skipped.
  const secs = (Date.now() - T0) / 1000, load = os.loadavg()[0], cores = os.cpus().length || 1;
  const budget = 120 * Math.max(1, load / cores);
  if (budget > 120) console.log(`INFO machine load ${load.toFixed(1)} on ${cores} cores: wall-time budget scaled to ${budget.toFixed(0)} s`);
  check(`the whole journey ran in under ${budget.toFixed(0)} s wall time (${secs.toFixed(1)} s; 120 s when idle)`, secs < budget, String(secs));
  done();
})();
