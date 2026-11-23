# Town (Hearthvale) bug bash

Played offline only (blockDb + Firebase SDK stub + "Play offline", ADMIN* names, never chatted) at 390x844 touch, 844x390
landscape touch, 1280x720 desktop; keyboard-only join; hostile saves; 150% text (hudScale 1.5); reduced motion; rapid A taps;
rotate. New test: `game/tests/town-bugbash.test.js` (browser, smoke). Screenshots: `img/town-pond-before.png`,
`img/town-pond-after.png`, `img/town-landscape-hostile-save.png`.

## Fixed (branch bb-town)
1. **Pond hero statues stood in the pond** (they replaced the walking pond cats at the cats' water positions). Now on the north-west bank, depth-sorted by their feet (`POND_CATS[].bank`); `?legacyart=1` keeps the old walking cats.
2. **Graveyard tombstones were invisible**: the plot floor was drawn at depth y-2, above the stones (y-6..-14). The plot is now ground.
3. **Hero art download ~650 KB -> 61 KB**: the 10 heroes come from ONE pre-baked atlas (`assets/arcane/town-heroes-atlas.png`, `tools/bake-hero-atlas.js`, the same `downsample()` + 256-colour palette). If the atlas fails to load, the 60 strips are fetched and baked as before (tested with a 404).
4. **Wildlife 8-bit look**: all 98 flora/fauna are baked once at load by `shared/mm-pixelize.js` (`ffpx_<id>`, half size drawn at 2x, ~140 ms total); `?pixelize=0` keeps the SVGs.
5. **Old-species text**: Professor Byte / Salty Mo lines about "pond cats" and the "Bored Ape statue", villagers' "paws" / "fur", and the merchant's "bought Golden Punks!" toast (now "bought the Druid look!") are gone.
6. **First minute, one line of guidance**: while the Realm Gate chip guides a new player, ambient chat announcements (Bug-Off live, rain) wait 60 s or until the gate is reached/dismissed; replies to the player are never held. The gate chip also steps aside while the What's-new banner or the achievement toast covers its spot (they overlapped).
7. **Empty 156 px frame over the middle of the phone screen**: the 8-bit pass gave the transparent `#chat-panel` stack a border + shadow. Removed (children keep their borders).
8. **Walkie pill**: no bestie -> one readable line "Hold to talk" (was a 2-line half-transparent hint, 2.45:1 / 2.11:1 contrast); 44 px target kept.
9. **Hostile save** `bestieName: {object}` showed "to [object Object]"; bestie id/name are type-checked now.
10. **"Able Sisters" label sat under the player's name at spawn** (R3 #15): moved under the shop.
11. **Professor Byte's speech bubble covered his quest sign**: bubble raised.
12. **Net safety (main.js side of netsafety.md)**: at most 60 remote avatars drawn (freed slots refill), player list rebuilt at most every 250 ms, blocks drawn capped at 1500, Realm invites only from players in town / 1 per sender per 10 s / never over a showing one, walkie memos typed + size-capped + bestie-only, `?legacyart=1` resolves only real species keys.
13. **A11y**: `role=main` + one hidden `<h1>` + canvas `aria-label`; landscape counters 12 px; `mm-reduce-motion` honoured (`data-reduce-motion` on `<html>`); 150% text moves the gate chip below the zoomed Menu and scales chat / quick chat / chip text. 24 of 27 town a11y offenders gone (allow-list pruned).
14. **Shared Settings**: "⚙️ Settings" in More opens `MMSettings`; sound, music, reduced motion and text size reach the Town live; the Town does not act behind it.
16. **Front door**: a plain visit to `game/index.html` (no query, no same-origin referrer, top window, not webdriver) now opens the Hub Home with `location.replace`; any query (`?from=hub`, `?town=1`, ...), in-game links and iframes stay. The Town's "World map" link opens `hub/index.html?map=1`. Test: `town-front-door.test.js`.
17. **Realm invite guard** applies to network invites only (`acceptNetInvite`), so local/test invites still open.
15. **town-perf.test.js joined the LIVE town** (HTTP-only block): now blockDb + SDK stub + Play offline, class browser.

## Open
- **Night is never drawn** (P2): `NIGHT_WASH_VISIBLE = false` (main.js ~423) keeps the night wash off by design since the perf pass; at 23:00 `nightAlpha` is 0.45 but the town looks like noon. Owner decision whether to turn it on (one full-screen layer, already budgeted).
- **200% browser zoom** (P3): at an effective 195 px width the quick-chat row still overlaps the Menu (a11y allow-list keeps `text-200` entries). The gate chip hides below 300 px width.
- **150% text measured as x1.00** (P3, test limitation): the HUD panels scale with CSS `zoom`, which `getComputedStyle().fontSize` does not report; visually they are 1.5x.
- **Headless-only white box** (P3, not reproduced on the WebGL framebuffer): with the What's-new banner open on a phone, Playwright screenshots showed a white rectangle over the canvas south of Able Sisters that vanished once the banner closed; `snapshotPixel` read grass there. Likely a compositor artefact of the headless GPU; recheck on a real phone.
- "Day N streak" wording left alone (owner decision TN3).

## Elsewhere
- net.js (not touched): scavenger / tournament claims write the raw name; `sanitizePlayer` passes unknown fields through; `sendWalkie` has no size/rate guard (see netsafety.md P1-2, P2-5).
- live tests `weeds`, `fishlog`, `mailbox`, `cave-terrain`, `phone-overlays`, `integration` still join the live town (presence only); they could move to the offline stub like town-perf.
