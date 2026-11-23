# Echo Garden bug bash (lane echo, branch bb-echo)

Fixed (tests: game/tests/echo-bugbash.test.js)
1. Share code did not round trip: ?seed=Ab-c_9 showed code ABC9 which sang a different tune. Seeds are now canonical lower-case A-Z0-9.
2. Landscape phone: board was 560 px tall, page scrolled (990 px in 390). Now board + HUD sit side by side and fit.
3. 150% text ignored (HUD stayed 20 px, 4 columns overflowed). Fonts use --ui-scale, HUD wraps (auto-fit).
4. No MMChip cues: flowers now sing bloom_c/d/e/g, wrong = error, clean timed round = perfect (old sine only without MMChip).
5. No MMInput: WASD/arrows + Space/Enter via MMInput.actionOf; Ctrl/Meta/Alt+digit and right click no longer tap.
6. No Settings entry: shared MMSettings mounted, Menu sheet Settings opens it, live change re-reads sound/motion/low-gfx.
7. Leaves were text only: pixel leaf icons (green leaf vs grey stalk) drawn on the garden.

Checked, no bug: hostile saves (6 shapes), rapid taps, resize/rotate, tab visibility, 2-minute cap, low-gfx particle cap, 0 DB requests.

Open / Elsewhere
- none found in the lane. At 150% text on a 390 px phone the page scrolls ~1000 px (acceptable, no horizontal scroll).
