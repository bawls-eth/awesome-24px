// Town bug bash (2026-11-23), OFFLINE only: every database host is blocked (blockDb), the Firebase SDK is answered with an empty stub
// and the player enters through "Play offline" as ADMINbb. Never chats, never writes to Firebase.
//  - the 3 stone hero statues stand on the main pond's bank (they replaced the walking pond cats, and used to stand IN the water)
//  - the graveyard plot is ground: its tombstones draw above it
//  - the 98 flora/fauna are baked once by shared/mm-pixelize.js (ffpx_<id>), ?pixelize=0 keeps the SVG art
//  - the chat stack has no empty frame over the middle of a phone screen
//  - first minute: the gate chip is the one guidance line; ambient announcements wait, replies to the player never do
//  - NPC / villager lines no longer talk about the old species (pond cats, Bored Ape, paws, fur)
// Run: python3 -m http.server 8440 &   BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/town-bugbash.test.js
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';

async function open(browser, viewport, touch, qs) {
  const ctx = await browser.newContext(touch ? { viewport, hasTouch: true, isMobile: true } : { viewport });
  const db = await blockDb(ctx);
  await ctx.route(/gstatic\.com\/firebasejs\//, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: '/* firebase SDK blocked by town-bugbash.test.js */' }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.route('**/main.js*', async (route) => {
    const resp = await route.fetch();
    const body = (await resp.text()).replace('const game = new Phaser.Game(config);', 'const game = window.__g = new Phaser.Game(config);');
    route.fulfill({ response: resp, body });
  });
  await page.goto(BASE + (qs || ''), { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#avatar-grid .avatar-choice', { timeout: 15000 });
  await page.fill('#name-input', 'ADMINbb');
  await page.click('button:has-text("Join Town")'); // offline: the SDK stub makes the join fall through to Play offline
  await page.waitForSelector('#join-offline-btn:not(.hidden)', { timeout: 15000 });
  await page.click('#join-offline-btn');
  await page.waitForFunction(() => window.__g && window.__g.scene.getScene('Town') && window.__g.scene.getScene('Town').localBody, null, { timeout: 30000 });
  return { ctx, page, db, errors };
}

(async () => {
  // Text leftovers (static): no Town line talks about the old species any more.
  const src = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  const left = ['pond cats', 'Bored Ape', 'paw-bump', 'our paws', 'ruining my fur'].filter((w) => src.indexOf(w) >= 0);
  check('no NPC / villager line mentions the old species (pond cats, Bored Ape, paws, fur)', left.length === 0, left.join(', '));

  const browser = await chromium.launch();
  {
    const p = await open(browser, { width: 390, height: 844 }, true);
    const r = await p.page.evaluate(() => {
      const s = window.__g.scene.getScene('Town');
      const P = { cx: 260, cy: 600, rx: 150, ry: 90 }; // MAIN_POND
      const statues = s.children.list.filter((c) => c.pondStatue).map((c) => {
        const fx = c.x, fy = c.y + c.displayHeight / 2; // feet
        return { x: c.x, y: c.y, depth: c.depth, key: c.texture.key, inPond: ((fx - P.cx) / (P.rx + 12)) ** 2 + ((fy - P.cy) / (P.ry + 12)) ** 2 < 1 };
      });
      const grave = s.children.list.filter((c) => c.x > -20 && c.x < 140 && c.y > 640 && c.y < 760 && c.texture && /baked|__/.test(c.texture.key) === false);
      const px = Object.keys(s.textures.list).filter((k) => /^ffpx_/.test(k)).length;
      const specimens = (s.ffSpecimens || []).map((f) => f.sprite && f.sprite.texture.key).filter(Boolean);
      const cp = getComputedStyle(document.getElementById('chat-panel'));
      return { statues, px, pxMs: s.ffPixelizeMs, specimens: specimens.length, pxSpecimens: specimens.filter((k) => /^ffpx_/.test(k)).length,
        chatBorder: cp.borderTopWidth, chatShadow: cp.boxShadow, quiet: Array.isArray(s._quietLines), grave: grave.length };
    });
    check('phone: 3 pond statues', r.statues.length === 3, JSON.stringify(r.statues));
    check('phone: no pond statue stands in the water (feet outside the pond rim)', r.statues.every((t) => !t.inPond), JSON.stringify(r.statues));
    check('phone: statues depth-sort by their feet (not under the pond layer)', r.statues.every((t) => t.depth > t.y), JSON.stringify(r.statues));
    check('phone: 98 flora/fauna baked to ffpx_ textures', r.px === 98, String(r.px));
    check('phone: specimens draw the pixelized textures', r.specimens > 0 && r.pxSpecimens === r.specimens, JSON.stringify(r));
    check('phone: the chat stack has no frame of its own', r.chatBorder === '0px' && r.chatShadow === 'none', r.chatBorder + ' ' + r.chatShadow);
    // Graveyard: every tombstone draws above the plot.
    const g = await p.page.evaluate(() => {
      const s = window.__g.scene.getScene('Town');
      const objs = s.children.list.filter((c) => c.x !== undefined);
      const plot = objs.find((c) => c.type === 'Image' && Math.abs(c.x + c.width / 2 - 60) < 12 && c.width >= 140 && c.width < 160 && c.height >= 90 && c.height < 110);
      return { plot: plot ? plot.depth : null, deco: plot ? 'ok' : objs.filter((c) => c.type === 'Image' && Math.abs(c.y - 700) < 80 && c.x < 200).map((c) => [c.texture.key, c.x, c.y, c.width, c.height, c.depth]) };
    });
    check('phone: the graveyard plot is ground (depth below its tombstones at y 686..694)', g.plot !== null && g.plot < 686, JSON.stringify(g));
    // One guidance line at a time: the gate chip steps aside while the achievement toast (same top-centre spot) shows.
    const tg = await p.page.evaluate(async () => {
      const s = window.__g.scene.getScene('Town');
      const vis = () => !document.getElementById('gate-pointer').classList.contains('hidden');
      const before = vis();
      s.showAchievementToast('test toast');
      await new Promise((r) => setTimeout(r, 700));
      const during = vis();
      document.getElementById('achievement-toast').classList.add('hidden');
      await new Promise((r) => setTimeout(r, 700));
      return { before, during, after: vis() };
    });
    check('gate chip hides while the achievement toast shows, then comes back', tg.before && !tg.during && tg.after, JSON.stringify(tg));
    // First minute: a fresh player has the gate chip; ambient lines are held, then flushed when the gate is reached.
    const q = await p.page.evaluate(() => {
      const s = window.__g.scene.getScene('Town');
      const log = document.getElementById('chat-log');
      const n0 = log.children.length;
      s.addChatLine({ system: true, ambient: true, text: 'ambient test line' });
      const n1 = log.children.length;
      s.addChatLine({ system: true, text: 'direct reply line' });
      const n2 = log.children.length;
      s.markGateReached();
      const n3 = log.children.length;
      const texts = [...log.children].map((c) => c.textContent);
      return { n0, n1, n2, n3, quietAfter: s._quietLines, last: texts.slice(-2), gate: !document.getElementById('gate-pointer').classList.contains('hidden') };
    });
    check('first minute: held quietly while the gate chip guides', q.n1 === q.n0, JSON.stringify(q));
    check('first minute: a reply to the player is never held', q.n2 === q.n0 + 1, JSON.stringify(q));
    check('first minute: reaching the gate shows the held lines', q.n3 > q.n2 && q.quietAfter === null && /ambient test line/.test(q.last.join('|')), JSON.stringify(q));
    const pill = await p.page.evaluate(() => { const b = document.getElementById('walkie-talk-btn'); const r = b.getBoundingClientRect(); return { h: r.height, text: b.innerText.trim() }; });
    check('phone: no bestie yet -> the walkie pill is one short line', !/bestie/i.test(pill.text) && pill.h >= 44 && pill.h < 56, JSON.stringify(pill));
    // Net safety (design/bugbash/netsafety.md), all local: a 150-record presence flood draws at most 60 avatars, a freed slot is
    // refilled, the list rebuild is coalesced; invites from ids not in town / repeated within 10 s are ignored; hostile save fields.
    const n = await p.page.evaluate(async () => {
      const s = window.__g.scene.getScene('Town');
      let renders = 0; const orig = s.renderPlayerList.bind(s); s.renderPlayerList = () => { renders++; orig(); };
      // the real net handlers main.js registered (TownNet.emit, local only: nothing is written anywhere)
      const fire = (ev, arg) => { if (!s.net.handlers || typeof s.net.handlers[ev] !== 'function') return 0; s.net.emit(ev, arg); return 1; };
      let wired = 0;
      for (let i = 0; i < 150; i++) wired = fire('playerJoined', { id: 'ADMINflood' + i, name: 'ADMINflood' + i, species: 'hero_mage', frame: 0, x: 1200 + (i % 20) * 8, y: 600 + Math.floor(i / 20) * 8, facing: 1, score: 0 });
      if (!wired) for (let i = 0; i < 150; i++) { const q = { id: 'ADMINflood' + i, name: 'x', species: 'hero_mage', frame: 0, x: 1200, y: 600, facing: 1 }; s.allPlayers.set(q.id, q); s.addRemotePlayerCapped(q); s.scheduleRenderPlayerList(); }
      const drawn = s.remotePlayers.size;
      await new Promise((r) => setTimeout(r, 600));
      const firstDrawn = [...s.remotePlayers.keys()][0];
      if (wired) fire('playerLeft', firstDrawn); else { s.allPlayers.delete(firstDrawn); s.removeRemotePlayer(firstDrawn); s.fillRemoteSlot(); }
      const refilled = s.remotePlayers.size;
      s.showRealmInvite({ from: 'not-in-town', fromName: 'x', party: 'p1', mode: 'coop' });
      const strangerShown = !document.getElementById('realm-invite').classList.contains('hidden');
      const legacyTileset = s.safeTexture('baked_1', 0).key;
      return { wired, drawn, refilled, renders, strangerShown, legacyTileset, all: s.allPlayers.size };
    });
    check('flood: at most 60 remote avatars drawn for 150 records', n.drawn === 60 && n.all >= 150, JSON.stringify(n));
    check('flood: a freed slot is refilled from the waiting records', n.refilled === 60, JSON.stringify(n));
    check('flood: the player list is rebuilt a few times, not once per record', n.renders <= 3, JSON.stringify(n));
    check('invite from an id that is not in town is ignored', !n.strangerShown, JSON.stringify(n));
    check('a remote species can never be an arbitrary loaded texture', /^hero_/.test(n.legacyTileset), n.legacyTileset);
    // A11y landmarks + walkie contrast.
    const a = await p.page.evaluate(() => {
      const h1 = [...document.querySelectorAll('h1')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > 0 && r.bottom > 0 && getComputedStyle(e).display !== 'none' && !e.closest('.hidden'); });
      const w = getComputedStyle(document.getElementById('walkie-talk-btn'));
      return { main: !!document.querySelector('main,[role=main]'), h1: h1.map((e) => e.textContent), canvas: document.querySelector('#game-container canvas').getAttribute('aria-label') || '', op: w.opacity, color: w.color };
    });
    check('a11y: the town view is a main landmark with one heading and a labelled canvas', a.main && a.h1.length === 1 && /Hearthvale/.test(a.canvas), JSON.stringify(a));
    check('a11y: the idle walkie pill is fully opaque dark ink (was 2.45:1)', a.op === '1' && a.color === 'rgb(95, 87, 79)', JSON.stringify(a));
    check('phone: 0 console errors', p.errors.length === 0, p.errors.slice(0, 3).join(' | '));
    check('phone: 0 database requests', p.db.count() === 0);
    await p.ctx.close();
  }
  {
    const p = await open(browser, { width: 1280, height: 720 }, false, '?pixelize=0');
    const r = await p.page.evaluate(() => {
      const s = window.__g.scene.getScene('Town');
      return { px: Object.keys(s.textures.list).filter((k) => /^ffpx_/.test(k)).length, keys: (s.ffSpecimens || []).slice(0, 5).map((f) => f.sprite.texture.key) };
    });
    check('?pixelize=0: no ffpx_ textures, the SVG art stays', r.px === 0 && r.keys.length > 0 && r.keys.every((k) => /^ff_/.test(k)), JSON.stringify(r));
    // Shared Settings panel (mm-settings.js): a More entry opens it, the Town stops acting behind it, changes reach the Town live.
    const st = await p.page.evaluate(async () => {
      const s = window.__g.scene.getScene('Town');
      const btn = document.getElementById('town-settings-btn');
      if (!btn) return { btn: false };
      btn.click();
      await new Promise((r) => setTimeout(r, 100));
      const dlg = document.getElementById('mmset');
      const open = !!dlg && !dlg.hidden;
      const blocked = !s.canAct();
      const before = document.body.classList.contains('a11y-reduce-motion');
      MMSettings.set(localStorage, 'reduce-motion', true);
      window.dispatchEvent(new CustomEvent('mm-settings-change', { detail: { id: 'reduce-motion', value: true } }));
      const after = document.body.classList.contains('a11y-reduce-motion');
      MMSettings.set(localStorage, 'reduce-motion', false);
      window.dispatchEvent(new CustomEvent('mm-settings-change', { detail: { id: 'reduce-motion', value: false } }));
      s.sharedSettings.close();
      return { btn: true, inMore: !!btn.closest('#settings-section'), open, blocked, before, after, actsAgain: s.canAct() };
    });
    check('settings: a "Settings" entry sits in the More section', st.btn && st.inMore, JSON.stringify(st));
    check('settings: it opens the shared panel and the Town does not act behind it', st.open && st.blocked && st.actsAgain, JSON.stringify(st));
    check('settings: reduced motion from the panel reaches the Town live', !st.before && st.after, JSON.stringify(st));
    check('?pixelize=0: 0 console errors', p.errors.length === 0, p.errors.slice(0, 3).join(' | '));
    await p.ctx.close();
  }
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exitCode = 1; });
