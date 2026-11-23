# Bug bash: Lantern Dash (bb-dash)

Fixed
- Ghost replay desynced when a release and the next press shared a frame, or a tap lasted under one frame (recorded as [f,f+1]; replayed press-before-release). Now exact release frames and ordered press/release events; old pv:2 ghosts still replay as before.
- No pause: lost key-up when the window blurred / tab hid left the jump held. Now blur, hidden tab, pagehide, Menu open, Settings open and P pause; the resuming tap is not a jump.
- Enter / MMInput primary and up aliases; shared Settings panel mounted (sound, music, low-gfx, reduce motion apply live); MMChip cues (jump, land, coin, perfect, death, music minigame/results).
- 150% text: HUD numbers ignored the text size (arcade sheet override) and the how-to card overlay covered the scene and key hints; now in flow and scaled. Landscape phone: canvas height capped.

Checked, no bug: course feasibility (exhaustive takeoff search clears the first 420 obstacles on 6 seeds), seeds validated, hostile saves, 40 km course generation cost, focused-button Space does not double jump in Chromium.

Open / elsewhere
- Course generation uses distance-based speed (140+0.006x) while the run speed is time-based, so late spacing is tighter in real time than the generator assumes (still feasible in the search, but little margin at 330 px/s). Low severity; changing it invalidates old seeds and ghosts (needs a PV bump).
- Fireflies are scanned from index 0 every tick/draw (cheap, grows slowly with distance).
