# Cycle 14: L Lead Developer

Branch `cyc14-lead` (cut from 445fd49, with `cyc14-art` 03c284d merged in at the coordinator's request to measure the cull with G's 15 new sprites). Not pushed. Static server port 9101, browsers only through `/tmp/bt.sh`, targeted tests only.

## 1. Animal hello holds its save write until the player walks

- **Before:** `animalHelloGreet` wrote `animalHello` the moment an animal came within 160 px, with no input from the player.
- **Now (`main.js`):** the hello (heart, line, in-memory mask) is as before, but it is only marked `_animalHelloUnsaved`. `flushAnimalHello()` writes it (same merged OR write) from `updateLocalMovement` when there is real walk input (keys, joystick, tilt, gamepad). E / A does not write it, nor does any timer.
- A refused write stays unsaved and is retried on a later step, at most once every 2 s.
- **Behaviour change to know:** a hello that is never followed by a step is not kept, so that species says hello again next visit. No `pagehide` flush, on purpose: a reload would then write into a save a test had just put back.
- The `noHello` carve-outs in `town-isles-sign` and `beta-retest-b14` are untouched and still pass.
- `cyc13-s-animal-hello.test.js` read the save right after a teleport with no input. It now takes one real 120 ms arrow-key step before the same save assertions (and before the reload check). No assertion was removed or loosened.
- **New test `cyc14-lead-animal-hello-hold.test.js`:** 15 checks. On the old code 5 fail (save changed with no input; hello kept without a step); on the new code all pass. It also covers refused storage, another tab's bit kept by the merge, and "a further step writes nothing".

## 2. Town cull headroom

