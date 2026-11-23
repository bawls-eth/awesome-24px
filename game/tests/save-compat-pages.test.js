// Save / migration safety, browser half (SAVE-KEYS.md). Every game page is loaded with:
//   old      - every stored key in an EARLY shape (save-compat-fixtures.js) -> no console errors, and after the page has loaded, saved
//              (pagehide / visibilitychange) and reloaded, every fixture leaf is still there unchanged (additive-only writes, no data loss)
//   hostile  - every key holds a hostile value (corrupt JSON, wrong JSON type, wrong field types / NaN strings, prototype keys, a huge array,
//              a ~1 MB string) in 3 rotations -> the page still renders, 0 page errors, Object.prototype never polluted
//   quota    - the old fixtures, then storage filled to the quota so every write throws QuotaExceededError -> no page error, and no
//              fixture is lost (a failed write must never delete or truncate what was there)
//   blocked  - Storage getItem / setItem / removeItem / key all throw SecurityError (blocked site data) -> the page still renders, 0 page errors
// Town (index.html) only through the OFFLINE stub: blockDb + an empty Firebase SDK, entered with "Play offline"; it also checks hero compat:
// the legacy species/frame stays stored as is. OFFLINE ONLY for every page: 0 database requests, never chats, never writes to Firebase.
// Run: python3 -m http.server 8440 &   BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/save-compat-pages.test.js
//      ONLY=hub,pop   to run a subset of pages; MODES=old,quota  to run a subset of scenarios.
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const FX = require('./save-compat-fixtures.js');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const ROOT = BASE.replace(/index\.html.*$/, '');

const PAGES = [
  { id: 'town', path: 'index.html', town: true },
  { id: 'hub', path: 'hub/index.html' },
  { id: 'realm', path: 'games/mad-maze/index.html' },
  { id: 'lantern', path: 'games/mad-maze/lantern.html' },
  { id: 'isles', path: 'games/isles/index.html' },
  { id: 'jam', path: 'games/jam/index.html' },
  { id: 'deepdelve', path: 'games/deepdelve/index.html' },
  { id: 'angler', path: 'games/angler/index.html' },
  { id: 'stalk', path: 'games/stalk/index.html' },
  { id: 'bugs', path: 'games/festival/bugs.html' },
  { id: 'dash', path: 'games/dash/index.html' },
  { id: 'pop', path: 'games/pop/index.html' },
  { id: 'stack', path: 'games/stack/index.html' },
  { id: 'echo', path: 'games/echo/index.html' }
];
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
const MODES = (process.env.MODES || 'old,hostile,quota,blocked').split(',').filter(Boolean);

// Hostile values (strings as stored). BIG_* are built in the page to keep the test light.
const HOSTILE = [
  '{nope', '[]', '123', '"just a string"', 'null', 'true', 'NaN',
  '{"__proto__":{"polluted":1},"constructor":{"prototype":{"polluted":1}},"v":1}',
  '{"v":"x","best":"NaN","bestScore":{"a":1},"medals":"zzz","heroes":{"0":1},"stash":7,"items":"x","entries":5,"stars":[1],"journal":"j","caught":[1,2],"days":-1e308,"name":{"x":1},"species":["punks"],"frame":"9","level":1e999}',
  'BIG_ARRAY', 'BIG_STRING'
];

