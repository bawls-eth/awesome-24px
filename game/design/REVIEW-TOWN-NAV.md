# Review: live Town + shared nav/feedback UI since c899a2a

Read-only review (no code changed). Scope: `game/index.html`, `game/main.js`, `game/style.css` (Where to?, gate pointer,
join Continue, gate menu, dock sign + arrival spot, postcards, arrival puff, Town low tier), `game/shared/mm-nav.{js,css}`,
`game/shared/mm-feedback.{js,css}` (Town / Realm / Isles mounts), `game/tools/feedback-triage/triage.js`, `game/hub/*`,
`game/shared/profile.js`, `game/shared/mm-backup.js`.

Verified by reading code plus node snippets against the pure modules (no browser, no network, no DB):
mm-nav `urlFor` / `continueTarget` / `backTarget` / `safeHref` / `clean` fuzzed with `javascript:`, `//host`, off-origin
referrers, `__proto__`, oversized and HTML-bearing values: no off-origin or scheme href, no `<>` in labels, oversized
state goes back to the defaults. triage.js `renderInbox` -> `parseInbox` round-trips `<br>`, `|`, backticks, `&lt;`,
`&#124;`, backslashes and newlines without loss.

## Summary

| ID | Sev | Where | One line |
|----|-----|-------|----------|
| T1 | **P0** | main.js:4555-4558 (mount), 1819-1823, 2453-2454, 8816-8821, 9018-9021 | Typing in the Town feedback textarea fires Town hotkeys: digits send `net.emote` (live DB write), Enter moves focus to chat so the next Enter **posts the note to public chat**, `T` can start a walkie recording that is sent to the bestie, E/G/B/M/WASD act in the world |
| I1 | P1 | games/isles/isles.js:2454-2470 (mount at 2107) | Same bug on the Isles page: W/A/S/D/arrows/Space are `preventDefault`ed (cannot be typed), `L` closes the log that holds the box, K/B/M/F/G etc. act |
| N1 | P2 | shared/mm-nav.js:329 | The sheet swallows `keyup`: a key held when the sheet opens stays "down" in Phaser after it closes (player walks on by itself) |
| N2 | P2 | main.js:3241, 3381, 3416 | The nav sheet is not closed when a Realm invite pops (z 100000 over the sheet) or when the Realm embed opens; Tab stays trapped in the hidden-behind sheet, and the sheet is still open on return |
| N3 | P2 | main.js:2247 (gamepad), canAct() 2379 | Gamepad / tilt input is not blocked while the sheet is open (movement and A=interact run behind it); `canAct()` does not check `MMNav.isOpen()` |
| F1 | P2 | shared/mm-feedback.js:294-299, 331-366 | Delete and Copy/Download use the in-memory state: with two tabs open, a Delete in tab A drops a note saved meanwhile in tab B; an export can miss it |
| P1x | P2 | main.js:3045-3051, index.html postcards-overlay | Postcards overlay says `role=dialog aria-modal` but focus is not moved into it or returned, and there is no Tab trap |
| H1 | P2 | hub/gift.js:18-27 | Hub writes `pixeltown-save-v1`.realm.shards; a Town tab that already built `this.realm` writes its older realm back on the next onSave (lost shards). Additive and guarded, but a cross-tab last-writer-wins |
| R1 | P2 | tools/feedback-triage/triage.js:204-206 | `report()` prints rejected player text raw into the daily-report Markdown (links / HTML comments / headings pass through). Use `esc()` or wrap in backticks |
| K1 | P2 | shared/mm-backup.js KNOWN | `pixeltown-nav-v1`, `-calm-v1`, `-hub-hint-v1` are not in backups (fine for UI-only state; note it so nobody expects them to restore) |

No new network / Firebase / `net.*` call sites were added (grep of the added lines for `net.`, `.ref(`, `firebase`,
`fetch(`, XHR, beacon, WebSocket, `innerHTML`, `eval`: only comments). T1 is a new **path** into existing writes.

