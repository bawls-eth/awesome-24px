# Cycle 10, L review of S (branch `cyc10-systems`, commit 6a6b4cc: ID-53 just-in-time hint, ID-55 first-session ending card)

Read-only code review of the diff. **I did not run S's two tests or the page**; every point below comes from reading the code.
The commit appeared on the branch while my own items were in progress, so this is a short review, not a play check.

## Verdict
Approve to merge after point 1 is answered (fix or a recorded decision). Points 2 to 5 are small and can follow.

## 1. Send back: the desktop "Menu" hint tells the player to press a key that the hint itself swallows (P2)
- `jhPick()` (realm-world.js) shows on desktop: "Press Esc to open the Menu: quests and bag".
- `onHintKey` is a capture-phase `keydown` listener that, while a hint is on, calls `preventDefault()` and
  `stopImmediatePropagation()` on Escape and only hides the hint.
- So the player follows the hint, presses Esc, the hint vanishes and **no Menu opens**. S's own test asserts exactly this
  ("a real Esc closes the hint and does NOT open the Menu"), which is right for the other two verbs and wrong for this one.
- Suggested fix: when `jh.verb === 'menu'`, hide the hint and let the key through (no `stopImmediatePropagation`), and add a
  check: with the Menu hint up, one Esc opens the Menu. Or name another control in the text.

## 2. `feShow()` marks the card as seen before it knows the card was built
`sv.firstEndSeen = 1; arena.onSave(sv)` runs before `K.panel(...)`; if `K.panel` returns nothing the function returns, and the
player never sees the card, in this visit or any later one. Move the save after `if (!feCard) return;` (keep `feDone = true`
first, as now).

## 3. `sessionStorage` is written once a second for the whole first session
`feTick` calls `feStore()` every second while `fe.ok === 1` (up to 8 minutes). It is a small synchronous write; writing every
5 s, and on `pagehide`, would do the same job. Not a blocker.

## 4. Layout reads once a second
`jhBlock()` runs up to four `getComputedStyle` + `getClientRects` calls a second while playing (hint line, banner, coach,
coach toast). This is cheap next to a frame, but it forces style work in the world tick; reading the elements' own
`hidden` / class state first and only then the computed style would avoid most of it. Not measured by me.

## 5. Save and merge (checked, fine)
- `realm.firstEndSeen` is additive, written only as `1`, kept by `rmCleanSave`, and merged as a union in `rmMergeSave`. An
  old build ignores it. `SAVE-KEYS.md` is updated.
- The `realm.js` hunks (lines 408 and 504) do not touch the constructor block I changed in `cyc10-lead`; I expect a clean merge
  (not tried).
- `jhBlock()` reads `feOpen`, declared with `let` further down in the same block. It is only called from the tick, after
  the block has run, so there is no use-before-declaration at run time.

## Not checked
Phone layout of the hint and the card, the 195x422 size, focus order on the card, the Back button path, and whether the hint
can cover the new "Resting" chip. U should look at those.
