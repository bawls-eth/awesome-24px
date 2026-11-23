# Research: what keeps small mini games fun to replay, mapped to our 10 (planner, 2026-11-22)

Read-only pass. It builds on today's `MINIGAME-FUN-*.md` notes (each game already has combos, a PB, one-tap restart and medals) and on ART-AUDIT-3 / CODEX-MINIGAME-ART-ASKS.
The web research used generic queries only (sources at the end). Treat the sources as direction: they are developer blogs, guidelines and papers, not rules.
Hard limits for every idea: no real money, no loot boxes, no streaks across days, no fake urgency, no expiring rewards, no notifications, odds shown are the real odds.
Effort: S = under half a day, M = about a day, L = several days. Risk: what could go wrong. Ideas are ranked inside each game, best value first.

## A. Cross-game findings (apply to all 10)
1. Juice backs up good rules; it does not replace them. Sound in sync with the action plus a 40-80 ms hit pause makes input feel heavy. Every game has this now, so the next gain is depth, not more particles.
2. "One more try" comes from cheap failure plus a concrete next target. Honest near-miss lines ("2 short of your best") work. Generic praise does not.
3. Compare against your own past self (PB, ghost, best seed). Showing other players' top scores reads as pressure; a "your best on this seed" line gives the same pull without the pressure.
4. Seeds are the cheapest variety: the same seed = a fair puzzle to master, a new seed = fresh. A short code that can be shared (copy text, no server) lets friends race the same board offline. Pop, Dash and Deepdelve show seeds; Jam, Bugs, Angler and Stalk hide theirs.
5. Date-seeded "today's board" is popular, but it becomes a daily habit trap once a counter or reward is tied to it. If we add one: no counter, no reward for playing on consecutive days, and old dates stay playable.
6. One-button / one-thumb: all input should resolve to press, hold and release on one large target. Add an assist option (slower speed, wider timing windows, auto-aim) and never label it as "easy mode".
7. Remapping alone is not access. Also needed: shape + colour coding (Jam lanes do this), haptics that are opt-in (`navigator.vibrate` where it exists, off by default), and no information carried only by sound.
8. A shared result screen is the main source of drift across games: today each game builds its own panel. One pure view model (result, PB delta, next goal, medals, seed, Play again first) plus the m08 art would make all 10 feel like one product.
9. Restart must stay under 1 s, and the result panel must lead with the result and the Play again button. A QA gate should measure that on every page.
10. Ghosts are a learning aid ("where did my best run jump?"). Store the inputs, not video: Dash already does this, and `shared/mm-ghost.js` (4 Hz path, 3 KB or less) fits Deepdelve dives and Bug Safari routes.
11. Genres not yet covered in the hub: logic puzzles with one solution (block-push, picross), aim-and-release physics (mini golf), timing stacks, light order assembly (cooking), drawing / connect paths. All five run well one-thumb in a browser and can be seeded.

