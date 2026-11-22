// Hub map progress fed by the six minigames (MMHubProfile.sync, profile key `pixeltown-profile-v1` only).
// Each game is loaded with a seeded save of ITS OWN key; on load it reports the milestones that save already shows.
// Then the hub must show the medals, exits, opened paths, comets and Tokens. Also: corrupt keys -> defaults, a revisit
// never double-counts, the Town save is untouched, the Continue card, fresh-save reachability, phone layout, 0 DB requests.
// Serve the repo root first:  python3 -m http.server 9051 &
// Run: BASE=http://localhost:9051/game/index.html NODE_PATH=$(npm root -g) node game/tests/hub-progress.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const JS = require('../shared/mm-jam-songs.js');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const HUB = ORIGIN + '/game/hub/index.html';
const GAME = ORIGIN + '/game/games/';
const PROFILE = 'pixeltown-profile-v1';
const TOWN = JSON.stringify({ name: 'Mossy', species: 'coolcats', frame: 2, coins: 77 });
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
const hero = (o) => Object.assign({ id: 'h1', name: 'Tester', cls: 'ranger', level: 1, xp: 0, fame: 0, bonus: 0, mode: 'classic', items: [] }, o);
const jamBest = {};
JS.SONGS.slice(0, 4).forEach((so) => { jamBest[so.id] = { normal: { score: 5000, stars: 3, rank: 'S', combo: 40 }, hard: { score: 5000, stars: 3, rank: 'S', combo: 40 } }; });

// game -> [page, its own save key, seeded save, milestone ids the save shows]
const GAMES = [
  ['jam', 'jam/index.html?test=1', 'pixeltown-jam-v1', { v: 1, best: jamBest, plays: 5, fullCombo: true }, ['play', 'star1', 'stars12', 'fullcombo', 'hard3']],
  ['bugs', 'festival/bugs.html?test=1', 'pixeltown-bugs-v1', { v: 1, stars: { meadow: 3, orchard: 3 }, best: { meadow: 900 }, journal: { ladybug: 2, goldbeetle: 1 } }, ['catch1', 'stars6', 'rare']],
  ['stalk', 'stalk/index.html?test=1', 'pixeltown-stalk-v1', { v: 1, medals: { bronze: true, silver: true, gold: false }, played: 2 }, ['trade', 'bronze', 'silver']],
  ['angler', 'angler/index.html?test=1', 'pixeltown-angler-v1', { caught: { koi: { n: 1, best: 30 }, puffer: { n: 2, best: 20 }, golden_trout: { n: 1, best: 40 } }, bosses: {}, trophies: { old_whiskers: true } }, ['catch1', 'west', 'east', 'river', 'pier', 'whiskers', 'trout']],
  ['deepdelve', 'deepdelve/index.html?test=1', 'pixeltown-deepdelve-v1', { v: 1, mode: 'survival', goals: { bronze: true, silver: true, maxDepth: 9 } }, ['dig', 'bronze', 'silver']],
  ['lantern', 'mad-maze/lantern.html?test=1', 'pixeltown-mm-v1', { v: 1, heroes: [hero({ level: 6 })] }, ['hero1', 'level5']],
];
const all = [];

async function context(browser, opts) {
  const ctx = await browser.newContext(opts || { viewport: { width: 1100, height: 760 } });
  const db = await blockDb(ctx);
  const errors = [];
  ctx.on('page', (p) => {
    p.on('pageerror', (e) => errors.push(p.url().split('/game/')[1] + ' pageerror: ' + e.message));
    p.on('console', (m) => { if (m.type() === 'error') errors.push(p.url().split('/game/')[1] + ' console: ' + m.text()); });
  });
  const page = await ctx.newPage();
  const o = { ctx, db, errors, page }; all.push(o);
  return o;
}
async function seed(page, kv) { // seed from a same-origin page (no app script runs on a .css file)
  await page.goto(ORIGIN + '/game/hub/hub.css');
  await page.evaluate((s) => { Object.keys(s).forEach((k) => (s[k] === null ? localStorage.removeItem(k) : localStorage.setItem(k, s[k]))); }, kv);
}
async function hub(page, url) {
  await page.goto(url || HUB);
  await page.waitForFunction(() => window.__hub);
  await page.waitForTimeout(150);
  return page.evaluate(() => window.__hub.progress());
}
const prof = (page) => page.evaluate((k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return 'corrupt'; } }, PROFILE);
const medal = (p, id, m) => !!(p.nodes[id] && p.nodes[id].medals[m]);
const exit = (p, id, e) => !!(p.nodes[id] && p.nodes[id].exits.includes(e || 'normal'));

