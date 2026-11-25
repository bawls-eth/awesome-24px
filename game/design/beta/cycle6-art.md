# Cycle 6 - G Graphics + Pixel Art

Branch `cyc6-art` (worktree), cut from 503ae8b. Port 9603. Not pushed. All browser runs through /tmp/bt.sh; Realm/Isles pages run with
WebSockets closed / blockDb (0 DB requests asserted in the Isles test), no chat.

## 1. Realm hit feedback (b08 r3 "tinted ground with leftover red dots", hit flash magenta over water) - 41f4d39
What changed (`game/realm.js`):
- Hit vignette: was a radial `rgba(255,40,80)` 0..0.55 whose clear centre was 0.3 x the SHORT side, so on a 390x844 phone most of the
  ground went red/purple while hits kept coming (b08-r3-05 shows exactly that). Now the palette red #e8643c, 0.42 alpha on the edge
  midpoints (0.55 in the corners), in a unit ellipse stretched to the view (clear inside r 0.66), baked once (`_drawHitFlash`). The
  ground under the hero is untouched. Reduced motion and `flashes: false` behave as before.
- Enemy bullets: slower than 190 px/s (ring 135-150, spiral 140-150) draw a 2-dot motion trail (own sprite scaled down, 6 and 11 px
  behind, alpha 0.55/0.3, skipped on the low-graphics tier); the code bullet sprite gets a white core r 2.6 inside a tint ring; slow
  bolt-art bullets get the same white core laid over the art. Fast aimed shots (225-235) stay round.
- `?hitfx=0` restores the old look (A/B and the detector check).
Check run: new `game/tests/cyc6-art-realm-hit-cue.test.js` (registered, full tier): 17/17 PASS at 1280x720 and 390x844 (edge visible,
centre and 30% height unchanged, over water the estimated flash colour is warm with G >= B, slow bullet length >= 1.5x width, >= 12
logical px of near-white core, fast bullet round, flashes off paints nothing, no page errors, and a detector check that `?hitfx=0`
fails the colour/ground checks). Against HEAD's realm.js the same test FAILS 9 checks (run, then restored). Neighbours re-run: 
telegraph-arena, bolt-art, arena-p2-hotpath, realm-settings all PASS.
Screenshots: `img/cyc6-art-hitcue-after-1280x720.jpg`, `-after-390x844.jpg`, `-before-390x844.jpg` (same frame, `?hitfx=0`).

## 2. Codex branch review - c1b571b
`git fetch origin`: one new commit, `codex/b03-glacier-shellback` 83e4d6e (v2). Reviewed numerically (own decoder: frame counts,
anchor, baseline 231 in all 60 frames, hard alpha, exact 4x grid, 11-13 colours) and visually (contact sheet
`img/cyc6-art-codex-shellback-v2.jpg`). Verdict REDO, NOT merged: the right view's head is now a profile but the BODY is still the front
view (symmetric tall dome, four legs in a row); the death goes standing -> lying in one step and the lying frames read as a vertical
squash. Specific redraw spec (bbox targets, 5 death beats, alternating near/far legs, lunge) written to CODEX-REMAKE-QUEUE.md
"UPDATE 2026-11-25 (cycle 6)". art-audit run.js not run on it (it would need the unaccepted art staged into INDEX.json).

## 3. Code-drawn terrain gap: tundra ice holes - dd6bca4
Survey of Frostfang Tundra and the jungle start at 1280x720: the clearest remaining tundra gap was the water inside ice (frozen-lake
holes, the ice-shelf coast): flat navy blocks with a dashed rim, made worse by the cycle-4 seam pass pushing navy bumps into the ice.
`MMIsleArt.biomeDetail` (opts.biomes.holes, passed by the Isles page with tundra detail; `?icehole=0` = off) now draws an ice ledge on
the water side of each ice/snow edge (lit #eef6ff row, pale lip 1-3 art px with a seeded jagged under-edge, dark under-ice shadow),
ripple glints and occasional floating ice chips, and skips water-coloured bumps into ice. Jungle water untouched. Bake time only
(cyc4 cost check: 1.07 ms/chunk, 0 per-frame calls).
Check run: new `game/tests/cyc6-art-isles-ice-hole.test.js` (registered, full tier): 9/9 PASS; against HEAD's mm-isle-art.js +
isles.js it FAILS 6 (run, then restored). Re-run: cyc4-art-isles-biome-ground, cyc0-art-isle-detail, cyc2-art-isles-field,
isle-art-bake, shared-mm-isle-art all PASS.
Screenshots: `img/cyc6-art-icehole-{before,after}-{1280x720,390x844}.jpg`.

## Unresolved
- Jungle small creatures (W-06 heights 46/46/52 -> 36-40) need a Codex redraw; not attempted in code (non-integer rescale breaks the
  pixel grid). Frozen road (flat grey with specks) and tundra moss could take more code detail next cycle.
- 195x422 not screenshotted for these items (the flash ellipse scales with the view; not verified there).
- The "red dots" in b08-r3-05 are the Realm's pink bolt-art bullets (ring pattern); they now carry a trail and a core, but their hue is
  unchanged (bolt art from B17). A real human read of "still litter?" is the beta retest's call.

## Proposals
- Consider tinting the aimed (fast, red) bullet art slightly toward orange-red so all three enemy hues separate from red ground decor.
- Next cycle: frozen_road ruts / cobbles and tundra_moss lichen in biomeDetail; Glacier Shellback v3 review when Codex delivers.
