# Playtest / research bot

`run.js` plays the game the way a player does, at desktop 1280x720 and phone 390x844 (touch, deviceScaleFactor 1). It records a
webm video per segment, takes labelled PNG screenshots every few seconds and at key moments, and logs console errors, page errors
and failed requests. It is a research tool, not a test, so it never fails a build. It is not part of `run-all.js` or the beta gate.

```
NODE_PATH=$(npm root -g) OUT=/tmp/playtest node game/tools/playtest-bot/run.js
```

Env: `OUT` (artifact dir, default `/tmp/playtest`), `PORT` (default 8561; a `python3 -m http.server` on the repo root is started
if nothing answers), `ONLY=desk|phone`, `SEGS=` (comma list of segment names, default all), `THREE_JS` (local three.min.js for Deepdelve), `SHOT_EVERY` (ms, default 4000).

Segments per viewport: `hero-create` (fresh profile: class cards, create, picker with portraits, stats tab), `town-realm` (join
form; with the DB blocked the join times out, the bot presses "Play offline", walks the offline town, opens the Realm Gate and
plays the embedded Realm), `world` (shore play toward the centre, then 15-18 s in the
midlands, highlands and godlands, Esc menu, hero stats, backpack, shop, kill board, big minimap, a shrine, a camp, an NPC, a portal
into a dungeon and back), `nexus-quests` (real kills near the spawn, finishing three enemies next to the hero to see pickups,
status icons, the Nexus plaza, the quest board and a claim, the unlock toast after a hook level-up, the ability sheet),
`dungeons` (all four `?biome=`, then a walk through the door graph to each biome boss and a short fight), `lantern`, `games` (Deepdelve, Angler, Campfire Jam, Stalk Market, hub).
Test hooks (`?test=1`, `window.__mm`) are used only to teleport between zones/sites and to read where enemies are for aiming.

Output: `OUT/video/*.webm`, `OUT/shots/*.png`, `OUT/log.txt`, `OUT/summary.json`. Do not commit videos.

## Database safety

Every request AND WebSocket to `firebaseio.com`, `firebasedatabase.app`, `identitytoolkit`, `securetoken` is aborted
(`context.route` + `context.routeWebSocket`). `route()` alone does NOT stop the Firebase SDK, which talks over a WebSocket: always
keep `routeWebSocket`. `summary.json` lists `blockedDbSockets` and any socket that was opened (`socketsOpened` must be empty).
