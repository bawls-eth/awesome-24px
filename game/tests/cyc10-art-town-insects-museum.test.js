// Cycle 10 art (G): (1) the in-village honeybee, ladybug and butterfly (14 px pixelized-SVG specks) are original code pixel art in
// shared/mm-town-fauna.js (cells 14 / 14 / 16, idle + wing-beat move frames, same ?ffstrips=0 fallback); (2) the Museum grid
// thumbnails reuse the caught pose (integer-zoom PNG) for every strip / code species; (3) the owl front frames halve with the 'rare'
// tie rule so the eye rings and pupils no longer merge with the facial-disc rim at half size.
// Serve the repo root first:  python3 -m http.server 8440 &
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc10-art-town-insects-museum.test.js
// Firebase blocked (offlineStub), offline join as an ADMIN bot, nothing written to any DB (the Museum log is the local save only).
const { chromium } = require('playwright');
const { check, done, offlineStub, exposeGame, joinOffline } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const BUGS = { honeybee: 14, ladybug: 14, butterfly: 16 };

async function sample(browser, q) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const db = await offlineStub(ctx);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await exposeGame(page);
  await page.goto(ORIGIN + '/game/index.html' + (q || ''));
  await joinOffline(page, 'ADMINcyc10bugs');
  await page.waitForFunction(() => window.__g && window.__g.scene.getScene('Town') && window.__g.scene.getScene('Town').localBody, null, { timeout: 30000 });
  await page.waitForTimeout(500);
  const r = await page.evaluate(async (BUGS) => {
    const s = window.__g.scene.getScene('Town'); const st = s.ffStrips || null;
    const by = (id) => s.ffSpecimens.filter((p) => p.id === id);
    const desc = (id) => by(id).map((p) => ({ type: p.sprite.type, tex: p.sprite.texture.key, w: Math.round(p.sprite.displayWidth), strip: !!p.strip }));
    const out = { st: st ? { on: st.on, ids: st.ids.slice(), cells: Object.assign({}, st.cells), thumbs: Object.keys(st.thumbUrl || {}) } : null, sp: {}, px: {}, anims: {} };
    Object.keys(BUGS).concat(['heron', 'toucan']).forEach((id) => { out.sp[id] = desc(id); });
    const grab = (id, frame) => {
      const tex = s.textures.get(`fft_${id}`); const fr = tex.get(frame); const cv = tex.getSourceImage();
      return { w: fr.cutWidth, h: fr.cutHeight, d: Array.from(cv.getContext('2d').getImageData(fr.cutX, fr.cutY, fr.cutWidth, fr.cutHeight).data) };
    };
    Object.keys(BUGS).forEach((id) => {
      if (!s.textures.exists(`fft_${id}`)) return;
      const a = grab(id, 'idle_right_0'); let y0 = 99, y1 = -1, x0 = 99, x1 = -1, semi = 0; const cols = new Set();
      for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) {
        const i = (y * a.w + x) * 4; if (a.d[i + 3] > 0 && a.d[i + 3] < 255) semi++;
        if (a.d[i + 3] === 255) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); x0 = Math.min(x0, x); x1 = Math.max(x1, x); cols.add((a.d[i] << 16) | (a.d[i + 1] << 8) | a.d[i + 2]); }
      }
      const m0 = grab(id, 'move_right_0').d.join(), m1 = grab(id, 'move_right_1').d.join();
      out.px[id] = { h: y1 - y0 + 1, wid: x1 - x0 + 1, colours: cols.size, semi, wingBeat: m0 !== m1 };
      ['idle_right', 'idle_down', 'move_right', 'move_down'].forEach((k) => { const an = s.anims.get(`fft_${id}_${k}`); out.anims[`${id}_${k}`] = an ? an.frames.length : 0; });
    });
    // owl front at half size: eye-ring colours (#d7b15b / #f9d77e) in the top half, pupils (#25303a) touching the disc rim (#3d3038)
    if (s.textures.exists('fft_owl')) {
      out.owl = [];
      const hex = (d, i) => (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
      ['idle_down_0', 'idle_down_1', 'move_down_0', 'move_down_1', 'move_down_2', 'move_down_3'].forEach((f) => {
        const a = grab('owl', f); let ring = 0, touch = 0; const at = (x, y) => (x < 0 || y < 0 || x >= a.w || y >= a.h || !a.d[(y * a.w + x) * 4 + 3] ? -1 : hex(a.d, (y * a.w + x) * 4));
        for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) {
          const c = at(x, y);
          if (y < 13 && (c === 0xd7b15b || c === 0xf9d77e)) ring++;
          if (c === 0x25303a && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => at(x + dx, y + dy) === 0x3d3038)) touch++;
        }
        out.owl.push({ f, ring, touch });
      });
    }
    // a butterfly wander leg (fixed target) plays its move anim, no fly squash
    const bf = by('butterfly')[0];
    if (bf && bf.strip) {
      bf.active = true; bf.moving = true;
      const pick0 = s.pickFloraFaunaTarget; s.pickFloraFaunaTarget = () => [bf.px + 60, bf.py - 6];
      s.stepFloraFauna(bf); s.pickFloraFaunaTarget = pick0;
      out.flyAnim = bf.sprite.anims.currentAnim && bf.sprite.anims.currentAnim.key;
      out.squash = 0;
      for (let k = 0; k < 8; k++) { await new Promise((res) => setTimeout(res, 50)); out.squash = Math.max(out.squash, Math.abs(bf.sprite.scaleY - bf.baseScaleY)); }
      bf.active = false;
    }
    // Museum grid: log honeybee + fox + heron (cycle 12: the frog is a T13 strip now; cycle 13: the crab is code art), open the Wild Fauna wing
    ['honeybee', 'fox', 'heron'].forEach((id) => s.ffDiscovered.add(id));
    s.openMuseum(); s.museumWing = 'wildfauna'; s.showMuseumWing();
    const cardImg = (id) => { const b = document.querySelector(`#museum-wildfauna-list [data-ff-id="${id}"] img`); return b ? { cls: b.className, src: b.src.slice(0, 15), svg: /\.svg/.test(b.src), nw: b.naturalWidth, rend: getComputedStyle(b).imageRendering, cw: Math.round(b.getBoundingClientRect().width) } : null; };
    await new Promise((res) => setTimeout(res, 300));
    out.grid = { honeybee: cardImg('honeybee'), fox: cardImg('fox'), heron: cardImg('heron'),
      thumbs: document.querySelectorAll('#museum-wildfauna-list img.ff-strip-thumb').length,
      lockedThumbs: document.querySelectorAll('#museum-wildfauna-list .museum-specimen.locked img.ff-strip-thumb').length };
    s.closeMuseum();
    return out;
  }, BUGS);
  await ctx.close();
  return Object.assign(r, { errors, db: db.attempts(), clean: db.attempts() === 0 });
}

