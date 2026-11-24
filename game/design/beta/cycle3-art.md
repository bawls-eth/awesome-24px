# Cycle 3, G (Graphics + Pixel Art): notes

Branch `cyc3-art` (from `claude/animal-crossing-game-7z3roh` 031b83b), not pushed. Own server :9733. Every browser / node run went through
`/tmp/bt.sh`; Firebase blocked in every context (offlineStub + `db.attempts() === 0` for Town, blockDb elsewhere). Targeted tests only.
OpenAI spend this cycle: $0.00 (LEDGER-OPENAI.md unchanged).
Screenshots: `game/tests/shots/cyc3-art-shots.js <origin> <before|after|survey> <scene...>` -> `game/design/beta/img/cyc3-art-<scene>-<tag>-<d|p>.jpg`
(d = 1280x720, p = 390x844, all <= 150 KB). "before" uses each change's opt-out flag on the same server.

## 1. Codex branches
`git fetch origin` brought two new branches (2026-11-24 04:15 / 04:19 PST). Audited each on an isolated copy (INDEX with only that batch):
| Branch | Audit | Verdict |
|---|---|---|
| `codex/b03-icicle-bat` | 0 blocker, 0 needs-redo, 12 nit:unref | ACCEPTED, merged provisional (0d4d12b). Not wired: `shared-mm-creature-strips.test.js` pins `kindsFor('tundra')` = pengling,frostfox,rimewolf. |
| `codex/b03-glacier-shellback` | 0 blocker, 0 needs-redo, 12 nit:unref | REDO, not merged: `_right` is not a side view, death does not lie down, attack barely reads. |
Contact sheet next to b04 `puffcap_idle_down`: `img/cyc3-art-codex-b03-contact.jpg`. Verdicts posted on TEAM-BOARD.md and CODEX-REMAKE-QUEUE.md.
After the merge: full-repo audit 0 blocker; `art-integration` and `shared-mm-creature-strips` ALL PASSED (art-integration.test.js not edited).

