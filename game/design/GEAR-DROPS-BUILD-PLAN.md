# Build plan: tiered gear drops (T1-T12), armor, affixes, splash, stats drop-down

Research and inventory: `RESEARCH-GEAR-DROPS.md`. AGENTS.md rules apply: saves stay additive, no feature is removed, original art only, Codex pushes `codex/<topic>`, and `node game/tests/run-all.js` passes before every merge.

**Core idea.** Tier (`t`, 1-12) is a new axis next to rarity (`r` 0-3, now a quality multiplier) and style (`wpn_<style>`, the sidegrade line).
- Weapons reuse the existing ids (`sparkwand` and every `wpn_*`) and add a `t` field.
- Armor is new: 18 `arm_<family>_<band>` ids in a 4th slot, `armor`.
- Every item that exists today is T0 and works unchanged.

## (a) Tier ladder

### Table (`MMGear.TIERS`, frozen)
| T | Equip Lv | Weapon +dmg (Common) | Armor HP | Armor GRD | Resist % | Bag (MMZones index / art) | Affixes | Sell add |
|---|---|---|---|---|---|---|---|---|
| 1 | 1 | 0.70 | 6 | 1 | 0 | brown 0 | 0 | +2 |
| 2 | 2 | 0.85 | 10 | 1 | 0 | brown 0 | 0 | +4 |
| 3 | 4 | 1.00 | 14 | 2 | 5 | pink 1 | 0 | +6 |
| 4 | 6 | 1.15 | 18 | 2 | 5 | pink 1 | 0 | +8 |
| 5 | 8 | 1.30 | 24 | 3 | 10 | purple 2 | 0 | +10 |
| 6 | 10 | 1.45 | 30 | 3 | 10 | purple 2 | 0 | +12 |
| 7 | 12 | 1.60 | 36 | 4 | 15 | cyan 3 | 1 | +14 |
| 8 | 14 | 1.75 | 44 | 4 | 15 | cyan 3 | 1 | +16 |
| 9 | 16 | 1.90 | 52 | 5 | 20 | white 4 (`bag_blue` art) | 2 | +18 |
| 10 | 18 | 2.10 | 60 | 5 | 20 | white 4 (`bag_blue`) | 2 | +20 |
| 11 | 20 | 2.30 | 70 | 6 | 25 | gold 5, soulbound | 2 | +22 |
| 12 | 20 | 2.55 | 80 | 7 | 30 | gold 5 + `bag_red`, soulbound | 2 + 1 signature | +24 |

**Formulas**
- Quality: `Q = [1, 1.12, 1.25, 1.40]` scales the weapon bonus and armor HP. Rare and Epic also add +1 GRD.
- Weapon: `dmg += amount/0.5 × WD[t] × Q[r]`. A `wpn_*` item (amount 0.45) gets 90% of that, as today. T0 keeps `amount × RM_RARITIES[r].mult`.
- `quickwand` is never tiered, because stacking fire rate would break the 40-bolt budget.
- Reference points: T12 Epic Spark Wand gives 4.57 dmg per bolt, versus 2.8 for today's Epic (+63%). Old Epic is about T9 Common and old Rare about T5 Common, so existing gear stays useful into the midgame.

**Economy:** sell = `RM_RARITIES[r].sell + 2t`; the shop never stocks `t ≥ 1`; combine needs 3 of the same `id`, `r`, `t`, raises `r` only and keeps the survivor's `a`.

**Display:** badge colours T1-2 `#c9d1d9`, T3-4 `#7ee787`, T5-6 `#79c0ff`, T7-8 `#d2a8ff`, T9-10 `#ffb36b`, T11 `#ffd36b`, T12 `#ff6b6b`, always with the text "T7"; names keep rarity colour. **Soulbound** = `t ≥ 11` (derived, not stored): refused by the `mm-stash` vault, gifts and co-op payloads; sellable.

