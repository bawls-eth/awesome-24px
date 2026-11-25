# Cycle 11: D (Gameplay Designer)

Branch `cyc11-design` (worktree /tmp/wt-cyc11-design, cut from bd92da2), port 9114. Nothing pushed.
Method: the first-ten bot (`WORLD_BOT` from `first-ten-minutes.test.js`, simulated 60 Hz, fresh profile, 390x844, offline, db.attempts() === 0 in every run), run for 600 game seconds. Extra stand-in "players" (walk-only, shuffle, afk) were made for the hint. The measuring script lives in the scratchpad, not in the repo. Bots are not humans: a human is slower to level and slower to read.

## Item 1: ID-55 "first session" definition and the 8-minute trigger

Measured (bot, seeds 12345 / 777 / 4242): Lv 2 at 11-15 s, Lv 3 at 26-48 s, Lv 4 at 50-75 s, Lv 5 at 64-99 s, Lv 8 at 140-246 s, Lv 11 at 318-382 s, Lv 13-14 at 397-524 s.
- **The Lv <= 3 rule shuts out too many.** A bot is Lv 4+ after about a minute, a human after perhaps 2-3 minutes. Anyone who played a bit, left and came back never got the card (it is judged at the first world load in the tab).
- **The card opens late for a player who keeps fighting.** Due at 480 s, it opened at 510 s, 517 s, 565 s (mixed play) and 590 s (dawdle), and in one 600 s run (seed 777) not at all (enemy or boss within 420 px for the whole 121 s after due). Typical delay 30-85 s, so "8 minutes" is really about 9-10 for a fighter; that is acceptable (the card must wait for a calm moment) and I did not change it.
- **Real flaw found: the card was consumed in 1-5 s.** In 4 of 4 fighting runs the card opened at a quiet moment, an enemy came within 300 px 1-5 s later, the "danger" rule closed it, and `realm.firstEndSeen` was already saved. The player never gets another chance. The bot's open times were 1, 2, 5 and 2 s.

