// Cycle 13 art (G): (1) the ID-59 first-visit hello heart: original code art in shared/mm-town-fauna.js (texture fft_heart, frames
// heart_0..3, one-shot anim fft_heart_pop), plus the presentation API S calls from main.js: MMTownFauna.showHeart(scene, sprite,
// { reduced }) and MMTownFauna.faceToward(scene, sprite, id, x, y) (U cycle 11 spec: 1.2 s above the animal, static with reduced
// motion / flashes off, turn only species with side + front frames); (2) the next most-seen SVG Town animals (crab, hedgehog, bat,
// spider) are code art with true front views, baked 1:1 like cycles 9-12. ?ffstrips=0 keeps their SVG (the heart stays).
// Serve the repo root first:  python3 -m http.server 8440 &
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc13-art-heart-fauna.test.js
// Firebase blocked (offlineStub), offline join as an ADMIN bot, nothing written to any DB, no save written by this test.
const { chromium } = require('playwright');
const { check, done, offlineStub, exposeGame, joinOffline } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const NEW = { crab: 16, hedgehog: 16, bat: 16, spider: 14 };

async function sample(browser, q) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const db = await offlineStub(ctx);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await exposeGame(page);
  await page.goto(ORIGIN + '/game/index.html' + (q || ''));
  await joinOffline(page, 'ADMINcyc13heart');
  await page.waitForFunction(() => window.__g && window.__g.scene.getScene('Town') && window.__g.scene.getScene('Town').localBody, null, { timeout: 30000 });
  await page.waitForTimeout(500);
  const r = await page.evaluate(async (NEW) => {
    const s = window.__g.scene.getScene('Town'); const st = s.ffStrips || null; const M = window.MMTownFauna;
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    const by = (id) => s.ffSpecimens.filter((p) => p.id === id);
    const desc = (id) => by(id).map((p) => ({ type: p.sprite.type, tex: p.sprite.texture.key, w: Math.round(p.sprite.displayWidth), strip: !!p.strip }));
    const out = { st: st ? { on: st.on, ids: st.ids.slice(), cells: Object.assign({}, st.cells), heart: st.heart } : null, sp: {}, px: {}, anims: {}, api: !!(M && M.showHeart && M.faceToward && M.canTurn) };
    Object.keys(NEW).forEach((id) => { out.sp[id] = desc(id); });
    const grab = (key, frame) => {
      if (!s.textures.exists(key)) return null; const tex = s.textures.get(key); if (!tex.has(frame)) return null;
      const fr = tex.get(frame); const cv = tex.getSourceImage();
      return { w: fr.cutWidth, h: fr.cutHeight, d: Array.from(cv.getContext('2d').getImageData(fr.cutX, fr.cutY, fr.cutWidth, fr.cutHeight).data) };
    };
    const stats = (a) => {
      let y0 = 99, y1 = -1, x0 = 99, x1 = -1, semi = 0, n = 0, red = 0; const cols = new Set(); let eyeRow = 0;
      for (let y = 0; y < a.h; y++) {
        let k = 0;
        for (let x = 0; x < a.w; x++) {
          const i = (y * a.w + x) * 4; if (a.d[i + 3] > 0 && a.d[i + 3] < 255) semi++;
          if (a.d[i + 3] === 255) {
            n++; y0 = Math.min(y0, y); y1 = Math.max(y1, y); x0 = Math.min(x0, x); x1 = Math.max(x1, x); cols.add((a.d[i] << 16) | (a.d[i + 1] << 8) | a.d[i + 2]);
            if (a.d[i] === 0x14 && a.d[i + 1] === 0x12 && a.d[i + 2] === 0x18) k++;
            if (a.d[i] > 150 && a.d[i] > a.d[i + 1] * 1.6) red++;
          }
        }
        if (k === 2) eyeRow++;
      }
      return { h: y1 - y0 + 1, wid: x1 - x0 + 1, n, colours: cols.size, semi, eyeRows: eyeRow, red };
    };
    const same = (a, b) => a && b && a.d.join() === b.d.join();
    Object.keys(NEW).forEach((id) => {
      const k = `fft_${id}`; if (!s.textures.exists(k)) return;
      const R = grab(k, 'idle_right_0'), D = grab(k, 'idle_down_0');
      // crab big claw: yellow pixels sit on the viewer's left half of the front view (the crab's right claw is the big one)
      let yl = 0, yr = 0;
      if (id === 'crab') for (let y = 0; y < D.h; y++) for (let x = 0; x < D.w; x++) { const i = (y * D.w + x) * 4; if (D.d[i + 3] && D.d[i] > 200 && D.d[i + 1] > 160 && D.d[i + 2] < 140) { if (x < D.w / 2) yl++; else yr++; } }
      out.px[id] = { right: stats(R), down: stats(D), downIsProfile: same(R, D),
        idleDistinct: !same(grab(k, 'idle_right_0'), grab(k, 'idle_right_1')) && !same(grab(k, 'idle_down_0'), grab(k, 'idle_down_1')),
        moveDistinct: !same(grab(k, 'move_right_0'), grab(k, 'move_right_1')) && !same(grab(k, 'move_down_0'), grab(k, 'move_down_1')),
        caughtDownFront: same(grab(k, 'caught_down_0'), D), claw: [yl, yr] };
      ['idle_right', 'idle_down', 'move_right', 'move_down'].forEach((a) => { const an = s.anims.get(`${k}_${a}`); out.anims[`${id}_${a}`] = an ? an.frames.map((f) => f.textureFrame) : []; });
    });
    // heart texture
    const hf = [0, 1, 2, 3].map((f) => grab('fft_heart', `heart_${f}`));
    const pop = s.anims.get('fft_heart_pop');
    out.heart = { frames: hf.map((a) => a && Object.assign(stats(a), { w: a.w, hh: a.h })), glint: hf[2] && hf[1] && !same(hf[1], hf[2]), small: hf[0] && hf[1] && stats(hf[0]).n < stats(hf[1]).n,
      pop: pop ? { n: pop.frames.length, repeat: pop.repeat } : null };
    if (!out.api) return out;
    // showHeart on a specimen that is drawn as art (crab when baked, else the first crab image)
    const crab = by('crab')[0];
    if (crab) {
      const t = crab.sprite;
      const h = M.showHeart(s, t, {});
      await wait(60);
      out.show = h && { above: h.y < t.y - 6, dx: Math.abs(h.x - t.x), depthAbove: h.depth > t.depth, anim: h.anims.currentAnim && h.anims.currentAnim.key, tex: h.texture.key, alpha0: h.alpha };
      let gone = 0; const t0 = performance.now();
      while (h && h.scene && performance.now() - t0 < 6000) await wait(50);
      gone = h && !h.scene ? Math.round(performance.now() - t0) : -1; out.showGoneMs = gone;
      // follow: move the animal, the heart moves with it
      const h2 = M.showHeart(s, t, { ms: 3000 }); const x0 = t.x; t.x += 20; await wait(120);
      out.follow = h2 && Math.abs(h2.x - t.x) <= 1; t.x = x0; h2 && h2.destroy();
      // reduced: the full heart (heart_1) at once, no anim, no tween, full alpha the whole time
      const h3 = M.showHeart(s, t, { reduced: true });
      const f0 = h3 && h3.frame.name; await wait(500);
      out.reduced = h3 && { f0, f1: h3.frame.name, playing: !!(h3.anims && h3.anims.isPlaying), tweens: s.tweens.getTweensOf(h3).length, tweensData: s.tweens.getTweensOf(h3.ffHeart || {}).length, alpha: h3.alpha };
      const t1 = performance.now(); while (h3 && h3.scene && performance.now() - t1 < 6000) await wait(50);
      out.reducedGone = h3 && !h3.scene;
    }
    // faceToward: a baked crab turns to the hero; an SVG species (heron) is left alone
    const sc = by('crab').find((p) => p.strip);
    if (sc) {
      const sp = sc.sprite;
      out.faceDown = M.faceToward(s, sp, 'crab', sp.x + 1, sp.y + 60) && { dir: sp.ffDir, anim: sp.anims.currentAnim && sp.anims.currentAnim.key };
      out.faceLeft = M.faceToward(s, sp, 'crab', sp.x - 60, sp.y) && { dir: sp.ffDir, flip: sp.flipX, anim: sp.anims.currentAnim && sp.anims.currentAnim.key };
      out.canTurn = [M.canTurn(s, 'crab'), M.canTurn(s, 'heron')];
    }
    const he = by('heron')[0];
    out.faceSvg = he ? M.faceToward(s, he.sprite, 'heron', he.sprite.x, he.sprite.y + 60) : 'none';
    return out;
  }, NEW);
  await ctx.close();
  return Object.assign(r, { errors, db: db.attempts(), clean: db.attempts() === 0 });
}

