# Release readiness: beta fix cycle (QA + Integration, 2026-11-23 09:15 UTC)

Candidate: `dev-perf` + `dev-gameplay` + `dev-world` merged onto the beta base 927fc9e (QA scratch build `dev-qa-integ` 796c5a1, which also
carries `dev-qa`: QA re-tests + helpers). Lane tips: dev-perf 43d8f18 (last commit 07:16), dev-gameplay 5d63850 (07:50), dev-world 03142bc (07:28).
Merges: only `game/tests/test-tiers.json` conflicted (key union, no value clash). No non-trivial conflict (qa-conflicts.md).
Evidence per item: `fixes/qa-verification.md`. Failure notes with repro: `fixes/qa-to-perf.md`, `qa-to-gameplay.md`, `qa-to-world.md`.

## Recommendation: NO-GO as of 09:15. GO once the 7 small follow-ups below are in (all one-liners or test expectations, ~30-60 min).
Both P0s and every code P1 are verified fixed, with QA's own replays of the tester steps. But the merged tree has 10 red existing / beta
tests (gate rule 3: zero failures), each bisected to one lane commit. None is a data-loss or save-format risk; two are real product bugs
(G-08 hot-path allocation, Realm boot with blocked storage now reachable from Home), the rest are a swallowed test handle and stale asserts.

