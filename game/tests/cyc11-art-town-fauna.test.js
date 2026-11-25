// Cycle 11 art (G): (1) the Codex T17 hawk v2 (1c9f2b6, reviewed + merged this cycle) is wired into the Town like the owl (half size,
// 24 px cell, idle / move / caught, right + down) and its baked front no longer shares the owl's silhouette; (2) the last three
// in-village pixelized-SVG specks (hummingbird, snail, dragonfly) are original code pixel art in shared/mm-town-fauna.js; (3) the robin
// has a true front view (idle_down / move_down maps) instead of the profile reused; (4) the code snail faces its direction of travel
// (FF_FACES_LEFT only applies to the old left-facing SVG). ?ffstrips=0 keeps every one of them on the old SVG art.
// Serve the repo root first:  python3 -m http.server 8440 &
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc11-art-town-fauna.test.js
// Firebase blocked (offlineStub), offline join as an ADMIN bot, nothing written to any DB.
const { chromium } = require('playwright');
const { check, done, offlineStub, exposeGame, joinOffline } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const CODE = { hummingbird: 14, snail: 14, dragonfly: 16 };

async function sample(browser, q) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const db = await offlineStub(ctx);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await exposeGame(page);
  await page.goto(ORIGIN + '/game/index.html' + (q || ''));
  await joinOffline(page, 'ADMINcyc11fauna');
  await page.waitForFunction(() => window.__g && window.__g.scene.getScene('Town') && window.__g.scene.getScene('Town').localBody, null, { timeout: 30000 });
  await page.waitForTimeout(500);
  const r = await page.evaluate(async (CODE) => {
    const s = window.__g.scene.getScene('Town'); const st = s.ffStrips || null;
    const by = (id) => s.ffSpecimens.filter((p) => p.id === id);
    const desc = (id) => by(id).map((p) => ({ type: p.sprite.type, tex: p.sprite.texture.key, w: Math.round(p.sprite.displayWidth), strip: !!p.strip, x: Math.round(p.px), y: Math.round(p.py) }));
    const out = { st: st ? { on: st.on, ids: st.ids.slice(), cells: Object.assign({}, st.cells), ms: st.ms } : null, sp: {}, px: {}, anims: {} };
    ['hawk', 'bird'].concat(Object.keys(CODE)).forEach((id) => { out.sp[id] = desc(id); });
    const grab = (id, frame) => {
      const tex = s.textures.get(`fft_${id}`); const fr = tex.get(frame); const cv = tex.getSourceImage();
      return { w: fr.cutWidth, h: fr.cutHeight, d: Array.from(cv.getContext('2d').getImageData(fr.cutX, fr.cutY, fr.cutWidth, fr.cutHeight).data) };
    };
    const stats = (a) => {
      let y0 = 99, y1 = -1, x0 = 99, x1 = -1, semi = 0, n = 0; const cols = new Set();
      for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) {
        const i = (y * a.w + x) * 4; if (a.d[i + 3] > 0 && a.d[i + 3] < 255) semi++;
        if (a.d[i + 3] === 255) { n++; y0 = Math.min(y0, y); y1 = Math.max(y1, y); x0 = Math.min(x0, x); x1 = Math.max(x1, x); cols.add((a.d[i] << 16) | (a.d[i + 1] << 8) | a.d[i + 2]); }
      }
      return { h: y1 - y0 + 1, wid: x1 - x0 + 1, n, colours: cols.size, semi };
    };
    const mask = (a) => a.d.filter((v, i) => i % 4 === 3).map((v) => (v ? 1 : 0));
    const iou = (a, b) => { const m = mask(a), n = mask(b); let i = 0, u = 0; m.forEach((v, k) => { if (v && n[k]) i++; if (v || n[k]) u++; }); return u ? i / u : 0; };
    Object.keys(CODE).concat(['hawk']).forEach((id) => {
      if (!s.textures.exists(`fft_${id}`)) return;
      out.px[id] = Object.assign(stats(grab(id, 'idle_right_0')), { beat: grab(id, 'move_right_0').d.join() !== grab(id, 'move_right_1').d.join() });
      ['idle_right', 'idle_down', 'move_right', 'move_down'].forEach((k) => { const an = s.anims.get(`fft_${id}_${k}`); out.anims[`${id}_${k}`] = an ? an.frames.length : 0; });
    });
    // hawk vs owl at the baked Town size: the cycle 8 REDO was "the owl body with a different face" (IoU 0.75-0.86)
    if (s.textures.exists('fft_hawk') && s.textures.exists('fft_owl')) {
      out.hawkOwl = ['idle_right_0', 'idle_down_0', 'move_right_2'].map((f) => Math.round(iou(grab('hawk', f), grab('owl', f)) * 100) / 100);
      out.hawkFrames = s.textures.get('fft_hawk').getFrameNames().length;
    }
    // robin: down frames are their own drawing (not the profile) and roughly left-right symmetric (a front view)
    if (s.textures.exists('fft_bird')) {
      const dn = grab('bird', 'idle_down_0'), rt = grab('bird', 'idle_right_0');
      const m = mask(dn); let same = 0, tot = 0;
      for (let y = 0; y < dn.h; y++) for (let x = 0; x < dn.w; x++) { const a = m[y * dn.w + x], b = m[y * dn.w + (dn.w - 1 - x)]; if (a || b) { tot++; if (a && b) same++; } }
      out.robin = { downIsProfile: dn.d.join() === rt.d.join(), mirror: Math.round((same / tot) * 100) / 100,
        downMove: s.anims.get('fft_bird_move_down') ? s.anims.get('fft_bird_move_down').frames.map((f) => f.textureFrame) : [],
        caughtDownDiffers: grab('bird', 'caught_down_0').d.join() !== rt.d.join() };
    }
    // the code snail walks right then left: flipX false then true (faces travel)
    const sn = by('snail').find((p) => p.strip);
    if (sn) {
      sn.active = true;
      const pick0 = s.pickFloraFaunaTarget;
      s.pickFloraFaunaTarget = () => [sn.px + 40, sn.py]; s.stepFloraFauna(sn); const right = sn.sprite.flipX;
      s.pickFloraFaunaTarget = () => [sn.px - 40, sn.py]; s.stepFloraFauna(sn); const left = sn.sprite.flipX;
      s.pickFloraFaunaTarget = pick0; sn.active = false;
      out.snailFlip = { right, left, anim: sn.sprite.anims.currentAnim && sn.sprite.anims.currentAnim.key };
    }
    return out;
  }, CODE);
  await ctx.close();
  return Object.assign(r, { errors, db: db.attempts(), clean: db.attempts() === 0 });
}

