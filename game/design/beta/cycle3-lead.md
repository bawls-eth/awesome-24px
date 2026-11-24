# Cycle 3, Lead Developer

Branch `cyc3-lead` (cut from `claude/animal-crossing-game-7z3roh` 031b83b). Own server on port 9731, every browser command through
`/tmp/bt.sh`, database blocked (`blockDb`, `db.attempts() === 0` in the Realm tests; the Angler and Isles pages are standalone and
their tests count database requests: 0). No Town page was opened. Targeted tests only: the full suite and the live-class tests were NOT
run here. Nothing pushed.

## 1. Review of the cycle 2 merges (`git diff 2b40e79..HEAD`)

### Bugs found and fixed
| # | where | bug | fix | test (red before -> green) |
|---|---|---|---|---|
| 1 | ID-04 notebook, `realm-world.js` `nbLoad` | After every new page the in-memory notebook was REPLACED by the disk copy. With a write that fails (quota full, private window, blocked storage) the disk never holds this visit's pages, so each new page wiped the earlier ones: beat A, B, A and "New notebook page: A" showed twice (and again after every other new creature), the button count fell back, the panel listed one page. | The disk copy is merged into what the page knows (`MMNotebook.merge`). Another tab's pages are still picked up. | `cyc3-notebook-blocked` (browser, Realm world): 15 checks, 10 red before. Quota and blocked modes, plus the writable two-tab case. |
| 2 | Deepdelve `dd-run.js` `save` (seedPath) | The stored path must be the path of the deepest dive on the seed. `finish()` drops the old path when the new deepest dive has none (`?ghost=0`, or under two samples), but `save()` merged with the disk record as "mine or the disk's", so the old, shallower dive's path came straight back; a stale second tab did the same. The next dive drew a trail that stops above the depth ghost. | The merge takes strictly the deeper dive's path (or none); equal depths: mine, else the disk's. | `cyc3-dd-path-merge` (node): 13 checks, 3 red before. Also pins: storage that throws on read / on write never throws and never invents a path; a hostile disk path is dropped. |

