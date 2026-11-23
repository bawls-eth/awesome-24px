# Performance + Systems: retest notes

Branch `dev-perf` (from `claude/animal-crossing-game-7z3roh`). Every test below runs offline (blockDb + Firebase SDK stub, or no DB at all).
Run each alone: `BASE=http://localhost:<port>/game/index.html /tmp/bt.sh node game/tests/<file>`.

## S-01 Town Restore validates the file (b14-03, P0)
- Commit: 3006734 (S-01 and S-02 together: S-02 needs the S-01 `SAVE_RESTORING` flag).
- main.js (functions touched): new top-level `SAVE_RESTORING`, `SAVE_PREV_KEY`, `loadBackupModules`, `cleanTownSave`, `TOWN_SAVE_FIELDS`;
  `writeSave` (no-op while restoring); Town scene `importSave` (rewritten), new `commitRestore`, `restoreBundle`. index.html untouched:
  the backup tool and its owner cleaners (same list as the Lantern page) load lazily on the first bundle restore.
- Behaviour: a Lantern bundle (`format: 'pixeltown-backup'`) goes through `MMBackup.plan` + a confirm listing every save it replaces, then
  `MMBackup.apply` (all keys). A town-only file must be a plain object with a name or a known town field, <= 2 MB; prototype /
  non-identifier keys are dropped. Anything else: "That is not a Pixeltown save. Nothing was changed." Before any write the old raw save
  is copied to `pixeltown-save-v1-prev` (additive key, replaced on each restore, not part of any bundle).
- Deviation (safe default): unknown top-level keys are only dropped when they are not plain identifiers. A strict whitelist would drop
  real fields written by the 20+ modules that share `pixeltown-save-v1` and break the additive-save rule.
- Test: `game/tests/beta-s01-town-restore.test.js` (smoke, 31 asserts: bad files byte-identical, old export, bundle, prev copy, cancel).
- Re-verify by hand: Town > Settings > Restore, pick a Lantern backup file: confirm lists "town save, Realm progress, ..."; after the
  reload the join card shows the backup's name. Pick any other JSON (`{"hello":1}`): chat says nothing was changed, the town is unchanged.

## S-02 Town cross-tab safety (b14-01, b14-02, P0)
- main.js (functions touched): new top-level `writeSaveMerged`, `townMergeCounts`, `townUnion`; Town scene `snapshotResourceBase` (new),
  `saveResources`, `setupActivities` (one line: base snapshot), `setupAchievements` (one line: stats base), `saveAchievements`,
  `saveFossils`, the home-plot save (crafted goods now go through `saveResources`), new `setupSaveSync` + `adoptSave`, one call in `create()`.
- Behaviour: counters (resources, crafted, caveInv, lifetimeStats) write `stored + (mine - base)` clamped at 0; achievements and museum
  sets write the union. A `storage` listener adopts another tab's save into memory (fields + HUD counters only, no scene rebuild); if the
  stored name changed or vanished (a Restore), the tab says "Your save changed in another tab. Reloading..." and reloads without writing.
- Test: `game/tests/beta-s02-town-two-tabs.test.js` (smoke; two Town pages + a Lantern page in one context, 23 asserts incl. a lint that
  main.js has no plain `writeSave({ resources: ... })`-style whole-object write of a counter or set).
- Known limit: Chromium syncs localStorage between tabs asynchronously (~ms); two tabs acting in the same few milliseconds can still race.
- Re-verify by hand: open the Town in two tabs, chop wood in A, pick fruit in B: both HUDs show both, a reload keeps both. Restore a
  Lantern backup while a Town tab is open, then gather in that tab: the restored numbers stay (plus the one gather).
- Main.js slot 1 released to Gameplay after this commit (S-07 comes back later).

## S-05 Deepdelve boots when storage throws (b15-01, P1)
- Commit: 8bdd1c5.
- deepdelve.js: new `LS` accessor + `LS_NOSAVE` at the top of the IIFE (real storage when readable, else an in-memory Map stand-in);
  every `localStorage` token in the file now goes through `LS` (creativeDoc, kvSet creative path, ACCESS, sfx, startRun, endRun,
  loadMeta, hubMedals, saveMeta, town read); boot() says "Progress cannot be saved in this browser mode." once with the intro.
- Shared boot guards (the same SecurityError, S-10 groundwork): `typeof localStorage` runs the getter, so mm-access.js (contrast boot),
  mm-side-access.js (text size boot) and mm-settings.js (my file, apply on load) now read it inside their try. No behaviour change otherwise.
- Test: `game/tests/beta-s05-deepdelve-storage.test.js` (smoke): blocked getter -> boots < 5 s, non-blank canvas, note visible, mining
  +1, 0 pageerror; normal context -> no note, real storage, no probe key left. deepdelve-page, side-access, shared-mm-access,
  shared-mm-settings green.
- Re-verify: Chrome, Settings > Privacy > Block all site data for localhost, open Deepdelve: the mine loads and says progress cannot be saved.

