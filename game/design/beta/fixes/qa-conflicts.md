# QA conflict watch (integration of dev-perf + dev-gameplay + dev-world)

Rebuilt `dev-qa-integ` every round from `dev-qa` + the three lane branches, one merge at a time. Only `game/tests/test-tiers.json` has
conflicted so far (every lane appends at the end): resolved as the key union of both sides, with a hard stop on any key whose value differs
(none so far). No non-trivial conflict yet.

Base note: at about 06:59 UTC `claude/animal-crossing-game-7z3roh` was fast-forwarded to dev-perf (reflog "merge dev-perf: Fast-forward",
8a6c419). QA compares "before" against the beta base 927fc9e, not the moving branch name.

## Runtime files touched by more than one lane (by commit subject S- / G- / W-)

| File | Commits (lane:sha) | Slot order (TRIAGE 5) | Status / risk |
|---|---|---|---|
| game/main.js | PS:3006734 (S-01/S-02), PS:74c2416 (S-03, 4 lines), GP:05f4092 (G-12), GP:ea61cba (G-13) | PS -> GP -> WG | Merged clean. S-03 edited main.js after PS released slot 1 (before GP started): no overlap with G-12/G-13 hunks. WG (W-06) is next; S-07 code change comes back to PS after WG. |
| game/games/mad-maze/realm-world.js | PS:b1dd500 (S-04), PS:e4dec07 (S-06), GP:0c9890c (G-23), GP:7dac640 (G-03 vendor), GP:05f4092 (G-12 Nexus Esc), GP:873ff28 (G-06), GP:eb73a2c (G-07) | PS -> GP -> WG | Merged clean. WG (W-03, W-04) must start from GP's tip after GP says released: the Nexus section (W-04) is next to GP's G-12 / G-03 vendor edits (nexus keydown, nxStallRender). |
| game/games/isles/isles.js | GP:b2f6bd8 + GP:ff9dcc3 (G-22), GP:fde9340 (G-20/21), WG:063a677 (W-12) | GP -> WG -> PS | EARLY CALL-OUT: WG started W-12 while GP still owes G-26 (isles.js:1838-2149, glint / pouch / craft) in slot 1. Merged clean today (hero draw vs Stable tab), but G-26 must rebase onto WG's W-12 or wait; WG W-17 / W-18 (how-to card, HUD) should wait for G-26. |
| game/realm-ui.css | GP:21fd30e (G-02), WG:5aa2b47 (W-05) | GP -> WG | Correct order (WG merged dev-gameplay first). Done. |
| game/games/deepdelve/deepdelve.js | PS:8bdd1c5 (S-05), PS:92426be (S-11 part), GP:0c80e8b (G-10) | PS -> GP | 07:47: GP landed G-10 while PS has S-09 (spikes: deepdelve.js:518, 574-607, 751) still open. G-10 touches the mine/place path (:91, :459). Merged clean; if PS does S-09 it must start from GP's tip (relight on edit is next to the placed-cell set). |
| game/main.js (later) | PS:43d8f18 (restore reload timer, after slot 1 release), WG:3b221fd (W-06 board) | | Both merged clean with GP's G-12 / G-13. PS edited main.js outside its slot; tell PS to hold until WG releases slot 3 (S-07 code change). |
| game/games/isles/isles.js (later) | GP:4fd46e4 (G-26) after WG:063a677 / bbaefbd | | GP did G-26 after WG started: merged clean, all isles tests green. Slot 1 is now done; WG continues, then PS (S-12). |

## Same-function watch
- `Town.importSave` / `writeSave` (main.js): PS only. G-12 adds a window keydown near closeTopOverlay: no shared function.
- realm-world.js Nexus keydown: G-12 (Esc closes the board first) and G-23 (Enter blocked mid fight) both edit the Nexus key handling; same
  lane (GP), sequential commits, tests beta-g12-esc-close and beta-g23-trial-enter both green on the merged tree.
- Existing tests edited by two lanes: lantern-page.test.js (GP G-05 rekindle asserts; PS still has to change the S-03 backup assert,
  qa-to-perf #2): different hunks, but tell PS to rebase first. shared-mm-profile-backup.test.js (GP G-05 + PS S-03): merged clean.
