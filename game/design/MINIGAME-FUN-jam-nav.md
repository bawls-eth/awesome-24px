# Minigame fun: Jam Assist/Practice, nav tab fix, Lantern access (branch mg-jam-nav)

1. Rhythm games (Guitar Hero practice, osu! mods, Beat Saber "No Fail") keep assist and practice scores apart from the real board; we do the same with a new key `pixeltown-jam-assist-v1`.
2. Assist folds D->F and K->J so one thumb per half (or one thumb sliding) can play; folded notes are thinned to >= 180 ms per lane so doubles never pile up.
3. Outer pads still work in Assist and hit their inner lane, so muscle memory from 4-lane play is not punished.
4. Assist runs never touch stars, S-rank, unlocks, plays, ghosts or concert records; the results card says so in plain words.
5. Section Practice already had A-B bar loops at 50/75/100%; it now keeps a per-section best (hits per loop pass), labelled "Practice", apart from song bests.
6. Both are off by default; the Assist toggle is a 44 px aria-pressed button on the song menu.
7. Nav: legacy Hub/Town links clipped to 1 px by the shared Menu now get tabindex=-1 + aria-hidden, only while MMNav is mounted; the gate allow-list is now empty.
8. Lantern now loads mm-side-access: --ui-scale scales the root font, "flashes off" sets reduced motion for CSS and the canvas loops.
9. Lantern status lines carry a tick / warning mark, so ok vs error is not colour only; smallest text is 12 px.
10. Lantern Tab order starts at the Menu button (moved first in the DOM), then the page top to bottom with no 1 px ghost stops.