### Drop mapping (`MMGearDrops.TABLES`)
How each item in an MMZones bag becomes gear:
- It becomes tiered gear with chance `GEAR_CHANCE[bagTier] = [.30, .40, .50, .60, .70, .80]`. Otherwise it stays a classic item.
- Slot: weapon 50%, armor 50%.
- Weapon: 70% from the hero's family (the `sparkwand` class bolt or a family `wpn_` style, uniform), 30% any family.
- Armor: 75% from the hero's armor family, 25% any family.
- Quality `r` is the existing MMZones rarity roll.

| Source | Tier weights |
|---|---|
| mob z0 Shore | T1 .60, T2 .30, T3 .10 |
| mob z1 Midlands | T3 .35, T4 .35, T5 .20, T6 .10 |
| mob z2 Highlands | T5 .30, T6 .30, T7 .20, T8 .15, T9 .05 |
| mob z3 Godlands | T7 .35, T8 .35, T9 .20, T10 .10 |
| elite `giant_spider_queen` | T9 .50, T10 .40, T11 .10 |
| boss z1 (forest_warden, mire_queen, treant_elder, sand_titan) | T5 .40, T6 .40, T7 .20 |
| boss z2 (bone_colossus, storm_harbinger, crystal_titan, hydra, frost_dragon, clockwork_golem) | T8 .40, T9 .35, T10 .25 |
| boss z3 (dread_knight, inferno_wyrm, void_oracle, lich_king, shadow_hydra, void_maw) | T10 .60, T11 .35, T12 .05 (+ pity) |
| event | the region's mob window shifted +0/+1/+2 for participate/contribute/hero, capped at T11; region 3 hero also has 5% T12 |
| chest | the zone's mob window |
| dungeon mob | warren T2-3, bramble T3-5, meadow T5-7, crypt T7-9 (uniform) |
| dungeon boss | warren T4, bramble T6, meadow T8, crypt T9 .5 / T10 .4 / T11 .1 |

- Over-level drops show "Lv 16" and are never auto-sold. The bag shows `max(bag.tierIndex, BAND_BAG[t])`; T12 uses `bag_red` + `bag_soulbound_sparkle`.
- A T12 from a z3 boss carries a fixed signature affix: dread_knight `ward+`, inferno_wyrm `blast+`, void_oracle `venom+` (curse), lich_king `leech+`, shadow_hydra `pierce+`, void_maw `blast+`.

**Per-player rolls (co-op shares nothing):** seed `drop:<worldSeed>:<tag>:<kills>:p:<playerId>` (the `rollDropForPlayers` pattern); each world co-op client rolls its own seat locally; `shareKill` stays classic-only, so tiered gear never crosses BroadcastChannel or the `realm-team` `loot` event (which clamps `r` to 0..2).

### Pity (visible, free, no timers)
`realm.gp = {b, d}`:
- `b` = godlands boss kills since the last T12: +0.5% T12 weight each (cap +10%); at `b ≥ 60` the next drop is T12. `d` = crypt boss kills since the last T10+: at `d ≥ 15` the next is T10+. Reset only on success.
- Hero panel: "Boss luck: +7% (T12 guaranteed in 46 kills)". No currency, purchase or "so close" messaging.

### Ids and save (additive)
**Item entry** `{n, id, r, t?, a?}`:
- `t` is an integer 1-12; when it is absent the item is T0.
- `a` is a uint32 affix seed (1..2^32-1). It is kept only when `t ≥ 7`.

**Armor ids.** Band = ceil(t/2). Each id covers only its band's 2 tiers, and `clean` clamps `t` into that band.
- light: `arm_light_scout`, `arm_light_ranger`, `arm_light_warden`, `arm_light_storm`, `arm_light_shade`, `arm_light_dread`
- robe: `arm_robe_linen`, `arm_robe_mage`, `arm_robe_moon`, `arm_robe_druid`, `arm_robe_cursed`, `arm_robe_twilight`
- heavy: `arm_heavy_iron`, `arm_heavy_warden`, `arm_heavy_ember`, `arm_heavy_frost`, `arm_heavy_paladin`, `arm_heavy_dread`

