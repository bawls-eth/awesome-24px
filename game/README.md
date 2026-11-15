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
- **Fish** at the pond, **chop** trees for wood, **mine** rocks for stone —
  classic Animal Crossing activities, fill the inventory in the top-left
- **Build**: spend wood to place grid-snapped blocks anywhere — a real
  obstacle everyone sees and collides with, Minecraft-sandbox-flavored.
  Tap your own block again to remove it for a refund
- A day/night tint that follows your local clock, purely for atmosphere
- Full mobile support: on-screen D-pad, tilt steering, and an Interact/Build
  button pair so every activity works with a tap
- A Bored Ape "Mayor" statue watches over the plaza, and Moon Cats drift
  lazily around the pond — pure flavor, no gameplay attached

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

**Mobile (iPhone/Android):** on-screen controls appear automatically on touch
devices — a D-pad (bottom-left), and action buttons (bottom-right): 🎮 Tilt,
🧱 Build, ✋ Interact, 😀 Emotes, 💬 Chat.
- **🎮 Tilt** — tap once to enable; iOS will ask for a Motion & Orientation
  permission (required by Apple, can't be skipped) — tilt the phone like a
  steering wheel to walk
- **✋ Interact** does the same thing as desktop's E — fish/chop/mine/build.
  **Shaking the phone** is a fun bonus trigger for the same action, if
  something's in range
- **💬** focuses chat, **➤** sends it

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
- **`firebase-config.js`** — your project's keys (the one file you edit).
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
  and rejoins (no accounts, no persistence). Wood/stone/fish counts are
  purely local and reset on refresh. Placed **blocks persist** in the shared
  database until removed, capped at 150 total.
- Position updates are throttled to ~10/sec per player — smooth, and well
  within Firebase's free tier for a handful of friends.
- Firebase's "test mode" rules are wide open (see below) — fine for a link
  you only share with people you trust, not for posting publicly. Anyone
  can remove anyone else's placed block if you tighten the rules without
  also adding ownership checks there — the client enforces "your blocks
  only" but test-mode rules don't.

## Ideas for next steps

- Firebase Anonymous Auth so writes require `auth != null` (safer public link)
- Persistence: remember your name/avatar/score/inventory across visits
- More block types (stone blocks, decorative items) and a crafting recipe or two
- Weather, seasons
- More villager species from the rest of the collection (plain rocks, genius…)
- Per-player "homes" / multiple rooms instead of one shared map
