# Lane: Gameplay Engineer

Read `../TRIAGE.md` first (ownership map in section 5, definition of done in section 8). Branches `fix/gp-<item>` from `claude/animal-crossing-game-7z3roh`; do not push; small green commits. Tester evidence: `game/design/beta/<id>.json` (b02/b03/b05/b06 on branches `beta-b02` etc.).

Your files: realm.js, dungeon.js, realm-tutorial.js, hub/gift.js, hub/home.js, hub/calm.js, hub/hub.js, shared mm-quests / mm-profile / mm-nexus / mm-angler / mm-minikit / mm-nav / mm-companion / mm-isle-boss / mm-isle-pouch / mm-tames, arcade `*.js` (pop, stack, dash, jam, stalk, angler, dd-run). Serial slots: realm-ui.css slot 1 (G-02 only), lantern.js slot 1, isles.js slot 1, main.js slot 2, realm-world.js slot 2, index.html slot 2 (pill text only), deepdelve.js slot 2. Never edit: style.css, mad-maze.js, mm-art.js, mm-backup.js, net.js, firebase-config.js.

Order: G-02, G-01, G-03, G-04, G-22, G-05, G-20, G-21, (main.js slot) G-12, G-13, O-01, (realm-world.js slot) G-23, G-06, G-07, G-15, G-08, G-24, G-14, G-17, G-10, G-16, G-25, G-26, then P3 batches.

---

## P1

### G-01 Daily gift claimable with no town save (b08-01) - confirmed in code
- Files: `game/hub/gift.js:21-24` (payShards returns false when the key is absent), `:63-66` (roll back + "town save" message).
- Fix: when `pixeltown-save-v1` is ABSENT (null), start from `{}` and write `{ realm: { shards: n } }` (additive; the Town join card keys off name/species, so it still shows). When the key exists but is corrupt / not an object, keep today's behaviour (nothing paid, nothing claimed) but say it in player words: "Could not save the gift. Nothing was claimed." Token gifts with no profile: fall back to shards the same way.
- Acceptance (`tests/beta-g01-gift.test.js`, blockDb):
  1. Fresh storage, open Home, Daily gift, Claim: note starts with "Gift claimed", button text "Claimed today" and disabled, "Days claimed: 1".
  2. `JSON.parse(localStorage['pixeltown-save-v1']).realm.shards` equals the previewed amount; no `name` key was invented.
  3. Open the Town afterwards: the join card is shown (no half-joined state); after joining offline, the realm shards are still there.
  4. Storage holding `pixeltown-save-v1 = "not json"`: Claim leaves the raw string byte-identical, gift key not written, button still enabled.
  5. Two fast clicks pay once.
- Risk: main.js loadSave must tolerate a save with only `realm` (read `loadSave` before coding; it is read-only for you until slot 2, and you should not need to change it). Existing `hub-gift.test.js` asserts the old message: update that assert and name it in the hand-off.
- Depends on: nothing. S-02 changes Town writes later; your delta write is already merge-safe (review H1 comment at gift.js:18).

### G-02 Combine button covers Equip (b02-01) - partly confirmed (css grid)
- Files: `game/realm-ui.css:91-96` (`button.eq` grid-column 2 rows 1-2, `button.dc` column 3), row markup at `game/realm.js:4604`.
- Fix: first reproduce with 3 copies of one item and read the row's buttons (find the Combine class). Give every action button an explicit cell (e.g. a 4-column template `minmax(0,1fr) auto auto auto`, or put Combine on its own row 3 spanning columns 2-3). Each button stays >= 44x44 px at 390 wide.
- Acceptance (`tests/beta-g02-combine.test.js`, 390x844 and 1280x720):
  1. With 3+ copies, the bounding boxes of Equip, Combine and Sell do not intersect (pairwise).
  2. `document.elementFromPoint(centre of Equip)` is the Equip button; a real click equips (eq slot changes), item count unchanged.
  3. A click on Combine combines (count -3 +1) and equips nothing.
  4. Rows with 1 copy look as before (no empty third column wider than 8 px).
- Risk: narrow phone rows wrap; check `realm-phone-layout.test.js` and `backpack-compare.test.js`. Release realm-ui.css to World+Graphics as soon as this merges.

