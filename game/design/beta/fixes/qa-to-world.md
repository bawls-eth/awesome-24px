# QA -> World + Graphics (dev-world)

## 1. isles.js slot order  [WARNING, 07:18 UTC]
W-12 (063a677) edits `games/isles/isles.js` (slot 2) while Gameplay still owes G-26 in slot 1 (isles.js:1838-2149: glint timers, pouch,
craft guard). It merged clean today, but do not start W-17 / W-18 (how-to card, HUD, STRIPS preload) in isles.js until Gameplay says G-26 is
in and you have merged dev-gameplay. Same for realm-world.js: start W-03 / W-04 only from Gameplay's released tip (G-12 and G-03 vendor
edited the Nexus key handler and nxStallRender, right where W-04 works).

## 2. S-10 one-line patch still pending  [OPEN]
`beta-s10-storage-throws.test.js` prints `KNOWN-BUG [realm] ... mad-maze.js:577 AXM.prefs.load(localStorage) outside try`. The Realm page
still throws on boot when site data is blocked (b15-02). Exact patch is in assignments/world-graphics.md "Requests". Check:
`ONLY=realm BASE=... /tmp/bt.sh node game/tests/beta-s10-storage-throws.test.js` prints PASS.

## 4. G-14 makes the S-10 Realm boot bug reachable from Home: apply the mad-maze.js:577 patch now  [OPEN, 08:05 UTC, HIGH]
`beta-s10-storage-throws.test.js` on the merged tree: 46 PASS / 1 FAIL (twice alone):
```
FAIL [hub] primary button works with no new error primary action did not complete The operation is insecure.
```
With storage blocked a profile reads as fresh, so G-14 (aeacde4) points Home PLAY at the Realm, and the Realm page throws on boot at
mad-maze.js:577 (your pending S-10 one-liner, item 2 above). With hub/home.js + hub/hub.js from before G-14 the hub case passes 4/4.
The fix is yours (mad-maze.js), not G-14: apply the patch from assignments/world-graphics.md "Requests" and re-run
`ONLY=hub,realm BASE=... /tmp/bt.sh node game/tests/beta-s10-storage-throws.test.js` (both PASS, the realm KNOWN-BUG line gone).

## 5. G-07 breaks beta-w02-boss-popin.test.js seed 4242 (test placement, your test)  [OPEN, 08:05 UTC]
```
FAIL seed 4242: on "awakens" the first boss frame is the sprite (fallback 0) []
```
Bisected: realm-world.js at eb73a2c^ (before G-07) 14/14, at eb73a2c 13/14. The test puts the hero 3 tiles SOUTH of the altar
(`a.player.y = (s.y + 3.5) * 32`, lines 45 / 55); on seed 4242 that tile is in a lower zone than the altar, and G-07 (a boss wakes only for a
hero inside its zone, by design) never wakes it, so no frame is recorded. Ask: place the hero on a tile of the boss's own zone (e.g. search the
ring of tiles at 2-4 tiles from the altar for `zones.at(tile) >= site zone`) and keep every assert. Gameplay: FYI only (behaviour is G-07's spec).

## 6. W-03 (ee07c5d) comments out the artTiles / miniDraws test hooks: world-page.test.js crashes  [OPEN, 08:15 UTC, HIGH]
`world-page.test.js` (66/66 at 06:35) now stops after 5 PASS with `TypeError: w.artTiles is not a function` (world-page.test.js:27), on the
merged tree and on dev-world alone. In `games/mad-maze/realm-world.js` (dev-world line ~2433, the test-handle object) the new comment
sits in the middle of the line:
```
... bakeStats: () => ({ edge: ..., shade: Object.assign({}, shadeStat) }), // W-03 hooks artTiles: () => artTiles, miniDraws: () => miniDraws,
```
so `artTiles` and `miniDraws` are now inside the `//` comment. Fix: put `// W-03 hooks` at the end of the line (or on its own line) so both
properties are real again; re-run `world-page.test.js` (66 asserts) and `beta-w03-terrain.test.js`. Grep the same line for anything else the
comment swallowed.

### 6b (09:08). The same swallowed handles also crash world-fog, world-bosskey and world-sites (`w.miniDraws is not a function`).
One-line fix, four tests: world-page, world-fog, world-bosskey, world-sites.

## 7. W-16 (c68631c) breaks realm-polish3.test.js  [OPEN, 09:08 UTC]
```
FAIL desktop 1280x720 dungeon: the whole room shows as before (no dungeon view, no pan) {"w":753.2,"h":576,"dv":null,"cx":0,"cw":680}
```
mad-maze.css at c68631c^ 49/49, at the merged tip 48/49. The new desktop room band changes the dungeon canvas box that realm-polish3 pins.
Either keep the whole room visible with no pan at 1280x720 under the new band, or (if the new box is the intended design) update that assert
deliberately with the new numbers and name it in the commit.

## 3. Weak "fails before" (no action required, FYI)
beta-w01, beta-w10, beta-w11, beta-w12, beta-w14 crash on the base because a test hook is missing, so they do not show the bug on the base by
measurement. They pass on the merged tree with real asserts; recorded as PASS (weak b) in qa-verification.md.
