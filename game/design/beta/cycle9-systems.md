# Cycle 9 - S Game Systems Developer

Branch `cyc9-systems` (worktree `/tmp/wt-cyc9-systems`, cut from `ddfc132`), static server port 9905. Not pushed.
Before/after proof: the old build was served from the main checkout (still at `ddfc132`) on port 9915 and the new tests were run against it.

## 1. ID-51 idle-hero rest extended to the Midlands (zone <= 1), RM_IDLE_REST_S 8 -> 5

**Changed**
- `game/games/mad-maze/realm-world.js` `restOk`: `zoneInfoAt(...).zone === 0` -> `.zone <= 1` (Highlands and Godlands keep today's rules on purpose).
- `game/realm.js` `RM_IDLE_REST_S` 8 -> 5 (the optional part of D's spec: the hero that is hit in its first seconds lives too).
- Tests:
  - `cyc8-design-inland-passive.test.js`: for ZONE 0..1 with no REST_ZONES simulation it now ASSERTS that every seed's idle hero rests on a zone-1 sample and is alive at 120 game s (ZONE=2 stays a measurement).
  - `cyc7-idle-rest.test.js` C: was "Midlands never rests", which pinned the old rule the approved spec changes. It now checks that Midlands rests and that Highlands (zone 2) never rests, so the deeper-zone guard moved one zone down and is not dropped.
  - `cyc7-idle-rest.test.js` A/B: one real input (key / touch tap) wakes the hero before measuring. Reason: the page can idle more than 5 s while it loads on a busy machine. B checks "exactly one new rest" against the restN at the wake point. A is now stricter: idle must stay under 5 s, where it was under 8 s.
  - `cyc8-s-rest-chip.test.js`: same wake input at the start. The "never shows on Midlands" check is now "shows on Midlands" plus "never shows on Highlands", and the test waits one frame after the teleport so a stale rest flag is not read.

**Checks run (real results)**
- Old build: `cyc8-design-inland-passive` with SEEDS=12345,777 gave **2 FAILED** (falls at 14.7 s and about 10 s). `cyc7-idle-rest` gave **1 FAILED** (C Midlands does not rest; the Highlands guard passed). `cyc8-s-rest-chip` gave **1 FAILED** (Midlands chip never shows).
- New build:
  - `cyc8-design-inland-passive`, all 6 seeds: **ALL PASSED**, 0/6 fell. Lowest HP per seed: 43, 80, 82, 72, 71, 91 of 100. Before the change, D measured 6/6 falls within 30 s.
  - `cyc7-idle-rest`: **ALL PASSED**. The first run on the new build failed A and B at load factor about 3: set-up idle time over 5 s, which is a test race. Fixed as described above, then it passed.
  - `cyc8-s-rest-chip`: **ALL PASSED** on the third run. Run 1 had the same load race; run 2 read the stale Highlands sample; both were fixed as above.
  - `cyc6-lead-passive-landscape`: **ALL PASSED**. `cyc3-realm-frame-alloc` (the quiet-nudge vs rest check): **ALL PASSED**.
- Real browser: an idle hero teleported to Midlands tile (96,178) rests, the chip reads "Resting: move to play", and the hero is still in play (HP 37 and 61), with 0 errors and db 0. Screenshots: `img/cyc9-systems-midlands-rest-1280.jpg`, `img/cyc9-systems-midlands-rest-390.jpg`.

## 2. ID-53 / ID-55: not implemented (not approved)
Both are still `proposed` in IDEAS.md and nobody has marked them approved, so I did not build them, as the rule requires. The other approved ideas that are not built yet (ID-05 High contrast, ID-10 shared result card, ID-11 retreat flag) are all size M and did not fit the remaining time box. None started. ID-09 and ID-18 were built in cycle 8; their table rows still say `approved`, and D should mark them built.

## 3. Realm shop purchase reliability (audit of `_shopTap` -> `buy` -> `onSave`/`_persist`)

**Found, fixed in `realm.js _shopTap`**
1. **A buy whose save write failed was reported as a success.** When browser storage is full or blocked, `_persist` sets `saveOk = false`. The only warning was a canvas notice, drawn behind the 85% shop overlay. The panel said "Bought ... it is in your backpack", and the item was gone after a reload. The panel now adds: "Not saved yet: browser storage is full or blocked, so it is kept for this visit until a save works." The next good save writes the buy (tested through a reload).
2. **A Buy whose id or rarity does not resolve returned with no answer.** It now answers "That is not for sale right now." and spends nothing.

**Audited, no silent failure found**
- Price and stock are the same in `renderShop` and `buy`.
- Full pack, too few shards and stock changes already answer in the panel (cyc6).
- `_snd` is try-wrapped, and the float text cannot throw.
- Styled weapons of the hero's family buy and survive `rmCleanSave` on reload.

**Test** `cyc9-shop-reliability.test.js` (new, registered in test-tiers.json):
- Part 1: storage refuses the write, so the warning must show in view. Storage then works again, so both buys must be saved, also after a reload.
- Part 2: a junk tap must answer.
- Part 3: on an 844x390 touch phone with a level-20 ranger, 24 real touch taps (all 12 bows and 12 base items, every rarity) must each buy exactly one item and show "Bought" in view, and all 24 must survive a reload. Playwright refuses a tap on a button that something covers.
- Part 4: the last row at 390x844 and at 195x422 must buy and save.
- Results: on the old build, part 1's warning check and part 2 **FAILED**; parts 3 and 4 passed (a regression net). On the new build: **ALL PASSED**, 14 PASS lines.
- `run-all-tiers.test.js`: **ALL PASSED**.
- Neighbours on the new build: `cyc6-shop` **ALL PASSED**, `realm-shop-death` **ALL PASSED**, `nexus-vendor` **ALL PASSED**.

Screenshots: `img/cyc9-systems-shop-unsaved-1280.jpg`, `img/cyc9-systems-shop-landscape.jpg`, `img/cyc9-systems-shop-390.jpg`, `img/cyc9-systems-shop-195.jpg`.

## Unresolved / proposals
- **For U:** at 195x422 the sticky shop header (`.rm-shop-top` with `#realm-shop-msg`) has no opaque background, so the rows show through the "You have" line and the "Bought" line (see `img/cyc9-systems-shop-195.jpg`). The buy works and the message passes the hit test, but it is hard to read. The proposed fix is a solid background on the sticky header. I did not change it because it is in U's area.
- `writeSave` in `mad-maze.js` still swallows storage errors. That is fine now, because `_persist` re-reads storage and detects the failure.
- The town-side shops (Pixeltown) were not part of this audit.
- ID-53 and ID-55 need an L or U review before S can build them.
