// Feel playtest bot (playtest 4): a first-time player on a phone (390x844 touch) or a desktop (1280x720), first launch -> Hub ->
// every Arcade game for a fixed time each, plus the Adventure stages (Town offline, Realm, dungeon, Isles) by re-using journey3.
// Research tool, not a test: it never fails a build and is not part of run-all.js.
//
//   python3 -m http.server 9396 &   # repo root
//   NODE_PATH=$(npm root -g) VP=phone STAGE=launch,games OUT=/tmp/pt4 node game/tools/playtest-bot/journey4.js
//   NODE_PATH=$(npm root -g) VP=phone STAGE=adventure OUT=/tmp/pt4 node game/tools/playtest-bot/journey4.js   # runs journey3 town,realm,dungeon,isles
// Env: VP=phone|desk, STAGE=launch|games|adventure (comma list), GAMES=jam,angler,... (default all 11), SECS (per game, default 60),
//      OUT (default /tmp/pt4), PORT (9396), FRESH=1 wipes the profile first, THREE_JS (local three.min.js for Deepdelve).
// Input is generic "new player mashing": taps / clicks on whatever buttons are visible first (Start, Play, Cast...), then taps
//      across the play field, swipes, arrow keys / WASD / Space / Enter. It records every button label it saw, how long until the
//      first in-game state change (a crude time-to-fun), and the key hints a touch player is shown.
// SAFETY: every request AND WebSocket to a Firebase / Google auth host is blocked in the context before any page loads (the
//      blockDb rule of game/tests/helpers.js). The bot never chats and never writes anywhere but this profile's localStorage.
'use strict';
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const PORT = Number(process.env.PORT || 9396);
const G = (p) => 'http://localhost:' + PORT + '/game/' + p;
const OUT = process.env.OUT || '/tmp/pt4';
const VPN = process.env.VP || 'phone';
const STAGES = (process.env.STAGE || 'launch,games').split(',');
const SECS = Number(process.env.SECS || 60);
const THREE_LOCAL = process.env.THREE_JS || '/tmp/claude-0/three.min.js';
const BLOCK = /firebaseio\.com|firebasedatabase\.app|identitytoolkit|securetoken|googleapis\.com\/identitytoolkit/i;
const VPS = {
  phone: { key: 'phone', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, phone: true },
  desk: { key: 'desk', viewport: { width: 1280, height: 720 }, hasTouch: false, isMobile: false, phone: false },
};
const vp = VPS[VPN];
const GAMES = {
  jam: 'games/jam/index.html', angler: 'games/angler/index.html', bugs: 'games/festival/bugs.html', stalk: 'games/stalk/index.html',
  deepdelve: 'games/deepdelve/index.html', pop: 'games/pop/index.html', dash: 'games/dash/index.html', stack: 'games/stack/index.html',
  echo: 'games/echo/index.html', lantern: 'games/mad-maze/lantern.html', campfire: 'games/jam/index.html?from=hub',
};
const PICK = (process.env.GAMES || Object.keys(GAMES).join(',')).split(',');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const SHOTS = path.join(OUT, 'shots'); const PROF = path.join(OUT, 'profile4-' + vp.key);
fs.mkdirSync(SHOTS, { recursive: true });
const LOGF = path.join(OUT, 'log4-' + vp.key + '.txt');
let CUR = '-'; let N = 0; let PAGE = null;
const log = (...a) => { const s = new Date().toISOString().slice(11, 19) + ' [' + vp.key + '/' + CUR + '] ' + a.join(' '); fs.appendFileSync(LOGF, s + '\n'); console.log(s); };
const STATS = { http: 0, ws: 0, pageErrors: [], consoleErrors: [], missing: [], sockets: [], games: {} };

