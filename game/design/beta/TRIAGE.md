# Beta triage (Lead Architect) - 2026-11-23

Base: `claude/animal-crossing-game-7z3roh` @ f23cfbf. Docs only. Per-lane detail (fix approach, acceptance asserts, risk, dependencies) lives in `assignments/<lane>.md`; this file is the index, the verification record, the ownership map, the owner decisions and the work order.

## 1. Intake

| Reports in | all 15: b01-b15. b02, b03, b05, b06 were not yet merged into the base when triage started; they were read from branches `beta-b02` (590444e), `beta-b03` (f7a7067), `beta-b05` (b0b2a85), `beta-b06` (74219b7). See section 9. |
|---|---|
| Raw findings | 194 as rated by the testers: 3 P0, 15 P1, 76 P2, 100 P3 (first 11 reports: 145; b02 +15, b03 +14, b05 +11, b06 +9) |
| After dedupe + re-rating | 60 work items: 2 P0 (covering the 3 P0 findings), 15 P1 (one of them an owner decision), 33 P2, 10 P3 batches (about 75 small findings inside the batches) |

Coverage notes: b03 covered dungeons and the Trial of Six only on a few seeds; b05/b06 found the Isles party and mount systems largely unreachable, so anything behind them (mount abilities, 9 of 10 saddles) is still UNTESTED. The release gate (qa.md) keeps those areas "untested", not "green".

## 2. P0 / P1 verification (read in code by the lead)

