# r4-d5b: stricter live-class rule in run-all-tiers.test.js (D5)

## The rule
A JOIN ACTION makes a test file live-class: helpers `launch(`, helpers `joinOffline(`, or a click / tap / dblclick / press on
`#join-btn` / "Join Town" (also `getElementById('join-btn').click()`). A file with a join action may be `browser` (or `node`) only when
it PROVES it is offline: it calls `offlineStub(ctx)` (every database host blocked for HTTP and WebSocket, and the Firebase SDK
answered with an empty script, so the page cannot even try) AND asserts `db.attempts() === 0`.
Naming the button without acting on it (reading its label or its disabled state) is not a join. A 10-case self-test pins the pattern.

The old rule was the strings `launch(` or `#join-btn`. It flagged 0 files and did not see 35 non-live files that click the Join
button by its text. No class in test-tiers.json changed with the new rule: all 33 live tests are still seen as joining.

## One named exemption: `town-offline.test.js`
It is the test OF the unreachable database: status line, the 6 s timeout, the "Play offline" offer. It needs the real Firebase SDK and
a database that hangs, so the page must try to connect; the attempts are what it measures, and `offlineStub` would remove the thing
under test. It blocks every database host itself (`ctx.route(DB_HOST)` aborts HTTP, `ctx.routeWebSocket(DB_HOST)` never connects or
answers) and asserts that no socket attempt follows "Play offline". `run-all-tiers` pins the list to exactly this file and checks that
the file still carries both blocks. Nothing else may be added without the same kind of reason.

### `town-polish.test.js` did NOT need the exemption
The owner's decision named it as the second exemption, to be verified first. Verified by D5: its subject is layout (the offline join
card fits 1280x720 and a phone, the Hold-to-talk pill clears the inventory bar, access prefs are mirrored), not the SDK. Run unchanged
except for `offlineStub(ctx)` in place of its inline host block it passed (ALL PASSED): the join ends on the same "Can't reach the town
server" status with the stubbed SDK. So it was converted like the others (stub + `db.attempts() === 0` per Town context, 20/20) and is
NOT on the exemption list. To exempt it after all: revert the town-polish commit and add its name to `JOIN_EXEMPT`.

## Conversions (29 files: the 28 of the decision + town-polish), each run alone by D5 through /tmp/bt.sh on r4-d5b
"Swap" = `blockDb(ctx)` + the hand-written empty-SDK route became `offlineStub(ctx)`, which does exactly both.
| Test | What changed | Result alone |
|---|---|---|
| beta-r4-o04-town-hub-backup | swap | 20/20 |
| beta-s01-town-restore | swap | 32/32 |
| beta-s02-town-two-tabs | swap | 23/23 |
| beta-s07-town-cull | swap | 10/10 |
| beta-s08-town-three-lazy | swap | 9/9 |
| beta-s10-storage-throws | swap | 48/48 |
| beta-w06-town-board | swap | 8/8 |
| beta-w07-town-hud | swap | 6/6 |
| nav-town | swap | 104/104 |
| nav-town-p2 | swap | 34/34 |
| smoke-journey | swap | 436/436 |
| town-isles-sign | swap | 38/38 |
| town-postcards | swap | 90/90 |
| save-compat-pages | swap; `db.count() === 0` spelled `db.attempts() === 0` (same function) | 453/453 |
| town-8bit-menu | swap; count -> attempts | 56/56 |
| town-bugbash | swap; count -> attempts | 27/27 |
| town-front-door | swap; count -> attempts (4 asserts) | 19/19 |
| town-heroes | swap; count -> attempts (2 asserts) | 57/57 |
| town-perf | swap (2 contexts); count -> attempts | 20/20 |
| beta-retest-b14 | already offlineStub; count -> attempts (2 asserts) | 17/17 |
| beta-g01-gift | swap; the record is kept and asserted `=== 0` on each of its 3 Town contexts (new asserts) | 12/12 |
| beta-g12-esc-close | swap; new `=== 0` assert on the Town context (its Realm context keeps blockDb) | 17/17 |
| beta-g13-beach-first | swap; new `=== 0` assert | 6/6 |
| r4-d2-statue | already offlineStub; `db.count() >= 0` (always true) became `db.attempts() === 0` | 17/17 |
| a11y-viewport-sweep | Town contexts use offlineStub, other pages keep blockDb; `attempts() >= 0` (always true) became `=== 0` for every page | 115/115 (431 s): no page, Town or not, attempted a database request |
| gear-default-on | Town context: blockDb only (real SDK loaded and tried to connect) -> offlineStub; `count() >= 0` became `attempts() === 0` | 38 pass, 1 red: "2/3: neither the snapshot key nor the hint key is a known backup key". That red is NOT from the conversion: it is the stale assert against D3 08e50c2 (O-04), already red on r4-integ b2de815. The converted Town checks pass |
| gear-save-fixes | Town context: blockDb only -> offlineStub; "every attempt was blocked" became `t.offline && db.attempts() === 0`. Arena contexts unchanged | 27/27 |
| net-hostile-presence | blockDb -> offlineStub; its own fake in-page SDK route is registered later and still answers | 18/18 |
| town-polish | inline host block -> offlineStub; new `=== 0` assert on both Town contexts | 20/20 |

`run-all-tiers.test.js` and `live-safety.test.js`: green on this branch.
