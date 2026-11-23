# Gameplay lane: retest notes (branch dev-gameplay)

Each entry: item id, commit, tests, how a tester re-verifies. Run any test alone with
`BASE=http://localhost:<port>/game/index.html /tmp/bt.sh node game/tests/<name>.test.js`.

## G-02 Combine button covers Equip (b02-01) - fixed in 21fd30e
- Tests: `beta-g02-combine.test.js` (390x844 and 1280x720).
- Retest: Realm, backpack with 3 copies of one item (same item + rarity + tier). Equip, Combine and Sell are three separate buttons
  (phone: Combine on its own row under Equip + Sell; desktop: Combine to the right of Sell). Equip equips, Combine combines.
- realm-ui.css slot 1 released to World+Graphics.

## G-01 Daily gift with no town save (b08-01) - fixed in a63daca
- Tests: `beta-g01-gift.test.js`; `hub-gift.test.js` changed ('no town save' case now seeds a corrupt save).
- Retest: fresh browser profile (no storage), Hub Home, Daily gift, Claim: "Gift claimed. N shards were added to your Realm purse.",
  button "Claimed today". Open the Town: the join card shows; join; the shards are in the Realm purse. With `pixeltown-save-v1` set to
  garbage: Claim says "Could not save the gift. Nothing was claimed." and the garbage is untouched.
- Known side effect (main.js, not mine): a gift-only save counts as "returning" for the What's-new banner on the first Town visit.

## G-03 Sell / Reforge guards (b02-02, b02-03, b02-12) - fixed in 5497b46; vendor part (b02-14) open
- Tests: `beta-g03-sell-guard.test.js`; changed: `realm-progress.test.js`, `item-icons.test.js`, `gear-forge-ui.test.js` (wait for the arm delay /
  confirm the equipped sell).
- Retest: double-click Sell on a junk row: exactly one item sold. Click Sell on the equipped weapon (or a soulbound T11+, a relic, the best
  tier in its slot): it turns into "Sure? Sell +N", a second click sells, waiting 3 s restores "Sell". Double-tap "Confirm" in the Forge
  reforge: the item is reforged once and no Salvage question opens.
- Open: Nexus vendor stall Buy double-tap and the "(equipped)" tag in Sell back are in realm-world.js (slot 2, after dev-perf).

## G-04 Full backpack never auto-sells an upgrade (b02-04, b02-05) - fixed in 3a7173e
- Tests: `beta-g04-full-pack.test.js`; changed: `gear-save-fixes-2.test.js` F11 (sells a non-upgrade T10 now).
- Retest: fill the backpack (24), walk over a tiered bag above your best tier in that slot (or any T12 / relic): the banner says
  "Backpack full: make room for <name> T<n>", the bag stays on the ground and does not vanish while you stand by it. Sell one item and
  walk over it: it is in the pack with its tier. A junk drop with a full pack is still sold; the banner names it.
