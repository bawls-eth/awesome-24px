# Beta re-test scripts (round 2) for the 15 testers

Run on the integrated branch the coordinator merges (QA's scratch build: `dev-qa-integ` = dev-qa + dev-perf + dev-gameplay + dev-world).
Same rules as BETA-BRIEF: your own port, `blockDb(ctx)` on every context or the Town OFFLINE stub ("Play offline", helpers
`offlineStub` / `joinOffline` / `twoTabs` / `throwingStorage` in game/tests/helpers.js), every command through `/tmp/bt.sh`, docs only, never chat.
Answer per item: FIXED / NOT FIXED / REGRESSED + one screenshot, in `design/beta/<id>-r2.json` (same format as round 1). Then poke around
the same area for 10 minutes for regressions. Your own round-1 steps are in `design/beta/<id>.json`: replay them exactly first.

Game root `http://localhost:<port>/game/`. Realm `games/mad-maze/index.html?mode=world` (add `&test=1` for hooks), Lantern
`games/mad-maze/lantern.html`, Isles `games/isles/index.html?test=1`, Hub `hub/index.html`, Town `index.html` (Play offline).

| Tester | Re-test (QA status when this was written) | Viewport | Expected now | Extra sweep (10 min) |
|---|---|---|---|---|
| b01 Realm combat | G-06 quest zone names, G-07 altar wakes by zone, G-08 provoked off-screen shooter (all verified) | 1280x720 + 390x844 | quests say Shore / Midlands / Highlands / Godlands; a Midlands altar never wakes for a hero on Shore; a whirler you hit off-screen fires or closes in within 2 s | fight in each zone, die, boss wake distances |
| b02 Loot / gear | G-02 Combine vs Equip, G-03 Sell guard (backpack + Nexus stall), G-04 full pack (verified) | 1280x720 + 390x844 | Equip clickable with 3+ copies; dblclick Sell sells one; equipped / best-tier Sell asks "Sure?"; full pack leaves a T12 on the ground with "Backpack full" | fill, combine, equip, sell, forge, vendor, phone landscape |
| b03 Dungeons / Trial | G-23 Enter mid Trial, G-24 door corner-slip / Try again, G-25 ?floor gate, W-16 dungeon HUD (verified) | 1280x720 + 390x844 | Enter fires during a Trial fight, never opens the Nexus; R on the fall summary restarts the same seed; ?floor=3 on a fresh save starts floor 1 | 3 dungeon seeds to the boss; one Trial to a fall |
| b04 Realm world / Nexus | G-06, G-07, G-12 Nexus Esc, W-03 terrain, W-04 Nexus view (verified) | both | Esc closes the quest board first, then the Nexus; no void bands at plaza corners; phone plaza >= 55% of the height | all four zone borders, every Nexus NPC on phone |
| b05 Isles taming | G-20 Ride choice, G-21 party swap, G-22 companions spare the tame target (verified); G-26 economy (not landed yet) | 1280x720 + 390x844 | Stable list: Ride / Join party / Rest per tame, persists after reload; soothed creature never loses HP to companions | tame 4, swap party, ride 3 mounts, craft 2 saddles, reload |
| b06 Isles exploration | G-22 weary boss grace, W-12 hero facing (verified); W-17, W-18 (art asks / not landed) | both | weary boss survives held fire; hero turns to its walk direction | each biome 5 min, one boss tame attempt |
| b07 Town | G-12 Esc closes overlays, G-13 beachcombing first, W-07 emote wheel / More rows (verified); W-06, O-01 (open / owner) | 390x844 + 1280x720 | Esc closes Journal / Map / Today / Achievements; standing on a shell picks it up instead of casting | every overlay with Esc, build mode on phone, fishing + beachcombing |
| b08 New player | G-01 Daily gift on a fresh device (verified); G-14 one first move, G-15 tutorial first minute (G-15 verified, G-14 check) | 390x844 | Claim works with empty storage ("Days claimed: 1", shards paid once); no event countdown in the first minute of the coach | fresh profile Home -> first game -> back, phone |
| b09 Arcade A | G-17 result card guard (check), W-09 Pop / Stack layout, W-10 Echo labels (verified) | 390x844 | Pop 6-digit score on one line; Echo labels never overprinted | Pop / Dash / Stack / Echo 3 rounds each, mash the result card |
| b10 Arcade B | W-08 Angler at 150% / landscape, W-09 Jam pads, W-11 Bug Safari, G-16 reel can end (verified) | 260x563 (150%), 844x390, 390x844 | Angler scene >= 200x300 at 150%; reel at zero for 6 s ends "It swam off" | Angler at 150% + landscape, Jam assist, Bug Safari phone |
| b11 Stalk / Deepdelve / Lantern | G-05 Rekindle only from a Keepsake (verified), S-05 Deepdelve with blocked storage (verified); G-10, G-11 (check) | 390x844 | no Rekindle on living cards; Keepsake rekindles once; Deepdelve boots with the "cannot be saved" note | Rekindle a Keepsake, hardcore hero, 100 place / mine cycles |
| b12 Graphics | W-01 / W-02 pop-in, W-03 terrain, W-04 Nexus, W-12 Isles hero, W-14 loot bags (verified); W-06 (open) | both | no empty hero frame on pick; boss sprite on the first frame | screenshot pass of every area at both viewports |
| b13 Performance | S-06 JSON once per page (verified: 1235 -> 1077 requests, 225 -> 67 JSON), S-11 Deepdelve rotate (verified); S-07 (profile only), S-08, S-09, S-12 (open) | 390x844 | assets/*.json each requested once on Realm cold start | cold-start request counts, 10 min soaks ALONE (note the load average) |
| b14 Saves / multiplayer | S-01 Town Restore, S-02 two Town tabs, S-03 backup skips a bad key, S-04 co-op seats merge (verified); S-13 (owner O-04) | 1280x720 | junk restore changes nothing; a Lantern bundle restores the town save; two tabs keep both tabs' resources; a Lantern restore survives an open Town tab | two and three tabs in every game, restore of old / new / corrupt files, co-op seats |
| b15 Edge cases | S-05, S-10 sweep (Realm boot under blocked storage still OPEN: WG patch pending), W-05 Realm HUD at 320 / 360 (verified), W-09 Hub at 200% (verified), G-12 | 320x568, 360x640, 195 px Hub | Leave clear of XP at 320; Hub one column at 195 px | storage blocked on all 12 pages, zoom 150 / 200%, keyboard only |

QA replays already scripted (run them first on your port to confirm the build): `beta-retest-b02`, `beta-retest-b08`, `beta-retest-b14`,
`beta-retest-b15` (game/tests).
