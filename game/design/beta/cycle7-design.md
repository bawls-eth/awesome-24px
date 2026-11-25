# Cycle 7, D Gameplay Designer

Branch `cyc7-design` (cut from the cycle 6 tip), own server port 9704, browser runs through `/tmp/bt.sh`, DB blocked (blockDb, `db.attempts() === 0`), no chat, no writes. Nothing pushed.

## 1. ID-14 hit pause 15 -> 12 percent (done)
- Change: `game/realm.js` `RM_HIT_PAUSE_FRAC` 0.15 -> 0.12 (one constant; reduce-motion and `?hitpause=0` paths untouched).
- Tests: `cyc3-hit-pause.test.js` text updated to 12 and two boundary checks added (11 percent pauses nothing, 13 percent pauses exactly 2 frames). Mutation check run: with the constant back at 0.15 the 13 percent check FAILS (`{"d":20,"p":0}`), with 0.12 all 11 checks pass. `cyc5-hit-pause-play.test.js` (the gameplay-level test, real boss bolts, untouched rAF loop) updated to 12 percent: all 8 checks PASS, including reduce motion = no pause.
- Honest finding: the cyc5 info line shows a level-matched Lv 16 hero in zone 3 (max HP 220) takes 17 damage per bolt = 7.7 percent, not 12.3 percent, so even 12 percent does not fire for that hero in that zone. The pause fires for under-levelled heroes (Lv 1: boss bolts well above 12 percent) and for bigger hits (contact, bursts). If the owner wants it felt at level-matched play, the next number is 7 percent. NOT changed (decision stays 12).
- Not run: the full suite (coordinator), a human feel check.

## 2. Specs ID-09 and ID-18 (done, text only)
Both are `approved` in `game/design/IDEAS.md` (section "ID-09 / ID-18 implementation specs (D, cycle 7)"): files, exact save keys, Backup (`TOWN_FIELDS`) and SAVE-KEYS lines, UI text rules, node and browser test criteria. Key design facts S needs: the current "Day N streak" DID reset to 1 after a missed day, so ID-09 is a real behaviour change (new additive `visitDays` / `lastVisitDate` / `sellDays` / `lastSellDay`, new pure `MMGameDay.visitStep`, `streakStep` stays untouched because `cyc3-gameday-streak` pins it); ID-18 shows as a section in the existing Dailies panel (not a new HUD block), uses a new `TOWN_POOL` (the old pool is Realm-only) with star rewards 10-30, one `bounty` save key, UTC day key. Nothing was built or run for these (specs only).

## 3. Town economy sim (done)
`game/tools/town-economy-sim.js` (pure node; reads constants from main.js by text, real turnip formulas over 360 real days) and guard test `game/tests/cyc7-d-town-economy.test.js` (node, smoke tier, 9 checks, mutation checked: DAILY_BONUS 5 and bundle cap 20 make 3 checks fail).
Results: turnip buy mean 110 (90-130) per bundle of 10, sell mean 84.9 per bundle, spike windows 14.8 percent (nominal 15). Blind trading (buy and sell at noon) -26.8 per bundle (-54 per day at the cap of 2). Buy at the daily low and sell at once: -12.9 per bundle. Patient (daily low, best of 96 windows): +99.7 per bundle, about 200 stars per day = 6.3 min of gathering, no risk and no spoilage (holding is free). Fixed daily income (login 5, quest ~12, chores 40, birthday, home <= 6, sell 5) is about 69 stars = 2.1 min of gathering at 33 stars/min. Sinks are tiny: merchant look 15 stars (27 s of gathering), gift boxes 20 (36 s), polyroll dice and coin are zero-EV (verified in code).
Verdict: no value is clearly off, so NO data change. Two honest observations for the coordinator: (1) stars have almost no sinks beyond turnips (income 33/min vs prices 15-20), so they act as a score, not a currency; a real star sink (cosmetics, decor) would be a design addition, not a retune; (2) a patient turnip player earns about 3x a casual 5-minute gatherer's daily extra for 30 seconds of play; bounded by the cap of 2 bundles per day and pinned by the new test. Not simulated: fishing, villager gifts, Realm shard economy (cycle 3 covered shards).

## Unresolved / proposals
- ID-14: level-matched hits are 7.7 percent; propose 7 percent if the pause should be felt in normal play (owner/coordinator call).
- ID-09/ID-18 and ID-51 are queued for S; the economy test must be re-run after ID-18 (+60 stars/day).
- Scratch: the port-9704 static server was killed; no screenshots were taken (no visible UI changed).
