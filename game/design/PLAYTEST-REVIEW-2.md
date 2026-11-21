# Playtest review 2: research bot re-run, 2026-11-21

## What was run
`game/tools/playtest-bot/run.js` on branch `playtest-bot-2` (tip of `claude/animal-crossing-game-7z3roh` at 684e2eb, served
locally). Every Firebase request and WebSocket was blocked (`context.route` + `context.routeWebSocket`). It ran desktop 1280x720
(keyboard + mouse) and phone 390x844 (touch, synthetic twin sticks), seven segments each, about 22 minutes in total:

- `hero-create` (new): a fresh profile, the class cards, create a Thicket Ranger, reopen the picker (portraits) and the stats tab.
- `town-realm`: the join form, then **Play offline**, which now works. It walked the offline town, entered the Realm Gate and
  played the embedded Realm.
- `world` (seed 4242): shore toward the centre, 15-18 s per zone, menus, shrine, camp, NPC, portal to a dungeon and back.
- `nexus-quests` (new): about 20 s of real play near the spawn, three enemies finished next to the hero for pickups, status
  icons, the **Nexus**, the quest board with a **claim** (+130 shards), the **unlock toast** (hook level 1 -> 9) and the
  **ability sheet** (right-click / long-press).
- `dungeons`: all four biomes, then a walk through the door graph to each **biome boss** (Queen Burrowmole, Forest Warden, Mire
  Queen, Lich King) and a 9-12 s fight.
- `lantern` and `games` (Deepdelve, Angler, Jam, Stalk, hub).

