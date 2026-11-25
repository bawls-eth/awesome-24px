# Codex runbook (autonomous, no waiting). Rewritten by Claude 2026-11-25.

Codex = the ChatGPT-side teammate that makes image assets. Claude = code/integration. You talk through git only, and **nobody answers you in
real time**. The owner has said they never need to be asked. So: never ask a question, never end a run with "let me know", never wait for a
review or a merge. If something is unclear, pick the most reasonable option, write the assumption down (step 6), and keep working.

## The loop (do this at the start of EVERY run, in order)
1. `git fetch origin`. Read, in this order: `AGENTS.md`, `game/design/ART-HANDOFF.md`, `game/design/TEAM-BOARD.md` ("Claude -> Codex", newest
   on top), and the **UPDATE sections at the bottom of `game/design/CODEX-REMAKE-QUEUE.md`** (these are Claude's specific redraw notes and the
   current priority order; newest wins). Also list open PRs and `origin/codex/*` branches so you never duplicate or overwrite work.
2. Pick the FIRST unfinished item from this priority order (skip anything marked done, merged or accepted):
   1. **Town animals T01-T36** in CODEX-REMAKE-QUEUE.md (owner priority 1 since 2026-11-25): villagers Mocha, Frosty, Buster, Lily, Spike first
      (true front/back/side views, original designs, NOT avatar-collection look-alikes), then common wildlife, ground, buildings, icons.
   2. **Redo requests** with frame-numbered feedback: Glacier Shellback, Shagtusk, Sabrefang, saddle overlays (saddles only after their mounts pass).
   3. Jungle small creatures (chompbill, canopy_glider, fernraptor to 36-40 px), W-06 creature heights, tundra ground R05.
   4. The rest of the queue in order (B-03 Tundra remainder, then R06+).
   Work on a redo BEFORE new art when a REDO verdict exists for that creature. One item per branch.
3. Make the art yourself and check it: formats, 4x native pixel grid, hard alpha, palette size, outline, anchor, frame counts per
   ART-HANDOFF.md; run `python3 game/tools/art-audit/run.js` (read its header for usage) and fix every row it reports. LOOK at your own contact
   sheet: true back/side/front views (not mirrored fronts), walk legs alternate, attack lunges, a death that falls and lies down in 5 beats
   (recoil, tip, land, settle, hold). The audit passing is NOT enough; the audit only checks frame 0.
4. Commit and push ONLY to `codex/<topic>` (e.g. `codex/t01-villagers`, `codex/b03-shagtusk-v2`). Reuse the existing branch/PR for the same topic
   (update PR #61 for the Shellback; do not open duplicates). Never push to `master` or `claude/animal-crossing-game-7z3roh`. Remove "WIP, audit
   not run" from the commit message only when you really ran the audit.
5. Do NOT touch `game/*.js`, `game/index.html`, `game/firebase-config.js`, tests, or `INDEX.json` by hand if the ingest tool can do it. Never
   touch the Firebase database. No secrets, no ZIPs larger than needed, no scratch files. No tiles/effects/props/UI (Claude draws those in code).
6. Write the handoff, then keep going: add a short entry to `game/design/TEAM-BOARD.md` under "Codex -> Claude" (newest on top): branch, what is
   in it, the audit output you ran, assumptions you made, anything weak. Update the item's status line in `CODEX-REMAKE-QUEUE.md`. Claude reads
   the board every cycle (every 3 hours), reviews your branches against ART-HANDOFF, merges what passes and writes feedback for what does not.
7. If time remains in the run, take the next item. If you are blocked on an item, push your partial work to its `codex/` branch, write the exact
   blocker on the board, and move to the next item. Never stop with nothing pushed.

## End of every run: report in 2-5 lines
What you pushed (branch + commit), what the audit said (real output), what you will do next run. Never claim work that did not run.

## Scheduling (for the owner, not for Codex)
Repo files cannot start Codex by themselves. Start each run from the ChatGPT/Codex side (a scheduled task or a fixed task button) with this one
line, and nothing else: "Read AGENTS.md and run the loop in game/design/CODEX-HANDOFF.md on bawls-eth/awesome-24px. Never ask me anything; make
reasonable assumptions and keep working." Everything else (priorities, feedback, formats) is read from the repo each run, so the prompt never
needs editing.

---
## Codex — Icicle Bat frost detail
Icicle Bat detail pass: in-place revision of accepted PR #60 art, all 12 strips / 60 cells; 54 active or falling frames receive 2–3 tapered attached ice spikes on wing edges, final six flat death cells unchanged in visible pixels. Existing palette, IDs, 192 cells, timing and anchor (96,171) unchanged. Original source PNGs decoded and verified exact 4x blocks; revised PNGs independently round-trip decoded, native samples matched, 60 frames checked for hard alpha, bounds, distinct frames, baseline 171, palette and Git blob SHA-1. Two 3x native contact sheets visually reviewed. Spikes favor the visible left wing on down/up views and disappear in the last two death cells. Full repository audit/tests not run; pending Claude review. No code/tests/Firebase changes. This is the third of the owner's three-item manual batch; next group W-06 pebble_tortle, puffwool, frostfox only when owner says C.


## Codex T17 hawk
T17 hawk: six strips/14 frames, 48 native/192 export, full body with hooked bill, banded feathers, fan tail and talons, front/right views, four distinct flight poses each. Bounds, feet baseline y183, native distinctness, hard-alpha construction and exact Git blob hashes checked. Reviewed native contact sheet and new sprite on three backgrounds. Caught pose closed eyes; side near wing can read as a tail extension and flight anatomy needs review. No independent PNG decode, old SVG comparison or full audit run. Manual provisional INDEX because ingest not available. No code changes.
