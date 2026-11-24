# Round 4 decisions (noncritical calls made by the dev team, per ROUND4.md)

One section per decision. Add yours at the end (keep each entry short: what, why, what would change it, who).

## D5-01 (O-08, b13-r2-12, b15-07): Arcane Frontier ships as a "Coming soon" card, not a repaired game

**Decision.** `game/games/arcane-frontier/index.html` is now a styled 8-bit "Coming soon" card with a Home (Hub) link and a Town link.
No Hub card and no Town door were added (ROUND4 rule: an entry point only when the page really works). The asset pack, `manifest.json`,
`GAME_BUILD_PROMPT.md` and the three scaffold scripts (`js/config.js`, `js/data.js`, `js/util.js`) stay in the repo untouched; the page
does not load them.

**Why the scaffold was not salvageable in the ~40 minute budget (audit, D5, 2026-11-23).**
- `index.html` referenced 17 scripts and 1 stylesheet. Only 3 scripts exist (510 lines: constants, data tables, small helpers).
  Missing: `style.css` and `assets.js audio.js save.js input.js map.js fx.js combat.js items.js player.js enemies.js bosses.js ui.js world.js main.js`.
- `git log --all -- game/games/arcane-frontier` has three commits (12549c4 asset pack, c66bc46 "WIP: index.html and data/config/util
  scaffolding", 958fd57 favicon). The 15 files were never committed on any branch, so there is nothing to restore: "repair" means
  writing the whole game (engine loop, map generation, combat, 8 bosses, inventory drag and drop, save, touch twin-stick, audio, HUD CSS).
- `GAME_BUILD_PROMPT.md` describes a full action RPG (10 classes, 24 enemies, 8 bosses, loot, zones). The DOM in the old page expects all of it.
  A stub that boots Phaser and shows a class picker would be a second broken page, not a fix.
- The old page also loaded Phaser from a CDN (third-party request, fails offline) and disabled pinch zoom (`user-scalable=no`).
- The art is marked "static prototype sprites, not finished production art" in its own README, so even a working build would miss ART-QUALITY-BAR.

**What the card does.** Zero failed requests, zero console errors, no third-party request, no script from the scaffold, no storage access,
no database traffic. Works at 1280x720 and 390x844 (no scroll in either), targets 48 px high, keyboard order Home then Town with the
shared yellow focus ring, one `<main>`, one `<h1>`, named `<nav>`, alt text, contrast >= 4.5:1, reduced motion safe, zoom allowed.
Test: `game/tests/beta-r4-arcane-soon.test.js` (three replays: desktop load, phone tap Home -> Hub, keyboard + a11y). The existing
`beta-s14-favicon.test.js` still passes (favicon link kept).

**No feature removed.** The page was linked from nowhere (NAV-AUDIT row 20) and never ran. `<meta name="robots" content="noindex">` added (NAV-AUDIT advice).

**What would change this.** A real build of the game (its own slice, with production art from the Codex queue). Then: restore a game page,
add the Hub card, and replace the test's "Coming soon" asserts with a boot + first-fight replay.
