// MMPixelIcons (cycle 0 art, b12-r2-11): code-drawn 16x16 pixel icons for the Hub cards and the map's games strip, replacing the
// emoji glyphs (which render differently on every OS and clash with the 8-bit UI). Original art, drawn here as letter maps in one
// shared palette (PICO-8-like, the same family as mm-8bit.js and the M08 minigame UI), lit from the top-left, with a 1 px
// colour-matched dark outline added by code around every shape (ART-QUALITY-BAR: dark outline, not pure black).
// API: MMPixelIcons.has(id), .ids(), .pixels(id) -> {w,h,data: Uint8ClampedArray RGBA} (pure, Node-safe),
//      .canvas(id, cssPx) -> <canvas class="px-ico"> (browser), .apply(span, id, cssPx, fallbackText) -> true when a pixel icon was
//      placed. apply() keeps the old emoji in a hidden <span class="px-fb"> so the icon text never disappears if the canvas fails.
// Writes nothing, no network.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMPixelIcons = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const PAL = {
    w: '#fff1e8', y: '#ffec27', o: '#ffa300', r: '#ff004d', R: '#a8263a', g: '#00e436', G: '#008751', b: '#29adff', B: '#1d5fa8',
    c: '#9fe6ff', n: '#ab5236', N: '#6b3a22', t: '#e8b98a', s: '#c2c3c7', S: '#83769c', d: '#5f574f', p: '#ff77a8', P: '#a4457a', v: '#7e2553'
  };
  // 16 rows x 16 cols; '.' = empty. The outline pass fills empty pixels next to a shape, so shapes keep a 1 px margin.
  const ICONS = {
    town: [
      '................', '.......rr.......', '......rrrr......', '.....rrRRrr.....', '....rrRRRRrr....', '...rrRRRRRRrr...', '..rrrrrrrrrrrr..', '...wtttttttttt..',
      '...tccttttcctt..', '...tcBttttcBtt..', '...tttnnnttttt..', '...tttnynttttt..', '...tttnnnttttt..', '..GGGGnnnGGGGG..', '................', '................'],
    realm: [
      '................', '.............ww.', '............wws.', '...........wws..', '..........wws...', '.........wws....', '........wws.....', '...yy..wws......',
      '....yywws.......', '.....yys........', '.....nyy........', '....nn.yy.......', '...nn...........', '..yn............', '..y.............', '................'],
    isles: [
      '................', '...GGg...gGG....', '..GggggGggggG...', '.Gg...gnn...gG..', '.......nn.......', '........n.......', '........n.......', '........nn......',
      '.........n......', '.......ttttt....', '....ttttwtttt...', '..bbbbbbbbbbbbb.', '.bcbbbbbcbbbbbb.', '..bbBbbbbbbBbb..', '................', '................'],
    lantern: [
      '................', '.......NN.......', '......N..N......', '.....NNNNNN.....', '....NoooooN.....', '....NoyyyoN.....', '....NoywyoN.....', '....NoywyoN.....',
      '....NoyyyoN.....', '....NoooooN.....', '.....NNNNNN.....', '.......N........', '................', '................', '................', '................'],
    pop: [
      '................', '..pppppp........', '..pwppppP.......', '..ppppppP.......', '..ppppppP.......', '..ppppppP.......', '..pPPPPPP.......', '................',
      '.......bbbbbb...', '.......bcbbbbB..', '.......bbbbbbB..', '.......bbbbbbB..', '.......bbbbbbB..', '.......bBBBBBB..', '................', '................'],
    dash: [
      '.......y........', '......yoy.......', '......yoy.......', '.......o........', '.......d........', '.....wwwww......', '.....wwwws......', '.....wwwws......',
      '.....wwwws......', '.....wwwws......', '.....wwwws......', '.....wwwws......', '...nnnnnnnnn....', '....NNNNNNN.....', '................', '................'],
    stack: [
      '................', '......rrrr......', '......rwrR......', '......rRRR......', '....bbbbbbbb....', '....bcbbbbbB....', '....bBBBBBBB....', '...gggggggggg...',
      '...gwggggggGG...', '...gGGGGGGGGG...', '..yyyyyyyyyyyy..', '..ywyyyyyyyyoo..', '..yooooooooooo..', '................', '................', '................'],
    echo: [
      '................', '....p.p.p.......', '....ppppp.......', '....pwppP.......', '....ppppP.......', '.....PPP........', '.......G........', '...gg..G..gg....',
      '....gg.G.gg.....', '......gGg.......', '.......G........', '.......G........', '................', '................', '................', '................'],
    jam: [
      '................', '...........dd...', '..........dd....', '.........dd.....', '........dd......', '.......nd.......', '...ooo.n........', '..ooooon........',
      '..oonnooo.......', '..ooNNooo.......', '...ooooo........', '...oooooo.......', '....oooo........', '................', '................', '................'],
    angler: [
      '................', '................', '................', '................', '....bbbbb.....b.', '...bwbbbbb...bb.', '..bbBbbbbbbbbb..', '..bbbbbbbbbbbbb.',
      '...bbbbbbbb..bb.', '....BBBBB.....B.', '................', '................', '................', '................', '................', '................'],
    bugs: [
      '................', '..ppp.....ppp...', '.ppwpp...ppwpp..', '.pppppp.pppppp..', '.ppppppdpppppp..', '..pppppdppppp...', '....ppdddpp.....', '...ooo.d.ooo....',
      '..ooooo.ooooo...', '..oooo...oooo...', '...oo.....oo....', '................', '................', '................', '................', '................'],
    stalk: [
      '................', '......g.g.......', '.....gGgGg......', '......gGg.......', '.....wwwww......', '....wwwwwww.....', '...wwwwwwwss....', '...wwwwwwwss....',
      '...ppwwwwwss....', '....ppppppp.....', '.....ppppp......', '.......p........', '................', '................', '................', '................'],
    deepdelve: [
      '................', '...sssss........', '..ssswwsss......', '.ss....nNss.....', '.s....nn..ss....', '.....nn....s....', '....nn..........', '...nn...........',
      '..nn............', '.nn.............', '................', '................', '................', '................', '................', '................'],
    house: [ // cycle 2 art (G): Town world-label icon
      '................', '.......rr.......', '......rrRr......', '.....rrRRRr.....', '....rrRRRRRr....', '...rrrrrrrrrr...', '....wttttttt....', '....tcBttnnt....', '....tccttnnt....', '....tttttnyt....', '....tttttnnt....', '...GGGGGGGGGG...', '................', '................', '................', '................'],
    museum: [ // cycle 2 art (G): Town world-label icon
      '................', '.......ss.......', '.....sswwss.....', '...sswwwwwwss...', '..ssssssssssss..', '...ws.ws.ws.ws..', '...ws.ws.ws.ws..', '...ws.ws.ws.ws..', '...ws.ws.ws.ws..', '...ws.ws.ws.ws..', '...ws.ws.ws.ws..', '..ssssssssssss..', '.dddddddddddddd.', '................', '................', '................'],
    mail: [ // cycle 2 art (G): Town world-label icon
      '................', '................', '..wwwwwwwwwwww..', '..wSwwwwwwwwSw..', '..wwSwwwwwwSww..', '..wwwSwwwwSwww..', '..wwwwSwwSwwww..', '..wwwwwSSwwwww..', '..wwwwwrrwwwww..', '..wwwwwwwwwwww..', '..ssssssssssss..', '................', '................', '................', '................', '................'],
    hammer: [ // cycle 2 art (G): Town world-label icon
      '................', '................', '...ssssss.......', '...swwsssS......', '...sssssSS......', '......nN........', '......nN........', '.......nN.......', '.......nN.......', '........nN......', '........nN......', '.........nN.....', '.........NN.....', '................', '................', '................'],
    book: [ // cycle 2 art (G): Town world-label icon
      '................', '................', '....rrrrrrrrr...', '...Rrrrrrrrrr...', '...Rryyyyyyrr...', '...Rrrrrrrrrr...', '...Rrrrrrrrrr...', '...Rrrrrrrrrr...', '...Rrrrrrrrrr...', '...Rrrrrrrrrr...', '...Rwwwwwwwww...', '....RRRRRRRRR...', '................', '................', '................', '................'],
    turnip: [ // cycle 2 art (G): Town world-label icon
      '................', '......g..g......', '.....gGggGg.....', '.......gG.......', '.....PppppP.....', '....PpwppppP....', '....pwwwwwwp....', '....wwwwwwws....', '....wwwwwwws....', '.....wwwwss.....', '......wws.......', '.......s........', '................', '................', '................', '................'],
  };
  const SIZE = 16;
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const cache = {};
  function has(id) { return Object.prototype.hasOwnProperty.call(ICONS, id); }
  function ids() { return Object.keys(ICONS); }
  // RGBA pixels: the letter map, then a colour-matched outline (the darkest 4-neighbour fill colour at 40%) on every empty pixel
  // that touches the shape (8-neighbourhood, so diagonal strokes get a closed outline too).
  function pixels(id) {
    if (!has(id)) return null;
    if (cache[id]) return cache[id];
    const rows = ICONS[id], data = new Uint8ClampedArray(SIZE * SIZE * 4), fill = [];
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const ch = (rows[y] || '')[x] || '.';
      fill.push(PAL[ch] ? hex(PAL[ch]) : null);
    }
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const i = y * SIZE + x, o = i * 4;
      let c = fill[i], a = 255;
      if (!c) {
        let best = null;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const X = x + dx, Y = y + dy;
          if ((dx || dy) && X >= 0 && Y >= 0 && X < SIZE && Y < SIZE) { const f = fill[Y * SIZE + X]; if (f && (!best || f[0] + f[1] + f[2] < best[0] + best[1] + best[2])) best = f; }
        }
        if (best) c = [Math.round(best[0] * 0.28 + 8), Math.round(best[1] * 0.28 + 6), Math.round(best[2] * 0.28 + 14)]; else a = 0;
      }
      if (c) { data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; }
      data[o + 3] = a;
    }
    cache[id] = { w: SIZE, h: SIZE, data };
    return cache[id];
  }
  function canvas(id, cssPx) {
    const px = pixels(id);
    if (!px || typeof document === 'undefined') return null;
    const cv = document.createElement('canvas');
    cv.width = SIZE; cv.height = SIZE;
    const c = cv.getContext && cv.getContext('2d');
    if (!c || typeof ImageData === 'undefined') return null;
    c.putImageData(new ImageData(new Uint8ClampedArray(px.data), SIZE, SIZE), 0, 0);
    const s = (Math.max(1, Math.round((cssPx || 32) / SIZE)) * SIZE) + 'px'; // integer scale only: crisp pixels
    cv.className = 'px-ico'; cv.dataset.icon = id;
    cv.style.width = s; cv.style.height = s; cv.style.imageRendering = 'pixelated'; cv.style.verticalAlign = 'middle';
    cv.setAttribute('aria-hidden', 'true');
    return cv;
  }
  function apply(span, id, cssPx, fallbackText) {
    if (!span) return false;
    let cv = null;
    try { cv = canvas(id, cssPx); } catch (e) { cv = null; }
    if (!cv) { if (fallbackText !== undefined) span.textContent = fallbackText; return false; }
    while (span.firstChild) span.removeChild(span.firstChild);
    span.appendChild(cv);
    if (fallbackText) { const fb = document.createElement('span'); fb.className = 'px-fb'; fb.hidden = true; fb.textContent = fallbackText; span.appendChild(fb); }
    span.dataset.pixel = id;
    return true;
  }
  return { PAL, ICONS, SIZE, has, ids, pixels, canvas, apply };
});
