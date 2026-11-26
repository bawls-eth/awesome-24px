// Cycle 12 S: ID-56 shop "saving for" pin (spec: U cycle 11 in design/IDEAS.md), checked in a real browser on the Mad Maze Realm page
// at 1280x720, 390x844 and 195x422 with real taps / clicks:
//   - every offer row has a 44 x 44 star (button.rm-pin, aria-pressed, "Save for <rarity> <name>"); > 300 px it sits just left of Buy on
//     the Buy line, <= 300 px at the right end of the NAME line (the name keeps clear of it) and Buy stays full width;
//   - one pin at a time: another star moves it, the lit star clears it; device pref mm-shop-pin = {"v":1,"id":...}, never in pixeltown-save-v1;
//   - the sticky wallet header says "★ Saving for <rarity> <name>: N more 💎" / "...: ready to buy"; the pinned row has a yellow left border;
//   - HUD: > 300 px #realm-pin " · ★ N 💎 to go" / " · ★ ready" on one line; <= 300 px no text, yellow shard count and an aria-label;
//   - buying the pinned item clears the pin silently; no sideways scroll; the goal line never overflows.
// OFFLINE: blockDb on every context, literal db.attempts() === 0. Never chats, never writes Firebase.
// Run: BASE=http://localhost:9125/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc12-s-shop-pin.test.js   (SHOTS=<dir>)
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const LS = require('./lib/load-scale');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const ORIGIN = new URL(BASE).origin;
const SHOTS = process.env.SHOTS || '';
const URL_WORLD = '/game/games/mad-maze/index.html?mode=world&from=hub&test=1&seed=12345&heropick=0&tutorial=0&qdate=2030-05-01';

async function world(browser, w, h, save) {
  const touch = w < 900;
  const ctx = await browser.newContext(touch ? { viewport: { width: w, height: h }, hasTouch: true, isMobile: true } : { viewport: { width: w, height: h } });
  const db = await blockDb(ctx);
  await ctx.routeWebSocket(/.*/, (ws) => ws.close());
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html>town' }));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate((s) => { localStorage.clear(); localStorage.setItem('pixeltown-save-v1', JSON.stringify(s)); localStorage.setItem('mm-aim-assist', '0'); }, save);
  await page.goto(ORIGIN + URL_WORLD);
  await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: LS.budget(40000) });
  await page.evaluate(() => { window.__mm.arena.player.iframes = 1e9; });
  return { ctx, db, page, errors, touch };
}

const shopState = (page) => page.evaluate(() => {
  const r = (e) => { const q = e.getBoundingClientRect(); return { l: q.left, t: q.top, r: q.right, b: q.bottom, w: q.width, h: q.height }; };
  const rows = [...document.querySelectorAll('#realm-shop-body li')].map((li) => {
    const pin = li.querySelector('button.rm-pin'); const buy = li.querySelector('button[data-buy]'); const nm = li.querySelector('.nm');
    return { li: r(li), pin: pin ? r(pin) : null, buy: r(buy), nm: r(nm), nmText: (() => { const rg = document.createRange(); const tn = [...nm.childNodes].find((c) => c.nodeType === 3 && c.data.trim()); if (!tn) return r(nm); rg.selectNodeContents(tn); return r(rg); })(), rarText: (() => { const rg = document.createRange(); rg.selectNodeContents(li.querySelector('.rar')); return r(rg); })(), stText: (() => { const rg = document.createRange(); rg.selectNodeContents(li.querySelector('.st')); return r(rg); })(),
      pressed: pin && pin.getAttribute('aria-pressed'), label: pin && pin.getAttribute('aria-label'), glyph: pin && pin.textContent, pinned: li.classList.contains('rm-pinned'),
      border: getComputedStyle(li).borderLeftWidth + ' ' + getComputedStyle(li).borderLeftStyle, id: pin && pin.dataset.pin };
  });
  const goal = document.querySelector('#realm-shop .rm-pin-goal');
  let pref = null; try { pref = JSON.parse(localStorage.getItem('mm-shop-pin')); } catch (e) { pref = 'bad'; }
  const save = localStorage.getItem('pixeltown-save-v1') || '';
  return { rows, goal: goal ? goal.textContent : '', goalFits: !goal || goal.scrollWidth <= goal.clientWidth + 1, goalFs: goal ? parseFloat(getComputedStyle(goal).fontSize) : 0,
    pref, inSave: /shop-pin|mm-shop-pin|shopPin/.test(save), sw: document.documentElement.scrollWidth, vw: innerWidth };
});
const hud = (page) => page.evaluate(() => {
  const info = document.getElementById('realm-info'); const pin = document.getElementById('realm-pin'); const sh = document.getElementById('realm-shards');
  return { pin: pin ? pin.textContent : null, oneLine: info.scrollWidth <= info.clientWidth + 1, label: info.getAttribute('aria-label') || '', yellow: sh.classList.contains('rm-pin-on'), color: getComputedStyle(sh).color };
});

