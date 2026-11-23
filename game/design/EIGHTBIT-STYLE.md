# 8-bit style for mini-games (MM8)

Files: `game/shared/mm-8bit.css` (CSS variables + `.px-btn .px-panel .px-card .px-badge .px-bar`) and `game/shared/mm-8bit.js` (`window.MM8`).
Load both, then style with the variables; `mm-8bit.js` adds `body.px8` and, with `?crt=1`, a subtle optional scanline (`html.px-crt`).

- **Palette**: 16 colours, `--px-0..--px-15` / `MM8.PAL` (black, navy, plum, green, brown, grey, silver, white, red, orange, yellow, lime, blue, lilac, pink, peach). Ink `#0b0d1a`, page bg `#12142a`. Use `MM8.nearest(hex)` to snap any other colour.
- **Shapes**: square corners or 1-2 px stepped notches (`MM8.px.box`), hard outlines (box-shadow rings, no blur), hard drop shadows offset by whole pixels.
- **Shading**: flat fills + 1 light/1 dark bevel (`MM8.px.bevel`); "gradients" only as stepped bands (`MM8.bands`) or checker dither (`MM8.dither`).
- **Canvas**: draw at a small logical size, `MM8.crisp(canvas, w, h)` (pixelated, integer CSS scale), round every coordinate, `imageSmoothingEnabled = false`.
- **Type**: local monospace stack (`--px-font`), bold, uppercase, letter-spacing, 2 px ink text-shadow. Canvas titles/scores: `MM8.text(ctx, str, x, y, scale, color, {align, shadow})` (5x7 bitmap font). Text >= 12 px.
- **Particles**: square 2-3 px, palette colours only, seeded rng: `MM8.particles(rng).burst(x, y, n, color)`; capped, and 4 max under low-gfx.
- **Prefs**: honour `--ui-scale`, `prefers-reduced-motion` / `html.reduce-motion` (`MM8.reducedMotion()`), low-gfx (`MM8.lowGfx()`, MMAccess prefs).
- **Targets**: every button >= 44x44 px with visible `:focus-visible` (yellow 3 px outline).

Do: limited palette, chunky 2-4 px outlines, stepped parallax hills/skylines, blinky "PRESS START" via `.px-blink` (stops under reduced motion).
Don't: `border-radius` blobs, `linear/radial-gradient` skies, blur `box-shadow`/`filter: blur`, network fonts or images, anti-aliased `arc()` sprites, scanlines on by default.
