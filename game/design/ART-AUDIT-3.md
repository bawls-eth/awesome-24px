# Art audit 3 (2026-11-22, Claude, branch art-audit-3)

Scope: every batch in `game/assets/arcane/INDEX.json` (64 batches, 2531 assets, b40b frostfox + b40c rimewolf included) plus phone
screenshots (390x844) of Town, Realm, Hearth Isle (meadow), Jungle, Reef, Tundra, Hub, Angler, Jam, Stalk Market, Deepdelve and Bug Safari.

Tool: `node game/tools/art-audit/run.js [--json out.json]` (node, no network, no deps; about 25 s). Per asset it checks: file exists,
PNG size fits frames x frame_w by frame_h, transparent background (corners), empty frames, lowest opaque row vs anchor.y and baseline drift
across idle/move frames, palette (distinct colours, soft-alpha share), byte-identical duplicates, and "registered but not referenced by code".
Guarded by `game/tests/art-audit-tool.test.js` (no blockers allowed).

## Summary

| Severity | Count | What |
|---|---|---|
| blocker | 0 | every registered PNG exists and fits its manifest |
| needs-redo | 2 | found by eye (below); the tool itself reports 0 |
| nit | 350 (tool) + 4 (eye) | palette budget, small anchor offsets, duplicates, unused registrations |

Console: 0 page errors and 0 PNG 404s on all 12 pages. No sprite fell back to a code block in the views checked.

## Needs-redo (art side)

| # | id(s) | size | view | problem |
|---|---|---|---|---|
| R1 | `rimewolf_*` (b40c, 14 strips) | S 48 native (192 cell) | all | Reads too small and too dark at phone scale: idle_down body spans 26 px of 48 vs frostfox 30 and pengling 33, so the hostile wolf looks smaller than the neutral fox. Redraw ~15% larger (34-36 px standing, same feet 96,171) and lift the ruff / eye highlight one step lighter so it separates from the dark coat on snow. |
| R2 | `stegolith_saddle_{idle,move}_up`, `skimray_saddle_{idle,move}_up` | XL 128 / L 96 | up (back) | Byte-identical to the `_down` overlay. The up view must show the saddle from behind (cantle toward camera, no front horn/pommel). |

## Nits (art side, batch them with the next redo)

| id(s) | problem |
|---|---|
| i01 items-v2, all 58 icons | 162-588 distinct colours per 32 px icon (budget ~32-48). They look crisp, but the shading is much richer than b19 / b34b icons beside them; quantise to the shared palette on the next pass. |
| `giant_spider_queen_*`, `crab_giant_*`, `wind_sprite_*` (b24, 27 strips) | Lowest opaque row 203 vs anchor.y 231 (7 native px above the feet anchor). Fine for wind_sprite (floats); spider queen and crab giant hover. Either lower the art or set anchor.y 203 in the manifest. |
| `ui_slot_weapon` (b19) | Byte-identical to `ui_stat_power`. Needs its own glyph (sword silhouette slot). |
| `mm_player` (b28) | Art touches the bottom cell corners (no 1 px padding); edges clip when scaled with smoothing. |
| `frostfox_death_*` / `rimewolf_death_*` | Collapse is weak (the body squashes but never lies down). Optional polish: last 2 frames lying on the side. |
| b40b/b40c preview.png | Preview labels are offset by one column in row 2 ("up death" shows the right idle). Fix the contact-sheet generator labels. |

## Registered but not referenced by code (nit; verify before deleting nothing - we never remove assets)

MMArt.loadAll reads every INDEX batch at runtime and looks strips up by name, so most batches have no folder literal in code. The tool
counts an asset as used when its id, its creature / enemy / class / terrain name, an id prefix, or a quoted dynamic prefix (`'bolt_'`)
is in game code. Still unmatched (259):
- items: i01 18, b07w 11, b08h 26, b09 4, b09a 19, b09c 22, b09m 14, b10r 9, b22 75 (icons for items not yet in any loot / shop table)
- world: b13 16 props (campfire f1-f4, statues, bridges, gate, chests, altar, lantern post, market stall, anvil), b12 2, b15 1, b28 9 world-map icons, b27 2 (logo, title tile)
- fx: b18 11 (`fx_thorn_bloom`, `fx_teleport`, `fx_stun_stars`, ...)
- bosses: b23 20 (`*_attack_a/b_down` for lich_king, hydra, treant_elder, sand_titan, frost_dragon, shadow_hydra, clockwork_golem, void_maw); MMArt picks attack_a/b generically, so these are probably used: verify in a Realm boss fight.
These are code-side wiring opportunities (Claude), not art redo asks.

## Screenshot read (390x844)

- Town (name screen) and Hub: art reads fine; the villager picker sprites and the Hub map are crisp.
- Realm: hero and enemies at scale, no clipping, no fallback blocks.
- Isles (meadow, jungle, reef, tundra): creature strips read well; pengling / frostfox / rimewolf stand on the snow correctly with shadows. The isle ground is still large flat colour fields at phone zoom (no texture / edge detail outside the b35 meadow edges) - an art ask for tundra / reef / jungle ground detail tiles (see TEAM-BOARD).
- Minigames (Angler, Jam, Stalk, Bug Safari, Deepdelve): almost no sprite art. Angler draws a code pond and a stick angler, Jam is a text menu, Stalk shows one turnip glyph, Bug Safari is a grid of text cards, Deepdelve is code-drawn voxel blocks. This is the gap the m01-m08 batches in `CODEX-MINIGAME-ART-ASKS.md` fill.
- `game/games/arcane-frontier/` (legacy prototype) links a `style.css` that does not exist and loads Phaser from a CDN; it renders unstyled. Not linked from the Hub; left as is (not an art problem).

## Code-side fixes made in this audit

- b40b frostfox and b40c rimewolf wired by id in `game/shared/mm-creature-strips.js` (tundra preloads 3 species / 42 strips; code bake stays the fallback; the aurora frostfox stays the code palette swap).
- No wrong anchors or missing refs found in wired code: every strip the isles / realm pages request loaded (0 PNG 404s).
