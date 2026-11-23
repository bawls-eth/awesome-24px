# Stalk Market bug bash

## Fixed (branch bb-stalk)
1. Practice week was buried below the real stall; weekday visitors saw a dead end. Now a "Play a practice week" button is the first thing on the page, with ONE line: practice is open any time, the real market follows the calendar.
2. Intro text was 52 words; now 32.
3. Device clock one week earlier than the saved week (reset / timezone hop) was treated as a rollover and spoiled real stalks and logged a fake week. Trading now pauses with a plain message; far-off weeks still roll over normally.
4. B / S trade keys fired while typing in a text box (would have bitten once Settings feedback box exists) or with a dialog open. Guarded.
5. "Sell all" with zero stalks said "Pick at least one"; now "You have no stalks to sell." Zero bells on Sunday now explains and points at practice.
6. Wired: MMSettings (Settings button), MMInput aliases in practice (Space/Enter primary, E sell all, R again), MMMiniKit result card for practice, `error` chip cue on refused actions.

## Open
- None known; see Elsewhere.

## Elsewhere
- Other game pages do not yet mount MMSettings; `#top` header wraps to two rows at 390px when Settings + Sound + Town icon all show (stalk handles it with a smaller h1).
