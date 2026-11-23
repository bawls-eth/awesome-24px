# World + Graphics lane: fixes and retest notes (branch dev-world)

Each entry: item, files, test, how to retest by hand. Screenshots in `fixes/img/`.

## W-01 Hero pop-in (b12-01) - fixed
- Files: `games/mad-maze/mad-maze.js` (heroArtP cache, applyHero, picker preload).
- Cause: `applyHero` called `arena.setHeroArt(null)` before the new strip loaded (orb for ~1.5 s), and the page-load request for the previous class resolved later and put the OLD class back (wrong sprite) before the new one arrived.
- Fix: one strip promise per art class shared by page load, picker and switch; the picker warms the owned heroes' strips (up to 6, plus hover); a switch keeps the previous sprite until the new strip resolves; the page-load request only applies while its class is still active; the fallback orb only when the strip fails (no ready idle_down).
- Test: `tests/beta-w01-hero-popin.test.js` (1280x720 + 390x844: 30 samples / 3 s all drawn by class art, fallback drawImage counter 0, final class = the picked one; blocked strip: fallback shows, no pageerror). `hero-pick`, `hero-all-classes`, `boss-art` green.
- Retest: Realm world with 2 heroes, pick the other hero: the old sprite stays until the new one swaps in; never the green orb.

