# Cycle 3, U (UI/UX)

Branch `cyc3-ui` (from `claude/animal-crossing-game-7z3roh` 031b83b). Own server on 9732, every browser run through /tmp/bt.sh,
Firebase blocked (Town through `helpers.offlineStub`, `db.attempts() === 0` asserted; other pages `blockDb`). Targeted tests only, plus
one full a11y sweep. Not pushed.

## Fixed this cycle
| Item | Fix | Check (fails before / passes after) |
|---|---|---|
| 1 Realm overlaps (195x422) | `realm-ui.css`, under 261 px: Leave is a 44 px icon button (back icon kept, word hidden, aria-label / title still name the destination) beside Menu; the aim toggle moves to the free left column (x 8, y 62); the mini-map starts under the Leave row (y 140). Before: Leave at y 139 under the mini-map (72x44), aim at y 221 on ability 1 (44x39) | sweep `A11Y_OVERLAP=1 PREFS=text-200 PAGES=realm-world,realm-dungeon,isles`: 4 offenders before, 0 after |
| 1 Isles overlaps (195x422) | `isles.css`, under 261 px portrait touch: the HUD (had collapsed to 12 px wide; Pack fell to y 353) takes the full width under a top row (Map toggle + 64 px mini-map), names on one line each, 88 px stick, the action column stacks on the right above Attack (was at x -41 over the 132 px stick). Pack / Soothe / Attack no longer touch | same sweep run |
| 1 Overlap check always on | `a11y-viewport-sweep`: the `A11Y_OVERLAP` env guard is gone; allow-list stays `{}` | full sweep, 16 pages x 7 viewports + 5 preference passes: ALL PASSED, 0 offenders (542 s). Rerun of town / realm pages after the later Town changes: see the end of this note |
| 2 Notebook panel (ID-04) | `realm-world.js` nxCss: square card, 2 px hard ring + whole-pixel drop shadow (was the board's 10 px radius, no shadow); title and category lines in the pixel font stack, uppercase; Text size pref scales the panel (`body.mm-hud-big`, 13 px x scale); the walking-Nexus move stick steps aside while the notebook is open (it sat over the list on phones, the stall and board already did this). Focus order, Esc (closes the notebook first, focus back to its button) and 44 px targets were already right and are now pinned | new `cyc3-ui-notebook`: 5 fails before, all pass after; `cyc2-notebook` green |
| 3 First-minute goal | the Realm Gate chip reads "Goal: 🌀 Realm Gate ↖" (was "🌀 Realm Gate ↖", which reads like a place label) | new `cyc3-ui-town-first-visit`: goal check fails before at 390x844 / 844x390 / 1280x720, passes after; chip fits and covers no control there and at 320x568 and 150% text |
| 3+4 Town bag bar, landscape | the cycle-1 phone bag fold (bag + 3 most recent counts) now also applies to short landscape touch screens (`(max-height: 500px) and (pointer: coarse)`); at 844x390 the top row showed all 12 counts (b08 "12 counters") | same test: fold check fails before (compact false, 10 counts shown), passes after |
| 4 Realm zone panel, 844x390 | `mad-maze.css`: short landscape touch screens get the 68 px mini-map thumbnail (tap still opens the big map) so the zone panel (name, danger meter, raid line) ends above the ability pad; its raid line ran 15x17 px under ability button 2 | new `cyc3-ui-landscape-audit`: zone-panel check fails before, all pass after |
| 5 Town label collisions | `main.js` positions only: the Shop roof stacks title (y - 80), "+50% today" deal line (y - 64) and turnip price (y - 50, now over the roof) in their own rows (deal line and turnip price were both at y - 38, 107x13 overlap); Professor Byte's quest line is bottom-anchored above his name (it covered the name by 7 px; bubble unchanged). The Shop title / deal line and statue / quest line pairs named in the brief measured clear; the real collisions were the two above | new `cyc3-ui-town-labels`: 9 fails before (3 per viewport), all pass after at 1280x720, 390x844, `?worldicons=0` |

Other tests run green after the changes: `cyc1-ui-realm-hud`, `cyc1-danger-meter`, `realm-phone-layout`, `world-page`, `beta-r4-realm-rotate`,
`cyc1-ui-town-hud`, `beta-r4-d4-mobile`, `town-bugbash`, `town-first-ten`, `cyc2-ui-town-narrow`, `phone-panel`, `loot-bag-icons`,
`beta-r4-b08-10-home-footer`, `run-all-tiers`, `live-safety`. New tests registered in `test-tiers.json` (browser, full).

## Item 3 numbers (b08-r2 baseline: "Town HUD unchanged: Where to? top right, 12 counters, A / C 50x50, quick-emote bar mid-screen, Hold to talk shown offline")
Measured on a fresh profile, offline Town, visible HUD elements (buttons, drag areas, status chips; the game canvas excluded) and the
union of their boxes:
| view | before (031b83b) | after (cyc3-ui) |
|---|---|---|
| 390x844 portrait | 10 elements, 14.9% of the screen; gate chip "🌀 Realm Gate" (no goal) | 10 elements, 15.6% (the goal words add 0.7%); goal stated |
| 844x390 landscape | 9 elements, 15.0%; bag bar 401x29 px with all 12 counts | 10 elements (the bag becomes a button), 15.6%; bag bar 163x54 px, bag + at most 3 counts |
Most of b08's list was already fixed by cycles 0-2 (quick-emote bar behind Emotes, no walkie / quick chat offline, 3-count bag on
portrait). The new test keeps a diet guard (<= 10 elements, <= 16% at 390x844). Home footer: already Daily gift + Map only on Home
(R4 D1, `beta-r4-b08-10-home-footer` green); nothing changed.

## Screenshots (game/design/beta/img)
`cyc3-ui-realm-195-before/after.jpg`, `cyc3-ui-isles-195-before/after.jpg`, `cyc3-ui-labels-before/after-shop.jpg` and `-byte.jpg`,
`cyc3-ui-notebook-phone.jpg` (after), `cyc3-ui-town-first-before/after.jpg`, `cyc3-ui-town-844x390-before/after.jpg`,
`cyc3-ui-realm-world-844x390-before.jpg` / `cyc3-ui-realm-world-844x390.jpg` (after), and the audit set
`cyc3-ui-{realm-world,realm-dungeon,deepdelve,isles,town}-{844x390,1280x720}.jpg`. All under 160 KB.

## Not done / open
- Realm at 195x422: the 72 px mini-map still sits over the Shards half of the HUD info line and the XP bar (text, not controls; the
  overlap check passes). A real fix needs a second HUD column or hiding the info line under 261 px: left for a design call.
- Isles at 195x422: the calm hint line ("The dock. Tap Sail ...") reads under the HUD / action column (status text, pointer-events none).
  One-thumb riding mode (`#btn-ability` above the stick) was positioned but not measured.
- The Realm Gate goal chip stays hidden under 301 css px by design (style.css: no room; Where to? lists the Realm), so 200% zoom has
  no first-minute goal on screen.
- Desktop first visit: the expanded Town panel shows 9 buttons (Town / Stats / More tabs, trophies, Map, World map, Museum, Today,
  Journal). Collapsing it by default on desktop would touch many desktop tests; proposal for next cycle.
- Keyboard / focus pass: no new pass written; the sweep's keyboard pass (1920x1080 and 390x844, every page, primary action within 6
  Tab presses with a visible ring) is green in the full run above. 844x390 and 1280x720 were audited for overlap / taps / scroll only.
- Turnip price line over the Shop: pale green (#6fbf73) on grass is low contrast; colour is G's.
