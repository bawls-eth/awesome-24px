# Pixeltown: full project brief (owner direction, consolidated)

This is the single source of truth for what the owner wants, collected from the whole conversation.
Read it fully before planning. `REALM-DESIGN.md`, `WORLD-MAP-DESIGN.md` and `STATUS.md` hold the detail;
`ART-HANDOFF.md` holds the art plan. Where documents conflict, THIS file wins.

## 1. The vision in one paragraph

Pixeltown is a family of pixel-art browser games joined by a Mario-World-style overworld map, with a cozy
multiplayer town, a real Realm-of-the-Mad-God-style bullet-hell dungeon crawler, a Minecraft-style voxel cave,
a fishing game, festival minigames, and more. Every game is a FULL game, not a minigame. It must look good,
feel responsive and fun in the first ten seconds, give clear goals and rewards, and be playable on phone and
desktop. It is built by a team of AI agents running every hour; the owner reviews and merges.

## 2. World structure

- **Pixeltown (hub).** The overworld map is the entry page: a fast, light canvas map (no Phaser, no Firebase,
  no Three.js on the hub page) with a character that walks along paths between nodes, themed worlds,
  unlockable gates, secret exits, keys, stars and medals. Pixeltown KEEPS its name.
- **Hearthvale.** The existing cozy multiplayer town (everything in `game/main.js`) is renamed Hearthvale and
  sits one road off the hub as an adjacent town you visit. Its save key `pixeltown-save-v1` and URL keep working.
- **Mad Maze** (Realm-style dungeon crawler, working title; alternatives Lanternfall, Mazewright, Bramble & Bullet).
- **Deepdelve** (Minecraft-style voxel cave and base building), **Lakeside Angler** (fishing), **Festival Fields**
  (Bug Safari, Campfire Jam rhythm, Stalk Market), and later co-op worlds and a secret world.
- Games report results back to a shared hub profile (additive localStorage keys), so the map unlocks for real.

## 3. What each game must become

### Hearthvale (cozy town, already built, keep and polish)
Workbench and crafting with seasonal specials, weeds and tidiness, mailbox letters, villager friendship and
birthdays, Bug-Off tournament, home plot with cozy score and visitors, Today board of daily chores, Angler's
Journal and aquarium, museum with wings, seasonal tint, phone-friendly collapsible panel, Realm gate, opt-in
two-player co-op, 1v1 duel and 2v2 (all invite-based, host-authoritative, rate-limited). The Polyroll dice
game STAYS (it only gambles in-game stars, a free currency); no real money, ads or purchases anywhere.

### Mad Maze (the flagship; follow `REALM-DESIGN.md`)
Top-down bullet-hell with real feel: WASD plus mouse aim, hold to fire, ability key, dodge roll with brief
invulnerability, twin-stick on phone, gamepad, aim assist, hit-dot, reduce-motion. Seeded procedural dungeons
(Warren rooms-and-corridors, Labyrinth, more), readable telegraphed enemy and boss patterns (aimed, ring, fan,
spiral, delayed volley, sweep, wall-with-gap, homing), 8+ classes built from our species with distinct weapons
and abilities, loot tiers and bags, stat potions, XP/levels/fame, SOFT permadeath (lose the run's loot, keep
fame, unlocks and a legacy stash) plus a no-loss mode, the safe Lantern hub (heroes, stash, hall), the open
Wilds with roaming groups and world events and bounties, pets, daily maze, ghosts and leaderboards, co-op.
The owner's separate "Arcane Frontier" build prompt is the SAME game: its spec (class kit names Vanguard,
Ranger, Arcanist plus seven prototypes, acceptance checklist, UI layout, inventory 5x4, equipment slots) is
merged into Mad Maze, and its 100-sprite pack in `games/arcane-frontier/` is a placeholder art source.
Do not build two competing games.

### Deepdelve (Minecraft-feel; follow `WORLD-MAP-DESIGN.md` M7)
First person with held items, real physics, timed mining with crack overlay and drops, 9-slot hotbar, seeded
chunked terrain with hills, trees, water, caves, lava, ravines, structures, day/night with torch light,
crafting table and furnace (24 recipes), tool tiers, chests, doors, beds, wheat farming, mobs (zombie,
skeleton, creeper), a boss cave, biomes, minimap, sound, persistent edits (IndexedDB), carry-over from the town cave.

### Lakeside Angler, Festival Fields, others
Angler: 48 fish, gear, bait, weather, bosses, tournament, journal, medals. Festival: Bug Safari (built),
Campfire Jam (rhythm, concert) and Stalk Market (turnip trading) pages on the existing `MMJam`/`MMStalk`
modules. Each is a full game with its own loop, progression and rewards.

