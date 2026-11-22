// NEXT-SLICES-2 slice X6 (isle bosses + boss-tame) on the Hearthvale Isles page (game/games/isles/), with MMIsleBoss.
// 1 each pack's bosses[0] spawns at its boss site inside a boss_arena_ring (code ring until the b33 PNG is delivered; the art path works
//   with an image), every attack's telegraph is drawn for its whole wind-up, and reduced motion draws it static;
// 2 the hero kills each of the 4 bosses with god(false) (a dodging bot, no deaths), over a seeded run the hero is hurt only inside live
//   telegraphed shapes (re-checked here with MMIsleBoss.hitTest), phases change at 70% and 35% HP, weary at 10%;
// 3 boss-tame: at weary a `feast` from `inv` starts it, soothe shots + feasts finish it, the Fernjaw Tyrant is saved as an alpha in
//   pixeltown-tames-v1 and rides with a crafted saddle_tyrant (X4 rules, incl. the grandfather gift); ?tame=0: it just dies and the stable
//   is never written; a kill / tame counts the boss medal. Phone 390x844, 0 console errors, 0 DB requests throughout.
// Run: BASE=http://localhost:8911/game/index.html NODE_PATH=$(npm root -g) node game/tests/isles-boss.test.js
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const B = require('../shared/mm-isle-boss.js');
const BP = require('../shared/mm-biome-packs.js');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/isles/index.html';
const TOWN = '{"realm":{"level":3},"name":"Bo"}';
const TAMES = 'pixeltown-tames-v1';
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 };
const DESK = { viewport: { width: 1000, height: 700 } };
const SHOTS = process.env.SHOTS || '';
const ISLES = { jungle: 'jungle', reef: 'reef', ice: 'tundra', mars: 'mars' };
const all = [];

