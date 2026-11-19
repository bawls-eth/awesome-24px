// Realm 2v2 (host + 3 guests, teams A = host + seat 1, B = seats 2 + 3). Four ADMIN pages over an in-memory relay
// for the fight rules, then a real Firebase 2v2 lobby (presence + realmInvites/realmParties only, cleaned up). Never chats.
const { launch, scene, check, done } = require('./helpers');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DB = 'https://animalcrossing-15728-default-rtdb.firebaseio.com';
// Wait (up to 25 s) until none of OUR records remain: ADMIN players, and invites/parties made by ADMIN bots.
// Other real players' invites are none of the tests' business.
async function adminClean(DB) {
  let last = '';
  for (let i = 0; i < 25; i++) {
    const [pl, ri, rp] = await Promise.all(['players', 'realmInvites', 'realmParties'].map((p) => fetch(`${DB}/${p}.json`).then((r) => r.text()).catch(() => 'null')));
    const ours = /"name":"ADMIN/.test(pl) || /"fromName":"ADMIN/.test(ri) || /"hostName":"ADMIN/.test(rp);
    last = [pl.slice(0, 80), ri.slice(0, 80), rp.slice(0, 80)].join(' / ');
    if (!ours) return { ok: true, last };
    await new Promise((r) => setTimeout(r, 1000));
  }
  return { ok: false, last };
}

const seed = { caveSeed: 0, resources: { stone: 1 }, realm: { level: 9, shards: 100, bestWave: 2, kills: 5, deaths: 1 } };
const start = (role, slot) => `(function(s){const link={onMessage:null,send:(m)=>window.__relaySend(JSON.stringify(m)),close(){}};window.__relayIn=(x,seat)=>{if(link.onMessage)link.onMessage(JSON.parse(x),seat)};s.localBody.setPosition(REALM_GATE_POS.x,REALM_GATE_POS.y+30);s.enterRealm({role:'${role}',link,mode:'2v2',slot:${slot}});})(window.__g.scene.getScene('Town'))`;

