// RB3: the rewards pass in the Realm World. A quest claim queues a real reward bag (QB1 MMQuests.rewardBag, saved additively as `questBags` in
// pixeltown-realm-v1) that drops beside the hero once the Realm runs again (Back from the Nexus, or the next start after a reload), pays once,
// and goes into the backpack through the usual bag path (so the Lantern stash records it). Focus orbs and all 6 potions now spawn from the
// MMPickups rolls: buff potions are 30 s statuses (damaging / swift / armored / inspired) through arena.applyStatus, focus goes through
// arena.restoreFocus when the arena has one. PLAYTEST-REVIEW-2 #8: an unfinished Claim is outline-only with a progress bar in the row.
// Offline (blockDb), deterministic (fixed seed and quest day), phone 390x844, no console errors.
// Run: BASE=http://localhost:8662/game/index.html NODE_PATH=$(npm root -g) node game/tests/world-rewards.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&seed=12345&qdate=2030-05-01';
const SAVE = { realm: { level: 6, xp: 0, shards: 50, bestWave: 2, items: [{ n: 1, id: 'sparkwand', r: 0 }], nextUid: 2, eq: { weapon: 1 } } };
const KEY = 'pixeltown-realm-v1';
const DAY = '2030-05-01';

async function open(browser, url, o) {
  o = o || {};
  const ctx = await browser.newContext(o.phone ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } : { viewport: { width: 1000, height: 700 } });
  const db = await blockDb(ctx);
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html>town' }));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate((a) => { localStorage.clear(); localStorage.setItem('pixeltown-save-v1', a.v); localStorage.setItem('mm-aim-assist', '0'); if (a.realm) localStorage.setItem(a.key, a.realm); }, { v: JSON.stringify(SAVE), realm: o.realm || null, key: KEY });
  await page.goto(url);
  await waitWorld(page); await god(page);
  return { ctx, page, errors, db };
}
const waitWorld = (page) => page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 15000 });
const A = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__mm.arena, window.__mm.world, ${JSON.stringify(arg)})`);
const god = (page) => A(page, (a) => { a.player.iframes = 1e9; a._hitPlayer = () => {}; a.enemies.forEach((e) => { e.active = false; }); });
const frames = (page, n) => page.evaluate((k) => new Promise((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const raw = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
const finishAll = (page) => A(page, (a, w) => { w.quests.event({ type: 'boss' }); w.quests.event({ type: 'portal' }); w.quests.flush(); });
// walk onto every active bag (and pickup) so the arena collects them
const collectAll = (page) => A(page, async (a) => {
  const n0 = a.save.items.length; const bs = a.bags.filter((b) => b.active);
  for (const b of bs) { a.player.x = b.x; a.player.y = b.y; b.t = 1; for (let i = 0; i < 3; i++) await new Promise((r) => requestAnimationFrame(r)); }
  return { had: bs.length, n0, n1: a.save.items.length, ids: a.save.items.slice(n0).map((it) => it.id + ':' + it.r) };
});

(async () => {
  const browser = await chromium.launch();
  const D = await open(browser, WORLD); const page = D.page;

  // ---- PLAYTEST-REVIEW-2 #8: the board (walkable Nexus) shows an outline-only disabled Claim and a progress bar ----
  await A(page, (a, w) => { w.quests.event({ type: 'boss' }); w.nexus.open(); w.nexus.talk('quest'); });
  await frames(page, 3);
  const bd = await page.evaluate(() => {
    const st = (b) => { const c = getComputedStyle(b); return { bg: c.backgroundColor, bs: c.borderTopStyle, dis: b.disabled }; };
    const rows = Array.from(document.querySelectorAll('#rw-nx-board .nx-q'));
    return { n: rows.length, off: st(document.querySelector('#rw-nx-board [data-claim="kill_zone"]')), on: st(document.querySelector('#rw-nx-board [data-claim="kill_boss"]')),
      bars: rows.map((r) => { const f = r.querySelector('.nx-bar > i'); return f ? f.style.width : null; }), em: document.querySelector('#rw-nx-board [data-quest="kill_boss"] em').textContent };
  });
  check('PT2 #8: an unfinished Claim is outline-only (transparent, dashed) and differs from a ready one', bd.off.dis && bd.off.bg === 'rgba(0, 0, 0, 0)' && bd.off.bs === 'dashed' && !bd.on.dis && bd.on.bg !== 'rgba(0, 0, 0, 0)' && bd.on.bs === 'solid', JSON.stringify(bd));
  check('PT2 #8: every unclaimed row carries a progress bar (0% unfinished, 100% done) and names its bag', bd.n === 3 && bd.bars[0] === '0%' && bd.bars[1] === '100%' && /purple bag/.test(bd.em), JSON.stringify(bd));

  // ---- claim -> a queued bag (saved), drops on Back, contents = QB1 rewardBag, pays once ----
  const items0 = await A(page, (a) => a.save.items.length);
  await page.click('#rw-nx-board [data-claim="kill_boss"]');
  const q1 = await A(page, (a, w) => ({ queued: w.rewards.questBags(), bags: a.bags.filter((b) => b.active).length, talk: document.querySelector('#rw-nexus .nx-talk').textContent }));
  const s1 = await raw(page);
  check('claiming queues the purple bag in the save (questBags, additive) while the Nexus is open', q1.queued.length === 1 && q1.queued[0].q === 'kill_boss' && q1.queued[0].d === DAY && s1.questBags && s1.questBags[0].q === 'kill_boss' && s1.quests.q.kill_boss.claimed && s1.seed === '12345' && /purple bag/.test(q1.talk), JSON.stringify({ q1, qb: s1.questBags }));
  await A(page, (a, w) => w.nexus.close());
  await frames(page, 2);
  const dr = await A(page, (a, w) => ({ last: w.rewards.lastBag(), queued: w.rewards.questBags(), bags: a.bags.filter((b) => b.active).map((b) => b.id), want: MMQuests.rewardBag({ bag: 'purple' }, '2030-05-01:kill_boss') }));
  check('Back from the Nexus drops a real loot bag beside the hero and empties the queue', dr.last && dr.last.quest === 'kill_boss' && dr.last.tier === 'purple' && dr.bags.length >= 1 && dr.queued.length === 0 && !(await raw(page)).questBags, JSON.stringify(dr));
  check('the bag holds exactly the QB1 rewardBag items (seeded, stable)', JSON.stringify(dr.last.raw) === JSON.stringify(dr.want.items) && dr.last.items.length === 1 && dr.last.items[0].r === 2, JSON.stringify({ raw: dr.last.raw, want: dr.want }));
  const f0 = await A(page, (a, w) => { const f = w.finds(); return f ? JSON.stringify(f).length : 0; });
  const pk = await collectAll(page);
  const f1 = await A(page, (a, w) => { const f = w.finds(); return f ? JSON.stringify(f).length : 0; });
  check('walking onto the quest bag puts the item into the backpack at its rarity', pk.n1 === pk.n0 + 1 && pk.ids[0] === dr.last.items[0].id + ':2' && pk.n0 === items0, JSON.stringify(pk));
  check('the picked-up quest item is recorded for the Lantern stash (finds grow)', f1 > f0, JSON.stringify({ f0, f1 }));
  check('a second claim pays nothing and queues nothing', await A(page, (a, w) => w.quests.claim('kill_boss') === null && w.rewards.questBags().length === 0));

  // ---- pays once after a reload: a claim queued but not yet dropped drops after the reload, exactly once ----
  await A(page, (a, w) => { w.quests.event({ type: 'portal' }); w.nexus.open(); w.quests.claim('open_portal'); });
  check('the pink claim is queued in the save before the reload', ((await raw(page)).questBags || []).some((b) => b.q === 'open_portal'));
  const itemsPre = await A(page, (a) => a.save.items.length);
  await page.reload(); await waitWorld(page); await god(page); await frames(page, 3);
  const rl = await A(page, (a, w) => ({ last: w.rewards.lastBag(), queued: w.rewards.questBags(), drops: w.lastDrops().length }));
  check('after the reload the queued pink bag drops once (queue empty in memory and in the save)', rl.last && rl.last.quest === 'open_portal' && rl.last.tier === 'pink' && rl.last.dropped === 1 && rl.queued.length === 0 && !(await raw(page)).questBags, JSON.stringify(rl));
  await collectAll(page);
  const pk2 = await A(page, (a) => ({ n: a.save.items.length, last: a.save.items[a.save.items.length - 1] }));
  check('the pink bag item lands in the backpack (an uncommon charm / ring standing in for the armour piece)', pk2.n === itemsPre + 1 && pk2.last.id === rl.last.items[0].id && pk2.last.r === 1 && /charm|ring/.test(pk2.last.id), JSON.stringify({ pk2, itemsPre }));
  await page.reload(); await waitWorld(page); await god(page); await frames(page, 3);
  check('a second reload drops nothing more (pays once)', await A(page, (a, w) => w.rewards.lastBag() === null && w.rewards.questBags().length === 0 && w.quests.claim('open_portal') === null));

  // ---- brown bag: its 2 potions drop as potion pickups ----
  const br = await A(page, (a, w) => { w.quests.event({ type: 'kill', zone: w.quests.list()[0].zone, n: 999 }); const n0 = w.pickups.list().length; w.quests.claim('kill_zone'); w.rewards.deliver(); const l = w.pickups.list(); return { last: w.rewards.lastBag(), added: l.slice(n0).map((q) => q.art) }; });
  check('the brown bag (2 potions) drops its potions as potion pickups', br.last && br.last.tier === 'brown' && br.added.length === 2 && br.added.every((x) => /^potion_/.test(x)) && JSON.stringify(br.added) === JSON.stringify(br.last.potions), JSON.stringify(br));

  // ---- focus orbs and buff potions spawn from the MMPickups rolls ----
  const roll = await A(page, (a, w) => {
    let fo = null; let po = null;
    for (let k = 1; k < 4000 && (!fo || !po); k++) { const r = MMPickups.roll('12345', 'gz', k, 5); if (!fo && r.some((d) => d.type === 'focus')) fo = k; if (!po && r.some((d) => d.type === 'potion' && d.art !== 'potion_life')) po = k; }
    const n0 = w.pickups.list().length; const p = a.player;
    w.pickups.spawn(p.x + 900, p.y + 900, 'gz', fo, 5); w.pickups.spawn(p.x + 900, p.y + 900, 'gz', po, 5);
    const l = w.pickups.list().slice(n0);
    return { fo, po, types: l.map((q) => q.type + ':' + q.art), want: MMPickups.roll('12345', 'gz', fo, 5).concat(MMPickups.roll('12345', 'gz', po, 5)).map((d) => d.type + ':' + d.art) };
  });
  check('focus orbs and buff potions now spawn: the floor equals the full MMPickups roll', roll.types.some((t) => t === 'focus:focus_pickup') && roll.types.some((t) => /^potion:potion_(focus|power|swift|guard|wit)$/.test(t)) && JSON.stringify(roll.types) === JSON.stringify(roll.want), JSON.stringify(roll));

  // ---- buff potions apply as timed statuses with an icon and time left ----
  const bf = await A(page, (a, w) => {
    const out = {};
    for (const [art, st] of [['potion_power', 'damaging'], ['potion_swift', 'swift'], ['potion_guard', 'armored'], ['potion_wit', 'inspired']]) {
      const r = w.rewards.drink(art); const s = a.statusOf('player').find((x) => x.id === st); out[art] = { st: r.status, ok: r.ok, left: s ? s.left : 0 };
    }
    return { out, api: w.rewards.statusApi() };
  });
  check('power / swift / guard / wit potions become damaging / swift / armored / inspired for 30 s (status icons with time left)', bf.api && Object.keys(bf.out).every((k) => bf.out[k].ok && bf.out[k].left > 25 && bf.out[k].left <= 30) && bf.out.potion_power.st === 'damaging' && bf.out.potion_wit.st === 'inspired', JSON.stringify(bf));

  // ---- focus: through arena.restoreFocus when it exists (stubbed here), a harmless no-op when it does not ----
  const fc = await A(page, async (a, w) => {
    const had = typeof a.restoreFocus === 'function';
    const noop = had ? null : w.rewards.drink('potion_focus');
    const got = []; const keep = a.restoreFocus; a.restoreFocus = (n) => { got.push(n); };
    const pot = w.rewards.drink('potion_focus');
    const p = a.player; let k = 1; while (!MMPickups.roll('12345', 'gf', k, 3).some((d) => d.type === 'focus')) k++;
    const want = MMPickups.roll('12345', 'gf', k, 3).find((d) => d.type === 'focus').value;
    w.pickups.spawn(p.x, p.y, 'gf', k, 3);
    for (let i = 0; i < 20; i++) await new Promise((r) => requestAnimationFrame(r));
    if (keep) a.restoreFocus = keep; else delete a.restoreFocus;
    return { had, noop, pot, got, want, gotFocus: w.pickups.got().focus };
  });
  check('a focus potion and a focus orb restore focus through arena.restoreFocus(amount)', fc.pot.ok && fc.got[0] === fc.pot.focus && fc.got[0] > 0 && fc.got.includes(fc.want) && fc.gotFocus >= 1, JSON.stringify(fc));
  check('without arena.restoreFocus a focus potion is a safe no-op', fc.had || (fc.noop && fc.noop.ok === false), JSON.stringify(fc.noop));
  check('no console errors (rewards on)', D.errors.length === 0, D.errors.join(' | '));
  check('no DB traffic was attempted', D.db.attempts() === 0, JSON.stringify(D.db.http.concat(D.db.ws)));
  await D.ctx.close();

  // ---- corrupt / hostile questBags recover ----
  const bad = JSON.stringify({ v: 1, seed: '12345', questBags: [{ q: '<img src=x>', d: DAY }, { q: 'kill_boss', d: 'soon' }, 'junk', { q: 'kill_boss', d: DAY }, { q: 'kill_boss', d: DAY }], keepMe: 3 });
  const C = await open(browser, WORLD, { realm: bad });
  const cl = await C.page.evaluate(() => ({ a: RealmWorld.cleanSave({ questBags: 'lots' }).questBags, b: RealmWorld.cleanSave({ questBags: [{ q: '<b>', d: '2030-05-01' }, { q: 'kill_boss', d: 'x' }, { q: 'kill_boss', d: '2030-05-01' }, { q: 'kill_boss', d: '2030-05-01' }] }).questBags }));
  check('cleanSave drops a bad questBags value and keeps only valid, unique entries', cl.a === undefined && JSON.stringify(cl.b) === JSON.stringify([{ q: 'kill_boss', d: '2030-05-01' }]), JSON.stringify(cl));
  await frames(C.page, 3);
  const cr = await A(C.page, (a, w) => ({ last: w.rewards.lastBag(), s: w.save() }));
  check('a corrupt save loads: the one valid queued bag drops, unknown keys are kept', cr.last && cr.last.quest === 'kill_boss' && !cr.s.questBags && cr.s.keepMe === 3, JSON.stringify(cr));
  check('no console errors (corrupt save)', C.errors.length === 0, C.errors.join(' | '));
  await C.ctx.close();

  // ---- ?pickups=0: no focus / potion pickups; a quest bag still pays (its potions as plain bag potions) ----
  const Z = await open(browser, WORLD + '&pickups=0', { realm: JSON.stringify({ v: 1, seed: '12345', questBags: [{ q: 'kill_zone', d: DAY }] }) });
  await frames(Z.page, 3);
  const z = await A(Z.page, (a, w) => ({ on: w.pickups.on, n: w.pickups.list().length, spawn: w.pickups.spawn(a.player.x, a.player.y, 'g', 1, 5), last: w.rewards.lastBag(), drops: w.lastDrops() }));
  check('?pickups=0: nothing spawns on the floor, the brown quest bag still pays as bag potions', !z.on && z.n === 0 && z.spawn === 0 && z.last && z.last.tier === 'brown' && z.drops.length >= 1 && z.drops[z.drops.length - 1].potions === 2, JSON.stringify(z));
  check('no console errors (pickups off)', Z.errors.length === 0, Z.errors.join(' | '));
  await Z.ctx.close();

  // ---- phone 390x844: the board fits, 44 px Claim buttons, no horizontal scroll ----
  const M = await open(browser, WORLD, { phone: true });
  await A(M.page, (a, w) => { w.quests.event({ type: 'boss' }); w.nexus.open(); w.nexus.talk('quest'); });
  await frames(M.page, 3);
  const ph = await M.page.evaluate(() => ({ btns: Array.from(document.querySelectorAll('#rw-nx-board [data-claim]')).map((b) => { const r = b.getBoundingClientRect(); return { w: r.width, h: r.height, l: r.left, r: r.right }; }), bars: document.querySelectorAll('#rw-nx-board .nx-bar').length, sw: document.documentElement.scrollWidth, iw: innerWidth, nsw: document.getElementById('rw-nexus').scrollWidth, nw: document.getElementById('rw-nexus').clientWidth }));
  check('phone: Claim buttons are >= 44 px and on screen, progress bars shown', ph.btns.length === 3 && ph.btns.every((b) => b.w >= 44 && b.h >= 44 && b.l >= 0 && b.r <= 390) && ph.bars === 3, JSON.stringify(ph));
  check('phone: no horizontal scroll (page and Nexus overlay)', ph.sw <= ph.iw && ph.nsw <= ph.nw, JSON.stringify(ph));
  await M.page.screenshot({ path: require('path').join(require('os').tmpdir(), 'world-rewards-phone.png') }).catch(() => {});
  check('phone: no console errors', M.errors.length === 0, M.errors.join(' | '));
  await M.ctx.close();
  await browser.close();
  done();
})();
