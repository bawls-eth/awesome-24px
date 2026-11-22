# Next slices 3: 20 slices in 4 waves (saves P2s, isle depth, Town flow, calm retention, minigame depth, access/perf, QA gates)

Planner, 2026-11-22 (read-only pass after `fb6b312`). This file supersedes the open parts of `NEXT-SLICES-2.md`.
Sources read: NEXT-SLICES-2, STATUS, DAILY-REPORT tail, NAV-AUDIT, REVIEW-GEAR-SAVES, TEAM-BOARD tail, FEEDBACK-INBOX (empty: no
player notes yet), `game/design/feedback/` (only `.gitkeep`), and the tree itself (`shared/`, `games/isles/`, `hub/`, `main.js`, `assets/arcane/`).

The rules for every slice are the same as in NEXT-SLICES-2 and AGENTS.md:
- One slice = one branch. Logic goes in pure `shared/` modules, and page files only wire it up.
- Run `node game/tests/run-all.js` on port 8440 before asking for a merge.
- Every new test is appended to `tests/test-tiers.json`. Every browser test uses `blockDb` and asserts 0 DB requests and 0 sockets.
  Town tests add `routeWebSocket` + **Play offline** and assert `db.ws.length === 0`.
- No chat and no live-DB writes. `net.js` and `firebase-config.js` diffs stay empty.
- Saves are additive only, and `pixeltown-save-v1` stays backward compatible.
- Original art only, and every asset has a code fallback.
- Never weaken a test. When a default flips, the old assertion moves to the explicit flag.
- **No guilt mechanics:** no streaks, no "you missed a day", no expiring rewards, no countdowns to log in, no notifications.

## 0. State checked in the tree (not taken from older plans)

**Done since NEXT-SLICES-2:**
- X1-X6, GB, GF, GW, GH, CO3, FT1, FT2, P1, nav A-D.
- The saves review fixed F1-F8, F10 and F15 (`535faf6`).
- Forge data is gated behind `RM_FORGE_DEFAULT_ON = false` (the F3 one-deploy gate).

**In flight** (branches exist at `fb6b312` with no commits yet; all five merge before Wave 1 starts):

| branch | slice | serial / soft resources it holds |
|---|---|---|
| `nav-e` | Nav E: Town "Where to?", gate pointer, Continue link, gate menu labels | MN |
| `isles-aw2` | AW2: wire b31af / b32s / b34b / b35 / b36 | `mm-isle-art.js`, `mm-creature-strips.js`, INDEX |
| `isles-x7` | X7: home build, sea-chart travel, live env meters, isles medals | IS, `hub/medals.js`, NEW `mm-home-build.js` |
| `perf-p2` | P2: arena hot-path perf + the forge-default flip | RJ |
| `hub-report` | Games report results to the hub | `hub/*` |

**Found in this pass (new; these are not in any review yet):**
1. **Mars is a progression dead end.**
   - `rocket_core` needs `iron x4`, and `MMIsleCraft.sourcesOf('iron')` returns only `pack:mars`, `drop:mars_loot` and `drop:mars_boss`.
   - So a normal player can never craft the item that unlocks mars.
   - Players reach mars today only through a `?isle=mars` URL, which marks it `visited` and therefore open (`isles.js:1439`).
   - `o2_tank` (mars air) has the same problem: it needs iron.
2. **Mount abilities do nothing.**
   - `MMCreatures` gives every mount a `ride.ability`: `sprint, charge, stomp, roar, warm_aura, pounce, dive, skim, float_dock, leap, hover, burrow`.
   - `games/isles/isles.js` never reads it (a grep finds 0 hits for any ability name).
   - Mounts differ only by speed, plus swim on the reef.
3. **Dead-end drops.** `DROP_TABLES` and pack resources produce items that no recipe uses:
   `feather, wool, honey, bone, tyrant_scale, frost_heart, rift_stone, glow_gel, data_chip, cocoa, salt, spring_salt, ice_core, driftwood, stone, apple`.
4. **Tundra and mars have no `rare`.** Only meadow (`oakback`) and reef (`isleback_turtle`) have one.
5. **The b34 item art is partial and its ids drift.**
   - `b34-taming-ui-items/items` holds only 4 of the 12 icons that were asked for.
   - One of them is named `item_jungle_berries`, but the code id is `jungle_berry`.
   - The `ui/` folder has 10 of 18 icons. Missing: `ui_stable, ui_wellfed, ui_warmth, ui_breath, ui_oxygen, ui_tamer_rank, ui_icon_isles, ui_icon_sea_chart`.
   - No code reads any `item_*` or `icon_*` file yet (AW2 may wire the b34b icons).
6. **The NEXT-SLICES-2 terrain counts were wrong.**
   - Reef has 12 unique terrains (not 11), tundra 13 (not 12) and mars 14 (not 20).
   - `dock_planks`, `deep_water` and `shallow_water` are shared terrains.
   - The corrected list is in section 6.
7. **Access and perf gaps.**
   - `MMSideAccess` (text scale, reduced motion from `pixeltown-access-v1`) is loaded on the hub, Jam, Stalk and Deepdelve only.
     **Isles, Bug Safari and Angler ignore it.**
   - `MMPerf` (low/mid/high tier) is used only by the Realm page (`mad-maze.js`). The isles and the Town have no low tier.
8. **Bug Safari reports no hub medals.** `hub/medals.js` `GAMES` has no `bugs` entry.
9. **Isles FTUE gate covers too little.** It covers only jungle and only the first tame (`ftue-metrics.json` isles-jungle-a/b/c).
   There is no Town first-ten-minutes gate.
10. **TD is not built.** The Hearthvale dock signpost (TD, NEXT-SLICES-2 wave 4) does not exist: `main.js` has no `isles` reference.

**Still open from REVIEW-GEAR-SAVES** (P2, all still reproducible by reading the code):

