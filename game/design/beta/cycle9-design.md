# Cycle 9 - D Gameplay Designer (branch cyc9-design, port 9904)

All browser runs through /tmp/bt.sh, Firebase blocked (offlineStub / blockDb, every WebSocket closed), literal `db.attempts() === 0` asserted. Load factor was 2.7-4.9x during the runs.

## 1. Realm shop purchase flow, end to end (owner: "buying still did not work")
New test `game/tests/cyc9-design-shop-flow.test.js` (registered, tier full). Every step is a real click or tap (HUD backpack button, then the backpack "Shop (V)" button, then Buy); no `buy()` hook. Three routes: A world Realm page entered as the Town button does (real hero pick) at 1280x720 mouse; C the same at 390x844 touch; B the real Town (Play offline, gate menu, Quick arena) at 1280x720.
Result: ALL PASSED on all three routes. Numbers (same on A, B, C):
- Start 100 shards, 0 items, level 1 / best wave 0: the shop lists 7 Common offers.
- First buy "Buy Common Spark Wand for 24 shards": shards 100 -> 76 (paid exactly 24), backpack 0 -> 1, item sparkwand:0 saved in pixeltown-save-v1, panel line "Bought Common Spark Wand: it is in your backpack (1 / 24)."
- 4 purchases from 100 shards (all affordable ones landed), 4 shards left, 4 items. A fifth tap says how many more shards are needed, spends nothing.
- After a page reload the saved shards and items are unchanged (A, C).
- No page errors. Screenshots: `game/design/beta/img/cyc9-design-shop-desktop.jpg`, `-phone.jpg`, `-town.jpg`.
Conclusion: the purchase code path works from the current tip; no fix was needed and none was made. This test passes on the baseline, so it cannot "fail before"; it is a regression guard for the whole route (cyc6-shop covers layout and refusal text).
What I could not reproduce: a failing buy with enough shards. Remaining likely causes for the owner: (a) too few shards at the start (cheapest offer 24 shards = about 34 Shore kills = about 1.2-2 min at the first-ten bot's 17-29 kills per minute, ftue-metrics 169-288 kills in 10 min), (b) a cached old page or CSS (Town loads `realm-ui.css?v=20261125a`; the standalone Realm page links `realm-ui.css` with no version, so a stale cache there keeps the pre-cyc6 look until a hard reload; not changed, shared file), (c) the shop is closed in a PvP duel by design. I did not test on a real phone or with the owner's save. Proposal ID-56 (saving-for pin) addresses (a).
Test-authoring notes: Playwright treats `aria-disabled` as not enabled, so the unaffordable tap uses `force: true` (a real finger would land); the gate menu must be opened with `openRealmGateMenu()` (removing `hidden` by hand left the menu covering the HUD).

## 2. ID-18 / ID-09 follow-up numbers
New test `game/tests/cyc9-design-town-bounty-deviations.test.js` (registered, tier full), real Town offline, fixed clock via `page.clock`, UTC day faked with the same MMGameDay wrapper as cyc7-s-town-bounties. ALL PASSED.
- Town has 8 flower spots (mean nearest-flower distance 425 px, about 3 s at WALK_SPEED 140) and 5 villagers (mocha, frosty, buster, lily, spike). "Pick 3 flowers": real `interact()` next to 4 different flowers gives counter 1,2,3,3 (stops at the goal); pressing the just-picked flower again does not count. Confirmed: the deviation is fine; the Town has no watering action, so pick-flower stays.
- "Say hi to 2 neighbors" (`wave`): first hello to a neighbor 0 -> 1, same neighbor again stays 1, a second different neighbor 2/2. Confirmed.
- Finding: at 02:00 local the villagers are asleep and a hello leaves the counter at 0 (rule: asleep 23:00-05:59 local). Nothing is lost, but nothing says why. Proposal ID-58 (hint text). No code change.
- Minor, unchanged: `talkToVillager` keys its once-a-day record with `new Date().toISOString()` (UTC), the same day as the bounty key in practice, but not through `MMGameDay.utcKey` as the L-08 rule asks; no mismatch observed.
- ID-09: stored visitDays 7 / lastVisitDate 5 days old: now 8 (+1, no reset), badge "Days in town 8", title "Days you visited the village", no streak wording; same-day reload changes nothing. Confirmed.

## 3. New ideas (all `proposed`, generic web queries, sources in IDEAS.md "Cycle 9 additions")
ID-56 shop "saving for" pin (S), ID-57 bullet shape option (M), ID-58 sleeping-neighbors hint on the wave bounty (S).

## Unresolved
- Owner's exact shop failure not reproduced (see 1). Standalone Realm page CSS has no cache-bust version.
- Both new tests are measurements/guards: they pass on HEAD (no code was broken), so no "fails before" exists; stated honestly.
- Full suite not run (coordinator stamps). Only the two new tests were run, each once to a clean pass (after my own test-script fixes).
