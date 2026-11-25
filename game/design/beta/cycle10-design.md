# Cycle 10 - D Gameplay Designer (branch cyc10-design, port 9104)

Browser runs through /tmp/bt.sh, Firebase blocked (blockDb, every WebSocket closed, town page stubbed), literal `db.attempts() === 0` asserted. Load factor 2.1-3.8x.

## 1. IDEAS.md statuses
Edited (no code): ID-09 and ID-18 now `built` (S, cycle 8; D verified in cycle 9 by `cyc9-design-town-bounty-deviations`); ID-51 was already `built`. Removed three duplicated rows (ID-53..55 appeared twice in the cycle 8 table). Added a cycle 10 review of ID-56..58: ID-58 priority 1 (text only, S), ID-56 priority 2 (S, needs U), ID-57 priority 3 (really M to L, needs G + U). Check run: `git diff` read-through only; no test covers this file.

## 2. Midlands idle rest (ID-51, zone <= 1, RM_IDLE_REST_S = 5): too safe or exploitable?
New test `game/tests/cyc10-design-midlands-rest.test.js` (registered, tier full). It passed ALL (final run, 4 trials, 1280x720). Set-up: new world hero Lv 1, real HP (no i-frames), put on the free Midlands tile nearest the spawn, a siege of 6 enemies (3 aimed, 2 ring, 1 spiral, tier 0) at 150-230 px, one real key press, then no input.
Numbers (4 trials):
- The rest began after 4.8-5.1 s game time every time (4/4), 0/4 fell inside that window.
- HP lost in the 5 s window before the rest: 37, 46, 56, 44 (of 100). Shots already in flight cost another 9-18 HP in the first 3 s of resting; after that 0 HP lost in the next 17 s, 0 new bolts.
- Resting earns nothing: 0 kills, 0 shards in 20 s; auto-fire is paused; HP does not regenerate (no heal at rest).
- One real key press ends the rest on the same frame; 4.5 s later the same siege fires again (99-131 bolts, 27-38 HP lost), no new rest within 5 s of a wake.
Verdict: not too safe, not exploitable. Standing still costs the 5 s of exposure (37-56 HP against 6 enemies, a worse case than normal play), gives no healing, no progress, and the siege is still there afterwards, so "stand still to escape" is not a way to win or farm. It only saves the hero who truly lets go (idle 6/6 alive at 120 s per `cyc8-design-inland-passive`). No tuning change made. The cycle 9 L watch item (Midlands deaths per hour dropping) cannot be measured without live data.
Screenshots: `game/design/beta/img/cyc10-design-midlands-rest-desktop.jpg` (1280x720), `-phone.jpg` (390x844, "Resting" chip beside the Midlands zone strip, not overlapping). 195x422 not rechecked this cycle (U owns it).
Honest note: the test passes on HEAD (it guards behaviour, no code was broken), so there is no "fails before". A first version had a wrong zone read (a stale HUD zone value) and a too-loose HP assertion; both fixed before the final run.

## 3. New ideas (all `proposed`, generic web queries, sources inline in IDEAS.md "Cycle 10 additions")
- ID-59 First-visit animal hello (S): the first time a new profile gets within about 160 px of a Town animal it turns and shows a heart, one hint line names it.
- ID-60 Animal sightings page in the notebook (S to M): met animals listed with where/when, unmet shown "?", no reward.
- ID-61 Welcome-back line (S): returning profile gets one dismissible "you were in <zone> at Lv N" line, no missed-days list, no gift, no streak.
Research caveat: the web results were commentary and practitioner blogs, no retention metrics; the ideas are design judgement, not measured.

## Unresolved
- No real-human play. 195x422 of the new screenshots not taken. Full suite not run (coordinator stamps); only the one new test was run (final run passed; two earlier runs were my own test fixes).
- ID-59 needs a G check that the animal reaction needs no new art; ID-60 depends on the notebook page structure.
