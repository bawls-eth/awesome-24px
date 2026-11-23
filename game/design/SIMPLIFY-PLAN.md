# Simplify plan: one simple, game-like Pixeltown (2026-11-22)

**Owner request:** "Play-test the feel of everything. Make everything flow and feel like a game. Reimagine the whole game to be simple, with a nice 8-bit feel."

**Evidence:** `PLAYTEST-REVIEW-4.md`, produced by the `game/tools/playtest-bot/journey4.js` bot with phone and desktop runs. The screenshots are in `game/design/playtest4/`.

**Hard limits on every item below:**
- No real money, paid randomness, streaks or fake urgency.
- No feature is removed. "Retire" means "hidden from the first-run path, still reachable from More".
- The `pixeltown-save-v1` save stays additive.

## 1. The problem in one paragraph

Today a new player meets 14+ destinations on the first screen:
- the Town join card, with 21 species tabs;
- the Hub, with 12 game chips, a goals card, Collections, a map, Daily gift, Open and Menu;
- a Realm with a hero picker, a tutorial, a Nexus, a vendor, a shop, a forge and two currencies;
- the Isles, with a pouch, a pack, crafting, a raft and a sea chart;
- 11 mini games, each with its own fonts, buttons, start screen and keys.

Each part is fine on its own, but the whole does not read as **one game**. There is no single answer to "what do I do now?". Controls change per game (D F J K, WASD + Space, G, Q, E, tap anywhere), and the look jumps between a rounded Nunito web card, a monospace 8-bit Hub and smooth vector canvases.

## 2. Three pillars

The home screen (the Hub) shows **three big doors**. Nothing else is above the fold except a Continue button.

| Pillar | What it is | Contains today's | First-run state |
|---|---|---|---|
| **Adventure** | The one long game: a hero, levels and loot | Realm (shore, Nexus, dungeons), Isles (tame, craft, sail), Lantern Camp as the Realm's "camp" screen | Open. It is the guided first session (section 6) |
| **Arcade** | Quick games of 1-3 minutes with a score and a "best" | Campfire Jam, Angler, Bug Safari, Pixel Pop, Lantern Dash, Stack Tower, Echo Garden, Deepdelve, Stalk Market | 3 shown (Pop, Dash, Jam). The rest appear one at a time as the player finishes any run: "New in the Arcade: Stack Tower". No locks behind time or money |
| **Home** | Your place and your people | Town (multiplayer, house, chat), Collections, medals, calm goals, settings, feedback | Open. The Town keeps its own join card, shown only the first time you enter Home |

**Merge:**
- Lantern Camp becomes a screen of the Adventure (camp = hero roster plus vault), not a separate destination.
- "Campfire" (the Hub chip label) and "Campfire Jam" are the same game: use one name.
- Daily gift folds into Home's mailbox. It is a gift when you come back, with no streak counter and no countdown.
- Collections, medals and calm goals become one "Album" in Home.
- The shards and dust split in the Nexus becomes one visible currency (shards). Dust stays as a save key but is converted and shown as "salvage", not as a second wallet.

**Hide behind More** (still one tap away):
- Classic arena
- Arcane Frontier
- Practice, Relax, Assist and Concert modes in Jam (one "Options" button)
- Deepdelve settings
- Stat table columns (Base / Gear): show only Total by default
- Forge reforge
- Sea chart detail

