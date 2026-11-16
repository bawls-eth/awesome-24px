# Pixeltown roadmap — ideas backlog

A big brainstorm of possible future revisions and expansions, organized by
area. Nothing here is built yet — it's a menu to pick from. See
`CHANGELOG.md` for what's already shipped.

## 1. New activities & minigames

1. Villager fishing tournament — timed event, biggest catch wins a ⭐ bonus
2. Bug-off event — catch-the-most-bugs contest with a live leaderboard
3. Scavenger hunt — a daily hidden item somewhere in town, first to find it wins
4. Snowball fights / seasonal minigame tied to the seasonal tint
5. A simple maze or obstacle course with a timer
6. Tag / hide-and-seek mode toggle for a session
7. A rhythm minigame tied to K.K. Slider's concert (tap on beat)
8. Treasure map items — dig at a marked spot for a one-time bonus
9. A racing minigame using the existing D-pad controls
10. Trivia questions from Professor Byte with small rewards
11. A cooking/recipe minigame using gathered resources
12. Ice fishing variant in winter (seasonal tint tie-in)
13. A pinball or arcade cabinet inside a building
14. Rock-paper-scissors challenge vs. another player for stars
15. A balloon-popping event (floating prize balloons, rare items inside)

## 2. World & map expansion

16. A third zone (north or south) with new terrain (desert, snow, cliffs)
17. Bridges/stairs for multi-level terrain (cliffs like real AC)
18. A dock/pier extending into the pond
19. An island reachable by boat (new minigame: boat travel)
20. A town hall building with its own interior
21. Interior spaces for existing buildings (shop, museum) you can walk into
22. A greenhouse building for flowers specifically
23. Street lamps that light up at night
24. A windmill or lighthouse landmark
25. Benches and sittable decor scattered around town
26. A proper road/path network with sidewalks
27. Bigger pond with an island in the middle
28. A graveyard/spooky corner tied to the zombie species
29. A rooftop/balcony area accessible via stairs
30. Seasonal map decorations (snow piles in winter, falling leaves in autumn)

## 3. Villager & NPC depth

31. More resident NPCs, each near a different landmark, each with their own
    personality and line set (not just Professor Byte)
32. NPCs that wander instead of standing still
33. NPC daily schedules (different NPC at different times of day)
34. A "friendship" counter per NPC that unlocks longer dialogue over time
35. Random visiting villager events (a traveling guest for the day)
36. NPCs that react to weather ("ugh, it's raining again")
37. NPCs that comment on your outfit if you just changed it
38. A quest system — small fetch/delivery tasks from NPCs for rewards
39. NPC reactions to player achievements (congratulate you in chat)
40. A mailbox system — NPCs leave you letters with flavor text or rewards

## 4. Social & multiplayer

41. Friends list / persistent "besties" beyond the current walkie-talkie pick
42. Player-to-player trading (give resources/stars to another player)
43. A group photo mode — tag nearby players into the same screenshot
44. Visible player count / "X villagers online" on the join screen
45. A simple reaction/like system on chat messages
46. Private whisper messages (DM another player)
47. A guestbook — leave a signed note for others to read later
48. Co-op fishing tournament scored across all online players
49. A "follow" command so one player can tail another automatically
50. Team-based events (split players into two groups for a contest)
51. Voice memo replies (extend the existing walkie-talkie system)
52. A simple moderation/report flow beyond the client-side slur filter
53. Visitor log — see who's visited your town today (Firebase-backed)
54. Shareable "town card" screenshot with your stats for socials
55. Cross-device sync of local save via an optional login (bigger lift)

## 5. Customization & progression

56. Furniture placement inside buildings (not just outdoor build-mode blocks)
57. Hats/accessories layered on top of the base species sprite
58. Player-chosen town name shown somewhere in the HUD
59. Unlockable color variants for build-mode blocks (paint the walls/fences)
60. A "title" system — equip an achievement as a badge next to your name
61. Pet/companion that follows you around (cosmetic only)
62. Player housing — a small plot you can decorate that's yours alone
63. More hairstyles/outfits beyond species swaps (recolors, accessories)
64. A customizable player flag/banner you can place
65. Seasonal/limited-time outfits tied to real calendar dates (e.g. Halloween)

## 6. Economy & shops

