# Cycle 2, G (Graphics + Pixel Art): notes

Branch `cyc2-art` (from `claude/animal-crossing-game-7z3roh` 2b40e79), not pushed. Own server :9723. Every browser / node run went through
`/tmp/bt.sh`; Firebase blocked in every context (blockDb for Isles; offlineStub + an `ADMINcyc2*` bot for Town, `db.attempts() === 0`
asserted). Targeted tests only (no full suite). OpenAI spend this cycle: $0.00 (LEDGER-OPENAI.md unchanged).
Screenshots: `game/tests/shots/cyc2-art-shots.js <origin> <before|after> <scene...>` -> `game/design/beta/img/cyc2-art-<scene>-<tag>-<d|p>.jpg`
(d = 1280x720, p = 390x844, all <= 64 KB). "before" uses the opt-out flag on the same server (the exact old pixels).

## 1. Codex branches
`git fetch origin`: newest `origin/codex/*` is still `codex/r09-jungle-core-master-review` (2026-11-23 12:23 PST). Nothing new to review
or merge. `tests/art-integration.test.js` not edited.

## 2-3. Resolved, with the check that ran
| Item | Change | Verification |
|------|--------|--------------|
| Isles field detail (cycle 1 leftover) | `MMIsleArt.fieldDetail` (shared/mm-isle-art.js): a SEPARATE overlay after `detail()` (its output untouched) on grass, tall_grass, flower_meadow, dry_grass, clover_patch, jungle_moss, tundra_moss, orchid_moss: seeded 3x3 flowers (5 petal colours), 2x2 pebbles (lit / dark pixel), 3-blade tufts in the tile's own shade; square clusters only. PNG terrains are skipped (art bakes pass `artFreePal()`), off on the low tier. Bake time only. Overlay cost: pure call on a full 16x16 grass chunk < 3 ms (measured under load). `?islefield=0` = off. Hook `__isles.fieldDetail()`. | `tests/cyc2-art-isles-field.test.js` ALL PASSED (meadow: flowers / pebbles / tufts each > 5, mean < 4 ms per chunk, grass colours up, b35 garden_path and b30 jungle_floor hashes identical on / off, deterministic, sand never painted, `?islefield=0` places nothing). Pinned tests rerun: `cyc0-art-isle-detail`, `isle-art-bake`, `cyc0-art-black-sand` ALL PASSED. Shots `cyc2-art-isles-meadow-{before,after}-{d,p}.jpg`. |
| Town emoji glyphs inside world labels (cycle 1 audit #1, my half) | Six new original 16x16 icons in `shared/mm-pixel-icons.js` (house, museum, mail, hammer, book, turnip; same palette + auto outline). `TownScene.pixelWorldLabels()` once at create: each world-space Text starting with a mapped emoji (🏠 🏡 🏛️ 📬 📮 🔨 📖 🥬 🌀 🎣) loses the glyph and gets a 1x icon image 1 px left of the word, pair centred on the old x, same depth / visibility; later `setText` (mailbox count, home cozy) is stripped too. Not converted on purpose: 🦸 Founder's Statue (`r4-d2-statue` pins it), ⛵ Isles (`town-isles-sign`), the mailbox ❗N marker (`mailbox`). One canvas texture per icon, nothing per frame. `?worldicons=0` = old labels. `index.html` loads mm-pixel-icons.js. | `tests/cyc2-art-town-label-icons.test.js` ALL PASSED (>= 7 labels, all 7 icon ids used, no leading glyph, 16x16 at 1x with >= 60 opaque px, gap 0-2 px, centred <= 1 px, phone same count, `?worldicons=0` unchanged, 0 page errors, `db.attempts() === 0`). Reruns: `mailbox`, `r4-d2-statue`, `town-isles-sign`, `cyc1-art-town-buildings`, `town-front-door`, `cyc0-art-hub-icons` ALL PASSED. Shots `cyc2-art-town-{before,after}-{d,p}.jpg`. |

Both new tests registered in `test-tiers.json` (`.test.js` keys); `run-all-tiers` and `live-safety` ALL PASSED after.

## Not resolved (time box)
- Idle / death polish (Town heroes, Realm enemies, Isles creatures): not started. Cheap next step: an alpha-dither dissolve over the last
  death frames, measured per frame.
- Nexus plaza environmental life (lantern glow, banner sway, NPC idle loops): not started.
- Realm R01b inner corners (Godlands / Highlands): not started; stays a Codex ask (queue #3).
- Isles creature scale (W-06): unchanged; code rescale is non-integer, Codex redraw (queue #1).
- Town label collisions: the "Shop" title and the "+50% today" deal line still crowd each other at 1280x720 (`cyc2-art-town-after-d.jpg`);
  the Professor Byte quest line still sits close to the statue label. Layout of those lines is U's lane (positions), flagged there.
- Remaining world glyphs not mapped (no icon yet): 🎲 Polyroll, 🕹️ Arcade, 🪦 Graveyard, 🌾 Windmill, 👗 Able Sisters, ⛏️ Hole,
  🦋 Bug-Off sign, 🎣 tourney sign (multi-line setText), 🛒 merchant, 🚪 portals. Same mechanism takes them once icons exist.

## Codex asks
See `CODEX-REMAKE-QUEUE.md` "UPDATE 2026-11-24 (cycle 2, Claude G)": W-06 redraws first, tundra / mars strips, R01b icorners, R02 ground,
a b19-style Town label icon set.
