# Cycle 1, U (UI/UX)

Branch `cyc1-ui` (from `claude/animal-crossing-game-7z3roh` 86eda4b). Own server on 9712, Firebase blocked everywhere
(Town through `helpers.offlineStub`, `db.attempts() === 0` asserted), targeted tests only through /tmp/bt.sh.

## Fixed this cycle
| Item | Fix | Check (fails before / passes after) |
|---|---|---|
| U-01 (b08-r2-07, high) | Offline Town: `body.town-offline` hides the quick-chat phrases and Hold to talk (they only answered "Chat needs the online town"); the chat input placeholder says so. Test-only hook `?hud=online` keeps them on the offline path. The 9 offline layout tests that measure those pieces (beta-w07-town-hud, town-bugbash, town-polish, town-8bit-menu, beta-r4-d4-mobile, beta-r4-d4-town, nav-town, town-first-ten, town-isles-sign) now load `?hud=online`, so they still measure the full online HUD (a superset of the offline one) | new `cyc1-ui-town-hud`: 3 U-01 fails on old code, pass after; the 9 hooked tests + town-offline all green |
| U-02 | Phone (<= 720 px) bag bar: ONE row = the bag (44 px button, `aria-expanded`, Enter/Space) + the 3 most recently changed counts, most recent first (MutationObserver on the count text, tab-only, never saved). Tap the bag = every count, tap again = fold. Desktop unchanged | `cyc1-ui-town-hud` U-02 checks (6 fails before) |
| U-03 | 160x284 (320x568 at 200%): the folded bag is the 44 px bag button top-right beside the people panel (which wraps its words instead of clipping); it no longer sits on the stick / action buttons | `cyc1-ui-town-hud` U-03 (hit joystick + action-buttons before) |
| U-04 | 150% Text size: the one-row bar drops its oldest counts until the row fits (min 1), so it no longer grows to 190 px tall under the Realm Gate chip | `cyc1-ui-town-hud` U-04 + "no count spills out" |
| U-08 | Bug Safari arena cards at <= 300 px: one card per row and `overflow-wrap: break-word` (was 2-up at ~85 px with `anywhere`: "MEAD/OW", "Lock/ed") | new `cyc1-ui-arena-cards`: 17 split words at 195x422 before, 0 after; 390x844 unchanged |
| U-05 (b08-12) | Realm phone top HUD, measured: the level goal drops the repeated "(Lv N)" (the level is on the info line right above), so the goal is one line and the top text stack ends at y 148 instead of 163 at 390x844 | new `cyc1-ui-realm-hud`: 4 fails before, 0 after; realm-bugbash, beta-g06-quest-zones, beta-w05-realm-hud, beta-w05r3-hud-narrow green |

a11y sweep (`PAGES=town,festival-bugs` and `PAGES=realm-world`, all 7 viewports + prefs): 0 offenders, allow-list stays `{}`.
Screenshots: before `img/cyc0-ui-town-390-hud.jpg`, `img/cyc0-ui-town-160-zoom.jpg`, `img/cyc0-ui-town-text150-after.jpg`, `img/cyc1-ui-bugs-195-before.jpg`,
`img/cyc1-ui-realm-390-before.jpg`; after `img/cyc1-ui-town-390-after.jpg`, `img/cyc1-ui-town-160-after.jpg`, `img/cyc1-ui-town-text150-after.jpg`,
`img/cyc1-ui-bugs-195-after.jpg`, `img/cyc1-ui-realm-390-after.jpg`.

