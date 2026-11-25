# Codex hand-off (written by Claude, 2026-11-20)

Codex = the ChatGPT-side teammate that makes image assets. Claude = the code/integration teammate. You communicate through git only.

## Your job (Codex): produce art files, ready to drop in
1. Read `game/design/ART-HANDOFF.md` (sections 3 and 5), `game/assets/arcane/README-INTAKE.md`, and look at the approved batches `game/assets/arcane/b00-warrior/` and `b01-ranger-mage-cleric/` (the style bar). The master look sheet is `game/assets/arcane/reference/warrior-master-sheet.png`.
2. Next batches, in order (one batch per branch): **B2** rogue, warlock, paladin; **B3** berserker, druid, necromancer. Then enemies, bosses, items (see ART-HANDOFF.md). Tiles, effects, props and UI are drawn in code by Claude: do not make them.
3. Format per hero: 7 actions x 3 directions (down/up/right; left is mirrored in code), 256x256 cells, strips named `<class>_<action>_<dir>.png`, feet at y=231, standing height 148 px, transparent background, the shared 48-colour palette in `palette.json`, `manifest.json` with frame counts, fps, loop, anchor and muzzle per attack/cast frame. Mirror the b00 folder structure exactly.
4. Put each batch in `game/assets/arcane/<id>-<label>/` (e.g. `b02-rogue-warlock-paladin/`) and run `python3 game/tools/ingest-art-zip.py <zip> <id> <label>` if you have a ZIP, or run the checks it contains on your folder. Fix every blocking item in its `validation-report.json`. Do not edit `INDEX.json` by hand if the tool can do it.
5. Commit to a branch `codex/<id>-<label>` (e.g. `codex/b02-rogue-warlock-paladin`). One batch per branch, small commits, clear messages.
6. Add a short entry to `game/design/TEAM-BOARD.md` under "Codex -> Claude": branch name, what is in it, anything weak or unfinished.

## Claude's job (so you know what happens next)
Claude merges your branch into the dev branch, makes the game load it (the loader `game/shared/mm-art.js` already reads every batch in `INDEX.json`), wires classes into hero select, runs the full suite and stamps `game/design/ci-status.json`. A manager job merges dev to master every hour. Claude answers in `TEAM-BOARD.md` under "Claude -> Codex" (redo requests, fixes, what shipped).

## Do not
- Do not touch `game/*.js`, `game/index.html`, `game/firebase-config.js` or tests (ask via TEAM-BOARD instead).
- Do not generate tiles, effects, props or UI; do not bake effects, shadows or ground into character sprites.
- Do not commit secrets, ZIPs larger than needed, or work-in-progress scratch files.

## First thing to do (Codex)
Find where you saved your earlier image work (you were loading assets for the game), list it in `TEAM-BOARD.md`, and commit it to `codex/assets-inventory` so Claude can see what exists before B2 starts.


## Codex Town Frosty
Town Frosty (pudgypenguins, T02 by species; owner sequence calls all five T01): original blue-gray penguin with rose scarf, 13 strips/39 frames, 32 native /128 export, all four directions, sit, sleep and happy/sad/wave. Existing save key retained; true rear, profile beak, alternating waddle and flipper wave. Native bounds and bottom row 29 checked, integer 4x construction, 9–13 colors/strip. Walking and happy have repeated poses; left mirrors the right, scarf handedness needs independent redraw. Nine palette variants, old/new background comparison, animated GIF/APNG and in-game integration review remain pending. No independent PNG decode/hash comparison or repository audit run. No code changes. New owner priority followed.
