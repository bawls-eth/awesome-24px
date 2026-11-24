# Cycle 4 Systems (S) notes

Branch `cyc4-systems`, cut from `claude/animal-crossing-game-7z3roh` at 385efc3. Server port 9745.

## ID-06 assist: the pref contract (for U, branch cyc4-ui)
Read with `git show cyc4-systems:game/design/beta/cycle4-systems.md`.

- Key: `localStorage['mm-assist']`, a device pref in its own small key (like `mm-aim-assist`). It is not in `pixeltown-save-v1` and not in `pixeltown-access-v1`.
- Value: a JSON string `{"dmg":D,"aim":A}`.
  - `dmg` is damage taken in percent, one of `100, 90, 80, 70, 60, 50` (6 steps, never 0). Default `100`.
  - `aim` is aim help, one of `0, 1, 2, 3` (Off, Light, Medium, Strong). Default `0`.
  - Slider ids (U's cycle 2 spec): `#mmset-assist-dmg` min 50 max 100 step 10; `#mmset-assist-aim` min 0 max 3 step 1.
- Missing, unparsable or out-of-range values read as the default. Cleaning rules:
  - `dmg`: rounded to the nearest 10, then clamped to 50..100.
  - `aim`: rounded, then clamped to 0..3.
  - Unknown fields are dropped.
- Module `game/shared/mm-assist.js`, global `MMAssist` (UMD, so node tests can load it):
  - `KEY`, `DMG_STEPS`, `AIM_STEPS`, `AIM_WORDS` (`['Off', 'Light', 'Medium', 'Strong']`), `DEFAULT`.
  - `clean(v)`, `read(storage)`, `write(storage, v)` (writes the cleaned JSON; returns it).
  - `reset(storage)` removes the key.
  - `isDefault(v)`.
  - `isAssisted(v)` is true when `dmg < 100`. Only the damage slider tags a run; aim help does not.
  - `scaleDamage(dmg, v)` = `max(1, round(dmg * dmg% / 100))`. At 100 the hit is returned unchanged.
  - `aimCone(v)`: the touch aim-assist cone in degrees: 14 / 20 / 26 / 32 for aim 0..3. Level 0 is the old 14-degree default.
- U's Settings rows: call `MMAssist.read(localStorage)` / `MMAssist.write(localStorage, {dmg, aim})`. The Realm re-reads the key at every run start.
  - U must load `shared/mm-assist.js` before `mm-settings.js` on any page that shows the rows, or guard with `typeof MMAssist`.
- Wording: never "easy". The tag text is `Assisted`.

## ID-06 built (commit 091788d)
- `shared/mm-assist.js` is loaded before `realm.js` on `game/index.html` and on `games/mad-maze/index.html`.
- Damage taken: in `_hitPlayer`, one multiply after the coach guard (`hurtGuard`).
  - The pref is read on every hit, so a Settings change applies at once.
  - It never applies in a duel (`team.isPvp`).
  - A scaled hit, or the pref at run start, sets `run.assisted`.
- Aim help: `_wireRefresh` (run start, or `refreshAssist()`) sets `_aimCone`. `MMAim.assist` gets `cone`. Level 0 = 14 degrees, the old behaviour.
- Tag on the result and best paths. Bests are never blocked:
  - The fall banner and the death card show an `Assisted` row.
  - The boss kill shows "New best time! (Assisted)".
  - The Stats row and the menu show "Best wave N (Assisted)".
  - Additive Realm save fields `bestWaveA` / `bossBestTA` = 1 mean that best was set by an Assisted run. They are written only when set, so a default save is byte-identical.
  - An unassisted run that ties the best clears the tag.
  - `rmCleanSave` keeps a tag only with a best > 0.
  - `rmMergeSave` keeps the tag with the best it belongs to; on a tie, the unassisted side wins.
- Backup: `mm-backup.js` says "ONE Backup = every game save key + all settings". Only hardware-bound values stay out (lowGfx, nav).
  - So `mm-assist` joins the backup as a setting, like `mm-aim-assist`.
  - It is cleaned inline: an object, dmg 50..100 step 10, aim 0..3.
  - It is not a save key and not in `pixeltown-save-v1`.
  - If the coordinator wants it out, revert the one `CLEANERS['mm-assist']` block and the NAMES label, and drop the 6 backup checks in `cyc4-assist-scale`.
- Medals: the Realm has no medal path; Trial of Six and dungeon summaries are not tagged yet. Their summaries use the same `run.assisted`, so the follow-up is small.

## ID-40 built (commit e7e1cc8)
- `MMGearForge.INCOME` = `{dust: 4.74, shards: 9.75}` per Godlands kill. This is fixed data from the cycle 3 economy sim; nothing is tracked.
- `MMGearForge.shortHint(cost, have)` returns `null`, or one of:
  - "N more kills of dust, shards are enough"
  - "N more kills of shards, dust is enough"
  - "N more kills of dust and M of shards"
- The open Forge shows one `.rm-forge-short` line under the reforge header when the cheapest option is not affordable.
- Town daily bonus: skipped. `cyc4-design` had no `cycle4-design.md` (branch still at 385efc3).

## Skipped / blocked
- ID-36 Trial pattern layer: skipped. D's spec was not on `cyc4-design` by minute 25.
- Isles wanderers dead-end oscillation simulation: not started; it was past minute 40.
  - Plan: copy the `cyc2-isles-wander-slide` pen into a 1-wide dead-end corridor.
  - Count velocity reversals and stuck frames, default vs `?wslide=0`.
- Codex icicle bat: blocked. Wiring it needs a change to the pinned tundra list in `shared-mm-creature-strips`, which must not be edited.

## Checks run (port 9745, /tmp/bt.sh)
- New: `cyc4-assist-scale` (node, 19 checks), `cyc4-assist-realm` (browser, 16 checks), `cyc4-forge-hint` (node + browser, 9 checks). All three ALL PASSED.
- Regression: `shared-mm-backup` (65/65), `realm-wire`, `realm-access2`, `shared-mm-pad-aim`, `shared-mm-gear-forge` (31/31), `gear-forge-ui`. All ALL PASSED.
- Gates run alone: `first-ten-minutes` (on the ID-06 code) ALL PASSED. `isles-first-ten` (on the final code) ALL PASSED.
  - It overlapped with my forge tests through bt.sh slots, so it did not run strictly alone.
- `save-compat-pages`: NOT verified. It hit my 400 s `timeout` wrapper (Terminated), so the coordinator should run it in the stamp.
- `run-all-tiers` and `live-safety`: ALL PASSED.
