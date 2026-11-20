# Realm Unified: one game from Realm + Mad Maze

Goal: Realm (arena) and Mad Maze (dungeons) become ONE game in the style of Realm of the Mad God: a large scrolling top-down overworld, zones that get harder toward the centre, scattered monsters, loot bags, world events, portals into our Mad Maze dungeons, a Nexus menu and phone play.
Nothing existing is removed: the arena waves, dungeons, shop, shards, items and levels all stay and plug into the new world. Original art only (`ART-HANDOFF.md`). The Firebase DB is live: this design adds no new writes, and all tests use `ADMIN*` bots.

Generator: `game/shared/mm-overworld.js` (global `MMOverworld`, pure and seeded via `MMRng`, no unseeded randomness). Tests: `game/tests/shared-mm-overworld.test.js`.

## 1. World

- 256 x 256 tiles of 32 px (8192 px square). Typed arrays, row-major `y * w + x`.
- Island coastline with deep water all around (warped radial distance, noise-wobbled coast). Centre is the Godlands.
- Spawn: a seeded point on the shore ring (zone 0, ~0.74-0.84 of the coast radius), cleared sand, with a 20-tile monster-free halo.
- A road (dirt in zones 0-1, stone in 2-3) winds from spawn to the centre; water on its path becomes a bridge. Lakes (deep core, shallow rim) and two rivers (with fords) break up the land. A connectivity pass carves fords or cuts through cliffs and ruin walls so everything the player needs is reachable.
- One world seed per realm instance (co-op: the host's seed in the room record, everyone calls `generate(seed)` locally; the world is never sent over the wire).

### Zone table (warped radial distance `dw`, 0 = centre, 1 = nominal coast)

| Zone | id | dw band | Terrain ids | Enemy tier | Difficulty (mean) |
|---|---|---|---|---|---|
| Shore | 0 | 0.68 - 0.90 | sand, wet_sand, grass, tall_grass, flower_meadow, dirt_road, (shallow_water at sea edge) | 0 | ~0.05 |
| Midlands | 1 | 0.40 - 0.68 | grass, tall_grass, dry_grass, dark_grass, flower_meadow, gravel, dirt_road | 1 | ~0.34 |
| Highlands | 2 | 0.20 - 0.40 | highland_rock, gravel, snow, dry_grass, stone_road, cliffs (solid) | 2 | ~0.72 |
| Godlands | 3 | 0 - 0.20 | godland_ash, cracked_stone, blood_ruins, lava_rock, dark_grass, stone_road | 3 | ~0.94 |
| Void | 255 | deep water, open sea | deep_water (solid) | none | n/a |

Other terrain ids: `deep_water` (0, solid), `shallow_water` (walkable, slows 25 percent in the engine).
Terrain ids (`MMOverworld.TERRAIN`) are exactly the Codex art ids: deep_water, shallow_water, sand, wet_sand, grass, tall_grass, dirt_road, flower_meadow, highland_rock, gravel, dry_grass, snow, stone_road, cracked_stone, godland_ash, blood_ruins, dark_grass, lava_rock. `solid` is a separate flag array (deep water, highland cliffs, ruin and tower walls).
`difficultyAt(x, y)` is a smooth 0..1 (smoothstep of `1 - dw/0.9`, bilinear): it scales enemy HP, bullet speed and drop quality, so the zone border is a ramp, not a cliff.

## 2. Enemies and tiers

Existing types stay (`RM_ENEMIES`: `spiral` Whirler, `aimed` Sniper, `ring` Burster, plus wanderer drifters); the zone picks the skin and stats via `CREATURE_TIERS[type][zone]` (art ids from `mm-art.js`/delivered packs):

| Type \ Zone | 0 Shore | 1 Midlands | 2 Highlands | 3 Godlands |
|---|---|---|---|---|
| spiral | mothling, sprout_mini | moth, cave_bat, sprout | ice_wraith, goblin_shaman, skeleton | shadow_cultist, ember_imp |
| aimed | goblin_scout, sprout | archer, forest_wolf | skeleton_archer, dark_spider, sand_scorpion | dark_spider, skeleton_archer, bone_knight |
| ring | puffcap, slime_green | beetle, slime_blue, swamp_leech | stone_golem, crystal_beetle, slime_red | bone_knight, toxic_serpent, stone_golem |

- `spawnGroups` `{x,y,zone,tier,creature,type,count,difficulty}`: about 170-190 per world (1-3 enemies per group on the shore up to 4-6 in the Godlands), none within 20 tiles of spawn. The engine streams groups in/out by `nearestSpawnGroups(px, py, 22)` and respawns an emptied group after 90-150 s while no player is within 30 tiles.
- Bosses (`bossSites`, 8 per world, one each): zone 1 `forest_warden`, `mire_queen`; zone 2 `bone_colossus`, `storm_harbinger`, `crystal_titan`; zone 3 `dread_knight`, `inferno_wyrm`, `void_oracle`. Each sits on a cleared altar. Stats scale with `difficultyAt`; boss respawn 10 minutes after death (timed event, see section 4).
- Difficulty curve: shore enemies die to 1-2 hits and fire slow singles (a level-1 hero survives); Midlands add rings and aimed triples (target level 5-8); Highlands add dense spirals and mixed groups (level 10-14); Godlands overlap patterns and tough bosses (level 16-20, rare gear). The curve is deliberately steeper than linear in dw so the first third of the trip feels safe.

## 3. Loot bags

- Bag tier by source: tier-0/1 enemy = white bag (shards + common); tier-2 = blue (uncommon/rare chance); tier-3 = purple (rare, epic only through the existing combine rule); boss = gold bag (guaranteed rare+, plus a portal key roll, see section 5). Rarity ids reuse `RM_RARITIES`; bag icons reuse the existing loot-bag art.
- Drops come from `MMItems` seeded by `(worldSeed, spawnGroup id, kill counter)` so they are reproducible and tested.
- Co-op: bags are per-player (soulbound-style): each damager in the last 10 s gets their own bag, visible only to them (others see a faint ghost so they know it is not theirs). Shards are rolled per player. Boss kills: every contributor (>= 10 percent of damage) gets a gold bag.
- Lifetime: 60 s for white, 90 s blue, 120 s purple, 180 s gold; blinks for the last 10 s. Backpack cap stays 24; overflow sells for shards on pickup (existing rule).

## 4. Events and shrines

- `event_site` structures host timed events. A scheduler (seeded by `worldSeed` + 5-minute slot index, so all co-op players agree) picks a site, shows a map ping and a HUD banner 20 s ahead, then runs it:
  - Boss raid: a `bossSites`-style boss with a telegraphed attack (ground rings 1 s before impact, red lines for aimed volleys); defeat spawns 1-2 portal keys and a gold bag.
  - Horde siege: three waves of tier+1 enemies around the site.
  - Beacon defence: hold a circle for 45 s.
- `shrine` structures: step in and pay shards (or take a risk) for a timed buff or a curse-for-reward; once per 3 minutes per player.
- Other structures (decor + loot, no scripting): `camp` (small patrol, one chest), `ruin` (walled floors, mini-ambush), `tower` (ranged garrison on the roof, bag on clear), `graveyard` (night-only skeleton spawns).

## 5. Dungeon portals

- `portalSites` (4 per world, one per biome): `warren` and `bramble` in the Midlands, `meadow` and `crypt` in the Highlands. A site holds a dormant portal (`portal_warren`, `portal_bramble`, `portal_meadow`, `portal_crypt` art ids, plus a closed variant).
- A portal opens when a boss or event drops a portal key of that biome (also 3 percent chance from any tier-2+ kill); it stays open 120 s and shows on the minimap. Co-op: the opener's party (up to 4) may enter.
- Entering stores `returnTo = {x, y, hp, worldSeed}` in memory and in the new save key, runs a Mad Maze dungeon (`games/mad-maze/dungeon.js`, `shared/mm-rooms.js`, `shared/mm-dungeon-state.js`) with the portal's biome and a seed derived from `(worldSeed, portal id, open counter)`, with difficulty = `difficultyAt(portal)`.
- Leaving (finished, dead via Survivor's Cache rule, or Nexus > Return) puts the player on the same tile, with 2 s of invulnerability. Dungeon rewards flow through the existing dungeon/shard code; the overworld sees only a result object.

## 6. Nexus menu, death, restart

- Nexus button (top-right, and `Esc`/`P`): pauses the local view (the world keeps running in co-op) and offers **Restart run** (new seed, fresh spawn, keeps shards/items/level), **Return to spawn** (teleport to `spawnPoint`, 5 s cooldown, not in combat within 3 s), **Settings** (volume, reduced motion, joystick side, aim assist, left-hand mode) and **Leave** (back to the hub; world state saved).
- Permadeath-lite: on death the existing Survivor's Cache applies (no shard loss; the player receives an item instead), then the player respawns at spawn. The current realm world and enemy state are kept; only the player's position resets.

## 7. Phone UX

- Virtual joystick on the left (move), right stick aims and auto-fires while held (reusing `mm-pad.js`/`mm-aim.js` aim assist), two ability buttons above the right stick (class ability, dodge), Nexus button top-right.
- Minimap (top-left, 96 px, tap to expand): a 1 px-per-4-tiles terrain image drawn once from `terrain`/`zone`, plus dots for you, party, open portals, active events, bosses. Controls and UI keep a 44 px minimum hit target and respect safe areas; render budget 60 fps on mid-range phones, chunk draw limit of 3 x 3 chunks around the camera (32 x 32 tiles per chunk).

## 8. Save keys (additive only)

- Existing `pixeltown-save-v1` and the existing realm save (shards, items, level, best wave) are untouched in format.
- NEW key `pixeltown-realm-v1`: `{v, seed, version (generator VERSION), pos:{x,y}, discovered: <bitmap of explored 8x8 tiles, base64>, events:{lastSlot}, bosses:{id: respawnAtMs}, portals:{id:{openUntil,biome}}, returnTo, stats:{kills, bossKills, distance}}`. Anything missing is defaulted so older/blank saves load. If `version` differs from `MMOverworld.VERSION`, the world is regenerated from `seed` and `pos` is clamped to the nearest walkable tile.
- No backend change: co-op shares only `seed` and positions through the existing realm room code.

## 9. Slice plan

| Slice | Deliverable | Notes |
|---|---|---|
| U1 | Generator (done here): `mm-overworld.js` + node test | zones, structures, spawn groups, verify() |
| U2 | Engine: Phaser/canvas scene, camera follow, chunked tile render, collisions via `isSolid`, minimap | Code-drawn fallback tiles (flat palette colour per terrain id, simple prop shapes) so the game runs with no art; Codex terrain/prop/portal art drops in by id as it lands, with the fallback kept for missing ids |
| U3 | Enemies, bosses, loot bags, events, shrines | Map spawn groups to `RM_ENEMIES` types and art creature ids; seeded drops; event scheduler |
| U4 | Portals into Mad Maze dungeons and back | `returnTo`, biome/seed handoff, result object, co-op party entry |
| U5 | Nexus, restart, settings, phone controls, polish | save key `pixeltown-realm-v1`, Survivor's Cache respawn, tutorial banner |

Each slice ships behind a link from the hub, keeps the existing Realm and Mad Maze entry points working, and must pass `node game/tests/run-all.js` before merge.
