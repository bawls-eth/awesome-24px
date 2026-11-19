# Pixeltown changelog

A running list of everything that's been built, in order. See `README.md`
for how each feature actually works and plays.

## Foundation

- Pixeltown: a small multiplayer town built on this repo's own sprite
  collections (Cool Cats, Punks, Pudgy Penguins, Doge, Bored Apes, and more)
- Procedural walk-cycle hop for player movement
- Deployed as static + Firebase (free GitHub Pages hosting), with a
  Render Blueprint config as an alternative
- Apes, emotes, a sparkle minigame, day/night cycle, Pages redirect
- Real Firebase project wired up

## Mobile support

- Fully mobile-ready: virtual D-pad, tilt steering, shake-to-interact
- Local save (villager/inventory persist in `localStorage`), lower tilt
  sensitivity, Add to Home Screen support
- Tilt toggle-off, bag icon, visible fishing rod, mobile button grid
- Mobile A/B action buttons fixed, bestie walkie-talkie voice clips
- Haptic feedback on mobile button taps
- A labeled **C** button for chat on mobile
- Fixed the chat box sitting too high and HUD panels landing under the
  iPhone status bar on standalone (Add to Home Screen) launches; canvas
  now sizes itself from `visualViewport` instead of the unreliable
  `window.innerWidth/innerHeight` iOS reports right after launch; touch
  devices zoom the camera out (1.5x vs 2x) to show more of the world

## Core activities

- Fishing, chopping wood, mining stone, and build mode (place/remove
  grid-snapped blocks) — synced live over Firebase
- A resource shop to sell wood/stone/fish/etc. for score
- Butterfly catching
- Fruit trees that drop apples when shaken
- A tool shown in the villager's hand while chopping/mining
- Beachcombing along the pond edges (shells, sea glass, star fragments)
- Flower picking — 6 fixed garden spots growing 🌸🌷🌻🌹 every 30s
- A second build-mode material: 🪨 stone fences alongside 🪵 wood walls

## World and map

- Expanded the map using more of this repo's sprite collections (Moon
  Cats swimming in the pond, a Bored Ape statue, Punk Rock decor)
- A real 3D voxel cave underground (Three.js) — wood veins, a hotbar,
  placeable torches and walls
- The player's 2D sprite extrudes into a 3D voxel figure underground
- One-way portal doors to other browser games (GTA 3, NFS Underground 2)
- A resident NPC, Professor Byte, near the Mayor statue with random
  flavor-text dialogue

## Town economy and events

- A turnip/stalk market minigame (classic AC "buy low, sell high")
- Fossils + a Museum you donate them to for a full collection
- A Polyroll minigame booth — stars only, no wallet, no crypto, no real
  money anywhere
- K.K. Slider's campfire concert, 7-9pm on your own device's clock
- The Able Sisters outfit shop — change your villager's look any time
- Weather (occasional rain), synced across every client for free via a
  deterministic wall-clock hash — no network traffic needed
- A seasonal color wash tied to the real-world month
- A notice board showing the live top-3 leaderboard
- A daily login streak counter
- Nook Miles-style achievements — now 22 lifetime goals, each with a one-
  time ⭐ bonus (Lumberjack, Miner, Angler, Gardener, Fencer, Chatty,
  Photographer, Collector, Paleontologist, and more)
- The Mystery Merchant — visits a fixed spot for a deterministic daily
  3-hour window, selling one of 12 rare looks pulled from this repo's
  remaining unused sprite strips (not available anywhere else) for 15 ⭐
- Butterflies turn into glowing fireflies at night and back at dawn,
  following the same local clock as the day/night tint
- A third build-mode material, 🪔 Lamp — purely decorative (no collision),
  costs flowers instead of wood/stone, and glows at night
- A live "villagers in town right now" count on the join screen, before
  you've even picked a name — read-only, no new player record created
- A small wooden dock off the pond's edge and a few benches scattered
  around town — purely decorative scenery, no new mechanics
- A daily quest from Professor Byte — the same "bring N of resource X"
  task for everyone each day, computed from the date; a sign over his
  head shows the ask and reward, interact with enough in your bag to
  turn it in
- An old windmill landmark tucked into the quiet northwest corner of
  town, its blades spinning on a looping tween — purely decorative
  scenery, no new mechanics
- A small graveyard on the west edge — a few tombstones behind a low
  fence, with a resident zombie villager standing watch; purely
  decorative, tombstones block movement, the fence itself doesn't
- A 🏘️ Town rating readout under the player list — a live, shared count
  of every block anyone's placed, with a few flavor tiers (Empty through
  Full!)
- 💾 Backup / 📂 Restore buttons to export the local save as a .json file
  and load one back in — for moving your villager to another browser/
  device, or just backing up before clearing site data
- A daily fishing tournament — a 2-hour deterministic window, random
  catch sizes, and a live-synced "biggest catch today" sign whose record
  only a genuinely bigger catch can overwrite (Firebase transaction,
  same shape as the scavenger hunt)
- Opt-in ambient background music — a slow synthesized chord pad, off by
  default, independent of the SFX mute toggle
- A few drifting butterflies/sparkles/petals behind the join screen —
  pure CSS, respects prefers-reduced-motion, no new art or JS state
- A ❓ Keys button next to achievements, opening a full keyboard-shortcut
  cheat sheet
- A dismissible "what's new" banner shown once to returning players when
  there's something new since their last visit (skipped for genuinely
  new players, who have nothing to compare against)
- A 🎲 Randomize button in the Able Sisters outfit shop, previewing a
  random species/frame before you commit to it
- A 🛍️ shop loyalty streak — selling on consecutive days builds a streak
  for a small bonus, same date-comparison shape as the login streak
- Soft footstep dust puffs under the player while walking — purely
  cosmetic, local-only, throttled to a trail instead of a smear
- Two more build-mode materials, 🌳 Hedge (3 flowers, solid — a green
  bush wall) and 🟫 Path (1 stone, non-solid — a flat ground tile for
  laying out walkways), plus matching achievements
- A 📖 Guestbook — a signpost where players leave a short signed note
  for others to read later, persisted in Firebase (last 20 shown, not
  just a local list) so it's shared across every client; runs through
  the same slur filter as chat/names and is rate-limited client-side to
  one note per minute
- Seasonal ground decor — a handful of ⛄ snowmen in winter, 🎃 pumpkins
  in autumn, scattered around town on the same wall-clock-month check
  that already drives the seasonal color wash
- A one-key undo (**Z**) for the block you just placed in build mode —
  refunds the right resource and works from anywhere, no need to walk
  back to the exact cell, within a 10-second window
- Professor Byte and Salty Mo now swap in a few rain-specific lines
  while it's raining, reacting to the existing weather system
- A row of quick-chat buttons above the chat box — one tap sends a
  preset phrase, same send path (and slur filter/rate-limit) as typing
- A daily trivia question from Professor Byte (**T** near him) — same
  question for everyone, one attempt per day, +8 ⭐ for a correct answer
- A daily scavenger hunt — one hidden spot a day, same location for
  everyone (deterministic from the date), but "who found it first" is
  decided by a real Firebase transaction so a race between two players
  only ever pays one of them
- Faint ripples drifting across the pond every couple of seconds —
  purely cosmetic, local-only, no new mechanics
- A daily deal at the shop — one resource sells for a flat +50% each
  day, same for everyone (deterministic from the date), shown on a
  sign over the shop
- A reduce-motion toggle that turns off the walk-cycle hop, defaulting
  to the OS-level prefers-reduced-motion setting when present
- Equippable achievement titles — any unlocked achievement can be worn
  as a small badge next to your name, visible to every other client,
  synced the same way appearance changes already are
- A bulk-sell bonus — selling 10+ of one resource at once earns +20%
  on that resource, stacking with the daily deal if it's the same one