async function open(browser, page0, mode, round) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const db = await blockDb(ctx);
  await ctx.route(/gstatic\.com\/firebasejs\//, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: '/* firebase SDK blocked by save-compat-pages.test.js */' }));
  const seed = {};
  if (mode === 'old' || mode === 'quota') FX.KEYS.forEach((k) => { seed[k] = FX.rawOf(k); });
  if (mode === 'hostile') FX.KEYS.forEach((k, i) => { seed[k] = HOSTILE[(i + round * 5) % HOSTILE.length]; });
  await ctx.addInitScript(([seedJson, m]) => {
    const seedObj = JSON.parse(seedJson);
    if (!sessionStorage.getItem('__compatSeeded')) {
      sessionStorage.setItem('__compatSeeded', '1');
      Object.keys(seedObj).forEach((k) => {
        let v = seedObj[k];
        if (v === 'BIG_ARRAY') v = JSON.stringify({ v: 1, medals: Array.from({ length: 60000 }, (_, i) => 'm' + i), entries: Array.from({ length: 2000 }, () => ({ text: 'x' })), heroes: Array.from({ length: 5000 }, () => ({})) });
        if (v === 'BIG_STRING') v = JSON.stringify({ v: 1, name: 'n'.repeat(1000000) });
        try { localStorage.setItem(k, v); } catch (e) { /* the quota can refuse a big one: fine */ }
      });
      if (m === 'quota') {
        // Fill to the quota: halve the chunk until even a 1 KB write fails.
        let n = 0, size = 1 << 20;
        const chunk = (s) => 'q'.repeat(s);
        while (size >= 1024 && n < 400) { try { localStorage.setItem('__quota_fill_' + n, chunk(size)); n++; } catch (e) { size = size >> 1; } }
        sessionStorage.setItem('__quotaFill', String(n));
      }
    }
    if (m === 'blocked') {
      const boom = () => { throw new DOMException('The operation is insecure.', 'SecurityError'); };
      ['getItem', 'setItem', 'removeItem', 'key', 'clear'].forEach((f) => { try { Storage.prototype[f] = boom; } catch (e) { /* ignore */ } });
    }
  }, [JSON.stringify(seed), mode]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
  if (page0.town) {
    await page.route('**/main.js*', async (route) => {
      const resp = await route.fetch();
      const body = (await resp.text()).replace('const game = new Phaser.Game(config);', 'const game = window.__g = new Phaser.Game(config);');
      route.fulfill({ response: resp, body });
    });
  }
  return { ctx, page, db, errors };
}

async function load(p, pg) {
  await p.page.goto(ROOT + pg.path, { waitUntil: 'load', timeout: 45000 });
  if (pg.town) {
    // Join exactly like a returning player: keep the stored name / species (never click a hero, so the legacy key must survive as is).
    await p.page.waitForSelector('#name-input', { timeout: 15000 });
    if (!(await p.page.inputValue('#name-input')).trim()) await p.page.fill('#name-input', 'ADMINcompat');
    await p.page.tap('button:has-text("Join Town")');
    await p.page.waitForSelector('#join-offline-btn:not(.hidden)', { timeout: 15000 });
    await p.page.tap('#join-offline-btn');
    await p.page.waitForFunction(() => window.__g && window.__g.scene.getScene('Town') && window.__g.scene.getScene('Town').localBody, null, { timeout: 30000 });
  }
  await p.page.waitForTimeout(1800);
}
// Make every page save the way it does when the player leaves (pagehide / tab hidden), then wait for the writes.
const flush = (page) => page.evaluate(() => {
  try { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); } catch (e) { /* ignore */ }
  try { document.dispatchEvent(new Event('visibilitychange')); } catch (e) { /* ignore */ }
  try { window.dispatchEvent(new Event('pagehide')); } catch (e) { /* ignore */ }
  return new Promise((r) => setTimeout(r, 300));
});
const readAll = (page, keys) => page.evaluate((ks) => { const o = {}; ks.forEach((k) => { try { o[k] = localStorage.getItem(k); } catch (e) { o[k] = '(threw)'; } }); return o; }, keys);
const rendered = (page) => page.evaluate(() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 20 && r.height > 20 && cs.display !== 'none' && cs.visibility !== 'hidden'; };
  const canvas = [...document.querySelectorAll('canvas')].some(vis);
  const text = (document.body && document.body.innerText || '').trim().length;
  return { canvas, text, polluted: ({}).polluted !== undefined || Object.prototype.polluted !== undefined };
});