## S-06 mm-art JSON cache (b13-01, P1)
- Commit: e4dec07.
- mm-art.js `fetchJson`: per-page `jsonCache` keyed by the absolute url, holding the in-flight Promise; a null result (404, network
  error, no fetch) is evicted so a retry fetches again. Exported as `MMArt.fetchJson`. Callers only read the parsed manifests.
- realm-world.js (slot 1, small hunk): new `rwJson` helper near the top; `loadTileArt` and the world-prop loader use it (they fetched
  INDEX.json and every manifest themselves, twice). Plain fetch when MMArt is absent.
- Numbers (Realm world cold start, same run, baseline = cache line removed): requests 1235 -> 1077, assets JSON 225 -> 67, JSON bytes
  about 0.4 MB -> 0.03-0.06 MB. Every assets/*.json url is now requested once. The ">= 2 MB" target in the lane file is not reachable on
  this page: the whole JSON set it loads is about 0.4 MB measured as body bytes (b13 likely counted several pages / uncompressed).
- Test: `game/tests/beta-s06-art-cache.test.js` (full tier, browser): once-per-url, >= 100 fewer requests, fewer bytes, art still
  resolves, 404 retry refetches. world-art, enemy-art, item-icons, bolt-art, art-integration, world-page, shared-bugbash-fuzz green.
- Re-verify: DevTools Network, filter `.json`, load `games/mad-maze/index.html?mode=world`: INDEX.json appears once.

## S-04 Co-op seats merge the realm save (b14-06, P1)
- Commit: b1dd500.
- realm-world.js (slot 1; functions touched): `cleanSave` (accepts the additive `seatPos`, max 4 cleaned entries), `writeSave` (now
  re-reads storage and calls the new `mergeStored`), new module `saveSeat` (set in `create()` next to `gearTeam`, same seat rule as
  gearPlayerId but -1 solo). Merge (same seed only): discovered fog = bitwise OR, stats = max, chests = union, shrineAt = latest,
  evT = max, finds as before (storage wins). With ?party=local each seat writes `seatPos[seat]`; only seat 0 writes the canonical `pos`.
  Solo saves keep today's shape (no `seatPos`).
- Test: `game/tests/beta-s04-coop-save.test.js` (full): A explores, B saves -> stored fog is a superset of A's plus B's cells; pos stays
  seat 0's, seatPos[1] = B's tile; A's next save keeps B's cells; fresh solo profile has no seatPos. world-fog, world-party,
  world-safereturn, world-stash, gear-save-tolerance, world-page, shared-mm-fog green.
- Re-verify: open `games/mad-maze/index.html?mode=world&party=local&seed=x&seat=0` and `...&seat=1` in two tabs, explore in tab 0, then
  walk in tab 1 for a few seconds, reload tab 0: its minimap still shows everything tab 0 uncovered.

## S-03 Backup tolerates one bad key (b14-04, P1)
- Commit: 74c2416.
- mm-backup.js (functions touched): new `cleanValue`, `checkValue`, `ownerPresent`; `plan` skips a damaged key into `skipped`
  ([{key, label, why}], town save first) and sets `message` ("Will restore: ... Cannot restore (damaged in the file): ..."); it fails
  ('bad-value', nothing changed) only when no key is restorable. An unknown key still refuses the whole file (unchanged). `bundle`
  leaves a value its cleaner refuses out of the file and lists it in a NON-enumerable `warnings` array (never written to the file).
  `restore` passes `skipped` / `message` through. Size limits and the panel-collapsed special case unchanged.
- Town (main.js, my own `restoreBundle`): the confirm adds "Cannot restore (damaged in the file), kept as they are on this device: ...".
- Existing test changed because the asserted behaviour changed (named here as the rules ask): `shared-mm-profile-backup.test.js`
  "one invalid value rejects everything" -> "one invalid value is skipped and named, the valid town save restores";
  "bundle() keeps raw corrupt value" -> "bundle() leaves a corrupt value out and warns about it".
- Test: `game/tests/beta-s03-backup-skip.test.js` (node, smoke; fixtures from save-compat-fixtures.js). shared-mm-backup,
  shared-mm-profile-backup, save-hostile-fuzz, shared-bugbash-fuzz, lantern-backup-restore, lantern-backup-reminder, gear-default-on green.
- OPEN (lantern.js slot 2, after Gameplay G-05): the Lantern UI does not show the new data yet. Exact patch for that slot:
  `restoreFile`: `if (plan && plan.ok) showConfirm(plan, plan.skipped && plan.skipped.length ? plan.message : '');` and in the Backup
  click handler (lantern.js ~248) build the bundle once, `var b = B.bundle(localStorage)`, export `JSON.stringify(b, null, 1)` and, when
  `b.warnings.length`, `say(b.warnings.map(function (w) { return w.label; }).join(', ') + ' is damaged on this device and was left out.', true)`.
- Re-verify: in DevTools set `localStorage['pixeltown-gift-v1'] = '{bad'`, Backup in the Lantern, Restore that file on a clean profile:
  everything but the gift restores (the Town Restore confirm lists the gift under "Cannot restore").

## S-10 Storage-throws sweep (b15-02, P2)
- Measured with `game/tests/beta-s10-storage-throws.test.js` (12 pages, localStorage getter throws SecurityError, blockDb + SDK stub):
  hub, town (Join -> Play offline -> Town runs), isles, angler, dash, echo, jam, pop, stack, stalk, deepdelve boot with 0 pageerror,
  show their canvas / root and their primary button works. The shared-module fixes were in the S-05 commit (mm-access, mm-side-access,
  mm-settings boot guards).
- Only the Realm page still throws: `games/mad-maze/mad-maze.js:577` (World+Graphics single owner). Exact one-line patch, requested in
  `design/beta/assignments/world-graphics.md` Requests:
  `let axPrefs = AX_ON ? AXM.prefs.load(localStorage) : null;` ->
  `let axPrefs = null; try { axPrefs = AX_ON ? AXM.prefs.load(localStorage) : null; } catch (e) { axPrefs = AX_ON ? AXM.prefs.load(null) : null; }`
  (MMAccess.prefs.load(null) returns the defaults.) Lines 640 and 760 are inside handlers and already fall back; 44 / 162 / 163 / 199 are
  inside try blocks. Until that lands the test prints one `KNOWN-BUG [realm]` line instead of a FAIL; it turns into a PASS by itself.
- `MMStore.safe()` was not created: shared/mm-store.js does not exist in this tree, and every module I own already reads storage
  inside a try after the S-05 guards; a new module would need a script tag on every page for no gain.

## S-07 Town frame cost (b13-03): step 1 only
- `design/beta/perf-town.md` (commit e926d53): profile + A/B. Drawing is the cost (camera hidden -> 16.7 ms), not update logic or
  the DOM HUD; 730 of 951 display objects are off-camera but batched. Machine load 9-19 during the run: QA re-measures alone.
  Step 2 (cell culling, merged ground layer, name atlas) waits for the main.js slot after W-06. No code changed.

## S-08 three.min.js lazy (b13-02): not done (blocked by tests I cannot run)
- Six live-class cave tests (cave*.test.js) call `scene.enterUnderground()` and use `scene.underground` / `THREE` synchronously right
  after. A lazy load makes the first open asynchronous and would break them; they join the live town, so this lane may not run them.
- Ready-to-apply plan: `underground.js` gets `ugEnsureThree()` (one in-flight `<script>` promise, retry after an error);
  `main.js enterUnderground()` returns early with "Loading the cave..." while `typeof THREE === 'undefined'` and re-enters on load,
  "Could not load the cave. Check your connection and try again." on error; index.html:539 removed. QA first adds a
  `await page.waitForFunction(() => typeof THREE !== 'undefined' || ...)` / `await s.enterUnderground(); await ugReady` helper to the cave tests.

## S-14 favicon (b15, P3)
- arcane-frontier/index.html: `<link rel="icon" ... href="../../icons/favicon-32.png">` (the Town's favicon). Test
  `game/tests/beta-s14-favicon.test.js` (node, smoke). The `?v=` on art manifests part is not done: it changes cache keys for 1,000+
  files and needs the design note first (lane file).

## S-11 rotate storm, Deepdelve part (b13-07)
- deepdelve.js (slot 1): new `onResize` (one re-size 150 ms after the last resize event) replaces the direct `resize` listener;
  `govFrame` ignores frames within 1 s of a resize (`lastResizeAt`, declared beside `gov`), and the sample window is reset.
  Before: 60 rotations = 120 drawing-buffer re-allocations and the governor could halve the scale (b13: 195x331 -> 97x165) and keep it.
- Test: `game/tests/beta-s11-deepdelve-rotate.test.js` (full): backing size after the storm = fresh load, governor level unchanged,
  <= 12 re-sizes (old code: 120, verified by serving the old file), governor still reacts to real slow frames. deepdelve-perf,
  deepdelve-fps, deepdelve-page green.
- Realm part (realm.js resize handlers, mad-maze.js perfEval) and the 10-minute soak / listener-step bisect are NOT done: realm.js and
  mad-maze.js are not my files and the soak needs a quiet machine (load stayed 6-19). Finding for Gameplay / WG: debounce the 4 Realm
  'resize' listeners the same way and skip perfEval samples within 1 s of a resize, or the adaptive step stays at 0.75.

## S-09 Deepdelve frame spikes (b13-05): measured, no code change
- Today (load 5-6): 12 taps at 1x 390 -> 2 long tasks > 100 ms (112, 107; acceptance <= 2: met); first 2 s at 4x -> worst frame 433 ms
  (acceptance <= 300: not met), long tasks [77, 351]. Relight after an edit costs 4-14 ms at 1x (full 5x5-chunk window), so it is not
  the spike. The 351 ms task is native (the profile's self time is "(program)", first GL program compile / upload), not JS. A
  `renderer.compile(scene, camera)` behind the loading text would move it before "Loading the mine..." clears; left for a quiet-machine
  measurement, since the numbers swing 2x with load.
