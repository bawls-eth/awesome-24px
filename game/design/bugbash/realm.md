# Bug bash: REALM + DUNGEONS lane (branch bb-realm)

Played with Playwright at 390x844 touch, 844x390 landscape touch and 1280x720 desktop: first launch (hero picker) to first fight,
tutorial coach, world HUD, dungeons, death / fall screen, settings, hostile saves. Test: `game/tests/realm-bugbash.test.js`.

## Fixed on this branch
| # | Bug / gap | Severity | Fix |
|---|---|---|---|
| 1 | Phone (390 px): the HP numbers "100 / 100" wrapped onto two lines inside the narrow HP bar (spilled out of the bar). | Medium | `realm-8bit.css`: nowrap + tighter letter and word spacing under 560 px (text stays 12 px). |
| 2 | No "what do I do next" line in the world HUD (owner: "flow and feel like a game"). | Medium | `realm-world.js` `#rw-goal`: one line from existing sources (unclaimed quest reward, first open daily quest with progress, next zone by recLv, boss altar). Hidden while the first-run coach talks / a phone panel covers the corner. `?goal=0` = off. |
| 3 | The shared Settings panel (MMSettings: sound, music, aim assist) was not reachable from the Realm. | Medium | `mad-maze.js`: mounted once, linked from the Realm sheet ("Sound, music, aim assist..."), every `mm-settings-change` applies live through the arena setters; Esc closes it first; keys typed in it never drive the hero. `?mmsettings=0` = off. |
| 4 | Chip audio cues missing (CHIP-AUDIO.md "to wire next"): no death cue, no panel open / close, no music. | Low | `realm.js` plays `death`, `ui_open` / `ui_close`; `mm-chip.js` is now on the page (voices ready before the first gesture); `realm-audio.js` plays the `realm` loop (zones 0-2) or `dungeon` (deep zones, dungeons, bosses) when Music is on (`mm-music`, else the Town Music toggle). Off by default; never with the drone at the same time. |
| 5 | Universal controls (CONTROLS.md): gamepad Back / Select (Restart) did nothing in the Realm. | Low | `realm.js`: Back = Try again on the fall screen / restart confirm in the open menu only (never mid-fight, same rule as R); Start is ignored while the fall screen is up. |
| 6 | Enemy hold-fire-offscreen rule could not be switched off (owner may want it removed). | Request | Kept on by default; `?holdfire=0` or `arena.setHoldFire(false)` turns it off. |
| 7 | Terrain looked flat. | Cosmetic | `realm-world.js`: seeded per-tile shade patches + tiny square pebbles baked once into the chunk canvas (no per-frame work, squares only so round shapes stay bullets). `?tiledetail=0` = flat. |
| 8 | Dungeon fall summary said "Loot: no items" right above "Stashed 1 item" (the fall cache was paid but never named). | Low | `dungeon.js`: a "Fall cache: <item>" line under Loot. |
| 9 | Phone backpack: the card was centred, so the Gear / Stats / Relics tabs jumped 100-180 px between tabs (a second tap missed). | Medium | `realm-8bit.css`: the card is anchored at the top. |
| 10 | Stats tab said "Hover or tap an item" where there are no items. | Cosmetic | `realm.js`: "Tap an item on the Gear tab to see its +/-". |
| 11 | 150% text on phones: the HUD row wraps, the XP bar moves down under the fixed zone line (overlap). | Medium | `realm-world.js`: once a second the zone line (and the goal line) sit under the XP bar when they would overlap. |
| 12 | a11y sweep: locked / cooling ability labels 2.9-3.3:1 and the name tag 10 px. | Medium | `realm-8bit.css`: only the icon dims; labels `#c2c3c7` / yellow on navy (>= 7:1), name 12 px. |
| 13 | a11y sweep: no `<main>`, no h1, unlabelled `#realm-canvas`. | Low | `index.html` (overlay `role=main`, screen-reader h1), `realm.js` (canvas `role=img` + label). |
| 14 | a11y sweep: world primary action 12 Tabs away; the dungeon had zero Tab stops (Tab was swallowed as the map key). | High (keyboard) | The play field `#realm-canvas-wrap` is a labelled Tab stop (first in the overlay, focus ring); dungeon Tab toggles the map only while the play field has focus, M toggles it anywhere. |
| 15 | a11y sweep: high-contrast / reduce-motion prefs never reached `<html>` on Realm pages. | Low | `mm-settings.js` is now on the page; its boot `apply()` sets `data-high-contrast` / `data-reduce-motion`. |
| 16 | Co-op (?party=local) on phones: the partner distance chip sat on top of the goal line; its text was 11 px. | Low | `realm-world.js` goal line stops short of the chip; `world-team.js` chip 12 px. |
| 17 | Phone boss fights (Trial of Six, altars): the zone line covered the boss bar's name ("Lich King · phase 1"). | Medium | `realm-world.js`: the zone line moves under the boss bar; the goal line steps aside during a boss fight. |

Also played without finding new bugs: all four dungeon biomes, floor 2-3 deep runs, mutators (Swarm, Mirror), ?difficulty=off, rapid bag / board / Esc taps,
portrait to landscape resize mid-run, hero picker at 390 / 844x390 / 1280, backpack compare, Nexus open, Trial of Six step 1 then the rest choice, reduced motion + low gfx + 150% text.

## Open (not fixed)
| Title | Repro | Expected / actual | Severity | Where |
|---|---|---|---|---|
| Sweep "text-not-scaled" at hudScale 1.5 | a11y-viewport-sweep text-150 on realm-world | The HP / info / XP HUD grows with CSS `zoom` (visually x1.5 in screenshots) but the sweep's PROBE reads computed `font-size`, which zoom does not change, so it reports x1.05. Moving the HUD from zoom to font-size would re-layout every bar (many layout tests); left as is. | Low | mad-maze.css:360 (`zoom: var(--mm-hud-scale)`) |
| Nexus walk view on phones leaves ~40% of the screen empty under the plaza; portal labels clip at the camera edge | open the Nexus at 390x844 | the plaza could use the free height | Cosmetic | realm-world.js NX_VW / NX_VH |
| A big shore creature with dense bullet rings near the Lv 1 spawn on some seeds ("Safe-ish") | fresh world, walk east 3 s (desktop, seed varies) | first fight felt busy for Lv 1 | Low (tuning) | mm-zones / world spawn tables |

## Elsewhere (other lanes)
- Note from intake: the b12r props redraw is NOT wired here (Codex redoes it at 1:1).
