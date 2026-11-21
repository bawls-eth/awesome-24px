# Research: tiered weapon and armor drops, splash damage, stats drop-down

Owner request: "Add weapons and armor drops from creatures, multi tier for end game; have research work on this; create a stats drop down, splash damage, etc."
Build plan: `GEAR-DROPS-BUILD-PLAN.md`. This file covers external findings, what the code has today, and the gaps.

## 1. Findings (external)

**F1. Tier ladders split into tiered and untiered lines (bullet-hell MMO reference).** The genre reference runs weapons T0-T13 and armor T0-T14 (T0 is starter gear), abilities T0-T6 and rings T0-T6. Tiered gear is a clean, stat-only upgrade ladder. Untiered and set items run beside it as sidegrades with a fixed special effect. Bag colour signals the best item inside: pink for low tiers (weapon/armor T1-6), purple for mid tiers (T7-9), cyan for high tiers from events and dungeon bosses, and a soulbound red-type bag for the top tier (T13 weapon, T14 armor, T6 ring).
*Takeaway:* use a 12-step ladder (enough room for endgame, small enough to balance by hand). Keep the 26 `wpn_` styles as the sidegrade line, so tier and style are separate axes. Map tier bands to the six bag colours that already exist.

**F2. Top-tier drops are soulbound and rolled per player.** In the reference game, the best bags are soulbound and show up only for players who dealt a minimum share of the damage. Lower bags are public. Per-player rolls remove loot fights and kill-stealing.
*Takeaway:* every tiered roll is per player, seeded by `(seed, enemy, playerId)`. `MMZones.rollDropForPlayers` already does this. Co-op shares nothing. T11-T12 get a soulbound flag (no stash or gift transfer).

**F3. Item level sets the roll range, and rarity sets the affix count (Diablo-like ARPGs).** Item power or item level is the range stats roll within, with breakpoints tied to player level. Rarity sets how many affixes an item gets (common 0-1, magic 1-2, rare 2-3+). Affixes come from a slot-specific pool. Diablo 2 adds an "affix level" that gates which affixes can appear. Newer seasons cut unique-item randomness so perfect drops are easier to get.
*Takeaway:* tier is the item level and sets each affix's roll range. Our existing rarity (`r` 0-3) is a quality multiplier. Affixes appear only from T7 up, come from a small pool per slot, and roll from a stored seed, so the result is reproducible and testable.

**F4. Smart loot is biased toward your class.** A high share of drops fit the player's class. We already do this: `MMWeaponItems.dropItem` gives 70% to the active family and 30% to any family.
*Takeaway:* keep 70/30 for weapons. Use 75/25 for armor, matched to the hero's armor family (light, robe or heavy).

**F5. Bad-luck mitigation works best as a visible counter.** The common forms are hard pity (a guarantee after N tries), soft pity (odds rise after a threshold), and punch-card counters per character that leave the base odds alone. Diablo 3 had a legendary pity timer of about 2 hours of play. Players read a pity system as fair when it is visible and cannot be bought. Gacha-style pity tied to paid pulls is the dark pattern to avoid.
*Takeaway:* use a per-hero "boss luck" counter shown in the stats panel. Soft pity is +1% per boss kill without T11+, capped at +20%. Hard pity guarantees T11 at 40 godlands boss kills. No currency, no purchase, no timers, no streak-loss messaging.

**F6. Splash damage design.** Common shapes:
- a full-damage inner radius, then falloff to a minimum at the edge (Warframe uses a two-distance band);
- a hidden "max damage radius" separate from the radius mods change (Deep Rock Galactic);
- quadratic falloff with a full-damage cutoff.

