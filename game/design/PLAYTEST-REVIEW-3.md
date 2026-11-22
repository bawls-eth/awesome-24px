# Playtest review 3: a brand-new player, end to end (2026-11-22)

## What was run
`game/tools/playtest-bot/journey3.js` (new; see its README section) on branch `playtest3` = `claude/animal-crossing-game-7z3roh` at
31f6e01, served from the worktree on port 9251. Phone 390x844 (touch, `isMobile`) and desktop 1280x720, with Playwright `recordVideo`.
Each viewport used **one persistent browser profile**, so progress carried from page to page like a real player's. The bot used
real input only: keys, mouse, and touch pointers on the real sticks and buttons.

The journey for each viewport (about 40 minutes of play in total, 21 stage runs, 48 webm videos kept in the scratchpad, not committed):
1. **Town** offline: join card, then Play offline, then walk to the Realm Gate.
2. **Realm**: hero picker, 6-step tutorial, a 60 s first fight, then the backpack.
3. **Where to -> Realm**: grind, walk to the Nexus, vendor stall, Shop (bought a Spark Wand with shards), backpack Stats dropdown, Equip, Forge.
4. **Dungeon**: Nexus Meadow portal, follow the gold arrow, fight, Leave.
5. **Hub**: Where to -> World map, Daily gift, Campfire Jam (one song), Menu back to the Hub.
6. **Isles**: Hub chip -> Isles, first tame on Hearth Isle, gathering, dock and sea chart, the jungle (tame), raft attempt, the reef.
7. **Where-to hops** across 8 places: Town, Realm, Isles, Bug Safari, Angler, Deepdelve, Stalk, Lantern, Town.
8. **Feedback**: Town settings -> "Suggest or report a bug" -> save a note.

**Hooks and shortcuts, stated plainly.**
- **Realm:** given `?test=1` only so the bot could **read** where enemies are (for aiming) and where the Nexus portal and NPCs are
  (for steering). `test=1` hides the first-run hero picker, the tutorial and the feedback box, so the bot added
  `heropick=1&tutorial=1&feedback=1` to put them back. In one early run the bot did not add these, and it played as a classless
  token. Those shots were discarded.
- **Isles:** given `?test=1` to read creature, hero and dock positions. Glints and the dungeon arrow were found by scanning screen
  pixels, the way an eye would.
