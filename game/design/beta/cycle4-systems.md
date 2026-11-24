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