### Must fix before merge (owner -> note)
| # | Red test(s) | Cause (bisected) | Owner / note |
|---|---|---|---|
| 1 | world-page, world-fog, world-bosskey, world-sites (crash `w.artTiles / w.miniDraws is not a function`) | W-03 ee07c5d: `// W-03 hooks` comment mid-line in realm-world.js swallows two test handles | WG, qa-to-world #6 (one line) |
| 2 | beta-s10-storage-throws `[hub]` | G-14 sends a fresh (blocked-storage) profile to the Realm; Realm boot throws at mad-maze.js:577 (S-10 patch never applied) | WG, qa-to-world #4 (one line, real bug b15-02) |
| 3 | arena-p2-hotpath (1010 B/event > 120) | G-08 4158e08 allocates in the hit path | GP, qa-to-gameplay #4a (real perf bug) |
| 4 | realm-polish3 desktop dungeon | W-16 c68631c room band | WG, qa-to-world #7 |
| 5 | beta-w02-boss-popin seed 4242 | G-07 eb73a2c (border altar does not wake from the lower zone, by spec) | WG test placement, qa-to-world #5 |
| 6 | stalk-moods | G-18 c12b547 (moodBest still stores a loss / stale assert) | GP, qa-to-gameplay #4b |
| 7 | archipelago-page; lantern-page | G-26 new key `pixeltown-isle-nodes-v1` not in the test allow-list; S-03 changed export, lantern-page assert not updated | GP #4c; PS qa-to-perf #2 |
Plus (not a red test): add `pixeltown-isle-nodes-v1` to MMBackup KNOWN (qa-to-perf #4), else Backup drops the new Isles state.

## P0 / P1 status
| Item | Verdict | Evidence (short) |
|---|---|---|
| S-01 Town Restore validates (P0) | PASS | beta-s01 base 14 FAIL -> 32/32; QA replay beta-retest-b14 (junk x4 byte-identical, Lantern bundle restores the town save) |
| S-02 Town two tabs (P0) | PASS | beta-s02 base 15 FAIL -> 23/23; QA replay: two pages one context keep wood 5 + fruit 2 + lifetimeStats; third-page restore survives the open tab |
| S-03 Backup skips a bad key | PASS (test follow-up open: lantern-page) | beta-s03 base 9 FAIL -> 19/19 |
| S-04 Co-op seats merge | PASS | beta-s04 base 3 FAIL -> 11/11 |
| S-05 Deepdelve with blocked storage | PASS | beta-s05 -> 10/10; QA replay beta-retest-b15 5/5 |
| S-06 mm-art JSON once | PASS | 1235 -> 1077 requests, 225 -> 67 JSON; beta-s06 14/14 |
| S-07 Town frame cost | OPEN (step 1 profile only: 80% of frame is native GL draw, 730 of 951 objects off-camera; no code fix) | perf-town.md; town-perf not worse (40.7 fps) |
| G-01 Daily gift, no town save | PASS | QA replay beta-retest-b08 11/11 |
| G-02 Combine vs Equip | PASS | QA replay beta-retest-b02 |
| G-03 Sell / Buy guards | PASS | QA replay (500 -> 522 shards repro gone); vendor part verified |
| G-04 Full pack keeps upgrades | PASS | QA replay (+39 auto-sale gone, "Backpack full") |
| G-05 Rekindle only from a Keepsake | PASS | beta-g05 + node rekindle tests |
| G-20 / G-21 Isles Stable | PASS | beta-g20 13/13 |
| G-22 Companions spare the tame target | PASS (after 2 follow-ups; first version regressed isles-first-ten, fixed) | beta-g22, isles-first-ten 184/184 |
| G-23 Enter mid Trial | PASS | beta-g23 base 4 FAIL -> 8/8 |
| O-01 Door names / third-party links | OPEN (owner decision, untouched) | - |

P2 / P3 verified PASS: G-06, G-07 (with test note), G-10, G-11, G-12, G-13, G-14, G-15, G-16, G-17, G-18 batch (with stalk-moods note), G-24,
G-25, G-26 (with test/backup note), G-27 part, W-01, W-02, W-04, W-05, W-06 part (board), W-07 part, W-08, W-09, W-10, W-11, W-12, W-13,
W-14 part, W-15, W-18 part, S-11 part, S-14. FAIL (regression): W-03, W-16, G-08 (above). PARTIAL: S-10 (Realm). Not landed: W-17 (art
asks filed), S-08, S-09, S-12, S-13 (needs O-04), G-09, G-19, W-06 scale / statue (O-10).

## Test counts (QA, one test at a time through /tmp/bt.sh, port 9473, integ 796c5a1)
- Node tests: 127 / 127 green.
- Browser smoke tier: 104 run, 101 green; item-icons was a load flake (31/31 twice alone); lantern-page, world-page red (above).
- Browser full tier: 177 run, 168 green, 9 red (above).
- Beta tests (all 56 registered): 54 green, 2 red (beta-s10, beta-w02).
- Live-class tests (33: saves, town-links, phone-overlays, phone-panel, fishlog, aquarium, ...): NOT run by QA (live DB rule). Must be run by
  the coordinator's sharded suite under `flock /tmp/live.lock`; S-01 / S-02 / G-12 / G-13 / W-07 touch the Town paths several of them cover.
- Every lane test was shown to FAIL on 927fc9e and PASS on the merged tree, except 8 WG / 1 GP tests whose "before" run crashes on a missing
  test hook (marked "weak b" in the log).

## Other gate checks
- Save compatibility: save-compat-pages 453/453 (old / hostile / quota / blocked fixtures on every page) at round 2, green again in the full
  run; save-hostile-fuzz 88/88, save-merge-fuzz 5000 runs 0 issues, save-race-tabs 75/75. New keys are additive (`pixeltown-save-v1-prev`,
  `seatPos`, Keepsake `rk`, stalk `seen`, `pixeltown-isle-nodes-v1`).
- Perf (run alone, same window): integ town-perf 40.7 fps / 0 long frames, world-perf median 16.7 ms, deepdelve-fps 33.4 / 36.9 fps,
  realm-bullet-bench 0.137 ms/step; old tip 927fc9e no better on any (its run hit load 14). arena-p2-hotpath allocation regression is G-08 (#3).
- a11y viewport sweep: no new offender except a pre-existing isles toast fade-in sampling flake (also on 927fc9e); allow-list unchanged (18).
- firebase-config.js / net.js unchanged; no secrets in the diff; no Math.random / Date added in shared modules; no conflict markers;
  removed asserts (9) all replaced by stricter or changed-expectation asserts (checked one by one).
- Base note: `claude/animal-crossing-game-7z3roh` was fast-forwarded to dev-perf at about 06:59 (reflog); compare with 927fc9e.

## Risks
- Serial-slot slips (merged clean, but watch on the next merge): GP edited realm-world.js (G-27) after WG started slot 3; PS edited main.js
  after releasing slot 1; GP's G-10 landed in deepdelve.js before PS's S-09. Details: qa-conflicts.md.
- Load-sensitive tests at load 12-18: beta-s01 huge.json, beta-retest-b14 bundle, item-icons, isles a11y toast: all passed alone.
- UNTESTED (no tester coverage or not runnable by QA): live multiplayer / presence, real phones and non-Chromium browsers, mount abilities and
  saddles beyond the ones in beta-g20, Trial of Six beyond the first fights, the live-class Town suites.
