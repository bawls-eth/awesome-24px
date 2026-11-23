// Campfire Jam bug bash: <= 40 words before Play, landscape fits without scrolling, tier curve is monotonic.
// Run: python3 -m http.server 8440 &  then  NODE_PATH=$(npm root -g) node game/tests/jam-bugbash.test.js
const { chromium } = require('playwright');
const path = require('path');
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/jam/index.html';

const J = require(path.join(__dirname, '..', 'shared', 'mm-jam.js'));
const G = require(path.join(__dirname, '..', 'shared', 'mm-jam-songs.js'));
for (const s of G.SONGS) {
  const n = G.TIERS.map((t) => G.chartFor(s.id, t));
  check(s.id + ': charts lint clean', n.every((c) => J.lint(c).ok));
  check(s.id + ': note counts rise easy < normal < hard', n[0].count < n[1].count && n[1].count < n[2].count, n.map((c) => c.count).join('/'));
}

(async () => {
  const browser = await chromium.launch();
  for (const [name, vp] of [['phone', { width: 390, height: 844 }], ['landscape', { width: 844, height: 390 }]]) {
    const ctx = await browser.newContext({ viewport: vp, hasTouch: true, isMobile: true });
    const p = await ctx.newPage();
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(PAGE);
    await p.waitForSelector('#quick-play');
    const before = await p.evaluate(() => { const q = document.getElementById('quick-play'); let n = 0; for (const c of document.getElementById('overlay').childNodes) { if (c === q) break; n += c.textContent.trim().split(/\s+/).filter(Boolean).length; } return n; });
    check(name + ': at most 40 words before Play (' + before + ')', before <= 40);
    await p.tap('#quick-play');
    await p.waitForTimeout(400);
    const m = await p.evaluate(() => ({ sh: document.documentElement.scrollHeight, vh: innerHeight, sw: document.documentElement.scrollWidth, vw: innerWidth, pads: document.getElementById('pads').getBoundingClientRect().bottom }));
    check(name + ': no page scroll while playing', m.sh <= m.vh + 1 && m.sw <= m.vw + 1, JSON.stringify(m));
    check(name + ': touch pads on screen', m.pads <= m.vh + 1, JSON.stringify(m));
    check(name + ': no errors', errors.length === 0, errors.join('|'));
    await ctx.close();
  }
  await browser.close();
  console.log(failed ? failed + ' FAILED' : 'ALL PASSED');
  process.exit(failed ? 1 : 0);
})();
