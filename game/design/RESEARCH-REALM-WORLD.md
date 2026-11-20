# Research: building a large Realm-style overworld (phone-first, free-to-play)

Method note: web access was thin. RealmEye wiki pages (the-realm, landmarks-and-setpieces) came back as search excerpts only; direct fetch of the-realm returned EMPTY. The Red Blob Games "rotmg-maps-webgl" page fetched OK but gave no size or tile numbers. Searches for RotMG Exalt mobile controls and for mobile twin-stick postmortems returned only generic guides (Game Developer usability pieces, Fortnite mobile options). Everything marked (approx) is from memory of public knowledge, not verified this session. Numbers for our game are recommendations, not facts about RotMG.

## 1. How Realm of the Mad God lays out its Realm

Verified from sources this session:
- Maps are generated from a pre-built set: the original authors used Amit Patel's 2010 mapgen2 (Flash) to make 13 maps that shipped with the game; rivers and biomes depend on the variant after the dash in the map seed (Red Blob Games "rotmg-map-seeds" and "rotmg-maps-webgl"). So the realm is not generated per boot; it is one of a small seeded set, then decorated.
- Bands: beaches and lowlands at the map edges, then midlands, highlands, then mountains (Godlands) in the centre; Godlands hold the strongest monsters (RealmEye "the realm"). Midlands/highlands share biomes (forest, desert, snow groves, ruins, oases); desert is rarer in highlands.
- Realm events spawn in mountains, highlands and occasionally midlands, and leave a setpiece behind afterwards (RealmEye "landmarks and setpieces").
- The Remaster "Realm Rework" (4.2.1.1) replaced this with beacons and a realm score; so even Wild Shadow moved away from the pure kill-quota model.

From memory (approx): map about 2048x2048 tiles of 8 px in the Flash client (very large vs. the screen, which showed roughly 15x15 tiles); about 85 players per realm, with a new realm opened when the others fill; Nexus is a small hand-made hub reached by pressing the Nexus key (instant), where you pick a realm from a server list; landmarks/setpieces (towers, ruins, shrines, caves) are hand-built stamps placed procedurally by biome and distance; monsters spawn in spawn regions as groups, scaled by player density, and despawn once nobody is near; the Oryx quota (enough god kills) closes a realm and drops players into Oryx's Castle, then the realm is regenerated. Dungeon portals come from boss kills and from rare world spawns, and expire after about 1 minute. The minimap shows explored tiles only; unseen terrain is black (fog is a per-tile "seen" bit, not true line of sight).

Takeaways for us: (a) hand-made stamps + noise terrain is the proven recipe; (b) a compact hub is what makes the loop work; (c) spawn by region and by nearby player, not globally.

## 2. Phone bullet-hell UX (mostly generic guidance; no RotMG Exalt data found)

Sources: Game Developer pieces on dual-stick usability and mobile FPS UX; a Nova Drift mobile review; the Fortnite mobile fire-mode options. Sizes below are our recommendation (approx), based on a 5-inch phone at about 360x640 CSS px portrait, 640x360 landscape.
- Stick reaches full input after only about 1 cm of thumb travel in one dev's analysis, so use a dead zone (0.15-0.2) and keep the radius around 48-60 CSS px. Floating sticks (spawn where the thumb lands) beat fixed ones for ergonomics and clutter.
- Aim never snaps hard; soft assist only: bias toward the nearest enemy inside a 12-15 degree cone, keep it off for bosses' telegraph targets.
- Auto-fire while the aim stick is deflected; offer a full auto-aim toggle for kids and accessibility.
- Ability: one 56-64 px button above the aim thumb, consumables 44 px minimum (platform minimum touch target is 44 px), at least 12 px gap. Rarely used actions (Nexus/recall) go in a menu, not on the main HUD.
- HUD: HP bar at least 160x14 px, top left; minimap 80-96 px top right, tappable to enlarge; text at 12 px or more; keep the central 60% of the screen free, because thumbs cover the lower corners.
- Performance (approx, no published numbers found): target 60 fps drawing 300-600 sprites on mid phones; cap enemy bullets at 250-400 live (our design already says 400), pooled; draw bullets from one atlas in one batch; cull everything off-camera; cap devicePixelRatio at 2 (1.5 on weak devices) and drop to 1 when frame time exceeds 20 ms for 2 seconds; avoid per-frame allocations and full-screen alpha overlays.

## 3. Generating a 256x256 island in the browser (parameters are our starting values)

