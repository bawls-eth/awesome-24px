// Cycle 9 art (G): (2) the code-drawn robin + squirrel (original pixel maps in the same module, cells 16 / 20) also checked.
// Cycle 9 art (G): the Codex T17 deer / fox / owl strips (merged provisional in cycle 8) are wired into the Town wildlife.
// shared/mm-town-fauna.js bakes each 4x strip ONCE at create into one canvas texture per species at half native size (deer 32 px,
// fox / owl 24 px cells: the hero's pixel density), with idle / move anims (right + down, left = flipX) and a caught pose shown when the
// animal is logged and in the Museum card. Every other species stays an SVG Image. A failed strip or ?ffstrips=0 = the old SVG art.
// Serve the repo root first:  python3 -m http.server 8440 &
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc9-art-town-fauna-strips.test.js
// Firebase blocked (offlineStub), offline join as an ADMIN bot, nothing written to any DB (the Museum log is the local save only).
const { chromium } = require('playwright');
const { check, done, offlineStub, exposeGame, joinOffline } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');

async function sample(browser, q, block) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const db = await offlineStub(ctx);
  if (block) await ctx.route(block, (r) => r.fulfill({ status: 404, body: '' }));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await exposeGame(page);
  await page.goto(ORIGIN + '/game/index.html' + (q || ''));
  await joinOffline(page, 'ADMINcyc9fauna');
  await page.waitForFunction(() => window.__g && window.__g.scene.getScene('Town') && window.__g.scene.getScene('Town').localBody, null, { timeout: 30000 });
  await page.waitForTimeout(500);
  const r = await page.evaluate(async () => {
    const s = window.__g.scene.getScene('Town'); const st = s.ffStrips || null;
    const by = (id) => s.ffSpecimens.filter((p) => p.id === id);
    const desc = (id) => by(id).map((p) => ({ type: p.sprite.type, tex: p.sprite.texture.key, w: Math.round(p.sprite.displayWidth), strip: !!p.strip }));
    const out = { st: st ? { on: st.on, ids: st.ids.slice(), cells: Object.assign({}, st.cells), ms: st.ms } : null,
      deer: desc('deer'), fox: desc('fox'), owl: desc('owl'), bird: desc('bird'), squirrel: desc('squirrel'), heron: desc('heron'), snail: desc('snail'), toucan: desc('toucan') };
    // anims: idle 2 f, move 4 f, right + down, per species
    out.anims = {};
    ['deer', 'fox', 'owl'].forEach((id) => ['idle_right', 'idle_down', 'move_right', 'move_down'].forEach((a) => {
      const an = s.anims.get(`fft_${id}_${a}`); out.anims[`${id}_${a}`] = an ? an.frames.length : 0;
    }));
    // baked pixels: opaque height + colours of idle_right_0 per species (a real sprite, not a blank or a blur)
    out.px = {};
    ['deer', 'fox', 'owl', 'bird', 'squirrel'].forEach((id) => {
      if (!s.textures.exists(`fft_${id}`)) return;
      const tex = s.textures.get(`fft_${id}`); const fr = tex.get('idle_right_0'); const cv = tex.getSourceImage();
      const d = cv.getContext('2d').getImageData(fr.cutX, fr.cutY, fr.cutWidth, fr.cutHeight).data;
      let y0 = 99, y1 = -1; const cols = new Set(); let semi = 0;
      for (let y = 0; y < fr.cutHeight; y++) for (let x = 0; x < fr.cutWidth; x++) {
        const i = (y * fr.cutWidth + x) * 4; if (d[i + 3] > 0 && d[i + 3] < 255) semi++;
        if (d[i + 3] === 255) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); cols.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]); }
      }
      out.px[id] = { h: y1 - y0 + 1, colours: cols.size, semi, frames: Object.keys(tex.frames).length - 1 };
    });
    // walk: one wander step on a deer plays a move anim, then idle when the leg ends
    const deer = by('deer')[0];
    if (deer && deer.strip) {
      deer.active = true; deer.moving = true;
      const pick0 = s.pickFloraFaunaTarget; s.pickFloraFaunaTarget = () => [deer.px + 70, deer.py + 10]; // a fixed short leg (deterministic)
      s.stepFloraFauna(deer);
      s.pickFloraFaunaTarget = pick0;
      out.walkAnim = deer.sprite.anims.currentAnim && deer.sprite.anims.currentAnim.key;
      out.walkTilt = 0;
      for (let k = 0; k < 8; k++) { await new Promise((res) => setTimeout(res, 60)); out.walkTilt = Math.max(out.walkTilt, Math.abs(deer.sprite.angle)); }
      await new Promise((res) => setTimeout(res, 6000));
      out.afterAnim = deer.sprite.anims.currentAnim && deer.sprite.anims.currentAnim.key;
      deer.active = false;
    }
    // log a fox: caught pose, then the Museum card shows the native caught art
    const fox = by('fox')[0];
    if (fox) {
      s.collectFloraFauna(fox);
      out.caughtFrame = fox.sprite.frame && fox.sprite.frame.name;
      s.showMuseumDetail('fox');
      const img = document.querySelector('#museum-detail .museum-detail-art img');
      out.museum = img ? { cls: img.className, data: img.src.slice(0, 15), svg: /\.svg/.test(img.src) } : null;
      await new Promise((res) => setTimeout(res, 1100));
      out.afterCaught = fox.sprite.frame && fox.sprite.frame.name;
      s.hideMuseumDetail && s.hideMuseumDetail();
    }
    return out;
  });
  await ctx.close();
  return Object.assign(r, { errors, db: db.attempts(), clean: db.attempts() === 0 });
}

