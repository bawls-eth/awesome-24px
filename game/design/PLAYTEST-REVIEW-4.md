# Playtest review 4: does it FEEL like one game? (2026-11-22)

**Owner request:** "Play-test the feel of everything. Make everything flow and feel like a game. Reimagine it to be simple, with a nice 8-bit feel."

This review judges feel, not just bugs. The companion plan is `SIMPLIFY-PLAN.md`.

## What was run (and what was not)

- **Bot:** `game/tools/playtest-bot/journey4.js` (new). It plays a first-time player on a **phone** (390x844, touch, `isMobile`) with a fresh profile. Branch `playtest-4` is the tip of `claude/animal-crossing-game-7z3roh` at de3a630, served on port 9396.
  - **Launch:** the root, the Town join card, then the Hub, as a stranger sees them.
  - **Arcade:** all 11 game entries, about 40-70 s each. "Campfire" is the Hub's entry for **Campfire Jam**, so it was played a second time from `?from=hub`.
  - **Input:** tap the obvious start button, then mash taps across the play field and the lower buttons, like a curious new player.
  - **Survey:** on the first and last screen of every game it counts visible buttons, words and fonts, the key hints a touch player is shown, and whether each canvas is pixelated or smoothed.
- **Adventure results (phone, this run):**
  - The Town offered "Play offline" after 5.9 s, and the walk to the gate took 7 s.
  - The first Realm fight (logged under the `town` stage, which continues through the gate) lasted 60 s: **Lv 4, 17 kills, 0 deaths, 83 shards**.
  - On the Isles, the first tame on Hearth Isle **succeeded** after about 20 Feed taps.
  - The blocked counts for this run are separate from the arcade figures under Safety.
- **Adventure:** `STAGE=adventure` re-runs the `journey3.js` stages (Town offline, then the Realm with the first fight; the Isles) in the same output folder. They ran on the phone only, under the same blocking rules. The Nexus, dungeon, backpack, stats, craft and boat findings use journey3 again plus PLAYTEST-REVIEW-3, which was played on this same build family. Where a finding comes only from review 3, it is marked **(R3)**.
- **Desktop (1280x720), short pass:** launch, the Hub, and Jam, Angler, Deepdelve and the Lantern for 15 s each.
  - The Hub shows **27 buttons and 148 words**. The map, the only thing that moves, is squeezed to 253x240 px under 3 goal rows, a Collections bar and 3 more buttons (shot 20).
  - Nowhere in the chip row is there a door to the Realm: the main adventure is reached through Hearthvale (Town) and its gate, or the Lantern.
  - Jam's first screen has 453 words, and the Lantern's has 483.
- **Not done, and why:**
  - **No full desktop arcade pass.** The 00:30 UTC deadline and a shared machine (one browser at a time) left only the short pass above.
  - **60-120 s per game was not reached.** Each game got 40-70 s.
  - **The mashing input is crude.** It cannot judge skill curves. It does tell you what a new player sees, how many words stand before "Play", and whether a stray tap throws you out.
- **Safety:** every Firebase and identity request and WebSocket was blocked in the context before any page loaded (the `blockDb` rule). The arcade run blocked 26 HTTP requests and 1 WebSocket, and **0 sockets were opened**. There were 0 page errors, 0 console errors and 0 HTTP 4xx. The Town was joined offline only, and the bot never chatted.
- **Screenshots:** `game/design/playtest4/` (phone, each under 300 KB). I looked at every one cited here.

## Headline: the parts are good, but the whole is not one game yet

1. **There is no single first move.** The root URL opens the Town join card: 21 species tabs, a name field and a desktop key legend (shot 01). The Hub opens on 3 of 12 game chips, a goal card, Collections ("0 of 148 found"), a map and 3 bottom buttons, one of them just "Open" (02). Neither screen says "press this to start having fun".
2. **There are at least four visual languages:**
   - the rounded cream Nunito web card (Town join);
   - the monospace dark 8-bit panels (Hub, Jam, Bug Safari, Pixel Pop, Dash, Echo, Stack, Stalk);
   - system-ui blue panels (Angler, Deepdelve, Lantern);
   - a smooth 3D voxel world (Deepdelve).
   
   The survey found **8 of the 10 distinct games draw their main canvas with smoothing**, not pixelated. Only Angler and Bug Safari use `pixelated`.