**Compatibility:** unknown matches of `GEAR_ID_RE = /^arm_[a-z]{3,8}_[a-z]{3,10}$/` stay as inert items (like `wpn_`). Legacy `armor_<fam>_t<n>` (MMItems, quest `rewardBag`) aliases to `arm_<fam>_<band(n)>`, `t = max(1, n)`. New keys `eq.armor`, `realm.gv = 1`, `realm.gp` are validated in `rmCleanSave` (garbage → defaults); `rmMergeSave` matches on `(n, id, r, t, a)`; old saves load unchanged. A stale cached build strips `t`, `a`, `eq.armor` and `arm_` ids, so G7 ships one deploy before drops turn on (kill switch `?gear=0`).

### Pure module `game/shared/mm-gear.js` (UMD `MMGear`; no DOM, no Math.random; frozen output; hostile input returns null)
**Data:** `TIERS`, `Q`, `TIER_COLORS`, `FAMILIES`, `CLASS_ARMOR` (from `MMItems.CLASS_DEFS`), `ARMOR_IDS`, `ARMOR_ART`, `ARMOR_NAMES`, `GEAR_ID_RE`.

**Functions:** `tierOf`, `gate`, `band`, `bagFor`, `soulbound`, `armorId(fam, t)`, `alias(id)`, `clean(raw)`, `sellValue(r, t)`, `weaponBonus(amount, t, r)`, `armorStats(id, t, r)` → `{hp, guard, speed, res, statusChance}`, `canEquip(id, t, cls, level)` → `{ok, reason}`, `describe(item)` → `{name: 'T7 Seeker Wand', tierLabel, tierColor, soulbound, gate}`, `gearStats(items, eq, defs, cls)`.

**Node spec** `tests/shared-mm-gear.test.js`: columns monotonic, `gate(12) === 20`; `weaponBonus(0.5, 12, 3)` = 3.57 (1e-9), `t = 0` → null (caller keeps the old formula); 18 ids round-trip; `alias('armor_heavy_t4')` → `{id: 'arm_heavy_warden', t: 4}`, `alias('armor_robe_t0')` → `{id: 'arm_robe_linen', t: 1}`; `clean` drops `a` below T7, rejects `t: 13`, `'1e3'`, `__proto__`; `canEquip` refuses heavy on a ranger and T9 at level 15; inputs never mutated.

## (b) Armor system
Family modifiers apply to the tier row: HP × Q × famHP and GRD × famGRD, rounded, minimum 1.

| Family (classes) | HP | GRD | Speed px/s, bands 1-6 | Resists (status duration) | Extra |
|---|---|---|---|---|---|
| light (ranger, trickster, shadowpaw, rogue) | ×0.85 | ×0.75 | +2, +4, +6, +8, +10, +12 | slowed, rooted, dazed | none |
| robe (frostcaller, herald, gravetender, warlock, druid, necromancer) | ×0.75 | ×0.5 | 0 | curse, weak, sick | +1..+6% weapon status chance |
| heavy (punk, bruiser, paladin, berserker) | ×1.0 | ×1.0 | 0, 0, -2, -4, -4, -6 | bleed, armorBroken, slowed | none |

**Resist:** player status duration × `(1 - res)`, cap 40% incl. affixes, in `applyStatus` for the player only, never in duels.

**Guard:** `_calcGuard` adds armor GRD to the MMStats value; the 25% floor and `armorBroken` (guard 0) still apply. A godlands bolt of 23 vs heavy T10 Common does 18, vs light T10 (GRD 4) 19.

**Off-family armor** shows "🔒 Heavy: Punk, Bruiser, Paladin, Berserker" (the `_wpnHint` pattern).

`ARMOR_ART` (every icon already exists at 32 px):
- light: `armor_jerkin_scout`, `ranger_jerkin`, `armor_jerkin_warden`, `armor_jerkin_storm`, `rogue_leather_armor`, `armor_jerkin_dread`
- robe: `clothing_robe_linen`, `mage_robe`, `clothing_robe_moon`, `druid_leaf_cloak`, `warlock_cursed_robe`, `clothing_robe_twilight`
- heavy: `armor_cuirass_iron`, `armor_cuirass_warden`, `armor_cuirass_ember`, `armor_cuirass_frost`, `paladin_breastplate`, `armor_cuirass_dread`

