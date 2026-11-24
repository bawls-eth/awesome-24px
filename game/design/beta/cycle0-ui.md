# Cycle 0, U (UI/UX): fixes and prioritised leftovers

Branch `cyc0-ui` (from `r4-integ2`). Checked in Playwright (Firebase blocked, Town through the offline stub), screenshots in `img/cyc0-ui-*.jpg`.

## Fixed this cycle (a11y allow-list 7 -> 0)
| Entry | Fix | Check |
|---|---|---|
| realm-world / realm-dungeon `landmark|no-h1` | `#realm-overlay > h1.rm-sr-only` kept inside the viewport (1 px, clipped, light ink), like the Town's `#town-h1` | sweep PAGES=realm-world,realm-dungeon: red on r4-integ2 code, green after |
| realm-dungeon / realm-world `pref:text-150` | Text size now also scales the Leave label, ability names (capped 16 px) and the Daily chip; the sweep's PROBE measures rendered size (font-size x `currentCSSZoom`), because the HUD bars grow with `zoom: var(--mm-hud-scale)` | dungeon was still red (x1.17) on the old CSS with the new probe; green after |
| town `pref:text-150` | Same probe change: the bag bar and people panel scale via zoom, which getComputedStyle hid (this entry was a measurement artifact; Emotes / Tools / A / C now zoom too) | green |
| town `pref:text-200` menu covered / overlap | The sweep now emulates 200% zoom as a browser does (195x422 at device scale 2) instead of `html{zoom:2}`, which kept 390 px media queries. That exposed the real bug: the zoomed bag bar covered Where to? (the Town Menu). Fix: zoomed panels capped at `46vw / --hud-scale`; at <= 300 px the people panel spans the top and the bag bar sits under it, no double zoom | red on old code (`covered by #inventory-panel`), green after. Before/after: `img/cyc0-ui-town-200zoom-before.jpg` / `-after.jpg` |

Also: stale allow-list entries are now caught on PAGES-only runs (was full runs only). Targeted tests run green: phone-panel, beta-r4-d4-mobile, beta-r4-d4-town, beta-w05r3-hud-narrow, a11y sweep for town / realm-world / realm-dungeon (all 7 viewports + prefs).

## Real-zoom sweep: 8 pages fixed (was the merge blocker for d8b8648)
The real-zoom text-200 pass found 8 genuine horizontal-scroll bugs at 195 px. All fixed under `@media (max-width: 300px)`: shared
`mm-8bit-arcade.css` (#top wraps, title on its own row, Sound shrinks, stat row 2-up: dash, echo, pop, stack), bugs.css (header, stick /
Swing / Sneak row), jam.css (header, song cards, pads), lantern.css (stats 2-up, choices, cards; title words kept whole), stalk.css
(price card, all-time list, goals, actions). Sweep with VPS=390x844 on those 8: 0 offenders; town / realm-world / realm-dungeon, all
viewports: 0 offenders; allow-list stays `{}`. Leftover U-08 (low): at 195 px some words in Bug Safari arena cards still break mid-word.

## Leftovers (prioritised)
| id | sev | screen | viewport | what | screenshot |
|---|---|---|---|---|---|
| U-01 | high | Town HUD (b08-r2-07) | 390x844 | Offline, the 5 quick-chat phrases sit mid-screen and Hold to talk shows, but both only answer "Chat needs the online town". Hiding them offline is a one-line class (tried and reverted): the offline-stub layout tests (beta-w07-town-hud wheel vs quick chat, town-bugbash walkie pill, town-polish PTT) measure the online HUD through the offline path, so they need a test-only `?hud=online` style hook first | `img/cyc0-ui-town-390-hud.jpg` |
| U-02 | med | Town HUD | 390x844 | Bag bar is a 7-row block of 12 counters on phones (46vw); proposal: one row (bag + 3 most recent counts), tap to expand | `img/cyc0-ui-town-390-hud.jpg` |
| U-03 | med | Town HUD | 160x284 (320x568 at 200%) | Joystick overlaps the bag bar; the sweep has no 160 px case | `img/cyc0-ui-town-160-zoom.jpg` |
| U-04 | med | Town gate chip | 390x844 | Realm Gate chip overlaps the bag bar edge at 150% text | `img/cyc0-ui-town-text150-after.jpg` |
| U-05 | low | Realm HUD | 390x844 | Top bar: 4 icon buttons + Leave + HP + XP + zone line + goal line + event line in the top 160 px; goal text wraps onto 2 lines ("(Lv 1)") | `img/cyc0-ui-realm-text150-after.jpg` |
| U-06 | low | a11y sweep | all | The sweep's text-200 pass still only checks hscroll / Menu / clipping; add tap-target and overlap of the HUD pieces at 195 px | - |
| U-07 | info | not audited this cycle | - | Hub Home/Map, Lantern, Isles, arcade games, Settings, Backup UI at 1280x720 / 844x390 were not re-screenshotted this cycle (time box); the sweep still covers them at 7 viewports with an empty allow-list | - |
