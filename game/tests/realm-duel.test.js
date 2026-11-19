// Realm duel (1v1, best of 3 rounds, identical stats). Two ADMIN pages over an in-memory relay; one Firebase
// "Duel" invite check at the end (presence + realmInvites/realmParties only, cleaned up). Never chats.
const { launch, scene, check, done } = require('./helpers');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DB = 'https://animalcrossing-15728-default-rtdb.firebaseio.com';
const seed = { caveSeed: 0, resources: { stone: 1 }, realm: { level: 12, shards: 100, bestWave: 2, kills: 5, deaths: 1 } };
const start = (role) => `(function(s){const link={onMessage:null,send:(m)=>window.__relaySend(JSON.stringify(m)),close(){}};window.__relayIn=(x)=>{if(link.onMessage)link.onMessage(JSON.parse(x))};s.localBody.setPosition(REALM_GATE_POS.x,REALM_GATE_POS.y+30);s.enterRealm({role:'${role}',link,mode:'duel'});})(window.__g.scene.getScene('Town'))`;

(async () => {
  const A = await launch({ width: 1000, height: 700 }, seed);
  const B = await launch({ width: 1000, height: 700 }, seed);
  for (const [f, t] of [[A, B], [B, A]]) await f.page.exposeFunction('__relaySend', (s) => { t.page.evaluate((m) => window.__relayIn && window.__relayIn(m), s).catch(() => {}); });
  await A.page.evaluate(start('host')); await B.page.evaluate(start('guest'));
  await sleep(1500);

  const info = (p) => scene(p, (s) => { const r = s.realm; const t = r.team; return { mode: t.mode, ph: t.duel.ph, rd: t.duel.rd, s: t.duel.s.join('-'), hp: Math.round(r.player.hp), max: r.stats.maxHp, dmg: r.stats.dmg, enemies: r.enemies.filter((e) => e.active).length, label: document.getElementById('realm-wave').textContent, px: Math.round(r.player.x), partnerHp: t.role === 'host' ? Math.round(t.partner.hp) : null }; });
  const h0 = await info(A.page), g0 = await info(B.page);
  check('duel: both enter duel mode with identical stats (100 HP, no gear/level bonus) and no enemies', h0.mode === 'duel' && g0.mode === 'duel' && h0.max === 100 && g0.max === 100 && h0.dmg === 1 && g0.dmg === 1 && h0.enemies === 0 && g0.enemies === 0, JSON.stringify([h0, g0]));
  check('duel: the guest is moved to the far corner and the HUD shows the score and round', g0.px > 600 && h0.px < 400 && /R1/.test(g0.label) && /0–0/.test(h0.label), JSON.stringify([h0, g0]));

  // protected countdown, then FIGHT
  const early = await scene(A.page, (s) => { const t = s.realm.team; const b = s.realm.firePlayerBullet; return { ph: t.duel.ph, prot: s.realm.player.iframes > 0 }; });
  check('duel: rounds start with a protected countdown', early.ph === 0 && early.prot, JSON.stringify(early));
  await sleep(2600);
  const f1 = await info(A.page);
  check('duel: after the countdown the round is live', f1.ph === 1, JSON.stringify(f1));

  // host shoots the guest: 8 damage per bolt
  const hit = await scene(A.page, (s) => { const r = s.realm; const p = r.team.partner; p.iframes = 0; r.player.x = p.x - 200; r.player.y = p.y; r.firePlayerBulletFrom(r.player.x, r.player.y, 0, 1, 0); return p.hp; });
  await sleep(700);
  const hp1 = await scene(A.page, (s) => Math.round(s.realm.team.partner.hp));
  const gHp = await scene(B.page, (s) => Math.round(s.realm.player.hp));
  check('duel: a host bolt does exactly 8 damage to the guest, and the guest sees its own HP drop', hp1 === 92 && gHp === 92, JSON.stringify([hit, hp1, gHp]));

  // the guest's bolts hurt the host (guest fires via the real input path)
  await scene(B.page, (s) => { const r = s.realm; r.player.x = s.realm.W * 0.7; r.player.y = s.realm.H / 2; r.keys = {}; r.mouse.seen = true; r.mouse.x = r.player.x - 100; r.mouse.y = r.player.y; r.mouse.down = true; });
  await scene(A.page, (s) => { const r = s.realm; r.player.x = r.W * 0.7 - 250; r.player.y = r.H / 2; r.player.iframes = 0; });
  await sleep(900);
  await scene(B.page, (s) => { s.realm.mouse.down = false; });
  const hpHost = await scene(A.page, (s) => Math.round(s.realm.player.hp));
  check('duel: guest bolts hurt the host in steps of 8', hpHost < 100 && (100 - hpHost) % 8 === 0, String(hpHost));

  // KO: guest at 8 HP, one more bolt takes round 1 for the host
  await scene(A.page, (s) => { const r = s.realm; const p = r.team.partner; p.hp = 8; p.iframes = 0; r.player.x = p.x - 200; r.player.y = p.y; r.pBullets.forEach((b) => { b.active = false; }); r.firePlayerBulletFrom(r.player.x, r.player.y, 0, 1, 0); });
  await sleep(800);
  const k1 = await info(A.page), k1g = await info(B.page);
  check('duel: a KO scores the round for the winner on both screens and starts the between-rounds pause', k1.s === '1-0' && k1g.s === '1-0' && k1.ph === 2, JSON.stringify([k1, k1g]));
  await sleep(3200);
  const r2 = await info(A.page), r2g = await info(B.page);
  check('duel: round 2 resets both fighters to full HP', r2.rd === 2 && r2.hp === 100 && r2.partnerHp === 100 && r2g.hp === 100 && r2.ph <= 1, JSON.stringify([r2, r2g]));

  // abilities other than Dash are disabled even at level 12
  const ab = await scene(A.page, (s) => [s.realm.cast(1), s.realm.cast(2), s.realm.cast(3)]);
  check('duel: Nova, Shield and Overdrive are disabled (Dash only)', ab.every((v) => v === false), JSON.stringify(ab));

  // finish: host wins round 2 -> duel over, both leave, no save change
  const save0 = await scene(A.page, (s) => JSON.stringify(s.realm.save));
  for (let i = 0; i < 30 && (await info(A.page)).ph !== 1; i++) await sleep(250);
  await scene(A.page, (s) => { const r = s.realm; const p = r.team.partner; p.hp = 8; p.iframes = 0; r.player.x = p.x - 200; r.player.y = p.y; r.pBullets.forEach((b) => { b.active = false; }); r.firePlayerBulletFrom(r.player.x, r.player.y, 0, 1, 0); });
  await sleep(900);
  const ov = await info(A.page);
  check('duel: first to 2 rounds wins the duel (banner + over phase)', ov.s === '2-0' && ov.ph === 3, JSON.stringify(ov));
  await sleep(4500);
  const out = await Promise.all([A, B].map((x) => scene(x.page, (s) => ({ inRealm: s.inRealm, save: JSON.stringify(s.realm.save) }))));
  check('duel: after the result both players are back in town and the save is untouched', !out[0].inRealm && !out[1].inRealm && out[0].save === save0, JSON.stringify([out[0].inRealm, out[1].inRealm]));

  // hostile duel packets
  await A.page.evaluate(start('host')); await sleep(300);
  const bad = await scene(A.page, (s) => { const t = s.realm.team; [{ k: 'in', x: 5, y: 5, f: 1, ab: [{ q: 1, k: 'nova' }] }, { k: 'in', x: 1e9, mh: 1e9, dm: 1e9, rt: 1e9 }].forEach((m) => t.onMessage(m)); const p = t.partner; return [p.maxHp, p.dmg, p.rate]; });
  check('duel: hostile guest stats (HP, damage, fire rate) are ignored', bad[0] === 100 && bad[1] === 1 && bad[2] === 6, JSON.stringify(bad));
  const cheat = await scene(A.page, (s) => {
    const t = s.realm.team; const p = t.partner; const o = {};
    t.onMessage({ k: 'in', n: 1, x: 100, y: 100, hp: 9999, mh: 9999 }); o.hp = p.hp;
    t.duel.ph = 1; p.x = 200; p.y = 200; s.realm.clock += 0.07; p.lastIn = s.realm.clock - 0.07;
    t.onMessage({ k: 'in', n: 2, x: 700, y: 500 }); o.jump = Math.round(Math.hypot(p.x - 200, p.y - 200));
    t.partnerLeft(); o.forfeit = [t.duel.ph, t.duel.s.join('-')];
    return o;
  });
  check('duel: a guest cannot start with inflated HP, cannot teleport across the arena, and leaving forfeits the duel', cheat.hp === 100 && cheat.jump < 60 && cheat.forfeit[0] === 3 && cheat.forfeit[1] === '2-0', JSON.stringify(cheat));
  await sleep(3500);
  await A.page.evaluate(() => { const b = document.getElementById('realm-leave-btn'); if (b) b.click(); }); await sleep(500);

  // Firebase: the Duel button sends a duel invite with the right toast
  const idB = await scene(B.page, (s) => s.net.id); await sleep(2000);
  await scene(A.page, (s) => { s.localBody.setPosition(REALM_GATE_POS.x, REALM_GATE_POS.y + 30); s.interact(); });
  await A.page.evaluate((id) => { const b = document.querySelector(`.realm-duel-btn[data-pid="${id}"]`); if (b) b.click(); }, idB);
  await sleep(2500);
  const toast = await B.page.evaluate(() => document.getElementById('realm-invite-text').textContent);
  check('duel: the Duel button challenges the other player (toast says duel)', /challenges you to a duel/.test(toast), toast);
  await B.page.click('#realm-invite-accept'); await sleep(4500);
  const fm = await Promise.all([A, B].map((x) => scene(x.page, (s) => s.inRealm && s.realm.team ? s.realm.team.mode + ':' + s.realm.team.role : 'none')));
  check('duel: accepting over Firebase starts a duel (host + guest)', fm[0] === 'duel:host' && fm[1] === 'duel:guest', JSON.stringify(fm));
  await B.page.evaluate(() => document.getElementById('realm-leave-btn').click()); await sleep(1500);
  await A.page.evaluate(() => { const b = document.getElementById('realm-leave-btn'); if (b) b.click(); }); await sleep(1000);

  const errs = [...A.errors, ...B.errors].filter((e) => !/favicon|net::ERR/.test(e));
  check('no console errors', errs.length === 0, errs.join(' | '));
  await A.browser.close(); await B.browser.close(); await sleep(5000);
  const [pl, ri, rp] = await Promise.all(['players', 'realmInvites', 'realmParties'].map((p) => fetch(`${DB}/${p}.json`).then((r) => r.text())));
  check('cleanup: no ADMIN players, invites or parties remain', !/ADMIN/.test(pl) && ri === 'null' && rp === 'null', [pl.slice(0, 80), ri, rp].join(' / '));
  done();
})();
