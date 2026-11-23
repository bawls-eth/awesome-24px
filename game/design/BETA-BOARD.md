# Beta board (owner-requested beta test, started 2026-11-23 05:25 UTC)

Phase 1 (05:25-06:30 UTC): 15 testers play ~60 min each; reports in game/design/beta/<id>.md + .json + img/.
Phase 2 (after phase 1): Lead Architect triages all findings into the 4 engineering lanes; engineers fix in isolated branches; QA/Integration verifies.
Phase 3: testers retest affected areas; repeat until no open P0/P1.
No runtime commits are pushed between the 06:44 UTC stamp and the 06:49 UTC master merge; fixes merge after it and are re-stamped before the next merge (11:49 UTC).

## Testers (id: lane, model)
| id | lane | model | branch / port |
|---|---|---|---|
| b01 | Realm combat + enemy AI | opus | beta-b01 / 9450 |
| b02 | Realm loot, gear, menus | opus | beta-b02 / 9451 |
| b03 | Dungeons, mutators, bosses, Trial of Six | opus | beta-b03 / 9452 |
| b04 | Realm world: maps, collisions, zones, Nexus, NPCs, quests | opus | beta-b04 / 9453 |
| b05 | Isles taming, party, mounts, crafting, home | sonnet | beta-b05 / 9454 |
| b06 | Isles exploration, biomes, bosses, weather | sonnet | beta-b06 / 9455 |
| b07 | Town (offline only) | opus | beta-b07 / 9456 |
| b08 | New-player journey, flow, navigation, progression | opus | beta-b08 / 9457 |
| b09 | Arcade A: Pop, Dash, Stack, Echo | sonnet | beta-b09 / 9458 |
| b10 | Arcade B: Jam, Angler, Bug Safari | sonnet | beta-b10 / 9459 |
| b11 | Stalk, Deepdelve, Lantern camp | sonnet | beta-b11 / 9460 |
| b12 | Graphics, animation, visual consistency (multimodal) | opus | beta-b12 / 9461 |
| b13 | Performance + stability (throttled, soak) | sonnet | beta-b13 / 9462 |
| b14 | Multiplayer (offline synthetic), netcode, saves, backup | opus | beta-b14 / 9463 |
| b15 | Edge cases, accessibility, input devices, hostile use | sonnet | beta-b15 / 9464 |

Capabilities and limits (honest): testers drive headless Chromium (Playwright) with real mouse/keyboard/touch events, read screenshots as images (vision), optional short video clips (ffmpeg available), CDP throttling/metrics. NOT available: real phones/GPUs/browsers other than Chromium, real audio output (cues checked through test hooks), real live multiplayer against players (forbidden: live DB), human feel of latency. All agents are Claude models (opus/sonnet; fable available for the lead); no other vendor model APIs are wired into this environment. Machine: 4 cores shared, so a 5-slot semaphore serialises browser commands.

## Dev team (lane, model)
Launched after phase 1 reports arrive (they depend on the findings): 1 Lead Architect (fable: triage, assignment, code review, integration), 2 Gameplay Engineer (opus), 3 World + Graphics Engineer (opus, multimodal), 4 Performance + Systems Engineer (opus), 5 QA + Integration Engineer (opus: verifies every fix on its branch, regression runs, release approval). Model reassignment is logged here if a lane underperforms.

## Findings tally
(filled in after phase 1)