- **Measured before:** 212 of 978 objects per pass on the cycle 13 tip (cap 215). With `cyc14-art` merged and no fix: **227** (my test's count on old `main.js`; the coordinator saw 228).
- **Change A (`main.js` `cullOffscreen`):** trees, tree fruit and specimens that never walk declare `_cfix`. Their settled box is kept for 64 passes instead of 8. 194 images (58 trees, 20 fruit, 116 specimens).
- **Change B (`refreshFloraFaunaNear`), added after the coordinator's note:** an animal drawn as an Image (walks / flies / swims, not a strip Sprite) declares `_cfix` only while it is away from the camera and its last step has ended. When the camera comes within 160 px of seeing it, the 400 ms specimen sweep takes the declaration back and calls `uncull()`. About 100 more images.
- `uncull()`, hiding, and a forced pass still read any declared image at once. No threshold was changed in any existing test.
- **Measured after, with `cyc14-art` merged: 191, 193 and 195** on three runs (978 objects, 182 sprites, cap 215). A alone gave 202 to 206 with the art merge and 191 without it.
- **New test `cyc14-lead-town-cull-rooted.test.js`:** 13 checks. On old code 8 of the then 12 failed (count 227, nothing declared). It checks the count (under 20.5% of the objects), that no Sprite and no near or mid-step animal is declared, the exact cull rule for every declared image at 4 camera spots, the escape hatches, and that a resting animal is drawn within 2 frames when the camera jumps onto it.

**Limit the coordinator asked about.** The pin test has a cap (22% of objects, 215) and a floor (`measured >= sprites`); `cyc4-town-cull-alloc` has the same floor; `cyc10-lead-town-cull-sprites` [1] requires every visible walking sprite to be measured on every pass. So far-off strip Sprites cannot be settled or skipped without editing those tests. I did not do it; all of the headroom here comes from non-sprites, which those tests allow.

- Window now: floor 182, measured about 193, cap 215.
- Each species G converts from SVG to a strip adds 5 sprites: about +4.5 measured and +5 to the floor.
- Roughly 20 to 25 more sprites puts measured back at the cap. About 9 more measures per pass could still be won from non-sprites (55 settled labels, 24 weeds); after that nothing.
- Past about 215 sprites the floor itself is above the cap, so the pin test cannot pass whatever the code does. That needs an owner decision on the test, not a code fix.

## 3. Small screens

- **Isles toast, 160x284, how-to card up (`isles.css`):** the toast was an 88 px column at y 222. The medal line ended at y 281 of 284; a journal line ended at y 328, off the screen. Up to 300 px tall it is now anchored to the bottom edge at full width and grows upward: medal line y 237-280, journal line y 221-280. It lies over the stick and Attack for its few seconds (it takes no taps); it is clear of the card, HUD and action row.
- **Museum right cue, 195 px (`style.css`):** the 24 px cue sat at x 102-126 over the first tab's count at x 100-121. Up to 260 px wide the bar starts 2 px from its edge, a tab is tighter before its count, and the cue is 18 px (the minimum `cyc13-ui` asserts). Count now ends at x 105, cue starts at 108. 390x844 is unchanged.
- **New test `cyc14-lead-small-screens.test.js`:** on old code 6 fail (one of those, 390x844 "journal line", was my test catching a fading toast, a test timing fault I then fixed by measuring in one step); on new code all pass.

## Checks actually run

All through `/tmp/bt.sh` against port 9101, on the branch tip with `cyc14-art` merged unless noted.

| Test | Result |
|---|---|
| `cyc14-lead-animal-hello-hold` | pass (old code: 5 fail) |
| `cyc14-lead-town-cull-rooted` | pass, 195.1 measured (old code: 8 fail, 227.1) |
| `cyc14-lead-small-screens` | pass (old code: 6 fail) |
| `cyc9-lead-town-cull-pin` (untouched) | pass, 191 / 193 measured on the final code |
| `cyc13-s-animal-hello` (one walk step added) | pass |
| `cyc13-lead-town-cull-far`, `cyc10-lead-town-cull-sprites`, `cyc12-lead-town-still-statues` | pass |
| `cyc4-town-cull-alloc` | failed once ("a pass about every 4th frame": 78 passes, limit 77), passed on rerun |
| `cyc5-ui-isles-compact` | failed once (195x422: toast not visible when measured), passed on rerun |
| `cyc14-art-forest-insects`, `cyc10-art-town-insects-museum` | pass |
| `town-isles-sign`, `beta-retest-b14`, `cyc13-ui`, `cyc12-lead-museum-panel` | pass (run before change B; B does not touch what they cover) |

The two single failures were not reproduced and I did not find their cause. The `cyc5` one is at 195x422, where my Isles CSS (max-height 300 px) does not apply; I saw the same "toast already fading" timing in my own test and removed it there. The `cyc4` one is a pass-count timing check.

Not run: the full suite (coordinator's stamp).

Screenshots: `img/cyc14-lead-hello-held-1280x720.jpg`, `img/cyc14-lead-isles-toast-{160x284-game,160x284-journal,195x422-journal,390x844-journal}.jpg`, `img/cyc14-lead-museum-cue-{195x422,390x844}.jpg`.

## Unresolved

- **Isles 195x422:** a 4-line journal toast (y 222-296) reaches the Soothe button (y 272). Found by my new test, printed there as INFO, not fixed (the column layout is cyc5-ui's; the action column grows with the number of buttons, so a CSS-only fix needs a design choice).
- **Isles 160x284 without the how-to card:** the toast sits at 22% (about y 62), on the HUD. Not checked further and not changed.
- **Museum 195 px:** the count clears the cue by 3 px at scroll start only. Scrolled part-way, the cue still lies on whatever tab is under it.
- **Cull:** see the limit above.
- No real-device play.

## Proposals

1. Decide the pin test's future before G converts the last SVG animals (floor meets cap at about 215 sprites).
2. Declare the 55 settled world labels `_cfix` after checking none is moved (about 6 measures per pass).
3. Remove the two `noHello` carve-outs in a later cycle once this has been through a stamp: with the hold in place they should no longer be needed, but I left them as instructed.
