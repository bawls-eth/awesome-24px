// R4-D2 owner decision O-10: the Town statue is the "Founder's Statue": a stone hero (no ape, no "Mayor"), at the same 1x pixel scale as
// the player (b12-r2-05: was a 2.3x sprite), on a baked plinth, label with a hero emoji; the world map node is renamed too.
// OFFLINE ONLY (offlineStub + joinOffline as ADMINr4d2): 0 DB writes, never chats. Desktop 1280x720 and phone 390x844.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/r4-d2-statue.test.js
const { chromium } = require('playwright');
const { check, done, offlineStub, exposeGame, joinOffline } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const MAP = require('../shared/mm-map.js');

(async () => {
  const browser = await chromium.launch(); const errs = [];
  for (const vp of [{ width: 1280, height: 720 }, { width: 390, height: 844, mobile: true }]) {
    const ctx = await browser.newContext(vp.mobile ? { viewport: { width: vp.width, height: vp.height }, isMobile: true, hasTouch: true } : { viewport: vp });
    const db = await offlineStub(ctx);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errs.push(e.message));
    await exposeGame(page);
    await page.goto(BASE);
    await joinOffline(page, 'ADMINr4d2');
    const r = await page.evaluate(() => {
      const s = window.__g.scene.getScene('Town');
      const st = s.founderStatue;
      const texts = s.children.list.filter((o) => o.type === 'Text').map((o) => o.text);
      return {
        has: !!st, key: st && st.texture.key, scale: st && [st.scaleX, st.scaleY], h: st && st.displayHeight, ph: s.localVisual.displayHeight,
        npc: [s.npcSprite, s.npc2Sprite, s.merchantSprite, s.graveZombie].map((o) => (o ? o.scaleX : null)),
        ff: (() => { const o = {}; (s.ffSpecimens || []).forEach((f) => { if (!o[f.id]) o[f.id] = Math.round(f.sprite.displayHeight); }); return o; })(),
        label: texts.filter((t) => /Statue/.test(t)), mayor: texts.filter((t) => /Mayor|🐵/.test(t)), apes: s.children.list.filter((o) => o.texture && o.texture.key === 'boredapes').length,
      };
    });
    check(vp.width + ': Founder\'s Statue is a stone hero sprite (mooncats stone alias), not the ape', r.has && r.key === 'mooncats' && r.apes === 0, JSON.stringify(r));
    check(vp.width + ': statue at the player\'s pixel scale (1x, same display height as the hero)', r.scale && r.scale[0] === 1 && r.scale[1] === 1 && r.h === r.ph, JSON.stringify(r));
    check(vp.width + ': label reads "🦸 Founder\'s Statue"; no "Mayor" / monkey label left', r.label.indexOf("🦸 Founder's Statue") >= 0 && r.mayor.length === 0, JSON.stringify(r.label.concat(r.mayor)));
    check(vp.width + ': W-06 one pixel scale: Professor, dock resident, merchant and graveyard zombie at 1x (were 1.8-2x)', r.npc.every((v) => v === 1), JSON.stringify(r.npc));
    const f = r.ff; const fauna = ['fox', 'deer', 'butterfly', 'frog', 'caribou'].filter((k) => f[k]);
    check(vp.width + ': W-06 wildlife scale table: fox ~hero height (22-27 px), deer / caribou <= 32 px, butterfly / frog <= 16 px (were 56 / 68 / 32 px)',
      fauna.length >= 3 && (!f.fox || (f.fox >= 22 && f.fox <= 27)) && (!f.deer || f.deer <= 32) && (!f.caribou || f.caribou <= 32) && (!f.butterfly || f.butterfly <= 16) && (!f.frog || f.frog <= 16), JSON.stringify({ hero: r.ph, f: fauna.map((k) => k + ':' + f[k]) }));
    check(vp.width + ': flora keeps its size (oak tree 88 px)', !f.oak_tree || f.oak_tree === 88, String(f.oak_tree));
    check(vp.width + ': no database traffic', db.attempts() === 0, String(db.attempts()));
    await ctx.close();
  }
  { // ?npcscale=classic restores the old NPC sizes
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } }); await offlineStub(ctx);
    const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message)); await exposeGame(page);
    await page.goto(BASE + '?npcscale=classic'); await joinOffline(page, 'ADMINr4d2');
    const c = await page.evaluate(() => { const s = window.__g.scene.getScene('Town'); return [s.npcSprite, s.npc2Sprite, s.merchantSprite, s.graveZombie].map((o) => (o ? o.scaleX : null)); });
    check('?npcscale=classic: the old 2 / 2 / 1.8 / 1.8 scales', JSON.stringify(c) === '[2,2,1.8,1.8]', JSON.stringify(c));
    await ctx.close();
  }
  const nodes = (MAP.NODES || MAP.nodes || (MAP.build ? MAP.build() : [])) || [];
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'shared', 'mm-map.js'), 'utf8');
  check('world map node w1-castle is "Founder\'s Statue"', /N\('w1-castle', 'castle', 36, 20, "Founder's Statue"\)/.test(src) && !/Mayor/.test(src), nodes.length);
  check('no page errors', errs.length === 0, errs.join(' | '));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