(async () => {
  const browser = await chromium.launch();
  const lossReport = [];
  for (const pg of PAGES.filter((x) => !ONLY.length || ONLY.indexOf(x.id) >= 0)) {
    for (const mode of MODES) {
      const rounds = mode === 'hostile' ? 3 : 1;
      for (let round = 0; round < rounds; round++) {
        const L = `${pg.id} [${mode}${rounds > 1 ? ' ' + (round + 1) : ''}]`;
        const p = await open(browser, pg, mode, round);
        let loadErr = null;
        try { await load(p, pg); } catch (e) { loadErr = e.message.split('\n')[0]; }
        check(`${L}: page loads (Town: offline join works)`, !loadErr, loadErr || '');
        const r = await rendered(p.page).catch(() => ({ canvas: false, text: 0, polluted: false }));
        check(`${L}: something renders (a canvas or text)`, r.canvas || r.text > 0, JSON.stringify(r));
        check(`${L}: Object.prototype is not polluted`, !r.polluted);
        if (mode === 'old' || mode === 'quota') {
          await flush(p.page).catch(() => {});
          const after = await readAll(p.page, FX.KEYS);
          const lostNow = {};
          FX.KEYS.forEach((k) => { const l = FX.lost(k, after[k]); if (l.length) lostNow[k] = l; });
          if (mode === 'old') {
            // and a second visit reads its own writes back without losing anything either
            await p.page.reload({ waitUntil: 'load' }).catch(() => {});
            if (pg.town) await load(p, pg).catch(() => {}); else await p.page.waitForTimeout(1500);
            await flush(p.page).catch(() => {});
            const again = await readAll(p.page, FX.KEYS);
            FX.KEYS.forEach((k) => { const l = FX.lost(k, again[k]); if (l.length && !lostNow[k]) lostNow[k] = l.map((x) => '(after reload) ' + x); });
          }
          Object.keys(lostNow).forEach((k) => lossReport.push(`${L} ${k}: ${lostNow[k].join('; ')}`));
          check(`${L}: no fixture data lost or rewritten (additive-only writes)`, !Object.keys(lostNow).length, JSON.stringify(lostNow).slice(0, 900));
          if (pg.town) {
            const st = JSON.parse(after['pixeltown-save-v1'] || '{}');
            check(`${L}: Town keeps the legacy species/frame as stored (hero compat)`, st.species === 'goldenpunks' && st.frame === 5, JSON.stringify({ species: st.species, frame: st.frame }));
            if (mode === 'old') {
              // Presence records with every legacy species key the Town ever shipped, frames 0..8 (+ junk), render as heroes and are never mutated.
              const pr = await p.page.evaluate(() => {
                const s = window.__g.scene.getScene('Town');
                const keys = ['coolcats', 'punks', 'pudgypenguins', 'doge', 'apes', 'zombies', 'mohawks', 'blondies', 'aliens', 'alienclan', 'apepunks',
                  'coolcats_dragons', 'coolcats_frogs', 'coolcats_ninjas', 'coolcats_pirates', 'coolcats_unicorns', 'genius', 'goldenpunks', 'halloweenpunks',
                  'phunks', 'punkettes', 'mooncats', 'hero_mage', 'whatever_new', '', null];
                const bad = [], mutated = [];
                let n = 0;
                keys.forEach((k) => [0, 1, 2, 3, 4, 5, 6, 7, 8, 99, -1, '3', null].forEach((f) => {
                  const rec = { id: 'compat_' + (n++), name: 'ADMINp', species: k, frame: f, x: 600, y: 600, facing: 1 };
                  const snap = JSON.stringify(rec);
                  try {
                    s.addRemotePlayer(rec);
                    const rp = s.remotePlayers.get(rec.id);
                    const key = rp && (rp.visual || rp.sprite) && (rp.visual || rp.sprite).texture.key;
                    if (!/^hero_/.test(String(key))) bad.push(k + ':' + f + '->' + key);
                  } catch (e) { bad.push(k + ':' + f + ' threw ' + e.message); }
                  if (JSON.stringify(rec) !== snap) mutated.push(k + ':' + f);
                }));
                const self = window.__g.scene.getScene('Town').selfData;
                return { n, bad: bad.slice(0, 5), nBad: bad.length, mutated: mutated.slice(0, 5), self: self && { species: self.species, frame: self.frame } };
              });
              check(`${L}: ${pr.n} legacy / junk presence records render as hero textures`, pr.nBad === 0, JSON.stringify(pr.bad));
              check(`${L}: presence records are never mutated by rendering`, pr.mutated.length === 0, JSON.stringify(pr.mutated));
              check(`${L}: own selfData keeps the legacy species/frame (what presence publishes)`, pr.self && pr.self.species === 'goldenpunks' && pr.self.frame === 5, JSON.stringify(pr.self));
            }
          }
        }
        check(`${L}: 0 page / console errors`, p.errors.length === 0, p.errors.slice(0, 3).join(' | '));
        check(`${L}: 0 database requests`, p.db.count() === 0, JSON.stringify(p.db.http.concat(p.db.ws).slice(0, 2)));
        await p.ctx.close();
      }
    }
  }
  if (lossReport.length) { console.log('--- data-loss report ---'); lossReport.forEach((l) => console.log('LOSS ' + l)); }
  await browser.close();
  done();
})();
