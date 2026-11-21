# Research: class and weapon styles, projectiles, buffs, ability unlocks

Research agent, 2026-11-21. This doc is read-only research: no code was changed. The build plan is in `CLASS-WEAPON-BUILD-PLAN.md`.
Sources were reached through generic web searches. RealmEye pages could not be fetched directly (empty body), the same as in `RESEARCH-ROTMG.md`. RealmEye facts below come from search excerpts, so treat the exact numbers as approximate.

## 1. Findings

### 1.1 How RotMG weapons create class identity
- Each class owns one weapon family. Staff: Wizard, Necromancer, Mystic. Wand: Priest, Sorcerer. Bow: Archer, Huntress, Bard. Dagger: Rogue, Assassin, Trickster. Sword: Warrior, Knight, Paladin, range about 3.5 tiles. Katana: Ninja, Samurai, range about 4.75 tiles. Wands have the longest range (about 9 tiles) and the lowest single-target DPS. High-tier bows fire 3 shots and only reach full DPS up close. Staffs fire 2 wavy shots at long range. (RealmEye "classes", "range strategies", "choosing a class")
- So each family is defined by four knobs: range, shot count and spread, per-hit damage, and a hidden path shape. Tier raises the numbers. Untiered (UT) items change the shape: a different count, a wavy or parametric path, or a status on hit.
- Projectile attributes from RealmEye "weapon attributes" (excerpts):
  - **Wavy** has a fixed frequency of about 2.75 cycles over the projectile's life, and its amplitude grows to a peak of about 0.4 tiles. Amplitude does not change forward speed, so range is unaffected. Example: Leaf Bow.
  - **Parametric** shots fly a fixed figure-eight of about 3 tiles. Example: Wand of the Bulwark.
  - **Boomerang** shots fly out and come back, which effectively halves range. In RotMG it is very rare (one tablet).
  - **Piercing** and **multi-hit** shots pass through enemies.
  - Wavy, parametric and boomerang are hidden attributes that the in-game tooltip does not show, and players learn them by feel. Our tooltip should show them (UI plan).
- Takeaway: one data record per projectile style with about 12 fields is enough to describe every RotMG-like weapon. The shape is the fun part. The damage numbers can be normalised.

### 1.2 Status effects (RotMG model)
- From RealmEye "status effects" (excerpts):
  - **Armor Broken** sets DEF to 0 in damage calculations, and damage numbers on that target show in purple.
  - **Armored** gives +50% DEF, and Armor Broken overrides it.
  - **Damaging** gives +25% weapon damage, and **Weak** cancels it ("Weak takes priority").
  - The fire-rate debuff (**Dazed**) sets DEX to 0, which gives a base of 1.5 attacks per second.
- Enemies can be immune to the hard statuses (Stun, Stasis, Paralyze, Daze, Slow). Some bosses resist Armor Break or Curse. Purification removes negative effects, except effects applied by an aura. Instant effects have no duration.
- Takeaways:
  - Pair each positive with a negative and let the negative win, which keeps the maths simple: Damaging/Weak, Armored/Armor Broken, Swift/Slowed, Berserk/Dazed.
  - Bosses need an immunity list.
  - Damage-number colour is a cheap HUD cue for a debuffed target.

### 1.3 Stacking rules (general game design)
- A status has two variables, potency and duration, and the stacking rule decides how they combine. (Game Developer, "A status effect stacking algorithm")
- Common models:
  - Refresh on reapply (League of Legends).
  - No stacking, where the longest and strongest copy wins (Minecraft).
  - Duration stacking versus intensity stacking with a hard cap of 25 stacks (Guild Wars 2).
  - Hybrids where stacks extend duration, raise intensity, or both (Mortal Shell 2).
  - A generic rpg-core framework names four strategies: refresh, stack-power, take-max and independent.
- Known pitfalls: a stronger copy waits behind a weaker one (a GW2 complaint), and the take-max rule wastes the weaker applications.
- Takeaways:
  - Use **take-max potency plus refresh duration** for buffs and hard debuffs.
  - Use **intensity stacks with a cap** (3 to 5) only for damage over time (Bleed) and Curse.
  - Fix the rule per status in data, not in code branches.

