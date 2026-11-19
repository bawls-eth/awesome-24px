# GAME BUILD PROMPT — ARCANE FRONTIER (original working title)

You are a senior 2D action-RPG engineer, game designer, technical artist, and UX designer. BUILD A RUNNABLE GAME, not a mockup, pitch, or static menu. Create an ORIGINAL top-down pixel-art action RPG inspired by the MECHANICAL FEEL of the user-provided Realm of the Mad God screen recording, without copying its maps, characters, names, art, sounds, logos, interface layout, or proprietary assets. This is a new game completely unrelated to the earlier flora/fauna or landscape world; do not import or reference those packs.

## IMPORT THESE ASSETS FIRST
Read manifest.json in this zip. Load all 100 transparent 32x32 RGBA PNGs at their exact paths under assets/. There are 10 heroes, 24 enemies, 8 bosses, 20 terrain tiles, 12 props, 16 equipment sprites, and 10 effect sprites. There is also a 10x10 raw spritesheet and a labeled preview catalog. Treat these as original low-resolution placeholder assets: preserve nearest-neighbor rendering, no texture filtering/blurring. The PNGs are static visual sprites, NOT pre-made animation frames or working code. Derive animation with code (position, rotation, scale, separate limbs if feasible) or add authored frames later. Keep sprite IDs and paths unchanged.

## PRIMARY GAMEPLAY LOOP
1. Enter game -> class selection -> spawn in safe hub -> exit to hostile zone -> fight while moving/dodging -> gain experience and drops -> equip upgrades -> return to hub via portal -> unlock progressively harder zones and dungeon bosses.
2. The feeling should be immediate and responsive: real-time WASD movement with normalized diagonals, aim with cursor, left mouse press/hold to fire at an explicit rate, right mouse or hotkey for class skill, space to dodge-roll with short invulnerability and cooldown, E to interact, I for inventory, Tab for map, Esc for pause.
3. Camera follows player smoothly at a consistent top-down angle (orthographic). Optional Q/E camera rotation only if it does not conflict with interact; default disable rotation for clarity. For portrait/mobile, provide twin-stick controls and equivalent tap interactions.
4. Bullets/projectiles have clear visible speed, direction, collision, damage, lifetime, and despawn. Enemy patterns include aimed shots, radial spreads, fans, spirals, delayed volleys, dashes, and telegraphed area zones. Telegraphing must be readable before damage is applied.
5. Combat must reward positioning, pattern recognition, risk management, and dodge timing. Include impact feedback, hit flash, enemy HP bars (when damaged), loot pickup, damage numbers (optional), hitbox sizes smaller than visual silhouettes, and a 0.3 s grace period after normal hits. Do not reproduce unfair unavoidable patterns.

## REFERENCE RECORDING — SPECIFIC OBSERVED ELEMENTS
The uploaded video shows class creation/selection, a safe/tutorial setting, tile-based stone corridors and wooden-floor rooms, blue water areas, fast movement from room to room, cursor-directed combat with projectile patterns, a top-right minimap, compact status/inventory side panel, and a hub-like area with multiple characters. Use these as FUNCTIONAL references, NOT as instructions to copy visual assets or interface placement exactly. The footage is about five minutes; it does not establish full endgame balance or online networking requirements.

## PLAYER AND CLASSES
Implement class-select with the 10 hero sprites. At minimum make three meaningfully distinct playable on day one: Vanguard (tough short-range cone attack), Ranger (fast arrow projectile), Arcanist (slower high-damage magic bolts). Other seven can have data-driven prototypes: Guardian, Duelist, Pyromancer, Frostbinder, Shadowblade, Cleric, Stormcaller. Character stats: HP, mana/energy, movement speed, attack speed, projectile speed, base damage, armor, crit chance, dodge cooldown. Level 1 to 20 with XP curve; save progress locally. Class identity should show through animation and projectile color, not labels alone.

