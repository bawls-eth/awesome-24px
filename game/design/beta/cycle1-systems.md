# Cycle 1: Systems (S) notes

Branch `cyc1-systems` from `claude/animal-crossing-game-7z3roh` 86eda4b. Own server on port 9715, every browser run through `/tmp/bt.sh`, Firebase blocked (blockDb / offlineStub, `db.attempts() === 0` asserted), targeted tests only (no full suite). Not pushed.

## Built: ID-02 Zone-border danger meter

- Pure module `shared/mm-danger.js` (MMDanger, UMD). `difficultyAt` lives in `shared/mm-overworld.js` (not mm-zones.js). It is `smooth(1 - dz / 0.9)`, and the zone is a step in the same `dz`, so MMDanger puts one knot on every zone border: area level = the zone's recLv (1 / 5 / 10 / 15) exactly where the zone starts, rising smoothly to 20 at the centre. Both band tables (classic and wide) are handled through `world.bands`. Verified on seed 12345: every tile's area level stays inside its zone's band.
- Buckets compare the shown (rounded) area level with the hero level: **Comfortable** (area <= hero, icon check mark), **Tough** (1-3 levels above, icon `!`), **Too hot** (4+ above, icon skull). The test caught a real bug in the first version: area 1.3 rounds to "Lv 1" but rated Tough for a Lv 1 hero. The rating now uses the rounded level.
- HUD: built to U's spec (`git show cyc1-ui:game/design/beta/cycle1-ui.md`, commit 30ab141 cherry-picked here so the screenshots show the real CSS). `#rw-danger.rw-danger` sits inside `#rw-zone` (aria-live polite), with `data-level` comfortable|tough|hot, `--rw-danger` on `.rw-danger-fill`, and the word in `.rw-danger-txt`. It is written from the once-a-second `goalTick`, and only when something changes. It hides in the Nexus overlay, during boss fights, during the Trial rush and when a phone panel is open. `?danger=0` turns it off. Dungeons are a separate page (`mode=dungeon`), so the meter never appears there.
- **Additions to U's markup and CSS (U, please adopt):**
  - `.rw-danger-ico` (aria-hidden): the icon, a second cue that does not depend on colour.
  - `aria-label` / `title` read "Danger here: Tough (area Lv 10, you Lv 8)".
  - `body #rw-zone .rw-danger { font-size: max(12px, 1em) }`. U's 11 px made first-ten-minutes `layout.tinyText` fail on all 6 world profiles. It now passes.
  - With `mm-hud-big`, the text and bar scale with `--mm-hud-scale`.
  - The fill eases 0.4 s only under `prefers-reduced-motion: no-preference` and when `html[data-reduce-motion="1"]` is not set.
- No new save key. Test hook: `__mm.world.danger()`.
- Test `tests/cyc1-danger-meter.test.js` (node + browser, ALL PASSED). It covers:
  - levels vs zones, for both band tables;
  - knots on the zone borders;
  - monotonic area level, hostile input;
  - exact bucket per (hero, area) and exact label text;
  - 3 distinct icons;
  - desktop: Lv 1 spawn is Comfortable; Lv 1 in Godlands is Too hot with a different word and colour; Lv 13 in Highlands follows the area level;
  - a11y: aria-label, aria-hidden icon and bar, inside the live region;
  - phone 390x844: on screen, inline in the one zone line (height < 24 px);
  - reduced motion: 0 s transition;
  - Text size 1.5 gives larger text;
  - `?danger=0`, no page errors, 0 DB requests.
- Screenshots: `img/cyc1-danger-desktop-comfortable.jpg`, `img/cyc1-danger-desktop-hot.jpg`, `img/cyc1-danger-phone-hot.jpg`.
- Regression runs (ALL PASSED): first-ten-minutes (alone), beta-w05r3-hud-narrow, world-phone-hud, beta-w05-realm-hud, realm-access2, world-events, beta-g06-quest-zones, shared-mm-overworld.

## Built: ID-03 Quest rewards that scale with zone

