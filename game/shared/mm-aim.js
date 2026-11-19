// MMAim: touch aim assist. assist(aimAngle, player, targets, opts) -> angle (radians).
// Snaps to the nearest target within 14 degrees of aimAngle and 9 tiles of the player.
// opts: {enabled (default true), tile (px, default 40), cone (deg, default 14), range (tiles, default 9)}
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMAim = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  function assist(aimAngle, player, targets, opts) {
    opts = opts || {};
    if (opts.enabled === false || !player || !targets || !targets.length) return aimAngle;
    const tile = opts.tile > 0 ? opts.tile : 40;
    const maxD = (opts.range > 0 ? opts.range : 9) * tile;
    const cone = ((opts.cone > 0 ? opts.cone : 14) * Math.PI) / 180;
    let best = aimAngle, bestD = Infinity;
    for (let i = 0; i < targets.length; i++) {
      const dx = targets[i].x - player.x, dy = targets[i].y - player.y;
      const d = Math.hypot(dx, dy);
      if (d > maxD || d === 0) continue;
      const ang = Math.atan2(dy, dx);
      let diff = Math.abs(ang - aimAngle) % (2 * Math.PI);
      if (diff > Math.PI) diff = 2 * Math.PI - diff;
      if (diff <= cone && d < bestD) { bestD = d; best = ang; }
    }
    return best;
  }
  return { assist };
});
