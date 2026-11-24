# Cycle 1, U (UI/UX)

Branch `cyc1-ui` (from `claude/animal-crossing-game-7z3roh` 86eda4b).

## ID-02 Zone danger meter: shared HUD component spec (for S; U owns the CSS, S owns the logic)

**Mount point.** One element, created once in `realm-world.js` right after `zoneEl` (the `#rw-zone` line) and appended INSIDE it,
after `.rw-zsub` and before the `.rw-event` line (`zoneEl.insertBefore(dangerEl, evEl)`, or append it before `evEl` is created).
Living inside `#rw-zone` means no new HUD row: on phones (<= 560 px) it joins the single 11 px flex line, on desktop it is a
right-aligned row under the zone name. `zonePlace()` / `goalPlace()` already move the whole zone line, so it never needs its own placement.

**Markup (textContent only, no innerHTML from data):**
```html
<span id="rw-danger" class="rw-danger" data-level="comfortable" aria-label="Danger: comfortable">
  <span class="rw-danger-bar" aria-hidden="true"><span class="rw-danger-fill" style="--rw-danger: 0.25"></span></span>
  <span class="rw-danger-txt">Comfortable</span>
</span>
```

| class / attribute | meaning |
|---|---|
| `#rw-danger.rw-danger` | the component root (flex row, right-aligned on desktop; inline in the phone zone line) |
| `data-level="comfortable" \| "tough" \| "hot"` | the label bucket; drives the colour. Colour is NEVER the only cue: the text label always shows |
| `.rw-danger-bar` > `.rw-danger-fill` | a 36 x 4 px track (28 px on phones); fill width = `--rw-danger` (0..1) set by S as an inline custom property |
| `.rw-danger-txt` | the word: `Comfortable`, `Tough`, `Too hot` (S may reuse these exact strings for tests) |
| `.rw-danger.hidden` | hidden (Nexus, dungeons, `?danger=0`, boss fight: same hide rules as the goal line) |

**Update rule (S).** Recompute in the existing once-a-second `goalTick` (no per-frame layout, no per-frame DOM writes); write
`data-level`, `aria-label`, `--rw-danger` and the text only when they change. The parent `#rw-zone` is already `aria-live="polite"`,
so the root gets no extra live role and the text changes only when the bucket changes (no announcement spam).

**Label function (S, pure, node-testable).** Suggested: `ratio = difficultyAt(tile) / recLvScale(heroLevel)`;
`< 1.1` comfortable, `< 1.6` tough, else hot; `--rw-danger = clamp(ratio / 2, 0, 1)`. Exact thresholds are S/D's call.

**Colours (8-bit palette, readable on the HUD's shadowed text):** comfortable `#7be08a`, tough `#ffd45a`, hot `#ff6a6a`.
The CSS is already in `games/mad-maze/mad-maze.css` (search `rw-danger`), committed by U this cycle; S does not need to add CSS.

**Phone budget (b08-12 / U-05).** The meter adds no row on phones: the 11 px zone line already ellipsises; `.rw-danger` has `flex: none`
and `order: 3`, and the event text (`min-width: 0`) is what truncates first.