## (c) Affixes (`game/shared/mm-gear-affix.js`, UMD `MMGearAffix`)

**Rules:** tier affixes are rolled (T7-8: 1, T9-11: 2, T12: 2 + boss signature); MMWeapons style affixes stay fixed. Seeded by `MMRng.create('gear-aff:' + id + ':' + t + ':' + a)` with `a` fixed at drop, so every device agrees. Rarity improves rolls, not count (r2 best of 2 draws, r3 best of 3). No duplicates, rerolls, currency or loot boxes.

| Affix | Slot | T7-8 | T9-10 | T11-12 | Notes |
|---|---|---|---|---|---|
| `keen` | weapon | crit +3-5% | +4-7% | +6-9% | crit cap 0.5 |
| `blast` | weapon | splash r +4-6 px | +6-9 | +8-12 | grants `{r 24, frac .30, max 3}` if the style has no splash |
| `venom` | weapon | status chance +4-6% | +6-9% | +8-12% | bleed 3 s if the style has no status |
| `swift` | weapon | rate +2-3% | +3-4% | +4-6% | bolt budget re-checked |
| `reach` | weapon | range +4-6% | +6-8% | +8-10% | none |
| `leech` | weapon | none | 1.5-2.5% of damage as HP | 2.5-3.5% | ≤ 3 HP/s; off in duels |
| `pierce` | weapon | none | +1 | +1 | pierce cap 3 |
| `vital` | armor | HP +4-6% | +6-9% | +8-12% | none |
| `ward` | armor | GRD +1 | +1 | +2 | none |
| `fleet` | armor | speed +4-6 px/s | +6-8 | +8-12 | none |
| `resist` | armor | all resist +5-8% | +8-12% | +10-15% | 40% cap |
| `mend` | armor | regen 0.5 HP/s | 0.8 | 1.2 | after 3 s without damage |

**Power cap.** The weapon affix product (crit × rate × splash weight × status V, using the `shapeIdx` weights) is capped at 1.06 for T7-8, 1.10 for T9-10 and 1.14 for T11-12. Values over the cap scale down pro rata, and the tooltip shows the capped values.

**API:** `roll(id, slot, t, r, a)` returns a frozen `[{id, v}]`; also `value(list)`, `cap(t)` and `describe(list)`.

**Node spec:** deterministic, in range, none below T7, cap holds over 5000 seeds per tier, r3 mean ≥ r0 mean, no duplicates.

## (d) Splash damage

**Schema:** optional style field `splash: {r, frac, inner: 0.35, edge: 0.5, max}`; `validate` r 0-80, frac 0-0.8, max int 0-6, never with `lob`; `norm` defaults `{r: 0}`; `rmWpnSpec` re-clamps.

**Falloff**
- `f(d) = d ≤ inner·r ? 1 : 1 - (1 - edge)·(d - inner·r)/(r - inner·r)`, where d is the distance between centres minus the enemy radius.
- Each of the nearest `max` enemies takes `hit × frac × f(d)`. `hit` already includes crit and status mods. The primary target is excluded.
- Pure kernel `game/shared/mm-splash.js`: `MMSplash.frac(d, s)` and `MMSplash.pick(xs, ys, rs, n, x, y, s, skip, out)`, which writes into a reusable `Int16Array` (no per-frame allocation).

**Interactions:** pierce/bounce bolts splash on the first hit only (`b.sp`); chain hops, orbiters and splash itself never splash; splashed enemies roll onHit at `chance × frac`; dungeon bosses take it via `hitBoss`; never players, partners, drifters, critters or camp NPCs; off in duels; in team play host/solo applies damage (like `_lobLand`), guests draw the ring.

**Index (keeps the DPS tests valid):** `shapeIdx` gains `if (sp.r > 0) v *= 1 + min(0.45, 0.25·frac·min(max, 1 + r/24))`. `resolve` normalises against the class base, so splash styles are sidegrades by construction and the `[.95, 1.10]`-of-base and ±30%-of-median checks in `shared-mm-weapons.test.js` hold unchanged. `class-weapon-sim.test.js` (0.7-1.4× ranger group clear) models splash.

