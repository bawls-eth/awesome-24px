# Art intake + wiring bug bash (lane art, branch bb-art), 2026-11-23

## Intake (4 new Codex branches since the last review)
| branch | what | grade | status |
|---|---|---|---|
| `codex/b40c-rimewolf-scale-revision` | 14 rimewolf strips redrawn in place, ~35 native px standing, brighter ruff | C+ | merged; already wired by id (`mm-creature-strips.js`, same cells / anchor) |
| `codex/rear-saddle-cantles` | `stegolith_saddle_{idle,move}_up`, `skimray_saddle_{idle,move}_up` drawn from behind | B | merged; already wired by id |
| `codex/b19-weapon-slot` | `ui_slot_weapon` own glyph (was byte-identical to `ui_stat_power`) | B | merged; realm.js loads it by id |
| `codex/b12-props-quality-redraw` | all 30 b12 props redrawn at 2x cells (64/128 px), shaded, contact shadows | B- | merged, **staged as `b12r-props-quality-redraw`** (INDEX `display_scale: 0.5`); `b12` keeps its delivered files |

No m01-m08 / R / T branches exist yet on origin.

## Fixed in lane
1. Regression avoided: the b12 redraw doubles every cell and anchor in place. `realm-world.js` draws manifest cells 1:1 and
   rejects cells over 128 px, so taking it in place would draw every overworld tree / rock / flower at twice its footprint (and
   drop nothing, since tree_large is exactly 128). Staged in its own folder; old b12 art stays live. Contact sheets compared.
2. `tools/art-audit/contact.py`: intake contact sheets (3x, dark #181820 + grey #808080, b04 puffcap reference, `--before REV` row,
   `--native-div` for 4x strips / 2x props).
3. `tools/art-audit/run.js`: new nit checks `outline`, `contrast`, `face` (smiley mascot) + faster sampling on 4x strips.
4. `shared/mm-mini-art.js`: m01-m08 loader by id with procedural 8-bit fallbacks (ready for the minigame lanes to call).

## Elsewhere (not my lane): exact hunk for the realm lane, `game/games/mad-maze/realm-world.js`
Severity: medium (visual upgrade blocked, no bug today). Repro: none until wired; with it, `?props=classic` must still show b12.
```js
// ~line 381: accept the b12r folder and read its INDEX display_scale
-          if (!/^(b1[2345]|b2[26])-[a-z0-9-]{1,48}$/.test(id)) return null;
+          if (!/^(b1[2345]|b12r|b2[26])-[a-z0-9-]{1,48}$/.test(id)) return null;
+          if (id.indexOf('b12r-') === 0 && PROPS_CLASSIC) return null;
+          const ds = Number(b.display_scale) > 0 && Number(b.display_scale) <= 1 ? Number(b.display_scale) : 1;
// ~line 388: allow 2x cells when they are drawn at half size
-              if (!frames || !(fw >= 8 && fw <= 128) || !(fh >= 8 && fh <= 128)) return null;
+              if (!frames || !(fw >= 8 && fw * ds <= 128) || !(fh >= 8 && fh * ds <= 128)) return null;
// ~line 393: store the draw size; a b12r image wins over the b12 one whatever order they load in
-                img.onload = () => { if (img.naturalWidth === fw * frames && img.naturalHeight === fh) { wArt[a.id] = { img, frames, fw, fh, fps: ..., ax, ay }; got++; } res(); };
+                img.onload = () => { if (img.naturalWidth === fw * frames && img.naturalHeight === fh && !(ds === 1 && wArt[a.id] && wArt[a.id].ds < 1)) { wArt[a.id] = { img, frames, fw, fh, fps: ..., ax: ax * ds, ay: ay * ds, dw: fw * ds, dh: fh * ds, ds }; got++; } res(); };
// lines 303 / 308 / 368: destination size
-  ..., a.fw, a.fh);            // last two drawImage args
+  ..., a.dw || a.fw, a.dh || a.fh);
```
Keep `imageSmoothingEnabled = false` on the chunk canvas (it already is). Downscaling 2x art by half drops every other art pixel, so if the
half-size props look noisy, the alternative is to keep the larger footprint (ds 1, trees twice as tall) and raise the 128 px cap; the owner
asked for "2x density trees" in R03, so either is defensible. Test idea: world-art.test.js asserts `wArt.prop_tree_small.dw === 32`.
`dimOf()` (line ~220) copies `fw/fh/ax/ay` into its dimmed canvas; it needs `dw/dh` copied too.

## Open (Codex redo, posted on TEAM-BOARD.md)
- b12r `prop_rock_big`, `prop_boulder_cluster`: art ends at row 107, anchor.y 124 (17 px float at 2x) - needs-redo.
- b12r `prop_ice_spike` byte-identical to `prop_crystal_blue` (was distinct in b12).
- b12r `prop_tree_large`, `prop_rock_big`, `prop_boulder_cluster` are 1x art doubled (2x2 blocks) while the rest is true 2x detail: mixed pixel scale.
- b12r `prop_mushroom_ring` reads as pink flowers; `prop_skeleton_bones` is two bones (spec: ribcage + skull); `prop_coral` and `prop_cactus` share one branch shape.
- b40c rimewolf down view is still a box with a face (art-audit `face` flags the down strips); far from the concept sheet.
