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
