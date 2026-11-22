# Next slices 4: 20 slices in 4 waves (isles first ten minutes, tundra/mars depth, calm collections, Realm endgame, access/perf, smoke QA)

Planner, 2026-11-22 (read-only pass after `31f6e01`, which registered the Codex b38b-f reef creatures). This file supersedes the open parts of `NEXT-SLICES-3.md`.

Sources read:
- NEXT-SLICES-3, REVIEW-TOWN-NAV, REVIEW-GEAR-SAVES, the DAILY-REPORT tail and the TEAM-BOARD tail;
- `ftue-metrics.json`, `tests/fixtures/isles-ftue-profiles.json` and `tests/fixtures/town-ftue-profiles.json`;
- FEEDBACK-INBOX and `design/feedback/`, which are still empty (0 player notes);
- the tree itself: `games/isles/*`, `shared/mm-creatures.js`, `mm-isle-craft.js`, `mm-biome-packs.js`, `mm-nav.js`, `mm-perf.js`, `mm-access.js`, `main.js`, and `assets/arcane/b38*`.

The rules for every slice are unchanged from AGENTS.md and NEXT-SLICES-3:
- One slice = one branch. Logic goes in pure `shared/` modules, and page files only wire it up.
- Run `node game/tests/run-all.js` on port 8440 before asking for a merge.
- Every new test is appended to `tests/test-tiers.json`. Every browser test uses `blockDb` and asserts 0 DB requests and 0 sockets.
  Town tests add `routeWebSocket` + **Play offline**, run as `ADMIN*`, and assert `db.ws.length === 0`.
- No chat and no live-DB writes. The `net.js` and `firebase-config.js` diffs stay empty.
- Saves are additive only, and `pixeltown-save-v1` stays backward compatible. `pixeltown-archipelago-v1` stays under its 20 KB cap.
- Original art only, and every asset has a code fallback.
- Never weaken a test. A `knownIssues` baseline may only tighten, and when a default flips, the old assertion moves to the explicit flag.
- **No guilt mechanics:** no streaks, no "you missed", no expiring rewards, no countdowns to log in, no notifications.
- **Pack golden:** `pack-golden.json` hashes stay identical. New island content goes through page-side or `mm-isle-craft` tables, not `MMBiomePacks`.

## 0. State checked in the tree (not taken from older plans)

### Done since NEXT-SLICES-3
All 20 NEXT-SLICES-3 slices merged except **PI**:
- SV1-SV3, XD1, TN1, XW1, QI, QT, MG1-MG4, XB, TN2, RT1, VN, AR and FZ.
- AW3 merged as the b34b/b35/b36/b38a redo wiring.

The suite was 313/313 on `3bb72bf`. Codex has delivered b38a-f (reef puffer, shellcrab, tidesteed + skimray with saddles, glowjelly, fin_raider, isleback_turtle). Only `b38a` is wired. b38b-f are registered as provisional and not yet wired in `mm-creature-strips.js`, and `tide_hydra` (b38g) is still to come.

### Isles first ten minutes: root causes found in the code
These explain the `knownIssues` in `isles-ftue-profiles.json`.

1. **No HP regeneration.**
   - `hero.hp` drops in `hurt()` (`isles.js:525`). It is only restored by a respawn (`:537`) or the test hook `heal()`.
   - Docks, home, campfires, hot springs and domes are `SHELTER` for warmth and air (`:1862-1872`), but they do not heal.
   - On mars, running out of air takes 1 HP every 3 s down to 1 HP (`:1903`). The hero then stays at 1 HP and dies to the next hit.
   - Result: jungle-a and tundra-a have 3 deaths, tundra-b has 4 and mars-b has 2.
2. **The starter pouch feeds jungle only.**
   - `STARTER_POUCH = { jungle_berry: 12, raw_meat: 12, bug: 8 }` (`isle-creatures.js:26`).
   - `foodFor(def, pouch)` reads **only** the pouch. Gathered food goes into `inv` (`gatherNear`, `isles.js:1591`), and only drop-table food refills the pouch (`:581`).
   - So clover on home, kelp on reef, frostberry on tundra and oxide_dust on mars never feed a creature, even after you gather them.
3. **Eight diet foods have no source at all.** `MMIsleCraft.sourcesOf()` returns `[]` for `fish, flower, sea_melon, greenhouse_potato, golden_apple, nectar, hay`, and `bug` exists only in the pouch. This leaves these creatures untameable by play:
   - `pengling`, `shellcrab`, `fin_raider` (fish);
   - `isleback_turtle` (sea_melon);
   - `meadow_strider`, `oakback` (golden_apple);
   - `crater_strider` (greenhouse_potato);
   - `bumble_mote` (flower/nectar);
   - `bubblemoth` (nectar/potato).

   `frostfox` (fish or frostberry) and `skimray` (fish or kelp) can be fed only once frostberry or kelp reaches the pouch, and it never does (item 2).
4. **Tundra's first tame is late (315 s on tundra-b).** The first creature the pouch can tame there is `rimewolf`, by knockout with torpor 100. The feed tame `pengling` needs fish, which has no source.
5. **Reward gaps of 66-162 s** (reef-b 161.8, tundra-b 139.5).
   - Gather spots are daily (`HS.gather`, "grows back tomorrow"), and after the nearby glints are picked there is a long walk to the next one.
   - Nothing else counts as a reward event, so seeing a new species or making tame progress on a creature with no food gives nothing.