(async () => {
  const browser = await chromium.launch();
  const on = await sample(browser, '');
  const off = await sample(browser, '?ffstrips=0');
  const ids = Object.keys(CODE);
  check('hawk strips baked at half native (24 px cell), 14 frames + caught aliases', on.st && on.st.ids.includes('hawk') && on.st.cells.hawk === 24 && on.hawkFrames >= 14, JSON.stringify([on.st && on.st.cells.hawk, on.hawkFrames]));
  check('every hawk specimen is an animated Sprite on fft_hawk at 24 px', on.sp.hawk.length > 0 && on.sp.hawk.every((p) => p.type === 'Sprite' && p.strip && p.tex === 'fft_hawk' && p.w === 24), JSON.stringify(on.sp.hawk[0]));
  check('hawk anims: idle 2 f, move 4 f in right + down', on.anims.hawk_idle_right === 2 && on.anims.hawk_idle_down === 2 && on.anims.hawk_move_right === 4 && on.anims.hawk_move_down === 4, JSON.stringify(on.anims));
  check('hawk no longer shares the owl silhouette at Town size (alpha IoU < 0.6 on idle right / idle down / move f3)', on.hawkOwl && on.hawkOwl.every((v) => v < 0.6), JSON.stringify(on.hawkOwl));
  check('hummingbird / snail / dragonfly are code art baked at 14 / 14 / 16 px', on.st && ids.every((id) => on.st.ids.includes(id) && on.st.cells[id] === CODE[id]), JSON.stringify(on.st && on.st.cells));
  check('every hummingbird / snail / dragonfly specimen (incl. in-village) is an animated Sprite on fft_<id> at its cell',
    ids.every((id) => on.sp[id].length >= 3 && on.sp[id].every((p) => p.type === 'Sprite' && p.strip && p.tex === `fft_${id}` && p.w === CODE[id])), JSON.stringify(ids.map((id) => [id, on.sp[id].length, on.sp[id][0]])));
  // a perched dragonfly is a long thin profile (16 x 7), so the body test is area (>= 60 opaque px), not height alone
  check('code pixels read as a body, not a speck: >= 7 px tall, >= 11 px wide, >= 60 opaque px, >= 6 colours, hard alpha; move frames differ',
    ids.every((id) => on.px[id] && on.px[id].h >= 7 && on.px[id].wid >= 11 && on.px[id].n >= 60 && on.px[id].colours >= 6 && on.px[id].semi === 0 && on.px[id].beat), JSON.stringify(on.px));
  check('robin down view is its own front drawing (not the profile), near-symmetric (>= 0.8), 2-frame move_down, caught_down = front',
    on.robin && !on.robin.downIsProfile && on.robin.mirror >= 0.8 && on.robin.downMove.length === 2 && on.robin.downMove.every((f) => /^move_down_/.test(f)) && on.robin.caughtDownDiffers, JSON.stringify(on.robin));
  check('the code snail faces its travel (right: flipX false, left: flipX true) and plays its move anim',
    on.snailFlip && on.snailFlip.right === false && on.snailFlip.left === true && /^fft_snail_move_right$/.test(on.snailFlip.anim || ''), JSON.stringify(on.snailFlip));
  check('?ffstrips=0: hawk / hummingbird / snail / dragonfly are the old SVG Images', off.st && off.st.on === false
    && ['hawk'].concat(ids).every((id) => off.sp[id].length > 0 && off.sp[id].every((p) => p.type === 'Image' && !p.strip)), JSON.stringify(['hawk'].concat(ids).map((id) => off.sp[id][0])));
  check('bake stays one-off and cheap (< 400 ms)', on.st && on.st.ms < 400, on.st && on.st.ms);
  check('no page errors', on.errors.length === 0 && off.errors.length === 0, JSON.stringify(on.errors.concat(off.errors).slice(0, 3)));
  check('Firebase never contacted (offlineStub attempts 0)', on.clean && off.clean && on.db === 0 && off.db === 0, [on.db, off.db].join(' / '));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
