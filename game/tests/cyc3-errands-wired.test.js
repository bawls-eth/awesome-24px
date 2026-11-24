// ID-12 wiring (cycle 3 S): the Town-to-Realm parcel errand end to end, in one browser context (one shared localStorage).
//   Town: talking to Mocha once only offers (nothing spent); a second talk with 3+ wood packs the parcel (Town save errand {s:1}, wood -3).
//   Realm Nexus: the Vendor takes the parcel (Realm save errand {p:1}); a Shore kill gives nothing, a Midlands kill gives the trophy {d:1}.
//   Town again: Mocha takes the trophy (errand {s:2}), the Realm lantern decor stands by the home plot; a later talk pays nothing again.
//   Also: a forged Realm trophy cannot finish a chain this Town never started, the Town merge never steps back, ?errands=0 is inert.
// OFFLINE ONLY: offlineStub (blockDb + stubbed Firebase SDK) on the Town, blockDb on the Realm, db.attempts() === 0. ADMIN* name, no chat.
// Screenshots: design/beta/img/cyc3-errand-desktop.jpg (1280x720, lantern by the home plot) and cyc3-errand-phone.jpg (390x844, Mocha's line).
// Run: BASE=http://localhost:8440/game/index.html node game/tests/cyc3-errands-wired.test.js
const { chromium } = require('playwright');
const { check, done, offlineStub } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const ORIGIN = BASE.replace(/\/game\/index\.html.*$/, '');
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&offline=1&heropick=0&tutorial=0&seed=12345&qdate=2030-05-01';
const SHOTS = process.env.SHOTS || (__dirname + '/../design/beta/img');
const SK = 'pixeltown-save-v1', RK = 'pixeltown-realm-v1';

async function town(ctx, url) {
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/main.js*', async (route) => {
    try { const resp = await route.fetch(); await route.fulfill({ response: resp, body: (await resp.text()).replace('const game = new Phaser.Game(config);', 'const game = window.__g = new Phaser.Game(config);') }); } catch (e) { /* closed */ }
  });
  await page.goto(url || BASE);
  await page.fill('#name-input', 'ADMINerrand');
  await page.click('.species-tab'); await page.click('.avatar-choice');
  await page.click('button:has-text("Join Town")');
  await page.waitForSelector('#join-offline-btn:not(.hidden)', { timeout: 20000 });
  await page.click('#join-offline-btn');
  await page.waitForFunction(() => window.__g && window.__g.scene.getScene('Town') && window.__g.scene.getScene('Town').localBody && window.__g.scene.getScene('Town').home, null, { timeout: 30000 });
  await page.waitForTimeout(600);
  await page.evaluate(() => { const b = document.getElementById('whats-new-close-btn'); if (b && b.offsetParent) b.click(); });
  return { page, errors };
}
// talk to Mocha the way E does (stand next to her, call talkToVillager); returns her bubble text, the stored errand and wood
const talk = (page) => page.evaluate(() => {
  const s = window.__g.scene.getScene('Town'); const v = VILLAGERS.find((x) => x.id === 'mocha');
  const st = s.villagerState && s.villagerState.mocha; if (st) s.localBody.setPosition(st.x + 30, st.y);
  s.talkToVillager(v);
  const sv = JSON.parse(localStorage.getItem('pixeltown-save-v1') || '{}');
  return { line: s.villagerBubbles.mocha.text, errand: sv.errand || null, wood: (sv.resources || {}).wood, memWood: s.resources.wood, decor: !!s.errandDecor };
});
const realmErrand = (page) => page.evaluate((k) => { const o = JSON.parse(localStorage.getItem(k) || 'null'); return o ? o.errand || null : null; }, RK);