6. **`layout.tinyText 5` on every island.** The `.rc-note` recipe notes in the Craft panel are 11 px.
7. **Tundra and mars still have no rare.** `rare` is set only on meadow (`oakback`) and reef (`isleback_turtle`). The NEXT-SLICES-3 XW1 "aurora frostfox / chrome rustbeetle" item was not built: `isles.js` has no `aurora` or `chrome` code.
8. **The isles page has no access or perf tier.** PI is still open:
   - `games/isles/index.html` loads neither `mm-side-access.js` nor `mm-perf.js`;
   - Bug Safari and Angler load `MMSideAccess` but have no `MMPerf` low tier;
   - `games/arcane-frontier/` has no nav at all. It is not one of the 10 PLACES, so this is fine, but note it.

### Other findings
9. **The Town still has two resetting streaks.**
   - The daily login streak: `main.js:4227-4237`, "🔥 Day N streak!", which resets to 1 after a missed day.
   - The sell streak: `:2803-2818`, plus the achievement `sellstreak3` "Sell at the shop 3 days in a row".
   - Both predate the no-guilt rule, but they are exactly what the rule forbids. TN3 softens them (owner decision, see TN3). Nothing is removed.
10. **The REVIEW-TOWN-NAV P2s are all still open:** N1 (sheet swallows keyup), N2 (sheet under the Realm invite/embed), N3 (gamepad behind the sheet), F1 (feedback multi-tab), P1x (postcards focus), H1 (hub gift vs Town shard last-writer) and R1 (triage Markdown escaping).
11. **No smoke journey exists.**
    - `nav-consistency` covers six minigame pages one by one.
    - `nav-town`, `nav-realm` and `nav-hub-isles` cover their own pages.
    - No test walks Town → Where to? → each of the 10 PLACES → back, as one player would.
12. **Id drift to watch:**
    - The tundra pack id is `tundra`, but the isle URL id is `ice` (`OPEN_ISLES = ['home','jungle','ice']`).
    - Delivered saddle overlays are named `<id>_saddle_<act>_<dir>` (b32, b38c), not `saddle_<id>` as NEXT-SLICES-3 §6 said. The code already follows the delivered form, so the ask list below uses it.
    - `item_jungle_berries` is still the b34 file name for `jungle_berry`.

## 1. Serial resources (at most one slice each per wave)

**Serial (hard) resources:**

| key | files |
|---|---|
| RJ | `game/realm.js` + `realm-ui.css` |
| RW | `games/mad-maze/realm-world.js` |
| DJ | `games/mad-maze/dungeon.js` |
| MM | `games/mad-maze/mad-maze.js` + its `index.html` / css |
| MN | `game/main.js` + `game/index.html` (Town) |
| IS | `games/isles/*` (incl. `isle-creatures.js`) |

**Soft resources (one owner per wave):**
- `shared/mm-isle-craft.js`
- `shared/mm-creature-strips.js` + `shared/mm-isle-art.js` + `assets/arcane/INDEX.json` (the art key "AR")
- `shared/mm-endgame.js` (new)
- `hub/*`
- `shared/mm-nav.js`
- `shared/mm-perf.js`
- `games/<minigame>/*` (per folder)
- `tests/fixtures/isles-ftue-profiles.json`

Merge order per wave: pure modules → RJ → RW/DJ → MM → IS → hub/MN → art/docs. Opus review: IF1, NV1, TD1, RE2, TN3, HM1.

---

## Wave 1: isles first-ten fixes, nav P2s, the smoke journey, endgame tables, minigame low tier

| id | title | files | size | serial / soft | depends |
|---|---|---|---|---|---|
| IF1 | Isles FTUE fixes: rest + regen, a pouch per island, food sources, reward pacing, tundra first tame | NEW `shared/mm-isle-rest.js` (`MMIsleRest`), NEW `shared/mm-isle-pouch.js` (`MMIslePouch`), `shared/mm-isle-craft.js` (additive FINDS / sources for the 8 orphan foods), IS (`isles.js` wiring, `isle-creatures.js` `foodFor(def, pouch, inv)`, `isles.css` `.rc-note` to 12 px), `tests/fixtures/isles-ftue-profiles.json` (knownIssues only tighten), NEW `tests/shared-mm-isle-rest.test.js`, NEW `tests/shared-mm-isle-pouch.test.js` | L | IS, mm-isle-craft, isles fixture, Opus | none |
| NV1 | Nav and feedback P2s: N1, N2, N3, F1, P1x, H1, R1 | `shared/mm-nav.js` (N1: release held keys on close, dispatching a synthetic `keyup` for each key down at open), MN (N2: close the sheet in `showRealmInvite` / `openRealmEmbed` / `enterRealm`; N3: `canAct()` checks `MMNav.isOpen()`, and gamepad/tilt are gated; P1x: postcards focus trap + return), `shared/mm-feedback.js` (F1: re-read storage before Delete/Copy/Download), `hub/gift.js` (H1: an additive `shardsPending` that the Town merges, instead of writing `realm.shards`), `tools/feedback-triage/triage.js` (R1: `esc()`), NEW `tests/nav-p2-fixes.test.js` | M | MN, mm-nav, hub, Opus | none |
| QS1 | Smoke journey bot: Town → Where to? → all 10 places → back | NEW `tests/smoke-journey.test.js`, NEW `tests/fixtures/smoke-journey.json` (frozen allow-lists, which may only shrink) | M | none | none (test only) |
| RE1 | Realm endgame tables (pure) | NEW `shared/mm-endgame.js` (`MMEndgame`: T12 chase view model, a relic book, the boss-rush ladder, dungeon mutators), NEW `tests/shared-mm-endgame.test.js` | M | mm-endgame | none |
| AC1 | Bug Safari + Angler low tier and motion pass | `games/festival/*`, `games/angler/*` (a `mm-perf.js` tag; low tier = dpr 1, particle caps, no water shimmer; reduced motion = static glow and ripples), `shared/mm-perf.js` (additive `applyCanvas(canvas, tier)` helper only), NEW `tests/minigame-lowgfx.test.js` | S | games/festival, games/angler, mm-perf | none |

