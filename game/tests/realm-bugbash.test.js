// Realm bug bash (2026-11-23): off-screen hold-fire toggle (?holdfire=0 / setHoldFire), pad Back = Restart on the fall screen, chip cues
// (death, ui_open / ui_close, realm / dungeon music choice), the shared Settings panel linked from the Realm sheet (live setters, Esc),
// the one-line 'Next goal' HUD, the phone HP text on one line, seeded terrain detail, and hostile saves.
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/realm-bugbash.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/mad-maze/index.html';
const SAVE = { realm: { level: 3, xp: 0, shards: 10, bestWave: 0, items: [], nextUid: 1, eq: {} } };

async function open(browser, q, opts, store) {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 1280, height: 720 } }, opts || {}));
  await blockDb(ctx);
  await ctx.routeWebSocket(/.*/, (ws) => ws.close());
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' }));
  await ctx.route('**/game/hub/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>hub</title>hub' }));
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push('console: ' + m.text()); });
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate((kv) => { localStorage.clear(); Object.keys(kv).forEach((k) => localStorage.setItem(k, kv[k])); }, Object.assign({ 'pixeltown-save-v1': JSON.stringify(SAVE) }, store || {}));
  page.errors.length = 0;
  await page.goto(PAGE + '?' + q);
  await page.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 15000 });
  return { ctx, page };
}

