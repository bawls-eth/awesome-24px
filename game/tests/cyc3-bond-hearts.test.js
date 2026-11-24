// ID-07 Tame bond hearts (cycle 3 S). Node: MMTames.hearts is a view of `bond` (heart n full when bond >= 2n, half heart on an odd bond)
// for bond 1..10 and hostile input; perks are cosmetic flags at 4 / 6 / 10; bondGain caps per tame per session (ride 10/min cap 30, fight
// 5 cap 25, so at most 55 aff = 0.55 bond a session); addAffinity keeps bond monotone. Browser (Isles, blockDb, 0 DB requests): the
// stable rows show 5 hearts with an aria label; riding 60 s adds 10 aff through the one path and 4 minutes add only 30; a fight won with a
// companion adds 5 to it (cap 25 after 6 wins); bond never drops; ?bondx=0 adds nothing.
const T = require('../shared/mm-tames.js');
const { check, done, blockDb } = require('./helpers');

const H = []; for (let b = 1; b <= 10; b++) H.push(T.hearts(b));
check('hearts: bond 1..10 -> full/half exactly (2n full, odd = half), always 5 slots', H.every((h, i) => { const b = i + 1; return h.full === Math.floor(b / 2) && h.half === b % 2 && h.full + h.half + h.empty === 5; }), JSON.stringify(H.map((h) => [h.full, h.half])));
check('hearts: bond 10 is 5 full, bond 1 is one half heart, label "Bond b of 10"', H[9].full === 5 && H[9].half === 0 && H[0].full === 0 && H[0].half === 1 && H[3].label === 'Bond 4 of 10');
check('hearts: hostile bond values clamp to 1..10 (no NaN, no throw)', [NaN, -5, '7x', null, 99, 3.9].map((v) => T.hearts(v)).every((h) => h.bond >= 1 && h.bond <= 10 && h.full + h.half + h.empty === 5));
const P = [3, 4, 5, 6, 9, 10].map((b) => T.perks(b));
check('perks: sway from 4, ribbon from 6, glow at 10 (flags only)', !P[0].sway && P[1].sway && !P[1].ribbon && P[3].ribbon && !P[4].glow && P[5].glow && Object.keys(P[0]).sort().join() === 'glow,ribbon,sway');
const sess = {}; const rides = []; for (let i = 0; i < 5; i++) rides.push(T.bondGain(sess, 't1', 'ride'));
const fights = []; for (let i = 0; i < 7; i++) fights.push(T.bondGain(sess, 't1', 'fight'));
check('bondGain: ride +10 per minute capped at 30 a session; fight +5 capped at 25; per tame (t2 has its own caps)', rides.join() === '10,10,10,0,0' && fights.join() === '5,5,5,5,5,0,0' && T.bondGain(sess, 't2', 'ride') === 10, JSON.stringify({ rides, fights }));
check('bondGain: unknown kind / bad id / bad session give 0', T.bondGain(sess, 't1', 'feed') === 0 && T.bondGain(sess, '', 'ride') === 0 && T.bondGain(null, 't1', 'ride') === 0 && T.bondGain(sess, 't1', '__proto__') === 0);
const sv = { v: 1, n: 1, roster: [{ id: 't1', sp: 'fernraptor', nm: 'A', lv: 1, xp: 0, bond: 3, aff: 160, cos: '', isle: 'jungle', d: '2026-11-01' }], party: [], mount: null };
const T1 = T.clean(sv); const b0 = T1.roster[0].bond; const s2 = {}; let mono = true; let last = b0;
for (let i = 0; i < 20; i++) { const n = T.bondGain(s2, 't1', i % 2 ? 'ride' : 'fight'); if (n) T.addAffinity(T1, 't1', n); if (T1.roster[0].bond < last) mono = false; last = T1.roster[0].bond; }
check('a whole session adds at most 55 aff (0.55 bond) and bond is monotone', T1.roster[0].aff === 215 && mono && T1.roster[0].bond === 3 && b0 === 3, JSON.stringify(T1.roster[0]));
if (process.env.NODE_ONLY) { done(); return; }

