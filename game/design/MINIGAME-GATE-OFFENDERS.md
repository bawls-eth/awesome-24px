# Mini game quality gate (QS2): offenders

Gate: `game/tests/minigame-quality-gate.test.js` (smoke tier). Allow-list: `game/tests/fixtures/minigame-gate-allow.json`.
The allow-list may only shrink. When you fix one of the items below, delete its line from the allow-list (the gate prints a NOTE
for entries it no longer needs).

Checked on every mini game page at 390x844 touch and 1280x720 desktop: first frame < 3 s (load-scaled), 0 console errors,
0 DB requests, no horizontal scroll, Menu button on screen and not overlapping a control, phone buttons/links >= 44 px tall,
text >= 12 px, reduced motion + low graphics read (no per-frame canvas growth while idle), Tab reaches the primary control,
Tab never stops on an invisible (<= 2 px) control.

## First run (before fixes)

| page | first frame (phone) | finding | status |
|---|---|---|---|
| jam | 72 ms | Tab stops on the 1 px legacy `#back-hub`, `#back-town` (invisible focus) | fixed: `tabindex=-1` while MMNav is on |
| deepdelve | 52 ms | same, `#back-hub`, `#back-town` | fixed |
| lantern | 64 ms | same, `#back-hub`, `#back-town` | fixed |
| angler | 60 ms | same, `#back-hub`, `#back-town` | OPEN (allow-listed; owned by the variety agent) |
| stalk | 44 ms | same, `#back` | OPEN (allow-listed; owned by the variety agent) |
| bugs | 32 ms | same, both `a.back` links (no ids) | OPEN (allow-listed; owned by the variety agent) |
| pop | 52 ms | none | - |
| dash | 48 ms | none | - |

Every other check passed on every page on the first run (targets, text size, scroll, Menu overlap, errors, DB, prefs).

## Suggested fix for angler / stalk / bugs

In each page's `MMNav.mount(...)` inline script, right after the mount call (same as jam/deepdelve/lantern now do):

```js
if (document.body.classList.contains('mm-nav-on')) ['back-hub', 'back-town'].forEach(function (id) { var e = document.getElementById(id); if (e) e.setAttribute('tabindex', '-1'); });
```

(stalk: `['back']`; bugs: `document.querySelectorAll('a.back')`). Then remove the matching `*:focus:*` lines from the allow-list.
A shared fix in `mm-nav.js` (tag legacy links with `tabindex=-1`) would cover every page at once; that file belongs to the nav agent.
