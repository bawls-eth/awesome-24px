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

## G-03 Sell / Reforge / vendor guards (b02-02, b02-03, b02-12, b02-14) - fixed in 5497b46 (backpack) + 7dac640 (Nexus stall)
- Tests: `beta-g03-sell-guard.test.js`; changed: `realm-progress.test.js`, `item-icons.test.js`, `gear-forge-ui.test.js` (wait for the arm delay /
  confirm the equipped sell).
- Retest: double-click Sell on a junk row: exactly one item sold. Click Sell on the equipped weapon (or a soulbound T11+, a relic, the best
  tier in its slot): it turns into "Sure? Sell +N", a second click sells, waiting 3 s restores "Sell". Double-tap "Confirm" in the Forge
  reforge: the item is reforged once and no Salvage question opens.
- Nexus stall: double-tap Buy buys once (300 ms arm delay after each stall re-render); Sell back shows "(equipped)" on the equipped piece.

## G-04 Full backpack never auto-sells an upgrade (b02-04, b02-05) - fixed in 3a7173e
- Tests: `beta-g04-full-pack.test.js`; changed: `gear-save-fixes-2.test.js` F11 (sells a non-upgrade T10 now).
- Retest: fill the backpack (24), walk over a tiered bag above your best tier in that slot (or any T12 / relic): the banner says
  "Backpack full: make room for <name> T<n>", the bag stays on the ground and does not vanish while you stand by it. Sell one item and
  walk over it: it is in the pack with its tier. A junk drop with a full pack is still sold; the banner names it.

## G-22 Companions vs the tame target; weary boss is safe (b05-03, b06-04) - fixed in b2f6bd8 + ff9dcc3
- Tests: `beta-g22-tame-safe.test.js` (page), `shared-mm-companion-tame-skip.test.js` (node). Golden / sim tests unchanged and green.
- Retest: Isles with two attack-mode companions: turn Soothe on and soothe a creature: no companion hits it and it can be knocked out.
  Turn Soothe off and hunt: companions fight as before. Fight the Fernjaw Tyrant to weary: toast "Hold fire and offer a feast (F)";
  for 8 s it cannot drop below 1 HP (auto-attack also leaves it alone); a feast starts the tame; after 8 s it can still be finished.
  A rematch boss at weary dies at once (unchanged).
- Note: ff9dcc3 narrows the skip to soothe mode (the first version regressed the isles first-ten gate, tundra-a 68 s; now 40.9 s again).

## G-05 Rekindle only from a fallen hero's Keepsake (b11-01, owner default O-05) - fixed in 6f12f65
- Tests: `shared-mm-profile-rekindle.test.js` (node), `beta-g05-rekindle.test.js` (page); changed: `shared-mm-profile-backup.test.js`,
  `lantern-page.test.js`, `lantern-polish.test.js`.
- Retest: Lantern: living hero cards have no Rekindle. Fall a hero (test=1 has a test Fall button): its Keepsake shows a row under the
  stash "Rekindle <name> (Lv N)"; one tap makes a new hero at min(10, L/2); the row then reads "Rekindled" (disabled). Hardcore /
  full roster rows are disabled with the reason.
- Save: additive `rk: true` and `md` on the Keepsake item; MMBackup keeps them (it cleans mm-v1 through MMProfile.clean).

## G-20 + G-21 Isles Stable: ride / party choice (b05-01, b05-02) - fixed in fde9340
- Tests: `beta-g20-isles-stable.test.js`.
- Retest: Isles, Pack > Party: every tame is a row with Join party / Rest and Ride (rideable). Ride the third tame, press R: you ride
  that one (its own saddle is needed). Rest one party member, Join another: the companions swap; reload keeps it. Join is disabled
  with a reason when the party is full (1 on ?perf=low). While riding, the buttons say "Get off your mount first".

## G-23 Enter does not open the Nexus mid Trial / boss fight (b03-01) - fixed in 0c9890c
- Tests: `beta-g23-trial-enter.test.js`; world-nexus, world-boss-rush, world-nexus-walk green.
- Retest: Lv 20+, Nexus > Trial of Six, fight beside the Nexus portal and hold Enter: you keep firing, the Nexus does not open,
  the button reads "Finish the fight first" (disabled). Leave the Trial: "Visit the Nexus" and Enter work again.

