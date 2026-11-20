// Class signature abilities in the standalone Mad Maze arena (MMClasses.arenaSignature + RealmArena.setHeroSignature).
// Run: BASE=http://localhost:8463/game/index.html NODE_PATH=$(npm root -g) node game/tests/class-abilities-arena.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const MAZE = ORIGIN + '/game/games/mad-maze/index.html?test=1&offline=1';
const MM = 'pixeltown-mm-v1', ACTIVE = 'pixeltown-mm-active-v1';
const hero = (id, cls) => ({ id, name: cls, cls, level: 3, xp: 0, fame: 0, bonus: 0, mode: 'classic', items: [] });
const prof = (heroes) => ({ v: 1, heroes, stash: new Array(16).fill(null), fame: 0, mode: 'classic', hall: [], migratedFrom: null });
const CLS = ['ranger', 'rogue', 'paladin', 'necromancer', 'berserker', 'druid', 'warlock', 'frostcaller'];

async function open(browser, cls, query, opts) {
  const ctx = await browser.newContext(opts || { viewport: { width: 1000, height: 700 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate(([k1, p, k2, a]) => { localStorage.setItem(k1, JSON.stringify(p)); localStorage.setItem(k2, a); }, [MM, prof(CLS.map((c) => hero('h-' + c, c))), ACTIVE, JSON.stringify({ v: 1, heroId: 'h-' + cls })]);
  errors.length = 0;
  await page.goto(MAZE + (query || ''));
  await page.waitForFunction(() => window.__mm && window.__mm.arena);
  return { ctx, page, errors };
}

// Quiet arena at a chosen level: play state, no enemies/bolts, player centred facing right, full cooldowns reset.
const prep = (page, level) => page.evaluate((lv) => {
  const a = window.__mm.arena;
  a.save.level = lv; a._calcStats(); a.state = 'play'; a.run.wave = 0; a.paused = false; a.down = false;
  [a.enemies, a.eBullets, a.pBullets].forEach((pool) => pool.forEach((o) => { o.active = false; }));
  const p = a.player; p.x = 400; p.y = 350; p.aim = 0; p.hp = a.stats.maxHp; p.iframes = 0; a.abilityCd = [0, 0, 0, 0]; a.shield.hits = 0; a.shield.t = 0; a.overdriveT = 0; a._sigReset(); a._syncAbilities();
  return true;
}, level);
const bar = (page) => page.evaluate(() => { const el = document.getElementById('realm-ab-3'); const nm = el.querySelector('.nm'); return { ico: el.querySelector('.ico').textContent, nm: nm ? nm.textContent : null, locked: el.classList.contains('locked'), cd: el.querySelector('.cd').textContent, label: el.getAttribute('aria-label') }; });

// In-page scenario: spawn a quiet 'ring' enemy (never fires), cast F, step the sim; returns before/after numbers.
function scenario(page, spec) {
  return page.evaluate((sp) => {
    const a = window.__mm.arena, p = a.player;
    const mk = (dx, dy) => { const e = a.spawnEnemy('ring', p.x + dx, p.y + dy); e.cd = 999; return e; };
    const e = sp.enemy ? mk(sp.enemy[0], sp.enemy[1]) : null;
    if (sp.hp) p.hp = sp.hp;
    const out = { hp0: e ? e.hp : 0, x0: e ? e.x : 0, px0: p.x, php0: p.hp };
    if (sp.bullet) { const b = a.eBullets[0]; b.active = true; b.x = p.x + 40; b.y = p.y; b.vx = 0; b.vy = 0; b.life = 5; }
    out.cast = a.cast(3);
    out.cast2 = a.cast(3); // cooldown must block
    out.cd = a.abilityCd[3];
    out.shield = a.shield.hits; out.bones = a.sg.bones.t > 0 ? a.sg.bones.n : 0; out.bloom = a.sg.bloom.t > 0; out.pow = a.sg.powT; out.bullets = a.pBullets.filter((b) => b.active).length;
    out.eb = sp.bullet ? a.eBullets[0].active : null;
    out.hpNow = e ? e.hp : 0; out.xNow = e ? e.x : 0; out.slowT = e ? e.slowT : 0; out.php = p.hp; out.px = p.x; out.banner = document.getElementById('realm-banner').textContent;
    for (let i = 0; i < (sp.frames || 0); i++) a._update(1 / 60);
    out.hp1 = e ? e.hp : 0; out.alive = e ? e.active : false; out.php1 = p.hp;
    return out;
  }, spec);
}

(async () => {
  const browser = await chromium.launch();
  const errs = [];
  const run = async (cls, level, spec) => {
    const P = await open(browser, cls); await prep(P.page, level);
    const pre = await bar(P.page);
    const res = await scenario(P.page, spec);
    errs.push(...P.errors); await P.ctx.close();
    return { pre, res };
  };

  // Slot: locked below level 7, shows icon + short name at level 7, same cooldown rules.
  { const P = await open(browser, 'rogue'); await prep(P.page, 6);
    const b6 = await bar(P.page);
    const c6 = await P.page.evaluate(() => window.__mm.arena.cast(3));
    check('rogue F signature shown but locked at level 6 (Lv7)', b6.locked && b6.cd === 'Lv7' && b6.ico === '🗡️' && b6.nm === 'Dash' && c6 === false, JSON.stringify(b6));
    await prep(P.page, 7);
    const b7 = await bar(P.page);
    check('rogue signature unlocked at level 7 with icon/name/aria', !b7.locked && b7.nm === 'Dash' && /Shadow Dash \(F\)/.test(b7.label), JSON.stringify(b7));
    check('F key is the signature key', await P.page.evaluate(() => { const a = window.__mm.arena; return a._ab(3).key === 'f'; }));
    errs.push(...P.errors); await P.ctx.close(); }

  // rogue: dash + volley
  { const { res } = await run('rogue', 7, { enemy: [200, 0], frames: 40 });
    check('rogue: cast ok, dashed forward, volley bolts out', res.cast && res.px > res.px0 + 100 && res.bullets >= 5, JSON.stringify(res));
    check('rogue: volley hurts the enemy ahead', res.hp1 < res.hp0, JSON.stringify(res));
    check('rogue: cooldown set (10s) and blocks recast', res.cast2 === false && res.cd > 9 && res.cd <= 10, JSON.stringify(res));
    check('rogue: banner on cast', /Shadow Dash/.test(res.banner), res.banner); }

  // paladin: shield up, bullet cancelled, healed
  { const { res } = await run('paladin', 7, { hp: 40, bullet: true, frames: 0 });
    check('paladin: shield hits up and bullet cancelled', res.cast && res.shield === 4 && res.eb === false, JSON.stringify(res));
    check('paladin: healed but capped at max HP', res.php > 40 && res.php <= 150, JSON.stringify(res));
    check('paladin: cooldown blocks recast', res.cast2 === false && res.cd > 15, JSON.stringify(res)); }
  { const P = await open(browser, 'paladin'); await prep(P.page, 7);
    const capped = await P.page.evaluate(() => { const a = window.__mm.arena; a.player.hp = a.stats.maxHp - 3; a.cast(3); return a.player.hp === a.stats.maxHp; });
    check('paladin: heal never exceeds max HP', capped);
    errs.push(...P.errors); await P.ctx.close(); }

  // necromancer: orbiting bone shards damage what they touch
  { const { res } = await run('necromancer', 7, { enemy: [56, 0], frames: 150 });
    check('necromancer: 3 bone shards present', res.cast && res.bones === 3, JSON.stringify(res));
    check('necromancer: shards damage an enemy on the orbit', res.hp1 < res.hp0, JSON.stringify(res));
    check('necromancer: cooldown blocks recast', res.cast2 === false && res.cd > 14, JSON.stringify(res)); }

  // berserker: slam damage + knockback + damage buff
  { const { res } = await run('berserker', 7, { enemy: [80, 0], frames: 0 });
    check('berserker: slam hurts the adjacent enemy', res.cast && res.hpNow < res.hp0, JSON.stringify(res));
    check('berserker: enemy is knocked back', res.xNow > res.x0 + 40, JSON.stringify(res));
    check('berserker: damage buff running', res.pow > 4, JSON.stringify(res));
    check('berserker: cooldown blocks recast', res.cast2 === false && res.cd > 13, JSON.stringify(res)); }

  // druid: bloom roots/slows and ticks
  { const { res } = await run('druid', 7, { enemy: [150, 0], frames: 70 });
    check('druid: bloom zone placed and enemy rooted', res.cast && res.bloom && res.slowT > 0, JSON.stringify(res));
    check('druid: thorns tick damage', res.hp1 < res.hp0, JSON.stringify(res));
    check('druid: cooldown blocks recast', res.cast2 === false && res.cd > 15, JSON.stringify(res)); }

  // warlock: drain orb damages and heals (capped)
  { const { res } = await run('warlock', 7, { enemy: [260, 0], hp: 30, frames: 0 });
    check('warlock: orb hurts the enemy at the aim point', res.cast && res.hpNow < res.hp0, JSON.stringify(res));
    check('warlock: drain heals the caster', res.php > 30 && res.php - 30 <= 25, JSON.stringify(res)); }

  // frostcaller: blizzard ring slows
  { const { res } = await run('frostcaller', 7, { enemy: [100, 0] });
    check('frostcaller: blizzard slows and hurts', res.cast && res.slowT > 0 && res.hpNow < res.hp0, JSON.stringify(res)); }

  // ranger default volley, and the enemy-speed slow wears off
  { const { res } = await run('ranger', 7, { enemy: [200, 0], frames: 30 });
    check('ranger: volley fired and hits', res.cast && res.bullets >= 10 && res.hp1 < res.hp0, JSON.stringify(res)); }
  { const P = await open(browser, 'frostcaller'); await prep(P.page, 7);
    const t = await P.page.evaluate(() => { const a = window.__mm.arena, p = a.player; const e = a.spawnEnemy('ring', p.x + 100, p.y); e.cd = 999; a.cast(3); for (let i = 0; i < 240; i++) a._update(1 / 60); return e.slowT; });
    check('slow wears off after its duration', t <= 0, String(t));
    errs.push(...P.errors); await P.ctx.close(); }

  // ?signature=0: today's behaviour (Overdrive in F)
  { const P = await open(browser, 'rogue', '&signature=0'); await prep(P.page, 7);
    const b = await bar(P.page);
    const r = await P.page.evaluate(() => { const a = window.__mm.arena; const ok = a.cast(3); return { ok, od: a.overdriveT, sig: a.sig, cd: a.abilityCd[3] }; });
    check('?signature=0: F is Overdrive (fire icon, no signature name)', b.ico === '🔥' && b.nm === null && r.sig === null && r.ok && r.od > 3 && r.cd === 20, JSON.stringify([b, r]));
    errs.push(...P.errors); await P.ctx.close(); }

  // Default arena (no signature) and duels are untouched
  { const P = await open(browser, 'rogue'); await prep(P.page, 7);
    const r = await P.page.evaluate(() => {
      const a = window.__mm.arena; const out = {};
      a.team = { isPvp: true, sendAbility() {} };
      out.duelAb = a._ab(3).id; const cd = a.abilityCd.slice(); out.duelCast = a.cast(3); out.duelCdSame = JSON.stringify(cd) === JSON.stringify(a.abilityCd); a.team = null;
      a.setHeroSignature(null); out.nullAb = a._ab(3).id; out.nullIco = document.getElementById('realm-ab-3').querySelector('.ico').textContent; out.nm = !!document.getElementById('realm-ab-3').querySelector('.nm');
      a.setHeroSignature({ kind: 'nonsense' }); out.badAb = a._ab(3).id;
      a.setHeroSignature({ kind: 'volley', cooldown: 9999, count: 9999, dmg: 1e9, name: 'x'.repeat(99) });
      out.clamp = a.sig.cooldown === 60 && a.sig.count === 24 && a.sig.dmg === 12 && a.sig.name.length === 24;
      return out;
    });
    check('duel: F stays Overdrive and the signature cannot be cast', r.duelAb === 'overdrive' && r.duelCast === false && r.duelCdSame, JSON.stringify(r));
    check('setHeroSignature(null / bad kind) restores Overdrive and the fire icon', r.nullAb === 'overdrive' && r.nullIco === '🔥' && !r.nm && r.badAb === 'overdrive', JSON.stringify(r));
    check('setHeroSignature clamps wild numbers', r.clamp, JSON.stringify(r));
    errs.push(...P.errors); await P.ctx.close(); }

  // Town Realm Gate arena never gets a signature; the town sources never call the hook
  { const ctx = await browser.newContext(); const pg = await ctx.newPage();
    const res = await pg.request.get(ORIGIN + '/game/main.js'); const src = await res.text();
    check('town (main.js) never calls setHeroSignature', res.ok() && src.indexOf('setHeroSignature') < 0);
    await ctx.close(); }

  // 390x844 phone: signature on the ability bar, no overlap with sticks / HUD, no horizontal scroll
  { const P = await open(browser, 'rogue', '', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }); await prep(P.page, 7);
    const lay = await P.page.evaluate(() => {
      const r = (sel) => { const el = document.querySelector(sel); if (!el) return null; const b = el.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
      const hit = (a, b) => !!a && !!b && a.w > 0 && b.w > 0 && a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
      const f = r('#realm-ab-3');
      const o = {};
      ['#realm-stick-move', '#realm-stick-aim', '#realm-info', '#realm-xp', '#realm-leave-btn', '#realm-bp-btn'].forEach((s) => { o[s] = hit(f, r(s)); });
      ['#realm-ab-0', '#realm-ab-1', '#realm-ab-2'].forEach((s) => { o[s] = hit(f, r(s)); });
      return { f, o, inView: f.l >= 0 && f.r <= window.innerWidth && f.t >= 0 && f.b <= window.innerHeight, noScroll: document.documentElement.scrollWidth <= window.innerWidth, nm: document.querySelector('#realm-ab-3 .nm').textContent };
    });
    check('phone 390x844: signature button visible, named, and overlaps nothing', lay.inView && lay.noScroll && lay.nm === 'Dash' && Object.values(lay.o).every((v) => !v), JSON.stringify(lay));
    errs.push(...P.errors); await P.ctx.close(); }

  check('no console errors', errs.length === 0, errs.join(' | '));
  await browser.close();
  done();
})();
