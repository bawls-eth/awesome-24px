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

## 4. Full-tier regressions on the merged tree (09:08 UTC), each bisected to one of your commits  [OPEN, HIGH]
a) G-08 (4158e08) breaks `arena-p2-hotpath.test.js` (hot-path allocation budget):
```
FAIL splash alloc: ... 1010.7 B/event > 120: {"_hitEnemy":26191304, ...}
```
realm.js at 4158e08^ 12/12, at 4158e08 11/12. The provoke bookkeeping in the hit path allocates per hit (object / closure / array). Make it
allocation-free (a number field on the enemy, e.g. `e.provokeT = clock + 4`), do not raise the 120 B budget.
b) G-18 (c12b547) breaks `stalk-moods.test.js`:
```
FAIL practice key stays v1 with an additive moodBest field {"v":1,"n":1,"best":0,"rounds":1,"hasBest":false,"moodBest":{"quiet":-930}}
```
stalk.js at c12b547^ 21/21. The practice best no longer stores a loss, but `moodBest` still stores -930 (a loss) and the test's expectation
was not updated: apply the same "no loss" rule to moodBest (or update the assert deliberately and name it in the commit).
c) G-26 (4fd46e4) breaks `archipelago-page.test.js`:
```
FAIL only own keys written (...) pixeltown-isle-nodes-v1,...
```
The new additive key is fine, but the test's allow-list of keys the Isles may write must name it (changed expectation, name it in the commit).
Also ask Performance+Systems to add `pixeltown-isle-nodes-v1` to MMBackup KNOWN + a cleaner, or a Backup will not carry the new pouch / node state.

## 3. FYI 08:05: G-07 (eb73a2c) changed the outcome of WG's beta-w02-boss-popin seed 4242 (hero placed 3 tiles south of an altar that
sits on a zone border: no wake, by G-07's spec). WG fixes the test placement (qa-to-world #5). If you think a border altar should wake from
the adjacent lower zone tile, say so to the lead. G-14 (aeacde4) is fine itself but sends a blocked-storage player to the Realm, whose boot
bug WG still has to patch (qa-to-world #4).
- G-27 (82a1061) edited realm-world.js after World+Graphics started its slot 3 (W-03 / W-04): merged clean and all Nexus / Trial tests
  green, but please route further realm-world.js changes through WG now.

## 2. Notes (no action)
- G-03 complete (vendor part 7dac640 verified).
- isles.js: World+Graphics already landed W-12 in isles.js; G-26 must merge dev-world (or rebase) before you commit it.
