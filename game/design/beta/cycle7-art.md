# Cycle 7: G Graphics + Pixel Art (branch `cyc7-art`, port 9703)

## What changed
1. **Icicle Bat wired** (Codex b03, provisional since cycle 6). `MMCreatureStrips.SPECS.icicle_bat`: S 192 px cells, feet 96,171, the 12
   core strips, death at 8 fps (per its manifest), biome tundra. The tundra isle preloads it with pengling / frostfox / rimewolf; when a
   strip fails, or with `?art=0`, the bat draws from the code-drawn MMCreatureDraw bake as before. Pinned creature-list test edited
   additively (owner standing decision): 392 -> 404 strips, tundra 3 -> 4, a new b03 check; the b40b/b40c check now pins the first three
   tundra kinds (the new check pins all four). `art-audit-tool.test.js` gets an additive b03 check. INDEX note updated.
   The bat does not spawn in the Realm (no Realm creature list names it), so no Realm screenshot.
2. **Codex review (9 new branches)**: `codex/b03-glacier-shellback` v3 ACCEPTED and merged provisional (INDEX `b03-glacier-shellback`,
   not wired yet). REDO, not merged: `t01-mocha`, `t01-lily`, `t02-frosty`, `t02-buster`, `t05-spike` (villagers) and `w06-frostfox`,
   `w06-puffwool`, `w06-pebble-tortle`. Frame-numbered notes at the bottom of `CODEX-REMAKE-QUEUE.md` (cycle 7 UPDATE) and a board entry
   in `TEAM-BOARD.md`. Merge conflicts (INDEX.json, CODEX-REMAKE-QUEUE.md, CODEX-HANDOFF.md) resolved keeping both sides; HANDOFF keeps
   the current autonomous runbook.
3. **Realm fast aimed enemy shot pink-red -> orange-red** (cycle 6 proposal). Code sprite `#ff4f6d` -> `#ff5a2e` (hue 350 -> 13) and the
   b17 `ebolt_orb_red` art baked with its saturated pixels rotated +24 deg (dark rim untouched, once per cached frame). Spiral (violet)
   and ring (amber) unchanged; colour-blind palettes unchanged; `?hitfx=0` keeps the old hue. The aimed orb art used to have the same
   body hue as the ring-pulse art (349 vs 347); now 13 vs 347.
4. **Isles tundra frozen road + moss** (`MMIsleArt.biomeDetail`, `opts.biomes.road`, `?tundraroad=0` = off): frozen_road tiles get two
   wheel ruts along the road (dark groove + lit lip, seeded gaps) and frost-heaved cobbles; plaza tiles (road on all four sides, e.g.
   portal pads) get flagstone joints instead of ruts so a wide patch does not stripe; tundra_moss tiles without frost get rust / sage
   lichen crust and the odd crowberry. Bake time only.

## Checks actually run (real results)
- `node game/tests/shared-mm-creature-strips.test.js`: before the code change 8 FAIL with the new pins; after ALL PASSED.
- `cyc7-art-icicle-bat.test.js` (new, browser): before 3 FAIL (strips not preloaded, src code); after ALL PASSED (src png, `icicle_bat_*`
  ids; `?art=0` -> code; 0 errors; blockDb attempts 0).
- `art-audit-tool.test.js` ALL PASSED; `isle-creature-art`, `shared-mm-creatures` ALL PASSED; `cyc1-art-isles-hitflash` failed once on
  its perf bound (1.000 ms vs < 1 ms, machine load average 8) and passed on 2 of 2 reruns.
- Codex review: `game/tools/art-audit/run.js` (unmodified copy) on a scratch tree holding the 9 branches' folders: 0 blocker, 0 needs-redo,
  nits = unref (scratch has no code) + 4 new `face` nits on the W-06 frostfox. Own decode (per-frame native bbox, duplicate frames, feet-row
  diffs) and contact sheets looked at for every branch. After the shellback merge, the repo audit shows 0 rows for `b03-glacier-shellback`
  (the 2 needs-redo rows in the repo are the pre-existing b12r props).
- `cyc7-art-realm-aimed-hue.test.js` (new, browser): before 5 FAIL; after ALL PASSED. `shot-readability`, `bolt-art`,
  `cyc6-art-realm-hit-cue`, `realm-access2`, `realm-cues-access` ALL PASSED after.
- `cyc7-art-isles-tundra-road.test.js` (new, browser): before 8 FAIL; after ALL PASSED. `cyc4-art-isles-biome-ground`,
  `cyc6-art-isles-ice-hole`, `shared-mm-isle-art` (35), `isle-art-bake` ALL PASSED after.
- `run-all-tiers.test.js`, `live-safety.test.js` ALL PASSED (new tests registered in `test-tiers.json`).
- Full stamp NOT run (coordinator's job).

## Screenshots
`img/cyc7-art-icicle-bat-{d,p}.jpg` (1280x720 / 390x844, three bats from PNG strips + a rimewolf), `img/cyc7-art-realm-aimed-compare.jpg`
(old | new, 2x crop), `img/cyc7-art-realm-aimed-after-{1280x720,390x844}.jpg`, `img/cyc7-art-tundra-road-compare.jpg` (old | new),
`img/cyc7-art-tundra-road-after-{1280x720,390x844}.jpg`, contact sheets `img/cyc7-art-codex-{shellback-v3,t01-mocha,villagers,w06-frostfox}.jpg`.
195x422 not captured this cycle.

## Unresolved
- Glacier Shellback merged but not wired (needs an M 256 px spec + pinned-test update like the bat; code-drawn fallback still shows).
- Villagers T01/T02/T05 and W-06 x3 wait on Codex redraws (notes in the queue).
- Road edge tiles (one or two road neighbours) still show parallel rut lines next to each other on 2-wide roads; reads as a road, but a
  human look on a phone is the retest's call.
- At 390x844 natural icicle bat spawns can sit under the joystick pad (spawn placement, not art).

## Proposals
- Next G cycle: wire the Glacier Shellback (same pattern as the bat) and add a `stripSize` 32-48 check when the W-06 redraws pass.
- Consider the same orange shift for the boss fan `ebolt_shard` if testers still confuse boss fans with ground decor.