Changed (`game/games/mad-maze/realm-world.js`, block "cycle 11 D", constants `FE_LV`, `FE_MIN`, `FE_RETRY`, `FE_COOL`):
1. First session = Lv <= 5 at the first world load (was 3). Bot reaches Lv 5 after 64-99 s, so this means "played under about 3-4 minutes before".
2. A card closed by the world (danger) after being visible under 6 s shows again at the next quiet moment, 10 game seconds later, at most 2 retries per visit. A card read for 6 s or more, or closed by the player (Not now, Esc, Back, Go), is never repeated. The save flag is still written at the first show (S's tests unchanged); closure variables only, no arena fields.

Checks run:
| Check | Result |
|---|---|
| new `game/tests/cyc11-d-first-end.test.js` (registered in test-tiers.json) on the change | all PASS (Lv 5 ok = 1, Lv 6 ok = 0, Lv 1 ok = 1; opens; danger close under 6 s keeps it armed and keeps the flag; no reopen while the enemy stays; reopens after cooldown; no retry after 6 s visible; Not now never repeats; 0 page errors; db.attempts() === 0) |
| same test with realm-world.js reverted to bd92da2 | 8 FAIL (as required) |
| `cyc10-s-first-end.test.js` (S's, unchanged) on the change | ALL PASSED |
| `cyc9-lead-pool-shapes.test.js` | ALL PASSED |
| Screenshots of the card (Lv 5 profile) | `img/cyc11-design-firstend-lv5-1280x720.jpg`, `-390x844.jpg`, `-195x422.jpg` (card opened in all three; I did not re-check layout: S and U tests already cover it) |

Not tested: a real human with a real clock; the Lv <= 5 effect on a returning day-2 player (the headline says "Nice first run!", acceptable for a Lv 5 hero, the numbers are the save's own). Not run: full stamp.

## Item 2: ID-53 hint cadence

- **The always-fighting bot never sees a hint** (3 seeds, 600 s): its reward gap stays under 20 s. Expected, and good: a playing player is never interrupted. (First-ten target for max reward gap is 45 s, so some real play will pass 20 s.)
- **Idle at the Shore: no hint** (afk run, 300 s): the hero rests after 5 s (ID-51), the Resting chip shows, 0 hints.
- **Walking with nothing to do** (shuffle left-right, 600 s): hints at 28 s ("Tap ability 1 to use your class skill"), 60 s ("Open the Menu (☰) for your quests and bag"), 250 s (ability 1 again), each up 12 s; between 72 s and 250 s the world event gated it. Max 3 reached by 250 s. The bag verb never showed because there were no drops. No text contained "move".
- **Walking a wide circle (new map cells) and a bot that stops shooting but explores: no hint**, because exploration XP counts as a reward (correct).
- Verdict: the cadence reads as helpful (first hint about 28 s after the player starts walking aimlessly, then about 32 s later, a different verb each time). Max 3 per visit looks right: a 4th would repeat verbs the player ignored three times. Keep 20 s and 3. No change made.
- Simulation caveats: a sim artifact (the realm banner stays visible because its timer is wall-clock) blocks the hint as 'toast'; my script hid the banner each second. The hero pace/walk modes are crude stand-ins. Not tested: 195x422 (S already reported the second-slot placement; U decides) and a real human.

## Item 3: ranking of ID-56..61 by impact (D opinion, for L/U)
1. **ID-58** sleeping-neighbours hint (S, pure text, fixes a silent failure).
2. **ID-59** first-visit animal hello (S, low risk, Codex deer/fox/owl art already in Town, gives the first ten minutes a warm beat).
3. **ID-61** welcome-back line (S, helps returning players, same cohort the Lv <= 5 change now includes).
4. **ID-56** saving-for pin (S, needs U for 195 px).
5. **ID-60** animal sightings in the notebook (S to M, no reward, depends on ID-59 data).
6. **ID-57** bullet shape option (M, needs G art).

## New proposals (`proposed`, added to IDEAS.md)
Generic web queries only. The search results were thin (store pages, forums, one design blog); no retention numbers found, so the ideas rest on design reasoning and anecdotes.
- **ID-62 Animal "ask for a treat" bubble (Town):** a Town animal that has liked the hero (ID-59) sometimes shows a small food icon when the hero is near; handing over a flower or berry the hero already carries gives a heart and a second line of dialogue. No hunger, no penalty if ignored. Source anecdote: players asked for a chance event while petting and disliked angry reactions to feeding a full animal ([itch.io](https://itch.io/post/14649247), [Game Developer: petting cats](https://www.gamedeveloper.com/game-platforms/why-do-players-love-petting-cats-in-their-games-)); the Octalysis write-up that pets create guilt ([Yu-kai Chou](https://yukaichou.com/advanced-gamification/the-pet-companion-design-in-gamification/)) is the model to avoid, so there is no neglect state. Size S, low.
- **ID-63 Isles tame callback in Town:** after the first Isles tame, the Town animals nearest the hero turn to look at the new companion and one line mentions it, tying the two halves of the game together. Pokemon GO's buddy system links feeding, play and walking into one companion loop (the buddy-system point is from a search summary only, no source page checked). Size S, low.
- **ID-64 First Realm hour: one visible first-build choice at Lv 5:** at the first Lv 5 level-up a card offers 2 labelled choices for ability 1 (for example "wider shot" or "faster dash") with the outcome in plain words, saved in the existing save as an additive key. Early choices in action roguelites are praised when they have clear outcomes and criticised when the outcome is hidden or trivial (anecdotal reviews: [Rogueliker: Tiny Rogues](https://rogueliker.com/tiny-rogues-review/), [Vice: Returnal](https://www.vice.com/en/article/returnal-is-a-gorgeous-and-fun-sci-fi-shooter-but-an-awkward-roguelike/)). Size M, medium (balance, new save key, U for the card). Needs an economy check before approval.

## Unresolved / for others
- The first-end retry is a tuning of an approved feature: L or U please confirm. If the owner prefers, set `FE_RETRY` to 0 (one-line revert, the new test pins the current behaviour).
- ID-53 and ID-55 have still never been seen by a real human.
