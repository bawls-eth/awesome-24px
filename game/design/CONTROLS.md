# Controls: one scheme for every game

Every Pixeltown game (town mini games, the Realm, the dungeon, Mad Maze) uses the same five
actions. The mapping lives in `game/shared/mm-input.js` (`MMInput`); games read actions from it
instead of hard-coding keys. There is no rebinding: one fixed scheme, so a player who learns it
once knows every game.

| Action | Keyboard | Touch | Gamepad (standard) |
| --- | --- | --- | --- |
| Move | WASD / arrow keys | stick, bottom left | left stick / d-pad |
| Primary (act, fire, confirm, jump) | Space / Enter | big button, bottom right | A |
| Secondary (alt action, ability, cancel-in-game) | Shift / E | second button, bottom right | B or X |
| Menu / Back / Pause | Esc / P | Menu button, top left | Start |
| Restart | R | Menu > Restart | Back / Select |

Rules:

- A game may keep extra keys (Realm abilities Q E R F, B bag, K board, Tab map) but every
  universal key must also work. Old keys stay; universal keys are added as aliases.
- Restart only fires where it is safe (a game-over screen, an open menu, a short arcade round).
  If R already means something in play (Realm Shield), R restarts only from the fall screen or menu.
- Keys typed into a text field are never read (`MMInput.isTyping`).
- One-line hint: build it with `MMInput.hint({ only, names })` so the text never drifts from the keys.
  Example: `WASD / arrows move · Space / Enter fire · Shift / E alt · Esc / P menu`.

## Touch layout (phones)

- Move stick: bottom left.
- Two buttons: bottom right, the big one (Primary) and a second one (Secondary), each at least
  56 px (`MMInput.TOUCH_MIN_PX`).
- Menu: top left.
- Nothing else sits over the thumbs: banners, toasts and HUD text keep clear of the bottom corners.
- Every other tap target is at least 44 px; text at least 12 px.

## API (`game/shared/mm-input.js`)

- `MMInput.actionOf(keyOrEvent)` -> `'up'|'down'|'left'|'right'|'primary'|'secondary'|'menu'|'restart'|null`
- `MMInput.keysFor(action)` -> the keys that trigger it
- `MMInput.create()` -> tracker: `press(k)`, `release(k)`, `held(a)`, `pressed(a)` (one-shot), `move()`, `read(pad)`, `clear()`
- `MMInput.attach(window, onAction)` -> tracker wired to key events; `detach()` removes it
- `MMInput.readPad(gamepad)` -> `{ move, primary, secondary, menu, restart }`
- `MMInput.hint(opts)` -> the one-line control hint (`{ touch: true }` for the phone wording)

## Where it is wired

- Realm (`game/realm.js`): P pauses / opens the menu, Shift = E, Enter fires like Space,
  R restarts from the fall screen or the open menu; the `#realm-help` hint is built from the mapping.
- Realm plaza and sites (`realm-world.js`): Shift interacts like E.
- Mini games: next session (their directories are being restyled).
