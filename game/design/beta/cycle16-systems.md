# Cycle 16 - S Game Systems (branch cyc16-systems)

## Item 1: save safety for fishlog, home, weedsPulled, birthdays (DONE)

### What was wrong
These four pay-once keys were whole-key writes (`writeSave({ fishlog: {...} })` etc.). A second tab still holding an older copy wrote it
over a claim the first tab had just stored, and then paid the same claim again: the same weed, the 4-species journal milestone, the
first-catch bonus of a species, a birthday gift, and the daily home visitor bonus. Placing a good in a home spot in tab A and then
changing the aquarium in a stale tab B removed A's good from the spot (it had already left the bag).

### What changed (game/main.js, additive only, no new save key)
- `townLayerSave(base, over)` + `TOWN_CLAIM_MERGE`: every Town write (`writeSave`, `writeSaveMerged`), the live read (`loadSaveLive`, so
  `payOnceRecord`) and a refused write kept in `SAVE_PENDING` now MERGE these four keys instead of replacing them:
  - `fishlog`: per species `n` and `best` = max, `claimed` = union, `lastDay` = max
  - `weedsPulled`: same day = union of ids; a newer day wins whole (a stale yesterday write never replaces today)
  - `birthdays`: `claimed` = union (the newest 40 by day kept, as before), `guests` = union
  - `home`: `paidDay` = max; slots / tank from the writer (see next)
  - unknown fields / species of either side are kept (forward compatible); every other key still spreads as before. Restore writes
    storage directly, so a Restore is not merged.
- Claim sites read live before paying: `pullWeed` (unions the stored ids for today, hides a weed another tab pulled, pays nothing),
  `recordFishCatch` and `claimFishMilestone` (`syncFishLog`: merges the stored log only when storage moved since this tab last
  loaded / saved it), `giveNearestVillagerGift` (this tab's birthday claims plus the stored ones), `openHome` (a paid day another tab
  stored since this tab last saw storage counts).
- `saveHome` writes per entry (`townHomeEntries`): a slot / tank spot this tab did not change since it last loaded or saved keeps the
  stored value; a fish appears once in the tank.
- The "seen" bases (`_fishSeen`, `_homePaidSeen`) follow the existing base / delta style (adoptSave, townMergeCounts), so a tab's own
  in-memory state is not overridden when storage did not move.

### Checks actually run (port 9105, through /tmp/bt.sh)
- NEW `game/tests/cyc16-s-claim-merge-tabs.test.js` (browser, two tabs in one context, offlineStub, `db.attempts() === 0`,
  1280x720 and 390x844): **34/34 PASS** (run twice after the last change). Against HEAD's main.js (swapped in, then restored):
  **24 FAILED** ([WD] storage held only B's pull and B re-paid A's weed; [FM] claim wiped and paid twice; [FC] first-catch bonus paid
  twice; [BD] birthday paid twice and the claim wiped; [HM] visitor bonus paid twice and A's placed goods gone).
- NEW `game/tests/cyc16-s-claim-merge-fuzz.test.js` (node, 3000 seeded runs of 2-3 stale tabs with refused writes, hostile stored
  values, forward-compat fields): **ALL PASSED**. With the merge replaced by a plain spread it fails 3 checks (C1 in every run).
- Existing, all PASS after the change: home, aquarium, birthdays, weeds, dailies, fishlog, save-race-tabs, cyc13-design-refused-saves,
  cyc15-lead-refused-payonce, beta-r4-weed-reach, saves, save-compat-pages, cyc15-lead-pay-once-guard, save-hostile-fuzz,
  save-merge-fuzz.
- `save-race-tabs.test.js`: its static check pinned the literal `writeSave` text; I added the new equivalent form as an accepted
  alternative (same requirement: a fresh `loadSave()` is merged into every write). Not weakened: the old forms still match only the
  old code.
- Both new tests registered in `game/tests/test-tiers.json` (fuzz: node/smoke; tabs: browser/full, 300 s).
- Screenshots: `game/design/beta/img/cyc16-systems-home-1280x720.jpg`, `cyc16-systems-home-390x844.jpg` (taken at the end of the
  two-tab run; this item has no UI change, so they show only that the Town renders with no page errors).

### Unresolved / honest limits
- `fishlog.caught[x].n` is a max, not a sum: two stale tabs that each catch the same species once from n=3 store 4, not 5 (no claim
  depends on n; species, best, claims are exact).
- Two tabs placing DIFFERENT goods in the SAME home spot at the same time: the later one wins and the earlier good is lost (both left
  the bag). Rare; would need a crafted-goods refund on merge.
- A same-millisecond race between two tab processes is not covered: Chromium syncs localStorage between processes asynchronously,
  so the tabs test lets 300 ms pass before the stale tab acts.
- `cyc0-town-interact-shadow.test.js` fails 1 check ("door Night Racer" 72% < 75%, the scavenger claim takes E) on HEAD too, unchanged
  by this branch (pre-existing, likely date-dependent). Not touched.

## Item 2: ID-64 build (NOT STARTED)
Out of time in the 40-minute box after item 1. Left to do, per game/design/beta/cycle15-design.md: build B "quick dash x0.90" ships,
save keys `realm.build1` and `realm.build1Ask` (additive), the trap lives in `_abCd`; needs a before/after test and the realm save
merge (`rmMergeSave`) to carry the two new keys.

## Proposals
- Audit the other PAY_ONCE_KEYS (mail, dailies, bounty, villagerTalkDay, ...) for the same stale-tab whole-key write (not checked this
  cycle); where one is found, add it to `TOWN_CLAIM_MERGE` with a merge function and a case in the fuzz test.
