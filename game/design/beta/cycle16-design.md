# Cycle 16 - D Gameplay Designer (branch `cyc16-design`, port 9104)

Two items, numbers and bot runs only. No game code, balance constant, test or save format was changed. Nothing here needed a browser screenshot (no UI change), so no `cyc16-design-*.jpg` was produced.

New files: `design/beta/tools/armor-shop-economy.js` (node, shared modules only) and `design/beta/tools/id70-bot-measure.js` (Playwright scratch tool, not a registered test).

## Item 1: tier-1 armour in the Realm shop

**What I could and could not check.** The shop change is not in this tip: `cyc16-systems` is still at `23b9d62` (the base) with nothing committed, and `shopStock()` in `game/realm.js` stocks only the 7 base items plus the family's styled weapons. So I did not run the shop itself. Everything below is computed from the real shared modules the shop would use (`MMGear`, `MMGearDrops`, `MMZones`, `RM_RARITIES`, `RM_SHOP_MULT = 8`, `RM_SHOP_UNLOCK = [0,2,5]` waves, `RM_SHOP_UNLOCK_LV = [1,4,8]` levels) by `node game/design/beta/tools/armor-shop-economy.js` (5,000-kill-style sim, 40,000 kills per row, seeded). The 70/20/10 enemy tier mix is the same assumption `economy-sim.js` already uses. No Realm bot was driven through the real shop.

**Prices (sell value x 8):** Common 24, Uncommon 56, Rare 120 shards. The shop price ignores the tier's `sellAdd`; selling the piece back pays `MMGear.sellValue` (T1: 5 / 9 / 17), so there is no buy-sell loop.

**Income and drops (zone = world zone, mob kills only):**

| | zone 0 (Shore) | zone 1 |
|---|---|---|
| shards per kill | 0.667 | 1.693 |
| kills to afford Common / Uncommon / Rare armour (24 / 56 / 120) | 36 / 84 / 180 | 14 / 33 / 71 |
| own-family T1 armour dropped per kill | 0.0088 (one per ~113 kills) | 0 (T1 does not drop past zone 0) |
| rarity of those T1 drops (353 samples) | 87% Common, 12% Uncommon, 1% Rare | none |
| own-family band-2 armour (T3/T4) per kill | 0.0019 | 0.0185 (one per ~54 kills) |

(Ranger/light, warlock/robe and paladin/heavy gave the same drop rates; the drop pool does not depend on family.)

**Stats at tier 1** (HP / guard / speed): Common light 5/1/+2, robe 5/1/0, heavy 6/1/0; Rare light 6/2/+2, robe 6/1/0, heavy 8/2/0. For comparison a Common T3 piece (free drop in zone 1) is light 12/2/+4, robe 11/1/0, heavy 14/2/0, and a Rare Hearty Charm (120 shards) gives +29 max HP.

**Verdict**
- **Common T1 at 24: fine, keep.** It is the first armour a fresh hero can own, it takes about 36 Shore kills against about 113 for a drop, it sits in its own slot (adds on top of the charm), and it is equippable at level 1 (gate 1).
- **Uncommon T1 at 56: marginal.** 84 kills at the Shore, about the same wait as a drop; it unlocks at level 4 / wave 2, when T3 gear (gate 4) already starts to drop.
- **Rare T1 at 120: a trap, change it.** It unlocks at level 8 / wave 5, in zone 1 or later, where T1 no longer drops and a free Common T3 piece (12-16 HP, guard 2) comes about every 54 kills. A Rare T1 piece (6-8 HP) costs 71 zone-1 kills and is worse than that free drop, and gives about a quarter of the HP of a Rare charm at the same price.
- **Recommendation (needs an S build and a test, not done here):** keep the same price rule but let the shop armour tier follow the rarity unlock, because the unlock levels already line up with the tier gates: Common -> tier 1 (gate 1, level 1), Uncommon -> tier 3 (gate 4, unlock level 4), Rare -> tier 5 (gate 8, unlock level 8). Stats at those: T3 Uncommon light 13/2/+4, robe 12/1, heavy 16/2; T5 Rare light 26/3/+6, robe 23/2, heavy 30/4/-2 speed. T5 Rare at 120 (71 kills in zone 1) is then about on par with the Rare charm (29 HP) and does not undercut dropped T5-T6 gear (zone 1-2 drops). Caveat to check before building: a wave-unlocked shop (best wave 2 or 5 with a low-level hero) would sell a piece the hero cannot yet equip (`canEquip` level gate); the listed `RM_SHOP_UNLOCK_LV` rule only protects world mode. Simplest fix: gate the Uncommon/Rare armour rows on `level >= gate` as well as on the rarity unlock. If S keeps tier 1 for every rarity, at least hide the Rare T1 row.
- Still unmeasured: the real shop row layout at 195x422 with three more rows, and whether the "saving for" pin (`mm-shop-pin`) handles an armour id. Both belong to U/S when the build lands.