## 4. Cross-cutting rules for fun, polish and retention

- **Fun gate for every slice:** feels good in 10 seconds; a clear next goal; a reward moment with feedback
  (sound, particles, screen shake, number tick-up, popups). If missing, add the juice in the same slice.
- **Game feel:** easing and squash/stretch, particles for collect/craft/sell/level-up, hit flash and floating
  damage numbers, pooled sprites (never per-frame Graphics redraws), WebAudio synth sound with a remembered
  mute/volume, day/night grading, weather, a 60-second onboarding that gives a reward in under 30 seconds.
- **Progression:** Town Rank ladder, class levels, tool tiers, collections (museum, journal, recipe book, pet dex,
  bestiary), a visible "next unlock", milestones with celebration, daily login calendar and weekly challenge.
- **Social (safe):** emotes, gifting, shared town goal, trading, friend visits, co-op, leaderboards "for fun".
- **Ethics:** addictive through good loops (goals, mastery, variety, reward, friends), NOT dark patterns: no real
  money, no ads, no pay-to-win, no paid randomness, no fake urgency, no guilt for missed days (gentle
  catch-up), natural stopping points.
- **Accessibility:** reduce-motion, bullet-outline option, aim assist, colour-blind palettes, remappable keys,
  controller support, readable at phone size.
- **Performance:** 40+ fps on phone, pooled bullets and particles, spatial hash collisions, baked textures,
  small hub page.

## 5. Hard guardrails (never break)

1. The Firebase database is LIVE with real players (Ben, Blacky). Tests and agents NEVER send chat and NEVER
   write or delete anything except their own presence/party records: bot names start with `ADMIN`, test
   cleanup checks are SCOPED to the test's own records (never the whole tree), no two test runs against the
   live DB at once, records deleted in a `finally`.
2. Saves are additive only: never change or remove an existing key; new keys only; corrupt data tolerated.
3. Shared world content uses `worldHash`/seeded RNG, never `Math.random`.
4. Never remove existing features. Do not touch `firebase-config.js`. No secrets in the repo.
5. Push only to `claude/animal-crossing-game-7z3roh`; no PRs (the manager merges). Commit trailers:
   `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` and
   `Claude-Session: https://claude.ai/code/session_01XVXtaWmRyZid6dt4jFpfM6`.
6. Original content only: no Realm of the Mad God, Minecraft or other franchise art, names, music or layouts.

## 6. Owner decisions already made (defaults)

Death: soft permadeath plus a no-loss toggle. Town name: Hearthvale. Online: keep the current Firebase
approach, no new auth backend yet; leaderboards best-effort and "for fun". Polyroll stays. Mad Maze is the
Realm-like game; Arcane Frontier assets feed it. Merge policy: the manager merges dev to master daily after
checks (3:03 PM Pacific) and on request. Report times to the owner in California time.

## 7. How the team works

Hourly session up to about 55 minutes, up to four slices per session, one commit per slice, each slice with
3+ Playwright assertions, desktop and phone screenshots looked at, zero console errors, `node --check`, and the
full `game/tests/run-all.js` green. Roles: PLANNER (Opus, read-only, picks slices from the plan and checks
yesterday's work), GRUNT (Sonnet, builds), WATCHER (read-only reviewer, APPROVE/BLOCK on the full diff), QA
PLAYTESTER (drives the feature with Playwright, phone and desktop, may BLOCK), OPUS REVIEWER (mandatory for
`net.js`, Firebase writes, save format or diffs over 200 lines), ART DIRECTOR (see `ART-HANDOFF.md`). Skip a
session if the five-hour limit is not `allowed`. Keep `design/STATUS.md` current after every slice.

## 8. Priorities now

1. Make Mad Maze truly playable end to end (hero used in the run, loot tiers and bags paying the stash, soft
   permadeath, the Wilds page, daily maze, ghosts, co-op), then bring in the new art.
2. Games report to the hub profile so the map unlocks; Campfire Jam and Stalk Market pages (map nodes exist).
3. Real art: integrate the Warrior/Ranger/Mage/Cleric animation library and keep generating the rest
   (see `ART-HANDOFF.md`); replace procedural placeholders by manifest ID without code changes.
4. Deepdelve toward the full Minecraft-feel list; Angler tournament and medals.
5. Game-feel track (juice, sound, polish, onboarding) interleaved every day.
6. Apply and test the draft Firebase rules with the owner before relying on them.
