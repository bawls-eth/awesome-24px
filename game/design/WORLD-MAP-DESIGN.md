# Pixeltown hub map: design document and build plan

Status: design only, nothing here is built yet. Author: lead game designer
pass, 2026-11-19. Companion doc: `REALM-DESIGN.md` (Mad Maze, the
Realm-style bullet-hell game).

## 0. The short version

- **Pixeltown stays the name.** Pixeltown becomes the **hub**: a
  Super-Mario-World-style overworld map, the entry point to the whole site,
  that every game hangs off. It keeps the Pixeltown name, icon, PWA name and
  the `pixeltown-*` storage prefix.
- **The current cozy multiplayer town** (everything in `game/main.js`:
  villagers, workbench, home plot, museum, mailbox, weeds, sparkle, live
  presence and chat) gets **a new name** and becomes an **adjacent town**: a
  gate node one short road off the hub's starting crossroads. You walk to it,
  enter it, and leave it back to the map. It keeps its own save
  (`pixeltown-save-v1`, unchanged) and shares the hub profile.
  - Name options: **Hearthvale** (recommended: warm, cozy, reads as a
    village, no collision with Mad Maze's "Lantern" hub), **Cloverbrook**,
    **Puddlewick**.
- **Mad Maze** (the Realm-style game) is the first and biggest new full game,
  its own world on the map.
- The cave, fishing, bug-off, turnips and the K.K.-style concert become
  **full games**, each its own world or node cluster.
- **Architecture: separate static pages per game** (`game/games/<id>/`)
  sharing `game/shared/*.js`, with the hub as a tiny vanilla-canvas page
  (`game/hub/`) that loads in well under a second. Reasons in section 7.2.

---

## 1. The hub screen

### 1.1 What it looks like
- A top-down path map in our 24px style: grass, paths of 1-tile dots,
  rivers, bridges, hills, and node markers, like SMW's overworld. One
  **world** fits one screen: **40 x 22 tiles (960 x 528 px)**, scaled by an
  integer factor to fit the window (2x on a 1920 monitor, 1x or 1.5x
  nearest-neighbour on phones; portrait phones show a 22 x 40 rotated layout
  of the same world, authored separately in the same JSON).
- The player's villager (their profile species + frame, the same 24x24
  strip frame they use in Hearthvale) stands on a node.
- Top bar (DOM, not canvas): world name, medal count, Tokens, a ⚙️ menu
  (sound, motion, profile, backup/restore), and a 🔑 count.
- Bottom card: the selected node's name, its medals (🥉🥈🥇), best result,
  and a big **Play** / **Enter** button (also Enter/Space/A).

### 1.2 Lightweight by design (it is the site's front door)
| Budget | Target |
|---|---|
| Libraries | **none**: no Phaser (~1 MB minified from CDN), no Firebase, no Three.js |
| Hub JS + CSS | < 60 KB uncompressed (`hub.js`, `map-data.js`, shared `profile.js`, `sfx.js`, `input.js`) |
| Images | the player's one species strip (216x24) + one 128x128 procedural tile atlas drawn at load |
| First paint | < 1.0 s on a 4G phone; interactive < 1.5 s |
| Frame | 60 fps, a single `<canvas>` with `imageSmoothingEnabled = false` |
| Network after load | zero, unless the online-count widget (optional, lazy) is on |

Rendering: draw the world's tile layer once to an offscreen canvas, then each
frame blit it + the walking sprite + node pulses + path-reveal animation.
When a node is selected, add `<link rel="prefetch">` for that game's page
and scripts so the next page opens fast (the Phaser CDN file gets cached
by the first game played and is shared by all Phaser games).

### 1.3 Controls on the hub
- Arrows / WASD / D-pad / left stick: move to the neighbouring node in that
  direction along an unlocked path (SMW style; the villager walks the path).
- Tap or click a node: walk there along unlocked paths (BFS over the node
  graph), with a dotted preview line.
