# Cycle 15: D (Gameplay Designer)

Branch `cyc15-design` (worktree agent-a78c7f75a1f422811, branch cut by `git checkout -b` because the worktree branch could not be renamed), static server port 9104. Nothing pushed. Firebase blocked in every browser run (`blockDb`, `offlineStub`, literal `db.attempts() === 0`). Browser runs through /tmp/bt.sh. No new save key was added by this cycle's code (the ID-64 spec below LISTS two for S).

## Item 1: ID-64 build spec for S (class ability 1 build choice)

Basis: `design/beta/cycle14-design.md` item 1 (numbers from `tools/id64-build-sim.js`, still green: `cyc14-design-id64-economy.test.js` ALL PASSED today) plus the U card spec in `cycle13-ui.md`. "Ability 1" = the Dash (bar slot 1, key Q, unlocks Lv 1, base cooldown 3 s, 0.4 s safe time, 150 px).

### Decision: ship B; A ships only as "solo only", and I show it can be
Option A is buildable as a solo-only choice. The code facts that make it safe:
- The distance is purely local: `cast()` moves the hero by 15 steps x 10 px x `dk` (collision mode, wall-safe because it is stepwise) or 150 px x `dk` (free mode). `dk` is the mount scale clamped to 0.25..3.
- The cycle 14 worry (a guest's dash must match the host) is real ONLY in duels: `realm-team.js` `_applyInput` clamps a guest's reach (160 px, 2.4 s between dashes) when `this.isPvp`. In PvE co-op the host takes the guest's reported position as is and only enforces the 2.4 s between dash i-frames. A duel ignores the build anyway (below), so nothing there ever sees a 200 px dash.
- Still, to keep "the choice changes only what I can see" simple, A is ignored whenever `this.team` is set (any team room, host or guest), and the card says so in the option text. B works everywhere except duels.
If L/U do not want a solo-only option on the card, the fallback is B alone in the Settings line (no card): do not ship a card with one real option.

### Exact numbers
| | Cooldown (Lv 5-15) | Cooldown with Dash II (Lv 16+) | Distance | Safe time | Where it applies |
|---|---|---|---|---|---|
| none (default, `build1` absent) | 3.00 s | 2.50 s | 150 px | 0.4 s | everywhere (today) |
| **b** Quick dash | x0.90 = 2.70 s | 2.25 s | 150 px | 0.4 s | solo, PvE co-op host and guest; not duels |
| **a** Long dash | x1.15 = 3.45 s | 2.875 s | x1.3333 = 200 px (20 steps of 10 px) | 0.4 s | solo only (ignored in any team room and in duels) |

Both are inside +-20% of base in both currencies (distance per minute A +16%, B +11%; safe seconds per minute A -13%, B +11%; cycle 14 table). XP, shards, drops and damage are untouched (payout delta 0); no sink is added. Re-choosing is free.

Implementation traps S must handle:
1. **`_abCd` clamps to the base cooldown.** Today it ends with `cd = Math.max(1, Math.min(ab.cd, cd))`, so A's 3.45 s would silently become 3.0 s (the cost of A would vanish). Apply the build multiplier AFTER that clamp, then `cd = Math.max(1, cd)`, then the existing guest floor `Math.max(2.4, cd)`. B at 2.70 s is above the 2.4 s guest floor; a guest with Dash II + B (2.25 s) is floored to 2.4 s by the existing rule.
2. **`_abCd` returns `ab.cd` early when there is no hero (`!u`)**: a player who closed the hero picker, or `?unlocks=0`, has no `_hu`. The build must apply there too (it is an account choice): compute the base cd as today, then multiply, instead of returning early.
3. **Stacking with Slippery (trickster, x0.87)** at Lv 16 and B: 2.5 x 0.87 x 0.9 = 1.96 s (-35% vs the 3 s base), above the 1 s floor. Accepted: the node already trades class identity for that. If L disagrees, cap the product at 2.0 s.
4. **Duels**: `this.team && this.team.isPvp` => build ignored (multiplier 1, distance 1), the same line the arena uses for unlock nodes.
5. **Distance**: multiply `dk` by 4/3 for A before the existing clamp, then clamp the final value to 3 (so a mount cannot exceed 3x).
6. `_syncAbilities` must show the real cooldown ring (it reads `abilityCd`, which is set from `_abCd`; nothing else to change).

### Where the choice is stored (for SAVE-KEYS.md, additive)
In the Town save's `realm` sub-object (`pixeltown-save-v1.realm`), same place as `firstEndSeen`:
- `realm.build1` = `"a"` or `"b"`. Missing = default Dash. Never changes on its own; only the card or the Settings line writes it. `rmCleanSave`: keep only exactly `"a"`/`"b"` (anything else = absent), like the `firstEndSeen === 1` line. `rmMergeSave`: if both sides have it and differ, `mine` wins (a deliberate latest choice), otherwise take whichever exists. In the one Backup with the whole Town save.
- `realm.build1Ask` = integer 0..2, how many times the card was shown and closed with "Decide later". Missing = 0. `rmCleanSave` clamps to 0..2, merge takes the max. (This is the second key; the U spec needs it for "returns at most twice".)
Account-level (not per hero), like `save.level`, which is what `abilityUnlocked()` already reads. Old saves load unchanged; a save without either key behaves exactly as today.

### When the card shows
`_levelUp()` when `save.level === 5`, `build1` absent, `build1Ask < 2`, not in a team room or duel, and in the Realm world page (the card lives next to the ID-55 card in `realm-world.js`; the Mad Maze wave page gets only the Settings line). It waits until no hostile is within the danger radius and the "Level 5! Shield unlocked" banner (2 s) is gone, then follows the U spec (centre card, two options, "Decide later", Esc = Decide later, focus to the first option, 12 px text, stacks at 160x284). Timing data: bots reach Lv 5 at 64-99 s (cycle 12), so the card appears about a minute into the first run, long before the ID-55 ending card (8-10 min) and ID-53 hints (20 s idle). If an ID-53 hint is on screen the card waits for it to close. Suggested option text: "Quick dash: ready a little sooner" / "Long dash: goes further, ready a little later (solo play only)". The Settings / hero-panel line offers Normal / Quick / Long at any time (free).

### Tests S adds
1. Node unit on the real `_abCd` (arena stub like `cyc14-design-id64-economy`): default 3.00 / 2.50; b 2.70 / 2.25; a 3.45 / 2.875 (this one fails if the `Math.min(ab.cd, ...)` clamp is left in front of the multiplier); no-hero and `?unlocks=0` still get the build; guest floors at 2.4; duel ignores both; `this.team` set ignores a (distance and cooldown) but keeps b.
2. Browser (solo): seeded Lv 4 -> 5 shows the card once; choosing writes `realm.build1`, closes it, and a real Q press at Lv 5 starts a cooldown of 2.7 s (b) / 3.45 s (a) and, for a, moves 200 px in free ground; "Decide later" bumps `build1Ask` and shows the card again at Lv 6, never a third time; Esc = Decide later; focus lands on the first option and returns to the canvas.
3. Co-op / duel: a team-room hero with `build1 = a` dashes 150 px; a duel ignores both.
4. Old-save test: a save without the keys round-trips byte-identical through `rmCleanSave` / `rmMergeSave`; garbage `build1` (`"c"`, `1`, `{}`) is dropped; merge rule (mine wins when both set).
5. Layout: overlap sweep clean with the card open at 195x422 and 160x284; 390x844 and 1280x720 screenshots.
6. Economy guard: extend `tools/id64-build-sim.js` to read the new constants out of `realm.js` (one `RM_BUILD1` table) and fail if either option leaves +-20% of base; 0 DB attempts.
Order is unchanged: after ID-59/62/63 (all built), so S can start now.

## Item 2: three new small ideas (D proposes; L/U approve)

Added to `IDEAS.md` as `proposed` (ID-71..73).

| ID | Idea | Player value | Cost | Risk |
|---|---|---|---|---|
| ID-71 | Coach texts read the live key labels: build the desktop coach text from `RM_ABILITIES` / `MMInput` key names instead of fixed strings, plus a drift test that presses the keys the text names | A card can no longer name keys that do nothing (this cycle's bug: "Press 1, 2, 3 or 4" while the keys are Q E R F) | S, about 30 lines + 1 test | low: pure text; the shared tutorial module must not depend on realm.js (pass the labels in) |
| ID-72 | "Good first hero" tag on the hero picker: one 12 px line under Thicket Ranger ("Easy start: shoots from a distance") for a profile that has never picked a hero | The first screen of the Realm is 3 equal classes and "pick a class to begin"; one named default lowers choice stress for new players | S, text only on the existing card | low: 195x422 card height (card already scrolls); wording must not claim a class is "best" |
| ID-73 | Nexus pointer on the last coach step: while the tutorial is on its Nexus step, a small edge arrow (the existing portal-direction arrow style) points at the Nexus swirl | The last step used to name a Menu entry that does not exist; after the fix it names the swirl, but a hero 40 tiles away has no direction | S-M: needs the arrow element and an off-screen clamp | medium: HUD space at 195 px (use the compass slot rules), must not cover the sticks |

## Item 3: first 5 minutes in the Town, then the first Realm run (playtest by code + real browser)

What was run (all offline, `db.attempts() === 0`, 0 page errors):
- **Town, 390x844 touch, fresh profile** (`joinOffline`): Goal chip "Goal: Realm Gate" with the direction arrow, 7 visible controls (panel toggle, bag, goal close, Emotes, Tools, A, C); screenshot viewed: nothing overlaps, the gate chip is clear. Not a finding (covered by `town-first-ten` / `cyc3-ui-town-first-visit`).
- **Realm, fresh profile, 390x844**: opens on the hero picker ("Create your hero: pick a class to begin."), picking Thicket Ranger lands in play with coach step 1/6 ("Drag the left stick to walk around."), sticks, Q ability and the three locked slots (Lv 3 / 5 / 7) all visible and clear of each other (screenshots `img/cyc15-design-realm2-m-pick-0.jpg`). Closing the picker without a choice also works (base hero, coach visible).
- **Coach steps read against the code** (`shared/mm-tutorial.js` vs `realm.js` / `realm-world.js`): steps 1-3 and the touch text of step 4 are right. Two real bugs found, both fixed:
  1. **Desktop step 4 named keys that do nothing.** It said "Press 1, 2, 3 or 4 to use an ability"; the Realm binds Q E R F (`RM_ABILITIES`) and has no digit handler. A keyboard first-timer who followed the card pressed 1-4 and nothing happened (verified: all cooldowns stay 0). The pinned unit test asserted the wrong text (`/1, 2, 3/`).
  2. **Step 6 (Nexus) sent players to a menu entry that does not exist.** "Tap the Menu button, then Nexus" / "Press Esc, then choose Nexus": Esc opens the pause menu, whose buttons are Resume, Pick hero, Hero stats, Restart run, Leave, Sound, Reduce motion, Aim assist, More settings (no Nexus). The Nexus opens only from the "Visit the Nexus (Enter)" button when the hero stands next to the swirl at the spawn. The last of six steps (the one that pays the Hearty Charm gift) was a dead end for anyone who followed it literally.
- **Fix** (`game/shared/mm-tutorial.js`, text only): step 4 fine text "Press Q, E, R or F to use an ability."; step 6 coarse "Go back to the Nexus swirl, then tap Visit the Nexus." and fine "Go back to the Nexus swirl, then press Enter." No save key, no logic change.
- **Test** `game/tests/cyc15-design-coach-keys.test.js` (registered, browser / full): at 1280x720 the card names Q/E/R/F and not 1-4, keys 1-4 cast nothing, Q casts and advances the card to the portal step; the Nexus card has no Menu/Esc wording, the pause menu really has no Nexus button, and standing at the swirl (position set through `__mm`) the "Visit the Nexus" button appears and clicking it finishes the tutorial; at 390x844 the touch text is unchanged (no key named). Before the fix (shared/mm-tutorial.js restored from HEAD, test run again): 3 FAIL of 14 checks (card names Q/E/R/F, card does not name digits, Nexus card has no Menu/Esc wording); after: ALL PASSED (14 checks). `shared-mm-tutorial-realm.test.js` pin changed from `/1, 2, 3/` to `/Q, E, R/` and `!/1, 2, 3/` (the old pin asserted the bug; not a weakening). Other tutorial tests re-run, all ALL PASSED: `realm-tutorial`, `beta-g15-tutorial-first-minute`, `ftue-ft2`, `realm-polish3`.
- Screenshots: `img/cyc15-design-coach-keys-1280x720.jpg`, `img/cyc15-design-coach-keys-390x844.jpg`, `img/cyc15-design-coach-nexus-195x422.jpg` (viewed).

## Unresolved / not run
- **195x422 coach card is tall (pre-existing, not changed)**: measured card boxes (width 91 px, left 8): move 130 px, shoot 146, bag 292 (69% of the 422 px screen, top at 4), ability 227, portal 162, nexus 195. The card is not clipped, but the bag step (text plus the "A bag is close by" line) covers most of the left column, and in the Nexus screenshot the compass sits over its first line. Out of scope (`realm-tutorial.js` `keepClear`); U should decide on a shorter bag-step text or a wider card at <= 300 px. My new Nexus text (53 chars) is not longer than the old one (50).
- Not walked: the Town gate menu click path into the Realm (covered by `town-first-ten`); a real human run; the full stamp (coordinator). Not checked on a real phone.
- The cycle 14 sim note says "host moves a guest 160 px"; that clamp is duels only (PvE co-op has none). I left that test and tool text alone (the conclusion, ignore the build in duels, is unchanged); S/L may reword it when building ID-64.
- Branch name: `git branch -m` failed (shared git dir logs), so `cyc15-design` was made with `git checkout -b`.
