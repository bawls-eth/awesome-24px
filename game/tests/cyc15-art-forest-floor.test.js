// Cycle 15 art (G): the daddy longlegs and the spotted salamander (the last forest-floor SVG animals picked this cycle; only these two,
// the Town cull pin has little headroom) are original code art in shared/mm-town-fauna.js with true side and front views, baked 1:1 at
// 16 px. Daddy longlegs: one round body on four tall leg arches a side, legs reach the ground, an eye turret, a body bob in idle;
// salamander: blue-black with yellow spots, low and long in profile, seen from above in front (head at the bottom, tail at the top).
// Also the ID-62 treat bubble's final art (fft_treat_flower / fft_treat_fruit, same 16 x 15 contract as S's placeholder), which
// main.js makeTreatBubble now uses. ?ffstrips=0 keeps the two animals on their SVG; the treat art is baked either way.
// Cull budget: only the salamander is wired by default; the daddy longlegs is staged (wired with ?ffstaged=1, art checked there).
// Serve the repo root first:  python3 -m http.server 8440 &
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc15-art-forest-floor.test.js
// Firebase blocked (offlineStub), offline join as an ADMIN bot, nothing written to any DB, no save written by this test.
const { chromium } = require('playwright');
const { check, done, offlineStub, exposeGame, joinOffline } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const NEW = { daddy_longlegs: 16, salamander: 16 };

async function sample(browser, q) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const db = await offlineStub(ctx);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await exposeGame(page);
  await page.goto(ORIGIN + '/game/index.html' + (q || ''));
  await joinOffline(page, 'ADMINcyc15floor');
  await page.waitForFunction(() => window.__g && window.__g.scene.getScene('Town') && window.__g.scene.getScene('Town').localBody, null, { timeout: 30000 });
  await page.waitForTimeout(500);
  const r = await page.evaluate((NEW) => {
    const s = window.__g.scene.getScene('Town'); const st = s.ffStrips || null;
    const by = (id) => s.ffSpecimens.filter((p) => p.id === id);
    const desc = (id) => by(id).map((p) => ({ type: p.sprite.type, tex: p.sprite.texture.key, w: Math.round(p.sprite.displayWidth), strip: !!p.strip }));
    const out = { st: st ? { on: st.on, ids: st.ids.slice(), cells: Object.assign({}, st.cells) } : null, sp: {}, px: {}, anims: {}, treat: {} };
    Object.keys(NEW).forEach((id) => { out.sp[id] = desc(id); });
    const grab = (key, frame) => {
      if (!s.textures.exists(key)) return null; const tex = s.textures.get(key); if (!tex.has(frame)) return null;
      const fr = tex.get(frame); const cv = tex.getSourceImage();
      return { w: fr.cutWidth, h: fr.cutHeight, d: Array.from(cv.getContext('2d').getImageData(fr.cutX, fr.cutY, fr.cutWidth, fr.cutHeight).data) };
    };
    const stats = (a) => {
      if (!a) return null;
      let y0 = 99, y1 = -1, x0 = 99, x1 = -1, semi = 0, n = 0, eyeRows = 0, spots = 0, bottomRuns = 0, bodyTop = 99; const cols = new Set();
      for (let y = 0; y < a.h; y++) {
        let ks = 0, prev = false;
        for (let x = 0; x < a.w; x++) {
          const i = (y * a.w + x) * 4, R = a.d[i], G = a.d[i + 1], B = a.d[i + 2];
          if (a.d[i + 3] > 0 && a.d[i + 3] < 255) semi++;
          const on = a.d[i + 3] === 255;
          if (y === a.h - 1 && on && !prev) bottomRuns++;
          prev = on;
          if (!on) continue;
          n++; y0 = Math.min(y0, y); y1 = Math.max(y1, y); x0 = Math.min(x0, x); x1 = Math.max(x1, x); cols.add((R << 16) | (G << 8) | B);
          if (R === 0x14 && G === 0x12 && B === 0x18) ks++;
          if (R > 200 && G > 150 && B < 120) spots++; // yellow / tan-light (salamander spots, harvestman highlight)
          if (R > 150 && G > 100 && B < 110 && R > B + 60) bodyTop = Math.min(bodyTop, y); // the warm body highlight (harvestman)
        }
        if (ks === 2) eyeRows++;
      }
      return { y0, y1, h: y1 - y0 + 1, wid: x1 - x0 + 1, n, colours: cols.size, semi, eyeRows, spots, bottomRuns, bodyTop };
    };
    const same = (a, b) => a && b && a.d.join() === b.d.join();
    Object.keys(NEW).forEach((id) => {
      const k = `fft_${id}`; if (!s.textures.exists(k)) return;
      const R = grab(k, 'idle_right_0'), D = grab(k, 'idle_down_0');
      out.px[id] = { right: stats(R), right1: stats(grab(k, 'idle_right_1')), down: stats(D), downIsProfile: same(R, D),
        idleDistinct: !same(grab(k, 'idle_right_0'), grab(k, 'idle_right_1')) && !same(grab(k, 'idle_down_0'), grab(k, 'idle_down_1')),
        moveDistinct: !same(grab(k, 'move_right_0'), grab(k, 'move_right_1')) && !same(grab(k, 'move_down_0'), grab(k, 'move_down_1')),
        caughtDownFront: same(grab(k, 'caught_down_0'), D) };
      ['idle_right', 'idle_down', 'move_right', 'move_down'].forEach((a) => { const an = s.anims.get(`${k}_${a}`); out.anims[`${id}_${a}`] = an ? an.frames.map((f) => f.textureFrame) : []; });
    });
    // ID-62 treat bubble art
    ['flower', 'fruit'].forEach((kind) => {
      const key = `fft_treat_${kind}`, ok = s.textures.exists(key);
      const a = ok ? grab(key, '__BASE') : null;
      let pink = 0, red = 0, green = 0, yellow = 0, white = 0, semi = 0, n = 0;
      if (a) for (let i = 0; i < a.d.length; i += 4) {
        const R = a.d[i], G = a.d[i + 1], B = a.d[i + 2], A = a.d[i + 3];
        if (A > 0 && A < 255) semi++; if (A !== 255) continue; n++;
        if (R > 220 && G > 90 && G < 190 && B > 150) pink++;
        if (R > 180 && G < 140 && B < 120) red++;
        if (G > 120 && R < 140 && B < 120) green++;
        if (R > 230 && G > 170 && B < 60) yellow++;
        if (R === 255 && G === 255 && B === 255) white++;
      }
      let img = null;
      try { const im = typeof makeTreatBubble === 'function' ? makeTreatBubble(s, kind) : null; if (im) { img = { tex: im.texture.key, w: im.displayWidth, h: im.displayHeight, ox: im.originX, oy: im.originY }; im.destroy(); } } catch (e) { img = { err: e.message }; }
      out.treat[kind] = { ok, w: a && a.w, h: a && a.h, pink, red, green, yellow, white, semi, n, img };
    });
    return out;
  }, NEW);
  await ctx.close();
  return Object.assign(r, { errors, db: db.attempts(), clean: db.attempts() === 0 });
}

