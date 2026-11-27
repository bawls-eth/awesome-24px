# Cycle 16 G (Graphics / Pixel Art), branch cyc16-art, port 9103

## Item 1: Realm shop / backpack icons look like old art

Finding: ITEM_ICON_MAP in game/shared/mm-art.js was already correct. All 7 base items resolve to the newest matching art that exists
(b07 wand_spark / wand_ember, b09 accessory pixel icons); no newer wand / charm / ring art exists in any manifest (searched every
game/assets/arcane/*/manifest.json; i01 and b22 have none, b29 only has wpn_icon_wand_burst, a different item). So no mapping change and no new icons were needed.

Real cause: the Town's own Realm (game/main.js, enterRealm) never attached item art. game/index.html did not load shared/mm-art.js and main.js never
called setItemArt, so the Town Realm shop / backpack showed emoji (the Mad Maze embed, which does attach it, showed the art: verified before at 390x844, img/cyc16-art-shop-before.jpg).

Change: game/index.html loads shared/mm-art.js; main.js attaches MMArt.loadItems('assets/arcane/') to the Town realm right after construction
(same ItemSet, honours ?itemart=0, never throws). Save format untouched.

Check run: game/tests/cyc16-art-town-realm-item-art.test.js (registered in test-tiers.json): Town Realm at 390x844 and 1280x720, offline ADMIN bot:
ItemSet attached, shop shows 32px art for all 7 items resolving to the expected files, backpack rows show art, no horizontal scroll, 0 db attempts, no
page errors / 404s; ?itemart=0 keeps emoji. Result with the fix: ALL PASSED (16 checks). With index.html and main.js reverted: 9 FAIL lines (confirmed fails before).
Screenshots: img/cyc16-art-town-shop-390x844.jpg, img/cyc16-art-town-shop-1280x720.jpg (before shot of the embed: cyc16-art-shop-before.jpg).
Not run: the existing item-icons.test.js (Mad Maze embed path unchanged).

## Item 2: tarantula as code art (game/shared/mm-town-fauna.js)

Original 16x16 code art (generated with a small Bresenham layout script, pasted as literals like cycle 15): true profile and true front view
(head at the bottom, legs splayed), 2 frames per idle / move, warm hair tips, rose abdomen marks, cream fangs. Same SPECS/CODE pattern as the salamander; the
?ffstrips=0 fallback keeps the SVG.

Cull budget (measured with an offline Town, standing still, 80 passes each, objects ~978):
- before (no tarantula art): default 197.5 measured per pass, 187 Sprites (my own measure of the final build with the tarantula not wired is identical: it is staged).
- after, default: 197.5 (20.2%), 187 Sprites, tarantula still 5 SVG images. Town sprite count NOT raised.
- after, ?ffstaged=1 (daddy longlegs + tarantula both wired): 209.6 (21.4%), 197 Sprites. Under the 215 cap, but over the cyc14 rooted test's 200.5 line.
So like the daddy longlegs, the tarantula is STAGED (flag `staged: true`): its art ships, it is wired only with ?ffstaged=1. Making it default needs a budget decision (see proposals).
Note: "before" was not run on a separate checkout; default after equals default before because the species is not baked by default (asserted by the test).

Check run: game/tests/cyc16-art-tarantula.test.js (registered): default and ?ffstrips=0 keep the SVG (no Sprite, not in ffStrips); ?ffstaged=1: 5 Sprites on
fft_tarantula, 16 px, no semi-transparent pixels, >= 7 colours, eyes, 4 distinct 2-frame animations, front view differs from profile. ALL PASSED (9 checks).
It could not "fail before" in the usual sense for the default-path checks (they describe unchanged behaviour); the ?ffstaged=1 checks fail before (no fft_tarantula texture).
Also run after the change: cyc9-lead-town-cull-pin (ALL PASSED, 198 measured) and cyc15-art-forest-floor (ALL PASSED).
Screenshot: img/cyc16-art-tarantula-1280x720.jpg (6x zoom, front view, ?ffstaged=1). The 390x844 viewport was not separately screenshotted for the tarantula (the sprite is world art, identical at any viewport).

## Unresolved
- The tarantula profile view is dense (legs fill the 16 px width); it reads as a hairy spider but is the weaker of the two views. Not polished further in the time box.
- If the owner's "old art" report was about something other than the Town Realm emoji (e.g. a different item list), it is not reproduced here.
- The full stamp was not run (coordinator runs it).

## Proposals
- Decide the cull budget for the staged species (daddy longlegs, tarantula): either raise the cyc14 line, or reduce specimens for the land animals that are still 5 each, or let far, resting specimens stay Images (the rooted mechanism) so both can ship by default.
