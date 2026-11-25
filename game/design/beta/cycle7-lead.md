# Cycle 7: L Lead Developer

Branch `cyc7-lead` (cut from 490ca71). Not pushed. Server port 9701, browsers only through /tmp/bt.sh. `ci-status.json`, `firebase-config.js` and `net.js` untouched. No save-format change.

## What changed

### 1. Realm mouse aim froze over the HUD (real desktop bug)
- `game/realm.js`: the `pointermove` listener moved from the canvas to the window (passive), and `destroy()` removes it. `toArena` already maps against the canvas rectangle, so the aim is correct wherever the cursor is. `pointerdown` stays on the canvas, so hovering or clicking the HUD never starts firing. Touch pointers are still ignored (`pointerType === 'mouse'` only).
- Where the bug actually showed: in the world page the ability bar lies over the bottom of the canvas; in the dungeon page at 1280x720 the bar is a column to the LEFT of the letterboxed canvas (canvas x 169..1110, bar x 16..72), so there the aim froze because the cursor left the canvas, not because the bar covered it. The window listener fixes both.
- Test `game/tests/cyc7-lead-aim-over-hud.test.js` (real mouse via `page.mouse`, 1280x720, world and dungeon pages, 18 checks).
  - Before the fix (old realm.js): FAIL world 3, 4, 7 (the arena mouse stayed at 420,438 while the cursor was at the bar; wanted 408,493).
  - After: ALL PASSED (18/18).
  - Screenshots: `img/cyc7-lead-aim-world-1280.jpg`, `img/cyc7-lead-aim-dungeon-1280.jpg`.
  - 390x844 / 195x422 not run for this item: phones have no mouse aim (the sticks own touch); check 6 proves a touch pointermove changes nothing.

### 2. The bolt knows its owner; the fall card says who felled you
- `fireEnemyBullet(x, y, angle, speed, kind, owner)`: optional 6th argument, default the enemy being updated (`this._curE`). The pooled bolt gets three references, no allocation: `ok` (owner type), `oa` (art id), `on` (boss name). Both bolt pools (initial and grown) carry the fields; a reused bolt with no owner is cleared.
- The bolt that hits sets `_hitSrc`; `_hitPlayer` reads and clears it; a lethal hit sets `_felledBy` (boss name, else the art id made readable such as 'Frost Wolf', else Whirler / Sniper / Burster). `_beginRun` clears it.
- Fall card: a first row "Felled by <name>" (built with textContent). Fall banner: "· felled by <name>" appended at the very end, so older banner matches still hold.
- `game/games/mad-maze/realm-world.js` (one line): the Trial of Six layer bolts pass their boss as the owner.
- Test `game/tests/cyc7-lead-felled-by.test.js`.
  - Before (old realm.js): 9 FAIL then a TypeError (`_boltOwnerName` missing).
  - After: ALL PASSED at 1280x720, 390x844 and 195x422 (12 checks each, run with `FELLED_VIEWS=1280x720,390x844,195x422`) plus 3 checks where an enemy fires through the normal update loop. The registered default runs 1280x720 only.
  - Screenshots: `img/cyc7-lead-felled-1280.jpg`, `-390.jpg`, `-195.jpg` (390 looked at: the row fits, name right-aligned).

### 3. Review pass: per-frame allocations and dead code
Measured with the sampling heap profiler (128 byte interval, 300 frames), Realm world with the hero firing and walking among 58 enemies, and the Town standing and walking.

Fixed (the highest-impact one that I could explain): **the spatial hash rebuild**, `game/shared/mm-hash.js`, called from `realm.js _buildHash` on every frame the hero has a bolt in the air.
- Cause 1: `clear()` set each used cell array's `length = 0`, which drops its storage, so every cell grew a new one on the next insert. Now a cell is `{ n, a }`: the count is reset, the array is kept.
- Cause 2: the cell key went up to 2^32, which does not fit a small integer, so every Map lookup boxed a number. Now the key is a small integer within +-16384 cells; cells further out keep the old formula, shifted clear of the small range.
- Numbers: whole Realm frame 45,580 -> 36,747 B/frame (58 enemies, hero firing and walking). In the test scene (29 enemies, hero standing and firing): `_buildHash` with callees 5,556 -> 679 B/frame, mm-hash.js 4,903 -> 1 B/frame. The 679 B left is the two coordinates per enemy handed to `insert()` when that call is not inlined.
- Test `game/tests/cyc7-lead-hash-alloc.test.js`: before the fix 2 FAIL (5556 and 4903 B/frame); after ALL PASSED (8/8), including an oracle (60 rebuilt frames x 120 queries against brute force, with far cells, negative coordinates and the overflow list: 0 missed, 0 duplicates).
- Bytes only; I make no frame-time claim.

