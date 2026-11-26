// Cycle 14 art (G): the three meadow-edge insects that were still pixelized SVG specks (firefly, grasshopper, praying mantis) are
// original code art in shared/mm-town-fauna.js with true side and front views, baked 1:1 like cycles 9-13 (firefly 14 px,
// grasshopper / mantis 16 px). Firefly: the lantern (abdomen tip, at the rear) blinks in idle; grasshopper: reddish hind tibia,
// a hop frame with the feet off the ground; mantis: raised thorax (head is the top of the profile), wide-set eyes in front.
// ?ffstrips=0 keeps their SVG.
// Serve the repo root first:  python3 -m http.server 8440 &
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc14-art-forest-insects.test.js
// Firebase blocked (offlineStub), offline join as an ADMIN bot, nothing written to any DB, no save written by this test.
const { chromium } = require('playwright');
const { check, done, offlineStub, exposeGame, joinOffline } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const NEW = { firefly: 14, grasshopper: 16, praying_mantis: 16 };

async function sample(browser, q) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const db = await offlineStub(ctx);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await exposeGame(page);
  await page.goto(ORIGIN + '/game/index.html' + (q || ''));
  await joinOffline(page, 'ADMINcyc14bugs');
  await page.waitForFunction(() => window.__g && window.__g.scene.getScene('Town') && window.__g.scene.getScene('Town').localBody, null, { timeout: 30000 });
  await page.waitForTimeout(500);
  const r = await page.evaluate((NEW) => {
    const s = window.__g.scene.getScene('Town'); const st = s.ffStrips || null;
    const by = (id) => s.ffSpecimens.filter((p) => p.id === id);
    const desc = (id) => by(id).map((p) => ({ type: p.sprite.type, tex: p.sprite.texture.key, w: Math.round(p.sprite.displayWidth), strip: !!p.strip }));
    const out = { st: st ? { on: st.on, ids: st.ids.slice(), cells: Object.assign({}, st.cells) } : null, sp: {}, px: {}, anims: {} };
    Object.keys(NEW).forEach((id) => { out.sp[id] = desc(id); });
    const grab = (key, frame) => {
      if (!s.textures.exists(key)) return null; const tex = s.textures.get(key); if (!tex.has(frame)) return null;
      const fr = tex.get(frame); const cv = tex.getSourceImage();
      return { w: fr.cutWidth, h: fr.cutHeight, d: Array.from(cv.getContext('2d').getImageData(fr.cutX, fr.cutY, fr.cutWidth, fr.cutHeight).data) };
    };
    const stats = (a) => {
      if (!a) return null;
      let y0 = 99, y1 = -1, x0 = 99, x1 = -1, semi = 0, n = 0, eyeRow = 0, glow = 0, glowX = 0, rust = 0, topX = -1; const cols = new Set(); const eyeX = [];
      for (let y = 0; y < a.h; y++) {
        const ks = [];
        for (let x = 0; x < a.w; x++) {
          const i = (y * a.w + x) * 4, R = a.d[i], G = a.d[i + 1], B = a.d[i + 2];
          if (a.d[i + 3] > 0 && a.d[i + 3] < 255) semi++;
          if (a.d[i + 3] !== 255) continue;
          n++; if (y < y0) { y0 = y; topX = x; } y1 = Math.max(y1, y); x0 = Math.min(x0, x); x1 = Math.max(x1, x); cols.add((R << 16) | (G << 8) | B);
          if (R === 0x14 && G === 0x12 && B === 0x18) ks.push(x);
          // lit lantern: bright yellow-green (high red AND green, low blue)
          if (R > 200 && G > 220 && B < 215 && G >= R) { glow++; glowX += x; }
          // rust hind tibia
          if (R > 140 && R > G * 1.4 && B < 90) rust++;
        }
        if (ks.length === 2) { eyeRow++; eyeX.push(ks[1] - ks[0]); }
      }
      return { y0, y1, h: y1 - y0 + 1, wid: x1 - x0 + 1, n, colours: cols.size, semi, eyeRows: eyeRow, eyeGap: eyeX.length ? Math.max(...eyeX) : 0, glow, glowMeanX: glow ? glowX / glow : -1, rust, topX };
    };
    const same = (a, b) => a && b && a.d.join() === b.d.join();
    Object.keys(NEW).forEach((id) => {
      const k = `fft_${id}`; if (!s.textures.exists(k)) return;
      const R = grab(k, 'idle_right_0'), D = grab(k, 'idle_down_0');
      out.px[id] = { right: stats(R), right1: stats(grab(k, 'idle_right_1')), hop: stats(grab(k, 'move_right_1')), down: stats(D), downIsProfile: same(R, D),
        idleDistinct: !same(grab(k, 'idle_right_0'), grab(k, 'idle_right_1')) && !same(grab(k, 'idle_down_0'), grab(k, 'idle_down_1')),
        moveDistinct: !same(grab(k, 'move_right_0'), grab(k, 'move_right_1')) && !same(grab(k, 'move_down_0'), grab(k, 'move_down_1')),
        caughtDownFront: same(grab(k, 'caught_down_0'), D) };
      ['idle_right', 'idle_down', 'move_right', 'move_down'].forEach((a) => { const an = s.anims.get(`${k}_${a}`); out.anims[`${id}_${a}`] = an ? an.frames.map((f) => f.textureFrame) : []; });
    });
    return out;
  }, NEW);
  await ctx.close();
  return Object.assign(r, { errors, db: db.attempts(), clean: db.attempts() === 0 });
}

