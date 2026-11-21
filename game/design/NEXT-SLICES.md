# Next slices: the next hours (30 slices, 3 waves)

Planner, 2026-11-21 (after b26). Replaces the previous 26-slice queue. Workers are Sonnet-class: one slice = one branch, small diffs,
logic in pure `shared/` modules, page files only for wiring. Before merge: `node game/tests/run-all.js` on port 8440, every new test
registered in `game/tests/test-tiers.json` (node tests smoke, browser tests non-smoke), every browser test uses the DB-blocking
helper (`blockDb`) and never sends chat or writes to the live DB. Saves: additive keys only; `pixeltown-save-v1` untouched.
Research behind the priorities: `RESEARCH-NEXT.md`.

## Already DONE (do not repeat)
- Class/weapon plan **S1-S13, S15** (weapons, projectile kernels, status, unlocks, class-id fix, fx-draw, engine, status wiring, Mad Maze
  wiring, world debuffs/shrines, passives + `wpn_` drops + shop, ability bar/toast/sheet, TTK sim). **Open: S14, S16 only.**
- Previous queue: N1 nexus, N2 quests, N3 portals (pure `MMPortals`, not wired), N4 pickups (coins/XP/hearts/life potion live; focus
  orbs and buff potions are rolled but never spawned), P1 world-party protocol (pure, in-memory relay, no transport), W1, Q1 bot fix,
  J1, K1, D1, F1 world-perf probe, B1 backup v2, S11, S12, S13, NX (Nexus menu + vault/quests), QB (quest board, claim pays shards
  only), DD, HR (hub medals), DG phone dungeon framing, **LB Lantern backup UI** (two-step restore with a diff summary and cancel:
  already in `lantern.js`), dungeon start cue, town offline join.
- Playtest 2 fixes #1-#4, #6, #7 (zone gradient, fire budget, early TTK + magnet, safe return, Godlands props), phone HUD polish,
  b25 dungeon tiles, b24 roster, b23 bosses, b20 portraits, b18 effects, b19 UI icons, b16/b17 bolts.
- Art: **b00-b26 delivered and registered.** Pending from Codex: **b27** (`logo_hearthvale`, `banner_shore/midlands/highlands/godlands`,
  title tile, spinner) and **b28** (`mm_portal, mm_boss, mm_shrine, mm_camp, mm_npc, mm_event, mm_player, mm_party, mm_vault`).
  Every slice keeps code fallbacks for these.
- NOT done (despite older plans): accessibility settings (AX), co-op world (CO), `world-party.test.js`, `class-weapon-ui.test.js`,
  `class-weapon-playtest.test.js`, Realm tutorial, any focus/mana resource, boss-key portals in the world.

