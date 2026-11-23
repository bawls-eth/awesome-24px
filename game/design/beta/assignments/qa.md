# Lane: QA + Integration Engineer

Read `../TRIAGE.md` first. You verify every fix on its branch before the lead merges, run regressions, own the release gate, prevent file conflicts and write the re-test scripts for the 15 testers. You do not fix product code; if a fix is wrong, send it back with a failing assert.

Your files: `game/tests/helpers.js`, `run-all*.js`, ordering of `test-tiers.json` at integration, `game/design/beta/RETEST.md`, `game/design/BETA-BOARD.md` tally, `game/design/beta/GATE.md`. Branches `fix/qa-*`; integration branch `beta-integration` from `claude/animal-crossing-game-7z3roh` (local only, never pushed by you).

Rules: Firebase is live: every context uses `blockDb(ctx)` or the Town OFFLINE stub; never chat; live-class tests only under `flock /tmp/live.lock` with ADMIN* bots. Wrap browser / node test commands in `/tmp/bt.sh`. Never skip, weaken or quarantine a test; timing tests wait for conditions. A test that fails only under load: re-run alone once; fails alone = real.

## 1. First hour
1. Baseline on the tip: smoke tier + `shared-no-conflict-markers`; record pass / fail / duration in GATE.md (this is the "before").
2. Add `twoTabs(ctx)` (two pages, one context, OFFLINE stub) and `throwingStorage(ctx)` (init script: `localStorage` getter throws SecurityError) to helpers.js: Perf+Systems needs both.
3. Write repro tests that FAIL on the tip for the P0/P1 list, straight from the tester steps, and hand each to the owning lane as the starting point: S-01 (b14-03), S-02 (b14-01, b14-02), G-01 (b08-01), G-03 (b02-02), G-04 (b02-04), G-05 (b11-01), G-22 (b05-03), G-23 (b03-01). File names as in the lane files (`beta-<id>-*.test.js`).

## 2. Verification per fix (checklist, record in GATE.md)
| Step | Check |
|---|---|
| a | Branch touches only files its lane owns or holds the serial slot for (TRIAGE section 5): `git diff --name-only <base>...<branch>`. Reject otherwise. |
| b | The new test fails on the base and passes on the branch (run both). At least 3 asserts, matching the lane file's acceptance list. |
| c | Run the item's related tests alone (list below), then the smoke tier. |
| d | Replay the tester's original steps by hand-script (Playwright, real input events) at the tester's viewport; read a screenshot. |
| e | Save safety (any item touching storage): load a pre-change save fixture, play 30 s, reload: no key lost, no key shape changed except additive fields. |
| f | No new console errors / pageerrors / failed requests on the touched page (compare with baseline). |
| g | Verdict in GATE.md: PASS / FAIL + sha + what was run. Only PASS goes to the lead. |

Related tests by item (run alone, in this order; names are prefixes of files in `game/tests/`, confirm each with `ls game/tests | grep <name>` and add any neighbour the grep shows):
- S-01, S-02, S-03, S-13: `saves`, `shared-mm-backup`, `shared-mm-profile-backup`, `nav-town`, `nav-town-p2`, `hub-gift`, `gear-save-*`.
- S-04: `world-fog`, `world-party`, `shared-mm-world-party`, `world-safereturn`.
- S-05, S-09, G-10: every `deepdelve-*` and `shared-mm-dd-*`.
- S-06, W-01, W-02: `world-art`, `enemy-art`, `item-icons`, `bolt-art`, `hero-pick`, `hero-all-classes`, `world-page`.
- S-07, W-06, W-07, G-12, G-13: `town-perf`, `phone-overlays`, `phone-panel`, `nav-town`, `town-links`, `fishlog`, `aquarium`.
- G-02, G-03, G-04: `backpack-compare`, `gear-forge-ui`, `nexus-vendor`, `realm-shop-death`, `gear-world-drops`, `world-pickups`, `realm-phone-layout`.
- G-05: `shared-mm-profile*`, `lantern-page`.
- G-06, G-07, G-23, G-15, W-03, W-04: `shared-mm-quests`, `shared-mm-zones`, `world-bosses-extra`, `world-bosskey`, `world-nexus`, `world-nexus-walk`, `world-events`, `realm-tutorial`, `shared-mm-overworld-golden`, `shared-mm-chunk-bake`, `world-perf`.
- G-08: `world-firebudget`, `world-ttk`, `difficulty-curve`.
- G-20, G-21, G-22, G-26, W-12: every `isles-*`, `shared-mm-tames`, `shared-mm-companion`, `shared-mm-isle-boss`, `isle-boss-sim`.
- G-14, G-01: `hub-home`, `hub-page`, `first-ten-minutes`, `nav-consistency`, `smoke-journey`.
- Layout items (W-05, W-08, W-09, W-16): the a11y viewport sweep; the allow-list may only shrink.