**IF1 acceptance**
1. `MMIsleRest.step(state, {dt, hurtAgo, inShelter, atHome, atDock, envEmpty})` is pure and seeded-free.
   - **Out of danger regen:** after 5 s with no hit and no hostile within 6 tiles, the hero heals 1 HP per 1.5 s.
   - **Rest spots heal to full in ≤ 3 s:** home, any dock, campfire, hot spring, dome and landing pad. The toast reads "Rested. Full health." (once per visit to the spot).
   - Home is fully safe, as it already is (`s.dmg = 0`).
   - **Air at 0 never leaves the hero at 1 HP to die to a hit:** while air is empty, incoming creature damage is halved, and the hint names the nearest dome with an arrow.
   - No meter ever kills (the existing rule), and regen never runs while a boss fight is engaged, so boss balance holds (`isle-boss-sim` unchanged).
2. **A pouch per island.**
   - `MMIslePouch.starter(isle)` merges the jungle pouch with island food:

     | island | added food |
     |---|---|
     | home | `clover 8, apple 4` |
     | reef | `kelp 8, fish 6` |
     | tundra/`ice` | `fish 6, frostberry 6` |
     | mars | `oxide_dust 6, greenhouse_potato 4` |

   - `foodFor(def, pouch, inv)` also uses diet items in `inv`. The pouch is used first, and the inv is decremented only when the pouch has none.
   - The pouch save shape is unchanged (it is rebuilt per visit, as today). `?pouch=classic` restores the old behaviour.
3. **Food sources** (additive `FINDS` in `mm-isle-craft`; pack-golden is identical):
   - `fish` from reef/tundra/home dock gather finds;
   - `flower` and `hay` on home;
   - `nectar` on jungle/home;
   - `sea_melon` on reef zone 2;
   - `greenhouse_potato` at the mars greenhouse;
   - `golden_apple` as a rare home find, ~1 per 3 gathers, seeded;
   - `bug` on jungle and home.

   A new `validate()` rule fails when any `MMCreatures` diet item has 0 sources. The `reachability()` walk also proves each island has ≥ 1 feed-or-calm tameable that its starter pouch can feed.
4. **Reward pacing** (`__isles.events()` kinds are additive: `spot`, `rest`):
   - The first sighting of a species adds a journal entry ("New in your journal: Pengling") and counts as a reward event.
   - "Forage sparkles" (a seeded small find, ≤ 6 per island per day, never time-gated) appear within 10 tiles once 40 s pass without a reward.
   - The hint points to the nearest unpicked glint, sparkle or tameable.
5. **Tundra first tame:** `pengling` can be fed from the starter pouch. tundra-a/b first tame ≤ 120 s.
6. **Gate (QI rerun):** `knownIssues` for every isles2 profile shrinks to `{}` except, at most, `maxRewardGap` ≤ 45 s:

   | check | target |
   |---|---|
   | deaths | ≤ 1 per profile |
   | `layout.tinyText` | 0 |
   | `hintActionPct` | 100 |
   | `reach.marsReachable` | 1 |

   `isles-*` and `archipelago-*` tests stay green, and the `archipelago-perf` median stays < 20 ms.

**NV1 acceptance** (`nav-p2-fixes.test.js`, offline Town)
1. N1: hold W, open the sheet, release W, close the sheet. The player does not move during 2 s of headless steps.
2. N2: a Realm invite or embed while the sheet is open closes it, and the invite's Accept is reachable by Tab.
3. N3: a gamepad stub with the A button and left stick does nothing while the sheet is open (spy on `canAct`).
4. F1: tab A deletes note 1 while tab B adds note 2. After both, storage holds note 2, and an export from A includes it.
5. P1x: opening postcards focuses `#postcards-close-btn`, Tab is trapped, and Esc returns focus to the opener.
6. H1: the hub gift adds `shardsPending`, and a Town tab with a stale `this.realm` keeps both amounts after its next `onSave`. Old saves without the key load unchanged.
7. R1: hostile feedback text (`<!--`, `#`, `[x](y)`) is escaped in the report.
8. Diff checks: an empty `net.js` diff, `db.ws.length === 0`, and no new `net.` call (grep).

**QS1 acceptance** (390x844 touch and 1280x720; blockDb + routeWebSocket; Play offline as `ADMINsmoke`; never chats)
1. From the Town HUD, open **Where to?** and visit each of the 10 `MMNav.PLACES` (town, map, realm, lantern, isles, jam, bugs, angler, deepdelve, stalk) in one session.
2. On each page:
   - first frame within 5 s;
   - 0 console errors;
   - 0 Firebase requests and 0 sockets (Town included);
   - `MMNav` is mounted;
   - a "back to Town" path (Where to? → Town) restores the same name, with no empty join form.
3. On each page, record controls under 44 px, text under 12 px, and controls over a stick. Compare them with the frozen `smoke-journey.json` allow-list: a new offender fails, and the list may only shrink.
4. Run in under 120 s wall time with THREE_JS served locally for Deepdelve. Tier: smoke.

**RE1 acceptance** (Node)
1. `MMEndgame.chase(save)` returns `{pityB, pityD, nextForced, relicsOwned[6], t12Owned}` from `gp` and items, read-only. The display text names progress ("12 of 60 toward a sure T12"), never a countdown.
2. `relicBook(items)` lists the 6 z3 boss relics (dread_knight, inferno_wyrm, void_oracle, lich_king, shadow_hydra, void_maw) as owned or not.
3. `rushLadder(seed)` is a seeded order of 6 z3 bosses. Each step has `offRamp: true`, and leaving keeps every drop.
4. `mutators`: `narrow`, `dim` (light radius), `swarm` (+50% small, −30% hp) and `mirror` (room order reversed). Each is pure, seeded and stackable ≤ 2, and none adds a timer or one-shot damage.