| # | Problem | Where |
|---|---|---|
| F9 | Partner pickup ignores `b.gear` | `realm.js:3217` (`this.collectItem(b.id, b.r)`) |
| F11 | A full pack sells at the classic price after the pity was spent | `realm.js` collectItem path; `dungeon.js:477/505` `sold: full` |
| F12 | World pity is read from a stale save | `realm-world.js:699`, uses `save` from create time |
| F13 | Reforge forfeits the stash pending find | `mm-stash.js` |
| F14 | The pregear snapshot has no size guard and no restore path | `mm-backup.js:215-229` |
| F16 | Every kill costs a full persist | `realm.js:493` `_persist` |
| F17 | `importLegacy` copies soulbound items | `mm-profile.js:115` |

The forge flip in P2 also makes F3 live again for any tab that is older than `535faf6`. SV1 adds a check for this.

## 1. Serial resources (at most one slice each per wave)
**Serial (hard) resources:**

| key | files |
|---|---|
| RJ | `game/realm.js` + `realm-ui.css` |
| RW | `games/mad-maze/realm-world.js` |
| DJ | `games/mad-maze/dungeon.js` |
| MM | `games/mad-maze/mad-maze.js` + its `index.html` / css |
| MN | `game/main.js` + `game/index.html` (Town) |
| IS | `games/isles/*` |

**Soft resources (one owner per wave, named in the table):**
- `shared/mm-isle-craft.js`
- `shared/mm-isle-boss.js`
- `shared/mm-biome-packs.js`: its `pack-golden.json` hashes must stay identical
- `hub/*`
- `game/assets/arcane/INDEX.json`
- `shared/mm-stash.js`
- `games/<minigame>/*` (per folder)

Merge order per wave: pure modules → RJ → RW/DJ → MM → IS → hub/MN → art/docs. Opus review: SV1, SV2, XW1, XB, TN1, TN2.

---

## Wave 1: saves P2s, the mars fix, mount-ability engine, Town dock sign (after the five in-flight branches)

| id | title | files | size | serial | depends |
|---|---|---|---|---|---|
| SV1 | Arena save P2s: F9, F11 (arena half), F13, F16 + forge-flip old-tab guard | RJ (`collectItem`, the partner pickup, the bag-inactive path, `reforge`, `_persist` coalescing), `shared/mm-stash.js` (add `renumberFind(storage, oldN, newN)`), NEW `tests/gear-save-fixes-2.test.js` | M | RJ, mm-stash, Opus | P2 merged |
| SV2 | World/dungeon save P2s: F12, F11 (dungeon half), write-failure notes | RW (re-read stored `gp` right before the z3 boss `rollGear`/`pityStep`; `writeSave` returns a boolean and shows the calm "Storage full" note), DJ (`gearGrant` on a full pack keeps the bag instead of selling; or it sells at `rmSellValue({r,t})`), NEW `tests/gear-save-fixes-3.test.js` | M | RW, DJ, Opus | none |
| SV3 | Backup hygiene: F14 + F17 | `shared/mm-backup.js` (`snapshotPregear` skips bundles over 1 MB and respects `MAX_TOTAL`; `planRestorePregear` / `dropPregear`), `games/mad-maze/lantern.js` + `lantern.html` (restore row with plan + confirm; "delete old snapshot" after a normal download), `shared/mm-profile.js` (`importLegacy` skips `t >= 11` and returns `skippedSoulbound`), NEW `tests/backup-pregear.test.js` | S | none | none |
| XD1 | Isle depth tables (pure): the mars fix, recipes for dead-end drops, mount-ability engine | `shared/mm-isle-craft.js` (additive recipes; `rocket_core` / `o2_tank` reachable without mars), NEW `shared/mm-mount-ability.js` (`MMMountAbility`), NEW `tests/shared-mm-mount-ability.test.js`, `tests/shared-mm-isle-craft.test.js` (append blocks) | L | mm-isle-craft | none |
| TN1 | Town dock signpost to the isles + arrival spots (was TD) | MN (a sign near the pond dock that uses the same `location.href` path as "World map"; `?from=isles|hub|realm|game` puts the player at the dock / board / gate instead of the plaza; no `net.*` call), NEW `tests/town-isles-sign.test.js` | S | MN, Opus | nav E merged |

**SV1 acceptance** (`gear-save-fixes-2.test.js`, one block per finding, Node vm + one Chromium block)
1. F9: a partner pickup of a bag that has `b.gear` is refused, or it carries `{t,a,sig}` through `collectItem(id, r, gear)`.
   - The choice is documented in the code. The test asserts the partner never receives a T0 copy of a tiered item.
   - `b.gear` is `null` after any bag goes inactive. One shared kill gives exactly 1 item to each seat, never 3.
2. F11: with a full pack, a T12 pickup sells for `rmSellValue({r,t})`, or the bag stays on the ground. It never sells at `RM_RARITIES[r].sell`.
3. F13: reforging an item that has a pending stash find moves that find to the new uid. Then `MMStash.payout` pays it (Node, real `mm-stash.js`).
4. F16: a splash kill of 8 enemies in one frame calls `writeSave` **at most once** per frame or per 250 ms. There is a flush on:
   - death, menu open, exit and `visibilitychange:hidden`;
   - `pagehide`.

   A spy counts `JSON.stringify` calls per frame (≤ 2).
5. Old-tab guard after the forge flip: the downgrade hint fires when a pre-`535faf6` cleaner rewrites a save that had `dust > 0` or forged items.
   - The pre-`535faf6` cleaner is loaded from `git show 2451f5b:game/realm.js` into a fixture.
   - The hint offers a backup restore. Nothing restores automatically.
6. `gear-save-fixes.test.js`, `gear-*` and `class-weapon-*` are unchanged and green.

**SV2 acceptance** (`gear-save-fixes-3.test.js`)
1. F12: two world pages share one storage, and both start with `gp.b = 60`. Killing a z3 boss in each gives **one** forced T12 in total.
   The second page reads the stored pity just before its roll.
2. F11: with a full pack, a dungeon `gearGrant` keeps the bag and shows "Backpack full: make room, the bag waits".
   The pity stays spent, but the item can still be picked up. Old saves load byte-identical.