## 3. Conflict prevention
- Keep a live table in GATE.md: serial file -> current holder -> since -> next. A lane may start a serial file only when you mark the previous holder "merged". Order is fixed in TRIAGE section 5 (main.js: PS -> GP -> WG; realm-world.js: PS -> GP -> WG; isles.js: GP -> WG -> PS; deepdelve.js: PS -> GP; realm-ui.css: GP -> WG; mm-art.js: PS -> WG; lantern.js: GP -> PS; index.html: PS -> GP -> WG).
- Before each merge into `beta-integration`: `git merge --no-commit` dry run, `shared-no-conflict-markers`, then the related tests on the merged tree (a fix that is green alone but red after merge goes back).
- `test-tiers.json`: lanes append their own entries; you fix order / duplicates at integration and run `run-all-tiers.test.js`.
- Existing tests changed by a fix must be named in the commit body; check each change is a changed expectation, not a weakened one (compare assert counts before / after).

## 4. Release gate (GATE.md, for the 11:49 UTC merge)
Ship only if ALL hold:
1. S-01 and S-02 PASS with the two-tab and restore scenarios replayed by you (not only by the author's test).
2. No open P0. Every P1 is PASS or has a written lead decision to defer (O-01 needs the owner's answer; S-07 may ship as "profile + first fix" if the numbers improved).
3. Full `node game/tests/run-all.js` on `beta-integration` (local server on 8440, run alone): zero failures; any flake re-run alone and documented.
4. Save compatibility: three fixture saves (fresh, mid-game from before the beta, a hostile / corrupt one) load in Town, Realm, Lantern, Isles, Hub with no data loss and no pageerror.
5. Perf not worse than baseline: `town-perf`, `world-perf`, `deepdelve-fps`, `realm-bullet-bench` (run alone).
6. No file under `game/firebase-config.js` / `game/net.js` changed; no secrets; no conflict markers.
7. Areas with no tester coverage are listed as UNTESTED in GATE.md (mount abilities and saddles 2-10 until G-20 lands, Trial of Six beyond the first fights, real phones / non-Chromium browsers, live multiplayer).

## 5. Re-test scripts for the 15 testers (write RETEST.md)
One section per tester: the items to re-test, the exact URL, viewport, steps (the tester's own steps), expected result, and "also poke around this area for 10 minutes for regressions". Testers re-test on `beta-integration`, each on its own port, same rules as BETA-BRIEF (blockDb, `/tmp/bt.sh`, docs only). They answer per item: FIXED / NOT FIXED / REGRESSED + screenshot.

| Tester | Re-test items | Extra regression sweep |
|---|---|---|
| b01 Realm combat | G-06, G-07, G-08, G-09, G-18 (blur sticks) | 10 min fight in each zone, deaths, boss wake distances |
| b02 Loot / gear | G-02, G-03, G-04, W-05 (toast), G-18 (stats deltas) | full backpack loop: fill, combine, equip, sell, forge, vendor, phone landscape |
| b03 Dungeons / Trial | G-23, G-24, G-25, W-16 | 3 dungeon seeds to the boss; one Trial to a fall |
| b04 Realm world / Nexus | G-06, G-07, G-12 (Nexus Esc), W-03, W-04 | walk all four zones' borders, every Nexus NPC on phone |
| b05 Isles taming | G-20, G-21, G-22, G-26 | tame 4 creatures, swap party, ride 3 mounts, craft 2 saddles, reload |
| b06 Isles exploration | G-22 (weary boss), W-12, W-17, W-18 | each biome 5 min, one boss tame attempt |
| b07 Town | G-12, G-13, W-06, W-07, O-01 (if approved), S-08 (cave still opens) | every overlay with Esc, build mode on phone, fishing + beachcombing |
| b08 New player | G-01, G-14, G-15 | full fresh-profile journey Home -> first game -> back, phone |
| b09 Arcade A | G-17, W-09, W-10 | Pop / Dash / Stack / Echo: 3 rounds each, mash the result card |
| b10 Arcade B | W-08, W-09 (Jam), W-11, G-16, G-18 (Jam) | Angler at 150% + landscape, Jam assist, Bug Safari phone |
| b11 Stalk / Deepdelve / Lantern | G-05, G-10, G-11, S-05 (normal mode still saves) | Rekindle from a Keepsake, hardcore hero, 100 place / mine cycles |
| b12 Graphics | W-01, W-02, W-03, W-04, W-06, W-12 | screenshot pass of every area at both viewports; mixed pixel density check |
| b13 Performance | S-06, S-07, S-08, S-09, S-11, S-12 | cold-start request counts, 10 min soaks run ALONE (note the load average) |
| b14 Saves / multiplayer | S-01, S-02, S-03, S-04, S-13 | two and three tabs in every game, restore of old / new / corrupt files, co-op seats |
| b15 Edge cases | S-05, S-10, W-05 (320 / 360), W-09 (Hub 200%), G-12 (Back closes Menu) | storage blocked on all 12 pages, zoom 150 / 200%, keyboard only |

Loop: re-test -> new findings go to `design/beta/<id>-r2.json` in the same format -> lead re-triages -> repeat until no open P0 / P1.