(async () => {
  const browser = await chromium.launch();
  const def = await sample(browser, '');
  const on = await sample(browser, '?ffstaged=1');
  const off = await sample(browser, '?ffstrips=0');
  const ids = Object.keys(NEW); const P = on.px;
  // Default Town: the salamander is wired; the daddy longlegs is staged (cull budget, see SPECS) and keeps its SVG Image.
  check('default Town: salamander wired as a 16 px animated Sprite; daddy longlegs (staged) still the SVG Image, not baked',
    def.st && def.st.ids.includes('salamander') && !def.st.ids.includes('daddy_longlegs') && def.sp.salamander.length > 0 && def.sp.salamander.every((p) => p.type === 'Sprite' && p.tex === 'fft_salamander' && p.w === 16)
    && def.sp.daddy_longlegs.length > 0 && def.sp.daddy_longlegs.every((p) => p.type === 'Image' && !p.strip), JSON.stringify([def.sp.salamander[0], def.sp.daddy_longlegs[0]]));
  // ?ffstaged=1: both wired; the art checks below run on this sample.
  check('?ffstaged=1: daddy longlegs / salamander are code art baked at 16 / 16 px', on.st && ids.every((id) => on.st.ids.includes(id) && on.st.cells[id] === NEW[id]), JSON.stringify(on.st && on.st.cells));
  check('every daddy longlegs / salamander specimen is an animated Sprite on fft_<id> at its cell', ids.every((id) => on.sp[id].length > 0
    && on.sp[id].every((p) => p.type === 'Sprite' && p.strip && p.tex === `fft_${id}` && p.w === NEW[id])), JSON.stringify(ids.map((id) => [id, on.sp[id].length, on.sp[id][0]])));
  check('anims: idle + move, right + down, 2 frames each and the down anims use their own front frames', ids.every((id) => ['idle_right', 'idle_down', 'move_right', 'move_down'].every((a) => (on.anims[`${id}_${a}`] || []).length === 2)
    && (on.anims[`${id}_idle_down`] || []).every((f) => /^idle_down_/.test(f)) && (on.anims[`${id}_move_down`] || []).every((f) => /^move_down_/.test(f))), JSON.stringify(on.anims));
  check('frames read as an animal: >= 5 px tall, >= 10 wide, >= 40 opaque px, >= 5 colours, hard alpha (profile and front)',
    ids.every((id) => { const p = P[id]; return p && ['right', 'down'].every((v) => p[v].h >= 5 && p[v].wid >= 10 && p[v].n >= 40 && p[v].colours >= 5 && p[v].semi === 0); }), JSON.stringify(P));
  check('own front view (not the profile), caught_down = front, 2 distinct idle and 2 distinct move frames per view',
    ids.every((id) => { const p = P[id]; return p && !p.downIsProfile && p.caughtDownFront && p.idleDistinct && p.moveDistinct; }), JSON.stringify(ids.map((id) => P[id] && [id, P[id].downIsProfile, P[id].caughtDownFront, P[id].idleDistinct, P[id].moveDistinct])));
  check('front views have a face: a row with exactly two eye pixels (#141218)', ids.every((id) => P[id] && P[id].down.eyeRows >= 1), JSON.stringify(ids.map((id) => P[id] && P[id].down.eyeRows)));
  const dl = P.daddy_longlegs;
  check('daddy longlegs: tall leg arches (>= 13 px tall in both views), >= 4 separate feet on the ground row, the body bobs 1 px in idle',
    dl && dl.right.h >= 13 && dl.down.h >= 13 && dl.right.bottomRuns >= 4 && dl.down.bottomRuns >= 4 && dl.right1.bodyTop === dl.right.bodyTop + 1,
    JSON.stringify(dl && [dl.right.h, dl.down.h, dl.right.bottomRuns, dl.down.bottomRuns, dl.right.bodyTop, dl.right1.bodyTop]));
  const sa = P.salamander;
  check('salamander: yellow spots (>= 3 in each view), profile low and long (width >= 2.5x height), front seen from above (at least as tall as wide, >= 2x the profile height)',
    sa && sa.right.spots >= 3 && sa.down.spots >= 3 && sa.right.wid >= 2.5 * sa.right.h && sa.down.h >= sa.down.wid && sa.down.h >= 2 * sa.right.h, JSON.stringify(sa && [sa.right.spots, sa.down.spots, sa.right.wid, sa.right.h, sa.down.wid, sa.down.h]));
  check('?ffstrips=0: daddy longlegs / salamander are the old SVG Images', off.st && off.st.on === false
    && ids.every((id) => off.sp[id].length > 0 && off.sp[id].every((p) => p.type === 'Image' && !p.strip)), JSON.stringify(ids.map((id) => off.sp[id][0])));
  const T = def.treat;
  check('ID-62 treat art: fft_treat_flower / fft_treat_fruit are 16 x 15, hard alpha, white bubble (>= 70 white px)',
    ['flower', 'fruit'].every((k) => T[k].ok && T[k].w === 16 && T[k].h === 15 && T[k].semi === 0 && T[k].white >= 70), JSON.stringify(T));
  check('ID-62 treat icons: flower = pink petals (>= 12) + yellow heart (>= 3) + green stem; fruit = red apple (>= 25) + green leaf',
    T.flower.pink >= 12 && T.flower.yellow >= 3 && T.flower.green >= 2 && T.fruit.red >= 25 && T.fruit.green >= 2 && T.fruit.pink === 0, JSON.stringify([T.flower, T.fruit]));
  check('makeTreatBubble uses the new art with the same contract (32 x 30 on screen, origin 0.1 / 1), also with ?ffstrips=0',
    [def, off].every((o) => ['flower', 'fruit'].every((k) => { const im = o.treat[k].img; return im && im.tex === `fft_treat_${k}` && im.w === 32 && im.h === 30 && Math.abs(im.ox - 0.1) < 1e-6 && im.oy === 1; })),
    JSON.stringify([def.treat.flower.img, def.treat.fruit.img, off.treat.flower.img, off.treat.fruit.img]));
  check('no page errors', [def, on, off].every((o) => o.errors.length === 0), JSON.stringify(def.errors.concat(on.errors, off.errors).slice(0, 3)));
  check('Firebase never contacted (offlineStub attempts 0)', [def, on, off].every((o) => o.clean && o.db === 0), [def.db, on.db, off.db].join(' / '));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