### 1.4 Projectile variety in survivor-likes
- Vampire Survivors builds its weapon roster from a few motion kernels:
  - **orbit**: King Bible to Unholy Vespers, which orbits faster, wider and permanently.
  - **boomerang**: Cross to Heaven Sword, which aims at the nearest enemy and then rebounds past the player.
  - **chain or strike plus lingering zone**: Lightning Ring to Thunder Loop.
  - **wall bounce**: Runetracer to No Future, which multiplies on bounce.
- An evolution changes the shape and keeps the identity. (PC Gamer, Digital Trends, GameSpot evolution guides)
- Takeaway: build about 9 motion kernels (straight, wave, boomerang, homing, bounce, chain, orbit, burst, lob). Every style is a parameter set over those kernels. Upgrades change parameters, not code.

### 1.5 Balancing different shot types
- Touhou player-script guidance (Sparen's Danmakufu tutorials):
  - There is no single formula. Each shot type should be best in a different situation.
  - Spread shots get a higher raw DPS ceiling to make up for their hit rate (about +7%).
  - Always-hit shots get a lower ceiling (about -7%).
- Homing usually pays for its reliability with lower damage. Piercing usually pays with range or bomb power. (Maribel Hearn's shot-type FAQ)
- Takeaway: keep the repo's existing **theoretical DPS index** (`shots x shotDmg x dmg x rate x (1 + 0.25 x pierce) x (1 + crit)`, tested within +-30% of the median in `tests/shared-mm-class-fire.test.js`). Extend it with explicit hit-reliability weights for the new kernels, then normalise each style's per-bolt damage so its index matches the class base. The B6 time-to-kill sim (`NEXT-SLICES.md`) calibrates the weights later.

### 1.6 Unlock cadence (ARPG and roguelite)
- Common patterns:
  - A point every level (Path of Exile, with a huge tree).
  - A point every 5 levels (Star Vortex devlog).
  - Milestone gates for large unlocks (Soulstone Survivors at prestige 5, 20 and 50).
  - Mastery locked behind 20 points in the base tree (Last Epoch).
- The Talented roguelite's players asked for fewer random early-game masteries and a smoother start.
- Takeaways for a 20-level game:
  - Use fixed, free, deterministic unlocks at a steady rhythm. Today's actives sit at L1, 3, 5 and 7, so passives fit at L4, 9, 14 and 19.
  - The first passive must arrive early (L4).
  - Do not use random picks or rerolls (owner rule: no loot-box randomness).

## 2. Inventory: what exists today

### Classes: `game/shared/mm-classes.js` (308 lines)
- 14 classes. Starters are `ranger`, `frostcaller` and `herald`. The rest unlock by level on another class:
  - punk: Ranger L5
  - bruiser: Herald L5
  - graveTender: Frostcaller L10
  - trickster: any L10
  - shadowPaw: Trickster L20
  - rogue: Ranger L8
  - warlock: Frostcaller L8
  - paladin: Herald L8
  - berserker: Punk L10
  - druid: Herald L12
  - necromancer: Frostcaller L12
- Each class has a stat vector (LIFE, FOC, POW, GRD, SWF, KNK, VIG, WIT) and one `ability` used by the Mad Maze `cast()`, which returns effect descriptors such as root, ring, heal, buffGrd, shield, stunRing, damage, knockback, teleport, decoy, nextVolley, thorns, summon, siphonAura and invisible.
- `arenaProfile(id)` returns hp, speed, dmg, rate and iframes, each clamped to 0.7-1.4, plus the FIRE tags (shots, spread, pierce, shotDmg, critChance, boltSpeed).
- Current theoretical DPS index, computed this session (median 1.18, allowed band 0.83-1.54):

| Class | Index | Class | Index |
|---|---|---|---|
| ranger | 1.000 | shadowPaw | 1.260 |
| frostcaller | 1.237 | rogue | 1.290 |
| herald | 1.004 | warlock | 1.259 |
| punk | 1.111 | paladin | 0.879 |
| bruiser | 1.257 | berserker | 1.237 |
| graveTender | 1.113 | druid | 0.993 |
| trickster | 1.100 | necromancer | 1.311 |

  Paladin (0.879) is closest to the lower bound.
- `arenaSignature(id)` gives the F-slot signature (level 7, cooldown 10-16 s). Kinds: volley, dash-volley, drain-orb, oath-shield, rage-slam, thorn-bloom, bone-guard.

### Arena engine: `game/realm.js` (2574 lines, serial resource)
- `RM_PLAYER`: speed 235, hp 100, fireRate 7.5/s, bulletSpeed 580, bulletLife 0.85 s (range about 493 px), dmg 1, iframes 0.5. Enemy bolt damage is 8.
- `RM_ABILITIES`:

| Key | Ability | Level | Cooldown |
|---|---|---|---|
| Q | Dash | L1 | 3 s |
| E | Nova (16 bolts) | L3 | 8 s |
| R | Shield (3 hits, 6 s) | L5 | 14 s |
| F | Overdrive (x2 rate for 4 s) | L7 | 20 s |

  The class signature replaces F when `setHeroSignature` is called. The gate is `abilityUnlocked(i)`, which tests `save.level >= level`. **The ability slots Q1/E3/R5/F7 already exist, as the task assumed.**
- `_firePlayerVolley` (line 1291) fans `shots` bolts over `spread` and applies shotDmg, crit x2, `b.pr` pierce and boltSpeed (life is divided by the speed factor so range stays the same). Ranger and duels use the plain `firePlayerBullet`.
- Bolt objects hold only `x, y, vx, vy, life, dmg, own, pr, hn, h0..h2`. A piercing bolt remembers 3 hit enemies, so pierce is effectively 3 at most. The bolt pool is 160.
- Bolts are drawn as one shared sprite (`sprites.pBullet`, line 2431). There are no per-style visuals.
- Timed buffs today:
  - `buffDmg` (1-1.5x, world Fury shrine) is applied in `_calcStats`.
  - `buffTaken` (<1, Ward shrine) is applied in `_hitPlayer`.
  - Both are set by `games/mad-maze/realm-world.js` lines 752-798.
  - The signature timers `sg.powT/powMul`, enemy `slowT/slowF`, `overdriveT` and `shield.hits` are each separate ad-hoc fields. There is no shared status system and no status HUD.
- Enemies never apply a debuff to the player. Enemy bolts carry only `kind` (0-2) and `dm`, the damage multiplier.
- Co-op: the host broadcasts `fp` events `[x, y, angle, dmg]` for each player bolt, and guests draw straight bolts.

### Items
- **Realm items** (`realm.js` lines 47-65): 7 items over 3 slots (weapon, charm, ring).
  - Weapons: `sparkwand` (+0.5 dmg), `quickwand` (+1.5 rate).
  - Charms: heart (+12 hp), swift (+18 speed).
  - Rings: luck (+12% shards), scholar (+12% xp), ward (+0.1 s iframes).
  - Rarities Common, Uncommon, Rare and Epic have multipliers x1, 1.6, 2.4 and 3.6. Epic is made only by combining 3 Rares.
  - Weapons are stat sticks that never change the projectile.
  - `rmCleanSave` **drops any unknown item id**, so a stale tab erases new ids through the cross-tab merge.
- **MMItems** (`shared/mm-items.js`): a Mad Maze tier model (T0-T8) with a per-class `weapon` type (slingbow, frostwand, squeakstaff, riffblade, knuckle, bonewand, raypistol, shuriken, twindaggers, orbstaff, warhammer, twinaxes, thornstaff, bonestaff) and damage ranges. Class ids are lowercase (`gravetender`, `shadowpaw`), which does not match MMClasses (`graveTender`, `shadowPaw`).
- **Weapon art** (32x32 icons, delivered): b07 has `bow_hunter, crossbow_bronze, dagger_steel, dagger_venom, staff_druid, staff_bone, wand_ember, orb_void, sword_*, axe_*, hammer_paladin, spear_*, scythe_bone` and others. i01 has the class weapons `ranger_recurve_bow, rogue_dual_daggers, warlock_cursed_scepter, paladin_hammer, berserker_double_axe, druid_branch_staff, necromancer_bone_staff` and others. b22 has relics and tomes.
- **Not delivered**: b16 (player projectiles), b17 (enemy projectiles), b18 (effects), b19 (UI icons) and b20 (ability icons). Projectiles, effects and status icons must therefore be **code-drawn**.

### Profile and level: `shared/mm-profile.js`
- `pixeltown-mm-v1` heroes carry `level` and `xp`. The `CLASSES` whitelist has **11 ids and lacks graveTender, trickster and shadowPaw**, so a hero of those classes is rewritten to `ranger` by `cleanHero`. This is a live bug.
- Arena ability gates use the arena save `realm.level`, which lives in `pixeltown-save-v1` and is account-wide (xp per level is 30 + 20(L-1)). `mad-maze.js` does not raise `hero.level`.

### Hero stats panel: `shared/mm-hero-stats.js`
- `panelRows` builds the groups Hero, Class stats (including the `Fire` text from `fireText`), Abilities (the class ability plus the signature), Gear and Run.
- It is wired at `mad-maze.js` line 258 and has no rows for weapon style, passives or statuses.

### Tests already guarding this area
- `shared-mm-class-fire.test.js`: the DPS band, tag ranges, and ranger byte-identity.
- `class-fire.test.js`: browser test of volley angles, damage and pierce.
- `class-abilities-arena.test.js`, `shared-mm-arena-signature.test.js`, `shared-mm-hero-stats.test.js`, `shared-mm-items.test.js`.

## 3. Gaps
1. **No projectile kernels beyond a straight fan.** There is no wave, boomerang, homing, bounce, chain, orbit, burst or lob, and no on-hit status. The bolt struct and the 3-slot hit memory limit pierce and chain to 3.
2. **Weapons do not shape fire.** The two realm weapons are stat sticks. MMItems weapon types exist but the arena never reads them. The 14 classes have no weapon family.
3. **No status system.** There are five ad-hoc timers (buffDmg, buffTaken, powT, slowT, overdriveT), no pairing or priority rules, no boss immunity, no HUD icons, and enemies never debuff the player.
4. **Progression stops at L7.** Levels 8-20 unlock nothing in the arena except HP (+8 per level). There are no passives and no signature upgrades.
5. **Hero level does not track arena play.** Gates use the account-wide realm level. Per-hero passives would need per-hero xp, which is out of scope here and flagged.
6. **The class whitelist bug** in `mm-profile.js` (3 classes missing) and the class-id casing mismatch with `mm-items.js`.
7. **Save fragility.** `rmCleanSave` drops unknown item ids, so new weapon ids need a tolerance release before they can drop.
8. **Co-op replication.** The `fp` event carries no style, so guests would draw curved or homing bolts as straight lines.
9. **Tooltip and panel.** Hidden attributes (wave, boomerang) must be shown, which RotMG does not do. The stats panel has no Weapon, Passives or Status groups.
10. **Balance headroom.** Paladin (0.879) and necromancer (1.311) sit near the band edges, so any change must be re-normalised.

## Sources
- [RealmEye: status effects](https://realmeye.com/wiki/status-effects)
- [RealmEye: weapon attributes](https://realmeye.com/wiki/weapon-attributes) (also [rev 16](https://www.realmeye.com/wiki/weapon-attributes/16))
- [RealmEye: classes](https://realmeye.com/wiki/classes), [range strategies](https://www.realmeye.com/wiki/range-strategies)
- [Game Developer: A status effect stacking algorithm](https://gamedeveloper.com/design/a-status-effect-stacking-algorithm)
- [Guild Wars 2 wiki: Combat changes, DoTs](https://wiki.guildwars2.com/wiki/Combat_Changes:_DoTs_and_Dashes), [League wiki: Stacking](https://wiki.leagueoflegends.com/en-us/Stacking?oldid=3992485), [rpg-core status effects](https://rpgcore.readthedocs.io/en/latest/core/status-effects/)
- [Sparen: Danmakufu player script balance](https://sparen.github.io/ph3tutorials/ph3u3l35.html), [Maribel Hearn: shot types](https://maribelhearn.com/faq/shots)
- [PC Gamer: Vampire Survivors evolutions](https://pcgamer.com/vampire-survivors-evolve-weapons-evolutions-guide), [GameSpot: evolutions](https://www.gamespot.com/articles/vampire-survivors-how-to-evolve-weapons/1100-6508815/)
- [Star Vortex upgrade trees devlog](https://zorguk.itch.io/star-vortex/devlog/428671/upgrade-trees), [Last Epoch mastery](https://kakuchopurei.com/2024/02/last-epoch-how-to-unlock-mastery), [Soulstone Survivors skills](https://www.gamepressure.com/newsroom/soulstone-survivors-unique-skills-skill-tree-and-prestige/zf4c7a), [Talented comments](https://turtlefoxgames.itch.io/talented/comments?after=0)
