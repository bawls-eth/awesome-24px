# Playtest review: research bot, 2026-11-21

## What was run
`game/tools/playtest-bot/run.js` (see its README) on branch `playtest-bot` at 94e88f4, served locally, with every Firebase
request **and WebSocket** blocked. It played two viewports: desktop 1280x720 (keyboard WASD + mouse aim/hold-fire + Q/R/F) and
phone 390x844 (touch, both sticks driven by synthetic pointers). Each viewport ran five segments, about 14 minutes in total:

- **Town**: join form. With the DB blocked the town never joins, so the bot opened the page the Town Gate's "Enter the Realm"
  opens, then did "Create your hero" (Thicket Ranger) and played for 22 s.
- **World** (seed 4242): played the shore while heading toward the centre, then spent 15-18 s each in the midlands, highlands
  and godlands. Hooks were used only to teleport. A death in a zone was followed by a respawn, a teleport back and god mode.
  It also opened the Esc menu, hero stats, backpack (B), shop (V), kill board (K) and the big minimap, used a shrine (E), visited
  a camp and an NPC, took the nearest portal into a Meadow dungeon and came back via "Back to the world".
- **Dungeons**: all four `?biome=`, 12-16 s each.
- **Lantern** page.
- **Other games**: Deepdelve (local three.js), Angler, Campfire Jam and Stalk Market for about 10 s each, plus the hub map.

Results: 290 screenshots, 10 videos, **0 console errors, 0 page errors, 0 failed requests**, 23 DB requests and 2 DB sockets
blocked, 7 player deaths (desktop 3, phone 4), and at most about 3 kills per viewport. The bot is a mediocre player: it backs
off, strafes and aims at the nearest enemy, roughly like a new player would.

Screenshots in `game/design/playtest/` (JPEG; desktop resized to 640 px wide, phone kept at its native 390 px).

## Findings

| # | Sev | Finding | Screenshot |
|---|-----|---------|-----------|
| 1 | blocker (process) | Before this run was fixed, `route()` blocking did **not** stop the Firebase SDK, which uses a WebSocket. The first bot run joined the live town (the player list showed real ADMIN bots). `game/tests/realm-playthrough.test.js` uses the same `route()`-only "offline" block, so it **joins the live DB too**. It needs `context.routeWebSocket` (the bot now has it) | 12-desk-join-offline-stuck.jpg (the *correct* blocked state) |
| 2 | major | When the DB is unreachable, "Join Town" stays disabled forever with no message, spinner or timeout | 12-desk-join-offline-stuck.jpg |
| 3 | major | Difficulty: a level-1 hero dies on the **shore** within 15-21 s, and in the midlands/highlands/godlands within 5-14 s. "Shore · Safe-ish" is not safe. Midlands begin about 25 tiles from spawn with no soft border, so walking "toward the centre" crosses into Dangerous almost at once | 03-desk-death-screen.jpg |
| 4 | major | Enemies fire from off-screen. Long-lived bullets cross the whole 960x540 view (more on phone) from shooters the player cannot see, so damage feels random. In RotMG, shots mostly come from enemies on screen | 02-desk-shore-offscreen-fire.jpg |
| 5 | major | Time-to-kill is too long: 1 dmg at 7.5 shots/s against 12-17 HP shore mobs takes about 2 s of sustained hits each. Combined with #3, a new player loses before they learn | 02, 03 |
| 6 | major | Readability: enemy bullets (pink/purple/orange glow dots) are bigger and brighter than the player's own thin cyan bolts, which are nearly invisible. In the godlands the hero is lost under 150+ bullets and a boss bar plus "awakens" banner. The screen is mostly bullets with almost no telegraphing | 01-desk-godlands-bullets.jpg, 09-phone-godlands.jpg |
| 7 | major | Phone: in dungeons, the 15x11 room fills only about a third of the portrait screen (a horizontal strip), and the dungeon map plus "The doors seal!" banner sit on top of it. Enemies are tiny | 11-phone-dungeon-strip.jpg |
| 8 | major | Phone: the minimap and zone text (`#rw-minimap`, `#rw-zone`) draw **over** the open backpack panel. The big minimap also stays over portal prompts | 10-phone-backpack-minimap-overlap.jpg |
| 9 | major | Phone world: the right column (minimap 96 px + zone/raid text + 2x2 ability grid + aim stick) takes about 40% of the width. The playable view is about 390 world px wide, so threats arrive with no warning | 09-phone-godlands.jpg |
| 10 | minor | The portal prompt and the NPC/site prompt stack on the same spot ("Blacksmith: Take your time..." under "Meadow portal" and above "Enter Meadow dungeon"). A label at the screen edge ("Bon...") is clipped | 05-desk-portal-npc-overlap.jpg |
| 11 | minor | The dungeon exit button is truncated even on desktop: "✖ To the w..." | 06-desk-dungeon-room-truncated-exit.jpg |
| 12 | minor | Room count disagrees: the HUD says "Room 2/8" (`ROOMS - 1`), the summary says "Rooms visited 2/9" (`ROOMS`) | 06, 07 |
| 13 | minor | The summary title says "Meadow cleared!" with 1 room cleared and the boss alive. The bot ended this run with the `finish()` hook; check whether leaving early shows the same title | 07-desk-dungeon-summary.jpg |
| 14 | minor | Dungeon start rooms are empty and give no direction cue: the bot wandered 16 s in "Room 1/8" in every biome. The room is letterboxed with flat side bars | 08-desk-warren-start-room.jpg |
| 15 | minor | After a death, the HUD shows "Lv 1 Get ready" (wave-mode copy) in world mode until the next zone update. The banner says "wave 1" in a world with no waves | 03 |
| 16 | minor | The "🛒 Shop (V)" button in the backpack is an unstyled browser button. The shop footer says "Reach wave 2 to unlock Uncommon gear", but the world has no waves | 04-desk-backpack.jpg |
| 17 | minor | "Raid in 1:01 · Midlands" stays in the HUD while you are in the godlands. It is useful, but it adds a third line of yellow text under the minimap | 01 |
| 18 | minor | Floating damage numbers and enemies render under the top-right HUD buttons | camp-fight shot (not committed) |
| 19 | minor | Campfire Jam: "Check your timing" calibration blocks the song list on first visit, so the bot never got into a song in 10 s. Deepdelve opens on a featureless plain with a stray selection square. Stalk: Buy is disabled on Saturday with no "market closed" text near the buttons | not committed (sheet in scratch) |
| 20 | good | Hero creation, the Esc menu, hero stats, death screen and Lantern are clean and readable on both viewports. The four dungeon biomes are clearly distinct colourways. The godlands look properly RotMG-like: boss, packs and an oracle site | 01, 03, 08 |

