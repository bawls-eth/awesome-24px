# Cycle 14 S (Game Systems): ID-65, ID-66, ID-62, ID-63

Branch `cyc14-systems` (cut from 445fd49), static server port 9105. Nothing pushed.
Specs: U cycle 13 (`design/beta/cycle13-ui.md` section 4) and L conditions (`design/IDEAS.md`). The new test is `game/tests/cyc14-s-systems.test.js`, registered in `test-tiers.json` (browser / full / 900 s).

## What changed

### ID-65: persistent "Not saved" chip (Town + Realm)
- **Town** (`index.html`, `main.js`, `style.css`):
  - `#save-warn` is a button inside a `role=status` wrapper. It shows while `SAVE_OK === false`, is checked every 250 ms, and hides once a write lands. No timer, toast, sound or save key.
  - `placeSaveWarn()` puts it under `#mm-nav-btn`, left-aligned with a 4 px gap. It then moves down past any visible control or HUD panel it would cover: the first free 44 px slot in the left column.
  - At <= 300 px the chip text wraps to "⚠ Not / saved" (60 px wide, still 44 px tall and 12 px text). At 160x284 the one-line chip (about 100 px) covered the folded bag and the Emotes button.
  - A tap opens `#save-warn-note` (the U text, ✕ 44 px, focus on ✕). Esc closes the note in the capture phase, so it closes nothing behind it. The tap also retries the save once with `writeSave({})`.
  - The chip is hidden in the Realm, the Realm embed and the cave.
- **Realm** (`realm.js`, `realm-ui.css`):
  - `_syncSaveWarn()` follows `this.saveOk`, which `_persist` sets on every write. The chip `#realm-save-warn` is created only on the first refused write.
  - Above 300 px it is a flex item of the HUD row, just left of `#realm-info`.
  - At <= 300 px it is fixed under the Leave button and pushed past any HUD control or bar it would cover. The position is checked again at most every 300 ms, from `_syncHud`.
  - A tap shows the same note and runs one `onSave` retry. Esc is captured. `stop()` hides the chip.

### ID-66: workbench steps on the goal card
- The goal card is the existing Realm Gate chip; there is no other Town goal card, and the Town had no "chop wood" step.
  - The Realm Gate stays the first step. Today's goal is never blocked: a new player with wood still sees the gate (tested).
  - After the gate is reached, a player who has chopped wood sees "Craft a Plank Stack at the workbench". With a crafted good in the bag the card reads "Place it at your home". Once something is placed at home the card goes away.
  - The arrow points at the workbench, then at home. The ✕ `aria-label` reads "Hide the goal card" for these steps.
- **No save key.** Every step is worked out from data the save already holds: `lifetimeStats.wood/crafted/homePlaced`, `resources.wood`, `crafted`, `home.slots`.
  - A returning player who already placed something at home, or who crafted and sold their goods, skips the chain.
  - ✕ (`dismissed`) ends every step.
- **195 px:** the long lines took 3 lines on the compact card (screenshot), so the <= 300 px words are shorter: "Use the workbench" and "Place it at home". The type size is unchanged. Each fits in 2 lines at 12 px (measured).
- The workbench steps hide while a panel is open (`canAct`). The gate step behaves exactly as before.
- **ID-59 rule:** only the gate step holds back the animal lines (first-minute rule). The new steps do not.
- **`index.html` change:** the label sits in a new `<span id="gate-pointer-label">`. The card's text content is unchanged.

### ID-62: treat bubble
- **When it shows:**
  - Only for an animal whose `animalHello` bit is set and that was not greeted on this visit.
  - Only within 96 px of the hero, and never while a panel, the bag or build mode is open.
  - At most one bubble at a time and one every 90 s.
- **Look:** one 16x15 code-drawn image at 2x: a white bubble with a 10x10 flower or fruit (original art; `makeTreatBubble`, which G can replace). It is the only new per-frame Town sprite and exists only while the bubble shows; it is not in the cull list.
- **Hand-over:** the normal E / A press, checked right after villagers in `interact()`, gives 1 flower or fruit.
  - The order is flowers then fruit, with today's deal item last. The Town has no berries, so "berry" is the Town's fruit 🍎.
  - It then shows the ID-59 heart and one line through the shared ID-59 line slot: "The Red Fox loved the flower 💛".
  - With nothing to give, the bubble fades out (it just goes with reduced motion) and the interact does what it did before.
  - No counter, reward or save key.
- **Refactor:** ID-59's line rules moved into shared `animalLine(text)` / `animalCalm()` helpers and `animalHeart()`. ID-59 behaviour is unchanged (`cyc13-s-animal-hello` ALL PASSED).

### ID-63: Isles tame callback (reduced)
- On Town load the game checks `pixeltown-tames-v1`.roster and `pixeltown-archipelago-v1`.log.tamed. It reads them only, and loads no Isles code.
- If there is a tame and the save has no `islesTameSeen`, one line shows through the shared slot: "The Town animals heard about your new friend from the Isles 💛".
  - If the slot is busy, it is tried again on later ticks of the same visit.
  - Once shown, `islesTameSeen: 1` is written (additive). It is listed in `SAVE-KEYS.md`.
- No turning, no companion sprite.

