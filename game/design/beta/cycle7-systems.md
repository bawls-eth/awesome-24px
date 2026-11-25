# Cycle 7 - S (Game Systems) report

Branch `cyc7-systems`, cut from `490ca71` (tip of `claude/animal-crossing-game-7z3roh`), own server port 9705, every browser run through `/tmp/bt.sh`, Firebase blocked in every run (blockDb / route abort + every WebSocket closed; every test and bot asserts or prints 0 DB requests). `firebase-config.js`, `net.js` untouched. No save-format change. Nothing pushed. Only targeted tests were run (not the full stamp). The machine was shared with the other role agents (load 5-12 on 4 cores), so wall-clock bot numbers are under load.

Commits: `bd0fe00` (ID-51), `9338a5a` (ID-36), `92d64d7` (ID-09 part 1), plus this report.

## 1. ID-51 idle-hero rest: BUILT
What changed
- `realm.js`: the arena counts game seconds since the last play input (`_idleT`). Play input = any key, a canvas pointer down / mouse move, a touch-stick touch (even a tap), an ability, a held move / fire / aim, a gamepad stick, button or ability. `_wake()` ends a rest on the spot. After `RM_IDLE_REST_S` = 8 s the hero rests if the world's new optional `restOk(p)` hook says yes (solo world only; never in a dungeon, team / co-op, downed, or with no hook, so the Town, duels and dungeons are unchanged). While resting: every non-boss enemy skips its turn (no pursuit, no fire, provoke timer cleared) and the one-thumb auto-fire pauses (no idle farming). Bosses keep their rules. Bolts already in flight still land. Test hooks: `arena.resting`, `arena.restN`, `arena._idleT`.
- `realm-world.js`: `restOk` = the hero stands on a Shore tile and the Trial of Six is not running; `?idlerest=0` turns it off. The quiet-stretch pity nudge never fires on a resting hero (its 15 s count restarts after the next input). Deeper zones keep today's rules (my reading of the ID-51 row, "on the Shore"; the owner line does not name a zone; widening is one line in `restOk`).
- Note: tapping a menu / coach button (e.g. the coach Skip) is not play input, so an idle time that started before the Skip counts.

Checks run
- `cyc6-lead-passive-landscape.test.js` (moved from `tests/cyc6-open/` into `tests/`, `../helpers` -> `./helpers`, registered full / 900 s): **ALL PASSED, 6 of 6 seeds alive at 120 game s** (844x390, coach skipped). Lowest HP: 12345 100, 777 100, 4242 90, 9001 88, 31337 94, 2026 100. **Red before** (same test against a `git archive HEAD` copy on port 9706, seeds 12345 / 4242 / 9001): 3 of 3 FELL (6 s, 6 s, 14 s).
- New `cyc7-idle-rest.test.js` (registered full / 420 s), seed 12345 Shore, two plain `aimed` shooters spawned 220 px above / below the hero:
  - A, active hero (1280x720, real key taps every second for 14 s, no i-frames): never rests (restN 0, idle < 8 s), and the Shore is not trivial: 63 bolts fired at it, 48 HP lost (second run: 63 bolts, 64 HP).
  - B, 1280x720 keyboard and 390x844 touch (hero given i-frames so it lives to be measured): not resting at the start; resting after 9 s; 4 s of rest with 0 bolts fired and 0 px moved by the enemies within 420 px; one real key press (desktop) / one real touch tap (phone) ends the rest at once; the enemies fire again within 8 s.
  - C, idle hero on a Midlands tile for 10 s: never rests.
  - Result: **ALL PASSED** in 2 runs with the final code. (A first run had 4 FAIL: no enemy near the desktop spawn, so the test now spawns its own shooters; and the phone tap ended the rest only on the next frame, so input now calls `_wake()`.) **Red before** (HEAD copy): 8 FAILED (every rest / wake / Midlands check; the "not trivial" and "aggro returns" checks pass on HEAD too, as they should).
- `cyc3-realm-frame-alloc.test.js`: its quiet-rule part waited 17.5 s with NO input for a nudge, which ID-51 now forbids. Honest update (named in the commit): phases A / B call `a._wake()` each frame (a hero who plays but earns nothing, the case the nudge is for), and a new check C: with input stopped the hero rests and 10 s of rest give no nudge. ALL PASSED (10 checks).
- `beta-r4-b08-passive-2min.test.js` (coach on, 4 seeds): ALL PASSED (first attempt hit a 30 s page-load timeout under load, rerun clean).
- `run-all-tiers.test.js`: ALL PASSED.
- Screens: `img/cyc7-systems-idle-rest-1280x720.jpg`, `img/cyc7-systems-idle-rest-390x844.jpg` (resting hero, two shooters standing still, no bolts). 195x422 not taken (no UI changed).

