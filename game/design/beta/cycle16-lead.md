# Cycle 16 - L (Lead Developer), branch cyc16-lead

Cut from `claude/animal-crossing-game-7z3roh` at 71e7d75 (it already has the coordinator's bolt `_hitR` fix). Static server port 9101.

## Item 1 - hitboxes smaller than the drawn enemy

Audit of every player-side hit path against the drawn size (Realm art is drawn 2.8 x `_er` wide, half-width 1.4 x `_er`):

| Path | Before | Verdict | Now |
|---|---|---|---|
| Bolt (`_boltHitIndex`, hash, fallback) | `_hitR` = 1.3 x `_er` + 2 | fixed by coordinator (71e7d75) | unchanged |
| Weapon orbiters (`_updateWeapon`) | `_boltHitIndex` | already uses `_hitR` | unchanged |
| Lob landing (`_lobLand`) | r + `_er` | real mismatch (boss: 13.6 px rim not hit) | r + `_hitR` |
| Signature / melee AoE (`_sigAoe`, all class sigs) | r + `_er` | real mismatch | r + `_hitR` |
| Bone orbit (`_updateSignature`) | `_er` + 8 | real mismatch on big enemies (boss: miss at 44.8 px, body reaches 47.6) | `_hitR` + 6 |
| Bolt splash (`_splashAt` -> MMSplash.pick) | dist - `_er` | geometric mismatch, but the same number is the falloff DAMAGE distance pinned by gear-splash-player | NOT changed (proposal below) |
| Drifter (15 px) | 15 px | procedural sprite gradient radius 11 (+/-3 bob); art drawn 31 px wide (half 15.5) | no mismatch, unchanged |
| Zone / B7 creatures with `e.rad` | via `_er` | covered by the rows above | - |
| Mad Maze dungeon | dungeon enemies are `this.enemies` (same bolt path); boss damage routes through `_hitEnemy` | covered | - |
| Isles island boss (isles.js `stepBolts`) | circle r 48 at feet - 36 | real mismatch: tide hydra strip opaque box (idle, /4) is x -45..43, y -103..0 (down) and x -61..57, y -100..0 (right); heads 19 px above the circle. Fernjaw tyrant (-33..35, -70..-1) fits | old circle OR an ellipse over the strip's measured top..feet and span (`bossBodyHit`); never smaller |

Isles creatures (`c.rad + 5` at feet - 8) and the code-baked bosses (frost dragon, red titan: no strip, keep the circle) were not measured this cycle.

Checks actually run (port 9101, through /tmp/bt.sh):
- `realm-aoe-hitbox.test.js` (new): with the old realm.js **7 FAILED** (lob, sigAoe x boss/sniper, bones.boss "in body is hit"); with the fix **ALL PASSED** (lob, sigAoe, bones x boss/sniper: in body hit, outside the drawn body not hit; 0 errors, 0 DB).
- `isles-boss-hitbox.test.js` (new, real bolts via I.fire + I.step): with the old isles.js **1 FAILED** (bolt level with the hydra heads at feet - 96: dmg 0); with the fix **ALL PASSED** (heads: 14 dmg; above the drawn top at feet - 140: 0; tyrant through the old circle still hit; 0 errors, 0 DB).
- Regression: gear-boss-splash, gear-splash-player, realm-wire, class-abilities-arena, arena-world-hooks, isles-boss (57 checks): ALL PASSED.
- Browser: Isles reef hydra at 1280x720 and 390x844, a bolt at head height did 14 damage on both, 0 page errors, 0 DB requests. Screenshots `img/cyc16-lead-hydra-1280.jpg`, `img/cyc16-lead-hydra-390.jpg`.

### Player hurt circle (recommendation only, NOT changed)
Enemy bolt hits the hero when centre distance < `RM_PLAYER.r + 4` = 15. The enemy bolt is drawn with radius `RM_BOLT_R.enemy` = 6 (dark rim, ~2 px bright core). Visual first contact of the bolt rim with the hero's 11 px body is at 17 px; the core touches the body at 13 px. So today a bolt hurts when its rim overlaps the body by 2 px - already a slight "graze" allowance, and 2 px LARGER than core-on-body. Recommendation: keep 15. If players report "hit by bolts that missed", the next step is 13 (core touches body), and only after a bot run (dodging bot, same seed, hits/minute at 15 vs 13) shows the change is safe; no change without that measurement.

## Item 2 - Town cull headroom (no code change)
Probe (count of `displayWidth` reads inside `cullOffscreen`, standing still after join, 80 passes, 1280x720): measured 199.65 per pass, 979 objects, 187 Sprites (46 `_cstill`).
- 139 / pass: moving Sprites, measured every pass by design; about 117 of them are off-screen `fft_*` strip creatures (birds, insects, fauna) that are culled.
- 60 / pass: everything else - foam_dash 14.4 (pinned sway images, the 8-pass refresh), Star sparkles 3.6, wave_crest 2.9, NPC name Texts ~6 (on screen), settled decor the rest.

Finding: the pin checks need `measured >= sprites` (all 187 Sprites, still ones included). So without touching a test, non-sprite reductions can lower the count by at most ~12 (199.65 -> 187). The 14.4 foam_dash measures are the 8-pass refresh that cyc9-lead-town-cull-pin [3] pins ("moved out of its reach ... drawn again within 8 passes"), so they cannot go. The big real saving (the ~117 culled off-screen strip sprites, re-measured every pass) would drop `measured` below `sprites` and fail the literal check, although that check means "every walking sprite is measured". Headroom today: 215 - 200 = ~15.

Proposals (need the coordinator's call, not done):
1. Off-screen `fft_*` fauna: settle a culled strip sprite whose position did not change since its last measure (as `_cfix` resting animals) - saves ~100 measures/pass but needs the pin wording changed to "measured >= moving sprites in view" (a test change the coordinator must approve).
2. Or remove far `fft_*` sprites from the display list (pool them out) so both `sprites` and `measured` fall; a behaviour change for the ambient fauna.

## Unresolved
- Bolt splash still selects / falls off from `_er`. Proposal: select with `_hitR` but keep falloff from `_er` (needs an MMSplash `pick` option and a gear-splash-player oracle update, plus a balance OK).
- Isles creatures and code-baked bosses not measured.

## Follow-up (coordinator) - clock-dependent cyc14 [1] red
Cause: the daily Bug-Off. Its UTC start hour is hashed from the day (`bugOffStartHour`, 2 hours long); while it is live, 8 extra bug Texts flutter in the village next to the 8 normal ones. Bugs sit in view or inside the 320 px margin, and every one was measured on every cull pass. That is 5 to 11 extra measures, so today the standing-still Town was over the 20.5% line only during that day's window (around 20:00-21:00 UTC). Rain is not involved (its drops are screen-space, scrollFactor 0, and the cull skips them). The night fireflies are the same bug objects.

Fix (main.js `cullOffscreen`): the bugs declare themselves slow ambient movers (`_cdraw`). A bug found inside the cull line (so drawn) keeps its bit and is read again on the 8th pass. A skipped object is never culled, so nothing on screen can disappear. Beyond the line it takes the existing far rules unchanged. Hiding it or a forced pass reads it at once. Sprites, pinned images and the cyc13 marks are untouched.

Measured per pass (clock probe: Date shifted, standing still, 80 passes; same numbers before and after except main.js):

| Clock (UTC, 2026-11-27/28) | Before | After |
|---|---|---|
| 12:00 (day, no Bug-Off) | 200.2 | 194.8 |
| 20:30 (night, Bug-Off live) | 206.5 | 196.5 |
| 21:00 (night) | 196.5 | 195.3 |
| 03:00 next day (night) | 200.3 | 195.2 |

New test `cyc16-lead-town-cull-bugs.test.js` (Bug-Off forced live, independent of the clock): before 206.8 measured, 2 FAILED; after 197.6, ALL PASSED. It checks [1] under 20.5%, at least every sprite; [2] each bug inside the line measured at most 1 pass in 4; [3] never culled on screen; [4] moved far culled within 9 passes, hidden and shown measured next pass; [5] a walking Sprite is still measured every pass.
