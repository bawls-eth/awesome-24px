// Cycle 16 G: the tarantula (a land animal still on its SVG) is original code art in shared/mm-town-fauna.js, baked 1:1 at 16 px with a true
// profile and a true front view (head at the bottom, legs splayed), 2 frames per action. Cull budget: it has 5 land specimens, so wiring it by
// default would add 5 animated Sprites per cull pass (measured 197.5 -> 209.6 with the daddy longlegs also staged); it is STAGED like the daddy longlegs:
// wired only with ?ffstaged=1; without it (and with ?ffstrips=0) the species keeps its SVG and the Town sprite count does not change.
// Run: BASE=http://localhost:9103/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc16-art-tarantula.test.js   (SHOTS=<dir> saves a 1280x720 zoom)
// OFFLINE (offlineStub), ADMIN bot, literal 0 database attempts.
const { chromium } = require('playwright');
const { check, done, offlineStub, exposeGame, joinOffline } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const SHOTS = process.env.SHOTS || '';

async function sample(browser, q) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const db = await offlineStub(ctx); const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await exposeGame(page);
  await page.goto(ORIGIN + '/game/index.html' + q);
  await joinOffline(page, 'ADMINcyc16tar');
  await page.waitForTimeout(700);
  const r = await page.evaluate(() => {
    const s = window.__g.scene.getScene('Town'); const k = 'fft_tarantula';
    const sp = s.ffSpecimens.filter((p) => p.id === 'tarantula');
    const out = { n: sp.length, types: sp.map((p) => p.sprite.type), tex: sp.map((p) => p.sprite.texture.key), ids: s.ffStrips ? s.ffStrips.ids.slice() : [], cell: s.ffStrips && s.ffStrips.cells.tarantula };
    if (!s.textures.exists(k)) return out;
    const tex = s.textures.get(k), cv = tex.getSourceImage(), g = cv.getContext('2d');
    const fr = (name) => { const f = tex.get(name); return { w: f.cutWidth, h: f.cutHeight, d: Array.from(g.getImageData(f.cutX, f.cutY, f.cutWidth, f.cutHeight).data) }; };
    const st = (a) => {
      let y0 = 99, y1 = -1, x0 = 99, x1 = -1, semi = 0, eyes = 0; const cols = new Set();
      for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) {
        const i = (y * a.w + x) * 4, A = a.d[i + 3]; if (A > 0 && A < 255) semi++; if (A !== 255) continue;
        y0 = Math.min(y0, y); y1 = Math.max(y1, y); x0 = Math.min(x0, x); x1 = Math.max(x1, x); cols.add((a.d[i] << 16) | (a.d[i + 1] << 8) | a.d[i + 2]);
        if (a.d[i] === 0x14 && a.d[i + 1] === 0x12 && a.d[i + 2] === 0x18) eyes++;
      }
      return { w: a.w, h: a.h, y1, wid: x1 - x0 + 1, hei: y1 - y0 + 1, semi, eyes, colours: cols.size };
    };
    const same = (a, b) => a.d.join() === b.d.join();
    out.px = { R0: st(fr('idle_right_0')), D0: st(fr('idle_down_0')) };
    out.distinct = { idleR: !same(fr('idle_right_0'), fr('idle_right_1')), moveR: !same(fr('move_right_0'), fr('move_right_1')), idleD: !same(fr('idle_down_0'), fr('idle_down_1')), moveD: !same(fr('move_down_0'), fr('move_down_1')), frontNotProfile: !same(fr('idle_right_0'), fr('idle_down_0')) };
    out.anims = ['idle_right', 'idle_down', 'move_right', 'move_down'].map((a) => !!s.anims.get(k + '_' + a));
    return out;
  });
  return { r, errors, db: db.attempts(), page, ctx };
}

(async () => {
  const browser = await chromium.launch();
  const D = await sample(browser, ''); await D.ctx.close();
  check('default: tarantula keeps its SVG (staged: not baked, no Sprites, not in ffStrips)', D.r.n === 5 && !D.r.ids.includes('tarantula') && !D.r.tex.some((t) => t === 'fft_tarantula') && D.r.types.every((t) => t !== 'Sprite'), JSON.stringify(D.r));
  check('default: salamander is still the only converted forest-floor strip (Town sprite count unchanged)', D.r.ids.includes('salamander') && !D.r.ids.includes('daddy_longlegs'), JSON.stringify(D.r.ids));
  check('default: 0 database attempts, no page errors', D.db === 0 && D.errors.length === 0, D.db + ' ' + D.errors.join('|'));
  const O = await sample(browser, '?ffstrips=0'); await O.ctx.close();
  check('?ffstrips=0: tarantula stays on its SVG', O.r.n === 5 && !O.r.ids.includes('tarantula') && O.r.types.every((t) => t !== 'Sprite'), JSON.stringify(O.r));
  const S = await sample(browser, '?ffstaged=1'); const r = S.r;
  check('?ffstaged=1: 5 tarantula specimens are animated Sprites on fft_tarantula, cell 16', r.n === 5 && r.types.every((t) => t === 'Sprite') && r.tex.every((t) => t === 'fft_tarantula') && r.cell === 16, JSON.stringify({ n: r.n, types: r.types, cell: r.cell }));
  check('?ffstaged=1: 16 x 16 frames, 1:1 (no semi-transparent pixels), >= 7 colours, two eye pixels, feet reach the ground area', !!r.px && [r.px.R0, r.px.D0].every((p) => p.w === 16 && p.h === 16 && p.semi === 0 && p.colours >= 7 && p.eyes >= 2 && p.y1 >= 13), JSON.stringify(r.px));
  check('?ffstaged=1: profile is wider than tall; the front view is not the profile', !!r.px && r.px.R0.wid >= 13 && r.px.R0.hei <= 14 && r.distinct.frontNotProfile, JSON.stringify([r.px && r.px.R0, r.distinct]));
  check('?ffstaged=1: every action has two distinct frames and an animation', !!r.distinct && r.distinct.idleR && r.distinct.moveR && r.distinct.idleD && r.distinct.moveD && r.anims.every(Boolean), JSON.stringify([r.distinct, r.anims]));
  if (SHOTS) {
    await S.page.evaluate(() => { const s = window.__g.scene.getScene('Town'); const t = s.ffSpecimens.find((p) => p.id === 'tarantula'); s.cameras.main.stopFollow(); s.cameras.main.centerOn(t.sprite.x, t.sprite.y); s.cameras.main.setZoom(6); });
    await S.page.waitForTimeout(600);
    await S.page.screenshot({ path: require('path').join(SHOTS, 'cyc16-art-tarantula-1280x720.jpg'), type: 'jpeg', quality: 80 });
  }
  check('?ffstaged=1: 0 database attempts, no page errors', S.db === 0 && S.errors.length === 0, S.db + ' ' + S.errors.join('|'));
  await S.ctx.close();
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exitCode = 1; });
