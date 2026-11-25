# Cycle 11: G (Graphics + Pixel Art)

Branch `cyc11-art` (worktree `/tmp/wt-cyc11-art`, cut from `claude/animal-crossing-game-7z3roh` bd92da2), static server port 9113.
Nothing pushed. Firebase never touched (offlineStub / blockDb, `db.attempts() === 0` in every run). No save changes.

## 1. Codex review (git fetch, new `codex/*` commits)
- **New since cycle 10:** only `codex/t17-hawk` 1c9f2b6 (hawk v2). `codex/t10-garden-bugs` 088aa6c and `codex/t13-wetland-fauna` 6da71ca are
  unchanged since 2026-11-23 (already staged in the repo); nothing new to review there.
- **T17 hawk v2: ACCEPTED, merged provisional, wired.**
  - Check run: my own decode of all 6 strips / 14 frames gave an exact 4x grid, alpha 0/255 only, every frame distinct, no edge contact and 11-13 colours.
    Alpha-mask IoU vs the owl per frame: idle 0.48 / 0.50 (cycle 8: 0.76), idle_down 0.40 (0.86), move 0.49 / 0.39 / 0.53 / 0.48 (f3 was 0.83),
    move_down 0.50 / 0.69 / 0.65 / 0.63, caught 0.49, caught_down 0.40.
  - Repo audit (`game/tools/art-audit/run.js`, unmodified) on the merged tree: 0 blocker / 0 needs-redo for t17-hawk (6 "unref" nits before wiring).
    The 2 needs-redo rows in the whole audit are the existing b12r rocks, which predate this cycle.
  - All four cycle 8 redo points are fixed: a raptor silhouette with its own palette, the down-stroke wing below the belly, airborne flight frames,
    and eyelid lines on the caught pose.
  - Contact sheets: `img/cyc11-art-codex-t17-hawk-v2.jpg` (hawk | owl on 3 backgrounds at 3x) and `img/cyc11-art-codex-t17-hawk-v2-1x.jpg`.
  - INDEX entry resolved by hand: Codex's branch was cut before the cycle 7-10 INDEX notes, so I kept ours and appended the hawk.
  - Optional nits, with frame numbers, are in `CODEX-REMAKE-QUEUE.md` (cycle 11 UPDATE): the move_down f2-f4 wings still resemble the owl's
    (IoU 0.63-0.69), and the idle_down f1-f2 / caught_down brow and eyes merge after the 2x2 bake. A board note points Codex to them.

## 2. Town fauna code art (`game/shared/mm-town-fauna.js`, `?ffstrips=0` fallback kept)
- **Hawk** wired like the owl: 48 native baked at half size to a 24 px cell; idle / move / caught, right + down.
- **Hummingbird (14 px):** a profile hovering with a tilted body, ruby throat, needle bill and pale blurred wings (2 idle + 2 dart frames).
- **Garden snail (14 px):** a spiral shell, cream foot and eye stalks. The stalks dip in idle f2 and the foot stretches in move f2.
- **Common green darner (16 px):** a blue-green eye, green thorax, blue banded abdomen and two glassy wing pairs (flat / raised / down-beat).
- **Robin: true front view.** `bakeCode` now takes optional `idle_down` / `move_down` maps, and species without them keep reusing the profile.
  The robin has 2 idle front frames, 2 flapping front frames, and `caught_down` is the front view.
- Squirrel front view: **not done.** It was not cheap at 20 px with the bushy tail, so it stays on the profile and I left it for T14.
- `main.js` (1 line): the code snail faces right like every code map, so `FF_FACES_LEFT` no longer inverts strip / code sprites.
  Without this the code snail walked backwards.
- Checks run:
  - New `tests/cyc11-art-town-fauna.test.js`: 9 of 13 checks FAIL with the source changes stashed, 13/13 PASS after.
  - `cyc9-art-town-fauna-strips` 16/16 and `cyc10-art-town-insects-museum` 12/12 PASS.
  - `art-integration` PASS (the hawk carries its `class` key) and `run-all-tiers` PASS.
- Test edits, said plainly: those two older tests used the snail as their "untouched SVG" control. The snail is now code art, so the control
  moved to the snake (still SVG), and the Museum grid count went from 8 to 12 thumbnails (10 locked). Both are the real new counts, not a
  loosened check. In my own new test the body-size threshold for code bugs is area-based (>= 60 opaque px, >= 7 tall), because a perched
  dragonfly is 16 x 7.
