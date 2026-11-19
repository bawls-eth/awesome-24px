# Art handoff: status, rules and plan (read with PROJECT-BRIEF.md)

## 1. Where art stands

**Delivered by the owner (made in ChatGPT, owner states all art is original and owned):**

| Pack | Path | Contents | Status |
|---|---|---|---|
| Arcane Frontier 100 | `games/arcane-frontier/` | 100 placeholder 32x32 sprites (10 heroes, 24 enemies, 8 bosses, 20 tiles, 12 props, 16 equipment, 10 effects) + `manifest.json` | placeholder art, in repo, usable now |
| B0 Warrior | `assets/arcane/b00-warrior/` | 21 strips (7 actions x down/up/right), 256x256 cells, `manifest.json`, `palette.json` | PROVISIONALLY APPROVED master |
| B1 Ranger/Mage/Cleric | `assets/arcane/b01-ranger-mage-cleric/` | 63 strips, same format | technically clean, visual fidelity lower than the Warrior; provisionally accepted |
| Master look sheet | `assets/arcane/reference/warrior-master-sheet.png` | all 21 Warrior animations on one labeled sheet | REFERENCE ONLY (labeled collage, effects baked in) |
| API test report | `assets/arcane/reference/gpt-image-api-test-report.md` | what the OpenAI Images API does well and badly | read it |

The owner is also running the big ChatGPT production job (1,000 files in 13 batches, B0..B12). Delivered so
far: B0 (Warrior) and B1. B2 (rogue, warlock, paladin) and B3 (berserker, druid, necromancer) are next. New
ZIPs arrive via the owner; the manager checks them with scripts and tells you what to integrate.

**Your own art attempts so far:** `assets/art/` (puffcap, thorn beetle, dusk moth enemy sheets) made through the
ElevenLabs image tool (model `gpt-image-2.5-sunburst`). It stopped after 3 images with
`free_tier_image_limit_reached`, outputs are 1280x720 and had to be rescaled, and the style was only
described in words. Treat those sheets as good style experiments, not final.

## 2. THE OPENAI KEY IS NOW AVAILABLE: USE IT

The owner saved an OpenAI API key on this environment. The network proxy injects it, so call the Images API
with NO Authorization header and never print or store a key:

