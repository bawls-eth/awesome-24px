# Art audit 3: weapon slot and minimap player marker corrections

This branch updates two native 24x24 RGBA pixel-art sprites without changing manifest IDs, dimensions, game code, or loaders.

- `b19-ui-icons/ui/ui_slot_weapon.png`: distinct diagonal sword with steel blade, gold guard, dark outline; no longer a duplicate of `ui_stat_power`.
- `b28-world-map-icons/ui/mm_player.png`: upward player-chevron with transparent padding, preventing icon-edge clipping.

Both use only colors from their existing batch palettes, hard pixel edges, transparent backgrounds, and 24x24 dimensions. Please check actual 390x844 gameplay HUD and minimap legibility. Run `node game/tools/art-audit/run.js` and the complete test suite before integrating. No game JS, HTML, tests, or Firebase files were touched.
