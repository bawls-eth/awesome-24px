# Lane: Performance + Systems Engineer

Read `../TRIAGE.md` first (ownership map in section 5, definition of done in section 8). Branches `fix/ps-<item>` from `claude/animal-crossing-game-7z3roh`; do not push. You hold the two P0s: nothing else starts before S-01 and S-02 are handed to QA.

Your files: shared/mm-backup.js, mm-store.js, mm-perf.js, mm-settings.js, game/underground.js, hub/profile*.js. Serial slots: main.js slot 1 (release it to Gameplay as soon as S-02 merges; you get it back for S-07 / S-13 after World+Graphics), index.html slot 1 (line 539 only), realm-world.js slot 1 (lines 80-92 + savePos only), deepdelve.js slot 1, mm-art.js slot 1, lantern.js slot 2, isles.js slot 3. Never edit: net.js, firebase-config.js, realm.js (measure only), style.css.

Hard rules for this lane: `pixeltown-save-v1` and every key stay backward compatible (additive only); never write the Firebase DB; tests use `blockDb(ctx)` or the Town OFFLINE stub; multi-tab tests use two pages in ONE browser context (shared localStorage).

Order: S-01, S-02, S-05, S-06, S-04, S-03, S-08, S-07 (profile first), S-09, S-13 (needs O-04), S-10, S-11, S-12, S-14.

---

## P0