## B. Per game, ranked ideas (files are under `game/`)
12. **Campfire Jam** (1) Section practice: loop any 8 bars at 75 / 90 / 100% speed, PB per section. M, low risk, `games/jam/jam.js`, `shared/mm-jam.js`.
13. Jam (2) One-lane assist: fold four lanes into one or two tap zones for one thumb, scored on its own board so the PB stays fair. S, risk: chart density feels busy, so thin the notes in assist mode.
14. Jam (3) Wire m01 lane note glyphs (circle, diamond, triangle, square) over the existing shapes, and add a crowd that grows with the combo. S, art-gated, `games/jam/*`.
15. Jam (4) Show the chart seed and add "replay this practice chart". S, low risk.
16. **Angler** (1) Bite cue access: a big ring flash plus opt-in haptic, and a cue that never relies on sound alone. S, low risk, `games/angler/angler.js`, `games/angler/angler.css`.
17. Angler (2) Fish shadows before the bite (size tells the class), so a cast becomes a choice: keep or wait. M, risk: `shared-mm-angler-golden` must not change, so keep it page-side.
18. Angler (3) Honest journal hints for fish you have not caught ("found at the river, at night"). S, `games/angler/*`, read-only use of `shared/mm-angler.js`.
19. Angler (4) Wire m02 fish strips into the reel and the journal (24 species, 72 files). M, art-gated.
20. **Stalk Market** (1) Pattern guess: on day 3 of a practice week, pick which pattern you think it is, then see the answer at the end. This teaches the real model. S, low risk, `games/stalk/stalk.js`.
21. Stalk (2) A shareable practice-week code (seed), plus "replay this week". S. Risk: the game is close to gambling in feel, so keep the bells-only wording and the shown odds equal to the model odds.
22. Stalk (3) Wire m04: turnips, a stall, a seller and mood icons with distinct shapes. S, art-gated.
23. **Deepdelve** (1) Dive ghost: a faint path of your best dive on the same seed, drawn with `MMGhost`. M, risk: perf on low tier, so draw it at 10 Hz and turn it off in `lowGfx`.
24. Deepdelve (2) A clear bank: a "surface now = x score" line on the HUD, so the push-your-luck choice is easy to read. S, `games/deepdelve/deepdelve.js`, `dd-run.js`.
25. Deepdelve (3) Wire m05 faces, ores and pickaxes as nearest-filtered textures. M, art-gated, risk: texture memory on phones.
26. **Bug Safari** (1) Species behaviours: flutter, dart, hop, burrow. Each one needs a different approach, so a run becomes a puzzle, not a hunt for the closest bug. M, `games/festival/bugs.js`, `shared/mm-bugs.js`.
27. Bugs (2) Tap assist: tap near a bug and the swing goes to the nearest bug inside a small radius. Off by default and shown in the summary. S, low risk.
28. Bugs (3) Silhouette journal hints plus the seed shown at the end and "replay seed". S. (4) Wire m03 bug strips, the net and the arena thumbnails. M, art-gated.
29. **Lantern Camp** (hub, not a game) (1) Add `MMSideAccess` (lantern.js has none) plus 44 px / 12 px checks. S, `games/mad-maze/lantern.*`. (2) "Next calm goal" cards from `shared/mm-calm-goals.js`. S.
30. **Pixel Pop** (1) Next-tile preview (the next two spawns), so chains can be planned. S, low risk, `games/pop/pop.js`.
31. Pop (2) Calm mode: no timer, PB by tile level only, its own board. S. (3) Copy-a-seed code. S. (4) Wire m07 tile glyphs (distinct shape AND colour). S, art-gated.
32. **Lantern Dash** (1) Assist: 80% speed plus a longer jump buffer and coyote time, on its own PB board. S, `games/dash/dash.js`.
33. Dash (2) Ghost code: export the best run's inputs + seed as a short text code; importing it races that ghost (local only, validated, capped size). M, risk: input validation, so use `textContent` only and reject any code over 2 KB.
34. Dash (3) Practice checkpoints every 200 m, which do not count for the PB. S. (4) Wire m07 runner, rocks and parallax. M, art-gated.
35. **Arcade #9 and #10** (being built now, names to confirm) (1) Adopt the shared result kit (finding 8) and their own `pixeltown-medals-<id>-v1` key from day one. S. (2) Seeds shown and replayable. S. (3) An assist option and the 44 px / 12 px / reduced-motion rules. S.
36. Arcade #9/#10 (4) Add them to PLACES, the Hub medals strip and the smoke journey in one registry slice, so `mm-nav.js` and `hub/*` are touched once. S, serial.
37. **New genres** (designs in NEXT-SLICES-5 section 3): Pebble Putt (mini golf, drag and release), Crate Cove (block-push logic, seeded, solver-checked), Hay Stack (timing stack), Campfire Kitchen (order assembly with no fail timer), Garden Weave (picross).
38. Ranking across games: shared result kit > access assists (Jam, Bugs, Dash, Angler) > seeds for every game > ghosts (Deepdelve, Dash code) > species / fish behaviours > new genres > art wiring (art-gated, ships as it arrives).
39. Things we should NOT do: daily-board counters, "come back tomorrow" text, chest or crate rewards with random contents, timers outside a round, comparing players' scores by default.
40. Measuring it: no analytics leave the device. Use the bots: restart time, tap-target size, text size, time to the first success under 30 s, and a PB-delta line on every result screen (gate QS4).

Sources (generic, direction only): [Game feel (Wikipedia)](https://www.wikipedia.org/wiki/Game_feel), [Making games juicy (abagames)](https://abagames.github.io/joys-of-small-game-development-en/make_game_juicy.html),
[Squeezing more juice (GameAnalytics)](https://www.gameanalytics.com/blog/squeezing-more-juice-out-of-your-game-design), [Game Accessibility Guidelines](https://gameaccessibilityguidelines.com/?p=3181),
[Xbox Accessibility Guideline 107: Input](https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/107), [One finger to rule them all](https://bitbrain.github.io/2019/05/10/one-finger-to-rule-them-all.html),
[How we design daily puzzles (enclose.horse)](https://enclose.horse/blog/how-we-design-daily-puzzles), [Daily puzzle with no backend](https://dev.to/solsticioapp/a-daily-logic-puzzle-with-no-backend-at-all-1ef6),
[Dark patterns in mobile games (arXiv 2412.05039)](https://www.arxiv.org/abs/2412.05039), [Beyond streaks and nudges (UX Collective)](https://uxdesign.cc/beyond-streaks-and-nudges-ethical-gamification-ai-design-1c4f6e8ef2cc), [Casual game (Wikipedia)](https://www.wikipedia.org/wiki/Casual_game).
