// MMItemIcons: item icons only (UMD, browser global MMItemIcons). The Town's Realm shop and backpack need item art but the Town must never load
// MMArt (enemy / boss art; art-integration, enemy-art, boss-art and enemy-death-art pin that). This is the item half of MMArt.loadItems, same
// ItemSet API (has / ids / iconUrl / markBad), same ITEM_ICON_MAP (a node test pins the two maps equal). Never throws; an unknown id gives null.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.MMItemIcons = factory(root);
}(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  var ITEM_ICON_MAP = {
    sparkwand: 'wand_spark', quickwand: 'wand_ember',
    heartcharm: 'accessory_red_garnet_heart_pendant', swiftcharm: 'accessory_gold_feather_brooch',
    luckring: 'accessory_copper_emerald_ring', scholarring: 'accessory_sapphire_wave_ring', wardring: 'accessory_gold_ruby_signet',
    wpn_bow_blast: 'wpn_icon_bow_blast', wpn_wand_burst: 'wpn_icon_wand_burst', wpn_staff_comet: 'wpn_icon_staff_comet', wpn_pistol_flak: 'wpn_icon_pistol_flak'
  };
  var ITEM_BATCH_RE = /(items|weapons|armor|headgear|clothing|accessories|consumables)/;
  var GEAR_BATCH = 'b29-gear-tiers';
  function artOff() {
    try { var s = root && root.location && root.location.search; return typeof s === 'string' && /[?&]art=0(&|$)/.test(s); } catch (e) { return false; }
  }
  function join(base, rel) { base = String(base || ''); if (base && base.charAt(base.length - 1) !== '/') base += '/'; return base + String(rel || ''); }
  var jsonCache = Object.create(null);
  function fetchJson(url) {
    var key = String(url);
    if (jsonCache[key]) return jsonCache[key];
    var p;
    try { p = root && typeof root.fetch === 'function' ? root.fetch(url) : null; } catch (e) { p = null; }
    if (!p || typeof p.then !== 'function') return Promise.resolve(null);
    var out = p.then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }).then(function (j) {
      if (j === null || j === undefined) { if (jsonCache[key] === out) delete jsonCache[key]; return null; }
      return j;
    });
    jsonCache[key] = out;
    return out;
  }
  function ItemSet() { this.byId = Object.create(null); this.images = Object.create(null); this.bad = Object.create(null); }
  ItemSet.prototype.has = function (id) { return typeof id === 'string' && !!this.byId[id]; };
  ItemSet.prototype.ids = function () { return Object.keys(this.byId); };
  ItemSet.prototype.iconUrl = function (id) {
    try {
      if (typeof id !== 'string') return null;
      var art = Object.prototype.hasOwnProperty.call(ITEM_ICON_MAP, id) ? ITEM_ICON_MAP[id] : id;
      var e = this.byId[art];
      if (!e || this.bad[art]) return null;
      this.image(art);
      return e.url;
    } catch (err) { return null; }
  };
  ItemSet.prototype.image = function (art) {
    try {
      var e = this.byId[art]; if (!e) return null;
      if (this.images[art]) return this.images[art];
      var img = new root.Image(), self = this;
      img.onerror = function () { self.bad[art] = 1; };
      img.src = e.url;
      this.images[art] = img;
      return img;
    } catch (err) { return null; }
  };
  ItemSet.prototype.markBad = function (id) {
    var art = Object.prototype.hasOwnProperty.call(ITEM_ICON_MAP, id) ? ITEM_ICON_MAP[id] : id;
    if (typeof art === 'string') this.bad[art] = 1;
  };
  // loadItems(assetRoot) -> Promise<ItemSet>: INDEX.json, then only the item batch manifests; no PNG is fetched until used. Never rejects.
  function loadItems(assetRoot) {
    var base = assetRoot || 'assets/arcane/', set = new ItemSet();
    return fetchJson(join(base, 'INDEX.json')).then(function (idx) {
      var ids = [];
      if (idx && Array.isArray(idx.batches)) idx.batches.forEach(function (b) {
        var id = b && typeof b.path === 'string' ? b.path.replace(/\/+$/, '').split('/').pop() : '';
        if (/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(id) && (ITEM_BATCH_RE.test(id) || (id === GEAR_BATCH && !artOff())) && ids.indexOf(id) < 0) ids.push(id);
      });
      return Promise.all(ids.map(function (id) {
        return fetchJson(join(join(base, id), 'manifest.json')).then(function (m) {
          (m && Array.isArray(m.assets) ? m.assets : []).forEach(function (a) {
            if (!a || !(a.category === 'item' || (id === GEAR_BATCH && a.category === 'items')) || typeof a.id !== 'string' || typeof a.path !== 'string') return;
            if (!/^[A-Za-z0-9_.\/-]+$/.test(a.path) || a.path.indexOf('..') >= 0) return;
            set.byId[a.id] = { url: join(join(base, id), a.path), tags: Array.isArray(a.tags) ? a.tags.filter(function (t) { return typeof t === 'string'; }) : [] };
          });
        });
      }));
    }).then(function () { return set; }).catch(function () { return set; });
  }
  return { loadItems: loadItems, ITEM_ICON_MAP: ITEM_ICON_MAP, ItemSet: ItemSet };
}));
