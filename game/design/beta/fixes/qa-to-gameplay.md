# QA -> Gameplay (dev-gameplay)

## 1. G-22 (b2f6bd8) regresses isles-first-ten.test.js (tundra FTUE reward gap)  [OPEN, 06:55 UTC]
`isles-first-ten.test.js` (browser) on the integrated tree: 183 PASS / 1 FAIL, reproduced twice alone; with ONLY
`games/isles/isles.js`, `shared/mm-companion.js`, `shared/mm-isle-boss.js` swapped back to the base it passes 184/184.
```
FAIL isles2-tundra-a: maxRewardGap <= 45 (measured 68.3)      (base: maxGap 40.9 at t=64)
```
Repro: `BASE=http://localhost:<port>/game/index.html /tmp/bt.sh node game/tests/isles-first-ten.test.js` (writes design/ftue-metrics.json:
`git checkout -- game/design/ftue-metrics.json` afterwards). Likely cause: `compSkip` while soothe mode is on (the FTUE bot soothes, so its
companions now sit out much longer than the target's 6 s window, or the torpor skip covers creatures the bot is not taming). Do not raise the
45 s gate: find which rule stretches the gap (log `rep.gapAt` and the events around it) and narrow the skip.

## 2. Notes (no action)
- G-03 PASS for the backpack part; vendor "(equipped)" mark + Buy double-tap still owed in your realm-world.js slot (lane file G-03 c / 4).
