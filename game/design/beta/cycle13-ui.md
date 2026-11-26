# Cycle 13 U (UI/UX) - branch `cyc13-ui` (cut from 1e6b3b6)

Static server: port 9132 (this worktree). Browsers only through /tmp/bt.sh. Every "was" number below was measured on 1e6b3b6 in a real Chromium, and the new test `game/tests/cyc13-ui.test.js` was run against an untouched copy of 1e6b3b6 (served on a second port): **13 FAILED** there, **ALL PASSED (32)** on this branch.

## 1. Museum on desktop 1280x720: the ✕
**Measured first (1e6b3b6, natural scroll, Wild Fauna wing, card 628 px tall, scrolled 1261 px):** the ✕ was already sticky and on screen (y 52, on top). L's cyc12-lead rule (`position: sticky`, all sizes) fixed it at integration; the cycle 12 U note "y -244 after a scroll" was measured on U's own cycle 12 rules, which were dropped at the merge. So the ✕ is reachable on desktop and I did not touch L's rules.

**What was still wrong at 1280x720:** the stuck tab bar sat at the card's content edge (`top: 0`), 20 px (23 px measured, with the border) under the card's top edge. Scrolled specimen cards showed in that strip, above the bar and around the ✕ (`elementFromPoint` in the strip hit a specimen `IMG`).