### Checked, no bug
- **`mm-chunks` last-chunk cache.** New fuzz `cyc3-chunks-cache-fuzz` (node, about 6 s): every read of a cached world against a model
  with no chunks at all (`MMChunks.blockAt` + a Map of edits, with and without a filter band): reads near a walker, on chunk borders
  and outside the world, edits, `unloadChunk` (the walker's chunk half of the time), `getChunk` / `neighbours` reads, `serialise` ->
  `load` into the same world and into a fresh one. 4 runs of 12000 operations: 0 differences. The test is real: with either cache
  reset removed (`unloadChunk`, `load`) it goes red (4 and 2 checks). 9 checks.
- **Godlands elite drop fix.** `src` lives only in the roll context (`gearCtx`) and in `lastDrops` (a 12 entry in-memory test hook): it is
  not written to any save and so not to a Backup. One `rollFor` per kill (the zone branch returns), so no double roll. `MMZones`
  (`dropChance`, `rollDrop`) does not read `src`, so the bag roll and its seed are as before; only the gear table row changes
  (`MMGearDrops` ELITE). Economy effect stays D's open item.
- **Angler `tourDay`.** Read with the tournament module: a run belongs to its start day in all 6 call sites; a reload with yesterday's
  run starts today's (the stale run is replaced in `start`). The streak weakness is fixed in section 3.
- **Notebook hooks in the dungeon and the Isles.** Ids are built through `MMNotebook.ids.*` (null for anything that is not a valid id),
  the write is in try/catch, and a known page writes nothing.
- **Backup cleaner.** Uses `MMNotebook.clean` where the module is loaded. The inline fallback (pages with MMBackup but no MMNotebook)
  is looser than the module (any `[a-z0-9_:@]` body, first 300 instead of the earliest 300). No junk can reach a page that shows it,
  because every reader cleans again; left as is.

### Seen, not fixed (for U / G)
- **Notebook focus.** Opening the quest board or the stall while the notebook is open (`nbHide(false)`) removes the focused Close
  button from the page, so keyboard focus falls to `<body>`. Esc order and the button's own open/close are right. Small; U's call.
- **Town label icons, the Fish Tourney sign.** `pixelWorldLabels` runs at the end of `create`, after the sign text is set, so the 3 line
  sign (8 px text, 106 px wrap, on a 120 px board) is converted too: the icon is centred on the whole block (beside line 2, not line
  1) and the text moves 8.5 px right, which by the numbers can reach past the board edge. Not opened in a browser here (Town page,
  time box): G should look at it at 1x and either skip multi-line labels or anchor the icon to the first line. No label loses text:
  every `setText` on a converted label (`homeLabel`, `mailboxLabel`, the tourney sign) starts with a mapped glyph and a space.
- **Realm Gate sign.** The local name label fades when it is within 60 px of `realmGateSign.x`; the conversion moves that x by 8.5 px.
  Harmless.
- **Deepdelve, stale tab.** `runRec` is read at the first dive and at each finish, so a second tab's deeper dive shows on this tab's ghost
  one dive late. With blocked storage each finish starts from an empty record (bests are per dive): as before cycle 2.

## 2. Realm hot path (`realm.js` update / draw, `realm-world.js` tick / draw)
Measured as in cycle 2: the browser's sampling heap profiler over CDP (128 byte interval, collected objects included), the hero
standing among enemies in the Realm world (seed 12345), 600 warm frames then 300 measured. Bytes only; no millisecond claims.

| what | before | after |
|---|---|---|
| all of the game's own code, 29 live enemies (72 pooled) | 4603 B/frame | 2465 to 3386 B/frame (3 runs) |
| `_nearest` (once per live enemy per frame) | one `Math.hypot` per enemy: a boxed number each. 32.2 `Math.hypot` calls per frame; 716 B/frame at 72 live enemies in the first profile | 3.3 calls per frame; 0 B |
| `quietTick` | 250 B/frame: a `'level\|xp\|kills\|shards\|items\|uid'` string every frame | 42 to 46 B/frame: six numbers compared |
| `drawSites` with its callees | 704 B/frame: 3 closures, one `{x, y}` per shrine and per NPC, two key strings per shrine | 0 B/frame: plain loops and numbers |

- `_nearest`: solo (no ready partner) it returns `this.player` at once. Same answers as the old function: an oracle (the old code, word
  for word) over 5600 random points in 7 team states (solo, hero down, host with a ready / down / not ready partner, guest).
- `quietTick`: behaviour pinned for the first time (it had no test): 20 s with progress every 4 s gives no nudge, then 17.5 s without
  progress nudges.
- Test `cyc3-realm-frame-alloc` (browser, Realm world, blockDb): 9 checks, 4 red before.
- What is left is mostly boxed numbers from code that runs once per frame and so stays in the interpreter (`_camStep` about 240
  B/frame, `_draw`, `drawUnder`, `portalTick` about 330), and `_updateEnemies` (about 12 B per live enemy). No object, array or string
  per frame was found in the enemy or bullet loops (they were cleaned in cycles 0 and 1). Not worth more code.

## 3. Clock-sensitive code
### New: `shared/mm-gameday.js` (MMGameDay), the single shared helper
Pure, no storage. It does NOT decide L-08. `utcKey` (= the old `toISOString().slice(0, 10)`) and `localNumber` (= the Angler's
`dayNumber(y, m, d)` of the local date) are the two rules in use today, proven equal to the old expressions in 6 time zones over
2026-2028 (38000+ times each; Lord Howe, Chatham, Apia, Kiritimati). `key` / `number` are the one place L-08 would change.
`streakStep(last, streak, today)` is the Town's L-07 rule on day numbers: run side by side with `main.js` `streakStep` (read out of the
file) on 60000 random cases: no difference. The Town still uses its own copy (main.js not touched: shared file, no behaviour change
wanted); moving it over is one line per call site when the owner decides.

### Fixed: Angler tournament streak (L-07 class)
A device clock that was a day ahead once (or a flight west) left a tournament dated tomorrow. Back on the right day the tournament
could be played again and the finish reset the streak to 1. Now, through `MMGameDay.streakStep`:
- stored day 1 or 2 days ahead: that day is already played. `start` refuses (`reason: 'ahead'`), the streak is kept and shown, and the
  panel says why ("Your streak is safe. The next tournament opens the day after it.") instead of a Start button that does nothing.
  Normal fishing is not locked.