Splash usually does 20-50% of the hit (Path of Exile's splash support is "50% less to surrounding targets"). Splash also hits targets that are hard to hit directly, which is the known exploit.
*Takeaway:* splash = `frac` (0.35-0.6) x direct damage. Use a linear falloff from an inner radius (35% of r) down to `edge` (50%). Cap max targets at 3-6. Splash never re-splashes and never chains. The primary target is excluded from splash. Count splash in the weapon index, so styles with splash get less per-bolt damage (they stay sidegrades).

**F7. Compare UIs.** Most games show green/red deltas against the equipped item. Known problems:
- red and green alone fail for colour-blind players, so add arrows or a sign;
- rings and amulets often have no comparable number, so give them a summary line;
- players want a toggle and only the stats that matter to them.

*Takeaway:* use a Total / Base / Gear table, a delta column with an arrow, sign and colour, only rows that change, a 44 px tap target, and collapsed-by-default `<details>` that remembers its state per viewer.

**F8. Power curves.** ARPG endgames keep each tier step small. In the reference game a tier step adds roughly 5-8% damage. Most growth comes from build rather than from raw tier, so old gear stays usable for a while.
*Takeaway:* the weapon bonus rises about 0.15 per tier (T1 +0.70 to T12 +2.55 flat damage on a base of 1). T12 epic is +63% over today's best (Epic Spark Wand). Armor adds HP (+80 at T12) and guard 1-7.

## 2. Inventory: what exists in the code today

| Area | Where | State |
|---|---|---|
| Live item list | `realm.js` `RM_ITEMS` (7 classic: sparkwand, quickwand, heartcharm, swiftcharm, luckring, scholarring, wardring) + 26 `wpn_<style>` registered from `MMWeaponItems` | Slots are `RM_SLOTS = ['weapon','charm','ring']` only. **There is no armor slot.** |
| Rarity | `RM_RARITIES` common/uncommon/rare/epic, mult 1/1.6/2.4/3.6, sell 3/7/15/30 | Epic comes only from combining 3 Rares (`RM_COMBINE_COUNT`). |
| Save shape | `pixeltown-save-v1.realm.items = [{n,id,r}]`, `eq {weapon,charm,ring}`, cap 24 | `rmCleanSave` rebuilds every item as exactly `{n,id,r}` and **drops unknown ids** unless they match `RM_WPN_ID = /^wpn_[a-z_]{3,24}$/` (kept as inert). Extra fields and extra realm keys are stripped. `rmMergeSave` matches items on `(n,id,r)`. |
| Stats pipeline | `_calcStats` (realm.js ~579): base + level HP (+8/level, 100 at L1, max L20) + flat item stat (`amount x mult`) -> class profile mults -> unlock passives -> world `heroScale` (x1.6 dmg) -> buffs/status (dmg capped 0.5-1.6) -> `guard = _calcGuard()` | Guard comes from `MMStats.fromLegacy(save).GRD`, which is 0 for every live item. `_guarded`: `max(ceil(0.25 dmg), dmg - GRD)`; `armorBroken` sets guard to 0. |
| Design-only tiers | `shared/mm-items.js` (`MMItems`): T0-T8 class weapons, `makeArmor(family,t)` `armor_<light/robe/heavy>_t<n>` with `GRD 2t`, abilities T0-T4, charms, `bagColor`, `dropBag`, potions | **Not used at runtime** (no `MMItems.` call outside tests). Its BAG_ORDER (`...cyan, blue, gold, white`) differs from MMZones (`...cyan, white, gold`). |
| Quest armor | `mm-quests.js rewardBag`: pink -> `armor_<fam>_t2..3` r1, purple -> `wpn_` or `armor_<fam>_t4..5` r2 | `bagItems` is computed but **never granted**. Quest claim pays shards only. These ids would be dropped by `rmCleanSave` today. |
| Weapon styles | `mm-weapons.js`: 14 base + 26 alt styles, `resolve(cls, style, r)` normalised so every style's index is within [0.95, 1.10] of its class base. Fixed affixes per style by rarity (reach, velocity, pierce, keen, venom, extra, seek), affix cap 1/1.03/1.06/1.10 | `lob {radius, maxRange}` is the only AoE: Bloom Staff r40, Smite r48. **Full damage to all in radius**, host or solo only (`_lobLand`). Index weight `1 + min(0.4, r/100)`. |
| Style items | `mm-weapon-items.js`: 26 `wpn_<style>`, amount 0.45, 70/30 family drop, shop = sell x 8 (never Epic) | `_wpnDrop` converts a rolled classic weapon to `wpn_` with chance `min(0.85, 0.45 + 0.1 x bagTier)` in world/dungeon. |
| World drops | `mm-zones.js` TABLES: `DROP_CHANCE [.22,.28,.34,.40]`, `BAG_TIERS [brown,pink,purple,cyan,white,gold]`, `BAG_WEIGHTS`/`BOSS_BAG_WEIGHTS` by zone, `RARITY_WEIGHTS` (Epic only from godlands bosses at 12%), `BAG_ITEMS` 0-3 per bag, `rollDrop(info, seed)`, `rollDropForPlayers` (soulbound per player) | Bag items are always the 7 classic `ITEM_IDS`. `realm-world.js giveBag/rollFor` handles normal kills, bosses (`boss:true`), chests and events (`eventReward` floors the bag tier). |
| Enemy scaling | `ZONE_MUL.hp [1,1.8,3.2,5.5]`, `dmg [1,1.3,1.7,2.2]`, `TIER_MUL`, `ELITE x3 hp`, `BOSS x12 hp x1.4 dmg`, `MMDifficulty` knots/clamps, `RM_ENEMY_BULLET_DAMAGE 8` | A godlands bolt is about 8 x 2.2 x 1.3 = 23; a boss bolt about 32. A level-20 hero has 252 HP x the class mult. |
| Creatures and bosses | `mm-overworld.js CREATURE_TIERS` (3 behaviours x 4 zones), `BOSS_POOLS` z1: forest_warden, mire_queen, treant_elder, sand_titan; z2: bone_colossus, storm_harbinger, crystal_titan, hydra, frost_dragon, clockwork_golem; z3: dread_knight, inferno_wyrm, void_oracle, lich_king, shadow_hydra, void_maw; elite `giant_spider_queen` (z3) | Dungeon biomes are warren < bramble < meadow < crypt. The `dungeon.js` boss drops `dropBag(r2) + dropBag(rollRarity())`. |
| Status | `mm-status.js` 17 ids (slowed, weak, dazed, rooted, stunned, armorBroken, curse, bleed, sick, marked...). Tenacity window, boss immunities | No player resistance stat exists. |
| Hit path | `_updateBullets` -> `_boltHitIndex` (spatial hash) -> `_wpnHit` -> `_hitEnemy` (white float number, `_stm.taken` mult). Crit = x2 in `_wShot` and class fire | Crits are not coloured. Texts pool = 28. `fx_explosion_small` plays on whirler death only. |
| Stats UI | Backpack: one line `#realm-bp-stats` (`_statLine`). Hero panel: `MMHeroStats.panelRows` (Hero, Class stats, Abilities, Weapon, Passives, Status, Gear, Run) rendered by `mad-maze.js` ~339 | No breakdown, no compare, no armor row (`itemRows` lists weapon/charm/ring). |
| Co-op | Classic team `loot` event: id max 20 chars, **rarity clamped 0..2** (`realm-team.js:394`). World co-op `world-team.js shareKill` sends a bag per partner with its own owner id | Duels use fixed stats (no gear). |
| Art on hand | b07 weapons (28 ids: sword_*, axe_*, bow_hunter, staff_druid, staff_bone, wand_ember, orb_void, crossbow_bronze, dagger_*...), b08 armor (50: `armor_cuirass_*`, `armor_jerkin_*`, pauldrons, gauntlet, greaves, boots in iron/scout/warden/frost/ember/storm/mire/dread/paladin), b08 headgear 26, b09 accessories 25 / clothing 34 (`clothing_robe_*`), i01 class gear (robes: mage, cleric, warlock_cursed, druid_leaf_cloak, necromancer_bone; cuirass/jerkin/breastplate/fur), b15 bags incl. **bag_blue, bag_red, bag_soulbound_sparkle**, b18 `fx_explosion_small/big`, `fx_fire_burst`, b19 `ui_slot_armor`, `ui_frame_common..legendary`, `ui_stat_*`, b22 runes/gems | Item strips have no action/dir. They load through `MMArt.loadItems` and `def.art`. |

## 3. Gaps

1. **No armor in the live game**: no slot, no ids, no guard source. `MMItems.makeArmor` and quest armor ids are dead code, and a save holding `armor_*` loses it on load.
2. **No tier axis**: the only progression is rarity x 3-to-1 combine, topping out at Epic +1.8 dmg. Godlands creatures have 5.5x shore HP but drop the same 7 items.
3. **Save is closed**: `rmCleanSave` strips unknown fields and ids. New fields (`t`, `a`) and the `arm_` id family need tolerance shipped *before* any drop, or a stale tab erases them.
4. **No splash on direct hits**. Lob is all-or-nothing with no falloff, no target cap and no colour. Bosses have no ground AoE other than lob telegraphs.
5. **No crit, splash, status-chance or resistance stats** in `this.stats`, so nothing to show in a drop-down.
6. **Stats UI** is one line in the backpack plus a long list in the hero panel. There is no base vs gear view and no compare delta.
7. **Pity**: none. Godlands Epic has a 12% boss rate with no floor.
8. **Co-op loot paths** clamp rarity to 0..2 and the id length to 20. Tiered items must never travel on those paths; each client rolls its own.
9. **Bag colour vocabularies disagree** (MMItems vs MMZones). The plan standardises on MMZones `BAG_TIERS` plus `bag_red` for T12.

## Sources
- [RealmEye: items and tier counts](https://www.realmeye.com/wiki/items/1), [RealmEye: loot containers](https://www.realmeye.com/wiki/loot-containers/122), [RealmEye: equipment](https://realmeye.com/wiki/equipment), [TV Tropes: Color Coded Item Tiers](https://tvtropes.org/pmwiki/pmwiki.php/Main/ColorCodedItemTiers)
- [Icy Veins: D4 gear systems and itemization](https://www.icy-veins.com/d4/gear-systems-and-itemization-overview), [Project Diablo 2: Item Affixes](https://wiki.projectdiablo2.com/wiki/Item_Affixes), [Maxroll: D2 base items](https://maxroll.gg/d2/items/base-items), [Icy Veins: D4 cuts unique RNG](https://www.icy-veins.com/d4/news/diablo-4-finally-cuts-unique-item-rng-and-makes-perfect-drops-easier/)
- [Warframe wiki: Damage Falloff](https://wiki.warframe.com/w/Damage_Falloff), [Deep Rock Galactic wiki: Radial damage](https://deeprockgalactic.wiki.gg/wiki/Radial_damage), [Giant Bomb: Splash Damage](https://giantbomb.com/splash-damage/92-347/), [Warframe forum: falloff math](https://forums.warframe.com/topic/1173434-damage-falloff-and-self-stagger-math-suggestion), [TV Tropes: Splash Damage Abuse](https://TVTropes.org/pmwiki/pmwiki.php/Main/SplashDamageAbuse)
- [OSRS wiki: Bad luck mitigation](https://oldschool.runescape.wiki/w/Bad_luck_mitigation), [GameDev.net: build a pity system](https://gamedev.net/news/3360-stop-bad-rng-build-a-pity-system/), [Diablo wiki: Legendary pity timer](https://diablowiki.net/Pity_timer), [SWTOR bad luck prevention](https://vulkk.com/2025/01/24/swtor-bad-luck-prevention-system-guide)
- [Windows Central: D4 compare tooltip](https://www.windowscentral.com/gaming/the-one-diablo-4-tip-i-wish-i-knew-before-i-started-playing), [Blizzard forum: compare toggle](https://us.forums.blizzard.com/en/d3/t/d4-toggle-onoff-option-for-displaying-itemisation-stats-changes-when-equipping-gear/18348?page=2), [No Rest for the Wicked forum: comparing stats](https://forum.norestforthewicked.com/t/better-way-to-compare-weapon-and-armor-stats/7763), [itch.io devlog: inventory UI](https://caprog.itch.io/emoji-battle-clicker/devlog/1029688/inventory-ui-improvements-equipment-quality-of-life-improvements)
