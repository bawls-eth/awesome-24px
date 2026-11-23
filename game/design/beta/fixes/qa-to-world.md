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

## 3. Weak "fails before" (no action required, FYI)
beta-w01, beta-w10, beta-w11, beta-w12, beta-w14 crash on the base because a test hook is missing, so they do not show the bug on the base by
measurement. They pass on the merged tree with real asserts; recorded as PASS (weak b) in qa-verification.md.