Sources: Red Blob Games "terrain-from-noise: island shaping", "polygon map generation"; the gamedev.net "Procedural Islands Redux" blog. Domain warping was not covered by these sources; parameters here are from general practice (approx).
1. Elevation: fBm value or simplex noise, 5 octaves, base frequency 3 features across the map (scale about 1/85 per tile), lacunarity 2.0, gain 0.5. Domain warp: offset sample by a second noise of amplitude about 12 tiles, frequency 1/40. Radial reshape per Red Blob: `e = lerp(e, 1 - d, 0.45)` where d = distance from the centre normalised so 1 = map edge (square-bump or Euclid); keep a 12-tile ocean margin.
2. Bands (on a "difficulty" value, not raw elevation): `dist = hypot(x-c, y-c)/ (128-12)` giving shore 0.80-1.0, midlands 0.50-0.80, highlands 0.25-0.50, godlands 0-0.25. Jitter the thresholds with a low-frequency noise of +/-0.06 so borders are ragged, not circles. Spawn on the shore at a random angle.
3. Moisture: a second noise; biome = band x moisture (forest/meadow wet, dry grass/sand dry, snow high and cold).
4. Rivers: take 6-10 sources at elevation above 0.65 and moisture above 0.5; flow downhill by steepest descent (priority-flood to fix pits), carve a 2-3 tile wide channel with shallow water, stop at the sea. Min river length 40 tiles. Add 2-3 bridges where roads cross.
5. Roads: A* (or BFS on cost grid) between the spawn and 4-5 landmark sites, cost = 1 + 6*water + 3*slope; widen to 2 tiles, stone road in highlands and godlands.
6. Structures: Poisson-disc (Bridson) with radius per band: shore 16, midlands 20, highlands 24 tiles, 30 attempts per point; each point picks a stamp (camp, ruin, shrine, graveyard, tower) valid for its band; reject points on water or river. Reserve 6-8 event sites in highlands and godlands (these also host portals).
7. Props: blue-noise scatter at 1 prop per 10-14 tiles in grass, fewer near roads, none on stamps.
8. Rendering: split into 16x16-tile chunks (512 px at 32 px tiles). Draw each chunk once into an offscreen canvas (or Phaser RenderTexture), keep a cache of about 25 chunks around the camera (5x5), draw the cached chunks per frame, evict by distance. At 360x640 with zoom 1.5 you see about 12x20 tiles, so 3x3 chunks suffice. Autotile with the 16-edge sets the art queue already lists, falling back to flat colours if art has not landed.
9. Determinism: generate from a seed with mulberry32 (as REALM-DESIGN already requires); generation time budget under 250 ms for 65,536 tiles, done in one pass on a Uint8Array per layer (terrain, prop, zone), optionally in a Web Worker.

## 4. Loot and death loops, new points only
- Bag colour identifies rarity from a distance and sound confirms it; both are cheap and covered in REALM-DESIGN.
- New: a "loot reveal" delay of 0.3 s with a small pop on high bags; a visible "contributions" bar on events so players see their share of the reward; a daily rotating "hot zone" that boosts drop rate in one band (free, no purchase); death screen that shows the one thing that killed you (enemy name and bullet type), which teaches rather than punishes; and a "ghost grave" left at your death spot that other players can visit for a small free reward.
- No loot boxes: show every rate in the bestiary (already planned).

## 5. Build slices (each at most 1 hour of agent work; order gets a playable big map first)

1. `shared/mm-overworld.js`: seeded RNG + fBm + radial falloff + band map; Node test that same seed gives identical hash and spawn is on shore. Output a Uint8Array terrain + zone layer.
2. Same file: rivers and biome rules (moisture, rivers via downhill flow); invariants test (spawn reachable to godlands, no river into the spawn).
3. Same file: roads (A*) and Poisson-disc structure/event-site placement; export `sites[]`.
4. `realm.js`: replace the arena with a scrolling camera over the generated map, flat-colour tile fallback, collision on water and walls, touch stick movement. Playable big map.
5. `realm.js`: chunk renderer (16x16 chunks, offscreen canvas cache, cull). Measure on a throttled phone profile.
6. `shared/mm-art.js` loader: look up `tile_*`, `prop_*` by id with code fallback; swap in the autotile edge set when present.
7. `realm.js`: zone-based monster spawner (spawn cells 16x16, 8-20 tiles outside camera, cap 60 live, despawn at 30 tiles), reuse existing enemy and bullet pools.
8. `realm.js`: loot bags (soulbound-style per-player roll) and XP/level drop tables by zone tier.
9. `realm.js`: minimap with fog-of-seen tiles, quest arrow and event arrow, phone HUD sizes from section 2.
10. `realm.js`: world events (stamp + boss + announcement) from `sites[]`, boss drops dungeon portal.
11. `dungeon.js`: portal entry and exit, pass tier and seed to the Mad Maze generator, return to the same overworld position; Nexus menu (restart, new seed, hub).
12. Co-op: sync seed and event state only (host simulates events near players); everyone generates the same map locally. Save: additive keys under `pixeltown-save-v1` (`realm.seed`, `realm.pos`, `realm.fame`).

## 6. Risks and de-risking
1. Phone fps drops: chunk cache, bullet cap, DPR cap, a visible fps debug overlay, test on a 4x CPU throttle early (slice 5).
2. Generation hitch on load: budget 250 ms, move to a worker, show a loading card; cache the seed result in memory only.
3. Co-op sync on a big map: never send tiles or bullets; send the seed once, positions at 8 Hz within an interest radius of about 40 tiles, events as state flags; the map is deterministic so late joiners just regenerate.
4. Firebase load and cost on the LIVE database: no per-frame writes, rate limit, tests with `ADMIN*` bots only, no writes from research scripts.
5. Save compatibility: additive keys only, version flag inside the new keys, default values when absent, test loading an old save.
6. Art delivery lag (Codex queue b10-b15): code fallbacks for every id, loader reports missing ids in the console, tile renderer uses flat colours plus noise so the map ships without art.
7. Unfair difficulty (walking into the Godlands at level 1): zone edge warning banner, thick river or cliff rings, soft level gate through the quest arrow, 1 second invulnerable respawn at spawn.
8. Scope creep from merging Realm and Mad Maze: keep the old arena and maze as modes until the overworld passes the full test run (`node game/tests/run-all.js`); never remove features.

Sources used: RealmEye wiki (the-realm, landmarks-and-setpieces, search excerpts only), Red Blob Games (rotmg-maps-webgl, rotmg-map-seeds, islands, polygon-map-generation), Remaster 4.2.1.1 Realm Rework post, gamedev.net Procedural Islands Redux, Game Developer dual-stick usability articles, Nova Drift mobile review (finalboss.io), Fortnite mobile guide.
