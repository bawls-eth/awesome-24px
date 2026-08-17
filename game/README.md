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

For something more permanent, deploy the `game/` folder to any Node host
(Render, Railway, Fly.io, a cheap VPS, etc.):

- Start command: `npm start` (or `node server/index.js`)
- No environment variables required (optional `PORT`, defaults to 3000)
- No database — state is in-memory and resets when the server restarts

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