(async () => {
  const browser = await chromium.launch();
  const on = await sample(browser, '');
  const off = await sample(browser, '?ffstrips=0');
  const miss = await sample(browser, '', '**/t17-deer/fauna/ff_deer_move.png');
  const allStrip = (arr, id) => arr.length >= 5 && arr.every((p) => p.strip && p.type === 'Sprite' && p.tex === `fft_${id}`);
  check('default: deer / fox / owl strips baked (cells 32 / 24 / 24 = half native)', on.st && on.st.on && ['deer', 'fox', 'owl'].every((id) => on.st.ids.includes(id))
    && on.st.cells.deer === 32 && on.st.cells.fox === 24 && on.st.cells.owl === 24, JSON.stringify(on.st));
  check('every deer / fox / owl specimen is an animated Sprite on its fft_ texture at the cell size', allStrip(on.deer, 'deer') && allStrip(on.fox, 'fox') && allStrip(on.owl, 'owl')
    && on.deer.every((p) => p.w === 32) && on.fox.every((p) => p.w === 24), JSON.stringify([on.deer[0], on.fox[0], on.owl[0]]));
  // Cycle 10: the butterfly became code art; cycle 11: the snail did too (cyc11-art-town-fauna.test.js); cycle 12: frog and snake draw their
  // Codex T13 strips (cyc12-art-town-wetland.test.js); cycle 13: crab and hedgehog became code art (cyc13-art-heart-fauna.test.js), so
  // the untouched-SVG controls are now the heron (pond) and the toucan (forest).
  check('other species are untouched SVG Images (heron, toucan)', on.heron.length > 0 && on.heron.every((p) => p.type === 'Image' && !p.strip && /^ff(px)?_heron$/.test(p.tex))
    && on.toucan.length > 0 && on.toucan.every((p) => p.type === 'Image' && !p.strip && /^ff(px)?_toucan$/.test(p.tex)), JSON.stringify([on.heron[0], on.toucan[0]]));
  check('code-drawn robin (16 px) and squirrel (20 px, was 16) are animated Sprites, incl. the in-village ones',
    on.st && on.st.cells.bird === 16 && on.st.cells.squirrel === 20 && allStrip(on.bird, 'bird') && allStrip(on.squirrel, 'squirrel')
    && on.bird.every((p) => p.w === 16) && on.squirrel.every((p) => p.w === 20) && on.bird.length >= 7 && on.squirrel.length >= 7, JSON.stringify([on.st && on.st.cells, on.bird.length, on.squirrel[0]]));
  check('robin / squirrel pixels: filled cell (robin >= 12 px tall, squirrel >= 16), >= 7 colours, hard alpha, 4 frames + aliases',
    on.px.bird && on.px.squirrel && on.px.bird.h >= 12 && on.px.squirrel.h >= 16 && on.px.bird.colours >= 7 && on.px.squirrel.colours >= 7
    && on.px.bird.semi === 0 && on.px.squirrel.semi === 0 && on.px.bird.frames >= 4, JSON.stringify([on.px.bird, on.px.squirrel]));
  check('anims: idle 2 f and move 4 f in right + down for all three', Object.keys(on.anims).length === 12
    && Object.entries(on.anims).every(([k, n]) => n === (/_idle_/.test(k) ? 2 : 4)), JSON.stringify(on.anims));
  check('baked frames are real pixel art: deer >= 26 px tall, fox / owl >= 16, >= 8 colours, hard alpha, 14 frames each',
    on.px.deer && on.px.deer.h >= 26 && on.px.fox.h >= 16 && on.px.owl.h >= 16 && ['deer', 'fox', 'owl'].every((id) => on.px[id].colours >= 8 && on.px[id].semi === 0 && on.px[id].frames === 14),
    JSON.stringify(on.px));
  check('a wander step plays the move anim (no waddle tilt), then idle when it ends', /^fft_deer_move_(right|down)$/.test(on.walkAnim || '') && on.walkTilt === 0
    && /^fft_deer_idle_(right|down)$/.test(on.afterAnim || ''), [on.walkAnim, on.walkTilt, on.afterAnim].join(' / '));
  check('logging a fox shows its caught pose, then back to idle', /^caught_(right|down)_0$/.test(on.caughtFrame || '') && /^idle_(right|down)_\d$/.test(on.afterCaught || ''),
    on.caughtFrame + ' / ' + on.afterCaught);
  check('the Museum card shows the native caught art (PNG data URL, not the SVG)', on.museum && on.museum.cls === 'ff-strip-art' && on.museum.data === 'data:image/png;' && !on.museum.svg,
    JSON.stringify(on.museum));
  check('?ffstrips=0: deer / fox / owl / robin / squirrel are the old SVG Images', off.st && off.st.on === false && off.st.ids.length === 0
    && off.deer.every((p) => p.type === 'Image' && !p.strip && /^ff(px)?_deer$/.test(p.tex)) && off.fox.every((p) => p.type === 'Image')
    && off.bird.every((p) => p.type === 'Image' && /^ff(px)?_bird$/.test(p.tex)) && off.squirrel.every((p) => p.type === 'Image' && p.w === 16), JSON.stringify([off.st, off.deer[0], off.squirrel[0]]));
  check('?ffstrips=0 Museum card keeps the SVG', off.museum && off.museum.svg, JSON.stringify(off.museum));
  check('a deer strip that fails to load: the deer falls back to its SVG, fox / owl still use strips', miss.st && !miss.st.ids.includes('deer')
    && miss.st.ids.includes('fox') && miss.deer.every((p) => p.type === 'Image' && !p.strip) && allStrip(miss.fox, 'fox'), JSON.stringify([miss.st, miss.deer[0]]));
  check('bake is one-off and cheap (< 400 ms)', on.st && on.st.ms < 400, on.st && on.st.ms);
  check('no page errors', on.errors.length === 0 && off.errors.length === 0, JSON.stringify(on.errors.concat(off.errors).slice(0, 3)));
  check('Firebase never contacted (offlineStub attempts 0)', on.clean && off.clean && miss.clean && on.db === 0 && off.db === 0 && miss.db === 0, [on.db, off.db, miss.db].join(' / '));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