## In flight (do not start; files busy until merged)
| Branch | Covers | Holds |
|---|---|---|
| `rw-nexus-walk` | walkable Nexus (PLAYTEST-REVIEW-2 #5) + b26 props | RW, and assume `games/mad-maze/index.html` / `mad-maze.css` |

## Serial resources (at most one slice each per wave)
RJ `game/realm.js` · RW `games/mad-maze/realm-world.js` · MM `games/mad-maze/mad-maze.js` · DJ `games/mad-maze/dungeon.js` ·
MN `game/main.js` · IX any `index.html` (`game/index.html`, `games/mad-maze/index.html`, with `mad-maze.css`).
Soft (one per wave, listed in the table): `shared/mm-backup.js`, `shared/mm-profile.js`, `lantern.js`, `hub/hub.js`.
Wave 1 uses no RW and no IX (in flight).

## Wave 1: pure modules, S14, side files (14 parallel, start now)

| id | title | files | size | serial | art | acceptance (3) | test |
|---|---|---|---|---|---|---|---|
| S14 | Backpack weapon compare, enemy pips, damage colours (+ PT2 #15) | RJ | M | RJ, Opus review | b19 `ui_slot_weapon`, rarity frames exist | hovering/long-pressing a backpack weapon shows its pattern line (shots, spread, pierce) and green/red deltas vs equipped; at most 3 status pips over any enemy (extra statuses collapse to "+n"); `armorBroken` hits draw purple numbers, crits/marked keep their own colour; the equipped class weapon is shown instead of "weapon: empty" | `class-weapon-ui.test.js` |
| FX1 | Focus (mana) resource module | NEW `shared/mm-focus.js` | S | none | none | `create(classId, level)` gives max 100 +5/level cap 200, regen 6/s (+wit); `spend(st, abilityId)` returns a copy and refuses when short (Dash 0, Nova 25, Shield 30, Overdrive/Signature 40); `restore(st, kind)` handles `focus` orb (+15) and `potion_focus` (50% max) and never exceeds max | `shared-mm-focus.test.js` |
| TG1 | Telegraph descriptor module | NEW `shared/mm-telegraph.js` | S | none | none (code-drawn) | `forVolley(pattern, tier, isBoss)` returns `{shape: ring/line/cone, windup}` with windup 0 for tier 1-2, 0.35 s tier 3+, 0.6 s bosses; colours come from `MMAccess.palette(name)`; `reduced=true` returns a static (non-pulsing) style; pure, identical output per input | `shared-mm-telegraph.test.js` |
| AC1 | Accessibility + graphics prefs | `shared/mm-access.js`, `shared/mm-backup.js` (KNOWN list) | S | mm-backup | none | `prefs.load/save(storage)` on NEW key `pixeltown-access-v1`: palette, hudScale (1/1.25/1.5), flashes, bulletOutline, lowGfx; hostile/oversized input cleaned to defaults; `MMBackup.KNOWN` gains `pixeltown-access-v1` and `pixeltown-gift-v1` and a v2 backup without them still restores | `shared-mm-access-prefs.test.js` |
| GF1 | Daily gift, no dark patterns | NEW `shared/mm-gift.js` | S | none | b15 coins/potions, b22 `token_star` | one claim per UTC day; the count is **total days claimed** (never resets, no streak loss, no countdown, nothing bought); day 7/14/30 milestones give a cosmetic token, others 20-40 shards; save `pixeltown-gift-v1` cleaned, future dates ignored | `shared-mm-gift.test.js` |
| QB1 | Quest reward bag contents | `shared/mm-quests.js` | S | none | b15 bag art exists | `rewardBag(reward, seed)` returns a bag `{tier, items[]}` (brown: 2 potions, pink: 1 uncommon gear, purple: 1 rare gear or `wpn_` style) seeded and stable; `claim` keeps its old return shape plus `bagItems`; old quest saves load | extend `shared-mm-quests.test.js` |
| TU1 | Realm tutorial steps (phone first) | `shared/mm-tutorial.js` | S | none | none | new `realmSteps()`: move, aim/shoot, pick up a bag, use an ability, enter a portal, open the Nexus, each with a coarse/fine text variant (no key names on coarse); old `STEPS`/`advance` behaviour unchanged; `skip` pays the reward once | `shared-mm-tutorial-realm.test.js` |
| CP1 | Same-device party transport | NEW `shared/mm-party-bc.js` | S | none | none | wraps `BroadcastChannel('mm-party-<seed>')` as a transport for `MMWorldParty` (send/onMessage/close); messages cleaned by `MMWorldParty` before use; a grep check finds no `firebase`, `database(` or `WebSocket` in the file | `shared-mm-party-bc.test.js` |
| BI1 | Biome boss identity (PT2 #16) | `shared/mm-biomes.js`, DJ | M | DJ | b17 `ebolt_*` (thorn = shard, mire = poison, crypt = skull, warren = orb_red) | each biome boss fires its own `ebolt_` art and palette; each has one signature attack with a 0.6 s `MMPatterns2.telegraph` wind-up; `?bosses=classic` restores purple orbs | `dungeon-boss-identity.test.js` |
| SF1 | Sound cues + ambience | `shared/sfx.js` | S | none | none (synth) | new recipes `portal, bag_rare, boss_awaken, warn, claim, ui_tap` within LIMITS; `ambience(zoneIdx)` plays a quiet looping drone only when `musicOn` and not muted, `stopAmbience()` ends it; no AudioContext is created before a user gesture | `shared-sfx-cues.test.js` |
| PF1 | Low-end profile module | NEW `shared/mm-perf.js` | S | none | none | `profile(samples, prefs)` returns tier high/mid/low with caps (dpr 2/1.5/1, sparks 64/32/12, death ghosts 24/12/4, terrain anim on/on/off); hysteresis needs 3 s before stepping up; `prefs.lowGfx` forces low | `shared-mm-perf.test.js` |
| TP1 | Town polish (PT2 #12, #13) | MN, `game/style.css` | S | MN | none | at 1280x720 "Play offline" is fully visible on the join card; the push-to-talk pill does not overlap the inventory bar; the local name label never covers the Realm Gate sign (offset or fade); test is offline (`blockDb`, 0 DB sockets, no chat) | `town-polish.test.js` |
| TQ1 | Toast queue + phone hints (PT2 #9, #10) | MM | S | MM | none | the unlock toast sits below the "Level N!" banner; two nodes in one level-up show the higher node first and merge into "2 unlocks: ..."; on `pointer: coarse` the ability sheet shows no key letters ("Nova", not "Nova (E)") | `mm-toast-queue.test.js` |
| S16 | Class/weapon playtest loop | NEW `tests/class-weapon-playtest.test.js` | S | none | none | 4 classes: equip a style, reach L4 (test hook), see a toast, kill a group, open the panel; 0 console errors; median frame < 20 ms at 390x844 | `class-weapon-playtest.test.js` |

## Wave 2: core feel wiring (8 parallel; needs `rw-nexus-walk` and Wave 1 merged)

| id | title | files | size | serial | art | acceptance (3) | test |
|---|---|---|---|---|---|---|---|
| FO2 | Focus bar + ability costs in the arena (+ PT2 #11) | RJ (uses FX1) | M | RJ, Opus review | b19 `ui_bar_focus_frame`, `ui_stat_focus` | a blue focus bar under HP on desktop and phone; Nova/Shield/Overdrive/Signature cost focus (cooldowns kept) and a short-focus tap flashes the bar instead of casting; status icons are 24 px with a stack count; `?focus=0` restores cooldown-only play; duels unchanged | `class-focus-arena.test.js` |
| BK2 | Boss-key portals in the world (arena item events) | RW (uses N3 `MMPortals`) | M | RW, Opus review | b22 `key_boss`, b14 `portal_boss` exist | world bosses and finished world events drop `key_boss` into the loot bag; "Use" in the backpack opens `portal_boss` at your feet for 120 s with a minimap ping and `portal` cue; entering opens `dungeon` with `&lair=1&biome=<zone biome>`; also: no "(Enter)" hints on coarse pointer, zone banner not clipped (PT2 #14) | `world-boss-key.test.js` |
| BL2 | Boss lair dungeon mode | DJ | M | DJ | b25 `dtile_boss_floor_*`, `dtile_key_door` | `?lair=1` builds 2 rooms (antechamber + boss) with the biome boss at 1.3x HP; the boss bag is one tier higher (blue/gold) than a normal run; leaving returns to the portal tile via the existing safe return; without `lair` nothing changes | `dungeon-lair.test.js` |
| AX2 | Realm settings sheet | MM (uses AC1) | M | MM | b19 `ui_icon_settings` | Settings sheet (menu + gear icon): palette, HUD size, reduce motion, screen flashes, low graphics, music; all targets >= 44 px, keyboard reachable, Esc closes; HUD size applies a CSS var to the Realm root at once and persists in `pixeltown-access-v1` | `access-settings.test.js` |
| SA2 | Realm audio hookup | NEW `games/mad-maze/realm-audio.js` (uses SF1) | S | none (merge before TU2) | none | reads the zone index from the public world state at 1 Hz and calls `ambience(zone)` only with music on; plays `ui_tap` on Realm buttons; with the file missing the page still runs (guards) | `realm-audio.test.js` |
| TU2 | First-run Realm tutorial (phone) | NEW `games/mad-maze/realm-tutorial.js`, IX (`games/mad-maze/index.html`: tags for realm-tutorial.js and realm-audio.js), `shared/mm-profile.js` (additive `tutorialDone`) | M | IX, mm-profile, Opus review | none (coach marks drawn in code) | a fresh profile sees one coach mark at a time (move stick, aim stick, bag, ability, portal, Nexus), learned by doing, with Skip always visible; it never shows again after done/skip, even after reload; an old profile with runs never sees it | `realm-tutorial.test.js` |
| CO2 | Co-op on the big map (relay only, fixture) | NEW `games/mad-maze/world-team.js`, NEW `tests/fixtures/world-party.html` (uses P1 + CP1) | L | none, Opus review | b28 `mm_party` pending, code dot fallback | two tabs on one seed see each other's hero ghost within 40 tiles at <= 8 Hz; a shared kill gives each tab its own bag id (no collision); 0 DB requests and 0 sockets (`blockDb`), grep finds no `firebase` in new files | `world-party.test.js` |
| GF2 | Daily gift on the hub | `hub/hub.js`, `hub/hub.css` (uses GF1) | S | hub | b15/b22 icons | a "Daily gift" card shows today's gift and the total days claimed (no streak, no timer); Claim pays once per UTC day, even after reload; a missed day changes nothing | `hub-gift.test.js` |

## Wave 3: readability, rewards, phones (8 parallel; needs Wave 2 merged)

| id | title | files | size | serial | art | acceptance (3) | test |
|---|---|---|---|---|---|---|---|
| TG3 | Enemy telegraphs + colour-blind bullets | RJ (uses TG1, AC1) | M | RJ, Opus review | b18 effects optional | tier 3+ enemies and world bosses show a ring/line wind-up before ring/aimed volleys and play `warn`; with a colour-blind palette, enemy bullets take its colours plus a 2 px outline; reduce-motion makes telegraphs static, flashes off removes hit flashes; `?telegraph=0` off | `world-telegraph.test.js` |
| RB3 | Rewards pass: quest bags, focus orbs, buff potions (+ PT2 #8) | RW (uses QB1, FO2, N4) | L | RW, Opus review | b15 `focus_pickup`, `potion_power/swift/guard/wit`, bags | claiming a quest drops a real bag by the Quest Giver with `rewardBag` items (pays once after reload); focus orbs and the 4 buff potions now spawn and apply (buff shows as a status icon with time left); a disabled Claim looks disabled (outline + progress bar). Split the quest bag to the next hour if it runs long | `world-rewards.test.js` |
| DP3 | Dungeon pickups | DJ (uses N4, FO2) | S | DJ | b15 exists | room clears and chests drop MMPickups coins/hearts/focus with the world rules; magnet radius matches the world; seeds give the same drops | `dungeon-pickups.test.js` |
| PF3 | Low graphics mode + auto low-end | MM (uses PF1, AC1) | M | MM | none | "Low graphics" (or 3 s of slow frames) caps sparks/death ghosts, lowers resolution via the existing perf guard and stops terrain animation; `world-perf.test.js` at 4x throttle improves the median frame vs high; turning it off restores everything | extend `world-perf.test.js` |
| CO3 | Co-op page hookup (behind a flag) | IX (`games/mad-maze/index.html` tag for world-team.js) | S | IX | b28 `mm_party` fallback | `?party=local` joins the same-device party; the minimap shows the partner dot; without the flag no BroadcastChannel is opened; 0 DB sockets | extend `world-party.test.js` |
| LB3 | Lantern backup reminder (calm) | `lantern.js`, `lantern.css` | S | LJ | b19 icons | the backup card shows "Last backup: N days ago" (stored in `pixeltown-access-v1`, no popups, no nagging elsewhere); export covers the access and gift keys; a backup without them still restores | extend `lantern-page.test.js` |
| AR3 | b27/b28 art register (if delivered) | `game/assets/arcane/INDEX.json`, `hub/index.html`, `hub/hub.css` | S | hub | b27, b28 | logo on the hub header with a text fallback; INDEX registers b27/b28; in-world banner/minimap use waits for the next RW slot (note on the board) | extend `art-manifest.test.js` |
| QA3 | Playtest bot run 3 | `game/tools/playtest-bot/*`, NEW `design/PLAYTEST-REVIEW-3.md` | S | none | none | DB and WebSockets blocked (0 opened); covers tutorial, focus, a boss-key lair, settings sheet and co-op fixture on desktop + phone; deltas vs review 2 listed | bot summary.json |

Merge order per wave: pure modules -> RJ -> RW -> DJ -> MM -> IX -> hub/Lantern -> docs. In Wave 2 merge SA2 before TU2 (TU2's
script tag must not 404).

## QA plan
- Opus review: S14, FO2, BK2, TU2, CO2, TG3, RB3 (core combat, saves or co-op).
- Saves fixture: old `pixeltown-save-v1`, pre-world `pixeltown-mm-v1`, empty `pixeltown-realm-v1`, no `pixeltown-arms-v1`, no
  `pixeltown-access-v1`, no `pixeltown-gift-v1` must all load in every save-touching slice.
- Phone: FO2, BK2, AX2, TU2, TG3 attach 390x844 screenshots; targets >= 44 px and clear of both sticks.
- Every new flag (`?focus=0`, `?telegraph=0`, `?lair=1`, `?party=local`) has a test for both states.

## Risks
1. RJ is the bottleneck (S14 -> FO2 -> TG3): strictly serial, logic in FX1/TG1.
2. RB3 is large; its pure halves (QB1, N4) land in Wave 1 so wiring is mechanical; split if needed.
3. Focus changes ability feel: `?focus=0` and the TTK sim (`class-weapon-sim.test.js`) must still pass.
4. Co-op is same-device relay only; any network transport is a later owner decision. Any DB path is a blocker.
5. b27/b28 may not arrive: AR3 is optional, fallbacks everywhere.
6. Daily gift must stay calm: no streaks, timers, loss or purchases (reviewer checks the copy).
