// Cycle 2 art (G): emoji glyphs inside Town world labels ("🏠 Shop", "🏛️ Museum", "📬 Mailbox", "🔨 Workbench", "📖 Guestbook",
// "🥬 Turnips", "🌀 Realm Gate", "🏡 Home") are replaced by code-drawn 16 px MMPixelIcons images beside the word (house, museum, mail,
// hammer, book, turnip, realm). Labels a test pins with their glyph (Founder's Statue, Isles sign) keep it. ?worldicons=0 = old labels.
// Serve the repo root first:  python3 -m http.server 8440 &
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc2-art-town-label-icons.test.js
// Firebase blocked (offlineStub), offline join as an ADMIN bot, nothing written to any DB.
const { chromium } = require('playwright');
const { check, done, offlineStub, exposeGame, joinOffline } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');

async function sample(browser, q, vp) {
  const ctx = await browser.newContext({ viewport: vp || { width: 1280, height: 720 } });
  const db = await offlineStub(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await exposeGame(page);
  await page.goto(ORIGIN + '/game/index.html' + (q || ''));
  await joinOffline(page, 'ADMINcyc2lbl');
  const r = await page.evaluate(() => {
    const s = window.__g.scene.getScene('Town'), st = s.worldIcons || { on: false, labels: [] };
    const emo = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
    const texts = s.children.list.filter((o) => o.type === 'Text' && o.scrollFactorX === 1).map((o) => o.text);
    const find = (w) => texts.filter((t) => t.indexOf(w) >= 0);
    const labels = st.labels.map((l) => {
      const o = l.obj, i = l.icon, f = i.frame, tex = i.texture.getSourceImage();
      let opaque = 0; try { const d = tex.getContext('2d').getImageData(0, 0, 16, 16).data; for (let k = 3; k < d.length; k += 4) if (d[k] === 255) opaque++; } catch (e) { opaque = -1; }
      const oL = o.x - o.displayWidth * o.originX, iR = i.x + i.displayWidth / 2;
      return { id: l.id, text: o.text, emoji: emo.test(o.text.replace(/ ❗\d*$/u, '')), w: f.width, h: f.height, scale: i.scaleX, opaque, gap: Math.round(oL - iR), dy: Math.round(Math.abs(i.y - (o.y + o.displayHeight * (0.5 - o.originY)))), depth: i.depth === o.depth, vis: i.visible === o.visible };
    });
    // a later setText keeps the icon and strips the glyph again (the mailbox count path)
    let mail = null;
    if (s.mailboxLabel && s.mailboxLabel.pxIcon) { s.mailboxLabel.setText('📬 Mailbox ❗3'); mail = { text: s.mailboxLabel.text, icon: s.mailboxLabel.pxIcon.visible }; s.refreshMailbox && s.refreshMailbox(); }
    return { on: st.on, ms: st.ms, labels, statue: find("Founder's Statue"), isles: find('Isles'), shop: find('Shop'), museum: find('Museum'), mail };
  });
  await ctx.close();
  return Object.assign(r, { errors, attempts: db.attempts() });
}

(async () => {
  const browser = await chromium.launch();
  const on = await sample(browser, '');
  const ids = on.labels.map((l) => l.id);
  check('pass ran and converted >= 7 world labels', on.on && on.labels.length >= 7, JSON.stringify(on.labels.map((l) => l.id + ':' + l.text)));
  check('house, museum, mail, hammer, book, turnip and realm icons all used', ['house', 'museum', 'mail', 'hammer', 'book', 'turnip', 'realm'].every((k) => ids.indexOf(k) >= 0), JSON.stringify(ids));
  check('converted labels hold no emoji glyph (except the pinned mailbox ❗N marker)', on.labels.every((l) => !l.emoji && l.text.length > 0), JSON.stringify(on.labels.filter((l) => l.emoji)));
  check('every icon is a 16x16 code-drawn texture at 1x with >= 60 opaque px', on.labels.every((l) => l.w === 16 && l.h === 16 && l.scale === 1 && l.opaque >= 60), JSON.stringify(on.labels.filter((l) => !(l.w === 16 && l.scale === 1 && l.opaque >= 60))));
  check('icon sits 0-2 px left of its word, vertically centred (<= 1 px), same depth and visibility', on.labels.every((l) => l.gap >= 0 && l.gap <= 2 && l.dy <= 1 && l.depth && l.vis), JSON.stringify(on.labels.filter((l) => !(l.gap >= 0 && l.gap <= 2 && l.dy <= 1 && l.depth && l.vis))));
  check('Shop and Museum labels read as words', on.shop.indexOf('Shop') >= 0 && on.museum.indexOf('Museum') >= 0, JSON.stringify([on.shop, on.museum]));
  check("pinned glyph labels untouched: 🦸 Founder's Statue and ⛵ Isles", on.statue.some((t) => t.indexOf("🦸 Founder's Statue") >= 0) && on.isles.indexOf('⛵ Isles') >= 0, JSON.stringify([on.statue, on.isles]));
  check('a later setText strips the glyph again and keeps the icon', on.mail && on.mail.text === 'Mailbox ❗3' && on.mail.icon, JSON.stringify(on.mail));
  check('one-off create cost < 60 ms', on.ms < 60, on.ms.toFixed(1) + ' ms');
  const ph = await sample(browser, '', { width: 390, height: 844 });
  check('phone 390x844: same labels converted', ph.labels.length === on.labels.length, ph.labels.length + ' vs ' + on.labels.length);
  const off = await sample(browser, '?worldicons=0');
  check('?worldicons=0: no conversion, the emoji labels as before', !off.on && off.labels.length === 0 && off.shop.indexOf('🏠 Shop') >= 0 && off.museum.some((t) => /🏛/.test(t)), JSON.stringify([off.shop, off.museum]));
  check('no page errors', [on, ph, off].every((r) => r.errors.length === 0), [on, ph, off].map((r) => r.errors.join(' | ')).join(' '));
  check('offline: db.attempts() === 0', on.attempts === 0 && ph.attempts === 0 && off.attempts === 0, [on.attempts, ph.attempts, off.attempts].join(','));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
