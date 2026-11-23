# Settings wiring (shared chrome, branch chrome-8bit)

One Settings panel for every page: `game/shared/mm-settings.js` + `mm-settings.css` (8-bit, on the MM8 theme `mm-8bit.css`).
Groups: **Play** (one-thumb, auto-fire, tap-to-hold aim, aim assist, bullet shapes), **See** (text size, reduce motion, screen flashes,
low graphics, high contrast), **Hear** (sound, music), **Help** (controls cheat-sheet + the Feedback box).
Test: `game/tests/shared-mm-settings.test.js` (fixture `game/tests/fixtures/settings-fixture.html`).

## Keys (nothing renamed, nothing removed)
| Setting | Storage | Notes |
|---|---|---|
| One-thumb | `mm-auto-fire` + `mm-aim-toggle` both `'1'` | same as `realm.setOneThumb()` |
| Auto-fire / Tap to hold aim / Bullet shapes | `mm-auto-fire`, `mm-aim-toggle`, `mm-bullet-shapes` | `'1'`/`'0'` |
| Aim assist | `mm-aim-assist` | default ON (`!== '0'`), as in realm.js |
| Text size | `pixeltown-access-v1.hudScale` (1, 1.25, 1.5) | other fields (palette, bulletOutline) kept; cleaned by `MMAccess.prefs` |
| Screen flashes / Low graphics | `pixeltown-access-v1.flashes`, `.lowGfx` | |
| Reduce motion | `mm-reduce-motion` (MMMotion override) | default follows the OS |
| High contrast | `mm-high-contrast` | NEW additive key |
| Sound | `mm-sfx-muted` (inverted) | same key as sfx.js |
| Music | `mm-music` | NEW additive key (sfx.js `setMusic` has no stored key yet) |

`apply()` runs on load and after each change: `<html>` gets `--ui-scale`, `data-reduce-motion` (+ class `reduce-motion` for MM8),
`data-low-gfx`, `data-high-contrast`. The save `pixeltown-save-v1` is never touched.

## Call-site changes needed next session (files owned by other agents, NOT edited here)
Add to each page, after `mm-access.js` / `mm-feedback.js`:
```html
<link rel="stylesheet" href="../shared/mm-8bit.css"><script src="../shared/mm-8bit.js"></script>
<script src="../shared/mm-settings.js"></script>
```
then `const S = MMSettings.mount({ page: '<page>' });` and open it from the Menu sheet's Settings entry (`mm-nav.js`, owner: hub agent:
the `mm-nav-settings` item should call `S.open()` when `window.MMSettings` exists, else keep today's behaviour).

Live effect of a change: listen to `window` `'mm-settings-change'` (`detail: {id, value}`) and call the page's own setter:
- `game/realm.js` (Realm / Mad Maze): `auto-fire` -> `realm.setAutoFire(v)`, `aim-toggle` -> `setAimToggle(v)`, `one-thumb` -> `setOneThumb(v)`,
  `bullet-shapes` -> `setBulletShapes(v)`, `aim-assist` -> the existing aim-assist toggle, `sound` -> `sfx.setMuted(!v)`, `reduce-motion` -> `MMMotion`,
  `low-gfx` -> re-read `window.__mmPerf` / `_readLowGfx()`, `text-size` -> `_syncTxtFont()`.
- `game/games/mad-maze/mad-maze.js`: its own `#mm-settings` dialog stays (tests rely on it); add a "More settings" button there that calls `S.open()`,
  or replace its body by `MMSettings` once its tests are moved to the new ids (`#mmset-*`). Do not remove its ids before that.
- `game/main.js` (Town), `game/games/isles/isles.js`, hub, Angler, Jam, Stalk, Deep Delve, Festival: mount once, wire `sound`/`music`
  to their sfx instance (`setMuted`, `setMusic`), and keep their current feedback mount (the panel also has one in Help; pass
  `feedback: false` to `MMSettings.mount` on pages whose settings already mount `MMFeedback`).
- Phone layout: the panel starts 64 px below the top (Menu button row) and leaves 8 px at the bottom; toasts (`MMSettings.toast(msg)`)
  sit under the Menu row, centred, never over the stick (lower-left) or fire button (lower-right). Tooltips: `data-mm-tip="text"`.