### S-01 Town Restore validates the file (b14-03) - confirmed in code
- Files: `game/main.js:4354-4369` importSave. Reuse `MMBackup.plan` / the town cleaner from `shared/mm-backup.js` (check it is loaded on the Town page; if not, add the script tag in your index.html slot).
- Fix: (a) detect a bundle (`format === 'pixeltown-backup'`): run it through `MMBackup.plan` and apply ALL its keys exactly like the Lantern restore does (same confirm text listing what will be replaced); (b) otherwise treat it as a town save: it must pass the town-save cleaner (object with a string name or at least one known town key; unknown top-level keys dropped; size cap); (c) anything else: "That is not a Pixeltown save. Nothing was changed." and storage untouched; (d) before any write, keep the previous raw value under `pixeltown-save-v1-prev` (additive safety copy, overwritten per restore) so one bad restore is recoverable.
- Acceptance (`tests/beta-s01-town-restore.test.js`, OFFLINE stub):
  1. Restore a Lantern bundle file from the Town: `pixeltown-save-v1` afterwards has the bundle's town `name` / `resources` (not `format` / `keys`), and the other bundle keys (realm, heroes) are written too; no join card after reload.
  2. Restore `{"hello":1}`: raw `pixeltown-save-v1` byte-identical to before, chat line says nothing was changed, no reload.
  3. Restore an old town-only export (made by today's exportSave): works as before (name, resources, museum, achievements equal the file).
  4. Restore a 5 MB file / an array / `null` / invalid JSON: untouched storage, friendly message.
  5. After a successful restore `pixeltown-save-v1-prev` holds the pre-restore raw string.
- Risk: the reload at +800 ms races other writers: S-02's listener must not write between setItem and reload (set a module flag `restoring = true` that makes writeSave a no-op). `saves.test.js` asserts the old flow.
- Depends on: none. Blocks: S-13.

### S-02 Town cross-tab safety (b14-01, b14-02) - confirmed in code
- Files: `game/main.js:157-163` writeSave, `:2530` saveResources, incrementStat, achievement / lifetimeStats writers (grep `writeSave({` : every caller that passes a whole sub-object).
- Fix, two layers:
  1. Listener: `window.addEventListener('storage', e => { if (e.key === SAVE_KEY || e.key === null) ... })`: when another tab changes the save, re-read it and refresh the scene's in-memory `resources`, `craftedGoods`, `caveInv`, `lifetimeStats`, `achievementsUnlocked`, museum etc. from storage (one `adoptSave(loadSave())` function), then update the HUD counters. If the stored save lost its `name` or changed `name` (a Restore happened), show "Your save changed in another tab. Reloading..." and reload.
  2. Delta writes for counters (same pattern as RealmArena._persist / rmMergeSave, see hub/gift.js:18): `saveResources` writes `stored + (mine - base)` per numeric key, clamped by cleanCount, then sets base = written; sets (achievements, museum) are written as the union of stored and mine. This keeps a tab that missed an event (background tab, event not yet delivered) from clobbering.
- Acceptance (`tests/beta-s02-town-two-tabs.test.js`, two pages, one context, OFFLINE stub):
  1. Tab A chops wood to 5; Tab B (opened before, wood 0) picks 2 fruit: stored resources = {wood:5, fruit:2}; A's HUD shows fruit 2 and B's shows wood 5 within 1 s.
  2. `lifetimeStats.wood` from A and an achievement unlocked in A are still in storage after B's next action.
  3. Lantern Restore (apply a bundle in a third page) while a Town tab is open: after the Town tab's next action (or the forced reload) storage still equals the restored resources / achievements / stats.
  4. Single-tab play: 50 gather actions produce exactly 50 (no double count from the listener echo; `storage` events do not fire in the writing tab, assert anyway).
  5. Spending (craft uses 3 wood) in B after A gained 5: stored = 2 + whatever B had gained; never negative.
- Risk: HIGH. Every writer in a 9,500-line file; a missed writer still clobbers. Mitigation: route all writes through one `writeSaveMerged(partial, {delta|union|replace})` and make plain `writeSave` with a whole sub-object a lint error in the test (a node test that greps main.js for `writeSave({ resources:`). Realm sub-object: already merged by rmMergeSave: do not double-apply. Perf: the listener must not rebuild scenes; only assign fields and update DOM counters.
- Depends on: S-01 (`restoring` flag). Blocks: Gameplay's main.js slot (tell them when merged).

---

## P1

### S-05 Deepdelve boots when storage throws (b15-01) - confirmed in code
- Files: `game/games/deepdelve/deepdelve.js:160, 190, 192` (bare `localStorage` evaluated as an argument), audit every other `localStorage` token in the file.
- Fix: one `const LS = (() => { try { return window.localStorage; } catch (e) { return null; } })();` plus a memory shim `{getItem:()=>null,setItem(){},removeItem(){}}` when null or when a probe write throws; pass `LS` everywhere. Status line shows "Progress cannot be saved in this browser mode." once.
- Acceptance (`tests/beta-s05-deepdelve-storage.test.js`): context with an init script making the `localStorage` getter throw SecurityError:
  1. Status leaves "Loading the mine..." within 5 s and the canvas renders a non-blank frame.
  2. Zero `pageerror` events.
  3. Mining one block works (inventory count +1 in memory) and the "cannot be saved" note is visible.
  4. Normal context: saves still persist across reload (`deepdelve-page.test.js` green).
- Risk: low. Then release deepdelve.js only after S-09, or hand it to Gameplay between S-05 and S-09 if S-09 slips (tell the lead).

### S-06 mm-art JSON cache (b13-01) - confirmed in code
- Files: `game/shared/mm-art.js:143-149` fetchJson.
- Fix: `jsonCache[url]` holding the in-flight Promise (like `imageCache`); a null result (failed fetch) is evicted so a later retry can succeed. No behaviour change for callers.
- Acceptance (`tests/beta-s06-art-cache.test.js`, count requests with `page.on('request')`):
  1. Realm world cold start: every `.json` URL under assets/ is requested at most once (today INDEX.json 7x).
  2. Total cold-start requests drop by >= 100 and transferred JSON bytes by >= 2 MB versus the recorded baseline (print both numbers).
  3. All art still resolves: `world-art.test.js`, `enemy-art`, `item-icons`, `bolt-art` green.
  4. A 404 manifest then a retry: second call re-fetches (not a cached null).
- Risk: callers mutating the parsed object would now share it: grep for writes into manifest objects; freeze in TEST mode to catch it.
- Unblocks: W-01 / W-02 preload work.

### S-04 Co-op seats merge the realm save (b14-06) - confirmed in code
- Files: `game/games/mad-maze/realm-world.js:80-92` writeSave, `:1172` savePos. Only matters with `?party=local`.
- Fix: writeSave re-reads storage and merges: discovery / fog = union (bitwise OR of the stored and in-memory masks), counters = max, `finds` as today (storage wins). Position: when `?party=local`, each seat writes its position under `seatPos[seat]` (additive) and only seat 0 writes the canonical `pos`; solo play unchanged.
- Acceptance (`tests/beta-s04-coop-save.test.js`, two pages one context, `?party=local&seat=0/1`, same seed):
  1. A discovers 37 chunks, then B (started with 13) walks and saves: stored discovered count >= 37 + B's new ones.
  2. Stored `pos` equals seat 0's tile after both saved; `seatPos[1]` equals B's tile.
  3. Solo (no party flag): saved bytes identical in shape to before (no `seatPos` key).
  4. `world-fog`, `world-party`, `world-safereturn`, `shared-mm-fog` green.
- Risk: fog encoding (read MMFog before merging); cleanSave must accept `seatPos` (additive, cleaned, max 4 entries).

### S-03 Backup tolerates one bad key (b14-04) - confirmed in code
- Files: `game/shared/mm-backup.js:120` bundle, `:172-181` plan; `games/mad-maze/lantern.js:300` confirm text (slot 2, after Gameplay's G-05).
- Fix: plan() collects `skipped: [{key, label, why}]` instead of failing; ok stays true when at least one key is restorable; the confirm lists "Will restore: ..." and "Cannot restore (damaged in the file): ...". The town save key failing is called out first. bundle(): validate each value with its cleaner at export and return `warnings` so the Backup button can say "Daily gift data is damaged on this device and was left out".
- Acceptance (extend `tests/shared-mm-backup.test.js` + `tests/beta-s03-backup-skip.test.js`):
  1. A bundle with 34 keys where the gift key is `"{bad"`: plan ok, 33 entries, skipped.length 1 with the gift label.
  2. Apply: the 33 keys are written, the device's existing gift key is untouched.
  3. A bundle where every key is bad: ok false, storage untouched.
  4. Export on a device with one corrupt key: file has the good keys, `warnings` names the bad one, UI shows it.
  5. Size limits and the `pixeltown-panel-collapsed` special case still enforced.
- Risk: partial restore mixes old and new state: the confirm must say so plainly.

### S-07 Town frame cost (b13-03) - measure first
- Files: `game/main.js:1801, :4847` (per-remote loops), `:5686` addRemotePlayer. main.js: do the profile read-only at any time; code changes only when you hold the file again (after W-06) or inside slot 1 if the profile is done by then.
- Step 1 (no edits): CPU profile at 4x throttle, 390x844, OFFLINE stub, 0 remotes and 55 remotes, 20 s each, run ALONE on the machine (load average < 4; b13's numbers were taken at load 6-24). Write the top 10 self-time functions to `design/beta/perf-town.md`.
- Step 2: fix the top cost. Known candidates: per-remote Phaser Text (one canvas texture each) -> BitmapText or a shared name atlas; per-frame label repositioning for off-screen remotes -> cull by camera rect; HUD DOM writes every frame -> write on change.
- Acceptance (`tests/town-perf.test.js` extended, numbers printed):
  1. 4x CPU, 0 remotes: median frame <= 50 ms (today 83).
  2. 55 remotes: median within 15% of the 0-remote median; long tasks per 30 s <= 60 (today 209-335).
  3. Remote names still readable and correct (textContent equality for 3 sampled remotes), presence cap 60 unchanged.
  4. No per-frame Graphics redraw introduced (bug-bash rule).
- Risk: perf numbers are noisy on the shared box: QA re-measures alone; never "fix" a perf test by loosening it.

---

## P2

### S-08 three.min.js lazy (b13-02)
- Files: `game/index.html:539`, `game/underground.js` (only THREE user in the Town).
- Fix: remove the eager script tag; `underground.js` loads three on first cave open (one in-flight promise, "Loading the cave..." state, failure message + retry). The Hub embed inherits the saving. The r150+ deprecation warning: pin the module build only if it is a drop-in; otherwise leave and note.
- Acceptance: (1) Town cold load: no request for three.min.js; (2) opening the cave requests it exactly once and the cave renders; (3) offline cave open shows the retry message, no pageerror; (4) Town transfer size drops by ~650 KB (print).

### S-09 Deepdelve frame spikes (b13-05)
- Files: `deepdelve.js:518` (MAX_BUILDS), `:574-607` governor, `:751` relight on edit.
- Fix: spread the first mesh builds over frames behind the loading state; relight only the edited column neighbourhood, deferred to the next idle slice.
- Acceptance: (1) 4x CPU first 2 s: worst frame <= 300 ms (today 883-983); (2) 12 taps at 1x 390: <= 2 long tasks > 100 ms (today 13); (3) lighting result identical to a full relight on 5 sampled edits (pixel or light-array compare); (4) `deepdelve-fps`, `deepdelve-perf` green.

### S-10 Storage-throws sweep (b15-02)
- Fix: a shared `MMStore.safe()` accessor (in mm-store.js) and replace bare boot-time `localStorage` reads in shared modules you own. For page files owned by other lanes, write the exact one-line patches into their lane file's Requests section; they apply them in their own slots.
- Acceptance: with a throwing `localStorage` getter, each of hub, town, realm, isles, angler, dash, echo, jam, pop, stack, stalk, deepdelve loads with zero pageerror and is playable in memory (one generic test iterating the 12 URLs, 3 asserts per page: no pageerror, main canvas / root visible, primary button works).

### S-11 Realm soak / listeners / rotate (b13-04, b13-07, b13-08)
- Measure alone first (10 min soak at 4x, load average < 4). Report numbers in `perf-town.md`. If fps still falls > 20% over 10 min, bisect by subsystem flags and send the finding to Gameplay (realm.js owner). Listener growth: find the +12 step source in realm-world.js (you may fix it in your realm-world slot if it is a missing removeEventListener). Rotate: debounce resize (150 ms) and restore the render scale after the storm.
- Acceptance: (1) listeners after 10 min within +5 of the 1-min value; (2) after 60 rotations the canvas backing size equals a fresh load's at the same viewport; (3) soak fps at t=10 min >= 85% of t=2 min when run alone.

### S-12 Isles start-up (b13-06, b05-11) - after Gameplay and World+Graphics isles slots
- Lazy-bake creature strips per biome on first sight; set `willReadFrequently` on readback canvases. Acceptance: DOMContentLoaded at 4x <= 2.0 s (today 3.0-3.7), start long task <= 150 ms, no getImageData warnings, all isles tests green.

### S-13 One Backup (b14-05, b14-13) - needs owner O-04
- Town "Backup" exports the MMBackup bundle; settings keys added to KNOWN with cleaners. Acceptance: Town export contains realm + heroes + hub keys; restoring it on a clean context restores a Realm hero; an old town-only file still restores (S-01 case 3); accessibility settings round-trip.

## P3
- S-14: favicon link on arcane-frontier/index.html; `?v=` on art manifests (design note first: it changes cache keys for 1,000+ files).

## Requests to other lanes
- Gameplay: new additive fields you must keep in cleaners: Keepsake `rk` (G-05), Isles glint timers (G-26). Send the exact shapes.
- QA: two-tab test helper (two pages, one context, OFFLINE stub) belongs in tests/helpers.js: ask QA to add `twoTabs(ctx)`.
