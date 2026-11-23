# Art quality bar (Claude review, 2026-11-22)

Reviewed with the owner's concern "the GPT art looks pretty bad": contact sheets of b04, b08, b12, b31b plus in-game screenshots (Realm shore, crypt dungeon, Hearth Isle jungle beach, reef).

## Where the art is strong (this is the bar to match)
- b04 Mad Maze enemies (puffcap, bramble beetle, thistle archer, moth swarm, sprout slime, mothling): dark outline, 3-4 tone shading, readable silhouettes, consistent lighting from top-left, clear anim frames.
- b08/b09 armor, headgear, clothing icons: dense, crisp 32 px icons with a shared outline and a clear tier read.
- b19/b34b UI and crafting icons, b25 crypt tiles: consistent and clean in game (the crypt dungeon looks good).

## Where it falls short (redo or restyle)
1. b31b/b31a jungle creatures (vinecoil, canopy_glider, moth_lantern and the other small jungle species): flat fills, almost no outline, 1-2 tones, face drawn as a smiley. They read like placeholders next to b04. Needs the b04 treatment: dark selective outline, 3-4 tone shading, highlight, a readable pose.
2. b12 overworld props (trees, bushes, rocks, flowers, reeds): very small, flat, no outline; the trees look like lollipops. Needs outlined, shaded versions at 2x the pixel density with a ground shadow.
3. Terrain at phone zoom: Realm shore/grass/sand and the jungle floor read as large flat colour fields with hard stair-step edges. Needs more tile variation (6+ variants per terrain, noise/detail pixels, soft edge transitions) so large areas do not look empty.
4. Isles hero and small party creatures are tiny and low-contrast against the ground: add a 1 px light rim or darker outline so they pop.
5. Known earlier redo list: rimewolf too small and dark, stegolith/skimray up-view saddles are copies of the down view, i01 items-v2 colour budget too rich versus b19.

## Direction for every future batch (Codex)
- Match the b04 / b08 quality: dark outline (colour-matched, not pure black), 3-4 tone ramps per material, a single top-left light, a 1-2 px highlight, no flat fills, no smiley faces on creatures.
- Same palette family per biome (see reference/ and scales.json); effects separate; true back/side views.
- Deliver a side-by-side sheet next to one b04 sprite so the quality match can be checked at a glance.
- Priority redo order: b12 props, terrain variants (b10t/b30/b35), b31a/b31b small jungle creatures, then the older nits.

## Owner-supplied target (2026-11-22): GPT concept sheet `game/design/concepts/gpt-mounts-concept-1.png`
Skimray, Isleback Turtle and Rimewolf concepts from GPT. THIS is the richness we want for mounts, bosses and creatures: bold readable silhouettes, big shapes with 4-5 tone ramps, a clear colour accent per creature (teal veins on the ray, coral and a cargo deck on the turtle shell, bright frost ruff on the wolf), a visible saddle/cargo rig that says what the mount does at a glance, a consistent dark outline and top-left light, and a small in-game-size version under the big one. It is far above the current b31b/b12 flat sprites and above rimewolf b40c.
Production rules (from GPT's own note, adopted): the concept is a 3/4 pose for choosing direction only; the shipped sprites need clean TRUE down (front), up (back) and right (side) views with a SEPARATE saddle overlay per mount (`saddle_*`), at the native cell sizes in scales.json (mounts L96/XL128), checked at 1x and 3x. Start with Isleback Turtle (reads by function), then Skimray, then Rimewolf. Keep it original: use the concept for shape language and shading, do not copy another game's art.
