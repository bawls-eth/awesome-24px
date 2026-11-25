# Cycle 11: L (Lead Developer), branch `cyc11-lead`

Worktree `/tmp/wt-cyc11-lead`, cut from `claude/animal-crossing-game-7z3roh` at bd92da2. Static server on port 9111. Browsers ran only through `/tmp/bt.sh`, targeted tests only. Nothing was pushed. `firebase-config.js` and `net.js` were not touched. One additive save key: `stars` in `pixeltown-save-v1`.

## 1. The four 160x284 a11y offenders, and 160x284 as a default sweep viewport

Each page got its own fix (CSS only, each in a new media query that does not apply at 195 px or wider):

| Page | Before (measured at 160x284) | Fix | After |
|---|---|---|---|
| Isles | `#btn-map` at x 34-78, under the Menu button (x 8-56), overlap 22x44 | Under 190 px the mini-map is 40 px (44 with frame) and the Map toggle sits between Menu and map (`isles.css`) | Menu 8-56, Map 60-104, mini-map 108-152 |
| Festival Bugs | stick 64 + Sneak 48 + Swing 56 + gaps + 3 px button margins: Swing ended at x 193, page scrolled sideways | Under 190 px: stick 50 px, Sneak and Swing 44 px, no gap, no row padding (`bugs.css`) | body scrollWidth 160; both buttons 44 px |
| Angler | Menu reserve 62 px + Journal 87 px left the `h1` 0 px wide | Under 190 px the bar wraps and the title has its own row (`angler.css`) | `h1` 148x17 at y 58; bar 79 px tall (was 56) |
| Echo | board width = (100vh - 248 px) x 0.9 = 32 px, a 32x36 garden | Upright, `min-width: min(100%, 128px)` (`echo-late.css`) | board 128x142 (each flower about 60 px) |

`a11y-viewport-sweep.test.js`: 160x284 moved from opt-in (`EXTRA_VPS`) into the default list (9 viewports). The `EXTRA_VPS` switch stays, with an empty list, for the next size. Allow-list unchanged (still 0 entries).

**Checks run (all on :9111 through /tmp/bt.sh):**
- Before the fix, `PAGES=isles,festival-bugs,angler,echo VPS=160x284 EXTRA_VPS=160x284`: **5 FAILED** (the 4 offenders plus the "no new offenders" line).
- After, same pages at 160x284: **ALL PASSED**, 0 offenders.
- Full default sweep (16 pages x 9 viewports plus the preference passes): **ALL PASSED**, 0 offenders, **584 s** (wall 9 min 45 s) at a machine load factor of 3 to 5.
- Runtime cost: a 160x284-only pass over all 16 pages took **37 s**; a 195x422-only pass took **34 s** in the same conditions. So the new viewport adds about 37 s, roughly 6% of the full sweep. I raised the sweep's `timeoutSec` from 900 to 960 so the margin stays the same. I did not time an 8-viewport full sweep on this tip, so the 6% is from the single-viewport passes.
- Probe at 195x422, 390x844 and 1280x720 for the same four pages: positions and sizes of the changed elements are identical to before (Bugs row, Angler bar 56 px, Echo board 358 and 425 px, Isles Map button).
- Screenshots: `game/design/beta/img/cyc11-lead-{isles,festival-bugs,angler,echo}-{160x284,390x844,1280x720}.jpg`.

**Not fixed at 160x284:** on Isles the action column (Decor, Sail, Soothe) still stacks up to y 42 and overlaps the HUD and Pack button, and the how-to card covers the lower left. The sweep only checks overlaps with the Menu, so it passes. See the screenshot; this needs a U pass.

## 2. Town stars in the save, and the cross-tab pending case

### Stars
Finding: stars reset on every visit both offline and online. Online, `net.js` sets the score to 0 at join, and the player list ranks stars earned this visit.

