# Cycle 3: Systems (S) notes

Branch `cyc3-systems` from `claude/animal-crossing-game-7z3roh` 031b83b. Own server on port 9735, every browser run through `/tmp/bt.sh`, Firebase blocked (Realm / Isles pages: `blockDb`; Town pages: `offlineStub`; every new browser test asserts `db.attempts() === 0`), targeted tests only. Not pushed.

## Built

### ID-13 first-kill bag floor (wired)
- `realm-world.js`: the world-boss kill passes `firstKill: !(save.zk & (1 << zone))` to `rollFor`, then sets the bit; the `writeSave` already in that branch saves it once.
- Trial of Six kills (`rushKilled`) call `rollFor` directly and never touch `zk`.
- Realm save `zk` (additive): the cleaner keeps an int 1..15 only (string, negative, fraction, object, 0 and 16 are dropped). `mergeStored` ORs it with storage before the seed check, because the bits belong to the hero, not to one island.
- No new storage key, so no new Backup cleaner. The realm key's existing cleaner carries `zk` (node check in the test).
- `lastDrops` entries also carry `tierIndex` and `firstKill` (additive fields, test view).
- World bosses sit in zones 1..3 (seed 12345: `[1,1,2,2,2,3,3,3]`); there is no Shore world boss. So the browser check uses the lowest-zone boss (Midlands, floor pink), not a "Shore boss" as the spec says.
- Test `cyc3-first-kill-zk` checks:
  - the cleaner;
  - that a Trial-style roll is not floored and sets no bit;
  - first kill: floored (tier >= 1) and bit set;
  - after a reload: same boss not floored, `zk` unchanged;
  - the union merge;
  - 0 DB requests.

### ID-12 errand chain (wired)
- **Town** (`main.js`), talking to Mocha:
  - 1st talk: she offers the job; nothing is spent.
  - 2nd talk, with 3 or more wood: she packs the parcel. Town save gets `errand {id, s:1}`, and the wood goes through `saveResources`' delta merge.
  - With the trophy: she takes it (`s:2`).
  - The step taken always replaces the bubble line (it wins over the birthday line too).
  - `errand` is added to `TOWN_SAVE_FIELDS`.
  - `saveErrand` is a forward-only `writeSaveMerged`.
  - The Town page loads `shared/mm-errands.js`.
- **Reward:** a code-drawn "Realm lantern" (post, iron frame, teal flame, soft glow) beside the home plot.
  - It is derived from `s:2`, so it cannot be sold, gifted or lost. No new item id was added to RECIPES, because the Sell-all button would have sold it.
  - It is cosmetic: the cozy score is unchanged.
- **Realm** (`realm-world.js`):
  - The Nexus Vendor's talk calls `erVendor()`. With a parcel being carried it delivers it (Realm save `errand {p:1}`) and says the trophy line, then opens the stall as always.
  - The kill hook `erKill(zone)` sits next to `nbMeet`. With nothing delivered it does no work per kill.
  - The Realm save `errand` is cleaned by `MMErrands.cleanRealm` and merged forward-only.
  - The Realm never writes the Town save.
- Off switch: `?errands=0` on either page.
- No new storage key: both fields live in keys already in the one Backup list (`pixeltown-save-v1`, `pixeltown-realm-v1`). Documented in SAVE-KEYS.md.
- Test `cyc3-errands-wired` (17 checks), one shared context:
  - Town offer, then pack (wood 5 -> 2);
  - Realm: a kill before the delivery gives nothing, the Vendor delivery, a Shore kill gives nothing, the Midlands trophy comes once;
  - the Realm does not write the Town save;
  - Town: the trophy is handed in and the decor shows (texture `realmLantern`, cozy 0);
  - no second reward;
  - a stale s:1 write keeps s:2;
  - a forged Realm trophy cannot finish a chain the Town never started;
  - `?errands=0` is inert;
  - 0 DB requests on both contexts.
- Screenshots:
  - `img/cyc3-errand-desktop.jpg` (1280x720): the lantern by the home plot.
  - `img/cyc3-errand-phone.jpg` (390x844): Mocha's line.
  - G: the lantern is 24x48 code-drawn pixels. Please review it against ART-HANDOFF.

### ID-07 tame bond hearts
- `mm-tames.js`:
  - `hearts(bond)`: heart n is full at bond >= 2n; an odd bond adds a half heart.
  - `perks(bond)`: sway from bond 4, ribbon from 6, glow at 10. Flags only.
  - `bondGain(sess, id, kind)`: ride gives 10 per minute, capped at 30; fight gives 5, capped at 25. The caps are per tame per session. `sess` lives in memory only.
- `isles.js`:
  - Stable rows show 5 hearts (`role=img`, label "Bond b of 10").
  - Each full riding minute adds aff through the one `TAMES.addAffinity` path.
  - A kill where a companion landed a hit (`c.compHit`) gives +5 to each standing party companion.
  - The stable is written only when aff moves: at most 8 writes per tame per session.
  - Perks are draw only: a sway x-offset, a ribbon over the sprite, a glow ellipse under it.
  - `?bondx=0` turns the new aff sources off.
