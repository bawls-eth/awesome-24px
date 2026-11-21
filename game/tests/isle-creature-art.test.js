// Browser test: Codex b31a / b32 creature strips and b33 jungle props on the Hearthvale Isles page (game/games/isles/).
// 1 a Fern Raptor draws from its PNG strip (screen pixels are b31a palette colours, not the code bake), faces by movement (left mirrors
//   right, up uses the up strip) and plays its death strip; 2 ?art=0 loads no strip / prop PNG and draws the MMCreatureDraw code bake;
// 3 a ridden Tusktop draws its own idle / move strip plus the separate saddle overlay; 4 the Fernjaw Tyrant's wind-up telegraph plays
//   its roar strip, then the attack strip; 5 a fed Chompbill plays eat; 6 b33 props are baked into the chunks; 7 phone 390x844 renders
//   the strips with no horizontal scroll; plus no per-frame allocation in the strip draw path, no console errors and 0 DB requests.
// Run: BASE=http://localhost:8841/game/index.html NODE_PATH=$(npm root -g) node game/tests/isle-creature-art.test.js
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/isles/index.html';
const B31A_PAL = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'assets', 'arcane', 'b31a-jungle-creatures-core', 'palette.json'), 'utf8')).colors;
const TUSK_SAVE = JSON.stringify({ v: 1, n: 1, roster: [{ id: 't1', sp: 'tusktop', nm: 'Tuskie', lv: 3, xp: 0, bond: 2, aff: 0, cos: '', isle: 'jungle', d: '2026-11-01' }], party: [], mount: 't1' });

