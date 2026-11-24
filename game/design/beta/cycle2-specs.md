# Cycle 2 specs (D): rewrites of the needs-change ideas, plus new ideas

Status words in IDEAS.md: `approved-spec` = L's cycle-1 reason is folded in, numbers and test plan are exact, S may start. `blocked-owner` = needs a decision that is not ours. Evidence tag [M2] = measured in `cycle2-design.md`. Hard limits unchanged (no streaks, no paid randomness, additive saves, Firebase never written).

## ID-01 Shore XP fade (approved-spec)
- Rule, in the kill path (`realm.js` `_gainXp(Math.round(RM_XP[e.type] * ... * (e.xpMul || 1) * this.stats.xp))`, line ~3193), NOT in `ZONE_MUL.xp`: multiply by a fade that applies only when `e.zone === 0`. Hero Lv 1-4 = 1.0, Lv 5 = 0.85, Lv 6 = 0.70, Lv 7+ = 0.60. Round afterwards, never below 1 XP. Shards, drops and boss XP untouched; Midlands and up unchanged.
- Data: `MMZones.TABLES.SHORE_XP_FADE = [1, 1, 1, 1, 0.85, 0.70, 0.60]` (index min(level, 7) - 1) and pure `MMZones.shoreFade(level, zone)` (1 for zone > 0 or bad input).
- Toast: once per session on the first faded kill: "The Midlands has better prey" (no number, no penalty wording). No save key.
- Expected: Lv 5 to 7 on the Shore slows from about 44 s to about 75 s (cycle 1 bot numbers).
- Tests: node `cyc2-shore-fade.test.js` (table, zone > 0 = 1, >= 1 XP); run `first-ten-minutes` and `isles-first-ten` ALONE before and after (Lv 1-4 untouched); `world-ttk` unchanged.

## ID-05 Bullet High contrast (approved-spec)
- One preset, "High contrast", pref `mm-bullet-contrast` (device localStorage like `mm-bullet-shapes`; no save key). Default off.
- Draw: read once per frame (`const hc = this._hc` before the bullet loop). Enemy bolts get a 1 px white rim outside the existing dark rim; player bolts draw at globalAlpha 0.5. No per-bullet style branch.
- Tests: pixel-sample (rim pixel luminance > 200 on a seeded frame; off = pixel-identical to today); `realm-bullet-bench.test.js` before and after, frame time up at most 5 percent at 320 bolts.

## ID-06 Assist sliders (approved-spec)
- Two sliders: damage taken 100 / 90 / 80 / 70 / 60 / 50 percent (one multiply in `_hitPlayer` after the guard, min 1) and aim help off / 50 / 100 percent (scales the `MMAim.assist` cone). No game-speed slider.
- Pref `mm-assist` = `{dmg, aim}` (device key, not the save). A run with dmg < 100 is tagged "Assisted" on the run summary; medals and bests are still recorded and shown with the tag. Never called "easy".
- Tests: node scale maths (50 percent of 8 = 4; min 1); browser: default byte-identical, a hit at 50 takes half, summary shows the tag.

## ID-07 Tame bond hearts (approved-spec)
- A view of the existing `bond` (1..`MAX_BOND` = 10, `bond = max(bond, 1 + floor(aff / 100))` in `mm-tames.js`): 5 hearts; heart n filled when bond >= 2n, half heart on an odd bond. No new field, no decay.
- More aff sources go through the one `aff` path: +10 aff per riding minute (cap 30 per tame per session) and +5 per fight won together (cap 25 per tame per session); a session adds at most about 0.55 bond.
- Perks are cosmetic only (bond 4 idle sway, 6 ribbon, 10 glow): a faster feed would break the `isles-first-ten` reward cadence (gap 40-43 s of 45).
- Tests: node (caps per session, bond monotone, hearts view for bond 1..10); `isles-first-ten` alone unchanged.

## ID-08 Dungeon first clears (approved-spec)
- `fc` = `{biome: 1}` for the four biomes, additive in the dungeon's own writer (the Realm save), cleaned (unknown biomes dropped). The Hub only reads it; no write to the Hub medals key.
- Summary card: "First clear: <biome>" once (flip 0 to 1) and names the next uncleared biome; reward is cosmetic (banner colour).
- Tests: node (flip once, clean drops unknown), browser (first clear shows the card, a second clear does not).

## ID-09 Daily chore card (blocked-owner, spec ready)
- Build ID-18 first (3 bounties from `mm-bounties.forDate`); ID-09 is its skin: a card of 3 optional chores, Town coins 5 / 5 / 10 (scale of `DAILY_BONUS = 5`), no streak text, nothing lost by skipping.
- Owner decision: `setupLoginStreak` and `updateSellStreak` still pay today. Keep them (the card is a third daily thing) or remove them. Default without an answer: the card ships, streaks untouched.

