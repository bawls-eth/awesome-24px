# Cycle 15 S (Game Systems): ID-69, ID-68, the noHello carve-outs

Branch `cyc15-systems` (cut from e1c8a3e, the cycle 14 stamp), static server port 9105. Nothing pushed.
New test: `game/tests/cyc15-s-systems.test.js`, registered in `test-tiers.json` (browser / full / 900 s).
No new save key (both ideas noted as "add NO key" in `SAVE-KEYS.md`).

## What changed

### ID-69: Isles tame-then-fight line (`games/isles/isles.js`)
- After the **first tame of an isle visit** (`finishTame` -> `guardArm`), the existing hint names the nearest live hostile.
  - It shows for 12 s of play. The 12 s allows for the tame toast (2.2 s, with the phone hint waiting under it) plus the 6 s narrow-phone show.
  - It ends early if that hostile is gone.
- **Text (max 40 characters):**
  - It is `"<Name> guards the <band>. Go fight!"`. If that is too long, or the band is "open sea", it falls back to `"A <Name> is near. Go fight!"`, then to `"Go fight the <Name>"`.
  - Example: "Fern Raptor guards the beach. Go fight!" (39 characters). On mars it is "A Dust Devil is near. Go fight!".
  - **Change from U's example wording:** U's example had no verb. The first-ten hint gates (`isles-first-ten` and `first-ten-minutes`, `hintActionPct` target 100) count a hint with no action verb as a miss. So the line carries "go", which is on the gate's verb list.
- It goes through `hintText` -> `#hint` (`role=status`), placed **after** `bossHint` and `airHint`. So boss and air (danger) hints always win, and the line waits under them. It goes before every calm hint.
- It shows once per visit, in memory only. A second tame never re-arms it. An isle with no hostile just spends it.
- Test hook: `__isles.guard()`.

### ID-68: Shore first-level floor (`realm.js`, kill path)
- **Rule:** if a Lv 1 hero has 15 s or more on the arena clock (`RM_LV_FLOOR_S`), the next World Shore kill (`mode === 'world'`, `e.zone === 0`, no dungeon, no team) gives `max(kill XP, rmXpNeeded(1) - xp)`.
  - The bar lands exactly on Lv 2 with xp 0.
  - It uses the normal `_gainXp`, so the same "+xp" text and the same "Level 2!" banner show.
- **No new UI and no save key.** Lv 1 is the only level it can touch, so the hero's level is the "used" record.
- **Off switch:** `?lvfloor=0`. `arena.lvFloorUsed` is a test counter only and is never saved.
- **Placement (L's point 3):** I kept it in `realm.js`, not `realm-world.js`.
  - `realm-world.js` only hears about a kill through `onEnemyKilled`, which fires after the XP is already granted.
  - Moving it there would mean either a second `_gainXp` (a second "+xp" float, against U's "same toast, same XP text") or a new hook in `realm.js` anyway.
  - The world / zone 0 / no dungeon / no team gate keeps classic, dungeon and duel arenas untouched. The tests L named were run; results are below.

### noHello carve-outs removed
- `tests/town-isles-sign.test.js` and `tests/beta-retest-b14.test.js` now compare `pixeltown-save-v1` byte for byte.
- L's cycle 14 hello hold makes the carve-outs unnecessary. Both tests passed 5 of 5 runs without them (see below).

### Other
- `tools/id64-build-sim.js`: the hard-coded "first level-up 6.8-29.7 s" now comes from `ftue-metrics.json` (L's point 2). Its printed output is unchanged until the stamp rewrites the metrics.

## Checks actually run (port 9105, through /tmp/bt.sh)
- **`cyc15-s-systems.test.js`, after the change:** ALL PASSED. It covers:
  - [69] at 160x284, 195x422, 390x844 and 1280x720.
  - [69 ?tame=0] and [69 air] (mars).
  - [68] and the [68] fast-levelling run.
  - Final full run: 59 PASS, ALL PASSED.
- **Same test with `realm.js` and `isles.js` reverted to e1c8a3e:** 24 FAILED. The [69] guard checks fail everywhere, and [68] floor / `?lvfloor=0` / used-once fail. The test fails before and passes after.
- **ID-69 at 160x284 (seen in the screenshot):** the tame-only hint that was up before the change ("Fern Raptor is getting drowsy...") covered the Pack button (`btn-pack`). The new line does not cover it.
- **ID-68 pinned forms (L's point 4):**
  - What the test pins: the gift is at most `rmXpNeeded(1) - 1` (29 XP) and is given once; per-level needs are unchanged (the game's `rmXpNeeded` 1-6 = 30, 50, 70, 90, 110, 130); Lv 2+ per-kill XP is identical; a run that levels before 15 s is byte-identical with and without the floor (every gain, level and xp; the floor is never used).
  - "Lv 2+ XP totals byte-identical" in U's wording cannot hold for a bot run, because the run's path shifts once the hero levels earlier.
- **`first-ten-minutes.test.js` with `FT_ONLY=world-shore-e`, floor on:** 19 PASS, 0 FAIL.
  - shore-e first level-up 29.7 s -> **19.9 s**.
  - maxRewardGap 36.2 s -> **12.9 s**.
  - Level at 620 s: 16 -> 14 (the bot's path shifts).
  - I restored the metrics file afterwards. The coordinator's stamp will rewrite `ftue-metrics.json`, and seeds b and e should move as L predicted.
- **Pinned-number and neighbour tests run with the change in:**
  - Passed: `world-easy-start` (L's point 1: the hero stands still and makes no kill, so the floor never fires; no `?lvfloor=0` needed), `cyc2-shore-fade`, `ftue-ft2`, `cyc10-s-first-end`.
  - Also passed: beta-r4-replay-realm, cyc1-danger-meter, world-gradient, class-weapon-playtest, realm-progress, realm-boss, realm-wire, cyc5-lead-notices (L's point 3 list), isles-taming, isles-first-ten (the hint gate with the new line), cyc13-ui, cyc14-s-systems.
  - **cyc11-d-first-end:** it failed 5 checks in 2 runs made while my batch and other agents' browsers were loading the machine (the first-end card's 6 s timing: `why: danger`, `done: true`). It passed once on the pre-change realm.js, then passed 3 of 3 runs with the change. One of those runs had a debug print showing `lvFloorUsed 0, level 1, kills 0` at the failing step. The floor needs a kill, so it cannot be what moved it. I read this as load flakiness in a timing test; the coordinator's stamp should confirm.
- **noHello removal, 5 runs each:**
  - town-isles-sign: 5/5 ALL PASSED.
  - beta-retest-b14: 5/5 ALL PASSED. Both carve-outs removed.

## Screenshots
- `design/beta/img/cyc15-systems-isles-guard-{160x284,195x422,390x844,1280x720}.jpg`: the line in the hint chip, taken after the tame toast cleared.
- `design/beta/img/cyc15-systems-lvfloor-1280x720.jpg`: the Level 2 banner after the floor kill. The 1e9 damage numbers are from the test harness.
- ID-68 has no UI change, so no 390x844 world screenshot was taken.

## Unresolved / proposals
- The first-ten world metrics move for the seeds that level after 15 s (b, e). The gates passed for shore-e. All six profiles run in the coordinator's stamp.
- ID-70 (not mine) can reuse `guardHint`'s slot in `hintText` (after the danger hints) for "Catch your breath".