(async () => {
  const browser = await chromium.launch();
  const on = await sample(browser, '');
  const off = await sample(browser, '?ffstrips=0');
  const ids = Object.keys(NEW);
  check('crab / hedgehog / bat / spider are code art baked at 16 / 16 / 16 / 14 px', on.st && ids.every((id) => on.st.ids.includes(id) && on.st.cells[id] === NEW[id]), JSON.stringify(on.st && on.st.cells));
  check('every crab / hedgehog / bat / spider specimen is an animated Sprite on fft_<id> at its cell', ids.every((id) => on.sp[id].length > 0
    && on.sp[id].every((p) => p.type === 'Sprite' && p.strip && p.tex === `fft_${id}` && p.w === NEW[id])), JSON.stringify(ids.map((id) => [id, on.sp[id].length, on.sp[id][0]])));
  check('anims: idle + move, right + down, 2 frames each and the down anims use their own front frames', ids.every((id) => ['idle_right', 'idle_down', 'move_right', 'move_down'].every((a) => (on.anims[`${id}_${a}`] || []).length === 2)
    && (on.anims[`${id}_idle_down`] || []).every((f) => /^idle_down_/.test(f)) && (on.anims[`${id}_move_down`] || []).every((f) => /^move_down_/.test(f))), JSON.stringify(on.anims));
  check('frames read as an animal: >= 8 px tall, >= 10 wide, >= 45 opaque px, >= 5 colours, hard alpha (profile and front)',
    ids.every((id) => { const p = on.px[id]; return p && ['right', 'down'].every((v) => p[v].h >= 8 && p[v].wid >= 10 && p[v].n >= 45 && p[v].colours >= 5 && p[v].semi === 0); }), JSON.stringify(on.px));
  check('own front view (not the profile), caught_down = front, 2 distinct idle and 2 distinct move frames per view',
    ids.every((id) => { const p = on.px[id]; return p && !p.downIsProfile && p.caughtDownFront && p.idleDistinct && p.moveDistinct; }), JSON.stringify(ids.map((id) => on.px[id] && [id, p2(on.px[id])])));
  check('front views have a face: a row with exactly two eye pixels (#141218)', ids.every((id) => on.px[id] && on.px[id].down.eyeRows >= 1), JSON.stringify(ids.map((id) => on.px[id] && on.px[id].down.eyeRows)));
  check('fiddler crab front: the big yellow claw is on the viewer\'s left (>= 4 px there, 0 on the right)', on.px.crab && on.px.crab.claw[0] >= 4 && on.px.crab.claw[1] === 0, JSON.stringify(on.px.crab && on.px.crab.claw));
  check('heart: fft_heart has 4 frames of 9 x 8, hard alpha; the full heart is 7 x 7 and mostly red; f0 is a smaller pop-in, f2 adds a glint',
    on.heart.frames.every((f) => f && f.w === 9 && f.hh === 8 && f.semi === 0) && on.heart.frames[1] && on.heart.frames[1].wid === 7 && on.heart.frames[1].h === 7 && on.heart.frames[1].red >= 14
    && on.heart.small && on.heart.glint, JSON.stringify(on.heart));
  check('heart anim fft_heart_pop: 4 frames, one shot (repeat 0)', on.heart.pop && on.heart.pop.n === 4 && on.heart.pop.repeat === 0, JSON.stringify(on.heart.pop));
  check('API: MMTownFauna.showHeart / faceToward / canTurn exist', on.api, String(on.api));
  check('showHeart: above the animal (centred, depth above), plays fft_heart_pop', on.show && on.show.above && on.show.dx <= 1 && on.show.depthAbove && on.show.anim === 'fft_heart_pop' && on.show.tex === 'fft_heart', JSON.stringify(on.show));
  check('showHeart removes itself after ~1.2 s (gone within 6 s of a loaded machine, not before 1 s)', on.showGoneMs >= 1000 && on.showGoneMs < 6000, String(on.showGoneMs));
  check('the heart follows a moving animal', on.follow === true, String(on.follow));
  check('reduced motion: the full heart (heart_1) at once, no anim, no tween, alpha 1, then removed', on.reduced && on.reduced.f0 === 'heart_1' && on.reduced.f1 === 'heart_1'
    && !on.reduced.playing && on.reduced.tweens === 0 && on.reduced.tweensData === 0 && on.reduced.alpha === 1 && on.reducedGone, JSON.stringify(on.reduced));
  check('faceToward: hero below -> front idle; hero to the left -> profile idle flipped; SVG species (heron) untouched',
    on.faceDown && on.faceDown.dir === 'down' && on.faceDown.anim === 'fft_crab_idle_down' && on.faceLeft && on.faceLeft.dir === 'right' && on.faceLeft.flip === true
    && on.faceLeft.anim === 'fft_crab_idle_right' && on.canTurn && on.canTurn[0] === true && on.canTurn[1] === false && on.faceSvg === false, JSON.stringify([on.faceDown, on.faceLeft, on.canTurn, on.faceSvg]));
  check('?ffstrips=0: crab / hedgehog / bat / spider are the old SVG Images', off.st && off.st.on === false
    && ids.every((id) => off.sp[id].length > 0 && off.sp[id].every((p) => p.type === 'Image' && !p.strip)), JSON.stringify(ids.map((id) => off.sp[id][0])));
  check('?ffstrips=0: the heart is still baked and showHeart works over an SVG animal', off.st && off.st.heart === true && off.show && off.show.above && off.show.anim === 'fft_heart_pop' && off.reducedGone,
    JSON.stringify([off.st && off.st.heart, off.show]));
  check('no page errors', on.errors.length === 0 && off.errors.length === 0, JSON.stringify(on.errors.concat(off.errors).slice(0, 3)));
  check('Firebase never contacted (offlineStub attempts 0)', on.clean && off.clean && on.db === 0 && off.db === 0, [on.db, off.db].join(' / '));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });

function p2(p) { return [p.downIsProfile, p.caughtDownFront, p.idleDistinct, p.moveDistinct]; }