**AC1 acceptance**
1. Forcing `lowGfx` in `pixeltown-access-v1` cuts the median frame time by ≥ 15% under a 4x CDP throttle on both pages. The default tier is pixel-identical on one seeded frame.
2. Reduced motion stops the shimmer, ripple and glow animation. The `bugs-*` and `angler-*` tests are unchanged.

---

## Wave 2: tundra and mars depth, reef/tundra art wiring, boss rush, dungeon variety, collections

| id | title | files | size | serial / soft | depends |
|---|---|---|---|---|---|
| TD1 | Tundra + mars depth on the page | IS (rares through a page-side table, thin-ice crack telegraph, aurora night, hot-spring soak, oxygen polish, rocket launch scene, `isles.css`), `shared/mm-isle-craft.js` (additive: `aurora_shard`, `chrome_flake`, `aurora_lamp`, `chrome_beacon` decor), NEW `tests/isles-tundra-mars.test.js` | L | IS, mm-isle-craft, Opus | IF1 |
| AW4 | Wire Codex b38b-f (+ b38g hydra, b37 reef terrain if delivered) | `shared/mm-creature-strips.js`, `shared/mm-isle-art.js` (reef `tile_<t>_<a..d>` + `_edge_NN`), `assets/arcane/INDEX.json` (provisional → registered), `tests/art-manifest.test.js` (append) | M | AR | none |
| RE2 | Boss rush "Trial of Six" with off-ramps (World) | RW (a Nexus portal for heroes Lv 20+ that runs the `MMEndgame.rushLadder` bosses one after another in the existing boss arena; between fights a calm "Rest here / Leave with your loot" choice; each kill counts toward pity as normal), NEW `tests/world-boss-rush.test.js` | M | RW, Opus | RE1 |
| DV1 | Dungeon variety: mutators + deep runs | DJ (`?mut=` + a seeded mutator pick for dungeons from z2+, shown on the door label; "deep run": after a boss, an optional stairs to a second floor of the same biome with +1 tier window, off-ramp at every floor), `shared/mm-biomes.js` (additive `mutatorsFor(biome)`), NEW `tests/dungeon-mutators.test.js` | M | DJ | RE1 |
| CZ1 | Collections book (pure + hub card) | NEW `shared/mm-collections.js` (`MMCollections.read(storage)` → sets from local keys only: isles journal/tames, Bug Safari journal, Angler fish log, Realm relic book, Deepdelve blueprints, trophies; completion counts, no timers), `hub/*` (a "Collections" card + sheet), NEW `tests/shared-mm-collections.test.js`, NEW `tests/hub-collections.test.js` | M | hub | IF1 (journal key), RE1 |

**TD1 acceptance**
1. **Rares** (one per island, zone 3, seeded through `IC.rareSpot` with a page-side `RARE_EXTRA`; pack-golden identical):
   - a tundra `frostfox` "aurora" variant (code palette swap);
   - a mars `rustbeetle` "chrome" variant.

   Each is tameable from the island pouch (IF1), drops `aurora_shard` / `chrome_flake` on tame (never on kill), and is written to the journal.
2. **Thin ice:**
   - `ice_thin` shows a crack telegraph after 1.0 s of standing on it and cracks at 1.5 s;
   - a cracked tile becomes `slush` for 20 s (slow ×0.6), with no damage and no drowning;
   - with reduced motion the crack is a static overlay.
3. **Hot spring soak:** standing in `hot_spring` for 2 s gives "Warm and rested", which is full warmth plus the IF1 rest. Spring salt still gathers there.
4. **Aurora night:** on tundra, once the page clock passes dusk, a calm aurora sky band shows (static with reduced motion). `aurora_crystal` tiles glint and can be gathered once per day. Nothing is locked to the real time of day, and `?aurora=1` forces it for tests.
5. **Oxygen polish:**
   - the air meter shows a shape icon;
   - the warning appears ≥ 15 s before empty;
   - an arrow points to the nearest dome while the meter is low;
   - the `o2_tank` line in the craft panel says "+30 s air".
6. **Rocket scene:** sailing to mars with a `rocket_core` plays a 2.5 s launch (skipped with reduced motion or a tap) and lands on `landing_pad`. A launch never consumes the core twice (test: craft 1, sail 3 times).
7. Existing tests are green, and the archipelago save round trip at "all 5 isles visited, size 192" stays < 20 KB.

**AW4 acceptance**
1. `art-manifest.test.js` checks every b38 creature id against `MMCreatures.list()` and pack ids.
2. Each of the 14 strips resolves, and the seats match per frame for `tidesteed`, `skimray` and `isleback_turtle`. The saddle overlays are `<id>_saddle_{idle,move}_{down,up,right}`.
3. A missing id falls back to the code bake with 0 console errors. `?art=0` is code only, and `archipelago-perf` is unchanged within 5%.

**RE2 acceptance**
1. The rush is entered only by choice, with no timer, no entry fee and no lockout.
2. Death in the rush returns the hero to the Nexus with every drop already collected (safe return), and "Leave" is offered after every boss.
3. Pity: 6 kills in a rush add exactly 6 to `gp.b`. The two-tab rule from SV2 holds (re-read before the roll).
4. `?rush=0` hides the portal, and `world-*` / `gear-*` tests are unchanged.

**DV1 acceptance**
1. Mutators are seeded per dungeon seed and are never applied to warren z1. With `?mut=0`, the dungeon is byte-identical to today (golden room list).
2. A deep run's floor 2 keeps the biome boss pool. The off-ramp stairs to the Nexus are on every floor, and leaving keeps loot.
3. The `dungeon-*` tests are unchanged. Windups on new mutators stay ≥ 0.6 s.

