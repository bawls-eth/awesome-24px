// Slice A: live world events on the Realm World page (games/mad-maze/index.html?mode=world): an event is announced on the HUD with a
// countdown and an event_beacon marker on the minimap, spawns at its site when active (a raid boss with a telegraphed-attack hint, or a
// swarm of zone creatures), tracks the player's damage share, pays a tiered reward on success (participate / contribute / hero: bag,
// shards, fame, victory banner), expires after its duration, and is fully deterministic through the event-clock hook. Phone 390x844.
// Run: BASE=http://localhost:8512/game/index.html NODE_PATH=$(npm root -g) node game/tests/world-events.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/mad-maze/index.html';
const WORLD = PAGE + '?mode=world&test=1&seed=12345';
const SAVE = { realm: { level: 4, xp: 0, shards: 50, bestWave: 2, items: [{ n: 1, id: 'sparkwand', r: 0 }], nextUid: 2, eq: { weapon: 1 } } };

async function context(browser, opts) {
  const ctx = await browser.newContext(opts || { viewport: { width: 1000, height: 700 } });
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate((v) => { localStorage.clear(); localStorage.setItem('pixeltown-save-v1', v); localStorage.setItem('mm-aim-assist', '0'); }, JSON.stringify(SAVE));
  errors.length = 0;
  return { ctx, page, errors };
}
const waitWorld = (page) => page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 15000 });
const A = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__mm.arena, window.__mm.world, ${JSON.stringify(arg)})`);
const frames = (page, n) => page.evaluate((k) => new Promise((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const godMode = (page) => A(page, (a) => { a.player.iframes = 1e9; a._hitPlayer = () => {}; });
// the first scheduled event of a kind (boss | swarm) at or after slot `from`, skipping ids in `skip`
const findEvent = (page, kind, from, skip) => A(page, (a, w, q) => {
  for (let s = q.from; s < q.from + 600; s++) {
    for (const ev of MMZones.eventsFor(w.world, s * MMZones.EVENT_PERIOD)) {
      if (q.skip.includes(ev.id)) continue;
      const p = MMZones.eventPlan(w.world, ev);
      if (p.kind === q.kind) return { id: ev.id, startsAt: ev.startsAt, endsAt: ev.endsAt, region: ev.region, site: p.site, boss: p.boss, slot: s, swarm: p.swarm.length };
    }
  }
  return null;
}, { kind, from: from || 0, skip: skip || [] });
const goSite = (page, ev) => A(page, (a, w, s) => { const f = w.nearestFree(s.x, s.y, 8); a.player.x = (f.x + 0.5) * 32; a.player.y = (f.y + 0.5) * 32; }, ev.site);
const evOf = (page, id) => A(page, (a, w, id) => w.events().find((e) => e.id === id) || null, id);
// damage every event entity: `credited` share of the total with credit on, the rest with credit off (allies / other sources)
const fight = (page, id, credited) => A(page, (a, w, q) => {
  const ents = w.eventEntities(q.id); const total = ents.reduce((n, e) => n + e.maxHp, 0); let budget = total * q.credited;
  for (const e of ents) {
    let guard = 0;
    while (e.active && guard++ < 400) {
      e.invuln = 0; const step = Math.max(0.5, e.maxHp / 20);
      const credit = budget > 0; w.setEventCredit(credit);
      const d = credit ? Math.min(step, budget, e.hp) : Math.min(step, e.hp);
      if (credit) budget -= d;
      a._hitEnemy(e, d);
    }
  }
  w.setEventCredit(true);
  return total;
}, { id, credited });

(async () => {
  const browser = await chromium.launch();
  const errs = [];
  const P = await context(browser); const page = P.page;
  await page.goto(WORLD); await waitWorld(page); await godMode(page);

  // ================= announce: HUD countdown + minimap beacon =================
  const boss = await findEvent(page, 'boss', 0);
  const swarm = await findEvent(page, 'swarm', 0);
  check('the schedule has both a raid (boss) and a swarm event', !!boss && !!swarm && boss.swarm === 0 && swarm.swarm > 0, JSON.stringify({ boss, swarm }));
  await A(page, (a, w, t) => w.setEventClock(t), boss.startsAt - 45);
  await frames(page, 3);
  const h0 = await A(page, (a, w) => w.eventHud());
  const upc = await evOf(page, boss.id);
  const soon = await A(page, (a, w) => w.events().filter((e) => e.phase === 'upcoming').sort((x, y) => x.startsAt - y.startsAt)[0]);
  const cd = soon.startsAt - (boss.startsAt - 45); const mmss = Math.floor(cd / 60) + ':' + String(cd % 60).padStart(2, '0');
  check('upcoming event: HUD shows the next event, its kind, region and countdown', !h0.hidden && h0.state === 'upcoming' && h0.text.includes((soon.kind === 'boss' ? 'Raid' : 'Swarm') + ' in ' + mmss) && upc && upc.phase === 'upcoming' && cd <= 45, JSON.stringify({ h0, soon, mmss }));
  const mk = await A(page, (a, w, id) => {
    const m = w.eventMarkers().find((x) => x.id === id); w.syncHud(true);
    const c = document.getElementById('rw-minimap'); const g = c.getContext('2d'); const sx = c.width / w.world.w; const sy = c.height / w.world.h;
    const d = g.getImageData(Math.round(m.x * sx) - 1, Math.round(m.y * sy) - 1, 3, 3).data; let gold = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 220 && d[i + 1] > 200 && d[i + 2] < 160) gold++;
    return { m, gold };
  }, boss.id);
  check('minimap: an event_beacon marker (code-drawn gold diamond) sits on the event site', mk.m && mk.m.phase === 'upcoming' && mk.gold >= 3, JSON.stringify(mk));
  await A(page, (a, w, t) => w.setEventClock(t), boss.startsAt - 15);
  await frames(page, 3);
  check('20 s before the start a banner announces it', /⚑ .*raid in 1[45] s/.test(await page.textContent('#realm-banner')), await page.textContent('#realm-banner'));
  await A(page, (a, w, t) => { a._showBanner('', 0.01); return w.jumpEventClock(t); }, 0);

  // ================= active: spawns only near the site; raid boss + telegraph =================
  await A(page, (a, w, t) => w.setEventClock(t), boss.startsAt + 1);
  await frames(page, 4);
  const far = await evOf(page, boss.id);
  check('active event far from the player: nothing spawned yet, HUD shows time left', far.phase === 'active' && far.spawned === 0 && /left/.test((await A(page, (a, w) => w.eventHud())).text), JSON.stringify(far));
  check('active marker on the minimap turns orange', (await A(page, (a, w, id) => w.eventMarkers().find((x) => x.id === id), boss.id)).phase === 'active');
  await goSite(page, boss); await page.waitForTimeout(700);
  const sp = await A(page, (a, w, id) => { const e = w.eventEntities(id)[0]; return e ? { type: e.type, name: e.bossName, art: e.art, ev: e.evid, bar: !document.getElementById('realm-boss').classList.contains('hidden'), x: e.x, y: e.y } : null; }, boss.id);
  check('at the site the raid boss spawns: a boss of the region list, boss bar up', sp && sp.type === 'boss' && sp.art === boss.boss && sp.ev === boss.id && sp.bar, JSON.stringify(sp));
  check('spawn position is the event site', sp && Math.hypot(sp.x - (boss.site.x + 0.5) * 32, sp.y - (boss.site.y + 0.5) * 32) < 160, JSON.stringify({ sp, site: boss.site }));
  const hint = await A(page, (a, w) => w.eventHud().hint);
  check('a telegraphed-attack hint banner is shown for the raid', /red ring|incoming/.test(hint) && await page.isVisible('#rw-event-hint'), hint);
  const tele = await A(page, async (a, w, id) => { const e = w.eventEntities(id)[0]; e.invuln = 0; e.cd2 = 0.95; for (let i = 0; i < 6; i++) await new Promise((r) => requestAnimationFrame(r)); return w.eventHud().hint; }, boss.id);
  check('just before a burst the hint names the incoming attack', /incoming/.test(tele), tele);

  // ================= contribution + hero reward =================
  const sh0 = await A(page, (a) => a.save.shards);
  const total = await fight(page, boss.id, 1);
  await frames(page, 3);
  const r1 = await A(page, (a, w) => ({ rew: w.lastEventReward(), banner: document.getElementById('realm-banner').textContent, shards: a.save.shards, save: w.save(), drops: w.lastDrops() }));
  const ev1 = await evOf(page, boss.id);
  check('contribution tracked: all damage was the player\'s (dealt == total)', ev1.dealt === total && ev1.total === total && r1.rew && r1.rew.share === 1, JSON.stringify({ ev1, total }));
  check('hero tier reward: guaranteed bag (>= 1 item, cyan+ floor), +shards, +fame', r1.rew.tier === 3 && r1.rew.tierName === 'hero' && r1.rew.bag && r1.rew.bag.items.length >= 1 && ['cyan', 'white', 'gold'].includes(r1.rew.bag.tier) && r1.rew.shards > 0 && r1.rew.fame > 0, JSON.stringify(r1.rew));
  check('the shards are banked', r1.shards >= sh0 + r1.rew.shards, sh0 + ' -> ' + r1.shards);
  check('a short victory banner names the tier and the rewards', /won!.*hero.*💎.*fame/.test(r1.banner), r1.banner);
  check('won event: phase won, remembered in the realm save (evDone, stats)', ev1.phase === 'won' && r1.save.evDone.includes(boss.id) && r1.save.stats.eventWins === 1 && r1.save.stats.events === 1, JSON.stringify(r1.save));
  await page.waitForTimeout(400);
  check('a won event does not respawn while its slot lasts', (await A(page, (a, w, id) => w.eventEntities(id).length, boss.id)) === 0);

  // ================= swarm + contribute tier =================
  await A(page, (a, w, t) => w.setEventClock(t), swarm.startsAt + 2);
  await goSite(page, swarm); await page.waitForTimeout(700);
  const sw = await A(page, (a, w, id) => w.eventEntities(id).map((e) => ({ type: e.type, art: e.art, zone: e.zone, tier: e.tier, x: e.x, y: e.y })), swarm.id);
  const ct = await page.evaluate(() => MMOverworld.CREATURE_TIERS);
  check('swarm: a wave of the region\'s creatures spawns around the site', sw.length >= 4 && sw.every((e) => e.zone === swarm.region && ct[e.type][swarm.region].includes(e.art) && Math.hypot(e.x - (swarm.site.x + 0.5) * 32, e.y - (swarm.site.y + 0.5) * 32) < 260), JSON.stringify(sw.slice(0, 3)));
  const hud2 = await A(page, (a, w) => w.eventHud());
  check('swarm HUD: time left and the player share', /Swarm: .* left · you 0%/.test(hud2.text), hud2.text);
  await fight(page, swarm.id, 0.35);
  const r2 = await A(page, (a, w) => w.lastEventReward());
  check('35% share => contribute tier (purple+ bag floor)', r2 && r2.id === swarm.id && r2.tier === 2 && r2.tierName === 'contribute' && r2.share >= 0.25 && r2.share < 0.6 && r2.bag.items.length >= 1, JSON.stringify(r2));

  // ================= participate tier, and no share => no reward =================
  const b2 = await findEvent(page, 'boss', boss.slot + 1, [boss.id, swarm.id]);
  await A(page, (a, w, t) => w.setEventClock(t), b2.startsAt + 1);
  await goSite(page, b2); await page.waitForTimeout(700);
  await fight(page, b2.id, 0.05);
  const r3 = await A(page, (a, w) => w.lastEventReward());
  check('5% share => participate tier', r3 && r3.id === b2.id && r3.tier === 1 && r3.tierName === 'participate', JSON.stringify(r3));
  const s2 = await findEvent(page, 'swarm', swarm.slot + 1, [boss.id, swarm.id, b2.id]);
  await A(page, (a, w, t) => w.setEventClock(t), s2.startsAt + 1);
  await goSite(page, s2); await page.waitForTimeout(700);
  const sh1 = await A(page, (a) => a.save.shards);
  await fight(page, s2.id, 0);
  const r4 = await A(page, (a, w) => ({ rew: w.lastEventReward(), shards: a.save.shards, banner: document.getElementById('realm-banner').textContent }));
  check('0% share => no reward (tier none, no bag), the event still ends', r4.rew.id === s2.id && r4.rew.tier === 0 && r4.rew.bag === null && /over/.test(r4.banner), JSON.stringify(r4));

  // ================= expiry =================
  const b3 = await findEvent(page, 'boss', b2.slot + 1, [boss.id, swarm.id, b2.id, s2.id]);
  await A(page, (a, w, t) => w.setEventClock(t), b3.startsAt + 1);
  await goSite(page, b3); await page.waitForTimeout(700);
  const live3 = await A(page, (a, w, id) => w.eventEntities(id).length, b3.id);
  await fight(page, b3.id, 0); // (kills it) -> use the next swarm for the expiry check instead
  const s3 = await findEvent(page, 'swarm', s2.slot + 1, [boss.id, swarm.id, b2.id, s2.id, b3.id]);
  await A(page, (a, w, t) => w.setEventClock(t), s3.startsAt + 1);
  await goSite(page, s3); await page.waitForTimeout(700);
  const before = await A(page, (a, w, id) => w.eventEntities(id).length, s3.id);
  await A(page, (a, w, id) => { const e = w.eventEntities(id)[0]; e.invuln = 0; a._hitEnemy(e, 1); }, s3.id); // join in
  await A(page, (a, w, t) => w.setEventClock(t), s3.endsAt + 1);
  await frames(page, 3);
  const ex = await A(page, (a, w, id) => ({ ev: w.events().find((e) => e.id === id), left: w.eventEntities(id).length, banner: document.getElementById('realm-banner').textContent, rew: w.lastEventReward() }), s3.id);
  check('events expire after their duration: creatures gone, phase expired, a banner says so, no reward', live3 === 1 && before > 0 && ex.ev.phase === 'expired' && ex.left === 0 && /faded/.test(ex.banner) && ex.rew.id !== s3.id, JSON.stringify({ ex, live3, before }));
  const one = await A(page, (a, w) => { let ok = true; for (let s = 0; s < 300; s++) { const evs = MMZones.eventsFor(w.world, s * 300 + 150); const r = evs.map((e) => e.region); if (new Set(r).size !== r.length) ok = false; } return ok; });
  check('at most one event per region at a time', one);

  // ================= determinism via the clock hook =================
  const snap = (pg, t) => A(pg, (a, w, t) => { w.setEventClock(t); return w.events().filter((e) => e.startsAt <= t + 300 && e.endsAt > t).map((e) => [e.id, e.kind, e.region, e.boss, e.site.x, e.site.y, e.startsAt, e.endsAt].join('|')).sort().join(','); }, t);
  const D = await context(browser); await D.page.goto(WORLD); await waitWorld(D.page);
  const tA = boss.startsAt - 30; const tB = s3.startsAt + 5;
  const d1 = [await snap(page, tA), await snap(page, tB)]; const d2 = [await snap(D.page, tA), await snap(D.page, tB)];
  check('determinism: two pages, same seed + same event clock => same events, kinds, sites and times', d1[0] && d1[0] === d2[0] && d1[1] === d2[1], JSON.stringify({ d1, d2 }));
  const rr = await A(D.page, (a, w, q) => JSON.stringify(MMZones.eventReward(MMZones.eventsFor(w.world, q.t).find((e) => e.id === q.id), 3, w.seed + ':' + q.id).bag.items), { t: boss.startsAt + 1, id: boss.id });
  // The recap lists what dropped: with tiered gear on by default an item can be replaced by gear (or a styled weapon); `rolled` keeps the bag's own roll.
  check('determinism: the reward bag rolls the same from the same seed', JSON.parse(rr).length === r1.rew.bag.items.length && JSON.parse(rr).every((it, i) => it.id === (r1.rew.bag.items[i].rolled || r1.rew.bag.items[i].id) && it.r === r1.rew.bag.items[i].r), rr + ' vs ' + JSON.stringify(r1.rew.bag.items));
  const clk = await A(D.page, async (a, w) => { const c0 = w.eventClock(); a.setPaused(true); await new Promise((r) => setTimeout(r, 300)); const c1 = w.eventClock(); a.setPaused(false); return { c0, c1 }; });
  check('the event clock is game time (frozen while paused)', clk.c0 === clk.c1, JSON.stringify(clk));
  await A(D.page, (a, w) => w.savePos(true));
  const saved = await D.page.evaluate(() => JSON.parse(localStorage.getItem('pixeltown-realm-v1')).evT);
  check('the event clock is saved in pixeltown-realm-v1 (evT)', saved >= tB, String(saved));
  errs.push(...D.errors); await D.ctx.close();
  errs.push(...P.errors); await P.ctx.close();

  // ================= classic arena: no events =================
  const O = await context(browser); await O.page.goto(PAGE + '?test=1'); await O.page.waitForFunction(() => window.__mm && window.__mm.arena.active, null, { timeout: 15000 });
  await O.page.waitForTimeout(500);
  check('classic arena (no ?mode): no event HUD, no hint, no world', await O.page.evaluate(() => !document.getElementById('rw-event') && !document.getElementById('rw-event-hint') && window.__mm.world === null));
  errs.push(...O.errors); await O.ctx.close();

  // ================= phone 390x844 =================
  const PH = await context(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await PH.page.goto(WORLD); await waitWorld(PH.page); await godMode(PH.page);
  await A(PH.page, (a, w, t) => w.setEventClock(t), boss.startsAt + 1);
  await goSite(PH.page, boss); await PH.page.waitForTimeout(800);
  const lay = await PH.page.evaluate(() => {
    const r = (id) => { const e = document.getElementById(id); if (!e || e.classList.contains('hidden')) return null; const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
    return { ev: r('rw-event'), hint: r('rw-event-hint'), zone: r('rw-zone'), mini: r('rw-minimap'), move: r('realm-stick-move'), aim: r('realm-stick-aim'), hud: r('realm-hud'), vw: innerWidth, vh: innerHeight, scroll: document.documentElement.scrollWidth };
  });
  const inside = (b) => b && b.l >= 0 && b.t >= 0 && b.r <= lay.vw && b.b <= lay.vh;
  const overlap = (a, b) => a && b && a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
  check('phone: event HUD line and hint sit inside the screen, clear of the minimap, HUD and sticks; no horizontal scroll', inside(lay.ev) && inside(lay.hint) && !overlap(lay.ev, lay.mini) && !overlap(lay.hint, lay.move) && !overlap(lay.hint, lay.aim) && !overlap(lay.ev, lay.hud) && lay.scroll <= lay.vw, JSON.stringify(lay));
  errs.push(...PH.errors); await PH.ctx.close();

  check('no console errors', errs.length === 0, errs.join(' | '));
  await browser.close();
  done();
})();
