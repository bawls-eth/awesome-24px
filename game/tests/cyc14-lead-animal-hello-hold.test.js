// cycle 14 L (1): the ID-59 animal hello wrote its additive `animalHello` key the moment an animal came within 160 px, at any time,
// with no input from the player. A test (or a player) standing next to an animal and comparing pixeltown-save-v1 byte for byte saw a
// write that was not theirs (two tests carry a `noHello` carve-out for it). Now the hello is held in memory (heart and line as
// before) and written only when the PLAYER walks (a real walk input in Town.updateLocalMovement -> flushAnimalHello).
// Proven here on the real Town page:
//   [1] next to a fox not greeted yet: heart + log as before, and for 1.5 s the stored save stays BYTE-IDENTICAL (no carve-out);
//   [2] pressing E / tapping nothing else is needed: one real arrow-key step writes the fox bit; every other byte-level field of
//       the seed is unchanged, unknown mask words kept;
//   [3] a hello that is never followed by a step is not kept: after a reload the fox says hello again, and the save is still the seed;
//   [4] storage refusing the write: the step leaves the hello unsaved (no page error); once storage works a later step saves it;
//   [5] the merged write keeps a bit another tab stored in the meantime.
// OFFLINE: helpers.offlineStub, literal db.attempts() === 0. Never chats, never writes Firebase.
// Run: BASE=http://localhost:9101/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc14-lead-animal-hello-hold.test.js
const { chromium } = require('playwright');
const { check, done, offlineStub, exposeGame, joinOffline } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const SHOTS = process.env.SHOTS || '';
const VERSION = 'v34-aquarium';
const SK = 'pixeltown-save-v1';
// every fauna bit set except fox (0) and deer (1); word 2 is an "unknown" word that must be kept
const W0 = (2 ** 30 - 1) - 3, W1 = 2 ** 27 - 1, W2 = 5;
const OLD = { name: 'ADMINhold', species: 'cat', frame: 0, lastSeenVersion: VERSION, animalHello: [W0, W1, W2], futureKey: { keep: 1 }, resources: { wood: 3 } };
const raw = (page) => page.evaluate((k) => localStorage.getItem(k), SK);
const strip = (r) => { const o = JSON.parse(r); delete o.animalHello; return JSON.stringify(o); };
const step = async (page, key = 'ArrowRight', ms = 150) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); await page.waitForTimeout(100); };
const nearFox = (page) => page.evaluate(async () => {
  const s = window.__g.scene.getScene('Town');
  const spec = s.ffSpecimens.find((x) => x.id === 'fox' && !x.pond && !x.ocean);
  s.tweens.killTweensOf(spec.sprite);
  s.localBody.setPosition(spec.sprite.x + 60, spec.sprite.y);
  await new Promise((r) => setTimeout(r, 300));
  s.refreshFloraFaunaNear();
  for (let t = 0; t < 40 && (s.animalHelloLog || []).indexOf('fox') < 0; t++) await new Promise((r) => setTimeout(r, 100));
  return { log: (s.animalHelloLog || []).slice(), hearts: (s.animalHelloHearts || []).length, unsaved: s._animalHelloUnsaved === true };
});
async function open(ctx) {
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await exposeGame(page);
  await page.goto(BASE);
  await joinOffline(page, 'ADMINhold');
  await page.waitForFunction(() => { const t = document.getElementById('achievement-toast'); return !t || t.classList.contains('hidden'); }, null, { timeout: 15000 }).catch(() => null);
  return { page, errors };
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const db = await offlineStub(ctx);
  await ctx.addInitScript(([k, o]) => {
    if (!localStorage.getItem('__cyc14hold')) { localStorage.setItem(k, JSON.stringify(o)); localStorage.setItem('__cyc14hold', '1'); localStorage.setItem('pixeltown-gate-pointer-v1', JSON.stringify({ v: 1, dismissed: true, reached: false })); }
  }, [SK, OLD]);

  // ---------- [3] first: a hello with no step after it is not kept ----------
  {
    const { page, errors } = await open(ctx);
    const before = await raw(page);
    const g = await nearFox(page);
    check('[3] setup: the fox says hello (log + heart) with no input from the player', g.log.join() === 'fox' && g.hearts === 1, JSON.stringify(g));
    await page.waitForTimeout(600);
    check('[3] no input: the stored save is byte-identical', (await raw(page)) === before);
    check('[3] no page errors', errors.length === 0, errors.join(' | '));
    await page.close();
  }
  const { page, errors } = await open(ctx);
  const before = await raw(page);
  check('[3] after a reload the save is still the seed mask (the hello with no step after it was not kept)', JSON.stringify(JSON.parse(before).animalHello) === JSON.stringify([W0, W1, W2]), before.slice(0, 200));

  // ---------- [1] hello shown, nothing written ----------
  const g = await nearFox(page);
  check('[1] next to the fox again: it says hello again (heart + log), marked unsaved', g.log.join() === 'fox' && g.hearts === 1 && g.unsaved, JSON.stringify(g));
  const samples = [];
  for (let i = 0; i < 6; i++) { samples.push((await raw(page)) === before); await page.waitForTimeout(250); }
  check('[1] for 1.5 s after the hello the stored save is BYTE-IDENTICAL (no carve-out; was: animalHello written at once)', samples.every(Boolean), JSON.stringify(samples));
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/cyc14-lead-hello-held-1280x720.jpg`, type: 'jpeg', quality: 75 });
  // E is not a walk step: it must not write the hello either (the Isles sign / restore tests press it next to animals)
  await page.evaluate(() => { const s = window.__g.scene.getScene('Town'); s.flushAnimalHelloCalls = 0; const f = s.flushAnimalHello; s.flushAnimalHello = function () { s.flushAnimalHelloCalls++; return f.apply(this, arguments); }; });
  await page.waitForTimeout(400);
  check('[1] still nothing written and no flush attempted while the player stands', (await raw(page)) === before && (await page.evaluate(() => window.__g.scene.getScene('Town').flushAnimalHelloCalls)) === 0);

  // ---------- [4] storage refuses: the step leaves it unsaved, no error ----------
  await page.evaluate((k) => { window.__si = Storage.prototype.setItem; Storage.prototype.setItem = function (key) { if (key === k) throw new DOMException('full', 'QuotaExceededError'); return window.__si.apply(this, arguments); }; }, SK);
  await step(page);
  const refused = await page.evaluate(() => { const s = window.__g.scene.getScene('Town'); return { unsaved: s._animalHelloUnsaved, calls: s.flushAnimalHelloCalls }; });
  check('[4] storage refuses: a walk step tries once, the hello stays unsaved, the save is unchanged', refused.unsaved === true && refused.calls >= 1 && (await raw(page)) === before, JSON.stringify(refused));
  await page.evaluate(() => { Storage.prototype.setItem = window.__si; });

  // ---------- [5] another tab stores a bit in the meantime ----------
  await page.evaluate(([k]) => { const o = JSON.parse(localStorage.getItem(k)); o.animalHello = [o.animalHello[0] + 2, o.animalHello[1], o.animalHello[2]]; o.otherTab = 7; localStorage.setItem(k, JSON.stringify(o)); }, [SK]);
  const mid = await raw(page);

  // ---------- [2] one real walk step writes it ----------
  await page.waitForTimeout(2100); // the retry after a refused write waits 2 s
  await step(page);
  const after = await raw(page);
  const o = JSON.parse(after);
  check('[2] one real arrow-key step writes the fox bit (and [4]: the write lands once storage works again)', Array.isArray(o.animalHello) && (o.animalHello[0] & 1) === 1, JSON.stringify(o.animalHello));
  check('[5] the merged write keeps the deer bit another tab stored meanwhile, and the unknown word', o.animalHello[0] === W0 + 3 && o.animalHello[1] === W1 && o.animalHello[2] === W2 && o.otherTab === 7, JSON.stringify(o.animalHello));
  check('[2] every other stored field is byte-identical (only animalHello changed)', strip(after) === strip(mid), strip(after).slice(0, 200));
  check('[2] the hello is no longer marked unsaved', (await page.evaluate(() => window.__g.scene.getScene('Town')._animalHelloUnsaved)) === false);
  const again = await raw(page);
  await step(page, 'ArrowLeft');
  check('[2] a further step writes nothing more', (await raw(page)) === again);

  check('zero page errors', errors.length === 0, errors.join(' | '));
  check('no database traffic (literal 0)', db.attempts() === 0, String(db.attempts()));
  await ctx.close(); await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