### Follow-up after the review (U notes from the coordinator, second commit)
1. **ID-65 note:**
   - It now opens just under the corner Menu (top = Menu bottom + 4 px) at z-index 9050, which is above the Menu (9000) and below the nav sheet (9100).
   - It has a fixed `width: min(92vw, 420px)` and scrolls inside itself (`max-height: calc(100vh - 72px)`).
   - Before this, at 195x422 the shrink-to-fit note was only 124 px wide and 408 px tall and ran off the bottom. At 160x284 two of its points were covered.
   - New check in [65T] at all 4 sizes: the open note is inside the screen and 5 points of its box hit the note.
   - Before the fix (the first commit, served on port 9116): FAIL at 195x422 and 160x284. After: PASS at 1280x720, 390x844, 195x422 and 160x284.
2. **ID-62 bubble:**
   - New `treatBubbleSide()` in my own code; `makeAnimalHelloHeart` is not touched. Every 120 ms it tests 5 screen points of the bubble with `elementFromPoint`. When the DOM covers one, the bubble moves to the first clear side: above (default), below, right, left.
   - New check in [62]: the bubble's 5 points land on the game canvas.
   - Before: FAIL at 195x422 (the bag bar `#inventory-panel` covered 3 of the 5 points). After: PASS at 1280x720 and 195x422; at 195 the bubble now sits to the right of the fox (screenshot `img/cyc14-systems-treat-bubble-195x422.jpg`).
3. ID-66 short labels: approved by U, kept as they are.
4. Heart scale (G): left alone, as asked.

## Checks actually run (all through /tmp/bt.sh, port 9105)

| Item | Check | Result |
|---|---|---|
| all | `cyc14-s-systems.test.js` full run on the first commit | **ALL PASSED, 119 checks**; after the review fixes: [65T]+[62] ALL PASSED (61 checks), [65R]+[66]+[63] re-run ALL PASSED (61 checks); 122 checks in all |
| all | the same test against the base commit (git archive of 445fd49 served on port 9115), per section | fails before: [65T] chip missing (FAIL from the first check); [65R] FAIL then a crash (no chip element); [66] FAIL (no steps); [62] FAIL (no bubble); [63] 2 FAIL (no line, no bit) |
| ID-65 Town | 1280x720, 390x844, 195x422, 160x284 | chip visible, >= 44 px, 12 px text, under the Menu, 0 overlaps with the sweep OVERLAP rule; at 1280 it stays after 10 s and after the workbench closes; tap = note + 1 retry; Esc closes the note only; gone after the stub is lifted and one change is made; no new key; 0 DB attempts |
| ID-65 Realm | Realm World at 1280x720, 390x844, 195x422 | chip shows on `saveOk === false`, 0 overlaps, left of the info line (> 300 px) or under Leave (195); tap = note + retry; Esc closes the note only (no panel opens); gone after a landed write; 0 DB attempts |
| ID-66 | bot at 1280x720 and 195x422 | real E (desktop) / A tap (195) chops 3 wood, then the craft step; real E at the workbench and a real click on Plank Stack, then the place step; real E at home plus `selectOption`, then the card is gone, also after a reload; <= 2 lines, 12 px, no broken word, inside the screen, off the controls; gate step first for a new player; a returning player who placed something sees no chain |
| ID-62 | 1280x720 (E) and 195x422 (A tap) | bubble for a liked fox; a real press gives exactly 1 flower (deal = fish); heart shown, bubble gone, line inside the screen and clear of A / C / the bag bar / the stick; no second bubble within 90 s; with an empty bag nothing is lost and the bubble goes; an unmet fox gets no bubble; Museum open = no bubble |
| ID-63 | 1280x720, 195x422 | seeded tame: line once, `islesTameSeen` 1, other fields and the Isles key untouched; reload: not again; no tames: no line and the save is byte-identical |
| regressions | `cyc13-s-animal-hello`, `cyc3-ui-town-first-visit`, `cyc4-ui-town-zoom-goal`, `cyc9-shop-reliability`, `cyc13-design-refused-saves`, `cyc11-lead-town-stars` | all ALL PASSED |
| sweep / cull | `a11y-viewport-sweep` (PAGES=town, VPS=160x284,195x422), `cyc13-lead-town-cull-far` | sweep: 0 offenders at both sizes (chip hidden in the sweep: storage works there); cull: ALL PASSED, 215.2 per pass measured (on the budget edge; the bubble exists only while shown and is not culled) |

Screenshots: `img/cyc14-systems-*.jpg` (17: Town and Realm chips at 4 / 3 sizes, the note, goal craft / place at 1280 and 195, treat bubble and line at 1280 and 195, Isles line).

## Unresolved / honest notes
- **Realm 195x422 chip position:** under Leave the right column is full (mini-map, then the ability buttons), so the chip is pushed down to about y 305, beside the fire stick. It overlaps no control, but it is far from Leave. A better slot needs U, for example inside the More tray.
- **Realm 160x284:** not tested (the Realm test covers 3 sizes). The Town was tested at 160x284.
- **ID-62 and ID-66 at 390x844:** not screenshotted. Only 1280x720 and 195x422 were run for those two items; the 390 coverage is ID-65 only.
- **Treat bubble art:** a code-drawn placeholder. G owns the final look.
- **Cache versions:** `style.css?v=` / `main.js?v=` / `realm-ui.css?v=` were not bumped (shared files); the coordinator bumps them at the merge.
- Not checked on a real phone. The full stamp is the coordinator's.

## Proposals
1. U: choose the Realm chip slot at <= 300 px (inside the More tray when `rw-has-more`).
2. G: a final treat-bubble sprite with the same contract as `makeTreatBubble(scene, kind)`.
3. D: measure how often a first-session bot sees the workbench steps (the chain only starts after the gate is reached).
