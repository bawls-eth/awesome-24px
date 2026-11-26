# Cycle 13: D (Gameplay Designer)

Branch `cyc13-design` (worktree agent-adbcc73a0c889969b, cut from 1e6b3b6), static server port 9134. Nothing pushed. Firebase blocked in the test (offlineStub, literal `db.attempts() === 0`). Browser runs through /tmp/bt.sh at load factor about 3.

## Item 1: refused-save audit (Polyroll, Museum donation, Scavenger, mailbox)

New test `game/tests/cyc13-design-refused-saves.test.js` (registered in test-tiers.json, tier full), mirroring cyc12-design-town-shops: `Storage.prototype.setItem` throws for `pixeltown-save-v1`, real button clicks (Polyroll Roll, mailbox Collect), direct scene calls where the world path needs a position or Firebase (donateFossils, claimScavenger with `net.claimScavengerSpot` stubbed, never Firebase). Run at 1280x720 and 390x844.

Real bugs found (before the fix: 18 FAIL, 9 per viewport):
1. **Mailbox free repeat collect (the worst one).** `claimedLetters()` and `claimLetter` read `loadSave()` (storage only). A refused claim sits in `SAVE_PENDING`, so the letter still looked unclaimed: Collect stayed enabled, a second `claimLetter` returned true and paid the gift again, repeatable for as long as storage refused. Also no "not saved yet" note. Fixed: both read `loadSaveLive()`; the note appends "Not saved yet: ...".
2. **Museum donation silent.** No warning at all, and the donation (museumCollection + the emptied fossil bag) was never retried: `saveFossils` is a merged writer whose refusal left only memory state, and no later write carried it (only the cross-tab `flushPendingSave` did). After storage returned and other writes landed, storage still had the fossil in the bag and no donation. Fixed: `unsavedNote('Donated')` and a flush hook (below).
3. **Polyroll silent, and stars not re-flushed.** The result line looked final; the refused star delta was only retried by the next `saveStars`, so a landing write for something else left storage at 50 stars while the visit held 49. Fixed: result line says "Not saved yet ..." (offline only, where stars persist) and the stars flush hook.
4. **Scavenger win silent.** `unsavedNote('Found it')` added. (Online the star reward is not stored locally by design; the lifetime stat is.) Note: offline the scavenger can never be won (stub net), so this path is only reachable online and was tested with the net method stubbed.

## Item 2: home placement duplicate window

Reproduced (before the fix, test [HD], 2 FAIL per viewport): with storage refusing, `setHomeSlot` keeps the placement in `SAVE_PENDING.home` and the crafted-goods decrement stays only in memory (`saveResources` refused). Storage returns; any write that is not `saveResources` (here `incrementStat`, in play any achievement/stat/star write) lands the pending `home` slots while storage still holds `crafted.plank = 1`. Raw storage then showed `home.slots[0] = "plank"` and `crafted.plank = 1`, and a page reload gave slot = plank AND plank = 1 in stock.

Fix (small, `main.js`): a refused `saveResources`, `saveStars` or `saveFossils` registers itself in `RES_FLUSH` / `STARS_FLUSH` / `FOSS_FLUSH`; every `writeSave` / `writeSaveMerged` that lands calls `flushResAfterWrite()` right after (guarded against re-entry; each writer clears its own hook before it writes). The two `setItem` calls happen in one synchronous step, so no reload can fall between them. After the fix: storage shows the placement and `crafted.plank` 0 immediately after the unrelated write, and a reload shows placed once, none in stock.

Honest limit: a tab closed or crashed in the refused window still loses what storage never took (nothing can be written); this fixes what happens once storage works again.

