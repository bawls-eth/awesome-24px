# Lane: World + Graphics Engineer

Read `../TRIAGE.md` first (ownership map in section 5, definition of done in section 8). Branches `fix/wg-<item>` from `claude/animal-crossing-game-7z3roh`; do not push. Every visual fix needs a before/after screenshot that you READ (<= 250 KB, `design/beta/img/fix-<item>-before|after.jpg`) plus measured asserts (bounding boxes, pixel samples): a screenshot alone is not a test.

Your files: style.css, realm-8bit.css, games/mad-maze/mad-maze.js, mad-maze.css, realm-cave.css, lantern.css, every arcade `*.css`, hub/hub.css, whole dirs games/echo and games/festival, shared/mm-pixelize.js, mm-8bit.css/js, mm-creature-draw.js, mm-creature-strips.js, art wiring / assets. Serial slots: realm-ui.css slot 2 (after G-02), mm-art.js slot 2 (after S-06), isles.js slot 2 (after Gameplay's three P1), index.html slot 3, main.js slot 3, realm-world.js slot 3 (you hold it longest, so you get it last: do everything else first). Never edit: realm.js (request a class / hook from Gameplay), mm-overworld.js generator output (pinned by `shared-mm-overworld-golden.test.js`; draw-side changes only), net.js.

Art rules: original art only, ART-HANDOFF.md formats and palette, no per-frame Phaser Graphics redraws, effects separate. Missing art is an ask to Codex (`CODEX-MINIGAME-ART-ASKS.md` / remake queue), not a code-drawn substitute.

Order: W-01, W-02, W-08, W-05, W-07, W-09, W-10, W-11, W-16, W-12, W-06, W-03, W-04, W-17, then P3.

---

## P2

### W-01 Hero pop-in (b12-01)
- Files: `games/mad-maze/mad-maze.js:270-300` (applyHero -> class strip load).
- Fix: keep drawing the previous sprite (or the picker portrait scaled) until the new strip's promise resolves; never an empty frame; the green code-fallback orb only if the strip fails to load. Preload the selected class strip while the hero picker is open.
- Acceptance (`tests/beta-w01-hero-popin.test.js`, 1280x720 and 390x844): sample the hero's screen rect every 100 ms for 3 s after picking: (1) the rect is never empty (non-background pixels > 5%) in any sample; (2) the fallback draw function is not called when the strip request succeeds (test counter); (3) with the strip request blocked, the fallback shows and no pageerror; (4) `hero-pick`, `hero-all-classes` green.
- Depends on: S-06 helps but is not required.

### W-02 Boss pop-in (b12-02)
- Files: `mad-maze.js:257-262`.
- Fix: preload boss art when the player is within 16 tiles of a `world.bossSites` entry (wake radius is 9) and at dungeon boss-room minus one; spawn banner waits for the art up to 500 ms.
- Acceptance: (1) on "awakens", the boss draw uses the sprite path on the first frame (fallback counter 0) across 3 seeds; (2) no extra requests when no boss site is near (request count equal to baseline for 30 s on the shore); (3) art request blocked: fallback still draws, fight playable.

### W-08 Angler layout (b10-01, b10-02, b10-16, b12-13)
- Files: `games/angler/angler.css` (rules at :12-13, :123-124, :136-138).
- Fix: the scene gets a guaranteed minimum (`min-height: 45vh` or the page scrolls instead of crushing it); at large text or short heights the chrome collapses (status chips into one row, the 4 buttons behind a "More" disclosure, spot grid 3x2 -> scroller); landscape puts chrome in a side column; desktop scales the scene to the available height.
- Acceptance (`tests/beta-w08-angler-layout.test.js`): (1) 390x844 at text 150% (the same method b10 used: 260x563 CSS px): `#scene` >= 200x300 and the reel meter fully inside the viewport; (2) 844x390 landscape: scene bottom <= innerHeight and reel meter visible without scroll; (3) 1280x720: scene height >= 480 px; (4) 390x844 default: every button still >= 44 px, a11y-viewports sweep has no new offenders.

### W-05 Realm phone HUD (b15-11, b15-04, b01-06, b02-07, b02-09)
- Files: `game/realm-ui.css` (slot 2), `realm-8bit.css`.
- Fix: narrow-width rules: Leave moves below / right of the XP bar at <= 360 px; goal line wraps to 2 lines instead of ellipsis; the "New best tier" toast gets a slot that is not over zone / goal lines, the boss bar or the open backpack (hide HUD goal label while the backpack is open).
- Acceptance (`world-phone-hud.test.js` extended): (1) at 320x568 and 360x640 the rects of `#realm-leave-btn` and `#realm-xp` do not intersect; (2) at 390x844 the goal line's scrollWidth <= clientWidth (no truncation) for the longest quest title; (3) with the backpack open at 844x390, no HUD label rect intersects the backpack card; (4) the toast rect never intersects the boss bar (also covers b03-03).

### W-07 Town HUD overlaps (b07-02, b07-03, b07-07, b07-08, b12-07, b08-06)
- Files: `game/style.css`, `game/index.html` (slot 3).
- Fix: emote wheel opens above the quick-chat row (or hides the row while open); quick-chat row docks to the bottom HUD band instead of mid-screen; build banner and its buttons get their own row under the top chips; people-panel settings rows >= 44 px; hide "Hold to talk" when offline. b07-02 (black/white box under the More tab): first check on the WebGL framebuffer (`canvas.toDataURL` sample), it may be the known headless compositor artefact: report which.
- Acceptance (`tests/beta-w07-town-hud.test.js`, 390x844, OFFLINE stub): (1) emote wheel rect vs each quick-chat button rect: no intersection; (2) build mode: banner, material and Undo rects do not intersect `#mm-nav`/Where-to, the gate chip or the panel tabs; (3) every row in the More tab is >= 44 px tall; (4) offline: walkie button hidden; (5) `phone-overlays`, `phone-panel`, `nav-town` green.

### W-09 Arcade / Hub layout (b09-01, b10-03, b09-08, b09-09, b15-03)
- Files: `games/pop/pop.css:13`, `games/jam/jam.css`, `games/dash/dash.css`, `games/stack/stack.css`, `hub/hub.css`.
- Acceptance: (1) Pop: a 6-digit score keeps the HUD on one line at 390 px (stat box height unchanged vs a 1-digit score); (2) Jam at 150% portrait: all four pads fully inside the viewport during play; (3) Dash 390x844: result card top < 400 px and PB / medals visible without scroll; (4) Stack / Pop intro does not cover the Sound button (rects disjoint); (5) Hub at 195 CSS px width: one column, card titles not ellipsised to < 6 characters, bottom bar inside the viewport.

### W-10 Echo Garden labels (b09-03, b12-12)
- Files: `games/echo/echo.js:142` and the card layout / css.
- Acceptance: (1) the "+N IN BLOOM" float text rect intersects no flower label and not the centre widget (anchor it above the board); (2) selection frame and pip row do not cross any label rect; WILT label fully inside its card; (3) the 2x2 grid fits 1280x720 without scroll; (4) `echo` page tests green.

### W-11 Bug Safari clarity (b10-11)
- Files: `games/festival/bugs.js` render scale, `bugs.css`.
- Fix: on phones draw bugs at 2x with a 1 px dark outline (or zoom the field: fewer tiles visible), calmer ground checker contrast.
- Acceptance: (1) at 390x844 each bug's on-screen box >= 16 px on its long side; (2) contrast between the bug outline and the ground >= 3:1 by pixel sample for all species; (3) hit targets unchanged or larger (tap radius >= 22 px); (4) scores for a seeded run unchanged.

### W-16 Dungeon HUD (b03-03, b03-04, b03-05, b03-06, b03-08)
- Files: `games/mad-maze/mad-maze.css`.
- Acceptance: (1) phone boss fight: boss bar rect does not intersect the minimap or the mutator chip; (2) desktop: the ability bar does not cover the S door tile (door tile centre not under the bar: `elementFromPoint` is the canvas) - shrink / raise the room or dock the bar outside the 17x13 room; (3) entering through the N door, the hero sprite is not under the boss bar; (4) phone portrait: ability buttons + sticks cover <= 25% of the room rect.

### W-12 Isles hero facing (b12-09) - after Gameplay releases isles.js
- Files: `games/isles/isles.js` hero draw.
- Acceptance: (1) walking left / right / up shows a different frame set than idle-front (frame id or pixel hash differs per direction); (2) a 2-frame walk cycle while moving, static when idle, static under reduced motion; (3) the jungle dark 2x2 block at the start is identified (tile id) and either drawn as its real tile or reported with the id.
- Risk: needs true side / back hero frames (ART-HANDOFF): if missing, mirror side only where the art allows and file the art ask.

### W-06 Town scale (b07-05, b07-12, b12-05, b12-06) - main.js slot 3
- Files: `game/main.js:497` (FF_ASSETS scale), `:7750-7752` drawStatue, leaderboard sign text, `shared/mm-pixelize.js`.
- Fix: one scale table: creatures 0.6-1.2x hero height by species class, NPCs = hero height, statue <= 1.6x hero with integer pixel scale; Top Scores board text drawn at an integer scale >= 8 px cap height or moved to a DOM label. Statue art / label wait for O-10.
- Acceptance: (1) displayHeight of beaver, heron, capybara, deer <= 1.2x the hero's; (2) NPC displayHeight within 10% of the hero's; (3) Top Scores text cap height >= 8 screen px at 1280x720 and 390x844; (4) every scaled sprite uses an integer or half-integer texel scale (no mixed 1x/3x on the same layer); (5) `town-perf` not worse.

### W-03 Terrain look (b04-01, b04-02, b04-03, b12-03, b12-04) - realm-world.js slot 3
- Files: `realm-world.js:18` (palette), `:305` (tileDetail), chunk bake edge pass.
- Fix: find the pass that strokes region outlines offset from the tile edges and remove / align it; shade patches: dither the patch edge (2-colour checker falloff, baked) instead of hard rectangles; snow "holes": fix the autotile mask so 1-tile gaps fill; one edge style (the b10t edge tiles) for all biomes; Godlands: darker ash + ember accent from the existing palette so it cannot be mistaken for Highlands.
- Acceptance (`world-art.test.js` / `shared-mm-chunk-bake.test.js` extended + new `beta-w03-terrain.test.js`): (1) on 3 seeds, a baked water-sand border column has exactly one colour transition band (no second parallel line within 6 px: scan pixels across the edge); (2) no snow region contains an isolated 1-tile hole unless the generator marks a different terrain there; (3) mean colour distance between Godlands ground and Highlands ground >= a set threshold (e.g. deltaE 20); (4) bake time per chunk within 10% of baseline, `world-perf` green; (5) `?tiledetail=0` still gives flat tiles.
- Risk: the bake is a perf-sensitive path; generator output must not change (golden test).

### W-04 Nexus (b04-05, b04-06, b04-07, b04-10, b02-13, b02-15, b12-08) - realm-world.js slot 3
- Files: realm-world.js Nexus section (NX_VW / NX_VH, nxCam, stall DOM), `mad-maze.css`.
- Fix: clamp the camera to the plaza rect (centre the plaza when it is smaller than the view); phone: the view uses the free height (today ~40%), labels stay inside the view (flip side / clamp); touch pad hidden or below the stall while a stall / dialog is open; quest list opens as an overlay inside the view; stall and labels use the 8-bit panel + pixel font classes. Plaza tile art is a Codex ask (not in the remake queue): file it.
- Acceptance (`world-nexus-walk.test.js` extended): (1) hero at each of the 4 plaza corners: no fully black column / row inside the Nexus canvas (pixel scan); (2) 390x844: the plaza view height >= 55% of innerHeight; every portal label rect inside the view rect; (3) stall open on phone: `elementFromPoint` at each Buy button centre is that button; (4) desktop 1280x720: quest Claim button inside the viewport without scrolling; (5) NPC line text fits its bubble (scrollHeight <= clientHeight).

### W-17 Isles creature / boss art (b06-01, b06-02, b06-03)
- Mostly an art ask: list the missing strips (4 tundra species, all mars species, Frost Dragon, Red Titan) for Codex with sizes per ART-HANDOFF; wire each as it lands (STRIPS preload). Code acceptance per wired species: strip used (fallback counter 0), faces 4 directions, `isle-creature-art` green.

---

## P3
- W-13 joystick look (b12-10): round knob, ring 20% smaller at <= 390 px; needs class names from realm.js (request to Gameplay).
- W-14 list (TRIAGE section 4): one commit per sub-item, measured assert each.
- W-15 Stalk compass (b11-06, b12-17): `scroll-margin-top` on headings = nav button height + 8 px. Assert: after scrollIntoView the heading rect does not intersect `#mm-nav-btn`.
- W-18 Isles HUD polish list (after W-12 in the same isles.js slot).

## Requests to other lanes
- Gameplay: class hook on the chase toast (realm.js:4761) for W-05 / W-16; stick element class names (W-13); I apply your 1-line `?floor` hook at mad-maze.js:132 (G-25) on request.
- Performance+Systems: tell me when S-06 (mm-art cache) merges; I may need a `preload(ids)` export after it.
- Owner (via lead): O-10 statue art / label, plaza tile art, Isles strips.
