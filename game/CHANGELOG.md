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