## Checks actually run
| Check | Result |
|---|---|
| `cyc13-design-refused-saves.test.js` on 1e6b3b6 main.js (fix reverted) | 18 FAIL (mailbox x3, museum x2, polyroll x2, scavenger x1, home duplicate x2 per viewport) |
| same with the fix | ALL PASSED at 1280x720 and 390x844 (after two extra rounds: the stars and museum flush hooks were added when the first fix still failed 2) |
| `cyc12-design-town-shops`, `cyc10-lead-town-shop-reliability`, `cyc11-lead-town-stars`, `save-race-tabs`, `mailbox`, `beta-retest-b14` | ALL PASSED |
| `save-merge-fuzz` | 5000 runs, 0 with issues, 23 passed 0 failed |
| Screenshots viewed | `img/cyc13-design-mailbox-unsaved-390x844.jpg` (note with "Not saved yet" under the letters, Collected button greyed) ; saved but not individually viewed: `-1280x720` mailbox, polyroll and museum pairs |
Not run: 195x422 (the notes are plain text in existing overlays/toast), the full stamp, 160x284. Main.js `?v=` cache version not bumped (coordinator convention after merge).

## Unresolved
- Save-scumming Polyroll offline while storage refuses: a lost bet comes back after a reload (storage keeps the older, larger star count). Inherent to a refused write and now at least announced; not a fix.
- A tab closed in the refused window loses it (see above).
- `mm-shop-pin` not in Backup export, compass z-index, and the other cycle 12 Open items are not mine and untouched.

## Item 3: ID-62..64 build readiness (D review) and new ideas

Nothing of ID-59, 62, 63, 64 exists in `main.js` or the tests (grep for the animal hello / treat lines finds nothing). Status:
- **ID-59 (animal hello, approved with conditions, not built)**: the gate for both ID-62 and ID-63. It must land first. It is ready: U's spec is in IDEAS.md; the Town animal list and `cullOffscreen` pool shape are the integration risk (the Town cull is the hottest allocation path, L watches it).
- **ID-62 (animal treat bubble)**: ready to approve after ID-59 is built. Risk: a carried flower/berry hand-over must go through the new `RES_FLUSH` path (it changes `resources`), so its test should include one refused-save case like cyc13. Size S stays honest. Not yet reviewed by U or L: needs a one-line U check of the bubble at 195x422 and L's allocation check.
- **ID-63 (Isles tame callback in Town)**: depends on ID-59 for the turn-toward behaviour and on the Isles save key for "first tame"; additive key only, so check which existing key already says "tamed once" (likely the Isles save) and reuse it. Ready to approve conditionally on reusing it. Not reviewed by U/L.
- **ID-64 (first-build choice at Lv 5)**: not ready: needs an economy sim and a U card. Its trigger (Lv 5) comes at 64-99 s (cycle 11 bots) so the card lands inside the first two minutes, where the first-session ending card (ID-55) and the hint (ID-53) already compete for the same space; U must decide the stacking order first. Keep last.
- Recommended S order: ID-59, ID-62, ID-63, ID-64.

New ideas (status `proposed`, in `design/IDEAS.md`, section "Cycle 13 additions"), grounded in `ftue-metrics.json` (bot data, not human data; no web search run):
- **ID-68 First-level floor (Shore)**: first level-up 6.8-29.7 s across 6 seeds, the only early beat that varies; seed e also had the 36.2 s reward gap.
- **ID-69 Isles tame-then-fight bridge**: first tame 38-110 s but first hit up to 338.5 s (reef-b) and first drop 188.8 s (jungle-a); one hint-chip line.
- **ID-70 Isles low-HP breather**: min HP 2-7 on four isle runs and one death (reef-a) in the first ten minutes; a 2 s non-healing aggro drop once per visit.

## Proposals
- S: build ID-59 then ID-62/63; add a refused-save case to each new Town write path (the hooks are in place).
- L: review the `flushResAfterWrite` hooks (three module-level flushers; consider folding them into one list if a fourth appears), and add `FOSS_FLUSH` to `flushPendingSave`'s thinking (it already calls `saveFossils`, so the cross-tab path is covered).
- U: placement of the persistent "Not saved" chip (ID-65) at 195x422.
