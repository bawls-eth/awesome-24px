# Cycle 5, role G (Graphics + Pixel Art)

Branch `cyc5-art` (cut from 4b6d34e, the integration tip), own server port 9503, every browser run through /tmp/bt.sh, Firebase blocked
(blockDb) in every context with 0 DB attempts. Nothing pushed.

## 1. b12-r3-01 (P2) hero pick pop-in: FIXED (both halves I could measure)
What I measured before the fix (rAF sampler, fresh profile, `?heropick=1`, 390x844, every art request delayed 400 ms):
the create grid was shown with 14 letter swatches for ~450 ms before the portraits popped in, and after the pick the world drew the
code orb for ~1 s before the ranger sprite.

Change (`game/games/mad-maze/mad-maze.js`, picker only):
- Every class portrait is fetched **and decoded** as the page boots (`portraitP`, one cache). A card built after that shows its portrait
  in the same frame (no swatch frame). A portrait that 404s keeps the swatch without a new request.
- The first picker open keeps the card invisible (`visibility: hidden`, `aria-busy`) until the portraits are decoded, capped at 1200 ms,
  then renders once, complete. Later opens are instant.
- While the grid is open, the idle strips of the classes a first pick can choose (or the owned roster) are warmed.
- The first pick keeps the panel up until that idle strip resolves (capped at 1500 ms) and only then reveals the world, so the world never
  draws the orb or an empty pad. A second tap while it waits is ignored (no second hero).

Check run: new `game/tests/cyc5-art-hero-pick-firstpaint.test.js` (load-scaled budgets via tests/lib/load-scale.js, 350 ms delay on
every art request, 390x844 and 1280x720, plus a blocked-portraits run). **FAILED 11 checks on the old mad-maze.js** (first visible frame
had 0/14 portraits, 14 swatches; frames after the pick had `_heroClass` null with 37-39 orb draws). **ALL PASSED on the fix** (load factor
2.58 at the time). Existing tests re-run and passing: hero-pick, beta-w01-hero-popin, hero-all-classes, ability-icons, gear-hero-stats,
class-weapon-playtest, realm-polish3.
Screenshots: `img/cyc5-art-heropick-first-390.jpg` / `-1280.jpg` (first visible frame of the grid with the slow link: all portraits),
`img/cyc5-art-heropick-after-390.jpg` / `-1280.jpg` (the frame the world is revealed), `img/cyc5-art-heropick-after3s-390.jpg` (ranger art).

Not fixed (honest): with a slow link the WORLD art behind the picker (terrain tiles from INDEX.json, the Nexus portal) can still swap in after
the reveal (the "-after" shots show code-drawn terrain and the portal ring at 350 ms per request). Also the freshly revealed hero blinks for
~2 s (the existing spawn invulnerability blink), so a screenshot in that window can catch an "empty pad" frame; that is not art loading.

## 2. b12-r3-02 (P2) black band above the phone dungeon room: FIXED as framing art, room size unchanged
Finding: the 17x13 room (680x520) is bounded by the screen WIDTH (the dungeon view already pans sideways at 60% of the height), and two
existing tests pin the room: realm-polish3 (canvas top >= 214, clear of the map row) and beta-r4-dungeon-pad (pad covers none of the room).
So the room cannot grow upward without breaking those agreed layouts. Instead the band above it (0..215 px on 390x844) now shows the room's
own north wall row (the baked room art, same palette, panning with the camera) stacked upward and fading into the dark, so the dungeon reads as
continuing under the HUD (`#mm-dv-ceiling`, in `game/games/mad-maze/dungeon.js`, a canvas inserted under the realm canvas and every HUD node).
No HUD file, no CSS, no room/bounds change. `?dceil=0` turns it off. Desktop has no dungeon view and no ceiling.

Check run: new `game/tests/cyc5-art-dungeon-ceiling.test.js` (screenshot pixel stats of the band between the HUD nodes, pan, layout,
`?dceil=0`, 1280x720). **FAILED on the old dungeon.js** (band flat mean 9.9 / spread 0, no ceiling node; then a TypeError on the missing hook).
**ALL PASSED** on the fix, twice in a row. Existing tests re-run and passing: realm-polish3, beta-r4-dungeon-pad, dungeon-polish,
mad-maze-dungeon. Screenshots: `img/cyc5-art-dungeon-ceiling-390.jpg`, `img/cyc5-art-dungeon-1280.jpg`.

## 3. b08-r3-09 (P3) Realm ground red/purple tint, stripes, red dots: DIAGNOSED, NOT CHANGED (time box)
- The "leftover red dots" are live enemy bullets, not ground art: at 20 s on the Shore, 19 `eBullets` were on screen from 3 wave enemies
  (round pink-red shots with the dark rim). They read as ground litter because they are small, slow and have no motion cue.
- The red/purple tint in b08-r3-05 matches the red hit vignette (`realm.js` ~5263, `rgba(255,40,80,0.55)` at the edges): a magenta red over
  blue water reads purple. The tester's shot was taken at HP 50/100, mid-hit.
- The stripe noise did not reproduce in my two Shore shots (no weather/scanline overlay found in realm-world.js); needs the tester's exact state.
Proposal (next cycle, G + U agreement since it is hit feedback): warmer, lower-alpha vignette (e.g. the palette red `#e8643c` at ~0.4) and a
1-2 px bright core / short trail on slow enemy bullets so they read as moving shots. Needs a test that the hit cue stays visible.

## Codex branch check (git fetch origin, review only, nothing merged)
New since the last review: `origin/codex/b03-glacier-shellback` (1345c51, self-declared WIP, "audit not run").
Numeric check (Pillow, files extracted to scratch): 12 strips, 256 px cells, frame counts match the manifest (4/6/5/5), alpha 0/255 only,
11-12 colours, exact 4x4 art pixels, anchor 128,231. Visual check (contact sheet): **not mergeable** against ART-HANDOFF:
the right view is not a true profile (front-facing body and legs, the head is not visible), and the death strip only shrinks a little instead of
falling and lying down in the last 2 frames. Down/up views are good (true back, no smile). `b03-icicle-bat` is already in the tip.
The other unmerged codex/* refs are the older pre-"master-review" versions of batches already integrated.

## Tundra / jungle polish: not attempted (time box).

## Files
- game/games/mad-maze/mad-maze.js (hero picker warm-up and first-pick gate)
- game/games/mad-maze/dungeon.js (phone dungeon ceiling + `ceiling()` test hook)
- game/tests/cyc5-art-hero-pick-firstpaint.test.js, game/tests/cyc5-art-dungeon-ceiling.test.js (registered in test-tiers.json, full tier)
- game/design/beta/img/cyc5-art-*.jpg
