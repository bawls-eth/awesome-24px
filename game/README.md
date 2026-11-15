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
- A day/night tint that follows your local clock, purely for atmosphere
- Full mobile support: on-screen D-pad, tilt steering, and shake-a-tree-for-a-point on phones
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
- **Enter** — open chat, type, **Enter** again to send
- **1-5** — emote (👋 😀 ❤️ 😂 🎉), visible to everyone nearby
- Walk into the **✨ sparkle** to score a point

**Mobile (iPhone/Android):** on-screen controls appear automatically on touch
devices — a D-pad (bottom-left), and 🎮/😀/💬 buttons (bottom-right) for
tilt controls, emotes, and chat.
- **🎮 Tilt** — tap once to enable; iOS will ask for a Motion & Orientation
  permission (required by Apple, can't be skipped) — tilt the phone like a
  steering wheel to walk
- **Shake** the phone near a tree to score a point (each tree resets after
  ~20s); shake anywhere else for a random emote
- **💬** focuses chat, **➤** sends it

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
  Chat lives under `/chat`.
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
- Day/night tint reads each device's own local clock — cosmetic only, not
  synced (friends in different timezones will see different lighting).

## Notes / limits

- **10 players max** at once (change `MAX_PLAYERS` in `net.js`).
- State is ephemeral by design: players disappear when they leave, and chat
  history is just the last ~30 messages. Nothing needs cleanup. Scores reset
  when a player leaves and rejoins (no accounts, no persistence).
- Position updates are throttled to ~10/sec per player — smooth, and well
  within Firebase's free tier for a handful of friends.
- Firebase's "test mode" rules are wide open (see below) — fine for a link
  you only share with people you trust, not for posting publicly.

## Ideas for next steps

- Firebase Anonymous Auth so writes require `auth != null` (safer public link)
- Persistence: remember your name/avatar/score across visits
- Placeable furniture/decorations, a simple inventory
- Weather, seasons
- More villager species from the rest of the collection (rocks, zombies, mohawks…)
- Per-player "homes" / multiple rooms instead of one shared map