**Implemented (offline only):** `stars` (integer, 0..1e9) in `pixeltown-save-v1`.
- Loaded at Town start when the net is the offline stand-in; written on every `awardPoint` as a merged counter (stored + this tab's own change), like the bag.
- `adoptSave` follows another tab's stars. `cleanTownSave` lists the key. The Backup bundle carries the whole town save, so no backup change was needed.
- Online nothing reads or writes the key.

**Needs a design call (not implemented):** should the wallet also persist online? That would mean either one extra live write at join to seed the server score (and the "In town" list then ranks lifetime stars, favouring long-time players), or a wallet that differs from the number other players see. It also changes the economy for live players (Polyroll, travelling merchant, turnips bought one day and sold another). Until decided, an offline player keeps stars and an online player does not, which is inconsistent.

### Pending change lost when another tab writes first
- `adoptSave` used to reset the bag, crafted goods, cave bag and lifetime stats to storage and move the delta base, so a change this tab could not write (storage refused) was thrown away.
- Now each counter becomes stored + (mine - base) and the base becomes what storage holds. With nothing pending this is exactly the old behaviour.
- While storage refuses this tab, its own achievements, museum donations and fossil bag are kept too.
- New `flushPendingSave`: when this tab sees another tab's write land, it retries its own writes once. No ping-pong, because the other tab has nothing pending.

**Checks run:**
- New `game/tests/cyc11-lead-town-stars.test.js` (registered in test-tiers.json, browser/full, 300 s). Offline stub, literal `db.attempts() === 0`.
  - **Old main.js:** part A, 5 FAILED and then stopped at a missing method (wallet 0 after reload, no key in the save). Part B alone (`ONLY=tabs`): **8 FAILED** (tab A showed 5 wood instead of 8, the save ended at 6 wood instead of 9).
  - **This branch: ALL PASSED** (two full runs). Covers at 1280x720 and 390x844: old save without the key loads and keeps every key including an unknown one; +250 stars is saved; wallet and player list still show it after a reload; a real E / tap on the action button at the turnip stall spends saved stars (159 left, same in the save). At 1280x720 also: bad values (-5, "abc", 1e12, 3.7, null, object) are cleaned; Backup bundle carries the key and plan + apply restores it; a town-only restore file with stars is accepted; online path writes nothing. Two tabs: stars add up; refused tab keeps 3 wood, 2 stars and 1 sparkle through another tab's write, writes them when storage works again, and a plain adopt does not double anything.
- Regression: `save-race-tabs`, `cyc10-lead-town-shop-reliability`, `save-compat-pages`, `beta-r4-o04-town-hub-backup`: **ALL PASSED** (each).
- Not run: the other Town tests that read `TOWN_SAVE_FIELDS` or `localScore` (bounties, days, concert, streak clock, dailies, mailbox and so on). The coordinator's full stamp covers them.
- Screenshots: `game/design/beta/img/cyc11-lead-stars-{1280x720,390x844}.jpg`.

The test measures the wallet after joining instead of assuming 0, because the Town paid 1 star on the day's first join in these runs. I did not trace which system pays it.

## 3. Review of the cycle 10 merged code

No bug found that needed a code change. Notes:

**realm-world.js (ID-53 hint, ID-55 card)**
- Listeners: the two capture `keydown` listeners and the `pagehide` listener are never removed. This matches every other window listener in the file (none is removed), and the world is created once per page load (`mad-maze.js:143`), so it is not a leak today. It would become one if the world were ever rebuilt without a reload.
- `feTick` calls `feDeep()` (a localStorage read plus JSON.parse of the Deepdelve save) once a second for a first-session player until the card shows (up to 480 s). Small, but it only needs to run when the world loads.
- At 195x422 the hint fails its overlap check in both slots, so it retries every 20 s for the whole visit (a full query of every button plus layout reads). Cheap at that rate; it is the known "never shows at 195" item.
- `jh.log` is bounded (at most 3 shows per visit; the overlap path pops its entry). `jhPick`'s recursion ends after one step.
- Dead-ish code: `feCard` is module-level but only used inside `feShow`; `const d = 1` in `jhTick` is a constant used as a variable.

**main.js SAVE_PENDING**
- A refused whole-key write (`writeSave`) is later spread over storage as it was when refused. If another tab changed the same key in between (for example `turnipBuys` or `realm`), the older value wins. This is the same last-writer-wins as an ordinary `writeSave`, but it can let the turnip cap slip by one bundle. Not changed.
- Pending changes still die with the tab if no write lands before it closes. `flushPendingSave` narrows that window but cannot close it.

**mm-town-fauna.js**
- The three code-art insects: all grids are well-formed (4 frames each, 14 or 16 rows, every row the right width, no undefined palette characters, no unused palette entries). Checked with a script.
- `halve(..., 'rare')` builds one colour-count map per frame at load time only. `thumbUrl` holds one data URL per species. No per-frame cost and no growth.

## Unresolved
- **Black rectangle on the phone Town (pre-existing):** at 390x844 with the "What's new" banner showing (a returning save with an older `lastSeenVersion`), a screenshot shows a solid black block about 190x265 px at x 101-290, y 560-825. It is on the canvas (no DOM element there), has the banner's width and x position, and also appears on the cycle 10 `main.js`. It does not appear without the banner. I could not tell whether it is a headless screenshot artifact or a real draw problem on phones; it needs a look on a real device. Visible in `cyc11-lead-stars-390x844.jpg`.
- Online star persistence (design call above).
- Isles at 160x284 is still crowded (above).
- `main.js?v=` in `index.html` was not bumped (shared file; coordinator's call).

## Proposals
1. Decide the online star wallet: keep "stars this visit" online, or seed the server score at join. If the wallet stays offline-only, say so in the offline join text.
2. U pass on Isles at 160x284 (action column over the HUD), and on the Angler bar at 190 to 199 px, where the title is about 34 px wide with an ellipsis (own-row layout would read better; I kept 195 px unchanged to avoid moving a tested layout).
3. Read the Deepdelve clear count once at world load in `feTick` instead of every second.
4. Check the phone "What's new" black block on a real device.
