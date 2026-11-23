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
