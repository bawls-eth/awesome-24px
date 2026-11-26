# Cycle 12: U (UI/UX), branch `cyc12-ui`

- **Worktree:** `.claude/worktrees/agent-a374d2c3c45655907`, branch `cyc12-ui` cut from 0207dda (cycle 11 stamp).
- **Server:** static server on port 9122. The before-runs used a `git archive` copy of 0207dda served on the same port, briefly.
- **Browsers and tests:** browsers ran only through `/tmp/bt.sh`, and only targeted tests were run.
- **Not touched:** nothing was pushed. firebase-config.js and net.js are unchanged. There is no save change.
- **Cache versions:** `style.css?v=` and `main.js?v=` in `index.html` are NOT bumped (shared lines; S's branch bumps both to `20261126c12s`). The coordinator should bump once after merging. `isles.css` has no version query.

## 1. Isles action column vs HUD at 160x284 (`games/isles/isles.css`, new `max-width: 189px` portrait block)
**Measured on 0207dda at 160x284:**
- HUD: y 76-159.
- Action column (Decor / Sail / Soothe): y 42-178, over the HUD, the Pack button (Pack under Sail 58x34) and the Map toggle (Decor under Map).
- 88 px stick (x 8-96) and 76 px Attack (x 76-152): they covered each other.
- Compact how-to column (y 166-264): on the stick, with Soothe under Tips.

**Fix, under 190 px wide:**
- The HUD sits right under the top row (y 60-143).
- The action buttons form ONE 44 px row (y 156-200) between the HUD and the bottom controls. The row scrolls sideways when it cannot show them all. Their icons are hidden at this size; the label stays, at 12 px.
- The stick is 64 px (x 8-72) and Attack is 56 px (x 96-152).
- The how-to card is a row (Tips, ✖) at the left end of the action row. While it is up, the action row starts right of it.
- 195 px and wider are unchanged (same rects measured before and after).

**Sweep coverage (`a11y-viewport-sweep.test.js`):** the OVERLAP rule (controls covering each other) now also runs in the 160x284 viewport pass. Before, it only ran in the text-200 pass at 195 px; at 160 px only the Menu check ran, which is why Isles passed.
- **Realm World is parked** from this check (opt in with `OVERLAP160_ALL=1`). Turning it on found 8 Realm HUD overlaps at 160x284 that I did not fix this cycle:
  - ability buttons under the board / menu buttons;
  - gear / daily / leave / minimap row.
- **Note for L** (owns the sweep coverage): every other page (15) passes the new check at 160x284.

## 2. Town Museum on phones (`style.css` cyc12-ui block, `main.js` `showMuseumWing`)
**Measured on 0207dda:**
- Tabs were 29 px tall.
- After scrolling the card, the ✕ was at y -366 (195x422) and y -340 (390x844).
- The corner Menu `#mm-nav-btn` drew over the card's top-left corner and the Fossils tab.
- **Root cause of the Menu overlap:** `shared/mm-nav.css` loads after `style.css`, so its `:root { --mm-nav-z: 9000 }` beats the Town's intended `--mm-nav-z: 19`. The button sits above every Town overlay, not just the Museum.

**Fix, at <= 480 px:**
- Tabs are `min-height: 44px`. The bar is 52 px tall at 195 and 60 px at 390.
- The ✕ is `position: sticky` (6 px from the card's top edge, right end, z 3), inside the stuck tab bar's row.
- The bar's scroll box ends 4 px left of the ✕, and a box-shadow carries the bar colour behind the ✕, so a scrolled tab never slides under it.
- The corner Menu is `visibility: hidden` while `#museum-overlay` is open (it is an `aria-modal` dialog). Esc / ✕ close it and the Menu comes back.
- **Extra:** `showMuseumWing` scrolls the active wing's tab into view in the one-row bar (the Wild Fauna tab was off the right end). If the tab is wider than the bar, its start is shown.

**Changed cycle-11 assertion:** `cyc11-ui.test.js` asserted the 195 px bar is <= 40 px (29 px tabs). The bar has to grow with 44 px tabs, so the check is now <= 52 px (44 + 2 x 4 px padding). The flush-top and scroll-padding checks are unchanged. This is a spec change requested for this cycle, not a loosening; the reason is in the test comment.

## 3. The black ~190x265 block on the phone Town (`style.css`, `max-width: 720px`)
**Found:** it comes from the What's-new banner. On phones the banner is a scroller (`max-height: 32vh; overflow-y: auto`) with an opaque background, so Chromium composites its scrolling.
- Over the WebGL game canvas, that layer comes out as a black box **mirrored top-to-bottom**: y = 844 - 16 - 270 = 558..825 (measured 561-825), at the banner's x and width.
- **Proof:**
  - `overflow-y: hidden` on the banner removes the block.
  - Any opaque scroller over the canvas does the same: a test div at y 300 to 400 gave a block at y 444 to 544.
  - Changing box-shadow, transform, `contain: paint`, `will-change`, or GPU flags (`--disable-gpu`, swiftshader, `--disable-gpu-compositing`) did not help.
- **What I could and could not show:**
  - The block is in full-viewport screenshots AND in the compositor's own screencast frames (CDP `Page.startScreencast`). So it is what headless Chromium's compositor draws, not just a capture step.
  - A clipped screenshot of only that region did NOT show it.
  - I cannot say whether a real phone GPU draws it. Not tested on a device.
- **Fix:** a 99 % opaque background on the banner (`color-mix(in srgb, var(--ac-sky-tint) 99%, transparent)`). That keeps it off composited scrolling, and the block is gone. The look is unchanged by eye.

## 4. Review: ID-61 / ID-56 / ID-59 vs S's builds
**ID-61** (cyc12-systems f53e001, read-only review of the diff and S's 195x422 screenshot): it matches the spec.
- `lastVisitDate` is read before the ID-09 rewrite.
- The text gives the level only, with no zone; the fallback text is right.
- `#town-welcome` has role=status and aria-live=polite, a 44 px ✕, and Esc captured.
- It waits for the What's-new banner, hides after 10 s or 3 s after the first move, and uses no new key.

Nits for S:
- **(a)** At 195x422 the line's lower right corner seems to sit on the top edge of the Emotes button (screenshot). The spec names A/C, the Menu, the bag bar and the stick, but Emotes is a control too. It should be checked with the sweep's OVERLAP rule.
- **(b)** It has the round, soft look, while the What's-new banner gets the 8-bit hard edge (`border-radius: 0 !important`, 3 px ink border, `--tb-shadow`). Add `#town-welcome` to those two selector lists so the look matches.
- **(c)** Both branches append to the end of `style.css`, which is a trivial merge conflict.

**ID-56 and ID-59:** not built on `cyc12-systems` when this was written (only the ID-61 commit), so they were not reviewed.

## Checks actually run (all through /tmp/bt.sh, port 9122)
| Check | Result |
|---|---|
| New `game/tests/cyc12-ui.test.js`, registered browser/full, 300 s. It covers:<ul><li>Isles at 160x284 and 195x422: sweep OVERLAP, row vs HUD, 44 px, a real tap on the how-to close and then all buttons on screen</li><li>Museum at 195x422 and 390x844: 44 px tabs, ✕ on screen and on top after scrolling, bar ends left of the ✕, active tab in view, Menu hidden, then a real tap on the scrolled ✕ closes it and the Menu is back</li><li>Banner at 390x844: pixel check of the mirrored region on a full-viewport capture</li><li>Literal 0 DB attempts</li></ul> | **0207dda: 17 FAILED** (all Isles-160 and Museum target checks). On the first base run the banner check passed, because it used a clipped capture. I changed it to crop a full-viewport capture, and then on 0207dda it **FAILED (86 % near-black)**. **Branch: ALL PASSED** (after one fix: the 132 px Wild Fauna tab is wider than the 111 px bar at 195, so its start is what must show). |
| `a11y-viewport-sweep` `VPS=160x284`, all 16 pages, new overlap check | With Realm World included: 8 Realm offenders (now parked, see 1). Isles: 0. Isles on 0207dda CSS with the new check: **5 FAILED** (4 overlaps). |
| `a11y-viewport-sweep` `PAGES=town,isles` (all 9 viewports + preference passes, new check on) | ALL PASSED, 0 offenders, 146 s |
| `cyc11-ui` (with the updated bar assertion) | ALL PASSED |
| `cyc10-art-town-insects-museum`, `phone-overlays`, `town-first-ten`, `beta-w18-isles-howto` | ALL PASSED (each) |

Screenshots in `game/design/beta/img/` (real browser, final code):
- `cyc12-ui-isles-160x284{,-howto}.jpg`
- `cyc12-ui-museum-{195x422,390x844,1280x720}.jpg`
- `cyc12-ui-town-banner-{390x844,1280x720}.jpg`

## Unresolved
- **Realm World HUD at 160x284:** 8 overlaps, parked in the sweep (see 1).
- **Museum ✕ on desktop:** at 1280x720 it still scrolls away (y -244 after a scroll; Esc and the wheel work). The sticky rule is phone-only because the desktop tab bar wraps and sticks 20 px lower. Next: a desktop variant.
- **Corner Menu z-index:** the Menu still sits above the Town's other overlays (map, mailbox, etc.). Root cause is the `--mm-nav-z` load-order bug. I only hid it for the Museum. Fixing the variable (`html:root { --mm-nav-z: 19 }`) would affect every overlay and needs a full Town sweep.
- **Isles hint at 160 and 195:** the calm hint line sits over the HUD after the how-to closes (y 53-108 at 160, y 135-174 at 195). It is pointer-events none and was there before.
- **Isles at 160 with the how-to up:** the action row has about 44 px, so it shows one button and scrolls. Closing the how-to (one tap) shows all of them.
- **Black block:** not checked on a real phone. Other opaque scrollers over the Town canvas may draw the same block in headless captures. Only the banner was fixed.

## Proposals
1. L: fix the `--mm-nav-z` load order once for the Town and run the full Town sweep. Then drop the Museum-only rule.
2. Realm owner: the Realm World HUD at 160x284, then remove the sweep's Realm park.
3. S: ID-61 nits (a)-(c). Then ID-56 and ID-59 per the cycle 11 specs.
