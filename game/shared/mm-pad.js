// MMPad: pure gamepad mapping (standard mapping). No DOM access.
// read(pad) -> {move:{x,y}, aim:{x,y,on}, fire, ability:[4 bools], pause}
// Radial dead zone 0.22, rescaled so output ramps from 0 to 1. Right stick fires past 0.5 (or RT).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMPad = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const DEAD = 0.22, FIRE_AT = 0.5;

  function stick(x, y) {
    x = +x || 0; y = +y || 0;
    const m = Math.hypot(x, y);
    if (m <= DEAD) return { x: 0, y: 0, mag: 0 };
    const out = Math.min(1, (m - DEAD) / (1 - DEAD));
    return { x: (x / m) * out, y: (y / m) * out, mag: out };
  }
  function down(b) { return !!b && (b.pressed === true || (+b.value || 0) > 0.5); }

  function read(pad) {
    const a = (pad && pad.axes) || [], b = (pad && pad.buttons) || [];
    const l = stick(a[0], a[1]);
    const rRaw = Math.hypot(+a[2] || 0, +a[3] || 0);
    const r = stick(a[2], a[3]);
    return {
      move: { x: l.x, y: l.y },
      aim: { x: r.x, y: r.y, on: r.mag > 0 },
      fire: rRaw > FIRE_AT || down(b[7]),
      // A or RB, B or LB, X, Y
      ability: [down(b[0]) || down(b[5]), down(b[1]) || down(b[4]), down(b[2]), down(b[3])],
      pause: down(b[9]),
    };
  }
  return { read, DEAD, FIRE_AT };
});