### G-03 Sell / Buy / Reforge guards (b02-02, b02-03, b02-12, b02-14) - confirmed in code
- Files: `game/realm.js:4199-4207` discard, `:4604` list render, `:4313-4366` _forgeDom, `:4388` vendorBuy. Do not touch mad-maze.js: the delegated handler at mad-maze.js:119 ignores disabled buttons, so do the guard in the render.
- Fix: (a) arm delay: after any backpack / forge / stall re-render, action buttons render `disabled` and are enabled after 300 ms, so a second click of a double-click lands on a dead button. (b) two-step Sell for protected items: equipped, soulbound, relic, signature, or tier >= the hero's best in that slot: first click turns the button into "Sure? Sell +N" for 3 s, second click sells. Plain junk stays one click. (c) Sell-back list in the vendor marks "(equipped)". (d) Reforge confirm: after a reforge the Salvage confirm is never the element under the same pointer (arm delay covers it; assert it).
- Acceptance (`tests/beta-g03-sell-guard.test.js`):
  1. Real `dblclick` on Sell of row 1 (junk): exactly one item sold (items.length -1), the row below still present.
  2. Click Sell on the equipped weapon: nothing sold, button text contains "Sure"; second click within 3 s sells and unequips; no click for 3 s restores "Sell".
  3. Double-tap "Confirm reforge": the item still exists and no salvage confirm is open.
  4. Double-tap vendor Buy: one purchase, dust reduced once.
  5. `arena.discard(uid)` called directly (test hook / other code paths) still sells in one call.
- Risk: tests that click Sell right after opening the backpack (`realm-shop-death`, `gear-forge-ui`, `nexus-vendor`) may need a `waitForFunction(!btn.disabled)`: wait for the condition, never a fixed sleep. Keyboard / pad activation must respect the same arm state.

### G-04 Full backpack never auto-sells an upgrade (b02-04, b02-05) - confirmed in code
- Files: `game/realm.js:3458-3466` collectItem.
- Fix: in the full-pack branch, if the drop is tiered and (tier > best owned tier for its slot, or flagged over-level / chase / signature / relic) do NOT sell: leave the bag on the ground (return false so the pickup stays) and show a HUD toast "Backpack full: make room for <name>" (rate-limited to once per 4 s). Lower-value drops keep the current auto-sell but the float text gets a dark outline and the same toast names what was sold.
- Acceptance (`tests/beta-g04-full-pack.test.js`):
  1. Pack full, walk over a T12 bag while best owned is T3: `save.items.length` unchanged, shards unchanged, the bag is still in the world, toast text contains "Backpack full".
  2. Sell one item, walk over it again: the T12 item is in the pack with its tier and affixes.
  3. Pack full, walk over a T0 common: sold at `rmSellValue`, `arena.lastFullSale` set, toast names it.
  4. No stash record / save write of the kept-on-ground item happens before pickup (review F2 stays true).
- Risk: bag despawn timers (an upgrade bag must not vanish while "full"; extend its life while the player stands in toast range or state the timer in the toast). `gear-world-drops`, `world-pickups` tests.
- Owner default O-06 applies.

### G-05 Rekindle cannot clone living heroes (b11-01) - confirmed in code
- Files: `game/shared/mm-profile.js:180-194`, `game/games/mad-maze/lantern.js:526-529`.
- Fix (default, O-05): rekindle takes a Keepsake of a fallen hero as its source: new hero of that class at `min(10, floor(L/2))`, the Keepsake gets an additive `rk: true` flag (kept as a memento, cannot rekindle twice). The Rekindle button moves from living hero cards to the Keepsake entry. `rekindle(profile, heroId)` on a living hero returns `fail(p, 'not-fallen')`. New hero name gets a suffix if a living hero already has that name. Profile shape stays additive (old saves without `rk` = not yet used).
- Acceptance (`tests/shared-mm-profile-rekindle.test.js` node + `tests/beta-g05-rekindle.test.js` page):
  1. `rekindle(p, livingId)` -> `ok:false`, reason 'not-fallen', heroes.length unchanged.
  2. Fall a level-20 hero -> Keepsake; rekindle from it -> one new level-10 hero; second rekindle from the same Keepsake fails ('used'); Keepsake still in the stash with `rk:true`.
  3. Lantern page: no Rekindle button on any living card; the button on the Keepsake is disabled with a reason for hardcore / roster full / used.
  4. A profile saved before the change (no `rk`) loads, cleans and round-trips byte-stable through `clean()` twice.
  5. Backup plan() still accepts a profile containing `rk` (ask Perf+Systems if a cleaner strips it).