## ID-10 Shared result card (approved-spec)
- Migrate one game per commit in this order: Pop, Echo, Stack, Dash, each onto `mm-minikit.js` `result` + `panel`. Play again takes first focus; touch shows no key names; a near-miss line "N short of your best" only when 0 < N <= 10 percent of best. Each commit updates only that game's page test and adds a DOM assert; other games untouched.

## ID-11 Retreat to Nexus and back (approved-spec)
- No item. On the Nexus trip store `save.returnTo = {x, y, seed}` (existing cleaned shape) at the hero's tile (visited by definition). The Nexus offers "Return to where you were", landing through the existing `safeReturn` path (3 s shield, hop 6 tiles from a live event).
- Tests: browser (Nexus then return lands within 3 tiles; shield <= `SAFE_SHIELD`; a changed seed cleans `returnTo` to null, so no return).

## ID-13 Second wind gates (approved-spec, pure part built in cycle 2)
- Built: `MMZones.TABLES.FIRST_KILL_BAG_FLOOR = [1, 1, 2, 3]` (pink, pink, purple, cyan) and `rollDrop({firstKill: true})` lifts a boss bag to at least that tier; one rng draw as before. It lifts 30 / 10 / 10 / 10 percent of first boss bags (tests: `cyc2-first-kill-floor.test.js`). The effect is small by design: a floor, not a bonus.
- S wires: additive Realm save key `zk` = bitmask (bit z set after the first boss of zone z died). In the boss drop (`rollFor` with `info.boss`) pass `firstKill: !(save.zk & (1 << zone))`, set the bit, save once. Trial of Six kills (`src: 'boss'`) neither read nor set `zk`.
- Gate: `first-ten-minutes` and `isles-first-ten` alone (neither kills a boss); browser test: first Shore boss bag >= pink, second not floored.

## ID-14 Telegraph audit and hit pause (approved-spec)
- Audit: node test over `mm-telegraph` and the boss attack table: every pattern's first volley has a telegraph >= 0.4 s; raise any below and list them in the commit.
- Hit pause: draw-only, 50 ms, only for hits >= 15 percent of max HP; the renderer repeats the last frame while sim clock, bullets and timers keep running. Off under reduce motion. Test: sim state after N frames identical with pause on and off.

## New ideas (cycle 2, generic research)
Sources are generic queries (see the end). All `proposed`; effort / risk.
- ID-26 Town "Today's tide table" (S / low): the Town fishing spots show a fixed-per-day rare fish hint ("the koi bites near the pier today") from the date seed. Informs, never forces; no streak. [R] cozy daily loops reward routine, not obligation.
- ID-27 Town dig map scraps (M / low): three dug scraps in a week make a treasure map to one fixed seeded tile (tile reachable; flood-fill check); the chest pays Town coins x10. Progress never expires; no timer.
- ID-28 Town bug-and-fish museum shelf (S / low): the existing fishlog and bug counts fill a shelf; each completed family gives one decor item. Uses existing logs (read-only).
- ID-29 Villager favour of the day (S / low): one villager per date (seeded) asks for the item the Town already has the most of; handing it over pays 2x its shop value once. Skipping costs nothing.
- ID-30 Dungeon floor modifier of the day (S / low): `mm-dungeon-mutators` already exist; pick one visible mutator per date for the Daily dungeon seed, shown on the door ("Low light today"). Same seed for everyone, unlimited retries, no expiry.
- ID-31 Dungeon rest-room choice (M / low): after floor 3 a calm room offers one of three: heal 30 percent, a one-floor shield, or a map reveal. Never random; the choice is the variety. [R] roguelite "safe room" pacing.
- ID-32 Dungeon elite door (M / medium): an optional second door per floor with a visible skull = one extra elite and a guaranteed pink bag. Opt-in risk vs reward, readable before choosing. [R] bullet-hell route choice.
- ID-33 Trial of Six pacing pass (S / low, data): see `cycle2-design.md` for measured fight lengths; propose a 6-step damage ramp instead of a flat x4.0 (the first three bosses had dmgMul 4.004 / 4.004 / 4.084 at Lv 20).

Sources (generic queries, cycle 2): cozy daily loop design (Kitfox "Designing for coziness"), roguelite room variety and safe rooms (Gamedeveloper roguelike level design), daily challenge modifiers (Gamedeveloper "the 24-hour ticket"), treasure-map side quests in life-sim games.
