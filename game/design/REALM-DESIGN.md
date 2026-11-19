# Mad Maze: design document

Status: design only, nothing here is built yet. Author: lead game designer
pass, 2026-11-19. Companion doc: `WORLD-MAP-DESIGN.md` (the Pixeltown hub map,
the adjacent cozy town, the other full games, the build plan M1..M10).

Mad Maze is a top-down, real-time bullet-hell dungeon crawler in the spirit of
Realm of the Mad God (RotMG): fast twin-stick shooting, an open danger field
that gets harder toward its centre, events that drop portals, short dungeons
with patterned bosses, colour-coded loot bags, stat potions, fame and a
(soft) permadeath. All names, art and content below are original. It is one
node on the Pixeltown hub map (see the companion doc) and lives in its own
page, `game/games/madmaze/`.

Working title: **Mad Maze** (recommended to keep: short, readable by kids,
says "maze" and "chaos" at once, and pairs with the villain, the Mazewright).
Three original alternatives:

1. **Lanternfall** (the hub is the Lantern, the world is falling into the maze)
2. **Mazewright** (named after the villain, the way RotMG is named after Oryx)
3. **Bramble & Bullet** (cozier, leans on the first biome)

---

## 1. Core fantasy and loops

**Fantasy:** "I am a tiny 24px hero from Pixeltown sprinting through a living
maze, weaving between beautiful bullet patterns, shredding monsters, and
watching a coloured bag pop out that might hold something amazing." The
Mazewright, a bored architect-god, keeps rearranging the land into
labyrinths and has filled them with his creations. You are not saving the
world; you are out-smarting it, one maze at a time.

Tone: bright, readable, a little silly (enemies have pun names), never gory.
Death is a "fall" (the hero is carried home by fireflies) not a corpse.

### 1.1 The 30-second loop
1. Spot a group (3 to 6 enemies) on screen or a red quest arrow at the edge.
2. Close in, read the pattern (rings, aimed bursts), strafe and shoot.
3. Group dies inside ~4 to 10 s at the intended level; XP numbers float up.
4. A bag pops (brown most of the time, sometimes better) with a colour-coded
   sound; walk over it, glance, take or leave.
5. Drink a snack if hurt, pick the next group. Repeat.

### 1.2 The 10-minute loop
1. From the Lantern hub, step into a Wilds portal.
2. Level up through the bands of the Wilds (shore to peaks), following the
   quest arrow to the strongest monster suitable for you.