- Risk: mm-backup CLEANERS may drop unknown fields (Perf lane file: send them the field name). Existing tests `shared-mm-profile*.test.js` assert living-hero rekindle: change those asserts, list them in the hand-off. If the owner prefers another rule, only the source check changes.

### G-20 Isles: choose which tame to ride (b05-01) - confirmed in code
### G-21 Isles: Stable UI for the party (b05-02) - confirmed in code
- Files: `game/games/isles/isles.js:974-978` (adoptTame), `:986-1005` (refreshMount), `:2608-2620` (Party tab). TAMES API in shared/mm-tames.js (setParty, setMount exist).
- Fix: turn the Party tab into a Stable list: every tame in the roster is a row (name, species, level, mode) with buttons "Join party" / "Rest" (party size limit respected; swapping despawns / spawns the companion), and "Ride" on rideable tames (calls `TAMES.setMount` then `refreshMount()`; saddle state follows the chosen mount). Rows are real buttons >= 44 px, keyboard reachable. Release / rename only if TAMES already supports them; otherwise leave out and note it.
- Acceptance (`tests/beta-g20-isles-stable.test.js`):
  1. With 3 rideable tames, press Ride on the third: `tames.mount` equals its id, the next mount-up draws its species (test handle `rideDrawn`), and it persists after reload.
  2. With 4 tames and party of 2: Rest on member A then Join on tame C -> `tames.party` = [B, C]; exactly 2 companions exist; A's entity is gone; persists after reload.
  3. Join is disabled with a reason when the party is full; low-gfx (party of 1) respected.
  4. A saddle crafted for mount #2 shows on mount #2 when ridden.
  5. Old saves (party / mount set by the old code) load unchanged.
- Risk: companion spawn / despawn during a fight or while riding; block swaps while mounted or in a boss fight with a message. isles.js is 3000+ lines: keep the change inside the tab renderer and two helpers. Tests `isles-taming`, `shared-mm-tames`.

### G-22 Companions never attack the tame target; weary boss is safe (b05-03, b06-04) - confirmed in code
- Files: `game/games/isles/isles.js:905, 935` (compCtx.enemies = creatures), `:1203`; `game/shared/mm-companion.js:83-90, 171`; `game/shared/mm-isle-boss.js:223`.
- Fix: build `compCtx.enemies` without the current soothe target and without any creature that has tame progress > 0 or is KO'd-for-taming (or pass a `skip(e)` predicate honoured by nearestEnemy; keep MAX_SCAN bound and determinism). Boss: while `st === 'weary'` damage is clamped so HP cannot go below 1 for the first N seconds of weary (suggest the whole weary state: a weary boss can only be tamed or left; the rematch variant keeps its kill path because it can never be tamed). Toast on weary: "It is weary. Hold fire and offer a feast."
- Acceptance (`tests/shared-mm-companion-tame-skip.test.js` node, `tests/beta-g22-tame-safe.test.js` page):
  1. Node: with enemies [target(skip), other], attack-mode companion picks `other`; with only the target, `tgt` is -1.
  2. Page: soothe a creature with two attack-mode companions for 20 s: its HP never drops from companion hits (track min HP), KO-for-taming still reachable by the player's soothe.
  3. Weary first-fight boss + 6 s of held fire: `st` stays 'weary', hp >= 1; feast -> 'taming'.
  4. Rematch boss (opts.rematch) at weary still dies to fire (unchanged).
  5. Golden / sim tests `isle-boss-sim`, `shared-mm-isle-boss`, `shared-mm-companion` still green or their changed expectations are listed.