3. **The controls change on every page:**

   | Game | Controls |
   |---|---|
   | Jam | D F J K lanes, with the letters shown on touch |
   | Bug Safari | stick + "Sneak" + "Swing" |
   | Deepdelve | stick + "Jump / Mine / Place" + "Craft (C)" + "Goals (G)" |
   | Dash | one "Jump (hold = higher)" bar |
   | Stack | "Drop" |
   | Angler | tap the water |
   | Realm | two sticks + ability buttons |
   | Isles | stick + Gather + Feed + Q |

   **7 of the 10 distinct games print keyboard keys to a touch player** ("Keys: arrows move, Enter or Space pops", "Press D", "Shift").
4. **There is too much text before play.** The median is about 110 words before the first Play. The Lantern has 482, Stalk 439, Jam 432 and Campfire 386. A phone reader stops at about 25.
5. **The good news is that the core loops feel right once started.** Pixel Pop, Echo Garden, Lantern Dash and Jam become fun within 7-10 s of "Play". The Realm shore gives level-ups every 20-30 s (R3). Echo Garden and Pixel Pop already look like the 8-bit target (shots 12, 13).

## Scorecard (1 = poor, 5 = great)

| Area | Clarity | Flow | Feel | Look | Top 3 problems | Concrete fixes |
|---|---|---|---|---|---|---|
| **First launch (root and Town join)** | 2 | 2 | 2 | 2 | 1. The root opens a multiplayer join form, not a game. 2. 21 species tabs plus 9 avatars before play. 3. A desktop key legend on a phone; a rounded web look | Title screen with one **Play** button. Random villager with "Change look" behind it. Pixel font and frame. Hide key legend on coarse pointers |
| **Hub** | 3 | 3 | 3 | 4 | 1. The 12 game chips scroll sideways, and the Realm (the main adventure) is not in the first three. 2. "0 ★ 0 0%", "0 of 148 found" and "Open" read as clutter and jargon. 3. The map, chips, goals and gift compete; there is no single "Continue / Start" | 3 doors (Adventure / Arcade / Home) plus Continue. Move Collections, medals and gift into one Album. Name buttons by verb ("Enter", not "Open") |
| **Town (offline)** | 2 | 3 | 3 | 3 | 1. The phone HUD shows 13 zero counters, 6 action buttons and an emote bar (shot 16). 2. The join card needs about 6 s and "Play offline" when the DB is unreachable (this run: offline was offered after about 8 s). 3. Labels overlap on the map (R3 #15, still seen: "Able Sisters" under the player name) | Join card diet (Plan slice 9). Shared 8-bit tokens (slice 8). Offer "Play offline" at once when the SDK fails to load |
| **Realm: shore and first fight** | 4 | 4 | 4 | 4 | 1. The Midlands are reachable in 30-45 s and kill a new hero (R3 #5). 2. Tutorial cards sit over panels (R3 #9). 3. Two sticks plus 4 ability buttons is a lot for minute one | Soft border buffer. Hide cards under panels. Show only Move and A in beat 2; reveal abilities at Lv 3 |
| **Realm: loot, backpack and stats** | 3 | 3 | 3 | 3 | 1. An 18-row stat table (Total/Base/Gear) (R3). 2. Two currencies (dust and shards) at the vendor (R3 #7). 3. The Nexus pill covers Equip (R3 #3) | Total-only 6 rows plus Details. One currency in view. Hide the pill under panels (realm-universal covers the stat menu) |
| **Nexus and dungeon** | 3 | 2 | 3 | 3 | 1. The vendor throws you out of the Nexus (R3 #7). 2. The phone dungeon is a letterboxed strip (R3 #4). 3. Portals named by biome, with no "start here" | Shop over the Nexus. Portrait zoom with a follow camera. Mark one portal "First dungeon" with the gold arrow |
| **Isles** | 3 | 2 | 3 | 3 | 1. **The first tame on Hearth Isle now works** (R3 #1 is fixed on the tip): Puffwool was tamed in this run, "Medal: First tame". But it took about 20 Feed taps, with a "Puffwool is still chewing." toast in between and a "feed it clover x5 - 5/6" hint (shot 18). 2. The craft panel lists 8+ recipes (raft, 2 rocket cores, 4+ saddles) on the first visit. The Raft row now says where vine rope grows (R3 #2 is partly fixed), but the "Craft" title sits under the compass, and disabled Craft buttons look like enabled ones (shot 19). 3. A 6th control set: stick, **Fire**, Feed, Soothe, Decor and Map, all different from the Realm's A and ability buttons | Feeding: one tap per bite with a visible chew bar, and 3 bites, not 5. Craft panel: only recipes you can nearly make, plus "more later". Controls: Primary = Feed/Fire by context, Secondary = Soothe, with Decor and Map in Menu |
| **Campfire Jam** | 2 | 4 | 4 | 4 | 1. 432 words and 15 buttons (Relax, Assist, Concert, 4 difficulty rows) before play. 2. D F J K letters on touch lanes. 3. "Campfire" in the Hub and "Campfire Jam" are one game with two names | One Play plus Options. Lane glyphs instead of letters on touch. One name |
| **Lakeside Angler** | 2 | 3 | 3 | 2 | 1. 9 buttons and a stat line ("Bites come 20% slower, but each bite waits 0.3 s longer") before the first cast. 2. One spooked cast gives a modal "Spooked! Too early by 3.7 s"; the failure is wordy. 3. System-ui font and soft panels, unlike the Hub | Cast first, with menus behind Menu. A one-word "Too soon!" pop over the bobber. Pixel font and frame |
| **Bug Safari** | 3 | 3 | 3 | 4 | 1. 8 of 9 arenas shown as grey "Locked" tiles on the first screen. 2. Developer text on screen: "Add ?mods=0 to the address", "Points x1.1". 3. The play field is 358x252 with 40% of the phone empty below | Show only the open arena plus a "more to find" line. Drop the URL hint and the multipliers. Let the field fill the height |
| **Stalk Market** | 2 | 1 | 2 | 3 | 1. Real-calendar gating: on Sunday you can only buy and selling waits for real days, so nothing playable happens in 60 s. 2. 439 words plus a graph before you understand it. 3. "Shift" key hints on touch | An in-game "Next day" button (a sim week in 2 minutes). Keep the real-calendar mode as an option. Tutorial in 3 lines |
| **Deepdelve** | 2 | 3 | 3 | 2 | 1. Smooth 3D voxels, so it does not look like the rest of the game. 2. "Craft (C)", "Goals (G)", "Mode: Survival", "Creative world" and "Seed 1" fill the top before play. 3. A dense 4-line HUD over the view | Pixelated render scale (render at 1/3 and upscale nearest). Hide modes behind Menu. A 2-number HUD |
| **Pixel Pop** | 4 | 4 | 4 | 5 | 1. "Keys: arrows move, Enter or Space pops" on phone. 2. The timer showed 60 until the first pop, so it was unclear whether the round had started. 3. 114 words on the first card | Strip the key line. Start the clock on the first pop with a "GO!" flash. 1-line card |
| **Lantern Dash** | 4 | 4 | 3 | 4 | 1. The jump bar says "Jump (hold = higher)", a rule rather than a button. 2. The field is 358x241, and the lower 55% of the phone is text. 3. Smoothed canvas | A big A button. Taller field. Pixelated canvas |
| **Stack Tower** | 3 | 2 | 3 | 4 | 1. Mashing taps left the game for the Town join card within about 20 s (shot 11): a leave control sits in the tap zone. 2. "Space/Enter" key hints. 3. No visible "Again" in the bot's exit check | Never put a leave link where the play taps land. A shared End card with Again and Menu |
| **Echo Garden** | 4 | 4 | 4 | 5 | 1. "Keys: 1 to 4 tap a flower..." on phone. 2. 103 words before play. 3. "Leaves left: 2 of 3" plus "Your turn" plus "Goal" is three status lines | Strip keys. One status line ("Your turn: 3 flowers") |
| **The Lantern (camp)** | 1 | 1 | 2 | 3 | 1. 482 words. The class dropdown carries a paragraph of unlock rules. 2. "Start run" is shown next to "Create a hero first", and its hero is separate from the Realm's. 3. Four overlapping concepts (fame, heroes, classes, runs) for a new player | Make it the Adventure's camp screen. Show the Realm hero. Unlock rules behind "?" |

## Ranked master list (P0 = fix first, P1 = next, P2 = polish; #45-47 were added from the Adventure run and slot in by their priority)

| # | Pri | Area | Problem | Fix |
|---|---|---|---|---|
| 1 | P0 | Launch | The root URL opens a multiplayer join form (21 species tabs, name field), not a game | Title screen with one Play button that goes into the guided first session (Plan section 6) |
| 2 | P0 | Global | No single next step on the Hub: 12 chips, goals, Collections, map, gift and Open compete | Three doors plus Continue (Plan slice 1) |
| 3 | P0 | Global | Controls differ per game (D F J K, Sneak/Swing, Jump/Mine/Place, Drop, tap, two sticks) | `MMControls`: Move / A / B / Menu / Again (slice 2) |
| 4 | P0 | Global | Keyboard keys printed to touch players in 7 of 10 games | One coarse-pointer label helper. Never print key names on touch |
| 5 | P0 | Global | 100-480 words before the first Play | 25-word cap and a shared Title card (slice 5) |
| 6 | P0 | Isles | The first tame works now, but it needs about 20 Feed taps with "still chewing" pauses: the first friend feels like a chore (shot 18) | 3 bites, a chew bar, Feed as the Primary button. One Bag (slice 11) keeps food in one place |
| 7 | P0 | Stalk | Nothing playable for days (real-calendar gating). Feels like a waiting game | "Next day" button sim mode. Real-calendar mode as an option, never pushed |
| 8 | P0 | Look | 4 visual languages (Nunito cards, monospace pixel, system-ui panels, 3D voxels) | One `mm-8bit.css` token file (slice 8) |
| 9 | P1 | Look | 8 of 10 games draw a smoothed canvas, not a pixelated one | `image-rendering: pixelated` plus integer scale in every game |
| 10 | P1 | Stack | A stray tap leaves the game for the Town join card | Keep navigation out of the play zone. A shared End card |
| 11 | P1 | Lantern | 482 words. The hero is separate from the Realm hero | Fold into the Adventure as the camp screen (Plan section 2) |
| 12 | P1 | Jam | 15 buttons before play (Relax, Assist, Concert, 4 difficulty rows) | Play plus Options |
| 13 | P1 | Hub | "Campfire" and "Campfire Jam" are one game under two names | One name everywhere |
| 14 | P1 | Hub | The Realm, the main adventure, has no chip in the Hub's game row on phone or desktop (shot 20). It is reached through the Town gate or the Lantern | The Adventure door first |
| 15 | P1 | Hub | "Open" button, "0 ★ 0 0%" header | Verb labels. Drop zero counters for new players |
| 16 | P1 | Bug Safari | 8 of 9 arenas shown locked on the first screen | Show what is open. Reveal the rest after a run |
| 17 | P1 | Bug Safari | Developer text "Add ?mods=0 to the address" and point multipliers on screen | Remove from the player UI |
| 18 | P1 | Angler | 9 buttons and a percent stat line before the first cast | Cast first. Tournament, Market and Aquarium behind Menu |
| 19 | P1 | Angler | Failure is a modal with "Too early by 3.7 s" | A short "Too soon!" pop. Recast in 1 tap |
| 20 | P1 | Angler | "Ice Hole (Open Dec-Feb)" gates on the real calendar | Unlock by play (a catch count), not by date |
| 21 | P1 | Deepdelve | Smooth 3D does not match the 8-bit identity | Low-res render target plus nearest upscale, palette-limited textures |
| 22 | P1 | Deepdelve | Modes, Seed and Creative shown before play | Behind Menu |
| 23 | P1 | Realm | Midlands death at 30-45 s (R3 #5) | Shore buffer and a level gate prompt |
| 24 | P1 | Realm | 18-row stats, two currencies (R3) | Total-only stats and one wallet (slices 4, 12). The stat menu is in flight on realm-universal |
| 25 | P1 | Realm | The vendor ejects you from the Nexus (R3 #7) | Shop and Forge over the Nexus |
| 26 | P1 | Dungeon | Phone letterbox strip (R3 #4) | Portrait zoom plus a follow camera |
| 27 | P1 | Isles | The craft panel shows 8+ recipes on the first visit. Disabled Craft buttons look enabled, and the compass covers the title (shot 19). The vine pointer now exists, but the bot again found no vine in its jungle pass | Show only near-makeable recipes. Dashed disabled style. Pad under the compass. Vine near the dock |
| 28 | P1 | Global | No shared End card: "Try again", "Again", "Restart", or nothing | One End card: score, best, Again, Menu |
| 29 | P1 | Global | No shared juice: some games flash and pop, others only change a number | `MMJuice` plus one chiptune SFX set (slice 13) |
| 30 | P2 | Town join | Desktop key legend on phones | Hide on coarse pointers |
| 31 | P2 | Town join | Species names ("Punks", "Phunks", "Ape Punks") read like collectible jargon | A friendlier short list (Cat, Dog, Frog, ...), with the rest under "More looks" |
| 32 | P2 | Pixel Pop | The clock shows 60 until the first pop | "GO!" flash and start on the first pop |
| 33 | P2 | Dash | The field uses 29% of the phone height | Taller field, plus a big A button |
| 34 | P2 | Echo | Three status lines | One |
| 35 | P2 | Bug Safari | Field 358x252 with empty space below | Fill the height |
| 36 | P2 | Jam | D F J K letters drawn in the lanes on touch | Shapes only (they already have shapes) |
| 37 | P2 | Global | "Sound on" is a separate per-page button, top-right, not remembered as one setting | One Sound toggle in Menu, remembered everywhere |
| 38 | P2 | Global | The Menu compass is the only shared element, and every page puts its own title and stats bar around it | A shared top bar: compass, title, up to 3 numbers |
| 39 | P2 | Hub | "0 of 148 found" on day one feels like homework | Show the Album only after the first find |
| 40 | P2 | Lantern | "No timers, nothing to buy, nothing to lose" and similar reassurance lines on several pages add words | Say it once in Home settings |
| 41 | P2 | Global | The disabled style is only slightly greyer (Angler ponds, Jam "Hard") | Dashed or muted disabled style |
| 42 | P2 | Global | Emoji icons mixed with pixel sprites (Hub chips, Menu) | Pixel icons for the pillars and games |
| 43 | P2 | Isles | The hero is small next to the creatures (R3 #14) | Scale 1.5x |
| 44 | P2 | Realm | Tutorial card over panels (R3 #9) | Hide under panels |
| 45 | P1 | Town | The phone HUD shows 13 resource counters, all zero, plus an emote bar, a "Hold to talk" hint and 6 action buttons (Emotes, Tilt, B, P, A, C) at once (shot 16) | Show up to 3 counters, the rest in the Bag. Move Emotes, Tilt and P into Menu. Keep the stick, A and B |
| 46 | P1 | Realm | "Swarm in 0:14" countdown on the "Safe-ish" shore in minute one (shot 17): a timer that adds pressure before the player knows the controls | Hide event timers until Lv 3. Phrase it as "A swarm is coming!" when it starts, with no countdown |
| 47 | P2 | Realm | The first-fight HUD has a status line ("Shore · Safe-ish · Swarm in · Highlan...") clipped at 390 px, a "Daily" button, 4 ability slots (3 locked) and a minimap | Show only HP, XP and the Bag in beat 2. Reveal the rest as it unlocks |

## Feel notes by moment (the "what do I do now?" test)

| Moment | What the player is told | Verdict |
|---|---|---|
| 0 s, root | "Your name. Pick your villager." (21 tabs) | Wrong first ask. A game asks you to press Play |
| 10 s, Hub | "Tap a place to walk there, or a game above to play." | Two choices and 12 games. Choice paralysis |
| In a game | Usually one clear button ("Got it, play", "Got it, run"), after a text card | Good once found. The text card is too long |
| After a run | Varies by game (Try again / nothing / back to the title) | Inconsistent. No "Again" in one tap everywhere |
| Leaving | The compass Menu is on every page | **Good. This is the one consistent thing.** Build on it |

## Screenshot index (`game/design/playtest4/`)

01 root (Town join) · 02 Hub first screen · 03 Jam first screen (text wall) · 04 Jam play · 05 Angler first screen · 06 Angler spooked modal · 07 Bug Safari locked grid · 08 Bug Safari play · 09 Stalk Sunday · 10 Deepdelve phone · 11 Stack: stray tap leads to Town join · 12 Pixel Pop play · 13 Echo Garden play · 14 Lantern Dash play · 15 The Lantern camp text wall · 20 desk Hub (27 buttons, map 253x240) · 16 Town phone HUD (13 counters, 6 action buttons) · 17 Realm first fight (Swarm countdown, clipped status line) · 18 Isles feeding, "still chewing" · 19 Isles craft panel.
