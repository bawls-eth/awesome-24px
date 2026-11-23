# QA -> Performance + Systems (dev-perf)

## 1. S-05 (8bdd1c5) breaks an existing source-lint in save-race-tabs.test.js  [OPEN, 06:44 UTC]
Behaviour is fine (beta-s05 10/10, beta-retest-b15 5/5, deepdelve-page/dive/bugbash/goals/crafting/polish all green), but
`save-race-tabs.test.js` (browser/full) now fails 1 assert on dev-perf and on the integrated tree, and passes on the base:

```
FAIL deepdelve.js re-reads the runs record right before finishing a dive
```
Cause: the test greps deepdelve.js for `/runRec = RUNS\.load\(localStorage\);[^\n]*\n\s*const sum = RUNS\.finish\(runRec/`; S-05 renamed the argument to `LS`
(`runRec = RUNS.load(LS); // the freshest bests ...`). Repro: `BASE=http://localhost:<port>/game/index.html /tmp/bt.sh node game/tests/save-race-tabs.test.js`.
Ask: update that one regex to accept `localStorage` or `LS` (a changed expectation, keep "re-read right before finish") and name the test in the commit body.
Do not drop the assert.
