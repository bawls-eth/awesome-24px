// Realm: dying no longer costs shards (a Survivor's Cache item instead) + the in-Realm shop.
const { launch, scene, check, done } = require('./helpers');
const seed = { caveSeed: 0, resources: { stone: 1 }, realm: { shards: 100, bestWave: 2, kills: 5, deaths: 1 } };

const enter = (s) => {
  s.localBody.setPosition(REALM_GATE_POS.x, REALM_GATE_POS.y + 30); s.enterRealm();
  const r = s.realm; r.stop(); r.active = true;
  [r.enemies, r.eBullets, r.pBullets, r.bags].forEach((p) => p.forEach((o) => { o.active = false; }));
  r.state = 'play'; r.run.wave = 1; r.player.iframes = 0;
};

(async () => {
  const { browser, page, errors } = await launch({ width: 1000, height: 700 }, seed);
  await scene(page, enter);

  // 1. Death keeps every shard and pays a cache whose rarity follows the wave reached.
  const d = await scene(page, (s) => {
    const r = s.realm; const out = [];
    for (const wave of [1, 4, 7]) {
      r.state = 'play'; r.run.wave = wave; r.save.shards = 100; const n0 = r.save.items.length; const dead0 = r.save.deaths;
      r._die();
      const it = r.save.items[r.save.items.length - 1];
      out.push({ wave, shards: r.save.shards, added: r.save.items.length - n0, rar: it && it.r, deaths: r.save.deaths - dead0, lastLoss: r.lastLoss, banner: document.getElementById('realm-banner').textContent });
    }
    r.state = 'play'; r.run.wave = 7; r.save.shards = 100; r.save.items = []; for (let i = 0; i < 24; i++) r.save.items.push({ n: 900 + i, id: 'sparkwand', r: 0 }); r.save.nextUid = 1000;
    r._die(); out.push({ full: true, shards: r.save.shards, len: r.save.items.length });
    r.save.items = []; r.state = 'play';
    return out;
  });
  check('death: no shards lost at waves 1, 4 and 7, one fall counted each time, banner says nothing was lost', d.slice(0, 3).every((o) => o.shards === 100 && o.deaths === 1 && o.lastLoss === 0 && /no .*lost/.test(o.banner)), JSON.stringify(d));
  check('death: the cache is Common at wave 1, Uncommon at wave 4, Rare at wave 7', d[0].added === 1 && d[0].rar === 0 && d[1].rar === 1 && d[2].rar === 2, JSON.stringify(d));
  check('death: with a full backpack the cache is sold for shards instead of dropped', d[3].len === 24 && d[3].shards === 100 + 15, JSON.stringify(d[3]));

  // 2. Shop.
  const sh = await scene(page, (s) => {
    const r = s.realm; const o = {};
    r.state = 'play'; r.save.items = []; r.save.shards = 100; r.save.bestWave = 2; r.save.nextUid = 5000;
    const stock = r.shopStock(); o.n = stock.length; o.hasRare = stock.some((x) => x.r === 2); o.hasUnc = stock.some((x) => x.r === 1);
    r.onKeyDown({ key: 'v', repeat: false, preventDefault() {} });
    o.open = !document.getElementById('realm-shop').classList.contains('hidden'); o.paused = r.paused; o.btn = true;
    o.rows = document.querySelectorAll('#realm-shop-body button[data-buy]').length;
    o.rareBlocked = r.buy('sparkwand', 2) === false;
    o.bought = r.buy('sparkwand', 1); o.shards1 = r.save.shards; o.items1 = r.save.items.length; o.price = 7 * 8;
    o.tooPoor = r.buy('heartcharm', 1) === false; // 100 - 56 = 44 < 56
    o.bad = [r.buy('__proto__', 0), r.buy('sparkwand', -1), r.buy('sparkwand', 9), r.buy('nope', 0)].every((x) => x === false);
    o.saved = JSON.parse(localStorage.getItem('pixeltown-save-v1')).realm.items.length;
    r.save.shards = 5000; r.save.items = []; for (let i = 0; i < 24; i++) r.save.items.push({ n: 9000 + i, id: 'sparkwand', r: 0 });
    o.fullBlocked = r.buy('sparkwand', 0) === false && r.save.shards === 5000;
    r.onKeyDown({ key: 'v', repeat: false, preventDefault() {} });
    o.closed = document.getElementById('realm-shop').classList.contains('hidden') && !r.paused;
    r.save.bestWave = 6; o.stock6 = r.shopStock().filter((x) => x.r === 2).length;
    r.setPaused(true); document.querySelector('#realm-backpack-body button[data-open-shop]').click(); o.btnOpens = r.panel === 'shop' && document.getElementById('realm-shop').style.display === 'flex'; r.setShop(false); o.hiddenAfter = document.getElementById('realm-shop').style.display === 'none';
    return o;
  });
  check('shop: V opens it (pausing the run), 14 offers at best wave 2 (no Rare yet), buttons are rendered', sh.open && sh.paused && sh.n === 14 && !sh.hasRare && sh.hasUnc && sh.rows === 14 && sh.btn, JSON.stringify(sh));
  check('shop: buying an Uncommon costs 56, adds the item and saves; locked Rare / too poor / junk ids are refused', sh.bought === true && sh.shards1 === 100 - sh.price && sh.items1 === 1 && sh.saved === 1 && sh.rareBlocked && sh.tooPoor && sh.bad, JSON.stringify(sh));
  check('shop: a full backpack blocks buying; V closes it; the backpack 🛒 Shop button opens it; Rare unlocks at best wave 5', sh.fullBlocked && sh.closed && sh.btnOpens && sh.hiddenAfter && sh.stock6 === 7, JSON.stringify(sh));

  check('no console errors', errors.length === 0, errors.join('|'));
  await browser.close();
  done();
})();