| Item | Sources | Verdict | Evidence |
|---|---|---|---|
| S-01 Town Restore writes any JSON object as the town save | b14-03 | CONFIRMED IN CODE | `game/main.js:4354-4369` importSave: `JSON.parse`, object check only, then `localStorage.setItem(SAVE_KEY, ...)`. A `{format:'pixeltown-backup', v:2, keys:{}}` bundle passes. |
| S-02 Town tab is last-writer-wins on whole sub-objects (also undoes a Lantern Restore) | b14-01, b14-02 | CONFIRMED IN CODE | `game/main.js:157-163` writeSave = `{...loadSave(), ...partial}`; `main.js:2530` saveResources passes the whole in-memory `resources / crafted / caveInv`. No `storage` listener and no BroadcastChannel anywhere in main.js (grep). lantern.js:733 has a listener, the Town does not. |
| S-03 One corrupt key fails the whole backup | b14-04 | CONFIRMED IN CODE | `game/shared/mm-backup.js:172-181` plan(): `return fail('bad-value', ...)` inside the per-key loop; bundle() (:120) exports raw values unchecked. |
| S-04 Co-op seats overwrite `pixeltown-realm-v1` | b14-06 | CONFIRMED IN CODE | `game/games/mad-maze/realm-world.js:86-92` writeSave re-reads storage only for `finds`; discovery, position and everything else come from the seat's in-memory copy. Only reachable with `?party=local`. |
| S-05 Deepdelve hangs on "Loading the mine..." when storage throws | b15-01 | CONFIRMED IN CODE | `game/games/deepdelve/deepdelve.js:160` `RUNS.load(localStorage)` and :190/:192 evaluate the bare `localStorage` getter outside try/catch (:138 is inside a try and is fine). A SecurityError there aborts boot. |
| S-06 mm-art fetches the same JSON many times | b13-01 | CONFIRMED IN CODE | `game/shared/mm-art.js:143-149` fetchJson has no memo; images have `imageCache`, JSON does not. Callers loadAll/loadItems/loadBolts/loadFx/loadDungeonTiles each fetch INDEX.json and manifests again. |
| S-07 Town 9-12 fps at 4x CPU | b13-03 | NOT REPRODUCED BY READING (measurement) | b13's own A/B shows 0 remotes = 12 fps too, so the crowd is not the main cost: the base Town frame is. Needs a profile before any fix. Per-remote Text objects at addRemotePlayer (~5686) are real but secondary. |
| G-01 New player cannot claim the Daily gift | b08-01 | CONFIRMED IN CODE | `game/hub/gift.js:21-24` payShards returns false when `pixeltown-save-v1` is absent; claim() (:63-66) rolls back with the "town save" message. |
| G-02 Combine button sits on Equip | b02-01 | PARTLY CONFIRMED | `game/realm-ui.css:94-95` pins `button.eq` to column 2 rows 1-2 and `button.dc` to column 3; a third button has no explicit cell and auto-places into an occupied one. I did not find the Combine button's class by grep in the time box: the engineer confirms the selector first. |
| G-03 Sell: double click sells two items, no confirm for equipped / T12 | b02-02, b02-03 | CONFIRMED IN CODE | `game/realm.js:4199-4207` discard(): no guard, unequips and sells; handler `games/mad-maze/mad-maze.js:119-123` is a plain delegated click, list re-renders under the pointer. |
| G-04 Full backpack auto-sells any drop including T12 | b02-04 | CONFIRMED IN CODE | `game/realm.js:3458-3466` collectItem: `if (sv.items.length >= RM_BACKPACK)` sells at tiered value with no tier / level / best-in-slot check; only a float text. |
| G-05 Rekindle clones living heroes | b11-01 | CONFIRMED IN CODE | `game/shared/mm-profile.js:180-194` rekindle() finds the hero in the living roster, pushes a new one, never consumes anything; `lantern.js:526-529` renders the button on every card. Re-rated P2 -> P1 (free level-10 heroes, roster fills to 12). |
| G-20 Isles: only the first rideable tame can be ridden | b05-01 | CONFIRMED IN CODE | `game/games/isles/isles.js:986-991` refreshMount picks `tames.mount`, else the first rideable; the only `TAMES.setMount` calls are :978 (when no mount yet) and :1005 (re-store the same pick). No UI path chooses another. |
| G-21 Isles: party fixed to the first two tames | b05-02 | CONFIRMED IN CODE | `TAMES.setParty` is called only at `isles.js:975` (adoptTame, while the party has room). Party tab (:2608-2620) is plain text. |
| G-22 Isles: attack-mode companions hit the creature being soothed | b05-03 | CONFIRMED IN CODE | `isles.js:905, 935` `compCtx.enemies = creatures` (the whole list, soothe target included); `shared/mm-companion.js:171` nearestEnemy has no "being tamed" exclusion. |
| G-23 Enter opens the Nexus during a Trial of Six fight | b03-01 | CONFIRMED IN CODE | `game/games/mad-maze/realm-world.js:1987` Enter -> nexusOpen() checks nxNear / prompt / site / arena state, never the rush or a live boss. |
| O-01 Trademarked door names + third-party links | b07-06 | CONFIRMED IN CODE | `game/main.js:1136-1141` PORTALS: 'GTA 3' (quenq.com), 'NFS Underground 2' (nfsu2.xyz), 'Kart Racing' (olivers.tools), 'Vice City' (quenq.com), same-tab navigation. Owner decision, section 6. |

Re-rating notes: b10-01 (Angler unplayable at 150% text, portrait) P1 -> P2: one game, one accessibility setting, workaround exists; it stays first in the World+Graphics P2 queue. b11-01 P2 -> P1 (above). b07-06 P2 -> P1 owner decision (legal / safety, not a code defect). b02-03 folded into G-03. b13-04 (Realm soak) stays P2 "unproven": the tester's own caveat says machine load tripled during the run.

## 3. Dedupe map (tester findings -> work item)