- **Coral Reef:** never reached by play (see #2). The bot then opened `isles/index.html?isle=reef` directly to look at it (see #12).
- **Bot artefacts, not counted as bugs:**
  - Two runs overlapped on one browser profile, which showed an empty Isles pack. That was a profile race, and the inventory was intact on the next clean run.
  - The machine was loaded (up to 5 browsers at once), so frame timings are not trustworthy.
  - With the DB blocked, every Town visit needs about 6 s and "Play offline".

**Safety and health.** 182 DB HTTP requests and 4 DB WebSockets were blocked (`context.route` + `context.routeWebSocket`, the
`blockDb` rule), and **0 sockets were opened**. There were **0 page errors, 0 console errors and 0 HTTP 4xx**. The bot never chatted. The only
thing written anywhere was the local profile (one feedback note in `pixeltown-feedback-v1`).

Screenshots: `game/design/playtest3/` (37 PNG, all < 400 KB).

## Ranked top 15 problems

| # | Sev | Page | Problem (what a new player hits) | Evidence | Suggested fix |
|---|-----|------|---|---|---|
| 1 | **blocker** | Isles | **The first tame on Hearth Isle cannot be finished.** Puffwool wants clover and Thistle Boar wants apple. Feed only uses the taming *pouch*, which holds only `jungle_berry`, `raw_meat` and `bug` (`IC.STARTER_POUCH`). Apples and clover you gather go to the *pack* (`invAdd`), never the pouch. The toast says "Thistle Boar wants apple. You have none." while the craft panel shows "apple x1". The Isles node's first medal and the Hub calm goal "Make a first friend" therefore fail on the home island. Both viewports, 16+ Feed taps each | 24, 25 | In `feed()` (isles.js ~675), fall back to a diet item in `save.inv` and spend it from there. Or give the pouch the meadow foods and refill it from `nodeTick`. Make the hint name where the food is ("clover grows as glints in the meadow") |
| 2 | major | Isles | **No raft in 11 minutes of play.** The bot spent 4 jungle sessions (120-200 s each, 600+ glint pickups attempted) and found 0 `vine_rope`, while wood reached 12. Vine is 0.8% of fern/moss tiles, and the craft row and sea chart never say where it is. The reef stays shut | 26, 27 | Seed 2-3 vine nodes within 15 tiles of the jungle dock. Show "Found on: Verdant Jungle ferns" on the Raft row and in the sea chart's "Craft it" |
| 3 | major | Realm | **"Visit the Nexus" pill floats over open panels.** It draws over the backpack, shop and forge, and covers a row's **Equip** button. The bot's tap check logged "Equip item is covered by rw-nexus-go". Phone and desktop | 11, 14 | Hide `#rw-nexus-go` while any `.rm-panel`, the backpack, the shop or the tutorial overlay is open. Or drop its `z-index` under the panels (realm-world.js ~1487) |
| 4 | major | Realm dungeon (phone) | **Phone dungeon room is a letterboxed strip.** The Meadow room fills about 36% of the screen height, with black above and below and tiny enemies. Review 1 #7 has come back for landscape rooms. Desktop is fine | 17 vs 16 | On portrait, zoom the room to about 1.4x with a camera that follows the hero, or pick portrait-oriented room layouts when `innerHeight > innerWidth` |
| 5 | major | Realm world | **The Midlands are still a short walk away.** Fighting near the spawn and chasing targets carried the hero into "Midlands · Dangerous" and killed it at **32 s (phone, Lv 5)** and **46 s (desktop, Lv 3)**. Desktop Lv 3 meets 3 big golems and 4 winged brutes at once. The border toast exists, but there is no soft stop | 06, 07 | Add a 10-tile "edge of the shore" buffer where Midlands mobs do not aggro across the line. Slow the hero (or bounce once) on the first crossing below Lv 5. Put a "Turn back? Midlands are Lv 5+" prompt on the toast |
| 6 | major | Campfire Jam | **Menu mid-song pauses but does not open.** Tapping the compass Menu during a song shows "Paused", but the Where-to sheet stays hidden. A second tap is needed. Reproduced on both viewports and by a standalone probe (`hidden: true` after the tap) | 21 | `MMNav.onOpen` calls `pause()`, and the overlay it draws closes or hides the sheet. Pause without re-rendering over the sheet, or call `MMNav.open()` again after pausing (jam.js ~350) |
| 7 | major | Nexus vendor | **The vendor kicks you out of the Nexus.** Shop and Forge close the Nexus (`nxStallShop` calls `nexusClose()`), so after one purchase you are back in the world and must walk to the portal again. The stall also mixes two currencies: dust for the shelf (all items disabled at 0 dust) and shards for the Shop button. A new player has 0 dust | 09, 10 | Open the shop and forge **over** the Nexus and return to the stall on close. Lead with the shards Shop, and fold the dust shelf under "Trade dust (you have 0)" |
| 8 | major | Lantern | **"Welcome back" offer for a hero that does not exist.** A 10-minute-old player opening Lantern Camp is told "We found your hero from the old Realm arena... copy it as the Legacy Ranger". The hero card says Thicket Ranger **Level 1, fame 0**, while the same hero is **Lv 4** in the Realm | 34 | Only show the legacy offer when a pre-world arena save actually exists. Show the Realm level on the Lantern card, or label it "Lantern rank" |
| 9 | minor | Realm | **The tutorial card sits over panels.** "Walk into a glowing portal... 5/6 Skip" covers the top of the backpack (title and close area) and part of the minimap during play | 04, 11 | Hide the tutorial card while a panel is open, and dock it below the zone line on phones |
| 10 | minor | Nexus (phone) | **The phone Nexus is small and cluttered.** The walkable plaza uses about 1/3 of the screen, with the lower half empty. Edge labels are clipped ("dow", "Bran"). The move stick sits on the stall's buy buttons, and the talk text overflows its box | 08, 09 | Let the stage fill the free height, inset the labels, and hide the stick while the stall or the board is open |
| 11 | minor | many | **Keyboard hints on touch screens.** Examples: "🛒 Shop (V)" in the backpack, Jam "Press D F J K", Deepdelve "Click... WASD + Space", Isles "Press G or Gather" and "Soothe shots (Q)" | 10, 12, 33, 30 | Strip key hints when `(pointer: coarse)`, as the Realm already does for "Visit the Nexus" |
| 12 | minor | Isles | **Locked isles open by URL.** `isles/index.html?isle=reef` loads the Coral Reef without a raft and awards the **"Coral Reef" medal**. MMNav stores `isle=` in its Continue URL, so a shared or stale link does the same | 30 | Check `UNLOCK_BY_ITEM` on load. A locked isle falls back to the home dock with a toast |
| 13 | minor | Realm (desktop) | **Holding fire over a HUD button triggers it.** When an enemy stands under a HUD button, holding fire opens that button: the locked-ability sheet ("Shield (R)... Unlocks at Level 5") popped up mid-fight in the Midlands, and in another run the Menu opened by itself | 07 | Ignore pointerdown on HUD buttons while the fire button is already held. Show ability info on hover or right-click only |
| 14 | minor | Isles UI | **Isles UI overlaps and reads poorly.** The compass Menu covers panel titles ("raft" for Craft). Disabled **Craft** buttons look like enabled ones. On desktop a 7-line key-help block covers the bottom-left of the play field for good. The hero is about 16 px next to 40-60 px creatures and trees | 26, 29, 28 | Pad panels below the Menu button, give disabled Craft buttons a dashed or muted style, collapse the help into a "?" chip, and scale the hero up 1.5x |
| 15 | minor | Town / Hub | **Town and Hub layout squeeze.** Town labels overlap ("💰 🪵 +50%⭐today" under "Shop"; the player name sits on "Able Sisters"). On desktop the Hub map is squeezed into about 530x340 px under the games strip and the calm card. The feedback box on phone is 3 taps deep (In town chip, Settings, the box) and is a 170 px column | 37, 19, 35 | Stack or offset the shop sub-label, cap the calm card at 2 rows on desktop (or make it collapsible), and give the feedback box a full-width sheet on phones |

## What improved since reviews 1 and 2

| Earlier item | Now | Evidence |
|---|---|---|
| R2 #3 / R1 #5: slow kills, 0-3 kills per 20 s | **Fixed.** First minute: 7-18 kills, Lv 2-4, no deaths on the shore | 03, 05 |
| R2 #2 / R1 #4: bullet field, off-screen fire | **Much better.** The shore shows a handful of readable bolts, and damage feels earned | 03, 05 |
| R2 #5: Nexus is a menu | **Fixed.** A walkable plaza with NPCs, portals, an act button and a vendor stall (see #10 for phone polish) | 08, 15 |
| R2 #4: dungeon return lands in a raid | **Fixed in our runs.** Return lands on the quiet shore by the portal | 16 |
| R1 #14: empty start rooms | **Fixed.** A gold arrow, which the bot followed into room 2 on both viewports | 16 |
| R2 #15: "weapon: empty" | **Fixed** for a real hero ("Thicket Ranger Bolt") | 04 |
| R2 #12: Play offline cut off at 720 px | **Fixed.** Offered after 5-6 s with a clear message | 01 |
| R2 #14: phone banner clipped | **Fixed.** The "The Realm · island #N" banner is clear | - |
| R2 #10: keyboard hints on phone | **Partly fixed.** Gone in the Realm prompts, still present elsewhere (#11) | 33 |
| NAV-AUDIT: 5 of 8 minigames unreachable | **Fixed.** The Hub has a games strip for all 8, and **Where to?** is on every page | 18, 31, 32 |
| R1 #7: phone dungeon strip | **Regressed / remains** for wide rooms (#4) | 17 |
| R2 #1: zones too close | **Partly.** There is a border toast, but chasing still lands you in the Midlands in 30-45 s (#5) | 06 |

**New and good:**
- **Where to? sheet everywhere.** It looks the same on every page and shows **Continue** and **Back to <place>** rows. All 8 hops worked on both viewports, at 3-6 s each.
- **The join card remembers your name.** It also offers "Continue: The Realm" or "Continue: Lantern Camp".
- **Hub "Things you could do" calm goals.** They show and update after play ("Dig to depth 8", "A little profit", "Catch a first fish").
- **The Hub Continue chip** appears after a game ("Continue: Campfire Jam"). The Daily gift (36 shards) works.
- **Hero picker plus the 6-card tutorial.** They are short and readable.
- **The backpack Stats dropdown.** An 18-row Total / Base / Gear table that is easy to read on phone.
- **The Forge.** "Salvage for 2 dust", with "Reforge opens at T7" stated up front.
- **The Shop with shards.** Prices are clear, and the buy worked.
- **Jam's song list** is reachable at once. "Got it" and "Skip for now" clear the how-to and the calibration.
- **Isles hints are directional.** For example "A Thistle Boar is to the south: walk over to tame it".
- **The Isles first tame works on the jungle** in about 60 s, with medals for First tame and Small friend.
- **The feedback box saves locally.** Typing "wasd e b 1 2" did not move the hero or fire emotes.

## Would a new player keep playing? (verdict)
1. **The first 3 minutes are now good.** Town, Play offline, the gate, a hero picker and a tutorial, then real kills, level-ups and loot.
2. Combat finally feels fair on the shore. Levels arrive every 20-30 s, which is a strong hook.
3. The Where-to menu fixes "where is everything?". A curious player can reach every game in 2 taps.
4. The Hub's calm goals give a gentle "what next" that the game lacked.
5. The first real wall is the Midlands. A player who chases one more enemy dies at about 40 s with no warning beyond a toast.
6. The Nexus feels like a place now, but the vendor sends you back outside after one purchase, and dust versus shards confuses.
7. On the Isles the very first goal ("tame a friend") **silently cannot succeed on Hearth Isle**. That is the most likely quit point.
8. The raft and reef goal is a grind with no pointer to vine rope. Most players will not see the reef.
9. Small overlaps (the Nexus pill, the tutorial card, the Jam menu, keyboard hints) add friction but do not stop play.
10. **Verdict: yes for the Realm and the Hub, likely to quit on the Isles.** Fix #1-#3 and the first 10 minutes hold together.

## Five small, high-value polish slices
1. **Isles feed from the pack** (#1): in `feed()` take a diet food from `save.inv` when the pouch has none, and say where it grows
   (`games/isles/isles.js` feed + hint). About 15 lines; it unblocks the first tame on the home island.
2. **Hide the Nexus pill under panels** (#3, #9): one guard in the Nexus prompt tick, plus the same for the tutorial card when an
   `.rm-panel` is open (`games/mad-maze/realm-world.js`, `realm-tutorial.js`).
3. **Jam Menu opens on the first tap** (#6): pause without hiding the sheet (`games/jam/jam.js` `MMNav.onOpen` handler).
4. **Vendor keeps you in the Nexus** (#7): Shop and Forge open over the Nexus and return to the stall on close. Show the shards Shop first
   (`realm-world.js` `nxStallShop` / `nxStallForge`).
5. **Vine rope near the jungle dock + "Found on" text** (#2): seed 2-3 nodes by the dock and add a source line to the Raft row and
   the sea chart (`shared/mm-biome-packs.js`, `isles.js` craft panel).

## Screenshot index (`game/design/playtest3/`)
01 offline offer · 02 hero picker · 03 phone first fight · 04 tutorial card over backpack · 05 desk first fight · 06 phone
Midlands death · 07 desk Midlands + ability sheet popup · 08 phone Nexus · 09 vendor stall + stick · 10 shop · 11/14 Nexus pill over
backpack · 12 Stats dropdown · 13 Forge · 15 desk Nexus · 16 desk dungeon arrow · 17 phone dungeon strip · 18 phone Hub · 19 desk Hub ·
20 Jam · 21 Jam menu paused, no sheet · 22 Hub Continue · 23 Isles first · 24/25 feed: none in pouch, apple in pack · 26 craft panel ·
27 sea chart · 28 jungle first tame · 29 desk Isles help wall · 30 reef via URL · 31/32 Where to? · 33 Deepdelve key hints · 34
Lantern legacy offer · 35/36 feedback · 37 Town label overlap.
