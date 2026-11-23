# QA -> Gameplay (dev-gameplay)

## 1. G-22 (b2f6bd8) regresses isles-first-ten.test.js (tundra FTUE reward gap)  [CLOSED 07:15 by ff9dcc3: 184/184 on the merged tree]
`isles-first-ten.test.js` (browser) on the integrated tree: 183 PASS / 1 FAIL, reproduced twice alone; with ONLY
`games/isles/isles.js`, `shared/mm-companion.js`, `shared/mm-isle-boss.js` swapped back to the base it passes 184/184.
```
FAIL isles2-tundra-a: maxRewardGap <= 45 (measured 68.3)      (base: maxGap 40.9 at t=64)
```
Repro: `BASE=http://localhost:<port>/game/index.html /tmp/bt.sh node game/tests/isles-first-ten.test.js` (writes design/ftue-metrics.json:
`git checkout -- game/design/ftue-metrics.json` afterwards). Likely cause: `compSkip` while soothe mode is on (the FTUE bot soothes, so its
companions now sit out much longer than the target's 6 s window, or the torpor skip covers creatures the bot is not taming). Do not raise the
45 s gate: find which rule stretches the gap (log `rep.gapAt` and the events around it) and narrow the skip.

## 3. FYI 08:05: G-07 (eb73a2c) changed the outcome of WG's beta-w02-boss-popin seed 4242 (hero placed 3 tiles south of an altar that
sits on a zone border: no wake, by G-07's spec). WG fixes the test placement (qa-to-world #5). If you think a border altar should wake from
the adjacent lower zone tile, say so to the lead. G-14 (aeacde4) is fine itself but sends a blocked-storage player to the Realm, whose boot
bug WG still has to patch (qa-to-world #4).
- G-27 (82a1061) edited realm-world.js after World+Graphics started its slot 3 (W-03 / W-04): merged clean and all Nexus / Trial tests
  green, but please route further realm-world.js changes through WG now.

## 2. Notes (no action)
- G-03 complete (vendor part 7dac640 verified).
- isles.js: World+Graphics already landed W-12 in isles.js; G-26 must merge dev-world (or rebase) before you commit it.
