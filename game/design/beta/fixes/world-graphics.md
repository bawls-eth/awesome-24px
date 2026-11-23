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