## WORLD
Use an orthographic tilemap at exactly 32 logical pixels per tile. Create at least: (a) safe hub with class podiums, portal and healing shrine; (b) outdoor grass/dirt forest area with trees and wolves/slimes; (c) dungeon of stone floors, walls, crates, skeletons and a boss gate; (d) optional snow/sand/lava arenas using the corresponding terrain. Tilemap must have coherent blocked/solid tile metadata and spawn rules. Terrain art is prototype tile art; transitions and seamlessness may need runtime edging. Doors and bridges can be drawn procedurally if not in the asset pack.

## ENEMY AI
Data-drive enemy behaviors from IDs in manifest: chase, keep distance, patrol, ambush, stationary caster, orbit, burst-charge, flee when low HP. Add line-of-sight, aggro radius, separation, health, damage, telegraph timings, cooldowns, and weighted loot tables. Spawn only within appropriate zone and away from immediate player overlap. Provide at least 5 enemies with distinct behaviors initially and 1 boss with two attack phases. Boss health scales gently; telegraph radial bullet patterns. Keep all projectile hazards avoidable.

## LOOT, INVENTORY, EQUIPMENT
Equip slots: weapon, armor, head, offhand, consumable. Inventory grid at least 5x4, drag/drop, item stat tooltip, rarity colors (common, uncommon, rare, epic), pickup prompt, gold/XP. Weapons change rate, speed, damage and projectile look. Consumable potion_health restores HP and potion_mana restores energy with cooldown. Use the 16 equipment asset IDs. Do not invent a cash store, gambling monetization, or pay-to-win.

## UI/UX
Dark neutral fantasy UI with a distinct original layout: primary HP/MP bottom-left; ability cooldown and equipped item bar bottom-center; minimap top-left or expandable corner; character sheet and inventory in collapsible right-side panels; readable enemies and cursor telegraphs. Responsive from 1080p desktop down to mobile; safe area padding. Character select screen includes 10 classes, selected-class preview, stats and Play button. Provide readable tutorial hints for WASD, aim, attack, dodge, interact, inventory.

## TECHNICAL IMPLEMENTATION
Prefer the existing project stack if supplied. Otherwise implement in Phaser 3 + TypeScript (Vite). Run at 60 FPS with delta-time movement, fixed or predictable simulation steps where practical; spatial hashing or efficient collision; pooled projectiles/particles; sensible draw order and no oversized scene graphs. Separate assets, config/data, player, input, combat, enemies, AI behaviors, map, UI and save modules. Use an explicit world coordinate convention. All asset paths must come from manifest IDs; fail loudly if missing. Provide package.json, all source code, start command, and a ready-to-play preview.

## ORIGINALITY AND SAFETY
Do NOT use actual Realm of the Mad God game assets, names, dungeon layouts, music, trademarked logos or screenshots inside the game. Only use its broad genre mechanics and the user's recording to understand desired responsiveness. All 100 included sprites are original lightweight placeholder drawings and should be improved consistently later.

## ACCEPTANCE CHECKLIST — REQUIRED
- App starts directly into class-select and can enter playable hub.
- Player moves in 8 directions and cannot pass through solid walls.
- Mouse aims and hold-to-fire works; collisions remove projectiles and apply damage.
- At least 5 enemies spawn with behavior differences; one boss attacks in telegraphed phases.
- 3 classes have unique basic attacks and skills; all 10 are selectable or clearly tagged prototype.
- HP/MP HUD, minimap, inventory, loot, XP, level-up and local save load correctly.
- 100 sprite paths resolve through manifest with no 404s.
- Scaling is crisp and pixelated; no unexpected blur.
- No console errors or obvious physics tunneling.
- Provide quick play instructions and a list of incomplete/stretch systems.

IMPLEMENT IN PHASES: (1) boot + assets + walkable hub; (2) shooting + collisions + 5 enemies; (3) boss + loot + stats; (4) screens + persistence + polish. At every phase retain a runnable build. Do not substitute screenshots or a static Figma prototype for code.