const { chromium } = require('playwright');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/isles/index.html';
const PROFILE = { v: 1, heroes: [{ id: 'h1', name: 'Fern', cls: 'druid', level: 7, xp: 10, items: [] }], stash: [], fame: 0, mode: 'classic', hall: [] };
const TM = (id, sp, nm, bond, aff) => ({ id, sp, nm, lv: 4, xp: 0, bond, aff, cos: '', isle: 'jungle', d: '2026-11-01' });
const STABLE = { v: 1, n: 2, roster: [TM('t1', 'tusktop', 'Tuskie', 5, 450), TM('t2', 'fernraptor', 'Bix', 10, 900)], party: ['t2'], mount: 't1' };
const seed = { 'pixeltown-mm-v1': JSON.stringify(PROFILE), 'pixeltown-mm-active-v1': JSON.stringify({ v: 1, heroId: 'h1' }), 'pixeltown-tames-v1': JSON.stringify(STABLE) };
const ev = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__isles, ${JSON.stringify(arg === undefined ? null : arg)})`);

async function open(browser, query) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  const db = await blockDb(ctx);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.addInitScript((s) => { if (sessionStorage.seeded) return; sessionStorage.seeded = '1'; localStorage.clear(); Object.keys(s).forEach((k) => localStorage.setItem(k, s[k])); }, seed);
  await page.goto(PAGE + '?test=1&seed=123&saddles=0' + (query || ''));
  await page.waitForFunction(() => window.__isles && window.__isles.world, null, { timeout: 15000 });
  await ev(page, (I) => { I.pause(true); I.god(true); I.clearCreatures(); const t = I.findTile(null, 13); I.teleport(t.x, t.y); I.step(0, 0, 0.2); return true; });
  return { ctx, page, errors, db };
}
const aff = (page, id) => ev(page, (I, t) => { const s = I.tames(); const e = s.roster.find((x) => x.id === t); return { aff: e.aff, bond: e.bond }; }, id);

(async () => {
  const browser = await chromium.launch();
  const s = await open(browser);
  // hearts in the stable rows
  await s.page.click('#btn-pack'); await s.page.waitForSelector('#tab-party'); await s.page.click('#tab-party');
  await s.page.waitForSelector('#party-list li.stable-row');
  const rows = await s.page.evaluate(() => [...document.querySelectorAll('#party-list li.stable-row')].map((li) => { const h = li.querySelector('.st-hearts'); return { id: li.dataset.tame, label: h && h.getAttribute('aria-label'), full: h ? h.querySelectorAll('.st-heart-full').length : -1, half: h ? h.querySelectorAll('.st-heart-half').length : -1, empty: h ? h.querySelectorAll('.st-heart-empty').length : -1 }; }));
  const r1 = rows.find((r) => r.id === 't1'), r2 = rows.find((r) => r.id === 't2');
  check('stable: bond 5 shows 2 full + 1 half + 2 empty hearts, labelled "Bond 5 of 10"', r1 && r1.full === 2 && r1.half === 1 && r1.empty === 2 && r1.label === 'Bond 5 of 10', JSON.stringify(rows));
  check('stable: bond 10 shows 5 full hearts', r2 && r2.full === 5 && r2.half === 0 && r2.empty === 0, JSON.stringify(r2));
  await ev(s.page, (I) => { I.closePanel && I.closePanel(); return true; });
  // riding: +10 aff per minute, cap 30 a session
  const before = await aff(s.page, 't1');
  const rd = await ev(s.page, (I) => { const ok = I.ride(); return { ok, r: I.riding() }; });
  await ev(s.page, (I) => { I.step(0, 0, 30); I.step(0, 0, 29.5); return true; }); // step() runs at most 30 s per call
  const at59 = await aff(s.page, 't1');
  await ev(s.page, (I) => { I.step(0, 0, 1); return true; });
  const at60 = await aff(s.page, 't1');
  check('riding: nothing before a full minute, +10 aff at 60 s through addAffinity (bond kept)', rd.r && rd.r.id === 't1' && at59.aff === before.aff && at60.aff === before.aff + 10 && at60.bond >= before.bond, JSON.stringify({ rd, before, at59, at60 }));
  await ev(s.page, (I) => { I.step(0, 0, 30); I.step(0, 0, 30); I.step(0, 0, 30); I.step(0, 0, 30); I.step(0, 0, 30); I.step(0, 0, 30); return true; });
  const at4 = await aff(s.page, 't1');
  check('riding 4 minutes adds only 30 aff (session cap)', at4.aff === before.aff + 30, JSON.stringify(at4));
  await ev(s.page, (I) => { I.ride(); return true; });
  // fights won together: +5 to the party companion per creature it helped kill, cap 25
  const f0 = await aff(s.page, 't2');
  const got = await ev(s.page, (I) => {
    const out = []; const sp = I.creatures().length >= 0 ? null : null;
    for (let i = 0; i < 6; i++) { const t = I.findTile(null, 13); const id = I.spawn(I.packSpecies[0], t.x + 2, t.y); out.push(id !== null && I.compHit(id, 1e6)); I.step(0, 0, 0.05); }
    return out;
  });
  const f6 = await aff(s.page, 't2');
  check('6 companion kills add 25 aff to the companion (5 each, cap 25); bond 10 stays 10', got.every(Boolean) && f6.aff === Math.min(1000, f0.aff + 25) && f6.bond === 10, JSON.stringify({ got, f0, f6, sess: await ev(s.page, (I) => I.bondSess()) }));
  // perks are draw-only: render a frame with the bond-10 companion (glow + ribbon) and nothing in the sim changes
  const sim = await ev(s.page, (I) => { const a = JSON.stringify(I.party()); I.render(); I.render(); return a === JSON.stringify(I.party()); });
  check('perks are draw only: rendering the bond-10 companion changes no party state', sim);
  check('no page errors', s.errors.length === 0, s.errors.join(' | '));
  check('0 DB requests', s.db.attempts() === 0);
  await s.ctx.close();
  // ?bondx=0: riding a minute adds nothing
  const o = await open(browser, '&bondx=0');
  const ob = await aff(o.page, 't1');
  await ev(o.page, (I) => { const r = I.ride(); I.step(0, 0, 30); I.step(0, 0, 30); I.step(0, 0, 5); return r; });
  const oa = await aff(o.page, 't1');
  check('?bondx=0: a riding minute adds no aff (and the page says the flag is off)', oa.aff === ob.aff && (await ev(o.page, (I) => I.bondx === false && !!I.riding())), JSON.stringify({ ob, oa }));
  check('0 DB requests (bondx=0)', o.db.attempts() === 0);
  await o.ctx.close();
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