## 2. Resolved, with the check that ran
| Item | Change | Verification |
|---|---|---|
| Remaining emoji world labels | 8 new original 16x16 MMPixelIcons (dice, joystick, grave, wheat, dress, pickaxe, cart, flask) + `bugs` reused; MAP in `TownScene.pixelWorldLabels` extended: Polyroll, Arcade District, Old Graveyard, Old Windmill, Able Sisters, Hole, Mystery Merchant (multi-line), BUG-OFF (multi-line), Professor Byte. Kept as glyphs: statue, Isles sign, mailbox count, the 4 🚪 portal doors (`beta-r4-doors` / `replay-doors` find them by `/^🚪/`). Multi-line signs keep the cycle-2 geometry (icon beside the text box) because `cyc2-art-town-label-icons` pins it. | `cyc3-art-town-label-icons` ALL PASSED (9 ids used, 19+ labels, 16x16 1x >= 80 px, gap 0-2, centred, pinned glyphs kept, phone same, `?worldicons=0` old labels, 0 errors, `db.attempts() === 0`). Reruns: `cyc2-art-town-label-icons`, `bugoff`, `town-hour-windows`, `beta-r4-doors`, `cyc0-art-hub-icons` ALL PASSED. Shots `town-arcade`, `town-west` before/after, `town-after`. |
| Realm enemy death dissolve | `_drawEnemyGhosts`: after the death strip's last frame, 0.3 s of 2x2 Bayer ordered-dither break-up + squash (12 % flatter, 8 % wider at the feet) instead of the whole-sprite alpha fade. One 256 px scratch canvas + 17 preset patterns. `?dissolve=0` = old fade. | `cyc3-art-death-dissolve` ALL PASSED: corpse 965 px -> mid 420 (all fully opaque) -> late 0; **0.571 ms per dissolving corpse per frame** (load factor 4.25, budget 3.0); still expires on time. Reruns `enemy-death-art`, `realm-lowgfx` ALL PASSED. Shots `dissolve` before/after. |
| Isles creature death dissolve | `drawDeaths`: the same dissolve over the 0.35 s hold on the last death frame (was: pop off). Reduced motion / `&dissolve=0` = old hold. Hooks `__isles.dissolve / deadPool / drawDeathsAt`. | `cyc3-art-isles-dissolve` ALL PASSED: levels 3,5,7,10,12,14 inside the hold only, slot frees, **0.45 ms per dissolving body per frame** (load ~3). Reruns `isle-creature-art`, `isle-reef-art` ALL PASSED. Shots `isles-dissolve` before/after. |
| Nexus plaza life | Walk view only: 2 torches play their 4 b13 frames + a flickering additive glow, 3 banners' cloth sways in 2 px row bands (crossbar / pole fixed, <= 2 px), 7 NPC portraits bob 1 px on their own phase. Those items are left out of the baked plaza (no double-draw ghosting). Reduced motion = still. `?nxlife=0` = old bake. Hook `walk.life()`. | `cyc3-art-nexus-life` ALL PASSED: 2/3/7 items, >= 3 torch frames, 2+ sway offsets, bob 0/1, torch area changes, **0.154 ms per frame** (108 frames, load 2.19), reduced still, `?nxlife=0` none. Reruns `world-nexus-walk`, `beta-w04-nexus`, `r4-d2-art` ALL PASSED. Shots `nexus` before/after. |
| Realm R01b inner corners (Highlands / Godlands) | `innerCorners` in the chunk bake: a plain snow / lava rock / dry grass / gravel tile with all 4 sides its own terrain but a different diagonal copies that 10 px corner from its own edge tile toward the diagonal terrain (the artist's notch), so the neighbours' edge strips meet in a clean L instead of a stair-step. `?icorner=0` = off. Hook `smoothStats().icorners`. | `cyc3-art-realm-icorner` ALL PASSED (seed 12345: 91 candidates, 23 filled in 8 chunks, every sampled corner differs from the old bake, 6.9 ms per chunk bake, `?icorner=0` fills 0). Reruns `beta-w03-terrain`, `cyc1-art-realm-fields`, `r4-d2-art`, `world-page` ALL PASSED. Shots `icorner` before/after (4x crops). |

All five new tests registered in `test-tiers.json` (`.test.js` keys); `run-all-tiers` and `live-safety` ALL PASSED after.

## 3. Visual consistency (survey shots `cyc3-art-<scene>-survey-{d,p}.jpg`: town, hub, realm, dungeon, isles meadow / jungle / tundra)
Three worst remaining:
1. **Isles ground**: tundra snow / ice / moss and the jungle floor are flat single-colour tiles with dashed 32 px seams and 32 px
   staircase coastlines, next to the textured Realm PNG terrain. Code cannot paint the pinned b30 pixels; tundra needs R05 art. (Codex #3)
2. **Isles creature scale (W-06)**: creatures read 1.5-2x the hero at 390x844 (`isles-jungle-survey-p`). Integer rescale only, so a
   redraw. (Codex #2)
3. **Town label crowding**: the Professor Byte quest line (`📋 bring 5🐚 (+11⭐)`) sits 10 px above his name and both overlap the
   TOP SCORES board edge at 390x844; the quest line still carries inline emoji. Positions are U's lane (flagged in cycle 2); the name
   glyph is now a pixel flask.
Fixed by code this cycle: emoji glyphs on 9 more world labels; enemy / creature deaths no longer pop or fade as a block; the Nexus no
longer reads as a still image; Highlands / Godlands inner corners no longer stair-step.

## Not resolved (time box)
- Town hero idle polish (squash-stretch / frame offsets on the Town player sprites): not started.
- Icicle bat wiring: blocked on the pinned tundra kinds list (test decision for the coordinator; the wiring is one SPECS line:
  `icicle_bat: { dir: '../../assets/arcane/b03-icicle-bat/creatures/icicle_bat/', cell: 192, ax: 96, ay: 171, acts: CORE, biome: 'tundra' }`).
- Multi-line signs (Bug-Off, tourney, merchant) put the icon beside the whole text box, not the first line, because the cycle-2 test
  pins that geometry; first-line placement needs that test's geometry changed by a coordinator decision.
- The four 🚪 portal-door labels keep their glyph (two tests find the doors by `/^🚪/`).
- R01b code corners are square; rounded corners need the PNG set.

## Codex asks
See `CODEX-REMAKE-QUEUE.md` "UPDATE 2026-11-24 (cycle 3, Claude G)": glacier shellback redo first, W-06 scale, tundra / jungle ground,
R01b PNG corners, R02 + black sand, a 16x16 label icon set.