(async () => {
  const browser = await chromium.launch(); const allErr = [];
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const db = await offlineStub(ctx);
  await ctx.addInitScript((sk) => { if (localStorage.getItem('__cyc3seed')) return; localStorage.setItem('__cyc3seed', '1'); localStorage.setItem(sk, JSON.stringify({ name: 'ADMINerrand', species: 'coolcats', frame: 0, resources: { wood: 5 }, lastSeenVersion: 999 })); }, SK);

  // ---- step 1: Town, Mocha packs the parcel ----
  let T = await town(ctx);
  const t1 = await talk(T.page);
  check('1st talk: Mocha offers the parcel run, nothing is spent or saved', /parcel/i.test(t1.line) && /3 wood/.test(t1.line) && t1.errand === null && t1.wood === 5 && t1.memWood === 5, JSON.stringify(t1));
  const t2 = await talk(T.page);
  check('2nd talk: the parcel is packed: Town save errand = {id: parcel1, s: 1}, 3 wood spent (5 -> 2) in memory and storage', t2.errand && t2.errand.id === 'parcel1' && t2.errand.s === 1 && t2.wood === 2 && t2.memWood === 2 && /Realm Nexus/.test(t2.line), JSON.stringify(t2));
  const t3 = await talk(T.page);
  check('3rd talk: still carrying; nothing more spent, no second parcel', t3.errand.s === 1 && t3.wood === 2 && /Vendor/.test(t3.line), JSON.stringify(t3));
  allErr.push(...T.errors); await T.page.close();

  // ---- step 2: Realm Nexus Vendor + a Midlands kill ----
  const R = await ctx.newPage(); const rErr = [];
  R.on('pageerror', (e) => rErr.push(e.message));
  await R.route('**/game/index.html*', (rt) => rt.fulfill({ contentType: 'text/html', body: '<!doctype html>town' }));
  await R.goto(WORLD);
  await R.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 30000 });
  check('Realm: no errand in the Realm save before the Vendor', (await realmErrand(R)) === null);
  const shoreFirst = await R.evaluate(() => window.__mm.world.erKill(2));
  check('Realm: a Midlands kill BEFORE the delivery gives no trophy', shoreFirst === false && (await realmErrand(R)) === null);
  const said = await R.evaluate(() => window.__mm.world.nexus.talk('vendor'));
  const r1 = await realmErrand(R);
  check('Realm: the Vendor takes the parcel (Realm save errand {p:1, d:0}) and names the Midlands trophy', !!r1 && r1.p === 1 && r1.d === 0 && /parcel from Mocha/.test(JSON.stringify(said)) && /Midlands/.test(JSON.stringify(said)), JSON.stringify({ r1, said }));
  const shore = await R.evaluate(() => window.__mm.world.erKill(0));
  check('Realm: a Shore (zone 0) kill gives no trophy', shore === false && (await realmErrand(R)).d === 0);
  const mid = await R.evaluate(() => window.__mm.world.erKill(1));
  const r2 = await realmErrand(R);
  check('Realm: a Midlands (zone 1) kill gives the trophy once (d: 1); a second kill changes nothing', mid === true && r2.d === 1 && (await R.evaluate(() => window.__mm.world.erKill(2))) === false, JSON.stringify(r2));
  const townSv = await R.evaluate((k) => JSON.parse(localStorage.getItem(k)).errand, SK);
  check('Realm never writes the Town save\'s errand (still {s: 1})', townSv && townSv.s === 1, JSON.stringify(townSv));
  allErr.push(...rErr); await R.close();

  // ---- step 3: Town, Mocha takes the trophy ----
  T = await town(ctx);
  const t4 = await talk(T.page);
  check('Town: Mocha takes the trophy: errand {s: 2} and the Realm lantern decor stands by the home plot', t4.errand && t4.errand.s === 2 && t4.decor && /lantern/i.test(t4.line), JSON.stringify(t4));
  const decor = await T.page.evaluate(() => { const s = window.__g.scene.getScene('Town'); const d = s.errandDecor; return d ? { x: d.x, y: d.y, tex: d.texture.key, vis: d.visible, dx: d.x - HOME_POS.x, cozy: s.homeCozy() } : null; });
  check('the decor is the code-drawn realmLantern texture beside the home, cosmetic only (cozy score unchanged: 0)', decor && decor.tex === 'realmLantern' && decor.vis && Math.abs(decor.dx) < 140 && decor.cozy === 0, JSON.stringify(decor));
  const t5 = await talk(T.page);
  check('Town: a later talk is the usual chat; the chain stays done (no second reward, wood unchanged)', t5.errand.s === 2 && !/lantern for your home/.test(t5.line) && t5.wood === 2, JSON.stringify(t5));
  // stale write: a tab that still holds s:1 tries to save it -> the forward-only merge keeps s:2
  const back = await T.page.evaluate(() => { const s = window.__g.scene.getScene('Town'); s.saveErrand({ id: 'parcel1', s: 1 }); return JSON.parse(localStorage.getItem('pixeltown-save-v1')).errand; });
  check('Town merge never steps back (a stale s:1 write keeps s:2)', back && back.s === 2, JSON.stringify(back));
  // desktop screenshot: the lantern by the home plot, with Mocha's thank-you line
  await T.page.evaluate(() => { const s = window.__g.scene.getScene('Town'); s.localBody.setPosition(HOME_POS.x + 40, HOME_POS.y + 60); });
  await T.page.waitForTimeout(1800); // the camera follow lerps
  await T.page.screenshot({ path: SHOTS + '/cyc3-errand-desktop.jpg', quality: 70 });
  allErr.push(...T.errors); await T.page.close();
  await ctx.close();

  // ---- a forged Realm trophy without a Town start cannot finish; ?errands=0 is inert; phone screenshot ----
  const pctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const pdb = await offlineStub(pctx);
  await pctx.addInitScript((a) => { if (localStorage.getItem('__cyc3seed')) return; localStorage.setItem('__cyc3seed', '1'); localStorage.setItem(a[0], JSON.stringify({ name: 'ADMINerrand', species: 'coolcats', frame: 0, resources: { wood: 1 }, lastSeenVersion: 999 })); localStorage.setItem(a[1], JSON.stringify({ v: 1, seed: '12345', errand: { id: 'parcel1', p: 1, d: 1 } })); }, [SK, RK]);
  const P = await town(pctx);
  const f1 = await talk(P.page); const f2 = await talk(P.page);
  check('forged Realm trophy, no Town start: Mocha only offers; with 1 wood nothing is packed and no reward', f2.errand === null && !f2.decor && f2.wood === 1 && /3 wood/.test(f2.line), JSON.stringify({ f1, f2 }));
  await P.page.waitForTimeout(1800);
  await P.page.screenshot({ path: SHOTS + '/cyc3-errand-phone.jpg', quality: 70 });
  allErr.push(...P.errors); await P.page.close();
  const O = await town(pctx, BASE + '?errands=0');
  await O.page.evaluate(() => { const s = window.__g.scene.getScene('Town'); s.resources.wood = 9; });
  const o1 = await talk(O.page); const o2 = await talk(O.page);
  check('?errands=0: Mocha chats as before and nothing is saved', o2.errand === null && !/parcel/i.test(o1.line + o2.line), JSON.stringify({ o1: o1.line, o2: o2.line }));
  allErr.push(...O.errors);
  await pctx.close();

  check('no page errors (Town and Realm)', allErr.length === 0, allErr.join(' | '));
  check('0 DB requests (Firebase blocked)', db.attempts() === 0 && pdb.attempts() === 0, db.attempts() + '/' + pdb.attempts());
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
