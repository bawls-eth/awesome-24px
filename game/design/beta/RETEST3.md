# Beta retest round 3 (2026-11-24): independent gameplay verification of everything shipped since round 2

Tip under test: claude/animal-crossing-game-7z3roh (ci-status 559/559). Same rules as BETA-BRIEF.md: own port, blockDb / offlineStub on every context (Town: "Play offline"; never touch the live Firebase, never chat), every command through /tmp/bt.sh, real input like a player, docs only, never fix code.
Per item answer VERIFIED / NOT VERIFIED / REGRESSED with a screenshot, written to design/beta/<id>-r3.json (same format as round 1/2 + "status") and <id>-r3.md (summary, what you played and for how long, readiness 1-10, honest coverage gaps). Then 15+ minutes of free play in your area looking for new problems (P0/P1/P2 first).
Do NOT claim a fix verified from reading code or from the dev's test: only from your own play.

| Tester | Area | Verify (shipped since round 2) |
|---|---|---|
| b01 | Realm combat | Shore XP fade above Lv 4 + 'better prey' toast; ID-14 hit pause on big hits (reduce motion off); telegraph longer on strong attacks; ID-06 Assist (Settings: damage taken, aim help; 'Assisted' tag on fall card / best wave); death dissolve; boss bar hidden on fall card |
| b02 | Loot / gear | reforge cost now 25x(t-6) shards and Forge line 'N more kills of dust'; Godlands elite drops; first-kill bag floor (first world boss of a zone); double-tap confirm guard |
| b03 | Dungeons / Trial | dungeon pad off the room on phone portrait; Trial of Six full run (fight times, damage, bolt readability); floor choice card |
| b04 | Realm world / Nexus | danger meter (Comfortable / Tough / Too hot, text + icon, phone one-row), quest board level hints and zone-scaled rewards, Notebook (N) panel (first kills write pages, Esc order, focus), Nexus life (torches/banners/NPCs), inner corners at snow/lava/dry-grass/gravel seams |
| b05 | Isles taming | bond hearts in the stable, Oakback golden apples, wanderers turning along walls, first screen not empty, creature hit flash silhouette, death dissolve |
| b06 | Isles exploration | tundra / jungle ground detail + softer seams, meadow field detail, first 10 minutes on each island (no >45 s without a reward event), mars lift-off, 195 px layout |
| b07 | Town | Town daily bonus 40 stars, errand chain with Mocha (parcel -> Nexus vendor -> trophy -> Mocha -> Realm lantern), world label pixel icons, building finish + contact shadows, label collisions (turnip, deal line, Professor Byte), door names, Founder's Statue, offline HUD, one-row bag bar, cave open/retry |
| b08 | New player | passive start survives 2 minutes, Shore pacing, first goal on screen, touch wording, Home footer, Daily gift, Hub Backup, 9/10 target: what still blocks it |
| b09 | Arcade A | Pop / Dash / Stack / Echo: result card, 195 px, touch wording, Tab order |
| b10 | Arcade B | Angler (tournament across midnight), Jam touch text + lanes at 195 px, Bug Safari cards, Lantern Shuffle gating |
| b11 | Stalk / Deepdelve / Lantern | Deepdelve taps no stalls, seed ghost bank line + path trail, forge/notebook backup entries, Lantern restore |
| b12 | Graphics | every area at 1280x720 + 390x844: tundra/jungle ground, trees, Town buildings, Nexus, Hub pixel icons, creature outlines; list the 5 worst remaining visuals |
| b13 | Performance | Town fps (4x CPU), Realm rotate, Deepdelve taps, 10-minute Realm soak with crowd, listener/memory growth, per-frame cost |
| b14 | Saves / multiplayer | one Backup (all keys + settings incl. mm-assist, notebook, errands), restore old files, two tabs (errand, zk, notebook, bestWaveA), junk/blocked storage; no live DB |
| b15 | Edge cases | 195x422, 160x284, 150%/200% zoom, landscape phones, keyboard-only, reduce motion, blocked storage on every page |