**New styles.** Four are appended at the END of `ALT`, so existing `sidx` values and wire codes stay the same (wire limit: 128 styles).

| id | family | fields |
|---|---|---|
| `bow_blast` Blast Arrow | bow | arrow, spd 1, life .8, splash {36, .5, max 4}, dmg .85, rate .9, affix [reach, keen, venom] |
| `wand_burst` Ember Burst | wand | orb, spd .9, life .9, splash {44, .55, max 5}, dmg .8, rate .85, affix [reach, velocity, keen] |
| `staff_comet` Comet Staff | staff | orb, size 1.5, spd .75, life 1.1, splash {56, .6, max 6}, dmg .9, rate .6, affix [reach, keen, venom] |
| `pistol_flak` Flak Pistol | pistol | ray, count 2, spread .12, splash {28, .4, max 3}, dmg .5, affix [reach, keen, velocity] |

MMWeaponItems grows to 30 items. Tests that pin 26 move to an explicit id list (extended, not weakened).

**Performance:** ≤ 24 splash events per frame get FX/text (extras still deal damage); targets via the existing `_buildHash` cells r overlaps; ≤ 6 targets per event.

**Damage numbers:** normal `#ffffff`; crit `#ffe27a` 1.25× with "!"; splash `#ffb36b` 0.85×, one combined "2.4 ×3" per event, ≤ 6/s, skipped above 22 of 28 texts; resisted `#9aa4af`.

**FX:** code-drawn ring cached per 8 px bucket + colour (`MMFxDraw.makeCache` key `splash:<bucket>:<hex>`), 0.6r→r over 0.18 s; b18 `fx_explosion_small` (64 px) when r ≥ 40 and ≥ 4 of 16 `RM_FX_MAX` slots free; reduced motion: static 0.15 s ring, no shake.

**Boss splash (enemy):** telegraphed slam, red rim `#ff5a5a` (lob-telegraph style), 0.8 s warning (1.1 s picnic), r 56-80, `round(8 × dmgMul × 1.5)` via `_guarded`, edge 0.6, once per player/partner, ≤ 2 live per boss and 4 per world. Used by z2 bone_colossus, crystal_titan and clockwork_golem, all six z3 bosses, and the crypt dungeon boss in phase 3.

## (e) Stats drop-down UI

**Builders** (new, pure, never throw, in `mm-hero-stats.js`): `statTable(total, base)` → `{key, label, total, base, gear, unit}`; `compareRows(cur, cand)` → changed rows only, `{delta, dir, text: '▲ +0.3', aria: 'Damage up 0.3'}`; `fmtDelta(v, unit)`; `itemRows` gains `armor` + tier label.

**Rows:** HP, damage/bolt, rate, est. DPS (dmg × rate × count × (1 + crit)), speed, range, guard, crit, splash ("r 36 px, 50%"), status chance, resists (> 0 only), lifesteal, regen, shard/XP bonus. **Columns:** Total | Base | Gear, with `base = _calcStats({noGear: true})` and `gear = total - base`.

**Compare:** each backpack row has a "Compare" button (44×44 px, `aria-pressed`) that runs the pure `_calcStats({eqOverride: {slot: uid}})` and adds a Δ column: arrow + sign + colour (`#7ee787` up, `#ff7b72` down, grey same), never colour alone. Locked items compare too, with "Lv 16 needed".

**Layout:** `<details id="realm-bp-statsx">` whose summary (≥ 44 px) is the old `#realm-bp-stats` line, so existing tests pass; body is a `<table>` with `<th scope>`; below 420 px it becomes label + total with "base 2.1 · gear +1.3" at 12 px. Open state in `localStorage['mm-bp-stats-open']` (try/catch). Native `<details>` gives keyboard and screen-reader support; no animation under reduced motion. Rows carry a 16 px "T7" badge and 🔗 when soulbound.

