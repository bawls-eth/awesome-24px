# Research for the next slices (2026-11-21)

These notes come from generic web searches (search-result excerpts, not full reads), so treat the details as approximate.
Each section ends with the slices it shaped in `NEXT-SLICES.md`.

## 1. What keeps players in a RotMG-style loop
- Reviews and wikis credit three things: **the Nexus-to-realm loop**, the hunt for **rare bags** (the "white bag" moment), and
  **event bosses that open portals** to rarer dungeons. Bag colour marks rarity on sight: brown/pink/purple for common loot,
  blue for soulbound consumables, red/white for the best.
- **Abilities run on mana.** It regenerates, costs differ per ability, and magic potions refill it. So "when to spend" is a
  decision, not just a cooldown wait.
- Common complaints: the game gets repetitive once you are skilled, upgrades feel weak, and an empty Nexus feels dead. The
  developers also cut drops from easy minions so players would not just farm them.
- Takeaways: keep the bag rarity ladder visible, make bosses and events drop **keys and portals** (item events), add a
  **spendable resource**, and give quests a real bag rather than a number.
- Shaped: FX1/FO2 (focus), BK2/BL2 (boss key, lair), QB1/RB3 (quest bags, focus orbs, buff potions), CO2/CO3 (other heroes nearby).

## 2. Mobile twin-stick and bullet-hell controls
- Developer write-ups agree that touch is less precise than a mouse, so **aim assist is needed**. Aim should never snap: use
  sticky or soft assist, and add auto-aim only if that is not enough.
- Keep **actions during aiming to about 2, at most 3-4**, and allow remapping.
- How the joystick region is built matters as much as the art, and many virtual dual-stick games fail on that. Playtest
  control schemes early.
- Takeaways: we already have aim assist and two sticks. Do not add more mid-aim buttons. A focus cost does not add a button.
  Keep phone hints free of key names.
- Shaped: TQ1 (coarse-pointer copy), TU1/TU2 (teach the sticks first), AX2 (44 px targets).

## 3. Readability and telegraphs
- Bullet-hell guidance: even chaotic patterns need **gaps**. Treat bullets as terrain. Instant deaths feel unfair.
- Boss design advice: every attack **telegraphed and readable**. The player should lose to their own timing, not to bad visuals.
- Use **one shape language** for telegraphs across the game. Check it at the real camera zoom. A telegraph should still read
  **with the sound off**, and a fresh tester should be able to explain the cues after one run.
- Raise difficulty with density or speed, not randomness. Later phases add new patterns, not just more HP.
- Takeaways: a pure telegraph table (ring/line/cone; wind-up time by tier; bosses longer), a visual cue plus an optional sound,
  and one signature attack per biome boss.
