# Pixeltown

A tiny Animal Crossing-style shared town for you, your girlfriend, and your
friends — built straight on top of this repo's 24×24px sprite collections.
Pick a villager from 9 species (cats, punks, penguins, dogs, apes, zombies,
mohawks, blondies, aliens), walk around a little pixel town, chat, throw
emotes, and race for sparkles — all in real time.

It's a **static site** (no server to run) + a **free Firebase Realtime
Database** for the live multiplayer sync. That means it can be hosted for
free on GitHub Pages, and everyone's position/chat/score updates push to
everyone else automatically. Capped at **10 players** at once for now.

**What there is to do:**
- Walk the town, chat, hang out by the campfire, the pond, or the statue
- 5 emotes (keys **1-5**) that pop up over your head for everyone to see
- A rotating **✨ sparkle** wanders the town every 8s — walk into it to
  score a point; the player list is a live-sorted mini-leaderboard
- **Fish** at the pond (or the second pond out east), **chop** trees for
  wood, **mine** rocks for stone — classic Animal Crossing activities, fill
  the inventory in the top-left
- **Catch butterflies** 🦋 — eight of them flutter around town; walk up and
  press interact to net one. They respawn elsewhere after a few seconds
- A tool shows in your hand as you work: axe for trees, pickaxe for rocks,
  net for bugs — and underground your villager becomes a 3D voxel figure
  (extruded from its own sprite) carrying a pickaxe
- **Build**: spend wood to place grid-snapped blocks anywhere — a real
  obstacle everyone sees and collides with, Minecraft-sandbox-flavored.
  Tap your own block again to remove it for a refund. An unmissable yellow
  banner tells you when build mode is on
- **Sell** your wood/stone/fish/bugs at the 🏠 shop near the statue for ⭐ points —
  a proper Nook's-Cranny-style loop that feeds the leaderboard
- A day/night tint that follows your local clock, purely for atmosphere
- Full mobile support: on-screen D-pad, tilt steering, and clearly-labeled
  **A** (interact) / **B** (build) action buttons, console-controller style
- A **walkie-talkie** — pick a bestie from the player list, hold to record
  a short voice clip, they hear it right away if their tab's open (see
  "Walkie-talkie" below)
- A Bored Ape "Mayor" statue watches over the plaza, and Moon Cats drift
  lazily around the pond — pure flavor, no gameplay attached
- A wide **East Meadow** past the original town — walk east along the main
  path to find a second pond (with its own fishing spot), more trees, rocks,
  and tulip beds to explore
- A real **3D voxel cave** underground — find the ⛏️ hole north of the
  statue, press **E** to jump in, and mine/place real 3D blocks Minecraft-
  style. Climb back up the shaft and press **E** again to pop back to the
  2D town (see "Going underground" below)
- Your name, villager choice, and wood/stone/fish inventory are remembered
  on this device (see "Local save" below) — no account, nothing synced
- On iPhone/Android, you can **Add to Home Screen** for a proper app icon
  and a full-screen launch (no Safari address bar)

## Setup — the one manual step (~5 minutes)

Pixeltown needs a free Firebase project to sync players. A static page can't
store shared data by itself, so this is unavoidable — but it's quick and
free (no credit card).

1. Go to <https://console.firebase.google.com> and **Add project** (any name;
   you can disable Google Analytics).
2. In the project: **Build → Realtime Database → Create Database**. Pick a
   location, then choose **Start in test mode** and enable it.
3. Click the **gear icon → Project settings**, scroll to **Your apps**, and
   click the web icon **`</>`** to register a web app (any nickname; you do
   NOT need Firebase Hosting).
4. Firebase shows a `const firebaseConfig = { … }` snippet. Copy that object
   and paste it over the placeholder in **[`firebase-config.js`](firebase-config.js)**.
5. Commit and push. That's it.

> The Firebase web config keys are **safe to commit** — they're meant to be
> public. Access is controlled by the database rules, not by hiding the keys.

### Locking the rules down a little (optional but recommended)

