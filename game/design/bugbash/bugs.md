# Bug Safari bug bash (lane: bugs)

Fixed (tests in game/tests/bugs-bb.test.js)
- Field taller than the window at 1280x720 and in phone landscape (page scroll mid-run, controls below the fold). Field now fits the height; landscape controls float in the side gutters.
- Summary said "Tied your best!" for a 0-point run with no best.
- Enter on a focused Replay seed started a new random run (keydown handler also fired). Now MMMiniKit owns R / Enter.
- Mashing Space at the timer end clicked the auto-focused Play again and skipped the result (keyboard clicks are ignored for 450 ms).
- Keyboard-only players on the first run: the how-to card froze time until clicked. Any control key / tap now dismisses it.
- Glade bugs (firefly, glowmoth) were missing from the summary counts.
- Added: MMChip cues (catch, combo2..8, miss, perfect, level_up, select/back/ui_open), MMInput (Enter swings, E sneaks, Esc/P pause), pause on Menu / Settings / hidden tab, Settings entry (menu + nav), minikit result card, low-gfx re-read on Settings change.

Open
- Replay seed repeats bug layout, start and modifier, but wandering depends on frame-time chunking (rng draws per sub-step), so paths differ. Low. bugs.js wander().
- Shake uses Math.random in render (page file, not shared). Cosmetic.
- Not done: BG5 species behaviours / tap assist.