## Item 2: ID-70 (Isles low-HP breather) bot measurement

**Method (real runs, not estimated).** The existing isles first-ten bot (`tests/isles-first-ten.test.js`, 600 s simulated per run, fresh profile, 390x844, real page code stepped through `window.__isles.step`) was copied into `tools/id70-bot-measure.js` with a PROTOTYPE of ID-70 injected into a served copy of `isles.js` (the repo file is untouched), built to Lead's conditions: hold timer OR-ed in front of `mercy` with the same boss exclusion; each think, any hostile or angry creature within 120 px measured from its edge (`d - c.rad`) stands still (`vx = vy = 0`), its anger countdown is paused, `c.ret`, `hx/hy` and HP are untouched; a wind-up already in progress is NOT cancelled; fires once per page load the first time `hp < 20%` of max with a hostile in the ring, 2 s; never while a boss is engaged. No "Catch your breath" line (that is S's UI work). Baseline = same file with the counters only.

**Baseline (current code), 200 runs = 5 isles x seeds 1-40:** a death in 17 runs (8.5%, 21 deaths); the bot reached 3 HP or less in 35 runs. By isle: home 0 runs with deaths, jungle 6/40, tundra 10/40 (25%), reef 3/40, mars 2/40. 0 console errors. Leash returns (a creature walking back home): 4,171 in 200 runs (about 21 per run), so leashing is routine.

**Armed vs baseline, same seeds, tundra/jungle/mars/reef x seeds 1-15 = 60 runs each arm:**

| | baseline | breather |
|---|---|---|
| runs with a death / total deaths | 6 / 9 | 7 / 11 |
| runs that dropped to 4 HP or less | 20 | 20 |
| mean lowest HP | 7.60 | 7.58 |
| breather fired | - | 19 of 60 runs |
| damage taken during a 2 s hold | - | 0 |
| tames, runs with a reward gap over 45 s | 106, 1 | 106, 1 |
| console errors | 0 | 0 |

For the 19 runs where it fired I re-ran both arms and compared the same time windows (the two arms are identical until the trigger):

| | breather | baseline same window |
|---|---|---|
| leash returns during the 2 s hold | 9 | 10 |
| leash returns in the next 10 s | 10 | 11 |
| hits on the hero during the hold | 1 | 2 |
| hits on the hero in the next 10 s | 6 | 7 |
| deaths in those 19 runs | 9 | 7 |

**Reading.**
1. **Leash: safe.** Holding creatures still adds no leash returns (9 against 10 in the hold window, 10 against 11 after). The Risk-1 coasting case does not appear because held creatures do not move. I did not construct the exact "hostile parked 13.5 tiles from home" case as a registered test (that is S's test addition); a quick scratch probe of that case was noisy (the hero died to an attack already in wind-up in 2 of 4 setups) and is not reported as a result. `cyc0-isles-leash.test.js` itself was not run against the prototype: it uses god mode and full HP, so the breather can never fire in it and a green run would say nothing. S must run it on the real build.
2. **Effect on outcome: none measurable.** Lowest HP and the share of runs that reach 4 HP or less are the same; the 2 s hold removed only 1 hit in the hold (one wind-up landed, as Lead's Risk 3 predicts) and the death count did not fall (baseline 9, breather 11 over all 60 runs; baseline 7, breather 9 in the 19 fired runs; a difference of two inside run-to-run noise as the two arms diverge once creature RNG use changes). The bot does not retreat or heal during the hold; it resumes the same fight after 2 s, so a no-heal hold only delays the next hit. Baseline mercy (hp at most 1/3 and not shooting for 1 s) already covers a hero who stops shooting.
3. **What it does not show.** The bot is not a human: a player who uses the 2 s to walk to a dock or campfire would benefit and the bot would not use it unless taught to. The sample is 19 firings; a 2 s hold is too short for a significant bot-level change in deaths either way.
4. **Verdict.** Safe for the leash but no measured benefit for a shooting bot, so there is no data case to build it as a survival fix. If the owner wants it anyway as a comfort line, keep the conditions above (hold still, no new attack starts, pause anger). I recommend S does not build ID-70 before ID-64 and keeps it `proposed` pending a human-play signal; a cheaper change with the same intent would be to let the hint chip say "Rest at a dock or campfire" when hp is under 20%, which costs no balance and uses a path the bot-in-the-loop already showed it follows (its rest logic triggers at 25%).

## Unresolved / for others
- The shop build (S) is not on this tip; item 1 numbers need a re-check against the real `shopStock()` once it lands (tier written on the bought item, wave-vs-level gate).
- ID-70 prototype was never run in a headless-visible browser pass at 1280x720; the bot runs use 390x844 as in the existing gate. No screenshots exist for this item.
- Own-family T2 armour drops in zone 0 are not counted in the drop table (only exact T1).
