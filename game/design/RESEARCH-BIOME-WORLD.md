# Research: biome archipelago + cozy taming ("Pixel Ark")

Research brief for `BIOME-WORLD-CONCEPT.md` (written 2026-11-21). The sources are wikis, press and design essays found through generic web searches. Exact formulas in commercial games change between versions, so treat the numbers as approximate. We borrow mechanics and structure only, never names, art, music or layouts (PROJECT-BRIEF section 5.6).

## 1. Survival-tame games (ARK, PixARK, Palworld)

**Findings**
- **There are two main taming methods.** Docile creatures are tamed **passively**: you hand-feed them while they are awake, and some only accept one specific food. Aggressive and large creatures are tamed by **knockout**: you build up torpor with non-lethal hits until they fall unconscious, then feed their preferred food while you keep them asleep and guard them. The wiki also lists exotic techniques for special creatures. [ark.wiki.gg Taming Techniques](https://ark.wiki.gg/wiki/Taming_Techniques), [Dododex beginner guide](https://help.dododex.com/en/article/how-to-tame-dinosaurs-in-ark-survival-evolved-beginners-guide), [TheGamer tips](https://www.thegamer.com/ark-survival-evolved-tame-creatures-tips/), [mein-mmo unusual methods](https://mein-mmo.de/en/ark-5-of-the-most-extraordinary-ways-to-tame-a-creature,812882)
- **Taming effectiveness** (how well the tame went: better food, less damage taken) sets the bonus levels a creature gets when the tame completes. Narcotics keep it asleep. [XGamingServer guide](https://xgamingserver.com/blog/?p=21139), [Nitrado guide](https://server.nitrado.net/en-US/guides/ark-how-to-tame-dinosaurs)
- **Imprinting.** A bred baby asks for care (a cuddle, a walk or a particular food) at intervals. The default interval is long (8 h), and each completed request adds a share of the imprint. Completed imprint is never lost, even if you miss a later request. Full imprint gives large multiplicative bonuses when the imprinter rides the creature. Babies mature in stages (baby 0-10%, juvenile 10-50%, adolescent 50-100%). [ark.wiki.gg Imprinting](https://ark.wiki.gg/wiki/Imprinting), [Dot Esports](https://dotesports.com/ark/news/ark-survival-ascended-imprinting-explained), [BisectHosting breeding](https://www.bisecthosting.com/blog/ark-survival-evolved-breeding-guide-mating-eggs-food-babies)
- **Breeding.** Each stat is inherited from one parent, roughly 55% from the higher one. Rare mutations add levels or change colours. [Steam discussion](https://steamcommunity.com/app/346110/discussions/0/2574320091917373896)
- **PixARK** is the voxel spin-off. It keeps knockout and passive taming but adds level requirements for some passive tames and gives XP for taming. Reviewers praised the companion that wanders with you, and also called the game derivative and grindy. [Prima Games](https://primagames.com/tips/pixark-how-to-tame-creatures-and-dinosaurs), [GameSkinny review](https://www.gameskinny.com/jcbvr/pixark-review-what-if-minecraft-and-ark-had-a-baby), [Cogconnected review](https://cogconnected.com/review/pixark-review-just-another-pixelated-survival-game/)
- **Palworld's hook** is the connected loop: capture, assign work, raise output, expand, then take harder fights. Creatures act as labour, transport and combat help, and base automation works without min-maxing. Critics note two problems: random capture feels bad, and without threats to the base, base-building turns into a cosmetic grind. One essay points out that cute workers make the labour framing uncomfortable. [PC Gamer](https://www.pcgamer.com/games/survival-crafting/for-years-survival-games-have-convinced-us-that-chopping-down-400-trees-is-somehow-part-of-the-fantasy-palworld-proves-them-wrong/), [GamesRadar](https://gamesradar.com/we-need-to-stop-calling-palworld-pokemon-with-guns-because-its-actually-a-bizarre-mashup-of-survival-and-a-very-particular-kind-of-management-game), [Game Wisdom](https://game-wisdom.com/?p=30154), [finalboss.io essay](https://finalboss.io/palworlds-creature-labor-is-the-point-and-it-should-feel-wrong), [PC Gamer: base buddies](https://www.pcgamer.com/i-hope-palworld-inspires-a-vibrant-new-survival-crafting-subgenre-little-base-buddies-management)

**Takeaways**
1. Use **three readable methods**: Feed (passive), Calm (a skill minigame) and Knockout-then-Feed. The method is printed on the creature card, so nobody guesses.
2. **Bond quality is earned through skill, not luck.** There is never a random fail roll. Quality comes from the right food and from not hurting the creature.
3. **Imprint requests never expire.** We keep ARK's "completed progress is permanent" rule and drop the penalty for missing a request.
4. **Roles make tames useful beyond combat:** fighter, mount, gatherer and builder. Gatherer work is framed as "tending" and "foraging together" with happy idle animations, never as labour quotas.
5. **Avoid what reviewers called grind.** PixARK's 3-day tame expiry and huge torpor timers are out.

## 2. Cozy life-sim loops (Animal Crossing, Stardew, cozy-design essays)

**Findings**
- Animal Crossing's loop is short daily check-ins (villagers, shops, resources) plus self-directed island design with no fixed objective. It feels low pressure, you can drop in and out, and visiting friends keeps it going for years. The criticism is that the endless small daily chores can become a "pleasant grind". [TNW devs on Animal Crossing](https://thenextweb.com/news/we-got-5-game-devs-to-explain-why-animal-crossing-is-so-damn-good), [Time review](https://time.com/5804599/animal-crossing-new-horizons-review), [UX Collective](https://uxdesign.cc/the-calm-and-charm-of-cosy-games-in-a-chaotic-world-7f29dbd8f4d9), [Engadget](https://www.engadget.com/animal-cross-new-horizons-two-month-review-143541385-143541919.html), [PC Gamer on daily-grind fatigue](https://pcgamer.com/ooblets-counters-the-daily-grind-fatigue-found-in-stardew-valley-and-animal-crossing), [Medium: social sandboxes](https://medium.com/game-design-fundamentals/social-sandboxes-7de89389a7fe)
- Stardew starts as a closed world and later opens new areas (a desert, then a tropical island). Each new area feels connected because earlier activities feed into later goals. The map uses theme-park pacing that invites you to every attraction without forcing any of them, and money lets you skip the paths you dislike. [Cannibal Halfling](https://cannibalhalflinggaming.com/2024/04/11/stardew-valleys-closed-world/), [PCGamesN map design](https://www.pcgamesn.com/stardew-valley/stardew-valley-map-design), [Medium: Super Jump](https://medium.com/super-jump/what-makes-a-game-about-mundane-chores-hopelessly-addictive-ab136266ebcf)
- Project Horseshoe's cozy definition is safety, abundance and softness. Designers agree that manufactured urgency (wilting crops, expiring events) is the anti-pattern, and some suggest soft time-of-day "rhythms" in place of hard clocks. [Kitfox: Designing for Coziness](https://medium.com/kitfox-games/designing-for-coziness-d33d2519a59e), [Solo Dev Stack](https://solodevstack.com/blog/idle-game-that-respects-your-time), [80.lv](https://80.lv/articles/using-coziness-in-game-design), [cozy time systems](https://gq-game-mods.blogspot.com/2026/02/beyond-the-clock-cozy-time-systems.html), [Vice: Cozy Grove](https://www.vice.com/en/article/bvx9vw/cozy-grove-is-ok-telling-players-to-log-off-its-delightful)

**Takeaways**
1. **The home island is the canvas.** Decorating it is the self-directed goal, and the stable, garden and dock grow visibly as you play.
2. **Unlock new islands Stardew-style.** Each new island uses what earlier ones gave you: jungle amber, reef pearls and tundra crystals build the rocket.
3. **Give daily bonuses, never daily penalties.** Examples are the first tame of the day getting double trust, or a daily Wild Bloom spot. Missing a day costs nothing, which matches our ethics rule (PROJECT-BRIEF section 4).
4. **Provide natural stopping points.** Coming home to the dock is the "save and rest" beat, and a tame that finishes while you were away greets you.

## 3. Biome identity in 2D games (Terraria, Starbound, Core Keeper)

**Findings**
- Terraria gives each biome a bundle of signals: its own blocks, walls, background, enemies, critters, music and loot. Hazards come from the spatial layout (thorny catacombs, pools), not only from enemies, and progression locks resources behind depth and boss milestones. [Terraria wiki: Biomes](https://terraria.wiki.gg/wiki/Biomes), [Mini biome](https://terraria.wiki.gg/wiki/Mini_biome), [TrueAchievements](https://www.trueachievements.com/game/Terraria/walkthrough/3)
- Starbound groups planets into threat tiers. Protection gear (air, heat, cold) opens the harsher biomes, and the developers described this as metroidvania-like progression. Fan overhauls make hazards survivable without gear, just unpleasant, which is a softer fit for us. [Starbounder: Planets](https://starbounder.org/Planets), [Starbounder: Tier](https://starbounder.org/Tier), [PC Gamer](https://pcgamer.com/starbound-creator-outlines-future-player-progression), [Starburst mod](https://catalogue.smods.ru/archives/201250)
- Core Keeper has distinct underground biomes with their own materials and bosses. It added pets that you adopt and care for, and later saddled mounts plus a peaceful moss sub-biome. [Core Keeper Fandom: Biomes](https://core-keeper.fandom.com/wiki/Biomes), [Game Developer: pets roadmap](https://www.gamedeveloper.com/press-release/core-keeper-unveils-new-content-roadmap-with-special-anniversary-update-pets-more), [Kotaku: Riders of the Underground](https://kotaku.com/games/core-keeper-riders-of-the-underground), [PC Gamer review](https://pcgamer.com/games/survival-crafting/core-keeper-review)
- For limited-palette pixel art, build hue-shifted ramps (choose the ramp length and hue shift first, then tune by eye) and avoid uniform saturation steps. A common way to give biomes identity is one hue family per biome with shared ramps for common materials. [gamedev.net Color Palettes](https://gamedev.net/tutorials/visual-arts/color-palettes-r4964), [Slynyrd Pixelblog 1](https://www.slynyrd.com/blog/2018/1/10/pixelblog-1-color-palettes), [OpenGameArt ramps](https://opengameart.org/node/20643), [Lospec hue-shift palettes](https://lospec.com/palette-list/tag/hue%20shift)

**Takeaways**
1. **Every biome ships as a bundle:** terrain, props, palette, music mode, weather, critters, fish, bugs, resources, one hazard and one boss. Leave any of these out and the biome reads as a recolour.
2. **Each biome has one gear-gated hazard meter:** Warmth on Ice, Oxygen on Mars and Breath underwater on the Reef. When the meter is empty you slow down and take capped chip damage. It never kills on its own.
3. **Give each biome its own hue family:** jungle teal-green, tundra blue-violet, reef turquoise-coral, Mars rust-ochre, station steel-cyan, with shared ramps for skin, wood and metal.

## 4. Mobile survival-tame UX

**Findings:** Keep frequent actions in the lower-middle thumb zone. Swap precision for timing. Forgive mis-inputs with undo and confirmation for critical actions. Use tap-to-place for building. Badly built virtual sticks are the most common complaint. [Game Developer: touchscreen controls](https://www.gamedeveloper.com/game-platforms/designing-better-controls-for-the-touchscreen-experience), [GDevelop: mobile UX mistakes](https://gdevelop.io/blog/mobile-ux-mistakes), [gamedev.net: touch combat](https://gamedev.net/blogs/entry/607-designing-touch-combat-without-overloading-the-pla/), [Pocket Gamer: Rust Mobile](https://www.pocketgamer.com/rust-mobile/hands-on/)

**Takeaways**
1. **One context button (A)** that changes by target: Feed, Pet, Ride, Gather or Talk. The right stick stays aim/auto-fire as in the Realm, and **Tranq** is a toggle on button B, so no extra fingers are needed.
2. **The Calm minigame is a single timed tap** on a shrinking ring, reusing the Jam judge (`MMJam.WINDOWS`: perfect 40 ms, great 80 ms, good 130 ms).
3. **Crafting is one tap per recipe**, showing what is missing and where to find it. There is no grid crafting.
4. **Building on the home island is tap-to-place on a grid** with a 10 s undo, copying the Town's `BUILD_UNDO_WINDOW_MS`.

## 5. Blending cozy and survival without dark patterns

These rules come from sections 1 to 4 and from our ethics rules:
- **Nothing decays.** No starvation, no tame leaving, no crop wilting (this matches `MMPets`: "pets never die, get hurt or sad").
- **Hunger is a positive buff** ("Well-fed"), never a debuff.
- **Fainting is not death.** You wake at the last campfire or dock with everything. An optional "Brave" toggle drops only resources you have not banked, and you can pick them up again.
- **There is no random fail roll on tames, no paid anything, no expiring tames and no FOMO events.** Weekly world events repeat on a fixed rotation.
- **Caps stop grind loops:** offline foraging is capped (section 4 of the concept), and duplicate tames turn into Bond Seeds instead of filling the stable.
- **Danger is opt-in by place:** home is safe, biome rims are gentle, cores and bosses are hard. This is the same graded ring idea as `MMOverworld` zones and `MMDifficulty`.

## 6. What already exists and can be reused

| Need | Existing system / asset | How it is reused |
|---|---|---|
| Island generator | `shared/mm-overworld.js` `generate(seed,{size})`: zones 0-3 by warped distance, lakes, rivers, roads, sites, `verify()` (reachability, determinism), `chunk()` | Call it unchanged and **remap terrain ids through a biome pack** (new module). The zones become the island's danger rings. Existing realm hashes must stay byte-identical. |
| Spawning / interest culling | `shared/mm-zones.js` `createSpawner` (activate radius 1500 px, cap 60, respawn per zone), `rollDrop` | Wild creature groups use the same `spawnGroups` shape, with the cap set to 40 on phones |
| Chunk renderer | `games/mad-maze/realm-world.js`: 16x16-tile chunks into cached 512 px canvases, LRU of 24, b10t transition masks | The pattern is copied into a new `isles-world.js` (realm-world.js is a serial resource and is not edited) |
| Combat feel | `mm-projectile.js` (pure bolt kernels), `mm-classes.js` (`arenaProfile`), `mm-aim.js`, `mm-pad.js` (twin stick), `MMSfx`, `mm-fx-draw.js`, b16 bolts, b18 effects | Isles combat is built from these pure modules, so `realm.js` is not touched |
| Pets / following | `shared/mm-pets.js` (`follow`, `FOLLOW_DIST` 1.5 tiles, no decay rule), `egg_1..6` and `food_1..12` (b22) | Companion follow kernel and egg/food icons |
| Co-op | `mm-party.js`, `mm-world-party.js` (pos/hit/bag relay, 8 Hz, 40-tile range), `mm-party-bc.js`, `world-team.js` pattern | A relay-only isles party with no database |
| Timing minigame | `mm-jam.js` `judge()` windows | Calm-taming ring |
| Fishing / bugs | `mm-angler.js`, `mm-bugs.js`, Bug Safari, Angler pages | Biome fish and bug pools (new data), plus journal links |
| Building | Town `BLOCK_TYPES` (wood, stone, lamp, hedge, path) and build mode in `main.js` | **Copy the definitions, not the network:** Town blocks write to Firebase `blocks`, so home-island building is localStorage-only in a new pure module |
| Hub / town links | `hub/` map nodes, `MMHubProfile`, Town dock NPC and `REALM_GATE_POS` | A new "Archipelago" hub node and a Harbor sign by the Town dock (link only, no network change) |
| Art already in repo | b10t shore/midlands terrain, b11 snow/highland/lava, b12 `prop_tree_palm, cactus, coral, ice_spike, crystal_*, driftwood, shell, reeds, lily_pad`, b13 tent/campfire/fence/crate/well, b14 portals, b19 UI frames/joystick/buttons, b22 eggs/foods/gems, b23 bosses (`frost_dragon, hydra, sand_titan, clockwork_golem, treant_elder`), b24 (`crab_giant, water_elemental, wind_sprite, fire_elemental, golem_lava`) | Meadow home is about 85% existing art. Four of the six biome bosses are b23 reskins (palette swaps in code). |
| Art format | `ART-HANDOFF.md` / `CODEX-WORK-QUEUE.md`: 256 px cells (64 logical), bosses 384 (96 logical), idle 4 / move 6 / attack 5 / death 5 x down/up/right, 32x32 terrain with `_a..d` plus 4-bit `edge_00..15` | The same format extends to 512 px cells (128 logical) for colossal creatures |

**Gaps:** there is no creature AI beyond the arena behaviours (spiral/aimed/ring), no taming model, no mount code, no home-island building that avoids Firebase, and no biome terrain ids beyond the 18 realm ids.