- more than 2 days ahead: playable; the streak is kept, not +1, dated today.
- device date before 2026-11-01 while the streak is dated after it: refused (`'clock'`), nothing changes.
- 12 clock flips between two days: streak 2 at most, 2 tournaments played (the flip cannot farm it; moving the clock forward a day at
  a time still can, as in the Town: no server).
- No save field added (`tour` keeps `last, streak, played, best, medals, run`).
Test `cyc3-gameday-streak`: 32 node checks + 27 browser checks (real page, `page.clock`, UTC / Los Angeles / Kiritimati). The node part
fails on the old module.

### Fixed: Isles day read once per page load
A tab left open over 00:00 UTC (a phone tab can live for days) kept yesterday's gather spots, all taken, and the spent sparkle and
glint budgets until a reload. `dayRoll()` (checked at 5 Hz: one number compare) now moves the open page to the new day and ends in
exactly the state a reload gives: the gather log rolls, today's seeded spots replace yesterday's, yesterday's spots become walk-over
nodes again and today's stop being nodes, the budgets restart. The rule is unchanged (UTC date, now through `MMGameDay.utcKey`);
`?today=` still pins the day. Test `cyc3-isles-day-roll`: 33 checks (3 device time zones, 23:59:30 -> 00:00:30 UTC; the rolled page
equals a reloaded page; one gather per new spot; the collection log is kept).

### Stalk Market
It has no day streak. Its week / half-day slots already guard a clock set back (`clockBack`, `slotBack`). Nothing changed.

### Still open (owner): L-08
Local date or UTC, midnight or 04:00, and whether streaks stay at all. The code is ready: callers that should follow the one rule call
`MMGameDay.key()` / `number()`; today the Isles call `utcKey` and the Angler its own local day, on purpose.

## 4. IDEAS.md against the code
ID-02 and ID-03: `built (S, cycle 1; in play)`. ID-04: `built (S, cycle 2; in play)` with the real save key (`pixeltown-notebook-v1`,
not under the Realm save) and the real panel place (Nexus, not the Lantern). ID-12: `module built, NOT wired` (no page loads
`mm-errands.js`, no save key). ID-13: `floor built, NOT wired` (nothing passes `info.firstKill`). "As built" lines added under ID-04,
ID-12 and ID-13.

## Tests
New, all green on the final tree: `cyc3-chunks-cache-fuzz` 9, `cyc3-dd-path-merge` 13, `cyc3-notebook-blocked` 15,
`cyc3-realm-frame-alloc` 9, `cyc3-gameday-streak` 59, `cyc3-isles-day-roll` 33 (138 checks). All six are in `test-tiers.json`.
Regression run here, green: `cyc2-notebook`, `cyc2-dd-path-replay` (node part), `world-sites`, `world-art`,
`angler-tournament-midnight`, `angler-tournament`, `angler-page`, `angler-bugbash`, `shared-mm-angler-tournament`,
`shared-mm-angler-golden`, `shared-mm-angler`, `archipelago-travel`, `isles-craft`, `beta-g26-isles-economy`, `isles-frame-some`,
`run-all-tiers`, `live-safety`.
Two commit messages give a wrong check count (Realm "11", Isles "30"); the numbers above are the ones that ran (9 and 33).

## Unresolved / for the coordinator
- The full suite and the live-class tests were not run here. Not run: `isles-first-ten` (long), the Deepdelve browser tests, the Town tests.
- Tourney sign icon placement (G), notebook focus when another Nexus panel opens (U): section 1.
- L-08 is still the owner's decision; the Town streaks still use their own copy of the rule.
- New script tag: `mm-gameday.js` in `games/angler/index.html` and `games/isles/index.html`. Both pages fall back to the old
  behaviour when the helper is missing (an old cached page).
- No screenshots: nothing in this cycle changes what is drawn except one new text line in the Angler tournament panel.
