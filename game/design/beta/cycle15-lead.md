# Cycle 15: L (Lead Developer)

Branch `cyc15-lead` (worktree agent-a918b48aa2aa4866d), static server port 9101. Nothing pushed. Firebase blocked in every browser test (offlineStub, literal `db.attempts() === 0`). Browser runs through /tmp/bt.sh at load factor about 3. No new save key. No existing test or threshold edited.

## Item 1: pay-once records read live (built, tested)

**Shared helper (`game/main.js`).** `payOnceRecord(key)` returns `loadSaveLive()[key]` (storage plus what this tab could not write yet). `PAY_ONCE_KEYS` lists the 17 keys that answer "already paid / claimed / counted today": mail, dailies, bounty, merchantGiftBoxDay, turnipBuys, bugoff, fishlog, weedsPulled, home, villagerTalkDay, villagerAffinity, birthdays, questClaimedBucket, triviaAnsweredBucket, tournamentBonusBucket, kkEnjoyedWindow, errand. Every reader of those keys now goes through the helper (the six that D and I had already moved to `loadSaveLive()` too).

**Audit result, with storage refusing `pixeltown-save-v1` and no reload:**

| Record | Before | Now |
|---|---|---|
| Bug-Off (`bugoff`) | Real bug. The count was read from storage on every catch, so at 4 caught every further catch paid the Bronze medal again (3 catches, 3 medals) and the count never moved. | Paid once, count goes on, "Bug-Off prize, but not saved yet" note. |
| Daily hello (`villagerTalkDay`, `villagerAffinity`), not on the list I was given | Real bug. Every chat gave the daily +2 hearts again (4 chats: 0 to 8) and ticked the wave bounty 4 times. | Once per neighbor per day. |
| Mocha's errand (`errand`), not on the list | Real bug. The refused step vanished, so she took 3 wood on every talk (3 talks: 20 to 11). | Wood taken once; the step is kept for the visit (`_errandUnsaved`, memory only), retried on the next talk or pending flush, never steps back; note shown. |
| Fish milestone (`fishlog.claimed`) | Paid once already (in-memory list). Silent. | Same, plus the "not saved yet" note. |
| Weeds (`weedsPulled`) | Paid once already (in-memory set). A re-read of today's record lost every pull (24 left again). Silent. | Re-read keeps the pulls; the Spotless bonus says "not saved yet" (not every weed: the "Not saved" chip covers those). |
| Home visitor bonus (`home.paidDay`) | Paid once in memory, already warned. A fresh `loadHome()` paid it again. | Paid once even after a re-read. |
| birthdays, quest / trivia / tournament buckets, concert | In-memory copies; no repeat in a visit. | Reader moved to the helper only. |

**Checks run.**
- `game/tests/cyc15-lead-refused-payonce.test.js` (registered, full tier), 1280x720 and 390x844. On the old `main.js` (HEAD copy put back for the run): **24 FAIL** (12 per viewport: 3 medals, hearts 0 to 8, 4 wave ticks, wood 20 to 11, no notes, weeds 24 left after a re-read, home bonus paid twice, stored Bug-Off count 5 instead of 7, and things paid again after storage returned). On the new code: **44/44 PASS**, twice (alone and in the batch below).
- `game/tests/cyc15-lead-pay-once-guard.test.js` (registered, node, smoke tier): fails on any `loadSave().<key>` or `loadSaveLive().<key>` read of a listed key. Old `main.js`: **12 FAIL**. New: ALL PASSED. Limit: it sees the direct form only, not a read through a local variable.
- Existing tests on the new code, each ALL PASSED: bugoff, cyc2-errands, cyc3-errands-wired, weeds, home. Started but not finished when this report was written: fishlog, birthdays, dailies, mailbox, cyc14-design-refused-claims, cyc13-design-refused-saves, town-concert-once, save-race-tabs, save-merge-fuzz, cyc12-design-town-shops (see the hand-back message for their results).
- Screenshot viewed: `img/cyc15-lead-payonce-unsaved-390x844.jpg` (toast line readable, "Not saved" chip up). The three floating notes overlap in it because the test fires three claims within a second on one spot; in play they are seconds apart. The 1280x720 image was saved, not viewed. The home panel itself is not in the picture.