## Details

### T1 (P0): Town feedback textarea leaks keys to the game, the DB and public chat

`setupSettingsToggle()` mounts `MMFeedback` into `#settings-section` (main.js:4555-4558) with no key isolation.
Phaser 3.80 listens on `window` and does not skip events whose target is a textarea; the Town only guards the chat input
(`chatFocused`) and the guestbook input (`e.stopPropagation()`, main.js:7208-7211). Removing the key captures
(main.js:1504) lets letters reach the textarea, but every handler still runs:

- `setupEmotes` (1819-1823): any digit 1-8 calls `triggerEmote` -> `this.net.emote()` -> `writeIfAlive` transaction on
  the live player node (net.js:508). Typing "3 bugs" in a note shows an emote to every player.
- `registerChatUI` document `keydown` (8816-8821): Enter, when focus is not the chat input, focuses the chat input
  and `preventDefault`s. Repro (online): Settings -> Suggest or report a bug -> type "the gate", press Enter (expecting a
  new line), keep typing "pointer is stuck", press Enter. The second line goes out as a **public chat message** (live
  DB write, and the note text the box promises "never sent anywhere" is now sent).
- `T` (9018-9021): `startRecording()` when a bestie is set. `getUserMedia` is async, so if `keyup` arrives first
  (always the case on the first-use permission prompt), `stopRecording()` is a no-op and the clip runs for 15 s, then
  `net.sendWalkie` uploads it to the bestie.
- `E` (2453) -> `interact()`: next to the dock sign it leaves the page (the typed note is lost); next to weeds,
  villagers or shops it acts. `G` gifts, `B` toggles build mode, `M`/`L`/`J` open overlays, `P` takes a photo,
  W/A/S/D walk the player (and send `net.move`).

The tests do not catch it: nav-town.test.js:154 uses `page.fill`, which sends no key events.

Minimal fix (same pattern the Realm already uses at mad-maze.js:699): right after the mount in main.js

```js
const fb = window.MMFeedback.mount(section, { page: 'town' });
if (fb && fb.el) ['keydown', 'keyup'].forEach((t) => fb.el.addEventListener(t, (e) => { if (e.key !== 'Escape') e.stopPropagation(); }));
```

For belt and braces, also set `this.chatFocused = true` on `focusin` inside `.mmfb` and `false` on `focusout`, so the
`canAct()` / emote / walkie guards also apply. Add a test that uses `page.keyboard.type('1 t\nx')` in the box and asserts
no emote (`__town` state), chat input not focused, and no `chat-log` line.

### I1 (P1): Isles feedback box cannot be typed into

isles.js:2454-2470 is a `document` keydown handler with no target check. Inside the log panel's feedback textarea:
`KeyW/A/S/D`, the arrows and `Space` call `preventDefault()`, so those characters (and spaces) never appear; `KeyL`
closes the log (the panel that holds the box), `KeyK` swaps to craft, `KeyB` / `KeyM` / `KeyF` / `KeyG` / `KeyR` act.
The Isles page is solo (no DB), so P1, not P0. Fix: the same host-level `stopPropagation` in `mountFeedback` (2106-2108),
or at the top of the handler `if (e.target && e.target.closest && e.target.closest('textarea, input, .mmfb')) return;`.

### N1 (P2): stuck movement key after the sheet

`onKeyUp` (mm-nav.js:329) stops `keyup` while open. Hold W, click "Where to?", release W, close: Phaser still has W down
and the player walks until W is pressed again. Fix: let `keyup` through (only `keydown` needs to be blocked), or in
`setupWhereTo` add `MMNav.onOpen(() => this.input.keyboard.resetKeys())`.

### N2 (P2): sheet vs Realm invite / embed

