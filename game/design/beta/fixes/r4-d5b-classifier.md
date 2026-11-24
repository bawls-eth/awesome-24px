# r4-d5b: stricter live-class rule in run-all-tiers.test.js (D5)

Rule: a JOIN ACTION (helpers `launch(`, `joinOffline(`, or click / tap / dblclick / press on `#join-btn` / "Join Town", also
`getElementById("join-btn").click()`) makes a file live-class unless it calls `offlineStub(ctx)` AND asserts `db.attempts() === 0`.
Naming the button without acting on it is no longer a join. The old rule (`launch(` or the string `#join-btn`) flagged 0 files and
did not see the 35 non-live files that click "Join Town" by text. No test changed class: the 33 live tests are all still seen as
joining; test-tiers.json is untouched.

RESULT: `run-all-tiers.test.js` is RED on this branch by design, naming the 30 files below. Each one does block the database today
(column 2), so none is live in effect; they only lack the proof the new rule asks for. They are listed, not edited (not D5 files).
`beta-r4-replay-town` and `beta-r4-replay-doors` (D5 files) were moved to `offlineStub(ctx)` and pass the rule and their own checks.
`town-offline.test.js` cannot use offlineStub by design (it tests the fallback with the real SDK and a hung database, so attempts
are expected): it needs a decision (a named exemption in the rule, or live-class), not a stub.

Output of the comparison script (old rule vs new rule, 475 files):
```
tests 475 | live 33 | browser 313 | node 129
old rule flagged: none
live tests the new rule no longer sees as joining (information only, they stay live): none
non-live with a join action, proven offline (pass): beta-r4-d4-mobile.test.js beta-r4-d4-town.test.js beta-r4-doors.test.js beta-r4-replay-doors.test.js beta-r4-replay-town.test.js
non-live that only NAME #join-btn (old rule would flag, new rule passes): none
FLAGGED by the new rule (30):
  a11y-viewport-sweep.test.js                 blockDb+SDK-route (same effect, by hand) | weak assert
  beta-g01-gift.test.js                       blockDb+SDK-route (same effect, by hand) | no attempts assert
  beta-g12-esc-close.test.js                  blockDb+SDK-route (same effect, by hand) | no attempts assert
  beta-g13-beach-first.test.js                blockDb+SDK-route (same effect, by hand) | no attempts assert
  beta-r4-o04-town-hub-backup.test.js         blockDb+SDK-route (same effect, by hand) | asserts ===0
  beta-retest-b14.test.js                     offlineStub | weak assert
  beta-s01-town-restore.test.js               blockDb+SDK-route (same effect, by hand) | asserts ===0
  beta-s02-town-two-tabs.test.js              blockDb+SDK-route (same effect, by hand) | asserts ===0
  beta-s07-town-cull.test.js                  blockDb+SDK-route (same effect, by hand) | asserts ===0
  beta-s08-town-three-lazy.test.js            blockDb+SDK-route (same effect, by hand) | asserts ===0
  beta-s10-storage-throws.test.js             blockDb+SDK-route (same effect, by hand) | asserts ===0
  beta-w06-town-board.test.js                 blockDb+SDK-route (same effect, by hand) | asserts ===0
  beta-w07-town-hud.test.js                   blockDb+SDK-route (same effect, by hand) | asserts ===0
  gear-default-on.test.js                     blockDb only (SDK loads, DB blocked) | weak assert
  gear-save-fixes.test.js                     blockDb only (SDK loads, DB blocked) | asserts ===0
  nav-town-p2.test.js                         blockDb+SDK-route (same effect, by hand) | asserts ===0
  nav-town.test.js                            blockDb+SDK-route (same effect, by hand) | asserts ===0
  net-hostile-presence.test.js                blockDb+SDK-route (same effect, by hand) | asserts ===0
  r4-d2-statue.test.js                        offlineStub | weak assert
  save-compat-pages.test.js                   blockDb+SDK-route (same effect, by hand) | weak assert
  smoke-journey.test.js                       blockDb+SDK-route (same effect, by hand) | asserts ===0
  town-8bit-menu.test.js                      blockDb+SDK-route (same effect, by hand) | weak assert
  town-bugbash.test.js                        blockDb+SDK-route (same effect, by hand) | weak assert
  town-front-door.test.js                     blockDb+SDK-route (same effect, by hand) | weak assert
  town-heroes.test.js                         blockDb+SDK-route (same effect, by hand) | weak assert
  town-isles-sign.test.js                     blockDb+SDK-route (same effect, by hand) | asserts ===0
  town-offline.test.js                        NO BLOCK FOUND | weak assert
  town-perf.test.js                           blockDb+SDK-route (same effect, by hand) | weak assert
  town-polish.test.js                         NO BLOCK FOUND | no attempts assert
  town-postcards.test.js                      blockDb+SDK-route (same effect, by hand) | asserts ===0
```

Reading the table: "NO BLOCK FOUND" means no helper was found by the script. `town-offline` and `town-polish` block the database
hosts with their own inline `ctx.route` / `ctx.routeWebSocket` (checked by hand). "weak assert" = the file reads `attempts()` or
`count()` but does not assert `=== 0`. "blockDb only" (gear-default-on, gear-save-fixes) = the Firebase SDK still loads and the page
tries to connect; the attempts are blocked.
