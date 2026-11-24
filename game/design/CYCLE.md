# Hourly development cycle (owner-approved 2026-11-24, live chat)

Five specialised agents work in parallel, each on its OWN branch `cyc<N>-<role>` cut from the integration tip, in its own worktree and port. The coordinator (the Claude session that fired the cycle) merges, tests, stamps and pushes. Only verified work reaches `claude/animal-crossing-game-7z3roh`; master is merged by the manager after a green stamp.

## Roles
| Role | Model | Owns |
|---|---|---|
| L Lead Developer | fable | whole-codebase review, bugs, perf, stability, dead/outdated code, integration notes |
| U UI/UX Designer | opus | menus, HUDs, navigation, mobile, accessibility, a11y allow-list |
| G Graphics + Pixel Art | opus | original sprites/animations/terrain/effects in code, Codex branch review, visual consistency (ART-HANDOFF.md; OpenAI spend capped at $4.00 total, ledger LEDGER-OPENAI.md) |
| D Gameplay Designer | sonnet | research mechanics (generic web queries only), write approved-ready proposals in game/design/IDEAS.md, small tuning changes to combat/progression/quests with tests |
| S Game Systems Developer | opus | implement approved ideas from IDEAS.md (status `approved`), NPC behaviour, world interactions, new mechanics with tests |

Idea flow: D proposes (status `proposed`) -> L or U reviews feasibility and marks `approved`/`rejected` with a reason -> S implements -> D/U verify in gameplay. Agents review each other's branches (read-only comments in game/design/beta/fixes/cycle-<N>-<role>.md).

## Each hour
1. Read: TEAM-BOARD.md, ROUND4-TRIAGE.md / beta triage, last cycle report (game/design/CYCLE-LOG.md), failing tests, IDEAS.md.
2. Pick the 3 highest-impact items per role; no two roles edit the same file region (shared: main.js, realm.js, index.html, test-tiers.json: small commits, rebase first).
3. Implement real code/art/UI changes. Every change gets a test that fails before and passes after (or an honest extension of one); never weaken or skip a test; additive saves only; original art only.
4. Targeted tests only through /tmp/bt.sh; verify in a real browser (desktop 1280x720 + phone 390x844) with screenshots in game/design/beta/img/cyc<N>-*.jpg.
5. Report per agent: branch, sha, resolved items WITH the check actually run, unresolved, proposals.
6. Coordinator: merge, full 4-shard stamp (tools/stamp.sh --shards 4) on the integrated tip, solo-rerun failures, trace real failures to a commit and send back; commit ci-status.json; push to the dev branch only if green; append CYCLE-LOG.md (changed / tested / queued next). Stop pushing runtime commits before the manager merge (:44 stamp deadline rule from TEAM-BOARD.md).

## Rules that never bend
AGENTS.md: live Firebase never written/chatted by tests (offlineStub/blockDb, ADMIN* bots only under the live lock); do not edit firebase-config.js or net.js; no secrets; pixeltown-save-v1 additive; do not push to master or the dev branch (agents never push); stop and report if the usage limit is hit. Honesty: never report a fix or a test as done unless it ran.
