# Cycle 14: D (Gameplay Designer)

Branch `cyc14-design` (worktree agent-acdb7df48024105cc), static server port 9104. Nothing pushed. Firebase blocked in every browser test (offlineStub, literal `db.attempts() === 0`). Browser runs through /tmp/bt.sh at load factor 3-5. No new save key anywhere.

## Item 1: ID-64 economy check (go / no-go)

Tool: `game/tools/id64-build-sim.js` (pure node; reads the real constants out of realm.js and mm-unlocks.js by text and throws on drift). Pinned by `game/tests/cyc14-design-id64-economy.test.js` (node, smoke tier).

**Interpretation.** "Ability 1" is read as the Dash (bar slot 1, key Q, level 1, cooldown 3 s, 0.4 s of safe time, 150 px). The cycle 11 example "wider shot" would change damage and so the payouts; I kept the options defensive on purpose.

**Payout side (from the code).**
- Lv 5 needs 240 XP (30+50+70+90). Kills give 7 / 4 / 5 XP (Whirler / Sniper / Burster, wave 1), mean 5.33, so about 45 kills.
- Shards on the way: 3 / 2 / 2 per kill, mean 2.33, about 105 shards (before the shard ring bonus). Shop at that point: Common 24, Uncommon 56 (unlocks at Lv 4), Rare 120 (unlocks at Lv 8). The card arrives with about one Uncommon banked.
- Bot data (ftue-metrics.json, 6 Shore seeds, bot not human): first level-up 6.8-29.7 s, Lv 13-16 at 620 s, 0 deaths, min HP 73-100. The bot casts Dash once per 5.7-9.1 s against a 3 s cooldown, so cooldown is not what limits the bot.

**Options modelled (per minute of sustained use, the human upper bound).**

| Option | Cooldown Lv 5-15 | Safe seconds / min | Distance px / min |
|---|---|---|---|
| Base Dash | 3.00 s | 8.0 | 3000 |
| A Long dash (+33% distance = 200 px, cooldown +15%) | 3.45 s | 7.0 (-13%) | 3478 (+16%) |
| B Quick dash (cooldown -10%) | 2.70 s | 8.9 (+11%) | 3333 (+11%) |

At Lv 16+ Dash II sets the cooldown to 2.5 s (-17%, the existing reward for this stat) and the option multiplies it (A 2.88 s, B 2.25 s); the same percentages hold. B alone stays below the Dash II step. Neither touches XP, shards, drops or damage: payout delta 0. No sink is added or changed (a re-choice through the Settings line should stay free).