## 2. ID-36 Trial edge sweep: TUNED (every 7 -> 9 s, speed 140 kept)
`shared/mm-endgame.js` LAYERS.sweep `every: 9`. Only full runs of `design/beta/tools/trial-bot-nexus.js` (Lv 20, common wand, 252 HP, no FROM, entered through the Nexus with real keys). "30 Hz" = slowMs 18 (measured 25-30 Hz loop).

| run | rate | max fight s | f1 | f2 | f3 | f4 | f5 | f6 | result |
|---|---|---|---|---|---|---|---|---|---|
| t9-60a | 52-57 Hz | 100 | 0 | 0 | 8 (1) | 0 | 0 | 0 (8 sweeps, 72 sweep bolts) | **6/6 won, 252 HP** |
| t9-30a | 24-28 Hz | 100 | 0 | 0 | 0 | 0 | timeout at 100 s, 0 dmg (bot did not kill the hydra in time; not a death) | - | 4 won |
| t9-60b | 49-59 Hz | 160 | 0 | 0 | 0 | 0 | 8 (1) | 8 (1) | **6/6 won, 244 HP** |
| t9-30b | 25-30 Hz | 160 | 0 | 8 (1) | 0 | 165 (5) | 74 (6) | 8 (1) | **6/6 won, 29 HP** |
dmg = damage taken (hits). Fights took 67-78 s each. Every run: DB 0, no page errors.
Verdict: the slow bot finishes with at least 1 HP (29 HP) in the one complete 30 Hz run, and fight 6 (the sweep fight) cost it 8 HP (cycle 6: died in fight 6 with 228 damage). One complete run per rate, bot variance is large (fight 4 cost 165 in t9-30b and 0 in t9-30a), so treat as indicative. Speed 120 was not needed and not tried.
Tests: `cyc5-trial-layers.test.js` pins every 9 (ALL PASSED; against HEAD's mm-endgame.js it FAILS that check, run). `cyc5-trial-layers-live.test.js`: fight-6 watch window 10.5 -> 13.5 s so the later first sweep still falls inside it (intended change, in the commit): ALL PASSED (14).

## 3. ID-09 / ID-18: specs found, ID-09 part 1 built, the rest NOT built
D's approved specs ("ID-09 / ID-18 implementation specs (D, cycle 7)") are in D's cycle 7 worktree, not yet on the dev tip.
- Built: `MMGameDay.visitStep(lastKey, days, todayKey)` in `shared/mm-gameday.js` exactly per the spec (gap of any length = +1, same day pays once, 1-2 days ahead waits, more than 2 ahead resets the date only, pre-2026-11-01 clock untouched, garbage = max(days,0)+1, never lower). `streakStep` untouched. New node test `cyc7-s-visit-days.test.js` (smoke): ALL PASSED (13-row table, a gapped run pays 1,0,2,3,4,0,5, migration seed, 5000 random sequences never lower the count). Against HEAD it FAILS (no export) and then aborts. `cyc3-gameday-streak` still ALL PASSED.
- NOT built (time box): the Town wiring of ID-09 (badge "Days in town N", toast, sell days, four save keys, Backup / key lists, SAVE-KEYS.md, `mm-gameday.js` script tag on `index.html`, which the Town page does not load today) and all of ID-18.
- Spec gap for D / next S: `town-streak-clock.test.js` checks the old contract (badge shows the streak, the payout follows the streak, and "no key beyond the existing streak keys was added"). ID-09 changes what is shown and paid, so that test needs its shown/paid checks moved to visit-day semantics and the four new keys allowed, not only a text update as the spec says.

## Unresolved
- ID-51 is Shore-only; a resting hero shows no on-screen sign (proposal 2).
- ID-36: one complete run per rate; the Trial is still not position-locked (cycle 6 note).
- ID-09 wiring and ID-18 not built.
- IDEAS.md rows not edited by me (D edits the file this cycle): ID-51 -> built (cycle 7 S), ID-36 -> tuned (sweep every 9 s).

## Proposals
1. (S, next cycle) ID-09 wiring then ID-18, in that order, with the `town-streak-clock` update above.
2. (U) A small "Resting" hint next to the zone label while `arena.resting` is true, so a returning player knows why the enemies stand still.
3. (D) Decide whether ID-51 should also cover the Midlands (one line in `restOk`).
