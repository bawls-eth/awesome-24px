// Beta S-06 (b13-01, P1): MMArt fetches each JSON url once per page (shared in-flight Promise, failed fetch evicted).
// Realm world page only (no Firebase on it; the Town/Hub links are stubbed). Baseline = the same mm-art.js with the cache line
// removed (served through a route), measured in the same run, so the numbers are comparable on a loaded machine.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-s06-art-cache.test.js
//  1. Realm world cold start: every .json url under assets/ is requested at most once.
//  2. Cold-start requests and JSON bytes drop versus the uncached baseline (both numbers printed).
//  3. Art still resolves: hero / enemy / item art sets load (art state not loading, hero art ready).
//  4. A 404 manifest then a retry: the second call fetches again (no cached null).
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&seed=12345';
const CACHE_LINE = 'if (jsonCache[key]) return jsonCache[key];';

async function coldStart(browser, uncached) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' }));
  await ctx.route('**/hub/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>hub</title>hub' }));
  if (uncached) {
    await ctx.route('**/shared/mm-art.js*', async (route) => {
      const resp = await route.fetch();
      const src = await resp.text();
      route.fulfill({ response: resp, body: src.replace(CACHE_LINE, '/* cache off: S-06 baseline */') });
    });
  }
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  const reqs = [];
  page.on('request', (r) => reqs.push(r.url()));
  await page.goto(WORLD);
  await page.waitForFunction(() => window.__mm && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1500);
  return { ctx, page, errors, reqs };
}

// JSON bytes are computed from the request list and the files on disk (deterministic: the same requests always weigh the same),
// not from response bodies, whose capture depends on timing under load.
const fsz = (u) => { try { const pth = require('path').join(__dirname, '..', '..', decodeURIComponent(new URL(u).pathname)); return require('fs').statSync(pth).size; } catch (e) { return 0; } };
const bytesOf = (urls) => urls.reduce((a, u) => a + fsz(u), 0);
(async () => {
  const browser = await chromium.launch();
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'shared', 'mm-art.js'), 'utf8');
  check('mm-art.js has the JSON cache line the baseline removes', src.includes(CACHE_LINE));

  const base = await coldStart(browser, true);
  const baseJson = base.reqs.filter((u) => /\/assets\/.*\.json(\?|$)/.test(u));
  await base.ctx.close();

  const cur = await coldStart(browser, false);
  const json = cur.reqs.filter((u) => /\/assets\/.*\.json(\?|$)/.test(u));
  const counts = {};
  json.forEach((u) => { counts[u] = (counts[u] || 0) + 1; });
  const dup = Object.keys(counts).filter((u) => counts[u] > 1);
  const bBytes = bytesOf(baseJson), cBytes = bytesOf(json);
  const bUniq = new Set(baseJson).size, cUniq = new Set(json).size;
  console.log(`  baseline: ${base.reqs.length} requests, ${baseJson.length} json (${bUniq} unique), ${bBytes} json bytes`);
  console.log(`  cached:   ${cur.reqs.length} requests, ${json.length} json (${cUniq} unique), ${cBytes} json bytes`);
  check('[1] every assets/*.json url requested at most once', dup.length === 0, dup.map((u) => u.replace(ORIGIN, '') + ' x' + counts[u]).join(', '));
  check('[1] the baseline really fetched INDEX.json more than once', baseJson.filter((u) => /INDEX\.json/.test(u)).length > 1, String(baseJson.filter((u) => /INDEX\.json/.test(u)).length));
  check('[2] fewer cold-start JSON requests than the baseline', json.length < baseJson.length, `${baseJson.length} -> ${json.length}`);
  check('[2] cold-start JSON requests drop by >= 100', baseJson.length - json.length >= 100, `${baseJson.length} -> ${json.length}`);
  check('[2] the cached page still requests every JSON url the baseline needed', [...new Set(baseJson)].every((u) => json.includes(u)), `${bUniq} unique -> ${cUniq} unique`);
  check('[2] fewer JSON bytes requested than the baseline (file sizes x requests)', cBytes < bBytes, `${bBytes} -> ${cBytes}`);
  check('[2] JSON bytes drop by >= 2 MB (lane acceptance)', bBytes - cBytes >= 2000000, `${bBytes} -> ${cBytes}`);
  const art = await cur.page.evaluate(() => { const s = window.__mm.world.artState(); return { loading: s.loading, loaded: s.loaded.length }; });
  check('[3] world art finished loading with sprites', art.loading === false && art.loaded > 0, JSON.stringify(art));
  const items = await cur.page.evaluate(async () => { const s = await window.MMArt.loadItems('../../assets/arcane/'); return Object.keys(s.byId).length; });
  check('[3] item icons still resolve (from the cached manifests)', items > 10, String(items));
  const before = cur.reqs.filter((u) => /INDEX\.json/.test(u)).length;
  await cur.page.evaluate(() => window.MMArt.loadItems('../../assets/arcane/'));
  check('[3] a second loadItems does not refetch INDEX.json', cur.reqs.filter((u) => /INDEX\.json/.test(u)).length === before);

  // ---- 4: a missing manifest is not cached ----
  const miss = () => cur.reqs.filter((u) => /s06-missing\/manifest\.json/.test(u)).length;
  const r1 = await cur.page.evaluate(() => window.MMArt.load('../../assets/arcane/', 's06-missing/manifest.json').then((s) => Object.keys(s.registry).length));
  await cur.page.waitForTimeout(200);
  const n1 = miss();
  await cur.page.evaluate(() => window.MMArt.load('../../assets/arcane/', 's06-missing/manifest.json'));
  await cur.page.waitForTimeout(200);
  check('[4] a 404 manifest yields an empty set (never rejects)', r1 === 0);
  check('[4] the retry fetches the missing manifest again', n1 === 1 && miss() === 2, `${n1} then ${miss()}`);
  check('no page errors', cur.errors.length === 0 && base.errors.length === 0, cur.errors.concat(base.errors).join(' | '));
  await cur.ctx.close();
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