**Retire from the first-run path** (kept, reachable from More, not promoted):
- The Town species picker, which drops from 21 tabs to a default villager plus a "Change look" button
- The legacy-hero offer in Lantern Camp (show it only when an old save exists, see PLAYTEST-REVIEW-3 #8)
- Duplicate entry points to the Realm (the Town gate menu, the Hub chip and the Where-to row all stay, but the Hub door is the promoted one)

## 3. One control scheme

Every page uses the same five verbs, with the same key and the same on-screen button in the same place.

| Verb | Desktop | Phone (390 wide) | Pad (later) | Used for |
|---|---|---|---|---|
| **Move** | WASD / arrows | Left stick, bottom-left (games with lanes: tap the lane) | Left stick | Walk, steer, aim a cast |
| **Primary** | Space / left click | Big round **A** button, bottom-right, 72 px | A | Shoot, hit a note, cast, drop a block, dig, tame |
| **Secondary** | E / right click | Smaller **B** button above A, 56 px | B | Ability, reel, gather, feed, special |
| **Menu** | Esc / Tab | The compass button, top-left (already on every page as MMNav) | Start | Pause, bag, stats, map, settings, Where to |
| **Restart** | R | "Again" on the end card (the same card everywhere) | Select | New run in arcade games, respawn in Adventure |

**Rules:**
- On a coarse pointer, never print key names. Show the A, B and stick glyphs instead (one helper: `MMControls.label('primary')`).
- Rhythm games may keep 4 lanes, but the lanes are drawn as buttons, without D F J K letters on touch.
- Every arcade game has the same three screens: Title card (one "Play" button and one line of how-to), Play, End card (score, best, "Again", "Menu").
- No game opens with more than **25 words** before the first Play.

## 4. One 8-bit identity: checklist

Each page passes when all of these are true:
1. **Font:** one pixel font for headings, buttons and numbers, with the existing `ui-monospace` stack as a fallback. Body text is at most 2 lines per card. No Nunito or Arial anywhere.
2. **Palette:** one 16-colour master palette (from `ART-HANDOFF.md`). The UI uses 4 roles of it: ink, paper, accent (the gold already used by the Hub and Jam) and danger.
3. **Pixels:** every canvas uses `image-rendering: pixelated`, an integer scale and no smoothing. The bot logged 8 of the 10 arcade canvases as `smooth` (see the review).
4. **Frames:** one 9-slice panel border (2 px dark outline, 1 px light inner edge) for every card, sheet and button. No rounded web pills with soft shadows.
5. **Buttons:** at least 44 px tall, chunky, with a pressed state that moves 2 px down. The disabled style is dashed or muted, never just a little greyer.
6. **Motion:** 4-frame or 6-frame steps for UI transitions (an iris or wipe, already in the Hub). No long CSS ease-in-out fades.
7. **Juice:** every Primary press gets a hit flash, a 2-4 frame screen shake on big hits, a pop number and a sound blip. One shared `MMJuice` helper is used by all games.
8. **Audio:** one chiptune SFX set (blip, coin, hit, level, fail, menu) through one mixer, with one Sound toggle that is remembered everywhere.
9. **Words:** short, game words. Use "Play", "Again", "Bag", "Map", "Menu". Avoid "Calibrate", "Assist (one thumb)" and "Concert (3 songs)" on the first screen.
10. **Icons:** pixel icons from the art batches, not emoji, for the 3 pillars, the 9 arcade games and the 5 control verbs.

## 5. Information diet

- **HUD:** at most 3 numbers on screen in any game (for example HP, level and score). Everything else goes behind Menu.
- **Stats:** the Total column only, 6 rows (HP, Power, Speed, Defence, Luck, Level). The 18-row table moves to "Details".
- **Inventory:** one Bag across Adventure (the Realm backpack and the Isles pack and pouch, shown as tabs of one panel). The taming pouch is a filter of the bag (this also fixes PLAYTEST-REVIEW-3 #1).

## 6. First session: the first 5 minutes in 5 beats

The player sees exactly one call to action at a time. Each beat ends with a short reward sting (sound, flash and a 1-line card), then auto-advances.

| Beat | Time | Screen | The one call to action | Reward |
|---|---|---|---|---|
| 1. **Hello** | 0:00-0:20 | Title: "PIXELTOWN" logo, a walking hero, one button | **Play** (the name is asked later; the villager is random and changeable in Home) | Iris wipe into the shore |
| 2. **Move and hit** | 0:20-1:30 | The Realm shore, 3 slow slimes, the stick and A shown pulsing | "Move" then "Press A" (2 cards of up to 6 words each) | First kill: coin pop and "Level 2!" |
| 3. **Loot** | 1:30-2:30 | A bag drops and the Bag button shines | "Open your Bag, tap the shiny sword" | Equip flash, Power +2 shown big |
| 4. **A place** | 2:30-4:00 | A gold arrow leads to the Nexus portal, then a short 2-room dungeon with a boss slime | "Follow the arrow" | Chest, then the "Adventure 1 done!" card |
| 5. **Choose** | 4:00-5:00 | Back to the Home screen with the 3 doors. Arcade has 3 games with a "New" badge | "Try a quick game" or "Keep adventuring" (2 buttons) | The Album gets its first page |

Isles taming, crafting and the Town are revealed in session 2 by the Album's next pages ("Make a first friend"), not in the first 5 minutes.

## 7. Fifteen sliced follow-up tasks

S = must run serially after the named task. P = parallel-safe (touches different files). Every slice keeps `node game/tests/run-all.js` green, with a new test file as named.

| # | Slice | Files | Acceptance test | Order | Covered in flight? |
|---|---|---|---|---|---|
| 1 | **Three doors on the Hub** (Adventure / Arcade / Home plus Continue), with the 12 chips moved into the Arcade sheet | `game/hub/index.html`, `hub.js`, `hub.css` | `tests/hub-three-doors.test.js`: on 390x844 a new profile sees exactly 3 doors plus Continue above the fold, and each opens its target in at most 1 tap | P (first) | **Partly: hub-simple** (Hub home screen). Check that it lands on 3 doors, not a new list |
| 2 | **`MMControls` shared helper** (verbs to keys, A/B buttons, coarse-pointer labels) | new `game/shared/mm-controls.js` + css | `tests/shared-controls.test.js`: label('primary') returns "A" on touch and "Space" on desktop; the buttons are at least 56 px | P (first) | **Partly: realm-universal** (Realm universal controls). Lift its mapping into the shared file |
| 3 | **Realm on `MMControls`** (A = fire, B = ability, Menu = bag/stats) | `games/mad-maze/mad-maze.js`, `realm-world.js` | Existing realm tests plus "no key letters on touch" | S after 2 | **Yes: realm-universal** |
| 4 | **Stat menu diet** (Total-only, 6 rows, Details toggle) | `realm-world.js` backpack panel | `tests/realm-stats-compact.test.js`: 6 rows by default, 18 rows after Details | S after 3 | **Yes: realm-universal** (stat menu). Verify the row count |
| 5 | **Shared arcade shell** (Title / Play / End card with Again and Menu, a 25-word cap) | new `game/shared/mm-arcade-shell.js` + css | `tests/arcade-shell.test.js`: each of the 9 arcade pages shows at most 25 words before Play, and the End card has Again | P | **Partly: mg-8bit-a / mg-8bit-b** (8-bit restyle of mini games). The shell itself is new |
| 6 | **Arcade games A** on shell plus `MMControls` (Pop, Dash, Stack, Echo, Jam) | `games/pop`, `dash`, `stack`, `echo`, `jam` | Per-game: no key letters on touch, Again restarts in at most 1 s | S after 2, 5 | **Look: mg-8bit-a/b**. Controls and shell: no |
| 7 | **Arcade games B** on shell plus `MMControls` (Angler, Bugs, Stalk, Deepdelve) | `games/angler`, `festival`, `stalk`, `deepdelve` | As 6 | S after 2, 5; P with 6 | **Look: mg-8bit-a/b** |
| 8 | **8-bit tokens and font** (one CSS file: palette roles, pixel font, 9-slice frame, button press) | new `game/shared/mm-8bit.css`; link it from every page | `tests/visual-8bit-tokens.test.js`: every page's computed button font is the pixel stack and no visible canvas is smoothed | P (first) | **Partly: chrome-8bit, town-8bit, isles-8bit** (branch names on the board). Make sure they share one token file |
| 9 | **Town join diet** (Play button first, random villager, "Change look" opens the 21 tabs) | `game/index.html`, `main.js` join card | `tests/town-join-simple.test.js`: at most 6 controls visible on first load, and Join works with an empty name (a default is offered) | P | **Partly: town-8bit** (look only) |
| 10 | **First-session guide** (5 beats, one CTA at a time, skippable) | `games/mad-maze/realm-tutorial.js`, `hub.js` | `tests/ftue-five-beats.test.js`: a new profile sees beats 1-5 in order. Skip works. Not shown again | S after 1, 3 | No |
| 11 | **One Bag** (Realm backpack and Isles pack/pouch as tabs, pouch = filter) | `games/isles/isles.js`, `realm-world.js`, `shared/` bag helper | `tests/isles-feed-from-bag.test.js`: Puffwool can be fed with clover gathered on Hearth Isle | S after 3 | No (it fixes PLAYTEST-REVIEW-3 #1 at the root) |
| 12 | **One currency in view** (shards. Dust shown as "salvage", converted on display) | `realm-world.js` Nexus stall | `tests/nexus-one-currency.test.js`: the stall shows 1 wallet, and an old save with dust keeps its value | S after 4 | No |
| 13 | **`MMJuice` plus chiptune SFX set** (hit flash, shake, pop number, 6 sounds, one remembered toggle) | new `game/shared/mm-juice.js`, `mm-sfx.js` | `tests/juice-sfx.test.js`: Primary in 3 sample games calls flash and blip. Sound off is remembered across pages | P | No |
| 14 | **Album** (Collections, medals and calm goals in one Home page, plus the mailbox gift) | `game/hub/collections.js`, `medals.js`, `calm.js`, `gift.js` | `tests/hub-album.test.js`: one entry point. The counts equal the old three. No streak counter or countdown text | S after 1 | No |
| 15 | **Arcade reveal** (3 games at first, a new one revealed per finished run, "New" badge, never locked by time or money) | `hub.js`, `hub/medals.js` | `tests/arcade-reveal.test.js`: a new profile sees 3, after 1 finished run sees 4, and a save with any game played shows it | S after 1, 5 | No |

**Suggested waves:**
1. Wave 1 (parallel): 1, 2, 8, 9, 13.
2. Wave 2: 3, 5, 14.
3. Wave 3 (parallel): 4, 6, 7, 11, 15.
4. Wave 4: 10, 12.

Re-run `journey4.js` (phone and desktop) after each wave and update the scorecard in PLAYTEST-REVIEW-4.

## 8. What today's in-flight branches already cover

| In flight | Covers | Still open after it |
|---|---|---|
| **hub-simple** (Hub home screen) | Slice 1 in part: a calmer Hub first screen | The 3-pillar doors, the Arcade sheet, Album (14), reveal (15) |
| **realm-universal** (Realm universal controls + stat menu) | Slices 3 and 4. Review items R-1, R-3 and the "keys on touch" part of X-2 for the Realm | Lifting the mapping into the shared `MMControls` (2) for the other 9 games |
| **mg-8bit-a / mg-8bit-b** (8-bit minigames) | The look part of slices 6 and 7, and checklist items 1-5 for the games they touch | The shared shell (5), controls (2), the word cap, juice (13) |
| chrome-8bit / town-8bit / isles-8bit (visible on the board) | Checklist items 1-4 for the chrome, the Town and the Isles | They must agree on one token file (slice 8), or the result is 3 different "8-bit" looks |