**Hero panel**
- `panelRows` gains a "Gear stats" group (from `statTable` via `src.statsBase`) and a "Boss luck" row.

## (f) Slices G1-G16

**Serial resources (one slice each per sub-wave):** RJ `game/realm.js`, RW `games/mad-maze/realm-world.js`, DJ `games/mad-maze/dungeon.js`, MM `games/mad-maze/mad-maze.js`, IX `index.html` + css, RT `game/realm-team.js` (soft).

Kill switches are `?gear=0` and `?splash=0`, and every path works without its module.

### Wave 1: pure modules, node tests (parallel, disjoint files)
| # | Slice | Files | Size | Test | Acceptance |
|---|---|---|---|---|---|
| G1 | MMGear core | NEW `shared/mm-gear.js` | M | `shared-mm-gear.test.js` | The (a) spec. 18 armor ids, all with art ids that exist. `alias` covers every id `MMQuests.rewardBag` emits over 1000 seeds. |
| G2 | Drops and pity | NEW `shared/mm-gear-drops.js` (`rollGear(ctx, seed)`, `pityStep`, `TABLES`) | M | `shared-mm-gear-drops.test.js` | Rows sum to 1. Deterministic. Two player ids give different streams. T12 comes only from z3 bosses and r3 event hero. Over 100k z3 boss rolls: T12 is 5% ±0.3% at `gp` 0 and 100% at `b` 60. Family share is 70% ±2% for weapons and 75% ±2% for armor. |
| G3 | Affixes | NEW `shared/mm-gear-affix.js` | S | `shared-mm-gear-affix.test.js` | The (c) spec. |
| G4 | Splash data and styles | NEW `shared/mm-splash.js`; `shared/mm-weapons.js` (norm, validate, shapeIdx, describe "splash 36 px", 4 appended styles); `shared/mm-weapon-items.js`; update the 26→30 tests | M | `shared-mm-splash.test.js`, `shared-mm-weapons.test.js`, `shared-mm-weapon-items.test.js` | `frac(0) = 1`, `frac(r) = edge`, monotonic. `pick` respects `max`, skips the primary and stays allocation-free (heap delta < 64 KB over 1e5 calls). All 44 styles pass the existing balance checks. The first 26 `altIds()` are unchanged. |
| G5 | Stats builders | `shared/mm-hero-stats.js` | S | `shared-mm-hero-stats.test.js` (extended) | Survives hostile input, never outputs `<`, gives aria text for every delta, and `itemRows` has 4 slots. |

Wave 1 Playwright checks live in G7's `gear-save.test.js`: the 4 globals exist on `games/mad-maze/index.html`; `MMGear.describe({id: 'wpn_bow_triple', r: 2, t: 7}).name === 'T7 Triple Shot'`; `MMWeapons.altIds().length === 30`.

### Wave 2a
| # | Slice | Files | Size | Test | Playwright acceptance |
|---|---|---|---|---|---|
| G7 | Save tolerance and armor slot | RJ + IX: `rmCleanSave` keeps `t`/`a`/`gv`/`gp`/`eq.armor`, inert `arm_` defs, alias, merge identity, `RM_SLOTS` + `armor` (only with MMGear), `equip` checks `canEquip`; script tags in `games/mad-maze/index.html` and `game/index.html` | M | NEW `gear-save.test.js` | (1) An old save `{items: [{n: 1, id: 'sparkwand', r: 2}]}` loads with identical JSON. (2) `{n: 2, id: 'arm_heavy_iron', r: 0, t: 1}` survives a reload and equips on a bruiser (`eq.armor === 2`). (3) `armor_robe_t4` becomes `arm_robe_mage` t4. (4) `t: 99`, `a` on a T3 item and `__proto__` are stripped. (5) A two-tab merge keeps both T7 copies with different `a`. (6) `?gear=0` shows 3 slots. |