**CZ1 acceptance**
1. Reads local keys only, and hostile JSON shows nothing. The output is `textContent` only.
2. The strings pass the no-guilt grep (`streak|missed|expires|hurry|last chance|don't lose|come back`).
3. With 0 progress, the card shows 3 first-step suggestions. Each set links to its page through the `MMNav` allow-list.
4. Targets are ≥ 44 px and text ≥ 12 px. 0 DB requests.

---

## Wave 3: isles access/perf, local co-op polish, T12 chase UI, Town streak softening, perf gate

| id | title | files | size | serial / soft | depends |
|---|---|---|---|---|---|
| PI2 | Isles phone perf + access (PI carried over) | IS (`index.html` tags for `mm-side-access.js` + `mm-perf.js`; low tier = dpr 1, 12 sparks, terrain animation off, companion AI at 15 Hz, fog redraw at 10 Hz; `--ui-scale` reaches the HUD, panels and ability button; one-thumb mode = auto-attack + the ability button by the stick; shape icons on meters), `tests/archipelago-perf.test.js` (add a low-tier case; existing case unchanged), NEW `tests/isles-access.test.js` | M | IS | TD1 |
| CO4 | Local co-op polish (`?party=local`) | MM (seat picker cards with class portraits, "Join on this device" from the pause menu, a revive-by-standing ring of 3 s, a shared-camera zoom-out cap, per-seat HUD colour + shape), NEW `tests/coop-local-polish.test.js` | M | MM | none |
| RE3 | T12 chase + relic book UI (arena) | RJ (Backpack tab "Relic book" from `MMEndgame.relicBook`; a calm pity line "12 of 60 toward a sure T12" in the stats dropdown; a "new best tier" toast; `?chase=0`), NEW `tests/realm-chase-ui.test.js` | S | RJ | RE1 |
| TN3 | Town streak softening + Town text scale | MN (login streak: count visit days and never reset, "Visit day N, +bonus ⭐" with no 🔥; keep the `loginStreak` / `lastLoginDate` keys and add `visitDays`; sell streak likewise; the `sellstreak3` text becomes "Sell on 3 different days", and earned stays earned; `?streak=classic` keeps the old behaviour; `--ui-scale` reaches the DOM panels), NEW `tests/town-no-streak.test.js` | S | MN, Opus | NV1 |
| QS2 | Perf gate on every page (low tier) | NEW `tests/perf-all-pages.test.js` (4x CDP throttle, 390x844; each of the 10 places with `lowGfx` forced; median and p95 frame time against a frozen fixture), NEW `tests/fixtures/perf-baselines.json` | M | none | AC1 |

**PI2 acceptance**
1. The low tier gives a median < 16 ms and p95 < 28 ms in the P1 scene (24 creatures, 4 XL, 2 companions, riding, 4x throttle). The high tier is pixel-identical on one seeded frame.
2. At `--ui-scale` 1.5 and 390x844, every button is on screen with no overlap, and text is ≥ 12 px × scale. Reduced motion stops water, terrain, aurora and cooldown-ring animation.
3. The whole QI run passes with `oneThumb:true` (no second-thumb input). 0 DB requests.

**CO4 acceptance**
1. Two seats on one device (BroadcastChannel only, never the DB) can join, play and leave without a reload.
2. A downed seat is revived by the other standing near it for 3 s, and there is no game over while one seat stands.
3. Loot stays per seat (CO3 rule), and soulbound never crosses. `party-bc` / `realm-team` tests are unchanged, and solo play is identical (runtime spy).

**RE3 acceptance**
1. The relic book shows 6 entries (owned or "not yet"), and the text has no countdown.
2. The pity line matches `MMEndgame.chase`. `?chase=0` hides both.
3. The `gear-*`, `backpack-*` and `class-weapon-*` tests are unchanged.

**TN3 acceptance** (owner decision first; default proposal: on)
1. A save with `loginStreak: 7, lastLoginDate` 3 days ago now gives "Visit day 8" (not "Day 1"). The bonus cap stays 5 ⭐.
2. Old keys are kept and written as before, so an older tab still reads them, and `visitDays` is additive.
3. The no-guilt grep across `main.js` user-facing strings finds only `?streak=classic` paths.
4. Offline only, `db.ws.length === 0`, and the `town-first-ten` gate is unchanged.

**QS2 acceptance**
1. Each page records `{median, p95, longTasks}`. A regression > 10% over the frozen baseline fails, and an improvement may tighten the baseline.
2. It runs in the full tier, with ≤ 180 s wall time.

---

## Wave 4: cozy home + photo mode, tundra/mars art wiring, endgame sim, access sweep, isles save fuzz

