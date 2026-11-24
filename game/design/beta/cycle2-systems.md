# Cycle 2: Systems (S) notes

Branch `cyc2-systems` from `claude/animal-crossing-game-7z3roh` 2b40e79. Own server on port 9725, every browser run through `/tmp/bt.sh`, Firebase blocked (`blockDb`, `db.attempts() === 0` asserted in every new browser test; no Town page was loaded, so no offlineStub run was needed), targeted tests only. Not pushed.

## Built: ID-04 Hero notebook (knowledge meta-progression)

- Pure module `shared/mm-notebook.js` (MMNotebook, UMD). A page fills in the FIRST time you:
  - kill a creature in a zone: `kill:<pattern>:<creature>@<zone>`, with a hint per bolt pattern (spiral / aimed / ring);
  - kill a world boss: `boss:<boss>@<zone>`;
  - beat a dungeon boss, once per biome: `clear:<biome>`;
  - tame a species on the Isles: `tame:<species>`.
- Knowledge only. No stat, drop or price changes anywhere.
- Save: its own additive key `pixeltown-notebook-v1` = `{v:1, e:{<id>: <first time, ms>}}`, capped at 300 pages (the earliest are kept).
  - This differs from the IDEAS line ("under pixeltown-realm-v1"), on purpose. Three pages write it (Realm world, dungeon, Isles), so a sub-object of the Realm save would have to be written by the dungeon and Isles pages too. The brief asked for a Backup key with a cleaner and label.
  - `record()` re-reads storage before each write. It writes only on a first meet; a known page does no storage write. The Realm keeps an in-memory copy, so a kill costs one `hasOwnProperty` check.
- Backup: added to `MMBackup` KNOWN (57 keys, MAX_KEYS 80). It has an owner cleaner (`MMNotebook.clean`) and an inline fallback for the pages that load MMBackup without the module, plus the label "hero notebook". Documented in SAVE-KEYS.md.
- Panel (U, please review against EIGHTBIT-STYLE.md):
  - A `Notebook (N)` button sits in the Nexus header (`#rw-nx-notebook-btn`, aria-controls / aria-expanded, aria-label "Hero notebook: N pages, K new this visit").
  - It opens `#rw-nx-notebook.nx-board.nx-notebook`: role region, labelled by its h3. It reuses the quest board's card and its desktop side placement. It has a Close button (focus goes there on open and back to the button on close), one list per category with an empty-state hint, and the line "Knowledge only: pages never change your stats".
  - Esc closes the notebook first, then the Nexus (G-12 order). It is appended after the quest board, so `#rw-nexus .nx-board` still finds the board (`beta-g12-esc-close` caught the first version).
  - A new page shows a float text "New notebook page: <name>".
  - `?notebook=0` turns it off. Test hook `__mm.world.notebook`.
- Screenshots: `img/cyc2-notebook-desktop.jpg` and `img/cyc2-notebook-phone.jpg`.
- Test `tests/cyc2-notebook.test.js` (node + browser, ALL PASSED). It checks:
  - ids, the cleaner, the cap, merge, sections and titles;
  - that a known page writes nothing;
  - the Backup round trip, the cleaner and refusals;
  - that a real kill writes one page and a second kill of the same creature makes 0 writes;
  - that a world-boss kill adds a boss page;
  - the button text and label at 44 px, the region, the listed pages, focus and Esc;
  - phone 390x844: all pages fit with no sideways scroll, every button is at least 44x44, text is at least 13 px;
  - `?notebook=0`, no page errors, 0 DB requests.

## Fixed (found while building)

| # | Area | Bug | Fix | Test (before -> after) |
|---|---|---|---|---|
| 1 | Realm elite drops | `onEnemyKilled` tested `e.type === 'giant_spider_queen'`, but `e.type` is the bolt pattern (`'aimed'`). So the rare Godlands elite never rolled `src: 'elite'` and the MMGearDrops ELITE row (T9-T11) was dead in play. | Uses the zone group's `info.creature`. `lastDrops` entries carry `src` (additive). | `cyc2-notebook` elite case on seed 100000: with the old line, FAIL (`src: 'mob'`); after the fix, PASS (`src: 'elite'`, zone 3). |

D / economy: this turns on an intended but dead drop row. The elite spawns with chance 0.2 per eligible Godlands sniper cell.

## Built, OPT-IN: Isles wanderers slide along walls (`?wslide=1`)

- `wanderTurn` in isles.js handles a wandering creature (random heading, no target) whose heading is blocked a short probe ahead. It turns 45 / 90 / 135 degrees to a sticky side and keeps its speed.
- It draws no random numbers.
- Chasers, the leash, fleeing and curious walkers are untouched.
- Test handles: `__isles.wallBumps()` and `__isles.wslide`.
- Test `tests/cyc2-isles-wander-slide.test.js`: in a walled 7x7 pen over 40 s, wall bumps went from 8 to 0 with the same path length (25.6 tiles). The walker never leaves the pen or stands in a wall. ALL PASSED.
- **Why it is opt-in:** with it on by default, `isles-first-ten` (run alone) failed one reward-gap gate.
  - Reef-b first tame stayed fine (129.2 s, limit 180).
  - But `isles2-mars-b maxRewardGap` went to 48.7 s against a limit of 45.
  - A 90-degree-first variant fixed mars-b (40.5 s) but pushed `isles2-tundra-b` to 45.8 s.
  - With it off (the default now), `isles-first-ten` passes exactly as on the base (mars-b 40.5 s).
  - The bot's reward cadence is chaotic under any movement change. The next step is to re-tune the bot's routes or the gate with D, not to weaken the gate.