- Risk: mm-companion and mm-isle-boss are pure shared modules with sims: no Math.random / Date; update golden values only if the rule change requires it and say so.

### G-23 Enter does not open the Nexus mid Trial / boss fight (b03-01) - confirmed in code
- Files: `game/games/mad-maze/realm-world.js:1987` (keydown Enter -> nexusOpen), `:1995` (prompt), nxBtn click.
- Fix: add one predicate `nexusAllowed()` = no active rush (phase 'fight' / 'intermission' as designed) and no live world boss within its leash; use it in the Enter handler, the button click and the prompt visibility. While blocked, the prompt reads "Finish the fight first".
- Acceptance (`tests/beta-g23-trial-enter.test.js`):
  1. Start a Trial, press Enter during phase 'fight': `nexus.isOpen()` false, arena not paused, Enter still fires (a shot is spawned).
  2. The Nexus button is hidden or disabled during the fight; after the Trial ends both work again.
  3. Outside a fight, Enter near the Nexus opens it as before (`world-nexus.test.js` green).
- Risk: you get realm-world.js only after Perf's S-04 merges: rebase first. Keep the change to the three call sites.

### O-01 Arcade door rename (b07-06) - only after the owner answers
- Files: `game/main.js:1136-1141`. Default in TRIAGE section 6. Acceptance: no door label matches /GTA|NFS|Need for Speed|Vice City/i; every door still exists and is interactable (4 doors); any remaining external door opens a confirm and a new tab with `rel=noopener`; `town-links.test.js` updated.

---

## P2

### G-06 Quest zone names + goal line (b01-01, b04-04)
- Files: `game/shared/mm-quests.js:8` (`['Shore','Meadows','Deeps','Godlands']`), `game/games/mad-maze/realm-world.js:494-505` goalText. Canon: `shared/mm-zones.js:26-29` Shore / Midlands / Highlands / Godlands with recLv 1 / 5 / 10 / 15.
- Fix: quest text takes names from MMZones (fall back to the fixed canon list in node). Quest ids, seeds and progress logic unchanged, so stored quest state stays valid. goalText prefers a daily quest only if its zone recLv <= hero level + 2; otherwise the level goal stays.
- Acceptance: (1) for 30 seeded dates no quest title contains 'Deeps' or 'Meadows'; every zone word is one of the four canon names. (2) Lv 1 hero after first kills: goal line is still the level goal, not a Highlands quest. (3) Lv 10 hero: goal line shows the Highlands quest. (4) stored `quests` state from before the change keeps progress and claimed flags. (5) `shared-mm-quests.test.js` golden titles updated deliberately and listed.
- Risk: golden text; other callers of the ZONES export.

### G-07 Boss altar wakes by zone (b01-02, b04-13)
- Files: `realm-world.js:870-876` (`d < 9 * TILE`).
- Fix: wake only when the player's current zone id >= the boss site's zone id (zones.at(player)), or the player has hit the altar / boss. A site in Midlands never wakes for a hero standing in Shore. Add a first-time toast when a lower-level hero wakes a boss: "<Boss> is above your level (rec. Lv N)".
- Acceptance: (1) hero on a Shore tile 5 tiles from a Midlands altar for 10 s: no boss spawned. (2) step onto a Midlands tile within 9 tiles: boss spawns. (3) boss rest rule at 40 tiles unchanged. (4) `world-bosses-extra`, `world-bosskey`, `realm-boss` green.
- Risk: altars on a zone border; raid-boss exclusion logic on the same line.

### G-08 Off-screen farming (b01-03)
- Files: `game/realm.js:2959-2968` _canFire, `:2984` hold.
- Fix: an enemy that takes player damage while holding fire becomes "provoked" for 4 s: it ignores hold-fire and non-approaching types step toward the player until on screen. Fire budget rules stay.
- Acceptance: (1) Whirler 400 px above the view takes a hit: within 2 s it has fired or moved >= 60 px toward the hero. (2) unprovoked off-screen enemies still never fire (`world-firebudget` green). (3) bullet count stays within the existing cap in a 72-enemy scene. (4) `world-ttk`, `difficulty-curve` unchanged or re-baselined with numbers in the hand-off.
- Risk: difficulty spike on phones (short view); keep the provoke window short and test at 390x844.

