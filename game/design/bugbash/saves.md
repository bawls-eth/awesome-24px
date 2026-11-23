# Bug bash lane: SAVE / MIGRATION SAFETY (bb-saves) - 2026-11-23

Inventory: `game/design/SAVE-KEYS.md` (57 localStorage keys, 1 sessionStorage key, 1 IndexedDB database, with owner, shape, version,
validator, class, whether Backup exports it). New tests, all offline (blockDb; Town only through the offline stub, "Play offline"):

| test | class / tier | what it proves |
|---|---|---|
| `save-hostile-fuzz.test.js` | node / smoke | old fixtures through every cleaner (no field lost); ~4,500 hostile inputs (corrupt JSON, wrong types per field, NaN / Infinity / 1e308, 5 MB strings, 200k arrays, `__proto__` / `constructor` keys, 3000-deep nesting) through 18 cleaners: never throw, bounded, idempotent, no prototype pollution; 18 storage loaders/writers on empty / old / hostile / throwing / full storage (a failed write leaves storage as it was); two-tab writes for MMHubProfile.sync, MMSettings (mm-music, mm-high-contrast, access), MMFeedback; Town hero compat for all 31 legacy species x frames -1..16 + junk; backup coverage and round trip |
| `save-compat-pages.test.js` | browser / full | all 14 pages (Town, Hub, Realm, Lantern, Isles, Jam, Deepdelve, Angler, Stalk, Bugs, Dash, Pop, Stack, Echo) x old fixtures for every key (load, pagehide save, reload: every fixture leaf unchanged), hostile values in 3 rotations, storage filled to the real quota, storage that throws SecurityError: page renders, 0 page/console errors, no pollution, 0 DB requests. Town: legacy `goldenpunks`/5 stays stored, 338 legacy/junk presence records render as hero textures and are never mutated |
| `save-race-tabs.test.js` | browser / full | two real tabs per arcade game (pop, stack, echo) + Jam assist toggle; Town `writeSave` merge-on-write guard |
| `shared-mm-save-merge.test.js` | node / smoke | the new `shared/mm-save-merge.js` fix helper (below) |

Known bugs are printed by the tests as `KNOWN-BUG ...` every run (never hidden, never counted as a pass) until the owner lane fixes them.
Result of the pages test: every page survives hostile, full and blocked storage with 0 errors; every old fixture survives a load + save + reload.
(Rechecked the one apparent loss, `pixeltown-jam-v1.fullCombo`: it is dropped only without a Hard entry with combo >= 20, by design since
the field was introduced in 75f9b38 together with that rule, so no real old save loses it.)

## Open bugs (owner files are in other lanes: exact fixes below)