- An in-game changelog viewer (fetches and renders this file) and a
  feedback button that opens a prefilled GitHub issue
- A town map overlay (🗺️ button or **M**) — a simple schematic with
  landmark labels and everyone's live position, not a literal zoomed-
  out render (which would be unreadable mud at map size)
- Collapsed the player list panel's growing run of settings/utility
  buttons behind a single ⚙️ Settings toggle, closed by default — the
  panel had grown long enough to overflow its own max-height on real
  devices, with lower rows unreachable
- Bumped the player list panel's background from 85% to 97% opacity —
  bright world text/sprites passing behind it (NPC name tags, signs)
  were reading through it once the panel was this tall
- Fixed `#save-import-input` (the hidden file picker `.click()`-
  triggered by the Restore button) having no CSS rule hiding it at
  all, rendering as a stray native "Choose File" button in the panel
- Consolidated Polyroll, the turnip stall, the fishing tournament's
  leaderboard sign, and both portal doors into one 🕹️ Arcade District
  southeast of the statue — these were scattered across the whole map
  (the tournament sign in particular sat all the way on the opposite
  side, by the main pond), meaning a lot of walking just to find them.
  Also dropped the second, redundant GTA 3 door down to one, now that
  there's a single obvious spot for all of this
- Zoomed the main camera out further (2×/1.5× → 1.6×/1.2×, desktop/
  touch) so more of the surroundings are visible at once; the town
  map overlay is bigger too (280×140 → 320×160) and now shades both
  ponds in as soft blue shapes instead of nothing, making it read
  more like an actual overhead map
- Achievement unlocks now show a proper screen-fixed toast (readable
  for a full 10 seconds) instead of only the brief floating "+N ⭐"
  text, which faded in under a second — too quick to actually read an
  achievement's name. The what's-new banner now also auto-dismisses
  after 10 seconds instead of sitting there until manually closed
- Reworked the mobile action-button layout: moved 😀 Emotes out of the
  cramped 2×2 grid into its own full-width row above 🎮 Tilt, and
  filled its old spot with a new 📸 Photo button, so the main grid is
  now a clean 🧱 Build / ✋ Interact / 📸 Photo / 💬 Chat
- The mobile chat text input is hidden until the 💬 Chat button taps
  it open, instead of permanently sitting on screen — quick-chat
  phrases above it still work without opening it. Fixed a real bug
  this surfaced: tapping Send while the input had focus blurred it
  (standard mobile tap-to-click behavior) before the click handler
  ran, and since blur now hides the row, the send button was
  disappearing out from under the tap and silently swallowing it

## Villagers and expression

- Expanded the villager roster from 9 to 21 species, pulled from this
  repo's own unused sprite collections (Alien Clan, Dragon/Frog/Ninja/
  Pirate/Unicorn Cats, Geniuses, Golden/Halloween Punks, Phunks, Punkettes)
- A second resident NPC, Salty Mo the dockhand, camped by the pond's dock
  with his own grumpy flavor-text lines (no quest, flavor only)
- Emotes expanded from 5 to 9 (keys 1-9), with a 3x3 mobile grid
- Photo mode (**P** / 📸) — flash, shutter sound, and a PNG download of
  the current view straight from the game canvas

## Sound

- Sound effects — zero audio files, pure WebAudio oscillator synthesis,
  with a 🔊/🔇 toggle that remembers your choice per device

## Safety and reliability fixes along the way

- Fixed zombie player records polluting the player list, and closed the
  underlying race condition with Firebase transactions instead of
  `update()`
- Fixed transaction failures caused by Realtime Database's
  null-deletes-key behavior
- Fixed cave controls, fishing, and portal doors getting stuck closed
  after returning via Back