## P2 (no tester round needed, but each has a test)
| item | commit | test | re-verify |
|---|---|---|---|
| G-12 Esc / P close Town overlays; Nexus Esc board first | 05f4092 | beta-g12-esc-close | Town: open Journal / Map / Today / Achievements / Home / Polyroll, Esc closes; Museum or Postcards over Journal: one Esc closes one layer. Nexus quest board: Esc closes the board, Esc again leaves. |
| G-13 beach item wins over fish / wildlife | ea61cba | beta-g13-beach-first | Stand on a shell by the west pond: A picks the shell, no cast. No "E: log" label while reeling. |
| G-06 canon zone names; goal line in reach | 873ff28 | beta-g06-quest-zones | Quests say Midlands / Highlands (never Meadows / Deeps); a Lv 1 hero's goal line is the level goal. |
| G-07 altar wakes by zone | eb73a2c | beta-g07-altar-zone | Stand on a Shore tile near a Midlands altar: nothing wakes; step into the Midlands: it wakes ("above your level" note when under-levelled). |
| G-08 provoked off-screen shooters | 4158e08 | beta-g08-provoke | Shoot a Whirler beyond the view edge: it fires back / walks in for 4 s. |
| G-15 tutorial first minute | 350bd99 | beta-g15-tutorial-first-minute | Fresh Realm: no Raid / Swarm countdown while the coach runs; the bag step drops a bag nearby; a fall hides the coach card. |
| G-24 dungeon doors, Try again, biome banner | f90d13b | beta-g24-dungeon-doors | Walk into a door ~10 px off-centre: you slide in. Fall: banner "You fell in the Crypt"; summary "Try again (same seed)", R presses it. |
| G-25 ?floor= gate | 64ff5e4 | beta-g25-floor-gate | Fresh save, ?mode=dungeon&floor=3: floor 1 with a note. Clear floor 1 / 2 first and the stairs (or the URL) open the next. |
| G-16 Angler reel can end | cea143e | beta-g16-reel-lost | Hook a fish and never press: ~6 s after the meter empties, "It swam off. No harm done." |
| G-17 result card click guard; Stack Menu | e975f1c | beta-g17-result-guard | Pop / Echo / Stack / Dash: tap Play again right as the card opens: nothing; a moment later it works. Stack result has Menu. |
| G-10 Deepdelve placed blocks score nothing | 0c80e8b | beta-g10-placed-blocks | Place and mine the same coal 10 times in a dive: ores / combo stay 0. |
| G-26 Isles nodes / pouch persist; Craft; full pack | 4fd46e4 | beta-g26-isles-economy | Pick glints, reload: still picked. Feed (pouch -1), reload: still -1. Double-tap Craft: one item. Full pack + G: "Pack full", spot kept. |
| G-14 one first move; map start; pill "Home" | aeacde4 | beta-g14-one-first-move | Fresh browser: Hub PLAY, the Next line and the highlighted card all go to the guided Realm adventure. Map: the start square opens the Town. Town join card pill reads "Home". |

## P3
| item | commit | test |
|---|---|---|
| G-11 Stalk clock moved back | a864761 | beta-g11-stalk-clock |
| G-09 Survivor's cache needs effort | 91b1c1c | beta-g09-survivor-cache |
| G-18 b10-09 Jam tier lock / b04-09 Blacksmith line / b11-05 + b11-11 Stalk | 815763b, 19f381e, c12b547 | beta-g18-small-logic |

## Open / not done in this lane
- O-01 (arcade door rename): waits for the owner (not a safe default).
- G-18 remaining sub-items (Pop preview, Dash ghost per course, blur clears sticks, Lantern Start-run reason, hero level in HUD, Stats tab deltas,
  M / Tab map, Isles Back -> Town, mm-nav Back closes the Menu, Deepdelve craft labels, Jam stale HUD, second invite queue), G-19, G-27.
- Requests to Perf+Systems: add `pixeltown-deep-v1` (G-25) and `pixeltown-isle-nodes-v1` (G-26) to MMBackup KNOWN (plain-object cleaners).
  The Keepsake `rk` / `md` fields (G-05) need nothing: mm-v1 is cleaned by MMProfile.clean, which keeps them.
- For World+Graphics: the Bugs festival summary card now holds real pointer taps for its holdMs (G-17 kit default);
  realm-ui.css, index.html (pill done), isles.js (G-20/21/22/26 done) and lantern.js are released.