- `shared/mm-quests.js`: the kill quest pays `killShards(zone, need) = min(1000, 30 + need + 8 x recLv)`. Shore pays 46-58 (was 38-50), Midlands 82-94, Highlands 126-138, Godlands 170-182 (was at most 92). Each zone's cheapest quest pays more than the dearest quest of the zone before it.
- Unchanged: rolls, ids, texts, bags, and the boss and portal shards. Exports `killShards` and `REC_LV`. The quest board already prints `reward.shards`, so the new number shows there with no UI change.
- XP is NOT added. The claim shape is locked by `shared-mm-quests` ("claim keeps old shape": keys bag, bagItems, quest, shards), and an XP grant is a progression change. That is D's call for a later cycle.
- Test `tests/cyc1-quest-zone-rewards.test.js` (node, ALL PASSED). It covers:
  - a seed fingerprint over 120 dates, hashed on 86eda4b before the change: ids, zones, needs, biomes, texts, bags and the other shards are byte-identical;
  - a year of boards: monotonic by zone, exact bands, steps that follow recLv, the 1000 cap, bad zones;
  - bag tiers and summary unchanged;
  - a claim pays the scaled number once.
- Also passing: shared-mm-quests (39 assertions), cyc0-d-quest-level-hint, beta-g06-quest-zones.
- D / economy: Godlands now pays about 2x the old top. Please check shop prices in play.

## Fixed

| # | Area | Bug | Fix | Test (before -> after) |
|---|---|---|---|---|
| 1 | Town weeds | Weeds answer E before the arcade doors, dig hole, Realm Gate and visiting merchant. The weed keep-clear checks were 60 px, smaller than those rings plus the 38 px pull radius, so a weed could steal E from a door. Sweep: 370 bad weed/day pairs in a year (doors, dig hole, Realm Gate at 105 px, merchant). | `WEED_SHADOW_RINGS.push(...)` right after `PORTALS` (which is declared later): the 4 doors, dig hole, Realm Gate (+30 y, as `isNearRealmGate`) and merchant, each with real radius + WEED_PULL_RADIUS. | `beta-r4-weed-reach` extended with a reverse sweep over 366 days x 7 targets, plus "stand on each door: E reaches the door". FAIL (370) -> ALL PASS. `weeds`, `cyc0-town-interact-shadow` pass. |
| 2 | Isles AI | Chasers aimed straight at a cliff bumped (`vx = -vx`) and re-aimed 0.1 s later, pinned with the hero just behind the wall. | `steer()` in isles.js. When the straight heading is blocked a short probe ahead, it turns 45/90/135 degrees to a sticky side (first the side its motion leans to, then the other) and keeps that side while the straight line is still blocked. Used for chase and leash return. `?slide=0` restores the old aim. Curious and befriended walkers keep the straight aim: the first version also steered them, and isles-first-ten reef-b first tame moved from 110 s to 393 s (gate 180). After narrowing, it passes again. | `cyc1-isles-wall-slide`: layout A is a 9-tile wall straight between chaser and hero; layout B adds a corner pocket. `?slide=0` baseline stays pinned (best 5.5 tiles); steering reaches the hero in 4.8 s (A) and 6.5 s (B). ALL PASS. `cyc0-isles-leash`, `isles-taming`, `isles-boss`, `isles-ftue-fixes`, `isles-bugbash`, `isles-first-ten` (alone) pass. |

## Not done
- Deepdelve DD5 path replay (3D ghost trail): not started, no time left inside the time box. It needs a render pass in `deepdelve.js` and a perf check.
- Wandering Isles creatures still bounce off walls (random headings, not pinned). Only goal-directed movement steers.

## Asks
- U: adopt `.rw-danger-ico`, the 12 px floor, the hud-big scaling and the motion rule from the block under yours in `mad-maze.css` (or fold them into yours). Commit 30ab141 is cherry-picked here, so the merge is identical on both sides.
- D: verify the Tough / Too hot thresholds (3 levels) and the ID-03 shard bands in play, and decide whether kill quests should also pay XP. ID-02 and ID-03 can move to `built` in IDEAS.md.