## W-02 Boss pop-in (b12-02) - fixed
- Files: `games/mad-maze/mad-maze.js` (boss art block).
- Fix: a 2 Hz scan preloads a world boss when the player is within 16 tiles of its altar (wakes at 9), and the dungeon boss when the current room is the boss room or next to it. Requests are de-duplicated (also for the arena's lazy loader). Not done: the "awakens" banner wait (realm-world.js slot); not needed once the strip is preloaded.
- Test: `tests/beta-w02-boss-popin.test.js` (3 seeds: no extra boss requests while idle on the shore for 30 s / 4 s, strips loaded before wake, first boss frame drawn by the sprite; strips blocked: fallback draws, fight runs, no pageerror).
- Before / after: `img/w02-before.jpg` (pink code face under the banner, crop seen at 16 ms after wake) / `img/w02-after.jpg` (Forest Warden sprite).

## W-08 Angler layout (b10-01 P1, b10-02, b10-16, b12-13) - fixed
- Files: `games/angler/angler.css` (two appended media blocks, no markup / JS change).
- Fix: narrow / short portrait (<= 340 px wide or portrait <= 640 px tall, i.e. 390x844 at 150% text): status chips + Tournament / Market / Aquarium / Gear collapse into one horizontally scrolling row, spots become a one-row scroller, the status line is 2 lines, the scene has a 300 px floor. Landscape phones (<= 520 px tall) and desktop (>= 900 px, >= 4:3): chrome in a right column, the scene uses the full height.
- Measured: 260x563 scene 27x41 -> 200x300+ fully on screen; 844x390 scene bottom 465 -> inside 390; 1280x720 scene 375 -> 650 px tall.
- Test: `tests/beta-w08-angler-layout.test.js` (fails 5 asserts on the old CSS). `angler-page`, `angler-polish`, `angler-bugbash`, `angler-fun` green.
- Not done: a "More" disclosure for the 4 buttons (needs angler.js, Gameplay); the scrolling row covers it with CSS only.
- Before / after: `img/w08-{p150,land,desk}-{before,after}.jpg`.

## W-05 Realm phone HUD (b15-11, b15-04, b01-06, b02-07, b02-09, b03-03) - fixed
- Files: `game/realm-ui.css` (slot 2, after G-02 merged from dev-gameplay; one appended block), `games/mad-maze/mad-maze.css` (#rw-goal wrap).
- Fix: <= 360 px Leave moves to the right end of its row (was 54x16 px over the XP bar). Goal line wraps instead of an ellipsis. The "New best tier" toast (inline `top:12%` in realm.js, overridden with !important; no realm.js edit) has its own slot: above the ability bar on desktop, above the ability pad on touch portrait, bottom centre on short landscape. Backpack open: goal line hidden; the toast moves into the free margin beside the 460 px card (hidden below 700 px where the card fills the width).
- Test: `tests/beta-w05-realm-hud.test.js` (new, instead of extending world-phone-hud: 320x568 / 360x640 Leave vs XP; 390x844 goal no truncation; toast vs boss bar, zone, goal, minimap; 844x390 backpack vs goal / zone / minimap / toast; 1280x720 toast vs boss bar, ability bar and card). 9 asserts fail on the old CSS. `world-phone-hud`, `realm-chase-ui`, `realm-phone-layout`, `realm-hud-8bit` green.
- Seen, not mine: the zone line can sit on the boss bar for up to 1 s until zonePlace (realm-world.js) moves it; the Gameplay class hook on the toast (realm.js:4761) is no longer needed.
- Before / after: `img/w05-{320,390-toast,844-bp}-{before,after}.jpg`.

## W-16 Dungeon HUD (b03-04, b03-05, b03-06, b03-08) - fixed
- Files: `games/mad-maze/mad-maze.css` (one appended block).
- Fix: desktop (>= 900 px, >= 5:4, mouse): the room canvas sits between the top HUD / boss bar (112 px) and the key-hint line (aspect kept; pointer aim maps through the bounding rect so it stays exact), the Q/E/R/F bar docks as a column in the left margin outside the room. Phone portrait: the boss bar sits left of the mini-map and under the mutator chip, above the room.
- Test: `tests/beta-w16-dungeon-hud.test.js` (S door and N door tile centres hit the canvas; ability bar outside the room; room >= 540 px with 17:13 kept; hero not under the boss bar; phone boss bar vs mini-map / mutator chip / room top; sticks + pad <= 25% of the room). 4 asserts fail on the old CSS. `dungeon-polish`, `mad-maze-dungeon`, `dungeon-narrow`, `dungeon-mutators`, `realm-phone-layout` green.
- Left as is: the room-entry banner briefly covers the phone boss bar (dungeon-polish pins the banner above the room); b03-05 coverage measured at ~11% of the room.
- Before / after: `img/w16-{desk-boss,phone-boss}-{before,after}.jpg`.

## W-10 Echo Garden labels (b09-03, b12-12) - fixed
- Files: `games/echo/echo.js`, `games/echo/echo-late.css`.
- Fix: the "+N in bloom" line is a DOM line anchored just above the board (over the time bar) instead of a canvas float at the board centre; name labels moved up 8 px (clear of the selection frame's bottom bar); the "wilt" float starts 32 px lower so its rise stays inside the card; the board width is capped by the viewport height so the 2x2 grid fits 1280x720. `__echo.counts().floats` counts the DOM line too (echo-page "juice" assert unchanged and green); new hooks `labels()`, `widget()`, `floatRects()`, `bloomEl()`.
- Test: `tests/beta-w10-echo-labels.test.js` (390x844 and 1280x720). `echo-page`, `echo-bugbash`, `minigame-quality-gate` green.
- Before / after: `img/w10-echo-{before,after}.jpg`.

## W-13 Joystick look (b12-10, P3) - fixed
- Files: `game/realm-8bit.css` (one appended block; no realm.js / main.js change, so no class request to Gameplay was needed).
- Fix: knob and ring are pixel art drawn in code (inline SVG pixel grids generated from palette colours: ink outline, gold knob with brown shade and yellow top-left highlight; grey move ring, blue aim ring). Integer pixel scale (ring 25 cells, knob 13 cells). <= 390 px wide and short landscape: ring 100 px (was 124, 20% smaller), knob 39 px. Same centre and drag logic; Town realm gets the same skin.
- Test: `tests/beta-w13-joystick.test.js` (ring size, integer scale, svg not flat fill, knob corners not gold / centre gold by pixel sample, drag still steers, 430 px keeps 125 px). 6 asserts fail on the old CSS. `realm-phone-layout`, `world-phone-hud`, `realm-hud-8bit`, `realm-universal-controls`, `realm-tutorial` green.
- Art ask filed (CODEX-REMAKE-QUEUE): a proper stick ring / knob sprite set can replace the code-drawn one later.
- Before / after: `img/w13-stick-{before,after}.jpg`.

## W-14 loot bags (b02-06) - fixed
- Files: `games/mad-maze/mad-maze.js` (art wiring block; no realm.js change).
- Fix: the unwired b15 bag art replaces the arena's 6 code bag sprites (baked once into the same 26 px canvases: outlined pixel bags per bag tier). A T12 drop (gear.t 12) gets a 7th sprite: the red bag with the soulbound sparkle baked in (dropBag wrapper sets the bag's draw index only). All or nothing: any strip missing keeps the code bags; `?bagart=0` keeps them too.
- Test: `tests/beta-w14-loot-bags.test.js` (7 art sprites outlined, no code glow; T12 bag red vs white / gold; T12 / T5 / plain drops pick the right sprite; red pixels on screen near the T12 bag; `?bagart=0` unchanged). `loot-bag-icons`, `world-pickups`, `gear-world-drops` green.
- Before: tester evidence b02-06 (plain code squares); after: `img/w14-bags-after.jpg`.

## W-09 Arcade / Hub layout (b09-01, b10-03, b15-03 fixed; b09-08 open; b09-09 checked)
- Files: `games/pop/pop.css`, `games/jam/jam.css`, `hub/hub.css`, `games/stack/stack.css` (appended blocks).
- Pop: score stat never wraps (nowrap, tabular digits, size capped at 4.6vw): 6 digits keep the box height (was 49 -> 72 px).
- Jam at 260x563: the lane canvas yields height in short portrait so the four pads are fully on screen during a song (were at y 561).
- Hub at 195 CSS px: one card column, titles wrap instead of 2-letter ellipses, the bottom bar wraps inside the viewport, title clears the Menu button.
- Stack: the intro / result card starts at 76 px (below the header row). The test's disjoint check also passed on the old CSS at 390x844 (b09-09 was seen at another size), so it is a guard, not a repro.
- OPEN b09-08 (Dash result above the fold): `dash-page` pins the result card below the scene and the card is ~590 px tall at 390x844, so CSS reordering cannot meet "top < 400 and fully visible" without breaking Run again under the thumb. Needs a compact result card (dash.js / minikit, Gameplay).
- Test: `tests/beta-w09-arcade-layout.test.js` (6 asserts fail on the old CSS). `pop-page`, `dash-page`, `dash-bugbash`, `stack-page`, `jam-page`, `hub-page`, `hub-home` green.

## W-11 Bug Safari clarity (b10-11) - fixed
- Files: `games/festival/bugs.js` (draw only).
- Fix: each bug is drawn through two small scratch canvases (sprite + silhouette composited at 4 offsets = 1 px rim), at 2x when the field shows under 1.8x screen scale (phones), 1x on desktop. Rim is dark ink, or a light rim on the dark arenas (night glade, lantern) so it is >= 3:1 against every ground. Ground checker at half contrast. No getImageData, layout read at most once a second; sim, hit areas and scores untouched. Hook `__bugs.bugArt()`.
- Measured: phone bugs 8-10 px -> 23-27 screen px on the long side.
- Test: `tests/beta-w11-bug-clarity.test.js` (old code fails at the hook). `bugs-page`, `bugs-polish`, `bugs-bb`, `bugs-fun`, `minigame-lowgfx` green.

## W-12 Isles hero facing (b12-09) - fixed (code art), art ask noted
- Files: `games/isles/isles.js` (slot 2, after Gameplay's G-20/G-21/G-22 merged; hero bake + one draw line + 2 test hooks).
- Fix: the baked code hero now has three true views (down = face, up = back of the head, right = profile with one eye; left mirrors right) x 2 walk frames, baked once. The walk cycle plays only while moving; idle and reduced motion hold frame 0 (it used to bob forever in a front view).
- Dark 2x2 block next to the jungle start: the tiles there are `jungle_floor` / `jungle_moss` (dark speckled jungle floor art) beside `sand` / `wet_sand`; no void or missing tile id around spawn (seed 123). It reads as a hole because the dark jungle floor tile sits as a 2x2 island inside sand; that is generator output (pinned) plus tile art contrast, not a draw bug.
- Better long-term: the Realm class strips (MMArt b00-b03, true down / up / right) could replace the code hero, but the Isles page does not load mm-art.js; left for a later slot.
- Test: `tests/beta-w12-isles-hero.test.js` (views per direction, distinct frame sets, 2-frame walk, static idle, pixel hashes differ, reduced motion static; logs the spawn terrain). `isles-bugbash`, `isles-access`, `isles-first-ten`, `isle-art-bake` green.

## W-07 Town HUD overlaps (b07-03, b07-07 fixed; b07-08, offline walkie, quick-chat docking open; b07-02 diagnosed)
- Files: `game/style.css` (appended block only; the index.html slot 3 was not free yet).
- b07-07: while the emote wheel is open the quick-chat row is hidden (the wheel covered Fishing! / Nice! / Bye!).
- b07-03: More tab rows (Settings, Keys, Changelog, Feedback, Sound, Music, Motion, Photo, Backup, Restore) are >= 44 px on phones (were 21-26 px).
- b07-02: no DOM element paints the black / white box. At its centre only the transparent game container, the canvas, `#settings-section` (153x553, overflowing the panel and clipped) and the transparent `#mobile-controls` are hit: the clipped-overflow compositor artefact already listed in bugbash/town.md, not a page background.
- Open (need index.html / main.js slot 3): build banner row (b07-08), hide "Hold to talk" offline (needs an offline class from main.js), dock the quick-chat row to the bottom band.
- Test: `tests/beta-w07-town-hud.test.js` (OFFLINE stub: 0 DB requests, 0 sockets; never chats). `nav-town`, `town-offline`, `town-8bit-menu`, `nav-town-p2` green.
- Before / after: `img/w07-{emote,more}-{before,after}.jpg`.

## W-03 Terrain look (b12-03, b04-01, b04-02 fixed; b12-04 / b04-03 snow shapes reported)
- Files: `games/mad-maze/realm-world.js` (slot 3: merged dev-gameplay G-06 / G-12 / G-23 and dev-perf S-04 first; three small hunks in the chunk bake + test hooks). Generator untouched (`shared-mm-overworld-golden` green).
- b12-03 double outline: a plain tile drew its 2 px edge line toward a neighbour that already draws a b10t transition tile, so every blended border had a second parallel line one tile away. The line is now skipped there (one edge per border).
- b04-01 hard shade patches: a patch side that borders a different shade class fades out over 8 px as a 2x2 checker (baked once), no hard square seams.
- b04-02 Godlands vs Highlands: `godland_ash` gets a baked dark ember wash plus sparse ember specks (lava_rock accent); mean colour distance ash vs rock deltaE ~8 -> >= 20. `?godlook=0` restores the grey ash; `?tiledetail=0` gives the flat look (no patches, no wash).
- b12-04 / b04-03 snow "frames with square holes": no isolated 1-tile hole inside snow exists in the generator output (seed 12345 scan: 0); the notches are snow edge-transition tiles at the band border (b10t art masks), so the fix is art (the remake queue terrain variants / inner corners, already in R-batch rules), not code.
- Bake: 8-10 ms per chunk in the test (budget 60); `world-perf` green.
- Test: `tests/beta-w03-terrain.test.js` (3 seeds). `shared-mm-chunk-bake`, `shared-mm-overworld-golden`, `world-art`, `world-props-godlands`, `world-props-b26`, `world-perf` green.
- Before / after: `img/w03-{before,after}-{shore,god}.jpg`.

## W-04 Nexus (b04-05, b04-06, b04-07, b04-10, b02-13, b02-15) - fixed (plaza tile art is Codex ask B-01)
- Files: `games/mad-maze/realm-world.js` (slot 3, Nexus section only: view size, camera clamp, plaza ring, label clamp, injected CSS, hooks).
- b04-05 void bands: the camera stays on the floor (outer wall ring excluded, centred if the plaza is smaller than the view) and the ring is painted as a stone kerb, never a black void.
- b04-07 phone: portrait phones get a 400x540 walk view (stage `nx-tall`), 57% of a 390x844 screen instead of ~32%. Portal labels use the monospace pixel stack and are clamped inside the floor the camera can show (were cut at the plaza edges: 'dow', 'Bran').
- b04-06 / b02-13: while the stall or the quest board is open the move / aim sticks are hidden (taps hit Buy, not the stick); the NPC line box never shrinks (flex none), so 'Take your time.' fits.
- b04-10 desktop: the daily quest board opens as a panel beside the plaza (right column) with every Claim button on screen, no scroll.
- Not done: stall buttons still use the rounded system-font Nexus style (b02-15 style half); the 8-bit restyle of the Nexus DOM is a larger CSS pass.
- Test: `tests/beta-w04-nexus.test.js` (4 asserts fail on the old code). `world-nexus-walk`, `world-nexus`, `nexus-vendor` green.
- Before / after: `img/w04-desk-corner-*.jpg`, `img/w04-desk-board-*.jpg`, `img/w04-phone-stall-after.jpg`.

## W-06 Town scale (b12-06 fixed; b07-05 / b07-12 / b12-05 sprite scales open)
- Files: `game/main.js` (slot 3, after merging dev-gameplay's G-12 / G-13; one hunk in drawNoticeBoard).
- b12-06 Top Scores board: board 110x52 -> 144x76 (moved 30 px east, clear of the Postcards label), text 8 px -> 12 px bold rendered at 2x resolution. Cap height ~8.4 world px = >= 10 screen px on phone (zoom 1.2) and ~13 on desktop; was ~5 px and smeared.
- Open: one scale table for creatures / NPCs (beaver, heron, capybara, deer <= 1.2x hero; NPCs = hero height; integer texel scale). It touches FF_ASSETS sizes, the museum / wildlife logging and many Town tests, so it needs its own slot. The statue waits for O-10 (owner, art).
- Test: `tests/beta-w06-town-board.test.js` (OFFLINE stub; 6 asserts fail on the old code). `town-bugbash`, `town-polish`, `nav-town`, `town-heroes` green.
- Before / after: `img/w06-board-{before,after}.jpg`.

## W-15 Stalk compass (b11-06, b12-17, P3) - fixed
- Files: `games/stalk/stalk.css` (scroll-margin-top 64 px on the cards / sections = 48 px Menu button + 8 + 8).
- Test: `tests/beta-w15-stalk-compass.test.js` (390x844 + 1280x720; 4 asserts fail on the old CSS). `stalk-page`, `stalk-bugbash` green.

## W-18 Isles HUD polish (b05-10, b06-09, b15-14 fixed; b06-07 names, b06-08 rocket, b05-09 log gap, b06-06, b05-08 open)
- Files: `games/isles/index.html` (one close button), `games/isles/isles.js` (one line: the button hides the card), `games/isles/isles.css` (appended block).
- The first-visit how-to card has a 44 px close button (keyboard / screen reader reachable); on desktop it sits bottom-left instead of over the hero at the centre; while it is up, toasts print at 64% height instead of on its text.
- b05-09: the source text is "Look for sparkles." (no double space in isles.js); the gap is a rendering / width effect not reproduced here, left open.
- Test: `tests/beta-w18-isles-howto.test.js`. `isles-bugbash`, `isles-first-ten`, `isles-ftue-fixes`, `isles-access` green.

## Tried and reverted
- W-07 hide "Hold to talk" offline (b08-06): a `town-offline` body class from main.js + one CSS rule worked, but `town-bugbash` asserts the offline walkie pill is visible and 44-56 px tall (its layout check runs offline). Changing that test is a QA / owner call, so the change was reverted; ready to re-apply (2 lines) once the test is updated.
