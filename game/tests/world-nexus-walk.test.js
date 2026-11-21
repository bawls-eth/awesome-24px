// PLAYTEST-REVIEW-2 #5: the walkable Nexus. Entering puts the hero on the plaza spawn pad, the arena's own input (WASD / arrows / move stick)
// walks it around the 40x30 MMNexus plaza and never out of it, portals and NPCs are walk-up interactables behind one 44 px prompt button,
// the quest board still opens and claims, the Realm portal returns to the same Realm tile, and ?nexuswalk=0 restores the button screen.
// Run: BASE=http://localhost:8641/game/index.html NODE_PATH=$(npm root -g) SHOTS=/tmp/shots node game/tests/world-nexus-walk.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&seed=12345&qdate=2030-05-01';
const SHOT = process.env.SHOTS || '';
const SAVE = { realm: { level: 4, xp: 0, shards: 50, bestWave: 2, items: [{ n: 1, id: 'sparkwand', r: 0 }], nextUid: 2, eq: { weapon: 1 } } };

async function open(browser, url, phone) {
  const ctx = await browser.newContext(phone ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } : { viewport: { width: 1000, height: 700 } });
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html>town' }));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate((v) => { localStorage.clear(); localStorage.setItem('pixeltown-save-v1', v); localStorage.setItem('mm-aim-assist', '0'); }, JSON.stringify(SAVE));
  errors.length = 0;
  await page.goto(url);
  await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 30000 });
  await page.waitForFunction(() => { const s = window.__mm.world.artState(); return !s.loading; }, null, { timeout: 20000 }).catch(() => {});
  await E(page, (a) => { a.player.iframes = 1e9; a._hitPlayer = () => {}; });
  return { ctx, page, errors };
}
const E = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__mm.arena, window.__mm.world, ${JSON.stringify(arg)})`);
const frames = (page, n) => page.evaluate((k) => new Promise((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const tile = (page) => E(page, (a) => [Math.floor(a.player.x / 32), Math.floor(a.player.y / 32)]);
const hero = (page) => E(page, (a, w) => w.nexus.walk.hero());
const vis = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e || e.classList.contains('hidden')) return false; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden'; }, sel);
async function enter(page) {
  await E(page, (a, w) => { const s = w.nexus.site; a.player.x = s.x - 20; a.player.y = s.y; });
  await frames(page, 15); await page.click('#rw-nexus-go'); await frames(page, 4);
}
// stand `off` px to the right of an interactable (a free plaza point), then walk left with injected input until the prompt names it
async function walkUpTo(page, kind, id) {
  return E(page, (a, w, arg) => {
    const L = window.MMNexus.layout(); const t = (arg.kind === 'npc' ? L.npcs : L.portals).find((x) => x.id === arg.id);
    let placed = false; for (let off = 120; off >= 70 && !placed; off -= 10) placed = w.nexus.walk.place(t.x + off, t.y);
    if (!placed) for (let off = 120; off >= 70 && !placed; off -= 10) placed = w.nexus.walk.place(t.x - off, t.y);
    const dir = w.nexus.walk.hero().x > t.x ? -1 : 1; let n = 0;
    while (n < 200 && !(w.nexus.walk.near() && w.nexus.walk.near().id === arg.id)) { w.nexus.walk.step(dir, 0, 1 / 60); n++; }
    return { placed, n, near: w.nexus.walk.near(), hero: w.nexus.walk.hero() };
  }, { kind, id });
}
const prompt = (page) => page.evaluate(() => { const b = document.getElementById('rw-nx-act'); const r = b.getBoundingClientRect(); return { text: b.textContent, h: r.height, w: r.width, hidden: b.classList.contains('hidden') }; });

(async () => {
  const browser = await chromium.launch();
  // ---------------- desktop ----------------
  const A = await open(browser, WORLD); const page = A.page;
  await enter(page);
  const before = await tile(page); // the Realm tile the hero entered the Nexus from
  check('the entry tile is recorded', JSON.stringify(await E(page, (a, w) => [w.nexus.enterTile().x, w.nexus.enterTile().y])) === JSON.stringify(before));
  const st = await E(page, (a, w) => { const L = window.MMNexus.layout(); const h = w.nexus.walk.hero(); return { on: w.nexus.walk.on, open: w.nexus.isOpen(), paused: a.paused, h, sp: L.spawn, walk: window.MMNexus.walkable(h.tx, h.ty), running: w.nexus.walk.running(), cls: document.body.classList.contains('nx-walking') }; });
  check('entering the Nexus puts the hero on the plaza spawn pad (a walkable tile inside the plaza)', st.on && st.open && st.h.tx === st.sp.tx && st.h.ty === st.sp.ty && st.walk, JSON.stringify(st));
  check('the Realm arena is frozen behind the plaza and the walk loop runs', st.paused && st.running && st.cls, JSON.stringify(st));
  check('the old button lists are gone in walk mode (no data-npc / data-portal buttons)', (await page.locator('#rw-nexus [data-npc], #rw-nexus [data-portal]').count()) === 0);
  const cv = await page.evaluate(() => { const c = document.querySelector('#rw-nexus canvas'); const d = c.getContext('2d').getImageData(c.width / 2, c.height / 2, 1, 1).data; return { w: c.width, h: c.height, lit: d[0] + d[1] + d[2] }; });
  check('the stage is a 640x480 camera view onto the drawn plaza', cv.w === 640 && cv.h === 480 && cv.lit > 0, JSON.stringify(cv));
  // real keyboard: WASD goes through arena.keys
  const h0 = await hero(page);
  await page.keyboard.down('d'); await page.waitForTimeout(450); await page.keyboard.up('d'); await frames(page, 3);
  const h1 = await hero(page);
  check('holding D walks the hero right (the arena\'s own WASD input)', h1.x - h0.x > 30 && Math.abs(h1.y - h0.y) < 1, JSON.stringify({ h0, h1 }));
  await page.keyboard.down('ArrowUp'); await page.waitForTimeout(300); await page.keyboard.up('ArrowUp'); await frames(page, 3);
  const h2 = await hero(page);
  check('arrow keys walk too', h1.y - h2.y > 20, JSON.stringify({ h1, h2 }));
  check('the Realm player did not move while walking the plaza', JSON.stringify(await tile(page)) === JSON.stringify(before));
  // bounds: push hard into every wall with injected input
  const bounds = await E(page, (a, w) => {
    const out = []; const N = window.MMNexus;
    [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [1, -1], [-1, 1]].forEach(([mx, my]) => {
      for (let i = 0; i < 400; i++) w.nexus.walk.step(mx, my, 0.05);
      const h = w.nexus.walk.hero(); out.push({ x: Math.round(h.x), y: Math.round(h.y), ok: N.walkable(h.tx, h.ty) && h.x >= 32 && h.y >= 32 && h.x <= (N.W - 1) * 32 && h.y <= (N.H - 1) * 32 });
    });
    return out;
  });
  check('walking hard in all 8 directions never leaves the plaza or ends on a solid tile', bounds.every((b) => b.ok), JSON.stringify(bounds));
  const cam = await E(page, (a, w) => { const c = w.nexus.walk.cam(); return c.x >= 0 && c.y >= 0 && c.x <= 1280 - 640 && c.y <= 960 - 480; });
  check('the camera stays inside the plaza', cam);
  // no fire, no abilities, no enemies
  const cd0 = await E(page, (a) => a.abilityCd.slice());
  await page.keyboard.press('q'); await page.keyboard.down(' '); await page.waitForTimeout(200); await page.keyboard.up(' '); await frames(page, 3);
  const quiet = await E(page, (a, w, cd) => ({ cd: JSON.stringify(a.abilityCd) === JSON.stringify(cd), paused: a.paused, fire: !!a.keys[' '], enemies: window.MMNexus.layout().enemies.length }), cd0);
  check('no firing or abilities in the plaza, and the plaza has no enemies', quiet.cd && quiet.paused && !quiet.fire && quiet.enemies === 0, JSON.stringify(quiet));
  // walk up to an NPC -> prompt -> talk
  const wu = await walkUpTo(page, 'npc', 'wanderer'); await frames(page, 2);
  const pw = await prompt(page);
  check('walking up to the Wanderer shows the 44 px prompt naming them', wu.near && wu.near.id === 'wanderer' && !pw.hidden && /Wanderer/.test(pw.text) && pw.h >= 44 && pw.w >= 44, JSON.stringify({ wu, pw }));
  if (SHOT) await page.screenshot({ path: SHOT + '/nexus-walk-desktop.png' });
  await page.keyboard.press('e'); await frames(page, 2);
  const said = await page.evaluate(() => document.querySelector('#rw-nexus .nx-talk').textContent);
  check('pressing E talks (the Wanderer says a rumour in the talk box)', /^Wanderer: .{10,}/.test(said), said);
  // healer
  await walkUpTo(page, 'npc', 'healer'); await E(page, (a) => { a.player.hp = 5; });
  await page.click('#rw-nx-act');
  check('the healer, walked up to, mends to full', await E(page, (a) => a.player.hp === a.stats.maxHp));
  // quest board: finish everything, then walk to the Quest Giver
  await E(page, (a, w) => { w.quests.event({ type: 'kill', zone: 0, n: 100 }); w.quests.event({ type: 'boss' }); w.quests.event({ type: 'portal' }); });
  const wq = await walkUpTo(page, 'npc', 'quest');
  check('the Quest Giver prompt reads "Quest board"', /Quest board/.test((await prompt(page)).text), JSON.stringify(wq));
  await page.click('#rw-nx-act');
  const board = await page.evaluate(() => ({ open: !document.getElementById('rw-nx-board').classList.contains('hidden'), n: document.querySelectorAll('#rw-nx-board .nx-q').length, claim: Array.from(document.querySelectorAll('#rw-nx-board [data-claim]')).map((b) => b.getBoundingClientRect().height) }));
  check('the quest board opens with 3 quests and 44 px Claim buttons', board.open && board.n === 3 && board.claim.length === 3 && board.claim.every((h) => h >= 44), JSON.stringify(board));
  const sh0 = await E(page, (a) => a.save.shards);
  await page.click('#rw-nx-board [data-claim="kill_boss"]');
  const sh1 = await E(page, (a) => a.save.shards);
  check('claiming on the board pays shards', sh1 > sh0, JSON.stringify({ sh0, sh1 }));
  // Realm portal -> same tile
  const wr = await walkUpTo(page, 'portal', 'realm');
  check('the Realm portal prompt says Back to the Realm', /Back to the Realm/.test((await prompt(page)).text), JSON.stringify(wr));
  await page.keyboard.press('e'); await frames(page, 4);
  const back = await E(page, (a, w) => ({ open: w.nexus.isOpen(), paused: a.paused, cls: document.body.classList.contains('nx-walking'), running: w.nexus.walk.running() }));
  check('the Realm portal returns to the Realm on the same tile (unfrozen, walk loop stopped)', !back.open && !back.paused && !back.cls && !back.running && JSON.stringify(await tile(page)) === JSON.stringify(before), JSON.stringify({ back, before, after: await tile(page) }));
  // re-entering starts on the spawn pad again; Escape also leaves
  await enter(page);
  const again = await hero(page);
  await page.keyboard.press('Escape'); await frames(page, 3);
  check('re-entering starts on the spawn pad and Escape leaves', again.tx === 20 && again.ty === 19 && !(await E(page, (a, w) => w.nexus.isOpen())), JSON.stringify(again));
  // vault portal -> Lantern stash
  await enter(page); await walkUpTo(page, 'portal', 'vault'); await page.keyboard.press('e');
  await page.waitForURL(/lantern\.html/, { timeout: 8000 }).catch(() => {});
  check('the vault portal opens the Lantern stash page', /games\/mad-maze\/lantern\.html/.test(page.url()), page.url());
  check('no console errors (desktop walk)', A.errors.length === 0, A.errors.join(' | '));
  await A.ctx.close();

  // ---------------- biome portal returns to the Nexus entry tile in the Realm ----------------
  const B = await open(browser, WORLD + '&x=1');
  await enter(B.page); const t0 = await tile(B.page);
  await walkUpTo(B.page, 'portal', 'crypt');
  await B.page.click('#rw-nx-act');
  await B.page.waitForURL(/mode=dungeon/, { timeout: 8000 }).catch(() => {});
  const u = decodeURIComponent(B.page.url());
  check('a biome portal walked up to enters that dungeon and returns to the Nexus entry tile', /biome=crypt/.test(u) && u.indexOf('at=' + t0[0] + ',' + t0[1]) > 0, u);
  check('no console errors (biome portal)', B.errors.length === 0, B.errors.join(' | '));
  await B.ctx.close();

  // ---------------- phone 390x844 ----------------
  const P = await open(browser, WORLD, true); const pp = P.page;
  await E(pp, (a, w) => { const s = w.nexus.site; a.player.x = s.x - 20; a.player.y = s.y; }); await frames(pp, 15);
  await pp.tap('#rw-nexus-go'); await frames(pp, 4);
  const ph = await pp.evaluate(() => {
    const root = document.getElementById('rw-nexus');
    const btns = Array.from(root.querySelectorAll('button')).filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && getComputedStyle(b).visibility !== 'hidden'; });
    const small = btns.filter((b) => { const r = b.getBoundingClientRect(); return r.height < 43.5 || r.width < 43.5; }).map((b) => b.textContent);
    const st = document.getElementById('realm-stick-move').getBoundingClientRect();
    const top = document.elementFromPoint(st.left + st.width / 2, st.top + st.height / 2);
    return { sw: document.documentElement.scrollWidth, iw: innerWidth, rootSw: root.scrollWidth, rootCw: root.clientWidth, small, n: btns.length, stick: { w: st.width, h: st.height }, stickOnTop: !!(top && top.closest('#realm-stick-move')), touch: document.body.classList.contains('touch-device'), hint: root.querySelector('.nx-talk').textContent };
  });
  check('phone 390x844: the walkable Nexus has no horizontal scroll', ph.sw <= ph.iw && ph.rootSw <= ph.rootCw, JSON.stringify(ph));
  check('phone: every visible Nexus control is at least 44 px, the move stick sits on top of the plaza', ph.small.length === 0 && ph.n >= 1 && ph.stick.w >= 44 && ph.stickOnTop && ph.touch, JSON.stringify(ph));
  check('phone: no keyboard hints in the walk help', !/WASD|\(E\)|arrow keys/.test(ph.hint), ph.hint);
  // drag the real move stick: arena.moveVec drives the plaza hero
  const p0 = await hero(pp);
  const sb = await pp.evaluate(() => { const r = document.getElementById('realm-stick-move').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await pp.mouse.move(sb.x, sb.y); await pp.mouse.down(); await pp.mouse.move(sb.x - 40, sb.y, { steps: 3 }); await pp.waitForTimeout(400); await pp.mouse.up(); await frames(pp, 3);
  const p1 = await hero(pp);
  check('phone: dragging the move stick walks the hero (the arena\'s own stick)', p0.x - p1.x > 20, JSON.stringify({ p0, p1 }));
  await walkUpTo(pp, 'npc', 'guide'); await frames(pp, 2);
  const pg = await prompt(pp);
  check('phone: the walk-up prompt is a >= 44 px button without a keyboard hint', !pg.hidden && pg.h >= 44 && /Nexus Guide/.test(pg.text) && !/\(E\)/.test(pg.text), JSON.stringify(pg));
  const pr = await pp.evaluate(() => { const b = document.getElementById('rw-nx-act').getBoundingClientRect(); return b.right <= innerWidth && b.left >= 0; });
  check('phone: the prompt fits the screen width', pr);
  await pp.tap('#rw-nx-act'); await frames(pp, 2);
  check('phone: tapping the prompt talks', /^Nexus Guide: /.test(await pp.evaluate(() => document.querySelector('#rw-nexus .nx-talk').textContent)));
  if (SHOT) await pp.screenshot({ path: SHOT + '/nexus-walk-phone.png' });
  check('no console errors (phone walk)', P.errors.length === 0, P.errors.join(' | '));
  await P.ctx.close();

  // ---------------- ?nexuswalk=0 restores the button screen ----------------
  const C = await open(browser, WORLD + '&nexuswalk=0'); const cp = C.page;
  await enter(cp);
  const old = await cp.evaluate(() => ({ npcs: document.querySelectorAll('#rw-nexus [data-npc]').length, portals: document.querySelectorAll('#rw-nexus [data-portal]').length, act: !!document.getElementById('rw-nx-act'), cv: document.querySelector('#rw-nexus canvas').width, walk: window.__mm.world.nexus.walk.on }));
  check('?nexuswalk=0 shows the old 7 NPC and 6 portal buttons and no walk view', old.npcs === 7 && old.portals === 6 && !old.act && old.cv === 1280 && old.walk === false, JSON.stringify(old));
  check('no console errors (nexuswalk=0)', C.errors.length === 0, C.errors.join(' | '));
  await C.ctx.close();
  await browser.close(); done();
})();
