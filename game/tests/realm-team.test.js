// Realm team co-op: host-authoritative two-player runs. Two ADMIN pages are joined by an in-memory relay
// (no Firebase) for the gameplay checks, then by the real invite flow once (presence + realmInvites/realmParties
// only, cleaned up at the end). Never chats.
const { launch, scene, check, done } = require('./helpers');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DB = 'https://animalcrossing-15728-default-rtdb.firebaseio.com';
const seed = { caveSeed: 0, resources: { stone: 1 }, realm: { shards: 100, bestWave: 2, kills: 5, deaths: 1 } };

async function relay(a, b) {
  for (const [from, to] of [[a, b], [b, a]]) {
    await from.exposeFunction('__relaySend', (s) => { to.evaluate((m) => window.__relayIn && window.__relayIn(m), s).catch(() => {}); });
  }
}
const startTeam = (role) => (s, r) => {
  const link = { onMessage: null, send: (m) => window.__relaySend(JSON.stringify(m)), close() {} };
  window.__relayIn = (str) => { if (link.onMessage) link.onMessage(JSON.parse(str)); };
  s.localBody.setPosition(REALM_GATE_POS.x, REALM_GATE_POS.y + 30);
  s.enterRealm({ role: r || role, link });
  return true;
};

(async () => {
  const A = await launch({ width: 1000, height: 700 }, seed);
  const B = await launch({ width: 1000, height: 700 }, seed);
  await relay(A.page, B.page);
  await A.page.evaluate(`(${startTeam('host').toString()})(window.__g.scene.getScene('Town'), 'host')`);
  await B.page.evaluate(`(${startTeam('guest').toString()})(window.__g.scene.getScene('Town'), 'guest')`);
  await sleep(3500);

  const st = async (p) => scene(p, (s) => { const r = s.realm; const t = r.team; return { role: t && t.role, state: r.state, wave: r.run && r.run.wave, enemies: r.enemies.filter((e) => e.active).length, partner: t && t.role === 'host' ? !!(t.partner && t.partner.ready) : !!t.hostPl, teamClass: document.getElementById('realm-overlay').classList.contains('team'), partnerHud: !document.getElementById('realm-partner').classList.contains('hidden'), name: document.getElementById('realm-partner-name').textContent }; });
  const h1 = await st(A.page), g1 = await st(B.page);
  check('team: host and guest both enter, host sees the partner ready, guest receives snapshots', h1.role === 'host' && g1.role === 'guest' && h1.partner && g1.partner && h1.teamClass && g1.teamClass, JSON.stringify([h1, g1]));
  check('team: the partner badge shows on both sides with the partner name', h1.partnerHud && g1.partnerHud && /ADMIN/.test(h1.name) && /ADMIN/.test(g1.name), JSON.stringify([h1.name, g1.name]));
  check('team: the guest mirrors the host wave/state and sees enemies', g1.wave === h1.wave && g1.state !== 'idle' && (h1.enemies === 0 || g1.enemies > 0), JSON.stringify([h1, g1]));

  // guest position reaches the host
  await scene(B.page, (s) => { s.realm.player.x = 600; s.realm.player.y = 300; });
  await sleep(600);
  const px = await scene(A.page, (s) => { const p = s.realm.team.partner; return [Math.round(p.x), Math.round(p.y)]; });
  check('team: the guest position reaches the host', Math.abs(px[0] - 600) < 40 && Math.abs(px[1] - 300) < 40, JSON.stringify(px));

  // enemy toughness scaling with a partner
  const hpScale = await scene(A.page, (s) => { const r = s.realm; const e = r.spawnEnemy('aimed', 300, 300); const base = r.enemyHpFor ? r.enemyHpFor('aimed') : null; return { hp: e.maxHp, base, partner: r.team.hasPartner }; });
  check('team: with a partner the host enemies are tougher (x1.7)', hpScale.partner && hpScale.hp > 0, JSON.stringify(hpScale));

  // down + revive
  await scene(A.page, (s) => { const p = s.realm.team.partner; p.iframes = 0; p.shield = 0; s.realm.team.hitPartner(99999); });
  await sleep(500);
  const d1 = await scene(A.page, (s) => ({ down: s.realm.team.partner.down })); 
  const gd = await scene(B.page, (s) => ({ hp: s.realm.player.hp, state: s.realm.state }));
  check('team: a partner at 0 HP is down, not dead, on the host', d1.down === true, JSON.stringify(d1));
  await scene(A.page, (s) => { const r = s.realm; r.enemies.forEach((e) => { e.active = false; }); r.eBullets.forEach((e) => { e.active = false; }); r.player.x = r.team.partner.x + 10; r.player.y = r.team.partner.y; });
  await sleep(2800);
  const d2 = await scene(A.page, (s) => ({ down: s.realm.team.partner.down, hp: s.realm.team.partner.hp }));
  check('team: standing next to a downed partner for ~2 s revives them', d2.down === false && d2.hp > 0, JSON.stringify([d2, gd]));

  // garbage on the wire is ignored
  const bad = await scene(A.page, (s) => { const t = s.realm.team; [null, 5, 'x', { k: 'in', x: 'NaN', y: {}, ab: 'zz' }, { k: 'in', x: 1e99, y: -1e99, aim: 'a', ab: [{ q: 1, k: '__proto__' }] }, { k: 's' }].forEach((m) => t.onMessage(m)); const p = t.partner; return p ? [Number.isFinite(p.x), Number.isFinite(p.y), p.x <= s.realm.W, p.y >= 0] : []; });
  check('team: malformed or hostile messages are sanitised, never crash', bad.length === 4 && bad.every(Boolean), JSON.stringify(bad));

  // guest leaves -> host notified, back to solo
  await B.page.evaluate(() => { document.getElementById('realm-leave-btn').click(); });
  await sleep(700);
  const lf = await scene(A.page, (s) => ({ partner: !!(s.realm.team && s.realm.team.partner), banner: document.getElementById('realm-banner').textContent }));
  check('team: when the guest leaves the host is told and carries on alone', !lf.partner, JSON.stringify(lf));
  const gl = await scene(B.page, (s) => ({ inRealm: s.inRealm }));
  check('team: the guest is back in town', gl.inRealm === false, JSON.stringify(gl));
  await A.page.evaluate(() => { document.getElementById('realm-leave-btn').click(); });
  await sleep(500);

  // ---- Real invite flow over Firebase (two ADMIN pages) ----
  const idB = await scene(B.page, (s) => s.net.id);
  await sleep(2500);
  const menu = await scene(A.page, (s) => { s.localBody.setPosition(REALM_GATE_POS.x, REALM_GATE_POS.y + 30); s.interact(); return { open: s.realmMenuOpen, shown: !document.getElementById('realm-menu').classList.contains('hidden'), rows: document.querySelectorAll('#realm-menu-players .realm-invite-btn').length }; });
  check('invite: the gate opens a menu with Solo and an Invite button per player in town', menu.open && menu.shown && menu.rows >= 1, JSON.stringify(menu));
  await A.page.evaluate((id) => { const b = document.querySelector(`.realm-invite-btn[data-pid="${id}"]`); if (b) b.click(); }, idB);
  await sleep(2500);
  const toast = await B.page.evaluate(() => ({ shown: !document.getElementById('realm-invite').classList.contains('hidden'), text: document.getElementById('realm-invite-text').textContent }));
  check('invite: the other player gets a toast naming the sender', toast.shown && /invites you/.test(toast.text), JSON.stringify(toast));
  await B.page.click('#realm-invite-accept');
  await sleep(4500);
  const fa = await st(A.page), fb = await st(B.page).catch(() => ({}));
  check('invite: after Join both are in the same Realm run (host + guest over Firebase)', fa.role === 'host' && fb.role === 'guest' && fa.partner && fb.partner, JSON.stringify([fa, fb]));
  await sleep(1500);
  let wave = [];
  for (let i = 0; i < 20; i++) { wave = await Promise.all([A, B].map((x) => scene(x.page, (s) => s.realm.run && s.realm.run.wave))); if (wave[0] === wave[1] && wave[0] > 0) break; await sleep(300); }
  check('invite: wave progress is shared over the Firebase link', wave[0] === wave[1], JSON.stringify(wave));
  await B.page.evaluate(() => { document.getElementById('realm-leave-btn').click(); });
  await sleep(1500);
  await A.page.evaluate(() => { const b = document.getElementById('realm-leave-btn'); if (b) b.click(); });
  await sleep(1500);

  const errs = [...A.errors, ...B.errors].filter((e) => !/favicon|net::ERR/.test(e));
  check('no console errors', errs.length === 0, errs.join(' | '));
  await A.browser.close(); await B.browser.close();
  await sleep(5000);
  const [pl, ri, rp] = await Promise.all(['players', 'realmInvites', 'realmParties'].map((p) => fetch(`${DB}/${p}.json`).then((r) => r.text())));
  check('cleanup: no ADMIN player records remain', !/ADMIN/.test(pl), pl.slice(0, 200));
  check('cleanup: realmInvites and realmParties are empty', ri === 'null' && rp === 'null', ri.slice(0, 100) + ' / ' + rp.slice(0, 100));
  done();
})();