### Desktop vs phone
Desktop reads well apart from the bullet glare. The 960x540 logical view gives enough warning on the shore. Phone portrait is
the weaker build: the world view is narrow, HUD overlays collide (#8, #10), dungeons waste two thirds of the screen (#7), and
the ability grid sits where enemies come from on the right. Touch controls themselves worked: both sticks moved and fired and
the ability taps cast.

### Does it feel like Realm of the Mad God?
Partly. The tiered zones toward a lethal centre, shrines, camps, portals to dungeons, the death cache and loot bags all match.
Four things are missing:
- **Onboarding difficulty curve.** The RotMG beach is trivially safe; here the shore kills in 20 s.
- **Shot ownership.** In RotMG your shots are readable and enemies are on screen.
- **Dense nexus-like social space.**
- **Fast kills that drop loot often.**
The overworld also has large empty grass stretches between sites (midlands arrive shot), and there is little to see while
walking.

## Ten fix / feature slices (priority order)

1. **DB-safe tests.** Add `ctx.routeWebSocket(BLOCK, ws => ws.close())` to every "offline" test, starting with
   `game/tests/realm-playthrough.test.js`, and add a shared helper in `game/tests/helpers.js` that fails the test if a
   `websocket` event to a DB host is seen. *(Owner should judge whether the earlier bot session needs any cleanup. It was presence
   only, as `BotDesk`, about 1 min.)*
2. **Join timeout and offline message.** If `net.js` gets no `init` or `error` within about 10 s, show "Can't reach the town right
   now. Try again", re-enable the button, and offer a "Play the Realm offline" link (`game/net.js`, `game/main.js` `attemptJoin`).
3. **Shore difficulty pass.** Lower the shore tier damage and bullet speed, add a 30-tile safe beach band, and add a soft visual
   border plus a toast at each zone edge (`game/shared/mm-zones.js`, `mm-overworld.js` creature tiers, `realm-world.js` spawner).
4. **No off-screen snipers.** Enemies only fire while within the view plus a small margin. Cap enemy bullet lifetime so bullets
   do not cross the full view, and despawn bullets that leave the camera margin (`game/realm.js` enemy fire, `realm-world.js` tick).
5. **Player shot readability.** Make player bolts larger, brighter and white-cored with a short trail. Dim enemy bullets in
   reduced-glare mode. Draw a ring under the hero so the hero is always findable (`game/realm.js` draw pass, `mm-fx-draw.js`).
6. **Early TTK.** Give level-1 starter weapon damage about 3 (or cut shore HP to 4-6) so shore mobs die in 2-4 hits. Tie XP so
   the player reaches level 3 in about 2 minutes (`game/realm.js` `RM_PLAYER`, `game/shared/mm-classes.js` profiles).
7. **Phone HUD layout.** Hide `#rw-minimap`/`#rw-zone` while any `.rm-panel` or the backpack is open. Collapse the zone, raid
   and coords text into one line, and move abilities into an arc around the aim stick (`game/games/mad-maze/mad-maze.css`
   phone media block, `realm-ui.css`).
8. **Phone dungeon camera.** Rotate or zoom the room to fit portrait (scale the room to the screen width and let the camera
   scroll vertically), and move the dungeon map and banners off the room (`game/games/mad-maze/dungeon.js`, `realm.js` `_resize`).
9. **Prompt stacking and labels.** One prompt slot with priority portal > site > NPC line, and clamp off-screen labels. Shorten
   the exit to "✖ World" (`realm-world.js` `portalTick`/`siteTick`, `dungeon.js` leave label). Fix "Room x/8" vs "/9" and the
   "cleared!" title when the boss is alive (`dungeon.js` lines 351/420).
10. **World-mode copy and polish.** Remove wave wording in world mode ("Get ready", "wave 1", "Reach wave 2" in the shop), style
    the backpack Shop button, render floating numbers above HUD-safe areas, and add a direction cue (arrow or open-door glow) in
    dungeon start rooms (`game/realm.js` banner/HUD strings, `realm-ui.css`, `dungeon.js`).