(async () => {
  const browser = await chromium.launch();
  const on = await sample(browser, '');
  const off = await sample(browser, '?ffstrips=0');
  const ids = Object.keys(BUGS);
  check('honeybee / ladybug / butterfly are code art baked at 14 / 14 / 16 px', on.st && ids.every((id) => on.st.ids.includes(id) && on.st.cells[id] === BUGS[id]), JSON.stringify(on.st));
  check('every bee / ladybug / butterfly specimen (incl. in-village) is an animated Sprite on fft_<id> at its cell', ids.every((id) => on.sp[id].length >= 5
    && on.sp[id].every((p) => p.type === 'Sprite' && p.strip && p.tex === `fft_${id}` && p.w === BUGS[id])), JSON.stringify(ids.map((id) => [id, on.sp[id].length, on.sp[id][0]])));
  // cycle 11: the snail became code art; cycle 12: frog / snake are T13 strips (cyc12-art-town-wetland.test.js); cycle 13: crab / hedgehog
  // are code art (cyc13-art-heart-fauna.test.js), so heron + toucan are the SVG controls
  check('heron and toucan stay SVG Images (untouched)', ['heron', 'toucan'].every((id) => on.sp[id].length > 0 && on.sp[id].every((p) => p.type === 'Image' && !p.strip)), JSON.stringify([on.sp.heron[0], on.sp.toucan[0]]));
  check('insect pixels read as a body, not a speck: >= 9 px tall and >= 11 px wide, >= 6 colours, hard alpha',
    ids.every((id) => on.px[id] && on.px[id].h >= 9 && on.px[id].wid >= 11 && on.px[id].colours >= 6 && on.px[id].semi === 0), JSON.stringify(on.px));
  check('idle 2 f + move 2 f (right + down) and the two move frames differ (a wing beat)', ids.every((id) => ['idle_right', 'idle_down', 'move_right', 'move_down'].every((k) => on.anims[`${id}_${k}`] === 2) && on.px[id].wingBeat),
    JSON.stringify(on.anims));
  check('a butterfly flight leg plays its move anim with no squash (the frames flap)', /^fft_butterfly_move_(right|down)$/.test(on.flyAnim || '') && on.squash < 0.001, `${on.flyAnim} / ${on.squash}`);
  check('owl front at half size: eye rings kept (>= 14 ring px) and pupils barely touch the disc rim (<= 5) on all 6 idle / move frames',
    on.owl && on.owl.length === 6 && on.owl.every((o) => o.ring >= 14 && o.touch <= 5), JSON.stringify(on.owl));
  check('Museum grid: the honeybee and fox thumbnails are their caught pose (PNG, pixelated, integer zoom 56 / 48 px)',
    on.grid.honeybee && on.grid.honeybee.cls === 'ff-strip-thumb' && on.grid.honeybee.src === 'data:image/png;' && on.grid.honeybee.nw === 56 && on.grid.honeybee.rend === 'pixelated'
    && on.grid.fox && on.grid.fox.cls === 'ff-strip-thumb' && on.grid.fox.nw === 48, JSON.stringify([on.grid.honeybee, on.grid.fox]));
  // cycle 11: + hawk (strip) and hummingbird / snail / dragonfly (code) = 12; cycle 12: + frog / snake / trout / catfish (T13 strips) = 16,
  // cycle 13: + crab / hedgehog / bat / spider (code) = 20, 18 of them still locked here (honeybee + fox logged; the logged heron is an SVG species)
  // cycle 14: + firefly / grasshopper / praying mantis (code) = 23, 21 locked (cyc14-art-forest-insects.test.js)
  // cycle 15: + salamander (code) = 24, 22 locked (cyc15-art-forest-floor.test.js; the daddy longlegs is staged, not wired by default)
  check('Museum grid: every strip / code species (24) uses the thumbnail, locked ones too (silhouette); the heron keeps its SVG',
    on.grid.thumbs === 24 && on.grid.lockedThumbs === 22 && on.grid.heron && on.grid.heron.svg, JSON.stringify(on.grid));
  check('?ffstrips=0: the insects are the old SVG Images and the grid uses SVGs only', off.st && off.st.on === false
    && ids.every((id) => off.sp[id].length > 0 && off.sp[id].every((p) => p.type === 'Image' && !p.strip)) && off.grid.thumbs === 0 && off.grid.honeybee && off.grid.honeybee.svg,
    JSON.stringify([off.sp.honeybee[0], off.grid]));
  check('no page errors', on.errors.length === 0 && off.errors.length === 0, JSON.stringify(on.errors.concat(off.errors).slice(0, 3)));
  check('Firebase never contacted (offlineStub attempts 0)', on.clean && off.clean && on.db === 0 && off.db === 0, [on.db, off.db].join(' / '));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
