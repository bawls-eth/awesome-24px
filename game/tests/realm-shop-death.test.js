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
      r._cacheAliveT = 60; // G-09: a cache needs 3 kills or a minute alive since the last one
      r._die();
      const it = r.save.items[r.save.items.length - 1];
      out.push({ wave, shards: r.save.shards, added: r.save.items.length - n0, rar: it && it.r, deaths: r.save.deaths - dead0, lastLoss: r.lastLoss, banner: document.getElementById('realm-banner').textContent });
    }
    r.state = 'play'; r.run.wave = 7; r.save.shards = 100; r.save.items = []; for (let i = 0; i < 24; i++) r.save.items.push({ n: 900 + i, id: 'sparkwand', r: 0 }); r.save.nextUid = 1000;
    r._cacheAliveT = 60; r._die(); out.push({ full: true, shards: r.save.shards, len: r.save.items.length });
    r.save.items = []; r.state = 'play';
    return out;
  });
  check('death: no shards lost at waves 1, 4 and 7, one fall counted each time, banner says nothing was lost', d.slice(0, 3).every((o) => o.shards === 100 && o.deaths === 1 && o.lastLoss === 0 && /no .*lost/.test(o.banner)), JSON.stringify(d));
  check('death: the fall banner recaps the run (wave, kills, 💎 earned)', /wave 7, \d+ kills, \+\d+ 💎 this run/.test(d[2].banner), d[2].banner);
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

  // 3. Combine: 3 identical items fuse into one of the next rarity (stronger stat).
  const cb = await scene(page, (s) => {
    const r = s.realm; const o = {}; r.state = 'play'; r.setShop(false); r.setPaused(false);
    const mk = (n, id, rr) => ({ n, id, r: rr });
    const forget = () => { r._known = new Set(JSON.parse(localStorage.getItem('pixeltown-save-v1')).realm.items.map((x) => x.n)); }; // the test replaces the backpack wholesale; tell the save-merge those stored uids are already known
    forget();
    r.save.items = [mk(1, 'sparkwand', 0), mk(2, 'sparkwand', 0), mk(3, 'sparkwand', 0), mk(4, 'sparkwand', 0), mk(5, 'heartcharm', 0), mk(6, 'heartcharm', 0)]; r.save.nextUid = 10; r.save.eq = { weapon: 2 };
    r._calcStats(); o.dmg0 = r.stats.dmg;
    o.twoNot = r.combine(5) === false; // only 2 charms
    r.setPaused(true); o.btns = document.querySelectorAll('#realm-backpack-body button[data-combine]').length;
    o.ok = r.combine(1); // the equipped #2 survives as Uncommon; #1 and #3 are spent first
    o.left = r.save.items.map((x) => x.n + ':' + x.r).join(','); o.eq = r.save.eq.weapon; o.dmg1 = r.stats.dmg; o.surv = (r.save.items.find((x) => x.id === 'sparkwand' && x.r === 1) || {}).n; // review F4: the survivor gets a fresh uid (no in-place r change)
    forget(); r.save.items = [mk(701, 'luckring', 2), mk(702, 'luckring', 2), mk(703, 'luckring', 2)]; r.save.eq = {}; // fresh uids: the save-merge remaps a uid that collides with a different stored item
    o.epicRet = r.combine(702); o.epicItems = JSON.stringify(r.save.items); o.epic = o.epicRet && r.save.items.length === 1 && r.save.items[0].r === 3 && [701, 702, 703].indexOf(r.save.items[0].n) < 0; o.saved = JSON.parse(localStorage.getItem('pixeltown-save-v1')).realm.items.length === 1 && JSON.parse(localStorage.getItem('pixeltown-save-v1')).realm.items[0].r === 3;
    o.epicText = r._itemText(r.save.items[0]); o.noMore = r.combinable(r.save.items[0].n) === null;
    r.save.items = [mk(801, 'luckring', 3), mk(802, 'luckring', 3), mk(803, 'luckring', 3)]; o.capped = r.combine(801) === false;
    r.save.items = []; r.save.eq = {}; r.setPaused(false);
    return o;
  });
  check('combine: needs 3 identical items; the backpack shows the Combine button only then', cb.twoNot && cb.btns >= 1, JSON.stringify(cb));
  // review F4: the survivor is the equipped copy (#2), replaced in its place by a FRESH uid one rarity up (an in-place r change duplicated it in the cross-tab merge)
  check('combine: 3 Common wands -> 1 Uncommon (the equipped copy is upgraded under a fresh uid, others spent), damage goes up at once', cb.ok && cb.left === `${cb.surv}:1,4:0,5:0,6:0` && [1, 2, 3].indexOf(cb.surv) < 0 && cb.eq === cb.surv && cb.dmg1 > cb.dmg0, JSON.stringify(cb));
  check('combine: 3 Rares -> 1 Epic (+43% shard bonus), Epic is the cap and persists in the save', cb.epic && /43%/.test(cb.epicText) && cb.noMore && cb.capped && cb.saved, JSON.stringify(cb));

  check('no console errors', errors.length === 0, errors.join('|'));
  await browser.close();
  done();
})();