(async () => {
  const browser = await chromium.launch();

  // 1. one scripted milestone set per game: seed its own save, load the game page, then read the hub
  const A = await context(browser);
  await seed(A.page, { 'pixeltown-save-v1': TOWN });
  const fresh = await hub(A.page);
  check('fresh save: hub shows 0 medals, 0 Tokens, 0%', fresh.medals === 0 && fresh.tokens === 0 && fresh.pct === 0, JSON.stringify([fresh.medals, fresh.tokens, fresh.pct]));
  check('fresh save: the hub itself writes no profile key', (await prof(A.page)) === null);
  for (const [g, url, key, save, want] of GAMES) {
    await seed(A.page, { [key]: JSON.stringify(save) });
    await A.page.goto(GAME + url);
    await A.page.waitForFunction((k) => { try { return !!JSON.parse(localStorage.getItem(k)).games; } catch (e) { return false; } }, PROFILE, { timeout: 20000 }).catch(() => {});
    await A.page.waitForTimeout(g === 'deepdelve' ? 800 : 300);
    const p = await prof(A.page);
    const doneList = p && p.games && p.games[g] && p.games[g].done;
    check(g + ': loading the game with its seeded save reports exactly ' + want.join(','), Array.isArray(doneList) && JSON.stringify(doneList.slice().sort()) === JSON.stringify(want.slice().sort()), JSON.stringify(doneList));
  }
  check('Town save byte-identical after six games reported', (await A.page.evaluate(() => localStorage.getItem('pixeltown-save-v1'))) === TOWN);
  const P = await hub(A.page);
  check('jam: w5-jam bronze/silver/gold + Jam Expert comet', medal(P, 'w5-jam', 'b') && medal(P, 'w5-jam', 's') && medal(P, 'w5-jam', 'g') && exit(P, 'w6-expert') && P.comets.includes('w6-expert'), JSON.stringify(P.nodes['w5-jam']));
  check('bugs: w5-safari bronze + silver + its secret exit', medal(P, 'w5-safari', 'b') && medal(P, 'w5-safari', 's') && !medal(P, 'w5-safari', 'g') && exit(P, 'w5-safari', 'secret'));
  check('stalk: w5-stalk bronze + silver, exit opens the Festival Finale path', medal(P, 'w5-stalk', 'b') && medal(P, 'w5-stalk', 's') && P.open.includes('w5-stalk>w5-finale'));
  check('angler: ponds cleared, River secret, Old Whiskers, Golden Trout comet', ['w4-west', 'w4-east', 'w4-pier', 'w4-whiskers'].every((id) => exit(P, id)) && exit(P, 'w4-river', 'secret') && P.comets.includes('w6-trout'));
  check('angler: the West -> East -> Pier -> Old Whiskers paths are open', ['w4-west>w4-east', 'w4-east>w4-river', 'w4-east>w4-pier', 'w4-pier>w4-whiskers'].every((id) => P.open.includes(id)), JSON.stringify(P.open));
  check('deepdelve: Deepdelve bronze, Depth -8 and Iron Age cleared, Iron paths open', medal(P, 'w3-deepdelve', 'b') && exit(P, 'w3-depth8') && exit(P, 'w3-iron') && P.open.includes('w3-depth8>w3-iron') && P.open.includes('w3-iron>w3-crystal') && !exit(P, 'w3-lava', 'secret'));
  check('lantern: The Lantern bronze and the Catacombs cleared (keep path open)', medal(P, 'w2-lantern', 'b') && exit(P, 'w2-catacombs') && P.open.includes('w2-catacombs>w2-keep') && !exit(P, 'w2-keep'));
  check('cross-game: First Steps, Sparkle Dash, Gate Practice and the Festival Finale cleared', ['w0-first', 'w0-sparkle', 'w0-practice', 'w5-finale'].every((id) => exit(P, id)) && P.open.includes('w0-first>w0-sparkle'));
  const total = GAMES.reduce((n, x) => n + x[4].length, 0) + 4;
  check('Tokens: 10 per milestone, once each (' + total + ' milestones)', P.tokens === total * 10, String(P.tokens));
  check('medal gates move honestly: 8+ medals open W3 (gate), not yet 16 for W5', P.medals >= 8 && P.open.includes('w2-keep>w3-deepdelve') && (P.medals >= 16) === P.open.includes('w4-whiskers>w5-safari'), String(P.medals));
  check('completion percent moved above 0', P.pct > 0, String(P.pct));
  // HUD numbers come from the same state
  const hud = await A.page.evaluate(() => ({ t: document.getElementById('hud-tokens').textContent, m: document.getElementById('hud-medals').textContent }));
  check('HUD shows the reported Tokens and medals', hud.t === String(P.tokens) && hud.m === String(P.medals), JSON.stringify(hud));

  // 2. a revisit of each game never double-counts
  const before = JSON.stringify(await prof(A.page));
  await A.page.goto(GAME + 'jam/index.html?test=1'); await A.page.waitForTimeout(300);
  await A.page.goto(GAME + 'angler/index.html?test=1'); await A.page.waitForTimeout(300);
  check('revisiting games with no new milestone leaves the profile byte-identical', JSON.stringify(await prof(A.page)) === before);

  // 3. level node cards: real Play links + goals, no "Coming soon"
  await seed(A.page, { 'pixeltown-hub-v1': JSON.stringify({ v: 1, at: 'w3-depth8' }) });
  await hub(A.page);
  await A.page.keyboard.press('Enter');
  const c1 = await A.page.evaluate(() => ({ title: document.getElementById('card-title').textContent, href: document.getElementById('card-play').getAttribute('href'), play: !document.getElementById('card-play').hidden, soon: !document.getElementById('card-soon').hidden, goals: [...document.querySelectorAll('#card-goals li')].map((l) => l.className + '|' + l.textContent) }));
  check('Depth -8 card: Play opens Deepdelve, goal ticked, no Coming soon', c1.title === 'Depth -8 Checkpoint' && c1.href === '../games/deepdelve/index.html' && c1.play && !c1.soon && c1.goals.length === 1 && /^on\|\[x\] Reach depth 8$/.test(c1.goals[0]), JSON.stringify(c1));
  const cards = await A.page.evaluate(() => {
    const out = {};
    MMMap.MAP.nodes.forEach((n) => { if (!window.__hub.isShown(n.id) || n.type === 'start' || n.type === 'snack') return; out[n.id] = !!window.__hub.links()[n.id]; });
    return out;
  });
  const goalsOnly = Object.keys(cards).filter((id) => !cards[id]);
  check('every shown node except the cross-game goals has a real Play link', JSON.stringify(goalsOnly.sort()) === JSON.stringify(['w0-first', 'w0-practice', 'w0-sparkle', 'w5-finale']), JSON.stringify(goalsOnly));
  const hid = await A.page.evaluate(() => ['w2-daily', 'w2-sunken', 'w6-remix', 'w6-hardcore'].filter((id) => !window.__hub.isShown(id) && !window.__hub.isReachable(id)));
  check('unbuildable nodes are hidden (Daily Maze, Sunken Lantern, Remix, Deepdelve Hardcore)', hid.length === 4, JSON.stringify(hid));
  await A.page.keyboard.press('Escape');
  const ex = await A.page.evaluate(() => { window.__hub; return [...document.querySelectorAll('#card-soon')].map((e) => e.hidden); });
  check('Coming soon is not shown', ex.every(Boolean));

  // 4. Continue card (pixeltown-nav-v1 via MMNav.continueTarget): the last game visited was Angler (step 2)
  const cont = await A.page.evaluate(() => { const a = document.getElementById('hub-continue'); return { hidden: a.hidden, text: a.textContent, href: a.getAttribute('href'), place: a.dataset.place }; });
  check('Continue card names the last game and links to it', !cont.hidden && /Continue: Angler/.test(cont.text) && /^\.\.\/games\/angler\/index\.html(\?|$)/.test(cont.href) && cont.place === 'angler', JSON.stringify(cont));
  await A.page.reload(); await A.page.waitForFunction(() => window.__hub);
  const cont2 = await A.page.evaluate(() => document.getElementById('hub-continue').textContent);
  check('Continue survives a hub reload (uses the place before the map)', /Continue: Angler/.test(cont2), cont2);

  // 5. corrupt keys -> defaults; a game repairs the profile key when it reports
  const C = await context(browser);
  await seed(C.page, { 'pixeltown-save-v1': TOWN, [PROFILE]: '{not json<<', 'pixeltown-hub-v1': '[[[', 'pixeltown-nav-v1': '{"last":{"id":"evil","url":"javascript:alert(1)"}}' });
  const cp = await hub(C.page);
  const cc = await C.page.evaluate(() => ({ at: window.__hub.at, cont: document.getElementById('hub-continue').hidden }));
  check('corrupt profile + hub + nav keys: defaults (0 medals, 0 Tokens, start node, no Continue)', cp.medals === 0 && cp.tokens === 0 && cc.at === 'w0-square' && cc.cont, JSON.stringify([cp.medals, cp.tokens, cc]));
  await seed(C.page, { [PROFILE]: JSON.stringify({ v: 1, tokens: 'lots', nodes: { 'w5-stalk': 'x' }, games: { stalk: { done: ['gold', '<img>', 7] }, jam: 'nope' } }) });
  await C.page.goto(GAME + 'stalk/index.html?test=1'); await C.page.waitForTimeout(300);
  const cpp = await prof(C.page);
  check('hostile done-lists are sanitised: no fake gold, nothing new reported for an empty save', cpp && cpp.tokens === 'lots' && !(await hub(C.page)).nodes['w5-stalk'].medals.g, JSON.stringify(cpp));
  await seed(C.page, { [PROFILE]: '{not json', 'pixeltown-stalk-v1': JSON.stringify({ medals: { bronze: true } }) });
  await C.page.goto(GAME + 'stalk/index.html?test=1'); await C.page.waitForTimeout(300);
  const rep = await prof(C.page);
  check('a game reporting over a corrupt profile writes a clean one (seeded from the Town name)', rep && rep.name === 'Mossy' && rep.games.stalk.done.includes('bronze') && rep.nodes['w5-stalk'].medals.b, JSON.stringify(rep));
  check('Town save byte-identical (corrupt-key run)', (await C.page.evaluate(() => localStorage.getItem('pixeltown-save-v1'))) === TOWN);

  // 6. fresh-save reachability: all 8 game nodes open, Play in 2 taps (strip -> card Play), phone 390x844, no overlap
  const F = await context(browser, PHONE);
  await seed(F.page, { 'pixeltown-save-v1': TOWN, 'pixeltown-nav-v1': JSON.stringify({ v: 1, last: { id: 'angler', url: 'game/games/angler/index.html', t: 1 } }) });
  await hub(F.page);
  const gn = await F.page.evaluate(() => window.__hub.gameNodes().filter((id) => window.__hub.isPlayable(id)));
  check('fresh save: all 8 game nodes are playable', gn.length === 8, JSON.stringify(gn));
  let twoTaps = true;
  for (const id of gn) {
    await F.page.tap('#hub-games button[data-node="' + id + '"]');
    const ok = await F.page.evaluate(() => !document.getElementById('card').hidden && !document.getElementById('card-play').hidden && !!document.getElementById('card-play').getAttribute('href'));
    if (!ok) twoTaps = false;
    await F.page.tap('#card-close');
  }
  check('fresh save: every game is Play in 2 taps (strip, then Play)', twoTaps);
  const lay = await F.page.evaluate(() => {
    const r = (s) => { const e = document.querySelector(s); if (!e || e.hidden) return null; const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
    const boxes = { hud: r('#hud'), games: r('#hub-games'), cont: r('#hub-continue'), stage: r('#stage'), bar: r('#bar') };
    const over = (a, b) => a && b && a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5;
    const names = Object.keys(boxes), hits = [];
    for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) if (over(boxes[names[i]], boxes[names[j]])) hits.push(names[i] + '/' + names[j]);
    const nav = r('#mm-nav-btn');
    if (over(nav, boxes.cont) || over(nav, boxes.games)) hits.push('menu');
    return { hits, cont: boxes.cont, text: document.getElementById('hub-continue').textContent, sw: document.documentElement.scrollWidth, vw: innerWidth };
  });
  check('phone 390x844: Continue shown, no overlap with HUD/strip/map/bar/Menu, no horizontal scroll', lay.cont && /Angler/.test(lay.text) && lay.hits.length === 0 && lay.sw <= lay.vw && (lay.cont.b - lay.cont.t) >= 44, JSON.stringify(lay));
  await F.page.tap('#hub-continue');
  await F.page.waitForURL(/angler\/index\.html/, { timeout: 8000 }).catch(() => {});
  check('Continue is one tap to the named game', /\/game\/games\/angler\/index\.html/.test(F.page.url()), F.page.url());

  check('0 database requests in every context', all.every((o) => o.db.count() === 0), all.map((o) => o.db.count()).join(','));
  check('console clean on the hub and all six games', all.every((o) => o.errors.length === 0), all.map((o) => o.errors.join(' | ')).filter(Boolean).join(' || '));
  await browser.close();
  done();
})();
