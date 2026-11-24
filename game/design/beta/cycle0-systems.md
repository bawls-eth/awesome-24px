# Cycle 0: Systems (S) notes

Branch `cyc0-systems` from `r4-integ2`. Own server on port 9705, all browser runs through `/tmp/bt.sh`, Firebase blocked (blockDb + stubbed SDK), targeted tests only (no full suite).

## Fixed (each with a test that fails before and passes after)

| # | Area | Bug | Fix | Test (before -> after) |
|---|---|---|---|---|
| 1 | Town / E-interaction shadowing (weed/mailbox family) | The 4th village flower patch sat 22 px from the **Kart Rally** door. Flowers answer E before doors in `interact()`, so E at the door picked the flower; the door won only 40% of its range and never at its centre. | The patch moves to the middle of the four arcade doors (1900, 915), clear of all of them. | `cyc0-town-interact-shadow.test.js`: sweeps every fixed Town E target (NPCs, merchant, dig hole, Realm Gate, 4 doors, Isles sign, postcards, flowers, fossils) on a 4 px grid with recorder handlers. 5 FAIL -> ALL PASS. `beta-r4-weed-reach` still passes (weed layout keeps clear of flowers). |
| 2 | Isles enemy AI: leash (b01-r2-05 family) | An angry hostile creature that chased past the 14-tile leash turned round 0.1 s later, re-aggroed on a hero standing just outside, and hovered on the ring forever (82 crossings in 15 s, 3 tiles from the hero: free shots, never reaching). | Leash hysteresis: once leashed it walks back to within 4 tiles of home before it may chase again; if terrain blocks the return it settles after 8 s (home moves there) so it can never be stuck in "returning". | `cyc0-isles-leash.test.js`: 4 FAIL -> ALL PASS. `isles-bugbash`, `isles-taming` pass. |

## Feature built: Deepdelve bank line + per-seed depth ghost (NEXT-SLICES-5 DD5, depth half)

`game/design/IDEAS.md` does not exist yet (no `approved` ideas), so this is the highest-value unbuilt S/M slice from NEXT-SLICES-5 in the systems lane (DD5, P2, test file `deepdelve-ghost.test.js` was missing).

- HUD line under the dive line: before the climb-out bonus arms, `Dig N more to bank x1.5 (now P pts)`; once armed, `Climb out now: X pts (a fall keeps Y)` in gold. Push-your-luck is now readable.
- Depth ghost: the deepest dive per world seed (`?seed=`) is kept and shown as `Seed ghost: D deep (n to go)`, then `Past your seed ghost by n` with a pop; the dive summary says `You passed your seed ghost: A deep (it was B)`. `?ghost=0` hides the ghost part only.
- Save: additive field `seedBest: {"<seed>": depth}` inside the existing `pixeltown-deepdelve-runs-v1` (cleaned: integer keys, 1..999, at most 32 deepest kept). `MMDDRun.save` merges it by max against storage; `mm-save-merge` spec gains `maxMap: ['seedBest']`. Old records load unchanged. The key is already in the one Backup list (`shared/mm-backup.js`), so no new key; SAVE-KEYS.md row updated.
- NOT built: the 3D path replay half of DD5 (MMGhost trail drawn in the world). It needs a render pass in `deepdelve.js` and a perf budget check; left for a later cycle.
- Test: `deepdelve-ghost.test.js` (14 node checks on the pure module incl. clean / cap / merge, then desktop 1280x720 + phone 390x844: seed carried, unarmed line, armed line with exact x1.5 values, ghost pass pop, line on screen, live loop keeps the line, save of the new seed best + summary line, `?ghost=0`, no page errors, 0 DB requests). ALL PASS.
- Regression runs: `deepdelve-dive`, `deepdelve-page`, `deepdelve-polish`, `shared-mm-save-merge`, `save-merge-fuzz`, `save-hostile-fuzz`: ALL PASS.
- Screenshots: `img/cyc0-deepdelve-bank-desktop.jpg`, `img/cyc0-deepdelve-bank-phone.jpg`.

## Review notes (checked, not changed)

- Triage rows that are already fixed in the tree (ROUND4-TRIAGE is stale for them): b11-r2-05 Stalk practice best stores a loss (G-18 in `stalk.js`), b03-r2-10 Trial fall line (G-27 in `realm-world.js`), b11-r2-10 Lantern vs Realm level (FUN1: labelled "Lantern Level" plus a "Realm Lv" tag; a design decision, not a bug).
- Town shadow sweep, smaller overlaps left as they are: flower patch 2 (1700, 750) loses 23% of its range to the turnip stall (centre fine); NPC 2 loses 1% to the Isles sign; postcards answer over 83% of their radius (their own hit test is offset). Weeds may sprout next to arcade doors (weed keep-clear list has no PORTALS); weeds are one-shot so the door works after one pull. Worth adding PORTALS to `weedSpotsForDay` keep-clear later.
- Town villagers tween straight to yard spots (no pathing) but stay inside their own yards; no stuck case found.
- b04-12 (Realm tents / campfire walkable): world props never block by design ("never blocks, world generation untouched" in realm-world.js). Making them solid touches Realm collision and enemy movement; needs an owner / D decision, not a quiet fix.
- Isles creatures chasing into a wall bounce (`vx = -vx`) and re-aim 0.1 s later, so they can pin against cliffs (no pathing). Not fixed; flagged for a later AI pass.
- Nexus NPC fallback lines ("Combining is on its way", "It will be on the shelf soon") only show when the stall flag is off.

## Asks
- D: confirm DD5 numbers (x1.5 bank, ghost per seed) read well in play; decide whether Realm camp props (tents, campfire) should block (b04-12).
- U: the Deepdelve HUD box is getting tall on phone (6 lines with the bank line); consider collapsing goal + dive lines.
- G: none from this lane (DD5 path ghost will want a small ghost marker sprite later).