- Shaped: TG1/TG3, BI1 (boss identity, PLAYTEST-REVIEW-2 #16), SF1 `warn` cue.

## 4. Accessibility
- Do not rely on colour alone: add shape, pattern or outline. Palette swaps are limited, so add extra signs first.
- Contrast: about 4.5:1 for normal text, 3:1 for large text, 7:1 for a high-contrast mode.
- Let players turn off **screen shake, flashes and blur**. Offer **scalable fonts and HUD size**; a commonly cited model lets
  players set HUD size, background and colour-blind mode.
- Reduce clutter and offer difficulty choices.
- Takeaways: `MMAccess` already has palettes and a contrast check, but no page uses them. Add one prefs key, a Realm settings
  sheet, bullet outlines, HUD scale, flashes off, and static telegraphs under reduce-motion.
- Shaped: AC1, AX2, TG3, S14 (status pips with "+n" text, not colour only).

## 5. Onboarding on phones
- Show, don't tell: interactive steps, little text, nothing front-loaded. Text-heavy tutorial steps are reported as a top cause
  of churn.
- Use contextual lessons triggered the first time a player meets a feature. One example splits onboarding into five short
  tutorials.
- Always offer **Skip** and an immediate retry. Measure where players stop.
- Takeaways: one coach mark at a time, completed by doing the action (move, aim, bag, ability, portal, Nexus), shown only once.
  Never block play.
- Shaped: TU1, TU2.

## 6. Retention without dark patterns
- A 2022 study ("Daily Quests or Daily Pests?") found players see daily rewards as motivating, as fear of missing out, or as a
  chore. The ethical line practitioners draw is **reward coming back, never punish missing a day**.
- Dark patterns include loss-aversion streaks, countdown pressure and paying to restore a lost reward. Random rewards aimed at
  children are flagged as a concern.
- Takeaways: count **total days claimed** (it never resets), give fixed rewards (no gacha), add cosmetic milestones, and use no
  timers or popups. Show the backup reminder only in the Lantern, as plain information.
- Shaped: GF1, GF2, LB3.

## 7. Performance on low-end phones
- Pool objects to avoid allocations and GC pauses, mainly for particles. How the pool is built matters.
- devicePixelRatio is a real cost: cap it (commonly at 2), trading sharpness for frame rate. Avoid CSS-scaling a large canvas.
- Profile on real hardware. Results depend on whether the canvas is GPU-accelerated.
- Takeaways: `realm.js` already caps DPR at 2 and has a resolution guard. Add a tiered low-end profile (DPR 1, fewer sparks and
  death ghosts, no terrain animation), a manual "Low graphics" toggle, and a regression check in the existing perf probe.
- Shaped: PF1, PF3.

## 8. Sound
- Readability advice says a telegraph must work with the sound off, so sound is an extra layer, not the only cue.
- Takeaways: short synth cues for portal, rare bag, boss awaken, warning and claim; ambience only when the player turns it on;
  nothing before a user gesture.
- Shaped: SF1, SA2.

## Sources (key takeaways above)
- Realm of the Mad God, Wikipedia: https://en.wikipedia.org/wiki/Realm_of_the_Mad_God
- RealmEye wiki, game objectives / FAQ / stat potions: https://realmeye.com/wiki/game-objectives , https://realmeye.com/wiki/f-a-q
- RealmEye forum, player complaints: https://www.realmeye.com/forum/t/what-are-your-problems-with-rotmg-as-of-current/75460?page=2
- RPGFan and PC Gamer reviews: https://www.rpgfan.com/review/realm-of-the-mad-god , https://www.pcgamer.com/realm-of-the-mad-god-review
- Dual-stick controls: https://gamedeveloper.com/design/everything-i-learned-about-dual-stick-shooter-controls ,
  https://gamedeveloper.com/design/virtual-dual-stick-controls-usability ,
  https://gamedeveloper.com/design/usability-expert-offers-best-practices-for-ios-twin-stick-shooters
- Telegraphs: https://gamedeveloper.com/design/enemy-attacks-and-telegraphing ,
  https://molbv.github.io/blog/2025-07-08-boss-phases.html ,
  https://gamineai.com/blog/enemy-telegraph-shape-language-top-down-boss-fights-fast-visual-consistency-audit-2026 ,
  https://itch.io/jam/bullet-hell-v/topic/3751351/bullet-hell-tips
- Accessibility: https://gameaccessibilityguidelines.com/basic/ , https://unity.com/blog/video-game-accessibility-basics ,
  https://www.alanzucconi.com/2021/05/24/accessibility-in-videogames/
- Onboarding: https://www.smashingmagazine.com/2014/04/rethinking-mobile-tutorials-which-patterns-really-work/ ,
  https://developer.apple.com/app-store/onboarding-for-games/ , https://create.roblox.com/docs/production/game-design/onboarding-techniques
- Daily rewards: https://research-portal.uu.nl/en/publications/daily-quests-or-daily-pests-the-benefits-and-pitfalls-of-engageme/ ,
  https://deceptive.design/articles/daily-quests-or-daily-pests-the-benefits-and-pitfalls-of-engagement-rewards-in-games ,
  https://bugnet.io/blog/how-to-design-daily-rewards-that-arent-manipulative
- Performance: https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas , https://web.dev/canvas-performance/ ,
  https://www.oreilly.com/library/view/html5-canvas-2nd/9781449335847/ch09s01s04.html ,
  https://discourse.threejs.org/t/animate-low-performance-on-mobile-with-window-devicepixelratio-resize/23628