### G-10 Deepdelve dive score ignores placed blocks (b11-02) - after Perf releases deepdelve.js
- Files: `game/games/deepdelve/deepdelve.js:91, 459`, `dd-run.js` mined().
- Fix: keep a per-session Set of player-placed cell keys; mining a placed cell returns the item but calls `mined(..., { placed: true })`, which adds no ore points and does not extend the combo. Creative mode unchanged.
- Acceptance: (1) 100 place/mine cycles of coal at depth 0: score, ores and bestCombo all 0. (2) a natural ore still scores and combos. (3) the item comes back to the inventory every time. (4) `deepdelve-goals`, `dd-*` tests green.
- Risk: memory of the Set (cap at 4096 keys, oldest out).

### G-12 Esc / Back closes overlays (b07-01, b04-08; b15-13 in G-18)
- Files: `game/main.js:2322` closeTopOverlay (add a window keydown for Escape and P that calls it when no text input is focused), realm-world.js Nexus keydown (Esc closes dialog / board first, Nexus second), quest board Close button.
- Acceptance: (1) for Journal, Map, Today, Achievements, Home plot, Polyroll: open, press Esc -> flag false and element hidden; (2) Esc while typing in chat only blurs the input; (3) Museum / Postcards / Able Sisters still close once (no double close of the layer below); (4) Nexus: Esc with the quest board open closes the board, `nexus.isOpen()` still true; second Esc leaves; (5) pad B behaviour unchanged.
- Risk: double handlers with the three overlays that already listen; P is also "Menu": do not open the nav sheet on the same keypress that closed an overlay.

### G-13 Beachcombing priority (b07-11)
- Files: `game/main.js:2534-2700` interact order (beach at ~2635), BEACH_SPOTS :900.
- Fix: when the player stands within pickup range of a visible beach item, it wins over fish shadows and wildlife logging (still after villagers). Suppress the "E: log" hint while fishing state != idle (b07-12 hint part).
- Acceptance: (1) on a shell with a wildlife specimen on the same spot: A picks the shell (shells +1) and the specimen is still loggable on the next press; (2) on the west-pond shore shell: A picks the shell, no cast; (3) 2 tiles away from any beach item facing water: A still casts; (4) while "Reel it in!" shows, no second label is visible.
- Risk: fishing tests (`fishlog`, `aquarium`).

### G-14 One first move (b08-02, b08-03, b08-05)
- Files: `game/hub/home.js:117`, `hub/calm.js`, `hub/hub.js`; `game/index.html` pill text (slot 2).
- Fix (follows SIMPLIFY-PLAN): on a fresh profile PLAY, the "Next" line and the highlighted card name the same destination (the guided Realm adventure, per PLAYTEST-REVIEW-4, unless the owner says Town); the map's default node is a visited-or-playable node, never "Coming soon"; the Town pill reads "Home" and goes Home.
- Acceptance: (1) fresh storage: PLAY href, Next line target and the highlighted card resolve to the same URL; (2) map default node's Open button is enabled and navigates; (3) join-card pill text equals the place it lands on; (4) a returning profile's PLAY still resumes its last place (`hub-home.test.js`, `first-ten-minutes.test.js` updated deliberately).
- Risk: several hub tests pin current copy.

### G-15 Realm tutorial first minute (b08-04, once)
- Files: `games/mad-maze/realm-tutorial.js`; world event timer in realm-world.js (slot 2).
- Fix: no Raid / Swarm countdown until the coach is finished or skipped; the "bag" step guarantees a bag within 6 tiles and points at it; the fall panel is above the coach card and has a visible "Try again".
- Acceptance: (1) fresh profile, first 60 s: event banner absent; (2) at step 'bag' a bag entity exists within 6 tiles; (3) kill the hero during the coach: fall panel z-order above the coach, a "Try again" button is visible and focused; (4) after the coach, events start (`world-events` green).

