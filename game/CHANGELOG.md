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
- Nook Miles-style achievements — now 16 lifetime goals, each with a one-
  time ⭐ bonus (Lumberjack, Miner, Angler, Gardener, Fencer, Chatty,
  Photographer, Paleontologist, and more)

## Villagers and expression

- Expanded the villager roster from 9 to 21 species, pulled from this
  repo's own unused sprite collections (Alien Clan, Dragon/Frog/Ninja/
  Pirate/Unicorn Cats, Geniuses, Golden/Halloween Punks, Phunks, Punkettes)
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