"Test mode" lets anyone read/write and auto-expires after 30 days. For a
friends-only town, in **Realtime Database → Rules** you can paste something
like this (open, but with basic shape/size limits so nobody can dump junk):

```json
{
  "rules": {
    "players": { ".read": true, ".write": true },
    "blocks": { ".read": true, ".write": true },
    "walkie": { ".read": true, ".write": true },
    "chat": {
      ".read": true,
      "$msg": {
        ".write": true,
        "text": { ".validate": "newData.isString() && newData.val().length <= 140" }
      }
    }
  }
}
```

This is still world-writable (fine for a link you only share with friends).
For anything more public, add Firebase Anonymous Auth and gate writes on
`auth != null` — see the "Ideas for next steps" below.

## Host it free on GitHub Pages

1. Push this repo to GitHub (done, if you're reading this there).
2. Repo **Settings → Pages**. Under **Build and deployment**, set **Source =
   Deploy from a branch**, pick your branch and folder **`/ (root)`**, then
   **Save**. This is the one step I can't do for you — it's a repo-admin
   setting change, not something a `git push` can flip.
3. Wait a minute, then open your repo's Pages URL — the root now redirects
   straight into the game (`index.html` at the repo root sends you to
   `game/`). For this repo that's `https://bawls-eth.github.io/awesome-24px/`.
4. Send that link to your gf/friends. Everyone who opens it and picks a
   villager shows up in the same town.

No cold starts, no server bill, nothing to keep running — GitHub Pages
serves the files and Firebase handles the live sync.

## Run it locally

Because it's just static files, any static server works — you don't need
Node. From the **repo root**:

```bash
python3 -m http.server 8000
```

Then open **http://localhost:8000/game/**. (Opening `index.html` directly
via `file://` won't work — the sprite sheets need to load over http.)

## Controls

**Desktop:**
- **WASD** or **arrow keys** — walk
- **E** — interact: fish at the pond, chop a tree, mine a rock, or place/remove
  a block if you're in build mode (whichever's nearest to you)
- **B** — toggle build mode
- **Enter** — open chat, type, **Enter** again to send
- **1-5** — emote (👋 😀 ❤️ 😂 🎉), visible to everyone nearby
- Walk into the **✨ sparkle** to score a point
- Jump in the ⛏️ **Hole** (press E) for the 3D underground — see "Going
  underground" below for its own controls (look-drag, mine **E**, place **F**)