(async () => {
  const browser = await chromium.launch();
  const on = await sample(browser, '');
  const off = await sample(browser, '?ffstrips=0');
  const ids = Object.keys(NEW); const P = on.px;
  check('firefly / grasshopper / praying mantis are code art baked at 14 / 16 / 16 px', on.st && ids.every((id) => on.st.ids.includes(id) && on.st.cells[id] === NEW[id]), JSON.stringify(on.st && on.st.cells));
  check('every firefly / grasshopper / mantis specimen is an animated Sprite on fft_<id> at its cell', ids.every((id) => on.sp[id].length > 0
    && on.sp[id].every((p) => p.type === 'Sprite' && p.strip && p.tex === `fft_${id}` && p.w === NEW[id])), JSON.stringify(ids.map((id) => [id, on.sp[id].length, on.sp[id][0]])));
  check('anims: idle + move, right + down, 2 frames each and the down anims use their own front frames', ids.every((id) => ['idle_right', 'idle_down', 'move_right', 'move_down'].every((a) => (on.anims[`${id}_${a}`] || []).length === 2)
    && (on.anims[`${id}_idle_down`] || []).every((f) => /^idle_down_/.test(f)) && (on.anims[`${id}_move_down`] || []).every((f) => /^move_down_/.test(f))), JSON.stringify(on.anims));
  check('frames read as an animal: >= 8 px tall, >= 10 wide, >= 45 opaque px, >= 5 colours, hard alpha (profile and front)',
    ids.every((id) => { const p = P[id]; return p && ['right', 'down'].every((v) => p[v].h >= 8 && p[v].wid >= 10 && p[v].n >= 45 && p[v].colours >= 5 && p[v].semi === 0); }), JSON.stringify(P));
  check('own front view (not the profile), caught_down = front, 2 distinct idle and 2 distinct move frames per view',
    ids.every((id) => { const p = P[id]; return p && !p.downIsProfile && p.caughtDownFront && p.idleDistinct && p.moveDistinct; }), JSON.stringify(ids.map((id) => P[id] && [id, P[id].downIsProfile, P[id].caughtDownFront, P[id].idleDistinct, P[id].moveDistinct])));
  check('front views have a face: a row with exactly two eye pixels (#141218)', ids.every((id) => P[id] && P[id].down.eyeRows >= 1), JSON.stringify(ids.map((id) => P[id] && P[id].down.eyeRows)));
  check('firefly lantern blinks: idle f1 has >= 2 more lit pixels than f0, and the light is at the rear (left third of the profile)',
    P.firefly && P.firefly.right1.glow >= P.firefly.right.glow + 2 && P.firefly.right1.glowMeanX >= 0 && P.firefly.right1.glowMeanX < NEW.firefly / 3, JSON.stringify(P.firefly && [P.firefly.right.glow, P.firefly.right1.glow, P.firefly.right1.glowMeanX]));
  check('grasshopper: rust hind tibia in the profile (>= 3 px); the hop frame has its feet off the ground (lowest row >= 2 px higher)',
    P.grasshopper && P.grasshopper.right.rust >= 3 && P.grasshopper.hop.y1 <= P.grasshopper.right.y1 - 2, JSON.stringify(P.grasshopper && [P.grasshopper.right.rust, P.grasshopper.right.y1, P.grasshopper.hop.y1]));
  check('mantis: raised thorax (the top of the profile is in the head half, x >= 9 of 16); wide-set front eyes (gap >= 8 px)',
    P.praying_mantis && P.praying_mantis.right.topX >= 9 && P.praying_mantis.down.eyeGap >= 8, JSON.stringify(P.praying_mantis && [P.praying_mantis.right.topX, P.praying_mantis.down.eyeGap]));
  check('?ffstrips=0: firefly / grasshopper / mantis are the old SVG Images', off.st && off.st.on === false
    && ids.every((id) => off.sp[id].length > 0 && off.sp[id].every((p) => p.type === 'Image' && !p.strip)), JSON.stringify(ids.map((id) => off.sp[id][0])));
  check('no page errors', on.errors.length === 0 && off.errors.length === 0, JSON.stringify(on.errors.concat(off.errors).slice(0, 3)));
  check('Firebase never contacted (offlineStub attempts 0)', on.clean && off.clean && on.db === 0 && off.db === 0, [on.db, off.db].join(' / '));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