**Not fixed (inherent, unchanged):** refused write, then reload: storage never had the record, so any claim can be made again after the reload. A tab closed in the refused window loses it. Two tabs: `fishlog`, `home`, `weedsPulled`, `birthdays` are whole-key writes from memory, so a second tab can still overwrite the first tab's claim (not looked at this cycle).

## Item 2: reports only, nothing built

### ID-70 (2 s aggro drop) against the wanderer leash: safe if built as below

Read from `game/games/isles/isles.js` `think()` (not run in a browser):
- The leash trips only when a creature is more than 14 tiles (448 px) from its home, or `c.ret` is set. Then it zeroes `c.angry` and walks back to within 128 px of home for up to 8 s, ignoring the hero. Dropping the chase does not touch `c.ret`, `c.hx/hy` or HP, so a breather does not by itself reset anything.
- **The Isles already have a breather.** IF1 "mercy": at 1/3 HP or less, when the hero has not shot for 1 s, wild creatures stop chasing (never while a boss is engaged). ID-70 only adds: it also holds while the hero keeps shooting, for 2 s, once per visit, with a line. Under 20% is inside the mercy band, so a hero who stops firing is already left alone.
- **Risk 1, coasting.** A creature that stops chasing keeps its last velocity (1.15 x speed, towards the hero) until a 12%-per-think roll changes it. In 2 s it can travel up to about 250 px (speed cap 110 px/s; about 8% of cases never re-roll in 2 s). One that was within that distance of its leash ring can cross it and then walks home for up to 8 s: exactly the "walks off and resets" case. The mercy rule has the same exposure today.
- **Risk 2, neutral creatures.** `c.angry` (6 s after a hit) keeps counting down. A neutral creature with under 2 s of anger left will not fight again after the breather.
- **Risk 3, the test wording.** `think()` returns early while an attack is in wind-up or strike (wind-up 0.3 to 0.7 s), and the comment says such an attack still lands. "Deal no damage for 2 s" fails unless wind-ups are cancelled.
- **Risk 4, the 120 px ring.** Aggro radius is 192 to 380 px, chase speed up to about 126 px/s: a hostile at 121 px arrives and attacks inside the 2 s. Measured centre to centre, 120 px can also miss an XL creature whose body touches the hero.

Conditions for S:
1. One timer OR-ed into the existing `mercy` expression (same boss exclusion), evaluated per think for any creature within 120 px of the hero measured from its edge (`d - c.rad`), not a snapshot list.
2. Held creatures stand still (`c.vx = c.vy = 0`); do not let them wander or coast. Then no creature can reach the leash ring because of the breather.
3. Do not touch `c.ret`, `c.hx/hy`, HP; do not zero `c.angry`; pause its countdown while held (add `dt` back).
4. Cancel a wind-up in the ring (`c.ph = ''`, keep the cooldown), or change the test to "no new attack starts".
5. Test additions: a hostile parked 13.5 tiles from home is held, does not get `ret`, and attacks again after 2 s; a neutral one with 1 s of anger left attacks again; `cyc0-isles-leash.test.js` stays green untouched.

Design note for D: the bots that reached 2 to 7 HP shoot all the time. Two seconds without a heal may not change their outcome; measure it with the Isles first-ten bots before calling it done.

### ID-68 (first-level floor): tests that pin early XP numbers

Not built; found by grep and by reading the tests, none run with a floor.

