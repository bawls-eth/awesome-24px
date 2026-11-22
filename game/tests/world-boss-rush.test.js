// RE2: the boss rush "Trial of Six". A gate in the walkable Nexus (heroes Lv 20+, by choice only) runs the six MMEndgame.rushLadder godland
// bosses one after another with the arena's own boss fight; between fights a calm "Next fight / Rest here / Leave with your loot" choice. No timer,
// no fee, no lives. Each kill is one normal boss bag that goes straight into the pack and one MMGearDrops.pityStep (6 kills = +6 to gp.b unless a
// T12 resets it). A fall ends the trial with every drop kept. ?rush=0 hides the gate. Offline: blockDb, 0 DB requests.
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/world-boss-rush.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&seed=12345&qdate=2030-05-01';
const save = (level, gp) => ({ realm: { level, xp: 0, shards: 50, bestWave: 2, items: [{ n: 1, id: 'sparkwand', r: 0 }], nextUid: 2, eq: { weapon: 1 }, gv: 1, gp } });

async function open(browser, q, sv, phone) {
  const ctx = await browser.newContext(phone ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } : { viewport: { width: 1000, height: 700 } });
  const db = await blockDb(ctx); await ctx.routeWebSocket(/.*/, (ws) => ws.close());
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html>town' }));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate(([v, w]) => { localStorage.clear(); localStorage.setItem('pixeltown-save-v1', v); localStorage.setItem('pixeltown-realm-v1', w); localStorage.setItem('mm-aim-assist', '0'); }, [JSON.stringify(sv), JSON.stringify({ gp: sv.realm.gp })]); // the z3 boss pity lives in the world save
  errors.length = 0;
  await page.goto(WORLD + (q || ''));
  await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 30000 });
  await E(page, (a) => { a.player.iframes = 1e9; a._hitPlayer = () => {}; });
  return { ctx, page, errors, db };
}
const E = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__mm.arena, window.__mm.world, ${JSON.stringify(arg)})`);
const frames = (page, n) => page.evaluate((k) => new Promise((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
async function enterNexus(page) {
  await E(page, (a, w) => { const s = w.nexus.site; a.player.x = s.x - 20; a.player.y = s.y; });
  await frames(page, 15); await page.click('#rw-nexus-go'); await frames(page, 4);
}
// walk up to the Trial gate with injected input until the prompt names it
const walkToTrial = (page) => E(page, (a, w) => {
  const t = window.MMNexus.layout().trial; let placed = false;
  for (let off = 120; off >= 70 && !placed; off -= 10) placed = w.nexus.walk.place(t.x - off, t.y);
  let n = 0; while (n < 200 && !(w.nexus.walk.near() && w.nexus.walk.near().kind === 'trial')) { w.nexus.walk.step(1, 0, 1 / 60); n++; }
  const b = document.getElementById('rw-nx-act'); const r = b.getBoundingClientRect();
  return { placed, near: w.nexus.walk.near(), text: b.textContent, h: r.height, w: r.width };
});
const gpOf = (page) => page.evaluate(() => { const s = JSON.parse(localStorage.getItem('pixeltown-realm-v1')); return s.gp || { b: 0, d: 0 }; });
const killRush = (page) => E(page, (a, w) => {
  const e = w.rush.entity(); if (!e) return null; const info = { name: e.bossName, art: e.art, hp: e.maxHp, dmg: e.dmgMul };
  const n0 = a.save.items.length; e.invuln = 0; let k = 0; while (e.active && k++ < 200) a._hitEnemy(e, 1e6);
  const d = w.lastDrops(); const last = d[d.length - 1];
  return Object.assign(info, { n0, dead: !e.active, gained: a.save.items.length - n0, dropped: last ? last.items.length : -1, tiers: last ? last.items.map((x) => x.t || 0) : [], bagsLeft: a.bags.filter((b) => b.active).length, st: w.rush.state() });
});
const panel = (page) => page.evaluate(() => {
  const el = document.getElementById('rw-rush'); const go = document.getElementById('rw-rush-go');
  const btn = (id) => { const b = document.getElementById(id); if (!b) return null; const r = b.getBoundingClientRect(); return { text: b.textContent, h: r.height, w: r.width }; };
  return { shown: !!el && !el.classList.contains('hidden'), text: el ? el.textContent : '', next: btn('rw-rush-next'), rest: btn('rw-rush-rest'), leave: btn('rw-rush-leave'), go: !!go && !go.classList.contains('hidden'), goText: go ? go.textContent : '' };
});

(async () => {
  const browser = await chromium.launch();
  const errs = []; let dbHits = 0;
  const close = async (o) => { errs.push(...o.errors); dbHits += o.db.attempts(); await o.ctx.close(); };

  // ---- below Lv 20: the gate is there but stays shut, calmly ----
  { const o = await open(browser, '', save(10, { b: 0, d: 0 })); const p = o.page; await enterNexus(p);
    const w = await walkToTrial(p);
    const r = await E(p, (a, wd) => ({ res: wd.nexus.walk.act(), on: wd.rush.state().on, boss: !!wd.rush.entity(), talk: document.querySelector('#rw-nexus .nx-talk').textContent, open: wd.nexus.isOpen() }));
    check('Lv 10: the Trial gate says it opens at level 20; using it starts nothing and only says so', w.near && w.near.id === 'trial' && /^Trial of Six: opens at level 20/.test(w.text) && r.res === null && !r.on && !r.boss && /opens for heroes at level 20/.test(r.talk) && r.open, JSON.stringify({ w, r }));
    await close(o); }

  // ---- ?rush=0: no gate ----
  { const o = await open(browser, '&rush=0', save(25, { b: 0, d: 0 })); const p = o.page; await enterNexus(p);
    const w = await walkToTrial(p);
    check('?rush=0 hides the gate (no prompt for it, the rush is off)', !(w.near && w.near.kind === 'trial') && (await E(p, (a, wd) => wd.rush.on)) === false, JSON.stringify(w));
    await close(o); }

  // ---- Lv 25: the full Trial of Six ----
  { const o = await open(browser, '', save(25, { b: 10, d: 0 })); const p = o.page; await enterNexus(p);
    const w = await walkToTrial(p);
    check('Lv 25: walking up to the gate offers "Enter the Trial of Six" behind the one 44 px prompt', w.near && w.near.kind === 'trial' && /^Enter the Trial of Six/.test(w.text) && w.h >= 44 && w.w >= 44, JSON.stringify(w));
    const sh0 = await E(p, (a) => a.save.shards);
    const s0 = await E(p, (a, wd) => { const r = wd.nexus.walk.act(); const L = wd.rush.ladder(); const e = wd.rush.entity();
      return { r, open: wd.nexus.isOpen(), steps: L.steps.map((x) => x.boss), rules: L.rules, name: e && e.bossName, art: e && e.art, hp: e && e.maxHp, want: L.steps[0] ? Math.max(1, Math.ceil(RM_BOSS_HP * L.steps[0].hpMul / MMZones.TABLES.BOSS.hp)) : -1, dmg: e && e.dmgMul, wantDmg: L.steps[0].dmgMul, shards: a.save.shards, ladder: MMEndgame.rushLadder('12345:0', 25).steps.map((x) => x.boss) }; });
    check('entering starts step 1 by choice: the Nexus closes and the ladder\'s first boss wakes (its art, zone 3 hp and damage with the capped ramp)', s0.r === 'rush' && !s0.open && s0.steps.length === 6 && s0.steps.join() === s0.ladder.join() && s0.name && s0.art === s0.steps[0] && s0.hp === s0.want && s0.dmg === s0.wantDmg, JSON.stringify(s0));
    check('no entry fee, no timer, no lives, no lockout (rushLadder rules) and no shards taken', s0.shards === sh0 && s0.rules.entryFee === 0 && s0.rules.timer === false && s0.rules.lives === false && s0.rules.lockout === false, JSON.stringify({ sh0, s: s0.shards, rules: s0.rules }));
    const gp0 = await gpOf(p); let gp = gp0; const kills = []; let pityOk = true; let lootOk = true; let t12 = false;
    for (let i = 0; i < 6; i++) {
      const k = await killRush(p); kills.push(k);
      const ng = await gpOf(p); const hadT12 = k && k.tiers.some((t) => t >= 12); if (hadT12) t12 = true;
      if (!k || !k.dead || !(hadT12 ? ng.b === 0 : ng.b === gp.b + 1) || ng.d !== gp.d) pityOk = false;
      if (!k || k.gained !== Math.min(k.dropped + 2, 24 - k.n0) || k.bagsLeft !== 0 || k.dropped < 1) lootOk = false; // the world boss bag + the arena's own two boss bags; a full pack sells the rest
      gp = ng;
      if (i === 0) {
        const pn = await panel(p);
        check('after boss 1: a calm choice "Next fight / Rest here / Leave with your loot" (44 px each), no countdown words', pn.shown && pn.next && /^Next fight: /.test(pn.next.text) && pn.rest && pn.rest.text === 'Rest here' && pn.leave && pn.leave.text === 'Leave with your loot' && [pn.next, pn.rest, pn.leave].every((b) => b.h >= 44 && b.w >= 44) && !/\d+\s*s\b|hurry|timer|last chance|left/i.test(pn.text), JSON.stringify(pn));
        await E(p, (a) => { a.player.hp = 5; });
        await p.click('#rw-rush-rest'); await frames(p, 4);
        const pr = await panel(p); const hp = await E(p, (a) => a.player.hp);
        check('"Rest here" folds the choice into a 44 px "ready" pill and restores nothing beyond normal resting (HP unchanged, no boss)', !pr.shown && pr.go && /ready for/.test(pr.goText) && hp <= 5 + 0.5 && (await E(p, (a, wd) => wd.rush.entity() === null)), JSON.stringify({ pr, hp }));
        await p.click('#rw-rush-go'); await frames(p, 2);
        await p.click('#rw-rush-next'); await frames(p, 2);
      } else if (i < 5) { await E(p, (a, wd) => wd.rush.next()); }
    }
    check('six kills step pity once each: gp.b +6 exactly (or a reset only on a kill that dropped a T12), gp.d untouched', pityOk && (t12 || gp.b === gp0.b + 6), JSON.stringify({ gp0, gp, kills: kills.map((k) => k && k.tiers) }));
    check('each boss gives its normal boss bags only (the world boss bag + the arena\'s two), straight into the pack: no bag left on the floor', lootOk, JSON.stringify(kills.map((k) => k && [k.n0, k.gained, k.dropped, k.bagsLeft])));
    check('the six fights are the ladder\'s six bosses in order', kills.map((k) => k && k.art).join() === s0.steps.join(), JSON.stringify(kills.map((k) => k && k.art)));
    const fin = await panel(p); const st = await E(p, (a, wd) => wd.rush.state());
    check('after boss 6: "the Trial of Six is done" with only the off-ramp', st.phase === 'done' && st.kills === 6 && fin.shown && /Trial of Six is done/.test(fin.text) && !fin.next && !fin.rest && fin.leave && fin.leave.text === 'Leave with your loot', JSON.stringify({ st, fin }));
    const items = await E(p, (a) => a.save.items.length);
    await p.click('#rw-rush-leave'); await frames(p, 3);
    const lv = await E(p, (a, wd) => ({ on: wd.rush.state().on, d: Math.hypot(a.player.x - wd.nexus.site.x, a.player.y - wd.nexus.site.y), items: a.save.items.length, saved: JSON.parse(localStorage.getItem('pixeltown-save-v1')).realm.items.length }));
    check('leaving ends the trial by the Nexus with every drop kept (pack and save)', !lv.on && lv.d < 64 && lv.items === items && lv.saved === items, JSON.stringify(lv));
    await close(o); }

  // ---- a fall in the rush: the trial ends, every drop already collected ----
  { const o = await open(browser, '', save(25, { b: 0, d: 0 })); const p = o.page;
    await E(p, (a, wd) => wd.rush.start());
    const k = await killRush(p); await E(p, (a, wd) => wd.rush.next());
    const n = await E(p, (a) => a.save.items.length);
    await E(p, (a) => { a._hitPlayer = RealmArena.prototype._hitPlayer; a.player.iframes = 0; a.player.hp = 0; a._die(); });
    await frames(p, 6);
    const f = await E(p, (a, wd) => ({ st: wd.rush.state(), boss: wd.rush.entity(), items: a.save.items.length, saved: JSON.parse(localStorage.getItem('pixeltown-save-v1')).realm.items.length, panel: !document.getElementById('rw-rush') || document.getElementById('rw-rush').classList.contains('hidden') }));
    check('a fall during step 2 ends the trial (no boss left, no panel) and keeps every drop from step 1 (the usual Survivor\'s cache may add one)', k && k.dead && !f.st.on && f.st.phase === 'fell' && f.boss === null && f.items >= n && f.saved === f.items && f.panel, JSON.stringify({ k, f, n }));
    await close(o); }

  // ---- ?nexuswalk=0 (button screen): a "Trial of Six" button (44 px) that starts the trial ----
  { const o = await open(browser, '&nexuswalk=0', save(25, { b: 0, d: 0 })); const p = o.page; await enterNexus(p);
    const b = await p.evaluate(() => { const x = document.getElementById('rw-nx-trial'); const r = x ? x.getBoundingClientRect() : null; return x ? { text: x.textContent, h: r.height, w: r.width } : null; });
    if (b) await p.click('#rw-nx-trial');
    const st = await E(p, (a, wd) => ({ on: wd.rush.state().on, boss: !!wd.rush.entity(), open: wd.nexus.isOpen() }));
    check('button screen: a 44 px "Trial of Six" button starts the trial', b && b.text === 'Trial of Six' && b.h >= 44 && b.w >= 44 && st.on && st.boss && !st.open, JSON.stringify({ b, st }));
    await close(o); }

  // ---- phone 390x844 ----
  { const o = await open(browser, '', save(25, { b: 0, d: 0 }), true); const p = o.page;
    await E(p, (a, wd) => wd.rush.start()); await killRush(p); await frames(p, 2);
    const m = await p.evaluate(() => { const el = document.getElementById('rw-rush').getBoundingClientRect(); const bs = Array.from(document.querySelectorAll('#rw-rush button')).map((b) => b.getBoundingClientRect());
      return { docW: document.documentElement.scrollWidth, vw: innerWidth, l: el.left, r: el.right, t: el.top, b: el.bottom, vh: innerHeight, btn: bs.map((r) => [Math.round(r.width), Math.round(r.height)]), fs: parseFloat(getComputedStyle(document.querySelector('#rw-rush p')).fontSize) }; });
    check('phone: the choice fits the screen (no horizontal scroll), every button >= 44 px, text >= 12 px', m.docW <= m.vw && m.l >= 0 && m.r <= m.vw && m.t >= 0 && m.b <= m.vh && m.btn.length === 3 && m.btn.every((x) => x[0] >= 44 && x[1] >= 44) && m.fs >= 12, JSON.stringify(m));
    await close(o); }

  check('no DB requests (blockDb)', dbHits === 0, String(dbHits));
  check('no page or console errors', errs.length === 0, errs.join(' | '));
  await browser.close();
  done();
})();
