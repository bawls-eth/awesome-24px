// Campfire Jam page. Serve the repo root first:  python3 -m http.server 8461 &
// Run: NODE_PATH=$(npm root -g) BASE=http://localhost:8461/game/index.html node game/tests/jam-page.test.js
// Set SHOTS=<dir> to also write desktop/phone screenshots. No network beyond the local server; no Firebase.
const { chromium } = require('playwright');
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/jam/index.html';
const URL = process.env.JAM_URL || PAGE + '?test=1';
const KEY = 'pixeltown-jam-v1';
// hand-made chart: deterministic note times for the judging windows
const CHART = { version: 1, difficulty: 'easy', bpm: 100, count: 5, lengthMs: 9000, notes: [
  { t: 1000, lane: 'D' }, { t: 2000, lane: 'F' }, { t: 3000, lane: 'J' }, { t: 4000, lane: 'K' }, { t: 5000, lane: 'D', hold: 600 }] };

async function open(browser, opts, init, url) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const errors = [], reqs = [], bad = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('request', (r) => reqs.push(r.url()));
  page.on('response', (r) => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
  if (init !== undefined) await page.addInitScript(([k, v]) => { if (!sessionStorage.seeded) { sessionStorage.seeded = '1'; localStorage.setItem(k, v); } }, [KEY, init]);
  await page.goto(url || URL);
  await page.waitForFunction(() => window.__jam);
  return { ctx, page, errors, reqs, bad };
}
// plays the current chart in time order (presses and hold releases interleaved), shifted by `shift` ms; skip = note index to leave out
const drive = (p, shift, skip) => p.evaluate(([sh, sk]) => {
  const J = window.__jam, ev = [];
  J.chart.notes.forEach((n, i) => { if (i === sk) return; ev.push({ t: n.t + sh, k: 0, n }); if (n.hold) ev.push({ t: n.t + n.hold + sh, k: 1, n }); });
  ev.sort((a, b) => a.t - b.t || a.k - b.k);
  for (const e of ev) { J.at(e.t); if (e.k === 0) J.press(e.n.lane); else J.release(e.n.lane); }
  J.step(70000);
}, [shift, skip === undefined ? -1 : skip]);
const startChart = (p) => p.evaluate((c) => { window.__jam.start('warm-embers', 'easy', { chart: c }); }, CHART);