| Cluster | Findings | Item |
|---|---|---|
| Daily quest zone names / goal line | b01-01, b04-04 | G-06 |
| Boss wakes in the wrong zone, no danger gate | b01-02, b04-13 | G-07 |
| Town two tabs / Lantern Restore undone | b14-01, b14-02 | S-02 |
| Storage throws | b15-01, b15-02 | S-05 (Deepdelve hang), S-10 (sweep) |
| Sell / buy / forge without guard | b02-02, b02-03, b02-12, b02-14 | G-03 |
| Full backpack | b02-04, b02-05 | G-04 |
| Esc / Back does not close | b07-01, b04-08, b15-13 | G-12 |
| First move unclear | b08-02, b08-03, b08-05, b08-09, b08-10 | G-14 |
| Result cards | b09-02, b08-07 | G-17 (logic); b09-08, b09-09 -> W-09 (layout) |
| Terrain look | b04-01, b04-02, b04-03, b12-03, b12-04 | W-03 |
| Nexus | b04-05, b04-06, b04-07, b04-10, b04-14, b02-13, b02-15, b12-08 (+ bugbash/realm.md open item) | W-04 |
| Realm phone HUD | b01-06, b01-07, b02-07, b02-09, b08-12, b15-04, b15-11 | W-05 |
| Town scale / statue | b07-05, b07-12, b12-05, b12-06 | W-06 |
| Town HUD overlaps | b07-02, b07-03, b07-07, b07-08, b08-06, b12-07, b14-09, b15-05, b15-06 | W-07 |
| Angler layout | b10-01, b10-02, b10-16, b12-13 | W-08 |
| Echo labels | b09-03, b12-12 | W-10 |
| Deepdelve craft labels | b11-07, b15-12 | G-18 |
| Stalk compass overlap | b11-06, b12-17 | W-15 |
| Stalk neighbour price | b11-04, b11-13 | O-07 (balance, owner) |
| Hero level shown as Lv 1 | b11-10 (known open) | G-18 |
| Known-open confirmations (no new item) | b04-07, b12-14 (R08 boss template, art queue), b12-15 (phone dungeon letterbox, PR4 #26), b12-16 (b12r props staged) | tracked in W-04 / W-14 |

## 4. Work items (index)

Severity is the lead's re-rating. Lanes: GP = Gameplay, WG = World+Graphics, PS = Performance+Systems, QA. Detail per item is in the lane file.

### P0
| id | title | lane | files | sources |
|---|---|---|---|---|
| S-01 | Town Restore validates the file (rejects / routes a Lantern bundle, cleans a town save) | PS | main.js:4354-4369, shared/mm-backup.js (reuse plan) | b14-03 |
| S-02 | Town cross-tab safety: storage listener + delta writes, Restore survives an open Town tab | PS | main.js:157-163, :2530, incrementStat, achievements writers | b14-01, b14-02 |

### P1
| id | title | lane | files | sources |
|---|---|---|---|---|
| S-03 | Backup: skip and report a bad key instead of failing the file; warn at export | PS | shared/mm-backup.js:120, :172-181; lantern.js restore confirm text | b14-04 |
| S-04 | Co-op seats merge the realm save (discovery union, per-seat position) | PS | games/mad-maze/realm-world.js:86-92, :1172 | b14-06 |
| S-05 | Deepdelve boots when localStorage throws | PS | games/deepdelve/deepdelve.js:138, 160, 190, 192 | b15-01 |
| S-06 | mm-art fetchJson in-flight + result cache | PS | shared/mm-art.js:143-149 | b13-01 |
| S-07 | Town frame cost at 4x CPU: profile, then fix the top cost; pooled name labels for remotes | PS | main.js:1801, :4847, :5686 | b13-03 |
| G-01 | Daily gift claimable with no town save | GP | hub/gift.js:21-24, 63-66 | b08-01 |
| G-02 | Backpack: Combine no longer covers Equip | GP | realm-ui.css:91-96, realm.js:4604 | b02-01 |
| G-03 | Sell / Buy / Reforge guards (arm delay after re-render, confirm for equipped, soulbound, relic, best tier) | GP | realm.js:4199, 4313-4366, 4388, 4604 | b02-02, b02-03, b02-12, b02-14 |
| G-04 | Full backpack never auto-sells an upgrade; clear "Backpack full" feedback | GP | realm.js:3458-3466 | b02-04, b02-05 |
| G-05 | Rekindle cannot clone living heroes | GP | shared/mm-profile.js:180-194, games/mad-maze/lantern.js:526-529 | b11-01 |
| G-20 | Isles: choose which tame to ride (Stable list, Ride button) | GP | games/isles/isles.js:978, 986-1005, party tab 2608-2620 | b05-01 |
| G-21 | Isles: Stable UI to swap party members (and release / rename if TAMES supports it) | GP | games/isles/isles.js:974-976, 2608-2620 | b05-02 |
| G-22 | Isles: companions never attack the soothe / tame target; weary boss cannot be killed by held fire | GP | games/isles/isles.js:905, 935, 1203; shared/mm-companion.js:83-90, 171; shared/mm-isle-boss.js:223 | b05-03, b06-04 |
| G-23 | Enter does not open the Nexus during a Trial of Six or boss fight | GP | games/mad-maze/realm-world.js:1987, 1995 | b03-01 |
| O-01 | Arcade door names and third-party links | OWNER, then GP | main.js:1136-1141 | b07-06 |

### P2
| id | title | lane | files | sources |
|---|---|---|---|---|
| G-06 | Quest zone names from MMZones; goal line respects hero level | GP | shared/mm-quests.js:8, realm-world.js:494-505 | b01-01, b04-04 |
| G-07 | Boss altar wakes only for a hero inside the boss's zone | GP | realm-world.js:870-876 | b01-02, b04-13 |
| G-08 | Off-screen farming: an enemy hit while holding fire is provoked | GP | realm.js:2959-2968, 2984 | b01-03 |
| G-10 | Deepdelve dive score ignores player-placed blocks | GP | games/deepdelve/deepdelve.js:91, 459; dd-run.js | b11-02 |
| G-12 | Esc / P close Town overlays; Nexus Esc closes the dialog first; quest board Close | GP | main.js:2322 (+ key listener), realm-world.js nexus keydown | b07-01, b04-08 |
| G-13 | Beachcombing wins over fishing / wildlife when standing on a beach item | GP | main.js:2534-2700 | b07-11 |
| G-14 | One first move: PLAY, the Next line and the map start node agree | GP | hub/home.js:117, hub/calm.js, hub/hub.js, index.html pill text | b08-02, b08-03, b08-05 |
| G-15 | Realm tutorial: no world events until the coach is done; bag step guaranteed; fall panel has Try again | GP | games/mad-maze/realm-tutorial.js, realm-world.js event timer | b08-04 |
| G-16 | Angler: a reel left at zero ends ("it swam off", no penalty) | GP | shared/mm-angler.js:254-266, games/angler/angler.js:411-432 | b10-04 |
| G-17 | Shared result card click guard (kit default) + Stack Menu button | GP | shared/mm-minikit.js:177, games/pop/pop.js:279 | b09-02, b08-07 |
| G-24 | Dungeon: door corner-slip; R / Try again on the fall summary; dungeon wording on the fall banner | GP | games/mad-maze/dungeon.js:745, 863; realm.js player collision, death banner | b03-02, b03-13, b03-14 |
| G-25 | Deep runs: ?floor= needs the previous floor cleared on this save | GP (dungeon.js:793) + WG request (mad-maze.js:132 passes the raw value) | dungeon.js:793, mad-maze.js:132 | b03-07 |
| G-26 | Isles economy: glint timers and pouch persist across reload; craft double-tap guard; full-pack gather keeps the spot | GP | games/isles/isles.js:1838-1854, 2060, 2078, 2149; shared/mm-isle-pouch.js | b05-04, b05-06, b05-07 |
| W-16 | Dungeon HUD: boss bar vs minimap / mutator chip, ability bar over the S door, toast over the boss bar | WG | games/mad-maze/mad-maze.css; realm.js:4761 toast position (css class; request to GP if JS is needed) | b03-03, b03-04, b03-05, b03-06, b03-08 |
| W-17 | Isles creature and boss art: tundra / mars species and Frost Dragon / Red Titan are code-drawn recolours (art ask to Codex + strip wiring) | WG | games/isles/isles.js STRIPS preload, shared/mm-creature-draw.js, mm-creature-strips.js | b06-01, b06-02, b06-03 |
| W-01 | Hero pop-in: no orb / empty frame while the class strip loads | WG | games/mad-maze/mad-maze.js:270-300 | b12-01 |
| W-02 | Boss pop-in: preload boss art when within range of a boss site | WG | games/mad-maze/mad-maze.js:257-262 | b12-02 |
| W-03 | Terrain look: shade patches, ghost outlines, snow holes, edge style, Godlands identity | WG | realm-world.js:18, :305, chunk bake edge pass | b04-01, b04-02, b04-03, b12-03, b12-04 |
| W-04 | Nexus: camera clamp, phone layout, stall vs stick, labels, 8-bit frame | WG | realm-world.js Nexus section (NX_VW / NX_VH, nxCam, stall DOM), mad-maze.css | b04-05, b04-06, b04-07, b04-10, b02-13, b02-15, b12-08 |
| W-05 | Realm phone HUD overlaps (Leave vs XP at 320/360, goal line, toasts over backpack) | WG | realm-ui.css, realm-8bit.css | b15-11, b15-04, b01-06, b02-07, b02-09 |
| W-06 | Town scale: statue, NPCs, wildlife vs hero; Top Scores board legible | WG | main.js:497, :7750-7752, shared/mm-pixelize.js | b07-05, b07-12, b12-05, b12-06 |
| W-07 | Town HUD overlaps: emote wheel vs quick chat, build banner, labels, 44 px rows | WG | style.css, index.html | b07-02, b07-03, b07-07, b07-08, b12-07, b08-06 |
| W-08 | Angler layout at 150% text, landscape and desktop | WG | games/angler/angler.css | b10-01, b10-02, b10-16, b12-13 |
| W-09 | Arcade layout: Pop score wrap, Jam pads at 150%, Dash result below the fold, Hub at 200% | WG | pop.css:13, jam.css, dash.css, stack.css, hub/hub.css | b09-01, b10-03, b09-08, b09-09, b15-03 |
| W-10 | Echo Garden: float text and labels do not overlap | WG | games/echo/echo.js:142 (+ css) | b09-03, b12-12 |
| W-11 | Bug Safari: bugs readable on a phone | WG | games/festival/bugs.js, bugs.css | b10-11 |
| W-12 | Isles hero faces its walk direction; jungle dark block | WG | games/isles/isles.js | b12-09 |
| S-08 | three.min.js loads only when the cave opens | PS | index.html:539, underground.js | b13-02 |
| S-09 | Deepdelve frame spikes (first frame, per-edit relight) | PS | deepdelve.js:518, 574-607, 751 | b13-05 |
| S-10 | Storage-throws sweep on every page boot | PS (+ 1-line hand-offs) | shared/mm-*.js boot reads, page boots | b15-02 |
| S-11 | Realm soak / listener growth / rotate storm: measure alone, report, fix only if proven | PS | realm.js, realm-world.js (read only until proven) | b13-04, b13-07, b13-08 |
| S-12 | Isles start-up cost | PS (after WG isles slot) | games/isles/isles.js | b13-06 |
| S-13 | Town Backup = the full bundle (same file as the Lantern) | PS, needs O-04 | main.js:4340, index.html:116 | b14-05, b14-13 |

### P3 batches (do after every P0-P2 of the lane is merged)
| id | contents | lane |
|---|---|---|
| G-09 | Survivor's cache needs kills or time alive (b01-04) | GP |
| G-11 | Stalk: clock moved back cannot reopen buying (b11-03) | GP |
| G-18 | Small logic: Jam Hard lock in startSong (b10-09), Stalk practice best stores a loss (b11-05), stale Stalk message (b11-11), Pop preview over-promise (b09-04), Dash ghost per course (b09-07), Blacksmith opens the Forge (b04-09), second invite queue (b14-11), blur clears sticks (b01-08), Lantern Start-run reason (b11-09), Jam stale HUD (b10-05), Deepdelve craft labels (b11-07, b15-12), hero level in Realm HUD (b11-10), Stats tab deltas (b02-08), M/Tab opens the map (b04-11), Isles Back returns to town (b07-14), mm-nav Back closes the Menu (b15-13) | GP |
| G-19 | AI polish: leash / return home (b01-05), separation (b01-09), off-class T12 drop (b02-11), gear list sort (b02-10), solid big props (b04-12), stuck-in-water once (b01-10) | GP |
| W-13 | Joystick look: round knob, smaller footprint (b12-10) | WG |
| W-14 | Loot bag tiers visible (b02-06), boss bar vs sprite (b01-07), Nexus hero sprite (b04-14), emoji vs pixel glyphs (b12-11), Jam result cards (b10-06, b10-07), Bug Safari summary / menu (b10-10, b10-12), Angler fish art (b10-14), Stack float overlap (b09-05), wording leftovers (b07-04, b07-09, b07-10, b07-13), player list overflow (b14-09, b14-10), focus ring (b15-09), Isles how-to close (b15-14), Deepdelve hotbar / depth (b11-08, b11-12), Town landscape (b15-05, b15-06) | WG |
| W-15 | Stalk compass over heading (b11-06, b12-17) | WG |
| W-18 | Isles HUD polish: how-to card placement / close (b05-10, b06-09, b15-14), name truncation (b06-07), rocket scene (b06-08), log text gap (b05-09), flat start areas (b06-06), feed toasts (b05-08) | WG |
| G-27 | Trial of Six polish: arena clear of world mobs (b03-09), Trial result on fall (b03-10), gate art / route (b03-11), boss HP by floor (b03-12, balance, O-06) | GP |
| S-14 | favicon 404 (b13-09), asset versioning (b13-11) | PS |
| -- | Balance notes, no code this cycle: b09-06, b09-10, b10-08, b10-13, b10-15, b08-08, b08-11, b08-12, b15-10, b05-05 (Oakback needs 12 golden apples, 1 glint), b06-05 (creature density), b05-11 (getImageData warnings, see S-12) | backlog / owner O-06 |

## 5. File ownership map

One writer per file at a time. "Serial" files have a fixed order; the next lane starts only after the previous lane's branch for that file is merged by the lead and it has rebased. Branch names: `fix/gp-*`, `fix/wg-*`, `fix/ps-*`, `fix/qa-*`, all from `claude/animal-crossing-game-7z3roh`. Nobody edits `game/firebase-config.js` or `game/net.js`.

### Serial files (order = slot 1, slot 2, slot 3)
| File | Slot 1 | Slot 2 | Slot 3 | Why |
|---|---|---|---|---|
| game/main.js | PS (S-01, S-02; then S-07 after profile) | GP (G-12, G-13, O-01 rename if approved) | WG (W-06) | P0 first; regions do not overlap (150-170 / 4336-4372, 2312-2700 + 1136, 7750) but line numbers shift |
| game/index.html | PS (line 539 only, S-08) | GP (pill text only, G-14) | WG (W-07) | |
| game/games/mad-maze/realm-world.js | PS (S-04, lines 80-92 + savePos) | GP (G-06, G-07, G-12 Nexus Esc, G-15 timer) | WG (W-03, W-04; holds it longest) | |
| game/realm-ui.css | GP (G-02, backpack list block 85-100) | WG (W-05) | | P1 first |
| game/games/deepdelve/deepdelve.js | PS (S-05, then S-09) | GP (G-10) | | |
| game/shared/mm-art.js | PS (S-06) | WG (only if W-01 / W-02 need it) | | |
| game/games/mad-maze/lantern.js | GP (G-05) | PS (S-03 confirm text) | | |
| game/games/isles/isles.js | GP (G-20, G-21, G-22: three P1; then G-26) | WG (W-12, W-17, W-18) | PS (S-12) | three P1 logic bugs go first |
| game/games/mad-maze/mad-maze.js | WG (W-01, W-02) | WG applies the 1-line G-25 request (line 132) in the same slot | | single owner, request only |
| game/tests/test-tiers.json | each lane appends only its own entries at the end of the matching tier list; QA resolves order at integration | | | enforced by run-all-tiers |

### Single-owner files this cycle
| Owner | Files |
|---|---|
| Gameplay | game/realm.js, game/dungeon.js (and games/mad-maze/dungeon*.js), games/mad-maze/realm-tutorial.js, world-team.js, hub/gift.js, hub/home.js, hub/calm.js, hub/hub.js, shared/mm-quests.js, mm-profile.js, mm-nexus.js, mm-angler.js, mm-minikit.js, mm-nav.js, mm-stalk-market.js, mm-jam-songs.js, mm-bugs.js, mm-zones.js; all arcade `*.js` except echo, festival and angler.js: games/pop/pop.js, stack/stack.js, dash/dash.js, jam/jam.js, stalk/stalk.js, deepdelve/dd-run.js; games/angler/angler.js |
| World+Graphics | game/style.css, game/realm-8bit.css, games/mad-maze/mad-maze.js, mad-maze.css, realm-cave.css, lantern.css, shared/mm-pixelize.js, mm-overworld.js (draw helpers only: generator output is pinned by the golden test), mm-8bit.css/js, mm-pad*.js styles; every arcade `*.css` (pop, stack, dash, jam, stalk, angler, deepdelve, echo, festival) and hub/hub.css; whole dirs games/echo and games/festival; art wiring and assets/ |
| Performance+Systems | shared/mm-backup.js, mm-store.js, rng-store, mm-perf.js, mm-settings.js, game/underground.js, games/arcane-frontier/ (favicon only), hub/profile*.js |
| QA+Integration | game/tests/helpers.js, run-all*.js, existing tests (an engineer may change an existing test only when the fix changes the asserted behaviour, and names it in the hand-off), new `game/tests/beta-*.test.js` are written by the lane that owns the fix, design/beta/RETEST.md, BETA-BOARD.md tally |

Cross-lane needs go through the lane file's "Requests" section, not a direct edit: e.g. WG's joystick look (W-13) may need a class name from realm.js: ask Gameplay for a 1-line change.

## 6. OWNER decisions (not for engineers to decide)

| id | Question | Lead recommendation |
|---|---|---|
| O-01 | Arcade doors 'GTA 3', 'NFS Underground 2', 'Vice City' are trademarks and all four doors leave to third-party sites in the same tab (main.js:1136-1141). | Rename to neutral labels now ('City Drive', 'Night Racer', 'Kart Racing', 'Neon Coast'). Keep a link only if the destination is first-party; otherwise point the doors at our own arcade games or show "Coming soon". If a link stays: open in a new tab with rel=noopener and a "This leaves Pixeltown" confirm. Gameplay does the rename in its main.js slot once approved; features stay (doors remain). |
| O-02 | `firebase-rules.draft.json` rejects what real clients write (bugbash/netsafety.md P1-1) and walkie / presence hardening (b14-07, b14-08, b14-12) needs net.js, which engineers may not edit. | Do not deploy the draft. Owner approves a net.js change window or keeps these as known issues. |
| O-03 | Town night is never drawn (`NIGHT_WASH_VISIBLE = false`, main.js ~423, bugbash/town.md). | Keep off this cycle (Town is already 12 fps at 4x CPU, S-07); revisit after S-07 with a cheap single-rect wash. |
| O-04 | Two Backup buttons: the Town one saves only the town key (b14-05); settings are not in any backup (b14-13). | Town Backup exports the full MMBackup bundle; Town Restore accepts both the old town-only file and the bundle. Settings included except device-specific ones. Approve, then S-13. |
| O-05 | Rekindle intent (G-05): design text says "new hero of the same class at level min(10, floor(L/2))" but nothing limits it. | Rekindle only from a fallen hero's Keepsake (one use per Keepsake, additive flag); button removed from living cards. Engineers ship this default unless the owner says otherwise. |
| O-06 | Full-pack and death rules: is auto-sell wanted at all (G-04)? Should the Survivor's cache need effort (G-09)? Should the Angler reel be losable (G-16)? | Defaults in gameplay.md: upgrades stay on the ground, cache needs 3 kills or 60 s, reel ends with no penalty. |
| O-07 | Stalk neighbour price beats the stall every half day (b11-04, b11-13); device-clock exploit (G-11). | Cap the neighbour at stall price +15%; clock fix is safe to ship. |
| O-08 | `games/arcane-frontier/` is a half-committed public scaffold with 15 404s (b15-07). | Finish it or replace index.html with a "Coming soon" card that links Home (no feature removed: it is not linked anywhere). |
| O-09 | Large unreferenced images in the repo (b13-10); no service worker / offline reload (b15-08). | Backlog; owner picks. |
| O-10 | Town statue is labelled 'Mayor' with a monkey emoji and uses the old 'boredapes' sheet (b07-05): "original art only". | Replace with an original hero-statue sprite (Codex art ask) and a neutral label; WG wires it (W-06). |
| O-11 | Information architecture: Lantern Camp as its own destination, 9 arcade games on first run (b08-09). | Backlog, follows SIMPLIFY-PLAN. |

## 7. Work order, first 4 hours

Hour marks are from engineer start. P0 before anything else; a lane does not start a P2 while it holds an unmerged P0/P1.

| Time | Performance+Systems | Gameplay | World+Graphics | QA+Integration |
|---|---|---|---|---|
| 0:00-0:45 | S-01 (P0, main.js slot 1) | G-02 (realm-ui.css slot 1), G-01 | W-01, W-02 (mad-maze.js) | Baseline: smoke tier on the tip; write failing repro tests for S-01, S-02, G-01, G-03, G-04, G-05 from the tester steps |
| 0:45-1:30 | S-02 (P0, same main.js slot) | G-03, G-04 (realm.js); start G-22 (isles.js slot 1) | W-05 (after G-02 merges realm-ui.css), W-08 | Verify S-01; start RETEST.md scripts |
| 1:30-2:00 | S-05, S-06 (independent files); release main.js to GP | G-05 (mm-profile.js, lantern.js); G-20, G-21 (isles.js) | W-07 (style.css), W-09 | Verify S-02 with two real tabs; verify G-01, G-02 |
| 2:00-2:45 | S-04 (realm-world.js slot 1), S-03 | G-12, G-13 in main.js slot 2 (+ O-01 rename if approved) | W-10, W-11, W-12 | Verify G-03, G-04, G-05, S-05, S-06; smoke tier after each merge |
| 2:45-3:30 | S-08 (index.html line 539), S-07 profile | G-23 (P1) first, then G-06, G-07, G-15 in realm-world.js slot 2; G-08 | W-06 in main.js slot 3 (after GP releases) | Verify S-03, S-04; first full gate run on the integration branch |
| 3:30-4:00 | S-09 (deepdelve.js), then release it to GP | G-24, G-14, G-17; G-10 when deepdelve.js is free; release isles.js to WG | W-16; W-03, W-04 in realm-world.js slot 3; W-12 when isles.js is free | Gate decision for the 11:49 UTC merge; hand RETEST.md to the testers |

Merge freeze: no runtime commit lands between the 06:44 UTC stamp and the 06:49 UTC master merge (BETA-BOARD). All fixes target the next merge.

## 8. Definition of done (every item)

1. A new `game/tests/beta-<item-id>.test.js` (or an extended existing test) with at least 3 asserts taken from the lane file, registered in test-tiers.json, failing before and passing after the fix.
2. `node game/tests/shared-no-conflict-markers.test.js` clean; the lane's related tests green alone (wrapped in `/tmp/bt.sh`).
3. Save keys additive only; no feature removed; no Firebase write; no Math.random / Date in shared modules.
4. Hand-off note in the commit body: item id, files touched, tests added, anything a later slot must know.
5. QA verifies on the fix branch (qa.md), then the lead merges.

## 9. Late reports (b02, b03, b05, b06): folded in

All four arrived during triage and are included in every section above. They are not yet in this branch's `game/design/beta/` folder (they live on their own branches until the lead merges the beta branches); read them from branch `beta-b03` etc. at path `game/design/beta/b03.json` (same for .md and img).

- b02 (15: 4 P1, 8 P2, 3 P3) -> G-02, G-03, G-04 (P1), W-04, W-05, W-14, G-18, G-19.
- b03 (14: 1 P1, 7 P2, 6 P3) -> G-23 (P1), G-24, G-25, W-16, G-27.
- b05 (11: 3 P1, 2 P2, 6 P3) -> G-20, G-21, G-22 (P1), G-26, W-18, backlog.
- b06 (9: 5 P2, 4 P3) -> G-22 (weary boss), W-17, W-18, backlog.

Effect on the plan: `isles.js` slot order is Gameplay first (three P1), and G-23 jumps to the front of Gameplay's realm-world.js slot.