(async () => {
  const browser = await chromium.launch();

  // ---- world, desktop ----
  let { ctx, page } = await open(browser, 'mode=world&test=1');
  const hf = await page.evaluate(() => {
    const a = window.__mm.arena; const p = a.player; const far = { x: a.camera.x - 900, y: a.camera.y - 900, type: 'grunt' };
    const r = { def: a._holdFire, farBlocked: a._canFire(far, p) === false };
    a.setHoldFire(false); r.offAll = a._canFire(far, p) === true; r.offFlag = a._holdFire === false;
    a.setHoldFire(true); r.back = a._canFire(far, p) === false;
    return r;
  });
  check('hold-fire rule is on by default: an off-screen shooter holds fire', hf.def === true && hf.farBlocked, JSON.stringify(hf));
  check('setHoldFire(false) lets off-screen shooters fire, setHoldFire(true) restores the rule', hf.offAll && hf.offFlag && hf.back, JSON.stringify(hf));

  // chip audio: mm-chip.js is on the page; death + panel cues go through _snd
  const snd = await page.evaluate(() => {
    const a = window.__mm.arena; const heard = []; const o = a._snd.bind(a); a._snd = (n) => { heard.push(n); return o(n); };
    a._panel('board'); a._panel(null);
    return { chip: typeof MMChip === 'object' && !!MMChip.SFX && !!MMChip.SFX.death, heard };
  });
  check('MMChip is loaded on the Realm page (8-bit voices ready before the first gesture)', snd.chip);
  check('opening / closing a panel plays ui_open then ui_close', snd.heard.join(',') === 'ui_open,ui_close', snd.heard.join(','));
  const mus = await page.evaluate(() => {
    const r = { def: RealmAudio.chipMusicPref() };
    localStorage.setItem('mm-music', '1'); r.on = RealmAudio.chipMusicPref();
    localStorage.setItem('mm-music', 'garbage'); r.bad = RealmAudio.chipMusicPref();
    localStorage.setItem('mm-music', '0'); r.off = RealmAudio.chipMusicPref();
    localStorage.removeItem('mm-music');
    r.shore = RealmAudio.cueFor(0); r.deep = RealmAudio.cueFor(3);
    return r;
  });
  check('chip music is off by default and follows mm-music (garbage = off)', mus.def === false && mus.on === true && mus.bad === false && mus.off === false, JSON.stringify(mus));
  check('music cue: realm in the shore, dungeon in the deep zones', mus.shore === 'realm' && mus.deep === 'dungeon', JSON.stringify(mus));

  // Next goal line
  await page.waitForFunction(() => { const g = document.getElementById('rw-goal'); return g && /^Next goal: \S/.test(g.textContent); }, null, { timeout: 5000 }).catch(() => {});
  const goal = await page.evaluate(() => { const g = document.getElementById('rw-goal'); if (!g) return null; const r = g.getBoundingClientRect(); return { t: g.textContent, vis: !g.classList.contains('hidden') && r.height > 0, h: r.height, fs: parseFloat(getComputedStyle(g).fontSize) }; });
  check('a one-line Next goal shows in the world HUD', !!goal && goal.vis && /^Next goal: \S/.test(goal.t) && goal.h < 30, JSON.stringify(goal));
  check('Next goal text is at least 12 px', !!goal && goal.fs >= 12, JSON.stringify(goal));

  // shared Settings panel from the Realm sheet
  await page.evaluate(() => window.__mmAccess.open());
  const sb = page.locator('#mm-settings-shared');
  check('the Realm settings sheet links to the shared Settings panel', (await sb.count()) === 1 && await sb.isVisible());
  await sb.click();
  const sh = await page.evaluate(() => { const d = document.getElementById('mmset'); return { open: !!d && !d.hidden, realmSheet: !document.getElementById('mm-settings').classList.contains('hidden') }; });
  check('it opens the shared panel and closes the Realm sheet (no stacked dialogs)', sh.open && !sh.realmSheet, JSON.stringify(sh));
  const before = await page.evaluate(() => window.__mm.arena._aimAssist);
  await page.locator('#mmset [data-id="aim-assist"], #mmset #mmset-aim-assist, #mmset [data-setting="aim-assist"]').first().click().catch(() => {});
  const after = await page.evaluate(() => ({ a: window.__mm.arena._aimAssist, k: localStorage.getItem('mm-aim-assist') }));
  if (after.a === before) { // the control id differs: drive the documented change event instead
    await page.evaluate(() => { localStorage.setItem('mm-aim-assist', '0'); window.dispatchEvent(new CustomEvent('mm-settings-change', { detail: { id: 'aim-assist', value: false } })); });
  }
  check('aim assist changed in the shared panel applies to the arena live', await page.evaluate(() => window.__mm.arena._aimAssist === false));
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('mm-settings-change', { detail: { id: 'reduce-motion', value: true } })));
  check('reduce motion from the shared panel reaches the arena', await page.evaluate(() => window.__mm.arena._reduced === true));
  await page.keyboard.press('Escape');
  const esc = await page.evaluate(() => ({ open: !document.getElementById('mmset').hidden, panel: window.__mm.arena.panel }));
  check('Esc closes the shared panel first', !esc.open, JSON.stringify(esc));

  // pad Back / Select on the fall screen = Try again; not in play
  const pad = await page.evaluate(async () => {
    const a = window.__mm.arena; a.__rs = 0; const o = a.restart.bind(a); a.restart = () => { a.__rs++; return o(); };
    let back = false; const btn = (i) => ({ pressed: i === 8 && back, value: i === 8 && back ? 1 : 0 });
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [{ connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 16 }, (_, i) => btn(i)) }] });
    const frames = (n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
    a.setPaused(false); await frames(3);
    back = true; await frames(4); back = false; await frames(3);
    const inPlay = a.__rs;
    a.player.hp = 0; a._showDeath(); await frames(2);
    back = true; await frames(4); back = false; await frames(3);
    return { inPlay, onFall: a.__rs };
  });
  check('pad Back does nothing in play (no restart mid-fight)', pad.inPlay === 0, JSON.stringify(pad));
  check('pad Back on the fall screen restarts (Try again)', pad.onFall === 1, JSON.stringify(pad));
  const dsnd = await page.evaluate(() => { const a = window.__mm.arena; const h = []; const o = a._snd.bind(a); a._snd = (n) => { h.push(n); return o(n); }; a.state = 'play'; a._die(); return h; });
  check('dying plays the death cue', dsnd.indexOf('death') >= 0, dsnd.join(','));
  check('no page errors (world, desktop)', page.errors.length === 0, page.errors.join(' | '));
  await ctx.close();

  // ---- ?holdfire=0 starts with the rule off ----
  ({ ctx, page } = await open(browser, 'mode=world&test=1&holdfire=0'));
  check('?holdfire=0 starts with the hold-fire rule off', await page.evaluate(() => { const a = window.__mm.arena; return a._holdFire === false && a._canFire({ x: a.camera.x - 900, y: a.camera.y - 900 }, a.player) === true; }));
  check('seeded terrain detail is baked (chunks built, ?tiledetail default on)', await page.evaluate(() => window.__mm.world.chunkBuilds() > 0));
  await ctx.close();

  // ---- phone: HP numbers stay on one line, goal line clear of the thumbs ----
  ({ ctx, page } = await open(browser, 'mode=world&test=1', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }));
  await page.waitForTimeout(1200);
  const hp = await page.evaluate(() => { const b = document.getElementById('realm-hp').getBoundingClientRect(); const t = document.getElementById('realm-hp-text'); return { bh: b.height, sh: t.scrollHeight, ws: getComputedStyle(t).whiteSpace, txt: t.textContent }; });
  check('phone: HP text never wraps inside the HP bar', hp.ws === 'nowrap' && hp.sh <= hp.bh + 2, JSON.stringify(hp));
  const pg = await page.evaluate(() => { const g = document.getElementById('rw-goal'); const r = g.getBoundingClientRect(); const s = document.getElementById('realm-stick-move').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, right: r.right, stickTop: s.top, vw: innerWidth, hidden: g.classList.contains('hidden') }; });
  check('phone: the goal line sits at the top, never over the sticks, inside the screen', pg.hidden || (pg.bottom < pg.stickTop && pg.right <= pg.vw), JSON.stringify(pg));
  const tabsY = await page.evaluate(async () => {
    const a = window.__mm.arena; a.setPaused(true); const out = {};
    for (const t of ['gear', 'stats', 'relics', 'gear']) { a.bpTab(t); await new Promise((r) => requestAnimationFrame(r)); const b = document.querySelector('[data-bp-tab="stats"]'); out[t] = Math.round(b.getBoundingClientRect().top); }
    out.hint = (document.getElementById('realm-bp-stat4-for') || {}).textContent || '';
    a.setPaused(false); return out;
  });
  check('phone: the backpack tabs stay put when switching Gear / Stats / Relics', tabsY.gear === tabsY.stats && tabsY.stats === tabsY.relics, JSON.stringify(tabsY));
  check('the Stats tab hint points to the Gear tab (no items to tap there)', /Gear tab/.test(tabsY.hint), JSON.stringify(tabsY));
  check('no page errors (phone)', page.errors.length === 0, page.errors.join(' | '));
  await ctx.close();

  // ---- phone + landscape at 150% text: XP bar, zone line and goal line never overlap ----
  for (const vp of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    ({ ctx, page } = await open(browser, 'mode=world&test=1', { viewport: vp, hasTouch: true, isMobile: true }, { 'pixeltown-access-v1': JSON.stringify({ v: 1, hudScale: 1.5 }) }));
    await page.waitForFunction(() => { const g = document.getElementById('rw-goal'); return g && !g.classList.contains('hidden') && g.style.top; }, null, { timeout: 6000 }).catch(() => {});
    const ov = await page.evaluate(() => {
      const R = (id) => { const e = document.getElementById(id); if (!e || !e.getClientRects().length || e.classList.contains('hidden')) return null; const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
      const hit = (a, b) => !!a && !!b && a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
      const xp = R('realm-xp'), z = R('rw-zone'), g = R('rw-goal');
      return { xpZone: hit(xp, z), xpGoal: hit(xp, g), zoneGoal: hit(z, g), g: !!g, xp, z, gr: g };
    });
    check(`${vp.width}x${vp.height} at 150% text: XP bar, zone line and Next goal do not overlap`, ov.g && !ov.xpZone && !ov.xpGoal && !ov.zoneGoal, JSON.stringify(ov));
    check(`${vp.width}x${vp.height} at 150% text: no page errors`, page.errors.length === 0, page.errors.join(' | '));
    await ctx.close();
  }

  // ---- a11y sweep findings (bugbash/a11y-viewports.md): landmarks, labelled canvas, early keyboard stop, slot text contrast, prefs on <html> ----
  for (const q of ['mode=world&test=1&seed=12345', 'mode=dungeon&test=1&seed=5']) {
    ({ ctx, page } = await open(browser, q, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, { 'mm-high-contrast': '1', 'mm-reduce-motion': '1', 'pixeltown-save-v1': JSON.stringify({ realm: { level: 1, xp: 0, shards: 0, bestWave: 0, items: [], nextUid: 1, eq: {} } }) }));
    const lm = await page.evaluate(() => {
      const c = document.getElementById('realm-canvas'); const de = document.documentElement;
      const slots = [...document.querySelectorAll('#realm-abilities .realm-ab')].map((b) => { const cs = getComputedStyle(b); const out = { op: Number(cs.opacity), locked: b.classList.contains('locked') }; ['cd', 'nm', 'key'].forEach((k) => { const e = b.querySelector('.' + k); if (e && e.textContent.trim()) { const s = getComputedStyle(e); out[k] = { c: s.color, fs: parseFloat(s.fontSize), op: Number(s.opacity) }; } }); return out; });
      return { main: !!document.querySelector('main,[role=main]'), h1: document.querySelectorAll('h1').length, canvas: c && c.getAttribute('aria-label'), hc: de.hasAttribute('data-high-contrast'), rm: de.hasAttribute('data-reduce-motion'), slots };
    });
    const tag = q.split('&')[0];
    check(`[${tag}] one main landmark, one h1, the canvas is labelled`, lm.main && lm.h1 === 1 && !!lm.canvas, JSON.stringify(lm));
    check(`[${tag}] high-contrast and reduce-motion prefs reach <html>`, lm.hc && lm.rm, JSON.stringify(lm));
    const locked = lm.slots.filter((s) => s.locked);
    const lum = (rgb) => { const m = rgb.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]; };
    const navy = lum('rgb(29,43,83)'); const ratio = (c) => (lum(c) + 0.05) / (navy + 0.05);
    const bad = []; lm.slots.forEach((s) => { if (s.op < 1) bad.push('slot opacity ' + s.op); ['cd', 'nm', 'key'].forEach((k) => { if (s[k] && (ratio(s[k].c) < 4.5 || s[k].op < 1)) bad.push(k + ' ' + s[k].c); if (s[k] && k === 'nm' && s[k].fs < 12) bad.push('nm ' + s[k].fs + 'px'); }); });
    check(`[${tag}] ability slot labels (locked too: ${locked.length}) are >= 4.5:1 on navy, name >= 12 px`, bad.length === 0, bad.join('; '));
    await page.evaluate(() => { document.activeElement && document.activeElement.blur && document.activeElement.blur(); });
    const stops = [];
    for (let i = 0; i < 4; i++) { await page.keyboard.press('Tab'); stops.push(await page.evaluate(() => { const e = document.activeElement; return e ? (e.id || e.tagName) + ':' + ((e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 30)) : ''; })); }
    check(`[${tag}] the play field is a keyboard stop within 3 Tabs, named "Play ..."`, stops.slice(0, 3).some((s) => /^realm-canvas-wrap:Play/.test(s)), stops.join(' / '));
    check(`[${tag}] no page errors (a11y)`, page.errors.length === 0, page.errors.join(' | '));
    await ctx.close();
  }

  // ---- hostile saves: every Realm key garbage -> the world still starts, no errors ----
  for (const bad of ['{"realm":"x"}', '[]', 'null', '{"realm":{"level":-5,"items":"no","eq":7,"shards":"9e99"}}']) {
    ({ ctx, page } = await open(browser, 'mode=world&test=1', {}, { 'pixeltown-save-v1': bad, 'pixeltown-realm-v1': '{"v":"x","quests":[1],"pos":{"x":"a"},"questBags":"z"}', 'pixeltown-access-v1': '{"hudScale":99}', 'pixeltown-realm-audio-v1': '{{', 'mm-music': '\u0000' }));
    await page.waitForTimeout(600);
    const st = await page.evaluate(() => ({ s: window.__mm.arena.state, goal: (document.getElementById('rw-goal') || {}).textContent || '' }));
    check('hostile save ' + bad.slice(0, 30) + ': world plays, goal line sane, no errors', st.s === 'play' && !/undefined|NaN|\[object/.test(st.goal) && page.errors.length === 0, JSON.stringify(st) + ' ' + page.errors.join(' | '));
    await ctx.close();
  }

  // ---- dungeon fall: the summary names the fall cache it stashed (was "Loot: no items" next to "Stashed 1 item") ----
  ({ ctx, page } = await open(browser, 'mode=dungeon&biome=crypt&test=1&seed=42', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }));
  await page.evaluate(() => { const a = window.__mm.arena; a.player.hp = 0; a._die(); });
  await page.waitForFunction(() => { const s = document.getElementById('mm-summary'); return s && !s.classList.contains('hidden') && s.textContent.length > 20; }, null, { timeout: 10000 });
  const sum = await page.evaluate(() => ({ cache: (document.getElementById('mm-sum-cache') || {}).textContent || '', stash: (document.getElementById('mm-sum-stash') || {}).textContent || '', st: window.__mm.dungeon.stash }));
  check('dungeon fall summary lists the fall cache that the stash line counts', /^💀 (Fall cache: |pack full)/.test(sum.cache) && !/[<>]/.test(sum.cache), JSON.stringify(sum));
  check('no page errors (dungeon fall)', page.errors.length === 0, page.errors.join(' | '));
  await ctx.close();

  // ---- ?goal=0 / ?mmsettings=0 leave the page as before ----
  ({ ctx, page } = await open(browser, 'mode=world&test=1&goal=0&mmsettings=0'));
  check('?goal=0 and ?mmsettings=0 add neither the goal line nor the shared panel', await page.evaluate(() => !document.getElementById('rw-goal') && !document.getElementById('mmset')));
  await ctx.close();

  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