- Blocked slurs in chat (client-side word filter; the DB itself is wide
  open by design — see README's "A word on safety")
- Rate-limited repeated identical chat messages client-side
- Fixed the mobile chat input bar sitting too close to the D-pad/action
  buttons — the quick-chat phrase row had eaten most of the original
  clearance, leaving only a few px of margin on real devices
- Fixed the mobile on-screen keyboard leaving the chat bar floating
  mid-screen with a stray opaque gap showing through behind it — added
  `interactive-widget=resizes-content` to the viewport meta tag, and as
  a fallback for browsers that don't yet honor it, the game canvas's
  container now tracks `visualViewport` directly instead of staying
  pinned to the full (pre-keyboard) page height
- Fixed the fishing bite being easy to miss entirely on mobile: the
  bobber rendered at a fixed depth below the pond/ground layer, so
  anything with a normal y-based depth (players, decor, even the
  pond's own ripple effect) could render on top of it; a zoomed-out
  camera made this worse. It now renders above everything and pulses
  with a scale animation on top of its color change when a fish bites,
  so the catch window is much harder to miss and let expire unnoticed
- Two more portal doors in the Arcade District — Kart Racing and Vice
  City, alongside the existing GTA 3 and NFS Underground 2 doors
- A real 🎣 Fish button that appears on screen whenever there's a
  rod-related action available (close enough to cast, already
  waiting, or a bite ready to reel in), changing label/color with the
  state — not just a "press E" hint, a proper tappable button
- The Museum now has fauna and flora sections alongside fossils —
  every butterfly/firefly and flower species gets recorded the first
  time you ever catch or pick one, no need to carry it in. A new 🏛️
  Museum button under the player list opens the full interior view
- The world is now a much bigger island surrounded by ocean, instead
  of ending abruptly at the edge of town. Walking out past the village
  in any direction crosses a wilderness ring (trees, rocks, flowers,
  roaming critters) before hitting a sandy beach and open water —
  all of it generated deterministically from a position hash, so
  every device sees the exact same layout with zero extra network
  traffic or server-side generation (no AI API calls, no randomness).
  Bug-catching stays a village-only activity; the wilderness and ocean
  are there to explore, not to farm
- Fixed three bugs found while building the above: the dirt path used
  to stretch across the whole new world into the ocean instead of
  staying within the village; trees/flowers/critters placed at
  negative Y coordinates rendered behind the ground/ocean layers
  instead of on top of them; and an early version of the wilderness
  generator scanned every few pixels of the new, much larger world to
  draw ground texture and waves, which measurably tanked frame rate —
  it now draws a fixed number of each instead
- Added 🏡 **Residential Lane**: 5 named animal-villager NPCs (Mocha,
  Frosty, Buster, Lily, Spike), each with their own personality, house,
  and dialogue, south of the museum/shop cluster — the first real
  Animal-Crossing-style villagers in the game, distinct from the two
  existing flavor-only NPCs. Press E to chat (closer friendships unlock
  extra lines) or press G / tap the new 🎁 Gift button to give a
  villager something from your bag they like; gifting raises a
  per-device 0–100 affinity through acquaintance → friend → good friend
  → best friend, with a ⭐ bonus on every tier-up
- Softened the ground and path colors to a lighter, more pastel palette
  for a cozier, more Animal-Crossing-like look
- Imported a 20-species flora/fauna starter pack (fox, deer, bird,
  butterfly, frog, snake, mushroom, oak/pine trees, flowers, ferns,
  grass, shrubs, cactus, trout, crab, jellyfish, shark, coral, kelp) as
  real vector SVG art, scattered through the wilderness, ponds, and
  ocean as decor. Each species' full metadata (common/scientific name,
  biome, trophic role, size, diet, behavior, rarity) lives in a new
  `species-registry.json`, a modular registry meant to grow — this
  starter set doesn't claim to cover every biome or species, just seeds
  one. Matching GLB 3D models ship alongside the SVGs, keyed by the same
  species id, for any future 3D engine to pick up
- Imported a second, 44-species flora/fauna batch filling in the biomes
  the first batch barely touched: desert (scorpion, roadrunner, desert
  tortoise, Joshua tree, sagebrush), alpine/tundra (snowy owl, arctic
  fox, caribou, mountain goat, lichen), rainforest (toucan, poison dart
  frog, howler monkey, orchid, liana vine, leafcutter ant), more wetland
  (heron, cattail, dragonfly, otter, water lily), more marine (sea
  turtle, clownfish, octopus, starfish, sea anemone, seahorse), more
  freshwater (beaver, catfish, duckweed), and a round of forest/
  grassland/aerial species (owl, squirrel, hedgehog, ladybug, honeybee,
  spider, clover, dandelion, moss, maple tree, blackberry vine, hawk,
  hummingbird, bat) — the registry's first arachnids and mollusks.
  Since there's no real desert or alpine biome on this map, those two
  groups each get one fixed "accent corner" instead of being scattered
  across the land like everything else. `species-registry.json` is now
  64 species total
- The flora/fauna pack is now actually collectible, not just decor:
  walk up to any of the 64 scattered specimens and press E to log it.
  Discoveries show up as two new sections inside the existing **🏛️
  Museum** panel — 🦌 **Wild Fauna** (40) and 🌿 **Wild Flora** (24) —
  right alongside Fossils/Fauna/Flora, rather than a separate button.
  Logging a species again just repeats a flavor line instead of
  double-counting; progress is saved permanently per device, same as
  everything else in the Museum
- Imported a third, 34-species flora/fauna batch closing out the taxa
  that were still thin or missing: mollusks (snail, nudibranch, giant
  clam), crustaceans (lobster, shrimp, barnacle), cnidarians (sea fan,
  fire coral), echinoderms (sea urchin, sand dollar), fungi (puffball,
  bracket fungus, slime mold), mosses/ferns (sphagnum moss, bracken
  fern, maidenhair fern), algae/sea grasses (red algae, diatom, turtle
  grass, eelgrass — sea grass had zero coverage before this), and
  microscopic life (copepod, amoeba, paramecium — also zero coverage
  before this, rendered as tiny specks near pond edges rather than
  life-sized), plus a round of insects, arachnids, an amphibian, vines,
  and wildflowers. `species-registry.json` and the Museum's Wild Fauna/
  Wild Flora sections are now 98 species total (57 fauna, 41 flora)
- Land animals now roam the whole island instead of being stuck in
  their zone's small patch — a fox, a scorpion, or a snowy owl can turn
  up anywhere across the wilderness, with 5 instances each instead of
  2-3. Plants stay put: desert and alpine species (cactus, Joshua tree,
  lichen, etc.) still cluster into their own fixed "accent" corner,
  since a cactus doesn't wander, and ocean/pond life stays in the
  water where it belongs

## The big rework (10 parallel passes)

A quality pass over every system at once, split across ten workstreams
and merged together. Highlights:

- **Movement/camera:** eased start/stop, Shift to run, corner-sliding so
  you no longer snag on obstacle edges, a tighter foot hitbox, and a
  frame-rate-independent camera. Idle players stopped firing a Firebase
  write every 100ms.
- **World rendering:** the trees, ground and ocean are baked into
  textures once instead of redrawn every frame — Graphics objects
  dropped from ~117 to 32 and frame rate roughly doubled (~23 → ~43 fps
  headless). New rounded, animated coastline with shallows, wet sand and
  foam; grass tufts and clover; prettier ponds with lily pads.
- **Wildlife:** animals actually move now — fauna wander near their
  spawn and avoid buildings/ponds, birds and insects flutter, fish drift
  in the water. ~16 small critters live in the village itself. Only
  near-camera specimens animate, to keep it cheap. Collecting follows
  the animal's live position, with a sparkle + "E: log" hint on
  undiscovered species.
- **Fishing:** fish shadows swim in both ponds and you cast at a nearby
  visible fish; bite timing moved to wall-clock checks so it stays
  reliable at low FPS, with a much more obvious bite.
- **Villagers:** they wander their front yards on a shared schedule,
  doze at night, turn to face you, show friendship hearts, give a
  daily-capped greeting, and have far more per-personality,
  time-of-day and weather dialogue; the Gift button names the villager
  and what they like.
- **Museum:** reworked from one long text list into tabbed wings with
  per-section and overall progress bars, specimen cards showing the real
  SVG art (silhouette + lock until found), and a detail view with facts
  from the species registry. The building opens it when you have no
  fossils to donate.
- **Mobile + controller:** Bluetooth/USB gamepad support (left stick or
  D-pad to move, A interact, X gift, B build/close, Start map), the
  4-button D-pad replaced by a proper virtual joystick, and a cleaned-up
  phone layout.
- **Look:** a warm, cream-and-brown Animal-Crossing-style theme via CSS
  variables, across the join screen, HUD, chat and every overlay.
- **Networking/chat:** reconnect handling with a "Reconnecting…" pill
  and automatic re-join, validation/clamping of everything read from the
  database, quote-safe HTML escaping, de-duplicated chat replay, and
  several real bug fixes.
- **Economy/progression:** fixed star-farming exploits (the coin flip
  paying double, unbounded turnip flipping, the shop wiping the whole
  bag), added achievements for the villager and wildlife systems, and
  made the achievement count real (35) instead of a hard-coded 25.

## Admin maintenance

- **Save robustness:** a corrupt `pixeltown-save-v1` (JSON that is a number, string or array) is now treated as empty instead of being spread into garbage keys; save import rejects arrays; resource counts load as finite non-negative whole numbers. Save format unchanged.
- **DIY Workbench:** a new workbench in the village (east of the museum) turns gathered wood/stone/fish/bugs/fruit/flowers/shells into 8 crafted goods (plank stack, stone brick, fish stew, bug jar, fruit pie, flower crown, shell chime, lantern). Crafted goods are sold at the shop for more than the raw inputs. Local only; new additive `crafted` save key; 3 new achievements (DIY Beginner, Crafty, Master Crafter).
- **Workbench polish:** crafted-goods chip in the bag HUD, a Workbench map landmark, the overlay auto-closes when you walk away, bigger touch targets + dialog role, README recipe table, and a committed Playwright suite (`game/tests/`, 16 checks incl. a 390x844 phone run).
- **Weeds & town tidiness:** a daily batch of ~24 deterministic weeds (worldHash on the UTC day, baked sprite pool, no per-frame work) to pull for a star each, +5 for clearing them all; a tidiness readout in the player panel; 3 achievements; local `weedsPulled` save key; Playwright suite `game/tests/weeds.test.js` (20 checks incl. phone).
- **Save sanitising:** lifetime stats, achievement ids and login/sell streaks are cleaned on load (finite non-negative integers only); weeds stay clear of NPC talk radius; new `game/tests/saves.test.js`.
- **Villager mailbox:** a mailbox south of the museum receives daily letters from villagers you know (deterministic per UTC day via worldHash, frequency and gift quality scale with friendship tier, best friends always write), each with a resource or ⭐ gift; collect singly or all; map landmark + unread count on the world label; additive `mail` save key, claim saved before payout; 3 achievements; `game/tests/mailbox.test.js` (24 checks incl. phone).
- **Daily Bug-Off:** a local, deterministic 2-hour contest each day with a sign (and map landmark): 8 extra bugs, fast respawns, Bronze/Silver/Gold prizes at 5/10/15 catches paid once each (saved before paying), lifetime best, 3 achievements, additive `bugoff` save key, `game/tests/bugoff.test.js` (14 checks incl. phone, corrupt saves, reload, day reset).
- **Home plot:** a fenced plot at (1650,940) with six spots for crafted goods (dropdown UI, 44px targets, auto-close on walk-away, map landmark); goods move between bag and plot atomically, cozy score, once-a-day visitor bonus (saved before paying), 3 achievements, additive `home` save key sanitised on load, `game/tests/home.test.js` (21 checks incl. corrupt saves, reload, phone). Perf audit this run: update() ~0.02ms, ~950 display objects, no hot spot found.
- **Villager birthdays:** a deterministic 10-day rotation (one villager each birthday day): 🎂 name tag, panel line (today / next birthday), guaranteed birthday letter with a bigger gift, special chat line, and a party gift (+5⭐, +20 friendship, crafted-good fallback, claim saved before paying); additive `birthdays` save key sanitised on load; 3 achievements; `game/tests/birthdays.test.js` (21 checks). Also: the "What's new" banner now shows only the 5 newest items so it no longer fills a phone screen.
- **Test tooling:** `game/tests/run-all.js` runs every suite against a throwaway server; new `integration.test.js` (landmarks open the right overlay, no shadowing/overlap, every weed pullable, labels do not overlap) and `soak.test.js` (45s scripted play: no object/tween/timer leaks). README has a Tests section.
- **Seasonal crafting:** four seasonal workbench specials (Tulip Wreath, Beach Umbrella, Jack-o'-Lantern, Snowman), craftable only in their season (workbench shows the season and disables out-of-season rows), 9-star goods that sell and can be displayed any time; `currentSeason()` helper; Seasonal Crafter / Year-Round Crafter achievements (Master Crafter unchanged: year-round recipes only); additive `crafted` ids sanitised on load; `game/tests/seasonal.test.js` (12 checks incl. phone).
- **Today board:** a 📋 Today button (and J) opens a checklist of every daily chore with live progress (request, trivia, mailbox, weeds, Bug-Off, birthday gift, home visit); finishing all that apply pays a one-time +5 bonus (saved before paying); additive `dailies` save key sanitised on load; 2 achievements; `game/tests/dailies.test.js` (16 checks incl. phone and corrupt saves).
- Today board follow-up: a Bug-Off window that has passed without a medal is "missed" and excluded from the chore total (no lockout from the daily bonus); J and G added to the keyboard-shortcuts help.
- **Angler's Journal:** 12 fish species by pond / time / season / shadow size, a journal overlay (🐟 button or L) with found cards and locked hints, first-catch and 4/8/12-set rewards (saved before paying), 3 achievements, a "Catch a fish" Today chore, additive `fishlog` save key sanitised on load, `game/tests/fishlog.test.js` (23 checks incl. phone, corrupt saves, species-rule fuzz).
- Journal follow-up: the journal and the fishing tournament now share one size roll per catch (no more two contradictory sizes); Angler/Master Angler read the live species count (restored saves unlock correctly); catching your last chore fish pays the Today bonus immediately.
- **Perf audit #2:** with every feature on, `update()` costs ~0.015 ms/frame; ~950 display objects, but only ~65 are on screen (camera culling) and the 81 collision rects are invisible; tweens/timers/objects stay flat across the soak run. The earlier "soak fps drift" was headless software-rendering noise, so the soak test now guards only against gross regressions (fps > 15) and asserts the per-frame `update()` cost (< 1 ms).
- **Home aquarium:** a baked glass tank beside the home plot showing up to 3 distinct species from your Angler's Journal (nothing consumed, 3 small drift tweens rebuilt only on change); each adds rarity x2 cozy; `home.tank` is additive and sanitised (known species ids, de-duplicated); 2 achievements; weeds keep clear of the tank; `game/tests/aquarium.test.js` (25 checks incl. phone, corrupt saves, footprint).
- **Phone layout fix (owner request):** the tall "In town" panel now starts collapsed to a chip on phone widths (<= 600px) and expands on tap with a Close control; expanded it scrolls inside itself (<= 60vh and capped so it never overlaps the chat bar / joystick / action buttons at 390x844 or 360x640); choice remembered under the separate `pixeltown-panel-collapsed` localStorage key; desktop unchanged. Audit fixes: overlay cards taller than the screen (join screen, keyboard help at 360x640) now scroll instead of being clipped, overlay close buttons are 40px on phones (and keep off the title), and the "What's new" banner is capped at ~1/3 of the screen. New suites `phone-panel.test.js` and `phone-overlays.test.js`; existing phone tests expand the panel first.
- **Landscape phones:** the collapsible town panel now also applies to short touch screens (`(max-height: 500px) and (pointer: coarse)`, e.g. 844x390 / 667x375 / 640x360), where the old tall panel sat on top of the chat bar. The panel height now stays clear of anything below it that overlaps it horizontally (chat bar, joystick, action buttons, hint pills); the chat bar stops 200px short of the right edge and the walkie button moves to the bottom-centre strip so no two HUD pieces overlap. Overlay cards of every kind (incl. Polyroll) now cap at the screen height and scroll. `phone-panel` / `phone-overlays` suites cover portrait and landscape sizes.
- Panel follow-up: the expanded phone panel re-fits when a fish / gift / dig-hole hint pill appears or disappears (class-attribute observer), so it never sits on a pill; tested with a real gift pill at 844x390.
- **Minecraft cave, slice A1:** procedural 16x16 pixel-art block textures (grass top/side, dirt, stone, coal, iron, gold, wood log, placed cobble) with nearest-neighbour filtering on per-face materials, still one InstancedMesh per block type (about 20 draw calls); new coal/iron/gold ores replace the single ore block (all yield 3 stone, logs 1 wood); first-person camera at eye height (the mine/place ray origin, so the crosshair is exact) with a held pickaxe that swings and the selected block/torch, plus a third-person toggle (F5 / V / on-screen View button, F5 never reloads); lighting retuned for the brighter textures; lower pixel-ratio cap on phones; `game/tests/cave.test.js` (27 checks). Headless software-GL fps is not representative (old cave 11 fps vs new 9 fps in the same sandbox); real-device fps should be checked.
- **Minecraft cave, slice A2 (physics):** the cave is now walked, not flown. Gravity, a 2.5-unit jump, a 1.2x3.6 body with swept AABB collision against the voxel grid (axis-by-axis so you slide along walls, <=0.4-unit sub-steps so a fast fall can't tunnel, bisected to the block face), auto-hop up a one-block ledge only when the space above is clear (a two-block wall stops you), invisible solid cave sides and bedrock floor, torches are walk-through, and `place()` refuses a block that would overlap you. New flooded cavern off the shaft bottom with slow swimming; fall damage with a ❤️ health badge (20 HP, regen, respawn on the surface at 0); creative flight is now a toggle (double-tap Space or the 🕊️ Fly button; Shift/Space or ⤵️/⤴️ move up/down; touching down ends it). `rig.position` now means the player's feet (eye = feet + 3.24); public `UndergroundWorld` methods unchanged, plus `tapJump`, `toggleFly`, `respawn`. Additive, local-only, no save changes. `game/tests/cave-physics.test.js` (22 checks incl. 390x844 phone; physics is stepped with a fixed dt so results do not depend on frame rate); `cave.test.js` freezes physics where it poses the camera.
- A2 review follow-ups: Space no longer re-fires a focused Fly button, flight ceiling at y=14, Space ignored outside the cave, water mesh disposed. Known: a one-block step between two 2-high tunnels can't be hopped (0.4 headroom) without flying.
- **Minecraft cave, slice A3 (timed mining, drops, hotbar):** blocks no longer pop instantly. Hold **E** (or the ⛏️ button) on a block and it cracks apart over its hardness time (dirt 0.4 s, stone 1.0, coal 1.2, iron 1.6, gold 2.0; 10-stage pixel crack overlay, one reusable mesh); looking away or letting go resets progress. A broken block drops a spinning item cube that falls, drifts toward you when close and is picked up on contact (pooled, max 24; a full pool hands the oldest over immediately). Loot is unchanged for stone/wood/ore (+3 stone from ore) plus new collectables: dirt (placeable as a real dirt block from its own instanced pool), coal, iron ore and gold ore. A real **9-slot hotbar** (keys 1-9, mouse wheel, tap) with count badges: wall, torch, dirt, coal, iron, gold, 3 empty slots reserved for crafting; it sits at the bottom on desktop and at the top on phones so it never touches the joystick. Cave materials are saved under the new additive `caveInv` key (sanitised on load: whole numbers, 0..9999, known keys only). `mine()` still breaks a block instantly and credits it straight away for older callers. New `game/tests/cave-mining.test.js` (22 checks incl. 390x844 phone and corrupt saves); touch screens hide the keyboard tips in the cave hint.
- A3 review follow-ups: pending drops are collected on exit, wheel ignores sideways/burst scroll, drop drift is frame-rate independent, touch hotbar clears the exit hint and fits 320px screens.
- **Minecraft cave, slice A4 part 1 (seeded, bigger terrain):** the cave is now a pure function of a seed (integer hash + value noise, no `Math.random` in world generation), saved as the additive `caveSeed` key (made once on first launch, written immediately, sanitised on load; seed 0 is the classic flat cave) so your cave looks the same on every visit. It grew from 17x17 to 25x25 columns (about 5,100 blocks, still ~21 draw calls) with rolling hills 0-2 blocks high, a guaranteed flat 9x9 area around the shaft and spawn, trees (2-block log trunk + 3x3 leaf crown, level ground only, never near the shaft) and new 11th pixel-art `leaves` texture (mines in 0.2 s, drops nothing), plus seeded tunnels and ore. Found and fixed an older bug on the way: three.js caches an InstancedMesh's bounding sphere from the all-hidden placed-block pool, so placed blocks could never be hit by the crosshair ray (you could not mine or place against your own walls); the sphere is now refreshed whenever a block is placed or removed. New `game/tests/cave-terrain.test.js` (19 checks incl. determinism across fresh loads, hills, trees, walkability, save and corrupt-seed handling, phone); the older cave suites use seed 0.
- A4 review follow-ups: the grass layer is no longer tunnelled inside the flat spawn clearing or under trees (spawn always solid, no floating trees); seed-sweep test; stricter terrain assertions.
- **Minecraft cave, slice A4 part 2 (day/night, darkness, lava):** a 240 s day/night cycle (starts each visit in the morning) drives the sky colour, fog, ambient light and a sun, with warm dawn/dusk tints and a ☀️/🌄/🌅/🌙 badge next to the health badge. Light now matters: under open sky it is bright, but roofed-over caves (and the shaft, fading with depth) drop to a dim ambient with dark fog at any hour, so you see by your own glow (stronger at night and when you hold a torch, which is also warmer) and by the torches you place. New **lava** cavern across the shaft from the water one: a glowing, scrolling 12th pixel-art texture with an emissive material and two orange lights; standing in it slows you like water and burns 2 HP every half second (and can kill you, respawning you on the surface), you cannot build into it. The ledge at the shaft side is the safe way in. Time of day is not saved (no save changes). New `game/tests/cave-daynight.test.js` (19 checks incl. 390x844 phone and the exact save key set).
- A4b review follow-ups: tree leaves no longer roof you over (sky light), lava burns in pits under it, lava flow speed is per second, touch exit hint moved below the hotbar so it never overlaps the badges, stronger lava-placement test.
- **The Realm, slice B1 (gate + bullet-hell arena):** a swirling violet **Realm Gate** now stands in the quiet north of the village (🌀 label, hint pill, Press E / Tap A). It opens the Realm, a local-only top-down bullet-hell arena drawn on a plain 2D canvas overlay (`game/realm.js`, new file): twin-stick controls (WASD + mouse aim, hold to fire or Space; on touch the left stick moves and the right stick aims and auto-fires; the arena turns portrait on phones), a villager sprite from your own species strip, a HP bar, wave counter, shard bank and Leave button. Three enemy patterns: **Whirlers** spin a steady spiral, **Snipers** circle you and fire aimed three-bolt bursts, **Bursters** drift in and fire rings of 14. Waves grow (3, 4, 5... up to 10 enemies, +15% HP per wave); clearing one pays a bonus and pops a banner. Everything that moves is a fixed pool (160 player bolts, 420 enemy bolts, 24 enemies, 180 particles, 28 floating numbers) and every sprite is baked once, so a long fight allocates nothing per frame. Feel: hit flash + screen shake, red vignette, floating damage numbers, kill bursts, shard counter that ticks up, i-frame flicker. Dying costs 20% of your banked 💎 shards and sends you back to the village beside the gate; leaving with Esc / the Leave button is free. Banked shards, kills, deaths and best wave are saved under the new additive, sanitised `realm` key. New `game/tests/realm.test.js` (28 checks incl. each pattern's geometry, pooling, perf, corrupt saves and a 390x844 phone run).
- Realm B1 review follow-ups: no double game loop after a death exit, input state reset on every run, baked hit vignette, banner timers cleared, you step out of the gate beyond its enter radius, looser perf thresholds, taller arena cap.
- **The Realm, slice B2 (loot, XP, levels, abilities, backpack):** kills now give XP (Whirler 7, Burster 5, Sniper 4, +10% per wave) toward 20 levels (30 xp for level 2, +20 more each level); every level gives +8 max HP, a partial heal, a burst and a banner, and unlocks abilities. About 30% of kills drop a glowing **loot bag** (colour = rarity) that drifts to you; items come in three rarities (common / uncommon x1.6 / rare x2.4, rarer deeper into the run) across three slots — weapon (Spark Wand +damage, Quickfire Wand +shots/s), charm (Hearty +max HP, Swift +speed) and ring (Lucky +shards, Scholar +XP, Warding +safe time after a hit). A 🎒 **backpack** (B / the button) pauses the fight and lists up to 24 items with stat text, Equip / Unequip (one item per slot) and Sell for shards; a full pack sells new finds on the spot. **Four abilities** on Q / E / R / F (or four touch buttons above the aim stick, with cooldown counters): 💨 Dash (Lv 1, 150 px + i-frames, 3 s), 💥 Nova (Lv 3, 16-bolt ring, 8 s), 🛡️ Shield (Lv 5, blocks 3 hits, 14 s), 🔥 Overdrive (Lv 7, double fire rate for 4 s, 20 s). Progress lives in the same additive `realm` key (`level`, `xp`, `items`, `eq`, `nextUid`), sanitised by `rmCleanSave` (old saves load as level 1; unknown / duplicate / malformed items dropped; pack capped at 24). Dying still only costs 20% of banked shards — you keep your level, items and loadout. New `game/tests/realm-progress.test.js` (26 checks incl. rarity distributions, each ability, backpack UI, corrupt saves and a 390x844 phone run).
- Realm B2 review fixes: swapping gear never heals (free-heal exploit), item ids reject built-in object names, oversized item arrays trimmed, the backpack closes when a run stops.
- **The Realm, slice B3 (biomes, wanderers, boss, kill board):** the arena now travels through three **biomes** every three waves — Violet Hollow, Ember Waste (pools of **lava** that burn 5 HP every 0.7 s, more Bursters) and Frost Mire (**ice** patches that slow you to 55%, more Snipers) — each with its own baked floor tile, border glow and hazard layout (3 pools, placed clear of you and of each other), looping after wave 9, with the biome shown in the HUD and the wave banner. Each wave also scatters 3-5 harmless **wanderers** (wisps / cinders / snow-puffs) to pop for shards and a little XP; they never block clearing the wave. Every fifth wave is the boss, **Gloomheart** (120 HP, +40 per tier): a spawn shield, then **three phases** — 1) a three-armed spiral plus aimed fans, 2) below 66%: it clears the screen, shields itself, summons two Snipers and fires rings of 20, 3) below 33%: ENRAGED, a double spiral plus rings, faster movement — with a phase-coloured boss bar under the HUD. Defeating it pays 40+10 per tier shards, 100 XP per tier, two loot bags (the first a guaranteed rare) and records your fastest time. A 📊 **kill board** (K / the button, one panel at a time with the backpack, pauses the fight) lists best wave, level, shards, falls, kills per enemy type, wanderers, boss kills and the fastest boss time. Everything lives in the same additive `realm` key (`kb`, `bossBestT`), sanitised by `rmCleanSave`; old saves start with an empty board. Wanderers, hazards and the boss use fixed pools and baked sprites. New `game/tests/realm-boss.test.js` (24 checks incl. each phase's bullet geometry, hazards, scaling, save round-trips and a 390x844 phone run).
- Landscape phones: with live players chatting the chat bar rose into the inventory strip (phone-panel failed against the unchanged build). Short landscape screens now show one chat line (none below 400px tall; bubbles and quick chat still work).
- Realm B3 review follow-ups: panels cannot be opened during the death message, lava only burns while a wave is running (not during the banner pause).
- **Minecraft cave, slice A5 (crafting table + pickaxe tiers, tied to the Workbench):** hotbar slot 7 is a placeable 🛠️ **crafting table** (4 wood, its own pixel-art texture, mines back for 3 wood). Aim at one and press **C** (or tap the new 🛠️ button) and the village **Workbench** opens above the cave and freezes it: every village recipe is craftable in the cave from the shared bag, plus three **pickaxe upgrades** — Stone (6 stone + 2 wood, 0.7x mining time, 150 blocks), Iron (4 iron ore + 2 wood, 0.5x, 300) and Gold (3 gold ore + 3 iron ore, 0.35x, 120). The same rows appear at the village Workbench, so you can craft before you dig. A pickaxe wears one durability per block broken, the held head takes the tier's colour, a ⛏️ badge shows tier and remaining blocks, and at zero it breaks (message, save updated) and you are back to the free wooden pickaxe; you can repair (re-craft) the tier you hold but not craft a worse one. Stored under the new additive `cavePick` key (`{tier, dur}`, sanitised: unknown tiers, zero durability and over-cap values fall back to wooden / the cap). Esc closes the bench without leaving the cave. New `game/tests/cave-craft.test.js` (24 checks incl. mining times per tier, wear and breaking, village tie, reload and corrupt saves, and a 390x844 phone run).
- A5 review follow-ups: C no longer opens the table while flying (it flies down), nothing can be placed / jumped / mined behind the open bench, Repair only when the pickaxe is worn, cave hotbar counts refresh after benching, the craft button releases focus.
- **The Realm, slice N1 (two-player co-op):** the Realm Gate now opens a small menu: **Go in alone**, or **invite** anyone else currently in town to fight together. The invited player gets a "🌀 … invites you" toast with Join / No thanks (anywhere in town, 40 s). Co-op is **host-authoritative**: the host runs the whole arena (enemies, bosses, hazards, loot, waves) and the guest sends only its position, aim, fire state and ability casts about 15x a second; the host sends compact snapshots about 10x a second (enemies, bags, hazards, wanderers, both players) plus a 1.2 s sliding window of sequenced one-shot events (enemy bolts, player bolts, banners, rewards, loot) so a lost write cannot drop an event. Bolts are replicated by their fire event and flown locally, not streamed. Enemies and the boss target whoever is nearest; with a partner enemy and boss HP are x1.7. When you reach 0 HP you are **down** instead of out, and your partner revives you by standing beside you for 2 s (50% HP); the run only ends when both are down. Rewards come as base values and are paid with each player's own multipliers; loot bags belong to whoever touches them; XP, shards, level, items and the kill board stay in each player's own additive `realm` save (no save changes). A partner HP badge shows under the HUD. Networking: new `realmInvites/{playerId}` and `realmParties/{party}` Firebase paths (`Net.realmInvite / realmListenInvites / realmWatchGuest / realmAccept (transaction) / realmOpenLink / realmCancel` in `net.js`; writes are rate-limited and size-capped, lobbies and links remove themselves on leave or disconnect, an invite is consumed once and expires after 90 s). Everything off the wire goes through `rtCleanInput` / `rtCleanSnap` in the new `game/realm-team.js`. 1v1 duel and 2v2 arenas will reuse the same link. New `game/tests/realm-team.test.js` (16 checks: two ADMIN pages over an in-memory relay for entry, mirroring, positions, tougher enemies, down/revive, hostile messages and leaving, then the real Firebase invite round-trip with cleanup verification).
- N1 review follow-ups: a team wipe now reaches the guest immediately, the host enforces ability cooldowns, the event queue stops when alone, a downed player in lava keeps their revive timer, the backpack/board no longer pause a shared run, team rewards only accept known kinds, and a late invite accept cannot leak a link.
- **The Realm, slice N2 (1v1 duel):** the gate menu now has a **⚔️ Duel** button next to each player's Invite; the other player sees "⚔️ … challenges you to a duel in the Realm!" with Join / No thanks. It reuses the co-op link and the invite paths (`mode: 'duel'` is the only new field; invites normalise anything else to co-op). A duel is a **best of 3** fought with **identical stats** — 100 HP, 8 damage per bolt, 6 shots/s, no gear, level or shards — with only **Dash** allowed (the other abilities are refused). The host referees: each round starts with both fighters sent to opposite sides at full HP with a protected 2.4 s countdown and a FIGHT! banner, bolts hurt the other fighter only (0.12 s of protection after a hit), a KO scores the round, and the first to 2 ends the duel with a result banner; both players are then back in town. The HUD shows `⚔️ you–them · R<round>`. Guest stats sent over the wire are ignored in a duel (HP, damage and fire rate are fixed by the host), nothing is paid or saved (no save changes), and the snapshot gained a sanitised 4-number `du` field plus a `dpos` event for round resets. New `game/tests/realm-duel.test.js` (13 checks: identical stats, countdown, exact 8-damage hits both ways, KO scoring, round reset, Dash-only, finishing the match with an untouched save, hostile guest stats, and a real Firebase Duel invite with cleanup). Older Realm tests now enter through `enterRealm()` because the gate opens the menu.
- **The Realm, slice N3 (2v2):** the gate menu now has a **2v2** button beside Invite and Duel. Press it for three other players in town (the host sees "2v2 lobby: n/3 joined"); each gets a "⚔️ … invites you to a 2v2" toast, and when the third one presses Join the match starts. Teams are fixed by seat: **Team A** = you + the first to join, **Team B** = the other two (a banner names them). Rules are the duel's, per side: identical stats (100 HP, 8 damage per bolt, 6 shots/s, Dash only), best of 3, a protected countdown each round, no friendly fire, and a fighter who is hit to 0 is out for the round; a round goes to a side when everybody on the other side is down (a double KO replays it). Fighters see allies ringed green and opponents ringed red with name tags, a corner badge follows your teammate, and the HUD score is from your own side. A guest who leaves or stops answering for 8 s is out for the rest of the match (the match ends if they all leave). The link was generalised from one guest to seats: the party lobby takes `guest`, `guest2`, `guest3` (a transaction picks the first free seat and `cap` limits co-op/duel to one), each guest writes its own `g1..g3` node, the host listens to all three and writes one broadcast `h` carrying up to four players plus their names. Hostile guests are still clamped host-side per seat (stats, movement budget, ability cooldowns, unknown seats ignored). Co-op and duel behave as before (the invite rate limit dropped from 3 s to 1.5 s so a lobby fills quickly). New `game/tests/realm-2v2.test.js` (19 checks across four ADMIN pages: relay-driven fight rules including friendly fire, partial vs full wipes, scoring on all four screens, resets, hostile seats and leaving, then a real four-player Firebase lobby with cleanup).
- N3 review follow-ups: early 2v2 joiners wait for the host (no 8 s timeout before the first snapshot), the whole opposing side leaving ends the match, up to six invites for three seats, only invited players can take a seat, and the PvP movement limit applies in every phase. Team tests now ignore other real players' invites and wait for their own records to clear.
- **Mad Maze, standalone page shell:** `game/games/mad-maze/index.html` + `mad-maze.js` host the same `RealmArena` (`realm.js`, unchanged entry point for the town) on its own page: solo and offline (no Firebase, no `realm-team.js`), the arena overlay markup copied in, on-screen sticks and ability buttons wired, `?test=1` and a `window.__mm` hook, and a Leave/death exit back to the town. It reads and writes only the existing `realm` field of `pixeltown-save-v1` (same load/write glue as `main.js`). Test: `game/tests/mad-maze-shell.test.js`. Not built: co-op/duel/2v2 on this page, a lite party code, and using the Lantern's hero in the run (see The Lantern below).
- **Mad Maze, Warren dungeon run (`?mode=dungeon&seed=N`):** `games/mad-maze/dungeon.js` turns the arena into a seeded dungeon through additive hooks (`arena.dungeon`, `arena.fixedWorld`, `setWalls`): `MMWarren` builds the room graph, `MMRooms` the 17x13 rooms, `MMEnemies` plans each encounter, `MMDungeonState` owns the rules. Occupied rooms seal their doors until cleared; a key room holds a key that opens one locked door to a treasure vault with a chest (paid through the normal item pipeline); a **secret room** sits behind a cracked wall that three real bolt hits open (1, 2, then open) and holds its own chest; a mini-map (Tab toggles) draws only visited rooms plus their direct neighbours and never the secret room; the boss, Queen Burrowmole, has three phases (66% / 33% HP, a brief invulnerable beat on each change), sweep and wall-gap patterns from `MMPatterns2`, then an exit portal and a loot summary listing every item won (+60 shards and XP for the boss). `?seed=` is sanitised (a hostile value is ignored: review BLOCK fix) and Tab is not swallowed on the summary. The default page without `?mode` is still the solo arena. Test: `mad-maze-dungeon.test.js` (determinism, sealed/clear/cross, key, chest, secret, map, boss phases, summary, phone, hostile seed). Unfinished: art is procedural only (no new sprites); `MMLabyrinth` / Hedge Tide exists but no run uses it; dungeon runs are not synced for co-op; the Lantern hero's class, stats and stash are not applied; only a handful of existing item ids are dropped (`MMItems` tiers are not used).
- **Realm core: cross-tab save merge (`realm.js`):** `rmMergeSave` re-reads `pixeltown-save-v1`, merges and writes on every save, so two tabs no longer clobber each other. Best wave / kills / deaths / kill-board counts take the max, boss time the min, level+xp the leader, shards apply only this tab's delta on top of the stored total (`_baseShards`), and items use a **three-way merge by uid** (`_known` = uids storage held at the last sync): an item sold in another tab stays gone, a new one appears, and a **uid collision** between two different items gives this tab's item a fresh uid and remaps the equipped slot (review fixes: sold items stay gone, no duplicates, equip follows renumbered items). A `storage` event on the save key triggers `resyncSave()` so an open tab picks up the other tab's changes. Test: `realm-core.test.js`. Known limits: equipment is per-tab, level/xp is "leader wins" rather than summed (two tabs levelling at once lose the smaller gain), and only the `realm` field is merged (the rest of the save is written as before).
- **Realm core: tile walls and guard + hit dot:** the arena has a 40px wall grid (`RM_TILE`, `setWalls(rows)`) with axis-by-axis sliding; `MMStats` formulas feed a guard stat (`_calcGuard`; enemy bolt damage = max(dmg - guard, 25% of dmg), guard 0 leaves damage unchanged) and a small baked **hit dot** shows the real hitbox. Tests: `realm-core.test.js`, `shared-mm-stats-patterns.test.js`.
- **Realm: gamepad, touch aim assist, sound effects, reduce-motion:** the first connected pad feeds move / aim / fire / four abilities / pause (`MMPad`; dead zone 0.22, right stick or RT fires, Start pauses); touch aiming snaps to the nearest enemy within a 14 degree cone (`MMAim`, with an on/off toggle); synthesised sound effects and optional music via `MMSfx` (audio unlocked on the first gesture); `MMMotion` reads the OS reduce-motion setting live and damps shake and flashes; `MMHash` (spatial grid) is wired for bolt tests. Each piece degrades to a no-op if its script is missing. Tests: `shared-mm-pad-aim.test.js`, `shared-sfx-motion.test.js`, `realm-bullet-bench.test.js`, `realm-polish.test.js`. Unfinished: biome music, colour-blind palettes and key remapping (`MMAccess` is not wired in).
- **Realm: enemy patterns routed through `MMPatterns`:** Whirler spirals, Sniper bursts, Burster rings and the boss spiral take their bolt geometry from `MMPatterns` (`spiralAngle`, ring and aimed fans) instead of inline trig; behaviour is unchanged. Test: `realm-patterns.test.js` plus the existing `realm*.test.js` gate.
- **Pure shared modules (`game/shared/`, UMD, no DOM, each with a Node test in `game/tests/shared-*.test.js`):** `rng` (seeded), `store` (never-throwing localStorage wrapper), `mm-stats`, `mm-patterns` + `mm-patterns2`, `mm-hash`, `mm-warren`, `mm-labyrinth` (49x49 maze + Hedge Tide), `mm-rooms` + `mm-enemies` (templates, autotiler, five Bramble enemies, threat-budget planner), `mm-dungeon-state`, `mm-items` (tiers, bags, drops, XP curve, potions), `mm-classes` (8 classes, ability effect descriptors, unlocks), `mm-profile` + `mm-backup` (the `pixeltown-mm-v1` sanitiser with Fall / Rekindle / Retire, backup bundle), `mm-island` + `mm-wilds` (island generator, roaming groups, quest arrow), `mm-events` (Wild Event scheduler, Wilds closing machine), `mm-bounties` (3 daily bounties per date), `mm-pets` (eggs, hatch, follow, Mend, feeding), `mm-daily` (Daily Maze seed, Stroll mode), `mm-ghost` (delta-encoded run paths, <= 3 KB), `mm-board` (leaderboard entry validation, no network), `mm-access` (colour-blind palettes, bullet outline, remapping), `mm-tutorial`, `mm-map` + `profile.js` (hub map data, BFS, unlocks, medals; hub profile seeding), `mm-chunks` + `mm-light` + `mm-recipes` (Deepdelve), `mm-angler` (48 fish, reel model, bosses, bite timing, journal), `mm-jam` (rhythm judge), `mm-stalk` (turnip-week sim), `mm-bugs` (90 s run logic), `mm-party` (party codes, seats, host migration, damage clamp, soulbound loot, bandwidth guards), `rules-check` (offline `.validate` evaluator), plus `mm-pad`, `mm-aim`, `sfx`, `motion`. **Module + tests only, not used by any page yet:** `mm-labyrinth`, `mm-pets`, `mm-events`, `mm-bounties`, `mm-island`, `mm-wilds`, `mm-daily`, `mm-ghost`, `mm-board`, `mm-access`, `mm-tutorial`, `mm-jam`, `mm-stalk`, `mm-party` and `rules-check`. Used: `mm-stats`, `mm-hash`, `mm-pad`, `mm-aim`, `sfx`, `motion`, `mm-patterns` (Realm); `rng`, `mm-warren`, `mm-rooms`, `mm-enemies`, `mm-dungeon-state`, `mm-patterns2` (dungeon run); `mm-items`, `mm-classes`, `mm-profile`, `mm-backup` (Lantern); `mm-map`, `profile.js` (hub); `mm-angler`, `store` (Angler); `mm-bugs` (Safari); `mm-chunks`, `mm-light`, `mm-recipes` (Deepdelve).
- **The Lantern (`games/mad-maze/lantern.html` + `lantern.js`):** the Mad Maze hub page. Create heroes (Ranger, Frostcaller, Herald, Punk, Bruiser; Classic or Picnic mode in the form; up to 12 heroes), a 16-slot **stash** and a carry list (move items both ways), a Fountain (Rest), **Fall** (Classic only; banks fame and may leave a Keepsake in the stash), **Rekindle** (a new hero at half level; refused for Hardcore) and **Retire** at level 20 (two-tap confirm, Hall of Heroes), a "What is a Fall?" explainer, friendly item names with tier badges, hero cards, keyboard access, and a **Start run** link to the Mad Maze page. A one-time "Bring my hero" import copies the town's `realm` save into a Legacy Ranger (copied, never moved). **Backup / Restore:** Back up downloads `mad-maze-backup.json` (the known `pixeltown-*` keys); Restore is two steps: `MMBackup.plan` validates and cleans every value through its owner module and the page lists what would change, then **Confirm** calls `MMBackup.apply`, which snapshots first and rolls every key back if any write throws (focus-trapped panel, Escape cancels, files over 3 MB and unknown keys are refused). That confirmed Restore is the only write a Mad Maze page makes to `pixeltown-save-v1`. Keys: `pixeltown-mm-v1` (heroes, stash, fame, Hall) and `pixeltown-mm-active-v1` (selected hero). Tests: `lantern-page.test.js`, `lantern-polish.test.js`, `shared-mm-profile-backup.test.js`. Unfinished: the selected hero is saved but no run reads it (Start run opens the arena with the old `realm` save), stash items and class abilities do not reach the arena, a dungeon or arena death does not Fall a hero, and "Test a Fall" is a testing aid.
- **Hub page / world map (`hub/index.html`, `hub.js`, `hub.css`):** a Mario-World-style overworld on one canvas with procedural pixel art, no libraries and no network: the walker follows BFS paths, tap or arrows / WASD / D-pad moves, Enter / Space / A opens a node card (Esc closes), an iris transition leads into the node, and node exits / medals / keys / path unlocks come from `MMMap` (39 nodes over worlds W0..W6). Its own key is `pixeltown-hub-v1`; it only READS `pixeltown-profile-v1` and the town save (seeding the walker's name and species) and never writes them. Tests: `hub-page.test.js`, `shared-hub-map.test.js`. Playable nodes: Hearthvale (two nodes), The Lantern, Deepdelve, Lakeside Angler, Bug Safari. Not built: Campfire Jam and Stalk Market pages (their nodes point at `games/jam/` and `games/stalk/`, which do not exist), the Comet Trail challenge nodes, roamers, the Snack Stand, Tokens, and games reporting results back to the hub (the Angler, Safari and Deepdelve pages do not write the profile).
- **Lakeside Angler (`games/angler/index.html`, `angler.js`; logic `shared/mm-angler.js`):** hold Space / the pointer / the pad to reel; the reel mini-game keeps tension inside a zone whose width depends on the rod. Six spots (west, east, river, pier, ice, and a secret mangrove after 10 species are caught), 48 fish by season / time / weather (a calm pseudo-forecast from the real date, no network), size rolls, four rods and lures unlocked from the journal (a hand-edited locked gear falls back to the starter kit), three **boss fish** (Old Whiskers, Pier Kraken, Ice Queen Pike) with phases and a line that snaps after 1.5 s at max tension, trophies, a journal overlay and a gear overlay. Bait: `?bait=N` (0-99) sets bait; each cast spends one for a quicker, richer bite; never a purchase. Key `pixeltown-angler-v1`. Tests: `angler-page.test.js`, `angler-polish.test.js`, `shared-mm-angler.test.js`. Unfinished: no link to the town's Angler's Journal or aquarium, bait is not earned from Bug Safari, no tournament, no medals sent to the hub.
- **Bug Safari (`games/festival/bugs.html`, `bugs.js`; logic `shared/mm-bugs.js`):** a 90 s net run on a 20x14 tile canvas, eight arenas (meadow, orchard, pond, forest, dunes, cliffs, marsh and the night "lantern" arena); WASD / arrows walk, Shift sneaks, Space / click / the Swing button nets. Bugs hide in flowers, burrow in mounds when you move, and swarms scatter together; standing still near a mound lures the Antlion; Gold Beetle and the night-only Moonwing are the rare catches. First-run hint card, end-of-run summary with stars per arena, a journal, sound through `MMSfx`, live reduce-motion. Keys `pixeltown-bugs-v1` (stars, journal) and `pixeltown-bugs-hint-v1` (hint seen). Tests: `bugs-page.test.js`, `bugs-polish.test.js`, `shared-mm-festival.test.js`. Unfinished: no medals or secret-exit key sent to the hub, no link to the town's Bug-Off.
- **Deepdelve, first page (`games/deepdelve/index.html`, `deepdelve.js`):** a standalone three.js voxel mine: a chunked world (`MMChunks`, seeded by `?seed=N`; the value is clamped to an integer 0..999999999 and a hostile value falls back to seed 1), face-culled meshes, per-vertex light from `MMLight`, walk / jump with swept collision, mine and place blocks, a hotbar (1-9 or wheel), **C** crafts 4 torches (1 wood + 1 coal), pointer-lock look on desktop, joystick + drag-look + buttons on phones, view distance 5 chunks on desktop and 3 on a phone. Edits are saved as chunk diffs in the IndexedDB database `pixeltown-deepdelve-v1` (in-memory fallback if blocked). Loads three.js from the pinned CDN URL. Test: `deepdelve-page.test.js`. Unfinished: only the torch is craftable on the page (the 24 `MMRecipes` and the furnace are not wired), no mobs, no day/night, lava, water or health, no goals, medals or Rock Wyrm, no import of the town cave's state, and the in-town cave (`underground.js`) is unchanged.
- **Town links (`index.html`, `main.js`, `style.css`):** the Realm Gate menu has **Open Mad Maze (new)** (opens `games/mad-maze/index.html`), the "In town" panel has a **World map** link to the hub, the page title and heading now say **Hearthvale** (the save key, URL and installed-app name stay Pixeltown), and arriving with `?from=hub` shows a **Back to the map** pill (hidden again after joining) and prefills name / species / frame from the hub profile only when the form is empty (read-only, never writes storage). Test: `town-links.test.js`. The in-town Realm arena stays available.
- **Draft Firebase validation rules (`game/firebase-rules.draft.json`, `design/FIREBASE-RULES-NOTES.md`, `shared/rules-check.js`) - NOT APPLIED:** `.validate`-only rules (`.read` / `.write` stay `true` because there is no sign-in) for players, playerCount, chat, guestbook, blocks, scavenger, tournament, walkie, `realmInvites` and `realmParties` (seats `g1`-`g3`, `m`, `h` only; texts and snapshot arrays size-capped; unknown top-level paths refused). Nothing deploys them: the owner pastes the file into the Firebase console (Realtime Database > Rules), after trying it in the Rules Playground (steps and a rollback tip are in the notes). `RulesCheck` is a small offline evaluator and `shared-rules-draft.test.js` checks the file against valid and hostile samples. Limits: no identity (anyone can still write any seat or impersonate), no rate limiting, no total-size cap on a snapshot, and some x/y/event ranges are inferred from code, so a legitimate write could be refused until loosened (failed writes fail silently in the game).

- Realm: dying no longer costs banked diamonds; you get a Survivor's Cache item (rarity by wave reached) instead. New in-Realm shop (V key or the backpack Shop button) sells gear for diamonds with fixed stock unlocked by best wave.

- Realm: Combine in the backpack: 3 identical items fuse into one of the next rarity (Common > Uncommon > Rare > new Epic, +50% each step; the equipped copy is upgraded so damage rises at once). Epic cannot be bought or dropped.
