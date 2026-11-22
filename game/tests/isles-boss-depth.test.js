// Slice XB (NEXT-SLICES-3): isle boss depth on the Hearthvale Isles page (games/isles/isles.js + shared/mm-isle-boss.js + mm-isles.js).
// 1 unique mechanics, one per boss, in the real page: tide_hydra 3 heads cut in any order + a submerged dive with bubble telegraphs;
//   frost_dragon cone breath leaving ice_thin (slower footing) and 2 hot springs that are always safe; red_titan a burrow line and lava
//   vents; fernjaw_tyrant a roar ring always followed by a charge line. Every windup >= 0.6 s (bursts >= 0.8 s), at most 2 live.
// 2 trophies: a boss's unique drop crafts its trophy_*, which stands on the home pedestal (drawn, listed) and survives a reload
//   (pixeltown-archipelago-v1 `trophies`, additive; hostile values are dropped).
// 3 rematch at home: the pedestal offers it any time with no cooldown, normal loot only, never a tame (a feast does nothing), the first
//   win gives the trophy a gold trim once; leaving the ring ends it calmly; a boss you never met cannot be rematched.
// 4 reduced motion draws the rematch telegraphs static; ?tame=0 and ?ability=0 still work; the panel has >= 12 px text and >= 44 px
//   targets and no pressure words. Phone 390x844, 0 DB requests (blockDb), 0 console errors, pixeltown-save-v1 untouched.
// Run: python3 -m http.server 9161 (repo root), then BASE=http://localhost:9161/game/index.html NODE_PATH=$(npm root -g) node game/tests/isles-boss-depth.test.js
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const B = require('../shared/mm-isle-boss.js');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/isles/index.html';
const TOWN = '{"realm":{"level":3},"name":"Bo"}';
const ARCH = 'pixeltown-archipelago-v1';
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 };
const SHOTS = process.env.SHOTS || '';
const all = [];

