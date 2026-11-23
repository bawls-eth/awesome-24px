# Bug bash: REALM + DUNGEONS lane (branch bb-realm)

Played with Playwright at 390x844 touch, 844x390 landscape touch and 1280x720 desktop: first launch (hero picker) to first fight,
tutorial coach, world HUD, dungeons, death / fall screen, settings, hostile saves. Test: `game/tests/realm-bugbash.test.js`.

## Fixed on this branch
| # | Bug / gap | Severity | Fix |
|---|---|---|---|
| 1 | Phone (390 px): the HP numbers "100 / 100" wrapped onto two lines inside the narrow HP bar (spilled out of the bar). | Medium | `realm-8bit.css`: nowrap + tighter 10 px text under 560 px. |
| 2 | No "what do I do next" line in the world HUD (owner: "flow and feel like a game"). | Medium | `realm-world.js` `#rw-goal`: one line from existing sources (unclaimed quest reward, first open daily quest with progress, next zone by recLv, boss altar). Hidden while the first-run coach talks / a phone panel covers the corner. `?goal=0` = off. |
| 3 | The shared Settings panel (MMSettings: sound, music, aim assist) was not reachable from the Realm. | Medium | `mad-maze.js`: mounted once, linked from the Realm sheet ("Sound, music, aim assist..."), every `mm-settings-change` applies live through the arena setters; Esc closes it first; keys typed in it never drive the hero. `?mmsettings=0` = off. |
| 4 | Chip audio cues missing (CHIP-AUDIO.md "to wire next"): no death cue, no panel open / close, no music. | Low | `realm.js` plays `death`, `ui_open` / `ui_close`; `mm-chip.js` is now on the page (voices ready before the first gesture); `realm-audio.js` plays the `realm` loop (zones 0-2) or `dungeon` (deep zones, dungeons, bosses) when Music is on (`mm-music`, else the Town Music toggle). Off by default; never with the drone at the same time. |
| 5 | Universal controls (CONTROLS.md): gamepad Back / Select (Restart) did nothing in the Realm. | Low | `realm.js`: Back = Try again on the fall screen / restart confirm in the open menu only (never mid-fight, same rule as R); Start is ignored while the fall screen is up. |
| 6 | Enemy hold-fire-offscreen rule could not be switched off (owner may want it removed). | Request | Kept on by default; `?holdfire=0` or `arena.setHoldFire(false)` turns it off. |
| 7 | Terrain looked flat. | Cosmetic | `realm-world.js`: seeded per-tile shade patches + tiny square pebbles baked once into the chunk canvas (no per-frame work, squares only so round shapes stay bullets). `?tiledetail=0` = flat. |

## Open (not fixed)
(see below; filled during the session)

## Elsewhere (other lanes)
(none yet)
