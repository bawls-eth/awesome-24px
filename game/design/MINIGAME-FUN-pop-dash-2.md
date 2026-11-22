# Pop + Dash, second pass: what felt weakest (Playwright playtest, 390x844 and 1280x720)

1. Pop, readability: a greedy bot made 60 moves and mostly x1-x2 chains; nothing on the board tells you which group would chain, so chains feel like luck. Fix: chain preview (mouse hover or keyboard cursor outlines the group and badges "x2"), worked out without touching the board or the RNG.
2. Pop, dead ends: a new player who cannot see a pair just stares at 30 tiles while the 90 s clock runs. Fix: after 6 s with no pop the best move glows with a short "Psst" line (steady outline with reduced motion; off with `?hints=0`). No penalty, no timer change, gone on the next tap.
3. Pop, hit feedback: a x2 and a x5 chain sounded nearly the same (two sounds). Fix: a four-step audio ladder (pickup, claim, bag_rare, levelup) so each chain step sounds brighter.
4. Dash, unfair deaths: a jump about 0.4 s early always came down on the back of the first rock and ended the run at 54 m on every seed tried; that is the most common beginner mistake. Fix: forgiving landing (feet in the top 12 px of a rock land on it, then run off the end). Never jumping still crashes.
5. Dash, difficulty curve: speed rose 3.2 px/s every second from the start (172 px/s at 10 s). Fix: a warm-up of +2 px/s for the first 20 s (160 at 10 s, 180 at 20 s), then the old ramp up to the same 330 cap.
6. Dash, input fairness: a press just before touching down was sometimes dropped. Fix: input buffer 6 to 8 frames, coyote time 5 to 6 frames.
7. Dash, hit feedback: clearing a rock by a hair gave no reward. Fix: a near miss (under 8 px) gives a "close!" sparkle (fewer sparks with low graphics or reduced motion).
8. Dash, ghost clarity: the ghost runs on the same spot as you and was easy to miss. Fix: a thin outline, a "ghost" tag at the start and whenever it moves apart from you, and a cyan finish flag at the ghost's distance.
9. Dash, restart friction: the result now says why you crashed (no jump, too early, too late, gap) and R runs the same course again (after the same short 0.7 s pause as the big button, so a mashed key never skips the card).
10. Saves: no new keys. Ghosts gain `pv: 2` (additive); an old ghost still loads but is not raced (its inputs were for the old physics) and the next run on that course replaces it. No streaks or urgency mechanics were added.
