# Cycle 9, L (Lead Developer)

Branch `cyc9-lead`, port 9901, worktree `/tmp/wt-cyc9-lead`. Nothing pushed. Firebase blocked in every browser test (db.attempts() === 0, literal). The full suite was NOT run (coordinator's stamp). `ci-status.json`, `firebase-config.js`, `net.js` untouched. No save key added.

## 1. Town cull allocation, late fields, pool-shape rule

**Town `cullOffscreen` (`game/main.js`)**
- Cause, measured: of 978 Town objects a pass measured 266. 115 shore foam dashes and 5 wave crests sway 10 px on shared yoyo tweens, so their box never "settled" and they were measured on every pass, in view or far out at sea.
- Fix: these images declare their reach (`_cpad = 12`). Their box grown by that reach is pinned. While the pinned box is outside the cull line the image is culled without being measured; when it crosses the line the image is measured exactly as before, so the cull bits are the same as the old rule. Every 8th pass a pinned image is measured anyway, so one moved out of its reach is seen as fast as any settled object. `uncull()`, hiding and a forced pass drop the pin.
- Also removed: `o._cl = NaN` for size-less labels (a NaN turns that field into a boxed number for every object of the same shape).
- Numbers (heap sampler, standing still, same machine, load factor 2 to 3): objects measured per pass 266 -> 179; `cullOffscreen` own bytes per frame 4,717 and 4,651 (old code, 2 runs) -> 3,191 and 3,120 (2 runs). About one third less, not zero.
- Test `cyc9-lead-town-cull-pin.test.js` (new, full tier). Old code: 2 FAILED (0 pinned images; 267 measured = 27%) and the shore step cannot run. New code: ALL PASSED (8 checks: under 22% measured and every sprite still measured; at the shore no swaying image on screen is culled and none is culled inside the line; a pinned image moved into view is drawn within 8 passes, at once after `uncull()`). Bytes are printed as INFO, not asserted (they swing with load).
- Existing tests, unchanged, on the new code: `cyc4-town-cull-alloc` ALL PASSED (its word-for-word old-rule oracle at 4 camera spots), `beta-s07-town-cull` ALL PASSED.
- Real browser: camera on the shore at 1280x720 and 390x844: 3 and 5 foam images on screen, 0 of them culled, 0 page errors, 0 DB attempts. Screenshots `img/cyc9-lead-town-shore-1280x720.jpg` (looked at: shore, foam line and HUD draw as before), `img/cyc9-lead-town-shore-390x844.jpg` (not looked at).

**Late arena fields (`game/realm.js`)**
- The task named 6. The new test found 14 added during a 12 s fight, and a 15th (`_lootIco`) whose timing depends on load order: `_enemyVis, _enemyDbg, lastDmgColor, _dmgTxtT, _numC, _spS, _noticeQ, _noticeT, _dslOn, dissolveStats, _dslKit, _chaseBestT, lastChaseToast, _chaseToastT, _lootIco`. All 15 are now declared in the constructor with the value the old code saw before its first write (`undefined` where the code tests for "not set yet").

**Pool-shape rule for Town and Isles**
- Town (`main.js`): the per-frame record lists were checked in a real page. `fishShadows`, `ffSpecimens`, `villagerState` already had one field list. `bugs` had two (`sprite,alive,tween` and `sprite,alive,extra`): both literals now declare `sprite, alive, extra, tween`.
- Isles (`isles.js`): creatures gained fields later (`flashSil` seen in the test; `seeHold, variant, slide, wslide, ret, stun, compHit, def` found by reading the code). All 9 are in the creature literal now. Bolts and death slots already had one list. New test hook `__isles.shapes()` (field lists only, `?test=1`).
- Test `cyc9-lead-pool-shapes.test.js` (new, full tier). Old game code (hook only): 3 FAILED (arena 263 -> 277 fields; Town bugs 2 lists; Isles creatures 2 lists). New code: ALL PASSED (14 checks), run 3 times.

## 2. `tools/stamp.sh`: crashing tests are now diagnosable

- Cause: the stamp prints only shard-log lines that start with `summary` or `FAIL`. A test that died with an exception has its reason on stderr only, so nothing was shown.
- Fix: `game/tests/lib/fail-lines.js` (new) builds the text under a failed test; `run-all.js` uses it for the first pass and for the solo rerun. It adds `FAIL-STDERR <file>: <first non-empty stderr line, 300 chars>`, `FAIL-TIMEOUT <file>: killed at its time budget`, or `FAIL-EXIT <file>: exit code N...`. The stamp's own greps print these lines. `stamp.sh` itself got a comment only; its greps did not need to change.
- Test `cyc9-lead-stamp-stderr.test.js` (new, node class, smoke tier as the tier rule requires): real crashing child processes and the real grep patterns read out of `stamp.sh`. It rebuilds the old text word for word and shows the stamp printed 0 lines for it; with the new text 1 line. ALL PASSED (10 checks). `run-all-tiers` ALL PASSED.
- Not run: a real 4-shard stamp with a crashing test in it.

## 3. Pop HUD, reviews

**Pop HUD uses `MMMiniKit.fmt` (`pop.js`, `pop.css`)**
- HUD Score, HUD Best and the result headline go through one formatter (plain digits if the kit script is missing).
- Finding while testing with the game's own writer: with separators a seven-figure value did NOT fit at 1280x720 (115 px text in a 103 px box) or at 390x844 (82 in 75). Earlier tests typed text into the element, so the real case never ran. Fix: a value of 7 or more characters steps its own font down until it fits, never under 12 px (measured once per HUD write, once a second).
- 160x284 (cycle 8 U, unresolved): under 180 px the stage and the value boxes give back 4 px a side. `1,234,567` at 12 px now spans 87..152 in a box of 87..152 (exact fit); Score spans within 8..73.
- Test `cyc9-lead-pop-fmt.test.js` (new, full tier), at 1280x720, 390x844, 195x422, 160x284: a real save with best 1234567, a real round, six- and seven-figure scores, the result card. Old code: 12 FAILED (plain digits at all 4 sizes). New code: ALL PASSED, 3 runs in a row. `pop-page`, `cyc8-ui`, `beta-r4-b09-12-pop-hud-fit`, `beta-r4-d4-arcade`, `shared-mm-minikit`: ALL PASSED.
- Screenshots `img/cyc9-lead-pop-hud-{1280x720,390x844,195x422,160x284}.jpg` and `cyc9-lead-pop-result-*` (looked at the 160x284 HUD: both values inside their boxes; the others not looked at).
- For U: `pop.css` is U's file; my change is one 4-line media rule at the end.

**195x422 / 160x284 Pop overflow review:** 195x422 was already fixed by U in cycle 8 and still passes with real formatted values. 160x284 is fixed above.

**`cyc7-idle-rest` load-sensitivity watch:** not run by me. Read S's cycle 9 change to that test (commit 014c9b7): it wakes the hero with one real input before counting and compares `restN` as a delta, which removes the cause seen in cycle 8 (the page idling during a slow load). The "not resting yet" check now has a 5 s margin instead of 8. Keep it on the watch list for one more stamp.

**S's ID-51 zone<=1 change (014c9b7): approved by code review, not run.** Notes are in IDEAS.md (one risk to watch: standing still for 5 s now also drops aggro in the Midlands).

**D's ideas:** ID-53 approved with 5 conditions; ID-55 approved with 5 conditions (size S to M, U reviews the card). ID-54 left proposed (needs U). Reasons and conditions are in IDEAS.md under "L review, cycle 9".

## Regression runs (targeted, 3 at a time, final code)

ALL PASSED: cyc4-town-cull-alloc, beta-s07-town-cull, cyc9-lead-pool-shapes, cyc9-lead-town-cull-pin, cyc9-lead-pop-fmt, cyc9-lead-stamp-stderr, pop-page, cyc8-ui, beta-r4-b09-12-pop-hud-fit, beta-r4-d4-arcade, run-all-tiers (after moving the node test to smoke), cyc8-lead-pool-shapes, shared-mm-minikit, isles-taming, isles-bugbash, isles-mount-ability, isles-first-ten, isles-boss, realm-core, realm, beta-w14-loot-bags, enemy-art, shared-removed-modules, telegraph-arena, cyc3-realm-frame-alloc.

`cyc7-lead-felled-by`: 3 FAILED in the parallel batch (at 1280x720 a Water Elemental felled the hero before the test's Sniper did), then ALL PASSED 3 times alone. I did not run it under load on the old code, so I cannot prove it is unrelated; the 15 declared fields keep the values the old code read, so I expect a load race in the test's set-up. Watch it in the stamp.

## Unresolved

- Town cull: 3.1 KB/frame remains. 66 sprites are measured on every pass (55 of them far off screen) and about 80 settled objects are re-measured per pass. A cheaper "did this sprite move" check needs position reads that do not allocate; not attempted.
- Realm arena: a code scan lists about 60 more fields first written outside the constructor on rarer paths (splash weapons `_spX.._spF`, leech/regen, forge and backpack panels, `lastLoss`, `_deathZone`...). Only the 15 seen in an ordinary fight are declared. The new test covers an ordinary fight only.
- The effect of the arena and Isles field declarations on bytes per frame was not measured.
- Isles: the 9 creature fields were found by a 40 s scripted fight plus reading the code; rarer paths (rares, mounts, homestead guests) were not exercised by the shape test.
- No real-phone check; all browser checks are headless Chromium.

## Proposals

- Declare the remaining late arena fields in one pass, driven by the code scan, and extend the shape test with a splash weapon, a death and an opened forge.
- Sprites in the Town cull: keep a per-sprite "last measured position" in a typed array indexed by a small integer id, so a standing sprite costs no allocation.
- Existing Pop tests that type text into `#h-score` could use the game's own writer (as the new test does); typed text hid the 7-figure overflow at 390 and 1280.
