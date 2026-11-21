// BIOME-ARCH-PLAN slice B9: taming in play on the Hearthvale Isles page (game/games/isles/).
// 1 a Fern Raptor is knocked out with soothe shots, fed and tamed; it is written to pixeltown-tames-v1, joins the party, follows the hero
//   and hits an angry boarhog; 2 with ?tame=0 the raptor just dies and nothing is written; 3 a big creature (Tusktop) shows its telegraph
//   for its full wind-up before any damage lands; 4 riding a tamed Tusktop scales hero speed by its ride speed (x1.3, 18 px lift) and
//   dismounting restores x1; ?mounts=0 and ?companions=0 switch those off; 5 a corrupt tames key loads the empty stable;
//   6 phone 390x844: Feed / Soothe / Ride are >= 44 px, the calm hint line fits, no horizontal scroll; perf: the creature cap holds and
//   the render loop builds no per-frame arrays; plus no console errors and 0 database requests everywhere.
// Run: BASE=http://localhost:8781/game/index.html NODE_PATH=$(npm root -g) node game/tests/isles-taming.test.js
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/isles/index.html';
const PROFILE = { v: 1, heroes: [{ id: 'h1', name: 'Fern', cls: 'druid', level: 7, xp: 10, items: [] }], stash: [], fame: 0, mode: 'classic', hall: [] };
const HERO_KEYS = { 'pixeltown-mm-v1': JSON.stringify(PROFILE), 'pixeltown-mm-active-v1': JSON.stringify({ v: 1, heroId: 'h1' }) };
const TUSK_SAVE = JSON.stringify({ v: 1, n: 1, roster: [{ id: 't1', sp: 'tusktop', nm: 'Tuskie', lv: 3, xp: 0, bond: 2, aff: 0, cos: '', isle: 'jungle', d: '2026-11-01' }], party: [], mount: 't1' });