**Recommendation: GO, with conditions** (all for L/U to approve; S builds):
1. Ship only the two Dash options above (or numbers inside +-20% of base in both currencies; the guard test pins that).
2. **Option A cannot ship as written in co-op.** `realm-team.js` moves a guest's dash a fixed 160 px and enforces 2.4 s between guest dashes, so a 200 px local dash would not match the host. Either A is "+distance, solo only" with the choice ignored while in a team room, or A becomes a pure cooldown trade. B at 2.7 s clears the 2.4 s floor.
3. **Duels (`team.isPvp`)**: Dash is the only ability there; the build choice must be ignored in duels (the arena already ignores unlock nodes in duels).
4. Stack the new cooldown multiplier through the existing `_abCd` path (after Dash II's `set`, as a `mul`) so the 1 s floor still applies.
5. Order stays last (after ID-59/62/63). The Lv 5 card competes with ID-53/ID-55 in the first two minutes (U decides stacking, as noted in cycle 13).

Not verified: any human player's reaction to the choice; the sustained-use numbers are an upper bound from arithmetic, not play data.

## Item 2: Polyroll re-roll by reloading while storage refuses

Bug (reproduced): offline, with storage refusing `pixeltown-save-v1`, a roll resolved in memory, the star change was refused, and a reload restored the old (larger) star count. A lost bet could be re-rolled for free as often as the player liked. Cycle 13 only announced it.

Fix (`game/main.js`, no new key): the stake is written BEFORE the roll (`polyrollTakeStake`). If storage refuses the stake, the stake is put back, nothing is rolled and the line says "Polyroll is paused: browser storage is full or blocked, so a bet could not be kept. Free some space and try again. Nothing was rolled or spent." On a win the stake is paid back with the winnings (net +5 x bet dice, +1 x bet coin, same as before); on a loss nothing more is paid. If only the payout write is refused the line still says "Not saved yet", and a reload then can only cost the player. Online play is unchanged (stars do not persist online).

`game/tests/cyc14-design-polyroll-stake.test.js` (registered, full tier), at 1280x720 and 390x844: refuse + reload + six Roll clicks. Before the fix (main.js reverted): FAIL, live stars 44 with 50 stored, i.e. six free rolls, plus `polyrollTakeStake is not a function`. After the fix: 22/22 PASS (nothing rolled, stars 50 live and stored, plays unchanged, label 50; storage back: the roll happens and stored stars equal live stars; reload keeps the result; refused payout says "Not saved yet"; 0 page errors; db.attempts() === 0). `cyc13-design-refused-saves.test.js` had its [PR] step changed to match (it now takes the stake with storage working, then refuses the payout write): ALL PASSED.

## Item 3: another refused-save path audited (Town star claims)

I grepped every `writeSave` caller in `main.js` for a claim-once payout whose "already paid" record is read from storage only (`loadSave()`), the cycle 13 mailbox bug class. Two real star printers:
- **All-chores bonus (`dailiesRecord`)**: `refreshDailies` runs every 20 s and on every render; with storage refusing, the paid record sat in SAVE_PENDING, so every poll paid DAILY_BONUS (40 stars) again.
- **Town bounty Claim (`bountyRecord`)**: the same bounty could be claimed again and again.

Fix: both read `loadSaveLive()`; both now call `unsavedNote(...)` ("... but not saved yet"); the paid/claimed record is written once when storage returns.

`game/tests/cyc14-design-refused-claims.test.js` (registered, full tier), 1280x720 and 390x844. Before the fix (main.js reverted): 8 FAIL (four polls paid 165 stars, the Claim button stayed and a second claim paid again, no warning). After: ALL PASSED (one payout, warned, button reads Claimed, storage back writes `dailies` days 1 and `bounty` claimed 1 and the stars once, no re-pay). Existing `cyc4-daily-bonus`, `cyc7-s-town-bounties`, `cyc9-design-town-bounty-deviations`, `dailies`, `beta-g12-esc-close`, `cyc12-design-town-shops`: ALL PASSED.

Screenshots viewed: `img/cyc14-design-polyroll-paused-390x844.jpg` (paused line fits, no overflow), `img/cyc14-design-bounty-unsaved-390x844.jpg` (Today panel: "+40 collected", bounty "Claimed"). Saved, not individually viewed: the two 1280x720 pair images.

## Unresolved / not run
- 195x422 not screenshotted for the Polyroll paused line (it is plain wrapped text in the existing card; the sweep was not run). Full stamp not run (coordinator).
- Same class, not audited: other `loadSave()` readers (fishlog claimed, weedsPulled, bugoff record, home paidDay visitor bonus). Those mostly pay through in-memory sets within a visit; the reload case (refused write, reload, claim again) stays inherent for every claim while storage refuses and is now only announced. Proposal: one `loadSaveLive` sweep by L.
- A tab closed in the refused window still loses what storage never took.
- Online-mode Polyroll is unchanged (stars do not persist there).

## Proposals
- ID-64: GO as above; S can build after ID-59/62/63. Suggest U's card text: "Quick dash: ready a little sooner" / "Long dash: goes further, ready a little later (solo only)".
- L: review the `polyrollTakeStake` revert of `STARS_FLUSH` and consider one shared "pay-once record reads live" helper so new claim paths cannot read storage only.