## U-07 audit (1280x720 + 844x390 touch): Hub Home / Map, Lantern, Isles, 9 arcade games, Settings sheet, Hub Backup
Scripted pass (horizontal scroll, controls clipped by the viewport, visible tap targets < 44 px on touch, overlapping controls) plus screenshots.
No concrete layout bug found; every hit was an intended pattern: Hub Map `#map-play` is an off-screen skip link (shows on focus), the Hub
place chips are a horizontal scroller, the 1x1 Hub / Town links on game pages are screen-reader links under the shared Menu, the Angler
and Jam start cards sit over their own play field by design. Settings (`#mmset`) fits at both sizes on Hub / Pop / Isles / Lantern with
44 px rows; the Hub Backup panel opens and scrolls fully above the footer at 844x390.
Copy nit for the Jam owner (not fixed here): on a touch device Jam's How to play still says "Keys D F J K, arrows, or touch".

## Leftovers
| id | sev | what |
|---|---|---|
| U-06 | low | the sweep's text-200 pass still only checks hscroll / Menu / clipping; add tap-target and HUD-overlap checks at 195 px |
| U-09 | low | 160x284 Town: the stick (128 px) and the Emotes / Tools / A / C grid still overlap each other (pre-existing, not the bag bar) |
| U-10 | info | Realm phone info line repeats the zone name ("Shore") that the zone line also shows; dropping it saves width, not height |

## ID-02 Zone danger meter: shared HUD component spec (for S; U owns the CSS, S owns the logic)

**Mount point.** One element, created once in `realm-world.js` right after `zoneEl` (the `#rw-zone` line) and appended INSIDE it,
after `.rw-zsub` and before the `.rw-event` line (`zoneEl.insertBefore(dangerEl, evEl)`, or append it before `evEl` is created).
Living inside `#rw-zone` means no new HUD row: on phones (<= 560 px) it joins the single 11 px flex line, on desktop it is a
right-aligned row under the zone name. `zonePlace()` / `goalPlace()` already move the whole zone line, so it never needs its own placement.

**Markup (textContent only, no innerHTML from data):**
```html
<span id="rw-danger" class="rw-danger" data-level="comfortable" aria-label="Danger: comfortable">
  <span class="rw-danger-bar" aria-hidden="true"><span class="rw-danger-fill" style="--rw-danger: 0.25"></span></span>
  <span class="rw-danger-txt">Comfortable</span>
</span>
```

| class / attribute | meaning |
|---|---|
| `#rw-danger.rw-danger` | the component root (flex row, right-aligned on desktop; inline in the phone zone line) |
| `data-level="comfortable" \| "tough" \| "hot"` | the label bucket; drives the colour. Colour is NEVER the only cue: the text label always shows |
| `.rw-danger-bar` > `.rw-danger-fill` | a 36 x 4 px track (28 px on phones); fill width = `--rw-danger` (0..1) set by S as an inline custom property |
| `.rw-danger-txt` | the word: `Comfortable`, `Tough`, `Too hot` (S may reuse these exact strings for tests) |
| `.rw-danger.hidden` | hidden (Nexus, dungeons, `?danger=0`, boss fight: same hide rules as the goal line) |

**Update rule (S).** Recompute in the existing once-a-second `goalTick` (no per-frame layout, no per-frame DOM writes); write
`data-level`, `aria-label`, `--rw-danger` and the text only when they change. The parent `#rw-zone` is already `aria-live="polite"`,
so the root gets no extra live role and the text changes only when the bucket changes (no announcement spam).

**Label function (S, pure, node-testable).** Suggested: `ratio = difficultyAt(tile) / recLvScale(heroLevel)`;
`< 1.1` comfortable, `< 1.6` tough, else hot; `--rw-danger = clamp(ratio / 2, 0, 1)`. Exact thresholds are S/D's call.

**Colours (8-bit palette, readable on the HUD's shadowed text):** comfortable `#7be08a`, tough `#ffd45a`, hot `#ff6a6a`.
The CSS is already in `games/mad-maze/mad-maze.css` (search `rw-danger`), committed by U this cycle; S does not need to add CSS.

**Phone budget (b08-12 / U-05).** The meter adds no row on phones: the 11 px zone line already ellipsises; `.rw-danger` has `flex: none`
and `order: 3`, and the event text (`min-width: 0`) is what truncates first.