(async () => {
  const browser = await chromium.launch();
  for (const [w, h] of [[1280, 720], [390, 844], [195, 422]]) {
    const tag = `${w}x${h}`;
    // level 9, best wave 6: Common / Uncommon / Rare offers; 18 💎 = 6 short of the cheapest (24)
    const { ctx, db, page, errors, touch } = await world(browser, w, h, { realm: { level: 9, xp: 0, shards: 18, bestWave: 6, items: [], nextUid: 20, eq: {} } });
    const tap = (sel) => (touch ? page.tap(sel) : page.click(sel));
    const openShop = async () => {
      await tap('#realm-bp-btn'); await tap('#realm-backpack-body button[data-open-shop]');
      await page.waitForFunction(() => document.querySelectorAll('#realm-shop-body li').length > 0, null, { timeout: LS.budget(10000) });
      await page.waitForTimeout(150);
    };
    await openShop();
    let s = await shopState(page);
    const narrow = w <= 300;
    check(`[${tag}] every offer row has a star button, 44 x 44, glyph ☆, aria-pressed=false, labelled "Save for <rarity> <name>"`,
      s.rows.length > 3 && s.rows.every((q) => q.pin && q.pin.w >= 44 && q.pin.h >= 44 && q.glyph === '☆' && q.pressed === 'false' && /^Save for \S+ .+/.test(q.label)), JSON.stringify(s.rows.slice(0, 2)));
    if (!narrow) {
      check(`[${tag}] > 300 px: the star sits just left of Buy, on the Buy line`, s.rows.every((q) => q.pin.r <= q.buy.l + 0.5 && q.buy.l - q.pin.r <= 16 && q.pin.t < q.buy.b && q.pin.b > q.buy.t), JSON.stringify(s.rows.slice(0, 2).map((q) => [q.pin, q.buy])));
    } else {
      // deviation from U's "NAME line" (measured, see cycle12-systems.md): at <= 300 px the star sits at the right end of the rarity / stat lines
      const apart = (a, b) => a.r <= b.l + 0.5 || b.r <= a.l + 0.5 || a.b <= b.t + 0.5 || b.b <= a.t + 0.5;
      check(`[${tag}] <= 300 px: the star is at the right end of the rarity / stat lines, inside the row, under the name line; no text runs under it`,
        s.rows.every((q) => q.pin.t >= q.nm.b - 0.5 && q.pin.b <= q.buy.t + 0.5 && q.pin.r <= q.li.r + 0.5 && q.li.r - q.pin.r <= 12 && apart(q.nmText, q.pin) && apart(q.rarText, q.pin) && apart(q.stText, q.pin)),
        JSON.stringify(s.rows.slice(0, 2).map((q) => [q.pin, q.nm, q.rarText, q.stText, q.li])));
      check(`[${tag}] <= 300 px: Buy stays full width under the text`, s.rows.every((q) => q.buy.w >= q.li.w - 24 && q.buy.t >= q.nm.b - 0.5), JSON.stringify(s.rows.slice(0, 2).map((q) => [q.buy, q.li])));
    }
    check(`[${tag}] no pin yet: no goal line, no pref`, s.goal === '' && s.pref === null, JSON.stringify({ goal: s.goal, pref: s.pref }));

    // pin row 0 (real tap)
    const id0 = s.rows[0].id; const id1 = s.rows[1].id;
    await tap(`#realm-shop-body button[data-pin="${id0}"]`); await page.waitForTimeout(150);
    s = await shopState(page);
    const lab0 = s.rows[0].label.replace(/^Stop saving for /, '');
    check(`[${tag}] a tap pins it: ★, aria-pressed=true, "Stop saving for ...", yellow left border; pref {"v":1,"id":"${id0}"}`,
      s.rows[0].pressed === 'true' && s.rows[0].glyph === '★' && /^Stop saving for /.test(s.rows[0].label) && s.rows[0].pinned && /^2px solid/.test(s.rows[0].border) && s.pref && s.pref.v === 1 && s.pref.id === id0,
      JSON.stringify({ r: s.rows[0], pref: s.pref }));
    check(`[${tag}] header: "★ Saving for ${lab0}: 6 more 💎", >= 12 px, never overflows`, s.goal === `★ Saving for ${lab0}: 6 more 💎` && s.goalFs >= 12 && s.goalFits, JSON.stringify({ goal: s.goal, fs: s.goalFs, fits: s.goalFits }));
    check(`[${tag}] the pin is never in pixeltown-save-v1`, !s.inSave, '');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/cyc12-systems-pin-shop-${tag}.jpg`, type: 'jpeg', quality: 80 });

    // another star moves the pin
    await tap(`#realm-shop-body button[data-pin="${id1}"]`); await page.waitForTimeout(150);
    s = await shopState(page);
    check(`[${tag}] another star moves the pin: only row 1 is pressed`, s.rows.filter((q) => q.pressed === 'true').length === 1 && s.rows[1].pressed === 'true' && !s.rows[0].pinned && s.pref.id === id1, JSON.stringify(s.rows.slice(0, 2).map((q) => q.pressed)));
    // the lit star clears it
    await tap(`#realm-shop-body button[data-pin="${id1}"]`); await page.waitForTimeout(150);
    s = await shopState(page);
    check(`[${tag}] the lit star clears it: nothing pressed, no goal, pref removed`, s.rows.every((q) => q.pressed === 'false') && s.goal === '' && s.pref === null, JSON.stringify({ goal: s.goal, pref: s.pref }));

    // pin row 0 again and close the shop: the HUD
    await tap(`#realm-shop-body button[data-pin="${id0}"]`); await page.waitForTimeout(150);
    await tap('#realm-shop-close'); await page.waitForTimeout(300);
    let hd = await hud(page);
    if (!narrow) check(`[${tag}] HUD: #realm-pin " · ★ 6 💎 to go" (or " · ★ 6 💎" when it would not fit), #realm-info stays on one line`, (hd.pin === ' · ★ 6 💎 to go' || hd.pin === ' · ★ 6 💎') && hd.oneLine && hd.yellow, JSON.stringify(hd));
    else check(`[${tag}] HUD <= 300 px: no pin text, the shard count is yellow, aria-label "... 18 of 24 shards saved for ..."`, hd.pin === null && hd.yellow && hd.color === 'rgb(255, 236, 39)' && / · 18 of 24 shards saved for /.test(hd.label), JSON.stringify(hd));
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/cyc12-systems-pin-hud-${tag}.jpg`, type: 'jpeg', quality: 80 });

    // enough shards: ready
    await page.evaluate(() => { const a = window.__mm.arena; a.save.shards = 100; a.displayShards = 100; a._syncHud(); });
    hd = await hud(page);
    if (!narrow) check(`[${tag}] HUD with enough shards: " · ★ ready"`, hd.pin === ' · ★ ready' && hd.oneLine, JSON.stringify(hd));
    await openShop();
    s = await shopState(page);
    check(`[${tag}] header with enough shards: "★ ${lab0}: ready to buy" (no toast, no timer)`, s.goal === `★ ${lab0}: ready to buy`, s.goal);
    // buy the pinned item (real tap): the pin clears silently
    await tap(`#realm-shop-body button[data-buy="${id0.split(':')[0]}"][data-r="${id0.split(':')[1]}"]`); await page.waitForTimeout(200);
    s = await shopState(page);
    hd = await hud(page);
    check(`[${tag}] buying the pinned item clears the pin: no pref, no goal, no pressed star, HUD back to normal`, s.pref === null && s.goal === '' && s.rows.every((q) => q.pressed === 'false') && hd.pin === null && !hd.yellow && hd.label === '', JSON.stringify({ pref: s.pref, goal: s.goal, hd }));
    check(`[${tag}] no sideways scroll`, s.sw <= s.vw, `${s.sw} > ${s.vw}`);

    // a pin that is no longer in stock (made up id) clears when the shop is drawn; a malformed pref reads as no pin
    await page.evaluate(() => { localStorage.setItem('mm-shop-pin', JSON.stringify({ v: 1, id: 'nosuchitem:2' })); window.__mm.arena.renderShop(); });
    s = await shopState(page);
    check(`[${tag}] a pin not in stock clears silently when the shop is drawn`, s.pref === null && s.goal === '', JSON.stringify(s.pref));
    await page.evaluate(() => { localStorage.setItem('mm-shop-pin', '{bad json'); window.__mm.arena.renderShop(); });
    s = await shopState(page);
    check(`[${tag}] a malformed pref = no pin, no error`, s.goal === '' && s.rows.every((q) => q.pressed === 'false'), s.goal);
    check(`[${tag}] no page errors, no database traffic (literal 0)`, errors.length === 0 && db.attempts() === 0, errors.join(' | ') + ' db=' + db.attempts());
    await ctx.close();
  }
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
