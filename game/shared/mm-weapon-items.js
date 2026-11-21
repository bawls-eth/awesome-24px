// MMWeaponItems: the 30 `wpn_<style>` item definitions + drop/shop data (NEXT-SLICES W1, data half of S12).
// One item per alternate MMWeapons style (the 14 class base styles are not items). Pure: no DOM, no Math.random, inputs never mutated.
//  - Items have the RM_ITEMS shape { id, slot:'weapon', name, icon, stat:'dmg', amount:0.45, style, family, text } plus an optional `art` (b07 icon id).
//  - Drops: 70% the active class family, 30% any family (seeded by the caller's rng). Shop price = rarity sell value x 8 (no luck).
//  - Save shape stays `{ n, id, r }` (pixeltown-save-v1.realm.items); clean() keeps unknown-but-valid wpn_ ids as inert items.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./mm-weapons.js'));
  else root.MMWeaponItems = factory(root.MMWeapons);
})(typeof self !== 'undefined' ? self : this, function (MMWeapons) {
  const ID_RE = /^wpn_[a-z_]{3,24}$/;
  const SELL = [3, 7, 15, 30]; // realm.js RM_RARITIES sell values common..epic
  const SHOP_MULT = 8;         // realm.js RM_SHOP_MULT
  const SHOP_UNLOCK = [0, 2, 5]; // best wave needed to stock Common / Uncommon / Rare (Epic is combine-only)
  const FAMILY_SHARE = 0.7;
  const AMOUNT = 0.45;
  const MAX_R = 3;
  // Emoji fallback per family (always available); `art` is a b07 weapon icon where one exists, else null (style icons are drawn by mm-fx-draw).
  const FAMILY_ICON = { bow: '🏹', wand: '🪄', staff: '🔮', tome: '📖', blade: '⚔️', hammer: '🔨', axe: '🪓', fist: '👊', dagger: '🗡️', star: '⭐', pistol: '🔫' };
  const FAMILY_ART = { bow: 'bow_hunter', wand: 'wand_ember', staff: 'staff_druid', tome: null, blade: 'sword_bronze', hammer: 'hammer_paladin', axe: 'axe_woodcutter', fist: null, dagger: 'dagger_steel', star: null, pistol: 'crossbow_bronze' };
  // Art requested in b29-gear-tiers for the splash styles; not delivered yet, so those items use art:null (emoji fallback) and carry the wanted id.
  const ART_WANTED = { bow_blast: 'wpn_icon_bow_blast', wand_burst: 'wpn_icon_wand_burst', staff_comet: 'wpn_icon_staff_comet', pistol_flak: 'wpn_icon_pistol_flak' };
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

  const ITEMS = [];
  const BY_ID = Object.create(null);
  MMWeapons.altIds().forEach((sid) => {
    const st = MMWeapons.get(sid);
    const it = Object.freeze({ id: 'wpn_' + sid, slot: 'weapon', name: st.name, icon: FAMILY_ICON[st.family], art: has(ART_WANTED, sid) ? null : FAMILY_ART[st.family], artWanted: has(ART_WANTED, sid) ? ART_WANTED[sid] : null, stat: 'dmg', amount: AMOUNT, text: 'damage', style: sid, family: st.family });
    ITEMS.push(it); BY_ID[it.id] = it;
  });
  Object.freeze(ITEMS);

  const get = (id) => (typeof id === 'string' && has(BY_ID, id) ? BY_ID[id] : null);
  const familyItems = (family) => ITEMS.filter((i) => i.family === family);
  // familyFor(classId): the class's weapon family or null.
  const familyFor = (classId) => (typeof classId === 'string' ? MMWeapons.familyOf(classId) : null);
  // canEquip(itemId, classId): a family match is needed ("Bow: Ranger" is shown greyed otherwise).
  function canEquip(itemId, classId) { const it = get(itemId), f = familyFor(classId); return !!(it && f && it.family === f); }
  // equipHint(itemId): "Bow: Ranger" style hint for ineligible items.
  function equipHint(itemId) {
    const it = get(itemId); if (!it) return '';
    const cls = Object.keys(MMWeapons.CLASS_FAMILY).filter((c) => MMWeapons.CLASS_FAMILY[c] === it.family);
    return it.family.charAt(0).toUpperCase() + it.family.slice(1) + ': ' + cls.map((c) => c.charAt(0).toUpperCase() + c.slice(1)).join(', ');
  }

  // dropItem(rng, classId): rng is a function returning [0,1) or an MMRng-like {next}. 70% active-family, 30% any family.
  // Unknown class -> any family. A bad rng yields the first item deterministically (never Math.random).
  function dropItem(rng, classId) {
    const next = typeof rng === 'function' ? rng : rng && typeof rng.next === 'function' ? () => rng.next() : () => 0;
    const u = (v) => { const x = Number(v); return Number.isFinite(x) ? Math.min(0.999999, Math.max(0, x)) : 0; };
    const f = familyFor(classId);
    const pool = f && u(next()) < FAMILY_SHARE ? familyItems(f) : ITEMS;
    return pool[Math.floor(u(next()) * pool.length)].id;
  }
  // sellValue(r) / shopPrice(r): sell x 8. Bad rarity -> clamped to the valid range.
  const rIdx = (r) => { const v = Math.floor(Number(r)); return Number.isFinite(v) ? Math.max(0, Math.min(MAX_R, v)) : 0; };
  const sellValue = (r) => SELL[rIdx(r)];
  const shopPrice = (r) => SELL[rIdx(r)] * SHOP_MULT;
  // shopStock(classId, bestWave): fixed family stock at every rarity the best wave unlocked. No luck, never Epic.
  function shopStock(classId, bestWave) {
    const f = familyFor(classId), bw = isNum(bestWave) ? Math.max(0, bestWave) : 0, out = [];
    if (!f) return out;
    SHOP_UNLOCK.forEach((w, r) => { if (bw >= w) familyItems(f).forEach((it) => out.push({ id: it.id, r: r, price: shopPrice(r) })); });
    return out;
  }
  // clean(raw): one backpack entry {n,id,r}. Unknown ids that still match the wpn_ pattern are kept as inert items; anything else -> null.
  function clean(raw) {
    if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !ID_RE.test(raw.id)) return null;
    return { n: isNum(raw.n) ? Math.max(0, Math.floor(raw.n)) : 0, id: raw.id, r: rIdx(raw.r) };
  }
  return { ID_RE, ITEMS, SELL, SHOP_MULT, SHOP_UNLOCK, FAMILY_SHARE, FAMILY_ICON, FAMILY_ART, ART_WANTED, get, familyItems, familyFor, canEquip, equipHint, dropItem, sellValue, shopPrice, shopStock, clean };
});
