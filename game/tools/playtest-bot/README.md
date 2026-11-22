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

## journey3.js: new-player journey bot (playtest 3)

One **persistent browser profile per viewport**, so the save carries from page to page as it does for a real player. Each stage
is a separate run (and webm) that continues from the profile the previous stage left. Used for `game/design/PLAYTEST-REVIEW-3.md`.

```
python3 -m http.server 9251 &   # repo root
NODE_PATH=$(npm root -g) VP=phone STAGE=town,realm FRESH=1 OUT=/tmp/pt3 node game/tools/playtest-bot/journey3.js
```
Env: `VP=phone|desk`, `STAGE=` comma list of `town` (join offline, walk to the Realm Gate, hero picker, tutorial, 60 s first fight),
`realm` (Where to -> Realm, grind, Nexus, vendor, Shop buy, backpack Stats + Forge, a Nexus dungeon, back), `dungeon` (Nexus ->
Meadow, follow the gold start-room arrow, fight, Leave), `hub` (Where to -> World map, gift, Campfire Jam, Menu back), `isles`
(Hub chip -> Isles: first tame, gather, dock, sail), `isles2` (Where to -> Isles, tame on the jungle, gather for a raft, reef),
`whereto` (8 hops with the shared menu), `feedback` (Town settings -> feedback note). `PROFILE=<tag>` picks a separate profile,
`FRESH=1` wipes it, `AIM=0` turns the Realm read hooks off, `GATHER=<ms>`, `OUT`, `PORT` (9251).

Honesty rules it follows: input is always real (keys, mouse, synthetic touch pointers on the real sticks and buttons). Hooks are
only READ: the Realm gets `?test=1` plus `heropick=1&tutorial=1&feedback=1` (test mode would otherwise hide the hero picker, the
tutorial and the feedback box) to read enemy / Nexus positions for aiming and steering; the Isles get `?test=1` to read creature,
hero and dock positions. Gatherable glints (`#fff4a8`) and the dungeon arrow (`#ffd45a`) are found by scanning canvas pixels.
Every hook or shortcut is logged as `HOOK` / `SHORTCUT`. Never run two processes on the same profile at once (localStorage
races give false "save lost" results). Same DB safety as above (`context.route` + `context.routeWebSocket` on every DB host).
