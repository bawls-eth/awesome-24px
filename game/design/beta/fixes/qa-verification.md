# QA verification log (beta fix cycle, 2026-11-23)

QA + Integration lane. Branch `dev-qa` (docs + re-tests); scratch integration branch `dev-qa-integ` = base `claude/animal-crossing-game-7z3roh` (927fc9e) + `dev-qa` + `dev-perf` + `dev-gameplay` + `dev-world`, rebuilt every round (local only, never pushed).
Server: port 9473 on this worktree. Every test command is run ALONE through `/tmp/bt.sh` (one test at a time). `run-all.js` is never run by QA.

Method per fix (qa.md section 2): (a) files touched are the lane's own / slot files; (b) the engineer's new test FAILS on the base files and PASSES on the integrated tree (run both: the fix's files are swapped back to the base with `git checkout <base> -- <files>` for the "before" run); (c) related regression tests alone; (d) the tester's original steps replayed by a QA re-test (`game/tests/beta-retest-<tester>.test.js`, blockDb / Town OFFLINE stub, deterministic) on the old tip and on the integrated branch; (g) verdict.

Load note: the box is shared by many agents (load average 4-7 during this run). A test that failed once and passed when re-run alone is recorded as FLAKE with both results.

## QA re-tests (tester replays)

| File | Findings | On base 927fc9e | Notes |
|---|---|---|---|
| beta-retest-b14.test.js | b14-03 (S-01), b14-01 + b14-02 (S-02) | FAIL (8 of 17 asserts): `{"hello":1}` becomes the town save; bundle written as the save; stale tab erased wood 5 + lifetimeStats; restore undone by the next fish | two pages one context (helpers `twoTabs`), OFFLINE stub, setInputFiles on `#save-import-input` |
| beta-retest-b08.test.js | b08-01 (G-01) | FAIL (6 asserts): "The gift will wait until your town save is ready. Nothing was claimed." | 390x844 touch, real taps |
| beta-retest-b15.test.js | b15-01 (S-05) | FAIL: 4x pageerror "The operation is insecure.", stuck on "Loading the mine..." | helpers `throwingStorage` |
| beta-retest-b02.test.js | b02-01 (G-02), b02-02 (G-03), b02-04 (G-04) | FAIL (8 asserts): Equip covered by Combine; dblclick Sell 500 -> 522 shards, equipped Iron Cuirass sold (exact tester numbers); full pack T12 sold for +39 | 1280x720, real dblclick / click |

New helpers in `game/tests/helpers.js` (QA-owned): `offlineStub(ctx)`, `exposeGame(page)`, `joinOffline(page, name)`, `twoTabs(ctx, url)`, `throwingStorage(ctx)`.

## Verdicts

| Finding | Item | Lane | Commit | Evidence | Verdict |
|---|---|---|---|---|---|
| b08-01 | G-01 | GP | a63daca | (a) gift.js + its tests only. (b) beta-g01-gift: base 1 PASS / 1 FAIL ("...Nothing was claimed"), integ 9/9 PASS. (c) hub-gift 18/18 (changed assert named in commit: 'no town save' case now seeds a corrupt save: a changed expectation, not weakened; it still asserts nothing written + message). (d) beta-retest-b08 integ 11/11 PASS (fresh 390x844, preview 36 shards paid once, no `name` invented, day 1, corrupt save byte-identical). | PASS |
| b02-01 | G-02 | GP | 21fd30e | (a) realm.js row markup + realm-ui.css slot 1. (b) beta-g02-combine: base 3 FAIL (Equip/Combine same rect 123,402 156x44, elementFromPoint = combine), integ 16/16. (c) realm-backpack-8bit 37/37, realm-phone-layout 78/78, gear-forge-ui 39/39, realm-shop-death 11/11, backpack-compare: FLAKE (1 FAIL "hover shows the pattern line" in 2 of 7 integ runs under load avg ~7; 7/7 later integ runs and 3/3 base runs PASS; the failing rows have no Combine button, so the G-02 rule does not apply to them: recorded as a pre-existing hover-timing flake, watch item). (d) beta-retest-b02 b02-01 part: base FAIL, integ PASS (real click equips ring, 4 rings kept). | PASS |
