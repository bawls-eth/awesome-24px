# Cycle 5 - S (Game Systems) report

Branch `cyc5-systems` (cut from `4b6d34e`, the retest-3 tip), own server port 9505, browsers only through /tmp/bt.sh, Firebase blocked in every run (blockDb / route abort + WebSocket close; every test asserts 0 DB requests). Not pushed.

Commits: `6e27213` (b11-08), `fcfd1d2` (b02-r3-01), `60baf9d` (ID-14 test), `5575415` + `8bd272c` (ID-36 + Trial bot).

## 1. b03 P2: ID-36 Trial ramp + a Trial bot that enters through the Nexus with real keys
What changed
- `game/shared/mm-endgame.js`: pure layer builders `LAYERS`, `rushLayers(step)`, `rushCapExtra(step)`, `rushCap(step, base)`, `leadAim`, `armAngles`, `sweepLine(k, px, py, half)`; each ladder step carries `layers` and `capExtra`. Fights 1-3 have no layer; 4 = A lead shot (every 1.6 s, aimed at p + v x 0.35 s, v over the last 0.2 s, 207 px/s = 0.9 x 230); 5 = A + B slow arm (2 opposite bolts every 0.5 s, turning 40 deg/s, 110 px/s, life 2.4 s); 6 = A + B + C edge sweep (every 7 s a line of 9 bolts, 28 px apart, with one 3-slot gap that alternates sides, the direction turns a quarter each time, 140 px/s, telegraphed by 0.8 s of faded bolts). RUSH.ramp, boss HP/damage, the 0.6 s boss wind-up and every boss's own pattern are unchanged; no layer fires before the 1.2 s spawn shield plus its own wind-up.
- Cap (deviation from the spec, on purpose): a flat 40 -> 52 cap let the bosses' own patterns fill the raised cap, so layer bolts were silently dropped (my live test measured 1 / 7 / 19 dropped in fights 4 / 5 / 6). Now the bosses keep the zone cap (40) for THEIR bolts and the layer bolts ride on top, up to +1 / +12 / +21 (41 / 52 / 61). Layer bolts carry a token `b.rl` (`fireEnemyBullet` now resets `b.rl = 0` and returns the bolt; additive, older callers ignore it).
- `game/games/mad-maze/realm-world.js`: layer engine in `rushTick(dt)` (sim-clock timers, layer bolts carry the boss's `dmgMul`), telegraphs drawn in `drawOver` (lead-shot aim line in its last 0.6 s, faded sweep bolts for 0.8 s). The sweep spawns inside the view (min(300, half view - 24), at least 140 px) so the phone sees its telegraph (screenshot `cyc5-systems-trial6-sweep-phone.jpg`). `?trialramp=0` restores fights 4-6 as before. Test hooks `rush.ramp.{on, layers, capExtra, capNow, layerLive}`.
- `game/design/beta/tools/trial-bot-nexus.js`: Lv 20 hero placed beside the Nexus portal, then ONLY real input: Enter opens the Nexus, WASD walks the plaza to the gate (steering reads the hero position), the prompt must read "Enter the Trial of Six", E starts it; fights with real mouse aim + held Space + WASD dodging (the trial-bot.js dodge/orbit logic), "Next fight" by a real mouse click. No `rush.start()`.

Checks run (real results)
- `node game/tests/cyc5-trial-layers.test.js` (new, node, smoke): ALL PASSED (23 checks). Fails before: with the HEAD mm-endgame.js it throws at the first builder call.
- `cyc5-trial-layers-live.test.js` (new, browser, full): ALL PASSED (13 checks). Enters with real keys only; per fight (hero unhittable, layer counters read): fights 1-3 0 layer bolts, cap 40; fight 4 lead 2 in 5.5 s, cap max 41, boss bolts max 40; fight 5 lead 2 + arm 16, cap max 51-52; fight 6 lead 5 + arm 36 + one sweep of 9 after 0.78 s of telegraph; 0 layer bolts dropped; bolts carry the boss's dmgMul; leaving restores cap 40; `?trialramp=0` fight 4 unchanged.
- Regressions run alone: `world-boss-rush`, `beta-g23-trial-enter`, `beta-g27-trial-polish`, `world-firebudget`, `shared-mm-endgame`, `cyc3-hit-pause`: all ALL PASSED.
- Bot run (`trial-bot-nexus.js 20 0 100`, 1000x700, ~60 Hz loop, final cap design): ENTERED by real keys (Nexus opened by Enter, gate prompt "Enter the Trial of Six (E)", walk 3.1 s). **Fights reached: 5 of 6, won 4.** Per fight: 1 inferno_wyrm won 65.8 s 0 dmg; 2 lich_king won 67.3 s 0 dmg; 3 void_maw won 70.6 s 8 dmg (1 hit); 4 void_oracle won 69.7 s 0 dmg (42 lead shots fired, 0 dropped, cap 41); 5 shadow_hydra DIED at 68.9 s, 228 dmg in 10 hits (cap 52, closest bolt 6.6 px). DB requests 0, no page errors.

Verdict against the spec targets: NOT met yet, the ramp needs tuning. Fight 4's lead shot never touched the 60 Hz bot (spec wants damage > 0), while fight 5's slow arm killed it (spec wants a slow 30 Hz bot to finish with >= 1 HP). Starting values for the next pass (not run): lead shot ahead 0.35 -> 0.5 s or every 1.6 -> 1.2 s; slow arm every 0.5 -> 0.7 s (budget 11 -> 8) or speed 110 -> 95. The 30 Hz bot pass (`slowMs` 18) was not run (each full Trial run is about 7 minutes).

## 2. b02 P3 (b02-r3-01): a 3rd tap at ~450 ms could destroy the wand
- `game/realm.js` `_bindForge` / `_armButtons`: taps that follow "Confirm reforge" less than 600 ms apart form one tap chain, and a Salvage / Confirm-salvage tap inside the chain is ignored (each tap extends the chain). "Confirm salvage" also sleeps 900 ms after its ask renders. Taps outside a chain (Forge, then Salvage) behave as before.
- Test: `beta-g03-sell-guard.test.js` extended with 3f-3h (real touch taps on a 390x844 phone): three taps 450 ms apart on Confirm reforge -> the wand exists, reforged once, no salvage ask; charged exactly once; a deliberate Salvage after a pause still opens the ask and Confirm salvage wakes after ~0.9 s and salvages (not stuck).
- Fails before (HEAD realm.js): 3f FAIL (`"it":false`: the wand was destroyed, under-finger sequence `yes:reforge`, `salvage`, ...), 3g FAIL. After: ALL PASSED (whole file). `gear-forge-ui` and `cyc4-forge-hint`: ALL PASSED (the first version of my guard broke gear-forge-ui's quick Forge -> Salvage step; fixed by scoping the chain to Confirm reforge).

## 3. b11 P3 (b11-08): "Depth 5" at the Deepdelve surface
- `game/games/deepdelve/deepdelve.js`: on or above the column's surface the HUD reads "Surface"; below it, "Depth N" with the same absolute N the medals ("Bronze: Depth -8") and the dive record use, so the HUD and medals never disagree. Goals, saves and the dive code are untouched.
- Test `cyc5-deepdelve-surface.test.js` (new, browser, full): seeds 5 and 12345, real frames: at spawn "Surface" (absolute depth there was 3), 3 blocks down "Depth 6", in the air "Surface". ALL PASSED (8). Before (HEAD deepdelve.js): 4 checks FAIL ("Depth 3" at spawn and in the air).
- Trade-off to note: the first block below ground reads "Depth 4" (absolute), not "Depth 1". Changing the number to "below ground" would also move the medal thresholds; that is D's call (proposal below).

## 4. b01 note: ID-14 hit pause NOT VERIFIED by a tester
- Test `cyc5-hit-pause-play.test.js` (new, browser, full, 1280x720): the real rAF loop untouched, a Lv 1 hero standing 160 px from a Godlands altar boss, hit by the boss's real bolts (no `_hitPlayer` calls, no HP edits). ALL PASSED (10): a >= 15 % hit lands; hitPausedFrames rises; 1-4 real frames tick with no `_draw` right after it (<= 70 ms); drawing resumes and the sim clock kept running; with reduce motion the same real big hit pauses nothing.
- Negative control: with `_hitPauseOn` forced false in realm.js (temporary, reverted) the test FAILS ("hit pause fires" and "frames with no draw").
- Why b01 never saw it (INFO line, measured): a level-matched Lv 16 hero (220 HP) in zone 3 takes 17 and 27 per bolt, peak 12.3 % < 15 %; a Lv 4 hero (124 HP) peaks at 13.7 %. In normal play the pause almost never fires. Proposal for D: threshold 15 % -> 10 % (fires on the 27-dmg heavy bolt at Lv 16) or tie it to the heavy-bolt kind.

## Not done (time box)
- Dungeon-bot "one enemy survives room 1": not started.
- ID-36 tuning pass and the 30 Hz bot run (see item 1).

## Screenshots
`game/design/beta/img/cyc5-systems-trial6-sweep-desktop.jpg`, `...-trial6-sweep-phone.jpg` (fight 6, faded sweep telegraph at the left, phone version inside the view), `cyc5-systems-deepdelve-surface-desktop.jpg`, `...-phone.jpg` (HUD "Surface" at spawn, 1280x720 and 390x844).

## Proposals
1. ID-36 tuning (above), then the bot targets from cycle4-design.md re-run with `trial-bot-nexus.js 20 0` and `20 18`.
2. ID-14 threshold 15 % -> 10 % (D decision; numbers above).
3. Deepdelve: decide whether "Depth" should mean blocks below ground (then the medals move too) or stay absolute (today).
4. IDEAS.md still lists ID-36 as `proposed`; the coordinator called it approved. Update the row to `built (tuning pending)` when merged.
