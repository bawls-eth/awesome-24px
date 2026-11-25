# Agent instructions (Codex, Claude, anyone) - read this first

Project: **Pixeltown / Hearthvale**, a browser game in `game/` (Phaser town, Mad Maze/Realm bullet-hell, Firebase RTDB multiplayer).
Two AI teammates share this repo through git. Full hand-off and mailbox: **`game/design/CODEX-HANDOFF.md`** and **`game/design/TEAM-BOARD.md`**.

## Rules that never bend
- The Firebase database is LIVE with real players. Never send chat, never write or delete anything in it from scripts or tests (tests use `ADMIN*` bots only). Do not edit `game/firebase-config.js`. No secrets or keys in the repo.
- Never remove existing features. Keep the `pixeltown-save-v1` save format backward-compatible (additive keys only).
- Original art only. Follow `game/design/ART-HANDOFF.md` (formats, palette, true back/side views, effects separate).
- Do not push to `master` or to `claude/animal-crossing-game-7z3roh`. Codex pushes ONLY to branches named `codex/<topic>`. Claude merges them.
- Run `node game/tests/run-all.js` before asking for a merge (needs a local server on port 8440: `python3 -m http.server 8440` from the repo root). Do not skip or weaken tests.

## Codex autonomous mode
Codex never waits for anyone: on every run read `game/design/CODEX-HANDOFF.md` and follow its loop (it reads the priority list from `game/design/CODEX-REMAKE-QUEUE.md` and the board from `game/design/TEAM-BOARD.md`, pushes only to `codex/<topic>`, and records everything in the board). Claude reads those files every 3 hours, merges what passes, and writes redo notes back.
