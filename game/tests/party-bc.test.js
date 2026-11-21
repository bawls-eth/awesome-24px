// CP1: two pages on the same origin exchange a validated MMWorldParty message through the real BroadcastChannel; hostile data is rejected.
// Run: BASE=http://localhost:8651/game/index.html NODE_PATH=$(npm root -g) node game/tests/party-bc.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const URL_ = ORIGIN + '/game/shared/_party-bc-fixture.html'; // served by a route, never a file on disk
const HTML = '<!doctype html><title>bc</title><script src="/game/shared/mm-party.js"></script><script src="/game/shared/mm-world-party.js"></script><script src="/game/shared/mm-party-bc.js"></script>';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  await ctx.route('**/_party-bc-fixture.html*', (r) => r.fulfill({ contentType: 'text/html', body: HTML }));
  const errors = [];
  const open = async () => {
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    p.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    await p.goto(URL_);
    await p.evaluate(() => { window.got = []; window.t = MMPartyBC.open('pb-test-1'); window.t.onMessage((m) => window.got.push(m)); });
    return p;
  };
  const A = await open(), B = await open();
  check('real BroadcastChannel opens a transport on both pages', await A.evaluate(() => window.t.ok && window.t.name === 'mm-party-pb-test-1') && await B.evaluate(() => window.t.ok));

  const sent = await A.evaluate(() => window.t.send(MMWorldParty.pos(1, 12.34, 40, 3, 1)));
  await B.waitForFunction(() => window.got.length >= 1, null, { timeout: 5000 });
  const m = await B.evaluate(() => window.got[0]);
  check('page B receives the validated pos message from page A', sent === true && m.t === 'pos' && m.s === 1 && m.x === 12.34 && m.y === 40 && m.f === 3);
  check('page A does not hear its own message', (await A.evaluate(() => window.got.length)) === 0);

  // hostile: the sender refuses, and a raw hostile post on the same channel is dropped by the receiver
  const refused = await A.evaluate(() => [null, 'x', { t: 'pos', s: 9, x: 1, y: 1 }, { t: 'hit', s: 0, e: 'a b', d: 5 }].map((v) => window.t.send(v)));
  await A.evaluate(() => { const raw = new BroadcastChannel('mm-party-pb-test-1'); [{ t: 'pos', s: 99, x: 1, y: 1 }, 'junk', 42, null, { t: 'bag', s: 0, id: 'b3-1', item: 'x', x: 1, y: 1 }].forEach((d) => raw.postMessage(d)); raw.postMessage({ t: 'hit', s: 2, e: 'e1', d: 7, n: 2 }); setTimeout(() => raw.close(), 300); });
  await B.waitForFunction(() => window.got.length >= 2, null, { timeout: 5000 });
  await B.waitForTimeout(400);
  const got = await B.evaluate(() => window.got);
  check('hostile sends are refused by the sender', refused.every((r) => r === false));
  check('hostile raw messages are rejected; only the valid hit arrives', got.length === 2 && got[1].t === 'hit' && got[1].e === 'e1' && got[1].d === 7, JSON.stringify(got));

  // a different seed is a different channel
  const C = await open();
  await C.evaluate(() => { window.t.close(); window.got = []; window.t = MMPartyBC.open('pb-test-2'); window.t.onMessage((m) => window.got.push(m)); });
  await A.evaluate(() => window.t.send(MMWorldParty.pos(0, 1, 1, 0, 2)));
  await C.waitForTimeout(400);
  check('a page on another seed hears nothing', (await C.evaluate(() => window.got.length)) === 0);

  // close stops delivery
  await B.evaluate(() => window.t.close());
  const nb = await B.evaluate(() => window.got.length);
  await A.evaluate(() => window.t.send(MMWorldParty.pos(0, 2, 2, 0, 3)));
  await B.waitForTimeout(300);
  check('a closed transport receives nothing more', (await B.evaluate(() => window.got.length)) === nb);

  // no BroadcastChannel: graceful no-op
  const D = await ctx.newPage();
  D.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await D.addInitScript(() => { delete window.BroadcastChannel; });
  await D.goto(URL_);
  const inert = await D.evaluate(() => { const t = MMPartyBC.open('pb-test-1'); return [t.ok, t.send(MMWorldParty.pos(0, 1, 1)), (t.close(), true)]; });
  check('without BroadcastChannel the transport is an inert no-op', inert[0] === false && inert[1] === false && inert[2] === true);

  check('no console errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