### Wave 2b (one RJ, one RW, one DJ in parallel)
| # | Slice | Files | Size | Test | Playwright acceptance |
|---|---|---|---|---|---|
| G8 | Stats pipeline | RJ: `_calcStats` (tier bonus, armor, affixes, `noGear`, `eqOverride`, new stat keys), `_calcGuard`, player resist in `applyStatus`, leech and regen ticks | M | NEW `gear-stats.test.js` | (1) T12 r3 sparkwand raises `stats.dmg` by 3.57 × class/world mults (±0.01). (2) Heavy T10: `_guarded(23) === 18`. (3) Light T6: `slowed` 2 s becomes 1.8 s. (4) `eqOverride` leaves `arena.save` byte-identical. (5) A duel's stats equal `RT_DUEL_*` with gear equipped. |
| G9 | World drops | RW: `giveBag` calls `rollGear` per item with ctx `{src, zone, eventTier, cls, fam, level, gp}`, covering boss, elite, event and chest; saves `gp`; recap shows "T9 Seeker Wand"; T12 bag art | M | NEW `gear-world-drops.test.js` | (1) `?dropall=1` z0 kills drop only `t ≤ 3`. (2) A z3 boss with `gp.b = 60` drops T12 and resets `b`. (3) The same seed gives the same items across reloads. (4) `?gear=0` gives classic ids only. (5) In the `world-party.html` fixture the partner gets 0 tiered items. |
| G10 | Dungeon drops | DJ: room and boss kills go through `rollGear` with `{src: 'dungeon'/'dboss', biome}`; `gp.d` | S | NEW `gear-dungeon-drops.test.js` | (1) A warren boss gear drop has `t === 4`. (2) A crypt boss at `gp.d = 15` gives `t ≥ 10`. (3) The classic arena never creates `t`. |

### Wave 2c
| # | Slice | Files | Size | Test | Playwright acceptance |
|---|---|---|---|---|---|
| G11 | Player splash | RJ: `MMSplash.pick` in the hit path, falloff, status roll, `b.sp`, number colours, cached ring, `fx_explosion_small`, caps | M | NEW `splash-arena.test.js` | (1) A `staff_comet` hit on a cluster of 5 test enemies damages up to 5 extra, with less damage further out. (2) Partners, drifters and the player take 0. (3) 30 events in one frame keep active texts ≤ 28 and stay within the `MMPerf` budget. (4) A pierce-3 bolt splashes once. (5) Reduced motion: no `fx_explosion_small`. |
| G12 | Boss splash | RW world slam + DJ crypt phase 3, using `MMTelegraph` | M | NEW `boss-splash.test.js` | (1) The warning is visible ≥ 0.8 s before damage. (2) A player outside the radius takes 0; inside takes `_guarded(round(8 × dmgMul × 1.5))`. (3) ≤ 2 live per boss. (4) Shore bosses never slam. |

### Wave 3: UI, polish, balance
| # | Slice | Files | Size | Test | Playwright acceptance |
|---|---|---|---|---|---|
| G13 | Backpack drop-down and compare | RJ `renderBackpack`, IX `realm-ui.css` | M | NEW `gear-stats-ui.test.js` | (1) The summary is ≥ 44 px tall and toggles `open`. (2) Total/Base/Gear headers and a "Guard" row are present. (3) Compare on a T9 weapon shows "▲" with an aria-label containing "Damage up". (4) At 375 px, `scrollWidth ≤ clientWidth`. (5) The "T9" badge text is present and the armor slot shows art or emoji. (6) A locked item shows "Lv 16". |
| G14 | Hero panel gear stats | MM `mad-maze.js` passes `statsBase` and `gp` | S | extend `hero-all-classes.test.js` | (1) The "Gear stats" group appears. (2) The "Boss luck" text matches `gp`. (3) The armor row shows a friendly name ("T5 Moon Robe") and no underscores. |
| G15 | Balance sim and tuning | NEW `tests/gear-balance-sim.test.js` (node); tunes table numbers only | M | itself | Every (g) target holds for all 14 classes. |
| G16 | Soulbound and co-op guards | RT (never put `t` on `loot`), `shared/mm-stash.js` (refuse `t ≥ 11`), `lantern.js` payout keeps `t`/`a` | S | NEW `gear-soulbound.test.js` | (1) A T11 stash deposit is refused with a message. (2) A T3 deposit round-trips `t`. (3) The team `loot` event never carries `t` (grep plus a runtime spy). |

