# Save keys (every key the game writes to the browser)

Inventory from a grep of the whole repo on 2026-11-23 (`localStorage` / `sessionStorage` / `indexedDB`, every `pixeltown-*` and `mm-*`
literal, every `*KEY = '...'` constant). All keys are **device-only**: nothing here is sent to Firebase. Rules (AGENTS.md): additive only,
never rename or drop a key, never drop a field a player could have; a cleaner turns anything corrupt into defaults without throwing.

Tests: `game/tests/save-hostile-fuzz.test.js` (node: old fixtures, hostile values, full / throwing storage, two-tab writes, hero compat,
backup coverage) and `game/tests/save-compat-pages.test.js` (browser: every page with old fixtures, hostile values, a full storage and a
blocked storage). Fixtures: `game/tests/save-compat-fixtures.js`. Open bugs: `game/design/bugbash/saves.md`.

Class: **progress** = a player would be sad to lose it (must be in the Backup export); **pref** = a setting; **ui** = a hint / pointer / cache.
Backup: yes = exported by `MMBackup` (shared/mm-backup.js KNOWN), **NO** = not exported (Backup -> Restore on a new device loses it).

## localStorage

| key | owner (writer) | shape | ver | validator (reader) | class | backup |
|---|---|---|---|---|---|---|
| `pixeltown-save-v1` | main.js `writeSave` (merge-spread), realm.js (`realm` sub-object, rmMergeSave), deepdelve.js, mad-maze.js, hub/gift.js, mm-home-build / mm-homestead / mm-tames / mm-isles (sub-objects) | Town save `{name, species, frame, resources, lifetimeStats, achievementsUnlocked, realm:{...}, home, errand, ...}` + unknown keys kept; `errand` (cyc3-S ID-12) = MMErrands.cleanTown `{id, s}` (0 none, 1 carrying, 2 done: the Realm lantern decor), written by main.js only, forward-only merge; `visitDays` / `lastVisitDate` / `sellDays` / `lastSellDay` (cyc8-S ID-09) = forgiving day counts (integer, never lowered; UTC 'YYYY-MM-DD'), seeded once from `loginStreak` / `sellStreak`; `bounty` (cyc8-S ID-18) = `{d: 'YYYY-MM-DD' UTC, s: {<id>: [count, claimed 0/1]}}`, cleaned on load (unknown ids dropped, counts clamped), written before its stars are paid | v1 (no field) | main.js `loadSave` (plain object or `{}`), per-field sanitizers in Town `create`, realm.js `rmCleanSave` | progress | yes |
| `pixeltown-realm-v1` | games/mad-maze/realm-world.js, realm.js (`gp`), lantern.js | `{v, seed, version, pos, stats, evT, evDone, discovered, shrineAt, chests, quests, bossKeys, bossPortal, questBags, gp, finds, zk, errand, ...}` unknown keys kept; `zk` (cyc3-S ID-13) = int 1..15, bit z = first world boss of zone z died (first-kill bag floor spent), union-merged; `errand` (cyc3-S ID-12) = MMErrands.cleanRealm `{id, p, d}`, forward-only merge | 1 | realm-world.js `cleanSave`, MMFog.clean, MMStash.readFinds | progress | yes |
| `pixeltown-mm-v1` | shared/mm-profile.js, mm-stash.js, mad-maze.js, lantern.js, hub/gift.js | `{v, heroes:[{id,name,cls,level,xp,fame,bonus,mode,items,keepsake}], stash[16], fame, mode, hall, migratedFrom}` | 1 | MMProfile.clean | progress | yes |
| `pixeltown-mm-active-v1` | mm-profile.js, mad-maze.js | `{v, heroId}` | 1 | MMProfile.cleanActive | progress | yes |
| `pixeltown-profile-v1` | shared/profile.js (MMHubProfile.save / sync / report) | `{v, id, created, name, species, frame, settings, map, nodes, keys, keysUsed, comets, tokens, unlocks, games:{g:{done:[]}}, results}` | 1 | MMHubProfile.sanitize / seedFromTown | progress | yes |
| `pixeltown-hub-v1` | hub/hub.js, hub/home.js, mm-map.js | `{v, at, nodes, seenPaths, keys, keysUsed, comets}` | 1 | MMMap.cleanHub | progress | yes |
| `pixeltown-archipelago-v1` | shared/mm-isles.js (write), isles.js, mm-homestead.js | `{v, at, returnTo, unlock, isles, home, log, rides, wild, visited, bosses, gather, inv}` | 1 | MMIsles.clean (MAX_BYTES) | progress | yes |
| `pixeltown-tames-v1` | shared/mm-tames.js | `{v, n, roster:[{id,sp,nm,...}], party, mount}` | 1 | MMTames.clean | progress | yes |
| `pixeltown-medals-isles-v1` | mm-isles.js | `{v, m:[id]}` | 1 | MMIsles.cleanMedals | progress | yes |
| `pixeltown-jam-v1` | games/jam/jam.js, mm-jam-songs.js | `{v, best:{song:{diff:{stars,score}}}, plays, fullCombo, prefs}` | 1 | jam.js load + MMHubMedals.clean | progress | yes |
| `pixeltown-jam-assist-v1` | jam.js `persistAssist` | `{on, best, section}` | none | jam.js `cleanAssist` | progress | yes |
| `pixeltown-deepdelve-v1` | games/deepdelve/deepdelve.js | `{v, mode, goals:{bronze,silver,maxDepth,...}, cave}` | 1 | deepdelve.js meta cleaner | progress | yes |
| `pixeltown-deepdelve-runs-v1` | games/deepdelve/dd-run.js (MMDDRun.save) | `{v, runs, safe, best:{score,depth,ores,combo}, seedBest?:{"<seed>":depth}}` (cyc0-S: additive `seedBest`, deepest dive per world seed, max 32, merged by max; cyc2-S: additive `seedPath:{"<seed>":[[x,y,z],...]}`, a sparse path of that deepest dive, <= 64 half-block points, <= 8 seeds, only seeds with a seedBest, merged with the deeper tab's seedBest) | 1 | MMDDRun.clean | progress | yes |
| `pixeltown-deepdelve-creative-v1` | deepdelve.js | creative world meta `{v, ...}` | 1 | deepdelve.js | progress | yes |
| `pixeltown-angler-v1` | games/angler/angler.js | journal `{v, caught:{sp:{n,best}}, cove, tour, ...}` | 1 | MMAngler.journal.clean | progress | yes |
| `pixeltown-angler-fun-v1` | angler.js `saveFun` | `{v, bestStreak, bestReact, streak, cond:{name:{size,react,n}}}` | 1 | angler.js `cleanFun` | progress | yes |
| `pixeltown-stalk-v1` | games/stalk/stalk.js | `{v, medals:{bronze,silver,gold}, played, ...}` | 1 | stalk.js | progress | yes |
| `pixeltown-stalk-practice-v1` | stalk.js `prPersist` | `{v, n, best, rounds, hasBest, moodBest}` | 1 | stalk.js `cleanPr` | progress | yes |
| `pixeltown-bugs-v1` | games/festival/bugs.js | `{v, stars:{arena:n}, best:{arena:n}, journal:{sp:n}}` | 1 | MMBugs.cleanSave | progress | yes |
| `pixeltown-bugs-goals-v1` | bugs.js | `{v, done:{arena:[goalId]}}` | 1 | MMBugs.cleanGoals | progress | yes |
| `pixeltown-bugs-pb-v1` | bugs.js | `{v, combo:{arena:n}, runs, mod:{arena:{mod:n}}}` | 1 | bugs.js `cleanPb` | progress | yes |
| `pixeltown-dash-v1` | games/dash/dash.js | `{v, hint, best, bestScore, bestCombo, runs, medals, ghost}` | 1 | dash.js `load` (< 120 kB) + `cleanGhost`, merge-on-write | progress | yes |
| `pixeltown-pop-v1` | games/pop/pop.js | `{v, hint, best, bestTile, bestChain, rounds, medals}` | 1 | pop.js `load` (< 120 kB), merge-on-write | progress | yes |
| `pixeltown-stack-v1` | games/stack/stack.js | `{v, hint, best, bestCombo, rounds, medals}` | 1 | stack.js `load` (< 120 kB), merge-on-write | progress | yes |
| `pixeltown-echo-v1` | games/echo/echo.js | `{v, hint, best, bestScore, rounds, medals}` | 1 | echo.js `load` (< 120 kB), merge-on-write | progress | yes |
| `pixeltown-medals-angler-v1` | angler.js | `{v, m:[id]}` | 1 | MMHubMedals.clean | progress | yes |
| `pixeltown-medals-bugs-v1` | bugs.js | `{v, m:[id]}` | 1 | MMHubMedals.clean | progress | yes |
| `pixeltown-medals-dash-v1` | dash.js | `{v, m:[id]}` | 1 | MMHubMedals.clean | progress | yes |
| `pixeltown-medals-deepdelve-v1` | deepdelve.js | `{v, m:[id]}` | 1 | MMHubMedals.clean | progress | yes |
| `pixeltown-medals-echo-v1` | echo.js | `{v, m:[id]}` | 1 | MMHubMedals.clean | progress | yes |
| `pixeltown-medals-pop-v1` | pop.js | `{v, m:[id]}` | 1 | MMHubMedals.clean | progress | yes |
| `pixeltown-medals-stack-v1` | stack.js | `{v, m:[id]}` | 1 | MMHubMedals.clean | progress | yes |
| `pixeltown-medals-stalk-v1` | stalk.js | `{v, m:[id]}` | 1 | MMHubMedals.clean | progress | yes |
| `pixeltown-arms-v1` | games/mad-maze/mad-maze.js | `{v, seen:[id], ...}` weapon unlocks | 1 | mad-maze.js | progress | yes |
| `pixeltown-notebook-v1` | shared/mm-notebook.js `record` (re-reads before every write; first meet only), written from realm-world.js (first kill per creature per zone, first world-boss kill), dungeon.js (first clear per biome), isles.js (first tame per species) | `{v, e:{<page id>: <first time, epoch ms>}}`, ids `kill:<pattern>:<creature>@<zone>`, `boss:<boss>@<zone>`, `clear:<biome>`, `tame:<species>`, max 300 pages (cyc2-S ID-04) | 1 | MMNotebook.clean | progress | yes |
| `pixeltown-gift-v1` | shared/mm-gift.js, hub/gift.js | `{v, days, last:'YYYY-MM-DD'}` | 1 | MMGift.clean | progress | yes |
| `pixeltown-feedback-v1` | shared/mm-feedback.js (re-reads before every add / delete) | `{v, entries:[{id,t,k,page,text,ua}]}` | 1 | MMFeedback.clean | progress | yes |
| `pixeltown-backup-pregear-v1` | shared/mm-backup.js `snapshotPregear` | backup bundle `{format, v, at, keys:{key:raw}}` (<= 1 MB) | 2 | MMBackup.planRestorePregear | progress | n/a (is a backup) |
| `pixeltown-access-v1` | mm-settings.js, mm-access.js, realm.js, mad-maze.js | `{v, palette, hudScale, flashes, bulletOutline, lowGfx}` | 1 | MMAccess.prefs.clean / load (<= 2 kB) | pref | yes |
| `pixeltown-nav-v1` | shared/mm-nav.js | `{v, last:{id,sub,url,t}, prev}` | 1 | MMNav.clean (safe URLs only) | ui | no (device: last page on this device) |
| `pixeltown-calm-v1` | hub/calm.js, hub/home.js | calm-corner state `{v, ...}` | 1 | calm.js load | ui | yes |
| `pixeltown-realm-audio-v1` | games/mad-maze/realm-audio.js | `{v, ...}` volume prefs | 1 | realm-audio.js | pref | yes |
| `pixeltown-realm-tutorial-v1` | games/mad-maze/realm-tutorial.js | `{v, ...}` tutorial steps seen | 1 | realm-tutorial.js | ui | yes |
| `pixeltown-gearhint-v1` | realm.js, realm-world.js | `'1'` | none | `=== '1'` | ui | yes |
| `pixeltown-backupnote-v1` | games/mad-maze/lantern.js | `'1'` / timestamp | none | lantern.js | ui | no (device: when this device last backed up) |
| `pixeltown-gate-pointer-v1` | main.js `loadGatePointer` | `{v, dismissed, reached}` | 1 | main.js | ui | yes |
| `pixeltown-panel-collapsed` | main.js | `'1'` / `'0'` | none | `=== '1'` | ui | yes |
| `pixeltown-hub-hint-v1` | hub/hub.js | `'1'` | none | `=== '1'` | ui | yes |
| `pixeltown-bugs-hint-v1` | bugs.js | `'1'` | none | `=== '1'` | ui | yes |
| `mm-sfx-muted` | shared/sfx.js, mm-chip.js, mm-settings.js, realm.js | `'1'` / `'0'` | none | `=== '1'` | pref | yes |
| `mm-music` | mm-settings.js | `'1'` / `'0'` | none | flag | pref | yes |
| `mm-high-contrast` | mm-settings.js | `'1'` / `'0'` | none | flag | pref | yes |
| `mm-reduce-motion` | shared/motion.js, mm-settings.js, realm.js | `'1'` / `'0'` | none | MMMotion.reduced | pref | yes |
| `mm-aim-assist` | realm.js, mm-settings.js | `'1'` / `'0'` | none | `!== '0'` | pref | yes |
| `mm-auto-fire` | mm-settings.js, realm.js, isles.js | `'1'` / `'0'` | none | flag | pref | yes |
| `mm-aim-toggle` | mm-settings.js, isles.js | `'1'` / `'0'` | none | flag | pref | yes |
| `mm-bullet-shapes` | mm-settings.js | `'1'` / `'0'` | none | flag | pref | yes |
| `mm-nav-dest-text` | mm-nav.js | small UI flag | none | mm-nav.js | ui | no (UI flag) |
| `arcane-frontier-save-v1` | games/arcane-frontier/js (separate prototype) | its own save | 1 | arcane-frontier | progress | n/a (separate game) |

Town heroes (2026-11-23): the hero choice is carried in the existing `species` / `frame` fields of `pixeltown-save-v1`,
`pixeltown-profile-v1` and the Firebase presence record (`hero_<class>`, frame 0). Legacy species keys (coolcats, punks, ...,
punkettes, mooncats) are NEVER rewritten: `MMTownHeroes.resolve` maps them to a hero at draw time (FNV-1a of `species:frame`).

## R4 O-04: one Backup (2026-11-24)
The Backup buttons on the Town (More > Backup), the Lantern Camp and the Hub Home (Backup and restore) all write the SAME file:
`MMBackup.bundle(localStorage)` = `{format: 'pixeltown-backup', v: 2, build, made, scope: 'all', keys: {key: raw}}`, every key in
`MMBackup.KNOWN` that this device holds (every progress key above plus all settings: the `mm-*` flags, `pixeltown-access-v1`,
`pixeltown-realm-audio-v1`, and the "seen" hints). `build` / `made` / `scope` are additive: older builds ignore them.

Left out on purpose (device-specific): `pixeltown-nav-v1`, `pixeltown-backupnote-v1`, `pixeltown-save-v1-prev`,
`pixeltown-backup-pregear-v1`, probe keys, sessionStorage, the Deepdelve IndexedDB chunk cache, and the `lowGfx` field inside
`pixeltown-access-v1` (apply keeps this device's own value: `MMBackup.DEVICE_FIELDS`).

Restore (all three pages): accepts an old town-only file (pre-R4 Town Backup), an old Lantern bundle (no stamp) and the new bundle.
`MMBackup.plan` validates every value with its owner cleaner; a damaged or unknown key is skipped and named, a file of only unknown keys
is refused, a newer format restores what this build knows and says so. A preview (saves, settings, skipped, build/date) comes before
anything is written; Cancel or a refused file writes nothing; a failed write rolls every key back. `MAX_KEYS` is 80 (a pre-R4 build
refuses a file of more than 50 entries with a named message). Tests: `beta-r4-o04-backup` (node, incl. 3000-bundle fuzz),
`beta-r4-o04-town-hub-backup` (browser), `save-hostile-fuzz`, `save-compat-pages`.

## sessionStorage

| key | owner | shape | note |
|---|---|---|---|
| `pixeltown-bp-stats-open` | realm.js | `'1'` / `'0'` | backpack Stats tab open, this tab only |

## IndexedDB

| db | owner | shape | note |
|---|---|---|---|
| `pixeltown-deepdelve-v1` (IndexedDB database, same name as the localStorage meta key) | games/deepdelve/deepdelve.js | chunk records | world terrain cache / creative world; open failures fall back to no store (`fin(null)`) |
