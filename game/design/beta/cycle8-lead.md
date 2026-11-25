# Cycle 8, L (Lead Developer)

Branch `cyc8-lead`, port 9801. Nothing pushed. Firebase blocked in every browser test (db.attempts() === 0). The full suite was NOT run (coordinator's stamp). `ci-status.json` untouched.

## 1. Flaky tests: root cause and fix

Both were test-side waits, not game races. No assertion was changed.

**item-icons** (flaked in 4 stamps running)
- Cause: the icon PNGs are fetched lazily, on the first render of the backpack / shop. The test looked after fixed sleeps (500 ms backpack, 400 ms shop, 700 ms for the deliberate 404). On a busy box the page's connections were still serving other art, so the last icons were not complete yet. The old stamp logs show the same three every time: swiftcharm, scholarring, wardring. The game was right.
- Fix: the test waits for the condition (every icon in the panel is `complete`) within `LS.budget(8000)`; the 404 case waits for the emoji swap itself. The checks still demand exactly 8 / 3 / >= 7 icons, each complete with a real width; a broken icon is still a FAIL.
- Proof: 6 runs, 3 in parallel, machine load average 21 to 24: 6/6 ALL PASSED. The old file under the same load: 2 of 3 FAILED ("backpack rows have 8 loaded icons").

**cyc6-lead-passive-landscape** (flaked in 2 stamps, exit 1 with no FAIL line)
- Cause: `page.goto` waited for the window "load" event of three Realm pages opened at once, under Playwright's fixed 30 s default. Reproduced: 3 copies in parallel, all 3 died with `page.goto: Timeout 30000ms exceeded` (the stamp hides stderr, hence no FAIL line).
- Fix: goto stops at DOM ready (the loop below already waits for the real condition, arena in play); goto, the wait for play and the 230 s watch budget use the load factor measured at that moment (the cached one is from process start; the second batch starts minutes later).
- Proof: 6 runs, 3 in parallel, load average about 15 (load factor 3.6 to 5.0): 6/6 ALL PASSED (18 checks each).

## 2. Realm `_updateBullets` allocation: cause found and removed

- Cause (V8 `--trace-deopt` in a real Realm page): not an allocation written in the function. The pooled objects changed hidden shape while in use, so the browser kept discarding the optimised code of `_updateBullets` (17 invalidations in 12 s; also `_updateEnemies`, `_buildHash`, `_draw`, `slamTick`...). Interpreted bullet maths allocates a number object per operation.
  - Enemies left the pool with 16 fields and were given 35 to 45 more one by one; hero bolts 23 -> 31; enemy bolts 11 -> 13; texts 10 -> 12; bags 9 -> 13.
  - `setWorld` grew the enemy pool (24 -> 72) and the enemy-bolt pool (420 -> 700) from a SECOND literal. Objects from two literals never share a shape. This was the larger half: with only the fields declared, the figure was still 8,344 B/frame.
- Fix (`game/realm.js`): every field is declared in the pool literal with the value the old code wrote first (`undefined` where the code relied on "not set yet"); one factory each (`RM_NEW_ENEMY`, `RM_NEW_EBOLT`) is used by the pool and by its growth.
- Numbers (heap sampler, 300 frames, hero firing and walking, about 39 enemies), `_updateBullets` own bytes per frame:
  - before: 10,598 (new test on the old code), 7,784 (my profiler). The figure varies run to run; one earlier before-run had it below 3,759.
  - after: 824, 736, 773 (3 runs). Whole game code: about 28,000 to 31,000 -> 16,000 to 20,000 B/frame.
- Test `game/tests/cyc8-lead-pool-shapes.test.js` (registered, full tier): on the old code 5 FAILED (enemies, hero bolts, enemy bolts, texts, bags each had 2 or 3 field lists); now ALL PASSED. It asserts the shapes and the single factory, which are deterministic. The bytes figure is printed as INFO and NOT asserted, because it swings with machine load; I did not want to add a new flaky test.
- Real browser: Realm played 9 s firing and walking at 1280x720 and 390x844, 53 / 54 live enemies, 0 console errors, 0 database attempts. Screenshots `img/cyc8-lead-realm-1280x720.jpg`, `img/cyc8-lead-realm-390x844.jpg` (looked at the desktop one: enemies, bolts and HUD draw as before).

## 3. Dead code removed

- Grep of the whole repo (code, tests, HTML, JSON): `RM_DEATH_PENALTY` and `refreshAssist` appeared only at their definitions in `realm.js` and in design notes. Both removed.
- Guard added to `shared-removed-modules.test.js` (additive): fails on the old `realm.js` (names both), passes now.

## Regression runs (targeted, 3 at a time, all on the final code)

ALL PASSED: cyc8-lead-pool-shapes, shared-removed-modules, run-all-tiers, cyc7-lead-hash-alloc, cyc3-realm-frame-alloc, realm-bullet-bench, arena-p2-hotpath, realm, realm-core, enemy-art, boss-art, loot-bag-icons, ftue-ft2, mad-maze-dungeon, realm-team, world-team, cyc4-assist-realm, cyc7-lead-felled-by, world-boss-rush, beta-w14-loot-bags, world-status, telegraph-arena, realm-wire, item-icons.

`cyc7-idle-rest`: 2 FAILED in the parallel batch (checks B and C; B sampled "right after the start" at game clock 11.6 s), ALL PASSED alone. I did not check whether it also fails under load on the old code, so I cannot say for certain it is unrelated to my change. It looks like a third load-sensitive test.

## Unresolved

- Town `cullOffscreen` (4,620 B/frame): not started, the time box went to item 2.
- `cyc7-idle-rest` under load (above).
- `_updateBullets` still shows about 800 B/frame and the trace still shows some invalidations after the fix. Likely remaining causes: the arena object itself gains 6 fields late (`_enemyVis`, `_enemyDbg`, `lastDmgColor`, `_dmgTxtT`, `_numC`, `_spS`), and number fields that start as whole numbers and later hold fractions. Not measured separately.
- b01-r3-02 (the Assisted tag appears on the first scaled hit, not at once) is unchanged by removing `refreshAssist()`; it was never called.

## Proposals

- Same pool-shape rule for Town and Isles pooled objects; the new test's method (one field list per pool) is cheap to copy.
- `tools/stamp.sh` prints only `FAIL` lines; a test that dies with an exception shows nothing. Print the first stderr line too.
- Declare the 6 late arena fields in the constructor.
