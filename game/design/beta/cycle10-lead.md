# Cycle 10, L (Lead Developer)

Branch `cyc10-lead`, port 9101, worktree `/tmp/wt-cyc10-lead`. Nothing pushed. Firebase blocked in every browser test (`db.attempts() === 0`, literal). The full suite was NOT run (coordinator's stamp). `firebase-config.js`, `net.js`, `ci-status.json` untouched. No save key added.

## 1. Pixeltown (Town) shop purchase reliability (`game/main.js`)

Audit of the buy / sell / outfit paths: turnip stall (`buyTurnips`), shop (`sellAtShop`), Able Sisters (`applyOutfit`), travelling merchant (`buyFromMerchant`, `buyMerchantGiftBox`), workbench (`craftRecipe`), home plots (`setHomeSlot`). All of them save through `writeSave` / `writeSaveMerged`.

**Found**
- A. A write that browser storage refused (quota full, blocked) was swallowed without a word. The player saw "bought" and the turnips, the sale or the new look were gone after a reload.
- B. `saveResources` moved its delta base even though nothing had been written, and then copied the stored numbers back into the bag. So a bundle bought while storage refused disappeared from the bag at the next save (20 turnips back to 10, stars already spent), and it stayed lost after storage worked again. A sale had the opposite result: the sold goods came back.
- C. The turnip daily cap (2 bundles) was read from storage only, so while storage refused writes the stall sold without limit.
- D. An outfit applied while storage refused was never written later.

**Fixed**
- `writeSave` keeps a refused partial (`SAVE_PENDING`) and writes it under the next write that lands; it returns true / false. `writeSaveMerged` returns null when storage refused, so the callers (`saveResources`, `saveFossils`, `saveAchievements`) keep their base and the change stays a pending delta.
- `unsavedNote()` after a buy, a sale, an outfit change, a merchant buy and gift boxes: "..., but not saved yet: browser storage is full or blocked, so it is kept for this visit until a save works." It goes to the polite toast and above the player (same wording as the Realm shop in cycle 9). The workbench note gets the same sentence.
- The turnip cap and the gift-box "already sent today" check read storage plus what is pending (`loadSaveLive`).

**Test** `cyc10-lead-town-shop-reliability.test.js` (new, full tier). Real input: the hero stands at the stall / shop / Able Sisters and E is pressed; the phone pass taps `#interact-btn`. Storage is made to refuse only `pixeltown-save-v1`.
- New code: ALL PASSED (19 checks, 1280x720 keyboard and 390x844 touch).
- Old `main.js`: 10 FAILED (no warning; cap not held: 99564 stars after 4 buys; refused buy never saved; sold goods back in the save; outfit lost; after a reload the save had 10 turnips, 5 wood, 1 bundle, the old hero).
- Screenshots `img/cyc10-lead-town-unsaved-1280x720.jpg` and `img/cyc10-lead-town-unsaved-390x844.jpg`, both looked at: the toast is in view and readable at both sizes.

**Not covered by a test:** merchant buy and gift boxes (the merchant only visits at set hours), workbench craft, home plots. They use the same two writers; only the turnip, sell and outfit paths were run.

## 2. Watch-list flakes and the Town cull

Method: each test looped through `/tmp/bt.sh` with 4 busy-loop processes per loop on the 4-core machine (load average 17 at one point, the tests' own load factor 3.8 to 6).

**`cyc7-idle-rest`: reproduced, root cause in the test, fixed.**
- Loaded loop on the cycle 9 tip: 1 of 3 runs FAILED: "C: an idle hero on a Highlands tile does not rest" with `restN: 1, resting: false`.
- Cause: under load the page idles on its Shore spawn for 5+ game seconds while it loads, so the hero has already rested once before the test puts it on the Highlands tile. Part C compared `restN` with 0. Cycle 9 fixed this for parts A and B only.
- Fix (test only, stricter): the teleport returns `restN` at arrival; Midlands must show exactly one new rest (was `>= 1`), Highlands none.
- After: 4 of 4 loaded runs ALL PASSED.

**`cyc7-lead-felled-by`: root cause reproduced with a probe, fixed in the test.**
- Loaded loop on the cycle 9 tip: 4 of 4 passed, so the load alone did not reproduce it here.
- Probe (page left running N ms before the test's steps): at 6000 ms the seed's own enemies had 11 bolts within 120 px of the hero, and the 1-HP hero fell to "Sprout" instead of the test's Sniper. That is the cycle 9 failure ("Water Elemental felled the hero first").
- Cause: the test fires one bolt and expects the fall to be to it, but did nothing about bolts already in the air.
- Fix (test only): `fallTo` silences the other enemies and takes their bolts out of the air, at the start and on every frame until the fall. New section "slow start": another enemy's six bolts are 8 px from the hero (closer than the test's bolt) when the test acts; the card must still name the Sniper.
- Proof: the same file with only the isolation lines removed: 1 FAILED ("felled by Burster"). With them: ALL PASSED. Loaded loop on the final file: 4 of 4 ALL PASSED.
- Honest note: my first version of the new section (waiting for natural bolts near the hero) did not fail without the fix and once did not reach its precondition; it was replaced by the deterministic one above.

**Town cull (`cullOffscreen`)**
- Cause: sprites (95 now, cycle 9 added fauna) are measured on every pass, at field-read sites that every one of the ~980 display-list objects of all types goes through; each read there returns a fresh boxed number.
- Fix: sprites are measured in `_cullSpriteBox`, a helper only sprites reach. Same floor / ceil box, same cull bits.
- Numbers (heap sampler, standing still, 400 frames, same machine under the same load): `cullOffscreen` 3,673 and 3,642 B/frame before; 1,937 and 1,873 after (helper: 0). The new test printed 1,814 and 1,886 (new) and 3,848 (old code). About half. Objects measured per pass unchanged (203).
- Test `cyc10-lead-town-cull-sprites.test.js` (new, full tier): every visible world sprite goes through the helper once per pass and nothing else does; the stored box equals the old rule's box for every standing sprite and for a moved, a scaled, a rotated and an off-centre-origin sprite; a sprite with no size is skipped with its bit left alone; cull bits of all sprites equal the exact rule at 3 camera spots. New code: ALL PASSED. Old `main.js`: 1 FAILED (no helper). Bytes are printed, not asserted.
- Existing tests, unchanged, on the new code: `cyc4-town-cull-alloc`, `beta-s07-town-cull`, `cyc9-lead-town-cull-pin`: ALL PASSED.

## 3. Late arena fields, and a review of S

**Late fields (`game/realm.js`)**
- A scan of every `this.x =` in `RealmArena` against the arena's own keys at the first frame of play (real page) listed 60 fields added later: splash weapons (`_spX`, `_spY`, `_spR`, `_spOk`, `_spOut`, `_spD`, `_spF`, `splashN`, `lastSplash`, `_spFxO`, `splashArtN`, `_spTxtT`, `_spRings`, `splashRingN`, `_spCache`), leech / regen (`_leechCap`, `leechHealed`, `regenHealed`, `_gHurtT`), panels (`panel`, `_shopDom`, `_shopMsg`, `_forge*`, `_bp*`, `_armTs`, `_relicOpen`, `_cmpOnUid`), a fall (`deadT`, `lastLoss`, `_deathZone`, `_cacheKAt`), resize, gamepad and others. All 60 are declared in the constructor with `undefined`, the value every read saw before the first write, so no read changes. `hurtGuard` (set from outside by the first-run tutorial) is declared too.
- Test `cyc10-lead-arena-shape-rare.test.js` (new, full tier), one real session on the world page: a splash bolt into a cluster, a leech heal through the gear tick, the backpack, a shop buy and the forge panel by real clicks, a window resize, a fall, Try again. New code: ALL PASSED (the arena has exactly its first-frame fields). Old `realm.js`: 1 FAILED, 35 fields added late (listed in the failure line).
- The other 25 declared fields (regen, resist, gamepad Back, the full-backpack toast, relic and compare toggles, the save warning, the tutorial's `hurtGuard` ...) are not exercised by the test.
- Screenshot `img/cyc10-lead-arena-rare-1280x720.jpg` (looked at: the world and HUD draw normally after the session).
- The effect on bytes per frame was not measured.

**Review of S (`cyc10-systems`, 6a6b4cc)**: the commit appeared while I worked. Code review only, nothing run: `game/design/beta/fixes/cycle-10-lead.md`. One point to send back: on desktop the Menu hint says "Press Esc to open the Menu", and the hint's own key handler swallows that Esc, so the Menu does not open (S's test asserts that behaviour for all verbs). Four smaller notes.

## Regression runs (targeted, 3 at a time, final code)

ALL PASSED, 32 of 32 (one batch, each test once): beta-r4-d4-town, beta-s02-town-two-tabs, cave-craft, cyc0-town-interact-shadow, town-first-ten, town-heroes, workbench, seasonal, town-offline, beta-retest-b15 (storage fully blocked), deepdelve-crafting, cyc9-design-shop-flow, cyc4-town-cull-alloc, beta-s07-town-cull, cyc10-lead-town-shop-reliability, cyc10-lead-town-cull-sprites, cyc9-lead-pool-shapes, cyc8-lead-pool-shapes, realm-core, realm, cyc9-shop-reliability, gear-splash-player, cyc4-forge-hint, cyc3-realm-frame-alloc, arena-p2-hotpath, realm-shop-death, cyc6-shop, telegraph-arena, cyc10-lead-arena-shape-rare, cyc7-lead-felled-by, cyc7-idle-rest, run-all-tiers.

`cyc9-lead-town-cull-pin` passed in a separate run after the cull change. Not run: the full suite, S's two new tests, any merge with the other cycle 10 branches.

## Unresolved

- Town saves: if another tab writes the save while this tab holds unsaved changes, `adoptSave` resets this tab's counters to storage and the pending delta is lost. Not handled (storage refusing one tab while another writes is unlikely).
- Town stars (`localScore`) are not in the local save at all (they start at 0 each visit and live in the online score). Not changed; worth a design decision for offline play.
- The long "not saved yet" line above the player overlaps the stall label for about 2.5 s (the toast is the readable copy). For U.
- Town cull: about 1.9 KB/frame remains (non-sprite objects that are re-measured, 203 measured per pass).
- `cyc7-lead-felled-by` never failed in my loaded loops on the old file (4 of 4 passed); the cause was shown with a probe and a deterministic case, not by reproducing the exact cycle 9 failure.
- No real-phone check; all browser checks are headless Chromium.

## Proposals

- A shared test helper for "silence the world" (other enemies and their bolts) so tests that spawn one enemy on the world page do not each rediscover this race.
- Settle rule for standing sprites in the Town cull (measure every 2nd pass once the box was the same 3 times) would cut the rest, but changes when a walking sprite is seen; needs its own test first.
- Persist Town stars locally (additive key) so offline players keep them.