3. A `setItem` that throws once shows the "Storage full" note once, and nothing is lost on the next write (re-checks F1 through the world path).

**SV3 acceptance** (`backup-pregear.test.js`, Node + Lantern page)
1. A 1.2 MB bundle is not snapshotted (returns `'too-big'`), and a total over `MAX_TOTAL` is skipped.
2. The Lantern shows "Restore the pre-gear snapshot" only when the key exists:
   - plan first (what changes, item counts);
   - then confirm;
   - never automatically.

   Deleting the snapshot needs a confirm.
3. `importLegacy` with a T11 item skips it and says so in the Lantern text, so `MMStash.payout` still refuses soulbound items.
4. Every older backup file version restores unchanged (`shared-mm-backup*.test.js` green).

**XD1 acceptance** (Node only)
1. Mars fix (`rocket_core` and `o2_tank`):
   - `rocket_core` can be crafted from inputs found on home, jungle, reef or tundra. Proposal: `driftwood 3, frost_crystal 2, amber 2, pearl 1`.
   - `o2_tank` gets an alternative recipe, `o2_tank_kelp` (`kelp 3, shell 2, ice 2`). Both recipe ids produce `o2_tank`.
   - A new `validate()` rule fails when an unlock item for island X needs an input whose only sources are on X.
   - A `reachability()` walk proves every island opens from a fresh save (home, then jungle, then reef, tundra and mars).
