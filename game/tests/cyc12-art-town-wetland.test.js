// Cycle 12 art (G): (1) the four most-seen pond / meadow pixelized SVGs (frog, snake, trout, catfish) draw the Codex T13 strips
// (6da71ca, staged since 2026-11-23, reviewed + accepted this cycle), baked at half native size (32 -> 16 px cell, the hero's pixel
// density) with idle / move in right + down; T13 has no caught_down strip, so caught_down_0 aliases the profile caught pose;
// (2) the code squirrel has a true front view (idle_down / move_down maps) instead of the profile reused. ?ffstrips=0 keeps the SVG.
// Serve the repo root first:  python3 -m http.server 8440 &
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc12-art-town-wetland.test.js
// Firebase blocked (offlineStub), offline join as an ADMIN bot, nothing written to any DB.
const { chromium } = require('playwright');
const { check, done, offlineStub, exposeGame, joinOffline } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const T13 = ['frog', 'snake', 'trout', 'catfish'];

async function sample(browser, q) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const db = await offlineStub(ctx);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await exposeGame(page);
  await page.goto(ORIGIN + '/game/index.html' + (q || ''));
  await joinOffline(page, 'ADMINcyc12fauna');
  await page.waitForFunction(() => window.__g && window.__g.scene.getScene('Town') && window.__g.scene.getScene('Town').localBody, null, { timeout: 30000 });
  await page.waitForTimeout(500);
  const r = await page.evaluate(async (T13) => {
    const s = window.__g.scene.getScene('Town'); const st = s.ffStrips || null;
    const by = (id) => s.ffSpecimens.filter((p) => p.id === id);
    const desc = (id) => by(id).map((p) => ({ type: p.sprite.type, tex: p.sprite.texture.key, w: Math.round(p.sprite.displayWidth), strip: !!p.strip }));
    const out = { st: st ? { on: st.on, ids: st.ids.slice(), cells: Object.assign({}, st.cells), ms: st.ms, thumbs: Object.keys(st.thumbUrl || {}) } : null, sp: {}, px: {}, anims: {} };
    T13.concat(['squirrel']).forEach((id) => { out.sp[id] = desc(id); });
    const grab = (id, frame) => {
      const tex = s.textures.get(`fft_${id}`); if (!tex.has(frame)) return null; const fr = tex.get(frame); const cv = tex.getSourceImage();
      return { w: fr.cutWidth, h: fr.cutHeight, d: Array.from(cv.getContext('2d').getImageData(fr.cutX, fr.cutY, fr.cutWidth, fr.cutHeight).data) };
    };
    const stats = (a) => {
      let y0 = 99, y1 = -1, x0 = 99, x1 = -1, semi = 0, n = 0, dark = 0; const cols = new Set();
      for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) {
        const i = (y * a.w + x) * 4; if (a.d[i + 3] > 0 && a.d[i + 3] < 255) semi++;
        if (a.d[i + 3] === 255) { n++; y0 = Math.min(y0, y); y1 = Math.max(y1, y); x0 = Math.min(x0, x); x1 = Math.max(x1, x); cols.add((a.d[i] << 16) | (a.d[i + 1] << 8) | a.d[i + 2]); }
      }
      return { h: y1 - y0 + 1, wid: x1 - x0 + 1, n, colours: cols.size, semi };
    };
    T13.forEach((id) => {
      if (!s.textures.exists(`fft_${id}`)) return;
      const tex = s.textures.get(`fft_${id}`);
      const mv = [0, 1, 2, 3].map((f) => grab(id, `move_right_${f}`)).filter(Boolean).map((a) => a.d.join());
      out.px[id] = Object.assign(stats(grab(id, 'idle_right_0')), { moveDistinct: new Set(mv).size, frames: tex.getFrameNames().length,
        caughtDown: tex.has('caught_down_0') && grab(id, 'caught_down_0').d.join() === grab(id, 'caught_right_0').d.join(),
        down: stats(grab(id, 'idle_down_0')), downIsProfile: grab(id, 'idle_down_0').d.join() === grab(id, 'idle_right_0').d.join() });
      ['idle_right', 'idle_down', 'move_right', 'move_down'].forEach((k) => { const an = s.anims.get(`fft_${id}_${k}`); out.anims[`${id}_${k}`] = an ? an.frames.length : 0; });
    });
    // squirrel front: its own drawing, two eye pixels (#141218) on one row, 2-frame move_down from its own frames, caught_down = front
    if (s.textures.exists('fft_squirrel')) {
      const dn = grab('squirrel', 'idle_down_0'), rt = grab('squirrel', 'idle_right_0');
      let eyeRow = 0;
      for (let y = 0; y < dn.h; y++) { let k = 0; for (let x = 0; x < dn.w; x++) { const i = (y * dn.w + x) * 4; if (dn.d[i + 3] && dn.d[i] === 0x14 && dn.d[i + 1] === 0x12 && dn.d[i + 2] === 0x18) k++; } eyeRow = Math.max(eyeRow, k); }
      const md = s.anims.get('fft_squirrel_move_down');
      out.squirrel = { downIsProfile: dn.d.join() === rt.d.join(), eyeRow, stats: stats(dn),
        idleDownDistinct: grab('squirrel', 'idle_down_0').d.join() !== grab('squirrel', 'idle_down_1').d.join(),
        downMove: md ? md.frames.map((f) => f.textureFrame) : [],
        moveDownDistinct: grab('squirrel', 'move_down_0').d.join() !== grab('squirrel', 'move_down_1').d.join(),
        caughtDownDiffers: grab('squirrel', 'caught_down_0').d.join() !== rt.d.join() };
    }
    // logging a frog that faces the camera shows the (aliased) caught pose, then goes back to idle
    const fr = by('frog').find((p) => p.strip);
    if (fr) {
      fr.sprite.ffDir = 'down'; s.showFloraFaunaCaught(fr); out.frogCaught = fr.sprite.frame.name;
      await new Promise((res) => setTimeout(res, 2500)); out.frogAfter = fr.sprite.frame.name;
    }
    // Museum grid: log the frog, open the Wild Fauna wing: its card is the strip thumbnail
    s.ffDiscovered.add('frog'); s.openMuseum(); s.museumWing = 'wildfauna'; s.showMuseumWing();
    await new Promise((res) => setTimeout(res, 300));
    const b = document.querySelector('#museum-wildfauna-list [data-ff-id="frog"] img');
    out.grid = b ? { cls: b.className, src: b.src.slice(0, 15), svg: /\.svg/.test(b.src) } : null;
    s.closeMuseum();
    return out;
  }, T13);
  await ctx.close();
  return Object.assign(r, { errors, db: db.attempts(), clean: db.attempts() === 0 });
}