- Enter / Space / A / tapping the bottom card: play the node.
- Esc / B: open the menu. Tab / Y: world list (jump to any visited world's
  start node, like SMW's warp via star roads once unlocked).
- L / R (bumpers) or swipe on the world title: previous / next unlocked world.

### 1.4 The walking character
- Speed **6 tiles/s** along the path polyline (paths are authored as point
  lists between nodes; corners rounded with a 0.3-tile Catmull-Rom).
- Animation (all procedural, like the town's walk-hop): 2 px hop at 8 Hz,
  sprite flipped by horizontal direction, a 1 px squash on stopping, a tiny
  blink (darken 2 px rows) every 3-5 s when idle, a "wave" (rotate +/-10
  degrees twice) after 8 s idle. Reduce-motion: no hop, glide only.
- Water segments: the villager sits in a 24x12 rowboat sprite. Ladders and
  bridges: same walk, different sound (wood clunk vs grass step).
- Entering a node: the villager hops up 6 px, an **iris wipe** closes on the
  node (350 ms, a black circle mask; reduce-motion: 200 ms fade), then
  `location.href` to the game. Returning: the map loads with an iris opening
  on the node just played, then plays any unlock animation.

---

## 2. Worlds and nodes

### 2.1 Node types
| Marker | Type | Meaning |
|---|---|---|
| Yellow dot (12x12) | Level | one exit |
| Red dot | Level with a **secret exit** | a second, hidden way to clear it (SMW used red dots for exactly this) |
| Building icon (24x24) | **Full game** | enters a whole game (Hearthvale, Mad Maze Lantern, Deepdelve, ...) |
| Gate (24x24) | **Adjacent town gate** | Hearthvale's gate: a walkable road leading off the map edge |
| Castle (24x36) | World boss | clearing it opens the next world (with a little crumble animation) |
| Snack stand (24x24) | Shop/rest | free daily treat, cosmetic unlocks with Tokens (SMB3's Toad House idea) |
| Keyhole lock (24x24) | Lock | needs a 🔑 Map Key earned from a secret exit |
| Wandering marker (24x24) | **Roamer** | a Bramble gang that moves 1 node after each node you play (SMB3's Hammer Bros); step onto it for a 1-room Mad Maze skirmish; reward: a 🔑 or 20 Tokens |
| Comet (24x24) | Comet Trail warp | the secret world network (SMW's Star Road) |

Node colours turn from outline to filled when cleared; medals show as up to
three tiny pips under the node.

### 2.2 The worlds
World 0 is the hub crossroads; worlds connect through castles and gates. The
first release ships W0, W1 and W2; others appear as "coming soon" signs (a
fenced path with a construction sign) until built.

| World | Theme | Nodes (type) | Gate to next |
|---|---|---|---|
| **W0 Pixeltown Crossroads** | The hub plaza: fountain, signpost, a road to each world | Start (Pixeltown Square), **Hearthvale Gate** (adjacent town), Snack Stand, Signpost tutorials (3 levels: "First Steps", "Sparkle Dash", "Gate Practice"), roads to W1-W5 | always open |
| **W1 Hearthvale Meadows** | The cozy town's surroundings | **Hearthvale** (full game), Sparkle Dash (level), Weed Sweep (level), Turnip Stall (level, red dot), Museum Hall (level), Castle: "Mayor's Statue" challenge | clearing 4 W1 nodes opens W2 road |
| **W2 Mad Maze Wilds** | Brambles to embers, maze hedges | **The Lantern** (Mad Maze full game), Burrow Warren (level, red dot: secret room), Sunken Lantern (level, red dot), Bonefire Catacombs (level), Daily Maze (level, re-playable), Castle: Mazewright's Keep | Keep clear opens Comet Trail 1 |
| **W3 Deep Cave** | Mine shafts, ore veins, crystal caverns | **Deepdelve** (full game), Depth -8 Checkpoint, Iron Age (craft iron pick), Lava Lake (level), Crystal Core (castle: Rock Wyrm) | 8 W2+W3 medals |
| **W4 Lakeside** | Ponds, river, sea, ice | **Lakeside Angler** (full game), West Pond, East Pond, River Run, Sea Pier, Ice Hole (winter), Castle: "Old Whiskers" boss fish | 12 medals |
| **W5 Festival Fields** | Lanterns, tents, stage | **Bug Safari**, **Campfire Jam** (rhythm), **Stalk Market** (trading sim), Festival Finale (castle: a medley run) | 16 medals |
| **W6 Comet Trail** (secret) | Night sky, star path | 5 challenge nodes: one hard variant per world (Hearthvale Night, Mazewright Remix, Deepdelve Hardcore, Legendary Fish, Jam Expert) | reached only via comets |

### 2.3 Path unlocking rules
- The map is a graph: `nodes[{id, type, x, y, world, game, params, exits}]`
  and `paths[{from, to, via: [[x,y]...], unlock: {node, exit}}]`.
- A path is visible and walkable when its `unlock` condition is met:
  `{node: "w2-burrow", exit: "normal"}` or `exit: "secret"`, or a lock
  `{key: true}` (spends a 🔑 once, permanently), or a gate
  `{medals: 8}`.
- When a result comes back and opens new paths, the map plays a **path
  reveal**: dots appear one by one along the polyline every 60 ms with a
  soft blip, then the new node pops in (scale 0 -> 1.2 -> 1, 250 ms).
  Reduce-motion: all dots appear at once with a single chime.
- Already-cleared nodes can always be replayed. Nothing ever re-locks.
- Full-game nodes are **open as soon as their world is reachable**; their
  levels around them unlock from progress made inside the game.

### 2.4 Secret exits and keys
Each world has 1-2 red-dot levels. A secret exit is a real achievement
inside the game, reported back as `exit: "secret"`:

| Node | Normal exit | Secret exit |
|---|---|---|
| Turnip Stall (W1) | sell a bundle for profit | sell at >= 3x buy price (a spike day) |
| Burrow Warren (W2) | beat Queen Burrowmole | find the secret room and open its chest |
| Sunken Lantern (W2) | beat Gloomtoad | clear it before the Hedge Tide reaches the halfway mark |
| Lava Lake (W3) | reach the far shore | bridge it with 0 deaths using only cobble |
| River Run (W4) | catch 5 river fish | catch the golden river trout |
| Bug Safari (W5) | Bronze on any arena | catch a Moonwing at night arena |

Secret exits give a **🔑 Map Key** (opens a keyhole lock somewhere,
usually a Snack Stand shortcut or a bonus node) or a **Comet** (opens the
path to a W6 node). 12 secret exits across W1-W5 in the first full version.

### 2.5 Progress: medals, Tokens, completion
- Each level node has **3 medals**: 🥉 clear, 🥈 a goal (time, score, no
  damage), 🥇 mastery. Full-game nodes have medals for in-game milestones
  (e.g. Mad Maze: 🥉 reach level 10, 🥈 beat all three world-1..3 bosses,
  🥇 Retire a maxed hero).
- **Medal gates** open later worlds (8 / 12 / 16 medals), so players can
  pick what they enjoy instead of being forced through one game.
- **Tokens 🪙** are the cross-game currency (section 8.3).
- The hub shows `Completion %` = (medals + secret exits + comets) / total.
  At 100% the Pixeltown fountain turns gold and the villager gets a crown
  overlay usable in every game.

### 2.6 Level-complete flow (SMW-style)
1. The game finishes and writes a **result** (section 8.4), then navigates to
   `game/hub/?from=<nodeId>`.
2. The hub opens the iris on that node and shows a result card: medals
   earned (each pip flies into the top bar with a chime), Tokens, best time.
3. If a new path opened, the camera pans to it (300 ms), plays the reveal,
   and pans back. If a castle was cleared, the castle crumbles (4 frames).
4. The profile is saved (no prompt; the SMW save prompt is replaced by
   always-on autosave).

---

## 3. Hearthvale: the adjacent town

### 3.1 Where it sits
- On W0's map, the **Hearthvale Gate** node sits one short road (5 tiles)
  east of Pixeltown Square: a wooden arch with a little banner "Hearthvale".
  W1's world (Hearthvale Meadows) is drawn around the town on the map, so
  the town reads as "a real place next to the hub".
- It is the only multiplayer node at launch (live presence, chat, emotes,
  blocks). A tiny counter on the gate shows "🧑‍🌾 3 here now" if the lazy
  online-count widget is enabled (reads the existing presence count; only
  loaded after the hub is interactive).

### 3.2 Arrival transition
1. On the hub, walking onto the gate and pressing Enter plays the iris and
   goes to `game/index.html?from=hub` (the town stays at its current URL;
   see 6.2 and 7.1).
2. The town's join screen reads the hub profile: name, species and frame are
   prefilled and the card says "Arriving from Pixeltown". One tap on
   **Enter Hearthvale** joins (the join step must stay because presence is
   capped at 10 players and joining connects to Firebase).
3. The player spawns at a new **Pixeltown Road** signpost at the town's
   south-west edge (a fixed spawn point instead of the usual one, only when
   `from=hub`).

### 3.3 Leave transition
- Two ways: walk onto the **Pixeltown Road** signpost and press E/A, or tap
  the new **🗺️ Pixeltown** button in the HUD (next to 🗺️ Map; label "Hub").
- A small confirm ("Head back to Pixeltown?"), then: write the town's normal
  save (it already autosaves), write a result
  `{node: "w0-hearthvale", exit: "visit", stats: {...}}` and navigate to
  `game/hub/?from=w0-hearthvale`. Presence is removed by the existing
  `onDisconnect` (page unload).
- Old behaviour stays: the four external portal doors in the Arcade District
  are untouched.

### 3.4 Save and profile sharing
- The town keeps **`pixeltown-save-v1`** as its own save section. Nothing in
  it is renamed or moved. Old saves load exactly as today.
- On first hub load, if no profile exists, `profile.js` **seeds** the
  profile from `pixeltown-save-v1` (name, species, frame, sfxMuted,
  reduceMotion, musicEnabled), read-only. The town is never written by the hub.
- From then on, the town reads name/species/frame from the profile when its
  own save lacks them, and writes changes (outfit shop) to both (one extra
  `profile.patch({species, frame})` line next to its `writeSave`).
- Town medals (reported to the hub): 🥉 visit, 🥈 finish a Today board,
  🥇 a 7-day "Creature of Habit" (already an achievement). These come from
  existing achievements, so the town needs only a tiny reporting hook.

---

## 4. What a "full game" means for each existing minigame

A full game = its own page, its own save key, 30+ minutes of content with
progression, a clear "finished" state, 3+ medals and a secret exit, and its
own test file. The town keeps its light versions (they stay as cozy
activities in Hearthvale); the full games are the deep versions.

### 4.1 Deepdelve (from the voxel cave in `underground.js`)
Today: a 25x25 column, 8-deep seeded voxel cave with timed mining, 9-slot
hotbar, torches, swimming, flight, health, local only.
Full game:
- **World**: seeded, chunked **16x16x16 chunks**, world 8 x 8 chunks
  wide (128 x 128 columns) and 4 chunks deep (64 layers), generated lazily
  around the player (view distance 3 chunks on phones, 5 on desktop).
  Layers: surface (-0..-4 grass/dirt/trees), stone (-4..-24, coal/iron),
  deep (-24..-48, gold, lava pockets, water caves), crystal (-48..-64,
  crystal ore, the Core).
- **Meshing**: replace one instanced mesh per block type (fine for 25x25x8)
  with per-chunk face-culled meshes in a texture atlas (greedy meshing as a
  later slice). Target 45 fps on phones at view 3.
- **Survival mode** (creative stays as an option): hunger-free (cozy), but
  HP 20, fall damage, darkness (light level 0-15 from torches/sky), and cave
  critters: Glow Slimes (2 HP, hop at you), Cave Bats, Rock Crabs at -24,
  each a 24px sprite on a camera-facing billboard.
- **Crafting**: a workbench block and furnace; 4 tool tiers (wood, stone,
  iron, gold-crystal) that mine faster (x1, x2, x3, x5) and are needed for
  harder ores (iron needs stone pick, crystal needs iron). 24 recipes
  (tools, torches, ladders, rails, doors, glass, chests, beds as respawn).
- **Goals** (map levels): reach -8, craft an iron pick, cross Lava Lake,
  find a buried Fossil vault (ties to the Hearthvale museum: fossils found
  here can be donated in town), beat the **Rock Wyrm** at the Crystal Core
  (a segmented worm boss in a large cavern; 3 phases, rocks thrown as
  physics projectiles).
- **Saves**: chunk diffs (only changed blocks) in **IndexedDB**
  (`pixeltown-cave` DB), because localStorage's ~5 MB limit is too small for
  a big edited world; seed + inventory + tool tier in `pixeltown-cave-v1`.
  The town's existing `caveSeed`/`caveInv` keys are migrated by copying
  (never deleted).
- Medals: 🥉 reach -8, 🥈 iron tools, 🥇 beat the Rock Wyrm. Secret: Lava
  Lake bridged with cobble only.

### 4.2 Lakeside Angler (from fishing + Angler's Journal + aquarium)
Today: timing-based bite at two ponds, 12 species by pond/time/season/shadow,
daily tournament, home aquarium.
Full game:
- **Spots** (map levels): West Pond, East Pond, River Run, Sea Pier, Ice
  Hole (winter only, real month), Mangrove (secret).
- **Bestiary of 48 fish** (the 12 existing species carried over, plus 36
  new; the registry's 5 `aquatic_fish` and the marine invertebrates feed
  some of them). Each has: spot, time window, season, weather (rain
  boosts), size range, rarity 1-5, a behaviour type.
- **Reel minigame**: a vertical tension bar (Stardew-style catch zone
  idea): fish icon moves by behaviour (calm, darter, sinker, zigzag,
  boss); you keep the catch zone (size by rod: 28-44% of the bar) on it by
  holding a button (zone rises at 120%/s, falls at 160%/s). Catch meter
  fills 25%/s while on target, drains 15%/s off target. Phone: hold
  anywhere. Accessibility: "Calm reel" option widens the zone by 30%.
- **Gear**: 4 rods, 6 lures, 3 bait types (crafted from Hearthvale goods:
  bugs become bait, a nice cross-game link), a tackle box.
- **Boss fish** (castle and spot bosses): Old Whiskers (catfish, 3 phases,
  line-snap risk shown as a red tension bar), the Pier Kraken (octopus,
  pulls you sideways), the Ice Queen Pike. Each is a 30-60 s reel duel.
- **Aquarium**: the existing 3-slot home tank in Hearthvale keeps working
  and is fed by the Angler's catches (read from the shared profile summary).
- Tournaments: daily seeded "biggest catch" board (reuses the existing
  Firebase tournament transaction idea, new path `/angler/tournament`).
- Medals: 🥉 24 species, 🥈 all boss fish, 🥇 48 species. Secret: golden
  river trout.

### 4.3 Bug Safari (from the Daily Bug-Off)
Today: 2-hour daily window, 8 extra bugs, Bronze/Silver/Gold at 5/10/15.
Full game:
- **Arenas** (8): Meadow, Orchard, Pond Edge, Night Garden, Rainy Field,
  Desert Dunes, Mountain Pass, Moonlit Glade. Each a 90-second run in a
  20x14 tile field.
- **40 bugs** with behaviours (flutter, dart, hide-in-flowers, swarm,
  burrow, glow-at-night), the registry's 8 insects and 4 arachnids included.
- **Net mechanics**: tap/press to swing (0.35 s), a sneak walk (half speed,
  bugs do not flee within 3 tiles), combos (catch within 2 s of the last
  for x1.2, x1.5, x2), a "rare bug" spawn every 30 s.
- Stars per arena 1/2/3 by score; medals: 🥉 all arenas 1 star, 🥈 all 2,
  🥇 all 3. Secret: Moonwing in the Moonlit Glade.
- The daily Bug-Off in Hearthvale stays exactly as now.

### 4.4 Campfire Jam (from K.K. Slider's campfire show)
Today: an evening window where you interact once for 2 stars and an emote.
Full game: a 4-lane **rhythm game**.
- Lanes D F J K (desktop), four touch lanes (phone), D-pad/face buttons.
- Timing judged against `AudioContext.currentTime` (never frame time):
  Perfect +/-45 ms, Great +/-90 ms, Good +/-135 ms, Miss beyond. Hold notes,
  and a calibration screen (tap to a click track, stores an offset in the
  profile).
- **12 songs**, all synthesised with WebAudio from note data (the town's
  chord-pad synth plus drums), 3 difficulties each, 80-160 BPM. Charts are
  JSON (`beats[]`) authored by hand for the first 4 songs, the rest made by
  a seeded chart generator from the melody track (density by difficulty:
  1.0 / 2.0 / 3.5 notes per beat cap) and then hand-fixed.
- Ratings S/A/B/C; medals 🥉 clear 6 songs, 🥈 all on Normal, 🥇 4 S ranks
  on Hard. Secret: full combo on "Midnight Campfire".
- Original busker character (a guitar-playing dog, `doge` strip) instead of
  any real musician; the town's "K.K." show could be renamed to match.

### 4.5 Stalk Market (from the turnip stall)
Today: buy 10 turnips at a price drifting every 4 h, sell at a shop price
that swings every 15 min, no persistence.
Full game: a cozy **trading sim** (skill, not chance: no wager is ever
offered and the patterns can be read).
- A market "week" is 7 in-game days; each day is **2 minutes** of real time
  in "Quick Week" mode, or real days in "Slow Week" mode (pick per save).
- Each week a seeded price **pattern** is chosen from 4 families (random
  drift, steady decline, small spike, big spike), visible only through the
  prices you observe; a "Market Almanac" teaches the shapes as you see them.
- Turnips rot after 7 days; a cellar upgrade keeps them 2 more days.
- Goals: profit targets per week (map levels), a 10-week career,
  a leaderboard of best single-week profit (local first).
- Medals: 🥉 profit in 3 weeks, 🥈 identify all 4 patterns, 🥇 10x a week's
  investment. Secret exit (on the W1 Turnip Stall node): sell at >= 3x.

### 4.6 What stays only in Hearthvale
Workbench, home plot, aquarium display, mailbox, birthdays, Today board,
weeds, scavenger hunt, sparkle chase, museum, fossils, Able-Sisters-style
outfits, building, walkie-talkie, live chat. Sparkle Dash and Weed Sweep
become W1 **levels** that launch the town with a challenge parameter
(`?challenge=sparkle`), reusing existing systems.

**Polyroll** (the stars dice/coin betting booth) is a wager game. It is not
given a map node, medals or Tokens (keeps gambling out of the progression
system). Recommendation: the owner decides whether to keep it as-is in
Hearthvale, reskin it as a no-wager "lucky dice" toy, or retire it.

---

## 5. Data formats

### 5.1 Map data (`game/hub/map-data.js`)
```js
window.PT_MAP = {
  version: 1,
  worlds: [{ id: 'w0', name: 'Pixeltown Crossroads', w: 40, h: 22, tiles: '<base64 or ASCII rows>', start: 'w0-square' }],
  nodes: [
    { id: 'w0-square', world: 'w0', type: 'start', x: 20, y: 11 },
    { id: 'w0-hearthvale', world: 'w0', type: 'gate', x: 25, y: 11,
      href: '../index.html?from=hub', medals: ['visit', 'today', 'habit'] },
    { id: 'w2-lantern', world: 'w2', type: 'game', x: 8, y: 12,
      href: '../games/madmaze/?from=hub&node=w2-lantern', medals: ['lvl10', 'bosses3', 'retire'] },
    { id: 'w2-burrow', world: 'w2', type: 'level', secret: true, x: 14, y: 9,
      href: '../games/madmaze/?from=hub&node=w2-burrow&dungeon=burrow&tier=1' },
  ],
  paths: [
    { from: 'w0-square', to: 'w0-hearthvale', via: [[21, 11], [24, 11]], unlock: null },
    { from: 'w2-lantern', to: 'w2-burrow', via: [[10, 12], [12, 9]], unlock: { node: 'w2-lantern', exit: 'enter' } },
    { from: 'w2-burrow', to: 'w2-secret1', via: [[15, 7]], unlock: { node: 'w2-burrow', exit: 'secret' } },
  ],
};
```
The hub validates the data on load (unique ids, every path endpoint
exists, every node reachable from W0 start if all unlocks are granted) and
a Node test does the same.

### 5.2 The shared profile (`game/shared/profile.js`)
One object in **`pixeltown-profile-v1`** (new key, additive; never touches
`pixeltown-save-v1`):
```js
{
  v: 1,
  id: 'p_8f3k2q',            // random local id, also used for leaderboards
  created: 1763510400000,
  name: 'Ben', species: 'coolcats', frame: 3,
  settings: { sfxMuted: false, music: false, reduceMotion: false, aimAssist: null, textSize: 'm', keymap: {} },
  map: { at: 'w0-square', world: 'w0', seenPaths: ['w0-square>w0-hearthvale'] },
  nodes: { 'w2-burrow': { exits: ['normal'], medals: { b: true, s: false, g: false }, best: { timeMs: 412000 } } },
  keys: 1, keysUsed: ['lock-w1-a'], comets: [],
  tokens: 35,
  unlocks: ['crown', 'skin:coolcats-gold'],
  games: { madmaze: { fame: 120, heroes: 2 }, angler: { species: 14 } },   // small summaries only
}
```
Rules:
- Each game's big data lives in its **own key** (`pixeltown-mm-v1`,
  `pixeltown-cave-v1` + IndexedDB, `pixeltown-angler-v1`,
  `pixeltown-safari-v1`, `pixeltown-jam-v1`, `pixeltown-stalk-v1`); the
  profile only holds summaries.
- `profile.patch(partial)` = read, deep-merge known fields, clamp
  (the `cleanCount` / `clampNum` style from the town), write. Unknown keys
  are kept (forward compatibility).
- Corrupt JSON or wrong types: fall back field by field, never throw (same
  philosophy as the town's `loadSave`).
- Multi-tab safety: listen to the `storage` event and re-read; writes are
  small so last-writer-wins is acceptable.
- Backup/restore: the town's 💾 Backup is extended (or a hub menu entry is
  added) to export **all** `pixeltown-*` keys in one JSON; restore accepts
  both the old single-save file and the new bundle.

### 5.3 Tokens (cross-game currency)
- Earned only by play: first clear of a node 10, each medal 5/10/20,
  secret exit 25, roamer 20, daily first play of any game 5 (no streak).
- Hearthvale's ⭐ stars stay the town's own currency (they also feed the live
  leaderboard). A Hub Post booth in town converts **10 ⭐ -> 1 🪙**, capped
  at 20 🪙 per day, one way, so the town is a legit way to earn Tokens
  without breaking its economy. (Note: I did not fully trace how the town
  persists stars across sessions; the slice M6-S7 must check this first.)
- Spent at Snack Stands on cosmetics (hats, villager recolours, map trails,
  Mad Maze skins, rod colours) and on nothing that gives power.

### 5.4 The result hand-off protocol
A game reports to the hub without the hub running:
```js
PTProfile.reportResult({ node: 'w2-burrow', exit: 'secret', medals: ['b', 's'], best: { timeMs: 401000 }, tokens: 0 });
location.href = '../../hub/?from=w2-burrow';
```
`reportResult` writes into the profile (`nodes[node]`, Tokens) **and**
appends to `pixeltown-results-v1` (a list, max 20) so the hub can animate
what is new; the hub clears the list after showing it. If a game is opened
directly (not from the hub), it still reports; the hub animates it next
time it opens.

---

## 6. Rename plan (Pixeltown stays the hub; the town becomes Hearthvale)

Principle: change only **display strings** of the town; keep every
identifier, key, path and URL.

### 6.1 Strings that change
| File | Now | After |
|---|---|---|
| `game/index.html` `<title>` | `Pixeltown` | `Hearthvale · Pixeltown` |
| `game/index.html` h1 | `🏝️ Pixeltown` | `🏡 Hearthvale` (plus a small "a town in Pixeltown" line) |
| `game/index.html` tagline | "Walk, chat, fish, chop wood, and build — with your friends, live." | same text + "Arriving from Pixeltown" when `from=hub` |
| `game/index.html` join button | `Join Town` | `Enter Hearthvale` |
| `game/index.html` apple-mobile-web-app-title | `Pixeltown` | **unchanged** (the installed app is the Pixeltown hub) |
| `game/main.js` portal confirm (line ~2736) | "This leaves Pixeltown in this tab" | "This leaves Hearthvale in this tab" |
| `game/main.js` restore error (line ~3490) | "valid Pixeltown save file" | **unchanged** (the save is a Pixeltown save) |
| `game/main.js` feedback title (line ~3828) | `Pixeltown feedback` | `Hearthvale feedback` |
| `game/main.js` code comments (lines 167, 991, 2711) | "Pixeltown" | optional, comments only |
| `game/main.js` `GAME_VERSION` / `WHATS_NEW` | `v34-aquarium` | new version + "🗺️ Hearthvale is now a town inside the Pixeltown map" |
| NPC/chat lines that say "town" | "town" | unchanged ("town" is still true) |
| `game/manifest.json` | name/short_name `Pixeltown`, `start_url "./"` | name **unchanged**, `start_url "./hub/"`, description "Pixeltown: a map of tiny games, with the cozy town of Hearthvale" |
| `index.html` (repo root) redirect | `game/` | `game/hub/` (link text "Pixeltown" unchanged) |
| `game/README.md` | "# Pixeltown" describing the town | "# Pixeltown" intro for the hub, then "## Hearthvale (the town)" section holding the current text |
| `game/net.js` header comment | "for Pixeltown" | optional |

### 6.2 What must not change
- `SAVE_KEY = 'pixeltown-save-v1'` and every field inside it.
- `pixeltown-panel-collapsed` and any other existing keys.
- Firebase paths (`/players`, chat, blocks, tournament, scavenger,
  guestbook...). The town stays one shared town for everyone.
- `game/index.html` URL and every DOM id/class the tests use; test helper
  `BASE` stays `game/index.html`.
- The join flow steps the tests click (`#name-input`, `.species-tab`,
  `.avatar-choice`, `#join-btn`): the prefill from the profile only fills
  empty fields, so the tests behave the same.

### 6.3 Save compatibility tests (slice M6-S8)
1. Seed `pixeltown-save-v1` with an old save, open the hub with no profile:
   profile name/species/frame equal the save's; the save string is
   byte-identical after.
2. Open the town from the hub with that save: inventory, achievements,
   home plot all present (existing tests' seeded saves pass unchanged).
3. Corrupt profile (`'x'`, `[1]`, `{name: 5}`): hub and town still load,
   no console errors.

---

## 7. Launcher architecture

### 7.1 Recommendation: one static page per game, shared modules
```
index.html                      repo root: redirect to game/hub/
game/hub/index.html             Pixeltown hub map (vanilla canvas, no libs)
game/hub/hub.js, map-data.js, hub.css
game/index.html + main.js ...   Hearthvale (unchanged location)
game/games/madmaze/             Mad Maze (Phaser)
game/games/deepdelve/           Deepdelve (Three.js; underground.js evolves here)
game/games/angler/              Lakeside Angler (Phaser)
game/games/safari/              Bug Safari (Phaser)
game/games/jam/                 Campfire Jam (canvas or Phaser + WebAudio)
game/games/stalk/               Stalk Market (DOM + canvas, no Phaser needed)
game/shared/profile.js          hub profile + reportResult
game/shared/rng.js              cyrb53 + mulberry32 (deterministic)
game/shared/sfx.js              WebAudio synth (extracted copy, town keeps its own until refactor)
game/shared/input.js            keyboard/gamepad/twin-stick helpers
game/shared/sprites.js          species list + strip loading helpers
game/shared/hubnav.js           "back to Pixeltown" button + iris transition
game/tests/                     existing tests + hub-*.test.js, mm-*.test.js, ...
```

### 7.2 Why separate pages (vs one Phaser page with scenes)
1. **Static hosting fits it natively**: GitHub Pages serves folders; each
   game is a URL you can bookmark, share and deep-link from the map.
2. **The hub must be tiny.** A single Phaser page would make the front door
   download Phaser (and today also Three.js and Firebase). Separate pages let
   the hub load no libraries at all.
3. **`main.js` is 8,400 lines in one global script** with one `TownScene`.
   Turning it into one scene among many would mean refactoring its globals,
   DOM HUD and keyboard handlers; a separate page lets it run untouched.
4. **Parallel work by file ownership**: each agent owns one folder
   (`game/games/<id>/`) and its tests. The only shared files are the small
   `game/shared/*.js`, owned by one slice at a time. Merge conflicts in
   `main.js` (the current bottleneck) disappear for new work.
5. **Failure isolation**: a crash in Deepdelve cannot break Hearthvale or
   the hub; memory is freed between games (Three.js and Phaser never share
   a page).
6. **Testability**: each page has its own Playwright tests with its own
   `?test=1` debug handle, and pure logic modules are Node-tested.
Costs we accept: a page load between hub and game (~0.3-1.5 s; mitigated by
prefetch and the browser cache of CDN libs), state passing via localStorage
(section 5), and duplicated boot code (kept small by `game/shared/`).

### 7.3 Shared-module conventions
- Plain scripts (no bundler, no ES modules needed), each defines one global
  (`window.PTProfile`, `window.PTRng`...) plus the UMD footer for Node.
- Each shared file has a version comment and a Node test; changing its API
  needs a new function name, not a changed signature.
- Libraries only from the CDNs already in use (jsdelivr Phaser 3.80.1,
  Three 0.160.0, Firebase compat 10.12.0), same versions across pages.
- Every new page: `?test=1` exposes `window.__game`; `?offline=1` disables
  networking so tests never touch the live Firebase database.

---

## 8. Build plan: milestones M1..M10

Order follows the owner's priority: **Mad Maze first** (M1-M5), then the
**hub map + Hearthvale rename** (M6), then the **full-game expansions**
(M7-M9), then co-op and the secret world (M10). Each slice is ~40 minutes
for one agent, owns the listed files, and ends with a passing Playwright
(or Node) test containing at least the listed assertions. The "fun gate" is
what a playtester must be able to enjoy at the end of the slice; if it is
not fun, the slice is not done.

Test conventions: Playwright tests load `?test=1&offline=1`, use
`window.__game` and a deterministic seed (`&seed=test`). Node tests
`require()` pure modules. Every test also asserts **no console errors**
(implicit below).

Note on M1-M5 page path: Mad Maze ships before the hub exists. To keep
`main.js` untouched it is reached directly at `game/games/madmaze/` (the
owner can share the link) until M6 adds it to the map.

### M1: Mad Maze combat core (one arena, it already feels good)
| ID | Goal | Files | Assertions (Playwright/Node) | Art | Fun gate |
|---|---|---|---|---|---|
| M1-S1 | Page skeleton, Phaser boot, 20x14 tile test arena, offline/test flags | `games/madmaze/index.html`, `mm-scenes.js` | canvas exists; `__game.scene.isActive('Arena')`; arena tile count = 280 | procedural floor/wall | you see your cat in a room |
| M1-S2 | Shared RNG module | `shared/rng.js`, `tests/rng.test.js` | same seed -> same 1,000 numbers; different seeds differ; values in [0,1) | none | n/a (foundation) |
| M1-S3 | Hero movement (WASD, 8-way, SWF formula), wall sliding | `mm-sim.js`, `mm-scenes.js` | 1 s of D at SWF 10 moves 4.6 tiles +/-0.1; diagonal speed = straight; hero cannot enter a wall tile | hop bob | moving feels snappy |
| M1-S4 | Bullet pool + Slingbow firing with mouse aim (KNK, POW formulas) | `mm-sim.js` | hold 1 s at KNK 10 spawns 3 shots (+/-1); bullet dies after 0.55 s; pool never exceeds 120 | procedural bullets | shooting feels good (sound + recoil) |
| M1-S5 | Enemy archetypes Wanderer + Turret, spatial hash hits, damage numbers | `mm-sim.js`, `mm-data.js` | 4 hits of 16 kill a 60 HP Puffcap; hash finds enemy in 3x3 cells; damage text appears | Puffcap (P) | killing a mushroom is satisfying |
| M1-S6 | Pattern engine: ring, spiral, aimedBurst | `mm-patterns.js`, `tests/mm-patterns.test.js` | ring 12 has 30 deg spacing; spiral angle advances by stepDeg; aimedBurst centre aims at target within 0.5 deg | enemy bullet atlas | dodging a ring is readable |
| M1-S7 | Player HP, Guard formula, i-frames, hit-box dot, fall to "you fell" card | `mm-sim.js`, `mm-scenes.js` | 10 dmg vs GRD 4 deals 6; 2 hits within 0.4 s deal damage once; dot visible when setting on | hurt flash | getting hit is fair and clear |
| M1-S8 | Phone twin-stick + aim assist + controller | `shared/input.js`, `mm-scenes.js` | touch drag on left moves hero; right stick deflection > 0.35 fires; gamepad axes mocked move hero | stick graphics | playable on a phone |
| M1-S9 | Perf bench: 400 bullets + 24 enemies | `tests/mm-perf.test.js` | 400 live bullets for 5 s keeps avg frame < 25 ms on 4x CPU throttle; no GC spikes > 50 ms; pool reuse count > 0 | none | no stutter in the bullet storm |

### M2: Dungeons (generator, rooms, doors, keys, a boss)
| ID | Goal | Files | Assertions | Art | Fun gate |
|---|---|---|---|---|---|
| M2-S1 | Warren generator (BFS rooms, boss, treasure, key) | `mm-gen.js`, `tests/mm-gen.test.js` | identical JSON for same seed; room count in 7-9 at tier 1; boss = max BFS distance for 1,000 seeds | none | n/a |
| M2-S2 | Secret room + loops + invariants | `mm-gen.js` | secret has >= 3 neighbours (or relaxed) in 1,000 seeds; all floor reachable; key reachable without locked door | none | n/a |
| M2-S3 | Room templates (ASCII) + Bramble tileset + autotile | `mm-data.js`, `mm-tiles.js` | 12 normal templates parse to 17x13; every template's doors open on the edge midpoints; wall autotile picks 16 variants | Bramble tiles (procedural) | rooms look like a place |
| M2-S4 | Render a dungeon, camera follow, mini-map (Tab) | `mm-scenes.js` | hero spawns in start room; Tab toggles mini-map showing visited rooms only; leaving a room reveals neighbour on the mini-map | mini-map icons | exploring is inviting |
| M2-S5 | Doors close on entry, open on clear; keys and locked treasure | `mm-scenes.js`, `mm-sim.js` | entering an occupied room closes its doors; killing all opens them; locked door needs key, key count decrements | door, key, chest | "the room is locked, fight!" moment |
| M2-S6 | More patterns: sweep, wallGap, homing, flower, shotgun | `mm-patterns.js` | wallGap gap >= 2.5 tiles for 100 seeds; homing stops turning after homeTime; sweep reverses at arc ends | none | patterns feel distinct |
| M2-S7 | Bramble enemies (5) + group spawner with threat budget | `mm-data.js`, `mm-sim.js` | budget 6 at tier 1 never exceeded; no enemy within 6 tiles of start; Sprout Slime splits into 2 | Bramble enemies (S/F/P) | a fun mix of foes |
| M2-S8 | Queen Burrowmole boss (3 phases, breathing gaps, invuln transitions) | `mm-bosses.js` | phase changes at 66% and 33%; invulnerable 1.5 s at each; bullets cleared on phase change | Burrowmole 48x48 (AI) | first boss is a thrill |
| M2-S9 | Labyrinth generator + Hedge Tide | `mm-gen.js`, `mm-scenes.js` | 12x12 maze is 49x49 tiles; braid removes the target share of dead ends; tide speed 0.6 tps after 90 s | hedge tiles | maze running feels tense |

### M3: Loot, heroes and the Lantern
| ID | Goal | Files | Assertions | Art | Fun gate |
|---|---|---|---|---|---|
| M3-S1 | Item model (slots, tiers, stats) + equip/backpack UI | `mm-items.js`, `mm-hud.js` | equipping T2 bow changes damage range; backpack holds 8; class-wrong weapon refused | item icons (emoji first) | gearing up matters |
| M3-S2 | Bags + drop tables + pickup | `mm-items.js`, `mm-data.js` | 10,000 simulated tier-1 kills give brown rate 0.10 +/-0.01; bag colour = best item; bag despawns at 60 s | 7 bag colours (procedural) | bag pop chime is exciting |
| M3-S3 | XP, levels 1-20, seeded stat gains | `mm-sim.js` | xpToNext(10) = 1,400; total to 20 = 32,300; same hero id gives same stats at L20 | level-up burst | levelling feels fast |
| M3-S4 | Classes: Ranger, Frostcaller, Herald with abilities | `mm-data.js`, `mm-abilities.js` | Yarn Snare roots enemies in 2.5 tiles for 2 s; Blizzard spawns 12 shards; Aura heals 60 + 2*WIT | ability VFX (procedural) | each class plays differently |
| M3-S5 | The Lantern hub map: fountain, stash, Hall of Heroes, portals | `mm-lantern.js` | fountain restores full HP; stash holds 16 and persists across reload; portal enters a dungeon | Lantern props | a cozy safe place |
| M3-S6 | Save `pixeltown-mm-v1` (heroes, stash, fame), corrupt-safe | `mm-save.js`, `tests/mm-save.test.js` | reload keeps hero and stash; corrupt values (4 shapes) load clean; key additive (no other key touched) | none | progress is safe |
| M3-S7 | Soft permadeath: Fall, Keepsake, Rekindle, Picnic/Hardcore modes | `mm-save.js`, `mm-lantern.js` | Fall moves fame to account and deletes the hero; Keepsake item lands in stash; Rekindle level = min(10, floor(L/2)) | headstone sprite | losing hurts a little, not a lot |
| M3-S8 | Stat potions + caps + Retire with honour | `mm-items.js` | potion below L20 refused; above cap refused and kept; Retire banks fame x1.2 | potion icons | potion drops feel big |
| M3-S9 | Unlock classes Riff Punk + Bruiser via class quests | `mm-data.js`, `mm-abilities.js` | Ranger L5 unlocks Punk; Mosh Shield eats bullets in front 120 deg; Ground Pound knockback 2 tiles | none (strips) | new class reward |

### M4: The Wilds, events, more biomes, pets, quests
| ID | Goal | Files | Assertions | Art | Fun gate |
|---|---|---|---|---|---|
| M4-S1 | Wilds island generator (noise + bands) | `mm-gen.js` | 192x192 tiles; spawn on shore band; band of a tile matches distance rule | shore/sand tiles | the island invites exploration |
| M4-S2 | Roaming groups + spawner + density caps | `mm-wilds.js` | live enemies <= 60; spawns only 8-20 tiles off-camera; 8% elite groups over 500 spawns +/-3% | crown overlay | constant action |
| M4-S3 | Quest arrow | `mm-hud.js` | arrow points to highest-HP eligible enemy; updates when it dies; hidden in Lantern | arrow | always know where to go |
| M4-S4 | Wild Events + Old Hollowstump + dungeon portal drop | `mm-wilds.js`, `mm-bosses.js` | event every 3-5 min (seeded); boss drops portal lasting 45 s; announcement banner shown | Hollowstump (AI), portal | "event spawned!" rush |
| M4-S5 | Fogfen biome: 5 enemies + Sunken Lantern labyrinth + Gloomtoad | `mm-data.js`, `mm-bosses.js` | Will-o-Mote untargetable 1 s every 4 s; Gloomtoad leap telegraph 1 s; drops Purple at 0.3+ | Fogfen tiles, enemies, Gloomtoad (AI) | new biome wow |
| M4-S6 | Ember biome: 5 enemies + Bonefire Catacombs (Mixed) + Lantern Lich + Pyre Colossus | `mm-data.js`, `mm-bosses.js` | piercing bullets ignore Guard; Lich phase 2 darkens arena; Colossus vents telegraph 0.8 s | Ember tiles, 2 bosses (AI) | scary in a fun way |
| M4-S7 | Pets: eggs, hatch from registry, follow, Mend/Zap, feeding | `mm-pets.js` | Fogfen egg hatches a wetland/freshwater species; Mend heals 5+L every interval; feeding a T0 item adds 5 power | registry SVG pets | a buddy follows you |
| M4-S8 | Daily bounties + hero/class quests + medals summary | `mm-quests.js` | 3 bounties identical across 2 page loads same day; next day different; completing pays fame | none | a reason to come back (no streak) |
| M4-S9 | Wilds closing -> Mazewright's Keep + Mazewright fight | `mm-wilds.js`, `mm-bosses.js` | 6 events cleared starts 60 s countdown; heroes in dungeons not pulled; Mazewright has 4 phases | Mazewright (AI) | a real finale |

### M5: Mad Maze polish, social, accessibility (shippable v1)
| ID | Goal | Files | Assertions | Art | Fun gate |
|---|---|---|---|---|---|
| M5-S1 | Classes Grave Tender, Trickster, Shadow Paw | `mm-data.js`, `mm-abilities.js` | Siphon heals <= 120; Blink never ends inside a wall (100 tries); Smoke Step makes enemies target last seen spot | none | all 8 classes |
| M5-S2 | Daily Maze (seeded by date) + local best | `mm-daily.js` | same date gives same dungeon on two loads; best time saved; "Stroll" variant has no tide | gate sprite | a shared daily puzzle |
| M5-S3 | Leaderboard + ghosts on Firebase (validated, rate-limited), stubbed offline | `mm-net.js`, `tests/mm-net.test.js` | offline mode makes zero network requests; ghost payload <= 3 KB; submit refuses timeMs < 60,000 | ghost outline | racing friends' ghosts |
| M5-S4 | Accessibility pack: reduce motion, bullet outline, colour-blind preset, gentle speed, remap | `mm-settings.js` | reduce motion disables shake (camera offset stays 0); outline option draws 2 px border; remapped key fires ability | none | readable for everyone |
| M5-S5 | Sound pass + biome music | `shared/sfx.js` | shot sound throttled to 12/s; mute persists; music off by default | none | it sounds juicy |
| M5-S6 | Tutorial: 3-room first maze + Lantern signposts | `mm-tutorial.js` | new profile starts tutorial; finishing gives 1 Life Potion; skip button works | signs | new players get it |
| M5-S7 | Phone pass: landscape card, 40 fps check, button sizes | `tests/mm-phone.test.js` | portrait shows rotate card; buttons >= 48 px; frame avg < 25 ms at 4x throttle with 250 bullets | none | great on a phone |

### M6: The Pixeltown hub map + Hearthvale rename
| ID | Goal | Files | Assertions | Art | Fun gate |
|---|---|---|---|---|---|
| M6-S1 | Shared profile module (seed from town save, patch, clamp, reportResult) | `shared/profile.js`, `tests/profile.test.js` | seeding copies name/species/frame from `pixeltown-save-v1` and leaves it byte-identical; corrupt profile falls back per field; reportResult appends to results (max 20) | none | n/a |
| M6-S2 | Hub page: canvas, tile layer, W0 map, no libraries | `hub/index.html`, `hub.js`, `map-data.js` | no request to phaser/firebase/three; first paint < 1 s on a throttled run; W0 nodes drawn | procedural map tiles | the front door is pretty |
| M6-S3 | Villager walking along paths, keyboard/tap/controller | `hub.js` | arrow right from square walks to the gate in ~0.83 s (5 tiles at 6 tps); tap on a locked node does nothing; facing flips | hop anim (procedural) | walking the map is charming |
| M6-S4 | Node card, Play, iris transition, prefetch | `hub.js`, `shared/hubnav.js` | selecting a node adds a prefetch link; Enter navigates to node href; reduce-motion uses fade | iris mask | entering a game feels like SMW |
| M6-S5 | Path unlocks + reveal animation from results | `hub.js` | result {exit: 'normal'} reveals the path; secret exit reveals the secret path only; reload keeps it revealed with no replay | dot sprites | "a new path!" joy |
| M6-S6 | Hearthvale gate: town arrival (`?from=hub`) and leave button/signpost | `game/index.html`, `main.js` (small hooks), `shared/hubnav.js` | join fields prefilled from profile; spawn at the Pixeltown Road sign; HUD "🗺️ Pixeltown" returns to hub with result | signpost, gate sprite | the town is next door |
| M6-S7 | Rename strings (6.1), manifest start_url, root redirect, README section | `game/index.html`, `main.js`, `manifest.json`, `index.html`, `game/README.md` | town title contains "Hearthvale"; manifest name still "Pixeltown"; root redirects to `game/hub/` | none | n/a |
| M6-S8 | Save compatibility suite (6.3) + all existing tests still pass | `tests/hub-compat.test.js` | old save loads into town unchanged; profile seeded; existing `run-all.js` passes | none | nobody loses anything |
| M6-S9 | Mad Maze on the map: W2 nodes, result reporting from madmaze | `map-data.js`, `games/madmaze/mm-hub.js` | beating Burrow Warren reports normal exit; secret room reports secret; Lantern exit gate returns to hub | castle sprite | the map connects games |
| M6-S10 | Medals, Tokens, Snack Stand, completion %, roamers | `hub.js`, `map-data.js` | medal gate of 8 opens W3 road; Snack Stand purchase spends Tokens and is cosmetic only; roamer moves 1 node per play | medal pips, stand, roamer | collecting medals is moreish |

### M7: Deepdelve (the cave as a full game)
| ID | Goal | Files | Assertions | Art | Fun gate |
|---|---|---|---|---|---|
| M7-S1 | New page hosting the existing `UndergroundWorld` standalone (copy, not move) | `games/deepdelve/index.html`, `dd-main.js` | page boots without the town; mining a stone adds 1; exit returns to hub | none | the cave on its own |
| M7-S2 | Chunked world data (16^3) + seeded generator by layers | `dd-world.js`, `tests/dd-world.test.js` | same seed same chunk bytes; ores only in their depth bands; generation < 8 ms per chunk in Node | none | n/a |
| M7-S3 | Face-culled chunk meshing + texture atlas | `dd-mesh.js` | hidden faces count 0 between two solid blocks; editing a block rebuilds 1 chunk (+ neighbour on edge); 45 fps at view 3 throttled | atlas from existing tiles | a big world, smooth |
| M7-S4 | IndexedDB chunk diffs + migration of `caveSeed`/`caveInv` | `dd-save.js` | edited block persists after reload; town keys are copied, not deleted; storage blocked -> plays without saving | none | your builds stay |
| M7-S5 | Light levels + darkness + torches | `dd-light.js` | torch light 14 falls off by 1 per block; sky light 15 at the surface; reduce-motion keeps flicker off | torch glow | torch-lit caves are cozy |
| M7-S6 | Crafting: workbench, furnace, 4 tool tiers, 24 recipes | `dd-craft.js` | iron ore needs stone pick; iron pick mines x3 faster; recipes consume exact inputs | tool icons | the crafting ladder |
| M7-S7 | Critters: Glow Slime, Cave Bat, Rock Crab | `dd-mobs.js` | slime hops toward player within 8 blocks; mob dies in expected hits per tool tier; mobs never spawn in torch light >= 8 | billboards (strips/registry) | a little danger |
| M7-S8 | Map levels: Depth -8, Iron Age, Lava Lake | `dd-goals.js`, `map-data.js` | reaching y -8 reports medal b; crafting iron pick reports medal s; lava bridged with cobble only reports secret | lava tile | goals to chase |
| M7-S9 | Rock Wyrm boss at the Crystal Core | `dd-boss.js` | 3 phases at 66/33%; thrown rocks are dodgeable (telegraph 0.6 s); defeat reports medal g | Wyrm segments (AI) | an epic underground finale |

### M8: Lakeside Angler
| ID | Goal | Files | Assertions | Art | Fun gate |
|---|---|---|---|---|---|
| M8-S1 | Page + West Pond scene + cast/bite (port of town timing) | `games/angler/*` | cast shows bobber; bite window ~1 s; early press spooks | pond tiles | fishing on its own |
| M8-S2 | Tension-bar reel minigame | `an-reel.js`, `tests/an-reel.test.js` | zone rises 120%/s held, falls 160%/s released; meter fills 25%/s on target; Calm reel widens zone 30% | bar UI | the reel is a skill |
| M8-S3 | 48-fish bestiary data + journal UI (12 existing ids preserved) | `an-data.js` | existing 12 ids present; filters by spot/time/season give correct pools; journal shows silhouettes | fish icons (emoji/registry) | gotta log them all |
| M8-S4 | Spots: East Pond, River Run, Sea Pier, Ice Hole (winter), Mangrove (secret) | `an-spots.js`, `map-data.js` | Ice Hole locked outside Dec-Feb; River golden trout reports secret; each spot has its pool | spot tiles | variety of places |
| M8-S5 | Gear: rods, lures, bait (crafted from town bugs via profile) | `an-gear.js` | better rod widens zone; bait changes rarity weights; bug bait needs a Hearthvale bug count from profile summary | gear icons | upgrades feel good |
| M8-S6 | Boss fish: Old Whiskers, Pier Kraken, Ice Queen Pike | `an-boss.js` | 3 phases; line snaps after 1.5 s at max tension; win reports castle clear | boss silhouettes | a fish fight! |
| M8-S7 | Save + profile summary + aquarium link | `an-save.js` | `pixeltown-angler-v1` additive; profile games.angler.species updates; town aquarium can show an Angler-only species | none | catches show in town |
| M8-S8 | Daily tournament (Firebase path `/angler/tournament`, offline stub) | `an-net.js` | biggest catch transaction keeps max; offline no requests; malformed record ignored | none | friendly competition |

### M9: Festival Fields (Bug Safari, Campfire Jam, Stalk Market)
| ID | Goal | Files | Assertions | Art | Fun gate |
|---|---|---|---|---|---|
| M9-S1 | Bug Safari page + Meadow arena + net swing + timer | `games/safari/*` | run lasts 90 s; swing has 0.35 s cooldown; catch adds score | bug sprites (registry) | catching is snappy |
| M9-S2 | 40 bug behaviours + combos + sneak | `sf-bugs.js` | sneaking within 3 tiles does not scare; combo x1.2 within 2 s; rare spawn at 30 s | more bugs | skillful catching |
| M9-S3 | 8 arenas + stars + medals + Moonwing secret | `sf-arenas.js`, `map-data.js` | star thresholds per arena; Moonwing only in night arena; all-1-star reports medal b | arena tiles | worth replaying |
| M9-S4 | Campfire Jam engine: AudioContext timing + judgement windows | `games/jam/jm-engine.js`, `tests/jm-engine.test.js` | hit at +40 ms = Perfect, +80 = Great, +130 = Good, +140 = Miss; judgement uses audio clock | lane UI | hitting notes feels tight |
| M9-S5 | Synth songs + chart format + 4 hand-authored songs | `jm-songs.js` | chart beats sorted; song length matches chart; three difficulties load | busker dog (strip) | catchy tunes |
| M9-S6 | Calibration + touch lanes + 8 generated songs + ranks | `jm-calib.js`, `jm-gen.js` | offset saved to profile; generated chart respects density cap; S rank at >= 95% | none | it works on a phone |
| M9-S7 | Stalk Market sim: weekly patterns, Quick/Slow week | `games/stalk/st-sim.js`, `tests/st-sim.test.js` | same seed same week prices; 4 pattern families all occur over 400 seeds; turnips rot after 7 days | stall art | reading the market is clever |
| M9-S8 | Stalk Market UI + almanac + goals + W1 secret exit (>= 3x) | `st-ui.js`, `map-data.js` | almanac unlocks a pattern after it is seen; 3x sell reports secret; no wager UI exists | charts (canvas) | a satisfying spike sale |
| M9-S9 | Festival Finale castle: medley (one round each game) | `hub` + each game's `?medley=1` | finale chains 3 games via results; total score shown; clear opens W6 comet | finale banner | a festival night |

### M10: Co-op Mad Maze, Comet Trail, launch polish
| ID | Goal | Files | Assertions | Art | Fun gate |
|---|---|---|---|---|---|
| M10-S1 | Party rooms (invite code) + rules + rate limits | `mm-net.js`, Firebase rules doc | code is 5 letters; 5th player refused; writes over 10/s dropped client-side | none | play with a friend |
| M10-S2 | Player state sync 8 Hz + interpolation | `mm-net.js` | deadband suppresses unchanged writes; remote hero lags 120 ms smoothly; disconnect removes hero | none | see your friend move |
| M10-S3 | Host enemy snapshots 5 Hz + pattern-start events | `mm-net.js`, `mm-sim.js` | two clients with same pattern event produce identical bullet positions after 3 s; snapshot <= 40 enemies; ~6 B per enemy | none | shared fights |
| M10-S4 | Damage reports + host clamp + soulbound per-player loot | `mm-net.js` | report above 1.3x max DPS clamped; 8% threshold qualifies; each player sees only their soulbound bag | none | fair loot for both |
| M10-S5 | Host migration + boss reset to phase start | `mm-net.js` | host leave promotes next; boss hp resets to phase start; no duplicate enemies | none | robust co-op |
| M10-S6 | Comet Trail world (W6) + 5 challenge nodes | `map-data.js`, each game `?challenge=` | comet path opens on Keep clear; each challenge reports medals; Comet Trail completion gives crown | night tiles | a secret world |
| M10-S7 | Unified backup/restore of all `pixeltown-*` keys | `shared/profile.js`, town hook | bundle export contains all keys; restoring old single-save file still works; IndexedDB cave data optional in bundle | none | safe saves |
| M10-S8 | Launch pass: hub "What's new", README, CHANGELOG, Lighthouse | docs + hub | hub Lighthouse perf >= 90 on mobile; every node href resolves (no 404); run-all passes | none | ready to share |

---

## 9. Top decisions for the owner
1. **Death model for Mad Maze**: the proposed default is soft permadeath
   (lose the hero and gear; keep fame, unlocks, stash, pet, a level floor)
   plus an opt-in no-loss Picnic mode and an unlockable Hardcore. Alternative:
   no permadeath at all (heroes persist, only carried loot is lost).
2. **The town's new name**: Hearthvale (recommended), Cloverbrook or
   Puddlewick, and whether the K.K.-style show is renamed with it.
3. **Online scope**: v1 ships Mad Maze single-player with friends
   leaderboards and ghosts on today's open Firebase rules (cheatable). For
   co-op (M10) and trustworthy boards, enable Firebase Anonymous Auth and
   tighter rules. Also: what to do with Polyroll (keep, reskin as no-wager,
   or retire).

---

## 10. Sources and what could not be verified
- Super Mario World secret exits: 24 of 96 exits are secret; red level dots
  mark levels with a secret exit; secret exits unlock Switch Palaces,
  shortcuts and secret levels; Star Road warps and keys/keyholes; the
  Special Zone after all Star World secret exits. Super Mario Wiki
  "Secret exit" (https://www.mariowiki.com/Secret_exit), Thonky's exit list
  (https://www.thonky.com/super-mario-world/list-of-exits), The Mushroom
  Kingdom guide.
- Super Mario Bros. 3 map: Hammer Bros. wandering map nodes that start a
  one-screen battle, hidden Toad Houses and warp paths, airships as the last
  level of each world, World 5's two linked hubs. Gamedev.net "Super Mario
  Bros 3 Level Design Lessons" parts 1-3 (Radek Koncewicz), PCPer map overview.
- Hades door-reward previews and harder "skull" doors (Shacknews, Prima
  Games): used for showing a node's reward on the card.
- Animal Crossing turnip price patterns: the four families (random,
  decreasing, small spike, large spike) are from general community knowledge;
  I did not fetch a source in this pass, so treat them as unverified.
- Stardew-style fishing bar: from general knowledge, not fetched; the
  numbers in 4.2 are our own design values.
- Not verified: exact SMB3 lock/fortress mechanics and N-Spade details (no
  source returned them); how the town persists ⭐ stars across sessions
  (to check in M6-S7 before building the 10 ⭐ -> 1 🪙 booth); real load
  times (the < 1 s hub target is a budget to test, not a measurement).
- Codebase facts used (read directly): `game/main.js` (8,427 lines, one
  `TownScene`, `SAVE_KEY = 'pixeltown-save-v1'`, `SPECIES` list of 21
  strips), `game/net.js` (Firebase paths and `clean*` helpers),
  `game/underground.js` (25x25x8 seeded voxel cave, procedural 16x16 tiles),
  `i/*-strip.png` (216x24 = 9 frames of 24x24), `game/species-registry.json`
  (98 species with SVGs), `game/tests/helpers.js` (tests join live presence
  on `game/index.html`), `game/manifest.json` (`start_url "./"`).