- Also passing (default behaviour): cyc1-isles-wall-slide, cyc0-isles-leash, isles-taming, isles-ftue-fixes, isles-bugbash.

## Built: DD5 Deepdelve path replay (sparse)

- Measured first, with a scratch script (not in the repo): software GL at 1280x720, 3 alternating 4 s windows, with and without a 120-point THREE.Points + THREE.Line trail.
  - Without the trail, average frame time was 74 / 41 / 45 ms.
  - With it, average frame time was 61 / 42 / 34 ms.
  - The difference is inside the noise. It is 2 draw calls with a static buffer, so it fits the budget.
- `dd-run.js`:
  - `sample()` records one half-block point per second. At 64 points it thins to every other point and doubles the interval, so a whole dive stays under 64 points.
  - An additive `seedPath` field holds the path of the deepest dive per seed: at most 8 seeds, only seeds that have a seedBest.
  - `save` merges so that the deeper tab's path wins.
  - Old records load with `{}`.
- `deepdelve.js`: the next dive on that seed draws the trail once per dive, also right after the renderer starts. `?ghost=0` hides it. Hook: `__dd.run.ghostPath()`.
- Note: the trail materials compile on their first draw. They are not in `prewarmPrograms`, so expect one small compile hitch on the first dive that has a path.
- Test `tests/cyc2-dd-path-replay.test.js` (node + browser, ALL PASSED). It checks:
  - the rate, thinning and cap;
  - the hostile clean;
  - that finish only replaces the path on a new seed best;
  - the stale-tab merge;
  - that a seeded path is drawn on load (30 points);
  - that a scripted deeper dive saves its own path and the next dive draws it;
  - that `?ghost=0` draws nothing;
  - 0 DB requests.

## Started, not wired: ID-12 Town-to-Realm errand chain

- Pure state machine `shared/mm-errands.js`:
  - Step 1, Town: Mocha packs a parcel from 3 of your wood (Town save `errand: {id, s:1}`).
  - Step 2, Realm: the Nexus Vendor takes the parcel (Realm save `errand: {id, p:1}`). Then any kill in zone 1 or deeper gives the trophy (`d:1`).
  - Step 3, Town: Mocha takes the trophy and gives the one-time decor `realm_lantern` (`s:2`).
- Each page writes only its own save and reads the other one through `cleanTown` / `cleanRealm`.
- Test `tests/cyc2-errands.test.js` (node, ALL PASSED). It checks:
  - the exact order, with no skips or repeats;
  - the one-time reward;
  - that inputs are never mutated;
  - that a forged Realm trophy cannot finish a chain the Town never started;
  - hostile saves.
- NOT wired. Wiring needs three pieces. Not started: the time box ran out.
  - Town (main.js): a `talkToVillager` branch for Mocha; `errand` in `TOWN_SAVE_FIELDS` and the Town three-way merge; the reward decor item.
  - Realm: the vendor line in `nxTalk`, plus the kill hook next to `nbMeet`.
  - A Town browser test (offlineStub + `db.attempts() === 0`).

## Checks run (all on port 9725 through /tmp/bt.sh)
- New: cyc2-notebook, cyc2-isles-wander-slide, cyc2-errands, cyc2-dd-path-replay (ALL PASSED).
- Backup / saves: shared-mm-backup, beta-r4-o04-backup, beta-s03-backup-skip, save-hostile-fuzz (its KNOWN-BUG line about pregear / arcane-frontier is unchanged and was there before), lantern-backup-restore, beta-r4-o04-town-hub-backup.
- Realm: beta-w04-nexus, beta-g12-esc-close, gear-world-drops, world-roster, gear-signature-drops, beta-g24-dungeon-doors.
- Isles: isles-first-ten (alone; ALL PASSED with the wander turn off by default, see above), cyc1-isles-wall-slide, cyc0-isles-leash, isles-taming, isles-ftue-fixes, isles-bugbash.
- Deepdelve / saves: save-hostile-fuzz, save-race-tabs, deepdelve-ghost, deepdelve-dive, beta-g10-placed-blocks, deepdelve-perf (governor off 59.6 fps), deepdelve-fps (baseline 37.9 fps, managed 40.1 fps), save-compat-pages: ALL PASSED.
- run-all-tiers and live-safety: ALL PASSED.

## Asks
- U: review the notebook panel markup and CSS (the `nxCss +=` block in realm-world.js, under the quest board CSS). Fold it into your Nexus styles if you prefer.
- D: ID-04 can move to `built`. Check the elite fix's economy effect and the hint texts. ID-12 is a pure module only and still needs wiring next cycle.
- L: the notebook uses its own key, not `realm-v1.notebook` (the reason is above).