(async () => {
  const browser = await chromium.launch();
  const on = await sample(browser, '');
  const off = await sample(browser, '?ffstrips=0');
  check('frog / snake / trout / catfish T13 strips baked at half native (16 px cell)', on.st && T13.every((id) => on.st.ids.includes(id) && on.st.cells[id] === 16), JSON.stringify(on.st && on.st.cells));
  check('every frog / snake / trout / catfish specimen is an animated Sprite on fft_<id> at 16 px',
    T13.every((id) => on.sp[id].length > 0 && on.sp[id].every((p) => p.type === 'Sprite' && p.strip && p.tex === `fft_${id}` && p.w === 16)), JSON.stringify(T13.map((id) => [id, on.sp[id].length, on.sp[id][0]])));
  check('anims: idle 2 f and move 4 f in right + down for all four', T13.every((id) => on.anims[`${id}_idle_right`] === 2 && on.anims[`${id}_idle_down`] === 2
    && on.anims[`${id}_move_right`] === 4 && on.anims[`${id}_move_down`] === 4), JSON.stringify(on.anims));
  // T13 move strips are a 1-2-3-2 cycle (native f2 == f4 in every species, decoded this cycle), so 3 distinct move poses is the source's
  // own count; T13 palettes are 5-7 colours per species, so >= 4 after the bake.
  check('baked T13 frames read as a body: >= 6 px tall, >= 10 wide, >= 40 opaque px, >= 4 colours, hard alpha, 3 distinct move poses, own front view',
    T13.every((id) => { const p = on.px[id]; return p && p.h >= 6 && p.wid >= 10 && p.n >= 40 && p.colours >= 4 && p.semi === 0 && p.moveDistinct >= 3 && !p.downIsProfile && p.down.semi === 0 && p.down.n >= 30; }), JSON.stringify(on.px));
  check('T13 ships no caught_down strip: caught_down_0 exists and is the profile caught pose (13 frames + alias)',
    T13.every((id) => on.px[id] && on.px[id].caughtDown && on.px[id].frames >= 14), JSON.stringify(T13.map((id) => on.px[id] && [on.px[id].caughtDown, on.px[id].frames])));
  check('logging a frog facing down shows caught_down_0, then back to idle', on.frogCaught === 'caught_down_0' && /^idle_(right|down)_\d$/.test(on.frogAfter || ''), on.frogCaught + ' / ' + on.frogAfter);
  check('Museum grid: the logged frog shows its T13 caught thumbnail (PNG), not the SVG', on.grid && on.grid.cls === 'ff-strip-thumb' && on.grid.src === 'data:image/png;' && !on.grid.svg, JSON.stringify(on.grid));
  check('squirrel down view is its own front drawing: two eyes on one row, filled (>= 14 px tall), 2 distinct idle + 2 distinct move_down frames, caught_down = front',
    on.squirrel && !on.squirrel.downIsProfile && on.squirrel.eyeRow === 2 && on.squirrel.stats.h >= 14 && on.squirrel.stats.semi === 0 && on.squirrel.idleDownDistinct
    && on.squirrel.downMove.length === 2 && on.squirrel.downMove.every((f) => /^move_down_/.test(f)) && on.squirrel.moveDownDistinct && on.squirrel.caughtDownDiffers, JSON.stringify(on.squirrel));
  check('?ffstrips=0: frog / snake / trout / catfish / squirrel are the old SVG Images', off.st && off.st.on === false
    && T13.concat(['squirrel']).every((id) => off.sp[id].length > 0 && off.sp[id].every((p) => p.type === 'Image' && !p.strip)), JSON.stringify(T13.concat(['squirrel']).map((id) => off.sp[id][0])));
  check('?ffstrips=0 Museum card for the frog keeps the SVG', off.grid && off.grid.svg, JSON.stringify(off.grid));
  check('bake stays one-off and cheap (< 400 ms)', on.st && on.st.ms < 400, on.st && on.st.ms);
  check('no page errors', on.errors.length === 0 && off.errors.length === 0, JSON.stringify(on.errors.concat(off.errors).slice(0, 3)));
  check('Firebase never contacted (offlineStub attempts 0)', on.clean && off.clean && on.db === 0 && off.db === 0, [on.db, off.db].join(' / '));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
