// MMPortals: pure vault + boss portal rules (NEXT-SLICES N3). No DOM, no clock (callers pass nowMs), no Math.random.
//  - A `key_boss` (b22) opens a boss portal (b14 `portal_boss`) for 120 s, in the Realm only.
//  - The vault portal (b14 `portal_vault`) exists only in the Nexus and leads to the Lantern stash.
//  - Any other key id, hostile input or a wrong place is a no-op that returns the (cleaned) state unchanged.
// State shape (runtime, optionally saved additively): { boss: null | { x, y, openedAt, expiresAt } }. Inputs are never mutated.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMPortals = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const BOSS_KEY = 'key_boss', BOSS_PORTAL_MS = 120000;
  const ART = { boss: 'portal_boss', vault: 'portal_vault', nexus: 'portal_nexus', return: 'portal_return' };
  const PLACES = ['realm', 'nexus', 'dungeon'];
  const MAX_COORD = 1e6;
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const place = (p) => (PLACES.indexOf(p) >= 0 ? p : 'realm');

  function fresh() { return { boss: null }; }
  // clean(raw): save/runtime cleaner. Bad shape -> no portal. Coordinates clamped, the window can never exceed 120 s.
  function clean(raw) {
    const b = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw.boss : null;
    if (!b || typeof b !== 'object' || !isNum(b.x) || !isNum(b.y) || !isNum(b.openedAt) || !isNum(b.expiresAt)) return fresh();
    const openedAt = Math.max(0, b.openedAt);
    const expiresAt = Math.min(b.expiresAt, openedAt + BOSS_PORTAL_MS);
    if (expiresAt <= openedAt) return fresh();
    return { boss: { x: Math.max(-MAX_COORD, Math.min(MAX_COORD, b.x)), y: Math.max(-MAX_COORD, Math.min(MAX_COORD, b.y)), openedAt: openedAt, expiresAt: expiresAt } };
  }
  const bossOpen = (st, now) => !!(st.boss && isNum(now) && now >= st.boss.openedAt && now < st.boss.expiresAt);

  // openBoss(state, keyId, pos{x,y}, nowMs, where): ok only for key_boss, a finite pos and time, in the realm (not the Nexus).
  // Returns { ok, consume (true = caller removes one key), state, portal } and a no-op (consume false) otherwise.
  function openBoss(state, keyId, pos, nowMs, where) {
    const st = clean(state);
    const noop = { ok: false, consume: false, state: st, portal: null };
    if (keyId !== BOSS_KEY || !isNum(nowMs) || nowMs < 0 || !pos || !isNum(pos.x) || !isNum(pos.y)) return noop;
    if (place(where) !== 'realm') return noop;
    const next = { boss: { x: Math.max(-MAX_COORD, Math.min(MAX_COORD, pos.x)), y: Math.max(-MAX_COORD, Math.min(MAX_COORD, pos.y)), openedAt: nowMs, expiresAt: nowMs + BOSS_PORTAL_MS } };
    return { ok: true, consume: true, state: next, portal: bossPortal(next, nowMs) };
  }
  function bossPortal(state, nowMs) {
    const st = clean(state);
    if (!bossOpen(st, nowMs)) return null;
    return { id: 'boss', art: ART.boss, dest: 'boss', x: st.boss.x, y: st.boss.y, leftMs: st.boss.expiresAt - nowMs };
  }
  // tick(state, nowMs): drops an expired boss portal.
  function tick(state, nowMs) { const st = clean(state); return bossOpen(st, nowMs) ? st : fresh(); }

  // vaultPortal(where): the vault portal descriptor, only in the Nexus (a plain object; the layout supplies the position).
  function vaultPortal(where) { return where === 'nexus' ? { id: 'vault', art: ART.vault, dest: 'lantern-stash' } : null; }
  // canEnter(portalId, state, where, nowMs) -> { ok, dest }. Unknown ids and wrong places are { ok:false }.
  function canEnter(portalId, state, where, nowMs) {
    if (portalId === 'vault') return where === 'nexus' ? { ok: true, dest: 'lantern-stash' } : { ok: false, dest: null };
    if (portalId === 'boss') return bossOpen(clean(state), nowMs) && place(where) === 'realm' ? { ok: true, dest: 'boss' } : { ok: false, dest: null };
    return { ok: false, dest: null };
  }
  return { BOSS_KEY, BOSS_PORTAL_MS, ART, fresh, clean, openBoss, bossPortal, tick, vaultPortal, canEnter };
});
