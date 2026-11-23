# Deepdelve bug bash (lane DEEPDELVE, branch bb-deepdelve)

## Fixed (tests in game/tests/deepdelve-bugbash.test.js)
- Esc did nothing when no panel was open; Esc/P now close a panel first, else open the Menu sheet (MMInput 'menu' alias).
- No Settings entry in the Menu sheet; added MMSettings mount (text size, reduce motion, low graphics, sound apply live).
- Keyboard-only play was impossible (mine/place/look needed a mouse): Enter = jump, Shift/E = place, F = mine, J/L/I/K = look.
- Ctrl/Meta/Alt+key (e.g. Ctrl+C) toggled panels; keys typed in text fields were read. Both ignored now.
- Window blur / tab hidden left keys held (player walked or mined on alone). Released now.
- Dive summary opened with the pointer still locked (buttons unreachable by mouse). Now exits pointer lock.
- Hostile saved position (outside the world / inside rock) is clamped or falls back to spawn.
- Touch players saw "Craft (C)", "Goals (G)", "Open Craft (C)", "Space up, Shift down". Touch wording is key-free now.
- Landscape phone at 150% text: HUD covered the 190 px view. HUD trimmed to essentials under 480 px height.

## Open
- HUD says "Depth 5" while standing on the surface (depth is absolute from y=0, dive depth is relative). Low severity; deepdelve.js depthNow/hud-depth.
- Dives, depth medals and personal bests count while flying in the in-world creative mode (meta.mode creative in the survival world). Medium-low; checkGoals/tickRun should skip when flying().
- Dive result card does not use shared/mm-minikit.js (own #run-panel). Not wired.
- Not exercised this session: wyrm fight, fps on software rendering beyond existing deepdelve-fps/perf tests, ?px=0 visual check, low-gfx visual check.
