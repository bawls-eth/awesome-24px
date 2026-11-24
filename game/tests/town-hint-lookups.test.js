// cycle1 L-09 (perf): the Town update() looked up five hint elements with getElementById on EVERY frame (dig-hole-hint,
// realm-gate-hint, gate-pointer, fish-hint-btn, gift-hint-btn), toggled their class every frame, and near a villager built the
// gift label (template + map + join) and wrote style.opacity every frame. Now the elements are kept, the class is touched only
// when it changes and the gift label is built once per villager. This counts the lookups over 120 idle frames and proves the
// hints still show and hide.
// OFFLINE: helpers.offlineStub (database blocked, Firebase SDK answered empty). Never chats, never writes to Firebase.
// Run: BASE=http://localhost:9711/game/index.html NODE_PATH=$(npm root -g) node game/tests/town-hint-lookups.test.js
const { chromium } = require('playwright');
const { check, done, offlineStub, exposeGame, joinOffline } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const IDS = ['dig-hole-hint', 'realm-gate-hint', 'gate-pointer', 'fish-hint-btn', 'gift-hint-btn'];
const FRAMES = 120;

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  const db = await offlineStub(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await exposeGame(page);
  await page.goto(BASE);
  await joinOffline(page, 'ADMINhint');
  await page.waitForTimeout(800);

  // count lookups / class toggles / opacity writes on the five hint elements over N Town updates, standing at (x, y)
  const probe = (where) => page.evaluate(([IDS, FRAMES, where]) => new Promise((res) => {
    const s = window.__g.scene.getScene('Town');
    let vil = null;
    if (where === 'villager') { vil = VILLAGERS[0]; const p = s.villagerPos(vil); where = { x: p.x + 6, y: p.y + 6 }; }
    if (where) { s.localBody.x = where.x; s.localBody.y = where.y; if (s.localBody.body && s.localBody.body.reset) s.localBody.body.reset(where.x, where.y); }
    const n = { look: {}, lookups: 0, toggles: 0, labels: 0, frames: 0 };
    if (vil) { s._giftHintFor = null; vil.likes.map = function (f) { n.labels++; return Array.prototype.map.call(this, f); }; } // one map() per label build
    const els = IDS.map((id) => document.getElementById(id));
    const ge = Document.prototype.getElementById;
    Document.prototype.getElementById = function (id) { if (IDS.indexOf(id) >= 0) { n.lookups++; n.look[id] = (n.look[id] || 0) + 1; } return ge.call(this, id); };
    const tg = DOMTokenList.prototype.toggle;
    DOMTokenList.prototype.toggle = function (c, f) { if (els.some((e) => e && e.classList === this)) n.toggles++; return tg.call(this, c, f); };
    const upd = s.sys.sceneUpdate; s.sys.sceneUpdate = function (t, d) { n.frames++; return upd.call(this, t, d); }; // Phaser calls this copy of update()
    let raf = 0;
    const step = () => {
      if (n.frames < FRAMES && ++raf < FRAMES * 20) return requestAnimationFrame(step);
      Document.prototype.getElementById = ge; DOMTokenList.prototype.toggle = tg; s.sys.sceneUpdate = upd;
      if (vil) delete vil.likes.map;
      n.hidden = {}; IDS.forEach((id, i) => { n.hidden[id] = els[i] ? els[i].classList.contains('hidden') : null; });
      n.giftText = els[4] ? els[4].textContent : null; n.giftOpacity = els[4] ? els[4].style.opacity : null;
      res(n);
    };
    requestAnimationFrame(step);
  }), [IDS, FRAMES, where]);

  // 1. idle in an empty spot
  const idle = await probe({ x: 420, y: 980 });
  console.log('idle, ' + idle.frames + ' updates: ' + JSON.stringify(idle));
  check('the probe saw ' + FRAMES + ' Town updates', idle.frames >= FRAMES, JSON.stringify(idle));
  check('all five hint elements exist', Object.values(idle.hidden).every((h) => h !== null), JSON.stringify(idle.hidden));
  check('idle: no per-frame getElementById for the five hints (was 5 per frame = ' + 5 * FRAMES + ')', idle.lookups <= 5, JSON.stringify(idle.look));
  check('idle: the hint classes are not toggled every frame (was 4 per frame)', idle.toggles <= 8, 'toggles=' + idle.toggles);

  // 2. behaviour: the dig-hole and Realm-gate hints still appear near their spot and go away again
  const dig = await probe({ x: 1200, y: 470 });
  check('near the dig hole the hint shows', dig.hidden['dig-hole-hint'] === false, JSON.stringify(dig.hidden));
  check('near the dig hole: still no per-frame lookups', dig.lookups <= 5, JSON.stringify(dig.look));
  const gate = await probe({ x: 750, y: 300 });
  check('near the Realm gate its hint shows and the dig hint is hidden again', gate.hidden['realm-gate-hint'] === false && gate.hidden['dig-hole-hint'] === true, JSON.stringify(gate.hidden));

  // 3. next to a villager: the gift button shows the right label, built once, not once per frame
  const vil = await probe('villager');
  console.log('near a villager, ' + vil.frames + ' updates: ' + JSON.stringify(vil));
  const want = await page.evaluate(() => { const s = window.__g.scene.getScene('Town'); const v = s.findNearestVillager(); return v ? { label: `🎁 Gift ${v.name} ${v.likes.map((k) => VILLAGER_GIFT_ICONS[k] || k).join('')}`, has: v.likes.some((k) => (s.resources[k] || 0) > 0), likes: v.likes } : null; });
  check('near a villager the gift button shows', !!want && vil.hidden['gift-hint-btn'] === false, JSON.stringify([want, vil.hidden]));
  check('the gift label is unchanged ("🎁 Gift <name> <icons>")', !!want && vil.giftText === want.label, JSON.stringify([vil.giftText, want]));
  check('the gift button is dimmed when the bag has nothing they like', !!want && vil.giftOpacity === (want.has ? '' : '0.6'), JSON.stringify([vil.giftOpacity, want]));
  check('near a villager: no per-frame lookups', vil.lookups <= 5, JSON.stringify(vil.look));
  check('near a villager: the gift label is built once, not every frame (was 1 per frame)', vil.labels >= 0 && vil.labels <= 1, 'label builds=' + vil.labels);
  // the dim follows the bag
  const dim = await page.evaluate(async (likes) => {
    const s = window.__g.scene.getScene('Town'); const b = document.getElementById('gift-hint-btn'); const k = likes[0]; const was = s.resources[k] || 0;
    const frames = (n) => new Promise((r) => { const f = () => (n-- > 0 ? requestAnimationFrame(f) : r()); f(); });
    s.resources[k] = 1; await frames(4); const lit = b.style.opacity;
    s.resources[k] = 0; await frames(4); const dimmed = b.style.opacity;
    s.resources[k] = was; await frames(4);
    return { lit, dimmed };
  }, want ? want.likes : ['wood']);
  check('the dim follows the bag live (lit with a liked item, dimmed without)', dim.lit === '' && dim.dimmed === '0.6', JSON.stringify(dim));
  const away = await probe({ x: 420, y: 980 });
  check('walking away hides the gift button and the gate hint', away.hidden['gift-hint-btn'] === true && away.hidden['realm-gate-hint'] === true, JSON.stringify(away.hidden));

  check('no page errors', errors.length === 0, errors.join(' | '));
  check('offline: no database request was attempted', db.attempts() === 0, JSON.stringify(db.http.concat(db.ws).slice(0, 3)));
  await browser.close();
  done();
})();