### S1 - P0 (data loss) - FIXED (bb-saves-fix) - a second tab silently erases the best score, rounds and medals of Pop / Stack / Echo / Dash
- Repro: open `games/pop/index.html` in two tabs. Tab A: play a round, score 900 (new best). Tab B (opened before A finished): play a poor
  round. Reload: the best is B's old best; A's round count and any medal only A earned are gone (`pixeltown-pop-v1`, and
  `pixeltown-medals-pop-v1`, which is rewritten from B's stale list). `save-race-tabs.test.js` shows `{"A":900,"stored":3}`.
- Expected: storage keeps the best of both tabs, both rounds, every medal. Actual: last writer wins with a save loaded at page start.
- Files: `game/games/pop/pop.js:48` `persist()`, `stack/stack.js:42`, `echo/echo.js:62`, `dash/dash.js:48` (same pattern).
  The Hub map is safe (MMHubProfile.sync only adds), the per-game save and medals key are not.
- Fix (each game, 3 lines): load `shared/mm-save-merge.js` (new in this branch, pure, tested) in the game's index.html before the game
  script, keep the loaded snapshot, and merge on write:
  ```js
  let save = load();
  let base = JSON.parse(JSON.stringify(save));           // what this tab loaded / last wrote
  function persist() {
    try {
      if (window.MMSaveMerge) { const r = MMSaveMerge.write(localStorage, KEY, base, save, MMSaveMerge.SPECS[KEY]); if (r.ok) { Object.assign(save, r.value); base = JSON.parse(JSON.stringify(save)); } }
      else localStorage.setItem(KEY, JSON.stringify(save));
      localStorage.setItem(MKEY, JSON.stringify({ v: 1, m: save.medals.slice() }));
    } catch (e) { /* storage refused: play on */ }
    hubSync();
  }
  ```
  `SPECS` already has pop / stack / echo / dash (max bests, count rounds/runs as stored + this tab's own increase, union medals, hint
  only turns on). Then flip the `KNOWN(...)` lines in save-race-tabs.test.js to `check(...)`.

### S2 - P0 (data loss) - FIXED (bb-saves-fix) - same stale-tab overwrite in Jam assist, Stalk practice, Angler fun, Bugs pb / journal, Deepdelve runs
- `pixeltown-jam-assist-v1`: `game/games/jam/jam.js:57-58` (`assist` loaded once, `persistAssist` writes it whole). Repro in
  save-race-tabs.test.js: a stale tab toggling "Assist (one thumb)" wipes the assist best another tab saved (`{"on":true,"best":{}}`).
  Fix: `function persistAssist() { var mine = { on: assist.on, best: assist.best, section: assist.section }; var m = window.MMSaveMerge ? MMSaveMerge.merge(S.get(AKEY, null), assistBase, mine, MMSaveMerge.SPECS[AKEY]) : mine; S.set(AKEY, m); assist = cleanAssist(m); assistBase = JSON.parse(JSON.stringify(m)); }` with `var assistBase = JSON.parse(JSON.stringify(assist));` after line 57.
- `pixeltown-stalk-practice-v1`: `game/games/stalk/stalk.js:368-370` (prSave). Same fix with `SPECS['pixeltown-stalk-practice-v1']`
  (counts n / rounds, keeps moodBest; keep the owner's own best rule because best can be negative and needs hasBest).
- `pixeltown-angler-fun-v1`: `game/games/angler/angler.js:165-166` (`fun`). Same fix with its spec (max bestStreak, min positive bestReact, cond bests).
- `pixeltown-bugs-pb-v1`: `game/games/festival/bugs.js:61` + `:196`; and `pixeltown-bugs-v1` / `pixeltown-bugs-goals-v1` in `persist()`
  at `bugs.js:44` (stars / best / journal / goals from a stale tab). Same fix (pb spec exists; for bugs-v1 use `{ maxMap: ['stars', 'best', 'journal'] }`, for goals `{ union: ['done.meadow', ...] }` or re-read + `B.cleanGoals` union).
- `pixeltown-deepdelve-runs-v1`: `game/games/deepdelve/deepdelve.js:157` loads `runRec` once per page, `:187-188` finishes and saves it.
  `save-hostile-fuzz.test.js` shows a stale tab's best replacing a newer one. Minimal fix: at `deepdelve.js:187`, before `RUNS.finish`,
  re-read: `runRec = RUNS.load(localStorage);` (finish then compares the run against the freshest bests and counts on top).
- Severity: real data loss, but needs two tabs of the same game; listed P0 because the lane brief says every data-loss bug is P0.

### S3 - P0 (data loss on restore) - Backup export leaves out 21 progress keys
- Repro: play Deepdelve / Pop / Dash / Bugs goals, Lantern Backup -> download; on a new device (or after clearing site data) Restore:
  the town, realm, heroes come back; Deepdelve goals and runs, all arcade bests and medals, jam assist, stalk practice, angler fun,
  bugs goals / pb, the active Lantern hero (`pixeltown-mm-active-v1`) do not.
- File: `game/shared/mm-backup.js:64-86` `CLEANERS` (KNOWN is derived from it). Missing (from save-hostile-fuzz.test.js): `pixeltown-mm-active-v1,
  pixeltown-jam-assist-v1, pixeltown-deepdelve-v1, pixeltown-deepdelve-runs-v1, pixeltown-deepdelve-creative-v1, pixeltown-angler-fun-v1,
  pixeltown-stalk-practice-v1, pixeltown-bugs-goals-v1, pixeltown-bugs-pb-v1, pixeltown-dash-v1, pixeltown-pop-v1, pixeltown-stack-v1,
  pixeltown-echo-v1, pixeltown-medals-{angler,bugs,dash,deepdelve,echo,pop,stack,stalk}-v1`.
- Fix (additive, VERSION stays 2): add each to `CLEANERS` as `(o, v) => cleanPlain(v)` (owner game cleans on load, like realm / jam already),
  `'pixeltown-mm-active-v1': (o, v) => (o.profile ? o.profile.cleanActive(v) : cleanPlain(v))`,
  `'pixeltown-bugs-goals-v1': (o, v) => (o.bugs ? o.bugs.cleanGoals(v) : cleanPlain(v))`, plus a NAMES label each. MAX_KEYS (50) still fits (18 + 21 = 39).
  Then the `KNOWN('backup: ...')` line in save-hostile-fuzz.test.js passes. Note: the Deepdelve IndexedDB world (`pixeltown-deepdelve-v1`
  database) is not in any backup either (P2, a size question, document it in the Backup screen).

### S4 - P2 - MMHubProfile.sanitize keeps `profile.games` unbounded
- `game/shared/profile.js:84` `out.games = isObj(raw.games) ? raw.games : {};` keeps any size / shape. A corrupt or tampered profile with a
  big value there (5 MB string, 200k array: save-hostile-fuzz.test.js `KNOWN-BUG hostile pixeltown-profile-v1`) makes every later
  `save()` hit the quota and return false, so new Hub progress silently stops saving.
- Fix: rebuild `games` per known-shape game: `out.games = {}; if (isObj(raw.games)) Object.keys(raw.games).slice(0, 64).forEach((g) => { if (!/^[a-z0-9_-]{1,24}$/.test(g) || !isObj(raw.games[g])) return; const e = raw.games[g]; const done = Array.isArray(e.done) ? e.done.filter((id, i, a) => typeof id === 'string' && id.length <= 40 && a.indexOf(id) === i).slice(0, 200) : []; let rest = {}; try { if (JSON.stringify(e).length < 4000) rest = JSON.parse(JSON.stringify(e)); } catch (x) { rest = {}; } out.games[g] = Object.assign(rest, { done }); });` (keeps every real field, drops only junk / oversized ones).

### S5 - P3 - MMStore reads back the OLD value after a failed (quota) write
- `game/shared/store.js:11-20`: `writeRaw` falls back to the in-memory copy when `setItem` throws, but `readRaw` asks localStorage first,
  so `S.set(k, new)` then `S.get(k)` returns the old stored value (checked in node). Pages using MMStore (jam, stalk, bugs, angler) then
  show the player's new progress as gone for the rest of the session on a full device.
- Fix: in `readRaw`, return `mem[key]` first when `Object.prototype.hasOwnProperty.call(mem, key)` (writeRaw already deletes it on a good write).

### S6 - P3 - FIXED (bb-saves-fix: 120000 bound) - small-save loaders reset a save whose JSON grows past 4 KB
- `pop/pop.js:39`, `stack/stack.js:35`, `echo/echo.js:50`: `s.length < 4000` else defaults; the next persist overwrites the real save.
  Today the saves are ~150 bytes, so this is latent; one future additive field (a ghost / history list) turns it into silent loss.
  Fix: use the same 120000 bound as `dash/dash.js:39`.

### S7 - P3 - FIXED for Pop / Stack / Echo / Dash / Jam assist / Stalk practice / Angler fun / Bugs goals + pb / Deepdelve runs (bb-saves-fix; `pixeltown-bugs-v1` stays strictly cleaned on write, as bugs-page.test.js requires) - arcade loaders drop unknown fields (not forward compatible)
- The same `load()` functions return only the fields they know, so an older cached tab writes away a field a newer build added.
  The MMSaveMerge fix in S1 also solves this (storage-only fields are kept by `merge`).

### Fix notes (bb-saves-fix)
- Every listed writer merges on write against what storage holds now (`MMSaveMerge.merge` + the owner's cleaner); memory keeps only
  cleaned known fields, storage keeps unknown fields. Without `shared/mm-save-merge.js` each game falls back to its old plain write.
- Beyond the SPECS: Dash keeps the longer ghost on the same course; Angler per-condition bests merge by hand (size max, strike = smaller
  positive ms, catches counted with a base; the SPEC's `maxMap: ['cond']` would keep the slower strike); Stalk best keeps its hasBest rule;
  Bugs journal counts = stored + this tab's own catches; Bugs goals union per arena; Jam assist writes On/Off only when this tab toggled it.
- Medals keys (`pixeltown-medals-{pop,stack,echo,dash}-v1`) are unioned too. Tests: save-race-tabs.test.js (all former KNOWN-BUG lines are
  checks; plus Dash, Stalk, Angler, Bugs, Deepdelve and the no-helper fallback), save-hostile-fuzz.test.js (MMDDRun race is a check).

## Checked and fine (no bug)
- Town `writeSave` merges a fresh `loadSave()` into every write (main.js:158-164): two tabs keep each other's fields (guarded by a test now).
- Realm `rmMergeSave` + dust transaction: covered by save-merge-fuzz.test.js (5000 seeded runs, unchanged).
- Feedback box re-reads storage before every add / delete; Settings flags (`mm-music`, `mm-high-contrast`, `mm-sfx-muted`, ...) and
  `pixeltown-access-v1` are read-modify-write per change, so two tabs never undo each other.
- Town heroes: species/frame never rewritten (stored save, selfData, presence); every legacy key and frame renders as a hero.
- Every page survives a full storage (QuotaExceededError on every write) and a blocked storage (SecurityError on every call) with 0 errors,
  and a failed write never deleted or truncated an existing value.

## Elsewhere
- None outside saves.