| id | title | files | size | serial / soft | depends |
|---|---|---|---|---|---|
| HM1 | Cozy home + photo mode (isles) + rider overlay | IS (home: trophy/collection shelves read from `MMCollections`, name a tame (local only, 16 chars, `textContent`), a "sit by the fire" rest pose; photo mode: hide HUD, 3 frames + 4 stickers, filters off with reduced motion, saves a PNG via `toBlob` download only; rider overlay from `MMCreatureStrips.rider(classId)` when b41 exists, else the code hero), NEW `shared/mm-photo.js` (pure layout + filter tables), NEW `tests/isles-home-photo.test.js` | M | IS, Opus | PI2, CZ1 |
| AW5 | Wire Codex b39/b40/b41 (+ b42-b44 if delivered) | `shared/mm-creature-strips.js` (tundra/mars species, `rider(classId)` lookup mapping `graveTender`/`shadowPaw` to lowercase files), `shared/mm-isle-art.js` (tundra/mars terrain + edges, `ice_thin_crack`, `lava_vent_glow_1..3`), NEW `shared/mm-item-art.js` (`item_<id>` / `icon_<id>` / `struct_<id>` lookup with alias `item_jungle_berries` → `jungle_berry`), `assets/arcane/INDEX.json`, `tests/art-manifest.test.js` (append) | M | AR | AW4 |
| RE4 | Endgame sim gate (QA) | NEW `tests/endgame-sim.test.js` (Node: seeded 5,000-run sim of z3 kills + rush + deep runs; median kills to the first T12 ∈ [25, 60]; no path forces > 60; rush clear rate at a reference build ≥ 50% for step 1-3; mutator ttk stays within ±25%), `shared/mm-endgame.js` (tuning constants only) | S | mm-endgame | RE2, DV1 |
| AC2 | Access sweep on every page | QS1's journey rerun with `hudScale 1.5`, `reduceMotion`, `lowGfx` + per-folder CSS fixes in `hub/*`, `games/jam/*`, `games/stalk/*`, `games/deepdelve/*`, `games/mad-maze/lantern.*` (no MM, no MN, no IS), `tests/smoke-journey.test.js` (append an "access" pass), `tests/fixtures/smoke-journey.json` | M | hub, games/jam, games/stalk, games/deepdelve | QS1, PI2, TN3 |
| QS3 | Isles save fuzz (QA) | NEW `tests/isles-save-fuzz.test.js` (Node with the real `mm-homestead`, `mm-tames`, `mm-home-build`, `mm-isle-craft`: 5,000 seeded runs of 2 tabs × random gather/craft/tame/sail/build/trophy/failed write; invariants: archipelago ≤ 20 KB, no tame lost or duplicated, inv never negative, unlocks never lost, trophies kept, fog never truncates the current island) | M | none | TD1 |

**HM1 acceptance**
1. A trophy placed survives a reload (additive save), and a named tame keeps its name across sail. Hostile names render as text.
2. Photo mode:
   - no HUD in the shot;
   - the PNG downloads locally, with no upload and no network request (route spy);
   - with reduced motion there is no filter animation;
   - Esc or the 44 px Close returns to play with the input state cleared (the N1 lesson).
3. With b41 present, a rider draws on every mount at the manifest seat. Without it, the code hero draws as today.

**AW5 acceptance:** the same as AW4 for every delivered id, plus:
- `mm-item-art` resolves every `MMIsleCraft.ALL_IDS` id to art or a code fallback;
- the craft panel shows icons with text labels kept;
- `?art=0` is code only.

**AC2 acceptance**
1. With all three prefs on, every page passes QS1 checks 2-3.
2. No animation runs longer than 5 s with reduced motion (rAF spy on CSS animations).
3. No page flashes faster than 3 Hz.
4. The allow-list shrinks or stays the same.

**QS3 acceptance:**
- every invariant holds for 5,000 seeds;
- a failure prints the seed and the shortest failing op list;
- it runs in ≤ 60 s in the smoke tier.

---

## 2. Wave at a glance (serial check)

| wave | RJ | RW | DJ | MM | MN | IS | soft |
|---|---|---|---|---|---|---|---|
| 1 | - | - | - | - | NV1 | IF1 | mm-isle-craft (IF1), mm-nav + hub (NV1), mm-endgame (RE1), games/festival + angler + mm-perf (AC1) |
| 2 | - | RE2 | DV1 | - | - | TD1 | mm-isle-craft (TD1), AR (AW4), hub (CZ1), mm-biomes (DV1) |
| 3 | RE3 | - | - | CO4 | TN3 | PI2 | none |
| 4 | - | - | - | - | - | HM1 | AR (AW5), mm-endgame (RE4), hub + jam + stalk + deepdelve (AC2) |

Each wave holds at most 5 slices, with each serial key used at most once. RJ and RW are free in waves 1 and 4, and MM in waves 1, 2 and 4: keep them for hotfixes the smoke journey finds.

## 3. Priorities, mapped
1. **The isles first ten minutes:** IF1 (regen and rest, a pouch per island, food sources, pacing, tundra first tame, tiny text), then PI2 (one-thumb QI rerun).
2. **Tundra and mars depth:** TD1 (aurora rare, thin ice, hot springs, aurora night, oxygen, rocket), plus AW4, AW5 and the art list below.
3. **Fun and retention without guilt:** CZ1 collections, HM1 cozy home and photo mode, TN3 streak softening, and IF1 journal sightings. The daily gift is untouched.
4. **Realm endgame:** RE1 tables, RE2 boss rush with off-ramps, DV1 mutators and deep runs, RE3 the T12 chase UI, RE4 the sim gate, and CO4 local co-op polish.
5. **Accessibility and low-end phones:** AC1 (Bug Safari, Angler), PI2 (isles), AC2 (every page), QS2 (perf gate), and TN3 (Town text scale).
6. **QA gates:** QS1 smoke journey, QS2 perf, QS3 isles save fuzz, RE4 endgame sim, and the tightened IF1 fixture.
7. **Also spotted:** the NV1 nav P2s, the orphan-food `validate()` rule, and the Town streaks.

## 4. Codex art ask list, refreshed against the code ids (2026-11-22)
Format as before:
- transparent background (terrain opaque), `palette.json`, a validation report with 0 blocking, contact sheet ≤ 2000 px;
- true back and side views, effects separate;
- **art ends exactly on the anchor row**.

Creature cells are S 192 (48 native), M 256 (64), L 384 (96) and XL 512 (128).

Strip sets:
- **Tameable** = 14 strips (idle 4, move 6, attack 5 and death 5 in down/up/right, plus `sleep_down` 4 and `eat_down` 4).
- **Plain** = 12.
- **Mount** = also a per-frame `seat`, plus saddle overlays named **`<id>_saddle_{idle,move}_{down,up,right}`** (the delivered convention).
- **Boss** = also `roar_*` 6.

Please pick one death fps (10) for every batch.

**Delivered:** b29-b36, b31af, b32s, b34b, b38a-f. b38a is wired. b38b-f are registered and wait on AW4.

