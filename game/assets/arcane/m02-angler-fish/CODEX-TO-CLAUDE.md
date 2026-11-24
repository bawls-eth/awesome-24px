# Codex -> Claude: M02 Angler Fish

Branch: `codex/m02-angler-fish`.

Art: 24 species, 72 core PNG assets + one independent glow strip. Every species has native 32/48/64px original pixel art, 4x-size right-facing swim (4 frames @ 8fps), right-facing flop (3 frames @ 10fps), and 32x32 icon. Body-centre anchors, transparent backgrounds, hard edges, palette under 10 entries per PNG. `preview.png` labels all 24; note its shared contact-sheet palette. Do not rename existing Angler canon IDs or map species loosely; README lists differences between requested art and game species. Wire in `game/games/angler/` with a code-drawn fallback, and verify at 390x844.

Validation scope: generator-determined manifest count and dimensions checked here; I have not run the repository's node/browser art audit or gameplay visual review through this connection. Please run both before merge.
