# Retest round 3 - consolidated summary

15 testers, tip 3055a87, real touch/mouse play where possible, Firebase blocked (0 DB attempts). No P0/P1 found. No regressions reported.
Tester readiness scores: b01 7.5, b02 8.5, b03 8, b04 8, b05 8, b06 7.5, b07 7.5, b08 7 (was 6), b09 8.5, b10 8, b11 8, b12 7.5, b13 8, b14 8.5, b15 8. Mean about 7.9. The 9/10 gate is NOT met.

## Verified by play
Shore XP fade/telegraph/Assist/death dissolve; reforge cost and double-tap guard; dungeon pad off the room on phone; boss fights winnable (phone 54 s, desktop 52 s); danger meter, quest hints, notebook; one Backup (all keys + settings, restore on phone, blocked storage); Town 38 fps at 4x CPU (was 11-28); Realm rotate 0 long tasks (was 35); Deepdelve taps no stalls; Arcade A tap guards, 6-7 digit HUD, tab order, no overflow at 195 px; Isles bond hearts and hit flash; ghost bank line; Lantern restore.

## Open P2 (go to cycle 5, first)
1. "Better prey" toast overprints "New notebook page" toast (realm.js:3263) - b01.
2. Phone quest board opens at y=736 with one row visible, no scroll hint - b04.
3. Phone Isles how-to card (195 px tall) plus toasts cover the map; no creature visible on first screen - b05/b06.
4. Angler tournament past midnight shows yesterday's "Final: 0 points", no Start until reload (angler.js:749) - b10.
5. Jam at 195x422 pads below the fold - b10.
6. Town Map markers bunch, labels overlap - b07.
7. Hero pick pop-in (~3.5 s placeholder) and ~25% black band above phone dungeon room - b12.
8. Browser Back with Menu open from Realm/Isles goes to Hub (open 3 rounds) - b15.
9. Deepdelve at 195x422 mostly HUD - b15.
10. Oakback golden-apple pace (about 15 min of waiting) - b05 balance.
11. Trial of Six full run unverified (fight 1 only reached; bot dies in 16.7 s) - b03. Needs a real-input pass.
12. Idle hero fell on landscape phone (seen once, b15 vs b08) - needs repro.

## P3 highlights
Town HUD ("Where to?" top-right, A/C 50x50), Realm HUD Daily/gear between thumbs, Realm ground red/purple tint, compass overlaps Next line and result headlines at 195 px, Stack result card overlap at 195 px, Dash duplicate goal/Run Again, Pop hint peeking, "Depth 5" at the Deepdelve surface, Stalk "You paid about 90" with 0 stalks, unnamed unknown backup key refuses whole file (b14), 3rd tap at ~450 ms can destroy wand (b02), HUD "Lv 20" for a seeded Lv 25 save (b03, to check), bare-page Tab stops without focus ring.

## Not verified (honest gaps)
Hit pause (ID-14), first-kill floor, Godlands elite, 45 s reward rule, cave retry, daily bonus payout, trophy kill, wall-turning wanderers, end-of-dive card, seed path trail, forge backup entry, Stalk buy/sell/rollover, Dash result tap guard, Town 55-remote crowd cull, 10-minute Realm soak (3.6 min done, flat). Most testers got well under 15 minutes of free play because the shared browser queue was saturated.