2. Every item in section 0 item 3 is used by at least one recipe. Proposals:
   - `heat_pack` (spring_salt, fiber): extra warmth;
   - `glow_lamp` (glow_gel, shell): a light at home;
   - `bone_charm` (bone, feather): +1 tame trust;
   - `honey_cake` (honey, apple, wool): an S/M taming treat;
   - `trophy_tyrant` / `trophy_hydra` / `trophy_dragon` / `trophy_titan` (each boss's unique drop): home decor;
   - `signal_beacon` (data_chip, ice_core, meteor_glass): mars waypoint;
   - `sea_salt_snack` (salt, cocoa).

   Each input still has 2+ sources (existing rule), except the four boss trophies, which have exactly one source by design.
   Those are flagged `trophy:true`, and validate allows them.
3. `MMMountAbility.def(ability)` covers all 12 abilities from `MMCreatures`.
   - Each one has a cooldown (3-12 s), a duration and a pure effect. Examples:
     - `charge` = a dash plus knock-back in a line, with a 0.5 s windup line;
     - `stomp` / `roar` = a ring stun on small creatures;
     - `warm_aura` = no warmth drain within 3 tiles for the party;
     - `dive` = cross deep water plus a breath meter that refills;
     - `skim` = cross `kelp_bed` / `coral_shallows` at full speed;
     - `pounce` = a target leap;
     - `leap` = jump one solid tile (`crater_rim`);
     - `hover` = cross `dust_shallows` and `lava_vent` with no burn;
     - `burrow` = a short untargetable dash;
     - `sprint` = x1.4 for 3 s;
     - `float_dock` = a turtle you can stand on while it swims.
   - `step(state, input, dt)` is seeded and pure, and no ability ever hurts the rider.
   - It exports a `KILL_FLAG = 'ability'` for `?ability=0`.

**TN1 acceptance** (`town-isles-sign.test.js`, offline: blockDb + routeWebSocket + Play offline)
1. The sign shows within 200 px of the dock with a "⛵ Isles" label ≥ 12 px. Pressing A (or tapping the sign at ≥ 44 px) navigates to
   `games/isles/index.html?from=town`.
2. Loading the Town with `?from=isles` and joining offline spawns the player within 120 px of the dock. `?from=realm` spawns at the
   gate exit spot (`REALM_GATE_POS + 116`). Any unknown value spawns at the default.
3. 0 DB writes, `db.ws.length === 0`, no chat, an empty diff for `net.js` / `firebase-config.js`, and the `town-perf` median is
   unchanged within 5%.

---

## Wave 2: wire isle depth, two new FTUE gates, Bug Safari and Deepdelve depth

| id | title | files | size | serial | depends |
|---|---|---|---|---|---|
| XW1 | Mount abilities + reef/tundra/mars depth on the page | IS (`isles.js`: ability button, terrain rules, tundra/mars rares through a page-side table, new recipes in the craft panel, the `__isles.events()` reward log; `isles.css`; `index.html` tag for `mm-mount-ability.js`) | L | IS, Opus | XD1, X7 |
| QI | Isles first-ten-minutes gate 2 (every island, not only the first tame) | NEW `tests/isles-first-ten.test.js`, NEW `tests/fixtures/isles-ftue-profiles.json`, `design/ftue-metrics.json` (adds an `isles2` section, counts only) | M | none | merges after XW1 in the same wave |
| QT | Town first-ten-minutes gate | NEW `tests/town-first-ten.test.js`, NEW `tests/fixtures/town-ftue-profiles.json`, `design/ftue-metrics.json` (`town` section) | M | none | nav E, TN1 |
| MG1 | Bug Safari depth: medals, journal goals, night glade, access | `games/festival/bugs.*`, `shared/mm-bugs.js` (additive), `hub/medals.js` (`GAMES.bugs`), NEW `tests/bugs-depth.test.js` | M | hub, games/festival | hub-report merged |
| MG2 | Deepdelve depth: a crystal grotto band, blueprints, a calm creative mode | `games/deepdelve/*`, `shared/mm-dd-craft.js`, `shared/mm-dd-spawn.js` (additive bands), NEW `tests/deepdelve-depth2.test.js` | M | games/deepdelve | none |

**XW1 acceptance** (`isles-depth.test.js` + `isles-abilities.test.js`)
1. Riding any mount shows **one** ability button.
   - Size 56 px, with an `aria-label` that names the ability. It does not overlap either stick at 390x844.
   - A cooldown ring is shown, and with reduced motion it is static.
   - Key `Q` triggers it on desktop.
   - Each of the 12 abilities does its `MMMountAbility` effect in a seeded run. With `?ability=0`, riding works as it does today.
2. Reef:
   - `dive` on a tidesteed crosses `abyss` and shows the breath meter.
   - Pearls under `kelp_bed` can only be gathered while diving.
   - `skim` on a skimray crosses `coral_shallows` at full speed.
   - Standing on a moving `isleback_turtle` works (`float_dock`).
   - Dismounting in water still puts the hero on the nearest walkable tile.
3. Tundra:
   - `warm_aura` (shagtusk) stops warmth drain for the party.
   - A hot spring refills warmth, and `ice_thin` cracks after 1.5 s of standing on it, with a telegraph. It slows the player and never does damage.
   - A tundra rare (`frostfox` "aurora" variant, 1 per island, zone 3) comes from a page-side table, so pack-golden stays identical.
4. Mars:
   - `leap` (crater_strider) crosses one `crater_rim` tile.
   - `hover` (void_grazer) crosses `dust_shallows` and `lava_vent`.
   - `lava_vent` burns only after its telegraph.
   - The mars rare is a `rustbeetle` "chrome" variant.
   - A fresh save can reach mars through crafting (the XD1 recipe). It is tested from a fresh profile through `__isles.craft` and sail.
5. `__isles.events()` returns a ring buffer of `{t, kind}` with kinds `gather, craft, tame_progress, tame, ride, sail, medal, log, ability`.
   It is test-only (`?test=1`) and holds no text.
6. Existing isles tests (`isles-*.test.js`, `archipelago-*.test.js`) are unchanged and green. The `archipelago-perf` median stays < 20 ms.

**QI acceptance** (sim time, no sleeps, ≤ 90 s wall clock per profile, 390x844, touch, coarse pointer)
1. A fresh home profile, `games/isles/index.html?test=1&seed=N`, for 3 seeds:

   | check | target |
   |---|---|
   | first gather | ≤ 30 s |
   | first craft | ≤ 240 s |
   | first tame | ≤ 180 s |
   | first ride | ≤ 360 s |
   | first sail to another island | ≤ 600 s |
   | longest gap between reward events (`__isles.events()`) | < 60 s |
   | deaths for the scripted bot | ≤ 1 |
   | hint text names the next action | ≥ 95% of samples |

2. Spot gate for each of `?isle=jungle|reef|ice|mars`:
   - the first frame shows within 3 s;
   - 0 console errors;
   - no visible button under 44 px or over a stick;
   - no text under 12 px;
   - the hint names an action within 10 s;
   - ice and mars show their meter within 5 s;
   - the meter warning appears ≥ 10 s before any effect.
3. It writes counts only to `ftue-metrics.json`, and it fails on the first missed threshold. 0 DB requests, 0 sockets.

**QT acceptance** (offline Town: blockDb + routeWebSocket + Play offline as `ADMINftue`; never chats; 390x844 and 1280x720)
1. From join, "Play offline" is offered within 6 s, and joining takes ≤ 3 taps after typing a name.
2. The gate pointer chip is visible on the first spawn. Reaching the first Realm fight takes ≤ 4 taps after join (Where to?, Realm, pick class, Skip).
3. Every catalogue destination can be reached in ≤ 2 taps from the Town HUD (Where to? sheet). The dock sign leads to the isles and back (TN1).
4. A loop of Town → Isles → Town keeps the name, so the player does not see an empty join form a second time, and "Continue: Isles - ..." shows.
5. No text under 12 px on the play screen. Every control under 44 px is either fixed or listed in a frozen `legacySmall` allow-list.
   The list may only shrink, and the test fails if it grows.
6. `db.ws.length === 0`, 0 matching HTTP requests leave the page, and the `town-perf` check is unchanged.

**MG1 acceptance**
1. `pixeltown-medals-bugs-v1` = `{v:1, m:[...]}` with `first_catch`, `species7` (all 7), `stars10`, `moonwing`. The hub shows them through `GAMES.bugs`.
2. Journal goals:
   - 3 goals per arena ("catch 3 crickets sneaking", ...);
   - each finished goal gives a star;
   - there are no timers outside the existing 90 s run, and nothing ever expires.
3. "Night glade" variant of `lantern`:
   - it unlocks by stars and is never locked by time;
   - fireflies need a slow approach;
   - with reduced motion the glow is static.
4. Access: `MMSideAccess` is loaded, so `--ui-scale` and `data-reduce-motion` apply. The unlock rule text reads "Needs N stars".
   The three back links are hidden behind mm-nav and stay in the DOM. `bugs-page` / `bugs-polish` tests are unchanged.

**MG2 acceptance**
1. Crystal grotto band:
   - depth 25-40 has a new ore (`glowstone`) and a calm light source, plus 4 recipes in `mm-dd-craft`;
   - it is seeded;
   - old worlds keep their saved chunk diffs (IndexedDB round trip).
2. Blueprints: 3 build goals (hut, bridge, lighthouse) are checked by block pattern. They add hub medals `build1` / `build3` (additive).
3. Creative mode (`?mode=creative`, plus a toggle on the title screen):
   - no mobs, unlimited blocks;
   - its own save key `pixeltown-deepdelve-creative-v1`;
   - it never touches the survival DB.

   The `deepdelve-*` tests are unchanged, and the `deepdelve-perf` median does not regress by more than 5%.

---

## Wave 3: isle boss depth, Town polish, calm goals, Angler and Jam/Stalk depth

| id | title | files | size | serial | depends |
|---|---|---|---|---|---|
| XB | Boss depth: unique mechanics, trophies, rematch at home | `shared/mm-isle-boss.js` (scripts per boss), IS (trophy pedestal at home, rematch, boss loot to trophies), NEW `tests/isles-boss-depth.test.js`, `tests/isle-boss-sim.test.js` (add cases; existing cases unchanged) | L | IS, mm-isle-boss, Opus | XW1 |
| TN2 | Town polish after nav E: postcard board, arrival plaza, Town low-end tier | MN (a read-only "Postcards" board that reads `pixeltown-medals-*-v1` and shows "Recently: First tame on the isles"; an arrival puff at the dock/gate; MMPerf low tier caps Town particles, the weather and the NPC update rate; `index.html` tag for `mm-perf.js`), NEW `tests/town-postcards.test.js`, `tests/town-perf.test.js` (add a low-tier case) | M | MN, Opus | TN1, QT |
| RT1 | Calm goals ("Things you could do"): pure + hub card | NEW `shared/mm-calm-goals.js` (`MMCalmGoals.suggest(medals, nav, seed)` → 3 suggestions from unearned medals across games; no timers, no streaks, no "missed"), `hub/*` (a card on the map plus a row in the Where-to sheet through `MMNav.onOpen`), NEW `tests/shared-mm-calm-goals.test.js`, NEW `tests/hub-calm-goals.test.js` | M | hub | MG1, X7 |
| MG3 | Angler depth: bug bait from Bug Safari, isles fish, aquarium decor | `games/angler/*`, `shared/mm-angler-depth.js` (additive), NEW `tests/angler-depth2.test.js` | M | games/angler | MG1 |
| MG4 | Jam + Stalk depth: Relax mode, lane-shape assist; Stalk market notes | `games/jam/*`, `shared/mm-jam.js` (additive), `games/stalk/*`, `shared/mm-stalk-market.js` (display only), NEW `tests/jam-relax.test.js`, NEW `tests/stalk-notes.test.js` | M | games/jam, games/stalk | none |

**XB acceptance**
1. Each boss has 1 signature mechanic in its existing phase scripts:
   - `tide_hydra`: 3 heads, cut in any order, and a submerged phase with bubble telegraphs;
   - `frost_dragon`: cone breath that leaves `ice_thin`, so the player can stand on hot springs;
   - `red_titan`: a burrow line telegraph and lava vents;
   - `fernjaw_tyrant`: a roar ring and a charge line.
   - Every windup is ≥ 0.6 s (≥ 0.8 s for slams), at most 2 hazards are live, and there is no enrage and no one-shot.
   - The sim median is still 60-180 s solo at DPS 20.
2. A boss's unique drop crafts its `trophy_*` (XD1). The trophy sits on a home pedestal and survives a reload (`pixeltown-archipelago-v1`, additive).
   The pedestal offers a **rematch** at any time, with no cooldown, and it gives normal loot only.
3. Reduced motion makes telegraphs static, and `?tame=0` plus `?ability=0` still work.

**TN2 acceptance**
1. The Postcards board:
   - renders with `textContent` only;
   - reads local keys only (no DB);
   - shows nothing for hostile JSON;
   - has text ≥ 12 px and targets ≥ 44 px;
   - never says "you missed", "streak", "come back" or a countdown (the test greps the strings).
2. The low tier forced through `pixeltown-access-v1.lowGfx` cuts the median frame time by ≥ 15% under a 4x CDP throttle.
   The default tier is unchanged.
3. Offline only, `db.ws.length === 0`, and a grep shows no new `net.` call in the diff.

**RT1 acceptance**
1. `suggest()` is deterministic per day seed. Suggestions only point to unearned medals and never repeat a dismissed one, and dismissals
   are stored in `pixeltown-nav-v1.dismissed` (additive).
   - Every string passes the "no guilt" grep: `streak|missed|expires|hurry|last chance|don't lose`.
   - The daily gift stays as it is: no streak counter is added, and gift text is unchanged.
2. Tapping a suggestion opens the right page through the catalogue URL allow-list. With `?calm=0`, the card is hidden.
3. With 0 medals, the suggestions are 3 first-step goals (first tame, first catch, first star).

**MG3 acceptance**
1. Bait:
   - the Angler reads `pixeltown-bugs-v1.journal` **read-only**, and each bug species caught unlocks one bait type that biases rarity by ≤ +10%;
   - the Angler never writes the bugs key;
   - nothing is consumed from Bug Safari.
2. An "Isles cove" pond appears when the archipelago save has visited reef, with 6 new fish (journal additive) and no new currency.
3. `MMSideAccess` is loaded on the Angler, and the `angler-*` tests are unchanged.

**MG4 acceptance**
1. Jam Relax mode:
   - no fail and no score shame;
   - stars are earned only in normal mode, and Relax shows "practice" stars that do not count;
   - lanes get shapes (●▲■◆) as well as colors, so they pass in every `MMAccess` palette;
   - hold notes can be set to "tap only" (hold-to-toggle, per Xbox Accessibility Guideline 107).
2. Stalk:
   - a "market notes" panel explains last week's price shape in plain words (it reads from `mm-stalk-market`, display only);
   - the "week 2969" label becomes "Week of <date>";
   - play money only (a grep finds no real-money or purchase strings).
3. The `jam-*` / `stalk-*` tests are unchanged.

---

## Wave 4: isles perf + access, b37+ art wiring, save fuzz, Nexus vendor, Realm access

| id | title | files | size | serial | depends |
|---|---|---|---|---|---|
| PI | Isles phone perf + access | IS (`MMPerf` tier: low = dpr 1, 12 sparks, terrain anim off, companion AI at 15 Hz; `MMSideAccess` tag; one-thumb mode: auto-fire on and the ability button by the stick; shape icons on meters), `tests/archipelago-perf.test.js` (add a low-tier case; existing case unchanged) | M | IS | XB |
| AW3 | Wire Codex b37-b40 (+ b34c) if delivered | `shared/mm-isle-art.js` (`TERRAINS` per pack, `tile_<t>_<a..d>`, `_edge_NN`), `shared/mm-creature-strips.js`, NEW `shared/mm-item-art.js` (`item_<id>` / `icon_<id>` lookup for the craft panel and pouch), `game/assets/arcane/INDEX.json` | M | INDEX | Codex batches |
| FZ | Save-merge fuzz + old-tab soak (QA only) | NEW `tests/save-merge-fuzz.test.js` (Node: 5,000 seeded runs of 2-3 "tabs" with random picks, sells, combines, reforges, failed writes, an old cleaner from `2451f5b`; invariants: no duplicate uid, item count never rises without a pickup, a tiered item never loses `t`, dust never goes negative, soulbound never reaches the stash) | M | none | SV1, SV2 |
| VN | Nexus vendor + forge NPC (carried over from NEXT-SLICES-2) | RW (Nexus stall: `vendorStock`, buy-back for dust, opens the Forge tab), `shared/mm-nexus.js`, NEW `tests/nexus-vendor.test.js` | M | RW | forge flip in P2 |
| AR | Realm access: one-thumb + hold-to-toggle + bullet shapes | RJ (toggle auto-fire, "hold to aim" → toggle, enemy bullets with a shape outline per `MMAccess` palette, text scale reaches the HUD), NEW `tests/realm-access2.test.js` | M | RJ | SV1 |

**PI acceptance**
1. The low tier (forced through `lowGfx`) gives a median < 16 ms and p95 < 28 ms in the P1 scene (24 creatures, 4 XL, 2 companions, riding,
   4x throttle). High tier draws exactly as it does today (pixel-hash compare on one seeded frame).
2. `--ui-scale` 1.5 keeps every button on screen at 390x844 with no overlap. Reduced motion stops the water and terrain animation.
3. In one-thumb mode the whole first ten minutes from QI passes with no second-thumb input (the QI bot is rerun with `oneThumb:true`).

**AW3 acceptance**
1. `art-manifest.test.js` registers each delivered id.
2. Each pack terrain resolves `tile_<terrain>_<a..d>`, and any missing id falls back to the palette with 0 console errors.
   `item_jungle_berries` resolves as an alias of `jungle_berry`.
3. `?art=0` is code only. The mount seat comes from the manifest. `archipelago-perf` is unchanged within 5%.

**FZ acceptance:** all invariants hold for 5,000 seeds. Runtime is ≤ 60 s, and the test is in the smoke tier. A failure prints the seed and the
shortest failing op list.

**VN acceptance:**
1. The vendor sells T1-T3 only, at fixed prices.
2. Buy-back pays dust.
3. The Forge opens from the stall.
4. No real money and no random packs.
5. A save without the vendor loads fine.
6. `?forge=0` hides the stall.

**AR acceptance**
1. Toggling auto-fire makes the whole FT1 world profile pass with one thumb.
2. Bullets differ by shape, not only by color, in all `MMAccess.PALETTES`, and each one passes `passesContrast`.
3. Duels and the Town classic arena are unchanged (runtime spy).

---

## 2. Wave at a glance (serial check)

| wave | RJ | RW | DJ | MM | MN | IS | soft |
|---|---|---|---|---|---|---|---|
| 1 | SV1 | SV2 | SV2 | - | TN1 | - | mm-stash (SV1), mm-isle-craft (XD1) |
| 2 | - | - | - | - | - | XW1 | hub (MG1), games/festival (MG1), games/deepdelve (MG2) |
| 3 | - | - | - | - | TN2 | XB | mm-isle-boss (XB), hub (RT1), games/angler (MG3), games/jam+stalk (MG4) |
| 4 | AR | VN | - | - | - | PI | INDEX (AW3) |

MM is free in every wave. Use it for any hotfix the in-flight P2 or nav work reveals.

## 3. Priorities, mapped
1. Saves P2s and risks: SV1, SV2, SV3, FZ (and the old-tab check in SV1).
2. Reef/tundra/mars depth: XD1, XW1, XB, AW3, and the art list below.
3. Town polish and the Town-to-isles/hub flow after nav E: TN1, TN2, QT.
4. Calm retention: RT1, TN2 postcards, XB trophies and rematch, MG1 goals. None of them adds a timer, streak or expiry.
5. Minigame depth: MG1 (Bug Safari), MG2 (Deepdelve), MG3 (Angler), MG4 (Jam + Stalk).
6. Accessibility and low-end phones: PI, AR, TN2 low tier, MG1/MG3 `MMSideAccess`, MG4 lane shapes.
7. QA gates: QI (isles FTUE 2) and QT (Town FTUE), plus FZ.

## 4. Manual QA checklist for the owner (phone 390x844 + desktop, offline, about 20 min)
- [ ] **Two tabs, gear:**
  1. Open the Realm in two tabs and pick up a T9+ in tab A.
  2. Reforge it (with `?forge=1` until the flip lands).
  3. Reload tab B, and then make tab B pick something up.

  Expected: no item lost, no duplicate, and dust unchanged.
- [ ] **Storage full:** in DevTools, fill localStorage close to the quota, then pick up an item. Expected: the "Storage full" note shows,
  and the item is still in the pack after a reload.
- [ ] **Dungeon full pack:** fill the pack to 24 and kill a Crypt boss. Expected: the bag waits (after SV2), or the item sells for its tier price, never 3-30 shards.
- [ ] **Old save:** load a save from before the gear changes (no `gv`). It loads, the Lantern shows the pregear restore only with a plan +
  confirm, and nothing restores by itself.
- [ ] **Isles from zero** (fresh profile, home): gather, craft, tame, ride and sail within about 10 min. Check that the hint always says what to do next.
- [ ] **Mars is reachable by play:**
  1. Craft a rocket core from jungle/reef/tundra items.
  2. Sail to mars.
  3. Watch the oxygen meter warn before it hurts.

  Expected: no item or tame is ever lost.
- [ ] **Each mount ability once:** charge (tusktop), dive (tidesteed), warm aura (shagtusk), leap (crater strider), hover (void grazer).
  Expected: the button is not under either thumb, and reduced motion makes the cooldown ring static.
- [ ] **Town flow** (Play offline):
  - the gate pointer shows on the first spawn;
  - Where to? → Isles takes 2 taps;
  - Back to Town lands at the dock, with the name kept.
- [ ] **Bug Safari → Angler:** catch a cricket, then open the Angler. Expected: the cricket bait is listed and the hub shows the Bug Safari medal. In the
  whole session, no text says "streak", "missed" or "hurry".
- [ ] **Accessibility:**
  1. In settings, set the text scale to 1.5 and reduce motion on, and turn on the low graphics option.
  2. Visit the isles, Bug Safari, Angler and the Town.

  Expected: nothing overlaps, there is no flashing, and each page still loads. In DevTools → Network: 0 Firebase requests on every game page,
  and nothing is sent to chat.

## 5. Top risks after the recent merges (most likely bugs first)
1. **The forge-default flip (in P2) makes F3 real for old tabs.**
   - A Town tab older than `535faf6` still has the old cleaner. It can strip `dust`, `f` and `sig` on its next classic-gate persist.
   - The hint is the only guard. Long-lived Town tabs are common, so watch for "my reforge vanished" feedback.
   - SV1 check 5 and FZ cover this. Consider keeping the flip behind one more deploy if FZ finds a path.
2. **Persist storms and quota.**
   - F16 (a full parse/clean/stringify per kill), the pregear snapshot (F14) and the bigger archipelago saves all compete for the same
     ~5 MB of localStorage.
   - F1 is fixed, but a storage-full state now shows a note on every write. Make sure the note is throttled (once per session) and does not cover the sticks.
3. **The mars dead end hides behind URL testing.** Every isles test opens mars with `?isle=mars`, which also marks it visited and therefore open.
   A real player cannot get there. XD1's `reachability()` test is the guard.
4. **Isles X7 (home/travel) + AW2 + XW1 all touch the second engine in a row.**
   - Saves at risk: `pixeltown-archipelago-v1` (20 KB cap: fog for 5 isles at size 192, plus home grid, inv and trophies),
     `pixeltown-tames-v1` and the hide/unload `persist`.
   - Expect cap truncation on players who have been everywhere. Add a "visited all 5 at size 192" round trip in XW1.
5. **Mount abilities cross solid terrain.** `leap`, `hover`, `dive` and `burrow` allow crossing `crater_rim`, `abyss` and `lava_vent`.
   Dismounting or a stamina-out mid-cross must never strand the hero inside a solid tile. A "nearest walkable" rule is needed for every
   ability end, as for water dismounts.
6. **Town changes near the live multiplayer path.**
   - Nav E, TN1 and TN2 all edit `main.js` / `index.html`. A stray `net.*` call, a presence write on navigate, or a join-form reset could reach
     real players.
   - Keep the "empty `net.js` diff + `db.ws.length === 0` + grep for new `net.`" checks in every MN slice. The live-class Town tests must stay offline.
7. **Hub medals from many writers.** hub-report, X7 (isles), MG1 (bugs) and MG2 (deepdelve build medals) all add keys or medal ids.
   `hub/medals.js` whitelists by id, so a missing whitelist entry fails silently (no medal shown). Add a test that every medal id a page
   can write exists in `GAMES`.
8. **Art id drift continues.**
   - `item_jungle_berries` vs `jungle_berry`.
   - b34 is short by 8 items and 8 UI icons.
   - S creatures are authored at 64 native instead of 48 (TEAM-BOARD review).

   Every new batch needs an id check against `MMCreatures.list()`, the pack terrains/props and `MMIsleCraft.IDS` before registering
   (extend `art-manifest.test.js`).

Also watch the known flakes: `dungeon-pickups` coin magnet under load, the `world-safereturn` upper bound, and `test-tiers.json` merge conflicts
(append-only, keep both entries).

## 6. Codex art ask list, b34c + b37-b45 (ids checked against the code on 2026-11-22)
Format as before:
- transparent background (terrain tiles are opaque), `palette.json`, a validation report with 0 blocking, contact sheet ≤ 2000 px;
- true back and side views, effects kept separate;
- feet on the anchor row: **art ends exactly on the anchor row** (one rule for every batch).

Sizes and strip sets:
- Creature cells are **S 192x192 (48 native), M 256x256 (64), L 384x384 (96), XL 512x512 (128)**. Please author S at 48 native: b31a S came in at 64.
- Strip sets:
  - **Plain** = 12 strips (idle 4, move 6, attack 5, death 5, each in down/up/right).
  - **Tameable** = 14 strips (plain plus `sleep_down` 4 and `eat_down` 4).
  - **Mount** = also a per-frame `seat {x,y}` in the manifest. If it has a saddle, add a `saddle_<id>` overlay of 6 strips (idle 4 and move 6, in down/up/right).
  - **Boss** = also `roar_down/up/right` 6 frames.
- File names as delivered so far:
  - creatures: `<id>_<action>_<dir>.png`;
  - terrain: `tile_<terrain>_<a..d>.png` + `tile_<terrain>_edge_<00..15>.png` (b35 format: N/E/S/W bits);
  - items: `item_<id>.png` (32x32);
  - crafted icons: `icon_<id>.png`;
  - UI: `ui_<id>.png`.

**Delivered and registered:** b29-b36, b31af, b32s, b34b.

| batch | branch `codex/` | exact ids (size, strips) |
|---|---|---|
| b34c (gap fix) | b34c-isle-items-gaps | 32x32 `item_`: `jungle_berry` (keep the old `item_jungle_berries` file too), `amber, vine_rope, clover, golden_apple, fiber, hide, bone, tyrant_scale, wood, stone, apple, cocoa, feather, wool, honey`. 24x24 `ui_`: `stable, wellfed, warmth, breath, oxygen, tamer_rank`. 48x48: `ui_icon_isles, ui_icon_sea_chart` |
| b37 | b37-reef-terrain | 12 terrains x (a..d + edge 00..15), 32x32: `abyss, lagoon, shell_beach, reef_sand, pearl_sand, seagrass, tide_pool, sandbar, coral_shallows, kelp_bed, wreck_planks, sea_rock`. Props 32x32: `shell, driftwood, pearl_clam, anemone, coral`. Props 32x64: `kelp_tall, wreck_mast`. Items 32x32: `item_pearl, item_kelp, item_salt, item_shell, item_driftwood, item_glow_gel, item_rift_stone, item_sea_melon` |
| b38 | b38-reef-creatures | `reef_puffer, shellcrab` (S, 14); `glowjelly` (S, 12); `fin_raider` (S, 14); `tidesteed, skimray` (L, 14 + seat + `saddle_tidesteed` / `saddle_skimray` 6); `isleback_turtle` (XL, 14 + seat, no saddle; the back must be flat to stand on); `tide_hydra` (XL boss, 12 + `roar_*` 6, plus a `submerge_down` 6 for XB) |
| b39 | b39-tundra-terrain | 13 terrains x (a..d + edge 00..15): `ice_sheet, packed_snow, snow, powder_snow, ice_thin, frost_rock, permafrost, tundra_moss, slush, frozen_road, hot_spring, aurora_crystal, glacier_wall`. Props: `pine_snowy` 32x64; `snow_drift, frostberry_bush, ice_spike, crystal_blue` 32x32; `frozen_mammoth_tusk` 64x32; `hot_spring_steam` 32x32 x 4 frames; `ice_thin_crack` 32x32 x 3 frames (new, for XW1). Items: `item_frost_crystal, item_ice, item_frostberry, item_spring_salt, item_frost_heart` |
| b40 | b40-tundra-creatures | `pengling, frostfox, rimewolf` (S, 14); `icicle_bat` (S, 12); `glacier_shellback` (M, 14; **not** `shellback`); `shagtusk, sabrefang` (L, 14 + seat + `saddle_shagtusk` / `saddle_sabrefang` 6); `frost_dragon` (XL boss, 12 + `roar_*` 6). Rare tint: `frostfox` uses a palette swap in code, no art needed |
| b41 | b41-mounts-riders | `rider_<class>_sit_down/up/right`, 256x256, for the 14 `MMClasses` ids exactly: `ranger, frostcaller, herald, punk, bruiser, gravetender, trickster, shadowpaw, rogue, warlock, paladin, berserker, druid, necromancer` (lowercase files; code maps `graveTender` / `shadowPaw`) |
| b42 | b42-mars-terrain | 14 terrains x (a..d + edge 00..15): `dust_sea, dust_shallows, red_dust, regolith, dune_red, basalt, oxide_rock, crater_floor, crater_rim, co2_frost, canyon_wall, lava_vent, habitat_floor, landing_pad` (`lava_vent` also `_glow_1..3` for the telegraph). Props: `meteor_rock, crystal_red, solar_panel` 32x32; `oxygen_plant_f1..f4` 32x32; `rover_wreck` 64x32; `probe_lander` 64x64. Items: `item_iron, item_oxide_dust, item_ice_core, item_meteor_glass, item_data_chip` |
| b43 | b43-mars-creatures | `regolith_roly, bubblemoth, scrapper_drone` (S, 14); `dust_devil` (S, 12); `rustbeetle` (M, 14; rare "chrome" is a code palette swap); `crater_strider` (L, 14 + seat + `saddle_strider` 6); `void_grazer` (XL, 14 + seat + `saddle_grazer` 6); `red_titan` (XL boss, 14 + `roar_*` 6 + `burrow_down` 6 + seat + `saddle_titan` 6) |
| b44 | b44-isle-structures-vehicles | Structures by pack structure id, `struct_<id>`: `wreck` 128x96, `lighthouse` 64x128, `igloo_ruin` 96x96, `ice_arch` 96x96, `outpost` 96x96, `probe_wreck` 96x64, `antenna` 64x128, `greenhouse` 128x96. Vehicles: `boat_sail` 64x64 (4 frames x 3 dirs), `rocket_launch` 128x192 (8 frames), `shuttle` 96x96. Home: `trophy_pedestal` 64x64, `trophy_tyrant, trophy_hydra, trophy_dragon, trophy_titan` 48x48 |
| b45 | b45-isle-fx | 64x64, 6 frames, separate from creatures: `fx_tame_hearts, fx_torpor_zzz, fx_trust_sparkle, fx_spore_puff, fx_bubble_o2, fx_snow_breath, fx_splash, fx_lava_vent_warn, fx_roar_ring`. Mount-ability fx: `fx_charge_dust, fx_stomp_ring, fx_dive_bubbles, fx_skim_wake, fx_warm_aura, fx_pounce_streak, fx_leap_dust, fx_hover_glow, fx_burrow_mound, fx_sprint_lines`. 256x256 tileable: `fx_dust_storm`. Also edge sets `tile_<t>_edge_00..15` for the 12 b30 jungle terrains (b30 shipped variants only) |

Priority for Codex: **b34c → b38 → b40 → b37 → b39 → b45** (the abilities need their fx) → b43 → b42 → b44 → b41.
Every id has a code fallback, so no slice waits on art.

## 7. Research notes (generic sources)
- **Hold-to-toggle and one-handed play:** offer a permanent toggle for any held action (fire, sprint, hold notes), plus a single-stick or one-handed mode
  ([Xbox Accessibility Guideline 107](https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/107),
  [Unity: accessibility basics](https://unity.com/blog/video-game-accessibility-basics),
  [motor accessibility guide](https://www.abratabia.com/game-accessibility/motor-accessibility.php)). These shape AR, PI and MG4.
- **Calm retention without streaks:**
  - Respectful designs make coming back rewarding rather than obligatory. They avoid streak resets, FOMO and notifications, and
    can tell players it is fine to stop
    ([cozy motivation essay](https://mediacommons.org/imr/content/motivation-through-coziness),
    [streak criticism](https://respawn.outlookindia.com/gaming/gaming-originals/why-games-are-built-to-keep-you-coming-back),
    [retention loops](https://www.wayline.io/blog/ea-dream-nightmare-retention-loops),
    [a game that tells players to log off](https://www.vice.com/en/article/bvx9vw/cozy-grove-is-ok-telling-players-to-log-off-its-delightful)).
  - This is why RT1 offers suggestions instead of obligations, and why TN2 and XB use trophies and rematches with no cooldown.
  - The sources are mostly opinion pieces, so treat them as direction, not data.