(async () => {
  const browser = await chromium.launch();
  const shot = process.env.SHOTS;
  const d = await open(browser, { viewport: { width: 1000, height: 700 } });
  const p = d.page;

  // ---- load, menu, hint ----
  check('page loads with 12 song cards', await p.evaluate(() => document.querySelectorAll('.card[data-song]').length === 12));
  check('only Warm Embers is open at start', await p.evaluate(() => [...document.querySelectorAll('.card')].map((c) => !c.classList.contains('locked')).join() === 'true,false,false,false,false,false,false,false,false,false,false,false'));
  check('hard tier locked until Normal has 2 stars', await p.evaluate(() => document.querySelector('[data-song=warm-embers][data-tier=hard]').disabled && !document.querySelector('[data-song=warm-embers][data-tier=normal]').disabled));
  check('first-run hint card is shown', await p.evaluate(() => !!document.getElementById('hint') && document.getElementById('hint').textContent.includes('D F J K')));
  await p.click('#hint-ok');
  check('hint dismissed and remembered in the jam key', await p.evaluate((k) => !document.getElementById('hint') && JSON.parse(localStorage.getItem(k)).hint === true, KEY));
  check('unlock rule text is shown', await p.evaluate(() => document.getElementById('unlock-rule').textContent.includes('Lantern Shuffle opens at 2 total stars')));
  check('unlock rule lists the extended ladder (19/22/25/28) and the new songs show their star needs', await p.evaluate(() => { const t = document.getElementById('unlock-rule').textContent; return ['Fern Lullaby at 19', 'Spark Reel at 22', 'Dewdrop Drift at 25', 'Harvest Moonrise at 28'].every((x) => t.includes(x)) && document.querySelector('.card[data-song=harvest-moonrise]').textContent.includes('Needs 28 stars'); }));
  check('Concert button exists and is locked with one open song; secret card is last', await p.evaluate(() => document.getElementById('btn-concert').disabled && [...document.querySelectorAll('.card')].pop().dataset.song === 'midnight-campfire'));
  check('Practice buttons and the two accessibility toggles exist on the menu', await p.evaluate(() => document.querySelectorAll('.practice-btn').length === 12 && !!document.getElementById('pref-shapes') && !!document.getElementById('pref-lefty') && document.getElementById('hud-speed').textContent === ''));
  check('Best-run ghost toggle exists and is off by default; results have no stale data on the menu', await p.evaluate(() => document.getElementById('pref-ghost').getAttribute('aria-pressed') === 'false' && window.__jam.results === null && window.__jam.ghost.active === false));

  // ---- judging windows via the keyboard (deterministic clock) ----
  await startChart(p);
  check('overlay hidden while playing', await p.evaluate(() => window.__jam.mode === 'play' && document.getElementById('overlay').hidden));
  await p.evaluate(() => window.__jam.at(1040));
  await p.keyboard.down('KeyD'); await p.keyboard.up('KeyD');
  check('D at +40 ms is Perfect', await p.evaluate(() => window.__jam.lastJudge === 'perfect' && window.__jam.run.counts.perfect === 1));
  await p.evaluate(() => window.__jam.at(2080));
  await p.keyboard.down('ArrowDown'); await p.keyboard.up('ArrowDown');
  check('arrow Down (lane F) at +80 ms is Great', await p.evaluate(() => window.__jam.lastJudge === 'great' && window.__jam.run.counts.great === 1));
  await p.evaluate(() => window.__jam.at(3130));
  await p.keyboard.down('KeyJ'); await p.keyboard.up('KeyJ');
  check('J at +130 ms is Good', await p.evaluate(() => window.__jam.lastJudge === 'good' && window.__jam.run.counts.good === 1));
  check('wrong lane press does nothing', await p.evaluate(() => { const before = JSON.stringify(window.__jam.run); window.__jam.at(3500); return window.__jam.press('D') === null && JSON.stringify(window.__jam.run) === before; }));
  await p.evaluate(() => window.__jam.at(4139));
  check('note still hittable at +139 ms', await p.evaluate(() => window.__jam.run.counts.miss === 0));
  await p.evaluate(() => window.__jam.at(4200));
  check('note unhit past +140 ms is a Miss and resets combo', await p.evaluate(() => window.__jam.run.counts.miss === 1 && window.__jam.run.combo === 0 && window.__jam.run.maxCombo === 3));
  check('score so far is 100 + 70 + 40', await p.evaluate(() => window.__jam.run.score === 210 && document.getElementById('hud-score').textContent === '210'));
  check('HUD shows combo text', await p.evaluate(() => document.getElementById('hud-combo').textContent === 'Combo 0'));
  await p.evaluate(() => window.__jam.at(5000));
  await p.keyboard.down('KeyD');
  check('hold note is held after the press', await p.evaluate(() => window.__jam.run.holds.join() === 'D' && window.__jam.run.counts.perfect === 2));
  await p.evaluate(() => window.__jam.at(5600));
  await p.keyboard.up('KeyD');
  check('hold released at its tail keeps combo', await p.evaluate(() => window.__jam.run.holds.length === 0 && window.__jam.run.combo === 1));
  check('still playing before the song ends', await p.evaluate(() => { window.__jam.at(8999); return window.__jam.mode === 'play'; }));
  await p.evaluate(() => window.__jam.step(2));
  check('song ends at its length, results screen shows', await p.evaluate(() => window.__jam.mode === 'results' && !document.getElementById('overlay').hidden));
  check('rank C and 1 star for 310/500', await p.evaluate(() => document.getElementById('res-rank').textContent === 'C' && document.getElementById('res-stars').textContent === '★☆☆'));
  check('results show score, counts, max combo', await p.evaluate(() => document.getElementById('res-score').textContent.startsWith('Score 310') && document.querySelector('[data-judge=perfect]').textContent === 'Perfect 2' && document.querySelector('[data-judge=miss]').textContent === 'Miss 1' && document.getElementById('res-acc').textContent.includes('Max combo 3')));
  check('summary hook agrees', await p.evaluate(() => { const s = window.__jam.summary; return s.score === 310 && s.rank === 'C' && s.stars === 1 && s.newBest === true; }));

  // ---- persistence ----
  const stored = await p.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
  check('best score written to pixeltown-jam-v1', stored.best['warm-embers'].easy.score === 310 && stored.best['warm-embers'].easy.rank === 'C' && stored.best['warm-embers'].easy.stars === 1 && stored.plays === 1);
  check('stored save has only known keys', ['best', 'hint', 'plays', 'unlocked', 'v'].every((k) => k in stored) && Object.keys(stored).every((k) => ['best', 'hint', 'plays', 'unlocked', 'v', 'hist', 'ghost', 'offsetMs', 'fullCombo', 'prefs', 'concert'].includes(k)), Object.keys(stored).join());
  // pixeltown-profile-v1: the hub map progress key (MMHubProfile.sync reports the first song)
  check('no other localStorage keys written', await p.evaluate(() => Object.keys(localStorage).every((k) => k === 'pixeltown-jam-v1' || k === 'pixeltown-nav-v1' || k === 'pixeltown-profile-v1')), await p.evaluate(() => Object.keys(localStorage).join()));
  await p.reload(); await p.waitForFunction(() => window.__jam);
  check('best survives reload and shows on the card', await p.evaluate(() => window.__jam.save.best['warm-embers'].easy.score === 310 && document.querySelector('.card[data-song=warm-embers]').textContent.includes('Easy 310 C')));
  // a worse run does not lower the best; a perfect run unlocks the next song
  await startChart(p);
  await p.evaluate(() => window.__jam.step(9100));
  check('all-miss run: rank D, best kept', await p.evaluate(() => window.__jam.summary.rank === 'D' && window.__jam.summary.newBest === false && window.__jam.save.best['warm-embers'].easy.score === 310));
  await p.evaluate(() => { window.__jam.start('warm-embers', 'easy'); const c = window.__jam.chart; for (const n of c.notes) { window.__jam.at(n.t); window.__jam.press(n.lane); if (n.hold) { window.__jam.at(n.t + n.hold); window.__jam.release(n.lane); } } window.__jam.at(c.lengthMs + 5); });
  check('perfect run: S rank, 3 stars, full combo text', await p.evaluate(() => document.getElementById('res-rank').textContent === 'S' && document.getElementById('res-stars').textContent === '★★★' && document.getElementById('res-acc').textContent.includes('Full combo!')));
  check('perfect run unlocks Lantern Shuffle and says so', await p.evaluate(() => document.getElementById('res-unlocked').textContent === 'Unlocked: Lantern Shuffle' && window.__jam.save.unlocked.includes('lantern-shuffle')));
  await p.reload(); await p.waitForFunction(() => window.__jam);
  check('unlock persists: Lantern card open, Moth Parade locked', await p.evaluate(() => !document.querySelector('.card[data-song=lantern-shuffle]').classList.contains('locked') && document.querySelector('.card[data-song=moth-parade]').classList.contains('locked') && document.querySelector('[data-song=lantern-shuffle][data-tier=easy]').disabled === false));
  check('play again button restarts the same song', await p.evaluate(() => { window.__jam.start('warm-embers', 'easy'); window.__jam.step(70000); document.getElementById('again').click(); return window.__jam.mode === 'play' && window.__jam.now === 0; }));

  // ---- pause (menu button, Esc, tab hidden) ----
  await startChart(p);
  await p.evaluate(() => window.__jam.at(500));
  await p.keyboard.press('Escape');
  check('Esc pauses and shows the pause card', await p.evaluate(() => window.__jam.mode === 'pause' && !document.getElementById('overlay').hidden && !!document.getElementById('resume')));
  check('time does not advance while paused', await p.evaluate(() => { window.__jam.step(2000); return window.__jam.now === 500; }));
  await p.click('#resume');
  check('resume continues play', await p.evaluate(() => { window.__jam.step(100); return window.__jam.mode === 'play' && window.__jam.now === 600; }));
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  check('tab hidden pauses the song', await p.evaluate(() => window.__jam.mode === 'pause'));
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { value: false, configurable: true }); });
  await p.click('#quit');
  check('quit returns to the song list without saving', await p.evaluate(() => window.__jam.mode === 'menu' && document.querySelectorAll('.card').length === 12));

  // ---- hold broken by early release ----
  await startChart(p);
  await p.evaluate(() => window.__jam.at(5000));
  await p.keyboard.down('KeyD');
  await p.evaluate(() => window.__jam.at(5100));
  await p.keyboard.up('KeyD');
  check('releasing a hold early breaks the combo', await p.evaluate(() => window.__jam.run.combo === 0 && window.__jam.run.holds.length === 0));

  // ---- mute ----
  check('mute button toggles and persists in the shared MMSfx key', await p.evaluate(() => {
    window.__jam.menu(); const b = document.getElementById('btn-mute'); const before = b.textContent; b.click();
    return before === 'Sound on' && b.textContent === 'Sound off' && b.getAttribute('aria-pressed') === 'true' && localStorage.getItem('mm-sfx-muted') === '1' && window.__jam.sfx.isMuted();
  }));
  await p.evaluate(() => document.getElementById('btn-mute').click());
  check('unmute restores', await p.evaluate(() => document.getElementById('btn-mute').textContent === 'Sound on' && localStorage.getItem('mm-sfx-muted') === '0'));

  // ---- motion: normal run has hit rings and shake on a miss ----
  await startChart(p);
  await p.evaluate(() => { window.__jam.at(1000); window.__jam.press('D'); });
  check('normal motion: hit ring spawns', await p.evaluate(() => window.__jam.reduced === false && window.__jam.rings === 1));
  await p.evaluate(() => window.__jam.at(2200));
  check('normal motion: miss shakes the field', await p.evaluate(() => window.__jam.shake > 0));
  check('no console errors / 404s (desktop)', d.errors.length === 0 && d.bad.length === 0, d.errors.concat(d.bad).join('|'));
  check('zero off-origin requests', d.reqs.every((u) => u.startsWith(ORIGIN + '/') || u.startsWith('data:')), d.reqs.filter((u) => !u.startsWith(ORIGIN + '/')).join(' '));
  check('no audio context in test mode (no audio files, no network)', await p.evaluate(() => window.__jam.audio === false) && d.reqs.every((u) => !/\.(mp3|ogg|wav|m4a)(\?|$)/.test(u)));
  if (shot) { await p.evaluate(() => { window.__jam.start('lantern-shuffle', 'easy'); window.__jam.step(0); }); await p.evaluate(() => { window.__jam.menu(); }); await p.screenshot({ path: shot + '/jam-menu.png' }); await p.evaluate(() => { window.__jam.start('warm-embers', 'normal'); window.__jam.step(9000); }); await p.screenshot({ path: shot + '/jam-desktop.png' }); }
  await d.ctx.close();

  // ---- corrupt / hostile saves ----
  const c1 = await open(browser, { viewport: { width: 1000, height: 700 } }, '{not json');
  check('corrupt save loads safe defaults', await c1.page.evaluate(() => { const s = window.__jam.save; return s.plays === 0 && s.hint === false && s.unlocked.join() === 'warm-embers' && Object.keys(s.best).length === 0; }));
  check('corrupt save is rewritten as valid JSON', await c1.page.evaluate((k) => JSON.parse(localStorage.getItem(k)).v === 1, KEY));
  check('corrupt save: no errors', c1.errors.length === 0, c1.errors.join('|'));
  await c1.ctx.close();
  const c2 = await open(browser, { viewport: { width: 1000, height: 700 } }, JSON.stringify({ junk: 1, plays: 'many', hint: 1, unlocked: ['starlit-stomp'], best: { 'warm-embers': { easy: { score: 1e15, stars: 99, rank: '<img src=x onerror=alert(1)>', combo: -3 } }, evil: { easy: { score: 5, stars: 3 } } } }));
  check('hostile save sanitised, tampered unlock list ignored', await c2.page.evaluate((k) => {
    const s = window.__jam.save, raw = JSON.parse(localStorage.getItem(k)), e = s.best['warm-embers'].easy;
    return e.score === 999999 && e.stars === 3 && e.rank === 'D' && e.combo === 0 && s.plays === 0 && s.hint === false && !('junk' in raw) && !('evil' in raw.best) && !s.unlocked.includes('starlit-stomp');
  }, KEY));
  check('hostile save renders as text only', await c2.page.evaluate(() => !document.querySelector('#overlay img')));
  await c2.ctx.close();
  const c3 = await open(browser, { viewport: { width: 1000, height: 700 } }, JSON.stringify([1, 2, 3]));
  check('array save loads safe defaults', await c3.page.evaluate(() => window.__jam.save.unlocked.join() === 'warm-embers'));
  await c3.ctx.close();

  // ---- reduced motion ----
  const rm = await open(browser, { viewport: { width: 1000, height: 700 }, reducedMotion: 'reduce' });
  await startChart(rm.page);
  await rm.page.evaluate(() => { window.__jam.at(1000); window.__jam.press('D'); window.__jam.at(2300); });
  check('reduced motion: no hit rings, no shake', await rm.page.evaluate(() => window.__jam.reduced === true && window.__jam.rings === 0 && window.__jam.shake === 0));
  await rm.ctx.close();
  const rm2 = await open(browser, { viewport: { width: 1000, height: 700 } }, undefined);
  await rm2.page.evaluate(() => localStorage.setItem('mm-reduce-motion', '1'));
  await rm2.page.reload(); await rm2.page.waitForFunction(() => window.__jam);
  check('shared mm-reduce-motion override is honoured', await rm2.page.evaluate(() => window.__jam.reduced === true));
  await rm2.ctx.close();

  // ---- calibration screen (deterministic taps through the test hook) ----
  const fresh = await open(browser, { viewport: { width: 1000, height: 700 } });
  const f = fresh.page;
  check('first run: calibrate card offered, no offsetMs stored yet', await f.evaluate((k) => !!document.getElementById('cal-card') && window.__jam.offset === 0 && !('offsetMs' in JSON.parse(localStorage.getItem(k))), KEY));
  check('calibration card sits after the song list and Easy of the first song is enabled', await f.evaluate(() => { const c = document.getElementById('cal-card'), l = document.querySelector('.songs'); return !!(l.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING) && !document.querySelector('button[data-song=warm-embers][data-tier=easy]').disabled; }));
  check('12 cards; the secret song shows as ??? and is locked', await f.evaluate(() => { const c = document.querySelector('.card[data-song=midnight-campfire]'); return document.querySelectorAll('.card').length === 12 && c.classList.contains('locked') && c.textContent.includes('???') && !c.textContent.includes('Midnight') && [...c.querySelectorAll('button')].every((b) => b.disabled); }));
  check('locked new songs say how many stars they need', await f.evaluate(() => document.querySelector('.card[data-song=kettle-song]').textContent.includes('Needs 10 stars')));
  await f.click('#cal-first');
  check('calibrate button opens the intro screen', await f.evaluate(() => window.__jam.mode === 'calib' && !!document.getElementById('cal-start') && window.__jam.cal.state === 'intro'));
  await f.click('#cal-start');
  check('test starts: 8 measured beats listed', await f.evaluate(() => window.__jam.cal.state === 'run' && window.__jam.cal.beats.length === 8 && !!document.getElementById('cal-tap')));
  await f.evaluate(() => { const b = window.__jam.cal.beats; for (const t of b) { window.__jam.calStep(t + 25 - window.__jam.cal.now); window.__jam.calTap(); } });
  check('beat counter reached 8 / 8', await f.evaluate(() => document.getElementById('cal-count').textContent === 'Beat 8 / 8'));
  await f.evaluate(() => window.__jam.calStep(2000));
  check('result: median +25 ms, tap late, Accept and Retry offered', await f.evaluate(() => { const r = document.getElementById('cal-result').textContent; return window.__jam.cal.state === 'done' && r.includes('+25 ms') && r.includes('you tap late') && !!document.getElementById('cal-accept') && !!document.getElementById('cal-retry'); }));
  await f.click('#cal-retry');
  check('Retry returns to the intro with no stored change', await f.evaluate((k) => window.__jam.cal.state === 'intro' && !('offsetMs' in JSON.parse(localStorage.getItem(k))), KEY));
  await f.click('#cal-start');
  await f.evaluate(() => { const b = window.__jam.cal.beats; b.forEach((t, i) => { window.__jam.calStep(t - 30 + (i === 3 ? 260 : 0) - window.__jam.cal.now); window.__jam.calTap(); }); window.__jam.calStep(2000); });
  check('second try: one wild tap is tolerated, median -30 ms (early)', await f.evaluate(() => { const r = document.getElementById('cal-result').textContent; return r.includes('-30 ms') && r.includes('you tap early'); }));
  await f.click('#cal-accept');
  check('Accept returns to the menu, stores offsetMs -30 and shows it', await f.evaluate((k) => window.__jam.mode === 'menu' && JSON.parse(localStorage.getItem(k)).offsetMs === -30 && window.__jam.offset === -30 && document.getElementById('offset-val').textContent === 'Timing offset: -30 ms' && !document.getElementById('cal-card'), KEY));
  check('stored keys: only additive offsetMs on top of the known set', await f.evaluate((k) => Object.keys(JSON.parse(localStorage.getItem(k))).sort().join() === 'best,hint,offsetMs,plays,unlocked,v', KEY));
  // too few taps: no Accept
  await f.click('#btn-calibrate'); await f.click('#cal-start');
  await f.evaluate(() => { const b = window.__jam.cal.beats; for (let i = 0; i < 2; i++) { window.__jam.calStep(b[i] - window.__jam.cal.now); window.__jam.calTap(); } window.__jam.calStep(6000); });
  check('too few taps: asks to retry, no Accept button, offset untouched', await f.evaluate(() => document.getElementById('cal-result').textContent.includes('Try again') && !document.getElementById('cal-accept') && window.__jam.offset === -30));
  await f.click('#cal-cancel');
  check('Cancel leaves the offset alone', await f.evaluate(() => window.__jam.mode === 'menu' && window.__jam.offset === -30));
  // keyboard taps and Esc
  await f.click('#btn-calibrate'); await f.click('#cal-start');
  await f.evaluate(() => window.__jam.calStep(window.__jam.cal.beats[0]));
  await f.keyboard.press('Space'); await f.keyboard.press('KeyF');
  check('Space and D/F/J/K register taps', await f.evaluate(() => window.__jam.cal.taps === 2));
  await f.keyboard.press('Escape');
  check('Esc leaves calibration', await f.evaluate(() => window.__jam.mode === 'menu' && window.__jam.cal === null));
  // manual nudge
  await f.click('#off-plus'); await f.click('#off-plus'); await f.click('#off-minus');
  check('+/- 5 ms nudge updates the label and the save (-30 -> -25)', await f.evaluate((k) => document.getElementById('offset-val').textContent === 'Timing offset: -25 ms' && JSON.parse(localStorage.getItem(k)).offsetMs === -25, KEY));
  check('fresh save no console errors (calibration)', fresh.errors.length === 0 && fresh.bad.length === 0, fresh.errors.concat(fresh.bad).join('|'));
  await fresh.ctx.close();

  // skip stores an explicit 0; old saves without offsetMs read as 0; hostile offsets are cleaned
  const sk = await open(browser, { viewport: { width: 1000, height: 700 } }, JSON.stringify({ v: 1, hint: true, plays: 3 }));
  check('old save without offsetMs: offset 0, calibrate card shown', await sk.page.evaluate(() => window.__jam.offset === 0 && !!document.getElementById('cal-card')));
  await sk.page.click('#cal-skip');
  check('Skip stores offsetMs 0 and hides the card', await sk.page.evaluate((k) => JSON.parse(localStorage.getItem(k)).offsetMs === 0 && !document.getElementById('cal-card') && JSON.parse(localStorage.getItem(k)).plays === 3, KEY));
  await sk.ctx.close();
  const ho = await open(browser, { viewport: { width: 1000, height: 700 } }, JSON.stringify({ v: 1, hint: true, offsetMs: 'abc' }));
  check('hostile offsetMs string: default 0, rewritten without it', await ho.page.evaluate((k) => window.__jam.offset === 0 && !('offsetMs' in JSON.parse(localStorage.getItem(k))), KEY));
  await ho.ctx.close();
  const hi = await open(browser, { viewport: { width: 1000, height: 700 } }, JSON.stringify({ v: 1, hint: true, offsetMs: 99999 }));
  check('huge offsetMs is clamped to 200 and stored clamped', await hi.page.evaluate((k) => window.__jam.offset === 200 && JSON.parse(localStorage.getItem(k)).offsetMs === 200 && document.getElementById('offset-val').textContent === 'Timing offset: +200 ms', KEY));
  await hi.page.click('#off-plus');
  check('nudge cannot go past +200', await hi.page.evaluate(() => window.__jam.offset === 200));
  await hi.ctx.close();

  // ---- offset applied to judging, hit glow and early/late indicator ----
  const of = await open(browser, { viewport: { width: 1000, height: 700 } }, JSON.stringify({ v: 1, hint: true, offsetMs: 60 }));
  const o = of.page;
  await startChart(o);
  await o.evaluate(() => window.__jam.at(1060)); await o.keyboard.down('KeyD'); await o.keyboard.up('KeyD');
  check('offset +60: a press 60 ms after the note is Perfect and on time', await o.evaluate(() => window.__jam.lastJudge === 'perfect' && window.__jam.timing === 'on time' && document.getElementById('hud-timing').textContent === 'Perfect on time'));
  check('hit glow spawns on a hit', await o.evaluate(() => window.__jam.glows === 1));
  await o.evaluate(() => window.__jam.at(2100)); await o.keyboard.down('KeyF'); await o.keyboard.up('KeyF');
  check('offset +60: press at +100 shows Perfect, late 40 ms', await o.evaluate(() => window.__jam.lastJudge === 'perfect' && window.__jam.timing === 'late 40 ms' && document.getElementById('hud-timing').textContent === 'Perfect late 40 ms'));
  await o.evaluate(() => window.__jam.at(2940)); await o.keyboard.down('KeyJ'); await o.keyboard.up('KeyJ');
  check('early press shows early (2940 vs 3000 with +60 -> -120)', await o.evaluate(() => window.__jam.timing === 'early 120 ms' && window.__jam.lastJudge === 'good'));
  check('hud timing is text only (no markup)', await o.evaluate(() => document.getElementById('hud-timing').children.length === 0));
  check('without an offset the same +100 press is only Good', await (async () => {
    const n = await open(browser, { viewport: { width: 1000, height: 700 } }, JSON.stringify({ v: 1, hint: true, offsetMs: 0 }));
    await startChart(n.page); await n.page.evaluate(() => { window.__jam.at(2100); window.__jam.press('F'); });
    const r = await n.page.evaluate(() => window.__jam.lastJudge + '|' + window.__jam.timing);
    await n.ctx.close(); return r === 'good|late 100 ms';
  })());
  check('offset run: no console errors', of.errors.length === 0 && of.bad.length === 0, of.errors.join('|'));
  await of.ctx.close();

  // results show the average early/late and offer to apply it
  const rs = await open(browser, { viewport: { width: 1000, height: 700 } }, JSON.stringify({ v: 1, hint: true, offsetMs: 0 }));
  await rs.page.evaluate(() => window.__jam.start('warm-embers', 'easy')); await drive(rs.page, 30);
  check('results: average timing says 30 ms late', await rs.page.evaluate(() => { const t = document.getElementById('res-timing').textContent; return window.__jam.mode === 'results' && t.includes('30 ms late') && t.includes('hits') && window.__jam.summary.avgDelta === 30; }));
  check('results offer "Set offset to +30 ms"', await rs.page.evaluate(() => document.getElementById('apply-suggest').textContent === 'Set offset to +30 ms'));
  await rs.page.click('#apply-suggest');
  check('applying the suggestion saves offsetMs 30', await rs.page.evaluate((k) => window.__jam.offset === 30 && JSON.parse(localStorage.getItem(k)).offsetMs === 30 && document.getElementById('apply-suggest').disabled, KEY));
  await rs.page.evaluate(() => window.__jam.start('warm-embers', 'easy')); await drive(rs.page, -25);
  check('with offset +30, presses at note-25 read as early 55', await rs.page.evaluate(() => document.getElementById('res-timing').textContent.includes('55 ms early') && document.getElementById('res-timing').textContent.includes('offset +30 ms')));
  await rs.page.evaluate(() => { window.__jam.start('warm-embers', 'easy'); window.__jam.step(70000); });
  check('all-miss run: "no hits to measure" and no suggestion', await rs.page.evaluate(() => document.getElementById('res-timing').textContent.includes('no hits') && !document.getElementById('apply-suggest')));
  check('results timing: no console errors', rs.errors.length === 0 && rs.bad.length === 0, rs.errors.join('|'));
  await rs.ctx.close();

  // ---- secret song: full combo on Hard ----
  const sc = await open(browser, { viewport: { width: 1000, height: 700 } }, JSON.stringify({ v: 1, hint: true, offsetMs: 0, fullCombo: true }));
  check('tampered fullCombo with no Hard evidence: secret stays locked', await sc.page.evaluate(() => document.querySelector('.card[data-song=midnight-campfire]').classList.contains('locked') && !('fullCombo' in window.__jam.save)));
  await sc.page.evaluate(() => window.__jam.start('warm-embers', 'hard')); await drive(sc.page, 0);
  check('perfect Hard run: full combo shown and Midnight Campfire unlocked', await sc.page.evaluate(() => window.__jam.mode === 'results' && document.getElementById('res-acc').textContent.includes('Full combo') && document.getElementById('res-unlocked').textContent.includes('Midnight Campfire') && window.__jam.save.fullCombo === true));
  await sc.page.reload(); await sc.page.waitForFunction(() => window.__jam);
  check('secret persists: card shows its name and is playable on Easy', await sc.page.evaluate(() => { const c = document.querySelector('.card[data-song=midnight-campfire]'); return !c.classList.contains('locked') && c.textContent.includes('Midnight Campfire') && !document.querySelector('[data-song=midnight-campfire][data-tier=easy]').disabled && document.querySelector('[data-song=midnight-campfire][data-tier=hard]').disabled; }));
  await sc.page.evaluate(() => { window.__jam.start('midnight-campfire', 'easy'); window.__jam.step(5000); });
  check('Midnight Campfire plays with the shared engine', await sc.page.evaluate(() => window.__jam.mode === 'play' && window.__jam.chart.song === 'midnight-campfire' && window.__jam.chart.count > 30));
  check('secret flow: no console errors', sc.errors.length === 0 && sc.bad.length === 0, sc.errors.join('|'));
  await sc.ctx.close();
  const nm = await open(browser, { viewport: { width: 1000, height: 700 } }, JSON.stringify({ v: 1, hint: true, offsetMs: 0 }));
  await nm.page.evaluate(() => window.__jam.start('warm-embers', 'hard')); await drive(nm.page, 0, 5);
  check('Hard run with one miss does not unlock the secret', await nm.page.evaluate(() => window.__jam.mode === 'results' && !('fullCombo' in window.__jam.save) && window.__jam.save.unlocked.indexOf('midnight-campfire') < 0 && !(document.getElementById('res-unlocked') || { textContent: '' }).textContent.includes('Midnight')));
  await nm.ctx.close();

  // ---- reduced motion: steadier, shorter hit glow ----
  const rg = await open(browser, { viewport: { width: 1000, height: 700 }, reducedMotion: 'reduce' }, JSON.stringify({ v: 1, hint: true, offsetMs: 0 }));
  await startChart(rg.page);
  await rg.page.evaluate(() => { window.__jam.at(1010); window.__jam.press('D'); });
  const g0 = await rg.page.evaluate(() => window.__jam.glows);
  await rg.page.evaluate(() => window.__jam.step(250));
  check('reduced motion: glow shows but is gone within 250 ms, no rings', g0 === 1 && await rg.page.evaluate(() => window.__jam.glows === 0 && window.__jam.rings === 0 && document.getElementById('hud-timing').textContent.length > 0));
  await rg.ctx.close();
  const ng = await open(browser, { viewport: { width: 1000, height: 700 } }, JSON.stringify({ v: 1, hint: true, offsetMs: 0 }));
  await startChart(ng.page);
  await ng.page.evaluate(() => { window.__jam.at(1010); window.__jam.press('D'); window.__jam.step(250); });
  check('normal motion: glow still fading at 250 ms', await ng.page.evaluate(() => window.__jam.glows === 1));
  await ng.ctx.close();

  // ---- phone 390x844: menu, calibration, results ----
  const pc = await open(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  check('phone: menu with calibrate card and offset row has no horizontal scroll', await pc.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth && !!document.getElementById('cal-card') && !!document.getElementById('btn-calibrate')));
  check('phone: calibrate / nudge buttons are 48 px targets', await pc.page.evaluate(() => ['cal-first', 'cal-skip', 'off-minus', 'off-plus', 'btn-calibrate'].every((id) => { const r = document.getElementById(id).getBoundingClientRect(); return r.width >= 48 && r.height >= 48; })));
  await pc.page.tap('#cal-first'); await pc.page.tap('#cal-start');
  check('phone: calibration fits, tap button is big', await pc.page.evaluate(() => { const r = document.getElementById('cal-tap').getBoundingClientRect(); return document.documentElement.scrollWidth <= window.innerWidth && r.height >= 90 && r.width >= 200 && r.right <= window.innerWidth; }));
  await pc.page.evaluate(() => window.__jam.calStep(window.__jam.cal.beats[0]));
  await pc.page.tap('#cal-tap');
  check('phone: touching the tap button registers a tap', await pc.page.evaluate(() => window.__jam.cal.taps === 1));
  await pc.page.evaluate(() => { const b = window.__jam.cal.beats; for (let i = 1; i < 8; i++) { window.__jam.calStep(b[i] + 10 - window.__jam.cal.now); window.__jam.calTap(); } window.__jam.calStep(2000); });
  check('phone: result screen fits and Accept works', await pc.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth && document.getElementById('cal-result').textContent.includes('ms') && !!document.getElementById('cal-accept')));
  await pc.page.tap('#cal-accept');
  check('phone: accepted offset is shown in the menu', await pc.page.evaluate(() => window.__jam.mode === 'menu' && /Timing offset: [+-]?\d+ ms/.test(document.getElementById('offset-val').textContent) && window.__jam.offset !== 0));
  check('phone: no console errors (calibration)', pc.errors.length === 0 && pc.bad.length === 0, pc.errors.concat(pc.bad).join('|'));
  await pc.ctx.close();

  // ---- ?from=hub ----
  const fh = await open(browser, { viewport: { width: 1000, height: 700 } }, undefined, PAGE + '?test=1&from=hub');
  check('from=hub: menu back link goes to the map', await fh.page.evaluate(() => { const a = document.getElementById('menu-back'); return a.getAttribute('href') === '../../hub/index.html' && a.textContent.includes('map'); }));
  check('from=hub: header hub link is emphasised, town link still there', await fh.page.evaluate(() => document.getElementById('back-hub').classList.contains('primary') && document.getElementById('back-town').getAttribute('href') === '../../index.html'));
  await fh.page.evaluate(() => { window.__jam.start('warm-embers', 'easy'); window.__jam.step(70000); });
  check('from=hub: results screen offers Back to the map', await fh.page.evaluate(() => window.__jam.mode === 'results' && document.querySelector('#overlay a.menu-back').getAttribute('href') === '../../hub/index.html'));
  await fh.ctx.close();
  const nf = await open(browser, { viewport: { width: 1000, height: 700 } });
  check('without from=hub: menu back link goes to town; both header links exist', await nf.page.evaluate(() => document.getElementById('menu-back').getAttribute('href') === '../../index.html' && [...document.querySelectorAll('a.back')].map((a) => a.getAttribute('href')).join() === '../../hub/index.html,../../index.html'));
  const bogus = await open(browser, { viewport: { width: 1000, height: 700 } }, undefined, PAGE + '?test=1&from=hub2');
  check('from=hub2 is not treated as the hub', await bogus.page.evaluate(() => document.getElementById('menu-back').getAttribute('href') === '../../index.html'));
  await nf.ctx.close(); await bogus.ctx.close();

  // ---- phone: touch lanes ----
  const ph = await open(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, JSON.stringify({ hint: true }));
  check('phone: menu has no horizontal scroll', await ph.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await startChart(ph.page);
  check('phone: no horizontal scroll while playing', await ph.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  check('phone: four touch pads visible with 48 px targets', await ph.page.evaluate(() => ['D', 'F', 'J', 'K'].every((l) => { const r = document.getElementById('pad-' + l).getBoundingClientRect(); return r.width >= 48 && r.height >= 48 && r.right <= window.innerWidth && r.bottom <= window.innerHeight; })));
  await ph.page.evaluate(() => window.__jam.at(1000));
  await ph.page.tap('#pad-D');
  check('phone: tapping pad D at the note time is Perfect', await ph.page.evaluate(() => window.__jam.lastJudge === 'perfect' && window.__jam.run.counts.perfect === 1));
  await ph.page.evaluate(() => window.__jam.at(2050));
  await ph.page.tap('#pad-F');
  check('phone: tapping pad F at +50 ms is Great', await ph.page.evaluate(() => window.__jam.lastJudge === 'great'));
  await ph.page.evaluate(() => window.__jam.at(3000));
  const box = await ph.page.locator('#game').boundingBox();
  await ph.page.touchscreen.tap(box.x + box.width * 0.625, box.y + box.height * 0.5);
  check('phone: tapping the third lane of the canvas hits J', await ph.page.evaluate(() => window.__jam.lastJudge === 'perfect' && window.__jam.run.counts.perfect === 2));
  await ph.page.evaluate(() => window.__jam.at(4010));
  await ph.page.tap('#pad-K');
  check('phone: pad K hits the K note, combo 4', await ph.page.evaluate(() => window.__jam.run.combo === 4));
  await ph.page.evaluate(() => window.__jam.at(5000));
  await ph.page.dispatchEvent('#pad-D', 'pointerdown', { pointerId: 7, pointerType: 'touch', isPrimary: true });
  check('phone: touch hold on a hold note', await ph.page.evaluate(() => window.__jam.run.holds.join() === 'D'));
  await ph.page.evaluate(() => window.__jam.at(5600));
  await ph.page.dispatchEvent('#pad-D', 'pointerup', { pointerId: 7, pointerType: 'touch', isPrimary: true });
  check('phone: touch release completes the hold', await ph.page.evaluate(() => window.__jam.run.holds.length === 0 && window.__jam.run.combo === 5));
  await ph.page.evaluate(() => window.__jam.step(5000));
  check('phone: results screen is a full sheet with no horizontal scroll', await ph.page.evaluate(() => window.__jam.mode === 'results' && document.documentElement.scrollWidth <= window.innerWidth && document.getElementById('overlay').getBoundingClientRect().width <= window.innerWidth));
  check('phone: A rank for 470/500 with no misses', await ph.page.evaluate(() => document.getElementById('res-rank').textContent === 'A' && window.__jam.run.counts.miss === 0));
  check('phone: back links present', await ph.page.evaluate(() => [...document.querySelectorAll('a.back')].map((a) => a.getAttribute('href')).join() === '../../hub/index.html,../../index.html'));
  check('no console errors (phone)', ph.errors.length === 0 && ph.bad.length === 0, ph.errors.concat(ph.bad).join('|'));
  if (shot) { await startChart(ph.page); await ph.page.evaluate(() => window.__jam.step(900)); await ph.page.screenshot({ path: shot + '/jam-phone.png' }); }
  await ph.ctx.close();

  // ---- real-time mode (no ?test): the page runs on its own clock and exposes no hook ----
  const rt = await (async () => {
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
    const page = await ctx.newPage(); const errors = [];
    page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.addInitScript((k) => { try { localStorage.setItem(k, JSON.stringify({ v: 1, hint: true })); } catch (e) { /* ignore */ } }, KEY);
    await page.goto(PAGE); return { ctx, page, errors };
  })();
  check('real mode exposes no test hook', await rt.page.evaluate(() => typeof window.__jam === 'undefined'));
  await rt.page.click('[data-song=warm-embers][data-tier=easy]');
  await rt.page.waitForTimeout(700);
  check('real mode: song clock advances on its own', await rt.page.evaluate(() => parseFloat(document.getElementById('progress-bar').style.width) > 0 && document.getElementById('overlay').hidden));
  await rt.page.keyboard.press('Escape');
  check('real mode: Esc pauses', await rt.page.evaluate(() => !!document.getElementById('resume')));
  const w1 = await rt.page.evaluate(() => document.getElementById('progress-bar').style.width);
  await rt.page.waitForTimeout(400);
  check('real mode: progress frozen while paused', (await rt.page.evaluate(() => document.getElementById('progress-bar').style.width)) === w1);
  await rt.page.click('#resume');
  await rt.page.waitForTimeout(300);
  check('real mode: progress resumes', parseFloat(await rt.page.evaluate(() => document.getElementById('progress-bar').style.width)) > parseFloat(w1));
  check('real mode: no errors', rt.errors.length === 0, rt.errors.join('|'));
  await rt.ctx.close();

  await browser.close();
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
  process.exitCode = failed ? 1 : 0;
})();