**Mobile (iPhone/Android):** on-screen controls appear automatically on touch
devices — a D-pad (bottom-left), and action buttons (bottom-right): 🎮 Tilt,
🧱 Build, ✋ Interact, 😀 Emotes, 💬 Chat.
- **🎮 Tilt** — tap to enable; iOS will ask for a Motion & Orientation
  permission the first time (required by Apple, can't be skipped) — tilt
  the phone like a steering wheel to walk. Tap again to turn it off
- **✋ Interact** does the same thing as desktop's E — fish/chop/mine/build.
  **Shaking the phone** is a fun bonus trigger for the same action, if
  something's in range
- **💬** focuses chat, **➤** sends it
- Your 🎒 bag (top-left) shows your wood/stone/fish; a visible rod line
  appears between you and the water while you're fishing

### Fishing

Walk up to the pond's edge (west side or south dock) and press **Interact**.
Wait for a **❗** — that's the bite — then press **Interact** again within
about a second. Too early and the fish gets spooked; too late and it gets
away. Catches add to your 🐟 count (inventory only, not the leaderboard).

### Building

Press **B** (or tap 🧱) to toggle build mode — a yellow outline shows where
the next block lands, just in front of you. Press **Interact** to place a
block there (costs 1 🪵), or press it again on a block you placed to remove
it for a refund. Blocks are real obstacles for everyone in the town, synced
live. Capped at 150 blocks total so the town doesn't fill up solid.

### Going underground

Find the dark ⛏️ **Hole** just north of the Mayor statue and press **Interact**
to jump in — the game switches from the 2D town to a real 3D voxel cave
(rendered with [Three.js](https://threejs.org), loaded from a CDN just like
Phaser).

- **Look:** drag with your mouse (desktop) or finger (mobile) to look around.
- **Move:** **WASD**/arrows (desktop) or the D-pad (mobile) — you walk in
  whatever direction you're looking, including up/down, so look down and
  walk forward to descend, look up and walk forward to climb. There's no
  gravity down here — it's a flight-style "creative mode" dig, not a fall.
- **Mine:** **E** (desktop) or ⛏️ (mobile) breaks whatever block is directly
  ahead of you, within reach. Stone and the rarer gold ore blocks add to
  your 🪨 stone count; dirt doesn't, it's just in the way.
- **Place:** **F** (desktop) or 🧱 (mobile) spends 1 stone to place a block
  where you're looking.
- **Exit:** climb back up the central shaft toward the surface — a yellow
  "Press E to climb out" banner appears once you're close enough — then
  press **E** (or the mobile ⬆️ button) to pop back into the 2D town, right
  where you left from.

The cave is generated once per visit and is **entirely local** — nothing
underground syncs over the network, so what you dig and build down there is
only ever seen by you (same as fishing/chopping in the 2D game). Stone you
mine underground *does* add to the same 🪨 count shown in the 2D inventory
and carries over to the shop, so a mining trip is a legitimate way to stock
up before selling.

### Walkie-talkie

Open the player list (top-right) and tap the 🤍 next to a friend's name to
make them your **bestie** — it turns 💛 and a "🎙️ Hold to talk · to \<name\>"
button appears near the top of the screen (desktop: hold **T** instead).

- **Hold** the button (or **T**) to record, **release** to send — clips are
  capped at 15 seconds.
- If your bestie's tab is **open and in front of them** right now, it plays
  the instant it arrives — genuinely real-time, no polling.
- If it's **not** — their phone's locked, they're in another app, or the
  tab's just in the background — the clip is saved as an unread **voice
  memo** instead of trying (and failing) to play. A pulsing **📬** badge
  with a count appears the moment they come back; tap it to play the
  oldest one (it's removed once played; tap again for the next).
- Clips are peer-to-peer through Firebase — base64-encoded audio sent
  straight to `/walkie/{their-id}`, the same database as everything else
  here, not a third-party calling service.

**The honest limit:** this is a plain web page, not a native app, so it
can't keep running or play audio while fully backgrounded or closed —
no iOS app can do that over plain web APIs without real push notifications
from a server, which is well beyond a free static-site + Firebase setup.
"Plays instantly" means *while the game tab is actually open and visible*;
otherwise it waits for you as a memo, which is what was asked for and is
the honest, reliable version of this feature on the web.

### Local save

Your name, villager species/color, and wood/stone/fish counts are saved to
this browser's `localStorage` (key `pixeltown-save-v1`) — purely on your
device, nothing sent anywhere. Reopen the page later and your villager and
inventory pick up where you left off. Clearing your browser data (or using
a different browser/device) starts fresh. Score isn't part of this — it
lives on the Firebase leaderboard and resets with each new join, by design.

### Add to Home Screen (iPhone/Android)

- **iPhone (Safari):** open the site → Share icon → **Add to Home Screen**.
  You get a proper icon (cropped from the Cool Cats sprite sheet) and it
  launches full-screen, no address bar.
- **Android (Chrome):** menu → **Add to Home screen** / **Install app**.

This works because of `game/manifest.json` and the icons in `game/icons/` —
if you want a different icon, swap the PNGs in that folder (keep the same
filenames/sizes: 180×180 for `apple-touch-icon.png`, 192 and 512 for the
manifest, 32×32 for the favicon).

## How it works

- **`index.html` / `style.css`** — the page shell and join screen.
- **`main.js`** — [Phaser 3](https://phaser.io) (from a CDN) renders the
  town and players; the map (pond, bridge, path, campfire, statue, forest
  ring, tulip beds) is drawn procedurally — no external tileset.
- **`net.js`** — the multiplayer layer. Players live under `/players/{id}`
  in the Realtime Database (position, facing, species, score, current
  emote); each client writes its own fields (position throttled to
  ~10×/sec) and Firebase pushes everyone else's changes live. Presence uses
  `onDisconnect()` so you vanish from the town when you close the tab.
  Chat lives under `/chat`; placed blocks live under `/blocks/{x}_{y}`,
  keyed by their grid position so there's never a duplicate at one spot.
- **`underground.js`** — the 3D cave, rendered with
  [Three.js](https://threejs.org) (also from a CDN) on its own `<canvas>`
  that's swapped in over the 2D game. Terrain is generated fresh each time
  you enter (a carved shaft + a couple of random-walk tunnels per depth
  level) and rendered with one `InstancedMesh` per block type for
  performance; mining/placing just hides/shows individual instances rather
  than rebuilding geometry. It's intentionally local-only, like
  fishing/chopping — no block sync, no multiplayer down there.
- **`firebase-config.js`** — your project's keys (the one file you edit).
- Walkie-talkie clips are recorded with `MediaRecorder` (picking whatever
  codec the browser actually supports — iOS Safari and desktop Chrome don't
  agree, so the format is negotiated, not assumed), base64-encoded, and
  pushed to `/walkie/{recipientId}`. The recipient's listener plays it
  immediately if `document.visibilityState === 'visible'`, otherwise queues
  it as an unread memo; either way the node is deleted once played so
  `/walkie` never grows unbounded.
- Villager avatars and decorations are sliced directly from the repo's
  `i/*-strip.png` sprite sheets (9-frame, 24×24-per-frame strips, 28×28 for
  Bored Apes) via Phaser's spritesheet loader — nothing pulled from outside
  this repo. The sprites are single-pose, so walking is faked with a
  procedural squash-and-stretch hop + shrinking ground shadow.
- The sparkle's position is derived from wall-clock time
  (`Math.floor(Date.now() / 8000) % spots.length`), so every client agrees
  on where it is without any extra network traffic — no server needed to
  referee it. Anyone nearby when it rotates scores a point, so it's casual
  and co-op rather than a first-click-wins race.
- Fishing/chopping/mining are entirely client-side (per-tree/rock/spot
  cooldowns, a timed bite window) — only the resulting wood/stone/fish
  counts live in your own browser; they don't sync or persist.
- Day/night tint reads each device's own local clock — cosmetic only, not
  synced (friends in different timezones will see different lighting).

## Notes / limits

- **10 players max** at once (change `MAX_PLAYERS` in `net.js`).
- State is ephemeral by design: players disappear when they leave, and chat
  history is just the last ~30 messages. Scores reset when a player leaves
  and rejoins (no accounts, no persistence there). Wood/stone/fish counts
  persist locally on this device (see "Local save" above) but don't sync
  anywhere. Placed **blocks persist** in the shared database until removed,
  capped at 150 total.
- The **underground cave is local-only and regenerates each visit** — it's
  not saved, not synced, and friends can't see each other down there (same
  scope as fishing/chopping — see "Going underground" above).
- Position updates are throttled to ~10/sec per player — smooth, and well
  within Firebase's free tier for a handful of friends.
- Firebase's "test mode" rules are wide open (see below) — fine for a link
  you only share with people you trust, not for posting publicly. Anyone
  can remove anyone else's placed block if you tighten the rules without
  also adding ownership checks there — the client enforces "your blocks
  only" but test-mode rules don't.

## Ideas for next steps

- Firebase Anonymous Auth so writes require `auth != null` (safer public link)
- Persistence: name/avatar/inventory now save locally (done); score/leaderboard across visits would need real accounts
- More block types (stone blocks, decorative items) and a crafting recipe or two
- Weather, seasons
- More villager species from the rest of the collection (plain rocks, genius…)
- Per-player "homes" / multiple rooms instead of one shared map
- Sync the underground cave (shared dig state, friends visible down there) —
  skipped for now to keep the first version simple and purely local
