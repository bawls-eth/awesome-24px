// Cycle 3 art (G): the remaining emoji world labels get code-drawn MMPixelIcons too (🎲 Polyroll -> dice, 🕹️ Arcade District ->
// joystick, 🪦 Old Graveyard -> grave, 🌾 Old Windmill -> wheat, 👗 Able Sisters -> dress, ⛏️ Hole -> pickaxe, 🛒 Mystery Merchant
// -> cart, 🦋 BUG-OFF -> bugs, 🧪 Professor Byte -> flask). Multi-line signs (Bug-Off, merchant) use the cycle-2 geometry (icon left of the text box, centred on it,
// as cyc2-art-town-label-icons pins for the fish tourney). Pinned
// glyphs stay: 🦸 Founder's Statue, ⛵ Isles, the mailbox ❗N marker, and the 🚪 portal doors (beta-r4-doors finds them by /^🚪/).
// Serve the repo root first:  python3 -m http.server 8440 &
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc3-art-town-label-icons.test.js
// Firebase blocked (offlineStub), offline join as an ADMIN bot, nothing written to any DB.
const { chromium } = require('playwright');
const { check, done, offlineStub, exposeGame, joinOffline } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const NEW = ['dice', 'joystick', 'grave', 'wheat', 'dress', 'pickaxe', 'cart', 'bugs', 'flask'];

async function sample(browser, q, vp) {
  const ctx = await browser.newContext({ viewport: vp || { width: 1280, height: 720 } });
  const db = await offlineStub(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await exposeGame(page);
  await page.goto(ORIGIN + '/game/index.html' + (q || ''));
  await joinOffline(page, 'ADMINcyc3lbl');
  const r = await page.evaluate(() => {
    const s = window.__g.scene.getScene('Town'), st = s.worldIcons || { on: false, labels: [] };
    const emo = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
    const texts = s.children.list.filter((o) => o.type === 'Text' && o.scrollFactorX === 1).map((o) => o.text);
    const labels = st.labels.map((l) => {
      const o = l.obj, i = l.icon, lines = String(o.text).split('\n');
      let opaque = 0; try { const d = i.texture.getSourceImage().getContext('2d').getImageData(0, 0, 16, 16).data; for (let k = 3; k < d.length; k += 4) if (d[k] === 255) opaque++; } catch (e) { opaque = -1; }
      const oL = o.x - o.displayWidth * o.originX;
      return { id: l.id, text: o.text, multi: lines.length > 1, emoji: emo.test(o.text.replace(/ ❗\d*$/u, '')), w: i.frame.width, scale: i.scaleX, opaque,
        gap0: Math.round(oL - (i.x + i.displayWidth / 2)), dy0: Math.round(Math.abs(i.y - (o.y + o.displayHeight * (0.5 - o.originY)))), depth: i.depth === o.depth, vis: i.visible === o.visible };
    });
    let mer = null;
    if (s.merchantSign && s.merchantSign.pxIcon) { s.merchantSign.setText('🛒 closed — back at 9:00 today'); mer = { text: s.merchantSign.text, icon: s.merchantSign.pxIcon.visible }; s.refreshMerchantSign(); }
    return { on: st.on, ms: st.ms, labels, doors: texts.filter((t) => /^🚪 /.test(t)), statue: texts.filter((t) => /^🦸 Founder/.test(t)), isles: texts.filter((t) => t === '⛵ Isles'),
      polyroll: texts.filter((t) => /Polyroll/.test(t)), windmill: texts.filter((t) => /Old Windmill/.test(t)), bug: s.bugOffSignText && s.bugOffSignText.text, mer };
  });
  await ctx.close();
  return Object.assign(r, { errors, attempts: db.attempts() });
}

(async () => {
  const browser = await chromium.launch();
  const on = await sample(browser, '');
  const ids = on.labels.map((l) => l.id);
  check('all 9 new icon ids (incl. flask for Professor Byte) are used by world labels', NEW.every((k) => ids.indexOf(k) >= 0), JSON.stringify(ids));
  check('>= 19 labels converted in total (cycle 2 set + cycle 3 set)', on.labels.length >= 19, String(on.labels.length));
  const nl = on.labels.filter((l) => NEW.indexOf(l.id) >= 0);
  check('new labels hold no emoji glyph and are 16x16 at 1x with >= 80 opaque px', nl.every((l) => !l.emoji && l.w === 16 && l.scale === 1 && l.opaque >= 80), JSON.stringify(nl.filter((l) => !(!l.emoji && l.w === 16 && l.opaque >= 80))));
  const multi = on.labels.filter((l) => l.multi);
  check('multi-line signs (Bug-Off, tourney, merchant) are converted', ['bugs', 'angler', 'cart'].every((k) => multi.some((l) => l.id === k)), JSON.stringify(multi.map((l) => l.id)));
  check('every icon sits 0-2 px left of its text box, vertically centred (<= 1 px), same depth and visibility', on.labels.every((l) => l.gap0 >= 0 && l.gap0 <= 2 && l.dy0 <= 1 && l.depth && l.vis), JSON.stringify(on.labels.filter((l) => !(l.gap0 >= 0 && l.gap0 <= 2 && l.dy0 <= 1 && l.depth && l.vis))));
  check('Bug-Off sign reads "BUG-OFF" on its first line, glyph gone', /^BUG-OFF\n/.test(on.bug || ''), JSON.stringify(on.bug));
  check('merchant setText keeps the cart icon and strips the glyph', on.mer && on.mer.text === 'closed — back at 9:00 today' && on.mer.icon, JSON.stringify(on.mer));
  check('pinned glyphs kept: 4 🚪 doors, 🦸 statue, ⛵ Isles', on.doors.length === 4 && on.statue.length >= 1 && on.isles.length === 1, JSON.stringify([on.doors, on.statue, on.isles]));
  check('one-off create cost < 80 ms', on.ms < 80, on.ms.toFixed(1) + ' ms');
  const ph = await sample(browser, '', { width: 390, height: 844 });
  check('phone 390x844: same labels converted', ph.labels.length === on.labels.length, ph.labels.length + ' vs ' + on.labels.length);
  const off = await sample(browser, '?worldicons=0');
  check('?worldicons=0: old glyph labels', !off.on && off.labels.length === 0 && off.polyroll.indexOf('🎲 Polyroll') >= 0 && off.windmill.indexOf('🌾 Old Windmill') >= 0 && /^🦋 BUG-OFF/.test(off.bug || ''), JSON.stringify([off.polyroll, off.windmill, off.bug]));
  check('no page errors', [on, ph, off].every((r) => r.errors.length === 0), [on, ph, off].map((r) => r.errors.join(' | ')).join(' '));
  check('offline: db.attempts() === 0', on.attempts === 0 && ph.attempts === 0 && off.attempts === 0, [on.attempts, ph.attempts, off.attempts].join(','));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