**Change (`game/style.css`, new block `cyc13-ui` at the end, after L's block, no Museum rule repeated):**
- Above 480 px, the bar sticks flush with the card's top edge (`top: -20px`, the same rule L/cycle 11 use on phones).
- `scroll-padding-top: 124px`, so a focused specimen card parks under the 2-row desktop bar.

**Check:** `cyc13-ui.test.js` museum 1280x720 (natural size, no forced height): bar flush (gap <= 3 px; was 23), no specimen in the strip, ✕ 44 px on screen, inside the card, in the bar row and on top, a real click on it closes the Museum. L's `cyc12-lead-museum-panel` (5 viewports), `cyc12-ui` and `cyc11-ui` all pass on this branch.
Screenshot: `img/cyc13-ui-museum-1280x720-end.jpg`.

## 2. Museum tab bar: scroll cue (195x422: one tab fits beside the ✕)
**Measured first:** at 195x422 the one-row bar hides 483 px of tabs (only Fossils shows); at 390x844, 304 px. Nothing showed that more tabs existed.

**Change:**
- `main.js`: new `Town.museumTabCue()`, called from `showMuseumWing()` and after `openMuseum()` un-hides the dialog. It sets `.cue-r` / `.cue-l` on `.museum-tabs` when more than 2 px of tabs are hidden at that edge. Listeners (scroll and resize) are attached once.
- `style.css` (`cyc13-ui` block): `::after` / `::before` are sticky to the scroll box's edges. Each draws a 24 px fade in the bar's colour with a yellow › / ‹.
  - `pointer-events: none`, static (no animation).
  - Negative margins, so the cue adds no scroll width.
  - The cue ends at the bar's scroll box, which ends before L's 54 px ✕ reserve, so it is never under the ✕.
  - A wrapped (desktop) bar never scrolls, so it never gets a cue.

**Check:** `cyc13-ui.test.js` at 195x422 and 390x844 (all pass):
- On open, the right cue is drawn (at least 18 px, with the › arrow) and ends left of the ✕.
- Scrolled to the end, the right cue is gone and the left ‹ cue shows.
- A real tap at the cue's centre opens the tab under it.

At 1280x720 there is no cue. Screenshots: `img/cyc13-ui-museum-{195x422,390x844}-cue{,-end}.jpg`.

## 3. Isles under 300 px: hint line and action-row cue
**Measured first (1e6b3b6, reef, how-to closed):**
- **160x284:** the hint "The dock. Tap Sail to open the sea chart." lay at y 53-108. That is completely under the HUD (y 60-143, z 3 > hint z 2), so it was invisible. It also lay on the Pack button.
- **195x422:** `fitHint` lifted the hint above the action column to y 135-174. That is under the HUD's lower lines, with one line peeking out.
- **No free strip:** at these sizes the map, HUD, action row/column, stick and Attack fill the screen.
- **160x284 with the how-to up:** the action row is 44 px wide and holds 147 px of buttons, so it shows one button of three with no sign of the others.

**Change:**
- `isles.js` `fitHint()`, on its existing 0.5 s tick:
  - On a narrow portrait touch screen (width < 300, portrait), the body gets `hint-narrow`. The hint is then drawn above the HUD (z 4, opaque panel) for 6 s.
  - The 6 s count from when the text changes, or from when the hint becomes visible again (after the how-to, after a panel closes: `closePanel()` restarts the clock).
  - After that the body gets `hint-tucked`, which sets the hint's opacity to 0, so the HUD is whole again.
  - `role=status` still announces every change. Screens 300 px and wider are unchanged.
- `isles.css` (new `cyc13-ui` block at the end): under 190 px the hint spans the width right above the action row (bottom = row top + 4, padding 2px 4px). Measured: y 105-152, clear of Pack (bottom 106), the row (top 156) and the Map button.
- `isles.js` `actsCue()` + `isles.css`: when the action bar is a row and more than 8 px of buttons are hidden at an edge, it gets `cue-r` / `cue-l`. That draws a sticky 18 px fade with an orange › / ‹ arrow.
  - `pointer-events: none`, static.
  - The 8 px threshold exists because, with the how-to closed, Decor is cut by 3 px of padding. That is not "more buttons", and a cue there would cover its label.

**Check:** `cyc13-ui.test.js` Isles (all pass):
- **160x284, how-to up:** the row hides buttons and the right cue is drawn. After a real tap on the how-to ✖, everything fits and the cue is gone.
- **160x284 and 195x422:** the hint shows, is drawn above the HUD, is fully on screen and covers no button (actions, Attack, Pack, Map). After 6 s it is tucked (opacity 0). After a real tap on Pack and then Esc, it is shown again.
- **390x844:** no cue, and the hint never tucks, keeps its z and stays off the HUD.

Regression runs (all pass):
- `cyc12-ui` (Isles 160/195 overlap rules, Museum, banner)
- `cyc5-ui-isles-compact` (hint never on an action button)
- `isles-ftue-fixes`
- `a11y-viewport-sweep` with `PAGES=isles,town-museum VPS=160x284,195x422,390x844`: 0 offenders in all 6 runs.

Screenshots: `img/cyc13-ui-isles-160x284-{howto,hint,tucked}.jpg`, `img/cyc13-ui-isles-195x422-{hint,tucked}.jpg`.

**Trade-off (honest):** for 6 s, the hint at 195x422 covers the HP bar and the XP line, and at 160x284 it covers the HP bar. Before, it was unreadable all the time. There is no free strip at these sizes (measured), so a short show-then-tuck is the least bad choice. A fight hint (boss, air) is also a new text, so it shows when it matters.

## 4. Idea reviews (ID-62..67)
General rules as in cycle 11, for every approved idea:
- text >= 12 px
- taps >= 44 x 44
- nothing over the stick, A/C, the bag bar or the Menu
- static under reduced motion / flashes-off
- no sound
- 0 DB attempts in tests (offline ADMIN bot)
- the a11y sweep stays at 0 offenders at 195x422 and 160x284
- additive save keys only, listed in SAVE-KEYS.md, and an old save without them loads unchanged

| ID | Verdict | One-line reason |
|---|---|---|
| ID-62 treat bubble | approved with conditions | Cheap warmth with no penalty, but it rides on ID-59 (heart, toast rules, `animalHello` bit), which is not built: build after ID-59. |
| ID-63 Isles tame callback | approved, reduced | The Town never draws an Isles companion, so "animals turn to the companion" has nothing to turn to. The line alone is fine and costs one read-only key read. |
| ID-64 first-build choice card | card approved; build gated | The card is buildable to the spec below; whether two ability-1 options are fair is an economy question for D/L first. |
| ID-65 "Not saved" chip | approved | The flag exists (`SAVE_OK`), and the risk it covers (ten minutes lost silently) is real; placement below. |
| ID-66 workbench goal step | approved | Text only, on the existing goal card; the only UI risk is length at 195 px, rule below. |
| ID-67 Rookie XP bonus | rejected for now | Bot data only, with no human playtest (D's own note). A "Rookie bonus" label has no room in `#realm-info` at <= 300 px (75 px, nowrap, measured cycle 11). Re-propose with human data. |

### ID-65 spec (S)
1. **Element:** `<button id="save-warn" type="button" class="save-warn" hidden>`, inside a `role=status` wrapper.
   - Text: "⚠ Not saved". 12 px, at least 44 x 44, with the shop warning colours (dark text on the amber used by "not saved yet").
   - `aria-label`: "Your progress is not being saved: browser storage refused it. Tap for details".
2. **When:**
   - Shown while `SAVE_OK === false` (Town).
   - The Realm uses its own write-result flag: S finds the place where the Realm save catches the write failure and mirrors `SAVE_OK` there.
   - Hidden on the first write that lands. No timer, no toast, no sound; the chip itself is the message.
3. **Where:**
   - Town >= 301 px: directly under the corner Menu (`#mm-nav-btn`), left-aligned with it, 4 px gap.
   - Town <= 300 px: the same column, under the folded bag button when that sits under the Menu (160x284: bag at top 64 px), i.e. the first free 44 px slot in the left column.
   - Realm: left of `#realm-info` above 300 px; under the Leave button at <= 300 px.
   - S measures the slot with `getBoundingClientRect` in the test, and the sweep's OVERLAP rule must stay at 0.
4. **Tap:**
   - Opens a small note (the What's-new banner look, ✕ 44 px, Esc closes it, captured): "This browser refused to save (storage full or blocked, for example in a private window). Free some space or leave private mode; the game keeps trying on every change."
   - The tap also triggers one save retry.
5. **Tests:**
   - Force a refused write (stub `localStorage.setItem` to throw for `pixeltown-save-v1`): the chip appears, stays after 10 s and after a shop closes, and is gone after the stub is lifted and one change is made.
   - At 195x422, 160x284, 390x844 and 1280x720: the chip is on screen, at least 44 px, and overlaps nothing.
   - 0 DB attempts.

### ID-66 spec (S)
1. **Goal card text:**
   - After "chop wood" is done, the goal card reads "Craft a Plank Stack at the workbench".
   - When a Plank Stack is in the bag: "Place it at your home". Then the existing chain continues.
   - Same card, same size, no new element, no reward.
2. **Length:**
   - Each line fits at 195x422 in the compact goal card at 12 px, in at most 2 lines, with no word broken.
   - If a line does not fit, shorten the words ("Craft planks at the workbench"); do not shrink the type.
3. **Progress:** derived from the existing save (inventory / placed items). No new key unless the chain cannot be derived; if a key is needed, it is additive in the Town save.
4. **Tests:**
   - A bot follows the goal card from a fresh profile: chop, workbench, place. Each step's text appears and advances on the real action.
   - At 195x422 the card stays inside the screen and off the controls.

### ID-62 spec (S; after ID-59)
1. **Trigger:**
   - Only for an animal whose `animalHello` bit is set.
   - At most one bubble in the Town at a time, and at most one every 90 s.
   - The bubble shows while the hero is within about 96 px. It never appears while a dialog, shop, Museum, map or the bag is open.
2. **Bubble:** drawn in code by G (a 10 x 10 px pixel flower or berry icon in a white speech bubble), above the animal. Static under reduced motion. No text.
3. **Hand-over:**
   - The existing interact (E / A button) while the hero has a flower or berry in the bag gives one of that item (lowest-value first), shows the ID-59 heart and one line in `#achievement-toast` under ID-59's rules ("The red fox loved the berry 💛").
   - With nothing to give, the interact does what it did before; the bubble just fades out.
   - No hunger, no counter, no reward, no new save key (the bubble state is in memory only).
4. **Tests:**
   - A bubble appears for a liked animal and not for an unmet one.
   - A real E/A with a berry in the bag removes exactly 1 berry and shows the heart.
   - With an empty bag nothing is lost.
   - At 195x422 the toast is clear of A/C and the bag bar.
   - 0 DB attempts.

### ID-63 spec (S; after ID-59; reduced)
1. **When:** on Town load, read the Isles tame record read-only (no write, no Isles code loaded). If at least one tame exists and the new Town additive bit `islesTameSeen` is not set, show one line once, then set the bit.
2. **Line:** "The Town animals heard about your new friend from the Isles 💛". Shown through `#achievement-toast` under ID-59's rules (free toast, What's-new banner down, no dialog open); if the toast is busy, try again on the next free slot in the same visit. No turning, no companion sprite.
3. **Tests:**
   - A seeded Isles tame shows the line once.
   - A reload does not show it again.
   - A save without any tames shows nothing.
   - An old save without the bit loads unchanged.

### ID-64 card spec (U part; the build waits for D/L's economy check)
1. **When:** the first Realm level-up to Lv 5 for a profile without the additive key `realm.build1`. The card opens after the level-up toast, never during a fight: it waits until no hostile is within the danger radius, like ID-55's card.
2. **Card:**
   - The ID-55 first-session card look, centred, max-width min(92vw, 360px).
   - Title "Choose how ability 1 works", 14 px.
   - Two option buttons, each full width, at least 44 px tall, two plain lines: the name, and one sentence of what changes ("Wider shot, a bit slower").
   - No ✕: a third, quieter button "Decide later" closes it. The card returns on the next level-up, at most twice, then a line in the Settings / hero panel offers the choice.
   - Esc = "Decide later" (captured).
3. **Layout:**
   - At 195x422 the card is inside the screen, scrolls inside itself if needed, and keeps its buttons clear of the Menu.
   - At 160x284 the two options stack. Text 12 px minimum.
4. **Focus:** the focus goes to the first option when the card opens and returns to the canvas when it closes. `role=dialog`, `aria-modal`, `aria-labelledby` the title.
5. **Save:** `realm.build1` = `"a" | "b"`, additive. Missing means the base ability (today's behaviour); it never changes on its own. It is included in the one Backup.
6. **Tests:**
   - A seeded Lv 4 -> 5 shows the card once.
   - Choosing writes the key and closes the card.
   - "Decide later" shows it again at the next level-up, at most twice.
   - Old saves are unchanged.
   - The sweep overlap rule passes at 195x422 / 160x284 with the card open.
   - 0 DB attempts.

## Files changed
- `game/style.css`: new block `/* cyc13-ui ... */ ... /* end cyc13-ui */` at the end. Braces were counted before and after the edit: 829/829 before, 835/835 after. `isles.css` is 271/271 after. L's cyc12-lead rules are untouched.
- `game/main.js`: `museumTabCue()` (new), plus 2 calls.
- `game/games/isles/isles.js`: `fitHint()` show/tuck logic, `actsCue()`, and one line in `closePanel()`.
- `game/games/isles/isles.css`: new `cyc13-ui` block at the end.
- `game/tests/cyc13-ui.test.js` (new, registered in `test-tiers.json`: browser / full / 360 s).
- `game/design/IDEAS.md`: status of ID-62..67.
- `game/design/beta/img/cyc13-ui-*.jpg` (10 screenshots).

## Not done / unresolved
- **Cache versions:** `style.css?v=` and `main.js?v=` in `game/index.html` are not bumped (shared file). The coordinator bumps them at the merge as in cycle 12. `isles.css` / `isles.js` have no version query.
- **Isles 160x284 with the how-to up:** the treasure toast ("Coral Reef opens with a ...") ran from y 222 to 452, off the bottom of a 284 px screen and over Attack. Seen in the probe, not fixed (toast placement is outside this item). Next: cap the toast at `max-height` with the 12 px floor, or queue it after the how-to.
- **Museum 195x422:** the right cue covers the end of the first tab's count ("0/5" reads "›5" at the edge). That is acceptable for a cue, but a shorter count format at <= 300 px would read better.
- **Not checked on a real phone.** The full 4-shard stamp is the coordinator's.

## Proposals
1. **Isles hint:** a small "?" in the HUD at <= 300 px that re-shows the tucked hint for 6 s on tap (44 px, so it needs a slot: measure first).
2. **Museum:** apply the scroll-cue helper to the other one-row scrollers (Realm shop tabs, notebook tabs, if any) after measuring them.