(async () => {
  const P = [];
  for (let i = 0; i < 4; i++) P.push(await launch({ width: 900, height: 640 }, seed));
  // relay: guest seat i -> host (with seat); host -> every guest
  await P[0].page.exposeFunction('__relaySend', (s) => { for (let i = 1; i < 4; i++) P[i].page.evaluate((m) => window.__relayIn && window.__relayIn(m), s).catch(() => {}); });
  for (let i = 1; i < 4; i++) await P[i].page.exposeFunction('__relaySend', (s) => { P[0].page.evaluate(([m, seat]) => window.__relayIn && window.__relayIn(m, seat), [s, i]).catch(() => {}); });
  await P[0].page.evaluate(start('host', 0));
  for (let i = 1; i < 4; i++) await P[i].page.evaluate(start('guest', i));
  await sleep(2500);

  const info = (p) => scene(p, (s) => { const r = s.realm; const t = r.team; return { mode: t.mode, slot: t.slot, ph: t.duel.ph, rd: t.duel.rd, s: t.duel.s.join('-'), hp: Math.round(r.player.hp), max: r.stats.maxHp, label: document.getElementById('realm-wave').textContent, badge: document.getElementById('realm-partner-name').textContent, others: t.role === 'host' ? t.drawList().length : t.others.length, x: Math.round(r.player.x), y: Math.round(r.player.y), enemies: r.enemies.filter((e) => e.active).length }; });
  const all = await Promise.all(P.map((x) => info(x.page)));
  check('2v2: all four enter 2v2 mode with identical stats (100 HP) and no enemies', all.every((a) => a.mode === '2v2' && a.max === 100 && a.enemies === 0), JSON.stringify(all));
  check('2v2: every fighter sees the three others (drawn with names)', all.every((a) => a.others === 3), JSON.stringify(all.map((a) => a.others)));
  check('2v2: teams start in opposite corners (A left, B right) and the HUD shows the score and round', all[0].x < 300 && all[1].x < 300 && all[2].x > 500 && all[3].x > 500 && all.every((a) => /R1/.test(a.label)), JSON.stringify(all.map((a) => [a.x, a.y, a.label])));
  check('2v2: the corner badge follows your teammate (a 🤝 name), not an opponent', all.every((a) => /^🤝/.test(a.badge)), JSON.stringify(all.map((a) => a.badge)));

  for (let i = 0; i < 40 && (await info(P[0].page)).ph !== 1; i++) await sleep(250);
  const live = await info(P[0].page);
  check('2v2: after the protected countdown the round is live', live.ph === 1, JSON.stringify(live));

  // friendly fire is off: a host bolt through teammate seat 1 does nothing, but hits seat 2 (other team)
  const ff = await scene(P[0].page, (s) => {
    const r = s.realm; const t = r.team; const g1 = t.guests[1]; const g2 = t.guests[2];
    r.pBullets.forEach((b) => { b.active = false; });
    g1.x = 300; g1.y = 300; g1.iframes = 0; g2.x = 300; g2.y = 400; g2.iframes = 0; r.player.x = 100; r.player.y = 300;
    r.firePlayerBulletFrom(100, 300, 0, 1, 0);
    for (let i = 0; i < 60; i++) r._update(1 / 60);
    const o = { mate: g1.hp, foeBefore: g2.hp };
    r.pBullets.forEach((b) => { b.active = false; });
    g1.x = 300; g1.y = 200; g2.x = 300; g2.y = 300; g2.iframes = 0; r.player.x = 100; r.player.y = 300;
    r.firePlayerBulletFrom(100, 300, 0, 1, 0);
    for (let i = 0; i < 60; i++) r._update(1 / 60);
    o.foe = g2.hp;
    return o;
  });
  check('2v2: no friendly fire (a bolt passes your teammate) and an opponent takes exactly 8', ff.mate === 100 && ff.foe === 92, JSON.stringify(ff));

  // a side must be wiped for a round: one opponent down is not enough
  const one = await scene(P[0].page, (s) => { const t = s.realm.team; const g2 = t.guests[2]; g2.hp = 8; g2.iframes = 0; g2.x = 300; g2.y = 300; s.realm.pBullets.forEach((b) => { b.active = false; }); s.realm.player.x = 100; s.realm.player.y = 300; s.realm.firePlayerBulletFrom(100, 300, 0, 1, 0); for (let i = 0; i < 60; i++) s.realm._update(1 / 60); return { down: g2.down, ph: t.duel.ph, s: t.duel.s.join('-') }; });
  check('2v2: knocking out one opponent does not end the round', one.down === true && one.ph === 1 && one.s === '0-0', JSON.stringify(one));
  const two = await scene(P[0].page, (s) => { const t = s.realm.team; const g3 = t.guests[3]; g3.hp = 8; g3.iframes = 0; g3.x = 300; g3.y = 300; s.realm.pBullets.forEach((b) => { b.active = false; }); s.realm.player.x = 100; s.realm.player.y = 300; s.realm.firePlayerBulletFrom(100, 300, 0, 1, 0); for (let i = 0; i < 60; i++) s.realm._update(1 / 60); return { ph: t.duel.ph, s: t.duel.s.join('-') }; });
  await sleep(700);
  const sc = await Promise.all(P.map((x) => info(x.page)));
  check('2v2: when the whole other side is down the round goes to Team A, on all four screens', two.ph === 2 && two.s === '1-0' && sc.every((a) => a.s === '1-0'), JSON.stringify([two, sc.map((a) => a.s)]));
  check('2v2: the score label is from each fighter\'s own side (Team B sees 0–1)', /1–0/.test(sc[0].label) && /1–0/.test(sc[1].label) && /0–1/.test(sc[2].label) && /0–1/.test(sc[3].label), JSON.stringify(sc.map((a) => a.label)));

  // next round: everybody back up at full HP
  for (let i = 0; i < 40 && (await info(P[0].page)).rd !== 2; i++) await sleep(250);
  await sleep(500);
  const r2 = await Promise.all(P.map((x) => info(x.page)));
  check('2v2: round 2 resets every fighter to full HP', r2.every((a) => a.rd === 2 && a.hp === 100), JSON.stringify(r2.map((a) => [a.rd, a.hp])));

  // hostile seat: inflated stats and teleporting are ignored
  const bad = await scene(P[0].page, (s) => { const t = s.realm.team; t.onMessage({ k: 'in', x: 1e9, y: 5, f: 1, mh: 1e9, dm: 1e9, rt: 1e9, ab: [{ q: 1, k: 'nova' }] }, 3); t.onMessage({ k: 'in', x: 5, y: 5 }, 9); const g = t.guests[3]; return [g.maxHp, g.dmg, g.rate]; });
  check('2v2: a hostile seat cannot set its own HP, damage or fire rate (and unknown seats are ignored)', bad[0] === 100 && bad[1] === 1 && bad[2] === 6, JSON.stringify(bad));

  // a leaving guest: their side loses that fighter; the others fight on
  await P[3].page.evaluate(() => document.getElementById('realm-leave-btn').click());
  await sleep(800);
  const lf = await scene(P[0].page, (s) => { const t = s.realm.team; return { gone: t.guests[3].gone, down: t.guests[3].down, ph: t.duel.ph }; });
  check('2v2: when a guest leaves, that seat is out but the match goes on', lf.gone === true && lf.down === true && lf.ph !== 3, JSON.stringify(lf));
  for (const i of [2, 1]) await P[i].page.evaluate(() => { const b = document.getElementById('realm-leave-btn'); if (b) b.click(); });
  await sleep(500);
  await P[0].page.evaluate(() => { const b = document.getElementById('realm-leave-btn'); if (b) b.click(); });
  await sleep(800);

  // an early joiner waits for the lobby to fill: no 8 s timeout before the first snapshot, the usual timeout after it
  const wait = await scene(P[0].page, (s) => {
    s.enterRealm({ role: 'guest', mode: '2v2', slot: 2, link: { onMessage: null, send() {}, close() {} } });
    const t = s.realm.team; const o = {};
    for (let i = 0; i < 200; i++) s.realm._update(0.1); // 20 s with no snapshot
    o.waiting = s.inRealm;
    t.snaps = 1; t.silent = 0; for (let i = 0; i < 100; i++) s.realm._update(0.1); // 10 s of silence after the host was heard
    o.after = s.inRealm;
    if (s.inRealm) s.exitRealm();
    return o;
  });
  check('2v2: a guest who joined early keeps waiting for the host to start, but still times out once the host has gone quiet', wait.waiting === true && wait.after === false, JSON.stringify(wait));
  const side = await scene(P[0].page, (s) => {
    s.enterRealm({ role: 'host', mode: '2v2', link: { onMessage: null, send() {}, close() {} } });
    const t = s.realm.team; t.guests.forEach((g, i) => { if (g) { g.ready = true; g.name = 'G' + i; } });
    t.partnerLeft(2); const mid = t.duel.ph; t.partnerLeft(3);
    const o = { mid, ph: t.duel.ph, s: t.duel.s.join('-') };
    s.exitRealm();
    return o;
  });
  check('2v2: if the whole opposing side leaves the remaining side wins the match', side.mid !== 3 && side.ph === 3 && side.s === '2-0', JSON.stringify(side));
  // ---- real Firebase lobby: host invites 3 others, all accept, 2v2 starts ----
  const ids = await Promise.all([1, 2, 3].map((i) => scene(P[i].page, (s) => s.net.id)));
  await sleep(2500);
  await scene(P[0].page, (s) => { s.localBody.setPosition(REALM_GATE_POS.x, REALM_GATE_POS.y + 30); s.interact(); });
  const rows = await P[0].page.evaluate(() => document.querySelectorAll('.realm-2v2-btn').length);
  check('2v2 lobby: the gate menu has a 2v2 button for every other player in town', rows >= 3, String(rows));
  for (const id of ids) { await P[0].page.evaluate((pid) => { const b = document.querySelector(`.realm-2v2-btn[data-pid="${pid}"]`); if (b) b.click(); }, id); await sleep(1800); }
  const status = await P[0].page.evaluate(() => document.getElementById('realm-menu-status').textContent);
  check('2v2 lobby: the host sees the lobby fill up', /2v2 lobby: 0\/3/.test(status), status);
  await sleep(1500);
  const toasts = await Promise.all([1, 2, 3].map((i) => P[i].page.evaluate(() => document.getElementById('realm-invite-text').textContent)));
  check('2v2 lobby: each of the three gets a 2v2 invitation toast', toasts.every((t) => /2v2/.test(t)), JSON.stringify(toasts));
  for (let i = 1; i < 4; i++) { await P[i].page.click('#realm-invite-accept'); await sleep(1500); }
  await sleep(4500);
  const fin = await Promise.all(P.map((x) => scene(x.page, (s) => s.inRealm && s.realm.team ? s.realm.team.mode + ':' + s.realm.team.role + ':' + s.realm.team.slot : 'none')));
  const seats = fin.slice(1).map((f) => f.split(':')[2]).sort().join('');
  check('2v2 lobby: when the third player joins the match starts, with seats 1, 2 and 3 filled over Firebase', fin[0] === '2v2:host:1' && fin.slice(1).every((f) => /^2v2:guest:/.test(f)) && seats === '123', JSON.stringify(fin));
  await sleep(1500);
  const live2 = await Promise.all(P.map((x) => info(x.page).catch(() => null)));
  check('2v2 lobby: all four see the same round state over Firebase', live2.every((a) => a && a.others === 3 && a.rd === 1), JSON.stringify(live2.map((a) => a && [a.others, a.rd, a.ph])));
  for (let i = 3; i >= 1; i--) { await P[i].page.evaluate(() => { const b = document.getElementById('realm-leave-btn'); if (b) b.click(); }); await sleep(600); }
  await P[0].page.evaluate(() => { const b = document.getElementById('realm-leave-btn'); if (b) b.click(); });
  await sleep(1200);

  const errs = P.flatMap((x) => x.errors).filter((e) => !/favicon|net::ERR/.test(e));
  check('no console errors', errs.length === 0, errs.join(' | '));
  for (const x of P) await x.browser.close();
  await sleep(9000);
  const cl = await adminClean(DB);
  check('cleanup: no ADMIN players, invites or parties of ours remain', cl.ok, cl.last);
  done();
})();