### Art (Codex request)
**On hand:** the 18 armor icons, b07/i01 weapons, b15 `bag_blue/bag_red/bag_soulbound_sparkle`, b18 `fx_explosion_small/big`, b19 `ui_slot_armor/ui_frame_*/ui_stat_*`, b22 `rune_*`.

**New batch `b29-gear-tiers`:**
1. `wpn_icon_bow_blast`, `wpn_icon_wand_burst`, `wpn_icon_staff_comet`, `wpn_icon_pistol_flak`: 32×32 static.
2. `ui_tier_badge_1` … `ui_tier_badge_12`: 16×16, readable on `#1b1f27`.
3. `ui_stat_crit`, `ui_stat_splash`, `ui_stat_resist`, `ui_stat_leech`, `ui_stat_regen`, `ui_stat_range`: 16×16 in b19 style.
4. `ui_affix_keen`, `_blast`, `_venom`, `_swift`, `_reach`, `_leech`, `_pierce`, `_vital`, `_ward`, `_fleet`, `_resist`, `_mend`: 16×16.
5. `sig_dread_plate`, `sig_wyrm_core`, `sig_oracle_eye`, `sig_lich_phylactery`, `sig_hydra_fang`, `sig_maw_shard`: 32×32.
6. `fx_splash_ring`: 64×64, 6 frames.
7. `fx_boss_slam_warn`: 128×128, 4-frame loop.
8. `fx_boss_slam_hit`: 128×128, 6 frames.

Every asset has a code fallback, so no slice waits on art.

## (g) Risks and balance simulation

**Risks**
1. **A stale tab erases tiers or armor.** G7 ships first, and drops switch on one deploy later. `MMBackup` takes a snapshot before the first tiered item is written. The `gv` marker detects a downgrade (`t` missing while `gv = 1`) and shows a one-time "restore from backup" hint.
2. **Power creep against the `MMDifficulty` clamps.** G15 must pass before G9 merges.
3. **Splash exploits.** `lob` and `splash` can't be combined, a bolt splashes at most once, and targets are capped.
4. **Phone performance.** Event caps, cached rings and the existing hash; G11 asserts the `MMPerf` budget.
5. **Co-op desync.** Tiered gear is local only, and guests draw only the FX.
6. **Test churn.** The 26→30 counts move to explicit lists; no tolerance is widened.
7. **Open owner decisions.** Should tier gates follow the account-wide `realm.level` (today's model) or a per-hero level? Should the shop ever sell T1-T3?

**Sim (G15, node, deterministic):** 14 classes × zones 0-3 × tier band (low/mid/high) × r0/r3; 60 s vs 6 zone creatures (`RM_ENEMIES` hp × `MMZones.statMultipliers` × `MMDifficulty` knots); weapon from `resolve()` + `MMGear` + `MMGearAffix` (1000 seeds); incoming = zone bolt rate × `_guarded`.

| Metric | Target |
|---|---|
| Median single-creature TTK, zone mid tier, Common | z0 1-2 s, z1 1.5-3 s, z2 2-4 s, z3 2.5-4.5 s |
| Z3 boss solo | T10 Common 90-180 s; T12 Epic ≥ 55 s |
| DPS T12 Epic (with affixes) / T9 Common | ≤ 1.85 |
| DPS T12 Epic / today's Epic Spark Wand | 1.4-1.9 |
| Hits to die, L20, zone 3, mid-tier armor | light ≥ 12, robe ≥ 11, heavy ≥ 15 |
| Splash styles | group clear 0.7-1.4× the ranger base; single target ≥ 0.85× |
| Drop pacing (seeded 4 h godlands walk, 3 boss sites, 1200 s cooldown) | first T11 median ≤ 1 h; first T12 median 1.5-4 h; 99th percentile ≤ 60 boss kills |

The test prints a table and fails on the first row that misses its target. Tuning changes only `MMGear.TIERS`, `MMGearDrops.TABLES` and the affix ranges, never engine code.