const contexts = [];
async function open(browser, opts, query, seed) {
  const ctx = await browser.newContext(opts);
  const db = await blockDb(ctx);
  const page = await ctx.newPage();
  const errors = []; const offsite = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('request', (r) => { const u = r.url(); if (!u.startsWith(ORIGIN + '/') && !u.startsWith('data:')) offsite.push(u); });
  await page.addInitScript((s) => {
    if (sessionStorage.seeded) return;
    sessionStorage.seeded = '1';
    localStorage.clear();
    Object.keys(s || {}).forEach((k) => localStorage.setItem(k, s[k]));
  }, seed || {});
  await page.goto(PAGE + '?test=1&seed=123' + (query || ''));
  await page.waitForFunction(() => window.__isles && window.__isles.world);
  const o = { ctx, page, errors, offsite, db, name: query || 'default' };
  contexts.push(o);
  return o;
}
const ev = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__isles, ${JSON.stringify(arg === undefined ? null : arg)})`);
const frames = (page, n) => page.evaluate((k) => new Promise((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

// pause the live loop, clear the spawner, stand on an open run of land
async function setup(page) {
  return ev(page, (I) => { I.pause(true); I.god(true); I.clearCreatures(); const r = I.findTile(null, 13); I.teleport(r.x, r.y); I.step(0, 0, 0.05); return r; });
}
// knock a creature out with soothe shots (aimed at it every time), then feed it until tamed. Returns a report.
const KO_AND_TAME = (I, a) => {
  const h = I.hero();
  const uid = I.spawn(a.sp, h.tx + 3, h.ty);
  const get = () => I.creatures().find((c) => c.uid === uid) || null;
  const out = { uid, soothe: I.soothe(true), koShots: 0, ko: false, feeds: 0, tamed: false, maxTorpor: 0 };
  for (let i = 0; i < 80 && get() && !get().ko; i++) {
    const c = get(), hh = I.hero();
    I.fire(c.x - hh.x, c.y - 8 - hh.y); I.step(0, 0, 0.3); out.koShots++;
    if (get()) out.maxTorpor = Math.max(out.maxTorpor, get().torpor);
  }
  const c = get();
  out.ko = !!(c && c.ko); out.alive = !!c; out.afterKo = c;
  if (!out.ko) return out;
  I.soothe(false);
  I.nextTo(uid, -30);
  out.hintKo = I.hint();
  for (let i = 0; i < 20 && !out.tamed; i++) {
    const r = I.feed();
    if (r.ok) out.feeds++;
    if (r.tamed) { out.tamed = true; break; }
    I.step(0, 0, 6.2); I.nextTo(uid, -30);
  }
  out.gone = !get();
  return out;
};

(async () => {
  const browser = await chromium.launch();

  // ---- 1: tame a Fern Raptor; it is saved, follows, attacks ----
  const d = await open(browser, { viewport: { width: 1000, height: 700 } }, '', HERO_KEYS);
  await frames(d.page, 10);
  await setup(d.page);
  const t = await ev(d.page, KO_AND_TAME, { sp: 'fernraptor' });
  check('1a: soothe shots build torpor and knock the Fern Raptor out (it keeps its HP)', t.soothe === true && t.ko && t.alive && t.afterKo.hp > 0 && t.afterKo.st === 'ko', JSON.stringify(t).slice(0, 400));
  check('1b: the calm hint line tells you to feed it while it sleeps', /asleep/.test(t.hintKo) && /raw meat/.test(t.hintKo), t.hintKo);
  check('1c: feeding raw meat tames it (MMTame need reached)', t.tamed && t.gone && t.feeds >= 5, JSON.stringify({ feeds: t.feeds, tamed: t.tamed }));
  const saved = await ev(d.page, (I) => ({ tames: I.tames(), party: I.party(), isl: I.save(), st: I.stats(), pouch: I.pouch() }));
  const ent = saved.tames && saved.tames.roster.find((r) => r.sp === 'fernraptor');
  check('1d: the tamed fernraptor is in pixeltown-tames-v1 and in the party', !!ent && saved.tames.party.indexOf(ent.id) >= 0 && saved.tames.v === 1 && ent.isle === 'jungle' && /^\d{4}-\d{2}-\d{2}$/.test(ent.d), JSON.stringify(saved.tames));
  check('1e: the archipelago creature log records the KO and the tame', saved.isl.log.tamed.fernraptor === 1 && saved.isl.log.ko.fernraptor === 1 && saved.st.tamed === 1, JSON.stringify(saved.isl.log));
  check('1f: feeding used food from the pouch', saved.pouch.raw_meat === 12 - t.feeds, JSON.stringify(saved.pouch));
  check('1g: the companion is active in the party (MMCompanion, attack mode)', saved.party.length === 1 && saved.party[0].id === ent.id && saved.party[0].mode === 'attack' && saved.party[0].dmg > 0, JSON.stringify(saved.party));
  const follow = await ev(d.page, (I) => {
    I.clearCreatures();
    const r = I.findTile(null, 13); I.teleport(r.x, r.y); I.step(0, 0, 0.5);
    const a = I.hero(); I.step(1, 0, 1.4); I.step(0, 0, 1.5);
    const b = I.hero(), p = I.party()[0];
    return { walked: b.x - a.x, dist: Math.hypot(p.x - b.x, p.y - b.y) };
  });
  check('1h: the tame follows the hero (within 120 px after a 6-tile walk)', follow.walked > 150 && follow.dist <= 120, JSON.stringify(follow));
  const fight = await ev(d.page, (I) => {
    const h = I.hero(); const uid = I.spawn('boarhog', h.tx + 2, h.ty);
    I.anger(uid);
    const hp0 = I.creatures().find((c) => c.uid === uid).hp;
    for (let i = 0; i < 40; i++) I.step(0, 0, 0.1);
    const c = I.creatures().find((x) => x.uid === uid);
    return { hp0, hp1: c ? c.hp : 0, hits: I.party()[0].hits };
  });
  check('1i: the companion attacks an angry boarhog and damages it', fight.hits > 0 && fight.hp1 < fight.hp0, JSON.stringify(fight));

  // ---- 3: a big creature telegraphs before it hits ----
  const tg = await ev(d.page, (I) => {
    I.clearCreatures(); I.god(false);
    const r = I.findTile(null, 13); I.teleport(r.x, r.y); I.step(0, 0, 0.1);
    const h0 = I.hero(); const uid = I.spawn('tusktop', h0.tx + 2, h0.ty);
    I.nextTo(uid, -70);
    I.anger(uid);
    const hp0 = I.hero().hp; let tgAt = -1, hitAt = -1, maxLeft = 0, shape = '', big = false, windup = 0;
    for (let i = 0; i < 400 && hitAt < 0; i++) {
      I.step(0, 0, 1 / 60);
      const c = I.creatures().find((x) => x.uid === uid);
      if (c && c.tg && tgAt < 0) { tgAt = I.simT(); shape = c.tg.shape; big = c.tg.big; windup = c.tg.windup; }
      if (c && c.tg) maxLeft = Math.max(maxLeft, c.tg.left);
      if (I.hero().hp < hp0) hitAt = I.simT();
    }
    const log = I.hurtLog();
    I.god(true);
    return { tgAt, hitAt, shape, big, windup, maxLeft, size: (I.creatures().find((x) => x.uid === uid) || {}).size, log };
  });
  check('3: a Tusktop (L) shows a big line telegraph for its full wind-up before it deals damage',
    tg.size === 'L' && tg.big && tg.shape === 'line' && tg.tgAt >= 0 && tg.hitAt > tg.tgAt && tg.hitAt - tg.tgAt >= tg.windup - 0.02 && tg.windup >= 0.5 && tg.log.length > 0 && tg.log[0].tg >= 0,
    JSON.stringify(tg));
  check('1/3: desktop has no console errors', d.errors.length === 0, d.errors.join(' | '));

  // ---- 2: ?tame=0 -> the raptor just dies, nothing is written ----
  const z = await open(browser, { viewport: { width: 1000, height: 700 } }, '&tame=0', HERO_KEYS);
  await setup(z.page);
  const zr = await ev(z.page, KO_AND_TAME, { sp: 'fernraptor' });
  const zs = await ev(z.page, (I) => ({ flags: I.flags(), st: I.stats(), tames: I.tames(), party: I.party() }));
  check('2: with ?tame=0 the raptor is never KO\'d and simply dies; no tames are written', zs.flags.tame === false && zr.soothe === false && !zr.ko && !zr.alive && zr.maxTorpor === 0 &&
    zs.st.kills === 1 && zs.st.tamed === 0 && zs.tames === null && zs.party.length === 0, JSON.stringify({ zr: { ko: zr.ko, alive: zr.alive, shots: zr.koShots }, zs }));
  check('2b: ?tame=0 hides the Feed and Soothe buttons', await z.page.evaluate(() => document.getElementById('btn-feed').hidden && document.getElementById('btn-soothe').hidden));

  // ---- ?companions=0 -> the tame is saved but no companion walks with you ----
  const nc = await open(browser, { viewport: { width: 1000, height: 700 } }, '&companions=0', HERO_KEYS);
  await setup(nc.page);
  const ncr = await ev(nc.page, KO_AND_TAME, { sp: 'fernraptor' });
  const ncs = await ev(nc.page, (I) => ({ tames: I.tames(), party: I.party() }));
  check('?companions=0: the tame is recorded but no companion spawns', ncr.tamed && ncs.tames && ncs.tames.roster.length === 1 && ncs.party.length === 0, JSON.stringify(ncs));

  // ---- 4: mount a tamed Tusktop ----
  const m = await open(browser, { viewport: { width: 1000, height: 700 } }, '', Object.assign({ 'pixeltown-tames-v1': TUSK_SAVE }, HERO_KEYS));
  await frames(m.page, 8);
  const mm = await ev(m.page, (I) => {
    I.pause(true); I.god(true); I.clearCreatures();
    const r = I.findTile(null, 13);
    const walk = () => { I.teleport(r.x, r.y); I.step(0, 0, 0.02); const a = I.hero(); const b = I.step(1, 0, 0.5); return { dx: b.x - a.x, scale: b.scale }; };
    const foot = walk();
    const on = I.ride(); const riding = I.riding();
    const rode = walk();
    const off = I.ride();
    const after = walk();
    return { mountId: I.mountId(), foot, on, riding, rode, off, after, riding2: I.riding() };
  });
  const rideBtn = await m.page.evaluate(() => { const b = document.getElementById('btn-ride'); const r = b.getBoundingClientRect(); return { hidden: b.hidden, w: r.width, h: r.height }; });
  check('4a: a tamed Tusktop from the save is the mount and the Ride button shows', mm.mountId === 't1' && !rideBtn.hidden && rideBtn.w >= 44 && rideBtn.h >= 44, JSON.stringify({ id: mm.mountId, rideBtn }));
  check('4b: riding gives the Tusktop move scale x1.3 and an 18 px lift', mm.on === true && mm.riding && mm.riding.speed === 1.3 && mm.riding.lift === 18 && mm.riding.overlay === -18 &&
    Math.abs(mm.rode.scale - 1.3) < 1e-9 && Math.abs(mm.rode.dx / mm.foot.dx - 1.3) < 0.02, JSON.stringify(mm));
  check('4c: dismounting restores x1 hero speed', mm.off === false && mm.riding2 === null && mm.after.scale === 1 && Math.abs(mm.after.dx - mm.foot.dx) < 0.5, JSON.stringify(mm.after));
  const nm = await open(browser, { viewport: { width: 1000, height: 700 } }, '&mounts=0', Object.assign({ 'pixeltown-tames-v1': TUSK_SAVE }, HERO_KEYS));
  const nmr = await ev(nm.page, (I) => ({ on: I.ride(), riding: I.riding(), flags: I.flags(), btn: document.getElementById('btn-ride').hidden }));
  check('4d: ?mounts=0 never mounts and hides the Ride button', nmr.on === false && nmr.riding === null && nmr.flags.mounts === false && nmr.btn, JSON.stringify(nmr));

  // ---- 5: corrupt tames key -> defaults ----
  const bad = await open(browser, { viewport: { width: 800, height: 600 } }, '', { 'pixeltown-tames-v1': '{"roster":[{"id":"<b>","sp":5}],"party":"zz","mount":{}' });
  const bad2 = await open(browser, { viewport: { width: 800, height: 600 } }, '', { 'pixeltown-tames-v1': JSON.stringify({ v: 9, n: 'x', roster: [{ id: 't1', sp: 'Bad Species!' }, 7, null], party: ['t1', 't1', 'q'], mount: 't1' }) });
  const b1 = await ev(bad.page, (I) => ({ t: I.tamesLive(), party: I.party(), mount: I.mountId() }));
  const b2 = await ev(bad2.page, (I) => ({ t: I.tamesLive(), party: I.party(), mount: I.mountId() }));
  const DEF = JSON.stringify({ v: 1, n: 0, roster: [], party: [], mount: null });
  check('5: a corrupt or hostile tames key loads the empty stable (no party, no mount, no errors)',
    JSON.stringify(b1.t) === DEF && JSON.stringify(b2.t) === DEF && b1.party.length === 0 && b2.mount === null && bad.errors.length === 0 && bad2.errors.length === 0,
    JSON.stringify({ b1, b2, e: bad.errors.concat(bad2.errors) }));

  // ---- 6: phone 390x844 ----
  const p = await open(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, '', HERO_KEYS);
  await frames(p.page, 10);
  await setup(p.page);
  const pr = await ev(p.page, (I) => {
    const h = I.hero(); const uid = I.spawn('fernraptor', h.tx + 3, h.ty); I.soothe(true);
    const get = () => I.creatures().find((c) => c.uid === uid);
    for (let i = 0; i < 80 && get() && !get().ko; i++) { const c = get(), hh = I.hero(); I.fire(c.x - hh.x, c.y - 8 - hh.y); I.step(0, 0, 0.3); }
    I.soothe(false); I.nextTo(uid, -30); I.step(0, 0, 0.3);
    return { uid, ko: get() && get().ko };
  });
  await ev(p.page, (I) => I.pause(false));
  await frames(p.page, 20);
  await ev(p.page, (I) => I.pause(true));
  const lay = await p.page.evaluate(() => {
    const r = (id) => { const el = document.getElementById(id); const b = el.getBoundingClientRect(); return { w: b.width, h: b.height, x: b.left, r: b.right, t: b.top, bt: b.bottom, hidden: el.hidden }; };
    return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, bw: document.body.scrollWidth, feed: r('btn-feed'), soothe: r('btn-soothe'), fire: r('btn-fire'), stick: r('stick'), hint: r('hint'), hintText: document.getElementById('hint').textContent };
  });
  check('6a: phone: no horizontal scroll', lay.sw <= lay.cw && lay.bw <= lay.cw, JSON.stringify(lay));
  check('6b: phone: Feed and Soothe buttons are >= 44 px and on screen', pr.ko && !lay.feed.hidden && [lay.feed, lay.soothe].every((b) => b.w >= 44 && b.h >= 44 && b.x >= 0 && b.r <= lay.cw), JSON.stringify(lay));
  check('6c: phone: buttons do not overlap the joystick or Fire', [lay.feed, lay.soothe].every((b) => b.x >= lay.stick.r && b.r <= lay.fire.x), JSON.stringify(lay));
  check('6d: phone: the calm hint line shows and fits the screen', !lay.hint.hidden && lay.hintText.length > 10 && lay.hint.x >= 0 && lay.hint.r <= lay.cw && lay.hint.bt <= lay.stick.t, JSON.stringify(lay.hint) + lay.hintText);
  const prog0 = await ev(p.page, (I, u) => I.creatures().find((c) => c.uid === u).prog, pr.uid);
  await p.page.tap('#btn-feed');
  const prog1 = await ev(p.page, (I, u) => (I.creatures().find((c) => c.uid === u) || { prog: 99 }).prog, pr.uid);
  check('6e: phone: tapping Feed feeds the sleeping raptor', prog1 > prog0, prog0 + ' -> ' + prog1);
  // perf: the cap holds, and the frame loop stays light with a full field
  const perf = await ev(p.page, (I) => {
    I.clearCreatures(); const h = I.hero(); let n = 0;
    for (let i = 0; i < 40; i++) if (I.spawn(['raptor_jr', 'parrotlet', 'boarhog', 'shellback'][i % 4], h.tx + (i % 8) - 4, h.ty + Math.floor(i / 8) - 2)) n++;
    return { n, cap: I.stats().cap, live: I.creatures().length };
  });
  check('perf: active creatures are capped (24) even when asked for 40', perf.n === 24 && perf.live <= perf.cap && perf.cap === 24, JSON.stringify(perf));
  const ft = await p.page.evaluate(() => new Promise((res) => {
    window.__isles.pause(false); const ts = []; let last = performance.now(), i = 0;
    const f = (now) => { ts.push(now - last); last = now; if (++i < 150) requestAnimationFrame(f); else { ts.sort((a, b) => a - b); res({ med: ts[75], p95: ts[142] }); } };
    requestAnimationFrame(f);
  }));
  check('perf: median frame under 25 ms on the phone viewport with a full field', ft.med < 25, JSON.stringify(ft));
  const src = fs.readFileSync(path.join(__dirname, '..', 'games', 'isles', 'isles.js'), 'utf8');
  const renderSrc = (src.match(/function render\(\) \{[\s\S]*?\n {2}\}\n/) || [''])[0];
  check('perf: the render loop builds no per-frame arrays (no slice / map / filter / sort / concat)', renderSrc.length > 500 && !/\.(slice|map|filter|sort|concat)\(/.test(renderSrc), renderSrc.length);
  check('6f: phone has no console errors', p.errors.length === 0, p.errors.join(' | '));

  // ---- everywhere: no console errors, 0 DB requests, nothing off-origin; source grep ----
  check('no console errors in any context', contexts.every((c) => c.errors.length === 0), contexts.map((c) => c.name + ':' + c.errors.join('|')).filter((x) => !/:$/.test(x)).join(' ; '));
  check('blockDb saw 0 database requests and nothing went off-origin', contexts.every((c) => c.db.count() === 0 && c.offsite.length === 0), contexts.map((c) => c.offsite.join(' ')).join(' '));
  const dir = path.join(__dirname, '..', 'games', 'isles');
  const all = fs.readdirSync(dir).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
  check('the isles page never mentions firebase, net.js or Phaser and never writes pixeltown-save-v1', !/firebase/i.test(all) && !/net\.js/.test(all) && !/phaser/i.test(all) && !/pixeltown-save-v1/.test(all));
  for (const c of contexts) await c.ctx.close();
  await browser.close();
  done();
})();