async function shot(label) {
  N++;
  const f = path.join(SHOTS, `${vp.key}-${CUR}-${String(N).padStart(2, '0')}-${label.replace(/[^a-z0-9]+/gi, '-')}.png`);
  try { await PAGE.screenshot({ path: f, timeout: 20000 }); log('SHOT', path.basename(f)); } catch (e) { log('shot failed', label); }
}
async function ctxOpen() {
  if (process.env.FRESH === '1') fs.rmSync(PROF, { recursive: true, force: true });
  const ctx = await chromium.launchPersistentContext(PROF, { viewport: vp.viewport, hasTouch: vp.hasTouch, isMobile: vp.isMobile, deviceScaleFactor: 1 });
  await ctx.route(BLOCK, (r) => { STATS.http++; return r.abort(); });
  await ctx.routeWebSocket(BLOCK, (ws) => { STATS.ws++; ws.close(); });
  if (fs.existsSync(THREE_LOCAL)) await ctx.route(/cdn\.jsdelivr\.net\/npm\/three@/, (r) => r.fulfill({ path: THREE_LOCAL, contentType: 'application/javascript' }));
  return ctx;
}
function watch(page) {
  page.on('pageerror', (e) => { STATS.pageErrors.push(CUR + ' ' + e.message.slice(0, 200)); log('PAGEERROR', e.message.slice(0, 200)); });
  page.on('console', (m) => { if (m.type() === 'error') { const t = m.text(); if (/ERR_FAILED|Failed to load resource/.test(t)) return; STATS.consoleErrors.push(CUR + ' ' + t.slice(0, 200)); log('CONSOLE', t.slice(0, 200)); } });
  page.on('response', (r) => { if (r.status() >= 400) { STATS.missing.push(CUR + ' ' + r.status() + ' ' + r.url()); log('HTTP', r.status(), r.url()); } });
  page.on('websocket', (w) => { STATS.sockets.push(w.url()); log('WEBSOCKET OPENED', w.url()); });
}
// what a new player reads: visible buttons, visible text volume, key hints shown on a touch screen, font families in use
async function survey(page) {
  return page.evaluate(() => {
    const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 4 && r.height > 4 && s.visibility !== 'hidden' && s.display !== 'none' && r.bottom > 0 && r.top < innerHeight; };
    const btns = [...document.querySelectorAll('button,a[href],[role=button]')].filter(vis).map((b) => (b.textContent || b.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 28)).filter(Boolean);
    const words = (document.body.innerText || '').split(/\s+/).filter(Boolean).length;
    const keyHints = ((document.body.innerText || '').match(/\b(WASD|Space|Esc|Enter|Shift|Tab|press [A-Z]\b|\([A-Z]\)|[A-Z] key)\b/gi) || []).slice(0, 8);
    const fonts = [...new Set([...document.querySelectorAll('body,h1,h2,button,p,div')].slice(0, 300).map((e) => getComputedStyle(e).fontFamily.split(',')[0].replace(/["']/g, '').trim()))].slice(0, 6);
    const small = [...document.querySelectorAll('button')].filter(vis).filter((b) => { const r = b.getBoundingClientRect(); return r.height < 36 || r.width < 36; }).length;
    const canvases = [...document.querySelectorAll('canvas')].filter(vis).map((c) => { const r = c.getBoundingClientRect(); return Math.round(r.width) + 'x' + Math.round(r.height) + (getComputedStyle(c).imageRendering.includes('pixel') || getComputedStyle(c).imageRendering.includes('crisp') ? ':px' : ':smooth'); });
    return { btns: btns.slice(0, 24), nBtns: btns.length, words, keyHints, fonts, smallBtns: small, canvases };
  }).catch(() => null);
}
const sig = (page) => page.evaluate(() => { const c = document.querySelector('canvas'); let px = ''; try { if (c && c.getContext && c.width) { const x = c.getContext('2d'); if (x) { const d = x.getImageData(0, 0, c.width, c.height).data; let s = 0; for (let i = 0; i < d.length; i += 4096) s = (s + d[i] * 3 + d[i + 1] * 5 + d[i + 2]) % 1e9; px = s; } } } catch (e) { /* webgl */ } return (document.body.innerText || '').length + ':' + (document.body.innerText || '').slice(0, 400).replace(/\d/g, '') + ':' + px; }).catch(() => '');
async function tapXY(x, y) { if (vp.phone) await PAGE.touchscreen.tap(x, y); else await PAGE.mouse.click(x, y); }
async function pressFirst(page, re, label) {
  const loc = page.locator('button:visible, a[href]:visible, [role=button]:visible').filter({ hasText: re }).first();
  if (!(await loc.count())) return false;
  const bb = await loc.boundingBox().catch(() => null); if (!bb) return false;
  await tapXY(bb.x + bb.width / 2, bb.y + bb.height / 2); log('TAP', label || String(re)); await wait(700); return true;
}
// one game: open, survey the first screen, press the obvious start button, then mash for SECS seconds
async function playGame(page, id) {
  const t0 = Date.now(); const rec = { id, firstButtons: null, startTap: null, ttfMs: null, changes: 0 };
  await page.goto(G(GAMES[id]), { waitUntil: 'domcontentloaded' }); await wait(2500);
  rec.first = await survey(page); log('FIRST SCREEN', JSON.stringify(rec.first));
  await shot('first-screen');
  const START = /^(\s*[▶►]?\s*)(play|start|begin|go|cast|dig|tap to start|new run|let.s go|ok|got it|continue|enter|start run|play now)/i;
  for (let k = 0; k < 4; k++) { if (await pressFirst(page, START, 'start ' + k)) { if (!rec.startTap) rec.startTap = Date.now() - t0; await wait(800); } else break; }
  await shot('after-start');
  const base = await sig(page); const vw = vp.viewport.width; const vh = vp.viewport.height; let i = 0; let last = base;
  const end = Date.now() + SECS * 1000; let midShot = false;
  while (Date.now() < end) {
    i++;
    if (vp.phone) {
      const x = vw * (0.2 + 0.6 * ((i * 37) % 100) / 100); const y = vh * (0.3 + 0.45 * ((i * 53) % 100) / 100);
      if (i % 5 === 0) { await PAGE.touchscreen.tap(x, y); await PAGE.touchscreen.tap(x + 30, y); } else await PAGE.touchscreen.tap(x, y);
      if (i % 7 === 0) { const b = page.locator('button:visible').nth(i % 4); const bb = await b.boundingBox().catch(() => null); if (bb && bb.y > vh * 0.55) await tapXY(bb.x + bb.width / 2, bb.y + bb.height / 2); }
    } else {
      const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'd', 'f', 'j', 'k', 'w', 'a', 's', 'Enter', 'e'];
      await page.keyboard.press(keys[i % keys.length]);
      if (i % 3 === 0) await page.mouse.click(vw * (0.3 + 0.4 * ((i * 37) % 100) / 100), vh * (0.3 + 0.4 * ((i * 53) % 100) / 100));
    }
    await wait(250);
    if (i % 8 === 0) { const s = await sig(page); if (s !== last) { rec.changes++; if (rec.ttfMs == null && s !== base) rec.ttfMs = Date.now() - t0; last = s; } }
    if (!midShot && Date.now() > end - SECS * 500) { midShot = true; await shot('mid-play'); }
    if (i % 40 === 0 && (await pressFirst(page, /^(play again|again|retry|restart|try again|new run|next)/i, 'again'))) rec.restarts = (rec.restarts || 0) + 1;
  }
  await shot('end'); rec.end = await survey(page); rec.secs = Math.round((Date.now() - t0) / 1000);
  // how do I leave? the Where-to / Menu / Back control a player would look for
  rec.exit = (await page.locator('button:visible, a:visible').filter({ hasText: /where to|menu|back|hub|home|quit|exit|leave/i }).allTextContents().catch(() => [])).map((s) => s.trim().slice(0, 24)).slice(0, 6);
  log('GAME', JSON.stringify(rec)); STATS.games[id] = rec;
}
const S = {};
S.launch = async (page) => { // first launch: the root page, then the Hub, as a stranger would see it
  await page.goto('http://localhost:' + PORT + '/'); await wait(2500); log('root', page.url(), JSON.stringify(await survey(page))); await shot('root');
  await page.goto(G('index.html')); await wait(2500); log('town join', JSON.stringify(await survey(page))); await shot('town-join');
  await page.goto(G('hub/index.html')); await wait(3000); log('hub', JSON.stringify(await survey(page))); await shot('hub-first');
  await page.mouse.wheel(0, 900).catch(() => {}); await wait(600); await shot('hub-scrolled');
};
S.games = async (page) => {
  for (const id of PICK) { CUR = id; N = 0; try { await playGame(page, id); } catch (e) { log('GAME ERROR', id, e.message.split('\n')[0]); await shot('error'); } }
  CUR = 'games';
};
S.adventure = async () => { // Town offline -> Realm -> dungeon -> Isles with the journey3 bot (same blocking rules), into this OUT
  const r = spawnSync(process.execPath, [path.join(__dirname, 'journey3.js')], { stdio: 'inherit', env: Object.assign({}, process.env, { VP: VPN, PORT: String(PORT), OUT, STAGE: process.env.ADV || 'town,dungeon,isles' }) });
  log('journey3 exit', r.status);
};
async function main() {
  const ctx = STAGES.some((s) => s !== 'adventure') ? await ctxOpen() : null;
  for (const st of STAGES) {
    CUR = st; N = 0; const t0 = Date.now();
    if (st === 'adventure') { await S.adventure(); continue; }
    const page = await ctx.newPage(); PAGE = page; watch(page);
    try { await S[st](page); } catch (e) { log('STAGE ERROR', e.message.split('\n')[0]); await shot('error'); }
    log('stage', st, 'took', Math.round((Date.now() - t0) / 1000) + 's'); await page.close();
  }
  if (ctx) await ctx.close();
  log('DB blocked http=' + STATS.http + ' ws=' + STATS.ws + ' socketsOpened=' + STATS.sockets.length + ' pageErrors=' + STATS.pageErrors.length + ' consoleErrors=' + STATS.consoleErrors.length + ' 4xx=' + STATS.missing.length);
  fs.appendFileSync(path.join(OUT, 'stats4.jsonl'), JSON.stringify(Object.assign({ vp: vp.key, stages: STAGES, at: new Date().toISOString() }, STATS)) + '\n');
}
if (require.main === module) main();