Regression tests run after all changes, all passed: `shared-mm-hash`, `shared-bugbash-fuzz` (91), `realm-bullet-bench`, `realm-wire`, `realm-destroy-listeners`, `beta-r3-boss-bar-fall`, `cyc3-realm-frame-alloc`, `run-all-tiers`. The full suite was NOT run (coordinator's stamp).

## Found, not fixed (for the next cycle)

Realm (`realm.js`), bytes per frame in combat with 58 enemies:
1. **`_updateBullets`: about 13,500 B/frame of its own, only while the hero fires AND walks** (882 B/frame with no hero bolts; about 4 live hero bolts). It stays in that function with inlining switched off, so it is not a callee. Not seen in the standing test scene (whole frame 7,067 B). I did not find the cause in the time box. This is now the largest single item; next step is to bisect the hero-bolt loop (weapon-style `_stepWpn` path, `_shotSolidAt`, the pierce fields `h0/h1/h2/hn/pr/own/dmg/cr/sq` that are added to bolts after the pool literal).
2. `_draw`: 6,300 to 7,100 B/frame (4,185 without hero bolts, about 1,000 with no bolts at all).
3. `_updateEnemies` 2,300 to 4,400 and `_canFire` about 1,400 to 1,500 B/frame.
4. `_drawEnemyArt` about 1,000, `_drawEBTrail` 670 to 960, `_drawEBoltArt` about 500 B/frame.
5. Outside realm.js but in the same frame: `mm-fog.js` encode + decode about 1,350, `realm-world.js` drawSites 550, h2 440 to 1,000, drawPicks 300 to 420, `mm-pickups.js` magnetStep 230 to 460 B/frame.

Town (`main.js`), 8,585 B/frame standing and 9,208 walking:
1. `cullOffscreen` 4,620 B/frame: still half of the Town frame after the cycle-4 cut.
2. Anonymous callbacks at lines 9172 (in updateVillagers, 320 to 640), 6859 (440 to 480), 5531 (fish shadows, 290 to 320), 4489 (fishing spot search, 230 to 250), 9225 (nearest villager, 205 to 230): closures created per frame.
3. `tryAxis` 680 B/frame while walking, `updateFloraFaunaHint` 375 to 408, `updateLocalMovement` 216 to 447, `onUpdate` 206 to 274, `pollGamepad` 129 to 136.

Dead code (static scan of realm.js: names referenced once in all non-test sources):
- `RM_DEATH_PENALTY` (constant 0, never read) and `refreshAssist()` (no caller in the game or the tests) are dead.
- Test-only hooks, used by tests and nowhere in the game (keep): `boltArtDraws`, `boltArtStats`, `enemyPips`, `fxDraws`, `screenToWorld`, `statusIcons`, `telegraphOf`, `worldToScreen`.
- I removed nothing: no test would have failed before a removal, and the rule is one test per change.
- **The same scan for main.js did not finish inside the time box**, so main.js has no dead-code list this cycle.

Other unresolved:
- "Felled by" covers enemy bolts only. Lava, boss slams (dungeon.js / realm-world.js call `_hitPlayer` directly), duel shots and dungeon queued bolts (fired with no current enemy) show no row. Co-op wipes after being downed are not named either.
- The fall card is only shown in menu mode outside dungeons; in a dungeon the name appears in the banner only.
- With the window listener the aim also follows the cursor while a panel or the pause menu is open. Harmless as far as I can see (no firing), but not tested panel by panel.

## Proposals
- Bisect the `_updateBullets` 13.5 KB/frame item first next cycle; it is larger than everything fixed this cycle.
- Pass an owner to the dungeon queue bolts and give slams / lava a source label, so every fall is named.
- Remove `RM_DEATH_PENALTY` and `refreshAssist()` with a small guard test, or wire `refreshAssist()` into the Settings sheet if that was its purpose.
- Finish the main.js dead-name scan offline (the script is slow, not blocked).