- Note: `CMP.damage(def, ent.bond, ...)` already scales companion damage with bond (from before this cycle). A session adds at most 55 aff (bond +0.55), and fresh tames start at aff 0, so the first ten minutes cannot cross a bond step.
- Test `cyc3-bond-hearts` checks:
  - node: hearts for bond 1..10, hostile bond values, perks, caps, monotone bond, at most 55 aff a session;
  - browser:
    - hearts DOM for bond 5 and bond 10;
    - +10 aff at 60 s of riding (none at 59.5 s);
    - 4 minutes of riding add 30;
    - 6 companion kills add 25;
    - perks change no party state;
    - `?bondx=0` adds nothing;
    - 0 DB requests.

### ID-14 hit pause + telegraph audit
- **Hit pause** (`realm.js`):
  - A hit of at least 15 percent of max HP stores `_hitPauseAt = _lastT`.
  - `_loop` still runs `_update` (and the camera) every frame. It skips only `_draw` while `hitAt < now < hitAt + 50 ms`.
  - The hit frame itself is drawn, then held.
  - It is off under reduce motion (`_reduced`, the real read path) and with `?hitpause=0`.
- **Test `cyc3-hit-pause`:**
  - Method: the rAF loop is stopped and `_loop` is driven with identical synthetic timestamps, with the pause on and off.
  - Same with the pause on and off: the dt sequence, the sim clock, the hero HP and the positions of all 24 enemy bolts.
  - Pause on: 2 of 20 frames are held.
  - A 10 percent hit holds nothing.
  - Reduce motion holds nothing.
  - `?hitpause=0` turns it off.
- **Telegraph audit:**
  - `MMTelegraph.WINDUP_T3` is raised from 0.35 to 0.4. It is draw only: the wind-up shows over the last part of the existing cooldown.
  - Already at or above 0.4 s:
    - bosses: wind-up 0.6 s, first cooldowns 2.4 / 1.1 / 2.0 s (cooldowns do not tick while invulnerable);
    - mob first shots: at least 0.8 s.
  - Not telegraphed by design, listed and left as they are: the boss spirals.
  - `shared-mm-telegraph` and `telegraph-arena` now expect 0.4. In the arena test the "no wind-up yet" probe moved from 0.4 s left to 0.45 s left, so it still tests the window edge. This is an honest update of the expected constant, not a weaker check.
  - New node test `cyc3-telegraph-audit` reads the cooldowns from the realm.js source and fails loudly if they move.

### ID-01 Shore XP fade
- `MMZones.TABLES.SHORE_XP_FADE` and `MMZones.shoreFade(level, zone)`.
- In `realm.js` `_onEnemyKilled`, a kill with `e.zone === 0` gains `max(1, round(raw * fade))`, using the level being gained (`save.level`).
- Shards, drops, boss XP and zones 1+ are untouched.
- Toast "The Midlands has better prey" once per session, with no number.
- `spawnEnemy` now resets `e.zone`. A reused pool entry used to keep the old zone; that was harmless before, because nothing in realm.js read it.
- `?shorefade=0` turns it off.
- Test `cyc2-shore-fade` (spec name) checks:
  - node: the table, zone > 0 = 1, bad input, at least 1 XP;
  - browser: a Lv 4 kill gives full XP; Lv 6 gives x0.70; Lv 7 gives x0.60 with one toast; `?shorefade=0` gives full XP at Lv 6; 0 DB requests.

## Not done
- ID-06 assist sliders: not started.
  - Settings rows in `mm-settings.js` are on/off toggles. A 6-step slider is a new control type in U's file.
  - The "Assisted" run-summary tag needs the summary, medal and best paths.
  - It did not fit the time box, so it is left for U + S together.

## Checks run (port 9735, /tmp/bt.sh)
All ALL PASSED unless noted:
- New tests: cyc3-first-kill-zk, cyc3-errands-wired, cyc3-bond-hearts, cyc3-hit-pause, cyc3-telegraph-audit (node), cyc2-shore-fade.
- Run alone on the final code: first-ten-minutes, isles-first-ten, world-ttk.
  - An earlier first-ten-minutes run (ID-13 only, while my other tests ran at the same time) failed one gate: world-shore-d `layout.firstFrameMs` 7355 > 6480, a load-time gate. Alone on the final tip it passed.
  - isles-first-ten also passed alone after ID-07.
- Realm / Nexus: gear-world-drops, beta-w04-nexus, cyc2-notebook, telegraph-arena, shared-mm-telegraph.
- Town: home, town-offline, beta-s01-town-restore, cyc0-town-interact-shadow.
- Saves: save-compat-pages, save-hostile-fuzz.
- Isles: beta-g20-isles-stable, isles-taming.
- Node: cyc2-errands, cyc2-first-kill-floor, shared-mm-tames, shared-mm-zones, shared-mm-backup.
- run-all-tiers, live-safety.
