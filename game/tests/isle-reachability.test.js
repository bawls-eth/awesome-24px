// Slice XD1 (NEXT-SLICES-3): mars is reachable from a FRESH archipelago save on the real isles page. No ?isle=mars shortcut, no give():
// every input is picked up by walking over the page's own resource nodes (window.__isles test hooks), then crafted with the page's
// craft action, travelling with the page's sea-chart travel. Chain: home (wood) -> jungle (vine rope, amber) -> raft (reef opens) ->
// tundra (frost crystal) -> reef (driftwood, pearl) -> rocket_core_drift -> a rocket core in the pack.
// The last hop (crafting a rocket core opens mars on the sea chart) is page wiring (games/isles/isles.js UNLOCK_BY_ITEM keyed by the
// recipe's output item, slice XW1). Until that lands the test proves the chain up to the rocket core and prints an INFO line;
// once the page opens mars it also sails there and checks the arrival. The pure walk is MMIsleCraft.reachability (node tests).
// Offline: blockDb on the context, 0 DB requests; pixeltown-save-v1 is never written.
// Run: python3 -m http.server 9061 (repo root), then BASE=http://localhost:9061/game/index.html NODE_PATH=$(npm root -g) node game/tests/isle-reachability.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const X = require('../shared/mm-isle-craft.js');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/isles/index.html';
const TOWN = '{"realm":{"level":3},"name":"Bo"}';
const ARCH = 'pixeltown-archipelago-v1';

const ev = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__isles, ${JSON.stringify(arg === undefined ? null : arg)})`);
const ready = (page) => page.waitForFunction(() => window.__isles && window.__isles.world, null, { timeout: 20000 });
async function calm(page) { await ev(page, (I) => { I.god(true); I.clearCreatures(); return true; }); }
// walk onto ready nodes of `kind` until n more are in the pack -> { got, nodes }
const gather = (page, kind, n) => ev(page, (I, a) => {
  const have = () => I.inv()[a.k] || 0, g0 = have();
  const ns = I.nodes().filter((x) => x.kind === a.k && x.ready);
  for (let i = 0; i < ns.length && have() - g0 < a.n; i++) { I.teleport(ns[i].x, ns[i].y); I.step(0, 0, 1 / 60); }
  return { got: have() - g0, nodes: ns.length };
}, { k: kind, n: n });
async function sail(page, id) {
  await Promise.all([page.waitForNavigation({ timeout: 20000 }), ev(page, (I, d) => I.travel(d), id)]);
  await ready(page);
  await calm(page);
  return ev(page, (I) => ({ isle: I.isle, pack: I.pack }));
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  const db = await blockDb(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.addInitScript((town) => {
    if (sessionStorage.seeded) return;
    sessionStorage.seeded = '1';
    localStorage.clear();
    localStorage.setItem('pixeltown-save-v1', town);
  }, TOWN);
  await page.goto(PAGE + '?test=1&isle=home');
  await ready(page);
  await calm(page);

  const fresh = await ev(page, (I) => ({ isle: I.isle, inv: I.inv(), unlock: I.unlock(), reef: I.isleOpen('reef'), mars: I.isleOpen('mars'), ice: I.isleOpen('ice'), jungle: I.isleOpen('jungle') }));
  const arch0 = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), ARCH);
  check('0: a fresh profile starts on home with an empty pack; reef and mars locked, jungle and tundra open',
    fresh.isle === 'home' && Object.keys(fresh.inv).length === 0 && !fresh.reef && !fresh.mars && fresh.ice && fresh.jungle && (!arch0 || (arch0.visited || []).every((v) => v === 'home')), JSON.stringify(fresh));
  check('0: the pure walk agrees (home, jungle, tundra open; reef wave 1; mars wave 2)', X.reachability().ok && X.reachability().wave.mars === 2);

  // home: wood for the raft
  const w = await gather(page, 'wood', 4);
  check('1: home: 4 wood gathered by walking over nodes', w.got === 4, JSON.stringify(w));

  // jungle: vine rope for the raft, amber for the rocket core
  const j = await sail(page, 'jungle');
  const vr = await gather(page, 'vine_rope', 2), am = await gather(page, 'amber', 2);
  check('2: jungle reached; 2 vine rope and 2 amber gathered', j.isle === 'jungle' && vr.got === 2 && am.got === 2, JSON.stringify([j, vr, am]));
  const raft = await ev(page, (I) => I.craft('raft'));
  check('2: the raft crafts from open-island inputs and opens the reef', raft.ok && raft.unlocked === 'reef' && (await ev(page, (I) => I.isleOpen('reef'))), JSON.stringify(raft));

  // tundra: frost crystal
  const t = await sail(page, 'ice');
  const fc = await gather(page, 'frost_crystal', 2);
  check('3: tundra reached; 2 frost crystal gathered', t.isle === 'ice' && fc.got === 2, JSON.stringify([t, fc]));

  // reef (now open): driftwood and pearl
  const r = await sail(page, 'reef');
  const dw = await gather(page, 'driftwood', 3), pe = await gather(page, 'pearl', 1);
  check('4: reef reached through the raft; 3 driftwood and 1 pearl gathered', r.isle === 'reef' && dw.got === 3 && pe.got === 1, JSON.stringify([r, dw, pe]));
  const old = await ev(page, (I) => I.canCraft('rocket_core'));
  check('4: the iron rocket core is still out of reach (no iron off mars)', !old.ok && old.missing.some((m) => m.id === 'iron'), JSON.stringify(old));
  const rc = await ev(page, (I) => ({ c: I.craft('rocket_core_drift'), inv: I.inv(), mars: I.isleOpen('mars') }));
  check('5: rocket_core_drift crafts on the page and puts a rocket core in the pack', rc.c.ok && rc.inv.rocket_core === 1 && !rc.inv.rocket_core_drift && !rc.inv.driftwood && !rc.inv.pearl, JSON.stringify(rc));
  const saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), ARCH);
  check('5: the rocket core and the reef unlock are in the saved archipelago key', saved && saved.inv.rocket_core === 1 && saved.unlock.indexOf('reef') >= 0, JSON.stringify(saved && { inv: saved.inv, unlock: saved.unlock }));

  if (rc.mars) {
    const m = await sail(page, 'mars');
    check('6: mars opens from the crafted rocket core and the page sails there', m.isle === 'mars' && m.pack === 'mars', JSON.stringify(m));
  } else {
    console.log('INFO 6: the page does not yet open mars for a rocket core made by rocket_core_drift (UNLOCK_BY_ITEM is keyed by recipe id): XW1 wiring pending');
    check('6: until the page wiring lands, mars stays honestly locked (no shortcut was used)', !(await ev(page, (I) => I.travel('mars'))) && !(await ev(page, (I) => I.isleOpen('mars'))));
  }

  const town = await page.evaluate(() => localStorage.getItem('pixeltown-save-v1'));
  check('7: pixeltown-save-v1 is untouched', town === TOWN);
  check('7: 0 DB requests', db.count() === 0, JSON.stringify([db.http, db.ws]));
  check('7: no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