`openRealmGateMenu` closes the sheet, but `showRealmInvite` (3381), `openRealmEmbed` (3241) and `enterRealm` (3416)
do not. An invite pops above the sheet (z 100000 vs 9100) while keyboard focus is trapped in the sheet, so keyboard users
cannot reach Accept; accepting by tap opens the Realm with the sheet still open underneath. Fix: one line
`if (typeof MMNav !== 'undefined' && MMNav.isOpen()) MMNav.close();` at the top of those three.

### N3 (P2): gamepad behind the sheet

The sheet blocks only DOM keys. The gamepad path (2247 onward) and tilt keep moving the player and can `interact()`
behind the sheet. Fix: add `&& !(typeof MMNav !== 'undefined' && MMNav.isOpen())` to `canAct()` and skip movement input
while it is open.

### F1 (P2): feedback multi-tab staleness

Save re-reads storage first (316), Delete does not (295): `state = remove(state, e.id)` with a stale `state` overwrites a
note another tab saved. Copy/Download export the stale list. Fix: `state = remove(storage ? load(storage) : state, e.id)`,
and `if (storage) state = load(storage);` at the start of the Copy and Download handlers.

### P1x (P2): postcards dialog focus

`openPostcards` shows the overlay but leaves focus on the game; screen readers get no dialog. Fix: focus
`#postcards-close-btn` on open and return focus to `#postcards-hint` (or the body) on close. Esc already works
through `closeTopOverlay`.

### H1, R1, K1 (P2)

See the table; fixes are as written there.

## Checked and fine

- **Join flow (offline and online)**: `setupJoinContinue` runs before the join, inside try/catch, and only sets an `href`
  from `MMNav.urlFor` (registry allow-list). `setupWhereTo` wraps `mount`; a missing `mm-nav.js`, `mm-feedback.js`,
  `mm-perf.js` or `hub/medals.js` only hides that feature (`TOWN_PERF` falls back to `high`, and `MMPerf.profile` always
  returns `caps`). `applyArrivalSpot` reads `URLSearchParams` and `MMNav.last()` inside try. The arrival position
  reaches the DB only through the existing first-frame `net.move` (no new path).
- **XSS / redirects**: every new DOM string goes through `textContent` (nav rows, Continue, postcards, feedback list,
  hub calm card, hub Continue). Stored nav URLs are rebuilt from the registry path plus whitelisted query keys with
  `^[A-Za-z0-9_-]{1,24}$` values. `backTarget` accepts only same-origin referrers that resolve to a registry place.
  `?from=` is only compared, never followed. `safeHref` rejects schemes, `//` and backslashes (and `backHref` comes from
  page code only).
- **Storage**: every new read and write is in try/catch; corrupt JSON gives defaults (nav, gate pointer, feedback,
  calm, hub hint, profile `games`). Size caps: nav 4 KB raw, feedback 20 x 500 chars, calm 8 KB. The feedback box shows
  a message when `setItem` fails. No key collisions: `pixeltown-nav-v1`, `-gate-pointer-v1`, `-feedback-v1`,
  `-calm-v1`, `-hub-hint-v1`, `-profile-v1` each have one writer module; none of them is added to `pixeltown-save-v1`.
  The backup cleaners for the gate pointer and feedback keys keep only known fields.
- **Perf**: the new per-frame work in `update()` is a few `Math.hypot` calls, class toggles only on change, a 200 ms
  throttle on the gate pointer, and a name-label alpha set; the arrival puff is at most 6 one-shot tweens that destroy
  themselves; listeners are added once in `create()` (the Town scene is never restarted). The low tier changes no logic,
  only counts and the start render scale (villagers are tween-driven, so `npcEvery: 3` does not slow them).
- **Name filter**: no new text reaches other players. Feedback notes, postcards, nav sub-labels and calm ideas stay on
  the device (except through T1, which routes typed text into the existing chat send path; the chat filter still applies
  there, but the text should never get there).
- **mm-nav modal**: Esc and Tab are handled in a capture listener, the other Town overlays are closed before the sheet
  opens, `openRealmGateMenu` closes the sheet, and focus returns to "Where to?" on close.
