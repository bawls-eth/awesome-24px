# QA -> Performance + Systems (dev-perf)

## 1. S-05 (8bdd1c5) breaks an existing source-lint in save-race-tabs.test.js  [CLOSED 07:20 by 43d8f18: 75/75, regex accepts LS and also proves LS is the real storage]
Behaviour is fine (beta-s05 10/10, beta-retest-b15 5/5, deepdelve-page/dive/bugbash/goals/crafting/polish all green), but
`save-race-tabs.test.js` (browser/full) now fails 1 assert on dev-perf and on the integrated tree, and passes on the base:

```
FAIL deepdelve.js re-reads the runs record right before finishing a dive
```
Cause: the test greps deepdelve.js for `/runRec = RUNS\.load\(localStorage\);[^\n]*\n\s*const sum = RUNS\.finish\(runRec/`; S-05 renamed the argument to `LS`
(`runRec = RUNS.load(LS); // the freshest bests ...`). Repro: `BASE=http://localhost:<port>/game/index.html /tmp/bt.sh node game/tests/save-race-tabs.test.js`.
Ask: update that one regex to accept `localStorage` or `LS` (a changed expectation, keep "re-read right before finish") and name the test in the commit body.
Do not drop the assert.

## 2. S-03 (74c2416) leaves an old expectation in lantern-page.test.js  [STILL OPEN at 07:35 UTC on the merged tree]
On the integrated tree `lantern-page.test.js` 38 PASS / 1 FAIL:
```
FAIL backup of a corrupt pixeltown-mm-v1 keeps the raw value
```
S-03 deliberately changed bundle() to leave a damaged value out and name it in `warnings` (you updated the same case in
shared-mm-profile-backup.test.js, but not this page test). Ask: change that assert to the new behaviour (value left out, warning shown on the
Backup button) and name it in the commit. Heads-up: Gameplay's G-05 (6f12f65) also edits lantern-page.test.js (rekindle asserts, other
hunks): rebase on / merge dev-gameplay first or keep to the one line to avoid a conflict.

## 4. New additive key not in the Backup  [OPEN, 09:08 UTC]
Gameplay's G-26 stores Isles nodes / pouch under `pixeltown-isle-nodes-v1`. It is not in MMBackup KNOWN, so a Backup / Restore loses it.
Add it with a cleaner (object, capped list of NODES_MAX 200, see isles.js:617-620) and a label.

## 3. beta-s06-art-cache.test.js byte assert is cache-sensitive (flake)  [CLOSED 07:20 by 43d8f18 "deterministic S-01 / S-06 tests": 14/14]
Run 1 alone on the integrated tree: `FAIL [2] fewer JSON bytes transferred than the baseline 62408 -> 170457` (baseline 1235 req / 225 json
but only 62 KB of JSON bytes: the baseline page got 304 / cached bodies). Run 2 alone: 12/12 PASS. Make the byte count independent of the
HTTP cache (fresh context per measurement with `route` or CDP `Network.setCacheDisabled`, or sum `content-length` of 200s) so the assert
cannot flip on cache state. Do not loosen the threshold.