- Screenshots: `img/cyc11-art-code-fauna-sheet.jpg` (6x + 2x maps) and `img/cyc11-art-town-fauna-{desktop,phone}.jpg` (1280x720 / 390x844, every new
  animal placed next to the player, right + down views; 0 page errors).

## 3. Realm font consistency
- Audit run: computed `font-family` of every visible text element in the live Realm (world mode) at 1280x720, with the HUD shown, the backpack
  open and the shop open, plus a `fillText` font spy on the canvas.
- Audit result: the shop (fixed in cycle 10), backpack, HP / XP, abilities and buttons were already on `--px-font`. Still on system-ui were:
  - the **zone strip `#rw-zone`** (zone name, danger, coords, raid timer)
  - the **Daily** button
  - the world prompts and toasts (`#rw-portal`, `#rw-site`, `#rw-event-hint`, `#rw-rush`, `#mm-deep`, `#rw-jhint`, `#mm-coach`, `.mm-toast`, `.mm-sheet`)
  - the **Nexus panel** and lair prompt (CSS injected from realm-world.js)
  - 3 inline styles in realm.js (backpack stats toggle, relic book toggle, chase toast)
  - on the canvas, 5 world labels (e.g. "Nexus", boss names), co-op names and the pip "+N". These used system-ui while the portal and NPC labels
    use the mono stack.
- Fix:
  - a font-family-only rule in `realm-8bit.css`, scoped to `body.world-mode` / `body.dungeon-mode` so classic Mad Maze is unchanged
  - the injected and inline strings now use `var(--px-font, monospace)`
  - the canvas labels use the existing mono stack
  - left out on purpose: the combat text `_txtFont` stays `bold 14px system-ui` because `realm-access2.test.js` pins it exactly (see proposals)
- Checks run:
  - New `tests/cyc11-art-realm-fonts.test.js` at 1280x720 and 390x844: 10 checks FAIL with the 3 source files stashed, 15/15 PASS after.
  - Regressions: `cyc10-ui` (zone strip clipping at 195 / 240 px), `realm-access2` (zone font size, combat font) and `realm-phone-layout` all PASS.
- Screenshots: `img/cyc11-art-realm-hud-{desktop,phone}.jpg` and `img/cyc11-art-realm-fonts-{desktop,phone}.jpg` (shop open).
- Side effect: on phones the zone strip, which was already one ellipsised line, cuts a few characters earlier because mono is wider
  ("Shore · Safe-ish ⚑…").

## 4. Mooncats / punkrocks: are they static? (for L)
- Check run: in the live Town (default art and `?legacyart=1`), I sampled every `punkrocks` / `mooncats` sprite, waited 3 s and sampled again.
- **Default art:** 4 `punkrocks` sprites and 4 `mooncats` sprites (3 pond statues plus the Founder's statue). Over 3 s none moved, none changed frame,
  none played an anim and none had a tween. **None of them has `_cstill`.**
- **`?legacyart=1`:** the 3 pond cats tween left and right, as intended.
- **For L:** these are static decor in default art and are measured on every cull pass. Suggested 3 lines (not done here; it's L's cull code):
  - `drawPunkRocks` (main.js ~10121): `._cstill = 1`, always static.
  - `drawPondCats` statue branch (main.js ~7663, non-legacy only) and the Founder's statue (~8833): `statue._cstill = 1`.
  - Leave the legacy-art pond cats unflagged.

## Commits
- 2f7f36c: hawk merge + wiring, code hummingbird / snail / dragonfly, robin front, snail flip, tests
- 35d560e: Realm font consistency + test
- (this report, queue and board notes: next commit)

## Unresolved / proposals
- Combat text (`_txtFont`, floating damage / level-up) is the only system-ui text left in the Realm. Proposal for U: a mono or pixel combat font
  with the black outline kept, plus updating the realm-access2 pin in the same change. This needs a readability check in heavy fights.
- `#mm-nav-root` "Menu" (the shared nav, all games) uses system-ui. It's U's component and not Realm-specific, so I did not change it.
- Squirrel front view (see 2), and the hawk nits for Codex (see 1).
- The phone zone strip ellipsises a little earlier (see 3). If U wants the full danger word back at 390 px, wrapping the strip to two lines
  works at that size.