const opened = [];
async function open(browser, opts, query, seed) {
  const ctx = await browser.newContext(opts);
  const db = await blockDb(ctx);
  const page = await ctx.newPage();
  const errors = [], offsite = [], pngs = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('request', (r) => { const u = r.url(); if (!u.startsWith(ORIGIN + '/') && !u.startsWith('data:')) offsite.push(u); });
  page.on('response', (r) => { const u = r.url(); if (/assets\/arcane\/b3[123][a-z]?-/.test(u)) pngs.push({ u: u.replace(/^.*\/arcane\//, ''), s: r.status() }); });
  await page.addInitScript((s) => {
    if (sessionStorage.seeded) return;
    sessionStorage.seeded = '1';
    localStorage.clear();
    Object.keys(s || {}).forEach((k) => localStorage.setItem(k, s[k]));
  }, seed || {});
  await page.goto(PAGE + '?test=1&seed=123' + (query || ''));
  await page.waitForFunction(() => window.__isles && window.__isles.world);
  await page.evaluate(async () => { await window.__isles.stripsReady(); await window.__isles.propsReady(); });
  const o = { ctx, page, errors, offsite, pngs, db };
  opened.push(o);
  return o;
}
const ev = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__isles, ${JSON.stringify(arg === undefined ? null : arg)})`);
const SETUP = (I) => { I.pause(true); I.god(true); I.clearCreatures(); const r = I.findTile('jungle_floor', 10); I.teleport(r.x, r.y); I.step(0, 0, 0.05); return r; };

// screen pixels a lone creature adds (render with it, then without it): how many changed and how many are exact b31a palette colours
const PIXELS = (I, a) => {
  const cv = document.getElementById('view'), g = cv.getContext('2d'), dpr = cv.width / window.innerWidth;
  const h = I.hero();
  const uid = I.spawn(a.sp, h.tx + 3, h.ty);
  I.step(0, 0, 0.02); I.render();
  const c = I.creatures().find((x) => x.uid === uid);
  const sx = Math.round((c.x - h.x + window.innerWidth / 2) * dpr), sy = Math.round((c.y - h.y + window.innerHeight / 2) * dpr), R = Math.round(48 * dpr);
  const box = [sx - R, sy - 2 * R, 2 * R, 2 * R + Math.round(8 * dpr)];
  const withC = g.getImageData(box[0], box[1], box[2], box[3]).data;
  const info = { src: c.src, drawn: c.drawn };
  I.clearCreatures(); I.render();
  const without = g.getImageData(box[0], box[1], box[2], box[3]).data;
  const pal = new Set(a.pal.map((x) => x.toLowerCase()));
  const hex = (d, i) => '#' + [d[i], d[i + 1], d[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('');
  let changed = 0, inPal = 0;
  for (let i = 0; i < withC.length; i += 4) {
    if (withC[i] === without[i] && withC[i + 1] === without[i + 1] && withC[i + 2] === without[i + 2]) continue;
    changed++;
    if (pal.has(hex(withC, i))) inPal++;
  }
  return Object.assign(info, { changed, inPal, ratio: changed ? inPal / changed : 0 });
};

(async () => {
  const browser = await chromium.launch();

  // ---- 1 desktop: PNG strips on ----
  const d = await open(browser, { viewport: { width: 1000, height: 700 } });
  const ready = await ev(d.page, (I) => I.stripsReady());
  check('1a strips: all seven b31a / b31b / b32 species load (107 strips baked once)', ready.on && ready.kinds.length === 7 && ready.count === 107, JSON.stringify(ready));
  await ev(d.page, SETUP);
  const px = await ev(d.page, PIXELS, { sp: 'fernraptor', pal: B31A_PAL });
  check('1b a Fern Raptor draws from its PNG strip (src png, fernraptor_* strip)', px.src === 'png' && /^fernraptor_(idle|move)_(down|up|right)$/.test(px.drawn), JSON.stringify(px));
  check('1c its screen pixels are b31a palette colours (non-fallback art)', px.changed > 600 && px.ratio > 0.6, JSON.stringify(px));
  const okPng = d.pngs.filter((p) => /b31a-.*fernraptor_idle_down\.png$/.test(p.u) && p.s === 200).length;
  check('1d fernraptor_idle_down.png was fetched once from the b31a batch', okPng === 1, JSON.stringify(d.pngs.filter((p) => /fernraptor_idle_down/.test(p.u))));
  const face = await ev(d.page, (I) => {
    const h = I.hero(); const uid = I.spawn('fernraptor', h.tx + 4, h.ty + 1); const out = {};
    const c = () => I.creatures().find((x) => x.uid === uid);
    I.anger(uid); // a hostile raptor chases the hero: stand on a side to drive its velocity
    I.nextTo(uid, -150); I.step(0, 0, 0.25); I.render(); out.left = { drawn: c().drawn, dir: c().dir };
    I.nextTo(uid, 150); I.step(0, 0, 0.25); I.render(); out.right = { drawn: c().drawn, dir: c().dir };
    const cc = c(); I.teleport(Math.floor(cc.x / 32), Math.floor(cc.y / 32) - 5); I.step(0, 0, 0.25); I.render(); out.up = { drawn: c().drawn, dir: c().dir };
    return out;
  });
  check('1e facing by movement: chasing left mirrors the right strip, right uses it as is, up uses the up strip',
    /fernraptor_(move|attack|idle)_right/.test(face.left.drawn) && face.left.dir === 3 && /_right$/.test(face.right.drawn) && face.right.dir === 2 && /_up$/.test(face.up.drawn), JSON.stringify(face));
  const death = await ev(d.page, (I) => { I.clearCreatures(); const h = I.hero(); const before = I.deathsShown(); const uid = I.spawn('glimmerfrog', h.tx + 2, h.ty);
    for (let i = 0; i < 40 && I.creatures().some((c) => c.uid === uid); i++) { const c = I.creatures().find((x) => x.uid === uid); const hh = I.hero(); I.soothe(false); I.fire(c.x - hh.x, c.y - 8 - hh.y); I.step(0, 0, 0.1); }
    I.render(); const mid = I.deathsShown(); I.step(0, 0, 1.2); I.render(); I.render(); return { before, mid, gone: !I.creatures().some((c) => c.uid === uid), kills: I.stats().kills }; });
  check('1f a killed creature plays its death strip once from the pool', death.gone && death.kills >= 1 && death.mid === death.before + 1, JSON.stringify(death));

  // ---- 4 boss telegraph = roar ----
  const boss = await ev(d.page, (I) => {
    I.clearCreatures(); const h = I.hero(); const uid = I.spawn('fernjaw_tyrant', h.tx + 3, h.ty);
    const c = () => I.creatures().find((x) => x.uid === uid);
    let t = 0; while (t < 6 && c() && c().ph !== 'wind') { I.step(0, 0, 0.05); t += 0.05; }
    I.render(); const wind = c() ? { ph: c().ph, drawn: c().drawn, tg: c().tg } : null;
    I.step(0, 0, wind && wind.tg ? wind.tg.left * 0.6 : 0.2); I.render(); const late = c() ? { ph: c().ph, drawn: c().drawn } : null;
    let t2 = 0; while (t2 < 2 && c() && c().ph === 'wind') { I.step(0, 0, 0.02); t2 += 0.02; }
    I.render(); const after = c() ? { ph: c().ph, drawn: c().drawn } : null;
    return { wind, late, after };
  });
  check('4a the Fernjaw Tyrant wind-up telegraph plays its roar strip', boss.wind && boss.wind.ph === 'wind' && boss.wind.tg && boss.wind.tg.big && /^fernjaw_tyrant_roar_(down|up|right)$/.test(boss.wind.drawn), JSON.stringify(boss));
  check('4b the roar runs for the whole wind-up, then the bite uses the attack strip', /roar/.test(boss.late.drawn) && boss.after && /^fernjaw_tyrant_(attack|idle|move)_/.test(boss.after.drawn) && !/roar/.test(boss.after.drawn), JSON.stringify(boss));

  // ---- 5 fed chompbill eats ----
  const eat = await ev(d.page, (I) => {
    I.clearCreatures(); const h = I.hero(); const uid = I.spawn('chompbill', h.tx + 2, h.ty);
    const c = () => I.creatures().find((x) => x.uid === uid);
    for (let i = 0; i < 60 && c() && !c().calm; i++) { I.nextTo(uid, -40); I.step(0, 0, 0.2); }
    const r = I.feed(); I.render(); const now = c() ? c().drawn : null;
    I.step(0, 0, 1.0); I.render(); const later = c() ? c().drawn : 'tamed';
    return { calm: true, r, now, later };
  });
  check('5 a fed Chompbill plays its eat strip, then goes back to idle', eat.r && eat.r.ok && eat.now === 'chompbill_eat_down' && eat.later !== 'chompbill_eat_down', JSON.stringify(eat));

  // ---- 6 b33 props ----
  const props = await ev(d.page, (I) => Promise.resolve(I.propsReady()).then((p) => ({ p, baked: I.propsBaked() })));
  check('6 all 8 b33 jungle props load and are baked into chunks (PNG props by id, the rest stay code props)',
    props.p.props.length === 8 && props.baked.png > 0, JSON.stringify(props));
  check('1g desktop: no console errors, no offsite requests, 0 DB requests, every b31a / b32 / b33 PNG answered 200',
    d.errors.length === 0 && d.offsite.length === 0 && d.db.count() === 0 && d.pngs.length >= 91 && d.pngs.every((p) => p.s === 200), d.errors.concat(d.offsite).join(' | ') + ' pngs ' + d.pngs.length);

  // ---- 2 ?art=0 falls back ----
  const z = await open(browser, { viewport: { width: 1000, height: 700 } }, '&art=0');
  const zr = await ev(z.page, (I) => I.stripsReady());
  await ev(z.page, SETUP);
  const zp = await ev(z.page, PIXELS, { sp: 'fernraptor', pal: B31A_PAL });
  check('2a ?art=0 loads no strip or prop PNG and has no strip set', !zr.on && z.pngs.length === 0, JSON.stringify(zr) + ' ' + z.pngs.length);
  check('2b ?art=0 draws the code-drawn MMCreatureDraw bake (not the PNG palette)', zp.src === 'code' && zp.drawn === 'fernraptor' && zp.changed > 200 && zp.ratio < 0.2 && zp.ratio < px.ratio / 3, JSON.stringify(zp));
  check('2c ?art=0: no console errors, 0 DB requests', z.errors.length === 0 && z.db.count() === 0, z.errors.join(' | '));

  // a missing strip falls back per creature: block one glimmerfrog strip, the rest stay on PNG
  const mctx = await browser.newContext({ viewport: { width: 800, height: 600 } });
  const mdb = await blockDb(mctx);
  await mctx.route(/glimmerfrog_move_up\.png$/, (r) => r.fulfill({ status: 404, body: 'nope' }));
  const mp = await mctx.newPage(); const merr = [];
  mp.on('pageerror', (e) => merr.push(e.message)); mp.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) merr.push(m.text()); });
  await mp.goto(PAGE + '?test=1&seed=123');
  await mp.waitForFunction(() => window.__isles && window.__isles.world);
  const miss = await ev(mp, (I) => Promise.resolve(I.stripsReady()).then((r) => { I.pause(true); I.god(true); I.clearCreatures(); const t = I.findTile('jungle_floor', 10); I.teleport(t.x, t.y);
    const a = I.spawn('glimmerfrog', t.x + 2, t.y), b = I.spawn('fernraptor', t.x - 2, t.y); I.step(0, 0, 0.05); I.render();
    const cs = I.creatures(); return { kinds: r.kinds, frog: cs.find((c) => c.uid === a).src, raptor: cs.find((c) => c.uid === b).src }; }));
  check('2d a missing strip drops only that creature to the code bake', miss.kinds.indexOf('glimmerfrog') < 0 && miss.kinds.length === 6 && miss.frog === 'code' && miss.raptor === 'png' && merr.length === 0 && mdb.count() === 0, JSON.stringify(miss) + merr.join(' | '));
  await mctx.close();

  // ---- 3 ridden tusktop uses the saddle overlay ----
  const r = await open(browser, { viewport: { width: 800, height: 600 } }, '', { 'pixeltown-tames-v1': TUSK_SAVE });
  const ride = await ev(r.page, (I) => {
    I.pause(true); I.god(true); I.clearCreatures(); const t = I.findTile('jungle_floor', 10); I.teleport(t.x, t.y);
    const on = I.ride(); I.face(0, 1); I.render(); const idle = I.riding();
    I.step(1, 0, 0.2); I.render(); // the last sim step had input, so this frame draws the mount moving right
    return { on, idle, move: I.riding() };
  });
  const mv = ride.move;
  check('3a a ridden Tusktop draws its own strip plus the saddle overlay while idle (down)', ride.on && ride.idle.drawn === 'tusktop_idle_down' && ride.idle.saddle === 'tusktop_saddle_idle_down', JSON.stringify(ride));
  check('3b moving right it switches to the move strip and the saddle_move overlay', mv && mv.drawn === 'tusktop_move_right' && mv.saddle === 'tusktop_saddle_move_right', JSON.stringify(mv));
  check('3c riding keeps the ride stats (x1.3, lift 18) and no errors / DB traffic', mv.speed === 1.3 && mv.lift === 18 && r.errors.length === 0 && r.db.count() === 0, r.errors.join(' | '));

  // ---- 7 phone ----
  const p = await open(browser, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await ev(p.page, SETUP);
  const pp = await ev(p.page, PIXELS, { sp: 'fernraptor', pal: B31A_PAL });
  const scroll = await p.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  check('7 phone 390x844: the PNG strip draws at dpr 2, no horizontal scroll, no errors, 0 DB requests', pp.src === 'png' && pp.ratio > 0.6 && scroll && p.errors.length === 0 && p.db.count() === 0, JSON.stringify(pp) + p.errors.join(' | '));

  // ---- perf: the per-frame strip path allocates nothing ----
  const src = fs.readFileSync(path.join(__dirname, '..', 'games', 'isles', 'isles.js'), 'utf8');
  const lib = fs.readFileSync(path.join(__dirname, '..', 'shared', 'mm-creature-strips.js'), 'utf8');
  const fn = (s, name) => (s.match(new RegExp('function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n {2}\\}\\n')) || [''])[0];
  const meth = (s, name) => (s.match(new RegExp('\\n {6}' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n {6}\\}')) || [''])[0];
  const hot = [fn(src, 'stripOf'), fn(src, 'stripFrame'), fn(src, 'drawDeaths'), fn(src, 'render'), fn(lib, 'dirCode'), fn(lib, 'frameIndex'), fn(lib, 'actionFor'), fn(lib, 'seatOffset'), meth(lib, 'get'), meth(lib, 'draw')];
  const alloc = hot.filter((s) => s.length < 40 || /\.(slice|map|filter|sort|concat|push)\(|=\s*\{\s*\w+:|=\s*\[|new /.test(s));
  check('perf: strip picking / frame math / drawing build no arrays or objects per frame', alloc.length === 0, alloc.map((s) => s.slice(0, 60)).join(' || '));

  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