async function open(browser, opts, query, seed) {
  const ctx = await browser.newContext(opts);
  const db = await blockDb(ctx);
  const page = await ctx.newPage();
  const errors = [], reqs = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('request', (r) => reqs.push(r.url()));
  await page.addInitScript((s) => {
    if (sessionStorage.seeded) return;
    sessionStorage.seeded = '1';
    localStorage.clear();
    Object.keys(s || {}).forEach((k) => localStorage.setItem(k, s[k]));
  }, Object.assign({ 'pixeltown-save-v1': TOWN }, seed || {}));
  await page.goto(PAGE + '?test=1' + (query || ''));
  await ready(page);
  const o = { ctx, page, errors, db, reqs }; all.push(o); return o;
}
const ready = (page) => page.waitForFunction(() => window.__isles && window.__isles.world, null, { timeout: 15000 });
const ev = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__isles, ${JSON.stringify(arg === undefined ? null : arg)})`);
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png') }); };

// The in-page fight bot. o: {secs, god, dodge, wander, seed, render, until ('weary'|state), fire, soothe, placeAt}
const FIGHT = (I, o) => {
  const BS = window.MMIsleBoss, T = I.tile, dt = 1 / 30;
  I.pause(true); I.god(!!o.god); I.clearCreatures();
  if (!I.boss().st) I.bossSpawn();
  const site = I.boss().site;
  if (o.placeAt !== false) I.place(site.px + 180, site.py + 20);
  let s = 1 >>> 0; for (let i = 0; i < String(o.seed || 'x').length; i++) s = (Math.imul(s ^ String(o.seed || 'x').charCodeAt(i), 2654435761) >>> 0) || 1;
  const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  const okTile = (x, y) => { const tx = Math.floor(x / T), ty = Math.floor(y / T); return I.walkable(tx, ty) && !I.heroSolid(tx, ty); };
  const clearShot = (x, y, bx, by) => { for (let k = 1; k < 12; k++) { const px = x + (bx - x) * k / 12, py = y + (by - y) * k / 12; if (I.isSolid(Math.floor(px / T), Math.floor(py / T))) return false; } return true; };
  // zones that can hit within [now, now + h]: telegraphs go live at t0 + windup, live ones run until t0 + dur (spirals spin, so sample tau)
  const zonesOf = (b) => b.tele.map((z) => ({ z: z.zone, ta: z.t0 + z.windup, dur: z.shape === 'spiral' ? 2.7 : 0.45 })).concat(b.live.map((L) => ({ z: L.zone, ta: L.t0, dur: L.dur + 0.02 })));
  const threat = (zs, x, y, now, h) => zs.some((q) => {
    const a = Math.max(now, q.ta), e = Math.min(q.ta + q.dur, now + h);
    for (let t = a; t <= e + 1e-9; t += 0.05) if (BS.hitTest(q.z, x, y, t - q.ta) || BS.hitTest(q.z, x + 9, y, t - q.ta) || BS.hitTest(q.z, x - 9, y, t - q.ta) || BS.hitTest(q.z, x, y + 9, t - q.ta) || BS.hitTest(q.z, x, y - 9, t - q.ta)) return true;
    return false;
  });
  let t = 0, fireT = 0, deaths = 0, minHp = 1e9, moves = 0, wanderT = 0, frames = 0, wasDead = false;
  const tgSamples = [];
  while (t < o.secs) {
    const b = I.boss();
    if (!b.st || b.done) break;
    if (o.until && b.st === o.until) break;
    const h = I.hero(), now = I.simT();
    if (o.dodge && b.st === 'fight') {
      const zs = zonesOf(b);
      if (zs.length && threat(zs, h.x, h.y, now, 0.7)) {
        let best = null, bd = 1e9;
        for (const r of [90, 130, 170, 210, 250, 285]) for (let k = 0; k < 32; k++) {
          const a = k / 32 * Math.PI * 2, x = b.x + Math.cos(a) * r, y = b.y - 30 + Math.sin(a) * r;
          if (!okTile(x, y) || threat(zs, x, y, now, 1.2)) continue;
          const d = Math.hypot(x - h.x, y - h.y);
          if (d < bd && clearShot(x, y - 6, b.x, b.y - 36)) { bd = d; best = { x, y }; }
        }
        if (!best) for (const r of [330, 380, 430, 480]) for (let k = 0; k < 32; k++) { // nothing in bolt range is safe (a spiral): back off out of it
          const a = k / 32 * Math.PI * 2, x = b.x + Math.cos(a) * r, y = b.y + Math.sin(a) * r;
          if (!okTile(x, y) || threat(zs, x, y, now, 1.2) || Math.hypot(x - site.px, y - site.py) > b.arenaR * 1.3) continue;
          const d = Math.hypot(x - h.x, y - h.y); if (d < bd) { bd = d; best = { x, y }; }
        }
        if (best) { I.place(best.x, best.y); moves++; }
      } else if (!zs.length && Math.hypot(h.x - b.x, h.y - b.y) > 290) { // walk back into range between attacks
        for (const r of [200, 240]) for (let k = 0; k < 32 && Math.hypot(I.hero().x - b.x, I.hero().y - b.y) > 290; k++) { const a = k / 32 * Math.PI * 2, x = b.x + Math.cos(a) * r, y = b.y - 30 + Math.sin(a) * r; if (okTile(x, y) && clearShot(x, y - 6, b.x, b.y - 36)) I.place(x, y); }
      }
    }
    if (o.wander && (wanderT -= dt) <= 0) {
      wanderT = 0.45;
      for (let k = 0; k < 20; k++) { const a = rnd() * Math.PI * 2, r = 40 + rnd() * 300, x = b.x + Math.cos(a) * r, y = b.y + Math.sin(a) * r; if (okTile(x, y)) { I.place(x, y); break; } }
      if (I.hero().hp < 9) I.heal();
    }
    if (o.fire !== false && (fireT -= dt) <= 0) { const hh = I.hero(); if (Math.hypot(b.x - hh.x, b.y - 36 - hh.y) < 300) { I.fire(b.x - hh.x, b.y - 36 - hh.y); fireT = 0.25; } }
    I.step(0, 0, dt);
    if (o.render) { I.render(); frames++; const bb = I.boss(); if (bb.tele.length) tgSamples.push({ id: bb.tele[0].id, frac: bb.tg.frac, alpha: bb.tg.alpha, p: (I.simT() - bb.tele[0].t0) / bb.tele[0].windup }); }
    const h2 = I.hero();
    if (h2.dead && !wasDead) deaths++;
    wasDead = h2.dead; minHp = Math.min(minHp, h2.hp);
    t += dt;
  }
  return { t, boss: I.boss(), log: I.bossLog(), lost: I.heroLost(), deaths, minHp, moves, frames, tg: tgSamples.slice(0, 400), stats: I.stats(), medals: I.medals(), drops: I.drops() };
};

(async () => {
  const browser = await chromium.launch();
  const src = fs.readFileSync(path.join(__dirname, '..', 'games', 'isles', 'isles.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'games', 'isles', 'index.html'), 'utf8');
  check('0: the page loads mm-isle-boss.js and no network module / firebase; DOM text only', /mm-isle-boss\.js/.test(html) && !/firebase|net\.js/i.test(html) && !/firebase/i.test(src) && !/innerHTML|insertAdjacentHTML|outerHTML/.test(src));

  // ---- 1 + 2: every island's boss: spawn at the site, arena ring, telegraphs, a god(false) kill with the dodging bot ----
  const kills = {};
  for (const isle of Object.keys(ISLES)) {
    const o = await open(browser, DESK, '&isle=' + isle + '&seed=7');
    const pack = ISLES[isle], want = BP.get(pack).bosses[0].boss;
    const sp = await ev(o.page, (I) => {
      I.pause(true); I.god(true); I.clearCreatures();
      const b = I.boss(); I.teleport(b.site.x + 3, b.site.y + 14); I.step(0, 0, 0.6); I.render();
      const s = I.boss(); return { id: s.id, st: s.st, x: s.x, y: s.y, site: s.site, bossSite: I.world.bossSites.find((q) => q.boss === s.id) || null, engaged: s.engaged, arena: s.arenaSrc, drawn: s.arenaDrawn, r: s.arenaR };
    });
    check('1: ' + isle + ': ' + want + ' (bosses[0]) spawns at its boss site, idle until you step into the ring', sp.id === want && sp.st === 'fight' && !!sp.bossSite && sp.site.x === sp.bossSite.x && sp.site.y === sp.bossSite.y &&
      sp.x === sp.site.px && sp.y === sp.site.py && sp.engaged === false, JSON.stringify(sp));
    check('1: ' + isle + ': the boss_arena_ring is drawn from code (no PNG delivered yet) at the arena radius', sp.arena === 'code' && sp.drawn > 0 && sp.r === B.K.ARENA_R && !o.reqs.some((u) => /boss_arena_ring/.test(u)), JSON.stringify(sp));
    const r = await ev(o.page, FIGHT, { secs: 260, god: false, dodge: true, render: isle === 'jungle', seed: isle });
    kills[isle] = r;
    const tele = r.log.tele;
    check('2: ' + isle + ': the hero kills the ' + want + ' with god(false) and never goes down', r.boss.done === 'dead' && r.deaths === 0 && r.minHp > 0 && r.stats.kills >= 1, JSON.stringify({ done: r.boss.done, st: r.boss.st, hp: r.boss.hp, t: r.t, deaths: r.deaths, minHp: r.minHp, lost: r.lost, moves: r.moves }));
    check('1: ' + isle + ': every attack showed its telegraph for its whole wind-up before the hit (' + tele.length + ' attacks)', tele.length >= 3 && tele.every((x) => x.windup >= 0.6 && x.t0 >= 0 && x.th - x.t0 >= x.windup - 1e-6),
      JSON.stringify(tele.filter((x) => !(x.windup >= 0.6 && x.th - x.t0 >= x.windup - 1e-6)).slice(0, 3)));
    const ph = r.log.phase;
    check('2: ' + isle + ': phases change at 70% and 35% HP', ph.length === 2 && ph[0].phase === 1 && ph[0].frac <= 0.7 && ph[0].frac > 0.68 && ph[1].phase === 2 && ph[1].frac <= 0.35 && ph[1].frac > 0.33, JSON.stringify(ph));
    check('2: ' + isle + ': weary at 10%, then the kill; every hit on the hero came from a telegraphed live shape', r.log.ev.weary === 1 && r.log.ev.dead === 1 && r.log.hurt.every((x) => x.tele && B.hitTest(x.zone, x.x, x.y, x.tau)) && r.lost === r.log.hurtTotal, JSON.stringify({ ev: r.log.ev, lost: r.lost, tot: r.log.hurtTotal }));
    check('2: ' + isle + ': the kill counts the boss medal and notes it in save.beat; loot drops', r.medals.indexOf('boss_' + want) >= 0 && (await ev(o.page, (I) => I.save().beat || [])).indexOf(want) >= 0 && r.drops.some((d) => d.sp === want), JSON.stringify({ m: r.medals, d: r.drops }));
    if (isle === 'jungle') {
      check('1: jungle: each telegraph was drawn every frame from its start until the hit', tele.every((x) => x.drawn >= Math.floor(x.windup * 30) - 2 && x.first - x.t0 <= 1 / 30 + 1e-6 && x.th - x.last <= 1 / 30 + 1e-6), JSON.stringify(tele.slice(0, 3)));
      const ids = {}; r.tg.forEach((q) => { (ids[q.id] = ids[q.id] || []).push(q); });
      const grow = Object.values(ids).filter((l) => l.length > 8 && l[0].frac < 0.25 && l[l.length - 1].frac > 0.8 && l[l.length - 1].alpha > l[0].alpha && l.every((q, i) => i === 0 || q.frac >= l[i - 1].frac));
      check('1: without reduced motion the telegraph fill grows with the wind-up', grow.length >= 3, JSON.stringify(Object.values(ids).slice(0, 3).map((l) => [l.length, l[0], l[l.length - 1]])));
    }
    check('1+2: ' + isle + ': 0 console errors, 0 DB requests', o.errors.length === 0 && o.db.count() === 0, o.errors.join(' | '));
  }

  // ---- 1: art path + reduced motion ----
  const A = await open(browser, DESK, '&isle=jungle&seed=7');
  const art = await ev(A.page, (I) => { I.pause(true); I.god(true); I.clearCreatures(); const b = I.boss(); I.teleport(b.site.x, b.site.y + 6); I.step(0, 0, 0.6); I.render(); const c = I.boss().arenaSrc; I.arenaArt(true); I.render(); const p = I.boss().arenaSrc; I.arenaArt(false); I.render(); return { c, p, back: I.boss().arenaSrc, ARENA: window.MMIsleArt.ARENA }; });
  check('1: with the b33 boss_arena_ring image loaded the ring draws the PNG, else the code ring', art.c === 'code' && art.p === 'png' && art.back === 'code' && art.ARENA.id === 'boss_arena_ring' && art.ARENA.w === 128, JSON.stringify(art));
  const R = await open(browser, Object.assign({ reducedMotion: 'reduce' }, DESK), '&isle=jungle&seed=7');
  const rm = await ev(R.page, FIGHT, { secs: 14, god: true, render: true, seed: 'rm' });
  check('1: reduced motion: telegraphs are static (one fill, one alpha, every frame)', rm.boss.reduced === true && rm.tg.length > 20 && rm.tg.every((q) => q.frac === 1 && q.alpha === 0.3) && rm.log.tele.length >= 2, JSON.stringify({ n: rm.tg.length, f: rm.tg.slice(0, 2), r: rm.boss.reduced }));
  await shot(R.page, 'isles-boss-reduced');

  // ---- 2: a seeded run where the hero wanders the arena (god off): hurt only inside live telegraphed shapes ----
  const S = await open(browser, DESK, '&isle=jungle&seed=11');
  const wr = await ev(S.page, FIGHT, { secs: 40, god: false, wander: true, fire: false, seed: 'wander-11' });
  const wr2 = await ev(S.page, FIGHT, { secs: 40, god: false, wander: true, fire: false, seed: 'wander-11', placeAt: false });
  const hurts = wr2.log.hurt;
  check('2: seeded wander run: the hero was hit ' + hurts.length + ' times, every one inside a live shape that had been telegraphed', hurts.length >= 3 && hurts.every((x) => x.tele && x.tau >= 0 && x.tau <= 2.7 && B.hitTest(x.zone, x.x, x.y, x.tau)), JSON.stringify(hurts.slice(0, 2)));
  check('2: seeded wander run: all HP lost came from those hits (no other source)', wr2.lost === wr2.log.hurtTotal && wr2.lost > 0, JSON.stringify({ lost: wr2.lost, tot: wr2.log.hurtTotal }));
  check('2: seeded wander run: no hit ever lands for more than 1.2 x the boss damage (no instant kills)', hurts.every((x) => x.lost <= Math.round(3.4 * 1.2) + 1) && wr.log.ev.telegraph > 5, JSON.stringify(hurts.map((x) => x.lost)));

  // ---- 3: boss-tame of the Fernjaw Tyrant ----
  const M = await open(browser, DESK, '&isle=jungle&seed=7');
  const tm = await ev(M.page, (I, FIGHT_SRC) => {
    const fight = eval('(' + FIGHT_SRC + ')');
    const w = fight(I, { secs: 120, god: true, until: 'weary', seed: 'tame' });
    const b = I.boss(); I.place(b.x + 90, b.y);
    const out = { weary: w.boss.st, frac: b.hp / b.hpMax, feedable: b.feedable, tameable: b.tameable };
    out.nofood = I.feed();
    I.give('feast', 8);
    out.start = I.feed(); out.st1 = I.boss().st; out.feast1 = I.inv().feast;
    I.soothe(true);
    let t = 0;
    while (t < 60 && !(I.boss().tame && I.boss().tame.asleep)) { const bb = I.boss(), h = I.hero(); I.fire(bb.x - h.x, bb.y - 36 - h.y); I.step(0, 0, 0.25); t += 0.25; }
    out.asleep = !!(I.boss().tame && I.boss().tame.asleep); out.sootheT = t;
    I.soothe(false);
    let feeds = 0;
    out.hit = I.feed(); feeds++; // a feast while asleep
    for (let k = 0; k < 10 && I.boss().st === 'taming'; k++) { I.step(0, 0, 10.2); const r = I.feed(); if (r.ok) feeds++; }
    out.feeds = feeds; out.done = I.boss().done; out.feastLeft = I.inv().feast || 0;
    out.tames = I.tames(); out.medals = I.medals(); out.beat = I.save().beat; out.mount = I.mountId();
    out.ride1 = I.ride(); out.riding1 = I.riding();
    I.give('hide', 3); I.give('amber', 3); I.give('vine_rope', 2);
    out.craft = I.craft('saddle_tyrant');
    out.ride2 = I.ride(); out.riding2 = I.riding(); out.saddles = I.saddles();
    return out;
  }, FIGHT.toString());
  const ent = tm.tames && tm.tames.roster.find((t) => t.sp === 'fernjaw_tyrant');
  check('3: at weary (10% HP) the Fernjaw Tyrant can be fed; with no feast in inv nothing starts', tm.weary === 'weary' && tm.frac < 0.1 && tm.frac > 0.09 && tm.feedable && tm.tameable && tm.nofood.why === 'nofood', JSON.stringify(tm).slice(0, 300));
  check('3: a feast from inv starts the boss-tame (one feast used)', tm.start.ok && tm.start.started && tm.st1 === 'taming' && tm.feast1 === 7, JSON.stringify(tm.start));
  check('3: soothe shots put it to sleep, more feasts tame it (each feed uses one feast)', tm.asleep && tm.done === 'tamed' && tm.feeds >= 2 && tm.feastLeft === 7 - tm.feeds, JSON.stringify({ a: tm.asleep, s: tm.sootheT, f: tm.feeds, d: tm.done, l: tm.feastLeft }));
  check('3: the tamed Fernjaw Tyrant is saved as an alpha in pixeltown-tames-v1 (cos alpha, its wild level) and is your mount', !!ent && ent.cos === 'alpha' && ent.lv === 14 && tm.tames.mount === ent.id && tm.mount === ent.id, JSON.stringify(tm.tames));
  check('3: the tame counts the boss medal and the XL / first tame medals; save.beat notes it', ['boss_fernjaw_tyrant', 'tame_xl', 'tame1'].every((m) => tm.medals.indexOf(m) >= 0) && (tm.beat || []).indexOf('fernjaw_tyrant') >= 0, JSON.stringify(tm.medals));
  check('3: it rides only with a crafted saddle_tyrant in inv (X4 rule), then rides at x1.5', tm.ride1 === false && tm.riding1 === null && tm.craft.ok && tm.ride2 === true && tm.riding2 && tm.riding2.id === ent.id && tm.riding2.speed === 1.5 && tm.saddles.gift === null, JSON.stringify({ c: tm.craft, r: tm.riding2, s: tm.saddles }));
  await M.page.reload(); await ready(M.page);
  const rl = await ev(M.page, (I) => ({ t: I.tames(), m: I.mountId(), inv: I.inv() }));
  const ent2 = rl.t.roster.find((t) => t.sp === 'fernjaw_tyrant');
  check('3: after a reload the alpha, the mount and the saddle are still there', !!ent2 && ent2.cos === 'alpha' && rl.m === ent2.id && rl.inv.saddle_tyrant === 1, JSON.stringify(rl));
  // X4 grandfather rule: a Tyrant you already rode before saddles existed gets its saddle once, free
  const gf = JSON.stringify({ v: 1, n: 1, roster: [{ id: 't1', sp: 'fernjaw_tyrant', nm: 'Rex', lv: 14, xp: 0, bond: 3, aff: 0, cos: 'alpha', isle: 'jungle', d: '2026-11-01' }], party: [], mount: 't1' });
  const G = await open(browser, DESK, '&isle=jungle&seed=7', { [TAMES]: gf });
  const gr = await ev(G.page, (I) => { I.pause(true); I.god(true); I.clearCreatures(); return { s: I.saddles(), inv: I.inv(), ride: I.ride(), t: I.tames() }; });
  check('3: grandfather (X4): an old Tyrant mount gets one free saddle_tyrant and rides; the alpha mark survives', gr.s.gift === 'saddle_tyrant' && gr.inv.saddle_tyrant === 1 && gr.ride === true && gr.t.roster[0].cos === 'alpha', JSON.stringify(gr));

  // ---- 3: ?tame=0 -> the boss just dies; nothing is written to the stable ----
  const N = await open(browser, DESK, '&isle=jungle&seed=7&tame=0');
  const nt = await ev(N.page, (I, FIGHT_SRC) => {
    const fight = eval('(' + FIGHT_SRC + ')');
    const w = fight(I, { secs: 120, god: true, until: 'weary', seed: 'n' });
    I.give('feast', 3); const b = I.boss(); I.place(b.x + 90, b.y);
    const f = I.feed(), fb = I.boss().feedable;
    const k = fight(I, { secs: 60, god: true, seed: 'n2', placeAt: false });
    return { w: w.boss.st, f, fb, done: k.boss.done, feast: I.inv().feast, raw: localStorage.getItem('pixeltown-tames-v1'), medals: I.medals(), flags: I.flags() };
  }, FIGHT.toString());
  check('3: ?tame=0: at weary feeding does nothing, the boss just dies', nt.w === 'weary' && nt.f.ok === false && nt.fb === false && nt.done === 'dead' && nt.feast === 3 && nt.flags.tame === false, JSON.stringify(nt));
  check('3: ?tame=0: pixeltown-tames-v1 is never written; the kill still counts the boss medal', nt.raw === null && nt.medals.indexOf('boss_fernjaw_tyrant') >= 0, JSON.stringify(nt));
  // an untameable boss (Tide Hydra) at weary: no feeding offered
  const H = await open(browser, DESK, '&isle=reef&seed=7');
  const hy = await ev(H.page, (I, FIGHT_SRC) => { const fight = eval('(' + FIGHT_SRC + ')'); const w = fight(I, { secs: 120, god: true, until: 'weary', seed: 'h' }); I.give('feast', 2); const b = I.boss(); I.place(b.x + 90, b.y); return { st: w.boss.st, tameable: b.tameable, feedable: b.feedable, f: I.feed(), raw: localStorage.getItem('pixeltown-tames-v1') }; }, FIGHT.toString());
  check('3: the Tide Hydra (no tame) is never feedable at weary and writes no stable', hy.st === 'weary' && hy.tameable === false && hy.feedable === false && hy.f.ok === false && hy.raw === null, JSON.stringify(hy));

  // ---- phone 390x844: a live boss fight, the boss bar clear of the controls ----
  const P = await open(browser, PHONE, '&isle=jungle&seed=7');
  await ev(P.page, (I) => Promise.resolve(I.stripsReady()).then(() => true));
  const ph = await ev(P.page, (I, FIGHT_SRC) => { const fight = eval('(' + FIGHT_SRC + ')'); const r = fight(I, { secs: 6, god: true, render: true, seed: 'phone' }); let k = 0; while (!I.boss().tele.length && k++ < 200) { I.step(0, 0, 1 / 30); } I.step(0, 0, 0.3); I.render(); return { st: r.boss.st, eng: I.boss().engaged, tele: I.boss().tele.length, src: I.boss().src }; }, FIGHT.toString());
  await P.page.evaluate(() => { window.__isles.pause(false); window.__isles.pause(true); });
  await P.page.evaluate(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res))));
  await ev(P.page, (I) => { I.env(); I.render(); return true; }); // env() runs the HUD pass (boss bar, hint) right now
  const lay = await P.page.evaluate(() => {
    const r = (id) => { const e = document.getElementById(id); if (!e || e.hidden || getComputedStyle(e).display === 'none') return null; const q = e.getBoundingClientRect(); return { l: q.left, t: q.top, r: q.right, b: q.bottom }; };
    const hit = (a, b) => !!a && !!b && a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
    const bar = r('boss-bar'), others = ['stick', 'btn-fire', 'acts', 'hud', 'mini-wrap', 'hint'].map((id) => [id, r(id)]);
    return { bar, over: others.filter((x) => hit(bar, x[1])).map((x) => x[0]), hscroll: document.documentElement.scrollWidth > innerWidth, name: document.getElementById('bb-name').textContent };
  });
  check('phone: the boss fight runs at 390x844 with the boss bar on screen, clear of the stick, Fire, actions, HUD and hint', ph.eng && lay.bar && lay.bar.l >= 0 && lay.bar.r <= 390 && lay.over.length === 0 && !lay.hscroll && /Fernjaw Tyrant/.test(lay.name), JSON.stringify({ ph, lay }));
  await shot(P.page, 'isles-boss-phone');
  const D = await open(browser, DESK, '&isle=jungle&seed=7');
  await ev(D.page, (I) => Promise.resolve(I.stripsReady()).then(() => true));
  await ev(D.page, (I, FIGHT_SRC) => { const fight = eval('(' + FIGHT_SRC + ')'); fight(I, { secs: 4, god: true, render: true, seed: 'desk' }); let k = 0; while (!I.boss().tele.length && k++ < 200) I.step(0, 0, 1 / 30); I.step(0, 0, 0.35); I.render(); return true; }, FIGHT.toString());
  const dsrc = await ev(D.page, (I) => { I.env(); I.render(); return I.boss().src; });
  const dbar = await D.page.evaluate(() => !document.getElementById('boss-bar').hidden && /Fernjaw/.test(document.getElementById('bb-name').textContent));
  check('desktop: the boss bar shows the Fernjaw Tyrant during the fight', dbar);
  check('desktop: the Fernjaw Tyrant draws from its PNG strips in the fight', dsrc === 'png', dsrc);
  await shot(D.page, 'isles-boss-desktop');

  const towns = await Promise.all(all.map((o) => o.page.evaluate(() => localStorage.getItem('pixeltown-save-v1')).catch(() => TOWN)));
  check('all: pixeltown-save-v1 is never written', towns.every((t) => t === TOWN), JSON.stringify(towns));
  check('all: 0 console errors and 0 DB requests on every page (incl. the phone)', all.every((o) => o.errors.length === 0 && o.db.count() === 0), all.map((o) => o.errors.join(' | ')).filter(Boolean).join(' / '));
  for (const o of all) await o.ctx.close().catch(() => {});
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