| batch | branch `codex/` | exact ids (checked against `MMCreatures`, `MMBiomePacks` and `MMIsleCraft`) |
|---|---|---|
| b38g | b38g-tide-hydra | `tide_hydra` (XL boss, 12 + `roar_*` 6 + `submerge_down` 6) |
| b37 | b37-reef-terrain | 12 terrains × (a..d + edge 00..15), 32x32: `abyss, lagoon, shell_beach, reef_sand, pearl_sand, seagrass, tide_pool, sandbar, coral_shallows, kelp_bed, wreck_planks, sea_rock` (`dock_planks` is shared, so it is reused). Props 32x32: `shell, driftwood, pearl_clam, anemone, coral`; 32x64: `kelp_tall, wreck_mast`. Items 32x32: `item_pearl, item_kelp, item_salt, item_shell, item_driftwood, item_glow_gel, item_rift_stone, item_sea_melon, item_fish` |
| b39 | b39-tundra-terrain | 13 terrains × (a..d + edge 00..15): `ice_sheet, packed_snow, snow, powder_snow, ice_thin, frost_rock, permafrost, tundra_moss, slush, frozen_road, hot_spring, aurora_crystal, glacier_wall`. Props: `pine_snowy` 32x64; `snow_drift, frostberry_bush, ice_spike, crystal_blue` 32x32; `frozen_mammoth_tusk` 64x32; `hot_spring_steam` 32x32 × 4 frames; `ice_thin_crack` 32x32 × 3 frames. Items: `item_frost_crystal, item_ice, item_frostberry, item_spring_salt, item_frost_heart, item_aurora_shard`. Sky: `fx_aurora_band` 256x64 tileable, 4 frames (TD1) |
| b40 | b40-tundra-creatures | `pengling, frostfox, rimewolf` (S, 14); `icicle_bat` (S, 12); `glacier_shellback` (M, 14); `shagtusk, sabrefang` (L, 14 + seat + `<id>_saddle_*` 6); `frost_dragon` (XL boss, 12 + `roar_*` 6). The aurora frostfox is a code palette swap, so no art is needed |
| b41 | b41-mounts-riders | `rider_<class>_sit_{down,up,right}` 256x256 for `ranger, frostcaller, herald, punk, bruiser, gravetender, trickster, shadowpaw, rogue, warlock, paladin, berserker, druid, necromancer` (code maps `graveTender`/`shadowPaw`) |
| b42 | b42-mars-terrain | 14 terrains × (a..d + edge 00..15): `dust_sea, dust_shallows, red_dust, regolith, dune_red, basalt, oxide_rock, crater_floor, crater_rim, co2_frost, canyon_wall, lava_vent, habitat_floor, landing_pad` (+ `tile_lava_vent_glow_1..3`). Props: `meteor_rock, crystal_red, solar_panel` 32x32; `oxygen_plant_f1..f4` 32x32; `rover_wreck` 64x32; `probe_lander` 64x64. Items: `item_iron, item_oxide_dust, item_ice_core, item_meteor_glass, item_data_chip, item_greenhouse_potato, item_chrome_flake` |
| b43 | b43-mars-creatures | `regolith_roly, bubblemoth, scrapper_drone` (S, 14); `dust_devil` (S, 12); `rustbeetle` (M, 14; the chrome variant is a code swap); `crater_strider` (L, 14 + seat + saddle 6); `void_grazer` (XL, 14 + seat + saddle 6); `red_titan` (XL boss, 14 + `roar_*` 6 + `burrow_down` 6 + seat + saddle 6) |
| b44 | b44-isle-structures-vehicles | `struct_<id>` by pack structure id: reef `wreck` 128x96, `lighthouse` 64x128; tundra `igloo_ruin` 96x96, `ice_arch` 96x96; mars `outpost` 96x96, `probe_wreck` 96x64, `antenna` 64x128, `greenhouse` 128x96. Vehicles: `rocket_launch` 128x192 (8 frames, TD1), `shuttle` 96x96. Home: `trophy_pedestal` 64x64; `trophy_tyrant, trophy_hydra, trophy_dragon, trophy_titan` 48x48; `photo_frame_a..c` 96x96 + `sticker_heart, sticker_star, sticker_leaf, sticker_paw` 32x32 (HM1) |
| b34c | b34c-isle-items-gaps | 32x32 `item_`: `jungle_berry, amber, vine_rope, clover, golden_apple, fiber, hide, bone, tyrant_scale, wood, stone, apple, cocoa, feather, wool, honey, flower, nectar, hay, bug`. 24x24 `ui_`: `stable, wellfed, warmth, breath, oxygen, tamer_rank, rest, journal`. 48x48: `ui_icon_isles, ui_icon_sea_chart, ui_icon_collections, ui_icon_photo` |
| b45 | b45-isle-fx | As in NEXT-SLICES-3 §6, plus `fx_rest_glow` and `fx_spot_sparkle` (64x64, 6 frames) |

Priority for Codex:

**b38g → b40 → b39 → b37 → b34c → b43 → b42 → b44 → b41 → b45**

This order follows the waves: tundra depth lands in wave 2 and mars art is used from wave 4. Every id has a code fallback, so no slice waits on art.