Results: 431 screenshots, 14 videos, **0 console errors, 0 page errors, 0 failed requests**. **17 DB requests and 2 DB
WebSockets were blocked, and 0 sockets were opened** (`socketsOpened: []`). Both sockets came from the town join attempt. There were 9 deaths (desktop 4, phone 5). One bot step failed (desktop dungeon return, see #4). The desktop
`nexus-quests` segment was re-run once after a bot fix (it had started from a saved Highlands position). Shots are in `game/design/playtest2/`.

## Compared with review 1

| # (review 1) | Status | Evidence |
|---|---|---|
| 1 DB-unsafe offline tests | **Fixed in the bot** (2 sockets blocked, 0 opened). Not re-audited in `game/tests` | summary.json |
| 2 Join stuck with no message | **Fixed**: after 6 s, "Can't reach the town server..." and **Play offline**. The offline town and Realm Gate work | 12 |
| 3 Shore deaths | **Partly**: calmer sand spawn by the Nexus, but phone still died on the shore at 17 s | 01 |
| 4 Off-screen snipers | **Remains** (see #2) | 01 |
| 5 Slow TTK | **Remains** (see #3) | 08 |
| 6 Readability | **Much better**: class-art bolts, art enemy bullets, hero findable. New: skull props (#6) | 03 |
| 7 Phone dungeon strip | **Fixed**: narrow rooms fill the phone's width | 11 |
| 8 Minimap over backpack | **Fixed on phone**; desktop minimap still draws over it | `desk-world-038` |
| 9 Phone right column | **Remains** | 09, 10 |
| 10 Prompt stacking | **Partly**: no overlap, but on phone the portal button sits on the ability grid | 10 |
| 11 Exit truncated | **Fixed** ("Exit" / "Leave") | 08 |
| 12 Room x/8 vs x/9 | **Fixed** (2/8 in both places) | summary shot |
| 13 "cleared!" with the boss alive | **Fixed** ("Left the Meadow", "The Mire Queen: alive") | summary shot |
| 14 Empty start rooms | **Fixed** (gold exit arrow; on desktop under the ability bar) | `desk-world-054` |
| 15/16 Wave copy, unstyled shop button | **Fixed**: the shop button is styled. No "wave" text was seen in world mode | `desk-world-038/040` |
| 19 Jam calibration wall | **Fixed** (song list shows at once) | `phone-games-019` |

## Findings (this run)

| # | Sev | Finding | Screenshot |
|---|-----|---------|-----------|
| 1 | major | **Zones too close.** Walking toward the centre reaches the Highlands and a Frost Dragon in about 16 s, with no soft border, warning or gate. Phone deaths: shore 17 s, Midlands 14 s, Highlands 11 s, Godlands 6 s | 02 |
| 2 | major | **Bullet field.** 60-100 enemy bullets cover the whole view on the shore/Midlands while 6-8 enemies are visible: off-screen or long-lived fire. Damage still feels random | 01 |
| 3 | major | **Time-to-kill.** 20 s of play near the spawn: 0 kills (desktop), 3 (phone). A Lv 9 ranger took under 10% of a boss bar in 12 s. Pickups, quests and XP all wait on kills | 08 |
| 4 | major | **Dungeon return lands in a raid.** "Back to the world" put the hero on the Highlands portal inside a Mire Queen raid (about 200 bullets), with no grace period. Desktop died within 12 s | 09 |
| 5 | major | **The Nexus is a menu, not a place**: buttons under a preview canvas, not walkable, no other players. On desktop the preview is squashed into a strip with unreadable labels | 04 |
| 6 | major | **Godlands clutter.** 150+ skull props are the size and brightness of bullets, so threats blend into scenery | 03 |
| 7 | minor | **Pickups** dropped 90-170 px away were not collected in 1.8 s (`got` stayed 0): the magnet seems smaller than the drop scatter | `desk-nexus-quests-r-008` |
| 8 | minor | **Quest board.** A disabled "Claim" (3/22) looks the same as an enabled one. Only the aria label differs | 04 |
| 9 | minor | **Unlock toast** overlaps the "Level 9!" banner. Crossing two nodes shows the older one (Keen Eye) first | 05 |
| 10 | minor | **Keyboard hints on phone**: "Visit the Nexus (Enter)", "Nova (E)" in the ability sheet, and "WASD/arrows..." on the phone join card | `phone-nexus-quests-019` |
| 11 | minor | **Status icons** (slowed, bleed x2, swift) are about 16 px under the XP bar and hard to read at a glance | 05 |
| 12 | minor | **Join card on desktop**: the "Play offline" button is cut off at the bottom of a 720 px window | 12 |
| 13 | minor | **Town**: "Hold to talk / pick a bestie" overlaps the inventory bar (desktop). The player name label covers the "Realm Gate" sign | `desk-town-realm-012` |
| 14 | minor | **Phone HUD**: the "The Realm island #4242" banner is clipped under the zone box | 09 |
| 15 | minor | **Backpack** shows "weapon: empty" while the hero fires a class weapon | `desk-world-038` |
| 16 | minor | Every dungeon boss fires the same purple orbs, so the biome identity stops at the sprite | 08, 11 |
| 17 | good | **Hero create** is a real character select: 14 portrait cards with clear lock reasons | 07 |
| 18 | good | **Ability icons and sheet** (cooldown, unlock level, passives, next node) are clear on both viewports | 06 |
| 19 | good | **Biome bosses** have strong art, named banners and bars | 08, 11 |
| 20 | good | **Offline path**: town, Realm Gate, embedded Realm and back, with no DB traffic | 12 |

*Bot artefacts (not bugs):* god mode makes the hero blink out of some frames; "99999" numbers are hook kills.

## Ten fix / feature slices (priority order)

1. **Zone gradient and soft borders.** Make the shore and Midlands bands much wider, and push the first Midlands tiles at least
   40 tiles from the spawn. At each border show a toast ("Midlands: Dangerous, recommended Lv 5") and slow the hero for 1 s on
   the first crossing below the recommended level (`game/shared/mm-zones.js`, `mm-overworld.js`, `realm-world.js` zone tick).
2. **Enemy fire budget.** Let enemies fire only while inside the view plus 64 px. Cap bullet lifetime so a bullet travels at most
   about 0.6 of the view width. Cap live enemy bullets per zone (shore 40, Midlands 80) (`game/realm.js` enemy fire and bullet
   tick, `realm-world.js` spawner).
3. **Early TTK and loot loop.** Starter damage about 3, or shore HP 4-6, so a shore mob dies in 2-4 hits. Raise the pickup magnet
   radius to the drop scatter radius (about 120 px) (`game/shared/mm-classes.js`, `mm-difficulty.js`, `mm-pickups.js`,
   `realm-world.js` pickups).
4. **Safe return from portals.** Return to the portal with 3 s of spawn shield. If a raid or event is live within the view, move
   the hero to the nearest quiet tile (`realm-world.js` RETURN_RE / `returnTo`, event state).
5. **Walkable Nexus.** Make the Nexus a small walkable arena scene: the plaza canvas becomes the map, and NPCs and portals become
   interactables. Show other players later through the existing presence path when online. As a first step, fix the desktop
   preview aspect ratio (`game/shared/mm-nexus.js`, `realm-world.js` nexus build/CSS).
6. **Godlands readability.** Dim skull and bone props (alpha 0.5, desaturated) or swap them for ground-flat decals so bullets
   are the only bright round shapes. Optionally give enemy bullets a dark outline (`realm-world.js` prop art, `mm-fx-draw.js`).
7. **Phone HUD pass.** Collapse the zone, coords and raid lines into one line. Move the portal, site and Nexus prompts above the
   ability grid (bottom-centre, clear of both sticks). Keep banners clear of the zone box. Drop keyboard hints when
   `pointer: coarse` (`game/games/mad-maze/mad-maze.css` phone block, `realm-ui.css`, prompt strings in `realm-world.js`).
8. **Quest and toast polish.** Make the disabled Claim look disabled (outline only, progress bar in the row). Position the unlock
   toast below the level banner. Show the highest new node first and merge a queue of several into "2 unlocks: ..."
   (`realm-world.js` nxBoardRender, `mad-maze.js` toast, `realm-ui.css`).
9. **Boss identity.** Give each biome boss a bullet palette or shape from its art (bramble thorns, mire bubbles, crypt bone
   shards) and one telegraphed signature attack (`game/shared/mm-patterns*.js`, `mm-biomes.js` boss table, `mm-fx-draw.js`).
10. **Join and town polish.** Keep "Play offline" visible at 720 px (scroll the card or shorten it). Move the push-to-talk pill
    off the inventory bar, show the equipped class weapon in the backpack, and enlarge status icons to 24 px with a stack count
    (`game/index.html` / `style.css`, `main.js`, `realm.js` backpack + status HUD).

## Verdict: does it feel like Realm of the Mad God now?

**Closer, and for the first time it looks the part.** Class bolts, art bullets, portraits, ability icons, biome bosses, a
Nexus, quests, shrines, pickups, status icons and unlock toasts are all present and clean. On screenshots alone, a RotMG
player would recognise the genre.

It does not yet *play* like RotMG. In RotMG you clear the beach in seconds, loot drops constantly and you choose when to go
inland. Here a cautious new player gets 0-3 kills per 20 s, under bullets from things it cannot see, and a walk toward the
centre ends at a dragon in 16 s.

The other missing piece is **the social Nexus**, which is the heart of RotMG: a walkable hub full of other players, their
classes and their loot. Today it is a button menu. Fix the gradient, the fire budget and early TTK (slices 1-3) and the game
should start to feel like RotMG. The walkable Nexus (slice 5) would give it the social side.