```
curl -s https://api.openai.com/v1/images/generations -H 'Content-Type: application/json' \
  -d '{"model":"gpt-image-1.5","prompt":"...","size":"1024x1024","background":"transparent","output_format":"png"}'
```
decode `data[0].b64_json` to a PNG. `gpt-image-1` does NOT exist for this key; `gpt-image-1.5` works (11-23 s
per image). For image edits with a reference image use `POST /v1/images/edits` (multipart). If a model errors,
`GET /v1/models` and pick the newest image model. This route has no free-tier daily limit (it bills the
owner's OpenAI account). Spending cap: at most 60 image generations and about $10 per day in total across the
team; log every call in `assets/art/LEDGER.md` (id, model, size, count, note) and stop at the cap. Prefer ONE
sheet with many frames per generation. Ask the owner before raising the cap. Keep the ElevenLabs tool as a
secondary route only.

Pillow in the system Python is broken: use a venv (`python3 -m venv venv && venv/bin/pip install pillow numpy`).

## 3. What the team should build art-wise

The owner's ChatGPT chat and you split the 1,000-file library so it finishes faster, with ONE shared quality bar:

- **Owner's ChatGPT chat:** heroes (210 strips: 10 classes x 21). Delivered B0, B1; B2, B3 next.
- **You (Art Director with the API):** enemies (20 creatures x 12 strips = 240), bosses (8 x 6 = 48, plus 24 boss
  effect strips), then items (260), projectiles and effects (70), then tiles (80), props (40), UI icons (28).
  Work in batches of about 100 files, one commit per batch, ledger updated. Tiles, effects, projectiles, props
  and UI are drawn WITH CODE (Pillow/numpy, seeded noise, palette-locked, seamless by construction, tiled 3x3
  and 5x5 to prove zero seams); use GPT only for characters, creatures, enemies, bosses, items and concept
  images. If the owner's ChatGPT chat also delivers a category, theirs is used and yours is dropped.

### Format spec (same as the owner's ChatGPT prompt)
- Heroes/enemies: one horizontal strip per action x direction (down, up, right; left is mirrored in code),
  256x256 cells. Frames: idle 4 (loop, 6 fps), walk/move 6 (loop, 10), attack 5 (once, 12), cast 5 (once, 10),
  roll 6 (loop, 12), hit 2 (once, 8), death 6 (once, 8) (enemies: idle 4, move 6, attack 5, death 5).
  Bosses: down only, 384x384 cells, idle 4, move 6, attack_a 6, attack_b 6, hit 2, death 8.
  Items: 32x32 flat `items/<id>.png`, ~80% fill, tier + tags. Tiles 32x32. UI icons 24x24.
- Manifest per ZIP/batch: one entry per PNG with id (= filename), category, class/enemy/boss, action, dir, path,
  frames, frame_w, frame_h, fps, loop, `anchor` {x,y} (feet; heroes 128,231; bosses 192,350) and for attack/cast
  strips a `muzzle` array of {x,y} per frame (weapon tip or casting hand: where projectiles spawn).
- Heroes use ONE shared 48-colour palette (`palette.json`); enemies/bosses may add up to 16 colours each.

### Mandatory post-processing for every generated creature/item (code, every time)
Crop to the creature; rescale ONE fixed factor per character/creature (never per frame, never to equalise
heights: a raised sword or a crouch must change the figure's height naturally); pixel-snap by box-downscaling
to a 64x64 logical grid (boss 96x96, items 32x32), quantise to the palette, upscale with nearest-neighbour so
every art pixel is an exact 4x4 block; alpha is 0 or 255 only (remove halos); place in an exact cell, feet on
baseline y=231, 12 px margin, full legs/boots/weapon/cape inside the cell. Then verify with code and LOOK at
the contact sheet.

### Hard-won rules from reviewing ChatGPT deliveries (apply to everything you make)
1. TRUE back (no face, cape/back plates) and TRUE right-side profile views. Never darken or squash the front
   view; never draw characters with code (that produced flat blocky robots and was rejected).
2. Effects (slash arcs, spell circles, sparks, projectiles) are SEPARATE neutral strips, never baked into a
   creature strip.
3. Every frame a genuinely different pose; walk cycles need visible alternating legs; rolls must really tumble;
   deaths must stumble, fall and lie down (not jump to a prone sprite).
4. Weapons must be clearly visible in every attack/cast frame and held in the same hand as in idle.
5. Same outline colour in every view (dark); no white halo fringe, no floating fragments, no neighbour-sprite
   slivers cut from sheets.
6. Do not trace or copy any existing game's art. Reference sheets the owner supplied are design references
   only: redraw as original art. Never ship an asset whose origin is unknown ("extracted"/"cropped from a
   reference sheet" assets are NOT allowed in the game).
7. Keep standing height equal across a class's three views (148 px standing for the master Warrior).

## 4. Integrating art into the game (a real slice, do it soon)

1. A shared loader `game/shared/mm-art.js`: reads a manifest, loads strips by id, slices `frame_w` x `frame_h`,
   builds animations from `frames`/`fps`/`loop`, mirrors `right` for left, applies `anchor` so feet land on the
   entity position, exposes `muzzle` for projectile spawn, falls back to the existing procedural sprite when an
   id is missing (never crash, log once).
2. Render with nearest-neighbour at an integer-ish scale: 256 px cells display at 48-64 px on screen (set a
   per-class `displayScale` in config; the heroes' 140-152 px standing height differs slightly by view, so
   allow a per-view scale fudge instead of editing the art).
3. Wire the four finished classes into Mad Maze's hero select and run (Warrior, Ranger, Mage, Cleric) with
   their real animations; keep procedural stand-ins for classes without art. Add `game/tests/art-integration.test.js`
   (every manifest path loads, frame counts match, no 404, animation plays).
4. Use the Arcane Frontier 100 pack for enemies/bosses/items/tiles not yet replaced.
5. Update the in-game art as new ZIPs are committed; never rename ids.

## 5. Known issues to fix in code when integrating (manager's review notes)

- B0 up/right strips have a thin light edge halo (the down strips have a dark outline): darken the outermost
  pixels in a one-off script.
- B0 attack up/right frames 3-4 and cast up frame 4 are drawn smaller than neighbouring frames; death up has
  floating sword fragments in frames 4-6. Tolerable for now; ask for redraws later.
- B1 weapons are small or hidden in several attack/cast frames; rolls read as a dark blob; B1 palette differs
  slightly from B0's (consolidate the palettes with a script, do not overwrite the approved art).
- Muzzle coordinates are estimates: calibrate them in-engine.
- Per-view standing height differs by 4-8 px in B1 (ranger up/right 140, mage up/right 144 vs 148 down).

## 6. Process

Art Director step runs FIRST in each session that needs art; requests/ideas/delivered live on
`game/team/ART-BOARD.md` (create it if missing). QA playtester and watcher BLOCK art that is blurry, off-palette,
mis-sized, or unreadable at phone size. Every batch commit updates `assets/art/LEDGER.md` and
`design/STATUS.md`. The manager reviews every delivery visually and numerically and reports to the owner.
