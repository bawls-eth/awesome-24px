# MMPixelize: interim 8-bit bake for existing sprites

Owner feedback (2026-11-23): "All assets in the entire game need rework. The animals in the Town look really bad. We want a nice 8-bit feel."
The real remade art is queued with Codex. Until it lands, `game/shared/mm-pixelize.js` turns any existing sprite source
(flora/fauna SVG, PNG strip frame, canvas) into a clean 8-bit sprite **once at load**, cached, never per frame.

- Module: `game/shared/mm-pixelize.js` (global `MMPixelize` in the browser, `module.exports` in node). No network, no randomness, no clock in the pixel ops.
- Review page (not linked from the game): `game/tools/pixelize/index.html` - all 98 registry species plus the Town villager strips
  (mooncats, tulips, rocks, punkrocks, boredapes), before/after at 1x and 3x on a dark background, with sliders for outline,
  colours, highlight, shade and dither, and a `show=<category>` filter. URL params (`?outline=0.8&colors=6`) override the defaults.
- Screenshots: `game/design/pixelize/01-mammals.png`, `02-birds.png`, `03-insects-small.png`, `04-town-villagers.png`.
- Tests: `game/tests/shared-mm-pixelize.test.js` (node, golden hashes on a synthetic sprite) and `game/tests/pixelize-page.test.js` (browser).

## Pipeline (all pure functions on `{ w, h, data: Uint8ClampedArray RGBA }`)
1. Crop to the opaque bounds, fit inside `size - 2*pad` keeping aspect, feet on the baseline.
2. `areaDownscale` - alpha-premultiplied box filter with exact fractional footprints (no dark fringes). Sources already at or below the target (24 px strip frames) are kept 1:1.
3. `alphaThreshold` - hard edges, alpha is only 0 or 255.
4. `saturate` small boost, then `medianCut` palette (deterministic) or a fixed `ramp`, `quantise` with optional 2x2 Bayer `dither`.
5. `lightPass` - top-left edge highlight (warm white) and bottom-right edge shade: a cheap 3-tone volume read on flat vector fills.
6. `outline` - 1 px colour-matched dark outline (darkest neighbour colour darkened and pulled toward a cool ink, never pure black).
7. Final colour cap: S16 12 colours, M32 16, L48/XL64 `maxColors` (18).

## Defaults (`MMPixelize.DEFAULTS`)
| key | default | meaning |
|---|---|---|
| size | 32 | native output size (square) |
| pad | 1 | border kept for the outline |
| alpha | 80 | alpha threshold (low enough to keep thin legs/antennae) |
| colors | 7 | median-cut body colours before light/outline passes |
| maxColors | 18 | final cap (scaled down for small sizes, see above) |
| ramp | null | fixed palette (array of `#rrggbb`), e.g. `MM8.PAL` once `mm-8bit.js` (branch `mg-8bit-a`) is merged |
| dither | 0 | 0..1 ordered 2-tone dither |
| outline | 0.72 | outline darkness |
| highlight | 0.22 | top-left highlight |
| shade | 0.18 | bottom-right shade |
| saturate | 0.12 | saturation boost |

Size classes: `MMPixelize.SIZE_CLASSES = { S16: 16, M32: 32, L48: 48, XL64: 64 }`; `MMPixelize.sizeClassFor(species)` uses
`species-registry.json` fields: microscopic and size_cm <= 4 -> S16, <= 60 cm -> M32, <= 250 cm -> L48, larger and trees -> XL64.

## API
```js
const ent = MMPixelize.bake(imageOrCanvas, { size: 32 });              // sync, cached by src + options (or opts.key)
const ent2 = MMPixelize.bake({ image, sx, sy, sw, sh }, { size: 26 });  // one strip frame
MMPixelize.loadAndBake('assets/flora-fauna/svg/fox.svg', { size: 28 }).then((ent) => ...);
// ent = { canvas, w, h, palette: ['#rrggbb'...], colors, data, key, ms }
MMPixelize.draw(ctx2d, ent, x, y, 3);   // integer-scaled, imageSmoothingEnabled = false
MMPixelize.enabled();                   // false when the page URL has ?pixelize=0
MMPixelize.counters();                  // { bakes, hits, ms } for perf checks
```
Pure helpers for node/tests: `areaDownscale, alphaThreshold, medianCut, quantise, lightPass, outline, saturate, pixelize, stats, hash`.

## Town adoption (for the `town-8bit` owner; main.js / index.html are not touched by this branch)
The Town already runs Phaser with `pixelArt: true` (nearest filtering), so a baked canvas texture stays crisp.
Bake each species at **half its current display size** and draw it at exactly 2x, so layout and hit areas do not change:

1. `index.html`: add `<script src="shared/mm-pixelize.js?v=20261123a"></script>` next to the other `shared/` scripts.
2. In `create()`, before the specimens are spawned (after `preload` finished loading the `ff_<id>` SVGs):
```js
if (window.MMPixelize && MMPixelize.enabled()) FF_ASSETS.forEach((a) => {          // ?pixelize=0 keeps the old art
  const px = Math.max(8, Math.round(Math.max(14, a.w, a.h) / 2));                     // native size, drawn at exactly 2x
  const ent = MMPixelize.bake(this.textures.get(`ff_${a.id}`).getSourceImage(), { size: px, key: 'ff_' + a.id + '@' + px });
  this.textures.addCanvas(`ffpx_${a.id}`, ent.canvas); });
```
3. In `addFloraFaunaSpecimen`, pick the key: `const key = this.textures.exists(\`ffpx_${a.id}\`) ? \`ffpx_${a.id}\` : \`ff_${a.id}\`;` and use it in `this.add.image(s.x, s.y, key)`. `setDisplaySize(size, size)` stays (it is 2x native, +-1 px).

Adopting per species id: wrap step 2 with a set, e.g. `const PX = new Set(['fox','deer','bird', ...])` and skip ids not in it, so species can be switched over one at a time; species that already have Codex remakes should skip the bake. The same recipe works for villager strips: `bake({ image, sx: i*24, sy: 0, sw: 24, sh: 24 }, { size: 26 })` per frame, then `textures.addSpriteSheet` from a canvas that packs the baked frames (bake at load, once).

Saves are not touched (no new keys). The off-switch is `?pixelize=0`.

## Performance
- One bake of a 32 px sprite from a 128 px raster costs ~0.2-2 ms; all 98 species + 25 villager frames bake in ~250-450 ms total on this machine (the browser test budget is 2 s, scaled by the machine load average, capped at 5x).
- Everything happens once at load and is cached by key; `bake` on the same key returns the same object (`counters().hits`). Never call it from `update()`.
- SVG sources are rasterised at `min(256, 4 * size)` before the area average. The output canvas is tiny (16-64 px), so GPU memory grows by well under 1 MB for the whole registry.
- No Phaser Graphics are involved; the Town draws plain images from canvas textures.

## Limits (why this is interim)
It cleans edges, palette and outline, but it cannot invent detail: very thin parts below one native pixel vanish, faces drawn as
flat dots stay simple, and S16 species are tiny by nature. The real fix is the Codex remake against `ART-QUALITY-BAR.md`.
