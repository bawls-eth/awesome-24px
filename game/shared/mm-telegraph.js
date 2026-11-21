// MMTelegraph: wind-up descriptors for enemy volleys. Pure and deterministic; colours from MMAccess.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./mm-access.js'));
  else root.MMTelegraph = factory(root.MMAccess);
})(typeof self !== 'undefined' ? self : this, function (Access) {
  const WINDUP_T3 = 0.35, WINDUP_BOSS = 0.6, FALLBACK = '#ffb347';
  const SHAPES = { ring: 'ring', burst: 'ring', nova: 'ring', spiral: 'ring', radial: 'ring', aimed: 'line', line: 'line', beam: 'line', shot: 'line', fan: 'cone', spread: 'cone', cone: 'cone', arc: 'cone' };
  const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  function shapeFor(pattern) {
    let k = pattern;
    if (k && typeof k === 'object') k = k.shape || k.kind || k.type || k.id;
    k = typeof k === 'string' ? k.toLowerCase() : '';
    return hasOwn(SHAPES, k) ? SHAPES[k] : 'ring';
  }
  function windupFor(tier, isBoss) {
    if (isBoss === true) return WINDUP_BOSS;
    const t = typeof tier === 'number' && isFinite(tier) ? tier : 0;
    return t >= 3 ? WINDUP_T3 : 0;
  }
  function colorFor(name) {
    try { const p = Access && Access.palette(name); if (p && typeof p.enemy === 'string') return p.enemy; } catch (e) { /* fall through */ }
    return FALLBACK;
  }
  // opts: {reduced: bool, palette: name}. reduced => static style (no pulse).
  function forVolley(pattern, tier, isBoss, opts) {
    const o = opts && typeof opts === 'object' ? opts : {};
    const reduced = o.reduced === true;
    const windup = windupFor(tier, isBoss);
    return {
      shape: shapeFor(pattern),
      windup,
      active: windup > 0,
      color: colorFor(o.palette),
      pulse: !reduced && windup > 0,
      style: reduced ? 'static' : 'pulse',
      alpha: reduced ? 0.5 : 0.7,
      reduced
    };
  }
  return { WINDUP_T3, WINDUP_BOSS, forVolley, shapeFor, windupFor };
});