### G-16 Angler reel can end (b10-04) - owner default O-06
- Files: `game/shared/mm-angler.js:254-266`, `games/angler/angler.js:411-432`.
- Fix: meter at 0 for 6 s continuous -> status 'lost' ("It swam off. No harm done."), no penalty, tournament cast consumed as today's snap would.
- Acceptance: (1) node: 200 ticks of 1/30 s with no input from reeling -> status 'lost'; (2) any input resets the 6 s; (3) golden catch sequences unchanged for active play (`shared-mm-angler-golden`); (4) page shows the message and returns to idle.

### G-17 Result card guard + Stack Menu (b09-02, b08-07)
- Files: `game/shared/mm-minikit.js:177` (make the click guard the default: buttons inert for holdMs after the card opens), `games/pop/pop.js:279`, `games/stack/stack.js:197` (drop the private guard once the kit does it), Stack result gets the kit's Menu button.
- Acceptance: (1) Pop, Echo, Stack, Dash: a click 100 ms after the card opens does nothing; at holdMs + 50 ms it works; (2) R / Enter keep the same hold; (3) Stack result has "Menu" that opens the shared nav; (4) reduced-motion does not change the hold.
- Risk: echo.js belongs to World+Graphics: the kit default must cover it with no echo.js edit.

### G-24 Dungeon doors, fall summary (b03-02, b03-13, b03-14)
- Files: `games/mad-maze/dungeon.js:745, 863`; realm.js player wall collision and death banner text.
- Fix: corner-slip: when blocked by a door-frame tile and an open gap is within 12 px on the perpendicular axis, slide toward it; R / pad Back on the fall summary = "Try again (same seed)"; in dungeon mode the banner says "You fell in the <biome>".
- Acceptance: (1) walk into an open door 10 px off-centre: the hero passes within 0.5 s; (2) closed doors still block; (3) on the summary, R restarts the same seed (seed equal, floor 1); (4) banner text contains no "Realm" / "wave" in dungeon mode.

### G-25 ?floor= gate (b03-07)
- Files: `dungeon.js:793`; request to World+Graphics for mad-maze.js:132 only if the clamp cannot live in dungeon.js.
- Fix: clamp the requested floor to (deepest floor cleared on this save + 1); TEST mode (`?test=1`) may bypass.
- Acceptance: (1) fresh save + `?floor=3` starts floor 1 with a toast; (2) a save with floor 2 cleared starts floor 3; (3) loot tier on the clamped run is floor-1 tier; (4) existing deep-run tests pass with their seeded saves.

### G-26 Isles economy persistence (b05-04, b05-06, b05-07)
- Files: `isles.js:1838-1854, 2060, 2078, 2149`; `shared/mm-isle-pouch.js`.
- Fix: persist glint `until` timestamps per island (additive key in the Isles save, capped list) and the pouch contents; craft button uses the arm-delay pattern; gathering with a full pack does not spend the spot.
- Acceptance: (1) gather 5 glints, reload: those 5 are still spent until their respawn; (2) pouch count survives reload; (3) double-tap Craft makes one item; (4) full pack + gather: spot still ready, toast "Pack full"; (5) old saves load.
- Risk: uses wall-clock for respawn in page code only (not in shared modules).

---

## P3 batches (after all P2)
- G-09 Survivor's cache: `realm.js:3295-3303` needs >= 3 kills or 60 s alive since the last cache. Asserts: suicide x3 gives 0 items; a real run still gets one; shards still never lost.
- G-11 Stalk clock: `stalk.js sync()` stores the furthest slot seen (additive); a clock moved back shows "Your device clock moved back" and keeps the furthest slot. Asserts: Sunday buy cannot reopen; future prices not revealed; a normal week rollover unchanged.
- G-18 small logic list (TRIAGE section 4): one commit per sub-item, one assert each minimum, 3+ per commit group.
- G-19 AI polish, G-27 Trial polish: only if time remains; each needs a before/after clip or numbers.

## Requests to other lanes
- World+Graphics: mad-maze.js:132 floor clamp hook (G-25) if needed; chase toast position (W-16) may need a class from realm.js:4761: tell me the class name you want.
- Performance+Systems: mm-backup CLEANERS must keep the Keepsake `rk` flag (G-05) and the new Isles glint key (G-26); S-02 changes how the Town writes: tell me before I start main.js slot 2.