3. A **Wild Event** is announced ("The Mazewright: My Hollowstump will
   flatten you!"). You fight it, it drops a **dungeon portal** (45 s).
4. Enter, clear 7 to 14 rooms (or a labyrinth), find the key, open the
   treasure room, beat the boss (45 to 90 s fight). Get a soulbound bag and,
   often, a stat potion.
5. Portal back out to the Wilds or Recall home to stash loot.

### 1.3 The session loop (30 to 60 minutes)
- Level a fresh hero 1 to 20 in about 40 to 60 minutes (RotMG's quick early
  levelling is part of its charm; we keep it).
- After 20, the goal shifts to **stat potions**, better tiers and harder
  dungeons, and to fame. A maxed hero can clear the tier-5 Mazewright's Keep.
- Between sessions: stash trades between your heroes, pet feeding, daily
  bounties, the daily seeded maze with a leaderboard and ghosts.

### 1.4 What keeps it fun (and what RotMG players complain about)
| RotMG complaint (sources at end) | Our answer |
|---|---|
| Very grindy maxing (~200 potions per character mentioned on forums) | ~40 potions to max a hero (section 5.4) |
| Bots and gold-sellers spamming the hub | No trading for real money, no gold, no global chat in v1 |
| Pay-to-win pressure (vault space, slots, keys) | No shop for money at all; stash and slots unlock with fame |
| Instant "nexus" escape is exploitable, and no i-frames | 1.0 s Recall channel; 0.4 s i-frames after a hit (section 3.3) |
| HP scaling lets weak players slow strong groups | Co-op is invite-only parties of up to 4, HP scales +60%/player |
| Mid-game dungeons pointless after max | Every dungeon has a fame "first clear" bonus per hero and pet eggs |
| Item bloat, narrow uniques | 4 slot types, 9 tiers, max 24 relics in the first three worlds |
| New players get no explanation | 3-room tutorial maze, arrows, and the Lantern's signposts |
| Permadeath feels cruel | Soft permadeath: lose the run's gear, keep fame, unlocks, stash, pet, a level floor |

---

## 2. Controls

All bindings are remappable (settings, saved in the shared profile).

### 2.1 Desktop (keyboard + mouse)
| Input | Action |
|---|---|
| W A S D (or arrows) | Move (8-way, normalised diagonal) |
| Mouse | Aim (crosshair) |
| Left click (hold) | Fire continuously at the weapon's rate |
| I | Toggle autofire (keep firing toward the cursor) |
| Space | Class ability (costs Focus) |
| Q | Eat a Health Snack (heal 100 HP, shared 0.5 s cooldown with E-drink) |
| E | Interact: pick up / open bag, enter portal, talk, read sign |
| R | Drink Focus Tea (restore 100 Focus) |
| F | Recall to the Lantern (1.0 s channel, see 3.3) |
| 1 to 8 | Use / equip backpack slot 1 to 8 |
| Tab | Mini-map overlay |
| Esc | Pause menu (single-player actually pauses) |

### 2.2 Phone (twin-stick)
- Left half: floating move stick (appears where the thumb lands, radius 56 px,
  dead zone 0.18 like the town's joystick).
- Right half: floating aim stick. Deflection over 0.35 aims and fires;
  release stops firing (or keeps firing if autofire is on).
- Ability button (64 px) above the aim stick; Snack (48 px) and Tea (48 px)
  to its left; Interact appears contextually (pulsing 56 px) when near a bag
  or portal. Recall is in the pause menu only (no accidental taps).
- **Aim assist on by default on touch**: when firing, snap aim to the
  nearest enemy within a 14 degree cone and 9 tiles; off in settings.
- Landscape is required inside a run; portrait shows a "rotate" card (the
  hub map itself works in both).

### 2.3 Controller (Gamepad API, standard mapping)
Left stick move; right stick aim (fires when deflection > 0.5); RT fire
(when right stick at rest, fires at last aim); A or RB ability; LB snack;
Y tea; X interact; Back recall (hold 1 s); Start pause; D-pad backpack.
Dead zone 0.22 (same constant the town uses).

---

## 3. Combat model in numbers

### 3.1 Units
- 1 tile = **24 px** (our sprites are 24x24). Camera zoom 2x on desktop,
  1.5x on touch (same as the town), so the visible field is about
  20 x 14 tiles on a 1000x700 window and ~ 18 x 9 tiles on a landscape phone.
- Times in seconds, speeds in **tiles per second (tps)**.
- Simulation runs at a fixed 60 Hz step (accumulator), rendering at display
  rate; on phones that drop under 40 fps the sim still steps at 60 Hz with up
  to 3 catch-up steps per frame.

### 3.2 The eight stats (original names, RotMG-like roles)
| Stat | Short | Role | Formula |
|---|---|---|---|
| Life | LIFE | Max HP | class base + per-level rolls + potions |
| Focus | FOC | Max ability resource | class base + per-level + potions |
| Power | POW | Damage multiplier | `dmgMult = 0.5 + POW / 40` (0.5x at 0, 1.75x at 50) |
| Guard | GRD | Flat damage reduction | `taken = max(ceil(raw * 0.25), raw - GRD)` |
| Swift | SWF | Move speed | `tps = 4 + 3 * SWF / 50` (4.0 to 7.0 tps, 96 to 168 px/s) |
| Knack | KNK | Fire rate | `shotsPerSec = (2 + 6 * KNK / 50) * weapon.rateMult` |
| Vigor | VIG | HP regen | `hpPerSec = 1 + 0.24 * VIG` (out of combat x2 after 4 s) |
| Wits | WIT | Focus regen | `focPerSec = 0.5 + 0.12 * WIT` |

Notes:
- The POW and KNK shapes follow the community-documented RotMG formulas
  (damage 0.5 + ATT/50, attacks/s 1.5 + 6.5*DEX/75) rescaled to our 0..50
  range. Guard's 25% damage floor is our choice (we could not verify RotMG's
  exact minimum).
- "Armor piercing" bullets (some bosses, clearly marked with a white core
  and a ring outline) ignore Guard.
- Stats cap at 50 except Life and Focus (caps per class, table 4.2).

### 3.3 Player numbers
| Quantity | Value |
|---|---|
| Hit box | circle radius **4 px** around the sprite's centre (the "hit-box dot" shows it) |
| Sprite | 24x24, drawn with a 1 px dark outline for readability |
| Invulnerability after a hit | 0.4 s (sprite blinks at 8 Hz, or tints if reduce-motion) |
| Snack heal | 100 HP, carry max 6, shared cooldown 0.5 s |
| Tea | 100 Focus, carry max 6 |
| Recall | 1.0 s channel, you can still take damage, a hit does not cancel it |
| Bag pickup radius | 0.8 tile; bag lifetime 60 s (soulbound bags 90 s) |
| Low-HP warning | at 25% HP the screen edge pulses red (off with reduce-motion: static red border) |

### 3.4 Player projectiles (per weapon type)
All player shots: radius 4 px, drawn 8x8 (or 12x12 for big ones), at most
**120** live player projectiles per player (pool size), friendly bullets drawn
at 55% opacity so enemy bullets always read on top.

| Weapon type | Shots per volley | Spread | Speed tps | Lifetime s | Range tiles | Rate mult | Pierce | T0 dmg | T8 dmg |
|---|---|---|---|---|---|---|---|---|---|
| Slingbow | 1 | 0 | 15 | 0.55 | 8.25 | 1.0 | no | 12-20 | 40-56 |
| Frost Wand | 1 | 0 | 12 | 0.62 | 7.4 | 1.0 | yes | 14-22 | 42-58 |
| Squeak Staff | 2 parallel (8 px apart, sine wobble 6 px @ 4 Hz) | 0 | 13 | 0.58 | 7.5 | 1.0 | yes | 8-14 each | 26-38 each |
| Riff Blade | 1 wide (radius 9 px) | 0 | 10 | 0.36 | 3.6 | 0.9 | yes | 28-40 | 80-104 |
| Knuckle Blaster | 3 | 20 deg total | 11 | 0.42 | 4.6 | 0.85 | no | 10-16 | 30-42 |
| Bone Wand | 1 | 0 | 11 | 0.65 | 7.2 | 1.0 | no | 16-24 | 46-62 |
| Ray Pistol | 1 (alternating left/right muzzle 6 px) | 0 | 16 | 0.45 | 7.2 | 1.25 | no | 9-15 | 28-40 |
| Shuriken | 2 | 10 deg total | 13 | 0.5 | 6.5 | 1.0 | yes | 10-16 | 30-42 |

Damage of one hit = `round(randInt(min, max) * dmgMult)`, then the enemy's own
armor: `max(ceil(d * 0.25), d - enemy.armor)`.

Sanity check (Slingbow, avg 16, POW 10, KNK 10): 16 x 0.75 x 3.2/s = **38 DPS** at
level 1. Mid-game (T5 avg 36, POW 30, KNK 30): 36 x 1.25 x 5.6 = **252 DPS**.
Maxed T8 (avg 48, POW 50, KNK 50): 48 x 1.75 x 8 = **672 DPS**.

### 3.5 Enemy projectiles
Enemy bullets are **slower than player bullets** (readability first):

| Bullet kind | Radius px | Speed tps | Visual |
|---|---|---|---|
| Pellet | 3 | 5 to 8 | 8x8 round, saturated warm colour, white core |
| Orb | 5 | 3 to 5 | 12x12, slow, big, pulsing outline |
| Shard | 3 (capsule 3x7) | 7 to 9 | rotated to travel direction |
| Wave | 4 | 4 to 6 | sine path, amplitude 0.5 tile |
| Homing mote | 4 | 4 | turns at <= 90 deg/s, homes for max 1.2 s then flies straight |
| Piercing (ignores Guard) | 5 | 4 to 6 | white core + 2 px ring, distinct "hiss" sound |

Caps: **max 400 enemy bullets live** (pool of 512; design target is <= 250
in normal rooms, <= 400 only in final-boss phases). If the pool is full, the
oldest bullet of the emitting enemy is recycled (never another enemy's).

### 3.6 Pattern catalogue (parameters)
Every pattern is a pure function `(emitter, t, rng) -> spawn list`; boss
scripts are timelines of these. All angles in degrees, 0 = east.

| Pattern | Parameters (defaults) | Notes |
|---|---|---|
| `ring` | `count 12, speed 5, kind pellet, offset 0, rotatePerVolley 7.5, every 1.2 s` | rotating offset prevents a fixed safe spot |
| `spiral` | `arms 3, stepDeg 11, every 0.09 s, speed 5, kind pellet, reverseEvery 4 s` | stepDeg not dividing 360 gives a drifting spiral |
| `aimedBurst` | `shots 3, spreadDeg 18, every 2.0 s, burstCount 3, burstGap 0.12 s, speed 7, lead 0` | `lead 0.5` = half predictive aim (later tiers) |
| `sweep` | `arcDeg 120, center aimed, degPerSec 90, every 0.06 s, speed 6, pingPong true` | a hose of bullets sweeping across the player |
| `wallGap` | `width 18 tiles, spacing 0.75 tile, gapTiles 2.5, speed 4, dir down, gapPos aimed or rng, every 2.5 s` | gap never narrower than 2.5 tiles (5x the player's hit box diameter) |
| `homing` | `count 4, speed 4, turnDegPerSec 90, homeTime 1.2, life 4 s` | homing stops after `homeTime`, so motes can be dodged |
| `flower` | `count 16, speed 3 + 2*sin(i*petals*2pi/count), petals 4` | slow beautiful rings with fast petals |
| `shotgun` | `shots 5, spreadDeg 50, speed 6 to 8 (random per shot), every 1.5 s` | used by short-range brutes |
| `orbitThenRelease` | `count 8, orbitRadius 1.5 tiles, orbitTime 1.0, then speed 6 outward` | telegraphs clearly |
| `rain` | `columns 6, every 0.4 s, speed 5, random x in arena` | area denial for phase 3s |

Telegraphs: every enemy flashes white (or shows a 0.5 s "wind-up" ring if
reduce-motion) **0.35 s before** any volley of 8+ bullets, and bosses show a
red sector on the floor 0.8 s before a `sweep` or `wallGap`.

### 3.7 Enemy archetypes and scaling
| Archetype | Move | Behaviour | HP (tier 1 base) | Contact dmg | Bullet dmg |
|---|---|---|---|---|---|
| Wanderer | 1.5 tps | random walk, aimed shots when within 7 tiles | 60 | 10 | 8 |
| Chaser | 3.2 tps | runs at you, shotgun at 3 tiles | 90 | 14 | 10 |
| Turret | 0 | rings / spirals | 140 | 0 | 9 |
| Orbiter | 2.5 tps | circles the player at 5 tiles, aimed bursts | 80 | 0 | 9 |
| Spawner | 0 | spawns 2 minions every 6 s (max 6) | 200 | 0 | 0 |
| Elite (any + crown) | x1.1 | archetype + one extra pattern | x4 | x1.5 | x1.5 |

Tier multipliers (dungeon difficulty tiers 1 to 5, Wilds bands map to the same):

| Tier | HP mult | Damage mult | Armor | XP per kill | Typical hero level |
|---|---|---|---|---|---|
| 1 | 1.0 | 1.0 | 0 | HP / 10 | 1-6 |
| 2 | 2.6 | 1.7 | 2 | HP / 10 | 6-11 |
| 3 | 5.5 | 2.6 | 5 | HP / 10 | 11-16 |
| 4 | 9 | 3.6 | 8 | HP / 10 | 16-20 |
| 5 | 14 | 4.6 | 12 | HP / 10 | 20, potions |

Co-op: enemy HP x (1 + 0.6 * (players - 1)); bosses x (1 + 0.75 * (players - 1)).

### 3.8 Bosses: phase rules
- Phases at **100-66%, 66-33%, 33-0%** of HP. At each threshold the boss
  becomes invulnerable for 1.5 s, clears its bullets into harmless sparkles
  (a breather), plays its phase sting, and changes pattern set.
- Each phase has 2-3 patterns on a looping timeline with a 1.0 s gap
  every 6-8 s where nothing fires (the "breathing gap", needed for phone play).
- Enrage: after 180 s (or 240 s for the final boss) patterns speed up 15%. No
  instant-kill enrage.
- Bosses never spawn bullets inside a 2-tile radius of a player.

---

## 4. Classes (8, built from our existing species strips)

Each species strip in `i/<key>-strip.png` is 216x24 = 9 frames of 24x24, each
frame a different look (not an animation). A class uses its species strip;
the player picks any of the 9 frames as their "skin" (free). Animation is
procedural like the town's walk-hop: 2 px bob at 8 Hz while moving, a 1 px
recoil on each volley, a squash on ability. No new character art required.

### 4.1 Class list
| # | Class | Species strip | Weapon | Ability (Space) | Stat bias | Unlock |
|---|---|---|---|---|---|---|
| 1 | **Thicket Ranger** | `coolcats` | Slingbow | **Yarn Snare**: throw to cursor (max 7 tiles), roots enemies in 2.5 tile radius for 2.0 s and they take +15% damage. 40 FOC, 1 s cd | SWF, KNK | start |
| 2 | **Frostcaller** | `pudgypenguins` | Frost Wand | **Blizzard Burst**: ring of 12 shards from the cursor point (max 8 tiles), each 30-45 x dmgMult, slows 30% for 2 s. 60 FOC | POW, WIT | start |
| 3 | **Good-Dog Herald** | `doge` | Squeak Staff | **Good Boy Aura**: heal 60 + 2*WIT HP to self and allies within 5 tiles, +10 GRD for 4 s. 55 FOC, 1.5 s cd | VIG, WIT, LIFE | start |
| 4 | **Riff Punk** | `punks` | Riff Blade | **Mosh Shield**: 2 s shield block (frontal 120 deg, eats bullets), then a stun ring (3 tiles, 1.5 s). 50 FOC | LIFE, GRD | Ranger lvl 5 |
| 5 | **Jungle Bruiser** | `apes` | Knuckle Blaster | **Ground Pound**: 90 + 2*POW damage in 3 tiles, knockback 2 tiles, you are unhittable for 0.3 s. 50 FOC | LIFE, POW | Herald lvl 5 |
| 6 | **Grave Tender** | `zombies` | Bone Wand | **Grave Siphon**: skull at cursor, 70 + 2*POW dmg in 3.5 tiles, heals you for 50% of damage dealt (cap 120). 65 FOC | POW, VIG (low SWF) | Frostcaller lvl 10 |
| 7 | **Saucer Trickster** | `aliens` | Ray Pistol | **Blink Decoy**: teleport 4 tiles toward aim (not through walls), leave a decoy that draws all aggro for 3 s. 45 FOC | SWF, KNK | any class lvl 10 |
| 8 | **Shadow Paw** | `coolcats_ninjas` | Shuriken | **Smoke Step**: invisible for 2.5 s (enemies fire at your last seen spot), next volley +50% dmg. 55 FOC | KNK, SWF | Trickster lvl 20 |

Later classes (not in the first release, strips exist): Corsair
(`coolcats_pirates`), Unicorn Bard (`coolcats_unicorns`, ability buffs damage
+20% for allies), Golden Duelist (`goldenpunks`), Clan Scout (`alienclan`).

### 4.2 Base stats, per-level gains, caps
Per-level gains are seeded rolls: `gain = base + rng.int(0, 2)` for LIFE/FOC
and `rng() < p` (+1) for the other six, so two heroes of one class differ a
little (RotMG-style), but the seed is the hero id, so it is replayable in tests.

| Class | LIFE L1 / +lvl / cap | FOC L1 / +lvl / cap | POW | GRD | SWF | KNK | VIG | WIT | L20 average (POW/GRD/SWF/KNK/VIG/WIT) | Stat cap |
|---|---|---|---|---|---|---|---|---|---|---|
| Ranger | 120 / 18 / 560 | 100 / 7 / 260 | 10 | 0 | 12 | 12 | 8 | 8 | 26/10/32/34/20/18 | 45/25/50/50/40/40 |
| Frostcaller | 100 / 15 / 480 | 120 / 9 / 300 | 14 | 0 | 8 | 10 | 6 | 12 | 38/8/24/28/16/32 | 50/25/45/45/35/50 |
| Herald | 130 / 18 / 560 | 110 / 8 / 280 | 8 | 2 | 10 | 8 | 12 | 12 | 22/14/26/24/34/34 | 40/30/45/40/50/50 |
| Riff Punk | 140 / 22 / 640 | 90 / 6 / 220 | 12 | 6 | 10 | 8 | 10 | 6 | 30/24/26/22/28/16 | 45/40/45/40/45/35 |
| Bruiser | 140 / 22 / 640 | 90 / 6 / 220 | 14 | 4 | 8 | 8 | 10 | 6 | 36/20/22/22/28/16 | 50/35/40/40/45/35 |
| Grave Tender | 110 / 17 / 520 | 110 / 8 / 280 | 14 | 2 | 6 | 9 | 12 | 10 | 36/14/18/26/34/26 | 50/30/35/45/50/45 |
| Trickster | 110 / 16 / 500 | 100 / 7 / 260 | 10 | 0 | 14 | 12 | 8 | 10 | 26/10/36/32/20/26 | 45/25/50/50/40/45 |
| Shadow Paw | 110 / 16 / 500 | 100 / 7 / 260 | 12 | 0 | 14 | 14 | 6 | 8 | 30/8/36/38/16/22 | 50/25/50/50/35/40 |

Each stat ends level 20 roughly 10 to 18 under cap, so maxing needs
~40 potions (section 5.4), not hundreds.

---

## 5. Items and loot

### 5.1 Slots
Four equipment slots: **Weapon** (class weapon type), **Ability** (class
ability item: changes the numbers, e.g. a Tier 3 Yarn Snare roots 2.5 s),
**Armor** (three armor families: Light for Ranger/Trickster/Shadow, Robe for
Frostcaller/Herald/Grave Tender, Heavy for Punk/Bruiser), **Charm** (ring
equivalent: any class). Plus a **backpack of 8** and 6 snack + 6 tea slots.

### 5.2 Tiers
| Kind | Tiers | Stat budget |
|---|---|---|
| Weapon | T0..T8 | avg damage +4 per tier (table 3.4), T6+ gets +1 KNK or +1 POW |
| Ability | T0..T4 | +12% effect per tier, -3 FOC cost per tier |
| Armor | T0..T8 | GRD +2 per tier (T8 = +16), T4+ adds +1 to a bias stat |
| Charm | T0..T4 | +4 LIFE/FOC or +2 of one stat per tier (T4: +8 / +6) |
| **Relic** (untiered) | 24 in worlds 1-3 | unique effect (e.g. "Moth Lantern": shots leave a 0.5 s glowing trail that deals 20% damage). Never strictly better than T8, always sideways |

### 5.3 Bags (colours, contents, visibility)
Bags are 24x24 sprites (procedural recolour of one sack shape) with a short
ground glow and a distinct chime. Soulbound bags are only shown to players
who earned them.

| Bag | Contents | Visibility | Chime (WebAudio) |
|---|---|---|---|
| Brown | T0-T2 gear, snacks, tea | public | single soft click |
| Pink | T3-T4 gear, T0-T1 ability/charm | public | two-note blip |
| Purple | T5-T6 gear, T2-T3 ability/charm, pet food | **soulbound** | rising triad |
| Cyan | T7-T8 gear, T4 ability/charm | soulbound | sparkly arpeggio |
| Blue | stat potions | soulbound | bubbly glug + chord |
| Gold | event/dungeon set pieces, pet eggs | soulbound | bell |
| White | Relics | soulbound | choir chord + screen-edge shimmer (not a flash) |

Bag colour is the best item's colour. Max 8 items per bag; extra items make
a second bag.

**Soulbound eligibility** (only matters in co-op): you qualify for an
enemy's soulbound roll if you dealt **>= 8%** of its max HP or healed /
shielded someone who did (Herald, Punk). Each qualifying player rolls
separately (no stealing, no "leech"). RotMG uses a per-item damage threshold;
the community reports thresholds are now low; 8% is our pick.

**Soulbound items** can go in the stash and move between your own heroes,
but cannot be given to another player. Tradeable items (brown/pink tier
gear, snacks, pet food) can be gifted in co-op (v2) via a 2-step handshake.
There is no currency trading and no gold.

### 5.4 Stat potions
- One potion per stat: Life Potion (+10 LIFE), Focus Potion (+10 FOC), and
  Power, Guard, Swift, Knack, Vigor, Wits potions (+2 each). **Greater**
  versions from tier-4/5 bosses give double.
- A potion above the class cap is refused ("already maxed") and stays in the
  bag, so it can be stashed for another hero.
- Drinking requires level 20 (like RotMG) to keep early runs fast, except
  the tutorial's single gifted Life Potion.
- Expected ~40 potions to max a hero: from table 4.2 the six small stats need
  about 6 x 14 / 2 = 42 points of potions, and LIFE/FOC ~ 10 each; with Greater
  potions in tier 4-5, real count is about 35-45. Expected drops: about 1 per
  tier-3 dungeon clear, 2 per tier-4, 3 per tier-5, so maxing takes roughly
  15-20 dungeon clears (~3-5 hours), not weeks.

### 5.5 Drop tables
Rolls are independent; `p` is per kill per qualifying player.

| Source | Brown | Pink | Purple | Cyan | Blue (potion) | Gold | White |
|---|---|---|---|---|---|---|---|
| Common, tier 1 | 0.10 | 0.01 | - | - | - | - | - |
| Common, tier 3 | 0.12 | 0.04 | 0.01 | - | - | - | - |
| Elite (any tier) | 0.50 | 0.15 | 0.06 x tier | - | 0.01 x tier | - | 0.001 |
| Wild Event boss | 1.0 | 0.6 | 0.5 | 0.05 x tier | 0.35 | 0.25 (egg 0.15) | 0.01 |
| Dungeon boss tier 1 | 1.0 | 1.0 | 0.3 | - | 0.3 | 0.2 | 0.01 |
| Dungeon boss tier 3 | 1.0 | 1.0 | 0.8 | 0.15 | 1.0 (1 potion) | 0.3 | 0.02 |
| Dungeon boss tier 5 | 1.0 | 1.0 | 1.0 | 0.6 | 1.0 (3 potions, 1 Greater) | 0.5 | 0.05 |
| Treasure room chest | 1.0 | 1.0 | 0.5 x tier | 0.1 x (tier-2) | 0.2 | - | 0.005 |

**Pity timer (anti-frustration):** each 10 dungeon boss kills without a White
bag add +0.01 to that boss's White chance, reset on a White. Shown openly in
the bestiary ("Relic luck +3%"). No hidden rates: every drop rate in this table
is shown in the in-game bestiary once you have killed that enemy once.

---

## 6. XP, levels, fame, soft permadeath

### 6.1 XP and levels
- `xpToNext(L) = 40 * L + 10 * L^2` (L1 needs 50, L10 needs 1,400, L19 needs
  4,370). Total to level 20: **32,300 XP**.
- XP per kill = enemy max HP / 10 (shared fully with everyone within 12 tiles
  in co-op, not split: RotMG does the same and it is what makes group play
  feel good).
- Kill XP is capped to 10% of `xpToNext` per kill below level 20 (stops
  boss-jumping a level 1 hero to 8 in one hit).

### 6.2 Fame
- Before 20: base fame = `floor(totalXP / 1000)`. After 20: +1 fame per 200 XP.
- On fall **or voluntary Retirement** the hero's fame is banked into
  **account fame** with bonuses (each +x% of base):
  - First Steps +10% (cleared any dungeon), Delver +5% per distinct dungeon
    type cleared, Boss Friend +10% (every boss of worlds 1-3 beaten), Potion
    Sipper +10% (drank 20 potions), Well Fed +5% (reached max in 2 stats),
    Careful +20% (only on Retirement, i.e. the hero never fell), Pet Pal +5%
    (pet level 30).
- **Retire with honour** at the Hall of Heroes in the Lantern: any hero level
  20+ can retire for its full fame plus Careful +20%. This makes the fame
  system work without anyone needing to die.
- Account fame is never spent and never lost. It unlocks (milestones):
  stash pages (every 500), class skins/recolours, pet yard upgrades, Lantern
  decorations, hub map flair (companion doc) and the Hardcore toggle (1,000).

### 6.3 Soft permadeath ("the Fall")
When HP hits 0, the hero **Falls**: a 2 s firefly animation carries them to
the Lantern's Hall of Heroes, where a small 24x24 lantern-headstone with the
hero's name, class, level and fame appears.

| Kept | Lost |
|---|---|
| Account fame, all fame bonuses | That hero (level, stats, drunk potions) |
| Class unlocks, skins, bestiary, medals | Equipped gear and backpack |
| **Legacy Stash** contents (16 slots, +8 per 500 fame, max 64) | Snacks / tea carried |
| Your pet (it was waiting at home) | Any loot on the ground |
| One **Keepsake**: the equipped item you marked (1 per hero) goes to the stash | |
| **Rekindle**: a new hero of the same class may start at level `min(10, floor(fallenLevel / 2))` | |

Modes (chosen per hero at creation, cannot change later):
- **Lantern (default):** as above.
- **Picnic:** no Fall at all; at 0 HP you return to the Lantern with
  everything, but fame earned x0.5 and Picnic runs go to a separate
  leaderboard. For young players or anyone who hates loss.
- **Hardcore** (unlock at 1,000 fame): no Keepsake, no Rekindle, fame x1.5.

This is the owner's call (see decision 1 in the companion doc), but the
default keeps the RotMG tension (your great gear is at stake) without the
cruelty (you never lose your account's progress).

---

## 7. The Lantern (safe hub, Nexus-like)

A small hand-authored map, 40 x 30 tiles, no combat. Everything one walk
away (the RotMG Nexus works because it is compact):

- **Wilds portals** (3 shards in single-player v1: "Wilds of Bramble",
  "Wilds of Fog", "Wilds of Ember": each is a fresh seed; in co-op they are
  shared instances, max 8 per Wilds shard).
- **Fountain**: full heal and Focus refill.
- **Legacy Stash** chest (16+ slots) and **Hall of Heroes** (headstones,
  Retire, character select).
- **Pet Yard** gate.
- **Quartermaster**: hands out snacks and tea for free (1 of each per 2
  minutes, up to 6, so nothing is ever bought), and a cosmetics board
  unlocked by account fame.
- **Bounty board**: 3 daily bounties (section 9).
- **Daily Maze gate**: today's seeded dungeon, with leaderboard and ghosts.
- **Notice stone**: patch notes, class tips, the bestiary.
- **Exit gate to Pixeltown** (returns to the hub map; companion doc).

---

## 8. The Wilds (open danger field)

### 8.1 Layout
- One Wilds shard is a seeded island **192 x 192 tiles** (4,608 px square).
- Generated from two seeded value-noise layers (elevation and moisture, the
  same family of noise the cave's `ugNoise2` uses) plus a radial falloff,
  giving an island with five concentric **bands**:

| Band | Distance from centre (fraction of radius) | Tier | Biome look |
|---|---|---|---|
| Shore | 0.85-1.0 | 1 | sand, shallow water, crab-like critters |
| Bramble lowlands | 0.65-0.85 | 1-2 | grass, hedges, flowers (Biome 1) |
| Fogfen | 0.45-0.65 | 2-3 | marsh, reeds, mist (Biome 2) |
| Ember highlands | 0.25-0.45 | 3-4 | ash, basalt, embers (Biome 3) |
| Maze Heart | 0-0.25 | 4-5 | hedge-maze walls generated in-field (recursive backtracker, 3-tile corridors) around the Mazewright's dais |

You always spawn on the shore. The difficulty gradient means "where you
stand is how hard it is", exactly the RotMG feel.

### 8.2 Roaming groups
- The map is divided into 16x16 tile spawn cells. Each band has a target
  density (Shore 1 group per 2 cells, Heart 1 per cell); a spawner tops up
  groups in cells that are **8-20 tiles outside the camera**, max 60 live
  enemies per shard in single-player.
- A group = 1 leader + 2-5 members of the band's set, wandering as a flock
  (leader random-walks, members keep 1-3 tiles offset). Elites: 8% of
  groups have a crowned leader.
- **Quest arrow**: a red arrow on the screen edge points to the "quest
  monster": the highest-HP living elite or event boss whose tier is <= your
  level/4 + 1. A small gold arrow points to active events.

### 8.3 Wild Events
- Every 3-5 minutes (seeded schedule) an event spawns in a band at or below
  the strongest present hero's band. Announcement: a banner and a chat-style
  line from the Mazewright ("I grew a Hollowstump just for you!").
- An event is a set-piece (pre-drawn 15x15 tile stamp placed on the map) +
  an event boss + minions. Events live until killed.
- Killed event bosses drop their tier's loot (table 5.5) and a **dungeon
  portal** (45 s, then it fades; in co-op all nearby can enter).
- **Wilds closing:** after 6 events are cleared in a shard, the Mazewright
  shouts "Enough!" and 60 s later every hero in the shard is pulled into
  **Mazewright's Keep** (tier 5). Players in dungeons are not pulled (same
  rule RotMG uses for Oryx's Castle). The shard then resets with a new seed.

---

## 9. Quests and bounties
- **Quest arrow** (above) is the moment-to-moment quest.
- **Daily bounties** (3 per UTC day, deterministic from the date, same for
  everyone): "Pop 30 Puffcaps", "Clear the Sunken Lantern without using a
  Snack", "Find a secret room". Reward: account fame 10-40 and a pet treat.
  Missing days carries **no** penalty; there is no streak.
- **Hero quests** (per hero, permanent): beat each world's dungeon boss once
  (+50 fame on banking each).
- **Class quests**: reach level 5/10/20 with a class to unlock the next one
  (table 4.1), and "beat N different bosses with this class" for class
  medals (bronze 3, silver 6, gold 9). Medals show on the hub map node.

---

## 10. Dungeons and the procedural generator

### 10.1 Two dungeon shapes
1. **Warren** (room graph, Isaac/Gungeon-like) for tiers 1-3: rooms on a
   grid, doors, a key, a locked treasure room, a secret room, a boss room.
2. **Labyrinth** (true maze) for tiers 2-5 and the Keep: a braided maze of
   3-tile corridors with chambers punched in. This is the "maze running" core
   the owner asked for: corridors are narrow enough that wall-gap and sweep
   patterns are scary, and the boss chamber is at the farthest point.

Every dungeon also gets a **Mixed** variant (tier 3+): warren rooms whose
connecting corridors are mini-labyrinths.

### 10.2 Determinism and RNG
- RNG: **mulberry32** (32-bit integer state, bit-identical in every JS engine)
  seeded by **cyrb53**/xmur3 hash of a string seed, e.g.
  `"daily:2026-11-19:sunken-lantern"` or `"run:<heroId>:<n>"`. (The town's
  `worldHash` uses `Math.sin`, which is fine for cosmetics but not
  guaranteed bit-identical across engines, so the generator must not use it.)
- Generator module `mm-gen.js` is **pure** (no Phaser, no DOM, no
  `Math.random`), exported for Node and the browser. Output is a plain JSON
  object `{seed, tier, kind, w, h, tiles: Uint8Array-as-base64, rooms[],
  doors[], keys[], spawns[], chests[], secret, boss, start}`.
- Contract tests (Node, no browser): same seed+tier gives byte-identical
  JSON; a fixed seed hashes to a stored snapshot; invariants (10.6) hold for
  1,000 seeds per tier.

### 10.3 Warren algorithm (room graph)
Room cell = **17 x 13 tiles** (408 x 312 px; just over one desktop screen, so
the camera scrolls a little), room grid **9 x 8** cells.

1. `target = 5 + floor(2.4 * tier) + rng.int(0, 2)` rooms (tier 1: 7-9,
   tier 3: 12-14).
2. Start cell (4, 4). BFS queue expansion (Isaac's method): for each cell
   popped, for each of 4 neighbours: skip if filled, skip if the neighbour
   would have more than 1 filled neighbour, skip if `target` reached, skip
   on a 50% coin; otherwise fill and enqueue. Cells that add nothing are
   **dead ends**.
3. If the count is short, re-enqueue the start and continue; if still short
   after 50 restarts, regenerate with `seed + "#retry" + n`.
4. **Boss** = the dead end with the largest BFS distance from start (ties
   broken by rng). Must not be adjacent to start.
5. **Treasure** = another dead end, distance >= 3. Its door is **locked**.
6. **Key** placed in a random non-dead-end room whose shortest path from the
   start does not pass the locked door (always true since treasure is a
   dead end). Tier 3+: the key is carried by that room's elite.
7. **Secret room**: an empty cell with >= 3 filled neighbours, not adjacent to
   boss or treasure (relax to >= 2 after 300 tries, to >= 1 after 600).
   Its walls are "cracked" (slightly different tile) and break after 3 hits
   from any player shot. Contents: a chest (Blue/Purple roll), a healing
   fountain, or a pet egg.
8. **Loops (Gungeon-style):** for tier 2+, with probability `0.12 * tier`
   per adjacent pair of filled cells that are not connected, add a door,
   max `tier` extra doors. Loops give you a way round dangerous rooms.
9. **Room templates:** each filled cell picks a template by shape (normal,
   dead end, boss, treasure, start) from the biome's pool without repeats
   (Gungeon does this too). Templates are ASCII 17x13 grids:
   `#` wall, `.` floor, `o` pillar, `~` water (slows 40%), `^` spikes (5 dmg
   per 0.5 s, ignores i-frames: no), `E` enemy group slot, `e` single enemy,
   `T` turret, `C` chest, `D` door slot (N/E/S/W middle). Starting pools:
   12 normal, 4 dead-end, 2 boss arenas (25x19, takes the cell plus padding),
   1 treasure, 1 start, per biome.
10. **Doors** close when you enter a room with living enemies and open when
    the room is clear (Isaac rule), so fights are contained. Cleared rooms
    stay open. A door is 3 tiles wide.
11. **Encounters:** each `E` slot gets a group from the biome's table with
    budget `4 + 2 * tier` "threat points" (Wanderer 1, Chaser 2, Turret 2,
    Orbiter 2, Spawner 3, elite x3).

### 10.4 Labyrinth algorithm (true maze)
1. Maze lattice `cw x ch` cells: tier 2: 10x10, tier 3: 12x12, tier 4: 14x14,
   tier 5 (Keep): 16x16. Each cell is **4 tiles** (3 floor + 1 wall), so a
   12x12 maze is 49 x 49 tiles.
2. Carve a perfect maze with **recursive backtracker** (iterative stack,
   neighbour order shuffled by rng).
3. **Braid**: remove `0.25 + 0.05 * tier` of dead ends by knocking one wall
   (choose the wall that joins to the cell with the most walls). Loops make
   it a chase maze, not a tree you must backtrack.
4. **Chambers**: punch `2 + tier` rectangles of 2x2 or 3x2 cells (9-13 tiles
   wide) into open rooms, keeping their perimeter doors where corridors hit.
   Chambers get encounter budgets like warren rooms.
5. Start = cell (0, 0) corner; **Boss chamber** = 4x4 cells carved around
   the cell with max BFS distance; **Treasure** = a dead end left by braiding
   with distance >= 60% of max, behind a locked gate; **Key** in a chamber.
6. **Secret**: one dead end becomes a fake wall leading to a 2x2 secret
   chamber (cracked wall, 3 hits).
7. **Maze pressure** (the run feeling): from tier 3, a slow "Hedge Tide"
   (a wall of thorny tiles) creeps from the start cell along the BFS path at
   0.6 tps once 90 s have passed since the first room; it deals 10/s and
   blocks shots. You can always out-walk it (4 tps minimum), but it stops
   you from dawdling. Disabled in Picnic mode and the Daily Maze's "Stroll"
   variant.
8. Torches: corridors are dimmed to 70% light with a 6-tile radius light
   around each hero (a Phaser render texture mask, or simply a radial
   gradient overlay, cheap). Reduce-motion keeps it static.

### 10.5 Biomes and tilesets
| Biome (tier) | Floor | Walls | Hazard | Palette |
|---|---|---|---|---|
| Bramble (1-2) | grass, path | hedges, logs | thorn patch (^) | greens, warm yellow |
| Fogfen (2-3) | moss, boardwalk | reeds, stone | deep water (~) | teal, grey-green, lilac |
| Ember Crypts (3-4) | basalt, bone tile | crypt brick | ember vents (timed ^) | charcoal, orange, red |
| Maze Heart (5) | marble | living hedge-stone | Hedge Tide | white, gold, purple |

Each tileset is 16 tiles of 24x24 generated procedurally at load (seeded
canvas drawing, the same technique as `ugDrawTile` in `underground.js`),
plus 4-bit auto-tiling for walls (16 variants). No downloaded tile art needed.

### 10.6 Generator invariants (unit tests)
- Every floor tile reachable from start (flood fill), ignoring locked doors
  only for treasure.
- Boss is the max-distance room; start not adjacent to boss.
- Key reachable without passing a locked door.
- Exactly 1 boss, 1 treasure, 1 key, <= 1 secret, room count in range.
- No enemy slot within 6 tiles of start.
- Door widths 3 tiles; no corridor narrower than 3 tiles.
- Same input gives identical output (stringify + hash).
- Generation time < 15 ms per dungeon on a mid phone (bench in Node: < 3 ms).

### 10.7 Dungeon list (first three worlds + Keep)
| Dungeon | Shape | Tier | Biome | Drops from | Boss |
|---|---|---|---|---|---|
| Burrow Warren | Warren | 1 | Bramble | Old Hollowstump (event), Bramble elites 5% | Queen Burrowmole |
| Sunken Lantern | Labyrinth | 2-3 | Fogfen | The Drowned Bell (event) | Gloomtoad Matriarch |
| Bonefire Catacombs | Mixed | 3-4 | Ember | Pyre Colossus (event) | The Lantern Lich |
| Mazewright's Keep | Labyrinth 16x16 | 5 | Maze Heart | Wilds closing | The Mazewright |

---

## 11. Bestiary for the first three biomes

HP is tier-1 base x tier multiplier already applied (the number you see).
"Dmg" is per bullet before Guard. Sprite sources: **S** = existing species
strip recolour/tint, **F** = `game/assets/flora-fauna/svg/<id>.svg`
rasterised to 24x24 (98 species exist), **P** = procedural shape,
**AI** = AI-generated or hand-pixeled (new art).

### 11.1 Biome 1: Bramble (tier 1-2)
| Enemy | Archetype | Sprite idea | HP | Dmg | Pattern |
|---|---|---|---|---|---|
| Puffcap | Wanderer | P: red-capped mushroom, 3 frames squash | 50 | 8 | `ring` 6 pellets, speed 4, every 2.0 s |
| Bramble Beetle | Chaser | F: beetle svg, green tint | 90 | 12 | `shotgun` 3 shots, 30 deg, speed 6 at 3 tiles |
| Sprout Slime | Wanderer, splits into 2 minis (25 HP) | P: green blob | 70 | 8 | `aimedBurst` 1 shot every 1.6 s, speed 5 |
| Thistle Archer | Orbiter | S: `punks` frame tinted green with a leaf hat overlay | 80 | 10 | `aimedBurst` 3 shots, 18 deg, 2 bursts, speed 7 |
| Moth Swarm | Spawner | F: moth svg x3 in a cluster | 160 | 0 | spawns 2 Moths (20 HP, contact 8) every 6 s |
| **Old Hollowstump** (event) | Boss | AI: 48x48 tree stump with glowing hollow eyes | 4,000 | 12 | P1 `ring` 16 spd 4 rotate 11 + `aimedBurst` 3; P2 adds `spiral` 2 arms step 13; P3 `flower` 20 petals 5 + spawns 2 Beetles every 10 s |
| **Queen Burrowmole** (dungeon) | Boss | AI: 48x48 mole in a crown | 2,400 | 14 | P1 burrows (invulnerable 1 s, re-emerges near you, telegraphed by dirt mound 0.8 s) then `ring` 12; P2 `sweep` 100 deg 80 deg/s + `aimedBurst`; P3 `wallGap` gap 3 tiles every 3 s + `ring` 10 |

### 11.2 Biome 2: Fogfen (tier 2-3)
| Enemy | Archetype | Sprite idea | HP | Dmg | Pattern |
|---|---|---|---|---|---|
| Bog Hopper | Chaser (hops 2 tiles every 1.2 s) | S: `coolcats_frogs` tinted dark | 260 | 18 | landing `ring` 8, speed 5 |
| Will-o-Mote | Orbiter (phases: untargetable 1 s every 4 s) | P: soft glow orb | 200 | 16 | `homing` 2 motes, turn 90, home 1.2 s |
| Reed Witch | Turret-ish (teleports between reeds) | S: `punkettes` tinted purple | 380 | 20 | `spiral` 2 arms step 17 for 2 s, then rest 2 s |
| Leech Coil | Wanderer in water only | F: leech or eel svg | 300 | 18 | `wave` bullets x3, aimed, speed 5 |
| Croaker Totem | Turret | P: stacked stone frogs | 450 | 20 | `ring` 14 speed 4 rotate 7 every 1.4 s |
| **The Drowned Bell** (event) | Boss | AI: 48x48 mossy bell in a pool | 9,000 | 26 | P1 "toll": `ring` 24 speed 3 then `ring` 24 speed 5 0.3 s later; P2 `wallGap` from 2 sides alternating, gap 3 tiles; P3 `orbitThenRelease` 10 + `homing` 4 |
| **Gloomtoad Matriarch** (dungeon) | Boss | AI: 72x48 giant toad | 8,000 | 24 | P1 tongue `sweep` 90 deg + spawns 2 Bog Hoppers; P2 `flower` 24 petals 6 + leaps (shadow telegraph 1 s, lands with `ring` 16); P3 rain of `rain` columns 6 + `aimedBurst` 5 shots 30 deg |

### 11.3 Biome 3: Ember Crypts (tier 3-4)
| Enemy | Archetype | Sprite idea | HP | Dmg | Pattern |
|---|---|---|---|---|---|
| Ash Shambler | Chaser (slow 2.2 tps, tanky) | S: `zombies` strip greyed | 900 | 40 | `shotgun` 5 shots 50 deg speed 7 |
| Candle Ghost | Orbiter, passes walls | S: `halloweenpunks` at 60% alpha | 600 | 35 | `ring` 10 speed 5 + `aimedBurst` 2 |
| Cinder Bat | Swarm wanderer (fast 4 tps) | F: bat svg, orange tint | 350 | 30 | contact only + 1 aimed shot on death |
| Grave Knight | Elite brute | S: `halloweenpunks` frame with helmet overlay | 1,800 | 50 | `sweep` 140 deg 120 deg/s, shards speed 8 |
| Skull Brazier | Turret | P: skull bowl with flame | 1,000 | 38 | `spiral` 4 arms step 9 every 0.08 s, piercing every 4th bullet |
| **Pyre Colossus** (event) | Boss | AI: 72x72 stone giant with a fire core | 18,000 | 55 | P1 `ring` 20 + `aimedBurst` 5 lead 0.5; P2 floor ember vents (telegraph 0.8 s) + `sweep` 160 deg; P3 `spiral` 6 arms + `wallGap` gap 2.5, enrage-safe gap |
| **The Lantern Lich** (dungeon) | Boss | AI: 48x72 robed skeleton holding a lantern | 16,000 | 50 | P1 `homing` 6 + 4 orbiting candles (each 800 HP, `ring` 8); P2 lights out: arena dark except 4-tile hero light, `flower` 28 petals 7 (bullets glow); P3 `spiral` 3 arms + `orbitThenRelease` 12 + summons 2 Candle Ghosts every 12 s |

### 11.4 Final: The Mazewright (tier 5, 45,000 HP)
Four phases (75/50/25): P1 hedge walls slide (moving `wallGap`), P2 the arena
rotates its layout (labyrinth chamber re-carves every 20 s with a 1.5 s
outline telegraph), P3 copies of earlier bosses' signature patterns (one at a
time), P4 everything slower but denser (`flower` + `spiral` + `homing`), with a
3 s breathing gap every 8 s. Drops: guaranteed Cyan, 3 potions incl. Greater,
5% White, and a map Comet Key for the hub (companion doc).

---

## 12. Pets
- Pets come from **Pet Eggs** (Gold bags, secret rooms). Each egg hatches
  into a species from `game/species-registry.json` (98 species with SVGs):
  the egg's biome picks the registry `biome` field (Bramble -> terrestrial
  forest/grassland, Fogfen -> wetland/freshwater, Ember -> desert/alpine).
- Rarity: Common, Uncommon, Rare, Legendary, Mythic (registry `rarity` biases
  the roll). Abilities: 1 at Common, 2 at Uncommon, 3 at Legendary.
- Abilities (level 1..100, cap by rarity 30/50/70/90/100):
  | Ability | Effect at level L |
  |---|---|
  | Mend | heal `5 + L` HP every `max(3, 10 - L/12)` s |
  | Focus Mend | `3 + L/3` FOC every `max(3, 10 - L/12)` s |
  | Zap | `10 + 2L` dmg to the nearest enemy every 3 s |
  | Decoy | every 20 s, a 2 s decoy at the pet that draws aggro |
  | Fetch | auto-picks brown/pink items into a 4-slot pet pouch |
- **Feeding**: drag any item to the Pet Yard bowl; it is consumed for feed
  power (T0 gear 5, +5 per tier, potions 60, Relics 200). This gives junk loot
  a purpose. Fusion (two max pets -> next rarity) costs no currency.
- The pet follows at 1.5 tiles, cannot be hurt, sits out when you Fall.
- Pets are cosmetic + mild utility; never mandatory.

---

## 13. Co-op and networking (Firebase)

### 13.1 v1: single-player + shared social (ships first)
- Everything simulated locally. Nothing per-frame goes to Firebase.
- Writes (rate-limited, validated by `net.js`-style `clean*` helpers):
  - `/mm/leaderboard/daily/{yyyymmdd}/{localId}` = `{name, cls, timeMs,
    score, ver}` once per completed Daily Maze (transaction keeps the best).
  - `/mm/ghosts/daily/{yyyymmdd}/{localId}` = compressed path: samples at
    **5 Hz**, each `[dx, dy]` int8 deltas in quarter tiles, base64; max 3 KB
    (a 10-minute run at 5 Hz x 2 bytes = 6 KB, so keep the best 5 min or drop
    to 2.5 Hz). Read top 3 ghosts and draw them as translucent outlines.
  - `/mm/fame/{localId}` = `{name, fame}` (all-time board, updated on bank).
- Validation in Firebase rules: shape, string lengths, numbers in range,
  `timeMs >= 60000` (a dungeon cannot be cleared in under a minute),
  `newData` only if `!data.exists() || newData.child('timeMs').val() <
  data.child('timeMs').val()`. Honest caveat: with open rules and no auth,
  leaderboards are cheatable; label them "friends board" and accept it, or
  add Firebase Anonymous Auth (companion doc decision 3).

### 13.2 v2: co-op party (2-4 players)
- Party created at the Lantern (invite code of 5 letters). Path
  `/mm/rooms/{roomId}`; each room has `seed`, `host`, `members`.
- **Deterministic shared world**: all clients generate the same dungeon from
  `seed`. Enemies are simulated by the **host** (lowest join time); the host
  broadcasts at **5 Hz** an enemy snapshot `{id, x, y, hp, state}` for the
  <= 40 enemies near players (quantised to 1/4 tile, ~6 bytes each).
- **Bullets are never sent individually.** The host sends pattern-start
  events `{e: enemyId, p: patternId, t: hostTime, s: seed}` (~20 B); each
  client simulates the bullets deterministically from the pattern + seed.
  Dodging is checked locally against your own hit box (client authority over
  your own damage taken, like most co-op shooters; fair for friends).
- Players publish `{x, y, aim, firing, hp, cls, skin}` at **8 Hz** (only when
  changed, 0.25 tile / 5 deg deadband) and interpolate others with 120 ms delay.
- Player shots on other clients are cosmetic, generated from `firing` + aim.
  Damage is reported by each shooter: `{e: enemyId, d: totalDamage}` batched
  every 250 ms; the host clamps each report to `1.3 x` the shooter's
  theoretical max DPS x 0.25 s and applies it.
- Rate limits (client token bucket + rules): <= 10 writes/s per player,
  <= 2 KB/s per player. Bandwidth estimate (4 players): each client downloads
  3 x 8 Hz x 40 B + 5 Hz x 240 B ~ 2.2 KB/s ~ 8 MB/hour; fine for a few
  friends on the free tier (10 GB/month), but it is the reason to keep the
  room cap at 4 and rate low.
- Loot: each qualifying player rolls soulbound bags locally from the shared
  seed + their id (no network); public bags are created by the host.
- Disconnect: host migration to the next member; if the host leaves mid-boss,
  the boss resets to its last phase start.

---

## 14. Performance budget and collision

Target: **>= 40 fps on a mid phone (e.g. a 2020 mid Android)**, 60 on desktop.

| Budget | Value |
|---|---|
| Frame (phone) | 25 ms total; sim <= 6 ms, render <= 12 ms |
| Enemy bullets live | design 250, hard cap 400 (pool 512) |
| Player bullets live | 120 per player |
| Enemies live (Wilds) | 60, (dungeon room) 24 |
| Draw calls | bullets in one texture atlas (all bullet sprites in one 128x128 canvas texture) so Phaser batches them |
| Texture memory | < 24 MB |
| Page JS (Mad Maze page, excluding Phaser CDN) | < 250 KB unminified |

Implementation rules:
- Bullets are **not** Phaser physics bodies. Keep them in a struct-of-arrays
  pool (`Float32Array` x, y, vx, vy, life, radius, dmg; `Uint8Array` kind,
  flags) and draw with a pool of pre-created `Phaser.GameObjects.Image`
  (setVisible false when dead) or a `Blitter` (fastest; one Bob per bullet).
  Benchmark both in slice M1-S3.
- **Spatial hash** with 48 px cells (2 tiles) for enemies, rebuilt every
  step (60 enemies: trivial). Player bullets query the 3x3 cells around them
  (circle vs circle). Enemy bullets test only against the player(s) (1-4
  circles, no hash needed) using squared distance.
- Wall collision for bullets: tile lookup at the bullet centre each step
  (`tiles[(y/24|0) * w + (x/24|0)]`), bullet dies on wall. For players,
  axis-separated AABB-vs-tile movement (the cave's slide-along-walls approach).
- Off-screen culling: only bullets within camera + 4 tiles are drawn;
  all are simulated.
- No per-frame allocations in the hot loop (no closures, no new arrays).
- Particles: max 150, disabled with reduce-motion except hit sparks.

---

## 15. Art list

| Asset | Size | Count | Source |
|---|---|---|---|
| Hero classes | 24x24, 9 skins each | 8 | existing strips (`coolcats`, `pudgypenguins`, `doge`, `punks`, `apes`, `zombies`, `aliens`, `coolcats_ninjas`) |
| Weapon held overlays | 12x12 | 8 | procedural (canvas) |
| Player bullets | 8x8 / 12x12 | 8 | procedural, one per weapon type |
| Enemy bullets | 8x8, 12x12, 6x14 | 6 kinds x 6 colours | procedural, baked into one atlas |
| Common enemies | 24x24 | 15 (5 per biome) | mixed: 5 strip tints (S), 4 registry SVGs (F), 6 procedural (P) |
| Elite crown overlay | 10x6 | 1 | procedural |
| Event + dungeon bosses | 48x48 to 72x72 | 7 incl. Mazewright | **AI-generated or hand-pixeled**, then palette-reduced to 16 colours and checked for the 24px-collection look |
| Bags | 24x24 | 7 colours | one procedural sack, recoloured |
| Chests, keys, doors, cracked walls | 24x24 | ~10 | procedural |
| Portals | 24x48, 4 frames | 5 (one per dungeon + Wilds) | procedural swirl |
| Tilesets | 24x24 | 4 biomes x 16 + 16 autotile walls | procedural (seeded canvas) |
| Set-piece stamps | 15x15 tiles | 7 | hand-authored ASCII, uses tilesets |
| Pets | 24x24 | from registry | `assets/flora-fauna/svg` rasterised; 2-frame bob procedural |
| UI icons (stats, slots, abilities) | 16x16 | ~30 | emoji first (like the town), procedural later |
| Lantern hub props | 24x24 | ~12 | procedural + reuse town drawing code style |

Licence check: the repo is CC0 (`LICENSE.md`) but the sprite strips are
pixel versions of third-party NFT collections; the town already uses them. For
Mad Maze we use them only as player avatars and tinted enemies, with
original names. If the owner wants zero ambiguity, the AI-generated bosses
are the place to start making fully original art.

---

## 16. Sound (WebAudio synth, no audio files)

Reuse the town's synth approach (short oscillator blips, see the SFX module
in `main.js`), moved into `game/shared/sfx.js`.

| Event | Synth recipe | Limit |
|---|---|---|
| Player shot | square 880 -> 520 Hz, 35 ms, vol 0.05, per-class pitch | max 12/s (skip extras) |
| Enemy hit | noise burst 20 ms, bandpass 2 kHz | max 16/s |
| Enemy death | triangle 440 -> 110 Hz, 120 ms | |
| Player hurt | saw 220 -> 110 Hz, 90 ms + low thud | |
| Ability | per class: e.g. Frostcaller sine 1320 + 1760 shimmer 200 ms | |
| Bag drop | per colour (table 5.3) | |
| Level up | arpeggio C-E-G-C 4 x 70 ms | |
| Boss phase | 2 drum hits (noise + 60 Hz sine) | |
| Recall | rising sine sweep 1 s | |

Music: one procedural loop per biome (chord pad like the town's ambient
music plus a 4-note bass ostinato and a hi-hat), 96 BPM Bramble, 84 Fogfen,
112 Ember, 128 boss. Off by default like the town's music, SFX on.

---

## 17. Accessibility
- **Reduce motion** (defaults to OS setting, shared with the town): no screen
  shake, no flashes, blink replaced by tint, static low-HP border.
- **Bullet visibility**: "High-contrast bullets" adds a 2 px black outline and
  white core to every enemy bullet; enemy bullets always warm/magenta,
  player bullets always cool/translucent. A colour-blind palette preset
  (blue/orange) is checked with a simulator.
- **Hit-box dot**: draws the 4 px hit circle on the hero (default on for touch).
- **Aim assist** (default on for touch, off for mouse).
- **Gentle speed**: game speed 80% (Picnic and Daily "Stroll" boards only).
- **Autofire** toggle (I / settings).
- Key remapping; text size small/medium/large; all menus keyboard and
  controller navigable; screen-reader labels on DOM HUD buttons.
- No flashing above 3 Hz anywhere (WCAG 2.3.1).

---

## 18. Ethics
- No real money anywhere. No loot boxes, no gacha, no premium currency.
- No gambling mechanics. (The town's existing Polyroll booth is a wager game
  with stars; it is not part of Mad Maze and the companion doc flags it.)
- No energy timers, no "come back or lose it" streaks; dailies are optional
  bonuses that never punish absence.
- All drop rates visible in the bestiary; a pity bump on the rarest bag.
- Soft permadeath by default; Picnic mode for anyone who wants no loss.
- Leaderboards opt-in, names filtered with the town's existing filter.
- Session nudge: after 60 minutes in a run, a gentle "take a break?" card
  at the next Lantern visit (dismissable, off in settings).

---

## 19. Code layout (fits the real codebase)

```
game/games/madmaze/index.html   page: Phaser CDN + shared + mm-*.js
game/games/madmaze/mm-data.js   classes, weapons, enemies, bosses, drop tables (plain objects)
game/games/madmaze/mm-gen.js    pure dungeon + Wilds generator (Node-testable)
game/games/madmaze/mm-patterns.js  pure bullet patterns + boss timelines (Node-testable)
game/games/madmaze/mm-sim.js    pure combat sim: bullet pool, spatial hash, stats math (Node-testable)
game/games/madmaze/mm-scenes.js Phaser scenes: Boot, Lantern, Wilds, Dungeon, HUD
game/games/madmaze/mm-net.js    leaderboards/ghosts (v1), party (v2); same cleaning style as net.js
game/shared/profile.js          shared hub profile (companion doc)
game/shared/sfx.js, input.js, rng.js, sprites.js
game/tests/mm-*.test.js         Node unit tests + Playwright page tests
```

Pure modules use a tiny UMD footer (`if (typeof module !== 'undefined')
module.exports = X; else window.X = X;`) so Node tests need no browser.
The page exposes `window.__mm` (the Phaser game) only when the URL has
`?test=1`, replacing the town's route-rewrite trick. Mad Maze tests run with
`?offline=1`, which stubs `mm-net.js`, so they never touch the live
Firebase database (unlike the town's tests, which join presence).

Reused from the existing code: species strip loading and frame picking
(`SPECIES` list), the profanity/slur filter, the `clean*`/`clampNum`
sanitising style from `net.js`, joystick dead-zone constants, gamepad polling,
the procedural texture technique of `underground.js`, the SFX/music synth,
and `species-registry.json` for pets.

---

## 20. Sources and what could not be verified

Sources consulted (2026-11-19):
- Wikipedia, "Realm of the Mad God": Nexus, 85-player realms, difficulty
  rising from beach to godlands, quest and event bosses, realm closing to
  Oryx's Castle, 19 classes / 3 armour / 6 weapon types, 10 bag tiers with
  purple+ soulbound, stat potions after level 20 (+1, Greater +2), fame from
  XP after 20 at 2000:1 banked on death, pets with 3 abilities and 5 rarities,
  criticism ("selfish, least social MMO", little new-player explanation).
  https://en.wikipedia.org/wiki/Realm_of_the_Mad_God
- RealmEye wiki (search snippets; direct fetch was blocked): loot bag order
  and soulbound visibility, landmarks/events, realm closing two-minute rule,
  pets (ability unlock at Uncommon/Legendary, Heal/Magic Heal, Electric,
  Decoy, feed power), ability items. https://www.realmeye.com/wiki/loot-containers ,
  https://realmeye.com/wiki/landmarks-and-setpieces , https://www.realmeye.com/wiki/pets/52
- RealmEye forum: "Guide to loot and drop rates" (damage thresholds checked
  before the roll, independent rolls, min/max potions)
  https://www.realmeye.com/forum/t/guide-to-loot-and-drop-rates/60740 ; "What
  are your problems with RotMG" (grind ~200 potions, no i-frames, exploitable
  instant nexus, item bloat, gatekeeping)
  https://www.realmeye.com/forum/t/what-are-your-problems-with-rotmg-as-of-current/75460?page=2
- Stat formulas from community calculators/wikis via search (ATT 0.5+ATT/50,
  DEX 1.5+6.5*DEX/75, SPD 4+5.6*SPD/75, DEF flat per hit): realmeye "dex vs
  att", rpgstash.com stats article. Steam reviews/discussions on bots and
  pay-to-win.
- Boris the Brave, "Dungeon Generation in Binding of Isaac" (9x8 grid,
  `random(2)+5+level*2.6` rooms, BFS with the one-neighbour rule, dead ends,
  boss at farthest dead end, secret room with >= 3 neighbours, relaxation at
  300/600 tries) https://www.boristhebrave.com/2020/09/12/dungeon-generation-in-binding-of-isaac/
- Boris the Brave, "Dungeon Generation in Enter the Gungeon" (flow graphs,
  loops, room pools without repeats, secret rooms at dead ends, reward rooms
  deep or behind loops) https://www.boristhebrave.com/2019/07/28/dungeon-generation-in-enter-the-gungeon/
- Nuclear Throne: only community reconstructions of a walker/"floor maker"
  carve (no official source found); we did not adopt it beyond the Wilds
  noise approach.
- Hades door-reward previews and skull "harder, better reward" doors
  (Shacknews, Prima Games); Vampire Survivors level-up choice of 3-4 items and
  escalating 30-minute run (fan guides, low confidence).
- Bullet pattern design: Sparen's Danmaku Design guide (fixed/random/aimed
  angles, blind spots), a 2026 browser bullet-hell tutorial (12-bullet ring
  every 1.2 s, spiral every 0.35 s, as starting numbers).

Not verified / our own choices: RotMG's exact defence minimum (we use 25%),
exact current drop rates (DECA does not publish them), exact projectile
ranges/lifetimes per weapon, pet ability numbers above Uncommon, portal
lifetimes. All numbers in sections 3-6 are design values to be tuned in
playtests, not copies of RotMG data.
