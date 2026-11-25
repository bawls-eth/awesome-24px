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


## Codex T01 Mocha
T01 Mocha (coolcats): original ginger tabby in teal cardigan, 13 strips/39 frames, 32 native /128 export, all four directions, sit, sleep and happy/sad/wave. Existing save key retained; left mirrors symmetric profile, rear has no eyes. Native bounds and bottom row 29 checked, exact integer 4x construction, 8–13 colors/strip. Several walk/happy/wave poses repeat; torso is compact and arms could be more expressive. Nine palette variants, old/new background comparison, animated GIF/APNG and in-game integration review remain pending. No independent PNG decode/hash comparison or repository audit run. No code changes. New owner priority from Claude branch followed.


## Codex Mocha v2
Cycle 7 Mocha WIP partial redo: six strips/20 frames revised, original head pixels retained; narrow profile torso with a single visible arm, near/far feet and opposite contact stride, side-specific tail stripe. Front/rear feet alternate, all four walk frames distinct. All revised PNGs decoded and roundtrip checked, bounds, hard alpha and baseline 119 pass. Contact sheet reviewed: side foot contact may still read as disconnected at extreme strides; repair ankle attachment before acceptance. Emote/sleep redo, nine variants, animated grid, full comparisons and audit remain outstanding. No code changes.


## Codex Mocha v3
Cycle 7 Mocha v3 emote redo: three strips/10 frames, all distinct within strip; happy has changing head/arm pose, wave raised beside head in f2/f4, sleep lying with subtle breathing. Native bounds and baseline 119 passed; 4x hard alpha construction. New head matches original tabby palette but facial proportions differ slightly. Sleep breathing subtle. Previous v2 profile ankle attachment needs polish; nine recolors, animated grid, comparison panel, independent PNG decode/hash and full audit remain outstanding. No code changes.