## 5. Manual QA checklist for the owner (phone 390x844 + desktop, offline, about 25 min)
- [ ] **Isles from zero, home:** a fresh profile tames a clover hopper within about 2 min with the starter pouch, and the hint always names an action.
- [ ] **Rest:** take hits on the jungle, then stand on the dock. HP is full within 3 s and "Rested" shows once. Away from enemies, HP refills slowly.
- [ ] **Tundra:** the first tame (pengling, fed fish) comes within about 2 min. Thin ice cracks with a visible warning and only slows you. A hot spring warms you and heals.
- [ ] **Mars:** reach it by crafting (no URL tricks). Air warns ≥ 15 s early, the arrow points to a dome, and air alone never ends a run.
- [ ] **Where-to journey:** from the Town (Play offline), visit all 10 places through Where to? and come back each time. Your name is kept, there are no errors, and DevTools → Network shows 0 Firebase requests.
- [ ] **Nav P2s:** hold W, open Where to?, release, close: you do not walk. With a gamepad connected, the sheet blocks movement.
- [ ] **Town streak wording** (after TN3): skip a day (change the device date). The Town says "Visit day N", never "Day 1 streak" or 🔥.
- [ ] **Realm endgame:** enter the Trial of Six. After the first boss, "Leave with your loot" keeps the drop. The relic book shows the relic, and no text counts down.
- [ ] **Collections and photo:** the hub Collections card lists the isles, bugs, fish and relics. On the isles home, take a photo: a PNG downloads and the HUD is hidden.
- [ ] **Accessibility:** set text 1.5×, reduced motion and low graphics, then visit the isles, Bug Safari, Angler, the Town and the Realm. Nothing overlaps or flashes, the isles play with one thumb, and the frame rate on an older phone feels steady.

## 6. Top risks (most likely bugs first)
1. **Regen breaks fight balance.**
   - IF1 regen and rest must not run during boss fights or inside a telegraph.
   - The XB boss sims (60-180 s) and the "no one-shot" rule assume no healing.
   - Guard: a `bossEngaged` check, plus `isle-boss-sim` unchanged.
2. **Food from `inv` can eat crafting inputs.**
   - `foodFor(def, pouch, inv)` could consume `apple`, `kelp`, `frostberry` or `iron` the player saved for a recipe (iron for the rocket core, kelp for the o2 tank).
   - Use the pouch first, never take the last unit needed by a pinned or near-complete recipe, and show "uses 1 kelp from your bag".
3. **Pack-golden drift.** Rares, finds and food sources must go through page or craft tables. A stray edit to `mm-biome-packs.js` changes every world hash and silently reseeds saved fog and spots.
4. **Archipelago 20 KB cap.** Journal sightings, tame names, photos (never stored, download only), trophies, rush state and aurora gathers all grow `pixeltown-archipelago-v1`. QS3 and the TD1 round trip are the guard. Truncation must drop fog for other islands first, never tames or unlocks.
5. **Town edits near live multiplayer.** NV1 and TN3 touch `main.js`. TN3 changes the streak logic that writes `pixeltown-save-v1` on join. Keep the "empty `net.js` diff, `db.ws.length === 0`, grep for new `net.`" checks, and test an old tab that still runs the reset logic: it must not erase `visitDays`.
6. **Boss rush and deep runs vs pity and two tabs.** Six z3 kills in a row stress the SV2 "re-read before the roll" rule and the F16 persist coalescing. A rush death must flush the persist (F16 flush on death) before the safe return.
7. **Smoke-journey flakiness.**
   - Deepdelve needs THREE_JS served locally.
   - The Realm first frame is the slowest.
   - Keep per-page budgets generous (5 s), and fail on errors and DB hits, not on timing.
   - The known flakes still apply: the `dungeon-pickups` coin magnet, the `world-safereturn` upper bound, and `test-tiers.json` merge conflicts (append-only).
8. **Art id drift.**
   - `ice` vs `tundra`;
   - `<id>_saddle_*` vs `saddle_<id>`;
   - `item_jungle_berries`;
   - lowercase rider files vs camel-case class ids.

   AW4 and AW5 must check every id against the code tables before registering.

## 7. Research notes (generic sources, treat as direction)
- **Cozy safety and recovery:**
  - Cozy mechanics only read as cozy when they feel safe, known and relaxing ([Designing for Coziness](https://medium.com/kitfox-games/designing-for-coziness-d33d2519a59e)).
  - Survival pressure works best as soft slowdowns rather than death spirals or progress loss ([Winter Burrow preview](https://www.inverse.com/gaming/winter-burrow-survival-game-nintendo-switch-rec), [survival mechanics wiki](https://thegameswiki.com/outbound/wiki/survival-mechanics)).
  - Safe rooms give pacing beats between encounters ([cozy moments](https://engineered.at/articles/cozy-game-moments-in-unexpected-places)).
  - Regen rate must be tuned together with how often you reach a safe spot ([itch.io dev note](https://itch.io/post/8430777)).

  This shapes IF1: slow out-of-combat regen, a full heal only at rest spots, and no regen in boss fights.
- **Survival loop:**
  - "Safety, then a new obstacle" keeps players engaged ([Game Developer](https://www.gamedeveloper.com/game-platforms/how-to-make-superb-survival-games)).
  - Comfort can also go too far ([Don't Starve essay](https://theludite.com/2018/07/22/dont-starve-life-begins-at-the-end-of-your-comfort-zone/)).

  This is why TD1 adds gentle obstacles (thin ice, air) and RE2 adds opt-in challenge with off-ramps.
- **Motion and photo mode access:**
  - Offer motion and visual-distraction settings ([Xbox Accessibility Guideline 117](https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/117), [Unity accessibility basics](https://unity.com/blog/video-game-accessibility-basics), [mobile accessibility heuristics](https://www.gamedeveloper.com/game-platforms/accessibility-heuristics-and-evaluation-criteria-for-mobile-games)).
  - Photo tools can reduce fine-motor demand ([photography sim accessibility entry](https://www.familygamingdatabase.com/accessibility/Lushfoil+Photography+Sim)).
  - Framing help works better than precision ([photo tips](https://gamedeveloper.com/art/how-to-help-players-shoot-better-in-game-photos-for-no-cost)).

  This shapes HM1 (frames and stickers, no precision needed) and AC2.
