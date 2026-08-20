# Pixeltown

A tiny Animal Crossing-style shared town for you, your girlfriend, and your
friends — built straight on top of this repo's 24×24px sprite collections.
Pick a villager (cat, punk, penguin, or dog), walk around a little pixel
town, and chat with whoever else is online, all in real time.

No accounts, no database, no build step — just a Node server and a browser.

## Run it locally

```bash
cd game
npm install
npm start
```

Then open **http://localhost:3000** in your browser. Open it in a second
tab (or have someone else on the same network hit your machine's IP on port
3000) to see multiplayer working.

## Play with your girlfriend / friends over the internet

The simplest option while you're testing: run it on your machine and share
your local network, or use a tunnel like [ngrok](https://ngrok.com):

```bash
npm start
# in another terminal
ngrok http 3000
```

Send the `https://...ngrok-free.app` URL it prints to whoever you want in
the town.

For something more permanent, deploy it to Render — free, and this repo is
already set up for it via `render.yaml` at the repo root:

1. Push this repo to GitHub (already done if you're reading this from there).
2. Go to [render.com](https://render.com) → **New** → **Blueprint**, sign in
   with GitHub, and pick this repo (`awesome-24px`).
3. Render reads `render.yaml` automatically — it already knows to build
   from the `game/` folder, run `npm install` then `npm start`, and use the
   free plan. Click **Apply**.
4. In a minute or two you'll get a URL like `https://pixeltown-xxxx.onrender.com`
   — send that to your gf/friends.

Notes on the free plan: the service spins down after ~15 minutes with no
traffic and takes ~30-50s to wake back up on the next visit (the first
person just has to wait a bit) — fine for a casual hangout, not for
guaranteed instant joins. Upgrading to a paid Render plan removes that.

No environment variables are required (Render sets `PORT` for you). No
database — state is in-memory and resets on every restart/redeploy/sleep
cycle, so player positions and chat history don't persist between sessions.

Other Node hosts (Railway, Fly.io, a cheap VPS) work too if you'd rather
not use Render — same start command (`npm start` / `node server/index.js`),
same "no env vars, no database" notes.

## How it works

- **`server/index.js`** — Express serves the client and the sprite assets
  (straight from the repo's `i/` folder, no duplication); Socket.io tracks
  connected players and relays movement + chat.
- **`client/`** — plain HTML/CSS/JS. [Phaser 3](https://phaser.io) (loaded
  from a CDN) renders the town; the join screen is a plain DOM overlay.
- The town map (pond, bridge, path, campfire, forest ring, tulip beds) is
  drawn procedurally in `client/main.js` — no external tileset needed.
- Villager avatars are sliced directly from `i/coolcats-strip.png`,
  `i/punks-strip.png`, `i/pudgypenguins-strip.png`, and `i/doge-strip.png`
  (each a 9-frame, 24×24-per-frame strip) using Phaser's spritesheet loader.
- The source sprites are single-pose (no walk-cycle frames), so movement
  animation is faked with a procedural squash-and-stretch hop + shrinking
  ground shadow, synced to whether each player is actively moving — no
  extra art needed, and it reads as a proper walk cycle in motion.

## Controls

- **WASD** or **arrow keys** — walk
- **Enter** — open chat, type, **Enter** again to send

## Ideas for next steps

This is a deliberately small first version. Natural things to add next:
- Persistence (save player position/name/avatar across sessions — e.g. SQLite or Redis)
- Placeable furniture/decorations, a simple inventory
- Day/night cycle, weather
- More villager species from the rest of the collection (apes, rocks, tulips as pets?)
- A "home" per player / multiple rooms instead of one shared map
