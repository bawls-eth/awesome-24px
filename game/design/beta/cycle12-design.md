# Cycle 12: D (Gameplay Designer)

Branch `cyc12-design` (worktree agent-a884ebc5e500b7c34, cut from 0207dda), port 9124. Nothing pushed. Firebase blocked in every test (offlineStub, literal `db.attempts() === 0`).

## Item 1: Town shops purchase / save-failure audit

Method: new `game/tests/cyc12-design-town-shops.test.js` (registered in test-tiers.json), mirroring cyc9 / cyc10: real E presses, real clicks / `selectOption`, real taps at 390x844, and `Storage.prototype.setItem` made to throw for `pixeltown-save-v1` (full quota). Cycle 10 already covered the turnip stall, the shop sale and the Able Sisters; this covers the workbench, the pickaxe bench, the home plots and the merchant (look and gift boxes).

Found by the test (before the fix: 4 FAIL, all real):
1. **Pickaxe craft**: said "Crafted the Stone Pickaxe!" with no "not saved yet" even when storage refused (the plain recipes already warned). Fixed in `craftPick` (`main.js`).
2. **Home plots**: placing or taking a good was silent when storage refused (`setHomeSlot`; also the daily "visitors admired your home" line). Now the home note says "Not saved yet ..." (`main.js`).
3. **Cross-tab turnip cap (item 2 below).**
Checked and fine (passed before and after): workbench plain craft (warns, kept, written by the next save), merchant look and gift boxes (SAVE_PENDING kept, warn, gift boxes cannot be bought twice while refused, both written when storage returns).

## Item 2: cross-tab stale whole-key turnip count

Reproduced (before the fix, 2 FAIL): tab A's storage refuses its bundle, so the whole-key `turnipBuys {day, bundles: 1}` sat in `SAVE_PENDING`; tab B (same save) buys 2 bundles (storage = cap). Tab A, storage working again, still read the live count from `SAVE_PENDING` (1, overriding B's 2) and bought a third bundle; the later flush also wrote the stale value over B's. Fix (small, `main.js`): A keeps only its OWN unsaved bundle count (`TURNIP_UNSAVED {day, n}`), and `pendingOn(stored)` rebuilds `turnipBuys` as stored + own on every read (`loadSaveLive`) and write (`writeSave`, `writeSaveMerged`). After the fix tab A is "Sold out" and its flush writes 3 (B's 2 + its own refused 1: the true number bought), never lower than B's count. Note the one bundle A bought while refused is real and stays counted; the cap cannot undo a purchase already made.
`save-race-tabs.test.js` pins the source shape of `writeSave`; I extended its regex to also accept the new `const stored = loadSave(); ... {...stored, ...pendingOn(stored), ...partial}` form (the intent it checks, a fresh `loadSave()` merged on every write, is unchanged).

## Checks actually run (all through /tmp/bt.sh, port 9124, load factor 3-4)
| Check | Result |
|---|---|
| `cyc12-design-town-shops.test.js` before the fix | 4 FAIL ([P] pickaxe note, [H] home note, [T] stale pending sold-out, [T] flush adds) |
| same after the fix | ALL PASSED (workbench, pickaxe, home, merchant at 1280x720; pickaxe tap at 390x844; two-tab cap) |
| `cyc10-lead-town-shop-reliability.test.js` | ALL PASSED |
| `cyc11-lead-town-stars.test.js` | ALL PASSED |
| `beta-retest-b14.test.js` (two Town tabs) | ALL PASSED |
| `save-race-tabs.test.js` | 1 FAIL (source-shape regex) before my regex extension; ALL PASSED after |
| Screenshots | `img/cyc12-design-bench-unsaved-1280x720.jpg`, `-390x844.jpg`, `img/cyc12-design-home-unsaved-1280x720.jpg` (note in view; 390x844 viewed) |
Not run: 195x422 for the bench/home note (the note is plain text in the existing overlays; not viewed there), the full stamp, 160x284.

## Unresolved
- **Home placement duplicate window (low)**: `saveHome` writes the home slots through `writeSave` but the crafted-goods decrement goes through `saveResources`'s delta, which is not part of `SAVE_PENDING`. If storage refuses, the placement is kept pending, then storage returns and ANY non-resource write flushes the placement while the plank still counts in storage until the next `saveResources`; a reload in that gap shows the plank both placed and in stock (worth 4 stars). Test [H] has to call `saveResources` to see the final state. Fix would be a dirty-resources flag flushed by `flushPendingSave`/`writeSaveMerged`; not done (not small, rare).
- The Town stalk/merchant paths other than those tested (Polyroll, Museum donation, Scavenger, mailbox) were not audited for refused saves.
- The tab-reload-on-name-change when a second tab joins with a different name made my two-tab test use one shared name; real players with two names in two tabs reload the first (existing behaviour, valid).

## Item 3: ideas and ID-62..64 status
Added ID-65..67 (proposed) to `design/IDEAS.md` (section "Cycle 12 additions"): persistent "Not saved" chip, first workbench step in the first-visit goal chain, Lv 5-8 pace smoothing. They are grounded in the cycle 11 first-ten bot numbers (Lv 5 at 64-99 s, Lv 8 at 140-246 s) and in this cycle's audit, not in web retention data (none gathered this cycle; no web search run).
ID-62..64 build status: none built, none reviewed by U/L (U reviewed ID-56, 59, 60, 61). ID-62 and ID-63 depend on ID-59 (approved, not yet built: S order ID-61, ID-56, ID-59); ID-64 is M/medium and needs an economy check and a U card.

## Proposals
- S: after ID-59, ID-62 and ID-63 are cheap follow-ons. U: placement for ID-65 at 195x422.
- L: the dirty-resources flag above (home duplicate window), and extend the refused-save audit to Polyroll, Museum, Scavenger, mailbox.