- **Fails as written:** `world-easy-start.test.js` line 65 asserts `still.lv === 1` after standing 20 s at the Shore spawn with spawns running. If the hero's own shots get a kill after 15 s the floor makes it Lv 2. Needs `?lvfloor=0` on that URL (or the floor must need hero movement input).
- **Numbers move, gates still pass:** `first-ten-minutes.test.js` (firstLevel gate; it rewrites `design/ftue-metrics.json`). Seeds b (18.6 s) and e (29.7 s) level at the first kill after 15 s; the level-up heal and +8 max HP then shift later numbers in those two runs (level at 620 s, minHp, maxRewardGap; knownIssues entries "must not be worse"). Seeds a, c, d, f level before 15 s and should be unchanged: that is the control.
- **Reads the metrics file:** `tools/id64-build-sim.js` and `cyc14-design-id64-economy.test.js` print "first level-up 6.8-29.7 s" as a literal; the pinned checks (240 XP, about 45 kills, about 105 shards) do not depend on it, but the printed line becomes stale.
- **Move only if the floor is put in `realm.js` instead of the World (Shore, zone 0):** `realm-progress.test.js` (a Whirler is 7 XP at wave 1; 32 XP = Lv 2 with 2 left), `realm-boss.test.js` (wanderer XP), `realm-wire.test.js`, `cyc2-shore-fade.test.js`, `cyc5-lead-notices.test.js`. Condition: gate it in `realm-world.js` on zone 0 and the World play clock.
- **Move only if the `zk` mask is used:** `cyc3-first-kill-zk.test.js`, `cyc4-zk-stale-tab.test.js`, `save-merge-fuzz.test.js`. U's rule (the hero's own level records it, no key, no mask) avoids all three.
- **Checked, not affected:** `ftue-ft2.test.js` (exploration XP deltas under 15 s), `cyc10-s-first-end`, `cyc11-d-first-end` (levels set by hand), the passive / idle-rest tests (no level or XP checks).

**A spec fault to settle before S builds.** D's and U's test line says XP totals at Lv 2+ (or Lv 5+) are byte-identical with and without the floor. They cannot be: the floor gives up to 29 extra XP, so every later level comes that much sooner. What can be pinned: the XP needed per level is unchanged, the gift is at most `rmXpNeeded(1) - 1`, it is given once, and a run that levels before 15 s is byte-identical.

## Item 3: cull, 55 settled labels: NOT done (not safe as stated)

Probe (my own script, 1280x720, offline, 978 objects, measured 195 then 192, 182 sprites): 56 world Text objects were settled. In the next 15 s **6 of them moved**: the five villager names (Buster, Lily, Spike, Frosty, Mocha) and the player's name. A label is "settled" whenever its owner stands still, so "settled" is not "fixed". Declared `_cfix`, a villager's name would be read again only every 64 passes (about 4 s) after the villager starts walking.

The other 50 are landmark names, sign texts and emoji decor (flowers, shells, pumpkins, stars) made at about 35 separate creation sites with no shared helper; several are pooled or respawning. I could not check each site inside the time box, and the gain is about 5 measures per pass against a window of 192-195 under 215. Nothing changed; the cull-pin test and all thresholds are untouched.

## Unresolved
- The reload and tab-close cases above; the two-tab whole-key overwrite for fishlog / home / weeds / birthdays.
- The guard test does not see a pay-once key read through a local variable.
- 195x422 not run for the new notes (they use the existing `stallNote` toast). Full stamp not run (coordinator).
- Item 3 as above.

## Proposals
- Cull: add one `fixedLabel()` helper for landmark and sign texts, move the roughly 30 landmark sites to it and declare `_cfix` there; leave names and pooled emoji alone. Worth about 3 to 4 measures per pass. The sprite floor against the cap still needs the owner's decision.
- ID-68 and ID-70: S builds with the conditions above; D corrects the "byte-identical totals" line first.
- New claim paths: add the key to `PAY_ONCE_KEYS` and read it with `payOnceRecord()`; the guard test then covers it.
