# Angler bug bash notes

Fixed (tests in game/tests/angler-bugbash.test.js):
- Status message and boss bar overlaid the bottom of the reel strip (low tension zone hidden on phones). Now below the scene.
- Landscape phone squeezed the scene to about 24 px. Page now scrolls and the scene keeps >= 250 px.
- Keys: only Space worked. Now MMInput: Enter/Space primary, Shift/E next spot, Esc/P close panel or Menu, R cast again from a result.
- Chip voices (splash, bite, reel, miss, catch, chest, boss), Settings mounted (Menu > Settings), pre-game card (33 words), MMMiniKit result card with stats, medals and next goal.

Open / elsewhere:
- Fish colours use hsl(), not the 16-colour MM8 palette (low severity, art).