66. A second currency (Bells alongside Stars) for a deeper economy
67. Interest/bank system — deposit stars at the shop, earn a little over time
68. Daily deals — one random resource sells for bonus stars each day
69. A crafting system — combine resources into higher-value items
70. Expand the Mystery Merchant to sell more than outfits (decor, recipes)
71. A stock-market-style event for turnips with bigger swings on rare days
72. Bulk-sell discount/bonus for selling 10+ of one resource at once
73. A pawn shop that buys fossils you don't want to donate
74. Loyalty rewards — bonus stars for consecutive days of selling
75. A lottery/raffle using stars, separate from Polyroll

## 7. Seasonal & events

76. Real holiday events (Halloween costumes, winter lights, etc.) tied to
    the actual calendar date, not just the existing month-based tint
77. A fireworks show on a special night, synced via the deterministic hash
78. A birthday system — your villager has a "birthday" players can celebrate
79. Limited-time visiting shops during holidays
80. A harvest festival tied to the flower/fruit systems
81. An anniversary event each year the game's been live
82. Weather variety beyond rain — fog, snow, wind effects
83. A meteor shower event with a wish-granting minigame
84. Spring cherry blossoms falling as a particle effect
85. A "town fair" event combining several minigames into one night

## 8. Build mode & decor

86. More block types beyond wood wall / stone fence (hedge, flower box, path tile)
87. Rotatable/directional blocks (corners, not just squares)
88. A blueprint/undo system for build mode
89. Shareable build templates other players can copy
90. Decorative-only objects that don't block movement (lamps, signs, pots)
91. A "town rating" score based on how much is built/decorated
92. Seasonal decor unlocks (pumpkins in autumn, lights in winter)
93. Bigger block cap with a visible "town capacity" meter
94. Colored paint bucket tool to recolor placed blocks
95. A dedicated "garden" build mode for arranging flowers precisely

## 9. Mobile / UX polish

96. Swipe gestures as an alternative to the D-pad
97. Customizable HUD layout (drag panels where you want them)
98. A settings menu consolidating sound/haptics/tilt into one place
99. Colorblind-friendly palette option
100. Adjustable text size for chat/HUD
101. A minimap showing nearby landmarks and players
102. Quick-chat phrases (tap a preset message instead of typing)
103. Better onboarding — a short interactive tutorial for first-time players
104. Remember last-used emote for quicker access
105. A "reduce motion" toggle for anyone sensitive to the bobbing/tweens

## 10. Technical, performance & reliability

106. Move from Firebase Realtime Database to Firestore for better querying
107. Add proper authentication (optional) instead of the wide-open DB
108. Rate-limit block placement server-side, not just client-side chat
109. Automatic stale-player cleanup via Cloud Functions instead of only
     client-side disconnect hooks
110. A lightweight analytics pass (anonymous, opt-in) to see which features
     get used
111. Service worker for offline-capable asset caching
112. Compress/sprite-atlas the many species sheets for faster load
113. Unit tests for the achievement/resource logic
114. A staging Firebase project separate from production for safer testing
115. Error reporting/monitoring for production issues

## 11. Accessibility

116. Full keyboard navigation for every menu (outfit shop, Polyroll, etc.)
117. Screen-reader-friendly labels on HUD buttons
118. High-contrast mode
119. Subtitle/caption option for the walkie-talkie voice clips
120. Configurable control remapping

## 12. Audio & visual polish

121. More SFX variety (different catch sounds per resource type)
122. Ambient background music (opt-in, since SFX currently has none)
123. Species-specific idle animations beyond the walk cycle
124. Water ripple effects near the pond
125. Dust/footstep particles while walking
126. Dynamic shadows that shift with the day/night cycle
127. A title-screen animation on the join page
128. Parallax background layers for a sense of depth

## 13. Meta / quality-of-life

129. An in-game "what's new" popup summarizing the latest update
130. A changelog viewer inside the game itself (not just the repo file)
131. A feedback/bug-report button that opens a prefilled GitHub issue
132. Keyboard shortcut cheat-sheet accessible via a HUD button
133. A "randomize my look" button in the outfit shop
134. Export/import your local save as a file (backup/restore)
135. A practice/sandbox mode with unlimited resources for testing builds

---

That's 135 concrete ideas across 13 categories — a solid backlog rather
than padded filler. Pick a category (or specific items) and I'll turn it
into a real implementation plan.
