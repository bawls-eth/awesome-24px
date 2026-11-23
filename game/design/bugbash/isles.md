# Bug bash: ISLES lane (branch `bb-isles`)

Played every island (Hearth Isle / meadow, Verdant Jungle, Frostfang Tundra, Coral Reef, Red Waste / mars) at 390x844 touch,
844x390 landscape touch, 320x568 and 1280x720 desktop; 150% text, low graphics, reduced motion, high contrast; hostile saves
(corrupt JSON, arrays, `null`, `__proto__` keys, huge/negative numbers in `pixeltown-archipelago-v1`, `pixeltown-tames-v1`,
`pixeltown-medals-isles-v1`, `pixeltown-mm-v1`, `pixeltown-access-v1`: all load cleanly, no errors); URL params (`?isle=__proto__`,
`constructor`, locked `reef`/`mars` without `test`, `from=hub`, junk `today`/`launch`/`aurora`/`perf`/`bosses`/`seed`: all safe);
rapid taps, portrait <-> landscape rotation, keyboard only.

Test: `game/tests/isles-bugbash.test.js` (38 checks). Screenshots: `img/isles-landscape-hint.png`, `img/isles-phone-howto.png`.

## Fixed (with tests)

1. Taming felt like spam: every early Feed tap toasted a bare "is still chewing." The Feed button now says `Feed k/need`, or
   `Chewing Ns` with a filling bar while the creature eats; an early tap says "ready in N s" (nothing is lost); a soft cue says it is
   ready again. No timers were shortened: same pace, now honest and visible. (1a-1g)
2. No universal controls: Enter now fires (Space kept), Shift / E feed or use the mount ability (F kept), Esc / P open the shared Menu,
   a standard gamepad works (stick / d-pad, A fire, B / X secondary, Start menu). Key help updated. (2a-2f)
3. Settings entry opened the island log; no Settings sheet: `MMSettings` is mounted (Menu > Settings, and a Settings button in the
   Help tab), pauses the island, one-thumb / sound / music apply live. nav-hub-isles updated to expect the shared sheet. (3a-3f)
4. Silent page: chiptune cues (MMSfx/MMChip) for shots, hits, kills, hurt/death, feeds, tames, gather, craft, medals, sail, rides,
   abilities, boss roar / weary / win, panels, soothe and party commands; music cue (`hub` at home, `realm` elsewhere) when Music is on.
   No AudioContext before the first gesture (no browser warnings).
5. Phone: the first-visit how-to card covered the hero for 9 s: now sits under the HUD row. (4a)
6. Landscape phones: the hint line sat on the hero's feet: it now sits at the bottom between the stick and the buttons; the minimap
   shrinks to 96 px; the how-to moves right of the hero. (4d)
7. Landscape + riding with an ability: the boss bar stretched into a 115 px tall box over the boss: now one strip between HUD and
   minimap. (4e)
8. 150% text: ATTACK overflowed its button: capped at 18 px (still x1.3). (4c)
9. The hint line showed through the edges of an open Pack / sea chart: hidden while a panel is open. (4b)
10. Phone portrait: the Menu compass button covered the Craft / Log panel title: panels start under the Menu row. (4b2)
11. Two "Attack" buttons side by side when a party is out: the party command reads "Fight" (aria label unchanged).
12. Keyboard: closing a panel with Esc lost focus to `<body>`: focus returns to the opener (keyboard only, so Enter-to-fire still
    works for mouse players). The hidden legacy back link was an invisible Tab stop: now `tabindex=-1`. (2d2)
13. a11y sweep: `#toast` text was 1.2:1: now light text (5b). No `<main>` / `<h1>`: added (the island name is the h1) (5a). Sail had
    no keyboard-findable name: "Sail: open the sea chart", reachable within 6 Tabs (5c, 5e). `mm-high-contrast` was ignored: applied,
    with solid black plates and white text (5d). `mm-reduce-motion` now reaches the island (5d). `a11y-viewport-sweep` PAGES=isles: 0 offenders.
14. A land companion (Fern Raptor) idled on deep water at the shore (its follow spot or a catch-up teleport landed in the sea): land
    companions no longer step from land into water, and one left in water steps out behind you. Swimmers / fliers unchanged. (6a,
    fails 40/40 on the old code)
15. The boss tame's early feast said only "is still chewing.": it now says "ready in N s" too (isles-boss test 3).

## Open (not fixed)

- **Toast can cover the boss sprite** (low, phones): the toast sits at 22% height, where an engaged boss usually stands.
- **How-to card overlaps the Map button a little in landscape** (cosmetic; it has pointer-events: none and fades after 9 s or 2.5 s
  after the first input).
- Not mine: `isles-first-ten` tundra-b reward gap (fixed on the base by `isles-gap-fix`; green after merging the base).

## Elsewhere

- `game/shared/mm-nav.js` `hideLegacy()`: hidden legacy back links (`.mm-nav-legacy`) stay focusable on every page that uses them;
  it could set `tabindex=-1` / `aria-hidden` itself (the isles page now does it locally).