async function open(browser, opts, query, seed) {
  const ctx = await browser.newContext(opts);
  const db = await blockDb(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.addInitScript((s) => {
    if (sessionStorage.seeded) return;
    sessionStorage.seeded = '1';
    localStorage.clear();
    Object.keys(s || {}).forEach((k) => localStorage.setItem(k, s[k]));
  }, Object.assign({ 'pixeltown-save-v1': TOWN }, seed || {}));
  await page.goto(PAGE + '?test=1' + (query || ''));
  await ready(page);
  const o = { ctx, page, errors, db }; all.push(o); return o;
}
const ready = (page) => page.waitForFunction(() => window.__isles && window.__isles.world, null, { timeout: 15000 });
const ev = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__isles, ${JSON.stringify(arg === undefined ? null : arg)})`);
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png') }); };

// In-page run: the hero (god mode unless o.god === false) stands in the ring and chips the boss down over ~o.ttk s, rendering every
// 3rd frame. o.head(sig) picks a hydra head; o.iceProbe stands on thin ice and in a spring once; o.until stops at a state.
const RUN = (I, o) => {
  I.pause(true); I.god(o.god !== false); I.clearCreatures();
  if (!o.keep && !I.boss().st) I.bossSpawn();
  const b0 = I.boss();
  I.place(b0.site.px + 150, b0.site.py + 10);
  const dt = 1 / 30, out = { maxTele: 0, sub: 0, dig: 0, ice: 0, frames: 0, probe: null, headsSeen: [], springs: null, sigs: null, told: [] };
  let t = 0, k = 0;
  while (t < o.secs) {
    const b = I.boss();
    if (!b.st || b.done) break;
    if (o.until && b.st === o.until) break;
    const per = b.hpMax / o.ttk * dt;
    if (b.st === 'fight' || b.st === 'weary') { if (o.head) I.bossHitHead(per, o.head(I.bossSig())); else I.bossHit(per); }
    I.step(0, 0, dt); t += dt;
    if (++k % 3 === 0) { I.render(); out.frames++; }
    const s = I.bossSig();
    if (s && s.heads !== undefined) {
      out.maxTele = Math.max(out.maxTele, I.boss().tele.length);
      if (s.sub) out.sub++; if (s.dig) out.dig++;
      if (s.ice && s.ice.length) out.ice++;
      if (s.heads) { const h = s.heads.map((v) => (v > 0 ? 1 : 0)).join(''); if (out.headsSeen[out.headsSeen.length - 1] !== h) out.headsSeen.push(h); }
      if (s.springs) out.springs = s.springs;
      out.sigs = s.sigs; out.told = s.told;
      if (o.iceProbe && !out.probe && s.ice.length && s.springs) {
        const z = s.ice[0].zone, back = I.hero(), pr = {};
        let pt = null;
        for (let r = 60; r <= z.radius - 10 && !pt; r += 20) { const x = z.x + Math.cos(z.angle) * r, y = z.y + Math.sin(z.angle) * r; if (s.springs.every((p) => Math.hypot(x - p.x, y - p.y) > p.r + 4)) pt = { x, y }; }
        if (pt) {
          I.place(pt.x, pt.y); I.step(0, 0, dt); I.step(0, 0, dt); const a = I.bossSig(); pr.iceOn = a.onIce; pr.iceScale = a.scale; pr.hintIce = I.hint();
          const sp = s.springs[0]; I.place(sp.x, sp.y); I.step(0, 0, dt); I.step(0, 0, dt); const c = I.bossSig(); pr.springOn = c.onIce; pr.springScale = c.scale;
          pr.springInZone = c.ice.some((q) => window.MMIsleBoss.hitTest(Object.assign({}, q.zone, { holes: s.springs }), sp.x, sp.y, 0));
          I.place(back.x, back.y);
          out.probe = pr;
        }
      }
    }
  }
  out.t = t; out.boss = I.boss(); out.log = I.bossLog(); out.drops = I.drops(); out.sig = I.bossSig();
  return out;
};

(async () => {
  const browser = await chromium.launch();
  const src = fs.readFileSync(path.join(__dirname, '..', 'games', 'isles', 'isles.js'), 'utf8');
  check('0: the isles page stays DOM-text only and never loads firebase / net.js', !/innerHTML|insertAdjacentHTML|outerHTML/.test(src) && !/firebase|net\.js/i.test(src));

  // ---- 1: the four signature mechanics in the page ----
  const H = await open(browser, PHONE, '&isle=reef&seed=7');
  const order = [2, 0, 1];
  const hy = await ev(H.page, RUN, { secs: 120, ttk: 80, head: null });
  const hy2 = await (async () => {
    const o = await open(browser, PHONE, '&isle=reef&seed=7');
    return ev(o.page, (I, ord) => {
      const RUNF = eval('(' + ord.run + ')');
      return RUNF(I, { secs: 120, ttk: 80, head: (s) => ord.order.find((i) => s.heads && s.heads[i] > 0) });
    }, { run: RUN.toString(), order });
  })();
  check('1 hydra: 3 heads, all cut by weary; the boss bar heads go 3 -> 0', hy.log.ev.head_cut === 3 && hy.boss.done === 'dead' && hy.headsSeen[0] === '111' && hy.headsSeen[hy.headsSeen.length - 1] === '000', JSON.stringify({ ev: hy.log.ev, seen: hy.headsSeen, done: hy.boss.done }));
  check('1 hydra: you cut the heads in any order (right, left, middle when aimed that way)', hy2.headsSeen.join() === '111,110,010,000', JSON.stringify(hy2.headsSeen));
  check('1 hydra: it submerges (and surfaces) with bubble telegraphs (burst shape, windup >= 0.8 s)', hy.log.ev.submerge >= 1 && hy.log.ev.surface === hy.log.ev.submerge && hy.sub > 0 && hy.log.tele.some((x) => x.atk === 'bubble_rise' && x.shape === 'burst' && x.windup >= 0.8), JSON.stringify(hy.log.ev));
  check('1 hydra: the dive tip is shown once', hy.told.indexOf('sub') >= 0, JSON.stringify(hy.told));

  const D = await open(browser, PHONE, '&isle=ice&seed=7');
  const dr = await ev(D.page, RUN, { secs: 120, ttk: 80, iceProbe: true });
  check('1 dragon: its cone breath leaves ice_thin patches (at most 2), all thawed by weary', dr.log.ev.ice >= 1 && dr.ice > 0 && dr.log.ev.thaw === dr.log.ev.ice && dr.boss.done === 'dead', JSON.stringify(dr.log.ev));
  check('1 dragon: 2 hot springs inside the arena', Array.isArray(dr.springs) && dr.springs.length === 2 && dr.springs.every((p) => Math.hypot(p.x - dr.boss.site.px, p.y - dr.boss.site.py) + p.r <= B.K.ARENA_R), JSON.stringify(dr.springs));
  check('1 dragon: thin ice slows your footing (x0.85) and says so; a hot spring is never ice', !!dr.probe && dr.probe.iceOn === true && dr.probe.iceScale < dr.probe.springScale && Math.abs(dr.probe.iceScale / dr.probe.springScale - 0.85) < 0.01 && dr.probe.springOn === false && dr.probe.springInZone === false && /thin ice/i.test(dr.probe.hintIce), JSON.stringify(dr.probe));
  const hurtSpring = await ev(D.page, (I) => {
    I.pause(true); I.god(false); I.heal(); I.clearCreatures(); I.bossSpawn();
    const s0 = I.bossSig(), sp = s0.springs[0], lost0 = I.heroLost();
    I.place(sp.x, sp.y);
    let hits = 0; for (let i = 0; i < 40 * 30; i++) { const b = I.boss(); if (b.st === 'fight') I.bossHit(b.hpMax / 120 / 30); I.place(sp.x, sp.y); I.step(0, 0, 1 / 30); if (I.hero().dead) break; }
    const log = I.bossLog();
    return { lost: I.heroLost() - lost0, tele: log.ev.telegraph || 0, dead: I.hero().dead };
  });
  check('1 dragon: standing in a hot spring for 40 s of fight is never hurt', hurtSpring.lost === 0 && hurtSpring.tele >= 8 && !hurtSpring.dead, JSON.stringify(hurtSpring));

  const T = await open(browser, PHONE, '&isle=mars&seed=7');
  const ti = await ev(T.page, RUN, { secs: 120, ttk: 80 });
  check('1 titan: it burrows along a telegraphed line (dig -> rise, the body fades while under)', ti.log.ev.dig >= 1 && ti.log.ev.rise === ti.log.ev.dig && ti.dig > 0 && ti.log.tele.some((x) => x.atk === 'titan_burrow' && x.shape === 'line' && x.windup >= 0.8), JSON.stringify(ti.log.ev));
  check('1 titan: lava vents are burst telegraphs (3 discs, >= 0.8 s)', ti.log.tele.some((x) => x.atk === 'lava_vents' && x.shape === 'burst' && x.windup >= 0.8), JSON.stringify(ti.log.tele.map((x) => x.atk)));
  check('1 titan: the fight still ends in a kill with its normal loot', ti.boss.done === 'dead' && ti.drops.some((d) => d.sp === 'red_titan'), JSON.stringify(ti.drops));

  const J = await open(browser, PHONE, '&isle=jungle&seed=7');
  const ty = await ev(J.page, RUN, { secs: 120, ttk: 80 });
  const seq = ty.log.tele.map((x) => x.atk);
  const roars = seq.map((a, i) => (a === 'tyrant_roar' ? seq[i + 1] : null)).filter((x) => x !== null);
  check('1 tyrant: it roars (a ring telegraph >= 0.8 s)', ty.log.tele.some((x) => x.atk === 'tyrant_roar' && x.shape === 'ring' && x.windup >= 0.8), JSON.stringify(seq));
  check('1 tyrant: every roar is followed by a charge line', roars.length >= 1 && roars.every((a) => a === 'tyrant_charge' || a === undefined), JSON.stringify(seq));
  check('1 tyrant: the roar tip names the charge', ty.told.indexOf('roar') >= 0, JSON.stringify(ty.told));
  const fights = [hy, hy2, dr, ti, ty];
  check('1 fair: every windup >= 0.6 s (bursts >= 0.8 s), never more than 2 telegraphs at once', fights.every((f) => f.log.tele.every((x) => x.windup >= 0.6 && (x.shape !== 'burst' || x.windup >= 0.8) && x.th - x.t0 >= x.windup - 1e-6) && f.maxTele <= 2), JSON.stringify(fights.map((f) => f.maxTele)));
  check('1 fair: the page rendered the new shapes, springs and heads without errors', fights.every((f) => f.frames > 100) && [H, D, T, J].every((o) => o.errors.length === 0), [H, D, T, J].map((o) => o.errors.join(' | ')).join(' || '));
  await shot(J.page, 'isles-boss-depth-tyrant');

  // ---- 2: trophies on the home pedestal ----
  const seedSave = JSON.stringify({ v: 1, at: 'home', unlock: ['jungle'], beat: ['fernjaw_tyrant'], bosses: ['fernjaw_tyrant'], inv: { tyrant_scale: 1, amber: 3 },
    trophies: { trophy_hydra: 9, __proto__x: 1, trophy_dragon: 'x' } });
  const M = await open(browser, PHONE, '&isle=home&seed=7', { [ARCH]: seedSave });
  const tr = await ev(M.page, (I) => {
    I.pause(true); I.clearCreatures();
    const p = I.pedestal(), before = I.trophies(), list0 = I.rematchList();
    I.place(p.px + 20, p.py + 10); I.step(0, 0, 0.3); I.render(); I.meters(); // meters() runs the HUD pass (buttons)
    const near = I.pedestal(), hint = I.hint();
    const c = I.craft('trophy_tyrant');
    I.render();
    const after = I.trophies(), saved = I.save();
    I.openPanel('trophy');
    const rows = Array.from(document.querySelectorAll('#trophy-list .trophy-row')).map((r) => ({ boss: r.dataset.boss, tier: r.dataset.tier, text: r.textContent, btn: r.querySelector('button').disabled }));
    I.closePanel();
    return { p, before, list0, near, hint, c, after, saved: saved.trophies, inv: I.inv(), rows, drawn: I.pedestal().drawn };
  });
  check('2: hostile trophy values in the save are dropped (none placed yet)', JSON.stringify(tr.before) === '{}', JSON.stringify(tr.before));
  check('2: Hearth Isle has a trophy pedestal you can walk up to (button + hint)', !!tr.p && tr.near.near && tr.near.btn && /trophy pedestal/i.test(tr.hint), JSON.stringify({ p: tr.p, n: tr.near, h: tr.hint }));
  check('2: the Fernjaw Tyrant\'s unique drop (tyrant_scale) crafts trophy_tyrant, which stands on the pedestal (tier 1)', tr.c.ok && tr.c.item === 'trophy_tyrant' && tr.c.trophy === true && tr.after.trophy_tyrant === 1 && tr.saved.trophy_tyrant === 1 && !tr.inv.tyrant_scale, JSON.stringify(tr.c));
  check('2: the pedestal is drawn and the panel lists all 4 trophies, the tyrant on it', tr.drawn > 0 && tr.rows.length === 4 && tr.rows.find((r) => r.boss === 'fernjaw_tyrant').tier === '1' && tr.rows.filter((r) => r.tier === '0').length === 3, JSON.stringify(tr.rows));
  await M.page.reload(); await ready(M.page);
  const rl = await ev(M.page, (I) => ({ t: I.trophies(), raw: JSON.parse(localStorage.getItem('pixeltown-archipelago-v1')), town: localStorage.getItem('pixeltown-save-v1') }));
  check('2: the trophy survives a reload (pixeltown-archipelago-v1 trophies, additive: beat / inv kept)', rl.t.trophy_tyrant === 1 && rl.raw.trophies.trophy_tyrant === 1 && rl.raw.beat.indexOf('fernjaw_tyrant') >= 0 && rl.raw.inv.trophy_tyrant === 1, JSON.stringify(rl.raw.trophies));
  check('2: pixeltown-save-v1 is never written', rl.town === TOWN, rl.town);

  // ---- 3: rematch at home ----
  const rm = await ev(M.page, (I, RS) => {
    const RUNF = eval('(' + RS + ')');
    I.pause(true); I.clearCreatures();
    const p = I.pedestal(); I.place(p.px + 20, p.py + 10); I.step(0, 0, 0.3);
    const out = { list: I.rematchList() };
    out.locked = I.rematch('red_titan');
    I.openPanel('trophy');
    const btn = document.querySelector('#trophy-list button[data-boss="fernjaw_tyrant"]');
    out.titanBtn = document.querySelector('#trophy-list button[data-boss="red_titan"]').disabled;
    btn.click();
    out.panel = document.getElementById('panel').hidden;
    out.b1 = I.boss(); out.sig1 = I.bossSig();
    I.give('feast', 4);
    const w = RUNF(I, { secs: 120, ttk: 60, until: 'weary', keep: true });
    out.weary = w.boss.st; out.feedable = I.boss().feedable; out.tameable = I.boss().tameable;
    out.feed = I.feed(); out.stAfterFeed = I.boss().st; out.feastLeft = I.inv().feast;
    const k = RUNF(I, { secs: 30, ttk: 60, keep: true });
    out.done1 = k.boss.done; out.drops1 = k.drops; out.tier1 = I.trophies().trophy_tyrant; out.wins1 = I.rematchWins();
    out.tames = I.tames(); out.beat = I.save().beat;
    // no cooldown: straight into another one
    I.place(p.px + 20, p.py + 10); I.step(0, 0, 0.1);
    out.again = I.rematch('fernjaw_tyrant');
    const k2 = RUNF(I, { secs: 120, ttk: 50, keep: true });
    out.done2 = k2.boss.done; out.tier2 = I.trophies().trophy_tyrant; out.wins2 = I.rematchWins(); out.drops2 = k2.drops.length;
    // leaving the ring ends a rematch calmly
    I.place(p.px + 20, p.py + 10); I.step(0, 0, 0.1);
    out.third = I.rematch('fernjaw_tyrant');
    I.step(0, 0, 1);
    I.place(p.px + 900, p.py); I.step(0, 0, 0.5);
    out.left = I.boss(); out.toast = document.getElementById('toast').textContent;
    out.saved = I.save().trophies;
    return out;
  }, RUN.toString());
  check('3: a boss you never met cannot be rematched (button disabled)', rm.locked.ok === false && rm.locked.why === 'locked' && rm.titanBtn === true && rm.list.find((x) => x.id === 'fernjaw_tyrant').can === true, JSON.stringify(rm.list));
  check('3: the pedestal Rematch button brings the Fernjaw Tyrant to Hearth Isle (panel closes, fight on)', rm.panel === true && rm.b1.id === 'fernjaw_tyrant' && rm.b1.rm === true && rm.b1.st === 'fight' && rm.b1.engaged && rm.sig1.rematch === true, JSON.stringify(rm.b1).slice(0, 300));
  check('3: a rematch never tames: at weary it is not feedable and a feast is not used', rm.weary === 'weary' && rm.feedable === false && rm.tameable === false && rm.feed.ok === false && rm.stAfterFeed === 'weary' && rm.feastLeft === 4, JSON.stringify({ w: rm.weary, f: rm.feed, l: rm.feastLeft }));
  check('3: the rematch win gives normal loot only (its drop table), no stable entry, save.beat unchanged', rm.done1 === 'won' && rm.drops1.some((d) => d.sp === 'fernjaw_tyrant') && !(rm.tames && rm.tames.roster && rm.tames.roster.some((t) => t.sp === 'fernjaw_tyrant')) && JSON.stringify(rm.beat) === '["fernjaw_tyrant"]', JSON.stringify({ d: rm.done1, drops: rm.drops1, tames: rm.tames }));
  check('3: the first rematch win gives the trophy its gold trim (tier 2), once', rm.tier1 === 2 && rm.tier2 === 2 && rm.wins1 === 1 && rm.wins2 === 2 && rm.saved.trophy_tyrant === 2, JSON.stringify({ t1: rm.tier1, t2: rm.tier2 }));
  check('3: no cooldown: a second rematch starts at once and ends in another win with loot', rm.again.ok === true && rm.done2 === 'won' && rm.drops2 >= 1, JSON.stringify(rm.again));
  check('3: leaving the ring ends a rematch calmly (no loss, it can start again)', rm.third.ok && rm.left.st === null && rm.left.rm === false && rm.left.done === 'left' && /rematch any time/i.test(rm.toast), JSON.stringify({ l: rm.left.done, t: rm.toast }));
  check('2+3: 0 console errors, 0 DB requests on Hearth Isle', M.errors.length === 0 && M.db.count() === 0, M.errors.join(' | '));
  await shot(M.page, 'isles-boss-depth-home');

  // ---- 4: reduced motion, ?tame=0 / ?ability=0, the panel on a phone ----
  const gold = JSON.stringify({ v: 1, at: 'home', unlock: ['jungle'], beat: ['tide_hydra'], inv: {}, trophies: { trophy_hydra: 1 } });
  const R = await open(browser, Object.assign({ reducedMotion: 'reduce' }, PHONE), '&isle=home&seed=7&tame=0&ability=0', { [ARCH]: gold });
  const rd = await ev(R.page, (I) => {
    I.pause(true); I.god(true); I.clearCreatures();
    const p = I.pedestal(); I.place(p.px + 20, p.py + 10); I.step(0, 0, 0.3);
    I.openPanel('trophy');
    const panel = document.getElementById('panel');
    const btns = Array.from(panel.querySelectorAll('button')).map((b) => { const r = b.getBoundingClientRect(); return { w: r.width, h: r.height, vis: r.width > 0 }; }).filter((b) => b.vis);
    const texts = Array.from(panel.querySelectorAll('.rc-note, .rc-name, p')).map((e) => parseFloat(getComputedStyle(e).fontSize));
    const words = panel.textContent;
    const r = I.rematch('tide_hydra');
    const tg = []; let t = 0;
    while (t < 12) { I.bossHit(1); I.step(0, 0, 1 / 30); I.render(); t += 1 / 30; const b = I.boss(); if (b.tele.length) tg.push({ f: b.tg.frac, a: b.tg.alpha }); }
    return { r, btns, texts, words, tg, flags: I.flags(), ab: I.ability(), sig: I.bossSig(), reduced: I.boss().reduced };
  });
  check('4: reduced motion: rematch telegraphs are static (one fill, one alpha)', rd.reduced === true && rd.tg.length > 20 && rd.tg.every((q) => q.f === 1 && q.a === 0.3), JSON.stringify(rd.tg.slice(0, 3)));
  check('4: ?tame=0 and ?ability=0 still load and a rematch (hydra, trophy only) runs with its heads', rd.flags.tame === false && rd.ab.on === false && rd.r.ok === true && rd.sig.rematch === true && Array.isArray(rd.sig.heads) && rd.sig.heads.length === 3, JSON.stringify({ f: rd.flags, r: rd.r, s: rd.sig && rd.sig.heads }));
  check('4: phone panel: every button >= 44 px, text >= 12 px', rd.btns.length >= 5 && rd.btns.every((b) => b.w >= 44 && b.h >= 44) && rd.texts.every((s) => s >= 12), JSON.stringify({ b: rd.btns, t: rd.texts }));
  check('4: calm wording: no streak, countdown, "you missed" or "come back"', !/streak|you missed|come back|countdown|hurry|expires?/i.test(rd.words), rd.words);
  check('4: 0 console errors, 0 DB requests (reduced motion, flags off)', R.errors.length === 0 && R.db.count() === 0, R.errors.join(' | '));
  check('0: 0 DB requests across every page', all.every((o) => o.db.count() === 0) && all.every((o) => o.errors.length === 0), all.map((o) => o.errors.join(' | ')).join(' || '));

  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
