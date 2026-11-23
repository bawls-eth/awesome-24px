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
